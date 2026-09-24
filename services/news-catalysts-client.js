'use strict';

// S3-M2 — news-catalysts read client (display-only, non-scoring sidecar).
// Canonical logic source. Validation only: this adapter re-derives nothing. It
// calls the news-catalysts-read route and either returns the server's response
// exactly as sent, once it proves that response is the landed protocol, or one
// pinned client result. It never filters, drops, repairs, counts or renames.
//
// Authorities: netlify/functions/lib/news-catalysts-read-core.js (wire protocol)
// and work/s3-catalyst-evidence-surface/D-S3-1-reader-contract.md (per-record
// shape). Mirrors services/fund-facts-read-client.js in structure.

var NEWS_CATALYSTS_READ_ENDPOINT = '/.netlify/functions/news-catalysts-read';
// The route makes up to 31 day-index reads plus one read per listed item.
var NEWS_CATALYSTS_READ_TIMEOUT_MS = 30000;

// Server-side ticker rule (strict; the client trims and uppercases first).
var _NCC_TICKER_RE = /^[A-Z]{1,10}$/;

// Strict UTC-Z instant grammar of the injected clock; group 1 is the UTC date.
var _NCC_INSTANT_RE = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
var _NCC_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
var _NCC_HASH_RE = /^[a-f0-9]{64}$/;

// The read window: the UTC date of asOf and the previous 30 UTC dates.
var _NCC_WINDOW_DAYS = 31;
var _NCC_DAY_MS = 86400000;

// Two contract versions, checked at their own levels and never confused.
var _NCC_READ_CONTRACT_VERSION = 'news-catalysts-read-v1'; // envelope
var _NCC_RECORD_CONTRACT_VERSION = 'news-contract-v1';     // each record

// D-S3-1 constants and closed vocabularies.
var _NCC_PROVIDER = 'j3-news-catalysts@job-model-v1';
var _NCC_SOURCE_TIER = 'perplexity_retrieval';
var _NCC_PROVENANCE = 'retrieval_unverified';
var _NCC_CATEGORIES = [
  'earnings_event',
  'guidance_update',
  'analyst_action',
  'corporate_action',
  'product_customer_partnership',
  'regulatory_legal',
  'other_catalyst'
];
var _NCC_DIRECTIONS = ['positive', 'neutral', 'negative'];
var _NCC_EVENT_TYPES = ['catalyst', 'upcoming_event'];
var _NCC_RELEVANCE_SCOPES = ['company', 'sector', 'market'];

// D-S3-1 §1 — the 19 reader-visible record fields, in persisted order.
var _NCC_RECORD_FIELDS = [
  'ticker',
  'eventDate',
  'category',
  'direction',
  'sourceUrl',
  'normalizedSourceUrl',
  'sourceDomain',
  'provider',
  'retrievedAt',
  'identityHash',
  'provenance',
  'confidence',
  'requiresVerification',
  'scoringImpact',
  'eventType',
  'relevanceScope',
  'subType',
  'sourceTier',
  'contractVersion'
];

// The four envelope shapes, in server literal order.
var _NCC_OK_FIELDS = ['status', 'readContractVersion', 'ticker', 'asOf', 'window', 'records', 'omitted'];
var _NCC_NOT_AVAILABLE_FIELDS = ['status', 'reason', 'ticker', 'asOf', 'window', 'omitted'];
var _NCC_DEGRADED_FIELDS = ['status', 'reason', 'ticker'];
var _NCC_PLAIN_FIELDS = ['status', 'reason'];
var _NCC_WINDOW_FIELDS = ['from', 'to'];

// The 13 server status values, as landed.
var NEWS_CATALYSTS_READ_SERVER_STATUSES = [
  'OK',
  'NOT_AVAILABLE',
  'DEGRADED',
  'DISABLED',
  'INVALID_JSON',
  'INVALID_REQUEST',
  'INVALID_INSTANT',
  'INVALID_TICKER',
  'UNAUTHORIZED',
  'TICKER_NOT_ALLOWED',
  'METHOD_NOT_ALLOWED',
  'CONFIGURATION_MISSING',
  'ERROR'
];

