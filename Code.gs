/**
 * Drug Price App - Google Apps Script API
 *
 * ฟังก์ชันหลัก:
 * 1. setup() - จัดการเตรียม Header, สูตรคำนวณ และ row_id
 * 2. doGet(e) - สำหรับอ่านข้อมูล (ping, list)
 * 3. doPost(e) - สำหรับบันทึกข้อมูล (save, add, delete, batch_import)
 */

const CONFIG = {
  SHEET_NAME: 'DataBase',
  PRICING_SETTINGS_SHEET: 'Pricing_Settings',
  PRICING_PROPOSALS_SHEET: 'Pricing_Proposals',
  PRICING_HISTORY_SHEET: 'Pricing_History',
  HEADER_ROW: 1,
  DATA_START_ROW: 2,
  APP_TOKEN: '', // หากตั้งใน config.js ให้ใส่ค่าเดียวกันตรงนี้
  APPROVER_PIN_PROPERTY: 'PRICING_APPROVER_PIN'
};

/**
 * 1. ฟังก์ชัน Setup ตาราง Google Sheet
 * ตรวจสอบและสร้างคอลัมน์ระบบที่จำเป็นหากยังไม่มี
 */
function setup() {
  const sheet = getSheet_();
  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();

  if (lastCol === 0) {
    throw new Error('ชีตยังว่างอยู่ กรุณาสร้าง Header Row ในชีต DataBase ก่อน');
  }

  const headers = sheet.getRange(CONFIG.HEADER_ROW, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());

  // รายการคอลัมน์ระบบที่ต้องมี
  const requiredCols = [
    'row_id',
    'created_at',
    'updated_at',
    'last_edited_by',
    'ราคาสกย.OPD Discount 20%',
    'ราคา สกย.IPD Discount 20%',
    'OPD สกย. after discount -Cost',
    'ราคา IPD สกย After dis count - Cost',
    'gross_margin_opd',
    'gross_margin_ipd',
    'gross_margin_สกย_opd',
    'gross_margin_สกย_ipd',
    'gross_margin_ipd_foreigner',
    'gross_margin_opd_foreigner',
    'government_opd_price',
    'gross_margin_gov',
    'gross_margin_nhso'
  ];

  let currentHeaders = [...headers];
  requiredCols.forEach(col => {
    if (!currentHeaders.includes(col)) {
      sheet.getRange(CONFIG.HEADER_ROW, currentHeaders.length + 1).setValue(col);
      currentHeaders.push(col);
    }
  });

  // เติม row_id ให้แถวที่มีข้อมูลแต่ยังไม่มี row_id
  const rowIdIdx = currentHeaders.indexOf('row_id');
  if (rowIdIdx !== -1 && lastRow >= CONFIG.DATA_START_ROW) {
    const rowCount = lastRow - CONFIG.DATA_START_ROW + 1;
    const rowIdRange = sheet.getRange(CONFIG.DATA_START_ROW, rowIdIdx + 1, rowCount, 1);
    const rowIdVals = rowIdRange.getValues();
    let updated = false;

    for (let i = 0; i < rowIdVals.length; i++) {
      if (!rowIdVals[i][0]) {
        rowIdVals[i][0] = Utilities.getUuid();
        updated = true;
      }
    }

    if (updated) {
      rowIdRange.setValues(rowIdVals);
    }
  }

  setupPricingWorkflowSheets_();

  Logger.log('Setup เสร็จสมบูรณ์! Headers ทั้งหมด: ' + currentHeaders.length);
}

/**
 * 2. HTTP GET Request
 */
function doGet(e) {
  try {
    const params = e ? e.parameter : {};
    const action = params.action || 'list';
    const callback = params.callback;

    verifyToken_(params.token);

    let result;
    if (action === 'ping') {
      result = {
        ok: true,
        now: new Date().toISOString(),
        version: '3.0.0-pricing-workflow',
        pricingWorkflowReady: pricingWorkflowReady_()
      };
    } else if (action === 'list') {
      result = listRows_();
    } else if (action === 'pricing_settings') {
      result = getPricingSettings_();
    } else if (action === 'pricing_proposals') {
      result = listPricingProposals_(params);
    } else if (action === 'pricing_history') {
      result = listPricingHistory_(params);
    } else {
      throw new Error('Unknown GET action: ' + action);
    }

    return createOutput_(result, callback);
  } catch (err) {
    const errResult = { ok: false, error: err.toString(), stack: err.stack };
    return createOutput_(errResult, e ? e.parameter.callback : null);
  }
}

/**
 * 3. HTTP POST Request
 */
function doPost(e) {
  try {
    let body = {};
    if (e && e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
      } catch (ex) {
        body = {};
      }
    }

    const action = (e && e.parameter && e.parameter.action) || body.action || '';
    const token = (e && e.parameter && e.parameter.token) || body.token || '';
    const payload = body.payload || body;

    verifyToken_(token);

    let result;
    if (action === 'save') {
      result = saveRow_(payload);
    } else if (action === 'add') {
      result = addRow_(payload);
    } else if (action === 'delete') {
      result = deleteRow_(payload);
    } else if (action === 'batch_import') {
      result = batchImportRows_(payload);
    } else if (action === 'save_pricing_settings') {
      result = savePricingSettings_(payload);
    } else if (action === 'submit_pricing_proposal') {
      result = submitPricingProposal_(payload);
    } else if (action === 'approve_pricing_proposal') {
      result = approvePricingProposal_(payload);
    } else if (action === 'reject_pricing_proposal') {
      result = rejectPricingProposal_(payload);
    } else if (action === 'cancel_pricing_proposal') {
      result = cancelPricingProposal_(payload);
    } else {
      throw new Error('Unknown POST action: ' + action);
    }

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    const errResult = { ok: false, error: err.toString(), stack: err.stack };
    return ContentService.createTextOutput(JSON.stringify(errResult)).setMimeType(ContentService.MimeType.JSON);
  }
}

