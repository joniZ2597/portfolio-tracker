#!/usr/bin/env node
'use strict';

/*
 * r10 R10-8: read-only compensating control (detection only). Not part of qa:offline.
 * Run by the Worker after its step-13 commit (result -> the step-13 report / LAND evidence, never review.md) and by the Owner before LAND.
 *
 * Usage:
 *   node qa/guard_integrity_check.js --base-main <oid> --base-dev <oid> [--since <ISO>]
 *        [--task task/<id>] [--root <canonical-checkout>] [--remote]
 *
 * Exit 1 (FAIL) on any of the seven conditions below; exit 0 (PASS) otherwise; exit 3 on a usage error.
 * All git reads set GIT_OPTIONAL_LOCKS=0; every result is computed once and stored.
 */

const fs = require('fs');
const path = require('path');
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
  const o = { since: null, baseMain: null, baseDev: null, task: null, root: null, remote: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--since') o.since = argv[++i];
    else if (a === '--base-main') o.baseMain = argv[++i];
    else if (a === '--base-dev') o.baseDev = argv[++i];
    else if (a === '--task') o.task = argv[++i];
    else if (a === '--root') o.root = argv[++i];
    else if (a === '--remote') o.remote = true;
    else return { error: 'unknown argument ' + a };
  }
  if (!o.baseMain || !o.baseDev) return { error: '--base-main and --base-dev are required' };
  return o;
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

function runIntegrity(opts) {
  const G = makeGit(opts.gitExec);
  const failures = [];
  const report = [];
  const root = opts.root || process.cwd();
  const sinceMs = opts.since ? Date.parse(opts.since) : null;
  if (opts.since && Number.isNaN(sinceMs)) return { ok: false, failures: ['unparseable --since ' + opts.since], report, usage: true };

  // 1. local main / branch-dev match the given oids
  const revMain = G(['rev-parse', '--verify', '-q', 'refs/heads/main'], root);
  const revDev = G(['rev-parse', '--verify', '-q', 'refs/heads/branch-dev'], root);
  const mainOid = revMain.status === 0 ? String(revMain.stdout).trim() : null;
  const devOid = revDev.status === 0 ? String(revDev.stdout).trim() : null;
  if (mainOid !== opts.baseMain) failures.push('C1 local main ' + (mainOid || '<missing>') + ' != ' + opts.baseMain);
  if (devOid !== opts.baseDev) failures.push('C1 local branch-dev ' + (devOid || '<missing>') + ' != ' + opts.baseDev);

  // 2. reflog entries newer than --since on protected local refs and any origin remote-tracking ref.
  // Protected local refs (main/branch-dev) must have a readable reflog: a query failure is fail-closed (a deleted
  // reflog is itself a tamper signal). Origin remote-tracking refs may legitimately lack a reflog, so skip on failure.
  if (sinceMs !== null) {
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
    const d = G(['diff', '--name-only', opts.baseDev + '...' + opts.task], root);
    if (d.status === 0) {
      const hits = String(d.stdout).split('\n').map((s) => s.trim()).filter(Boolean).filter((p) => STAGED_DENY_RES.some((re) => re.test(p.replace(/\\/g, '/'))));
      if (hits.length) failures.push('C6 base-dev...task touches protected paths: ' + hits.join(', '));
    } else failures.push('C6 diff ' + opts.baseDev + '...' + opts.task + ' failed');
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
      if (map.main !== opts.baseMain) failures.push('C-remote origin/main ' + (map.main || '<missing>') + ' != ' + opts.baseMain);
      if (map['branch-dev'] !== opts.baseDev) failures.push('C-remote origin/branch-dev ' + (map['branch-dev'] || '<missing>') + ' != ' + opts.baseDev);
    }
  }

  return { ok: failures.length === 0, failures, report };
}

module.exports = { runIntegrity, STAGED_DENY_RES, R10_PROTECTED_CONFIG_RE };

if (require.main === module) {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) { process.stderr.write('guard-integrity: usage error - ' + parsed.error + '\n'); process.exit(3); }
  const res = runIntegrity(parsed);
  for (const r of res.report) process.stdout.write('REPORT: ' + r + '\n');
  if (res.usage) { process.stderr.write('guard-integrity: ' + res.failures.join('; ') + '\n'); process.exit(3); }
  if (!res.ok) { for (const f of res.failures) process.stderr.write('FAIL: ' + f + '\n'); process.stdout.write('guard-integrity: FAIL (' + res.failures.length + ')\n'); process.exit(1); }
  process.stdout.write('guard-integrity: PASS\n');
  process.exit(0);
}
