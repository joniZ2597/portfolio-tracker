'use strict';

// T1-C2 — Fund Facts read client (display-only, non-scoring sidecar).
// Canonical logic source. The verbatim index.html inline copy is added in a
// later S6 batch (with a drift guard); until then this file is the only copy.

var FUND_FACTS_READ_ENDPOINT = '/.netlify/functions/fund-facts-read';
var FUND_FACTS_READ_TIMEOUT_MS = 12000;

// Server-side ticker rule, applied after trim + uppercase.
var FUND_FACTS_READ_TICKER_RE = /^[A-Z]{1,10}$/;

// Shipped CIK grammar; generic, never a ticker-to-CIK map.
var FUND_FACTS_READ_CIK_RE = /^\d{10}$/;

// Exact 14-field success envelope, in contract order.
var FUND_FACTS_READ_TOP_FIELDS = [
  'status',
  'readContractVersion',
  'ticker',
  'cik',
  'contractVersion',
  'sourceTier',
  'provider',
  'fetchedAt',
  'verificationStatus',
  'confidence',
  'series',
  'derived',
  'gaps',
  'freshness'
];

// Exact 8-field freshness object, in contract order.
var FUND_FACTS_READ_FRESHNESS_FIELDS = [
  'state',
  'ageDays',
  'asOf',
  'timestampSource',
  'usedFetchedAtFallback',
  'reason',
  'checkedAt',
  'windowTableVersion'
];

// Exact 9 series members, in contract order.
var FUND_FACTS_READ_SERIES_FIELDS = [
  'revenue',
  'netIncome',
  'eps',
  'cfo',
  'capex',
  'cash',
  'debt',
  'equity',
  'shares'
];

// Exact 11-field fact shape, in contract order.
var FUND_FACTS_READ_FACT_FIELDS = [
  'concept',
  'unit',
  'fiscalYear',
  'fiscalPeriod',
  'periodStart',
  'periodEnd',
  'valueNumeric',
  'form',
  'accessionNumber',
  'filingUrl',
  'filed'
];

// Fields that must not appear in the approved read projection.
var FUND_FACTS_READ_FORBIDDEN_FIELDS = [
  'computedAt',
  'runId',
  'secRequests',
  'filings'
];

// Pinned contract constants for every valid OK response.
var FUND_FACTS_READ_CONTRACT_VERSION = 'fund-facts-read-v1';
var FUND_FACTS_STORE_CONTRACT_VERSION = 'fund-contract-v1';
var FUND_FACTS_STORE_SOURCE_TIER = 'sec_xbrl_primary';
var FUND_FACTS_STORE_PROVIDER = 'j1-sec-facts@job-model-v1';

// Server response statuses handled by the client.
var FUND_FACTS_READ_SERVER_STATUSES = [
  'OK',
  'DISABLED',
  'UNAUTHORIZED',
  'NOT_AVAILABLE',
  'DEGRADED',
  'CONFIGURATION_MISSING',
  'INVALID_TICKER',
  'INVALID_JSON',
  'METHOD_NOT_ALLOWED'
];

// Freshness states returned by the reader.
var FUND_FACTS_READ_FRESHNESS_STATES = [
  'fresh',
  'aging',
  'stale',
  'missing',
  'degraded'
];

// Exact derived metric definitions.
var FUND_FACTS_READ_DERIVED_SPEC = [
  {
    key: 'revenueGrowth',
    method: 'yoy_quarterly',
    fields: ['method', 'valuePct', 'basis']
  },
  {
    key: 'netMargin',
    method: 'net_margin',
    fields: ['method', 'valuePct', 'basis']
  },
  {
    key: 'freeCashFlow',
    method: 'cfo_minus_capex',
    fields: ['method', 'valueNumeric', 'basis']
  },
  {
    key: 'balanceSheetStrength',
    method: 'balance_sheet_numerics',
    fields: ['method', 'netCash', 'debtToEquity', 'basis']
  }
];

// True only for a string with at least one non-whitespace character.
function _ffrIsNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// True only for a plain object whose own keys match expectedKeys exactly:
// same count, same names, same order. Arrays, null, and non-plain objects
// are rejected.
function _ffrHasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { return false; }
  if (Object.getPrototypeOf(value) !== Object.prototype) { return false; }
  var actual = Object.keys(value);
  if (actual.length !== expectedKeys.length) { return false; }
  for (var i = 0; i < expectedKeys.length; i++) {
    if (actual[i] !== expectedKeys[i]) { return false; }
  }
  return true;
}

