#!/usr/bin/env node
'use strict';

/*
 * R12: Owner-approved LAND + push tool (work/worker-land-push/brief.md §2-3).
 * DENY-tier (.claude/hooks/**) - changed only through the Owner copy/hash workflow.
 *
 * Verbs: brief-request work/<id>/brief.md | protected-request task/<id> | protected-commit task/<id> |
 *        land-request task/<id> | land task/<id> | push-request | push | cleanup task/<id> |
 *        resync task/<id> | task-start task/<id> | adopt-request task/<id> | adopt task/<id>
 * Exit 0 success, 1 refusal (fail closed), 3 usage error.
 *
 * Module API (for QA): runBriefRequest(opts), runProtectedRequest(opts), runProtectedCommit(opts),
 * runLandRequest(opts), runLand(opts), runPushRequest(opts), runPush(opts), runCleanup(opts),
 * runResync(opts), runTaskStart(opts), runAdoptRequest(opts), runAdopt(opts),
 * parseRecord(text, kind), parseLandScope(briefText), parseProtectedScope(briefText),
 * approvalLine(kind, payload, commonDir).
 * opts = { cwd, task?, path?, gitExec?, expectedOriginUrls?, now?, archiveRoot? }.
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
const BRIEF_RECORD_NAME = 'pt-brief-approval';
const PROTECTED_RECORD_NAME = 'pt-protected-approval';
const ADOPT_RECORD_NAME = 'pt-adopt-approval';
const TASK_DIR_NAME = 'pt-task';
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const LOCK_NAME = 'pt-land.lock';
const AUDIT_NAME = 'pt-land-log';
const LAND_EVIDENCE_RE = /^LAND-EVIDENCE: qa-offline=PASS \d+; targeted=PASS; codex-classI-unresolved=0$/;
const LAND_SCOPE_BEGIN = '<!-- land-scope:begin -->';
const LAND_SCOPE_END = '<!-- land-scope:end -->';
const PROTECTED_SCOPE_BEGIN = '<!-- protected-scope:begin -->';
const PROTECTED_SCOPE_END = '<!-- protected-scope:end -->';
const TASK_RE = /^task\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const OID_RE = /^[0-9a-f]{40}$/;
const BRIEF_PATH_RE = /^work\/[a-z0-9][a-z0-9._-]*\/brief\.md$/;
const R10_PROTECTED_CONFIG_RE = /^(?:core\.hookspath|core\.fsmonitor|include\.path|includeif\..*\.path)$/i;
// G1 "no GIT_* overrides" = R11's own pair (pretooluse-guard.js GIT_ENV_OVERRIDE_RE + R10_GIT_CONFIG_ENV_RE):
// a harmless GIT_EDITOR / GIT_PAGER in the session is not an override and must not refuse.
const GIT_ENV_OVERRIDE_RE = /^GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES)$/;
const R10_GIT_CONFIG_ENV_RE = /^GIT_CONFIG_/i;
// G2 brief §2 "Allowed targets": a candidate target must match one of these AND be listed in the
// brief's protected-scope block (checked separately - this list alone is necessary, not sufficient).
const PROTECTED_TARGET_RES = [
  /^\.claude\/hooks\//,
  /^\.claude\/settings\.json$/,
  /^\.claude\/rules\//,
  /^agents\.md$/,
  /^claude\.md$/,
  /^\.gitignore$/,
  /^qa\/run-offline\.js$/,
  /^netlify\.toml$/,
  /^package\.json$/,
  /^package-lock\.json$/
];
// G2 brief §2 "Never approvable": checked before PROTECTED_TARGET_RES, always wins.
const PROTECTED_NEVER_RES = [
  /^work\/[^/]+\/brief\.md$/,
  /^checkpoint\.md$/,
  /^\.env/,
  /^\.claude\/settings\.local\.json$/,
  /^\.git(?:\/|$)/
];

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
  if (kind === 'PROTECTED') {
    const [verb, task, head, tree] = parts;
    if (verb !== 'PROTECTED') return null;
    if (!TASK_RE.test(task)) return null;
    if (!OID_RE.test(head) || !OID_RE.test(tree)) return null;
    return { kind: 'PROTECTED', task, head, tree };
  }
  if (kind === 'ADOPT') {
    const [verb, task, base, startedAt] = parts;
    if (verb !== 'ADOPT') return null;
    if (!TASK_RE.test(task)) return null;
    if (!OID_RE.test(base)) return null;
    if (!ISO_RE.test(startedAt)) return null;
    return { kind: 'ADOPT', task, base, startedAt };
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

function parseProtectedScope(text) {
  if (typeof text !== 'string') return null;
  const beginCount = text.split(PROTECTED_SCOPE_BEGIN).length - 1;
  const endCount = text.split(PROTECTED_SCOPE_END).length - 1;
  if (beginCount !== 1 || endCount !== 1) return null;
  const bi = text.indexOf(PROTECTED_SCOPE_BEGIN);
  const ei = text.indexOf(PROTECTED_SCOPE_END);
  if (bi === -1 || ei === -1 || ei < bi) return null;
  const body = text.slice(bi + PROTECTED_SCOPE_BEGIN.length, ei);
  const paths = body.split(/\r\n|\r|\n/)
    .map((l) => l.replace(/^\s*[-*]\s*/, '').replace(/`/g, '').trim())
    .filter(Boolean);
  if (paths.length === 0) return null;
  return { paths };
}

// ── shape rule (brief §2 "Shape rule"): every approval line in exactly one shape/function. ──
function approvalLine(kind, payload, commonDir) {
  if (typeof payload !== 'string' || /['\r\n;$`]/.test(payload)) {
    throw new Error('approvalLine: unsafe payload for kind ' + kind);
  }
  return "! printf '%s\\n' '" + payload + "' > '" + toForwardSlash(commonDir) + '/pt-' + kind + "-approval'";
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

// ── config/hooks cleanliness (G1/G2; mirrors R11's protectedConfigState/hooksState in
// pretooluse-guard.js - that module exports neither, so this tool re-implements the equivalent
// read-only predicate here rather than reaching into hook internals). ──────────────────────────
function configClean(G, canonicalRoot) {
  const r = G(['config', '--null', '--list'], canonicalRoot, { read: true });
  if (r.status !== 0) return { ok: false, reason: 'git config integrity could not be verified' };
  for (const rec of String(r.stdout).split('\0')) {
    if (!rec) continue;
    const nl = rec.indexOf('\n');
    const key = (nl === -1 ? rec : rec.slice(0, nl)).trim();
    const value = nl === -1 ? '' : rec.slice(nl + 1).trim();
    if (/^core\.fsmonitor$/i.test(key)) {
      if (!/^(?:true|false|yes|no|on|off|0|1)$/i.test(value)) return { ok: false, reason: 'protected git config is active (' + key + ')' };
    } else if (R10_PROTECTED_CONFIG_RE.test(key)) {
      return { ok: false, reason: 'protected git config is active (' + key + ')' };
    }
  }
  return { ok: true };
}
function hooksClean(commonDir) {
  const dir = path.join(commonDir, 'hooks');
  if (!fs.existsSync(dir)) return { ok: true };
  const bad = fs.readdirSync(dir).filter((name) => !/\.sample$/i.test(name));
  if (bad.length) return { ok: false, reason: 'non-sample git hooks are installed (' + bad.join(', ') + ')' };
  return { ok: true };
}
function catFileBlobBuffer(gitExec, cwd, spec) {
  const r = spawnSync(gitExec || 'git', ['cat-file', 'blob', spec],
    { cwd, env: stripGitEnv(), encoding: 'buffer', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0 || !Buffer.isBuffer(r.stdout)) return null;
  return r.stdout;
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

// G3 (brief §2 "land (L8 revision)"): the audit log is the record of 'ok' protected-commit
// entries. Malformed lines are skipped rather than thrown on - the audit log is append-only and
// best-effort (see bestEffortAudit), so L8 must stay robust to a partial/odd line.
function readAuditEntries(commonDir) {
  const p = path.join(commonDir, AUDIT_NAME);
  if (!fs.existsSync(p)) return [];
  let text;
  try { text = fs.readFileSync(p, 'utf8'); } catch (e) { return []; }
  const entries = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { entries.push(JSON.parse(line)); } catch (e) { /* skip malformed line */ }
  }
  return entries;
}
// Finds an 'ok' protected-commit entry for this task whose `to` commit is an ancestor of tip and
// whose `to^{tree}` still equals the entry's recorded tree (a rewritten/rebased `to` fails this),
// then resolves targetPath's blob inside that approved tree. Most-recent-first: a later approval
// for the same task supersedes an earlier one.
function protectedApproval(G, canonicalRoot, commonDir, task, tip, targetPath) {
  const entries = readAuditEntries(commonDir).filter((e) => e && e.verb === 'protected-commit' &&
    e.task === task && e.result === 'ok' && typeof e.to === 'string' && typeof e.tree === 'string');
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i];
    const anc = G(['merge-base', '--is-ancestor', e.to, tip], canonicalRoot, { read: true });
    if (anc.status !== 0) continue;
    const toTreeR = G(['rev-parse', '-q', '--verify', e.to + '^{tree}'], canonicalRoot, { read: true });
    if (toTreeR.status !== 0 || String(toTreeR.stdout).trim() !== e.tree) continue;
    const blobInTreeR = G(['rev-parse', '-q', '--verify', e.tree + ':' + targetPath], canonicalRoot, { read: true });
    if (blobInTreeR.status !== 0) continue;
    return { ok: true, blob: String(blobInTreeR.stdout).trim(), tree: e.tree };
  }
  return { ok: false };
}
const PROTECTED_NEVER_LAND_RE = /^work\/[^/]+\/brief\.md$|^checkpoint\.md$|^\.env/;

