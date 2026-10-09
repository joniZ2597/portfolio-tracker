'use strict';

/*
 * r1a-high1y-relabel (R-1 Slice A) - offline QA for the "1Y High" relabel.
 *
 * Pure Node, no network, no browser, no storage. Extracts the REAL functions from index.html
 * (brace matching, as in qa/deep_dive_v0_offline.js) and runs them verbatim in sandboxes.
 *
 * HL-1 classification identical to the baseline   HL-2 snapshot keys + value   HL-3 no ATH wording for the 1Y metric
 * HL-4 _setupDisplay                              HL-5 rendered UI            HL-6 Deep Dive content
 * HL-7 audit trail key                            HL-8 static isolation (two pin layers)
 *
 * Baseline = 57afd9d. Pins / literals below were captured from that index.html (LF-normalised).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');

let failures = 0;
let asserts = 0;
function check(name, cond, detail) {
  asserts += 1;
  if (!cond) {
    failures += 1;
    console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : ''));
  }
}
const guard = (id, fn) => {
  try { fn(); } catch (e) { check(id + ' group did not throw', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); }
};
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const lf = s => s.replace(/\r\n/g, '\n');
const quiet = { log() {}, warn() {}, error() {} };
const asyncWork = [];

// Same extraction rule as the other suites: from "function NAME(" (with a preceding "async ") to the matching brace.
function extractFn(content, name) {
  const sig = 'function ' + name + '(';
  const start = content.indexOf(sig);
  if (start === -1) return null;
  const ASYNC = 'async ';
  const realStart = (start >= ASYNC.length && content.slice(start - ASYNC.length, start) === ASYNC) ? start - ASYNC.length : start;
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
  // Unbalanced braces inside prompt text (fetchAnthropicAnalysis): a top-level function ends at its column-0 closing brace.
  const closeAt = content.indexOf('\n}\n', start);
  return closeAt === -1 ? null : content.slice(realStart, closeAt + 2);
}

const content = lf(fs.readFileSync(INDEX_PATH, 'utf8'));
const fnSrc = n => extractFn(content, n);

// ---- Baseline literals / pins (captured at Step 0 from the 57afd9d index.html) ----
const BASE_CLASSIFY_SRC = "function classifyTechnicalSetup(snap) {\n  const { pct20, pct50, pct150, athDist } = snap || {};\n  // Require at least pct20 + pct50 for any non-unknown classification\n  if (pct20 == null || pct50 == null) return 'unknown';\n  // extended_near_ath: price >10% above MA20 AND within 5% of 1Y high\n  if (athDist != null && athDist > -5 && pct20 > 10)\n    return 'extended_near_ath';\n  // healthy_uptrend_near_ath: above MA20+MA50, within 8% of ATH\n  if (athDist != null && athDist > -8 && pct20 > 2 && pct50 > 0)\n    return 'healthy_uptrend_near_ath';\n  // healthy_uptrend: above all three key MAs\n  if (pct150 != null && pct20 > 0 && pct50 > 0 && pct150 > 0)\n    return 'healthy_uptrend';\n  // support_test: below MA20, MA50 within ±3% (testing support), above MA150\n  // More specific than pullback_in_uptrend — must be evaluated first\n  if (pct150 != null && pct20 < 0 && pct50 >= -3 && pct50 <= 2 && pct150 > 0)\n    return 'support_test';\n  // pullback_in_uptrend: below MA20 but clearly above MA50 and MA150\n  if (pct150 != null && pct20 < 0 && pct50 > 0 && pct150 > 0)\n    return 'pullback_in_uptrend';\n  // breakdown_risk: below MA50 by >3% but MA150 still nearby\n  if (pct150 != null && pct50 < -3 && pct150 >= -5 && pct150 <= 2)\n    return 'breakdown_risk';\n  // below_key_mas: below MA20, MA50, and MA150 all\n  if (pct150 != null && pct20 < 0 && pct50 < 0 && pct150 < 0)\n    return 'below_key_mas';\n  return 'unknown';\n}";
const PINS = {
  "layer1": "f800c5a374f3b835eaa8fa2719cf3d159d571aea3d170d2f6c9a06b7ff2eaaa6",
  "layer2": {
    "computeATHDistance|computeHigh1yDistance": "39b8ce7ec6d2f8e2fad10b050b16f87ab79119867e6f53d7e412f164b865a451",
    "classifyTechnicalSetup": "579f5bfea08fe9b499c8d59016f22116cdf4ac12cafdaa1e0caa3928417e044e",
    "buildTechSnapshotBlock": "3bd4b2787884469349ff5ae8e1a50d3defd7c62b46a67ab6698dd053ac943539",
    "_techDeriveSnap": "39b93ac18718355e9768bdb6dc76e68b5fc25c1de446b730fcc03e273e4181f4",
    "fetchAnthropicAnalysis": "fad40ac1ea98d95d05c5efbe288b98732a6ddaa02da8b6eb15b33ade1754db29",
    "orchestrate": "d772badfdfa6c434c59b8fdce68d635544bf7ac173cc0460e4518267be238f67",
    "_srGroupResults": "657105a2f62abddaa85053fa7ba78e49c7fe1187439bfe2caf1ef7875ba4a4b2",
    "renderMainPanel": "a3b3c7427aa045a3a22c34dcdcace190cb864fa462ed8ba9f1a6a3d87127354d",
    "_dd0FetchAnalysis": "50b6d52bc1ec645afc239432878b816529cebf592a0a60fae8440581c03f6c38"
  }
};

// ---- HL-8 helpers: layer 1 (masked file) and layer 2 (per-function, brief-mandated tokens masked) ----
const NAMED_FNS = ['computeATHDistance|computeHigh1yDistance', 'classifyTechnicalSetup', 'buildTechSnapshotBlock', '_techDeriveSnap',
  'fetchAnthropicAnalysis', 'orchestrate', '_srGroupResults', 'renderMainPanel', '_dd0FetchAnalysis'];

function regionOf(src, alts) {
  for (const n of alts.split('|')) {
    const s = extractFn(src, n);
    if (!s) continue;
    let start = src.indexOf(s);
    const end = start + s.length;
    // the doc comment directly above the 1Y distance function is part of A1
    if (/^compute(ATH|High1y)Distance$/.test(n) && src.slice(0, start).endsWith('*/\n')) start = src.lastIndexOf('/**', start);
    return [start, end, n];
  }
  return null;
}
function layer1(src) {
  let s = src;
  const SD = '/** Display wording for a setup key';
  const sdAt = s.indexOf(SD);
  if (sdAt !== -1) {                                   // A3: strip _setupDisplay (+ its comment and the blank line after it)
    const f = extractFn(s, '_setupDisplay');
    if (f) { const e = s.indexOf(f) + f.length; s = s.slice(0, sdAt) + s.slice(e + 2); }
  }
  for (const alts of NAMED_FNS) {
    const r = regionOf(s, alts);
    if (!r) return null;
    s = s.slice(0, r[0]) + '/*MASK*/' + s.slice(r[1]);
  }
  return s;
}
const stripComments = s => s.replace(/\/\/.*$/gm, '//');
const NORM = {
  'computeATHDistance|computeHigh1yDistance': s => stripComments(s.replace(/^\/\*\*[\s\S]*?\*\/\n/, '')).replace(/compute(?:ATH|High1y)Distance/g, '@FN').replace(/\b(?:ath|high1y)\b/g, '@V'),
  classifyTechnicalSetup: s => stripComments(s).replace(/\b(?:athDist|high1yDist)\b/g, '@D'),
  buildTechSnapshotBlock: s => s
    .replace(' = ${_setupDisplay(setupState)}]', ']')
    .replace(/(?:ATH|1Y High) Dist: \$\{fmt\(s\.(?:athDist|high1yDist)\)\}/, '@LD'),
  _techDeriveSnap: s => stripComments(s).replace(/\b(?:athDist|high1yDist)\b/g, '@D').replace(/\b(?:hasATH|hasHigh1y)\b/g, '@H')
    .replace(/compute(?:ATH|High1y)Distance/g, '@FN'),
  fetchAnthropicAnalysis: s => s
    .replace(/^ {2}\("ath" in these setup names means the 1-year high from 1Y candles .* never call it an all-time high\.\)\n/m, '')
    .replace('Price is too extended near its 1-year high.', 'Price is too extended.')
    .replace('Near the 1-year high = no chase.', 'Near ATH = no chase.'),
  orchestrate: s => s.replace(/(?:athDist: {7}_snap6a\.athDist {5}|high1yDist: {4}_snap6a\.high1yDist {2})\?\? null,/, '@AUD'),
  _srGroupResults: s => s.replace(/Extended \/ (?:ATH|near 1Y high)/g, '@G'),
  renderMainPanel: s => s
    .replace(/near (?:all-time high|its 1-year high)/g, 'near @H1')
    .replace(/(?:ATH|1Y High) Distance/, '@LD')
    .replace(/snap\.(?:hasATH|hasHigh1y)/g, 'snap.@H')
    .replace(/snap\.(?:athDist|high1yDist)/g, 'snap.@D')
    .replace("${_esc(_setupDisplay(item.technical_setup))}", "${_esc(item.technical_setup).replace(/_/g,' ')}"),
  _dd0FetchAnalysis: s => s.replace(" + ' (' + _setupDisplay(item.technical_setup) + ')'", '')
};
function pinsOf(src) {
  const out = { layer1: null, layer2: {} };
  const l1 = layer1(src);
  out.layer1 = l1 === null ? null : sha256(l1);
  for (const alts of NAMED_FNS) {
    const r = regionOf(src, alts);
    out.layer2[alts] = r ? sha256(NORM[alts](src.slice(r[0], r[1]))) : null;
  }
  return out;
}

