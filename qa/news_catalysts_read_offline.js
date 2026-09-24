'use strict';

/*
 * qa/news_catalysts_read_offline.js
 *
 * Catalyst evidence surface · S3-M1 — news-catalysts-read R-series offline QA.
 *
 * Proves the read route core (netlify/functions/lib/news-catalysts-read-core.js)
 * and its .mjs wrapper (netlify/functions/news-catalysts-read.mjs) with ZERO
 * real network / Blob / production: the store is an in-memory fake handed
 * through the EVENT-ONLY _testStore seam, the clock is the request body's
 * injected `asOf` instant, and a throwing global.fetch guard is installed
 * throughout. Conformance reference: the frozen reader contract
 * work/s3-catalyst-evidence-surface/D-S3-1-reader-contract.md (19 fields, in
 * persisted order, checked here against records the REAL write core persists).
 *
 * Coverage (brief work/s3-catalyst-evidence-surface/brief.md §7, R-1..R-13,
 * plus S-1..S-6 mapped to brief §1 / §5 / §8 / §9 and D-S3-1 §5):
 *   R-1   gate off -> 200 DISABLED, no store call, zero fs / network
 *   R-2   OPTIONS -> 204 before the gate; non-POST -> 405
 *   R-3   bad ticker -> 400 INVALID_TICKER; malformed instant -> 400 INVALID_INSTANT, pre-store
 *   R-4   partial window: missing days are traversed, present days are returned
 *   R-5   all 31 partitions missing -> NOT_AVAILABLE/NO_RECORD only after the whole window
 *   R-6   store throw (acquire / index / item) -> DEGRADED/STORE_UNAVAILABLE, never NOT_AVAILABLE
 *   R-7   malformed index / item -> DEGRADED/STORE_RECORD_INVALID, no partial record
 *   R-8   happy path: exactly the 19 frozen fields, persisted order (write-core round-trip)
 *   R-9   non-conforming record omitted and counted, never repaired
 *   R-10  exactly 31 partition keys attempted, D0..D0-30, strong reads, window echoed
 *   R-11  negative: no store.set of any kind
 *   R-12  negative: no skippedItems key in any response
 *   R-13  negative: no wall-clock read in the core's source; deterministic bytes
 *   S-1   auth-first / configuration / INVALID_JSON / unknown body key / TICKER_NOT_ALLOWED
 *   S-2   read gate is distinct from the write gate
 *   S-3   .mjs wrapper: pinned pattern, no logic, Request parity
 *   S-4   import allowlist, lazy blobs, import-inert, index-driven only
 *   S-5   a key repeated across partitions is read once and returned once
 *   S-6   ticker-agnostic
 *   S-7   frozen D-S3-1 vocabularies == the provider's (drift tripwire); four-import pin in S-4
 *
 * Run: node qa/news_catalysts_read_offline.js
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const CORE_SRC = path.join(ROOT, 'netlify', 'functions', 'lib', 'news-catalysts-read-core.js');
const MJS_ABS = path.join(ROOT, 'netlify', 'functions', 'news-catalysts-read.mjs');
const WRITE_CORE_SRC = path.join(ROOT, 'netlify', 'functions', 'lib', 'news-catalysts-core.js');
const PROVIDER_SRC = path.join(ROOT, 'netlify', 'functions', 'lib', 'news-catalysts-provider.js');

const provider = require(PROVIDER_SRC);
const writeCore = require(WRITE_CORE_SRC);

// The module under test is loaded guarded so a missing/broken core reports as
// per-test FAILs rather than a FATAL before any assertion runs.
let core = null;
let coreLoadError = null;
try { core = require(CORE_SRC); } catch (e) { coreLoadError = e; }

const TICKER = 'FROG';
const AS_OF = '2026-09-20T14:30:00.000Z';
const D0 = '2026-09-20';
const TOKEN = 'tok-news-catalysts-read-qa-1';
const AUTH = 'Bearer ' + TOKEN;
const WRITE_TOKEN = 'tok-news-catalysts-write-qa-1';
const READ_CONTRACT_VERSION = 'news-catalysts-read-v1';
const ROUTE = 'https://qa.local/.netlify/functions/news-catalysts-read';
const ALLOWED_IMPORTS = ['@netlify/blobs', '@netlify/aws-lambda-compat', './lib/news-catalysts-read-core.js'];
const INDEX_PREFIX = 'fundstore:v1:news-index:';
const DAY_MS = 86400000;

// D-S3-1 §1 — the 17 provider fields + the 2 envelope fields, persisted order.
const RECORD_FIELD_ORDER = [
  'ticker', 'eventDate', 'category', 'direction', 'sourceUrl',
  'normalizedSourceUrl', 'sourceDomain', 'provider', 'retrievedAt',
  'identityHash', 'provenance', 'confidence', 'requiresVerification', 'scoringImpact',
  'eventType', 'relevanceScope', 'subType', 'sourceTier', 'contractVersion'
];

// ── env management (the core reads process.env at its boundary) ──────────────
const ENV_KEYS = [
  'PT_ENABLE_NEWS_CATALYSTS_READ_SERVER',
  'PT_NEWS_CATALYSTS_READ_TOKEN',
  'PT_NEWS_CATALYSTS_ALLOWED_TICKERS',
  'PT_ENABLE_NEWS_CATALYSTS_SERVER',
  'PT_NEWS_CATALYSTS_TOKEN',
  'PERPLEXITY_API_KEY',
  'PT_FUND_FACTS_TOKEN',
  'PT_FUND_FACTS_READ_TOKEN',
  'PT_OWNER_TOKEN',
  'PT_SEC_EVIDENCE_PULL_TOKEN',
  'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN'
];
// Every other known token must differ from the read token (write token included).
const COLLISION_KEYS = [
  'PT_NEWS_CATALYSTS_TOKEN', 'PT_FUND_FACTS_TOKEN', 'PT_FUND_FACTS_READ_TOKEN',
  'PT_OWNER_TOKEN', 'PT_SEC_EVIDENCE_PULL_TOKEN', 'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN'
];

function withEnv(envObj, fn) {
  const saved = {};
  ENV_KEYS.forEach(function (k) { saved[k] = process.env[k]; delete process.env[k]; });
  Object.keys(envObj || {}).forEach(function (k) {
    if (envObj[k] === undefined) { delete process.env[k]; } else { process.env[k] = envObj[k]; }
  });
  return Promise.resolve().then(fn).finally(function () {
    ENV_KEYS.forEach(function (k) {
      if (saved[k] === undefined) { delete process.env[k]; } else { process.env[k] = saved[k]; }
    });
  });
}

function armedEnv(extra) {
  return Object.assign({
    PT_ENABLE_NEWS_CATALYSTS_READ_SERVER: 'true',
    PT_NEWS_CATALYSTS_READ_TOKEN: TOKEN,
    PT_NEWS_CATALYSTS_ALLOWED_TICKERS: 'FROG,AAPL'
  }, extra || {});
}

// Write-side env for the R-8 round-trip through the REAL write core.
function writeArmedEnv() {
  return armedEnv({
    PT_ENABLE_NEWS_CATALYSTS_SERVER: 'true',
    PT_NEWS_CATALYSTS_TOKEN: WRITE_TOKEN,
    PERPLEXITY_API_KEY: 'pplx-test-key-123'
  });
}

// ── date helpers (independent of the core) ───────────────────────────────────
// Parsed from ISO text: Date.UTC(year, ...) would remap years 0..99 onto 1900..1999.
function utcDate(iso) {
  return new Date(Date.parse(iso + 'T00:00:00.000Z'));
}
function dayOffset(d0, n) {
  return new Date(utcDate(d0).getTime() - n * DAY_MS).toISOString().slice(0, 10);
}
function indexKeyFor(ticker, date) { return INDEX_PREFIX + ticker + ':' + date; }
function expectedWindowKeys(ticker, d0) {
  const keys = [];
  for (let i = 0; i <= 30; i++) { keys.push(indexKeyFor(ticker, dayOffset(d0, i))); }
  return keys;
}

// ── record fixtures (constructed in the persisted order) ─────────────────────
function hash(label) { return crypto.createHash('sha256').update(String(label)).digest('hex'); }
function record(label, overrides) {
  const base = {
    ticker: TICKER,
    eventDate: '2026-09-17',
    category: 'earnings_event',
    direction: 'positive',
    sourceUrl: 'https://ir.jfrog.com/news/' + label,
    normalizedSourceUrl: 'https://ir.jfrog.com/news/' + label,
    sourceDomain: 'ir.jfrog.com',
    provider: provider.PROVIDER_ID,
    retrievedAt: AS_OF,
    identityHash: hash(label),
    provenance: 'retrieval_unverified',
    confidence: null,
    requiresVerification: true,
    scoringImpact: 'none',
    eventType: 'catalyst',
    relevanceScope: 'company',
    subType: null,
    sourceTier: provider.SOURCE_TIER,
    contractVersion: provider.CONTRACT_VERSION
  };
  return Object.assign(base, overrides || {});
}
function keyOf(rec) { return provider.buildNewsKey(rec); }
function indexRecord(keys, date, ticker) {
  return {
    ticker: ticker || TICKER, fetchedAt: date + 'T12:00:00.000Z', sourceTier: provider.SOURCE_TIER,
    contractVersion: provider.CONTRACT_VERSION, provider: provider.PROVIDER_ID, keys: keys
  };
}
// Seeds one partition: every record under its own key, then the day index.
function seedDay(seed, date, records) {
  records.forEach(function (r) { seed[keyOf(r)] = JSON.stringify(r); });
  seed[indexKeyFor(TICKER, date)] = JSON.stringify(indexRecord(records.map(keyOf), date));
  return seed;
}
function keyed(obj) { const o = {}; Object.keys(obj).forEach(function (k) { o[k] = obj[k]; }); return o; }

// ── in-memory store fake (records ops; injectable faults; set is recorded, never needed) ──
function makeStore(opts) {
  opts = opts || {};
  const data = Object.assign({}, opts.seed || {});
  const log = [];
  return {
    data: data,
    log: log,
    get: async function (key, o) {
      log.push({ op: 'get', key: key, opts: o });
      if (opts.getThrows && opts.getThrows[key]) { throw new Error('boom-get-injected'); }
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    set: async function (key, value, o) {
      log.push({ op: 'set', key: key, value: value, opts: o });
      data[key] = value;
      return { modified: true };
    },
    list: async function () {
      log.push({ op: 'list' });
      throw new Error('LIST_FORBIDDEN');
    }
  };
}
function getOps(store) { return store.log.filter(function (e) { return e.op === 'get'; }); }
function setOps(store) { return store.log.filter(function (e) { return e.op === 'set'; }); }
function listOps(store) { return store.log.filter(function (e) { return e.op === 'list'; }); }
function indexGets(store) { return getOps(store).filter(function (e) { return e.key.indexOf(INDEX_PREFIX) === 0; }); }
function itemGets(store) { return getOps(store).filter(function (e) { return provider.NEWS_KEY_RE.test(e.key); }); }

// A store that must never be touched (pre-auth / gate-off / pre-store validation paths).
function poisonedStore(state) {
  return {
    get: async function () { state.touched = true; throw new Error('POISONED_STORE_TOUCHED'); },
    set: async function () { state.touched = true; throw new Error('POISONED_STORE_TOUCHED'); },
    list: async function () { state.touched = true; throw new Error('POISONED_STORE_TOUCHED'); }
  };
}

// ── event builder (seams are EVENT-ONLY) ──────────────────────────────────────
function makeEvent(o) {
  o = o || {};
  const ev = {
    httpMethod: Object.prototype.hasOwnProperty.call(o, 'method') ? o.method : 'POST',
    headers: { authorization: o.auth },
    body: o.body
  };
  if (o.store) { ev._testStore = o.store; }
  return ev;
}
function reqBody(extra) { return JSON.stringify(Object.assign({ ticker: TICKER, asOf: AS_OF }, extra || {})); }
async function read(store, extra, auth) {
  return core.handler(makeEvent({ auth: auth === undefined ? AUTH : auth, body: reqBody(extra), store: store }));
}
function parsedBody(r) { return JSON.parse(r.body); }
function assertExactBody(r, expected, label) {
  assert.deepStrictEqual(parsedBody(r), expected, label + ' (deep-equal)');
  assert.strictEqual(r.body, JSON.stringify(expected), label + ' (stringify/key-order)');
}
function assertNoRawText(r) {
  assert.ok(r.body.indexOf('boom') === -1 && r.body.indexOf('POISONED') === -1 && r.body.indexOf('LIST_FORBIDDEN') === -1,
    'no raw error text leaks into the response body');
}
function windowOf(d0) { return { from: dayOffset(d0, 30), to: d0 }; }
function okBody(records, omitted, asOf) {
  const at = asOf || AS_OF;
  return {
    status: 'OK', readContractVersion: READ_CONTRACT_VERSION, ticker: TICKER, asOf: at,
    window: windowOf(at.slice(0, 10)), records: records, omitted: omitted || 0
  };
}
function notAvailableBody(omitted, asOf) {
  const at = asOf || AS_OF;
  return { status: 'NOT_AVAILABLE', reason: 'NO_RECORD', ticker: TICKER, asOf: at, window: windowOf(at.slice(0, 10)), omitted: omitted || 0 };
}
function degradedBody(reason) { return { status: 'DEGRADED', reason: reason, ticker: TICKER }; }
function liveGuard() { throw new Error('LIVE_NETWORK_FORBIDDEN'); }
function readMjs() { return fs.readFileSync(MJS_ABS, 'utf8').replace(/\r\n/g, '\n'); }
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([^:'"])\/\/[^\n]*/g, '$1');
}

