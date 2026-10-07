'use strict';

/*
 * netlify/functions/lib/ath-record.js
 *
 * R-1 Slice B (B1+B3) — verified all-time-high (ATH) record: schema, pure comparison and the
 * server-side verification rule. PURE: no I/O, no environment reads, no requires, no storage.
 *
 * The 1Y High is a different metric and is never an input here. A record that is not `verified`
 * yields no ATH to any caller.
 *
 * Verification rule (work/r1b-ath-store-seed/brief.md section 4):
 *   - TradingView `All` -> `High` is the manual verification value. Yahoo daily history only
 *     identifies the matching bar, date and evidence.
 *   - A clean match is a Yahoo bar within 0.5% of that High (the highest such bar; ties ->
 *     earliest date).
 *   - Every Yahoo bar higher than the matched bar is recorded, never dropped:
 *       covered   (date >= the first TradingView bar)  -> contradicted by the chart;
 *       uncovered (date <  the first TradingView bar)  -> needs independent evidence, else the
 *                                                         record stays unresolved.
 *   - No bar is ever rejected because it looks implausible. There is no override field.
 *   - The operator submits the FULL Yahoo daily series; the matched bar, the higher bars and the
 *     covered / uncovered split are DERIVED here. The series is operator-supplied in B1+B3 (the
 *     writer does not fetch Yahoo); it is checked for schema, strictly ascending unique dates and
 *     recency, never for plausibility.
 */

// ── constants ─────────────────────────────────────────────────────────────────
const SCHEMA = 'ath:v1';
const STORE_NAME = 'ath-record-store';
const KEY_NAMESPACE = 'ath:v1';
const BASIS = 'split-adjusted-no-dividend-adjust';
const TOLERANCE = 0.005;
const PROXIMITY = 0.02;
const MAX_HIGHER_BARS = 500;
const MAX_BARS = 30000;
const MAX_SERIES_AGE_DAYS = 10;

const STATUSES = Object.freeze(['verified', 'unresolved', 'stale-suspect']);
const CURRENCIES = Object.freeze(['USD', 'ILS']);
const UNITS = Object.freeze(['USD', 'ILA', 'ILS']);
const UNITS_BY_CURRENCY = Object.freeze({ USD: ['USD'], ILS: ['ILA', 'ILS'] });
const ADJ_SETTINGS = Object.freeze(['on', 'off']);
const INDEPENDENT_KINDS = Object.freeze(['bar-level', 'ath-claim']);
const DISPOSITIONS = Object.freeze(['contradicted-by-chart', 'contradicted-by-independent', 'unresolved']);
const REFRESH_STATUSES = Object.freeze(['none', 'unresolved']);
const FORBIDDEN_HOST_SUFFIXES = Object.freeze(['yahoo.com', 'tradingview.com']);

// The app's own symbol rule (index.html): 1-10 letters, optional literal .TA for Tel Aviv.
const TICKER_RE = /^[A-Z]{1,10}(\.TA)?$/;
const TV_SYMBOL_RE = /^(?:[A-Z0-9_]{1,15}:)?[A-Z0-9._-]{1,20}$/;
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const RECORD_KEYS = Object.freeze(['schema', 'ticker', 'providerSymbol', 'tradingViewSymbol', 'currency', 'unit', 'basis',
  'status', 'athValue', 'athDate', 'verifiedAt', 'verifiedBy', 'evidence', 'refresh', 'pending', 'lastCheckedAt']);
const EVIDENCE_KEYS = Object.freeze(['tradingViewHigh', 'tradingViewFirstBarDate', 'tradingViewAdjSetting', 'matchedBar',
  'toleranceUsed', 'yahooBarCount', 'yahooFirstBarDate', 'higherBars', 'coverageGap', 'searchValue']);
const MATCHED_BAR_KEYS = Object.freeze(['date', 'high']);
const HIGHER_BAR_KEYS = Object.freeze(['date', 'high', 'covered', 'disposition', 'basis']);
const COVERAGE_GAP_KEYS = Object.freeze(['uncoveredFrom', 'uncoveredTo', 'independent']);
const INDEPENDENT_KEYS = Object.freeze(['kind', 'source', 'url', 'retrievedAt', 'quotedValue', 'quotedDate', 'coverageStart']);
const SEARCH_KEYS = Object.freeze(['value', 'date', 'citation']);
const REFRESH_KEYS = Object.freeze(['status', 'lastAttemptAt', 'reason']);
const SERIES_BAR_KEYS = Object.freeze(['date', 'high']);