// -------------------------------------------------------------
// Core Operations
// -------------------------------------------------------------

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.getSheets()[0];
  }
  return sheet;
}

function verifyToken_(token) {
  if (!CONFIG.APP_TOKEN) return true;
  if (token !== CONFIG.APP_TOKEN) {
    throw new Error('Unauthorized: Invalid APP_TOKEN');
  }
  return true;
}

function createOutput_(data, callback) {
  const json = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function listRows_() {
  const sheet = getSheet_();
  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();

  if (lastCol === 0 || lastRow < CONFIG.DATA_START_ROW) {
    return { ok: true, headers: [], rows: [], rowCount: 0, serverTime: new Date().toISOString() };
  }

  const headers = sheet.getRange(CONFIG.HEADER_ROW, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const dataRange = sheet.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, lastCol);
  const rawValues = dataRange.getValues();

  const rows = [];
  for (let r = 0; r < rawValues.length; r++) {
    const rowObj = { _sheetRowNumber: CONFIG.DATA_START_ROW + r };
    let hasData = false;

    for (let c = 0; c < headers.length; c++) {
      const header = headers[c];
      if (!header) continue;
      const val = rawValues[r][c];
      if (val !== '' && val !== null && val !== undefined) {
        hasData = true;
      }
      rowObj[header] = (val instanceof Date) ? val.toISOString() : String(val ?? '');
    }

    if (hasData) {
      rows.push(rowObj);
    }
  }

  return {
    ok: true,
    headers: headers.filter(Boolean),
    rows: rows,
    rowCount: rows.length,
    serverTime: new Date().toISOString()
  };
}

function saveRow_(row) {
  const rowId = row.row_id || (row.payload && row.payload.row_id);
  if (!rowId) throw new Error('Missing row_id');

  const sheet = getSheet_();
  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  const headers = sheet.getRange(CONFIG.HEADER_ROW, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const rowIdCol = headers.indexOf('row_id');

  if (rowIdCol === -1) throw new Error('Column row_id not found');

  const rowIds = sheet.getRange(CONFIG.DATA_START_ROW, rowIdCol + 1, lastRow - CONFIG.DATA_START_ROW + 1, 1).getValues();
  let targetRow = -1;

  for (let i = 0; i < rowIds.length; i++) {
    if (String(rowIds[i][0]).trim() === String(rowId).trim()) {
      targetRow = CONFIG.DATA_START_ROW + i;
      break;
    }
  }

  if (targetRow === -1) throw new Error('Row not found for row_id: ' + rowId);

  const existingVals = sheet.getRange(targetRow, 1, 1, lastCol).getValues()[0];
  const newVals = [...existingVals];

  headers.forEach((header, colIdx) => {
    if (!header || header === 'row_id' || header === 'created_at') return;
    if (header === 'updated_at') {
      newVals[colIdx] = new Date().toISOString();
      return;
    }
    // Existing price/tariff fields must change only through Pricing Approval Workflow.
    if (isProtectedPricingColumn_(header)) return;
    if (Object.prototype.hasOwnProperty.call(row, header)) {
      newVals[colIdx] = row[header];
    }
  });

  sheet.getRange(targetRow, 1, 1, lastCol).setValues([newVals]);
  return { ok: true, action: 'save', row_id: rowId, rowNumber: targetRow };
}

function addRow_(row) {
  const sheet = getSheet_();
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(CONFIG.HEADER_ROW, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());

  const newRowId = row.row_id || Utilities.getUuid();
  const now = new Date().toISOString();
  const rowData = [];

  headers.forEach(header => {
    if (!header) {
      rowData.push('');
      return;
    }
    if (header === 'row_id') {
      rowData.push(newRowId);
    } else if (header === 'created_at' || header === 'updated_at') {
      rowData.push(now);
    } else if (Object.prototype.hasOwnProperty.call(row, header)) {
      rowData.push(row[header]);
    } else {
      rowData.push('');
    }
  });

  sheet.appendRow(rowData);
  return { ok: true, action: 'add', row_id: newRowId, rowNumber: sheet.getLastRow() };
}

function deleteRow_(payload) {
  const rowId = payload.row_id || (payload.payload && payload.payload.row_id);
  if (!rowId) throw new Error('Missing row_id');

  const sheet = getSheet_();
  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  const headers = sheet.getRange(CONFIG.HEADER_ROW, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const rowIdCol = headers.indexOf('row_id');

  if (rowIdCol === -1) throw new Error('Column row_id not found');

  const rowIds = sheet.getRange(CONFIG.DATA_START_ROW, rowIdCol + 1, lastRow - CONFIG.DATA_START_ROW + 1, 1).getValues();
  let targetRow = -1;

  for (let i = 0; i < rowIds.length; i++) {
    if (String(rowIds[i][0]).trim() === String(rowId).trim()) {
      targetRow = CONFIG.DATA_START_ROW + i;
      break;
    }
  }

  if (targetRow === -1) throw new Error('Row not found for row_id: ' + rowId);

  sheet.deleteRow(targetRow);
  return { ok: true, action: 'delete', row_id: rowId };
}

/**
 * 4. High Performance Batch Import Function
 * รองรับการนำเข้าข้อมูลหลายสิบ/หลายร้อยแถวในครั้งเดียว
 * payload: { items: Array<Object>, mode: 'upsert' | 'add' | 'update' }
 */
function batchImportRows_(payload) {
  const items = Array.isArray(payload) ? payload : (payload.items || []);
  const mode = payload.mode || 'upsert'; // 'upsert', 'add', 'update'

  if (!items.length) {
    return { ok: true, action: 'batch_import', added: 0, updated: 0, total: 0 };
  }

  const sheet = getSheet_();
  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  const headers = sheet.getRange(CONFIG.HEADER_ROW, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());

  const rowIdCol = headers.indexOf('row_id');
  const itemCodeCol = headers.indexOf('item_code');
  const updatedAtCol = headers.indexOf('updated_at');
  const createdAtCol = headers.indexOf('created_at');

  if (rowIdCol === -1 || itemCodeCol === -1) {
    throw new Error('Required system columns row_id or item_code not found in sheet');
  }

  // อ่านข้อมูลทั้งหมดของ Sheet ขึ้นมาในหน่วยความจำ
  const existingCount = lastRow >= CONFIG.DATA_START_ROW ? (lastRow - CONFIG.DATA_START_ROW + 1) : 0;
  let allData = [];
  if (existingCount > 0) {
    allData = sheet.getRange(CONFIG.DATA_START_ROW, 1, existingCount, lastCol).getValues();
  }

  // สร้าง Index Map สำหรับค้นหาแบบ O(1)
  const rowIdMap = new Map();
  const itemCodeMap = new Map();

  for (let r = 0; r < allData.length; r++) {
    const rId = String(allData[r][rowIdCol] || '').trim();
    const iCode = String(allData[r][itemCodeCol] || '').trim();
    if (rId) rowIdMap.set(rId, r);
    if (iCode) itemCodeMap.set(iCode.toLowerCase(), r);
  }

  let addedCount = 0;
  let updatedCount = 0;
  const now = new Date().toISOString();
  const rowsToAppend = [];

  items.forEach(item => {
    const itemCode = String(item.item_code || '').trim();
    const rowId = String(item.row_id || '').trim();

    // หาว่ามีรายการเดิมหรือไม่
    let targetIdx = -1;
    if (rowId && rowIdMap.has(rowId)) {
      targetIdx = rowIdMap.get(rowId);
    } else if (itemCode && itemCodeMap.has(itemCode.toLowerCase())) {
      targetIdx = itemCodeMap.get(itemCode.toLowerCase());
    }

    if (targetIdx !== -1 && (mode === 'upsert' || mode === 'update')) {
      // อัปเดตแถวเดิมใน allData
      headers.forEach((header, cIdx) => {
        if (!header || cIdx === rowIdCol || cIdx === createdAtCol) return;
        if (cIdx === updatedAtCol) {
          allData[targetIdx][cIdx] = now;
        } else if (isProtectedPricingColumn_(header)) {
          return;
        } else if (Object.prototype.hasOwnProperty.call(item, header)) {
          allData[targetIdx][cIdx] = item[header];
        }
      });
      updatedCount++;
    } else if (targetIdx === -1 && (mode === 'upsert' || mode === 'add')) {
      // เพิ่มรายการใหม่
      const newRow = new Array(lastCol).fill('');
      const newUuid = rowId || Utilities.getUuid();

      headers.forEach((header, cIdx) => {
        if (!header) return;
        if (cIdx === rowIdCol) {
          newRow[cIdx] = newUuid;
        } else if (cIdx === createdAtCol || cIdx === updatedAtCol) {
          newRow[cIdx] = now;
        } else if (Object.prototype.hasOwnProperty.call(item, header)) {
          newRow[cIdx] = item[header];
        }
      });

      rowsToAppend.push(newRow);
      // เพิ่มเข้า map เพื่อป้องกัน duplicate ภายใน batch เดียวกัน
      const newIdx = allData.length + rowsToAppend.length - 1;
      rowIdMap.set(newUuid, newIdx);
      if (itemCode) itemCodeMap.set(itemCode.toLowerCase(), newIdx);
      addedCount++;
    }
  });

  // บันทึกแถวเดิมที่มีการแก้ไข
  if (updatedCount > 0 && allData.length > 0) {
    sheet.getRange(CONFIG.DATA_START_ROW, 1, allData.length, lastCol).setValues(allData);
  }

  // บันทึกแถวใหม่ทั้งหมดในครั้งเดียว
  if (rowsToAppend.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, lastCol).setValues(rowsToAppend);
  }

  return {
    ok: true,
    action: 'batch_import',
    added: addedCount,
    updated: updatedCount,
    total: items.length
  };
}


// -------------------------------------------------------------
// Pricing Workflow v3
// Central policy + proposal approval + audit history
// -------------------------------------------------------------

function withPricingLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function savePricingSettings_(payload) {
  return withPricingLock_(function () { return savePricingSettingsUnlocked_(payload); });
}

function submitPricingProposal_(payload) {
  return withPricingLock_(function () { return submitPricingProposalUnlocked_(payload); });
}

function approvePricingProposal_(payload) {
  return withPricingLock_(function () { return approvePricingProposalUnlocked_(payload); });
}

function rejectPricingProposal_(payload) {
  return withPricingLock_(function () { return rejectPricingProposalUnlocked_(payload); });
}

function cancelPricingProposal_(payload) {
  return withPricingLock_(function () { return cancelPricingProposalUnlocked_(payload); });
}

function setupPricingWorkflowSheets_() {
  const settingsHeaders = ['settings_id', 'settings_json', 'updated_at', 'updated_by'];
  const proposalHeaders = [
    'proposal_id', 'row_id', 'item_code', 'drug_name', 'cost',
    'current_opd', 'proposed_opd',
    'current_ipd', 'proposed_ipd',
    'current_opd_foreign', 'proposed_opd_foreign',
    'current_ipd_foreign', 'proposed_ipd_foreign',
    'current_gov', 'proposed_gov',
    'current_nhso', 'proposed_nhso',
    'historical_gm', 'target_gm', 'actual_gm', 'markup',
    'pricing_mode', 'pricing_reason', 'old_anchor', 'notes',
    'status', 'submitted_by', 'submitted_at',
    'reviewed_by', 'reviewed_at', 'review_note',
    'policy_snapshot_json'
  ];
  const historyHeaders = [
    'history_id', 'proposal_id', 'row_id', 'item_code', 'drug_name',
    'action', 'status', 'actor', 'action_at', 'note',
    'before_json', 'after_json', 'proposal_json', 'policy_snapshot_json'
  ];

  ensureSheetWithHeaders_(CONFIG.PRICING_SETTINGS_SHEET, settingsHeaders);
  ensureSheetWithHeaders_(CONFIG.PRICING_PROPOSALS_SHEET, proposalHeaders);
  ensureSheetWithHeaders_(CONFIG.PRICING_HISTORY_SHEET, historyHeaders);

  const settingsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.PRICING_SETTINGS_SHEET);
  if (settingsSheet.getLastRow() < 2) {
    const defaultSettings = {
      roundingStep: 1,
      roundingMode: 'CEIL',
      applyGovFloor: true,
      applyNhsoFloor: true,
      formulas: {
        ipd: 'OPD*1.20',
        rubOpd: 'OPD',
        rubIpd: 'IPD',
        foreignOpd: 'OPD*1.30',
        foreignIpd: 'IPD*1.30',
        govPreFloor: 'IPD*0.70',
        nhsoPreFloor: 'IPD*0.60'
      },
      anchors: [
        {cost:5,gm:86},{cost:10,gm:83},{cost:25,gm:78},{cost:50,gm:74},
        {cost:75,gm:71},{cost:100,gm:69},{cost:200,gm:63},{cost:500,gm:56},
        {cost:1000,gm:50},{cost:2000,gm:44},{cost:5000,gm:36},
        {cost:10000,gm:31},{cost:20000,gm:26}
      ]
    };
    settingsSheet.appendRow(['DEFAULT', JSON.stringify(defaultSettings), new Date().toISOString(), 'setup']);
  }
}

function pricingWorkflowReady_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return !!(
    ss.getSheetByName(CONFIG.PRICING_SETTINGS_SHEET) &&
    ss.getSheetByName(CONFIG.PRICING_PROPOSALS_SHEET) &&
    ss.getSheetByName(CONFIG.PRICING_HISTORY_SHEET)
  );
}

