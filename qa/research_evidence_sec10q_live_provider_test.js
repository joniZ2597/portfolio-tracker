'use strict';

// EG-20F-4 — offline test for the sec10q_live provider + its handler wiring.
// Pure Node, NO network: every SEC call is served by an injected fetch over
// recorded SEC-style fixtures. A live-network guard (a throwing global.fetch)
// is installed throughout to prove the provider never touches the real network.
// Run with `node qa/research_evidence_sec10q_live_provider_test.js`.

const assert = require('assert');
const { handler } = require('../netlify/functions/research-evidence');
const liveProvider = require('../netlify/functions/lib/evidence-provider-sec10q-live');

const SERVER_GATE = 'PT_ENABLE_RESEARCH_EVIDENCE_SERVER';
const PROVIDER_SELECTOR = 'PT_EVIDENCE_PROVIDER';
const CACHE_GATE = 'PT_EVIDENCE_CACHE';
const UA_ENV = 'SEC_USER_AGENT';

const UA = 'PulseDevTest/1.0 qa@example.com';
const DIRECTIONS = ['positive', 'neutral', 'negative'];
const ITEM_KEYS = [
  'evidenceId', 'category', 'claim', 'direction', 'confidence',
  'sourceLabel', 'sourceUrl', 'sourceDate', 'sourceType',
  'requiresVerification', 'scoringImpact'
];

// ── recorded SEC-style fixtures (synthetic but structurally real) ────────────
const TICKERS = {
  '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
  '1': { cik_str: 789019, ticker: 'MSFT', title: 'Microsoft Corporation' }
};

const SUBMISSIONS_AAPL = {
  cik: '320193',
  filings: {
    recent: {
      form: ['10-K', '10-Q', '10-Q'],
      filingDate: ['2025-11-01', '2026-02-12', '2025-08-01'],
      accessionNumber: ['0000320193-25-000110', '0000320193-26-000007', '0000320193-25-000070'],
      primaryDocument: ['aapl-20250927.htm', 'aapl-20251228.htm', 'aapl-20250628.htm'],
      reportDate: ['2025-09-27', '2025-12-28', '2025-06-28']
    }
  }
};

const SUBMISSIONS_NO_10Q = {
  cik: '320193',
  filings: {
    recent: {
      form: ['10-K', '8-K'],
      filingDate: ['2025-11-01', '2025-12-15'],
      accessionNumber: ['0000320193-25-000110', '0000320193-25-000120'],
      primaryDocument: ['aapl-20250927.htm', 'aapl-8k.htm'],
      reportDate: ['2025-09-27', '']
    }
  }
};

const SUBMISSIONS_MSFT = {
  cik: '789019',
  filings: {
    recent: {
      form: ['10-Q', '10-K'],
      filingDate: ['2025-04-24', '2024-07-30'],
      accessionNumber: ['0000789019-25-000050', '0000789019-24-000090'],
      primaryDocument: ['msft-20250331.htm', 'msft-20240630.htm'],
      reportDate: ['2025-03-31', '2024-06-30']
    }
  }
};

// Revenues: current 10-Q quarter up vs prior-year same quarter (+ a 10-K annual
// fact to ignore). current concept accn == latest filing accn here.
const REVENUES_AAPL = {
  cik: '320193', taxonomy: 'us-gaap', tag: 'Revenues',
  units: {
    USD: [
      { start: '2024-09-30', end: '2024-12-28', val: 119575000000, fy: 2025, fp: 'Q1', form: '10-Q', accn: '0000320193-25-000004' },
      { start: '2025-09-29', end: '2025-12-28', val: 124300000000, fy: 2026, fp: 'Q1', form: '10-Q', accn: '0000320193-26-000007', frame: 'CY2025Q4' },
      { start: '2024-09-29', end: '2025-09-27', val: 391035000000, fy: 2025, fp: 'FY', form: '10-K', accn: '0000320193-25-000110' }
    ]
  }
};

