#!/usr/bin/env node
'use strict';

/*
 * R12: Owner-approved LAND + push tool (work/worker-land-push/brief.md §2-3).
 * DENY-tier (.claude/hooks/**) - changed only through the Owner copy/hash workflow.
 *
 * Verbs: land-request task/<id> | land task/<id> | push-request | push | cleanup task/<id>
 * Exit 0 success, 1 refusal (fail closed), 3 usage error.
 *
 * Module API (for QA): runLandRequest(opts), runLand(opts), runPushRequest(opts), runPush(opts),
 * runCleanup(opts), parseRecord(text, kind), parseLandScope(briefText).
 * opts = { cwd, task?, gitExec?, expectedOriginUrls?, now?, archiveRoot? }.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const EXPECTED_ORIGIN_URLS = [
  'https://github.com/joniZ2597/portfolio-tracker.git',
  'https://github.com/joniZ2597/portfolio-tracker'
];
const WORKER_SLOT_NAMES = ['pt-wt-worker-a', 'pt-wt-worker-b'];
const LAND_RECORD_NAME = 'pt-land-approval';
const PUSH_RECORD_NAME = 'pt-push-approval';
const LOCK_NAME = 'pt-land.lock';
const AUDIT_NAME = 'pt-land-log';
const LAND_EVIDENCE_RE = /^LAND-EVIDENCE: qa-offline=PASS \d+; targeted=PASS; codex-classI-unresolved=0$/;
const LAND_SCOPE_BEGIN = '<!-- land-scope:begin -->';
const LAND_SCOPE_END = '<!-- land-scope:end -->';
const TASK_RE = /^task\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const OID_RE = /^[0-9a-f]{40}$/;

// Protected paths - the union of the ASK/DENY tiers and other named-protected paths (brief §3 L8).
// Every pattern is written lowercase and matched against a lowercased candidate (see diffCheck) -
// a differently-cased path must not alias one of these on a case-insensitive filesystem.
const PROTECTED_PATH_RES = [
  /^\.claude\//,
  /^agents\.md$/,
  /^claude\.md$/,
  /^\.gitignore$/,
  /^qa\/run-offline\.js$/,
  /^netlify\.toml$/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^work\/[^/]+\/brief\.md$/,
  /^checkpoint\.md$/,
  /^\.env/
];

// ── small helpers ──────────────────────────────────────────────────────────────────────
function nowIso(opts) {
  if (opts && opts.now !== undefined) return typeof opts.now === 'function' ? opts.now() : opts.now;
  return new Date().toISOString();
}
// UTC yyyymmddThhmmssZ (brief AL-5 archive stamp format).
function nowStamp(opts) {
  const raw = opts && opts.now !== undefined ? (typeof opts.now === 'function' ? opts.now() : opts.now) : new Date().toISOString();
  const d = new Date(raw);
  const p2 = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()) + 'T' +
    p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + p2(d.getUTCSeconds()) + 'Z';
}
function toForwardSlash(p) { return String(p).replace(/\\/g, '/'); }
function normPath(p) { return toForwardSlash(p).toLowerCase().replace(/\/+$/, ''); }

function stripGitEnv(extra) {
  const env = {};
  for (const k of Object.keys(process.env)) if (!/^GIT_/i.test(k)) env[k] = process.env[k];
  if (extra) Object.assign(env, extra);
  return env;
}

function makeGitRunner(gitExec) {
  return function G(args, cwd, opts) {
    opts = opts || {};
    const env = stripGitEnv(opts.read ? { GIT_OPTIONAL_LOCKS: '0' } : null);
    return spawnSync(gitExec || 'git', args, {
      cwd, env, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024
    });
  };
}

function emptyHooksDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pt-land-hooks-'));
}

// ── record parsing (module API) ────────────────────────────────────────────────────────
function isCleanAsciiLine(raw) {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > 256) return null;
  for (let k = 0; k < raw.length; k += 1) {
    const c = raw.charCodeAt(k);
    if (c > 0x7e || (c < 0x20 && c !== 0x0d && c !== 0x0a)) return null;
  }
  const text = raw.replace(/\r\n$|\r$|\n$/, '');
  if (/[\r\n]/.test(text)) return null;
  return text;
}

function parseRecord(raw, kind) {
  const text = isCleanAsciiLine(raw);
  if (text === null) return null;
  const parts = text.split(' ');
  if (parts.length !== 4) return null;
  if (kind === 'LAND') {
    const [verb, task, tip, base] = parts;
    if (verb !== 'LAND') return null;
    if (!TASK_RE.test(task)) return null;
    if (!OID_RE.test(tip) || !OID_RE.test(base)) return null;
    return { kind: 'LAND', task, tip, base };
  }
  if (kind === 'PUSH') {
    const [verb, branch, l, r] = parts;
    if (verb !== 'PUSH') return null;
    if (branch !== 'branch-dev') return null;
    if (!OID_RE.test(l) || !OID_RE.test(r)) return null;
    return { kind: 'PUSH', branch, L: l, R: r };
  }
  return null;
}

function parseLandScope(text) {
  if (typeof text !== 'string') return null;
  const beginCount = text.split(LAND_SCOPE_BEGIN).length - 1;
  const endCount = text.split(LAND_SCOPE_END).length - 1;
  if (beginCount !== 1 || endCount !== 1) return null;
  const bi = text.indexOf(LAND_SCOPE_BEGIN);
  const ei = text.indexOf(LAND_SCOPE_END);
  if (bi === -1 || ei === -1 || ei < bi) return null;
  const body = text.slice(bi + LAND_SCOPE_BEGIN.length, ei);
  const paths = body.split(/\r\n|\r|\n/)
    .map((l) => l.replace(/^\s*[-*]\s*/, '').replace(/`/g, '').trim())
    .filter(Boolean);
  if (paths.length === 0) return null;
  return { paths };
}

function readRecordFile(commonDir, name) {
  const p = path.join(commonDir, name);
  if (!fs.existsSync(p)) return null;
  let buf;
  try { buf = fs.readFileSync(p); } catch (e) { return null; }
  if (buf.length === 0 || buf.length > 256) return null;
  for (let k = 0; k < buf.length; k += 1) {
    const b = buf[k];
    if (b > 0x7e || (b < 0x20 && b !== 0x0d && b !== 0x0a)) return null;
  }
  return buf.toString('ascii');
}

// ── caller context (L1/P1/K1) ──────────────────────────────────────────────────────────
function gitTopLevel(G, cwd) {
  const r = G(['rev-parse', '--show-toplevel'], cwd, { read: true });
  if (r.status !== 0) return null;
  return toForwardSlash(String(r.stdout).trim());
}
function gitCommonDirAbs(G, cwd) {
  const r = G(['rev-parse', '--git-common-dir'], cwd, { read: true });
  if (r.status !== 0) return null;
  const cd = String(r.stdout).trim();
  const abs = path.isAbsolute(cd) ? cd : path.resolve(cwd, cd);
  return toForwardSlash(abs);
}
function headRef(G, cwd) {
  const r = G(['symbolic-ref', 'HEAD'], cwd, { read: true });
  if (r.status !== 0) return null;
  return String(r.stdout).trim();
}

function resolveCaller(G, cwd, task) {
  if (typeof cwd !== 'string' || !cwd) return { ok: false, reason: 'the session cwd is unknown' };
  const topLevel = gitTopLevel(G, cwd);
  if (!topLevel) return { ok: false, reason: 'could not resolve the worktree top level' };
  const commonDirAbs = gitCommonDirAbs(G, cwd);
  if (!commonDirAbs) return { ok: false, reason: 'could not resolve the git common dir' };
  const canonicalRoot = path.dirname(commonDirAbs);
  let st;
  try { st = fs.statSync(path.join(canonicalRoot, '.git')); }
  catch (e) { return { ok: false, reason: 'the canonical .git could not be verified' }; }
  if (!st.isDirectory()) return { ok: false, reason: 'the canonical .git is not a directory' };

  if (normPath(topLevel) === normPath(canonicalRoot)) {
    return { ok: true, kind: 'canonical', canonicalRoot };
  }
  const base = path.basename(topLevel.replace(/\/+$/, ''));
  if (WORKER_SLOT_NAMES.indexOf(base) !== -1) {
    if (task) {
      const head = headRef(G, cwd);
      if (head !== 'refs/heads/' + task) {
        return { ok: false, reason: 'the Worker slot HEAD is not refs/heads/' + task };
      }
    }
    return { ok: true, kind: 'slot', canonicalRoot, slotRoot: topLevel };
  }
  return { ok: false, reason: 'the cwd is neither a Worker slot nor the canonical checkout' };
}

// ── self-integrity (L2/P2/K2) ──────────────────────────────────────────────────────────
function selfIntegrity(G, canonicalRoot) {
  const rel = '.claude/hooks/pt-land.js';
  const hashR = G(['hash-object', '--path=' + rel, '--', __filename], canonicalRoot, { read: true });
  if (hashR.status !== 0) return { ok: false, reason: 'self-integrity: hash-object failed' };
  const runningHash = String(hashR.stdout).trim();
  const blobR = G(['rev-parse', '-q', '--verify', 'refs/heads/branch-dev:' + rel], canonicalRoot, { read: true });
  if (blobR.status !== 0) return { ok: false, reason: 'self-integrity: could not resolve the branch-dev blob for ' + rel };
  const blobHash = String(blobR.stdout).trim();
  if (runningHash !== blobHash) return { ok: false, reason: 'self-integrity: the running pt-land.js differs from the branch-dev blob' };
  return { ok: true };
}

function loadIntegrityModule(canonicalRoot) {
  // Loaded from the CANONICAL checkout only (never a worktree copy) - L2's second clause.
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require(path.join(canonicalRoot, 'qa', 'guard_integrity_check.js'));
}

// ── LAND checks L3-L10 ─────────────────────────────────────────────────────────────────
function currentMainOid(G, canonicalRoot) {
  const r = G(['rev-parse', '--verify', '-q', 'refs/heads/main'], canonicalRoot, { read: true });
  return r.status === 0 ? String(r.stdout).trim() : null;
}

function resolveL3(G, canonicalRoot, task) {
  const tipR = G(['rev-parse', '--verify', '-q', 'refs/heads/' + task], canonicalRoot, { read: true });
  if (tipR.status !== 0) return { ok: false, reason: 'refs/heads/' + task + ' does not exist' };
  const tip = String(tipR.stdout).trim();
  const baseR = G(['rev-parse', '--verify', '-q', 'refs/heads/branch-dev'], canonicalRoot, { read: true });
  if (baseR.status !== 0) return { ok: false, reason: 'refs/heads/branch-dev does not exist' };
  const base = String(baseR.stdout).trim();
  const anc = G(['merge-base', '--is-ancestor', base, tip], canonicalRoot, { read: true });
  if (anc.status !== 0) return { ok: false, reason: 'branch-dev moved: Second LAND (Owner rebase, R3m)' };
  const cnt = G(['rev-list', '--count', base + '..' + tip], canonicalRoot, { read: true });
  if (cnt.status !== 0) return { ok: false, reason: 'could not count commits in base..tip' };
  const n = parseInt(String(cnt.stdout).trim(), 10);
  if (!Number.isFinite(n) || n < 1) return { ok: false, reason: 'no commits in base..tip' };
  const merges = G(['rev-list', '--merges', base + '..' + tip], canonicalRoot, { read: true });
  if (merges.status !== 0) return { ok: false, reason: 'could not check for merge commits' };
  if (String(merges.stdout).trim()) return { ok: false, reason: 'a merge commit is present in base..tip' };
  return { ok: true, tip, base, count: n };
}

function canonicalClean(G, canonicalRoot) {
  const head = headRef(G, canonicalRoot);
  if (head !== 'refs/heads/branch-dev') return { ok: false, reason: 'the canonical HEAD is not branch-dev' };
  const st = G(['status', '--porcelain=v2', '--untracked-files=all'], canonicalRoot, { read: true });
  if (st.status !== 0) return { ok: false, reason: 'the canonical status could not be read' };
  if (String(st.stdout).trim()) return { ok: false, reason: 'the canonical checkout is not clean' };
  return { ok: true };
}

function worktreeList(G, canonicalRoot) {
  const r = G(['worktree', 'list', '--porcelain'], canonicalRoot, { read: true });
  if (r.status !== 0) return null;
  const trees = [];
  let cur = null;
  for (const line of String(r.stdout).split('\n')) {
    if (line.startsWith('worktree ')) { cur = { path: line.slice(9).trim(), branch: null }; trees.push(cur); }
    else if (cur && line.startsWith('branch ')) cur.branch = line.slice(7).trim().replace(/^refs\/heads\//, '');
  }
  return trees;
}

function taskWorktreeClean(G, canonicalRoot, task, tip) {
  const trees = worktreeList(G, canonicalRoot);
  if (!trees) return { ok: false, reason: 'could not list worktrees' };
  const t = trees.find((x) => x.branch === task);
  if (!t) return { ok: true }; // task/<id> not checked out anywhere - vacuous pass
  const st = G(['status', '--porcelain=v2', '--untracked-files=all'], t.path, { read: true });
  if (st.status !== 0) return { ok: false, reason: 'the task worktree status could not be read' };
  if (String(st.stdout).trim()) return { ok: false, reason: 'the task worktree is not clean' };
  const h = G(['rev-parse', 'HEAD'], t.path, { read: true });
  if (h.status !== 0 || String(h.stdout).trim() !== tip) return { ok: false, reason: 'the task worktree HEAD does not equal the tip' };
  return { ok: true };
}

function briefUnedited(G, canonicalRoot, task, base, tip) {
  const briefPath = 'work/' + task.replace(/^task\//, '') + '/brief.md';
  const baseBlob = G(['rev-parse', '-q', '--verify', base + ':' + briefPath], canonicalRoot, { read: true });
  if (baseBlob.status !== 0) return { ok: false, reason: 'work/<id>/brief.md is missing at the base - legacy brief: Owner LAND' };
  const tipBlob = G(['rev-parse', '-q', '--verify', tip + ':' + briefPath], canonicalRoot, { read: true });
  if (tipBlob.status !== 0) return { ok: false, reason: 'work/<id>/brief.md is missing at the tip' };
  if (String(baseBlob.stdout).trim() !== String(tipBlob.stdout).trim()) {
    return { ok: false, reason: 'work/<id>/brief.md was edited by the task' };
  }
  return { ok: true, briefPath };
}

function diffCheck(G, canonicalRoot, base, tip, scopePaths, reviewPath) {
  const d = G(['diff', '--name-only', '--no-renames', base, tip], canonicalRoot, { read: true });
  if (d.status !== 0) return { ok: false, reason: 'git diff --name-only base tip failed' };
  const files = String(d.stdout).split('\n').map((s) => s.trim()).filter(Boolean);
  const allowed = new Set(scopePaths.concat([reviewPath]));
  const outside = files.filter((f) => !allowed.has(f));
  if (outside.length) return { ok: false, reason: 'diff outside land-scope: ' + outside.join(', ') };
  if (files.indexOf(reviewPath) === -1) return { ok: false, reason: 'diff does not contain ' + reviewPath };
  // Case-insensitive: Windows/macOS filesystems resolve a differently-cased path to the same
  // on-disk file (e.g. ".CLAUDE/hooks/x" aliases ".claude/hooks/x"), so a land-scope entry must
  // not be able to alias a protected path by case alone.
  const protectedHit = files.find((f) => PROTECTED_PATH_RES.some((re) => re.test(f.toLowerCase())));
  if (protectedHit) return { ok: false, reason: 'protected path: Owner LAND (' + protectedHit + ')' };
  return { ok: true, files };
}

function landEvidenceCheck(G, canonicalRoot, tip, reviewPath) {
  const r = G(['show', tip + ':' + reviewPath], canonicalRoot, { read: true });
  if (r.status !== 0) return { ok: false, reason: 'could not read ' + reviewPath + ' at the tip - diff does not contain it' };
  const lines = String(r.stdout).split(/\r\n|\r|\n/).filter((l) => LAND_EVIDENCE_RE.test(l));
  if (lines.length !== 1) return { ok: false, reason: 'LAND-EVIDENCE line missing or duplicated (found ' + lines.length + ')' };
  return { ok: true };
}

// ── locking / audit ─────────────────────────────────────────────────────────────────────
function acquireLock(commonDir) {
  const p = path.join(commonDir, LOCK_NAME);
  try {
    const fd = fs.openSync(p, 'wx');
    fs.closeSync(fd);
    return { ok: true, path: p };
  } catch (e) {
    if (e && e.code === 'EEXIST') return { ok: false, reason: 'stale lock - Owner removes it' };
    return { ok: false, reason: 'could not create the lock (' + (e && e.message ? e.message : String(e)) + ')' };
  }
}
function releaseLock(p) { try { fs.unlinkSync(p); } catch (e) { /* already gone */ } }
function appendAudit(commonDir, entry) {
  fs.appendFileSync(path.join(commonDir, AUDIT_NAME), JSON.stringify(entry) + '\n');
}
// For a refusal or an already-failed verification: the primary reason is correct and informative
// on its own, and a secondary audit-write failure must never mask it by throwing past it (that
// would report a misleading 'INTERNAL:' reason instead of the real one). Best-effort only.
function bestEffortAudit(commonDir, entry) {
  try { appendAudit(commonDir, entry); } catch (e) { /* best effort - see the success-path callers below for the surfaced case */ }
}

// ── LAND (land-request / land) ──────────────────────────────────────────────────────────
function buildLandApprovalLine(task, tip, base, commonDir) {
  return "! printf '%s\\n' 'LAND " + task + ' ' + tip + ' ' + base + "' > '" + toForwardSlash(commonDir) + '/' + LAND_RECORD_NAME + "'";
}

function runLandCore(opts, doLand) {
  const task = opts.task;
  if (typeof task !== 'string' || !TASK_RE.test(task)) {
    return { ok: false, exitCode: 3, reason: 'usage: pt-land.js land[-request] task/<id>' };
  }
  const G = makeGitRunner(opts.gitExec);
  const caller = resolveCaller(G, opts.cwd, task);
  if (!caller.ok) return { ok: false, exitCode: 1, reason: 'L1: ' + caller.reason };
  const canonicalRoot = caller.canonicalRoot;
  const commonDir = path.join(canonicalRoot, '.git');

  function refuse(step, reason, from, to) {
    if (doLand) {
      bestEffortAudit(commonDir, { ts: nowIso(opts), verb: 'land', task, from: from || null, to: to || null, result: 'refuse', reason: step + ': ' + reason });
    }
    return { ok: false, exitCode: 1, reason: step + ': ' + reason };
  }

  const si = selfIntegrity(G, canonicalRoot);
  if (!si.ok) return refuse('L2', si.reason);

  const l3 = resolveL3(G, canonicalRoot, task);
  if (!l3.ok) return refuse('L3', l3.reason);

  const l4 = canonicalClean(G, canonicalRoot);
  if (!l4.ok) return refuse('L4', l4.reason, l3.base, l3.tip);

  const l5 = taskWorktreeClean(G, canonicalRoot, task, l3.tip);
  if (!l5.ok) return refuse('L5', l5.reason, l3.base, l3.tip);

  const l6 = briefUnedited(G, canonicalRoot, task, l3.base, l3.tip);
  if (!l6.ok) return refuse('L6', l6.reason, l3.base, l3.tip);

  const briefTextR = G(['show', l3.base + ':' + l6.briefPath], canonicalRoot, { read: true });
  if (briefTextR.status !== 0) return refuse('L7', 'could not read brief.md at the base', l3.base, l3.tip);
  const scope = parseLandScope(String(briefTextR.stdout));
  if (!scope) return refuse('L7', 'legacy brief: Owner LAND', l3.base, l3.tip);

  const idPart = task.replace(/^task\//, '');
  const reviewPath = 'work/' + idPart + '/review.md';
  const l8 = diffCheck(G, canonicalRoot, l3.base, l3.tip, scope.paths, reviewPath);
  if (!l8.ok) return refuse('L8', l8.reason, l3.base, l3.tip);

  const l9 = landEvidenceCheck(G, canonicalRoot, l3.tip, reviewPath);
  if (!l9.ok) return refuse('L9', l9.reason, l3.base, l3.tip);

  let integrity;
  try { integrity = loadIntegrityModule(canonicalRoot); }
  catch (e) { return refuse('L10', 'could not load the integrity module (' + e.message + ')', l3.base, l3.tip); }
  const mainOid = currentMainOid(G, canonicalRoot);
  const ires = integrity.runIntegrity({ baseMain: mainOid, baseDev: l3.base, task, root: canonicalRoot, gitExec: opts.gitExec });
  if (!ires.ok) return refuse('L10', 'integrity FAIL: ' + ires.failures.join('; '), l3.base, l3.tip);

  const report = {
    task, tip: l3.tip, base: l3.base, commitCount: l3.count, files: l8.files,
    checks: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10'].map((id) => id + ' PASS')
  };
  const approvalLine = buildLandApprovalLine(task, l3.tip, l3.base, commonDir);

  if (!doLand) return { ok: true, exitCode: 0, verb: 'land-request', report, approvalLine };

  // L12
  const record = parseRecord(readRecordFile(commonDir, LAND_RECORD_NAME), 'LAND');
  if (!record || record.task !== task || record.tip !== l3.tip || record.base !== l3.base) {
    return refuse('L12', 'no/stale LAND approval', l3.base, l3.tip);
  }

  // L13
  const lock = acquireLock(commonDir);
  if (!lock.ok) return refuse('L13', lock.reason, l3.base, l3.tip);
  try {
    const l3b = resolveL3(G, canonicalRoot, task);
    const l4b = canonicalClean(G, canonicalRoot);
    if (!l3b.ok || l3b.tip !== l3.tip || l3b.base !== l3.base || !l4b.ok) {
      return refuse('L13', 'the repository state changed since preflight (race)', l3.base, l3.tip);
    }

    // L14
    const hooksDir = emptyHooksDir();
    const mergeEnv = stripGitEnv();
    const mergeR = spawnSync(opts.gitExec || 'git',
      ['-c', 'core.hooksPath=' + toForwardSlash(hooksDir), 'merge', '--ff-only', 'refs/heads/' + task],
      { cwd: canonicalRoot, env: mergeEnv, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
    if (mergeR.status !== 0) {
      return refuse('L14', 'git merge --ff-only exited ' + mergeR.status + ': ' + String(mergeR.stderr || '').trim(), l3.base, l3.tip);
    }

    // L15
    const devOid = G(['rev-parse', 'refs/heads/branch-dev'], canonicalRoot, { read: true });
    const headOid = G(['rev-parse', 'HEAD'], canonicalRoot, { read: true });
    const stAfter = G(['status', '--porcelain=v2', '--untracked-files=all'], canonicalRoot, { read: true });
    const okAfter = devOid.status === 0 && String(devOid.stdout).trim() === l3.tip &&
      headOid.status === 0 && String(headOid.stdout).trim() === l3.tip &&
      stAfter.status === 0 && !String(stAfter.stdout).trim();
    if (!okAfter) {
      bestEffortAudit(commonDir, { ts: nowIso(opts), verb: 'land', task, from: l3.base, to: l3.tip, result: 'fail', reason: 'L15: LAND verification failed' });
      return { ok: false, exitCode: 1, reason: 'L15: LAND verification failed - STOP (the tool never tries to undo a merge)' };
    }

    // L16 - the merge is DONE and independently verified above; an audit-write failure here must
    // not be reported as ok:false (that would misleadingly suggest the LAND itself failed, when
    // the git-level mutation already happened and was verified). Surface it as a warning instead.
    try { fs.unlinkSync(path.join(commonDir, LAND_RECORD_NAME)); } catch (e) { /* already gone */ }
    let auditWarning = null;
    try {
      appendAudit(commonDir, { ts: nowIso(opts), verb: 'land', task, from: l3.base, to: l3.tip, result: 'ok', reason: null });
    } catch (e) {
      auditWarning = 'audit log append failed: ' + (e && e.message ? e.message : String(e));
    }
    const success = { ok: true, exitCode: 0, verb: 'land', message: 'LANDED ' + task + ' ' + l3.base + '..' + l3.tip };
    if (auditWarning) success.auditWarning = auditWarning;
    return success;
  } finally {
    releaseLock(lock.path);
  }
}
// Any unexpected throw (including an audit-write failure that must not be swallowed - see
// appendAudit) becomes a clean fail-closed result instead of an uncaught exception, keeping the
// documented {ok, exitCode, ...} contract even when something inside the call throws.
function safeRun(fn) {
  try { return fn(); }
  catch (e) { return { ok: false, exitCode: 1, reason: 'INTERNAL: ' + (e && e.message ? e.message : String(e)) }; }
}
function runLandRequest(opts) { return safeRun(() => runLandCore(opts, false)); }
function runLand(opts) { return safeRun(() => runLandCore(opts, true)); }

// ── PUSH (push-request / push) ──────────────────────────────────────────────────────────
function remoteConfigCheck(G, canonicalRoot, expectedUrls) {
  const urlR = G(['config', '--get-all', 'remote.origin.url'], canonicalRoot, { read: true });
  const urls = urlR.status === 0 ? String(urlR.stdout).split('\n').map((s) => s.trim()).filter(Boolean) : [];
  if (urls.length !== 1) return { ok: false, reason: 'remote.origin.url does not have exactly one value' };
  if (expectedUrls.indexOf(urls[0]) === -1) return { ok: false, reason: 'remote.origin.url is not in the expected list' };
  const pushUrlR = G(['config', '--get-all', 'remote.origin.pushurl'], canonicalRoot, { read: true });
  if (pushUrlR.status === 0 && String(pushUrlR.stdout).trim()) return { ok: false, reason: 'remote.origin.pushurl is set' };
  const allR = G(['config', '--list', '--null'], canonicalRoot, { read: true });
  if (allR.status !== 0) return { ok: false, reason: 'git config --list failed' };
  for (const rec of String(allR.stdout).split('\0')) {
    if (!rec) continue;
    const nl = rec.indexOf('\n');
    const key = (nl === -1 ? rec : rec.slice(0, nl)).trim();
    if (/^url\..+\.(insteadof|pushinsteadof)$/i.test(key)) {
      return { ok: false, reason: 'a url.*.insteadOf/pushInsteadOf key exists (' + key + ')' };
    }
  }
  return { ok: true };
}

function localVsRemote(G, canonicalRoot) {
  const lR = G(['rev-parse', '--verify', '-q', 'refs/heads/branch-dev'], canonicalRoot, { read: true });
  if (lR.status !== 0) return { ok: false, reason: 'local branch-dev does not exist' };
  const L = String(lR.stdout).trim();
  const rR = G(['rev-parse', '--verify', '-q', 'refs/remotes/origin/branch-dev'], canonicalRoot, { read: true });
  if (rR.status !== 0) return { ok: false, reason: 'origin/branch-dev tracking ref does not exist' };
  const R = String(rR.stdout).trim();
  if (L === R) return { ok: false, reason: 'nothing to push' };
  const anc = G(['merge-base', '--is-ancestor', R, L], canonicalRoot, { read: true });
  if (anc.status !== 0) return { ok: false, reason: 'origin/branch-dev is not an ancestor of local branch-dev' };
  return { ok: true, L, R };
}

function remoteMatchesTracking(G, canonicalRoot, R) {
  const ls = G(['ls-remote', 'origin', 'refs/heads/branch-dev'], canonicalRoot, { read: true });
  if (ls.status !== 0) return { ok: false, reason: 'ls-remote failed' };
  const m = /^([0-9a-f]{40})\s+refs\/heads\/branch-dev$/m.exec(String(ls.stdout).trim());
  if (!m || m[1] !== R) return { ok: false, reason: 'remote moved: STOP, no automatic reconciliation' };
  return { ok: true };
}

function buildPushApprovalLine(L, R, commonDir) {
  return "! printf '%s\\n' 'PUSH branch-dev " + L + ' ' + R + "' > '" + toForwardSlash(commonDir) + '/' + PUSH_RECORD_NAME + "'";
}

function runPushCore(opts, doPush) {
  const G = makeGitRunner(opts.gitExec);
  const expectedUrls = opts.expectedOriginUrls || EXPECTED_ORIGIN_URLS;
  const caller = resolveCaller(G, opts.cwd, null);
  if (!caller.ok) return { ok: false, exitCode: 1, reason: 'P1: ' + caller.reason };
  const canonicalRoot = caller.canonicalRoot;
  const commonDir = path.join(canonicalRoot, '.git');

  function refuse(step, reason, from, to) {
    if (doPush) {
      bestEffortAudit(commonDir, { ts: nowIso(opts), verb: 'push', task: null, from: from || null, to: to || null, result: 'refuse', reason: step + ': ' + reason });
    }
    return { ok: false, exitCode: 1, reason: step + ': ' + reason };
  }

  const si = selfIntegrity(G, canonicalRoot);
  if (!si.ok) return refuse('P2', si.reason);

  const p3 = canonicalClean(G, canonicalRoot);
  if (!p3.ok) return refuse('P3', p3.reason);

  const p4 = remoteConfigCheck(G, canonicalRoot, expectedUrls);
  if (!p4.ok) return refuse('P4', p4.reason);

  const p5 = localVsRemote(G, canonicalRoot);
  if (!p5.ok) return refuse('P5', p5.reason);

  const p6 = remoteMatchesTracking(G, canonicalRoot, p5.R);
  if (!p6.ok) return refuse('P6', p6.reason, p5.R, p5.L);

  let integrity;
  try { integrity = loadIntegrityModule(canonicalRoot); }
  catch (e) { return refuse('P7', 'could not load the integrity module (' + e.message + ')', p5.R, p5.L); }
  const mainOid = currentMainOid(G, canonicalRoot);
  const ires = integrity.runIntegrity({ baseMain: mainOid, baseDev: p5.L, root: canonicalRoot, gitExec: opts.gitExec });
  if (!ires.ok) return refuse('P7', 'integrity FAIL: ' + ires.failures.join('; '), p5.R, p5.L);

  const logR = G(['log', '--oneline', p5.R + '..' + p5.L], canonicalRoot, { read: true });
  if (logR.status !== 0) return refuse('P8', 'could not list the commits to publish (git log failed)', p5.R, p5.L);
  const commits = String(logR.stdout).trim();
  const notice = 'This push publishes branch-dev to origin and to the public Netlify DEV deploy ' +
    '(https://branch-dev--portfoliotrk.netlify.app). It never touches main or production.';
  const approvalLine = buildPushApprovalLine(p5.L, p5.R, commonDir);

  if (!doPush) return { ok: true, exitCode: 0, verb: 'push-request', commits, notice, approvalLine, L: p5.L, R: p5.R };

  // P9
  const record = parseRecord(readRecordFile(commonDir, PUSH_RECORD_NAME), 'PUSH');
  if (!record || record.L !== p5.L || record.R !== p5.R) {
    return refuse('P9', 'no/stale PUSH approval', p5.R, p5.L);
  }

  // P10
  const lock = acquireLock(commonDir);
  if (!lock.ok) return refuse('P10', lock.reason, p5.R, p5.L);
  try {
    const p5b = localVsRemote(G, canonicalRoot);
    const p3b = canonicalClean(G, canonicalRoot);
    if (!p5b.ok || p5b.L !== p5.L || p5b.R !== p5.R || !p3b.ok) {
      return refuse('P10', 'the repository state changed since preflight (race)', p5.R, p5.L);
    }

    // P11
    const hooksDir = emptyHooksDir();
    const pushEnv = stripGitEnv();
    const pushR = spawnSync(opts.gitExec || 'git',
      ['-c', 'core.hooksPath=' + toForwardSlash(hooksDir), '-c', 'push.followTags=false',
        'push', '--porcelain', '--no-verify', 'origin', 'refs/heads/branch-dev:refs/heads/branch-dev'],
      { cwd: canonicalRoot, env: pushEnv, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
    if (pushR.status !== 0) {
      return refuse('P11', 'git push exited ' + pushR.status + ': ' + String(pushR.stderr || '').trim(), p5.R, p5.L);
    }

    // P12
    const lsAfter = G(['ls-remote', 'origin', 'refs/heads/branch-dev'], canonicalRoot, { read: true });
    const m = lsAfter.status === 0 ? /^([0-9a-f]{40})\s+refs\/heads\/branch-dev$/m.exec(String(lsAfter.stdout).trim()) : null;
    const trackR = G(['rev-parse', '--verify', '-q', 'refs/remotes/origin/branch-dev'], canonicalRoot, { read: true });
    const okAfter = m && m[1] === p5.L && trackR.status === 0 && String(trackR.stdout).trim() === p5.L;
    if (!okAfter) {
      bestEffortAudit(commonDir, { ts: nowIso(opts), verb: 'push', task: null, from: p5.R, to: p5.L, result: 'fail', reason: 'P12: push verification failed' });
      return { ok: false, exitCode: 1, reason: 'P12: push verification failed - STOP' };
    }

    // P13 - the push is DONE and independently verified above; an audit-write failure here must
    // not be reported as ok:false (that would misleadingly suggest the push itself failed, when
    // the git-level mutation already happened and was verified). Surface it as a warning instead.
    try { fs.unlinkSync(path.join(commonDir, PUSH_RECORD_NAME)); } catch (e) { /* already gone */ }
    let auditWarning = null;
    try {
      appendAudit(commonDir, { ts: nowIso(opts), verb: 'push', task: null, from: p5.R, to: p5.L, result: 'ok', reason: null });
    } catch (e) {
      auditWarning = 'audit log append failed: ' + (e && e.message ? e.message : String(e));
    }
    const success = { ok: true, exitCode: 0, verb: 'push', message: 'PUSHED branch-dev ' + p5.R + '..' + p5.L + '; branch-dev == origin/branch-dev' };
    if (auditWarning) success.auditWarning = auditWarning;
    return success;
  } finally {
    releaseLock(lock.path);
  }
}
function runPushRequest(opts) { return safeRun(() => runPushCore(opts, false)); }
function runPush(opts) { return safeRun(() => runPushCore(opts, true)); }

// ── CLEANUP (work/worker-continuous-flow/brief.md §5, AL-4: mechanical, no approval record) ──
// K1-K9, every check fails closed; any refusal -> exit 1, no change. Never touches branch-dev,
// main, remotes, tags, git hooks, or any worktree other than refs/heads/task/<id>'s own.
function runCleanupCore(opts) {
  const task = opts.task;
  if (typeof task !== 'string' || !TASK_RE.test(task)) {
    return { ok: false, exitCode: 3, reason: 'usage: pt-land.js cleanup task/<id>' };
  }
  const G = makeGitRunner(opts.gitExec);

  // K1: caller context (reuses L1's resolveCaller - if invoked from a Worker slot, that slot's
  // HEAD must already be this exact task branch; invoked from the canonical checkout, any task
  // may be named, including one checked out nowhere - branch-only cleanup).
  const caller = resolveCaller(G, opts.cwd, task);
  if (!caller.ok) return { ok: false, exitCode: 1, reason: 'K1: ' + caller.reason };
  const canonicalRoot = caller.canonicalRoot;
  const commonDir = path.join(canonicalRoot, '.git');

  function refuse(step, reason, from, to) {
    bestEffortAudit(commonDir, { ts: nowIso(opts), verb: 'cleanup', task, from: from || null, to: to || null, result: 'refuse', reason: step + ': ' + reason });
    return { ok: false, exitCode: 1, reason: step + ': ' + reason };
  }

  // K2: self-integrity, same as L2/P2.
  const si = selfIntegrity(G, canonicalRoot);
  if (!si.ok) return refuse('K2', si.reason);

  // K3: landed AND pushed - tip is an ancestor of both refs/heads/branch-dev and
  // refs/remotes/origin/branch-dev.
  const tipR = G(['rev-parse', '--verify', '-q', 'refs/heads/' + task], canonicalRoot, { read: true });
  if (tipR.status !== 0) return refuse('K3', 'refs/heads/' + task + ' does not exist');
  const tip = String(tipR.stdout).trim();
  const devAnc = G(['merge-base', '--is-ancestor', tip, 'refs/heads/branch-dev'], canonicalRoot, { read: true });
  if (devAnc.status !== 0) return refuse('K3', 'not landed (tip is not an ancestor of branch-dev)');
  const originAnc = G(['merge-base', '--is-ancestor', tip, 'refs/remotes/origin/branch-dev'], canonicalRoot, { read: true });
  if (originAnc.status !== 0) return refuse('K3', 'not pushed (tip is not an ancestor of origin/branch-dev)');

  // K1 (continued): find whether any worktree currently has this branch checked out.
  const trees = worktreeList(G, canonicalRoot);
  if (!trees) return refuse('K1', 'could not list worktrees');
  const slotTree = trees.find((t) => t.branch === task);
  const hadSlot = !!slotTree;

  // K4: the task worktree must be clean (ignored files allowed) - skipped when branch-only.
  if (hadSlot) {
    const st = G(['status', '--porcelain=v2', '--untracked-files=all'], slotTree.path, { read: true });
    if (st.status !== 0) return refuse('K4', 'the task worktree status could not be read');
    if (String(st.stdout).trim()) return refuse('K4', 'slot not clean');
  }

  // K5: lock.
  const lock = acquireLock(commonDir);
  if (!lock.ok) return refuse('K5', lock.reason);
  try {
    let archiveDir = null;
    let devOid = null;
    let archivedCount = 0;

    // K6: archive the task's ignored evidence (plan.md, codex.md, qa.log, ...) - skipped when
    // branch-only. Every copy is sha256-verified BEFORE any original is deleted; any failure
    // refuses with nothing deleted (partial archive copies are rolled back).
    if (hadSlot) {
      const idPart = task.replace(/^task\//, '');
      const workPrefix = 'work/' + idPart + '/';
      const lsR = G(['ls-files', '--others', '--ignored', '--exclude-standard', '--', workPrefix], slotTree.path, { read: true });
      if (lsR.status !== 0) return refuse('K6', 'could not list ignored files under ' + workPrefix);
      const ignoredFiles = String(lsR.stdout).split('\n').map((s) => s.trim()).filter(Boolean);
      const archiveRoot = opts.archiveRoot || path.join(canonicalRoot, '..', 'pt-work-artifacts');
      const stamp = nowStamp(opts);
      archiveDir = path.join(archiveRoot, idPart, stamp);
      const archived = [];
      try {
        for (const rel of ignoredFiles) {
          const relUnderWork = rel.slice(workPrefix.length);
          const srcAbs = path.join(slotTree.path, rel);
          const destAbs = path.join(archiveDir, relUnderWork);
          if (fs.existsSync(destAbs)) throw new Error('archive destination already exists: ' + destAbs);
          fs.mkdirSync(path.dirname(destAbs), { recursive: true });
          const buf = fs.readFileSync(srcAbs);
          fs.writeFileSync(destAbs, buf, { flag: 'wx' });
          const srcHash = crypto.createHash('sha256').update(buf).digest('hex');
          const destHash = crypto.createHash('sha256').update(fs.readFileSync(destAbs)).digest('hex');
          if (srcHash !== destHash) throw new Error('sha256 mismatch for ' + rel);
          archived.push({ srcAbs, destAbs });
        }
        archivedCount = archived.length;
      } catch (e) {
        for (const a of archived) { try { fs.unlinkSync(a.destAbs); } catch (e2) { /* best effort */ } }
        return refuse('K6', 'archive failed (' + (e && e.message ? e.message : String(e)) + ') - nothing deleted');
      }
      // Originals are deleted only after every copy is written and sha256-verified above. A
      // delete failure stops immediately (no detach, no branch delete) - the already-verified
      // archive and any not-yet-deleted original are both left in place; nothing is guessed.
      for (const a of archived) {
        try { fs.unlinkSync(a.srcAbs); }
        catch (e) { return refuse('K6', 'could not delete the original after archiving (' + a.srcAbs + '): ' + (e && e.message ? e.message : String(e))); }
      }
    }

    // K7: detach the slot at branch-dev's current OID (by OID - R10-4's ref-name checks never
    // see a name) - skipped when branch-only.
    if (hadSlot) {
      const devOidR = G(['rev-parse', 'refs/heads/branch-dev'], canonicalRoot, { read: true });
      if (devOidR.status !== 0) return refuse('K7', 'could not resolve branch-dev OID');
      devOid = String(devOidR.stdout).trim();
      const hooksDir = emptyHooksDir();
      const switchR = spawnSync(opts.gitExec || 'git',
        ['-c', 'core.hooksPath=' + toForwardSlash(hooksDir), 'switch', '--detach', devOid],
        { cwd: slotTree.path, env: stripGitEnv(), encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
      if (switchR.status !== 0) {
        return refuse('K7', 'git switch --detach exited ' + switchR.status + ': ' + String(switchR.stderr || '').trim());
      }
    }

    // K8: safe branch delete only (canonical checkout) - never -D, never on branch-dev/main.
    const hooksDir2 = emptyHooksDir();
    const delR = spawnSync(opts.gitExec || 'git',
      ['-c', 'core.hooksPath=' + toForwardSlash(hooksDir2), 'branch', '-d', task],
      { cwd: canonicalRoot, env: stripGitEnv(), encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
    if (delR.status !== 0) {
      return refuse('K8', 'git branch -d exited ' + delR.status + ': ' + String(delR.stderr || '').trim());
    }

    // K9: verify.
    if (hadSlot) {
      const headR = G(['rev-parse', 'HEAD'], slotTree.path, { read: true });
      const devOidR2 = G(['rev-parse', 'refs/heads/branch-dev'], canonicalRoot, { read: true });
      const stAfter = G(['status', '--porcelain=v2', '--untracked-files=all'], slotTree.path, { read: true });
      const symR = G(['symbolic-ref', '-q', 'HEAD'], slotTree.path, { read: true }); // fails (detached) by design
      const detached = symR.status !== 0;
      const okSlot = detached && headR.status === 0 && devOidR2.status === 0 &&
        String(headR.stdout).trim() === String(devOidR2.stdout).trim() &&
        stAfter.status === 0 && !String(stAfter.stdout).trim();
      if (!okSlot) {
        bestEffortAudit(commonDir, { ts: nowIso(opts), verb: 'cleanup', task, from: tip, to: null, result: 'fail', reason: 'K9: slot verification failed' });
        return { ok: false, exitCode: 1, reason: 'K9: slot verification failed - STOP (cleanup never tries to undo)' };
      }
    }
    const branchCheckR = G(['rev-parse', '--verify', '-q', 'refs/heads/' + task], canonicalRoot, { read: true });
    if (branchCheckR.status === 0) {
      bestEffortAudit(commonDir, { ts: nowIso(opts), verb: 'cleanup', task, from: tip, to: null, result: 'fail', reason: 'K9: branch still present' });
      return { ok: false, exitCode: 1, reason: 'K9: branch still present after delete - STOP' };
    }

    let auditWarning = null;
    try {
      appendAudit(commonDir, { ts: nowIso(opts), verb: 'cleanup', task, from: tip, to: null, result: 'ok', reason: null });
    } catch (e) {
      auditWarning = 'audit log append failed: ' + (e && e.message ? e.message : String(e));
    }
    const success = {
      ok: true, exitCode: 0, verb: 'cleanup',
      message: 'CLEANED ' + task + (hadSlot
        ? '; slot detached at ' + devOid + (archivedCount > 0 ? '; evidence archived to ' + archiveDir : '; no ignored evidence to archive')
        : '; no slot was checked out; no evidence to archive')
    };
    if (auditWarning) success.auditWarning = auditWarning;
    return success;
  } finally {
    releaseLock(lock.path);
  }
}
function runCleanup(opts) { return safeRun(() => runCleanupCore(opts)); }

// ── CLI ─────────────────────────────────────────────────────────────────────────────────
function printLandRequest(res) {
  process.stdout.write('LAND REQUEST for ' + res.report.task + '\n');
  process.stdout.write('  tip:  ' + res.report.tip + '\n');
  process.stdout.write('  base: ' + res.report.base + '\n');
  process.stdout.write('  commits: ' + res.report.commitCount + '\n');
  process.stdout.write('  files:\n' + res.report.files.map((f) => '    ' + f).join('\n') + '\n');
  process.stdout.write('  checks:\n' + res.report.checks.map((c) => '    ' + c).join('\n') + '\n');
  process.stdout.write('\n' + res.approvalLine + '\n');
}
function printPushRequest(res) {
  process.stdout.write('PUSH REQUEST\n');
  if (res.commits) process.stdout.write(res.commits + '\n');
  process.stdout.write('\n' + res.notice + '\n');
  process.stdout.write('\n' + res.approvalLine + '\n');
}
function output(res, verb) {
  if (!res.ok) {
    process.stderr.write('pt-land: ' + (res.exitCode === 3 ? 'usage error - ' : '') + res.reason + '\n');
    process.exit(res.exitCode);
  }
  if (verb === 'land-request') printLandRequest(res);
  else if (verb === 'land') process.stdout.write(res.message + '\n');
  else if (verb === 'push-request') printPushRequest(res);
  else if (verb === 'push') process.stdout.write(res.message + '\n');
  else if (verb === 'cleanup') process.stdout.write(res.message + '\n');
  // The Owner reads the mutation result from CLI output; a successful merge/push/cleanup whose
  // audit append failed must still surface that warning here, not only in the module-API result.
  if (res.auditWarning) process.stderr.write('pt-land: WARNING - ' + res.auditWarning + '\n');
  process.exit(0);
}
function main(argv) {
  const verb = argv[0];
  const opts = { cwd: process.cwd() };
  if (verb === 'land-request' || verb === 'land') {
    if (argv.length !== 2 || typeof argv[1] !== 'string' || !argv[1]) {
      process.stderr.write('pt-land: usage error - usage: pt-land.js ' + verb + ' task/<id>\n');
      process.exit(3);
      return;
    }
    opts.task = argv[1];
    output(verb === 'land' ? runLand(opts) : runLandRequest(opts), verb);
  } else if (verb === 'push-request' || verb === 'push') {
    if (argv.length !== 1) {
      process.stderr.write('pt-land: usage error - usage: pt-land.js ' + verb + '\n');
      process.exit(3);
      return;
    }
    output(verb === 'push' ? runPush(opts) : runPushRequest(opts), verb);
  } else if (verb === 'cleanup') {
    if (argv.length !== 2 || typeof argv[1] !== 'string' || !argv[1]) {
      process.stderr.write('pt-land: usage error - usage: pt-land.js cleanup task/<id>\n');
      process.exit(3);
      return;
    }
    opts.task = argv[1];
    output(runCleanup(opts), verb);
  } else {
    process.stderr.write('pt-land: usage error - unknown verb ' + JSON.stringify(verb) + '\n');
    process.exit(3);
  }
}

module.exports = {
  runLandRequest, runLand, runPushRequest, runPush, runCleanup, parseRecord, parseLandScope
};

if (require.main === module) {
  main(process.argv.slice(2));
}