function ensureSheetWithHeaders_(sheetName, requiredHeaders) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  let headers = [];
  if (sheet.getLastColumn() > 0) {
    headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(h => String(h || '').trim());
  }

  requiredHeaders.forEach(header => {
    if (!headers.includes(header)) {
      sheet.getRange(1, headers.length + 1).setValue(header);
      headers.push(header);
    }
  });
  if (sheet.getFrozenRows() < 1) sheet.setFrozenRows(1);
  return sheet;
}

function getPricingSettings_() {
  setupPricingWorkflowSheets_();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.PRICING_SETTINGS_SHEET);
  const headers = getHeaders_(sheet);
  const rows = sheet.getLastRow() >= 2
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues()
    : [];

  let selected = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const obj = rowToObject_(headers, rows[i]);
    if (String(obj.settings_id || '') === 'DEFAULT') {
      selected = obj;
      break;
    }
  }
  if (!selected) throw new Error('Pricing settings not initialized. Run setup().');

  let settings;
  try {
    settings = JSON.parse(String(selected.settings_json || '{}'));
  } catch (err) {
    throw new Error('Invalid central pricing settings JSON');
  }

  return {
    ok: true,
    settings: settings,
    updated_at: selected.updated_at || '',
    updated_by: selected.updated_by || ''
  };
}

