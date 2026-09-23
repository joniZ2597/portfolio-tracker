'use strict';

/**
 * netlify/functions/lib/news-catalysts-provider.js
 *
 * EG-25C-3 · C3-S1 — J3 News/Catalysts provider (PURE LIB, OFFLINE-ONLY).
 *
 * Deterministic Perplexity Sonar retrieval → news-contract-v1 NewsItem
 * normalizer. Dormant-by-construction: nothing imports this module yet, it
 * reads no ambient environment, and every upstream contact goes through an
 * INJECTED fetch implementation with an INJECTED clock — so the whole module
 * is exercisable fully offline over recorded Sonar-style response fixtures.
 *
 * What it does NOT do (deferred to later C3 slices, each its own owner GO):
 *   - no endpoint / route / HTTP status envelope         (C3-S3 / C3-S4)
 *   - no gate / env / token / allowlist runtime          (C3-S2 / C3-S3)
 *   - no Blob / store write — the create-only writer lands in C3-S3; the
 *     success envelope carries writtenKeys: [] as a fixed empty placeholder
 *   - no live Perplexity call, no automatic retry        (owner-run batch only)
 *   - no J7 freshness evaluation of its own, no scoring, no UI
 *
 * Class R ceiling (spec eg25c3-spec-v1): only strictly structured, verifiable
 * fields are ever emitted. Narrative text (title, summary, any free text the
 * model volunteers) is read at most transiently during projection and
 * discarded — it never reaches a validated item, the identity tuple, or any
 * caller-visible output.
 *
 * Public shape:
 *   getNewsCatalysts(request, options) -> Promise<null | result>
 *     request = { ticker }   strict /^[A-Z]{1,10}$/, non-normalized
 *     options = { fetchImpl, apiKey, nowIso, timeoutMs?, maxBytes? }
 *       - invalid ticker      -> null (graceful, zero fetch)
 *       - missing apiKey      -> throws PPLX_API_KEY_MISSING   (before any I/O)
 *       - missing fetchImpl   -> throws PPLX_FETCH_UNAVAILABLE (before any I/O)
 *       - nowIso not in the strict UTC-Z instant grammar
 *                             -> throws CLOCK_NOT_INJECTED     (before any I/O)
 *     Tier A transport failure  -> { ok:false, reason:'PROVIDER_FAILURE' }
 *     Tier B structural failure -> { ok:false, reason:'PROVIDER_INVALID_RESPONSE' }
 *     success                   -> { ok:true, envelope }
 *
 * Pure core (no I/O, no clock of its own):
 *   normalizeNewsResponse(parsedResponse, context) — Tier-B conditions 1..7,
 *   then per-item Tier-C validation; one reason per skipped item; valid
 *   siblings always continue.
 */

// ── imports (allowlisted: crypto + the shared evidence contract only) ────────

var crypto = require('crypto');
var contract = require('./evidence-contract');

// ── constants ────────────────────────────────────────────────────────────────

var CONTRACT_VERSION = 'news-contract-v1';
var SOURCE_TIER = 'perplexity_retrieval';
var PROVIDER_ID = 'j3-news-catalysts@job-model-v1';
var IDENTITY_SCHEMA_VERSION = 'j3-identity-v2';

var PPLX_ENDPOINT = 'https://api.perplexity.ai/v1/agent';
// D-M8: identifier kept for continuity; the value is now an Agent preset
// name, not a Sonar Chat Completions model id.
var PPLX_MODEL = 'low';

// F-2 (Owner ruling 2026-09-21): raised from the Sonar-era house value after
// live Agent measurements (Pilot 2 / 2B) showed successful calls at 21.9–32.9 s
// and one call beyond 35 s — the old default timed out a live call. 45 s sits
// intentionally below the recorded 60 s synchronous Netlify ceiling for this
// route; the execution mode is unchanged and the full ceiling is not consumed.
// The injected `timeoutMs` override below still wins; no retry exists; a
// timeout still fails closed (PPLX_TIMEOUT -> Tier A PROVIDER_FAILURE).
// fund-facts-provider.js keeps its own separate default.
var DEFAULT_TIMEOUT_MS = 45000;
var DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

var TICKER_RE = /^[A-Z]{1,10}$/;
var NEWS_KEY_RE = /^fundstore:v1:news:[A-Z]{1,10}:\d{4}-\d{2}-\d{2}:[a-f0-9]{64}$/;

