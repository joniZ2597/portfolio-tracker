'use strict';
/*
 * asset_type_offline.js — surface-1 / S1 (Entry 12, P2a): the single STOCK / ETF / UNKNOWN classifier.
 * Offline: no network, no browser, no storage, no file writes. Rows AT-1..AT-10 map 1:1 to
 * work/surface-1/brief.md section S1.3. The REAL source is extracted from index.html and run in a sandbox.
 * Planted negatives mutate an in-memory COPY of the source (never the file on disk) and the named row must then FAIL.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
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
  if (!m) throw new Error('no P2a classifier block');
  return m[0];
}
// Evaluate TICKER_DEFAULTS + the classifier block; return { ptAssetType, NA, TD }.
function loadClassifier(src) {
  return new Function(tickerLiteral(src) + '\n' + classifierBlock(src) +
    '\nreturn { ptAssetType: ptAssetType, NA: PT_ETF_FUNDAMENTALS_NA_TEXT, TD: TICKER_DEFAULTS };')();
}

// Baseline (1b31027): the former _isETF regex, recorded here so the test never depends on the source that retired it.
const OLD_REGEX = /^(QQQ|SPY|IGV|SOXX|IWM|DIA|VOO|XL[A-Z]|ARKK|SMH|CIBR|XBI)$/i;
const OLD_EXPLICIT = ['QQQ', 'SPY', 'IGV', 'SOXX', 'IWM', 'DIA', 'VOO', 'ARKK', 'SMH', 'CIBR', 'XBI'];
const DEFAULT_ETFS = ['SPY', 'QQQ', 'XLE', 'SOXX', 'TAN', 'ITA', 'IGV', 'CIBR', 'KRE'];
const XL_ALL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => 'XL' + c);
// Base digests of surfaces S1 must not touch (LF-normalised, column-0 extraction).
const BASE_TD = 'c3db28bab1dfcb29b0cefc0c45b1cfc46f115adc918d3f8ea733a2ce0117809b';
const BASE_CFS = 'ab2ad1f0048b569e73a260a81076bbf467b9cd6ae8c54e155f1210449262d979';
const BASE_CTS = '373e9290a82129cb1ec2ec053ceb5263e81159fc7acc8a589a91defad8d2fc9d';

const C3_LINE = "  if (typeof ptAssetType === 'function' && ptAssetType(sym) === 'ETF') { panel.textContent = PT_ETF_FUNDAMENTALS_NA_TEXT; return; }";
const C4_LINE = "  if (typeof ptAssetType === 'function' && ptAssetType(sym) === 'ETF') { input.value = ''; panel.textContent = PT_ETF_FUNDAMENTALS_NA_TEXT; return; }";

// ── sandboxes for the two cards ───────────────────────────────────────────────
async function runCR(src, sym) {
  const calls = { fetch: 0 };
  const btn = { disabled: false, textContent: '' };
  const panel = { textContent: '', innerHTML: '' };
  const win = {};
  const doc = { getElementById: id => (id === 'cr-res-btn-' + sym ? btn : id === 'cr-res-panel-' + sym ? panel : null) };
  const fetchSpy = async () => { calls.fetch += 1; return { ok: true, status: 200, text: async () => '{"status":"OK"}' }; };
  const fn = new Function('document', 'window', 'fetch', '_renderCapitalReturnsPanel',
    tickerLiteral(src) + '\n' + classifierBlock(src) + '\n' + colFn(src, '_runCRResearchCard') + '\nreturn _runCRResearchCard;')(
    doc, win, fetchSpy, () => 'RENDERED');
  await fn(sym);
  return { calls, panel, btn, NA: loadClassifier(src).NA };
}
async function runFF(src, sym, gateOn) {
  const calls = { read: 0 };
  const btn = { disabled: false, textContent: '' };
  const input = { value: 'tok' };
  const panel = { textContent: '' };
  const win = gateOn ? { PT_ENABLE_FUND_FACTS_READ_CLIENT: true } : {};
  const doc = { getElementById: id => (id === 'ffr-btn-' + sym ? btn : id === 'ffr-token-' + sym ? input : id === 'ffr-panel-' + sym ? panel : null) };
  const fn = new Function('document', 'window', 'requestFundFactsRead', '_ffrRenderPanel', '_ffrViewForResult', '_ffrStatusMsg',
    tickerLiteral(src) + '\n' + classifierBlock(src) + '\n' + colFn(src, '_runFundFactsCard') + '\nreturn _runFundFactsCard;')(
    doc, win, async () => { calls.read += 1; return {}; }, () => {}, () => ({}), () => '');
  await fn(sym);
  return { calls, panel, input, NA: loadClassifier(src).NA };
}

// ── rows (each a function of the source, so a planted negative can re-run it) ─
const ROWS = Object.create(null);
const ORDER = [];
const row = (id, fn) => { ROWS[id] = fn; ORDER.push(id); };

row('AT-1 every return value is STOCK / ETF / UNKNOWN', async src => {
  const { ptAssetType } = loadClassifier(src);
  const inputs = [].concat(DEFAULT_ETFS, XL_ALL, OLD_EXPLICIT, Object.keys(loadClassifier(src).TD),
    ['', ' ', null, undefined, 42, {}, [], 'X'.repeat(20), 'BRK.B', 'rklb', 'VTI', 'A-B', 'a b', '<script>', '‮']);
  for (const x of inputs) assert.ok(['STOCK', 'ETF', 'UNKNOWN'].includes(ptAssetType(x)), 'bad value for ' + String(x));
});
row('AT-2 12-G seed: defaults, old explicit symbols, XLA..XLZ, case and whitespace', async src => {
  const { ptAssetType } = loadClassifier(src);
  for (const s of DEFAULT_ETFS.concat(OLD_EXPLICIT, XL_ALL)) assert.strictEqual(ptAssetType(s), 'ETF', s);
  assert.strictEqual(ptAssetType(' qqq '), 'ETF');
  assert.strictEqual(ptAssetType('xlk'), 'ETF');
  for (const s of ['TAN', 'ITA', 'KRE']) assert.strictEqual(ptAssetType(s), 'ETF', s);
});
row('AT-3 no regression: every symbol the old regex matched is still ETF', async src => {
  const { ptAssetType } = loadClassifier(src);
  const universe = OLD_EXPLICIT.concat(XL_ALL);
  let n = 0;
  for (const s of universe) if (OLD_REGEX.test(s)) { n += 1; assert.strictEqual(ptAssetType(s), 'ETF', s); }
  assert.strictEqual(n, universe.length);
  // every 2..4 letter string the old regex matched
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const a of A) for (const b of A) {
    const t = a + b; if (OLD_REGEX.test(t)) assert.strictEqual(ptAssetType(t), 'ETF', t);
    for (const c of A) { const u = t + c; if (OLD_REGEX.test(u)) assert.strictEqual(ptAssetType(u), 'ETF', u); }
  }
});
row('AT-4 every non-ETF TICKER_DEFAULTS key is STOCK', async src => {
  const { ptAssetType, TD } = loadClassifier(src);
  const keys = Object.keys(TD).filter(k => TD[k].sector !== 'ETF');
  assert.ok(keys.length >= 20, 'expected the 21 company defaults');
  for (const k of keys) assert.strictEqual(ptAssetType(k), 'STOCK', k);
});
row('AT-5 unknown inputs are UNKNOWN and never ETF', async src => {
  const { ptAssetType } = loadClassifier(src);
  for (const x of ['RKLB', 'VTI', '', null, 42, 'X'.repeat(20), 'BRK.B']) assert.strictEqual(ptAssetType(x), 'UNKNOWN', String(x));
});
row('AT-6 deterministic and free of storage / DOM / network / clock', async src => {
  const body = colFn(src, 'ptAssetType');
  for (const w of ['localStorage', 'sessionStorage', 'document', 'window', 'fetch', 'Date']) assert.strictEqual(countOf(body, w), 0, w + ' in ptAssetType');
  const { ptAssetType } = loadClassifier(src);
  for (const s of ['TAN', 'NVDA', 'ZZZZ', null]) assert.strictEqual(ptAssetType(s), ptAssetType(s));
});
row('AT-7 _isETF retired; _selectCats uses ptAssetType; TAN 2 categories, NVDA / RKLB 7', async src => {
  // Reading used (brief C1 mandates a comment naming "the former _isETF regex"): no CODE occurrence outside // comment lines.
  const codeHits = src.split('\n').filter(l => l.includes('_isETF') && !/^\s*\/\//.test(l));
  assert.strictEqual(codeHits.length, 0, '_isETF still in index.html code: ' + (codeHits[0] || '').trim());
  const line = /^ *const _selectCats = [^\n]*$/m.exec(src);
  assert.ok(line, '_selectCats missing');
  assert.ok(line[0].includes('ptAssetType('), '_selectCats does not reference ptAssetType');
  const { ptAssetType } = loadClassifier(src);
  const sel = new Function('ptAssetType', 'MAX_CALLS', line[0] + '\nreturn _selectCats;')(ptAssetType, 7);
  assert.deepStrictEqual(sel('TAN'), ['analyst', 'risk']);
  assert.strictEqual(sel('NVDA').length, 7);
  assert.strictEqual(sel('RKLB').length, 7);
});
row('AT-8 Capital Returns card: ETF -> N/A text, no fetch; STOCK / UNKNOWN -> existing path', async src => {
  const etf = await runCR(src, 'TAN');
  assert.strictEqual(etf.panel.textContent, etf.NA);
  assert.strictEqual(etf.calls.fetch, 0);
  assert.strictEqual(etf.btn.disabled, false);
  for (const s of ['NVDA', 'RKLB']) { const r = await runCR(src, s); assert.strictEqual(r.calls.fetch, 1, s); }
});
row('AT-9 Fund Facts card: ETF -> N/A text, input cleared, no read; STOCK / UNKNOWN -> one read; gate off unchanged', async src => {
  const etf = await runFF(src, 'KRE', true);
  assert.strictEqual(etf.panel.textContent, etf.NA);
  assert.strictEqual(etf.input.value, '');
  assert.strictEqual(etf.calls.read, 0);
  for (const s of ['NVDA', 'RKLB']) { const r = await runFF(src, s, true); assert.strictEqual(r.calls.read, 1, s); }
  const off = await runFF(src, 'KRE', false);
  assert.strictEqual(off.panel.textContent, '');
  assert.strictEqual(off.input.value, 'tok');
  assert.strictEqual(off.calls.read, 0);
});
row('AT-10 untouched surfaces byte-equal; C3 / C4 guards exactly as written', async src => {
  assert.strictEqual(sha(tickerLiteral(src)), BASE_TD, 'TICKER_DEFAULTS changed');
  assert.strictEqual(sha(colFn(src, '_crFetchForScan')), BASE_CFS, '_crFetchForScan changed');
  assert.strictEqual(sha(colFn(src, 'computeTechnicalSnapshot')), BASE_CTS, 'computeTechnicalSnapshot changed');
  assert.strictEqual(countOf(colFn(src, '_runCRResearchCard'), C3_LINE + '\n'), 1, 'C3 line');
  assert.strictEqual(countOf(colFn(src, '_runFundFactsCard'), C4_LINE + '\n'), 1, 'C4 line');
  assert.ok(colFn(src, '_runCRResearchCard').includes("if (!btn || !panel) return;\n" + C3_LINE), 'C3 position');
  assert.ok(colFn(src, '_runFundFactsCard').includes("if (btn.disabled) return;\n" + C4_LINE), 'C4 position');
});

// ── planted negatives: id -> mutation of an in-memory copy ────────────────────
const sw = (a, b, all) => s => { assert.ok(s.includes(a), 'mutation anchor missing: ' + a); return all ? s.split(a).join(b) : s.replace(a, b); };
const NEG = [
  ['AT-2 seed missing TAN', 'AT-2', sw("'TAN', ", '')],
  ['AT-2 XL[A-Z] dropped', 'AT-2', sw('/^XL[A-Z]$/', '/^$/')],
  ['AT-3 XL[A-Z] dropped', 'AT-3', sw('/^XL[A-Z]$/', '/^$/')],
  ['AT-5 UNKNOWN -> ETF', 'AT-5', sw("  return 'UNKNOWN';\n}\nvar PT_ETF", "  return 'ETF';\n}\nvar PT_ETF")],
  ['AT-1 invalid enum value', 'AT-1', sw("return 'STOCK';", "return 'COMPANY';")],
  ['AT-4 defaults not STOCK', 'AT-4', sw("return 'STOCK';", "return 'UNKNOWN';")],
  ['AT-6 clock in classifier', 'AT-6', sw("var s = (typeof sym", "var __t = Date.now(); var s = (typeof sym")],
  ['AT-7 _isETF left in place', 'AT-7', s => s + '\nconst _isETF = 1;\n'],
  ['AT-8 N/A path still fetches (CR)', 'AT-8', sw("panel.textContent = PT_ETF_FUNDAMENTALS_NA_TEXT; return; }", "panel.textContent = PT_ETF_FUNDAMENTALS_NA_TEXT; }", true)],
  ['AT-9 N/A path still reads (FF)', 'AT-9', sw("panel.textContent = PT_ETF_FUNDAMENTALS_NA_TEXT; return; }", "panel.textContent = PT_ETF_FUNDAMENTALS_NA_TEXT; }", true)],
  ['AT-9 FF token not cleared', 'AT-9', sw("{ input.value = ''; panel.textContent", "{ panel.textContent")],
  ['AT-10 C3 guard loses typeof', 'AT-10', sw("if (typeof ptAssetType === 'function' && ptAssetType(sym) === 'ETF') { panel", "if (ptAssetType(sym) === 'ETF') { panel")],
  ['AT-10 TICKER_DEFAULTS edited', 'AT-10', sw("name:'Invesco Solar ETF'", "name:'Invesco Solar'")],
];

(async () => {
  let pass = 0;
  const failures = [];
  for (const id of ORDER) {
    try { await ROWS[id](SRC); pass += 1; console.log('  PASS  ' + id); }
    catch (e) { failures.push(id); console.log('  FAIL  ' + id + ' — ' + String(e && e.message || e).split('\n')[0]); }
  }
  for (const [label, rowId, mutate] of NEG) {
    const full = ORDER.find(i => i.startsWith(rowId + ' '));
    let caught = false;
    let mutated;
    try { mutated = mutate(SRC); } catch (e) { failures.push('negative anchor: ' + label); console.log('  FAIL  negative mutation did not apply: ' + label); continue; }
    try { await ROWS[full](mutated); } catch (e) { caught = true; }
    if (caught) { pass += 1; console.log('  PASS  negative caught: ' + label); }
    else { failures.push('negative: ' + label); console.log('  FAIL  negative NOT caught: ' + label); }
  }
  if (failures.length) { console.log('\nasset-type: ' + failures.length + ' failure(s)'); process.exit(1); }
  console.log('\n' + pass + ' asset-type assertion(s) passed');
})();
