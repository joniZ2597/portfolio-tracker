#!/usr/bin/env node
'use strict';

/*
 * r10 R10-8: read-only compensating control (detection only). Not part of qa:offline.
 * Run by the Worker after its step-13 commit (result -> the step-13 report / LAND evidence, never review.md) and by the Owner before LAND.
 *
 * Usage:
 *   node qa/guard_integrity_check.js --task task/<id> [--root <canonical-checkout>] [--remote]
 *        (record mode: base, start time and main come from the task-base record in <git-common-dir>/pt-task/)
 *   node qa/guard_integrity_check.js --task task/<id> --print-record [--root <canonical-checkout>]
 *   node qa/guard_integrity_check.js --base-main <oid> --base-dev <oid> [--since <ISO>]
 *        [--task task/<id>] [--root <canonical-checkout>] [--remote]
 *        (legacy mode: no --task, or --task with no task-base record)
 *
 * Exit 1 (FAIL) on any of the seven conditions below; exit 0 (PASS) otherwise; exit 3 on a usage error.
 * All git reads set GIT_OPTIONAL_LOCKS=0; every result is computed once and stored.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const R10_PROTECTED_CONFIG_RE = /^(?:core\.hookspath|core\.fsmonitor|include\.path|includeif\..*\.path)$/i;
const STAGED_DENY_RES = [
  /^\.claude\/settings[\w.-]*\.json$/i,
  /^\.claude\/hooks\//i,
  /^checkpoint\.md$/i,
  /^\.env[\w.-]*$/i,
  /^work\/[^/]+\/brief\.md$/i
];
const REPORT_ONLY_KEYS = /^(?:core\.sshcommand|core\.pager|diff\.external|filter\..*|gpg\.program|core\.editor|sequence\.editor)$/i;
const EXPECT_WORKTREE_NAMES = ['portfolio-tracker', 'pt-wt-worker-a', 'pt-wt-worker-b'];
const PROTECTED_BRANCHES = ['main', 'branch-dev'];

function makeGit(gitExec) {
  return (args, cwd) => spawnSync(gitExec || 'git', args, {
    cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024,
    env: Object.assign({}, process.env, { GIT_OPTIONAL_LOCKS: '0' })
  });
}

function parseArgs(argv) {
  const o = { since: null, baseMain: null, baseDev: null, task: null, root: null, remote: false, printRecord: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--since') o.since = argv[++i];
    else if (a === '--base-main') o.baseMain = argv[++i];
    else if (a === '--base-dev') o.baseDev = argv[++i];
    else if (a === '--task') o.task = argv[++i];
    else if (a === '--root') o.root = argv[++i];
    else if (a === '--remote') o.remote = true;
    else if (a === '--print-record') o.printRecord = true;
    else return { error: 'unknown argument ' + a };
  }
  if (o.printRecord) { if (!o.task) return { error: '--print-record needs --task' }; return o; }
  // --base-* are required outside record mode; whether a task has a record is decided by runIntegrity.
  if (!o.task && (!o.baseMain || !o.baseDev)) return { error: '--base-main and --base-dev are required' };
  return o;
}

// C6 exemption (work/owner-one-action-gates/brief.md §8): a protected-path hit in base-dev...task is
// exempt only when it is PROTECTED-approved for this task - an `ok` protected-commit audit entry for
// opts.task whose `to` is an ancestor of the task tip with to^{tree} == tree (most recent such entry
// wins), and the path's blob at the task tip equals its blob in that tree. work/*/brief.md,
// CHECKPOINT.md and .env* are never exempt. Malformed audit lines are skipped. Reads only.
const C6_NEVER_EXEMPT_RES = [/^work\/[^/]+\/brief\.md$/i, /^checkpoint\.md$/i, /^\.env[\w.-]*$/i];
function readProtectedCommitEntries(commonAbs, task) {
  const p = path.join(commonAbs, 'pt-land-log');
  if (!fs.existsSync(p)) return [];
  let text;
  try { text = fs.readFileSync(p, 'utf8'); } catch (e) { return []; }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch (err) { continue; }
    if (e && e.verb === 'protected-commit' && e.result === 'ok' && e.task === task && typeof e.to === 'string' && typeof e.tree === 'string') out.push(e);
  }
  return out;
}
function protectedApprovedInTask(G, root, task, p) {
  if (C6_NEVER_EXEMPT_RES.some((re) => re.test(p))) return false;
  const commonDirR = G(['rev-parse', '--git-common-dir'], root);
  if (commonDirR.status !== 0) return false;
  const cd = String(commonDirR.stdout).trim();
  const commonAbs = path.isAbsolute(cd) ? cd : path.resolve(root, cd);
  const entries = readProtectedCommitEntries(commonAbs, task);
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i];
    if (G(['merge-base', '--is-ancestor', e.to, task], root).status !== 0) continue;
    const toTree = G(['rev-parse', '-q', '--verify', e.to + '^{tree}'], root);
    if (toTree.status !== 0 || String(toTree.stdout).trim() !== e.tree) continue;
    const inTree = G(['rev-parse', '-q', '--verify', e.tree + ':' + p], root);
    if (inTree.status !== 0) continue;
    const atTip = G(['rev-parse', '-q', '--verify', task + ':' + p], root);
    if (atTip.status !== 0) return false;
    return String(inTree.stdout).trim() === String(atTip.stdout).trim();
  }
  return false;
}