// S1.5.1 H-B, mechanism 1 (DR-20): a fixed closed list of generic index leaf
// segments with nothing after them — a trailing slash is the only variation
// tolerated. The segment itself is mandatory (never optional), so this never
// matches a bare '/' or a bare '//' — '/' is checked separately by the
// caller. Deliberately narrow: never matches a path with any further
// segment, so an article-specific path (e.g. /news/q3-results) never
// collides. Codex review finding (S1.5.1 H-B pre-commit): an earlier
// version made the segment group optional, which also matched '//' —
// fixed by making the group mandatory.
var GENERIC_SOURCE_PATH_RE = /^\/(news|press-release|press-releases|investors|investor-relations|newsroom|media)\/?$/i;

// S2 A5, Rule S: strip a trailing index/default document filename before
// applying GENERIC_SOURCE_PATH_RE unchanged. Article-specific paths may also
// use such filenames; they remain valid because the stripped path is still
// specific and does not match the generic-path rule.
var INDEX_DOC_LEAF_RE = /\/(?:default|index)\.(?:aspx|html?|php)$/i;

// Closed 7-item catalyst vocabulary (spec §4). No macro/sector category in v1;
// other_catalyst is the sole catch-all.
var CATEGORIES = deepFreeze([
  'earnings_event',
  'guidance_update',
  'analyst_action',
  'corporate_action',
  'product_customer_partnership',
  'regulatory_legal',
  'other_catalyst'
]);

// A-1 · A-2: catalyst = already happened, carries a direction; upcoming_event
// = known future event, direction must be null. Identity-bearing (A-2).
var EVENT_TYPES = deepFreeze(['catalyst', 'upcoming_event']);

// DR-3: breadth of an event, independent of its natural category.
// Identity-inert (A-2) — never a tuple member.
var RELEVANCE_SCOPES = deepFreeze(['company', 'sector', 'market']);

// Skip reason codes (spec §2 order). One reason per skipped item; a skipped
// item never echoes any item data. The three S1.5 additions are appended
// after DUPLICATE_IN_BATCH so every existing index stays stable. The two
// S1.5.1 H-B additions (GENERIC_SOURCE_URL, FUTURE_DATED_CATALYST) are
// appended last for the same reason — append-only, never reordered.
var SKIP_REASONS = deepFreeze([
  'MISSING_EVENT_DATE',
  'INVALID_EVENT_DATE',
  'MISSING_SOURCE_URL',
  'INVALID_SOURCE_URL',
  'UNKNOWN_CATEGORY',
  'INVALID_DIRECTION',
  'DUPLICATE_IN_BATCH',
  'UNKNOWN_EVENT_TYPE',
  'INVALID_RELEVANCE_SCOPE',
  'INVALID_SUB_TYPE',
  'GENERIC_SOURCE_URL',
  'FUTURE_DATED_CATALYST'
]);

// Exact spec §7 JSON Schema literal. Sent to Sonar as a GENERATION CONSTRAINT
// on the request only — it is never the runtime classification oracle; the
// response is classified by the Tier-B/Tier-C rules below regardless of
// whether the model honored this schema. No ticker/title/summary/provider/
// narrative slot exists here.
var REQUEST_SCHEMA = deepFreeze({
  type: 'object',
  required: ['items'],
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['eventDate', 'category', 'eventType', 'direction', 'relevanceScope', 'subType', 'sourceUrl'],
        additionalProperties: false,
        properties: {
          eventDate: { type: 'string' },
          category: {
            type: 'string',
            enum: [
              'earnings_event', 'guidance_update', 'analyst_action',
              'corporate_action', 'product_customer_partnership',
              'regulatory_legal', 'other_catalyst'
            ]
          },
          eventType: { type: 'string', enum: ['catalyst', 'upcoming_event'] },
          // A-1: null validates only when the 'type' keyword is dropped —
          // conditionality (catalyst requires a value, upcoming_event
          // requires null) is enforced by the ladder, not this schema.
          direction: { enum: ['positive', 'neutral', 'negative', null] },
          relevanceScope: { type: 'string', enum: ['company', 'sector', 'market'] },
          // D-S15-C: always present — a non-empty string iff category is
          // 'other_catalyst', else null. The conditionality is ladder-enforced.
          subType: { type: ['string', 'null'] },
          sourceUrl: { type: 'string' }
        }
      }
    }
  }
});

// ── public: injected-fetch wrapper ───────────────────────────────────────────

