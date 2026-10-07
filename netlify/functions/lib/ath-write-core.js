'use strict';

/*
 * netlify/functions/lib/ath-write-core.js
 *
 * R-1 Slice B (B3) — gated ATH writer. Route: /.netlify/functions/ath-write.
 *
 * Request : POST { ticker, attempt }          -> verify + write the record
 *           POST { ticker, action: 'DELETE' } -> remove that ticker's record (teardown)
 *           with  Authorization: Bearer <PT_ATH_WRITE_TOKEN>
 *
 * Dormant unless PT_ENABLE_ATH_WRITE_SERVER === 'true' (checked before the method, the body, the
 * token and any store access). The token is checked BEFORE the body is parsed or the ticker is
 * inspected. Only allowlisted tickers (PT_ATH_ALLOWED_TICKERS) can be written or deleted.
 *
 * The writer does NOT trust the client's verdict. The operator submits the TradingView reading,
 * the FULL Yahoo daily series (`bars`) and any independent / search evidence; the writer DERIVES
 * the matched bar, every higher bar and the covered / uncovered split from that series, and
 * recomputes status and dispositions (ath-record.classifyVerification). A client-supplied
 * matchedBar / higherBars / status is refused or ignored. It accepts no override, reason or
 * plausibility field. A malformed, mis-ordered or stale series is never verified.
 *
 * TRUST BOUNDARY (B1+B3): the Yahoo series is still OPERATOR-SUPPLIED. The writer checks its
 * schema and consistency; it does not fetch Yahoo. A server-side provider fetch may be reconsidered
 * with B2 (it needs its own live-call approval).
 *
 * Write rules (existing record E, recomputed outcome O):
 *   E absent                          -> write the new record (verified or unresolved)
 *   O verified                        -> replace E (any status), refresh reset to none
 *   O unresolved, E verified/stale    -> E is NOT overwritten: only its refresh state and
 *                                        lastCheckedAt change (REFRESH_RECORDED)
 *   O unresolved, E unresolved        -> replace E with the new evidence
 */

const { evaluateAthPreflight } = require('./ath-preflight');
const {
  STORE_NAME,
  recordKey,
  validateRecord,
  classifyVerification,
  buildRecord,
  withRefreshFailure
} = require('./ath-record');

const STRONG = { consistency: 'strong' };