const NETINCOME_AAPL = {
  cik: '320193', taxonomy: 'us-gaap', tag: 'NetIncomeLoss',
  units: {
    USD: [
      { start: '2024-09-30', end: '2024-12-28', val: 33916000000, fy: 2025, fp: 'Q1', form: '10-Q', accn: '0000320193-25-000004' },
      { start: '2025-09-29', end: '2025-12-28', val: 36330000000, fy: 2026, fp: 'Q1', form: '10-Q', accn: '0000320193-26-000007' }
    ]
  }
};

// A concept with a current quarterly fact but NO prior-year counterpart.
const NETINCOME_NO_PRIOR = {
  cik: '320193', taxonomy: 'us-gaap', tag: 'NetIncomeLoss',
  units: {
    USD: [
      { start: '2025-09-29', end: '2025-12-28', val: 36330000000, fy: 2026, fp: 'Q1', form: '10-Q', accn: '0000320193-26-000007' }
    ]
  }
};

// BLOCKER 2 fixture: each filing/end carries BOTH a true 3-month quarter fact
// and a 9-month YTD/cumulative fact. The provider must compare quarter-vs-quarter
// (30 vs 28 => positive), never YTD-vs-YTD (80 vs 90 => would be negative).
const REVENUES_MSFT_QTR_YTD = {
  cik: '789019', taxonomy: 'us-gaap', tag: 'Revenues',
  units: {
    USD: [
      { start: '2024-12-31', end: '2025-03-31', val: 30000000000, fy: 2025, fp: 'Q3', form: '10-Q', accn: '0000789019-25-000050' }, // current quarter (90d)
      { start: '2024-06-30', end: '2025-03-31', val: 80000000000, fy: 2025, fp: 'Q3', form: '10-Q', accn: '0000789019-25-000050' }, // current YTD (~274d)
      { start: '2023-12-31', end: '2024-03-31', val: 28000000000, fy: 2024, fp: 'Q3', form: '10-Q', accn: '0000789019-24-000040' }, // prior quarter (91d)
      { start: '2023-06-30', end: '2024-03-31', val: 90000000000, fy: 2024, fp: 'Q3', form: '10-Q', accn: '0000789019-24-000040' }  // prior YTD
    ]
  }
};

// BLOCKER 2b: only YTD/cumulative facts (no true quarter) => omit numeric.
const REVENUES_AAPL_YTD_ONLY = {
  cik: '320193', taxonomy: 'us-gaap', tag: 'Revenues',
  units: {
    USD: [
      { start: '2025-06-30', end: '2025-12-28', val: 240000000000, fy: 2026, fp: 'Q2', form: '10-Q', accn: '0000320193-26-000007' }, // ~181d
      { start: '2024-06-30', end: '2024-12-28', val: 230000000000, fy: 2025, fp: 'Q2', form: '10-Q', accn: '0000320193-25-000004' }  // ~181d
    ]
  }
};

// BLOCKER 3 fixture: the concept's current quarter fact accn (…099) differs from
// the latest 10-Q filing accn (…007). Numeric sourceUrl must use …099.
const REVENUES_AAPL_DIFF_ACCN = {
  cik: '320193', taxonomy: 'us-gaap', tag: 'Revenues',
  units: {
    USD: [
      { start: '2025-09-29', end: '2025-12-28', val: 124300000000, fy: 2026, fp: 'Q1', form: '10-Q', accn: '0000320193-26-000099' },
      { start: '2024-09-30', end: '2024-12-28', val: 119575000000, fy: 2025, fp: 'Q1', form: '10-Q', accn: '0000320193-25-000004' }
    ]
  }
};

// ── injected fetch over fixtures (no real network) ───────────────────────────
function jsonResponse(status, body, headers) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const h = headers || {};
  return {
    status,
    headers: { get: (n) => { const k = String(n).toLowerCase(); return Object.prototype.hasOwnProperty.call(h, k) ? String(h[k]) : null; } },
    text: async () => text
  };
}

// Resolves the fetch, but the body read never settles — used to prove the
// abort timer stays armed THROUGH body consumption (fail closed, no hang).
function stallingBodyResponse(status) {
  return {
    status: status || 200,
    headers: { get: () => null },
    text: () => new Promise(() => {}) // never settles
  };
}

