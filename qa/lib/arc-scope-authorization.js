'use strict';

/*
 * qa/lib/arc-scope-authorization.js
 *
 * Deny-by-default: is a modification to a committed *product* file covered by a live, owner-issued
 * ARC authorization?
 *
 * The five ARC suites (arc_worker_handshake, arc_runtime_schemas, arc_registry, arc_multi_arc,
 * arc_runtime_ops) pin `index.html` byte-identical to HEAD so that an ARC-protocol slice cannot
 * silently spill into product code. That pin is correct for its purpose but over-fires: it also
 * fails every *authorized* product edit, from any arc, which made `npm run qa:offline` unable to
 * reach exit 0 for a legitimate in-scope task (WU-PROV / PROV-PROXY, 2026-08-29).
 *
 * This predicate narrows the pin instead of removing it. Byte-identity remains the default; the
 * ONLY exemption is a complete, live authorization chain, resolved in one direction:
 *
 *     mutex/<class>/holder.json          the live holder, and the ONLY entry point
 *       -> arc-claims/<ARC>/<TASK>/      (or legacy claims/<TASK>/) named by that holder
 *          claim.json                    state AUTHORIZED, declaring <class>
 *          authorized.json               owner-issued, correlated to the claim
 *       -> plans/<planId>/plan.json      bytes hashing to claim.planHash
 *          repoRef == HEAD               the exemption expires the moment the edit is committed
 *          profile.scope.writes          lists the product path literally
 *
 * Resolution BEGINS at the live holder and follows only that holder's own claim. It never searches
 * for some historical claim that happens to match (owner ruling, 2026-08-29). `COMPLETE` is
 * deliberately NOT an exemption: it would leave a post-close/pre-commit window in which a further
 * unauthorized edit is indistinguishable.
 *
 * Every absence, mismatch, malformed record, unsafe path segment or unresolved HEAD returns DENY
 * with a reason. Nothing here throws, and nothing here writes.
 *
 * Pure Node, no network. Reads `.git/arc-runtime/**` and runs one `git rev-parse HEAD`.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

// Closed table. A path absent from it is never inferred, globbed or pattern-matched into scope.
const CLASS_BY_PATH = { 'index.html': 'CODE:index-html' };

// A runtime path segment: no separators, no traversal, no leading dot, no drive letters.
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

function deny(reason) {
  return { authorized: false, reason: reason, arcId: null, taskId: null, planId: null };
}

function readJson(file) {
  try {
    const v = JSON.parse(String(fs.readFileSync(file, 'utf8')).replace(/\r/g, ''));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch (_) {
    return null;
  }
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function headOf(root) {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? String(r.stdout).trim() : null;
}

// Normalizes `arcId` absence: the legacy stream carries no arcId, and null/undefined are the same
// thing here. Any other type is rejected by the caller.
function arcOf(rec) {
  return rec.arcId === undefined || rec.arcId === null ? null : rec.arcId;
}

/*
 * authorizedProductWrite(relPath, opts) -> { authorized, reason, arcId, taskId, planId }
 *
 *   relPath  repo-relative product path, e.g. 'index.html'
 *   opts.root         repo root (default: this file's repo)
 *   opts.runtimeRoot  override the runtime root (fixtures)
 *   opts.headSha      override the HEAD sha (fixtures; avoids a git call)
 *
 * `authorized` is true ONLY when every condition below holds. `reason` always names the outcome.
 */
