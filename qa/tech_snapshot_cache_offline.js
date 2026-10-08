'use strict';

/*
 * TSC — technical snapshot is never reused for a different price (BACKLOG Entry 32).
 *
 * Pure Node, no network (fetch seams are counterfeit spies), no browser, no localStorage
 * global. Extracts the REAL production bytes from index.html and runs them verbatim in a
 * sandbox — never a re-implementation of the code under test.
 *
 * Groups (brief work/tech-snapshot-price-cache/brief.md §5):
 *   TC-1..3,7,8  computeTechnicalSnapshot: base/snap split, price-dependent values recomputed
 *   TC-4         orchestrate uses the scan's own snapshot, never the global cache
 *   TC-5         Technical Setup panel: _techSnapFor / refreshTechPanel
 *   TC-6         Deep Dive: no mismatched technical block
 *   TC-9         isolation (static)
 *   TC-10        renderMainPanel: exactly I7a-I7i, A9a-A9d and the R-2 table changed (textual revert proves the old pin)
 *   TC-11        caliper pins: only the renderMainPanel value moved
 *   TC-12/14/15  render harness: displayed price == snapshot price; Setup from the same
 *                snapshot; scan-time values marked "from scan" when the prices differ
 *   TC-13        Tech Score untouched (+ the TS1 default-exposure suite's one-line pin)
 *
 * Every group carries planted negatives: the mutation lands on the production source text
 * (or a pin file) and the group must then FAIL.
 *
 * All source text is compared LF-normalised; CRLF-form hashes are derived from it, so the
 * result does not depend on the checkout's line-ending convention.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const CALIPER_PATH = path.join(__dirname, 'vis_score_caliper_offline.js');
const TS1_PATH = path.join(__dirname, 'ts1_default_exposure_offline.js');

const norm = s => s.replace(/\r\n/g, '\n');
const crlf = s => norm(s).replace(/\n/g, '\r\n');
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

// ── Pins (sha256) of the 24fabf0 base, LF-normalised ────────────────────────────────────────
const BASE_PINS = {
  classifyTechnicalSetup: 'c143eb08d982cff036dd5678def08dc38e7dede6e2a0f4ae11a79d277e3ab3ad',
  buildTechSnapshotBlock: '62addea0cf73ea3e349294a359893716cabc08cb3632860b620060eaa155be29',
  computeSMA: 'c477a33a601bccf0b2e61f12d246c480df4b003f118cd9a61fea6bdae5730230',
  computePctDiff: 'ec61724ddae439fb5858152c9f050c55f0178d7e3a86a50768847b148f01d2a5',
  computeRelativePerf: '84f3e7318a95ff8dac20fb485d66458c57cbde92a3f3c290b2c1513137fe2f29',
  computeVolumeMetrics: '5fc9378eded81ffa26f0f652c4ddb05680e9103620a8f2eddfa198abe1fd39ad',
  computeHigh1yDistance: 'e42268120acd9618ecc13a0a811c9cbdc6846d51e6a8448a1557a635bcc3b1e3',
  enforceScoreConsistency: 'e1406d9bfe8358212ada456882bea248cb761cc68734213aa5151b9c02966a00',
  _ts1FillRow: '306a720ed51792ef3294faba91dd4b5420d1264b9ace81402dc638559edf7b1e',
  _initTsCard: 'e31f1671b0907ca34686d5bda119327689345a270114eb70cf5a300ef49e311a',
  runTechScoreV1: 'cbb5b8aef9cdbf4c3a53f8984ffe588e15857eda4fb8341cd909025cfdabb1f4',
  _ts1RowText: '6df1e8355698b11e89f5f01193184a17f536a57f047cac6eec322159f4f69a06',
  _ptScoreDial: '22a2c59e47fcda24b61c08221a5e02f66ecd2de57bdf995510fbb52e7906666e',
  _ptScoreText: '5b22d6c5daa4ed2e70370d4fe479e08dfff2c099bb2839748ad03ce7677f3589',
  _ptScoreNorm: '4ab627ca0c86aa8012a46c2104cd74640a57addc38bda86d7e1850131e395cb2'
};
const BASE_TS1_REGION = '9b267da4c06a7724ccbe13ba83bf376ba1dcd2dd7931d3b40fd73377aa8e6604';
// renderMainPanel: base (LF-normalised, = TS1 suite TX-3 pin) and base (CRLF form = caliper pin).
const BASE_RM_LF = 'a8c13d283ad90e4c132e6d68a5570682b39d5c127d1dd5a4ce18795178ab838f';
const OLD_RM_CALIPER_PIN = 'd11b09a989f19ee1fa09770ac135e8f00ce518558b25cc7bce3ee23cf1b174ac';
// New pins (task renderMainPanel after I7a-I7i, A9a-A9d and the R-2 table): LF-normalised (TS1 suite) and CRLF form (caliper).
const NEW_RM_LF = 'e84c5e61abcb1179add1c5db28d5d5b1e958daa10b0363fdb339d83363fed869';
const NEW_RM_CALIPER_PIN = 'f5df295f45f8b8b7978b57962379ada5395c6a62c7c175e219a355c8e3f8aa30';

const BASE_PRICE_LINE = "  let price = item._verifiedPrice ? `$${item._verifiedPrice.toFixed(2)}` : '—';\n";
const BASE_EXT_OVERRIDE = "  if (_showExt && _extC) {\n    if (typeof _extC.regularPrice    === 'number') price = `$${_extC.regularPrice.toFixed(2)}`;\n    if (typeof _extC.regularChangePct === 'number') chg  = _extC.regularChangePct;\n  }";

const BASE_CALIPER_PINS = {
  _ptScoreNorm: 'f1e1fb44de603a04909339daa62d598f5e3b9143d05070a3601a0c8503e17e0b',
  _ptScoreText: '27c3d9d3ad7bb737068c09eeb17088a0982ce87685637fcaecd30b0485918f25',
  _ptScoreCmp: 'bf237908d383b92446148828d3f9b74609f0e0979a22345056a5ff5418cdd2e5',
  _ptScoreAvg: '29413b98a5ed8d38bf837173ec61cda500580de294c5dce8b2f9ccddf27a2a6b',
  _ptScoreStates: '41968b418333e8a95f8fa6c15225351b9b7d73196bd808e7dd4ac6b7e3d83771',
  _ptScoreFillHtml: 'dfeb1959f3ca9f877d7158db68d5109c64bf36eb4f3f23eb300b735ae69f5a23',
  _ptScoreDial: '4092f243120f5c6bdf3269a02e599f3ad68afcd4a8afe8d766724879b0ef4bce',
  _srGroupResults: '56cf3149645d276df0fc66cdae605cfacf6f3a838e7b06c21b06f57ff0ed6741',
  _srRenderGrouped: '1301f2faa44a781f37c8b66a8826dd06a027af73f6c7a33f2a9c91c987a09ea1'
};
const BASE_CALIPER_CSS_HASH = 'b4c63e696fe93f7ab693b2d778c4426b58ae3f719bc95e92a97e0a117c4828d5';
// The TS1 default-exposure suite's other TX-3 pins (CRLF-normalised, no async prefix) at the base.
const BASE_TS1_TX3 = {
  runTechScoreV1: 'f36bc4eb5cba98708d126414f9cad74c61faa0e8a66f80d7a6940a894fec504d',
  _ts1FillRow: '17c8863a09b38ed15b9126906185cfd35bf2107ad30e95523d19a62a6630ac5f',
  _ts1RowText: '6df1e8355698b11e89f5f01193184a17f536a57f047cac6eec322159f4f69a06'
};

// ── I7 table (brief §3): the only renderMainPanel changes ───────────────────────────────────
const I7_INSERT = [
  "  const _panelSnap  = _techSnapFor(item.ticker, _techPanelPrice(item)); // Entry 32: one snapshot for distances and Setup",
  "  const _panelSetup = hasData ? classifyTechnicalSetup(_panelSnap) : 'unknown';",
  "  const _fromScan   = hasData && _techPanelPrice(item) !== item._verifiedPrice; // Entry 32: displayed price differs from scan price"
];
const I7_ANCHOR_OLD = "const [phase,phCls]=_tfMap[item.technical_setup]||['NEUTRAL','neutral-v'];";
const I7_REPLACE = [
  { id: 'I7d', oldS: I7_ANCHOR_OLD,
    newS: "const [phase,phCls]=_panelSetup==='unknown'?['—','neutral-v']:(_tfMap[_panelSetup]||['NEUTRAL','neutral-v']);" },
  { id: 'I7e', oldS: "const snap  = (_techCache[item.ticker] && _techCache[item.ticker].snap) || {};",
    newS: "const snap  = _panelSnap;" },
  { id: 'I7f', oldS: "const _tsAssess = hasData && item.technical_setup ? (_tsAssessMap[item.technical_setup] || '') : '';",
    newS: "const _tsAssess = _panelSetup !== 'unknown' ? (_tsAssessMap[_panelSetup] || '') : '';" },
  { id: 'I7g', oldS: "${score} / 100</span>",
    newS: "${score} / 100${_fromScan ? '<span style=\"color:var(--text3);font-size:10px;margin-left:6px\">from scan</span>' : ''}</span>" },
  { id: 'I7h', oldS: "<span class=\"mp-act-lbl\">Setup</span>",
    newS: "<span class=\"mp-act-lbl\">${_fromScan ? 'Scan setup' : 'Setup'}</span>" },
  { id: 'I7i', oldS: "<div class=\"at-dial-lbl\">Score</div>",
    newS: "<div class=\"at-dial-lbl\">Score${_fromScan ? '<span style=\"margin-left:6px;text-transform:none;font-weight:400\">from scan</span>' : ''}</div>" }
];

// ── A9 table (R-1 Slice A brief section 1 A9): the four renderMainPanel lines changed by the 1Y-high relabel ──────
// Whole-line text pairs; old = the line as it stands after I7 (the 57afd9d form), new = the task line.
const A9_REPLACE = [
  { id: "A9a",
    oldS: "    healthy_uptrend_near_ath: 'Healthy uptrend near all-time high — trend intact but extended',",
    newS: "    healthy_uptrend_near_ath: 'Healthy uptrend near its 1-year high — trend intact but extended'," },
  { id: "A9b",
    oldS: "    extended_near_ath:        'Price extended above key moving averages and near all-time high',",
    newS: "    extended_near_ath:        'Price extended above key moving averages and near its 1-year high'," },
  { id: "A9c",
    oldS: "          <div class=\"rr-row\"><span class=\"rr-lbl\">ATH Distance</span><span class=\"rr-val ${snap.hasATH ? (snap.athDist < -15 ? 'warn' : snap.athDist < -5 ? 'neutral-v' : 'pos') : 'neutral-v'}\">${snap.hasATH ? fmtPct(snap.athDist) : '—'}</span></div>",
    newS: "          <div class=\"rr-row\"><span class=\"rr-lbl\">1Y High Distance</span><span class=\"rr-val ${snap.hasHigh1y ? (snap.high1yDist < -15 ? 'warn' : snap.high1yDist < -5 ? 'neutral-v' : 'pos') : 'neutral-v'}\">${snap.hasHigh1y ? fmtPct(snap.high1yDist) : '—'}</span></div>" },
  { id: "A9d",
    oldS: "            ${item.technical_setup ? `<div class=\"mp-act-row\"><span class=\"mp-act-lbl\">${_fromScan ? 'Scan setup' : 'Setup'}</span><span class=\"mp-act-val\">${_esc(item.technical_setup).replace(/_/g,' ')}</span></div>` : ''}",
    newS: "            ${item.technical_setup ? `<div class=\"mp-act-row\"><span class=\"mp-act-lbl\">${_fromScan ? 'Scan setup' : 'Setup'}</span><span class=\"mp-act-val\">${_esc(_setupDisplay(item.technical_setup))}</span></div>` : ''}" }
];
function applyA9(rm) {
  let out = rm;
  for (const r of A9_REPLACE) {
    if (countOf(out, r.oldS) !== 1) throw new Error('A9 old line not unique: ' + r.id);
    out = out.replace(r.oldS, () => r.newS);
  }
  return out;
}
function revertA9(taskRm) {
  let out = taskRm;
  for (const r of A9_REPLACE) {
    if (countOf(out, r.newS) !== 1) throw new Error('A9 new line not unique: ' + r.id);
    out = out.replace(r.newS, () => r.oldS);
  }
  return out;
}

// ── R-2 table (work/r2-ma-stack/brief.md section 2.3, Entry 35): the one renderMainPanel line replaced by four ──
// old = the I7f line as it stands after A9 (the e7bbbbb form), new = the four task lines (whole lines, exact bytes).
const R2_OLD = I7_REPLACE[2].newS;
const R2_NEW = [
  "  const _maStackKey = _panelSetup === 'healthy_uptrend' || _panelSetup === 'bullish_stack'; // R-2 (Entry 35): the two setups whose text claims a stack",
  "  const _maStackAll = [_panelSnap.sma20, _panelSnap.sma50, _panelSnap.sma150].every(Number.isFinite);",
  "  const _maStacked  = _maStackAll && _panelSnap.sma20 > _panelSnap.sma50 && _panelSnap.sma50 > _panelSnap.sma150;",
  "  const _tsAssess = _panelSetup === 'unknown' ? '' : !_maStackKey ? (_tsAssessMap[_panelSetup] || '') : _maStacked ? (_tsAssessMap[_panelSetup] || '') : _maStackAll ? 'Price above all key moving averages — healthy uptrend; averages not fully stacked' : 'Healthy uptrend — price above key moving averages';"
];
const R2_BLOCK = R2_NEW.join('\n');
function applyR2(rm) {
  if (countOf(rm, '  ' + R2_OLD) !== 1) throw new Error('R2 old line not unique');
  return rm.replace('  ' + R2_OLD, () => R2_BLOCK);
}
function revertR2(taskRm) {
  if (countOf(taskRm, R2_BLOCK) !== 1) throw new Error('R2 block not present exactly once');
  return taskRm.replace(R2_BLOCK, () => '  ' + R2_OLD);
}
// Brief section 2.2: the assessment text for a setup, given the snapshot the card shows.
function r2Assess(assessMap, setup, snap) {
  if (setup === 'unknown') return null;
  if (setup !== 'healthy_uptrend' && setup !== 'bullish_stack') return assessMap[setup] || null;
  const all = snap && [snap.sma20, snap.sma50, snap.sma150].every(Number.isFinite);
  if (all && snap.sma20 > snap.sma50 && snap.sma50 > snap.sma150) return assessMap[setup] || null;
  return all ? 'Price above all key moving averages — healthy uptrend; averages not fully stacked' : 'Healthy uptrend — price above key moving averages';
}

// ── Source extraction ────────────────────────────────────────────────────────────────────────
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
function countOf(hay, needle) { return needle ? hay.split(needle).length - 1 : 0; }
function ts1Region(content) {
  const s = content.indexOf('// ═══ SCORE-V1-S1 — TECHNICAL SCORE');
  const e = content.indexOf('// ═══ end SCORE-V1-S1');
  if (s === -1 || e === -1) return null;
  const eol = content.indexOf('\n', e);
  return content.slice(s, eol === -1 ? content.length : eol);
}

// Apply the I7 table to a base renderMainPanel (forward) or revert a task one (backward).
function applyI7(baseRm) {
  let out = baseRm;
  for (const r of I7_REPLACE) {
    if (countOf(out, r.oldS) !== 1) throw new Error('I7 old anchor not unique: ' + r.id);
    out = out.replace(r.oldS, () => r.newS);
  }
  const at = out.indexOf('  ' + I7_ANCHOR_OLD.replace(I7_ANCHOR_OLD, I7_REPLACE[0].newS));
  if (at === -1) throw new Error('I7 insert anchor missing');
  return out.slice(0, at) + I7_INSERT.join('\n') + '\n' + out.slice(at);
}
function revertI7(taskRm) {
  let out = taskRm;
  const block = I7_INSERT.join('\n') + '\n';
  if (countOf(out, block) !== 1) throw new Error('I7a-c block not present exactly once');
  out = out.replace(block, () => '');
  for (const r of I7_REPLACE) {
    if (countOf(out, r.newS) !== 1) throw new Error('I7 new text not unique: ' + r.id);
    out = out.replace(r.newS, () => r.oldS);
  }
  return out;
}

// ── Fixture: pilot shape (SMAs ~ 165.64 / 120.97 / 76.72; stored price 59.93; fresh 190.01) ──
const OLD_PRICE = 59.93;
const FRESH_PRICE = 190.01;
function mkCandles(kind) {
  const closes = [];
  for (let i = 0; i < 102; i += 1) closes.push(40);
  for (let i = 0; i < 100; i += 1) closes.push(54.6);
  for (let i = 0; i < 30; i += 1) closes.push(91.2);
  for (let k = 0; k < 20; k += 1) closes.push(165.64 + (k - 9.5) * 1.5);
  const all = closes.map((c, i) => ({
    date: '2026-01-' + String((i % 28) + 1).padStart(2, '0'), open: c, close: c, high: c * 1.01, low: c * 0.99,
    volume: i === closes.length - 1 ? 2000000 : 1000000
  }));
  return kind === 'short' ? all.slice(-15) : all;
}
function mkBench(seed) {
  const out = [];
  for (let i = 0; i < 252; i += 1) {
    const c = 100 + seed * i * 0.05 + (i % 7) * 0.2;
    out.push({ date: 'd' + i, open: c, close: c, high: c * 1.005, low: c * 0.995, volume: 1000000 });
  }
  return out;
}
function mkEnv(kind) {
  const candles = { TST: mkCandles(kind), XLK: mkBench(1), SPY: mkBench(2), QQQ: mkBench(3), XLF: mkBench(4) };
  const clock = { t: 1700000000000 };
  const counters = { candles: 0, quotes: 0 };
  return {
    clock, counters, candles, ext: {}, renders: [],
    DateShim: { now: () => clock.t },
    fetchHistoricalCandles: async sym => { counters.candles += 1; return (candles[sym] || []).map(c => Object.assign({}, c)); },
    fetchStockData: async sym => { counters.quotes += 1; return { change_percent: sym === 'SPY' ? 0.5 : -0.3 }; }
  };
}
const quietConsole = { log() {}, warn() {}, error() {} };

const SNAP_KEYS = ['sma20', 'sma50', 'sma150', 'sma200', 'pct20', 'pct50', 'pct150', 'pct200',
  'hasMA20', 'hasMA50', 'hasMA150', 'hasMA200', 'volRatio', 'hasVolume', 'high1yDist', 'hasHigh1y',
  'rsSector', 'rsSPY', 'rsQQQ', 'sectorEtf', 'candleCount', 'spyChangePct', 'qqqChangePct'];

const ENGINE_FNS = ['computeSMA', 'computePctDiff', 'computeRelativePerf', 'computeVolumeMetrics', 'computeHigh1yDistance', '_setupDisplay',
  'classifyTechnicalSetup', 'buildTechSnapshotBlock', 'hasVerifiedMarketData', '_techRefInput', '_techPanelPrice',
  '_techSnapFor', '_techFetchBase', '_techDeriveSnap', 'computeTechnicalSnapshot', 'refreshTechPanel'];

function buildEngine(src, env) {
  const parts = [];
  const missing = [];
  for (const n of ENGINE_FNS) { const s = extractFn(src, n); if (s) parts.push(s); else missing.push(n); }
  if (missing.length) throw new Error('missing in index.html: ' + missing.join(', '));
  const body = [
    'const _techCache = {}; const CACHE_TTL_MS = 15 * 60 * 1000;',
    'let _activeTicker = null; const _cockpitResults = [];',
    'function renderMainPanel(item) { __renders.push(item.ticker); }',
    parts.join('\n'),
    'return { _techCache, _cockpitResults, setActive: function (v) { _activeTicker = v; }, CACHE_TTL_MS,',
    '  computeTechnicalSnapshot, refreshTechPanel, _techSnapFor, _techPanelPrice, _techRefInput, _techDeriveSnap,',
    '  _techFetchBase, classifyTechnicalSetup, computeHigh1yDistance, computePctDiff, computeSMA, computeRelativePerf,',
    '  computeVolumeMetrics, buildTechSnapshotBlock, hasVerifiedMarketData };'
  ].join('\n');
  const fn = new Function('fetchHistoricalCandles', 'fetchStockData', 'Date', 'console', '_extendedMktCache', '__renders', body);
  return fn(env.fetchHistoricalCandles, env.fetchStockData, env.DateShim, quietConsole, env.ext, env.renders);
}

// ── Render harness (TC-12c / TC-14 / TC-15) ──────────────────────────────────────────────────
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
    apply() { return p; },
    construct() { return p; },
    set() { return true; },
    has() { return true; }
  });
  return p;
}
const NEUTRAL = makeNeutral();
function makeScope(map) {
  return new Proxy({}, {
    has(t, k) {
      if (typeof k === 'symbol') return false;
      if (k in map) return true;
      if (k in globalThis) return false;
      return true;
    },
    get(t, k) {
      if (k === Symbol.unscopables) return undefined;
      if (k in map) return map[k];
      return NEUTRAL;
    },
    set(t, k, v) { map[k] = v; return true; }
  });
}
const RENDER_REAL = ['hasVerifiedMarketData', '_techPanelPrice', '_techSnapFor', '_techRefInput', 'classifyTechnicalSetup',
  '_ptScoreNorm', '_ptScoreText', '_ptScoreDial'];

// Returns render(item, cache, ext) -> innerHTML of #mainPanel.
function buildRenderer(rmSrc, srcForHelpers) {
  const helpers = [];
  for (const n of RENDER_REAL) {
    const s = extractFn(srcForHelpers, n);
    if (!s) { if (n === '_techPanelPrice' || n === '_techSnapFor' || n === '_techRefInput') continue; throw new Error('missing ' + n); }
    helpers.push(s);
  }
  const ratingRe = /var RATING_SUMMARY_RE = (\/[^\n]*\/[a-z]*);/.exec(srcForHelpers);
  if (!ratingRe) throw new Error('RATING_SUMMARY_RE not found');
  const code = 'with (__scope) {\n' + helpers.join('\n') + '\n' + rmSrc + '\nreturn renderMainPanel;\n}';
  const factory = new Function('__scope', code);
  return function render(item, techCache, ext) {
    const node = { innerHTML: '' };
    const map = {
      window: { PT_ENABLE_TECH_SCORE: false, PT_ENABLE_DEEP_DIVE: false },
      document: { getElementById: id => (id === 'mainPanel' ? node : null) },
      console: quietConsole,
      _techCache: techCache,
      _extendedMktCache: ext,
      _cockpitResults: [],
      _mktFailCache: {},
      findTicker: () => null,
      refreshTechPanel: () => undefined,
      RATING_SUMMARY_RE: new Function('return ' + ratingRe[1])()
    };
    const fn = factory(makeScope(map));
    fn(item);
    return node.innerHTML;
  };
}

function parseHtml(html) {
  const m = (re, i) => { const x = re.exec(html); return x ? (i === undefined ? x[0] : x[i]) : null; };
  return {
    price: m(/<span class="ph-price">([^<]*)<\/span>/, 1),
    ma20: m(/<span class="ma-lbl">MA 20<\/span>[\s\S]*?<span class="ma-pct [^"]*">([^<]*)<\/span>/, 1),
    loading: html.indexOf('Loading candle data…') !== -1,
    phase: m(/Timeframe Alignment<\/span><span class="rr-val [^"]*">([^<]*)<\/span>/, 1),
    assess: m(/<div class="ts-assess">([^<]*)<\/div>/, 1),
    scoreRow: m(/<div class="rr-row"><span class="rr-lbl">Score<\/span>.*?<\/div>/),
    setupRow: m(/<div class="mp-act-row"><span class="mp-act-lbl">(?:Scan setup|Setup)<\/span>.*?<\/div>/),
    dial: m(/<div class="at-dial-row">[\s\S]*?<\/div><\/div><\/div>/)
  };
}
const fmtPct = v => (v === null || v === undefined) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
const FROM_SCAN_SPAN_RE = /<span style="[^"]*">from scan<\/span>/;

// ── Static scans ─────────────────────────────────────────────────────────────────────────────
function techCacheAudit(src) {
  const ranges = ['_techSnapFor', 'computeTechnicalSnapshot', 'refreshTechPanel'].map(n => {
    const s = extractFn(src, n);
    if (!s) return null;
    const i = src.indexOf(s);
    return [i, i + s.length];
  });
  const bad = [];
  let decl = 0; let del = 0; let selftest = 0; let off = 0;
  for (const line of src.split('\n')) {
    if (line.includes('_techCache')) {
      const t = line.trim();
      if (t.startsWith('//')) { /* comment */ }
      else if (t === 'const _techCache = {};') decl += 1;
      else if (t === 'delete _techCache[_editSym];') del += 1;
      else if (t.includes("window._techCache && window._techCache['AAPL']")) selftest += 1;
      else if (ranges.some(r => r && off >= r[0] && off < r[1])) { /* allowed helper */ }
      else bad.push(t.slice(0, 90));
    }
    off += line.length + 1;
  }
  return { bad, decl, del, selftest };
}