// True only for a fact carrying the exact 11 contract fields, in order,
// with every required type satisfied. URL safety is the renderer's job.
function _ffrValidFact(fact) {
  if (!_ffrHasExactKeys(fact, FUND_FACTS_READ_FACT_FIELDS)) { return false; }
  var nullableString = function (v) { return v === null || _ffrIsNonEmptyString(v); };
  if (!_ffrIsNonEmptyString(fact.concept)) { return false; }
  if (!_ffrIsNonEmptyString(fact.unit)) { return false; }
  if (!_ffrIsNonEmptyString(fact.fiscalPeriod)) { return false; }
  if (!_ffrIsNonEmptyString(fact.periodEnd)) { return false; }
  if (typeof fact.fiscalYear !== 'number' || !isFinite(fact.fiscalYear) ||
      Math.floor(fact.fiscalYear) !== fact.fiscalYear) { return false; }
  if (typeof fact.valueNumeric !== 'number' || !isFinite(fact.valueNumeric)) { return false; }
  if (!nullableString(fact.periodStart)) { return false; }
  if (!nullableString(fact.form)) { return false; }
  if (!nullableString(fact.accessionNumber)) { return false; }
  if (!nullableString(fact.filingUrl)) { return false; }
  if (!nullableString(fact.filed)) { return false; }
  return true;
}

// True only for a series carrying the exact 9 contract members, in order,
// each shaped { conceptUsed, facts } with every fact valid. An empty facts
// array is valid: absence is reported through gaps, not through omission.
function _ffrValidSeries(series) {
  if (!_ffrHasExactKeys(series, FUND_FACTS_READ_SERIES_FIELDS)) { return false; }
  for (var i = 0; i < FUND_FACTS_READ_SERIES_FIELDS.length; i++) {
    var member = series[FUND_FACTS_READ_SERIES_FIELDS[i]];
    if (!_ffrHasExactKeys(member, ['conceptUsed', 'facts'])) { return false; }
    if (!(member.conceptUsed === null || _ffrIsNonEmptyString(member.conceptUsed))) { return false; }
    if (!Array.isArray(member.facts)) { return false; }
    for (var j = 0; j < member.facts.length; j++) {
      if (!_ffrValidFact(member.facts[j])) { return false; }
    }
  }
  return true;
}

// True only for a derived block carrying the exact 4 contract metrics, in
// order. Each metric may be null; when present it must match its pinned
// key order, method literal, numeric rules, and string basis array.
function _ffrValidDerived(derived) {
  var keys = FUND_FACTS_READ_DERIVED_SPEC.map(function (s) { return s.key; });
  if (!_ffrHasExactKeys(derived, keys)) { return false; }
  var finite = function (v) { return typeof v === 'number' && isFinite(v); };
  var nullableFinite = function (v) { return v === null || finite(v); };
  for (var i = 0; i < FUND_FACTS_READ_DERIVED_SPEC.length; i++) {
    var spec = FUND_FACTS_READ_DERIVED_SPEC[i];
    var metric = derived[spec.key];
    if (metric === null) { continue; }
    if (!_ffrHasExactKeys(metric, spec.fields)) { return false; }
    if (metric.method !== spec.method) { return false; }
    if (!Array.isArray(metric.basis)) { return false; }
    for (var j = 0; j < metric.basis.length; j++) {
      if (typeof metric.basis[j] !== 'string') { return false; }
    }
    if (spec.key === 'balanceSheetStrength') {
      if (!nullableFinite(metric.netCash)) { return false; }
      if (!nullableFinite(metric.debtToEquity)) { return false; }
    } else if (spec.key === 'freeCashFlow') {
      if (!finite(metric.valueNumeric)) { return false; }
    } else if (!finite(metric.valuePct)) {
      return false;
    }
  }
  return true;
}

// True only for a gaps list: an array whose every entry is a string. An
// empty array is valid, and so are empty strings: the contract requires
// strings, not non-empty strings.
function _ffrValidGaps(gaps) {
  if (!Array.isArray(gaps)) { return false; }
  for (var i = 0; i < gaps.length; i++) {
    if (typeof gaps[i] !== 'string') { return false; }
  }
  return true;
}