if (process.env.HL_CAPTURE === '1') {   // capture mode: print the pins of the current index.html and the classify source
  process.stdout.write(JSON.stringify({ pins: pinsOf(content), classify: fnSrc('classifyTechnicalSetup') }));
  process.exit(0);
}

// ---- Sandboxes ----
// HL-1: both functions take the same snapshot; a key-agnostic table (both key names carry the same value).
const classifyBase = new Function(BASE_CLASSIFY_SRC + '\nreturn classifyTechnicalSetup;')();
const classifyNewSrc = fnSrc('classifyTechnicalSetup');
const classifyNew = classifyNewSrc ? new Function(classifyNewSrc + '\nreturn classifyTechnicalSetup;')() : null;

guard('HL-1', () => {
  const D = [null, -4.99, -5, -5.01, -7.99, -8, -8.01, -20, 0, 3];
  const P20 = [null, 10.01, 10, 2.01, 2, 0, -1];
  const P50 = [null, 0.01, 0, -3, -3.01, 2, 2.01, -5];
  const P150 = [null, 5, 2, 2.01, 0, -5, -5.01, -1];
  let n = 0;
  const bad = [];
  for (const d of D) for (const p20 of P20) for (const p50 of P50) for (const p150 of P150) {
    const snap = { pct20: p20, pct50: p50, pct150: p150, athDist: d, high1yDist: d };
    n += 1;
    const a = classifyBase(snap);
    const b = classifyNew ? classifyNew(snap) : '(missing)';
    if (a !== b) bad.push(JSON.stringify(snap) + ' ' + a + ' vs ' + b);
  }
  check('HL-1 classifyTechnicalSetup is extractable', !!classifyNew);
  check('HL-1 table has at least 30 snapshots (' + n + ')', n >= 30);
  check('HL-1 classification identical to the baseline for every snapshot', bad.length === 0, bad.slice(0, 3).join(' | '));
  const seen = new Set(D.flatMap(d => P20.flatMap(p20 => P50.flatMap(p50 => P150.map(p150 => classifyBase({ pct20: p20, pct50: p50, pct150: p150, athDist: d, high1yDist: d }))))));
  check('HL-1 the table reaches all 8 setup states', seen.size === 8, Array.from(seen).join(','));
});

