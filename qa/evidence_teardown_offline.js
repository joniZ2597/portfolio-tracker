'use strict';

/*
 * qa/evidence_teardown_offline.js
 *
 * EG-20C Slice 2H — exact-key evidence teardown offline harness (TD-series).
 * Exercises netlify/functions/lib/evidence-teardown.js with ZERO real network /
 * Blob / Netlify env / production. The store is an in-memory delete-spy injected
 * into the executor; a throwing global.fetch guard makes any real network a hard
 * error; no @netlify/blobs handle is ever constructed and no process.env is read.
 *
 * Coverage:
 *   - planner validation (shape, max-2, malformed/broad, duplicate, one-of-each-type)
 *   - bounded metadata echo + proof that keys are NEVER reconstructed from ticker/cik
 *   - executor dry-run DEFAULT (the core safety invariant: delete only on dryRun===false)
 *   - real delete order (mapping-first), NOOP, delete-error (fail-safe stop), verify
 *   - executor re-validation of a tampered plan.keys before any delete
 *   - drift test vs the REAL cikKey()/companyKey() (+ budgetKey rejection)
 *   - static scan of the MODULE source (no env / fetch / set/setJSON / route)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { cikKey, companyKey, budgetKey } = require('../netlify/functions/lib/evidence-store');
const { planEvidenceTeardown, executeEvidenceTeardown, safeErrorName } =
  require('../netlify/functions/lib/evidence-teardown');

const ROOT = path.resolve(__dirname, '..');
const MODULE_REL = 'netlify/functions/lib/evidence-teardown.js';

// Canonical authoritative fixture (writer emits [companyKey(cik), cikKey(ticker)]).
const TICKER = 'ZORCH';
const CIK = '0001000010';
const CO = companyKey(CIK);   // secstore:v1:company:0001000010   (record)
const CK = cikKey(TICKER);    // secstore:v1:cik:ZORCH            (mapping / pointer)

// ── in-memory delete-spy store ────────────────────────────────────────────────
function makeSpyStore(opts) {
  opts = opts || {};
  const map = new Map();
  const ops = { get: 0, delete: 0 };
  const deleteOrder = [];
  if (opts.seed) { opts.seed.forEach(function (k) { map.set(k, JSON.stringify({ seeded: true })); }); }
  return {
    _map: map, _ops: ops, _deleteOrder: deleteOrder,
    get: async function (key) { ops.get += 1; return map.has(key) ? map.get(key) : null; },
    delete: async function (key) {
      ops.delete += 1;
      deleteOrder.push(key);
      if (opts.throwOn && opts.throwOn.indexOf(key) !== -1) {
        const e = new Error('delete failed');
        if (opts.throwName) { e.name = opts.throwName; }
        throw e;
      }
      if (!opts.noop) { map.delete(key); }
      return undefined;
    }
  };
}

// ── tiny runner (mirrors qa/sec_evidence_pull_endpoint_offline.js) ─────────────
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
  process.stdout.write('\n=== EG-20C Slice 2H — exact-key evidence teardown (offline) ===\n\n');

  let realFetchCalls = 0;
  const _origFetch = globalThis.fetch;
  globalThis.fetch = function () { realFetchCalls += 1; throw new Error('LIVE_NETWORK_FORBIDDEN'); };

  try {
    // ── planner: valid authoritative shape ────────────────────────────────────
    await test('TD01: plan([companyKey, cikKey]) -> ok; keys [cikKey, companyKey]; count 2; metadata echoed', function () {
      const p = planEvidenceTeardown({ writtenKeys: [CO, CK], ticker: TICKER, cik: CIK });
      assert.strictEqual(p.ok, true);
      assert.deepStrictEqual(p.keys, [CK, CO], 'delete order must be mapping-first (reverse of write order)');
      assert.strictEqual(p.count, 2);
      assert.deepStrictEqual(p.metadata, { ticker: TICKER, cik: CIK });
    });

    await test('TD02: plan([companyKey]) partial -> ok; keys [companyKey]; count 1', function () {
      const p = planEvidenceTeardown({ writtenKeys: [CO], ticker: TICKER, cik: CIK });
      assert.strictEqual(p.ok, true);
      assert.deepStrictEqual(p.keys, [CO]);
      assert.strictEqual(p.count, 1);
    });

    await test('TD03: plan([]) empty -> ok; keys []; count 0 (NOOP-eligible)', function () {
      const p = planEvidenceTeardown({ writtenKeys: [] });
      assert.strictEqual(p.ok, true);
      assert.deepStrictEqual(p.keys, []);
      assert.strictEqual(p.count, 0);
    });

    await test('TD04: writtenKeys not an array -> WRITTEN_KEYS_INVALID', function () {
      [undefined, null, 'str', 42, {}, true].forEach(function (bad) {
        const p = planEvidenceTeardown({ writtenKeys: bad });
        assert.strictEqual(p.ok, false, 'input ' + JSON.stringify(bad));
        assert.strictEqual(p.reason, 'WRITTEN_KEYS_INVALID', 'input ' + JSON.stringify(bad));
      });
      // whole input missing -> writtenKeys is undefined -> same reason
      assert.strictEqual(planEvidenceTeardown(undefined).reason, 'WRITTEN_KEYS_INVALID');
    });

    await test('TD05: > 2 keys -> TOO_MANY_KEYS', function () {
      const p = planEvidenceTeardown({ writtenKeys: [CO, CK, cikKey('AAPL')] });
      assert.strictEqual(p.ok, false);
      assert.strictEqual(p.reason, 'TOO_MANY_KEYS');
    });

    await test('TD06: malformed / broad / non-string keys -> KEY_MALFORMED', function () {
      const bad = [
        budgetKey('AAPL'),                    // secstore:v1:budget:AAPL — off-allowlist namespace
        'secstore:v1:company:',               // namespace-only broad (no cik)
        'secstore:v1:cik:',                   // namespace-only broad (no ticker)
        'secstore:v1:',                       // bare namespace
        'secstore:v1:cik:aapl',               // lowercase ticker
        'secstore:v1:cik:TOOLONGTICKER',      // 13-char ticker (> 10)
        'secstore:v1:company:12345',          // short cik (< 10 digits)
        'secstore:v1:company:00003201931',    // 11-digit cik
        'secstore:v1:company:0001000010:x',   // trailing suffix (anchors reject)
        ' secstore:v1:cik:ZORCH',             // leading space
        'SECSTORE:v1:company:0001000010',     // wrong-case namespace
        42, null, {}, [], undefined           // non-strings
      ];
      bad.forEach(function (k) {
        const p = planEvidenceTeardown({ writtenKeys: [k] });
        assert.strictEqual(p.ok, false, 'key ' + JSON.stringify(k) + ' should be rejected');
        assert.strictEqual(p.reason, 'KEY_MALFORMED', 'key ' + JSON.stringify(k));
      });
    });

    await test('TD07: exact-duplicate key -> DUPLICATE_KEY', function () {
      const p = planEvidenceTeardown({ writtenKeys: [CO, CO] });
      assert.strictEqual(p.ok, false);
      assert.strictEqual(p.reason, 'DUPLICATE_KEY');
    });

    await test('TD08: two keys of the SAME type -> DUPLICATE_KEY', function () {
      const twoCompany = planEvidenceTeardown({ writtenKeys: [companyKey('0000000001'), companyKey('0000000002')] });
      assert.strictEqual(twoCompany.reason, 'DUPLICATE_KEY', 'two company keys');
      const twoCik = planEvidenceTeardown({ writtenKeys: [cikKey('AAA'), cikKey('BBB')] });
      assert.strictEqual(twoCik.reason, 'DUPLICATE_KEY', 'two cik keys');
    });

    await test('TD09: metadata echo is bounded (canonical shape or null)', function () {
      assert.deepStrictEqual(planEvidenceTeardown({ writtenKeys: [], ticker: 'aapl', cik: '123' }).metadata,
        { ticker: null, cik: null }, 'lowercase ticker + short cik -> null');
      assert.deepStrictEqual(planEvidenceTeardown({ writtenKeys: [], ticker: 'TOOLONGTICKER', cik: 12345 }).metadata,
        { ticker: null, cik: null }, 'over-long ticker + non-string cik -> null');
      assert.deepStrictEqual(planEvidenceTeardown({ writtenKeys: [], ticker: 'AAPL', cik: '0000320193' }).metadata,
        { ticker: 'AAPL', cik: '0000320193' }, 'canonical values echoed');
      assert.deepStrictEqual(planEvidenceTeardown({ writtenKeys: [] }).metadata,
        { ticker: null, cik: null }, 'absent ticker/cik -> null');
    });

    await test('TD10: keys are NEVER reconstructed from ticker/cik (authoritative writtenKeys only)', function () {
      // writtenKeys names ZORCH only; ticker/cik point elsewhere. Keys must ignore them.
      const p = planEvidenceTeardown({ writtenKeys: [CK], ticker: 'AAPL', cik: '9999999999' });
      assert.strictEqual(p.ok, true);
      assert.deepStrictEqual(p.keys, [CK], 'keys must derive solely from writtenKeys');
      assert.deepStrictEqual(p.metadata, { ticker: 'AAPL', cik: '9999999999' }, 'metadata echoes but does not leak into keys');
    });

    // ── executor: DRY-RUN is the DEFAULT (core safety invariant) ───────────────
    await test('TD11: execute(store, plan) with NO opts -> DRY_RUN; zero deletes', async function () {
      const store = makeSpyStore({ seed: [CO, CK] });
      const plan = planEvidenceTeardown({ writtenKeys: [CO, CK] });
      const r = await executeEvidenceTeardown(store, plan);
      assert.strictEqual(r.status, 'DRY_RUN');
      assert.strictEqual(r.dryRun, true);
      assert.deepStrictEqual(r.plannedDeletes, [CK, CO]);
      assert.strictEqual(store._ops.delete, 0, 'dry-run must not call store.delete');
      assert.strictEqual(store._map.size, 2, 'dry-run must not mutate the store');
    });

    await test('TD12: execute with opts:{} -> DRY_RUN; zero deletes', async function () {
      const store = makeSpyStore({ seed: [CO, CK] });
      const plan = planEvidenceTeardown({ writtenKeys: [CO, CK] });
      const r = await executeEvidenceTeardown(store, plan, {});
      assert.strictEqual(r.status, 'DRY_RUN');
      assert.strictEqual(store._ops.delete, 0);
    });

    await test('TD13: execute with {dryRun:true} -> DRY_RUN; zero deletes', async function () {
      const store = makeSpyStore({ seed: [CO, CK] });
      const plan = planEvidenceTeardown({ writtenKeys: [CO, CK] });
      const r = await executeEvidenceTeardown(store, plan, { dryRun: true });
      assert.strictEqual(r.status, 'DRY_RUN');
      assert.strictEqual(store._ops.delete, 0);
    });

    await test('TD14: only strict dryRun===false deletes; truthy/"false"/0/null stay dry', async function () {
      const plan = planEvidenceTeardown({ writtenKeys: [CO, CK] });
      for (const v of ['false', 0, 1, null, undefined, 'no', {}]) {
        const store = makeSpyStore({ seed: [CO, CK] });
        const r = await executeEvidenceTeardown(store, plan, { dryRun: v });
        assert.strictEqual(r.status, 'DRY_RUN', 'dryRun=' + JSON.stringify(v) + ' must stay dry');
        assert.strictEqual(store._ops.delete, 0, 'dryRun=' + JSON.stringify(v) + ' must not delete');
      }
    });

    await test('TD15: {dryRun:false} -> DELETED; store.delete order is [cikKey, companyKey] (mapping-first)', async function () {
      const store = makeSpyStore({ seed: [CO, CK] });
      const plan = planEvidenceTeardown({ writtenKeys: [CO, CK] });
      const r = await executeEvidenceTeardown(store, plan, { dryRun: false });
      assert.strictEqual(r.status, 'DELETED');
      assert.strictEqual(r.dryRun, false);
      assert.deepStrictEqual(r.deleted, [CK, CO]);
      assert.deepStrictEqual(store._deleteOrder, [CK, CO], 'DELETE ORDER: [companyKey, cikKey] deletes [cikKey, companyKey]');
      assert.strictEqual(store._map.size, 0, 'both canonical keys removed');
      assert.strictEqual(store._ops.delete, 2);
    });

    await test('TD16: partial [companyKey] real delete -> DELETED [companyKey]; order [companyKey]', async function () {
      const store = makeSpyStore({ seed: [CO] });
      const plan = planEvidenceTeardown({ writtenKeys: [CO] });
      const r = await executeEvidenceTeardown(store, plan, { dryRun: false });
      assert.strictEqual(r.status, 'DELETED');
      assert.deepStrictEqual(r.deleted, [CO]);
      assert.deepStrictEqual(store._deleteOrder, [CO]);
    });

    await test('TD17: empty plan -> NOOP (dry AND real); zero store.delete', async function () {
      const plan = planEvidenceTeardown({ writtenKeys: [] });
      const s1 = makeSpyStore({});
      const dry = await executeEvidenceTeardown(s1, plan);
      assert.strictEqual(dry.status, 'NOOP');
      assert.deepStrictEqual(dry.deleted, []);
      assert.strictEqual(s1._ops.delete, 0);
      const s2 = makeSpyStore({});
      const real = await executeEvidenceTeardown(s2, plan, { dryRun: false });
      assert.strictEqual(real.status, 'NOOP');
      assert.strictEqual(s2._ops.delete, 0);
    });

    // ── executor: delete error (fail-safe stop) ────────────────────────────────
    await test('TD18: delete throws on the RECORD (2nd) -> DELETE_ERROR; mapping already gone; sanitized name', async function () {
      const store = makeSpyStore({ seed: [CO, CK], throwOn: [CO] });
      const plan = planEvidenceTeardown({ writtenKeys: [CO, CK] });
      const r = await executeEvidenceTeardown(store, plan, { dryRun: false });
      assert.strictEqual(r.status, 'DELETE_ERROR');
      assert.strictEqual(r.dryRun, false);
      assert.deepStrictEqual(r.deleted, [CK], 'mapping deleted before the record failed (safe direction)');
      assert.strictEqual(r.failedKey, CO);
      assert.strictEqual(r.errorName, 'Error');
      assert.strictEqual(store._map.has(CK), false, 'mapping actually removed');
      assert.strictEqual(store._map.has(CO), true, 'record survives its failed delete');
    });

    await test('TD19: delete throws on the MAPPING (1st) -> DELETE_ERROR; nothing deleted', async function () {
      const store = makeSpyStore({ seed: [CO, CK], throwOn: [CK] });
      const plan = planEvidenceTeardown({ writtenKeys: [CO, CK] });
      const r = await executeEvidenceTeardown(store, plan, { dryRun: false });
      assert.strictEqual(r.status, 'DELETE_ERROR');
      assert.deepStrictEqual(r.deleted, []);
      assert.strictEqual(r.failedKey, CK);
      assert.strictEqual(store._ops.delete, 1, 'stops at first failure — no further deletes');
    });

    await test('TD20: errorName is fixed-vocabulary (allowlisted pass-through; unknown -> UnknownError)', async function () {
      const known = makeSpyStore({ seed: [CK], throwOn: [CK], throwName: 'BlobsInternalError' });
      const rk = await executeEvidenceTeardown(known, planEvidenceTeardown({ writtenKeys: [CK] }), { dryRun: false });
      assert.strictEqual(rk.errorName, 'BlobsInternalError');
      const unknown = makeSpyStore({ seed: [CK], throwOn: [CK], throwName: 'WeirdCustomError' });
      const ru = await executeEvidenceTeardown(unknown, planEvidenceTeardown({ writtenKeys: [CK] }), { dryRun: false });
      assert.strictEqual(ru.errorName, 'UnknownError');
      // direct unit: safeErrorName never throws and never echoes message/stack
      assert.strictEqual(safeErrorName({ name: 'TypeError' }), 'TypeError');
      assert.strictEqual(safeErrorName({ name: 'nope' }), 'UnknownError');
      assert.strictEqual(safeErrorName(null), 'UnknownError');
      assert.strictEqual(safeErrorName({ get name() { throw new Error('hostile'); } }), 'UnknownError');
    });

    // ── executor: verify (opt-in read-back) ────────────────────────────────────
    await test('TD21: verify:true with a real removing store -> DELETED verified:true', async function () {
      const store = makeSpyStore({ seed: [CO, CK] });
      const plan = planEvidenceTeardown({ writtenKeys: [CO, CK] });
      const r = await executeEvidenceTeardown(store, plan, { dryRun: false, verify: true });
      assert.strictEqual(r.status, 'DELETED');
      assert.strictEqual(r.verified, true);
      assert.ok(store._ops.get >= 2, 'verify read each deleted key back');
    });

    await test('TD22: verify:true when delete is a NO-OP (keys remain) -> verified:false', async function () {
      const store = makeSpyStore({ seed: [CO, CK], noop: true });
      const plan = planEvidenceTeardown({ writtenKeys: [CO, CK] });
      const r = await executeEvidenceTeardown(store, plan, { dryRun: false, verify: true });
      assert.strictEqual(r.status, 'DELETED');
      assert.strictEqual(r.verified, false, 'read-back still finds a key -> not verified');
    });

    await test('TD23: verify:true when store lacks get() -> verified:false (cannot confirm)', async function () {
      const store = { delete: async function () { return undefined; } };
      const plan = planEvidenceTeardown({ writtenKeys: [CK] });
      const r = await executeEvidenceTeardown(store, plan, { dryRun: false, verify: true });
      assert.strictEqual(r.status, 'DELETED');
      assert.strictEqual(r.verified, false);
    });

    // ── executor: invalid / tampered plan (re-validation before any I/O) ───────
    await test('TD24: plan.ok !== true -> INVALID_PLAN/PLAN_NOT_OK; zero store.delete', async function () {
      const store = makeSpyStore({ seed: [CO, CK] });
      const r = await executeEvidenceTeardown(store, { ok: false, reason: 'X' }, { dryRun: false });
      assert.strictEqual(r.status, 'INVALID_PLAN');
      assert.strictEqual(r.reason, 'PLAN_NOT_OK');
      assert.strictEqual(store._ops.delete, 0);
    });

    await test('TD25: non-object plan -> INVALID_PLAN', async function () {
      for (const bad of [null, undefined, 'str', 42, []]) {
        const r = await executeEvidenceTeardown(makeSpyStore({}), bad, { dryRun: false });
        assert.strictEqual(r.status, 'INVALID_PLAN', 'plan ' + JSON.stringify(bad));
      }
    });

    await test('TD26: tampered plan with 3 keys -> INVALID_PLAN/TOO_MANY_KEYS; zero delete', async function () {
      const store = makeSpyStore({ seed: [CO, CK] });
      const tampered = { ok: true, keys: [CO, CK, cikKey('AAPL')], count: 3 };
      const r = await executeEvidenceTeardown(store, tampered, { dryRun: false });
      assert.strictEqual(r.status, 'INVALID_PLAN');
      assert.strictEqual(r.reason, 'TOO_MANY_KEYS');
      assert.strictEqual(store._ops.delete, 0);
    });

    await test('TD27: tampered plan with a broad key -> INVALID_PLAN/KEY_MALFORMED; zero delete', async function () {
      const store = makeSpyStore({ seed: [CO] });
      const r = await executeEvidenceTeardown(store, { ok: true, keys: ['secstore:v1:'] }, { dryRun: false });
      assert.strictEqual(r.status, 'INVALID_PLAN');
      assert.strictEqual(r.reason, 'KEY_MALFORMED');
      assert.strictEqual(store._ops.delete, 0);
    });

    await test('TD28: tampered plan with duplicate keys -> INVALID_PLAN/DUPLICATE_KEY', async function () {
      const store = makeSpyStore({ seed: [CO] });
      const r = await executeEvidenceTeardown(store, { ok: true, keys: [CO, CO] }, { dryRun: false });
      assert.strictEqual(r.status, 'INVALID_PLAN');
      assert.strictEqual(r.reason, 'DUPLICATE_KEY');
      assert.strictEqual(store._ops.delete, 0);
    });

    await test('TD29: real delete but store has no delete() -> INVALID_PLAN/STORE_UNAVAILABLE (no throw)', async function () {
      const plan = planEvidenceTeardown({ writtenKeys: [CK] });
      const r = await executeEvidenceTeardown({ get: async function () { return null; } }, plan, { dryRun: false });
      assert.strictEqual(r.status, 'INVALID_PLAN');
      assert.strictEqual(r.reason, 'STORE_UNAVAILABLE');
    });

    await test('TD30: executor re-orders a mis-ordered tampered plan -> still deletes mapping-first', async function () {
      const store = makeSpyStore({ seed: [CO, CK] });
      // record-first (wrong) order in the plan; executor must NOT trust it blindly
      const r = await executeEvidenceTeardown(store, { ok: true, keys: [CO, CK] }, { dryRun: false });
      assert.strictEqual(r.status, 'DELETED');
      assert.deepStrictEqual(store._deleteOrder, [CK, CO], 'executor revalidation restores mapping-first order');
    });

    // ── drift test vs the REAL key builders ────────────────────────────────────
    await test('TD31: DRIFT — real cikKey()/companyKey() accepted; budgetKey() rejected', function () {
      const p = planEvidenceTeardown({ writtenKeys: [companyKey(CIK), cikKey(TICKER)] });
      assert.strictEqual(p.ok, true, 'the module allowlist must accept real writer output');
      assert.deepStrictEqual(p.keys, [cikKey(TICKER), companyKey(CIK)],
        'allowlist regex must stay in lockstep with cikKey()/companyKey()');
      // budget keys are a real off-allowlist namespace from the same module -> rejected
      assert.strictEqual(planEvidenceTeardown({ writtenKeys: [budgetKey(TICKER)] }).reason, 'KEY_MALFORMED',
        'teardown must never touch budget keys');
    });

    // ── static scan of the MODULE source (no env / fetch / set / route) ────────
    await test('TD32: module source static-safe (no env / fetch / store.set|setJSON / route / blobs / require)', function () {
      const raw = fs.readFileSync(path.join(ROOT, MODULE_REL), 'utf8');
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' '); // strip comments
      assert.ok(!/process\.env/.test(code), 'no process.env');
      assert.ok(!/\bfetch\s*\(/.test(code), 'no fetch(');
      assert.ok(!/\bstore\.(set|setJSON)\s*\(/.test(code), 'no store.set / setJSON');
      assert.ok(!/exports\.handler|export\s+default|export\s+const\s+config|withLambda/.test(code), 'no route/handler export');
      assert.ok(!/@netlify\/blobs|getStore/.test(code), 'no blobs handle / getStore');
      assert.ok(!/\brequire\s*\(/.test(code), 'pure injected-only: no require()');
      assert.ok(!/\.mjs/.test(raw), 'no .mjs reference');
      assert.strictEqual((code.match(/module\.exports/g) || []).length, 1, 'exactly one module.exports');
      assert.ok(/\bstore\.delete\s*\(/.test(code), 'exact-key delete is the intended surface');
    });

    // ── behavioral: zero real network across the whole suite ───────────────────
    await test('TD33: zero real global.fetch across the suite', function () {
      assert.strictEqual(realFetchCalls, 0, 'the real global.fetch must never be called');
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