// True only when no object anywhere inside value carries a forbidden field.
// Arrays are walked element by element and objects key by key; primitives,
// null, empty objects, and empty arrays are all valid. The input is only
// read. Cycles are out of scope: real input comes from JSON.parse.
function _ffrForbiddenFieldsAbsent(value) {
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) {
      if (!_ffrForbiddenFieldsAbsent(value[i])) { return false; }
    }
    return true;
  }
  if (!value || typeof value !== 'object') { return true; }
  var keys = Object.keys(value);
  for (var j = 0; j < keys.length; j++) {
    if (FUND_FACTS_READ_FORBIDDEN_FIELDS.indexOf(keys[j]) !== -1) { return false; }
    if (!_ffrForbiddenFieldsAbsent(value[keys[j]])) { return false; }
  }
  return true;
}

// True only for a timestamp string in one of the two grammars the shipped J7
// evaluator accepts: a real calendar date YYYY-MM-DD, or a UTC-Z datetime
// YYYY-MM-DDThh:mm:ss(.fff)Z. Timezone offsets are rejected by the grammar.
function _ffrValidStamp(value) {
  if (typeof value !== 'string') { return false; }
  var ymd = function (y, mo, d) {
    var leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    var max = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return mo >= 1 && mo <= 12 && d >= 1 && d <= max[mo - 1];
  };
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) { return ymd(+m[1], +m[2], +m[3]); }
  m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/.exec(value);
  return !!m && ymd(+m[1], +m[2], +m[3]) && +m[4] <= 23 && +m[5] <= 59 && +m[6] <= 59;
}

// True only for a freshness block carrying the exact 8 contract fields, in
// order, under the shipped J7 rules. reason selects the shape: RECORD_UNREADABLE
// is the only missing reason, TIMESTAMP_AHEAD_OF_CLOCK the only negative ageDays,
// and only the pre-clock reasons in BLANK may carry a null checkedAt.
function _ffrValidFreshness(freshness) {
  if (!_ffrHasExactKeys(freshness, FUND_FACTS_READ_FRESHNESS_FIELDS)) { return false; }
  if (FUND_FACTS_READ_FRESHNESS_STATES.indexOf(freshness.state) === -1) { return false; }
  var SRC = ['filed', 'periodEnd', 'asOf', 'eventDate', 'fetchedAt'];
  var BLANK = ['MALFORMED_SNAPSHOT', 'UNKNOWN_FAMILY', 'CONTRACT_INVALID'];
  var int0 = function (n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; };
  var src = freshness.timestampSource, age = freshness.ageDays, at = freshness.checkedAt;
  var version = freshness.windowTableVersion;
  if (typeof version !== 'string' || version.length === 0 || version !== version.trim()) { return false; }
  if (!(src === null || SRC.indexOf(src) !== -1)) { return false; }
  if (freshness.usedFetchedAtFallback !== (src === 'fetchedAt')) { return false; }
  if ((freshness.asOf === null) !== (src === null)) { return false; }
  if (src !== null && !_ffrValidStamp(freshness.asOf)) { return false; }
  if (!(at === null || (int0(at) && at >= 0))) { return false; }
  if (freshness.state === 'missing') {
    return freshness.reason === 'RECORD_UNREADABLE' && age === null && src === null;
  }
  if (freshness.state !== 'degraded') {
    return freshness.reason === null && int0(age) && age >= 0 && src !== null && at !== null;
  }
  if (freshness.reason === 'TIMESTAMP_AHEAD_OF_CLOCK') { return int0(age) && age < 0 && src !== null && at !== null; }
  if (freshness.reason === 'CHECKED_AT_INVALID') { return age === null && at === null; }
  if (freshness.reason === 'NO_TIMESTAMP') { return age === null && src === null && at !== null; }
  return BLANK.indexOf(freshness.reason) !== -1 && age === null && src === null;
}

