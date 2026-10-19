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

// ---------- slice 3 ----------

function mkLegs(dir, pcts, sessions) {
  return pcts.map(function (p, i) { return { direction: dir, pct: p, sessions: sessions[i] }; });
}

// MS-T11 — profile percentiles, Hyndman-Fan type 7, rounded 0.1 % / 1 session
test('MS-T11 profile percentiles equal hand-computed type-7 values; down legs are magnitudes reported negative', function () {
  const up = mkLegs('UP', [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
  const down = mkLegs('DOWN', [-5, -10, -15, -20, -25, -30, -35, -40, -45], [2, 4, 6, 8, 10, 12, 14, 16, 18]);
  // shuffle: the profile must not depend on input order
  const p = MS.moveProfile(down.slice().reverse().concat(up.slice(5), up.slice(0, 5)));
  eq(p.up, { status: 'OK', n: 10, pct: { p25: 32.5, p50: 55, p75: 77.5, p90: 91 }, sessions: { p25: 16, p50: 28, p75: 39, p90: 46 } });
  eq(p.down, { status: 'OK', n: 9, pct: { p25: -15, p50: -25, p75: -35, p90: -41 }, sessions: { p25: 6, p50: 10, p75: 14, p90: 16 } });
  eq(MS.percentile([1, 2, 3, 4], 0.5), 2.5);
  eq(MS.percentile([], 0.5), null);
  const quarter = MS.moveProfile(mkLegs('UP', new Array(8).fill(0.25), new Array(8).fill(3)).concat(mkLegs('DOWN', new Array(8).fill(-0.25), new Array(8).fill(3))));
  eq([quarter.up.pct.p25, quarter.down.pct.p25], [0.3, -0.3], 'rounding is symmetric about zero');
});
test('PN MS-T11 nearest-rank instead of interpolation, and an unsigned down profile, both change the output', function () {
  const up = mkLegs('UP', [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
  const down = mkLegs('DOWN', [-5, -10, -15, -20, -25, -30, -35, -40, -45, -50], [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  eq(MS.moveProfile(up.concat(down)).up.pct.p25, 32.5, 'positive control');
  const m1 = mutate('return sortedAsc[lo] + (h - lo) * (sortedAsc[hi] - sortedAsc[lo]);', 'return sortedAsc[lo];');
  eq(m1.moveProfile(up.concat(down)).up.pct.p25, 30, 'mutant is nearest-rank');
  const m2 = mutate('scale * percentile(', '1 * percentile(');
  ok(m2.moveProfile(up.concat(down)).down.pct.p25 > 0, 'mutant loses the sign');
});

// MS-T12 — minimum sample
test('MS-T12 7 legs -> INSUFFICIENT_SAMPLE with n and no percentiles; 8 legs -> percentiles', function () {
  const mk = function (n) { return mkLegs('UP', new Array(n).fill(0).map(function (_, i) { return 10 + i; }), new Array(n).fill(5)); };
  eq(MS.moveProfile(mk(7)).up, { status: 'INSUFFICIENT_SAMPLE', n: 7, pct: null, sessions: null });
  const eight = MS.moveProfile(mk(8)).up;
  eq([eight.status, eight.n], ['OK', 8]);
  ok(eight.pct !== null && eight.sessions !== null, 'percentiles present');
  eq(MS.moveProfile(mk(0)).down, { status: 'INSUFFICIENT_SAMPLE', n: 0, pct: null, sessions: null });
  eq(MS.moveProfile([]).up.status, 'INSUFFICIENT_SAMPLE');
});
test('PN MS-T12 a minimum of 7 accepts 7 legs', function () {
  const seven = mkLegs('UP', [1, 2, 3, 4, 5, 6, 7], [1, 2, 3, 4, 5, 6, 7]);
  eq(MS.moveProfile(seven).up.status, 'INSUFFICIENT_SAMPLE', 'positive control');
  const mutant = mutate('var MIN_SAMPLE = 8;', 'var MIN_SAMPLE = 7;');
  eq(mutant.moveProfile(seven).up.status, 'OK', 'mutant accepts 7');
});

// MS-T13 — current leg: pct / sessions / rank / the three context keys at their boundaries
const CL = flatCandles(consecutiveDates(40));
const clDate = function (i) { return CL[i].date; };
function upSwings(openPrice) {
  return { pivots: [{ date: clDate(10), type: 'LOW', price: 100 }], open: { date: clDate(20), type: 'HIGH', price: openPrice } };
}
function downSwings(openPrice) {
  return { pivots: [{ date: clDate(10), type: 'HIGH', price: 100 }], open: { date: clDate(20), type: 'LOW', price: openPrice } };
}
const UP_LEGS = mkLegs('UP', [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], new Array(10).fill(5));          // P75 77.5, P90 91
const DOWN_LEGS = mkLegs('DOWN', [-5, -10, -15, -20, -25, -30, -35, -40, -45], new Array(9).fill(5));   // P75 35, P90 41
test('MS-T13 current UP leg: % / sessions / rank and the context boundaries (<= P75, <= P90, beyond)', function () {
  const at = function (x) { return MS.currentLeg(CL, upSwings(x), UP_LEGS.concat(DOWN_LEGS)); };
  eq(at(177.5), { direction: 'UP', pct: 77.5, sessions: 10, rank1y: 70, context: 'WITHIN_TYPICAL' });
  eq(at(177.6), { direction: 'UP', pct: 77.6, sessions: 10, rank1y: 70, context: 'EXTENDED' });
  eq(at(191), { direction: 'UP', pct: 91, sessions: 10, rank1y: 90, context: 'EXTENDED' });
  eq(at(191.1), { direction: 'UP', pct: 91.1, sessions: 10, rank1y: 90, context: 'BEYOND_P90' });
  eq(at(200).rank1y, 100);
  eq(at(105).rank1y, 0, 'below every historical leg');
});
test('MS-T13 current DOWN leg uses the down profile by magnitude; insufficient profile / no leg -> explicit UNKNOWN / NONE', function () {
  const at = function (x) { return MS.currentLeg(CL, downSwings(x), UP_LEGS.concat(DOWN_LEGS)); };
  eq(at(66), { direction: 'DOWN', pct: -34, sessions: 10, rank1y: 66.7, context: 'WITHIN_TYPICAL' });
  eq(at(64).context, 'EXTENDED');
  eq(at(59).context, 'EXTENDED');
  eq(at(58).context, 'BEYOND_P90');
  eq(MS.currentLeg(CL, upSwings(150), UP_LEGS.slice(0, 7).concat(DOWN_LEGS)), { direction: 'UP', pct: 50, sessions: 10, rank1y: null, context: 'UNKNOWN' });
  eq(MS.currentLeg(CL, upSwings(150), null), { direction: 'UP', pct: 50, sessions: 10, rank1y: null, context: 'UNKNOWN' });
  const none = { direction: 'NONE', pct: null, sessions: null, rank1y: null, context: 'UNKNOWN' };
  eq(MS.currentLeg(CL, { pivots: [], open: null }, UP_LEGS), none);
  eq(MS.currentLeg([], { pivots: [], open: null }, null), none);
});
test('PN MS-T13 a strict < at the P75 edge flips the boundary case', function () {
  const sw = upSwings(177.5);
  eq(MS.currentLeg(CL, sw, UP_LEGS).context, 'WITHIN_TYPICAL', 'positive control');
  const mutant = mutate('if (shown <= p75)', 'if (shown < p75)');
  eq(mutant.currentLeg(CL, sw, UP_LEGS).context, 'EXTENDED', 'mutant flips');
});

// MS-T14 — public output shape
const SHAPE = {
  top: ['schema', 'basis', 'asOf', 'input', 'sufficiency', 'volatility', 'swings', 'levels', 'profile', 'current'],
  input: ['sessions', 'firstDate', 'lastDate', 'dropped'],
  dropped: ['invalid', 'duplicate', 'future'],
  sufficiency: ['h1y', 'h3y', 'sessions1y', 'sessions3y'],
  volatility: ['atr14', 'atrPct', 'regime'],
  swings: ['k', 'pivots'],
  pivot: ['date', 'type', 'price'],
  levels: ['support', 'resistance'],
  level: ['price', 'touches', 'lastTouch'],
  profile: ['h1y', 'h3y'],
  horizon: ['up', 'down'],
  leaf: ['status', 'n', 'pct', 'sessions'],
  quant: ['p25', 'p50', 'p75', 'p90'],
  current: ['direction', 'pct', 'sessions', 'rank1y', 'context']
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function shapeErrors(o) {
  const errs = [];
  function keys(obj, expected, where) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) { errs.push(where + ' is not an object'); return false; }
    if (JSON.stringify(Object.keys(obj)) !== JSON.stringify(expected)) { errs.push(where + ' keys ' + JSON.stringify(Object.keys(obj)) + ' != ' + JSON.stringify(expected)); return false; }
    return true;
  }
  const num = function (v, where) { if (typeof v !== 'number' || !isFinite(v)) errs.push(where + ' not a finite number'); };
  const numN = function (v, where) { if (v !== null) num(v, where); };
  const dateS = function (v, where) { if (typeof v !== 'string' || !DATE_RE.test(v)) errs.push(where + ' not a date'); };
  const oneOf = function (v, list, where) { if (list.indexOf(v) === -1) errs.push(where + ' = ' + v + ' not in ' + list.join('|')); };
  if (!keys(o, SHAPE.top, 'output')) return errs;
  eq(o.schema, 'market-structure/v1'); eq(o.basis, 'HISTORICAL_DESCRIPTIVE'); dateS(o.asOf, 'asOf');
  if (keys(o.input, SHAPE.input, 'input')) {
    num(o.input.sessions, 'sessions');
    if (o.input.sessions > 0) { dateS(o.input.firstDate, 'firstDate'); dateS(o.input.lastDate, 'lastDate'); } else eq([o.input.firstDate, o.input.lastDate], [null, null]);
    if (keys(o.input.dropped, SHAPE.dropped, 'dropped')) SHAPE.dropped.forEach(function (k) { num(o.input.dropped[k], 'dropped.' + k); });
  }
  if (keys(o.sufficiency, SHAPE.sufficiency, 'sufficiency')) {
    oneOf(o.sufficiency.h1y, ['OK', 'INSUFFICIENT', 'GAPPED'], 'h1y'); oneOf(o.sufficiency.h3y, ['OK', 'INSUFFICIENT', 'GAPPED'], 'h3y');
    num(o.sufficiency.sessions1y, 's1y'); num(o.sufficiency.sessions3y, 's3y');
  }
  if (keys(o.volatility, SHAPE.volatility, 'volatility')) {
    numN(o.volatility.atr14, 'atr14'); numN(o.volatility.atrPct, 'atrPct'); oneOf(o.volatility.regime, ['LOW', 'NORMAL', 'HIGH', 'UNKNOWN'], 'regime');
  }
  if (keys(o.swings, SHAPE.swings, 'swings')) {
    num(o.swings.k, 'k');
    if (!Array.isArray(o.swings.pivots)) errs.push('pivots not an array');
    else o.swings.pivots.forEach(function (p, i) { if (keys(p, SHAPE.pivot, 'pivot' + i)) { dateS(p.date, 'pivot.date'); oneOf(p.type, ['HIGH', 'LOW'], 'pivot.type'); num(p.price, 'pivot.price'); } });
  }
  if (keys(o.levels, SHAPE.levels, 'levels')) {
    ['support', 'resistance'].forEach(function (side) {
      if (!Array.isArray(o.levels[side])) errs.push(side + ' not an array');
      else o.levels[side].forEach(function (l, i) { if (keys(l, SHAPE.level, side + i)) { num(l.price, 'level.price'); num(l.touches, 'level.touches'); dateS(l.lastTouch, 'level.lastTouch'); } });
    });
  }
  if (keys(o.profile, SHAPE.profile, 'profile')) {
    ['h1y', 'h3y'].forEach(function (h) {
      if (!keys(o.profile[h], SHAPE.horizon, h)) return;
      ['up', 'down'].forEach(function (d) {
        const leaf = o.profile[h][d];
        if (!keys(leaf, SHAPE.leaf, h + '.' + d)) return;
        oneOf(leaf.status, ['OK', 'INSUFFICIENT_SAMPLE', 'INSUFFICIENT'], h + '.' + d + '.status');
        if (leaf.status === 'OK') {
          num(leaf.n, 'n');
          if (keys(leaf.pct, SHAPE.quant, 'pct')) SHAPE.quant.forEach(function (q) { num(leaf.pct[q], 'pct.' + q); });
          if (keys(leaf.sessions, SHAPE.quant, 'sessions')) SHAPE.quant.forEach(function (q) { num(leaf.sessions[q], 'sessions.' + q); });
        } else {
          if (leaf.status === 'INSUFFICIENT_SAMPLE') num(leaf.n, 'n'); else eq(leaf.n, null);
          eq([leaf.pct, leaf.sessions], [null, null]);
        }
      });
    });
  }
  if (keys(o.current, SHAPE.current, 'current')) {
    oneOf(o.current.direction, ['UP', 'DOWN', 'NONE'], 'direction'); numN(o.current.pct, 'cur.pct'); numN(o.current.sessions, 'cur.sessions');
    numN(o.current.rank1y, 'rank1y'); oneOf(o.current.context, ['WITHIN_TYPICAL', 'EXTENDED', 'BEYOND_P90', 'UNKNOWN'], 'context');
  }
  return errs;
}

// A sine wave with noise: many confirmed swings, so the profile and current leg are exercised.
function genWave(n, period, amp, seed) {
  const rnd = makeLcg(seed);
  const dates = consecutiveDates(n);
  const out = [];
  let prev = 100;
  for (let i = 0; i < n; i += 1) {
    const close = 100 + amp * Math.sin((2 * Math.PI * i) / period) + (rnd() - 0.5);
    out.push({ date: dates[i], open: prev, high: Math.max(prev, close) + 0.3, low: Math.min(prev, close) - 0.3, close: close, volume: 1000 });
    prev = close;
  }
  return out;
}
const WAVE = genWave(900, 25, 15, 61);
const WALK = genWalk(1300, 51);
const ASOF_WAVE = WAVE[WAVE.length - 1].date;
const ASOF_WALK = WALK[WALK.length - 1].date;

test('MS-T14 public output equals the DoD shape exactly (key set, order, types) on walks, waves, short and empty input', function () {
  const cases = [
    [WALK, ASOF_WALK], [WAVE, ASOF_WAVE], [genWalk(60, 5), consecutiveDates(60)[59]], [genWalk(20, 6), consecutiveDates(20)[19]],
    [[], '2024-01-31'], [flatCandles(consecutiveDates(300)), consecutiveDates(300)[299]]
  ];
  cases.forEach(function (c, i) {
    const out = MS.analyzeMarketStructure(c[0], { asOf: c[1] });
    eq(shapeErrors(out), [], 'case ' + i);
  });
  eq(Object.keys(MS).sort(), ['analyzeMarketStructure', 'assessSufficiency', 'atr14', 'atrSeries', 'buildLegs', 'classifyRegime',
    'currentLeg', 'levels', 'moveProfile', 'normalizeCandles', 'percentile', 'volatilityRegime', 'zigzagSwings'], 'frozen export list');
  let threw = false;
  try { MS.analyzeMarketStructure(WAVE, {}); } catch (e) { threw = e instanceof TypeError; }
  ok(threw, 'missing asOf throws TypeError');
});
test('PN MS-T14 an unknown key, a reordered key and a missing key are all rejected by the shape check', function () {
  const out = MS.analyzeMarketStructure(WAVE, { asOf: ASOF_WAVE });
  eq(shapeErrors(out), [], 'positive control');
  ok(shapeErrors(Object.assign({}, out, { extra: 1 })).length > 0, 'unknown top key');
  ok(shapeErrors(Object.assign({}, out, { current: Object.assign({}, out.current, { z: 1 }) })).length > 0, 'unknown nested key');
  ok(shapeErrors({ basis: out.basis, schema: out.schema, asOf: out.asOf, input: out.input, sufficiency: out.sufficiency, volatility: out.volatility, swings: out.swings, levels: out.levels, profile: out.profile, current: out.current }).length > 0, 'reordered');
  const noCur = Object.assign({}, out); delete noCur.current;
  ok(shapeErrors(noCur).length > 0, 'missing key');
  const m = mutate('schema: SCHEMA,', 'zzz: 1, schema: SCHEMA,');
  ok(shapeErrors(m.analyzeMarketStructure(WAVE, { asOf: ASOF_WAVE })).length > 0, 'production mutant with an extra key');
});

test('MS-T14 end to end on the wave: sufficiency, swings, profile and current leg agree with each other', function () {
  const out = MS.analyzeMarketStructure(WAVE, { asOf: ASOF_WAVE });
  eq(out.sufficiency, { h1y: 'OK', h3y: 'OK', sessions1y: 252, sessions3y: 756 });
  eq(out.input, { sessions: 900, firstDate: WAVE[0].date, lastDate: WAVE[899].date, dropped: { invalid: 0, duplicate: 0, future: 0 } });
  ok(alternates(out.swings.pivots) && out.swings.pivots.length > 20, 'alternating pivots');
  const start1y = WAVE[900 - 252].date;
  const inWin = out.swings.pivots.filter(function (p) { return p.date >= start1y; });
  let ups = 0, downs = 0;
  for (let i = 1; i < inWin.length; i += 1) {
    if (inWin[i - 1].type === 'LOW') ups += 1; else downs += 1;
  }
  eq([out.profile.h1y.up.n, out.profile.h1y.down.n], [ups, downs], 'leg counts follow the in-window pivots');
  eq([out.profile.h1y.up.status, out.profile.h1y.down.status], ['OK', 'OK']);
  ['up', 'down'].forEach(function (d) {
    const q = out.profile.h1y[d].pct;
    ok(Math.abs(q.p25) <= Math.abs(q.p50) && Math.abs(q.p50) <= Math.abs(q.p75) && Math.abs(q.p75) <= Math.abs(q.p90), d + ' percentiles ordered by magnitude');
  });
  ok(out.profile.h1y.up.pct.p50 > 0 && out.profile.h1y.down.pct.p50 < 0, 'signs');
  ok(out.current.direction !== 'NONE' && out.current.rank1y >= 0 && out.current.rank1y <= 100 && out.current.context !== 'UNKNOWN', 'current leg described');
  ok(out.levels.support.length + out.levels.resistance.length > 0, 'levels found');
  const short = MS.analyzeMarketStructure(genWalk(60, 5), { asOf: consecutiveDates(60)[59] });
  eq([short.sufficiency.h1y, short.levels, short.profile.h1y.up, short.volatility.regime], ['INSUFFICIENT', { support: [], resistance: [] },
    { status: 'INSUFFICIENT', n: null, pct: null, sessions: null }, 'UNKNOWN']);
  const gapped = flatSeries(300, 100, 10);
  eq(MS.analyzeMarketStructure(gapped.candles, { asOf: gapped.asOf }).sufficiency.h1y, 'GAPPED');
});

// MS-T15 — determinism
test('MS-T15 two runs are byte-identical, and so is a shuffled copy of the input', function () {
  const a = JSON.stringify(MS.analyzeMarketStructure(WAVE, { asOf: ASOF_WAVE }));
  const b = JSON.stringify(MS.analyzeMarketStructure(WAVE, { asOf: ASOF_WAVE }));
  ok(a === b, 'two runs');
  const rnd = makeLcg(99);
  const shuffled = WAVE.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t; }
  ok(JSON.stringify(MS.analyzeMarketStructure(shuffled, { asOf: ASOF_WAVE })) === a, 'shuffled input');
  const before = JSON.stringify(WAVE);
  MS.analyzeMarketStructure(WAVE, { asOf: ASOF_WAVE });
  ok(JSON.stringify(WAVE) === before, 'input is not mutated');
});
test('PN MS-T15 a run-counter injected into the output breaks byte identity', function () {
  const mutant = mutate('basis: BASIS,', 'basis: BASIS + String(globalThis.__ms1_n = (globalThis.__ms1_n || 0) + 1),');
  const x = JSON.stringify(mutant.analyzeMarketStructure(WAVE, { asOf: ASOF_WAVE }));
  const y = JSON.stringify(mutant.analyzeMarketStructure(WAVE, { asOf: ASOF_WAVE }));
  delete globalThis.__ms1_n;
  ok(x !== y, 'mutant differs between runs');
});

// MS-T16 — isolation: the three files are byte-identical to the base. The base is the parent of the
// commit that introduced the module (stable after later tasks edit index.html). Git is queried once
// at load; the assertions only read the stored result.
const ISOLATED = ['index.html', 'netlify/functions/market-data.js', 'qa/run-offline.js'];
function gitOnce(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (r.error || r.status !== 0) throw new Error('git ' + args.join(' ') + ' failed: ' + (r.error ? r.error.message : r.stderr));
  return r.stdout.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
}
const GIT = (function () {
  try {
    const intro = gitOnce(['log', '--diff-filter=A', '--format=%H', '--', MODULE_REL]);
    const baseRef = intro.length ? intro[intro.length - 1] + '^' : 'HEAD';
    const headRef = intro.length ? intro[intro.length - 1] : 'HEAD';
    // Module not committed yet: compare the working tree with HEAD (only true while this task is open).
    const diffArgs = intro.length ? ['diff', '--name-only', baseRef, headRef, '--'] : ['diff', '--name-only', 'HEAD', '--'];
    return { error: null, changed: gitOnce(diffArgs.concat(ISOLATED)) };
  } catch (e) {
    return { error: e.message, changed: [] };
  }
})();
function isolationViolations(g) {
  return g.changed.map(function (f) { return 'changed vs base: ' + f; });
}
function wiringHits(text) { return /market-structure|analyzeMarketStructure/.test(text); }
// rev 1.2 (evidence-capture-1): index.html carries a byte-identical copy of services/evidence-memory.js
// (evidence_capture_offline CP-1 proves it) whose text mentions this module in a comment. Exactly that
// region is not scanned; everything else in index.html, comments included, still is. A missing,
// duplicated or misordered marker fails; it never falls back to scanning less.
const EM_OPEN = 'var PulseEvidenceMemory = (function (module) {\n';
const EM_CLOSE = 'return module.exports;\n})({ exports: {} });\n';
function indexScanText(rawHtml) {
  const text = rawHtml.replace(/\r\n/g, '\n');
  [['open', EM_OPEN], ['close', EM_CLOSE]].forEach(function (m) {
    const n = text.split(m[1]).length - 1;
    if (n !== 1) throw new Error('evidence-memory ' + m[0] + ' marker not found exactly once (found ' + n + ')');
  });
  const a = text.indexOf(EM_OPEN);
  const b = text.indexOf(EM_CLOSE);
  if (a > b) throw new Error('evidence-memory open marker is after the close marker');
  return text.slice(0, a) + text.slice(b + EM_CLOSE.length);
}
test('MS-T16 index.html, market-data.js and run-offline.js are byte-identical to the base and do not reference the module', function () {
  eq(GIT.error, null, 'git readable');
  eq(isolationViolations(GIT), []);
  ISOLATED.forEach(function (rel) {
    const body = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    ok(!wiringHits(rel === 'index.html' ? indexScanText(body) : body), rel + ' references the module');
  });
});
test('PN MS-T16 a changed isolated file, or a reference to the module, is reported', function () {
  eq(isolationViolations({ changed: [] }), [], 'positive control');
  ok(isolationViolations({ changed: ['index.html'] }).length === 1, 'changed');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(!wiringHits(indexScanText(html)) && wiringHits(indexScanText(html + "\nrequire('./services/market-structure.js');")), 'wiring scan bites');
});
test('PN MS-T16 AM-N1..N11 the exclusion covers only the verified S1 block and cannot widen or turn ambiguous', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
  ok(!wiringHits(indexScanText(html)), 'positive control: live text has no hit');
  function swap(text, anchor, replacement) { return text.split(anchor).join(replacement); }
  function hit(label, mutated) { ok(wiringHits(indexScanText(mutated)), label + ': a reference outside the region must be reported'); }
  function fails(label, mutated, re) {
    let msg = null;
    try { indexScanText(mutated); } catch (e) { msg = e.message; }
    ok(msg !== null && re.test(msg), label + ': must fail with ' + re + ' (got ' + msg + ')');
  }
  hit('AM-N1', swap(html, EM_OPEN, "require('./services/market-structure.js');\n" + EM_OPEN));
  hit('AM-N2', swap(html, EM_CLOSE, EM_CLOSE + 'analyzeMarketStructure(x);\n'));
  fails('AM-N3', swap(html, EM_OPEN, EM_OPEN + EM_OPEN), /open marker not found exactly once/);
  fails('AM-N4', swap(html, EM_OPEN, ''), /open marker not found exactly once/);
  fails('AM-N5', swap(html, EM_CLOSE, ''), /close marker not found exactly once/);
  fails('AM-N6', swap(swap(html, EM_OPEN, ''), EM_CLOSE, EM_CLOSE + EM_OPEN), /open marker is after the close marker/);
  fails('AM-N7', swap(html, EM_CLOSE, EM_CLOSE + EM_CLOSE), /close marker not found exactly once/);
  hit('AM-N8', swap(html, EM_OPEN, 'analyzeMarketStructure' + EM_OPEN));
  hit('AM-N9', swap(html, EM_CLOSE, EM_CLOSE + 'market-structure'));
  hit('AM-N10', swap(html, EM_CLOSE, EM_CLOSE + 'return module.exports;\n// market-structure\n'));
  hit('AM-N11', swap(html, EM_CLOSE, EM_CLOSE + '// see services/market-structure.js\n'));
});

// MS-T17 — non-forecast rule
const NF_RE = /target|expected|forecast|probability|likely/i;
function nfHits(value, trail, out) {
  if (Array.isArray(value)) value.forEach(function (v, i) { nfHits(v, trail + '[' + i + ']', out); });
  else if (value !== null && typeof value === 'object') {
    Object.keys(value).forEach(function (k) { if (NF_RE.test(k)) out.push(trail + '.' + k); nfHits(value[k], trail + '.' + k, out); });
  } else if (typeof value === 'string' && NF_RE.test(value)) out.push(trail + ' = ' + value);
  return out;
}
test('MS-T17 non-forecast: basis present, no target / expected / forecast / probability / likely in any key or string', function () {
  [[WAVE, ASOF_WAVE], [WALK, ASOF_WALK], [[], '2024-01-31']].forEach(function (c) {
    const out = MS.analyzeMarketStructure(c[0], { asOf: c[1] });
    eq(out.basis, 'HISTORICAL_DESCRIPTIVE');
    eq(nfHits(out, 'out', []), []);
  });
});
test('PN MS-T17 a stub adding expectedMove, and a string value containing likely, are both rejected', function () {
  const stub = mutate('basis: BASIS,', 'basis: BASIS, expectedMove: 0,');
  ok(nfHits(stub.analyzeMarketStructure(WAVE, { asOf: ASOF_WAVE }), 'out', []).length === 1, 'key flagged');
  const stub2 = mutate('basis: BASIS,', "basis: 'LIKELY_UP',");
  ok(nfHits(stub2.analyzeMarketStructure(WAVE, { asOf: ASOF_WAVE }), 'out', []).length === 1, 'value flagged');
  ['target', 'forecast', 'probability'].forEach(function (w) {
    ok(nfHits({ a: { [w + 'Price']: 1 } }, 'o', []).length === 1, w + ' key flagged');
  });
});

// ---- ROWS-END ----

const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
if (failed > 0) { process.exitCode = 1; }
