'use strict';

/* ====================== CONFIGURATION ====================== */
const CONFIG = window.DRUG_APP_CONFIG || {};

/* ====================== STATE MANAGEMENT ====================== */
const state = {
  headers: [],
  rows: [],
  filteredRows: [],
  selectedRowId: null,
  modalMode: 'view', // 'view' | 'add' | 'edit'
  saving: false,
  editing: false,
  lastServerTime: null,
  search: '',
  activeTab: 'overview' // 'overview' | 'pricing' | 'calculated'
};

/* ====================== CONSTANTS ====================== */
const CORE_FIELDS = [
  'item_code', 'GenercName', 'FullName', 'DosageForm', 
  'Major Class', 'Sub Class', 'ราคาต้นทุน', 'ราคา OPD'
];

const PRICE_FIELDS = [
  'ราคาต้นทุน', 'ราคา OPD', 'ราคา IPD', 
  'ราคา สกย. OPD', 'ราคา สกย. IPD',
  'ราคา OPD_Foreigner', 'ราคา IPD_Foreigner', 
  'nhso_heart_price'
];

const CALCULATED_FIELDS = [
  'gross_margin_opd', 'gross_margin_ipd', 
  'gross_margin_สกย_opd', 'gross_margin_สกย_ipd',
  'gross_margin_ipd_foreigner', 'gross_margin_opd_foreigner', 
  'gross_margin_nhso',
  'ราคาสกย.OPD Discount 20%', 'ราคา สกย.IPD Discount 20%',
  'OPD สกย. after discount -Cost', 
  'ราคา IPD สกย After dis count - Cost'
];

const READONLY_FIELDS = new Set([
  'row_id', 'created_at', 'updated_at', 'last_edited_by', 
  ...CALCULATED_FIELDS
]);

/* ====================== DOM HELPERS ====================== */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

/* ====================== INITIALIZATION ====================== */
function boot() {
  console.log('%c🚀 Drug Price App Starting...', 'color: teal; font-weight: bold; font-size: 14px');
  bindEvents();
  renderApiWarningIfNeeded();
  loadData({ showBusy: true });
  
  // Auto-refresh
  setInterval(() => {
    if (!state.editing && !document.hidden) {
      loadData({ silent: true });
    }
  }, Number(CONFIG.POLL_INTERVAL_MS || 8000));
}

document.addEventListener('DOMContentLoaded', boot);

/* ====================== EVENT BINDING ====================== */
function bindEvents() {
  // Search
  const searchInput = $('#searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', debounce((e) => {
      state.search = e.target.value;
      applySearchAndRender();
    }, 300));
  }

  // Buttons
  $('#refreshBtn')?.addEventListener('click', () => loadData({ showBusy: true }));
  $('#addBtn')?.addEventListener('click', () => openModal(blankRow(), 'add'));
  $('#closeModalBtn')?.addEventListener('click', closeModal);
  $('#modalBackdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') closeModal();
  });
  $('#editBtn')?.addEventListener('click', () => {
    const row = getSelectedRow();
    if (row) openModal(row, 'edit');
  });
  $('#deleteBtn')?.addEventListener('click', handleDelete);
  $('#saveBtn')?.addEventListener('click', saveModalForm);
  $('#cancelBtn')?.addEventListener('click', closeModal);

  // Tabs
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.ctrlKey && e.key === 'f') {
      e.preventDefault();
      $('#searchInput')?.focus();
    }
  });

  // Calculator
  $('#calcUnitCost')?.addEventListener('input', calculatePricing);
  $('#calcMargin')?.addEventListener('input', calculatePricing);
}

