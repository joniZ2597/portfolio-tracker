'use strict';

/*
 * netlify/functions/lib/fund-facts-core.js
 *
 * EG-25C-1 · C1-S3 — J1 SEC Financial Facts core endpoint adapter (core-only).
 *
 * The boundary that reads the runtime environment once, runs the pure C1-S2
 * preflight (fund-facts-preflight.js), and — only on { ok: true } — acquires the
 * fund-facts Blob store, strong-pre-reads the mapping pointer (create-only,
 * C1-10), drives the pure C1-S1 provider (fund-facts-provider.js), validates the
 * full provider envelope, and persists the facts record then the mapping
 * pointer, both with { onlyIfNew: true }. C1-S4 adds the top-level
 * fund-facts.mjs route that wraps this handler; until then there is NO route and
 * NO caller, and default dormancy is enforced by the server gate (off => 200
 * DISABLED before any downstream work).
 *
 * Auth-first response policy (sec-evidence-pull-core idiom): no body- or
 * ticker-derived response is surfaced before inbound authorization succeeds.
 * JSON.parse of the body is DEFERRED past auth via a first preflight probe with
 * the ticker withheld (ticker: undefined): the pure C1-S2 order checks the
 * inbound token BEFORE it ever inspects the ticker, so an unauthenticated or
 * wrong-token caller — with any malformed, missing, array, or null body — can
 * only ever receive 401.
 *
 * Create-only discipline (owner rulings D-A/D-D): every write uses
 * { onlyIfNew: true } and writtenKeys records ONLY keys whose set returned
 * modified === true — keys confirmed created by THIS invocation. A facts key
 * that already exists is NEVER overwritten (modified:false => STORE_CONFLICT,
 * no pointer write); an orphaned facts record therefore requires C1-S6 teardown
 * before a retry can succeed — there is no overwrite/self-heal path.
 *
 * Ambiguous pointer write (owner ruling D-E): a thrown pointer set does NOT
 * prove the pointer is absent. After a pointer-set throw (or a malformed set
 * result), one strong pointer read reconciles: confirmed absent => the
 * confirmed-orphan DEGRADED/STORE_UNAVAILABLE response carrying exactly the
 * facts key; present, conflicting, or reconciliation-read failure =>
 * DEGRADED/STORE_WRITE_UNCERTAIN — never WRITE, and no automatic deletion is
 * authorized. Teardown safety derives from the exact response shape
 * (status + reason + writtenKeys): WRITE [facts,pointer] => both teardown-safe;
 * STORE_UNAVAILABLE with exactly [facts] => confirmed orphan, facts
 * teardown-safe; bare STORE_UNAVAILABLE => none; STORE_CONFLICT /
 * STORE_WRITE_UNCERTAIN with [facts] => provenance only, quarantined (a pointer
 * may reference the facts record). STORE_CONFLICT and STORE_WRITE_UNCERTAIN are
 * owner-ratified C1-S3 extensions to the eg25c1-spec-v1 vocabulary.
 *
 * Two disjoint failure domains: PROVIDER (SEC network/extraction throws, and any
 * partial or malformed provider result) => 502 ERROR/PROVIDER_FAILURE; STORE
 * (blobs acquire / read / write throws) => 200 DEGRADED family. NONE is reserved
 * for the EXACT provider no-data result { cik: null, record: null }. No response
 * ever carries raw error text — fixed-vocabulary reasons only.
 *
 * Env is read ONLY at this boundary (gate + injected env for the preflight + SEC
 * identity for the provider). The clock is read ONCE here per request (the
 * provider forbids an ambient clock). The provider's own request abort and
 * default 22000 ms timeout are left untouched (no override is passed). Test
 * seams (event-only): event._testStore and event._testProviderOptions are read
 * ONLY off the event object, NEVER from the parsed body, and only after pf.ok —
 * they can never override a gate or a token.
 */

const { evaluateFundFactsPreflight } = require('./fund-facts-preflight');
const {
  getFundFactsWithCik,
  CONTRACT_VERSION,
  SOURCE_TIER,
  PROVIDER_ID
} = require('./fund-facts-provider');

// Fund-facts Blob store + key schema (spec C1-3).
const STORE_NAME = 'fund-facts-store';
const KEY_NAMESPACE = 'fundstore:v1';
const CIK_RE = /^\d{10}$/;

function pointerKey(ticker) { return KEY_NAMESPACE + ':cik:' + ticker; }
function factsKey(cik) { return KEY_NAMESPACE + ':facts:' + cik; }

// Strong-consistency reads: the create-only pre-read and the D-E reconciliation
// read must not be satisfied by an eventually-consistent replica.
const STRONG = { consistency: 'strong' };

