'use strict';

/*
 * qa/ath_auto_offline.js
 *
 * R-1 Slice B2-auto — the pure automatic-ATH functions (brief section 5.1, F-1..F-16):
 * deriveAuto (the D-A3 rule), applyRecentBars, applySplits / checkSplitConsistency /
 * completeSplitRederive, upgradeV1 and the Yahoo parser's unit / exchange-day handling.
 *
 * Offline only: fixtures, no network, no store, no environment. Every violable invariant carries a
 * planted negative whose mutation lands on the PRODUCTION source text (anchor proven to occur
 * exactly once), is paired with a positive control (the unmutated module passes the same
 * predicate) and must make the predicate RETURN false (a throw is a harness defect).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify', 'functions', 'lib');
const RECORD_PATH = path.join(LIB, 'ath-record.js');
const YAHOO_PATH = path.join(LIB, 'ath-yahoo.js');

const ath = require(RECORD_PATH);
const yahoo = require(YAHOO_PATH);

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
  if (!cond) { throw new Error(msg || 'assertion failed'); }
}

function loadMutated(file, mutations) {
  let src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  mutations.forEach(function (m) {
    if (src.split(m[0]).length !== 2) { throw new Error('MUTANT_ANCHOR_MISSING_OR_NOT_UNIQUE: ' + m[0]); }
    src = src.replace(m[0], m[1]);
  });
  const mod = { exports: {} };
  const localRequire = function (p) {
    return require(p.charAt(0) === '.' ? path.resolve(path.dirname(file), p) : p);
  };
  new Function('module', 'exports', 'require', src)(mod, mod.exports, localRequire);
  return mod.exports;
}

function killed(name, file, mutations, predicate, control) {
  test('PN ' + name + ' is killed', function () {
    ok(predicate(control) === true, 'positive control: the unmutated module must pass the predicate');
    const mutant = loadMutated(file, mutations);
    let survived;
    try { survived = predicate(mutant) === true; } catch (e) { throw new Error('predicate threw instead of returning false: ' + (e && e.message)); }
    ok(!survived, 'mutant survived: the predicate still passes');
  });
}

// ── fixtures ──────────────────────────────────────────────────────────────────
const NOW = '2026-10-08T12:00:00.000Z';

function bars(rows) {
  return rows.map(function (r) { return { date: r[0], open: r[1], high: r[2], close: r[3] }; });
}
function series(rows, over) {
  return Object.assign({ firstTradeDate: rows[0][0], bars: bars(rows), splits: [] }, over || {});
}
function autoRecord(over) {
  return Object.assign({
    schema: 'ath:v2', ticker: 'AAPL', providerSymbol: 'AAPL', currency: 'USD', unit: 'USD', basis: 'split-adjusted-no-dividend-adjust',
    status: 'verified', method: 'auto', athValue: 100, athDate: '2026-09-22', verifiedAt: '2026-09-23T10:00:00.000Z',
    evidence: {
      source: 'yahoo-daily', firstTradeDate: '1980-12-12', firstBarDate: '1980-12-12', barCount: 11000,
      matchedBar: { date: '2026-09-22', high: 100, open: 97, close: 99 }, rejectedBars: [], splitsSeen: [], reason: null
    },
    refresh: { status: 'none', lastAttemptAt: null, reason: null }, lastCheckedAt: '2026-10-01T10:00:00.000Z', splitCheckedThrough: '2026-10-01'
  }, over || {});
}
function operatorRecord(over) {
  const r = autoRecord(over);
  r.method = 'operator';
  r.evidence = {
    tradingViewHigh: 100, tradingViewFirstBarDate: '1980-12-01', tradingViewAdjSetting: 'off',
    matchedBar: { date: r.athDate, high: r.athValue }, toleranceUsed: 0.005,
    yahooBarCount: 11000, yahooFirstBarDate: '1980-12-12', higherBars: [], coverageGap: null, searchValue: null
  };
  r.splitCheckedThrough = null;
  return r;
}
function v1Record(over) {
  return Object.assign({
    schema: 'ath:v1', ticker: 'AAPL', providerSymbol: 'AAPL', tradingViewSymbol: 'NASDAQ:AAPL', currency: 'USD', unit: 'USD',
    basis: 'split-adjusted-no-dividend-adjust', status: 'verified', athValue: 100, athDate: '2026-09-22', verifiedAt: '2026-09-23T10:00:00.000Z',
    verifiedBy: 'operator',
    evidence: {
      tradingViewHigh: 100, tradingViewFirstBarDate: '1980-12-01', tradingViewAdjSetting: 'off',
      matchedBar: { date: '2026-09-22', high: 100 }, toleranceUsed: 0.005,
      yahooBarCount: 11000, yahooFirstBarDate: '1980-12-12', higherBars: [], coverageGap: null, searchValue: null
    },
    refresh: { status: 'none', lastAttemptAt: null, reason: null }, pending: null, lastCheckedAt: '2026-09-23T10:00:00.000Z'
  }, over || {});
}

// ── predicates (positive on the real module, false on a mutant) ───────────────
function pF1(m) {
  const rows = [];
  for (let i = 0; i < 40; i++) {
    const d = new Date(Date.UTC(1999, 0, 22 + i * 30)).toISOString().slice(0, 10);
    const high = 10 + i * 3 + (i === 33 ? 40 : 0);
    rows.push([d, high - 2, high, high - 1]);
  }
  const splits = [['2000-06-27', 2], ['2001-09-12', 2], ['2006-04-07', 2], ['2007-09-11', 1.5], ['2021-07-20', 4], ['2024-06-10', 10]]
    .map(function (s) { return { date: s[0], ratio: s[1] }; });
  const d = m.deriveAuto(series(rows, { splits: splits }), NOW);
  const top = rows.reduce(function (a, r) { return r[2] > a[2] ? r : a; });
  return d.status === 'verified' && d.athValue === top[2] && d.athDate === top[0] && d.evidence.splitsSeen.length === 6 &&
    d.evidence.matchedBar.date === top[0] && d.evidence.barCount === 40 && d.evidence.source === 'yahoo-daily';
}

function pF2(m) {
  const d = m.deriveAuto(series([
    ['2002-08-12', 1000, 1100, 1050],
    ['2007-07-30', 1400, 5720013, 1370],
    ['2007-07-31', 1400, 3800003.5, 1400],
    ['2021-11-11', 14000, 15240, 15000],
    ['2026-10-06', 9000, 9500, 9100]
  ]), NOW);
  return d.status === 'verified' && d.athValue === 15240 && d.athDate === '2021-11-11' && d.evidence.rejectedBars.length === 2 &&
    d.evidence.rejectedBars.every(function (r) { return r.reason === 'SUSPECT_SPIKE'; });
}

function pF3(m) {
  const rows = [['2002-08-12', 100, 110, 105]];
  for (let i = 0; i < 5; i++) { rows.push(['2005-0' + (i + 1) + '-10', 100, 1000 + i, 105]); } // 2 x body 105 = 210 <= A
  rows.push(['2021-11-11', 14000, 15240, 15000]);
  const d = m.deriveAuto(series(rows), NOW);
  return d.status === 'verified' && d.athValue === 15240 && d.evidence.rejectedBars.length === 5;
}

function pF4(m) {
  const d = m.deriveAuto(series([
    ['2002-08-12', 1000, 1100, 1050],
    ['2010-03-01', 9000, 50000, 8000],
    ['2021-11-11', 14000, 15000, 14500]
  ]), NOW);
  return d.status === 'unresolved' && d.reason === 'SUSPECT_MATERIAL' && d.athValue === null && d.evidence.reason === 'SUSPECT_MATERIAL';
}

function pF5(m) {
  const above = m.deriveAuto(series([
    ['2002-08-12', 100, 110, 105], ['2010-03-01', null, 20000, null], ['2021-11-11', 14000, 15000, 14500]
  ]), NOW);
  const below = m.deriveAuto(series([
    ['2002-08-12', 100, 110, 105], ['2010-03-01', null, 12000, null], ['2021-11-11', 14000, 15000, 14500]
  ]), NOW);
  return above.status === 'unresolved' && above.reason === 'SUSPECT_MATERIAL' &&
    below.status === 'verified' && below.athValue === 15000 && below.evidence.rejectedBars.length === 1 && below.evidence.rejectedBars[0].reason === 'UNASSESSABLE';
}

function pF6(m) {
  const d = m.deriveAuto(series([
    ['2002-08-12', 10, 100, 11], ['2005-01-03', null, 90, null], ['2010-03-01', 5, 500, 6]
  ]), NOW);
  return d.status === 'unresolved' && d.reason === 'NO_RELIABLE_ATH' && d.athValue === null && d.evidence.rejectedBars.length === 3;
}

function pF7Accept(m) {
  const exact = m.deriveAuto(series([['2002-08-12', 100, 200, 100], ['2005-01-03', 10, 20, 10]]), NOW);
  const over = m.deriveAuto(series([['2002-08-12', 100, 200.01, 100], ['2005-01-03', 10, 20, 10]]), NOW);
  // high = 2 x body is accepted (becomes the ATH); 2.0001 x body is suspect (rejected; ATH stays 20)
  return exact.status === 'verified' && exact.athValue === 200 && over.evidence.rejectedBars.length === 1 &&
    over.evidence.rejectedBars[0].reason === 'SUSPECT_SPIKE' && over.status === 'unresolved' && over.reason === 'SUSPECT_MATERIAL';
}
function pF7Material(m) {
  // the second bar's body is 100, so 2 x body = 200 = A exactly: not material (strict), recorded and ignored
  const base = m.deriveAuto(series([['2002-08-12', 100, 200, 100], ['2005-01-03', 30, 5000, 100]]), NOW);
  return base.status === 'verified' && base.athValue === 200 && base.evidence.rejectedBars.length === 1;
}
function pF7Unassessable(m) {
  // unassessable bar with high exactly = A: not material (strict)
  const d = m.deriveAuto(series([['2002-08-12', 100, 200, 100], ['2005-01-03', null, 200, null]]), NOW);
  return d.status === 'verified' && d.athValue === 200 && d.evidence.rejectedBars.length === 1 && d.evidence.rejectedBars[0].reason === 'UNASSESSABLE';
}

function pF8(m) {
  const rows = [['2002-10-21', 100, 110, 105], ['2021-11-11', 14000, 15000, 14500]];
  const late = m.deriveAuto({ firstTradeDate: '2002-08-12', bars: bars(rows), splits: [] }, NOW); // 70 days
  const edge = m.deriveAuto({ firstTradeDate: '2002-08-20', bars: bars(rows), splits: [] }, NOW); // 62 days
  const edge63 = m.deriveAuto({ firstTradeDate: '2002-08-19', bars: bars(rows), splits: [] }, NOW); // 63 days
  return late.status === 'unresolved' && late.reason === 'COVERAGE' && edge.status === 'verified' && edge63.reason === 'COVERAGE';
}

function pF9(m) {
  const rec = autoRecord();
  const out = m.applyRecentBars(rec, { bars: bars([['2026-09-20', 90, 95, 94], ['2026-09-30', 101, 103, 102], ['2026-10-02', 100, 101, 100]]) }, NOW);
  return out.action === 'raised' && out.record.athValue === 103 && out.record.athDate === '2026-09-30' && out.record.method === 'auto' &&
    out.record.evidence.matchedBar.high === 103 && out.record.lastCheckedAt === NOW && out.record.splitCheckedThrough === '2026-10-07' &&
    out.record.verifiedAt === rec.verifiedAt && out.record.evidence.firstTradeDate === rec.evidence.firstTradeDate && out.record.status === 'verified' &&
    out.record.refresh.status === 'none' && m.validateRecordV2(out.record).ok === true &&
    // a lower recent bar leaves the value; bars on or before athDate are ignored
    m.applyRecentBars(rec, { bars: bars([['2026-09-22', 100, 400, 100], ['2026-10-01', 90, 99, 98]]) }, NOW).record.athValue === 100;
}

function pF10(m) {
  const rec = autoRecord();
  const out = m.applyRecentBars(rec, { bars: bars([['2026-10-02', 60, 400, 50]]) }, NOW);
  return out.record.athValue === 100 && out.record.status === 'verified' && out.record.refresh.status === 'unresolved' &&
    out.record.refresh.reason === 'SUSPECT_MATERIAL' && out.record.lastCheckedAt === NOW && m.validateRecordV2(out.record).ok === true &&
    // a non-material suspect bar (2 x 40 = 80 <= 100) is only recorded
    m.applyRecentBars(rec, { bars: bars([['2026-10-02', 40, 400, 40]]) }, NOW).record.refresh.status === 'none';
}

function preSplitRecord() {
  return autoRecord({
    athValue: 1000, athDate: '2025-01-10', verifiedAt: '2025-06-01T10:00:00.000Z', lastCheckedAt: '2025-06-01T10:00:00.000Z', splitCheckedThrough: '2025-06-01',
    evidence: Object.assign(autoRecord().evidence, { matchedBar: { date: '2025-01-10', high: 1000, open: 990, close: 995 } })
  });
}

function pF11(m) {
  const rec = preSplitRecord();
  const sp = m.applySplits(rec, [{ date: '2025-09-10', ratio: 10 }], NOW);
  if (!(sp.triggered && sp.rederive && sp.record.status === 'stale-suspect' && sp.record.athValue === 1000)) { return false; }
  const good = m.completeSplitRederive(sp.record, {
    status: 'verified', reason: null, athValue: 100.2, athDate: '2025-01-10',
    evidence: { source: 'yahoo-daily', firstTradeDate: '1980-12-12', firstBarDate: '1980-12-12', barCount: 11200, matchedBar: { date: '2025-01-10', high: 100.2, open: 99, close: 100 }, rejectedBars: [], splitsSeen: [{ date: '2025-09-10', ratio: 10 }], reason: null }
  }, sp.splits, NOW);
  const bad = m.completeSplitRederive(sp.record, {
    status: 'verified', reason: null, athValue: 150, athDate: '2025-01-10',
    evidence: { source: 'yahoo-daily', firstTradeDate: '1980-12-12', firstBarDate: '1980-12-12', barCount: 11200, matchedBar: { date: '2025-01-10', high: 150, open: 99, close: 100 }, rejectedBars: [], splitsSeen: [], reason: null }
  }, sp.splits, NOW);
  return good.status === 'verified' && good.athValue === 100.2 && good.method === 'auto' && m.validateRecordV2(good).ok === true &&
    bad.status === 'stale-suspect' && bad.refresh.reason === 'SPLIT_INCONSISTENT';
}

function pF12(m) {
  const rec = preSplitRecord();
  const sp = m.applySplits(rec, [{ date: '2025-09-10', ratio: 10 }], NOW);
  const derived120 = {
    status: 'verified', reason: null, athValue: 120, athDate: '2025-05-05',
    evidence: { source: 'yahoo-daily', firstTradeDate: '1980-12-12', firstBarDate: '1980-12-12', barCount: 11200, matchedBar: { date: '2025-05-05', high: 120, open: 99, close: 100 }, rejectedBars: [], splitsSeen: [], reason: null }
  };
  const out = m.completeSplitRederive(sp.record, derived120, sp.splits, NOW);
  // dated AFTER the split the value is accepted whatever it is
  const after = m.completeSplitRederive(sp.record, Object.assign({}, derived120, { athDate: '2025-10-01', evidence: Object.assign({}, derived120.evidence, { matchedBar: { date: '2025-10-01', high: 120, open: 99, close: 100 } }) }), sp.splits, NOW);
  return out.status === 'stale-suspect' && out.refresh.status === 'unresolved' && out.refresh.reason === 'SPLIT_INCONSISTENT' && out.athValue === 1000 &&
    after.status === 'verified' && after.athValue === 120 &&
    m.checkSplitConsistency(1000, 100.4, '2025-01-10', [{ date: '2025-09-10', ratio: 10 }]) === true &&
    m.checkSplitConsistency(1000, 100.6, '2025-01-10', [{ date: '2025-09-10', ratio: 10 }]) === false;
}

function pF13(m) {
  const rec = operatorRecord({ athValue: 1000, athDate: '2025-01-10', verifiedAt: '2025-06-01T10:00:00.000Z' });
  rec.evidence.matchedBar = { date: '2025-01-10', high: 1000 };
  const sp = m.applySplits(rec, [{ date: '2025-09-10', ratio: 10 }], NOW);
  return sp.triggered === true && sp.rederive === false && sp.record.status === 'stale-suspect' && sp.record.method === 'operator' &&
    sp.record.athValue === 1000 && sp.record.refresh.status === 'unresolved' && sp.record.refresh.reason === 'SPLIT_NEEDS_RECOVERY' &&
    m.validateRecordV2(sp.record).ok === true &&
    // a split already checked (on or before splitCheckedThrough / verifiedAt) does not trigger
    m.applySplits(autoRecord({ splitCheckedThrough: '2026-10-01' }), [{ date: '2026-09-30', ratio: 2 }], NOW).triggered === false &&
    m.applySplits(operatorRecord({ verifiedAt: '2026-09-23T10:00:00.000Z' }), [{ date: '2026-09-23', ratio: 2 }], NOW).triggered === false &&
    m.applySplits(operatorRecord({ verifiedAt: '2026-09-23T10:00:00.000Z' }), [{ date: '2026-09-24', ratio: 2 }], NOW).triggered === true;
}

function pF14(m) {
  const rec = operatorRecord();
  const out = m.applyRecentBars(rec, { bars: bars([['2026-10-02', 101, 104, 103]]) }, NOW);
  return out.action === 'raised' && out.record.method === 'operator' && out.record.athValue === 104 && out.record.athDate === '2026-10-02' &&
    Array.isArray(out.record.evidence.autoRaise) && out.record.evidence.autoRaise.length === 1 && out.record.evidence.autoRaise[0].high === 104 &&
    out.record.evidence.tradingViewHigh === 100 && out.record.verifiedAt === rec.verifiedAt && m.validateRecordV2(out.record).ok === true;
}

function pF15(m) {
  const variants = [
    v1Record(),
    v1Record({ status: 'stale-suspect' }),
    (function () { const r = v1Record({ status: 'unresolved', athValue: null, athDate: null, verifiedAt: null, verifiedBy: null }); r.evidence.matchedBar = null; return r; }()),
    v1Record({ refresh: { status: 'unresolved', lastAttemptAt: '2026-10-01T00:00:00.000Z', reason: 'NO_CLEAN_MATCH' } })
  ];
  return variants.every(function (v) {
    const u = m.upgradeV1(v);
    return u !== null && u.method === 'operator' && u.schema === 'ath:v2' && u.status === v.status && u.splitCheckedThrough === null &&
      JSON.stringify(u.evidence) === JSON.stringify(v.evidence) && m.validateRecordV2(u).ok === true &&
      u.athValue === v.athValue && u.athDate === v.athDate && u.lastCheckedAt === v.lastCheckedAt && u.verifiedAt === v.verifiedAt;
  });
}

// ── F-rows ────────────────────────────────────────────────────────────────────
test('F-1 NVDA-like (6 splits, clean bars): verified at the maximum high, exact day, splitsSeen = 6', function () { ok(pF1(ath), 'F-1'); });
test('F-2 MTRX-like: two 2007 spikes rejected as SUSPECT_SPIKE and not material; the later genuine high wins', function () { ok(pF2(ath), 'F-2'); });
test('F-3 five old irrelevant suspect bars: verified (no count cap)', function () { ok(pF3(ath), 'F-3'); });
test('F-4 a material suspect bar (2 x body 9,000 > A 15,000) is unresolved / SUSPECT_MATERIAL', function () { ok(pF4(ath), 'F-4'); });
test('F-5 an unassessable bar above A is unresolved / SUSPECT_MATERIAL; at or below A it is recorded and ignored', function () { ok(pF5(ath), 'F-5'); });
test('F-6 every bar suspect or unassessable: unresolved / NO_RELIABLE_ATH', function () { ok(pF6(ath), 'F-6'); });
test('F-7 strict boundaries: high = 2 x body accepted; 2.0001 x body suspect; 2 x body = A not material; unassessable high = A not material', function () {
  ok(pF7Accept(ath), 'F-7 accepted / suspect');
  ok(pF7Material(ath), 'F-7 2 x body = A');
  ok(pF7Unassessable(ath), 'F-7 unassessable high = A');
});
test('F-8 coverage: a first bar more than 62 days after firstTradeDate is unresolved / COVERAGE (62 days is covered)', function () { ok(pF8(ath), 'F-8'); });
test('F-9 incremental: a later accepted higher bar raises the value to its exact day; method, verifiedAt and coverage are unchanged', function () { ok(pF9(ath), 'F-9'); });
test('F-10 incremental: a later material suspect bar keeps the value and flags SUSPECT_MATERIAL', function () { ok(pF10(ath), 'F-10'); });
test('F-11 a 10:1 split on an auto record: stale-suspect, then a consistent re-derive (100.2) is verified', function () { ok(pF11(ath), 'F-11'); });
test('F-12 the same split with an inconsistent re-derive (120, dated before the split) stays stale-suspect / SPLIT_INCONSISTENT', function () { ok(pF12(ath), 'F-12'); });
test('F-13 a split on an operator record: stale-suspect / SPLIT_NEEDS_RECOVERY and no automatic re-derive', function () { ok(pF13(ath), 'F-13'); });
test('F-14 an operator record is raised incrementally and stays operator (autoRaise evidence)', function () { ok(pF14(ath), 'F-14'); });
test('F-15 upgradeV1: every v1 record becomes a valid v2 operator record with its evidence unchanged', function () { ok(pF15(ath), 'F-15'); });

// F-16: unit and exchange-day conversion (the Yahoo parser).
function chartBody(over) {
  const o = over || {};
  return {
    chart: {
      result: [{
        meta: Object.assign({ currency: 'USD', symbol: 'NVDA', exchangeTimezoneName: 'America/New_York', firstTradeDate: 917015400 }, o.meta || {}),
        timestamp: o.timestamp || [1759858200, 1759944600],
        indicators: { quote: [o.quote || { open: [100, 101], high: [105, 106], low: [99, 100], close: [104, 105] }] },
        events: o.events
      }]
    }
  };
}
function pF16(y) {
  // Asia/Jerusalem (UTC+3 in early October): 23:30Z on Oct 6 is already Oct 7 locally; UTC would say Oct 6.
  const il = y.parseChart(chartBody({
    meta: { currency: 'ILA', exchangeTimezoneName: 'Asia/Jerusalem', firstTradeDate: Date.parse('2006-01-02T07:00:00Z') / 1000 },
    timestamp: [Date.parse('2026-10-06T23:30:00Z') / 1000, Date.parse('2026-10-08T07:00:00Z') / 1000],
    quote: { open: [15000, 15100], high: [15240, 15300], low: [14900, 15000], close: [15200, 15250] }
  }), 'MTRX.TA');
  const ny = y.parseChart(chartBody({
    timestamp: [Date.parse('2026-10-07T02:30:00Z') / 1000, Date.parse('2026-10-07T13:30:00Z') / 1000],
    quote: { open: [100, 101], high: [105, 106], low: [99, 100], close: [104, 105] }
  }), 'NVDA');
  return il.ok === true && il.unit === 'ILA' && il.currency === 'ILS' && il.bars[0].date === '2026-10-07' && il.bars[1].date === '2026-10-08' &&
    il.firstTradeDate === '2006-01-02' &&
    ny.ok === true && ny.unit === 'USD' && ny.bars.length === 2 && ny.bars[0].date === '2026-10-06' && ny.bars[1].date === '2026-10-07';
}
test('F-16 ILA unit for .TA and exchange-day (not UTC-day) conversion', function () {
  ok(pF16(yahoo), 'F-16');
  ok(yahoo.parseChart(chartBody({ meta: { currency: 'ILS' } }), 'MTRX.TA').reason === 'UNSUPPORTED', '.TA must report ILA');
  ok(yahoo.parseChart(chartBody({ meta: { currency: 'EUR' } }), 'NVDA').reason === 'UNSUPPORTED', 'a non-USD US ticker is unsupported');
});

// Parser rules around the required fields.
test('F-17 the parser requires currency, firstTradeDate and aligned arrays; skips bars with no high; reads splits as numerator / denominator', function () {
  const base = chartBody({ events: { splits: { 1: { date: 1718026200, numerator: 10, denominator: 1, splitRatio: '10:1' }, 2: { date: 1597930200, numerator: 4, denominator: 1 } } } });
  const good = yahoo.parseChart(base, 'NVDA');
  ok(good.ok === true && good.splits.length === 2 && good.splits[0].ratio === 4 && good.splits[1].ratio === 10 && good.splits[0].date < good.splits[1].date, 'splits sorted, ratio = numerator / denominator');
  const noCur = chartBody(); delete noCur.chart.result[0].meta.currency;
  ok(yahoo.parseChart(noCur, 'NVDA').reason === 'BODY_INVALID', 'currency required');
  const noFtd = chartBody(); delete noFtd.chart.result[0].meta.firstTradeDate;
  ok(yahoo.parseChart(noFtd, 'NVDA').reason === 'BODY_INVALID', 'firstTradeDate required');
  const misaligned = chartBody({ quote: { open: [1], high: [2, 3], low: [1, 1], close: [1, 1] } });
  ok(yahoo.parseChart(misaligned, 'NVDA').reason === 'BODY_INVALID', 'aligned arrays required');
  const noHigh = chartBody({ quote: { open: [100, 101], high: [null, 106], low: [99, 100], close: [104, 105] } });
  const r = yahoo.parseChart(noHigh, 'NVDA');
  ok(r.ok === true && r.bars.length === 1 && r.bars[0].high === 106, 'a bar with no high is skipped');
  ok(yahoo.parseChart({}, 'NVDA').reason === 'BODY_INVALID' && yahoo.parseChart(null, 'NVDA').reason === 'BODY_INVALID', 'garbage body');
  ok(yahoo.parseChart(chartBody({ events: { splits: { 1: { date: 1, numerator: 0, denominator: 1 } } } }), 'NVDA').reason === 'BODY_INVALID', 'a degenerate split is a bad body');
  ok(yahoo.parseChart(base, 'nvda').reason === 'BODY_INVALID', 'ticker shape enforced');
  const nullOpen = chartBody({ quote: { open: [null, 101], high: [105, 106], low: [99, 100], close: [null, 105] } });
  const n = yahoo.parseChart(nullOpen, 'NVDA');
  ok(n.bars[0].open === null && n.bars[0].close === null && n.bars[0].high === 105, 'null open / close kept for the unassessable rule');
});

const asyncDone = [];
function asyncTest(name, fn) {
  asyncDone.push(fn().then(function () { passed += 1; }, function (e) {
    failed += 1;
    process.stdout.write('  FAIL  ' + name + '\n        ' + (e && e.message ? e.message : e) + '\n');
  }));
}

asyncTest('F-18 fetchChart: one request, the documented URL and a signal; failures map to FETCH_FAILED / BODY_INVALID; nothing is derived', async function () {
  const calls = [];
  const okFetch = async function (url, opts) { calls.push({ url: url, opts: opts }); return { ok: true, json: async function () { return chartBody(); } }; };
  const r = await yahoo.fetchChart('NVDA', { fetchImpl: okFetch, nowMs: Date.parse(NOW) });
  ok(r.ok === true && calls.length === 1, 'one request');
  ok(calls[0].url === 'https://query1.finance.yahoo.com/v8/finance/chart/NVDA?interval=1d&period1=0&period2=' + Math.floor(Date.parse(NOW) / 1000) + '&events=split', 'url: ' + calls[0].url);
  ok(calls[0].opts.signal && typeof calls[0].opts.signal.aborted === 'boolean' && yahoo.TIMEOUT_MS === 12000, '12 s abort signal');
  await yahoo.fetchChart('MTRX.TA', { fetchImpl: okFetch, nowMs: Date.parse(NOW), period1: 1234 });
  ok(calls[1].url.indexOf('/MTRX.TA?interval=1d&period1=1234&') !== -1, 'recent period1');
  const bad = await yahoo.fetchChart('NVDA', { fetchImpl: async function () { throw new Error('net'); }, nowMs: 1 });
  ok(bad.ok === false && bad.reason === 'FETCH_FAILED', 'network error');
  const http = await yahoo.fetchChart('NVDA', { fetchImpl: async function () { return { ok: false, status: 429 }; }, nowMs: 1 });
  ok(http.reason === 'FETCH_FAILED', 'http error');
  const json = await yahoo.fetchChart('NVDA', { fetchImpl: async function () { return { ok: true, json: async function () { throw new Error('x'); } }; }, nowMs: 1 });
  ok(json.reason === 'BODY_INVALID', 'invalid json');
  const empty = await yahoo.fetchChart('NVDA', { fetchImpl: async function () { return { ok: true, json: async function () { return {}; } }; }, nowMs: 1 });
  ok(empty.reason === 'BODY_INVALID', 'empty body');
  ok((await yahoo.fetchChart('nvda', { fetchImpl: okFetch, nowMs: 1 })).ok === false && calls.length === 2, 'an invalid ticker never reaches the network');
});

// Additional pure-rule rows the brief implies.
test('F-19 ties go to the earliest date; ATH day and value come from the same bar; rejectedBars are capped at 500 without changing the decision', function () {
  const tie = ath.deriveAuto(series([['2002-08-12', 100, 150, 140], ['2010-01-04', 100, 150, 140], ['2012-01-04', 100, 120, 110]]), NOW);
  ok(tie.athValue === 150 && tie.athDate === '2002-08-12', 'earliest tie');
  const manySuspect = [['2002-08-12', 100, 110, 105]];
  for (let i = 0; i < 600; i++) { manySuspect.push([new Date(Date.UTC(2003, 0, 1 + i)).toISOString().slice(0, 10), 1, 50 + (i % 7), 1]); }
  manySuspect.push(['2021-11-11', 14000, 15000, 14500]);
  const big = ath.deriveAuto(series(manySuspect), NOW);
  ok(big.status === 'verified' && big.athValue === 15000 && big.evidence.rejectedBars.length === 500, 'cap on the evidence only: ' + big.evidence.rejectedBars.length);
  ok(ath.validateRecordV2(ath.buildAutoRecord({ ticker: 'AAPL', currency: 'USD', unit: 'USD' }, big, NOW)).ok === true, 'the capped record validates');
});

test('F-20 deriveAuto/applyRecentBars/applySplits never mutate their inputs', function () {
  const s = series([['2002-08-12', 100, 110, 105], ['2021-11-11', 14000, 15000, 14500]]);
  const before = JSON.stringify(s);
  ath.deriveAuto(s, NOW);
  ok(JSON.stringify(s) === before, 'series unchanged');
  const rec = autoRecord(); const rb = JSON.stringify(rec);
  ath.applyRecentBars(rec, { bars: bars([['2026-10-02', 101, 104, 103]]) }, NOW);
  ath.applySplits(rec, [{ date: '2026-10-05', ratio: 2 }], NOW);
  ok(JSON.stringify(rec) === rb, 'record unchanged');
});

test('F-21 recordFetchFailure: an existing record keeps its value; no record yields an unresolved auto record carrying the reason', function () {
  const rec = autoRecord();
  const kept = ath.recordFetchFailure(rec, null, 'FETCH_FAILED', NOW);
  ok(kept.status === 'verified' && kept.athValue === 100 && kept.refresh.status === 'unresolved' && kept.refresh.reason === 'FETCH_FAILED' && kept.lastCheckedAt === NOW, 'value kept');
  const fresh = ath.recordFetchFailure(null, { ticker: 'MTRX.TA', currency: 'ILS', unit: 'ILA' }, 'BODY_INVALID', NOW);
  ok(fresh.status === 'unresolved' && fresh.method === 'auto' && fresh.athValue === null && fresh.refresh.reason === 'BODY_INVALID' && ath.validateRecordV2(fresh).ok === true, 'unresolved auto');
});

// A split dated the same day as a check must still be seen by the next check, and a split already
// recorded in an auto record's splitsSeen must never trigger again.
function pF22(m) {
  const rec = autoRecord({ lastCheckedAt: '2026-10-08T06:00:00.000Z', splitCheckedThrough: '2026-10-07' });
  const sameDay = m.applySplits(rec, [{ date: '2026-10-08', ratio: 2 }], NOW);
  const done = autoRecord({ lastCheckedAt: '2026-10-08T06:00:00.000Z', splitCheckedThrough: '2026-10-07' });
  done.evidence.splitsSeen = [{ date: '2026-10-08', ratio: 2 }];
  const again = m.applySplits(done, [{ date: '2026-10-08', ratio: 2 }], NOW);
  const checked = m.applyRecentBars(rec, { bars: [] }, NOW).record;
  return sameDay.triggered === true && again.triggered === false && checked.splitCheckedThrough === '2026-10-07' &&
    m.buildAutoRecord({ ticker: 'AAPL', currency: 'USD', unit: 'USD' }, m.deriveAuto(series([['2002-08-12', 100, 110, 105]]), NOW), NOW).splitCheckedThrough === '2026-10-07';
}
test('F-22 splitCheckedThrough is the day before the check (a same-day split is seen next time); a split in evidence.splitsSeen never re-triggers', function () { ok(pF22(ath), 'F-22'); });

// ── planted negatives (production source) ─────────────────────────────────────
killed('F-22 splitCheckedThrough is the check day itself (a same-day split would be missed)', RECORD_PATH,
  [['function checkedThrough(nowIso) { return new Date(Date.parse(isoDayOf(nowIso) + \'T00:00:00Z\') - 86400000).toISOString().slice(0, 10); }', 'function checkedThrough(nowIso) { return isoDayOf(nowIso); }']], pF22, ath);
killed('F-22 a split already in splitsSeen re-triggers', RECORD_PATH,
  [[' && !seen.has(s.date); });', '; });']], pF22, ath);
const BEST_FROM_REJECTED = [['    } else {\n      rejected.push(c);\n    }', '    } else {\n      rejected.push(c);\n      if (best === null || c.high > best.high) { best = c; }\n    }']];
killed('F-1 the maximum is taken over all bars, suspect included', RECORD_PATH, BEST_FROM_REJECTED, pF2, ath);
killed('F-2 spikes are treated as material (materiality by the spike high)', RECORD_PATH,
  [['return SUSPECT_FACTOR * rejectedBar.body > athCandidate;', 'return rejectedBar.high > athCandidate;']], pF2, ath);
killed('F-3 a "more than two rejected bars" cap is reintroduced', RECORD_PATH,
  [['  const A = cls.best.high;', '  const A = cls.best.high;\n  if (cls.rejected.length > 2) { return unresolved(\'SUSPECT_MATERIAL\', { rejectedBars: rejectedBars }); }']], pF3, ath);
killed('F-4 materiality ignores the body (a material spike never blocks)', RECORD_PATH,
  [['return SUSPECT_FACTOR * rejectedBar.body > athCandidate;', 'return false;']], pF4, ath);
killed('F-5 an unassessable bar is treated as accepted', RECORD_PATH,
  [['out.cls = \'unassessable\'; out.body = null; return out;', 'out.cls = \'accepted\'; out.body = 0; return out;']], pF5, ath);
killed('F-6 A is computed from rejected bars', RECORD_PATH, BEST_FROM_REJECTED, pF6, ath);
killed('F-7 the 2 x body acceptance uses >= instead of >', RECORD_PATH,
  [['out.cls = bar.high > SUSPECT_FACTOR * out.body ? \'suspect\' : \'accepted\';', 'out.cls = bar.high >= SUSPECT_FACTOR * out.body ? \'suspect\' : \'accepted\';']], pF7Accept, ath);
killed('F-7 materiality of a suspect bar uses >= instead of >', RECORD_PATH,
  [['return SUSPECT_FACTOR * rejectedBar.body > athCandidate;', 'return SUSPECT_FACTOR * rejectedBar.body >= athCandidate;']], pF7Material, ath);
killed('F-7 materiality of an unassessable bar uses >= instead of >', RECORD_PATH,
  [['if (rejectedBar.cls === \'unassessable\') { return rejectedBar.high > athCandidate; }', 'if (rejectedBar.cls === \'unassessable\') { return rejectedBar.high >= athCandidate; }']], pF7Unassessable, ath);
killed('F-8 the coverage check is skipped', RECORD_PATH,
  [['if (dayDiff(base.firstBarDate, base.firstTradeDate) > COVERAGE_DAYS) { return unresolved(\'COVERAGE\'); }', 'if (false) { return unresolved(\'COVERAGE\'); }']], pF8, ath);
killed('F-9 the raised value is not stored', RECORD_PATH,
  [['    next.athValue = B.high;\n    next.athDate = B.date;', '    next.athDate = B.date;']], pF9, ath);
killed('F-10 a material suspect bar makes the record unresolved', RECORD_PATH,
  [['reason: \'SUSPECT_MATERIAL\' };', 'reason: \'SUSPECT_MATERIAL\' };\n    next.status = \'unresolved\';']], pF10, ath);
killed('F-11 / F-12 the split inconsistency is ignored', RECORD_PATH,
  [['  const list = normSplits(splits);\n  if (list.length === 0 || !isPositive(oldValue) || !isPositive(newValue)) { return false; }', '  const list = normSplits(splits);\n  return true;']], pF12, ath);
killed('F-11 the inconsistency is ignored (accepts any re-derive)', RECORD_PATH,
  [['  const list = normSplits(splits);\n  if (list.length === 0 || !isPositive(oldValue) || !isPositive(newValue)) { return false; }', '  const list = normSplits(splits);\n  return true;']], pF11, ath);
killed('F-12 a re-derive dated before the split is accepted without the ratio test', RECORD_PATH,
  [['if (isIsoDay(newDate) && newDate > lastDate) { return true; }', 'if (isIsoDay(newDate)) { return true; }']], pF12, ath);
killed('F-13 an operator record is automatically re-derived after a split', RECORD_PATH,
  [['rederive: next.method === \'auto\' };', 'rederive: true };']], pF13, ath);
killed('F-14 a raised operator record is flipped to auto (replaced by an automatic derive)', RECORD_PATH,
  [['next.evidence.autoRaise = prior.concat([bar]).slice(-MAX_AUTO_RAISES);', 'next.evidence.autoRaise = prior.concat([bar]).slice(-MAX_AUTO_RAISES);\n      next.method = \'auto\';']], pF14, ath);
killed('F-15 a v1 record is upgraded as auto', RECORD_PATH,
  [['    method: \'operator\',\n    athValue: rec.athValue,', '    method: \'auto\',\n    athValue: rec.athValue,']], pF15, ath);
killed('F-16 the UTC day is used instead of the exchange day', YAHOO_PATH,
  [['const s = fmt.format(new Date(epochSeconds * 1000));', 'const s = new Date(epochSeconds * 1000).toISOString().slice(0, 10);']], pF16, yahoo);
killed('F-16 the .TA unit is not ILA', YAHOO_PATH,
  [['return metaCurrency === \'ILA\' ? { currency: \'ILS\', unit: \'ILA\' } : null;', 'return { currency: \'ILS\', unit: \'ILS\' };']], pF16, yahoo);

Promise.all(asyncDone).then(function () {
  const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
  if (failed > 0) { process.exitCode = 1; }
});
