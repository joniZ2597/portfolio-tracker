'use strict';

const { cikKey, companyKey, STORE_NAME, readRecord, sanitizeReadError } = require('./evidence-store');
const {
  validateWritePayload,
  buildCanonicalCompanyJSON,
  buildCanonicalMappingJSON,
  isIdentical
} = require('./evidence-writer');

const STRONG = { consistency: 'strong' };

exports.handler = async function (event) {
  const method = event && event.httpMethod;

  // OPTIONS before gate — always respond
  // EG-20C-6B: no body field on the 204 — it is a null-body status and the
  // modern-runtime wrapper must not build a Response body for it.
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: cors() };
  }

  // Feature gate
  if (process.env.PT_ENABLE_SEC_EVIDENCE_STORE_WRITER_SERVER !== 'true') {
    return res(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
  }

  // Method guard
  if (method !== 'POST') {
    return res(405, { status: 'METHOD_NOT_ALLOWED', reason: 'METHOD_NOT_ALLOWED' });
  }

  // Write-token check (before body parse / store access)
  const expectedToken = process.env.PT_SEC_EVIDENCE_STORE_WRITE_TOKEN;
  if (!expectedToken) {
    return res(401, { status: 'UNAUTHORIZED', reason: 'UNAUTHORIZED' });
  }
  const authHeader = (event && event.headers && event.headers['authorization']) || '';
  if (authHeader !== 'Bearer ' + expectedToken) {
    return res(401, { status: 'UNAUTHORIZED', reason: 'UNAUTHORIZED' });
  }

  // Body parse (after token check)
  const body = parseBody(event && event.body);
  if (!body.ok) {
    return res(400, { status: 'INVALID_JSON', reason: 'INVALID_JSON' });
  }

  // Payload validation (strict — no normalization)
  const payload = validateWritePayload(body.value);
  if (!payload.ok) {
    return res(400, { status: payload.reason, reason: payload.reason });
  }
  const { ticker, cik, projectedItems } = payload;

  // Store acquisition (after validation)
  // EG-20C-6C: sanitized fixed-vocabulary diagnostics in the envelope only — no
  // store handle exists here, so no read or write has occurred (fail-closed).
  let store;
  try {
    store = acquireStore(event);
  } catch (err) {
    return res(200, {
      status: 'DEGRADED',
      reason: 'STORE_UNAVAILABLE',
      stage: 'STORE_ACQUISITION',
      writeAttempted: false,
      ...sanitizeReadError(err)
    });
  }

  const canonicalCompanyJSON = buildCanonicalCompanyJSON(projectedItems);
  const canonicalMappingJSON = buildCanonicalMappingJSON(cik);

  // ── Step 10: read cikKey(ticker) with consistency:'strong' ─────────────────
  // EG-20C-3: wantDiag=true — DEGRADED carries sanitized fixed-vocabulary
  // diagnostics in the envelope only (no console logging, no retry, no write).
  const step10 = await readRecord(store, cikKey(ticker), STRONG, true);

  if (step10.state === 'DEGRADED') {
    return res(200, {
      status: 'DEGRADED',
      reason: 'STRONG_PRE_READ_FAILURE',
      stage: 'MAPPING_PRE_READ',
      writeAttempted: false,
      ...(step10.diag || { errorName: 'UnknownError' })
    });
  }
  if (step10.state === 'INVALID') {
    return res(409, { status: 'CONFLICT', reason: 'STORE_INVALID_CONFLICT' });
  }

  let mappingState;
  if (step10.state === 'MISSING') {
    mappingState = 'MISSING';
  } else {
    // OK — field-level schema guard: cik must be a valid 10-digit string
    const storedCik = step10.value && step10.value.cik;
    if (typeof storedCik !== 'string' || !/^\d{10}$/.test(storedCik)) {
      return res(409, { status: 'CONFLICT', reason: 'STORE_INVALID_CONFLICT' });
    }
    if (storedCik !== cik) {
      return res(409, { status: 'CONFLICT', reason: 'CIK_MISMATCH', storedCik, inboundCik: cik });
    }
    mappingState = 'SAME_CIK';
  }

  // ── Step 11: read companyKey(cik) with consistency:'strong' ────────────────
  const step11 = await readRecord(store, companyKey(cik), STRONG, true);

  if (step11.state === 'DEGRADED') {
    return res(200, {
      status: 'DEGRADED',
      reason: 'STRONG_PRE_READ_FAILURE',
      stage: 'COMPANY_PRE_READ',
      writeAttempted: false,
      ...(step11.diag || { errorName: 'UnknownError' })
    });
  }
  if (step11.state === 'INVALID') {
    return res(409, { status: 'CONFLICT', reason: 'STORE_INVALID_CONFLICT' });
  }

  // ── Step 10/11 decision table ──────────────────────────────────────────────
  // Only MISSING+MISSING may proceed to Step 12.
  if (mappingState === 'MISSING') {
    if (step11.state !== 'MISSING') {
      // company exists but mapping is absent — orphaned company record
      return res(409, { status: 'CONFLICT', reason: 'COMPANY_CONFLICT' });
    }
    // MISSING + MISSING → fall through to Step 12
  } else {
    // mappingState === 'SAME_CIK'
    if (step11.state === 'MISSING') {
      // mapping present but company absent — orphaned mapping
      return res(409, { status: 'CONFLICT', reason: 'ORPHAN_STATE' });
    }
    // step11.state === 'OK'
    // schema guard before identity comparison: evidenceItems must be an array
    if (!step11.value || !Array.isArray(step11.value.evidenceItems)) {
      return res(409, { status: 'CONFLICT', reason: 'STORE_INVALID_CONFLICT' });
    }
    if (isIdentical(step11, canonicalCompanyJSON, 'company')) {
      // Already stored — idempotent success
      return res(200, {
        status: 'STORE_WRITE_NOOP',
        ticker,
        cik,
        evidenceItemCount: projectedItems.length
      });
    }
    // Company exists but differs from what we would write
    return res(409, { status: 'CONFLICT', reason: 'MAPPING_VERIFY_CONFLICT' });
  }

  // ── Step 12: set(companyKey, canonicalCompanyJSON, { onlyIfNew: true }) ────
  // Only reached when mappingState=MISSING and company=MISSING.
  let companySet;
  try {
    companySet = await store.set(companyKey(cik), canonicalCompanyJSON, { onlyIfNew: true });
  } catch (_) {
    return res(200, { status: 'DEGRADED', reason: 'COMPANY_WRITE_FAILURE' });
  }
  if (!companySet || typeof companySet !== 'object') {
    return res(200, { status: 'DEGRADED', reason: 'COMPANY_WRITE_FAILURE' });
  }
  if (companySet.modified === false) {
    // Concurrent create raced us; no mapping write
    return res(409, { status: 'CONFLICT', reason: 'CONCURRENT_CREATE' });
  }
  if (companySet.modified !== true) {
    return res(200, { status: 'DEGRADED', reason: 'COMPANY_WRITE_FAILURE' });
  }

  // ── Step 13: set(cikKey, canonicalMappingJSON, { onlyIfNew: true }) ────────
  let mappingSet;
  try {
    mappingSet = await store.set(cikKey(ticker), canonicalMappingJSON, { onlyIfNew: true });
  } catch (_) {
    return res(200, { status: 'DEGRADED', reason: 'MAPPING_WRITE_FAILURE' });
  }
  if (!mappingSet || typeof mappingSet !== 'object') {
    return res(200, { status: 'DEGRADED', reason: 'MAPPING_WRITE_FAILURE' });
  }
  if (mappingSet.modified === true) {
    return res(200, { status: 'STORE_WRITE', ticker, cik, evidenceItemCount: projectedItems.length });
  }
  if (mappingSet.modified !== false) {
    return res(200, { status: 'DEGRADED', reason: 'MAPPING_WRITE_FAILURE' });
  }

  // ── Step 13b: mapping set returned unmodified — verify existing records ────
  const mappingR = await readRecord(store, cikKey(ticker), STRONG);

  if (mappingR.state === 'INVALID') {
    return res(409, { status: 'CONFLICT', reason: 'STORE_INVALID_CONFLICT' });
  }
  if (mappingR.state === 'MISSING' || mappingR.state === 'DEGRADED') {
    return res(200, { status: 'DEGRADED', reason: 'MAPPING_VERIFY_FAILURE' });
  }
  // OK — field-level schema guard
  const storedCik13b = mappingR.value && mappingR.value.cik;
  if (typeof storedCik13b !== 'string' || !/^\d{10}$/.test(storedCik13b)) {
    return res(409, { status: 'CONFLICT', reason: 'STORE_INVALID_CONFLICT' });
  }
  if (storedCik13b !== cik) {
    return res(409, {
      status: 'CONFLICT',
      reason: 'MAPPING_CONCURRENT_CREATE',
      storedCik: storedCik13b,
      inboundCik: cik
    });
  }

  // Same CIK — read company strong
  const companyR = await readRecord(store, companyKey(cik), STRONG);

  if (companyR.state === 'DEGRADED') {
    return res(200, { status: 'DEGRADED', reason: 'MAPPING_VERIFY_FAILURE' });
  }
  if (companyR.state === 'MISSING' || companyR.state === 'INVALID') {
    return res(409, { status: 'CONFLICT', reason: 'MAPPING_VERIFY_CONFLICT' });
  }
  // OK — schema guard before identity comparison
  if (!companyR.value || !Array.isArray(companyR.value.evidenceItems)) {
    return res(409, { status: 'CONFLICT', reason: 'STORE_INVALID_CONFLICT' });
  }
  if (!isIdentical(companyR, canonicalCompanyJSON, 'company')) {
    return res(409, { status: 'CONFLICT', reason: 'MAPPING_VERIFY_CONFLICT' });
  }

  return res(200, {
    status: 'STORE_WRITE_PARTIAL_VERIFIED',
    ticker,
    cik,
    evidenceItemCount: projectedItems.length
  });
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function res(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...cors() },
    body: JSON.stringify(body)
  };
}

function parseBody(rawBody) {
  if (typeof rawBody !== 'string' || rawBody.trim() === '') return { ok: false };
  let parsed;
  try { parsed = JSON.parse(rawBody); } catch (_) { return { ok: false }; }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false };
  return { ok: true, value: parsed };
}

// EG-20C-6B: modern-runtime ambient store acquisition — the runtime injects
// the Blobs environment (including the strong-consistency endpoint), so no
// manual context wiring is needed or allowed here.
function acquireStore(event) {
  if (event && event._testStore) { return event._testStore; }
  const { getStore } = require('@netlify/blobs');
  return getStore(STORE_NAME);
}
