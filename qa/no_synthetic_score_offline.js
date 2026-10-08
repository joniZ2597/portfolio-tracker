'use strict';

/*
 * NS — a failed AI analysis stays failed: null score, never a synthetic 50 (R-3, BACKLOG Entry 36).
 *
 * Pure Node, no network, no browser, no storage. Extracts the REAL functions from index.html
 * (brace matching, async-aware, as in qa/tech_snapshot_cache_offline.js) and runs them verbatim in
 * sandboxes — never a re-implementation. The pre-task function is reproduced from the task source by
 * the R-3 revert tables (NS-12) and executed beside it for the fixture regressions (NS-1, NS-4, NS-8, NS-9).
 *
 * Rows NS-1..NS-12 map 1:1 to brief work/r3-no-synthetic-50/brief.md section 5.
 *   NS-1  analyzeChunk fallback (error / parse-failure paths): sentiment_score null, other fields unchanged
 *   NS-2  orchestrate: the chg overrides never turn a missing score into a number
 *   NS-3  orchestrate: no action / sentiment / conflict / key-risk override for a failed item
 *   NS-4  orchestrate: every non-failed item byte-for-byte as the pre-task function
 *   NS-5  _isValidScanResult: null only with _aiUnavailable === true; every other case unchanged
 *   NS-6  replacement: the failed rescan replaces the stored result; the old score is never shown
 *   NS-7  ranked order and score cell for a missing score (existing comparator, asserted as a contract)
 *   NS-8  Daily Review: every failed item in the last group "Analysis failed — rescan"
 *   NS-9  Technical Setup card Score row: null -> "—" neutral; numeric exactly as before
 *   NS-10 action block: a failed item shows no dial and no Pulse chip; the banner is present
 *   NS-11 isolation: unchanged helpers byte-identical; no new top-level function
 *   NS-12 the R-3 revert tables reproduce each changed function's pre-task source byte-for-byte
 *
 * Planted negatives mutate an in-memory copy of the production source (never the test) and the named
 * group must then FAIL. All text is compared LF-normalised.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');

const norm = s => s.replace(/\r\n/g, '\n');
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);
const quiet = { log() {}, warn() {}, error() {} };

// ── Pre-task pins (LF-normalised sha256), captured at a183db8 = the pre-task index.html ─────────
const PRE = {
  analyzeChunk: '58ba6884b740716b87aa9b06feee682d1cf26bb98b3dc3c69eddb646d486303d',
  orchestrate: '86977a95cf702613014c77911e0c5f67041041a531262493f18dde04891ea9ee',
  _isValidScanResult: '05411db01b999a286f04273ac14c1051398eb7f8a6d1b9a60148b93dbdacbcca',
  _srGroupResults: 'e7d27b3cfc81bff56b8d80142200f2a3fc8ef651f92e27a60956d2c1203f8183',
  renderMainPanel: 'e84c5e61abcb1179add1c5db28d5d5b1e958daa10b0363fdb339d83363fed869'
};
// index.html with the five changed functions masked: nothing else in the file changes in this task
// (hence no new top-level function anywhere).
const PRE_MASKED_FIVE = '529fdce6b1bf1dec2ac1a59f346b72fe0177df1d3ff304018d078e98c8e80d58';
// Surfaces the brief says are untouched (section 2.8 / NS-11).
const ISOLATION_PINS = {
  enforceScoreConsistency: 'e1406d9bfe8358212ada456882bea248cb761cc68734213aa5151b9c02966a00',
  _ptScoreNorm: '4ab627ca0c86aa8012a46c2104cd74640a57addc38bda86d7e1850131e395cb2',
  _ptScoreText: '5b22d6c5daa4ed2e70370d4fe479e08dfff2c099bb2839748ad03ce7677f3589',
  _ptScoreCmp: 'aa1725886484e9c3aa084f29d00bf43e8e155311de835905c9ca8d275d59611d',
  _ptScoreAvg: '34885d90dd6379beae0873e9de468884bd3a17600bc2db66e4f052c2b05feb8c',
  _ptScoreStates: '6a3fc2e35040d654e128748d868caf84d488b82f34decf44ddf08d4402e93f49',
  _ptScoreFillHtml: '389f2ba8e3993bd835cb9e13bb596124b32df225920b7615f87adc3eec770292',
  _ptScoreDial: '22a2c59e47fcda24b61c08221a5e02f66ecd2de57bdf995510fbb52e7906666e',
  applyCapitalReturnsNudge: 'eef0d08a4d9e32053df3241960f6bcbd21f136590da316688549bf16c0216a16',
  _renderPortfolioPanel: '79cc59e7f362b103b34d031b5e24efecc0c33b1a185b640ddeaa5568480f7d5d',
  _dd0FetchAnalysis: 'bcec3745e3511b354337220208531e9a04143cd82df626f8348da57f39894a6c',
  classifyTechnicalSetup: 'c143eb08d982cff036dd5678def08dc38e7dede6e2a0f4ae11a79d277e3ab3ad'
};
const CHANGED = ['analyzeChunk', 'orchestrate', '_isValidScanResult', '_srGroupResults', 'renderMainPanel'];
const FAILED_GROUP = 'Analysis failed — rescan';
const SUMMARY_NET = 'AI analysis unavailable — market data shown only. Technical panels reflect verified price and candle data. No AI-generated summary is available for this scan.';
const SUMMARY_PARSE = 'AI response could not be parsed after retry — market data and technical panels shown only. No AI-generated summary is available for this scan.';
const BANNER = 'AI analysis unavailable — market data shown only. Technical panels reflect verified price and candle data.';

// ── R-3 tables (brief section 2 / 4): the exact pre-task lines and the task lines, per function ──
const FROM_SCAN = "${_fromScan ? '<span style=\"color:var(--text3);font-size:10px;margin-left:6px\">from scan</span>' : ''}";
const R3 = {
  analyzeChunk: [
    { id: 'AC-1', oldS: '        sentiment_score: 50,', newS: '        sentiment_score: null,' }
  ],
  orchestrate: [
    { id: 'OR-1', oldS: '    if (chg < -5 && item.sentiment_score > 60) {',
      newS: "    if (typeof item.sentiment_score === 'number' && chg < -5 && item.sentiment_score > 60) {" },
    { id: 'OR-2', oldS: '    if (chg > 5  && item.sentiment_score < 40) {',
      newS: "    if (typeof item.sentiment_score === 'number' && chg > 5  && item.sentiment_score < 40) {" },
    { id: 'OR-3', oldS: "    if (item.technical_setup === 'extended_near_ath' && item.sentiment_score > 62) {",
      newS: "    if (item._aiUnavailable !== true && item.technical_setup === 'extended_near_ath' && item.sentiment_score > 62) {" },
    { id: 'OR-4', oldS: "    if (_setup6a === 'extended_near_ath') {",
      newS: "    if (item._aiUnavailable !== true && _setup6a === 'extended_near_ath') {" },
    { id: 'OR-5', oldS: "    if (_setup6a === 'below_key_mas' && item.sentiment_score > 45) {",
      newS: "    if (item._aiUnavailable !== true && _setup6a === 'below_key_mas' && item.sentiment_score > 45) {" },
    { id: 'OR-6', oldS: "    if (_setup6a === 'below_key_mas') {",
      newS: "    if (item._aiUnavailable !== true && _setup6a === 'below_key_mas') {" }
  ],
  _isValidScanResult: [
    { id: 'IV-1', oldS: "    typeof r.sentiment_score === 'number' && r.sentiment_score >= 0 && r.sentiment_score <= 100 &&",
      newS: "    ((typeof r.sentiment_score === 'number' && r.sentiment_score >= 0 && r.sentiment_score <= 100) || (r.sentiment_score === null && r._aiUnavailable === true)) && // R-3 (Entry 36): a failed AI analysis persists as null" }
  ],
  _srGroupResults: [
    { id: 'SG-1', oldS: '  // display order: Strong Setup → Watch → Extended / near 1Y high → Caution',
      newS: '  // display order: Strong Setup → Watch → Extended / near 1Y high → Caution → Analysis failed — rescan (R-3, Entry 36)' },
    { id: 'SG-2', oldS: "    { name: 'Caution',        items: [] },",
      newS: "    { name: 'Caution',        items: [] },\n    { name: 'Analysis failed — rescan', items: [] }," },
    { id: 'SG-3', oldS: '    if (_SR_BULLISH_TIER.has(ts) && sc !== null && sc >= 55)  groups[0].items.push(r);',
      newS: '    if (r._aiUnavailable === true)                groups[4].items.push(r); // R-3 (Entry 36): a failed AI analysis is never ranked by setup\n    else if (_SR_BULLISH_TIER.has(ts) && sc !== null && sc >= 55)  groups[0].items.push(r);' }
  ],
  renderMainPanel: [
    { id: 'RM-1',
      oldS: '          <div class="rr-row"><span class="rr-lbl">Score</span><span class="rr-val ${score>=65?\'pos\':score>=40?\'warn\':\'neg\'}">${score} / 100' + FROM_SCAN + '</span></div>',
      newS: '          <div class="rr-row"><span class="rr-lbl">Score</span><span class="rr-val ${score===null?\'neutral-v\':score>=65?\'pos\':score>=40?\'warn\':\'neg\'}">${score===null?\'—\':`${score} / 100' + FROM_SCAN + '`}</span></div>' }
  ]
};
function applyR3(fnSrc, name) {
  let out = fnSrc;
  for (const r of R3[name]) {
    if (countOf(out, r.oldS) !== 1) throw new Error('R-3 old text not unique: ' + r.id);
    out = out.replace(r.oldS, () => r.newS);
  }
  return out;
}
function revertR3(fnSrc, name) {
  let out = fnSrc;
  for (const r of R3[name].slice().reverse()) {
    if (countOf(out, r.newS) !== 1) throw new Error('R-3 new text not unique: ' + r.id);
    out = out.replace(r.newS, () => r.oldS);
  }
  return out;
}

// ── Source extraction (same rule as qa/tech_snapshot_cache_offline.js) ──────────────────────────
function extractFn(content, name) {
  const sig = 'function ' + name + '(';
  const start = content.indexOf(sig);
  if (start === -1) return null;
  const realStart = (start >= 6 && content.slice(start - 6, start) === 'async ') ? start - 6 : start;
  const braceStart = content.indexOf('{', start);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < content.length; i += 1) {
    if (content[i] === '{') depth += 1;
    else if (content[i] === '}') {
      depth -= 1;
      if (depth === 0) return content.slice(realStart, i + 1);
    }
  }
  return null;
}
// parseJSON carries a literal "{" inside a log string, so brace matching never closes: a top-level
// function then ends at its column-0 closing brace (the qa/high1y_label_offline.js rule).
function extractTopLevelFn(content, name) {
  const balanced = extractFn(content, name);
  if (balanced) return balanced;
  const start = content.indexOf('function ' + name + '(');
  if (start === -1) return null;
  const closeAt = content.indexOf('\n}\n', start);
  return closeAt === -1 ? null : content.slice(start, closeAt + 2);
}
function maskFns(content, names) {
  let s = content;
  for (const n of names) {
    const f = extractFn(s, n);
    if (!f) return null;
    const i = s.indexOf(f);
    s = s.slice(0, i) + '/*MASK*/' + s.slice(i + f.length);
  }
  return s;
}
if (process.env.NS_CAPTURE === '1') {   // capture mode: print the pins of the current index.html (used once, at the pre-task baseline)
  const c = norm(fs.readFileSync(INDEX_PATH, 'utf8'));
  const out = { PRE: {}, PRE_MASKED_FIVE: null, ISOLATION_PINS: {} };
  for (const n of CHANGED) out.PRE[n] = sha256(extractFn(c, n) || '');
  const m = maskFns(c, CHANGED);
  out.PRE_MASKED_FIVE = m === null ? null : sha256(m);
  for (const n of Object.keys(ISOLATION_PINS)) out.ISOLATION_PINS[n] = sha256(extractFn(c, n) || '');
  process.stdout.write(JSON.stringify(out, null, 2));
  process.exit(0);
}

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────
const PRICE = 190.01;
const VALID_SUMMARY = 'This is a valid synthetic summary body used purely for offline pin fixtures and exceeds fifty characters.';
// Snapshots that the REAL classifyTechnicalSetup maps to each setup (sanity-asserted in NS-4).
const SNAPS = {
  extended_near_ath:        { pct20: 12, pct50: 20, pct150: 30, high1yDist: -2 },
  healthy_uptrend_near_ath: { pct20: 5,  pct50: 10, pct150: 15, high1yDist: -6 },
  healthy_uptrend:          { pct20: 5,  pct50: 10, pct150: 15, high1yDist: -20 },
  support_test:             { pct20: -2, pct50: 1,  pct150: 10, high1yDist: -20 },
  pullback_in_uptrend:      { pct20: -2, pct50: 5,  pct150: 10, high1yDist: -20 },
  breakdown_risk:           { pct20: -5, pct50: -4, pct150: 0,  high1yDist: -20 },
  below_key_mas:            { pct20: -5, pct50: -8, pct150: -10, high1yDist: -20 },
  unknown:                  {}
};
for (const k of Object.keys(SNAPS)) if (k !== 'unknown') Object.assign(SNAPS[k], { sma20: 180, sma50: 170, sma150: 160, rsSPY: 2.5, rsQQQ: -0.5, rsSector: 1.5, volRatio: 1.1 });
// The fallback item exactly as analyzeChunk builds it after R-3 (brief section 2.1).
const failedItem = over => Object.assign({
  ticker: 'TST', company_name: 'Test Co', sentiment: 'neutral', sentiment_score: null, summary: SUMMARY_NET,
  alerts: [{ type: 'normal', text: 'UBS price target $120 — verify if recent' }], news: [], _aiUnavailable: true, _aiParseFailed: false
}, over || {});
const stockFor = chg => ({ TST: { price: PRICE, change_percent: chg, source: 'yahoo', marketState: 'REGULAR' } });
function panelSnap() {
  return { sma20: 180, sma50: 170, sma150: 160, sma200: 150, pct20: 5.56, pct50: 11.77, pct150: 18.76, pct200: 26.67,
    hasMA20: true, hasMA50: true, hasMA150: true, hasMA200: true, volRatio: 1.1, hasVolume: true, high1yDist: -12, hasHigh1y: true,
    rsSector: 1.5, rsSPY: 2.5, rsQQQ: -0.5, sectorEtf: 'XLK', candleCount: 220, spyChangePct: 0.5, qqqChangePct: -0.3 };
}

