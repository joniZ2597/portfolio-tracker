'use strict';

// Offline test for services/research-evidence-client.js (EG-20E-1).
// Pure/offline: every network path is exercised with an injected fake fetch.
// No live request, no browser, no app state, no scoring path is touched.

const assert = require('assert');
const {
  requestResearchEvidence,
  normalizeResearchEvidenceResponse,
  RESEARCH_EVIDENCE_CATEGORIES,
  RESEARCH_EVIDENCE_ENDPOINT
} = require('../services/research-evidence-client');

// ─── fake-fetch helpers ───────────────────────────────────────────────────────

function makeResponse(httpStatus, body) {
  const text = (typeof body === 'string') ? body : JSON.stringify(body);
  return {
    status: httpStatus,
    text: function () { return Promise.resolve(text); }
  };
}

function fakeFetch(httpStatus, body, capture) {
  return function (url, init) {
    if (capture) { capture.url = url; capture.init = init; capture.calls = (capture.calls || 0) + 1; }
    return Promise.resolve(makeResponse(httpStatus, body));
  };
}

function fetchMustNotBeCalled(state) {
  return function () {
    state.called = true;
    throw new Error('fetch must not be called for invalid input');
  };
}

function throwingFetch(name) {
  return function () {
    const err = new Error('boom');
    if (name) { err.name = name; }
    throw err;
  };
}

// Resolves only when the abort signal fires — used to exercise the real timer.
function abortableFetch() {
  return function (url, init) {
    return new Promise(function (_resolve, reject) {
      const signal = init && init.signal;
      if (!signal) { return; }
      if (signal.aborted) {
        const e0 = new Error('aborted'); e0.name = 'AbortError'; reject(e0); return;
      }
      signal.addEventListener('abort', function () {
        const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
      });
    });
  };
}

function okBody(extra) {
  const base = {
    status: 'OK',
    schemaVersion: 1,
    ticker: 'FROG',
    categories: ['earnings'],
    requestId: 're_test_abc123',
    cacheStatus: 'MISS',
    results: [{
      evidenceId: 'mock:FROG:earnings:1',
      category: 'earnings',
      claim: 'FROG mock earnings evidence 1',
      direction: 'positive',
      confidence: null,
      sourceLabel: null,
      requiresVerification: true,
      scoringImpact: 'none'
    }],
    provenance: {
      evidenceClass: 'non_scoring_sidecar',
      scoringImpact: 'none',
      requiresVerification: true,
      provider: 'mock',
      confidence: null
    },
    servedAt: '2026-06-23T00:00:00.000Z'
  };
  if (extra) { Object.keys(extra).forEach(function (k) { base[k] = extra[k]; }); }
  return base;
}

// ─── tests ────────────────────────────────────────────────────────────────────