// True only for a complete OK envelope: the exact 14 top-level fields in
// order, the four pinned contract constants, and every nested block valid.
// fetchedAt mirrors the server rule exactly - any string Date.parse accepts,
// which is deliberately wider than the strict J7 stamp grammar.
function _ffrValidOkEnvelope(envelope) {
  if (!_ffrHasExactKeys(envelope, FUND_FACTS_READ_TOP_FIELDS)) { return false; }
  if (envelope.status !== 'OK') { return false; }
  if (envelope.readContractVersion !== FUND_FACTS_READ_CONTRACT_VERSION) { return false; }
  if (envelope.contractVersion !== FUND_FACTS_STORE_CONTRACT_VERSION) { return false; }
  if (envelope.sourceTier !== FUND_FACTS_STORE_SOURCE_TIER) { return false; }
  if (envelope.provider !== FUND_FACTS_STORE_PROVIDER) { return false; }
  if (typeof envelope.ticker !== 'string' || !FUND_FACTS_READ_TICKER_RE.test(envelope.ticker)) { return false; }
  if (typeof envelope.cik !== 'string' || !FUND_FACTS_READ_CIK_RE.test(envelope.cik)) { return false; }
  if (typeof envelope.fetchedAt !== 'string' || !isFinite(Date.parse(envelope.fetchedAt))) { return false; }
  if (envelope.verificationStatus !== 'verified') { return false; }
  if (envelope.confidence !== null) { return false; }
  if (!_ffrValidSeries(envelope.series)) { return false; }
  if (!_ffrValidDerived(envelope.derived)) { return false; }
  if (!_ffrValidGaps(envelope.gaps)) { return false; }
  return _ffrValidFreshness(envelope.freshness);
}

// Exact reason vocabulary for every non-OK server status.
var FUND_FACTS_READ_ERROR_REASONS = {
  DISABLED: ['SERVER_DISABLED'],
  UNAUTHORIZED: ['UNAUTHORIZED'],
  NOT_AVAILABLE: ['NO_RECORD'],
  DEGRADED: ['STORE_UNAVAILABLE', 'STORE_RECORD_INVALID'],
  CONFIGURATION_MISSING: ['TOKEN_COLLISION', 'ALLOWLIST_MISSING', 'ALLOWLIST_INVALID'],
  INVALID_TICKER: ['TICKER_INVALID'],
  INVALID_JSON: ['INVALID_JSON'],
  METHOD_NOT_ALLOWED: ['METHOD_NOT_ALLOWED']
};

// Exact HTTP pairing for every server status. A structurally valid body
// carried on any other HTTP status is rejected (hardening ruling 2026-07-27).
var FUND_FACTS_READ_HTTP_BY_STATUS = {
  OK: 200,
  DISABLED: 200,
  NOT_AVAILABLE: 200,
  DEGRADED: 200,
  UNAUTHORIZED: 401,
  CONFIGURATION_MISSING: 500,
  INVALID_TICKER: 400,
  INVALID_JSON: 400,
  METHOD_NOT_ALLOWED: 405
};

// The only statuses whose error envelope may carry the optional ticker echo.
var FUND_FACTS_READ_TICKER_ECHO_STATUSES = ['NOT_AVAILABLE', 'DEGRADED'];

// Pinned client-side statuses and reasons. Never produced by the server, and
// reason never carries exception text, response fragments, tokens, or
// environment details.
var FUND_FACTS_READ_CLIENT_REASONS = {
  CLIENT_INVALID_INPUT: ['TICKER_INVALID', 'TOKEN_INVALID'],
  CLIENT_TIMEOUT: ['REQUEST_TIMEOUT'],
  CLIENT_NETWORK_ERROR: ['FETCH_UNAVAILABLE', 'FETCH_FAILED'],
  CLIENT_INVALID_RESPONSE: ['RESPONSE_INVALID']
};

// The single result shape every public function returns. Keys are always in
// this order: kind, status, reason, ticker, envelope. ticker is the
// normalized REQUESTED ticker (never a body echo); it is null only when local
// input validation failed. envelope is non-null only for a fully validated,
// correlated OK response.
function _ffrResult(kind, status, reason, ticker, envelope) {
  return { kind: kind, status: status, reason: reason, ticker: ticker, envelope: envelope };
}

// True only for a non-OK server envelope: exact {status, reason} or - for the
// two ticker-echo statuses only - {status, reason, ticker}, in server literal
// order, with reason drawn from that status's pinned vocabulary. A present
// ticker must equal the normalized requested ticker exactly; it may be absent
// because JSON.stringify drops an undefined ticker on the server side.
function _ffrValidErrorEnvelope(body, requestedTicker) {
  var twoKey = _ffrHasExactKeys(body, ['status', 'reason']);
  var threeKey = !twoKey && _ffrHasExactKeys(body, ['status', 'reason', 'ticker']);
  if (!twoKey && !threeKey) { return false; }
  if (!Object.prototype.hasOwnProperty.call(FUND_FACTS_READ_ERROR_REASONS, body.status)) { return false; }
  if (FUND_FACTS_READ_ERROR_REASONS[body.status].indexOf(body.reason) === -1) { return false; }
  if (threeKey) {
    if (FUND_FACTS_READ_TICKER_ECHO_STATUSES.indexOf(body.status) === -1) { return false; }
    if (body.ticker !== requestedTicker) { return false; }
  }
  return true;
}