function savePricingSettingsUnlocked_(payload) {
  setupPricingWorkflowSheets_();
  const operator = requireOperator_(payload.updated_by || payload.operator);
  verifyApproverPin_(payload.approver_pin || payload.pin);
  const settings = payload.settings || payload.pricing_settings;
  if (!settings || typeof settings !== 'object') throw new Error('Missing pricing settings');
  validatePricingSettingsPayload_(settings);

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.PRICING_SETTINGS_SHEET);
  const headers = getHeaders_(sheet);
  const settingsIdIdx = headers.indexOf('settings_id');
  let rowNumber = -1;

  if (sheet.getLastRow() >= 2) {
    const ids = sheet.getRange(2, settingsIdIdx + 1, sheet.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0] || '') === 'DEFAULT') {
        rowNumber = i + 2;
        break;
      }
    }
  }

  if (rowNumber > 0 && payload.expected_updated_at) {
    const currentValues = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
    const currentObj = rowToObject_(headers, currentValues);
    const currentUpdatedAt = String(currentObj.updated_at || '');
    if (currentUpdatedAt && currentUpdatedAt !== String(payload.expected_updated_at)) {
      throw new Error('STALE_POLICY: Central Pricing Policy ถูกแก้ไขโดยผู้ใช้อื่น กรุณา Refresh ก่อนบันทึกใหม่');
    }
  }

  const now = new Date().toISOString();
  const rowObj = {
    settings_id: 'DEFAULT',
    settings_json: JSON.stringify(settings),
    updated_at: now,
    updated_by: operator
  };
  const row = headers.map(h => rowObj[h] !== undefined ? rowObj[h] : '');

  if (rowNumber > 0) sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
  else sheet.appendRow(row);

  appendPricingHistory_({
    proposal_id: '',
    row_id: '',
    item_code: '',
    drug_name: 'Pricing Policy',
    action: 'SETTINGS_UPDATED',
    status: 'ACTIVE',
    actor: operator,
    note: payload.note || '',
    before_json: payload.previous_settings ? JSON.stringify(payload.previous_settings) : '',
    after_json: JSON.stringify(settings),
    proposal_json: '',
    policy_snapshot_json: JSON.stringify(settings)
  });

  return { ok: true, action: 'save_pricing_settings', updated_at: now, updated_by: operator, settings: settings };
}