// ── Sandboxes ────────────────────────────────────────────────────────────────────────────────────
// orchestrate with the real classifyTechnicalSetup, a fixed clock and the minimal free names (TC-4 / HL-7 pattern).
function buildOrchestrate(orchSrc, classSrc) {
  const body = [
    'const _extendedMktCache = {}; const window = {};',
    'function findTicker() { return null; } function formatNewsContext() { return ""; }',
    classSrc, orchSrc, 'return { orchestrate, _extendedMktCache };'
  ].join('\n');
  const FIXED = { toISOString: () => '2026-10-08T00:00:00.000Z' };
  function FixedDate() { return FIXED; }
  return new Function('Date', 'console', body)(FixedDate, quiet);
}
// analyzeChunk with the real parseJSON; every upstream call is a counterfeit (no network); orchestrate is a spy.
function buildAnalyzeChunk(acSrc, pjSrc, anthropicImpl) {
  const spy = { rawIn: null, calls: 0 };
  const body = pjSrc + '\n' + acSrc + '\nreturn analyzeChunk;';
  const fn = new Function('console', 'fetchBatchStockData', '_fetchTimestamps', '_crFetchForScan', 'formatStockContext', 'findTicker',
    'computeTechnicalSnapshot', 'classifyTechnicalSetup', 'buildTechSnapshotBlock', 'fetchPerplexityContext', 'parsePerplexityContext',
    'window', 'fetchAnthropicAnalysis', 'orchestrate', 'enforceScoreConsistency', 'repairJSON', body)(
    quiet,
    async () => stockFor(1.2),
    {},
    () => Promise.resolve(),
    () => '',
    () => ({ name: 'Test Co', sectorEtf: 'XLK' }),
    async () => ({}),
    () => 'unknown',
    () => '',
    async () => ({ raw: 'UBS raised PT to $120', sources: [], _telemetry: {} }),
    () => ({ TST: { analystActions: [{ bank: 'UBS', target: 120 }], bullishCatalysts: [], bearishCatalysts: [], macroDrivers: [] } }),
    {},
    anthropicImpl,
    raw => { spy.rawIn = raw; spy.calls += 1; return raw; },
    r => r,
    s => s);
  return { run: () => fn(['TST'], '2026-10-08'), spy };
}
// Terminal chain (qa/run-offline.js Phase 6 pattern): the real validator + merge, composed.
function buildChain(src) {
  const parts = ['enforceScoreConsistency', '_isValidScanResult', 'mergeResultsByTicker'].map(n => extractFn(src, n));
  if (parts.some(p => !p)) throw new Error('terminal chain not extractable');
  return new Function('console', parts.join('\n') + '\nreturn { enforceScoreConsistency, _isValidScanResult, mergeResultsByTicker };')(quiet);
}
// Scan Results renderers (qa/scan_results_enrichment_offline.js pattern): a vm context with the real functions.
const SR_FNS = ['_ptScoreNorm', '_ptScoreText', '_ptScoreCmp', '_ptScoreStates', '_ptScoreFillHtml', '_vscCellHtml',
  '_srGroupResults', '_crEsc', '_srHeldMap', '_srHeldHtml', '_srRenderGrouped', 'openScanResultsOverlay'];
