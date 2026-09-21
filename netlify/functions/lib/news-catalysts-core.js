'use strict';

/*
 * netlify/functions/lib/news-catalysts-core.js
 *
 * Catalyst news evidence pipeline · S1 — J3 news-catalysts core endpoint
 * adapter (write path only, core-only).
 *
 * The boundary that reads the runtime environment once, runs the pure, frozen
 * news-catalysts preflight (news-catalysts-preflight.js), and — only on
 * { ok: true } — acquires the fund-facts Blob store, strong-pre-reads the
 * per-day index record, drives the pure, frozen J3 provider
 * (news-catalysts-provider.js) over an injected fetch and an injected clock,
 * validates the write-relevant provider contract, and persists every item
 * record then the index record, all with { onlyIfNew: true }. news-catalysts.mjs wraps
 * this handler as /.netlify/functions/news-catalysts. Default dormancy is the
 * server gate: off => 200 DISABLED before any body parse, preflight, store,
 * provider, or I/O of any kind.
 *
 * Owner rulings honored here:
 *   D1  index partition = the UTC calendar date of the injected clock; one
 *       successful fetch per ticker per day; a second same-day POST finds the
 *       index present and returns SKIPPED / ALREADY_SEEDED with zero provider
 *       I/O. A zero-item run writes no index, so that day stays open.
 *   D5  the ONLY trigger is a POST carrying a valid Bearer token. No config
 *       export, no timer, no client caller, no background ingestion.
 *
 * Storage — fund-facts-store, namespace fundstore:v1 (not a new store):
 *   item   fundstore:v1:news:<TICKER>:<eventDate>:<identityHash>   (buildNewsKey)
 *   index  fundstore:v1:news-index:<TICKER>:<fetchDate>            (this module)
 * Each stored item record is the provider item PLUS sourceTier and
 * contractVersion copied from the envelope — evidence-freshness.validRecord
 * requires both on every record, and the provider item carries neither.
 *
 * Auth-first response policy (fund-facts-core idiom): the body is parsed only
 * after a first preflight probe with the ticker withheld; the pure preflight
 * checks the inbound token BEFORE it ever inspects the ticker, so an
 * unauthenticated caller with any malformed body can only ever receive 401.
 *
 * Create-only discipline: every write uses { onlyIfNew: true } and
 * writtenKeys records ONLY keys whose set returned modified === true. An item
 * key that already exists (the same event retrieved on an earlier day) is
 * never overwritten and is simply omitted from writtenKeys — that is the
 * normal overlap case, not a conflict. The index write is LAST; an index
 * modified:false is the race case => STORE_CONFLICT, never WRITE. A thrown or
 * malformed index set does NOT prove the index is absent (D-E): one strong
 * read reconciles — confirmed absent => STORE_UNAVAILABLE carrying the
 * created item keys (confirmed orphans); present or read failure =>
 * STORE_WRITE_UNCERTAIN. No automatic deletion is ever performed.
 *
 * Two disjoint failure domains: PROVIDER (a throw — including a missing
 * upstream key, which the provider rejects before any I/O — or a { ok:false }
 * or malformed result) => 502 ERROR/PROVIDER_FAILURE; STORE (acquire / read /
 * write throws) => 200 DEGRADED family. No response ever carries raw error
 * text — fixed-vocabulary reasons only.
 *
 * Env is read ONLY at this boundary (gate + env object for the preflight +
 * the upstream key injected as options.apiKey). The clock is read ONCE here
 * per request and injected (the provider forbids an ambient clock). The
 * provider's own abort/timeout defaults are left untouched. Test seams
 * (event-only): event._testStore and event._testProviderOptions are read ONLY
 * off the event object, NEVER from the parsed body, and only after pf.ok —
 * they can never override a gate or a token.
 */

const { evaluateNewsCatalystsPreflight } = require('./news-catalysts-preflight');
const {
  getNewsCatalysts,
  buildNewsKey,
  CONTRACT_VERSION,
  SOURCE_TIER,
  PROVIDER_ID,
  CATEGORIES,
  EVENT_TYPES,
  RELEVANCE_SCOPES,
  DIRECTIONS,
  NEWS_KEY_RE
} = require('./news-catalysts-provider');

