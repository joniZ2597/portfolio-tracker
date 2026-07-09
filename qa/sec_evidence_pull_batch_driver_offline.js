'use strict';

/*
 * qa/sec_evidence_pull_batch_driver_offline.js
 *
 * EG-20D-1 — batch pull driver semantics offline harness (BD-series).
 *
 * Proves the owner-ratified batch policy (D1–D6): a batch portfolio evidence
 * pull is a CLIENT/OWNER-side sequential loop of single-ticker POSTs against the
 * EXISTING sec-evidence-pull endpoint — no server-side batch surface exists or
 * is added. runBatchPull() — promoted VERBATIM in EG-21C-1 (owner decision
 * D-C1: repoint) to netlify/functions/lib/batch-pull-driver.js and imported
 * below — is the reference implementation of the loop policy the live runbook
 * mirrors:
 *
 *   validate the WHOLE list first (strict /^[A-Z]{1,10}$/, fail-closed-loud)
 *     -> dedupe (default on) -> cap (<= 25, the server allowlist ceiling)
 *     -> sequential single-ticker calls -> per-ticker ledger entry
 *     -> STOP on any non-continue outcome; continue ONLY on the exact
 *        (status, reason) pairs 200 WRITE · 200 SKIPPED/ALREADY_SEEDED ·
 *        200 NO_EVIDENCE/NO_EVIDENCE · 200 NO_EVIDENCE/NO_CIK — never on a
 *        status family alone (D3, Codex re-review: reason-aware).
 *
 * The driver was harness-local through EG-20D-1 and now lives in the pure
 * dormant lib (EG-21C-1). It still wires no route and never touches
 * pullAndPersistPortfolio (BD11 pins both facts by scanning the TARGET
 * production files — never this harness itself — and additionally pins the
 * promoted lib's rule literals against the harness drift pins).
 *
 * Isolation (EP-series house pattern):
 *   - throwing global.fetch guard: any real network is a hard error; the
 *     provider only ever sees the INJECTED fetch (event._testProviderOptions).
 *   - the store is an in-memory Map (op spy) injected via event._testStore;
 *     no @netlify/blobs handle is ever constructed.
 *   - gates/tokens/UA/allowlist live on process.env IN-PROCESS ONLY and are
 *     snapshot/restored around the suite; no Netlify env is touched.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { cikKey, companyKey, budgetKey } = require('../netlify/functions/lib/evidence-store');
const { planEvidenceTeardown, executeEvidenceTeardown } = require('../netlify/functions/lib/evidence-teardown');

const ROOT = path.resolve(__dirname, '..');
const CORE_REL = 'netlify/functions/lib/sec-evidence-pull-core.js';
const ORCH_REL = 'netlify/functions/lib/evidence-pull-orchestrator.js';
const MJS_REL = 'netlify/functions/sec-evidence-pull.mjs';

const EP = require('../netlify/functions/lib/sec-evidence-pull-core');

// ── env key names + good values (in-process only; mirrors the EP suite) ───────
const PULL_GATE   = 'PT_ENABLE_SEC_EVIDENCE_PULL_SERVER';
const WRITER_GATE = 'PT_ENABLE_SEC_EVIDENCE_STORE_WRITER_SERVER';
const PULL_TOKEN  = 'PT_SEC_EVIDENCE_PULL_TOKEN';
const WRITE_TOKEN = 'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN';
const UA_KEY      = 'SEC_USER_AGENT';
const ALLOW_KEY   = 'PT_SEC_EVIDENCE_PULL_ALLOWED_TICKERS';
const ENV_KEYS = [PULL_GATE, WRITER_GATE, PULL_TOKEN, WRITE_TOKEN, UA_KEY, ALLOW_KEY];

const GOOD_PULL  = 'pull-token-bd-1111';
const GOOD_WRITE = 'write-token-bd-2222';
const GOOD_UA    = 'PulseEG20D1Test/1.0 qa@example.com';
const GOOD_AUTH  = 'Bearer ' + GOOD_PULL;

function setEnv(name, value) { if (value === undefined) { delete process.env[name]; } else { process.env[name] = value; } }
function clearAllEnv() { ENV_KEYS.forEach(function (k) { delete process.env[k]; }); }
function fullValidEnv(allow) {
  setEnv(PULL_GATE, 'true');
  setEnv(WRITER_GATE, 'true');
  setEnv(PULL_TOKEN, GOOD_PULL);
  setEnv(WRITE_TOKEN, GOOD_WRITE);
  setEnv(UA_KEY, GOOD_UA);
  setEnv(ALLOW_KEY, allow || 'ZALPHA, ZBRAVO, ZCHARL');
}
function authHdr() { return { authorization: GOOD_AUTH }; }

// ── batch driver under test (PROMOTED — EG-21C-1, owner decision D-C1) ────────
// The reference implementation of the D2/D3 policy now lives in the pure
// dormant lib netlify/functions/lib/batch-pull-driver.js; this harness imports
// it UNCHANGED. callFn(ticker) -> Promise<{ statusCode, body }>.
// Result: { ok:false, reason, ledger:[] }                       — rejected pre-call
//       | { ok:true, complete:true, ledger }                    — every ticker ran
//       | { ok:true, complete:false, stoppedAt, stopStatus, stopReason, ledger }
const { runBatchPull } = require('../netlify/functions/lib/batch-pull-driver');
const LIB_REL = 'netlify/functions/lib/batch-pull-driver.js';

// Harness drift pins (asserted against the lib source + values in BD11): the
// promoted lib must keep the ratified rule constants verbatim —
// BATCH_TICKER_RE = /^[A-Z]{1,10}$/ and MAX_BATCH_TICKERS = 25.
const BATCH_TICKER_RE = /^[A-Z]{1,10}$/;
const MAX_BATCH_TICKERS = 25; // == the server allowlist distinct-ticker ceiling

// ── endpoint invocation helpers (mirrors the EP suite) ────────────────────────
async function invoke(method, opts) {
  opts = opts || {};
  const event = { httpMethod: method, headers: opts.headers || {} };
  if (Object.prototype.hasOwnProperty.call(opts, 'body')) {
    event.body = (opts.body === undefined || typeof opts.body === 'string') ? opts.body : JSON.stringify(opts.body);
  }
  if (opts.store !== undefined) { event._testStore = opts.store; }
  if (opts.providerOptions !== undefined) { event._testProviderOptions = opts.providerOptions; }
  const r = await EP.handler(event);
  return { statusCode: r.statusCode, body: (r.body !== undefined ? JSON.parse(r.body) : undefined) };
}

// makeCall binds one shared store + provider fixture to a per-ticker callFn and
// counts calls (proves "later tickers never called" after a stop).
function makeCall(store, spy) {
  const counter = { calls: 0 };
  const fn = async function (ticker) {
    counter.calls += 1;
    return invoke('POST', {
      headers: authHdr(),
      body: { ticker: ticker },
      store: store,
      providerOptions: providerOpts(spy, { SEC_USER_AGENT: GOOD_UA })
    });
  };
  return { fn: fn, counter: counter };
}

// ── injected fetch over SEC fixtures (EP suite shapes) ────────────────────────
function jsonResponse(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status: status, headers: { get: function () { return null; } }, text: async function () { return text; } };
}
function makeFetch(routes) {
  const spy = { calls: [] };
  spy.fn = async function (url) {
    const u = String(url);
    spy.calls.push(u);
    for (let i = 0; i < routes.length; i++) {
      if (u.indexOf(routes[i].match) !== -1) {
        if (routes[i].throwErr) { throw new Error(routes[i].throwErr); }
        return routes[i].respond;
      }
    }
    return jsonResponse(404, {}); // unmatched (incl. concept URLs) -> filing-only
  };
  return spy;
}
function providerOpts(spy, env) { return { fetch: spy.fn, env: env, spacingMs: 0 }; }

function tickersJsonOf(rows) {
  const o = {};
  rows.forEach(function (r, i) { o[String(i)] = { cik_str: r.cikStr, ticker: r.ticker, title: r.title }; });
  return o;
}
function submissions10Q(cikStr, accession, filingDate, reportDate, primaryDoc) {
  return {
    cik: String(cikStr),
    filings: { recent: {
      form: ['10-Q'], filingDate: [filingDate], accessionNumber: [accession],
      primaryDocument: [primaryDoc], reportDate: [reportDate]
    } }
  };
}

function submissionsNo10Q(cikStr, accession) {
  return {
    cik: String(cikStr),
    filings: { recent: {
      form: ['8-K'], filingDate: ['2026-01-05'], accessionNumber: [accession],
      primaryDocument: ['x.htm'], reportDate: ['2025-12-31']
    } }
  };
}

// Three unseeded batch tickers with a valid latest 10-Q, plus ZDELTA (CIK
// resolves, no 10-Q -> NO_EVIDENCE). ZNOCIK is used allowlisted-but-absent
// from this universe (no CIK mapping -> NO_CIK).
const UNIVERSE_BATCH = {
  tickersJson: tickersJsonOf([
    { cikStr: 1000021, ticker: 'ZALPHA', title: 'Zalpha Test Co' },
    { cikStr: 1000022, ticker: 'ZBRAVO', title: 'Zbravo Test Co' },
    { cikStr: 1000023, ticker: 'ZCHARL', title: 'Zcharl Test Co' },
    { cikStr: 1000024, ticker: 'ZDELTA', title: 'Zdelta Test Co (no 10-Q)' }
  ]),
  submissionsByPaddedCik: {
    '0001000021': submissions10Q(1000021, '0001000021-26-000021', '2026-02-10', '2025-12-27', 'zalpha-20251227.htm'),
    '0001000022': submissions10Q(1000022, '0001000022-26-000022', '2026-02-11', '2025-12-27', 'zbravo-20251227.htm'),
    '0001000023': submissions10Q(1000023, '0001000023-26-000023', '2026-02-12', '2025-12-27', 'zcharl-20251227.htm'),
    '0001000024': submissionsNo10Q(1000024, '0001000024-26-000024')
  }
};
function routesForUniverse(universe, extraRoutes) {
  const routes = (extraRoutes || []).slice();
  routes.push({ match: 'company_tickers.json', respond: jsonResponse(200, universe.tickersJson) });
  Object.keys(universe.submissionsByPaddedCik).forEach(function (paddedCik) {
    routes.push({ match: 'submissions/CIK' + paddedCik, respond: jsonResponse(200, universe.submissionsByPaddedCik[paddedCik]) });
  });
  return routes;
}

// ── in-memory store modelling create-only Blob semantics (+ op spy) ───────────
function makeMemStore() {
  const map = new Map();
  const ops = { get: 0, set: 0 };
  return {
    _map: map, _ops: ops,
    get: async function (key) { ops.get += 1; return map.has(key) ? map.get(key) : null; },
    set: async function (key, value, o) {
      ops.set += 1;
      if (o && o.onlyIfNew === true && map.has(key)) { return { modified: false }; }
      map.set(key, value);
      return { modified: true };
    }
  };
}

const EXPECT_KEYS = {
  ZALPHA: [companyKey('0001000021'), cikKey('ZALPHA')],
  ZBRAVO: [companyKey('0001000022'), cikKey('ZBRAVO')],
  ZCHARL: [companyKey('0001000023'), cikKey('ZCHARL')]
};

// ── tiny runner (mirrors the EP suite) ────────────────────────────────────────
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
  process.stdout.write('\n=== EG-20D-1 — Batch pull driver semantics (client-loop, offline) ===\n\n');

  const snapshot = {};
  ENV_KEYS.forEach(function (k) { snapshot[k] = process.env[k]; });

  let realFetchCalls = 0;
  const _origFetch = globalThis.fetch;
  globalThis.fetch = function () { realFetchCalls += 1; throw new Error('LIVE_NETWORK_FORBIDDEN'); };

  try {
    // ── BD01: two unseeded tickers -> both WRITE; complete; per-ticker keys ────
    await test('BD01: two unseeded tickers -> both 200 WRITE; complete ledger with verbatim writtenKeys', async function () {
      fullValidEnv();
      const store = makeMemStore();
      const spy = makeFetch(routesForUniverse(UNIVERSE_BATCH));
      const call = makeCall(store, spy);
      const out = await runBatchPull(['ZALPHA', 'ZBRAVO'], call.fn);
      assert.strictEqual(out.ok, true);
      assert.strictEqual(out.complete, true);
      assert.strictEqual(out.ledger.length, 2);
      assert.strictEqual(call.counter.calls, 2);
      const tickers = ['ZALPHA', 'ZBRAVO'];
      for (let i = 0; i < 2; i++) {
        const e = out.ledger[i];
        assert.strictEqual(e.ticker, tickers[i], 'ledger order preserved');
        assert.strictEqual(e.statusCode, 200, e.ticker + ' statusCode');
        assert.strictEqual(e.status, 'WRITE', e.ticker + ' status');
        assert.deepStrictEqual(e.writtenKeys, EXPECT_KEYS[e.ticker], e.ticker + ' writtenKeys verbatim [companyKey, cikKey]');
        e.writtenKeys.forEach(function (k) {
          assert.ok(/^secstore:v1:(company:\d{10}|cik:[A-Z]{1,10})$/.test(k), 'canonical key shape: ' + k);
        });
      }
      assert.strictEqual(store._map.size, 4, 'exactly two record pairs written');
    });

    // ── BD02: same-run duplicate -> WRITE then SKIPPED; dedupe removes it ──────
    await test('BD02: duplicate ticker (dedupe off) -> WRITE then SKIPPED, one record pair; default dedupe -> one call', async function () {
      fullValidEnv();
      const store = makeMemStore();
      const spy = makeFetch(routesForUniverse(UNIVERSE_BATCH));
      const call = makeCall(store, spy);
      const out = await runBatchPull(['ZALPHA', 'ZALPHA'], call.fn, { dedupe: false });
      assert.strictEqual(out.complete, true);
      assert.strictEqual(out.ledger.length, 2);
      assert.strictEqual(out.ledger[0].status, 'WRITE');
      assert.deepStrictEqual(out.ledger[1], { ticker: 'ZALPHA', statusCode: 200, status: 'SKIPPED', reason: 'ALREADY_SEEDED' },
        'second hit must be the create-only skip, never a double write');
      assert.strictEqual(store._map.size, 2, 'exactly one record pair despite the duplicate');

      const store2 = makeMemStore();
      const call2 = makeCall(store2, makeFetch(routesForUniverse(UNIVERSE_BATCH)));
      const out2 = await runBatchPull(['ZALPHA', 'ZALPHA'], call2.fn); // default dedupe on
      assert.strictEqual(out2.complete, true);
      assert.strictEqual(out2.ledger.length, 1, 'default dedupe collapses the duplicate pre-call');
      assert.strictEqual(call2.counter.calls, 1);
    });

    // ── BD03: pre-seeded ticker -> SKIPPED, zero fetches for it, batch continues ─
    await test('BD03: pre-seeded ticker -> SKIPPED with zero provider fetches for it; batch continues', async function () {
      fullValidEnv();
      const store = makeMemStore();
      store._map.set(cikKey('ZALPHA'), JSON.stringify({ cik: '0001000021' }));
      store._map.set(companyKey('0001000021'), JSON.stringify({ evidenceItems: [] }));
      const spy = makeFetch(routesForUniverse(UNIVERSE_BATCH));
      const call = makeCall(store, spy);
      const out = await runBatchPull(['ZALPHA', 'ZBRAVO'], call.fn);
      assert.strictEqual(out.complete, true);
      assert.deepStrictEqual(out.ledger[0], { ticker: 'ZALPHA', statusCode: 200, status: 'SKIPPED', reason: 'ALREADY_SEEDED' });
      assert.strictEqual(out.ledger[1].status, 'WRITE');
      assert.deepStrictEqual(out.ledger[1].writtenKeys, EXPECT_KEYS.ZBRAVO);
      const zalphaFetches = spy.calls.filter(function (u) { return u.indexOf('0001000021') !== -1; });
      assert.strictEqual(zalphaFetches.length, 0, 'the seeded ticker must never reach SEC (strong pre-read skip)');
    });

    // ── BD04: non-allowlisted mid-list -> 403 stops; earlier ledger intact ─────
    await test('BD04: non-allowlisted ticker mid-list -> 403 stop; earlier writtenKeys intact; later ticker never called', async function () {
      fullValidEnv('ZALPHA, ZBRAVO'); // ZZZZ valid-shaped but absent
      const store = makeMemStore();
      const call = makeCall(store, makeFetch(routesForUniverse(UNIVERSE_BATCH)));
      const out = await runBatchPull(['ZALPHA', 'ZZZZ', 'ZBRAVO'], call.fn);
      assert.strictEqual(out.complete, false);
      assert.strictEqual(out.stoppedAt, 'ZZZZ');
      assert.strictEqual(out.stopStatus, 'TICKER_NOT_ALLOWED');
      assert.strictEqual(out.ledger.length, 2);
      assert.strictEqual(out.ledger[1].statusCode, 403);
      assert.deepStrictEqual(out.ledger[0].writtenKeys, EXPECT_KEYS.ZALPHA, 'completed WRITE ledger survives the stop');
      assert.strictEqual(call.counter.calls, 2, 'ZBRAVO must never be called after the stop');
      assert.strictEqual(store._map.size, 2, 'only the pre-stop ticker wrote');
    });

    // ── BD05: provider throw on ticker 2 of 3 -> 502 stop; ledger intact ───────
    await test('BD05: provider throws on ticker 2 of 3 -> 502 PROVIDER_FAILURE stop; ticker 1 keys retained; ticker 3 never called', async function () {
      fullValidEnv();
      const store = makeMemStore();
      const spy = makeFetch(routesForUniverse(UNIVERSE_BATCH, [
        { match: 'submissions/CIK0001000022', throwErr: 'SIMULATED_SEC_NETWORK_FAILURE' }
      ]));
      const call = makeCall(store, spy);
      const out = await runBatchPull(['ZALPHA', 'ZBRAVO', 'ZCHARL'], call.fn);
      assert.strictEqual(out.complete, false);
      assert.strictEqual(out.stoppedAt, 'ZBRAVO');
      assert.strictEqual(out.ledger.length, 2);
      assert.deepStrictEqual(out.ledger[0].writtenKeys, EXPECT_KEYS.ZALPHA, 'independent per-call response keeps ticker 1 keys');
      assert.strictEqual(out.ledger[1].statusCode, 502);
      assert.strictEqual(out.ledger[1].status, 'ERROR');
      assert.strictEqual(out.ledger[1].reason, 'PROVIDER_FAILURE');
      assert.strictEqual(out.ledger[1].writtenKeys, undefined, 'a failed pull reports no keys');
      assert.strictEqual(call.counter.calls, 2, 'SEC politeness: stop, do not hammer the remaining list');
      assert.strictEqual(store._map.size, 2, 'only ticker 1 wrote');
    });

    // ── BD06: store DEGRADED pre-read -> stop before SEC; zero fetches ─────────
    await test('BD06: store DEGRADED pre-read -> 200 DEGRADED stop; zero provider fetches; no write attempted', async function () {
      fullValidEnv();
      const spy = makeFetch(routesForUniverse(UNIVERSE_BATCH));
      const throwingStore = {
        get: async function () { throw new Error('infra'); },
        set: async function () { throw new Error('SET_MUST_NOT_RUN'); }
      };
      const call = makeCall(throwingStore, spy);
      const out = await runBatchPull(['ZALPHA', 'ZBRAVO'], call.fn);
      assert.strictEqual(out.complete, false);
      assert.strictEqual(out.stoppedAt, 'ZALPHA');
      assert.strictEqual(out.ledger.length, 1);
      assert.strictEqual(out.ledger[0].statusCode, 200);
      assert.strictEqual(out.ledger[0].status, 'DEGRADED');
      assert.strictEqual(out.ledger[0].reason, 'STOPPED_PRE_READ_DEGRADED');
      assert.strictEqual(spy.calls.length, 0, 'a degraded store must stop the batch BEFORE any SEC fetch');
      assert.strictEqual(call.counter.calls, 1, 'infrastructure failure is batch-global: stop immediately');
    });

    // ── BD07: gate OFF -> single DISABLED stop; poisoned seams untouched ───────
    await test('BD07: pull gate OFF -> single 200 DISABLED stop; poisoned seams untouched', async function () {
      clearAllEnv();
      const touched = { store: 0, provider: 0 };
      const counter = { calls: 0 };
      const callFn = async function (ticker) {
        counter.calls += 1;
        const event = { httpMethod: 'POST', headers: authHdr(), body: JSON.stringify({ ticker: ticker }) };
        Object.defineProperty(event, '_testStore', {
          configurable: true, enumerable: false, get: function () { touched.store += 1; return undefined; }
        });
        Object.defineProperty(event, '_testProviderOptions', {
          configurable: true, enumerable: false, get: function () { touched.provider += 1; return undefined; }
        });
        const r = await EP.handler(event);
        return { statusCode: r.statusCode, body: JSON.parse(r.body) };
      };
      const out = await runBatchPull(['ZALPHA', 'ZBRAVO'], callFn);
      assert.strictEqual(out.complete, false);
      assert.strictEqual(out.stopStatus, 'DISABLED');
      assert.strictEqual(out.stopReason, 'SERVER_DISABLED');
      assert.deepStrictEqual(out.ledger, [{ ticker: 'ZALPHA', statusCode: 200, status: 'DISABLED', reason: 'SERVER_DISABLED' }]);
      assert.strictEqual(counter.calls, 1, 'config drift mid-window: stop after the first DISABLED');
      assert.strictEqual(touched.store, 0, 'gate-off must not read _testStore');
      assert.strictEqual(touched.provider, 0, 'gate-off must not read _testProviderOptions');
    });

    // ── BD08: ledger -> per-ticker exact-key dry-run teardown plans ────────────
    await test('BD08: WRITE ledger entries -> valid per-ticker dry-run teardown plans; budget/foreign keys rejected', async function () {
      fullValidEnv();
      const store = makeMemStore();
      const call = makeCall(store, makeFetch(routesForUniverse(UNIVERSE_BATCH)));
      const out = await runBatchPull(['ZALPHA', 'ZBRAVO'], call.fn);
      assert.strictEqual(out.complete, true);
      const sizeBefore = store._map.size;
      for (let i = 0; i < out.ledger.length; i++) {
        const e = out.ledger[i];
        const plan = planEvidenceTeardown({ writtenKeys: e.writtenKeys, ticker: e.ticker, cik: e.cik });
        assert.strictEqual(plan.ok, true, e.ticker + ' plan must build from the ledger alone');
        assert.strictEqual(plan.count, 2);
        assert.deepStrictEqual(plan.keys, [cikKey(e.ticker), companyKey(e.cik)],
          e.ticker + ' delete order must be mapping-first (pointer before record)');
        assert.deepStrictEqual(plan.metadata, { ticker: e.ticker, cik: e.cik });
        const exec = await executeEvidenceTeardown(store, plan); // no opts -> dry-run default
        assert.strictEqual(exec.status, 'DRY_RUN');
        assert.strictEqual(exec.dryRun, true);
        assert.deepStrictEqual(exec.plannedDeletes, plan.keys);
      }
      assert.strictEqual(store._map.size, sizeBefore, 'dry-run must delete nothing');
      // Rejections: a budget key, a foreign second mapping, and a 3-key plan all fail closed.
      assert.deepStrictEqual(planEvidenceTeardown({ writtenKeys: [budgetKey('ZALPHA'), companyKey('0001000021')] }),
        { ok: false, reason: 'KEY_MALFORMED' });
      assert.deepStrictEqual(planEvidenceTeardown({ writtenKeys: [cikKey('ZALPHA'), cikKey('ZBRAVO')] }),
        { ok: false, reason: 'DUPLICATE_KEY' });
      assert.deepStrictEqual(planEvidenceTeardown({ writtenKeys: EXPECT_KEYS.ZALPHA.concat([cikKey('ZBRAVO')]) }),
        { ok: false, reason: 'TOO_MANY_KEYS' });
    });

    // ── BD09: malformed list -> whole batch rejected pre-call ──────────────────
    await test('BD09: malformed list (lowercase/padded/empty/non-string/non-array) -> LIST_INVALID, zero calls, store untouched', async function () {
      fullValidEnv();
      const store = makeMemStore();
      const call = makeCall(store, makeFetch(routesForUniverse(UNIVERSE_BATCH)));
      const badLists = [['zalpha'], [' ZALPHA'], [''], ['ZALPHA', 42], ['ZALPHA', null], 'ZALPHA', [], null, undefined];
      for (let i = 0; i < badLists.length; i++) {
        const out = await runBatchPull(badLists[i], call.fn);
        assert.deepStrictEqual(out, { ok: false, reason: 'LIST_INVALID', ledger: [] }, 'list case ' + i);
      }
      assert.strictEqual(call.counter.calls, 0, 'fail-closed-loud: no call may fire on a malformed list');
      assert.strictEqual(store._ops.set, 0, 'store untouched');
      assert.strictEqual(store._ops.get, 0, 'store untouched');
    });

    // ── BD10: over-cap list -> rejected pre-call ───────────────────────────────
    await test('BD10: 26 distinct tickers -> LIST_TOO_LARGE (cap 25 = allowlist ceiling), zero calls', async function () {
      fullValidEnv();
      const call = makeCall(makeMemStore(), makeFetch(routesForUniverse(UNIVERSE_BATCH)));
      const list26 = [];
      for (let i = 0; i < 26; i++) { list26.push('Z' + String.fromCharCode(65 + i)); }
      const out = await runBatchPull(list26, call.fn);
      assert.deepStrictEqual(out, { ok: false, reason: 'LIST_TOO_LARGE', ledger: [] });
      assert.strictEqual(call.counter.calls, 0);
      // 26 raw with a duplicate dedupes to 25 -> passes the cap (boundary), then
      // stops at the first non-200 (config-free env here would be DISABLED, so
      // assert only the cap verdict via a counting stub — no endpoint involved).
      let stubCalls = 0;
      const stub = async function () { stubCalls += 1; return { statusCode: 403, body: { status: 'TICKER_NOT_ALLOWED', reason: 'TICKER_NOT_ALLOWED' } }; };
      const dup26 = list26.slice(0, 25).concat(['ZA']);
      const out2 = await runBatchPull(dup26, stub);
      assert.strictEqual(out2.ok, true, 'post-dedupe 25 passes the cap');
      assert.strictEqual(stubCalls, 1, 'stops at the first non-200');
    });

    // ── BD12: real-path NO_CIK + NO_EVIDENCE both continue to the next ticker ──
    await test('BD12: real-path NO_EVIDENCE/NO_CIK and NO_EVIDENCE/NO_EVIDENCE continue; batch completes with a WRITE', async function () {
      fullValidEnv('ZNOCIK, ZDELTA, ZALPHA');
      const store = makeMemStore();
      const call = makeCall(store, makeFetch(routesForUniverse(UNIVERSE_BATCH)));
      const out = await runBatchPull(['ZNOCIK', 'ZDELTA', 'ZALPHA'], call.fn);
      assert.strictEqual(out.complete, true, 'NO_CIK and NO_EVIDENCE are continue outcomes');
      assert.strictEqual(out.ledger.length, 3);
      assert.strictEqual(call.counter.calls, 3, 'both benign outcomes must advance to the next ticker');
      assert.deepStrictEqual(out.ledger[0], { ticker: 'ZNOCIK', statusCode: 200, status: 'NO_EVIDENCE', reason: 'NO_CIK' });
      assert.deepStrictEqual(out.ledger[1], { ticker: 'ZDELTA', statusCode: 200, status: 'NO_EVIDENCE', reason: 'NO_EVIDENCE' });
      assert.strictEqual(out.ledger[2].status, 'WRITE');
      assert.deepStrictEqual(out.ledger[2].writtenKeys, EXPECT_KEYS.ZALPHA);
      assert.strictEqual(store._map.size, 2, 'only the WRITE ticker persisted anything');
    });

    // ── BD13: reason-aware matrix — a familiar status with a wrong reason STOPS ─
    await test('BD13: (status, reason) matrix — approved pairs continue; unrecognized/absent reasons stop', async function () {
      // Synthetic first responses drive the driver policy directly (the real
      // endpoint only emits the fixed vocabulary, so wrong-reason pairs cannot
      // be produced through it). The second call is a known continue pair.
      async function runPair(first) {
        let calls = 0;
        const callFn = async function () {
          calls += 1;
          if (calls === 1) { return first; }
          return { statusCode: 200, body: { status: 'NO_EVIDENCE', reason: 'NO_EVIDENCE' } };
        };
        const out = await runBatchPull(['ZALPHA', 'ZBRAVO'], callFn);
        return { out: out, calls: calls };
      }
      const continues = [
        { statusCode: 200, body: { status: 'WRITE', ticker: 'ZALPHA' } },
        { statusCode: 200, body: { status: 'SKIPPED', reason: 'ALREADY_SEEDED' } },
        { statusCode: 200, body: { status: 'NO_EVIDENCE', reason: 'NO_EVIDENCE' } },
        { statusCode: 200, body: { status: 'NO_EVIDENCE', reason: 'NO_CIK' } }
      ];
      for (let i = 0; i < continues.length; i++) {
        const r = await runPair(continues[i]);
        assert.strictEqual(r.out.complete, true, 'continue case ' + i + ' must advance');
        assert.strictEqual(r.calls, 2, 'continue case ' + i + ' must call the next ticker');
      }
      const stops = [
        { statusCode: 200, body: { status: 'SKIPPED', reason: 'OTHER_REASON' } },
        { statusCode: 200, body: { status: 'NO_EVIDENCE', reason: 'OTHER_REASON' } },
        { statusCode: 200, body: { status: 'SKIPPED' } },
        { statusCode: 200, body: { status: 'NO_EVIDENCE' } },
        { statusCode: 200, body: { status: 'DISABLED', reason: 'SERVER_DISABLED' } },
        { statusCode: 200, body: { status: 'DEGRADED', reason: 'STOPPED_PRE_READ_DEGRADED' } }
      ];
      for (let j = 0; j < stops.length; j++) {
        const r = await runPair(stops[j]);
        assert.strictEqual(r.out.complete, false, 'stop case ' + j + ' must stop');
        assert.strictEqual(r.calls, 1, 'stop case ' + j + ' must never call the next ticker');
        assert.strictEqual(r.out.stoppedAt, 'ZALPHA', 'stop case ' + j + ' stops on the first ticker');
        assert.strictEqual(r.out.stopStatus, stops[j].body.status, 'stop case ' + j + ' echoes the status');
        assert.strictEqual(r.out.stopReason, stops[j].body.reason, 'stop case ' + j + ' echoes the reason');
      }
    });

    // ── BD11: zero real network + no production batch surface (TARGET-file scan) ─
    await test('BD11: zero real global.fetch across the suite; no server-side batch surface in the pull tree; promoted-lib drift pins', async function () {
      assert.strictEqual(realFetchCalls, 0, 'the real global.fetch must never be called');
      // Comment-stripped scans of the TARGET production files (never this harness):
      const strip = function (src) { return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' '); };
      const core = strip(fs.readFileSync(path.join(ROOT, CORE_REL), 'utf8'));
      const mjs = strip(fs.readFileSync(path.join(ROOT, MJS_REL), 'utf8'));
      const orch = strip(fs.readFileSync(path.join(ROOT, ORCH_REL), 'utf8'));
      [['core', core], ['mjs', mjs]].forEach(function (pair) {
        assert.ok(pair[1].indexOf('pullAndPersistPortfolio') === -1, pair[0] + ' must not wire the batch loop');
        assert.ok(pair[1].indexOf('tickers') === -1, pair[0] + ' must not accept a tickers[] batch body');
        assert.ok(pair[1].indexOf('runBatchPull') === -1, pair[0] + ' must not contain the harness driver');
      });
      assert.ok(orch.indexOf('pullAndPersistPortfolio') !== -1, 'orchestrator batch loop still present (dormant, untouched)');
      assert.ok(orch.indexOf('runBatchPull') === -1, 'orchestrator must not contain the harness driver');
      // Promoted-lib drift pins (EG-21C-1): the lib now owns the rule constants;
      // pin the exact literals + values so any drift is loud, and keep the lib
      // env-free / zero-require so promotion never weakened dormancy.
      const libRaw = fs.readFileSync(path.join(ROOT, LIB_REL), 'utf8');
      const libCode = strip(libRaw);
      assert.ok(libRaw.indexOf('BATCH_TICKER_RE = /^[A-Z]{1,10}$/') !== -1, 'lib keeps the ratified regex literal');
      assert.ok(libRaw.indexOf('MAX_BATCH_TICKERS = 25') !== -1, 'lib keeps the ratified cap literal');
      assert.ok(libCode.indexOf('process.env') === -1, 'promoted lib reads no env');
      assert.ok(!/\brequire\s*\(/.test(libCode), 'promoted lib is zero-require');
      assert.strictEqual(BATCH_TICKER_RE.source, '^[A-Z]{1,10}$', 'harness pin matches the ratified regex');
      assert.strictEqual(MAX_BATCH_TICKERS, 25, 'harness pin matches the ratified cap');
    });
  } finally {
    ENV_KEYS.forEach(function (k) { if (snapshot[k] === undefined) { delete process.env[k]; } else { process.env[k] = snapshot[k]; } });
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
