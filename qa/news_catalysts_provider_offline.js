'use strict';

/*
 * qa/news_catalysts_provider_offline.js
 *
 * EG-25C-3 · C3-S1 — J3 news/catalysts provider: NP-series offline QA.
 *
 * Proves the pure provider lib (netlify/functions/lib/news-catalysts-provider.js)
 * with ZERO real network / Blob / env / store / DOM / production. Every
 * upstream call is served by an INJECTED fetch over inline Agent-API-style
 * response fixtures (S1.5.2 transport migration — Sonar Chat Completions ->
 * Perplexity Agent API; see the `agentResponse`/`agentShell` fixture builders
 * below), and a throwing global.fetch guard is installed throughout to prove
 * the provider never touches the real network.
 *
 * Coverage (NP01–NP45, contiguous — the P1-xx scheme is retired):
 *   NP01 full-coverage benchmark  — exact deep-equal + stringify-equal envelope
 *   NP02 Tier A transport         — throw / timeout / non-2xx ⇒ PROVIDER_FAILURE
 *   NP03 Tier B structural (7+1)  — each condition ⇒ PROVIDER_INVALID_RESPONSE
 *   NP04 mixed batch              — valid items survive; invalid siblings skip
 *   NP05 eventDate missing/invalid            NP06 sourceUrl missing/invalid
 *   NP07 grounding miss                       NP08 grounded-value persistence + D-M2 order
 *   NP09 malformed grounding entries excluded NP10 duplicate identity in batch
 *   NP11 unknown category                     NP12 invalid direction
 *   NP13 zero-item success                    NP14 URL normalization (3 only)
 *   NP15 deterministic identity               NP16 title/summary hash-inert
 *   NP17 store-key shape                      NP18 J7 freshness integration
 *   NP19 evidence-contract reuse              NP20 fail-closed injection order
 *   NP21 purity + determinism (+ nowIso anchor) NP22 malformed values never throw
 *   NP23 forbidden-surface scan of the TARGET module
 *   NP24 eventType vocabulary                 NP25 relevanceScope vocabulary
 *   NP26 subType conditionality               NP27 no numeric materiality/%
 *   NP28 category vocabulary parity           NP29 prompt windows, no "recent"
 *   NP30 relevanceScope identity-inert        NP31 eventType identity-bearing
 *   NP32 direction conditionality, future-dated fixture
 *   NP33 status must fail closed              NP34 three-source grounding union
 *   NP35 lookup by type, not index            NP36 unrecognised item type ignored
 *   NP37 zero grounding candidates ⇒ NONE      NP38 endpoint literal
 *   NP39 Evidence Set retained, metadata inert on items/skippedItems (9
 *        fields, no leakage into the public item or skip shape); S2-A2
 *        (Owner-ruled): evidenceKind/source-kind literals MAY and SHOULD
 *        appear in the envelope's evidenceBindings sidecar — that is the
 *        intentional observability surface, not a leak
 *   NP40 S1.5.1 H-A: five prompt-rule markers present (presence only)
 *   NP41 S1.5.1 H-A: no numeric materiality threshold in the new wording
 *   NP42 S1.5.1 H-B: generic/container source-URL rejection (mechanism 1)
 *   NP43 S1.5.1 H-B: future-dated-catalyst rejection (mechanism 2)
 *   NP44 S1.5.1 H-B: SKIP_REASONS append-only order; skippedItems shape
 *   NP45 S1.5.1 H-B: GENERIC_SOURCE_URL boundary — '//' survives (Codex fix)
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
const { spawnSync } = require('child_process');

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
  'identityHash', 'provenance', 'confidence', 'requiresVerification', 'scoringImpact',
  'eventType', 'relevanceScope', 'subType'
];

// ── fixture builders ─────────────────────────────────────────────────────────

// Taxonomy defaults (eventType: 'catalyst', relevanceScope: 'company') apply
// unless a test overrides them via `extra` — this keeps every pre-S1.5 call
// site valid under the new required fields without touching each one
// individually. subType defaults to a non-empty string when the category is
// 'other_catalyst' (D-S15-C requires one) and to null otherwise; a test
// exercising INVALID_SUB_TYPE overrides it explicitly via `extra`.
function rawItem(eventDate, category, direction, sourceUrl, extra) {
  var it = {
    eventType: 'catalyst',
    relevanceScope: 'company',
    subType: category === 'other_catalyst' ? 'general' : null
  };
  if (eventDate !== undefined) { it.eventDate = eventDate; }
  if (category !== undefined) { it.category = category; }
  if (direction !== undefined) { it.direction = direction; }
  if (sourceUrl !== undefined) { it.sourceUrl = sourceUrl; }
  return Object.assign(it, extra || {});
}

// Agent-style response envelope (S1.5.2 transport migration). The legacy
// `citations` parameter maps to url_citation annotations on the output_text
// content entry; the legacy `searchResults` parameter maps to a single
// search_results output item's results[]. This lets every pre-migration
// two-argument fixture keep working after the wire-format flip — only NP08
// (whose specific cross-source priority pin depended on the OLD two-source
// order: citations-before-searchResults) and NP33-NP39 (the new three-source
// D-M2 coverage, including fetch_url_results) construct Agent shapes
// directly. `citations`/`searchResults`: undefined ⇒ that source is omitted
// entirely; a non-array, non-null value is passed through verbatim so the
// Tier-B condition-6 fixtures still exercise the malformed-field path.
function agentResponse(items, citations, searchResults, opts) {
  opts = opts || {};
  var output = [];
  if (searchResults !== undefined) {
    output.push({ type: 'search_results', results: searchResults, queries: [] });
  }
  var annotations;
  if (citations === undefined) {
    annotations = undefined;
  } else if (citations === null || !Array.isArray(citations)) {
    annotations = citations;
  } else {
    annotations = citations.map(function (c) {
      return (c && typeof c === 'object') ? Object.assign({ type: 'url_citation' }, c) : { type: 'url_citation', url: c };
    });
  }
  output.push({
    type: 'message',
    role: 'assistant',
    content: [{ type: 'output_text', text: JSON.stringify({ items: items }), annotations: annotations }]
  });
  return { status: opts.status !== undefined ? opts.status : 'completed', error: null, output: output };
}

// A minimal valid Agent envelope wrapping an arbitrary content string —
// exercises Tier-B conditions 2/3/4/5/7, which operate on the JSON payload
// inside the generated text and are untouched by the transport migration.
function agentShell(contentText, opts) {
  opts = opts || {};
  return {
    status: opts.status !== undefined ? opts.status : 'completed',
    error: null,
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: contentText, annotations: opts.annotations }] }]
  };
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
  return provider.normalizeNewsResponse(agentResponse(items, citations, searchResults), { ticker: TICKER, retrievedAt: NOW_ISO });
}
function normRaw(parsedResponse) {
  return provider.normalizeNewsResponse(parsedResponse, { ticker: TICKER, retrievedAt: NOW_ISO });
}

const TIER_B = { ok: false, reason: 'PROVIDER_INVALID_RESPONSE' };
const TIER_A = { ok: false, reason: 'PROVIDER_FAILURE' };

// Pinned identity: sha256 over the byte-exact tuple JSON literal (key
// insertion order normative, spec §3) — computed independently of the
// module. eventType is inserted after category, before direction (A-2);
// schemaVersion is 'j3-identity-v2'. direction serializes as the bare
// literal null for an upcoming_event (A-1).
function pinnedHash(eventDate, category, eventType, direction, normalizedSourceUrl, sourceDomain) {
  var directionLiteral = direction === null ? 'null' : '"' + direction + '"';
  var json = '{"schemaVersion":"j3-identity-v2","ticker":"' + TICKER + '","eventDate":"' + eventDate +
    '","category":"' + category + '","eventType":"' + eventType + '","direction":' + directionLiteral +
    ',"normalizedSourceUrl":"' + normalizedSourceUrl + '","sourceDomain":"' + sourceDomain + '","provider":"' + PROVIDER_ID + '"}';
  return crypto.createHash('sha256').update(json, 'utf8').digest('hex');
}

// eventType/relevanceScope default to 'catalyst'/'company' so every pre-S1.5
// call site (fixed 6-arg positional form) keeps working; a test exercising
// the taxonomy fields passes the trailing args. subType: an explicit value
// always wins; otherwise 'other_catalyst' defaults to a non-empty value
// ('general'), and every other category defaults to null.
function expectedItem(eventDate, category, direction, sourceUrl, normalizedSourceUrl, sourceDomain, eventType, relevanceScope, subType) {
  var et = eventType === undefined ? 'catalyst' : eventType;
  var rs = relevanceScope === undefined ? 'company' : relevanceScope;
  var st = subType !== undefined ? subType : (category === 'other_catalyst' ? 'general' : null);
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
    identityHash: pinnedHash(eventDate, category, et, direction, normalizedSourceUrl, sourceDomain),
    provenance: 'retrieval_unverified',
    confidence: null,
    requiresVerification: true,
    scoringImpact: 'none',
    eventType: et,
    relevanceScope: rs,
    subType: st
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
    var resp = agentResponse(
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
        contractVersion: 'news-contract-v1',
        provider: PROVIDER_ID,
        items: [
          expectedItem('2026-07-18', 'earnings_event', 'positive', url1, url1, 'ir.jfrog.com'),
          expectedItem('2026-07-20', 'guidance_update', 'neutral', url2, url2, 'www.reuters.com')
        ],
        skippedItems: [],
        // S2-A2 (§C.8): sidecar binding — traversal order is [search_result,
        // url_citation] (D-M2: search_results before url_citation), so url2
        // (the search_results entry) is evidenceIndex 0 and url1 (the
        // url_citation entry) is evidenceIndex 1.
        evidenceBindings: [
          { itemIndex: 0, evidenceIndex: 1, evidenceKind: 'url_citation', normalizedSourceUrl: url1 },
          { itemIndex: 1, evidenceIndex: 0, evidenceKind: 'search_result', normalizedSourceUrl: url2 }
        ],
        evidenceSetSize: 2,
        writtenKeys: []
      }
    };
    assert.deepStrictEqual(out, expected, 'envelope deep-equal');
    assert.strictEqual(JSON.stringify(out.envelope), JSON.stringify(expected.envelope), 'envelope stringify-equal (key order)');
    assert.strictEqual(JSON.stringify(out).indexOf('title'), -1, 'no title anywhere in the output');
    assert.strictEqual(JSON.stringify(out).indexOf('summary'), -1, 'no summary anywhere in the output');

    // Exact upstream request (D-M2..D-M8: endpoint, preset, instructions with
    // the nowIso-derived date anchor, input, explicit web_search tool, and a
    // json_schema carrying both `name` and `schema`).
    assert.strictEqual(spy.calls.length, 1, 'exactly one upstream call');
    var call = spy.calls[0];
    assert.strictEqual(call.url, provider.PPLX_ENDPOINT, 'canonical endpoint used');
    assert.strictEqual(call.url, 'https://api.perplexity.ai/v1/agent', 'endpoint literal');
    assert.strictEqual(call.init.method, 'POST', 'POST method');
    assert.deepStrictEqual(call.init.headers, {
      'Authorization': 'Bearer test-key-123',
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }, 'all three headers, injected key only');
    var body = JSON.parse(call.init.body);
    assert.deepStrictEqual(body, {
      preset: 'low',
      instructions: 'You are a financial news retrieval service. Return only JSON that conforms exactly to the provided schema. Include only events with a verifiable dated primary source. The current UTC date is 2026-07-24.',
      input: [
        {
          type: 'message',
          role: 'user',
          content: 'Cover the U.S. equity ticker ' + TICKER + '. Report catalysts from the previous 30 calendar days ' +
            'and known upcoming events over the next 60 calendar days. For each item provide: eventDate (ISO ' +
            'YYYY-MM-DD, the event\'s own date), category (one of: earnings_event, guidance_update, analyst_action, ' +
            'corporate_action, product_customer_partnership, regulatory_legal, other_catalyst), eventType (catalyst ' +
            'for an event that has already happened, or upcoming_event for a known event scheduled to happen ' +
            'later), direction (positive, neutral, or negative for the company; must be null when eventType is ' +
            'upcoming_event, since the event has not happened yet), relevanceScope (company, sector, or market: ' +
            'keep the event\'s natural category and use this field to express broader scope — never force sector- ' +
            'or market-wide news into other_catalyst), subType (a short label required only when category is ' +
            'other_catalyst, otherwise null), and sourceUrl (the https URL of the source reporting the event). ' +
            'sourceUrl must be copied exactly from a URL actually returned to you by search or page fetch for ' +
            'this event. Do not construct, infer, guess, shorten, normalise or recall a URL from memory, even if ' +
            'you are confident the page exists. If no retrieved URL supports the event, omit the event rather ' +
            'than substituting a different real URL. ' +
            'earnings_event covers actual results, material revenue, EPS, margin or profitability outcomes, profit ' +
            'warnings, material disclosures during the earnings process, and material earnings delays or ' +
            'restatements; it excludes a future earnings-date announcement (report that as upcoming_event), ' +
            'management guidance, and analyst reaction. guidance_update covers management guidance only — raised, ' +
            'lowered, new, withdrawn or suspended guidance and material changes to revenue, EPS, margin, growth, ' +
            'free cash flow, capital expenditure or other outlook metrics, including a material qualitative change ' +
            'with no number; a routine reaffirmation with no new information is not a catalyst, and an analyst ' +
            'forecast is never guidance_update. analyst_action covers an upgrade, downgrade, rating change, ' +
            'initiation, or a material price-target or estimate revision; a small technical revision is not a ' +
            'catalyst. corporate_action covers capital allocation and capital-structure events — merger or ' +
            'acquisition offers, definitive agreements or terminations, buybacks, dividend initiation, cut, ' +
            'suspension or special dividends, splits, spin-offs, material equity or debt issuance or refinancing, ' +
            'bankruptcy, a major capital-structure change, or a material strategic-alternatives or poison-pill ' +
            'action; it excludes ordinary management change, routine operating restructuring, and on-schedule ' +
            'completion of an already-announced deal. An equity-ownership or capital-structure change routes to ' +
            'corporate_action. product_customer_partnership covers material commercial traction — a product ' +
            'launch, a major customer win, a significant contract, a strategic partnership, a material expansion, ' +
            'a meaningful distribution or integration deal, or a design win; it excludes routine public relations ' +
            'such as a non-binding memorandum of understanding, ordinary co-marketing, a routine product update, ' +
            'or an immaterial customer announcement. regulatory_legal covers an approval, rejection, investigation, ' +
            'enforcement action, lawsuit, ruling, fine, settlement, antitrust matter, license or permit, export or ' +
            'import restriction, sanction, injunction, or recall or sales restriction; it excludes routine legal or ' +
            'regulatory noise, and relevanceScope separates a direct company event from sector- or market-wide ' +
            'regulation. A regulatory approval or a regulatory-triggered event routes to regulatory_legal, and ' +
            'where regulation is the primary cause of an event, regulatory_legal may take precedence over ' +
            'corporate_action or product_customer_partnership. An investigation is not automatically negative — ' +
            'direction follows the actual company impact. other_catalyst is a true last resort, used only when no ' +
            'other category applies, and always requires subType — for example a cyber incident, a supply-chain ' +
            'disruption, a short-seller report, a credit-rating action, a major management change, a force ' +
            'majeure event, a trading halt, or another material operating event with no better category. A ' +
            'scheduled future event stays upcoming_event unless it is delayed, cancelled, changed, or otherwise ' +
            'becomes material now — that change, not the original schedule, is the catalyst. One source may ' +
            'produce more than one item, such as an earnings release that carries both results and new guidance. ' +
            'Judge materiality relative to the company and its business impact, without any fixed threshold — a ' +
            'strategically important customer can make a relatively small contract material. For guidance_update ' +
            'specifically, weigh direction against the company\'s own prior guidance and analyst consensus where ' +
            'reliable evidence exists; do not treat every guidance change in one direction as automatically that ' +
            'direction. For eventDate, use the date of the material event described by the catalyst, not a ' +
            'platform or search metadata date, and not a publication date unless that publication date is itself ' +
            'the date of the material announcement or event; for a multi-stage event, use the economically ' +
            'meaningful announcement, decision, or pricing date when that is the event described by the catalyst, ' +
            'and do not substitute a later completion or closing date merely because the later source was ' +
            'retrieved — a later completion may be a separate catalyst only when it is itself materially ' +
            'distinct. For a multi-stage financing or corporate action — for example a convertible or debt ' +
            'offering, an equity offering, a tender or exchange offer, or a merger or acquisition — the catalyst ' +
            'is the announcement, pricing or decision, and eventDate is that date. A later closing, completion, ' +
            'settlement, indenture or effectiveness date is not the catalyst\'s date, and must not be used merely ' +
            'because a later filing or article carried it. If the completion is itself materially distinct — ' +
            'terms changed, size changed, the transaction failed — it is a separate catalyst with its own date. ' +
            'A routine analyst reiteration with no substantive change in rating, price target, ' +
            'estimates, thesis, or another material analyst action is not a catalyst. When the company impact is ' +
            'genuinely ambiguous, use neutral rather than inventing a bullish or bearish direction, but neutral ' +
            'must not be used to rescue an event that is not material enough to be a catalyst in the first place ' +
            '— such an event is simply not emitted. Prefer primary and authoritative sources — company releases, ' +
            'regulatory filings, and regulator publications — over secondary aggregation, when both report the ' +
            'same event. Ordinary conference attendance or an appearance alone is not a catalyst; incremental ' +
            'product public relations without a meaningfully changed state or material consequence is not ' +
            'automatically a catalyst; repeated releases about the same underlying development are not each ' +
            'emitted merely because separate releases exist — materiality comes from the underlying development, ' +
            'not from public-relations volume. Only include events you can source. Do not include commentary, ' +
            'titles, or summaries.'
        }
      ],
      tools: [{ type: 'web_search' }],
      response_format: { type: 'json_schema', json_schema: { name: 'newsCatalysts', schema: provider.REQUEST_SCHEMA } }
    }, 'deterministic body: preset/instructions/input/tools/response_format with REQUEST_SCHEMA, name+schema members only, no strict');
    assert.ok(!('strict' in body.response_format.json_schema), 'strict omitted entirely (Q-MIG-2)');
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

    // F-2 (Owner ruling 2026-09-21): the DEFAULT timeout the seam falls back to
    // is pinned at the source — a behavioural default-timeout test would need
    // a 45 s hang in an offline suite; the injected `timeoutMs: 25` case above
    // already proves the timeout path itself. Same source-scoped literal-pin
    // technique as NP38 (endpoint) and NP27 (static scan). DEFAULT_TIMEOUT_MS
    // is module-private (export surface stays 16), so the source is the only
    // place the value is observable.
    var srcNP02 = fs.readFileSync(SRC, 'utf8');
    assert.ok(/^var DEFAULT_TIMEOUT_MS = 45000;\r?$/m.test(srcNP02), 'DEFAULT_TIMEOUT_MS is declared as exactly the literal 45000 (F-2)');
    assert.ok(/timeoutMs:\s*posInt\(opts\.timeoutMs,\s*DEFAULT_TIMEOUT_MS\)/.test(srcNP02), 'injected override seam posInt(opts.timeoutMs, DEFAULT_TIMEOUT_MS) is intact');
    assert.strictEqual(srcNP02.indexOf('22000'), -1, 'the pre-F-2 literal 22000 no longer appears anywhere in the provider source');
  });

  // ── NP03: Tier B — each structural condition individually ──────────────────
  await test('NP03 all seven Tier-B conditions (re-expressed for the Agent shape, §4.5) + 2xx-body-not-JSON ⇒ PROVIDER_INVALID_RESPONSE', async function () {
    // condition 1 — status/output/message/output_text location missing or malformed
    [
      {},                                                                                    // no status at all
      { status: 'in_progress', output: [] },                                                 // wrong status
      { status: 'completed' },                                                                // output missing
      { status: 'completed', output: 'x' },                                                   // output not an array
      { status: 'completed', output: [] },                                                    // no message item
      { status: 'completed', output: [{ type: 'message', role: 'assistant' }] },               // content missing
      { status: 'completed', output: [{ type: 'message', role: 'assistant', content: 'x' }] }, // content not an array
      { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [] }] },  // no output_text entry
      { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text' }] }] },      // text missing
      { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 42 }] }] } // text not a string
    ].forEach(function (resp, i) {
      assert.deepStrictEqual(normRaw(resp), TIER_B, 'cond1 case ' + i);
    });
    // condition 2 — content not parseable JSON
    assert.deepStrictEqual(normRaw(agentShell('not-json{{')), TIER_B, 'cond2');
    // condition 3 — parsed content not an object
    ['"a string"', '[1,2]', '42', 'null'].forEach(function (content, i) {
      assert.deepStrictEqual(normRaw(agentShell(content)), TIER_B, 'cond3 case ' + i);
    });
    // condition 4 — items missing or not an array
    ['{}', '{"items":{}}', '{"items":"x"}', '{"items":null}'].forEach(function (content, i) {
      assert.deepStrictEqual(normRaw(agentShell(content)), TIER_B, 'cond4 case ' + i);
    });
    // condition 5 — an items[] element is not an object
    ['{"items":[1]}', '{"items":["x"]}', '{"items":[null]}', '{"items":[["a"]]}', '{"items":[{},"x"]}'].forEach(function (content, i) {
      assert.deepStrictEqual(normRaw(agentShell(content)), TIER_B, 'cond5 case ' + i);
    });
    // condition 6 — a grounding-bearing output item's results, or the text
    // entry's annotations, present but neither null nor an array
    assert.deepStrictEqual(norm([], 'nope', undefined), TIER_B, 'cond6 annotations string');
    assert.deepStrictEqual(norm([], {}, undefined), TIER_B, 'cond6 annotations object');
    assert.deepStrictEqual(norm([], undefined, 42), TIER_B, 'cond6 search_results.results number');
    // fetch_url_results carries contents[] (live + documented shape) — a
    // malformed contents value fails closed exactly like a malformed
    // search_results.results value.
    var shellFUR = agentShell('{"items":[]}');
    shellFUR.output.unshift({ type: 'fetch_url_results', contents: 42 });
    assert.deepStrictEqual(normRaw(shellFUR), TIER_B, 'cond6 fetch_url_results.contents number');
    // condition 7 — unknown top-level property besides items
    assert.deepStrictEqual(normRaw(agentShell('{"items":[],"extra":1}')), TIER_B, 'cond7');
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

  // ── NP08: grounded-value persistence + D-M2 fixed-order precedence ─────────
  await test('NP08 persisted sourceUrl is the grounding entry\'s own raw URL; D-M2 fixed order wins: search_results > fetch_url_results > url_citation', async function () {
    var cand = 'HTTPS://IR.JFROG.COM/news/x?q=1';
    var srRaw = 'https://IR.JFROG.COM/news/x?q=1';
    var furRaw = 'https://ir.jfrog.com/news/x?q=1#fur';
    var citRaw = 'https://ir.jfrog.com/news/x?q=1#frag';

    var resp = {
      status: 'completed', error: null,
      output: [
        { type: 'search_results', results: [{ url: srRaw }] },
        { type: 'fetch_url_results', contents: [{ url: furRaw }] },
        { type: 'message', role: 'assistant', content: [{
          type: 'output_text',
          text: JSON.stringify({ items: [rawItem('2026-07-18', 'earnings_event', 'positive', cand)] }),
          annotations: [{ type: 'url_citation', url: citRaw }]
        }] }
      ]
    };
    var r = provider.normalizeNewsResponse(resp, { ticker: TICKER, retrievedAt: NOW_ISO });
    assert.strictEqual(r.items.length, 1);
    assert.strictEqual(r.items[0].sourceUrl, srRaw, 'search_results (1st in D-M2 order) wins over fetch_url_results and url_citation, raw text verbatim');
    assert.strictEqual(r.items[0].normalizedSourceUrl, 'https://ir.jfrog.com/news/x?q=1', 'normalized from the grounded URL');
    assert.strictEqual(r.items[0].sourceDomain, 'ir.jfrog.com');

    // fetch_url_results (2nd) wins over url_citation (3rd) when search_results is absent.
    var resp2 = {
      status: 'completed', error: null,
      output: [
        { type: 'fetch_url_results', contents: [{ url: furRaw }] },
        { type: 'message', role: 'assistant', content: [{
          type: 'output_text',
          text: JSON.stringify({ items: [rawItem('2026-07-19', 'earnings_event', 'positive', cand)] }),
          annotations: [{ type: 'url_citation', url: citRaw }]
        }] }
      ]
    };
    var r2 = provider.normalizeNewsResponse(resp2, { ticker: TICKER, retrievedAt: NOW_ISO });
    assert.strictEqual(r2.items[0].sourceUrl, furRaw, 'fetch_url_results (2nd) wins over url_citation (3rd) when search_results is absent');

    // duplicate normalized forms within ONE source array: earliest index wins.
    var dupA = 'https://ir.jfrog.com/news/y?q=2#a';
    var dupB = 'https://IR.JFROG.COM/news/y?q=2';
    var r3 = norm([rawItem('2026-07-20', 'earnings_event', 'positive', dupB)], [dupA, dupB], undefined);
    assert.strictEqual(r3.items[0].sourceUrl, dupA, 'first occurrence within one source array wins');
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
  await test('NP12 direction validity is conditional on eventType (A-1): outside DIRECTIONS/missing on catalyst, non-null on upcoming_event, null on catalyst ⇒ INVALID_DIRECTION', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    var r = norm([
      rawItem('2026-07-18', 'earnings_event', 'bullish', g),
      rawItem('2026-07-18', 'earnings_event', undefined, g),
      rawItem('2026-07-18', 'earnings_event', null, g),
      rawItem('2026-07-18', 'earnings_event', 'positive', g, { eventType: 'upcoming_event' })
    ], [g], undefined);
    assert.deepStrictEqual(r.skippedItems, [
      { reason: 'INVALID_DIRECTION' }, { reason: 'INVALID_DIRECTION' },
      { reason: 'INVALID_DIRECTION' }, { reason: 'INVALID_DIRECTION' }
    ]);
  });

  // ── NP13: zero-item success ─────────────────────────────────────────────────
  await test('NP13 items:[] is a valid, successful empty retrieval (endpoint later maps it to 200 NONE)', async function () {
    var spy = makeFetch(agentResponse([], undefined, undefined));
    var out = await provider.getNewsCatalysts({ ticker: TICKER }, wrapperOpts(spy));
    assert.deepStrictEqual(out, {
      ok: true,
      envelope: {
        ticker: TICKER,
        fetchedAt: NOW_ISO,
        sourceTier: 'perplexity_retrieval',
        contractVersion: 'news-contract-v1',
        provider: PROVIDER_ID,
        items: [],
        skippedItems: [],
        evidenceBindings: [],
        evidenceSetSize: 0,
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
    assert.strictEqual(hash, pinnedHash('2026-07-18', 'earnings_event', 'catalyst', 'positive', g, 'ir.jfrog.com'),
      'hash equals sha256 of the byte-exact pinned tuple literal (key order normative, j3-identity-v2)');
  });

  // ── NP16: title/summary discarded, hash-inert ───────────────────────────────
  await test('NP16 unknown item-level fields (title/summary/etc.) never surface and never influence identityHash', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    var withExtras = rawItem('2026-07-18', 'earnings_event', 'positive', g,
      { title: 'BIG HEADLINE', summary: 'Narrative text the model volunteered', extraField: { nested: true } });
    var plain = rawItem('2026-07-18', 'earnings_event', 'positive', g);
    var rA = norm([withExtras], [g], undefined);
    var rB = norm([plain], [g], undefined);
    assert.deepStrictEqual(Object.keys(rA.items[0]), ITEM_FIELD_ORDER, 'exact 17-field projection, exact order');
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
    var spy1 = makeFetch(agentResponse([]));
    var threw = '';
    try { await provider.getNewsCatalysts({ ticker: TICKER }, { fetchImpl: spy1.fn, nowIso: NOW_ISO }); }
    catch (e) { threw = e && e.message; }
    assert.strictEqual(threw, 'PPLX_API_KEY_MISSING');
    assert.strictEqual(spy1.calls.length, 0, 'no fetch before the key gate');

    threw = '';
    try { await provider.getNewsCatalysts({ ticker: TICKER }, { apiKey: 'k', nowIso: NOW_ISO }); }
    catch (e) { threw = e && e.message; }
    assert.strictEqual(threw, 'PPLX_FETCH_UNAVAILABLE');

    var spy2 = makeFetch(agentResponse([]));
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
    var spy3 = makeFetch(agentResponse([]));
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
    var spy4 = makeFetch(agentResponse([]));
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
      var spyV = makeFetch(agentResponse([]));
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
    var parsed = agentResponse([rawItem('2026-07-18', 'earnings_event', 'positive', g,
      { title: 'kept on the input, never on the output' })], [g], undefined);
    var snap = JSON.stringify(parsed);
    var r1 = provider.normalizeNewsResponse(parsed, { ticker: TICKER, retrievedAt: NOW_ISO });
    var r2 = provider.normalizeNewsResponse(parsed, { ticker: TICKER, retrievedAt: NOW_ISO });
    assert.strictEqual(JSON.stringify(r1), JSON.stringify(r2), 'deterministic');
    assert.strictEqual(JSON.stringify(parsed), snap, 'input response object never mutated');

    var spyA = makeFetch(agentResponse([rawItem('2026-07-18', 'earnings_event', 'positive', g)], [g], undefined));
    var spyB = makeFetch(agentResponse([rawItem('2026-07-18', 'earnings_event', 'positive', g)], [g], undefined));
    var o1 = await provider.getNewsCatalysts({ ticker: TICKER }, wrapperOpts(spyA));
    var o2 = await provider.getNewsCatalysts({ ticker: TICKER }, wrapperOpts(spyB));
    assert.strictEqual(JSON.stringify(o1), JSON.stringify(o2), 'wrapper deterministic end-to-end');

    // D-M4: a different nowIso changes ONLY the date token in the
    // instructions — proving the anchor is derived from the injected clock,
    // not hard-coded, without otherwise disturbing determinism.
    var spyC = makeFetch(agentResponse([], undefined, undefined));
    var spyD = makeFetch(agentResponse([], undefined, undefined));
    await provider.getNewsCatalysts({ ticker: TICKER }, wrapperOpts(spyC));
    await provider.getNewsCatalysts({ ticker: TICKER }, wrapperOpts(spyD, { nowIso: '2027-01-05T09:15:00.000Z' }));
    var instrC = JSON.parse(spyC.calls[0].init.body).instructions;
    var instrD = JSON.parse(spyD.calls[0].init.body).instructions;
    assert.notStrictEqual(instrC, instrD, 'a different nowIso changes the instructions');
    assert.strictEqual(instrC.replace('2026-07-24', 'X'), instrD.replace('2027-01-05', 'X'),
      'the only difference is the date token itself');
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
    assert.strictEqual(provider.IDENTITY_SCHEMA_VERSION, 'j3-identity-v2', 'independent identity version tag (A-2)');
    assert.ok(Object.isFrozen(provider.REQUEST_SCHEMA), 'REQUEST_SCHEMA frozen');
    assert.ok(Object.isFrozen(provider.CATEGORIES), 'CATEGORIES frozen');
    assert.ok(Object.isFrozen(provider.EVENT_TYPES), 'EVENT_TYPES frozen');
    assert.ok(Object.isFrozen(provider.RELEVANCE_SCOPES), 'RELEVANCE_SCOPES frozen');
    assert.ok(Object.isFrozen(provider.SKIP_REASONS), 'SKIP_REASONS frozen');
  });

  // ── NP24: eventType vocabulary ──────────────────────────────────────────────
  await test('NP24 eventType always present and in EVENT_TYPES; out-of-vocabulary/missing ⇒ UNKNOWN_EVENT_TYPE, siblings survive', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    var r = norm([
      rawItem('2026-07-18', 'earnings_event', 'positive', g, { eventType: 'rumor' }),
      rawItem('2026-07-19', 'earnings_event', 'positive', g, { eventType: undefined }),
      rawItem('2026-07-20', 'earnings_event', 'positive', g, { eventType: 'catalyst' })
    ], [g], undefined);
    assert.deepStrictEqual(r.skippedItems, [{ reason: 'UNKNOWN_EVENT_TYPE' }, { reason: 'UNKNOWN_EVENT_TYPE' }], 'unknown/missing eventType skipped, sibling unaffected');
    assert.strictEqual(r.items.length, 1);
    assert.strictEqual(r.items[0].eventType, 'catalyst');
    assert.deepStrictEqual(provider.EVENT_TYPES.slice(), ['catalyst', 'upcoming_event'], 'exported vocabulary is exactly the A-1 set');
  });

  // ── NP25: relevanceScope vocabulary ─────────────────────────────────────────
  await test('NP25 relevanceScope always present and in RELEVANCE_SCOPES; out-of-vocabulary/missing ⇒ INVALID_RELEVANCE_SCOPE', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    var r = norm([
      rawItem('2026-07-18', 'earnings_event', 'positive', g, { relevanceScope: 'global' }),
      rawItem('2026-07-19', 'earnings_event', 'positive', g, { relevanceScope: undefined }),
      rawItem('2026-07-20', 'earnings_event', 'positive', g, { relevanceScope: 'sector' })
    ], [g], undefined);
    assert.deepStrictEqual(r.skippedItems, [{ reason: 'INVALID_RELEVANCE_SCOPE' }, { reason: 'INVALID_RELEVANCE_SCOPE' }]);
    assert.strictEqual(r.items.length, 1);
    assert.strictEqual(r.items[0].relevanceScope, 'sector');
    assert.deepStrictEqual(provider.RELEVANCE_SCOPES.slice(), ['company', 'sector', 'market'], 'exported vocabulary is exactly the DR-3 set');
  });

  // ── NP26: subType conditionality ────────────────────────────────────────────
  await test('NP26 subType non-empty (trimmed) string iff category is other_catalyst, else null; violations (missing/undefined/empty/whitespace-only/present-when-forbidden) ⇒ INVALID_SUB_TYPE; key present on every survivor', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    var r = norm([
      rawItem('2026-07-18', 'other_catalyst', 'positive', g, { subType: null }),
      rawItem('2026-07-19', 'other_catalyst', 'positive', g, { subType: '' }),
      rawItem('2026-07-23', 'other_catalyst', 'positive', g, { subType: '   ' }),
      rawItem('2026-07-24', 'other_catalyst', 'positive', g, { subType: undefined }),
      rawItem('2026-07-20', 'earnings_event', 'positive', g, { subType: 'extra' }),
      rawItem('2026-07-21', 'other_catalyst', 'positive', g, { subType: 'trading_halt' }),
      rawItem('2026-07-22', 'earnings_event', 'positive', g)
    ], [g], undefined);
    assert.deepStrictEqual(r.skippedItems, [
      { reason: 'INVALID_SUB_TYPE' }, { reason: 'INVALID_SUB_TYPE' }, { reason: 'INVALID_SUB_TYPE' },
      { reason: 'INVALID_SUB_TYPE' }, { reason: 'INVALID_SUB_TYPE' }
    ]);
    assert.strictEqual(r.items.length, 2);
    assert.strictEqual(r.items[0].subType, 'trading_halt');
    assert.strictEqual(r.items[1].subType, null);
    r.items.forEach(function (it) { assert.ok(Object.prototype.hasOwnProperty.call(it, 'subType'), 'subType key present on every surviving item'); });
  });

  // ── NP27: no numeric materiality / percentage literal (DR-12) ───────────────
  await test('NP27 static scan: no numeric materiality threshold or percentage literal in the ladder or the prompt', async function () {
    var s = fs.readFileSync(SRC, 'utf8');
    // Scope the scan to the validation ladder function only, extracted by
    // brace-depth so it isn't truncated by a nested block — the module's OWN
    // leap-year clock-grammar check legitimately uses '%' as the modulo
    // operator, which is unrelated to DR-12 materiality and must not trip
    // this scan, and its for-loop counters (`i < rawItems.length`) are
    // ordinary iteration, not a materiality gate.
    var fnStart = s.indexOf('function normalizeNewsResponse(');
    assert.ok(fnStart !== -1, 'normalizeNewsResponse function located for the scan');
    var depth = 0, started = false, fnEnd = fnStart;
    for (; fnEnd < s.length; fnEnd++) {
      if (s[fnEnd] === '{') { depth++; started = true; }
      else if (s[fnEnd] === '}') { depth--; if (started && depth === 0) { fnEnd++; break; } }
    }
    var ladder = s.slice(fnStart, fnEnd);
    assert.strictEqual(ladder.indexOf('%'), -1, 'no percentage literal in the validation ladder');
    // The real DR-12 proof: the ladder never gates on a numeric magnitude
    // derived from an item's own field — that would be a hardcoded
    // materiality threshold. Ordinary loop counters (`i < rawItems.length`)
    // and the fixed Tier-B `choices.length < 1` check do not reference
    // `raw.<field>` and so do not match.
    assert.ok(!/raw\.\w+\s*[<>]=?\s*-?\d/.test(ladder), 'no item field compared against a numeric threshold');
    assert.ok(!/-?\d+(\.\d+)?\s*[<>]=?\s*raw\.\w+/.test(ladder), 'no numeric threshold compared against an item field');
    var spy = makeFetch(agentResponse([]));
    await provider.getNewsCatalysts({ ticker: TICKER }, wrapperOpts(spy));
    var promptText = JSON.parse(spy.calls[0].init.body).input[0].content;
    assert.strictEqual(promptText.indexOf('%'), -1, 'no percentage literal in the prompt');
    var digits = promptText.match(/\d+/g) || [];
    digits.forEach(function (d) { assert.ok(d === '30' || d === '60', 'unexpected numeric literal in the prompt: ' + d); });
  });

  // ── NP28: three-site category vocabulary parity (DR-14) ─────────────────────
  await test('NP28 category vocabulary parity across CATEGORIES, the REQUEST_SCHEMA enum, and the prompt list', async function () {
    var schemaEnum = provider.REQUEST_SCHEMA.properties.items.items.properties.category.enum;
    assert.deepStrictEqual(schemaEnum.slice().sort(), provider.CATEGORIES.slice().sort(), 'schema enum matches CATEGORIES');
    var spy = makeFetch(agentResponse([]));
    await provider.getNewsCatalysts({ ticker: TICKER }, wrapperOpts(spy));
    var promptText = JSON.parse(spy.calls[0].init.body).input[0].content;
    provider.CATEGORIES.forEach(function (cat) {
      assert.ok(promptText.indexOf(cat) !== -1, 'prompt names category: ' + cat);
    });
  });

  // ── NP29: prompt windows in words, no standalone 'recent' (Q-S15-4) ─────────
  await test('NP29 prompt states both windows explicitly in calendar days; no standalone "recent" literal', async function () {
    var spy = makeFetch(agentResponse([]));
    await provider.getNewsCatalysts({ ticker: TICKER }, wrapperOpts(spy));
    var promptText = JSON.parse(spy.calls[0].init.body).input[0].content;
    assert.ok(promptText.indexOf('the previous 30 calendar days') !== -1, 'previous-30 window phrase present');
    assert.ok(promptText.indexOf('the next 60 calendar days') !== -1, 'next-60 window phrase present');
    assert.ok(!/\brecent\b/i.test(promptText), 'no standalone "recent" literal');
  });

  // ── NP30: relevanceScope is identity-inert (A-2) ────────────────────────────
  await test('NP30 relevanceScope is identity-inert: two items differing only in relevanceScope collide ⇒ DUPLICATE_IN_BATCH', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    var r = norm([
      rawItem('2026-07-18', 'earnings_event', 'positive', g, { relevanceScope: 'company' }),
      rawItem('2026-07-18', 'earnings_event', 'positive', g, { relevanceScope: 'market' })
    ], [g], undefined);
    assert.strictEqual(r.items.length, 1, 'first kept');
    assert.strictEqual(r.items[0].relevanceScope, 'company');
    assert.deepStrictEqual(r.skippedItems, [{ reason: 'DUPLICATE_IN_BATCH' }], 'second dropped — scope does not affect identity');
  });

  // ── NP31: eventType is identity-bearing (A-2) ───────────────────────────────
  await test('NP31 eventType is identity-bearing: present in the tuple after category, before direction; differs alone (direction held constant) ⇒ different hash; both valid A-1 shapes survive distinctly', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    // S1.5.1 H-B: held at a historical date (not future) so the catalyst row
    // is unaffected by FUTURE_DATED_CATALYST — this test isolates eventType's
    // own tuple slot, independent of date-vs-anchor, which NP42+ covers.
    var sharedDate = '2026-07-18';
    // Direct tuple-position proof, independent of direction: same eventDate/
    // category/direction/URL, eventType alone differs — isolates its own slot
    // (after category, before direction) rather than riding on direction's
    // existing identity-bearing effect.
    var hashCatalyst = pinnedHash(sharedDate, 'earnings_event', 'catalyst', 'positive', g, 'ir.jfrog.com');
    var hashUpcomingSameDirection = pinnedHash(sharedDate, 'earnings_event', 'upcoming_event', 'positive', g, 'ir.jfrog.com');
    assert.notStrictEqual(hashCatalyst, hashUpcomingSameDirection,
      'eventType alone, direction held constant, changes the hash — eventType occupies its own tuple slot');

    // End-to-end: both A-1-valid item shapes survive as distinct, correctly-keyed records.
    var r = norm([
      rawItem(sharedDate, 'earnings_event', 'positive', g, { eventType: 'catalyst', relevanceScope: 'company' }),
      rawItem(sharedDate, 'earnings_event', null, g, { eventType: 'upcoming_event', relevanceScope: 'company' })
    ], [g], undefined);
    assert.strictEqual(r.items.length, 2, 'both survive');
    assert.deepStrictEqual(r.skippedItems, [], 'neither is a duplicate');
    assert.strictEqual(r.items[0].identityHash, hashCatalyst, 'catalyst item hash matches the pinned tuple order');
    assert.strictEqual(r.items[1].identityHash,
      pinnedHash(sharedDate, 'earnings_event', 'upcoming_event', null, g, 'ir.jfrog.com'),
      'upcoming_event item hash matches the pinned tuple order');
    assert.notStrictEqual(r.items[0].identityHash, r.items[1].identityHash, 'different hashes');
    assert.notStrictEqual(provider.buildNewsKey(r.items[0]), provider.buildNewsKey(r.items[1]), 'different keys');
  });

  // ── NP32: direction conditionality on a future-dated fixture (A-1, A-4.1) ──
  await test('NP32 direction conditionality (A-1) on a future-dated fixture: mis-shaped ⇒ INVALID_DIRECTION, well-shaped survives and keys cleanly (A-4.1)', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    // S1.5.1 H-B: catalyst rows use a historical date (FUTURE_DATED_CATALYST
    // is orthogonal to this test's direction-conditionality target); the
    // upcoming_event rows stay future-dated — A-4.1 still requires that to
    // survive, unconditionally, which is exactly what this test also proves.
    var pastDate = '2026-07-18';
    var futureDate = '2026-11-19'; // after NOW_ISO (2026-07-24T00:00:00.000Z)
    var r = norm([
      rawItem(futureDate, 'earnings_event', 'positive', g, { eventType: 'upcoming_event' }),
      rawItem(pastDate, 'earnings_event', null, g, { eventType: 'catalyst' }),
      rawItem(pastDate, 'earnings_event', 'positive', g, { eventType: 'catalyst' }),
      rawItem(futureDate, 'earnings_event', null, g, { eventType: 'upcoming_event' })
    ], [g], undefined);
    assert.deepStrictEqual(r.skippedItems, [{ reason: 'INVALID_DIRECTION' }, { reason: 'INVALID_DIRECTION' }]);
    assert.strictEqual(r.items.length, 2);
    assert.strictEqual(r.items[0].direction, 'positive');
    assert.strictEqual(r.items[0].eventType, 'catalyst');
    assert.strictEqual(r.items[1].direction, null);
    assert.strictEqual(r.items[1].eventType, 'upcoming_event');
    assert.ok(provider.NEWS_KEY_RE.test(provider.buildNewsKey(r.items[1])), 'future-dated upcoming_event key matches NEWS_KEY_RE');
  });

  // ── NP33: status must fail closed ───────────────────────────────────────────
  await test('NP33 status !== "completed" ⇒ PROVIDER_INVALID_RESPONSE, zero items, zero partial output', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    ['in_progress', 'failed', 'incomplete', 'queued'].forEach(function (status) {
      var resp = agentResponse([rawItem('2026-07-18', 'earnings_event', 'positive', g)], [g], undefined, { status: status });
      assert.deepStrictEqual(normRaw(resp), TIER_B, 'status: ' + status);
    });
    var spy = makeFetch(agentResponse([rawItem('2026-07-18', 'earnings_event', 'positive', g)], [g], undefined, { status: 'in_progress' }));
    var out = await provider.getNewsCatalysts({ ticker: TICKER }, wrapperOpts(spy));
    assert.deepStrictEqual(out, TIER_B, 'wrapper level: non-completed status is Tier B, not a partial envelope');
  });

  // ── NP34: three-source grounding union ──────────────────────────────────────
  await test('NP34 grounding unions all three D-M2 sources; each source alone also works', async function () {
    var urlSR = 'https://a.example.com/sr';
    var urlFUR = 'https://b.example.com/fur';
    var urlCite = 'https://c.example.com/cite';

    function threeSourceResp(items) {
      return {
        status: 'completed', error: null,
        output: [
          { type: 'search_results', results: [{ url: urlSR }] },
          { type: 'fetch_url_results', contents: [{ url: urlFUR }] },
          { type: 'message', role: 'assistant', content: [{
            type: 'output_text', text: JSON.stringify({ items: items }),
            annotations: [{ type: 'url_citation', url: urlCite }]
          }] }
        ]
      };
    }
    var items = [
      rawItem('2026-07-18', 'earnings_event', 'positive', urlSR),
      rawItem('2026-07-19', 'earnings_event', 'positive', urlFUR),
      rawItem('2026-07-20', 'earnings_event', 'positive', urlCite)
    ];
    var r = provider.normalizeNewsResponse(threeSourceResp(items), { ticker: TICKER, retrievedAt: NOW_ISO });
    assert.strictEqual(r.items.length, 3, 'all three sources resolve their own item');
    assert.deepStrictEqual(r.skippedItems, []);

    // Each source alone also works — on its OWN field name: search_results
    // carries results[], fetch_url_results carries contents[] (the live and
    // documented Agent shape; S1.5.2 F-1).
    function aloneResp(groundingItem, url) {
      return {
        status: 'completed', error: null,
        output: [
          groundingItem,
          { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ items: [rawItem('2026-07-21', 'earnings_event', 'positive', url)] }), annotations: [] }] }
        ]
      };
    }
    var rSR = provider.normalizeNewsResponse(aloneResp({ type: 'search_results', results: [{ url: urlSR }] }, urlSR), { ticker: TICKER, retrievedAt: NOW_ISO });
    assert.strictEqual(rSR.items.length, 1, 'search_results alone resolves');
    var rFUR = provider.normalizeNewsResponse(aloneResp({ type: 'fetch_url_results', contents: [{ url: urlFUR }] }, urlFUR), { ticker: TICKER, retrievedAt: NOW_ISO });
    assert.strictEqual(rFUR.items.length, 1, 'fetch_url_results alone resolves — a URL available ONLY through contents[] grounds its item');
    assert.strictEqual(rFUR.items[0].sourceUrl, urlFUR, 'persisted sourceUrl is the contents[] entry\'s own raw URL');

    // Planted negative: the same URL offered only under a results[] field on a
    // fetch_url_results item is NOT a grounding candidate — the adapter reads
    // contents[] on that type and never results[] — so the item fails closed.
    var rWrongField = provider.normalizeNewsResponse(aloneResp({ type: 'fetch_url_results', results: [{ url: urlFUR }] }, urlFUR), { ticker: TICKER, retrievedAt: NOW_ISO });
    assert.strictEqual(rWrongField.ok, true, 'results[] on fetch_url_results is not a grounding field: no Tier B');
    assert.strictEqual(rWrongField.items.length, 0, 'results[] on fetch_url_results is ignored — nothing grounds');
    assert.deepStrictEqual(rWrongField.skippedItems, [{ reason: 'INVALID_SOURCE_URL' }], 'the item fails closed as INVALID_SOURCE_URL');
    var citeOnly = {
      status: 'completed', error: null,
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ items: [rawItem('2026-07-22', 'earnings_event', 'positive', urlCite)] }), annotations: [{ type: 'url_citation', url: urlCite }] }] }]
    };
    var rCite = provider.normalizeNewsResponse(citeOnly, { ticker: TICKER, retrievedAt: NOW_ISO });
    assert.strictEqual(rCite.items.length, 1, 'url_citation alone resolves');
  });

  // ── NP35: lookup by type, not index ─────────────────────────────────────────
  await test('NP35 a reordered output[] produces byte-identical output — proves lookup by type, never by index', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    var searchItem = { type: 'search_results', results: [{ url: g }] };
    var messageItem = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ items: [rawItem('2026-07-18', 'earnings_event', 'positive', g)] }), annotations: [] }] };
    var respA = { status: 'completed', error: null, output: [searchItem, messageItem] };
    var respB = { status: 'completed', error: null, output: [messageItem, searchItem] };
    var rA = provider.normalizeNewsResponse(respA, { ticker: TICKER, retrievedAt: NOW_ISO });
    var rB = provider.normalizeNewsResponse(respB, { ticker: TICKER, retrievedAt: NOW_ISO });
    assert.strictEqual(JSON.stringify(rA), JSON.stringify(rB), 'output[] order does not matter');
    assert.strictEqual(rA.items.length, 1);
  });

  // ── NP36: unrecognised item types are ignored ───────────────────────────────
  await test('NP36 an output[] item of an unrecognised type is ignored, not a failure', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    var resp = {
      status: 'completed', error: null,
      output: [
        { type: 'reasoning', summary: 'thinking...' },
        { type: 'tool_call', name: 'web_search', args: {} },
        { type: 'search_results', results: [{ url: g }] },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ items: [rawItem('2026-07-18', 'earnings_event', 'positive', g)] }), annotations: [] }] }
      ]
    };
    var r = provider.normalizeNewsResponse(resp, { ticker: TICKER, retrievedAt: NOW_ISO });
    assert.strictEqual(r.ok, true, 'unrecognised item types do not cause Tier B');
    assert.strictEqual(r.items.length, 1);
  });

  // ── NP37: zero grounding candidates ─────────────────────────────────────────
  await test('NP37 zero grounding candidates ⇒ all items skipped INVALID_SOURCE_URL, zero-item envelope, not Tier B', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    var resp = {
      status: 'completed', error: null,
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ items: [rawItem('2026-07-18', 'earnings_event', 'positive', g)] }), annotations: [] }] }]
    };
    var r = provider.normalizeNewsResponse(resp, { ticker: TICKER, retrievedAt: NOW_ISO });
    assert.strictEqual(r.ok, true, 'not Tier B');
    assert.strictEqual(r.items.length, 0);
    assert.deepStrictEqual(r.skippedItems, [{ reason: 'INVALID_SOURCE_URL' }]);

    var spy = makeFetch(resp);
    var out = await provider.getNewsCatalysts({ ticker: TICKER }, wrapperOpts(spy));
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.envelope.items.length, 0, 'zero-item envelope, not a failure');
  });

  // ── NP38: endpoint literal ───────────────────────────────────────────────────
  await test('NP38 PPLX_ENDPOINT equals the literal https://api.perplexity.ai/v1/agent', async function () {
    assert.strictEqual(provider.PPLX_ENDPOINT, 'https://api.perplexity.ai/v1/agent');
  });

  // ── NP39: Evidence Set retained, metadata inert on items/skippedItems ──────
  // S2-A2 (Owner-ruled): the old whole-envelope inertness guarantee is
  // narrowed. evidenceKind/source-kind literals now intentionally appear in
  // the envelope's evidenceBindings sidecar (the A2 observability surface);
  // they remain forbidden on items, skippedItems, and the 17-field public
  // item/stored-record contract. APPROVED_EVIDENCE_KINDS below is the exact
  // §C.5 vocabulary — the same three literals adaptAgentResponse assigns.
  var APPROVED_EVIDENCE_KINDS = ['search_result', 'fetch_url_result', 'url_citation'];
  await test('NP39 Evidence Set carries all nine fields when supplied and tolerates their absence; metadata never leaks onto items/skippedItems; evidenceKind appears only in the evidenceBindings sidecar, restricted to the approved kinds', async function () {
    // Private structural proof that appendEvidenceEntry actually retains all
    // nine Evidence Set fields — without exporting the internal shape (the
    // export surface stays at exactly 16). If any of these assignments were
    // silently removed, the behavioral assertions below would still pass
    // (the fields are never read by any public output), so this mechanical,
    // source-scoped check is the only thing that would catch that
    // regression. Scoped to appendEvidenceEntry's own body only, extracted
    // by brace-depth, never a whole-file keyword scan.
    var srcNP39 = fs.readFileSync(SRC, 'utf8');
    var fnStartNP39 = srcNP39.indexOf('function appendEvidenceEntry(');
    assert.ok(fnStartNP39 !== -1, 'appendEvidenceEntry function located for the scan');
    var depthNP39 = 0, startedNP39 = false, fnEndNP39 = fnStartNP39;
    for (; fnEndNP39 < srcNP39.length; fnEndNP39++) {
      if (srcNP39[fnEndNP39] === '{') { depthNP39++; startedNP39 = true; }
      else if (srcNP39[fnEndNP39] === '}') { depthNP39--; if (startedNP39 && depthNP39 === 0) { fnEndNP39++; break; } }
    }
    var fnBodyNP39 = srcNP39.slice(fnStartNP39, fnEndNP39);
    var requiredFieldAssignments = [
      ['raw', /\braw:\s*checked\b/],
      ['normalized', /\bnormalized:\s*normalized\b/],
      ['domain', /\bdomain:\s*new URL\(/],
      ['evidenceKind', /\bevidenceKind:\s*evidenceKind\b/],
      ['id', /entry\.id\s*=\s*raw\.id\b/],
      ['title', /entry\.title\s*=\s*raw\.title\b/],
      ['date', /entry\.date\s*=\s*raw\.date\b/],
      ['lastUpdated', /entry\.lastUpdated\s*=\s*raw\.last_updated\b/],
      ['snippet', /entry\.snippet\s*=\s*raw\.snippet\b/]
    ];
    requiredFieldAssignments.forEach(function (pair) {
      assert.ok(pair[1].test(fnBodyNP39), 'appendEvidenceEntry must assign the "' + pair[0] + '" Evidence Set field');
    });

    var g = 'https://ir.jfrog.com/news/a';
    var fullEntry = { id: 'SENTINEL_ID', url: g, title: 'SENTINEL_TITLE', date: 'SENTINEL_DATE', last_updated: 'SENTINEL_LASTUPDATED', snippet: 'SENTINEL_SNIPPET' };
    var respFull = {
      status: 'completed', error: null,
      output: [
        { type: 'search_results', results: [fullEntry] },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ items: [rawItem('2026-07-18', 'earnings_event', 'positive', g)] }), annotations: [] }] }
      ]
    };
    var rFull = provider.normalizeNewsResponse(respFull, { ticker: TICKER, retrievedAt: NOW_ISO });
    assert.strictEqual(rFull.items.length, 1, 'resolves with all nine fields supplied');
    // FORBIDDEN: Evidence Set metadata leaking onto the public item /
    // skipped-item shape. Scoped to items+skippedItems only — NOT the whole
    // rFull object, which now intentionally carries evidenceBindings.
    var textFullPublic = JSON.stringify({ items: rFull.items, skippedItems: rFull.skippedItems });
    ['SENTINEL_ID', 'SENTINEL_TITLE', 'SENTINEL_DATE', 'SENTINEL_LASTUPDATED', 'SENTINEL_SNIPPET', 'evidenceKind', 'search_result'].forEach(function (needle) {
      assert.strictEqual(textFullPublic.indexOf(needle), -1, 'no leak of ' + needle + ' onto items/skippedItems');
    });
    assert.deepStrictEqual(Object.keys(rFull.items[0]), ITEM_FIELD_ORDER, 'still exactly 17 fields, exact order');

    // ALLOWED: the S2-A2 observability sidecar. evidenceKind MUST appear
    // here, restricted to the approved source-kind vocabulary.
    assert.ok(Array.isArray(rFull.evidenceBindings), 'evidenceBindings must be present on the normalizeNewsResponse result');
    assert.strictEqual(rFull.evidenceBindings.length, 1, 'exactly one binding for the one surviving item');
    assert.strictEqual(rFull.evidenceBindings[0].evidenceKind, 'search_result', 'the search_results entry is the one grounding source here');
    assert.ok(APPROVED_EVIDENCE_KINDS.indexOf(rFull.evidenceBindings[0].evidenceKind) !== -1, 'evidenceKind restricted to the approved source kinds');
    assert.strictEqual(rFull.evidenceSetSize, 1, 'evidenceSetSize matches the single supplied search_results entry');

    // fetch_url_result fixture (S1.5.2 F-1; live + documented shape): a
    // contents[] entry carries url / title / snippet and NO id, date or
    // last_updated. Available metadata is retained, absent metadata is not
    // fabricated, and nothing leaks into the public item.
    //   - retention/no-fabrication, mechanically: appendEvidenceEntry copies
    //     each optional field only behind its `!== undefined` guard (checked
    //     below on the real source, same brace-depth scope as above), and the
    //     adapter hands the contents[] entry to it verbatim — no literal
    //     constructs an id, date or last_updated for this source.
    //   - leak-proof, behaviourally: sentinel title/snippet absent from output.
    var requiredFieldGuards = [
      ['id', /if\s*\(raw\.id\s*!==\s*undefined\)/],
      ['title', /if\s*\(raw\.title\s*!==\s*undefined\)/],
      ['date', /if\s*\(raw\.date\s*!==\s*undefined\)/],
      ['lastUpdated', /if\s*\(raw\.last_updated\s*!==\s*undefined\)/],
      ['snippet', /if\s*\(raw\.snippet\s*!==\s*undefined\)/]
    ];
    requiredFieldGuards.forEach(function (pair) {
      assert.ok(pair[1].test(fnBodyNP39), 'appendEvidenceEntry must guard the optional "' + pair[0] + '" field with an undefined check (absence ⇒ omitted, never fabricated)');
    });
    var adStartNP39 = srcNP39.indexOf('function adaptAgentResponse(');
    assert.ok(adStartNP39 !== -1, 'adaptAgentResponse function located for the scan');
    var adDepth = 0, adStarted = false, adEnd = adStartNP39;
    for (; adEnd < srcNP39.length; adEnd++) {
      if (srcNP39[adEnd] === '{') { adDepth++; adStarted = true; }
      else if (srcNP39[adEnd] === '}') { adDepth--; if (adStarted && adDepth === 0) { adEnd++; break; } }
    }
    var adBodyNP39 = srcNP39.slice(adStartNP39, adEnd);
    assert.ok(/item\.type === 'fetch_url_results' && Array\.isArray\(item\.contents\)/.test(adBodyNP39), 'adapter reads contents[] on fetch_url_results');
    assert.ok(/appendEvidenceEntry\(evidenceSet,\s*item\.contents\[j\],\s*'fetch_url_result'\)/.test(adBodyNP39), 'adapter passes each contents[] entry verbatim as a fetch_url_result');
    assert.ok(!/fetch_url_results'[^;]*\.results\b/.test(adBodyNP39), 'adapter never reads results on a fetch_url_results item');

    var gFur = 'https://ir.jfrog.com/news/fetched';
    var furEntry = { url: gFur, title: 'SENTINEL_FUR_TITLE', snippet: 'SENTINEL_FUR_SNIPPET' };
    var respFur = {
      status: 'completed', error: null,
      output: [
        { type: 'fetch_url_results', contents: [furEntry] },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ items: [rawItem('2026-07-20', 'earnings_event', 'positive', gFur)] }), annotations: [] }] }
      ]
    };
    var rFur = provider.normalizeNewsResponse(respFur, { ticker: TICKER, retrievedAt: NOW_ISO });
    assert.strictEqual(rFur.items.length, 1, 'fetch_url_result entry with partial metadata resolves');
    assert.strictEqual(rFur.items[0].sourceUrl, gFur, 'grounded on the fetch_url_result entry\'s own raw URL');
    // FORBIDDEN, scoped to items+skippedItems only (see rFull above).
    var textFurPublic = JSON.stringify({ items: rFur.items, skippedItems: rFur.skippedItems });
    ['SENTINEL_FUR_TITLE', 'SENTINEL_FUR_SNIPPET', 'evidenceKind', 'fetch_url_result'].forEach(function (needle) {
      assert.strictEqual(textFurPublic.indexOf(needle), -1, 'no leak of ' + needle + ' onto items/skippedItems');
    });
    assert.deepStrictEqual(Object.keys(rFur.items[0]), ITEM_FIELD_ORDER, 'fetch_url_result-grounded item: still exactly 17 fields, exact order');

    // ALLOWED: sidecar carries the fetch_url_result kind.
    assert.strictEqual(rFur.evidenceBindings.length, 1, 'exactly one binding for the one surviving item');
    assert.strictEqual(rFur.evidenceBindings[0].evidenceKind, 'fetch_url_result', 'the fetch_url_results entry is the one grounding source here');
    assert.ok(APPROVED_EVIDENCE_KINDS.indexOf(rFur.evidenceBindings[0].evidenceKind) !== -1, 'evidenceKind restricted to the approved source kinds');
    assert.strictEqual(rFur.evidenceSetSize, 1, 'evidenceSetSize matches the single supplied fetch_url_results entry');

    // url_citation-only fixture, the case with the least metadata — must
    // still resolve, not merely tolerate absence.
    var respMinimal = {
      status: 'completed', error: null,
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ items: [rawItem('2026-07-19', 'earnings_event', 'positive', g)] }), annotations: [{ type: 'url_citation', url: g }] }] }]
    };
    var rMinimal = provider.normalizeNewsResponse(respMinimal, { ticker: TICKER, retrievedAt: NOW_ISO });
    assert.strictEqual(rMinimal.items.length, 1, 'url_citation-only, least-metadata fixture resolves');
    assert.deepStrictEqual(Object.keys(rMinimal.items[0]), ITEM_FIELD_ORDER);
    // ALLOWED: sidecar carries the url_citation kind, the third and last
    // approved literal.
    assert.strictEqual(rMinimal.evidenceBindings.length, 1, 'exactly one binding for the one surviving item');
    assert.strictEqual(rMinimal.evidenceBindings[0].evidenceKind, 'url_citation', 'the url_citation annotation is the one grounding source here');
    assert.ok(APPROVED_EVIDENCE_KINDS.indexOf(rMinimal.evidenceBindings[0].evidenceKind) !== -1, 'evidenceKind restricted to the approved source kinds');
    assert.strictEqual(rMinimal.evidenceSetSize, 1, 'evidenceSetSize matches the single supplied url_citation annotation');
  });

  // ── NP40: S1.5.1 H-A prompt-rule presence (DR-21a prompt half, DR-22, DR-24, DR-26, DR-30) ──
  await test('NP40 shipped prompt carries all five H-A rule markers (presence only, not a behaviour proof)', async function () {
    // This is a PRESENCE check on the shipped instruction text, not a proof
    // that the model obeys it — that is Pilot 3's job (see brief §3). It
    // exists so a later edit cannot silently drop one of the five rules.
    var spyNP40 = makeFetch(agentResponse([]));
    await provider.getNewsCatalysts({ ticker: TICKER }, wrapperOpts(spyNP40));
    var promptNP40 = JSON.parse(spyNP40.calls[0].init.body).input[0].content;
    var markersNP40 = [
      'use the date of the material event described by the catalyst',
      'routine analyst reiteration with no substantive change',
      'neutral must not be used to rescue an event that is not material enough',
      'Prefer primary and authoritative sources',
      'materiality comes from the underlying development, not from public-relations volume'
    ];
    markersNP40.forEach(function (marker) {
      assert.ok(promptNP40.indexOf(marker) !== -1, 'prompt missing R-rule marker: ' + marker);
    });
  });

  // ── NP41: no numeric materiality threshold in the H-A wording (DR-30, DR-12) ────────────────
  await test('NP41 static scan: the H-A materiality/reiteration wording introduces no numeric threshold', async function () {
    // Extends NP27's static scan to the new H-A sentences specifically —
    // isolated by slicing between the guidance_update tail (the last
    // unchanged sentence) and the closing "Only include events" sentence,
    // so this test fails on the added wording alone, not on the pre-existing
    // "30/60 calendar days" windows NP27 already tolerates.
    var spyNP41 = makeFetch(agentResponse([]));
    await provider.getNewsCatalysts({ ticker: TICKER }, wrapperOpts(spyNP41));
    var promptNP41 = JSON.parse(spyNP41.calls[0].init.body).input[0].content;
    var haStart = promptNP41.indexOf('For eventDate, use the date of the material event');
    var haEnd = promptNP41.indexOf('Only include events you can source.');
    assert.ok(haStart !== -1 && haEnd !== -1 && haEnd > haStart, 'H-A wording span located in the shipped prompt');
    var haText = promptNP41.slice(haStart, haEnd);
    assert.strictEqual(haText.indexOf('%'), -1, 'no percentage literal in the H-A wording');
    assert.strictEqual(haText.indexOf('$'), -1, 'no currency literal in the H-A wording');
    assert.ok(!/\d/.test(haText), 'no numeric literal (count or threshold) in the H-A wording');
  });

  // ── NP42: S1.5.1 H-B mechanism 1 — generic/container source-URL rejection (DR-20) ───
  await test('NP42 generic/container source URL rejected (bare root, generic index, case-insensitive); article-specific URL under the same segment and a normal authoritative article URL both survive', async function () {
    var urlRoot = 'https://ir.jfrog.com/';
    var urlIndex = 'https://ir.jfrog.com/news';
    var urlIndexSlash = 'https://ir.jfrog.com/press-releases/';
    var urlIndexCaseInsensitive = 'https://ir.jfrog.com/NEWS';
    var urlArticle = 'https://ir.jfrog.com/news/q3-results';
    var urlReuters = 'https://www.reuters.com/markets/frog-guidance-2026-09-18/';
    var rNP42 = norm([
      rawItem('2026-07-18', 'earnings_event', 'positive', urlRoot),
      rawItem('2026-07-18', 'earnings_event', 'positive', urlIndex),
      rawItem('2026-07-18', 'earnings_event', 'positive', urlIndexSlash),
      rawItem('2026-07-18', 'earnings_event', 'positive', urlIndexCaseInsensitive),
      rawItem('2026-07-18', 'earnings_event', 'positive', urlArticle),
      rawItem('2026-07-18', 'earnings_event', 'positive', urlReuters)
    ], [urlRoot, urlIndex, urlIndexSlash, urlIndexCaseInsensitive, urlArticle, urlReuters], undefined);
    assert.deepStrictEqual(rNP42.skippedItems, [
      { reason: 'GENERIC_SOURCE_URL' },
      { reason: 'GENERIC_SOURCE_URL' },
      { reason: 'GENERIC_SOURCE_URL' },
      { reason: 'GENERIC_SOURCE_URL' }
    ], 'bare root, /news, /press-releases/, and case-insensitive /NEWS all rejected as generic');
    assert.strictEqual(rNP42.items.length, 2, 'the two article-specific URLs survive');
    assert.strictEqual(rNP42.items[0].sourceUrl, urlArticle, 'IR newsroom article-specific path survives (not a substring/prefix match)');
    assert.strictEqual(rNP42.items[1].sourceUrl, urlReuters, 'normal authoritative article URL survives');
  });

  // ── NP43: S1.5.1 H-B mechanism 2 — future-dated-catalyst rejection (DR-21a deterministic half) ──
  await test('NP43 catalyst with eventDate after the injected clock is rejected FUTURE_DATED_CATALYST; same-day and historical catalysts survive; future-dated upcoming_event survives unconditionally', async function () {
    var g = 'https://ir.jfrog.com/news/a';
    var rNP43 = norm([
      rawItem('2026-08-01', 'earnings_event', 'positive', g, { eventType: 'catalyst' }),  // after NOW_ISO (2026-07-24) -> rejected
      rawItem('2026-07-24', 'earnings_event', 'positive', g, { eventType: 'catalyst' }),  // same day as NOW_ISO -> survives
      rawItem('2026-07-18', 'earnings_event', 'positive', g, { eventType: 'catalyst' }),  // historical -> survives
      rawItem('2026-11-19', 'earnings_event', null, g, { eventType: 'upcoming_event' })   // future, but not a catalyst -> survives
    ], [g], undefined);
    assert.deepStrictEqual(rNP43.skippedItems, [{ reason: 'FUTURE_DATED_CATALYST' }], 'only the future-dated catalyst is rejected');
    assert.strictEqual(rNP43.items.length, 3);
    assert.strictEqual(rNP43.items[0].eventDate, '2026-07-24', 'same-day catalyst survives');
    assert.strictEqual(rNP43.items[1].eventDate, '2026-07-18', 'historical catalyst survives');
    assert.strictEqual(rNP43.items[2].eventDate, '2026-11-19', 'future-dated upcoming_event survives unconditionally');
    assert.strictEqual(rNP43.items[2].eventType, 'upcoming_event');
    assert.deepStrictEqual(Object.keys(rNP43.items[0]), ITEM_FIELD_ORDER, 'public 17-field contract and field order unchanged');
    assert.ok(/^[a-f0-9]{64}$/.test(rNP43.items[0].identityHash), 'identity construction unchanged (still a sha256 hex tuple hash)');

    // INVALID_EVENT_DATE keeps its existing, narrower meaning — a malformed
    // date, never reused for a valid-but-future catalyst date.
    var rMalformed = norm([rawItem('2026-13-40', 'earnings_event', 'positive', g)], [g], undefined);
    assert.deepStrictEqual(rMalformed.skippedItems, [{ reason: 'INVALID_EVENT_DATE' }], 'malformed date grammar still reports INVALID_EVENT_DATE, unaffected by H-B');
  });

  // ── NP44: S1.5.1 H-B — SKIP_REASONS append-only order; skippedItems shape unchanged ──
  await test('NP44 the ten pre-H-B skip reasons are untouched and unreordered; the two H-B reasons are appended last; a skipped item still exposes only { reason }', async function () {
    assert.strictEqual(provider.SKIP_REASONS.length, 12, 'ten existing + exactly two H-B additions');
    assert.deepStrictEqual(provider.SKIP_REASONS.slice(0, 10), [
      'MISSING_EVENT_DATE', 'INVALID_EVENT_DATE', 'MISSING_SOURCE_URL', 'INVALID_SOURCE_URL',
      'UNKNOWN_CATEGORY', 'INVALID_DIRECTION', 'DUPLICATE_IN_BATCH', 'UNKNOWN_EVENT_TYPE',
      'INVALID_RELEVANCE_SCOPE', 'INVALID_SUB_TYPE'
    ], 'the ten pre-H-B reasons are byte-identical and in their original order');
    assert.deepStrictEqual(provider.SKIP_REASONS.slice(10), ['GENERIC_SOURCE_URL', 'FUTURE_DATED_CATALYST'], 'H-B reasons appended last, in the approved order');

    var g = 'https://ir.jfrog.com/';
    var rShape = norm([rawItem('2026-07-18', 'earnings_event', 'positive', g)], [g], undefined);
    assert.strictEqual(rShape.skippedItems.length, 1);
    assert.deepStrictEqual(Object.keys(rShape.skippedItems[0]), ['reason'], 'a GENERIC_SOURCE_URL skip still exposes only { reason } — no candidate or Evidence Set data leaks');
  });

  // ── NP45: S1.5.1 H-B — GENERIC_SOURCE_PATH_RE boundary: '//' is not '/' ────
  await test("NP45 a grounded pathname of '//' survives GENERIC_SOURCE_URL — the generic-segment group is mandatory, never optional, so it never collides with the bare-root '/' case", async function () {
    // Codex pre-commit finding (S1.5.1 H-B): an earlier regex made the
    // generic-segment alternation optional, so '/' followed by an optional
    // trailing slash also matched a literal '//' pathname. The fix makes the
    // segment mandatory and checks '/' as its own, separate condition — this
    // test pins exactly that boundary, isolated from every other candidate
    // field (valid eventDate, category, direction — only the path is odd).
    var urlDoubleSlash = 'https://example.com//';
    var rNP45 = norm([rawItem('2026-07-18', 'earnings_event', 'positive', urlDoubleSlash)], [urlDoubleSlash], undefined);
    assert.deepStrictEqual(rNP45.skippedItems, [], "a '//' pathname is not rejected as GENERIC_SOURCE_URL");
    assert.strictEqual(rNP45.items.length, 1, "the '//' candidate survives to a persisted item");
  });

  // ── NP46: S1.5.1 H-C C-1 — multi-stage date reinforcement EXTENDS R-1 (presence only) ───
  await test('NP46 shipped prompt carries the C-1 multi-stage date rule with all seven trap terms, placed AFTER the retained R-1 wording (presence only, not a behaviour proof)', async function () {
    // Presence check on the shipped instruction text (the NP40 technique).
    // Pilot 3 reproduced the MRNA convertible-notes date regression against
    // the shipped R-1 sentence, so C-1 ADDS concrete event classes and the
    // completion-date vocabulary AFTER R-1 — it never replaces R-1. Whether
    // the model obeys either sentence is Pilot 4's job (brief §5, §8).
    var spyNP46 = makeFetch(agentResponse([]));
    await provider.getNewsCatalysts({ ticker: TICKER }, wrapperOpts(spyNP46));
    var promptNP46 = JSON.parse(spyNP46.calls[0].init.body).input[0].content;

    // (a) the original R-1 sentence is still present, verbatim and contiguous —
    // one literal, exactly as shipped at 336ff96 (Codex round-1 finding: three
    // separate substrings would let text be altered or inserted between them).
    var r1Sentence = 'For eventDate, use the date of the material event described by the catalyst, not a ' +
      'platform or search metadata date, and not a publication date unless that publication date is itself ' +
      'the date of the material announcement or event; for a multi-stage event, use the economically ' +
      'meaningful announcement, decision, or pricing date when that is the event described by the catalyst, ' +
      'and do not substitute a later completion or closing date merely because the later source was ' +
      'retrieved — a later completion may be a separate catalyst only when it is itself materially ' +
      'distinct.';
    var r1Start = promptNP46.indexOf(r1Sentence);
    assert.ok(r1Start !== -1, 'original R-1 sentence missing or altered (must survive verbatim and contiguous)');
    assert.strictEqual(promptNP46.indexOf(r1Sentence, r1Start + 1), -1, 'R-1 sentence appears exactly once');

    // (b) the C-1 rule is present, and it starts AFTER the retained R-1 sentence.
    var c1Start = promptNP46.indexOf('For a multi-stage financing or corporate action');
    var c1End = promptNP46.indexOf('it is a separate catalyst with its own date.');
    assert.ok(c1Start !== -1 && c1End !== -1 && c1End > c1Start, 'C-1 multi-stage rule span located in the shipped prompt');
    var r1End = r1Start + r1Sentence.length;
    assert.ok(c1Start > r1End, 'C-1 is placed after the retained R-1 sentence (extends, never replaces)');
    var c1Text = promptNP46.slice(c1Start, c1End);

    // (c) the concrete event classes and every completion-date trap term.
    ['convertible', 'debt offering', 'equity offering', 'tender', 'merger or acquisition'].forEach(function (term) {
      assert.ok(c1Text.indexOf(term) !== -1, 'C-1 missing event class: ' + term);
    });
    ['closing', 'completion', 'settlement', 'indenture', 'effectiveness'].forEach(function (term) {
      assert.ok(c1Text.indexOf(term) !== -1, 'C-1 missing trap term: ' + term);
    });
    assert.ok(c1Text.indexOf('the catalyst is the announcement, pricing or decision, and eventDate is that date') !== -1, 'C-1 names the economically meaningful date');
    assert.ok(c1Text.indexOf('must not be used merely because a later filing or article carried it') !== -1, 'C-1 forbids the retrieved-later-date substitution');

    // (d) no numeric threshold, count, percentage or currency literal in C-1 (DR-12 / DR-30).
    assert.ok(!/[\d%$]/.test(c1Text), 'C-1 wording carries no numeric, percentage or currency literal');
  });

  // ── NP47: S1.5.1 H-C C-2 — sourceUrl provenance + omit-rather-than-substitute (presence only) ─
  await test('NP47 shipped prompt carries the C-2 sourceUrl provenance rule inside the sourceUrl field instruction, including the omit-rather-than-substitute clause (presence only, not a behaviour proof)', async function () {
    // Pilot 3 Q-3: a correct, material event was lost because the model
    // supplied a sourceUrl it had never retrieved, and resolveGrounded
    // (correctly) rejected it. C-2 tells the model about that hard
    // constraint. The omit clause is load-bearing: without it, "use a real
    // URL" invites substituting a DIFFERENT real URL — a mis-grounded
    // survivor, which is strictly worse than an INVALID_SOURCE_URL skip.
    var spyNP47 = makeFetch(agentResponse([]));
    await provider.getNewsCatalysts({ ticker: TICKER }, wrapperOpts(spyNP47));
    var promptNP47 = JSON.parse(spyNP47.calls[0].init.body).input[0].content;

    var fieldStart = promptNP47.indexOf('and sourceUrl (the https URL of the source reporting the event).');
    var fieldEnd = promptNP47.indexOf('earnings_event covers actual results');
    assert.ok(fieldStart !== -1 && fieldEnd !== -1 && fieldEnd > fieldStart, 'sourceUrl field instruction and the following category definition both located');
    var c2Text = promptNP47.slice(fieldStart, fieldEnd);

    [
      'sourceUrl must be copied exactly from a URL actually returned to you by search or page fetch for this event',
      'Do not construct, infer, guess, shorten, normalise or recall a URL from memory',
      'even if you are confident the page exists',
      'If no retrieved URL supports the event, omit the event rather than substituting a different real URL'
    ].forEach(function (marker) {
      assert.ok(c2Text.indexOf(marker) !== -1, 'C-2 provenance wording missing from the sourceUrl field instruction: ' + marker);
    });
    assert.ok(!/[\d%$]/.test(c2Text), 'C-2 wording carries no numeric, percentage or currency literal');
  });

  // ── NP49: S1.5.1 H-C — Q-3 regression pin: grounding stays fail-closed ─────
  await test('NP49 a well-formed, plausible, same-domain sourceUrl absent from the Evidence Set is still skipped INVALID_SOURCE_URL after H-C; the identical candidate survives once retrieved — grounding is not weakened', async function () {
    // Q-3 is fixed by INSTRUCTING the model (C-2), never by accepting an
    // unretrieved URL. This pins the thing a future edit must not do:
    // loosen resolveGrounded to domain-, prefix- or similarity-matching.
    // Shape mirrors the Pilot 3 NVDA Q2 FY27 case: the model's URL is a
    // plausible sibling of a retrieved URL on the same host, and a second
    // retrieved page (a different host) covers the same event.
    var retrievedSibling = 'https://nvidianews.nvidia.com/news/nvidia-announces-financial-results-for-second-quarter-fiscal-2026?page=4';
    var retrievedOtherHost = 'https://investor.nvidia.com/events-and-presentations/event-details/2026/NVIDIA-2nd-Quarter-FY27-Financial-Results/default.aspx';
    var unretrieved = 'https://nvidianews.nvidia.com/news/nvidia-announces-financial-results-for-second-quarter-fiscal-2027';
    var candidate = rawItem('2026-07-18', 'earnings_event', 'positive', unretrieved);

    // Grounding unions url_citation + search_results (NP34); neither carries the candidate.
    var rAbsent = norm([candidate], [retrievedSibling], [{ url: retrievedOtherHost, title: 'never persisted' }]);
    assert.deepStrictEqual(rAbsent.items, [], 'the unretrieved same-domain URL never survives');
    assert.deepStrictEqual(rAbsent.skippedItems, [{ reason: 'INVALID_SOURCE_URL' }], 'skipped INVALID_SOURCE_URL — not GENERIC_SOURCE_URL, not any other reason');

    // Control: byte-identical candidate, now actually retrieved ⇒ survives,
    // so the rejection above is grounding-driven, not URL-shape-driven.
    var rPresent = norm([candidate], [retrievedSibling, unretrieved], [{ url: retrievedOtherHost }]);
    assert.deepStrictEqual(rPresent.skippedItems, [], 'once retrieved, the same candidate is not skipped');
    assert.strictEqual(rPresent.items.length, 1, 'once retrieved, the same candidate survives');
    assert.strictEqual(rPresent.items[0].sourceUrl, unretrieved, 'persisted sourceUrl is the grounding entry\'s own raw URL');
  });

  // ── NP50: S2 A5 Rule S — trailing index-document filename is transparent (positive) ───
  await test('NP50 /news/default.aspx is rejected GENERIC_SOURCE_URL — the index-document leaf strips to the generic /news segment', async function () {
    var url = 'https://investors.jfrog.com/news/default.aspx';
    var rNP50 = norm([rawItem('2026-07-18', 'earnings_event', 'positive', url)], [url], undefined);
    assert.deepStrictEqual(rNP50.skippedItems, [{ reason: 'GENERIC_SOURCE_URL' }], 'strips to /news, which GENERIC_SOURCE_PATH_RE matches');
    assert.strictEqual(rNP50.items.length, 0);
  });

  // ── NP51: S2 A5 Rule S — other index-document extensions and generic segments (positive) ───
  await test('NP51 /investors/index.aspx, /newsroom/index.html and /media/default.php are all rejected GENERIC_SOURCE_URL', async function () {
    var urlAspx = 'https://ir.example.com/investors/index.aspx';
    var urlHtml = 'https://ir.example.com/newsroom/index.html';
    var urlPhp = 'https://ir.example.com/media/default.php';
    var rNP51 = norm([
      rawItem('2026-07-18', 'earnings_event', 'positive', urlAspx),
      rawItem('2026-07-18', 'earnings_event', 'positive', urlHtml),
      rawItem('2026-07-18', 'earnings_event', 'positive', urlPhp)
    ], [urlAspx, urlHtml, urlPhp], undefined);
    assert.deepStrictEqual(rNP51.skippedItems, [
      { reason: 'GENERIC_SOURCE_URL' },
      { reason: 'GENERIC_SOURCE_URL' },
      { reason: 'GENERIC_SOURCE_URL' }
    ], 'all three index-document extensions strip to a generic segment');
    assert.strictEqual(rNP51.items.length, 0);
  });

  // ── NP52: S2 A5 Rule S — bare root index document strips to '' (positive, the '' branch) ───
  await test("NP52 /default.aspx (bare root index document) is rejected GENERIC_SOURCE_URL — stripping the leaf yields '', which is explicitly checked", async function () {
    var url = 'https://ir.example.com/default.aspx';
    var rNP52 = norm([rawItem('2026-07-18', 'earnings_event', 'positive', url)], [url], undefined);
    assert.deepStrictEqual(rNP52.skippedItems, [{ reason: 'GENERIC_SOURCE_URL' }], "strips to '', rejected by the explicit '' check");
    assert.strictEqual(rNP52.items.length, 0);
  });

  // ── NP53: S2 A5 Rule S — negative control: JFrog article-specific default.aspx survives ───
  await test('NP53 negative control: /news/news-details/2026/JFrog-Introduces-Zero-Touch-Remediation.../default.aspx survives — the stripped path is still article-specific', async function () {
    var url = 'https://investors.jfrog.com/news/news-details/2026/JFrog-Introduces-Zero-Touch-Remediation-for-Kubernetes/default.aspx';
    var rNP53 = norm([rawItem('2026-07-18', 'earnings_event', 'positive', url)], [url], undefined);
    assert.deepStrictEqual(rNP53.skippedItems, [], 'article-specific path under /news survives Rule S');
    assert.strictEqual(rNP53.items.length, 1);
    assert.strictEqual(rNP53.items[0].sourceUrl, url);
  });

  // ── NP54: S2 A5 Rule S — negative control: NVIDIA article-specific default.aspx survives ───
  await test('NP54 negative control: /news/press-release-details/2026/NVIDIA-Announces-Financial-Results.../default.aspx survives — the stripped path is still article-specific', async function () {
    var url = 'https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Announces-Financial-Results-for-Second-Quarter-Fiscal-2027/default.aspx';
    var rNP54 = norm([rawItem('2026-07-18', 'earnings_event', 'positive', url)], [url], undefined);
    assert.deepStrictEqual(rNP54.skippedItems, [], 'article-specific path under /news survives Rule S');
    assert.strictEqual(rNP54.items.length, 1);
    assert.strictEqual(rNP54.items[0].sourceUrl, url);
  });

  // ── NP55: S2 A5 Rule S — negative control: pre-existing article paths with no index-document leaf ───
  await test('NP55 negative control: /news/q3-results and /news/2026/some-article survive unaffected — no index-document leaf to strip, pre-existing behaviour preserved', async function () {
    var urlA = 'https://ir.example.com/news/q3-results';
    var urlB = 'https://ir.example.com/news/2026/some-article';
    var rNP55 = norm([
      rawItem('2026-07-18', 'earnings_event', 'positive', urlA),
      rawItem('2026-07-18', 'earnings_event', 'positive', urlB)
    ], [urlA, urlB], undefined);
    assert.deepStrictEqual(rNP55.skippedItems, [], 'neither path ends in an index-document leaf');
    assert.strictEqual(rNP55.items.length, 2);
  });

  // ── NP56: S2 A5 Rule S — negative control: 'news-details' is not a generic segment ───
  await test("NP56 negative control: /news-details/default.aspx survives — 'news-details' is not in GENERIC_SOURCE_PATH_RE's segment list, proving the list was not widened", async function () {
    var url = 'https://ir.example.com/news-details/default.aspx';
    var rNP56 = norm([rawItem('2026-07-18', 'earnings_event', 'positive', url)], [url], undefined);
    assert.deepStrictEqual(rNP56.skippedItems, [], 'stripped path /news-details is not a generic segment');
    assert.strictEqual(rNP56.items.length, 1);
    assert.strictEqual(rNP56.items[0].sourceUrl, url);
  });

  // ── NP57: S2 A5 Rule S — regression pin: SKIP_REASONS count unchanged, no new reason ───
  await test('NP57 SKIP_REASONS.length is still 12 and still contains exactly one GENERIC_SOURCE_URL entry — Rule S reuses the existing reason, it does not add a new one', function () {
    assert.strictEqual(provider.SKIP_REASONS.length, 12, 'Rule S reuses GENERIC_SOURCE_URL; no new skip reason');
    var genericCount = provider.SKIP_REASONS.filter(function (r) { return r === 'GENERIC_SOURCE_URL'; }).length;
    assert.strictEqual(genericCount, 1, 'exactly one GENERIC_SOURCE_URL entry — not duplicated, not renamed');

    // Codex review (S2 A5): NP56/NP57 alone proved only that 'news-details'
    // wasn't added and that SKIP_REASONS is still 12 — neither pinned the
    // GENERIC_SOURCE_PATH_RE segment list itself, so a future widening of
    // that regex (e.g. adding 'events') would pass every existing test here
    // while silently rejecting legitimate article paths under the new
    // segment. GENERIC_SOURCE_PATH_RE is deliberately not exported (it is
    // an internal implementation detail), so this pin compares the
    // DECLARATION LINE's source text directly: the current provider file on
    // disk against the same file at the approved A5 baseline (52c322b),
    // read via `git show`. This proves the regex source is byte-unchanged
    // without exporting it and without re-running/reinterpreting the
    // generic-path policy.
    //
    // Codex review round 2: a single-line-anchored regex still matched a
    // `//`-commented copy of the OLD declaration left directly above a
    // widened real one. Codex review round 3: even after anchoring, a
    // `/* ... */` block comment containing the old declaration at column 0
    // (with the real widened declaration indented) still defeated a purely
    // line-based match, since a block comment's content is not excluded by
    // `^...$` line anchoring alone. Fixed by stripping BOTH block and line
    // comments first, via this repo's own established `stripComments`
    // pattern (reused verbatim from qa/fund_facts_route_offline.js:124 —
    // same two-step `/\*[\s\S]*?\*\//g` then `/\/\/[^\n]*/g` replacement
    // used across qa/fund_facts_teardown_offline.js,
    // qa/evidence_freshness_offline.js, qa/batch_pull_wiring_offline.js,
    // qa/batch_owner_script_offline.js), so no comment of either form can
    // hide a decoy declaration for the line-anchored match to find. The
    // regex itself never contains a literal `//` (every slash in the
    // pattern is escaped as `\/`), so line-comment stripping cannot
    // truncate it.
    function stripComments(src) { return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' '); }
    // Line-anchored (^...$ with /m) and requires the line start with the
    // literal declaration keyword at column 0 — after comment-stripping, a
    // decoy copy of this text can no longer appear at all (comments are
    // gone), and an indented real declaration (a mutation attempting to
    // dodge column-0 anchoring) fails loudly via the exact-count assertion
    // below rather than silently matching the wrong text. The 'g' flag plus
    // a match-count assertion additionally guards against more than one
    // such line existing (which would make "the" declaration ambiguous).
    var DECL_RE = /^var GENERIC_SOURCE_PATH_RE = (\/.*\/[a-z]*);$/m;
    var DECL_RE_G = /^var GENERIC_SOURCE_PATH_RE = \/.*\/[a-z]*;$/mg;
    var currentSource = stripComments(fs.readFileSync(SRC, 'utf8'));
    var currentMatches = currentSource.match(DECL_RE_G) || [];
    assert.strictEqual(currentMatches.length, 1, 'expected exactly one GENERIC_SOURCE_PATH_RE declaration line in the current provider source (comment-stripped), found ' + currentMatches.length);
    var currentMatch = DECL_RE.exec(currentSource);
    assert.ok(currentMatch, 'GENERIC_SOURCE_PATH_RE declaration not found in the current provider source (comment-stripped)');

    var relPath = path.relative(path.resolve(__dirname, '..'), SRC).split(path.sep).join('/');
    var child = spawnSync('git', ['show', '52c322b:' + relPath], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
    assert.strictEqual(child.status, 0, 'git show 52c322b:' + relPath + ' failed: ' + child.stderr);
    var baselineSource = stripComments(child.stdout);
    var baselineMatches = baselineSource.match(DECL_RE_G) || [];
    assert.strictEqual(baselineMatches.length, 1, 'expected exactly one GENERIC_SOURCE_PATH_RE declaration line in the 52c322b baseline provider source (comment-stripped), found ' + baselineMatches.length);
    var baselineMatch = DECL_RE.exec(baselineSource);
    assert.ok(baselineMatch, 'GENERIC_SOURCE_PATH_RE declaration not found in the 52c322b baseline provider source (comment-stripped)');

    assert.strictEqual(currentMatch[1], baselineMatch[1], 'GENERIC_SOURCE_PATH_RE source has changed since the approved A5 baseline (52c322b) — the generic-segment list must not be widened or altered by this task');
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