function validatePricingSettingsPayload_(settings) {
  if (!settings.formulas || typeof settings.formulas !== 'object') throw new Error('Missing pricing formulas');
  const requiredFormulaKeys = ['ipd', 'rubOpd', 'rubIpd', 'foreignOpd', 'foreignIpd', 'govPreFloor', 'nhsoPreFloor'];
  requiredFormulaKeys.forEach(k => {
    if (!String(settings.formulas[k] || '').trim()) throw new Error('Missing formula: ' + k);
  });
  if (!(Number(settings.roundingStep) > 0)) throw new Error('roundingStep must be > 0');
  if (!Array.isArray(settings.anchors) || settings.anchors.length < 2) throw new Error('At least 2 GM anchors are required');
}

function submitPricingProposalUnlocked_(payload) {
  setupPricingWorkflowSheets_();
  const operator = requireOperator_(payload.submitted_by || payload.operator);
  const proposal = payload.proposal || payload;
  const itemCode = String(proposal.item_code || '').trim();
  const rowId = String(proposal.row_id || '').trim();
  if (!itemCode && !rowId) throw new Error('Proposal requires item_code or row_id');

  const current = findDatabaseRow_(rowId, itemCode);
  if (!current) throw new Error('Drug row not found in DataBase');

  const pending = findPendingProposal_(rowId, itemCode);
  if (pending) throw new Error('มีข้อเสนอราคาที่ยัง Pending อยู่แล้ว: ' + pending.proposal_id);

  const proposalId = Utilities.getUuid();
  const now = new Date().toISOString();
  const policySnapshot = proposal.policy_snapshot_json || JSON.stringify((getPricingSettings_()).settings);

  const rowObj = {
    proposal_id: proposalId,
    row_id: current.row.row_id || rowId,
    item_code: current.row.item_code || itemCode,
    drug_name: proposal.drug_name || current.row.FullName || current.row.GenercName || '',
    cost: proposal.cost !== undefined ? proposal.cost : current.row['ราคาต้นทุน'],
    current_opd: current.row['ราคา OPD'] || '',
    proposed_opd: requireNumber_(proposal.proposed_opd, 'proposed_opd'),
    current_ipd: current.row['ราคา IPD'] || '',
    proposed_ipd: requireNumber_(proposal.proposed_ipd, 'proposed_ipd'),
    current_opd_foreign: current.row['ราคา OPD_Foreigner'] || '',
    proposed_opd_foreign: requireNumber_(proposal.proposed_opd_foreign, 'proposed_opd_foreign'),
    current_ipd_foreign: current.row['ราคา IPD_Foreigner'] || '',
    proposed_ipd_foreign: requireNumber_(proposal.proposed_ipd_foreign, 'proposed_ipd_foreign'),
    current_gov: current.row['government_opd_price'] || '',
    proposed_gov: requireNumber_(proposal.proposed_gov, 'proposed_gov'),
    current_nhso: current.row['nhso_heart_price'] || '',
    proposed_nhso: requireNumber_(proposal.proposed_nhso, 'proposed_nhso'),
    historical_gm: numberOrBlank_(proposal.historical_gm),
    target_gm: numberOrBlank_(proposal.target_gm),
    actual_gm: numberOrBlank_(proposal.actual_gm),
    markup: numberOrBlank_(proposal.markup),
    pricing_mode: proposal.pricing_mode || '',
    pricing_reason: proposal.pricing_reason || '',
    old_anchor: numberOrBlank_(proposal.old_anchor),
    notes: proposal.notes || '',
    status: 'PENDING',
    submitted_by: operator,
    submitted_at: now,
    reviewed_by: '',
    reviewed_at: '',
    review_note: '',
    policy_snapshot_json: policySnapshot
  };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.PRICING_PROPOSALS_SHEET);
  const headers = getHeaders_(sheet);
  sheet.appendRow(headers.map(h => rowObj[h] !== undefined ? rowObj[h] : ''));

  appendPricingHistory_({
    proposal_id: proposalId,
    row_id: rowObj.row_id,
    item_code: rowObj.item_code,
    drug_name: rowObj.drug_name,
    action: 'SUBMITTED',
    status: 'PENDING',
    actor: operator,
    note: rowObj.notes,
    before_json: JSON.stringify(extractPriceSnapshot_(current.row)),
    after_json: JSON.stringify(extractProposalPriceSnapshot_(rowObj)),
    proposal_json: JSON.stringify(rowObj),
    policy_snapshot_json: policySnapshot
  });

  return { ok: true, action: 'submit_pricing_proposal', proposal_id: proposalId, status: 'PENDING' };
}

