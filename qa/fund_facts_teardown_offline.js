'use strict';

/*
 * qa/fund_facts_teardown_offline.js
 *
 * C1-S6 LAB CANDIDATE (v2) — fund-facts teardown offline harness.
 *
 * Exercises netlify/functions/lib/fund-facts-teardown.js with ZERO real network /
 * Blob / Netlify env / production contact. Stores are in-memory spies injected
 * into the executor; a throwing globalThis.fetch guard makes any real network a
 * hard error; no @netlify/blobs handle is ever constructed.
 *
 * FT04/FT05 additionally drive the REAL C1-S3 core (fund-facts-core.js) through
 * an injected store to confirm the response contract behaviorally.
 *
 * Suites:
 *   FT01-FT33 — the original battery, revised for the v2 contract
 *   M01-M22   — the v2 additions (duplicate classes, count validation,
 *               verification objects, guarded single acquisition, receiver
 *               preservation, acquisition counts, no-short-circuit)
 *
 * The module exposes exactly three functions; every vocabulary and helper is
 * private, so this suite asserts against INDEPENDENT literals and never uses the
 * module's own constants as its oracle.
 *
 * Run: node qa/fund_facts_teardown_offline.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LIB_PATH = path.join(ROOT, 'netlify', 'functions', 'lib', 'fund-facts-teardown.js');
const CORE_PATH = path.join(ROOT, 'netlify', 'functions', 'lib', 'fund-facts-core.js');

const LIB = require(LIB_PATH);
const core = require(CORE_PATH);

const {
  classifyFundFactsResponse,
  planFundFactsTeardown,
  executeFundFactsTeardown
} = LIB;

// ── fixtures ─────────────────────────────────────────────────────────────────
const CIK = '0001800667';
const FACTS_KEY = 'fundstore:v1:facts:' + CIK;
const POINTER_KEY = 'fundstore:v1:cik:FROG';
const FACTS_KEY_2 = 'fundstore:v1:facts:0000000001';
const POINTER_KEY_2 = 'fundstore:v1:cik:AAPL';

// U+00A0 built via fromCodePoint (house rule: never glyphs, never \u escapes).
const NBSP = String.fromCodePoint(0x00A0);

const NOW_ISO = '2026-07-15T00:00:00.000Z';
const RUN_ID = 1700000000000;
const TOKEN = 'tok-fund-facts-qa-1';
const AUTH = 'Bearer ' + TOKEN;

// Independent expected literals — deliberately NOT imported from the module.
const EXPECTED_EXPORTS = ['classifyFundFactsResponse', 'executeFundFactsTeardown', 'planFundFactsTeardown'];
const VERIFICATION_FIELDS = ['absentKeys', 'checkedKeys', 'inconclusiveKeys', 'outcome', 'presentKeys'];

function bodyWrite() {
  return { status: 'WRITE', ticker: 'FROG', cik: CIK, writtenKeys: [FACTS_KEY, POINTER_KEY] };
}
function bodyOrphan() {
  return {
    status: 'DEGRADED', reason: 'STORE_UNAVAILABLE',
    ticker: 'FROG', cik: CIK, writtenKeys: [FACTS_KEY]
  };
}
function bodyPointerConflict() {
  return {
    status: 'DEGRADED', reason: 'STORE_CONFLICT',
    ticker: 'FROG', cik: CIK, writtenKeys: [FACTS_KEY]
  };
}
function bodyUncertain() {
  return {
    status: 'DEGRADED', reason: 'STORE_WRITE_UNCERTAIN',
    ticker: 'FROG', cik: CIK, writtenKeys: [FACTS_KEY]
  };
}
function bodyBareUnavailable() {
  return { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE' };
}
function bodyFactsConflict() {
  return { status: 'DEGRADED', reason: 'STORE_CONFLICT', ticker: 'FROG', cik: CIK };
}

// ── store spy: counts property ACCESS separately from invocation ─────────────
// Property access is what the acquisition contract constrains, and a plain
// object property cannot report a read — hence accessor properties here.
//
// opts.seed             : keys to pre-populate
// opts.throwOn          : keys whose delete invocation throws
// opts.throwName        : err.name applied to that thrown error
// opts.noop             : delete succeeds but does not remove
// opts.getThrowOn       : keys whose get invocation throws
// opts.getPresent       : keys that read back present regardless of deletion
// opts.deleteGetterThrows / getGetterThrows : the PROPERTY read throws
// opts.deleteNotCallable / getNotCallable   : the property yields a non-function
// opts.noGet            : the get property yields undefined
function makeSpyStore(opts) {
  opts = opts || {};
  const map = new Map();
  const access = { delete: 0, get: 0 };
  const invoke = { delete: 0, get: 0 };
  const deleteOrder = [];
  const getOrder = [];
  const getOpts = [];
  if (opts.seed) { opts.seed.forEach(function (k) { map.set(k, '{"seeded":true}'); }); }

  const deleteImpl = async function (key) {
    invoke.delete += 1;
    deleteOrder.push(key);
    if (opts.throwOn && opts.throwOn.indexOf(key) !== -1) {
      const e = new Error('delete failed');
      if (opts.throwName) { e.name = opts.throwName; }
      throw e;
    }
    if (!opts.noop) { map.delete(key); }
    return undefined;
  };

  const getImpl = async function (key, o) {
    invoke.get += 1;
    getOrder.push(key);
    getOpts.push(o);
    if (opts.getThrowOn && opts.getThrowOn.indexOf(key) !== -1) { throw new Error('get failed'); }
    if (opts.getPresent && opts.getPresent.indexOf(key) !== -1) { return '{"still":"here"}'; }
    return map.has(key) ? map.get(key) : null;
  };

  const store = {
    _map: map,
    _access: access,
    _invoke: invoke,
    _deleteOrder: deleteOrder,
    _getOrder: getOrder,
    _getOpts: getOpts
  };

  Object.defineProperty(store, 'delete', {
    enumerable: true,
    configurable: true,
    get: function () {
      access.delete += 1;
      if (opts.deleteGetterThrows) { throw new Error('hostile delete getter'); }
      if (opts.deleteNotCallable) { return 42; }
      return deleteImpl;
    }
  });

  Object.defineProperty(store, 'get', {
    enumerable: true,
    configurable: true,
    get: function () {
      access.get += 1;
      if (opts.getGetterThrows) { throw new Error('hostile get getter'); }
      if (opts.getNotCallable) { return 'not-a-function'; }
      if (opts.noGet) { return undefined; }
      return getImpl;
    }
  });

  return store;
}

// A store whose methods genuinely need their receiver. Invoking a detached copy
// throws TypeError, so this detects any loss of `this`.
function makeThisDependentStore(seed) {
  class ThisDependentStore {
    constructor(keys) {
      this._map = new Map();
      this._deleted = [];
      this._getOpts = [];
      (keys || []).forEach(function (k) { this._map.set(k, '{"seeded":true}'); }, this);
    }
    async delete(key) {
      this._deleted.push(key);
      this._map.delete(key);
      return undefined;
    }
    async get(key, o) {
      this._getOpts.push(o);
      return this._map.has(key) ? this._map.get(key) : null;
    }
  }
  return new ThisDependentStore(seed);
}

// A store that records every property read and refuses to answer any of them.
function makeHostileProxyStore(state) {
  return new Proxy({}, {
    get: function (_t, prop) {
      state.reads.push(String(prop));
      throw new Error('hostile store trap');
    }
  });
}

// ── real-core driving helpers (mirrors qa/fund_facts_core_offline.js) ────────
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

function armedEnv() {
  return {
    PT_ENABLE_FUND_FACTS_SERVER: 'true',
    PT_FUND_FACTS_TOKEN: TOKEN,
    PT_FUND_FACTS_ALLOWED_TICKERS: 'FROG,AAPL',
    SEC_USER_AGENT: 'PulseC1S6Lab/1.0 qa@example.com'
  };
}

function validRecord() {
  return {
    ticker: 'FROG', cik: CIK, fetchedAt: NOW_ISO,
    sourceTier: 'sec_xbrl_primary', contractVersion: 'fund-contract-v1',
    provider: 'j1-sec-facts@job-model-v1', runId: RUN_ID,
    series: {}, derived: {}, filings: [], gaps: [], secRequests: [],
    confidence: null, verificationStatus: 'verified'
  };
}

function makeEvent(o) {
  o = o || {};
  const ev = {
    httpMethod: 'POST',
    headers: { authorization: o.auth },
    body: o.body
  };
  if (o.store) { ev._testStore = o.store; }
  ev._testProviderOptions = { nowIso: NOW_ISO, providerImpl: o.providerImpl };
  return ev;
}

function makeCoreStore(opts) {
  opts = opts || {};
  const data = Object.assign({}, opts.seed || {});
  const log = [];
  return {
    data: data,
    log: log,
    get: async function (key, o) {
      log.push({ op: 'get', key: key, opts: o });
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

function parsedBody(r) { return JSON.parse(r.body); }

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

// Assert the full five-field verification object against independent literals.
function assertVerification(v, expected, label) {
  assert.ok(v && typeof v === 'object', label + ': verification object present');
  assert.deepStrictEqual(Object.keys(v).sort(), VERIFICATION_FIELDS, label + ': exactly five fields');
  assert.strictEqual(v.outcome, expected.outcome, label + ': outcome');
  assert.deepStrictEqual(v.checkedKeys, expected.checkedKeys || [], label + ': checkedKeys');
  assert.deepStrictEqual(v.absentKeys, expected.absentKeys || [], label + ': absentKeys');
  assert.deepStrictEqual(v.presentKeys, expected.presentKeys || [], label + ': presentKeys');
  assert.deepStrictEqual(v.inconclusiveKeys, expected.inconclusiveKeys || [], label + ': inconclusiveKeys');
}

function hasOwnField(value, field) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function assertNoCoreReason(value, label) {
  assert.strictEqual(hasOwnField(value, 'coreReason'), false, label + ': coreReason absent');
}

function assertCoreReason(value, expected, label) {
  assert.strictEqual(hasOwnField(value, 'coreReason'), true, label + ': coreReason present');
  assert.strictEqual(value.coreReason, expected, label + ': coreReason value');
}

const DISABLED = { outcome: 'DISABLED' };

// Classify -> plan -> execute for real, returning the store so residue is visible.
async function runFull(body, opts, storeOpts) {
  const store = makeSpyStore(storeOpts || { seed: [FACTS_KEY, POINTER_KEY] });
  const plan = planFundFactsTeardown(body);
  const result = await executeFundFactsTeardown(store, plan, opts);
  return { store: store, plan: plan, result: result };
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

  // Throwing network guard for the WHOLE suite.
  const _origFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = function () { fetchCalls += 1; throw new Error('LIVE_NETWORK_FORBIDDEN'); };

  try {
    // ═══ FT01-FT33 ═══════════════════════════════════════════════════════════

    // ── FT01 (revised): evidence fields, not executable fields ───────────────
    await test('FT01 A-E matrix: classification, ok, evidenceKeys and count', function () {
      const a = classifyFundFactsResponse(bodyWrite());
      assert.strictEqual(a.classification, 'SAFE_PAIR');
      assert.strictEqual(a.ok, true);
      assert.deepStrictEqual(a.evidenceKeys, [FACTS_KEY, POINTER_KEY], 'row A evidence is core write order');
      assert.strictEqual(a.count, 2);
      assertNoCoreReason(a, 'SAFE_PAIR classifier');

      const b = classifyFundFactsResponse(bodyOrphan());
      assert.strictEqual(b.classification, 'CONFIRMED_ORPHAN');
      assert.strictEqual(b.ok, true);
      assert.deepStrictEqual(b.evidenceKeys, [FACTS_KEY]);
      assert.strictEqual(b.count, 1);
      assertNoCoreReason(b, 'CONFIRMED_ORPHAN classifier');

      const c = classifyFundFactsResponse(bodyPointerConflict());
      assert.strictEqual(c.classification, 'QUARANTINED');
      assert.strictEqual(c.ok, false);
      assert.deepStrictEqual(c.evidenceKeys, [FACTS_KEY], 'row C keeps evidence');
      assert.strictEqual(c.count, 1);
      assert.strictEqual(c.reason, null);
      assertCoreReason(c, 'STORE_CONFLICT', 'STORE_CONFLICT classifier');

      const d = classifyFundFactsResponse(bodyUncertain());
      assert.strictEqual(d.classification, 'QUARANTINED');
      assert.strictEqual(d.ok, false);
      assert.deepStrictEqual(d.evidenceKeys, [FACTS_KEY]);
      assert.strictEqual(d.count, 1);
      assert.strictEqual(d.reason, null);
      assertCoreReason(d, 'STORE_WRITE_UNCERTAIN', 'STORE_WRITE_UNCERTAIN classifier');

      [bodyBareUnavailable(), bodyFactsConflict(),
        { status: 'SKIPPED', reason: 'ALREADY_SEEDED', ticker: 'FROG' },
        { status: 'NONE', reason: 'NONE', ticker: 'FROG' }].forEach(function (e) {
        const r = classifyFundFactsResponse(e);
        assert.strictEqual(r.classification, 'NOOP', 'row E -> NOOP');
        assert.strictEqual(r.ok, true);
        assert.deepStrictEqual(r.evidenceKeys, []);
        assert.strictEqual(r.count, 0);
        assertNoCoreReason(r, 'NOOP classifier');
      });

      const malformed = classifyFundFactsResponse({ status: 'WAT', writtenKeys: [FACTS_KEY] });
      assert.strictEqual(malformed.classification, 'NOT_CLASSIFIABLE');
      assertNoCoreReason(malformed, 'NOT_CLASSIFIABLE classifier');

      // The classifier never exposes an executable surface.
      [a, b, c, d].forEach(function (r) {
        assert.ok(!('keys' in r), 'classifier must not expose keys');
        assert.ok(!('deleteOrder' in r), 'classifier must not expose deleteOrder');
        assert.strictEqual(r.count, r.evidenceKeys.length, 'count always equals evidenceKeys.length');
      });
    });

    // ── FT02 (preserved) ─────────────────────────────────────────────────────
    await test('FT02 bare STORE_UNAVAILABLE is NOOP; reconciled is CONFIRMED_ORPHAN', function () {
      const bare = classifyFundFactsResponse(bodyBareUnavailable());
      const reconciled = classifyFundFactsResponse(bodyOrphan());
      assert.strictEqual(bare.classification, 'NOOP');
      assert.deepStrictEqual(bare.evidenceKeys, [], 'bare form proves nothing was written');
      assert.strictEqual(reconciled.classification, 'CONFIRMED_ORPHAN');
      assert.deepStrictEqual(reconciled.evidenceKeys, [FACTS_KEY]);
      assert.notStrictEqual(bare.classification, reconciled.classification,
        'the two STORE_UNAVAILABLE forms must not collapse together');
    });

    // ── FT03 (revised): explicit classification, no delete order ─────────────
    await test('FT03 facts-level STORE_CONFLICT is NOOP; pointer-level is QUARANTINED', function () {
      const factsLevel = classifyFundFactsResponse(bodyFactsConflict());
      assert.strictEqual(factsLevel.classification, 'NOOP', 'no writtenKeys -> nothing was created here');
      assert.strictEqual(factsLevel.ok, true);
      assert.deepStrictEqual(factsLevel.evidenceKeys, []);
      assert.strictEqual(factsLevel.count, 0);

      const pointerLevel = classifyFundFactsResponse(bodyPointerConflict());
      assert.strictEqual(pointerLevel.classification, 'QUARANTINED');
      assert.strictEqual(pointerLevel.ok, false);
      assert.deepStrictEqual(pointerLevel.evidenceKeys, [FACTS_KEY]);
      assert.strictEqual(pointerLevel.count, 1);
      assert.strictEqual(pointerLevel.reason, null, 'quarantine reason is null');
      assertCoreReason(pointerLevel, 'STORE_CONFLICT', 'store reason lives in coreReason');

      // The plan derived from a quarantined response carries nothing executable.
      const plan = planFundFactsTeardown(bodyPointerConflict());
      assert.strictEqual(plan.ok, false);
      assert.deepStrictEqual(plan.keys, []);
      assert.strictEqual(plan.count, 0);
      assert.strictEqual(plan.reason, null);
      assertCoreReason(plan, 'STORE_CONFLICT', 'QUARANTINED planner');
    });

    // ── FT04 (preserved): real core (L-3) ────────────────────────────────────
    await test('FT04 real C1-S3 WRITE emits writtenKeys exactly [facts, pointer]', async function () {
      await withEnv(armedEnv(), async function () {
        const store = makeCoreStore();
        const r = await core.handler(makeEvent({
          auth: AUTH, body: '{"ticker":"FROG"}', store: store,
          providerImpl: async function () { return { cik: CIK, record: validRecord() }; }
        }));
        const body = parsedBody(r);
        assert.strictEqual(body.status, 'WRITE');
        assert.deepStrictEqual(body.writtenKeys, [FACTS_KEY, POINTER_KEY],
          'array order: facts first, pointer last');

        const sets = store.log.filter(function (e) { return e.op === 'set'; });
        assert.strictEqual(sets.length, 2, 'exactly two writes');
        assert.strictEqual(sets[0].key, FACTS_KEY, 'facts record written first');
        assert.strictEqual(sets[1].key, POINTER_KEY, 'pointer written last');

        const c = classifyFundFactsResponse(body);
        assert.strictEqual(c.classification, 'SAFE_PAIR');
        assert.deepStrictEqual(c.evidenceKeys, [FACTS_KEY, POINTER_KEY]);
        const plan = planFundFactsTeardown(body);
        assert.deepStrictEqual(plan.keys, [POINTER_KEY, FACTS_KEY],
          'planner reverses write order for deletion');
      });
    });

    // ── FT05 (preserved): equivalence to the pinned autoSafeKeys ─────────────
    // Five shapes are produced by the REAL core. The sixth (uncertain) is a
    // shape-faithful synthetic fixture: reproducing it through the core needs a
    // get-cursor to drive the D-E reconciliation-read-present path, which this
    // harness's store fake does not model. Only five are core-driven.
    await test('FT05 safe-key set matches the pinned autoSafeKeys (5 core-driven + 1 synthetic)', async function () {
      await withEnv(armedEnv(), async function () {
        const impl = async function () { return { cik: CIK, record: validRecord() }; };
        const shapes = {};

        let store = makeCoreStore();
        shapes.write = parsedBody(await core.handler(makeEvent({
          auth: AUTH, body: '{"ticker":"FROG"}', store: store, providerImpl: impl })));

        store = makeCoreStore({ setThrows: (function () { const s = {}; s[FACTS_KEY] = true; return s; })() });
        shapes.bare = parsedBody(await core.handler(makeEvent({
          auth: AUTH, body: '{"ticker":"FROG"}', store: store, providerImpl: impl })));

        store = makeCoreStore({ seed: (function () { const s = {}; s[FACTS_KEY] = '{"old":"r"}'; return s; })() });
        shapes.factsConflict = parsedBody(await core.handler(makeEvent({
          auth: AUTH, body: '{"ticker":"FROG"}', store: store, providerImpl: impl })));

        store = makeCoreStore({ setResults: (function () { const p = {}; p[POINTER_KEY] = { modified: false }; return p; })() });
        shapes.pointerConflict = parsedBody(await core.handler(makeEvent({
          auth: AUTH, body: '{"ticker":"FROG"}', store: store, providerImpl: impl })));

        store = makeCoreStore({ setThrows: (function () { const p = {}; p[POINTER_KEY] = true; return p; })() });
        shapes.orphan = parsedBody(await core.handler(makeEvent({
          auth: AUTH, body: '{"ticker":"FROG"}', store: store, providerImpl: impl })));

        // The pinned classifier, copied verbatim from qa/fund_facts_core_offline.js:732.
        function autoSafeKeys(b) {
          if (b.status === 'WRITE' && Array.isArray(b.writtenKeys)) { return b.writtenKeys; }
          if (b.status === 'DEGRADED' && b.reason === 'STORE_UNAVAILABLE' &&
              Array.isArray(b.writtenKeys) && b.writtenKeys.length === 1) { return b.writtenKeys; }
          return [];
        }

        Object.keys(shapes).forEach(function (k) {
          const expected = autoSafeKeys(shapes[k]).slice().sort();
          // Compare the SET, not the order: the planner deletes pointer-first
          // while autoSafeKeys reports the core's write order.
          const actual = planFundFactsTeardown(shapes[k]).keys.slice().sort();
          assert.deepStrictEqual(actual, expected, 'safe-key set parity for shape: ' + k);
        });

        const uncertain = bodyUncertain();
        assert.deepStrictEqual(autoSafeKeys(uncertain), []);
        assert.deepStrictEqual(planFundFactsTeardown(uncertain).keys, []);
      });
    });

    // ── FT06 (preserved) ─────────────────────────────────────────────────────
    await test('FT06 every core status classifies; unknown/absent status fails closed', function () {
      const keyless = [
        { status: 'SKIPPED', reason: 'ALREADY_SEEDED', ticker: 'FROG' },
        { status: 'NONE', reason: 'NONE', ticker: 'FROG' },
        { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE' },
        { status: 'DISABLED', reason: 'SERVER_DISABLED' },
        { status: 'METHOD_NOT_ALLOWED', reason: 'METHOD_NOT_ALLOWED' },
        { status: 'UNAUTHORIZED', reason: 'UNAUTHORIZED' },
        { status: 'CONFIGURATION_MISSING', reason: 'TOKEN_COLLISION' },
        { status: 'INVALID_JSON', reason: 'INVALID_JSON' },
        { status: 'INVALID_TICKER', reason: 'TICKER_INVALID' },
        { status: 'TICKER_NOT_ALLOWED', reason: 'TICKER_NOT_ALLOWED' },
        { status: 'ERROR', reason: 'PROVIDER_FAILURE' },
        { status: 'ERROR', reason: 'PREFLIGHT_UNMAPPED' }
      ];
      keyless.forEach(function (b) {
        const r = classifyFundFactsResponse(b);
        assert.strictEqual(r.classification, 'NOOP', 'keyless status -> NOOP: ' + b.status);
        assert.strictEqual(r.ok, true);
        assert.deepStrictEqual(r.evidenceKeys, [], 'no evidence for: ' + b.status);
        assertNoCoreReason(r, 'NOOP status classifier ' + b.status);
      });

      const bad = [
        { status: 'WAT', writtenKeys: [FACTS_KEY] },
        { reason: 'STORE_UNAVAILABLE', writtenKeys: [FACTS_KEY] },
        { status: '', writtenKeys: [FACTS_KEY] },
        { status: ' WRITE', writtenKeys: [FACTS_KEY] },
        { status: 'WRITE' + NBSP, writtenKeys: [FACTS_KEY] },
        { status: 42, writtenKeys: [FACTS_KEY] },
        { status: null }
      ];
      bad.forEach(function (b, i) {
        const r = classifyFundFactsResponse(b);
        assert.strictEqual(r.classification, 'NOT_CLASSIFIABLE', 'bad status ' + i);
        assert.strictEqual(r.ok, false);
        assert.deepStrictEqual(r.evidenceKeys, []);
        assertNoCoreReason(r, 'NOT_CLASSIFIABLE status classifier ' + i);
      });
    });

    // ── FT07 (preserved) ─────────────────────────────────────────────────────
    await test('FT07 adversarial arity never coerces into row A or B', function () {
      const cases = [
        [{ status: 'WRITE', writtenKeys: [FACTS_KEY] }, 'WRITE_KEYS_UNEXPECTED'],
        [{ status: 'WRITE', writtenKeys: [POINTER_KEY, FACTS_KEY] }, 'WRITE_KEY_ORDER_UNEXPECTED'],
        [{ status: 'WRITE', writtenKeys: [POINTER_KEY] }, 'WRITE_KEYS_UNEXPECTED'],
        [{ status: 'WRITE', reason: 'STORE_CONFLICT', writtenKeys: [FACTS_KEY, POINTER_KEY] }, 'REASON_UNEXPECTED'],
        [{ status: 'DEGRADED', reason: 'STORE_CONFLICT', writtenKeys: [FACTS_KEY, POINTER_KEY] }, 'DEGRADED_KEYS_UNEXPECTED'],
        [{ status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', writtenKeys: [FACTS_KEY, POINTER_KEY] }, 'DEGRADED_KEYS_UNEXPECTED'],
        [{ status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', writtenKeys: [POINTER_KEY] }, 'DEGRADED_KEYS_UNEXPECTED'],
        [{ status: 'DEGRADED', reason: 'NOPE', writtenKeys: [FACTS_KEY] }, 'DEGRADED_REASON_UNEXPECTED'],
        [{ status: 'SKIPPED', writtenKeys: [FACTS_KEY] }, 'KEYS_UNEXPECTED_FOR_STATUS']
      ];
      cases.forEach(function (pair) {
        const r = classifyFundFactsResponse(pair[0]);
        assert.strictEqual(r.classification, 'NOT_CLASSIFIABLE', 'must not classify: ' + pair[1]);
        assert.strictEqual(r.reason, pair[1], 'exact reason for ' + pair[1]);
        assert.deepStrictEqual(r.evidenceKeys, []);
      });
    });

    // ── FT08 (preserved) ─────────────────────────────────────────────────────
    await test('FT08 key grammar is exact: padding, U+00A0, case, namespace all rejected', function () {
      const badKeys = [
        ' ' + FACTS_KEY, FACTS_KEY + ' ', NBSP + FACTS_KEY, FACTS_KEY + NBSP,
        FACTS_KEY.toUpperCase(), 'fundstore:v1:facts:123', 'fundstore:v1:facts:00018006670',
        'fundstore:v1:facts:', 'fundstore:v1:cik:', 'fundstore:v1:', 'fundstore:v2:facts:' + CIK,
        'secstore:v1:company:' + CIK, 'fundstore:v1:cik:frog', 'fundstore:v1:cik:TOOLONGTICKER',
        'fundstore:v1:facts:' + CIK + 'x', 42, null, undefined, {}, []
      ];
      badKeys.forEach(function (k) {
        const r = classifyFundFactsResponse({
          status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', writtenKeys: [k]
        });
        assert.strictEqual(r.classification, 'NOT_CLASSIFIABLE', 'must reject key: ' + String(k));
        assert.deepStrictEqual(r.evidenceKeys, [], 'no evidence for: ' + String(k));
      });
      assert.strictEqual(classifyFundFactsResponse(bodyOrphan()).classification, 'CONFIRMED_ORPHAN');
    });

    // ── FT09 (revised): duplicate class split ────────────────────────────────
    await test('FT09 exact duplicates and same-class pairs report distinct reasons', function () {
      const cases = [
        [[FACTS_KEY, FACTS_KEY], 'DUPLICATE_KEY'],
        [[POINTER_KEY, POINTER_KEY], 'DUPLICATE_KEY'],
        [[FACTS_KEY, FACTS_KEY_2], 'KEY_CLASS_DUPLICATE'],
        [[POINTER_KEY, POINTER_KEY_2], 'KEY_CLASS_DUPLICATE'],
        [[FACTS_KEY, POINTER_KEY, FACTS_KEY], 'TOO_MANY_KEYS']
      ];
      cases.forEach(function (pair) {
        const r = classifyFundFactsResponse({ status: 'WRITE', writtenKeys: pair[0] });
        assert.strictEqual(r.classification, 'NOT_CLASSIFIABLE');
        assert.strictEqual(r.reason, pair[1], 'exact reason for ' + pair[1]);
      });

      [null, 'x', 42, {}, { length: 2 }].forEach(function (bad) {
        const r = classifyFundFactsResponse({ status: 'WRITE', writtenKeys: bad });
        assert.strictEqual(r.reason, 'WRITTEN_KEYS_INVALID', 'non-array rejected: ' + String(bad));
      });

      const empty = classifyFundFactsResponse({ status: 'WRITE', writtenKeys: [] });
      assert.strictEqual(empty.classification, 'NOT_CLASSIFIABLE', 'WRITE with zero keys is impossible');
    });

    // ── FT10 (preserved): hostile containers ─────────────────────────────────
    await test('FT10 Proxy, throwing getter, lying length, sparse, inherited all fail closed', function () {
      const hostile = new Proxy([], { get: function () { throw new Error('trap'); } });
      const r1 = classifyFundFactsResponse({ status: 'WRITE', writtenKeys: hostile });
      assert.strictEqual(r1.classification, 'NOT_CLASSIFIABLE', 'throwing proxy fails closed');
      assert.strictEqual(r1.reason, 'CLASSIFIER_ERROR');

      const boobyArray = [];
      Object.defineProperty(boobyArray, '0', {
        enumerable: true, configurable: true,
        get: function () { throw new Error('boom'); }
      });
      boobyArray.length = 1;
      const r2 = classifyFundFactsResponse({ status: 'WRITE', writtenKeys: boobyArray });
      assert.strictEqual(r2.classification, 'NOT_CLASSIFIABLE', 'throwing index getter fails closed');

      const liars = [
        [new Proxy([FACTS_KEY], { get: function (t, p) { return p === 'length' ? 3 : t[p]; } }), 'TOO_MANY_KEYS'],
        [new Proxy([FACTS_KEY], { get: function (t, p) { return p === 'length' ? 1.5 : t[p]; } }), 'WRITTEN_KEYS_INVALID'],
        [new Proxy([FACTS_KEY], { get: function (t, p) { return p === 'length' ? -1 : t[p]; } }), 'WRITTEN_KEYS_INVALID'],
        [new Proxy([FACTS_KEY], { get: function (t, p) { return p === 'length' ? NaN : t[p]; } }), 'WRITTEN_KEYS_INVALID'],
        [new Proxy([FACTS_KEY], { get: function (t, p) { return p === 'length' ? 'two' : t[p]; } }), 'WRITTEN_KEYS_INVALID']
      ];
      liars.forEach(function (pair) {
        const r = classifyFundFactsResponse({ status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', writtenKeys: pair[0] });
        assert.strictEqual(r.classification, 'NOT_CLASSIFIABLE', 'lying length fails closed');
        assert.strictEqual(r.reason, pair[1], 'exact reason for lying length');
        assert.deepStrictEqual(r.evidenceKeys, []);
      });

      const sparse = [];
      sparse.length = 1;
      const r3 = classifyFundFactsResponse({ status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', writtenKeys: sparse });
      assert.strictEqual(r3.reason, 'KEY_MALFORMED', 'sparse hole rejected');

      const polluted = [];
      polluted.length = 1;
      try {
        Array.prototype[0] = FACTS_KEY;
        assert.strictEqual(polluted[0], FACTS_KEY, 'precondition: value is visible via inheritance');
        const r4 = classifyFundFactsResponse({
          status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', writtenKeys: polluted
        });
        assert.strictEqual(r4.reason, 'KEY_MALFORMED', 'inherited index value rejected');
        assert.deepStrictEqual(r4.evidenceKeys, [], 'inherited value never becomes evidence');
      } finally {
        delete Array.prototype[0];
      }
      assert.ok(!(0 in Array.prototype), 'prototype restored');
    });

    // ── FT11 (preserved, new planner call shape) ─────────────────────────────
    await test('FT11 hostile and cyclic inputs never throw and stay stringify-safe', function () {
      const cyc = {}; cyc.self = cyc;
      const cycArr = []; cycArr.push(cycArr);
      const hostileBody = new Proxy({}, { get: function () { throw new Error('trap'); } });
      const boobyBody = {};
      Object.defineProperty(boobyBody, 'status', {
        enumerable: true, get: function () { throw new Error('boom'); }
      });

      const inputs = [
        undefined, null, 42, 'x', [], cyc, cycArr, hostileBody, boobyBody,
        { status: 'WRITE', writtenKeys: cycArr },
        { status: 'DEGRADED', reason: cyc, writtenKeys: [FACTS_KEY] }
      ];
      inputs.forEach(function (input, i) {
        let r;
        assert.doesNotThrow(function () { r = classifyFundFactsResponse(input); }, 'no throw for input ' + i);
        assert.strictEqual(r.ok, false, 'hostile input never classifies ok (input ' + i + ')');
        assert.deepStrictEqual(r.evidenceKeys, [], 'hostile input yields no evidence (input ' + i + ')');
        assertNoCoreReason(r, 'hostile NOT_CLASSIFIABLE classifier ' + i);
        assert.doesNotThrow(function () { JSON.stringify(r); }, 'output stringify-safe (input ' + i + ')');

        let p;
        assert.doesNotThrow(function () { p = planFundFactsTeardown(input); }, 'planner no throw ' + i);
        assert.strictEqual(p.ok, false);
        assert.deepStrictEqual(p.keys, []);
        assertNoCoreReason(p, 'hostile NOT_CLASSIFIABLE planner ' + i);
        assert.doesNotThrow(function () { JSON.stringify(p); }, 'plan stringify-safe ' + i);
      });
    });

    // ── FT12 (revised): planner takes parsedBody; no caller metadata ─────────
    await test('FT12 planner output is deep-frozen and metadata never builds a key', function () {
      const p = planFundFactsTeardown(bodyWrite());
      assert.strictEqual(p.ok, true);
      assert.strictEqual(p.classification, 'SAFE_PAIR');
      assert.deepStrictEqual(p.keys, [POINTER_KEY, FACTS_KEY]);
      assertNoCoreReason(p, 'SAFE_PAIR planner');
      assert.strictEqual(p.count, 2);
      assert.ok(!('evidenceKeys' in p), 'planner must not expose evidenceKeys');
      assert.ok(!('deleteOrder' in p), 'planner must not expose deleteOrder');
      assert.ok(Object.isFrozen(p), 'plan frozen');
      assert.ok(Object.isFrozen(p.keys), 'plan keys frozen');
      assert.ok(Object.isFrozen(p.metadata), 'plan metadata frozen');
      try { p.keys.push('fundstore:v1:cik:EVIL'); } catch (_) { /* strict-mode throw ok */ }
      assert.strictEqual(p.keys.length, 2, 'frozen plan keys are mutation-proof');

      // Metadata comes from the response alone; there is no caller channel.
      assert.strictEqual(planFundFactsTeardown(bodyOrphan()).metadata.ticker, 'FROG');
      assert.strictEqual(planFundFactsTeardown(bodyOrphan()).metadata.cik, CIK);

      // A malformed ticker/cik in the response is nulled, never repaired, and
      // never contributes to the key set.
      const junkMeta = planFundFactsTeardown({
        status: 'DEGRADED', reason: 'STORE_UNAVAILABLE',
        ticker: 'not-a-ticker', cik: '42', writtenKeys: [FACTS_KEY]
      });
      assert.strictEqual(junkMeta.metadata.ticker, null, 'malformed ticker -> null');
      assert.strictEqual(junkMeta.metadata.cik, null, 'malformed cik -> null');
      assert.deepStrictEqual(junkMeta.keys, [FACTS_KEY], 'metadata never widens the key set');
      assertNoCoreReason(junkMeta, 'CONFIRMED_ORPHAN planner');

      const noMeta = planFundFactsTeardown({ status: 'WRITE', writtenKeys: [FACTS_KEY, POINTER_KEY] });
      assert.strictEqual(noMeta.metadata.ticker, null);
      assert.strictEqual(noMeta.metadata.cik, null);
      assert.deepStrictEqual(noMeta.keys, [POINTER_KEY, FACTS_KEY], 'keys derive only from writtenKeys');
      assertNoCoreReason(noMeta, 'SAFE_PAIR planner without metadata');

      // NOOP plans are valid but carry nothing executable. This is the one
      // non-QUARANTINED planner shape with ok:true, so it cannot ride along in
      // the ok:false table below and is asserted here instead.
      [bodyBareUnavailable(), bodyFactsConflict(),
        { status: 'SKIPPED', reason: 'ALREADY_SEEDED', ticker: 'FROG' },
        { status: 'NONE', reason: 'NONE', ticker: 'FROG' }].forEach(function (e) {
        const n = planFundFactsTeardown(e);
        assert.strictEqual(n.ok, true, 'NOOP plan is valid');
        assert.strictEqual(n.classification, 'NOOP');
        assert.deepStrictEqual(n.keys, []);
        assert.strictEqual(n.count, 0);
        assertNoCoreReason(n, 'NOOP planner');
      });

      [
        [bodyPointerConflict(), 'QUARANTINED', 'STORE_CONFLICT'],
        [bodyUncertain(), 'QUARANTINED', 'STORE_WRITE_UNCERTAIN'],
        [{ status: 'WAT' }, 'NOT_CLASSIFIABLE', null]
      ].forEach(function (pair) {
        const q = planFundFactsTeardown(pair[0]);
        assert.strictEqual(q.ok, false);
        assert.strictEqual(q.classification, pair[1]);
        assert.strictEqual(q.count, 0);
        assert.deepStrictEqual(q.keys, []);
        if (pair[1] === 'QUARANTINED') {
          assert.strictEqual(q.reason, null);
          assertCoreReason(q, pair[2], 'QUARANTINED planner ' + pair[2]);
        } else {
          assertNoCoreReason(q, 'NOT_CLASSIFIABLE planner');
        }
      });
    });

    // ── FT13 (preserved) ─────────────────────────────────────────────────────
    await test('FT13 dry-run is the default; only opts.dryRun === false deletes', async function () {
      const variants = [undefined, {}, { dryRun: true }, { dryRun: 'false' }, { dryRun: 0 },
        { dryRun: 1 }, { dryRun: null }, { dryRun: undefined }, { dryRun: 'no' }, 'nonsense', 42, []];
      for (let i = 0; i < variants.length; i++) {
        const run = await runFull(bodyWrite(), variants[i]);
        assert.strictEqual(run.result.status, 'DRY_RUN', 'variant ' + i + ' must stay dry');
        assert.strictEqual(run.result.dryRun, true);
        assert.deepStrictEqual(run.result.plannedDeletes, [POINTER_KEY, FACTS_KEY]);
        assert.strictEqual(run.store._invoke.delete, 0, 'variant ' + i + ' issued a delete');
        assert.strictEqual(run.store._map.size, 2, 'variant ' + i + ' mutated the store');
      }
      const real = await runFull(bodyWrite(), { dryRun: false });
      assert.strictEqual(real.result.status, 'DELETED');
      assert.strictEqual(real.store._invoke.delete, 2);
      assert.strictEqual(real.store._map.size, 0);
    });

    // ── FT14 (preserved) ─────────────────────────────────────────────────────
    await test('FT14 real deletion runs pointer-first for the safe pair', async function () {
      const run = await runFull(bodyWrite(), { dryRun: false });
      assert.strictEqual(run.result.status, 'DELETED');
      assert.deepStrictEqual(run.store._deleteOrder, [POINTER_KEY, FACTS_KEY],
        'pointer must be removed before the record it references');
      assert.deepStrictEqual(run.result.deleted, [POINTER_KEY, FACTS_KEY]);
      assert.strictEqual(run.result.classification, 'SAFE_PAIR', 'executor echoes classification');

      const orphan = await runFull(bodyOrphan(), { dryRun: false }, { seed: [FACTS_KEY] });
      assert.strictEqual(orphan.result.status, 'DELETED');
      assert.deepStrictEqual(orphan.store._deleteOrder, [FACTS_KEY]);
      assert.strictEqual(orphan.result.classification, 'CONFIRMED_ORPHAN');
    });

    // ── FT15 (preserved) ─────────────────────────────────────────────────────
    await test('FT15 pointer delete failure stops immediately and leaves facts intact', async function () {
      const run = await runFull(bodyWrite(), { dryRun: false }, {
        seed: [FACTS_KEY, POINTER_KEY], throwOn: [POINTER_KEY], throwName: 'BlobsInternalError'
      });
      assert.strictEqual(run.result.status, 'DELETE_ERROR');
      assert.strictEqual(run.result.failedKey, POINTER_KEY);
      assert.deepStrictEqual(run.result.deleted, [], 'nothing confirmed deleted');
      assert.strictEqual(run.result.errorName, 'BlobsInternalError');
      assert.strictEqual(run.store._invoke.delete, 1, 'no retry, no continuation');
      assert.deepStrictEqual(run.store._deleteOrder, [POINTER_KEY], 'facts was never attempted');
      assert.ok(run.store._map.has(FACTS_KEY), 'facts record still present');
      assert.ok(run.store._map.has(POINTER_KEY), 'pointer still present');
    });

    // ── FT16 (preserved) ─────────────────────────────────────────────────────
    await test('FT16 facts delete failure leaves only an orphaned facts key', async function () {
      const run = await runFull(bodyWrite(), { dryRun: false }, {
        seed: [FACTS_KEY, POINTER_KEY], throwOn: [FACTS_KEY], throwName: 'TimeoutError'
      });
      assert.strictEqual(run.result.status, 'DELETE_ERROR');
      assert.strictEqual(run.result.failedKey, FACTS_KEY);
      assert.deepStrictEqual(run.result.deleted, [POINTER_KEY], 'pointer confirmed gone');
      assert.strictEqual(run.result.errorName, 'TimeoutError');
      assert.strictEqual(run.store._invoke.delete, 2, 'exactly two attempts, no retry');
      assert.ok(!run.store._map.has(POINTER_KEY), 'pointer removed');
      assert.ok(run.store._map.has(FACTS_KEY), 'facts remains as a safe orphan');
    });

    // ── FT17 / FT18 (preserved): forged plans ────────────────────────────────
    await test('FT17 forged SAFE_PAIR label over an orphan-shaped key set fails closed', async function () {
      const store = makeSpyStore({ seed: [FACTS_KEY, POINTER_KEY] });
      const forged = { ok: true, classification: 'SAFE_PAIR', reason: null, keys: [FACTS_KEY], count: 1, metadata: {} };
      const r = await executeFundFactsTeardown(store, forged, { dryRun: false });
      assert.strictEqual(r.status, 'INVALID_PLAN');
      assert.strictEqual(r.reason, 'CLASSIFICATION_MISMATCH');
      assert.strictEqual(store._invoke.delete, 0, 'zero I/O on a forged plan');
      assert.strictEqual(store._access.delete, 0, 'zero acquisition on a forged plan');
      assert.strictEqual(store._map.size, 2, 'store untouched');
    });

    await test('FT18 forged CONFIRMED_ORPHAN label over a pair fails closed', async function () {
      const store = makeSpyStore({ seed: [FACTS_KEY, POINTER_KEY] });
      const forged = { ok: true, classification: 'CONFIRMED_ORPHAN', keys: [POINTER_KEY, FACTS_KEY], count: 2 };
      const r = await executeFundFactsTeardown(store, forged, { dryRun: false });
      assert.strictEqual(r.status, 'INVALID_PLAN');
      assert.strictEqual(r.reason, 'CLASSIFICATION_MISMATCH');
      assert.strictEqual(store._invoke.delete, 0, 'zero I/O');

      // Quarantine and every other label are non-executable whatever keys accompany them.
      const labels = ['QUARANTINED', 'NOOP', 'NOT_CLASSIFIABLE', 'ANYTHING', null, 42];
      for (let i = 0; i < labels.length; i++) {
        const s = makeSpyStore({ seed: [FACTS_KEY] });
        const p = { ok: true, classification: labels[i], keys: [FACTS_KEY], count: 1 };
        const rr = await executeFundFactsTeardown(s, p, { dryRun: false });
        assert.strictEqual(rr.status, 'INVALID_PLAN', 'label must not execute: ' + String(labels[i]));
        assert.strictEqual(rr.reason, 'CLASSIFICATION_MISMATCH', 'label: ' + String(labels[i]));
        assert.strictEqual(s._invoke.delete, 0, 'zero I/O for label: ' + String(labels[i]));
        assert.ok(s._map.has(FACTS_KEY), 'facts survives label: ' + String(labels[i]));
      }
    });

    // ── FT19 (preserved) ─────────────────────────────────────────────────────
    await test('FT19 a mis-ordered plan is re-derived to pointer-first, not obeyed', async function () {
      const store = makeSpyStore({ seed: [FACTS_KEY, POINTER_KEY] });
      const tampered = { ok: true, classification: 'SAFE_PAIR', keys: [FACTS_KEY, POINTER_KEY], count: 2 };
      const r = await executeFundFactsTeardown(store, tampered, { dryRun: false });
      assert.strictEqual(r.status, 'DELETED');
      assert.deepStrictEqual(store._deleteOrder, [POINTER_KEY, FACTS_KEY],
        'the executor ignores the order it was handed');
      assert.deepStrictEqual(tampered.keys, [FACTS_KEY, POINTER_KEY], 'the plan itself is never mutated');

      const s2 = makeSpyStore({ seed: [FACTS_KEY, POINTER_KEY] });
      const d = await executeFundFactsTeardown(s2, tampered, {});
      assert.deepStrictEqual(d.plannedDeletes, [POINTER_KEY, FACTS_KEY]);
    });

    // ── FT20 (preserved) ─────────────────────────────────────────────────────
    await test('FT20 a pointer-only plan is never executable', async function () {
      const store = makeSpyStore({ seed: [POINTER_KEY] });
      const p = { ok: true, classification: 'SAFE_PAIR', keys: [POINTER_KEY], count: 1 };
      const r = await executeFundFactsTeardown(store, p, { dryRun: false });
      assert.strictEqual(r.status, 'INVALID_PLAN');
      assert.strictEqual(r.reason, 'POINTER_ONLY_PLAN');
      assert.strictEqual(store._invoke.delete, 0);
      assert.strictEqual(store._access.delete, 0);
    });

    // ── FT21 (preserved) ─────────────────────────────────────────────────────
    await test('FT21 non-object / not-ok / hostile plans are rejected with zero I/O', async function () {
      const bad = [undefined, null, 42, 'x', [], {}, { ok: false }, { ok: 'true' }, { ok: 1 },
        { ok: true }, { ok: true, keys: 'x' }, { ok: true, keys: [FACTS_KEY, POINTER_KEY, FACTS_KEY] }];
      for (let i = 0; i < bad.length; i++) {
        const store = makeSpyStore({ seed: [FACTS_KEY, POINTER_KEY] });
        const r = await executeFundFactsTeardown(store, bad[i], { dryRun: false });
        assert.strictEqual(r.status, 'INVALID_PLAN', 'plan ' + i + ' must be invalid');
        assert.strictEqual(store._invoke.delete, 0, 'plan ' + i + ' issued I/O');
        assert.strictEqual(store._access.delete, 0, 'plan ' + i + ' acquired delete');
      }
      const hostilePlan = { ok: true, classification: 'SAFE_PAIR' };
      Object.defineProperty(hostilePlan, 'keys', { enumerable: true, get: function () { throw new Error('trap'); } });
      const s = makeSpyStore({ seed: [FACTS_KEY] });
      const hr = await executeFundFactsTeardown(s, hostilePlan, { dryRun: false });
      assert.strictEqual(hr.status, 'INVALID_PLAN');
      assert.strictEqual(hr.reason, 'PLAN_UNREADABLE');
      assert.strictEqual(s._invoke.delete, 0);
      assert.strictEqual(s._access.delete, 0);
    });

    // ── FT22 (revised): hostile acquisition coverage ─────────────────────────
    await test('FT22 missing, non-callable, throwing and Proxy-trapped store interfaces', async function () {
      const plan = planFundFactsTeardown(bodyWrite());
      const stores = [undefined, null, {}, { delete: 'nope' }, { delete: 42 }, []];
      for (let i = 0; i < stores.length; i++) {
        const r = await executeFundFactsTeardown(stores[i], plan, { dryRun: false });
        assert.strictEqual(r.status, 'INVALID_PLAN', 'store ' + i);
        assert.strictEqual(r.reason, 'STORE_INTERFACE_MISSING', 'store ' + i);
        assert.strictEqual(r.dryRun, false);
      }

      // A throwing delete getter.
      const thrower = makeSpyStore({ seed: [FACTS_KEY, POINTER_KEY], deleteGetterThrows: true });
      const rt = await executeFundFactsTeardown(thrower, plan, { dryRun: false });
      assert.strictEqual(rt.status, 'INVALID_PLAN');
      assert.strictEqual(rt.reason, 'STORE_INTERFACE_MISSING');
      assert.strictEqual(thrower._invoke.delete, 0, 'no invocation after a throwing getter');
      assert.strictEqual(thrower._access.delete, 1, 'the property was read exactly once');
      assert.strictEqual(thrower._access.get, 0, 'no read interface acquired');

      // A non-callable delete property.
      const notFn = makeSpyStore({ seed: [FACTS_KEY], deleteNotCallable: true });
      const rn = await executeFundFactsTeardown(notFn, plan, { dryRun: false });
      assert.strictEqual(rn.status, 'INVALID_PLAN');
      assert.strictEqual(rn.reason, 'STORE_INTERFACE_MISSING');
      assert.strictEqual(notFn._invoke.delete, 0);

      // A hostile Proxy store whose every property read throws.
      const state = { reads: [] };
      const rp = await executeFundFactsTeardown(makeHostileProxyStore(state), plan, { dryRun: false });
      assert.strictEqual(rp.status, 'INVALID_PLAN');
      assert.strictEqual(rp.reason, 'STORE_INTERFACE_MISSING');
      assert.deepStrictEqual(state.reads, ['delete'], 'only the delete property was ever read');

      // Dry-run needs no store at all.
      const dry = await executeFundFactsTeardown(undefined, plan);
      assert.strictEqual(dry.status, 'DRY_RUN');
    });

    // ── FT23-FT27 (revised): verification objects ────────────────────────────
    await test('FT23 verification is DISABLED unless opts.verify === true', async function () {
      const variants = [{ dryRun: false }, { dryRun: false, verify: false },
        { dryRun: false, verify: 'true' }, { dryRun: false, verify: 1 }];
      for (let i = 0; i < variants.length; i++) {
        const run = await runFull(bodyWrite(), variants[i]);
        assertVerification(run.result.verification, DISABLED, 'variant ' + i);
        assert.strictEqual(run.store._access.get, 0, 'variant ' + i + ' must not acquire get');
        assert.strictEqual(run.store._invoke.get, 0, 'variant ' + i + ' must not read back');
      }
    });

    await test('FT24 verification reads with strong consistency and reports VERIFIED_ABSENT', async function () {
      const run = await runFull(bodyWrite(), { dryRun: false, verify: true });
      assert.strictEqual(run.result.status, 'DELETED');
      assertVerification(run.result.verification, {
        outcome: 'VERIFIED_ABSENT',
        checkedKeys: [POINTER_KEY, FACTS_KEY],
        absentKeys: [POINTER_KEY, FACTS_KEY]
      }, 'FT24');
      assert.strictEqual(run.store._invoke.get, 2, 'both deleted keys read back');
      assert.deepStrictEqual(run.store._getOrder, [POINTER_KEY, FACTS_KEY]);
      run.store._getOpts.forEach(function (o, i) {
        assert.deepStrictEqual(o, { consistency: 'strong' },
          'verification read ' + i + ' must be strongly consistent');
      });
    });

    await test('FT25 a key that reads back present reports STILL_PRESENT', async function () {
      // Deletion really removes both keys; getPresent forces ONE of them to read
      // back present anyway (a backend that lied or a lagging replica).
      const run = await runFull(bodyWrite(), { dryRun: false, verify: true }, {
        seed: [FACTS_KEY, POINTER_KEY], getPresent: [FACTS_KEY]
      });
      assert.strictEqual(run.result.status, 'DELETED');
      assertVerification(run.result.verification, {
        outcome: 'STILL_PRESENT',
        checkedKeys: [POINTER_KEY, FACTS_KEY],
        absentKeys: [POINTER_KEY],
        presentKeys: [FACTS_KEY]
      }, 'FT25');
    });

    await test('FT26 unreadable verification reports INCONCLUSIVE', async function () {
      const thrown = await runFull(bodyWrite(), { dryRun: false, verify: true }, {
        seed: [FACTS_KEY, POINTER_KEY], getThrowOn: [POINTER_KEY, FACTS_KEY]
      });
      assertVerification(thrown.result.verification, {
        outcome: 'INCONCLUSIVE',
        checkedKeys: [POINTER_KEY, FACTS_KEY],
        inconclusiveKeys: [POINTER_KEY, FACTS_KEY]
      }, 'FT26 throwing get');

      const noGet = await runFull(bodyWrite(), { dryRun: false, verify: true }, {
        seed: [FACTS_KEY, POINTER_KEY], noGet: true
      });
      assert.strictEqual(noGet.result.status, 'DELETED', 'deletion itself still succeeded');
      assertVerification(noGet.result.verification, {
        outcome: 'INCONCLUSIVE',
        inconclusiveKeys: [POINTER_KEY, FACTS_KEY]
      }, 'FT26 absent get method');

      // STILL_PRESENT outranks INCONCLUSIVE.
      const mixed = await runFull(bodyWrite(), { dryRun: false, verify: true }, {
        seed: [FACTS_KEY, POINTER_KEY], noop: true, getThrowOn: [POINTER_KEY], getPresent: [FACTS_KEY]
      });
      assert.strictEqual(mixed.result.verification.outcome, 'STILL_PRESENT', 'worst case wins');
    });

    await test('FT27 interrupted teardown verifies the deleted subset and reports PARTIAL', async function () {
      const run = await runFull(bodyWrite(), { dryRun: false, verify: true }, {
        seed: [FACTS_KEY, POINTER_KEY], throwOn: [FACTS_KEY], throwName: 'AbortError'
      });
      assert.strictEqual(run.result.status, 'DELETE_ERROR');
      assert.deepStrictEqual(run.result.deleted, [POINTER_KEY]);
      assert.strictEqual(run.result.failedKey, FACTS_KEY);
      assert.strictEqual(run.result.errorName, 'AbortError');
      assertVerification(run.result.verification, {
        outcome: 'PARTIAL',
        checkedKeys: [POINTER_KEY],
        absentKeys: [POINTER_KEY]
      }, 'FT27 partial');
      assert.deepStrictEqual(run.store._getOrder, [POINTER_KEY], 'only the deleted key is verified');
      assert.ok(run.store._map.has(FACTS_KEY), 'residue is an orphaned facts key');

      // An empty deleted subset is INCONCLUSIVE and never acquires the reader.
      const none = await runFull(bodyWrite(), { dryRun: false, verify: true }, {
        seed: [FACTS_KEY, POINTER_KEY], throwOn: [POINTER_KEY]
      });
      assert.deepStrictEqual(none.result.deleted, []);
      assertVerification(none.result.verification, { outcome: 'INCONCLUSIVE' }, 'FT27 empty subset');
      assert.strictEqual(none.store._access.get, 0, 'zero get acquisition for an empty subset');
      assert.strictEqual(none.store._invoke.get, 0, 'zero get invocations');
    });

    // ── FT28 (revised): sanitization through the executor only ───────────────
    await test('FT28 errors surface an allowlisted name only; messages and stacks never leak', async function () {
      async function errorNameFor(err) {
        // The spy's delete is a getter-only accessor, so it is redefined rather
        // than assigned (it is declared configurable for exactly this purpose).
        const store = makeSpyStore({ seed: [FACTS_KEY, POINTER_KEY] });
        Object.defineProperty(store, 'delete', {
          configurable: true,
          get: function () { return async function () { throw err; }; }
        });
        const r = await executeFundFactsTeardown(store, planFundFactsTeardown(bodyWrite()), { dryRun: false });
        assert.strictEqual(r.status, 'DELETE_ERROR');
        return r.errorName;
      }

      assert.strictEqual(await errorNameFor(new TypeError('x')), 'TypeError');
      assert.strictEqual(await errorNameFor(new RangeError('x')), 'RangeError');
      const named = new Error('x'); named.name = 'BlobsConsistencyError';
      assert.strictEqual(await errorNameFor(named), 'BlobsConsistencyError');

      const weird = new Error('x'); weird.name = 'WeirdCustomError';
      assert.strictEqual(await errorNameFor(weird), 'UnknownError', 'unlisted name collapses');
      assert.strictEqual(await errorNameFor({ name: 42 }), 'UnknownError');
      assert.strictEqual(await errorNameFor({ name: 'Error ' }), 'UnknownError', 'padded name rejected');
      assert.strictEqual(await errorNameFor(undefined), 'UnknownError');
      assert.strictEqual(await errorNameFor('a string'), 'UnknownError');

      // A hostile throwing name getter cannot escape.
      const hostile = {};
      Object.defineProperty(hostile, 'name', { get: function () { throw new Error('boom'); } });
      assert.strictEqual(await errorNameFor(hostile), 'UnknownError');

      // End to end: a secret-bearing message never reaches the result.
      const store = makeSpyStore({ seed: [FACTS_KEY, POINTER_KEY] });
      Object.defineProperty(store, 'delete', {
        configurable: true,
        get: function () {
          return async function () {
            const e = new Error('SECRET-TOKEN-abc123 leaked from the store');
            e.name = 'WeirdCustomError';
            throw e;
          };
        }
      });
      const r = await executeFundFactsTeardown(store, planFundFactsTeardown(bodyWrite()), { dryRun: false });
      assert.strictEqual(r.errorName, 'UnknownError');
      const serialized = JSON.stringify(r);
      assert.ok(serialized.indexOf('SECRET-TOKEN') === -1, 'no raw message in the result');
      assert.ok(serialized.indexOf('stack') === -1, 'no stack in the result');
      assert.ok(!('message' in r) && !('stack' in r) && !('error' in r), 'no raw error channels');
    });

    // ── FT29 (revised): determinism, immutability, independent literals ──────
    await test('FT29 identical inputs give byte-identical output; caller inputs are untouched', function () {
      const body = bodyWrite();
      const before = JSON.stringify(body);
      const c1 = classifyFundFactsResponse(body);
      const c2 = classifyFundFactsResponse(body);
      assert.strictEqual(JSON.stringify(c1), JSON.stringify(c2), 'byte-identical classifications');
      assert.strictEqual(JSON.stringify(body), before, 'input body unmodified');
      assert.ok(!Object.isFrozen(body), 'caller input must not be frozen by the classifier');
      assert.ok(!Object.isFrozen(body.writtenKeys), 'caller array must not be frozen');
      assert.ok(Object.isFrozen(c1), 'classification frozen');
      assert.ok(Object.isFrozen(c1.evidenceKeys), 'classification arrays frozen');
      assert.ok(Object.isFrozen(c1.metadata), 'nested metadata frozen');

      const frozenBody = Object.freeze({
        status: 'WRITE', ticker: 'FROG', cik: CIK,
        writtenKeys: Object.freeze([FACTS_KEY, POINTER_KEY])
      });
      assert.strictEqual(JSON.stringify(classifyFundFactsResponse(frozenBody)), JSON.stringify(c1),
        'frozen and unfrozen inputs agree');

      const mutable = { status: 'WRITE', writtenKeys: [FACTS_KEY, POINTER_KEY] };
      const plan = planFundFactsTeardown(mutable);
      mutable.writtenKeys.push('fundstore:v1:cik:EVIL');
      assert.deepStrictEqual(plan.keys, [POINTER_KEY, FACTS_KEY], 'plan is a snapshot, not a view');

      // Independent literal for the classification vocabulary — the module's own
      // constants are private and are deliberately not used as the oracle here.
      const seen = [
        classifyFundFactsResponse(bodyWrite()).classification,
        classifyFundFactsResponse(bodyOrphan()).classification,
        classifyFundFactsResponse(bodyPointerConflict()).classification,
        classifyFundFactsResponse(bodyBareUnavailable()).classification,
        classifyFundFactsResponse({ status: 'WAT' }).classification
      ];
      assert.deepStrictEqual(seen,
        ['SAFE_PAIR', 'CONFIRMED_ORPHAN', 'QUARANTINED', 'NOOP', 'NOT_CLASSIFIABLE'],
        'classification vocabulary matches the independent expected literal');
    });

    // ── FT30 (preserved): the hard invariant ─────────────────────────────────
    await test('FT30 rows C and D can never delete a facts key, by any route', async function () {
      const quarantined = [bodyPointerConflict(), bodyUncertain()];
      for (let i = 0; i < quarantined.length; i++) {
        const body = quarantined[i];

        const run = await runFull(body, { dryRun: false, verify: true }, { seed: [FACTS_KEY] });
        assert.strictEqual(run.plan.ok, false, 'quarantined plan is not executable');
        assert.strictEqual(run.result.status, 'INVALID_PLAN');
        assert.strictEqual(run.result.reason, 'PLAN_NOT_OK');
        assert.strictEqual(run.store._invoke.delete, 0, 'zero deletes');
        assert.strictEqual(run.store._access.delete, 0, 'zero acquisition');
        assert.ok(run.store._map.has(FACTS_KEY), 'facts record survives');

        const s2 = makeSpyStore({ seed: [FACTS_KEY] });
        const forced = Object.assign({}, run.plan, { ok: true });
        const r2 = await executeFundFactsTeardown(s2, forced, { dryRun: false });
        assert.strictEqual(r2.status, 'NOOP', 'a quarantined plan carries no keys to delete');
        assert.strictEqual(s2._invoke.delete, 0, 'zero deletes');
        assert.ok(s2._map.has(FACTS_KEY), 'facts record survives');

        const s3 = makeSpyStore({ seed: [FACTS_KEY] });
        const smuggled = { ok: true, classification: 'QUARANTINED', keys: [FACTS_KEY], count: 1 };
        const r3 = await executeFundFactsTeardown(s3, smuggled, { dryRun: false });
        assert.strictEqual(r3.status, 'INVALID_PLAN');
        assert.strictEqual(r3.reason, 'CLASSIFICATION_MISMATCH');
        assert.strictEqual(s3._invoke.delete, 0, 'zero deletes');
        assert.ok(s3._map.has(FACTS_KEY), 'facts record survives');
      }
    });

    // ── FT31 (revised): export surface ───────────────────────────────────────
    await test('FT31 import-inert: a clean child sees exactly the three approved exports', function () {
      const script =
        "globalThis.__fc = 0;" +
        "globalThis.fetch = function () { globalThis.__fc++; throw new Error('LIVE_NETWORK_FORBIDDEN'); };" +
        "var ns = require(" + JSON.stringify(LIB_PATH) + ");" +
        "var keys = Object.keys(ns).sort().join(',');" +
        "if (keys !== 'classifyFundFactsResponse,executeFundFactsTeardown,planFundFactsTeardown') { process.exit(5); }" +
        "if (typeof ns.classifyFundFactsResponse !== 'function') { process.exit(2); }" +
        "if (typeof ns.planFundFactsTeardown !== 'function') { process.exit(2); }" +
        "if (typeof ns.executeFundFactsTeardown !== 'function') { process.exit(2); }" +
        "if (globalThis.__fc !== 0) { process.exit(4); }" +
        "process.exit(0);";
      const child = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', cwd: ROOT });
      assert.strictEqual(child.status, 0,
        'clean-child import: exit ' + child.status + ' ' + ((child.stderr || '') + (child.stdout || '')).trim());
    });

    // ── FT32 (revised): purity scan + behavioral acquisition contract ────────
    // The store-method spellings are deliberately NOT asserted here; acquisition
    // is proven behaviorally below and in M12-M20.
    await test('FT32 target module purity (no env / fetch / clock / blobs / route / write)', function () {
      const raw = fs.readFileSync(LIB_PATH, 'utf8').replace(/\r\n/g, '\n');
      const code = stripComments(raw);
      ['fetch(', 'localStorage', 'sessionStorage', 'getStore', '@netlify/blobs', 'process.env',
        'Date.now(', 'new Date(', 'Date.parse(', 'document.', 'window.',
        'pt_results', 'pt_tickers', 'pt_holdings',
        'orchestrate(', 'analyzeChunk', 'enforceScoreConsistency', '_techCache', 'sentiment_score',
        'exports.handler', 'export default', 'statusCode', 'withLambda',
        'require(', 'JSON.parse(', 'JSON.stringify('
      ].forEach(function (tok) {
        assert.ok(code.indexOf(tok) === -1, 'forbidden token in target: ' + tok);
      });
      assert.ok(!/\.(set|setJSON)\s*\(/.test(code), 'target must never write to the store');
      assert.ok(!/\.mjs/.test(raw), 'no .mjs reference');
      assert.strictEqual((code.match(/module\.exports/g) || []).length, 1, 'exactly one module.exports');

      // Behavioral: strong consistency reaches the store on every verification read.
      return (async function () {
        const run = await runFull(bodyWrite(), { dryRun: false, verify: true });
        assert.strictEqual(run.store._getOpts.length, 2);
        run.store._getOpts.forEach(function (o) {
          assert.deepStrictEqual(o, { consistency: 'strong' }, 'strong options passed');
        });
      })();
    });

    // ── FT33 (preserved) ─────────────────────────────────────────────────────
    await test('FT33 the suite performed zero real network calls', function () {
      assert.strictEqual(fetchCalls, 0, 'the real global fetch must never be called');
    });

    // ═══ M01-M22 — v2 additions ══════════════════════════════════════════════

    await test('M01 classifier: two distinct same-class keys give KEY_CLASS_DUPLICATE', function () {
      assert.strictEqual(
        classifyFundFactsResponse({ status: 'WRITE', writtenKeys: [FACTS_KEY, FACTS_KEY_2] }).reason,
        'KEY_CLASS_DUPLICATE', 'two facts keys');
      assert.strictEqual(
        classifyFundFactsResponse({ status: 'WRITE', writtenKeys: [POINTER_KEY, POINTER_KEY_2] }).reason,
        'KEY_CLASS_DUPLICATE', 'two pointer keys');
      assert.strictEqual(
        classifyFundFactsResponse({ status: 'WRITE', writtenKeys: [FACTS_KEY, FACTS_KEY] }).reason,
        'DUPLICATE_KEY', 'exact repeat stays DUPLICATE_KEY');
    });

    await test('M02 executor: forged same-class pair gives KEY_CLASS_DUPLICATE with zero store access', async function () {
      const pairs = [[FACTS_KEY, FACTS_KEY_2], [POINTER_KEY, POINTER_KEY_2]];
      for (let i = 0; i < pairs.length; i++) {
        const store = makeSpyStore({ seed: pairs[i] });
        const forged = { ok: true, classification: 'SAFE_PAIR', keys: pairs[i], count: 2 };
        const r = await executeFundFactsTeardown(store, forged, { dryRun: false });
        assert.strictEqual(r.status, 'INVALID_PLAN', 'pair ' + i);
        assert.strictEqual(r.reason, 'KEY_CLASS_DUPLICATE', 'pair ' + i);
        assert.strictEqual(store._access.delete, 0, 'zero delete acquisition');
        assert.strictEqual(store._access.get, 0, 'zero get acquisition');
      }
      // Exact repeat at the executor boundary stays DUPLICATE_KEY.
      const s = makeSpyStore({ seed: [FACTS_KEY] });
      const dup = { ok: true, classification: 'SAFE_PAIR', keys: [FACTS_KEY, FACTS_KEY], count: 2 };
      const rd = await executeFundFactsTeardown(s, dup, { dryRun: false });
      assert.strictEqual(rd.reason, 'DUPLICATE_KEY');
      assert.strictEqual(s._access.delete, 0);
    });

    await test('M03 plan.count mismatch gives CLASSIFICATION_MISMATCH with zero store access', async function () {
      const cases = [
        { ok: true, classification: 'SAFE_PAIR', keys: [POINTER_KEY, FACTS_KEY], count: 99 },
        { ok: true, classification: 'SAFE_PAIR', keys: [POINTER_KEY, FACTS_KEY], count: 1 },
        { ok: true, classification: 'SAFE_PAIR', keys: [POINTER_KEY, FACTS_KEY] },
        { ok: true, classification: 'CONFIRMED_ORPHAN', keys: [FACTS_KEY], count: 2 },
        { ok: true, classification: 'CONFIRMED_ORPHAN', keys: [FACTS_KEY], count: '1' },
        { ok: true, classification: 'NOOP', keys: [], count: 3 }
      ];
      for (let i = 0; i < cases.length; i++) {
        const store = makeSpyStore({ seed: [FACTS_KEY, POINTER_KEY] });
        const r = await executeFundFactsTeardown(store, cases[i], { dryRun: false, verify: true });
        assert.strictEqual(r.status, 'INVALID_PLAN', 'case ' + i);
        assert.strictEqual(r.reason, 'CLASSIFICATION_MISMATCH', 'case ' + i);
        assert.strictEqual(store._access.delete, 0, 'case ' + i + ' acquired delete');
        assert.strictEqual(store._access.get, 0, 'case ' + i + ' acquired get');
        assert.strictEqual(store._map.size, 2, 'case ' + i + ' mutated the store');
      }
      // A well-formed plan with a correct count still executes.
      const okStore = makeSpyStore({ seed: [FACTS_KEY, POINTER_KEY] });
      const okPlan = { ok: true, classification: 'SAFE_PAIR', keys: [POINTER_KEY, FACTS_KEY], count: 2 };
      assert.strictEqual((await executeFundFactsTeardown(okStore, okPlan, { dryRun: false })).status, 'DELETED');
    });

    await test('M04 CONFIRMED_ORPHAN facts delete failure: one attempt, empty deleted, correct failedKey', async function () {
      const run = await runFull(bodyOrphan(), { dryRun: false }, {
        seed: [FACTS_KEY], throwOn: [FACTS_KEY], throwName: 'SystemError'
      });
      assert.strictEqual(run.result.status, 'DELETE_ERROR');
      assert.strictEqual(run.result.classification, 'CONFIRMED_ORPHAN');
      assert.strictEqual(run.store._invoke.delete, 1, 'exactly one attempt');
      assert.deepStrictEqual(run.result.deleted, []);
      assert.strictEqual(run.result.failedKey, FACTS_KEY);
      assert.strictEqual(run.result.errorName, 'SystemError');
      assert.ok(run.store._map.has(FACTS_KEY), 'record survives a failed delete');
    });

    await test('M05 NOOP carries the DISABLED verification object', async function () {
      for (const opts of [{ dryRun: false }, { dryRun: false, verify: true }, {}]) {
        const store = makeSpyStore({ seed: [FACTS_KEY] });
        const noopPlan = { ok: true, classification: 'NOOP', keys: [], count: 0 };
        const r = await executeFundFactsTeardown(store, noopPlan, opts);
        assert.strictEqual(r.status, 'NOOP');
        assertVerification(r.verification, DISABLED, 'NOOP ' + JSON.stringify(opts));
        assert.strictEqual(store._access.delete, 0, 'NOOP acquired delete');
        assert.strictEqual(store._access.get, 0, 'NOOP acquired get');
      }
    });

    await test('M06 DRY_RUN carries the DISABLED verification object', async function () {
      for (const opts of [undefined, {}, { verify: true }, { dryRun: true, verify: true }]) {
        const run = await runFull(bodyWrite(), opts);
        assert.strictEqual(run.result.status, 'DRY_RUN');
        assertVerification(run.result.verification, DISABLED, 'DRY_RUN ' + JSON.stringify(opts));
        assert.strictEqual(run.store._access.delete, 0, 'DRY_RUN acquired delete');
        assert.strictEqual(run.store._access.get, 0, 'DRY_RUN acquired get');
      }
    });

    await test('M07 verification arrays are populated correctly for every outcome', async function () {
      const absent = await runFull(bodyWrite(), { dryRun: false, verify: true });
      assertVerification(absent.result.verification, {
        outcome: 'VERIFIED_ABSENT',
        checkedKeys: [POINTER_KEY, FACTS_KEY],
        absentKeys: [POINTER_KEY, FACTS_KEY]
      }, 'M07 VERIFIED_ABSENT');

      const present = await runFull(bodyWrite(), { dryRun: false, verify: true }, {
        seed: [FACTS_KEY, POINTER_KEY], noop: true, getPresent: [POINTER_KEY, FACTS_KEY]
      });
      assertVerification(present.result.verification, {
        outcome: 'STILL_PRESENT',
        checkedKeys: [POINTER_KEY, FACTS_KEY],
        presentKeys: [POINTER_KEY, FACTS_KEY]
      }, 'M07 STILL_PRESENT');

      // Mixed present + unreadable: STILL_PRESENT wins, and both arrays are filled.
      const mixed = await runFull(bodyWrite(), { dryRun: false, verify: true }, {
        seed: [FACTS_KEY, POINTER_KEY], noop: true,
        getPresent: [POINTER_KEY], getThrowOn: [FACTS_KEY]
      });
      assertVerification(mixed.result.verification, {
        outcome: 'STILL_PRESENT',
        checkedKeys: [POINTER_KEY, FACTS_KEY],
        presentKeys: [POINTER_KEY],
        inconclusiveKeys: [FACTS_KEY]
      }, 'M07 mixed present + unreadable');

      // Mixed absent + unreadable: INCONCLUSIVE wins over VERIFIED_ABSENT.
      const partialRead = await runFull(bodyWrite(), { dryRun: false, verify: true }, {
        seed: [FACTS_KEY, POINTER_KEY], getThrowOn: [FACTS_KEY]
      });
      assertVerification(partialRead.result.verification, {
        outcome: 'INCONCLUSIVE',
        checkedKeys: [POINTER_KEY, FACTS_KEY],
        absentKeys: [POINTER_KEY],
        inconclusiveKeys: [FACTS_KEY]
      }, 'M07 mixed absent + unreadable');

      const partial = await runFull(bodyWrite(), { dryRun: false, verify: true }, {
        seed: [FACTS_KEY, POINTER_KEY], throwOn: [FACTS_KEY]
      });
      assertVerification(partial.result.verification, {
        outcome: 'PARTIAL',
        checkedKeys: [POINTER_KEY],
        absentKeys: [POINTER_KEY]
      }, 'M07 PARTIAL');
    });

    await test('M08 DELETE_ERROR with an empty deleted subset is INCONCLUSIVE and acquires no reader', async function () {
      const run = await runFull(bodyWrite(), { dryRun: false, verify: true }, {
        seed: [FACTS_KEY, POINTER_KEY], throwOn: [POINTER_KEY]
      });
      assert.strictEqual(run.result.status, 'DELETE_ERROR');
      assert.deepStrictEqual(run.result.deleted, []);
      assertVerification(run.result.verification, { outcome: 'INCONCLUSIVE' }, 'M08');
      assert.strictEqual(run.store._access.get, 0, 'get property never accessed');
      assert.strictEqual(run.store._invoke.get, 0, 'get never invoked');

      // Same for a CONFIRMED_ORPHAN whose only delete fails.
      const orphan = await runFull(bodyOrphan(), { dryRun: false, verify: true }, {
        seed: [FACTS_KEY], throwOn: [FACTS_KEY]
      });
      assert.deepStrictEqual(orphan.result.deleted, []);
      assertVerification(orphan.result.verification, { outcome: 'INCONCLUSIVE' }, 'M08 orphan');
      assert.strictEqual(orphan.store._access.get, 0);
    });

    await test('M09 an unknown error name becomes UnknownError through the executor', async function () {
      const store = makeSpyStore({ seed: [FACTS_KEY, POINTER_KEY] });
      Object.defineProperty(store, 'delete', {
        configurable: true,
        get: function () {
          return async function () { const e = new Error('nope'); e.name = 'TotallyMadeUpError'; throw e; };
        }
      });
      const r = await executeFundFactsTeardown(store, planFundFactsTeardown(bodyWrite()), { dryRun: false });
      assert.strictEqual(r.status, 'DELETE_ERROR');
      assert.strictEqual(r.errorName, 'UnknownError');
      assert.ok(JSON.stringify(r).indexOf('TotallyMadeUpError') === -1, 'custom name never echoed');
    });

    await test('M10 a hostile error-name getter leaks nothing', async function () {
      const store = makeSpyStore({ seed: [FACTS_KEY, POINTER_KEY] });
      Object.defineProperty(store, 'delete', {
        configurable: true,
        get: function () {
          return async function () {
            const e = {};
            Object.defineProperty(e, 'name', { get: function () { throw new Error('SECRET-IN-GETTER'); } });
            Object.defineProperty(e, 'message', { get: function () { throw new Error('SECRET-MESSAGE'); } });
            Object.defineProperty(e, 'stack', { get: function () { throw new Error('SECRET-STACK'); } });
            e.toString = function () { throw new Error('SECRET-TOSTRING'); };
            throw e;
          };
        }
      });
      let r;
      assert.doesNotThrow(async function () { r = await executeFundFactsTeardown(store, planFundFactsTeardown(bodyWrite()), { dryRun: false }); });
      r = await executeFundFactsTeardown(store, planFundFactsTeardown(bodyWrite()), { dryRun: false });
      assert.strictEqual(r.status, 'DELETE_ERROR');
      assert.strictEqual(r.errorName, 'UnknownError');
      const s = JSON.stringify(r);
      ['SECRET-IN-GETTER', 'SECRET-MESSAGE', 'SECRET-STACK', 'SECRET-TOSTRING'].forEach(function (needle) {
        assert.ok(s.indexOf(needle) === -1, 'must not leak: ' + needle);
      });
    });

    await test('M11 the export surface is exactly three functions', function () {
      const keys = Object.keys(LIB).sort();
      assert.deepStrictEqual(keys, EXPECTED_EXPORTS, 'exactly the three approved exports');
      keys.forEach(function (k) { assert.strictEqual(typeof LIB[k], 'function', k + ' is a function'); });
      ['safeErrorName', 'CLASSIFICATIONS', 'VERIFICATION_OUTCOMES', 'CORE_STATUSES',
        'classifyKey', 'readKeyArray', 'classifyKeySet', 'deriveExecution', 'deepFreeze'
      ].forEach(function (priv) {
        assert.strictEqual(LIB[priv], undefined, priv + ' must stay private');
      });
    });

    await test('M12 a throwing store.delete getter is STORE_INTERFACE_MISSING with zero invocations', async function () {
      const store = makeSpyStore({ seed: [FACTS_KEY, POINTER_KEY], deleteGetterThrows: true });
      const r = await executeFundFactsTeardown(store, planFundFactsTeardown(bodyWrite()), { dryRun: false, verify: true });
      assert.strictEqual(r.status, 'INVALID_PLAN');
      assert.strictEqual(r.reason, 'STORE_INTERFACE_MISSING');
      assert.strictEqual(store._access.delete, 1, 'property read exactly once');
      assert.strictEqual(store._invoke.delete, 0, 'never invoked');
      assert.strictEqual(store._access.get, 0, 'reader never acquired');
      assert.strictEqual(store._map.size, 2, 'store untouched');
    });

    await test('M13 a Proxy get trap that throws while acquiring delete fails closed', async function () {
      const state = { reads: [] };
      const r = await executeFundFactsTeardown(
        makeHostileProxyStore(state), planFundFactsTeardown(bodyWrite()), { dryRun: false, verify: true });
      assert.strictEqual(r.status, 'INVALID_PLAN');
      assert.strictEqual(r.reason, 'STORE_INTERFACE_MISSING');
      assert.deepStrictEqual(state.reads, ['delete'], 'exactly one property read, and only delete');
    });

    await test('M14 a captured delete method that requires this still succeeds', async function () {
      const store = makeThisDependentStore([FACTS_KEY, POINTER_KEY]);
      const r = await executeFundFactsTeardown(store, planFundFactsTeardown(bodyWrite()), { dryRun: false });
      assert.strictEqual(r.status, 'DELETED', 'receiver must be preserved: ' + JSON.stringify(r));
      assert.deepStrictEqual(store._deleted, [POINTER_KEY, FACTS_KEY], 'this-dependent bookkeeping ran');
      assert.strictEqual(store._map.size, 0, 'both keys removed');
    });

    await test('M15 a throwing store.get getter after deletion keeps the status and reports INCONCLUSIVE', async function () {
      const store = makeSpyStore({ seed: [FACTS_KEY, POINTER_KEY], getGetterThrows: true });
      const r = await executeFundFactsTeardown(store, planFundFactsTeardown(bodyWrite()), { dryRun: false, verify: true });
      assert.strictEqual(r.status, 'DELETED', 'the deletion stands');
      assert.notStrictEqual(r.status, 'INVALID_PLAN', 'never downgraded to INVALID_PLAN');
      assert.strictEqual(r.verification.outcome, 'INCONCLUSIVE');
      assert.strictEqual(store._invoke.get, 0, 'no read was ever issued');

      // Same for a non-callable get property.
      const nf = makeSpyStore({ seed: [FACTS_KEY, POINTER_KEY], getNotCallable: true });
      const r2 = await executeFundFactsTeardown(nf, planFundFactsTeardown(bodyWrite()), { dryRun: false, verify: true });
      assert.strictEqual(r2.status, 'DELETED');
      assert.strictEqual(r2.verification.outcome, 'INCONCLUSIVE');
    });

    await test('M16 a captured get method that requires this still succeeds', async function () {
      const store = makeThisDependentStore([FACTS_KEY, POINTER_KEY]);
      const r = await executeFundFactsTeardown(store, planFundFactsTeardown(bodyWrite()), { dryRun: false, verify: true });
      assert.strictEqual(r.status, 'DELETED');
      assert.strictEqual(r.verification.outcome, 'VERIFIED_ABSENT', 'reader receiver preserved: ' + JSON.stringify(r.verification));
      assert.deepStrictEqual(r.verification.checkedKeys, [POINTER_KEY, FACTS_KEY]);
      store._getOpts.forEach(function (o) {
        assert.deepStrictEqual(o, { consistency: 'strong' }, 'strong options reached a this-dependent reader');
      });
    });

    await test('M17 when get acquisition fails after deletion, inconclusiveKeys equals the deleted subset', async function () {
      const full = makeSpyStore({ seed: [FACTS_KEY, POINTER_KEY], noGet: true });
      const rf = await executeFundFactsTeardown(full, planFundFactsTeardown(bodyWrite()), { dryRun: false, verify: true });
      assertVerification(rf.verification, {
        outcome: 'INCONCLUSIVE',
        inconclusiveKeys: [POINTER_KEY, FACTS_KEY]
      }, 'M17 full subset');

      // A partial subset reports exactly that subset.
      const partial = makeSpyStore({ seed: [FACTS_KEY, POINTER_KEY], noGet: true, throwOn: [FACTS_KEY] });
      const rp = await executeFundFactsTeardown(partial, planFundFactsTeardown(bodyWrite()), { dryRun: false, verify: true });
      assert.strictEqual(rp.status, 'DELETE_ERROR');
      assertVerification(rp.verification, {
        outcome: 'INCONCLUSIVE',
        inconclusiveKeys: [POINTER_KEY]
      }, 'M17 partial subset');
    });

    await test('M18 on a real-delete path the delete property is observed exactly once', async function () {
      const pair = await runFull(bodyWrite(), { dryRun: false });
      assert.strictEqual(pair.store._access.delete, 1, 'two keys, one acquisition');
      assert.strictEqual(pair.store._invoke.delete, 2, 'two invocations');

      const orphan = await runFull(bodyOrphan(), { dryRun: false }, { seed: [FACTS_KEY] });
      assert.strictEqual(orphan.store._access.delete, 1, 'one key, one acquisition');
      assert.strictEqual(orphan.store._invoke.delete, 1);

      const failed = await runFull(bodyWrite(), { dryRun: false }, {
        seed: [FACTS_KEY, POINTER_KEY], throwOn: [FACTS_KEY]
      });
      assert.strictEqual(failed.store._access.delete, 1, 'a mid-run failure does not reacquire');
      assert.strictEqual(failed.store._invoke.delete, 2);
    });

    await test('M19 the get property is observed once for a non-empty subset and never for an empty one', async function () {
      const two = await runFull(bodyWrite(), { dryRun: false, verify: true });
      assert.strictEqual(two.store._access.get, 1, 'two keys, one acquisition');
      assert.strictEqual(two.store._invoke.get, 2, 'two reads');

      const one = await runFull(bodyOrphan(), { dryRun: false, verify: true }, { seed: [FACTS_KEY] });
      assert.strictEqual(one.store._access.get, 1, 'one key, one acquisition');
      assert.strictEqual(one.store._invoke.get, 1);

      const empty = await runFull(bodyWrite(), { dryRun: false, verify: true }, {
        seed: [FACTS_KEY, POINTER_KEY], throwOn: [POINTER_KEY]
      });
      assert.deepStrictEqual(empty.result.deleted, []);
      assert.strictEqual(empty.store._access.get, 0, 'empty subset must not acquire the reader');
      assert.strictEqual(empty.store._invoke.get, 0);
    });

    await test('M20 INVALID_PLAN, NOOP and DRY_RUN read no property from a hostile store', async function () {
      const validPlan = planFundFactsTeardown(bodyWrite());
      const noopPlan = { ok: true, classification: 'NOOP', keys: [], count: 0 };
      const badPlan = { ok: true, classification: 'SAFE_PAIR', keys: [FACTS_KEY], count: 1 };

      const scenarios = [
        ['DRY_RUN', validPlan, {}],
        ['DRY_RUN verify', validPlan, { verify: true }],
        ['NOOP', noopPlan, { dryRun: false, verify: true }],
        ['INVALID_PLAN mismatch', badPlan, { dryRun: false, verify: true }],
        ['INVALID_PLAN not-ok', { ok: false }, { dryRun: false }],
        ['INVALID_PLAN count', { ok: true, classification: 'SAFE_PAIR', keys: [POINTER_KEY, FACTS_KEY], count: 9 }, { dryRun: false }]
      ];
      for (let i = 0; i < scenarios.length; i++) {
        const state = { reads: [] };
        const r = await executeFundFactsTeardown(makeHostileProxyStore(state), scenarios[i][1], scenarios[i][2]);
        assert.ok(r && typeof r === 'object', scenarios[i][0] + ' returned a result');
        assert.deepStrictEqual(state.reads, [], scenarios[i][0] + ' must read no store property');
      }
    });

    await test('M21 after DELETE_ERROR the failedKey appears in no verification array', async function () {
      const run = await runFull(bodyWrite(), { dryRun: false, verify: true }, {
        seed: [FACTS_KEY, POINTER_KEY], throwOn: [FACTS_KEY]
      });
      assert.strictEqual(run.result.status, 'DELETE_ERROR');
      assert.strictEqual(run.result.failedKey, FACTS_KEY);
      const v = run.result.verification;
      [['checkedKeys', v.checkedKeys], ['absentKeys', v.absentKeys],
        ['presentKeys', v.presentKeys], ['inconclusiveKeys', v.inconclusiveKeys]].forEach(function (pair) {
        assert.strictEqual(pair[1].indexOf(FACTS_KEY), -1, 'failedKey must not appear in ' + pair[0]);
      });
      assert.deepStrictEqual(v.checkedKeys, [POINTER_KEY], 'only the confirmed-deleted key is checked');
      assert.strictEqual(run.store._getOrder.indexOf(FACTS_KEY), -1, 'failedKey was never read back');
    });

    await test('M22 verification does not short-circuit after the first present key', async function () {
      // The FIRST key reads back present; the second must still be checked.
      const run = await runFull(bodyWrite(), { dryRun: false, verify: true }, {
        seed: [FACTS_KEY, POINTER_KEY], getPresent: [POINTER_KEY]
      });
      const v = run.result.verification;
      assert.strictEqual(v.outcome, 'STILL_PRESENT');
      assert.deepStrictEqual(v.checkedKeys, [POINTER_KEY, FACTS_KEY], 'both keys checked despite an early hit');
      assert.deepStrictEqual(v.presentKeys, [POINTER_KEY]);
      assert.deepStrictEqual(v.absentKeys, [FACTS_KEY], 'the second key was still classified');
      assert.strictEqual(run.store._invoke.get, 2, 'both reads were issued');

      // Likewise, an early unreadable key must not stop the sweep.
      const early = await runFull(bodyWrite(), { dryRun: false, verify: true }, {
        seed: [FACTS_KEY, POINTER_KEY], getThrowOn: [POINTER_KEY]
      });
      assert.deepStrictEqual(early.result.verification.checkedKeys, [POINTER_KEY, FACTS_KEY]);
      assert.deepStrictEqual(early.result.verification.inconclusiveKeys, [POINTER_KEY]);
      assert.deepStrictEqual(early.result.verification.absentKeys, [FACTS_KEY]);
      assert.strictEqual(early.store._invoke.get, 2, 'both reads were issued');
    });
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