/* ====================== DATA LOADING ====================== */
async function loadData(options = {}) {
  if (!CONFIG.WEB_APP_URL || CONFIG.WEB_APP_URL.includes('PASTE')) {
    setStatus('⚠️ ยังไม่ได้ตั้งค่า WEB_APP_URL ใน config.js', 'warn');
    renderApiWarning(true);
    return;
  }

  if (options.showBusy) setStatus('⏳ กำลังโหลดข้อมูล...', 'busy');

  try {
    const res = await jsonp('list', {});
    
    if (!res.ok) {
      throw new Error(res.error || 'การโหลดข้อมูลล้มเหลว');
    }

    state.headers = res.headers || [];
    state.rows = (res.rows || []).filter(row => hasAnyValue(row));
    state.lastServerTime = res.serverTime;

    applySearchAndRender();
    renderStats();
    
    if (!options.silent) {
      setStatus(`✅ โหลดสำเร็จ ${state.rows.length} รายการ`, 'ok');
    } else {
      setStatus('', 'ok');
    }
    
    renderApiWarning(false);
  } catch (err) {
    setStatus(`❌ โหลดข้อมูลไม่ได้: ${err.message}`, 'error');
    console.error('Load error:', err);
    if (state.rows.length === 0) {
      renderApiWarning(true);
    }
  }
}

function hasAnyValue(row) {
  if (!row) return false;
  
  // Check core fields first
  for (let field of CORE_FIELDS) {
    if (row[field] && String(row[field]).trim() !== '') return true;
  }

  // Check any field has value
  return Object.keys(row).some(key => {
    if (key.startsWith('_')) return false;
    const val = row[key];
    return val !== '' && val != null && val !== 'null' && val !== undefined;
  });
}

/* ====================== RENDERING ====================== */
function applySearchAndRender() {
  const query = state.search.toLowerCase().trim();
  const tokens = query.split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    state.filteredRows = state.rows.slice(0, 150);
  } else {
    state.filteredRows = state.rows.filter(row => {
      const searchText = [
        row.item_code, row.GenercName, row.FullName, 
        row.DosageForm, row['Major Class'], row['Sub Class'],
        row['ราคาต้นทุน'], row['ราคา OPD']
      ].filter(Boolean).join(' ').toLowerCase();
      
      return tokens.every(token => searchText.includes(token));
    });
  }

  renderCards();
  updateResultCount();
}

