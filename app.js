'use strict';

const CONFIG = window.DRUG_APP_CONFIG || {};

const state = {
  headers: [],
  rows: [],
  filteredRows: [],
  selectedRowId: null,
  modalMode: 'view',
  saving: false,
  editing: false,
  lastServerTime: null,
  search: ''
};

const CORE_FIELDS = [
  'item_code', 'GenercName', 'FullName', 'DosageForm', 'Major Class', 'Sub Class', 'ราคาต้นทุน',
  'ราคา OPD', 'ราคา IPD', 'ราคา สกย. OPD', 'ราคา สกย. IPD',
  'ราคา OPD_Foreigner', 'ราคา IPD_Foreigner', 'nhso_heart_price'
];

const PRICE_FIELDS = [
  'ราคาต้นทุน', 'ราคา OPD', 'ราคา IPD', 'ราคา สกย. OPD', 'ราคา สกย. IPD',
  'ราคา OPD_Foreigner', 'ราคา IPD_Foreigner', 'nhso_heart_price'
];

const CALCULATED_FIELDS = [
  'gross_margin_opd', 'gross_margin_ipd', 'gross_margin_สกย_opd', 'gross_margin_สกย_ipd',
  'gross_margin_ipd_foreigner', 'gross_margin_opd_foreigner', 'gross_margin_nhso',
  'ราคาสกย.OPD Discount 20%', 'ราคา สกย.IPD Discount 20%',
  'OPD สกย. after discount -Cost', 'ราคา IPD สกย After dis count - Cost'
];

const READONLY_FIELDS = new Set(['row_id', 'created_at', 'updated_at', 'last_edited_by', ...CALCULATED_FIELDS]);

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

function boot() {
  bindEvents();
  renderApiWarningIfNeeded();
  loadData({ showBusy: true });
  setInterval(() => {
    if (!state.editing && !document.hidden) loadData({ silent: true });
  }, Number(CONFIG.POLL_INTERVAL_MS || 5000));
}

document.addEventListener('DOMContentLoaded', boot);

function bindEvents() {
  $('#searchInput').addEventListener('input', event => {
    state.search = event.target.value;
    applySearchAndRender();
  });

  $('#refreshBtn').addEventListener('click', () => loadData({ showBusy: true }));
  $('#addBtn').addEventListener('click', () => openModal(blankRow(), 'add'));
  $('#closeModalBtn').addEventListener('click', closeModal);
  $('#modalBackdrop').addEventListener('click', event => {
    if (event.target.id === 'modalBackdrop') closeModal();
  });

  $('#editBtn').addEventListener('click', () => {
    const row = getSelectedRow();
    if (row) openModal(row, 'edit');
  });

  $('#deleteBtn').addEventListener('click', async () => {
    const row = getSelectedRow();
    if (!row) return;
    const name = row.FullName || row.item_code || 'รายการนี้';
    if (!confirm(`ต้องการลบ ${name} ใช่หรือไม่?`)) return;
    await submitPayload('delete', { row_id: row.row_id }, { refresh: true });
    closeModal();
  });

  $('#saveBtn').addEventListener('click', () => saveModalForm({ manual: true }));

  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  bindCalculator();
}

function renderApiWarningIfNeeded() {
  const url = String(CONFIG.WEB_APP_URL || '');
  if (!url || url.includes('PASTE_APPS_SCRIPT')) {
    setStatus('ยังไม่ได้ตั้งค่า Apps Script URL ใน config.js', 'warn');
    $('#cardsGrid').innerHTML = `<div class="empty-state">
      <h2>ตั้งค่า API ก่อนใช้งาน</h2>
      <p>เปิดไฟล์ <b>config.js</b> แล้วใส่ URL ที่ได้จาก Apps Script Web App ตรง <code>WEB_APP_URL</code></p>
    </div>`;
  }
}

async function loadData(options = {}) {
  if (!CONFIG.WEB_APP_URL || CONFIG.WEB_APP_URL.includes('PASTE_APPS_SCRIPT')) return;
  if (options.showBusy) setStatus('กำลังโหลดข้อมูล...', 'busy');
  try {
    const res = await jsonp('list', {});
    if (!res.ok) throw new Error(res.error || 'Load failed');
    state.headers = res.headers || [];
    state.rows = res.rows || [];
    state.lastServerTime = res.serverTime || null;
    applySearchAndRender();
    renderStats();
    setStatus(`เชื่อมต่อแล้ว · ${formatDateTime(state.lastServerTime)}`, 'ok');
  } catch (err) {
    setStatus(`โหลดข้อมูลไม่ได้: ${err.message}`, 'error');
  }
}