function approvePricingProposalUnlocked_(payload) {
  setupPricingWorkflowSheets_();
  const reviewer = requireOperator_(payload.reviewed_by || payload.operator);
  verifyApproverPin_(payload.approver_pin || payload.pin);
  const proposalId = String(payload.proposal_id || '').trim();
  if (!proposalId) throw new Error('Missing proposal_id');

  const found = findProposalById_(proposalId);
  if (!found) throw new Error('Proposal not found');
  if (String(found.row.status || '').toUpperCase() !== 'PENDING') {
    throw new Error('Proposal is not pending: ' + found.row.status);
  }

  const db = findDatabaseRow_(found.row.row_id, found.row.item_code);
  if (!db) throw new Error('Drug row not found in DataBase');

  // Optimistic concurrency guard: do not apply a proposal created from stale prices.
  const staleFields = [];
  compareProposalBasePrice_(staleFields, 'OPD', found.row.current_opd, db.row['ราคา OPD']);
  compareProposalBasePrice_(staleFields, 'IPD', found.row.current_ipd, db.row['ราคา IPD']);
  compareProposalBasePrice_(staleFields, 'Foreign OPD', found.row.current_opd_foreign, db.row['ราคา OPD_Foreigner']);
  compareProposalBasePrice_(staleFields, 'Foreign IPD', found.row.current_ipd_foreign, db.row['ราคา IPD_Foreigner']);
  compareProposalBasePrice_(staleFields, 'Government', found.row.current_gov, db.row['government_opd_price']);
  compareProposalBasePrice_(staleFields, 'NHSO', found.row.current_nhso, db.row['nhso_heart_price']);
  if (staleFields.length) {
    throw new Error(
      'STALE_PROPOSAL: ราคาปัจจุบันเปลี่ยนหลังจากส่งข้อเสนอ (' +
      staleFields.join(', ') +
      '). กรุณายกเลิกข้อเสนอเดิมและสร้างข้อเสนอใหม่.'
    );
  }

  const before = extractPriceSnapshot_(db.row);

  const update = {
    'ราคา OPD': found.row.proposed_opd,
    'ราคา IPD': found.row.proposed_ipd,
    'ราคา OPD_Foreigner': found.row.proposed_opd_foreign,
    'ราคา IPD_Foreigner': found.row.proposed_ipd_foreign,
    'government_opd_price': found.row.proposed_gov,
    'nhso_heart_price': found.row.proposed_nhso,
    'gross_margin_opd': found.row.actual_gm,
    'gross_margin_ipd': calculateGM_(found.row.cost, found.row.proposed_ipd),
    'gross_margin_opd_foreigner': calculateGM_(found.row.cost, found.row.proposed_opd_foreign),
    'gross_margin_ipd_foreigner': calculateGM_(found.row.cost, found.row.proposed_ipd_foreign),
    'gross_margin_gov': calculateGM_(found.row.cost, found.row.proposed_gov),
    'gross_margin_nhso': calculateGM_(found.row.cost, found.row.proposed_nhso),
    'updated_at': new Date().toISOString(),
    'last_edited_by': reviewer
  };

  updateDatabaseRowAt_(db.rowNumber, update);
  updateProposalStatus_(found, 'APPROVED', reviewer, payload.review_note || '');

  const refreshed = findDatabaseRow_(found.row.row_id, found.row.item_code);
  appendPricingHistory_({
    proposal_id: proposalId,
    row_id: found.row.row_id,
    item_code: found.row.item_code,
    drug_name: found.row.drug_name,
    action: 'APPROVED_AND_APPLIED',
    status: 'APPROVED',
    actor: reviewer,
    note: payload.review_note || '',
    before_json: JSON.stringify(before),
    after_json: JSON.stringify(extractPriceSnapshot_(refreshed.row)),
    proposal_json: JSON.stringify(found.row),
    policy_snapshot_json: found.row.policy_snapshot_json || ''
  });

  return { ok: true, action: 'approve_pricing_proposal', proposal_id: proposalId, status: 'APPROVED' };
}

function rejectPricingProposalUnlocked_(payload) {
  setupPricingWorkflowSheets_();
  const reviewer = requireOperator_(payload.reviewed_by || payload.operator);
  verifyApproverPin_(payload.approver_pin || payload.pin);
  const proposalId = String(payload.proposal_id || '').trim();
  if (!proposalId) throw new Error('Missing proposal_id');

  const found = findProposalById_(proposalId);
  if (!found) throw new Error('Proposal not found');
  if (String(found.row.status || '').toUpperCase() !== 'PENDING') {
    throw new Error('Proposal is not pending: ' + found.row.status);
  }

  updateProposalStatus_(found, 'REJECTED', reviewer, payload.review_note || '');
  appendPricingHistory_({
    proposal_id: proposalId,
    row_id: found.row.row_id,
    item_code: found.row.item_code,
    drug_name: found.row.drug_name,
    action: 'REJECTED',
    status: 'REJECTED',
    actor: reviewer,
    note: payload.review_note || '',
    before_json: '',
    after_json: '',
    proposal_json: JSON.stringify(found.row),
    policy_snapshot_json: found.row.policy_snapshot_json || ''
  });

  return { ok: true, action: 'reject_pricing_proposal', proposal_id: proposalId, status: 'REJECTED' };
}