function renderCards() {
  const container = $('#cardsGrid');
  if (!container) return;

  if (state.filteredRows.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <h3>ไม่พบรายการ</h3>
        <p>${state.search ? 'ลองเปลี่ยนคำค้นหา' : 'ยังไม่มีข้อมูลในระบบ'}</p>
      </div>`;
    return;
  }

  container.innerHTML = state.filteredRows.map(row => `
    <div class="card ${state.selectedRowId === row.row_id ? 'selected' : ''}" 
         onclick="selectRow('${row.row_id}')" 
         data-row-id="${row.row_id}">
      <div class="card-header">
        <strong>${escapeHtml(row.FullName || 'ไม่มีชื่อ')}</strong>
        ${row.item_code ? `<small class="item-code">${escapeHtml(row.item_code)}</small>` : ''}
      </div>
      <div class="card-body">
        <div class="info-row">
          <span class="label">ต้นทุน:</span>
          <span class="value">${formatNumber(row['ราคาต้นทุน'])}</span>
        </div>
        <div class="info-row">
          <span class="label">OPD:</span>
          <span class="value">${formatNumber(row['ราคา OPD'])}</span>
        </div>
        <div class="info-row">
          <span class="label">สกย.OPD:</span>
          <span class="value">${formatNumber(row['ราคา สกย. OPD'])}</span>
        </div>
        <div class="info-row margin-row">
          <span class="label">Margin OPD:</span>
          <span class="value ${getMarginClass(row.gross_margin_opd)}">
            ${formatMargin(row.gross_margin_opd)}
          </span>
        </div>
      </div>
    </div>
  `).join('');
}

function selectRow(rowId) {
  state.selectedRowId = rowId;
  
  // Update UI
  $$('.card').forEach(card => {
    card.classList.toggle('selected', card.dataset.rowId === rowId);
  });
  
  // Enable/disable action buttons
  const row = getSelectedRow();
  $('#editBtn').disabled = !row;
  $('#deleteBtn').disabled = !row;
  
  // Show detail in panel if exists
  renderDetailPanel(row);
}

function renderDetailPanel(row) {
  const panel = $('#detailPanel');
  if (!panel || !row) return;
  
  panel.innerHTML = `
    <h3>${escapeHtml(row.FullName || 'ไม่มีชื่อ')}</h3>
    <div class="detail-grid">
      ${state.headers.map(header => `
        <div class="detail-item">
          <label>${escapeHtml(header)}</label>
          <span class="${READONLY_FIELDS.has(header) ? 'calculated' : ''}">
            ${formatCellValue(row[header])}
          </span>
        </div>
      `).join('')}
    </div>
  `;
}

function updateResultCount() {
  const count = $('#resultCount');
  if (count) {
    count.textContent = `แสดง ${state.filteredRows.length} จาก ${state.rows.length} รายการ`;
  }
}

function renderStats() {
  const stats = $('#statsBar');
  if (!stats) return;
  
  const totalItems = state.rows.length;
  const avgMargin = calculateAverageMargin();
  
  stats.innerHTML = `
    <span>📦 รายการทั้งหมด: <strong>${totalItems}</strong></span>
    <span>📊 Margin เฉลี่ย OPD: <strong>${avgMargin}%</strong></span>
    <span>🕒 อัพเดทล่าสุด: <strong>${formatTime(state.lastServerTime)}</strong></span>
  `;
}

function calculateAverageMargin() {
  const margins = state.rows
    .map(row => parseFloat(row.gross_margin_opd))
    .filter(val => !isNaN(val));
  
  if (margins.length === 0) return '0.00';
  
  const avg = margins.reduce((sum, val) => sum + val, 0) / margins.length;
  return avg.toFixed(2);
}

/* ====================== MODAL MANAGEMENT ====================== */
function openModal(row, mode = 'view') {
  state.selectedRowId = row.row_id;
  state.modalMode = mode;
  state.editing = (mode === 'add' || mode === 'edit');
  
  const modal = $('#itemModal');
  const backdrop = $('#modalBackdrop');
  
  if (!modal || !backdrop) return;
  
  // Update modal title
  const titles = {
    view: '📋 ดูรายละเอียด',
    add: '➕ เพิ่มรายการใหม่',
    edit: '✏️ แก้ไขรายการ'
  };
  $('#modalTitle').textContent = titles[mode] || titles.view;
  
  // Build form
  buildModalForm(row, mode);
  
  // Show/hide buttons
  $('#editBtn').style.display = (mode === 'view' && row.row_id) ? 'inline-block' : 'none';
  $('#deleteBtn').style.display = (mode === 'view' && row.row_id) ? 'inline-block' : 'none';
  $('#saveBtn').style.display = (mode === 'add' || mode === 'edit') ? 'inline-block' : 'none';
  $('#cancelBtn').style.display = (mode === 'add' || mode === 'edit') ? 'inline-block' : 'none';
  
  // Show modal
  modal.style.display = 'block';
  backdrop.style.display = 'block';
  
  // Focus first input if editing
  if (mode === 'add' || mode === 'edit') {
    setTimeout(() => {
      const firstInput = modal.querySelector('input:not([readonly]):not([type="hidden"])');
      if (firstInput) firstInput.focus();
    }, 100);
  }
}

function buildModalForm(row, mode) {
  const form = $('#modalForm');
  if (!form) return;
  
  const isReadonly = (mode === 'view');
  
  // Group fields by category
  const basicFields = ['item_code', 'GenercName', 'FullName', 'DosageForm', 'Major Class', 'Sub Class'];
  const pricingFields = PRICE_FIELDS;
  const calculatedFields = CALCULATED_FIELDS;
  
  form.innerHTML = `
    <!-- Tab Navigation -->
    <div class="tab-nav">
      <button class="tab-btn active" data-tab="overview">📋 ข้อมูลพื้นฐาน</button>
      <button class="tab-btn" data-tab="pricing">💰 ราคา</button>
      <button class="tab-btn" data-tab="calculated">📊 คำนวณ</button>
    </div>
    
    <!-- Basic Info Tab -->
    <div class="tab-content active" id="tab-overview">
      ${basicFields.map(field => createFieldHTML(field, row, isReadonly)).join('')}
      ${renderExtraFields('basic')}
    </div>
    
    <!-- Pricing Tab -->
    <div class="tab-content" id="tab-pricing">
      ${pricingFields.map(field => createFieldHTML(field, row, isReadonly)).join('')}
      ${renderExtraFields('pricing')}
    </div>
    
    <!-- Calculated Tab -->
    <div class="tab-content" id="tab-calculated">
      ${calculatedFields.map(field => createFieldHTML(field, row, true)).join('')}
    </div>
  `;
  
  // Re-bind tab events
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchModalTab(btn.dataset.tab));
  });
}

function createFieldHTML(fieldName, row, readonly) {
  const value = row[fieldName] || '';
  const isReadonly = readonly || READONLY_FIELDS.has(fieldName);
  const type = getFieldType(fieldName);
  
  return `
    <div class="form-group ${isReadonly ? 'readonly' : ''}">
      <label for="field_${fieldName}">
        ${escapeHtml(fieldName)}
        ${isReadonly ? ' <span class="readonly-badge">คำนวณ</span>' : ''}
      </label>
      <input 
        type="${type}"
        id="field_${fieldName}"
        name="${fieldName}"
        value="${escapeHtml(value)}"
        ${isReadonly ? 'readonly' : ''}
        class="${isReadonly ? 'readonly-input' : ''}"
        placeholder="${getPlaceholder(fieldName)}"
      >
    </div>
  `;
}

function getFieldType(fieldName) {
  if (fieldName.includes('margin') || fieldName.includes('ราคา') || fieldName.includes('cost')) {
    return 'number';
  }
  if (fieldName.includes('created_at') || fieldName.includes('updated_at')) {
    return 'datetime-local';
  }
  return 'text';
}

function getPlaceholder(fieldName) {
  const placeholders = {
    'item_code': 'รหัสสินค้า',
    'GenercName': 'ชื่อสามัญทางยา',
    'FullName': 'ชื่อเต็มสินค้า',
    'DosageForm': 'รูปแบบยา',
    'Major Class': 'กลุ่มหลัก',
    'Sub Class': 'กลุ่มย่อย',
    'ราคาต้นทุน': '0.00',
    'ราคา OPD': '0.00'
  };
  return placeholders[fieldName] || '';
}

function renderExtraFields(category) {
  // Render fields that are not in predefined lists
  const predefinedFields = [...CORE_FIELDS, ...PRICE_FIELDS, ...CALCULATED_FIELDS, 
                           'row_id', 'created_at', 'updated_at', 'last_edited_by'];
  
  const extraFields = state.headers.filter(h => !predefinedFields.includes(h));
  
  if (extraFields.length === 0) return '';
  
  return `
    <div class="extra-fields">
      <h4>ข้อมูลเพิ่มเติม</h4>
      ${extraFields.map(field => createFieldHTML(field, getSelectedRow() || {}, READONLY_FIELDS.has(field))).join('')}
    </div>
  `;
}

function switchModalTab(tabName) {
  $$('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  
  $$('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabName}`);
  });
}