// Exact reason vocabulary for every non-OK server status. With OK this spans
// the 16 valid HTTP + status + reason combinations.
var NEWS_CATALYSTS_READ_ERROR_REASONS = {
  NOT_AVAILABLE: ['NO_RECORD'],
  DEGRADED: ['STORE_UNAVAILABLE', 'STORE_RECORD_INVALID'],
  DISABLED: ['SERVER_DISABLED'],
  INVALID_JSON: ['INVALID_JSON'],
  INVALID_REQUEST: ['UNKNOWN_BODY_KEY'],
  INVALID_INSTANT: ['INSTANT_INVALID'],
  INVALID_TICKER: ['TICKER_INVALID'],
  UNAUTHORIZED: ['UNAUTHORIZED'],
  TICKER_NOT_ALLOWED: ['TICKER_NOT_ALLOWED'],
  METHOD_NOT_ALLOWED: ['METHOD_NOT_ALLOWED'],
  CONFIGURATION_MISSING: ['TOKEN_COLLISION', 'ALLOWLIST_MISSING', 'ALLOWLIST_INVALID'],
  ERROR: ['PREFLIGHT_UNMAPPED']
};

// Exact HTTP pairing for every server status. A body carried on any other HTTP
// status is never treated as the status it claims.
var NEWS_CATALYSTS_READ_HTTP_BY_STATUS = {
  OK: 200,
  NOT_AVAILABLE: 200,
  DEGRADED: 200,
  DISABLED: 200,
  INVALID_JSON: 400,
  INVALID_REQUEST: 400,
  INVALID_INSTANT: 400,
  INVALID_TICKER: 400,
  UNAUTHORIZED: 401,
  TICKER_NOT_ALLOWED: 403,
  METHOD_NOT_ALLOWED: 405,
  CONFIGURATION_MISSING: 500,
  ERROR: 500
};

// Pinned client-side statuses and reasons. Never produced by the server, and
// reason never carries exception text, response fragments, tokens, or
// environment details.
var NEWS_CATALYSTS_READ_CLIENT_REASONS = {
  CLIENT_INVALID_INPUT: ['TICKER_INVALID', 'TOKEN_INVALID', 'ASOF_INVALID'],
  CLIENT_TIMEOUT: ['REQUEST_TIMEOUT'],
  CLIENT_NETWORK_ERROR: ['FETCH_UNAVAILABLE', 'FETCH_FAILED'],
  CLIENT_INVALID_RESPONSE: ['RESPONSE_INVALID']
};

function _nccHas(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

// True only for a string with at least one non-whitespace character.
function _nccIsNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// True only for a plain object whose own keys match expectedKeys exactly:
// same count, same names, same order. Arrays, null, and non-plain objects
// are rejected.
function _nccHasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { return false; }
  if (Object.getPrototypeOf(value) !== Object.prototype) { return false; }
  var actual = Object.keys(value);
  if (actual.length !== expectedKeys.length) { return false; }
  for (var i = 0; i < expectedKeys.length; i++) {
    if (actual[i] !== expectedKeys[i]) { return false; }
  }
  return true;
}

// True only for a non-negative integer.
function _nccIsCount(value) {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 0;
}

// True only for a strict-grammar UTC-Z instant naming a real calendar date and
// a real time of day. Pure parsing of the given text: no clock is read.
function _nccValidInstant(value) {
  if (typeof value !== 'string') { return false; }
  var m = _NCC_INSTANT_RE.exec(value);
  if (!m) { return false; }
  var ms = Date.parse(value);
  if (!isFinite(ms)) { return false; }
  return new Date(ms).toISOString().slice(0, 10) === m[1];
}