function worktreeList(G, root) {
  const r = G(['worktree', 'list', '--porcelain'], root);
  if (r.status !== 0) throw new Error('worktree list failed');
  const trees = [];
  let cur = null;
  for (const line of String(r.stdout).split('\n')) {
    if (line.startsWith('worktree ')) { cur = { path: line.slice('worktree '.length).trim(), branch: null, head: null }; trees.push(cur); }
    else if (cur && line.startsWith('branch ')) cur.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '');
    else if (cur && line.startsWith('HEAD ')) cur.head = line.slice('HEAD '.length).trim();
  }
  return trees;
}

// ── task-base record (work/task-base-record/brief.md §2, §4) ───────────────────────────────────
// <git-common-dir>/pt-task/<enc>.json is written only by the land tool (task-start / adopt / resync). A record is valid
// only if its fields check and its sha256 equals the recordSha256 of the latest ok audit line for the task. Reads only.
const RECORD_OID_RE = /^[0-9a-f]{40}$/;
const RECORD_SHA_RE = /^[0-9a-f]{64}$/;
const RECORD_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const RECORD_TASK_RE = /^task\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const RECORD_BRIEF_RE = /^work\/[a-z0-9][a-z0-9._-]*\/brief\.md$/;
const RECORD_AUDIT_VERBS = ['task-start', 'adopt', 'resync'];