function closeModal() {
  const modal = $('#itemModal');
  const backdrop = $('#modalBackdrop');
  
  if (modal) modal.style.display = 'none';
  if (backdrop) backdrop.style.display = 'none';
  
  state.selectedRowId = null;
  state.modalMode = 'view';
  state.editing = false;
}

function getSelectedRow() {
  return state.rows.find(r => r.row_id === state.selectedRowId);
}

function blankRow() {
  const row = { row_id: '' };
  state.headers.forEach(header => {
    row[header] = '';
  });
  return row;
}

/* ====================== FORM HANDLING ====================== */
async function saveModalForm() {
  if (state.saving) return;
  
  const form = $('#modalForm');
  if (!form) return;
  
  // Collect form data
  const formData = new FormData(form);
  const payload = {};
  
  for (let [key, value] of formData.entries()) {
    if (!READONLY_FIELDS.has(key)) {
      // Convert number strings to actual numbers
      if (PRICE_FIELDS.includes(key) || key.includes('margin')) {
        payload[key] = value === '' ? '' : parseFloat(value) || 0;
      } else {
        payload[key] = value;
      }
    }
  }
  
  // Add row_id for edit mode
  if (state.modalMode === 'edit') {
    const selectedRow = getSelectedRow();
    if (selectedRow) {
      payload.row_id = selectedRow.row_id;
    }
  }
  
  // Validate required fields
  if (!payload.FullName && !payload.GenercName) {
    alert('กรุณากรอกชื่อสินค้า');
    return;
  }
  
  state.saving = true;
  setStatus('⏳ กำลังบันทึก...', 'busy');
  
  try {
    const action = state.modalMode === 'add' ? 'add' : 'save';
    const result = await submitPayload(action, payload);
    
    if (result.ok) {
      setStatus('✅ บันทึกสำเร็จ', 'ok');
      closeModal();
      await loadData({ showBusy: true });
    } else {
      throw new Error(result.error || 'การบันทึกล้มเหลว');
    }
  } catch (err) {
    setStatus(`❌ บันทึกไม่สำเร็จ: ${err.message}`, 'error');
    console.error('Save error:', err);
  } finally {
    state.saving = false;
  }
}

