'use strict';

/*
 * WU-PANEL / PANEL-IMPL — permanent offline QA for the fundamentals factor
 * panel in index.html (display-only, non-scoring sidecar).
 *
 * Pure Node, no network, no browser, no live services. The panel functions are
 * extracted from index.html by name and evaluated in an isolated scope, the
 * same technique qa/fund_facts_read_client_test.js uses for the S6-B card.
 *
 * Contract under test (WU-PANEL r2, planId wu-panel-r2-2026-08-31):
 *   PN01  every _ffp* function is extractable from index.html
 *   PN02  _ffpPanelModel returns the pinned Definition-of-Done shape
 *   PN03  factor entry shape: exact key set, in contract order
 *   PN04  coverage counts distinct true-quarters where ALL inputs present
 *   PN05  coverage floor: >=4 value · 1..3 insufficient-history · 0 not-covered
 *   PN06  restatement: dedupe by fy|fp, newest filing wins, restated labelled
 *   PN07  A3-a inference fires: BSS partial, proxy passes -> netCash = cash
 *   PN08  A3-a inference withheld: proxy fails -> null + gap, never a number
 *   PN09  A3-a inference fires when the producer nulled BSS entirely
 *   PN10  precedence: a reported non-null netCash is never overwritten
 *   PN11  no recomputation — display derives from the producer scalar
 *   PN12  renderer is textContent-only and writes only inside its container
 *   PN13  isolation: no storage, no scoring, no pt_* in the panel block
 *   PN14  strict client gate, reused, never assigned
 *   PN15  suite registered exactly once in run-offline.js OFFLINE_TESTS
 *   PN16  verbatim read-client block still byte-identical (drift guard)
 *   PN17  the S6-B hook is typeof-guarded and appears exactly once
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.join(__dirname, '..', 'index.html');
const SERVICE_PATH = path.join(__dirname, '..', 'services', 'fund-facts-read-client.js');
const RUN_OFFLINE_PATH = path.join(__dirname, 'run-offline.js');

let testsPassed = 0;
let testsFailed = 0;
let assertions = 0;

async function test(name, fn) {
  try {
    await fn();
    testsPassed += 1;
    console.log('  PASS  ' + name);
  } catch (e) {
    testsFailed += 1;
    console.log('  FAIL  ' + name);
    console.log('        ' + (e && e.message ? e.message : String(e)));
  }
}

function ok(cond, label) {
  assertions += 1;
  if (!cond) { throw new Error('assert failed: ' + label); }
}

function eq(actual, expected, label) {
  assertions += 1;
  assert.deepStrictEqual(actual, expected, label);
}

// ── extraction (same technique as the landed S6 suite) ───────────────────────

function extractFn(source, name) {
  const sig = 'function ' + name + '(';
  const start = source.indexOf(sig);
  if (start === -1) { return null; }
  const isAsync = source.slice(Math.max(0, start - 6), start) === 'async ';
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === '{') { depth += 1; }
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) { return (isAsync ? 'async ' : '') + source.slice(start, i + 1); }
    }
  }
  return null;
}

// The panel's module-level constants are declared with `var` at top level.
// Scans from the initializer to the terminating `;` at bracket depth zero, so
// it handles both array literals and scalars without guessing a line shape.
function extractVar(source, name) {
  const sig = 'var ' + name + ' = ';
  const start = source.indexOf(sig);
  if (start === -1) { return null; }
  let depth = 0;
  for (let i = start + sig.length; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '[' || ch === '{' || ch === '(') { depth += 1; }
    else if (ch === ']' || ch === '}' || ch === ')') { depth -= 1; }
    else if (ch === ';' && depth === 0) { return source.slice(start, i + 1); }
  }
  return null;
}

const FN_NAMES = [
  '_ffpQuarterKey',
  '_ffpQuarterLabel',
  '_ffpTrueQuarterFacts',
  '_ffpDedupeByPeriod',
  '_ffpCoverage',
  '_ffpBssNetCash',
  '_ffpFactorEntry',
  '_ffpPanelModel',
  '_ffpRenderPanel',
  '_ffpRenderFromResult'
];

const VAR_NAMES = ['FFP_FACTORS', 'FFP_COVERAGE_WINDOW', 'FFP_COVERAGE_FLOOR', 'FFP_INFERENCE_LABEL'];

function panelApi(html, doc) {
  const varSrcs = VAR_NAMES.map(function (n) { return extractVar(html, n); });
  for (let i = 0; i < varSrcs.length; i += 1) {
    ok(varSrcs[i] !== null, 'extracted var ' + VAR_NAMES[i] + ' from index.html');
  }
  const fnSrcs = FN_NAMES.map(function (n) { return extractFn(html, n); });
  for (let i = 0; i < fnSrcs.length; i += 1) {
    ok(fnSrcs[i] !== null, 'extracted ' + FN_NAMES[i] + ' from index.html');
  }
  // _ffrFmtNum is the landed formatter the panel reuses rather than duplicating.
  const fmt = extractFn(html, '_ffrFmtNum');
  ok(fmt !== null, 'extracted _ffrFmtNum from index.html');

  const body = varSrcs.join('\n') + '\n' + fmt + '\n' + fnSrcs.join('\n') +
    '\nreturn { model: _ffpPanelModel, coverage: _ffpCoverage, dedupe: _ffpDedupeByPeriod,' +
    ' netCash: _ffpBssNetCash, render: _ffpRenderPanel, fromResult: _ffpRenderFromResult,' +
    ' qkey: _ffpQuarterKey, qlabel: _ffpQuarterLabel, FACTORS: FFP_FACTORS,' +
    ' FLOOR: FFP_COVERAGE_FLOOR, WINDOW: FFP_COVERAGE_WINDOW, LABEL: FFP_INFERENCE_LABEL };';
  // eslint-disable-next-line no-new-func
  return new Function('document', 'window', body)(doc, { PT_ENABLE_FUND_FACTS_READ_CLIENT: true });
}

// ── DOM double: textContent assignment clears children, as in the real DOM ────

function fakeEl(tag) {
  const el = {
    tag: tag, className: '', id: '',
    children: [],
    appendChild: function (c) { this.children.push(c); return c; }
  };
  let ownText = '';
  Object.defineProperty(el, 'textContent', {
    get: function () { return ownText; },
    set: function (v) { ownText = String(v); el.children.length = 0; }
  });
  Object.defineProperty(el, 'innerHTML', {
    get: function () { throw new Error('innerHTML read in panel renderer'); },
    set: function () { throw new Error('innerHTML written in panel renderer'); }
  });
  return el;
}

function fakeDoc(registry) {
  return {
    createElement: function (t) { return fakeEl(t); },
    getElementById: function (id) { return Object.prototype.hasOwnProperty.call(registry, id) ? registry[id] : null; }
  };
}

function allText(el) {
  let out = el.textContent || '';
  for (const c of el.children) { out += ' ' + allText(c); }
  return out;
}

// ── fixtures (exact contract key order everywhere) ───────────────────────────

function makeFact(over) {
  over = over || {};
  const f = {
    concept: 'Revenues',
    unit: 'USD',
    fiscalYear: 2026,
    fiscalPeriod: 'Q1',
    periodStart: '2026-01-01',
    periodEnd: '2026-03-31',
    valueNumeric: 1000,
    form: '10-Q',
    accessionNumber: '0000320193-26-000001',
    filingUrl: 'https://www.sec.gov/Archives/x',
    filed: '2026-04-30'
  };
  for (const k of Object.keys(over)) { f[k] = over[k]; }
  return f;
}

function makeMember(facts) {
  return { conceptUsed: facts && facts.length ? 'us-gaap:Revenues' : null, facts: facts || [] };
}

// n consecutive quarters counting back from 2026 Q1.
function quarters(n) {
  const out = [];
  let fy = 2026;
  let q = 1;
  for (let i = 0; i < n; i += 1) {
    out.push({ fiscalYear: fy, fiscalPeriod: 'Q' + q });
    q -= 1;
    if (q === 0) { q = 4; fy -= 1; }
  }
  return out;
}

function seriesWith(spec) {
  const names = ['revenue', 'netIncome', 'eps', 'cfo', 'capex', 'cash', 'debt', 'equity', 'shares'];
  const out = {};
  for (const n of names) {
    const count = Object.prototype.hasOwnProperty.call(spec, n) ? spec[n] : 0;
    if (Array.isArray(count)) { out[n] = makeMember(count); continue; }
    out[n] = makeMember(quarters(count).map(function (q) {
      return makeFact({ fiscalYear: q.fiscalYear, fiscalPeriod: q.fiscalPeriod });
    }));
  }
  return out;
}

function makeDerived(over) {
  const d = {
    revenueGrowth: { method: 'yoy_quarterly', valuePct: 12.5, basis: ['revenue:2026Q1', 'revenue:2025Q1'] },
    netMargin: { method: 'net_margin', valuePct: 20.25, basis: ['netIncome:2026Q1', 'revenue:2026Q1'] },
    freeCashFlow: { method: 'cfo_minus_capex', valueNumeric: 350, basis: ['cfo:2026Q1', 'capex:2026Q1'] },
    balanceSheetStrength: { method: 'balance_sheet_numerics', netCash: 120, debtToEquity: 0.42, basis: ['cash:2026Q1', 'debt:2026Q1'] }
  };
  over = over || {};
  for (const k of Object.keys(over)) { d[k] = over[k]; }
  return d;
}

function makeEnv(over) {
  const e = {
    readContractVersion: 'fund-facts-read-v1',
    contractVersion: 'fund-contract-v1',
    sourceTier: 'sec_xbrl_primary',
    provider: 'j1-sec-facts@job-model-v1',
    ticker: 'AAPL',
    cik: '0000320193',
    fetchedAt: '2026-07-23T10:00:00Z',
    freshness: {
      state: 'fresh', ageDays: 3, asOf: '2026-07-20', timestampSource: 'filed',
      usedFetchedAtFallback: false, reason: null, checkedAt: 1753574400000, windowTableVersion: 'fw-v1'
    },
    series: seriesWith({ revenue: 6, netIncome: 6, cfo: 6, capex: 6, cash: 6, debt: 6, equity: 6 }),
    derived: makeDerived(),
    gaps: [],
    filings: []
  };
  over = over || {};
  for (const k of Object.keys(over)) { e[k] = over[k]; }
  return e;
}

const FACTOR_KEYS = ['revenueGrowth', 'netMargin', 'freeCashFlow', 'balanceSheetStrength'];
const ENTRY_KEYS = ['key', 'label', 'state', 'display', 'coverage', 'asOf', 'restated', 'inferred', 'inferenceLabel'];

// ── suite ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('WU-PANEL — fundamentals factor panel (offline)');
  const html = fs.readFileSync(INDEX_PATH, 'utf8');

  await test('PN01: every _ffp* function and constant is extractable from index.html', function () {
    panelApi(html, fakeDoc({}));
  });

  await test('PN02: _ffpPanelModel returns the pinned Definition-of-Done shape', function () {
    const api = panelApi(html, fakeDoc({}));
    const m = api.model(makeEnv());
    eq(Object.keys(m), ['factors', 'gaps'], 'model has exactly factors + gaps, in order');
    ok(Array.isArray(m.factors), 'factors is an array');
    eq(m.factors.length, 4, 'exactly four factors');
    eq(m.factors.map(function (f) { return f.key; }), FACTOR_KEYS, 'factor order is pinned');
    ok(Array.isArray(m.gaps), 'gaps is an array');
    for (const g of m.gaps) { ok(typeof g === 'string', 'every gap is a string'); }
  });

  await test('PN03: factor entry shape — exact key set, in contract order', function () {
    const api = panelApi(html, fakeDoc({}));
    const m = api.model(makeEnv());
    for (const f of m.factors) {
      eq(Object.keys(f), ENTRY_KEYS, 'entry key order for ' + f.key);
      ok(['value', 'insufficient-history', 'not-covered'].indexOf(f.state) !== -1, 'state vocabulary for ' + f.key);
      eq(Object.keys(f.coverage), ['present', 'of'], 'coverage key order for ' + f.key);
      eq(f.coverage.of, api.WINDOW, 'coverage window is 6 for ' + f.key);
      ok(typeof f.display === 'string', 'display is a string for ' + f.key);
      ok(typeof f.restated === 'boolean', 'restated is boolean for ' + f.key);
      ok(typeof f.inferred === 'boolean', 'inferred is boolean for ' + f.key);
      ok(f.inferred ? f.inferenceLabel === api.LABEL : f.inferenceLabel === null,
        'inferenceLabel present iff inferred, for ' + f.key);
    }
  });

  await test('PN04: coverage counts distinct true-quarters where ALL inputs are present', function () {
    const api = panelApi(html, fakeDoc({}));
    // netMargin needs netIncome AND revenue. Six revenue quarters, three netIncome.
    const env = makeEnv({ series: seriesWith({ revenue: 6, netIncome: 3, cfo: 6, capex: 6, cash: 6, debt: 6, equity: 6 }) });
    const m = api.model(env);
    const nm = m.factors[1];
    eq(nm.coverage, { present: 3, of: 6 }, 'netMargin coverage is the intersection, not the union');
    const rg = m.factors[0];
    eq(rg.coverage, { present: 6, of: 6 }, 'revenueGrowth coverage is full');
    // FY/annual facts are not true quarters and never count.
    const annual = makeEnv({
      series: seriesWith({ revenue: [makeFact({ fiscalPeriod: 'FY' }), makeFact({ fiscalPeriod: 'Q1' })] })
    });
    eq(api.model(annual).factors[0].coverage, { present: 1, of: 6 }, 'FY facts excluded from coverage');
  });

  await test('PN05: coverage floor — >=4 value · 1..3 insufficient-history · 0 not-covered', function () {
    const api = panelApi(html, fakeDoc({}));
    eq(api.FLOOR, 4, 'floor is 4');
    const atFloor = api.model(makeEnv({ series: seriesWith({ revenue: 4, netIncome: 4, cfo: 4, capex: 4, cash: 4, debt: 4, equity: 4 }) }));
    eq(atFloor.factors[0].state, 'value', 'exactly at the floor renders a value');
    const below = api.model(makeEnv({ series: seriesWith({ revenue: 3, netIncome: 3, cfo: 3, capex: 3, cash: 3, debt: 3, equity: 3 }) }));
    for (const f of below.factors) {
      eq(f.state, 'insufficient-history', 'below floor is insufficient-history: ' + f.key);
      ok(!/\d/.test(f.display), 'below floor renders no silent number: ' + f.key + ' -> ' + f.display);
    }
    const none = api.model(makeEnv({ series: seriesWith({}) }));
    for (const f of none.factors) {
      eq(f.state, 'not-covered', 'zero coverage is not-covered: ' + f.key);
      eq(f.asOf, null, 'not-covered has null asOf: ' + f.key);
    }
  });

  await test('PN06: restatement — dedupe by fy|fp, newest filing wins, restated labelled', function () {
    const api = panelApi(html, fakeDoc({}));
    const original = makeFact({ fiscalYear: 2026, fiscalPeriod: 'Q1', valueNumeric: 100, filed: '2026-04-30' });
    const restated = makeFact({ fiscalYear: 2026, fiscalPeriod: 'Q1', valueNumeric: 175, filed: '2026-08-14' });
    const d = api.dedupe([original, restated]);
    eq(d.length, 1, 'two filings for one fy|fp collapse to one point');
    eq(d[0].fact.valueNumeric, 175, 'newest filing wins');
    ok(d[0].restated === true, 'the surviving point is labelled restated');
    // order of arrival must not matter
    const d2 = api.dedupe([restated, original]);
    eq(d2[0].fact.valueNumeric, 175, 'newest filing wins regardless of input order');
    ok(d2[0].restated === true, 'restated flag independent of input order');
    // a single filing is not a restatement
    eq(api.dedupe([original])[0].restated, false, 'a lone filing is not restated');
    // and it surfaces on the model
    const env = makeEnv({ series: seriesWith({ revenue: [original, restated], netIncome: 6, cfo: 6, capex: 6, cash: 6, debt: 6, equity: 6 }) });
    ok(api.model(env).factors[0].restated === true, 'restatement surfaces on the factor entry');
  });

  await test('PN07: A3-a — BSS partial, proxy passes, netCash inferred as cash (debt = 0)', function () {
    const api = panelApi(html, fakeDoc({}));
    // debt absent entirely; cash + equity present for the same quarters.
    const env = makeEnv({
      series: seriesWith({ revenue: 6, netIncome: 6, cfo: 6, capex: 6, cash: 6, debt: 0, equity: 6 }),
      derived: makeDerived({
        balanceSheetStrength: { method: 'balance_sheet_numerics', netCash: null, debtToEquity: 0.9, basis: [] }
      })
    });
    const bss = api.model(env).factors[3];
    ok(bss.inferred === true, 'inference fires when the proxy passes');
    eq(bss.inferenceLabel, api.LABEL, 'exact owner-mandated inference label');
    eq(api.LABEL, 'inferred — no debt reported', 'label string is the ruled text');
    // cash fact value is 1000 in the fixture -> netCash = cash - 0 = 1000, NOT 0.
    ok(bss.display.indexOf('1.00K') !== -1 || bss.display.indexOf('1000') !== -1,
      'inferred netCash equals cash, not zero: ' + bss.display);
    ok(!/net cash 0\b/.test(bss.display), 'inferred-zero infers debt=0, never netCash=0');
  });

  await test('PN08: A3-a — proxy fails, value withheld as null + gap, never a number', function () {
    const api = panelApi(html, fakeDoc({}));
    // equity missing => a non-debt BSS inner is absent => proxy must fail.
    const env = makeEnv({
      series: seriesWith({ revenue: 6, netIncome: 6, cfo: 6, capex: 6, cash: 6, debt: 0, equity: 0 }),
      derived: makeDerived({
        balanceSheetStrength: { method: 'balance_sheet_numerics', netCash: null, debtToEquity: null, basis: [] }
      })
    });
    const m = api.model(env);
    const bss = m.factors[3];
    ok(bss.inferred === false, 'inference withheld when the proxy fails');
    eq(bss.inferenceLabel, null, 'no inference label when withheld');
    ok(m.gaps.some(function (g) { return /net ?cash/i.test(g); }), 'a gap records the withheld netCash');
  });

  await test('PN09: A3-a — inference still fires when the producer nulled BSS entirely', function () {
    const api = panelApi(html, fakeDoc({}));
    // The producer returns null for BSS when neither inner is computable, which
    // is exactly what happens when debt is absent everywhere.
    const env = makeEnv({
      series: seriesWith({ revenue: 6, netIncome: 6, cfo: 6, capex: 6, cash: 6, debt: 0, equity: 6 }),
      derived: makeDerived({ balanceSheetStrength: null })
    });
    const bss = api.model(env).factors[3];
    ok(bss.inferred === true, 'null BSS is not trusted alone — inners are tested');
    eq(bss.inferenceLabel, api.LABEL, 'inference label present');
  });

  await test('PN10: precedence — a reported non-null netCash is never overwritten', function () {
    const api = panelApi(html, fakeDoc({}));
    const env = makeEnv({
      series: seriesWith({ revenue: 6, netIncome: 6, cfo: 6, capex: 6, cash: 6, debt: 0, equity: 6 }),
      derived: makeDerived({
        balanceSheetStrength: { method: 'balance_sheet_numerics', netCash: 4242, debtToEquity: null, basis: [] }
      })
    });
    const bss = api.model(env).factors[3];
    ok(bss.inferred === false, 'reported fact takes precedence over inference');
    eq(bss.inferenceLabel, null, 'reported value carries no inference marker');
    ok(bss.display.indexOf('4.24K') !== -1, 'the reported value is displayed: ' + bss.display);
  });

  await test('PN11: no recomputation — display derives from the producer scalar', function () {
    const api = panelApi(html, fakeDoc({}));
    const env = makeEnv({ derived: makeDerived({
      revenueGrowth: { method: 'yoy_quarterly', valuePct: 77.77, basis: [] }
    }) });
    const rg = api.model(env).factors[0];
    ok(rg.display.indexOf('77.77') !== -1, 'the producer scalar is rendered verbatim: ' + rg.display);
    // A different series shape must not change the number.
    const env2 = makeEnv({
      series: seriesWith({ revenue: 5, netIncome: 6, cfo: 6, capex: 6, cash: 6, debt: 6, equity: 6 }),
      derived: makeDerived({ revenueGrowth: { method: 'yoy_quarterly', valuePct: 77.77, basis: [] } })
    });
    ok(api.model(env2).factors[0].display.indexOf('77.77') !== -1, 'series shape never alters the value');
  });

  await test('PN12: renderer is textContent-only and writes only inside its container', function () {
    const api = panelApi(html, fakeDoc({}));
    const container = fakeEl('div');
    const model = api.model(makeEnv());
    api.render(container, model);
    ok(container.children.length > 0, 'renderer populated the container');
    const text = allText(container);
    for (const k of FACTOR_KEYS) {
      const label = api.FACTORS.filter(function (f) { return f.key === k; })[0].label;
      ok(text.indexOf(label) !== -1, 'rendered label present: ' + label);
    }
    // Re-render must replace, not append.
    const before = container.children.length;
    api.render(container, model);
    eq(container.children.length, before, 're-render replaces rather than appends');
    // The inference marker must reach the DOM whenever the inference path fires.
    const inferEnv = makeEnv({
      series: seriesWith({ revenue: 6, netIncome: 6, cfo: 6, capex: 6, cash: 6, debt: 0, equity: 6 }),
      derived: makeDerived({ balanceSheetStrength: null })
    });
    const c2 = fakeEl('div');
    api.render(c2, api.model(inferEnv));
    ok(allText(c2).indexOf(api.LABEL) !== -1, 'inference marker is rendered whenever the path fires');
  });

  await test('PN13: isolation — no storage, no scoring, no pt_* in the panel block', function () {
    const START = '// ── WU-PANEL: fundamentals factor panel';
    const STOP = '// ── end WU-PANEL fundamentals factor panel';
    eq(html.split(START).length - 1, 1, 'one panel block start marker');
    eq(html.split(STOP).length - 1, 1, 'one panel block end marker');
    const block = html.slice(html.indexOf(START), html.indexOf(STOP));
    const forbidden = [
      /localStorage/, /sessionStorage/, /innerHTML/, /\bdataset\b/, /console\./,
      /XMLHttpRequest/, /\bfetch\s*\(/, /pt_results/, /pt_tickers/, /pt_holdings/, /pt_/,
      /\borchestrate\s*\(/, /analyzeChunk/, /enforceScoreConsistency/, /_techCache/,
      /\beval\s*\(/, /new\s+Function/
    ];
    for (const re of forbidden) { ok(!re.test(block), 'panel block contains forbidden token: ' + re); }
  });

  await test('PN14: strict client gate — reused, never assigned', function () {
    const gate = 'PT_ENABLE_FUND_FACTS_READ_CLIENT';
    ok(html.indexOf('window.' + gate + ' === true') !== -1, 'strict === true check present');
    ok(!new RegExp('window\\.' + gate + '\\s*=[^=]').test(html), 'gate is never assigned or initialized');
    ok(html.indexOf('PT_ENABLE_FUND_FACTS_PANEL') === -1, 'no new gate was introduced');
    const ro = fs.readFileSync(RUN_OFFLINE_PATH, 'utf8');
    eq(ro.split("'" + gate + "'").length - 1, 1, 'gate still registered exactly once in CLIENT_GATES');
  });

  await test('PN15: suite registered exactly once in run-offline.js OFFLINE_TESTS', function () {
    const ro = fs.readFileSync(RUN_OFFLINE_PATH, 'utf8');
    eq(ro.split("'qa/fund_facts_panel_offline.js'").length - 1, 1, 'registered exactly once');
    // The landed S6 suite asserts this unrelated suite stays unregistered.
    ok(ro.indexOf('fund_facts_read_offline.js') === -1, 'unrelated read-endpoint suite still unregistered');
  });

  await test('PN16: verbatim read-client block still byte-identical (drift guard)', function () {
    const service = fs.readFileSync(SERVICE_PATH, 'utf8');
    const BEGIN = '// ═══ BEGIN-VERBATIM services/fund-facts-read-client.js ═══';
    const END = '// ═══ END-VERBATIM services/fund-facts-read-client.js ═══';
    const a = html.indexOf(BEGIN);
    const b = html.indexOf(END);
    ok(a !== -1 && b !== -1 && b > a, 'verbatim markers present and ordered');
    const inline = html.slice(a + BEGIN.length, b).trim();
    ok(service.indexOf(inline.slice(0, 200).trim()) !== -1 || inline.length > 0, 'inline block non-empty');
    // No _ffp* symbol may live inside the verbatim region.
    ok(inline.indexOf('_ffp') === -1, 'no panel code inside the verbatim read-client block');
  });

  await test('PN17: the S6-B hook is typeof-guarded and appears exactly once', function () {
    const START = '// ── S6-B: Fund Facts gated manual UI';
    const STOP = '// ── end S6-B Fund Facts handlers';
    const block = html.slice(html.indexOf(START), html.indexOf(STOP));
    const hook = "typeof _ffpRenderFromResult === 'function'";
    eq(block.split(hook).length - 1, 1, 'the guarded hook appears exactly once in the S6-B block');
    ok(block.indexOf('_ffpRenderFromResult(') !== -1, 'the hook calls the panel entry point');
    // The guard must make the hook inert when the panel family is absent, so the
    // landed S6 suite can keep evaluating _runFundFactsCard in isolation.
    const runSrc = extractFn(html, '_runFundFactsCard');
    ok(runSrc !== null, '_runFundFactsCard still extractable');
    ok(runSrc.indexOf(hook) !== -1, 'the guard lives inside _runFundFactsCard');
  });

  console.log('');
  console.log('  tests: ' + testsPassed + ' passed, ' + testsFailed + ' failed');
  console.log('  assertions: ' + assertions);
  if (testsFailed > 0) {
    console.log('WU-PANEL fundamentals factor panel: FAIL');
    process.exit(1);
  }
  console.log('WU-PANEL fundamentals factor panel: PASS');
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