// Candle fixture for HL-2: 220 deterministic daily candles
const CANDLES = Array.from({ length: 220 }, (_, i) => {
  const close = 100 + i * 0.5 + (i % 7);
  return { close, high: close + 1 + (i % 3), low: close - 1, volume: 1000 + i };
});
const BASE_SNAP_INPUT = { candles: CANDLES, sma20: 190, sma50: 180, sma150: 170, sma200: 160, volMetrics: { ratio: 1.1, avg20: 1000, current: 1100 },
  rsSector: 1.5, rsSPY: 2.5, rsQQQ: -0.5, sectorEtf: 'XLK', spyChangePct: 0.5, qqqChangePct: -0.3 };
const SNAP_KEYS_NEW = ['sma20', 'sma50', 'sma150', 'sma200', 'pct20', 'pct50', 'pct150', 'pct200',
  'hasMA20', 'hasMA50', 'hasMA150', 'hasMA200', 'volRatio', 'hasVolume', 'high1yDist', 'hasHigh1y',
  'rsSector', 'rsSPY', 'rsQQQ', 'sectorEtf', 'candleCount', 'spyChangePct', 'qqqChangePct'];

// ---- HL-2 ----
guard('HL-2', () => {
  const ath = fnSrc('computeHigh1yDistance');
  check('HL-2 computeHigh1yDistance exists and computeATHDistance is gone', !!ath && !fnSrc('computeATHDistance'));
  const parts = ['computePctDiff', 'computeHigh1yDistance', 'classifyTechnicalSetup', '_techDeriveSnap'].map(fnSrc);
  check('HL-2 _techDeriveSnap and its helpers are extractable', parts.every(Boolean));
  if (!parts.every(Boolean)) return;
  const api = new Function(parts.join('\n') + '\nreturn { _techDeriveSnap, computeHigh1yDistance, classifyTechnicalSetup };')();
  for (const price of [null, 250, 120, 300]) {
    const s = api._techDeriveSnap(BASE_SNAP_INPUT, price);
    const p = price || CANDLES[CANDLES.length - 1].close;
    const keys = Object.keys(s);
    check('HL-2 (price ' + price + ') keys are the former list with the two names changed, same positions',
      JSON.stringify(keys) === JSON.stringify(SNAP_KEYS_NEW), keys.join(','));
    check('HL-2 (price ' + price + ') no athDist / hasATH', !('athDist' in s) && !('hasATH' in s));
    check('HL-2 (price ' + price + ') high1yDist === computeHigh1yDistance(candles, price)', s.high1yDist === api.computeHigh1yDistance(CANDLES, p));
    check('HL-2 (price ' + price + ') hasHigh1y mirrors high1yDist', s.hasHigh1y === (s.high1yDist !== null));
    // real derive output through the new classifier == baseline classifier fed the same distance under its old key
    const viaOld = classifyBase(Object.assign({}, s, { athDist: s.high1yDist }));
    check('HL-2 (price ' + price + ') classification of the real derived snapshot equals the baseline classifier', api.classifyTechnicalSetup(s) === viaOld);
  }
});