function cancelPricingProposalUnlocked_(payload) {
  setupPricingWorkflowSheets_();
  const operator = requireOperator_(payload.operator || payload.cancelled_by);
  const proposalId = String(payload.proposal_id || '').trim();
  if (!proposalId) throw new Error('Missing proposal_id');

  const found = findProposalById_(proposalId);
  if (!found) throw new Error('Proposal not found');
  if (String(found.row.status || '').toUpperCase() !== 'PENDING') {
    throw new Error('Proposal is not pending: ' + found.row.status);
  }

  if (String(found.row.submitted_by || '') !== operator) {
    throw new Error('Only the submitter can cancel this proposal');
  }

  updateProposalStatus_(found, 'CANCELLED', operator, payload.note || '');
  appendPricingHistory_({
    proposal_id: proposalId,
    row_id: found.row.row_id,
    item_code: found.row.item_code,
    drug_name: found.row.drug_name,
    action: 'CANCELLED',
    status: 'CANCELLED',
    actor: operator,
    note: payload.note || '',
    before_json: '',
    after_json: '',
    proposal_json: JSON.stringify(found.row),
    policy_snapshot_json: found.row.policy_snapshot_json || ''
  });

  return { ok: true, action: 'cancel_pricing_proposal', proposal_id: proposalId, status: 'CANCELLED' };
}

function listPricingProposals_(params) {
  setupPricingWorkflowSheets_();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.PRICING_PROPOSALS_SHEET);
  const headers = getHeaders_(sheet);
  if (sheet.getLastRow() < 2) return { ok: true, rows: [], rowCount: 0 };

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  const statusFilter = String((params && params.status) || '').trim().toUpperCase();
  const limit = Math.max(1, Math.min(500, Number((params && params.limit) || 200)));

  let rows = values.map(v => rowToObject_(headers, v));
  const pendingCount = rows.filter(r => String(r.status || '').toUpperCase() === 'PENDING').length;
  if (statusFilter && statusFilter !== 'ALL') {
    rows = rows.filter(r => String(r.status || '').toUpperCase() === statusFilter);
  }
  rows.reverse();
  rows = rows.slice(0, limit);
  return { ok: true, rows: rows, rowCount: rows.length, pendingCount: pendingCount };
}

function listPricingHistory_(params) {
  setupPricingWorkflowSheets_();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.PRICING_HISTORY_SHEET);
  const headers = getHeaders_(sheet);
  if (sheet.getLastRow() < 2) return { ok: true, rows: [], rowCount: 0 };

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  const itemCode = String((params && params.item_code) || '').trim().toLowerCase();
  const limit = Math.max(1, Math.min(1000, Number((params && params.limit) || 200)));

  let rows = values.map(v => rowToObject_(headers, v));
  if (itemCode) rows = rows.filter(r => String(r.item_code || '').toLowerCase() === itemCode);
  rows.reverse();
  rows = rows.slice(0, limit);
  return { ok: true, rows: rows, rowCount: rows.length };
}

function findPendingProposal_(rowId, itemCode) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.PRICING_PROPOSALS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const headers = getHeaders_(sheet);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    const row = rowToObject_(headers, values[i]);
    const same = (rowId && String(row.row_id || '') === String(rowId)) ||
      (itemCode && String(row.item_code || '').toLowerCase() === String(itemCode).toLowerCase());
    if (same && String(row.status || '').toUpperCase() === 'PENDING') return row;
  }
  return null;
}

function findProposalById_(proposalId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.PRICING_PROPOSALS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const headers = getHeaders_(sheet);
  const idIdx = headers.indexOf('proposal_id');
  const ids = sheet.getRange(2, idIdx + 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || '') === proposalId) {
      const rowNumber = i + 2;
      const values = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
      return { sheet: sheet, headers: headers, rowNumber: rowNumber, row: rowToObject_(headers, values) };
    }
  }
  return null;
}

function updateProposalStatus_(found, status, reviewer, note) {
  const now = new Date().toISOString();
  const updates = {
    status: status,
    reviewed_by: reviewer,
    reviewed_at: now,
    review_note: note || ''
  };
  const values = found.sheet.getRange(found.rowNumber, 1, 1, found.headers.length).getValues()[0];
  found.headers.forEach((h, i) => {
    if (Object.prototype.hasOwnProperty.call(updates, h)) values[i] = updates[h];
  });
  found.sheet.getRange(found.rowNumber, 1, 1, found.headers.length).setValues([values]);
}