function buildScanResults(src, groupSrcOverride) {
  const srcs = SR_FNS.map(n => (n === '_srGroupResults' && groupSrcOverride) ? groupSrcOverride : extractFn(src, n));
  if (srcs.some(s => !s)) throw new Error('scan results pieces missing');
  const state = { tbody: { innerHTML: '' }, mode: 'ranked' };
  const els = { scanResultsOverlay: { style: {} }, srRows: state.tbody, srCount: { textContent: '' } };
  const ctx = {
    console: quiet, _cockpitResults: [], _srMode: 'ranked', _srDensity: 'regular',
    RATING_SUMMARY_RE: /Rating:\s*(Buy|Neutral|Sell)/i,
    _SR_BULLISH_TIER: new Set(['healthy_uptrend', 'healthy_uptrend_near_ath', 'pullback_in_uptrend']),
    _SR_BEARISH_TIER: new Set(['breakdown_risk', 'below_key_mas']),
    document: { getElementById: id => els[id] || null },
    loadHoldings: () => ({}), _srSafeParseResults: () => []
  };
  vm.createContext(ctx);
  vm.runInContext(srcs.join('\n'), ctx);
  const render = (mode, results) => { ctx._cockpitResults = results; ctx._srMode = mode; state.tbody.innerHTML = ''; vm.runInContext('openScanResultsOverlay()', ctx); return state.tbody.innerHTML; };
  const group = results => { ctx.__in = results; return vm.runInContext('_srGroupResults(__in)', ctx); };
  const grouped = results => { state.tbody.innerHTML = ''; ctx.__in = results; vm.runInContext('_srRenderGrouped(__in, document.getElementById("srRows"))', ctx); return state.tbody.innerHTML; };
  const cmp = results => { ctx.__in = results; return vm.runInContext('__in.slice().sort(_ptScoreCmp)', ctx); };
  const cell = v => { ctx.__v = v; return vm.runInContext('_vscCellHtml(_ptScoreNorm(__v))', ctx); };
  return { render, group, grouped, cmp, cell };
}
// Render harness (qa/tech_snapshot_cache_offline.js buildRenderer / qa/ma_stack_label_offline.js pattern).
function makeNeutral() {
  const f = function () {};
  const p = new Proxy(f, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (typeof k === 'symbol') return undefined;
      if (k === 'then') return undefined;
      if (k === 'toString' || k === 'valueOf' || k === 'toJSON') return () => '';
      return p;
    },
    apply() { return p; }, construct() { return p; }, set() { return true; }, has() { return true; }
  });
  return p;
}
const NEUTRAL = makeNeutral();
function makeScope(map) {
  return new Proxy({}, {
    has(t, k) { if (typeof k === 'symbol') return false; if (k in map) return true; if (k in globalThis) return false; return true; },
    get(t, k) { if (k === Symbol.unscopables) return undefined; if (k in map) return map[k]; return NEUTRAL; },
    set(t, k, v) { map[k] = v; return true; }
  });
}
const RENDER_REAL = ['hasVerifiedMarketData', '_techPanelPrice', '_techSnapFor', '_techRefInput', 'classifyTechnicalSetup', '_setupDisplay',
  '_ptScoreNorm', '_ptScoreText', '_ptScoreDial'];