// ---- HL-4 _setupDisplay ----
let setupDisplay = null;
guard('HL-4', () => {
  const s = fnSrc('_setupDisplay');
  check('HL-4 _setupDisplay exists', !!s);
  if (!s) return;
  check('HL-4 _setupDisplay is pure: no document / window / storage', !/\b(document|window|localStorage|sessionStorage|fetch)\b/.test(s));
  setupDisplay = new Function(s + '\nreturn _setupDisplay;')();
  check('HL-4 extended_near_ath -> "extended near 1Y high"', setupDisplay('extended_near_ath') === 'extended near 1Y high');
  check('HL-4 healthy_uptrend_near_ath -> "healthy uptrend near 1Y high"', setupDisplay('healthy_uptrend_near_ath') === 'healthy uptrend near 1Y high');
  for (const k of ['healthy_uptrend', 'pullback_in_uptrend', 'support_test', 'breakdown_risk', 'below_key_mas', 'unknown', 'some_other_key']) {
    check('HL-4 ' + k + ' -> underscores to spaces', setupDisplay(k) === k.replace(/_/g, ' '));
  }
  check('HL-4 null / undefined / empty -> empty string', setupDisplay(null) === '' && setupDisplay(undefined) === '' && setupDisplay('') === '');
});

// ---- HL-3 no ATH / all-time wording for the 1Y metric ----
const ATH_WORD = /\b(?:ath|all-time)\b/i;
guard('HL-3', () => {
  const snap = Object.assign({ pct20: 12, pct50: 20, pct150: 30, pct200: 40, sma20: 150, sma50: 140, sma150: 130, sma200: 120, volRatio: 1.2, rsSPY: 3, rsQQQ: 2,
    rsSector: 1, sectorEtf: 'XLK', athDist: -2.5, high1yDist: -2.5 }, {});
  const bsrc = ['_setupDisplay', 'buildTechSnapshotBlock'].map(fnSrc).filter(Boolean);
  const build = new Function(bsrc.join('\n') + '\nreturn buildTechSnapshotBlock;')();
  for (const st of ['extended_near_ath', 'healthy_uptrend_near_ath', 'healthy_uptrend']) {
    let out = '';
    try { out = build('TST', snap, st); } catch (e) { out = 'THREW ' + e.message; }
    check('HL-3 buildTechSnapshotBlock (' + st + ') has no ATH / all-time wording', !ATH_WORD.test(out), JSON.stringify(out.split('\n').slice(0, 5)));
    check('HL-3 buildTechSnapshotBlock (' + st + ') shows "1Y High Dist:"', out.indexOf('  1Y High Dist: ') !== -1);
  }
  // B4 (Entry 34, D-B4-2 = A): with a verified All-time-high cache entry the ONLY all-time wording is the verified line itself,
  // and no 1Y line carries it (the 1Y High is never called an all-time high).
  const buildAth = new Function('_athCache', bsrc.join('\n') + '\nreturn buildTechSnapshotBlock;')({ TST: { state: 'verified', athValue: 191.37, athDate: '2025-07-15', currency: 'USD' } });
  const outAth = buildAth('TST', snap, 'extended_near_ath');
  const athLines = outAth.split('\n').filter(l => ATH_WORD.test(l));
  check('HL-3 with a verified ATH entry the only all-time line is "  All-time high (verified): 191.37 USD (2025-07-15)"', athLines.length === 1 && athLines[0] === '  All-time high (verified): 191.37 USD (2025-07-15)', athLines.join(' | '));
  check('HL-3 with a verified ATH entry the 1Y High Dist line is unchanged and carries no all-time wording', outAth.indexOf('  1Y High Dist: -2.50%') !== -1 && outAth.split('\n').filter(l => /1Y High/.test(l)).every(l => !ATH_WORD.test(l)));
  const blk = build('TST', snap, 'extended_near_ath');
  check('HL-3 snapshot header is "[setup: extended_near_ath = extended near 1Y high]"', blk.split('\n')[0] === 'TST [setup: extended_near_ath = extended near 1Y high]');
  const fa = fnSrc('fetchAnthropicAnalysis') || '';
  const gating = fa.split('\n').filter(l => /^ {2}(?:extended_near_ath|healthy_uptrend_near_ath)\s+→/.test(l));
  check('HL-3 the two A6 gating lines are present', gating.length === 2);
  check('HL-3 the two A6 gating lines contain no ATH / all-time wording', gating.every(l => !ATH_WORD.test(l)), gating.join(' / '));
  const EXPL = '  ("ath" in these setup names means the 1-year high from 1Y candles — never call it an all-time high.)';
  check('HL-3 the A6 explanation line is present exactly once in index.html', content.split(EXPL).length - 1 === 1);
  const groups = (fnSrc('_srGroupResults') || '').match(/\{ name: '[^']+',\s*items: \[\] \}/g) || [];
  check('HL-3 _srGroupResults has its 5 group names (R-3, Entry 36 added "Analysis failed — rescan"; Owner ruling 2026-10-08)', groups.length === 5);
  check('HL-3 _srGroupResults group names carry no ATH wording', groups.every(g => !ATH_WORD.test(g)), groups.join(' '));
  const rm = fnSrc('renderMainPanel') || '';
  const am = /const _tsAssessMap = (\{[\s\S]*?\n {2}\});/.exec(rm);
  check('HL-3 _tsAssessMap is extractable', !!am);
  if (am) {
    const map = new Function('return ' + am[1])();
    check('HL-3 _tsAssessMap values carry no ATH / all-time wording', Object.keys(map).every(k => !ATH_WORD.test(map[k])), Object.keys(map).filter(k => ATH_WORD.test(map[k])).join(','));
    check('HL-3 _tsAssessMap near-ath values say "1-year high"', /1-year high/.test(map.extended_near_ath || '') && /1-year high/.test(map.healthy_uptrend_near_ath || ''));
  }
  const row = /<span class="rr-lbl">([^<]*)<\/span><span class="rr-val \$\{snap\.(?:hasATH|hasHigh1y)/.exec(rm);
  check('HL-3 the technical-card distance row label is found', !!row);
  check('HL-3 the distance row label has no ATH wording and is "1Y High Distance"', !!row && !ATH_WORD.test(row[1]) && row[1] === '1Y High Distance', row ? row[1] : '');
  if (setupDisplay) {
    check('HL-3 _setupDisplay of both near-ath keys has no ATH / all-time wording',
      !ATH_WORD.test(setupDisplay('extended_near_ath')) && !ATH_WORD.test(setupDisplay('healthy_uptrend_near_ath')));
  } else check('HL-3 _setupDisplay of both near-ath keys can be checked (function exists)', false);
});

// ---- HL-5 rendered UI (TC-12c render-harness pattern of qa/tech_snapshot_cache_offline.js) ----
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
guard('HL-5', () => {
  const helperNames = ['hasVerifiedMarketData', '_techPanelPrice', '_techSnapFor', '_techRefInput', 'classifyTechnicalSetup', '_setupDisplay',
    '_ptScoreNorm', '_ptScoreText', '_ptScoreDial', '_nlmConsistencyChecks']; // R-6 (Entry 14 s1): the checker renderMainPanel now calls (brief S3.4 class c)
  const helpers = helperNames.map(fnSrc).filter(Boolean);
  const rmSrc = fnSrc('renderMainPanel');
  const ratingRe = /var RATING_SUMMARY_RE = (\/[^\n]*\/[a-z]*);/.exec(content);
  check('HL-5 render harness sources are extractable', !!rmSrc && !!ratingRe && helpers.length >= helperNames.length - 1);
  const factory = new Function('__scope', 'with (__scope) {\n' + helpers.join('\n') + '\n' + rmSrc + '\nreturn renderMainPanel;\n}');
  const PRICE = 190.01;
  const mkSnap = d => ({ sma20: 180, sma50: 170, sma150: 160, sma200: 150, pct20: 5.56, pct50: 11.77, pct150: 18.76, pct200: 26.67,
    hasMA20: true, hasMA50: true, hasMA150: true, hasMA200: true, volRatio: 1.1, hasVolume: true,
    athDist: d, hasATH: d !== null, high1yDist: d, hasHigh1y: d !== null,
    rsSector: 1.5, rsSPY: 2.5, rsQQQ: -0.5, sectorEtf: 'XLK', candleCount: 220, spyChangePct: 0.5, qqqChangePct: -0.3 });
  const render = (item, snap) => {
    const node = { innerHTML: '' };
    const map = {
      window: { PT_ENABLE_TECH_SCORE: false, PT_ENABLE_DEEP_DIVE: false },
      document: { getElementById: id => (id === 'mainPanel' ? node : null) },
      console: quiet,
      _techCache: { TST: { base: {}, computedAt: 0, sectorEtf: 'XLK', snap, refInput: PRICE } },
      _extendedMktCache: {}, _cockpitResults: [], _mktFailCache: {}, findTicker: () => null, refreshTechPanel: () => undefined,
      RATING_SUMMARY_RE: new Function('return ' + ratingRe[1])()
    };
    factory(makeScope(map))(item);
    return node.innerHTML;
  };
  const fmtPct = v => (v === null || v === undefined) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  const cls = d => (d === null ? 'neutral-v' : (d < -15 ? 'warn' : d < -5 ? 'neutral-v' : 'pos'));
  const mkItem = over => Object.assign({ ticker: 'TST', sentiment_score: 70, sentiment: 'positive', summary: 'Rating: Buy', action: 'buy',
    technical_setup: 'extended_near_ath', _verifiedPrice: PRICE, _verifiedChangePct: 1.2 }, over || {});
  for (const d of [-20, -10, -3, 0, null]) {
    const html = render(mkItem(), mkSnap(d));
    const m = /<div class="rr-row"><span class="rr-lbl">([^<]*Distance)<\/span><span class="rr-val ([^"]*)">([^<]*)<\/span><\/div>/.exec(html);
    check('HL-5 (distance ' + d + ') the Technical Setup card has a distance row', !!m);
    if (!m) continue;
    check('HL-5 (distance ' + d + ') label is "1Y High Distance"', m[1] === '1Y High Distance', m[1]);
    check('HL-5 (distance ' + d + ') value is the same as the baseline "ATH Distance" value', m[3] === (d === null ? '—' : fmtPct(d)), m[3]);
    check('HL-5 (distance ' + d + ') colour class is the same as the baseline', m[2] === cls(d), m[2] + ' vs ' + cls(d));
  }
  const html = render(mkItem(), mkSnap(-3));
  const setupRow = /<div class="mp-act-row"><span class="mp-act-lbl">(?:Scan setup|Setup)<\/span>.*?<\/div>/.exec(html);
  check('HL-5 the action-block Setup row is present', !!setupRow);
  check('HL-5 the Setup value for extended_near_ath reads "extended near 1Y high"', !!setupRow && setupRow[0].indexOf('>extended near 1Y high<') !== -1, setupRow ? setupRow[0] : '');
  const other = /<div class="mp-act-row"><span class="mp-act-lbl">(?:Scan setup|Setup)<\/span>.*?<\/div>/.exec(render(mkItem({ technical_setup: 'support_test' }), mkSnap(-3)));
  check('HL-5 another setup keeps the underscores-to-spaces wording', !!other && other[0].indexOf('>support test<') !== -1);
  check('HL-5 the rendered panel has no "ATH Distance" / "all-time" wording', !/ATH Distance|all-time/i.test(html));
});

