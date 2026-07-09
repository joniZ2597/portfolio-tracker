'use strict';

/*
 * netlify/functions/lib/portfolio-ticker-source.js
 *
 * EG-21B — portfolio batch ticker source (PURE, DORMANT).
 *
 * Derives the batch ticker list for the (still-deferred) portfolio batch pull
 * from a whitelisted portfolio-sync doc object. Ratified owner decisions:
 *   D1: ticker source = holdings KEYS only (holdings values are never read).
 *   D2: more than 25 distinct symbols = hard reject (never truncate).
 *   D3: accepted input = the whitelisted portfolio-sync doc object ONLY —
 *       raw GET envelopes like { status, doc } are rejected.
 *
 * DORMANCY / SAFETY:
 *   - No HTTP route, no handler export, no caller anywhere in the repo.
 *   - Import-inert: zero require(), zero import-time work.
 *   - Reads NO process.env, opens no network, constructs no persistence
 *     handle, touches no web storage and no DOM. Everything is injected by
 *     the (future, separately approved) caller.
 *   - Never mutates the injected doc; the returned tickers array is fresh.
 *
 * Contract (frozen by qa/portfolio_ticker_source_offline.js):
 *   extractBatchTickers(doc[, opts])
 *     -> { ok: true, tickers: [...] }   (exact key set; deduped, sorted
 *                                        lexicographically ascending, 1..25
 *                                        entries, holdings keys verbatim)
 *      | { ok: false, reason }          (exact key set; reason in fixed vocab)
 *
 * Fixed failure vocabulary (first failure wins):
 *   DOC_INVALID, RAW_ENVELOPE, SCHEMA_VERSION_INVALID, HOLDINGS_INVALID,
 *   TICKER_INVALID, TICKERS_EMPTY, TICKERS_TOO_MANY.
 *
 * opts is accepted for signature stability only and is COMPLETELY unread —
 * reserved for future use; no option may ever weaken TICKER_RE or the
 * 25-symbol cap (both ratified hard rules).
 */

// Strict, non-normalized ticker rule — identical to portfolio-sync SYMBOL_RE,
// the pull preflight TICKER_RE, and the batch driver BATCH_TICKER_RE. Defined
// locally (never imported); equivalence is pinned by the BTS11 drift test.
const TICKER_RE = /^[A-Z]{1,10}$/;

// Distinct-symbol hard ceiling == the server allowlist ceiling (preflight
// MAX_ALLOWED_TICKERS, batch driver MAX_BATCH_TICKERS). Pinned by BTS11.
const MAX_BATCH_TICKERS = 25;

// Plain-object rule — same semantics as portfolio-sync isPlainObject: reject
// null / non-object / array; prototype must be Object.prototype or null.
function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function fail(reason) {
  return { ok: false, reason: reason };
}

// extractBatchTickers derives the deduped, lexicographically sorted batch
// ticker list from the holdings KEYS of a whitelisted portfolio-sync doc.
// Fail-closed, first-failure-wins; mutates none of its inputs.
function extractBatchTickers(doc, opts) {
  // 1) The input must itself be a plain object (not a primitive, array,
  //    Map, or class instance).
  if (!isPlainObject(doc)) {
    return fail('DOC_INVALID');
  }

  // 2) Raw GET envelopes are rejected outright (D3). The whitelisted doc
  //    never carries a 'doc' or 'status' key, so an own property of either
  //    name is an unambiguous envelope marker — covering both the success
  //    envelope { status, doc } and failure envelopes { status: 'ERROR' }.
  if (hasOwn(doc, 'doc') || hasOwn(doc, 'status')) {
    return fail('RAW_ENVELOPE');
  }

  // 3) schemaVersion must be exactly the number 1 (strict; '1' fails).
  if (doc.schemaVersion !== 1) {
    return fail('SCHEMA_VERSION_INVALID');
  }

  // 4) holdings must be a plain object (missing/null/array/Map all fail).
  if (!isPlainObject(doc.holdings)) {
    return fail('HOLDINGS_INVALID');
  }

  // 5) Source symbols are the holdings KEYS only (D1); an empty list fails.
  const keys = Object.keys(doc.holdings);
  if (keys.length === 0) {
    return fail('TICKERS_EMPTY');
  }

  // 6) Every symbol must ALREADY be strict-valid — no normalization (a
  //    lowercase or corrupted key is a data defect upstream, not ours to
  //    repair); one bad symbol rejects the WHOLE list (never a silent drop).
  for (let i = 0; i < keys.length; i++) {
    if (!TICKER_RE.test(keys[i])) {
      return fail('TICKER_INVALID');
    }
  }

  // 7) Dedupe (defensive — plain-object keys are already unique).
  const distinct = new Set(keys);

  // 8) Overflow is a hard reject (D2) — never truncate to fit.
  if (distinct.size > MAX_BATCH_TICKERS) {
    return fail('TICKERS_TOO_MANY');
  }

  // 9) Deterministic output: fresh array, lexicographic ascending (default
  //    code-unit sort is lexicographic for uppercase A-Z symbols).
  return { ok: true, tickers: Array.from(distinct).sort() };
}

module.exports = { extractBatchTickers };