function diffCheck(G, canonicalRoot, commonDir, task, base, tip, scopePaths, protectedScopePaths, reviewPath) {
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
  // brief §2 G3: land-request lists every protected path with its blob and the approving tree.
  const protectedFiles = [];
  for (const f of files) {
    const lower = f.toLowerCase();
    if (!PROTECTED_PATH_RES.some((re) => re.test(lower))) continue;
    if (PROTECTED_NEVER_LAND_RE.test(lower)) return { ok: false, reason: 'protected path: Owner LAND (' + f + ')' };
    const inScope = Array.isArray(protectedScopePaths) && protectedScopePaths.indexOf(f) !== -1 && scopePaths.indexOf(f) !== -1;
    if (!inScope) return { ok: false, reason: 'protected path not PROTECTED-approved: Owner LAND (' + f + ')' };
    const approval = protectedApproval(G, canonicalRoot, commonDir, task, tip, f);
    if (!approval.ok) return { ok: false, reason: 'protected path not PROTECTED-approved: Owner LAND (' + f + ')' };
    const tipBlobR = G(['rev-parse', '-q', '--verify', tip + ':' + f], canonicalRoot, { read: true });
    if (tipBlobR.status !== 0 || String(tipBlobR.stdout).trim() !== approval.blob) {
      return { ok: false, reason: 'protected path not PROTECTED-approved: Owner LAND (' + f + ', changed after approval)' };
    }
    protectedFiles.push({ path: f, blob: approval.blob, tree: approval.tree });
  }
  return { ok: true, files, protectedFiles };
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
  return approvalLine('land', 'LAND ' + task + ' ' + tip + ' ' + base, commonDir);
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

  // A recorded task must be current: the record's base is the branch-dev the task sits on (Second LAND keeps it so).
  const recL = readTaskRecord(canonicalRoot, commonDir, task);
  if (recL.exists) {
    if (!recL.valid) return refuse('L3', 'RECORD INVALID: ' + recL.reason, l3.base, l3.tip);
    if (recL.record.base !== l3.base) {
      return refuse('L3', 'RECORD MISMATCH: recorded task base ' + recL.record.base + ' != branch-dev ' + l3.base + ' - resync through pt-land.js resync', l3.base, l3.tip);
    }
  }

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
  const protectedScope = parseProtectedScope(String(briefTextR.stdout));
  const l8 = diffCheck(G, canonicalRoot, commonDir, task, l3.base, l3.tip, scope.paths,
    protectedScope ? protectedScope.paths : [], reviewPath);
  if (!l8.ok) return refuse('L8', l8.reason, l3.base, l3.tip);

  const l9 = landEvidenceCheck(G, canonicalRoot, l3.tip, reviewPath);
  if (!l9.ok) return refuse('L9', l9.reason, l3.base, l3.tip);

  let integrity;
  try { integrity = loadIntegrityModule(canonicalRoot); }
  catch (e) { return refuse('L10', 'could not load the integrity module (' + e.message + ')', l3.base, l3.tip); }
  const mainOid = currentMainOid(G, canonicalRoot);
  const ires = integrity.runIntegrity({ baseMain: mainOid, baseDev: l3.base, task, root: canonicalRoot, commonDir, gitExec: opts.gitExec });
  if (!ires.ok) return refuse('L10', 'integrity FAIL: ' + ires.failures.join('; '), l3.base, l3.tip);

  const report = {
    task, tip: l3.tip, base: l3.base, commitCount: l3.count, files: l8.files, protectedFiles: l8.protectedFiles,
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
  return approvalLine('push', 'PUSH branch-dev ' + L + ' ' + R, commonDir);
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

// ── G1: brief-request (work/owner-one-action-gates/brief.md §2) ─────────────────────────────
// Read-only; canonical checkout only; re-implements R11's own predicate set (pretooluse-guard.js
// exports neither protectedConfigState nor hooksState, and the hook itself is out of scope here -
// §3 "Nothing else changes" - so the equivalent check is written once more, read-only, in this
// tool). Writes nothing; prints the line the Owner types with `!`.
function runBriefRequestCore(opts) {
  const briefPath = opts.path;
  if (typeof briefPath !== 'string' || !BRIEF_PATH_RE.test(briefPath)) {
    return { ok: false, exitCode: 3, reason: 'usage: pt-land.js brief-request work/<id>/brief.md' };
  }
  const G = makeGitRunner(opts.gitExec);
  const caller = resolveCaller(G, opts.cwd, null);
  if (!caller.ok) return { ok: false, exitCode: 1, reason: 'G1: ' + caller.reason };
  if (caller.kind !== 'canonical') return { ok: false, exitCode: 1, reason: 'G1: brief-request runs only from the canonical checkout' };
  const canonicalRoot = caller.canonicalRoot;
  const commonDir = path.join(canonicalRoot, '.git');

  const envBad = Object.keys(process.env).find((k) => GIT_ENV_OVERRIDE_RE.test(k) || R10_GIT_CONFIG_ENV_RE.test(k));
  if (envBad !== undefined) return { ok: false, exitCode: 1, reason: 'G1: the session environment sets ' + envBad };

  const head = headRef(G, canonicalRoot);
  if (head !== 'refs/heads/branch-dev') return { ok: false, exitCode: 1, reason: 'G1: HEAD is not branch-dev' };

  const st = G(['status', '--porcelain=v2', '--untracked-files=all'], canonicalRoot, { read: true });
  if (st.status !== 0) return { ok: false, exitCode: 1, reason: 'G1: the canonical status could not be read' };
  const lines = String(st.stdout).split('\n').filter(Boolean);
  if (lines.length !== 1) return { ok: false, exitCode: 1, reason: 'G1: the staged/working set is not exactly one entry' };
  const fields = lines[0].split(' ');
  if (fields[0] !== '1' || (fields[1] !== 'A.' && fields[1] !== 'M.') || fields[2] !== 'N...') {
    return { ok: false, exitCode: 1, reason: 'G1: the single entry is not a plain added/modified file (A./M., no submodule)' };
  }
  const entryPath = fields.slice(8).join(' ');
  if (entryPath !== briefPath) return { ok: false, exitCode: 1, reason: 'G1: the staged entry does not match the requested path' };

  const cfg = configClean(G, canonicalRoot);
  if (!cfg.ok) return { ok: false, exitCode: 1, reason: 'G1: ' + cfg.reason };
  const hooks = hooksClean(commonDir);
  if (!hooks.ok) return { ok: false, exitCode: 1, reason: 'G1: ' + hooks.reason };

  const devOid = G(['rev-parse', 'refs/heads/branch-dev'], canonicalRoot, { read: true });
  if (devOid.status !== 0) return { ok: false, exitCode: 1, reason: 'G1: could not resolve the branch-dev OID' };
  const oid = String(devOid.stdout).trim();

  const buf = catFileBlobBuffer(opts.gitExec, canonicalRoot, ':' + briefPath);
  if (!buf) return { ok: false, exitCode: 1, reason: 'G1: could not read the staged blob' };
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

  const line = approvalLine('brief', sha256 + ' ' + briefPath + ' ' + oid, commonDir);
  return { ok: true, exitCode: 0, verb: 'brief-request', path: briefPath, oid, sha256, approvalLine: line };
}
function runBriefRequest(opts) { return safeRun(() => runBriefRequestCore(opts)); }

// ── G2: protected-request / protected-commit (work/owner-one-action-gates/brief.md §2) ──────
function targetApprovable(target, scopePaths) {
  const lower = target.toLowerCase();
  if (PROTECTED_NEVER_RES.some((re) => re.test(lower))) return false;
  if (!PROTECTED_TARGET_RES.some((re) => re.test(lower))) return false;
  return Array.isArray(scopePaths) && scopePaths.indexOf(target) !== -1;
}
// Manifest: <os.tmpdir()>/pt-<id>/protected/manifest.json, {"files":[{"target":"...","source":"flat-name"}]}.
// Flat source names only (no '/', no leading '.', not absolute) - keeps every candidate path out
// of .claude/... so R10's protected-write rules still apply to this Worker's own writes while
// building it (brief §2 "Flat source names keep candidate paths free of .claude/...").
function loadManifest(idPart) {
  const dir = path.join(os.tmpdir(), 'pt-' + idPart, 'protected');
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return { ok: false, reason: 'manifest.json not found at ' + manifestPath };
  let raw;
  try { raw = fs.readFileSync(manifestPath, 'utf8'); } catch (e) { return { ok: false, reason: 'manifest.json could not be read' }; }
  let data;
  try { data = JSON.parse(raw); } catch (e) { return { ok: false, reason: 'manifest.json is not valid JSON' }; }
  if (!data || !Array.isArray(data.files) || data.files.length === 0) return { ok: false, reason: 'manifest.json has no files' };
  const seenTargets = new Set();
  const files = [];
  for (const f of data.files) {
    if (!f || typeof f.target !== 'string' || typeof f.source !== 'string' || !f.target || !f.source) {
      return { ok: false, reason: 'manifest.json has a malformed entry' };
    }
    if (path.isAbsolute(f.source) || /[\\/]/.test(f.source) || f.source === '.' || f.source === '..') {
      return { ok: false, reason: 'manifest source is not a flat file name (' + f.source + ')' };
    }
    const target = toForwardSlash(f.target).replace(/^\.\//, '');
    if (path.isAbsolute(f.target) || target.startsWith('/') ||
      target.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) {
      return { ok: false, reason: 'manifest target is not a safe relative path (' + f.target + ')' };
    }
    if (seenTargets.has(target)) return { ok: false, reason: 'duplicate manifest target (' + target + ')' };
    seenTargets.add(target);
    const srcAbs = path.join(dir, f.source);
    if (!fs.existsSync(srcAbs)) return { ok: false, reason: 'manifest source does not exist (' + f.source + ')' };
    files.push({ target, srcAbs });
  }
  return { ok: true, dir, files };
}
// Builds the would-be tree in a temporary index file under os.tmpdir() - GIT_INDEX_FILE is set
// only for this function's own child processes (stripGitEnv's `extra` arg), never on
// process.env, so it can never leak into any other call in this process. The only side effect is
// unreferenced objects written by hash-object -w (brief's one stated allowed exception).
function buildCandidateTree(gitExec, canonicalRoot, headOid, files) {
  const idxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-protected-idx-'));
  const tmpIndex = path.join(idxDir, 'index');
  const run = (args) => spawnSync(gitExec || 'git', args, {
    cwd: canonicalRoot, env: stripGitEnv({ GIT_INDEX_FILE: tmpIndex }), encoding: 'utf8',
    windowsHide: true, maxBuffer: 32 * 1024 * 1024
  });
  try {
    const rt = run(['read-tree', headOid]);
    if (rt.status !== 0) return { ok: false, reason: 'read-tree failed: ' + String(rt.stderr || '').trim() };
    const perFile = [];
    for (const f of files) {
      const hashR = run(['hash-object', '-w', '--path=' + f.target, '--', f.srcAbs]);
      if (hashR.status !== 0) return { ok: false, reason: 'hash-object failed for ' + f.target + ': ' + String(hashR.stderr || '').trim() };
      const blobOid = String(hashR.stdout).trim();
      let mode = '100644';
      const lsR = run(['ls-tree', headOid, '--', f.target]);
      if (lsR.status === 0 && String(lsR.stdout).trim()) {
        const m = /^(\d+)\s/.exec(String(lsR.stdout));
        if (m) mode = m[1];
      }
      const ciR = run(['update-index', '--add', '--cacheinfo', mode + ',' + blobOid + ',' + f.target]);
      if (ciR.status !== 0) return { ok: false, reason: 'update-index failed for ' + f.target + ': ' + String(ciR.stderr || '').trim() };
      const sha256 = crypto.createHash('sha256').update(fs.readFileSync(f.srcAbs)).digest('hex');
      perFile.push({ target: f.target, blobOid, sha256 });
    }
    const wt = run(['write-tree']);
    if (wt.status !== 0) return { ok: false, reason: 'write-tree failed: ' + String(wt.stderr || '').trim() };
    return { ok: true, tree: String(wt.stdout).trim(), perFile };
  } finally {
    try { fs.rmSync(idxDir, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  }
}
// Shared preconditions for protected-request and protected-commit (brief §2 bullet list).
function protectedPreconditions(G, opts) {
  const task = opts.task;
  if (typeof task !== 'string' || !TASK_RE.test(task)) {
    return { ok: false, exitCode: 3, reason: 'usage: pt-land.js protected-request|protected-commit task/<id>' };
  }
  const caller = resolveCaller(G, opts.cwd, task);
  if (!caller.ok) return { ok: false, exitCode: 1, reason: 'G2: ' + caller.reason };
  if (caller.kind !== 'slot') return { ok: false, exitCode: 1, reason: 'G2: protected-request/protected-commit runs only from a Worker slot' };
  const canonicalRoot = caller.canonicalRoot;
  const slotRoot = caller.slotRoot;
  const commonDir = path.join(canonicalRoot, '.git');

  const si = selfIntegrity(G, canonicalRoot);
  if (!si.ok) return { ok: false, exitCode: 1, reason: 'G2: ' + si.reason };

  const st = G(['status', '--porcelain=v2', '--untracked-files=all'], slotRoot, { read: true });
  if (st.status !== 0) return { ok: false, exitCode: 1, reason: 'G2: the slot status could not be read' };
  if (String(st.stdout).trim()) return { ok: false, exitCode: 1, reason: 'G2: the slot is not clean' };

  const headR = G(['rev-parse', 'HEAD'], slotRoot, { read: true });
  if (headR.status !== 0) return { ok: false, exitCode: 1, reason: 'G2: could not resolve the slot HEAD' };
  const headOid = String(headR.stdout).trim();

  const idPart = task.replace(/^task\//, '');
  const briefPath = 'work/' + idPart + '/brief.md';
  const baseR = G(['merge-base', 'refs/heads/branch-dev', headOid], canonicalRoot, { read: true });
  if (baseR.status !== 0) return { ok: false, exitCode: 1, reason: 'G2: could not resolve the task base' };
  const base = String(baseR.stdout).trim();
  const baseBlob = G(['rev-parse', '-q', '--verify', base + ':' + briefPath], canonicalRoot, { read: true });
  if (baseBlob.status !== 0) return { ok: false, exitCode: 1, reason: 'G2: work/<id>/brief.md is missing at the base' };
  const tipBlob = G(['rev-parse', '-q', '--verify', headOid + ':' + briefPath], canonicalRoot, { read: true });
  if (tipBlob.status !== 0) return { ok: false, exitCode: 1, reason: 'G2: work/<id>/brief.md is missing at the slot HEAD' };
  if (String(baseBlob.stdout).trim() !== String(tipBlob.stdout).trim()) {
    return { ok: false, exitCode: 1, reason: 'G2: work/<id>/brief.md was edited by the task' };
  }

  const briefTextR = G(['show', headOid + ':' + briefPath], canonicalRoot, { read: true });
  if (briefTextR.status !== 0) return { ok: false, exitCode: 1, reason: 'G2: could not read work/<id>/brief.md' };
  const scope = parseProtectedScope(String(briefTextR.stdout));
  if (!scope) return { ok: false, exitCode: 1, reason: 'G2: no protected-scope block in work/<id>/brief.md' };

  const manifest = loadManifest(idPart);
  if (!manifest.ok) return { ok: false, exitCode: 1, reason: 'G2: ' + manifest.reason };

  for (const f of manifest.files) {
    if (!targetApprovable(f.target, scope.paths)) {
      return { ok: false, exitCode: 1, reason: 'G2: target not approvable (' + f.target + ')' };
    }
  }

  return { ok: true, task, idPart, canonicalRoot, slotRoot, commonDir, headOid, briefPath, scope, manifest };
}

function runProtectedRequestCore(opts) {
  const G = makeGitRunner(opts.gitExec);
  const pre = protectedPreconditions(G, opts);
  if (!pre.ok) return pre;

  const built = buildCandidateTree(opts.gitExec, pre.canonicalRoot, pre.headOid, pre.manifest.files);
  if (!built.ok) return { ok: false, exitCode: 1, reason: 'G2: ' + built.reason };

  const line = approvalLine('protected', 'PROTECTED ' + pre.task + ' ' + pre.headOid + ' ' + built.tree, pre.commonDir);
  return {
    ok: true, exitCode: 0, verb: 'protected-request', task: pre.task, head: pre.headOid, tree: built.tree,
    files: built.perFile, approvalLine: line
  };
}
function runProtectedRequest(opts) { return safeRun(() => runProtectedRequestCore(opts)); }

function runProtectedCommitCore(opts) {
  const G = makeGitRunner(opts.gitExec);
  const pre = protectedPreconditions(G, opts);
  if (!pre.ok) return pre;

  function refuse(reason) {
    bestEffortAudit(pre.commonDir, { ts: nowIso(opts), verb: 'protected-commit', task: pre.task, from: pre.headOid, to: null, result: 'refuse', reason });
    return { ok: false, exitCode: 1, reason: 'G2: ' + reason };
  }

  const record = parseRecord(readRecordFile(pre.commonDir, PROTECTED_RECORD_NAME), 'PROTECTED');
  if (!record || record.task !== pre.task || record.head !== pre.headOid) {
    return refuse('no/stale PROTECTED approval');
  }

  const lock = acquireLock(pre.commonDir);
  if (!lock.ok) return refuse(lock.reason);
  try {
    const stB = G(['status', '--porcelain=v2', '--untracked-files=all'], pre.slotRoot, { read: true });
    const headB = G(['rev-parse', 'HEAD'], pre.slotRoot, { read: true });
    if (stB.status !== 0 || String(stB.stdout).trim() || headB.status !== 0 || String(headB.stdout).trim() !== pre.headOid) {
      return refuse('the repository state changed since preflight (race)');
    }

    const built = buildCandidateTree(opts.gitExec, pre.canonicalRoot, pre.headOid, pre.manifest.files);
    if (!built.ok) return refuse(built.reason);
    if (built.tree !== record.tree) return refuse('the candidate tree no longer matches the approved tree');

    const targets = pre.manifest.files.map((f) => f.target);
    // Brief §9: the slot's live index is never the source of the committed tree. Hooks are
    // suppressed for the mutating children through the GIT_CONFIG_* triple (git's own carrier for
    // `-c`), set only on these child processes like GIT_INDEX_FILE on the request-side build - the
    // argv then starts with the subcommand, which the QA git shim relies on.
    const hooksDir = emptyHooksDir();
    const noHooksEnv = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: toForwardSlash(hooksDir) };
    const slotGit = (args) => spawnSync(opts.gitExec || 'git', args,
      { cwd: pre.slotRoot, env: stripGitEnv(noHooksEnv), encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });

    // 3. The commit object is created from the approved tree OID directly (no path copied, nothing staged).
    const commitMsg = 'chore(protected): apply Owner-approved files (' + pre.task + ', tree ' + record.tree.slice(0, 12) + ')';
    const ctR = slotGit(['commit-tree', record.tree, '-p', pre.headOid, '-m', commitMsg]);
    const newHead = ctR.status === 0 ? String(ctR.stdout).trim() : '';
    if (ctR.status !== 0 || !OID_RE.test(newHead)) {
      return refuse('git commit-tree failed: ' + String(ctR.stderr || '').trim());
    }

    // 4. Compare-and-swap: the task ref moves only if it still equals the recorded HEAD.
    const urR = slotGit(['update-ref', 'refs/heads/' + pre.task, newHead, pre.headOid]);
    if (urR.status !== 0) {
      return refuse('the task ref moved since the approval (compare-and-swap): ' + String(urR.stderr || '').trim());
    }

    // 5. Index and working tree for exactly the approved targets, from the committed tree.
    const coR = slotGit(['checkout', 'HEAD', '--'].concat(targets));
    if (coR.status !== 0) {
      bestEffortAudit(pre.commonDir, { ts: nowIso(opts), verb: 'protected-commit', task: pre.task, from: pre.headOid, to: newHead, result: 'fail', reason: 'G2: checkout of the approved targets failed after the ref move' });
      return { ok: false, exitCode: 1, reason: 'G2: the commit ' + newHead + ' exists and the task ref moved, but checkout of the approved targets failed (' + String(coR.stderr || '').trim() + ') - STOP (the tool never undoes a commit or a ref move)' };
    }

    // 6. Verify tree, parent, every target's index blob and a clean slot.
    const newHeadR = G(['rev-parse', 'HEAD'], pre.slotRoot, { read: true });
    const newTreeR = G(['rev-parse', 'HEAD^{tree}'], pre.slotRoot, { read: true });
    const parentR = G(['rev-parse', 'HEAD^'], pre.slotRoot, { read: true });
    const stAfter = G(['status', '--porcelain=v2', '--untracked-files=all'], pre.slotRoot, { read: true });
    let blobsOk = true;
    for (const t of targets) {
      const idx = G(['rev-parse', '-q', '--verify', ':' + t], pre.slotRoot, { read: true });
      const inTree = G(['rev-parse', '-q', '--verify', record.tree + ':' + t], pre.slotRoot, { read: true });
      if (idx.status !== 0 || inTree.status !== 0 || String(idx.stdout).trim() !== String(inTree.stdout).trim()) { blobsOk = false; break; }
    }
    const okAfter = newHeadR.status === 0 && String(newHeadR.stdout).trim() === newHead &&
      newTreeR.status === 0 && String(newTreeR.stdout).trim() === record.tree &&
      parentR.status === 0 && String(parentR.stdout).trim() === pre.headOid &&
      stAfter.status === 0 && !String(stAfter.stdout).trim() && blobsOk;
    if (!okAfter) {
      bestEffortAudit(pre.commonDir, { ts: nowIso(opts), verb: 'protected-commit', task: pre.task, from: pre.headOid, to: newHead, result: 'fail', reason: 'G2: protected-commit verification failed' });
      return { ok: false, exitCode: 1, reason: 'G2: protected-commit verification failed - STOP (the tool never undoes a commit or a ref move)' };
    }

    // The ok audit entry IS the approval that land (L8) and guard_integrity_check (C6) later verify
    // against - unlike the informational land/push/cleanup audit lines it is load-bearing, so a
    // failed append is a failure, not a warning: the commit exists and is verified, but the task
    // cannot LAND through the governed path. The record is consumed only once the entry is recorded.
    try {
      appendAudit(pre.commonDir, { ts: nowIso(opts), verb: 'protected-commit', task: pre.task, from: pre.headOid, to: newHead, tree: record.tree, result: 'ok' });
    } catch (e) {
      return {
        ok: false, exitCode: 1,
        reason: 'G2: protected-commit made and verified (' + pre.headOid + '..' + newHead + ', tree ' + record.tree +
          ') but the approval audit entry could not be recorded (' + (e && e.message ? e.message : String(e)) +
          ') - STOP: without the ok entry the task falls back to an Owner LAND'
      };
    }
    try { fs.unlinkSync(path.join(pre.commonDir, PROTECTED_RECORD_NAME)); } catch (e) { /* already gone */ }
    return {
      ok: true, exitCode: 0, verb: 'protected-commit',
      message: 'PROTECTED-COMMITTED ' + pre.task + ' ' + pre.headOid + '..' + newHead + ' tree ' + record.tree
    };
  } finally {
    releaseLock(lock.path);
  }
}
function runProtectedCommit(opts) { return safeRun(() => runProtectedCommitCore(opts)); }

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

    // K10: a task-base record moves to pt-task/archive/ (a failed move is a warning; it never undoes the cleanup).
    let recordArchived = false;
    let recordWarning = null;
    const recPath = taskRecordPath(commonDir, task);
    if (fs.existsSync(recPath)) {
      const archivedPath = path.join(commonDir, TASK_DIR_NAME, 'archive', taskEnc(task) + '.' + nowStamp(opts) + '.json');
      try {
        fs.mkdirSync(path.dirname(archivedPath), { recursive: true });
        fs.renameSync(recPath, archivedPath);
        recordArchived = true;
      } catch (e) {
        recordWarning = 'the task-base record could not be archived (' + (e && e.message ? e.message : String(e)) + ')';
      }
    }

    let auditWarning = null;
    try {
      const okLine = { ts: nowIso(opts), verb: 'cleanup', task, from: tip, to: null, result: 'ok', reason: null };
      if (recordArchived) okLine.recordArchived = true;
      appendAudit(commonDir, okLine);
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
    if (recordWarning) success.recordWarning = recordWarning;
    return success;
  } finally {
    releaseLock(lock.path);
  }
}
function runCleanup(opts) { return safeRun(() => runCleanupCore(opts)); }

// ── RESYNC (work/second-finisher-resync/brief.md §2) ───────────────────────────────────────
// Bootstrap brings a task/* branch up to date with branch-dev through this one verb. Mechanical
// only (R-3): any conflict, overlap or content difference refuses with nothing changed. It changes
// only the task branch and its slot: branch-dev, main and origin/* are never moved, nothing is
// pushed, no approval record is written and no file is deleted in the slot. The LAND line that
// follows (bound to the new tip, after fresh QA) stays the Owner's gate (R-2). Raw rebase / merge /
// pull stay denied everywhere (R3m): every git call below runs inside this process, never through
// the command hook.
const RESYNC_BUSY_MARKERS = ['rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD'];

function sha256OfBuffer(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function firstLine(s) { return String(s || '').trim().split('\n')[0].trim(); }

// Hooks are suppressed on the slot-side mutating children through git's own `-c` carrier, the
// GIT_CONFIG_* triple (as protected-commit does), so the argv still starts with the subcommand.
function noHooksEnv(hooksDir) {
  return { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: toForwardSlash(hooksDir) };
}

// F2 / R5: the slot only ever moves with `reset --keep`; git itself refuses when an uncommitted file
// differs between the old and the new base, and nothing is changed in that case.
function keepReset(slotGit, oid) { return slotGit(['reset', '--keep', oid]); }

// F1 / F3: sha256 of `git diff HEAD --binary` plus the sha256 of every untracked, non-ignored file.
function uncommittedSnapshot(gitExec, slotRoot) {
  const run = (args, maxBuffer) => spawnSync(gitExec || 'git', args,
    { cwd: slotRoot, env: stripGitEnv({ GIT_OPTIONAL_LOCKS: '0' }), encoding: 'buffer', windowsHide: true, maxBuffer });
  const diffR = run(['diff', 'HEAD', '--binary'], 256 * 1024 * 1024);
  if (diffR.status !== 0 || !Buffer.isBuffer(diffR.stdout)) return { ok: false, reason: 'git diff HEAD --binary failed in the slot' };
  const lsR = run(['ls-files', '--others', '--exclude-standard', '-z'], 64 * 1024 * 1024);
  if (lsR.status !== 0 || !Buffer.isBuffer(lsR.stdout)) return { ok: false, reason: 'git ls-files --others failed in the slot' };
  const untracked = [];
  for (const rel of lsR.stdout.toString('utf8').split('\0').filter(Boolean).sort()) {
    try { untracked.push(rel + ' ' + sha256OfBuffer(fs.readFileSync(path.join(slotRoot, rel)))); }
    catch (e) { return { ok: false, reason: 'could not hash the untracked file ' + rel }; }
  }
  return { ok: true, diffSha: sha256OfBuffer(diffR.stdout), untracked };
}
function stagedPaths(G, slotRoot) {
  const r = G(['diff', '--cached', '--name-only', '-z'], slotRoot, { read: true });
  return r.status === 0 ? String(r.stdout).split('\0').filter(Boolean).sort() : [];
}

// R4: the replay must be the same change set, commit for commit.
function patchIdOfCommit(gitExec, cwd, oid) {
  const dt = spawnSync(gitExec || 'git', ['diff-tree', '-p', '--no-commit-id', oid],
    { cwd, env: stripGitEnv({ GIT_OPTIONAL_LOCKS: '0' }), encoding: 'buffer', windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  if (dt.status !== 0 || !Buffer.isBuffer(dt.stdout)) return null;
  const pid = spawnSync(gitExec || 'git', ['patch-id', '--stable'],
    { cwd, env: stripGitEnv({ GIT_OPTIONAL_LOCKS: '0' }), input: dt.stdout, encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 });
  if (pid.status !== 0) return null;
  return String(pid.stdout).trim().split(' ')[0];
}
function verifyReplay(gitExec, G, canonicalRoot, briefPath, mb, tip, dev, newTip) {
  const commitsOf = (range) => {
    const r = G(['rev-list', '--reverse', range], canonicalRoot, { read: true });
    return r.status === 0 ? String(r.stdout).split('\n').map((s) => s.trim()).filter(Boolean) : null;
  };
  const oldCommits = commitsOf(mb + '..' + tip);
  const newCommits = commitsOf(dev + '..' + newTip);
  if (!oldCommits || !newCommits) return { ok: false, reason: 'could not list the commits to compare' };
  if (oldCommits.length !== newCommits.length) {
    return { ok: false, reason: 'the replay changed the commit count (' + oldCommits.length + ' -> ' + newCommits.length + ')' };
  }
  const anc = G(['merge-base', '--is-ancestor', dev, newTip], canonicalRoot, { read: true });
  if (anc.status !== 0) return { ok: false, reason: 'the replayed tip does not descend from branch-dev' };
  const merges = G(['rev-list', '--merges', dev + '..' + newTip], canonicalRoot, { read: true });
  if (merges.status !== 0 || String(merges.stdout).trim()) return { ok: false, reason: 'the replay contains a merge commit' };
  for (let i = 0; i < oldCommits.length; i += 1) {
    const a = patchIdOfCommit(gitExec, canonicalRoot, oldCommits[i]);
    const b = patchIdOfCommit(gitExec, canonicalRoot, newCommits[i]);
    if (a === null || b === null || a !== b) return { ok: false, reason: 'the patch-id of commit ' + (i + 1) + ' of ' + oldCommits.length + ' changed in the replay' };
  }
  const devBrief = G(['rev-parse', '-q', '--verify', dev + ':' + briefPath], canonicalRoot, { read: true });
  const newBrief = G(['rev-parse', '-q', '--verify', newTip + ':' + briefPath], canonicalRoot, { read: true });
  if (devBrief.status !== 0 || newBrief.status !== 0 || String(devBrief.stdout).trim() !== String(newBrief.stdout).trim()) {
    return { ok: false, reason: 'work/<id>/brief.md differs from branch-dev after the replay' };
  }
  const namesOf = (a, b) => {
    const r = G(['diff', '--name-only', '--no-renames', '-z', a, b], canonicalRoot, { read: true });
    return r.status === 0 ? String(r.stdout).split('\0').filter(Boolean).sort().join('\n') : null;
  };
  const before = namesOf(mb, tip);
  const after = namesOf(dev, newTip);
  if (before === null || after === null || before !== after) return { ok: false, reason: 'the set of changed files differs after the replay' };
  return { ok: true };
}

function removeTempWorktree(G, canonicalRoot, tmpParent, wt) {
  G(['worktree', 'remove', '--force', wt], canonicalRoot);
  G(['worktree', 'prune'], canonicalRoot);
  try { fs.rmSync(tmpParent, { recursive: true, force: true }); } catch (e) { /* verified by the caller */ }
}

function runResyncCore(opts) {
  const task = opts.task;
  if (typeof task !== 'string' || !TASK_RE.test(task)) {
    return { ok: false, exitCode: 3, reason: 'usage: pt-land.js resync task/<id>' };
  }
  const G = makeGitRunner(opts.gitExec);
  const caller = resolveCaller(G, opts.cwd, task);
  if (!caller.ok) return { ok: false, exitCode: 1, reason: 'S1: ' + caller.reason };
  const canonicalRoot = caller.canonicalRoot;
  const commonDir = path.join(canonicalRoot, '.git');
  const idPart = task.replace(/^task\//, '');
  const briefPath = 'work/' + idPart + '/brief.md';
  let mode = null;

  function refuse(step, reason, from, to, base) {
    bestEffortAudit(commonDir, { ts: nowIso(opts), verb: 'resync', task, mode, from: from || null, to: to || null, base: base || null, result: 'refuse', reason: step + ': ' + reason });
    return { ok: false, exitCode: 1, reason: step + ': ' + reason };
  }

  // S1: self-integrity (as L2/K2), no GIT_* overrides, git config and hooks clean.
  const si = selfIntegrity(G, canonicalRoot);
  if (!si.ok) return refuse('S1', si.reason);
  const envBad = Object.keys(process.env).find((k) => GIT_ENV_OVERRIDE_RE.test(k) || R10_GIT_CONFIG_ENV_RE.test(k));
  if (envBad !== undefined) return refuse('S1', 'the session environment sets ' + envBad);
  const cfg = configClean(G, canonicalRoot);
  if (!cfg.ok) return refuse('S1', cfg.reason);
  const hooks = hooksClean(commonDir);
  if (!hooks.ok) return refuse('S1', hooks.reason);
  const recState = readTaskRecord(canonicalRoot, commonDir, task);
  if (recState.exists && !recState.valid) return refuse('S1', 'RECORD INVALID: ' + recState.reason);

  // S2: the canonical checkout is on branch-dev and clean.
  const s2 = canonicalClean(G, canonicalRoot);
  if (!s2.ok) return refuse('S2', s2.reason, null, null, null);

  // S3: the task branch exists and is checked out in exactly one Worker slot with no rebase, merge
  // or cherry-pick in progress; the tool lock (the one `land` uses) is free.
  const tipR = G(['rev-parse', '--verify', '-q', 'refs/heads/' + task], canonicalRoot, { read: true });
  if (tipR.status !== 0) return refuse('S3', 'refs/heads/' + task + ' does not exist');
  const tip = String(tipR.stdout).trim();
  const devR = G(['rev-parse', '--verify', '-q', 'refs/heads/branch-dev'], canonicalRoot, { read: true });
  if (devR.status !== 0) return refuse('S3', 'refs/heads/branch-dev does not exist', tip);
  const dev = String(devR.stdout).trim();
  const trees = worktreeList(G, canonicalRoot);
  if (!trees) return refuse('S3', 'could not list worktrees', tip, null, dev);
  const homes = trees.filter((t) => t.branch === task);
  if (homes.length !== 1) return refuse('S3', 'the task branch is checked out in ' + homes.length + ' worktrees, not exactly one Worker slot', tip, null, dev);
  const slotRoot = homes[0].path;
  if (WORKER_SLOT_NAMES.indexOf(path.basename(toForwardSlash(slotRoot).replace(/\/+$/, ''))) === -1) {
    return refuse('S3', 'the task branch is not checked out in a Worker slot', tip, null, dev);
  }
  for (const name of RESYNC_BUSY_MARKERS) {
    const gp = G(['rev-parse', '--git-path', name], slotRoot, { read: true });
    if (gp.status !== 0) return refuse('S3', 'could not locate the slot git directory', tip, null, dev);
    if (fs.existsSync(path.resolve(slotRoot, String(gp.stdout).trim()))) {
      return refuse('S3', 'a ' + name + ' is in progress in the slot', tip, null, dev);
    }
  }
  const lock = acquireLock(commonDir);
  if (!lock.ok) return refuse('S3', lock.reason, tip, null, dev);
  const hooksDir = emptyHooksDir();
  try {
    const tipB = G(['rev-parse', '--verify', '-q', 'refs/heads/' + task], canonicalRoot, { read: true });
    const devB = G(['rev-parse', '--verify', '-q', 'refs/heads/branch-dev'], canonicalRoot, { read: true });
    if (tipB.status !== 0 || String(tipB.stdout).trim() !== tip || devB.status !== 0 || String(devB.stdout).trim() !== dev) {
      return refuse('S3', 'the repository state changed since preflight (race)', tip, null, dev);
    }

    // S4: the task's brief exists at branch-dev.
    const briefAtDev = G(['rev-parse', '-q', '--verify', dev + ':' + briefPath], canonicalRoot, { read: true });
    if (briefAtDev.status !== 0) return refuse('S4', 'work/<id>/brief.md is missing at branch-dev', tip, null, dev);

    // S5: nothing to do when branch-dev is already an ancestor of the task tip.
    const upToDate = G(['merge-base', '--is-ancestor', dev, tip], canonicalRoot, { read: true });
    if (upToDate.status !== 0 && upToDate.status !== 1) return refuse('S5', 'could not compare branch-dev with the task tip', tip, null, dev);
    if (upToDate.status === 0) return { ok: true, exitCode: 0, verb: 'resync', mode: 'none', task, from: tip, to: tip, base: dev, message: 'already up to date: ' + task + ' contains branch-dev ' + dev };

    const tipInDev = G(['merge-base', '--is-ancestor', tip, dev], canonicalRoot, { read: true });
    if (tipInDev.status !== 0 && tipInDev.status !== 1) return refuse('S5', 'could not compare the task tip with branch-dev', tip, null, dev);
    mode = tipInDev.status === 0 ? 'F' : 'R';

    const slotGit = (args) => spawnSync(opts.gitExec || 'git', args,
      { cwd: slotRoot, env: stripGitEnv(noHooksEnv(hooksDir)), encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });

    // Both modes end here: audit line, then the Worker's next steps with the exact integrity parameters.
    function finish(newTip, extra) {
      const resyncTime = nowIso(opts);
      let auditWarning = null;
      // A recorded task: the record's base becomes branch-dev (history +1) BEFORE the audit line, which carries the
      // record's sha256; a write failure after the slot moved stops here (LAND then refuses the stale record).
      let recordSha256 = null;
      if (recState.exists) {
        const newRecord = JSON.parse(JSON.stringify(recState.record));
        newRecord.base = dev;
        newRecord.history.push({ ts: resyncTime, verb: 'resync', mode, from: recState.record.base, to: dev });
        recordSha256 = sha256OfBuffer(Buffer.from(recordText(newRecord)));
        try { writeRecordAtomic(commonDir, task, newRecord); }
        catch (e) { return { ok: false, exitCode: 1, reason: 'R-REC: record update failed - STOP (Owner) (' + (e && e.message ? e.message : String(e)) + ')' }; }
      }
      try {
        // The no-record statement stays verbatim: the transcript recorder anchors its MUT-RS-12 / MUT-RS-13 mutants on it.
        if (recordSha256 === null) {
          appendAudit(commonDir, { ts: resyncTime, verb: 'resync', task, mode, from: tip, to: newTip, base: dev, result: 'ok', reason: null });
        } else {
          appendAudit(commonDir, { ts: resyncTime, verb: 'resync', task, mode, from: tip, to: newTip, base: dev, result: 'ok', reason: null, recordSha256 });
        }
      } catch (e) {
        auditWarning = 'audit log append failed: ' + (e && e.message ? e.message : String(e));
        if (recState.exists && sha256OfBuffer(Buffer.from(recordText(recState.record))) === recState.sha256) {
          try { writeRecordAtomic(commonDir, task, recState.record); } catch (e2) { /* the audit warning already tells the Owner */ }
        }
      }
      const res = {
        ok: true, exitCode: 0, verb: 'resync', mode, task, from: tip, to: newTip, base: dev, resyncTime,
        integrity: { baseMain: currentMainOid(G, canonicalRoot), baseDev: dev, task, since: resyncTime, root: canonicalRoot },
        stagedLost: extra && extra.stagedLost ? extra.stagedLost : [],
        message: 'RESYNCED ' + task + ' mode ' + mode + ' ' + tip + '..' + newTip + ' on branch-dev ' + dev
      };
      if (recState.exists) { res.record = true; res.integrity.record = true; }
      if (auditWarning) res.auditWarning = auditWarning;
      return res;
    }

    if (mode === 'F') {
      // F1: record the slot's uncommitted state.
      const snap = uncommittedSnapshot(opts.gitExec, slotRoot);
      if (!snap.ok) return refuse('F1', snap.reason, tip, null, dev);
      const stagedBefore = stagedPaths(G, slotRoot);
      // F2: git itself refuses when an uncommitted file differs between the old and the new base.
      const mv = keepReset(slotGit, dev);
      if (mv.status !== 0) return refuse('F2', 'uncommitted work overlaps the new base (' + firstLine(mv.stderr) + ')', tip, null, dev);
      // F3: HEAD = branch-dev, still on the task branch, and the F1 hashes are identical.
      const headF = G(['rev-parse', 'HEAD'], slotRoot, { read: true });
      const symF = G(['symbolic-ref', 'HEAD'], slotRoot, { read: true });
      const snapAfter = uncommittedSnapshot(opts.gitExec, slotRoot);
      const okF = headF.status === 0 && String(headF.stdout).trim() === dev &&
        symF.status === 0 && String(symF.stdout).trim() === 'refs/heads/' + task &&
        snapAfter.ok && snapAfter.diffSha === snap.diffSha && JSON.stringify(snapAfter.untracked) === JSON.stringify(snap.untracked);
      if (!okF) {
        bestEffortAudit(commonDir, { ts: nowIso(opts), verb: 'resync', task, mode, from: tip, to: dev, base: dev, result: 'fail', reason: 'F3: verification failed' });
        return { ok: false, exitCode: 1, reason: 'F3: verification failed - STOP (the tool never undoes a reset)' };
      }
      const stagedAfter = stagedPaths(G, slotRoot);
      return finish(dev, { stagedLost: stagedBefore.filter((p) => stagedAfter.indexOf(p) === -1) });
    }

    // Mode R: the task has commits of its own.
    // R1: the slot is clean (ignored files such as plan.md, codex.md, qa.log are allowed).
    const stR1 = G(['status', '--porcelain=v2', '--untracked-files=all'], slotRoot, { read: true });
    if (stR1.status !== 0) return refuse('R1', 'the slot status could not be read', tip, null, dev);
    if (String(stR1.stdout).trim()) return refuse('R1', 'the slot is not clean', tip, null, dev);

    // R2: refuse a task with a protected-path commit or a PROTECTED-approved commit (R-4).
    const mbR = G(['merge-base', dev, tip], canonicalRoot, { read: true });
    if (mbR.status !== 0) return refuse('R3', 'branch-dev and the task tip share no merge base', tip, null, dev);
    const mb = String(mbR.stdout).trim();
    const rangeR = G(['rev-list', '--reverse', mb + '..' + tip], canonicalRoot, { read: true });
    if (rangeR.status !== 0) return refuse('R3', 'could not list the task commits', tip, null, dev);
    const taskCommits = String(rangeR.stdout).split('\n').map((s) => s.trim()).filter(Boolean);
    const mergesR = G(['rev-list', '--merges', mb + '..' + tip], canonicalRoot, { read: true });
    if (mergesR.status !== 0 || String(mergesR.stdout).trim()) return refuse('R3', 'a merge commit is present in the task range (Owner re-sync)', tip, null, dev);
    let protectedHit;
    for (const c of taskCommits) {
      const dt = G(['diff-tree', '--no-commit-id', '--name-only', '-r', '--no-renames', '-z', c], canonicalRoot, { read: true });
      if (dt.status !== 0) return refuse('R2', 'could not list the files of commit ' + c, tip, null, dev);
      protectedHit = String(dt.stdout).split('\0').filter(Boolean).find((f) => PROTECTED_PATH_RES.some((re) => re.test(f.toLowerCase())));
      if (protectedHit !== undefined) break;
    }
    if (protectedHit !== undefined) return refuse('R2', 'a task commit touches a protected path (' + protectedHit + ')', tip, null, dev);
    const hasProtectedCommit = readAuditEntries(commonDir).some((e) => e && e.verb === 'protected-commit' && e.task === task && e.result === 'ok');
    if (hasProtectedCommit) return refuse('R2', 'the audit log has a protected-commit entry for this task', tip, null, dev);

    // R3: replay in a temporary detached worktree; any non-zero exit aborts and refuses "conflict".
    const tmpParent = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-resync-'));
    const wt = path.join(tmpParent, 'wt');
    const hooksOverride = ['-c', 'core.hooksPath=' + toForwardSlash(hooksDir)];
    const git = (args, cwd) => spawnSync(opts.gitExec || 'git', args,
      { cwd, env: stripGitEnv(), encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
    const replayAndMove = () => {
      const add = git(hooksOverride.concat(['worktree', 'add', '--detach', wt, tip]), canonicalRoot);
      if (add.status !== 0) return refuse('R3', 'could not create the temporary worktree (' + firstLine(add.stderr) + ')', tip, null, dev);
      const rb = git(hooksOverride.concat(['-c', 'rebase.autoSquash=false', '-c', 'rebase.updateRefs=false',
        'rebase', '--onto', dev, mb, 'HEAD']), wt);
      if (rb.status !== 0) {
        git(hooksOverride.concat(['rebase', '--abort']), wt);
        return refuse('R3', 'conflict while replaying the task commits onto branch-dev - nothing changed', tip, null, dev);
      }
      const ntR = G(['rev-parse', 'HEAD'], wt, { read: true });
      if (ntR.status !== 0) return refuse('R3', 'could not read the replayed tip', tip, null, dev);
      const newTip = String(ntR.stdout).trim();
      // R4: same commit count, patch-ids equal in order, no merge commits, brief blob and changed-file set unchanged.
      const r4 = verifyReplay(opts.gitExec, G, canonicalRoot, briefPath, mb, tip, dev, newTip);
      if (!r4.ok) return refuse('R4', r4.reason, tip, null, dev);
      // R5: move the slot (and the task ref with it); verify.
      const mvR = keepReset(slotGit, newTip);
      if (mvR.status !== 0) return refuse('R5', 'git reset --keep failed in the slot (' + firstLine(mvR.stderr) + ')', tip, null, dev);
      const headR = G(['rev-parse', 'HEAD'], slotRoot, { read: true });
      const symR = G(['symbolic-ref', 'HEAD'], slotRoot, { read: true });
      const stAfter = G(['status', '--porcelain=v2', '--untracked-files=all'], slotRoot, { read: true });
      const okR = headR.status === 0 && String(headR.stdout).trim() === newTip &&
        symR.status === 0 && String(symR.stdout).trim() === 'refs/heads/' + task &&
        stAfter.status === 0 && !String(stAfter.stdout).trim();
      if (!okR) {
        bestEffortAudit(commonDir, { ts: nowIso(opts), verb: 'resync', task, mode, from: tip, to: newTip, base: dev, result: 'fail', reason: 'R5: verification failed' });
        return { ok: false, exitCode: 1, reason: 'R5: verification failed - STOP (the tool never undoes a reset)' };
      }
      return finish(newTip);
    };
    let outcome;
    try {
      outcome = replayAndMove();
    } finally {
      // R6: remove the temporary worktree, then prune.
      removeTempWorktree(G, canonicalRoot, tmpParent, wt);
    }
    const stillListed = (worktreeList(G, canonicalRoot) || []).some((t) => normPath(t.path) === normPath(wt));
    if (fs.existsSync(wt) || stillListed) {
      // A failed removal is surfaced on a refusal too (never silently lost behind the original reason).
      const leftover = 'the temporary worktree ' + wt + ' could not be removed';
      if (outcome.ok) outcome.cleanupWarning = leftover; else outcome.reason += ' (WARNING: ' + leftover + ')';
    }
    return outcome;
  } finally {
    releaseLock(lock.path);
    try { fs.rmSync(hooksDir, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  }
}
function runResync(opts) { return safeRun(() => runResyncCore(opts)); }

// ── TASK-BASE RECORD (work/task-base-record/brief.md §2-§3) ───────────────────────────────────
// <git-common-dir>/pt-task/<enc>.json is the runtime baseline of a task: its fork point, main and start time. It is
// created only by task-start or adopt (open flag 'wx'), changed only by resync, moved by cleanup, and valid only while
// its sha256 equals the recordSha256 of the latest ok audit line. These verbs move no ref, push nothing, commit nothing
// and write no approval record. Detection of a record is a file-system test only (no Git call), so a task without a
// record takes exactly the Git calls it took before.
function taskEnc(task) { return encodeURIComponent(String(task).replace(/^task\//, '')); }
function taskRecordPath(commonDir, task) { return path.join(commonDir, TASK_DIR_NAME, taskEnc(task) + '.json'); }
function recordText(record) { return JSON.stringify(record, null, 2) + '\n'; }
function readTaskRecord(canonicalRoot, commonDir, task) {
  if (!fs.existsSync(taskRecordPath(commonDir, task))) return { exists: false };
  let integrity;
  try { integrity = loadIntegrityModule(canonicalRoot); }
  catch (e) { return { exists: true, valid: false, reason: 'the integrity module could not be loaded (' + e.message + ')' }; }
  if (typeof integrity.loadTaskRecord !== 'function') return { exists: true, valid: false, reason: 'the integrity module cannot read task-base records' };
  return integrity.loadTaskRecord(commonDir, task);
}
function writeRecordNew(commonDir, task, text) {
  const recPath = taskRecordPath(commonDir, task);
  fs.mkdirSync(path.dirname(recPath), { recursive: true });
  const fd = fs.openSync(recPath, 'wx');
  try { fs.writeSync(fd, text); } finally { fs.closeSync(fd); }
  return recPath;
}
function writeRecordAtomic(commonDir, task, record) {
  const p = taskRecordPath(commonDir, task);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, recordText(record));
  fs.renameSync(tmp, p);
}

// T1 (shared by task-start, adopt-request and adopt): the caller is the canonical checkout, self-integrity, no GIT_*
// overrides, git config and hooks clean, the canonical checkout is on branch-dev and clean.
function recordVerbPre(opts, verb, auditRefusals) {
  const task = opts.task;
  if (typeof task !== 'string' || !TASK_RE.test(task)) return { ok: false, exitCode: 3, reason: 'usage: pt-land.js ' + verb + ' task/<id>' };
  const G = makeGitRunner(opts.gitExec);
  const caller = resolveCaller(G, opts.cwd, null);
  if (!caller.ok) return { ok: false, exitCode: 1, reason: 'T1: ' + caller.reason };
  if (caller.kind !== 'canonical') return { ok: false, exitCode: 1, reason: 'T1: ' + verb + ' runs only from the canonical checkout' };
  const canonicalRoot = caller.canonicalRoot;
  const commonDir = path.join(canonicalRoot, '.git');
  function refuse(step, reason, from, to) {
    if (auditRefusals) {
      bestEffortAudit(commonDir, { ts: nowIso(opts), verb, task, from: from || null, to: to || null, result: 'refuse', reason: step + ': ' + reason });
    }
    return { ok: false, exitCode: 1, reason: step + ': ' + reason };
  }
  const si = selfIntegrity(G, canonicalRoot);
  if (!si.ok) return refuse('T1', si.reason);
  const envBad = Object.keys(process.env).find((k) => GIT_ENV_OVERRIDE_RE.test(k) || R10_GIT_CONFIG_ENV_RE.test(k));
  if (envBad !== undefined) return refuse('T1', 'the session environment sets ' + envBad);
  const cfg = configClean(G, canonicalRoot);
  if (!cfg.ok) return refuse('T1', cfg.reason);
  const hooks = hooksClean(commonDir);
  if (!hooks.ok) return refuse('T1', hooks.reason);
  const clean = canonicalClean(G, canonicalRoot);
  if (!clean.ok) return refuse('T1', clean.reason);
  return { ok: true, G, task, canonicalRoot, commonDir, refuse, briefPath: 'work/' + task.replace(/^task\//, '') + '/brief.md' };
}

function runTaskStartCore(opts) {
  const c = recordVerbPre(opts, 'task-start', true);
  if (!c.ok) return c;
  const { G, task, canonicalRoot, commonDir, refuse, briefPath } = c;

  // T2: the task branch exists, is checked out in exactly one Worker slot, and sits exactly on branch-dev.
  const tipR = G(['rev-parse', '--verify', '-q', 'refs/heads/' + task], canonicalRoot, { read: true });
  if (tipR.status !== 0) return refuse('T2', 'refs/heads/' + task + ' does not exist');
  const tip = String(tipR.stdout).trim();
  const devR = G(['rev-parse', '--verify', '-q', 'refs/heads/branch-dev'], canonicalRoot, { read: true });
  if (devR.status !== 0) return refuse('T2', 'refs/heads/branch-dev does not exist', tip);
  const dev = String(devR.stdout).trim();
  const trees = worktreeList(G, canonicalRoot);
  if (!trees) return refuse('T2', 'could not list worktrees', tip, null);
  const homes = trees.filter((t) => t.branch === task);
  if (homes.length !== 1 || WORKER_SLOT_NAMES.indexOf(path.basename(toForwardSlash(homes[0].path).replace(/\/+$/, ''))) === -1) {
    return refuse('T2', 'the task branch is not checked out in exactly one Worker slot', tip);
  }
  if (tip !== dev) return refuse('T2', 'the task tip ' + tip + ' differs from branch-dev ' + dev + ' (a record is made at the fork point only)', tip, dev);

  // T3: the brief exists at the tip.
  const briefBlob = G(['rev-parse', '-q', '--verify', tip + ':' + briefPath], canonicalRoot, { read: true });
  if (briefBlob.status !== 0) return refuse('T3', briefPath + ' is missing at the tip', tip);
  const briefBuf = catFileBlobBuffer(opts.gitExec, canonicalRoot, tip + ':' + briefPath);
  if (!briefBuf) return refuse('T3', 'could not read ' + briefPath + ' at the tip', tip);
  const briefCommitR = G(['log', '-1', '--format=%H', tip, '--', briefPath], canonicalRoot, { read: true });
  const briefCommit = briefCommitR.status === 0 ? String(briefCommitR.stdout).trim() : '';
  if (!OID_RE.test(briefCommit)) return refuse('T3', 'could not find the commit of ' + briefPath, tip);

  // T4: write-once - nothing, valid or not, may already be at the record path.
  const existing = { exists: fs.existsSync(taskRecordPath(commonDir, task)) };
  if (existing.exists) return refuse('T4', 'a task-base record already exists for ' + task + ' (write-once)', tip);

  const mainOid = currentMainOid(G, canonicalRoot);
  if (!mainOid) return refuse('T2', 'refs/heads/main does not exist', tip);
  const originR = G(['rev-parse', '--verify', '-q', 'refs/remotes/origin/branch-dev'], canonicalRoot, { read: true });
  const originDevAtStart = originR.status === 0 ? String(originR.stdout).trim() : null;

  // T5: lock, re-verify, write the record, then the audit line (which carries the record's sha256).
  const lock = acquireLock(commonDir);
  if (!lock.ok) return refuse('T5', lock.reason, tip);
  try {
    const tipB = G(['rev-parse', '--verify', '-q', 'refs/heads/' + task], canonicalRoot, { read: true });
    const devB = G(['rev-parse', '--verify', '-q', 'refs/heads/branch-dev'], canonicalRoot, { read: true });
    if (tipB.status !== 0 || String(tipB.stdout).trim() !== tip || devB.status !== 0 || String(devB.stdout).trim() !== dev) {
      return refuse('T5', 'the repository state changed since preflight (race)', tip);
    }
    const startedAt = nowIso(opts);
    const record = {
      schema: 'pt-task-base/v1', task, base: tip, mainAtStart: mainOid, originDevAtStart, startedAt, briefPath,
      briefSha256: sha256OfBuffer(briefBuf), briefCommit, adopted: false,
      history: [{ ts: startedAt, verb: 'task-start', mode: null, from: null, to: tip }]
    };
    const text = recordText(record);
    let recPath;
    try { recPath = writeRecordNew(commonDir, task, text); }
    catch (e) { return refuse('T5', 'could not write the record (' + (e && e.message ? e.message : String(e)) + ')', tip); }
    try {
      appendAudit(commonDir, { ts: startedAt, verb: 'task-start', task, from: null, to: tip, result: 'ok', reason: null, recordSha256: sha256OfBuffer(Buffer.from(text)) });
    } catch (e) {
      try { fs.unlinkSync(recPath); } catch (e2) { /* best effort - nothing may stay recorded */ }
      return refuse('T5', 'audit log append failed (' + (e && e.message ? e.message : String(e)) + ') - nothing was recorded', tip);
    }
    return {
      ok: true, exitCode: 0, verb: 'task-start', task, record, recordPath: recPath, canonicalRoot,
      message: 'TASK-START ' + task + ' base ' + tip + ' started ' + startedAt
    };
  } finally {
    releaseLock(lock.path);
  }
}
function runTaskStart(opts) { return safeRun(() => runTaskStartCore(opts)); }

// adopt-request / adopt (ATB-D4): a record for a task that was opened before records existed. Everything is derived
// from Git and the audit log; the Owner's single-use ADOPT line names the derived base and start time.
function deriveAdopt(c, opts) {
  const { G, task, canonicalRoot, commonDir, refuse, briefPath } = c;
  if (fs.existsSync(taskRecordPath(commonDir, task))) return refuse('T4', 'a task-base record already exists for ' + task);
  const tipR = G(['rev-parse', '--verify', '-q', 'refs/heads/' + task], canonicalRoot, { read: true });
  if (tipR.status !== 0) return refuse('T2', 'refs/heads/' + task + ' does not exist');
  const tip = String(tipR.stdout).trim();
  const trees = worktreeList(G, canonicalRoot);
  if (!trees) return refuse('T2', 'could not list worktrees', tip);
  const homes = trees.filter((t) => t.branch === task);
  if (homes.length !== 1 || WORKER_SLOT_NAMES.indexOf(path.basename(toForwardSlash(homes[0].path).replace(/\/+$/, ''))) === -1) {
    return refuse('T2', 'the task branch is not checked out in exactly one Worker slot', tip);
  }
  const mbR = G(['merge-base', 'refs/heads/branch-dev', 'refs/heads/' + task], canonicalRoot, { read: true });
  if (mbR.status !== 0) return refuse('A1', 'branch-dev and the task share no merge base', tip);
  const base = String(mbR.stdout).trim();
  const merges = G(['rev-list', '--merges', base + '..' + tip], canonicalRoot, { read: true });
  if (merges.status !== 0 || String(merges.stdout).trim()) return refuse('A1', 'a merge commit is present in base..task (Owner)', tip, base);

  // startedAt: the latest ok resync line for the task (its base must be this base), else the branch-creation reflog entry.
  const resyncs = readAuditEntries(commonDir).filter((e) => e && e.verb === 'resync' && e.task === task && e.result === 'ok');
  let startedAt;
  if (resyncs.length) {
    const last = resyncs[resyncs.length - 1];
    if (last.base !== base) return refuse('A2', 'rebased outside resync: Owner (merge-base ' + base + ' != the latest resync base ' + last.base + ')', tip, base);
    if (typeof last.ts !== 'string' || !ISO_RE.test(last.ts)) return refuse('A2', 'the latest resync audit line has no usable time', tip, base);
    startedAt = last.ts;
  } else {
    const rl = G(['log', '-g', '--date=unix', '--format=%gd%x1f%gs', 'refs/heads/' + task], canonicalRoot, { read: true });
    const created = rl.status === 0
      ? String(rl.stdout).split('\n').filter((l) => /\u001fbranch: Created from/.test(l)).map((l) => /@\{(\d+)\}/.exec(l)).filter(Boolean).map((m) => Number(m[1]))
      : [];
    if (!created.length) return refuse('A3', 'no branch-creation reflog entry for ' + task + ' (Owner)', tip, base);
    startedAt = new Date(Math.min(...created) * 1000).toISOString();
  }
  const mainOid = currentMainOid(G, canonicalRoot);
  if (!mainOid) return refuse('A4', 'refs/heads/main does not exist', tip, base);
  const startedSec = Math.floor(Date.parse(startedAt) / 1000);
  const orl = G(['log', '-g', '--date=unix', '--format=%gd%x1f%H', 'refs/remotes/origin/branch-dev'], canonicalRoot, { read: true });
  let originDevAtStart = null;
  if (orl.status === 0) {
    for (const line of String(orl.stdout).split('\n').filter(Boolean)) {
      const m = /@\{(\d+)\}/.exec(line);
      const oid = line.split('\u001f')[1];
      if (m && Number(m[1]) <= startedSec && OID_RE.test(oid)) { originDevAtStart = oid; break; }
    }
  }
  if (originDevAtStart === null) return refuse('A4', 'origin/branch-dev at ' + startedAt + ' is unreadable from its reflog (Owner)', tip, base);
  const briefBlob = G(['rev-parse', '-q', '--verify', base + ':' + briefPath], canonicalRoot, { read: true });
  if (briefBlob.status !== 0) return refuse('T3', briefPath + ' is missing at the base', tip, base);
  const briefBuf = catFileBlobBuffer(opts.gitExec, canonicalRoot, base + ':' + briefPath);
  if (!briefBuf) return refuse('T3', 'could not read ' + briefPath + ' at the base', tip, base);
  const bc = G(['log', '-1', '--format=%H', base, '--', briefPath], canonicalRoot, { read: true });
  const briefCommit = bc.status === 0 ? String(bc.stdout).trim() : '';
  if (!OID_RE.test(briefCommit)) return refuse('T3', 'could not find the commit of ' + briefPath, tip, base);
  return { ok: true, derived: { tip, base, startedAt, mainAtStart: mainOid, originDevAtStart, briefSha256: sha256OfBuffer(briefBuf), briefCommit } };
}

function runAdoptRequestCore(opts) {
  const c = recordVerbPre(opts, 'adopt-request', false);
  if (!c.ok) return c;
  const r = deriveAdopt(c, opts);
  if (!r.ok) return r;
  const d = r.derived;
  const line = approvalLine('adopt', 'ADOPT ' + c.task + ' ' + d.base + ' ' + d.startedAt, c.commonDir);
  return Object.assign({ ok: true, exitCode: 0, verb: 'adopt-request', task: c.task, approvalLine: line }, d);
}
function runAdoptRequest(opts) { return safeRun(() => runAdoptRequestCore(opts)); }

function runAdoptCore(opts) {
  const c = recordVerbPre(opts, 'adopt', true);
  if (!c.ok) return c;
  const { task, commonDir, refuse, briefPath } = c;
  const r = deriveAdopt(c, opts);
  if (!r.ok) return r;
  const d = r.derived;
  const apr = parseRecord(readRecordFile(commonDir, ADOPT_RECORD_NAME), 'ADOPT');
  if (!apr || apr.task !== task || apr.base !== d.base || apr.startedAt !== d.startedAt) {
    return refuse('A5', 'no/stale ADOPT approval', d.tip, d.base);
  }
  const lock = acquireLock(commonDir);
  if (!lock.ok) return refuse('A6', lock.reason, d.tip, d.base);
  try {
    const again = deriveAdopt(Object.assign({}, c, { refuse: (s, why) => ({ ok: false, exitCode: 1, reason: s + ': ' + why }) }), opts);
    if (!again.ok || JSON.stringify(again.derived) !== JSON.stringify(d)) return refuse('A6', 'the repository state changed since preflight (race)', d.tip, d.base);
    const adoptedAt = nowIso(opts);
    const record = {
      schema: 'pt-task-base/v1', task, base: d.base, mainAtStart: d.mainAtStart, originDevAtStart: d.originDevAtStart, startedAt: d.startedAt,
      briefPath, briefSha256: d.briefSha256, briefCommit: d.briefCommit, adopted: true,
      history: [{ ts: adoptedAt, verb: 'adopt', mode: null, from: null, to: d.base }]
    };
    const text = recordText(record);
    let recPath;
    try { recPath = writeRecordNew(commonDir, task, text); }
    catch (e) { return refuse('A6', 'could not write the record (' + (e && e.message ? e.message : String(e)) + ')', d.tip, d.base); }
    // brief 3.2 order: write the record, delete the single-use approval, then append the audit line.
    // The approval is single-use: if it cannot be deleted, fail closed - nothing may stay recorded and no adopt line is appended.
    try { fs.unlinkSync(path.join(commonDir, ADOPT_RECORD_NAME)); } catch (e) {
      try { fs.unlinkSync(recPath); } catch (e2) { /* best effort - the approval could not be deleted: nothing may stay recorded */ }
      return refuse('A6', 'could not delete the single-use ADOPT approval (' + (e && e.message ? e.message : String(e)) + ') - nothing was recorded', d.tip, d.base);
    }
    try {
      appendAudit(commonDir, { ts: adoptedAt, verb: 'adopt', task, from: null, to: d.base, result: 'ok', reason: null, recordSha256: sha256OfBuffer(Buffer.from(text)) });
    } catch (e) {
      try { fs.unlinkSync(recPath); } catch (e2) { /* best effort - nothing may stay recorded */ }
      return refuse('A6', 'audit log append failed (' + (e && e.message ? e.message : String(e)) + ') - nothing was recorded', d.tip, d.base);
    }
    return {
      ok: true, exitCode: 0, verb: 'adopt', task, record, recordPath: recPath,
      message: 'ADOPTED ' + task + ' base ' + d.base + ' started ' + d.startedAt
    };
  } finally {
    releaseLock(lock.path);
  }
}
function runAdopt(opts) { return safeRun(() => runAdoptCore(opts)); }

// ── CLI ─────────────────────────────────────────────────────────────────────────────────
function printTaskStart(res) {
  const r = res.record;
  process.stdout.write('TASK-START ' + res.task + '\n');
  process.stdout.write('  base:      ' + r.base + '\n');
  process.stdout.write('  main:      ' + r.mainAtStart + '\n');
  process.stdout.write('  startedAt: ' + r.startedAt + '\n');
  process.stdout.write('  brief sha256: ' + r.briefSha256 + '\n');
  process.stdout.write('  record:    ' + toForwardSlash(res.recordPath) + '\n');
  process.stdout.write('  step 13:   node qa/guard_integrity_check.js --task ' + res.task + ' --root ' + toForwardSlash(res.canonicalRoot) + '\n');
}
function printAdoptRequest(res) {
  process.stdout.write('ADOPT REQUEST for ' + res.task + '\n');
  process.stdout.write('  base:      ' + res.base + '\n');
  process.stdout.write('  startedAt: ' + res.startedAt + '\n');
  process.stdout.write('  main:      ' + res.mainAtStart + '\n');
  process.stdout.write('  origin/branch-dev at start: ' + res.originDevAtStart + '\n');
  process.stdout.write('  brief sha256: ' + res.briefSha256 + ' (commit ' + res.briefCommit + ')\n');
  process.stdout.write('\n' + res.approvalLine + '\n');
}
function printLandRequest(res) {
  process.stdout.write('LAND REQUEST for ' + res.report.task + '\n');
  process.stdout.write('  tip:  ' + res.report.tip + '\n');
  process.stdout.write('  base: ' + res.report.base + '\n');
  process.stdout.write('  commits: ' + res.report.commitCount + '\n');
  process.stdout.write('  files:\n' + res.report.files.map((f) => '    ' + f).join('\n') + '\n');
  if (res.report.protectedFiles && res.report.protectedFiles.length) {
    process.stdout.write('  protected (PROTECTED-approved):\n' +
      res.report.protectedFiles.map((p) => '    ' + p.path + '  blob ' + p.blob + '  tree ' + p.tree).join('\n') + '\n');
  }
  process.stdout.write('  checks:\n' + res.report.checks.map((c) => '    ' + c).join('\n') + '\n');
  process.stdout.write('\n' + res.approvalLine + '\n');
}
function printPushRequest(res) {
  process.stdout.write('PUSH REQUEST\n');
  if (res.commits) process.stdout.write(res.commits + '\n');
  process.stdout.write('\n' + res.notice + '\n');
  process.stdout.write('\n' + res.approvalLine + '\n');
}
function printBriefRequest(res) {
  process.stdout.write('BRIEF REQUEST for ' + res.path + '\n');
  process.stdout.write('  branch-dev OID: ' + res.oid + '\n');
  process.stdout.write('  sha256:         ' + res.sha256 + '\n');
  process.stdout.write('\n' + res.approvalLine + '\n');
}
function printProtectedRequest(res) {
  process.stdout.write('PROTECTED REQUEST for ' + res.task + '\n');
  process.stdout.write('  HEAD: ' + res.head + '\n');
  process.stdout.write('  tree: ' + res.tree + '\n');
  process.stdout.write('  files:\n' + res.files.map((f) => '    ' + f.target + '  ' + f.blobOid + '  sha256=' + f.sha256).join('\n') + '\n');
  process.stdout.write('\n' + res.approvalLine + '\n');
}
function printResync(res) {
  if (res.mode === 'none') { process.stdout.write(res.message + '\n'); return; }
  process.stdout.write('RESYNC ' + res.task + ': mode ' + res.mode + ' (' +
    (res.mode === 'F' ? 'fast-forward; uncommitted work kept in place' : 'replay of the task commits') + ')\n');
  process.stdout.write('  tip:  ' + res.from + ' -> ' + res.to + '\n');
  process.stdout.write('  base: ' + res.base + ' (branch-dev, not moved)\n');
  if (res.stagedLost && res.stagedLost.length) {
    process.stdout.write('  note: ' + res.stagedLost.length + ' staged path(s) are now unstaged, content unchanged: ' + res.stagedLost.join(', ') + '\n');
  }
  const i = res.integrity;
  process.stdout.write('  next (the Worker resumes): re-run npm run qa:offline and the relevant targeted tests, then\n');
  if (i.record) process.stdout.write('    node qa/guard_integrity_check.js --task ' + i.task + ' --root ' + i.root + '\n');
  else process.stdout.write('    node qa/guard_integrity_check.js --base-main ' + i.baseMain + ' --base-dev ' + i.baseDev + ' --task ' + i.task + ' --since ' + i.since + ' --root ' + i.root + '\n');
  process.stdout.write('  then request LAND again - the LAND line stays the Owner\'s gate.\n');
  if (res.cleanupWarning) process.stderr.write('pt-land: WARNING - ' + res.cleanupWarning + '\n');
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
  else if (verb === 'brief-request') printBriefRequest(res);
  else if (verb === 'protected-request') printProtectedRequest(res);
  else if (verb === 'protected-commit') process.stdout.write(res.message + '\n');
  else if (verb === 'resync') printResync(res);
  else if (verb === 'task-start') printTaskStart(res);
  else if (verb === 'adopt-request') printAdoptRequest(res);
  else if (verb === 'adopt') process.stdout.write(res.message + '\n');
  if (res.recordWarning) process.stderr.write('pt-land: WARNING - ' + res.recordWarning + '\n');
  // The Owner reads the mutation result from CLI output; a successful merge/push/cleanup whose
  // audit append failed must still surface that warning here, not only in the module-API result
  // (protected-commit has no such path: its audit entry is load-bearing and a failed append refuses).
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
  } else if (verb === 'brief-request') {
    if (argv.length !== 2 || typeof argv[1] !== 'string' || !argv[1]) {
      process.stderr.write('pt-land: usage error - usage: pt-land.js brief-request work/<id>/brief.md\n');
      process.exit(3);
      return;
    }
    opts.path = argv[1];
    output(runBriefRequest(opts), verb);
  } else if (verb === 'protected-request' || verb === 'protected-commit') {
    if (argv.length !== 2 || typeof argv[1] !== 'string' || !argv[1]) {
      process.stderr.write('pt-land: usage error - usage: pt-land.js ' + verb + ' task/<id>\n');
      process.exit(3);
      return;
    }
    opts.task = argv[1];
    output(verb === 'protected-commit' ? runProtectedCommit(opts) : runProtectedRequest(opts), verb);
  } else if (verb === 'resync') {
    if (argv.length !== 2 || typeof argv[1] !== 'string' || !argv[1]) {
      process.stderr.write('pt-land: usage error - usage: pt-land.js resync task/<id>\n');
      process.exit(3);
      return;
    }
    opts.task = argv[1];
    output(runResync(opts), verb);
  } else if (verb === 'task-start' || verb === 'adopt-request' || verb === 'adopt') {
    if (argv.length !== 2 || typeof argv[1] !== 'string' || !argv[1]) {
      process.stderr.write('pt-land: usage error - usage: pt-land.js ' + verb + ' task/<id>\n');
      process.exit(3);
      return;
    }
    opts.task = argv[1];
    output(verb === 'task-start' ? runTaskStart(opts) : verb === 'adopt' ? runAdopt(opts) : runAdoptRequest(opts), verb);
  } else {
    process.stderr.write('pt-land: usage error - unknown verb ' + JSON.stringify(verb) + '\n');
    process.exit(3);
  }
}

module.exports = {
  runLandRequest, runLand, runPushRequest, runPush, runCleanup, runResync,
  runTaskStart, runAdoptRequest, runAdopt,
  runBriefRequest, runProtectedRequest, runProtectedCommit,
  parseRecord, parseLandScope, parseProtectedScope, approvalLine
};

if (require.main === module) {
  main(process.argv.slice(2));
}
