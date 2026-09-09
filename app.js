(() => {
  'use strict';

  const CONFIG = window.DRUG_APP_CONFIG || {};
  const WEB_APP_URL = (CONFIG.WEB_APP_URL || '').trim();
  const APP_TOKEN = CONFIG.APP_TOKEN || '';
  const POLL_INTERVAL_MS = Number(CONFIG.POLL_INTERVAL_MS || 5000);
  const PAGE_SIZE = Number(CONFIG.PAGE_SIZE || 60);

  const F = {
    rowId: 'row_id',
    itemCode: 'item_code',
    fullName: 'FullName',
    generic: 'GenercName',
    cost: 'ราคาต้นทุน',
    opd: 'ราคา OPD',
    ipd: 'ราคา IPD',
    skyOpd: 'ราคา สกย. OPD',
    skyIpd: 'ราคา สกย. IPD',
    ipdForeign: 'ราคา IPD_Foreigner',
    opdForeign: 'ราคา OPD_Foreigner',
    nhso: 'nhso_heart_price',
    skyOpdDisc: 'ราคาสกย.OPD Discount 20%',
    skyIpdDisc: 'ราคา สกย.IPD Discount 20%',
    skyOpdAfterCost: 'OPD สกย. after discount -Cost',
    skyIpdAfterCost: 'ราคา IPD สกย After dis count - Cost',
    updatedAt: 'updated_at',
    createdAt: 'created_at'
  };

  const IMPORTANT_ORDER = [
    F.itemCode,
    F.fullName,
    F.generic,
    'Unit',
    'Strength',
    'DosageForm',
    F.cost,
    F.opd,
    F.ipd,
    F.skyOpd,
    F.skyIpd,
    F.opdForeign,
    F.ipdForeign,
    F.nhso,
    F.skyOpdDisc,
    F.skyIpdDisc,
    F.skyOpdAfterCost,
    F.skyIpdAfterCost,
    'gross_margin_opd',
    'gross_margin_ipd',
    'gross_margin_sky_opd',
    'gross_margin_sky_ipd',
    F.rowId,
    F.updatedAt,
    F.createdAt
  ];

  const PRICE_FIELDS = new Set([
    F.cost,
    F.opd,
    F.ipd,
    F.skyOpd,
    F.skyIpd,
    F.ipdForeign,
    F.opdForeign,
    F.nhso,
    F.skyOpdDisc,
    F.skyIpdDisc,
    F.skyOpdAfterCost,
    F.skyIpdAfterCost
  ]);

  const EDITABLE_EXCLUDE = new Set([F.rowId, F.updatedAt, F.createdAt, F.skyOpdDisc, F.skyIpdDisc, F.skyOpdAfterCost, F.skyIpdAfterCost]);

  const state = {
    headers: [],
    rows: [],
    filteredRows: [],
    visibleCount: PAGE_SIZE,
    current: null,
    isNew: false,
    saving: false,
    lastPayload: null,
    pollHandle: null
  };

  const excelState = {
    workbook: null,
    fileName: '',
    sheetNames: [],
    selectedSheet: '',
    excelHeaders: [],
    rawRows: [],
    processedRows: [],
    columnMapping: {},
    isImporting: false
  };

  const MAPPABLE_FIELDS = [
    { key: F.itemCode, label: 'รหัสยา (item_code) *', required: true, aliases: ['item_code', 'itemcode', 'code', 'รหัสยา', 'รหัส', 'barcode', 'รหัสสินค้า', 'item code'] },
    { key: F.fullName, label: 'ชื่อยา (FullName)', required: false, aliases: ['fullname', 'full_name', 'ชื่อยา', 'ชื่อทางการค้า', 'ชื่อการค้า', 'tradename', 'name', 'ชื่อ'] },
    { key: F.generic, label: 'ชื่อสามัญ (GenericName)', required: false, aliases: ['genercname', 'genericname', 'generic', 'ชื่อสามัญ', 'สามัญ', 'generic name'] },
    { key: 'DosageForm', label: 'รูปแบบยา (DosageForm)', required: false, aliases: ['dosageform', 'dosage_form', 'dosage form', 'form', 'รูปแบบ', 'รูปแบบยา'] },
    { key: 'Unit', label: 'หน่วย (Unit)', required: false, aliases: ['unit', 'หน่วย', 'หน่วยนับ', 'หน่วยบรรจุ'] },
    { key: 'Strength', label: 'ความแรง (Strength)', required: false, aliases: ['strength', 'ความแรง'] },
    { key: 'Major Class', label: 'หมวดหมู่หลัก (Major Class)', required: false, aliases: ['major class', 'major_class', 'majorclass', 'หมวดหลัก', 'กลุ่มยา'] },
    { key: 'Sub Class', label: 'หมวดหมู่ย่อย (Sub Class)', required: false, aliases: ['sub class', 'sub_class', 'subclass', 'หมวดย่อย'] },
    { key: F.cost, label: 'ราคาต้นทุน', required: false, aliases: ['ราคาต้นทุน', 'ต้นทุน', 'cost', 'ราคาซื้อ', 'cost_price', 'price_cost'] },
    { key: F.opd, label: 'ราคา OPD', required: false, aliases: ['ราคา opd', 'opd', 'ราคาขาย opd', 'opd_price', 'price_opd'] },
    { key: F.ipd, label: 'ราคา IPD', required: false, aliases: ['ราคา ipd', 'ipd', 'ราคาขาย ipd', 'ipd_price', 'price_ipd'] },
    { key: F.skyOpd, label: 'ราคา สกย. OPD', required: false, aliases: ['ราคา สกย. opd', 'ราคา สกย opd', 'สกย opd', 'sky opd', 'sky_opd', 'สกย. opd'] },
    { key: F.skyIpd, label: 'ราคา สกย. IPD', required: false, aliases: ['ราคา สกย. ipd', 'ราคา สกย ipd', 'สกย ipd', 'sky ipd', 'sky_ipd', 'สกย. ipd'] },
    { key: F.opdForeign, label: 'ราคา OPD ต่างชาติ', required: false, aliases: ['ราคา opd_foreigner', 'ราคา opd foreigner', 'opd ต่างชาติ', 'opd foreigner', 'opd_foreigner'] },
    { key: F.ipdForeign, label: 'ราคา IPD ต่างชาติ', required: false, aliases: ['ราคา ipd_foreigner', 'ราคา ipd foreigner', 'ipd ต่างชาติ', 'ipd foreigner', 'ipd_foreigner'] },
    { key: F.nhso, label: 'ราคา สปสช. (NHSO)', required: false, aliases: ['nhso_heart_price', 'nhso', 'ราคา nhso', 'สปสช', 'ราคา สปสช'] },
    { key: 'กลุ่มใบเสร็จ opd', label: 'กลุ่มใบเสร็จ OPD', required: false, aliases: ['กลุ่มใบเสร็จ opd', 'ใบเสร็จ opd'] },
    { key: 'กลุ่มใบเสร็จ ipd', label: 'กลุ่มใบเสร็จ IPD', required: false, aliases: ['กลุ่มใบเสร็จ ipd', 'ใบเสร็จ ipd'] },
    { key: 'กลุ่มใบเสร็จ New SIMB', label: 'กลุ่มใบเสร็จ New SIMB', required: false, aliases: ['กลุ่มใบเสร็จ new simb', 'new simb'] },
    { key: 'gross_margin_opd', label: 'Gross Margin OPD', required: false, aliases: ['gross_margin_opd', 'margin opd', 'gm opd'] },
    { key: 'gross_margin_ipd', label: 'Gross Margin IPD', required: false, aliases: ['gross_margin_ipd', 'margin ipd', 'gm ipd'] },
    { key: 'gross_margin_สกย_opd', label: 'Gross Margin สกย. OPD', required: false, aliases: ['gross_margin_สกย_opd', 'gross_margin_sky_opd', 'margin สกย opd', 'gm สกย opd'] },
    { key: 'gross_margin_สกย_ipd', label: 'Gross Margin สกย. IPD', required: false, aliases: ['gross_margin_สกย_ipd', 'gross_margin_sky_ipd', 'margin สกย ipd', 'gm สกย ipd'] },
    { key: 'gross_margin_ipd_foreigner', label: 'Gross Margin IPD ต่างชาติ', required: false, aliases: ['gross_margin_ipd_foreigner', 'gross_margin_ipd_foreign', 'margin ipd foreign'] },
    { key: 'gross_margin_opd_foreigner', label: 'Gross Margin OPD ต่างชาติ', required: false, aliases: ['gross_margin_opd_foreigner', 'gross_margin_opd_foreign', 'margin opd foreign'] },
    { key: 'gross_margin_nhso', label: 'Gross Margin สปสช.', required: false, aliases: ['gross_margin_nhso', 'margin nhso'] }
  ];

  const el = {
    syncStatus: byId('syncStatus'),
    syncText: byId('syncText'),
    syncTime: byId('syncTime'),
    searchInput: byId('searchInput'),
    refreshBtn: byId('refreshBtn'),
    addBtn: byId('addBtn'),
    exportExcelBtn: byId('exportExcelBtn'),
    uploadExcelBtn: byId('uploadExcelBtn'),
    totalCount: byId('totalCount'),
    filteredCount: byId('filteredCount'),
    negativeCount: byId('negativeCount'),
    cardGrid: byId('cardGrid'),
    loadMoreBtn: byId('loadMoreBtn'),
    dialog: byId('drugDialog'),
    modalMode: byId('modalMode'),
    modalTitle: byId('modalTitle'),
    modalSubtitle: byId('modalSubtitle'),
    detailGrid: byId('detailGrid'),
    negativeAlert: byId('negativeAlert'),
    closeModalBtn: byId('closeModalBtn'),
    saveBtn: byId('saveBtn'),
    saveBtnBottom: byId('saveBtnBottom'),
    autoPriceBtn: byId('autoPriceBtn'),
    toast: byId('toast'),
    calcCostA: byId('calcCostA'),
    calcMarginA: byId('calcMarginA'),
    calcPriceBtn: byId('calcPriceBtn'),
    calcPriceResult: byId('calcPriceResult'),
    calcCostB: byId('calcCostB'),
    calcSaleB: byId('calcSaleB'),
    calcMarginBtn: byId('calcMarginBtn'),
    calcMarginResult: byId('calcMarginResult'),
    currentUrl: byId('currentUrl'),
    pingBtn: byId('pingBtn'),
    copyDiagBtn: byId('copyDiagBtn'),
    diagBox: byId('diagBox'),
    floatingBackBtn: byId('floatingBackBtn'),
    // Excel Modal elements
    excelDialog: byId('excelDialog'),
    excelDropzone: byId('excelDropzone'),
    excelFileInput: byId('excelFileInput'),
    excelBrowseBtn: byId('excelBrowseBtn'),
    dropzonePrompt: byId('dropzonePrompt'),
    selectedFileInfo: byId('selectedFileInfo'),
    fileNameDisplay: byId('fileNameDisplay'),
    fileSizeDisplay: byId('fileSizeDisplay'),
    removeFileBtn: byId('removeFileBtn'),
    downloadTemplateBtn: byId('downloadTemplateBtn'),
    excelConfigSection: byId('excelConfigSection'),
    sheetSelectWrap: byId('sheetSelectWrap'),
    sheetSelect: byId('sheetSelect'),
    importModeSelect: byId('importModeSelect'),
    autoCalcPricesCheckbox: byId('autoCalcPricesCheckbox'),
    mappingDetails: byId('mappingDetails'),
    mappingGrid: byId('mappingGrid'),
    statTotalRows: byId('statTotalRows'),
    statNewRows: byId('statNewRows'),
    statUpdateRows: byId('statUpdateRows'),
    statWarningWrap: byId('statWarningWrap'),
    statWarningRows: byId('statWarningRows'),
    statInvalidWrap: byId('statInvalidWrap'),
    statInvalidRows: byId('statInvalidRows'),
    previewTableHead: byId('previewTableHead'),
    previewTableBody: byId('previewTableBody'),
    importProgressWrap: byId('importProgressWrap'),
    importProgressBar: byId('importProgressBar'),
    importProgressText: byId('importProgressText'),
    importProgressPercent: byId('importProgressPercent'),
    closeExcelModalBtn: byId('closeExcelModalBtn'),
    startImportBtn: byId('startImportBtn')
  };

  init();

  function init() {
    el.currentUrl.textContent = WEB_APP_URL || 'ยังไม่ได้ตั้งค่า WEB_APP_URL ใน config.js';
    bindEvents();

    if (!isConfigured()) {
      setStatus('error', 'ยังไม่ได้ตั้งค่า Apps Script URL', 'กรุณาแก้ไฟล์ config.js');
      renderEmpty('ยังไม่ได้ตั้งค่า WEB_APP_URL ใน config.js');
      return;
    }

    loadData({ manual: true });
    state.pollHandle = window.setInterval(() => loadData({ silent: true }), POLL_INTERVAL_MS);
  }

  function bindEvents() {
    document.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    el.searchInput.addEventListener('input', debounce(() => {
      state.visibleCount = PAGE_SIZE;
      filterRows();
      renderCards();
    }, 120));

    el.refreshBtn.addEventListener('click', () => loadData({ manual: true }));
    el.addBtn.addEventListener('click', openNewModal);
    if (el.exportExcelBtn) el.exportExcelBtn.addEventListener('click', exportCurrentDataToExcel);
    if (el.uploadExcelBtn) el.uploadExcelBtn.addEventListener('click', openExcelModal);
    el.loadMoreBtn.addEventListener('click', () => {
      state.visibleCount += PAGE_SIZE;
      renderCards();
    });

    el.closeModalBtn.addEventListener('click', () => el.dialog.close());
    el.saveBtn.addEventListener('click', saveCurrent);
    el.saveBtnBottom.addEventListener('click', saveCurrent);
    el.autoPriceBtn.addEventListener('click', autoFillPrices);

    el.calcPriceBtn.addEventListener('click', calculateSalePrice);
    el.calcMarginBtn.addEventListener('click', calculateGrossMargin);
    el.pingBtn.addEventListener('click', ping);
    el.copyDiagBtn.addEventListener('click', copyDiagnostics);

    // Excel Modal event bindings
    if (el.closeExcelModalBtn) el.closeExcelModalBtn.addEventListener('click', closeExcelModal);
    if (el.downloadTemplateBtn) el.downloadTemplateBtn.addEventListener('click', downloadExcelTemplate);
    if (el.excelBrowseBtn) el.excelBrowseBtn.addEventListener('click', () => el.excelFileInput && el.excelFileInput.click());
    if (el.excelFileInput) el.excelFileInput.addEventListener('change', handleExcelFileSelect);
    if (el.removeFileBtn) el.removeFileBtn.addEventListener('click', resetExcelUpload);
    if (el.sheetSelect) el.sheetSelect.addEventListener('change', onSheetChange);
    if (el.importModeSelect) el.importModeSelect.addEventListener('change', processExcelData);
    if (el.autoCalcPricesCheckbox) el.autoCalcPricesCheckbox.addEventListener('change', processExcelData);
    if (el.startImportBtn) el.startImportBtn.addEventListener('click', executeExcelImport);

    setupDropzone();

    if (el.floatingBackBtn) {
      el.floatingBackBtn.addEventListener('click', handleFloatingBack);
      window.addEventListener('scroll', debounce(updateFloatingBackButton, 80), { passive: true });
      window.addEventListener('resize', debounce(updateFloatingBackButton, 120));
    }

    el.dialog.addEventListener('close', updateFloatingBackButton);
    if (el.excelDialog) el.excelDialog.addEventListener('close', updateFloatingBackButton);
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function isConfigured() {
    return WEB_APP_URL && !WEB_APP_URL.includes('PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE');
  }

  function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabId));
    document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === tabId));
    updateFloatingBackButton();
  }

  function handleFloatingBack() {
    if (el.dialog && el.dialog.open) {
      el.dialog.close();
      return;
    }

    if (el.excelDialog && el.excelDialog.open) {
      closeExcelModal();
      return;
    }

    const activePanel = document.querySelector('.tab-panel.active');
    if (activePanel && activePanel.id !== 'databaseTab') {
      switchTab('databaseTab');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (window.scrollY > 120) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function updateFloatingBackButton() {
    if (!el.floatingBackBtn) return;

    const isMobile = window.matchMedia('(max-width: 760px)').matches;
    const activePanel = document.querySelector('.tab-panel.active');
    const shouldShow = isMobile && (
      (el.dialog && el.dialog.open) ||
      (el.excelDialog && el.excelDialog.open) ||
      (activePanel && activePanel.id !== 'databaseTab') ||
      window.scrollY > 120
    );

    el.floatingBackBtn.classList.toggle('hidden', !shouldShow);
  }

  async function loadData(options = {}) {
    if (!isConfigured()) return;
    if (!options.silent) setStatus('loading', 'กำลังโหลดข้อมูล...', 'กำลังเชื่อมต่อ Google Sheet');

    try {
      const payload = await jsonp('list', { token: APP_TOKEN });
      if (!payload || payload.ok === false) throw new Error(payload?.error || 'ไม่สามารถโหลดข้อมูลได้');

      state.lastPayload = payload;
      state.headers = Array.isArray(payload.headers) ? payload.headers.filter(Boolean) : [];
      state.rows = Array.isArray(payload.rows) ? payload.rows : [];
      state.visibleCount = options.silent ? state.visibleCount : PAGE_SIZE;
      filterRows();
      renderCards();
      updateSummary();
      updateFloatingBackButton();
      setStatus('ok', `โหลดข้อมูลแล้ว ${state.rows.length.toLocaleString()} รายการ`, new Date().toLocaleString('th-TH'));
    } catch (err) {
      setStatus('error', 'โหลดข้อมูลไม่สำเร็จ', err.message);
      renderDiagnostic(err);
      if (!options.silent) showToast(`โหลดข้อมูลไม่สำเร็จ: ${err.message}`, 'error');
    }
  }

  function jsonp(action, params = {}) {
    return new Promise((resolve, reject) => {
      const callbackName = `drugAppCb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Request timeout'));
      }, 20000);

      window[callbackName] = (data) => {
        cleanup();
        resolve(data);
      };

      const url = new URL(WEB_APP_URL);
      url.searchParams.set('action', action);
      url.searchParams.set('callback', callbackName);
      url.searchParams.set('_', Date.now().toString());
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
      });

      script.src = url.toString();
      script.onerror = () => {
        cleanup();
        reject(new Error('เชื่อมต่อ Apps Script ไม่ได้ กรุณาตรวจ URL / permission'));
      };
      document.body.appendChild(script);

      function cleanup() {
        window.clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
      }
    });
  }

  function postAction(action, payload) {
    const url = new URL(WEB_APP_URL);
    url.searchParams.set('action', action);
    if (APP_TOKEN) url.searchParams.set('token', APP_TOKEN);

    return fetch(url.toString(), {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: APP_TOKEN, action, payload })
    });
  }

  function filterRows() {
    const keyword = normalizeText(el.searchInput.value);
    if (!keyword) {
      state.filteredRows = [...state.rows];
      updateSummary();
      return;
    }

    state.filteredRows = state.rows.filter((row) => {
      const haystack = state.headers.map((h) => row[h]).join(' | ');
      return normalizeText(haystack).includes(keyword);
    });
    updateSummary();
  }

  function renderCards() {
    if (!state.filteredRows.length) {
      renderEmpty(el.searchInput.value ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีข้อมูล');
      el.loadMoreBtn.classList.add('hidden');
      return;
    }

    const rows = state.filteredRows.slice(0, state.visibleCount);
    el.cardGrid.innerHTML = rows.map((row, index) => cardTemplate(row, index)).join('');
    el.cardGrid.querySelectorAll('[data-open-index]').forEach((card) => {
      card.addEventListener('click', () => {
        const rowIndex = Number(card.dataset.openIndex);
        openEditModal(state.filteredRows[rowIndex]);
      });
    });

    el.loadMoreBtn.classList.toggle('hidden', state.visibleCount >= state.filteredRows.length);
  }

  function cardTemplate(row, index) {
    const title = safe(row[F.fullName]) || safe(row[F.generic]) || '(ไม่มีชื่อยา)';
    const code = safe(row[F.itemCode]) || safe(row[F.rowId]) || '-';
    const cost = fmtMoney(row[F.cost]);
    const opd = fmtMoney(row[F.opd]);
    const ipd = fmtMoney(row[F.ipd]);
    const gm = fmtPercent(grossMargin(row[F.cost], row[F.opd]));
    const neg = hasNegativeAfterDiscount(row);

    return `
      <article class="drug-card ${neg ? 'negative' : ''}" data-open-index="${index}" tabindex="0" role="button">
        <div class="card-top">
          <span class="pill">${escapeHtml(code)}</span>
          ${neg ? '<span class="pill danger">ต่ำกว่าทุน</span>' : ''}
        </div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(safe(row[F.generic]) || safe(row.GenercName) || safe(row.DosageForm) || safe(row.Unit) || 'คลิกเพื่อดูรายละเอียด')}</p>
        <div class="price-row">
          <span><small>Cost</small><strong>${cost}</strong></span>
          <span><small>OPD</small><strong>${opd}</strong></span>
          <span><small>IPD</small><strong>${ipd}</strong></span>
        </div>
        <div class="gm-line">GM OPD: ${gm}</div>
      </article>
    `;
  }

  function renderEmpty(message) {
    el.cardGrid.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function updateSummary() {
    el.totalCount.textContent = state.rows.length.toLocaleString();
    el.filteredCount.textContent = state.filteredRows.length.toLocaleString();
    el.negativeCount.textContent = state.rows.filter(hasNegativeAfterDiscount).length.toLocaleString();
  }

  function openEditModal(row) {
    state.isNew = false;
    state.current = { ...row };
    openModal('รายละเอียด / แก้ไข', row);
  }

  function openNewModal() {
    state.isNew = true;
    const blank = {};
    const headers = ensureHeadersForForm();
    headers.forEach((h) => { blank[h] = ''; });
    blank[F.rowId] = '';
    state.current = blank;
    openModal('เพิ่มรายการใหม่', blank);
  }

  function ensureHeadersForForm() {
    const base = state.headers.length ? [...state.headers] : [
      F.rowId,
      F.itemCode,
      F.fullName,
      F.generic,
      'Unit',
      'Strength',
      'DosageForm',
      F.cost,
      F.opd,
      F.ipd,
      F.skyOpd,
      F.skyIpd,
      F.opdForeign,
      F.ipdForeign,
      F.nhso,
      F.skyOpdDisc,
      F.skyIpdDisc,
      F.skyOpdAfterCost,
      F.skyIpdAfterCost,
      F.updatedAt,
      F.createdAt
    ];
    return unique([...IMPORTANT_ORDER, ...base]).filter(Boolean);
  }

  function openModal(mode, row) {
    const title = safe(row[F.fullName]) || safe(row[F.itemCode]) || 'รายการใหม่';
    el.modalMode.textContent = mode;
    el.modalTitle.textContent = title;
    el.modalSubtitle.textContent = `${safe(row[F.itemCode]) || '-'} · Cost ${fmtMoney(row[F.cost])}`;
    renderDetailForm();
    updateNegativeAlert();
    el.dialog.showModal();
    updateFloatingBackButton();
  }

  function renderDetailForm() {
    const headers = ensureHeadersForForm();
    const computed = computeFields(state.current || {});

    el.detailGrid.innerHTML = headers.map((header) => {
      const value = Object.prototype.hasOwnProperty.call(computed, header) ? computed[header] : state.current[header];
      const displayValue = value === undefined || value === null || value === '' ? '' : String(value);
      const isReadOnly = EDITABLE_EXCLUDE.has(header);
      const isNumber = isNumericField(header);
      const classes = [isReadOnly ? 'readonly' : '', isImportantField(header) ? 'important' : ''].join(' ');

      return `
        <label class="field ${classes}" data-field-wrap="${escapeAttr(header)}">
          <span>${escapeHtml(header)}</span>
          <input
            data-field="${escapeAttr(header)}"
            type="${isNumber ? 'number' : 'text'}"
            step="${isNumber ? '0.01' : ''}"
            value="${escapeAttr(displayValue)}"
            ${isReadOnly ? 'readonly' : ''}
            placeholder="-"
          />
        </label>
      `;
    }).join('');

    el.detailGrid.querySelectorAll('input[data-field]').forEach((input) => {
      input.addEventListener('input', () => {
        const field = input.dataset.field;
        state.current[field] = input.value;
        refreshComputedFields();
      });
    });
  }

  function refreshComputedFields() {
    const computed = computeFields(state.current || {});
    Object.entries(computed).forEach(([field, value]) => {
      const input = el.detailGrid.querySelector(`input[data-field="${cssEscape(field)}"]`);
      if (input && input.readOnly) input.value = value === '' || value === null || value === undefined ? '' : String(value);
      state.current[field] = value;
    });
    updateNegativeAlert();
  }

  function autoFillPrices() {
    if (!state.current) return;

    const skyOpd = toNumber(state.current[F.skyOpd]);
    const skyIpd = toNumber(state.current[F.skyIpd]);
    const opd = toNumber(state.current[F.opd]);

    if (skyOpd !== null) state.current[F.opd] = round2(skyOpd);
    const finalOpd = toNumber(state.current[F.opd]) ?? opd ?? 0;

    if (skyIpd !== null) {
      state.current[F.ipd] = round2(skyIpd);
    } else if (finalOpd > 0) {
      state.current[F.ipd] = round2(finalOpd * 1.3);
    }

    const finalIpd = toNumber(state.current[F.ipd]) ?? 0;
    if (finalOpd > 0) state.current[F.opdForeign] = round2(finalOpd * 1.3);
    if (finalIpd > 0) state.current[F.ipdForeign] = round2(finalIpd * 1.3);

    renderDetailForm();
    updateNegativeAlert();
    showToast('คำนวณราคาอัตโนมัติแล้ว');
  }

  function computeFields(row) {
    const cost = toNumber(row[F.cost]);
    const skyOpd = toNumber(row[F.skyOpd]);
    const skyIpd = toNumber(row[F.skyIpd]);
    const opd = toNumber(row[F.opd]);
    const ipd = toNumber(row[F.ipd]);
    const opdForeign = toNumber(row[F.opdForeign]);
    const ipdForeign = toNumber(row[F.ipdForeign]);
    const nhso = toNumber(row[F.nhso]);

    const result = {};
    if (skyOpd !== null) result[F.skyOpdDisc] = round2(skyOpd * 0.8);
    if (skyIpd !== null) result[F.skyIpdDisc] = round2(skyIpd * 0.8);
    if (result[F.skyOpdDisc] !== undefined && cost !== null) result[F.skyOpdAfterCost] = round2(result[F.skyOpdDisc] - cost);
    if (result[F.skyIpdDisc] !== undefined && cost !== null) result[F.skyIpdAfterCost] = round2(result[F.skyIpdDisc] - cost);
    if (cost !== null && opd !== null) result.gross_margin_opd = round2(grossMargin(cost, opd));
    if (cost !== null && ipd !== null) result.gross_margin_ipd = round2(grossMargin(cost, ipd));
    if (cost !== null && skyOpd !== null) {
      result['gross_margin_สกย_opd'] = round2(grossMargin(cost, skyOpd));
      result.gross_margin_sky_opd = result['gross_margin_สกย_opd'];
    }
    if (cost !== null && skyIpd !== null) {
      result['gross_margin_สกย_ipd'] = round2(grossMargin(cost, skyIpd));
      result.gross_margin_sky_ipd = result['gross_margin_สกย_ipd'];
    }
    if (cost !== null && opdForeign !== null) result['gross_margin_opd_foreigner'] = round2(grossMargin(cost, opdForeign));
    if (cost !== null && ipdForeign !== null) result['gross_margin_ipd_foreigner'] = round2(grossMargin(cost, ipdForeign));
    if (cost !== null && nhso !== null) result['gross_margin_nhso'] = round2(grossMargin(cost, nhso));
    return result;
  }

  function updateNegativeAlert() {
    const row = { ...(state.current || {}), ...computeFields(state.current || {}) };
    const messages = [];
    const opdAfter = toNumber(row[F.skyOpdAfterCost]);
    const ipdAfter = toNumber(row[F.skyIpdAfterCost]);
    if (opdAfter !== null && opdAfter < 0) messages.push(`${F.skyOpdAfterCost} = ${fmtMoney(opdAfter)}`);
    if (ipdAfter !== null && ipdAfter < 0) messages.push(`${F.skyIpdAfterCost} = ${fmtMoney(ipdAfter)}`);

    if (messages.length) {
      el.negativeAlert.innerHTML = `<strong>คำเตือน:</strong> ราคาหลัง Discount ต่ำกว่าทุน<br>${messages.map(escapeHtml).join('<br>')}`;
      el.negativeAlert.classList.remove('hidden');
    } else {
      el.negativeAlert.classList.add('hidden');
      el.negativeAlert.innerHTML = '';
    }
  }

  async function saveCurrent() {
    if (!state.current || state.saving) return;
    refreshComputedFields();

    const merged = { ...(state.current || {}), ...computeFields(state.current || {}) };
    if (hasNegativeAfterDiscount(merged)) {
      const ok = window.confirm('พบราคาหลัง Discount ต่ำกว่าทุน ต้องการบันทึกต่อหรือไม่?');
      if (!ok) return;
    }

    state.saving = true;
    el.saveBtn.disabled = true;
    el.saveBtnBottom.disabled = true;
    setStatus('loading', 'กำลังบันทึก...', 'ส่งข้อมูลไป Google Sheet');

    try {
      await postAction(state.isNew ? 'add' : 'save', merged);
      showToast('บันทึกแล้ว กำลังโหลดข้อมูลล่าสุด...');
      await delay(1200);
      await loadData({ manual: true });
      el.dialog.close();
    } catch (err) {
      showToast(`บันทึกไม่สำเร็จ: ${err.message}`, 'error');
      setStatus('error', 'บันทึกไม่สำเร็จ', err.message);
    } finally {
      state.saving = false;
      el.saveBtn.disabled = false;
      el.saveBtnBottom.disabled = false;
    }
  }

  function hasNegativeAfterDiscount(row) {
    const computed = computeFields(row || {});
    const opdAfter = toNumber(row[F.skyOpdAfterCost] ?? computed[F.skyOpdAfterCost]);
    const ipdAfter = toNumber(row[F.skyIpdAfterCost] ?? computed[F.skyIpdAfterCost]);
    return (opdAfter !== null && opdAfter < 0) || (ipdAfter !== null && ipdAfter < 0);
  }

  function calculateSalePrice() {
    const cost = toNumber(el.calcCostA.value);
    const margin = toNumber(el.calcMarginA.value);
    if (cost === null || margin === null || margin >= 100) {
      el.calcPriceResult.textContent = 'กรุณากรอกต้นทุน และ GM น้อยกว่า 100%';
      return;
    }
    const sale = cost / (1 - margin / 100);
    el.calcPriceResult.textContent = `ราคาขายที่ควรตั้ง = ${fmtMoney(sale)}`;
  }

  function calculateGrossMargin() {
    const cost = toNumber(el.calcCostB.value);
    const sale = toNumber(el.calcSaleB.value);
    if (cost === null || sale === null || sale <= 0) {
      el.calcMarginResult.textContent = 'กรุณากรอกต้นทุน และราคาขายมากกว่า 0';
      return;
    }
    el.calcMarginResult.textContent = `Gross Margin = ${fmtPercent(grossMargin(cost, sale))}`;
  }

  async function ping() {
    try {
      const payload = await jsonp('ping', { token: APP_TOKEN });
      el.diagBox.textContent = JSON.stringify(payload, null, 2);
      showToast(payload.ok ? 'เชื่อมต่อ Apps Script สำเร็จ' : 'Apps Script ตอบกลับ error', payload.ok ? 'ok' : 'error');
    } catch (err) {
      renderDiagnostic(err);
      showToast(`ทดสอบไม่สำเร็จ: ${err.message}`, 'error');
    }
  }

  async function copyDiagnostics() {
    const data = {
      url: WEB_APP_URL,
      rows: state.rows.length,
      headers: state.headers,
      lastPayloadKeys: state.lastPayload ? Object.keys(state.lastPayload) : [],
      time: new Date().toISOString()
    };
    const text = JSON.stringify(data, null, 2);
    el.diagBox.textContent = text;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copy diagnostics แล้ว');
    } catch {
      showToast('แสดง diagnostics ในกล่องด้านล่างแล้ว');
    }
  }

  function renderDiagnostic(err) {
    el.diagBox.textContent = JSON.stringify({
      error: err.message,
      url: WEB_APP_URL,
      hint: 'ตรวจสอบ config.js, Apps Script permission, Deploy URL /exec, SHEET_NAME'
    }, null, 2);
  }

  function setStatus(type, text, timeText) {
    el.syncStatus.className = `status-dot ${type}`;
    el.syncText.textContent = text;
    el.syncTime.textContent = timeText || '';
  }

  function showToast(message, type = 'ok') {
    el.toast.textContent = message;
    el.toast.className = `toast ${type}`;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => el.toast.classList.add('hidden'), 3000);
  }

  function isNumericField(header) {
    return PRICE_FIELDS.has(header) || header.includes('ราคา') || header.includes('Cost') || header.includes('cost') || header.startsWith('gross_margin') || header === F.nhso;
  }

  function isImportantField(header) {
    return IMPORTANT_ORDER.includes(header) || PRICE_FIELDS.has(header) || header.startsWith('gross_margin');
  }

  function grossMargin(cost, sale) {
    const c = toNumber(cost);
    const s = toNumber(sale);
    if (c === null || s === null || s === 0) return null;
    return 100 * ((s - c) / s);
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const cleaned = String(value).replace(/,/g, '').trim();
    if (cleaned === '') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function round2(value) {
    const n = toNumber(value);
    if (n === null) return '';
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function fmtMoney(value) {
    const n = toNumber(value);
    if (n === null) return '-';
    return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtPercent(value) {
    const n = toNumber(value);
    if (n === null) return '-';
    return `${n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }

  function safe(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
  }

  function normalizeText(value) {
    return String(value || '').toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();
  }

  function unique(arr) {
    return [...new Set(arr.filter(Boolean))];
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll('`', '&#096;');
  }

  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/"/g, '\\"');
  }

  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), wait);
    };
  }

  // ==========================================
  // Excel Upload, Import & Export Engine
  // ==========================================

  function openExcelModal() {
    if (!el.excelDialog) return;
    el.excelDialog.showModal();
    updateFloatingBackButton();
  }

  function closeExcelModal() {
    if (!el.excelDialog) return;
    if (excelState.isImporting) {
      const ok = window.confirm('ระบบกำลังนำเข้าข้อมูลอยู่ ต้องการปิดหน้าต่างหรือไม่?');
      if (!ok) return;
    }
    el.excelDialog.close();
    updateFloatingBackButton();
  }

  function resetExcelUpload() {
    excelState.workbook = null;
    excelState.fileName = '';
    excelState.sheetNames = [];
    excelState.selectedSheet = '';
    excelState.excelHeaders = [];
    excelState.rawRows = [];
    excelState.processedRows = [];
    excelState.columnMapping = {};
    excelState.isImporting = false;

    if (el.excelFileInput) el.excelFileInput.value = '';
    if (el.dropzonePrompt) el.dropzonePrompt.classList.remove('hidden');
    if (el.selectedFileInfo) el.selectedFileInfo.classList.add('hidden');
    if (el.excelConfigSection) el.excelConfigSection.classList.add('hidden');
    if (el.importProgressWrap) el.importProgressWrap.classList.add('hidden');
    if (el.startImportBtn) el.startImportBtn.disabled = true;
  }

  function setupDropzone() {
    if (!el.excelDropzone) return;

    ['dragenter', 'dragover'].forEach((eventName) => {
      el.excelDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.excelDropzone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      el.excelDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.excelDropzone.classList.remove('dragover');
      }, false);
    });

    el.excelDropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt && dt.files;
      if (files && files.length) {
        parseExcelFile(files[0]);
      }
    });
  }

  function handleExcelFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (file) parseExcelFile(file);
  }

  function parseExcelFile(file) {
    if (!window.XLSX) {
      showToast('ไม่พบคลัง SheetJS กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต', 'error');
      return;
    }

    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const nameLower = file.name.toLowerCase();
    const isValid = validExtensions.some((ext) => nameLower.endsWith(ext));
    if (!isValid) {
      showToast('กรุณาเลือกไฟล์ .xlsx, .xls หรือ .csv เท่านั้น', 'error');
      return;
    }

    excelState.fileName = file.name;
    if (el.fileNameDisplay) el.fileNameDisplay.textContent = file.name;
    if (el.fileSizeDisplay) el.fileSizeDisplay.textContent = formatBytes(file.size);
    if (el.dropzonePrompt) el.dropzonePrompt.classList.add('hidden');
    if (el.selectedFileInfo) el.selectedFileInfo.classList.remove('hidden');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        excelState.workbook = workbook;
        excelState.sheetNames = workbook.SheetNames || [];

        if (!excelState.sheetNames.length) {
          throw new Error('ไม่พบแผ่นงาน (Sheet) ในไฟล์ Excel นี้');
        }

        // Setup Sheet Selector
        if (el.sheetSelect) {
          el.sheetSelect.innerHTML = excelState.sheetNames.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
          if (el.sheetSelectWrap) {
            el.sheetSelectWrap.classList.toggle('hidden', excelState.sheetNames.length <= 1);
          }
        }
        excelState.selectedSheet = excelState.sheetNames[0];

        loadSheetData(excelState.selectedSheet);
      } catch (err) {
        showToast('อ่านไฟล์ไม่สำเร็จ: ' + err.message, 'error');
        resetExcelUpload();
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function onSheetChange(e) {
    const sheetName = e.target.value;
    if (sheetName && excelState.sheetNames.includes(sheetName)) {
      excelState.selectedSheet = sheetName;
      loadSheetData(sheetName);
    }
  }

  function loadSheetData(sheetName) {
    if (!excelState.workbook) return;
    const worksheet = excelState.workbook.Sheets[sheetName];
    if (!worksheet) return;

    const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    if (!rawRows.length) {
      showToast('ไม่พบแถวข้อมูลในแผ่นงานนี้', 'error');
      if (el.excelConfigSection) el.excelConfigSection.classList.add('hidden');
      if (el.startImportBtn) el.startImportBtn.disabled = true;
      return;
    }

    // Sanitize row keys by trimming whitespace and newlines (\r, \n)
    const sanitizedRows = rawRows.map((r) => {
      const clean = {};
      Object.entries(r).forEach(([k, v]) => {
        clean[String(k || '').trim()] = v;
      });
      return clean;
    });

    excelState.rawRows = sanitizedRows;
    const headers = Object.keys(sanitizedRows[0] || {});
    excelState.excelHeaders = headers;

    autoMapColumns(headers);
    renderMappingGrid();
    processExcelData();

    if (el.excelConfigSection) el.excelConfigSection.classList.remove('hidden');
  }

  function autoMapColumns(headers) {
    const mapping = {};
    const normHeaders = headers.map((h) => ({
      original: h,
      clean: normalizeText(h).replace(/[^a-z0-9\u0e00-\u0e7f]/g, '')
    }));

    MAPPABLE_FIELDS.forEach((field) => {
      // 1. Exact match
      const exact = headers.find((h) => h.trim() === field.key || h.trim().toLowerCase() === field.key.toLowerCase());
      if (exact) {
        mapping[field.key] = exact;
        return;
      }

      // 2. Alias match
      for (const alias of field.aliases) {
        const cleanAlias = normalizeText(alias).replace(/[^a-z0-9\u0e00-\u0e7f]/g, '');
        const matched = normHeaders.find((h) => h.clean === cleanAlias || h.clean.includes(cleanAlias) || cleanAlias.includes(h.clean));
        if (matched) {
          mapping[field.key] = matched.original;
          return;
        }
      }

      mapping[field.key] = '';
    });

    excelState.columnMapping = mapping;
  }

  function renderMappingGrid() {
    if (!el.mappingGrid) return;

    const optionsHtml = ['<option value="">-- ไม่ระบุ (เว้นว่าง) --</option>']
      .concat(excelState.excelHeaders.map((h) => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`))
      .join('');

    el.mappingGrid.innerHTML = MAPPABLE_FIELDS.map((field) => {
      const selectedCol = excelState.columnMapping[field.key] || '';
      return `
        <div class="mapping-row">
          <label for="map_${escapeAttr(field.key)}">${escapeHtml(field.label)}</label>
          <select id="map_${escapeAttr(field.key)}" data-field-key="${escapeAttr(field.key)}" class="form-select">
            ${optionsHtml}
          </select>
        </div>
      `;
    }).join('');

    // Set selected values & attach listeners
    el.mappingGrid.querySelectorAll('select[data-field-key]').forEach((sel) => {
      const fieldKey = sel.dataset.fieldKey;
      if (excelState.columnMapping[fieldKey]) {
        sel.value = excelState.columnMapping[fieldKey];
      }
      sel.addEventListener('change', () => {
        excelState.columnMapping[fieldKey] = sel.value;
        processExcelData();
      });
    });
  }

  function processExcelData() {
    const mapping = excelState.columnMapping;
    const mode = el.importModeSelect ? el.importModeSelect.value : 'upsert';
    const autoCalc = el.autoCalcPricesCheckbox ? el.autoCalcPricesCheckbox.checked : true;

    // Index existing database rows by item_code (lowercase)
    const existingCodeMap = new Map();
    state.rows.forEach((r) => {
      const code = String(r[F.itemCode] || '').trim().toLowerCase();
      if (code) existingCodeMap.set(code, r);
    });

    let newCount = 0;
    let updateCount = 0;
    let warningCount = 0;
    let invalidCount = 0;

    const processed = [];

    excelState.rawRows.forEach((rawRow, idx) => {
      const row = {};
      MAPPABLE_FIELDS.forEach((f) => {
        const excelCol = mapping[f.key];
        const val = (excelCol && rawRow[excelCol] !== undefined) ? String(rawRow[excelCol]).trim() : '';
        row[f.key] = val;
      });

      // Pass through any other database columns present in rawRow if not already set
      if (state.headers && state.headers.length) {
        state.headers.forEach((h) => {
          if ((row[h] === undefined || row[h] === '') && rawRow[h] !== undefined && rawRow[h] !== '') {
            row[h] = String(rawRow[h]).trim();
          }
        });
      }

      // Synchronize GenercName and GenericName
      if (row.GenericName && !row.GenercName) row.GenercName = row.GenericName;
      if (row.GenercName && !row.GenericName) row.GenericName = row.GenercName;

      const itemCode = String(row[F.itemCode] || '').trim();
      if (!itemCode) {
        invalidCount++;
        return; // Skip rows without item_code
      }

      const existing = existingCodeMap.get(itemCode.toLowerCase());
      const isUpdate = !!existing;

      // Filter by import mode
      if (mode === 'add' && isUpdate) return;
      if (mode === 'update' && !isUpdate) return;

      if (isUpdate) {
        row[F.rowId] = existing[F.rowId] || '';
        row[F.createdAt] = existing[F.createdAt] || '';
        updateCount++;
      } else {
        newCount++;
      }

      // Auto-fill and compute pricing
      if (autoCalc) {
        const skyOpd = toNumber(row[F.skyOpd]);
        const skyIpd = toNumber(row[F.skyIpd]);
        const currentOpd = toNumber(row[F.opd]);

        if (skyOpd !== null && (row[F.opd] === '' || row[F.opd] === undefined)) {
          row[F.opd] = round2(skyOpd);
        }
        const opdVal = toNumber(row[F.opd]) ?? currentOpd ?? 0;

        if (skyIpd !== null && (row[F.ipd] === '' || row[F.ipd] === undefined)) {
          row[F.ipd] = round2(skyIpd);
        } else if (opdVal > 0 && (row[F.ipd] === '' || row[F.ipd] === undefined)) {
          row[F.ipd] = round2(opdVal * 1.3);
        }

        const ipdVal = toNumber(row[F.ipd]) ?? 0;
        if (opdVal > 0 && (row[F.opdForeign] === '' || row[F.opdForeign] === undefined)) {
          row[F.opdForeign] = round2(opdVal * 1.3);
        }
        if (ipdVal > 0 && (row[F.ipdForeign] === '' || row[F.ipdForeign] === undefined)) {
          row[F.ipdForeign] = round2(ipdVal * 1.3);
        }

        const computed = computeFields(row);
        Object.assign(row, computed);
      } else {
        const computed = computeFields(row);
        Object.assign(row, computed);
      }

      const hasNeg = hasNegativeAfterDiscount(row);
      if (hasNeg) warningCount++;

      row._isUpdate = isUpdate;
      row._hasNegative = hasNeg;
      row._rawIndex = idx + 1;

      processed.push(row);
    });

    excelState.processedRows = processed;

    // Update statistics chips
    if (el.statTotalRows) el.statTotalRows.textContent = excelState.rawRows.length.toLocaleString();
    if (el.statNewRows) el.statNewRows.textContent = newCount.toLocaleString();
    if (el.statUpdateRows) el.statUpdateRows.textContent = updateCount.toLocaleString();

    if (el.statWarningWrap) {
      el.statWarningWrap.classList.toggle('hidden', warningCount === 0);
      if (el.statWarningRows) el.statWarningRows.textContent = warningCount.toLocaleString();
    }

    if (el.statInvalidWrap) {
      el.statInvalidWrap.classList.toggle('hidden', invalidCount === 0);
      if (el.statInvalidRows) el.statInvalidRows.textContent = invalidCount.toLocaleString();
    }

    if (el.startImportBtn) el.startImportBtn.disabled = processed.length === 0;

    renderPreviewTable();
  }

  function renderPreviewTable() {
    if (!el.previewTableHead || !el.previewTableBody) return;

    const rows = excelState.processedRows.slice(0, 10);
    if (!rows.length) {
      el.previewTableHead.innerHTML = '';
      el.previewTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--muted)">ไม่มีรายการที่ตรงกับเงื่อนไขการนำเข้า</td></tr>';
      return;
    }

    el.previewTableHead.innerHTML = `
      <tr>
        <th>สถานะ</th>
        <th>รหัสยา (item_code)</th>
        <th>ชื่อยา (FullName)</th>
        <th>ราคาต้นทุน</th>
        <th>ราคา OPD</th>
        <th>ราคา IPD</th>
        <th>GM OPD</th>
      </tr>
    `;

    el.previewTableBody.innerHTML = rows.map((r) => {
      const badgeClass = r._isUpdate ? 'update' : 'new';
      const badgeText = r._isUpdate ? 'อัปเดตเดิม' : 'เพิ่มใหม่';
      const warnBadge = r._hasNegative ? '<span class="badge warning">ต่ำกว่าทุน</span>' : '';

      return `
        <tr>
          <td><span class="badge ${badgeClass}">${badgeText}</span> ${warnBadge}</td>
          <td><strong>${escapeHtml(r[F.itemCode] || '-')}</strong></td>
          <td>${escapeHtml(r[F.fullName] || r[F.generic] || '-')}</td>
          <td>${fmtMoney(r[F.cost])}</td>
          <td>${fmtMoney(r[F.opd])}</td>
          <td>${fmtMoney(r[F.ipd])}</td>
          <td>${fmtPercent(r.gross_margin_opd)}</td>
        </tr>
      `;
    }).join('');
  }

  function updateImportProgress(current, total, text) {
    if (!el.importProgressBar || !el.importProgressPercent || !el.importProgressText) return;
    const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
    el.importProgressBar.style.width = `${percent}%`;
    el.importProgressPercent.textContent = `${percent}%`;
    el.importProgressText.textContent = text || '';
  }

  async function executeExcelImport() {
    if (excelState.isImporting || !excelState.processedRows.length) return;

    const rows = excelState.processedRows;
    const warningCount = rows.filter((r) => r._hasNegative).length;
    if (warningCount > 0) {
      const ok = window.confirm(`พบรายการที่ราคาหลัง Discount ต่ำกว่าทุน ${warningCount} รายการ ยืนยันการบันทึกหรือไม่?`);
      if (!ok) return;
    }

    excelState.isImporting = true;
    if (el.startImportBtn) el.startImportBtn.disabled = true;
    if (el.closeExcelModalBtn) el.closeExcelModalBtn.disabled = true;
    if (el.importProgressWrap) el.importProgressWrap.classList.remove('hidden');

    updateImportProgress(0, rows.length, 'กำลังเตรียมนำเข้าข้อมูล...');

    const CHUNK_SIZE = 50;
    const chunks = [];
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      chunks.push(rows.slice(i, i + CHUNK_SIZE));
    }

    let completed = 0;
    let fallbackMode = false;

    // Test sending first chunk via batch_import
    try {
      updateImportProgress(0, rows.length, `กำลังส่งข้อมูลชุดที่ 1 / ${chunks.length} ไปยัง Google Sheet...`);
      await postBatchImportChunk(chunks[0], el.importModeSelect ? el.importModeSelect.value : 'upsert');
      completed += chunks[0].length;
      updateImportProgress(completed, rows.length, `นำเข้าสำเร็จแล้ว ${completed} / ${rows.length} รายการ...`);
    } catch (err) {
      console.warn('batch_import failed or not supported, falling back to sequential save/add:', err);
      fallbackMode = true;
    }

    if (fallbackMode) {
      updateImportProgress(0, rows.length, 'กำลังนำเข้าแบบแยกรายการ (Compatibility Mode)...');
      completed = 0;
      for (let i = 0; i < rows.length; i++) {
        const item = rows[i];
        const action = item._isUpdate ? 'save' : 'add';
        try {
          await postAction(action, item);
          completed++;
          if (completed % 5 === 0 || completed === rows.length) {
            updateImportProgress(completed, rows.length, `กำลังบันทึก ${completed} / ${rows.length} รายการ...`);
          }
          await delay(200); // Friendly pacing for GAS
        } catch (err) {
          console.error('Error importing item:', item, err);
        }
      }
    } else {
      // Continue remaining chunks with batch_import
      for (let c = 1; c < chunks.length; c++) {
        updateImportProgress(completed, rows.length, `กำลังนำเข้าชุดที่ ${c + 1} / ${chunks.length}...`);
        await postBatchImportChunk(chunks[c], el.importModeSelect ? el.importModeSelect.value : 'upsert');
        completed += chunks[c].length;
        updateImportProgress(completed, rows.length, `นำเข้าแล้ว ${completed} / ${rows.length} รายการ...`);
        await delay(300);
      }
    }

    updateImportProgress(rows.length, rows.length, 'นำเข้าข้อมูลเสร็จสมบูรณ์! กำลังรีเฟรชฐานข้อมูล...');
    showToast(`นำเข้าสำเร็จ ${completed.toLocaleString()} รายการ!`, 'ok');

    await delay(1500);
    await loadData({ manual: true });

    excelState.isImporting = false;
    if (el.closeExcelModalBtn) el.closeExcelModalBtn.disabled = false;
    resetExcelUpload();
    if (el.excelDialog) el.excelDialog.close();
    updateFloatingBackButton();
  }

  function postBatchImportChunk(items, mode) {
    const url = new URL(WEB_APP_URL);
    url.searchParams.set('action', 'batch_import');
    if (APP_TOKEN) url.searchParams.set('token', APP_TOKEN);

    return fetch(url.toString(), {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: APP_TOKEN, action: 'batch_import', payload: { items, mode } })
    });
  }

  function downloadExcelTemplate() {
    if (!window.XLSX) {
      showToast('ไม่พบคลัง SheetJS สำหรับสร้างแม่แบบ Excel', 'error');
      return;
    }

    const templateData = [
      {
        'item_code': '42161608000039',
        'FullName': 'Paracetamol 500 mg Tablet',
        'GenercName': 'Paracetamol',
        'DosageForm': 'TAB',
        'Unit': 'เม็ด',
        'Strength': '500 mg',
        'Major Class': '01.Analgesics & Antipyretics',
        'Sub Class': 'Paracetamol',
        'ราคาต้นทุน': 0.50,
        'ราคา OPD': 1.50,
        'ราคา IPD': 1.80,
        'ราคา สกย. OPD': 1.50,
        'ราคา สกย. IPD': 1.80,
        'ราคา OPD_Foreigner': 2.00,
        'ราคา IPD_Foreigner': 2.30,
        'nhso_heart_price': 1.20
      },
      {
        'item_code': '51142927000001',
        'FullName': 'Amoxicillin 500 mg Capsule',
        'GenercName': 'Amoxicillin',
        'DosageForm': 'CAP',
        'Unit': 'แคปซูล',
        'Strength': '500 mg',
        'Major Class': '08.Anti-Infectives',
        'Sub Class': 'Penicillins',
        'ราคาต้นทุน': 1.80,
        'ราคา OPD': 4.00,
        'ราคา IPD': 5.00,
        'ราคา สกย. OPD': 4.00,
        'ราคา สกย. IPD': 5.00,
        'ราคา OPD_Foreigner': 6.00,
        'ราคา IPD_Foreigner': 7.00,
        'nhso_heart_price': 3.50
      },
      {
        'item_code': '51022060406008',
        'FullName': 'Omeprazole 20 mg Capsule',
        'GenercName': 'Omeprazole',
        'DosageForm': 'CAP',
        'Unit': 'แคปซูล',
        'Strength': '20 mg',
        'Major Class': '04.Gastrointestinal System',
        'Sub Class': 'Proton Pump Inhibitors',
        'ราคาต้นทุน': 2.50,
        'ราคา OPD': 6.00,
        'ราคา IPD': 7.50,
        'ราคา สกย. OPD': 6.00,
        'ราคา สกย. IPD': 7.50,
        'ราคา OPD_Foreigner': 9.00,
        'ราคา IPD_Foreigner': 10.50,
        'nhso_heart_price': 5.00
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'DrugTemplate');
    XLSX.writeFile(workbook, 'drug_import_template.xlsx');
    showToast('ดาวน์โหลดแม่แบบ Excel (drug_import_template.xlsx) เรียบร้อยแล้ว');
  }

  function exportCurrentDataToExcel() {
    if (!window.XLSX) {
      showToast('ไม่พบคลัง SheetJS สำหรับส่งออก Excel', 'error');
      return;
    }

    const dataToExport = (state.filteredRows && state.filteredRows.length) ? state.filteredRows : state.rows;
    if (!dataToExport.length) {
      showToast('ยังไม่มีข้อมูลสำหรับส่งออก', 'error');
      return;
    }

    const headers = state.headers.length ? state.headers : Object.keys(dataToExport[0] || {});
    const cleanHeaders = headers.filter((h) => h && !h.startsWith('_'));

    const exportRows = dataToExport.map((r) => {
      const cleanRow = {};
      cleanHeaders.forEach((h) => {
        cleanRow[h] = r[h] ?? '';
      });
      return cleanRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'DrugPrices');

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `drug_prices_${dateStr}.xlsx`);
    showToast(`ส่งออกข้อมูล ${exportRows.length.toLocaleString()} รายการเรียบร้อยแล้ว`);
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
})();
