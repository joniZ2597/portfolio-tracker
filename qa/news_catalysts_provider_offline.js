'use strict';

/*
 * qa/news_catalysts_provider_offline.js
 *
 * EG-25C-3 · C3-S1 — J3 news/catalysts provider: NP-series offline QA.
 *
 * Proves the pure provider lib (netlify/functions/lib/news-catalysts-provider.js)
 * with ZERO real network / Blob / env / store / DOM / production. Every
 * upstream call is served by an INJECTED fetch over inline Sonar-style
 * response fixtures, and a throwing global.fetch guard is installed
 * throughout to prove the provider never touches the real network.
 *
 * Coverage (NP01–NP23, contiguous — the P1-xx scheme is retired):
 *   NP01 full-coverage benchmark  — exact deep-equal + stringify-equal envelope
 *   NP02 Tier A transport         — throw / timeout / non-2xx ⇒ PROVIDER_FAILURE
 *   NP03 Tier B structural (7+1)  — each condition ⇒ PROVIDER_INVALID_RESPONSE
 *   NP04 mixed batch              — valid items survive; invalid siblings skip
 *   NP05 eventDate missing/invalid            NP06 sourceUrl missing/invalid
 *   NP07 grounding miss                       NP08 grounded-value persistence
 *   NP09 malformed grounding entries excluded NP10 duplicate identity in batch
 *   NP11 unknown category                     NP12 invalid direction
 *   NP13 zero-item success                    NP14 URL normalization (3 only)
 *   NP15 deterministic identity               NP16 title/summary hash-inert
 *   NP17 store-key shape                      NP18 J7 freshness integration
 *   NP19 evidence-contract reuse              NP20 fail-closed injection order
 *   NP21 purity + determinism                 NP22 malformed values never throw
 *   NP23 forbidden-surface scan of the TARGET module
 *
 * Run: node qa/news_catalysts_provider_offline.js
 * (QA seam: NEWS_CATALYSTS_PROVIDER_PATH overrides the module under test for
 *  a candidate build; evidence-contract / evidence-freshness resolve beside
 *  whichever provider path is active.)
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SRC = process.env.NEWS_CATALYSTS_PROVIDER_PATH
  ? path.resolve(process.env.NEWS_CATALYSTS_PROVIDER_PATH)
  : path.resolve(__dirname, '..', 'netlify', 'functions', 'lib', 'news-catalysts-provider.js');
const provider = require(SRC);
const contract = require(path.join(path.dirname(SRC), 'evidence-contract.js'));
const freshness = require(path.join(path.dirname(SRC), 'evidence-freshness.js'));

const TICKER = 'FROG';
const NOW_ISO = '2026-07-24T00:00:00.000Z';
const NOW_MS = Date.parse(NOW_ISO); // fixed-string parse — deterministic, no ambient clock
const PROVIDER_ID = 'j3-news-catalysts@job-model-v1';

const ITEM_FIELD_ORDER = [
  'ticker', 'eventDate', 'category', 'direction', 'sourceUrl',
  'normalizedSourceUrl', 'sourceDomain', 'provider', 'retrievedAt',
  'identityHash', 'provenance', 'confidence', 'requiresVerification', 'scoringImpact'
];

// ── fixture builders ─────────────────────────────────────────────────────────

function rawItem(eventDate, category, direction, sourceUrl, extra) {
  var it = {};
  if (eventDate !== undefined) { it.eventDate = eventDate; }
  if (category !== undefined) { it.category = category; }
  if (direction !== undefined) { it.direction = direction; }
  if (sourceUrl !== undefined) { it.sourceUrl = sourceUrl; }
  return Object.assign(it, extra || {});
}

// Sonar-style response envelope. citations/search_results: undefined ⇒ key
// absent from the response entirely.
function sonarResponse(items, citations, searchResults) {
  var resp = { choices: [{ message: { content: JSON.stringify({ items: items }) } }] };
  if (citations !== undefined) { resp.citations = citations; }
  if (searchResults !== undefined) { resp.search_results = searchResults; }
  return resp;
}

function jsonResponse(status, body) {
  var text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status: status, headers: { get: function () { return null; } }, text: async function () { return text; } };
}

function makeFetch(responseBody, status) {
  var spy = { calls: [] };
  spy.fn = async function (url, init) {
    spy.calls.push({ url: String(url), init: init || {} });
    return jsonResponse(typeof status === 'number' ? status : 200, responseBody);
  };
  return spy;
}

function wrapperOpts(spy, extra) {
  return Object.assign({ fetchImpl: spy.fn, apiKey: 'test-key-123', nowIso: NOW_ISO }, extra || {});
}

function liveGuard() { throw new Error('LIVE_NETWORK_FORBIDDEN'); }

// Direct pure-core invocation with the standard context.
function norm(items, citations, searchResults) {
  return provider.normalizeNewsResponse(sonarResponse(items, citations, searchResults), { ticker: TICKER, retrievedAt: NOW_ISO });
}
function normRaw(parsedResponse) {
  return provider.normalizeNewsResponse(parsedResponse, { ticker: TICKER, retrievedAt: NOW_ISO });
}

const TIER_B = { ok: false, reason: 'PROVIDER_INVALID_RESPONSE' };
const TIER_A = { ok: false, reason: 'PROVIDER_FAILURE' };

// Pinned identity: sha256 over the byte-exact tuple JSON literal (key
// insertion order normative, spec §3) — computed independently of the module.
function pinnedHash(eventDate, category, direction, normalizedSourceUrl, sourceDomain) {
  var json = '{"schemaVersion":"j3-identity-v1","ticker":"' + TICKER + '","eventDate":"' + eventDate +
    '","category":"' + category + '","direction":"' + direction + '","normalizedSourceUrl":"' + normalizedSourceUrl +
    '","sourceDomain":"' + sourceDomain + '","provider":"' + PROVIDER_ID + '"}';
  return crypto.createHash('sha256').update(json, 'utf8').digest('hex');
}

function expectedItem(eventDate, category, direction, sourceUrl, normalizedSourceUrl, sourceDomain) {
  return {
    ticker: TICKER,
    eventDate: eventDate,
    category: category,
    direction: direction,
    sourceUrl: sourceUrl,
    normalizedSourceUrl: normalizedSourceUrl,
    sourceDomain: sourceDomain,
    provider: PROVIDER_ID,
    retrievedAt: NOW_ISO,
    identityHash: pinnedHash(eventDate, category, direction, normalizedSourceUrl, sourceDomain),
    provenance: 'retrieval_unverified',
    confidence: null,
    requiresVerification: true,
    scoringImpact: 'none'
  };
}

// ── runner (mirrors qa/fund_facts_provider_offline.js) ───────────────────────
var passed = 0;
var failed = 0;
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
  process.stdout.write('\n=== C3-S1 — news-catalysts-provider NP-series (offline) ===\n\n');

  var _origFetch = global.fetch;
  global.fetch = liveGuard; // behavioral network guard: injected fetch only.

  // ── NP01: full-coverage benchmark ───────────────────────────────────────────
  await test('NP01 benchmark envelope deep-equals AND stringify-equals; exact upstream request asserted', async function () {
    var url1 = 'https://ir.jfrog.com/news/q2-results?src=wire';
    var url2 = 'https://www.reuters.com/markets/frog-guidance-2026-07-20/';
    var resp = sonarResponse(
      [
        rawItem('2026-07-18', 'earnings_event', 'positive', 'https://IR.JFROG.COM:443/news/q2-results?src=wire#top'),
        rawItem('2026-07-20', 'guidance_update', 'neutral', url2)
      ],
      [url1],
      [{ url: url2, title: 'never persisted' }]
    );
    var spy = makeFetch(resp);
    var out = await provider.getNewsCatalysts({ ticker: TICKER }, wrapperOpts(spy));
    var expected = {
      ok: true,
      envelope: {
        ticker: TICKER,
        fetchedAt: NOW_ISO,
        sourceTier: 'perplexity_retrieval',
        contractVersion: 'fund-contract-v1',
        provider: PROVIDER_ID,
        items: [
          expectedItem('2026-07-18', 'earnings_event', 'positive', url1, url1, 'ir.jfrog.com'),
          expectedItem('2026-07-20', 'guidance_update', 'neutral', url2, url2, 'www.reuters.com')
        ],
        skippedItems: [],
        writtenKeys: []
      }
    };
    assert.deepStrictEqual(out, expected, 'envelope deep-equal');
    assert.strictEqual(JSON.stringify(out.envelope), JSON.stringify(expected.envelope), 'envelope stringify-equal (key order)');
    assert.strictEqual(JSON.stringify(out).indexOf('title'), -1, 'no title anywhere in the output');
    assert.strictEqual(JSON.stringify(out).indexOf('summary'), -1, 'no summary anywhere in the output');

    // Exact upstream request (spec §7 + GO package §3).
    assert.strictEqual(spy.calls.length, 1, 'exactly one upstream call');
    var call = spy.calls[0];
    assert.strictEqual(call.url, provider.PPLX_ENDPOINT, 'canonical endpoint used');
    assert.strictEqual(call.url, 'https://api.perplexity.ai/v1/sonar', 'endpoint literal');
    assert.strictEqual(call.init.method, 'POST', 'POST method');
    assert.deepStrictEqual(call.init.headers, {
      'Authorization': 'Bearer test-key-123',
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }, 'all three headers, injected key only');
    var body = JSON.parse(call.init.body);
    assert.deepStrictEqual(body, {
      model: 'sonar-pro',
      messages: [
        {
          role: 'system',
          content: 'You are a financial news retrieval service. Return only JSON that conforms exactly to the provided schema. Include only events with a verifiable dated primary source.'
        },
        {
          role: 'user',
          content: 'List recent dated news and catalyst events for the U.S. equity ticker ' + TICKER +
            '. For each event provide: eventDate (ISO YYYY-MM-DD, the event\'s own date), category (one of: ' +
            'earnings_event, guidance_update, analyst_action, corporate_action, product_customer_partnership, ' +
            'regulatory_legal, other_catalyst), direction (positive, neutral, or negative for the company), and ' +
            'sourceUrl (the https URL of the source reporting the event). Only include events you can source. ' +
            'Do not include commentary, titles, or summaries.'
        }
      ],
      response_format: { type: 'json_schema', json_schema: { schema: provider.REQUEST_SCHEMA } }
    }, 'deterministic body: model/messages/response_format with REQUEST_SCHEMA, schema member only');
  });

  // ── NP02: Tier A — transport failures ⇒ PROVIDER_FAILURE ────────────────────
  await test('NP02 fetch throw / timeout / non-2xx each ⇒ PROVIDER_FAILURE, no partial output', async function () {
    var outThrow = await provider.getNewsCatalysts({ ticker: TICKER },
      { fetchImpl: async function () { throw new Error('boom'); }, apiKey: 'k', nowIso: NOW_ISO });
    assert.deepStrictEqual(outThrow, TIER_A, 'fetch throw');

    var outTimeout = await provider.getNewsCatalysts({ ticker: TICKER },
      { fetchImpl: function () { return new Promise(function () {}); }, apiKey: 'k', nowIso: NOW_ISO, timeoutMs: 25 });
    assert.deepStrictEqual(outTimeout, TIER_A, 'timeout');

    var spy500 = makeFetch({ error: 'upstream' }, 500);
    var out500 = await provider.getNewsCatalysts({ ticker: TICKER }, wrapperOpts(spy500));
    assert.deepStrictEqual(out500, TIER_A, 'non-2xx');
  });

  // ── NP03: Tier B — each structural condition individually ──────────────────
  await test('NP03 all seven Tier-B conditions + 2xx-body-not-JSON ⇒ PROVIDER_INVALID_RESPONSE (restores former P1-03/NC03)', async function () {
    // condition 1 — choices[0].message.content missing/malformed
    [{}, { choices: [] }, { choices: ['x'] }, { choices: [{}] }, { choices: [{ message: null }] }, { choices: [{ message: { content: 42 } }] }]
      .forEach(function (resp, i) {
        assert.deepStrictEqual(normRaw(resp), TIER_B, 'cond1 case ' + i);
      });
    // condition 2 — content not parseable JSON
    assert.deepStrictEqual(normRaw({ choices: [{ message: { content: 'not-json{{' } }] }), TIER_B, 'cond2');
    // condition 3 — parsed content not an object
    ['"a string"', '[1,2]', '42', 'null'].forEach(function (content, i) {
      assert.deepStrictEqual(normRaw({ choices: [{ message: { content: content } }] }), TIER_B, 'cond3 case ' + i);
    });
    // condition 4 — items missing or not an array
    ['{}', '{"items":{}}', '{"items":"x"}', '{"items":null}'].forEach(function (content, i) {
      assert.deepStrictEqual(normRaw({ choices: [{ message: { content: content } }] }), TIER_B, 'cond4 case ' + i);
    });
    // condition 5 — an items[] element is not an object
    ['{"items":[1]}', '{"items":["x"]}', '{"items":[null]}', '{"items":[["a"]]}', '{"items":[{},"x"]}'].forEach(function (content, i) {
      assert.deepStrictEqual(normRaw({ choices: [{ message: { content: content } }] }), TIER_B, 'cond5 case ' + i);
    });
    // condition 6 — grounding field present but neither null nor array
    assert.deepStrictEqual(norm([], 'nope', undefined), TIER_B, 'cond6 citations string');
    assert.deepStrictEqual(norm([], {}, undefined), TIER_B, 'cond6 citations object');
    assert.deepStrictEqual(norm([], undefined, 42), TIER_B, 'cond6 search_results number');
    // condition 7 — unknown top-level property besides items
    assert.deepStrictEqual(normRaw({ choices: [{ message: { content: '{"items":[],"extra":1}' } }] }), TIER_B, 'cond7');
    // whole-response 2xx body not JSON (wrapper-level Tier B)
    var spyBad = makeFetch('garbage{{');
    var out = await provider.getNewsCatalysts({ ticker: TICKER }, wrapperOpts(spyBad));
    assert.deepStrictEqual(out, TIER_B, '2xx body not JSON');
  });

  // ── NP04: mixed batch ───────────────────────────────────────────────────────
  await test('NP04 mixed batch: valid items survive in full shape; invalid siblings skip; never a whole-call failure', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    var r = norm([
      rawItem('2026-07-18', 'earnings_event', 'positive', g),
      rawItem(undefined, 'earnings_event', 'positive', g),
      rawItem('2026-07-19', 'weather_report', 'neutral', g)
    ], [g], undefined);
    assert.strictEqual(r.ok, true, 'ok:true despite invalid siblings');
    assert.strictEqual(r.items.length, 1, 'one valid item survives');
    assert.deepStrictEqual(r.items[0], expectedItem('2026-07-18', 'earnings_event', 'positive', g, g, 'ir.jfrog.com'), 'full NewsItem shape');
    assert.deepStrictEqual(r.skippedItems, [{ reason: 'MISSING_EVENT_DATE' }, { reason: 'UNKNOWN_CATEGORY' }], 'reason-only skips, input order');
  });

  // ── NP05: eventDate ─────────────────────────────────────────────────────────
  await test('NP05 eventDate absent ⇒ MISSING_EVENT_DATE; malformed grammar and impossible date ⇒ INVALID_EVENT_DATE', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    var r = norm([
      rawItem(undefined, 'earnings_event', 'positive', g),
      rawItem('07/18/2026', 'earnings_event', 'positive', g),
      rawItem('2026-13-40', 'earnings_event', 'positive', g)
    ], [g], undefined);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.items.length, 0);
    assert.deepStrictEqual(r.skippedItems, [
      { reason: 'MISSING_EVENT_DATE' },
      { reason: 'INVALID_EVENT_DATE' },
      { reason: 'INVALID_EVENT_DATE' }
    ]);
  });

  // ── NP06: sourceUrl syntax ──────────────────────────────────────────────────
  await test('NP06 sourceUrl absent ⇒ MISSING_SOURCE_URL; http/credentials/whitespace/no-host ⇒ INVALID_SOURCE_URL', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    var r = norm([
      rawItem('2026-07-18', 'earnings_event', 'positive', undefined),
      rawItem('2026-07-18', 'earnings_event', 'positive', 'http://ir.jfrog.com/news/a'),
      rawItem('2026-07-18', 'earnings_event', 'positive', 'https://user:pw@ir.jfrog.com/news/a'),
      rawItem('2026-07-18', 'earnings_event', 'positive', 'https://ir.jfrog.com/news/a b'),
      rawItem('2026-07-18', 'earnings_event', 'positive', 'https:///no-host')
    ], [g], undefined);
    assert.strictEqual(r.items.length, 0);
    assert.deepStrictEqual(r.skippedItems, [
      { reason: 'MISSING_SOURCE_URL' },
      { reason: 'INVALID_SOURCE_URL' },
      { reason: 'INVALID_SOURCE_URL' },
      { reason: 'INVALID_SOURCE_URL' },
      { reason: 'INVALID_SOURCE_URL' }
    ]);
  });

  // ── NP07: grounding miss ────────────────────────────────────────────────────
  await test('NP07 syntactically valid candidate absent from grounding ⇒ INVALID_SOURCE_URL (incl. empty/null/absent grounding)', async function () {
    var cand = 'https://ir.jfrog.com/news/a';
    var r1 = norm([rawItem('2026-07-18', 'earnings_event', 'positive', cand)], ['https://ir.jfrog.com/news/other'], undefined);
    assert.deepStrictEqual(r1.skippedItems, [{ reason: 'INVALID_SOURCE_URL' }], 'no normalized match');
    var r2 = norm([rawItem('2026-07-18', 'earnings_event', 'positive', cand)], null, null);
    assert.deepStrictEqual(r2.skippedItems, [{ reason: 'INVALID_SOURCE_URL' }], 'null grounding');
    var r3 = norm([rawItem('2026-07-18', 'earnings_event', 'positive', cand)], undefined, undefined);
    assert.deepStrictEqual(r3.skippedItems, [{ reason: 'INVALID_SOURCE_URL' }], 'absent grounding');
    var r4 = norm([rawItem('2026-07-18', 'earnings_event', 'positive', cand)], [], []);
    assert.deepStrictEqual(r4.skippedItems, [{ reason: 'INVALID_SOURCE_URL' }], 'empty grounding arrays');
  });

  // ── NP08: grounded-value persistence + first-occurrence precedence ──────────
  await test('NP08 persisted sourceUrl is the grounding entry\'s own raw URL; first occurrence in the fixed order wins', async function () {
    var cand = 'HTTPS://IR.JFROG.COM/news/x?q=1';
    var citRaw = 'https://ir.jfrog.com/news/x?q=1#frag';
    var srRaw = 'https://IR.JFROG.COM/news/x?q=1';
    var r = norm([rawItem('2026-07-18', 'earnings_event', 'positive', cand)], [citRaw], [{ url: srRaw }]);
    assert.strictEqual(r.items.length, 1);
    assert.strictEqual(r.items[0].sourceUrl, citRaw, 'citations entry (first in fixed order) wins, raw text verbatim');
    assert.strictEqual(r.items[0].normalizedSourceUrl, 'https://ir.jfrog.com/news/x?q=1', 'normalized from the grounded URL');
    assert.strictEqual(r.items[0].sourceDomain, 'ir.jfrog.com');

    // duplicate normalized forms within ONE array: earliest index wins
    var dupA = 'https://ir.jfrog.com/news/y?q=2#a';
    var dupB = 'https://IR.JFROG.COM/news/y?q=2';
    var r2 = norm([rawItem('2026-07-19', 'earnings_event', 'positive', dupB)], [dupA, dupB], undefined);
    assert.strictEqual(r2.items[0].sourceUrl, dupA, 'first occurrence within citations wins');
  });

  // ── NP09: malformed grounding entries ───────────────────────────────────────
  await test('NP09 malformed grounding entries silently excluded — never Tier B, valid entries still match', async function () {
    var ok1 = 'https://ok.example.com/a';
    var ok2 = 'https://ok2.example.com/b';
    var r = norm(
      [
        rawItem('2026-07-18', 'earnings_event', 'positive', ok1),
        rawItem('2026-07-19', 'guidance_update', 'neutral', ok2)
      ],
      [123, null, 'http://not-https.example.com/x', ok1],
      ['not-an-object', { noUrl: true }, { url: 456 }, { url: ok2 }]
    );
    assert.strictEqual(r.ok, true, 'never Tier B');
    assert.strictEqual(r.items.length, 2, 'both candidates matched surviving valid entries');
    assert.deepStrictEqual(r.skippedItems, []);
  });

  // ── NP10: duplicate identity in one batch ───────────────────────────────────
  await test('NP10 same identity twice in one batch ⇒ first kept, second DUPLICATE_IN_BATCH (incl. cosmetically-different raw URLs)', async function () {
    var g = 'https://ir.jfrog.com/news/a?x=1';
    var r = norm([
      rawItem('2026-07-18', 'earnings_event', 'positive', g),
      rawItem('2026-07-18', 'earnings_event', 'positive', 'HTTPS://IR.JFROG.COM/news/a?x=1#z')
    ], [g], undefined);
    assert.strictEqual(r.items.length, 1, 'first kept');
    assert.deepStrictEqual(r.skippedItems, [{ reason: 'DUPLICATE_IN_BATCH' }], 'second skipped — same normalized identity');
  });

  // ── NP11: unknown category ──────────────────────────────────────────────────
  await test('NP11 category outside the exact 7-item set (incl. macro-style and missing) ⇒ UNKNOWN_CATEGORY', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    var r = norm([
      rawItem('2026-07-18', 'macro_sector_trend', 'positive', g),
      rawItem('2026-07-18', undefined, 'positive', g),
      rawItem('2026-07-18', 'Earnings_Event', 'positive', g)
    ], [g], undefined);
    assert.deepStrictEqual(r.skippedItems, [
      { reason: 'UNKNOWN_CATEGORY' }, { reason: 'UNKNOWN_CATEGORY' }, { reason: 'UNKNOWN_CATEGORY' }
    ], 'no case-folding, no macro category in v1');
    assert.deepStrictEqual(provider.CATEGORIES.slice(), [
      'earnings_event', 'guidance_update', 'analyst_action', 'corporate_action',
      'product_customer_partnership', 'regulatory_legal', 'other_catalyst'
    ], 'exported vocabulary is exactly the spec §4 set');
  });

  // ── NP12: invalid direction ─────────────────────────────────────────────────
  await test('NP12 direction outside DIRECTIONS (incl. missing) ⇒ INVALID_DIRECTION', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    var r = norm([
      rawItem('2026-07-18', 'earnings_event', 'bullish', g),
      rawItem('2026-07-18', 'earnings_event', undefined, g)
    ], [g], undefined);
    assert.deepStrictEqual(r.skippedItems, [{ reason: 'INVALID_DIRECTION' }, { reason: 'INVALID_DIRECTION' }]);
  });

  // ── NP13: zero-item success ─────────────────────────────────────────────────
  await test('NP13 items:[] is a valid, successful empty retrieval (endpoint later maps it to 200 NONE)', async function () {
    var spy = makeFetch(sonarResponse([], undefined, undefined));
    var out = await provider.getNewsCatalysts({ ticker: TICKER }, wrapperOpts(spy));
    assert.deepStrictEqual(out, {
      ok: true,
      envelope: {
        ticker: TICKER,
        fetchedAt: NOW_ISO,
        sourceTier: 'perplexity_retrieval',
        contractVersion: 'fund-contract-v1',
        provider: PROVIDER_ID,
        items: [],
        skippedItems: [],
        writtenKeys: []
      }
    });
  });

  // ── NP14: URL normalization — exactly three transforms ─────────────────────
  await test('NP14 normalization = host case-fold + fragment removal + default-443 omission ONLY; queries never collapse', async function () {
    function normalizedOf(raw) {
      var r = norm([rawItem('2026-07-18', 'earnings_event', 'positive', raw)], [raw], undefined);
      assert.strictEqual(r.items.length, 1, 'grounded item for ' + raw);
      return r.items[0].normalizedSourceUrl;
    }
    assert.strictEqual(normalizedOf('https://WWW.Example.COM/Path?Q=v'), 'https://www.example.com/Path?Q=v', 'host folded; path/query case preserved');
    assert.strictEqual(normalizedOf('https://www.example.com/a#frag'), 'https://www.example.com/a', 'fragment removed');
    assert.strictEqual(normalizedOf('https://www.example.com:443/a'), 'https://www.example.com/a', 'default port omitted');
    assert.strictEqual(normalizedOf('https://www.example.com:8443/a'), 'https://www.example.com:8443/a', 'non-default port preserved');
    // two different query strings must produce two DIFFERENT normalized values
    var q1 = normalizedOf('https://www.example.com/a?x=1');
    var q2 = normalizedOf('https://www.example.com/a?x=2');
    assert.notStrictEqual(q1, q2, 'no path/query equivalence is ever claimed');
  });

  // ── NP15: deterministic identity ────────────────────────────────────────────
  await test('NP15 identical fields ⇒ byte-identical tuple JSON and identical lowercase-hex hash; insertion order enforced', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    var r1 = norm([rawItem('2026-07-18', 'earnings_event', 'positive', g)], [g], undefined);
    var r2 = norm([rawItem('2026-07-18', 'earnings_event', 'positive', g)], [g], undefined);
    assert.strictEqual(JSON.stringify(r1), JSON.stringify(r2), 'byte-identical results');
    var hash = r1.items[0].identityHash;
    assert.ok(/^[a-f0-9]{64}$/.test(hash), 'lowercase 64-hex');
    assert.strictEqual(hash, pinnedHash('2026-07-18', 'earnings_event', 'positive', g, 'ir.jfrog.com'),
      'hash equals sha256 of the byte-exact pinned tuple literal (key order normative)');
  });

  // ── NP16: title/summary discarded, hash-inert ───────────────────────────────
  await test('NP16 unknown item-level fields (title/summary/etc.) never surface and never influence identityHash', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    var withExtras = rawItem('2026-07-18', 'earnings_event', 'positive', g,
      { title: 'BIG HEADLINE', summary: 'Narrative text the model volunteered', extraField: { nested: true } });
    var plain = rawItem('2026-07-18', 'earnings_event', 'positive', g);
    var rA = norm([withExtras], [g], undefined);
    var rB = norm([plain], [g], undefined);
    assert.deepStrictEqual(Object.keys(rA.items[0]), ITEM_FIELD_ORDER, 'exact 14-field projection, exact order');
    var textA = JSON.stringify(rA);
    assert.strictEqual(textA.indexOf('title'), -1, 'no title');
    assert.strictEqual(textA.indexOf('summary'), -1, 'no summary');
    assert.strictEqual(textA.indexOf('BIG HEADLINE'), -1, 'no narrative value');
    assert.strictEqual(textA.indexOf('extraField'), -1, 'no unknown field');
    assert.strictEqual(rA.items[0].identityHash, rB.items[0].identityHash, 'toggling extras alone changes nothing');
    assert.deepStrictEqual(rA, rB, 'projection identical with and without extras');
  });

  // ── NP17: store-key shape ───────────────────────────────────────────────────
  await test('NP17 buildNewsKey output matches NEWS_KEY_RE exactly', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    var r = norm([rawItem('2026-07-18', 'earnings_event', 'positive', g)], [g], undefined);
    var item = r.items[0];
    var key = provider.buildNewsKey(item);
    assert.strictEqual(key, 'fundstore:v1:news:FROG:2026-07-18:' + item.identityHash, 'exact key assembly');
    assert.ok(provider.NEWS_KEY_RE.test(key), 'matches the allowlist regex');
  });

  // ── NP18: J7 freshness integration (unmodified evaluator) ───────────────────
  await test('NP18 news-family snapshots through the UNMODIFIED evaluator: 7⇒fresh, 8⇒aging, 30⇒aging, 31⇒stale via eventDate', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    var dates = ['2026-07-17', '2026-07-16', '2026-06-24', '2026-06-23']; // ages 7 / 8 / 30 / 31 at NOW_MS
    var r = norm(dates.map(function (d) { return rawItem(d, 'earnings_event', 'neutral', g); }), [g], undefined);
    assert.strictEqual(r.items.length, 4, 'four distinct items (eventDate varies the identity)');

    // Caller-side projection is MANDATORY: NewsItem carries no sourceTier /
    // contractVersion, and J7's record validity requires both (verified
    // pinned finding). The evaluator itself stays untouched.
    var snaps = r.items.map(function (item) {
      return {
        family: 'news',
        key: provider.buildNewsKey(item),
        record: Object.assign({}, item, { sourceTier: provider.SOURCE_TIER, contractVersion: provider.CONTRACT_VERSION }),
        timestamps: { eventDate: item.eventDate }
      };
    });
    var report = freshness.evaluateEvidenceFreshness(snaps, freshness.DEFAULT_WINDOW_TABLE, NOW_MS, { ticker: TICKER, expectedFamilies: ['news'] });
    assert.deepStrictEqual(report.degradedNotes, [], 'no degradation');
    assert.strictEqual(report.windowTableVersion, 'eg25c1-spec-v1');
    var expectedStates = ['fresh', 'aging', 'aging', 'stale'];
    var expectedAges = [7, 8, 30, 31];
    report.items.forEach(function (it, i) {
      assert.strictEqual(it.state, expectedStates[i], 'state at age ' + expectedAges[i]);
      assert.strictEqual(it.ageDays, expectedAges[i], 'exact ageDays');
      assert.strictEqual(it.timestampSource, 'eventDate', 'eventDate drives the timestamp');
      assert.strictEqual(it.usedFetchedAtFallback, false, 'no fallback used');
      assert.strictEqual(it.reason, null, 'no defect reason');
    });
    assert.deepStrictEqual(report.counts, { fresh: 1, aging: 2, stale: 1, missing: 0, degraded: 0 });
    assert.strictEqual(report.coverageScore, 1, 'news family qualifies');

    // Without the projection the record fails J7 contract validity — proving
    // the projection is required, not decorative.
    var bare = freshness.evaluateEvidenceFreshness(
      [{ family: 'news', key: snaps[0].key, record: r.items[0], timestamps: { eventDate: r.items[0].eventDate } }],
      freshness.DEFAULT_WINDOW_TABLE, NOW_MS, { ticker: TICKER, expectedFamilies: ['news'] });
    assert.strictEqual(bare.items[0].reason, 'CONTRACT_INVALID', 'unprojected NewsItem is contract-invalid to J7');
  });

  // ── NP19: evidence-contract reuse ───────────────────────────────────────────
  await test('NP19 shared validators reused verbatim: INVALID by reference, identical rejections, DIRECTIONS vocabulary', async function () {
    // The sentinel is the same module instance the provider imports (resolved
    // beside SRC), so reference comparison is meaningful.
    assert.strictEqual(contract.optionalDate('2026-13-40'), contract.INVALID, 'optionalDate INVALID by reference');
    assert.strictEqual(contract.optionalHttpsUrl('http://x.example.com/a'), contract.INVALID, 'optionalHttpsUrl INVALID by reference');
    assert.strictEqual(contract.optionalDate(null), null, 'missing date ⇒ null');
    assert.strictEqual(contract.optionalHttpsUrl(undefined), null, 'missing URL ⇒ null');

    var g = 'https://ir.jfrog.com/news/a';
    var r = norm([
      rawItem('2026-13-40', 'earnings_event', 'positive', g),
      rawItem('2026-07-18', 'earnings_event', 'positive', 'http://x.example.com/a')
    ], [g], undefined);
    assert.deepStrictEqual(r.skippedItems, [{ reason: 'INVALID_EVENT_DATE' }, { reason: 'INVALID_SOURCE_URL' }],
      'values evidence-contract rejects are skipped with the matching reasons');

    assert.deepStrictEqual(contract.DIRECTIONS.slice(), ['positive', 'neutral', 'negative'], 'shared vocabulary');
    var rDir = norm(
      contract.DIRECTIONS.map(function (dir, i) {
        return rawItem('2026-07-1' + (i + 1), 'earnings_event', dir, g);
      }), [g], undefined);
    assert.strictEqual(rDir.items.length, 3, 'every shared direction accepted verbatim');
    assert.deepStrictEqual(rDir.skippedItems, []);
  });

  // ── NP20: fail-closed injection order ───────────────────────────────────────
  await test('NP20 missing apiKey/fetchImpl/nowIso throw typed errors with ZERO fetch; strict UTC-Z clock grammar; invalid ticker ⇒ null', async function () {
    var spy1 = makeFetch(sonarResponse([]));
    var threw = '';
    try { await provider.getNewsCatalysts({ ticker: TICKER }, { fetchImpl: spy1.fn, nowIso: NOW_ISO }); }
    catch (e) { threw = e && e.message; }
    assert.strictEqual(threw, 'PPLX_API_KEY_MISSING');
    assert.strictEqual(spy1.calls.length, 0, 'no fetch before the key gate');

    threw = '';
    try { await provider.getNewsCatalysts({ ticker: TICKER }, { apiKey: 'k', nowIso: NOW_ISO }); }
    catch (e) { threw = e && e.message; }
    assert.strictEqual(threw, 'PPLX_FETCH_UNAVAILABLE');

    var spy2 = makeFetch(sonarResponse([]));
    threw = '';
    try { await provider.getNewsCatalysts({ ticker: TICKER }, { apiKey: 'k', fetchImpl: spy2.fn }); }
    catch (e) { threw = e && e.message; }
    assert.strictEqual(threw, 'CLOCK_NOT_INJECTED');
    threw = '';
    try { await provider.getNewsCatalysts({ ticker: TICKER }, { apiKey: 'k', fetchImpl: spy2.fn, nowIso: 'not-a-clock' }); }
    catch (e) { threw = e && e.message; }
    assert.strictEqual(threw, 'CLOCK_NOT_INJECTED');
    assert.strictEqual(spy2.calls.length, 0, 'no fetch before the clock gate');

    // Invalid ticker is graceful and checked FIRST — even with empty options.
    var spy3 = makeFetch(sonarResponse([]));
    assert.strictEqual(await provider.getNewsCatalysts({ ticker: 'frog' }, wrapperOpts(spy3)), null, 'lowercase rejected (non-normalized)');
    assert.strictEqual(await provider.getNewsCatalysts({ ticker: ' FROG' }, wrapperOpts(spy3)), null, 'padding rejected');
    assert.strictEqual(await provider.getNewsCatalysts({ ticker: 'TOOLONGTICKR' }, wrapperOpts(spy3)), null, 'over-length rejected');
    assert.strictEqual(await provider.getNewsCatalysts({}, wrapperOpts(spy3)), null, 'missing ticker rejected');
    assert.strictEqual(await provider.getNewsCatalysts(null, wrapperOpts(spy3)), null, 'missing request rejected');
    assert.strictEqual(spy3.calls.length, 0, 'zero fetch across all invalid-ticker calls');
    assert.strictEqual(await provider.getNewsCatalysts({ ticker: 'frog' }, {}), null, 'ticker gate precedes option gates');

    // Strict injected-clock grammar (the J7-ratified UTC-Z instant form):
    // values a permissive parser accepts but the exact grammar does not are
    // rejected with CLOCK_NOT_INJECTED before any fetch.
    var spy4 = makeFetch(sonarResponse([]));
    var disallowedClocks = [
      '2026-07-24',                     // date-only (parseable, not an instant)
      '2026-07-24T00:00:00',            // no trailing Z
      '2026-07-24T00:00:00+03:00',      // timezone offset
      '2026-07-24T00:00:00.0000Z',      // 4-digit fraction
      '2026-07-24T24:00:00Z',           // hour 24 (parseable end-of-day form)
      'Thu, 24 Jul 2026 00:00:00 GMT',  // RFC text form
      '2026-02-29T00:00:00Z',           // non-leap Feb 29 (grammar-shaped, unreal)
      '2026-07-32T00:00:00Z'            // day 32 (grammar-shaped, unreal)
    ];
    for (var b = 0; b < disallowedClocks.length; b++) {
      threw = '';
      try { await provider.getNewsCatalysts({ ticker: TICKER }, { apiKey: 'k', fetchImpl: spy4.fn, nowIso: disallowedClocks[b] }); }
      catch (e) { threw = e && e.message; }
      assert.strictEqual(threw, 'CLOCK_NOT_INJECTED', 'rejected: ' + disallowedClocks[b]);
    }
    assert.strictEqual(spy4.calls.length, 0, 'zero fetch across all rejected clock forms');

    // Valid boundary forms of the exact grammar are accepted verbatim.
    var validClocks = ['2026-07-24T23:59:59Z', '2026-07-24T12:00:00.5Z', '2024-02-29T00:00:00.999Z'];
    for (var v = 0; v < validClocks.length; v++) {
      var spyV = makeFetch(sonarResponse([]));
      var outV = await provider.getNewsCatalysts({ ticker: TICKER }, { apiKey: 'k', fetchImpl: spyV.fn, nowIso: validClocks[v] });
      assert.strictEqual(outV.ok, true, 'accepted: ' + validClocks[v]);
      assert.strictEqual(outV.envelope.fetchedAt, validClocks[v], 'fetchedAt echoes the injected instant verbatim');
      assert.strictEqual(spyV.calls.length, 1, 'one fetch for ' + validClocks[v]);
    }
  });

  // ── NP21: purity + determinism ──────────────────────────────────────────────
  await test('NP21 injected-fetch only (throwing guard), identical input ⇒ byte-identical output, upstream response never mutated', async function () {
    assert.strictEqual(global.fetch, liveGuard, 'guard installed');
    var g = 'https://ir.jfrog.com/news/a';
    var parsed = sonarResponse([rawItem('2026-07-18', 'earnings_event', 'positive', g,
      { title: 'kept on the input, never on the output' })], [g], undefined);
    var snap = JSON.stringify(parsed);
    var r1 = provider.normalizeNewsResponse(parsed, { ticker: TICKER, retrievedAt: NOW_ISO });
    var r2 = provider.normalizeNewsResponse(parsed, { ticker: TICKER, retrievedAt: NOW_ISO });
    assert.strictEqual(JSON.stringify(r1), JSON.stringify(r2), 'deterministic');
    assert.strictEqual(JSON.stringify(parsed), snap, 'input response object never mutated');

    var spyA = makeFetch(sonarResponse([rawItem('2026-07-18', 'earnings_event', 'positive', g)], [g], undefined));
    var spyB = makeFetch(sonarResponse([rawItem('2026-07-18', 'earnings_event', 'positive', g)], [g], undefined));
    var o1 = await provider.getNewsCatalysts({ ticker: TICKER }, wrapperOpts(spyA));
    var o2 = await provider.getNewsCatalysts({ ticker: TICKER }, wrapperOpts(spyB));
    assert.strictEqual(JSON.stringify(o1), JSON.stringify(o2), 'wrapper deterministic end-to-end');
  });

  // ── NP22: malformed item VALUES never throw ─────────────────────────────────
  await test('NP22 malformed value types (numbers/null/arrays/objects) never throw — ladder reasons, siblings unaffected', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    var r = norm([
      rawItem(12345, 'earnings_event', 'positive', g),
      rawItem('2026-07-18', 'earnings_event', 'positive', {}),
      rawItem('2026-07-18', 'earnings_event', 'positive', []),
      rawItem('2026-07-18', 7, 'positive', g),
      rawItem('2026-07-18', 'earnings_event', [], g),
      rawItem('2026-07-19', 'earnings_event', 'positive', g)
    ], [g], undefined);
    assert.strictEqual(r.ok, true, 'never throws, never Tier B');
    assert.deepStrictEqual(r.skippedItems, [
      { reason: 'INVALID_EVENT_DATE' },
      { reason: 'INVALID_SOURCE_URL' },
      { reason: 'INVALID_SOURCE_URL' },
      { reason: 'UNKNOWN_CATEGORY' },
      { reason: 'INVALID_DIRECTION' }
    ]);
    assert.strictEqual(r.items.length, 1, 'valid sibling unaffected');
    assert.strictEqual(r.items[0].eventDate, '2026-07-19');
  });

  // ── NP23: static forbidden-surface scan of the TARGET module ────────────────
  await test('NP23 provider source has no env/endpoint/store/UI/scoring/live surface; requires restricted to the exact allowlist', async function () {
    var s = fs.readFileSync(SRC, 'utf8');
    var forbidden = [
      [/exports\.handler/, 'endpoint handler'],
      [/statusCode/, 'HTTP status envelope'],
      [/process\.env/, 'env/gate runtime'],
      [/getStore/, 'blob store handle'],
      [/@netlify\/blobs/, 'blob import'],
      [/\.setJSON\s*\(/, 'blob write'],
      [/localStorage|sessionStorage/, 'web storage'],
      [/document\./, 'DOM access'],
      [/window\./, 'window/UI access'],
      [/\borchestrate\s*\(/, 'scoring: orchestrate'],
      [/\banalyzeChunk\b/, 'scoring: analyzeChunk'],
      [/\benforceScoreConsistency\b/, 'scoring: enforceScoreConsistency'],
      [/_techCache/, 'scoring: _techCache'],
      [/sentiment_score/, 'sentiment_score'],
      [/pt_results/, 'pt_results'],
      [/pt_tickers/, 'pt_tickers'],
      [/pt_holdings/, 'pt_holdings'],
      [/item\.news/, 'legacy scan news field'],
      [/_catalysts/, 'legacy catalysts field'],
      [/parsePerplexityContext/, 'legacy parser'],
      [/macroDrivers/, 'legacy macro drivers'],
      [/(^|[^.\w])fetch\s*\(/, 'bare fetch( call'],
      [/Date\.now\s*\(/, 'Date.now() ambient clock']
    ];
    forbidden.forEach(function (pair) {
      assert.ok(!pair[0].test(s), 'must NOT contain ' + pair[1]);
    });

    // Deliberate deltas from the C1 scan (GO package §6): the import surface
    // is an exact two-module allowlist; the fundstore literal is allowed
    // because this lib owns the key builder; and the writtenKeys literal is
    // allowed because the spec §2 success envelope requires an empty
    // writtenKeys placeholder (the create-only writer lands in C3-S3) — its
    // presence and exact [] value are proven at runtime by NP01/NP13, not by
    // a source-string scan.
    var reqRe = /\brequire\s*\(\s*(['"])([^'"]*)\1\s*\)/g;
    var allowed = { 'crypto': true, './evidence-contract': true };
    var m;
    var literalRequires = 0;
    while ((m = reqRe.exec(s)) !== null) {
      literalRequires += 1;
      assert.ok(allowed[m[2]] === true, 'require allowlist violation: ' + m[2]);
    }
    var totalRequires = (s.match(/\brequire\s*\(/g) || []).length;
    assert.strictEqual(totalRequires, literalRequires, 'no dynamic/computed require');
    assert.strictEqual(literalRequires, 2, 'exactly two imports: crypto + ./evidence-contract');
    assert.ok(s.indexOf('fundstore:v1:news:') !== -1, 'owns the news key literal');

    // Exported surface + injected-fetch idiom present.
    assert.ok(/module\.exports\s*=/.test(s), 'module.exports present');
    assert.strictEqual(typeof provider.getNewsCatalysts, 'function', 'getNewsCatalysts exported');
    assert.strictEqual(typeof provider.normalizeNewsResponse, 'function', 'normalizeNewsResponse exported');
    assert.strictEqual(typeof provider.buildNewsKey, 'function', 'buildNewsKey exported');
    assert.ok(/ctx\.fetchImpl\s*\(/.test(s), 'uses injected ctx.fetchImpl');
    assert.strictEqual(provider.PROVIDER_ID, PROVIDER_ID, 'fixed provider literal');
    assert.strictEqual(provider.IDENTITY_SCHEMA_VERSION, 'j3-identity-v1', 'independent identity version tag');
    assert.ok(Object.isFrozen(provider.REQUEST_SCHEMA), 'REQUEST_SCHEMA frozen');
    assert.ok(Object.isFrozen(provider.CATEGORIES), 'CATEGORIES frozen');
    assert.ok(Object.isFrozen(provider.SKIP_REASONS), 'SKIP_REASONS frozen');
  });

  global.fetch = _origFetch;

  var result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
  if (failed > 0) { process.exit(1); }
}

runTests().catch(function (err) {
  process.stderr.write('FATAL: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
