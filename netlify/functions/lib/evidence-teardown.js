'use strict';

/*
 * netlify/functions/lib/evidence-teardown.js
 *
 * EG-20C Slice 2H — exact-key SEC evidence teardown (PURE, DORMANT, injected-only).
 *
 * A planner + executor pair that reverses a single SEC evidence-store write by
 * deleting ONLY the exact keys the writer authoritatively reported it created
 * (writtenKeys). It is PURE and dependency-injected: it reads NO runtime
 * environment, imports NO module, opens no network, and constructs no persistence
 * handle. The store is injected by the caller; this module never requires
 * @netlify/blobs and never calls getStore. It never calls store.set / setJSON —
 * only store.delete (and store.get for the opt-in read-back verification).
 *
 * DORMANCY / SAFETY (this module owns none of these as flags; safety is structural):
 *   - No HTTP route, no handler export, no caller anywhere -> not invocable.
 *   - Import-inert: requiring this module performs ZERO I/O.
 *   - Keys are taken SOLELY from the writer's authoritative writtenKeys. ticker /
 *     cik are echoed as bounded metadata only and are NEVER used to construct or
 *     reconstruct a key — a drifting or hostile ticker/cik can therefore never
 *     widen or redirect what is deleted.
 *   - Dry-run is the DEFAULT and the operative safety gate: a real store.delete is
 *     issued ONLY when opts.dryRun === false (strict). Absent opts, opts:{}, true,
 *     or any truthy value all perform ZERO deletes.
 *   - The executor RE-VALIDATES plan.keys (full validator, not just per-key) before
 *     any delete, so a tampered plan (extra / duplicate / malformed / mis-ordered
 *     key) is rejected before touching the store.
 *
 * Contract (frozen by qa/evidence_teardown_offline.js):
 *   planEvidenceTeardown({ writtenKeys, ticker, cik })
 *     -> { ok:true, keys:[...deleteOrder], count, metadata:{ ticker, cik } }
 *      | { ok:false, reason }   (reason in fixed vocab)
 *   executeEvidenceTeardown(store, plan, opts)
 *     -> { status, dryRun, ... }   (status in fixed vocab)
 */

// Anchored allowlist — the ONLY two key shapes the SEC evidence store writes.
// Kept in exact lockstep with evidence-store.js cikKey() / companyKey(); the
// equivalence is pinned by the offline drift test, not by importing that file.
//   cikKey(ticker)  -> secstore:v1:cik:<TICKER>   (mapping / pointer: ticker -> cik)
//   companyKey(cik) -> secstore:v1:company:<CIK>  (record: holds evidenceItems)
// Exact-match anchors reject broad / namespace-only / budget / malformed keys.
const MAPPING_KEY_RE = /^secstore:v1:cik:[A-Z]{1,10}$/;
const RECORD_KEY_RE  = /^secstore:v1:company:\d{10}$/;

const MAX_KEYS = 2;

// Fixed-vocabulary delete-error sanitizer (mirrors evidence-store.js
// sanitizeReadError): emits ONLY an allowlisted errorName; never touches
// err.message / err.stack / err.toString(); the property read is guarded so a
// hostile getter cannot throw out of the sanitizer.
const DELETE_ERROR_NAMES = [
  'Error', 'TypeError', 'RangeError', 'AbortError', 'TimeoutError',
  'FetchError', 'SystemError', 'BlobsInternalError', 'BlobsConsistencyError',
  'MissingBlobsEnvironmentError'
];
function safeErrorName(err) {
  let name;
  try { name = err && err.name; } catch (_) { name = undefined; }
  if (typeof name === 'string' && DELETE_ERROR_NAMES.indexOf(name) !== -1) {
    return name;
  }
  return 'UnknownError';
}

// classifyKey -> 'mapping' | 'record' | null. null means the value is NOT an
// exact-match allowlisted key (non-string, broad, namespace-only, or malformed).
function classifyKey(key) {
  if (typeof key !== 'string') { return null; }
  if (MAPPING_KEY_RE.test(key)) { return 'mapping'; }
  if (RECORD_KEY_RE.test(key)) { return 'record'; }
  return null;
}

