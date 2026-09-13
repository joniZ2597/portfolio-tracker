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
 *          profile.scope.writes          lists the product path literally - as `<path>` for a
 *                                        main-worktree profile, or as `<worktree>/<path>` for a
 *                                        LAB profile, which then covers ONLY the one linked
 *                                        worktree REGISTERED under the name profile.scope.worktree
 *
 * Topology is canonical git topology, never a filesystem guess: one `git rev-parse
 * --path-format=absolute --git-dir --git-common-dir --show-toplevel` in `root`. The runtime lives
 * under the common dir. A worktree is LINKED iff its git-dir differs from its common dir - a plain
 * checkout, and a checkout created with `--separate-git-dir` (whose `.git` is also a pointer file),
 * both have git-dir == common-dir and never receive the LAB allowance. The linked worktree's
 * IDENTITY is the owning repository's worktree registry (`<common-dir>/worktrees/<id>/gitdir`, the
 * data `git worktree list` reads): exactly one registered worktree may carry the name, and its
 * canonical absolute path must be `root` itself. Zero or several registrations under that name
 * deny. Nothing is ever resolved relative to a linked worktree's own gitdir.
 *
 * Resolution BEGINS at the live holder and follows only that holder's own claim. It never searches
 * for some historical claim that happens to match (owner ruling, 2026-08-29). `COMPLETE` is
 * deliberately NOT an exemption: it would leave a post-close/pre-commit window in which a further
 * unauthorized edit is indistinguishable.
 *
 * Every absence, mismatch, malformed record, unsafe path segment or unresolved HEAD returns DENY
 * with a reason. Nothing here throws, and nothing here writes.
 *
 * Pure Node, no network. Reads `<common-dir>/arc-runtime/**` and `<common-dir>/worktrees/<id>/gitdir`,
 * runs one `git rev-parse HEAD` and one `git rev-parse --git-dir --git-common-dir --show-toplevel`
 * (the only git verb used is rev-parse).
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

// Canonical absolute path (symlinks and, on Windows, drive-letter/case differences resolved) or null.
function canon(p) {
  try {
    return fs.realpathSync.native(p);
  } catch (_) {
    return null;
  }
}

/*
 * topologyOf(root) -> { gitDir, commonDir, linked, viaGit } | null
 *
 *   Canonical: `git rev-parse --path-format=absolute --git-dir --git-common-dir --show-toplevel` run
 *   in `root`. All three must be absolute, and the toplevel must be `root` itself (a subdirectory,
 *   or a fixture that happens to sit inside some other repository, resolves nothing). linked is
 *   git-dir != common-dir - the only thing that distinguishes a linked worktree from the main
 *   checkout, including a main checkout created with `--separate-git-dir` whose `.git` is also a
 *   pointer file.
 *   Fallback (git refuses: not a repository): a plain `<root>/.git` DIRECTORY is honoured as
 *   MAIN-shaped fixture topology only - common dir = that directory, never linked. A pointer file
 *   that git cannot follow resolves nothing (fail closed).
 */
function topologyOf(root) {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
  if (r.status === 0) {
    const lines = String(r.stdout).split(/\r?\n/).filter(Boolean);
    if (lines.length !== 3 || !lines.every((l) => path.isAbsolute(l))) return null;
    const gitDir = canon(lines[0]), commonDir = canon(lines[1]), top = canon(lines[2]), rootC = canon(root);
    if (!gitDir || !commonDir || !top || !rootC || top !== rootC) return null;
    return { gitDir: gitDir, commonDir: commonDir, linked: gitDir !== commonDir, viaGit: true };
  }
  const dotGit = path.join(root, '.git');
  try {
    if (fs.statSync(dotGit).isDirectory()) return { gitDir: dotGit, commonDir: dotGit, linked: false, viaGit: false };
  } catch (_) {
    /* fall through */
  }
  return null;
}

/*
 * registeredWorktree(topo, name) -> { count, wt, id }
 *
 * The owning repository's worktree registry: every `<common-dir>/worktrees/<id>/gitdir` holds the
 * absolute path of that worktree's `.git` pointer file, so dirname(target) is the registered
 * worktree path. Registrations are matched by the basename of that REGISTERED path (the name the
 * claim protocol resolves); stale registrations count, so a leftover entry under the same name is
 * an ambiguity the owner prunes, never one the predicate resolves.
 */
