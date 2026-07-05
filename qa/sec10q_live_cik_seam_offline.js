'use strict';

/*
 * qa/sec10q_live_cik_seam_offline.js
 *
 * Real Portfolio Evidence Pull — Slice 2A offline test.
 *
 * Proves the additive explicit-CIK seam on the LIVE sec10q provider with ZERO
 * real network / Blob / env / production. Every SEC call is served by an
 * injected fetch over recorded SEC-style fixtures; a throwing global.fetch guard
 * is installed throughout to prove the provider never touches the real network.
 *
 * Covers the 8 required proofs:
 *   1. getEvidenceWithCik -> { cik, items } with cik exactly 10 digits
 *   2. cik comes from the company_tickers.json lookup used by the provider flow
 *   3. exactly one company_tickers.json fetch per invocation (no duplicate lookup)
 *   4. cik is NOT parsed from sourceUrl (padded 10-digit vs unpadded URL form;
 *      cik tracks the lookup value, not the URL)
 *   5. legacy getEvidence still returns the identical item Array
 *   6. missing SEC_USER_AGENT fails closed (throws) before any fetch
 *   7. unknown ticker -> { cik: null, items: [] }
 *   8. no @netlify/blobs / scoring / localStorage / writer-orchestrator introduced
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const liveProvider = require('../netlify/functions/lib/evidence-provider-sec10q-live');

const ROOT = path.resolve(__dirname, '..');
const PROVIDER_REL = 'netlify/functions/lib/evidence-provider-sec10q-live.js';
const UA = 'PulseSlice2ATest/1.0 qa@example.com';
const CATS = ['sec10q'];

// ── injected fetch over fixtures (no real network) ───────────────────────────
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
    return jsonResponse(404, {}); // unmatched -> companyconcept-not-found shape
  };
  return spy;
}

function pad10(v) { return String(v).padStart(10, '0'); }

// AAPL fixtures: one 10-Q filing; concepts fall through to 404 (filing-only item).
const TICKERS_AAPL = { '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' } };
const SUBMISSIONS_AAPL = {
  cik: '320193',
  filings: { recent: {
    form: ['10-Q'],
    filingDate: ['2026-02-12'],
    accessionNumber: ['0000320193-26-000007'],
    primaryDocument: ['aapl-20251228.htm'],
    reportDate: ['2025-12-28']
  } }
};

function routesFor(tickers, submissions) {
  return [
    { match: 'company_tickers.json', respond: jsonResponse(200, tickers) },
    { match: 'submissions/CIK', respond: jsonResponse(200, submissions) }
    // concept URLs fall through to 404 -> no numeric enrichment (filing-only)
  ];
}

function opts(spy, env, extra) {
  return Object.assign({ fetch: spy.fn, env: env, spacingMs: 0 }, extra || {});
}

function assertContractItem(item) {
  assert.strictEqual(item.category, 'sec10q', 'category');
  assert.strictEqual(item.confidence, null, 'confidence must be null');
  assert.strictEqual(item.requiresVerification, true, 'requiresVerification must be true');
  assert.strictEqual(item.scoringImpact, 'none', 'scoringImpact must be none');
  assert.ok(['positive', 'neutral', 'negative'].indexOf(item.direction) !== -1, 'direction');
  assert.ok(typeof item.claim === 'string' && item.claim.length > 0, 'claim');
}

function liveGuard() { throw new Error('LIVE_NETWORK_FORBIDDEN'); }

// ── runner (mirrors qa/run-writer-offline.js) ─────────────────────────────────
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
  process.stdout.write('\n=== Slice 2A — sec10q_live explicit-CIK seam (offline) ===\n\n');

  // Behavioral network guard: the provider must use the INJECTED fetch only.
  const _origFetch = global.fetch;
  global.fetch = liveGuard;

  // ── T1: getEvidenceWithCik -> { cik, items }, cik exactly 10 digits ─────────
  await test('T1: getEvidenceWithCik returns {cik,items}; cik is 10 digits; items non-scoring', async function () {
    const spy = makeFetch(routesFor(TICKERS_AAPL, SUBMISSIONS_AAPL));
    const out = await liveProvider.getEvidenceWithCik({ ticker: 'AAPL', categories: CATS }, opts(spy, { SEC_USER_AGENT: UA }));
    assert.deepStrictEqual(Object.keys(out).sort(), ['cik', 'items']);
    assert.ok(/^\d{10}$/.test(out.cik), 'cik must be exactly 10 digits, got: ' + out.cik);
    assert.ok(Array.isArray(out.items) && out.items.length >= 1, 'items must be a non-empty array');
    out.items.forEach(assertContractItem);
  });

  // ── T2: cik comes from the company_tickers.json lookup ──────────────────────
  await test('T2: cik equals pad10 of the company_tickers cik_str', async function () {
    const spy = makeFetch(routesFor(TICKERS_AAPL, SUBMISSIONS_AAPL));
    const out = await liveProvider.getEvidenceWithCik({ ticker: 'AAPL', categories: CATS }, opts(spy, { SEC_USER_AGENT: UA }));
    assert.ok(spy.tickersCalls >= 1, 'company_tickers.json must be fetched');
    assert.strictEqual(out.cik, pad10(TICKERS_AAPL['0'].cik_str)); // '0000320193'
  });

  // ── T3: exactly one company_tickers.json fetch per invocation ───────────────
  await test('T3: exactly one company_tickers.json fetch (no duplicate CIK lookup)', async function () {
    const spy = makeFetch(routesFor(TICKERS_AAPL, SUBMISSIONS_AAPL));
    await liveProvider.getEvidenceWithCik({ ticker: 'AAPL', categories: CATS }, opts(spy, { SEC_USER_AGENT: UA }));
    assert.strictEqual(spy.tickersCalls, 1, 'expected exactly 1 company_tickers fetch, got ' + spy.tickersCalls);
  });

  // ── T4: cik is NOT parsed from sourceUrl ────────────────────────────────────
  await test('T4: cik is padded (from lookup), not parsed from the unpadded sourceUrl; tracks lookup value', async function () {
    const spy = makeFetch(routesFor(TICKERS_AAPL, SUBMISSIONS_AAPL));
    const out = await liveProvider.getEvidenceWithCik({ ticker: 'AAPL', categories: CATS }, opts(spy, { SEC_USER_AGENT: UA }));
    // The filing item's sourceUrl encodes the UNPADDED cik (/data/320193/),
    // while the returned cik is the PADDED 10-digit form -> not a URL parse.
    const src = out.items[0].sourceUrl || '';
    assert.ok(/\/data\/320193\//.test(src), 'sourceUrl should carry the unpadded cik: ' + src);
    assert.strictEqual(out.cik, '0000320193', 'cik must be the padded lookup form');
    // cik tracks the company_tickers value, not the URL: change cik_str -> cik changes.
    const TICKERS_ALT = { '0': { cik_str: 1234567, ticker: 'AAPL', title: 'Alt Co' } };
    const SUB_ALT = { cik: '1234567', filings: { recent: {
      form: ['10-Q'], filingDate: ['2026-01-05'], accessionNumber: ['0001234567-26-000001'],
      primaryDocument: ['x.htm'], reportDate: ['2025-12-31']
    } } };
    const spy2 = makeFetch(routesFor(TICKERS_ALT, SUB_ALT));
    const out2 = await liveProvider.getEvidenceWithCik({ ticker: 'AAPL', categories: CATS }, opts(spy2, { SEC_USER_AGENT: UA }));
    assert.strictEqual(out2.cik, '0001234567', 'cik must track the company_tickers value');
  });

  // ── T5: legacy getEvidence returns the identical item Array ─────────────────
  await test('T5: legacy getEvidence returns an Array deep-equal to getEvidenceWithCik().items', async function () {
    const spyA = makeFetch(routesFor(TICKERS_AAPL, SUBMISSIONS_AAPL));
    const legacy = await liveProvider.getEvidence({ ticker: 'AAPL', categories: CATS }, opts(spyA, { SEC_USER_AGENT: UA }));
    assert.ok(Array.isArray(legacy), 'legacy getEvidence must return an Array');
    const spyB = makeFetch(routesFor(TICKERS_AAPL, SUBMISSIONS_AAPL));
    const withCik = await liveProvider.getEvidenceWithCik({ ticker: 'AAPL', categories: CATS }, opts(spyB, { SEC_USER_AGENT: UA }));
    assert.deepStrictEqual(legacy, withCik.items, 'legacy items must match the seam items');
  });

  // ── T6: missing SEC_USER_AGENT fails closed before any fetch ────────────────
  await test('T6: missing SEC_USER_AGENT throws SEC_USER_AGENT_MISSING before any fetch (both exports)', async function () {
    const spy1 = makeFetch(routesFor(TICKERS_AAPL, SUBMISSIONS_AAPL));
    let msg1 = '';
    try { await liveProvider.getEvidenceWithCik({ ticker: 'AAPL', categories: CATS }, opts(spy1, {})); }
    catch (e) { msg1 = e && e.message; }
    assert.strictEqual(msg1, 'SEC_USER_AGENT_MISSING');
    assert.strictEqual(spy1.calls.length, 0, 'no fetch may occur before the UA gate');

    const spy2 = makeFetch(routesFor(TICKERS_AAPL, SUBMISSIONS_AAPL));
    let msg2 = '';
    try { await liveProvider.getEvidence({ ticker: 'AAPL', categories: CATS }, opts(spy2, {})); }
    catch (e) { msg2 = e && e.message; }
    assert.strictEqual(msg2, 'SEC_USER_AGENT_MISSING');
    assert.strictEqual(spy2.calls.length, 0, 'legacy path must also fail closed before fetch');
  });

  // ── T7: unknown ticker -> { cik: null, items: [] } ──────────────────────────
  await test('T7: unknown ticker -> {cik:null, items:[]}; legacy -> []', async function () {
    const spy1 = makeFetch(routesFor(TICKERS_AAPL, SUBMISSIONS_AAPL));
    const unknown = await liveProvider.getEvidenceWithCik({ ticker: 'ZZZZ', categories: CATS }, opts(spy1, { SEC_USER_AGENT: UA }));
    assert.deepStrictEqual(unknown, { cik: null, items: [] });
    assert.strictEqual(spy1.tickersCalls, 1, 'unknown ticker still performs exactly one lookup');

    const spy2 = makeFetch(routesFor(TICKERS_AAPL, SUBMISSIONS_AAPL));
    const legacy = await liveProvider.getEvidence({ ticker: 'ZZZZ', categories: CATS }, opts(spy2, { SEC_USER_AGENT: UA }));
    assert.deepStrictEqual(legacy, []);

    // invalid category -> pre-fetch empty (cik null, zero fetch)
    const spy3 = makeFetch([]);
    const badCat = await liveProvider.getEvidenceWithCik({ ticker: 'AAPL', categories: ['earnings'] }, opts(spy3, { SEC_USER_AGENT: UA }));
    assert.deepStrictEqual(badCat, { cik: null, items: [] });
    assert.strictEqual(spy3.calls.length, 0, 'invalid category must not fetch');
  });

  // ── T8: static safety — seam introduces no forbidden surface ────────────────
  await test('T8: provider introduces no @netlify/blobs / scoring / localStorage / writer-orchestrator', async function () {
    const provSrc = fs.readFileSync(path.join(ROOT, PROVIDER_REL), 'utf8');
    assert.ok(!/@netlify\/blobs/.test(provSrc), '@netlify/blobs referenced');
    assert.ok(!/localStorage|sessionStorage/.test(provSrc), 'web storage referenced');
    assert.ok(!/\b(orchestrate|analyzeChunk|enforceScoreConsistency|_techCache)\b/.test(provSrc), 'scoring engine referenced');
    assert.ok(!/require\([^)]*evidence-(store|writer)/.test(provSrc), 'writer/store module required');
    // seam wiring present and shared-core based (no second lookup path)
    assert.ok(/function getEvidenceWithCik\(/.test(provSrc), 'getEvidenceWithCik missing');
    assert.ok(/module\.exports = \{ getEvidence, getEvidenceWithCik \}/.test(provSrc), 'exports not updated');
    assert.ok(/async function runGetEvidenceCore\(/.test(provSrc), 'shared core missing');
    assert.ok(/getEvidenceWithCik[\s\S]*?return runGetEvidenceCore\(request, options\);/.test(provSrc), 'seam must delegate to the shared core');
  });

  // ── cleanup ─────────────────────────────────────────────────────────────────
  global.fetch = _origFetch;

  const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
  if (failed > 0) { process.exit(1); }
}

runTests().catch(function (err) {
  process.stderr.write('FATAL: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
