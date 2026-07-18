'use strict';

/*
 * qa/evidence_freshness_offline.js
 *
 * C1-S5 — FH-series offline QA for the J7 evidence-freshness library
 * (netlify/functions/lib/evidence-freshness.js). Fully offline: a throwing
 * global.fetch guard is installed for the whole run; the target is a pure
 * route-less lib with zero I/O of its own.
 *
 * ERRATUM (owner ruling E-G): eg25c1-spec-v1 §4.2 pinned the FH01 benchmark
 * checkedAt as 1700000000000 (= 2023-11-14T22:13:20Z), which is 906 days
 * BEFORE the same benchmark's filed date 2026-05-08 and would force
 * degraded/TIMESTAMP_AHEAD_OF_CLOCK, contradicting the pinned
 * ageDays 68 / state "aging". The owner-ratified corrected value used here is
 * 1784073600000 (= 2026-07-15T00:00:00.000Z), which yields exactly ageDays 68
 * for filed 2026-05-08. This is an explicit, owner-ratified spec erratum —
 * not a silent change.
 *
 * Coverage:
 *   FH01 E-G-amended benchmark, deep-equal AND stringify-equal
 *   FH02 all five states reachable in one report
 *   FH03 inclusive literal thresholds (+ even-number custom family)
 *   FH04 news/catalysts absolute dual window (E-E)
 *   FH05 timestamp precedence, record.fetchedAt sourcing,
 *        timestamps.fetchedAt ignored
 *   FH06 clock defects: future timestamp, invalid checkedAt exact report
 *   FH07 broken-record survival, ladder collisions, key sanitization
 *   FH08 unknown family (identity-valid only; padded family = MALFORMED)
 *   FH09 coverageScore + expectedFamilies whole-list fail-closed +
 *        domain separation
 *   FH10 determinism, immutability, never-throws garbage sweep,
 *        exact EVALUATOR_ERROR fallback (throwing getter + Proxy)
 *   FH11 record validity: facts strict incl. whitespace identities,
 *        producerless generic + rev-3 generic provider battery
 *   FH12 strict timestamp grammar rejection
 *   FH13 window-table resolution matrix + frozen default + note ordering
 *   FH14 target purity scan, import-inert child, freezing scope,
 *        sanitized output echoes
 *
 * Run: node qa/evidence_freshness_offline.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LIB_PATH = path.join(ROOT, 'netlify', 'functions', 'lib', 'evidence-freshness.js');
const LIB = require(LIB_PATH);

const DAY_MS = 86400000;
const CHECKED_AT = 1784073600000; // 2026-07-15T00:00:00.000Z (E-G erratum value)
const NOW_ISO = '2026-07-15T00:00:00.000Z';
const REMOVE = Symbol('remove');
// U+00A0 fixture built via fromCodePoint (house rule: never glyphs/escapes).
const NBSP = String.fromCodePoint(0x00A0);

// The exact owner-pinned all-or-nothing defensive fallback report.
const FALLBACK_JSON = JSON.stringify({
  ticker: null,
  checkedAt: null,
  windowTableVersion: 'eg25c1-spec-v1',
  items: [],
  counts: { fresh: 0, aging: 0, stale: 0, missing: 0, degraded: 0 },
  coverageScore: 0,
  degradedNotes: ['EVALUATOR_ERROR']
});

const REPORT_KEYS = ['ticker', 'checkedAt', 'windowTableVersion', 'items', 'counts', 'coverageScore', 'degradedNotes'];

// ── fixture helpers ──────────────────────────────────────────────────────────
function ymdDaysAgo(n) {
  return new Date(CHECKED_AT - n * DAY_MS).toISOString().slice(0, 10);
}

function factsRecord(over) {
  const r = {
    ticker: 'FROG',
    fetchedAt: NOW_ISO,
    sourceTier: 'sec_xbrl_primary',
    contractVersion: 'fund-contract-v1',
    provider: 'j1-sec-facts@job-model-v1',
    runId: 1700000000000
  };
  Object.keys(over || {}).forEach(function (k) {
    if (over[k] === REMOVE) { delete r[k]; } else { r[k] = over[k]; }
  });
  return r;
}

function genericRecord(over) {
  const r = { ticker: 'FROG', fetchedAt: NOW_ISO, sourceTier: 'tier-x', contractVersion: 'contract-x', provider: 'prov-x' };
  Object.keys(over || {}).forEach(function (k) {
    if (over[k] === REMOVE) { delete r[k]; } else { r[k] = over[k]; }
  });
  return r;
}

function snap(family, key, record, timestamps) {
  return { family: family, key: key, record: record, timestamps: timestamps };
}

function run(records, table, checkedAt, meta) {
  return LIB.evaluateEvidenceFreshness(records, table, checkedAt, meta);
}

// Deep copy of DEFAULT families + overrides. version: undefined => a default
// QA version string; null => the version property is omitted entirely.
function customTable(extraFamilies, version) {
  const fams = {};
  Object.keys(LIB.DEFAULT_WINDOW_TABLE.families).forEach(function (k) {
    const e = LIB.DEFAULT_WINDOW_TABLE.families[k];
    fams[k] = { agingAfterDays: e.agingAfterDays, staleAfterDays: e.staleAfterDays };
  });
  Object.keys(extraFamilies || {}).forEach(function (k) { fams[k] = extraFamilies[k]; });
  const t = { families: fams };
  if (version !== null) { t.version = version === undefined ? 'qa-custom-v1' : version; }
  return t;
}

function factsMeta() { return { ticker: 'FROG', expectedFamilies: ['facts'] }; }

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

function deepFreezeFixture(v) {
  if (v && typeof v === 'object') {
    Object.keys(v).forEach(function (k) { deepFreezeFixture(v[k]); });
    Object.freeze(v);
  }
  return v;
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      passed += 1;
      process.stdout.write('  PASS  ' + name + '\n');
    } catch (err) {
      failed += 1;
      process.stdout.write('  FAIL  ' + name + '\n        ' + (err && err.message ? err.message : err) + '\n');
    }
  }

  const _origFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = function () { fetchCalls += 1; throw new Error('LIVE_NETWORK_FORBIDDEN'); };

  try {
    // ── FH01: E-G-amended benchmark — deep-equal AND stringify-equal ─────────
    await test('FH01 benchmark report matches the E-G-amended spec exactly (deep + stringify)', function () {
      const records = [snap('facts', 'fundstore:v1:facts:0001800667', factsRecord(),
        { filed: '2026-05-08', periodEnd: '2026-03-31' })];
      const report = run(records, LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, factsMeta());
      const expected = {
        ticker: 'FROG',
        checkedAt: 1784073600000,
        windowTableVersion: 'eg25c1-spec-v1',
        items: [{
          family: 'facts',
          key: 'fundstore:v1:facts:0001800667',
          asOf: '2026-05-08',
          timestampSource: 'filed',
          usedFetchedAtFallback: false,
          ageDays: 68,
          state: 'aging',
          reason: null
        }],
        counts: { fresh: 0, aging: 1, stale: 0, missing: 0, degraded: 0 },
        coverageScore: 1,
        degradedNotes: []
      };
      assert.deepStrictEqual(report, expected, 'deep equality');
      assert.strictEqual(JSON.stringify(report), JSON.stringify(expected), 'stringify equality (key order)');
      const own = fs.readFileSync(__filename, 'utf8');
      assert.ok(/ERRATUM \(owner ruling E-G\)/.test(own), 'E-G erratum comment must be present');
    });

    // ── FH02: all five states reachable in one report ────────────────────────
    await test('FH02 all five states in one report; counts {1,1,1,1,1}', function () {
      const records = [
        snap('facts', 'k1', factsRecord(), { filed: ymdDaysAgo(10) }),
        snap('facts', 'k2', factsRecord(), { filed: ymdDaysAgo(68) }),
        snap('facts', 'k3', factsRecord(), { filed: ymdDaysAgo(130) }),
        snap('facts', 'k4', null, { filed: ymdDaysAgo(10) }),
        snap('crypto', 'k5', genericRecord(), { filed: ymdDaysAgo(10) })
      ];
      const report = run(records, LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, factsMeta());
      const states = report.items.map(function (it) { return it.state; });
      assert.deepStrictEqual(states, ['fresh', 'aging', 'stale', 'missing', 'degraded']);
      assert.deepStrictEqual(report.counts, { fresh: 1, aging: 1, stale: 1, missing: 1, degraded: 1 });
      assert.strictEqual(report.items[2].reason, null, 'stale is a lifecycle state, reason null');
      const m = report.items[3];
      assert.deepStrictEqual([m.reason, m.asOf, m.timestampSource, m.usedFetchedAtFallback, m.ageDays],
        ['RECORD_UNREADABLE', null, null, false, null], 'missing item nullable fields');
      const d = report.items[4];
      assert.deepStrictEqual([d.reason, d.asOf, d.timestampSource, d.usedFetchedAtFallback, d.ageDays],
        ['UNKNOWN_FAMILY', null, null, false, null], 'degraded item nullable fields');
    });

    // ── FH03: inclusive literal thresholds ───────────────────────────────────
    await test('FH03 inclusive thresholds: facts 60/61/121/122; even-number custom family', function () {
      const ages = [60, 61, 121, 122];
      const records = ages.map(function (n, i) {
        return snap('facts', 'k' + i, factsRecord(), { filed: ymdDaysAgo(n) });
      });
      const report = run(records, LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, factsMeta());
      assert.deepStrictEqual(report.items.map(function (it) { return it.state; }),
        ['fresh', 'aging', 'aging', 'stale']);
      assert.deepStrictEqual(report.items.map(function (it) { return it.ageDays; }), ages);
      // even-number thresholds: ageDays == agingAfterDays => fresh; == staleAfterDays => aging
      const table = customTable({ even: { agingAfterDays: 10, staleAfterDays: 20 } });
      const evens = [10, 11, 20, 21].map(function (n, i) {
        return snap('even', 'e' + i, genericRecord(), { filed: ymdDaysAgo(n) });
      });
      const r2 = run(evens, table, CHECKED_AT, { ticker: 'FROG', expectedFamilies: ['even'] });
      assert.deepStrictEqual(r2.items.map(function (it) { return it.state; }),
        ['fresh', 'aging', 'aging', 'stale']);
    });

    // ── FH04: E-E absolute news/catalysts windows ────────────────────────────
    await test('FH04 news/catalysts absolute: 7 fresh, 8 aging, 30 aging, 31 stale', function () {
      ['news', 'catalysts'].forEach(function (fam) {
        const records = [7, 8, 30, 31].map(function (n, i) {
          return snap(fam, 'k' + i, genericRecord(), { filed: ymdDaysAgo(n) });
        });
        const report = run(records, LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, { ticker: 'X1', expectedFamilies: [fam] });
        assert.deepStrictEqual(report.items.map(function (it) { return it.state; }),
          ['fresh', 'aging', 'aging', 'stale'], fam);
      });
    });

    // ── FH05: precedence + record.fetchedAt sourcing ─────────────────────────
    await test('FH05 precedence filed->periodEnd->asOf->eventDate->record.fetchedAt; timestamps.fetchedAt ignored', function () {
      const d1 = ymdDaysAgo(5); const d2 = ymdDaysAgo(6); const d3 = ymdDaysAgo(7); const d4 = ymdDaysAgo(8);
      function one(ts, record) {
        return run([snap('facts', 'k', record || factsRecord(), ts)],
          LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, factsMeta()).items[0];
      }
      let it = one({ filed: d1, periodEnd: d2, asOf: d3, eventDate: d4 });
      assert.deepStrictEqual([it.timestampSource, it.asOf, it.usedFetchedAtFallback], ['filed', d1, false]);
      it = one({ periodEnd: d2, asOf: d3, eventDate: d4 });
      assert.deepStrictEqual([it.timestampSource, it.asOf], ['periodEnd', d2]);
      it = one({ asOf: d3, eventDate: d4 });
      assert.deepStrictEqual([it.timestampSource, it.asOf], ['asOf', d3]);
      it = one({ eventDate: d4 });
      assert.deepStrictEqual([it.timestampSource, it.asOf], ['eventDate', d4]);
      it = one({});
      assert.deepStrictEqual([it.timestampSource, it.asOf, it.usedFetchedAtFallback], ['fetchedAt', NOW_ISO, true]);
      // timestamps.fetchedAt alone is IGNORED: no record.fetchedAt => NO_TIMESTAMP
      it = one({ fetchedAt: d1 }, factsRecord({ fetchedAt: REMOVE }));
      assert.deepStrictEqual([it.state, it.reason, it.asOf], ['degraded', 'NO_TIMESTAMP', null]);
      // with both present the accepted value is record.fetchedAt's
      it = one({ fetchedAt: d1 });
      assert.deepStrictEqual([it.timestampSource, it.asOf, it.usedFetchedAtFallback], ['fetchedAt', NOW_ISO, true]);
      // unaccepted higher candidate skipped, walk continues
      it = one({ filed: '2026-13-01', periodEnd: d2 });
      assert.deepStrictEqual([it.timestampSource, it.asOf], ['periodEnd', d2]);
    });

    // ── FH06: clock defects ──────────────────────────────────────────────────
    await test('FH06 future timestamp preserved-negative; invalid checkedAt exact report', function () {
      const future = run([snap('facts', 'k', factsRecord(), { filed: '2026-08-01' })],
        LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, factsMeta());
      const f = future.items[0];
      assert.deepStrictEqual([f.state, f.reason, f.ageDays, f.asOf, f.timestampSource],
        ['degraded', 'TIMESTAMP_AHEAD_OF_CLOCK', -17, '2026-08-01', 'filed']);
      // exact report for one representative invalid clock (NaN)
      const records = [snap('facts', 'fundstore:v1:facts:0001800667', factsRecord(),
        { filed: '2026-05-08', periodEnd: '2026-03-31' })];
      const report = run(records, LIB.DEFAULT_WINDOW_TABLE, NaN, factsMeta());
      const expected = {
        ticker: 'FROG',
        checkedAt: null,
        windowTableVersion: 'eg25c1-spec-v1',
        items: [{
          family: 'facts',
          key: 'fundstore:v1:facts:0001800667',
          asOf: '2026-05-08',
          timestampSource: 'filed',
          usedFetchedAtFallback: false,
          ageDays: null,
          state: 'degraded',
          reason: 'CHECKED_AT_INVALID'
        }],
        counts: { fresh: 0, aging: 0, stale: 0, missing: 0, degraded: 1 },
        coverageScore: 0,
        degradedNotes: ['CHECKED_AT_INVALID']
      };
      assert.deepStrictEqual(report, expected);
      assert.strictEqual(JSON.stringify(report), JSON.stringify(expected), 'stringify equality');
      // other invalid clock shapes behave identically in kind
      ['1784073600000', 1784073600000.5, -1, Infinity, null, undefined].forEach(function (bad) {
        const r = run(records, LIB.DEFAULT_WINDOW_TABLE, bad, factsMeta());
        assert.strictEqual(r.checkedAt, null, 'checkedAt null for ' + String(bad));
        assert.strictEqual(r.items[0].reason, 'CHECKED_AT_INVALID');
        assert.deepStrictEqual(r.degradedNotes, ['CHECKED_AT_INVALID'], 'note exactly once');
      });
    });

    // ── FH07: survival, ladder collisions, key sanitization ──────────────────
    await test('FH07 broken records never discard the report; collisions honor the ladder; keys sanitized', function () {
      const cyclicKey = {}; cyclicKey.self = cyclicKey;
      const records = [
        snap('facts', 'ok', factsRecord(), { filed: ymdDaysAgo(10) }),      // healthy sibling
        snap('facts', 'k-null', null, { filed: ymdDaysAgo(10) }),           // 3: missing
        42,                                                                  // 1: element malformed
        snap('facts', {}, factsRecord(), { filed: ymdDaysAgo(10) }),        // 1: key object
        snap('facts', [], factsRecord(), { filed: ymdDaysAgo(10) }),        // 1: key array
        snap('facts', '', factsRecord(), { filed: ymdDaysAgo(10) }),        // 1: key empty
        snap('facts', '   ', factsRecord(), { filed: ymdDaysAgo(10) }),     // 1: key whitespace
        snap('facts', 7, factsRecord(), { filed: ymdDaysAgo(10) }),         // 1: key number
        snap('facts', cyclicKey, factsRecord(), { filed: ymdDaysAgo(10) }), // 1: key cyclic
        snap('crypto', 'c1', null, {}),                                     // 2>3: unknown beats null record
        snap(42, 'k-echo', null, {}),                                       // 1>2: malformed family beats unknown
        snap('facts', 'ci-future', factsRecord({ provider: 'wrong' }), { filed: '2026-08-01' }), // 4>7
        snap('facts ', 'pf1', factsRecord(), { filed: ymdDaysAgo(10) }),    // 1: padded family (trailing)
        snap(' facts', 'pf2', factsRecord(), { filed: ymdDaysAgo(10) }),    // 1: padded family (leading)
        snap('facts', ' key', factsRecord(), { filed: ymdDaysAgo(10) }),    // 1: padded key (leading)
        snap('facts', 'key ', factsRecord(), { filed: ymdDaysAgo(10) })     // 1: padded key (trailing)
      ];
      const report = run(records, LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, factsMeta());
      assert.strictEqual(report.items.length, records.length, 'one item per record');
      assert.strictEqual(report.items[0].state, 'fresh', 'healthy sibling unaffected');
      assert.deepStrictEqual([report.items[1].state, report.items[1].reason], ['missing', 'RECORD_UNREADABLE']);
      assert.deepStrictEqual([report.items[2].family, report.items[2].key, report.items[2].reason],
        [null, null, 'MALFORMED_SNAPSHOT']);
      [3, 4, 5, 6, 7, 8].forEach(function (i) {
        const it = report.items[i];
        assert.deepStrictEqual(
          [it.reason, it.family, it.key, it.asOf, it.timestampSource, it.usedFetchedAtFallback, it.ageDays],
          ['MALFORMED_SNAPSHOT', 'facts', null, null, null, false, null],
          'malformed key sanitized at index ' + i);
      });
      assert.deepStrictEqual([report.items[9].reason, report.items[9].state], ['UNKNOWN_FAMILY', 'degraded'], '2>3');
      assert.deepStrictEqual([report.items[10].reason, report.items[10].family, report.items[10].key],
        ['MALFORMED_SNAPSHOT', null, 'k-echo'], '1>2 with valid key echoed');
      assert.strictEqual(report.items[11].reason, 'CONTRACT_INVALID', '4>7 contract beats future timestamp');
      // rev-3: padded family (12,13) and padded key (14,15) — full malformed-item contract
      [12, 13].forEach(function (i) {
        const it = report.items[i];
        assert.deepStrictEqual(
          [it.state, it.reason, it.family, it.key, it.asOf, it.timestampSource, it.usedFetchedAtFallback, it.ageDays],
          ['degraded', 'MALFORMED_SNAPSHOT', null, 'pf' + (i - 11), null, null, false, null],
          'padded family: full malformed contract at index ' + i + ' (valid key stays echoed)');
      });
      [14, 15].forEach(function (i) {
        const it = report.items[i];
        assert.deepStrictEqual(
          [it.state, it.reason, it.family, it.key, it.asOf, it.timestampSource, it.usedFetchedAtFallback, it.ageDays],
          ['degraded', 'MALFORMED_SNAPSHOT', 'facts', null, null, null, false, null],
          'padded key: full malformed contract at index ' + i);
      });
      // 4>5 and 5>6 under an invalid clock
      const clockless = run([
        snap('facts', 'a', factsRecord({ provider: 'wrong' }), { filed: ymdDaysAgo(5) }),
        snap('facts', 'b', factsRecord({ fetchedAt: REMOVE }), {})
      ], LIB.DEFAULT_WINDOW_TABLE, NaN, factsMeta());
      assert.strictEqual(clockless.items[0].reason, 'CONTRACT_INVALID', '4>5');
      assert.strictEqual(clockless.items[1].reason, 'CHECKED_AT_INVALID', '5>6');
    });

    // ── FH08: unknown family, no normalization ───────────────────────────────
    await test('FH08 unknown family is item-level degraded/UNKNOWN_FAMILY; padded family is MALFORMED, never UNKNOWN', function () {
      const report = run([
        snap('crypto', 'k1', genericRecord(), { filed: ymdDaysAgo(1) }),
        snap(' facts', 'k2', factsRecord(), { filed: ymdDaysAgo(1) }),
        snap('facts' + NBSP, 'k2b', factsRecord(), { filed: ymdDaysAgo(1) }),
        snap('facts', 'k3', factsRecord(), { filed: ymdDaysAgo(1) })
      ], LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, factsMeta());
      assert.strictEqual(report.items[0].reason, 'UNKNOWN_FAMILY', 'identity-valid unknown family');
      assert.strictEqual(report.items[0].family, 'crypto', 'valid identity echoed');
      // rev-3: padded family fails the identity rule at step 1 — MALFORMED, not UNKNOWN
      assert.deepStrictEqual([report.items[1].reason, report.items[1].family],
        ['MALFORMED_SNAPSHOT', null], 'leading-padded family never reaches UNKNOWN_FAMILY');
      assert.deepStrictEqual([report.items[2].reason, report.items[2].family],
        ['MALFORMED_SNAPSHOT', null], 'U+00A0-padded family rejected (trim-stripped whitespace)');
      assert.strictEqual(report.items[3].state, 'fresh');
      assert.strictEqual(report.coverageScore, 1, 'unknown/malformed items never qualify or block');
    });

    // ── FH09: coverage + whole-list fail-closed + domain separation ──────────
    await test('FH09 coverage math; expectedFamilies whole-list fail-closed; records still classify', function () {
      const freshFacts = snap('facts', 'k1', factsRecord(), { filed: ymdDaysAgo(1) });
      const staleNews = snap('news', 'k2', genericRecord(), { filed: ymdDaysAgo(40) });
      let r = run([freshFacts, staleNews], LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT,
        { ticker: 'X1', expectedFamilies: ['facts', 'news'] });
      assert.strictEqual(r.coverageScore, 0.5, 'facts qualifies, stale news does not');
      r = run([staleNews], LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, { ticker: 'X1', expectedFamilies: ['news'] });
      assert.strictEqual(r.coverageScore, 0, 'stale-only family');
      r = run([freshFacts], LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, { ticker: 'X1', expectedFamilies: ['facts', 'facts'] });
      assert.strictEqual(r.coverageScore, 1, 'duplicates dedupe to denominator 1');
      assert.deepStrictEqual(r.degradedNotes, [], 'duplicates are not an error');
      r = run([freshFacts, snap('facts', 'k9', factsRecord(), { filed: ymdDaysAgo(2) })],
        LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, factsMeta());
      assert.strictEqual(r.coverageScore, 1, 'two qualifying items count once');
      r = run([freshFacts, snap('news', 'k3', genericRecord(), { filed: ymdDaysAgo(1) })],
        LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, factsMeta());
      assert.strictEqual(r.coverageScore, 1, 'unexpected qualifying family never inflates');
      r = run([freshFacts], LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, { ticker: 'X1', expectedFamilies: [] });
      assert.strictEqual(r.coverageScore, 0, 'empty list valid, score 0');
      assert.deepStrictEqual(r.degradedNotes, [], 'empty list emits no note');
      [undefined, 'x', 42, [42], [''], [' '], ['a', null], ['facts', 'crypto'], ['facts '], [' facts'], ['facts' + NBSP]].forEach(function (bad) {
        const rr = run([freshFacts], LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, { ticker: 'X1', expectedFamilies: bad });
        assert.deepStrictEqual(rr.degradedNotes, ['EXPECTED_FAMILIES_INVALID'], 'note once for ' + JSON.stringify(bad));
        assert.strictEqual(rr.coverageScore, 0, 'fail-closed score for ' + JSON.stringify(bad));
      });
      // domain separation: invalid expected list never alters per-item results
      const mixed = run([
        freshFacts,
        snap('facts', 'bad', factsRecord({ provider: 'wrong' }), { filed: ymdDaysAgo(1) }),
        snap('crypto', 'u', genericRecord(), { filed: ymdDaysAgo(1) })
      ], LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, { ticker: 'X1', expectedFamilies: ['facts', 'crypto'] });
      assert.deepStrictEqual(mixed.items.map(function (it) { return it.state; }),
        ['fresh', 'degraded', 'degraded'], 'records classified normally');
      assert.deepStrictEqual(mixed.items.map(function (it) { return it.reason; }),
        [null, 'CONTRACT_INVALID', 'UNKNOWN_FAMILY']);
      assert.deepStrictEqual(mixed.degradedNotes, ['EXPECTED_FAMILIES_INVALID']);
      assert.strictEqual(mixed.coverageScore, 0);
      // rev-3: padded meta.ticker is never echoed; records and coverage unaffected
      const padded = run([freshFacts], LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT,
        { ticker: ' FROG ', expectedFamilies: ['facts'] });
      assert.strictEqual(padded.ticker, null, 'padded meta.ticker => report.ticker null');
      assert.strictEqual(padded.items[0].state, 'fresh', 'records still classify');
      assert.strictEqual(padded.coverageScore, 1, 'valid expected list unaffected by padded ticker');
      assert.deepStrictEqual(padded.degradedNotes, [], 'no note for padded ticker');
    });

    // ── FH10: determinism, immutability, never-throws, exact fallback ────────
    await test('FH10 determinism + immutability + garbage sweep + exact EVALUATOR_ERROR fallback', function () {
      // determinism on frozen inputs
      const frozenRecords = deepFreezeFixture([
        snap('facts', 'k1', factsRecord(), { filed: ymdDaysAgo(10) }),
        snap('news', 'k2', genericRecord(), { filed: ymdDaysAgo(9) })
      ]);
      const frozenMeta = deepFreezeFixture({ ticker: 'FROG', expectedFamilies: ['facts', 'news'] });
      const out1 = run(frozenRecords, LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, frozenMeta);
      const out2 = run(frozenRecords, LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, frozenMeta);
      assert.strictEqual(JSON.stringify(out1), JSON.stringify(out2), 'byte-identical reports');
      // immutability of unfrozen inputs
      const mutable = [snap('facts', 'k1', factsRecord(), { filed: ymdDaysAgo(10) })];
      const metaIn = { ticker: 'FROG', expectedFamilies: ['facts', 'facts'] };
      const before = JSON.stringify({ r: mutable, m: metaIn });
      run(mutable, LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, metaIn);
      assert.strictEqual(JSON.stringify({ r: mutable, m: metaIn }), before, 'inputs unmodified');
      assert.ok(!Object.isFrozen(mutable) && !Object.isFrozen(metaIn), 'inputs not frozen by the evaluator');
      // never-throws garbage sweep (cyclic inputs included; outputs stringify-safe)
      const cyc = []; cyc.push(cyc);
      const cycRecord = {}; cycRecord.self = cycRecord;
      const cycTs = {}; cycTs.self = cycTs;
      const cycMeta = { ticker: 'X1', expectedFamilies: ['facts'] }; cycMeta.self = cycMeta;
      const calls = [
        [undefined, undefined, undefined, undefined],
        [null, null, null, null],
        [42, 'x', 'y', 'z'],
        ['records', [], {}, []],
        [cyc, LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, cycMeta],
        [[snap('facts', 'k', cycRecord, cycTs)], LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, cycMeta]
      ];
      calls.forEach(function (args, i) {
        const rep = LIB.evaluateEvidenceFreshness(args[0], args[1], args[2], args[3]);
        assert.deepStrictEqual(Object.keys(rep), REPORT_KEYS, 'exact top-level key set (call ' + i + ')');
        assert.doesNotThrow(function () { JSON.stringify(rep); }, 'output stringify-safe (call ' + i + ')');
      });
      // exact all-or-nothing fallback: throwing getter on a record element
      const boobyElement = {};
      Object.defineProperty(boobyElement, 'family', {
        enumerable: true,
        get: function () { throw new Error('boom'); }
      });
      const viaGetter = run([boobyElement], LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, factsMeta());
      assert.strictEqual(JSON.stringify(viaGetter), FALLBACK_JSON, 'exact fallback via throwing getter');
      // exact fallback: hostile Proxy window table
      const hostileTable = new Proxy({}, { get: function () { throw new Error('trap'); } });
      const viaProxy = run([snap('facts', 'k', factsRecord(), {})], hostileTable, CHECKED_AT, factsMeta());
      assert.strictEqual(JSON.stringify(viaProxy), FALLBACK_JSON, 'exact fallback via Proxy table');
      assert.strictEqual(JSON.stringify(run([boobyElement], LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, factsMeta())),
        FALLBACK_JSON, 'fallback deterministic');
    });

    // ── FH11: record validity — facts strict, whitespace identities ──────────
    await test('FH11 facts contract validity incl. whitespace; producerless generic; non-object record', function () {
      function factsWith(over) {
        return run([snap('facts', 'k', factsRecord(over), { filed: ymdDaysAgo(5) })],
          LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, factsMeta()).items[0];
      }
      const corruptions = [
        { contractVersion: 'other-v1' },
        { contractVersion: ' fund-contract-v1' },
        { contractVersion: 'fund-contract-v1 ' },
        { sourceTier: 'other' },
        { sourceTier: ' sec_xbrl_primary' },
        { provider: 'someone-else' },
        { provider: ' j1-sec-facts@job-model-v1 ' },
        { runId: 'not-a-number' },
        { runId: Infinity },
        { runId: REMOVE },
        { fetchedAt: '2026-07-15' },
        { fetchedAt: '2026-07-15T00:00:00+02:00' },
        { fetchedAt: 42 },
        { ticker: '   ' },
        { ticker: REMOVE },
        { sourceTier: '' },
        { contractVersion: REMOVE }
      ];
      corruptions.forEach(function (over) {
        const it = factsWith(over);
        assert.deepStrictEqual([it.state, it.reason], ['degraded', 'CONTRACT_INVALID'],
          'corruption ' + JSON.stringify(Object.keys(over)));
      });
      [42, 'x', []].forEach(function (nonObj) {
        const it = run([snap('facts', 'k', nonObj, { filed: ymdDaysAgo(5) })],
          LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, factsMeta()).items[0];
        assert.deepStrictEqual([it.state, it.reason], ['degraded', 'CONTRACT_INVALID'],
          'non-object record is contract-invalid, not missing');
      });
      // producerless family: generic validity only — odd contractVersion is fine
      const news = run([snap('news', 'k', genericRecord({ contractVersion: 'anything-v9' }), { filed: ymdDaysAgo(8) })],
        LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, { ticker: 'X1', expectedFamilies: ['news'] }).items[0];
      assert.deepStrictEqual([news.state, news.reason], ['aging', null]);
      // rev-3 generic provider requirement: every recognized family needs a
      // valid, unpadded provider identity string — no exact value pinned
      // outside facts.
      [{ provider: REMOVE }, { provider: 42 }, { provider: '   ' }, { provider: ' prov-x' },
        { provider: 'prov-x ' }, { provider: 'prov-x' + NBSP },
        { sourceTier: ' tier-x' }, { contractVersion: 'contract-x ' }
      ].forEach(function (over) {
        const it = run([snap('news', 'k', genericRecord(over), { filed: ymdDaysAgo(8) })],
          LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, { ticker: 'X1', expectedFamilies: ['news'] }).items[0];
        assert.deepStrictEqual([it.state, it.reason], ['degraded', 'CONTRACT_INVALID'],
          'generic-family corruption ' + JSON.stringify(Object.keys(over)));
      });
      // facts fetchedAt absent is not a defect (enables the NO_TIMESTAMP path)
      const noFa = factsWith({ fetchedAt: REMOVE });
      assert.deepStrictEqual([noFa.state, noFa.reason], ['fresh', null], 'absent fetchedAt with filed present');
    });

    // ── FH12: strict grammar rejection ───────────────────────────────────────
    await test('FH12 strict timestamp grammar: impossible/offset/permissive forms rejected; walk continues', function () {
      const noFallback = function () { return factsRecord({ fetchedAt: REMOVE }); };
      ['2025-13-40', '2026-02-30', '2026-5-8', 'May 8 2026', '1784073600000',
        '2026-07-01T00:00:00+02:00', '2026-07-01T99:00:00Z', '2026-07-01T00:60:00Z', '', 42
      ].forEach(function (bad) {
        const it = run([snap('facts', 'k', noFallback(), { filed: bad })],
          LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, factsMeta()).items[0];
        assert.deepStrictEqual([it.state, it.reason], ['degraded', 'NO_TIMESTAMP'],
          'rejected candidate ' + JSON.stringify(bad));
      });
      // empty / non-object timestamps with no record.fetchedAt
      [{}, 42, null, undefined].forEach(function (ts) {
        const it = run([snap('facts', 'k', noFallback(), ts)],
          LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, factsMeta()).items[0];
        assert.deepStrictEqual([it.state, it.reason], ['degraded', 'NO_TIMESTAMP'], 'ts ' + JSON.stringify(ts));
      });
      // a rejected candidate never blocks the walk
      const it = run([snap('facts', 'k', factsRecord(), { filed: '2026-02-30' })],
        LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, factsMeta()).items[0];
      assert.deepStrictEqual([it.timestampSource, it.usedFetchedAtFallback], ['fetchedAt', true]);
      // valid leap day is accepted
      const leap = run([snap('facts', 'k', factsRecord(), { filed: '2024-02-29' })],
        LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, factsMeta()).items[0];
      assert.strictEqual(leap.timestampSource, 'filed', '2024-02-29 is a real date');
      assert.strictEqual(leap.state, 'stale');
    });

    // ── FH13: window-table resolution matrix ─────────────────────────────────
    await test('FH13 window-table matrix, custom extras, frozen default, fixed note order', function () {
      const freshFacts = snap('facts', 'k', factsRecord(), { filed: ymdDaysAgo(68) });
      // valid versioned custom table
      let r = run([freshFacts], customTable(null, 'custom-v2'), CHECKED_AT, factsMeta());
      assert.strictEqual(r.windowTableVersion, 'custom-v2');
      assert.deepStrictEqual(r.degradedNotes, []);
      // valid but unversioned (missing / non-string / empty / whitespace-only)
      [null, 42, '', '   ', ' v1 '].forEach(function (v) {
        const rr = run([freshFacts], customTable(null, v === null ? null : v), CHECKED_AT, factsMeta());
        assert.strictEqual(rr.windowTableVersion, 'unversioned', 'version ' + JSON.stringify(v));
        assert.deepStrictEqual(rr.degradedNotes, ['WINDOW_TABLE_UNVERSIONED']);
        assert.strictEqual(rr.items[0].state, 'aging', 'custom table still USED (facts 68d aging)');
      });
      // malformed tables => full default substitution
      const missingFam = customTable(null, 'v'); delete missingFam.families.insider;
      const badEntry = customTable({ facts: { agingAfterDays: 'x', staleAfterDays: 121 } }, 'v');
      const negative = customTable({ facts: { agingAfterDays: -1, staleAfterDays: 121 } }, 'v');
      const inverted = customTable({ news: { agingAfterDays: 31, staleAfterDays: 30 } }, 'v');
      [42, null, undefined, {}, { families: 42 }, missingFam, badEntry, negative, inverted].forEach(function (bad, i) {
        const rr = run([freshFacts], bad, CHECKED_AT, factsMeta());
        assert.strictEqual(rr.windowTableVersion, 'eg25c1-spec-v1', 'substituted default (case ' + i + ')');
        assert.deepStrictEqual(rr.degradedNotes, ['WINDOW_TABLE_INVALID'], 'case ' + i);
        assert.strictEqual(rr.items[0].state, 'aging', 'default windows in effect (case ' + i + ')');
      });
      // custom extra family: recognized, generic validation, valid in expectedFamilies
      const weather = customTable({ weather: { agingAfterDays: 5, staleAfterDays: 10 } }, 'wx-v1');
      r = run([snap('weather', 'w1', genericRecord(), { filed: ymdDaysAgo(3) })],
        weather, CHECKED_AT, { ticker: 'X1', expectedFamilies: ['weather'] });
      assert.deepStrictEqual([r.items[0].state, r.coverageScore, r.degradedNotes], ['fresh', 1, []]);
      // ...but 'weather' is unrecognized under the DEFAULT table
      r = run([freshFacts], LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, { ticker: 'X1', expectedFamilies: ['weather'] });
      assert.deepStrictEqual(r.degradedNotes, ['EXPECTED_FAMILIES_INVALID']);
      // frozen default: recursive, mutation-proof
      assert.ok(Object.isFrozen(LIB.DEFAULT_WINDOW_TABLE));
      assert.ok(Object.isFrozen(LIB.DEFAULT_WINDOW_TABLE.families));
      assert.ok(Object.isFrozen(LIB.DEFAULT_WINDOW_TABLE.families.facts));
      try { LIB.DEFAULT_WINDOW_TABLE.families.facts.staleAfterDays = 1; } catch (_) { /* strict-mode throw ok */ }
      try { LIB.DEFAULT_WINDOW_TABLE.families.hacked = { agingAfterDays: 0, staleAfterDays: 0 }; } catch (_) { }
      assert.strictEqual(LIB.DEFAULT_WINDOW_TABLE.families.facts.staleAfterDays, 121);
      assert.ok(!('hacked' in LIB.DEFAULT_WINDOW_TABLE.families));
      // fixed note order, each at most once
      const multi = run('not-an-array', customTable(null, null), NaN, { expectedFamilies: 'nope' });
      assert.deepStrictEqual(multi.degradedNotes,
        ['WINDOW_TABLE_UNVERSIONED', 'CHECKED_AT_INVALID', 'RECORDS_INVALID', 'EXPECTED_FAMILIES_INVALID'],
        'fixed order, unique tokens');
    });

    // ── FH14: purity scan, import-inert child, freezing scope, echoes ────────
    await test('FH14 target purity + import-inert + freezing scope + sanitized echoes', function () {
      const src = fs.readFileSync(LIB_PATH, 'utf8').replace(/\r\n/g, '\n');
      const code = stripComments(src);
      ['fetch(', 'localStorage', 'sessionStorage', 'getStore', '@netlify/blobs', 'process.env',
        'Date.now(', 'new Date(', 'Date.parse(', 'document.', 'window.',
        'pt_results', 'pt_tickers', 'pt_holdings',
        'orchestrate(', 'analyzeChunk', 'enforceScoreConsistency', '_techCache', 'sentiment_score',
        'exports.handler', 'statusCode', 'require(', 'JSON.stringify('
      ].forEach(function (tok) {
        assert.ok(code.indexOf(tok) === -1, 'forbidden token in target: ' + tok);
      });
      assert.ok(/module\.exports/.test(code), 'module.exports present');
      assert.strictEqual(typeof LIB.evaluateEvidenceFreshness, 'function');
      // import-inert clean child under a throwing fetch guard
      const script =
        "globalThis.__fc = 0;" +
        "globalThis.fetch = function () { globalThis.__fc++; throw new Error('LIVE_NETWORK_FORBIDDEN'); };" +
        "var ns = require(" + JSON.stringify(LIB_PATH) + ");" +
        "if (typeof ns.evaluateEvidenceFreshness !== 'function') { process.exit(2); }" +
        "if (globalThis.__fc !== 0) { process.exit(4); }" +
        "process.exit(0);";
      const child = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', cwd: ROOT });
      assert.strictEqual(child.status, 0, 'clean-child import: ' + ((child.stderr || '') + (child.stdout || '')).trim());
      // freezing scope: exported data constants recursively frozen...
      [LIB.TIMESTAMP_PRECEDENCE, LIB.REASONS, LIB.DEGRADED_NOTES].forEach(function (c) {
        assert.ok(Object.isFrozen(c), 'constant frozen');
      });
      assert.strictEqual(LIB.WINDOW_TABLE_VERSION, 'eg25c1-spec-v1');
      assert.deepStrictEqual(LIB.TIMESTAMP_PRECEDENCE.slice(),
        ['filed', 'periodEnd', 'asOf', 'eventDate', 'fetchedAt']);
      // ...while the evaluator stays callable and caller inputs stay unfrozen
      const input = [snap('facts', 'k', factsRecord(), { filed: ymdDaysAgo(1) })];
      const rep = run(input, LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, factsMeta());
      assert.strictEqual(rep.items[0].state, 'fresh', 'evaluator callable after freeze checks');
      assert.ok(!Object.isFrozen(input) && !Object.isFrozen(input[0]), 'caller inputs not frozen');
      // sanitized output echoes: object/array/cyclic identities never survive
      const cyc = {}; cyc.self = cyc;
      const echoes = run([
        snap(['facts'], { bad: 1 }, factsRecord(), { filed: ymdDaysAgo(1) }),
        snap('facts', cyc, factsRecord(), { filed: ymdDaysAgo(1) })
      ], LIB.DEFAULT_WINDOW_TABLE, CHECKED_AT, factsMeta());
      echoes.items.forEach(function (it) {
        assert.ok(it.family === null || typeof it.family === 'string', 'family primitive');
        assert.ok(it.key === null || typeof it.key === 'string', 'key primitive');
      });
      assert.doesNotThrow(function () { JSON.stringify(echoes); }, 'echo report stringify-safe');
    });

    // suite-level invariant: the throwing guard was never reached
    assert.strictEqual(fetchCalls, 0, 'zero real fetch calls across the suite');
  } finally {
    globalThis.fetch = _origFetch;
  }

  const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
  if (failed > 0) { process.exit(1); }
}

runTests().catch(function (err) {
  process.stderr.write('FATAL: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
