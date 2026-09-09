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
  HEADER_ROW: 1,
  DATA_START_ROW: 2,
  APP_TOKEN: '' // หากตั้งใน config.js ให้ใส่ค่าเดียวกันตรงนี้
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
      result = { ok: true, now: new Date().toISOString(), version: '2.0.0-excel-ready' };
    } else if (action === 'list') {
      result = listRows_();
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