function jsonp(action, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `__drug_cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const url = new URL(CONFIG.WEB_APP_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('callback', callbackName);
    if (CONFIG.APP_TOKEN) url.searchParams.set('token', CONFIG.APP_TOKEN);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

    const script = document.createElement('script');
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('API timeout'));
    }, 20000);

    function cleanup() {
      clearTimeout(timer);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = data => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('API script load failed'));
    };

    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function postForm(action, payload) {
  return new Promise((resolve, reject) => {
    const iframeName = `hidden_post_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const iframe = document.createElement('iframe');
    iframe.name = iframeName;
    iframe.className = 'hidden-frame';

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `${CONFIG.WEB_APP_URL}?action=${encodeURIComponent(action)}`;
    form.target = iframeName;
    form.className = 'hidden-frame';

    addHidden(form, 'payload', JSON.stringify(payload));
    if (CONFIG.APP_TOKEN) addHidden(form, 'token', CONFIG.APP_TOKEN);

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Save timeout'));
    }, 25000);

    function cleanup() {
      clearTimeout(timer);
      form.remove();
      iframe.remove();
    }

    iframe.addEventListener('load', () => {
      cleanup();
      resolve({ ok: true });
    });

    document.body.appendChild(iframe);
    document.body.appendChild(form);
    form.submit();
  });
}

function addHidden(form, name, value) {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = name;
  input.value = value;
  form.appendChild(input);
}

function applySearchAndRender() {
  const query = state.search.trim().toLowerCase();
  const tokens = query.split(/\s+/).filter(Boolean);

  state.filteredRows = !tokens.length
    ? state.rows.slice(0, 120)
    : state.rows.filter(row => {
        const haystack = [
          row.item_code,
          row.GenercName,
          row.FullName,
          row.DosageForm,
          row['Major Class'],
          row['Sub Class']
        ].join(' ').toLowerCase();
        return tokens.every(token => haystack.includes(token));
      }).slice(0, 120);

  renderCards();
  $('#resultCount').textContent = `${state.filteredRows.length.toLocaleString()} รายการที่แสดง / ${state.rows.length.toLocaleString()} รายการทั้งหมด`;
}

function renderCards() {
  const grid = $('#cardsGrid');
  if (!state.filteredRows.length) {
    grid.innerHTML = `<div class="empty-state"><h2>ไม่พบข้อมูล</h2><p>ลองพิมพ์บางตัวอักษรของชื่อยา รหัสยา หรือกลุ่มยา</p></div>`;
    return;
  }

  grid.innerHTML = state.filteredRows.map(row => {
    const opdDiff = toNumber(row['OPD สกย. after discount -Cost']);
    const ipdDiff = toNumber(row['ราคา IPD สกย After dis count - Cost']);
    const isNegative = opdDiff < 0 || ipdDiff < 0;
    return `<button class="drug-card ${isNegative ? 'danger-card' : ''}" data-id="${escapeHtml(row.row_id)}">
      <div class="card-topline">
        <span class="pill">${escapeHtml(row.DosageForm || '-')}</span>
        <span class="code">${escapeHtml(row.item_code || '-')}</span>
      </div>
      <h3>${escapeHtml(row.FullName || '(ไม่มีชื่อยา)')}</h3>
      <p>${escapeHtml(row['Major Class'] || '')}</p>
      <div class="price-grid">
        <span><b>Cost</b>${money(row['ราคาต้นทุน'])}</span>
        <span><b>OPD</b>${money(row['ราคา OPD'])}</span>
        <span><b>IPD</b>${money(row['ราคา IPD'])}</span>
        <span><b>สกย.OPD</b>${money(row['ราคา สกย. OPD'])}</span>
      </div>
      ${isNegative ? '<div class="warning-line">ส่วนต่างหลัง Discount ติดลบ</div>' : ''}
    </button>`;
  }).join('');

  $$('.drug-card').forEach(card => {
    card.addEventListener('click', () => {
      const row = state.rows.find(item => String(item.row_id) === String(card.dataset.id));
      if (row) openModal(row, 'view');
    });
  });
}

function renderStats() {
  const total = state.rows.length;
  const negativeCount = state.rows.filter(row =>
    toNumber(row['OPD สกย. after discount -Cost']) < 0 ||
    toNumber(row['ราคา IPD สกย After dis count - Cost']) < 0
  ).length;
  const avgGmOpd = average(state.rows.map(row => toNumber(row.gross_margin_opd)).filter(Number.isFinite));

  $('#totalCount').textContent = total.toLocaleString();
  $('#negativeCount').textContent = negativeCount.toLocaleString();
  $('#avgGmOpd').textContent = Number.isFinite(avgGmOpd) ? `${avgGmOpd.toFixed(1)}%` : '-';
}