// ── Evaluation: returns { 'TC-n': [{name, ok}] } for one set of sources ─────────────────────
async function evaluate(S) {
  const R = {};
  const chk = (id, name, cond) => { (R[id] = R[id] || []).push({ name, ok: !!cond }); };
  const guard = async (id, fn) => { try { await fn(); } catch (e) { chk(id, 'group threw: ' + String(e && e.message || e) + ' @ ' + String(e && e.stack || '').split('\n').slice(1, 3).join(' | ').replace(/\s+/g, ' '), false); } };
  const src = S.index;
  const snaps = {};

  // ── TC-1/2/3/7/8 engine ─────────────────────────────────────────────────────────────────
  await guard('TC-1', async () => {
    const env = mkEnv();
    const e = buildEngine(src, env);
    env.clock.t = 0;
    await e.refreshTechPanel('TST', 'XLK', OLD_PRICE);
    const stale = e._techCache.TST && e._techCache.TST.snap;
    chk('TC-1', 'panel refresh stores the stored-price snapshot', stale && e._techCache.TST.refInput === OLD_PRICE);
    env.clock.t = 2.5 * 60 * 1000;
    const fresh = await e.computeTechnicalSnapshot('TST', 'XLK', FRESH_PRICE);
    chk('TC-1', 'scan inside 15 min returns a NEW snapshot (not the stored-price one)', fresh !== stale && fresh.pct20 !== stale.pct20);
    chk('TC-1', 'cache records the scan price as refInput', e._techCache.TST.refInput === FRESH_PRICE);
    snaps.fresh = fresh; snaps.stale = stale;
  });
  await guard('TC-2', async () => {
    const env = mkEnv();
    const e = buildEngine(src, env);
    env.clock.t = 0;
    await e.computeTechnicalSnapshot('TST', 'XLK', OLD_PRICE);
    const before = env.counters.candles;
    env.clock.t = 2.5 * 60 * 1000;
    const fresh = await e.computeTechnicalSnapshot('TST', 'XLK', FRESH_PRICE);
    chk('TC-2', 'second call inside the window does not refetch candles', env.counters.candles === before);
    chk('TC-2', 'second call yields fresh distances', Math.abs(fresh.pct20 - (FRESH_PRICE - fresh.sma20) / fresh.sma20 * 100) < 1e-9);
  });
  await guard('TC-3', async () => {
    const env = mkEnv();
    const e = buildEngine(src, env);
    env.clock.t = 0;
    await e.computeTechnicalSnapshot('TST', 'XLK', OLD_PRICE);
    env.clock.t = 1000;
    const f = await e.computeTechnicalSnapshot('TST', 'XLK', FRESH_PRICE);
    const exp = n => (FRESH_PRICE - f['sma' + n]) / f['sma' + n] * 100;
    chk('TC-3', 'pct20/50/150/200 recomputed from the fresh price',
      [20, 50, 150, 200].every(n => f['pct' + n] === exp(n)));
    chk('TC-3', 'high1yDist recomputed from the fresh price', f.high1yDist === e.computeHigh1yDistance(env.candles.TST, FRESH_PRICE));
    const cold = await buildEngine(src, mkEnv()).computeTechnicalSnapshot('TST', 'XLK', FRESH_PRICE);
    const cls = e.classifyTechnicalSetup(f);
    chk('TC-3', 'classification is not below_key_mas', cls !== 'below_key_mas');
    chk('TC-3', 'classification equals a cold computation at the fresh price', cls === e.classifyTechnicalSetup(cold));
    const stored = await buildEngine(src, mkEnv()).computeTechnicalSnapshot('TST', 'XLK', OLD_PRICE);
    chk('TC-3', 'fixture sanity: the stored price classifies below_key_mas', e.classifyTechnicalSetup(stored) === 'below_key_mas');
  });
  await guard('TC-7', async () => {
    const env = mkEnv();
    const e = buildEngine(src, env);
    env.clock.t = 0;
    await e.computeTechnicalSnapshot('TST', 'XLK', FRESH_PRICE);
    let n = env.counters.candles;
    await e.computeTechnicalSnapshot('TST', 'XLF', FRESH_PRICE);
    chk('TC-7', 'a different sectorEtf refetches the base', env.counters.candles > n);
    chk('TC-7', 'cache entry carries the new benchmark', e._techCache.TST.sectorEtf === 'XLF');
    n = env.counters.candles;
    await e.computeTechnicalSnapshot('TST', 'XLF', FRESH_PRICE);
    chk('TC-7', 'same benchmark inside the window reuses the base', env.counters.candles === n);
    env.clock.t = e.CACHE_TTL_MS + 1;
    await e.computeTechnicalSnapshot('TST', 'XLF', FRESH_PRICE);
    chk('TC-7', 'after CACHE_TTL_MS the base is refetched', env.counters.candles > n);
    const last = env.candles.TST[env.candles.TST.length - 1].close;
    for (const bad of [null, 0, 'x', '190.01', NaN, -3, undefined]) {
      const s = await e.computeTechnicalSnapshot('TST', 'XLF', bad);
      chk('TC-7', 'non-usable price ' + String(bad) + ' -> last-close fallback, refInput null',
        e._techCache.TST.refInput === null && s.pct20 === e.computePctDiff(last, s.sma20));
    }
  });
  await guard('TC-8', async () => {
    const env = mkEnv();
    const e = buildEngine(src, env);
    env.clock.t = 0;
    for (const price of [FRESH_PRICE, OLD_PRICE, null]) {
      const s = await buildEngine(src, mkEnv()).computeTechnicalSnapshot('TST', 'XLK', price);
      const tc = env.candles.TST;
      const p = price || tc[tc.length - 1].close;
      const vm = e.computeVolumeMetrics(tc);
      const ath = e.computeHigh1yDistance(tc, p);
      const sm = n => e.computeSMA(tc, n);
      const expect = {
        sma20: sm(20), sma50: sm(50), sma150: sm(150), sma200: sm(200),
        pct20: e.computePctDiff(p, sm(20)), pct50: e.computePctDiff(p, sm(50)), pct150: e.computePctDiff(p, sm(150)), pct200: e.computePctDiff(p, sm(200)),
        hasMA20: sm(20) !== null, hasMA50: sm(50) !== null, hasMA150: sm(150) !== null, hasMA200: sm(200) !== null,
        volRatio: vm ? vm.ratio : null, hasVolume: vm !== null, high1yDist: ath, hasHigh1y: ath !== null,
        rsSector: e.computeRelativePerf(tc, env.candles.XLK, 63), rsSPY: e.computeRelativePerf(tc, env.candles.SPY, 63), rsQQQ: e.computeRelativePerf(tc, env.candles.QQQ, 63),
        sectorEtf: 'XLK', candleCount: tc.length, spyChangePct: 0.5, qqqChangePct: -0.3
      };
      chk('TC-8', 'key set and order preserved (price ' + price + ')', JSON.stringify(Object.keys(s)) === JSON.stringify(SNAP_KEYS));
      chk('TC-8', 'values equal the base formulas (price ' + price + ')', JSON.stringify(s) === JSON.stringify(expect));
    }
    const noEtf = await buildEngine(src, mkEnv()).computeTechnicalSnapshot('TST', '', FRESH_PRICE);
    chk('TC-8', 'no benchmark -> sectorEtf null, rsSector null', noEtf.sectorEtf === null && noEtf.rsSector === null);
    const bad = await buildEngine(src, mkEnv()).computeTechnicalSnapshot('', 'XLK', FRESH_PRICE);
    chk('TC-8', 'empty symbol -> {}', JSON.stringify(bad) === '{}');
  });

  // ── TC-5 panel ──────────────────────────────────────────────────────────────────────────
  await guard('TC-5', async () => {
    const env = mkEnv();
    const e = buildEngine(src, env);
    env.clock.t = 0;
    await e.computeTechnicalSnapshot('TST', 'XLK', OLD_PRICE);
    chk('TC-5', '_techSnapFor returns {} for a different price', Object.keys(e._techSnapFor('TST', FRESH_PRICE)).length === 0);
    chk('TC-5', '_techSnapFor returns the stored snapshot for the same price',
      e._techSnapFor('TST', OLD_PRICE) === e._techCache.TST.snap && e._techSnapFor('tst', OLD_PRICE) === e._techCache.TST.snap);
    chk('TC-5', '_techSnapFor on an unknown symbol is {}', Object.keys(e._techSnapFor('NOPE', OLD_PRICE)).length === 0);

    const item = { ticker: 'TST', _verifiedPrice: FRESH_PRICE, _verifiedChangePct: 1 };
    e._cockpitResults.push(item);
    e.setActive('TST');
    env.clock.t = 1000;
    let c = env.counters.candles;
    await e.refreshTechPanel('TST', 'XLK', FRESH_PRICE);
    chk('TC-5', 'refresh recomputes at the panel price when the stored refInput differs', e._techCache.TST.refInput === FRESH_PRICE);
    chk('TC-5', 'refresh re-renders the active ticker once', env.renders.length === 1);
    chk('TC-5', 'refresh reused the candle base', env.counters.candles === c);
    await e.refreshTechPanel('TST', 'XLK', FRESH_PRICE);
    chk('TC-5', 'second refresh at the same price/benchmark is a no-op (no render loop)', env.renders.length === 1 && env.counters.candles === c);
    await e.refreshTechPanel('TST', 'xlk', FRESH_PRICE);
    chk('TC-5', 'benchmark case is normalised (no recompute for xlk vs XLK)', env.renders.length === 1);
    await e.refreshTechPanel('TST', 'XLF', FRESH_PRICE);
    chk('TC-5', 'a different benchmark recomputes', env.renders.length === 2 && e._techCache.TST.sectorEtf === 'XLF');

    // no-benchmark case settles too
    await e.refreshTechPanel('TST', '', FRESH_PRICE);
    const r1 = env.renders.length;
    await e.refreshTechPanel('TST', '', FRESH_PRICE);
    chk('TC-5', 'no-benchmark refresh settles (second call no-op)', env.renders.length === r1);

    // ↻ PRE refresh: the panel price is the regular-market price, not item._verifiedPrice
    env.ext.TST = { marketState: 'PRE', regularPrice: 188.5, preMarketPrice: 191 };
    const r2 = env.renders.length;
    await e.refreshTechPanel('TST', 'XLK', FRESH_PRICE); // call site still passes item._verifiedPrice
    chk('TC-5', 'refresh uses _techPanelPrice(item) (PRE regularPrice), not the passed price', e._techCache.TST.refInput === 188.5 && env.renders.length === r2 + 1);
    await e.refreshTechPanel('TST', 'XLK', FRESH_PRICE);
    chk('TC-5', 'PRE-refreshed price settles (second call no-op)', env.renders.length === r2 + 1);
    chk('TC-5', 'panel read at the displayed price matches; at the scan price it does not',
      e._techSnapFor('TST', e._techPanelPrice(item)) === e._techCache.TST.snap && Object.keys(e._techSnapFor('TST', FRESH_PRICE)).length === 0);

    // inactive ticker: recompute but no render
    e.setActive('OTHER');
    env.ext.TST = { marketState: 'POST', regularPrice: 187 };
    const r3 = env.renders.length;
    await e.refreshTechPanel('TST', 'XLK', FRESH_PRICE);
    chk('TC-5', 'inactive ticker is recomputed without a re-render', e._techCache.TST.refInput === 187 && env.renders.length === r3);

    const rm = extractFn(src, 'renderMainPanel') || '';
    chk('TC-5', 'static: renderMainPanel reads the snapshot via _techSnapFor(item.ticker, _techPanelPrice(item))',
      countOf(rm, '_techSnapFor(item.ticker, _techPanelPrice(item))') === 1 && countOf(rm, '_techSnapFor(') === 1);
    chk('TC-5', 'static: renderMainPanel never touches _techCache', rm.length > 0 && rm.indexOf('_techCache') === -1);
    chk('TC-5', 'static: renderMainPanel still calls refreshTechPanel(item.ticker, dispEtf, item._verifiedPrice)',
      countOf(rm, 'refreshTechPanel(item.ticker, dispEtf, item._verifiedPrice);') === 1);
  });

  // ── TC-4 orchestrate ────────────────────────────────────────────────────────────────────
  await guard('TC-4', async () => {
    const env = mkEnv();
    const e = buildEngine(src, env);
    env.clock.t = 0;
    const stale = await e.computeTechnicalSnapshot('TST', 'XLK', OLD_PRICE);
    const staleCopy = JSON.parse(JSON.stringify(stale));
    const fresh = JSON.parse(JSON.stringify(await buildEngine(src, mkEnv()).computeTechnicalSnapshot('TST', 'XLK', FRESH_PRICE)));
    const orchSrc = extractFn(src, 'orchestrate');
    const classSrc = extractFn(src, 'classifyTechnicalSetup');
    const enfSrc = extractFn(src, 'enforceScoreConsistency');
    if (!orchSrc) throw new Error('orchestrate not extractable');
    const body = [
      'const _techCache = { TST: { snap: POISON, computedAt: 0 } };',
      'const _extendedMktCache = {}; const window = {};',
      'function findTicker() { return null; } function formatNewsContext() { return ""; }',
      classSrc, enfSrc, orchSrc, 'return orchestrate;'
    ].join('\n');
    const orchestrate = new Function('POISON', 'console', body)(staleCopy, quietConsole);
    const mk = () => ({ ticker: 'TST', sentiment_score: 90, sentiment: 'positive', summary: '', action: 'buy', news_bias: 'bullish' });
    const stockData = { TST: { price: FRESH_PRICE, change_percent: 1.2, source: 'yahoo' } };
    const out = orchestrate([mk()], {}, stockData, { TST: fresh })[0];
    const freshSetup = e.classifyTechnicalSetup(fresh);
    chk('TC-4', 'fixture sanity: fresh setup is extended_near_ath, stale is below_key_mas',
      freshSetup === 'extended_near_ath' && e.classifyTechnicalSetup(staleCopy) === 'below_key_mas');
    chk('TC-4', 'technical_setup comes from the scan snapshot', out.technical_setup === freshSetup);
    chk('TC-4', 'setup clamp outcome comes from the scan snapshot (62, not 45)', out.sentiment_score === 62 && out.sentiment === 'positive');
    chk('TC-4', 'action gate comes from the scan snapshot (hold_wait, not avoid)', out.action === 'hold_wait');
    const dc = out._auditTrail.dataCollected;
    chk('TC-4', 'audit trail technical fields come from the scan snapshot',
      dc.ma20 === fresh.sma20 && dc.ma50 === fresh.sma50 && dc.ma150 === fresh.sma150 &&
      dc.pctAboveMA20 === fresh.pct20 && dc.pctAboveMA50 === fresh.pct50 && dc.pctAboveMA150 === fresh.pct150 &&
      dc.high1yDist === fresh.high1yDist && dc.rsSPY === fresh.rsSPY && dc.rsQQQ === fresh.rsQQQ &&
      dc.rsSector === fresh.rsSector && dc.volRatio === fresh.volRatio);
    chk('TC-4', 'audit interpretation.technicalSetup matches', out._auditTrail.interpretation.technicalSetup === freshSetup);
    const noSnap = orchestrate([mk()], {}, stockData)[0];
    chk('TC-4', 'without techSnaps orchestrate does NOT fall back to the global cache', noSnap.technical_setup === 'unknown' && noSnap._auditTrail.dataCollected.pctAboveMA20 === null);
    const otherSym = orchestrate([mk()], {}, stockData, { OTHER: fresh })[0];
    chk('TC-4', 'a snapshot for another symbol is not used', otherSym.technical_setup === 'unknown');
    const block = e.buildTechSnapshotBlock('TST', fresh, freshSetup);
    chk('TC-4', 'prompt block carries the fresh pct20 text', block.indexOf('(' + (fresh.pct20 >= 0 ? '+' : '') + fresh.pct20.toFixed(2) + '%)') !== -1);
    const ac = extractFn(src, 'analyzeChunk') || '';
    chk('TC-4', 'static: analyzeChunk passes { [_sym6a]: _techSnap6a } to orchestrate', countOf(ac, 'orchestrate(raw, pplxData, stockData, { [_sym6a]: _techSnap6a })') === 1);
    chk('TC-4', 'static: analyzeChunk builds the prompt block from _techSnap6a', countOf(ac, 'buildTechSnapshotBlock(_sym6a, _techSnap6a, _setupState6a)') === 1);
    chk('TC-4', 'static: _lastRunState.techSnap is _techSnap6a', countOf(ac, 'techSnap: _techSnap6a') === 1);
    chk('TC-4', 'static: orchestrate takes techSnaps and has no _techCache reference',
      /^function orchestrate\(claudeResults, pplxData, stockData, techSnaps\) \{/.test(orchSrc) && orchSrc.indexOf('_techCache') === -1 &&
      countOf(orchSrc, "const _snap6a    = (techSnaps && techSnaps[sym]) ? techSnaps[sym] : {};") === 1);
  });

  // ── TC-6 Deep Dive ──────────────────────────────────────────────────────────────────────
  await guard('TC-6', async () => {
    const env = mkEnv();
    const e = buildEngine(src, env);
    env.clock.t = 0;
    const stale = await e.computeTechnicalSnapshot('TST', 'XLK', OLD_PRICE);
    const names = ['_dd0RunCard', 'buildTechSnapshotBlock', '_techRefInput', '_techSnapFor', '_setupDisplay'];
    const parts = names.map(n => extractFn(src, n));
    if (parts.some(p => !p)) throw new Error('Deep Dive pieces missing');
    const run = async (cacheEntry, price) => {
      const calls = [];
      const body = [
        'const _techCache = SEED; const window = { PT_ENABLE_DEEP_DIVE: true };',
        'const _cockpitResults = [ ITEM ];',
        'const document = { getElementById: function (id) { return id === "dd0-btn-TST" ? BTN : (id === "dd0-panel-TST" ? PANEL : null); } };',
        'async function _dd0FetchAnalysis(item, text) { CALLS.push(text); return { state: "success", text: "x" }; }',
        'function _dd0RenderResultHtml() { return ""; }',
        parts.join('\n'), 'return _dd0RunCard;'
      ].join('\n');
      const seed = { TST: cacheEntry };
      const item = { ticker: 'TST', _verifiedPrice: price, technical_setup: 'extended_near_ath' };
      const before = JSON.stringify(seed);
      const fn = new Function('SEED', 'ITEM', 'BTN', 'PANEL', 'CALLS', 'console', body)(
        seed, item, { disabled: false, textContent: '' }, { style: {}, innerHTML: '' }, calls, quietConsole);
      await fn('TST');
      return { calls, same: JSON.stringify(seed) === before, item };
    };
    const mismatch = await run(e._techCache.TST, FRESH_PRICE);
    chk('TC-6', 'mismatched snapshot -> no technical block sent', mismatch.calls.length === 1 && mismatch.calls[0] === '');
    chk('TC-6', 'mismatch run leaves _techCache untouched', mismatch.same);
    const fresh = await buildEngine(src, mkEnv()).computeTechnicalSnapshot('TST', 'XLK', FRESH_PRICE);
    const entry = { base: {}, computedAt: 0, sectorEtf: 'XLK', snap: fresh, refInput: FRESH_PRICE };
    const match = await run(entry, FRESH_PRICE);
    chk('TC-6', 'matching snapshot -> block equals buildTechSnapshotBlock of it',
      match.calls[0] === e.buildTechSnapshotBlock('TST', fresh, 'extended_near_ath') && match.calls[0] !== '');
    chk('TC-6', 'matching run leaves _techCache untouched', match.same);
    chk('TC-6', 'static: _dd0RunCard reads the snapshot via _techSnapFor(sym, item._verifiedPrice) and not .snap',
      countOf(extractFn(src, '_dd0RunCard') || '', '_techSnapFor(sym, item._verifiedPrice)') === 1 && (extractFn(src, '_dd0RunCard') || '').indexOf('_techCache') === -1);
  });

  // ── TC-9 isolation (static) ─────────────────────────────────────────────────────────────
  await guard('TC-9', async () => {
    const a = techCacheAudit(src);
    chk('TC-9', '_techCache only in declaration, I2-I4 helpers, edit-flow delete, self-test line: ' + JSON.stringify(a.bad),
      a.bad.length === 0 && a.decl === 1 && a.del === 1 && a.selftest === 1);
    const newFns = ['_techRefInput', '_techPanelPrice', '_techSnapFor', '_techFetchBase', '_techDeriveSnap', 'computeTechnicalSnapshot', 'refreshTechPanel'];
    const newSrc = newFns.map(n => extractFn(src, n) || '').join('\n') + '\n' + I7_INSERT.join('\n');
    chk('TC-9', 'all new helpers exist', newFns.every(n => !!extractFn(src, n)));
    chk('TC-9', 'no localStorage / sessionStorage / indexedDB / pt_ in new code', !/localStorage|sessionStorage|indexedDB|\bpt_/.test(newSrc));
    for (const n of ['classifyTechnicalSetup', 'buildTechSnapshotBlock', 'computeSMA', 'computePctDiff', 'computeRelativePerf', 'computeVolumeMetrics', 'computeHigh1yDistance', 'enforceScoreConsistency']) {
      const s = extractFn(src, n);
      chk('TC-9', n + ' byte-equal to the base', !!s && sha256(s) === BASE_PINS[n]);
    }
    chk('TC-9', 'cache declaration comment documents base/snap/refInput',
      src.indexOf('// key: ticker symbol → { base, computedAt, sectorEtf, snap, refInput }') !== -1);
    chk('TC-9', 'edit-flow invalidation untouched', countOf(src, 'delete _techCache[_editSym];') === 1);
  });

  // ── TC-10 only main-panel change ────────────────────────────────────────────────────────
  const rm = extractFn(src, 'renderMainPanel') || '';
  await guard('TC-10', async () => {
    const reverted = revertI7(revertA9(revertR2(rm)));
    chk('TC-10', 'reverting R-2, A9 and I7a-I7i restores the base (LF-normalised pin)', sha256(reverted) === BASE_RM_LF);
    chk('TC-10', 'reverting R-2, A9 and I7a-I7i restores the OLD caliper pin d11b09a9', sha256(crlf(reverted)) === OLD_RM_CALIPER_PIN);
    const forward = applyR2(applyA9(applyI7(reverted)));
    chk('TC-10', 'line diff is exactly I7a-I7c added, I7d-I7i and A9 replaced, and the R-2 line replaced by four', forward === rm);
    chk('TC-10', 'line count = base + 3 (I7) + 3 (R-2)', rm.split('\n').length === reverted.split('\n').length + 6);
    chk('TC-10', 'task renderMainPanel hashes to the new LF pin', sha256(rm) === NEW_RM_LF);
    chk('TC-10', 'task renderMainPanel hashes to the new caliper (CRLF) pin', sha256(crlf(rm)) === NEW_RM_CALIPER_PIN);
  });

  // ── TC-11 caliper ───────────────────────────────────────────────────────────────────────
  await guard('TC-11', async () => {
    const cal = S.caliper;
    const pinOf = n => { const m = new RegExp('\\b' + n + ": '([0-9a-f]{64})'").exec(cal); return m ? m[1] : null; };
    chk('TC-11', 'caliper renderMainPanel pin = new CRLF-form hash of the task function', pinOf('renderMainPanel') === sha256(crlf(rm)) && pinOf('renderMainPanel') === NEW_RM_CALIPER_PIN);
    chk('TC-11', 'old caliper pin is gone', cal.indexOf(OLD_RM_CALIPER_PIN) === -1);
    for (const n of Object.keys(BASE_CALIPER_PINS)) chk('TC-11', 'caliper pin ' + n + ' equals the base', pinOf(n) === BASE_CALIPER_PINS[n]);
    chk('TC-11', 'caliper protected CSS hash equals the base', cal.indexOf("'" + BASE_CALIPER_CSS_HASH + "'") !== -1);
    chk('TC-11', 'protected CSS block in index.html still matches the base hash', (() => {
      const a = ".sr-score{font-weight:700;font-size:12px;color:var(--text);display:flex;flex-direction:column;align-items:flex-end;gap:3px}";
      const z = '.sr-score-fill.neg{background:var(--red2)}';
      const i = src.indexOf(a); const j = i === -1 ? -1 : src.indexOf(z, i);
      return i !== -1 && j !== -1 && sha256(crlf(src.slice(i, j + z.length))) === BASE_CALIPER_CSS_HASH;
    })());
  });

  // ── TC-13 Tech Score untouched ──────────────────────────────────────────────────────────
  await guard('TC-13', async () => {
    chk('TC-13', 'TS1 region byte-equal to the base', sha256(ts1Region(src) || '') === BASE_TS1_REGION);
    for (const n of ['_ts1FillRow', '_initTsCard', 'runTechScoreV1', '_ts1RowText']) {
      const s = extractFn(src, n);
      chk('TC-13', n + ' byte-equal to the base', !!s && sha256(s) === BASE_PINS[n]);
    }
    const newSrc = ['_techRefInput', '_techPanelPrice', '_techSnapFor', '_techFetchBase', '_techDeriveSnap', 'computeTechnicalSnapshot', 'refreshTechPanel']
      .map(n => extractFn(src, n) || '').join('\n') + '\n' + I7_INSERT.join('\n') + '\n' + I7_REPLACE.map(r => r.newS).join('\n');
    chk('TC-13', 'new code references no _ts1*, runTechScoreV1 or _techScoreDebug', !/_ts1|runTechScoreV1|_techScoreDebug/.test(newSrc));
    const ts1 = S.ts1;
    const pinOf = n => { const m = new RegExp('\\b' + n + ": '([0-9a-f]{64})'").exec(ts1); return m ? m[1] : null; };
    chk('TC-13', 'TS1 suite TX-3 renderMainPanel pin = LF-normalised hash of the task function', pinOf('renderMainPanel') === sha256(rm) && pinOf('renderMainPanel') === NEW_RM_LF);
    for (const n of Object.keys(BASE_TS1_TX3)) chk('TC-13', 'TS1 suite TX-3 pin ' + n + ' unchanged', pinOf(n) === BASE_TS1_TX3[n]);
    chk('TC-13', 'TS1 suite keeps its TX-3 negative case', ts1.indexOf("label: 'renderMainPanel byte changed'") !== -1);
    chk('TC-13', 'static: the literal rr-lbl "Score" occurs exactly once in renderMainPanel', countOf(rm, '<span class="rr-lbl">Score</span>') === 1);
  });

  // ── TC-12 / TC-14 / TC-15 render harness ────────────────────────────────────────────────
  await guard('TC-12', async () => {
    const e = buildEngine(src, mkEnv());
    // (a) _techPanelPrice state table == the headline price rule
    const headline = (item, ext) => {
      const has = typeof item._verifiedPrice === 'number' && item._verifiedPrice > 0 && typeof item._verifiedChangePct === 'number';
      const x = has ? (ext || null) : null;
      const ms = x ? x.marketState : null;
      if ((ms === 'PRE' || ms === 'POST') && typeof x.regularPrice === 'number') return x.regularPrice;
      return item._verifiedPrice;
    };
    const base = { ticker: 'TST', _verifiedPrice: FRESH_PRICE, _verifiedChangePct: 1 };
    const table = [
      ['no extended cache', base, undefined], ['REGULAR', base, { marketState: 'REGULAR', regularPrice: 150 }],
      ['CLOSED', base, { marketState: 'CLOSED', regularPrice: 150 }], ['PRE with regularPrice', base, { marketState: 'PRE', regularPrice: 188.5 }],
      ['POST with regularPrice', base, { marketState: 'POST', regularPrice: 187.25 }], ['PRE without regularPrice', base, { marketState: 'PRE', preMarketPrice: 191 }],
      ['no verified data', { ticker: 'TST' }, { marketState: 'PRE', regularPrice: 188.5 }]
    ];
    for (const [label, item, ext] of table) {
      const env2 = mkEnv(); const e2 = buildEngine(src, env2);
      if (ext) env2.ext.TST = ext;
      chk('TC-12', '_techPanelPrice == headline rule: ' + label, e2._techPanelPrice(item) === headline(item, ext));
    }
    // (b) the headline price lines are byte-equal to the base
    chk('TC-12', 'static: "let price = ..." line byte-equal to the base', countOf(rm, BASE_PRICE_LINE) === 1);
    chk('TC-12', 'static: "_showExt && _extC" override block byte-equal to the base', countOf(rm, BASE_EXT_OVERRIDE) === 1);
    chk('TC-12', 'static: _extendedMktCache read for the headline unchanged', countOf(rm, "const _extC      = hasData ? (_extendedMktCache[item.ticker] || null) : null;") === 1);

    // (c) render harness
    const render = buildRenderer(rm, src);
    const fresh = await (async () => { const en = mkEnv(); const x = buildEngine(src, en); return JSON.parse(JSON.stringify(await x.computeTechnicalSnapshot('TST', 'XLK', FRESH_PRICE))); })();
    const pre = await (async () => { const en = mkEnv(); const x = buildEngine(src, en); return JSON.parse(JSON.stringify(await x.computeTechnicalSnapshot('TST', 'XLK', 188.5))); })();
    const old = await (async () => { const en = mkEnv(); const x = buildEngine(src, en); return JSON.parse(JSON.stringify(await x.computeTechnicalSnapshot('TST', 'XLK', OLD_PRICE))); })();
    const short = await (async () => { const en = mkEnv('short'); const x = buildEngine(src, en); return JSON.parse(JSON.stringify(await x.computeTechnicalSnapshot('TST', 'XLK', FRESH_PRICE))); })();
    const entryOf = (snap, ref) => ({ TST: { base: {}, computedAt: 0, sectorEtf: 'XLK', snap, refInput: ref } });
    const mkItem = over => Object.assign({ ticker: 'TST', sentiment_score: 70, sentiment: 'positive', summary: 'Rating: Buy', action: 'buy',
      technical_setup: 'below_key_mas', _verifiedPrice: FRESH_PRICE, _verifiedChangePct: 1.2 }, over || {});
    const states = [
      { id: 'matching', item: mkItem(), cache: entryOf(fresh, FRESH_PRICE), ext: {}, S: fresh, differs: false },
      { id: 'REGULAR', item: mkItem(), cache: entryOf(fresh, FRESH_PRICE), ext: { TST: { marketState: 'REGULAR', regularPrice: 150 } }, S: fresh, differs: false },
      { id: 'CLOSED', item: mkItem(), cache: entryOf(fresh, FRESH_PRICE), ext: { TST: { marketState: 'CLOSED', regularPrice: 150 } }, S: fresh, differs: false },
      { id: 'PRE refreshed', item: mkItem(), cache: entryOf(pre, 188.5), ext: { TST: { marketState: 'PRE', regularPrice: 188.5, preMarketPrice: 191, regularChangePct: 0.4 } }, S: pre, differs: true },
      { id: 'POST refreshed', item: mkItem(), cache: entryOf(pre, 188.5), ext: { TST: { marketState: 'POST', regularPrice: 188.5, postMarketPrice: 189 } }, S: pre, differs: true },
      { id: 'POST equal price', item: mkItem(), cache: entryOf(fresh, FRESH_PRICE), ext: { TST: { marketState: 'POST', regularPrice: FRESH_PRICE, postMarketPrice: 189 } }, S: fresh, differs: false },
      { id: 'PRE without regularPrice', item: mkItem(), cache: entryOf(fresh, FRESH_PRICE), ext: { TST: { marketState: 'PRE', preMarketPrice: 191 } }, S: fresh, differs: false },
      { id: 'race (snapshot for another price)', item: mkItem(), cache: entryOf(old, OLD_PRICE), ext: {}, S: null, differs: false },
      { id: 'race under PRE refresh', item: mkItem(), cache: entryOf(fresh, FRESH_PRICE), ext: { TST: { marketState: 'PRE', regularPrice: 188.5, preMarketPrice: null } }, S: null, differs: true },
      { id: 'stale stored result', item: mkItem({ technical_setup: 'below_key_mas' }), cache: entryOf(fresh, FRESH_PRICE), ext: {}, S: fresh, differs: false },
      { id: 'insufficient candles', item: mkItem(), cache: entryOf(short, FRESH_PRICE), ext: {}, S: short, differs: false },
      { id: 'no snapshot cached', item: mkItem(), cache: {}, ext: {}, S: null, differs: false },
      { id: 'no verified price', item: mkItem({ _verifiedPrice: undefined, _verifiedChangePct: undefined }), cache: entryOf(fresh, FRESH_PRICE), ext: {}, S: 'nodata', differs: false }
    ];
    // Production (orchestrate / _refreshPriceRow) always writes the four extended-hours fields, null when absent.
    const withNulls = x => Object.assign({ preMarketPrice: null, preMarketChangePercent: null, postMarketPrice: null, postMarketChangePercent: null }, x);
    for (const st of states) if (st.ext.TST) st.ext.TST = withNulls(st.ext.TST);
    const rmFn = extractFn(src, 'renderMainPanel');
    const tfSrc = /const _tfMap=(\{[^\n]*\});/.exec(rmFn);
    const asSrc = /const _tsAssessMap = (\{[\s\S]*?\n  \});/.exec(rmFn);
    if (!tfSrc || !asSrc) throw new Error('maps not extractable');
    const tfMap = new Function('return ' + tfSrc[1])();
    const assessMap = new Function('return ' + asSrc[1])();
    // Independent expectation for the action-block dial of mkItem() (score 70, "Rating: Buy" -> pos / green).
    const dialParts = new Function([extractFn(src, '_ptScoreNorm'), extractFn(src, '_ptScoreText'), extractFn(src, '_ptScoreDial'),
      'return { d: _ptScoreDial(70, "var(--green2)"), t: _ptScoreText(70) };'].join('\n'))();
    const expectedDial = '<div class="at-dial-row"><div class="' + dialParts.d.cls + '" style="' + dialParts.d.style + '"><span class="at-dial-num" style="color:' +
      dialParts.d.numColor + '">' + dialParts.t + '</span></div><div><div class="at-dial-lbl">Score</div><div class="at-dial-val pos">Buy</div></div></div>';
    const baseRm = (() => { try { return revertI7(revertR2(rm)); } catch (e1) { return null; } })();
    const renderBase = baseRm ? buildRenderer(baseRm, src) : null;
    for (const st of states) {
      const ext = JSON.parse(JSON.stringify(st.ext));
      let html;
      try { html = render(st.item, JSON.parse(JSON.stringify(st.cache)), ext); }
      catch (err) { throw new Error('render state "' + st.id + '": ' + err.message); }
      const p = parseHtml(html);
      const hasData = st.S !== 'nodata';
      const displayed = hasData ? headline(st.item, ext.TST) : null;
      // TC-12c
      if (hasData) chk('TC-12', st.id + ': ph-price shows the displayed price', p.price === '$' + displayed.toFixed(2));
      if (st.S && st.S !== 'nodata' && st.S.hasMA20) {
        chk('TC-12', st.id + ': MA20 distance is from the displayed price', p.ma20 === fmtPct((displayed - st.S.sma20) / st.S.sma20 * 100));
      } else {
        chk('TC-12', st.id + ': no snapshot for the displayed price -> no distance shown', p.ma20 === null || p.ma20 === '—' || p.ma20 === 'Insufficient history');
      }
      // TC-14
      let expPhase = null; let expAssess = null;
      if (hasData && st.S) {
        const real = e.classifyTechnicalSetup(st.S);
        expPhase = real === 'unknown' ? '—' : (tfMap[real] || ['NEUTRAL'])[0];
        expAssess = r2Assess(assessMap, real, st.S); // R-2: the stack is claimed only when the snapshot's averages are stacked
      }
      chk('TC-14', st.id + ': Timeframe Alignment from the displayed snapshot', p.phase === expPhase);
      chk('TC-14', st.id + ': assessment line from the displayed snapshot', (p.assess || null) === expAssess);
      if (st.id === 'stale stored result') {
        chk('TC-14', st.id + ': never derived from item.technical_setup (below_key_mas -> BEARISH)', p.phase !== 'BEARISH' && p.phase !== null);
        chk('TC-14', st.id + ': assessment is not the stale one', p.assess !== assessMap.below_key_mas);
      }
      // TC-15
      const stateRender = renderBase ? parseHtml(renderBase(st.item, JSON.parse(JSON.stringify(st.cache)), JSON.parse(JSON.stringify(st.ext)))) : null;
      if (!stateRender) { chk('TC-15', st.id + ': base variant buildable', false); continue; }
      const anyMark = /from scan|Scan setup/.test(html);
      chk('TC-15', st.id + ': dial markup (class, style, number, colour, rating) equals the real _ptScoreDial / _ptScoreText output',
        !!p.dial && p.dial.replace(FROM_SCAN_SPAN_RE, '') === expectedDial);
      if (!hasData) {
        chk('TC-15', st.id + ': no verified price -> no scan-time marks anywhere', !anyMark);
      } else if (st.differs) {
        chk('TC-15', st.id + ': action label is "Scan setup", never bare "Setup"', !!p.setupRow && p.setupRow.indexOf('>Scan setup<') !== -1 && p.setupRow.indexOf('>Setup<') === -1);
        chk('TC-15', st.id + ': Setup value unchanged', !!p.setupRow && !!stateRender.setupRow && p.setupRow.replace('Scan setup', 'Setup') === stateRender.setupRow);
        if (st.S) {
          chk('TC-15', st.id + ': Score row shows "NN / 100" then "from scan"', !!p.scoreRow && /70 \/ 100<span style="[^"]*">from scan<\/span><\/span><\/div>$/.test(p.scoreRow) && countOf(p.scoreRow, 'from scan') === 1);
          chk('TC-15', st.id + ': Score row otherwise equals the base render', !!p.scoreRow && p.scoreRow.replace(FROM_SCAN_SPAN_RE, '') === stateRender.scoreRow);
        }
        chk('TC-15', st.id + ': dial label reads "Score" then the from-scan indicator', !!p.dial && /<div class="at-dial-lbl">Score<span style="[^"]*">from scan<\/span><\/div>/.test(p.dial) && countOf(p.dial, 'from scan') === 1);
        chk('TC-15', st.id + ': dial class/style/number/colour/rating equal the base render', !!p.dial && p.dial.replace(FROM_SCAN_SPAN_RE, '') === stateRender.dial);
      } else {
        chk('TC-15', st.id + ': equal prices -> Setup row byte-equal to the base', p.setupRow === stateRender.setupRow && !!p.setupRow);
        if (st.S) chk('TC-15', st.id + ': equal prices -> Score row byte-equal to the base', p.scoreRow === stateRender.scoreRow && !!p.scoreRow);
        chk('TC-15', st.id + ': equal prices -> dial byte-equal to the base', p.dial === stateRender.dial && !!p.dial);
        chk('TC-15', st.id + ': equal prices -> no scan-time marks anywhere', !anyMark);
      }
    }
    // score values identical in differ vs equal cases for the same item
    const eqP = parseHtml(render(mkItem(), JSON.parse(JSON.stringify(entryOf(fresh, FRESH_PRICE))), {}));
    const dfP = parseHtml(render(mkItem(), JSON.parse(JSON.stringify(entryOf(pre, 188.5))), { TST: withNulls({ marketState: 'PRE', regularPrice: 188.5 }) }));
    const num = h => /at-dial-num"[^>]*>([^<]*)</.exec(h || '');
    const fill = h => /style="(background:conic-gradient[^"]*)"/.exec(h || '');
    chk('TC-15', 'dial number identical in the differ and equal cases', !!num(eqP.dial) && !!num(dfP.dial) && num(eqP.dial)[1] === num(dfP.dial)[1]);
    chk('TC-15', 'dial fill identical in the differ and equal cases', !!fill(eqP.dial) && !!fill(dfP.dial) && fill(eqP.dial)[1] === fill(dfP.dial)[1]);
    chk('TC-15', 'Score text identical in the differ and equal cases', !!eqP.scoreRow && !!dfP.scoreRow && /70 \/ 100/.test(eqP.scoreRow) && /70 \/ 100/.test(dfP.scoreRow));
  });

  return R;
}