function buildRenderer(src, rmSrc) {
  if (!rmSrc) throw new Error('renderMainPanel not extractable');
  const helpers = [];
  for (const n of RENDER_REAL) {
    const s = extractFn(src, n);
    if (!s) throw new Error('missing ' + n);
    helpers.push(s);
  }
  const ratingRe = /var RATING_SUMMARY_RE = (\/[^\n]*\/[a-z]*);/.exec(src);
  if (!ratingRe) throw new Error('RATING_SUMMARY_RE not found');
  const factory = new Function('__scope', 'with (__scope) {\n' + helpers.join('\n') + '\n' + rmSrc + '\nreturn renderMainPanel;\n}');
  // render(item, snap, refInput, ext) -> innerHTML of #mainPanel
  return function render(item, snap, refInput, ext) {
    const node = { innerHTML: '' };
    const map = {
      window: { PT_ENABLE_TECH_SCORE: false, PT_ENABLE_DEEP_DIVE: false },
      document: { getElementById: id => (id === 'mainPanel' ? node : null) },
      console: quiet,
      _techCache: snap ? { TST: { base: {}, computedAt: 0, sectorEtf: 'XLK', snap, refInput } } : {},
      _extendedMktCache: ext || {},
      _cockpitResults: [], _mktFailCache: {}, findTicker: () => null, refreshTechPanel: () => undefined,
      RATING_SUMMARY_RE: new Function('return ' + ratingRe[1])()
    };
    factory(makeScope(map))(item);
    return node.innerHTML;
  };
}
const SCORE_ROW_RE = /<div class="rr-row"><span class="rr-lbl">Score<\/span><span class="rr-val ([^"]*)">(.*?)<\/span><\/div>/;
const scoreRow = html => { const m = SCORE_ROW_RE.exec(html); return m ? { cls: m[1], text: m[2], row: m[0] } : null; };
const normalItem = over => Object.assign({ ticker: 'TST', sentiment_score: 70, sentiment: 'positive', summary: 'Rating: Buy', action: 'buy',
  technical_setup: 'healthy_uptrend', _verifiedPrice: PRICE, _verifiedChangePct: 1.2 }, over || {});
const PRE_EXT = { TST: { marketState: 'PRE', regularPrice: 188.5, preMarketPrice: 191, preMarketChangePercent: null, postMarketPrice: null, postMarketChangePercent: null } };

