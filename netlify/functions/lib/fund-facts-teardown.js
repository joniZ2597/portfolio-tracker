'use strict';

/*
 * netlify/functions/lib/fund-facts-teardown.js
 *
 * C1-S6 LAB CANDIDATE (v2) — response-aware exact-key fund-facts teardown.
 *
 * STATUS: isolated experimental lab candidate. NOT owner-ratified, NOT wired to
 * any caller, NOT integrated. No route, no handler, no gate, no runtime contact.
 *
 * This module decides which fund-facts store keys a prior C1-S3 core response
 * proves are safe to delete, plans the deletion order, and (only when explicitly
 * told to) executes it against an injected store.
 *
 * PURITY
 *   Zero require / import. No network, no clock, no environment, no store
 *   construction. The store is injected by the caller and only two methods are
 *   ever touched: the delete method, and — when verification is opted into and
 *   at least one key was really deleted — the read method.
 *
 * PUBLIC SURFACE (exactly three)
 *   classifyFundFactsResponse, planFundFactsTeardown, executeFundFactsTeardown
 *   Everything else, including the error sanitizer and every vocabulary, is
 *   private. There are no test-only exports.
 *
 * INPUT CONTRACT
 *   classifyFundFactsResponse accepts the PARSED RESPONSE BODY object only.
 *   The C1-S3 core returns a Lambda envelope whose body is a JSON string; the
 *   caller parses it. An envelope handed here fails closed as NOT_CLASSIFIABLE.
 *
 * FIELD SEPARATION
 *   The classifier reports EVIDENCE and never an executable set:
 *     evidenceKeys + count, never keys, never a delete order.
 *   The planner reports an EXECUTABLE set and never evidence:
 *     keys + count, never evidenceKeys, never a public delete order.
 *   The write-to-delete reversal happens inside the planner. A quarantined
 *   response therefore still carries its evidence at the classifier layer while
 *   the plan derived from it carries no keys at all.
 *
 * THE HARD INVARIANT
 *   A facts record is NEVER deleted while a pointer may still reference it.
 *   Enforced at three independent layers:
 *     1. classification  — quarantine and unclassifiable shapes return ok:false
 *     2. re-derivation   — the executor recomputes the delete order from key
 *                          CLASS and ignores the order it was handed
 *     3. cross-check     — the key-set shape and the classification label must
 *                          agree, so a forged plan cannot smuggle an orphan-
 *                          shaped key set through under a pair-shaped label
 *   Deletes run pointer-first, so an interrupted run can only ever leave an
 *   orphaned facts record — never a dangling pointer.
 *
 * KEY DERIVATION
 *   Keys come SOLELY from the exact writtenKeys strings the core reported.
 *   No key is ever reconstructed from ticker or cik; those are echoed as bounded
 *   metadata only (mismatch becomes null), so a drifting or hostile ticker/cik
 *   can never widen or redirect what is deleted.
 *
 * SAFETY DEFAULTS
 *   Dry-run is the default. A real delete is issued ONLY when
 *   opts.dryRun === false (strict). Absent opts, opts:{}, true, 'false', 0, null
 *   and every other value perform ZERO deletes.
 *
 * STORE METHOD ACQUISITION
 *   Store properties are read only after ALL plan validation has succeeded, at
 *   most once each, behind a guard, and are invoked with the receiver preserved.
 *   A detached method is never invoked and a property is never re-read inside a
 *   loop, so a hostile getter gets exactly one chance to act and cannot swap an
 *   implementation midway through a teardown.
 */

// ── key grammar (anchored: padded input is INVALID, never trimmed) ────────────
// Mirrors fund-facts-core.js pointerKey()/factsKey(). Deliberately duplicated
// rather than imported, to keep this module dependency-free; the offline harness
// pins the lockstep against the real core instead.
const POINTER_KEY_RE = /^fundstore:v1:cik:[A-Z]{1,10}$/;
const FACTS_KEY_RE = /^fundstore:v1:facts:\d{10}$/;

const MAX_KEYS = 2;

// Read option for post-delete verification. A bare read against an eventually
// consistent backend can report a just-deleted key as absent without proving it.
const STRONG = { consistency: 'strong' };

