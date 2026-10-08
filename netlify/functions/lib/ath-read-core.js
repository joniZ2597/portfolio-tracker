'use strict';

/*
 * netlify/functions/lib/ath-read-core.js
 *
 * R-1 Slice B (B1, public since B2-auto) — read-only ATH reader. Route: /.netlify/functions/ath-read.
 *
 * Request : POST { ticker }                    (no token; public and read-only)
 * Response: { status, ... } envelopes; an OK body is exactly the ath-read-v2 projection.
 *
 * Dormant unless PT_ENABLE_ATH_READ_SERVER === 'true' (checked before the method, the body and
 * any store access). The reader performs exactly one store `get` and never writes, lists or
 * deletes. It exposes only the public ATH record / status: never evidence, refresh state,
 * timestamps other than verifiedAt, the allowlist, or any portfolio / operator data.
 *
 * The ATH is returned ONLY for a `verified` record. For `stale-suspect` and `unresolved` records
 * athValue and athDate are null and recordStatus says why. A failed refresh recorded on a verified
 * record does NOT suppress the stored ATH. There is no fallback of any kind to the 1Y High.
 */

const { evaluateAthPreflight } = require('./ath-preflight');
const { STORE_NAME, recordKey, parseStoredRecord, projectPublic } = require('./ath-record');

const STRONG = { consistency: 'strong' };

function mapPreflightFailure(reason) {
  switch (reason) {
    case 'READ_SERVER_DISABLED':
      return res(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
    case 'TICKER_INVALID':
      return res(400, { status: 'INVALID_TICKER', reason: 'TICKER_INVALID' });
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

function res(statusCode, body, extraHeaders) {
  return { statusCode: statusCode, headers: Object.assign({ 'Content-Type': 'application/json' }, cors(), extraHeaders || {}), body: JSON.stringify(body) };
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

exports.handler = async function (event) {
  const method = event && event.httpMethod;

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: cors() };
  }

  // Server gate: strict string 'true'. Off => dormant: no body parse, no preflight, no store.
  if (process.env.PT_ENABLE_ATH_READ_SERVER !== 'true') {
    return res(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
  }

  if (method !== 'POST') {
    return res(405, { status: 'METHOD_NOT_ALLOWED', reason: 'METHOD_NOT_ALLOWED' });
  }

  const parsed = parseBody(event && event.body);
  if (!parsed.ok) {
    return res(400, { status: 'INVALID_JSON', reason: 'INVALID_JSON' });
  }

  const pf = evaluateAthPreflight({ side: 'read', env: process.env, ticker: parsed.value.ticker });
  if (!pf.ok) {
    return mapPreflightFailure(pf.reason);
  }
  const ticker = pf.ticker;

  let store;
  try {
    store = acquireStore(event);
  } catch (_) {
    return res(200, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', ticker: ticker });
  }

  let raw;
  try {
    raw = await store.get(recordKey(ticker), STRONG);
  } catch (_) {
    return res(200, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', ticker: ticker });
  }
  if (raw === null || raw === undefined) {
    return res(200, { status: 'NOT_AVAILABLE', reason: 'NO_RECORD', ticker: ticker }, { 'Cache-Control': 'public, max-age=60' });
  }

  const stored = parseStoredRecord(raw);
  if (!stored.ok || stored.record.ticker !== ticker) {
    return res(200, { status: 'DEGRADED', reason: 'STORE_RECORD_INVALID', ticker: ticker });
  }

  return res(200, projectPublic(ticker, stored.record), { 'Cache-Control': 'public, max-age=60' });
};