// True only for a YYYY-MM-DD string that is a real calendar date.
function _nccValidDate(value) {
  if (typeof value !== 'string' || !_NCC_DATE_RE.test(value)) { return false; }
  var ms = Date.parse(value + 'T00:00:00.000Z');
  return isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

// The UTC date `days` before a valid YYYY-MM-DD date. Pure calendar math.
function _nccDateBefore(date, days) {
  return new Date(Date.parse(date + 'T00:00:00.000Z') - days * _NCC_DAY_MS).toISOString().slice(0, 10);
}

// True only for an https URL string with something after the scheme.
function _nccIsHttpsString(value) {
  return typeof value === 'string' && value.indexOf('https://') === 0 && value.length > 'https://'.length;
}

// True only for a window { from, to } that is exactly the WINDOW_DAYS-date
// span ending on the UTC date of the injected asOf.
function _nccValidWindow(win, asOf) {
  if (!_nccHasExactKeys(win, _NCC_WINDOW_FIELDS)) { return false; }
  if (!_nccValidDate(win.from) || !_nccValidDate(win.to)) { return false; }
  if (win.to !== asOf.slice(0, 10)) { return false; }
  return win.from === _nccDateBefore(win.to, _NCC_WINDOW_DAYS - 1);
}

// True only for a record carrying exactly the 19 frozen D-S3-1 fields, in
// persisted order, every constant at its literal and both conditional-null
// rules holding. contractVersion is checked first, before any other field is
// read. subType is opaque text: only its presence and null rule are checked.
function _nccValidRecord(rec, requestedTicker) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) { return false; }
  if (rec.contractVersion !== _NCC_RECORD_CONTRACT_VERSION) { return false; }
  if (!_nccHasExactKeys(rec, _NCC_RECORD_FIELDS)) { return false; }
  if (rec.ticker !== requestedTicker) { return false; }
  if (typeof rec.eventDate !== 'string' || !_NCC_DATE_RE.test(rec.eventDate)) { return false; }
  if (_NCC_CATEGORIES.indexOf(rec.category) === -1) { return false; }
  if (_NCC_EVENT_TYPES.indexOf(rec.eventType) === -1) { return false; }
  if (rec.eventType === 'catalyst') {
    if (_NCC_DIRECTIONS.indexOf(rec.direction) === -1) { return false; }
  } else if (rec.direction !== null) {
    return false;
  }
  if (!_nccIsHttpsString(rec.sourceUrl) || !_nccIsHttpsString(rec.normalizedSourceUrl)) { return false; }
  if (typeof rec.sourceDomain !== 'string' || rec.sourceDomain === '') { return false; }
  if (rec.provider !== _NCC_PROVIDER) { return false; }
  if (!_nccValidInstant(rec.retrievedAt)) { return false; }
  if (typeof rec.identityHash !== 'string' || !_NCC_HASH_RE.test(rec.identityHash)) { return false; }
  if (rec.provenance !== _NCC_PROVENANCE) { return false; }
  if (rec.confidence !== null) { return false; }
  if (rec.requiresVerification !== true) { return false; }
  if (rec.scoringImpact !== 'none') { return false; }
  if (_NCC_RELEVANCE_SCOPES.indexOf(rec.relevanceScope) === -1) { return false; }
  if (rec.category === 'other_catalyst') {
    if (!_nccIsNonEmptyString(rec.subType)) { return false; }
  } else if (rec.subType !== null) {
    return false;
  }
  return rec.sourceTier === _NCC_SOURCE_TIER;
}

// True only for a complete OK envelope: the exact seven top-level fields in
// order, both contract versions at their own levels, request correlation,
// the exact window, a non-empty records array in which EVERY record is valid,
// and the server's own omitted count. Any failure fails the whole response.
function _nccValidOkEnvelope(body, requestedTicker, requestedAsOf) {
  if (!_nccHasExactKeys(body, _NCC_OK_FIELDS)) { return false; }
  if (body.readContractVersion !== _NCC_READ_CONTRACT_VERSION) { return false; }
  if (body.ticker !== requestedTicker) { return false; }
  if (body.asOf !== requestedAsOf) { return false; }
  if (!_nccValidWindow(body.window, requestedAsOf)) { return false; }
  if (!_nccIsCount(body.omitted)) { return false; }
  if (!Array.isArray(body.records) || body.records.length === 0) { return false; }
  for (var i = 0; i < body.records.length; i++) {
    if (!_nccValidRecord(body.records[i], requestedTicker)) { return false; }
  }
  return true;
}

// True only for a NOT_AVAILABLE envelope: the exact six fields in order, with
// the request correlation, window and the server's omitted count intact.
function _nccValidNotAvailableEnvelope(body, requestedTicker, requestedAsOf) {
  if (!_nccHasExactKeys(body, _NCC_NOT_AVAILABLE_FIELDS)) { return false; }
  if (body.ticker !== requestedTicker) { return false; }
  if (body.asOf !== requestedAsOf) { return false; }
  if (!_nccValidWindow(body.window, requestedAsOf)) { return false; }
  return _nccIsCount(body.omitted);
}

// The single result shape every public function returns. Keys are always in
// this order: kind, status, reason, ticker, envelope. ticker is the
// normalized REQUESTED ticker (never a body echo); it is null only when local
// input validation failed. envelope is non-null only for a validated OK
// response, or for a validated NOT_AVAILABLE response (its metadata is what
// separates "nothing found" from "records existed and were rejected").
function _nccResult(kind, status, reason, ticker, envelope) {
  return { kind: kind, status: status, reason: reason, ticker: ticker, envelope: envelope };
}