async function handleDelete() {
  const row = getSelectedRow();
  if (!row) return;
  
  const name = row.FullName || row.GenercName || row.item_code || 'รายการนี้';
  
  if (!confirm(`⚠️ ต้องการลบ "${name}" ใช่หรือไม่?\n\nการกระทำนี้ไม่สามารถเรียกคืนได้`)) {
    return;
  }
  
  setStatus('⏳ กำลังลบ...', 'busy');
  
  try {
    const result = await submitPayload('delete', { row_id: row.row_id });
    
    if (result.ok) {
      setStatus('✅ ลบสำเร็จ', 'ok');
      closeModal();
      await loadData({ showBusy: true });
    } else {
      throw new Error(result.error || 'การลบล้มเหลว');
    }
  } catch (err) {
    setStatus(`❌ ลบไม่สำเร็จ: ${err.message}`, 'error');
    console.error('Delete error:', err);
  }
}

/* ====================== API COMMUNICATION ====================== */
async function submitPayload(action, payload) {
  const token = CONFIG.APP_TOKEN || '';
  
  const params = new URLSearchParams({
    action: action,
    token: token
  });
  
  try {
    const response = await fetch(CONFIG.WEB_APP_URL, {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    });
    
    const text = await response.text();
    
    // Parse JSON (อาจถูกห่อด้วย callback function)
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      // Try to extract JSON from callback
      const match = text.match(/\((\{.*\})\)/);
      if (match) {
        json = JSON.parse(match[1]);
      } else {
        throw new Error('Invalid response format');
      }
    }
    
    return json;
  } catch (err) {
    console.error('Submit error:', err);
    throw err;
  }
}

function jsonp(action, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = 'callback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const url = new URL(CONFIG.WEB_APP_URL);
    
    url.searchParams.set('action', action);
    url.searchParams.set('callback', callbackName);
    
    // Add additional params
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined && params[key] !== null) {
        url.searchParams.set(key, params[key]);
      }
    });
    
    // Add token if exists
    if (CONFIG.APP_TOKEN) {
      url.searchParams.set('token', CONFIG.APP_TOKEN);
    }
    
    // Create callback
    window[callbackName] = function(data) {
      delete window[callbackName];
      document.head.removeChild(script);
      resolve(data);
    };
    
    // Create script tag
    const script = document.createElement('script');
    script.src = url.toString();
    script.onerror = function() {
      delete window[callbackName];
      document.head.removeChild(script);
      reject(new Error('JSONP request failed'));
    };
    
    document.head.appendChild(script);
    
    // Timeout
    setTimeout(() => {
      if (window[callbackName]) {
        delete window[callbackName];
        document.head.removeChild(script);
        reject(new Error('JSONP request timeout'));
      }
    }, 15000);
  });
}

