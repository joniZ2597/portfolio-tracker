'use strict';

/*
 * netlify/functions/lib/news-catalysts-read-core.js
 *
 * Catalyst evidence surface · S3-M1 — news-catalysts-read core (READ path
 * only, core-only).
 *
 * A gated, fail-closed server route that returns stored catalyst evidence for
 * one ticker over a fixed, bounded window of 31 UTC calendar partitions —
 * returning ONLY the 19 reader-visible fields frozen in
 * work/s3-catalyst-evidence-surface/D-S3-1-reader-contract.md, in persisted
 * order. news-catalysts-read.mjs wraps this handler as
 * /.netlify/functions/news-catalysts-read. It mirrors fund-facts-read-core.js
 * (the governing read precedent) in shape and news-catalysts-core.js (the
 * write side of this evidence) in storage layout.
 *
 * Ordered decision chain: CORS preflight -> server gate -> method allowlist ->
 * token/allowlist preflight (auth-first, ticker withheld) -> body parse ->
 * request validation -> store read -> response.
 *
 * Gate: PT_ENABLE_NEWS_CATALYSTS_READ_SERVER, strict string 'true', checked
 * before any store I/O, default off. It is distinct from the write side's
 * gate so read and write are independently armable. Auth: a distinct read
 * token (PT_NEWS_CATALYSTS_READ_TOKEN) that must differ from every other
 * known token, over the allowlist shared with the write side
 * (PT_NEWS_CATALYSTS_ALLOWED_TICKERS) — an access control, not a behavioural
 * branch (D-S3-1 §5).
 *
 * Window (Owner ruling 2026-09-24): D0 = the UTC calendar date of the
 * injected instant (request body `asOf`, strict UTC-Z grammar); the read
 * covers D0 and the previous 30 UTC dates — ageDays 0..30, exactly 31 daily
 * index partitions, never a caller-supplied range, never a store scan. This
 * stops exactly where J7 classifies news evidence as stale (ageDay 31). No
 * wall clock is read anywhere: replay determinism depends on it.
 *
 * Missing-day semantics (Owner ruling 2026-09-24): a missing daily index is
 * normal absence for that day and never terminates the read; iteration
 * continues across the remaining partitions. NOT_AVAILABLE / NO_RECORD is
 * returned only after all 31 partitions were attempted and no usable
 * (conforming) record was found.
 *
 * Fail-visible: a store throw is DEGRADED / STORE_UNAVAILABLE; unreadable
 * stored bytes (an index or item that is not a JSON object, an index whose
 * keys are unusable, or an index pointer to an absent item) are DEGRADED /
 * STORE_RECORD_INVALID — never an empty success. A parsed record that fails
 * D-S3-1 §6 conformance (absent key, contractVersion mismatch, violated
 * conditional-null rule, constant drift) is omitted and counted — never
 * partially returned, never repaired.
 *
 * No write path exists here: no set, no index mutation. The route validates
 * shape only; it never re-derives grounding, identity, normalization or skip
 * meaning, and nothing outside the 19 fields is ever returned. The store test
 * seam (event._testStore) is read ONLY off the event object, never from the
 * parsed body, and only after the request is fully validated.
 */

const { parseAllowedTickers } = require('./news-catalysts-preflight');
// Shared READ-ONLY imports: exactly the four symbols brief §9 names. Nothing
// else is taken from the provider, so this reader stays decoupled from any
// provider vocabulary drift (S2-M3): the closed vocabularies below are the
// FROZEN D-S3-1 values, and the suite cross-checks them against the provider
// so a divergence is a visible tripwire, never a silent change of contract.
const {
  CONTRACT_VERSION,
  SOURCE_TIER,
  PROVIDER_ID,
  NEWS_KEY_RE
} = require('./news-catalysts-provider');

