'use strict';

/*
 * netlify/functions/lib/evidence-freshness.js
 *
 * EG-25C-1 · C1-S5 — J7 evidence-freshness job (route-less pure library).
 *
 * evaluateEvidenceFreshness(records, windowTable, checkedAt, meta) -> report.
 * Classifies caller-assembled evidence snapshots into a deterministic
 * freshness report. The evaluator performs ZERO I/O of its own: no store, no
 * network, no environment, no ambient clock (checkedAt is injected epoch ms;
 * production passes Date-now at the CALL boundary, QA passes a fixed number),
 * no DOM, no persistence, no scoring contact. Same inputs => byte-identical
 * report. The function never throws: any unexpected evaluator exception
 * returns the exact all-or-nothing EVALUATOR_ERROR fallback report — no
 * partial state ever leaks.
 *
 * Snapshot schema (caller assembles; owner-ratified rev-2 contract):
 *   { family, key, record, timestamps }
 * `record` is the evidence record itself — the evaluator never inspects an
 * outer API/store/provider envelope; a caller whose timestamp exists only on
 * an outer envelope must project it into the record before calling J7.
 * Candidate timestamps, exact precedence (first accepted wins):
 *   timestamps.filed -> timestamps.periodEnd -> timestamps.asOf ->
 *   timestamps.eventDate -> record.fetchedAt
 * A `timestamps.fetchedAt` value is IGNORED — fetchedAt is read ONLY from the
 * record. Accepted grammars (strict, manual parsing — no permissive parser):
 * real calendar YYYY-MM-DD (UTC midnight) or UTC-Z ISO datetime
 * YYYY-MM-DDThh:mm:ss(.fff)Z; timezone offsets are rejected. In record
 * validity, `fetchedAt` is grammar-checked when present; an absent or null
 * fetchedAt is not a contract defect — the record then simply has no
 * fallback candidate (this is what makes NO_TIMESTAMP reachable, per the
 * ratified FH05/FH12 fixtures).
 *
 * Identity strings (family, non-null key, meta.ticker, expectedFamilies
 * entries, record.ticker, sourceTier, contractVersion, provider,
 * windowTable.version) are valid only under the exact ratified rule
 * `typeof v === 'string' && v.length > 0 && v === v.trim()` — whitespace-only,
 * leading-padded, and trailing-padded values (including U+00A0 and anything
 * trim() strips) are invalid. No silent normalization ever occurs and a
 * trimmed replacement is never emitted: values are compared and looked up
 * verbatim, and an original string is echoed into the report only after
 * passing validation. Every recognized-family record — producerless
 * canonical, custom, and facts alike — must carry a valid `provider`
 * identity string (facts additionally pins its exact value).
 *
 * Per-item first-failure ladder (owner-pinned; local element defects precede
 * the global clock defect):
 *   1 MALFORMED_SNAPSHOT   element not a plain object, family not a valid
 *                          identity string, or key not (null | valid identity
 *                          string) — sanitized null echoes
 *   2 UNKNOWN_FAMILY       family not a key of the RESOLVED window table
 *   3 RECORD_UNREADABLE    record null/undefined (sole producer of `missing`)
 *   4 CONTRACT_INVALID     record present but fails the family's validity
 *   5 CHECKED_AT_INVALID   invalid clock (timestamp selection still runs,
 *                          ageDays null)
 *   6 NO_TIMESTAMP         valid clock, no accepted candidate
 *   7 TIMESTAMP_AHEAD_OF_CLOCK  negative ageDays (value preserved)
 *   8 fresh | aging | stale     literal thresholds, inclusive bounds:
 *                          fresh iff ageDays <= agingAfterDays, aging iff
 *                          ageDays <= staleAfterDays, else stale
 *
 * Report-level degradedNotes are a different output domain from item reasons
 * (no precedence exists between them): EXPECTED_FAMILIES_INVALID concerns
 * only meta.expectedFamilies/coverageScore and never suppresses or replaces
 * per-record results. coverageScore = |families in effectiveExpected with at
 * least one fresh|aging item| / |effectiveExpected| (deduped first-seen);
 * empty or rejected expected list => 0; display-only, never score-shaped.
 *
 * Exported DATA constants are recursively frozen; the evaluator function is
 * not frozen, and caller inputs are never frozen or modified.
 */