async function run() {
  // 1. Exported allow-list is exactly the four fixed categories.
  assert.deepStrictEqual(RESEARCH_EVIDENCE_CATEGORIES, ['earnings', 'guidance', 'valuation', 'sec10q']);
  assert.strictEqual(RESEARCH_EVIDENCE_ENDPOINT, '/.netlify/functions/research-evidence');

  // 2. Invalid ticker -> CLIENT_INVALID_INPUT, no request sent.
  const badTickers = [123, null, undefined, '', '   ', 'BRK.B', 'ABCDEFGHIJK', '1AB', 'ab cd'];
  for (const t of badTickers) {
    const state = {};
    const r = await requestResearchEvidence(
      { ticker: t, categories: ['earnings'] },
      { fetchImpl: fetchMustNotBeCalled(state) }
    );
    assert.strictEqual(r.status, 'CLIENT_INVALID_INPUT', 'ticker=' + String(t));
    assert.strictEqual(r.reason, 'TICKER', 'ticker=' + String(t));
    assert.ok(!state.called, 'no fetch for ticker=' + String(t));
  }

  // 3. Invalid categories -> CLIENT_INVALID_INPUT, no request sent.
  const badCategories = [
    [],
    'earnings',
    [123],
    ['unknown'],
    ['earnings', 'bogus'],
    ['Earnings'],
    ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11']
  ];
  for (const c of badCategories) {
    const state = {};
    const r = await requestResearchEvidence(
      { ticker: 'FROG', categories: c },
      { fetchImpl: fetchMustNotBeCalled(state) }
    );
    assert.strictEqual(r.status, 'CLIENT_INVALID_INPUT', 'categories=' + JSON.stringify(c));
    assert.strictEqual(r.reason, 'CATEGORIES', 'categories=' + JSON.stringify(c));
    assert.ok(!state.called, 'no fetch for categories=' + JSON.stringify(c));
  }

  // 4. OK passthrough + input normalization (trim/uppercase/dedupe) + request shape.
  {
    const capture = {};
    const r = await requestResearchEvidence(
      { ticker: ' frog ', categories: [' earnings ', 'earnings'] },
      { fetchImpl: fakeFetch(200, okBody(), capture) }
    );
    assert.strictEqual(capture.calls, 1);
    assert.strictEqual(capture.url, '/.netlify/functions/research-evidence');
    assert.strictEqual(capture.init.method, 'POST');
    assert.strictEqual(capture.init.headers['Content-Type'], 'application/json');
    const sent = JSON.parse(capture.init.body);
    assert.deepStrictEqual(sent, { ticker: 'FROG', categories: ['earnings'] });

    assert.strictEqual(r.status, 'OK');
    assert.strictEqual(r.httpStatus, 200);
    assert.strictEqual(r.schemaVersion, 1);
    assert.strictEqual(r.ticker, 'FROG');
    assert.deepStrictEqual(r.categories, ['earnings']);
    assert.strictEqual(r.requestId, 're_test_abc123');
    assert.strictEqual(r.cacheStatus, 'MISS');
    assert.strictEqual(r.servedAt, '2026-06-23T00:00:00.000Z');
    // Evidence + provenance preserved verbatim.
    assert.deepStrictEqual(r.results, okBody().results);
    assert.deepStrictEqual(r.provenance, {
      evidenceClass: 'non_scoring_sidecar',
      scoringImpact: 'none',
      requiresVerification: true,
      provider: 'mock',
      confidence: null
    });
  }

  // 5. cacheStatus preserved verbatim for each listed value.
  for (const cs of ['HIT', 'MISS', 'BYPASS', 'DEGRADED']) {
    const r = await requestResearchEvidence(
      { ticker: 'FROG', categories: ['earnings'] },
      { fetchImpl: fakeFetch(200, okBody({ cacheStatus: cs })) }
    );
    assert.strictEqual(r.status, 'OK');
    assert.strictEqual(r.cacheStatus, cs);
  }

  // 6. Server control bodies preserved: DISABLED / NOT_INVOKED.
  {
    const r = await requestResearchEvidence(
      { ticker: 'FROG', categories: ['earnings'] },
      { fetchImpl: fakeFetch(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' }) }
    );
    assert.deepStrictEqual(r, { status: 'DISABLED', reason: 'SERVER_DISABLED', httpStatus: 200 });
  }
  {
    const r = await requestResearchEvidence(
      { ticker: 'FROG', categories: ['earnings'] },
      { fetchImpl: fakeFetch(200, { status: 'NOT_INVOKED', reason: 'SCAFFOLD_ONLY' }) }
    );
    assert.deepStrictEqual(r, { status: 'NOT_INVOKED', reason: 'SCAFFOLD_ONLY', httpStatus: 200 });
  }

  // 7. Server ERROR bodies preserved with their HTTP status.
  const errorCases = [
    [400, 'INVALID_TICKER'],
    [400, 'INVALID_CATEGORIES'],
    [400, 'INVALID_JSON'],
    [500, 'CONFIGURATION_MISSING'],
    [405, 'METHOD_NOT_ALLOWED']
  ];
  for (const [code, reason] of errorCases) {
    const r = await requestResearchEvidence(
      { ticker: 'FROG', categories: ['earnings'] },
      { fetchImpl: fakeFetch(code, { status: 'ERROR', reason: reason }) }
    );
    assert.deepStrictEqual(r, { status: 'ERROR', reason: reason, httpStatus: code });
  }

  // 8. CLIENT_INVALID_RESPONSE: unparseable / wrong-typed / wrong-shape bodies.
  const invalidResponses = [
    [200, 'not json at all'],
    [200, '[]'],
    [200, { foo: 1 }],                                   // object, no status string
    [200, { status: 42 }],                              // status not a string
    [200, { status: 'WAT' }],                           // unrecognized status, 2xx
    [200, okBody({ schemaVersion: 2 })],               // OK but wrong schemaVersion
    [200, (function () { const b = okBody(); delete b.results; return b; })()], // OK, no results
    [200, okBody({ provenance: null })]                // OK, bad provenance
  ];
  for (const [code, body] of invalidResponses) {
    const r = await requestResearchEvidence(
      { ticker: 'FROG', categories: ['earnings'] },
      { fetchImpl: fakeFetch(code, body) }
    );
    assert.strictEqual(r.status, 'CLIENT_INVALID_RESPONSE', 'body=' + JSON.stringify(body));
    assert.strictEqual(r.httpStatus, code);
  }

  // 9. CLIENT_HTTP_ERROR: unrecognized status string on a non-2xx transport.
  {
    const r = await requestResearchEvidence(
      { ticker: 'FROG', categories: ['earnings'] },
      { fetchImpl: fakeFetch(502, { status: 'GATEWAY_TIMEOUT' }) }
    );
    assert.deepStrictEqual(r, { status: 'CLIENT_HTTP_ERROR', httpStatus: 502 });
  }

  // 10. CLIENT_FETCH_ERROR: generic fetch failure.
  {
    const r = await requestResearchEvidence(
      { ticker: 'FROG', categories: ['earnings'] },
      { fetchImpl: throwingFetch('TypeError') }
    );
    assert.deepStrictEqual(r, { status: 'CLIENT_FETCH_ERROR' });
  }

  // 11. CLIENT_TIMEOUT: real AbortController timer drives the abort.
  {
    const r = await requestResearchEvidence(
      { ticker: 'FROG', categories: ['earnings'] },
      { fetchImpl: abortableFetch(), timeoutMs: 20 }
    );
    assert.deepStrictEqual(r, { status: 'CLIENT_TIMEOUT' });
  }

  // 12. Direct unit coverage of the pure normalizer.
  assert.strictEqual(normalizeResearchEvidenceResponse(200, '{bad').status, 'CLIENT_INVALID_RESPONSE');
  assert.deepStrictEqual(
    normalizeResearchEvidenceResponse(200, JSON.stringify({ status: 'DISABLED', reason: 'SERVER_DISABLED' })),
    { status: 'DISABLED', reason: 'SERVER_DISABLED', httpStatus: 200 }
  );
  assert.strictEqual(
    normalizeResearchEvidenceResponse(200, JSON.stringify({ status: 'ERROR' })).reason,
    null
  );

  console.log('research_evidence_client_adapter_test: PASS');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