// ── closed vocabularies (private) ────────────────────────────────────────────
const CLASSIFICATIONS = [
  'SAFE_PAIR',          // row A — WRITE, both keys confirmed
  'CONFIRMED_ORPHAN',   // row B — reconciled STORE_UNAVAILABLE, pointer proven absent
  'QUARANTINED',        // rows C/D — conflict / uncertain: automatic deletion forbidden
  'NOOP',               // row E — recognized response, nothing was written
  'NOT_CLASSIFIABLE'    // row E — unrecognized or malformed
];

const VERIFICATION_OUTCOMES = [
  'DISABLED',
  'VERIFIED_ABSENT',
  'STILL_PRESENT',
  'INCONCLUSIVE',
  'PARTIAL'
];

// The C1-S3 core's complete status vocabulary. A status outside this set is not
// something this module claims to understand, so it fails closed.
const CORE_STATUSES = [
  'WRITE', 'SKIPPED', 'NONE', 'DEGRADED', 'DISABLED', 'METHOD_NOT_ALLOWED',
  'UNAUTHORIZED', 'CONFIGURATION_MISSING', 'INVALID_JSON', 'INVALID_TICKER',
  'TICKER_NOT_ALLOWED', 'ERROR'
];

// Allowlisted error names. Anything else collapses to UnknownError so a custom
// error name can never become an exfiltration channel.
const DELETE_ERROR_NAMES = [
  'Error', 'TypeError', 'RangeError', 'AbortError', 'TimeoutError',
  'FetchError', 'SystemError', 'BlobsInternalError', 'BlobsConsistencyError',
  'MissingBlobsEnvironmentError'
];

const META_TICKER_RE = /^[A-Z]{1,10}$/;
const META_CIK_RE = /^\d{10}$/;

// ── small helpers (private) ──────────────────────────────────────────────────
function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function hasOwn(o, k) {
  return Object.prototype.hasOwnProperty.call(o, k);
}

// Exact identity: a value that is not byte-identical to its own trim() is
// rejected outright. Padded input is invalid input — it is never normalized.
function isIdentityString(v) {
  return typeof v === 'string' && v.length > 0 && v === v.trim();
}

// Recursive freeze for this module's OWN outputs. Caller inputs are never frozen
// and never mutated.
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.keys(value).forEach(function (k) { deepFreeze(value[k]); });
    Object.freeze(value);
  }
  return value;
}

/**
 * Collapse an arbitrary thrown value to an allowlisted name.
 * err.message / err.stack / err.toString() are NEVER read. The single property
 * access is guarded so a hostile throwing getter cannot escape the sanitizer.
 */
function safeErrorName(err) {
  let name;
  try { name = err && err.name; } catch (_) { name = undefined; }
  if (typeof name === 'string' && DELETE_ERROR_NAMES.indexOf(name) !== -1) {
    return name;
  }
  return 'UnknownError';
}

function classifyKey(key) {
  if (typeof key !== 'string') { return null; }
  if (POINTER_KEY_RE.test(key)) { return 'pointer'; }
  if (FACTS_KEY_RE.test(key)) { return 'facts'; }
  return null;
}

/**
 * Index-bounded, hostile-input-resistant read of a key array.
 *
 * Array.isArray is Proxy-transparent, so a Proxy wrapping an array passes it.
 * Everything after that assumes the container may be adversarial: length is
 * validated as a real non-negative integer before it is trusted as a bound,
 * every index is confirmed to be an own property (which rejects sparse holes
 * and inherited index values alike), and every element must be a real string.
 * Throwing get/length traps propagate to the caller's guard, which fails closed.
 */
function readKeyArray(raw) {
  if (!Array.isArray(raw)) { return { ok: false, reason: 'WRITTEN_KEYS_INVALID' }; }

  const len = raw.length;
  if (typeof len !== 'number' || !isFinite(len) || len < 0 || Math.floor(len) !== len) {
    return { ok: false, reason: 'WRITTEN_KEYS_INVALID' };
  }
  if (len > MAX_KEYS) { return { ok: false, reason: 'TOO_MANY_KEYS' }; }

  const out = [];
  for (let i = 0; i < len; i++) {
    if (!hasOwn(raw, i)) { return { ok: false, reason: 'KEY_MALFORMED' }; }
    const v = raw[i];
    if (typeof v !== 'string') { return { ok: false, reason: 'KEY_MALFORMED' }; }
    out.push(v);
  }
  return { ok: true, keys: out };
}

