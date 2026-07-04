'use strict';

// Offline test for services/sec-evidence-store-client.js (EG-20C-4B-1).
// Pure/offline: every network path is exercised with an injected fake fetch.
// No live request, no browser, no app state, no scoring path is touched.
// The static sections scan ONLY the adapter source file; forbidden tokens
// appear in THIS file solely as search patterns.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ADAPTER_PATH = path.resolve(__dirname, '..', 'services', 'sec-evidence-store-client.js');

const {
  requestSecEvidenceStoreLookup,
  normalizeSecEvidenceStoreResponse,
  SEC_EVIDENCE_STORE_CATEGORIES,
  SEC_EVIDENCE_STORE_ENDPOINT
} = require(ADAPTER_PATH);

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

function rejectingFetch() {
  return function () {
    return Promise.reject(new Error('network down'));
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

// ─── seed-shaped fixtures (mirrors the kept EG-20C-4A AAPL sec10q record) ────
// Inert string data only: the fake fetch never contacts any host.

function seedItems() {
  return [
    {
      evidenceId: 'sec10q:AAPL:filing:2026-05-01',
      category: 'sec10q',
      claim: 'Form 10-Q filed for the quarterly period ending 2026-03-28 (filed 2026-05-01).',
      direction: 'neutral',
      confidence: null,
      sourceLabel: 'Form 10-Q',
      sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193&type=10-Q',
      sourceDate: '2026-05-01',
      sourceType: 'sec_filing',
      requiresVerification: true,
      scoringImpact: 'none'
    },
    {
      evidenceId: 'sec10q:AAPL:revenue:2026-03-28',
      category: 'sec10q',
      claim: 'Quarterly revenue of $111.184B vs $95.359B in the prior-year quarter.',
      direction: 'positive',
      confidence: null,
      sourceLabel: 'Form 10-Q — income statement',
      sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193&type=10-Q',
      sourceDate: '2026-05-01',
      sourceType: 'sec_filing',
      requiresVerification: true,
      scoringImpact: 'none'
    },
    {
      evidenceId: 'sec10q:AAPL:netincome:2026-03-28',
      category: 'sec10q',
      claim: 'Quarterly net income of $29.578B vs $24.78B in the prior-year quarter.',
      direction: 'positive',
      confidence: null,
      sourceLabel: 'Form 10-Q — income statement',
      sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193&type=10-Q',
      sourceDate: '2026-05-01',
      sourceType: 'sec_filing',
      requiresVerification: true,
      scoringImpact: 'none'
    }
  ];
}

function hitBody(extra) {
  const base = {
    status: 'STORE_HIT',
    provider: 'sec_evidence_store',
    cacheStatus: 'STORE_HIT',
    ticker: 'AAPL',
    categories: ['sec10q'],
    evidenceItems: seedItems(),
    scoringImpact: 'none'
  };
  if (extra) { Object.keys(extra).forEach(function (k) { base[k] = extra[k]; }); }
  return base;
}

// hitBody with the first item mutated (or the envelope, via the second arg).
function withItem(mutate) {
  const body = hitBody();
  mutate(body.evidenceItems[0], body);
  return body;
}

async function lookup(fetchImpl, input) {
  return requestSecEvidenceStoreLookup(input || { ticker: 'AAPL' }, { fetchImpl: fetchImpl });
}

// ─── tests ────────────────────────────────────────────────────────────────────

async function run() {
  // 1. Valid STORE_HIT with 3 seed-shaped items: verbatim passthrough.
  {
    const capture = {};
    const r = await lookup(fakeFetch(200, hitBody(), capture));
    assert.strictEqual(r.status, 'STORE_HIT');
    assert.strictEqual(r.httpStatus, 200);
    assert.strictEqual(r.ticker, 'AAPL');
    assert.deepStrictEqual(r.categories, ['sec10q']);
    assert.strictEqual(r.provider, 'sec_evidence_store');
    assert.strictEqual(r.cacheStatus, 'STORE_HIT');
    assert.strictEqual(r.scoringImpact, 'none');
    assert.strictEqual(r.evidenceItems.length, 3);
    // Never mutated / annotated: byte-identical to the payload as sent.
    assert.deepStrictEqual(r.evidenceItems, seedItems());
    assert.strictEqual(capture.calls, 1);
  }

  // 2. Valid empty STORE_HIT — valid, and distinguishable from STORE_MISS.
  {
    const rHit = await lookup(fakeFetch(200, hitBody({ evidenceItems: [] })));
    assert.strictEqual(rHit.status, 'STORE_HIT');
    assert.ok(Array.isArray(rHit.evidenceItems));
    assert.strictEqual(rHit.evidenceItems.length, 0);
    const rMiss = await lookup(fakeFetch(200, { status: 'STORE_MISS', ticker: 'AAPL', categories: ['sec10q'] }));
    assert.strictEqual(rMiss.status, 'STORE_MISS');
    assert.notStrictEqual(rHit.status, rMiss.status);
    assert.ok(!('evidenceItems' in rMiss));
  }

  // 3. STORE_MISS passthrough.
  {
    const r = await lookup(fakeFetch(200, { status: 'STORE_MISS', ticker: 'MSFT', categories: ['sec10q'] }), { ticker: 'MSFT' });
    assert.deepStrictEqual(r, { status: 'STORE_MISS', ticker: 'MSFT', categories: ['sec10q'], httpStatus: 200 });
  }

  // 4. STORE_INVALID passthrough.
  {
    const r = await lookup(fakeFetch(200, { status: 'STORE_INVALID', ticker: 'AAPL', categories: ['sec10q'] }));
    assert.deepStrictEqual(r, { status: 'STORE_INVALID', ticker: 'AAPL', categories: ['sec10q'], httpStatus: 200 });
  }

  // 5. DEGRADED: only the two server-emitted reasons are valid; a missing,
  //    unknown, or non-string reason is a malformed recognized response.
  {
    for (const reason of ['STORE_UNAVAILABLE', 'STORE_READ_FAILURE']) {
      const r = await lookup(fakeFetch(200, { status: 'DEGRADED', reason: reason }));
      assert.deepStrictEqual(r, { status: 'DEGRADED', reason: reason, httpStatus: 200 });
    }
    const badDegraded = [
      { status: 'DEGRADED' },
      { status: 'DEGRADED', reason: 'WHATEVER' },
      { status: 'DEGRADED', reason: 'SERVER_DISABLED' },
      { status: 'DEGRADED', reason: null },
      { status: 'DEGRADED', reason: 42 }
    ];
    for (const body of badDegraded) {
      const r = await lookup(fakeFetch(200, body));
      assert.deepStrictEqual(r, { status: 'CLIENT_INVALID_RESPONSE', httpStatus: 200 }, 'body=' + JSON.stringify(body));
    }
  }

  // 6. DISABLED: only the dormant-server body { reason: 'SERVER_DISABLED' }
  //    is valid; a missing or unknown reason is a malformed response.
  {
    const r = await lookup(fakeFetch(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' }));
    assert.deepStrictEqual(r, { status: 'DISABLED', reason: 'SERVER_DISABLED', httpStatus: 200 });
    const badDisabled = [
      { status: 'DISABLED' },
      { status: 'DISABLED', reason: 'GATE_OFF' },
      { status: 'DISABLED', reason: null },
      { status: 'DISABLED', reason: 42 }
    ];
    for (const body of badDisabled) {
      const rBad = await lookup(fakeFetch(200, body));
      assert.deepStrictEqual(rBad, { status: 'CLIENT_INVALID_RESPONSE', httpStatus: 200 }, 'body=' + JSON.stringify(body));
    }
  }

  // 7. Invalid ticker -> CLIENT_INVALID_INPUT, no request sent.
  //    Valid-but-messy ticker is normalized (trim + uppercase).
  {
    const badTickers = [123, null, undefined, '', '   ', 'BRK.B', 'ABCDEFGHIJK', '1AB', 'ab cd', 'AAPL$', {}];
    for (const t of badTickers) {
      const state = {};
      const r = await requestSecEvidenceStoreLookup({ ticker: t }, { fetchImpl: fetchMustNotBeCalled(state) });
      assert.strictEqual(r.status, 'CLIENT_INVALID_INPUT', 'ticker=' + String(t));
      assert.strictEqual(r.reason, 'TICKER', 'ticker=' + String(t));
      assert.ok(!state.called, 'no fetch for ticker=' + String(t));
    }
    const stateNoInput = {};
    const rNoInput = await requestSecEvidenceStoreLookup(undefined, { fetchImpl: fetchMustNotBeCalled(stateNoInput) });
    assert.strictEqual(rNoInput.status, 'CLIENT_INVALID_INPUT');
    assert.ok(!stateNoInput.called);

    const capture = {};
    const r = await requestSecEvidenceStoreLookup({ ticker: ' aapl ' }, { fetchImpl: fakeFetch(200, hitBody(), capture) });
    assert.strictEqual(r.status, 'STORE_HIT');
    assert.strictEqual(JSON.parse(capture.init.body).ticker, 'AAPL');
  }

  // 8. Unknown status string on 2xx -> CLIENT_INVALID_RESPONSE.
  //    ('OK' is the research-evidence vocabulary — unknown for the store.)
  {
    for (const status of ['WAT', 'OK', 'STORE_WRITE', 'NOT_INVOKED', 'ERROR']) {
      const r = await lookup(fakeFetch(200, { status: status }));
      assert.strictEqual(r.status, 'CLIENT_INVALID_RESPONSE', 'status=' + status);
      assert.strictEqual(r.httpStatus, 200);
    }
  }

  // 9. Missing / malformed evidenceItems or envelope -> CLIENT_INVALID_RESPONSE.
  {
    const badBodies = [
      withItem(function (_item, body) { delete body.evidenceItems; }),
      hitBody({ evidenceItems: {} }),
      hitBody({ evidenceItems: 'three' }),
      hitBody({ evidenceItems: null }),
      withItem(function (_item, body) { delete body.ticker; }),
      withItem(function (_item, body) { delete body.categories; }),
      withItem(function (_item, body) { delete body.scoringImpact; }),
      hitBody({ scoringImpact: 'low' }),
      { status: 'STORE_MISS' },                              // MISS without envelope
      { status: 'STORE_INVALID', ticker: 42, categories: ['sec10q'] }
    ];
    for (const body of badBodies) {
      const r = await lookup(fakeFetch(200, body));
      assert.strictEqual(r.status, 'CLIENT_INVALID_RESPONSE', 'body=' + JSON.stringify(body).slice(0, 120));
    }
  }

  // 9b. Request/response correlation + fixed STORE_HIT envelope fields.
  {
    // Response ticker must equal the normalized requested ticker exactly.
    const rTicker = await lookup(fakeFetch(200, hitBody({ ticker: 'MSFT' })));
    assert.deepStrictEqual(rTicker, { status: 'CLIENT_INVALID_RESPONSE', httpStatus: 200 }, 'HIT ticker mismatch');
    const rLower = await lookup(fakeFetch(200, hitBody({ ticker: 'aapl' })));
    assert.deepStrictEqual(rLower, { status: 'CLIENT_INVALID_RESPONSE', httpStatus: 200 }, 'HIT lowercase ticker');
    const rMissTicker = await lookup(fakeFetch(200, { status: 'STORE_MISS', ticker: 'MSFT', categories: ['sec10q'] }));
    assert.deepStrictEqual(rMissTicker, { status: 'CLIENT_INVALID_RESPONSE', httpStatus: 200 }, 'MISS ticker mismatch');

    // Response categories must be exactly ['sec10q'] — no extra, missing,
    // substituted, or wrongly-typed categories.
    const badCategories = [['sec10q', 'earnings'], ['earnings'], [], ['SEC10Q'], 'sec10q', [42], null];
    for (const cats of badCategories) {
      const rHit = await lookup(fakeFetch(200, hitBody({ categories: cats })));
      assert.deepStrictEqual(rHit, { status: 'CLIENT_INVALID_RESPONSE', httpStatus: 200 }, 'HIT categories=' + JSON.stringify(cats));
      const rMiss = await lookup(fakeFetch(200, { status: 'STORE_MISS', ticker: 'AAPL', categories: cats }));
      assert.deepStrictEqual(rMiss, { status: 'CLIENT_INVALID_RESPONSE', httpStatus: 200 }, 'MISS categories=' + JSON.stringify(cats));
    }

    // provider and cacheStatus are fixed for STORE_HIT.
    const badEnvelopes = [
      hitBody({ provider: 'mock' }),
      withItem(function (_item, body) { delete body.provider; }),
      hitBody({ cacheStatus: 'BYPASS' }),
      withItem(function (_item, body) { delete body.cacheStatus; })
    ];
    for (const body of badEnvelopes) {
      const r = await lookup(fakeFetch(200, body));
      assert.deepStrictEqual(r, { status: 'CLIENT_INVALID_RESPONSE', httpStatus: 200 },
        'provider=' + String(body.provider) + ' cacheStatus=' + String(body.cacheStatus));
    }
  }

  // 10. Invalid individual item fields -> CLIENT_INVALID_RESPONSE (all-or-nothing).
  {
    const badItems = [
      withItem(function (item) { item.scoringImpact = 'low'; }),
      withItem(function (item) { delete item.scoringImpact; }),
      withItem(function (item) { item.requiresVerification = false; }),
      withItem(function (item) { delete item.requiresVerification; }),
      withItem(function (item) { item.confidence = 0.9; }),
      withItem(function (item) { item.confidence = 'high'; }),
      withItem(function (item) { delete item.confidence; }),
      withItem(function (item) { item.direction = 'bullish'; }),
      withItem(function (item) { delete item.direction; }),
      withItem(function (item) { item.category = 'earnings'; }),
      withItem(function (item) { item.claim = ''; }),
      withItem(function (item) { item.claim = 42; }),
      withItem(function (item) { delete item.evidenceId; }),
      withItem(function (item) { item.sourceLabel = 42; }),
      withItem(function (item) { item.sourceDate = 20260501; }),
      withItem(function (item) { item.sourceType = ['sec_filing']; }),
      withItem(function (_item, body) { body.evidenceItems[0] = null; }),
      withItem(function (_item, body) { body.evidenceItems[0] = ['x']; })
    ];
    for (const body of badItems) {
      const r = await lookup(fakeFetch(200, body));
      assert.strictEqual(r.status, 'CLIENT_INVALID_RESPONSE', 'items=' + JSON.stringify(body.evidenceItems[0]).slice(0, 120));
    }
    // A later-position bad item also rejects the whole response.
    const tail = hitBody();
    tail.evidenceItems[2].direction = 'sideways';
    const rTail = await lookup(fakeFetch(200, tail));
    assert.strictEqual(rTail.status, 'CLIENT_INVALID_RESPONSE');
  }

  // 11. sourceUrl: null / absent / https accepted; anything else rejected.
  {
    const okNull = await lookup(fakeFetch(200, withItem(function (item) { item.sourceUrl = null; })));
    assert.strictEqual(okNull.status, 'STORE_HIT');
    const okAbsent = await lookup(fakeFetch(200, withItem(function (item) { delete item.sourceUrl; })));
    assert.strictEqual(okAbsent.status, 'STORE_HIT');
    const okHttps = await lookup(fakeFetch(200, withItem(function (item) { item.sourceUrl = 'https://example.com/filing'; })));
    assert.strictEqual(okHttps.status, 'STORE_HIT');

    const badUrls = [
      'http://example.com/filing',
      'ftp://example.com/filing',
      'javascript:alert(1)',
      'https://user:pass@example.com/filing',
      'https://exa mple.com/filing',
      '//example.com/filing',
      42
    ];
    for (const u of badUrls) {
      const r = await lookup(fakeFetch(200, withItem(function (item) { item.sourceUrl = u; })));
      assert.strictEqual(r.status, 'CLIENT_INVALID_RESPONSE', 'sourceUrl=' + String(u));
    }
  }

  // 12. Timeout: real AbortController timer drives the abort.
  {
    const r = await requestSecEvidenceStoreLookup({ ticker: 'AAPL' }, { fetchImpl: abortableFetch(), timeoutMs: 20 });
    assert.deepStrictEqual(r, { status: 'CLIENT_TIMEOUT' });
  }

  // 13. Fetch throw and fetch rejection -> CLIENT_FETCH_ERROR (never throws out).
  {
    const rThrow = await lookup(throwingFetch('TypeError'));
    assert.deepStrictEqual(rThrow, { status: 'CLIENT_FETCH_ERROR' });
    const rReject = await lookup(rejectingFetch());
    assert.deepStrictEqual(rReject, { status: 'CLIENT_FETCH_ERROR' });
  }

  // 14. Non-2xx HTTP -> CLIENT_HTTP_ERROR (server 400/405 bodies, gateway pages);
  //     a recognized store status on a non-2xx transport is a mismatch.
  {
    const httpCases = [
      [400, { status: 'INVALID_TICKER', reason: 'INVALID_TICKER' }],
      [400, { status: 'INVALID_CATEGORIES', reason: 'INVALID_CATEGORIES' }],
      [400, { status: 'INVALID_JSON', reason: 'INVALID_JSON' }],
      [405, { status: 'METHOD_NOT_ALLOWED', reason: 'METHOD_NOT_ALLOWED' }],
      [502, 'Bad Gateway'],
      [500, '<html>error</html>']
    ];
    for (const [code, body] of httpCases) {
      const r = await lookup(fakeFetch(code, body));
      assert.deepStrictEqual(r, { status: 'CLIENT_HTTP_ERROR', httpStatus: code }, 'code=' + code);
    }
    const rMismatch = await lookup(fakeFetch(500, hitBody()));
    assert.deepStrictEqual(rMismatch, { status: 'CLIENT_INVALID_RESPONSE', httpStatus: 500 });
    const rMissMismatch = await lookup(fakeFetch(404, { status: 'STORE_MISS', ticker: 'AAPL', categories: ['sec10q'] }));
    assert.deepStrictEqual(rMissMismatch, { status: 'CLIENT_INVALID_RESPONSE', httpStatus: 404 });
  }

  // 15. Malformed JSON / non-object 2xx bodies -> CLIENT_INVALID_RESPONSE.
  {
    for (const raw of ['not json at all', '{bad', '[]', '"str"', '42', 'null', '{"noStatus":1}', '{"status":42}']) {
      const r = await lookup(fakeFetch(200, raw));
      assert.strictEqual(r.status, 'CLIENT_INVALID_RESPONSE', 'raw=' + raw);
      assert.strictEqual(r.httpStatus, 200);
    }
  }

  // 16. Duplicate/single-flight: no single-flight is implemented in this slice;
  //     each invocation issues exactly one request, with no retry on any outcome.
  {
    const c1 = {};
    await lookup(fakeFetch(200, hitBody(), c1));
    assert.strictEqual(c1.calls, 1);
    const c2 = {};
    await lookup(fakeFetch(200, { status: 'DEGRADED', reason: 'STORE_READ_FAILURE' }, c2));
    assert.strictEqual(c2.calls, 1, 'no retry on DEGRADED');
  }

  // 17. Static: adapter source performs no storage access.
  const adapterSrc = fs.readFileSync(ADAPTER_PATH, 'utf8');
  {
    assert.ok(!/localStorage/.test(adapterSrc), 'no localStorage in adapter');
    assert.ok(!/sessionStorage/.test(adapterSrc), 'no sessionStorage in adapter');
    assert.ok(!/document\s*\./.test(adapterSrc), 'no DOM document access in adapter');
    assert.ok(!/window\s*\./.test(adapterSrc), 'no window access in adapter');
  }

  // 18. Static: no forbidden surfaces, no absolute/production/SEC URLs, and
  //     requiring the module performs no fetch (no auto-invocation).
  {
    assert.ok(!/pt_results|pt_tickers|pt_holdings/.test(adapterSrc), 'no app storage keys');
    assert.ok(!/\bpt_/.test(adapterSrc), 'no pt_-prefixed key references');
    assert.ok(!/orchestrate|analyzeChunk|enforceScoreConsistency|_techCache/.test(adapterSrc), 'no scoring surfaces');
    assert.ok(!/Deep\s*Dive|Actionable/i.test(adapterSrc), 'no deep-dive/actionable surfaces');
    assert.ok(!/https?:\/\//.test(adapterSrc), 'no absolute URL in adapter (relative endpoint only)');
    assert.ok(!/portfoliotrk|netlify\.app|sec\.gov/.test(adapterSrc), 'no production or SEC host');
    assert.strictEqual(SEC_EVIDENCE_STORE_ENDPOINT, '/.netlify/functions/sec-evidence-store');

    let loadCalls = 0;
    const hadFetch = Object.prototype.hasOwnProperty.call(global, 'fetch');
    const origFetch = global.fetch;
    global.fetch = function () { loadCalls += 1; return Promise.reject(new Error('must not be called at load')); };
    delete require.cache[require.resolve(ADAPTER_PATH)];
    require(ADAPTER_PATH);
    if (hadFetch) { global.fetch = origFetch; } else { delete global.fetch; }
    assert.strictEqual(loadCalls, 0, 'module load performs no fetch');
  }

  // 19. Categories cannot be overridden or extended by the caller,
  //     and the exported list is frozen.
  {
    assert.deepStrictEqual(SEC_EVIDENCE_STORE_CATEGORIES.slice(), ['sec10q']);
    assert.ok(Object.isFrozen(SEC_EVIDENCE_STORE_CATEGORIES), 'exported categories frozen');
    assert.throws(function () { SEC_EVIDENCE_STORE_CATEGORIES.push('earnings'); });
    assert.strictEqual(SEC_EVIDENCE_STORE_CATEGORIES.length, 1);

    const capture = {};
    const r = await requestSecEvidenceStoreLookup(
      { ticker: 'AAPL', categories: ['earnings', 'bogus', 'sec10q'] },
      { fetchImpl: fakeFetch(200, hitBody(), capture) }
    );
    assert.strictEqual(r.status, 'STORE_HIT');
    assert.deepStrictEqual(JSON.parse(capture.init.body).categories, ['sec10q']);
  }

  // 20. Request shape is exactly the AAPL/sec10q contract shape.
  {
    const capture = {};
    await requestSecEvidenceStoreLookup({ ticker: 'AAPL' }, { fetchImpl: fakeFetch(200, hitBody(), capture) });
    assert.strictEqual(capture.url, '/.netlify/functions/sec-evidence-store');
    assert.strictEqual(capture.init.method, 'POST');
    assert.deepStrictEqual(capture.init.headers, { 'Content-Type': 'application/json' });
    assert.strictEqual(capture.init.body, '{"ticker":"AAPL","categories":["sec10q"]}');
  }

  // 21. Direct unit coverage of the pure normalizer (third arg = the
  //     normalized requested ticker used for correlation).
  {
    assert.strictEqual(normalizeSecEvidenceStoreResponse(200, '{bad', 'AAPL').status, 'CLIENT_INVALID_RESPONSE');
    assert.deepStrictEqual(
      normalizeSecEvidenceStoreResponse(502, '<html>Bad Gateway</html>', 'AAPL'),
      { status: 'CLIENT_HTTP_ERROR', httpStatus: 502 }
    );
    assert.strictEqual(normalizeSecEvidenceStoreResponse(200, JSON.stringify(hitBody()), 'AAPL').status, 'STORE_HIT');
    assert.deepStrictEqual(
      normalizeSecEvidenceStoreResponse(500, JSON.stringify(hitBody()), 'AAPL'),
      { status: 'CLIENT_INVALID_RESPONSE', httpStatus: 500 }
    );
    // Correlation directly at the normalizer: expected ticker MSFT vs AAPL body.
    assert.deepStrictEqual(
      normalizeSecEvidenceStoreResponse(200, JSON.stringify(hitBody()), 'MSFT'),
      { status: 'CLIENT_INVALID_RESPONSE', httpStatus: 200 }
    );
    // DISABLED without SERVER_DISABLED is malformed after envelope tightening.
    assert.strictEqual(
      normalizeSecEvidenceStoreResponse(200, JSON.stringify({ status: 'DISABLED' }), 'AAPL').status,
      'CLIENT_INVALID_RESPONSE'
    );
  }

  console.log('sec_evidence_store_client_adapter_test: PASS');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