var DAY_MS = 86400000;

var WINDOW_TABLE_VERSION = 'eg25c1-spec-v1';

var CANONICAL_FAMILIES = deepFreeze([
  'facts', 'filings', 'capitalReturns', 'estimates', 'news', 'catalysts', 'insider'
]);

var DEFAULT_WINDOW_TABLE = deepFreeze({
  version: WINDOW_TABLE_VERSION,
  families: {
    facts: { agingAfterDays: 60.5, staleAfterDays: 121 },
    filings: { agingAfterDays: 60.5, staleAfterDays: 121 },
    capitalReturns: { agingAfterDays: 60.5, staleAfterDays: 121 },
    estimates: { agingAfterDays: 3.5, staleAfterDays: 7 },
    news: { agingAfterDays: 7, staleAfterDays: 30 },
    catalysts: { agingAfterDays: 7, staleAfterDays: 30 },
    insider: { agingAfterDays: 3.5, staleAfterDays: 7 }
  }
});

// Precedence names are the bare timestampSource output values; the first four
// are read from `timestamps.*`, the last ONLY from `record.fetchedAt`.
var TIMESTAMP_PRECEDENCE = deepFreeze(['filed', 'periodEnd', 'asOf', 'eventDate', 'fetchedAt']);

var REASONS = deepFreeze([
  'MALFORMED_SNAPSHOT', 'UNKNOWN_FAMILY', 'RECORD_UNREADABLE', 'CONTRACT_INVALID',
  'CHECKED_AT_INVALID', 'NO_TIMESTAMP', 'TIMESTAMP_AHEAD_OF_CLOCK'
]);

// Fixed emission order for report.degradedNotes (each at most once).
var DEGRADED_NOTES = deepFreeze([
  'WINDOW_TABLE_INVALID', 'WINDOW_TABLE_UNVERSIONED', 'CHECKED_AT_INVALID',
  'RECORDS_INVALID', 'EXPECTED_FAMILIES_INVALID', 'EVALUATOR_ERROR'
]);

// Recursive freeze for the module's OWN exported constants only — never
// applied to caller inputs.
function deepFreeze(value) {
  Object.keys(value).forEach(function (k) {
    var v = value[k];
    if (v && typeof v === 'object') { deepFreeze(v); }
  });
  return Object.freeze(value);
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isIdentityString(v) {
  return typeof v === 'string' && v.length > 0 && v === v.trim();
}

function hasOwn(obj, name) {
  return Object.prototype.hasOwnProperty.call(obj, name);
}

// ── strict manual timestamp parsing (no permissive parser, no Date object) ──
var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
var DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;
var MONTH_DAYS = deepFreeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function isRealYmd(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1) { return false; }
  var max = (mo === 2 && isLeapYear(y)) ? 29 : MONTH_DAYS[mo - 1];
  return d <= max;
}

