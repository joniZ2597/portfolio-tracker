'use strict';

/*
 * arc-publish-plan/scripts/lib/runtime-identity.js — claim / token / holder / pointer identity rules
 * (Multi-ARC V1, Increment P-E0, batch B4; owner rulings D-22, D-23, D-24, N-2, N-3 of 2026-08-22 and the
 * claim-identity ruling of 2026-08-21, ULTRAPLAN r3 §0.1, K9, K13, K14).
 *
 * PURE: no I/O, no clock, no randomness, no environment access, no dependencies. Every function returns a
 * structured, fail-closed verdict — `{ ok, verdict, reasons[] , ... }` — and malformed input is never a match.
 * These rules are defined here ONCE; the protocols and QA consume them and never re-implement them.
 *
 * Rules encoded
 *  - Claim identity = (arcId ?? null, taskId). The legacy namespace claims/<TASK-ID>/ has arcId null; the ARC
 *    namespace arc-claims/<ARC-ID>/<TASK-ID>/ carries arcId equal to the directory. Identity is structural —
 *    taken from the path and checked against the record — never inferred from a task-id prefix, a filename
 *    or a slug. The same taskId may exist in claims/ and in several ARCs (they are distinct identities).
 *  - Holder ownership = exact pair equality (arcId ?? null, taskId). A legacy identity never owns an ARC
 *    holder and an ARC identity never owns a legacy holder, even with the same taskId (D-28). Mutex classes
 *    stay global; arcId disambiguates the holder, never the class.
 *  - An ARC publication's plan.json, manifest.json and plans/arcs/<ARC-ID>/current.json carry ONE equal arcId;
 *    a legacy publication carries none in all three.
 *  - The reserved Windows device names are rejected uniformly for arcId and taskId (N-3).
 *
 * NOT here (behaviour, P-E / B5 / B6): namespace selection, dependency resolution, routing, any filesystem
 * access, root-completeness checks.
 */

const ARC_ID_RE = /^[A-Z0-9]([A-Z0-9-]*[A-Z0-9])?$/;
const ARC_ID_MAX = 24;
const TASK_ID_RE = /^[A-Z0-9]([A-Z0-9._-]*[A-Z0-9])?$/;
const TASK_ID_MAX = 64;
const RESERVED_DEVICE_NAMES = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
const RESERVED_HOLDER_IDS = ['__PUBLISH__', '__OWNER__'];
const RESERVED_PLAN_IDS = ['arcs'];
const LEGACY_ROOT = 'claims';
const ARC_ROOT = 'arc-claims';
const RECORD_FILES = ['claim.json', 'authorized.json'];

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

function isValidArcId(x) {
  return typeof x === 'string' && x.length <= ARC_ID_MAX && ARC_ID_RE.test(x) && !RESERVED_DEVICE_NAMES.includes(x);
}
function isValidTaskId(x) {
  return typeof x === 'string' && x.length <= TASK_ID_MAX && TASK_ID_RE.test(x) && !RESERVED_DEVICE_NAMES.includes(x);
}
function isHolderId(x) {
  return isValidTaskId(x) || RESERVED_HOLDER_IDS.includes(x);
}