// The provider item's 17 persisted fields, in the persisted order. Used to
// CONSTRUCT every stored record field by field (so the persisted bytes are
// order-stable whatever the input object's property order) and to require
// each field's presence — never to reject an input on key order or key set.
const ITEM_FIELDS = [
  'ticker', 'eventDate', 'category', 'direction', 'sourceUrl',
  'normalizedSourceUrl', 'sourceDomain', 'provider', 'retrievedAt',
  'identityHash', 'provenance', 'confidence', 'requiresVerification', 'scoringImpact',
  'eventType', 'relevanceScope', 'subType'
];

// Same Blob store as the fund-facts write/read cores; the index key lives in
// the same fundstore:v1 namespace the provider's item keys use.
const STORE_NAME = 'fund-facts-store';
const INDEX_KEY_PREFIX = 'fundstore:v1:news-index:';

// Strong-consistency reads: the create-only pre-read and the D-E reconciliation
// read must not be satisfied by an eventually-consistent replica.
const STRONG = { consistency: 'strong' };

// The strict UTC-Z instant grammar the provider requires of its injected
// clock; group 1 is the UTC calendar date that partitions the index.
const INSTANT_RE = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const HASH_RE = /^[a-f0-9]{64}$/;

// Index key for a ticker and an injected fetch instant; null when the instant
// is not in the strict grammar (the handler fails closed before any read).
function indexKey(ticker, fetchedAt) {
  const m = typeof fetchedAt === 'string' ? INSTANT_RE.exec(fetchedAt) : null;
  if (!m) { return null; }
  return INDEX_KEY_PREFIX + ticker + ':' + m[1];
}

// Stored item record = the provider item's 14 fields + the two envelope
// identity fields J7 requires, constructed explicitly in that order
// (insertion order is stringify-normative). Any unknown field on the input —
// e.g. a narrative field a drifted provider volunteers — is never persisted.
function projectItemRecord(item, envelope) {
  const record = {};
  for (let i = 0; i < ITEM_FIELDS.length; i++) {
    record[ITEM_FIELDS[i]] = item[ITEM_FIELDS[i]];
  }
  record.sourceTier = envelope.sourceTier;
  record.contractVersion = envelope.contractVersion;
  return record;
}

