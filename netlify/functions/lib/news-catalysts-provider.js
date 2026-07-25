'use strict';

/**
 * netlify/functions/lib/news-catalysts-provider.js
 *
 * EG-25C-3 · C3-S1 — J3 News/Catalysts provider (PURE LIB, OFFLINE-ONLY).
 *
 * Deterministic Perplexity Sonar retrieval → fund-contract-v1 NewsItem
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

var CONTRACT_VERSION = 'fund-contract-v1';
var SOURCE_TIER = 'perplexity_retrieval';
var PROVIDER_ID = 'j3-news-catalysts@job-model-v1';
var IDENTITY_SCHEMA_VERSION = 'j3-identity-v1';

var PPLX_ENDPOINT = 'https://api.perplexity.ai/v1/sonar';
var PPLX_MODEL = 'sonar-pro';

var DEFAULT_TIMEOUT_MS = 22000;
var DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

var TICKER_RE = /^[A-Z]{1,10}$/;
var NEWS_KEY_RE = /^fundstore:v1:news:[A-Z]{1,10}:\d{4}-\d{2}-\d{2}:[a-f0-9]{64}$/;

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

// Skip reason codes (spec §2 order). One reason per skipped item; a skipped
// item never echoes any item data.
var SKIP_REASONS = deepFreeze([
  'MISSING_EVENT_DATE',
  'INVALID_EVENT_DATE',
  'MISSING_SOURCE_URL',
  'INVALID_SOURCE_URL',
  'UNKNOWN_CATEGORY',
  'INVALID_DIRECTION',
  'DUPLICATE_IN_BATCH'
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
        required: ['eventDate', 'category', 'direction', 'sourceUrl'],
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
          direction: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
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
    text = await pplxPostText(PPLX_ENDPOINT, buildRequestBody(ticker), ctx);
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
      writtenKeys: []
    }
  };
}

// Deterministic request body — the ONLY interpolated value is the ticker.
// json_schema carries only the `schema` member (spec-pinned: no name field).
function buildRequestBody(ticker) {
  return {
    model: PPLX_MODEL,
    messages: [
      {
        role: 'system',
        content: 'You are a financial news retrieval service. Return only JSON that conforms exactly to the provided schema. Include only events with a verifiable dated primary source.'
      },
      {
        role: 'user',
        content: 'List recent dated news and catalyst events for the U.S. equity ticker ' + ticker +
          '. For each event provide: eventDate (ISO YYYY-MM-DD, the event\'s own date), category (one of: ' +
          'earnings_event, guidance_update, analyst_action, corporate_action, product_customer_partnership, ' +
          'regulatory_legal, other_catalyst), direction (positive, neutral, or negative for the company), and ' +
          'sourceUrl (the https URL of the source reporting the event). Only include events you can source. ' +
          'Do not include commentary, titles, or summaries.'
      }
    ],
    response_format: { type: 'json_schema', json_schema: { schema: REQUEST_SCHEMA } }
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

// ── pure Tier-B / Tier-C core (no I/O, no clock of its own) ──────────────────
//
// Tier B (whole-response structural failure) is EXACTLY these seven
// conditions — nothing else (spec §7 classification rule):
//   1 choices[0].message.content missing or malformed
//   2 content does not parse as JSON
//   3 parsed content is not an object
//   4 items missing, or present but not an array
//   5 an items[] element is not an object
//   6 citations / search_results present but neither null nor an array
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

  // Condition 1 — structured content location (spec §7).
  var choices = parsedResponse.choices;
  if (!Array.isArray(choices) || choices.length < 1 || !isObject(choices[0]) || !isObject(choices[0].message)) {
    return invalid;
  }
  var content = choices[0].message.content;
  if (typeof content !== 'string') {
    return invalid;
  }

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

  // Condition 6 — grounding fields live on the outer response, beside choices.
  if (!validGroundingField(parsedResponse.citations) || !validGroundingField(parsedResponse.search_results)) {
    return invalid;
  }

  // Tier C from here on: every element is an object; each is validated
  // independently in the spec §2 reason order; one reason per skipped item.
  var grounding = buildGroundingList(parsedResponse.citations, parsedResponse.search_results);

  var items = [];
  var skippedItems = [];
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
    var grounded = resolveGrounded(candidate, grounding);
    if (grounded === null) {
      skippedItems.push({ reason: 'INVALID_SOURCE_URL' });
      continue;
    }

    // category — closed 7-item vocabulary (spec §4).
    if (CATEGORIES.indexOf(raw.category) === -1) {
      skippedItems.push({ reason: 'UNKNOWN_CATEGORY' });
      continue;
    }

    // direction — the shared DIRECTIONS vocabulary, verbatim.
    if (contract.DIRECTIONS.indexOf(raw.direction) === -1) {
      skippedItems.push({ reason: 'INVALID_DIRECTION' });
      continue;
    }

    // Identity tuple (spec §3) — this object literal's key insertion order is
    // NORMATIVE: JSON.stringify serializes string keys in insertion order and
    // the hash is deterministic only because this exact order is reproduced.
    // Narrative fields never reach this tuple.
    var tuple = {
      schemaVersion: IDENTITY_SCHEMA_VERSION,
      ticker: ticker,
      eventDate: eventDate,
      category: raw.category,
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
    // discarded here — they never reach this literal.
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
      scoringImpact: 'none'
    });
  }

  return { ok: true, items: items, skippedItems: skippedItems };
}

// ── grounding correlation (spec §5, deterministic) ───────────────────────────

// A grounding field is a valid envelope member when null, absent, or an array.
function validGroundingField(value) {
  return value === null || value === undefined || Array.isArray(value);
}

// One fixed traversal order, always: every citations[] entry first (given
// array order), then every search_results[].url (given array order).
// Malformed individual entries are silently excluded — never a failure,
// never a match. Each kept entry carries { raw, normalized, domain }.
function buildGroundingList(citations, searchResults) {
  var list = [];
  var i;
  if (Array.isArray(citations)) {
    for (i = 0; i < citations.length; i++) {
      appendGroundingEntry(list, citations[i]);
    }
  }
  if (Array.isArray(searchResults)) {
    for (i = 0; i < searchResults.length; i++) {
      var entry = searchResults[i];
      appendGroundingEntry(list, isObject(entry) ? entry.url : undefined);
    }
  }
  return list;
}

function appendGroundingEntry(list, value) {
  var checked = contract.optionalHttpsUrl(value);
  if (checked === null || checked === contract.INVALID) {
    return;
  }
  var normalized = normalizeHttpsUrl(checked);
  list.push({ raw: checked, normalized: normalized, domain: new URL(normalized).hostname });
}

// Normalized-form match; first occurrence in the fixed order wins. On a match
// the persisted source URL is the grounding entry's own raw text — never the
// model's originally-claimed string (spec §5.5).
function resolveGrounded(candidate, grounding) {
  var normalizedCandidate = normalizeHttpsUrl(candidate);
  for (var i = 0; i < grounding.length; i++) {
    if (grounding[i].normalized === normalizedCandidate) {
      return grounding[i];
    }
  }
  return null;
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
  SKIP_REASONS: SKIP_REASONS,
  NEWS_KEY_RE: NEWS_KEY_RE
};
