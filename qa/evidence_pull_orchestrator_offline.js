'use strict';

/*
 * qa/evidence_pull_orchestrator_offline.js
 *
 * Real Portfolio Evidence Pull — Slice 2C offline harness (O01–O09).
 *
 * Exercises the DORMANT product orchestrator
 * (netlify/functions/lib/evidence-pull-orchestrator.js) with ZERO real
 * network / Blob / env / production:
 *
 *   pullAndPersistTicker / pullAndPersistPortfolio
 *     -> strong pre-read skip (create-only / un-seeded-only)
 *     -> getEvidenceWithCik (mocked fetch over recorded SEC fixtures)
 *     -> writer core handler(event._testStore)  -> STORE_WRITE
 *
 * Isolation (mirrors Slice 2B qa/portfolio_evidence_pull_live_offline.js):
 *   - the provider fetch is INJECTED via providerOptions.fetch; a throwing
 *     global.fetch guard makes any real network a hard error.
 *   - the store is an in-memory Map with an op spy, injected both to the
 *     orchestrator pre-read and to the writer via event._testStore; no
 *     @netlify/blobs handle is ever constructed.
 *   - the writer gate + token live on process.env IN-PROCESS ONLY and are
 *     deleted on exit; no Netlify env is touched.
 *
 * Filing-only: fixtures serve exactly one 10-Q filing; concept (XBRL) URLs fall
 * through to 404, so each pull yields a single filing item. The numeric
 * multi-item case is intentionally out of scope for this slice.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { cikKey, companyKey } = require('../netlify/functions/lib/evidence-store');

const ROOT = path.resolve(__dirname, '..');
const MODULE_REL = 'netlify/functions/lib/evidence-pull-orchestrator.js';
const WRITE_GATE = 'PT_ENABLE_SEC_EVIDENCE_STORE_WRITER_SERVER';
const TOKEN_ENV  = 'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN';
const TEST_TOKEN = 'test-orchestrator-token-a1b2c3d4';
const UA = 'PulseSlice2CTest/1.0 qa@example.com';
const CATS = ['sec10q'];

// The orchestrator is loaded UNDER the network guard inside O01 (import-inertness
// proof), then reused by the remaining tests.
let orchestrator = null;

// ── in-process env helpers (NOT Netlify env; ephemeral to this process) ───────
function setEnv(name, value) {
  if (value === undefined) { delete process.env[name]; }
  else { process.env[name] = value; }
}
function enableGate() { setEnv(WRITE_GATE, 'true'); setEnv(TOKEN_ENV, TEST_TOKEN); }
function disableGate() { setEnv(WRITE_GATE, undefined); setEnv(TOKEN_ENV, undefined); }

// ── injected fetch over fixtures (from Slice 2A / 2B) ─────────────────────────
function jsonResponse(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status, headers: { get: () => null }, text: async () => text };
}
function makeFetch(routes) {
  const spy = { calls: [] };
  spy.fn = async (url) => {
    const u = String(url);
    spy.calls.push(u);
    for (const r of routes) {
      if (u.indexOf(r.match) !== -1) { return r.respond; }
    }
    return jsonResponse(404, {}); // unmatched (incl. concept URLs) -> filing-only
  };
  return spy;
}
function providerOpts(spy, env) {
  return { fetch: spy.fn, env: env, spacingMs: 0 };
}

// ── filing-only SEC fixtures ──────────────────────────────────────────────────
function tickersJsonOf(rows) {
  const o = {};
  rows.forEach(function (r, i) { o[String(i)] = { cik_str: r.cikStr, ticker: r.ticker, title: r.title }; });
  return o;
}
function submissionsFor(cikStr, accession, filingDate, reportDate, primaryDoc) {
  return {
    cik: String(cikStr),
    filings: { recent: {
      form: ['10-Q'],
      filingDate: [filingDate],
      accessionNumber: [accession],
      primaryDocument: [primaryDoc],
      reportDate: [reportDate]
    } }
  };
}
function routesForUniverse(universe) {
  const routes = [{ match: 'company_tickers.json', respond: jsonResponse(200, universe.tickersJson) }];
  Object.keys(universe.submissionsByPaddedCik).forEach(function (paddedCik) {
    routes.push({
      match: 'submissions/CIK' + paddedCik,
      respond: jsonResponse(200, universe.submissionsByPaddedCik[paddedCik])
    });
  });
  return routes;
}

const UNIVERSE_SINGLE = {
  tickersJson: tickersJsonOf([{ cikStr: 1000010, ticker: 'ZORCH', title: 'Zorch Test Co' }]),
  submissionsByPaddedCik: {
    '0001000010': submissionsFor(1000010, '0001000010-26-000010', '2026-02-12', '2025-12-28', 'zorch-20251228.htm')
  }
};
const UNIVERSE_DELTA = {
  tickersJson: tickersJsonOf([{ cikStr: 1000012, ticker: 'ZDELTA', title: 'Zdelta Test Co' }]),
  submissionsByPaddedCik: {
    '0001000012': submissionsFor(1000012, '0001000012-26-000012', '2026-02-14', '2025-12-28', 'zdelta-20251228.htm')
  }
};
const UNIVERSE_BATCH = {
  tickersJson: tickersJsonOf([
    { cikStr: 1000010, ticker: 'ZORCH', title: 'Zorch Test Co' },
    { cikStr: 1000011, ticker: 'ZEPS', title: 'Zeps Test Co' }
  ]),
  submissionsByPaddedCik: {
    '0001000010': submissionsFor(1000010, '0001000010-26-000010', '2026-02-12', '2025-12-28', 'zorch-20251228.htm'),
    '0001000011': submissionsFor(1000011, '0001000011-26-000011', '2026-02-13', '2025-12-28', 'zeps-20251228.htm')
  }
};

// ── in-memory store modelling create-only Blob semantics (+ op spy) ───────────
function makeMemStore() {
  const map = new Map();
  const ops = { get: 0, set: 0 };
  return {
    _map: map,
    _ops: ops,
    get: async function (key) { ops.get += 1; return map.has(key) ? map.get(key) : null; },
    set: async function (key, value, o) {
      ops.set += 1;
      if (o && o.onlyIfNew === true && map.has(key)) {
        return { modified: false };
      }
      map.set(key, value);
      return { modified: true };
    }
  };
}

// direct writer invoke (bypasses the orchestrator skip) — create-only invariants
function writerPost(ticker, cik, evidenceItems, store, token) {
  const { handler } = require('../netlify/functions/lib/sec-evidence-store-writer-core');
  const event = {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer ' + (token || TEST_TOKEN) },
    body: JSON.stringify({ ticker, cik, evidenceItems }),
    _testStore: store
  };
  return handler(event).then(function (r) { return { statusCode: r.statusCode, body: JSON.parse(r.body) }; });
}

// ── tiny runner (mirrors qa/run-writer-offline.js) ────────────────────────────
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
  process.stdout.write('\n=== Real Portfolio Evidence Pull — Slice 2C (dormant orchestrator, offline) ===\n\n');

  // Behavioral network guard: any real global.fetch is a hard error. The provider
  // must use the INJECTED fetch; the writer must use event._testStore. Restored
  // in the finally below.
  let realFetchCalls = 0;
  const _origFetch = globalThis.fetch;
  globalThis.fetch = function () {
    realFetchCalls += 1;
    throw new Error('LIVE_NETWORK_FORBIDDEN');
  };

  try {
    // ── O01: import inertness — first load of the orchestrator subtree under guard
    await test('O01: module import is inert (no network / no throw) and exposes both entrypoints', async function () {
      const before = realFetchCalls;
      orchestrator = require('../netlify/functions/lib/evidence-pull-orchestrator');
      assert.strictEqual(typeof orchestrator.pullAndPersistTicker, 'function', 'pullAndPersistTicker missing');
      assert.strictEqual(typeof orchestrator.pullAndPersistPortfolio, 'function', 'pullAndPersistPortfolio missing');
      assert.strictEqual(realFetchCalls, before, 'import performed a network fetch');
    });

    enableGate();

    // ── O02: un-seeded single ticker -> STORE_WRITE, exactly 2 canonical keys ──
    await test('O02: un-seeded pull->CIK->write -> 200 STORE_WRITE with exactly 2 canonical keys', async function () {
      const store = makeMemStore();
      const spy = makeFetch(routesForUniverse(UNIVERSE_SINGLE));
      const out = await orchestrator.pullAndPersistTicker('ZORCH', {
        store: store, token: TEST_TOKEN, providerOptions: providerOpts(spy, { SEC_USER_AGENT: UA })
      });
      assert.strictEqual(out.action, 'WRITE');
      assert.strictEqual(out.statusCode, 200);
      assert.strictEqual(out.body.status, 'STORE_WRITE');
      assert.strictEqual(out.body.ticker, 'ZORCH');
      assert.strictEqual(out.body.cik, out.cik);
      assert.strictEqual(out.body.evidenceItemCount, out.itemCount);
      assert.ok(/^\d{10}$/.test(out.cik), 'cik must be exactly 10 digits, got: ' + out.cik);
      assert.strictEqual(store._map.size, 2, 'exactly two keys written');
      const mapping = JSON.parse(store._map.get(cikKey('ZORCH')));
      assert.deepStrictEqual(Object.keys(mapping), ['cik']);
      assert.strictEqual(mapping.cik, out.cik);
      const company = JSON.parse(store._map.get(companyKey(out.cik)));
      assert.deepStrictEqual(Object.keys(company), ['evidenceItems']);
      assert.strictEqual(company.evidenceItems.length, out.itemCount);
    });

    // ── O03: seeded ticker -> SKIPPED before any provider fetch / store.set ────
    await test('O03: seeded ticker -> SKIPPED_ALREADY_SEEDED, no provider fetch, no store.set', async function () {
      const store = makeMemStore();
      store._map.set(cikKey('ZORCH'), JSON.stringify({ cik: '0001000010' }));
      store._map.set(companyKey('0001000010'), JSON.stringify({ evidenceItems: [] }));
      const spy = makeFetch(routesForUniverse(UNIVERSE_SINGLE));
      const out = await orchestrator.pullAndPersistTicker('ZORCH', {
        store: store, token: TEST_TOKEN, providerOptions: providerOpts(spy, { SEC_USER_AGENT: UA })
      });
      assert.strictEqual(out.action, 'SKIPPED_ALREADY_SEEDED');
      assert.strictEqual(spy.calls.length, 0, 'skip must occur before any provider fetch');
      assert.strictEqual(store._ops.set, 0, 'skip must not write to the store');
    });

    // ── O04: create-only invariants (skip bypassed via a direct writer POST) ──
    await test('O04: identical re-write -> STORE_WRITE_NOOP; differing -> 409 MAPPING_VERIFY_CONFLICT', async function () {
      const store = makeMemStore();
      const spy = makeFetch(routesForUniverse(UNIVERSE_SINGLE));
      const w = await orchestrator.pullAndPersistTicker('ZORCH', {
        store: store, token: TEST_TOKEN, providerOptions: providerOpts(spy, { SEC_USER_AGENT: UA })
      });
      assert.strictEqual(w.action, 'WRITE');
      assert.strictEqual(w.body.status, 'STORE_WRITE');
      const cik = w.cik;
      const stored = JSON.parse(store._map.get(companyKey(cik))).evidenceItems;

      const noop = await writerPost('ZORCH', cik, stored, store, TEST_TOKEN);
      assert.strictEqual(noop.statusCode, 200);
      assert.strictEqual(noop.body.status, 'STORE_WRITE_NOOP');

      const differing = stored.map(function (it, i) {
        return i === 0 ? Object.assign({}, it, { claim: it.claim + ' (MUTATED)' }) : it;
      });
      const conflict = await writerPost('ZORCH', cik, differing, store, TEST_TOKEN);
      assert.strictEqual(conflict.statusCode, 409);
      assert.strictEqual(conflict.body.status, 'CONFLICT');
      assert.strictEqual(conflict.body.reason, 'MAPPING_VERIFY_CONFLICT');
    });

    // ── O05: portfolio batch — pre-seeded skipped, un-seeded written, seed intact
    await test('O05: portfolio [ZORCH(seeded), ZEPS] -> ZORCH SKIPPED, ZEPS WRITE; seed untouched', async function () {
      const store = makeMemStore();
      store._map.set(cikKey('ZORCH'), JSON.stringify({ cik: '0001000010' }));
      store._map.set(companyKey('0001000010'), JSON.stringify({ evidenceItems: [] }));
      const spy = makeFetch(routesForUniverse(UNIVERSE_BATCH));
      const results = await orchestrator.pullAndPersistPortfolio(['ZORCH', 'ZEPS'], {
        store: store, token: TEST_TOKEN, providerOptions: providerOpts(spy, { SEC_USER_AGENT: UA })
      });
      const byTicker = {};
      results.forEach(function (r) { byTicker[r.ticker] = r; });
      assert.strictEqual(byTicker.ZORCH.action, 'SKIPPED_ALREADY_SEEDED');
      assert.strictEqual(byTicker.ZEPS.action, 'WRITE');
      assert.strictEqual(byTicker.ZEPS.body.status, 'STORE_WRITE');
      // pre-seeded ZORCH company record untouched (still empty evidence)
      assert.strictEqual(JSON.parse(store._map.get(companyKey('0001000010'))).evidenceItems.length, 0);
    });

    // ── O06: writer gate off -> DISABLED, zero store mutation ─────────────────
    await test('O06: writer gate off -> DISABLED/SERVER_DISABLED, zero store mutation', async function () {
      setEnv(WRITE_GATE, undefined);
      const store = makeMemStore();
      const spy = makeFetch(routesForUniverse(UNIVERSE_DELTA));
      const out = await orchestrator.pullAndPersistTicker('ZDELTA', {
        store: store, token: TEST_TOKEN, providerOptions: providerOpts(spy, { SEC_USER_AGENT: UA })
      });
      assert.strictEqual(out.action, 'WRITE');            // orchestrator attempted
      assert.strictEqual(out.body.status, 'DISABLED');    // the writer refused
      assert.strictEqual(out.body.reason, 'SERVER_DISABLED');
      assert.strictEqual(store._map.size, 0, 'gate-off must not write to the store');
      assert.strictEqual(store._ops.set, 0, 'gate-off must not call store.set');
      enableGate();
    });

    // ── O07: provider fail-closed — missing SEC_USER_AGENT throws before fetch ──
    await test('O07: missing SEC_USER_AGENT -> throws SEC_USER_AGENT_MISSING before any fetch, zero mutation', async function () {
      const store = makeMemStore();
      const spy = makeFetch(routesForUniverse(UNIVERSE_SINGLE));
      await assert.rejects(
        orchestrator.pullAndPersistTicker('ZORCH', {
          store: store, token: TEST_TOKEN, providerOptions: providerOpts(spy, {}) // no SEC_USER_AGENT
        }),
        function (err) { return err && err.message === 'SEC_USER_AGENT_MISSING'; }
      );
      assert.strictEqual(spy.calls.length, 0, 'provider must fail closed before any fetch');
      assert.strictEqual(store._ops.set, 0, 'fail-closed must not mutate the store');
    });

    // ── O08: zero real network (behavioral) ───────────────────────────────────
    await test('O08: zero real network — global.fetch guard never fired; injected fetch served the provider', async function () {
      assert.strictEqual(realFetchCalls, 0, 'the real global.fetch must never be called');
      const store = makeMemStore();
      const spy = makeFetch(routesForUniverse(UNIVERSE_DELTA));
      const out = await orchestrator.pullAndPersistTicker('ZDELTA', {
        store: store, token: TEST_TOKEN, providerOptions: providerOpts(spy, { SEC_USER_AGENT: UA })
      });
      assert.strictEqual(out.action, 'WRITE');
      assert.ok(spy.calls.length >= 1, 'provider must fetch via the injected fetch');
      assert.strictEqual(realFetchCalls, 0, 'still zero real global.fetch calls after a fresh pull');
    });

    // ── O09: static safety of the TARGET module + behavioral Blob avoidance ────
    // Scan the module (never this test's own source — the self-scan gotcha).
    await test('O09: orchestrator is static-safe; writer stayed on the injected store', async function () {
      const src = fs.readFileSync(path.join(ROOT, MODULE_REL), 'utf8');
      assert.ok(!/@netlify\/blobs/.test(src), '@netlify/blobs referenced in orchestrator');
      assert.ok(!/getStore\s*\(/.test(src), 'getStore( called in orchestrator');
      assert.ok(!/\bprocess\.env\b/.test(src), 'process.env read in orchestrator');
      assert.ok(!/\bfetch\s*\(/.test(src), 'direct fetch( in orchestrator');
      assert.ok(!/require\(\s*['"]https?['"]\s*\)/.test(src), 'http/https required in orchestrator');
      assert.ok(!/localStorage|sessionStorage/.test(src), 'web storage referenced in orchestrator');
      assert.ok(!/\b(?:pt_results|pt_tickers|pt_holdings)\b/.test(src), 'pt_* storage key referenced in orchestrator');
      assert.ok(!/\b(?:orchestrate|analyzeChunk|enforceScoreConsistency|_techCache)\b/.test(src), 'scoring ref in orchestrator');
      // Composing the provider + writer core + store is EXPECTED and correct.
      assert.ok(/require\(\s*['"]\.\/evidence-provider-sec10q-live['"]\s*\)/.test(src), 'provider require missing');
      assert.ok(/require\(\s*['"]\.\/sec-evidence-store-writer-core['"]\s*\)/.test(src), 'writer-core require missing');
      // Behavioral blob avoidance: a fresh un-seeded write lands entirely on the
      // injected store, so the writer never constructed a live blob handle.
      const store = makeMemStore();
      const spy = makeFetch(routesForUniverse(UNIVERSE_SINGLE));
      const out = await orchestrator.pullAndPersistTicker('ZORCH', {
        store: store, token: TEST_TOKEN, providerOptions: providerOpts(spy, { SEC_USER_AGENT: UA })
      });
      assert.strictEqual(out.body.status, 'STORE_WRITE');
      assert.ok(store._ops.get >= 1, 'writer/pre-read must read via the injected store');
      assert.ok(store._ops.set >= 1, 'writer must write via the injected store');
    });
  } finally {
    disableGate();
    globalThis.fetch = _origFetch; // restore the network guard before reporting/exit
  }

  const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
  if (failed > 0) { process.exit(1); }
}

runTests().catch(function (err) {
  process.stderr.write('FATAL: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
