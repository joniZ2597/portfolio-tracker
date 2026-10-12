'use strict';

/*
 * qa/market_structure_offline.js
 *
 * market-structure-1 — pure market-structure engine (services/market-structure.js).
 * Rows MS-T1..MS-T17 of the approved brief. Pure Node: seeded generators inside this file, no
 * fixture files, no network, no browser. Every row carries a planted negative: a mutation of the
 * production source string (loaded through new Function) or of its inputs, never of the test, with
 * a positive control (the unmutated source passes the same assertion).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MODULE_REL = 'services/market-structure.js';
const MODULE_PATH = path.join(ROOT, MODULE_REL);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failed += 1;
    process.stdout.write('  FAIL  ' + name + '\n        ' + (e && e.message ? e.message : e) + '\n');
  }
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error((msg || 'not equal') + '\n        actual:   ' + a + '\n        expected: ' + e);
}

// ---------- production source access ----------

const SOURCE = fs.existsSync(MODULE_PATH) ? fs.readFileSync(MODULE_PATH, 'utf8') : null;

function loadFromSource(src) {
  const m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  return m.exports;
}

const MS = SOURCE === null ? {} : loadFromSource(SOURCE);

// Mutate the production source: the anchor must occur exactly once (a zero or double match is a
// harness defect, not a pass).
function mutate(anchor, replacement) {
  ok(SOURCE !== null, 'module source missing');
  const parts = SOURCE.split(anchor);
  ok(parts.length === 2, 'anchor must occur exactly once (found ' + (parts.length - 1) + '): ' + anchor);
  return loadFromSource(parts.join(replacement));
}

// ---------- deterministic generators ----------

function makeLcg(seed) {
  let x = seed >>> 0;
  return function () {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

const DAY_MS = 86400000;
const START_DAY = Date.UTC(2020, 0, 1) / DAY_MS;

function fmtDay(n) {
  const d = new Date(n * DAY_MS);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}

// n consecutive calendar days; after index gapAfter the sequence skips (gapDays - 1) days.
function consecutiveDates(n, gapAfter, gapDays) {
  const out = [];
  let day = START_DAY;
  for (let i = 0; i < n; i += 1) {
    out.push(fmtDay(day));
    day += (gapAfter !== undefined && i === gapAfter) ? gapDays : 1;
  }
  return out;
}

function flatCandles(dates) {
  return dates.map(function (d) { return { date: d, open: 100, high: 100, low: 100, close: 100, volume: 1000 }; });
}

// n consecutive-day sessions ending on a known asOf (flat price; sufficiency rows only).
function flatSeries(n, gapAfter, gapDays) {
  const dates = consecutiveDates(n, gapAfter, gapDays);
  return { candles: flatCandles(dates), asOf: dates[dates.length - 1], dates: dates };
}

// ---------- ROWS ----------

// MS-T1 — normalisation (§DEF candle input)
test('MS-T1 normalisation: sort, exact-duplicate dates keep last, invalid / future dropped, counts exact', function () {
  const asOf = '2024-03-10';
  const rows = [
    { date: '2024-03-04', open: 10, high: 12, low: 9, close: 11, volume: 5 },
    { date: '2024-03-01', open: 10, high: 12, low: 9, close: 11, volume: 5 },
    { date: '2024-03-04', open: 20, high: 22, low: 19, close: 21, volume: 6 },   // duplicate of 03-04: kept (later input)
    { date: '2024-03-05', open: NaN, high: 12, low: 9, close: 11, volume: 5 },   // invalid: non-finite
    { date: '2024-03-06', open: 10, high: 12, low: 0, close: 11, volume: 5 },    // invalid: non-positive
    { date: '2024-03-07', open: 10, high: 8, low: 9, close: 9, volume: 5 },      // invalid: high < low
    { date: '2024-03-08', open: 10, high: 12, low: 9, close: -1, volume: 5 },    // invalid: negative
    { date: '2024-3-9', open: 10, high: 12, low: 9, close: 11, volume: 5 },      // invalid: bad date shape
    { date: '2024-02-30', open: 10, high: 12, low: 9, close: 11, volume: 5 },    // invalid: not a calendar day
    null,                                                                         // invalid: not an object
    { date: '2024-03-10', open: 10, high: 12, low: 9, close: 11, volume: 5 },    // == asOf: kept
    { date: '2024-03-11', open: 10, high: 12, low: 9, close: 11, volume: 5 },    // future
    { date: '2024-04-01', open: 10, high: 12, low: 9, close: 11, volume: 5 }     // future
  ];
  const r = MS.normalizeCandles(rows, asOf);
  eq(r.candles.map(function (c) { return c.date; }), ['2024-03-01', '2024-03-04', '2024-03-10']);
  eq(r.candles[1].close, 21, 'duplicate keeps the last input row');
  eq(r.dropped, { invalid: 7, duplicate: 1, future: 2 });
  eq(MS.normalizeCandles('nope', asOf), { candles: [], dropped: { invalid: 0, duplicate: 0, future: 0 } }, 'non-array input -> explicit empty');
  let threw = false;
  try { MS.normalizeCandles(rows, '2024-13-40'); } catch (e) { threw = e instanceof TypeError; }
  ok(threw, 'invalid asOf throws TypeError');
});
test('PN MS-T1 a normaliser that drops the asOf day (>= instead of >) fails the boundary row', function () {
  const rows = [{ date: '2024-03-10', open: 10, high: 12, low: 9, close: 11, volume: 5 }];
  ok(MS.normalizeCandles(rows, '2024-03-10').candles.length === 1, 'positive control');
  const mutant = mutate('row.date > asOf', 'row.date >= asOf');
  ok(mutant.normalizeCandles(rows, '2024-03-10').candles.length === 0, 'mutant drops the asOf day');
});

// MS-T2 — sufficiency boundaries and GAPPED (MS-3)
test('MS-T2 sufficiency: 239 / 240 / 719 / 720 sessions at the boundaries', function () {
  function s(n) { const f = flatSeries(n); return MS.assessSufficiency(f.candles, f.asOf); }
  eq(s(239), { h1y: 'INSUFFICIENT', h3y: 'INSUFFICIENT', sessions1y: 239, sessions3y: 239 });
  eq(s(240), { h1y: 'OK', h3y: 'INSUFFICIENT', sessions1y: 240, sessions3y: 240 });
  eq(s(719), { h1y: 'OK', h3y: 'INSUFFICIENT', sessions1y: 252, sessions3y: 719 });
  eq(s(720), { h1y: 'OK', h3y: 'OK', sessions1y: 252, sessions3y: 720 });
  eq(MS.assessSufficiency([], '2024-03-10'), { h1y: 'INSUFFICIENT', h3y: 'INSUFFICIENT', sessions1y: 0, sessions3y: 0 });
});
test('MS-T2 a 10-day hole inside the window -> GAPPED (reported, not fatal); outside the window -> OK', function () {
  const inside = flatSeries(300, 100, 10);            // hole between sessions 100/101: inside the 1y window? n-252 = 48 -> yes
  eq(MS.assessSufficiency(inside.candles, inside.asOf), { h1y: 'GAPPED', h3y: 'INSUFFICIENT', sessions1y: 252, sessions3y: 300 });
  const early = flatSeries(800, 100, 10);             // hole far before the last 252, inside the last 756
  eq(MS.assessSufficiency(early.candles, early.asOf), { h1y: 'OK', h3y: 'GAPPED', sessions1y: 252, sessions3y: 756 });
  const exact = flatSeries(300, 100, 8);              // a 8-calendar-day gap exceeds 7
  eq(MS.assessSufficiency(exact.candles, exact.asOf).h1y, 'GAPPED');
  const edge = flatSeries(300, 100, 7);               // exactly 7 calendar days is not > 7
  eq(MS.assessSufficiency(edge.candles, edge.asOf).h1y, 'OK');
});
test('PN MS-T2 mutated boundary (240 -> 241) and mutated gap limit (7 -> 14) both fail', function () {
  const f240 = flatSeries(240);
  eq(MS.assessSufficiency(f240.candles, f240.asOf).h1y, 'OK', 'positive control');
  const m1 = mutate('var MIN_1Y = 240;', 'var MIN_1Y = 241;');
  eq(m1.assessSufficiency(f240.candles, f240.asOf).h1y, 'INSUFFICIENT', 'mutant moves the boundary');
  const hole = flatSeries(300, 100, 10);
  const m2 = mutate('var GAP_MAX_DAYS = 7;', 'var GAP_MAX_DAYS = 14;');
  eq(m2.assessSufficiency(hole.candles, hole.asOf).h1y, 'OK', 'mutant misses the hole');
});

// MS-T3 — 3y from a 5y series trims to exactly the last 756 sessions
test('MS-T3 5y series: windows trimmed by asOf to exactly the last 756 (and 252) sessions', function () {
  const f = flatSeries(1300);
  const full = MS.assessSufficiency(f.candles, f.asOf);
  eq([full.sessions1y, full.sessions3y, full.h3y], [252, 756, 'OK']);
  const mid = f.dates[1099];                          // asOf mid-series: later rows are future and dropped
  eq(MS.normalizeCandles(f.candles, mid).dropped.future, 200);
  const trimmed = MS.assessSufficiency(f.candles, mid);
  eq([trimmed.sessions1y, trimmed.sessions3y], [252, 756]);
});
test('MS-T3 the 756 boundary is exact: a hole whose far side is the 757th session is outside, the 756th inside', function () {
  // 1300 sessions, hole of 10 days after index g. Window = indices 544..1299 (756 sessions).
  const outside = flatSeries(1300, 543, 10);          // gap between index 543 and 544: 543 is outside
  eq(MS.assessSufficiency(outside.candles, outside.asOf).h3y, 'OK');
  const inside = flatSeries(1300, 544, 10);           // gap between 544 and 545: both inside
  eq(MS.assessSufficiency(inside.candles, inside.asOf).h3y, 'GAPPED');
});
test('PN MS-T3 a window of 755 sessions moves the boundary and fails', function () {
  const f = flatSeries(1300);
  const mutant = mutate('var WINDOW_3Y = 756;', 'var WINDOW_3Y = 755;');
  ok(mutant.assessSufficiency(f.candles, f.asOf).sessions3y === 755, 'mutant trims to 755');
  ok(MS.assessSufficiency(f.candles, f.asOf).sessions3y === 756, 'positive control');
});

// MS-T4 — purity of the module source
const FORBIDDEN = [
  { name: 'fetch', re: /\bfetch\b/ },
  { name: 'XMLHttpRequest', re: /XMLHttpRequest/ },
  { name: 'localStorage', re: /localStorage/ },
  { name: 'indexedDB', re: /indexedDB/ },
  { name: 'document', re: /\bdocument\b/ },
  { name: 'window.', re: /\bwindow\./ },
  { name: 'Date.now', re: /Date\.now/ },
  { name: 'new Date()', re: /new Date\(\s*\)/ },
  { name: 'Math.random', re: /Math\.random/ },
  { name: 'require(', re: /\brequire\s*\(/ }
];
function purityHits(src) {
  return FORBIDDEN.filter(function (f) { return f.re.test(src); }).map(function (f) { return f.name; });
}
test('MS-T4 purity: no network / DOM / storage / clock / randomness / require; loads standalone', function () {
  ok(SOURCE !== null, 'module source missing');
  eq(purityHits(SOURCE), []);
  const standalone = loadFromSource(SOURCE);          // fresh scope with only module / exports
  ok(typeof standalone.normalizeCandles === 'function', 'loads standalone');
});
test('PN MS-T4 every forbidden token appended to the real source is flagged', function () {
  ok(SOURCE !== null, 'module source missing');
  const probes = ['fetch(1);', 'new XMLHttpRequest();', 'localStorage.getItem("a");', 'indexedDB.open("a");',
    'document.body;', 'window.x = 1;', 'Date.now();', 'new Date();', 'Math.random();', "require('fs');"];
  eq(probes.length, FORBIDDEN.length, 'one probe per forbidden token');
  probes.forEach(function (p, i) {
    const hits = purityHits(SOURCE + '\n' + p + '\n');
    ok(hits.indexOf(FORBIDDEN[i].name) !== -1, 'not flagged: ' + p);
  });
  ok(purityHits(SOURCE + '\nnew Date(0);\n').indexOf('new Date()') === -1, 'new Date(arg) is allowed');
});

// ---------- slice 2 generators ----------

// Seeded random walk on consecutive calendar days (volatility / swing rows).
function genWalk(n, seed) {
  const rnd = makeLcg(seed);
  const dates = consecutiveDates(n);
  const out = [];
  let prev = 100;
  for (let i = 0; i < n; i += 1) {
    const close = prev * (1 + (rnd() - 0.5) * 0.04);
    const hi = Math.max(prev, close) * (1 + rnd() * 0.01);
    const lo = Math.min(prev, close) * (1 - rnd() * 0.01);
    out.push({ date: dates[i], open: prev, high: hi, low: lo, close: close, volume: 1000 });
    prev = close;
  }
  return out;
}

// Close path -> candles with high = close + 0.5, low = close - 0.5, open = previous close.
function pathCandles(closes) {
  const dates = consecutiveDates(closes.length);
  return closes.map(function (c, i) {
    return { date: dates[i], open: i === 0 ? c : closes[i - 1], high: c + 0.5, low: c - 0.5, close: c, volume: 1000 };
  });
}

// Constant close 100, half-range h[i]: true range = 2 * h[i].
function halfRangeCandles(hs) {
  const dates = consecutiveDates(hs.length);
  return hs.map(function (h, i) { return { date: dates[i], open: 100, high: 100 + h, low: 100 - h, close: 100, volume: 1000 }; });
}

// Oracle: the production _ts1Atr14 and its policy.atr, extracted from index.html as text.
function extractOracle() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const head = 'function _ts1Atr14(candles, policy) {';
  ok(html.split(head).length === 2, '_ts1Atr14 must occur exactly once');
  const start = html.indexOf(head);
  let depth = 0;
  let end = -1;
  for (let i = html.indexOf('{', start); i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    else if (html[i] === '}') { depth -= 1; if (depth === 0) { end = i + 1; break; } }
  }
  ok(end > start, 'brace match');
  const policyLine = 'atr: { period: 14, minCandles: 15 }';
  ok(html.split(policyLine).length === 2, 'policy.atr must occur exactly once');
  const fn = new Function(html.slice(start, end) + '; return _ts1Atr14;')();
  const policy = new Function('return { ' + policyLine + ' };')();
  return function (candles) { return fn(candles, policy); };
}

// MS-T5 — ATR14 parity with the extracted _ts1Atr14
test('MS-T5 ATR14 equals the extracted _ts1Atr14 + policy.atr exactly on 5 generated series; < 15 -> null', function () {
  const oracle = extractOracle();
  [[300, 11], [252, 12], [40, 13], [16, 14], [15, 15]].forEach(function (p) {
    const c = genWalk(p[0], p[1]);
    ok(MS.atr14(c) === oracle(c), 'atr14 parity n=' + p[0]);
    const series = MS.atrSeries(c);
    eq(series.length, c.length);
  });
  const c40 = genWalk(40, 13);
  const series = MS.atrSeries(c40);
  for (let i = 0; i < c40.length; i += 1) {
    const expected = oracle(c40.slice(0, i + 1));
    ok(series[i] === expected, 'atrSeries[' + i + '] parity (' + series[i] + ' vs ' + expected + ')');
  }
  eq(MS.atr14(genWalk(14, 16)), null);
  eq(MS.atrSeries(genWalk(14, 16)).every(function (v) { return v === null; }), true);
  eq(MS.atr14([]), null);
});
test('PN MS-T5 a period change (14 -> 13) breaks parity against the oracle', function () {
  const oracle = extractOracle();
  const c = genWalk(60, 21);
  ok(MS.atr14(c) === oracle(c), 'positive control');
  const mutant = mutate('var ATR_PERIOD = 14;', 'var ATR_PERIOD = 13;');
  ok(mutant.atr14(c) !== oracle(c), 'mutant diverges');
});

// MS-T6 — volatility regime (MS-5)
test('MS-T6 regime: LOW < P33, HIGH > P67, equality is NORMAL, < 120 values -> UNKNOWN', function () {
  const flat = []; for (let i = 0; i < 251; i += 1) flat.push(5);
  eq(MS.classifyRegime(flat.concat([5])).regime, 'NORMAL', 'equal to both percentiles is NORMAL');
  eq(MS.classifyRegime(flat.concat([4])).regime, 'LOW');
  eq(MS.classifyRegime(flat.concat([6])).regime, 'HIGH');
  const short119 = []; for (let i = 0; i < 118; i += 1) short119.push(5);
  eq(MS.classifyRegime(short119.concat([9])).regime, 'UNKNOWN', '119 values');
  eq(MS.classifyRegime(short119.concat([5, 9])).regime, 'HIGH', '120 values');
  eq(MS.classifyRegime([]).regime, 'UNKNOWN');
  // only the trailing 252 values form the distribution
  const longer = []; for (let i = 0; i < 400; i += 1) longer.push(50);
  eq(MS.classifyRegime(longer.concat(flat).concat([6])).regime, 'HIGH', 'older values are outside the 252 window');
});
test('MS-T6 volatilityRegime on candles: ATR% against its own trailing distribution', function () {
  function hs(tail) { const a = []; for (let i = 0; i < 300; i += 1) a.push(1); for (let i = 0; i < 14; i += 1) a.push(tail); return a; }
  const same = MS.volatilityRegime(halfRangeCandles(hs(1)));
  eq([same.atr14, same.atrPct, same.regime], [2, 2, 'NORMAL']);
  const hi = MS.volatilityRegime(halfRangeCandles(hs(3)));
  eq([hi.atr14, hi.atrPct, hi.regime], [6, 6, 'HIGH']);
  const lo = MS.volatilityRegime(halfRangeCandles(hs(0.25)));
  eq([lo.atr14, lo.atrPct, lo.regime], [0.5, 0.5, 'LOW']);
  eq(MS.volatilityRegime(genWalk(133, 31)).regime, 'UNKNOWN', '119 ATR values');
  ok(MS.volatilityRegime(genWalk(134, 31)).regime !== 'UNKNOWN', '120 ATR values');
  eq(MS.volatilityRegime(genWalk(10, 31)), { atr14: null, atrPct: null, regime: 'UNKNOWN' });
});
test('PN MS-T6 a <= comparison at the P33 edge turns the equal case LOW; a 119-value gate moves the UNKNOWN edge', function () {
  const flat = []; for (let i = 0; i < 252; i += 1) flat.push(5);
  eq(MS.classifyRegime(flat).regime, 'NORMAL', 'positive control');
  const m1 = mutate('value < p33', 'value <= p33');
  eq(m1.classifyRegime(flat).regime, 'LOW', 'mutant flags equality');
  const m2 = mutate('var REGIME_MIN_VALUES = 120;', 'var REGIME_MIN_VALUES = 119;');
  eq(m2.classifyRegime(flat.slice(0, 119)).regime !== 'UNKNOWN', true, 'mutant accepts 119 values');
  eq(MS.classifyRegime(flat.slice(0, 119)).regime, 'UNKNOWN', 'positive control');
});

// MS-T7 — ZigZag on a hand-built series. Highs/lows are close +/- 0.5; ATR14 is 1 on flat bars and
// 1.5 inside a one-point-per-bar ramp, so the threshold is 2 x 1.5 = 3 at every ramp extreme.
function zigzagPath() {
  const c = [];
  for (let i = 0; i < 20; i += 1) c.push(100);             // bars 0..19 flat
  for (let i = 1; i <= 20; i += 1) c.push(100 + i);        // bars 20..39 up to 120
  for (let i = 1; i <= 20; i += 1) c.push(120 - i);        // bars 40..59 down to 100
  for (let i = 1; i <= 10; i += 1) c.push(100 + i);        // bars 60..69 up to 110
  c.push(108.5);                                           // bar 70: sub-threshold dip (2.5 < 3)
  for (let i = 1; i <= 10; i += 1) c.push(110 + i);        // bars 71..80 up to 120
  return c;
}
const ZZ_DATES = consecutiveDates(81);
test('MS-T7 zigzag: exact pivots, a sub-threshold wiggle makes none, the open extreme is not confirmed', function () {
  const r = MS.zigzagSwings(pathCandles(zigzagPath()));
  eq(r.k, 2);
  eq(r.pivots, [
    { date: ZZ_DATES[39], type: 'HIGH', price: 120.5 },
    { date: ZZ_DATES[59], type: 'LOW', price: 99.5 }
  ]);
  eq(r.open, { date: ZZ_DATES[80], type: 'HIGH', price: 120.5 });
});
test('PN MS-T7 k = 1 (threshold 1.5) turns the 2.5 dip into a pivot', function () {
  const c = pathCandles(zigzagPath());
  eq(MS.zigzagSwings(c).pivots.length, 2, 'positive control');
  const mutant = mutate('var ZIGZAG_K = 2.0;', 'var ZIGZAG_K = 1.0;');
  ok(mutant.zigzagSwings(c).pivots.length > 2, 'mutant finds the wiggle');
});

// MS-T8 — alternation
function alternates(pivots) {
  for (let i = 1; i < pivots.length; i += 1) {
    if (pivots[i].type === pivots[i - 1].type) return false;
    if (!(pivots[i].date > pivots[i - 1].date)) return false;
  }
  return true;
}
test('MS-T8 pivots strictly alternate HIGH / LOW on random walks; the last open extreme is not confirmed', function () {
  [41, 42, 43, 44].forEach(function (seed) {
    const c = genWalk(500, seed);
    const r = MS.zigzagSwings(c);
    ok(r.pivots.length >= 4, 'seed ' + seed + ' has pivots (' + r.pivots.length + ')');
    ok(alternates(r.pivots), 'alternation seed ' + seed);
    ok(r.open !== null, 'open extreme present');
    ok(r.open.date > r.pivots[r.pivots.length - 1].date, 'open extreme is after the last pivot');
    ok(r.open.type !== r.pivots[r.pivots.length - 1].type, 'open extreme is the opposite type');
    ok(!r.pivots.some(function (p) { return p.date === r.open.date; }), 'open extreme is not a pivot');
  });
});
test('PN MS-T8 a state that does not flip after a confirmed pivot breaks alternation', function () {
  const c = genWalk(500, 41);
  ok(alternates(MS.zigzagSwings(c).pivots), 'positive control');
  const mutant = mutate('dir = -1; loI = argMinLow(', 'dir = 1; loI = argMinLow(');
  ok(!alternates(mutant.zigzagSwings(c).pivots), 'mutant repeats a type');
});

// MS-T9 — levels (MS-6)
test('MS-T9 levels: 0.5 x ATR clustering, <= 3 per side, nearest first, touch counts, 1y window only', function () {
  // 300 bars, close 100, range 1 -> ATR14 = 1 -> cluster width 0.5; last close 100.
  const c = pathCandles(new Array(300).fill(100));
  const d = function (i) { return c[i].date; };
  const pivots = [
    { date: d(10), type: 'LOW', price: 99 },        // outside the last 252 sessions: ignored
    { date: d(60), type: 'LOW', price: 90 },
    { date: d(80), type: 'LOW', price: 90.5 },      // within 0.5 of the 90 anchor: same cluster
    { date: d(100), type: 'HIGH', price: 90.75 },   // 0.75 from the anchor: its own cluster (pools HIGH and LOW)
    { date: d(120), type: 'LOW', price: 95 },
    { date: d(140), type: 'LOW', price: 80 },
    { date: d(160), type: 'LOW', price: 70 },
    { date: d(170), type: 'HIGH', price: 104 },
    { date: d(190), type: 'HIGH', price: 104.25 },
    { date: d(200), type: 'HIGH', price: 110 },
    { date: d(210), type: 'HIGH', price: 120 },
    { date: d(220), type: 'HIGH', price: 130 }
  ];
  const r = MS.levels(c, pivots);
  eq(r.support, [
    { price: 95, touches: 1, lastTouch: d(120) },
    { price: 90.75, touches: 1, lastTouch: d(100) },
    { price: 90.25, touches: 2, lastTouch: d(80) }
  ]);
  eq(r.resistance, [
    { price: 104.125, touches: 2, lastTouch: d(190) },
    { price: 110, touches: 1, lastTouch: d(200) },
    { price: 120, touches: 1, lastTouch: d(210) }
  ]);
});
test('PN MS-T9 a narrower cluster width and a 4-per-side cap both change the output', function () {
  const c = pathCandles(new Array(300).fill(100));
  const pv = [{ date: c[60].date, type: 'LOW', price: 90 }, { date: c[80].date, type: 'LOW', price: 90.5 }];
  eq(MS.levels(c, pv).support.length, 1, 'positive control (clustered)');
  const m1 = mutate('var LEVEL_CLUSTER_ATR = 0.5;', 'var LEVEL_CLUSTER_ATR = 0.25;');
  eq(m1.levels(c, pv).support.length, 2, 'mutant splits the cluster');
  const many = [];
  for (let i = 0; i < 6; i += 1) many.push({ date: c[100 + i].date, type: 'LOW', price: 50 + i * 5 });
  eq(MS.levels(c, many).support.length, 3, 'positive control (cap)');
  const m2 = mutate('var LEVELS_PER_SIDE = 3;', 'var LEVELS_PER_SIDE = 4;');
  eq(m2.levels(c, many).support.length, 4, 'mutant widens the cap');
});

// MS-T10 — flat / constant series: explicit empty states
test('MS-T10 flat series and tiny inputs: no swings, no levels, no crash', function () {
  const flat = flatCandles(consecutiveDates(300));
  eq(MS.atr14(flat), 0);
  const v = MS.volatilityRegime(flat);
  eq([v.atr14, v.atrPct, v.regime], [0, 0, 'NORMAL']);
  const z = MS.zigzagSwings(flat);
  eq([z.pivots, z.open], [[], null]);
  eq(MS.levels(flat, z.pivots), { support: [], resistance: [] });
  [[], flat.slice(0, 1), flat.slice(0, 14)].forEach(function (c) {
    eq(MS.zigzagSwings(c).pivots, []);
    eq(MS.levels(c, []), { support: [], resistance: [] });
    eq(MS.atr14(c), null);
  });
  eq(MS.volatilityRegime([]), { atr14: null, atrPct: null, regime: 'UNKNOWN' });
});
test('PN MS-T10 letting a bar without an ATR confirm a swing turns the flat series into pivots', function () {
  const flat = flatCandles(consecutiveDates(300));
  eq(MS.zigzagSwings(flat).pivots.length, 0, 'positive control');
  const mutant = mutate('atrValue !== null && ', '');
  ok(mutant.zigzagSwings(flat).pivots.length > 0, 'mutant invents swings from nothing');
});

// ---- ROWS-END ----

const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
if (failed > 0) { process.exitCode = 1; }