function openModal(row, mode = 'view') {
  state.selectedRowId = row.row_id || null;
  state.modalMode = mode;
  state.editing = mode !== 'view';

  $('#modalTitle').textContent = mode === 'add' ? 'เพิ่มรายการยาใหม่' : (row.FullName || row.item_code || 'รายละเอียดรายการ');
  $('#modalSubtitle').textContent = mode === 'view' ? 'คลิก Edit เพื่อแก้ไขข้อมูล' : 'ระบบจะบันทึกลง Google Sheet เมื่อกด Save';
  $('#editBtn').hidden = mode !== 'view';
  $('#deleteBtn').hidden = mode === 'add';
  $('#saveBtn').hidden = mode === 'view';

  $('#modalBody').innerHTML = buildDetailForm(row, mode);
  $('#modalBackdrop').classList.add('show');

  if (mode !== 'view') bindFormEvents(mode);
}

function closeModal() {
  state.selectedRowId = null;
  state.editing = false;
  $('#modalBackdrop').classList.remove('show');
  $('#modalBody').innerHTML = '';
}

function getSelectedRow() {
  return state.rows.find(row => String(row.row_id) === String(state.selectedRowId));
}

function buildDetailForm(row, mode) {
  const fields = orderedHeaders();
  const readonly = mode === 'view';
  const groups = [
    { title: 'ข้อมูลยา', fields: fields.filter(f => CORE_FIELDS.includes(f) && !PRICE_FIELDS.includes(f)) },
    { title: 'ราคา', fields: fields.filter(f => PRICE_FIELDS.includes(f)) },
    { title: 'คำนวณ / Gross margin', fields: fields.filter(f => CALCULATED_FIELDS.includes(f)) },
    { title: 'ข้อมูลระบบ', fields: fields.filter(f => ['row_id', 'created_at', 'updated_at', 'last_edited_by'].includes(f)) }
  ].filter(group => group.fields.length);

  return `<form id="drugForm" class="detail-form">
    ${groups.map(group => `<section class="form-section">
      <h3>${escapeHtml(group.title)}</h3>
      <div class="form-grid">
        ${group.fields.map(field => renderField(field, row[field], readonly || READONLY_FIELDS.has(field), mode)).join('')}
      </div>
    </section>`).join('')}
    <div id="saveHint" class="save-hint"></div>
  </form>`;
}

function renderField(field, value, readonly, mode) {
  const isNumber = PRICE_FIELDS.includes(field) || CALCULATED_FIELDS.includes(field) || field.startsWith('gross_margin');
  const inputType = isNumber ? 'number' : 'text';
  const step = isNumber ? ' step="0.01"' : '';
  const readonlyAttr = readonly ? ' readonly disabled' : '';
  const valueText = value == null ? '' : String(value);
  const helper = field.startsWith('gross_margin') ? '<small>สูตร: 100*((ราคาขาย-ราคาต้นทุน)/ราคาขาย)</small>' : '';
  return `<label class="field">
    <span>${escapeHtml(field)}</span>
    <input name="${escapeHtml(field)}" type="${inputType}" value="${escapeHtml(valueText)}"${step}${readonlyAttr} data-original="${escapeHtml(valueText)}" data-field="${escapeHtml(field)}">
    ${helper}
  </label>`;
}

function bindFormEvents(mode) {
  const form = $('#drugForm');
  if (!form) return;

  form.addEventListener('input', event => {
    const input = event.target.closest('input');
    if (!input || input.disabled) return;
    input.dataset.touched = 'true';
    if (mode === 'add' && PRICE_FIELDS.includes(input.name)) autoFillNewItemPrices(input.name);
  });
}

function autoFillNewItemPrices(changedName) {
  const form = $('#drugForm');
  const field = name => form.querySelector(`[name="${cssEscape(name)}"]`);
  const get = name => toNumber(field(name)?.value);
  const setIfAllowed = (name, value) => {
    const input = field(name);
    if (!input || input.dataset.touched === 'true') return;
    if (Number.isFinite(value)) input.value = round2(value);
  };

  let opd = get('ราคา OPD');
  let sakyOpd = get('ราคา สกย. OPD');

  if (!Number.isFinite(opd) && Number.isFinite(sakyOpd)) {
    opd = sakyOpd;
    setIfAllowed('ราคา OPD', opd);
  }
  if (!Number.isFinite(sakyOpd) && Number.isFinite(opd)) {
    sakyOpd = opd;
    setIfAllowed('ราคา สกย. OPD', sakyOpd);
  }

  if (Number.isFinite(opd)) {
    const ipdDefault = round2(opd * 1.3);
    setIfAllowed('ราคา IPD', ipdDefault);
    setIfAllowed('ราคา สกย. IPD', ipdDefault);
    setIfAllowed('ราคา OPD_Foreigner', round2(opd * 1.3));
    const currentIpd = Number.isFinite(get('ราคา IPD')) ? get('ราคา IPD') : ipdDefault;
    setIfAllowed('ราคา IPD_Foreigner', round2(currentIpd * 1.3));
  }
}

