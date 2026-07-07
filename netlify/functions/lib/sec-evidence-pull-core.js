'use strict';

/*
 * netlify/functions/lib/sec-evidence-pull-core.js
 *
 * Real Portfolio Evidence Pull — Slice 2F endpoint adapter CORE (core-only).
 *
 * The boundary that reads the runtime environment once, runs the pure Slice 2E
 * preflight, and — only on { ok: true } — acquires the live store and drives the
 * Slice 2C orchestrator. Slice 2G adds the top-level sec-evidence-pull.mjs
 * route that wraps this handler. The handler is therefore now route-wired and
 * invocable, while default dormancy is enforced by the server-side gate: with the
 * gate off, requests return 200 DISABLED before downstream work begins.
 *
 * Auth-first response policy (Codex 2F re-review): no body- or ticker-derived
 * response is ever surfaced before the inbound pull authorization succeeds. Full
 * JSON.parse is DEFERRED until after auth+config clear. This is achieved by a
 * first preflight probe with the ticker withheld (ticker: undefined): the pure
 * Slice 2E order checks the inbound-token failure BEFORE it ever inspects the
 * ticker, so an unauthenticated or wrong-token caller — with any malformed,
 * missing, array, or null body — can only ever receive 401. The body is parsed
 * only once that probe has cleared gates + inbound token + writer token +
 * collision + SEC identity + allowlist.
 *
 * Env is read ONLY at this boundary (gate + injected env for the preflight + the
 * write token for the in-process handoff). The inbound pull token and the
 * downstream write token stay distinct (the preflight rejects a collision). The
 * request ticker stays strict / non-normalized. All store / provider /
 * orchestrator / writer / SEC / Blob work happens strictly AFTER pf.ok.
 *
 * Test seams (event-only): event._testStore and event._testProviderOptions are
 * read ONLY off the event object, NEVER from the parsed request body, and only
 * after pf.ok — so they can never override a gate or a token, and a body-supplied
 * key of the same name is structurally impossible to honor.
 */

const { evaluatePullPreflight } = require('./evidence-pull-preflight');
const { pullAndPersistTicker } = require('./evidence-pull-orchestrator');
const { STORE_NAME } = require('./evidence-store');

exports.handler = async function (event) {
  const method = event && event.httpMethod;

  // OPTIONS before gate — always respond (no body on the 204).
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: cors() };
  }

  // Primary pull gate — strict string 'true'. Off => dormant: no body parse, no
  // preflight, no store, no provider, no I/O of any kind.
  if (process.env.PT_ENABLE_SEC_EVIDENCE_PULL_SERVER !== 'true') {
    return res(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
  }

  // Method guard.
  if (method !== 'POST') {
    return res(405, { status: 'METHOD_NOT_ALLOWED', reason: 'METHOD_NOT_ALLOWED' });
  }

  const authorization = event && event.headers && event.headers['authorization'];

  // Auth-first probe: run the pure preflight with the ticker withheld. Its fixed
  // order decides gates + inbound auth + config BEFORE the ticker, so any failure
  // other than the (deferred) ticker is returned here WITHOUT parsing the body.
  const probe = evaluatePullPreflight({
    env: process.env,
    authorization: authorization,
    ticker: undefined
  });
  if (!probe.ok && probe.reason !== 'TICKER_INVALID') {
    return mapPreflightFailure(probe.reason);
  }
  // Reaching here proves gates + inbound token + writer token + collision + SEC
  // identity + allowlist ALL passed; only the (still-unparsed) ticker is pending.

  // Now — and only now, post-auth — parse the request body.
  const parsed = parseBody(event && event.body);
  if (!parsed.ok) {
    return res(400, { status: 'INVALID_JSON', reason: 'INVALID_JSON' });
  }

  // Full preflight with the real, strict, NON-normalized ticker.
  const pf = evaluatePullPreflight({
    env: process.env,
    authorization: authorization,
    ticker: parsed.value.ticker
  });
  if (!pf.ok) {
    return mapPreflightFailure(pf.reason);
  }

  // pf.ok — the FIRST live-I/O touchpoints begin here. Acquire the live store
  // (also handed to the writer via the orchestrator) and the provider options.
  let store;
  try {
    store = acquireStore(event);
  } catch (err) {
    return res(200, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', writeAttempted: false });
  }
  const providerOptions = acquireProviderOptions(event);

  let result;
  try {
    result = await pullAndPersistTicker(pf.ticker, {
      store: store,
      token: process.env.PT_SEC_EVIDENCE_STORE_WRITE_TOKEN,
      providerOptions: providerOptions
    });
  } catch (err) {
    // The provider fail-closes by throwing (SEC identity / fetch / HTTP / ceiling).
    // Never leak raw error text — fixed-vocabulary reason only.
    return res(502, { status: 'ERROR', reason: 'PROVIDER_FAILURE' });
  }

  return mapAction(result);
};

// ── preflight reason -> HTTP (auth-first; config family only reachable post-auth) ─
function mapPreflightFailure(reason) {
  switch (reason) {
    case 'PULL_SERVER_DISABLED':
    case 'WRITER_SERVER_DISABLED':
      // Uniform dormant response; both pre-auth, no internal-gate leak.
      return res(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
    case 'UNAUTHORIZED':
      return res(401, { status: 'UNAUTHORIZED', reason: 'UNAUTHORIZED' });
    case 'WRITER_TOKEN_MISSING':
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

// ── orchestrator action -> HTTP (only reachable after pf.ok) ───────────────────
function mapAction(result) {
  const r = (result && typeof result === 'object') ? result : {};
  const ticker = r.ticker;
  switch (r.action) {
    case 'SKIPPED_ALREADY_SEEDED':
      return res(200, { status: 'SKIPPED', reason: 'ALREADY_SEEDED', ticker: ticker });
    case 'STOPPED_PRE_READ_DEGRADED':
      return res(200, { status: 'DEGRADED', reason: 'STOPPED_PRE_READ_DEGRADED', ticker: ticker, writeAttempted: false });
    case 'STOPPED_PRE_READ_INVALID':
      return res(409, { status: 'CONFLICT', reason: 'STOPPED_PRE_READ_INVALID', ticker: ticker });
    case 'NO_CIK':
      return res(200, { status: 'NO_EVIDENCE', reason: 'NO_CIK', ticker: ticker });
    case 'NO_EVIDENCE':
      return res(200, { status: 'NO_EVIDENCE', reason: 'NO_EVIDENCE', ticker: ticker });
    case 'WRITE':
      // Mirror the writer's inner statusCode; surface writtenKeys verbatim (the
      // future exact-key teardown depends on it — never reconstructed here).
      return res(typeof r.statusCode === 'number' ? r.statusCode : 200, {
        status: 'WRITE',
        ticker: ticker,
        cik: r.cik,
        itemCount: r.itemCount,
        writtenKeys: r.writtenKeys,
        writer: {
          statusCode: r.statusCode,
          status: r.body && r.body.status,
          reason: r.body && r.body.reason
        }
      });
    default:
      return res(500, { status: 'ERROR', reason: 'ORCHESTRATOR_UNMAPPED' });
  }
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

// Provider options — event._testProviderOptions (offline seam) is EVENT-ONLY and
// only shapes the provider fetch/options, only after pf.ok. It can never override
// a gate or a token: those are read from process.env at the boundary above.
// Production => { env: process.env } (the provider defaults fetch -> globalThis.fetch).
function acquireProviderOptions(event) {
  if (event && event._testProviderOptions) { return event._testProviderOptions; }
  return { env: process.env };
}