// What the writer accepts from the operator: the TradingView reading, the FULL Yahoo daily series
// (`bars`) and the optional independent / search evidence. The matched bar, every higher bar and
// the covered / uncovered split are DERIVED by the writer from that series; a client-supplied
// matchedBar / higherBars / yahooBarCount / yahooFirstBarDate (or any override, reason, note ...)
// is refused as an unknown key. `status` alone is tolerated, only to be ignored and recomputed.
// TRUST BOUNDARY (B1+B3): the series itself is operator-supplied; the writer checks its schema and
// consistency but does not fetch Yahoo. Server-side fetching may be reconsidered with B2.
const ATTEMPT_KEYS = Object.freeze(['tradingViewSymbol', 'currency', 'unit', 'tradingViewHigh', 'tradingViewFirstBarDate',
  'tradingViewAdjSetting', 'bars', 'independent', 'searchValue']);
const ALLOWED_ATTEMPT_KEYS = new Set(ATTEMPT_KEYS.concat(['status']));

// ── small helpers ─────────────────────────────────────────────────────────────
function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function isFiniteNumber(v) { return typeof v === 'number' && isFinite(v); }
function isPositive(v) { return isFiniteNumber(v) && v > 0; }
function isNonEmptyString(v, max) { return typeof v === 'string' && v.trim() !== '' && v.length <= max; }

function exactKeys(obj, keys) {
  if (!isObject(obj)) { return false; }
  const actual = Object.keys(obj);
  return actual.length === keys.length && keys.every(function (k) { return Object.prototype.hasOwnProperty.call(obj, k); });
}

function isIsoDay(v) {
  if (typeof v !== 'string' || !ISO_DAY_RE.test(v)) { return false; }
  const t = Date.parse(v + 'T00:00:00Z');
  return isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
}

function isIsoTimestamp(v) {
  return typeof v === 'string' && ISO_TS_RE.test(v) && isFinite(Date.parse(v));
}

function invalid(reason) { return { ok: false, reason: reason }; }
function bad(reason) { return invalid(reason); }

function recordKey(ticker) { return KEY_NAMESPACE + ':' + ticker; }

// |a - b| / b <= tolerance (inclusive). b is the reference value.
function withinTolerance(a, b) { return Math.abs(a - b) / b <= TOLERANCE; }

function isForbiddenHost(host) {
  const h = String(host).toLowerCase().replace(/\.+$/, '');
  return FORBIDDEN_HOST_SUFFIXES.some(function (s) { return h === s || h.slice(-(s.length + 1)) === '.' + s; });
}

// ── independent evidence (shape + host) ──────────────────────────────────────
function independentCheck(ind) {
  if (!exactKeys(ind, INDEPENDENT_KEYS)) { return invalid('INDEPENDENT_INVALID'); }
  if (INDEPENDENT_KINDS.indexOf(ind.kind) === -1) { return invalid('INDEPENDENT_INVALID'); }
  if (!isNonEmptyString(ind.source, 120)) { return invalid('INDEPENDENT_INVALID'); }
  let parsedUrl;
  try { parsedUrl = new URL(ind.url); } catch (_) { return invalid('INDEPENDENT_INVALID'); }
  if (typeof ind.url !== 'string' || ind.url.length > 500 || parsedUrl.protocol !== 'https:' || parsedUrl.username !== '' || parsedUrl.password !== '') {
    return invalid('INDEPENDENT_INVALID');
  }
  if (!isIsoTimestamp(ind.retrievedAt) || !isPositive(ind.quotedValue) || !isIsoDay(ind.quotedDate) || !isIsoDay(ind.coverageStart)) {
    return invalid('INDEPENDENT_INVALID');
  }
  const host = parsedUrl.hostname;
  if (isForbiddenHost(host)) { return invalid('INDEPENDENT_SOURCE_FORBIDDEN'); }
  return { ok: true };
}

function searchValueOk(sv) {
  return sv === null || (exactKeys(sv, SEARCH_KEYS) && isPositive(sv.value) && isIsoDay(sv.date) && isNonEmptyString(sv.citation, 300));
}