/**
 * Classify a validated key list into at most one pointer and one facts key.
 *
 * The two duplicate conditions are deliberately distinct: the SAME key string
 * twice is DUPLICATE_KEY, while two DIFFERENT keys of the same class is
 * KEY_CLASS_DUPLICATE. They describe different provenance failures — a repeated
 * echo versus two unrelated records — and are reported separately.
 */
function classifyKeySet(keys) {
  const seen = new Set();
  let pointer = null;
  let facts = null;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const kind = classifyKey(key);
    if (kind === null) { return { ok: false, reason: 'KEY_MALFORMED' }; }
    if (seen.has(key)) { return { ok: false, reason: 'DUPLICATE_KEY' }; }
    seen.add(key);
    if (kind === 'pointer') {
      if (pointer !== null) { return { ok: false, reason: 'KEY_CLASS_DUPLICATE' }; }
      pointer = key;
    } else {
      if (facts !== null) { return { ok: false, reason: 'KEY_CLASS_DUPLICATE' }; }
      facts = key;
    }
  }
  return { ok: true, pointer: pointer, facts: facts };
}

/**
 * Derive the executable key set and its order from a validated key set.
 *
 * This is the single place the write-to-delete reversal lives. The pointer is
 * always removed before the record it references, so a mid-run failure can only
 * orphan a facts record and can never strand a live pointer.
 *
 * Returns null for a lone pointer key, which no A-E row can produce and which
 * would strand the facts record it points at.
 */
function deriveExecution(pointer, facts) {
  if (pointer !== null && facts !== null) {
    return { keys: [pointer, facts], label: 'SAFE_PAIR' };
  }
  if (facts !== null) {
    return { keys: [facts], label: 'CONFIRMED_ORPHAN' };
  }
  return null;
}

function boundedMetadata(ticker, cik) {
  return {
    ticker: (typeof ticker === 'string' && META_TICKER_RE.test(ticker)) ? ticker : null,
    cik: (typeof cik === 'string' && META_CIK_RE.test(cik)) ? cik : null
  };
}

function classification(ok, label, reason, status, coreReason, evidenceKeys, metadata) {
  const out = {
    ok: ok,
    classification: label,
    reason: reason,
    status: status,
    evidenceKeys: evidenceKeys,
    count: evidenceKeys.length,
    metadata: metadata
  };
  if (label === 'QUARANTINED') {
    out.coreReason = coreReason;
  }
  return deepFreeze(out);
}

function unclassifiable(reason, status, coreReason, metadata) {
  return classification(false, 'NOT_CLASSIFIABLE', reason, status, coreReason, [], metadata);
}

// ── 1. classification ────────────────────────────────────────────────────────

/**
 * Decide what a PARSED C1-S3 response body proves about deletion safety.
 *
 * Returns a frozen record reporting EVIDENCE only. `evidenceKeys` is what the
 * core said it wrote; it is never an instruction to delete. Quarantined shapes
 * keep their evidence so provenance survives, while `ok:false` prevents any
 * plan from being built from them.
 */
function classifyFundFactsResponse(body) {
  try {
    return classifyInner(body);
  } catch (_) {
    // All-or-nothing fallback: no partially computed classification may survive
    // an unexpected exception (a hostile trap on any property read lands here).
    return unclassifiable('CLASSIFIER_ERROR', null, null, { ticker: null, cik: null });
  }
}