function registeredWorktree(topo, name) {
  const dir = path.join(topo.commonDir, 'worktrees');
  let ids;
  try {
    ids = fs.readdirSync(dir);
  } catch (_) {
    return { count: 0, wt: null, id: null };
  }
  const hits = [];
  for (const id of ids) {
    let target;
    try {
      target = String(fs.readFileSync(path.join(dir, id, 'gitdir'), 'utf8')).trim();
    } catch (_) {
      continue;
    }
    if (!target || !path.isAbsolute(target)) continue;
    const wt = path.dirname(target);
    if (path.basename(wt) === name) hits.push({ id: id, wt: wt });
  }
  return { count: hits.length, wt: hits.length === 1 ? hits[0].wt : null, id: hits.length === 1 ? hits[0].id : null };
}

// resolveRuntimeRoot(root) -> absolute `<common-dir>/arc-runtime` or null. Exported (with topologyOf, read-only)
// so a suite that runs inside a linked worktree finds the same live runtime the main worktree does.
function resolveRuntimeRoot(root) {
  const topo = topologyOf(root);
  return topo ? path.join(topo.commonDir, 'arc-runtime') : null;
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
 *   opts.root         repo root - the main worktree or a linked worktree (default: this file's repo)
 *   opts.runtimeRoot  override the runtime root (fixtures); topology is still read from opts.root
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
  const topo = topologyOf(root);
  const runtimeRoot = opts.runtimeRoot || (topo ? path.join(topo.commonDir, 'arc-runtime') : null);
  if (!runtimeRoot || !fs.existsSync(runtimeRoot)) return deny('runtime-root-absent');

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
  // `<path>` is the main-worktree form. `<worktree>/<path>` is the LAB form and licenses ONLY the
  // one linked worktree registered under profile.scope.worktree, identified by canonical absolute
  // path: evaluated from the main worktree, from a same-named sibling, or from any other worktree,
  // a LAB chain never exempts index.html.
  const task = Array.isArray(plan.tasks) ? plan.tasks.filter((t) => t && t.id === claim.taskId)[0] : null;
  if (!task) return deny('task-not-in-plan');
  const profiles = plan.executionProfiles;
  const profile = profiles && typeof profiles === 'object' ? profiles[task.executionProfile] : null;
  if (!profile || typeof profile !== 'object') return deny('profile-unresolved:' + String(task.executionProfile));
  const scope = profile.scope && typeof profile.scope === 'object' ? profile.scope : null;
  const writes = scope && scope.writes;
  if (!Array.isArray(writes)) return deny('profile-scope-excludes-path');
  if (writes.indexOf(relPath) === -1) {
    if (writes.indexOf('<worktree>/' + relPath) === -1) return deny('profile-scope-excludes-path');
    const wtName = typeof scope.worktree === 'string' ? scope.worktree : '';
    if (!wtName || wtName === 'none' || !SAFE_SEGMENT.test(wtName)) return deny('profile-scope-worktree-unnamed');
    // (a) root must be a LINKED worktree (git-dir != common-dir); the main checkout - plain or
    //     --separate-git-dir - never qualifies, whatever its directory is called.
    if (!topo || !topo.linked) return deny('profile-scope-worktree-only:' + wtName);
    // (b) exactly one worktree is registered under that name in the owning repository ...
    const reg = registeredWorktree(topo, wtName);
    if (reg.count === 0) return deny('profile-scope-worktree-unregistered:' + wtName);
    if (reg.count > 1) return deny('profile-scope-worktree-ambiguous:' + wtName);
    // (c) ... and it is root itself: canonical absolute path identity, and root's own git-dir is
    //     that registration (never a same-named sibling, never a copy).
    const rootC = canon(root), regC = canon(reg.wt), regGitDir = canon(path.join(topo.commonDir, 'worktrees', reg.id));
    if (!rootC || !regC || !regGitDir || rootC !== regC || regGitDir !== topo.gitDir) return deny('profile-scope-worktree-only:' + wtName);
  }

  return {
    authorized: true,
    reason: 'authorized:' + (arcId || 'legacy') + '/' + taskId + ' plan ' + claim.planId + ' repoRef==HEAD',
    arcId: arcId,
    taskId: taskId,
    planId: claim.planId
  };
}

module.exports = { authorizedProductWrite: authorizedProductWrite, resolveRuntimeRoot: resolveRuntimeRoot, topologyOf: topologyOf, CLASS_BY_PATH: CLASS_BY_PATH };
