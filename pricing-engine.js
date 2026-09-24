(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PricingEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_ANCHORS = [
    { cost: 5, gm: 86 }, { cost: 10, gm: 83 }, { cost: 25, gm: 78 },
    { cost: 50, gm: 74 }, { cost: 75, gm: 71 }, { cost: 100, gm: 69 },
    { cost: 200, gm: 63 }, { cost: 500, gm: 56 }, { cost: 1000, gm: 50 },
    { cost: 2000, gm: 44 }, { cost: 5000, gm: 36 }, { cost: 10000, gm: 31 },
    { cost: 20000, gm: 26 }
  ];

  const GOV_DISCOUNT_RATE = 0.30;
  const NHSO_DISCOUNT_RATE = 0.40;
  const GOV_FACTOR = 1 - GOV_DISCOUNT_RATE;
  const NHSO_FACTOR = 1 - NHSO_DISCOUNT_RATE;

  const DEFAULT_SETTINGS = {
    roundingStep: 1,
    roundingMode: 'CEIL',
    formulas: {
      ipd: 'OPD*1.20',
      rubOpd: 'OPD',
      rubIpd: 'IPD',
      foreignOpd: 'OPD*1.30',
      foreignIpd: 'IPD*1.30'
    },
    anchors: DEFAULT_ANCHORS.map(function (x) { return { cost: x.cost, gm: x.gm }; })
  };

  function cloneDefaultSettings() {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }

  function tokenize(input) {
    const s = String(input || '').toUpperCase().replace(/\s+/g, '');
    const tokens = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/[0-9.]/.test(ch)) {
        let j = i + 1;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        const raw = s.slice(i, j);
        if ((raw.match(/\./g) || []).length > 1 || raw === '.') throw new Error('Invalid number: ' + raw);
        tokens.push({ type: 'number', value: Number(raw) });
        i = j;
      } else if (/[A-Z_]/.test(ch)) {
        let j = i + 1;
        while (j < s.length && /[A-Z0-9_]/.test(s[j])) j++;
        tokens.push({ type: 'id', value: s.slice(i, j) });
        i = j;
      } else if ('+-*/^(),'.includes(ch)) {
        tokens.push({ type: ch, value: ch });
        i++;
      } else {
        throw new Error('Unsupported character: ' + ch);
      }
    }
    tokens.push({ type: 'eof' });
    return tokens;
  }

  function evaluateFormula(formula, variables) {
    const tokens = tokenize(formula);
    let pos = 0;
    const vars = {};
    Object.entries(variables || {}).forEach(function (entry) {
      vars[String(entry[0]).toUpperCase()] = Number(entry[1]);
    });
    const fns = {
      MAX: function () { return Math.max.apply(Math, arguments); },
      MIN: function () { return Math.min.apply(Math, arguments); },
      ROUND: function (x, d) {
        d = d === undefined ? 0 : d;
        const p = Math.pow(10, d);
        return Math.round((x + Number.EPSILON) * p) / p;
      },
      CEIL: function (x, step) {
        step = step === undefined ? 1 : step;
        return Math.ceil(x / step) * step;
      },
      FLOOR: function (x, step) {
        step = step === undefined ? 1 : step;
        return Math.floor(x / step) * step;
      },
      ABS: function (x) { return Math.abs(x); }
    };

    function peek(type) { return tokens[pos].type === type; }
    function take(type) {
      const token = tokens[pos];
      if (token.type !== type) throw new Error('Expected ' + type + ', got ' + token.type);
      pos++;
      return token;
    }
    function expression() {
      let v = term();
      while (peek('+') || peek('-')) {
        const op = tokens[pos++].type;
        const r = term();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    function term() {
      let v = power();
      while (peek('*') || peek('/')) {
        const op = tokens[pos++].type;
        const r = power();
        if (op === '/' && r === 0) throw new Error('Division by zero');
        v = op === '*' ? v * r : v / r;
      }
      return v;
    }
    function power() {
      let v = unary();
      if (peek('^')) {
        pos++;
        v = Math.pow(v, power());
      }
      return v;
    }
    function unary() {
      if (peek('+')) { pos++; return unary(); }
      if (peek('-')) { pos++; return -unary(); }
      return primary();
    }
    function primary() {
      if (peek('number')) return take('number').value;
      if (peek('(')) {
        take('(');
        const v = expression();
        take(')');
        return v;
      }
      if (peek('id')) {
        const name = take('id').value;
        if (peek('(')) {
          take('(');
          const args = [];
          if (!peek(')')) {
            args.push(expression());
            while (peek(',')) {
              take(',');
              args.push(expression());
            }
          }
          take(')');
          if (!fns[name]) throw new Error('Unsupported function: ' + name);
          return fns[name].apply(null, args);
        }
        if (!(name in vars)) throw new Error('Unknown variable: ' + name);
        return vars[name];
      }
      throw new Error('Unexpected token: ' + tokens[pos].type);
    }

    const out = expression();
    take('eof');
    if (!Number.isFinite(out)) throw new Error('Formula result is not finite');
    return out;
  }

  function roundTo(value, step, mode) {
    step = Number(step) || 1;
    const q = Number(value) / step;
    const n = mode === 'FLOOR' ? Math.floor(q) : mode === 'ROUND' ? Math.round(q) : Math.ceil(q);
    return Number((n * step).toFixed(8));
  }

  function normalizeAnchors(anchors) {
    const normalized = (anchors || []).map(function (x) {
      return { cost: Number(x.cost), gm: Number(x.gm) };
    }).filter(function (x) {
      return x.cost > 0 && x.gm > 0 && x.gm < 100 && Number.isFinite(x.cost) && Number.isFinite(x.gm);
    }).sort(function (a, b) { return a.cost - b.cost; });
    if (normalized.length < 2) throw new Error('Historical curve requires at least 2 valid anchors');
    return normalized;
  }

  function historicalGM(cost, anchors) {
    cost = Number(cost);
    if (!(cost > 0)) throw new Error('Cost must be > 0');
    const a = normalizeAnchors(anchors);
    if (cost <= a[0].cost) return a[0].gm;
    if (cost >= a[a.length - 1].cost) return a[a.length - 1].gm;
    for (let i = 0; i < a.length - 1; i++) {
      const lo = a[i];
      const hi = a[i + 1];
      if (cost >= lo.cost && cost <= hi.cost) {
        const x = Math.log10(cost);
        const x0 = Math.log10(lo.cost);
        const x1 = Math.log10(hi.cost);
        const t = (x - x0) / (x1 - x0);
        return lo.gm + t * (hi.gm - lo.gm);
      }
    }
    return a[a.length - 1].gm;
  }

  function grossMargin(cost, price) {
    cost = Number(cost);
    price = Number(price);
    return price > 0 ? ((price - cost) / price) * 100 : NaN;
  }

  function markup(cost, price) {
    cost = Number(cost);
    price = Number(price);
    return cost > 0 ? ((price - cost) / cost) * 100 : NaN;
  }

  function resolveSettings(settings) {
    const base = cloneDefaultSettings();
    if (!settings) return base;
    if (settings.roundingStep !== undefined) base.roundingStep = Number(settings.roundingStep);
    if (settings.roundingMode) base.roundingMode = settings.roundingMode;
    if (settings.formulas) {
      const allowed = ['ipd', 'rubOpd', 'rubIpd', 'foreignOpd', 'foreignIpd'];
      allowed.forEach(function (key) {
        if (settings.formulas[key]) base.formulas[key] = settings.formulas[key];
      });
    }
    if (Array.isArray(settings.anchors)) base.anchors = settings.anchors;
    return base;
  }

  function deriveTariffs(input, settings) {
    settings = resolveSettings(settings);
    const opd = Number(input.opd);
    const cost = Number(input.cost || 0);
    if (!(opd >= 0) || !Number.isFinite(opd)) throw new Error('OPD must be a valid number ≥ 0');

    const actualGM = opd > 0 ? grossMargin(cost, opd) : 0;
    const vars0 = { OPD: opd, COST: cost, GM: actualGM };
    let ipd;
    if (input.ipdOverride !== undefined && input.ipdOverride !== null && input.ipdOverride !== '') {
      ipd = roundTo(Number(input.ipdOverride), settings.roundingStep, settings.roundingMode);
    } else {
      ipd = roundTo(evaluateFormula(settings.formulas.ipd, vars0), settings.roundingStep, settings.roundingMode);
    }

    const vars = { OPD: opd, IPD: ipd, COST: cost, GM: actualGM };
    const rubOpd = roundTo(evaluateFormula(settings.formulas.rubOpd, vars), settings.roundingStep, settings.roundingMode);
    const rubIpd = roundTo(evaluateFormula(settings.formulas.rubIpd, vars), settings.roundingStep, settings.roundingMode);
    const foreignOpd = roundTo(evaluateFormula(settings.formulas.foreignOpd, vars), settings.roundingStep, settings.roundingMode);
    const foreignIpd = roundTo(evaluateFormula(settings.formulas.foreignIpd, vars), settings.roundingStep, settings.roundingMode);

    // Source-derived net targets:
    // Gov net target  = MAX(OPD, CEIL(IPD * 70%))
    // NHSO net target = MAX(OPD, CEIL(IPD * 60%))
    // Database tariffs are GROSS prices BEFORE the patient discount is applied.
    const govFromIpdNet = roundTo(ipd * GOV_FACTOR, 1, 'CEIL');
    const nhsoFromIpdNet = roundTo(ipd * NHSO_FACTOR, 1, 'CEIL');
    const govNetTarget = Math.max(opd, govFromIpdNet);
    const nhsoNetTarget = Math.max(opd, nhsoFromIpdNet);

    // Gross-up the target net prices. Whole-baht ceiling is mandatory so the
    // realized amount after discount can never fall below the target net price.
    const govGrossTariff = roundTo(govNetTarget / GOV_FACTOR, 1, 'CEIL');
    const nhsoGrossTariff = roundTo(nhsoNetTarget / NHSO_FACTOR, 1, 'CEIL');

    const govAfterDiscount = Number((govGrossTariff * GOV_FACTOR).toFixed(2));
    const nhsoAfterDiscount = Number((nhsoGrossTariff * NHSO_FACTOR).toFixed(2));

    return {
      opd: opd,
      ipd: ipd,
      rubOpd: rubOpd,
      rubIpd: rubIpd,
      foreignOpd: foreignOpd,
      foreignIpd: foreignIpd,

      govDiscountRate: GOV_DISCOUNT_RATE,
      nhsoDiscountRate: NHSO_DISCOUNT_RATE,
      govFromIpdNet: govFromIpdNet,
      nhsoFromIpdNet: nhsoFromIpdNet,
      govNetTarget: govNetTarget,
      nhsoNetTarget: nhsoNetTarget,
      govGrossTariff: govGrossTariff,
      nhsoGrossTariff: nhsoGrossTariff,
      govAfterDiscount: govAfterDiscount,
      nhsoAfterDiscount: nhsoAfterDiscount,
      govNetGM: govAfterDiscount > 0 ? grossMargin(cost, govAfterDiscount) : 0,
      nhsoNetGM: nhsoAfterDiscount > 0 ? grossMargin(cost, nhsoAfterDiscount) : 0,

      // Backward-compatible aliases: these now mean GROSS list tariffs.
      govOpd: govGrossTariff,
      nhsoOpd: nhsoGrossTariff,
      govPreFloor: govFromIpdNet,
      nhsoPreFloor: nhsoFromIpdNet,

      ipdRatio: opd > 0 ? ipd / opd : 0,
      govFloorApplied: govFromIpdNet < opd,
      nhsoFloorApplied: nhsoFromIpdNet < opd
    };
  }

  function calculate(input, settings) {
    settings = resolveSettings(settings);
    const cost = Number(input.cost);
    if (!(cost >= 0) || !Number.isFinite(cost)) throw new Error('Cost must be a valid number ≥ 0');

    const mode = input.mode || 'historical';
    const histGM = cost > 0 ? historicalGM(cost, settings.anchors) : 0;
    let targetGM = null;
    let opd;

    if (mode === 'price') {
      opd = Number(input.desiredPrice);
      if (!(opd > 0)) throw new Error('Desired OPD must be > 0');
      opd = roundTo(opd, settings.roundingStep, settings.roundingMode);
    } else {
      targetGM = mode === 'gm' ? Number(input.targetGM) : histGM;
      if (!(targetGM >= 0 && targetGM < 100)) throw new Error('Target GM must be between 0 and <100%');
      opd = cost === 0 ? 0 : cost / (1 - targetGM / 100);
      opd = roundTo(opd, settings.roundingStep, settings.roundingMode);
    }

    const actualGM = opd > 0 ? grossMargin(cost, opd) : 0;
    const tariffs = deriveTariffs({ cost: cost, opd: opd }, settings);
    const reason = input.reason || 'new';
    const oldPrice = Number(input.oldPrice) || 0;
    const alerts = [];

    if (opd < cost) alerts.push('OPD ต่ำกว่าต้นทุน');
    if (reason === 'code' && oldPrice > 0 && Math.abs(opd - oldPrice) > 0.01) {
      alerts.push('Code/Vendor change: ควรตรวจสอบการคงราคาเดิม');
    }
    if (reason === 'replacement' && oldPrice > 0) {
      alerts.push('Replacement anchor: ราคาเดิม ' + oldPrice.toLocaleString('th-TH') + ' บาท');
    }
    if ((reason === 'specific' || reason === 'highcost') && cost >= 10000) {
      alerts.push('High-cost/specific case: ควรตรวจ market/reimbursement ceiling ก่อนอนุมัติ');
    }
    if (mode === 'price' && Math.abs(actualGM - histGM) >= 10) {
      alerts.push('Actual GM ต่างจาก historical curve ' + Math.abs(actualGM - histGM).toFixed(1) + ' จุด');
    }

    return Object.assign({
      cost: cost,
      mode: mode,
      reason: reason,
      targetGM: targetGM,
      historicalGM: histGM,
      actualGM: actualGM,
      markup: markup(cost, opd),
      alerts: alerts
    }, tariffs);
  }

  return {
    DEFAULT_ANCHORS: DEFAULT_ANCHORS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    GOV_DISCOUNT_RATE: GOV_DISCOUNT_RATE,
    NHSO_DISCOUNT_RATE: NHSO_DISCOUNT_RATE,
    cloneDefaultSettings: cloneDefaultSettings,
    evaluateFormula: evaluateFormula,
    historicalGM: historicalGM,
    deriveTariffs: deriveTariffs,
    calculate: calculate,
    grossMargin: grossMargin,
    markup: markup,
    roundTo: roundTo
  };
});