// ---- HL-6 Deep Dive content ----
guard('HL-6', () => {
  const dd = fnSrc('_dd0FetchAnalysis');
  const sd = fnSrc('_setupDisplay');
  check('HL-6 _dd0FetchAnalysis is extractable', !!dd);
  if (!dd) return;
  const calls = [];
  const fetchStub = (url, opts) => { calls.push({ url: String(url), opts }); return Promise.resolve({ ok: true, json: () => Promise.resolve({ content: [{ type: 'text', text: 'x' }] }) }); };
  const fn = new Function('fetch', (sd || '') + '\n' + dd + '\nreturn _dd0FetchAnalysis;')(fetchStub);
  const run = item => { const idx = calls.length; return fn(item, '').then(() => JSON.parse(calls[idx].opts.body).messages[0].content); };
  const items = [
    ['extended_near_ath', 'TECHNICAL SETUP: extended_near_ath (extended near 1Y high)'],
    ['healthy_uptrend_near_ath', 'TECHNICAL SETUP: healthy_uptrend_near_ath (healthy uptrend near 1Y high)'],
    ['support_test', 'TECHNICAL SETUP: support_test (support test)']
  ];
  const pending = items.map(([k, want]) => run({ ticker: 'TST', technical_setup: k }).then(text => {
    check('HL-6 Deep Dive user content for ' + k + ' contains "' + want + '"', text.split('\n\n').indexOf(want) !== -1, text);
  }));
  pending.push(run({ ticker: 'TST' }).then(text => check('HL-6 no technical_setup -> no TECHNICAL SETUP line', text.indexOf('TECHNICAL SETUP') === -1)));
  asyncWork.push(Promise.all(pending));
});