function classifyInner(body) {
  if (!isPlainObject(body)) {
    return unclassifiable('BODY_INVALID', null, null, { ticker: null, cik: null });
  }

  const status = body.status;
  if (!isIdentityString(status)) {
    return unclassifiable('STATUS_INVALID', null, null, { ticker: null, cik: null });
  }
  if (CORE_STATUSES.indexOf(status) === -1) {
    return unclassifiable('STATUS_UNKNOWN', null, null, { ticker: null, cik: null });
  }

  const meta = boundedMetadata(body.ticker, body.cik);

  // `reason` is optional (WRITE alone omits it) but must be well-formed if present.
  let coreReason = null;
  if (hasOwn(body, 'reason')) {
    if (!isIdentityString(body.reason)) {
      return unclassifiable('REASON_INVALID', status, null, meta);
    }
    coreReason = body.reason;
  }

  // No writtenKeys field at all => the core confirmed no write. Nothing to delete.
  // Covers SKIPPED, NONE, bare STORE_UNAVAILABLE, facts-level STORE_CONFLICT,
  // DISABLED and every 4xx/5xx body.
  if (!hasOwn(body, 'writtenKeys')) {
    return classification(true, 'NOOP', null, status, coreReason, [], meta);
  }

  const read = readKeyArray(body.writtenKeys);
  if (!read.ok) { return unclassifiable(read.reason, status, coreReason, meta); }

  const set = classifyKeySet(read.keys);
  if (!set.ok) { return unclassifiable(set.reason, status, coreReason, meta); }

  const keys = read.keys;

  // ── row A: WRITE with exactly [facts, pointer] ─────────────────────────────
  // The core emits writtenKeys in write order (facts first, pointer last) and
  // never sets `reason` on WRITE. Both are required here; a WRITE carrying a
  // reason, a single key, or a reversed pair is a shape the core cannot produce.
  if (status === 'WRITE') {
    if (coreReason !== null) { return unclassifiable('REASON_UNEXPECTED', status, coreReason, meta); }
    if (keys.length !== 2 || set.pointer === null || set.facts === null) {
      return unclassifiable('WRITE_KEYS_UNEXPECTED', status, coreReason, meta);
    }
    if (keys[0] !== set.facts || keys[1] !== set.pointer) {
      return unclassifiable('WRITE_KEY_ORDER_UNEXPECTED', status, coreReason, meta);
    }
    return classification(true, 'SAFE_PAIR', null, status, coreReason, keys, meta);
  }

  // Every remaining keyed shape the core can emit is DEGRADED with exactly one
  // facts key. Anything else is not a shape this module recognizes.
  if (status !== 'DEGRADED') {
    return unclassifiable('KEYS_UNEXPECTED_FOR_STATUS', status, coreReason, meta);
  }
  if (keys.length !== 1 || set.facts === null || set.pointer !== null) {
    return unclassifiable('DEGRADED_KEYS_UNEXPECTED', status, coreReason, meta);
  }

  // ── row B: reconciled STORE_UNAVAILABLE — a CONFIRMED orphan ───────────────
  // The core reached this only after a strong reconciliation read proved the
  // pointer absent. That read is the evidence; the key list alone is not.
  if (coreReason === 'STORE_UNAVAILABLE') {
    return classification(true, 'CONFIRMED_ORPHAN', null, status, coreReason, keys, meta);
  }

  // ── rows C/D: quarantine — identical key list, unproven pointer state ──────
  // STORE_CONFLICT: a pointer already exists (possibly another writer's).
  // STORE_WRITE_UNCERTAIN: the pointer write may or may not have landed.
  // In both cases a pointer may reference this facts record, so deleting it is
  // forbidden. Evidence is preserved; the decision is escalated to the owner.
  if (coreReason === 'STORE_CONFLICT' || coreReason === 'STORE_WRITE_UNCERTAIN') {
    return classification(false, 'QUARANTINED', null, status, coreReason, keys, meta);
  }

  return unclassifiable('DEGRADED_REASON_UNEXPECTED', status, coreReason, meta);
}

// ── 2. planning ──────────────────────────────────────────────────────────────

function plan(ok, label, reason, coreReason, keys, metadata) {
  const out = {
    ok: ok,
    classification: label,
    reason: reason,
    keys: keys,
    count: keys.length,
    metadata: metadata
  };
  if (label === 'QUARANTINED') {
    out.coreReason = coreReason;
  }
  return deepFreeze(out);
}

/**
 * Build a frozen teardown plan from a raw parsed response body.
 *
 * Takes the BODY, never a classification object: the plan is always re-derived
 * from the original evidence, so a caller cannot hand in a forged classification
 * and have it honored. There is no caller-supplied ticker or cik — metadata
 * comes from the response alone and can never contribute to a key.
 */
