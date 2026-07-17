'use strict';

/*
 * qa/fund_facts_core_offline.js
 *
 * EG-25C-1 · C1-S3 — J1 fund-facts core endpoint adapter: FS-series offline QA.
 *
 * Proves the core endpoint boundary (netlify/functions/lib/fund-facts-core.js)
 * with ZERO real network / Blob / production. The store is an in-memory fake
 * handed through the EVENT-ONLY _testStore seam; the provider is exercised both
 * as the REAL C1-S1 lib over an injected fetch (integration) and as an injected
 * providerImpl (unit, for throw/malformed-result shapes the real lib cannot
 * produce). A throwing global.fetch guard is installed throughout.
 *
 * Coverage (Codex-PASS C1-S3 contract):
 *   FS07  boundary ordering (OPTIONS/gate/method/auth-first/body/ticker)
 *   FS08  configuration failures -> 500 CONFIGURATION_MISSING (post-auth)
 *   FS09a provider throws -> 502 PROVIDER_FAILURE, zero writes, no raw text
 *   FS09c envelope validation (D-B/D-C): NONE only for exact {null,null}
 *   FS09b store failures + D-E reconciliation (orphan vs uncertain)
 *   FS10  seeded pointer -> SKIPPED, zero SEC I/O, pointer-ONLY pre-read
 *   FS11  exact WRITE and NONE bodies (deep-equal AND stringify-equal)
 *   FS15  onlyIfNew conflicts -> STORE_CONFLICT (D-A), no self-heal (D-D)
 *   FS17  teardown-safety derivable from exact response shape
 *   INV   import-inert, determinism, immutability, event-only seams,
 *         forbidden-surface scan of the TARGET module
 *
 * Run: node qa/fund_facts_core_offline.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CORE_SRC = path.resolve(__dirname, '..', 'netlify', 'functions', 'lib', 'fund-facts-core.js');
const PROVIDER_SRC = path.resolve(__dirname, '..', 'netlify', 'functions', 'lib', 'fund-facts-provider.js');
const core = require(CORE_SRC);
const provider = require(PROVIDER_SRC);

const NOW_ISO = '2026-07-15T00:00:00.000Z';
const RUN_ID = 1700000000000;
const CIK = '0001800667';
const TOKEN = 'tok-fund-facts-qa-1';
const AUTH = 'Bearer ' + TOKEN;
const FACTS_KEY = 'fundstore:v1:facts:' + CIK;
const POINTER_KEY = 'fundstore:v1:cik:FROG';

// ── env management (the core reads process.env at its boundary) ──────────────
const ENV_KEYS = [
  'PT_ENABLE_FUND_FACTS_SERVER',
  'PT_FUND_FACTS_TOKEN',
  'PT_FUND_FACTS_ALLOWED_TICKERS',
  'SEC_USER_AGENT',
  'PT_SEC_EVIDENCE_PULL_TOKEN',
  'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN'
];

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
    PT_ENABLE_FUND_FACTS_SERVER: 'true',
    PT_FUND_FACTS_TOKEN: TOKEN,
    PT_FUND_FACTS_ALLOWED_TICKERS: 'FROG,AAPL',
    SEC_USER_AGENT: 'PulseC1S3Test/1.0 qa@example.com'
  }, extra || {});
}

// ── in-memory store fake (records ops; injectable faults; onlyIfNew honored) ──
// opts.getPlan[key]  = array of { value } | { throws: true }, consumed per get
// opts.setThrows[key] = throw on set of that key
// opts.setResults[key] = raw result object returned from set (no data mutation
//                        unless it carries modified === true)
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

// A store that must never be touched (pre-auth / gate-off paths).
function poisonedStore(state) {
  return {
    get: async function () { state.touched = true; throw new Error('POISONED_STORE_TOUCHED'); },
    set: async function () { state.touched = true; throw new Error('POISONED_STORE_TOUCHED'); }
  };
}

// ── provider fixtures (borrowed from the C1-S1 suite, minimal) ────────────────
function durEntry(start, end, val, fy, fp, form, filed, accn) {
  return { start: start, end: end, val: val, fy: fy, fp: fp, form: form, filed: filed, accn: accn };
}
function node(unit, entries) {
  const u = {};
  u[unit] = entries;
  return { units: u };
}
function companyFacts(usgaap) {
  return { cik: parseInt(CIK, 10), entityName: 'JFrog Ltd.', facts: { 'us-gaap': usgaap } };
}
function usgaapMinimal() {
  return {
    RevenueFromContractWithCustomerExcludingAssessedTax: node('USD', [
      durEntry('2025-01-01', '2025-03-31', 100000000, 2025, 'Q1', '10-Q', '2025-05-08', '0001800667-25-000012'),
      durEntry('2026-01-01', '2026-03-31', 125000000, 2026, 'Q1', '10-Q', '2026-05-08', '0001800667-26-000042')
    ])
  };
}
function jsonResponse(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status: status, headers: { get: function () { return null; } }, text: async function () { return text; } };
}
function makeFetch(usgaap, tickers, factsStatus) {
  const spy = { calls: [] };
  spy.fn = async function (url) {
    const u = String(url);
    spy.calls.push(u);
    if (u.indexOf('company_tickers.json') !== -1) {
      return jsonResponse(200, tickers !== undefined
        ? tickers
        : { '0': { cik_str: parseInt(CIK, 10), ticker: 'FROG', title: 'JFrog Ltd.' } });
    }
    if (u.indexOf('companyfacts/CIK') !== -1) {
      if (factsStatus && factsStatus !== 200) { return jsonResponse(factsStatus, {}); }
      return jsonResponse(200, companyFacts(usgaap));
    }
    return jsonResponse(404, {});
  };
  return spy;
}

// A valid provider record for providerImpl-based cases (envelope-complete).
function validRecord(overrides) {
  return Object.assign({
    ticker: 'FROG',
    cik: CIK,
    fetchedAt: NOW_ISO,
    sourceTier: 'sec_xbrl_primary',
    contractVersion: 'fund-contract-v1',
    provider: 'j1-sec-facts@job-model-v1',
    runId: RUN_ID,
    series: {},
    derived: {},
    filings: [],
    gaps: [],
    secRequests: [],
    confidence: null,
    verificationStatus: 'verified'
  }, overrides || {});
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
  assert.ok(r.body.indexOf('boom') === -1 && r.body.indexOf('POISONED') === -1,
    'no raw error text leaks into the response body');
}

function liveGuard() { throw new Error('LIVE_NETWORK_FORBIDDEN'); }

// ── runner ────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
async function test(label, fn) {
  try {
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
  process.stdout.write('\n=== C1-S3 — fund-facts-core FS-series (offline) ===\n\n');

  const _origFetch = global.fetch;
  global.fetch = liveGuard; // behavioral guard: no real network anywhere below.

  // ── FS07 boundary ordering ──────────────────────────────────────────────────
  await test('FS07 OPTIONS -> 204 before the gate, no body', async function () {
    await withEnv({}, async function () {
      const state = {};
      const r = await core.handler(makeEvent({ method: 'OPTIONS', store: poisonedStore(state) }));
      assert.strictEqual(r.statusCode, 204);
      assert.ok(!('body' in r), '204 carries no body field');
      assert.ok(!state.touched, 'store untouched');
    });
  });

  await test('FS07 gate off -> 200 DISABLED, zero downstream I/O', async function () {
    await withEnv({}, async function () {
      const state = {};
      const spy = providerSpy(function () { throw new Error('boom-provider'); });
      const r = await core.handler(makeEvent({
        auth: AUTH, body: '{"ticker":"FROG"}', store: poisonedStore(state), providerImpl: spy.fn
      }));
      assert.strictEqual(r.statusCode, 200);
      assertExactBody(r, { status: 'DISABLED', reason: 'SERVER_DISABLED' }, 'DISABLED');
      assert.ok(!state.touched, 'store untouched');
      assert.strictEqual(spy.calls, 0, 'provider never called');
    });
  });

  await test('FS07 non-POST -> 405 METHOD_NOT_ALLOWED', async function () {
    await withEnv(armedEnv(), async function () {
      const r = await core.handler(makeEvent({ method: 'GET', auth: AUTH }));
      assert.strictEqual(r.statusCode, 405);
      assertExactBody(r, { status: 'METHOD_NOT_ALLOWED', reason: 'METHOD_NOT_ALLOWED' }, '405');
    });
  });

  await test('FS07 auth-first: wrong/missing token + malformed body -> 401, body never parsed', async function () {
    await withEnv(armedEnv(), async function () {
      const state = {};
      for (const auth of ['Bearer wrong-token', undefined, '']) {
        const r = await core.handler(makeEvent({
          auth: auth, body: '{{{not-json', store: poisonedStore(state)
        }));
        assert.strictEqual(r.statusCode, 401, 'auth precedes body parse');
        assertExactBody(r, { status: 'UNAUTHORIZED', reason: 'UNAUTHORIZED' }, '401');
      }
      assert.ok(!state.touched, 'store untouched pre-auth');
    });
  });

  await test('FS07 post-auth malformed/array/null/empty body -> 400 INVALID_JSON', async function () {
    await withEnv(armedEnv(), async function () {
      const state = {};
      for (const body of ['{{{', '[1,2]', 'null', '', undefined, '   ']) {
        const r = await core.handler(makeEvent({ auth: AUTH, body: body, store: poisonedStore(state) }));
        assert.strictEqual(r.statusCode, 400, 'body: ' + JSON.stringify(body));
        assertExactBody(r, { status: 'INVALID_JSON', reason: 'INVALID_JSON' }, 'INVALID_JSON');
      }
      assert.ok(!state.touched, 'store untouched on body failures');
    });
  });

  await test('FS07 invalid ticker -> 400; unlisted ticker -> 403', async function () {
    await withEnv(armedEnv(), async function () {
      const state = {};
      for (const t of ['frog', ' FROG', 'FR-G', '', 7, null]) {
        const r = await core.handler(makeEvent({
          auth: AUTH, body: JSON.stringify({ ticker: t }), store: poisonedStore(state)
        }));
        assert.strictEqual(r.statusCode, 400, 'ticker: ' + JSON.stringify(t));
        assertExactBody(r, { status: 'INVALID_TICKER', reason: 'TICKER_INVALID' }, 'INVALID_TICKER');
      }
      const r2 = await core.handler(makeEvent({
        auth: AUTH, body: '{"ticker":"MSFT"}', store: poisonedStore(state)
      }));
      assert.strictEqual(r2.statusCode, 403);
      assertExactBody(r2, { status: 'TICKER_NOT_ALLOWED', reason: 'TICKER_NOT_ALLOWED' }, '403');
      assert.ok(!state.touched, 'store untouched before pf.ok');
    });
  });

  // ── FS08 configuration failures ─────────────────────────────────────────────
  await test('FS08 config family -> 500 CONFIGURATION_MISSING (post-auth, pre-body)', async function () {
    const cases = [
      [armedEnv({ PT_SEC_EVIDENCE_PULL_TOKEN: TOKEN }), 'TOKEN_COLLISION'],
      [armedEnv({ PT_SEC_EVIDENCE_STORE_WRITE_TOKEN: TOKEN }), 'TOKEN_COLLISION'],
      [(function () { const e = armedEnv(); delete e.SEC_USER_AGENT; return e; })(), 'SEC_USER_AGENT_MISSING'],
      [(function () { const e = armedEnv(); delete e.PT_FUND_FACTS_ALLOWED_TICKERS; return e; })(), 'ALLOWLIST_MISSING'],
      [armedEnv({ PT_FUND_FACTS_ALLOWED_TICKERS: 'FR0G' }), 'ALLOWLIST_INVALID']
    ];
    for (const pair of cases) {
      await withEnv(pair[0], async function () {
        const state = {};
        // malformed body proves the config check precedes body parsing
        const r = await core.handler(makeEvent({ auth: AUTH, body: '{{{', store: poisonedStore(state) }));
        assert.strictEqual(r.statusCode, 500, pair[1]);
        assertExactBody(r, { status: 'CONFIGURATION_MISSING', reason: pair[1] }, pair[1]);
        assert.ok(!state.touched, 'store untouched: ' + pair[1]);
      });
    }
  });

  // ── FS09a provider throws ───────────────────────────────────────────────────
  await test('FS09a provider throw -> 502 PROVIDER_FAILURE, zero writes, no raw text', async function () {
    await withEnv(armedEnv(), async function () {
      const store = makeStore();
      const spy = providerSpy(function () { throw new Error('boom-provider-secret'); });
      const r = await core.handler(makeEvent({
        auth: AUTH, body: '{"ticker":"FROG"}', store: store, providerImpl: spy.fn
      }));
      assert.strictEqual(r.statusCode, 502);
      assertExactBody(r, { status: 'ERROR', reason: 'PROVIDER_FAILURE' }, '502');
      assertNoRawText(r);
      assert.strictEqual(spy.calls, 1);
      assert.strictEqual(setOps(store).length, 0, 'zero store writes');
    });
  });

  await test('FS09a integration: SEC HTTP 403 via real provider -> 502, zero writes', async function () {
    await withEnv(armedEnv(), async function () {
      provider._clearCaches();
      const store = makeStore();
      const fetchSpy = makeFetch(usgaapMinimal(), undefined, 403);
      const r = await core.handler(makeEvent({
        auth: AUTH, body: '{"ticker":"FROG"}', store: store, fetchImpl: fetchSpy.fn
      }));
      assert.strictEqual(r.statusCode, 502);
      assertExactBody(r, { status: 'ERROR', reason: 'PROVIDER_FAILURE' }, '502 via SEC_HTTP_403');
      assert.strictEqual(setOps(store).length, 0, 'zero store writes');
    });
  });

  // ── FS09c provider-result envelope validation (D-B / D-C) ───────────────────
  await test('FS09c validateProviderResult: every envelope check fails closed', async function () {
    const vp = core.validateProviderResult;
    assert.strictEqual(vp({ cik: CIK, record: validRecord() }, 'FROG').ok, true, 'valid envelope passes');
    const bad = [
      [null, 'result null'],
      ['x', 'result non-object'],
      [{ cik: CIK, record: null }, 'cik present, record missing'],
      [{ cik: null, record: validRecord() }, 'record present, cik missing'],
      [{ cik: '123', record: validRecord() }, 'cik not 10 digits'],
      [{ cik: 1800667, record: validRecord() }, 'cik non-string'],
      [{ cik: CIK, record: [] }, 'record is an array'],
      [{ cik: CIK, record: validRecord({ cik: '0000000001' }) }, 'record.cik mismatch'],
      [{ cik: CIK, record: validRecord({ ticker: 'AAPL' }) }, 'record.ticker mismatch'],
      [{ cik: CIK, record: validRecord({ contractVersion: 'fund-contract-v2' }) }, 'contractVersion mismatch'],
      [{ cik: CIK, record: validRecord({ sourceTier: 'other_tier' }) }, 'sourceTier mismatch'],
      [{ cik: CIK, record: validRecord({ provider: 'someone-else@v1' }) }, 'provider mismatch'],
      [{ cik: CIK, record: validRecord({ fetchedAt: 'not-a-date' }) }, 'fetchedAt invalid'],
      [{ cik: CIK, record: validRecord({ fetchedAt: 1700000000000 }) }, 'fetchedAt non-string'],
      [{ cik: CIK, record: validRecord({ runId: NaN }) }, 'runId NaN'],
      [{ cik: CIK, record: validRecord({ runId: 'x' }) }, 'runId non-number'],
      [{ cik: CIK, record: (function () { const r = validRecord(); delete r.runId; return r; })() }, 'runId absent']
    ];
    bad.forEach(function (pair) {
      assert.strictEqual(vp(pair[0], 'FROG').ok, false, pair[1]);
    });
  });

  await test('FS09c handler: partial/malformed provider result -> 502, zero writes; exact {null,null} -> NONE', async function () {
    await withEnv(armedEnv(), async function () {
      const shapes = [
        { cik: CIK, record: null },
        { cik: null, record: validRecord() },
        { cik: '123', record: validRecord() },
        { cik: CIK, record: validRecord({ ticker: 'AAPL' }) },
        { cik: CIK, record: validRecord({ contractVersion: 'v0' }) },
        null,
        'garbage'
      ];
      for (const shape of shapes) {
        const store = makeStore();
        const r = await core.handler(makeEvent({
          auth: AUTH, body: '{"ticker":"FROG"}', store: store,
          providerImpl: async function () { return shape; }
        }));
        assert.strictEqual(r.statusCode, 502, 'shape: ' + JSON.stringify(shape));
        assertExactBody(r, { status: 'ERROR', reason: 'PROVIDER_FAILURE' }, 'malformed result');
        assert.strictEqual(setOps(store).length, 0, 'zero writes for malformed result');
      }
      const store2 = makeStore();
      const r2 = await core.handler(makeEvent({
        auth: AUTH, body: '{"ticker":"FROG"}', store: store2,
        providerImpl: async function () { return { cik: null, record: null }; }
      }));
      assert.strictEqual(r2.statusCode, 200);
      assertExactBody(r2, { status: 'NONE', reason: 'NONE', ticker: 'FROG' }, 'exact NONE');
      assert.strictEqual(setOps(store2).length, 0, 'NONE writes nothing');
    });
  });

  // ── FS09b store failures + D-E reconciliation ───────────────────────────────
  await test('FS09b store acquire throw -> bare DEGRADED/STORE_UNAVAILABLE', async function () {
    await withEnv(armedEnv(), async function () {
      const ev = makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}' });
      Object.defineProperty(ev, '_testStore', { get: function () { throw new Error('boom-acquire'); } });
      const r = await core.handler(ev);
      assert.strictEqual(r.statusCode, 200);
      assertExactBody(r, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE' }, 'acquire throw');
      assertNoRawText(r);
    });
  });

  await test('FS09b pre-read throw -> bare DEGRADED, provider never called', async function () {
    await withEnv(armedEnv(), async function () {
      const store = makeStore({ getPlan: (function () { const p = {}; p[POINTER_KEY] = [{ throws: true }]; return p; })() });
      const spy = providerSpy(async function () { return { cik: null, record: null }; });
      const r = await core.handler(makeEvent({
        auth: AUTH, body: '{"ticker":"FROG"}', store: store, providerImpl: spy.fn
      }));
      assertExactBody(r, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE' }, 'pre-read throw');
      assert.strictEqual(spy.calls, 0, 'store failure precedes provider');
      assert.strictEqual(setOps(store).length, 0);
      assertNoRawText(r);
    });
  });

  await test('FS09b facts-set throw / malformed result -> bare DEGRADED, no pointer attempt', async function () {
    await withEnv(armedEnv(), async function () {
      // throw
      const s1 = makeStore({ setThrows: (function () { const p = {}; p[FACTS_KEY] = true; return p; })() });
      const r1 = await core.handler(makeEvent({
        auth: AUTH, body: '{"ticker":"FROG"}', store: s1,
        providerImpl: async function () { return { cik: CIK, record: validRecord() }; }
      }));
      assertExactBody(r1, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE' }, 'facts-set throw');
      assert.strictEqual(setOps(s1).length, 1, 'no pointer set after facts throw');
      assert.ok(!Object.prototype.hasOwnProperty.call(s1.data, FACTS_KEY), 'facts not persisted');
      // malformed set result (creation unconfirmed)
      const s2 = makeStore({ setResults: (function () { const p = {}; p[FACTS_KEY] = {}; return p; })() });
      const r2 = await core.handler(makeEvent({
        auth: AUTH, body: '{"ticker":"FROG"}', store: s2,
        providerImpl: async function () { return { cik: CIK, record: validRecord() }; }
      }));
      assertExactBody(r2, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE' }, 'facts-set malformed');
      assert.strictEqual(setOps(s2).length, 1, 'no pointer set after malformed facts result');
    });
  });

  await test('FS09b D-E: pointer throw + reconcile ABSENT -> confirmed orphan (facts key, teardown-safe)', async function () {
    await withEnv(armedEnv(), async function () {
      const store = makeStore({ setThrows: (function () { const p = {}; p[POINTER_KEY] = true; return p; })() });
      const r = await core.handler(makeEvent({
        auth: AUTH, body: '{"ticker":"FROG"}', store: store,
        providerImpl: async function () { return { cik: CIK, record: validRecord() }; }
      }));
      assert.strictEqual(r.statusCode, 200);
      assertExactBody(r, {
        status: 'DEGRADED', reason: 'STORE_UNAVAILABLE',
        ticker: 'FROG', cik: CIK, writtenKeys: [FACTS_KEY]
      }, 'confirmed orphan');
      assert.ok(Object.prototype.hasOwnProperty.call(store.data, FACTS_KEY), 'facts key present');
      assert.ok(!Object.prototype.hasOwnProperty.call(store.data, POINTER_KEY), 'pointer absent');
      const gets = getOps(store).filter(function (e) { return e.key === POINTER_KEY; });
      assert.strictEqual(gets.length, 2, 'pre-read + reconciliation read');
      assert.deepStrictEqual(gets[1].opts, { consistency: 'strong' }, 'reconciliation is strong');
      assertNoRawText(r);
    });
  });

  await test('FS09b D-E: pointer throw + reconcile PRESENT -> STORE_WRITE_UNCERTAIN, never WRITE', async function () {
    await withEnv(armedEnv(), async function () {
      const getPlan = {};
      getPlan[POINTER_KEY] = [{ value: null }, { value: '{"cik":"' + CIK + '"}' }];
      const setThrows = {};
      setThrows[POINTER_KEY] = true;
      const store = makeStore({ getPlan: getPlan, setThrows: setThrows });
      const r = await core.handler(makeEvent({
        auth: AUTH, body: '{"ticker":"FROG"}', store: store,
        providerImpl: async function () { return { cik: CIK, record: validRecord() }; }
      }));
      assertExactBody(r, {
        status: 'DEGRADED', reason: 'STORE_WRITE_UNCERTAIN',
        ticker: 'FROG', cik: CIK, writtenKeys: [FACTS_KEY]
      }, 'uncertain (pointer present)');
      assert.notStrictEqual(parsedBody(r).status, 'WRITE');
      assertNoRawText(r);
    });
  });

  await test('FS09b D-E: pointer throw + reconciliation read throws -> STORE_WRITE_UNCERTAIN', async function () {
    await withEnv(armedEnv(), async function () {
      const getPlan = {};
      getPlan[POINTER_KEY] = [{ value: null }, { throws: true }];
      const setThrows = {};
      setThrows[POINTER_KEY] = true;
      const store = makeStore({ getPlan: getPlan, setThrows: setThrows });
      const r = await core.handler(makeEvent({
        auth: AUTH, body: '{"ticker":"FROG"}', store: store,
        providerImpl: async function () { return { cik: CIK, record: validRecord() }; }
      }));
      assertExactBody(r, {
        status: 'DEGRADED', reason: 'STORE_WRITE_UNCERTAIN',
        ticker: 'FROG', cik: CIK, writtenKeys: [FACTS_KEY]
      }, 'uncertain (reconciliation failed)');
      assertNoRawText(r);
    });
  });

  await test('FS09b pointer-set malformed result -> reconciliation path (absent => confirmed orphan)', async function () {
    await withEnv(armedEnv(), async function () {
      const setResults = {};
      setResults[POINTER_KEY] = { weird: true };
      const store = makeStore({ setResults: setResults });
      const r = await core.handler(makeEvent({
        auth: AUTH, body: '{"ticker":"FROG"}', store: store,
        providerImpl: async function () { return { cik: CIK, record: validRecord() }; }
      }));
      assertExactBody(r, {
        status: 'DEGRADED', reason: 'STORE_UNAVAILABLE',
        ticker: 'FROG', cik: CIK, writtenKeys: [FACTS_KEY]
      }, 'malformed pointer result reconciled to orphan');
    });
  });

  // ── FS10 seeded skip ────────────────────────────────────────────────────────
  await test('FS10 seeded pointer -> SKIPPED/ALREADY_SEEDED, zero SEC I/O, pointer-ONLY pre-read', async function () {
    await withEnv(armedEnv(), async function () {
      const seed = {};
      seed[POINTER_KEY] = '{"cik":"' + CIK + '"}';
      const store = makeStore({ seed: seed });
      const spy = providerSpy(async function () { return { cik: null, record: null }; });
      const r = await core.handler(makeEvent({
        auth: AUTH, body: '{"ticker":"FROG"}', store: store, providerImpl: spy.fn
      }));
      assert.strictEqual(r.statusCode, 200);
      assertExactBody(r, { status: 'SKIPPED', reason: 'ALREADY_SEEDED', ticker: 'FROG' }, 'SKIPPED');
      assert.strictEqual(spy.calls, 0, 'zero SEC I/O');
      assert.strictEqual(setOps(store).length, 0, 'zero writes');
      const gets = getOps(store);
      assert.strictEqual(gets.length, 1, 'pointer-ONLY pre-read (single get)');
      assert.strictEqual(gets[0].key, POINTER_KEY);
      assert.deepStrictEqual(gets[0].opts, { consistency: 'strong' }, 'strong pre-read');
    });
  });

  // ── FS11 exact WRITE and NONE bodies ────────────────────────────────────────
  await test('FS11 integration WRITE via real provider -> exact body, write order, onlyIfNew', async function () {
    await withEnv(armedEnv(), async function () {
      provider._clearCaches();
      const store = makeStore();
      const fetchSpy = makeFetch(usgaapMinimal());
      const r = await core.handler(makeEvent({
        auth: AUTH, body: '{"ticker":"FROG"}', store: store, fetchImpl: fetchSpy.fn
      }));
      assert.strictEqual(r.statusCode, 200);
      assertExactBody(r, {
        status: 'WRITE', ticker: 'FROG', cik: CIK, writtenKeys: [FACTS_KEY, POINTER_KEY]
      }, 'exact WRITE');
      // persisted state
      const storedRecord = JSON.parse(store.data[FACTS_KEY]);
      assert.strictEqual(storedRecord.ticker, 'FROG');
      assert.strictEqual(storedRecord.cik, CIK);
      assert.strictEqual(storedRecord.contractVersion, 'fund-contract-v1');
      assert.strictEqual(store.data[POINTER_KEY], '{"cik":"' + CIK + '"}');
      // op order + create-only options
      const ops = store.log;
      assert.strictEqual(ops[0].op, 'get');
      assert.strictEqual(ops[0].key, POINTER_KEY, 'pre-read first');
      const sets = setOps(store);
      assert.strictEqual(sets.length, 2);
      assert.strictEqual(sets[0].key, FACTS_KEY, 'facts record written first');
      assert.strictEqual(sets[1].key, POINTER_KEY, 'pointer written last');
      sets.forEach(function (s) {
        assert.deepStrictEqual(s.opts, { onlyIfNew: true }, 'create-only write: ' + s.key);
      });
    });
  });

  await test('FS11 NONE integration: unresolvable ticker -> exact NONE body, zero writes', async function () {
    await withEnv(armedEnv(), async function () {
      provider._clearCaches();
      const store = makeStore();
      const fetchSpy = makeFetch(usgaapMinimal(), {}); // empty ticker map => no CIK
      const r = await core.handler(makeEvent({
        auth: AUTH, body: '{"ticker":"FROG"}', store: store, fetchImpl: fetchSpy.fn
      }));
      assert.strictEqual(r.statusCode, 200);
      assertExactBody(r, { status: 'NONE', reason: 'NONE', ticker: 'FROG' }, 'exact NONE');
      assert.strictEqual(setOps(store).length, 0, 'NONE writes nothing');
    });
  });

  await test('FS11 determinism: two fresh WRITE runs produce byte-identical bodies', async function () {
    await withEnv(armedEnv(), async function () {
      const bodies = [];
      for (let i = 0; i < 2; i++) {
        provider._clearCaches();
        const store = makeStore();
        const fetchSpy = makeFetch(usgaapMinimal());
        const r = await core.handler(makeEvent({
          auth: AUTH, body: '{"ticker":"FROG"}', store: store, fetchImpl: fetchSpy.fn
        }));
        bodies.push(r.body);
      }
      assert.strictEqual(bodies[0], bodies[1], 'deterministic response');
    });
  });

  // ── FS15 onlyIfNew conflicts (D-A) + no self-heal (D-D) ─────────────────────
  await test('FS15 facts modified:false (pre-existing facts) -> STORE_CONFLICT, no pointer write', async function () {
    await withEnv(armedEnv(), async function () {
      const seed = {};
      seed[FACTS_KEY] = '{"old":"record"}'; // orphan/foreign facts, pointer absent
      const store = makeStore({ seed: seed });
      const r = await core.handler(makeEvent({
        auth: AUTH, body: '{"ticker":"FROG"}', store: store,
        providerImpl: async function () { return { cik: CIK, record: validRecord() }; }
      }));
      assert.strictEqual(r.statusCode, 200);
      assertExactBody(r, {
        status: 'DEGRADED', reason: 'STORE_CONFLICT', ticker: 'FROG', cik: CIK
      }, 'facts conflict (no writtenKeys)');
      assert.strictEqual(setOps(store).length, 1, 'pointer write never attempted');
      assert.strictEqual(store.data[FACTS_KEY], '{"old":"record"}', 'pre-existing facts NOT overwritten');
      assert.ok(!Object.prototype.hasOwnProperty.call(store.data, POINTER_KEY), 'pointer absent');
    });
  });

  await test('FS15 D-D retry after facts conflict -> identical STORE_CONFLICT (no self-heal)', async function () {
    await withEnv(armedEnv(), async function () {
      const seed = {};
      seed[FACTS_KEY] = '{"old":"record"}';
      const store = makeStore({ seed: seed });
      const impl = async function () { return { cik: CIK, record: validRecord() }; };
      const r1 = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, providerImpl: impl }));
      const r2 = await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, providerImpl: impl }));
      assert.strictEqual(r1.body, r2.body, 'retry cannot overwrite: same conflict');
      assert.strictEqual(store.data[FACTS_KEY], '{"old":"record"}', 'orphan requires teardown, not overwrite');
    });
  });

  await test('FS15 pointer modified:false after facts created -> STORE_CONFLICT with [facts], never WRITE', async function () {
    await withEnv(armedEnv(), async function () {
      const setResults = {};
      setResults[POINTER_KEY] = { modified: false }; // pointer race
      const store = makeStore({ setResults: setResults });
      const r = await core.handler(makeEvent({
        auth: AUTH, body: '{"ticker":"FROG"}', store: store,
        providerImpl: async function () { return { cik: CIK, record: validRecord() }; }
      }));
      assert.strictEqual(r.statusCode, 200);
      assertExactBody(r, {
        status: 'DEGRADED', reason: 'STORE_CONFLICT',
        ticker: 'FROG', cik: CIK, writtenKeys: [FACTS_KEY]
      }, 'pointer race conflict');
      assert.notStrictEqual(parsedBody(r).status, 'WRITE');
      assert.ok(Object.prototype.hasOwnProperty.call(store.data, FACTS_KEY), 'created facts present (quarantined)');
    });
  });

  // ── FS17 teardown-safety derivable from exact response shape ────────────────
  await test('FS17 teardown-safety classification from status + reason + writtenKeys', async function () {
    await withEnv(armedEnv(), async function () {
      const impl = async function () { return { cik: CIK, record: validRecord() }; };
      const shapes = {};

      let store = makeStore();
      shapes.write = parsedBody(await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, providerImpl: impl })));

      store = makeStore({ getPlan: (function () { const p = {}; p[POINTER_KEY] = [{ throws: true }]; return p; })() });
      shapes.bare = parsedBody(await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, providerImpl: impl })));

      store = makeStore({ seed: (function () { const s = {}; s[FACTS_KEY] = '{"old":"r"}'; return s; })() });
      shapes.factsConflict = parsedBody(await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, providerImpl: impl })));

      store = makeStore({ setResults: (function () { const p = {}; p[POINTER_KEY] = { modified: false }; return p; })() });
      shapes.pointerConflict = parsedBody(await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, providerImpl: impl })));

      store = makeStore({ setThrows: (function () { const p = {}; p[POINTER_KEY] = true; return p; })() });
      shapes.orphan = parsedBody(await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, providerImpl: impl })));

      const gp = {}; gp[POINTER_KEY] = [{ value: null }, { value: '{"cik":"' + CIK + '"}' }];
      const st = {}; st[POINTER_KEY] = true;
      store = makeStore({ getPlan: gp, setThrows: st });
      shapes.uncertain = parsedBody(await core.handler(makeEvent({ auth: AUTH, body: '{"ticker":"FROG"}', store: store, providerImpl: impl })));

      // The pinned classifier: auto-delete-safe keys from the response shape only.
      function autoSafeKeys(b) {
        if (b.status === 'WRITE' && Array.isArray(b.writtenKeys)) { return b.writtenKeys; }
        if (b.status === 'DEGRADED' && b.reason === 'STORE_UNAVAILABLE' &&
            Array.isArray(b.writtenKeys) && b.writtenKeys.length === 1) { return b.writtenKeys; }
        return [];
      }
      assert.deepStrictEqual(autoSafeKeys(shapes.write), [FACTS_KEY, POINTER_KEY], 'WRITE: both teardown-safe');
      assert.deepStrictEqual(autoSafeKeys(shapes.orphan), [FACTS_KEY], 'confirmed orphan: facts teardown-safe');
      assert.deepStrictEqual(autoSafeKeys(shapes.bare), [], 'bare STORE_UNAVAILABLE: none');
      assert.deepStrictEqual(autoSafeKeys(shapes.factsConflict), [], 'facts conflict: none');
      assert.deepStrictEqual(autoSafeKeys(shapes.pointerConflict), [], 'pointer conflict: quarantined');
      assert.deepStrictEqual(autoSafeKeys(shapes.uncertain), [], 'uncertain: quarantined');
      // quarantined shapes still carry provenance
      assert.deepStrictEqual(shapes.pointerConflict.writtenKeys, [FACTS_KEY], 'conflict provenance kept');
      assert.deepStrictEqual(shapes.uncertain.writtenKeys, [FACTS_KEY], 'uncertain provenance kept');
      // all six shapes are pairwise distinguishable
      const tuples = Object.keys(shapes).map(function (k) {
        const b = shapes[k];
        return b.status + '|' + (b.reason || '') + '|' + (Array.isArray(b.writtenKeys) ? b.writtenKeys.length : 'none');
      });
      assert.strictEqual(new Set(tuples).size, tuples.length, 'shapes pairwise distinct: ' + tuples.join(' ; '));
    });
  });

  // ── INV invariants ──────────────────────────────────────────────────────────
  await test('INV event-only seams: body-supplied seam keys are ignored', async function () {
    await withEnv(armedEnv(), async function () {
      const store = makeStore();
      const body = JSON.stringify({
        ticker: 'FROG',
        _testStore: { evil: true },
        _testProviderOptions: { providerImpl: 'evil', fetchImpl: 'evil' }
      });
      const r = await core.handler(makeEvent({
        auth: AUTH, body: body, store: store,
        providerImpl: async function () { return { cik: CIK, record: validRecord() }; }
      }));
      assertExactBody(r, {
        status: 'WRITE', ticker: 'FROG', cik: CIK, writtenKeys: [FACTS_KEY, POINTER_KEY]
      }, 'body seams ignored; event seams used');
    });
  });

  await test('INV determinism + input immutability (event, env)', async function () {
    await withEnv(armedEnv(), async function () {
      const store = makeStore();
      const ev = makeEvent({
        auth: AUTH, body: '{"ticker":"FROG"}', store: store,
        providerImpl: async function () { return { cik: CIK, record: validRecord() }; }
      });
      const evSnap = JSON.stringify({ httpMethod: ev.httpMethod, headers: ev.headers, body: ev.body });
      const envSnap = JSON.stringify(ENV_KEYS.map(function (k) { return process.env[k]; }));
      await core.handler(ev);
      assert.strictEqual(
        JSON.stringify({ httpMethod: ev.httpMethod, headers: ev.headers, body: ev.body }),
        evSnap, 'event unmutated');
      assert.strictEqual(JSON.stringify(ENV_KEYS.map(function (k) { return process.env[k]; })), envSnap, 'env unmutated');
    });
  });

  await test('INV import-inert: requiring the core performs no I/O and exports the contract surface', async function () {
    const script =
      'global.fetch = function () { throw new Error("LIVE"); };' +
      'const m = require(' + JSON.stringify(CORE_SRC) + ');' +
      'if (typeof m.handler !== "function") { process.exit(2); }' +
      'if (typeof m.validateProviderResult !== "function") { process.exit(3); }' +
      'process.exit(0);';
    const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, 'clean require: ' + ((r.stderr || '') + (r.stdout || '')).trim());
  });

  await test('INV forbidden-surface scan of the TARGET module (comment-stripped)', async function () {
    // FP40 idiom: strip comments so doc-text can never mask or fake a token.
    // The core contains no string literal with '//', so the strip is safe.
    const raw = fs.readFileSync(CORE_SRC, 'utf8');
    const s = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/([^:'"])\/\/[^\n]*/g, '$1');
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
      [/(^|[^.\w])fetch\s*\(/, 'bare fetch( call']
    ];
    forbidden.forEach(function (pair) {
      assert.ok(!pair[0].test(s), 'must NOT contain ' + pair[1]);
    });
    // structural requirements
    assert.ok(/process\.env\.PT_ENABLE_FUND_FACTS_SERVER\s*!==\s*'true'/.test(s), 'strict server gate check');
    assert.ok(/require\('\.\/fund-facts-preflight'\)/.test(s), 'composes the C1-S2 preflight');
    assert.ok(/require\('\.\/fund-facts-provider'\)/.test(s), 'composes the C1-S1 provider');
    const blobsMatches = s.match(/@netlify\/blobs/g) || [];
    assert.strictEqual(blobsMatches.length, 1, 'blobs referenced exactly once');
    assert.ok(s.indexOf('@netlify/blobs') > s.indexOf('function acquireStore'),
      'blobs require is lazy inside acquireStore');
    const onlyIfNewMatches = s.match(/onlyIfNew:\s*true/g) || [];
    assert.strictEqual(onlyIfNewMatches.length, 2, 'exactly two create-only writes');
    const newDateMatches = s.match(/new Date\(/g) || [];
    assert.strictEqual(newDateMatches.length, 1, 'exactly one boundary clock read');
    assert.ok(/consistency:\s*'strong'/.test(s), 'strong-consistency reads');
    // the body is only ever consulted for its ticker field
    const bodyDerefs = s.match(/parsed\.value\.\w+/g) || [];
    assert.ok(bodyDerefs.length > 0 && bodyDerefs.every(function (d) { return d === 'parsed.value.ticker'; }),
      'parsed body is read only for .ticker');
  });

  global.fetch = _origFetch;

  const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
  if (failed > 0) { process.exit(1); }
}

runTests().catch(function (err) {
  process.stderr.write('FATAL: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