async function getNewsCatalysts(request, options) {
  var src = isObject(request) ? request : {};
  var ticker = typeof src.ticker === 'string' ? src.ticker : '';
  var opts = isObject(options) ? options : {};

  // Strict, non-normalized ticker (spec §2): no trim/uppercase coercion — a
  // lowercase or padded ticker is invalid input, returned gracefully.
  if (!TICKER_RE.test(ticker)) {
    return null;
  }

  // Fail closed BEFORE any upstream contact (C1-S1 idiom).
  var apiKey = typeof opts.apiKey === 'string' ? opts.apiKey : '';
  if (!apiKey) {
    throw new Error('PPLX_API_KEY_MISSING');
  }
  if (typeof opts.fetchImpl !== 'function') {
    throw new Error('PPLX_FETCH_UNAVAILABLE');
  }
  // Clock must be injected (a deterministic lib takes no ambient clock) and
  // must use the exact ratified UTC-Z instant grammar (the shipped J7
  // evaluator's form): a value a permissive parser would accept — date-only,
  // timezone offset, RFC text, hour 24, oversized fraction — is rejected.
  var nowIso = typeof opts.nowIso === 'string' ? opts.nowIso : '';
  if (!isStrictUtcInstant(nowIso)) {
    throw new Error('CLOCK_NOT_INJECTED');
  }

  var ctx = {
    fetchImpl: opts.fetchImpl,
    apiKey: apiKey,
    timeoutMs: posInt(opts.timeoutMs, DEFAULT_TIMEOUT_MS),
    maxBytes: posInt(opts.maxBytes, DEFAULT_MAX_BYTES)
  };

  // Tier A — transport/fetch/timeout/non-2xx/oversize/body-read failure.
  var text;
  try {
    text = await pplxPostText(PPLX_ENDPOINT, buildRequestBody(ticker, nowIso), ctx);
  } catch (_) {
    return { ok: false, reason: 'PROVIDER_FAILURE' };
  }

  // Tier B begins at the whole-response JSON parse of the 2xx body.
  var parsedResponse;
  try {
    parsedResponse = JSON.parse(text);
  } catch (_) {
    return { ok: false, reason: 'PROVIDER_INVALID_RESPONSE' };
  }

  var normalized = normalizeNewsResponse(parsedResponse, { ticker: ticker, retrievedAt: nowIso });
  if (!normalized.ok) {
    return normalized;
  }

  return {
    ok: true,
    envelope: {
      ticker: ticker,
      fetchedAt: nowIso,
      sourceTier: SOURCE_TIER,
      contractVersion: CONTRACT_VERSION,
      provider: PROVIDER_ID,
      items: normalized.items,
      skippedItems: normalized.skippedItems,
      evidenceBindings: normalized.evidenceBindings,
      evidenceSetSize: normalized.evidenceSetSize,
      writtenKeys: []
    }
  };
}

