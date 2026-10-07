'use strict';

/*
 * netlify/functions/lib/ath-read-core.js
 *
 * R-1 Slice B (B1) — gated, read-only ATH reader. Route: /.netlify/functions/ath-read.
 *
 * Request : POST { ticker }  with  Authorization: Bearer <PT_ATH_READ_TOKEN>
 * Response: { status, ... } envelopes, same vocabulary as fund-facts-read.
 *
 * Dormant unless PT_ENABLE_ATH_READ_SERVER === 'true' (checked before the method, the body, the
 * token and any store access). The token is checked BEFORE the body is parsed. The reader never
 * writes.
 *
 * The ATH is returned ONLY for a `verified` record. For `stale-suspect` and `unresolved` records
 * athValue and athDate are null and the status says why. A failed refresh recorded on a verified
 * record (refresh.status === 'unresolved') does NOT suppress the stored ATH. There is no fallback
 * of any kind to the 1Y High.
 */

const { evaluateAthPreflight } = require('./ath-preflight');
const { STORE_NAME, recordKey, validateRecord } = require('./ath-record');

const STRONG = { consistency: 'strong' };
const READ_CONTRACT_VERSION = 'ath-read-v1';

function mapPreflightFailure(reason, ticker) {
  switch (reason) {
    case 'READ_SERVER_DISABLED':
      return res(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
    case 'UNAUTHORIZED':
      return res(401, { status: 'UNAUTHORIZED', reason: 'UNAUTHORIZED' });
    case 'TOKEN_COLLISION':
    case 'ALLOWLIST_MISSING':
    case 'ALLOWLIST_INVALID':
      return res(500, { status: 'CONFIGURATION_MISSING', reason: reason });
    case 'TICKER_INVALID':
      return res(400, { status: 'INVALID_TICKER', reason: 'TICKER_INVALID' });
    case 'TICKER_NOT_ALLOWED':
      return res(200, { status: 'NOT_AVAILABLE', reason: 'NO_RECORD', ticker: ticker });
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

function project(ticker, record) {
  return {
    status: 'OK',
    readContractVersion: READ_CONTRACT_VERSION,
    ticker: ticker,
    recordStatus: record.status,
    athValue: record.status === 'verified' ? record.athValue : null,
    athDate: record.status === 'verified' ? record.athDate : null,
    currency: record.currency,
    unit: record.unit,
    basis: record.basis,
    verifiedAt: record.verifiedAt,
    refresh: record.refresh,
    pending: record.pending,
    lastCheckedAt: record.lastCheckedAt
  };
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

  const authorization = event && event.headers && event.headers['authorization'];

  // Auth-first probe: the preflight with the ticker withheld decides gate, token, collision and
  // allowlist BEFORE the body is parsed.
  const probe = evaluateAthPreflight({ side: 'read', env: process.env, authorization: authorization, ticker: undefined });
  if (!probe.ok && probe.reason !== 'TICKER_INVALID') {
    return mapPreflightFailure(probe.reason);
  }

  const parsed = parseBody(event && event.body);
  if (!parsed.ok) {
    return res(400, { status: 'INVALID_JSON', reason: 'INVALID_JSON' });
  }

  const pf = evaluateAthPreflight({ side: 'read', env: process.env, authorization: authorization, ticker: parsed.value.ticker });
  if (!pf.ok) {
    return mapPreflightFailure(pf.reason, pf.reason === 'TICKER_INVALID' ? undefined : parsed.value.ticker);
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
    return res(200, { status: 'NOT_AVAILABLE', reason: 'NO_RECORD', ticker: ticker });
  }

  let record;
  try { record = JSON.parse(raw); } catch (_) {
    return res(200, { status: 'DEGRADED', reason: 'STORE_RECORD_INVALID', ticker: ticker });
  }
  if (!validateRecord(record).ok || record.ticker !== ticker) {
    return res(200, { status: 'DEGRADED', reason: 'STORE_RECORD_INVALID', ticker: ticker });
  }

  return res(200, project(ticker, record));
};
