'use strict';

/*
 * qa/lib/git-fake.js - work/qa-stage2-git-contracts/brief.md §3.1. Test-only helper (qa/lib/ is not auto-discovered).
 *
 * A strict, in-process stand-in for child_process.spawnSync that answers ONLY from a recorded transcript (qa/lib/git-transcript.js),
 * in exact order, and throws on anything else. The land tool and its integrity module are loaded through a Module._load hook so
 * that, and only for those two files under the private root, require('child_process') returns the fake. The file system stays real.
 *
 *   withFakeGit(session, fn)       installs the hook, runs fn(fake), removes the hook in `finally`. Because the tool wraps each verb
 *                                  in a try/catch (an UNSCRIPTED_GIT throw would become an "INTERNAL:" refusal), every violation is
 *                                  ALSO remembered on the fake and re-thrown here after fn returns.
 *   classify(argv, env)            closed mutation classification: 'read-only' | 'object-only' | 'remote-read' | 'mutating'.
 *   snapshotDirs(dirs) / oracle()  the zero-process "nothing changed" oracle.
 *
 * session: { calls: [transcript entries], ctx: git-transcript context, scopeRoot: private root, seed: number of <oid:N> to seed }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');
const T = require('./git-transcript');

// ── mutation classification (closed list; anything not listed is mutating) ───────────────────
const READ_ONLY = new Set(['rev-parse', 'status', 'log', 'rev-list', 'cat-file', 'show', 'ls-files', 'ls-tree', 'for-each-ref', 'show-ref',
  'merge-base', 'diff', 'diff-tree', 'patch-id', 'version']);
const INDEX_BOUND = new Set(['write-tree', 'read-tree', 'update-index']);
const CONFIG_READ_FLAGS = new Set(['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--list', '-l']);
// Subcommands that are mutating by name (so a transcript can be checked for subcommands NOBODY classified: unlisted = mutating, but
// the contract suite insists that every subcommand a transcript uses is named here or above).
const MUTATING_KNOWN = new Set(['update-ref', 'commit', 'commit-tree', 'merge', 'reset', 'checkout', 'switch', 'branch', 'push', 'tag', 'add', 'rm',
  'rebase', 'cherry-pick', 'stash', 'init', 'remote', 'fetch', 'clone', 'mv', 'restore', 'gc', 'prune', 'notes', 'am', 'apply', 'revert', 'pull', 'clean']);

// First non-option token, skipping the value of -c / -C (the tool runs `git -c core.hooksPath=... <sub>`).
function subcommandOf(argv) {
  const a = Array.isArray(argv) ? argv.map(String) : [];
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '-c' || a[i] === '-C') { i += 1; continue; }
    if (a[i] === '--version') return { sub: 'version', rest: a.slice(i + 1) };
    if (a[i].charAt(0) === '-') continue;
    return { sub: a[i], rest: a.slice(i + 1) };
  }
  return { sub: null, rest: [] };
}
function classify(argv, env) {
  const { sub, rest } = subcommandOf(argv);
  if (!sub) return 'mutating';
  if (READ_ONLY.has(sub)) return 'read-only';
  if (sub === 'ls-remote') return 'remote-read';
  if (sub === 'worktree') return rest[0] === 'list' ? 'read-only' : 'mutating';
  if (sub === 'config') return rest.some((t) => CONFIG_READ_FLAGS.has(t)) ? 'read-only' : 'mutating';
  if (sub === 'symbolic-ref') {
    const operands = rest.filter((t) => t.charAt(0) !== '-');
    const writes = rest.some((t) => t === '-d' || t === '--delete' || t === '-m');
    return operands.length === 1 && !writes ? 'read-only' : 'mutating';
  }
  if (sub === 'hash-object') return rest.indexOf('-w') !== -1 ? 'object-only' : 'read-only';
  if (INDEX_BOUND.has(sub)) return env && env.GIT_INDEX_FILE ? 'object-only' : 'mutating';
  return 'mutating';
}

// True when the subcommand is named in one of the classification lists (as opposed to falling through to the "unlisted = mutating" default).
function isExplicitlyClassified(argv) {
  const { sub } = subcommandOf(argv);
  if (!sub) return false;
  return READ_ONLY.has(sub) || INDEX_BOUND.has(sub) || MUTATING_KNOWN.has(sub) || ['ls-remote', 'worktree', 'config', 'symbolic-ref', 'hash-object'].indexOf(sub) !== -1;
}

// ── the fake child_process ──────────────────────────────────────────────────────────────────
function createFake(session) {
  const calls = session.calls || [];
  const ctx = session.ctx;
  const state = T.newState(session.seed !== undefined ? session.seed : T.maxOidIndex(calls));
  const fake = { index: 0, recorded: [], violations: [] };

  function violate(message) {
    const err = new Error('UNSCRIPTED_GIT ' + message);
    err.code = 'UNSCRIPTED_GIT';
    fake.violations.push(err.message);
    throw err;
  }
  function describe(argv) { return JSON.stringify(argv); }

  function spawnSync(file, args, opts) {
    const argv = (args || []).map(String);
    if (file !== 'git' && !(session.gitExec && file === session.gitExec)) violate('non-git executable ' + String(file) + ' ' + describe(argv));
    if (fake.index >= calls.length) violate('call beyond the transcript (#' + (fake.index + 1) + ') ' + describe(argv));
    const want = calls[fake.index];
    const got = T.normalizeCall('git', argv, opts || {}, { status: 0, stdout: '', stderr: '' }, ctx, state);
    const same = JSON.stringify(got.argv) === JSON.stringify(want.argv) && got.cwd === want.cwd && got.enc === want.enc && got.stdin === want.stdin;
    if (!same) {
      violate('call #' + (fake.index + 1) + ' differs: got ' + describe(got.argv) + ' cwd ' + got.cwd + ' enc ' + got.enc + ' stdin ' + got.stdin +
        '; transcript has ' + describe(want.argv) + ' cwd ' + want.cwd + ' enc ' + want.enc + ' stdin ' + want.stdin);
    }
    fake.index += 1;
    fake.recorded.push({ argv, cwd: want.cwd, kind: classify(argv, opts && opts.env), status: want.status });
    const toOut = (s) => {
      const text = T.denormalizeString(s, ctx);
      return want.enc === 'buffer' ? Buffer.from(text, 'latin1') : text;
    };
    return { status: want.status, signal: null, stdout: toOut(want.stdout), stderr: toOut(want.stderr), pid: 0, output: null };
  }
  const refuse = (name) => function refused() { violate('child_process.' + name + ' is not available to the tool under the fake'); };
  fake.cp = {
    spawnSync,
    exec: refuse('exec'), execSync: refuse('execSync'), execFile: refuse('execFile'), execFileSync: refuse('execFileSync'),
    spawn: refuse('spawn'), fork: refuse('fork')
  };
  fake.remaining = () => calls.length - fake.index;
  return fake;
}

// ── Module._load hook scoped to the two tool files under the private root ────────────────────
function norm(p) { return String(p).replace(/\\/g, '/').toLowerCase(); }
function isScoped(filename, scopeRoot) {
  if (!filename) return false;
  const f = norm(filename);
  if (f.indexOf(norm(scopeRoot) + '/') !== 0) return false;
  const base = f.slice(f.lastIndexOf('/') + 1);
  return base === 'pt-land.js' || base === 'guard_integrity_check.js';
}
// Installs `replacement()` as the child_process module for scoped requirers; returns the remover. Used by the recorder too.
function installLoadHook(scopeRoot, replacement) {
  const original = Module._load;
  Module._load = function loadWithScope(request, parent, isMain) {
    if ((request === 'child_process' || request === 'node:child_process') && parent && isScoped(parent.filename, scopeRoot)) return replacement();
    return original.apply(this, arguments);
  };
  return function remove() { if (Module._load !== original) Module._load = original; };
}

function withFakeGit(session, fn) {
  const fake = createFake(session);
  const remove = installLoadHook(session.scopeRoot, () => fake.cp);
  let value;
  try {
    value = fn(fake);
  } finally {
    remove();
  }
  if (fake.violations.length) throw new Error(fake.violations[0]);
  if (fake.remaining() > 0 && !session.allowUnconsumed) {
    throw new Error('UNSCRIPTED_GIT the tool stopped early: ' + fake.remaining() + ' scripted call(s) were not made (next ' + JSON.stringify(session.calls[fake.index].argv) + ')');
  }
  return { value, recorded: fake.recorded, fake };
}

// ── snapshot + oracle ───────────────────────────────────────────────────────────────────────
function walk(dir, out) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch (e) { return; }
  for (const n of names.sort()) {
    const abs = path.join(dir, n);
    let st;
    try { st = fs.lstatSync(abs); } catch (e) { continue; }
    if (st.isDirectory()) { out[abs] = 'DIR'; walk(abs, out); }
    else if (st.isFile()) out[abs] = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    else out[abs] = 'OTHER';
  }
}
function snapshotDirs(dirs) {
  const files = {};
  for (const d of dirs) { files[d] = fs.existsSync(d) ? 'DIR' : 'MISSING'; walk(d, files); }
  return { files, contents: auditCache(files) };
}
// Keeps the text of `*log`-style audit files so the oracle can tell an appended line from any other change.
function auditCache(files) {
  const c = {};
  for (const f of Object.keys(files)) if (/pt-land-log$/.test(f) && files[f] !== 'DIR') { try { c[f] = fs.readFileSync(f, 'utf8'); } catch (e) { c[f] = ''; } }
  return c;
}

// Returns { ok, reasons }. `recorded` is fake.recorded; `allow` may list 'object-only' / 'remote-read'; `allowAudit` is
// { file, maxNewLines } (the named audit file may only grow by whole lines, at most maxNewLines).
function oracleDetail(recorded, watchDirs, before, allowAudit, allow) {
  const reasons = [];
  const allowed = new Set(allow || []);
  for (const c of recorded) {
    // 'failed-mutating': a mutating call that Git itself REFUSED (non-zero exit) changed nothing; a row declares this only where the
    // tool's decision is Git's own refusal (e.g. `reset --keep` when uncommitted work overlaps the new base).
    if (c.kind === 'mutating' && allowed.has('failed-mutating') && typeof c.status === 'number' && c.status !== 0) continue;
    if (c.kind === 'mutating') reasons.push('mutating call ' + JSON.stringify(c.argv));
    else if (c.kind === 'object-only' && !allowed.has('object-only')) reasons.push('object-only call not allowed here ' + JSON.stringify(c.argv));
    else if (c.kind === 'remote-read' && !allowed.has('remote-read')) reasons.push('remote-read call not allowed here ' + JSON.stringify(c.argv));
  }
  const after = snapshotDirs(watchDirs);
  const keys = new Set(Object.keys(before.files).concat(Object.keys(after.files)));
  for (const k of keys) {
    if (before.files[k] === after.files[k]) continue;
    if (allowAudit && path.resolve(allowAudit.file) === path.resolve(k) && before.files[k] !== undefined) {
      const was = before.contents[k] || '';
      const now = after.contents[k] || '';
      const extra = now.slice(was.length);
      const added = extra.split('\n').filter(Boolean).length;
      if (now.startsWith(was) && (was === '' || was.endsWith('\n')) && extra.endsWith('\n') && added <= (allowAudit.maxNewLines === undefined ? 1 : allowAudit.maxNewLines)) continue;
    }
    if (allowAudit && path.resolve(allowAudit.file) === path.resolve(k) && before.files[k] === undefined) {
      const added = (after.contents[k] || '').split('\n').filter(Boolean).length;
      if (added <= (allowAudit.maxNewLines === undefined ? 1 : allowAudit.maxNewLines)) continue;
    }
    reasons.push('changed: ' + k + ' (' + String(before.files[k]) + ' -> ' + String(after.files[k]) + ')');
  }
  return { ok: reasons.length === 0, reasons };
}
function oracle(recorded, watchDirs, before, allowAudit, allow) {
  return oracleDetail(recorded, watchDirs, before, allowAudit, allow).ok;
}

// ── run one recorded scenario under the fake (zero processes) ────────────────────────────────
// scn: one scenario of a transcript file ({ env, fs, invocations: [{ fn, opts, pool | calls, result, audit }] }), pools: the file's call
// pools. o: { baseDir (a directory under the private run root), toolText, integrityText, allow }. Builds a skeleton (the tool and its
// integrity module as plain files, the recorded file-system inputs), runs the invocation under the strict fake, applies the oracle
// and removes the skeleton. Returns { result (normalised), oracle: { ok, reasons }, recorded, kinds }.
let skeletonCounter = 0;
function runLogic(scn, pools, o) {
  const os = require('os');
  skeletonCounter += 1;
  const root = path.join(o.baseDir, 'lg' + process.pid + '-' + skeletonCounter);
  const canon = path.join(root, 'portfolio-tracker');
  const slotA = path.join(root, 'pt-wt-worker-a');
  const slotB = path.join(root, 'pt-wt-worker-b');
  const bare = path.join(root, 'origin.git');
  const tmp = os.tmpdir();
  const ctx = T.makeContext({ canon, slotA, slotB, bare, fx: root, tmp });
  const inv = scn.invocations[0];
  const calls = inv.calls || pools[inv.pool];
  if (!calls) throw new Error('runLogic: no calls for the scenario (pool ' + inv.pool + ')');
  const tmpTops = [];
  for (const d of [path.join(canon, '.claude', 'hooks'), path.join(canon, '.git'), path.join(canon, 'qa'), slotA, slotB]) fs.mkdirSync(d, { recursive: true });
  const toolPath = path.join(canon, '.claude', 'hooks', 'pt-land.js');
  fs.writeFileSync(toolPath, o.toolText);
  fs.writeFileSync(path.join(canon, 'qa', 'guard_integrity_check.js'), o.integrityText);
  T.materializeFs(scn.fs, ctx);
  const tmpFwd = tmp.replace(/\\/g, '/').toLowerCase();
  for (const e of scn.fs || []) {
    const abs = T.denormalizeString(e.path, ctx).replace(/\\/g, '/');
    if (abs.toLowerCase().indexOf(tmpFwd + '/') === 0) tmpTops.push(path.join(tmp, abs.slice(tmpFwd.length + 1).split('/')[0]));
  }
  const watch = [root].concat(Array.from(new Set(tmpTops)));
  const savedEnv = {};
  for (const k of Object.keys(scn.env || {})) { savedEnv[k] = process.env[k]; process.env[k] = scn.env[k]; }
  try {
    const opts = T.denormalizeValue(inv.opts, ctx);
    const before = snapshotDirs(watch);
    const session = { calls, ctx, scopeRoot: root, seed: T.maxOidIndex([calls, inv.result, scn.fs, inv.opts]) };
    const ran = withFakeGit(session, () => {
      delete require.cache[require.resolve(toolPath)];
      return require(toolPath)[inv.fn](opts);
    });
    const audit = path.join(canon, '.git', 'pt-land-log');
    const detail = oracleDetail(ran.recorded, watch, before, { file: audit, maxNewLines: inv.audit || 0 }, o.allow);
    const state = T.newState(session.seed);
    const result = T.normalizeValue(ran.value, ctx, state);
    // after-the-run facts a mutant invariant may consult (the same shape the recorder computes from a real fixture)
    const gitDir = path.join(canon, '.git');
    const commonFiles = fs.readdirSync(gitDir).filter((n) => /^pt-/.test(n)).sort();
    const auditText = fs.existsSync(audit) && fs.lstatSync(audit).isFile() ? fs.readFileSync(audit, 'utf8') : '';
    const auditEntries = T.normalizeValue(auditText.split('\n').filter(Boolean).map((l) => JSON.parse(l)), ctx, state);
    return { result, oracle: detail, recorded: ran.recorded, kinds: ran.recorded.map((c) => c.kind), calls, after: { commonFiles, audit: auditEntries } };
  } finally {
    for (const k of Object.keys(savedEnv)) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* best effort */ }
    for (const d of tmpTops) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* best effort */ } }
  }
}

module.exports = { withFakeGit, createFake, installLoadHook, classify, subcommandOf, isExplicitlyClassified, snapshotDirs, oracle, oracleDetail, isScoped, runLogic };