// Proleptic-Gregorian days since 1970-01-01 (civil-days algorithm) — exact
// integer UTC math, no timezone dependence.
function daysFromCivil(y, mo, d) {
  var yy = y - (mo <= 2 ? 1 : 0);
  var era = Math.floor(yy / 400);
  var yoe = yy - era * 400;
  var doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  var doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

// Strict date grammar -> epoch ms at UTC midnight, else null.
function parseStrictDate(s) {
  var m = DATE_RE.exec(s);
  if (!m) { return null; }
  var y = +m[1]; var mo = +m[2]; var d = +m[3];
  if (!isRealYmd(y, mo, d)) { return null; }
  return daysFromCivil(y, mo, d) * DAY_MS;
}

// Strict UTC-Z ISO datetime grammar -> epoch ms, else null. Offsets rejected
// by the grammar itself (only a literal trailing Z matches).
function parseStrictDatetime(s) {
  var m = DATETIME_RE.exec(s);
  if (!m) { return null; }
  var y = +m[1]; var mo = +m[2]; var d = +m[3];
  var hh = +m[4]; var mi = +m[5]; var ss = +m[6];
  if (!isRealYmd(y, mo, d)) { return null; }
  if (hh > 23 || mi > 59 || ss > 59) { return null; }
  var frac = m[7] === undefined ? 0 : +((m[7] + '00').slice(0, 3));
  return daysFromCivil(y, mo, d) * DAY_MS + ((hh * 60 + mi) * 60 + ss) * 1000 + frac;
}

// A candidate is usable when it is a string in either accepted grammar.
function parseCandidate(v) {
  if (typeof v !== 'string') { return null; }
  var ms = parseStrictDate(v);
  if (ms !== null) { return ms; }
  return parseStrictDatetime(v);
}

// Precedence walk. The four projected candidates come from `timestamps`; the
// fetchedAt fallback comes ONLY from `record.fetchedAt` (a timestamps.fetchedAt
// value is never read). Unusable candidates are skipped.
function pickTimestamp(timestamps, record) {
  var tsObj = isPlainObject(timestamps) ? timestamps : null;
  for (var i = 0; i < TIMESTAMP_PRECEDENCE.length; i++) {
    var source = TIMESTAMP_PRECEDENCE[i];
    var raw = source === 'fetchedAt'
      ? record.fetchedAt
      : (tsObj ? tsObj[source] : undefined);
    var ms = parseCandidate(raw);
    if (ms !== null) { return { source: source, raw: raw, ms: ms }; }
  }
  return null;
}

// ── record validity (E-C; identity-strict, no whitespace normalization) ─────
var FACTS_CONTRACT_VERSION = 'fund-contract-v1';
var FACTS_SOURCE_TIER = 'sec_xbrl_primary';
var FACTS_PROVIDER = 'j1-sec-facts@job-model-v1';

function validRecord(family, record) {
  if (!isPlainObject(record)) { return false; }
  if (!isIdentityString(record.ticker)) { return false; }
  if (!isIdentityString(record.sourceTier)) { return false; }
  if (!isIdentityString(record.contractVersion)) { return false; }
  if (!isIdentityString(record.provider)) { return false; }
  // fetchedAt: grammar-checked when present; absent/null is not a defect
  // (the record then has no fallback candidate).
  if (record.fetchedAt !== undefined && record.fetchedAt !== null) {
    if (typeof record.fetchedAt !== 'string' || parseStrictDatetime(record.fetchedAt) === null) { return false; }
  }
  if (family === 'facts') {
    if (record.contractVersion !== FACTS_CONTRACT_VERSION) { return false; }
    if (record.sourceTier !== FACTS_SOURCE_TIER) { return false; }
    if (record.provider !== FACTS_PROVIDER) { return false; }
    if (typeof record.runId !== 'number' || !isFinite(record.runId)) { return false; }
  }
  return true;
}

// ── input resolution ────────────────────────────────────────────────────────
function validWindowEntry(entry) {
  return isPlainObject(entry) &&
    typeof entry.agingAfterDays === 'number' && isFinite(entry.agingAfterDays) &&
    typeof entry.staleAfterDays === 'number' && isFinite(entry.staleAfterDays) &&
    entry.agingAfterDays >= 0 &&
    entry.agingAfterDays <= entry.staleAfterDays;
}

// Accepts a custom table only when every entry (canonical AND custom extras)
// is valid and all seven canonical families are present; otherwise the frozen
// default is substituted in full (all-or-nothing, R-2).
function resolveWindowTable(input) {
  var valid = isPlainObject(input) && isPlainObject(input.families);
  if (valid) {
    var names = Object.keys(input.families);
    for (var i = 0; i < names.length && valid; i++) {
      if (!validWindowEntry(input.families[names[i]])) { valid = false; }
    }
    for (var c = 0; c < CANONICAL_FAMILIES.length && valid; c++) {
      if (!hasOwn(input.families, CANONICAL_FAMILIES[c])) { valid = false; }
    }
  }
  if (!valid) {
    return { families: DEFAULT_WINDOW_TABLE.families, version: WINDOW_TABLE_VERSION, note: 'WINDOW_TABLE_INVALID' };
  }
  if (isIdentityString(input.version)) {
    return { families: input.families, version: input.version, note: null };
  }
  return { families: input.families, version: 'unversioned', note: 'WINDOW_TABLE_UNVERSIONED' };
}

function isValidCheckedAt(v) {
  return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 0;
}

// meta resolves AGAINST the resolved table, BEFORE records are processed.
// Whole-list fail-closed (R-1): any non-identity-string or unrecognized entry
// rejects the entire list. Duplicates are valid and dedupe first-seen; [] is
// valid (explicit empty expectation, no note). Never inferred from records.
function resolveMeta(meta, familiesObj) {
  var metaObj = isPlainObject(meta) ? meta : null;
  var ticker = (metaObj && isIdentityString(metaObj.ticker)) ? metaObj.ticker : null;
  var ef = metaObj ? metaObj.expectedFamilies : undefined;
  var effective = [];
  var ok = Array.isArray(ef);
  if (ok) {
    for (var i = 0; i < ef.length; i++) {
      var entry = ef[i];
      if (!isIdentityString(entry) || !hasOwn(familiesObj, entry)) { ok = false; break; }
      if (effective.indexOf(entry) === -1) { effective.push(entry); }
    }
  }
  if (!ok) { effective = []; }
  return { ticker: ticker, effective: effective, note: ok ? null : 'EXPECTED_FAMILIES_INVALID' };
}

// ── item construction (key insertion order is stringify-normative) ──────────
function makeItem(family, key, asOf, source, usedFallback, ageDays, state, reason) {
  return {
    family: family,
    key: key,
    asOf: asOf,
    timestampSource: source,
    usedFetchedAtFallback: usedFallback,
    ageDays: ageDays,
    state: state,
    reason: reason
  };
}

function classifyItem(el, familiesObj, clockValid, checkedAt) {
  // 1) element identity — sanitized echoes: only validated original strings
  //    (or null) ever reach the report.
  var elObj = isPlainObject(el) ? el : null;
  var famRaw = elObj ? elObj.family : undefined;
  var keyRaw = elObj ? elObj.key : undefined;
  var famValid = isIdentityString(famRaw);
  var keyValid = keyRaw === null || isIdentityString(keyRaw);
  var famOut = famValid ? famRaw : null;
  var keyOut = (keyValid && typeof keyRaw === 'string') ? keyRaw : null;
  if (!elObj || !famValid || !keyValid) {
    return makeItem(famOut, keyOut, null, null, false, null, 'degraded', 'MALFORMED_SNAPSHOT');
  }

  // 2) an identity-valid family absent from the RESOLVED table (a padded
  //    family never reaches this step — it failed step 1).
  if (!hasOwn(familiesObj, famRaw)) {
    return makeItem(famOut, keyOut, null, null, false, null, 'degraded', 'UNKNOWN_FAMILY');
  }
  var win = familiesObj[famRaw];

  // 3) readability — the sole producer of `missing`.
  var record = elObj.record;
  if (record === null || record === undefined) {
    return makeItem(famOut, keyOut, null, null, false, null, 'missing', 'RECORD_UNREADABLE');
  }

  // 4) contract validity — an invalid record's timestamps are not trusted.
  if (!validRecord(famRaw, record)) {
    return makeItem(famOut, keyOut, null, null, false, null, 'degraded', 'CONTRACT_INVALID');
  }

  // 5) invalid clock — selection still runs (fail-visible), ageDays null.
  var sel = pickTimestamp(elObj.timestamps, record);
  if (!clockValid) {
    return makeItem(famOut, keyOut, sel ? sel.raw : null, sel ? sel.source : null,
      sel ? sel.source === 'fetchedAt' : false, null, 'degraded', 'CHECKED_AT_INVALID');
  }

  // 6) no accepted candidate at any precedence level.
  if (!sel) {
    return makeItem(famOut, keyOut, null, null, false, null, 'degraded', 'NO_TIMESTAMP');
  }

  // 7) future timestamp — negative ageDays preserved, never silently fresh.
  var ageDays = Math.floor((checkedAt - sel.ms) / DAY_MS);
  var usedFallback = sel.source === 'fetchedAt';
  if (ageDays < 0) {
    return makeItem(famOut, keyOut, sel.raw, sel.source, usedFallback, ageDays, 'degraded', 'TIMESTAMP_AHEAD_OF_CLOCK');
  }

  // 8) literal thresholds, inclusive bounds.
  var state = ageDays <= win.agingAfterDays ? 'fresh'
    : (ageDays <= win.staleAfterDays ? 'aging' : 'stale');
  return makeItem(famOut, keyOut, sel.raw, sel.source, usedFallback, ageDays, state, null);
}

// ── evaluator ───────────────────────────────────────────────────────────────
function evaluateEvidenceFreshness(records, windowTable, checkedAt, meta) {
  try {
    var table = resolveWindowTable(windowTable);
    var clockValid = isValidCheckedAt(checkedAt);
    var metaRes = resolveMeta(meta, table.families);
    var recordsValid = Array.isArray(records);

    var items = [];
    if (recordsValid) {
      for (var i = 0; i < records.length; i++) {
        items.push(classifyItem(records[i], table.families, clockValid, checkedAt));
      }
    }

    var counts = { fresh: 0, aging: 0, stale: 0, missing: 0, degraded: 0 };
    var qualifying = Object.create(null);
    for (var j = 0; j < items.length; j++) {
      counts[items[j].state] += 1;
      if ((items[j].state === 'fresh' || items[j].state === 'aging') && items[j].family !== null) {
        qualifying[items[j].family] = true;
      }
    }

    var numerator = 0;
    for (var f = 0; f < metaRes.effective.length; f++) {
      if (qualifying[metaRes.effective[f]] === true) { numerator += 1; }
    }
    var coverageScore = metaRes.effective.length > 0 ? numerator / metaRes.effective.length : 0;

    var degradedNotes = [];
    if (table.note === 'WINDOW_TABLE_INVALID') { degradedNotes.push('WINDOW_TABLE_INVALID'); }
    if (table.note === 'WINDOW_TABLE_UNVERSIONED') { degradedNotes.push('WINDOW_TABLE_UNVERSIONED'); }
    if (!clockValid) { degradedNotes.push('CHECKED_AT_INVALID'); }
    if (!recordsValid) { degradedNotes.push('RECORDS_INVALID'); }
    if (metaRes.note === 'EXPECTED_FAMILIES_INVALID') { degradedNotes.push('EXPECTED_FAMILIES_INVALID'); }

    return {
      ticker: metaRes.ticker,
      checkedAt: clockValid ? checkedAt : null,
      windowTableVersion: table.version,
      items: items,
      counts: counts,
      coverageScore: coverageScore,
      degradedNotes: degradedNotes
    };
  } catch (_) {
    // All-or-nothing defensive fallback — the exact owner-pinned report; no
    // partially computed state may survive an unexpected evaluator exception.
    return {
      ticker: null,
      checkedAt: null,
      windowTableVersion: WINDOW_TABLE_VERSION,
      items: [],
      counts: { fresh: 0, aging: 0, stale: 0, missing: 0, degraded: 0 },
      coverageScore: 0,
      degradedNotes: ['EVALUATOR_ERROR']
    };
  }
}

module.exports = {
  evaluateEvidenceFreshness: evaluateEvidenceFreshness,
  DEFAULT_WINDOW_TABLE: DEFAULT_WINDOW_TABLE,
  WINDOW_TABLE_VERSION: WINDOW_TABLE_VERSION,
  TIMESTAMP_PRECEDENCE: TIMESTAMP_PRECEDENCE,
  REASONS: REASONS,
  DEGRADED_NOTES: DEGRADED_NOTES
};