// D-S3-1 §1 closed vocabularies (fields 3, 4, 15, 16).
const CATEGORIES = [
  'earnings_event', 'guidance_update', 'analyst_action', 'corporate_action',
  'product_customer_partnership', 'regulatory_legal', 'other_catalyst'
];
const DIRECTIONS = ['positive', 'neutral', 'negative'];
const EVENT_TYPES = ['catalyst', 'upcoming_event'];
const RELEVANCE_SCOPES = ['company', 'sector', 'market'];

const READ_CONTRACT_VERSION = 'news-catalysts-read-v1';

// Same Blob store and fundstore:v1 namespace as the write side; the item key
// grammar is the provider's NEWS_KEY_RE, the index key is the write core's.
const STORE_NAME = 'fund-facts-store';
const ITEM_KEY_PREFIX = 'fundstore:v1:news:';
const INDEX_KEY_PREFIX = 'fundstore:v1:news-index:';

// Strong-consistency reads: the day index and every item it lists must not be
// satisfied by an eventually-consistent replica.
const STRONG = { consistency: 'strong' };

// Fixed window: D0 plus the previous 30 UTC calendar dates.
const WINDOW_DAYS = 31;
const DAY_MS = 86400000;

// Env key names for the read preflight. Plain string literals, read through
// the env object handed to the preflight — never dereferenced here.
const TOKEN_KEY = 'PT_NEWS_CATALYSTS_READ_TOKEN';
const ALLOW_KEY = 'PT_NEWS_CATALYSTS_ALLOWED_TICKERS';

// The read token must be distinct from every other known token, the write
// token first among them: a shared secret would collapse the read/write
// separation. Absent/empty comparison tokens are not a collision.
const COLLISION_KEYS = [
  'PT_NEWS_CATALYSTS_TOKEN',
  'PT_FUND_FACTS_TOKEN',
  'PT_FUND_FACTS_READ_TOKEN',
  'PT_OWNER_TOKEN',
  'PT_SEC_EVIDENCE_PULL_TOKEN',
  'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN'
];

const TICKER_RE = /^[A-Z]{1,10}$/;
// The strict UTC-Z instant grammar the write side requires of its injected
// clock; group 1 is the UTC calendar date that partitions the index.
const INSTANT_RE = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HASH_RE = /^[a-f0-9]{64}$/;

// The only body keys a read request may carry; anything else is rejected.
const REQUEST_KEYS = ['ticker', 'asOf'];

// D-S3-1 §1 — the 19 reader-visible fields, persisted order. Used to require
// each field's presence (absent is not null) and to CONSTRUCT every returned
// record field by field so the response bytes are order-stable whatever the
// stored object's property order.
const RECORD_FIELDS = [
  'ticker', 'eventDate', 'category', 'direction', 'sourceUrl',
  'normalizedSourceUrl', 'sourceDomain', 'provider', 'retrievedAt',
  'identityHash', 'provenance', 'confidence', 'requiresVerification', 'scoringImpact',
  'eventType', 'relevanceScope', 'subType', 'sourceTier', 'contractVersion'
];

// The day index record the write side persists.
const INDEX_FIELDS = ['ticker', 'fetchedAt', 'sourceTier', 'contractVersion', 'provider', 'keys'];