function currencyUnitOk(currency, unit) {
  return CURRENCIES.indexOf(currency) !== -1 && UNITS.indexOf(unit) !== -1 && UNITS_BY_CURRENCY[currency].indexOf(unit) !== -1;
}

// ── record validation ─────────────────────────────────────────────────────────
function validateHigherBar(b) {
  if (!exactKeys(b, HIGHER_BAR_KEYS)) { return false; }
  if (!isIsoDay(b.date) || !isPositive(b.high) || typeof b.covered !== 'boolean') { return false; }
  if (DISPOSITIONS.indexOf(b.disposition) === -1) { return false; }
  if (b.covered) { return b.disposition === 'contradicted-by-chart' && b.basis === 'tradingview'; }
  return (b.disposition === 'contradicted-by-independent' && b.basis === 'independent') ||
    (b.disposition === 'unresolved' && b.basis === null);
}

function validateEvidence(ev, status) {
  if (!exactKeys(ev, EVIDENCE_KEYS)) { return bad('EVIDENCE_KEYS'); }
  if (!isPositive(ev.tradingViewHigh) || !isIsoDay(ev.tradingViewFirstBarDate)) { return bad('EVIDENCE_TRADINGVIEW'); }
  if (ADJ_SETTINGS.indexOf(ev.tradingViewAdjSetting) === -1) { return bad('EVIDENCE_ADJ'); }
  if (ev.matchedBar !== null && !(exactKeys(ev.matchedBar, MATCHED_BAR_KEYS) && isIsoDay(ev.matchedBar.date) && isPositive(ev.matchedBar.high))) {
    return bad('EVIDENCE_MATCHED_BAR');
  }
  if (ev.toleranceUsed !== TOLERANCE) { return bad('EVIDENCE_TOLERANCE'); }
  if (!Number.isInteger(ev.yahooBarCount) || ev.yahooBarCount < 1 || !isIsoDay(ev.yahooFirstBarDate)) { return bad('EVIDENCE_YAHOO'); }
  if (!Array.isArray(ev.higherBars) || ev.higherBars.length > MAX_HIGHER_BARS || !ev.higherBars.every(validateHigherBar)) { return bad('EVIDENCE_HIGHER_BARS'); }
  if (ev.coverageGap !== null) {
    const g = ev.coverageGap;
    if (!exactKeys(g, COVERAGE_GAP_KEYS) || !isIsoDay(g.uncoveredFrom) || !isIsoDay(g.uncoveredTo)) { return bad('EVIDENCE_COVERAGE_GAP'); }
    const ind = independentCheck(g.independent);
    if (!ind.ok) { return bad(ind.reason); }
  }
  if (ev.higherBars.some(function (b) { return b.disposition === 'contradicted-by-independent'; }) && ev.coverageGap === null) {
    return bad('EVIDENCE_COVERAGE_GAP');
  }
  if (!searchValueOk(ev.searchValue)) { return bad('EVIDENCE_SEARCH_VALUE'); }
  if (status === 'verified') {
    if (ev.matchedBar === null) { return bad('VERIFIED_NEEDS_MATCHED_BAR'); }
    if (ev.higherBars.some(function (b) { return b.disposition === 'unresolved'; })) { return bad('VERIFIED_WITH_UNRESOLVED_BAR'); }
  }
  return { ok: true };
}

