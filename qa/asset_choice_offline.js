'use strict';
/*
 * asset_choice_offline.js — surface-2 (Entry 12, P2b): explicit ETF / Stock choice per ticker, persisted through
 * the watchlist, backup and cloud sync. Rows AC-1..AC-13 map 1:1 to work/surface-2/brief.md section T.
 * Offline: no network, no browser, no real storage, no file writes. The REAL source of index.html and
 * netlify/functions/portfolio-sync.js is extracted by text and run in a sandbox with DOM / storage stubs.
 * Oracle: the pre-feature functions come from `git show 105b9f9:<file>`, read once at start-up (a read-only git read).
 * Planted negatives mutate an in-memory COPY of the production source (never the file on disk); each anchor must
 * occur exactly once, and the named row must then FAIL while the unmutated source passes it.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { execFileSync } = require('child_process');
const acorn = require('acorn');

const ROOT = path.join(__dirname, '..');
const lf = s => s.replace(/\r\n/g, '\n');
const SRC = lf(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
const SRV = lf(fs.readFileSync(path.join(ROOT, 'netlify', 'functions', 'portfolio-sync.js'), 'utf8'));
const ORACLE_COMMIT = '105b9f9';
// Computed ONCE, then asserted against the stored value (qa-suites rule).
const gitShow = p => lf(execFileSync('git', ['show', ORACLE_COMMIT + ':' + p], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const OLD_SRC = gitShow('index.html');
const OLD_SRV = gitShow('netlify/functions/portfolio-sync.js');

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const countOf = (h, n) => h.split(n).length - 1;

// Column-0 rule: a top-level function runs from its declaration to the first "\n}\n" after it.
function colFn(src, name) {
  const i = src.search(new RegExp('^(?:async )?function ' + name + '\\(', 'm'));
  if (i === -1) throw new Error('no top-level ' + name);
  return src.slice(i, src.indexOf('\n}\n', i) + 2);
}
function tickerLiteral(src) {
  const i = src.indexOf('const TICKER_DEFAULTS = {');
  if (i === -1) throw new Error('no TICKER_DEFAULTS');
  return src.slice(i, src.indexOf('\n};\n', i) + 3);
}
function classifierBlock(src) {
  const m = /\/\/ Entry 12 \/ P2a[\s\S]*?var PT_ETF_FUNDAMENTALS_NA_TEXT = '[^']*';/.exec(src);
  if (!m) throw new Error('no classifier block');
  return m[0];
}
function selectCatsLine(src) {
  const m = /^ *const _selectCats = [^\n]*$/m.exec(src);
  if (!m) throw new Error('no _selectCats');
  return m[0];
}
const parses = code => { acorn.parse(code, { ecmaVersion: 2022, sourceType: 'script' }); return true; };

// ── model sandbox: real classifier block + real model functions around a mutable `watchlist` ──────────────
// `modelSrc` supplies migrateWatchlist / saveWatchlist (the oracle passes the pre-feature source); `src` the rest.
function model(src, modelSrc) {
  const store = {};
  const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const body = [
    "const MY_PORTFOLIO = ['AAA', 'BBB'];",
    tickerLiteral(src),
    classifierBlock(src),
    colFn(src, 'getTickerDefaults'),
    colFn(src, '_normalizePosition'),
    colFn(src, '_buildEntry'),
    colFn(modelSrc, 'migrateWatchlist'),
    'let watchlist = [];',
    colFn(modelSrc, 'saveWatchlist'),
    'return { ptAssetType, ptEffectiveAssetType: typeof ptEffectiveAssetType === "function" ? ptEffectiveAssetType : undefined,',
    '  migrateWatchlist, saveWatchlist, setWL: v => { watchlist = v; }, getWL: () => watchlist };'
  ].join('\n');
  const api = new Function('localStorage', body)(ls);
  api.store = store;
  return api;
}
// Wrapper alone, with `watchlist` optionally undefined (isolated sandboxes).
function wrapperOnly(src, wl, withWatchlist) {
  const body = tickerLiteral(src) + '\n' + classifierBlock(src) + '\nreturn ptEffectiveAssetType;';
  return withWatchlist === false ? new Function(body)() : new Function('watchlist', body)(wl);
}

// ── card sandboxes (as in asset_type_offline.js, plus an in-memory watchlist) ─────────────────────────────
async function runCR(src, sym, wl) {
  const calls = { fetch: 0 };
  const btn = { disabled: false, textContent: '' };
  const panel = { textContent: '', innerHTML: '' };
  const doc = { getElementById: id => (id === 'cr-res-btn-' + sym ? btn : id === 'cr-res-panel-' + sym ? panel : null) };
  const fetchSpy = async () => { calls.fetch += 1; return { ok: true, status: 200, text: async () => '{"status":"OK"}' }; };
  const fn = new Function('document', 'window', 'fetch', '_renderCapitalReturnsPanel', 'watchlist',
    tickerLiteral(src) + '\n' + classifierBlock(src) + '\n' + colFn(src, '_runCRResearchCard') + '\nreturn _runCRResearchCard;')(
    doc, {}, fetchSpy, () => 'RENDERED', wl);
  await fn(sym);
  return { calls, panel, btn };
}
async function runFF(src, sym, wl) {
  const calls = { read: 0 };
  const btn = { disabled: false, textContent: '' };
  const input = { value: 'tok' };
  const panel = { textContent: '' };
  const doc = { getElementById: id => (id === 'ffr-btn-' + sym ? btn : id === 'ffr-token-' + sym ? input : id === 'ffr-panel-' + sym ? panel : null) };
  const fn = new Function('document', 'window', 'requestFundFactsRead', '_ffrRenderPanel', '_ffrViewForResult', '_ffrStatusMsg', 'watchlist',
    tickerLiteral(src) + '\n' + classifierBlock(src) + '\n' + colFn(src, '_runFundFactsCard') + '\nreturn _runFundFactsCard;')(
    doc, { PT_ENABLE_FUND_FACTS_READ_CLIENT: true }, async () => { calls.read += 1; return {}; }, () => {}, () => ({}), () => '', wl);
  await fn(sym);
  return { calls, panel, input };
}
const NA_TEXT = 'Not applicable — ETF. SEC company fundamentals apply to operating companies, not funds.';
const STOCK_CATS = ['earnings', 'analyst', 'insider', 'contracts', 'mna', 'buyback', 'risk'];

// ── rows (each a function of the source, so a planted negative can re-run it) ─────────────────────────────
const ROWS = Object.create(null);
const ORDER = [];
const row = (id, fn) => { ROWS[id] = fn; ORDER.push(id); };

const entry = (symbol, extra) => Object.assign({ symbol, name: 'n', exchange: 'x', sector: 's', sectorEtf: 'e', personalNote: '', inScan: true, position: { hasPosition: false, positionValue: null, pnlPercent: null, partialProfitTaken: false } }, extra || {});

row('AC-1 precedence: valid choice beats the classifier; none / invalid -> classifier', async src => {
  const wl = [entry('SPY', { assetType: 'STOCK' }), entry('NVDA', { assetType: 'ETF' }), entry('QQQ'), entry('AAPL', { assetType: 'etf' }),
    entry('XLK', { assetType: 'BOND' }), entry('TAN', { assetType: 42 }), entry('RKLB', { assetType: 'STOCK' })];
  const eff = wrapperOnly(src, wl);
  const cls = model(src, src).ptAssetType;
  assert.strictEqual(eff('SPY'), 'STOCK', 'Stock choice on SPY');
  assert.strictEqual(eff('NVDA'), 'ETF', 'ETF choice on NVDA');
  assert.strictEqual(eff(' spy '), 'STOCK', 'case / whitespace');
  assert.strictEqual(eff('RKLB'), 'STOCK', 'Stock choice on UNKNOWN');
  for (const s of ['QQQ', 'AAPL', 'XLK', 'TAN', 'ZZZZ', 'MSFT']) assert.strictEqual(eff(s), cls(s), 'classifier for ' + s);
  assert.strictEqual(eff('AAPL'), 'STOCK', "'etf' is invalid -> classifier");
  assert.strictEqual(eff('XLK'), 'ETF', "'BOND' is invalid -> classifier");
  assert.strictEqual(eff(null), 'UNKNOWN');
  assert.strictEqual(eff(42), 'UNKNOWN');
  // undefined / non-array watchlist -> classifier, no throw
  assert.strictEqual(wrapperOnly(src, undefined, false)('SPY'), 'ETF');
  assert.strictEqual(wrapperOnly(src, 'oops', true)('SPY'), 'ETF');
  assert.strictEqual(wrapperOnly(src, [null, 7, {}], true)('SPY'), 'ETF');
});

const FIXTURE_LISTS = () => [
  [],
  [entry('NVDA')],
  [entry('SPY'), entry('AAPL', { personalNote: 'note "q" ‮', position: { hasPosition: true, positionValue: 1234.5, pnlPercent: -3.2, partialProfitTaken: true } }), entry('XLK', { name: '' })],
  [entry('TEVA.TA', { sector: 'Pharma' }), entry('BRK.B')]
];
row('AC-2 saveWatchlist byte-identity without choices; with a choice assetType is the last key', async src => {
  const oldM = model(src, OLD_SRC);
  const newM = model(src, src);
  for (const list of FIXTURE_LISTS()) {
    oldM.setWL(JSON.parse(JSON.stringify(list))); oldM.saveWatchlist();
    newM.setWL(JSON.parse(JSON.stringify(list))); newM.saveWatchlist();
    assert.strictEqual(newM.store.pt_tickers, oldM.store.pt_tickers, 'bytes differ for list of ' + list.length);
  }
  // invalid in-memory values are never written
  const bad = [entry('NVDA', { assetType: 'etf' }), entry('SPY', { assetType: 'BOND' }), entry('QQQ', { assetType: undefined })];
  oldM.setWL(JSON.parse(JSON.stringify(bad))); oldM.saveWatchlist();
  newM.setWL(JSON.parse(JSON.stringify(bad))); newM.saveWatchlist();
  assert.strictEqual(newM.store.pt_tickers, oldM.store.pt_tickers, 'invalid choices must serialise like none');
  // with a choice
  newM.setWL([entry('NVDA', { assetType: 'ETF' }), entry('SPY', { assetType: 'STOCK' }), entry('QQQ')]);
  newM.saveWatchlist();
  const out = JSON.parse(newM.store.pt_tickers);
  assert.strictEqual(out[0].assetType, 'ETF');
  assert.strictEqual(out[1].assetType, 'STOCK');
  assert.ok(!('assetType' in out[2]), 'no choice -> no key');
  assert.strictEqual(Object.keys(out[0]).pop(), 'assetType', 'last key (NVDA)');
  assert.strictEqual(Object.keys(out[1]).pop(), 'assetType', 'last key (SPY)');
  assert.deepStrictEqual(Object.keys(out[0]).slice(0, -1), Object.keys(out[2]), 'other keys and order unchanged');
});

row('AC-3 migrateWatchlist keeps valid choices, drops invalid ones; other branches equal the oracle', async src => {
  const oldM = model(src, OLD_SRC);
  const newM = model(src, src);
  const same = [null, undefined, 'not json', '{}', '[]', '42', '["spy","qqq"]', JSON.stringify([entry('NVDA'), entry('SPY'), { nosym: 1 }, null]),
    JSON.stringify([{ symbol: 'ABC' }])];
  for (const raw of same) assert.strictEqual(JSON.stringify(newM.migrateWatchlist(raw)), JSON.stringify(oldM.migrateWatchlist(raw)), 'branch differs for ' + String(raw).slice(0, 30));
  const raw = JSON.stringify([entry('NVDA', { assetType: 'ETF' }), entry('SPY', { assetType: 'STOCK' }), entry('QQQ', { assetType: 'etf' }),
    entry('XLK', { assetType: 'BOND' }), entry('TAN', { assetType: 42 }), entry('AAPL', { assetType: null }), entry('MSFT')]);
  const r = newM.migrateWatchlist(raw);
  assert.strictEqual(r[0].assetType, 'ETF');
  assert.strictEqual(r[1].assetType, 'STOCK');
  for (let i = 2; i < r.length; i++) assert.ok(!('assetType' in r[i]), 'dropped: ' + r[i].symbol);
  // loadWatchlist-style round trip: migrate then save keeps the choice only for valid entries
  newM.setWL(r); newM.saveWatchlist();
  const saved = JSON.parse(newM.store.pt_tickers);
  assert.deepStrictEqual(saved.map(e => e.assetType), ['ETF', 'STOCK', undefined, undefined, undefined, undefined, undefined]);
});

row('AC-4 call sites use the effective type: _selectCats, Capital Returns card, Fund Facts card', async src => {
  const wl = [entry('NVDA', { assetType: 'ETF' }), entry('SPY', { assetType: 'STOCK' }), entry('TAN')];
  const eff = wrapperOnly(src, wl);
  const sel = new Function('ptEffectiveAssetType', 'MAX_CALLS', selectCatsLine(src) + '\nreturn _selectCats;')(eff, 7);
  assert.deepStrictEqual(sel('NVDA'), ['analyst', 'risk'], 'ETF choice on NVDA');
  assert.deepStrictEqual(sel('SPY'), STOCK_CATS, 'Stock choice on SPY');
  assert.deepStrictEqual(sel('TAN'), ['analyst', 'risk'], 'classifier ETF without choice');
  assert.deepStrictEqual(sel('MSFT'), STOCK_CATS);
  const crEtf = await runCR(src, 'NVDA', wl);
  assert.strictEqual(crEtf.panel.textContent, NA_TEXT);
  assert.strictEqual(crEtf.calls.fetch, 0, 'CR ETF choice must not fetch');
  const crStock = await runCR(src, 'SPY', wl);
  assert.strictEqual(crStock.calls.fetch, 1, 'CR Stock choice fetches once');
  const ffEtf = await runFF(src, 'NVDA', wl);
  assert.strictEqual(ffEtf.panel.textContent, NA_TEXT);
  assert.strictEqual(ffEtf.input.value, '');
  assert.strictEqual(ffEtf.calls.read, 0, 'FF ETF choice must not read');
  const ffStock = await runFF(src, 'SPY', wl);
  assert.strictEqual(ffStock.calls.read, 1, 'FF Stock choice reads once');
  // no choice: unchanged behaviour
  assert.strictEqual((await runCR(src, 'TAN', wl)).calls.fetch, 0);
  assert.strictEqual((await runCR(src, 'MSFT', wl)).calls.fetch, 1);
});

row('AC-5 SETUP: functions extract completely; ptAssetType byte-identical; wrapper pure and directly after it', async src => {
  for (const n of ['ptAssetType', 'ptEffectiveAssetType', '_runCRResearchCard', '_runFundFactsCard']) {
    const code = colFn(src, n);
    assert.ok(parses(code), n + ' does not parse');
    assert.ok(code.endsWith('\n}'), n + ' extraction not complete');
    const prog = acorn.parse(code, { ecmaVersion: 2022 });
    assert.strictEqual(prog.body.length, 1, n + ' extraction holds more than one statement');
  }
  assert.strictEqual(sha(colFn(src, 'ptAssetType')), sha(colFn(OLD_SRC, 'ptAssetType')), 'ptAssetType changed vs 105b9f9');
  const a = src.indexOf(colFn(src, 'ptAssetType')) + colFn(src, 'ptAssetType').length;
  const b = src.indexOf('function ptEffectiveAssetType(');
  assert.ok(b >= a && /^\n(\/\/[^\n]*\n)*$/.test(src.slice(a, b)), 'wrapper is not directly after ptAssetType');
  const w = colFn(src, 'ptEffectiveAssetType');
  for (const t of ['localStorage', 'sessionStorage', 'document', 'window', 'fetch', 'Date', 'Math.random', 'setTimeout']) assert.strictEqual(countOf(w, t), 0, t + ' in wrapper');
  assert.strictEqual(countOf(src, 'function ptEffectiveAssetType('), 1);
  assert.strictEqual(countOf(src, 'function ptAssetType('), 1);
});

// ── planted negatives: [label, row id prefix, mutation of an in-memory copy] ───────────────────────────────
const sw = (a, b) => s => {
  assert.strictEqual(countOf(s, a), 1, 'mutation anchor must occur exactly once (' + countOf(s, a) + '): ' + a);
  return s.replace(a, () => b);
};
const WRAP_HIT = "if (e && e.symbol === s && (e.assetType === 'ETF' || e.assetType === 'STOCK')) return e.assetType;";
const MIG_KEEP = "if (e.assetType === 'ETF' || e.assetType === 'STOCK') out.assetType = e.assetType;";
const SAVE_KEEP = "if (e.assetType === 'ETF' || e.assetType === 'STOCK') o.assetType = e.assetType;";
const C3_NEW = "if (typeof ptEffectiveAssetType === 'function' && ptEffectiveAssetType(sym) === 'ETF') { panel.textContent";
const C4_NEW = "if (typeof ptEffectiveAssetType === 'function' && ptEffectiveAssetType(sym) === 'ETF') { input.value";
const NEG = [
  ['AC-1 wrapper ignores the stored choice', 'AC-1', sw(WRAP_HIT, 'if (false) return e.assetType;')],
  ["AC-1 wrapper accepts any string", 'AC-1', sw(WRAP_HIT, 'if (e && e.symbol === s && typeof e.assetType === "string") return e.assetType;')],
  ['AC-1 wrapper returns the classifier for a choice only when UNKNOWN', 'AC-1', sw(WRAP_HIT, "if (e && e.symbol === s && (e.assetType === 'ETF' || e.assetType === 'STOCK') && ptAssetType(sym) === 'UNKNOWN') return e.assetType;")],
  ['AC-2 invalid in-memory value written', 'AC-2', sw(SAVE_KEEP, 'if (e.assetType) o.assetType = e.assetType;')],
  ['AC-2 assetType written as the first key', 'AC-2', sw("    const o = {\n      symbol:       e.symbol,", "    const o = {\n      assetType:    ((e.assetType === 'ETF' || e.assetType === 'STOCK') ? e.assetType : undefined),\n      symbol:       e.symbol,")],
  ['AC-2 no-choice list gains an empty key', 'AC-2', sw(SAVE_KEEP, "o.assetType = (e.assetType === 'ETF' || e.assetType === 'STOCK') ? e.assetType : null;")],
  ['AC-3 migrate keeps an invalid value', 'AC-3', sw(MIG_KEEP, 'if (e.assetType !== undefined) out.assetType = e.assetType;')],
  ['AC-3 migrate drops a valid value', 'AC-3', sw(MIG_KEEP, '')],
  ['AC-4 _selectCats back on the classifier', 'AC-4', sw('const _selectCats = sym => ptEffectiveAssetType(sym)', 'const _selectCats = sym => ptAssetType(sym)')],
  ['AC-4 C3 guard back on the classifier', 'AC-4', sw(C3_NEW, "if (typeof ptAssetType === 'function' && ptAssetType(sym) === 'ETF') { panel.textContent")],
  ['AC-4 C4 guard back on the classifier', 'AC-4', sw(C4_NEW, "if (typeof ptAssetType === 'function' && ptAssetType(sym) === 'ETF') { input.value")],
  ['AC-5 classifier edited', 'AC-5', sw("if (!/^[A-Z0-9.\\-]{1,12}$/.test(s)) return 'UNKNOWN';", "if (!/^[A-Z0-9.\\-]{1,13}$/.test(s)) return 'UNKNOWN';")],
  ['AC-5 clock in wrapper', 'AC-5', sw("function ptEffectiveAssetType(sym) {\n", "function ptEffectiveAssetType(sym) {\n  var __t = Date.now();\n")],
  ['AC-5 wrapper moved away from the classifier', 'AC-5', s => { const w = colFn(s, 'ptEffectiveAssetType'); const t = s.replace(w, ''); return t.replace('function getTickerDefaults(symbol) {', 'var PT_FILLER = 1;\n' + w + '\nfunction getTickerDefaults(symbol) {'); }]
];

module.exports = { ROWS, ORDER, NEG, row, SRC, SRV, OLD_SRC, OLD_SRV, colFn, tickerLiteral, classifierBlock, selectCatsLine, model, wrapperOnly, entry, sha, countOf, sw, parses, lf, NA_TEXT, STOCK_CATS };

if (require.main === module) {
  (async () => {
    let pass = 0;
    const failures = [];
    for (const id of ORDER) {
      try { await ROWS[id](SRC); pass += 1; console.log('  PASS  ' + id); }
      catch (e) { failures.push(id); console.log('  FAIL  ' + id + ' — ' + String(e && e.message || e).split('\n')[0]); }
    }
    for (const [label, rowId, mutate] of NEG) {
      const full = ORDER.find(i => i.startsWith(rowId + ' '));
      let mutated;
      try { mutated = mutate(SRC); } catch (e) { failures.push('negative anchor: ' + label); console.log('  FAIL  negative mutation did not apply: ' + label + ' — ' + String(e.message).split('\n')[0]); continue; }
      let caught = false;
      try { await ROWS[full](mutated); } catch (e) { caught = true; }
      if (caught) { pass += 1; console.log('  PASS  negative caught: ' + label); }
      else { failures.push('negative: ' + label); console.log('  FAIL  negative NOT caught: ' + label); }
    }
    if (failures.length) { console.log('\nasset-choice: ' + failures.length + ' failure(s)'); process.exit(1); }
    console.log('\n' + pass + ' asset-choice assertion(s) passed');
  })();
}