exports.handler = async function (event) {
  const method = event && event.httpMethod;

  // 1) OPTIONS before gate — always respond (no body on the 204).
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: cors() };
  }

  // 2) Server gate — strict string 'true'. Off => dormant: no body parse, no
  //    preflight, no store, no I/O of any kind.
  if (process.env.PT_ENABLE_NEWS_CATALYSTS_READ_SERVER !== 'true') {
    return res(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
  }

  // 3) Method guard.
  if (method !== 'POST') {
    return res(405, { status: 'METHOD_NOT_ALLOWED', reason: 'METHOD_NOT_ALLOWED' });
  }

  const authorization = event && event.headers && event.headers['authorization'];

  // 4) Auth-first probe with the ticker withheld: token, collision and
  //    allowlist configuration are decided BEFORE the body is parsed, so an
  //    unauthenticated caller with any malformed body only ever sees 401.
  const probe = evaluateReadPreflight({ env: process.env, authorization: authorization, ticker: undefined });
  if (!probe.ok && probe.reason !== 'TICKER_INVALID') {
    return mapPreflightFailure(probe.reason);
  }

  // 5) Post-auth body parse.
  const parsed = parseBody(event && event.body);
  if (!parsed.ok) {
    return res(400, { status: 'INVALID_JSON', reason: 'INVALID_JSON' });
  }

  // 6) Unknown body keys are rejected, not ignored.
  const bodyKeys = Object.keys(parsed.value);
  for (let i = 0; i < bodyKeys.length; i++) {
    if (REQUEST_KEYS.indexOf(bodyKeys[i]) === -1) {
      return res(400, { status: 'INVALID_REQUEST', reason: 'UNKNOWN_BODY_KEY' });
    }
  }

  // 7) Full preflight with the strict, non-normalized ticker: format, then
  //    allowlist membership.
  const pf = evaluateReadPreflight({ env: process.env, authorization: authorization, ticker: parsed.value.ticker });
  if (!pf.ok) {
    return mapPreflightFailure(pf.reason);
  }
  const ticker = pf.ticker;

  // 8) The injected instant: strict grammar AND a real UTC calendar date.
  //    Rejected before any store I/O.
  const asOf = parsed.value.asOf;
  const d0 = instantDate(asOf);
  if (d0 === null) {
    return res(400, { status: 'INVALID_INSTANT', reason: 'INSTANT_INVALID' });
  }
  const dates = partitionDates(d0);
  // A window that would reach below year 0000 produces dates outside the
  // four-digit grammar and cannot name real partitions: rejected like any
  // other bad instant.
  for (let i = 0; i < dates.length; i++) {
    if (!DATE_RE.test(dates[i])) {
      return res(400, { status: 'INVALID_INSTANT', reason: 'INSTANT_INVALID' });
    }
  }
  const readWindow = { from: dates[dates.length - 1], to: dates[0] };

  // Request fully validated — the FIRST I/O touchpoints begin here.
  let store;
  try {
    store = acquireStore(event);
  } catch (_) {
    return degraded('STORE_UNAVAILABLE', ticker);
  }

  // 9) Exactly WINDOW_DAYS strong index reads, D0 first. A missing index is
  //    normal absence and the loop continues; a throw is fail-visible; an
  //    unusable index is fail-visible. Item keys are taken ONLY from the
  //    indexes (never constructed), each unique key kept once, first seen.
  const itemKeys = [];
  const seen = Object.create(null);
  for (let i = 0; i < dates.length; i++) {
    let indexRaw;
    try {
      indexRaw = await store.get(indexKey(ticker, dates[i]), STRONG);
    } catch (_) {
      return degraded('STORE_UNAVAILABLE', ticker);
    }
    if (indexRaw === null || indexRaw === undefined) {
      continue;
    }
    const index = parseIndexRecord(indexRaw, ticker, dates[i]);
    if (!index.ok) {
      return degraded('STORE_RECORD_INVALID', ticker);
    }
    for (let k = 0; k < index.keys.length; k++) {
      if (seen[index.keys[k]] !== true) {
        seen[index.keys[k]] = true;
        itemKeys.push(index.keys[k]);
      }
    }
  }

  // 10) One strong read per listed item. A throw or an unreadable item is
  //     fail-visible for the whole read (no partial record ever leaves); a
  //     parsed record that fails D-S3-1 §6 conformance is omitted and counted.
  const records = [];
  let omitted = 0;
  for (let i = 0; i < itemKeys.length; i++) {
    let itemRaw;
    try {
      itemRaw = await store.get(itemKeys[i], STRONG);
    } catch (_) {
      return degraded('STORE_UNAVAILABLE', ticker);
    }
    if (itemRaw === null || itemRaw === undefined) {
      return degraded('STORE_RECORD_INVALID', ticker);
    }
    const item = parseJsonObject(itemRaw);
    if (!item.ok) {
      return degraded('STORE_RECORD_INVALID', ticker);
    }
    const v = validateRecord(item.value, ticker);
    if (!v.ok) {
      omitted += 1;
      continue;
    }
    // A conforming record filed under a key that does not name it (its own
    // eventDate / identityHash disagree with the key it was read from) is
    // misfiled or corrupted stored evidence — fail-visible, not returned.
    if (!keyNamesRecord(itemKeys[i], ticker, v.record)) {
      return degraded('STORE_RECORD_INVALID', ticker);
    }
    records.push(v.record);
  }

  // 11) The whole window was attempted. No usable record => NOT_AVAILABLE.
  if (records.length === 0) {
    return res(200, {
      status: 'NOT_AVAILABLE',
      reason: 'NO_RECORD',
      ticker: ticker,
      asOf: asOf,
      window: readWindow,
      omitted: omitted
    });
  }

  return res(200, {
    status: 'OK',
    readContractVersion: READ_CONTRACT_VERSION,
    ticker: ticker,
    asOf: asOf,
    window: readWindow,
    records: records,
    omitted: omitted
  });
};