// validateKeys is the SINGLE source of truth used by BOTH the planner (to build a
// plan) and the executor (to re-validate plan.keys before any delete). It enforces:
//   - input is an array
//   - <= MAX_KEYS (2) entries
//   - every entry is an exact-match allowlisted key (rejects malformed / broad)
//   - no exact-duplicate key, and at most ONE key of each type (mapping / record)
// Returns { ok:true, keys:[...deleteOrder] } | { ok:false, reason }.
// deleteOrder is mapping-BEFORE-record: the pointer is removed before the record
// it points at, so a mid-run failure can never orphan a live mapping. This is the
// reverse of the writer's authoritative write order [companyKey, cikKey].
function validateKeys(keys) {
  if (!Array.isArray(keys)) { return { ok: false, reason: 'WRITTEN_KEYS_INVALID' }; }
  if (keys.length > MAX_KEYS) { return { ok: false, reason: 'TOO_MANY_KEYS' }; }

  const seen = new Set();
  let mapping = null;
  let record = null;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const kind = classifyKey(key);
    if (kind === null) { return { ok: false, reason: 'KEY_MALFORMED' }; }
    if (seen.has(key)) { return { ok: false, reason: 'DUPLICATE_KEY' }; }
    seen.add(key);
    if (kind === 'mapping') {
      if (mapping !== null) { return { ok: false, reason: 'DUPLICATE_KEY' }; }
      mapping = key;
    } else {
      if (record !== null) { return { ok: false, reason: 'DUPLICATE_KEY' }; }
      record = key;
    }
  }

  const ordered = [];
  if (mapping !== null) { ordered.push(mapping); }
  if (record !== null) { ordered.push(record); }
  return { ok: true, keys: ordered };
}

// Bounded, fixed-shape metadata echo for logging / traceability. Each field is
// coerced to its exact canonical shape or null — never an arbitrary passthrough.
// These values are echoed ONLY; they are NEVER used to construct or reconstruct a
// teardown key (the strings below are validators, not key builders).
const META_TICKER_RE = /^[A-Z]{1,10}$/;
const META_CIK_RE = /^\d{10}$/;
function boundedMetadata(ticker, cik) {
  return {
    ticker: (typeof ticker === 'string' && META_TICKER_RE.test(ticker)) ? ticker : null,
    cik: (typeof cik === 'string' && META_CIK_RE.test(cik)) ? cik : null
  };
}

// planEvidenceTeardown builds an exact-key teardown plan from the writer's
// AUTHORITATIVE writtenKeys. Keys come SOLELY from writtenKeys; ticker / cik are
// echoed as bounded metadata only.
function planEvidenceTeardown(input) {
  const inp = isObject(input) ? input : {};
  const v = validateKeys(inp.writtenKeys);
  if (!v.ok) { return { ok: false, reason: v.reason }; }
  return {
    ok: true,
    keys: v.keys,
    count: v.keys.length,
    metadata: boundedMetadata(inp.ticker, inp.cik)
  };
}

// executeEvidenceTeardown deletes the planned keys from the INJECTED store.
//   { status:'INVALID_PLAN', reason, dryRun }              — no store touch
//   { status:'NOOP', deleted:[], dryRun }                  — no keys, no store touch
//   { status:'DRY_RUN', dryRun:true, plannedDeletes:[...] } — zero deletes
//   { status:'DELETED', dryRun:false, deleted:[...], verified? }
//   { status:'DELETE_ERROR', dryRun:false, deleted:[...before], failedKey, errorName }
async function executeEvidenceTeardown(store, plan, opts) {
  const o = isObject(opts) ? opts : {};
  const dryRun = o.dryRun !== false; // default true; real delete ONLY on strict false

  if (!isObject(plan) || plan.ok !== true) {
    return { status: 'INVALID_PLAN', reason: 'PLAN_NOT_OK', dryRun: dryRun };
  }
  // Defense-in-depth: re-run the FULL validator against plan.keys before any I/O.
  const v = validateKeys(plan.keys);
  if (!v.ok) {
    return { status: 'INVALID_PLAN', reason: v.reason, dryRun: dryRun };
  }
  const keys = v.keys;

  if (keys.length === 0) {
    return { status: 'NOOP', deleted: [], dryRun: dryRun };
  }

  if (dryRun) {
    return { status: 'DRY_RUN', dryRun: true, plannedDeletes: keys.slice() };
  }

  // Real deletion — requires an injected store exposing a delete() function.
  if (!store || typeof store.delete !== 'function') {
    return { status: 'INVALID_PLAN', reason: 'STORE_UNAVAILABLE', dryRun: false };
  }

  const deleted = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      await store.delete(key);
    } catch (err) {
      // Stop at the first failure. Because deletes run mapping-first, a mid-run
      // failure can leave at most an orphaned record — never a dangling mapping.
      return {
        status: 'DELETE_ERROR',
        dryRun: false,
        deleted: deleted.slice(),
        failedKey: key,
        errorName: safeErrorName(err)
      };
    }
    deleted.push(key);
  }

  const result = { status: 'DELETED', dryRun: false, deleted: deleted.slice() };

  // Opt-in read-back verification: confirm each deleted key now reads absent.
  if (o.verify === true) {
    let verified = true;
    if (!store || typeof store.get !== 'function') {
      verified = false;
    } else {
      for (let i = 0; i < deleted.length; i++) {
        let raw;
        try { raw = await store.get(deleted[i]); } catch (_) { verified = false; break; }
        if (raw !== null && raw !== undefined) { verified = false; break; }
      }
    }
    result.verified = verified;
  }

  return result;
}

function isObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

module.exports = { planEvidenceTeardown, executeEvidenceTeardown, safeErrorName };