function makeFetch(routes) {
  const spy = { calls: [] };
  spy.fn = async (url, opts) => {
    spy.calls.push({ url: String(url), headers: (opts && opts.headers) || null });
    for (const r of routes) {
      if (String(url).indexOf(r.match) !== -1) {
        if (r.respond === 'REJECT') { throw new Error('SIMULATED_NETWORK_ERROR'); }
        if (typeof r.respond === 'function') { return r.respond(url, opts); }
        return r.respond;
      }
    }
    return jsonResponse(404, {}); // unmatched -> 404 (companyconcept-not-found shape)
  };
  return spy;
}

const M_TICKERS = 'company_tickers.json';
const M_SUBMISSIONS = 'submissions/CIK0000320193.json';
const M_SUBMISSIONS_MSFT = 'submissions/CIK0000789019.json';
const M_REV_PRIMARY = 'CIK0000320193/us-gaap/RevenueFromContractWithCustomerExcludingAssessedTax.json';
const M_REV_FALLBACK = 'CIK0000320193/us-gaap/Revenues.json';
const M_NETINCOME = 'CIK0000320193/us-gaap/NetIncomeLoss.json';
const M_MSFT_REV_PRIMARY = 'CIK0000789019/us-gaap/RevenueFromContractWithCustomerExcludingAssessedTax.json';
const M_MSFT_REV_FALLBACK = 'CIK0000789019/us-gaap/Revenues.json';

function happyRoutes() {
  return [
    { match: M_TICKERS, respond: jsonResponse(200, TICKERS) },
    { match: M_SUBMISSIONS, respond: jsonResponse(200, SUBMISSIONS_AAPL) },
    { match: M_REV_PRIMARY, respond: jsonResponse(404, {}) },        // taxonomy variance -> fall back
    { match: M_REV_FALLBACK, respond: jsonResponse(200, REVENUES_AAPL) },
    { match: M_NETINCOME, respond: jsonResponse(200, NETINCOME_AAPL) }
  ];
}

function setEnv(name, value) {
  if (value === undefined) { delete process.env[name]; } else { process.env[name] = value; }
}

async function invoke(method, body) {
  const event = { httpMethod: method };
  if (arguments.length > 1) { event.body = body; }
  const response = await handler(event);
  return { response, json: response.body ? JSON.parse(response.body) : null };
}

function assertError(actual, statusCode, reason) {
  assert.strictEqual(actual.response.statusCode, statusCode);
  assert.strictEqual(actual.json.status, 'ERROR');
  assert.strictEqual(actual.json.reason, reason);
}

