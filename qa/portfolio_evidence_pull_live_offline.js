'use strict';

/*
 * qa/portfolio_evidence_pull_live_offline.js
 *
 * Real Portfolio Evidence Pull — Slice 2B offline harness.
 *
 * Proves the LIVE sec10q provider's pulled output is byte-compatible with the
 * SEC evidence-store writer, with ZERO real network / Blob / env / production:
 *
 *   getEvidenceWithCik (mocked fetch)  ->  { cik, items }
 *                                      ->  { ticker, cik, evidenceItems: items }
 *                                      ->  validateWritePayload
 *                                      ->  writer core (via event._testStore)
 *                                      ->  STORE_WRITE
 *
 * Composition of two shipped patterns:
 *   - Slice 2A (qa/sec10q_live_cik_seam_offline.js): an injected fetch over
 *     recorded SEC fixtures + a throwing global.fetch guard (no real network).
 *   - Phase 1 (qa/portfolio_evidence_pull_offline.js): an in-memory store, an
 *     in-process writer gate/token, an inline pull-and-persist orchestrator, and
 *     the writer core invoked via event._testStore (never @netlify/blobs).
 *
 * Filing-only: the fixtures serve exactly one 10-Q filing; the concept (XBRL)
 * URLs fall through to 404, so each pull yields a single filing item. The numeric
 * multi-item case is intentionally out of scope for this slice.
 *
 * Product decisions honored (unchanged): the CIK is surfaced EXPLICITLY from the
 * pull path (getEvidenceWithCik), never parsed from sourceUrl; the writer stays
 * CREATE-ONLY / un-seeded-only.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const liveProvider = require('../netlify/functions/lib/evidence-provider-sec10q-live');
const { handler: writerHandler } = require('../netlify/functions/lib/sec-evidence-store-writer-core');
const { validateWritePayload } = require('../netlify/functions/lib/evidence-writer');
const { cikKey, companyKey, readRecord } = require('../netlify/functions/lib/evidence-store');

const ROOT = path.resolve(__dirname, '..');
const PROVIDER_REL = 'netlify/functions/lib/evidence-provider-sec10q-live.js';
const WRITE_GATE = 'PT_ENABLE_SEC_EVIDENCE_STORE_WRITER_SERVER';
const TOKEN_ENV  = 'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN';
const TEST_TOKEN = 'test-portfolio-pull-live-token-a1b2c3d4';
const UA = 'PulseSlice2BTest/1.0 qa@example.com';
const CATS = ['sec10q'];
const STRONG = { consistency: 'strong' };

// ── in-process env helpers (NOT Netlify env; ephemeral to this process) ───────
function setEnv(name, value) {
  if (value === undefined) { delete process.env[name]; }
  else { process.env[name] = value; }
}
function enableGate() { setEnv(WRITE_GATE, 'true'); setEnv(TOKEN_ENV, TEST_TOKEN); }
function disableGate() { setEnv(WRITE_GATE, undefined); setEnv(TOKEN_ENV, undefined); }

// ── injected fetch over fixtures (from Slice 2A) ──────────────────────────────
function jsonResponse(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status, headers: { get: () => null }, text: async () => text };
}
function makeFetch(routes) {
  const spy = { calls: [], tickersCalls: 0 };
  spy.fn = async (url) => {
    const u = String(url);
    spy.calls.push(u);
    if (u.indexOf('company_tickers.json') !== -1) { spy.tickersCalls += 1; }
    for (const r of routes) {
      if (u.indexOf(r.match) !== -1) { return r.respond; }
    }
    return jsonResponse(404, {}); // unmatched (incl. concept URLs) -> filing-only
  };
  return spy;
}
function opts(spy, env, extra) {
  return Object.assign({ fetch: spy.fn, env: env, spacingMs: 0 }, extra || {});
}

// ── filing-only SEC fixtures ──────────────────────────────────────────────────
// company_tickers.json rows are index-keyed; submissions are routed per padded
// CIK so a batch fixture can resolve more than one ticker deterministically.
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

const UNIVERSE_ZLIVE = {
  tickersJson: tickersJsonOf([{ cikStr: 1000001, ticker: 'ZLIVE', title: 'Zlive Test Co' }]),
  submissionsByPaddedCik: {
    '0001000001': submissionsFor(1000001, '0001000001-26-000001', '2026-02-12', '2025-12-28', 'zlive-20251228.htm')
  }
};
const UNIVERSE_ZGAMMA = {
  tickersJson: tickersJsonOf([{ cikStr: 1000003, ticker: 'ZGAMMA', title: 'Zgamma Test Co' }]),
  submissionsByPaddedCik: {
    '0001000003': submissionsFor(1000003, '0001000003-26-000003', '2026-02-14', '2025-12-28', 'zgamma-20251228.htm')
  }
};
const UNIVERSE_BATCH = {
  tickersJson: tickersJsonOf([
    { cikStr: 1000001, ticker: 'ZLIVE', title: 'Zlive Test Co' },
    { cikStr: 1000002, ticker: 'ZBETA', title: 'Zbeta Test Co' }
  ]),
  submissionsByPaddedCik: {
    '0001000001': submissionsFor(1000001, '0001000001-26-000001', '2026-02-12', '2025-12-28', 'zlive-20251228.htm'),
    '0001000002': submissionsFor(1000002, '0001000002-26-000002', '2026-02-13', '2025-12-28', 'zbeta-20251228.htm')
  }
};

// ── inline orchestrator under test (the Slice 2B proof; not shipped as product) ─
// Un-seeded-only: if the CIK mapping already exists, SKIP before any pull/write.
async function pullAndPersistLive(ticker, providerOpts, store, token) {
  const pre = await readRecord(store, cikKey(ticker), STRONG);
  if (pre.state === 'OK') {
    return { ticker, action: 'SKIPPED_ALREADY_SEEDED' };
  }

  const pulled = await liveProvider.getEvidenceWithCik({ ticker, categories: CATS }, providerOpts);
  const cik = pulled.cik;                // explicit CIK from the pull path (2A seam)
  const items = pulled.items;
  if (!cik) {
    return { ticker, action: 'NO_CIK' };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ticker, action: 'NO_EVIDENCE' };
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

// ── stateful in-memory store modelling create-only Blob semantics (+ op spy) ───
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
  process.stdout.write('\n=== Real Portfolio Evidence Pull — Slice 2B (live provider -> writer, offline) ===\n\n');

  // Behavioral network guard: the provider must use the INJECTED fetch only, and
  // the writer must never fetch (it uses event._testStore). Any real global.fetch
  // call is a hard error. Restored in the finally below.
  let realFetchCalls = 0;
  const _origFetch = globalThis.fetch;
  globalThis.fetch = function () {
    realFetchCalls += 1;
    throw new Error('LIVE_NETWORK_FORBIDDEN');
  };

  enableGate();

  const sharedStore = makeMemStore();

  try {
    // ── S01: seam sanity ────────────────────────────────────────────────────
    await test('S01: getEvidenceWithCik (mocked) -> {cik,items}; cik 10 digits; items contract-shaped', async function () {
      const spy = makeFetch(routesForUniverse(UNIVERSE_ZLIVE));
      const out = await liveProvider.getEvidenceWithCik({ ticker: 'ZLIVE', categories: CATS }, opts(spy, { SEC_USER_AGENT: UA }));
      assert.deepStrictEqual(Object.keys(out).sort(), ['cik', 'items']);
      assert.ok(/^\d{10}$/.test(out.cik), 'cik must be exactly 10 digits, got: ' + out.cik);
      assert.ok(Array.isArray(out.items) && out.items.length >= 1, 'items must be a non-empty array');
      out.items.forEach(function (it) {
        assert.strictEqual(it.category, 'sec10q');
        assert.strictEqual(it.confidence, null);
        assert.strictEqual(it.requiresVerification, true);
        assert.strictEqual(it.scoringImpact, 'none');
        assert.ok(['positive', 'neutral', 'negative'].indexOf(it.direction) !== -1, 'direction');
        assert.ok(typeof it.claim === 'string' && it.claim.length > 0, 'claim');
      });
    });

    // ── S02: compatibility (core proof) ─────────────────────────────────────
    await test('S02: pulled {ticker,cik,evidenceItems} passes validateWritePayload (core proof)', async function () {
      const spy = makeFetch(routesForUniverse(UNIVERSE_ZLIVE));
      const out = await liveProvider.getEvidenceWithCik({ ticker: 'ZLIVE', categories: CATS }, opts(spy, { SEC_USER_AGENT: UA }));
      const v = validateWritePayload({ ticker: 'ZLIVE', cik: out.cik, evidenceItems: out.items });
      assert.strictEqual(v.ok, true, 'payload rejected: ' + (v.reason || ''));
      assert.strictEqual(v.ticker, 'ZLIVE');
      assert.strictEqual(v.cik, out.cik);
      assert.strictEqual(v.projectedItems.length, out.items.length);
    });

    // ── S03: un-seeded end-to-end -> STORE_WRITE, canonical records ──────────
    await test('S03: un-seeded pull->CIK->write -> 200 STORE_WRITE with canonical records', async function () {
      const spy = makeFetch(routesForUniverse(UNIVERSE_ZLIVE));
      const out = await pullAndPersistLive('ZLIVE', opts(spy, { SEC_USER_AGENT: UA }), sharedStore, TEST_TOKEN);
      assert.strictEqual(out.action, 'WRITE');
      assert.strictEqual(out.statusCode, 200);
      assert.strictEqual(out.body.status, 'STORE_WRITE');
      assert.strictEqual(out.body.ticker, 'ZLIVE');
      assert.strictEqual(out.body.cik, out.cik);
      assert.strictEqual(out.body.evidenceItemCount, out.itemCount);
      const mapping = JSON.parse(sharedStore._map.get(cikKey('ZLIVE')));
      assert.deepStrictEqual(Object.keys(mapping), ['cik']);
      assert.strictEqual(mapping.cik, out.cik);
      const company = JSON.parse(sharedStore._map.get(companyKey(out.cik)));
      assert.deepStrictEqual(Object.keys(company), ['evidenceItems']);
      assert.strictEqual(company.evidenceItems.length, out.itemCount);
    });

    // ── S04: re-pull seeded ticker -> SKIPPED (un-seeded-only), no pull/write ─
    await test('S04: re-pull seeded ticker -> SKIPPED_ALREADY_SEEDED, no pull, store unchanged', async function () {
      const sizeBefore = sharedStore._map.size;
      const spy = makeFetch(routesForUniverse(UNIVERSE_ZLIVE));
      const out = await pullAndPersistLive('ZLIVE', opts(spy, { SEC_USER_AGENT: UA }), sharedStore, TEST_TOKEN);
      assert.strictEqual(out.action, 'SKIPPED_ALREADY_SEEDED');
      assert.strictEqual(sharedStore._map.size, sizeBefore, 'store must be unchanged on skip');
      assert.strictEqual(spy.calls.length, 0, 'skip must occur before any provider fetch');
    });

    // ── S05: create-only invariants (bypassing the skip) ────────────────────
    await test('S05: direct re-write identical -> STORE_WRITE_NOOP; differing -> 409 MAPPING_VERIFY_CONFLICT', async function () {
      const spy = makeFetch(routesForUniverse(UNIVERSE_ZLIVE));
      const out = await liveProvider.getEvidenceWithCik({ ticker: 'ZLIVE', categories: CATS }, opts(spy, { SEC_USER_AGENT: UA }));
      const noop = await writerPost('ZLIVE', out.cik, out.items, sharedStore, TEST_TOKEN);
      assert.strictEqual(noop.statusCode, 200);
      assert.strictEqual(noop.body.status, 'STORE_WRITE_NOOP');

      const differing = out.items.map(function (it, i) {
        return i === 0 ? Object.assign({}, it, { claim: it.claim + ' (MUTATED)' }) : it;
      });
      const conflict = await writerPost('ZLIVE', out.cik, differing, sharedStore, TEST_TOKEN);
      assert.strictEqual(conflict.statusCode, 409);
      assert.strictEqual(conflict.body.status, 'CONFLICT');
      assert.strictEqual(conflict.body.reason, 'MAPPING_VERIFY_CONFLICT');
    });

    // ── S06: batch — pre-seeded skipped, un-seeded written ──────────────────
    await test('S06: batch [ZLIVE(seeded), ZBETA] -> ZLIVE SKIPPED, ZBETA WRITE; seed untouched', async function () {
      const store = makeMemStore();
      // Pre-seed ZLIVE (models an existing seed): mapping + empty-evidence company.
      store._map.set(cikKey('ZLIVE'), JSON.stringify({ cik: '0001000001' }));
      store._map.set(companyKey('0001000001'), JSON.stringify({ evidenceItems: [] }));

      const spy = makeFetch(routesForUniverse(UNIVERSE_BATCH));
      const results = [];
      for (const t of ['ZLIVE', 'ZBETA']) {
        results.push(await pullAndPersistLive(t, opts(spy, { SEC_USER_AGENT: UA }), store, TEST_TOKEN));
      }
      const byTicker = {};
      results.forEach(function (r) { byTicker[r.ticker] = r; });

      assert.strictEqual(byTicker.ZLIVE.action, 'SKIPPED_ALREADY_SEEDED');
      assert.strictEqual(byTicker.ZBETA.action, 'WRITE');
      assert.strictEqual(byTicker.ZBETA.body.status, 'STORE_WRITE');
      // pre-seeded ZLIVE company record untouched
      assert.strictEqual(JSON.parse(store._map.get(companyKey('0001000001'))).evidenceItems.length, 0);
    });

    // ── S07: gate-off dormancy — orchestrator attempts, writer refuses ──────
    await test('S07: writer gate off -> DISABLED, zero store mutation', async function () {
      setEnv(WRITE_GATE, undefined);
      const store = makeMemStore();
      const spy = makeFetch(routesForUniverse(UNIVERSE_ZGAMMA));
      const out = await pullAndPersistLive('ZGAMMA', opts(spy, { SEC_USER_AGENT: UA }), store, TEST_TOKEN);
      assert.strictEqual(out.action, 'WRITE');           // orchestrator attempted
      assert.strictEqual(out.body.status, 'DISABLED');   // but the server refused
      assert.strictEqual(out.body.reason, 'SERVER_DISABLED');
      assert.strictEqual(store._map.size, 0, 'gate-off must not write to store');
      assert.strictEqual(store._ops.set, 0, 'gate-off must not call store.set');
      enableGate();
    });

    // ── S08: zero real network (behavioral) ─────────────────────────────────
    await test('S08: zero real network — global.fetch guard never fired; injected fetch used', async function () {
      assert.strictEqual(realFetchCalls, 0, 'the real global.fetch must never be called');
      const spy = makeFetch(routesForUniverse(UNIVERSE_ZLIVE));
      const out = await liveProvider.getEvidenceWithCik({ ticker: 'ZLIVE', categories: CATS }, opts(spy, { SEC_USER_AGENT: UA }));
      assert.ok(spy.calls.length >= 1, 'provider must fetch via the injected fetch');
      assert.ok(out.items.length >= 1, 'injected fetch must yield items');
      assert.strictEqual(realFetchCalls, 0, 'still zero real global.fetch calls after a fresh pull');
    });

    // ── S09: provider static safety + writer Blob avoidance (behavioral) ────
    await test('S09: provider static-safe; writer stayed on the injected store (no @netlify/blobs)', async function () {
      const provSrc = fs.readFileSync(path.join(ROOT, PROVIDER_REL), 'utf8');
      assert.ok(!/@netlify\/blobs/.test(provSrc), '@netlify/blobs referenced in provider');
      assert.ok(!/localStorage|sessionStorage/.test(provSrc), 'web storage referenced in provider');
      assert.ok(!/\b(orchestrate|analyzeChunk|enforceScoreConsistency|_techCache)\b/.test(provSrc), 'scoring ref in provider');
      assert.ok(!/require\([^)]*evidence-(store|writer)/.test(provSrc), 'writer/store module required in provider');
      // Blob avoidance (behavioral): every writer read/write landed on the injected
      // in-memory store, so acquireStore returned event._testStore before any
      // @netlify/blobs handle was constructed.
      assert.ok(sharedStore._ops.get >= 1, 'writer must have read via the injected store');
      assert.ok(sharedStore._ops.set >= 1, 'writer must have written via the injected store');
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
