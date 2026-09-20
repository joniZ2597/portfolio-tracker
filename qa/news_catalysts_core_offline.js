'use strict';

/*
 * qa/news_catalysts_core_offline.js
 *
 * Catalyst news evidence pipeline · S1 write path — NW-series offline QA.
 *
 * Proves the news-catalysts core endpoint boundary
 * (netlify/functions/lib/news-catalysts-core.js) and its .mjs route wrapper
 * (netlify/functions/news-catalysts.mjs) with ZERO real network / Blob /
 * production. The store is an in-memory fake handed through the EVENT-ONLY
 * _testStore seam; the provider is exercised both as the REAL, frozen C3-S1 lib
 * over an injected fetch (integration) and as an injected providerImpl (unit).
 * A throwing global.fetch guard is installed throughout.
 *
 * Coverage (NW01–NW26; brief work/catalyst-news-write/brief.md):
 *   NW01  OPTIONS -> 204 before the gate, no body
 *   NW02  gate off -> 200 DISABLED, zero downstream I/O (strict === 'true')
 *   NW03  non-POST -> 405
 *   NW04  auth-first: wrong/missing token + malformed body -> 401
 *   NW05  configuration family -> 500 CONFIGURATION_MISSING (pre-body)
 *   NW06  post-auth malformed body -> 400 INVALID_JSON
 *   NW07  unlisted / lowercase / non-string ticker -> 403 TICKER_NOT_ALLOWED
 *   NW08  mapPreflightFailure default: -> 500 ERROR / PREFLIGHT_UNMAPPED
 *   NW09  seeded index -> SKIPPED/ALREADY_SEEDED, zero provider I/O, one strong get
 *   NW09b second same-day fetch after WRITE -> SKIPPED, not STORE_CONFLICT (planted 3)
 *   NW10  provider throw (incl. missing PERPLEXITY_API_KEY) -> 502, zero writes
 *   NW11  provider { ok:false } via the real provider -> 502
 *   NW12  zero items -> exact NONE, no index, day stays open (planted 4)
 *   NW13  full WRITE via the real provider: exact body, order, create-only, records
 *   NW14  projection omitted -> J7 CONTRACT_INVALID (planted 1)
 *   NW15  index written before items fails the ordering assertion (planted 2)
 *   NW16  index key shape, fetchDate = UTC date of the injected clock, NEWS_KEY_RE disjoint
 *   NW17  pre-existing item (modified:false) skipped from writtenKeys; run continues
 *   NW18  item set throw / malformed -> STORE_UNAVAILABLE, no index attempt
 *   NW19  index modified:false -> STORE_CONFLICT with provenance, never WRITE
 *   NW20  D-E reconciliation: absent / present / read-throw / malformed set result
 *   NW21  store acquire throw / pre-read throw -> bare STORE_UNAVAILABLE
 *   NW22  determinism, input immutability, event-only seams
 *   NW23  .mjs wrapper: pinned pattern, D5 (no config/schedule), parity via Request
 *   NW24  gate-off dormancy: zero network, store, filesystem calls
 *   NW25  static forbidden-surface scan of the TARGET core (comment-stripped)
 *   NW26  import-inert core in a clean child
 *
 * Run: node qa/news_catalysts_core_offline.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const CORE_SRC = path.join(ROOT, 'netlify', 'functions', 'lib', 'news-catalysts-core.js');
const MJS_ABS = path.join(ROOT, 'netlify', 'functions', 'news-catalysts.mjs');
const PROVIDER_SRC = path.join(ROOT, 'netlify', 'functions', 'lib', 'news-catalysts-provider.js');
const FRESHNESS_SRC = path.join(ROOT, 'netlify', 'functions', 'lib', 'evidence-freshness.js');

const provider = require(PROVIDER_SRC);
const freshness = require(FRESHNESS_SRC);

// The module under test is loaded guarded so a missing/broken core reports as
// per-test FAILs rather than a FATAL before any assertion runs.
let core = null;
let coreLoadError = null;
try { core = require(CORE_SRC); } catch (e) { coreLoadError = e; }

const TICKER = 'FROG';
const NOW_ISO = '2026-09-20T14:30:00.000Z';
const FETCH_DATE = '2026-09-20';
const TOKEN = 'tok-news-catalysts-qa-1';
const AUTH = 'Bearer ' + TOKEN;
const PPLX_KEY = 'pplx-test-key-123';
const INDEX_KEY = 'fundstore:v1:news-index:' + TICKER + ':' + FETCH_DATE;
const ROUTE = 'https://qa.local/.netlify/functions/news-catalysts';
const ALLOWED_IMPORTS = ['@netlify/blobs', '@netlify/aws-lambda-compat', './lib/news-catalysts-core.js'];

const ITEM_FIELD_ORDER = [
  'ticker', 'eventDate', 'category', 'direction', 'sourceUrl',
  'normalizedSourceUrl', 'sourceDomain', 'provider', 'retrievedAt',
  'identityHash', 'provenance', 'confidence', 'requiresVerification', 'scoringImpact'
];
const RECORD_FIELD_ORDER = ITEM_FIELD_ORDER.concat(['sourceTier', 'contractVersion']);

// ── env management (the core reads process.env at its boundary) ──────────────
const ENV_KEYS = [
  'PT_ENABLE_NEWS_CATALYSTS_SERVER',
  'PT_NEWS_CATALYSTS_TOKEN',
  'PT_NEWS_CATALYSTS_ALLOWED_TICKERS',
  'PERPLEXITY_API_KEY',
  'PT_FUND_FACTS_TOKEN',
  'PT_FUND_FACTS_READ_TOKEN',
  'PT_OWNER_TOKEN',
  'PT_SEC_EVIDENCE_PULL_TOKEN',
  'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN'
];
const COLLISION_KEYS = ENV_KEYS.slice(4);

function withEnv(envObj, fn) {
  const saved = {};
  ENV_KEYS.forEach(function (k) { saved[k] = process.env[k]; delete process.env[k]; });
  Object.keys(envObj || {}).forEach(function (k) { process.env[k] = envObj[k]; });
  return Promise.resolve().then(fn).finally(function () {
    ENV_KEYS.forEach(function (k) {
      if (saved[k] === undefined) { delete process.env[k]; } else { process.env[k] = saved[k]; }
    });
  });
}

function armedEnv(extra) {
  return Object.assign({
    PT_ENABLE_NEWS_CATALYSTS_SERVER: 'true',
    PT_NEWS_CATALYSTS_TOKEN: TOKEN,
    PT_NEWS_CATALYSTS_ALLOWED_TICKERS: 'FROG,AAPL',
    PERPLEXITY_API_KEY: PPLX_KEY
  }, extra || {});
}

// ── in-memory store fake (records ops; injectable faults; onlyIfNew honored) ──
function makeStore(opts) {
  opts = opts || {};
  const data = Object.assign({}, opts.seed || {});
  const log = [];
  const getCursor = {};
  return {
    data: data,
    log: log,
    get: async function (key, o) {
      log.push({ op: 'get', key: key, opts: o });
      const plan = opts.getPlan && opts.getPlan[key];
      if (plan) {
        const i = getCursor[key] || 0;
        if (i < plan.length) {
          getCursor[key] = i + 1;
          if (plan[i] && plan[i].throws) { throw new Error('boom-get-injected'); }
          return plan[i] ? plan[i].value : null;
        }
      }
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    set: async function (key, value, o) {
      log.push({ op: 'set', key: key, value: value, opts: o });
      if (opts.setThrows && opts.setThrows[key]) { throw new Error('boom-set-injected'); }
      if (opts.setResults && Object.prototype.hasOwnProperty.call(opts.setResults, key)) {
        const r = opts.setResults[key];
        if (r && r.modified === true) { data[key] = value; }
        return r;
      }
      if (o && o.onlyIfNew === true && Object.prototype.hasOwnProperty.call(data, key)) {
        return { modified: false };
      }
      data[key] = value;
      return { modified: true };
    }
  };
}
function setOps(store) { return store.log.filter(function (e) { return e.op === 'set'; }); }
function getOps(store) { return store.log.filter(function (e) { return e.op === 'get'; }); }
function keyed(obj) { const o = {}; Object.keys(obj).forEach(function (k) { o[k] = obj[k]; }); return o; }

// A store that must never be touched (pre-auth / gate-off paths).
function poisonedStore(state) {
  return {
    get: async function () { state.touched = true; throw new Error('POISONED_STORE_TOUCHED'); },
    set: async function () { state.touched = true; throw new Error('POISONED_STORE_TOUCHED'); }
  };
}

// ── provider fixtures (borrowed from the NP suite) ────────────────────────────
function rawItem(eventDate, category, direction, sourceUrl) {
  return { eventDate: eventDate, category: category, direction: direction, sourceUrl: sourceUrl };
}
function sonarResponse(items, citations) {
  const resp = { choices: [{ message: { content: JSON.stringify({ items: items }) } }] };
  if (citations !== undefined) { resp.citations = citations; }
  return resp;
}
function jsonResponse(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status: status, headers: { get: function () { return null; } }, text: async function () { return text; } };
}
function makeFetch(responseBody, status) {
  const spy = { calls: [] };
  spy.fn = async function (url, init) {
    spy.calls.push({ url: String(url), init: init || {} });
    return jsonResponse(typeof status === 'number' ? status : 200, responseBody);
  };
  return spy;
}
const URL1 = 'https://ir.jfrog.com/news/q3-results';
const URL2 = 'https://www.reuters.com/markets/frog-guidance-2026-09-18/';
function twoItemFixture() {
  return sonarResponse(
    [rawItem('2026-09-17', 'earnings_event', 'positive', URL1), rawItem('2026-09-18', 'guidance_update', 'neutral', URL2)],
    [URL1, URL2]
  );
}
// Items and keys pinned INDEPENDENTLY of the core, via the frozen provider lib.
function expectedItems(fixture) {
  const r = provider.normalizeNewsResponse(fixture, { ticker: TICKER, retrievedAt: NOW_ISO });
  assert.strictEqual(r.ok, true, 'fixture normalizes');
  return r.items;
}
function expectedRecord(item) {
  return Object.assign({}, item, { sourceTier: provider.SOURCE_TIER, contractVersion: provider.CONTRACT_VERSION });
}
function expectedIndexRecord(keys) {
  return {
    ticker: TICKER, fetchedAt: NOW_ISO, sourceTier: provider.SOURCE_TIER,
    contractVersion: provider.CONTRACT_VERSION, provider: provider.PROVIDER_ID, keys: keys
  };
}
function providerSpy(behavior) {
  const spy = { calls: 0 };
  spy.fn = async function (request, options) {
    spy.calls += 1;
    spy.lastRequest = request;
    spy.lastOptions = options;
    return behavior(request, options);
  };
  return spy;
}
function okEnvelope(items) {
  return { ok: true, envelope: {
    ticker: TICKER, fetchedAt: NOW_ISO, sourceTier: provider.SOURCE_TIER, contractVersion: provider.CONTRACT_VERSION,
    provider: provider.PROVIDER_ID, items: items, skippedItems: [], writtenKeys: []
  } };
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
  const tpo = { nowIso: o.nowIso || NOW_ISO };
  if (o.fetchImpl) { tpo.fetchImpl = o.fetchImpl; }
  if (o.providerImpl) { tpo.providerImpl = o.providerImpl; }
  ev._testProviderOptions = tpo;
  return ev;
}
function parsedBody(r) { return JSON.parse(r.body); }
function assertExactBody(r, expected, label) {
  assert.deepStrictEqual(parsedBody(r), expected, label + ' (deep-equal)');
  assert.strictEqual(r.body, JSON.stringify(expected), label + ' (stringify/key-order)');
}
function assertNoRawText(r) {
  assert.ok(r.body.indexOf('boom') === -1 && r.body.indexOf('POISONED') === -1 && r.body.indexOf('PPLX_') === -1,
    'no raw error text leaks into the response body');
}
// The ordering contract: every item set precedes the index set, and the index
// set is the LAST set. Used positively (NW13) and against a mutated log (NW15).
function assertItemsThenIndex(sets, itemKeys, indexKey) {
  const idx = sets.map(function (s) { return s.key; }).indexOf(indexKey);
  assert.ok(idx !== -1, 'index set present');
  assert.strictEqual(idx, sets.length - 1, 'index record written LAST');
  assert.deepStrictEqual(sets.slice(0, idx).map(function (s) { return s.key; }), itemKeys, 'every item precedes the index');
}
function liveGuard() { throw new Error('LIVE_NETWORK_FORBIDDEN'); }
function readMjs() { return fs.readFileSync(MJS_ABS, 'utf8').replace(/\r\n/g, '\n'); }
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([^:'"])\/\/[^\n]*/g, '$1');
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
  process.stdout.write('\n=== S1 — news-catalysts-core NW-series (offline) ===\n\n');

  const _origFetch = global.fetch;
  let realFetchCalls = 0;
  global.fetch = function () { realFetchCalls += 1; return liveGuard(); };

  try {
    // ── NW01 ───────────────────────────────────────────────────────────────────
    await test('NW01 OPTIONS -> 204 before the gate, cors headers, no body', async function () {
      await withEnv({}, async function () {
        const state = {};
        const r = await core.handler(makeEvent({ method: 'OPTIONS', store: poisonedStore(state) }));
        assert.strictEqual(r.statusCode, 204);
        assert.ok(!('body' in r), '204 carries no body field');
        assert.strictEqual(r.headers['Access-Control-Allow-Methods'], 'POST, OPTIONS');
        assert.ok(!state.touched, 'store untouched');
      });
    });

    // ── NW02 ───────────────────────────────────────────────────────────────────
    await test('NW02 gate off (absent/TRUE/1/false) -> 200 DISABLED, zero downstream I/O', async function () {
      const variants = [{}, { PT_ENABLE_NEWS_CATALYSTS_SERVER: 'TRUE' }, { PT_ENABLE_NEWS_CATALYSTS_SERVER: '1' },
        { PT_ENABLE_NEWS_CATALYSTS_SERVER: 'false' }, { PT_ENABLE_NEWS_CATALYSTS_SERVER: ' true' }];
      for (const env of variants) {
        await withEnv(Object.assign(armedEnv(), env, env.PT_ENABLE_NEWS_CATALYSTS_SERVER === undefined ? { PT_ENABLE_NEWS_CATALYSTS_SERVER: undefined } : {}), async function () {
          if (env.PT_ENABLE_NEWS_CATALYSTS_SERVER === undefined) { delete process.env.PT_ENABLE_NEWS_CATALYSTS_SERVER; }
          const state = {};
          const spy = providerSpy(function () { throw new Error('boom-provider'); });
          const r = await core.handler(makeEvent({
            auth: AUTH, body: '{"ticker":"FROG"}', store: poisonedStore(state), providerImpl: spy.fn
          }));
          assert.strictEqual(r.statusCode, 200, 'gate value ' + JSON.stringify(env));
          assertExactBody(r, { status: 'DISABLED', reason: 'SERVER_DISABLED' }, 'DISABLED');
          assert.ok(!state.touched, 'store untouched');
          assert.strictEqual(spy.calls, 0, 'provider never called');
        });
      }
    });

    // ── NW03 ───────────────────────────────────────────────────────────────────
    await test('NW03 gate on, non-POST -> 405 METHOD_NOT_ALLOWED', async function () {
      await withEnv(armedEnv(), async function () {
        for (const method of ['GET', 'PUT', 'DELETE', undefined]) {
          const r = await core.handler(makeEvent({ method: method, auth: AUTH }));
          assert.strictEqual(r.statusCode, 405, 'method ' + method);
          assertExactBody(r, { status: 'METHOD_NOT_ALLOWED', reason: 'METHOD_NOT_ALLOWED' }, '405');
        }
      });
    });

    // ── NW04 ───────────────────────────────────────────────────────────────────
    await test('NW04 auth-first: wrong/missing token + malformed body -> 401, body never parsed, store untouched', async function () {
      await withEnv(armedEnv(), async function () {
        const state = {};
        for (const auth of ['Bearer wrong-token', undefined, '', 'bearer ' + TOKEN, TOKEN]) {
          const r = await core.handler(makeEvent({ auth: auth, body: '{{{not-json', store: poisonedStore(state) }));
          assert.strictEqual(r.statusCode, 401, 'auth ' + JSON.stringify(auth));
          assertExactBody(r, { status: 'UNAUTHORIZED', reason: 'UNAUTHORIZED' }, '401');
        }
        assert.ok(!state.touched, 'store untouched pre-auth');
      });
    });

    // ── NW05 ───────────────────────────────────────────────────────────────────
    await test('NW05 configuration family -> 500 CONFIGURATION_MISSING (post-auth, pre-body)', async function () {
      const cases = [];
      COLLISION_KEYS.forEach(function (k) { const e = {}; e[k] = TOKEN; cases.push([armedEnv(e), 'TOKEN_COLLISION']); });
      cases.push([(function () { const e = armedEnv(); delete e.PT_NEWS_CATALYSTS_ALLOWED_TICKERS; return e; })(), 'ALLOWLIST_MISSING']);
      cases.push([armedEnv({ PT_NEWS_CATALYSTS_ALLOWED_TICKERS: 'FR0G' }), 'ALLOWLIST_INVALID']);
      for (const pair of cases) {
        await withEnv(pair[0], async function () {
          const state = {};
          const r = await core.handler(makeEvent({ auth: AUTH, body: '{{{', store: poisonedStore(state) }));
          assert.strictEqual(r.statusCode, 500, pair[1]);
          assertExactBody(r, { status: 'CONFIGURATION_MISSING', reason: pair[1] }, pair[1]);
          assert.ok(!state.touched, 'store untouched: ' + pair[1]);
        });
      }
    });

    // ── NW06 ───────────────────────────────────────────────────────────────────
    await test('NW06 post-auth malformed/array/null/empty body -> 400 INVALID_JSON', async function () {
      await withEnv(armedEnv(), async function () {
        const state = {};
        for (const body of ['{{{', '[1,2]', 'null', '', undefined, '   ', '"FROG"']) {
          const r = await core.handler(makeEvent({ auth: AUTH, body: body, store: poisonedStore(state) }));
          assert.strictEqual(r.statusCode, 400, 'body: ' + JSON.stringify(body));
          assertExactBody(r, { status: 'INVALID_JSON', reason: 'INVALID_JSON' }, 'INVALID_JSON');
        }
        assert.ok(!state.touched, 'store untouched on body failures');
      });
    });

    // ── NW07 ───────────────────────────────────────────────────────────────────
    await test('NW07 unlisted / lowercase / padded / non-string ticker -> 403 TICKER_NOT_ALLOWED, store untouched', async function () {
      await withEnv(armedEnv(), async function () {
        const state = {};
        for (const t of ['MSFT', 'frog', ' FROG', 'FR-G', '', 7, null, undefined, {}]) {
          const r = await core.handler(makeEvent({ auth: AUTH, body: JSON.stringify({ ticker: t }), store: poisonedStore(state) }));
          assert.strictEqual(r.statusCode, 403, 'ticker: ' + JSON.stringify(t));
          assertExactBody(r, { status: 'TICKER_NOT_ALLOWED', reason: 'TICKER_NOT_ALLOWED' }, '403');
        }
        assert.ok(!state.touched, 'store untouched before pf.ok');
      });
    });

    // ── NW08 ───────────────────────────────────────────────────────────────────
    await test('NW08 mapPreflightFailure is total: the six reasons map, default: -> 500 ERROR/PREFLIGHT_UNMAPPED', async function () {
      const m = core.mapPreflightFailure;
      assert.strictEqual(typeof m, 'function', 'mapPreflightFailure exported');
      assert.deepStrictEqual(parsedBody(m('SERVER_DISABLED')), { status: 'DISABLED', reason: 'SERVER_DISABLED' });
      assert.strictEqual(m('UNAUTHORIZED').statusCode, 401);
      ['TOKEN_COLLISION', 'ALLOWLIST_MISSING', 'ALLOWLIST_INVALID'].forEach(function (reason) {
        assert.strictEqual(m(reason).statusCode, 500, reason);
        assert.deepStrictEqual(parsedBody(m(reason)), { status: 'CONFIGURATION_MISSING', reason: reason });
      });
      assert.strictEqual(m('TICKER_NOT_ALLOWED').statusCode, 403);
      for (const unknown of ['SOMETHING_NEW', undefined, null, 42, '']) {
        const r = m(unknown);
        assert.ok(r && typeof r === 'object', 'never undefined for ' + JSON.stringify(unknown));
        assert.strictEqual(r.statusCode, 500);
        assertExactBody(r, { status: 'ERROR', reason: 'PREFLIGHT_UNMAPPED' }, 'default case');
      }
    });

    // ── NW09 ───────────────────────────────────────────────────────────────────
    await test('NW09 seeded index -> SKIPPED/ALREADY_SEEDED, zero provider I/O, exactly one strong pre-read, zero sets', async function () {
      await withEnv(armedEnv(), async function () {
        const seed = {}; seed[INDEX_KEY] = JSON.stringify(expectedIndexRecord([]));
        const store = makeStore({ seed: seed });
        const spy = providerSpy(async function () { return okEnvelope([]); });
        const r = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, providerImpl: spy.fn }));
        assert.strictEqual(r.statusCode, 200);
        assertExactBody(r, { status: 'SKIPPED', reason: 'ALREADY_SEEDED', ticker: TICKER }, 'SKIPPED');
        assert.strictEqual(spy.calls, 0, 'zero provider I/O');
        assert.strictEqual(setOps(store).length, 0, 'zero writes');
        const gets = getOps(store);
        assert.strictEqual(gets.length, 1, 'index-ONLY pre-read (single get)');
        assert.strictEqual(gets[0].key, INDEX_KEY);
        assert.deepStrictEqual(gets[0].opts, { consistency: 'strong' }, 'strong pre-read');
      });
    });

    await test('NW09b planted 3: second same-day fetch after a WRITE -> SKIPPED (not STORE_CONFLICT), provider called once in total', async function () {
      await withEnv(armedEnv(), async function () {
        // Real provider over an injected fetch, so fetchedAt tracks the injected clock.
        const store = makeStore();
        const fetchSpy = makeFetch(twoItemFixture());
        const r1 = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, fetchImpl: fetchSpy.fn }));
        assert.strictEqual(parsedBody(r1).status, 'WRITE', 'first fetch writes');
        const r2 = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, fetchImpl: fetchSpy.fn, nowIso: '2026-09-20T23:00:00.000Z' }));
        assertExactBody(r2, { status: 'SKIPPED', reason: 'ALREADY_SEEDED', ticker: TICKER }, 'second same-day fetch (later hour)');
        assert.notStrictEqual(parsedBody(r2).reason, 'STORE_CONFLICT');
        assert.strictEqual(fetchSpy.calls.length, 1, 'provider reached exactly once across both invocations');
        assert.strictEqual(setOps(store).length, 3, 'no additional writes on the second call');
        // A different UTC day is a different partition: the fetch proceeds; the
        // overlapping items already exist, so only the new day's index is created.
        const r3 = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, fetchImpl: fetchSpy.fn, nowIso: '2026-09-21T00:00:00.000Z' }));
        assertExactBody(r3, { status: 'WRITE', ticker: TICKER, fetchedAt: '2026-09-21T00:00:00.000Z', writtenKeys: ['fundstore:v1:news-index:FROG:2026-09-21'] }, 'next-day partition is open');
        assert.strictEqual(fetchSpy.calls.length, 2);
      });
    });

    // ── NW10 ───────────────────────────────────────────────────────────────────
    await test('NW10 provider throw -> 502 PROVIDER_FAILURE, zero writes, no raw text; missing PERPLEXITY_API_KEY takes this path with zero fetch', async function () {
      await withEnv(armedEnv(), async function () {
        const store = makeStore();
        const spy = providerSpy(function () { throw new Error('boom-provider-secret'); });
        const r = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, providerImpl: spy.fn }));
        assert.strictEqual(r.statusCode, 502);
        assertExactBody(r, { status: 'ERROR', reason: 'PROVIDER_FAILURE' }, '502');
        assertNoRawText(r);
        assert.strictEqual(spy.calls, 1);
        assert.strictEqual(setOps(store).length, 0, 'zero store writes');
      });
      const noKey = armedEnv(); delete noKey.PERPLEXITY_API_KEY;
      await withEnv(noKey, async function () {
        const store = makeStore();
        const fetchSpy = makeFetch(twoItemFixture());
        const r = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, fetchImpl: fetchSpy.fn }));
        assert.strictEqual(r.statusCode, 502, 'missing upstream key fails closed');
        assertExactBody(r, { status: 'ERROR', reason: 'PROVIDER_FAILURE' }, 'missing key');
        assertNoRawText(r);
        assert.strictEqual(fetchSpy.calls.length, 0, 'no upstream call without a key');
        assert.strictEqual(setOps(store).length, 0, 'zero store writes');
      });
    });

    // ── NW11 ───────────────────────────────────────────────────────────────────
    await test('NW11 real provider { ok:false }: upstream 500 and 2xx-garbage each -> 502 PROVIDER_FAILURE, zero writes', async function () {
      await withEnv(armedEnv(), async function () {
        for (const spec of [[{ error: 'upstream' }, 500], ['garbage{{', 200]]) {
          const store = makeStore();
          const fetchSpy = makeFetch(spec[0], spec[1]);
          const r = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, fetchImpl: fetchSpy.fn }));
          assert.strictEqual(r.statusCode, 502, 'spec ' + JSON.stringify(spec));
          assertExactBody(r, { status: 'ERROR', reason: 'PROVIDER_FAILURE' }, '502');
          assert.strictEqual(fetchSpy.calls.length, 1, 'one upstream attempt');
          assert.strictEqual(setOps(store).length, 0, 'zero writes');
          assert.strictEqual(getOps(store).length, 1, 'pre-read happened before the provider');
        }
      });
    });

    // ── NW12 ───────────────────────────────────────────────────────────────────
    await test('NW12 planted 4: zero items -> exact NONE { status, ticker, fetchedAt }, no index written, the day stays open', async function () {
      await withEnv(armedEnv(), async function () {
        const store = makeStore();
        const fetchSpy = makeFetch(sonarResponse([], []));
        const r = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, fetchImpl: fetchSpy.fn }));
        assert.strictEqual(r.statusCode, 200);
        assertExactBody(r, { status: 'NONE', ticker: TICKER, fetchedAt: NOW_ISO }, 'exact NONE');
        assert.strictEqual(setOps(store).length, 0, 'NONE writes nothing — no index');
        assert.ok(!Object.prototype.hasOwnProperty.call(store.data, INDEX_KEY), 'index absent');
        // Day stays open: a later same-day fetch reaches the provider again.
        const r2 = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, fetchImpl: fetchSpy.fn }));
        assert.strictEqual(parsedBody(r2).status, 'NONE');
        assert.strictEqual(fetchSpy.calls.length, 2, 'provider consulted again — not SKIPPED');
      });
    });

    // ── NW13 ───────────────────────────────────────────────────────────────────
    await test('NW13 integration WRITE via the real provider: exact body, items-then-index order, create-only, exact stored records', async function () {
      await withEnv(armedEnv(), async function () {
        const store = makeStore();
        const fixture = twoItemFixture();
        const items = expectedItems(fixture);
        const itemKeys = items.map(provider.buildNewsKey);
        assert.strictEqual(itemKeys.length, 2);
        const fetchSpy = makeFetch(fixture);
        const r = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, fetchImpl: fetchSpy.fn }));
        assert.strictEqual(r.statusCode, 200);
        assertExactBody(r, { status: 'WRITE', ticker: TICKER, fetchedAt: NOW_ISO, writtenKeys: itemKeys.concat([INDEX_KEY]) }, 'exact WRITE');
        // upstream call carried the injected key only
        assert.strictEqual(fetchSpy.calls.length, 1);
        assert.strictEqual(fetchSpy.calls[0].init.headers.Authorization, 'Bearer ' + PPLX_KEY, 'boundary-read key injected');
        // stored item records: provider item + sourceTier + contractVersion, exact order
        items.forEach(function (item, i) {
          const stored = JSON.parse(store.data[itemKeys[i]]);
          assert.deepStrictEqual(Object.keys(stored), RECORD_FIELD_ORDER, 'exact 16-field record order');
          assert.deepStrictEqual(stored, expectedRecord(item), 'record ' + i);
          assert.strictEqual(store.data[itemKeys[i]], JSON.stringify(expectedRecord(item)), 'byte-exact record ' + i);
        });
        // index record
        assert.strictEqual(store.data[INDEX_KEY], JSON.stringify(expectedIndexRecord(itemKeys)), 'exact index record');
        // op order + create-only options
        assert.strictEqual(store.log[0].op, 'get');
        assert.strictEqual(store.log[0].key, INDEX_KEY, 'pre-read first');
        assert.deepStrictEqual(store.log[0].opts, { consistency: 'strong' });
        const sets = setOps(store);
        assert.strictEqual(sets.length, 3);
        assertItemsThenIndex(sets, itemKeys, INDEX_KEY);
        sets.forEach(function (s) { assert.deepStrictEqual(s.opts, { onlyIfNew: true }, 'create-only write: ' + s.key); });
        assert.strictEqual(getOps(store).length, 1, 'no extra reads on the happy path');
      });
    });

    // ── NW14 ───────────────────────────────────────────────────────────────────
    await test('NW14 planted 1: a stored record stripped of sourceTier/contractVersion is CONTRACT_INVALID to J7; the real stored record is fresh', async function () {
      await withEnv(armedEnv(), async function () {
        const store = makeStore();
        const fixture = twoItemFixture();
        const itemKeys = expectedItems(fixture).map(provider.buildNewsKey);
        await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, fetchImpl: makeFetch(fixture).fn }));
        const NOW_MS = Date.parse(NOW_ISO);
        function evaluate(record) {
          return freshness.evaluateEvidenceFreshness(
            [{ family: 'news', key: itemKeys[0], record: record, timestamps: { eventDate: record.eventDate } }],
            freshness.DEFAULT_WINDOW_TABLE, NOW_MS, { ticker: TICKER, expectedFamilies: ['news'] });
        }
        const stored = JSON.parse(store.data[itemKeys[0]]);
        const good = evaluate(stored);
        assert.strictEqual(good.items[0].reason, null, 'stored record passes J7 validity');
        assert.strictEqual(good.items[0].state, 'fresh');
        assert.strictEqual(good.items[0].timestampSource, 'eventDate');
        // Mutation applied to the fixture (the stored record), never to the test.
        const stripped = keyed(stored); delete stripped.sourceTier; delete stripped.contractVersion;
        assert.strictEqual(evaluate(stripped).items[0].reason, 'CONTRACT_INVALID', 'projection omitted => CONTRACT_INVALID');
        const noTier = keyed(stored); delete noTier.sourceTier;
        assert.strictEqual(evaluate(noTier).items[0].reason, 'CONTRACT_INVALID', 'sourceTier alone missing');
        const noVersion = keyed(stored); delete noVersion.contractVersion;
        assert.strictEqual(evaluate(noVersion).items[0].reason, 'CONTRACT_INVALID', 'contractVersion alone missing');
        // core.projectItemRecord is the projection the handler used
        assert.strictEqual(typeof core.projectItemRecord, 'function');
        const env = okEnvelope(expectedItems(fixture)).envelope;
        assert.strictEqual(JSON.stringify(core.projectItemRecord(env.items[0], env)), store.data[itemKeys[0]], 'exported projection == stored bytes');
      });
    });

    // ── NW15 ───────────────────────────────────────────────────────────────────
    await test('NW15 planted 2: an op log with the index written before the items fails the ordering assertion', async function () {
      await withEnv(armedEnv(), async function () {
        const store = makeStore();
        const fixture = twoItemFixture();
        const itemKeys = expectedItems(fixture).map(provider.buildNewsKey);
        await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, fetchImpl: makeFetch(fixture).fn }));
        const sets = setOps(store);
        assert.doesNotThrow(function () { assertItemsThenIndex(sets, itemKeys, INDEX_KEY); }, 'real log passes');
        // Mutated fixture: index moved first.
        const mutated = [sets[2], sets[0], sets[1]];
        assert.throws(function () { assertItemsThenIndex(mutated, itemKeys, INDEX_KEY); }, /LAST|precedes/, 'index-first log is rejected');
        // Mutated fixture: index between items.
        const mutated2 = [sets[0], sets[2], sets[1]];
        assert.throws(function () { assertItemsThenIndex(mutated2, itemKeys, INDEX_KEY); }, /LAST|precedes/, 'index-mid log is rejected');
      });
    });

    // ── NW16 ───────────────────────────────────────────────────────────────────
    await test('NW16 index key = fundstore:v1:news-index:<T>:<UTC fetch date>; never matches NEWS_KEY_RE; late-UTC clock stays on its UTC date', async function () {
      assert.strictEqual(typeof core.indexKey, 'function', 'indexKey exported');
      assert.strictEqual(core.indexKey(TICKER, NOW_ISO), INDEX_KEY);
      assert.strictEqual(core.indexKey(TICKER, '2026-09-20T23:59:59.999Z'), INDEX_KEY, 'UTC date, not local');
      assert.strictEqual(core.indexKey(TICKER, '2026-09-21T00:00:00Z'), 'fundstore:v1:news-index:FROG:2026-09-21');
      assert.ok(/^fundstore:v1:news-index:[A-Z]{1,10}:\d{4}-\d{2}-\d{2}$/.test(INDEX_KEY));
      assert.strictEqual(provider.NEWS_KEY_RE.test(INDEX_KEY), false, 'index namespace disjoint from item keys');
      await withEnv(armedEnv(), async function () {
        const store = makeStore();
        const late = '2026-09-20T23:59:59.500Z';
        const r = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, fetchImpl: makeFetch(twoItemFixture()).fn, nowIso: late }));
        assert.strictEqual(parsedBody(r).fetchedAt, late, 'fetchedAt echoes the injected clock verbatim');
        assert.ok(Object.prototype.hasOwnProperty.call(store.data, INDEX_KEY), 'partition = UTC calendar date of fetchedAt');
        assert.strictEqual(JSON.parse(store.data[INDEX_KEY]).fetchedAt, late);
      });
    });

    // ── NW17 ───────────────────────────────────────────────────────────────────
    await test('NW17 pre-existing item (modified:false) is not overwritten and not in writtenKeys; run continues; index still written with all keys', async function () {
      await withEnv(armedEnv(), async function () {
        const fixture = twoItemFixture();
        const itemKeys = expectedItems(fixture).map(provider.buildNewsKey);
        const seed = {}; seed[itemKeys[0]] = '{"old":"record-from-an-earlier-day"}';
        const store = makeStore({ seed: seed });
        const r = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, fetchImpl: makeFetch(fixture).fn }));
        assert.strictEqual(r.statusCode, 200);
        assertExactBody(r, { status: 'WRITE', ticker: TICKER, fetchedAt: NOW_ISO, writtenKeys: [itemKeys[1], INDEX_KEY] }, 'only created keys');
        assert.strictEqual(store.data[itemKeys[0]], '{"old":"record-from-an-earlier-day"}', 'existing item NOT overwritten');
        assert.strictEqual(store.data[INDEX_KEY], JSON.stringify(expectedIndexRecord(itemKeys)), 'index lists every key of this fetch');
        assert.strictEqual(setOps(store).length, 3, 'create-only attempt made for every item');
        // all items pre-existing => index still closes the day, writtenKeys = [index]
        const seed2 = {}; seed2[itemKeys[0]] = 'x'; seed2[itemKeys[1]] = 'y';
        const store2 = makeStore({ seed: seed2 });
        const r2 = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store2, fetchImpl: makeFetch(fixture).fn }));
        assertExactBody(r2, { status: 'WRITE', ticker: TICKER, fetchedAt: NOW_ISO, writtenKeys: [INDEX_KEY] }, 'index only');
      });
    });

    // ── NW18 ───────────────────────────────────────────────────────────────────
    await test('NW18 item set throw / malformed result -> STORE_UNAVAILABLE (bare, or with provenance of keys already created), no index attempt', async function () {
      await withEnv(armedEnv(), async function () {
        const fixture = twoItemFixture();
        const itemKeys = expectedItems(fixture).map(provider.buildNewsKey);
        // first item throws => nothing created => bare
        const t1 = {}; t1[itemKeys[0]] = true;
        const s1 = makeStore({ setThrows: t1 });
        const r1 = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: s1, fetchImpl: makeFetch(fixture).fn }));
        assert.strictEqual(r1.statusCode, 200);
        assertExactBody(r1, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE' }, 'bare');
        assert.strictEqual(setOps(s1).length, 1, 'stops at the first failure');
        assertNoRawText(r1);
        // second item throws => first created => provenance carried, no index
        const t2 = {}; t2[itemKeys[1]] = true;
        const s2 = makeStore({ setThrows: t2 });
        const r2 = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: s2, fetchImpl: makeFetch(fixture).fn }));
        assertExactBody(r2, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', ticker: TICKER, writtenKeys: [itemKeys[0]] }, 'with provenance');
        assert.strictEqual(setOps(s2).length, 2, 'no index attempt');
        assert.ok(!Object.prototype.hasOwnProperty.call(s2.data, INDEX_KEY), 'index absent — day stays open');
        // malformed set result on the first item => creation unconfirmed => bare
        const m1 = {}; m1[itemKeys[0]] = {};
        const s3 = makeStore({ setResults: m1 });
        const r3 = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: s3, fetchImpl: makeFetch(fixture).fn }));
        assertExactBody(r3, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE' }, 'malformed item result');
        assert.strictEqual(setOps(s3).length, 1);
      });
    });

    // ── NW19 ───────────────────────────────────────────────────────────────────
    await test('NW19 index modified:false (race) -> STORE_CONFLICT with provenance, never WRITE', async function () {
      await withEnv(armedEnv(), async function () {
        const fixture = twoItemFixture();
        const itemKeys = expectedItems(fixture).map(provider.buildNewsKey);
        const sr = {}; sr[INDEX_KEY] = { modified: false };
        const store = makeStore({ setResults: sr });
        const r = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, fetchImpl: makeFetch(fixture).fn }));
        assert.strictEqual(r.statusCode, 200);
        assertExactBody(r, { status: 'DEGRADED', reason: 'STORE_CONFLICT', ticker: TICKER, writtenKeys: itemKeys }, 'index race');
        assert.notStrictEqual(parsedBody(r).status, 'WRITE');
        assert.strictEqual(getOps(store).length, 1, 'no reconciliation read on a definite modified:false');
      });
    });

    // ── NW20 ───────────────────────────────────────────────────────────────────
    await test('NW20 D-E: index throw + reconcile ABSENT -> STORE_UNAVAILABLE+keys; PRESENT or read-throw -> STORE_WRITE_UNCERTAIN; malformed set result reconciles', async function () {
      await withEnv(armedEnv(), async function () {
        const fixture = twoItemFixture();
        const itemKeys = expectedItems(fixture).map(provider.buildNewsKey);
        const st = {}; st[INDEX_KEY] = true;
        // absent => confirmed orphan items
        const s1 = makeStore({ setThrows: st });
        const r1 = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: s1, fetchImpl: makeFetch(fixture).fn }));
        assertExactBody(r1, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', ticker: TICKER, writtenKeys: itemKeys }, 'confirmed orphan');
        const gets1 = getOps(s1).filter(function (e) { return e.key === INDEX_KEY; });
        assert.strictEqual(gets1.length, 2, 'pre-read + one reconciliation read');
        assert.deepStrictEqual(gets1[1].opts, { consistency: 'strong' }, 'reconciliation is strong');
        assertNoRawText(r1);
        // present => uncertain
        const gp2 = {}; gp2[INDEX_KEY] = [{ value: null }, { value: JSON.stringify(expectedIndexRecord(itemKeys)) }];
        const s2 = makeStore({ setThrows: st, getPlan: gp2 });
        const r2 = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: s2, fetchImpl: makeFetch(fixture).fn }));
        assertExactBody(r2, { status: 'DEGRADED', reason: 'STORE_WRITE_UNCERTAIN', ticker: TICKER, writtenKeys: itemKeys }, 'uncertain (present)');
        // reconciliation read throws => uncertain
        const gp3 = {}; gp3[INDEX_KEY] = [{ value: null }, { throws: true }];
        const s3 = makeStore({ setThrows: st, getPlan: gp3 });
        const r3 = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: s3, fetchImpl: makeFetch(fixture).fn }));
        assertExactBody(r3, { status: 'DEGRADED', reason: 'STORE_WRITE_UNCERTAIN', ticker: TICKER, writtenKeys: itemKeys }, 'uncertain (read failed)');
        assertNoRawText(r3);
        // malformed set result => same reconciliation path (absent => orphan)
        const sr = {}; sr[INDEX_KEY] = { weird: true };
        const s4 = makeStore({ setResults: sr });
        const r4 = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: s4, fetchImpl: makeFetch(fixture).fn }));
        assertExactBody(r4, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', ticker: TICKER, writtenKeys: itemKeys }, 'malformed index result reconciled');
        assert.strictEqual(getOps(s4).length, 2);
        // all shapes pairwise distinguishable from WRITE
        [r1, r2, r3, r4].forEach(function (r) { assert.notStrictEqual(parsedBody(r).status, 'WRITE'); });
      });
    });

    // ── NW21 ───────────────────────────────────────────────────────────────────
    await test('NW21 store acquire throw / pre-read throw -> bare STORE_UNAVAILABLE, provider never called', async function () {
      await withEnv(armedEnv(), async function () {
        const ev = makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}' });
        Object.defineProperty(ev, '_testStore', { get: function () { throw new Error('boom-acquire'); } });
        const r = await core.handler(ev);
        assertExactBody(r, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE' }, 'acquire throw');
        assertNoRawText(r);
        const gp = {}; gp[INDEX_KEY] = [{ throws: true }];
        const store = makeStore({ getPlan: gp });
        const spy = providerSpy(async function () { return okEnvelope([]); });
        const r2 = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, providerImpl: spy.fn }));
        assertExactBody(r2, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE' }, 'pre-read throw');
        assert.strictEqual(spy.calls, 0, 'store failure precedes provider');
        assert.strictEqual(setOps(store).length, 0);
      });
    });

    // ── NW22 ───────────────────────────────────────────────────────────────────
    await test('NW22 determinism (byte-identical bodies), event/env immutability, body-supplied seams ignored', async function () {
      await withEnv(armedEnv(), async function () {
        const bodies = [];
        for (let i = 0; i < 2; i++) {
          const store = makeStore();
          const r = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, fetchImpl: makeFetch(twoItemFixture()).fn }));
          bodies.push(r.body + '|' + JSON.stringify(store.data));
        }
        assert.strictEqual(bodies[0], bodies[1], 'deterministic response and persisted bytes');
        const store = makeStore();
        const ev = makeEvent({
          auth: AUTH, store: store, fetchImpl: makeFetch(twoItemFixture()).fn,
          body: JSON.stringify({ ticker: 'FROG', _testStore: { evil: true }, _testProviderOptions: { providerImpl: 'evil', fetchImpl: 'evil', nowIso: '1999-01-01T00:00:00Z' } })
        });
        const evSnap = JSON.stringify({ httpMethod: ev.httpMethod, headers: ev.headers, body: ev.body });
        const envSnap = JSON.stringify(ENV_KEYS.map(function (k) { return process.env[k]; }));
        const r = await core.handler(ev);
        assert.strictEqual(parsedBody(r).status, 'WRITE', 'body seams ignored; event seams used');
        assert.strictEqual(parsedBody(r).fetchedAt, NOW_ISO, 'body-supplied clock ignored');
        assert.strictEqual(JSON.stringify({ httpMethod: ev.httpMethod, headers: ev.headers, body: ev.body }), evSnap, 'event unmutated');
        assert.strictEqual(JSON.stringify(ENV_KEYS.map(function (k) { return process.env[k]; })), envSnap, 'env unmutated');
      });
    });

    // ── NW23 ───────────────────────────────────────────────────────────────────
    await test('NW23 .mjs wrapper: pinned pattern, D5 (no config/schedule/cron), no logic, node --check, import-inert, Request parity', async function () {
      const src = readMjs();
      const code = stripComments(src);
      assert.ok(/@netlify\/aws-lambda-compat/.test(src), 'compat import missing');
      assert.ok(/\.\/lib\/news-catalysts-core\.js/.test(src), 'core import missing');
      assert.ok(/export default withLambda\(/.test(src), 'export default withLambda missing');
      assert.ok(!/export\s+const\s+config/.test(code), 'config export would change routing / add a schedule');
      assert.ok(!/schedule|cron|setInterval|setTimeout/i.test(code), 'D5: no scheduler surface');
      assert.strictEqual((src.match(/^import '@netlify\/blobs';$/gm) || []).length, 1, 'exactly one side-effect blobs import');
      assert.ok(!/import\s*\{[^}]*\}\s*from\s*['"]@netlify\/blobs['"]/.test(src), 'no named blobs bindings');
      assert.ok(!/console\./.test(src), 'no console output');
      ['PT_ENABLE', 'PT_NEWS', 'evaluateNewsCatalystsPreflight', 'getNewsCatalysts', 'Bearer', 'JSON.parse', 'process.env', 'getStore', 'onlyIfNew', 'fundstore', 'httpMethod']
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
      ALLOWED_IMPORTS.forEach(function (s) { assert.ok(set.has(s), 'missing allowed import: ' + s); });
      assert.ok(!fs.existsSync(path.join(ROOT, 'netlify/functions/news-catalysts.js')), 'no legacy .js twin');
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
      // Request-form parity with the core (headers lowercased as the compat rebuild does)
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
        const d = await drivePair('gate-off', { method: 'POST', headers: { authorization: AUTH }, body: '{"ticker":"FROG"}' });
        assert.strictEqual(d.text, '{"status":"DISABLED","reason":"SERVER_DISABLED"}');
      });
      await withEnv(armedEnv(), async function () {
        assert.strictEqual((await drivePair('GET', { method: 'GET', headers: { authorization: AUTH } })).status, 405);
        assert.strictEqual((await drivePair('wrong-auth', { method: 'POST', headers: { Authorization: 'Bearer nope' }, body: '{{{' })).status, 401);
        assert.strictEqual((await drivePair('cap-auth', { method: 'POST', headers: { Authorization: AUTH }, body: '{"ticker":"MSFT"}' })).status, 403, 'capitalized Authorization authenticates');
      });
    });

    // ── NW24 ───────────────────────────────────────────────────────────────────
    await test('NW24 gate-off dormancy: zero network, zero store, zero filesystem calls', async function () {
      await withEnv(armedEnv({ PT_ENABLE_NEWS_CATALYSTS_SERVER: 'false' }), async function () {
        const fsNames = ['readFileSync', 'writeFileSync', 'existsSync', 'readdirSync', 'statSync', 'openSync', 'appendFileSync'];
        const saved = {};
        let fsCalls = 0;
        fsNames.forEach(function (n) { saved[n] = fs[n]; fs[n] = function () { fsCalls += 1; return saved[n].apply(fs, arguments); }; });
        const fetchBefore = realFetchCalls;
        const state = {};
        const spy = providerSpy(function () { throw new Error('boom'); });
        let r;
        try {
          r = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: poisonedStore(state), providerImpl: spy.fn, fetchImpl: spy.fn }));
        } finally {
          fsNames.forEach(function (n) { fs[n] = saved[n]; });
        }
        assertExactBody(r, { status: 'DISABLED', reason: 'SERVER_DISABLED' }, 'DISABLED');
        assert.strictEqual(realFetchCalls, fetchBefore, 'zero network');
        assert.ok(!state.touched, 'zero store');
        assert.strictEqual(spy.calls, 0, 'zero provider');
        assert.strictEqual(fsCalls, 0, 'zero filesystem calls');
      });
    });

    // ── NW25 ───────────────────────────────────────────────────────────────────
    await test('NW25 static forbidden-surface scan of the TARGET core (comment-stripped) + structural pins', async function () {
      const raw = fs.readFileSync(CORE_SRC, 'utf8');
      const s = stripComments(raw);
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
        [/Date\.now\s*\(/, 'ambient Date.now clock'],
        [/timeoutMs/, 'provider timeout override'],
        [/maxBytes/, 'provider byte-ceiling override'],
        [/\.message\b/, 'raw error message access'],
        [/\.stack\b/, 'raw error stack access'],
        [/(^|[^.\w])fetch\s*\(/, 'bare fetch( call'],
        [/store\.list\s*\(|\.list\s*\(\s*\{/, 'store.list / prefix enumeration (STOP 3)'],
        [/connectLambda/, 'connectLambda (ambient getStore only)'],
        [/schedule|cron/i, 'scheduler surface (D5)'],
        [/export\s+const\s+config/, 'config export (D5)'],
        [/grok/i, 'GrokBot surface (out of scope)']
      ];
      forbidden.forEach(function (pair) { assert.ok(!pair[0].test(s), 'must NOT contain ' + pair[1]); });
      // structural requirements
      assert.ok(/process\.env\.PT_ENABLE_NEWS_CATALYSTS_SERVER\s*!==\s*'true'/.test(s), 'strict server gate check');
      const envNames = new Set((s.match(/process\.env\.(\w+)/g) || []).map(function (x) { return x.slice('process.env.'.length); }));
      assert.deepStrictEqual(Array.from(envNames).sort(), ['PERPLEXITY_API_KEY', 'PT_ENABLE_NEWS_CATALYSTS_SERVER'], 'env read at the boundary only: gate + upstream key');
      const reqRe = /\brequire\s*\(\s*(['"])([^'"]*)\1\s*\)/g;
      const allowed = { './news-catalysts-preflight': true, './news-catalysts-provider': true, '@netlify/blobs': true };
      const seen = [];
      let m;
      while ((m = reqRe.exec(s)) !== null) { seen.push(m[2]); assert.ok(allowed[m[2]] === true, 'require allowlist violation: ' + m[2]); }
      assert.strictEqual((s.match(/\brequire\s*\(/g) || []).length, seen.length, 'no dynamic/computed require');
      assert.deepStrictEqual(seen.slice().sort(), ['./news-catalysts-preflight', './news-catalysts-provider', '@netlify/blobs'], 'exactly three imports');
      assert.strictEqual((s.match(/@netlify\/blobs/g) || []).length, 1, 'blobs referenced exactly once');
      assert.ok(s.indexOf('@netlify/blobs') > s.indexOf('function acquireStore'), 'blobs require is lazy inside acquireStore');
      assert.strictEqual((s.match(/onlyIfNew:\s*true/g) || []).length, 2, 'exactly two create-only write sites (items loop, index)');
      assert.strictEqual((s.match(/new Date\(/g) || []).length, 1, 'exactly one boundary clock read');
      assert.ok(/consistency:\s*'strong'/.test(s), 'strong-consistency reads');
      const bodyDerefs = s.match(/parsed\.value\.\w+/g) || [];
      assert.ok(bodyDerefs.length > 0 && bodyDerefs.every(function (d) { return d === 'parsed.value.ticker'; }), 'parsed body is read only for .ticker');
      assert.ok(s.indexOf('fundstore:v1:news-index:') !== -1, 'owns the index key literal');
      assert.ok(s.indexOf("'fund-facts-store'") !== -1, 'STORE_NAME local literal (fund-facts-store)');
      assert.ok(/default:/.test(s) && /PREFLIGHT_UNMAPPED/.test(s), 'total preflight mapping with default');
      assert.strictEqual(realFetchCalls, 0, 'the real global.fetch was never reached during the suite');
    });

    // ── NW27 ───────────────────────────────────────────────────────────────────
    await test('NW27 planted 5 (Codex R1): malformed-SUCCESS from an injected provider -> 502, zero writes; reordered/extra-field items accepted, persisted byte-identically without extras', async function () {
      await withEnv(armedEnv(), async function () {
        const fixture = twoItemFixture();
        const items = expectedItems(fixture);
        const itemKeys = items.map(provider.buildNewsKey);
        const expectedWrite = { status: 'WRITE', ticker: TICKER, fetchedAt: NOW_ISO, writtenKeys: itemKeys.concat([INDEX_KEY]) };
        // Sanity: the exact provider shape through the injected seam is accepted and persisted.
        const good = makeStore();
        const rGood = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: good, providerImpl: async function () { return okEnvelope(items); } }));
        assertExactBody(rGood, expectedWrite, 'exact shape accepted');
        // POSITIVE (Owner ruling): a reordered but valid item is accepted and persists byte-identically.
        const reversed = {}; Object.keys(items[0]).reverse().forEach(function (k) { reversed[k] = items[0][k]; });
        const s1 = makeStore();
        const r1 = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: s1, providerImpl: async function () { return okEnvelope([reversed, items[1]]); } }));
        assertExactBody(r1, expectedWrite, 'reordered item accepted');
        assert.strictEqual(s1.data[itemKeys[0]], good.data[itemKeys[0]], 'reordered input => byte-identical stored record');
        assert.deepStrictEqual(Object.keys(JSON.parse(s1.data[itemKeys[0]])), RECORD_FIELD_ORDER, 'persisted order pinned by construction');
        // POSITIVE (Owner ruling): an unknown extra narrative field is accepted but never persisted.
        const withExtra = keyed(items[0]); withExtra.summary = 'BIG HEADLINE narrative';
        const s2 = makeStore();
        const r2 = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: s2, providerImpl: async function () { return okEnvelope([withExtra, items[1]]); } }));
        assertExactBody(r2, expectedWrite, 'extra-field item accepted');
        assert.strictEqual(s2.data[itemKeys[0]], good.data[itemKeys[0]], 'extra field never reaches the store');
        assert.strictEqual(JSON.stringify(s2.data).indexOf('BIG HEADLINE'), -1, 'no narrative value persisted anywhere');
        // NEGATIVES — mutations applied to the provider RESULT fixture, never to the test.
        function mutItem(fn) { const it = keyed(items[0]); fn(it); return okEnvelope([it, items[1]]); }
        function mutEnv(fn) { const e = okEnvelope(items); fn(e.envelope); return e; }
        const cases = [
          ['Codex scenario: skeleton item + narrative field', okEnvelope([{ ticker: TICKER, eventDate: '2026-09-17', provider: provider.PROVIDER_ID, identityHash: items[0].identityHash, summary: 'narrative' }])],
          ['missing sourceDomain', mutItem(function (it) { delete it.sourceDomain; })],
          ['missing provenance', mutItem(function (it) { delete it.provenance; })],
          ['missing category', mutItem(function (it) { delete it.category; })],
          ['off-vocabulary category', mutItem(function (it) { it.category = 'weather_report'; })],
          ['empty direction', mutItem(function (it) { it.direction = ''; })],
          ['http sourceUrl', mutItem(function (it) { it.sourceUrl = 'http://ir.jfrog.com/x'; })],
          ['non-string normalizedSourceUrl', mutItem(function (it) { it.normalizedSourceUrl = 7; })],
          ['foreign ticker', mutItem(function (it) { it.ticker = 'AAPL'; })],
          ['foreign provider', mutItem(function (it) { it.provider = 'someone-else@v1'; })],
          ['retrievedAt != injected clock', mutItem(function (it) { it.retrievedAt = '2020-01-01T00:00:00Z'; })],
          ['bad identityHash', mutItem(function (it) { it.identityHash = 'ZZ'; })],
          ['non-string identityHash', mutItem(function (it) { it.identityHash = 42; })],
          ['provenance verified', mutItem(function (it) { it.provenance = 'verified'; })],
          ['confidence set', mutItem(function (it) { it.confidence = 0.9; })],
          ['requiresVerification false', mutItem(function (it) { it.requiresVerification = false; })],
          ['scoringImpact set', mutItem(function (it) { it.scoringImpact = 'positive'; })],
          ['grammar-invalid eventDate', mutItem(function (it) { it.eventDate = '2026/09/17'; })],
          ['item not an object', okEnvelope([null])],
          ['envelope fetchedAt != clock', mutEnv(function (e) { e.fetchedAt = '2026-09-19T00:00:00Z'; })],
          ['envelope foreign provider', mutEnv(function (e) { e.provider = 'someone-else@v1'; })],
          ['envelope wrong sourceTier', mutEnv(function (e) { e.sourceTier = 'sec_xbrl_primary'; })],
          ['envelope items not array', mutEnv(function (e) { e.items = {}; })],
          ['ok:false', { ok: false, reason: 'PROVIDER_FAILURE' }],
          ['null result', null],
          ['string result', 'garbage']
        ];
        for (const pair of cases) {
          const store = makeStore();
          const r = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, providerImpl: async function () { return pair[1]; } }));
          assert.strictEqual(r.statusCode, 502, pair[0]);
          assertExactBody(r, { status: 'ERROR', reason: 'PROVIDER_FAILURE' }, pair[0]);
          assert.strictEqual(setOps(store).length, 0, 'zero writes: ' + pair[0]);
          assert.strictEqual(core.validateProviderResult(pair[1], TICKER, NOW_ISO).ok, false, 'validator rejects: ' + pair[0]);
        }
        assert.strictEqual(core.validateProviderResult(okEnvelope(items), TICKER, NOW_ISO).ok, true, 'validator accepts the exact shape');
      });
    });

    // ── NW26 ───────────────────────────────────────────────────────────────────
    await test('NW26 import-inert: requiring the core performs no I/O and exports the contract surface', async function () {
      const script =
        'global.fetch = function () { throw new Error("LIVE"); };' +
        'const m = require(' + JSON.stringify(CORE_SRC) + ');' +
        'for (const f of ["handler", "indexKey", "projectItemRecord", "mapPreflightFailure"]) { if (typeof m[f] !== "function") { process.exit(2); } }' +
        'process.exit(0);';
      const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, 'clean require: ' + ((r.stderr || '') + (r.stdout || '')).trim());
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