// ── read preflight (pure over the injected env; the gate is the handler's) ────
// Fail-closed order: auth -> collision -> allowlist configuration -> ticker
// format -> membership -> success. Mutates no input.
function evaluateReadPreflight(input) {
  const inp = isObject(input) ? input : {};
  const env = isObject(inp.env) ? inp.env : {};
  const authorization = inp.authorization;
  const ticker = inp.ticker;

  // Missing/empty server token folds into the same reason as a wrong caller
  // credential (no auth oracle), matching both shipped preflights.
  const token = env[TOKEN_KEY];
  if (!isNonEmptyString(token) || authorization !== 'Bearer ' + token) {
    return fail('UNAUTHORIZED');
  }

  for (let i = 0; i < COLLISION_KEYS.length; i++) {
    const other = env[COLLISION_KEYS[i]];
    if (isNonEmptyString(other) && other === token) {
      return fail('TOKEN_COLLISION');
    }
  }

  const allow = parseAllowedTickers(env[ALLOW_KEY]);
  if (!allow.ok) {
    return fail(allow.reason);
  }

  if (typeof ticker !== 'string' || !TICKER_RE.test(ticker)) {
    return fail('TICKER_INVALID');
  }

  if (!allow.tickers.has(ticker)) {
    return fail('TICKER_NOT_ALLOWED');
  }

  return { ok: true, ticker: ticker };
}

// ── preflight reason -> HTTP ──────────────────────────────────────────────────
// Total: every reason maps, and an unknown reason fails closed and leaks
// nothing specific. TICKER_NOT_ALLOWED is returned as itself (the same-domain
// write precedent) so that NOT_AVAILABLE stays reserved for the completed
// window (brief §3).
function mapPreflightFailure(reason) {
  switch (reason) {
    case 'UNAUTHORIZED':
      return res(401, { status: 'UNAUTHORIZED', reason: 'UNAUTHORIZED' });
    case 'TOKEN_COLLISION':
    case 'ALLOWLIST_MISSING':
    case 'ALLOWLIST_INVALID':
      // Operator misconfiguration — only reachable after the inbound token passes.
      return res(500, { status: 'CONFIGURATION_MISSING', reason: reason });
    case 'TICKER_INVALID':
      return res(400, { status: 'INVALID_TICKER', reason: 'TICKER_INVALID' });
    case 'TICKER_NOT_ALLOWED':
      return res(403, { status: 'TICKER_NOT_ALLOWED', reason: 'TICKER_NOT_ALLOWED' });
    default:
      return res(500, { status: 'ERROR', reason: 'PREFLIGHT_UNMAPPED' });
  }
}