// ── Planted negatives: the mutation lands on production source / pin files ──────────────────
function mut(text, from, to) {
  const n = countOf(text, from);
  if (n !== 1) throw new Error('mutation anchor found ' + n + ' times: ' + from.slice(0, 60));
  return text.replace(from, () => to);
}
const SNAP_LINE = 'const snap       = _techDeriveSnap(base, refInput);';
const NEGATIVES = [
  { id: 'TC-1', label: 'cache hit ignores price', target: 'index',
    f: s => mut(s, SNAP_LINE, 'const snap = (reuse && cached.snap) ? cached.snap : _techDeriveSnap(base, refInput);') },
  { id: 'TC-3', label: 'distances computed from a stale price', target: 'index',
    f: s => mut(s, SNAP_LINE, 'const snap = _techDeriveSnap(base, cached && cached.refInput || refInput);') },
  { id: 'TC-7', label: 'base reused across benchmarks', target: 'index',
    f: s => mut(s, 'cached.sectorEtf === etf && ', '') },
  { id: 'TC-7', label: 'base never expires', target: 'index',
    f: s => mut(s, ' && (Date.now() - cached.computedAt) < CACHE_TTL_MS;', ';') },
  { id: 'TC-7', label: 'string price accepted as a reference price', target: 'index',
    f: s => mut(s, "return (typeof p === 'number' && isFinite(p) && p > 0) ? p : null;", 'return p || null;') },
  { id: 'TC-8', label: 'snapshot key order changed', target: 'index',
    f: s => mut(s, '      sma20, sma50, sma150, sma200,\n      pct20, pct50, pct150, pct200,', '      sma50, sma20, sma150, sma200,\n      pct20, pct50, pct150, pct200,') },
  { id: 'TC-4', label: 'orchestrate reads the global cache', target: 'index',
    f: s => mut(s, "const _snap6a    = (techSnaps && techSnaps[sym]) ? techSnaps[sym] : {};", "const _snap6a    = (_techCache[sym] && _techCache[sym].snap) ? _techCache[sym].snap : {};") },
  { id: 'TC-4', label: 'analyzeChunk does not pass the scan snapshot', target: 'index',
    f: s => mut(s, 'orchestrate(raw, pplxData, stockData, { [_sym6a]: _techSnap6a })', 'orchestrate(raw, pplxData, stockData)') },
  { id: 'TC-5', label: 'panel reads .snap directly', target: 'index',
    f: s => mut(s, 'const snap  = _panelSnap;', 'const snap  = (_techCache[item.ticker] && _techCache[item.ticker].snap) || {};') },
  { id: 'TC-5', label: 'refresh early-returns on freshness only', target: 'index',
    f: s => mut(s, 'cached.refInput === _techRefInput(ref) &&', 'true &&') },
  { id: 'TC-5', label: 'panel keyed to item._verifiedPrice while the header shows a refreshed price', target: 'index',
    f: s => mut(s, '_techSnapFor(item.ticker, _techPanelPrice(item)); // Entry 32', '_techSnapFor(item.ticker, item._verifiedPrice); // Entry 32') },
  { id: 'TC-12', label: 'panel keyed to item._verifiedPrice while the header shows a refreshed price', target: 'index',
    f: s => mut(s, '_techSnapFor(item.ticker, _techPanelPrice(item)); // Entry 32', '_techSnapFor(item.ticker, item._verifiedPrice); // Entry 32') },
  { id: 'TC-12', label: '_techPanelPrice ignores PRE/POST', target: 'index',
    f: s => mut(s, "((ms === 'PRE' || ms === 'POST') && typeof e.regularPrice === 'number')", "(false && typeof e.regularPrice === 'number')") },
  { id: 'TC-6', label: 'Deep Dive reads .snap directly', target: 'index',
    f: s => mut(s, 'const snap = _techSnapFor(sym, item._verifiedPrice);', 'const snap = (_techCache[sym] && _techCache[sym].snap) || {};') },
  { id: 'TC-10', label: 'a second renderMainPanel line changed', target: 'index',
    f: s => mut(s, "const hasCrit = (item.alerts||[]).some(a=>a.type==='critical');", "const hasCrit = (item.alerts||[]).some(a=>a.type==='warn');") },
  { id: 'TC-14', label: 'Setup taken from item.technical_setup', target: 'index',
    f: s => mut(s, "const [phase,phCls]=_panelSetup==='unknown'?['—','neutral-v']:(_tfMap[_panelSetup]||['NEUTRAL','neutral-v']);", "const [phase,phCls]=_tfMap[item.technical_setup]||['NEUTRAL','neutral-v'];") },
  { id: 'TC-14', label: 'assessment taken from item.technical_setup', target: 'index',
    f: s => mut(s, R2_NEW[3], "  const _tsAssess = hasData && item.technical_setup ? (_tsAssessMap[item.technical_setup] || '') : '';") },
  { id: 'TC-14', label: 'Setup classified from a second, different snapshot (the scan-price one)', target: 'index',
    f: s => mut(s, "const _panelSetup = hasData ? classifyTechnicalSetup(_panelSnap) : 'unknown';", "const _panelSetup = hasData ? classifyTechnicalSetup(_techSnapFor(item.ticker, item._verifiedPrice)) : 'unknown';") },
  { id: 'TC-15', label: 'Score row mark missing', target: 'index',
    f: s => mut(s, "${_fromScan ? '<span style=\"color:var(--text3);font-size:10px;margin-left:6px\">from scan</span>' : ''}", '') },
  { id: 'TC-15', label: 'action label never "Scan setup"', target: 'index',
    f: s => mut(s, "${_fromScan ? 'Scan setup' : 'Setup'}", 'Setup') },
  { id: 'TC-15', label: 'dial indicator missing', target: 'index',
    f: s => mut(s, "${_fromScan ? '<span style=\"margin-left:6px;text-transform:none;font-weight:400\">from scan</span>' : ''}", '') },
  { id: 'TC-15', label: 'indicator shown when the prices are equal', target: 'index',
    f: s => mut(s, "const _fromScan   = hasData && _techPanelPrice(item) !== item._verifiedPrice;", "const _fromScan   = hasData;") },
  { id: 'TC-15', label: 'dial number altered', target: 'index',
    f: s => mut(s, '<span class="at-dial-num" style="color:${_dial.numColor}">${_ptScoreText(score)}</span>', '<span class="at-dial-num" style="color:${_dial.numColor}">${_ptScoreText(score)}!</span>') },
  { id: 'TC-15', label: 'dial rating altered', target: 'index',
    f: s => mut(s, '<div class="at-dial-val ${rCls}">${rating}</div>', '<div class="at-dial-val ${rCls}">${rating.toUpperCase()}</div>') },
  { id: 'TC-15', label: 'Score label literal replaced', target: 'index',
    f: s => mut(s, '<span class="rr-lbl">Score</span>', '<span class="rr-lbl">Scan score</span>') },
  { id: 'TC-11', label: 'another caliper pin changed', target: 'caliper',
    f: s => mut(s, "_ptScoreDial: '4092f243", "_ptScoreDial: '5092f243") },
  { id: 'TC-11', label: 'caliper still holds the old renderMainPanel pin', target: 'caliper',
    f: s => s.replace(/(renderMainPanel: ')[0-9a-f]{64}'/, "$1" + OLD_RM_CALIPER_PIN + "'") },
  { id: 'TC-13', label: 'a TS1 byte changed', target: 'index',
    f: s => mut(s, 'function _initTsCard() {', 'function _initTsCard() { /* x */') },
  { id: 'TC-13', label: 'TS1 suite: another TX-3 pin changed', target: 'ts1',
    f: s => mut(s, "_ts1RowText: '6df1e835", "_ts1RowText: '7df1e835") },
  { id: 'TC-13', label: 'TS1 suite: renderMainPanel pin left at the base', target: 'ts1',
    f: s => s.replace(/(renderMainPanel: ')[0-9a-f]{64}'/, "$1" + BASE_RM_LF + "'") },
  { id: 'TC-9', label: 'localStorage in a new helper', target: 'index',
    f: s => mut(s, 'function _techRefInput(p) {', "function _techRefInput(p) { localStorage.getItem('pt_x');") },
  { id: 'TC-9', label: 'classification threshold changed', target: 'index',
    f: s => mut(s, 'high1yDist > -5 && pct20 > 10', 'high1yDist > -5 && pct20 > 11') },
  { id: 'TC-9', label: '_techCache used outside the allowed helpers', target: 'index',
    f: s => mut(s, 'function _dd0RenderResultHtml(result) {', 'function _dd0RenderResultHtml(result) { void _techCache;') }
];

// ── Main ─────────────────────────────────────────────────────────────────────────────────────
(async () => {
  let failures = 0;
  let asserts = 0;
  const check = (name, cond) => { asserts += 1; if (!cond) { failures += 1; console.log('  FAIL  ' + name); } };

  const index = norm(fs.readFileSync(INDEX_PATH, 'utf8'));
  const caliper = fs.readFileSync(CALIPER_PATH, 'utf8');
  const ts1 = fs.readFileSync(TS1_PATH, 'utf8');
  const sources = { index, caliper, ts1 };

  const real = await evaluate(sources);
  const ids = Object.keys(real).sort();
  for (const id of ids) for (const c of real[id]) check(id + ' ' + c.name, c.ok);
  const expectedGroups = ['TC-1', 'TC-2', 'TC-3', 'TC-4', 'TC-5', 'TC-6', 'TC-7', 'TC-8', 'TC-9', 'TC-10', 'TC-11', 'TC-12', 'TC-13', 'TC-14', 'TC-15'];
  for (const g of expectedGroups) check(g + ' group ran', Array.isArray(real[g]) && real[g].length > 0);

  // Negatives only mean something when the real run is clean; otherwise report them as unproven.
  const realClean = failures === 0;
  for (const n of NEGATIVES) {
    let mutated = null;
    try { const m = Object.assign({}, sources); m[n.target] = n.f(sources[n.target]); mutated = m; } catch (e) { mutated = null; }
    check('negative anchor resolves: ' + n.id + ' / ' + n.label, mutated !== null);
    if (mutated === null || !realClean) continue;
    const res = await evaluate(mutated);
    const group = res[n.id] || [];
    check('negative: ' + n.id + ' rejects "' + n.label + '"', group.some(c => !c.ok));
  }

  console.log(failures === 0
    ? 'TECH SNAPSHOT CACHE OFFLINE: PASS (' + asserts + ' asserts)'
    : 'TECH SNAPSHOT CACHE OFFLINE: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.log('TECH SNAPSHOT CACHE OFFLINE: FAIL (harness error: ' + (e && e.stack || e) + ')'); process.exit(1); });
