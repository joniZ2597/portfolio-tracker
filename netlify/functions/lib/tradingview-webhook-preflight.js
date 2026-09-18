'use strict';

/*
 * netlify/functions/lib/tradingview-webhook-preflight.js
 *
 * TradingView alert-webhook ingestion — server preflight / gate / secret / payload
 * validator + event normalizer (PURE, dependency-injected).
 *
 * v1 pilot only (work/tradingview-alerts/brief.md): TradingView alert -> HTTPS webhook
 * -> parse JSON -> validate shared secret from the request body -> validate payload ->
 * normalize into an internal event. Ingestion only; nothing downstream. This module
 * reads NO variable from the runtime environment, opens no network, constructs no
 * persistence handle, generates no clock/random value internally, and does not
 * reference or extend any other domain's preflight lib or token list (it owns
 * validation of its own env configuration entirely). Every input — including the
 * current time and the storage-record id — is injected by the caller, which reads the
 * runtime environment once at the boundary and proceeds to persistence only on
 * { ok: true }.
 *
 * TradingView's official webhook documentation provides no supported mechanism for
 * user-configurable custom HTTP headers and documents no HMAC/signature mechanism, so
 * the shared secret travels inside the JSON message body (a `secret` field), not as an
 * Authorization header.
 *
 * Contract (frozen by qa/tradingview_webhook_preflight_offline.js):
 *   evaluateTradingViewWebhookPreflight({ env, method, body, nowMs, receiptId })
 *     -> { ok: true, event: {...} }   (see buildNormalizedEvent; exact key set)
 *      | { ok: false, reason }        (exact key set; reason in fixed vocab)
 *
 * Fixed failure vocabulary (first failure wins; the evaluation order below):
 *   SERVER_DISABLED, METHOD_NOT_ALLOWED, SERVER_CONFIG_ERROR, MALFORMED_REQUEST,
 *   UNAUTHORIZED, INVALID_PAYLOAD.
 */

// Env key names. Held as plain string literals — NOT process.env reads.
const GATE_KEY = 'PT_ENABLE_TRADINGVIEW_WEBHOOK_SERVER';
const TOKEN_KEY = 'PT_TRADINGVIEW_WEBHOOK_TOKEN';

const INVALID = Symbol('INVALID');

// evaluateTradingViewWebhookPreflight validates, in fail-closed order, every gate/
// token/config/payload prerequisite for a single TradingView webhook delivery. Only
// { ok: true } may permit the caller to touch persistence. It mutates none of its
// inputs and never logs or echoes the shared secret.
function evaluateTradingViewWebhookPreflight(input) {
  const inp = isObject(input) ? input : {};
  const env = isObject(inp.env) ? inp.env : {};
  const method = inp.method;
  const rawBody = inp.body;
  const nowMs = inp.nowMs;
  const receiptId = inp.receiptId;

  // 1) Server gate (strict string 'true'), checked first before any upstream I/O.
  if (env[GATE_KEY] !== 'true') {
    return fail('SERVER_DISABLED');
  }

  // 2) Method guard.
  if (method !== 'POST') {
    return fail('METHOD_NOT_ALLOWED');
  }

  // 3) Server-side token must exist and be non-empty — checked BEFORE looking at
  //    anything the request supplied. A request `secret` must never be able to
  //    "authenticate" against an absent or empty server-side token.
  const serverToken = env[TOKEN_KEY];
  if (!isNonEmptyString(serverToken)) {
    return fail('SERVER_CONFIG_ERROR');
  }

  // 4) Body must parse as a JSON object.
  const parsed = parseJsonObject(rawBody);
  if (!parsed.ok) {
    return fail('MALFORMED_REQUEST');
  }
  const payload = parsed.value;

  // 5) Shared secret: present (non-empty) AND an exact match against the configured
  //    server token. Missing and mismatch collapse to one reason (no auth oracle).
  const secret = payload.secret;
  if (!isNonEmptyString(secret) || secret !== serverToken) {
    return fail('UNAUTHORIZED');
  }

  // 6) Required payload fields.
  if (!isNonEmptyString(payload.symbol) || !isNonEmptyString(payload.alertType)) {
    return fail('INVALID_PAYLOAD');
  }

  const sourceTimestamp = normalizeOptionalTimestamp(payload.sourceTimestamp);
  if (sourceTimestamp === INVALID) {
    return fail('INVALID_PAYLOAD');
  }

  const price = normalizeOptionalPrice(payload.price);
  if (price === INVALID) {
    return fail('INVALID_PAYLOAD');
  }

  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) {
    return fail('INVALID_PAYLOAD');
  }
  if (!isNonEmptyString(receiptId)) {
    return fail('INVALID_PAYLOAD');
  }

  return {
    ok: true,
    event: buildNormalizedEvent({
      symbol: payload.symbol,
      alertType: payload.alertType,
      sourceTimestamp: sourceTimestamp,
      price: price,
      nowMs: nowMs,
      receiptId: receiptId
    })
  };
}

// buildNormalizedEvent produces the exact, locked v1 shape. No field ever carries the
// shared secret. `receiptId` is caller-injected (fresh per delivery, e.g.
// crypto.randomUUID()) and used only as the storage-record identity — it is NOT
// derived from receivedAt or any payload field, and it is NOT a dedupe/idempotency
// guarantee. v1 makes no dedupe/idempotency promise.
function buildNormalizedEvent(fields) {
  return {
    provider: 'tradingview',
    eventVersion: 1,
    symbol: fields.symbol,
    alertType: fields.alertType,
    sourceTimestamp: fields.sourceTimestamp,
    receivedAt: new Date(fields.nowMs).toISOString(),
    price: fields.price,
    receiptId: fields.receiptId
  };
}

function parseJsonObject(raw) {
  if (typeof raw !== 'string' || raw === '') {
    return { ok: false };
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    return { ok: false };
  }
  if (!isObject(value)) {
    return { ok: false };
  }
  return { ok: true, value: value };
}

function normalizeOptionalTimestamp(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string' || value === '' || Number.isNaN(Date.parse(value))) {
    return INVALID;
  }
  // Normalize to ISO-8601, matching the "sourceTimestamp: ISO-8601 or null" contract —
  // a valid-but-non-ISO input (e.g. an RFC 2822 or other Date.parse-able string) must
  // not pass through unchanged.
  return new Date(value).toISOString();
}

function normalizeOptionalPrice(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return INVALID;
  }
  return value;
}

function fail(reason) {
  return { ok: false, reason: reason };
}
function isObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function isNonEmptyString(v) {
  return typeof v === 'string' && v !== '';
}

module.exports = { evaluateTradingViewWebhookPreflight, buildNormalizedEvent };
