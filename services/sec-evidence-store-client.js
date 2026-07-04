'use strict';

/**
 * services/sec-evidence-store-client.js
 *
 * EG-20C-4B-1: pure, inert client adapter for the dormant sec-evidence-store
 * lookup Netlify function. Read-only consumer contract — the endpoint never
 * writes, and this adapter only issues the single POST the caller explicitly
 * requests. No auto-invocation at load; no storage, DOM, or app-state access.
 *
 * Future EG-20C-4B UI slices must guard invocations behind a strict
 * client-side boolean feature gate (not persisted, reset on reload). The gate
 * is intentionally not embedded here so this stays a pure, environment-free
 * function (matching services/research-evidence-client.js).
 *
 * Server contract: POST /.netlify/functions/sec-evidence-store
 *   request  : { ticker, categories } — categories fixed to ['sec10q'] here;
 *              callers cannot override or extend them.
 *   response : STORE_HIT envelope (evidenceItems + non-scoring invariants),
 *              or a STORE_MISS / STORE_INVALID / DEGRADED / DISABLED body.
 *
 * Evidence is a non-scoring sidecar: items are passed through verbatim and
 * never converted into a score, rank, or confidence. Any item violating the
 * non-scoring invariants (scoringImpact 'none', requiresVerification true,
 * confidence null) rejects the whole response as CLIENT_INVALID_RESPONSE.
 */

var SEC_EVIDENCE_STORE_ENDPOINT = '/.netlify/functions/sec-evidence-store';
var SEC_EVIDENCE_STORE_TIMEOUT_MS = 12000;

// Fixed category list — frozen so not even the exported binding can be used
// to change future request bodies. The store supports exactly sec10q in v1.
var SEC_EVIDENCE_STORE_CATEGORIES = Object.freeze(['sec10q']);

// Server-originated status values that are passed through (after validation).
var SEC_STORE_SERVER_STATUSES = ['STORE_HIT', 'STORE_MISS', 'STORE_INVALID', 'DEGRADED', 'DISABLED'];

// Fixed reason vocabulary for DEGRADED — only bodies the server actually
// emits are accepted; any other recognized-status body is malformed.
var SEC_STORE_DEGRADED_REASONS = ['STORE_UNAVAILABLE', 'STORE_READ_FAILURE'];

// Mirrors the server-side ticker rule after trim + uppercase.
var SEC_STORE_TICKER_PATTERN = /^[A-Z]{1,10}$/;

var SEC_STORE_DIRECTIONS = ['positive', 'neutral', 'negative'];

function _sesNormalizeTicker(value) {
  if (typeof value !== 'string') { return null; }
  var ticker = value.trim().toUpperCase();
  return SEC_STORE_TICKER_PATTERN.test(ticker) ? ticker : null;
}

// sourceUrl must be null/undefined or an absolute https URL with no
// whitespace, no embedded credentials, and a non-empty host.
function _sesValidSourceUrl(value) {
  if (value === null || value === undefined) { return true; }
  if (typeof value !== 'string' || value.length > 2048 || /\s/.test(value)) { return false; }
  var url;
  try { url = new URL(value); } catch (_) { return false; }
  return url.protocol === 'https:' && !url.username && !url.password && Boolean(url.hostname);
}

function _sesOptionalString(value) {
  return value === null || value === undefined || typeof value === 'string';
}

// Response categories must be exactly ['sec10q'] — the same fixed list this
// adapter sends. Extra, missing, or substituted categories are a mismatch.
function _sesCategoriesExact(value) {
  return Array.isArray(value) && value.length === 1 && value[0] === 'sec10q';
}

// A STORE_HIT evidence item is accepted only when every non-scoring invariant
// holds. Any violation rejects the whole response — evidence renders
// all-or-nothing, never partially.
function _sesValidItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) { return false; }
  if (item.scoringImpact !== 'none') { return false; }
  if (item.requiresVerification !== true) { return false; }
  if (item.confidence !== null) { return false; }
  if (SEC_STORE_DIRECTIONS.indexOf(item.direction) === -1) { return false; }
  if (typeof item.evidenceId !== 'string' || item.evidenceId.length < 1) { return false; }
  if (item.category !== 'sec10q') { return false; }
  if (typeof item.claim !== 'string' || item.claim.length < 1) { return false; }
  if (!_sesValidSourceUrl(item.sourceUrl)) { return false; }
  if (!_sesOptionalString(item.sourceLabel)) { return false; }
  if (!_sesOptionalString(item.sourceDate)) { return false; }
  if (!_sesOptionalString(item.sourceType)) { return false; }
  return true;
}