function authorizedProductWrite(relPath, opts) {
  opts = opts || {};

  if (!Object.prototype.hasOwnProperty.call(CLASS_BY_PATH, relPath)) {
    return deny('unknown-product-path:' + String(relPath));
  }
  const cls = CLASS_BY_PATH[relPath];

  const root = opts.root || path.resolve(__dirname, '..', '..');
  const runtimeRoot = opts.runtimeRoot || path.join(root, '.git', 'arc-runtime');
  if (!fs.existsSync(runtimeRoot)) return deny('runtime-root-absent');

  // ── 1. the live holder is the only entry point ──
  const holderFile = path.join(runtimeRoot, 'mutex', cls.replace(':', '__'), 'holder.json');
  if (!fs.existsSync(holderFile)) return deny('holder-absent:' + cls);
  const holder = readJson(holderFile);
  if (!holder) return deny('holder-unreadable');

  const taskId = holder.taskId;
  if (typeof taskId !== 'string' || !SAFE_SEGMENT.test(taskId)) return deny('holder-taskid-unsafe');
  const arcId = arcOf(holder);
  if (arcId !== null && (typeof arcId !== 'string' || !SAFE_SEGMENT.test(arcId))) return deny('holder-arcid-unsafe');

  // ── 2. that holder's own claim, in that holder's own namespace. No fallback, no search. ──
  const claimDir = arcId
    ? path.join(runtimeRoot, 'arc-claims', arcId, taskId)
    : path.join(runtimeRoot, 'claims', taskId);
  const claimFile = path.join(claimDir, 'claim.json');
  if (!fs.existsSync(claimFile)) return deny('claim-absent');
  const claim = readJson(claimFile);
  if (!claim) return deny('claim-unreadable');

  // AUTHORIZED is owner-written only (claim.schema.json): a worker refuses to emit it.
  if (claim.state !== 'AUTHORIZED') return deny('claim-state-not-authorized:' + String(claim.state));
  if (claim.taskId !== taskId) return deny('claim-taskid-mismatch');
  if (arcOf(claim) !== arcId) return deny('claim-arcid-mismatch');
  if (!Array.isArray(claim.mutexes) || claim.mutexes.indexOf(cls) === -1) return deny('claim-does-not-declare-mutex:' + cls);
  if (typeof claim.planId !== 'string' || !SAFE_SEGMENT.test(claim.planId)) return deny('claim-planid-unsafe');
  if (typeof claim.planHash !== 'string' || !SHA256_HEX.test(claim.planHash)) return deny('claim-planhash-invalid');

  // ── 3. the owner's authorization record, correlated to that claim ──
  const authFile = path.join(claimDir, 'authorized.json');
  if (!fs.existsSync(authFile)) return deny('authorized-absent');
  const authorized = readJson(authFile);
  if (!authorized) return deny('authorized-unreadable');
  if (authorized.authorizedBy !== 'owner') return deny('authorized-not-owner:' + String(authorized.authorizedBy));
  if (authorized.taskId !== claim.taskId) return deny('authorized-taskid-mismatch');
  if (authorized.planId !== claim.planId) return deny('authorized-planid-mismatch');
  if (authorized.planHash !== claim.planHash) return deny('authorized-planhash-mismatch');
  if (arcOf(authorized) !== arcId) return deny('authorized-arcid-mismatch');

  // ── 4. the published plan those records pin ──
  const planFile = path.join(runtimeRoot, 'plans', claim.planId, 'plan.json');
  if (!fs.existsSync(planFile)) return deny('plan-absent');
  let planBytes;
  try {
    planBytes = fs.readFileSync(planFile);
  } catch (_) {
    return deny('plan-unreadable');
  }
  if (sha256(planBytes) !== claim.planHash) return deny('plan-hash-mismatch');
  const plan = readJson(planFile);
  if (!plan) return deny('plan-unparsable');

  // ── 5. the exemption is bounded to the current commit ──
  // Once the authorized edit is committed HEAD moves, this fails, and byte-identity passes on its
  // own. A stale claim can therefore never license a later, unrelated edit.
  const headSha = opts.headSha || headOf(root);
  if (typeof headSha !== 'string' || headSha.length === 0) return deny('head-unresolved');
  if (plan.repoRef !== headSha) return deny('plan-reporef-not-head');

  // ── 6. the plan's own execution profile must name this path literally ──
  const task = Array.isArray(plan.tasks) ? plan.tasks.filter((t) => t && t.id === claim.taskId)[0] : null;
  if (!task) return deny('task-not-in-plan');
  const profiles = plan.executionProfiles;
  const profile = profiles && typeof profiles === 'object' ? profiles[task.executionProfile] : null;
  if (!profile || typeof profile !== 'object') return deny('profile-unresolved:' + String(task.executionProfile));
  const writes = profile.scope && profile.scope.writes;
  if (!Array.isArray(writes) || writes.indexOf(relPath) === -1) return deny('profile-scope-excludes-path');

  return {
    authorized: true,
    reason: 'authorized:' + (arcId || 'legacy') + '/' + taskId + ' plan ' + claim.planId + ' repoRef==HEAD',
    arcId: arcId,
    taskId: taskId,
    planId: claim.planId
  };
}

module.exports = { authorizedProductWrite: authorizedProductWrite, CLASS_BY_PATH: CLASS_BY_PATH };
