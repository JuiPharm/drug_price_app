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
    generic: 'GenericName',
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

  const el = {
    syncStatus: byId('syncStatus'),
    syncText: byId('syncText'),
    syncTime: byId('syncTime'),
    searchInput: byId('searchInput'),
    refreshBtn: byId('refreshBtn'),
    addBtn: byId('addBtn'),
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
    floatingBackBtn: byId('floatingBackBtn')
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

    if (el.floatingBackBtn) {
      el.floatingBackBtn.addEventListener('click', handleFloatingBack);
      window.addEventListener('scroll', debounce(updateFloatingBackButton, 80), { passive: true });
      window.addEventListener('resize', debounce(updateFloatingBackButton, 120));
    }

    el.dialog.addEventListener('close', updateFloatingBackButton);
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
        <p>${escapeHtml(safe(row[F.generic]) || safe(row.Unit) || 'คลิกเพื่อดูรายละเอียด')}</p>
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

    const result = {};
    if (skyOpd !== null) result[F.skyOpdDisc] = round2(skyOpd * 0.8);
    if (skyIpd !== null) result[F.skyIpdDisc] = round2(skyIpd * 0.8);
    if (result[F.skyOpdDisc] !== undefined && cost !== null) result[F.skyOpdAfterCost] = round2(result[F.skyOpdDisc] - cost);
    if (result[F.skyIpdDisc] !== undefined && cost !== null) result[F.skyIpdAfterCost] = round2(result[F.skyIpdDisc] - cost);
    if (cost !== null && opd !== null) result.gross_margin_opd = round2(grossMargin(cost, opd));
    if (cost !== null && ipd !== null) result.gross_margin_ipd = round2(grossMargin(cost, ipd));
    if (cost !== null && skyOpd !== null) result.gross_margin_sky_opd = round2(grossMargin(cost, skyOpd));
    if (cost !== null && skyIpd !== null) result.gross_margin_sky_ipd = round2(grossMargin(cost, skyIpd));
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

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
})();