function assertContractItem(item) {
  assert.deepStrictEqual(Object.keys(item).sort(), ITEM_KEYS.slice().sort());
  assert.strictEqual(item.category, 'sec10q');
  assert.strictEqual(typeof item.evidenceId, 'string');
  assert.ok(item.evidenceId.trim().length > 0 && item.evidenceId.length <= 160);
  assert.strictEqual(typeof item.claim, 'string');
  assert.ok(item.claim.trim().length > 0 && item.claim.length <= 1000);
  assert.ok(DIRECTIONS.includes(item.direction));
  assert.strictEqual(item.confidence, null);
  assert.strictEqual(item.requiresVerification, true);
  assert.strictEqual(item.scoringImpact, 'none');
  assert.ok(item.sourceType === null || item.sourceType === 'sec_filing');
  assert.ok(item.sourceUrl === null || /^https:\/\/(www\.)?sec\.gov\//.test(item.sourceUrl));
  assert.ok(item.sourceDate === null || /^\d{4}-\d{2}-\d{2}$/.test(item.sourceDate));
  assert.ok(item.sourceLabel === null || (typeof item.sourceLabel === 'string' && item.sourceLabel.trim().length > 0 && item.sourceLabel.length <= 200));
}

function assertNoLiveHosts(spy) {
  spy.calls.forEach((c) => {
    assert.ok(/^https:\/\/(www|data)\.sec\.gov\//.test(c.url), 'unexpected non-SEC URL: ' + c.url);
    assert.ok(c.headers && c.headers['User-Agent'] === UA, 'every SEC request must carry the identifiable User-Agent');
  });
}

function liveGuard() { throw new Error('LIVE_NETWORK_FORBIDDEN'); }

async function run() {
  const original = {
    gate: process.env[SERVER_GATE],
    provider: process.env[PROVIDER_SELECTOR],
    cache: process.env[CACHE_GATE],
    ua: process.env[UA_ENV],
    fetch: global.fetch
  };

  try {
    // Install the live-network guard for the entire direct-provider phase:
    // the provider must always use the injected options.fetch, never global.fetch.
    global.fetch = liveGuard;

    // --- 1. categories without sec10q => [] (and no fetch). -----------------
    {
      const spy = makeFetch([]);
      const opts = { env: { SEC_USER_AGENT: UA }, fetch: spy.fn, spacingMs: 0 };
      assert.deepStrictEqual(await liveProvider.getEvidence({ ticker: 'AAPL', categories: ['earnings'] }, opts), []);
      assert.deepStrictEqual(await liveProvider.getEvidence({ ticker: 'AAPL', categories: [] }, opts), []);
      assert.deepStrictEqual(await liveProvider.getEvidence({ ticker: 'AAPL', categories: undefined }, opts), []);
      assert.deepStrictEqual(await liveProvider.getEvidence({}, opts), []);
      assert.deepStrictEqual(await liveProvider.getEvidence(undefined, opts), []);
      assert.strictEqual(spy.calls.length, 0, 'no fetch when sec10q not requested');
    }

    // --- 2. Missing SEC_USER_AGENT fails closed BEFORE any fetch. -----------
    {
      const spy = makeFetch(happyRoutes());
      await assert.rejects(
        liveProvider.getEvidence({ ticker: 'AAPL', categories: ['sec10q'] }, { env: {}, fetch: spy.fn, spacingMs: 0 }),
        /SEC_USER_AGENT_MISSING/
      );
      await assert.rejects(
        liveProvider.getEvidence({ ticker: 'AAPL', categories: ['sec10q'] }, { env: { SEC_USER_AGENT: '   ' }, fetch: spy.fn, spacingMs: 0 }),
        /SEC_USER_AGENT_MISSING/
      );
      assert.strictEqual(spy.calls.length, 0, 'no SEC request without an identifiable UA');
    }

    // --- 3. Happy path: filing + revenue + net-income, contract-valid. ------
    {
      const spy = makeFetch(happyRoutes());
      const items = await liveProvider.getEvidence({ ticker: 'AAPL', categories: ['sec10q'] }, { env: { SEC_USER_AGENT: UA }, fetch: spy.fn, spacingMs: 0 });
      assert.ok(Array.isArray(items));
      assert.strictEqual(items.length, 3);
      items.forEach(assertContractItem);

      const ids = items.map((i) => i.evidenceId);
      assert.strictEqual(new Set(ids).size, ids.length, 'evidenceId values unique');
      assert.ok(items.every((i) => i.category === 'sec10q' && i.sourceType === 'sec_filing'));

      const filing = items.find((i) => /:filing:/.test(i.evidenceId));
      assert.ok(filing, 'filing-existence item present');
      assert.strictEqual(filing.direction, 'neutral');
      assert.ok(/Form 10-Q for the period ending 2025-12-28 \(filed 2026-02-12\)/.test(filing.claim));
      assert.strictEqual(filing.sourceDate, '2026-02-12');
      assert.strictEqual(filing.sourceUrl, 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000007/0000320193-26-000007-index.htm');

      const revenue = items.find((i) => /:revenue:/.test(i.evidenceId));
      assert.ok(revenue, 'revenue comparison present (via Revenues fallback tag)');
      assert.strictEqual(revenue.direction, 'positive');
      assert.ok(revenue.claim.indexOf('$124,300,000,000') !== -1 && revenue.claim.indexOf('$119,575,000,000') !== -1);
      assert.ok(/rose to/.test(revenue.claim));
      assert.strictEqual(revenue.sourceDate, '2025-12-28');

      const ni = items.find((i) => /:netincome:/.test(i.evidenceId));
      assert.ok(ni, 'net-income comparison present');
      assert.strictEqual(ni.direction, 'positive');
      assert.ok(ni.claim.indexOf('$36,330,000,000') !== -1 && ni.claim.indexOf('$33,916,000,000') !== -1);

      assertNoLiveHosts(spy);
      assert.ok(spy.calls.some((c) => c.url.indexOf(M_REV_PRIMARY) !== -1));
      assert.ok(spy.calls.some((c) => c.url.indexOf(M_REV_FALLBACK) !== -1));
    }

    // --- 4. No comparable data => omit numeric item (filing-only). ----------
    {
      const spy = makeFetch([
        { match: M_TICKERS, respond: jsonResponse(200, TICKERS) },
        { match: M_SUBMISSIONS, respond: jsonResponse(200, SUBMISSIONS_AAPL) },
        { match: M_REV_PRIMARY, respond: jsonResponse(404, {}) },
        { match: M_REV_FALLBACK, respond: jsonResponse(404, {}) },   // no revenue tag reported
        { match: M_NETINCOME, respond: jsonResponse(200, NETINCOME_NO_PRIOR) } // no prior-year counterpart
      ]);
      const items = await liveProvider.getEvidence({ ticker: 'AAPL', categories: ['sec10q'] }, { env: { SEC_USER_AGENT: UA }, fetch: spy.fn, spacingMs: 0 });
      assert.strictEqual(items.length, 1, 'only the filing-existence item — no fabricated numbers');
      assert.ok(/:filing:/.test(items[0].evidenceId));
      assertContractItem(items[0]);
    }

    // ===================== BLOCKER 1 — timeout covers body read ============
    // fetch resolves but text() stalls; the abort timer must reject (fail
    // closed) without hanging.
    {
      const spy = makeFetch([
        { match: M_TICKERS, respond: jsonResponse(200, TICKERS) },
        { match: M_SUBMISSIONS, respond: stallingBodyResponse(200) }
      ]);
      const started = Date.now();
      await assert.rejects(
        liveProvider.getEvidence({ ticker: 'AAPL', categories: ['sec10q'] }, { env: { SEC_USER_AGENT: UA }, fetch: spy.fn, spacingMs: 0, timeoutMs: 30 }),
        'a stalled response body must fail closed via the abort timeout'
      );
      const elapsed = Date.now() - started;
      assert.ok(elapsed < 2000, 'must not hang on a stalled body (elapsed ' + elapsed + 'ms)');
    }

    // ===================== BLOCKER 2 — quarter, never YTD =================
    {
      const spy = makeFetch([
        { match: M_TICKERS, respond: jsonResponse(200, TICKERS) },
        { match: M_SUBMISSIONS_MSFT, respond: jsonResponse(200, SUBMISSIONS_MSFT) },
        { match: M_MSFT_REV_PRIMARY, respond: jsonResponse(404, {}) },
        { match: M_MSFT_REV_FALLBACK, respond: jsonResponse(200, REVENUES_MSFT_QTR_YTD) }
        // NetIncomeLoss unmatched -> 404 -> omitted
      ]);
      const items = await liveProvider.getEvidence({ ticker: 'MSFT', categories: ['sec10q'] }, { env: { SEC_USER_AGENT: UA }, fetch: spy.fn, spacingMs: 0 });
      const revenue = items.find((i) => /:revenue:/.test(i.evidenceId));
      assert.ok(revenue, 'quarter revenue comparison present');
      // Quarter compare (30B > 28B) => positive; YTD compare (80B < 90B) would be negative.
      assert.strictEqual(revenue.direction, 'positive', 'must compare true-quarter facts, not YTD');
      assert.ok(revenue.claim.indexOf('$30,000,000,000') !== -1 && revenue.claim.indexOf('$28,000,000,000') !== -1, 'quarter values used');
      assert.ok(revenue.claim.indexOf('$80,000,000,000') === -1 && revenue.claim.indexOf('$90,000,000,000') === -1, 'YTD values must NOT appear');
      assert.strictEqual(revenue.sourceDate, '2025-03-31');
      items.forEach(assertContractItem);
    }

    // --- BLOCKER 2b — only YTD facts (no true quarter) => omit numeric. -----
    {
      const spy = makeFetch([
        { match: M_TICKERS, respond: jsonResponse(200, TICKERS) },
        { match: M_SUBMISSIONS, respond: jsonResponse(200, SUBMISSIONS_AAPL) },
        { match: M_REV_PRIMARY, respond: jsonResponse(404, {}) },
        { match: M_REV_FALLBACK, respond: jsonResponse(200, REVENUES_AAPL_YTD_ONLY) },
        { match: M_NETINCOME, respond: jsonResponse(404, {}) }
      ]);
      const items = await liveProvider.getEvidence({ ticker: 'AAPL', categories: ['sec10q'] }, { env: { SEC_USER_AGENT: UA }, fetch: spy.fn, spacingMs: 0 });
      assert.strictEqual(items.length, 1, 'no true-quarter comparable => filing-only, no fabrication');
      assert.ok(/:filing:/.test(items[0].evidenceId));
    }

    // ===================== BLOCKER 3 — numeric anchored to fact accn =======
    {
      const spy = makeFetch([
        { match: M_TICKERS, respond: jsonResponse(200, TICKERS) },
        { match: M_SUBMISSIONS, respond: jsonResponse(200, SUBMISSIONS_AAPL) }, // latest filing accn …007
        { match: M_REV_PRIMARY, respond: jsonResponse(404, {}) },
        { match: M_REV_FALLBACK, respond: jsonResponse(200, REVENUES_AAPL_DIFF_ACCN) }, // concept fact accn …099
        { match: M_NETINCOME, respond: jsonResponse(404, {}) }
      ]);
      const items = await liveProvider.getEvidence({ ticker: 'AAPL', categories: ['sec10q'] }, { env: { SEC_USER_AGENT: UA }, fetch: spy.fn, spacingMs: 0 });
      const filing = items.find((i) => /:filing:/.test(i.evidenceId));
      const revenue = items.find((i) => /:revenue:/.test(i.evidenceId));
      assert.ok(filing && revenue);
      // Numeric sourceUrl + evidenceId use the concept fact's accession (…099),
      // NOT the latest filing accession (…007).
      assert.strictEqual(revenue.sourceUrl, 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000099/0000320193-26-000099-index.htm');
      assert.ok(revenue.evidenceId.indexOf('0000320193-26-000099') !== -1);
      assert.ok(revenue.sourceUrl.indexOf('0000320193-26-000007') === -1, 'must not use the latest filing accession');
      assert.strictEqual(filing.sourceUrl, 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000007/0000320193-26-000007-index.htm');
      items.forEach(assertContractItem);
    }

    // --- 5. Concept-level 429 stops remaining enrichment (filing-only). -----
    {
      const spy = makeFetch([
        { match: M_TICKERS, respond: jsonResponse(200, TICKERS) },
        { match: M_SUBMISSIONS, respond: jsonResponse(200, SUBMISSIONS_AAPL) },
        { match: M_REV_PRIMARY, respond: jsonResponse(429, {}) }, // rate-limited -> back off all enrichment
        { match: M_REV_FALLBACK, respond: jsonResponse(200, REVENUES_AAPL) },
        { match: M_NETINCOME, respond: jsonResponse(200, NETINCOME_AAPL) }
      ]);
      const items = await liveProvider.getEvidence({ ticker: 'AAPL', categories: ['sec10q'] }, { env: { SEC_USER_AGENT: UA }, fetch: spy.fn, spacingMs: 0 });
      assert.strictEqual(items.length, 1, '429 backs off: filing-only');
      assert.ok(/:filing:/.test(items[0].evidenceId));
      assert.ok(!spy.calls.some((c) => c.url.indexOf(M_NETINCOME) !== -1), 'enrichment stopped: net income not fetched after 429');
    }

    // --- 5b. Revenue succeeds, then a LATER concept 429s => still filing-only.
    // Any concept-level 429 backs off ALL enrichment, discarding a numeric item
    // an earlier concept already produced. Net income IS attempted (and 429s);
    // nothing is enriched once a 429 is seen.
    {
      const spy = makeFetch([
        { match: M_TICKERS, respond: jsonResponse(200, TICKERS) },
        { match: M_SUBMISSIONS, respond: jsonResponse(200, SUBMISSIONS_AAPL) },
        { match: M_REV_PRIMARY, respond: jsonResponse(404, {}) },
        { match: M_REV_FALLBACK, respond: jsonResponse(200, REVENUES_AAPL) }, // would produce a numeric item
        { match: M_NETINCOME, respond: jsonResponse(429, {}) }               // rate-limited -> back off all
      ]);
      const items = await liveProvider.getEvidence({ ticker: 'AAPL', categories: ['sec10q'] }, { env: { SEC_USER_AGENT: UA }, fetch: spy.fn, spacingMs: 0 });
      assert.strictEqual(items.length, 1, 'a later 429 discards already-computed revenue: filing-only');
      assert.ok(/:filing:/.test(items[0].evidenceId));
      assert.ok(!items.some((i) => /:revenue:/.test(i.evidenceId)), 'revenue item must NOT be returned once a later concept 429s');
      assert.ok(!items.some((i) => /:netincome:/.test(i.evidenceId)), 'no net-income item from a 429');
      assert.ok(spy.calls.some((c) => c.url.indexOf(M_REV_FALLBACK) !== -1), 'revenue was attempted (and succeeded)');
      assert.ok(spy.calls.some((c) => c.url.indexOf(M_NETINCOME) !== -1), 'net income IS attempted and returns 429');
      items.forEach(assertContractItem);
    }

    // --- 6. Backbone (submissions) hardening failures => fail closed (reject).
    {
      const big = String(5 * 1024 * 1024 + 1); // exceeds the 5 MB default cap
      const badResponses = [
        { label: '429', respond: jsonResponse(429, {}) },
        { label: '503', respond: jsonResponse(503, {}) },
        { label: 'non-JSON', respond: jsonResponse(200, '<html>not json</html>') },
        { label: 'oversize-header', respond: jsonResponse(200, SUBMISSIONS_AAPL, { 'content-length': big }) },
        { label: 'timeout/network', respond: 'REJECT' }
      ];
      for (const bad of badResponses) {
        const spy = makeFetch([
          { match: M_TICKERS, respond: jsonResponse(200, TICKERS) },
          { match: M_SUBMISSIONS, respond: bad.respond }
        ]);
        await assert.rejects(
          liveProvider.getEvidence({ ticker: 'AAPL', categories: ['sec10q'] }, { env: { SEC_USER_AGENT: UA }, fetch: spy.fn, spacingMs: 0 }),
          'submissions ' + bad.label + ' must fail closed'
        );
      }
      // Body-length cap (small maxBytes) also fails closed.
      const spyCap = makeFetch(happyRoutes());
      await assert.rejects(
        liveProvider.getEvidence({ ticker: 'AAPL', categories: ['sec10q'] }, { env: { SEC_USER_AGENT: UA }, fetch: spyCap.fn, spacingMs: 0, maxBytes: 5 }),
        'tiny maxBytes must fail closed'
      );
    }

    // --- 7. Unknown ticker => [] (graceful; submissions never fetched). -----
    {
      const spy = makeFetch([{ match: M_TICKERS, respond: jsonResponse(200, TICKERS) }]);
      const items = await liveProvider.getEvidence({ ticker: 'ZZZZ', categories: ['sec10q'] }, { env: { SEC_USER_AGENT: UA }, fetch: spy.fn, spacingMs: 0 });
      assert.deepStrictEqual(items, []);
      assert.ok(spy.calls.every((c) => c.url.indexOf(M_TICKERS) !== -1), 'only the ticker map was fetched');
    }

    // --- 8. No 10-Q present => [] (graceful). -------------------------------
    {
      const spy = makeFetch([
        { match: M_TICKERS, respond: jsonResponse(200, TICKERS) },
        { match: M_SUBMISSIONS, respond: jsonResponse(200, SUBMISSIONS_NO_10Q) }
      ]);
      const items = await liveProvider.getEvidence({ ticker: 'AAPL', categories: ['sec10q'] }, { env: { SEC_USER_AGENT: UA }, fetch: spy.fn, spacingMs: 0 });
      assert.deepStrictEqual(items, []);
    }

    // ===================== handler integration ============================
    // --- 9. Gate-off remains DISABLED (provider never selected/invoked). ----
    setEnv(SERVER_GATE, undefined);
    setEnv(PROVIDER_SELECTOR, 'sec10q_live');
    setEnv(CACHE_GATE, undefined);
    setEnv(UA_ENV, UA);
    global.fetch = liveGuard; // would throw if any SEC call were attempted
    {
      const actual = await invoke('POST', JSON.stringify({ ticker: 'AAPL', categories: ['sec10q'] }));
      assert.strictEqual(actual.response.statusCode, 200);
      assert.deepStrictEqual(actual.json, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
    }

    // --- 10. Gate on + selector sec10q_live + POST => OK (injected fetch). --
    setEnv(SERVER_GATE, 'true');
    {
      const handlerSpy = makeFetch(happyRoutes());
      global.fetch = handlerSpy.fn; // handler calls the provider without options -> uses global.fetch + process.env
      const actual = await invoke('POST', JSON.stringify({ ticker: 'aapl', categories: [' sec10q '] }));
      assert.strictEqual(actual.response.statusCode, 200);
      assert.strictEqual(actual.json.status, 'OK');
      assert.strictEqual(actual.json.schemaVersion, 1);
      assert.strictEqual(actual.json.ticker, 'AAPL');
      assert.deepStrictEqual(actual.json.categories, ['sec10q']);
      assert.strictEqual(actual.json.cacheStatus, 'BYPASS'); // cache gate off
      assert.deepStrictEqual(actual.json.provenance, {
        evidenceClass: 'non_scoring_sidecar',
        scoringImpact: 'none',
        requiresVerification: true,
        provider: 'sec10q_live',
        confidence: null
      });
      assert.ok(Array.isArray(actual.json.results) && actual.json.results.length === 3);
      actual.json.results.forEach(assertContractItem);
      assertNoLiveHosts(handlerSpy);
    }

    // --- 11. mock and sec10q_fixture selectors unchanged (regression). ------
    global.fetch = liveGuard; // neither path performs network I/O
    setEnv(PROVIDER_SELECTOR, 'mock');
    {
      const actual = await invoke('POST', JSON.stringify({ ticker: 'AAPL', categories: ['earnings'] }));
      assert.strictEqual(actual.json.status, 'OK');
      assert.strictEqual(actual.json.provenance.provider, 'mock');
      assert.strictEqual(actual.json.cacheStatus, 'BYPASS');
    }
    setEnv(PROVIDER_SELECTOR, 'sec10q_fixture');
    {
      const actual = await invoke('POST', JSON.stringify({ ticker: 'AAPL', categories: ['sec10q'] }));
      assert.strictEqual(actual.json.status, 'OK');
      assert.strictEqual(actual.json.provenance.provider, 'sec10q_fixture');
    }

    // --- 12. Unknown / missing selector unchanged (500 CONFIGURATION_MISSING).
    setEnv(PROVIDER_SELECTOR, undefined);
    assertError(await invoke('POST', JSON.stringify({ ticker: 'AAPL', categories: ['sec10q'] })), 500, 'CONFIGURATION_MISSING');
    setEnv(PROVIDER_SELECTOR, 'unknown');
    assertError(await invoke('POST', JSON.stringify({ ticker: 'AAPL', categories: ['sec10q'] })), 500, 'CONFIGURATION_MISSING');

    console.log('research_evidence_sec10q_live_provider_test: PASS');
  } finally {
    setEnv(SERVER_GATE, original.gate);
    setEnv(PROVIDER_SELECTOR, original.provider);
    setEnv(CACHE_GATE, original.cache);
    setEnv(UA_ENV, original.ua);
    global.fetch = original.fetch;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
