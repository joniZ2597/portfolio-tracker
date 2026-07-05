'use strict';

/*
 * qa/portfolio_evidence_pull_offline.js
 *
 * Real Portfolio Evidence Pull — Phase 1 offline harness.
 *
 * Proves the smallest end-to-end seam with ZERO network, ZERO real Blob, ZERO
 * Netlify/env/production contact:
 *
 *   sec10q_fixture pull  ->  explicit CIK (from the pull path)
 *                        ->  validateWritePayload-shaped { ticker, cik, evidenceItems }
 *                        ->  sec-evidence-store writer core  (via event._testStore)
 *
 * Product decisions locked for this slice:
 *   1. CIK is surfaced EXPLICITLY from the pull path
 *      (fixtureProvider.resolveCik) — never parsed from sourceUrl, never a live
 *      SEC lookup.
 *   2. Writer stays CREATE-ONLY. The orchestrator pulls/persists UN-SEEDED
 *      tickers only; an already-seeded ticker (e.g. AAPL) is SKIPPED (no-op).
 *      No refresh / replace / versioning / accession-keyed / quarter rotation.
 *
 * Isolation:
 *   - the only store is an in-memory Map injected as event._testStore; the
 *     writer core's acquireStore() returns it before ever touching @netlify/blobs
 *   - the writer gate + token are set on process.env IN-PROCESS ONLY (mirroring
 *     qa/run-writer-offline.js) and deleted on exit; no Netlify env is touched
 *   - no fetch/http/https, no fs writes, no localStorage, no scoring engine
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const fixtureProvider = require('../netlify/functions/lib/evidence-provider-sec10q-fixture');
const { handler: writerHandler } = require('../netlify/functions/lib/sec-evidence-store-writer-core');
const { validateWritePayload } = require('../netlify/functions/lib/evidence-writer');
const { cikKey, companyKey, readRecord } = require('../netlify/functions/lib/evidence-store');

const ROOT = path.resolve(__dirname, '..');
const WRITE_GATE = 'PT_ENABLE_SEC_EVIDENCE_STORE_WRITER_SERVER';
const TOKEN_ENV  = 'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN';
const TEST_TOKEN = 'test-portfolio-pull-token-a1b2c3d4';
const CATEGORIES = ['sec10q'];
const STRONG = { consistency: 'strong' };

// ── in-process env helpers (NOT Netlify env; ephemeral to this process) ───────
function setEnv(name, value) {
  if (value === undefined) { delete process.env[name]; }
  else { process.env[name] = value; }
}
function enableGate() { setEnv(WRITE_GATE, 'true'); setEnv(TOKEN_ENV, TEST_TOKEN); }
function disableGate() { setEnv(WRITE_GATE, undefined); setEnv(TOKEN_ENV, undefined); }

// ── stateful in-memory store modelling create-only Blob semantics ─────────────
// get(key) -> stored string | null ; set(key,value,{onlyIfNew}) -> {modified}
function makeMemStore() {
  const map = new Map();
  return {
    _map: map,
    get: async function (key) { return map.has(key) ? map.get(key) : null; },
    set: async function (key, value, opts) {
      if (opts && opts.onlyIfNew === true && map.has(key)) {
        return { modified: false };
      }
      map.set(key, value);
      return { modified: true };
    }
  };
}

// ── the orchestrator under test (inline; the Phase-1 proof, not shipped yet) ──
// Un-seeded-only: if the CIK mapping already exists, SKIP (create-only policy).
async function pullAndPersist(ticker, store, token) {
  const pre = await readRecord(store, cikKey(ticker), STRONG);
  if (pre.state === 'OK') {
    return { ticker, action: 'SKIPPED_ALREADY_SEEDED' };
  }

  const items = fixtureProvider.getEvidence({ ticker, categories: CATEGORIES });
  if (!Array.isArray(items) || items.length === 0) {
    return { ticker, action: 'NO_EVIDENCE' };
  }

  const cik = fixtureProvider.resolveCik(ticker); // explicit CIK from the pull path
  if (!cik) {
    return { ticker, action: 'NO_CIK' };
  }

  const event = {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer ' + token },
    body: JSON.stringify({ ticker, cik, evidenceItems: items }),
    _testStore: store
  };
  const r = await writerHandler(event);
  return {
    ticker,
    action: 'WRITE',
    cik,
    itemCount: items.length,
    statusCode: r.statusCode,
    body: JSON.parse(r.body)
  };
}

// direct writer invoke (bypasses the skip pre-check) — for create-only invariants
async function writerPost(ticker, cik, evidenceItems, store, token) {
  const event = {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer ' + (token || TEST_TOKEN) },
    body: JSON.stringify({ ticker, cik, evidenceItems }),
    _testStore: store
  };
  const r = await writerHandler(event);
  return { statusCode: r.statusCode, body: JSON.parse(r.body) };
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
  process.stdout.write('\n=== Real Portfolio Evidence Pull — Phase 1 Offline Harness ===\n\n');

  // Behavioral network guard: any fetch() during the harness is a hard error.
  // (Mirrors the fetch-spy pattern in qa/run-offline.js.) Proven zero in P09.
  let fetchCalls = 0;
  const _origFetch = globalThis.fetch;
  globalThis.fetch = function () {
    fetchCalls += 1;
    throw new Error('network fetch is forbidden in the offline harness');
  };

  enableGate();

  // ── P01: fixture pull is a valid non-scoring sec10q evidence array ──────────
  await test('P01: fixture pull returns >=4 sec10q items, all non-scoring', async function () {
    const items = fixtureProvider.getEvidence({ ticker: 'ZALPHA', categories: CATEGORIES });
    assert.ok(Array.isArray(items) && items.length >= 4, 'expected >=4 fixture items');
    for (const it of items) {
      assert.strictEqual(it.category, 'sec10q');
      assert.strictEqual(it.confidence, null);
      assert.strictEqual(it.requiresVerification, true);
      assert.strictEqual(it.scoringImpact, 'none');
    }
  });

  // ── P02: explicit CIK seam ──────────────────────────────────────────────────
  await test('P02: resolveCik yields a valid 10-digit CIK; invalid ticker -> null', async function () {
    const cik = fixtureProvider.resolveCik('ZALPHA');
    assert.ok(/^\d{10}$/.test(cik), 'CIK must be exactly 10 digits, got: ' + cik);
    assert.strictEqual(fixtureProvider.resolveCik('ZALPHA'), cik, 'CIK must be deterministic');
    assert.strictEqual(fixtureProvider.resolveCik('bad.ticker'), null);
    assert.strictEqual(fixtureProvider.resolveCik(''), null);
    assert.strictEqual(fixtureProvider.resolveCik(null), null);
    assert.notStrictEqual(fixtureProvider.resolveCik('ZALPHA'), fixtureProvider.resolveCik('ZBETA'));
  });

  // ── P03: pulled items + explicit CIK form a writer-valid payload ────────────
  await test('P03: built payload passes validateWritePayload', async function () {
    const ticker = 'ZALPHA';
    const items = fixtureProvider.getEvidence({ ticker, categories: CATEGORIES });
    const cik = fixtureProvider.resolveCik(ticker);
    const v = validateWritePayload({ ticker, cik, evidenceItems: items });
    assert.strictEqual(v.ok, true, 'payload rejected: ' + (v.reason || ''));
    assert.strictEqual(v.ticker, ticker);
    assert.strictEqual(v.cik, cik);
    assert.strictEqual(v.projectedItems.length, items.length);
  });

  // ── P04: un-seeded ticker end-to-end -> STORE_WRITE, correct records ────────
  const sharedStore = makeMemStore();
  await test('P04: un-seeded pull->CIK->write -> 200 STORE_WRITE with both records', async function () {
    const out = await pullAndPersist('ZALPHA', sharedStore, TEST_TOKEN);
    assert.strictEqual(out.action, 'WRITE');
    assert.strictEqual(out.statusCode, 200);
    assert.strictEqual(out.body.status, 'STORE_WRITE');
    assert.strictEqual(out.body.ticker, 'ZALPHA');
    assert.strictEqual(out.body.cik, out.cik);
    assert.strictEqual(out.body.evidenceItemCount, out.itemCount);
    // records present + canonical shape
    const mapping = JSON.parse(sharedStore._map.get(cikKey('ZALPHA')));
    assert.deepStrictEqual(Object.keys(mapping), ['cik']);
    assert.strictEqual(mapping.cik, out.cik);
    const company = JSON.parse(sharedStore._map.get(companyKey(out.cik)));
    assert.deepStrictEqual(Object.keys(company), ['evidenceItems']);
    assert.strictEqual(company.evidenceItems.length, out.itemCount);
  });

  // ── P05: re-pull same ticker -> SKIPPED (un-seeded-only), store unchanged ───
  await test('P05: re-pull seeded ticker -> SKIPPED_ALREADY_SEEDED, no new write', async function () {
    const sizeBefore = sharedStore._map.size;
    const out = await pullAndPersist('ZALPHA', sharedStore, TEST_TOKEN);
    assert.strictEqual(out.action, 'SKIPPED_ALREADY_SEEDED');
    assert.strictEqual(sharedStore._map.size, sizeBefore, 'store must be unchanged on skip');
  });

  // ── P06: create-only invariant (bypassing the skip) ─────────────────────────
  await test('P06: direct re-write identical -> NOOP; differing -> 409 CONFLICT', async function () {
    const ticker = 'ZALPHA';
    const cik = fixtureProvider.resolveCik(ticker);
    const items = fixtureProvider.getEvidence({ ticker, categories: CATEGORIES });
    const noop = await writerPost(ticker, cik, items, sharedStore, TEST_TOKEN);
    assert.strictEqual(noop.statusCode, 200);
    assert.strictEqual(noop.body.status, 'STORE_WRITE_NOOP');

    const differing = items.map(function (it, i) {
      return i === 0 ? Object.assign({}, it, { claim: it.claim + ' (MUTATED)' }) : it;
    });
    const conflict = await writerPost(ticker, cik, differing, sharedStore, TEST_TOKEN);
    assert.strictEqual(conflict.statusCode, 409);
    assert.strictEqual(conflict.body.status, 'CONFLICT');
    assert.strictEqual(conflict.body.reason, 'MAPPING_VERIFY_CONFLICT');
  });

  // ── P07: portfolio batch — un-seeded written, pre-seeded AAPL skipped ───────
  await test('P07: batch [AAPL(seeded), ZALPHA, ZBETA] -> AAPL SKIPPED, others WRITE', async function () {
    const store = makeMemStore();
    // Pre-seed AAPL (models the existing real AAPL seed): mapping + company present.
    store._map.set(cikKey('AAPL'), JSON.stringify({ cik: '0000320193' }));
    store._map.set(companyKey('0000320193'), JSON.stringify({ evidenceItems: [] }));

    const results = [];
    for (const t of ['AAPL', 'ZALPHA', 'ZBETA']) {
      results.push(await pullAndPersist(t, store, TEST_TOKEN));
    }
    const byTicker = {};
    results.forEach(function (r) { byTicker[r.ticker] = r; });

    assert.strictEqual(byTicker.AAPL.action, 'SKIPPED_ALREADY_SEEDED');
    assert.strictEqual(byTicker.ZALPHA.action, 'WRITE');
    assert.strictEqual(byTicker.ZALPHA.body.status, 'STORE_WRITE');
    assert.strictEqual(byTicker.ZBETA.action, 'WRITE');
    assert.strictEqual(byTicker.ZBETA.body.status, 'STORE_WRITE');
    // AAPL record untouched (still the seeded empty-evidence company)
    assert.strictEqual(JSON.parse(store._map.get(companyKey('0000320193'))).evidenceItems.length, 0);
  });

  // ── P08: gate-off dormancy — orchestrator cannot write, store untouched ─────
  await test('P08: writer gate off -> DISABLED, zero store mutation', async function () {
    setEnv(WRITE_GATE, undefined);
    const store = makeMemStore();
    const out = await pullAndPersist('ZGAMMA', store, TEST_TOKEN);
    assert.strictEqual(out.action, 'WRITE');           // orchestrator attempted
    assert.strictEqual(out.body.status, 'DISABLED');   // but server refused
    assert.strictEqual(out.body.reason, 'SERVER_DISABLED');
    assert.strictEqual(store._map.size, 0, 'gate-off must not write to store');
    enableGate();
  });

  // ── P09: behavioral safety — the harness performed zero network fetches ─────
  await test('P09: harness performed zero network fetch() calls', async function () {
    assert.strictEqual(fetchCalls, 0, 'harness invoked fetch()');
  });

  await test('P10: fixture provider seam is inert (no fetch/env/fs/Blob/scoring)', async function () {
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/evidence-provider-sec10q-fixture.js'), 'utf8');
    assert.ok(!/\bfetch\s*\(/.test(src), 'fetch() present in fixture provider');
    assert.ok(!/process\.env/.test(src), 'process.env read in fixture provider');
    assert.ok(!/require\(\s*['"]fs['"]\s*\)/.test(src), 'fs required in fixture provider');
    assert.ok(!/@netlify\/blobs/.test(src), '@netlify/blobs referenced in fixture provider');
    assert.ok(!/\b(orchestrate|analyzeChunk|enforceScoreConsistency|_techCache)\b/.test(src), 'scoring ref in fixture provider');
    assert.ok(/function resolveCik\(/.test(src), 'resolveCik seam missing');
  });

  // ── cleanup ─────────────────────────────────────────────────────────────────
  disableGate();
  globalThis.fetch = _origFetch; // restore the network guard before reporting/exit

  const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
  if (failed > 0) { process.exit(1); }
}

runTests().catch(function (err) {
  process.stderr.write('FATAL: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
