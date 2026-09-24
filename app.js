(() => {
  'use strict';

  const CONFIG = window.DRUG_APP_CONFIG || {};
  const WEB_APP_URL = (CONFIG.WEB_APP_URL || '').trim();
  const APP_TOKEN = CONFIG.APP_TOKEN || '';
  const POLL_INTERVAL_MS = Number(CONFIG.POLL_INTERVAL_MS || 5000);
  const PAGE_SIZE = Number(CONFIG.PAGE_SIZE || 20);
  const PricingEngine = window.PricingEngine;
  const PRICING_SETTINGS_KEY = 'drug-price-app-pricing-v2';
  const OPERATOR_NAME_KEY = 'drug-price-app-operator';
  let pricingSettings = PricingEngine ? PricingEngine.cloneDefaultSettings() : null;

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
    gov: 'government_opd_price',
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
    F.gov,
    F.skyOpdDisc,
    F.skyIpdDisc,
    F.skyOpdAfterCost,
    F.skyIpdAfterCost,
    'gross_margin_opd',
    'gross_margin_ipd',
    'gross_margin_sky_opd',
    'gross_margin_sky_ipd',
    'gross_margin_gov',
    'gross_margin_nhso',
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
    F.gov,
    F.skyOpdDisc,
    F.skyIpdDisc,
    F.skyOpdAfterCost,
    F.skyIpdAfterCost
  ]);

  const EDITABLE_EXCLUDE = new Set([F.rowId, F.updatedAt, F.createdAt, F.skyOpdDisc, F.skyIpdDisc, F.skyOpdAfterCost, F.skyIpdAfterCost]);
  const PRICE_CONTROLLED_FIELDS = new Set([
    F.opd, F.ipd, F.opdForeign, F.ipdForeign, F.gov, F.nhso,
    'gross_margin_opd', 'gross_margin_ipd',
    'gross_margin_opd_foreigner', 'gross_margin_ipd_foreigner',
    'gross_margin_gov', 'gross_margin_nhso'
  ]);

  const state = {
    headers: [],
    rows: [],
    filteredRows: [],
    visibleCount: PAGE_SIZE,
    current: null,
    isNew: false,
    saving: false,
    lastPayload: null,
    pollHandle: null,
    original: null,
    proposalDrug: null,
    lastPricingResult: null,
    proposals: [],
    history: [],
    centralPolicyLoaded: false
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
    { key: F.gov, label: 'ราคาราชการ OPD', required: false, aliases: ['government_opd_price', 'gov tariff', 'gov price', 'ราคาราชการ opd', 'ราคา gov', 'ราชการ opd'] },
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
    proposePriceBtn: byId('proposePriceBtn'),
    toast: byId('toast'),
    pricingCost: byId('pricingCost'),
    pricingMode: byId('pricingMode'),
    pricingReason: byId('pricingReason'),
    pricingOldPrice: byId('pricingOldPrice'),
    pricingTargetGMField: byId('pricingTargetGMField'),
    pricingTargetGM: byId('pricingTargetGM'),
    pricingDesiredPriceField: byId('pricingDesiredPriceField'),
    pricingDesiredPrice: byId('pricingDesiredPrice'),
    pricingCalcBtn: byId('pricingCalcBtn'),
    pricingError: byId('pricingError'),
    pricingOpdResult: byId('pricingOpdResult'),
    pricingHistoricalGM: byId('pricingHistoricalGM'),
    pricingActualGM: byId('pricingActualGM'),
    pricingMarkup: byId('pricingMarkup'),
    pricingIpdRatio: byId('pricingIpdRatio'),
    pricingAlert: byId('pricingAlert'),
    pricingTariffGrid: byId('pricingTariffGrid'),
    pricingFloorTrace: byId('pricingFloorTrace'),
    proposalContext: byId('proposalContext'),
    proposalContextBadge: byId('proposalContextBadge'),
    proposalOperator: byId('proposalOperator'),
    proposalNotes: byId('proposalNotes'),
    submitProposalBtn: byId('submitProposalBtn'),
    clearProposalContextBtn: byId('clearProposalContextBtn'),
    pendingBadge: byId('pendingBadge'),
    proposalStatusFilter: byId('proposalStatusFilter'),
    refreshProposalsBtn: byId('refreshProposalsBtn'),
    proposalCount: byId('proposalCount'),
    proposalList: byId('proposalList'),
    refreshHistoryBtn: byId('refreshHistoryBtn'),
    historyItemFilter: byId('historyItemFilter'),
    historyCount: byId('historyCount'),
    historyList: byId('historyList'),
    formulaIpd: byId('formulaIpd'),
    formulaForeignOpd: byId('formulaForeignOpd'),
    formulaForeignIpd: byId('formulaForeignIpd'),
    formulaGov: byId('formulaGov'),
    formulaNhso: byId('formulaNhso'),
    pricingRoundingStep: byId('pricingRoundingStep'),
    pricingRoundingMode: byId('pricingRoundingMode'),
    applyGovFloor: byId('applyGovFloor'),
    applyNhsoFloor: byId('applyNhsoFloor'),
    pricingAnchors: byId('pricingAnchors'),
    centralPolicyStatus: byId('centralPolicyStatus'),
    centralPolicyMeta: byId('centralPolicyMeta'),
    settingsOperator: byId('settingsOperator'),
    settingsApproverPin: byId('settingsApproverPin'),
    formulaError: byId('formulaError'),
    savePricingSettingsBtn: byId('savePricingSettingsBtn'),
    resetPricingSettingsBtn: byId('resetPricingSettingsBtn'),
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
    loadPricingSettings();
    renderPricingSettings();
    bindEvents();
    restoreOperatorName();
    syncPricingMode();
    calculatePricingSimulation();
    renderProposalContext();

    if (!isConfigured()) {
      setStatus('error', 'ยังไม่ได้ตั้งค่า Apps Script URL', 'กรุณาแก้ไฟล์ config.js');
      renderEmpty('ยังไม่ได้ตั้งค่า WEB_APP_URL ใน config.js');
      return;
    }

    loadData({ manual: true });
    loadCentralPricingSettings();
    loadPricingProposals();
    loadPricingHistory();
    state.pollHandle = window.setInterval(() => {
      loadData({ silent: true });
      loadPricingProposals({ silent: true });
    }, POLL_INTERVAL_MS);
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
    if (el.proposePriceBtn) el.proposePriceBtn.addEventListener('click', beginProposalFromCurrent);

    if (el.pricingCalcBtn) el.pricingCalcBtn.addEventListener('click', calculatePricingSimulation);
    if (el.pricingMode) el.pricingMode.addEventListener('change', () => { syncPricingMode(); calculatePricingSimulation(); });
    [el.pricingCost, el.pricingReason, el.pricingOldPrice, el.pricingTargetGM, el.pricingDesiredPrice]
      .filter(Boolean)
      .forEach((node) => node.addEventListener('input', calculatePricingSimulation));
    if (el.savePricingSettingsBtn) el.savePricingSettingsBtn.addEventListener('click', savePricingSettingsFromUi);
    if (el.resetPricingSettingsBtn) el.resetPricingSettingsBtn.addEventListener('click', resetPricingSettings);
    if (el.submitProposalBtn) el.submitProposalBtn.addEventListener('click', submitCurrentProposal);
    if (el.clearProposalContextBtn) el.clearProposalContextBtn.addEventListener('click', clearProposalContext);
    if (el.refreshProposalsBtn) el.refreshProposalsBtn.addEventListener('click', () => loadPricingProposals());
    if (el.proposalStatusFilter) el.proposalStatusFilter.addEventListener('change', () => loadPricingProposals());
    if (el.proposalList) el.proposalList.addEventListener('click', handleProposalListAction);
    if (el.refreshHistoryBtn) el.refreshHistoryBtn.addEventListener('click', () => loadPricingHistory());
    if (el.historyItemFilter) el.historyItemFilter.addEventListener('input', debounce(() => loadPricingHistory({ silent: true }), 300));
    [el.proposalOperator, el.settingsOperator].filter(Boolean).forEach((node) => {
      node.addEventListener('input', () => persistOperatorName(node.value));
    });
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
    if (tabId === 'proposalsTab') loadPricingProposals({ silent: true });
    if (tabId === 'historyTab') loadPricingHistory({ silent: true });
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

  async function postAction(action, payload) {
    const url = new URL(WEB_APP_URL);
    url.searchParams.set('action', action);
    if (APP_TOKEN) url.searchParams.set('token', APP_TOKEN);

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: APP_TOKEN, action, payload })
    });

    if (!res.ok) {
      throw new Error(`การเชื่อมต่อเซิร์ฟเวอร์ขัดข้อง (HTTP ${res.status})`);
    }

    try {
      const data = await res.json();
      if (data && data.ok === false) {
        throw new Error(data.error || 'เซิร์ฟเวอร์ส่งข้อความผิดพลาดกลับมา');
      }
      return data;
    } catch (e) {
      if (e.message && !e.message.includes('Unexpected token')) throw e;
      return { ok: true };
    }
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

    const hasMore = state.visibleCount < state.filteredRows.length;
    el.loadMoreBtn.classList.toggle('hidden', !hasMore);
    if (hasMore) {
      const remaining = state.filteredRows.length - state.visibleCount;
      const nextBatch = Math.min(PAGE_SIZE, remaining);
      el.loadMoreBtn.textContent = `แสดงเพิ่มอีก ${nextBatch.toLocaleString()} รายการ (แสดงอยู่ ${Math.min(state.visibleCount, state.filteredRows.length).toLocaleString()} / ทั้งหมด ${state.filteredRows.length.toLocaleString()})`;
    }
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
    state.original = { ...row };
    state.current = { ...row };
    openModal('รายละเอียด / แก้ไข', row);
  }

  function openNewModal() {
    state.isNew = true;
    const blank = {};
    const headers = ensureHeadersForForm();
    headers.forEach((h) => { blank[h] = ''; });
    blank[F.rowId] = '';
    state.original = null;
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
      const isReadOnly = EDITABLE_EXCLUDE.has(header) || (!state.isNew && PRICE_CONTROLLED_FIELDS.has(header));
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
    if (!state.current || !PricingEngine || !pricingSettings) return;
    if (!state.isNew) {
      beginProposalFromCurrent();
      return;
    }

    const cost = toNumber(state.current[F.cost]) ?? 0;
    const skyOpd = toNumber(state.current[F.skyOpd]);
    let opd = toNumber(state.current[F.opd]);

    if (skyOpd !== null) opd = skyOpd;

    try {
      if (!(opd > 0) && cost > 0) {
        const suggested = PricingEngine.calculate({ cost, mode: 'historical', reason: 'new' }, pricingSettings);
        opd = suggested.opd;
      }
      if (!(opd >= 0)) throw new Error('กรุณากรอกราคาต้นทุนหรือ OPD ก่อนคำนวณ');

      const tariffs = PricingEngine.deriveTariffs({ cost, opd }, pricingSettings);
      state.current[F.opd] = tariffs.opd;
      state.current[F.ipd] = tariffs.ipd;
      state.current[F.opdForeign] = tariffs.foreignOpd;
      state.current[F.ipdForeign] = tariffs.foreignIpd;
      state.current[F.gov] = tariffs.govOpd;
      state.current[F.nhso] = tariffs.nhsoOpd;

      renderDetailForm();
      updateNegativeAlert();
      showToast('คำนวณราคาอัตโนมัติตาม Pricing Policy v2 แล้ว');
    } catch (err) {
      showToast('คำนวณราคาไม่สำเร็จ: ' + err.message, 'error');
    }
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
    const gov = toNumber(row[F.gov]);
    if (cost !== null && gov !== null) result['gross_margin_gov'] = round2(grossMargin(cost, gov));
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
    if (!state.isNew && state.original) {
      PRICE_CONTROLLED_FIELDS.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(state.original, field)) merged[field] = state.original[field];
      });
    }
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
      showToast(state.isNew ? 'เพิ่มรายการยาแล้ว' : 'บันทึกข้อมูลทั่วไปแล้ว (ราคาใช้ Approval Workflow)');
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

  function loadPricingSettings() {
    if (!PricingEngine) return;
    try {
      const saved = JSON.parse(localStorage.getItem(PRICING_SETTINGS_KEY) || 'null');
      if (saved && saved.formulas && Array.isArray(saved.anchors)) {
        pricingSettings = Object.assign(PricingEngine.cloneDefaultSettings(), saved);
        pricingSettings.formulas = Object.assign(PricingEngine.cloneDefaultSettings().formulas, saved.formulas || {});
      }
    } catch (_err) {
      pricingSettings = PricingEngine.cloneDefaultSettings();
    }
  }

  async function loadCentralPricingSettings() {
    if (!isConfigured() || !PricingEngine) return;
    try {
      const payload = await jsonp('pricing_settings', { token: APP_TOKEN });
      if (!payload || payload.ok === false || !payload.settings) throw new Error(payload?.error || 'ไม่พบ Central Pricing Settings');
      pricingSettings = Object.assign(PricingEngine.cloneDefaultSettings(), payload.settings);
      pricingSettings.formulas = Object.assign(PricingEngine.cloneDefaultSettings().formulas, payload.settings.formulas || {});
      localStorage.setItem(PRICING_SETTINGS_KEY, JSON.stringify(pricingSettings));
      state.centralPolicyLoaded = true;
      renderPricingSettings();
      calculatePricingSimulation();
      if (el.centralPolicyStatus) el.centralPolicyStatus.textContent = 'Central policy active';
      if (el.centralPolicyMeta) el.centralPolicyMeta.textContent =
        'อัปเดต ' + (payload.updated_at ? new Date(payload.updated_at).toLocaleString('th-TH') : '-') +
        ' · โดย ' + (payload.updated_by || '-');
    } catch (err) {
      state.centralPolicyLoaded = false;
      if (el.centralPolicyStatus) el.centralPolicyStatus.textContent = 'Local fallback';
      if (el.centralPolicyMeta) el.centralPolicyMeta.textContent = 'Backend ยังไม่พร้อม: ' + err.message;
    }
  }

  function renderPricingSettings() {
    if (!PricingEngine || !pricingSettings) return;
    if (el.formulaIpd) el.formulaIpd.value = pricingSettings.formulas.ipd;
    if (el.formulaForeignOpd) el.formulaForeignOpd.value = pricingSettings.formulas.foreignOpd;
    if (el.formulaForeignIpd) el.formulaForeignIpd.value = pricingSettings.formulas.foreignIpd;
    if (el.formulaGov) el.formulaGov.value = pricingSettings.formulas.govPreFloor;
    if (el.formulaNhso) el.formulaNhso.value = pricingSettings.formulas.nhsoPreFloor;
    if (el.pricingRoundingStep) el.pricingRoundingStep.value = pricingSettings.roundingStep;
    if (el.pricingRoundingMode) el.pricingRoundingMode.value = pricingSettings.roundingMode;
    if (el.applyGovFloor) el.applyGovFloor.checked = !!pricingSettings.applyGovFloor;
    if (el.applyNhsoFloor) el.applyNhsoFloor.checked = !!pricingSettings.applyNhsoFloor;
    if (el.pricingAnchors) el.pricingAnchors.value = JSON.stringify(pricingSettings.anchors, null, 2);
  }

  function syncPricingMode() {
    if (!el.pricingMode) return;
    const mode = el.pricingMode.value;
    if (el.pricingTargetGMField) el.pricingTargetGMField.classList.toggle('hidden', mode !== 'gm');
    if (el.pricingDesiredPriceField) el.pricingDesiredPriceField.classList.toggle('hidden', mode !== 'price');
  }

  function getPricingInput() {
    return {
      cost: el.pricingCost ? el.pricingCost.value : '',
      mode: el.pricingMode ? el.pricingMode.value : 'historical',
      targetGM: el.pricingTargetGM ? el.pricingTargetGM.value : '',
      desiredPrice: el.pricingDesiredPrice ? el.pricingDesiredPrice.value : '',
      reason: el.pricingReason ? el.pricingReason.value : 'new',
      oldPrice: el.pricingOldPrice ? el.pricingOldPrice.value : ''
    };
  }

  function calculatePricingSimulation() {
    if (!PricingEngine || !pricingSettings || !el.pricingOpdResult) return;
    if (el.pricingError) el.pricingError.classList.add('hidden');
    try {
      const result = PricingEngine.calculate(getPricingInput(), pricingSettings);
      state.lastPricingResult = result;
      renderPricingSimulation(result);
    } catch (err) {
      if (el.pricingError) {
        el.pricingError.textContent = err.message;
        el.pricingError.classList.remove('hidden');
      }
    }
  }

  function renderPricingSimulation(r) {
    el.pricingOpdResult.textContent = fmtMoney(r.opd) + ' บาท';
    el.pricingHistoricalGM.textContent = fmtPercent(r.historicalGM);
    el.pricingActualGM.textContent = fmtPercent(r.actualGM);
    el.pricingMarkup.textContent = fmtPercent(r.markup);
    el.pricingIpdRatio.textContent = r.opd > 0 ? r.ipdRatio.toFixed(3) + '×' : '-';

    const tariffs = [
      ['OPD', r.opd],
      ['IPD', r.ipd],
      ['Rub OPD', r.rubOpd],
      ['Rub IPD', r.rubIpd],
      ['Foreign OPD', r.foreignOpd],
      ['Foreign IPD', r.foreignIpd],
      ['Government OPD', r.govOpd],
      ['NHSO OPD', r.nhsoOpd]
    ];
    el.pricingTariffGrid.innerHTML = tariffs.map(([label, value]) =>
      '<div class="tariff-card"><span>' + escapeHtml(label) + '</span><strong>' + fmtMoney(value) + ' บาท</strong></div>'
    ).join('');

    el.pricingFloorTrace.innerHTML =
      '<div class="trace-row"><span>Government pre-floor</span><b>' + fmtMoney(r.govPreFloor) +
      '</b><span>→ MAX(OPD ' + fmtMoney(r.opd) + ', pre-floor)</span><b>' + fmtMoney(r.govOpd) +
      '</b><em>' + (r.govFloorApplied ? 'Floor applied' : 'Discount retained') + '</em></div>' +
      '<div class="trace-row"><span>NHSO pre-floor</span><b>' + fmtMoney(r.nhsoPreFloor) +
      '</b><span>→ MAX(OPD ' + fmtMoney(r.opd) + ', pre-floor)</span><b>' + fmtMoney(r.nhsoOpd) +
      '</b><em>' + (r.nhsoFloorApplied ? 'Floor applied' : 'Discount retained') + '</em></div>';

    if (el.pricingAlert) {
      el.pricingAlert.classList.toggle('hidden', !r.alerts.length);
      el.pricingAlert.innerHTML = r.alerts.length
        ? '<strong>Review:</strong> ' + r.alerts.map(escapeHtml).join(' · ')
        : '';
    }
  }

  async function savePricingSettingsFromUi() {
    if (!PricingEngine) return;
    if (el.formulaError) el.formulaError.classList.add('hidden');
    try {
      const next = buildPricingSettingsFromUi();
      const operator = getOperatorName();
      if (!operator) throw new Error('กรุณาระบุชื่อผู้แก้ไข Policy');

      const previous = pricingSettings;
      if (isConfigured() && !(el.settingsApproverPin && el.settingsApproverPin.value)) {
        throw new Error('กรุณาระบุ Approver PIN สำหรับเปลี่ยน Central Policy');
      }
      if (isConfigured()) {
        await postAction('save_pricing_settings', {
          settings: next,
          updated_by: operator,
          approver_pin: el.settingsApproverPin ? el.settingsApproverPin.value : '',
          previous_settings: previous
        });
      }

      pricingSettings = next;
      localStorage.setItem(PRICING_SETTINGS_KEY, JSON.stringify(pricingSettings));
      state.centralPolicyLoaded = isConfigured();
      renderPricingSettings();
      calculatePricingSimulation();
      if (el.centralPolicyStatus) el.centralPolicyStatus.textContent = isConfigured() ? 'Central policy active' : 'Local only';
      if (el.centralPolicyMeta) el.centralPolicyMeta.textContent = 'แก้ไขโดย ' + operator + ' · ' + new Date().toLocaleString('th-TH');
      if (el.settingsApproverPin) el.settingsApproverPin.value = '';
      showToast(isConfigured() ? 'บันทึก Central Pricing Policy แล้ว' : 'บันทึก Local Pricing Settings แล้ว');
      if (isConfigured()) loadPricingHistory({ silent: true });
    } catch (err) {
      if (el.formulaError) {
        el.formulaError.textContent = 'บันทึกไม่ได้: ' + err.message;
        el.formulaError.classList.remove('hidden');
      }
    }
  }

  function buildPricingSettingsFromUi() {
    const next = PricingEngine.cloneDefaultSettings();
    next.formulas.ipd = el.formulaIpd.value.trim();
    next.formulas.foreignOpd = el.formulaForeignOpd.value.trim();
    next.formulas.foreignIpd = el.formulaForeignIpd.value.trim();
    next.formulas.govPreFloor = el.formulaGov.value.trim();
    next.formulas.nhsoPreFloor = el.formulaNhso.value.trim();
    next.roundingStep = Number(el.pricingRoundingStep.value);
    next.roundingMode = el.pricingRoundingMode.value;
    next.applyGovFloor = !!el.applyGovFloor.checked;
    next.applyNhsoFloor = !!el.applyNhsoFloor.checked;
    next.anchors = JSON.parse(el.pricingAnchors.value);

    if (!(next.roundingStep > 0)) throw new Error('Rounding step ต้องมากกว่า 0');
    const vars = { OPD: 100, IPD: 120, COST: 50, GM: 50 };
    Object.values(next.formulas).forEach((formula) => PricingEngine.evaluateFormula(formula, vars));
    PricingEngine.historicalGM(500, next.anchors);
    return next;
  }

  async function resetPricingSettings() {
    if (!PricingEngine) return;
    if (!window.confirm('คืนค่า Pricing Policy เป็นค่าเริ่มต้นและบันทึกเป็น Central Policy หรือไม่?')) return;
    const operator = getOperatorName();
    if (!operator) {
      showToast('กรุณาระบุชื่อผู้ดำเนินการก่อน', 'error');
      return;
    }
    const defaults = PricingEngine.cloneDefaultSettings();
    try {
      if (isConfigured() && !(el.settingsApproverPin && el.settingsApproverPin.value)) {
        throw new Error('กรุณาระบุ Approver PIN สำหรับ Reset Central Policy');
      }
      if (isConfigured()) {
        await postAction('save_pricing_settings', {
          settings: defaults,
          updated_by: operator,
          approver_pin: el.settingsApproverPin ? el.settingsApproverPin.value : '',
          previous_settings: pricingSettings,
          note: 'Reset to default policy'
        });
      }
      pricingSettings = defaults;
      localStorage.setItem(PRICING_SETTINGS_KEY, JSON.stringify(pricingSettings));
      renderPricingSettings();
      calculatePricingSimulation();
      showToast('คืนค่า Pricing Policy แล้ว');
      if (isConfigured()) loadPricingHistory({ silent: true });
    } catch (err) {
      showToast('Reset ไม่สำเร็จ: ' + err.message, 'error');
    }
  }

  function restoreOperatorName() {
    const name = localStorage.getItem(OPERATOR_NAME_KEY) || '';
    if (el.proposalOperator) el.proposalOperator.value = name;
    if (el.settingsOperator) el.settingsOperator.value = name;
  }

  function persistOperatorName(value) {
    const name = String(value || '').trim();
    if (name) localStorage.setItem(OPERATOR_NAME_KEY, name);
    if (el.proposalOperator && document.activeElement !== el.proposalOperator) el.proposalOperator.value = name;
    if (el.settingsOperator && document.activeElement !== el.settingsOperator) el.settingsOperator.value = name;
  }

  function getOperatorName() {
    const name = String(
      (el.proposalOperator && el.proposalOperator.value) ||
      (el.settingsOperator && el.settingsOperator.value) ||
      localStorage.getItem(OPERATOR_NAME_KEY) ||
      ''
    ).trim();
    if (name) persistOperatorName(name);
    return name;
  }

  function beginProposalFromCurrent() {
    if (!state.current || state.isNew) {
      showToast('กรุณาบันทึกรายการยาใหม่ก่อนสร้างข้อเสนอราคา', 'error');
      return;
    }
    state.proposalDrug = { ...state.current };
    if (el.pricingCost) el.pricingCost.value = toNumber(state.current[F.cost]) ?? '';
    if (el.pricingOldPrice) el.pricingOldPrice.value = toNumber(state.current[F.opd]) ?? '';
    if (el.pricingReason) el.pricingReason.value = 'adjustment';
    if (el.pricingMode) el.pricingMode.value = 'historical';
    if (el.pricingDesiredPrice) el.pricingDesiredPrice.value = toNumber(state.current[F.opd]) ?? '';
    if (el.dialog && el.dialog.open) el.dialog.close();
    syncPricingMode();
    calculatePricingSimulation();
    renderProposalContext();
    switchTab('calculatorTab');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearProposalContext() {
    state.proposalDrug = null;
    if (el.proposalNotes) el.proposalNotes.value = '';
    renderProposalContext();
  }

  function renderProposalContext() {
    if (!el.proposalContext || !el.proposalContextBadge || !el.submitProposalBtn) return;
    const row = state.proposalDrug;
    if (!row) {
      el.proposalContext.textContent = 'เลือกยาจากหน้า “รายการยา” แล้วกด “เสนอปรับราคา” เพื่อเชื่อมกับรายการในฐานข้อมูล';
      el.proposalContextBadge.textContent = 'ยังไม่ได้เลือกยา';
      el.submitProposalBtn.disabled = true;
      return;
    }
    const name = safe(row[F.fullName]) || safe(row[F.generic]) || '-';
    const code = safe(row[F.itemCode]) || '-';
    el.proposalContext.textContent =
      name + ' · Cost ' + fmtMoney(row[F.cost]) + ' · OPD ปัจจุบัน ' + fmtMoney(row[F.opd]) + ' · IPD ปัจจุบัน ' + fmtMoney(row[F.ipd]);
    el.proposalContextBadge.textContent = code;
    el.submitProposalBtn.disabled = false;
  }

  async function submitCurrentProposal() {
    if (!state.proposalDrug || !state.lastPricingResult) {
      showToast('กรุณาเลือกยาและคำนวณราคาใหม่ก่อน', 'error');
      return;
    }
    const operator = getOperatorName();
    if (!operator) {
      showToast('กรุณาระบุชื่อผู้เสนอราคา', 'error');
      return;
    }
    const r = state.lastPricingResult;
    const row = state.proposalDrug;
    const payload = {
      row_id: row[F.rowId] || '',
      item_code: row[F.itemCode] || '',
      drug_name: row[F.fullName] || row[F.generic] || '',
      cost: r.cost,
      proposed_opd: r.opd,
      proposed_ipd: r.ipd,
      proposed_opd_foreign: r.foreignOpd,
      proposed_ipd_foreign: r.foreignIpd,
      proposed_gov: r.govOpd,
      proposed_nhso: r.nhsoOpd,
      historical_gm: r.historicalGM,
      target_gm: r.targetGM,
      actual_gm: r.actualGM,
      markup: r.markup,
      pricing_mode: r.mode,
      pricing_reason: r.reason,
      old_anchor: toNumber(el.pricingOldPrice?.value),
      notes: el.proposalNotes?.value || '',
      submitted_by: operator,
      policy_snapshot_json: JSON.stringify(pricingSettings)
    };

    try {
      el.submitProposalBtn.disabled = true;
      const result = await postAction('submit_pricing_proposal', payload);
      showToast('ส่งข้อเสนอราคาแล้ว · Pending approval');
      clearProposalContext();
      await loadPricingProposals();
      await loadPricingHistory({ silent: true });
      switchTab('proposalsTab');
      return result;
    } catch (err) {
      showToast('ส่งข้อเสนอไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      el.submitProposalBtn.disabled = !state.proposalDrug;
    }
  }

  async function loadPricingProposals(options = {}) {
    if (!isConfigured() || !el.proposalList) return;
    try {
      const status = el.proposalStatusFilter ? el.proposalStatusFilter.value : 'PENDING';
      const payload = await jsonp('pricing_proposals', { token: APP_TOKEN, status, limit: 300 });
      if (!payload || payload.ok === false) throw new Error(payload?.error || 'โหลดข้อเสนอราคาไม่ได้');
      state.proposals = Array.isArray(payload.rows) ? payload.rows : [];
      state.pendingCount = Number(payload.pendingCount || 0);
      renderPricingProposals();
      updatePendingBadge();
    } catch (err) {
      if (!options.silent) showToast('โหลดข้อเสนอราคาไม่สำเร็จ: ' + err.message, 'error');
      el.proposalList.innerHTML = '<div class="empty-state">Pricing workflow backend ยังไม่พร้อม กรุณาอัปเดต Code.gs และรัน setup()</div>';
    }
  }

  function updatePendingBadge() {
    if (!el.pendingBadge) return;
    const pendingCount = Number.isFinite(state.pendingCount)
      ? state.pendingCount
      : state.proposals.filter(p => String(p.status || '').toUpperCase() === 'PENDING').length;
    el.pendingBadge.textContent = String(pendingCount);
    el.pendingBadge.classList.toggle('hidden', pendingCount === 0);
  }

  function renderPricingProposals() {
    if (!el.proposalList) return;
    if (el.proposalCount) el.proposalCount.textContent = state.proposals.length.toLocaleString('th-TH');
    if (!state.proposals.length) {
      el.proposalList.innerHTML = '<div class="empty-state">ไม่มีข้อเสนอราคาตามเงื่อนไข</div>';
      return;
    }
    const operator = getOperatorName();
    el.proposalList.innerHTML = state.proposals.map((p) => {
      const status = String(p.status || '').toUpperCase();
      const canAct = status === 'PENDING';
      const canCancel = canAct && operator && String(p.submitted_by || '') === operator;
      return `
        <article class="workflow-card">
          <div class="workflow-card-head">
            <div>
              <span class="pill">${escapeHtml(p.item_code || '-')}</span>
              <span class="status-pill status-${escapeAttr(status.toLowerCase())}">${escapeHtml(status || '-')}</span>
              <h3>${escapeHtml(p.drug_name || '-')}</h3>
              <p>เสนอโดย ${escapeHtml(p.submitted_by || '-')} · ${formatDateTime(p.submitted_at)}</p>
            </div>
            <strong class="proposal-id">${escapeHtml(String(p.proposal_id || '').slice(0, 8))}</strong>
          </div>
          <div class="proposal-price-grid">
            ${priceDeltaCell('OPD', p.current_opd, p.proposed_opd)}
            ${priceDeltaCell('IPD', p.current_ipd, p.proposed_ipd)}
            ${priceDeltaCell('Government', p.current_gov, p.proposed_gov)}
            ${priceDeltaCell('NHSO', p.current_nhso, p.proposed_nhso)}
          </div>
          <div class="proposal-meta">
            <span>GM ใหม่ <b>${fmtPercent(p.actual_gm)}</b></span>
            <span>Historical GM <b>${fmtPercent(p.historical_gm)}</b></span>
            <span>Reason <b>${escapeHtml(p.pricing_reason || '-')}</b></span>
            <span>Mode <b>${escapeHtml(p.pricing_mode || '-')}</b></span>
          </div>
          ${p.notes ? '<div class="proposal-note">' + escapeHtml(p.notes) + '</div>' : ''}
          ${p.review_note ? '<div class="proposal-note review-note">Review: ' + escapeHtml(p.review_note) + '</div>' : ''}
          ${canAct ? `
            <div class="workflow-actions">
              ${canCancel ? '<button class="btn secondary" data-proposal-action="cancel" data-proposal-id="' + escapeAttr(p.proposal_id) + '">ยกเลิกข้อเสนอ</button>' : ''}
              <button class="btn secondary danger-outline" data-proposal-action="reject" data-proposal-id="${escapeAttr(p.proposal_id)}">Reject</button>
              <button class="btn primary" data-proposal-action="approve" data-proposal-id="${escapeAttr(p.proposal_id)}">Approve & Apply</button>
            </div>
          ` : ''}
        </article>
      `;
    }).join('');
  }

  function priceDeltaCell(label, before, after) {
    const b = toNumber(before);
    const a = toNumber(after);
    let change = '-';
    if (b !== null && b !== 0 && a !== null) change = (((a - b) / b) * 100).toFixed(1) + '%';
    return '<div class="price-delta"><span>' + escapeHtml(label) + '</span><small>' +
      fmtMoney(before) + ' →</small><strong>' + fmtMoney(after) + '</strong><em>' + change + '</em></div>';
  }

  async function handleProposalListAction(event) {
    const btn = event.target.closest('[data-proposal-action]');
    if (!btn) return;
    const action = btn.dataset.proposalAction;
    const proposalId = btn.dataset.proposalId;
    const proposal = state.proposals.find(p => String(p.proposal_id) === String(proposalId));
    if (!proposal) return;

    if (action === 'cancel') {
      const operator = getOperatorName();
      if (!operator) return showToast('กรุณาระบุชื่อผู้ดำเนินการ', 'error');
      if (!window.confirm('ยกเลิกข้อเสนอนี้หรือไม่?')) return;
      try {
        await postAction('cancel_pricing_proposal', { proposal_id: proposalId, operator });
        showToast('ยกเลิกข้อเสนอแล้ว');
        await refreshWorkflowAfterDecision();
      } catch (err) {
        showToast('ยกเลิกไม่สำเร็จ: ' + err.message, 'error');
      }
      return;
    }

    const review = await getReviewCredentials(action, proposal);
    if (!review) return;
    try {
      btn.disabled = true;
      await postAction(action === 'approve' ? 'approve_pricing_proposal' : 'reject_pricing_proposal', {
        proposal_id: proposalId,
        reviewed_by: review.reviewer,
        approver_pin: review.pin,
        review_note: review.note
      });
      showToast(action === 'approve' ? 'อนุมัติและอัปเดตราคาใน DataBase แล้ว' : 'ปฏิเสธข้อเสนอแล้ว');
      await refreshWorkflowAfterDecision();
    } catch (err) {
      showToast((action === 'approve' ? 'อนุมัติ' : 'ปฏิเสธ') + ' ไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function getReviewCredentials(action, proposal) {
    const title = action === 'approve' ? 'Approve & Apply ราคา' : 'Reject ข้อเสนอราคา';
    if (window.Swal) {
      const res = await Swal.fire({
        title,
        html: `
          <div class="approval-form">
            <label>ผู้อนุมัติ / ผู้ทบทวน<input id="reviewerName" class="swal2-input" value="${escapeAttr(getOperatorName())}"></label>
            <label>Approver PIN<input id="reviewerPin" class="swal2-input" type="password" autocomplete="off"></label>
            <label>หมายเหตุ<input id="reviewerNote" class="swal2-input" placeholder="Optional"></label>
          </div>
          <p style="font-size:.82rem;color:#64748b">Proposal ${escapeHtml(String(proposal.proposal_id || '').slice(0, 8))} · ${escapeHtml(proposal.item_code || '')}</p>
        `,
        showCancelButton: true,
        confirmButtonText: action === 'approve' ? 'Approve & Apply' : 'Reject',
        cancelButtonText: 'Cancel',
        preConfirm: () => {
          const reviewer = document.getElementById('reviewerName')?.value.trim();
          const pin = document.getElementById('reviewerPin')?.value || '';
          const note = document.getElementById('reviewerNote')?.value || '';
          if (!reviewer || !pin) {
            Swal.showValidationMessage('กรุณาระบุผู้ทบทวนและ Approver PIN');
            return false;
          }
          return { reviewer, pin, note };
        }
      });
      if (!res.isConfirmed) return null;
      persistOperatorName(res.value.reviewer);
      return res.value;
    }
    const reviewer = window.prompt('ชื่อผู้อนุมัติ / ผู้ทบทวน', getOperatorName());
    if (!reviewer) return null;
    const pin = window.prompt('Approver PIN');
    if (!pin) return null;
    const note = window.prompt('หมายเหตุ (ถ้ามี)', '') || '';
    persistOperatorName(reviewer);
    return { reviewer, pin, note };
  }

  async function refreshWorkflowAfterDecision() {
    await Promise.all([
      loadData({ silent: true }),
      loadPricingProposals({ silent: true }),
      loadPricingHistory({ silent: true })
    ]);
  }

  async function loadPricingHistory(options = {}) {
    if (!isConfigured() || !el.historyList) return;
    try {
      const itemCode = el.historyItemFilter ? el.historyItemFilter.value.trim() : '';
      const payload = await jsonp('pricing_history', { token: APP_TOKEN, item_code: itemCode, limit: 300 });
      if (!payload || payload.ok === false) throw new Error(payload?.error || 'โหลด Pricing History ไม่ได้');
      state.history = Array.isArray(payload.rows) ? payload.rows : [];
      renderPricingHistory();
    } catch (err) {
      if (!options.silent) showToast('โหลด Pricing History ไม่สำเร็จ: ' + err.message, 'error');
      el.historyList.innerHTML = '<div class="empty-state">Pricing history backend ยังไม่พร้อม</div>';
    }
  }

  function renderPricingHistory() {
    if (!el.historyList) return;
    if (el.historyCount) el.historyCount.textContent = state.history.length.toLocaleString('th-TH');
    if (!state.history.length) {
      el.historyList.innerHTML = '<div class="empty-state">ยังไม่มี Pricing History</div>';
      return;
    }
    el.historyList.innerHTML = state.history.map((h) => {
      const before = safeJsonParse(h.before_json);
      const after = safeJsonParse(h.after_json);
      const hasPriceChange = before && after && (before.opd !== undefined || after.opd !== undefined);
      return `
        <article class="history-card">
          <div class="workflow-card-head">
            <div>
              <span class="status-pill status-${escapeAttr(String(h.status || '').toLowerCase())}">${escapeHtml(h.action || h.status || '-')}</span>
              <h3>${escapeHtml(h.drug_name || h.item_code || 'Pricing Policy')}</h3>
              <p>${escapeHtml(h.actor || '-')} · ${formatDateTime(h.action_at)}</p>
            </div>
            <span class="pill">${escapeHtml(h.item_code || 'POLICY')}</span>
          </div>
          ${hasPriceChange ? `
            <div class="history-price-line">
              <span>OPD <b>${fmtMoney(before?.opd)}</b> → <strong>${fmtMoney(after?.opd)}</strong></span>
              <span>IPD <b>${fmtMoney(before?.ipd)}</b> → <strong>${fmtMoney(after?.ipd)}</strong></span>
              <span>Gov <b>${fmtMoney(before?.gov)}</b> → <strong>${fmtMoney(after?.gov)}</strong></span>
              <span>NHSO <b>${fmtMoney(before?.nhso)}</b> → <strong>${fmtMoney(after?.nhso)}</strong></span>
            </div>
          ` : ''}
          ${h.note ? '<div class="proposal-note">' + escapeHtml(h.note) + '</div>' : ''}
        </article>
      `;
    }).join('');
  }

  function safeJsonParse(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try { return JSON.parse(String(value)); } catch (_err) { return null; }
  }

  function formatDateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? escapeHtml(String(value)) : d.toLocaleString('th-TH');
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

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

      // Auto-fill using the same Pricing Policy v2 as the calculator.
      if (autoCalc && PricingEngine && pricingSettings) {
        const costVal = toNumber(row[F.cost]) ?? 0;
        const skyOpd = toNumber(row[F.skyOpd]);
        let opdVal = toNumber(row[F.opd]);

        if (opdVal === null && skyOpd !== null) {
          opdVal = skyOpd;
          row[F.opd] = opdVal;
        }
        if (opdVal === null && costVal > 0) {
          const suggestion = PricingEngine.calculate({ cost: costVal, mode: 'historical', reason: 'new' }, pricingSettings);
          opdVal = suggestion.opd;
          row[F.opd] = opdVal;
        }

        if (opdVal !== null) {
          const currentIpd = toNumber(row[F.ipd]);
          const tariffs = PricingEngine.deriveTariffs({
            cost: costVal,
            opd: opdVal,
            ipdOverride: currentIpd
          }, pricingSettings);

          if (currentIpd === null) row[F.ipd] = tariffs.ipd;
          if (toNumber(row[F.opdForeign]) === null) row[F.opdForeign] = tariffs.foreignOpd;
          if (toNumber(row[F.ipdForeign]) === null) row[F.ipdForeign] = tariffs.foreignIpd;
          if (toNumber(row[F.gov]) === null) row[F.gov] = tariffs.govOpd;
          if (toNumber(row[F.nhso]) === null) row[F.nhso] = tariffs.nhsoOpd;
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
    el.importProgressText.textContent = text || `กำลังนำเข้า ${current.toLocaleString()} / ${total.toLocaleString()} รายการ (${percent}%)`;
  }

  async function executeExcelImport() {
    if (excelState.isImporting || !excelState.processedRows.length) return;

    const rows = excelState.processedRows;
    const warningCount = rows.filter((r) => r._hasNegative).length;
    const newCount = rows.filter((r) => !r._isUpdate).length;
    const updateCount = rows.filter((r) => r._isUpdate).length;
    const mode = el.importModeSelect ? el.importModeSelect.value : 'upsert';

    // 1. Close the Excel Dialog so the browser's Top Layer does not obscure SweetAlert2
    if (el.excelDialog && el.excelDialog.open) {
      el.excelDialog.close();
    }

    // 2. SweetAlert2 confirmation dialog in center of screen
    if (window.Swal) {
      const confirmRes = await Swal.fire({
        title: 'ยืนยันการนำเข้าข้อมูล?',
        html: `
          <div style="text-align: left; font-size: 0.95rem; line-height: 1.85; background: #f8fafc; padding: 1rem 1.25rem; border-radius: 14px; border: 1px solid #e2e8f0;">
            <div>📁 <strong>ไฟล์:</strong> ${escapeHtml(excelState.fileName || 'Excel')} (${rows.length.toLocaleString()} รายการ)</div>
            <div>🟢 <strong>เพิ่มรายการใหม่ (Add):</strong> ${newCount.toLocaleString()} รายการ</div>
            <div>🔵 <strong>อัปเดตรายการเดิม (Update):</strong> ${updateCount.toLocaleString()} รายการ</div>
            <div>⚙️ <strong>โหมดการทำงาน:</strong> ${mode === 'upsert' ? 'อัปเดตเดิม + เพิ่มใหม่ (Upsert)' : mode === 'add' ? 'เพิ่มเฉพาะรายการใหม่' : 'อัปเดตเฉพาะรายการเดิม'}</div>
            ${warningCount > 0 ? `<div style="color: #dc2626; margin-top: .4rem; font-weight: 600;">⚠️ มีรายการที่ราคาหลังหักส่วนลด 20% ต่ำกว่าต้นทุน ${warningCount.toLocaleString()} รายการ</div>` : ''}
          </div>
        `,
        icon: warningCount > 0 ? 'warning' : 'question',
        showCancelButton: true,
        confirmButtonText: '🚀 เริ่มนำเข้าข้อมูล',
        cancelButtonText: 'กลับไปแก้ไข / ยกเลิก',
        confirmButtonColor: '#2563eb',
        cancelButtonColor: '#64748b',
        reverseButtons: true,
        focusConfirm: true
      });

      // If cancelled, re-open the excel dialog so user is right back where they were
      if (!confirmRes.isConfirmed) {
        if (el.excelDialog) el.excelDialog.showModal();
        return;
      }
    } else {
      if (warningCount > 0) {
        const ok = window.confirm(`พบรายการที่ราคาหลัง Discount ต่ำกว่าทุน ${warningCount} รายการ ยืนยันการบันทึกหรือไม่?`);
        if (!ok) {
          if (el.excelDialog) el.excelDialog.showModal();
          return;
        }
      }
    }

    // 3. Open the dedicated Live Progress Popup via SweetAlert2
    const startTime = Date.now();
    excelState.isImporting = true;
    if (el.startImportBtn) el.startImportBtn.disabled = true;
    if (el.closeExcelModalBtn) el.closeExcelModalBtn.disabled = true;
    if (el.importProgressWrap) el.importProgressWrap.classList.remove('hidden');

    const CHUNK_SIZE = 200; // Optimal speed: ~200 items per chunk takes 5-7s
    const chunks = [];
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      chunks.push(rows.slice(i, i + CHUNK_SIZE));
    }

    function renderSwalProgress(completed, total, currentChunk, totalChunks, customMsg) {
      const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
      updateImportProgress(completed, total, customMsg);

      if (window.Swal && Swal.isVisible()) {
        const barFill = document.getElementById('swalProgressBar');
        const pctEl = document.getElementById('swalProgressPercent');
        const textEl = document.getElementById('swalProgressText');
        const detailEl = document.getElementById('swalProgressDetail');

        if (barFill) barFill.style.width = `${pct}%`;
        if (pctEl) pctEl.textContent = `${pct}%`;
        if (textEl) textEl.textContent = customMsg || `กำลังนำเข้า ${completed.toLocaleString()} / ${total.toLocaleString()} รายการ...`;
        if (detailEl) detailEl.textContent = `ชุดที่ ${currentChunk} / ${totalChunks} (ชุดละ ${CHUNK_SIZE} รายการ)`;
      }
    }

    if (window.Swal) {
      Swal.fire({
        title: 'กำลังนำเข้าข้อมูลลง Google Sheet...',
        html: `
          <div class="swal-progress-box">
            <div class="swal-progress-header">
              <span id="swalProgressText" class="swal-progress-status">⏳ กำลังเตรียมส่งข้อมูล...</span>
              <span id="swalProgressPercent" class="swal-progress-pct">0%</span>
            </div>
            <div class="swal-progress-bar-bg">
              <div id="swalProgressBar" class="swal-progress-bar-fill" style="width: 0%"></div>
            </div>
            <div class="swal-progress-detail">
              <span id="swalProgressDetail">ชุดที่ 1 / ${chunks.length}</span>
              <span>กำลังประมวลผล...</span>
            </div>
          </div>
        `,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        showCloseButton: false
      });
    }

    let completed = 0;
    let fallbackMode = false;

    try {
      // Test sending first chunk via batch_import
      try {
        renderSwalProgress(0, rows.length, 1, chunks.length, `กำลังส่งข้อมูลชุดที่ 1 / ${chunks.length} ไปยัง Google Sheet...`);
        await postBatchImportChunk(chunks[0], mode);
        completed += chunks[0].length;
        renderSwalProgress(completed, rows.length, 1, chunks.length, `นำเข้าสำเร็จแล้ว ${completed.toLocaleString()} / ${rows.length.toLocaleString()} รายการ`);
      } catch (err) {
        console.warn('batch_import failed or not supported, falling back to sequential save/add:', err);
        fallbackMode = true;
      }

      if (fallbackMode) {
        renderSwalProgress(0, rows.length, 1, rows.length, 'กำลังนำเข้าแบบแยกรายการ (Compatibility Mode)...');
        completed = 0;
        for (let i = 0; i < rows.length; i++) {
          const item = rows[i];
          const action = item._isUpdate ? 'save' : 'add';
          try {
            await postAction(action, item);
            completed++;
            if (completed % 5 === 0 || completed === rows.length) {
              renderSwalProgress(completed, rows.length, completed, rows.length, `กำลังบันทึก ${completed.toLocaleString()} / ${rows.length.toLocaleString()} รายการ...`);
            }
            await delay(150);
          } catch (err) {
            console.error('Error importing item:', item, err);
          }
        }
      } else {
        // Continue remaining chunks with batch_import
        for (let c = 1; c < chunks.length; c++) {
          renderSwalProgress(completed, rows.length, c + 1, chunks.length, `กำลังนำเข้าชุดที่ ${c + 1} / ${chunks.length}...`);
          await postBatchImportChunk(chunks[c], mode);
          completed += chunks[c].length;
          renderSwalProgress(completed, rows.length, c + 1, chunks.length, `นำเข้าสำเร็จแล้ว ${completed.toLocaleString()} / ${rows.length.toLocaleString()} รายการ`);
          await delay(200);
        }
      }

      renderSwalProgress(rows.length, rows.length, chunks.length, chunks.length, '✅ นำเข้าข้อมูลเสร็จสมบูรณ์ 100%!');
      const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

      // 4. Success Summary SweetAlert2 before finishing
      if (window.Swal) {
        await Swal.fire({
          icon: 'success',
          title: 'นำเข้าข้อมูลเรียบร้อยแล้ว! 🎉',
          html: `
            <div style="text-align: left; font-size: 0.95rem; line-height: 1.85; background: #f8fafc; padding: 1.1rem 1.25rem; border-radius: 14px; border: 1px solid #e2e8f0;">
              <div style="margin-bottom: 0.35rem;">📊 <strong>รายการทั้งหมดที่ประมวลผล:</strong> <span style="font-size: 1.05rem; font-weight: 700; color: #1e293b;">${completed.toLocaleString()}</span> / ${rows.length.toLocaleString()} รายการ</div>
              <div>🟢 <strong>เพิ่มรายการใหม่ (Add):</strong> <span style="color: #16a34a; font-weight: 600;">${newCount.toLocaleString()}</span> รายการ</div>
              <div>🔵 <strong>อัปเดตรายการเดิม (Update):</strong> <span style="color: #2563eb; font-weight: 600;">${updateCount.toLocaleString()}</span> รายการ</div>
              ${warningCount > 0 ? `<div style="color: #dc2626; font-weight: 600;">⚠️ <strong>ราคาหลังส่วนลดต่ำกว่าทุน:</strong> ${warningCount.toLocaleString()} รายการ</div>` : ''}
              <div style="margin-top: 0.45rem; padding-top: 0.45rem; border-top: 1px dashed #cbd5e1; color: #64748b; font-size: 0.88rem;">
                ⚡ <strong>โหมดการนำเข้า:</strong> ${fallbackMode ? 'Compatibility Mode (บันทึกรายตัว)' : 'Fast Batch Mode (ประมวลผลเป็นชุด)'}<br>
                ⏱️ <strong>เวลาที่ใช้ทั้งหมด:</strong> ${elapsedSeconds} วินาที
              </div>
            </div>
          `,
          confirmButtonText: 'ตกลง (แสดงข้อมูลในระบบ)',
          confirmButtonColor: '#2563eb',
          allowOutsideClick: false
        });
      } else {
        showToast(`นำเข้าสำเร็จ ${completed.toLocaleString()} รายการ!`, 'ok');
        await delay(1200);
      }

      // Reset state and refresh view
      excelState.isImporting = false;
      if (el.closeExcelModalBtn) el.closeExcelModalBtn.disabled = false;
      resetExcelUpload();
      if (el.excelDialog && el.excelDialog.open) el.excelDialog.close();
      updateFloatingBackButton();

      await loadData({ manual: true });
    } catch (err) {
      console.error('Import failed:', err);
      if (window.Swal) {
        await Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาดในการนำเข้าข้อมูล',
          html: `<div style="text-align: left; background: #fee2e2; color: #991b1b; padding: 0.8rem 1rem; border-radius: 10px; font-size: 0.9rem;">${escapeHtml(err.message || 'ไม่สามารถบันทึกข้อมูลลง Google Sheet ได้')}</div>`,
          confirmButtonText: 'ปิด',
          confirmButtonColor: '#dc2626'
        });
      } else {
        showToast(`เกิดข้อผิดพลาด: ${err.message}`, 'error');
      }
      // Re-open dialog on error so user can re-try or inspect
      if (el.excelDialog) el.excelDialog.showModal();
    } finally {
      excelState.isImporting = false;
      if (el.startImportBtn) el.startImportBtn.disabled = false;
      if (el.closeExcelModalBtn) el.closeExcelModalBtn.disabled = false;
    }
  }

  async function postBatchImportChunk(items, mode) {
    const url = new URL(WEB_APP_URL);
    url.searchParams.set('action', 'batch_import');
    if (APP_TOKEN) url.searchParams.set('token', APP_TOKEN);

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: APP_TOKEN, action: 'batch_import', payload: { items, mode } })
    });

    if (!res.ok) {
      throw new Error(`การเชื่อมต่อเซิร์ฟเวอร์ขัดข้อง (HTTP ${res.status}: ${res.statusText})`);
    }

    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.error || 'Google Apps Script ส่งข้อความผิดพลาดกลับมา');
    }
    return data;
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
