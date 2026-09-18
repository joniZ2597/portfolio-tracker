'use strict';

/*
 * netlify/functions/tradingview-webhook.js
 *
 * TradingView alert-webhook ingestion endpoint (v1 pilot, work/tradingview-alerts/brief.md).
 *
 * TradingView alert -> HTTPS webhook -> parse JSON -> validate shared secret from the
 * request body -> validate payload -> normalize into an internal event -> persist the
 * minimal event -> respond promptly (TradingView cancels requests that take longer than
 * 3 seconds to respond). Ingestion only — no downstream network calls, no scoring,
 * research, news-catalysts, portfolio-state, or recommendation path is touched here.
 *
 * Every request goes through the locked preflight order in
 * tradingview-webhook-preflight.js — no HTTP-method special-case (e.g. no OPTIONS
 * bypass): TradingView's webhook delivery is server-to-server, not browser-originated,
 * so no CORS preflight is part of this flow.
 *
 * Storage: single `store.setJSON(receiptId, event)` write into a new, dedicated store
 * (`tradingview-events-store`) — matching the `portfolio-sync.js` precedent, not the
 * heavier read-verify-write sequence used by `sec-evidence-store-writer-core.js` (not
 * required for this pilot's correctness needs).
 */

const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');
const { evaluateTradingViewWebhookPreflight } = require('./lib/tradingview-webhook-preflight');

const STORE_NAME = 'tradingview-events-store';

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json'
};

// Fixed reason -> HTTP status mapping, following the repo's established convention
// (sec-evidence-store-writer-core.js / portfolio-sync.js): a disabled feature is not
// itself an error (200 DISABLED); server misconfiguration is the server's fault, not
// the caller's (500, matching portfolio-sync.js's CONFIGURATION_MISSING precedent);
// everything else maps to the conventional HTTP status for that failure class.
const REASON_STATUS = {
  SERVER_DISABLED: 200,
  METHOD_NOT_ALLOWED: 405,
  SERVER_CONFIG_ERROR: 500,
  MALFORMED_REQUEST: 400,
  UNAUTHORIZED: 401,
  INVALID_PAYLOAD: 400
};

function json(statusCode, status, extra) {
  return {
    statusCode: statusCode,
    headers: RESPONSE_HEADERS,
    body: JSON.stringify(Object.assign({ status: status }, extra || {}))
  };
}

// Test seam (mirrors sec-evidence-store-writer-core.js's acquireStore): an injected
// event._testStore is used in place of a real Blobs handle so offline QA can exercise
// storage-failure and no-mutation coverage without constructing @netlify/blobs. In
// production event._testStore is never set, so this is always getStore(STORE_NAME).
function acquireStore(event) {
  if (event && event._testStore) { return event._testStore; }
  return getStore(STORE_NAME);
}

exports.handler = async function (event) {
  // Every request — including OPTIONS — goes through the locked preflight order:
  // (1) server gate, (2) method must be POST, (3) server token, (4) body, (5) secret,
  // (6) payload. No special-cased bypass for any HTTP method.
  const preflight = evaluateTradingViewWebhookPreflight({
    env: process.env,
    method: event.httpMethod,
    body: event.body,
    nowMs: Date.now(),
    receiptId: crypto.randomUUID()
  });

  if (!preflight.ok) {
    const statusCode = REASON_STATUS[preflight.reason] || 400;
    return json(statusCode, preflight.reason, { reason: preflight.reason });
  }

  // connectLambda injects the Blobs context that legacy Lambda functions do not
  // receive ambiently. Run after gate + auth + validation, before any getStore();
  // guarded by event.blobs so an absent context falls through to the existing path
  // (mirrors netlify/functions/portfolio-sync.js).
  if (event.blobs) {
    try {
      connectLambda(event);
    } catch (error) {
      console.error('tradingview-webhook blobs context init failed', {
        message: error && error.message ? error.message : 'unknown'
      });
      return json(500, 'SERVER_ERROR');
    }
  }

  try {
    const store = acquireStore(event);
    await store.setJSON(preflight.event.receiptId, preflight.event);
  } catch (error) {
    console.error('tradingview-webhook write failed', {
      message: error && error.message ? error.message : 'unknown'
    });
    return json(500, 'SERVER_ERROR');
  }

  return json(200, 'OK', { receiptId: preflight.event.receiptId });
};