// Pure normalizer: maps (httpStatus, rawBodyText) for a request that asked
// for requestedTicker into the pinned result shape. Request/response ticker
// correlation and exact HTTP pairing are enforced here, so the executor can
// never surface a response this function did not clear. requestedTicker must
// be the already-normalized ticker the caller actually sent; a caller bug
// there returns CLIENT_INVALID_INPUT without evaluating the body. Never
// throws.
function normalizeFundFactsReadResponse(httpStatus, rawBodyText, requestedTicker) {
  if (typeof requestedTicker !== 'string' || !FUND_FACTS_READ_TICKER_RE.test(requestedTicker)) {
    return _ffrResult('client', 'CLIENT_INVALID_INPUT', 'TICKER_INVALID', null, null);
  }
  var invalid = _ffrResult('client', 'CLIENT_INVALID_RESPONSE', 'RESPONSE_INVALID', requestedTicker, null);
  if (typeof httpStatus !== 'number' || !isFinite(httpStatus)) { return invalid; }
  if (typeof rawBodyText !== 'string') { return invalid; }
  var body;
  try {
    body = JSON.parse(rawBodyText);
  } catch (e) {
    return invalid;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) { return invalid; }
  if (!_ffrForbiddenFieldsAbsent(body)) { return invalid; }
  var status = body.status;
  if (FUND_FACTS_READ_SERVER_STATUSES.indexOf(status) === -1) { return invalid; }
  if (httpStatus !== FUND_FACTS_READ_HTTP_BY_STATUS[status]) { return invalid; }
  if (status === 'OK') {
    if (!_ffrValidOkEnvelope(body)) { return invalid; }
    if (body.ticker !== requestedTicker) { return invalid; }
    return _ffrResult('ok', 'OK', null, requestedTicker, body);
  }
  if (!_ffrValidErrorEnvelope(body, requestedTicker)) { return invalid; }
  return _ffrResult('server', status, body.reason, requestedTicker, null);
}

