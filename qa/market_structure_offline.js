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

// ---- ROWS-END ----

const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
if (failed > 0) { process.exitCode = 1; }