function taskRecordPath(commonAbs, task) {
  return path.join(commonAbs, 'pt-task', encodeURIComponent(String(task).replace(/^task\//, '')) + '.json');
}
function readAuditLog(commonAbs) {
  const p = path.join(commonAbs, 'pt-land-log');
  if (!fs.existsSync(p)) return [];
  let text;
  try { text = fs.readFileSync(p, 'utf8'); } catch (e) { return []; }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch (e) { /* malformed lines are skipped */ }
  }
  return out;
}
function latestRecordAudit(commonAbs, task) {
  let latest = null;
  for (const e of readAuditLog(commonAbs)) {
    if (e && e.task === task && e.result === 'ok' && RECORD_AUDIT_VERBS.indexOf(e.verb) !== -1 && typeof e.recordSha256 === 'string') latest = e;
  }
  return latest;
}
function loadTaskRecord(commonAbs, task) {
  const p = taskRecordPath(commonAbs, task);
  if (!fs.existsSync(p)) return { exists: false };
  const bad = (reason) => ({ exists: true, valid: false, reason });
  let buf;
  try { buf = fs.readFileSync(p); } catch (e) { return bad('the record cannot be read'); }
  let rec;
  try { rec = JSON.parse(buf.toString('utf8')); } catch (e) { return bad('the record is not valid JSON'); }
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return bad('the record is not a JSON object');
  if (rec.schema !== 'pt-task-base/v1') return bad('unknown schema');
  if (typeof rec.task !== 'string' || !RECORD_TASK_RE.test(rec.task) || rec.task !== task) return bad('the record names a different task');
  for (const k of ['base', 'mainAtStart', 'briefCommit']) {
    if (typeof rec[k] !== 'string' || !RECORD_OID_RE.test(rec[k])) return bad(k + ' is not a 40-hex oid');
  }
  if (rec.originDevAtStart !== null && (typeof rec.originDevAtStart !== 'string' || !RECORD_OID_RE.test(rec.originDevAtStart))) return bad('originDevAtStart is not a 40-hex oid or null');
  if (typeof rec.startedAt !== 'string' || !RECORD_ISO_RE.test(rec.startedAt) || Number.isNaN(Date.parse(rec.startedAt))) return bad('startedAt is not an ISO-8601 UTC time');
  if (typeof rec.briefPath !== 'string' || !RECORD_BRIEF_RE.test(rec.briefPath)) return bad('briefPath is not work/<id>/brief.md');
  if (typeof rec.briefSha256 !== 'string' || !RECORD_SHA_RE.test(rec.briefSha256)) return bad('briefSha256 is not a 64-hex digest');
  if (typeof rec.adopted !== 'boolean') return bad('adopted is not a boolean');
  if (!Array.isArray(rec.history) || rec.history.length === 0) return bad('history is empty');
  for (const h of rec.history) {
    if (!h || typeof h !== 'object' || typeof h.ts !== 'string' || !RECORD_ISO_RE.test(h.ts) || RECORD_AUDIT_VERBS.indexOf(h.verb) === -1 ||
      !(h.mode === null || h.mode === 'F' || h.mode === 'R') || !(h.from === null || (typeof h.from === 'string' && RECORD_OID_RE.test(h.from))) ||
      typeof h.to !== 'string' || !RECORD_OID_RE.test(h.to)) return bad('a history entry is malformed');
  }
  if (rec.history[0].verb !== 'task-start' && rec.history[0].verb !== 'adopt') return bad('history[0] is not a task-start or adopt entry');
  if (rec.base !== rec.history[rec.history.length - 1].to) return bad('base is not history[last].to');
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const latest = latestRecordAudit(commonAbs, task);
  if (!latest) return bad('no ok audit line carries a recordSha256 for this task');
  if (latest.recordSha256 !== sha) return bad('the record sha256 differs from the latest audit recordSha256 (edited or replaced)');
  return { exists: true, valid: true, record: rec, sha256: sha };
}
function resolveCommonAbs(G, root, opts) {
  if (opts.commonDir) return path.resolve(opts.commonDir);
  // A canonical checkout keeps its repository in <root>/.git (a directory): that is the common dir, found with no Git call, so a
  // task with no record makes exactly the Git calls it made before. A slot (.git is a file) or any other root asks Git.
  try { if (fs.statSync(path.join(root, '.git')).isDirectory()) return path.join(path.resolve(root), '.git'); } catch (e) { /* ask Git */ }
  const r = G(['rev-parse', '--git-common-dir'], root);
  if (r.status !== 0) return null;
  const cd = String(r.stdout).trim();
  return path.isAbsolute(cd) ? cd : path.resolve(root, cd);
}
// Used by the CLI (WARN line, --print-record): the record state of opts.task, or null when there is no task.
function taskRecordState(opts) {
  if (!opts.task) return null;
  const G = makeGit(opts.gitExec);
  const commonAbs = resolveCommonAbs(G, opts.root || process.cwd(), opts);
  return commonAbs ? loadTaskRecord(commonAbs, opts.task) : { exists: false };
}
// A flag the caller supplied must equal the record (compatibility); a difference is a mismatch, not a check result.
function recordMismatch(opts, rec) {
  const tag = ' (' + rec.task + ', started ' + rec.startedAt + ')';
  if (opts.baseDev && opts.baseDev !== rec.base) {
    return { kind: 'BASE MISMATCH', line: 'BASE MISMATCH: --base-dev ' + opts.baseDev + ' != recorded task base ' + rec.base + tag + '. Re-run without --base-dev.' };
  }
  if (opts.since && Date.parse(opts.since) !== Date.parse(rec.startedAt)) {
    return { kind: 'SINCE MISMATCH', line: 'SINCE MISMATCH: --since ' + opts.since + ' != recorded start ' + rec.startedAt + tag + '. Re-run without --since.' };
  }
  if (opts.baseMain && opts.baseMain !== rec.mainAtStart) {
    return { kind: 'MAIN MISMATCH', line: 'MAIN MISMATCH: --base-main ' + opts.baseMain + ' != recorded main at start ' + rec.mainAtStart + tag + '. Re-run without --base-main.' };
  }
  return null;
}

// §4.5 explained chain: from the recorded start base S to branch-dev D, every move is a logged LAND from the current
// position or a brief-only addition (exactly one added work/<id>/brief.md). Returns the ordered points and the steps.
function explainChain(G, root, commonAbs, S, D) {
  const res = { failure: null, points: [S], steps: [] };
  const anc = G(['merge-base', '--is-ancestor', S, D], root);
  if (anc.status !== 0) { res.failure = 'C1 branch-dev does not descend from the recorded start base (rewind or force-move)'; return res; }
  const merges = G(['rev-list', '--merges', S + '..' + D], root);
  if (merges.status !== 0 || String(merges.stdout).trim()) { res.failure = 'C1 a merge commit is present between the recorded start base and branch-dev'; return res; }
  const lands = readAuditLog(commonAbs).filter((e) => e && e.verb === 'land' && e.result === 'ok' &&
    typeof e.from === 'string' && RECORD_OID_RE.test(e.from) && typeof e.to === 'string' && RECORD_OID_RE.test(e.to));
  let cur = S;
  while (cur !== D) {
    let landed = null;
    for (let i = lands.length - 1; i >= 0 && !landed; i -= 1) {
      if (lands[i].from !== cur || lands[i].to === cur) continue;
      if (G(['merge-base', '--is-ancestor', lands[i].to, D], root).status === 0) landed = lands[i];
    }
    if (landed) {
      res.steps.push('chain land:' + cur + '..' + landed.to);
      cur = landed.to;
      res.points.push(cur);
      continue;
    }
    const rl = G(['rev-list', '--reverse', cur + '..' + D], root);
    const c = rl.status === 0 ? String(rl.stdout).split('\n').filter(Boolean)[0] : null;
    const dt = c ? G(['diff-tree', '-r', '--no-commit-id', '--no-renames', '--name-status', c], root) : null;
    const lines = dt && dt.status === 0 ? String(dt.stdout).split('\n').map((l) => l.trim()).filter(Boolean) : [];
    const added = lines.length ? /^A\t(work\/[a-z0-9][a-z0-9._-]*\/brief\.md)$/.exec(lines[0]) : null;
    if (c && lines.length === 1 && added) {
      res.steps.push('chain brief:' + c + ' ' + added[1]);
      cur = c;
      res.points.push(cur);
      continue;
    }
    res.failure = 'C1 unexplained branch-dev advance at ' + (c || '<unknown>') + ' - not a logged LAND from ' + cur + ' and not a brief-only addition';
    return res;
  }
  return res;
}

// §4.4 C2 in record mode: reflog entries after the recorded start, oldest first, with each entry's own oid.
function recordReflogCheck(G, root, rec, points, failures) {
  const sinceMs = Date.parse(rec.startedAt);
  const entriesOf = (ref, requireReflog) => {
    const rl = G(['log', '-g', '--date=unix', '--format=%gd%x1f%gs%x1f%H', ref], root);
    if (rl.status !== 0) { if (requireReflog) failures.push('C2 could not read reflog for ' + ref + ' (unreadable)'); return null; }
    const lines = String(rl.stdout).split('\n').filter(Boolean);
    if (requireReflog && !lines.length) { failures.push('C2 ' + ref + ' has no reflog (missing or emptied)'); return null; }
    const out = [];
    for (const line of lines) {
      const m = /@\{(\d+)\}/.exec(line);
      if (!m) continue;
      const parts = line.split('\u001f');
      if (Number(m[1]) * 1000 > sinceMs) out.push({ msg: parts[1], oid: parts[2] });
    }
    return out.reverse();
  };
  const walk = (ref, allowed, requireReflog) => {
    const entries = entriesOf(ref, requireReflog);
    if (!entries) return;
    let lastIdx = -1;
    for (const e of entries) {
      const idx = allowed.indexOf(e.oid);
      if (idx === -1) { failures.push('C2 ' + ref + ' reflog entry ' + e.oid + ' is not an explained position (' + e.msg + ')'); break; }
      if (idx < lastIdx) {
        failures.push('C2 ' + ref + ' moved backwards at ' + e.oid + ' (rewind or force-move; ' + e.msg + ')');
        break;
      }
      lastIdx = idx;
    }
  };
  const orf = G(['for-each-ref', '--format=%(refname)', 'refs/remotes/origin'], root);
  const originRefs = [];
  if (orf.status === 0) { for (const l of String(orf.stdout).split('\n')) if (l.trim()) originRefs.push(l.trim()); }
  else failures.push('C2 could not enumerate origin remote-tracking refs');
  const strict = (ref, requireReflog) => {
    const entries = entriesOf(ref, requireReflog);
    if (entries && entries.length) failures.push('C2 reflog entry newer than the recorded start on ' + ref + ' (' + entries[0].msg + ')');
  };
  strict('refs/heads/main', true);
  walk('refs/heads/branch-dev', points, true);
  for (const ref of originRefs) {
    if (ref === 'refs/remotes/origin/branch-dev') walk(ref, rec.originDevAtStart ? [rec.originDevAtStart].concat(points) : points, false);
    else strict(ref, false);
  }
}

function runIntegrity(opts) {
  const G = makeGit(opts.gitExec);
  const failures = [];
  const report = [];
  const root = opts.root || process.cwd();
  const sinceMs = opts.since ? Date.parse(opts.since) : null;
  if (opts.since && Number.isNaN(sinceMs)) return { ok: false, failures: ['unparseable --since ' + opts.since], report, usage: true };

  // Mode selection (brief §4.1): --task with a task-base record -> record mode; without one -> legacy (needs --base-*).
  let rec = null;
  let recCommon = null;
  if (opts.task) {
    recCommon = resolveCommonAbs(G, root, opts);
    const loaded = recCommon ? loadTaskRecord(recCommon, opts.task) : { exists: false };
    if (loaded.exists) {
      if (!loaded.valid) return { ok: false, failures: ['RECORD INVALID: ' + loaded.reason], report: [], recordInvalid: true };
      rec = loaded.record;
      const mm = recordMismatch(opts, rec);
      if (mm) return { ok: false, mismatch: true, kind: mm.kind, failures: [mm.line], report: [] };
    } else if (!opts.baseMain || !opts.baseDev) {
      return { ok: false, failures: ['--base-main and --base-dev are required without a task-base record'], report, usage: true };
    }
  }

  // 1. local main / branch-dev match the given oids
  const revMain = G(['rev-parse', '--verify', '-q', 'refs/heads/main'], root);
  const revDev = G(['rev-parse', '--verify', '-q', 'refs/heads/branch-dev'], root);
  const mainOid = revMain.status === 0 ? String(revMain.stdout).trim() : null;
  const devOid = revDev.status === 0 ? String(revDev.stdout).trim() : null;
  let points = null;
  if (rec) {
    report.push('mode task-record task=' + rec.task + ' base=' + rec.base + ' startBase=' + rec.history[0].to + ' startedAt=' + rec.startedAt + ' adopted=' + rec.adopted);
    if (mainOid !== rec.mainAtStart) failures.push('C1 local main ' + (mainOid || '<missing>') + ' != recorded main at start ' + rec.mainAtStart);
    if (devOid === null) failures.push('C1 local branch-dev <missing>');
    else {
      const chain = explainChain(G, root, recCommon, rec.history[0].to, devOid);
      points = chain.points;
      for (const s of chain.steps) report.push(s);
      if (chain.failure) failures.push(chain.failure);
      else if (points.indexOf(rec.base) === -1) failures.push('C1 recorded task base ' + rec.base + ' is not on the explained branch-dev chain');
    }
    const mbR = G(['merge-base', 'refs/heads/branch-dev', 'refs/heads/' + opts.task], root);
    const mb = mbR.status === 0 ? String(mbR.stdout).trim() : null;
    if (mb === null) failures.push('RECORD STALE: merge-base of branch-dev and ' + opts.task + ' could not be computed');
    else if (mb !== rec.base) failures.push('RECORD STALE: ' + opts.task + ' was rebased outside resync (merge-base ' + mb + ' != recorded base ' + rec.base + ')');
  } else {
    if (mainOid !== opts.baseMain) failures.push('C1 local main ' + (mainOid || '<missing>') + ' != ' + opts.baseMain);
    if (devOid !== opts.baseDev) failures.push('C1 local branch-dev ' + (devOid || '<missing>') + ' != ' + opts.baseDev);
  }

  // 2. reflog entries newer than --since on protected local refs and any origin remote-tracking ref.
  // Protected local refs (main/branch-dev) must have a readable reflog: a query failure is fail-closed (a deleted
  // reflog is itself a tamper signal). Origin remote-tracking refs may legitimately lack a reflog, so skip on failure.
  if (rec) recordReflogCheck(G, root, rec, points || [rec.history[0].to], failures);
  else if (sinceMs !== null) {
    const originRefs = [];
    const orf = G(['for-each-ref', '--format=%(refname)', 'refs/remotes/origin'], root);
    if (orf.status === 0) { for (const l of String(orf.stdout).split('\n')) if (l.trim()) originRefs.push(l.trim()); }
    else failures.push('C2 could not enumerate origin remote-tracking refs');
    const scan = (ref, requireReflog) => {
      const rl = G(['log', '-g', '--date=unix', '--format=%gd%x1f%gs', ref], root);
      if (rl.status !== 0) { if (requireReflog) failures.push('C2 could not read reflog for ' + ref + ' (unreadable)'); return; }
      const lines = String(rl.stdout).split('\n').filter(Boolean);
      // A protected local ref always has >=1 reflog entry (its creation); an empty/deleted reflog (git log -g exits 0
      // with no output) means the reflog was removed or emptied to hide "update by push" traces -> fail closed.
      if (requireReflog && lines.length === 0) { failures.push('C2 protected ref ' + ref + ' has no reflog (missing or emptied)'); return; }
      for (const line of lines) {
        const m = /@\{(\d+)\}/.exec(line);
        if (!m) continue;
        if (Number(m[1]) * 1000 > sinceMs) { failures.push('C2 reflog entry newer than --since on ' + ref + ' (' + line.split('\u001f')[1] + ')'); break; }
      }
    };
    for (const ref of ['refs/heads/main', 'refs/heads/branch-dev']) scan(ref, true);
    for (const ref of originRefs) scan(ref, false);
  }

  // 3. protected exec keys / non-default remote fetch / mirror / any alias in effective config
  const cfg = G(['config', '--list', '--null'], root);
  if (cfg.status !== 0) { failures.push('C3 git config --list failed'); }
  else {
    for (const rec of String(cfg.stdout).split('\0')) {
      if (!rec) continue;
      const nl = rec.indexOf('\n');
      const key = (nl === -1 ? rec : rec.slice(0, nl)).trim();
      const value = nl === -1 ? '' : rec.slice(nl + 1);
      if (R10_PROTECTED_CONFIG_RE.test(key)) {
        if (/^core\.fsmonitor$/i.test(key) && /^(?:true|false|yes|no|on|off|0|1)$/i.test(value.trim())) { /* boolean fsmonitor is fine */ }
        else failures.push('C3 protected config key ' + key + '=' + value);
      } else if (/^remote\.([^.]+)\.fetch$/i.test(key)) {
        // "non-default" is per-remote: each remote's default maps into its OWN tracking namespace.
        const rname = /^remote\.([^.]+)\.fetch$/i.exec(key)[1];
        const def = '+refs/heads/*:refs/remotes/' + rname + '/*';
        if (value.trim() !== def) failures.push('C3 non-default ' + key + '=' + value.trim());
      } else if (/^remote\.[^.]+\.mirror$/i.test(key)) {
        failures.push('C3 ' + key + '=' + value.trim());
      } else if (/^alias\./i.test(key)) {
        failures.push('C3 alias present: ' + key + '=' + value.trim());
      } else if (REPORT_ONLY_KEYS.test(key)) {
        report.push('exec-bearing config (report-only): ' + key + '=' + value.trim());
      }
    }
  }

  // 4. non-.sample hooks in the common hooks dir
  const commonDirR = G(['rev-parse', '--git-common-dir'], root);
  if (commonDirR.status === 0) {
    const cd = String(commonDirR.stdout).trim();
    const commonAbs = path.isAbsolute(cd) ? cd : path.resolve(root, cd);
    const hooksDir = path.join(commonAbs, 'hooks');
    if (fs.existsSync(hooksDir)) {
      const bad = fs.readdirSync(hooksDir).filter((n) => !/\.sample$/i.test(n));
      if (bad.length) failures.push('C4 non-sample hooks installed: ' + bad.join(', '));
    }
  } else failures.push('C4 could not resolve git common dir');

  // gather worktrees once for checks 5 and 7
  let trees = [];
  try { trees = worktreeList(G, root); } catch (e) { failures.push('C7 ' + e.message); }

  // 5. in any worktree, tracked .claude/settings*.json or .claude/hooks/** modified/deleted, or a NEW untracked one.
  // `git status --porcelain` surfaces tracked modifications/deletions AND untracked new files (e.g. a planted
  // .claude/hooks/** hook - the primary tamper vector) that `git diff HEAD` alone misses. Gitignored files are NOT
  // flagged: a legitimate local `.claude/settings.local.json` is commonly gitignored and DENY-tier (a task cannot write
  // it via the file tools), so flagging it would cry wolf on every run; script-planted gitignored governance files are
  // the documented T6 residual, not a C5 case.
  for (const t of trees) {
    const s = G(['status', '--porcelain', '--', '.claude'], t.path);
    if (s.status !== 0) { failures.push('C5 status failed in ' + path.basename(t.path)); continue; }
    const hits = String(s.stdout).split('\n')
      .map((l) => l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop().trim())
      .filter(Boolean)
      .filter((p) => /^\.claude\/settings[\w.-]*\.json$/i.test(p) || /^\.claude\/hooks\//i.test(p));
    if (hits.length) failures.push('C5 governance files differ from HEAD in ' + path.basename(t.path) + ': ' + hits.join(','));
  }

  // 6. base-dev...task diff touches a protected path (r9 staged-deny set)
  if (opts.task) {
    const c6Base = rec ? rec.base : opts.baseDev;
    const d = G(['diff', '--name-only', c6Base + '...' + opts.task], root);
    if (d.status === 0) {
      const hits = String(d.stdout).split('\n').map((s) => s.trim()).filter(Boolean).filter((p) => STAGED_DENY_RES.some((re) => re.test(p.replace(/\\/g, '/'))));
      // §8: a PROTECTED-approved hit is exempt; everything else fails exactly as before.
      const unapproved = hits.filter((p) => !protectedApprovedInTask(G, root, opts.task, p.replace(/\\/g, '/')));
      if (unapproved.length) failures.push('C6 base-dev...task touches protected paths: ' + unapproved.join(', '));
    } else failures.push('C6 diff ' + c6Base + '...' + opts.task + ' failed');
  }

  // 7. worktree set is exactly canonical + two slots; main/branch-dev only in canonical
  if (trees.length) {
    const names = trees.map((t) => path.basename(t.path.replace(/[\\/]+$/, '')));
    const expected = opts.expectWorktrees || EXPECT_WORKTREE_NAMES;
    const extra = names.filter((n) => expected.indexOf(n) === -1);
    const missing = expected.filter((n) => names.indexOf(n) === -1);
    if (extra.length || missing.length) failures.push('C7 worktree set mismatch (extra: [' + extra.join(',') + '], missing: [' + missing.join(',') + '])');
    const canonicalName = (opts.canonicalName || EXPECT_WORKTREE_NAMES[0]);
    for (const t of trees) {
      const nm = path.basename(t.path.replace(/[\\/]+$/, ''));
      if (nm !== canonicalName && PROTECTED_BRANCHES.indexOf(String(t.branch)) !== -1) {
        failures.push('C7 protected branch ' + t.branch + ' checked out outside canonical (' + nm + ')');
      }
    }
  }

  // optional remote read (Owner only)
  if (opts.remote) {
    const ls = G(['ls-remote', 'origin', 'main', 'branch-dev'], root);
    if (ls.status !== 0) failures.push('C-remote ls-remote failed');
    else {
      const map = {};
      for (const line of String(ls.stdout).split('\n')) { const mm = /^([0-9a-f]{40})\s+refs\/heads\/(\S+)$/.exec(line.trim()); if (mm) map[mm[2]] = mm[1]; }
      if (rec) {
        if (map.main !== rec.mainAtStart) failures.push('C-remote origin/main ' + (map.main || '<missing>') + ' != recorded main at start ' + rec.mainAtStart);
        const okDev = (points || [rec.history[0].to]).concat(rec.originDevAtStart ? [rec.originDevAtStart] : []);
        if (okDev.indexOf(map['branch-dev']) === -1) failures.push('C-remote origin/branch-dev ' + (map['branch-dev'] || '<missing>') + ' is not an explained position');
      } else {
        if (map.main !== opts.baseMain) failures.push('C-remote origin/main ' + (map.main || '<missing>') + ' != ' + opts.baseMain);
        if (map['branch-dev'] !== opts.baseDev) failures.push('C-remote origin/branch-dev ' + (map['branch-dev'] || '<missing>') + ' != ' + opts.baseDev);
      }
    }
  }

  return { ok: failures.length === 0, failures, report };
}

module.exports = { runIntegrity, STAGED_DENY_RES, R10_PROTECTED_CONFIG_RE, loadTaskRecord, taskRecordPath, taskRecordState };

function loadedRecordExists(parsed) { const s = taskRecordState(parsed); return !!(s && s.exists); }

if (require.main === module) {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) { process.stderr.write('guard-integrity: usage error - ' + parsed.error + '\n'); process.exit(3); }
  if (parsed.printRecord) {
    const state = taskRecordState(parsed);
    if (!state.exists) { process.stderr.write('guard-integrity: no task-base record for ' + parsed.task + '\n'); process.exit(1); }
    if (!state.valid) { process.stderr.write('RECORD INVALID: ' + state.reason + '\n'); process.exit(1); }
    process.stdout.write(JSON.stringify(state.record, null, 2) + '\n' + 'mode: task-record\n');
    process.exit(0);
  }
  const res = runIntegrity(parsed);
  if (parsed.task && !res.usage && !res.recordInvalid && !res.mismatch && !loadedRecordExists(parsed)) process.stdout.write('WARN: no task-base record (legacy mode)\n');
  for (const r of res.report) process.stdout.write('REPORT: ' + r + '\n');
  if (res.usage) { process.stderr.write('guard-integrity: ' + res.failures.join('; ') + '\n'); process.exit(3); }
  if (res.mismatch) { process.stderr.write(res.failures[0] + '\n'); process.stdout.write('guard-integrity: FAIL (' + res.kind + ')\n'); process.exit(1); }
  if (res.recordInvalid) { process.stderr.write(res.failures[0] + '\n'); process.stdout.write('guard-integrity: FAIL (RECORD INVALID)\n'); process.exit(1); }
  if (!res.ok) { for (const f of res.failures) process.stderr.write('FAIL: ' + f + '\n'); process.stdout.write('guard-integrity: FAIL (' + res.failures.length + ')\n'); process.exit(1); }
  process.stdout.write('guard-integrity: PASS\n');
  process.exit(0);
}