function validateRecord(rec) {
  if (!isObject(rec)) { return bad('NOT_OBJECT'); }
  if (!exactKeys(rec, RECORD_KEYS)) { return bad('RECORD_KEYS'); }
  if (rec.schema !== SCHEMA || rec.basis !== BASIS) { return bad('RECORD_CONSTANTS'); }
  if (typeof rec.ticker !== 'string' || !TICKER_RE.test(rec.ticker) || rec.providerSymbol !== rec.ticker) { return bad('RECORD_TICKER'); }
  if (typeof rec.tradingViewSymbol !== 'string' || !TV_SYMBOL_RE.test(rec.tradingViewSymbol)) { return bad('RECORD_TV_SYMBOL'); }
  if (!currencyUnitOk(rec.currency, rec.unit)) { return bad('RECORD_UNIT'); }
  if (STATUSES.indexOf(rec.status) === -1) { return bad('RECORD_STATUS'); }
  if (rec.pending !== null) { return bad('RECORD_PENDING'); }
  if (!isIsoTimestamp(rec.lastCheckedAt)) { return bad('RECORD_TIMESTAMP'); }

  const hasValue = rec.athValue !== null || rec.athDate !== null;
  const hasVerifier = rec.verifiedAt !== null || rec.verifiedBy !== null;
  if (rec.status === 'verified' || (rec.status === 'stale-suspect' && hasValue)) {
    if (!isPositive(rec.athValue) || !isIsoDay(rec.athDate)) { return bad('RECORD_VALUE'); }
  }
  if (rec.status === 'verified' || (rec.status === 'stale-suspect' && hasVerifier)) {
    if (!isIsoTimestamp(rec.verifiedAt) || rec.verifiedBy !== 'operator') { return bad('RECORD_VERIFIER'); }
  }
  if (rec.status === 'unresolved' && (hasValue || hasVerifier)) { return bad('UNRESOLVED_CARRIES_VALUE'); }
  if (rec.status === 'stale-suspect' && (hasValue !== (rec.athValue !== null && rec.athDate !== null))) { return bad('RECORD_VALUE'); }

  const ev = validateEvidence(rec.evidence, rec.status);
  if (!ev.ok) { return ev; }
  if (rec.status === 'verified' && (rec.evidence.matchedBar.high !== rec.athValue || rec.evidence.matchedBar.date !== rec.athDate)) {
    return bad('ATH_MATCH_MISMATCH');
  }

  const r = rec.refresh;
  if (!exactKeys(r, REFRESH_KEYS) || REFRESH_STATUSES.indexOf(r.status) === -1) { return bad('RECORD_REFRESH'); }
  if (r.lastAttemptAt !== null && !isIsoTimestamp(r.lastAttemptAt)) { return bad('RECORD_REFRESH'); }
  if (r.reason !== null && !isNonEmptyString(r.reason, 80)) { return bad('RECORD_REFRESH'); }
  return { ok: true };
}

// ── scan-time comparison ──────────────────────────────────────────────────────
function unavailable() { return { state: 'unavailable', distancePct: null }; }

// Compare the current price / current high against a VERIFIED ATH. Anything else is
// `unavailable`: there is deliberately no other input and no fallback.
function compareToVerifiedAth(record, price, high) {
  if (!isObject(record) || record.status !== 'verified') { // compare-requires-verified
    return unavailable();
  }
  const ath = record.athValue;
  if (!isPositive(ath) || !isPositive(price)) { return unavailable(); }
  const dist = (ath - price) / ath;
  const distancePct = dist * 100;
  if ((isPositive(high) && high >= ath) || price >= ath) {
    return { state: 'at_or_above', distancePct: distancePct };
  }
  if (dist <= PROXIMITY) { return { state: 'near', distancePct: distancePct }; }
  return { state: 'below', distancePct: distancePct };
}

// ── verification ──────────────────────────────────────────────────────────────
// Deterministic match (no heuristic): among bars within the tolerance of the TradingView High,
// the one with the highest high (ties -> earliest date). Every bar with a higher high is a
// higher bar. Bars are { date, high }; non-finite entries are ignored.
function selectMatchedBar(bars, tradingViewHigh) {
  let best = null;
  const usable = (Array.isArray(bars) ? bars : []).filter(function (b) {
    return isObject(b) && isPositive(b.high) && typeof b.date === 'string';
  });
  usable.forEach(function (b) {
    if (isPositive(tradingViewHigh) && withinTolerance(b.high, tradingViewHigh)) {
      if (best === null || b.high > best.high || (b.high === best.high && b.date < best.date)) { best = b; }
    }
  });
  if (best === null) { return { matchedBar: null, higherBars: [] }; }
  const matchedBar = { date: best.date, high: best.high };
  const higherBars = usable
    .filter(function (b) { return b.high > matchedBar.high; })
    .map(function (b) { return { date: b.date, high: b.high }; })
    .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  return { matchedBar: matchedBar, higherBars: higherBars };
}