// Deterministic request body — the ONLY interpolated values are the ticker
// and the nowIso-derived UTC date anchor (D-M4: buildRequestBody is now a
// pure function of (ticker, nowIso), a visible amendment to the S1.5 ruling
// that it stayed a pure function of the ticker alone). The anchor is a plain
// string slice — no `new Date()`, no ambient-clock read of any kind, no
// arithmetic — so
// determinism is preserved: identical inputs still produce byte-identical
// output. json_schema now carries BOTH `name` (the Agent API requires a
// 1-64 alphanumeric name; Owner-ruled exact literal 'newsCatalysts', not
// Worker discretion) and `schema` — the schema member itself is unchanged,
// byte for byte.
function buildRequestBody(ticker, nowIso) {
  var dateAnchor = nowIso.slice(0, 10);
  return {
    preset: PPLX_MODEL,
    instructions: 'You are a financial news retrieval service. Return only JSON that conforms exactly to the provided schema. Include only events with a verifiable dated primary source. The current UTC date is ' + dateAnchor + '.',
    input: [
      {
        type: 'message',
        role: 'user',
        content: 'Cover the U.S. equity ticker ' + ticker + '. Report catalysts from the previous 30 calendar days ' +
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
    response_format: { type: 'json_schema', json_schema: { name: 'newsCatalysts', schema: REQUEST_SCHEMA } }
  };
}

// ── hardened injected-fetch Sonar POST (no live network of its own) ──────────
// Timeout via AbortController + setTimeout (no ambient clock reads). Returns
// the raw 2xx body text; every transport-tier defect throws a typed error and
// is mapped to Tier A by the wrapper above.
async function pplxPostText(url, bodyObj, ctx) {
  var controller = new AbortController();
  var timer = setTimeout(function () { try { controller.abort(); } catch (_) {} }, ctx.timeoutMs);
  var aborted = new Promise(function (_resolve, reject) {
    if (controller.signal.aborted) {
      reject(new Error('PPLX_TIMEOUT'));
      return;
    }
    controller.signal.addEventListener('abort', function () { reject(new Error('PPLX_TIMEOUT')); }, { once: true });
  });
  aborted.catch(function () {}); // a stray timeout must never become an unhandled rejection

  try {
    var resp;
    try {
      resp = await Promise.race([
        ctx.fetchImpl(url, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + ctx.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(bodyObj),
          signal: controller.signal
        }),
        aborted
      ]);
    } catch (_) {
      throw new Error('PPLX_FETCH_FAILED');
    }

    if (!resp || typeof resp.status !== 'number') {
      throw new Error('PPLX_NO_RESPONSE');
    }
    if (resp.status < 200 || resp.status >= 300) {
      var httpErr = new Error('PPLX_HTTP_' + resp.status);
      httpErr.status = resp.status;
      throw httpErr;
    }

    var declared = (resp.headers && typeof resp.headers.get === 'function')
      ? Number(resp.headers.get('content-length'))
      : NaN;
    if (isFinite(declared) && declared > ctx.maxBytes) {
      throw new Error('PPLX_OVERSIZE');
    }

    var text;
    try {
      text = await Promise.race([resp.text(), aborted]);
    } catch (_) {
      throw new Error('PPLX_BODY_READ_FAILED');
    }
    if (typeof text !== 'string') {
      throw new Error('PPLX_BODY_READ_FAILED');
    }
    if (Buffer.byteLength(text, 'utf8') > ctx.maxBytes) {
      throw new Error('PPLX_OVERSIZE');
    }

    return text;
  } finally {
    clearTimeout(timer);
  }
}

// ── Agent-shape adapter (non-exported seam, brief §1) ────────────────────────
// The ONLY function that knows about output[], status, error, item `type`
// strings, fetch_url_results, or url_citation annotations. No other function
// in this module learns the Agent response shape. Returns null for any
// Tier-B-equivalent structural defect (mapped to PROVIDER_INVALID_RESPONSE by
// the caller) or { content, evidenceSet } on success — from there down, the
// ladder, grounding correlation, identity construction and projection are
// UNCHANGED: they receive exactly the two things they always received under
// Sonar, a generated-content string and an ordered grounding list.
function adaptAgentResponse(parsedResponse) {
  // status must fail closed (brief §4.3) — new condition, no Sonar equivalent.
  if (parsedResponse.status !== 'completed') {
    return null;
  }
  var output = parsedResponse.output;
  if (!Array.isArray(output)) {
    return null;
  }

  // Generated content: the item with type:'message' -> content[] -> the
  // first entry with type:'output_text' -> .text. Found by TYPE, never by
  // index — output[] is an execution trace; order and membership are not
  // guaranteed. An output[] item of an unrecognised type elsewhere is simply
  // not matched here; it is not itself a failure. The 'message'/'output_text'
  // literals and the `.type` field read live in these predicates, defined
  // HERE inside the adapter — findFirst itself is a transport-agnostic
  // predicate-matcher with no knowledge of any field name or value.
  var messageItem = findFirst(output, function (item) { return isObject(item) && item.type === 'message'; });
  if (!isObject(messageItem) || !Array.isArray(messageItem.content)) {
    return null;
  }
  var textEntry = findFirst(messageItem.content, function (item) { return isObject(item) && item.type === 'output_text'; });
  if (!isObject(textEntry) || typeof textEntry.text !== 'string') {
    return null;
  }

  // Condition-6 equivalent: every grounding-bearing field actually present is
  // null or an array, checked BEFORE any candidate is extracted from it. Each
  // item type carries its grounding list under its OWN field name (F-1, live
  // and documented Agent shape): search_results -> results[],
  // fetch_url_results -> contents[]. `results` is never read on a
  // fetch_url_results item.
  var i;
  for (i = 0; i < output.length; i++) {
    var outItem = output[i];
    if (!isObject(outItem)) {
      continue;
    }
    if (outItem.type === 'search_results' && !validGroundingField(outItem.results)) {
      return null;
    }
    if (outItem.type === 'fetch_url_results' && !validGroundingField(outItem.contents)) {
      return null;
    }
  }
  if (!validGroundingField(textEntry.annotations)) {
    return null;
  }

  // Evidence Set construction (brief §5, D-M2) — the fixed traversal order:
  //   1  every output[] item of type 'search_results'   -> its results[]   (array order)
  //   2  every output[] item of type 'fetch_url_results' -> its contents[]  (array order)
  //   3  url_citation annotations on the output_text content item           (array order)
  // Outer traversal follows output[] order; inner traversal follows each
  // array's own order. First occurrence in this fixed order wins (existing
  // rule, preserved — NP08). A fetch_url_results contents[] entry carries
  // url / title / snippet only (no id, date or last_updated); it is handed to
  // appendEvidenceEntry verbatim, which omits absent fields — nothing is
  // fabricated. This is the only place in the module that reads an output[]
  // item's `type`, `results`, `contents` or `annotations` field, or the
  // `search_results` / `fetch_url_results` / `url_citation` literals — kept
  // here, in the adapter, rather than in a second function, so a future
  // transport change touches exactly one place (brief §1).
  var evidenceSet = [];
  var j, item;
  for (i = 0; i < output.length; i++) {
    item = output[i];
    if (isObject(item) && item.type === 'search_results' && Array.isArray(item.results)) {
      for (j = 0; j < item.results.length; j++) {
        appendEvidenceEntry(evidenceSet, item.results[j], 'search_result');
      }
    }
  }
  for (i = 0; i < output.length; i++) {
    item = output[i];
    if (isObject(item) && item.type === 'fetch_url_results' && Array.isArray(item.contents)) {
      for (j = 0; j < item.contents.length; j++) {
        appendEvidenceEntry(evidenceSet, item.contents[j], 'fetch_url_result');
      }
    }
  }
  var annotations = textEntry.annotations;
  if (Array.isArray(annotations)) {
    for (i = 0; i < annotations.length; i++) {
      var ann = annotations[i];
      if (isObject(ann) && ann.type === 'url_citation') {
        // A url_citation annotation is tolerated in either a nested-object
        // shape ({ type, url_citation: { url, title, ... } }) or a flat
        // shape (the fields directly on the annotation).
        appendEvidenceEntry(evidenceSet, isObject(ann.url_citation) ? ann.url_citation : ann, 'url_citation');
      }
    }
  }

  return { content: textEntry.text, evidenceSet: evidenceSet };
}

// Fully transport-agnostic: takes a predicate, never a field name or a
// value to compare against, so it carries no knowledge of `.type` or any
// Agent-specific literal itself — that knowledge lives only in the
// predicates callers pass in (brief §1's single-adapter invariant). Finds
// the first entry an array matches, by value — never by index (NP35: a
// reordered output[] must produce byte-identical output).
function findFirst(list, predicate) {
  for (var i = 0; i < list.length; i++) {
    if (predicate(list[i])) {
      return list[i];
    }
  }
  return null;
}

// ── pure Tier-B / Tier-C core (no I/O, no clock of its own) ──────────────────
//
// Tier B (whole-response structural failure) is EXACTLY these seven
// conditions — nothing else (spec §7 classification rule, re-expressed for
// the Agent API per brief §4.5; conditions 4, 5 and 7 are untouched):
//   1 the message/output_text content location missing or malformed, or
//     status !== 'completed'                        (adaptAgentResponse)
//   2 content does not parse as JSON
//   3 parsed content is not an object
//   4 items missing, or present but not an array
//   5 an items[] element is not an object
//   6 a grounding-bearing output item's results (or the text entry's
//     annotations) field is present but neither null nor an array
//                                                     (adaptAgentResponse)
//   7 the parsed content object has an unknown property besides items
// Everything past these — including an item's own missing/invalid fields and
// any unknown item-level field — is Tier C (per item, valid siblings
// continue), independent of whether the model honored the request schema.
function normalizeNewsResponse(parsedResponse, context) {
  var ctx = isObject(context) ? context : {};
  var ticker = typeof ctx.ticker === 'string' ? ctx.ticker : null;
  var retrievedAt = typeof ctx.retrievedAt === 'string' ? ctx.retrievedAt : null;

  var invalid = { ok: false, reason: 'PROVIDER_INVALID_RESPONSE' };

  if (!isObject(parsedResponse)) {
    return invalid;
  }

  // Conditions 1 + 6 are handled by the Agent-shape adapter seam above.
  var adapted = adaptAgentResponse(parsedResponse);
  if (adapted === null) {
    return invalid;
  }
  var content = adapted.content;

  // Condition 2.
  var parsed;
  try {
    parsed = JSON.parse(content);
  } catch (_) {
    return invalid;
  }

  // Condition 3.
  if (!isObject(parsed)) {
    return invalid;
  }

  // Condition 4.
  if (!Array.isArray(parsed.items)) {
    return invalid;
  }

  // Condition 7 — top-level structural drift is a whole-response failure,
  // explicitly distinct from unknown fields INSIDE an item (never Tier B).
  var keys = Object.keys(parsed);
  for (var k = 0; k < keys.length; k++) {
    if (keys[k] !== 'items') {
      return invalid;
    }
  }

  // Condition 5.
  var rawItems = parsed.items;
  for (var c = 0; c < rawItems.length; c++) {
    if (!isObject(rawItems[c])) {
      return invalid;
    }
  }

  // Tier C from here on: every element is an object; each is validated
  // independently in the spec §2 reason order; one reason per skipped item.
  var grounding = adapted.evidenceSet;

  var items = [];
  var skippedItems = [];
  var evidenceBindings = [];
  var seenHashes = Object.create(null);

  for (var i = 0; i < rawItems.length; i++) {
    var raw = rawItems[i];

    // eventDate — mandatory ISO date, source-asserted (spec §5); validated by
    // the shared optionalDate (null ⇔ not provided, INVALID ⇔ rejected).
    var eventDate = contract.optionalDate(raw.eventDate);
    if (eventDate === null) {
      skippedItems.push({ reason: 'MISSING_EVENT_DATE' });
      continue;
    }
    if (eventDate === contract.INVALID) {
      skippedItems.push({ reason: 'INVALID_EVENT_DATE' });
      continue;
    }

    // sourceUrl — syntax via the shared optionalHttpsUrl, then MANDATORY
    // grounding correlation (spec §5): syntax validity alone is never trusted.
    var candidate = contract.optionalHttpsUrl(raw.sourceUrl);
    if (candidate === null) {
      skippedItems.push({ reason: 'MISSING_SOURCE_URL' });
      continue;
    }
    if (candidate === contract.INVALID) {
      skippedItems.push({ reason: 'INVALID_SOURCE_URL' });
      continue;
    }
    var groundedIndex = resolveGrounded(candidate, grounding);
    if (groundedIndex === -1) {
      skippedItems.push({ reason: 'INVALID_SOURCE_URL' });
      continue;
    }
    var grounded = grounding[groundedIndex];

    // S1.5.1 H-B, mechanism 1 (DR-20) — narrow, deterministic, URL-shape-only
    // rejection of a generic/container page: a bare root, or a fixed closed
    // list of generic index leaf segments with NOTHING after them. Never a
    // substring or prefix match, so an article-specific path under the same
    // segment (e.g. /news/q3-results) is untouched. grounded.normalized is
    // already a validated, previously-parsed https URL (resolveGrounded
    // above), so re-parsing it here is safe.
    var groundedPath = new URL(grounded.normalized).pathname.replace(INDEX_DOC_LEAF_RE, '');
    if (groundedPath === '' || groundedPath === '/' || GENERIC_SOURCE_PATH_RE.test(groundedPath)) {
      skippedItems.push({ reason: 'GENERIC_SOURCE_URL' });
      continue;
    }

    // category — closed 7-item vocabulary (spec §4).
    if (CATEGORIES.indexOf(raw.category) === -1) {
      skippedItems.push({ reason: 'UNKNOWN_CATEGORY' });
      continue;
    }

    // eventType — the identity-bearing catalyst/upcoming_event vocabulary
    // (A-1, A-2). Validated BEFORE direction: null is outside DIRECTIONS and
    // would otherwise skip every upcoming event as INVALID_DIRECTION.
    if (EVENT_TYPES.indexOf(raw.eventType) === -1) {
      skippedItems.push({ reason: 'UNKNOWN_EVENT_TYPE' });
      continue;
    }

    // S1.5.1 H-B, mechanism 2 (DR-21a deterministic half) — a catalyst
    // (already happened) cannot have a date after the injected clock; reuses
    // the same raw.eventType === 'catalyst' test the very next block already
    // performs, so no new eventType read is introduced. upcoming_event is
    // structurally excluded — this guard never matches it, by construction
    // (A-4.1: a future-dated upcoming_event is expected and must persist).
    // Same-day (eventDate === dateAnchor) survives: strict '>' only.
    // dateAnchor reuses the same injected retrievedAt clock buildRequestBody
    // anchors on — no new clock, no wall-clock read. INVALID_EVENT_DATE is
    // never reused: it keeps its existing, narrower meaning (malformed date
    // grammar), distinct from a valid-but-impossible-for-this-eventType date.
    if (raw.eventType === 'catalyst' && eventDate > ctx.retrievedAt.slice(0, 10)) {
      skippedItems.push({ reason: 'FUTURE_DATED_CATALYST' });
      continue;
    }

    // direction — conditional on eventType (A-1): catalyst requires a
    // DIRECTIONS value; upcoming_event requires direction to be exactly
    // null. A wrong-shaped direction for the event type reuses the existing
    // INVALID_DIRECTION reason rather than adding a new one.
    if (raw.eventType === 'catalyst') {
      if (contract.DIRECTIONS.indexOf(raw.direction) === -1) {
        skippedItems.push({ reason: 'INVALID_DIRECTION' });
        continue;
      }
    } else if (raw.direction !== null) {
      skippedItems.push({ reason: 'INVALID_DIRECTION' });
      continue;
    }

    // relevanceScope — DR-3 breadth vocabulary; identity-inert (A-2).
    if (RELEVANCE_SCOPES.indexOf(raw.relevanceScope) === -1) {
      skippedItems.push({ reason: 'INVALID_RELEVANCE_SCOPE' });
      continue;
    }

    // subType — D-S15-C: always present; a genuinely non-empty (trimmed)
    // string iff category is 'other_catalyst', exactly null otherwise.
    var subTypeValid = raw.category === 'other_catalyst'
      ? (typeof raw.subType === 'string' && raw.subType.trim() !== '')
      : raw.subType === null;
    if (!subTypeValid) {
      skippedItems.push({ reason: 'INVALID_SUB_TYPE' });
      continue;
    }

    // Identity tuple (spec §3) — this object literal's key insertion order is
    // NORMATIVE: JSON.stringify serializes string keys in insertion order and
    // the hash is deterministic only because this exact order is reproduced.
    // Narrative fields never reach this tuple. eventType IS a member (A-2,
    // inserted after category, before direction); relevanceScope is not.
    var tuple = {
      schemaVersion: IDENTITY_SCHEMA_VERSION,
      ticker: ticker,
      eventDate: eventDate,
      category: raw.category,
      eventType: raw.eventType,
      direction: raw.direction,
      normalizedSourceUrl: grounded.normalized,
      sourceDomain: grounded.domain,
      provider: PROVIDER_ID
    };
    var identityHash = sha256Hex(JSON.stringify(tuple));

    if (seenHashes[identityHash] === true) {
      skippedItems.push({ reason: 'DUPLICATE_IN_BATCH' });
      continue;
    }
    seenHashes[identityHash] = true;

    // Projection (spec §2): exact persisted field list AND insertion order.
    // Unknown fields on the raw candidate (title, summary, any free text) are
    // discarded here — they never reach this literal. eventType,
    // relevanceScope and subType are appended after scoringImpact (D-S15-E).
    // S2-A2 (§C.8): the binding sidecar is appended in this SAME iteration,
    // beside items — never onto it — so position alone already pairs
    // evidenceBindings[k] with items[k]; itemIndex is carried explicitly and
    // redundantly (§C.8) rather than relied on implicitly.
    evidenceBindings.push({
      itemIndex: items.length,
      evidenceIndex: groundedIndex,
      evidenceKind: grounded.evidenceKind,
      normalizedSourceUrl: grounded.normalized
    });
    items.push({
      ticker: ticker,
      eventDate: eventDate,
      category: raw.category,
      direction: raw.direction,
      sourceUrl: grounded.raw,
      normalizedSourceUrl: grounded.normalized,
      sourceDomain: grounded.domain,
      provider: PROVIDER_ID,
      retrievedAt: retrievedAt,
      identityHash: identityHash,
      provenance: 'retrieval_unverified',
      confidence: null,
      requiresVerification: true,
      scoringImpact: 'none',
      eventType: raw.eventType,
      relevanceScope: raw.relevanceScope,
      subType: raw.subType
    });
  }

  return { ok: true, items: items, skippedItems: skippedItems, evidenceBindings: evidenceBindings, evidenceSetSize: grounding.length };
}

// ── grounding correlation (Agent API three-source union, brief §§4-6) ────────
// Both helpers below are shape-agnostic: neither references output[], an
// item `type` string, `results`, `annotations`, or any of the three D-M2
// source names. The Evidence Set traversal that DOES know those things lives
// entirely inside adaptAgentResponse (brief §1's single-adapter invariant).

// A grounding-bearing field is valid when null, absent, or an array.
function validGroundingField(value) {
  return value === null || value === undefined || Array.isArray(value);
}

// A candidate is usable only if its URL resolves (existing rule, unchanged).
// Every other field (brief §6) is retained verbatim when present and simply
// omitted when absent — absence is normal and never itself a rejection
// reason. `evidenceKind` is assigned by the caller (bookkeeping only; never
// validated since this module is the sole source of the value). Each kept
// entry is the internal Evidence Set representation: the three existing keys
// (raw, normalized, domain — identity-tuple-adjacent, never renamed) plus
// six provider-internal fields, retained but read by no decision anywhere.
function appendEvidenceEntry(list, raw, evidenceKind) {
  if (!isObject(raw)) {
    return;
  }
  var checked = contract.optionalHttpsUrl(raw.url);
  if (checked === null || checked === contract.INVALID) {
    return;
  }
  var normalized = normalizeHttpsUrl(checked);
  var entry = {
    raw: checked,
    normalized: normalized,
    domain: new URL(normalized).hostname,
    evidenceKind: evidenceKind
  };
  if (raw.id !== undefined) { entry.id = raw.id; }
  if (raw.title !== undefined) { entry.title = raw.title; }
  if (raw.date !== undefined) { entry.date = raw.date; }
  if (raw.last_updated !== undefined) { entry.lastUpdated = raw.last_updated; }
  if (raw.snippet !== undefined) { entry.snippet = raw.snippet; }
  list.push(entry);
}

// Normalized-form match; first occurrence in the fixed order wins. On a match
// the persisted source URL is the grounding entry's own raw text — never the
// model's originally-claimed string (spec §5.5). Returns the matched entry's
// position in `grounding` (S2-A2 §C.1: evidenceIndex is that exact position,
// duplicates included), or -1 on a grounding miss.
function resolveGrounded(candidate, grounding) {
  var normalizedCandidate = normalizeHttpsUrl(candidate);
  for (var i = 0; i < grounding.length; i++) {
    if (grounding[i].normalized === normalizedCandidate) {
      return i;
    }
  }
  return -1;
}

// Exactly three transforms (spec §5): hostname lowercased (the URL parser
// does this), fragment removed, scheme-default port 443 omitted (the URL
// object yields an empty port for it). pathname/search are taken exactly as
// the URL object serializes them — no further path/query transformation, and
// two different path or query strings are never treated as equivalent.
function normalizeHttpsUrl(value) {
  var u = new URL(value); // safe: optionalHttpsUrl already parsed this value
  return 'https://' + u.hostname + (u.port ? ':' + u.port : '') + u.pathname + u.search;
}

// ── identity + store key ─────────────────────────────────────────────────────

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// fundstore key (spec §3). Writer/store wiring is a later slice; this lib
// only derives the deterministic key string for a validated item.
function buildNewsKey(item) {
  var it = isObject(item) ? item : {};
  return 'fundstore:v1:news:' + it.ticker + ':' + it.eventDate + ':' + it.identityHash;
}

// ── small helpers ────────────────────────────────────────────────────────────

function isObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function posInt(v, fallback) {
  return (typeof v === 'number' && isFinite(v) && v > 0) ? Math.floor(v) : fallback;
}

// Strict injected-clock grammar — mirrors the shipped J7 evaluator's ratified
// instant form exactly: real-calendar (leap-aware) UTC-Z ISO datetime
// YYYY-MM-DDThh:mm:ss(.fff)Z with an optional 1-3 digit fraction and a
// literal trailing Z only. Offsets and date-only values fail the regex;
// grammar-shaped but unreal calendar/time values fail the range checks.
var INSTANT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/;
var MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isStrictUtcInstant(value) {
  var m = INSTANT_RE.exec(value);
  if (!m) {
    return false;
  }
  var year = Number(m[1]);
  var month = Number(m[2]);
  var day = Number(m[3]);
  var hh = Number(m[4]);
  var mi = Number(m[5]);
  var ss = Number(m[6]);
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  var leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  var maxDay = (month === 2 && leap) ? 29 : MONTH_DAYS[month - 1];
  if (day > maxDay) {
    return false;
  }
  return hh <= 23 && mi <= 59 && ss <= 59;
}

// Recursive freeze for this module's OWN exported constants only — never
// applied to caller inputs or upstream responses.
function deepFreeze(value) {
  Object.keys(value).forEach(function (k) {
    var v = value[k];
    if (v && typeof v === 'object') { deepFreeze(v); }
  });
  return Object.freeze(value);
}

module.exports = {
  getNewsCatalysts: getNewsCatalysts,
  normalizeNewsResponse: normalizeNewsResponse,
  buildNewsKey: buildNewsKey,
  REQUEST_SCHEMA: REQUEST_SCHEMA,
  CONTRACT_VERSION: CONTRACT_VERSION,
  SOURCE_TIER: SOURCE_TIER,
  PROVIDER_ID: PROVIDER_ID,
  IDENTITY_SCHEMA_VERSION: IDENTITY_SCHEMA_VERSION,
  PPLX_ENDPOINT: PPLX_ENDPOINT,
  PPLX_MODEL: PPLX_MODEL,
  CATEGORIES: CATEGORIES,
  EVENT_TYPES: EVENT_TYPES,
  RELEVANCE_SCOPES: RELEVANCE_SCOPES,
  // Re-exported verbatim from evidence-contract so a consumer (the core
  // boundary's A-5 direction guard) reads the one canonical vocabulary
  // rather than duplicating it.
  DIRECTIONS: contract.DIRECTIONS,
  SKIP_REASONS: SKIP_REASONS,
  NEWS_KEY_RE: NEWS_KEY_RE
};