function planFundFactsTeardown(parsedBody) {
  try {
    const c = classifyFundFactsResponse(parsedBody);

    if (c.ok !== true) {
      return plan(false, c.classification, c.reason, c.coreReason, [], c.metadata);
    }

    const set = classifyKeySet(c.evidenceKeys);
    if (!set.ok) {
      return plan(false, 'NOT_CLASSIFIABLE', set.reason, c.coreReason, [], c.metadata);
    }

    // NOOP carries no evidence, so there is nothing to execute.
    if (c.evidenceKeys.length === 0) {
      return plan(true, c.classification, null, c.coreReason, [], c.metadata);
    }

    const derived = deriveExecution(set.pointer, set.facts);
    if (derived === null || derived.label !== c.classification) {
      return plan(false, 'NOT_CLASSIFIABLE', 'CLASSIFICATION_MISMATCH', c.coreReason, [], c.metadata);
    }

    return plan(true, c.classification, null, c.coreReason, derived.keys, c.metadata);
  } catch (_) {
    return plan(false, 'NOT_CLASSIFIABLE', 'PLANNER_ERROR', null, [], { ticker: null, cik: null });
  }
}

// ── 3. execution ─────────────────────────────────────────────────────────────

function invalidPlan(reason, label, dryRun) {
  return {
    status: 'INVALID_PLAN',
    reason: reason,
    classification: label,
    dryRun: dryRun
  };
}

// The verification object shape is fixed on every valid-plan result. A fresh
// object is built each time so no two results share mutable array identity.
function disabledVerification() {
  return {
    outcome: 'DISABLED',
    checkedKeys: [],
    absentKeys: [],
    presentKeys: [],
    inconclusiveKeys: []
  };
}

function verification(outcome, checkedKeys, absentKeys, presentKeys, inconclusiveKeys) {
  return {
    outcome: outcome,
    checkedKeys: checkedKeys,
    absentKeys: absentKeys,
    presentKeys: presentKeys,
    inconclusiveKeys: inconclusiveKeys
  };
}

/**
 * Read back the keys that were CONFIRMED deleted and classify each one.
 *
 * Called only when verification was opted into. Every read is performed and
 * recorded before an outcome is chosen — there is no early return — so the four
 * arrays are always a complete account of what was checked.
 *
 * Precedence, worst case first:
 *   STILL_PRESENT > INCONCLUSIVE > PARTIAL > VERIFIED_ABSENT
 *
 * PARTIAL means "the teardown stopped early, and everything it did delete is
 * confirmed gone" — it is reachable only from the DELETE_ERROR path.
 *
 * Only keys in `deleted` are ever read. The failed key was never confirmed
 * deleted, and an unattempted key was never touched, so neither is verified.
 */
async function runVerification(store, deleted, isDeleteError) {
  // The empty-subset decision happens BEFORE any store property is read, so a
  // teardown that deleted nothing never acquires the read method at all.
  if (deleted.length === 0) {
    return verification('INCONCLUSIVE', [], [], [], []);
  }

  // Single guarded acquisition; the property is never read again.
  let getFn;
  try {
    getFn = store && store.get;
  } catch (_) {
    getFn = undefined;
  }
  if (typeof getFn !== 'function') {
    // The deletion itself already happened and stands; only our ability to
    // confirm it is lost. Never downgrade this to an INVALID_PLAN.
    return verification('INCONCLUSIVE', [], [], [], deleted.slice());
  }

  const checkedKeys = [];
  const absentKeys = [];
  const presentKeys = [];
  const inconclusiveKeys = [];

  for (let i = 0; i < deleted.length; i++) {
    const key = deleted[i];
    checkedKeys.push(key);
    let raw;
    let threw = false;
    try {
      raw = await Reflect.apply(getFn, store, [key, STRONG]);
    } catch (_) {
      threw = true;
    }
    if (threw) {
      inconclusiveKeys.push(key);
    } else if (raw !== null && raw !== undefined) {
      // Explicit null/undefined test: an empty-string or zero payload is PRESENT.
      presentKeys.push(key);
    } else {
      absentKeys.push(key);
    }
  }

  let outcome;
  if (presentKeys.length > 0) {
    outcome = 'STILL_PRESENT';
  } else if (inconclusiveKeys.length > 0) {
    outcome = 'INCONCLUSIVE';
  } else if (isDeleteError) {
    outcome = 'PARTIAL';
  } else {
    outcome = 'VERIFIED_ABSENT';
  }
  return verification(outcome, checkedKeys, absentKeys, presentKeys, inconclusiveKeys);
}