function validateAttempt(attempt) {
  if (!isObject(attempt)) { return invalid('ATTEMPT_INVALID'); }
  for (const k of Object.keys(attempt)) {
    if (!ALLOWED_ATTEMPT_KEYS.has(k)) { return invalid('UNKNOWN_ATTEMPT_KEY'); }
  }
  if (!ATTEMPT_KEYS.every(function (k) { return Object.prototype.hasOwnProperty.call(attempt, k); })) { return invalid('ATTEMPT_INVALID'); }
  if (typeof attempt.tradingViewSymbol !== 'string' || !TV_SYMBOL_RE.test(attempt.tradingViewSymbol)) { return invalid('ATTEMPT_INVALID'); }
  if (!currencyUnitOk(attempt.currency, attempt.unit)) { return invalid('ATTEMPT_INVALID'); }
  if (!isPositive(attempt.tradingViewHigh) || !isIsoDay(attempt.tradingViewFirstBarDate)) { return invalid('ATTEMPT_INVALID'); }
  if (ADJ_SETTINGS.indexOf(attempt.tradingViewAdjSetting) === -1) { return invalid('ATTEMPT_INVALID'); }
  if (!searchValueOk(attempt.searchValue)) { return invalid('ATTEMPT_INVALID'); }
  // The submitted Yahoo daily series: schema and consistency only (no plausibility of any value).
  if (!Array.isArray(attempt.bars) || attempt.bars.length < 1 || attempt.bars.length > MAX_BARS) { return invalid('SERIES_INVALID'); }
  let prevDate = '';
  for (const b of attempt.bars) {
    if (!exactKeys(b, SERIES_BAR_KEYS) || !isIsoDay(b.date) || !isPositive(b.high)) { return invalid('SERIES_INVALID'); }
    if (!(b.date > prevDate)) { return invalid('SERIES_ORDER_INVALID'); }
    prevDate = b.date;
  }
  if (attempt.independent !== null) {
    const ind = independentCheck(attempt.independent);
    if (!ind.ok) { return ind; }
  }
  return { ok: true };
}

// Which uncovered higher bars does the independent evidence contradict? Returns { contradicts }.
function independentVerdict(attempt, matched, bar, uncovered) {
  const ind = attempt.independent;
  if (ind.kind === 'ath-claim') {
    // The source states an ATH equal to the matched bar and reaches back to the earliest uncovered bar.
    return { contradicts: withinTolerance(ind.quotedValue, matched.high) && ind.coverageStart <= uncovered[0].date };
  }
  // bar-level: the source's own value for exactly this day differs from Yahoo's and is not itself above the ATH.
  return {
    contradicts: ind.quotedDate === bar.date &&
      !withinTolerance(ind.quotedValue, bar.high) &&
      ind.quotedValue <= matched.high * (1 + TOLERANCE)
  };
}

// Recompute the verification outcome ENTIRELY from the submitted evidence: the TradingView
// reading, the full Yahoo daily series and the optional independent evidence. The matched bar,
// every higher bar and the covered / uncovered split are derived here from the series; nothing
// the client says about them is used. `nowIso` is the server clock (series recency check).
//   { ok: true, status, reason, matchedBar, higherBars, coverageGap, series }  or  { ok: false, reason }
function classifyVerification(attempt, nowIso) {
  const v = validateAttempt(attempt);
  if (!v.ok) { return v; }
  if (!isIsoTimestamp(nowIso)) { return invalid('NOW_REQUIRED'); }

  // The series must reach (almost) to today: one cut short could hide a recent higher bar.
  const lastDate = attempt.bars[attempt.bars.length - 1].date;
  const ageDays = (Date.parse(nowIso.slice(0, 10) + 'T00:00:00Z') - Date.parse(lastDate + 'T00:00:00Z')) / 86400000;
  if (ageDays > MAX_SERIES_AGE_DAYS || ageDays < -1) { return invalid('SERIES_STALE'); }

  const series = { count: attempt.bars.length, firstBarDate: attempt.bars[0].date, lastBarDate: lastDate };
  const tv = attempt.tradingViewHigh;
  const sel = selectMatchedBar(attempt.bars, tv);
  const matched = sel.matchedBar;
  if (matched === null) {
    if (attempt.independent !== null) { return invalid('INDEPENDENT_NOT_APPLICABLE'); }
    return { ok: true, status: 'unresolved', reason: 'NO_CLEAN_MATCH', matchedBar: null, higherBars: [], coverageGap: null, series: series };
  }

  // Every bar of the series with a higher high than the matched bar (none dropped, none judged).
  const higher = sel.higherBars;
  if (higher.length > MAX_HIGHER_BARS) { return invalid('TOO_MANY_HIGHER_BARS'); }

  const uncovered = higher.filter(function (h) { return !(h.date >= attempt.tradingViewFirstBarDate); });
  if (attempt.independent !== null && uncovered.length === 0) { return invalid('INDEPENDENT_NOT_APPLICABLE'); }

  const classified = [];
  for (const h of higher) {
    const covered = h.date >= attempt.tradingViewFirstBarDate;
    let disposition = 'unresolved';
    let basis = null;
    if (covered) {
      // The TradingView High is the maximum over the history it covers. The matched bar is the
      // highest bar inside its 0.5% band (selectMatchedBar, the single shared predicate), so any
      // higher covered bar lies outside the band and is contradicted by the chart.
      disposition = 'contradicted-by-chart';
      basis = 'tradingview';
    } else {
      if (attempt.independent !== null) {
        const verdict = independentVerdict(attempt, matched, h, uncovered);
        disposition = verdict.contradicts ? 'contradicted-by-independent' : 'unresolved';
      }
      if (disposition === 'contradicted-by-independent') { basis = 'independent'; }
    }
    classified.push({ date: h.date, high: h.high, covered: covered, disposition: disposition, basis: basis });
  }

  const coverageGap = (uncovered.length > 0 && attempt.independent !== null)
    ? { uncoveredFrom: series.firstBarDate, uncoveredTo: attempt.tradingViewFirstBarDate, independent: attempt.independent }
    : null;
  const allCleared = classified.every(function (b) { return b.disposition !== 'unresolved'; });
  return {
    ok: true,
    status: allCleared ? 'verified' : 'unresolved',
    reason: allCleared ? null : 'UNCOVERED_HIGHER_BAR_UNRESOLVED',
    matchedBar: { date: matched.date, high: matched.high },
    higherBars: classified,
    coverageGap: coverageGap,
    series: series
  };
}