// Executor: single-shot POST to the read endpoint. Resolves to the pinned
// result shape for every input and failure mode - it never rejects. The
// ticker is trimmed and uppercased before validation (the server does not
// normalize); the token is validated (string with at least one
// non-whitespace character) but sent VERBATIM - the server compares
// 'Bearer ' + token byte-exact. The token lives only in this call frame: it
// is never stored, logged, echoed into a result, or copied to any global.
// options: { ticker, token, fetchImpl?, timeoutMs?, endpoint? }.
function requestFundFactsRead(options) {
  return new Promise(function (resolve) {
    var opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};

    var ticker = typeof opts.ticker === 'string' ? opts.ticker.trim().toUpperCase() : null;
    if (ticker === null || !FUND_FACTS_READ_TICKER_RE.test(ticker)) {
      resolve(_ffrResult('client', 'CLIENT_INVALID_INPUT', 'TICKER_INVALID', null, null));
      return;
    }

    var token = opts.token;
    if (typeof token !== 'string' || token.trim().length === 0) {
      resolve(_ffrResult('client', 'CLIENT_INVALID_INPUT', 'TOKEN_INVALID', null, null));
      return;
    }

    // A supplied fetchImpl is authoritative: when the caller passes the key
    // at all (even as undefined), a non-function fails closed instead of
    // falling back to the global fetch (correction ruling 2026-07-27). Only
    // an absent key may use the global fetch.
    var doFetch = null;
    if (Object.prototype.hasOwnProperty.call(opts, 'fetchImpl')) {
      if (typeof opts.fetchImpl === 'function') { doFetch = opts.fetchImpl; }
    } else if (typeof fetch === 'function') {
      doFetch = fetch;
    }
    if (doFetch === null) {
      resolve(_ffrResult('client', 'CLIENT_NETWORK_ERROR', 'FETCH_UNAVAILABLE', ticker, null));
      return;
    }

    var timeoutMs = (typeof opts.timeoutMs === 'number' && isFinite(opts.timeoutMs) && opts.timeoutMs > 0)
      ? opts.timeoutMs
      : FUND_FACTS_READ_TIMEOUT_MS;
    var endpoint = (typeof opts.endpoint === 'string' && opts.endpoint.length > 0)
      ? opts.endpoint
      : FUND_FACTS_READ_ENDPOINT;

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
        settle(_ffrResult('client', 'CLIENT_TIMEOUT', 'REQUEST_TIMEOUT', ticker, null));
      }, timeoutMs);
    } catch (e) {
      settle(_ffrResult('client', 'CLIENT_NETWORK_ERROR', 'FETCH_FAILED', ticker, null));
      return;
    }

    var requestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ ticker: ticker })
    };
    if (controller !== null) { requestInit.signal = controller.signal; }

    var fetched;
    try {
      fetched = doFetch(endpoint, requestInit);
    } catch (e) {
      settle(_ffrResult('client', 'CLIENT_NETWORK_ERROR', 'FETCH_FAILED', ticker, null));
      return;
    }
    if (!fetched || typeof fetched.then !== 'function') {
      settle(_ffrResult('client', 'CLIENT_INVALID_RESPONSE', 'RESPONSE_INVALID', ticker, null));
      return;
    }

    fetched.then(function (response) {
      if (settled) { return; }
      if (!response || typeof response !== 'object' ||
          typeof response.status !== 'number' || !isFinite(response.status) ||
          typeof response.text !== 'function') {
        settle(_ffrResult('client', 'CLIENT_INVALID_RESPONSE', 'RESPONSE_INVALID', ticker, null));
        return;
      }
      var read;
      try {
        read = response.text();
      } catch (e) {
        settle(_ffrResult('client', 'CLIENT_INVALID_RESPONSE', 'RESPONSE_INVALID', ticker, null));
        return;
      }
      if (!read || typeof read.then !== 'function') {
        settle(_ffrResult('client', 'CLIENT_INVALID_RESPONSE', 'RESPONSE_INVALID', ticker, null));
        return;
      }
      read.then(function (bodyText) {
        settle(normalizeFundFactsReadResponse(response.status, bodyText, ticker));
      }, function () {
        settle(_ffrResult('client', 'CLIENT_INVALID_RESPONSE', 'RESPONSE_INVALID', ticker, null));
      });
    }, function () {
      if (timedOut) {
        // Our timer already settled with CLIENT_TIMEOUT; this abort rejection
        // is its echo, not a network failure.
        settle(_ffrResult('client', 'CLIENT_TIMEOUT', 'REQUEST_TIMEOUT', ticker, null));
        return;
      }
      settle(_ffrResult('client', 'CLIENT_NETWORK_ERROR', 'FETCH_FAILED', ticker, null));
    });
  });
}

// CommonJS surface for Node QA. When this file is inlined into the browser
// app, `module` is undefined and the guard is skipped (same pattern as the
// other inlined service clients).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FUND_FACTS_READ_ENDPOINT: FUND_FACTS_READ_ENDPOINT,
    FUND_FACTS_READ_TIMEOUT_MS: FUND_FACTS_READ_TIMEOUT_MS,
    FUND_FACTS_READ_SERVER_STATUSES: FUND_FACTS_READ_SERVER_STATUSES,
    FUND_FACTS_READ_ERROR_REASONS: FUND_FACTS_READ_ERROR_REASONS,
    FUND_FACTS_READ_HTTP_BY_STATUS: FUND_FACTS_READ_HTTP_BY_STATUS,
    FUND_FACTS_READ_TICKER_ECHO_STATUSES: FUND_FACTS_READ_TICKER_ECHO_STATUSES,
    FUND_FACTS_READ_CLIENT_REASONS: FUND_FACTS_READ_CLIENT_REASONS,
    normalizeFundFactsReadResponse: normalizeFundFactsReadResponse,
    requestFundFactsRead: requestFundFactsRead,
    _ffrIsNonEmptyString: _ffrIsNonEmptyString,
    _ffrHasExactKeys: _ffrHasExactKeys,
    _ffrValidFact: _ffrValidFact,
    _ffrValidSeries: _ffrValidSeries,
    _ffrValidDerived: _ffrValidDerived,
    _ffrValidGaps: _ffrValidGaps,
    _ffrForbiddenFieldsAbsent: _ffrForbiddenFieldsAbsent,
    _ffrValidStamp: _ffrValidStamp,
    _ffrValidFreshness: _ffrValidFreshness,
    _ffrValidOkEnvelope: _ffrValidOkEnvelope,
    _ffrValidErrorEnvelope: _ffrValidErrorEnvelope
  };
}