exports.handler = async function (event) {
  const method = event && event.httpMethod;

  // 1) OPTIONS before gate — always respond (no body on the 204).
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: cors() };
  }

  // 2) Server gate — strict string 'true'. Off => dormant: no body parse, no
  //    preflight, no store, no provider, no I/O of any kind.
  if (process.env.PT_ENABLE_NEWS_CATALYSTS_SERVER !== 'true') {
    return res(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
  }

  // 3) Method guard — POST is the only trigger (D5).
  if (method !== 'POST') {
    return res(405, { status: 'METHOD_NOT_ALLOWED', reason: 'METHOD_NOT_ALLOWED' });
  }

  const authorization = event && event.headers && event.headers['authorization'];

  // 4) Auth-first probe with the ticker withheld. The pure preflight decides
  //    gate + inbound token + collision + allowlist BEFORE the ticker, so any
  //    failure other than the (deferred) ticker check is returned here WITHOUT
  //    parsing the body. The news preflight reports a withheld ticker as
  //    TICKER_NOT_ALLOWED — that is the deferred reason.
  const probe = evaluateNewsCatalystsPreflight({
    env: process.env,
    authorization: authorization,
    ticker: undefined
  });
  if (!probe.ok && probe.reason !== 'TICKER_NOT_ALLOWED') {
    return mapPreflightFailure(probe.reason);
  }

  // 5) Now — and only now, post-auth — parse the request body. Only the
  //    ticker field is ever read from it.
  const parsed = parseBody(event && event.body);
  if (!parsed.ok) {
    return res(400, { status: 'INVALID_JSON', reason: 'INVALID_JSON' });
  }

  // 6) Full preflight with the real, strict, NON-normalized ticker.
  const pf = evaluateNewsCatalystsPreflight({
    env: process.env,
    authorization: authorization,
    ticker: parsed.value.ticker
  });
  if (!pf.ok) {
    return mapPreflightFailure(pf.reason);
  }
  const ticker = pf.ticker;

  // 7) Boundary clock, read once. The index partition derives from it; a
  //    non-conforming instant fails closed exactly as the provider would
  //    (CLOCK_NOT_INJECTED => provider domain), before any store read.
  const nowIso = acquireNowIso(event);
  const iKey = indexKey(ticker, nowIso);
  if (iKey === null) {
    return providerFailure();
  }

  // pf.ok — the FIRST I/O touchpoints begin here.
  let store;
  try {
    store = acquireStore(event);
  } catch (_) {
    return degradedStoreUnavailable();
  }

  // 8) Strong index-ONLY pre-read (D1). Present => this ticker already had its
  //    successful fetch today => SKIPPED with ZERO provider I/O. A read throw
  //    => DEGRADED before any fetch.
  let indexRaw;
  try {
    indexRaw = await store.get(iKey, STRONG);
  } catch (_) {
    return degradedStoreUnavailable();
  }
  if (indexRaw !== null && indexRaw !== undefined) {
    return res(200, { status: 'SKIPPED', reason: 'ALREADY_SEEDED', ticker: ticker });
  }

  // 9) Provider pull over the injected fetch + injected clock + boundary-read
  //    upstream key. Any provider throw => 502 PROVIDER_FAILURE, no raw text,
  //    no partial write, no retry.
  let result;
  try {
    result = await acquireProviderImpl(event)(
      { ticker: ticker },
      {
        fetchImpl: acquireProviderFetch(event),
        apiKey: process.env.PERPLEXITY_API_KEY,
        nowIso: nowIso
      }
    );
  } catch (_) {
    return providerFailure();
  }

  // 10) Write-relevant provider contract validation BEFORE any write:
  //     { ok:false }, null, and every partial or malformed result fail closed
  //     as PROVIDER_FAILURE.
  const v = validateProviderResult(result, ticker, nowIso);
  if (!v.ok) {
    return providerFailure();
  }
  const envelope = v.envelope;
  const fetchedAt = envelope.fetchedAt;

  // 11) Zero items => NONE. No index is written, so the day stays open.
  if (envelope.items.length === 0) {
    return res(200, { status: 'NONE', ticker: ticker, fetchedAt: fetchedAt });
  }

  // 12) Item records — create-only, in envelope order. modified:true => created
  //     by THIS invocation (recorded); modified:false => the key already exists
  //     (normal day-to-day overlap; never overwritten, not recorded). A throw or
  //     a malformed set result => nothing further is written: STORE_UNAVAILABLE,
  //     carrying the keys created so far as provenance.
  const itemKeys = v.itemKeys;
  const writtenKeys = [];
  for (let i = 0; i < envelope.items.length; i++) {
    let itemSet;
    try {
      itemSet = await store.set(itemKeys[i], JSON.stringify(projectItemRecord(envelope.items[i], envelope)), { onlyIfNew: true });
    } catch (_) {
      return degradedItemStage(ticker, writtenKeys);
    }
    if (!isObject(itemSet) || typeof itemSet.modified !== 'boolean') {
      return degradedItemStage(ticker, writtenKeys);
    }
    if (itemSet.modified === true) {
      writtenKeys.push(itemKeys[i]);
    }
  }

  // 13) Index record — create-only, LAST. Lists every item key of this fetch
  //     (the day's evidence pointer), independent of which were newly created.
  const indexRecord = {
    ticker: ticker,
    fetchedAt: fetchedAt,
    sourceTier: envelope.sourceTier,
    contractVersion: envelope.contractVersion,
    provider: envelope.provider,
    keys: itemKeys
  };
  let indexSet;
  let indexIndeterminate = false;
  try {
    indexSet = await store.set(iKey, JSON.stringify(indexRecord), { onlyIfNew: true });
  } catch (_) {
    indexIndeterminate = true;
  }
  if (!indexIndeterminate) {
    if (isObject(indexSet) && indexSet.modified === true) {
      writtenKeys.push(iKey);
      return res(200, { status: 'WRITE', ticker: ticker, fetchedAt: fetchedAt, writtenKeys: writtenKeys });
    }
    if (isObject(indexSet) && indexSet.modified === false) {
      // An index appeared despite the absent pre-read (race): never WRITE.
      return res(200, { status: 'DEGRADED', reason: 'STORE_CONFLICT', ticker: ticker, writtenKeys: writtenKeys });
    }
    // A malformed set result is as indeterminate as a throw — reconcile below.
    indexIndeterminate = true;
  }

  // 14) D-E reconciliation: one strong read decides. Confirmed absent =>
  //     confirmed-orphan items (STORE_UNAVAILABLE + provenance); present or
  //     read failure => STORE_WRITE_UNCERTAIN. Never WRITE; nothing is deleted.
  let reconciled;
  try {
    reconciled = await store.get(iKey, STRONG);
  } catch (_) {
    return res(200, { status: 'DEGRADED', reason: 'STORE_WRITE_UNCERTAIN', ticker: ticker, writtenKeys: writtenKeys });
  }
  if (reconciled === null || reconciled === undefined) {
    return res(200, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', ticker: ticker, writtenKeys: writtenKeys });
  }
  return res(200, { status: 'DEGRADED', reason: 'STORE_WRITE_UNCERTAIN', ticker: ticker, writtenKeys: writtenKeys });
};

// ── write-relevant provider contract validation (every check before any write) ─
// Returns { ok: true, envelope, itemKeys } | { ok: false }. Every field this
// core persists or keys on is checked semantically (presence, type, vocabulary,
// identity, clock echo) so an injected or drifted provider can never write a
// partial or foreign record. Order-insensitive: property order and unknown
// extra fields are never grounds for rejection (the projection simply does not
// persist them). Envelope members S1 does not consume (skippedItems,
// writtenKeys) are intentionally not validated.
function validateProviderResult(result, ticker, nowIso) {
  if (!isObject(result) || result.ok !== true) { return { ok: false }; }
  const envelope = result.envelope;
  if (!isObject(envelope)) { return { ok: false }; }
  if (envelope.ticker !== ticker) { return { ok: false }; }
  if (envelope.fetchedAt !== nowIso) { return { ok: false }; }
  if (envelope.sourceTier !== SOURCE_TIER) { return { ok: false }; }
  if (envelope.contractVersion !== CONTRACT_VERSION) { return { ok: false }; }
  if (envelope.provider !== PROVIDER_ID) { return { ok: false }; }
  if (!Array.isArray(envelope.items)) { return { ok: false }; }
  const itemKeys = [];
  for (let i = 0; i < envelope.items.length; i++) {
    const item = envelope.items[i];
    if (!isObject(item)) { return { ok: false }; }
    if (item.ticker !== ticker) { return { ok: false }; }
    if (item.provider !== PROVIDER_ID) { return { ok: false }; }
    if (item.retrievedAt !== nowIso) { return { ok: false }; }
    if (CATEGORIES.indexOf(item.category) === -1) { return { ok: false }; }
    // A-5: eventType is validated as its own fail-closed check, in the same
    // style as CATEGORIES above. direction is then conditional on it —
    // catalyst requires a DIRECTIONS value; upcoming_event requires direction
    // to be exactly null. Every prior rejection stays a rejection: '' still
    // fails both event types, null still fails catalyst, 'sideways' still
    // fails catalyst, and a non-null value still fails upcoming_event.
    if (EVENT_TYPES.indexOf(item.eventType) === -1) { return { ok: false }; }
    if (item.eventType === 'catalyst') {
      if (DIRECTIONS.indexOf(item.direction) === -1) { return { ok: false }; }
    } else if (item.direction !== null) {
      return { ok: false };
    }
    // A-5.1: relevanceScope and subType get the same defense-in-depth as
    // every other write-relevant field. subType mirrors the provider ladder's
    // own conditionality exactly — a trimmed non-empty string iff category is
    // 'other_catalyst', else exactly null.
    if (RELEVANCE_SCOPES.indexOf(item.relevanceScope) === -1) { return { ok: false }; }
    if (item.category === 'other_catalyst') {
      if (typeof item.subType !== 'string' || item.subType.trim() === '') { return { ok: false }; }
    } else if (item.subType !== null) {
      return { ok: false };
    }
    if (!isHttpsString(item.sourceUrl) || !isHttpsString(item.normalizedSourceUrl)) { return { ok: false }; }
    if (!isNonEmptyString(item.sourceDomain)) { return { ok: false }; }
    if (typeof item.identityHash !== 'string' || !HASH_RE.test(item.identityHash)) { return { ok: false }; }
    if (item.provenance !== 'retrieval_unverified') { return { ok: false }; }
    if (item.confidence !== null) { return { ok: false }; }
    if (item.requiresVerification !== true) { return { ok: false }; }
    if (item.scoringImpact !== 'none') { return { ok: false }; }
    // NEWS_KEY_RE additionally pins the eventDate grammar inside the key.
    const key = buildNewsKey(item);
    if (!NEWS_KEY_RE.test(key)) { return { ok: false }; }
    itemKeys.push(key);
  }
  return { ok: true, envelope: envelope, itemKeys: itemKeys };
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v !== '';
}

function isHttpsString(v) {
  return typeof v === 'string' && v.indexOf('https://') === 0 && v.length > 'https://'.length;
}

// ── preflight reason -> HTTP (auth-first; config family only reachable post-auth) ─
// Total: every reason maps, and an unknown reason fails closed and leaks
// nothing specific (the read-side precedent's missing default is NOT copied).
function mapPreflightFailure(reason) {
  switch (reason) {
    case 'SERVER_DISABLED':
      // Defensive: the direct gate check above already returned DISABLED.
      return res(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
    case 'UNAUTHORIZED':
      return res(401, { status: 'UNAUTHORIZED', reason: 'UNAUTHORIZED' });
    case 'TOKEN_COLLISION':
    case 'ALLOWLIST_MISSING':
    case 'ALLOWLIST_INVALID':
      // Operator misconfiguration — only reachable after the inbound token passes.
      return res(500, { status: 'CONFIGURATION_MISSING', reason: reason });
    case 'TICKER_NOT_ALLOWED':
      return res(403, { status: 'TICKER_NOT_ALLOWED', reason: 'TICKER_NOT_ALLOWED' });
    default:
      return res(500, { status: 'ERROR', reason: 'PREFLIGHT_UNMAPPED' });
  }
}

// Bare store-domain failure (acquire / pre-read throw): no key was confirmed
// written, so no writtenKeys field.
function degradedStoreUnavailable() {
  return res(200, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE' });
}

// Item-stage store failure (set throw / malformed set result): bare when
// nothing was created yet, otherwise the created keys ride along as
// provenance. No index was attempted, so the day stays open.
function degradedItemStage(ticker, writtenKeys) {
  if (writtenKeys.length === 0) {
    return degradedStoreUnavailable();
  }
  return res(200, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', ticker: ticker, writtenKeys: writtenKeys });
}

// Provider-domain failure (throw, { ok:false }, or partial/malformed result):
// fixed reason, no raw text, no key written.
function providerFailure() {
  return res(502, { status: 'ERROR', reason: 'PROVIDER_FAILURE' });
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

function parseBody(rawBody) {
  if (typeof rawBody !== 'string' || rawBody.trim() === '') { return { ok: false }; }
  let parsed;
  try { parsed = JSON.parse(rawBody); } catch (_) { return { ok: false }; }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) { return { ok: false }; }
  return { ok: true, value: parsed };
}

// Store acquisition — event._testStore (offline seam) BEFORE any @netlify/blobs
// require. Only invoked after pf.ok, so gate-off / failed-preflight never touch it.
function acquireStore(event) {
  if (event && event._testStore) { return event._testStore; }
  const { getStore } = require('@netlify/blobs');
  return getStore(STORE_NAME);
}

// Provider implementation — event._testProviderOptions.providerImpl (offline
// seam) is EVENT-ONLY and consulted only after pf.ok; it can never override a
// gate or a token (those are read from process.env at the boundary above).
function acquireProviderImpl(event) {
  if (event && event._testProviderOptions &&
      typeof event._testProviderOptions.providerImpl === 'function') {
    return event._testProviderOptions.providerImpl;
  }
  return getNewsCatalysts;
}

// Provider fetch — event._testProviderOptions.fetchImpl (offline seam), else the
// ambient global fetch. The provider fail-closes itself when neither exists.
function acquireProviderFetch(event) {
  if (event && event._testProviderOptions &&
      typeof event._testProviderOptions.fetchImpl === 'function') {
    return event._testProviderOptions.fetchImpl;
  }
  return (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function')
    ? globalThis.fetch
    : undefined;
}

// Boundary clock — read ONCE per request and injected downstream.
// event._testProviderOptions.nowIso is the event-only offline override that
// keeps fixtures deterministic.
function acquireNowIso(event) {
  if (event && event._testProviderOptions &&
      typeof event._testProviderOptions.nowIso === 'string') {
    return event._testProviderOptions.nowIso;
  }
  return new Date().toISOString();
}

function isObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

exports.indexKey = indexKey;
exports.projectItemRecord = projectItemRecord;
exports.validateProviderResult = validateProviderResult;
exports.mapPreflightFailure = mapPreflightFailure;