// ── namespaceOf: parse a runtime-root-relative claim path into its structural identity ───────────
function namespaceOf(relPath) {
  const fail = (reason) => ({ ok: false, namespace: null, arcId: null, taskId: null, file: null, reason });
  if (typeof relPath !== 'string' || relPath === '') return fail('path missing');
  const p = relPath.replace(/\\/g, '/');
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return fail('path must be relative to the runtime root: ' + relPath);
  const segs = p.split('/');
  if (segs.some((s) => s === '' || s === '.' || s === '..')) return fail('path has an empty or dot segment: ' + relPath);
  if (segs[0] === LEGACY_ROOT) {
    if (segs.length < 2) return fail('claims/ path needs <TASK-ID>: ' + relPath);
    if (segs.length > 3) return fail('claims/ path too deep: ' + relPath);
    const taskId = segs[1];
    if (!isValidTaskId(taskId)) return fail('invalid task id in path: ' + taskId);
    const file = segs.length === 3 ? segs[2] : null;
    if (file !== null && !RECORD_FILES.includes(file)) return fail('not a claim record file: ' + file);
    return { ok: true, namespace: 'legacy', arcId: null, taskId, file, reason: null };
  }
  if (segs[0] === ARC_ROOT) {
    if (segs.length < 3) return fail('arc-claims/ path needs <ARC-ID>/<TASK-ID>: ' + relPath);
    if (segs.length > 4) return fail('arc-claims/ path too deep: ' + relPath);
    const arcId = segs[1];
    if (!isValidArcId(arcId)) return fail('invalid arc id in path: ' + arcId);
    const taskId = segs[2];
    if (!isValidTaskId(taskId)) return fail('invalid task id in path: ' + taskId);
    const file = segs.length === 4 ? segs[3] : null;
    if (file !== null && !RECORD_FILES.includes(file)) return fail('not a claim record file: ' + file);
    return { ok: true, namespace: 'arc', arcId, taskId, file, reason: null };
  }
  return fail('not a claim namespace path (claims/ or arc-claims/): ' + relPath);
}

function claimIdentityFromPath(relPath) {
  const n = namespaceOf(relPath);
  if (!n.ok) return { ok: false, key: null, namespace: null, reason: n.reason };
  return { ok: true, key: { arcId: n.arcId, taskId: n.taskId }, namespace: n.namespace, reason: null };
}

// ── record ↔ path: the record's identity fields must equal the directory it lives in ───────────
function recordMatchesPath(record, relPath, kind) {
  const reasons = [];
  const n = namespaceOf(relPath);
  const out = (verdict, ok) => ({ ok, verdict, namespace: n.ok ? n.namespace : null, key: n.ok ? { arcId: n.arcId, taskId: n.taskId } : null, reasons });
  if (!n.ok) { reasons.push('path: ' + n.reason); return out('INVALID', false); }
  if (n.file !== null && n.file !== kind) { reasons.push('path names ' + n.file + ', not ' + kind); return out('INVALID', false); }
  if (!isObj(record)) { reasons.push(kind + ' record is not an object'); return out('INVALID', false); }
  if (typeof record.taskId !== 'string') { reasons.push(kind + ' record has no taskId'); return out('INVALID', false); }
  if ('arcId' in record && !isValidArcId(record.arcId)) { reasons.push(kind + ' record arcId is invalid: ' + String(record.arcId)); return out('INVALID', false); }
  let mismatch = false;
  if (record.taskId !== n.taskId) { reasons.push('record.taskId ' + record.taskId + ' != directory ' + n.taskId); mismatch = true; }
  if (n.namespace === 'legacy' && 'arcId' in record) { reasons.push('legacy claims/ record must not carry arcId (has ' + record.arcId + ')'); mismatch = true; }
  if (n.namespace === 'arc') {
    if (!('arcId' in record)) { reasons.push('arc-claims/ record must carry arcId ' + n.arcId); mismatch = true; }
    else if (record.arcId !== n.arcId) { reasons.push('record.arcId ' + record.arcId + ' != directory ' + n.arcId); mismatch = true; }
  }
  return mismatch ? out('MISMATCH', false) : out('MATCH', true);
}
function claimMatchesPath(claim, relPath) { return recordMatchesPath(claim, relPath, 'claim.json'); }
function authorizedMatchesPath(token, relPath) { return recordMatchesPath(token, relPath, 'authorized.json'); }