// ── window ────────────────────────────────────────────────────────────────────
// The UTC calendar date of a strict-grammar instant, or null. The grammar is
// necessary but not sufficient: the date must also round-trip through UTC
// arithmetic unchanged, so an impossible date (e.g. 02-30) or field (hour 25)
// is rejected rather than silently rolled forward.
function instantDate(value) {
  if (typeof value !== 'string') { return null; }
  const m = INSTANT_RE.exec(value);
  if (!m) { return null; }
  const ms = Date.parse(value);
  if (!isFinite(ms)) { return null; }
  if (new Date(ms).toISOString().slice(0, 10) !== m[1]) { return null; }
  return m[1];
}

// The WINDOW_DAYS partition dates, D0 first, then each previous UTC calendar
// date. Pure calendar arithmetic over the injected date — no clock.
function partitionDates(d0) {
  // Parsed from the ISO text, never Date.UTC(year, ...), which remaps years
  // 0..99 onto 1900..1999.
  const base = Date.parse(d0 + 'T00:00:00.000Z');
  const out = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    out.push(new Date(base - i * DAY_MS).toISOString().slice(0, 10));
  }
  return out;
}

function indexKey(ticker, date) {
  return INDEX_KEY_PREFIX + ticker + ':' + date;
}

// ── stored-shape validation (shape only; meaning is never re-derived) ─────────
// Day index: the write side's six fields, this ticker, this contract, and a
// keys array whose every member is a well-formed item key for this ticker —
// a key is never constructed or guessed here. `date` is the partition being
// read: the write side partitions by the UTC date of fetchedAt, so an index
// whose fetchedAt names any other date is misfiled and unusable.
function parseIndexRecord(raw, ticker, date) {
  const parsed = parseJsonObject(raw);
  if (!parsed.ok) { return { ok: false }; }
  const index = parsed.value;
  for (let i = 0; i < INDEX_FIELDS.length; i++) {
    if (!hasOwn(index, INDEX_FIELDS[i])) { return { ok: false }; }
  }
  if (index.ticker !== ticker) { return { ok: false }; }
  if (index.contractVersion !== CONTRACT_VERSION) { return { ok: false }; }
  if (index.sourceTier !== SOURCE_TIER) { return { ok: false }; }
  if (index.provider !== PROVIDER_ID) { return { ok: false }; }
  if (instantDate(index.fetchedAt) !== date) { return { ok: false }; }
  if (!Array.isArray(index.keys)) { return { ok: false }; }
  const prefix = ITEM_KEY_PREFIX + ticker + ':';
  for (let k = 0; k < index.keys.length; k++) {
    const key = index.keys[k];
    if (typeof key !== 'string' || !NEWS_KEY_RE.test(key) || key.indexOf(prefix) !== 0) {
      return { ok: false };
    }
  }
  return { ok: true, keys: index.keys };
}