exports.handler = async function (event) {
  const method = event && event.httpMethod;

  // 1) OPTIONS before gate — always respond (no body on the 204).
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: cors() };
  }

  // 2) Fund-facts server gate — strict string 'true'. Off => dormant: no body
  //    parse, no preflight, no store, no provider, no I/O of any kind.
  if (process.env.PT_ENABLE_FUND_FACTS_SERVER !== 'true') {
    return res(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
  }

  // 3) Method guard.
  if (method !== 'POST') {
    return res(405, { status: 'METHOD_NOT_ALLOWED', reason: 'METHOD_NOT_ALLOWED' });
  }

  const authorization = event && event.headers && event.headers['authorization'];

  // 4) Auth-first probe: the pure preflight with the ticker withheld. Its fixed
  //    order decides gate + inbound token + collision + SEC identity + allowlist
  //    BEFORE the ticker, so any failure other than the (deferred) ticker is
  //    returned here WITHOUT parsing the body.
  const probe = evaluateFundFactsPreflight({
    env: process.env,
    authorization: authorization,
    ticker: undefined
  });
  if (!probe.ok && probe.reason !== 'TICKER_INVALID') {
    return mapPreflightFailure(probe.reason);
  }

  // 5) Now — and only now, post-auth — parse the request body. Only the ticker
  //    field is ever read from it.
  const parsed = parseBody(event && event.body);
  if (!parsed.ok) {
    return res(400, { status: 'INVALID_JSON', reason: 'INVALID_JSON' });
  }

  // 6) Full preflight with the real, strict, NON-normalized ticker.
  const pf = evaluateFundFactsPreflight({
    env: process.env,
    authorization: authorization,
    ticker: parsed.value.ticker
  });
  if (!pf.ok) {
    return mapPreflightFailure(pf.reason);
  }
  const ticker = pf.ticker;

  // pf.ok — the FIRST I/O touchpoints begin here.
  let store;
  try {
    store = acquireStore(event);
  } catch (_) {
    return degradedStoreUnavailable();
  }

  // 7) Strong pointer-ONLY pre-read (create-only, C1-10). Present => seeded =>
  //    SKIPPED with ZERO SEC I/O. A read throw => DEGRADED before any fetch.
  let pointerRaw;
  try {
    pointerRaw = await store.get(pointerKey(ticker), STRONG);
  } catch (_) {
    return degradedStoreUnavailable();
  }
  if (pointerRaw !== null && pointerRaw !== undefined) {
    return res(200, { status: 'SKIPPED', reason: 'ALREADY_SEEDED', ticker: ticker });
  }

  // 8) Provider pull. The provider governs its own SEC abort/timeout (default
  //    22000 ms, untouched); any provider throw => 502 PROVIDER_FAILURE with no
  //    raw text, no partial write, no retry.
  let result;
  try {
    result = await acquireProviderImpl(event)(
      { ticker: ticker },
      {
        fetchImpl: acquireProviderFetch(event),
        userAgent: process.env.SEC_USER_AGENT,
        nowIso: acquireNowIso(event)
      }
    );
  } catch (_) {
    return providerFailure();
  }

  // 9) NONE is reserved for the EXACT no-data result { cik: null, record: null }
  //    (D-B). Zero store writes.
  if (isObject(result) && result.cik === null && result.record === null) {
    return res(200, { status: 'NONE', reason: 'NONE', ticker: ticker });
  }

  // 10) Full envelope validation (D-C) BEFORE any write: every partial or
  //     malformed provider result fails closed as PROVIDER_FAILURE.
  const v = validateProviderResult(result, ticker);
  if (!v.ok) {
    return providerFailure();
  }
  const cik = v.cik;

  // 11) Facts record write — create-only. modified:false => the facts key
  //     already exists (orphan or foreign record): STORE_CONFLICT, no pointer
  //     write, nothing created by this invocation (D-A). A throw or a malformed
  //     set result => nothing confirmed written => bare DEGRADED.
  const fKey = factsKey(cik);
  let factsSet;
  try {
    factsSet = await store.set(fKey, JSON.stringify(v.record), { onlyIfNew: true });
  } catch (_) {
    return degradedStoreUnavailable();
  }
  if (!isObject(factsSet) || factsSet.modified !== true) {
    if (isObject(factsSet) && factsSet.modified === false) {
      return res(200, { status: 'DEGRADED', reason: 'STORE_CONFLICT', ticker: ticker, cik: cik });
    }
    return degradedStoreUnavailable();
  }
  // Facts record created by THIS invocation — the only provenance we hold yet.
  const writtenKeys = [fKey];

  // 12) Mapping pointer write — create-only, LAST (pointer-last write mirrors
  //     the pointer-first delete order). modified:false => a pointer appeared
  //     despite the absent pre-read (race): STORE_CONFLICT, never WRITE, the
  //     created facts record stays quarantined provenance.
  const pKey = pointerKey(ticker);
  let pointerSet;
  let pointerIndeterminate = false;
  try {
    pointerSet = await store.set(pKey, JSON.stringify({ cik: cik }), { onlyIfNew: true });
  } catch (_) {
    pointerIndeterminate = true;
  }
  if (!pointerIndeterminate) {
    if (isObject(pointerSet) && pointerSet.modified === true) {
      writtenKeys.push(pKey);
      return res(200, { status: 'WRITE', ticker: ticker, cik: cik, writtenKeys: writtenKeys });
    }
    if (isObject(pointerSet) && pointerSet.modified === false) {
      return res(200, {
        status: 'DEGRADED',
        reason: 'STORE_CONFLICT',
        ticker: ticker,
        cik: cik,
        writtenKeys: writtenKeys
      });
    }
    // A malformed set result is as indeterminate as a throw — reconcile below.
    pointerIndeterminate = true;
  }

  // 13) D-E reconciliation: a thrown/indeterminate pointer set does NOT prove
  //     the pointer is absent. One strong read decides: confirmed absent =>
  //     confirmed orphan (facts key teardown-safe); present, conflicting, or
  //     reconciliation-read failure => STORE_WRITE_UNCERTAIN (quarantined;
  //     never WRITE; no automatic deletion authorized).
  let reconciled;
  try {
    reconciled = await store.get(pKey, STRONG);
  } catch (_) {
    return res(200, {
      status: 'DEGRADED',
      reason: 'STORE_WRITE_UNCERTAIN',
      ticker: ticker,
      cik: cik,
      writtenKeys: writtenKeys
    });
  }
  if (reconciled === null || reconciled === undefined) {
    return res(200, {
      status: 'DEGRADED',
      reason: 'STORE_UNAVAILABLE',
      ticker: ticker,
      cik: cik,
      writtenKeys: writtenKeys
    });
  }
  return res(200, {
    status: 'DEGRADED',
    reason: 'STORE_WRITE_UNCERTAIN',
    ticker: ticker,
    cik: cik,
    writtenKeys: writtenKeys
  });
};