/* ====================== CALCULATOR ====================== */
function calculatePricing() {
  const unitCost = parseFloat($('#calcUnitCost')?.value) || 0;
  const margin = parseFloat($('#calcMargin')?.value) || 0;
  
  if (unitCost > 0 && margin > 0) {
    const sellingPrice = unitCost / (1 - margin / 100);
    const profit = sellingPrice - unitCost;
    
    $('#calcResult').innerHTML = `
      <div class="calc-result">
        <div><strong>ราคาขาย:</strong> ${formatNumber(sellingPrice)} บาท</div>
        <div><strong>กำไรต่อหน่วย:</strong> ${formatNumber(profit)} บาท</div>
        <div><strong>Margin:</strong> ${margin.toFixed(2)}%</div>
      </div>
    `;
  }
}

/* ====================== TAB MANAGEMENT ====================== */
function switchTab(tabName) {
  state.activeTab = tabName;
  
  // Update tab buttons
  $$('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  
  // Show/hide content
  // Add your tab content switching logic here
  applySearchAndRender(); // Re-render with new tab filter if needed
}

/* ====================== UTILITY FUNCTIONS ====================== */
function formatNumber(val) {
  if (val == null || val === '') return '-';
  const num = parseFloat(val);
  if (isNaN(num)) return escapeHtml(String(val));
  
  return num.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatMargin(val) {
  if (val == null || val === '') return '-';
  const num = parseFloat(val);
  if (isNaN(num)) return escapeHtml(String(val));
  
  return num.toFixed(2) + '%';
}

function formatCellValue(val) {
  if (val == null || val === '') return '-';
  if (typeof val === 'number' || !isNaN(parseFloat(val))) {
    return formatNumber(val);
  }
  return escapeHtml(String(val));
}

function formatTime(isoString) {
  if (!isoString) return '-';
  
  try {
    const date = new Date(isoString);
    return date.toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return isoString;
  }
}

function getMarginClass(marginValue) {
  const margin = parseFloat(marginValue);
  if (isNaN(margin)) return '';
  if (margin >= 30) return 'margin-high';
  if (margin >= 20) return 'margin-good';
  if (margin >= 10) return 'margin-ok';
  return 'margin-low';
}

function escapeHtml(unsafe) {
  if (unsafe == null) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setStatus(text, type = 'info') {
  const el = $('#status');
  if (!el) return;
  
  el.textContent = text;
  el.className = `status ${type}`;
  
  // Auto-hide success messages
  if (type === 'ok' && text) {
    setTimeout(() => {
      if (el.textContent === text) {
        el.textContent = '';
        el.className = 'status';
      }
    }, 3000);
  }
}

function renderApiWarningIfNeeded() {
  if (!CONFIG.WEB_APP_URL || CONFIG.WEB_APP_URL.includes('PASTE')) {
    renderApiWarning(true);
  } else {
    renderApiWarning(false);
  }
}

function renderApiWarning(show) {
  const warning = $('#apiWarning');
  if (warning) {
    warning.style.display = show ? 'block' : 'none';
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/* ====================== EXPORT FOR DEBUG ====================== */
if (typeof window !== 'undefined') {
  window.appState = state;
  window.appActions = {
    loadData,
    selectRow,
    openModal,
    closeModal,
    saveModalForm,
    handleDelete
  };
}

console.log('%c✅ Drug Price App JS Loaded Successfully', 'color: green; font-weight: bold');
console.log('%c📋 Features:', 'color: blue');
console.log('  - Real-time search & filter');
console.log('  - Add/Edit/Delete items');
console.log('  - Price calculator');
console.log('  - Auto-refresh data');
console.log('  - Responsive design');
console.log('%c🔧 Debug: Use window.appState to inspect data', 'color: gray');