// ---- HL-7 audit trail ----
guard('HL-7', () => {
  const parts = ['classifyTechnicalSetup', 'enforceScoreConsistency', 'orchestrate'].map(fnSrc);
  check('HL-7 orchestrate and its engine functions are extractable', parts.every(Boolean));
  if (!parts.every(Boolean)) return;
  const body = ['const _techCache = {}; const _extendedMktCache = {}; const window = {};',
    'function findTicker() { return null; } function formatNewsContext() { return ""; }', parts.join('\n'), 'return orchestrate;'].join('\n');
  const orchestrate = new Function('console', body)(quiet);
  const snap = { sma20: 150, sma50: 140, sma150: 130, sma200: 120, pct20: 12, pct50: 20, pct150: 30, pct200: 40, volRatio: 1.2, rsSPY: 3, rsQQQ: 2,
    rsSector: 1, sectorEtf: 'XLK', athDist: -2.5, high1yDist: -2.5 };
  const mk = () => ({ ticker: 'TST', sentiment_score: 90, sentiment: 'positive', summary: '', action: 'buy', news_bias: 'bullish' });
  const out = orchestrate([mk()], {}, { TST: { price: 190.01, change_percent: 1.2, source: 'yahoo' } }, { TST: snap })[0];
  const dc = out._auditTrail.dataCollected;
  check('HL-7 the audit trail stores high1yDist equal to the snapshot value', dc.high1yDist === snap.high1yDist);
  check('HL-7 the audit trail has no athDist key', !('athDist' in dc));
  check('HL-7 the setup outcome is unchanged (extended_near_ath, clamp 62, hold_wait)',
    out.technical_setup === 'extended_near_ath' && out.sentiment_score === 62 && out.action === 'hold_wait');
});