// D-S3-1 §6 conformance over a parsed object. contractVersion is checked
// first; every one of the 19 keys must be PRESENT (absent is not null); every
// constant field must hold its literal; both conditional-null rules must hold;
// vocabulary fields must be in their closed vocabularies. On success the
// record is projected to exactly the 19 fields in persisted order. Property
// order and unknown extra keys are never grounds for rejection — the
// projection simply never returns them.
function validateRecord(rec, ticker) {
  if (!isObject(rec)) { return { ok: false }; }
  if (rec.contractVersion !== CONTRACT_VERSION) { return { ok: false }; }
  for (let i = 0; i < RECORD_FIELDS.length; i++) {
    if (!hasOwn(rec, RECORD_FIELDS[i])) { return { ok: false }; }
  }
  if (rec.ticker !== ticker) { return { ok: false }; }
  if (typeof rec.eventDate !== 'string' || !DATE_RE.test(rec.eventDate)) { return { ok: false }; }
  if (CATEGORIES.indexOf(rec.category) === -1) { return { ok: false }; }
  if (EVENT_TYPES.indexOf(rec.eventType) === -1) { return { ok: false }; }
  // Field 4: direction is a DIRECTIONS value iff catalyst; exactly null iff upcoming_event.
  if (rec.eventType === 'catalyst') {
    if (DIRECTIONS.indexOf(rec.direction) === -1) { return { ok: false }; }
  } else if (rec.direction !== null) {
    return { ok: false };
  }
  if (!isHttpsString(rec.sourceUrl) || !isHttpsString(rec.normalizedSourceUrl)) { return { ok: false }; }
  if (!isNonEmptyString(rec.sourceDomain)) { return { ok: false }; }
  if (rec.provider !== PROVIDER_ID) { return { ok: false }; }
  if (instantDate(rec.retrievedAt) === null) { return { ok: false }; }
  if (typeof rec.identityHash !== 'string' || !HASH_RE.test(rec.identityHash)) { return { ok: false }; }
  if (rec.provenance !== 'retrieval_unverified') { return { ok: false }; }
  if (rec.confidence !== null) { return { ok: false }; }
  if (rec.requiresVerification !== true) { return { ok: false }; }
  if (rec.scoringImpact !== 'none') { return { ok: false }; }
  if (RELEVANCE_SCOPES.indexOf(rec.relevanceScope) === -1) { return { ok: false }; }
  // Field 17: subType is non-empty trimmed text iff other_catalyst; exactly
  // null otherwise. Its VALUE is opaque here (D-S3-1 C-1) — never switched on.
  if (rec.category === 'other_catalyst') {
    if (typeof rec.subType !== 'string' || rec.subType.trim() === '') { return { ok: false }; }
  } else if (rec.subType !== null) {
    return { ok: false };
  }
  if (rec.sourceTier !== SOURCE_TIER) { return { ok: false }; }
  return { ok: true, record: projectRecord(rec) };
}

// A stored item key is fundstore:v1:news:<TICKER>:<eventDate>:<identityHash>
// (already grammar-checked and ticker-checked when taken from the index). The
// record read from it must carry exactly that ticker, eventDate and hash. This
// compares the key's own components to the record's own fields; it never
// recomputes or re-derives an identity.
function keyNamesRecord(key, ticker, rec) {
  return key === ITEM_KEY_PREFIX + ticker + ':' + rec.eventDate + ':' + rec.identityHash;
}

function projectRecord(rec) {
  const out = {};
  for (let i = 0; i < RECORD_FIELDS.length; i++) {
    out[RECORD_FIELDS[i]] = rec[RECORD_FIELDS[i]];
  }
  return out;
}

// ── boundary helpers ──────────────────────────────────────────────────────────
function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function res(statusCode, body) {
  return {
    statusCode: statusCode,
    headers: { 'Content-Type': 'application/json', ...cors() },
    body: JSON.stringify(body)
  };
}

function degraded(reason, ticker) {
  return res(200, { status: 'DEGRADED', reason: reason, ticker: ticker });
}

function parseBody(rawBody) {
  if (typeof rawBody !== 'string' || rawBody.trim() === '') { return { ok: false }; }
  return parseJsonObject(rawBody);
}

// JSON text that parses to a plain (non-array, non-null) object, or { ok: false }.
function parseJsonObject(raw) {
  if (typeof raw !== 'string') { return { ok: false }; }
  let parsed;
  try { parsed = JSON.parse(raw); } catch (_) { return { ok: false }; }
  if (!isObject(parsed)) { return { ok: false }; }
  return { ok: true, value: parsed };
}

// Store acquisition — event._testStore (offline seam) BEFORE any @netlify/blobs
// require. Only invoked after the request is fully validated, so gate-off,
// failed preflight and invalid requests never touch it.
function acquireStore(event) {
  if (event && event._testStore) { return event._testStore; }
  const { getStore } = require('@netlify/blobs');
  return getStore(STORE_NAME);
}

function fail(reason) {
  return { ok: false, reason: reason };
}
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
function isObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function isNonEmptyString(v) {
  return typeof v === 'string' && v !== '';
}
function isHttpsString(v) {
  return typeof v === 'string' && v.indexOf('https://') === 0 && v.length > 'https://'.length;
}

exports.partitionDates = partitionDates;
exports.indexKey = indexKey;
exports.validateRecord = validateRecord;
exports.mapPreflightFailure = mapPreflightFailure;