function findDatabaseRow_(rowId, itemCode) {
  const sheet = getSheet_();
  const headers = getHeaders_(sheet);
  if (sheet.getLastRow() < 2) return null;
  const rowIdIdx = headers.indexOf('row_id');
  const itemCodeIdx = headers.indexOf('item_code');
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();

  for (let i = 0; i < values.length; i++) {
    const rid = rowIdIdx >= 0 ? String(values[i][rowIdIdx] || '') : '';
    const code = itemCodeIdx >= 0 ? String(values[i][itemCodeIdx] || '') : '';
    const match = (rowId && rid === String(rowId)) ||
      (itemCode && code.toLowerCase() === String(itemCode).toLowerCase());
    if (match) return { sheet: sheet, headers: headers, rowNumber: i + 2, row: rowToObject_(headers, values[i]) };
  }
  return null;
}

function updateDatabaseRowAt_(rowNumber, update) {
  const sheet = getSheet_();
  const headers = getHeaders_(sheet);
  const values = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  headers.forEach((h, i) => {
    if (Object.prototype.hasOwnProperty.call(update, h)) values[i] = update[h];
  });
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([values]);
}

function appendPricingHistory_(obj) {
  setupHistorySheetOnly_();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.PRICING_HISTORY_SHEET);
  const headers = getHeaders_(sheet);
  const rowObj = Object.assign({
    history_id: Utilities.getUuid(),
    proposal_id: '',
    row_id: '',
    item_code: '',
    drug_name: '',
    action: '',
    status: '',
    actor: '',
    action_at: new Date().toISOString(),
    note: '',
    before_json: '',
    after_json: '',
    proposal_json: '',
    policy_snapshot_json: ''
  }, obj || {});
  sheet.appendRow(headers.map(h => rowObj[h] !== undefined ? rowObj[h] : ''));
}

function setupHistorySheetOnly_() {
  ensureSheetWithHeaders_(CONFIG.PRICING_HISTORY_SHEET, [
    'history_id', 'proposal_id', 'row_id', 'item_code', 'drug_name',
    'action', 'status', 'actor', 'action_at', 'note',
    'before_json', 'after_json', 'proposal_json', 'policy_snapshot_json'
  ]);
}

function getHeaders_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
}

function rowToObject_(headers, values) {
  const obj = {};
  headers.forEach((h, i) => {
    if (!h) return;
    const v = values[i];
    obj[h] = v instanceof Date ? v.toISOString() : v;
  });
  return obj;
}

function extractPriceSnapshot_(row) {
  return {
    cost: row['ราคาต้นทุน'] || '',
    opd: row['ราคา OPD'] || '',
    ipd: row['ราคา IPD'] || '',
    opd_foreign: row['ราคา OPD_Foreigner'] || '',
    ipd_foreign: row['ราคา IPD_Foreigner'] || '',
    gov: row['government_opd_price'] || '',
    nhso: row['nhso_heart_price'] || '',
    gross_margin_opd: row['gross_margin_opd'] || '',
    gross_margin_ipd: row['gross_margin_ipd'] || '',
    gross_margin_gov: row['gross_margin_gov'] || '',
    gross_margin_nhso: row['gross_margin_nhso'] || ''
  };
}

function extractProposalPriceSnapshot_(row) {
  return {
    cost: row.cost || '',
    opd: row.proposed_opd || '',
    ipd: row.proposed_ipd || '',
    opd_foreign: row.proposed_opd_foreign || '',
    ipd_foreign: row.proposed_ipd_foreign || '',
    gov: row.proposed_gov || '',
    nhso: row.proposed_nhso || '',
    actual_gm: row.actual_gm || '',
    markup: row.markup || ''
  };
}

function compareProposalBasePrice_(changed, label, proposalValue, currentValue) {
  const a = normalizeComparablePrice_(proposalValue);
  const b = normalizeComparablePrice_(currentValue);
  if (a !== b) changed.push(label);
}

function normalizeComparablePrice_(value) {
  if (value === '' || value === null || value === undefined) return '';
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : String(value).trim();
}

function isProtectedPricingColumn_(header) {
  return [
    'ราคา OPD',
    'ราคา IPD',
    'ราคา OPD_Foreigner',
    'ราคา IPD_Foreigner',
    'government_opd_price',
    'nhso_heart_price',
    'gross_margin_opd',
    'gross_margin_ipd',
    'gross_margin_opd_foreigner',
    'gross_margin_ipd_foreigner',
    'gross_margin_gov',
    'gross_margin_nhso'
  ].includes(String(header || ''));
}

function verifyApproverPin_(pin) {
  const expected = PropertiesService.getScriptProperties().getProperty(CONFIG.APPROVER_PIN_PROPERTY);
  if (!expected) {
    throw new Error(
      'Approval is not configured. Set Script Property ' +
      CONFIG.APPROVER_PIN_PROPERTY +
      ' before approving/rejecting proposals.'
    );
  }
  if (String(pin || '') !== String(expected)) throw new Error('Invalid approver PIN');
  return true;
}

function requireOperator_(value) {
  const operator = String(value || '').trim();
  if (!operator) throw new Error('กรุณาระบุชื่อผู้ดำเนินการ');
  if (operator.length > 120) throw new Error('Operator name is too long');
  return operator;
}

function requireNumber_(value, fieldName) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error('Invalid ' + fieldName);
  return n;
}

function numberOrBlank_(value) {
  if (value === '' || value === null || value === undefined) return '';
  const n = Number(value);
  return Number.isFinite(n) ? n : '';
}

function calculateGM_(cost, price) {
  const c = Number(cost);
  const p = Number(price);
  if (!(p > 0) || !Number.isFinite(c) || !Number.isFinite(p)) return '';
  return Math.round((((p - c) / p) * 100) * 100) / 100;
}
