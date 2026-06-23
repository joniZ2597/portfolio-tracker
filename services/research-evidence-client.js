'use strict';

/**
 * services/research-evidence-client.js
 *
 * Inert client adapter for the dormant research-evidence Netlify function.
 *
 * EG-20E-1 scope: adapter + offline tests ONLY. This module is pure and inert:
 *   - it is NOT inlined into index.html yet (no live call site exists)
 *   - it registers no event listener, no startup hook, and starts no timer at load
 *   - it touches no DOM, no browser persistence, no app state, no scoring path
 *   - it performs NO network request unless a caller invokes it; the offline
 *     tests always inject a fake fetch via deps.fetchImpl, so no live request
 *     is ever made during validation
 *
 * Future EG-20E-2 call sites must guard invocations behind a strict
 * client-side boolean feature gate (not persisted, reset on reload). The gate
 * is intentionally not embedded here so this stays a pure, environment-free
 * function.
 *
 * Server contract: POST /.netlify/functions/research-evidence
 *   request  : { ticker, categories }
 *   response : non-scoring evidence sidecar (status OK + results/provenance,
 *              or a DISABLED / NOT_INVOKED / ERROR control body)
 *
 * Evidence is a non-scoring sidecar: provenance and per-item flags are passed
 * through verbatim and are never converted into a score, rank, or confidence.
 */

var RESEARCH_EVIDENCE_ENDPOINT = '/.netlify/functions/research-evidence';
var RESEARCH_EVIDENCE_TIMEOUT_MS = 12000;

// Fixed category allow-list. No free-text categories are accepted. Each value
// also satisfies the server-side category pattern /^[a-z][a-z0-9_]{0,31}$/.
var RESEARCH_EVIDENCE_CATEGORIES = ['earnings', 'guidance', 'valuation', 'sec10q'];

// Server-originated status values that are passed through unchanged.
var SERVER_STATUSES = ['OK', 'DISABLED', 'NOT_INVOKED', 'ERROR'];

// Mirrors the server-side ticker rule after trim + uppercase.
var TICKER_PATTERN = /^[A-Z]{1,10}$/;

/**
 * Validate and normalize caller input. Returns either
 *   { ok: true, ticker, categories } with a normalized ticker + deduped list, or
 *   { ok: false, reason: 'TICKER' | 'CATEGORIES' }.
 */
function _validateInput(input) {
  var src = (input && typeof input === 'object') ? input : {};

  if (typeof src.ticker !== 'string') {
    return { ok: false, reason: 'TICKER' };
  }
  var ticker = src.ticker.trim().toUpperCase();
  if (!TICKER_PATTERN.test(ticker)) {
    return { ok: false, reason: 'TICKER' };
  }

  if (!Array.isArray(src.categories) || src.categories.length < 1 || src.categories.length > 10) {
    return { ok: false, reason: 'CATEGORIES' };
  }

  var categories = [];
  for (var i = 0; i < src.categories.length; i += 1) {
    var item = src.categories[i];
    if (typeof item !== 'string') {
      return { ok: false, reason: 'CATEGORIES' };
    }
    var category = item.trim();
    if (RESEARCH_EVIDENCE_CATEGORIES.indexOf(category) === -1) {
      return { ok: false, reason: 'CATEGORIES' };
    }
    if (categories.indexOf(category) === -1) {
      categories.push(category);
    }
  }

  return { ok: true, ticker: ticker, categories: categories };
}

/**
 * Pure normalizer: maps an HTTP status + raw response text into a single
 * discriminated result object. Never throws.
 */
function normalizeResearchEvidenceResponse(httpStatus, rawText) {
  var parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (_) {
    return { status: 'CLIENT_INVALID_RESPONSE', httpStatus: httpStatus };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { status: 'CLIENT_INVALID_RESPONSE', httpStatus: httpStatus };
  }

  var status = parsed.status;
  if (typeof status !== 'string') {
    return { status: 'CLIENT_INVALID_RESPONSE', httpStatus: httpStatus };
  }

  if (SERVER_STATUSES.indexOf(status) === -1) {
    // Unrecognized status string: treat a non-2xx transport as an HTTP error,
    // otherwise as an invalid response body.
    if (typeof httpStatus === 'number' && (httpStatus < 200 || httpStatus >= 300)) {
      return { status: 'CLIENT_HTTP_ERROR', httpStatus: httpStatus };
    }
    return { status: 'CLIENT_INVALID_RESPONSE', httpStatus: httpStatus };
  }

  if (status === 'OK') {
    var okValid = parsed.schemaVersion === 1 &&
      Array.isArray(parsed.results) &&
      parsed.provenance && typeof parsed.provenance === 'object' && !Array.isArray(parsed.provenance);
    if (!okValid) {
      return { status: 'CLIENT_INVALID_RESPONSE', httpStatus: httpStatus };
    }
    // Pass server fields through verbatim. Evidence, provenance and cacheStatus
    // are never transformed here.
    return {
      status: 'OK',
      httpStatus: httpStatus,
      schemaVersion: parsed.schemaVersion,
      ticker: parsed.ticker,
      categories: parsed.categories,
      requestId: parsed.requestId,
      cacheStatus: parsed.cacheStatus,
      results: parsed.results,
      provenance: parsed.provenance,
      servedAt: parsed.servedAt
    };
  }

  // DISABLED | NOT_INVOKED | ERROR control bodies.
  return {
    status: status,
    reason: (typeof parsed.reason === 'string') ? parsed.reason : null,
    httpStatus: httpStatus
  };
}

/**
 * requestResearchEvidence({ ticker, categories }, deps?) -> Promise<Result>
 *
 * deps (all optional; used by offline tests):
 *   { fetchImpl, timeoutMs }
 *
 * Invalid input short-circuits with CLIENT_INVALID_INPUT and sends no request.
 * Network/transport failures map to synthetic CLIENT_* statuses. Never throws.
 */
function requestResearchEvidence(input, deps) {
  var options = deps || {};
  var timeoutMs = (typeof options.timeoutMs === 'number' && options.timeoutMs > 0)
    ? options.timeoutMs
    : RESEARCH_EVIDENCE_TIMEOUT_MS;

  var validated = _validateInput(input);
  if (!validated.ok) {
    // No request is attempted for invalid input.
    return Promise.resolve({ status: 'CLIENT_INVALID_INPUT', reason: validated.reason });
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
    body: JSON.stringify({ ticker: validated.ticker, categories: validated.categories })
  };
  if (controller) {
    requestInit.signal = controller.signal;
  }

  return Promise.resolve()
    .then(function () { return doFetch(RESEARCH_EVIDENCE_ENDPOINT, requestInit); })
    .then(function (response) {
      var httpStatus = (response && typeof response.status === 'number') ? response.status : 0;
      return Promise.resolve(response.text()).then(function (text) {
        return normalizeResearchEvidenceResponse(httpStatus, text);
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
// inlined into the browser app, `module` is undefined and the guard is skipped,
// leaving the functions available in scope (matching the services/history.js
// inlining pattern).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RESEARCH_EVIDENCE_ENDPOINT: RESEARCH_EVIDENCE_ENDPOINT,
    RESEARCH_EVIDENCE_TIMEOUT_MS: RESEARCH_EVIDENCE_TIMEOUT_MS,
    RESEARCH_EVIDENCE_CATEGORIES: RESEARCH_EVIDENCE_CATEGORIES,
    requestResearchEvidence: requestResearchEvidence,
    normalizeResearchEvidenceResponse: normalizeResearchEvidenceResponse
  };
}