// Pure normalizer: maps (httpStatus, rawBodyText) for a request that asked for
// requestedTicker at the injected instant requestedAsOf into the pinned result
// shape. The full HTTP + status + reason combination and the exact envelope
// shape are enforced here, so the executor can never surface a response this
// function did not clear. Every invalid-wire-response condition returns the
// one pinned client result, and no raw status, reason or envelope is carried
// into it. A caller bug in requestedTicker / requestedAsOf returns
// CLIENT_INVALID_INPUT without evaluating the body. Never throws.
function normalizeNewsCatalystsReadResponse(httpStatus, rawBodyText, requestedTicker, requestedAsOf) {
  if (typeof requestedTicker !== 'string' || !_NCC_TICKER_RE.test(requestedTicker)) {
    return _nccResult('client', 'CLIENT_INVALID_INPUT', 'TICKER_INVALID', null, null);
  }
  if (!_nccValidInstant(requestedAsOf)) {
    return _nccResult('client', 'CLIENT_INVALID_INPUT', 'ASOF_INVALID', null, null);
  }
  var invalid = _nccResult('client', 'CLIENT_INVALID_RESPONSE', 'RESPONSE_INVALID', requestedTicker, null);
  if (typeof httpStatus !== 'number' || !isFinite(httpStatus)) { return invalid; }
  if (typeof rawBodyText !== 'string') { return invalid; }
  var body;
  try {
    body = JSON.parse(rawBodyText);
  } catch (e) {
    return invalid;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) { return invalid; }
  var status = body.status;
  if (typeof status !== 'string' || !_nccHas(NEWS_CATALYSTS_READ_HTTP_BY_STATUS, status)) { return invalid; }
  if (httpStatus !== NEWS_CATALYSTS_READ_HTTP_BY_STATUS[status]) { return invalid; }
  if (status === 'OK') {
    if (!_nccValidOkEnvelope(body, requestedTicker, requestedAsOf)) { return invalid; }
    return _nccResult('ok', 'OK', null, requestedTicker, body);
  }
  var shapeOk;
  if (status === 'NOT_AVAILABLE') {
    shapeOk = _nccValidNotAvailableEnvelope(body, requestedTicker, requestedAsOf);
  } else if (status === 'DEGRADED') {
    shapeOk = _nccHasExactKeys(body, _NCC_DEGRADED_FIELDS) && body.ticker === requestedTicker;
  } else {
    shapeOk = _nccHasExactKeys(body, _NCC_PLAIN_FIELDS);
  }
  if (!shapeOk) { return invalid; }
  if (NEWS_CATALYSTS_READ_ERROR_REASONS[status].indexOf(body.reason) === -1) { return invalid; }
  return _nccResult('server', status, body.reason, requestedTicker, status === 'NOT_AVAILABLE' ? body : null);
}

