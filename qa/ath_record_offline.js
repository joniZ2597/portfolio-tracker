'use strict';

/*
 * qa/ath_record_offline.js
 *
 * R-1 Slice B (B1) — verified ATH record schema + pure comparison (AR-1, AR-2).
 *
 *   AR-1  ath:v1 record schema: exact key sets, vocabularies, units, no override field.
 *   AR-2  compareToVerifiedAth: unavailable / below / near (2%) / at_or_above, and no
 *         1Y High input path.
 *
 * Offline only: no network, no store, no environment reads. The real production module is
 * exercised; each violable invariant has a planted negative whose mutation lands on the
 * production source text (anchored string replacement, executed in-process) and must make
 * the matching predicate fail.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RECORD_PATH = path.join(ROOT, 'netlify', 'functions', 'lib', 'ath-record.js');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failed += 1;
    failures.push(name);
    process.stdout.write('  FAIL  ' + name + '\n        ' + (e && e.message ? e.message : e) + '\n');
  }
}

function ok(cond, msg) {
  if (!cond) { throw new Error(msg || 'assertion failed'); }
}

function loadMutated(file, mutations) {
  let src = fs.readFileSync(file, 'utf8');
  mutations.forEach(function (m) {
    if (src.indexOf(m[0]) === -1) { throw new Error('MUTANT_ANCHOR_MISSING: ' + m[0]); }
    src = src.replace(m[0], m[1]);
  });
  const mod = { exports: {} };
  const localRequire = function (p) {
    return require(p.charAt(0) === '.' ? path.resolve(path.dirname(file), p) : p);
  };
  new Function('module', 'exports', 'require', src)(mod, mod.exports, localRequire);
  return mod.exports;
}

const ath = require(RECORD_PATH);

// ── fixtures ──────────────────────────────────────────────────────────────────
const NOW = '2026-10-07T10:00:00.000Z';

function validRecord(over) {
  const base = {
    schema: 'ath:v1',
    ticker: 'AAPL',
    providerSymbol: 'AAPL',
    tradingViewSymbol: 'NASDAQ:AAPL',
    currency: 'USD',
    unit: 'USD',
    basis: 'split-adjusted-no-dividend-adjust',
    status: 'verified',
    athValue: 100,
    athDate: '2026-09-22',
    verifiedAt: NOW,
    verifiedBy: 'operator',
    evidence: {
      tradingViewHigh: 100,
      tradingViewFirstBarDate: '1980-12-01',
      tradingViewAdjSetting: 'off',
      matchedBar: { date: '2026-09-22', high: 100 },
      toleranceUsed: 0.005,
      yahooBarCount: 11546,
      yahooFirstBarDate: '1980-12-12',
      higherBars: [],
      coverageGap: null,
      searchValue: null
    },
    refresh: { status: 'none', lastAttemptAt: null, reason: null },
    pending: null,
    lastCheckedAt: NOW
  };
  return Object.assign(base, over || {});
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function withEvidence(patch) {
  const r = validRecord();
  Object.assign(r.evidence, patch);
  return r;
}

function independent(over) {
  return Object.assign({
    kind: 'ath-claim',
    source: 'Example Statistics Bureau',
    url: 'https://example.org/ath/teva',
    retrievedAt: NOW,
    quotedValue: 100,
    quotedDate: '2026-09-22',
    coverageStart: '2002-08-12'
  }, over || {});
}

function gapRecord() {
  const r = validRecord({ ticker: 'TEVA.TA', providerSymbol: 'TEVA.TA', tradingViewSymbol: 'TASE:TEVA', currency: 'ILS', unit: 'ILA' });
  r.evidence.higherBars = [{ date: '2003-08-06', high: 121500, covered: false, disposition: 'contradicted-by-independent', basis: 'independent' }];
  r.evidence.coverageGap = { uncoveredFrom: '2002-08-12', uncoveredTo: '2007-07-01', independent: independent() };
  r.evidence.tradingViewFirstBarDate = '2007-07-01';
  r.evidence.yahooFirstBarDate = '2002-08-12';
  return r;
}

function valid(rec, api) { return (api || ath).validateRecord(rec).ok === true; }
function invalid(rec, api) { return (api || ath).validateRecord(rec).ok === false; }

// ── AR-1 ──────────────────────────────────────────────────────────────────────
// Predicate over an API object: every one of these must hold for the real module.
function ar1Constants(api) {
  return api.SCHEMA === 'ath:v1' &&
    api.STORE_NAME === 'ath-record-store' &&
    api.KEY_NAMESPACE === 'ath:v1' &&
    api.TOLERANCE === 0.005 &&
    api.PROXIMITY === 0.02 &&
    api.BASIS === 'split-adjusted-no-dividend-adjust' &&
    api.recordKey('TEVA.TA') === 'ath:v1:TEVA.TA' &&
    api.recordKey('AAPL') === 'ath:v1:AAPL';
}

function ar1NoOverride(api) {
  const extra = ['override', 'unrefutedByChart', 'operatorDisposition', 'reason', 'note', 'rationale'];
  const top = extra.every(function (k) {
    const r = validRecord();
    r[k] = 'x';
    return api.validateRecord(r).ok === false;
  });
  const nested = extra.every(function (k) {
    const r = validRecord();
    r.evidence[k] = true;
    return api.validateRecord(r).ok === false;
  });
  const bars = extra.every(function (k) {
    const r = gapRecord();
    r.evidence.higherBars[0][k] = 'x';
    return api.validateRecord(r).ok === false;
  });
  return top && nested && bars;
}

test('AR-1a constants and key schema frozen', function () {
  ok(ar1Constants(ath), 'constants');
  ok(Object.isFrozen(ath.RECORD_KEYS) && Object.isFrozen(ath.EVIDENCE_KEYS), 'key lists frozen');
  ok(ath.RECORD_KEYS.length === 16, 'record has 16 top-level keys');
  ok(ath.EVIDENCE_KEYS.length === 10, 'evidence has 10 keys');
  ok(ath.STATUSES.join() === 'verified,unresolved,stale-suspect', 'status vocabulary');
});

test('AR-1b a well-formed verified record validates (US and TASE gap case)', function () {
  ok(valid(validRecord()), 'US verified');
  ok(valid(gapRecord()), 'TASE with coverage gap');
});

test('AR-1c exact key set: every top-level key is required and nothing extra is accepted', function () {
  ath.RECORD_KEYS.forEach(function (k) {
    const r = validRecord();
    delete r[k];
    ok(invalid(r), 'missing ' + k + ' must fail');
  });
  const extra = validRecord();
  extra.surprise = 1;
  ok(invalid(extra), 'extra top-level key must fail');
  ath.EVIDENCE_KEYS.forEach(function (k) {
    const r = validRecord();
    delete r.evidence[k];
    ok(invalid(r), 'missing evidence.' + k + ' must fail');
  });
  const ev = validRecord();
  ev.evidence.surprise = 1;
  ok(invalid(ev), 'extra evidence key must fail');
  ['status', 'lastAttemptAt', 'reason'].forEach(function (k) {
    const r = validRecord();
    delete r.refresh[k];
    ok(invalid(r), 'missing refresh.' + k + ' must fail');
  });
});

test('AR-1d status, schema, basis, verifiedBy and tolerance are frozen vocabularies', function () {
  ok(invalid(validRecord({ status: 'pending' })), 'unknown status');
  ok(invalid(validRecord({ schema: 'ath:v2' })), 'schema');
  ok(invalid(validRecord({ basis: 'dividend-adjusted' })), 'basis');
  ok(invalid(validRecord({ verifiedBy: 'script' })), 'verifiedBy');
  ok(invalid(withEvidence({ toleranceUsed: 0.01 })), 'toleranceUsed must be 0.005');
  ok(invalid(withEvidence({ tradingViewAdjSetting: 'maybe' })), 'adj setting');
});

test('AR-1e currency / unit combinations are explicit and consistent', function () {
  ok(valid(validRecord({ currency: 'USD', unit: 'USD' })), 'USD/USD');
  ok(valid(validRecord({ ticker: 'LUMI.TA', providerSymbol: 'LUMI.TA', currency: 'ILS', unit: 'ILA' })), 'ILS/ILA (agorot)');
  ok(valid(validRecord({ ticker: 'LUMI.TA', providerSymbol: 'LUMI.TA', currency: 'ILS', unit: 'ILS' })), 'ILS/ILS');
  ok(invalid(validRecord({ currency: 'USD', unit: 'ILA' })), 'USD with agorot');
  ok(invalid(validRecord({ currency: 'ILS', unit: 'USD' })), 'ILS with USD unit');
  ok(invalid(validRecord({ currency: 'EUR', unit: 'USD' })), 'unknown currency');
  ok(invalid(validRecord({ unit: undefined })), 'unit missing');
});

test('AR-1f ticker is the app symbol shape and equals providerSymbol', function () {
  ok(valid(validRecord({ ticker: 'TEVA.TA', providerSymbol: 'TEVA.TA' })), '.TA symbol');
  ok(invalid(validRecord({ ticker: 'teva', providerSymbol: 'teva' })), 'lowercase');
  ok(invalid(validRecord({ ticker: 'AAPL', providerSymbol: 'MSFT' })), 'ticker != providerSymbol');
  ok(invalid(validRecord({ ticker: 'TCH-F34.TA', providerSymbol: 'TCH-F34.TA' })), 'not an app symbol');
  ok(invalid(validRecord({ ticker: 'AAPL ', providerSymbol: 'AAPL ' })), 'padded');
});

test('AR-1g status-dependent value rules', function () {
  ok(invalid(validRecord({ athValue: null })), 'verified needs athValue');
  ok(invalid(validRecord({ athDate: null })), 'verified needs athDate');
  ok(invalid(withEvidence({ matchedBar: null })), 'verified needs matchedBar');
  ok(invalid(validRecord({ athValue: 0 })), 'athValue must be > 0');
  ok(invalid(validRecord({ athValue: Infinity })), 'athValue must be finite');
  ok(invalid(validRecord({ verifiedAt: null })), 'verified needs verifiedAt');
  const unresolved = validRecord({ status: 'unresolved', athValue: null, athDate: null, verifiedAt: null, verifiedBy: null });
  unresolved.evidence.matchedBar = null;
  ok(valid(unresolved), 'unresolved with null value');
  ok(invalid(Object.assign(clone(unresolved), { athValue: 100 })), 'unresolved must not carry athValue');
  ok(valid(validRecord({ status: 'stale-suspect' })), 'stale-suspect may retain the stored value');
});

test('AR-1h higherBars entries: exact keys, vocabulary, coverage-consistent dispositions', function () {
  const bar = { date: '2003-08-06', high: 121500, covered: false, disposition: 'contradicted-by-independent', basis: 'independent' };
  const withBar = function (b, gap) {
    const r = gapRecord();
    r.evidence.higherBars = [b];
    if (gap !== undefined) { r.evidence.coverageGap = gap; }
    return r;
  };
  ok(valid(withBar(bar)), 'baseline bar');
  ['date', 'high', 'covered', 'disposition', 'basis'].forEach(function (k) {
    const b = clone(bar);
    delete b[k];
    ok(invalid(withBar(b)), 'bar missing ' + k);
  });
  ok(invalid(withBar(Object.assign(clone(bar), { disposition: 'rejected-implausible' }))), 'disposition vocabulary');
  ok(invalid(withBar(Object.assign(clone(bar), { basis: 'operator' }))), 'basis vocabulary');
  ok(invalid(withBar(Object.assign(clone(bar), { covered: true }))), 'covered bar cannot be contradicted-by-independent');
  ok(invalid(withBar(Object.assign(clone(bar), { covered: false, disposition: 'contradicted-by-chart', basis: 'tradingview' }))), 'uncovered bar cannot be contradicted-by-chart');
  ok(valid(withBar(Object.assign(clone(bar), { covered: true, disposition: 'contradicted-by-chart', basis: 'tradingview' }), null)), 'covered bar contradicted by chart');
  ok(invalid(withBar(Object.assign(clone(bar), { date: '2003-8-6' }))), 'date format');
  ok(invalid(withBar(Object.assign(clone(bar), { high: -1 }))), 'high must be positive');
});

test('AR-1i coverageGap and independent evidence shape', function () {
  ok(invalid((function () { const r = gapRecord(); delete r.evidence.coverageGap.independent.url; return r; })()), 'independent missing url');
  ok(invalid((function () { const r = gapRecord(); r.evidence.coverageGap.independent.kind = 'opinion'; return r; })()), 'kind vocabulary');
  ok(invalid((function () { const r = gapRecord(); r.evidence.coverageGap.independent.extra = 1; return r; })()), 'independent extra key');
  ok(invalid((function () { const r = gapRecord(); r.evidence.coverageGap.surprise = 1; return r; })()), 'coverageGap extra key');
  ok(invalid((function () { const r = gapRecord(); r.evidence.coverageGap.independent.url = 'http://example.org/x'; return r; })()), 'independent url must be https');
});

test('AR-1j searchValue is optional evidence with an exact shape', function () {
  const sv = { value: 100, date: '2026-09-22', citation: 'https://example.org/page' };
  ok(valid(withEvidence({ searchValue: sv })), 'searchValue accepted');
  ok(invalid(withEvidence({ searchValue: { value: 100 } })), 'searchValue partial');
  ok(invalid(withEvidence({ searchValue: Object.assign({ extra: 1 }, sv) })), 'searchValue extra key');
});

test('AR-1k refresh and pending (reserved for B2) are defined in v1', function () {
  ok(valid(validRecord({ refresh: { status: 'unresolved', lastAttemptAt: NOW, reason: 'NO_CLEAN_MATCH' } })), 'refresh unresolved on a verified record');
  ok(invalid(validRecord({ refresh: { status: 'broken', lastAttemptAt: null, reason: null } })), 'refresh status vocabulary');
  ok(invalid(validRecord({ pending: { value: 1 } })), 'pending is reserved: null only in B1+B3');
});

test('AR-1l no override or free-text rejection field is accepted anywhere', function () {
  ok(ar1NoOverride(ath), 'override fields rejected at top level, evidence and higherBars');
});

test('AR-1m non-object and corrupt inputs fail closed', function () {
  [null, undefined, 42, 'x', [], true].forEach(function (v) { ok(invalid(v), 'input ' + String(v)); });
  const r = validRecord();
  r.lastCheckedAt = 'yesterday';
  ok(invalid(r), 'timestamp format');
});

// ── AR-2 ──────────────────────────────────────────────────────────────────────
function cmp(api, rec, price, high) { return api.compareToVerifiedAth(rec, price, high); }

function ar2Table(api) {
  const rec = validRecord({ athValue: 100 });
  const rows = [
    [rec, 50, 55, 'below', 50],
    [rec, 97.9, 98, 'below', 2.1],
    [rec, 98, 98, 'near', 2],
    [rec, 99, 99.5, 'near', 1],
    [rec, 99, null, 'near', 1],
    [rec, 99, 100, 'at_or_above', 1],
    [rec, 99, 100.5, 'at_or_above', 1],
    [rec, 100, 100, 'at_or_above', 0],
    [rec, 101, 101, 'at_or_above', -1]
  ];
  return rows.every(function (row) {
    const r = cmp(api, row[0], row[1], row[2]);
    return r.state === row[3] && Math.abs(r.distancePct - row[4]) < 1e-9;
  });
}

function ar2Unavailable(api) {
  const unresolved = validRecord({ status: 'unresolved', athValue: null, athDate: null, verifiedAt: null, verifiedBy: null });
  const stale = validRecord({ status: 'stale-suspect' });
  const cases = [null, undefined, 'x', [], unresolved, stale, validRecord({ athValue: 0 }), validRecord({ athValue: NaN })];
  const recordsOk = cases.every(function (rec) {
    const r = cmp(api, rec, 99, 99);
    return r.state === 'unavailable' && r.distancePct === null;
  });
  const priceOk = [null, undefined, NaN, 0, -3, '99'].every(function (p) {
    const r = cmp(api, validRecord(), p, 99);
    return r.state === 'unavailable' && r.distancePct === null;
  });
  return recordsOk && priceOk;
}

// A stale or unresolved record must stay unavailable even when it carries a high1y-like field
// or a stored value: the 1Y High can never be substituted for the all-time high.
function ar2No1yHigh(api) {
  const stale = validRecord({ status: 'stale-suspect', high1y: 90, high1yDist: 5 });
  const unresolved = validRecord({ status: 'unresolved', athValue: null, athDate: null, high1y: 99.9 });
  return cmp(api, stale, 99, 99).state === 'unavailable' &&
    cmp(api, unresolved, 99, 99).state === 'unavailable' &&
    api.compareToVerifiedAth.length === 3;
}

test('AR-2a below / near / at_or_above table (2% proximity inclusive, high decides at_or_above)', function () {
  ok(ar2Table(ath), 'comparison table');
});

test('AR-2b missing, non-verified or unusable records and prices are unavailable', function () {
  ok(ar2Unavailable(ath), 'unavailable matrix');
});

test('AR-2c no 1Y High input path: arity 3 and non-verified records never produce a state', function () {
  ok(ar2No1yHigh(ath), 'no 1Y High substitution');
});

test('AR-2d result has exactly { state, distancePct }', function () {
  const r = cmp(ath, validRecord(), 99, 99);
  ok(Object.keys(r).sort().join() === 'distancePct,state', 'key set');
  const u = cmp(ath, null, 99, 99);
  ok(Object.keys(u).sort().join() === 'distancePct,state', 'unavailable key set');
});

test('AR-2e does not mutate its inputs', function () {
  const rec = validRecord();
  const before = JSON.stringify(rec);
  cmp(ath, rec, 99, 100);
  ok(JSON.stringify(rec) === before, 'record unchanged');
});

// ── planted negatives (mutation on production source) ─────────────────────────
function killed(name, mutations, predicate) {
  test('PN ' + name + ' is killed', function () {
    const mutant = loadMutated(RECORD_PATH, mutations);
    // A mutant must be killed by the predicate RETURNING false. A thrown error would also look
    // like a kill and could hide a broken predicate, so it is reported as a failure.
    let survived;
    try { survived = predicate(mutant) === true; } catch (e) { throw new Error('predicate threw instead of returning false: ' + (e && e.message)); }
    ok(!survived, 'mutant survived: the predicate still passes');
  });
}

killed('proximity widened to 3% (AR-2)', [['const PROXIMITY = 0.02;', 'const PROXIMITY = 0.03;']], ar2Table);
killed('proximity narrowed to 1% (AR-2)', [['const PROXIMITY = 0.02;', 'const PROXIMITY = 0.01;']], ar2Table);
killed('tolerance constant changed (AR-1)', [['const TOLERANCE = 0.005;', 'const TOLERANCE = 0.05;']], ar1Constants);
killed('compare accepts a non-verified record (1Y High path, AR-2)',
  [['record.status !== \'verified\') { // compare-requires-verified', 'false) { // compare-requires-verified']], ar2Unavailable);
killed('compare accepts a stale record (AR-2)',
  [['record.status !== \'verified\') { // compare-requires-verified', 'record.status === \'unresolved\') { // compare-requires-verified']], ar2No1yHigh);
killed('override field tolerated by the schema (AR-1)',
  [['if (!exactKeys(rec, RECORD_KEYS)) { return bad(\'RECORD_KEYS\'); }', 'if (false) { return bad(\'RECORD_KEYS\'); }']], ar1NoOverride);

const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
if (failed > 0) { process.exitCode = 1; }