// Build the stored record from a submitted attempt and its recomputed classification.
function buildRecord(input) {
  const attempt = input.attempt;
  const classification = input.classification;
  const nowIso = input.nowIso;
  const verified = classification.status === 'verified';
  return {
    schema: SCHEMA,
    ticker: input.ticker,
    providerSymbol: input.ticker,
    tradingViewSymbol: attempt.tradingViewSymbol,
    currency: attempt.currency,
    unit: attempt.unit,
    basis: BASIS,
    status: classification.status,
    athValue: verified ? classification.matchedBar.high : null,
    athDate: verified ? classification.matchedBar.date : null,
    verifiedAt: verified ? nowIso : null,
    verifiedBy: verified ? 'operator' : null,
    evidence: {
      tradingViewHigh: attempt.tradingViewHigh,
      tradingViewFirstBarDate: attempt.tradingViewFirstBarDate,
      tradingViewAdjSetting: attempt.tradingViewAdjSetting,
      matchedBar: classification.matchedBar,
      toleranceUsed: TOLERANCE,
      yahooBarCount: classification.series.count,
      yahooFirstBarDate: classification.series.firstBarDate,
      higherBars: classification.higherBars,
      coverageGap: classification.coverageGap,
      searchValue: attempt.searchValue
    },
    refresh: { status: 'none', lastAttemptAt: null, reason: null },
    pending: null,
    lastCheckedAt: nowIso
  };
}

// A failed attempt against an existing record: the stored ATH, status and evidence are untouched;
// only the refresh state and the last-checked time change.
function withRefreshFailure(existing, reason, nowIso) {
  const copy = JSON.parse(JSON.stringify(existing));
  copy.refresh = { status: 'unresolved', lastAttemptAt: nowIso, reason: reason };
  copy.lastCheckedAt = nowIso;
  return copy;
}

module.exports = {
  SCHEMA,
  STORE_NAME,
  KEY_NAMESPACE,
  BASIS,
  TOLERANCE,
  PROXIMITY,
  MAX_HIGHER_BARS,
  MAX_BARS,
  MAX_SERIES_AGE_DAYS,
  STATUSES,
  CURRENCIES,
  UNITS,
  TICKER_RE,
  TV_SYMBOL_RE,
  RECORD_KEYS,
  EVIDENCE_KEYS,
  ATTEMPT_KEYS,
  recordKey,
  isIsoDay,
  isIsoTimestamp,
  currencyUnitOk,
  withinTolerance,
  validateRecord,
  compareToVerifiedAth,
  selectMatchedBar,
  validateAttempt,
  classifyVerification,
  buildRecord,
  withRefreshFailure
};