// ── Evaluate every group on one source text ─────────────────────────────────────────────────────
async function evaluate(src) {
  const R = {};
  const chk = (id, name, ok) => { (R[id] = R[id] || []).push({ name, ok: !!ok }); };
  const guard = async (id, fn) => { try { await fn(); } catch (e) { chk(id, 'group threw: ' + String(e && e.message || e).slice(0, 200), false); } };

  const task = {};
  for (const n of CHANGED) task[n] = extractFn(src, n) || '';
  const pre = {};
  for (const n of CHANGED) { try { pre[n] = revertR3(task[n], n); } catch (e) { pre[n] = null; } }
  const classSrc = extractFn(src, 'classifyTechnicalSetup') || '';
  const pjSrc = extractTopLevelFn(src, 'parseJSON') || '';

  // NS-12 revert tables
  await guard('NS-12', () => {
    for (const n of CHANGED) {
      chk('NS-12', n + ': the R-3 table reverts cleanly (every task line present exactly once)', pre[n] !== null);
      chk('NS-12', n + ': reverting only the R-3 lines restores the pre-task source (LF pin)', pre[n] !== null && sha256(pre[n]) === PRE[n]);
      chk('NS-12', n + ': applying the R-3 table to the reverted source reproduces the task source byte-for-byte', pre[n] !== null && applyR3(pre[n], n) === task[n]);
    }
    chk('NS-12', 'line counts: analyzeChunk +0, orchestrate +0, _isValidScanResult +0, _srGroupResults +2, renderMainPanel +0',
      CHANGED.every(n => pre[n] !== null) &&
      task.analyzeChunk.split('\n').length === pre.analyzeChunk.split('\n').length &&
      task.orchestrate.split('\n').length === pre.orchestrate.split('\n').length &&
      task._isValidScanResult.split('\n').length === pre._isValidScanResult.split('\n').length &&
      task._srGroupResults.split('\n').length === pre._srGroupResults.split('\n').length + 2 &&
      task.renderMainPanel.split('\n').length === pre.renderMainPanel.split('\n').length);
  });

  // NS-11 isolation
  await guard('NS-11', () => {
    for (const n of Object.keys(ISOLATION_PINS)) {
      const s = extractFn(src, n);
      chk('NS-11', n + ' is byte-identical to the baseline', !!s && sha256(s) === ISOLATION_PINS[n]);
    }
    const masked = maskFns(src, CHANGED);
    chk('NS-11', 'index.html outside the five changed functions is byte-identical to the baseline (no new top-level function, no other edit)',
      !!masked && sha256(masked) === PRE_MASKED_FIVE);
    chk('NS-11', 'applyCapitalReturnsNudge is still defined once and never called', countOf(src, 'applyCapitalReturnsNudge(') === 1);
    chk('NS-11', 'no `sentiment_score || 50` / `?? 50` anywhere in index.html', !/sentiment_score\s*(\|\||\?\?)\s*50/.test(src));
    chk('NS-11', 'the synthetic literal `sentiment_score: 50` is gone from index.html', countOf(src, 'sentiment_score: 50') === 0);
    chk('NS-11', 'the R-3 lines name no new function (locals and item fields only)',
      CHANGED.every(n => R3[n].every(r => !/\bfunction\b/.test(r.newS))));
  });

  // NS-1 analyzeChunk fallback
  await guard('NS-1', async () => {
    const CASES = [
      { id: 'error', impl: async () => { throw new Error('proxy 502'); }, summary: SUMMARY_NET, parseFailed: false },
      { id: 'parse-fail-after-retry', impl: async () => 'no json here '.repeat(20), summary: SUMMARY_PARSE, parseFailed: true },
      { id: 'parse-empty-no-retry', impl: async () => 'short', summary: SUMMARY_NET, parseFailed: false }
    ];
    const KEYS = ['ticker', 'company_name', 'sentiment', 'sentiment_score', 'summary', 'alerts', 'news', '_aiUnavailable', '_aiParseFailed'];
    for (const c of CASES) {
      const t = buildAnalyzeChunk(task.analyzeChunk, pjSrc, c.impl);
      const out = await t.run();
      const item = t.spy.rawIn && t.spy.rawIn[0];
      chk('NS-1', c.id + ': the fallback result reaches orchestrate once, one item, and is returned', t.spy.calls === 1 && Array.isArray(t.spy.rawIn) && t.spy.rawIn.length === 1 && Array.isArray(out) && out.length === 1);
      chk('NS-1', c.id + ': sentiment_score is exactly null (never 50)', !!item && Object.is(item.sentiment_score, null));
      chk('NS-1', c.id + ': _aiUnavailable === true, _aiParseFailed = ' + c.parseFailed, !!item && item._aiUnavailable === true && item._aiParseFailed === c.parseFailed);
      chk('NS-1', c.id + ': sentiment neutral, exact failure summary, pplx alerts kept, news empty, identity from the watchlist',
        !!item && item.sentiment === 'neutral' && item.summary === c.summary && JSON.stringify(item.alerts) === JSON.stringify(failedItem().alerts) &&
        Array.isArray(item.news) && item.news.length === 0 && item.ticker === 'TST' && item.company_name === 'Test Co');
      chk('NS-1', c.id + ': the fallback carries exactly the pre-task keys in order', !!item && JSON.stringify(Object.keys(item)) === JSON.stringify(KEYS));
      if (pre.analyzeChunk) {
        const p = buildAnalyzeChunk(pre.analyzeChunk, pjSrc, c.impl);
        await p.run();
        const pItem = p.spy.rawIn && p.spy.rawIn[0];
        const strip = o => { const x = Object.assign({}, o); delete x.sentiment_score; return x; };
        chk('NS-1', c.id + ': pre-task fixture sanity — the reverted function still builds the synthetic 50', !!pItem && pItem.sentiment_score === 50);
        chk('NS-1', c.id + ': every other field is byte-identical to the pre-task fallback', !!item && !!pItem && JSON.stringify(strip(item)) === JSON.stringify(strip(pItem)));
      } else chk('NS-1', c.id + ': pre-task variant buildable', false);
    }
  });

  // NS-2 / NS-3 orchestrate on a failed item
  await guard('NS-2', () => {
    const o = buildOrchestrate(task.orchestrate, classSrc);
    for (const chg of [7, -7, 0]) {
      const out = o.orchestrate([failedItem()], {}, stockFor(chg), { TST: {} })[0];
      chk('NS-2', 'chg ' + chg + ': a failed item keeps sentiment_score === null (never 55 / 45)', Object.is(out.sentiment_score, null));
      chk('NS-2', 'chg ' + chg + ': sentiment stays neutral', out.sentiment === 'neutral');
    }
    const outUndef = o.orchestrate([failedItem({ sentiment_score: undefined })], {}, stockFor(7), { TST: {} })[0];
    chk('NS-2', 'an absent score is never turned into a number either', outUndef.sentiment_score === undefined && outUndef.sentiment === 'neutral');
  });
  await guard('NS-3', () => {
    const o = buildOrchestrate(task.orchestrate, classSrc);
    for (const setup of ['extended_near_ath', 'below_key_mas']) {
      const pplx = { TST: { bullishCatalysts: ['Upgrade'], bearishCatalysts: [], macroDrivers: [], analystActions: [{ bank: 'UBS', target: 120 }] } };
      const out = o.orchestrate([failedItem()], pplx, stockFor(7), { TST: SNAPS[setup] })[0];
      chk('NS-3', setup + ': the deterministic setup is still assigned', out.technical_setup === setup);
      chk('NS-3', setup + ': no action is derived from a failed analysis', out.action === undefined && !('action' in out));
      chk('NS-3', setup + ': sentiment stays neutral, score stays null', out.sentiment === 'neutral' && Object.is(out.sentiment_score, null));
      chk('NS-3', setup + ': no conflict and no key risk are invented', out.conflict === undefined && out.key_risk === undefined);
      chk('NS-3', setup + ': verified price / change, extended-hours cache and audit trail are present',
        out._verifiedPrice === PRICE && out._verifiedChangePct === 7 && !!o._extendedMktCache.TST && o._extendedMktCache.TST.marketState === 'REGULAR' &&
        !!out._auditTrail && out._auditTrail.interpretation.technicalSetup === setup && out._auditTrail.finalDecision.action === null &&
        out._auditTrail.dataCollected.price === PRICE && out._orchestrated === true);
      chk('NS-3', setup + ': the analyst alert is kept (deduplicated, not duplicated)', Array.isArray(out.alerts) && out.alerts.length === 1 && out._catalysts.analystActions.length === 1);
    }
  });

  // NS-4 non-failed regression against the pre-task function
  await guard('NS-4', () => {
    if (!pre.orchestrate) { chk('NS-4', 'pre-task orchestrate buildable', false); return; }
    const t = buildOrchestrate(task.orchestrate, classSrc);
    const p = buildOrchestrate(pre.orchestrate, classSrc);
    const classify = new Function(classSrc + '\nreturn classifyTechnicalSetup;')();
    for (const k of Object.keys(SNAPS)) chk('NS-4', 'fixture sanity: snapshot classifies as ' + k, classify(SNAPS[k]) === k);
    const pplxVariants = [{}, { TST: { bullishCatalysts: ['Upgrade'], bearishCatalysts: [], macroDrivers: [], analystActions: [] } }];
    let n = 0; const bad = [];
    for (const setup of Object.keys(SNAPS)) for (const chg of [7, 0, -7]) for (const score of [90, 30, 70, 0])
      for (const action of ['buy', 'add_half', 'avoid', undefined]) for (const bias of ['bullish', undefined]) for (const kr of [null, 'No verified catalyst exists']) for (const pplx of pplxVariants) {
        const mk = () => { const it = { ticker: 'TST', sentiment_score: score, sentiment: 'positive', summary: 'Rating: Buy', news_bias: bias, key_risk: kr, conflict: null, alerts: [{ type: 'normal', text: 'x' }] }; if (action !== undefined) it.action = action; return it; };
        const a = JSON.stringify(t.orchestrate([mk()], JSON.parse(JSON.stringify(pplx)), stockFor(chg), { TST: SNAPS[setup] })[0]);
        const b = JSON.stringify(p.orchestrate([mk()], JSON.parse(JSON.stringify(pplx)), stockFor(chg), { TST: SNAPS[setup] })[0]);
        n += 1;
        if (a !== b) bad.push(setup + '/' + chg + '/' + score + '/' + action + '/' + bias);
      }
    chk('NS-4', 'fixture breadth: at least 1000 non-failed combinations over all 8 setups (' + n + ')', n >= 1000);
    chk('NS-4', 'every non-failed item produces output identical to the pre-task function' + (bad.length ? ' (first: ' + bad.slice(0, 3).join(' | ') + ')' : ''), bad.length === 0);
    chk('NS-4', 'extended-hours cache identical to the pre-task function', JSON.stringify(t._extendedMktCache) === JSON.stringify(p._extendedMktCache));
    // the existing behaviour still fires for a normal item (positive control for the guards)
    const ex = t.orchestrate([{ ticker: 'TST', sentiment_score: 90, sentiment: 'positive', summary: '', action: 'buy', news_bias: 'bullish' }], {}, stockFor(1.2), { TST: SNAPS.extended_near_ath })[0];
    chk('NS-4', 'positive control: a normal item on extended_near_ath is still clamped to 62 / hold_wait with a key risk', ex.sentiment_score === 62 && ex.action === 'hold_wait' && !!ex.key_risk);
    const up = t.orchestrate([{ ticker: 'TST', sentiment_score: 30, sentiment: 'neutral', summary: '' }], {}, stockFor(7), { TST: {} })[0];
    chk('NS-4', 'positive control: a normal item with chg +7 and score 30 is still lifted to 55 / positive', up.sentiment_score === 55 && up.sentiment === 'positive');
  });

  // NS-5 validator
  await guard('NS-5', () => {
    const c = buildChain(src);
    const v = c._isValidScanResult;
    const base = over => Object.assign({ ticker: 'AAPL', sentiment: 'neutral', sentiment_score: 50, summary: VALID_SUMMARY, _verifiedChangePct: 1.2 }, over || {});
    chk('NS-5', 'null + _aiUnavailable === true is accepted', v(base({ sentiment_score: null, _aiUnavailable: true })) === true);
    chk('NS-5', 'the real fallback shape (failure summary, neutral) is accepted', v(failedItem()) === true);
    chk('NS-5', 'null without _aiUnavailable is rejected', v(base({ sentiment_score: null })) === false);
    chk('NS-5', "null + _aiUnavailable 'true' / 1 / false is rejected (strict boolean)", v(base({ sentiment_score: null, _aiUnavailable: 'true' })) === false && v(base({ sentiment_score: null, _aiUnavailable: 1 })) === false && v(base({ sentiment_score: null, _aiUnavailable: false })) === false);
    chk('NS-5', 'null + _aiUnavailable with a short summary is rejected', v(base({ sentiment_score: null, _aiUnavailable: true, summary: 'too short' })) === false);
    chk('NS-5', 'null + _aiUnavailable with a bad sentiment is rejected', v(base({ sentiment_score: null, _aiUnavailable: true, sentiment: 'bullish' })) === false);
    chk('NS-5', 'null + _aiUnavailable with a raw-blob marker is rejected', v(base({ sentiment_score: null, _aiUnavailable: true, summary: VALID_SUMMARY + ' __raw__' })) === false);
    chk('NS-5', 'undefined / NaN / "50" with _aiUnavailable are still rejected (only null is the failure value)', [undefined, NaN, '50', '', -1, 101].every(s => v(base({ sentiment_score: s, _aiUnavailable: true })) === false));
    chk('NS-5', 'pre-existing cases unchanged: valid accepted; empty ticker, 999, -1, 101, short summary, bad enum, markers, absent score rejected',
      v(base()) === true && v(base({ sentiment_score: 0 })) === true && v(base({ sentiment_score: 100 })) === true &&
      v(base({ ticker: '' })) === false && v(base({ sentiment_score: 999 })) === false && v(base({ sentiment_score: -1 })) === false && v(base({ sentiment_score: 101 })) === false &&
      v(base({ summary: 'too short' })) === false && v(base({ sentiment: 'bullish' })) === false &&
      v(base({ summary: VALID_SUMMARY + ' __raw__' })) === false && v(base({ summary: VALID_SUMMARY + ' === PERPLEXITY' })) === false && v(base({ summary: VALID_SUMMARY + ' %%NEWS_CONTEXT' })) === false &&
      (() => { const a = base(); delete a.sentiment_score; return v(a) === false; })() && !v(null));
    chk('NS-5', 'a numeric score with _aiUnavailable (legacy stored shape) is still accepted as a number', v(base({ sentiment_score: 50, _aiUnavailable: true })) === true);
  });

  // NS-6 replacement
  await guard('NS-6', () => {
    const c = buildChain(src);
    const prev = [{ ticker: 'AAPL', sentiment_score: 72, sentiment: 'positive', summary: VALID_SUMMARY, technical_setup: 'healthy_uptrend', _verifiedPrice: PRICE, _verifiedChangePct: 1.2, action: 'buy' }];
    const prevSnap = JSON.stringify(prev);
    const failed = failedItem({ ticker: 'AAPL', company_name: 'Apple', technical_setup: 'healthy_uptrend', _verifiedPrice: PRICE, _verifiedChangePct: 1.2 });
    const admitted = c.enforceScoreConsistency([failed], JSON.stringify('raised PT and upgrade to buy, earnings beat expectations')).filter(c._isValidScanResult);
    chk('NS-6', 'the failed rescan passes the terminal chain unchanged (immune to the boost) and is admitted', admitted.length === 1 && admitted[0] === failed && Object.is(failed.sentiment_score, null));
    const merged = c.mergeResultsByTicker(prev, admitted);
    const aapl = merged.filter(r => r.ticker === 'AAPL');
    chk('NS-6', 'the merged store holds one AAPL and it is the failed result (null), not the old 72', aapl.length === 1 && aapl[0] === failed && Object.is(aapl[0].sentiment_score, null));
    chk('NS-6', 'the previous input is byte-stable', JSON.stringify(prev) === prevSnap);
    const sr = buildScanResults(src);
    const g = sr.group(merged);
    chk('NS-6', 'Daily Review: AAPL is in the failed group only', g[g.length - 1].name === FAILED_GROUP && g[g.length - 1].items.length === 1 && g.slice(0, -1).every(x => x.items.length === 0));
    const ranked = sr.render('ranked', merged);
    const review = sr.render('review', merged);
    chk('NS-6', 'Ranked: 72 is not shown; the score cell is the missing cell', ranked.indexOf('72') === -1 && ranked.indexOf('vsc-num-missing') !== -1 && countOf(ranked, 'data-ticker="AAPL"') === 1);
    chk('NS-6', 'Daily Review: 72 is not shown; the score cell is "—" under the failed group header', review.indexOf('72') === -1 && review.indexOf('<td class="r sr-score"><span>—</span>') !== -1 && review.indexOf(FAILED_GROUP) !== -1);
    const render = buildRenderer(src, task.renderMainPanel);
    const html = render(Object.assign({}, failed, { ticker: 'TST' }), panelSnap(), PRICE, {});
    const row = scoreRow(html);
    chk('NS-6', 'the panel for the merged item shows no 72 and a "—" Score row', !!row && row.text === '—' && html.indexOf('72 / 100') === -1 && html.indexOf('>72<') === -1);
  });

  // NS-7 ranked contract
  await guard('NS-7', () => {
    const sr = buildScanResults(src);
    const items = [0, 45, null, 90].map((s, i) => ({ ticker: 'T' + i, sentiment_score: s, summary: VALID_SUMMARY, sentiment: 'neutral', _aiUnavailable: s === null }));
    chk('NS-7', '[0, 45, null, 90] sorts 90, 45, 0, null (missing last, after a genuine 0)', sr.cmp(items).map(r => r.sentiment_score).join(',') === '90,45,0,');
    const html = sr.render('ranked', items);
    const order = (html.match(/data-ticker="([^"]+)"/g) || []).map(m => m.slice(13, -1));
    chk('NS-7', 'the ranked table renders in that order', order.join(',') === 'T3,T1,T0,T2');
    chk('NS-7', 'the missing score cell is "—" (vsc-num-missing), never a digit', sr.cell(null).indexOf('vsc-num-missing') !== -1 && sr.cell(null).indexOf('—') !== -1 && !/\d/.test(sr.cell(null).replace(/vsc-[a-z-]+/g, '')));
    chk('NS-7', 'a genuine 0 renders "0", a 90 renders "90"', sr.cell(0).indexOf('>0<') !== -1 && sr.cell(90).indexOf('>90<') !== -1);
  });

  // NS-8 Daily Review group
  await guard('NS-8', () => {
    const sr = buildScanResults(src);
    const S = VALID_SUMMARY;
    const normal = [
      { ticker: 'A', sentiment_score: 0,    technical_setup: 'support_test',      rating: 'Neutral', summary: S },
      { ticker: 'B', sentiment_score: 40,   technical_setup: 'support_test',      rating: 'Neutral', summary: S },
      { ticker: 'C', sentiment_score: null, technical_setup: 'support_test',      rating: 'Neutral', summary: S },
      { ticker: 'D', sentiment_score: 60,   technical_setup: 'healthy_uptrend',   rating: 'Buy',     summary: S },
      { ticker: 'E', sentiment_score: 60,   technical_setup: 'healthy_uptrend',   rating: 'Sell',    summary: S },
      { ticker: 'F', sentiment_score: 60,   technical_setup: 'healthy_uptrend',   rating: 'Neutral', summary: S },
      { ticker: 'G', sentiment_score: null, technical_setup: 'healthy_uptrend',   rating: 'Buy',     summary: S },
      { ticker: 'H', sentiment_score: 0,    technical_setup: 'healthy_uptrend',   rating: 'Buy',     summary: S },
      { ticker: 'I', sentiment_score: 80,   technical_setup: 'extended_near_ath', rating: 'Buy',     summary: S },
      { ticker: 'J', sentiment_score: 20,   technical_setup: 'below_key_mas',     rating: 'Sell',    summary: S }
    ];
    const failed = [
      failedItem({ ticker: 'K', technical_setup: 'healthy_uptrend' }),
      failedItem({ ticker: 'L', technical_setup: 'extended_near_ath' }),
      failedItem({ ticker: 'M', technical_setup: 'below_key_mas' }),
      failedItem({ ticker: 'N' }),
      { ticker: 'O', sentiment_score: 50, sentiment: 'neutral', technical_setup: 'healthy_uptrend', summary: SUMMARY_NET, _aiUnavailable: true } // legacy stored synthetic 50 (brief residual)
    ];
    const mixed = [];
    for (let i = 0; i < normal.length; i += 1) { mixed.push(normal[i]); if (failed[i]) mixed.push(failed[i]); } // deterministic interleave
    const g = sr.group(mixed);
    const ids = x => x.items.map(r => r.ticker).join(',');
    const g4 = g[4] || { name: null, items: [] };
    chk('NS-8', 'five groups; the last is named exactly "' + FAILED_GROUP + '"', g.length === 5 && g4.name === FAILED_GROUP);
    chk('NS-8', 'the first four group names are unchanged', g.slice(0, 4).map(x => x.name).join('|') === 'Strong Setup|Watch|Extended / near 1Y high|Caution');
    chk('NS-8', 'every _aiUnavailable item is in the last group (any setup, null or legacy 50) and nowhere else',
      g4.items.length === 5 && g4.items.every(r => r._aiUnavailable === true) && g.slice(0, 4).every(x => x.items.every(r => r._aiUnavailable !== true)));
    chk('NS-8', 'inside the failed group the legacy 50 sorts before the nulls (existing comparator)', ids(g4).indexOf('O') === 0);
    chk('NS-8', 'a null score WITHOUT the marker stays in its setup group (C, G in Watch), not in the failed group', ids(g[1]).indexOf('G') !== -1 && ids(g[1]).indexOf('C') !== -1);
    if (pre._srGroupResults) {
      const preSr = buildScanResults(src, pre._srGroupResults);
      const pg = preSr.group(normal);
      chk('NS-8', 'pre-task fixture sanity: the reverted function has four groups', pg.length === 4);
      chk('NS-8', 'non-failed membership identical to the pre-task function in all four groups', pg.every((x, i) => ids(x) === ids(g[i])));
    } else chk('NS-8', 'pre-task variant buildable', false);
    const htmlNone = sr.grouped(normal);
    chk('NS-8', 'no failed item -> the failed group is not rendered', htmlNone.indexOf(FAILED_GROUP) === -1 && countOf(htmlNone, 'sr-group-hdr') === 4);
    const htmlMixed = sr.grouped(mixed);
    const hdrs = htmlMixed.match(/sr-group-hdr"><td colspan="6">([^<]*)</g) || [];
    chk('NS-8', 'with failed items the failed group header is rendered exactly once, last, with its count', hdrs.length === 5 && hdrs[4].indexOf(FAILED_GROUP) !== -1 && htmlMixed.indexOf(FAILED_GROUP + '<span class="sr-group-count">5</span>') !== -1);
  });

  // NS-9 Score row
  await guard('NS-9', () => {
    const render = buildRenderer(src, task.renderMainPanel);
    const snap = panelSnap();
    const html = render(failedItem({ _verifiedPrice: PRICE, _verifiedChangePct: 1.2 }), snap, PRICE, {});
    const row = scoreRow(html);
    chk('NS-9', 'null: the Score row is present', !!row);
    chk('NS-9', 'null: the value is "—" in the neutral class, no digits, no "null"', !!row && row.text === '—' && row.cls === 'neutral-v' && !/\d/.test(row.text) && row.row.indexOf('null') === -1);
    chk('NS-9', 'null: the label literal is unchanged and occurs exactly once in renderMainPanel', !!row && row.row.indexOf('<span class="rr-lbl">Score</span>') !== -1 && countOf(task.renderMainPanel, '<span class="rr-lbl">Score</span>') === 1);
    chk('NS-9', 'null: "null" appears nowhere in the rendered panel', html.indexOf('null') === -1);
    const htmlPre = render(failedItem({ _verifiedPrice: PRICE, _verifiedChangePct: 1.2 }), snap, 188.5, PRE_EXT);
    const rowPre = scoreRow(htmlPre);
    chk('NS-9', 'null under a refreshed PRE price: still "—" neutral, no "from scan" digits', !!rowPre && rowPre.text === '—' && rowPre.cls === 'neutral-v');
    const n70 = render(normalItem(), snap, PRICE, {});
    const r70 = scoreRow(n70);
    chk('NS-9', '70: "70 / 100" in the pos class', !!r70 && r70.text === '70 / 100' && r70.cls === 'pos');
    const n70pre = render(normalItem(), snap, 188.5, PRE_EXT);
    const r70pre = scoreRow(n70pre);
    chk('NS-9', '70 under a refreshed PRE price: "70 / 100" then the Entry 32 "from scan" marker', !!r70pre && /^70 \/ 100<span style="[^"]*">from scan<\/span>$/.test(r70pre.text) && countOf(r70pre.row, 'from scan') === 1);
    const n30 = scoreRow(render(normalItem({ sentiment_score: 30 }), snap, PRICE, {}));
    const n50 = scoreRow(render(normalItem({ sentiment_score: 50 }), snap, PRICE, {}));
    chk('NS-9', '30 -> neg, 50 -> warn (numeric classes unchanged)', !!n30 && n30.cls === 'neg' && n30.text === '30 / 100' && !!n50 && n50.cls === 'warn' && n50.text === '50 / 100');
    if (pre.renderMainPanel) {
      const renderPre = buildRenderer(src, pre.renderMainPanel);
      for (const [label, item, ref, ext] of [['equal price', normalItem(), PRICE, {}], ['PRE refreshed', normalItem(), 188.5, PRE_EXT], ['score 30', normalItem({ sentiment_score: 30 }), PRICE, {}]]) {
        const a = scoreRow(render(item, snap, ref, ext)); const b = scoreRow(renderPre(item, snap, ref, ext));
        chk('NS-9', label + ': the numeric Score row is byte-identical to the pre-task render', !!a && !!b && a.row === b.row);
      }
      const a = render(normalItem(), snap, PRICE, {}); const b = renderPre(normalItem(), snap, PRICE, {});
      chk('NS-9', 'a normal item renders a byte-identical panel to the pre-task function', a === b);
      const preNull = scoreRow(renderPre(failedItem({ _verifiedPrice: PRICE, _verifiedChangePct: 1.2 }), snap, PRICE, {}));
      chk('NS-9', 'pre-task fixture sanity: the reverted function rendered "null / 100" in the neg class', !!preNull && preNull.text === 'null / 100' && preNull.cls === 'neg');
    } else chk('NS-9', 'pre-task variant buildable', false);
  });

  // NS-10 action block for a failed item
  await guard('NS-10', () => {
    const render = buildRenderer(src, task.renderMainPanel);
    const snap = panelSnap();
    const html = render(failedItem({ _verifiedPrice: PRICE, _verifiedChangePct: 1.2 }), snap, PRICE, {});
    chk('NS-10', 'failed item: no dial', countOf(html, 'at-dial-row') === 0 && countOf(html, 'at-dial-num') === 0);
    chk('NS-10', 'failed item: no Pulse rating chip', countOf(html, 'ph-rating-chip') === 0);
    chk('NS-10', 'failed item: the "AI analysis unavailable" banner is present exactly once', countOf(html, BANNER) === 1);
    chk('NS-10', 'failed item: the Actionable Take card shows the no-analysis placeholder and no AI-generated sub-title',
      html.indexOf('No analysis available — run scan for actionable take') !== -1 && html.indexOf('AI-generated analysis · Verify independently') === -1);
    const ok = render(normalItem(), snap, PRICE, {});
    chk('NS-10', 'positive control: a normal item renders the dial, the rating chip and no banner', countOf(ok, 'at-dial-row') === 1 && countOf(ok, 'ph-rating-chip') === 1 && countOf(ok, BANNER) === 0);
  });

  return R;
}

// ── Planted negatives: the mutation lands on the production source text ─────────────────────────
function mut(text, from, to) {
  const n = countOf(text, from);
  if (n !== 1) throw new Error('mutation anchor found ' + n + ' times: ' + from.slice(0, 60));
  return text.replace(from, () => to);
}
const NEGATIVES = [
  { id: 'NS-1', label: 'synthetic 50 restored in the fallback', f: s => mut(s, R3.analyzeChunk[0].newS, R3.analyzeChunk[0].oldS) },
  { id: 'NS-2', label: 'typeof guard removed from the chg > 5 override', f: s => mut(s, R3.orchestrate[1].newS, R3.orchestrate[1].oldS) },
  { id: 'NS-3', label: 'action overrides applied to failed items', f: s => mut(mut(s, R3.orchestrate[3].newS, R3.orchestrate[3].oldS), R3.orchestrate[5].newS, R3.orchestrate[5].oldS) },
  { id: 'NS-4', label: 'a guard leaking to normal items (extended_near_ath gate inverted)',
    f: s => mut(s, R3.orchestrate[3].newS, R3.orchestrate[3].newS.replace('item._aiUnavailable !== true', 'item._aiUnavailable === true')) },
  { id: 'NS-5', label: 'null accepted without _aiUnavailable',
    f: s => mut(s, '(r.sentiment_score === null && r._aiUnavailable === true)', '(r.sentiment_score === null)') },
  { id: 'NS-6', label: 'validator rejecting the failed item (old 72 survives)', f: s => mut(s, R3._isValidScanResult[0].newS, R3._isValidScanResult[0].oldS) },
  { id: 'NS-8', label: 'failed items left in their setup groups', f: s => mut(s, R3._srGroupResults[2].newS, R3._srGroupResults[2].oldS) },
  { id: 'NS-9', label: '`${score} / 100` restored (renders "null / 100")', f: s => mut(s, R3.renderMainPanel[0].newS, R3.renderMainPanel[0].oldS) },
  { id: 'NS-10', label: 'dial rendered for a failed item', f: s => mut(s, '  const _dialHtml  = (item.action || actionable)', '  const _dialHtml  = (true)') },
  { id: 'NS-11', label: 'a new top-level function added',
    f: s => { const c = extractFn(s, 'classifyTechnicalSetup'); return mut(s, c, c + '\n\nfunction _nsHelper(s) { return s; }'); } },
  { id: 'NS-12', label: 'a second renderMainPanel region changed',
    f: s => mut(s, "const hasCrit = (item.alerts||[]).some(a=>a.type==='critical');", "const hasCrit = (item.alerts||[]).some(a=>a.type==='warn');") }
];

// ── Main ─────────────────────────────────────────────────────────────────────────────────────────
(async () => {
  let failures = 0;
  let asserts = 0;
  const check = (name, cond) => { asserts += 1; if (!cond) { failures += 1; console.log('  FAIL  ' + name); } };

  const index = norm(fs.readFileSync(INDEX_PATH, 'utf8'));
  const real = await evaluate(index);
  const ids = Object.keys(real).sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
  for (const id of ids) for (const c of real[id]) check(id + ' ' + c.name, c.ok);
  const expected = ['NS-1', 'NS-2', 'NS-3', 'NS-4', 'NS-5', 'NS-6', 'NS-7', 'NS-8', 'NS-9', 'NS-10', 'NS-11', 'NS-12'];
  for (const g of expected) check(g + ' group ran', Array.isArray(real[g]) && real[g].length > 0);

  // Negatives only mean something when the real run is clean; otherwise report them as unproven.
  const realClean = failures === 0;
  for (const n of NEGATIVES) {
    let mutated = null;
    try { mutated = n.f(index); } catch (e) { check('negative ' + n.id + ' (' + n.label + '): anchor unique — ' + e.message, false); continue; }
    const r = await evaluate(mutated);
    const bit = Array.isArray(r[n.id]) && r[n.id].some(c => !c.ok);
    check('negative ' + n.id + ' (' + n.label + ') is caught by ' + n.id + (realClean ? '' : ' [unproven: real run not clean]'), bit && realClean);
  }

  console.log(failures === 0
    ? 'NO SYNTHETIC SCORE OFFLINE: PASS (' + asserts + ' asserts)'
    : 'NO SYNTHETIC SCORE OFFLINE: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
  process.exit(failures === 0 ? 0 : 1);
})();