// Every response body produced during the suite is collected so the R-11 /
// R-12 negatives run over the whole observed surface, not one hand-picked case.
const observedBodies = [];
const observedStores = [];
function observe(r, store) {
  if (r && typeof r.body === 'string') { observedBodies.push(r.body); }
  if (store && store.log) { observedStores.push(store); }
  return r;
}

// ── runner ────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
async function test(label, fn) {
  try {
    if (!core) { throw new Error('core not loadable: ' + (coreLoadError && coreLoadError.message)); }
    await fn();
    process.stdout.write('  PASS  ' + label + '\n');
    passed += 1;
  } catch (err) {
    process.stdout.write('  FAIL  ' + label + '\n');
    process.stdout.write('         ' + (err && err.message ? err.message : err) + '\n');
    failed += 1;
  }
}

async function runTests() {
  process.stdout.write('\n=== S3-M1 — news-catalysts-read R-series (offline) ===\n\n');

  const _origFetch = global.fetch;
  let realFetchCalls = 0;
  global.fetch = function () { realFetchCalls += 1; return liveGuard(); };

  try {
    // ── R-1 ────────────────────────────────────────────────────────────────────
    await test('R-1 gate off (absent/TRUE/1/false/padded) -> 200 DISABLED, no store call, zero fs / network', async function () {
      const variants = [undefined, 'TRUE', '1', 'false', ' true', ''];
      for (const gate of variants) {
        await withEnv(armedEnv({ PT_ENABLE_NEWS_CATALYSTS_READ_SERVER: gate }), async function () {
          const fsNames = ['readFileSync', 'writeFileSync', 'existsSync', 'readdirSync', 'statSync', 'openSync', 'appendFileSync'];
          const saved = {};
          let fsCalls = 0;
          fsNames.forEach(function (n) { saved[n] = fs[n]; fs[n] = function () { fsCalls += 1; return saved[n].apply(fs, arguments); }; });
          const fetchBefore = realFetchCalls;
          const state = {};
          let r;
          try {
            r = observe(await read(poisonedStore(state)));
          } finally {
            fsNames.forEach(function (n) { fs[n] = saved[n]; });
          }
          assert.strictEqual(r.statusCode, 200, 'gate value ' + JSON.stringify(gate));
          assertExactBody(r, { status: 'DISABLED', reason: 'SERVER_DISABLED' }, 'DISABLED');
          assert.ok(!state.touched, 'store untouched for gate ' + JSON.stringify(gate));
          assert.strictEqual(realFetchCalls, fetchBefore, 'zero network');
          assert.strictEqual(fsCalls, 0, 'zero filesystem calls');
        });
      }
    });

    // ── R-2 ────────────────────────────────────────────────────────────────────
    await test('R-2 OPTIONS -> 204 before the gate (cors headers, no body); gate on, non-POST -> 405', async function () {
      await withEnv({}, async function () {
        const state = {};
        const r = observe(await core.handler(makeEvent({ method: 'OPTIONS', store: poisonedStore(state) })));
        assert.strictEqual(r.statusCode, 204);
        assert.ok(!('body' in r), '204 carries no body field');
        assert.strictEqual(r.headers['Access-Control-Allow-Methods'], 'POST, OPTIONS');
        assert.strictEqual(r.headers['Access-Control-Allow-Origin'], '*');
        assert.ok(!state.touched, 'store untouched');
      });
      await withEnv(armedEnv(), async function () {
        const state = {};
        for (const method of ['GET', 'PUT', 'DELETE', 'PATCH', undefined]) {
          const r = observe(await core.handler(makeEvent({ method: method, auth: AUTH, body: reqBody(), store: poisonedStore(state) })));
          assert.strictEqual(r.statusCode, 405, 'method ' + method);
          assertExactBody(r, { status: 'METHOD_NOT_ALLOWED', reason: 'METHOD_NOT_ALLOWED' }, '405');
        }
        assert.ok(!state.touched, 'store untouched');
      });
    });

    // ── R-3 ────────────────────────────────────────────────────────────────────
    await test('R-3 bad ticker -> 400 INVALID_TICKER; malformed instant -> 400 INVALID_INSTANT; both before any store I/O', async function () {
      await withEnv(armedEnv(), async function () {
        const state = {};
        for (const t of ['frog', ' FROG', 'FROG ', 'ABCDEFGHIJK', 'FR-G', '', 7, null, undefined, {}, ['FROG']]) {
          const body = JSON.stringify(t === undefined ? { asOf: AS_OF } : { ticker: t, asOf: AS_OF });
          const r = observe(await core.handler(makeEvent({ auth: AUTH, body: body, store: poisonedStore(state) })));
          assert.strictEqual(r.statusCode, 400, 'ticker: ' + JSON.stringify(t));
          assertExactBody(r, { status: 'INVALID_TICKER', reason: 'TICKER_INVALID' }, 'ticker ' + JSON.stringify(t));
        }
        const badInstants = [
          undefined, null, 7, '', '2026-09-20', '2026-09-20T14:30:00', '2026-09-20T14:30:00+00:00',
          '2026-09-20 14:30:00Z', '2026-09-20T14:30Z', '2026-09-20T14:30:00.1234Z', ' 2026-09-20T14:30:00Z',
          '2026-02-30T00:00:00Z', '2026-13-01T00:00:00Z', '2026-09-20T25:00:00Z', '2026-09-20T14:60:00Z',
          '2026-09-31T00:00:00Z', 'garbage', ['2026-09-20T14:30:00Z'],
          '0000-01-05T00:00:00Z' // its window would leave the four-digit-year grammar
        ];
        for (const at of badInstants) {
          const body = JSON.stringify(at === undefined ? { ticker: TICKER } : { ticker: TICKER, asOf: at });
          const r = observe(await core.handler(makeEvent({ auth: AUTH, body: body, store: poisonedStore(state) })));
          assert.strictEqual(r.statusCode, 400, 'instant: ' + JSON.stringify(at));
          assertExactBody(r, { status: 'INVALID_INSTANT', reason: 'INSTANT_INVALID' }, 'instant ' + JSON.stringify(at));
        }
        assert.ok(!state.touched, 'store untouched before request validation passes');
        // Positive controls: every grammar variant the write side accepts is accepted here.
        for (const at of ['2026-09-20T14:30:00Z', '2026-09-20T14:30:00.5Z', '2026-09-20T14:30:00.50Z', '2026-09-20T23:59:59.999Z', '2024-02-29T00:00:00Z']) {
          const store = makeStore();
          const r = observe(await read(store, { asOf: at }), store);
          assert.strictEqual(parsedBody(r).status, 'NOT_AVAILABLE', 'accepted instant ' + at);
          assert.strictEqual(parsedBody(r).asOf, at, 'instant echoed verbatim');
        }
      });
    });

    // ── R-4 ────────────────────────────────────────────────────────────────────
    await test('R-4 partial window (D0, D0-3, D0-30 present; 28 days missing) -> every present day returned, missing days traversed', async function () {
      await withEnv(armedEnv(), async function () {
        const a = record('a', { eventDate: D0, retrievedAt: D0 + 'T12:00:00.000Z' });
        const b1 = record('b1', { eventDate: dayOffset(D0, 4), retrievedAt: dayOffset(D0, 3) + 'T12:00:00.000Z' });
        const b2 = record('b2', { eventDate: dayOffset(D0, 3), retrievedAt: dayOffset(D0, 3) + 'T12:00:00.000Z', category: 'guidance_update', direction: 'neutral' });
        const c = record('c', { eventDate: dayOffset(D0, 30), retrievedAt: dayOffset(D0, 30) + 'T12:00:00.000Z' });
        const seed = {};
        seedDay(seed, D0, [a]);
        seedDay(seed, dayOffset(D0, 3), [b1, b2]);
        seedDay(seed, dayOffset(D0, 30), [c]);
        const store = makeStore({ seed: seed });
        const r = observe(await read(store), store);
        assert.strictEqual(r.statusCode, 200);
        assertExactBody(r, okBody([a, b1, b2, c], 0), 'newest partition first, index order within a partition');
        assert.strictEqual(indexGets(store).length, 31, 'all 31 partitions attempted despite 28 missing days');
        assert.strictEqual(itemGets(store).length, 4, 'one item read per listed key');
        assert.notStrictEqual(parsedBody(r).status, 'NOT_AVAILABLE', 'a missing day never terminates the read');
        // Planted negative: an early-stop reader would have made fewer index reads than 31.
        assert.ok(indexGets(store).length > 1, 'the read did not stop at the first partition');
      });
    });

    // ── R-5 ────────────────────────────────────────────────────────────────────
    await test('R-5 all 31 partitions missing -> NOT_AVAILABLE/NO_RECORD, only after 31 index reads, zero item reads', async function () {
      await withEnv(armedEnv(), async function () {
        const store = makeStore();
        const r = observe(await read(store), store);
        assert.strictEqual(r.statusCode, 200);
        assertExactBody(r, notAvailableBody(0), 'NOT_AVAILABLE after the whole window');
        assert.strictEqual(indexGets(store).length, 31, 'exactly 31 partitions attempted');
        assert.strictEqual(itemGets(store).length, 0, 'no item read without an index');
        assert.strictEqual(getOps(store).length, 31, 'nothing else read');
        // Every record non-conforming => still NOT_AVAILABLE (no usable record), with the count carried.
        const bad = record('bad', { contractVersion: 'news-contract-v0' });
        const store2 = makeStore({ seed: seedDay({}, D0, [bad]) });
        const r2 = observe(await read(store2), store2);
        assertExactBody(r2, notAvailableBody(1), 'no usable record => NOT_AVAILABLE with omitted count');
        assert.strictEqual(indexGets(store2).length, 31, 'the whole window was still attempted');
      });
    });

    // ── R-6 ────────────────────────────────────────────────────────────────────
    await test('R-6 store acquire throw / index get throw (partition 0, 7, 30) / item get throw -> DEGRADED/STORE_UNAVAILABLE, never NOT_AVAILABLE', async function () {
      await withEnv(armedEnv(), async function () {
        const ev = makeEvent({ auth: AUTH, body: reqBody() });
        Object.defineProperty(ev, '_testStore', { get: function () { throw new Error('boom-acquire'); } });
        const r0 = observe(await core.handler(ev));
        assert.strictEqual(r0.statusCode, 200);
        assertExactBody(r0, degradedBody('STORE_UNAVAILABLE'), 'acquire throw');
        assertNoRawText(r0);
        for (const k of [0, 7, 30]) {
          const throws = {}; throws[indexKeyFor(TICKER, dayOffset(D0, k))] = true;
          const store = makeStore({ getThrows: throws });
          const r = observe(await read(store), store);
          assertExactBody(r, degradedBody('STORE_UNAVAILABLE'), 'index get throw at partition ' + k);
          assert.notStrictEqual(parsedBody(r).status, 'NOT_AVAILABLE', 'never NOT_AVAILABLE on a store failure (partition ' + k + ')');
          assert.ok(!('records' in parsedBody(r)), 'no records field on DEGRADED');
          assertNoRawText(r);
        }
        const good = record('good');
        const seed = seedDay({}, D0, [good]);
        const throws = {}; throws[keyOf(good)] = true;
        const store = makeStore({ seed: seed, getThrows: throws });
        const r = observe(await read(store), store);
        assertExactBody(r, degradedBody('STORE_UNAVAILABLE'), 'item get throw');
        assertNoRawText(r);
      });
    });

    // ── R-7 ────────────────────────────────────────────────────────────────────
    await test('R-7 malformed index / dangling pointer / malformed item -> DEGRADED/STORE_RECORD_INVALID; no partial record, no good sibling leaked', async function () {
      await withEnv(armedEnv(), async function () {
        const good = record('good');
        const badKeyForeign = 'fundstore:v1:news:AAPL:2026-09-17:' + hash('foreign');
        const indexCases = [
          ['index garbage json', 'garbage{{'],
          ['index array', '[1,2]'],
          ['index null literal', 'null'],
          ['index string literal', '"x"'],
          ['index keys missing', JSON.stringify((function () { const i = indexRecord([keyOf(good)], D0); delete i.keys; return i; })())],
          ['index keys not array', JSON.stringify(Object.assign(indexRecord([], D0), { keys: keyOf(good) }))],
          ['index key non-string', JSON.stringify(indexRecord([7], D0))],
          ['index key off-regex (never a guessed hash)', JSON.stringify(indexRecord(['fundstore:v1:news:FROG:2026-09-17:zz'], D0))],
          ['index key for another ticker', JSON.stringify(indexRecord([badKeyForeign], D0))],
          ['index foreign ticker', JSON.stringify(indexRecord([keyOf(good)], D0, 'AAPL'))],
          ['index foreign contractVersion', JSON.stringify(Object.assign(indexRecord([keyOf(good)], D0), { contractVersion: 'news-contract-v0' }))],
          ['index foreign sourceTier', JSON.stringify(Object.assign(indexRecord([keyOf(good)], D0), { sourceTier: 'foreign' }))],
          ['index foreign provider', JSON.stringify(Object.assign(indexRecord([keyOf(good)], D0), { provider: 'foreign' }))],
          ['index fetchedAt not a string', JSON.stringify(Object.assign(indexRecord([keyOf(good)], D0), { fetchedAt: 7 }))],
          ['index fetchedAt impossible time on the right date', JSON.stringify(Object.assign(indexRecord([keyOf(good)], D0), { fetchedAt: D0 + 'T99:99:99Z' }))],
          ['index fetchedAt off-grammar', JSON.stringify(Object.assign(indexRecord([keyOf(good)], D0), { fetchedAt: 'yesterday' }))],
          ['index misfiled: fetchedAt names D0-31, filed under D0', JSON.stringify(indexRecord([keyOf(good)], dayOffset(D0, 31)))],
          ['index misfiled: fetchedAt names D0+1, filed under D0', JSON.stringify(indexRecord([keyOf(good)], dayOffset(D0, -1)))],
          ['index empty keys but foreign provider (no silent NOT_AVAILABLE)', JSON.stringify(Object.assign(indexRecord([], D0), { provider: 'foreign' }))],
          ['index sourceTier absent', JSON.stringify((function () { const i = indexRecord([keyOf(good)], D0); delete i.sourceTier; return i; })())]
        ];
        for (const pair of indexCases) {
          // The good sibling lives on another partition so a partial success would be observable.
          const seed = seedDay({}, dayOffset(D0, 2), [good]);
          seed[keyOf(good)] = JSON.stringify(good);
          seed[badKeyForeign] = JSON.stringify(record('foreign', { ticker: 'AAPL' }));
          seed[indexKeyFor(TICKER, D0)] = pair[1];
          const store = makeStore({ seed: seed });
          const r = observe(await read(store), store);
          assert.strictEqual(r.statusCode, 200, pair[0]);
          assertExactBody(r, degradedBody('STORE_RECORD_INVALID'), pair[0]);
          assert.ok(!('records' in parsedBody(r)), 'no records field: ' + pair[0]);
          assert.strictEqual(r.body.indexOf(good.sourceUrl), -1, 'good sibling never leaks into a DEGRADED body: ' + pair[0]);
          assertNoRawText(r);
        }
        const itemCases = [
          ['dangling pointer (index lists a key the store lacks)', undefined],
          ['item garbage json', 'garbage{{'],
          ['item array', '[]'],
          ['item null literal', 'null'],
          ['item string literal', '"str"'],
          ['item number literal', '7'],
          // A conforming record filed under a key that does not name it is corruption, not a match.
          ['item filed under a key with a different identityHash', JSON.stringify(record('bad-item', { identityHash: hash('some-other-event') }))],
          ['item filed under a key with a different eventDate', JSON.stringify(record('bad-item', { eventDate: '2026-09-01' }))]
        ];
        for (const pair of itemCases) {
          const bad = record('bad-item');
          const seed = seedDay({}, D0, [bad, good]);
          if (pair[1] === undefined) { delete seed[keyOf(bad)]; } else { seed[keyOf(bad)] = pair[1]; }
          const store = makeStore({ seed: seed });
          const r = observe(await read(store), store);
          assertExactBody(r, degradedBody('STORE_RECORD_INVALID'), pair[0]);
          assert.ok(!('records' in parsedBody(r)), 'no partial record: ' + pair[0]);
          assert.strictEqual(r.body.indexOf(good.sourceUrl), -1, 'good sibling never leaks: ' + pair[0]);
          assertNoRawText(r);
        }
      });
    });

    // ── R-8 ────────────────────────────────────────────────────────────────────
    await test('R-8 happy path: records persisted by the REAL write core read back with exactly the 19 frozen fields in persisted order; extras dropped, shuffled input re-ordered', async function () {
      await withEnv(writeArmedEnv(), async function () {
        const store = makeStore();
        // Provider items = the 17 provider fields (the write core appends sourceTier/contractVersion).
        const items = [
          record('rt-1', { eventDate: '2026-09-17' }),
          record('rt-2', { eventDate: '2026-09-18', category: 'other_catalyst', subType: 'spin-off filing', direction: 'neutral' }),
          record('rt-3', { eventDate: '2026-11-19', eventType: 'upcoming_event', direction: null })
        ].map(function (rec) { const it = keyed(rec); delete it.sourceTier; delete it.contractVersion; return it; });
        const envelope = {
          ticker: TICKER, fetchedAt: AS_OF, sourceTier: provider.SOURCE_TIER, contractVersion: provider.CONTRACT_VERSION,
          provider: provider.PROVIDER_ID, items: items, skippedItems: [], writtenKeys: []
        };
        const w = await writeCore.handler({
          httpMethod: 'POST', headers: { authorization: 'Bearer ' + WRITE_TOKEN }, body: JSON.stringify({ ticker: TICKER }),
          _testStore: store, _testProviderOptions: { nowIso: AS_OF, providerImpl: async function () { return { ok: true, envelope: envelope }; } }
        });
        assert.strictEqual(parsedBody(w).status, 'WRITE', 'write core persisted the fixture: ' + w.body);
        const itemKeys = items.map(provider.buildNewsKey);
        assert.strictEqual(setOps(store).length, 4, 'three items + one index persisted by the write core (setup, not observed)');
        // Read back through the read core over a fresh store holding the written bytes, so the
        // op log (and the R-11 negative) covers only the read's own operations.
        const readStore = makeStore({ seed: store.data });
        const setsBefore = Object.keys(readStore.data).length;
        const r = observe(await read(readStore), readStore);
        assert.strictEqual(r.statusCode, 200);
        const body = parsedBody(r);
        assert.strictEqual(body.status, 'OK');
        assert.strictEqual(body.readContractVersion, READ_CONTRACT_VERSION);
        assert.strictEqual(body.records.length, 3, 'every persisted record returned');
        assert.strictEqual(body.omitted, 0);
        body.records.forEach(function (rec, i) {
          assert.deepStrictEqual(Object.keys(rec), RECORD_FIELD_ORDER, 'exactly the 19 frozen fields, persisted order (record ' + i + ')');
          assert.strictEqual(JSON.stringify(rec), readStore.data[itemKeys[i]], 'byte-equal to the persisted record ' + i);
        });
        assert.strictEqual(setOps(readStore).length, 0, 'the read performed zero writes');
        assert.strictEqual(Object.keys(readStore.data).length, setsBefore, 'the read left the store byte-for-byte unchanged');
        // Conditional-null positives survive: upcoming_event keeps direction null; other_catalyst keeps its subType text.
        assert.strictEqual(body.records[2].eventType, 'upcoming_event');
        assert.strictEqual(body.records[2].direction, null);
        assert.strictEqual(body.records[1].subType, 'spin-off filing');
        assertExactBody(r, okBody(itemKeys.map(function (k) { return JSON.parse(readStore.data[k]); }), 0), 'exact OK envelope');
      });
      await withEnv(armedEnv(), async function () {
        // A stored record whose key order was shuffled is returned in the persisted order.
        const good = record('order');
        const shuffled = {};
        Object.keys(good).reverse().forEach(function (k) { shuffled[k] = good[k]; });
        const seed = seedDay({}, D0, [good]);
        seed[keyOf(good)] = JSON.stringify(shuffled);
        const store = makeStore({ seed: seed });
        const r = observe(await read(store), store);
        assertExactBody(r, okBody([good], 0), 'persisted order regardless of stored key order');
        // A stored record carrying an extra key is projected to the 19 fields — the extra never leaves the store.
        const withExtra = keyed(good); withExtra.summary = 'BIG HEADLINE narrative';
        const seed2 = seedDay({}, D0, [good]);
        seed2[keyOf(good)] = JSON.stringify(withExtra);
        const store2 = makeStore({ seed: seed2 });
        const r2 = observe(await read(store2), store2);
        assertExactBody(r2, okBody([good], 0), 'exactly the 19 fields');
        assert.strictEqual(r2.body.indexOf('BIG HEADLINE'), -1, 'extra key value never returned');
      });
    });

    // ── R-9 ────────────────────────────────────────────────────────────────────
    await test('R-9 non-conforming record (contractVersion mismatch, absent key, conditional-null violation, constant drift, foreign ticker) -> omitted and counted, never repaired; conforming siblings returned', async function () {
      await withEnv(armedEnv(), async function () {
        const good = record('good');
        function mut(fn) { const it = record('mut'); fn(it); return it; }
        const cases = [
          ['contractVersion mismatch', mut(function (it) { it.contractVersion = 'news-contract-v0'; })],
          ['contractVersion absent', mut(function (it) { delete it.contractVersion; })],
          ['sourceTier absent', mut(function (it) { delete it.sourceTier; })],
          ['eventDate absent', mut(function (it) { delete it.eventDate; })],
          ['subType absent (absent is not null)', mut(function (it) { delete it.subType; })],
          ['confidence absent (absent is not null)', mut(function (it) { delete it.confidence; })],
          ['direction absent', mut(function (it) { delete it.direction; })],
          ['direction non-null on upcoming_event', mut(function (it) { it.eventType = 'upcoming_event'; it.direction = 'positive'; })],
          ['direction null on catalyst', mut(function (it) { it.direction = null; })],
          ['direction off-vocabulary on catalyst', mut(function (it) { it.direction = 'sideways'; })],
          ['eventType off-vocabulary', mut(function (it) { it.eventType = 'rumor'; })],
          ['subType null on other_catalyst', mut(function (it) { it.category = 'other_catalyst'; it.subType = null; })],
          ['subType empty on other_catalyst', mut(function (it) { it.category = 'other_catalyst'; it.subType = ''; })],
          ['subType whitespace on other_catalyst', mut(function (it) { it.category = 'other_catalyst'; it.subType = '   '; })],
          ['subType non-null outside other_catalyst', mut(function (it) { it.subType = 'extra'; })],
          ['category off-vocabulary', mut(function (it) { it.category = 'weather_report'; })],
          ['relevanceScope off-vocabulary', mut(function (it) { it.relevanceScope = 'global'; })],
          ['provenance drift', mut(function (it) { it.provenance = 'verified'; })],
          ['confidence populated', mut(function (it) { it.confidence = 0.9; })],
          ['requiresVerification false', mut(function (it) { it.requiresVerification = false; })],
          ['scoringImpact drift', mut(function (it) { it.scoringImpact = 'positive'; })],
          ['sourceTier drift', mut(function (it) { it.sourceTier = 'sec_xbrl_primary'; })],
          ['provider drift', mut(function (it) { it.provider = 'someone-else@v1'; })],
          ['foreign ticker under this ticker\'s key', mut(function (it) { it.ticker = 'AAPL'; })],
          ['http sourceUrl', mut(function (it) { it.sourceUrl = 'http://ir.jfrog.com/x'; })],
          ['non-string normalizedSourceUrl', mut(function (it) { it.normalizedSourceUrl = 7; })],
          ['empty sourceDomain', mut(function (it) { it.sourceDomain = ''; })],
          ['retrievedAt off-grammar', mut(function (it) { it.retrievedAt = '2026-09-20'; })],
          ['retrievedAt impossible time', mut(function (it) { it.retrievedAt = '2026-09-24T99:99:99Z'; })],
          ['retrievedAt impossible date', mut(function (it) { it.retrievedAt = '2026-02-30T00:00:00Z'; })],
          ['identityHash off-grammar', mut(function (it) { it.identityHash = 'zz'; })],
          ['eventDate off-grammar', mut(function (it) { it.eventDate = '2026/09/17'; })]
        ];
        const mutKey = keyOf(record('mut'));
        for (const pair of cases) {
          const seed = seedDay({}, D0, [record('mut'), good]);
          seed[mutKey] = JSON.stringify(pair[1]);
          const store = makeStore({ seed: seed });
          const r = observe(await read(store), store);
          assert.strictEqual(r.statusCode, 200, pair[0]);
          assertExactBody(r, okBody([good], 1), pair[0] + ': omitted and counted, sibling returned');
          assert.strictEqual(r.body.indexOf(hash('mut')), -1, pair[0] + ': never partially returned or repaired');
          assert.strictEqual(itemGets(store).length, 2, pair[0] + ': both keys were read');
        }
        // Positive controls: both conditional-null shapes conform when satisfied.
        const up = record('up', { eventType: 'upcoming_event', direction: null, eventDate: '2026-11-19' });
        const other = record('other', { category: 'other_catalyst', subType: 'general' });
        const store = makeStore({ seed: seedDay({}, D0, [up, other, good]) });
        const r = observe(await read(store), store);
        assertExactBody(r, okBody([up, other, good], 0), 'conditional-null positives conform');
        // Count is exact across several omissions.
        const b1 = record('b1', { contractVersion: 'news-contract-v0' });
        const b2 = record('b2', { direction: null });
        const b3 = record('b3'); delete b3.subType;
        const store2 = makeStore({ seed: seedDay({}, D0, [b1, good, b2, b3]) });
        const r2 = observe(await read(store2), store2);
        assertExactBody(r2, okBody([good], 3), 'omitted count is exact');
      });
    });

    // ── R-10 ───────────────────────────────────────────────────────────────────
    await test('R-10 window bound: exactly 31 strong index reads, D0..D0-30 in order, month boundary and leap day correct, never a 32nd, window echoed', async function () {
      await withEnv(armedEnv(), async function () {
        const cases = [
          [AS_OF, D0, '2026-08-21'],
          ['2026-10-05T00:00:00Z', '2026-10-05', '2026-09-05'],
          ['2028-03-01T23:59:59.999Z', '2028-03-01', '2028-01-31'],
          ['2027-03-01T00:00:00Z', '2027-03-01', '2027-01-30'],
          ['2026-01-15T12:00:00Z', '2026-01-15', '2025-12-16'],
          ['2100-03-01T00:00:00Z', '2100-03-01', '2100-01-30'],   // 2100 is not a leap year
          ['0099-03-01T00:00:00Z', '0099-03-01', '0099-01-30'],   // Date.UTC would remap 0099 -> 1999
          ['0001-02-01T00:00:00Z', '0001-02-01', '0001-01-02']
        ];
        for (const c of cases) {
          const store = makeStore();
          const r = observe(await read(store, { asOf: c[0] }), store);
          const gets = getOps(store);
          assert.strictEqual(gets.length, 31, 'exactly 31 reads for ' + c[0]);
          assert.deepStrictEqual(gets.map(function (g) { return g.key; }), expectedWindowKeys(TICKER, c[1]), 'D0..D0-30 in order for ' + c[0]);
          gets.forEach(function (g) { assert.deepStrictEqual(g.opts, { consistency: 'strong' }, 'strong read: ' + g.key); });
          assert.strictEqual(gets[0].key, indexKeyFor(TICKER, c[1]), 'first partition is D0');
          assert.strictEqual(gets[30].key, indexKeyFor(TICKER, c[2]), 'last partition is D0-30 (' + c[2] + ')');
          const keys = gets.map(function (g) { return g.key; });
          assert.strictEqual(keys.indexOf(indexKeyFor(TICKER, dayOffset(c[1], 31))), -1, 'D0-31 never attempted');
          assert.strictEqual(keys.indexOf(indexKeyFor(TICKER, dayOffset(c[1], -1))), -1, 'D0+1 never attempted');
          assert.deepStrictEqual(parsedBody(r).window, { from: c[2], to: c[1] }, 'window echoed for ' + c[0]);
        }
        // Exported helper agrees with the independent derivation.
        assert.strictEqual(typeof core.partitionDates, 'function', 'partitionDates exported');
        assert.deepStrictEqual(core.partitionDates(D0), expectedWindowKeys(TICKER, D0).map(function (k) { return k.slice(k.lastIndexOf(':') + 1); }));
        assert.strictEqual(core.partitionDates('2028-03-01').length, 31);
        assert.strictEqual(core.indexKey(TICKER, D0), indexKeyFor(TICKER, D0));
      });
    });

    // ── R-11 ───────────────────────────────────────────────────────────────────
    await test('R-11 negative: no store.set / list of any kind across every observed scenario; no write surface in the core source', async function () {
      assert.ok(observedStores.length > 10, 'enough scenarios observed: ' + observedStores.length);
      observedStores.forEach(function (s) {
        assert.strictEqual(setOps(s).length, 0, 'zero set ops');
        assert.strictEqual(listOps(s).length, 0, 'zero list ops');
      });
      const s = stripComments(fs.readFileSync(CORE_SRC, 'utf8'));
      [[/\.set\s*\(/, 'store.set'], [/setJSON/, 'setJSON'], [/onlyIfNew/, 'onlyIfNew'], [/\.delete\s*\(/, 'store.delete'],
        [/\.list\s*\(/, 'store.list / prefix enumeration'], [/writtenKeys/, 'writtenKeys']]
        .forEach(function (pair) { assert.ok(!pair[0].test(s), 'core must NOT contain ' + pair[1]); });
    });

    // ── R-12 ───────────────────────────────────────────────────────────────────
    await test('R-12 negative: no skippedItems key in any observed response; no skip/envelope-internal tokens in the core source', async function () {
      assert.ok(observedBodies.length > 50, 'enough responses observed: ' + observedBodies.length);
      observedBodies.forEach(function (b) {
        assert.strictEqual(b.indexOf('skippedItems'), -1, 'no skippedItems in: ' + b.slice(0, 80));
        assert.strictEqual(b.indexOf('evidenceBindings'), -1, 'no evidenceBindings');
        assert.strictEqual(b.indexOf('evidenceSetSize'), -1, 'no evidenceSetSize');
      });
      const s = stripComments(fs.readFileSync(CORE_SRC, 'utf8'));
      [/skippedItems/, /SKIP_REASONS/, /evidenceBindings/, /evidenceSetSize/, /normalizeNewsResponse/, /getNewsCatalysts/, /IDENTITY_SCHEMA_VERSION/]
        .forEach(function (re) { assert.ok(!re.test(s), 'core must NOT contain ' + re); });
    });

    // ── R-13 ───────────────────────────────────────────────────────────────────
    await test('R-13 negative: no wall-clock read in the core source (comment-stripped); byte-identical responses for the same injected instant', async function () {
      const s = stripComments(fs.readFileSync(CORE_SRC, 'utf8'));
      [[/Date\.now\s*\(/, 'Date.now()'], [/new\s+Date\s*\(\s*\)/, 'new Date() wall clock'], [/(^|[^.\w])Date\s*\(\s*\)/, 'Date() wall clock'],
        [/performance\.now/, 'performance.now'], [/hrtime/, 'process.hrtime'], [/toISOString\s*\(\s*\)\s*;?\s*$/m, 'ambient toISOString of an implicit now']]
        .forEach(function (pair) { assert.ok(!pair[0].test(s), 'core must NOT contain ' + pair[1]); });
      const ctor = s.match(/new\s+Date\s*\([^)]*\)/g) || [];
      ctor.forEach(function (m) { assert.ok(/\(\s*\S/.test(m), 'every Date constructor takes an explicit argument: ' + m); });
      await withEnv(armedEnv(), async function () {
        const bodies = [];
        for (let i = 0; i < 2; i++) {
          const store = makeStore({ seed: seedDay(seedDay({}, D0, [record('d1')]), dayOffset(D0, 9), [record('d2')]) });
          bodies.push(observe(await read(store), store).body);
        }
        assert.strictEqual(bodies[0], bodies[1], 'deterministic bytes');
      });
    });

    // ── S-1 ────────────────────────────────────────────────────────────────────
    await test('S-1 auth-first 401; configuration 500; post-auth INVALID_JSON 400; unknown body key 400; non-allowlisted ticker 403; store untouched throughout', async function () {
      await withEnv(armedEnv(), async function () {
        const state = {};
        for (const auth of ['Bearer wrong-token', undefined, '', 'bearer ' + TOKEN, TOKEN, 'Bearer ' + TOKEN + ' ']) {
          const r = observe(await core.handler(makeEvent({ auth: auth, body: '{{{not-json', store: poisonedStore(state) })));
          assert.strictEqual(r.statusCode, 401, 'auth ' + JSON.stringify(auth));
          assertExactBody(r, { status: 'UNAUTHORIZED', reason: 'UNAUTHORIZED' }, '401');
        }
        // The write token never authenticates a read.
        const rw = observe(await core.handler(makeEvent({ auth: 'Bearer ' + WRITE_TOKEN, body: reqBody(), store: poisonedStore(state) })));
        assert.strictEqual(rw.statusCode, 401, 'write token rejected on the read route');
        for (const body of ['{{{', '[1,2]', 'null', '', undefined, '   ', '"FROG"']) {
          const r = observe(await core.handler(makeEvent({ auth: AUTH, body: body, store: poisonedStore(state) })));
          assert.strictEqual(r.statusCode, 400, 'body: ' + JSON.stringify(body));
          assertExactBody(r, { status: 'INVALID_JSON', reason: 'INVALID_JSON' }, 'INVALID_JSON');
        }
        for (const extra of [{ extra: 1 }, { _testStore: { evil: true } }, { nowIso: AS_OF }, { skippedItems: [] }, { asof: AS_OF }]) {
          const r = observe(await read(poisonedStore(state), extra));
          assert.strictEqual(r.statusCode, 400, 'unknown key ' + JSON.stringify(extra));
          assertExactBody(r, { status: 'INVALID_REQUEST', reason: 'UNKNOWN_BODY_KEY' }, 'unknown body key');
        }
        for (const t of ['MSFT', 'TSLA']) {
          const r = observe(await core.handler(makeEvent({ auth: AUTH, body: JSON.stringify({ ticker: t, asOf: AS_OF }), store: poisonedStore(state) })));
          assert.strictEqual(r.statusCode, 403, 'not allowlisted: ' + t);
          assertExactBody(r, { status: 'TICKER_NOT_ALLOWED', reason: 'TICKER_NOT_ALLOWED' }, '403');
          assert.notStrictEqual(parsedBody(r).status, 'NOT_AVAILABLE', 'NOT_AVAILABLE is reserved for the completed window');
        }
        assert.ok(!state.touched, 'store untouched on every pre-store path');
      });
      const cases = [];
      COLLISION_KEYS.forEach(function (k) { const e = {}; e[k] = TOKEN; cases.push([armedEnv(e), 'TOKEN_COLLISION']); });
      cases.push([armedEnv({ PT_NEWS_CATALYSTS_ALLOWED_TICKERS: undefined }), 'ALLOWLIST_MISSING']);
      cases.push([armedEnv({ PT_NEWS_CATALYSTS_ALLOWED_TICKERS: '  ' }), 'ALLOWLIST_MISSING']);
      cases.push([armedEnv({ PT_NEWS_CATALYSTS_ALLOWED_TICKERS: 'FR0G' }), 'ALLOWLIST_INVALID']);
      for (const pair of cases) {
        await withEnv(pair[0], async function () {
          const state = {};
          const r = observe(await core.handler(makeEvent({ auth: AUTH, body: '{{{', store: poisonedStore(state) })));
          assert.strictEqual(r.statusCode, 500, pair[1]);
          assertExactBody(r, { status: 'CONFIGURATION_MISSING', reason: pair[1] }, pair[1]);
          assert.ok(!state.touched, 'store untouched: ' + pair[1]);
        });
      }
      // Missing read token folds into UNAUTHORIZED (no auth oracle), as the precedent does.
      await withEnv(armedEnv({ PT_NEWS_CATALYSTS_READ_TOKEN: undefined }), async function () {
        const state = {};
        const r = observe(await read(poisonedStore(state)));
        assertExactBody(r, { status: 'UNAUTHORIZED', reason: 'UNAUTHORIZED' }, 'missing server token');
        assert.ok(!state.touched);
      });
      // mapPreflightFailure is total.
      const m = core.mapPreflightFailure;
      assert.strictEqual(typeof m, 'function');
      for (const unknown of ['SOMETHING_NEW', undefined, null, 42, '']) {
        const r = m(unknown);
        assert.strictEqual(r.statusCode, 500);
        assertExactBody(r, { status: 'ERROR', reason: 'PREFLIGHT_UNMAPPED' }, 'default case');
      }
    });

    // ── S-2 ────────────────────────────────────────────────────────────────────
    await test('S-2 read gate is distinct from the write gate: write ON + read OFF -> DISABLED; read ON + write OFF -> proceeds; structural pin', async function () {
      await withEnv(armedEnv({ PT_ENABLE_NEWS_CATALYSTS_READ_SERVER: undefined, PT_ENABLE_NEWS_CATALYSTS_SERVER: 'true', PT_NEWS_CATALYSTS_TOKEN: WRITE_TOKEN }), async function () {
        const state = {};
        const r = observe(await read(poisonedStore(state)));
        assertExactBody(r, { status: 'DISABLED', reason: 'SERVER_DISABLED' }, 'write gate does not arm the read route');
        assert.ok(!state.touched);
      });
      await withEnv(armedEnv({ PT_ENABLE_NEWS_CATALYSTS_SERVER: undefined }), async function () {
        const store = makeStore();
        const r = observe(await read(store), store);
        assert.strictEqual(parsedBody(r).status, 'NOT_AVAILABLE', 'read gate alone arms the read route');
      });
      const s = stripComments(fs.readFileSync(CORE_SRC, 'utf8'));
      assert.ok(/process\.env\.PT_ENABLE_NEWS_CATALYSTS_READ_SERVER\s*!==\s*'true'/.test(s), 'strict read gate check');
      const envNames = new Set((s.match(/process\.env\.(\w+)/g) || []).map(function (x) { return x.slice('process.env.'.length); }));
      assert.deepStrictEqual(Array.from(envNames).sort(), ['PT_ENABLE_NEWS_CATALYSTS_READ_SERVER'], 'only the read gate is dereferenced directly');
      assert.ok(!/PT_ENABLE_NEWS_CATALYSTS_SERVER\b/.test(s), 'the write gate name never appears as a gate');
      assert.ok(!/PT_NEWS_CATALYSTS_TOKEN\b(?!_)/.test(s.replace(/COLLISION_KEYS[\s\S]*?\];/, '')), 'the write token is only a collision candidate, never the read credential');
    });

    // ── S-3 ────────────────────────────────────────────────────────────────────
    await test('S-3 .mjs wrapper: pinned pattern, no config/schedule, no logic, node --check, import-inert, Request parity', async function () {
      const src = readMjs();
      const code = stripComments(src);
      assert.ok(/@netlify\/aws-lambda-compat/.test(src), 'compat import missing');
      assert.ok(/\.\/lib\/news-catalysts-read-core\.js/.test(src), 'core import missing');
      assert.ok(/export default withLambda\(/.test(src), 'export default withLambda missing');
      assert.ok(!/export\s+const\s+config/.test(code), 'config export would change routing / add a schedule');
      assert.ok(!/schedule|cron|setInterval|setTimeout/i.test(code), 'no scheduler surface');
      assert.strictEqual((src.match(/^import '@netlify\/blobs';$/gm) || []).length, 1, 'exactly one side-effect blobs import');
      assert.ok(!/import\s*\{[^}]*\}\s*from\s*['"]@netlify\/blobs['"]/.test(src), 'no named blobs bindings');
      assert.ok(!/console\./.test(src), 'no console output');
      ['PT_ENABLE', 'PT_NEWS', 'Bearer', 'JSON.parse', 'process.env', 'getStore', 'fundstore', 'httpMethod', 'asOf']
        .forEach(function (tok) { assert.ok(code.indexOf(tok) === -1, 'wrapper must not contain logic token: ' + tok); });
      const specs = [];
      let m;
      const reFrom = /import\s+[^'";]*?\s+from\s+['"]([^'"]+)['"]/g;
      while ((m = reFrom.exec(code)) !== null) { specs.push(m[1]); }
      const reBare = /import\s+['"]([^'"]+)['"]/g;
      while ((m = reBare.exec(code)) !== null) { specs.push(m[1]); }
      assert.ok(!/\bimport\s*\(/.test(code) && !/\brequire\s*\(/.test(code), 'no dynamic import()/require()');
      const set = new Set(specs);
      assert.strictEqual(set.size, ALLOWED_IMPORTS.length, 'unexpected import set: ' + JSON.stringify(specs));
      ALLOWED_IMPORTS.forEach(function (sp) { assert.ok(set.has(sp), 'missing allowed import: ' + sp); });
      assert.ok(!fs.existsSync(path.join(ROOT, 'netlify/functions/news-catalysts-read.js')), 'no legacy .js twin');
      assert.strictEqual(code.split('\n').filter(function (l) { return l.trim() !== ''; }).length, 4, 'four statements: blobs, compat, core, export');
      const chk = spawnSync(process.execPath, ['--check', MJS_ABS], { encoding: 'utf8' });
      assert.strictEqual(chk.status, 0, 'node --check failed: ' + ((chk.stderr || '') + (chk.stdout || '')).trim());
      const script =
        "globalThis.__fc = 0;" +
        "globalThis.fetch = function () { globalThis.__fc++; throw new Error('NETWORK_FORBIDDEN'); };" +
        "import(" + JSON.stringify(pathToFileURL(MJS_ABS).href) + ").then(function (ns) {" +
        "  if (typeof ns.default !== 'function') { process.exit(2); }" +
        "  if (ns.config !== undefined) { process.exit(5); }" +
        "  if (globalThis.__fc !== 0) { process.exit(4); }" +
        "  process.exit(0);" +
        "}).catch(function (err) { console.error(err && err.message); process.exit(3); });";
      const child = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', cwd: ROOT });
      assert.strictEqual(child.status, 0, 'clean import: exit ' + child.status + ' ' + ((child.stderr || '') + (child.stdout || '')).trim());
      const ns = await import(pathToFileURL(MJS_ABS).href);
      const wrapped = ns.default;
      async function drivePair(label, opts) {
        const evHeaders = {};
        Object.keys(opts.headers || {}).forEach(function (k) { evHeaders[k.toLowerCase()] = opts.headers[k]; });
        const coreRes = await core.handler({ httpMethod: opts.method, headers: evHeaders, body: opts.body === undefined ? null : opts.body });
        const init = { method: opts.method, headers: opts.headers || {} };
        if (opts.body !== undefined && opts.method !== 'GET') { init.body = opts.body; }
        const resp = await wrapped(new Request(ROUTE, init), {});
        const text = await resp.text();
        assert.strictEqual(resp.status, coreRes.statusCode, label + ': status parity');
        assert.strictEqual(text, coreRes.body === undefined ? '' : coreRes.body, label + ': body parity');
        Object.keys(coreRes.headers || {}).forEach(function (h) {
          assert.strictEqual(resp.headers.get(h.toLowerCase()), coreRes.headers[h], label + ': header parity ' + h);
        });
        return { status: resp.status, text: text };
      }
      await withEnv({}, async function () {
        const o = await drivePair('OPTIONS', { method: 'OPTIONS' });
        assert.strictEqual(o.status, 204); assert.strictEqual(o.text, '');
        const d = await drivePair('gate-off', { method: 'POST', headers: { authorization: AUTH }, body: reqBody() });
        assert.strictEqual(d.text, '{"status":"DISABLED","reason":"SERVER_DISABLED"}');
      });
      await withEnv(armedEnv(), async function () {
        assert.strictEqual((await drivePair('GET', { method: 'GET', headers: { authorization: AUTH } })).status, 405);
        assert.strictEqual((await drivePair('wrong-auth', { method: 'POST', headers: { Authorization: 'Bearer nope' }, body: '{{{' })).status, 401);
        assert.strictEqual((await drivePair('cap-auth', { method: 'POST', headers: { Authorization: AUTH }, body: JSON.stringify({ ticker: 'MSFT', asOf: AS_OF }) })).status, 403, 'capitalized Authorization authenticates');
        assert.strictEqual((await drivePair('bad-instant', { method: 'POST', headers: { Authorization: AUTH }, body: JSON.stringify({ ticker: TICKER, asOf: 'nope' }) })).status, 400);
      });
    });

    // ── S-4 ────────────────────────────────────────────────────────────────────
    await test('S-4 core imports: exactly preflight + provider + lazy blobs; import-inert in a clean child; forbidden-surface scan', async function () {
      const raw = fs.readFileSync(CORE_SRC, 'utf8');
      const s = stripComments(raw);
      const reqRe = /\brequire\s*\(\s*(['"])([^'"]*)\1\s*\)/g;
      const allowed = { './news-catalysts-preflight': true, './news-catalysts-provider': true, '@netlify/blobs': true };
      const seen = [];
      let m;
      while ((m = reqRe.exec(s)) !== null) { seen.push(m[2]); assert.ok(allowed[m[2]] === true, 'require allowlist violation: ' + m[2]); }
      assert.strictEqual((s.match(/\brequire\s*\(/g) || []).length, seen.length, 'no dynamic/computed require');
      assert.deepStrictEqual(seen.slice().sort(), ['./news-catalysts-preflight', './news-catalysts-provider', '@netlify/blobs'], 'exactly three imports');
      // Brief §9: the shared read-only provider imports are exactly these four symbols.
      const providerImport = /const\s*\{([^}]*)\}\s*=\s*require\(\s*'\.\/news-catalysts-provider'\s*\)/.exec(s);
      assert.ok(providerImport, 'provider import destructure present');
      assert.deepStrictEqual(providerImport[1].split(',').map(function (x) { return x.trim(); }).filter(Boolean).sort(),
        ['CONTRACT_VERSION', 'NEWS_KEY_RE', 'PROVIDER_ID', 'SOURCE_TIER'], 'exactly the four brief §9 symbols');
      assert.strictEqual((s.match(/@netlify\/blobs/g) || []).length, 1, 'blobs referenced exactly once');
      assert.ok(s.indexOf('@netlify/blobs') > s.indexOf('function acquireStore'), 'blobs require is lazy inside acquireStore');
      assert.ok(s.indexOf("'fund-facts-store'") !== -1, 'STORE_NAME local literal (fund-facts-store)');
      assert.ok(s.indexOf('fundstore:v1:news-index:') !== -1, 'owns the index key literal');
      assert.ok(/consistency:\s*'strong'/.test(s), 'strong-consistency reads');
      assert.ok(/default:/.test(s) && /PREFLIGHT_UNMAPPED/.test(s), 'total preflight mapping with default');
      const forbidden = [
        [/localStorage|sessionStorage/, 'web storage'],
        [/document\./, 'DOM access'],
        [/window\./, 'window/UI access'],
        [/pt_results|pt_tickers|pt_holdings/, 'pt_* client-storage key'],
        [/\borchestrate\s*\(/, 'scoring: orchestrate'],
        [/\banalyzeChunk\b/, 'scoring: analyzeChunk'],
        [/\benforceScoreConsistency\b/, 'scoring: enforceScoreConsistency'],
        [/_techCache/, 'scoring: _techCache'],
        [/sentiment_score/, 'sentiment_score'],
        [/\.message\b/, 'raw error message access'],
        [/\.stack\b/, 'raw error stack access'],
        [/(^|[^.\w])fetch\s*\(/, 'bare fetch( call'],
        [/connectLambda/, 'connectLambda (ambient getStore only)'],
        [/schedule|cron/i, 'scheduler surface'],
        [/export\s+const\s+config/, 'config export'],
        [/PERPLEXITY|apiKey|providerImpl|fetchImpl/, 'provider / upstream surface'],
        [/evidence-freshness/, 'freshness module (not a read-surface concern)'],
        [/evidence-contract/, 'evidence-contract direct import']
      ];
      forbidden.forEach(function (pair) { assert.ok(!pair[0].test(s), 'must NOT contain ' + pair[1]); });
      const script =
        'global.fetch = function () { throw new Error("LIVE"); };' +
        'const m = require(' + JSON.stringify(CORE_SRC) + ');' +
        'for (const f of ["handler", "partitionDates", "indexKey", "validateRecord", "mapPreflightFailure"]) { if (typeof m[f] !== "function") { process.exit(2); } }' +
        'process.exit(0);';
      const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, 'clean require: ' + ((r.stderr || '') + (r.stdout || '')).trim());
      assert.strictEqual(realFetchCalls, 0, 'the real global.fetch was never reached during the suite');
    });

    // ── S-5 ────────────────────────────────────────────────────────────────────
    await test('S-5 a key listed in two partitions (and twice in one index) is read once and returned once', async function () {
      await withEnv(armedEnv(), async function () {
        const shared = record('shared', { eventDate: dayOffset(D0, 1) });
        const only = record('only', { eventDate: D0 });
        const seed = {};
        seed[keyOf(shared)] = JSON.stringify(shared);
        seed[keyOf(only)] = JSON.stringify(only);
        seed[indexKeyFor(TICKER, D0)] = JSON.stringify(indexRecord([keyOf(only), keyOf(shared), keyOf(shared)], D0));
        seed[indexKeyFor(TICKER, dayOffset(D0, 1))] = JSON.stringify(indexRecord([keyOf(shared)], dayOffset(D0, 1)));
        const store = makeStore({ seed: seed });
        const r = observe(await read(store), store);
        assertExactBody(r, okBody([only, shared], 0), 'first-seen order, no duplicates');
        assert.strictEqual(itemGets(store).length, 2, 'each unique key read exactly once');
      });
    });

    // ── S-6 ────────────────────────────────────────────────────────────────────
    await test('S-6 ticker-agnostic: no symbol literal or ticker-equality branch in the core; two tickers yield structurally identical envelopes', async function () {
      const s = stripComments(fs.readFileSync(CORE_SRC, 'utf8'));
      assert.ok(!/ticker\s*===\s*'/.test(s) && !/'\s*===\s*ticker/.test(s), 'no ticker-equality literal branch');
      assert.ok(!/'(FROG|AAPL|MSFT|TSLA|NVDA|SPY|QQQ)'/.test(s), 'no hard-coded symbol');
      await withEnv(armedEnv(), async function () {
        const shapes = [];
        for (const t of ['FROG', 'AAPL']) {
          const rec = record('agn-' + t, { ticker: t });
          const seed = {};
          seed[keyOf(rec)] = JSON.stringify(rec);
          seed[indexKeyFor(t, D0)] = JSON.stringify(indexRecord([keyOf(rec)], D0, t));
          const store = makeStore({ seed: seed });
          const r = observe(await core.handler(makeEvent({ auth: AUTH, body: JSON.stringify({ ticker: t, asOf: AS_OF }), store: store })), store);
          const b = parsedBody(r);
          assert.strictEqual(b.status, 'OK', t);
          assert.strictEqual(b.ticker, t);
          assert.strictEqual(indexGets(store).length, 31, t + ': 31 partitions');
          shapes.push(JSON.stringify(Object.keys(b)) + '|' + JSON.stringify(Object.keys(b.records[0])) + '|' + b.records.length);
        }
        assert.strictEqual(shapes[0], shapes[1], 'identical envelope structure across tickers');
      });
    });
    // ── S-7 ────────────────────────────────────────────────────────────────────
    await test('S-7 vocabulary tripwire: the reader\'s frozen D-S3-1 vocabularies equal the provider\'s exported ones, and are exactly the contract values', async function () {
      // The reader holds its own frozen copy (brief §9: four imports only). This asserts
      // the copy and the provider agree TODAY; if the provider vocabulary moves (S2-M3 /
      // A3b), this fails loudly and D-S3-1 must be re-frozen — it is never a silent change.
      const s = stripComments(fs.readFileSync(CORE_SRC, 'utf8'));
      function literal(name) {
        const m = new RegExp('const ' + name + ' = (\\[[^\\]]*\\]);').exec(s);
        assert.ok(m, name + ' literal present in the core');
        return JSON.parse(m[1].replace(/'/g, '"'));
      }
      assert.deepStrictEqual(literal('CATEGORIES'), provider.CATEGORIES.slice(), 'CATEGORIES == provider');
      assert.deepStrictEqual(literal('DIRECTIONS'), provider.DIRECTIONS.slice(), 'DIRECTIONS == provider');
      assert.deepStrictEqual(literal('EVENT_TYPES'), provider.EVENT_TYPES.slice(), 'EVENT_TYPES == provider');
      assert.deepStrictEqual(literal('RELEVANCE_SCOPES'), provider.RELEVANCE_SCOPES.slice(), 'RELEVANCE_SCOPES == provider');
      // ...and are exactly the D-S3-1 §1 values (7 categories).
      assert.strictEqual(literal('CATEGORIES').length, 7, 'D-S3-1: 7 categories');
      assert.deepStrictEqual(literal('DIRECTIONS'), ['positive', 'neutral', 'negative']);
      // Positive controls through the real validator: each vocabulary value conforms.
      await withEnv(armedEnv(), async function () {
        const all = [];
        literal('CATEGORIES').forEach(function (c, i) {
          all.push(record('cat-' + i, { category: c, subType: c === 'other_catalyst' ? 'general' : null }));
        });
        literal('DIRECTIONS').forEach(function (d, i) { all.push(record('dir-' + i, { direction: d })); });
        literal('RELEVANCE_SCOPES').forEach(function (rs, i) { all.push(record('scope-' + i, { relevanceScope: rs })); });
        all.push(record('up-1', { eventType: 'upcoming_event', direction: null }));
        const store = makeStore({ seed: seedDay({}, D0, all) });
        const r = observe(await read(store), store);
        assert.strictEqual(parsedBody(r).records.length, all.length, 'every vocabulary value conforms');
        assert.strictEqual(parsedBody(r).omitted, 0);
      });
    });
  } finally {
    global.fetch = _origFetch;
  }

  const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
  if (failed > 0) { process.exit(1); }
}

runTests().catch(function (err) {
  process.stderr.write('FATAL: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