/**
 * Pure normalizer: maps an HTTP status + raw response text into a single
 * discriminated result object with a closed status set. Never throws and
 * never mutates the parsed payload — STORE_HIT items are passed verbatim.
 *
 * expectedTicker is the normalized ticker that was actually requested;
 * envelope responses (STORE_HIT / STORE_MISS / STORE_INVALID) must echo it
 * exactly, and their categories must be exactly ['sec10q'], or the response
 * is rejected as CLIENT_INVALID_RESPONSE (request/response correlation).
 *
 * Closed result taxonomy:
 *   STORE_HIT | STORE_MISS | STORE_INVALID | DEGRADED | DISABLED
 *   | CLIENT_INVALID_RESPONSE | CLIENT_HTTP_ERROR
 * (CLIENT_INVALID_INPUT / CLIENT_TIMEOUT / CLIENT_FETCH_ERROR are produced
 *  by requestSecEvidenceStoreLookup before/around transport.)
 */
function normalizeSecEvidenceStoreResponse(httpStatus, rawText, expectedTicker) {
  var ok2xx = typeof httpStatus === 'number' && httpStatus >= 200 && httpStatus < 300;

  function unreadable() {
    // A body we cannot classify: on a non-2xx transport the transport error
    // wins (e.g. gateway error pages, server 400/405 validation bodies);
    // on a 2xx transport it is an invalid response.
    return ok2xx
      ? { status: 'CLIENT_INVALID_RESPONSE', httpStatus: httpStatus }
      : { status: 'CLIENT_HTTP_ERROR', httpStatus: httpStatus };
  }

  var parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (_) {
    return unreadable();
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.status !== 'string') {
    return unreadable();
  }

  var status = parsed.status;

  if (SEC_STORE_SERVER_STATUSES.indexOf(status) === -1) {
    return unreadable();
  }

  // Every recognized status is contract-bound to HTTP 200. A recognized
  // status on a non-2xx transport is a status/body mismatch.
  if (!ok2xx) {
    return { status: 'CLIENT_INVALID_RESPONSE', httpStatus: httpStatus };
  }

  // DISABLED is only ever emitted by the dormant server as SERVER_DISABLED;
  // DEGRADED only with one of the two fixed store-failure reasons. Anything
  // else shaped like a recognized status is a malformed response.
  if (status === 'DISABLED') {
    if (parsed.reason !== 'SERVER_DISABLED') {
      return { status: 'CLIENT_INVALID_RESPONSE', httpStatus: httpStatus };
    }
    return { status: 'DISABLED', reason: 'SERVER_DISABLED', httpStatus: httpStatus };
  }

  if (status === 'DEGRADED') {
    if (SEC_STORE_DEGRADED_REASONS.indexOf(parsed.reason) === -1) {
      return { status: 'CLIENT_INVALID_RESPONSE', httpStatus: httpStatus };
    }
    return { status: 'DEGRADED', reason: parsed.reason, httpStatus: httpStatus };
  }

  // STORE_HIT / STORE_MISS / STORE_INVALID share the ticker+categories
  // envelope, and both fields must correlate with what was requested:
  // ticker exactly equal to the normalized requested ticker, categories
  // exactly the fixed ['sec10q'] list.
  if (typeof parsed.ticker !== 'string' || parsed.ticker !== expectedTicker) {
    return { status: 'CLIENT_INVALID_RESPONSE', httpStatus: httpStatus };
  }
  if (!_sesCategoriesExact(parsed.categories)) {
    return { status: 'CLIENT_INVALID_RESPONSE', httpStatus: httpStatus };
  }

  if (status === 'STORE_MISS' || status === 'STORE_INVALID') {
    return {
      status: status,
      ticker: parsed.ticker,
      categories: parsed.categories,
      httpStatus: httpStatus
    };
  }

  // STORE_HIT: fixed envelope fields + per-item non-scoring invariants.
  if (parsed.provider !== 'sec_evidence_store' || parsed.cacheStatus !== 'STORE_HIT') {
    return { status: 'CLIENT_INVALID_RESPONSE', httpStatus: httpStatus };
  }
  if (parsed.scoringImpact !== 'none' || !Array.isArray(parsed.evidenceItems)) {
    return { status: 'CLIENT_INVALID_RESPONSE', httpStatus: httpStatus };
  }

  for (var i = 0; i < parsed.evidenceItems.length; i += 1) {
    if (!_sesValidItem(parsed.evidenceItems[i])) {
      return { status: 'CLIENT_INVALID_RESPONSE', httpStatus: httpStatus };
    }
  }

  // Pass server fields through verbatim. evidenceItems is the parsed array
  // itself — never copied, filtered, reordered, or annotated. An empty array
  // is a valid STORE_HIT and stays distinguishable from STORE_MISS by status.
  return {
    status: 'STORE_HIT',
    httpStatus: httpStatus,
    ticker: parsed.ticker,
    categories: parsed.categories,
    provider: 'sec_evidence_store',
    cacheStatus: 'STORE_HIT',
    evidenceItems: parsed.evidenceItems,
    scoringImpact: 'none'
  };
}