// Executor: single-shot POST to the read endpoint. Resolves to the pinned
// result shape for every input and failure mode - it never rejects. The
// ticker is trimmed and uppercased before validation (the server does not
// normalize); asOf is the INJECTED instant and is sent as given - no clock is
// ever read; the token is validated (string with at least one non-whitespace
// character) but sent VERBATIM - the server compares 'Bearer ' + token
// byte-exact. The body is exactly { ticker, asOf }. The token lives only in
// this call frame: it is never stored, logged, echoed into a result, or
// copied to any global.
// options: { ticker, asOf, token, fetchImpl?, timeoutMs?, endpoint? }.
function requestNewsCatalystsRead(options) {
  return new Promise(function (resolve) {
    var opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};

    var ticker = typeof opts.ticker === 'string' ? opts.ticker.trim().toUpperCase() : null;
    if (ticker === null || !_NCC_TICKER_RE.test(ticker)) {
      resolve(_nccResult('client', 'CLIENT_INVALID_INPUT', 'TICKER_INVALID', null, null));
      return;
    }

    var token = opts.token;
    if (typeof token !== 'string' || token.trim().length === 0) {
      resolve(_nccResult('client', 'CLIENT_INVALID_INPUT', 'TOKEN_INVALID', null, null));
      return;
    }

    var asOf = opts.asOf;
    if (!_nccValidInstant(asOf)) {
      resolve(_nccResult('client', 'CLIENT_INVALID_INPUT', 'ASOF_INVALID', null, null));
      return;
    }

    // A supplied fetchImpl is authoritative: when the caller passes the key
    // at all (even as undefined), a non-function fails closed instead of
    // falling back to the global fetch. Only an absent key may use the
    // global fetch.
    var doFetch = null;
    if (_nccHas(opts, 'fetchImpl')) {
      if (typeof opts.fetchImpl === 'function') { doFetch = opts.fetchImpl; }
    } else if (typeof fetch === 'function') {
      doFetch = fetch;
    }
    if (doFetch === null) {
      resolve(_nccResult('client', 'CLIENT_NETWORK_ERROR', 'FETCH_UNAVAILABLE', ticker, null));
      return;
    }

    var timeoutMs = (typeof opts.timeoutMs === 'number' && isFinite(opts.timeoutMs) && opts.timeoutMs > 0)
      ? opts.timeoutMs
      : NEWS_CATALYSTS_READ_TIMEOUT_MS;
    var endpoint = (typeof opts.endpoint === 'string' && opts.endpoint.length > 0)
      ? opts.endpoint
      : NEWS_CATALYSTS_READ_ENDPOINT;

    var settled = false;
    var timedOut = false; // set ONLY by our own timer, never inferred from an AbortError
    var timer = null;
    var controller = null;

    function settle(result) {
      if (settled) { return; }
      settled = true;
      if (timer !== null) { clearTimeout(timer); timer = null; }
      resolve(result);
    }

    try {
      if (typeof AbortController === 'function') {
        controller = new AbortController();
      }
      timer = setTimeout(function () {
        timedOut = true;
        if (controller !== null) {
          try { controller.abort(); } catch (e) { /* abort failure cannot un-fire the timeout */ }
        }
        settle(_nccResult('client', 'CLIENT_TIMEOUT', 'REQUEST_TIMEOUT', ticker, null));
      }, timeoutMs);
    } catch (e) {
      settle(_nccResult('client', 'CLIENT_NETWORK_ERROR', 'FETCH_FAILED', ticker, null));
      return;
    }

    var requestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ ticker: ticker, asOf: asOf })
    };
    if (controller !== null) { requestInit.signal = controller.signal; }

    var fetched;
    try {
      fetched = doFetch(endpoint, requestInit);
    } catch (e) {
      settle(_nccResult('client', 'CLIENT_NETWORK_ERROR', 'FETCH_FAILED', ticker, null));
      return;
    }
    if (!fetched || typeof fetched.then !== 'function') {
      settle(_nccResult('client', 'CLIENT_INVALID_RESPONSE', 'RESPONSE_INVALID', ticker, null));
      return;
    }

    fetched.then(function (response) {
      if (settled) { return; }
      if (!response || typeof response !== 'object' ||
          typeof response.status !== 'number' || !isFinite(response.status) ||
          typeof response.text !== 'function') {
        settle(_nccResult('client', 'CLIENT_INVALID_RESPONSE', 'RESPONSE_INVALID', ticker, null));
        return;
      }
      var read;
      try {
        read = response.text();
      } catch (e) {
        settle(_nccResult('client', 'CLIENT_INVALID_RESPONSE', 'RESPONSE_INVALID', ticker, null));
        return;
      }
      if (!read || typeof read.then !== 'function') {
        settle(_nccResult('client', 'CLIENT_INVALID_RESPONSE', 'RESPONSE_INVALID', ticker, null));
        return;
      }
      read.then(function (bodyText) {
        settle(normalizeNewsCatalystsReadResponse(response.status, bodyText, ticker, asOf));
      }, function () {
        settle(_nccResult('client', 'CLIENT_INVALID_RESPONSE', 'RESPONSE_INVALID', ticker, null));
      });
    }, function () {
      if (timedOut) {
        // Our timer already settled with CLIENT_TIMEOUT; this abort rejection
        // is its echo, not a network failure.
        settle(_nccResult('client', 'CLIENT_TIMEOUT', 'REQUEST_TIMEOUT', ticker, null));
        return;
      }
      settle(_nccResult('client', 'CLIENT_NETWORK_ERROR', 'FETCH_FAILED', ticker, null));
    });
  });
}

// CommonJS surface for Node QA. When this file is inlined into the browser
// app, `module` is undefined and the guard is skipped (same pattern as the
// other service clients).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    NEWS_CATALYSTS_READ_ENDPOINT: NEWS_CATALYSTS_READ_ENDPOINT,
    NEWS_CATALYSTS_READ_TIMEOUT_MS: NEWS_CATALYSTS_READ_TIMEOUT_MS,
    NEWS_CATALYSTS_READ_SERVER_STATUSES: NEWS_CATALYSTS_READ_SERVER_STATUSES,
    NEWS_CATALYSTS_READ_ERROR_REASONS: NEWS_CATALYSTS_READ_ERROR_REASONS,
    NEWS_CATALYSTS_READ_HTTP_BY_STATUS: NEWS_CATALYSTS_READ_HTTP_BY_STATUS,
    NEWS_CATALYSTS_READ_CLIENT_REASONS: NEWS_CATALYSTS_READ_CLIENT_REASONS,
    normalizeNewsCatalystsReadResponse: normalizeNewsCatalystsReadResponse,
    requestNewsCatalystsRead: requestNewsCatalystsRead,
    _nccHasExactKeys: _nccHasExactKeys,
    _nccValidInstant: _nccValidInstant,
    _nccValidRecord: _nccValidRecord
  };
}