// ── provider-result envelope validation (D-C; every check before any write) ───
// The NONE short-circuit happens BEFORE this call; everything here fails closed.
// Returns { ok: true, cik, record } | { ok: false }.
function validateProviderResult(result, ticker) {
  if (!isObject(result)) { return { ok: false }; }
  const cik = result.cik;
  const record = result.record;
  if (typeof cik !== 'string' || !CIK_RE.test(cik)) { return { ok: false }; }
  if (!isObject(record)) { return { ok: false }; }
  if (record.cik !== cik) { return { ok: false }; }
  if (record.ticker !== ticker) { return { ok: false }; }
  if (record.contractVersion !== CONTRACT_VERSION) { return { ok: false }; }
  if (record.sourceTier !== SOURCE_TIER) { return { ok: false }; }
  if (record.provider !== PROVIDER_ID) { return { ok: false }; }
  if (typeof record.fetchedAt !== 'string' || !isFinite(Date.parse(record.fetchedAt))) { return { ok: false }; }
  if (typeof record.runId !== 'number' || !isFinite(record.runId)) { return { ok: false }; }
  return { ok: true, cik: cik, record: record };
}

// ── preflight reason -> HTTP (auth-first; config family only reachable post-auth) ─
function mapPreflightFailure(reason) {
  switch (reason) {
    case 'FUND_FACTS_SERVER_DISABLED':
      // Defensive: the direct gate check above already returned DISABLED; kept
      // so the mapping is total and leaks no internal-gate distinction.
      return res(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
    case 'UNAUTHORIZED':
      return res(401, { status: 'UNAUTHORIZED', reason: 'UNAUTHORIZED' });
    case 'TOKEN_COLLISION':
    case 'SEC_USER_AGENT_MISSING':
    case 'ALLOWLIST_MISSING':
    case 'ALLOWLIST_INVALID':
      // Operator misconfiguration — only reachable after the inbound token passes.
      return res(500, { status: 'CONFIGURATION_MISSING', reason: reason });
    case 'TICKER_INVALID':
      return res(400, { status: 'INVALID_TICKER', reason: 'TICKER_INVALID' });
    case 'TICKER_NOT_ALLOWED':
      return res(403, { status: 'TICKER_NOT_ALLOWED', reason: 'TICKER_NOT_ALLOWED' });
    default:
      // Defensive: an unknown reason fails closed and leaks nothing specific.
      return res(500, { status: 'ERROR', reason: 'PREFLIGHT_UNMAPPED' });
  }
}

// Bare store-domain failure (acquire / pre-read / facts-write throw / malformed
// facts-set result): no key was confirmed written, so no writtenKeys field.
function degradedStoreUnavailable() {
  return res(200, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE' });
}

// Provider-domain failure (throw or partial/malformed result): fixed reason,
// no raw text, no key written.
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
  return getFundFactsWithCik;
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

// Boundary clock — read ONCE per request (the provider forbids an ambient
// clock). event._testProviderOptions.nowIso is the event-only offline override
// that keeps fixtures deterministic.
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

exports.validateProviderResult = validateProviderResult;