/**
 * requestSecEvidenceStoreLookup({ ticker }, deps?) -> Promise<Result>
 *
 * deps (all optional; used by offline tests):
 *   { fetchImpl, timeoutMs }
 *
 * The request body is always { ticker, categories: ['sec10q'] } — any
 * categories supplied on the input object are ignored. Invalid input
 * short-circuits with CLIENT_INVALID_INPUT and sends no request.
 * Network/transport failures map to synthetic CLIENT_* statuses. Never throws.
 */
function requestSecEvidenceStoreLookup(input, deps) {
  var options = deps || {};
  var timeoutMs = (typeof options.timeoutMs === 'number' && options.timeoutMs > 0)
    ? options.timeoutMs
    : SEC_EVIDENCE_STORE_TIMEOUT_MS;

  var src = (input && typeof input === 'object') ? input : {};
  var ticker = _sesNormalizeTicker(src.ticker);
  if (ticker === null) {
    // No request is attempted for invalid input.
    return Promise.resolve({ status: 'CLIENT_INVALID_INPUT', reason: 'TICKER' });
  }

  var doFetch = options.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (typeof doFetch !== 'function') {
    return Promise.resolve({ status: 'CLIENT_FETCH_ERROR' });
  }

  var controller = (typeof AbortController === 'function') ? new AbortController() : null;
  var timer = null;
  if (controller) {
    timer = setTimeout(function () { controller.abort(); }, timeoutMs);
  }

  var requestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker: ticker, categories: SEC_EVIDENCE_STORE_CATEGORIES })
  };
  if (controller) {
    requestInit.signal = controller.signal;
  }

  return Promise.resolve()
    .then(function () { return doFetch(SEC_EVIDENCE_STORE_ENDPOINT, requestInit); })
    .then(function (response) {
      var httpStatus = (response && typeof response.status === 'number') ? response.status : 0;
      return Promise.resolve(response.text()).then(function (text) {
        return normalizeSecEvidenceStoreResponse(httpStatus, text, ticker);
      });
    })
    .catch(function (err) {
      if (err && err.name === 'AbortError') {
        return { status: 'CLIENT_TIMEOUT' };
      }
      return { status: 'CLIENT_FETCH_ERROR' };
    })
    .then(function (result) {
      if (timer) { clearTimeout(timer); }
      return result;
    });
}

// Dual export guard: CommonJS for offline Node tests; when this file is later
// inlined into the browser app, `module` is undefined and the guard is
// skipped, leaving the functions available in scope (matching the
// services/research-evidence-client.js inlining pattern).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SEC_EVIDENCE_STORE_ENDPOINT: SEC_EVIDENCE_STORE_ENDPOINT,
    SEC_EVIDENCE_STORE_TIMEOUT_MS: SEC_EVIDENCE_STORE_TIMEOUT_MS,
    SEC_EVIDENCE_STORE_CATEGORIES: SEC_EVIDENCE_STORE_CATEGORIES,
    requestSecEvidenceStoreLookup: requestSecEvidenceStoreLookup,
    normalizeSecEvidenceStoreResponse: normalizeSecEvidenceStoreResponse
  };
}