// ---- HL-8 static isolation ----
guard('HL-8', () => {
  const got = pinsOf(content);
  check('HL-8 layer 1: every function not named in section 1 (and every enum, threshold, clamp and the Tech Score v1 region) is byte-equal to the baseline',
    got.layer1 !== null && got.layer1 === PINS.layer1);
  for (const alts of NAMED_FNS) {
    check('HL-8 layer 2: ' + alts + ' is byte-equal to the baseline apart from its brief-mandated tokens',
      got.layer2[alts] !== null && got.layer2[alts] === PINS.layer2[alts]);
  }
  const ENUMS = ['extended_near_ath', 'healthy_uptrend_near_ath', 'healthy_uptrend', 'pullback_in_uptrend', 'support_test', 'breakdown_risk', 'below_key_mas'];
  const cls = fnSrc('classifyTechnicalSetup') || '';
  check('HL-8 every enum string is still returned by classifyTechnicalSetup', ENUMS.every(e => cls.indexOf("return '" + e + "'") !== -1));
});

Promise.all(asyncWork).then(() => {
  console.log(failures === 0
    ? 'HIGH1Y LABEL OFFLINE: PASS (' + asserts + ' asserts)'
    : 'HIGH1Y LABEL OFFLINE: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
  process.exit(failures === 0 ? 0 : 1);
});