// ── holder ownership: exact (arcId ?? null, taskId) pair equality (K14, D-28) ────────────────────
function holderOwnershipMatches(holder, identity) {
  const reasons = [];
  const out = (verdict, ok, pair) => ({ ok, verdict, pair, reasons });
  if (!isObj(holder)) { reasons.push('holder is not an object'); return out('INVALID', false, null); }
  if (!isHolderId(holder.taskId)) { reasons.push('holder.taskId missing or invalid: ' + String(holder.taskId)); return out('INVALID', false, null); }
  if ('arcId' in holder && !isValidArcId(holder.arcId)) { reasons.push('holder.arcId invalid: ' + String(holder.arcId)); return out('INVALID', false, null); }
  if (!isObj(identity) || !isHolderId(identity.taskId)) { reasons.push('identity.taskId missing or invalid'); return out('INVALID', false, null); }
  const idArc = identity.arcId === undefined || identity.arcId === null ? null : identity.arcId;
  if (idArc !== null && !isValidArcId(idArc)) { reasons.push('identity.arcId invalid: ' + String(idArc)); return out('INVALID', false, null); }
  const hArc = 'arcId' in holder ? holder.arcId : null;
  const pair = { holder: { arcId: hArc, taskId: holder.taskId }, identity: { arcId: idArc, taskId: identity.taskId } };
  if (holder.taskId !== identity.taskId) reasons.push('taskId differs: holder ' + holder.taskId + ' vs identity ' + identity.taskId);
  if (hArc !== idArc) reasons.push('arcId differs: holder ' + (hArc === null ? 'none (legacy)' : hArc) + ' vs identity ' + (idArc === null ? 'none (legacy)' : idArc) + ' (D-28: a legacy identity never owns an ARC holder and vice versa)');
  return reasons.length ? out('NOT-OWNER', false, pair) : out('OWNER', true, pair);
}

// ── arcIdTriple: plan.json / manifest.json / current.json carry one equal arcId, or none (K9) ───
function arcIdTriple(files, expected) {
  const reasons = [];
  const names = ['plan', 'manifest', 'current'];
  const out = (verdict, ok, arcId) => ({ ok, verdict, arcId, reasons });
  if (!isObj(files)) { reasons.push('files must be an object with plan, manifest and current'); return out('INVALID', false, null); }
  for (const n of names) if (!isObj(files[n])) { reasons.push(n + ' record missing or not an object'); return out('INVALID', false, null); }
  const vals = names.map((n) => files[n].arcId);
  const present = vals.map((v) => v !== undefined);
  let invalid = false;
  names.forEach((n, i) => { if (present[i] && !isValidArcId(vals[i])) { reasons.push(n + '.arcId invalid: ' + String(vals[i])); invalid = true; } });
  const hasExpected = expected !== undefined && expected !== null;
  if (hasExpected && !isValidArcId(expected)) { reasons.push('expected arcId invalid: ' + String(expected)); invalid = true; }
  if (invalid) return out('INVALID', false, null);
  if (present.every((x) => !x)) {
    if (hasExpected) { reasons.push('triple is legacy (no arcId in plan, manifest or current) but ARC ' + expected + ' was expected'); return out('MISMATCH', false, null); }
    return out('LEGACY', true, null);
  }
  if (!present.every((x) => x)) {
    names.forEach((n, i) => { if (!present[i]) reasons.push(n + '.arcId absent while another member carries one'); });
    return out('MISMATCH', false, null);
  }
  if (!(vals[0] === vals[1] && vals[1] === vals[2])) { reasons.push('arcId differs: plan ' + vals[0] + ', manifest ' + vals[1] + ', current ' + vals[2]); return out('MISMATCH', false, null); }
  if (hasExpected && expected !== vals[0]) { reasons.push('triple arcId ' + vals[0] + ' != expected ' + expected); return out('MISMATCH', false, vals[0]); }
  return out('ARC', true, vals[0]);
}

module.exports = {
  ARC_ID_RE, ARC_ID_MAX, TASK_ID_RE, TASK_ID_MAX, RESERVED_DEVICE_NAMES, RESERVED_HOLDER_IDS, RESERVED_PLAN_IDS,
  isValidArcId, isValidTaskId, isHolderId,
  namespaceOf, claimIdentityFromPath, claimMatchesPath, authorizedMatchesPath, holderOwnershipMatches, arcIdTriple
};