async function saveModalForm() {
  const form = $('#drugForm');
  if (!form || state.saving) return;
  const payload = formToPayload(form);
  const action = state.modalMode === 'add' ? 'add' : 'save';

  if (!confirmNegativeIfNeeded(payload)) return;
  await submitPayload(action, payload, { refresh: true });
  closeModal();
}

function formToPayload(form) {
  const payload = {};
  state.headers.forEach(h => {
    const input = form.querySelector(`[name="${cssEscape(h)}"]`);
    if (input && !input.disabled) payload[h] = input.value;
  });

  // Preserve row_id for editing because its input is disabled/read-only.
  if (state.modalMode !== 'add') payload.row_id = state.selectedRowId;
  return payload;
}

function confirmNegativeIfNeeded(payload) {
  const cost = toNumber(payload['ราคาต้นทุน']);
  const sakyOpd = toNumber(payload['ราคา สกย. OPD'] || payload['ราคา OPD']);
  const sakyIpd = toNumber(payload['ราคา สกย. IPD'] || payload['ราคา IPD']);
  const opdDiff = Number.isFinite(sakyOpd) && Number.isFinite(cost) ? sakyOpd * 0.8 - cost : 0;
  const ipdDiff = Number.isFinite(sakyIpd) && Number.isFinite(cost) ? sakyIpd * 0.8 - cost : 0;

  if (opdDiff < 0 || ipdDiff < 0) {
    return confirm(`พบส่วนต่างหลัง Discount 20% ติดลบ\n\nOPD: ${money(opdDiff)}\nIPD: ${money(ipdDiff)}\n\nต้องการบันทึกต่อหรือไม่?`);
  }
  return true;
}

async function submitPayload(action, payload, options = {}) {
  state.saving = true;
  setStatus('กำลังบันทึก...', 'busy');
  $('#saveHint').textContent = 'กำลังบันทึกลง Google Sheet...';
  try {
    await postForm(action, payload);
    setStatus('บันทึกแล้ว กำลัง refresh ข้อมูล...', 'ok');
    if (options.refresh) await loadData({ silent: true });
  } catch (err) {
    setStatus(`บันทึกไม่ได้: ${err.message}`, 'error');
  } finally {
    state.saving = false;
  }
}

function blankRow() {
  const row = {};
  state.headers.forEach(h => { row[h] = ''; });
  return row;
}

function orderedHeaders() {
  const system = ['row_id', 'created_at', 'updated_at', 'last_edited_by'];
  const known = [...CORE_FIELDS, ...PRICE_FIELDS, ...CALCULATED_FIELDS, ...system];
  const result = [];
  known.forEach(h => {
    if (state.headers.includes(h) && !result.includes(h)) result.push(h);
  });
  state.headers.forEach(h => {
    if (!result.includes(h)) result.push(h);
  });
  return result;
}

function switchTab(tabName) {
  $$('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
  $$('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === `${tabName}Tab`));
}

function bindCalculator() {
  ['costForGm', 'targetGm'].forEach(id => $(`#${id}`).addEventListener('input', calculatePriceFromGm));
  ['costForSale', 'salePrice'].forEach(id => $(`#${id}`).addEventListener('input', calculateGmFromSale));
}

function calculatePriceFromGm() {
  const cost = toNumber($('#costForGm').value);
  const gm = toNumber($('#targetGm').value);
  if (!Number.isFinite(cost) || !Number.isFinite(gm) || gm >= 100) {
    $('#priceFromGmResult').textContent = '-';
    return;
  }
  $('#priceFromGmResult').textContent = money(cost / (1 - gm / 100));
}

function calculateGmFromSale() {
  const cost = toNumber($('#costForSale').value);
  const sale = toNumber($('#salePrice').value);
  if (!Number.isFinite(cost) || !Number.isFinite(sale) || sale <= 0) {
    $('#gmFromPriceResult').textContent = '-';
    return;
  }
  $('#gmFromPriceResult').textContent = `${(100 * ((sale - cost) / sale)).toFixed(2)}%`;
}

function average(values) {
  if (!values.length) return NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toNumber(value) {
  if (value == null || value === '') return NaN;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function money(value) {
  const n = typeof value === 'number' ? value : toNumber(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'medium' });
}

function setStatus(message, type = 'ok') {
  const el = $('#statusText');
  el.textContent = message;
  el.className = `status ${type}`;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}