function mapPreflightFailure(reason) {
  switch (reason) {
    case 'WRITE_SERVER_DISABLED':
      return res(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
    case 'UNAUTHORIZED':
      return res(401, { status: 'UNAUTHORIZED', reason: 'UNAUTHORIZED' });
    case 'TOKEN_COLLISION':
    case 'ALLOWLIST_MISSING':
    case 'ALLOWLIST_INVALID':
      // Operator misconfiguration: only reachable after the inbound token passes.
      return res(500, { status: 'CONFIGURATION_MISSING', reason: reason });
    case 'TICKER_INVALID':
      return res(400, { status: 'INVALID_TICKER', reason: 'TICKER_INVALID' });
    case 'TICKER_NOT_ALLOWED':
      return res(403, { status: 'TICKER_NOT_ALLOWED', reason: 'TICKER_NOT_ALLOWED' });
    default:
      return res(500, { status: 'ERROR', reason: 'PREFLIGHT_UNMAPPED' });
  }
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function res(statusCode, body) {
  return { statusCode: statusCode, headers: { 'Content-Type': 'application/json', ...cors() }, body: JSON.stringify(body) };
}

function degraded(reason, ticker) {
  return res(200, { status: 'DEGRADED', reason: reason, ticker: ticker });
}

function invalidSubmission(reason) {
  return res(400, { status: 'INVALID_SUBMISSION', reason: reason });
}

function parseBody(rawBody) {
  if (typeof rawBody !== 'string' || rawBody.trim() === '') { return { ok: false }; }
  let parsed;
  try { parsed = JSON.parse(rawBody); } catch (_) { return { ok: false }; }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) { return { ok: false }; }
  return { ok: true, value: parsed };
}

function acquireStore(event) {
  if (event && event._testStore) { return event._testStore; }
  const { getStore } = require('@netlify/blobs');
  return getStore(STORE_NAME);
}

function resolveNowIso(event) {
  const clock = event && event._testClock;
  const ms = clock && typeof clock.nowMs === 'number' && isFinite(clock.nowMs) ? clock.nowMs : Date.now();
  return new Date(ms).toISOString();
}

// Body shape: exactly { ticker, attempt } or exactly { ticker, action: 'DELETE' }.
function bodyShape(body) {
  const keys = Object.keys(body).sort().join();
  if (keys === 'attempt,ticker') { return { kind: 'WRITE' }; }
  if (keys === 'action,ticker' && body.action === 'DELETE') { return { kind: 'DELETE' }; }
  return null;
}

exports.handler = async function (event) {
  const method = event && event.httpMethod;

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: cors() };
  }

  // Server gate: strict string 'true'. Off => dormant: no body parse, no preflight, no store.
  if (process.env.PT_ENABLE_ATH_WRITE_SERVER !== 'true') {
    return res(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
  }

  if (method !== 'POST') {
    return res(405, { status: 'METHOD_NOT_ALLOWED', reason: 'METHOD_NOT_ALLOWED' });
  }

  const authorization = event && event.headers && event.headers['authorization'];

  // Auth-first probe: gate, token, collision and allowlist are decided BEFORE the body is parsed
  // and before the ticker is looked at.
  const probe = evaluateAthPreflight({ side: 'write', env: process.env, authorization: authorization, ticker: undefined });
  if (!probe.ok && probe.reason !== 'TICKER_INVALID') {
    return mapPreflightFailure(probe.reason);
  }

  const parsed = parseBody(event && event.body);
  if (!parsed.ok) {
    return res(400, { status: 'INVALID_JSON', reason: 'INVALID_JSON' });
  }

  const pf = evaluateAthPreflight({ side: 'write', env: process.env, authorization: authorization, ticker: parsed.value.ticker });
  if (!pf.ok) {
    return mapPreflightFailure(pf.reason);
  }
  const ticker = pf.ticker;
  const key = recordKey(ticker);

  const shape = bodyShape(parsed.value);
  if (shape === null) {
    return invalidSubmission('BODY_SHAPE');
  }

  const nowIso = resolveNowIso(event);
  let classification = null;
  if (shape.kind === 'WRITE') {
    // The matched bar, every higher bar and the covered / uncovered split are DERIVED here from the
    // submitted full Yahoo daily series; nothing the client says about them is used or accepted.
    classification = classifyVerification(parsed.value.attempt, nowIso);
    if (!classification.ok) {
      return invalidSubmission(classification.reason);
    }
  }

  let store;
  try {
    store = acquireStore(event);
  } catch (_) {
    return degraded('STORE_UNAVAILABLE', ticker);
  }

  let existingRaw;
  try {
    existingRaw = await store.get(key, STRONG);
  } catch (_) {
    return degraded('STORE_UNAVAILABLE', ticker);
  }

  if (shape.kind === 'DELETE') {
    if (existingRaw === null || existingRaw === undefined) {
      return res(200, { status: 'NOT_AVAILABLE', reason: 'NO_RECORD', ticker: ticker });
    }
    try {
      await store.delete(key);
    } catch (_) {
      return degraded('STORE_UNAVAILABLE', ticker);
    }
    return res(200, { status: 'DELETED', ticker: ticker, key: key });
  }

  // WRITE: read and validate any existing record first. A corrupt record is never overwritten.
  let existing = null;
  if (existingRaw !== null && existingRaw !== undefined) {
    try { existing = JSON.parse(existingRaw); } catch (_) { return degraded('STORE_RECORD_INVALID', ticker); }
    if (!validateRecord(existing).ok || existing.ticker !== ticker) {
      return degraded('STORE_RECORD_INVALID', ticker);
    }
  }

  const candidate = buildRecord({ ticker: ticker, attempt: parsed.value.attempt, classification: classification, nowIso: nowIso });

  let toWrite = candidate;
  let outcome = 'WRITE';
  if (existing !== null && classification.status !== 'verified') {
    if (existing.status === 'verified' || existing.status === 'stale-suspect') {
      // A failed attempt never discards a verified (or suspended) ATH: it only records the failure.
      toWrite = withRefreshFailure(existing, classification.reason, nowIso);
      outcome = 'REFRESH_RECORDED';
    }
  }

  if (!validateRecord(toWrite).ok) {
    return res(500, { status: 'ERROR', reason: 'RECORD_BUILD_INVALID' });
  }

  try {
    await store.set(key, JSON.stringify(toWrite));
  } catch (_) {
    return degraded('STORE_UNAVAILABLE', ticker);
  }

  if (outcome === 'REFRESH_RECORDED') {
    return res(200, { status: 'REFRESH_RECORDED', ticker: ticker, recordStatus: toWrite.status, reason: classification.reason, key: key });
  }
  return res(200, { status: 'WRITE', ticker: ticker, recordStatus: toWrite.status, key: key });
};