/**
 * Execute (or, by default, merely report) a teardown plan.
 *
 * executeFundFactsTeardown(store, plan, opts)
 *   opts.dryRun === false  -> really delete   (strict; anything else stays dry)
 *   opts.verify === true   -> read back with strong consistency after deleting
 *
 * The plan is re-validated from scratch. plan.keys is treated as untrusted
 * input: order is recomputed from key class, and the resulting shape must agree
 * with plan.classification. The plan object is never mutated.
 */
async function executeFundFactsTeardown(store, teardownPlan, opts) {
  const o = isPlainObject(opts) ? opts : {};
  const dryRun = o.dryRun !== false;
  const verify = o.verify === true;

  let keys;
  let label;

  // ── plan re-validation: entirely pre-I/O, and must not throw ──────────────
  // No store property is read anywhere in this block, which is what makes the
  // INVALID_PLAN / NOOP / DRY_RUN paths provably store-free.
  try {
    if (!isPlainObject(teardownPlan) || teardownPlan.ok !== true) {
      return invalidPlan('PLAN_NOT_OK', null, dryRun);
    }

    label = typeof teardownPlan.classification === 'string' ? teardownPlan.classification : null;

    const read = readKeyArray(teardownPlan.keys);
    if (!read.ok) { return invalidPlan(read.reason, label, dryRun); }

    const set = classifyKeySet(read.keys);
    if (!set.ok) { return invalidPlan(set.reason, label, dryRun); }

    // A plan whose declared count disagrees with its own key list is internally
    // inconsistent and is refused before anything is acquired.
    if (teardownPlan.count !== read.keys.length) {
      return invalidPlan('CLASSIFICATION_MISMATCH', label, dryRun);
    }

    if (read.keys.length === 0) {
      return {
        status: 'NOOP',
        classification: label,
        deleted: [],
        dryRun: dryRun,
        verification: disabledVerification()
      };
    }

    // Re-derive the delete order from key CLASS. The order handed in is never
    // used, so a mis-ordered or tampered plan cannot invert pointer-first.
    const derived = deriveExecution(set.pointer, set.facts);
    if (derived === null) { return invalidPlan('POINTER_ONLY_PLAN', label, dryRun); }
    if (derived.label !== label) { return invalidPlan('CLASSIFICATION_MISMATCH', label, dryRun); }
    keys = derived.keys;
  } catch (_) {
    return invalidPlan('PLAN_UNREADABLE', null, dryRun);
  }

  if (dryRun) {
    return {
      status: 'DRY_RUN',
      classification: label,
      dryRun: true,
      plannedDeletes: keys.slice(),
      verification: disabledVerification()
    };
  }

  // ── single guarded acquisition of the delete method ───────────────────────
  // Read once, validated once, invoked with the receiver preserved. The property
  // is never read again, so a getter cannot swap the implementation mid-run.
  let deleteFn;
  try {
    deleteFn = store && store.delete;
  } catch (_) {
    return invalidPlan('STORE_INTERFACE_MISSING', label, false);
  }
  if (typeof deleteFn !== 'function') {
    return invalidPlan('STORE_INTERFACE_MISSING', label, false);
  }

  // ── real deletion: pointer first, stop at the first failure ────────────────
  const deleted = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      await Reflect.apply(deleteFn, store, [key]);
    } catch (err) {
      // No retry, no blind continuation, no compensation. Because deletes run
      // pointer-first, the residue here is at worst an orphaned facts record.
      return {
        status: 'DELETE_ERROR',
        classification: label,
        dryRun: false,
        deleted: deleted.slice(),
        failedKey: key,
        errorName: safeErrorName(err),
        verification: verify
          ? await runVerification(store, deleted, true)
          : disabledVerification()
      };
    }
    deleted.push(key);
  }

  return {
    status: 'DELETED',
    classification: label,
    dryRun: false,
    deleted: deleted.slice(),
    verification: verify
      ? await runVerification(store, deleted, false)
      : disabledVerification()
  };
}

module.exports = {
  classifyFundFactsResponse,
  planFundFactsTeardown,
  executeFundFactsTeardown
};
