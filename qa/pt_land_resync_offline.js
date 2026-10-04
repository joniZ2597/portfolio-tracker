'use strict';

/*
 * qa/pt_land_resync_offline.js
 *
 * work/second-finisher-resync/brief.md §2 + §6 (RS-1 .. RS-12 plus the S-precondition rows RS-13).
 * Exercises the `resync task/<id>` verb of .claude/hooks/pt-land.js against real git in temp dirs
 * under os.tmpdir() (no network): a bare origin.git, a canonical clone at <tmp>/portfolio-tracker
 * (main + branch-dev, with a committed copy of the tool and qa/guard_integrity_check.js and one
 * brief per task), and linked worktrees <tmp>/pt-wt-worker-a (task/one) and <tmp>/pt-wt-worker-b
 * (task/two) - the slot names the tool's resolveCaller expects.
 *
 * PT_LAND_TOOL_PATH validates a not-yet-applied candidate before the Owner/PROTECTED gate copies it
 * into the DENY-tier path (same override shape as qa/pt_land_offline.js).
 *
 * A separate suite on purpose: qa/pt_land_offline.js (~22 min) stays unchanged.
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TOOL_PATH = process.env.PT_LAND_TOOL_PATH
  ? path.resolve(process.env.PT_LAND_TOOL_PATH)
  : path.join(ROOT, '.claude', 'hooks', 'pt-land.js');
const INTEGRITY_PATH = path.join(ROOT, 'qa', 'guard_integrity_check.js');

let passed = 0;
let failed = 0;
const failures = [];
const MUT_DIRS = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failed += 1;
    failures.push(name + ' -- ' + (e && e.message ? e.message : String(e)));
  }
}

// ── git / fs plumbing ────────────────────────────────────────────────────────────────────
function G(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ' in ' + cwd + ' failed: ' + (r.stderr || r.stdout));
  return String(r.stdout);
}
function GR(args, cwd) { return spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }); }
function W(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function rev(cwd, ref) { return G(['rev-parse', ref], cwd).trim(); }
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function fwd(p) { return String(p).replace(/\\/g, '/'); }
function diffSha(slot) {
  const r = spawnSync('git', ['diff', 'HEAD', '--binary'], { cwd: slot, encoding: 'buffer', windowsHide: true });
  assert.strictEqual(r.status, 0);
  return sha256(r.stdout);
}
// path -> sha256 of every file under dir (the .git file/dir excluded).
function treeHash(dir) {
  const out = {};
  (function walk(d, rel) {
    for (const name of fs.readdirSync(d)) {
      if (rel === '' && name === '.git') continue;
      const abs = path.join(d, name);
      const r = rel ? rel + '/' + name : name;
      if (fs.statSync(abs).isDirectory()) walk(abs, r); else out[r] = sha256(fs.readFileSync(abs));
    }
  })(dir, '');
  return out;
}
function patchIds(cwd, range) {
  const revs = G(['rev-list', '--reverse', range], cwd).split('\n').map((s) => s.trim()).filter(Boolean);
  return revs.map((c) => {
    const dt = spawnSync('git', ['diff-tree', '-p', '--no-commit-id', c], { cwd, encoding: 'buffer', windowsHide: true });
    const pid = spawnSync('git', ['patch-id', '--stable'], { cwd, input: dt.stdout, encoding: 'utf8', windowsHide: true });
    return String(pid.stdout).trim().split(' ')[0];
  });
}
function tmpResyncDirs() { return fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('pt-resync-')).sort(); }
function cleanEnv() {
  const env = {};
  for (const k of Object.keys(process.env)) if (!/^GIT_/i.test(k) && k !== 'NODE_OPTIONS') env[k] = process.env[k];
  return env;
}

const NOW = '2026-10-03T12:00:00.000Z';
const EVIDENCE = 'LAND-EVIDENCE: qa-offline=PASS 53; targeted=PASS; codex-classI-unresolved=0';

// ── fixture ──────────────────────────────────────────────────────────────────────────────
// Canonical branch-dev carries: README/shared/a/b, a .gitignore for the task evidence files, the
// committed tool + integrity module, and a brief (with a land-scope block) for task/one and task/two.
// Slot A is on task/one, slot B on task/two, both created at branch-dev with no commits of their own.
function buildFixture(o) {
  o = o || {};
  const toolSource = o.toolSource || TOOL_PATH;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ptrs-qa-'));
  const bareDir = path.join(tmp, 'origin.git');
  const canon = path.join(tmp, 'portfolio-tracker');
  const slotA = path.join(tmp, 'pt-wt-worker-a');
  const slotB = path.join(tmp, 'pt-wt-worker-b');
  fs.mkdirSync(bareDir, { recursive: true });
  G(['init', '--bare', '-b', 'main', bareDir], tmp);
  fs.mkdirSync(canon, { recursive: true });
  G(['init', '-b', 'main', canon], tmp);
  G(['config', 'user.email', 'test@test.local'], canon);
  G(['config', 'user.name', 'Test'], canon);
  G(['remote', 'add', 'origin', bareDir], canon);
  W(path.join(canon, 'README.md'), 'hello\n');
  W(path.join(canon, 'shared.txt'), 'line1\nline2\nline3\n');
  W(path.join(canon, 'a.txt'), 'a\n');
  W(path.join(canon, 'b.txt'), 'b\n');
  W(path.join(canon, '.gitignore'), 'work/*/plan.md\nwork/*/codex.md\nwork/*/qa.log\n');
  G(['add', '.'], canon);
  G(['commit', '-m', 'init'], canon);
  G(['branch', 'branch-dev'], canon);
  G(['push', 'origin', 'main'], canon);
  G(['push', 'origin', 'branch-dev'], canon);
  G(['checkout', 'branch-dev'], canon);
  fs.mkdirSync(path.join(canon, '.claude', 'hooks'), { recursive: true });
  fs.copyFileSync(toolSource, path.join(canon, '.claude', 'hooks', 'pt-land.js'));
  fs.mkdirSync(path.join(canon, 'qa'), { recursive: true });
  fs.copyFileSync(INTEGRITY_PATH, path.join(canon, 'qa', 'guard_integrity_check.js'));
  G(['add', '.claude/hooks/pt-land.js', 'qa/guard_integrity_check.js'], canon);
  G(['commit', '-m', 'add tool'], canon);
  for (const s of (o.briefs || ['one', 'two'])) {
    W(path.join(canon, 'work', s, 'brief.md'),
      '# brief ' + s + '\n\n<!-- land-scope:begin -->\n- work/' + s + '/foo.txt\n- work/' + s + '/bar.txt\n<!-- land-scope:end -->\n');
    G(['add', 'work/' + s + '/brief.md'], canon);
    G(['commit', '-m', 'brief ' + s], canon);
  }
  G(['push', 'origin', 'branch-dev'], canon);
  const base = rev(canon, 'branch-dev');
  G(['worktree', 'add', '-b', 'task/one', slotA, 'branch-dev'], canon);
  G(['worktree', 'add', '-b', 'task/two', slotB, 'branch-dev'], canon);
  const commonDir = path.join(canon, '.git');

  const fx = {
    tmp, bareDir, canon, slotA, slotB, base, commonDir, task1: 'task/one', task2: 'task/two',
    requireTool() {
      const p = path.join(canon, '.claude', 'hooks', 'pt-land.js');
      delete require.cache[require.resolve(p)];
      return require(p);
    },
    // A task commit in a slot: write the files, stage exactly those, commit.
    commitIn(slot, files, msg) {
      for (const rel of Object.keys(files)) W(path.join(slot, rel), files[rel]);
      G(['add', '--'].concat(Object.keys(files)), slot);
      G(['commit', '-m', msg || 'task commit'], slot);
      return rev(slot, 'HEAD');
    },
    // Another task landing first: a plain commit on canonical branch-dev (test setup, not the tool).
    advanceDev(files, msg) {
      for (const rel of Object.keys(files)) W(path.join(canon, rel), files[rel]);
      G(['add', '--'].concat(Object.keys(files)), canon);
      G(['commit', '-m', msg || 'dev advances'], canon);
      return rev(canon, 'branch-dev');
    },
    resync(task, extra) {
      return fx.requireTool().runResync(Object.assign({ cwd: canon, task, now: NOW }, extra || {}));
    },
    audit() {
      const p = path.join(commonDir, 'pt-land-log');
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    },
    cleanup() { rmrf(tmp); }
  };
  return fx;
}

// Everything a refusal must leave untouched (brief §2: "each refusal changes nothing").
function state(fx) {
  const slotState = (slot) => {
    const sym = GR(['symbolic-ref', '-q', 'HEAD'], slot);
    return {
      head: rev(slot, 'HEAD'), branch: sym.status === 0 ? String(sym.stdout).trim() : null,
      status: G(['status', '--porcelain=v1', '--untracked-files=all'], slot),
      files: treeHash(slot), diff: diffSha(slot)
    };
  };
  const refs = (cwd) => G(['for-each-ref', '--format=%(refname) %(objectname)'], cwd);
  return {
    canonRefs: refs(fx.canon), originRefs: refs(fx.bareDir),
    canonStatus: G(['status', '--porcelain=v1', '--untracked-files=all'], fx.canon),
    canonHead: G(['symbolic-ref', 'HEAD'], fx.canon).trim(),
    slotA: slotState(fx.slotA), slotB: slotState(fx.slotB),
    worktrees: G(['worktree', 'list', '--porcelain'], fx.canon),
    approvals: fs.readdirSync(fx.commonDir).filter((n) => /^pt-.*-approval$/.test(n)).sort(),
    tmpDirs: tmpResyncDirs()
  };
}
function assertUnchanged(fx, before, label) {
  assert.deepStrictEqual(state(fx), before, label || 'a refusal must change nothing');
}

// Mutated copy of the tool source (LF-normalized; every anchor must occur exactly once).
function mutantTool(label, replacements) {
  let src = fs.readFileSync(TOOL_PATH, 'utf8').replace(/\r\n/g, '\n');
  for (const [find, replace] of replacements) {
    const n = src.split(find).length - 1;
    assert.strictEqual(n, 1, 'mutant "' + label + '": anchor found ' + n + ' time(s): ' + find.slice(0, 80));
    src = src.replace(find, () => replace);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptrs-mut-'));
  MUT_DIRS.push(dir);
  const file = path.join(dir, 'pt-land.js');
  fs.writeFileSync(file, src);
  return file;
}

const NO_TOOL_MSG = TOOL_PATH + ' does not exist';
if (!fs.existsSync(TOOL_PATH)) {
  process.stdout.write('  FAIL  ' + NO_TOOL_MSG + '\n');
  process.stdout.write('OFFLINE VALIDATION (pt-land resync): FAIL (0/0)\n');
  process.exit(1);
}

// ── RS-1: Mode F, non-overlapping uncommitted work stays byte-identical ───────────────────
test('RS-1: Mode F with non-overlapping tracked (unstaged + staged) and untracked changes -> HEAD = branch-dev, work byte-identical, audit line, staging loss reported', () => {
  const fx = buildFixture();
  try {
    const dev = fx.advanceDev({ 'dev-only.txt': 'd\n' }, 'another task landed');
    W(path.join(fx.slotB, 'a.txt'), 'a-local\n');
    W(path.join(fx.slotB, 'b.txt'), 'b-staged\n');
    G(['add', 'b.txt'], fx.slotB);
    W(path.join(fx.slotB, 'u1.txt'), 'u1\n');
    W(path.join(fx.slotB, 'sub', 'u2.txt'), 'u2\n');
    const before = treeHash(fx.slotB);
    const diffBefore = diffSha(fx.slotB);
    const r = fx.resync(fx.task2);
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.exitCode, 0);
    assert.strictEqual(r.mode, 'F');
    assert.strictEqual(r.from, fx.base);
    assert.strictEqual(r.to, dev);
    assert.strictEqual(rev(fx.slotB, 'HEAD'), dev, 'slot HEAD = branch-dev');
    assert.strictEqual(G(['symbolic-ref', 'HEAD'], fx.slotB).trim(), 'refs/heads/task/two', 'still on the task branch');
    const after = treeHash(fx.slotB);
    for (const k of Object.keys(before)) assert.strictEqual(after[k], before[k], 'byte-identical: ' + k);
    assert.deepStrictEqual(Object.keys(after).filter((k) => !(k in before)), ['dev-only.txt'], 'only the new base file appears');
    assert.strictEqual(diffSha(fx.slotB), diffBefore, 'git diff HEAD --binary hash is identical');
    assert.deepStrictEqual(r.stagedLost, ['b.txt'], 'the path whose staging reset --keep dropped is reported');
    const last = fx.audit().pop();
    assert.deepStrictEqual(
      { verb: last.verb, task: last.task, mode: last.mode, from: last.from, to: last.to, base: last.base, result: last.result },
      { verb: 'resync', task: 'task/two', mode: 'F', from: fx.base, to: dev, base: dev, result: 'ok' });
  } finally { fx.cleanup(); }
});

test('RS-1b: Mode F run from the task\'s own slot behaves the same', () => {
  const fx = buildFixture();
  try {
    const dev = fx.advanceDev({ 'dev-only.txt': 'd\n' });
    W(path.join(fx.slotB, 'u1.txt'), 'u1\n');
    const r = fx.requireTool().runResync({ cwd: fx.slotB, task: fx.task2, now: NOW });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(rev(fx.slotB, 'HEAD'), dev);
    assert.strictEqual(fs.readFileSync(path.join(fx.slotB, 'u1.txt'), 'utf8'), 'u1\n');
  } finally { fx.cleanup(); }
});

// ── RS-2: Mode F overlap -> refused, nothing changed ──────────────────────────────────────
(function rs2() {
  const shapes = [
    ['an unstaged edit of a file the new base changed', (fx) => W(path.join(fx.slotB, 'a.txt'), 'a-local\n')],
    ['a staged edit of a file the new base changed', (fx) => { W(path.join(fx.slotB, 'a.txt'), 'a-staged\n'); G(['add', 'a.txt'], fx.slotB); }],
    ['an untracked file where the new base adds a tracked file', (fx) => W(path.join(fx.slotB, 'new.txt'), 'mine\n')],
    ['a local edit identical to the new base content', (fx) => W(path.join(fx.slotB, 'a.txt'), 'a-dev\n')]
  ];
  for (const [label, mutate] of shapes) {
    test('RS-2: Mode F with ' + label + ' -> refused "uncommitted work overlaps the new base", nothing changed', () => {
      const fx = buildFixture();
      try {
        fx.advanceDev({ 'a.txt': 'a-dev\n', 'new.txt': 'new-dev\n' });
        mutate(fx);
        const before = state(fx);
        const r = fx.resync(fx.task2);
        assert.strictEqual(r.ok, false, JSON.stringify(r));
        assert.strictEqual(r.exitCode, 1);
        assert.match(r.reason, /F2: uncommitted work overlaps the new base/);
        assertUnchanged(fx, before);
        const last = fx.audit().pop();
        assert.strictEqual(last.result, 'refuse');
        assert.strictEqual(last.mode, 'F');
      } finally { fx.cleanup(); }
    });
  }
})();

// ── RS-3: Mode R clean replay ─────────────────────────────────────────────────────────────
test('RS-3: Mode R clean replay -> new tip descends from branch-dev, patch-ids equal in order, slot clean, ignored files kept, temp worktree gone', () => {
  const fx = buildFixture();
  try {
    const t1 = fx.commitIn(fx.slotB, { 'work/two/foo.txt': 'foo\n' }, 'task commit 1');
    const t2 = fx.commitIn(fx.slotB, { 'work/two/bar.txt': 'bar\n' }, 'task commit 2');
    W(path.join(fx.slotB, 'work', 'two', 'plan.md'), 'ignored evidence\n');
    const dev = fx.advanceDev({ 'dev-only.txt': 'd\n' }, 'another task landed');
    const oldIds = patchIds(fx.canon, fx.base + '..' + t2);
    const tmpBefore = tmpResyncDirs();
    const r = fx.resync(fx.task2);
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.mode, 'R');
    assert.strictEqual(r.from, t2);
    assert.strictEqual(r.base, dev);
    assert.notStrictEqual(r.to, t2);
    assert.strictEqual(rev(fx.slotB, 'HEAD'), r.to, 'slot HEAD = the new tip');
    assert.strictEqual(G(['symbolic-ref', 'HEAD'], fx.slotB).trim(), 'refs/heads/task/two');
    assert.strictEqual(rev(fx.canon, 'task/two'), r.to, 'the task ref moved');
    assert.strictEqual(GR(['merge-base', '--is-ancestor', dev, r.to], fx.canon).status, 0, 'new tip descends from branch-dev');
    assert.strictEqual(G(['rev-list', '--count', dev + '..' + r.to], fx.canon).trim(), '2', 'same commit count');
    assert.deepStrictEqual(patchIds(fx.canon, dev + '..' + r.to), oldIds, 'patch-ids equal and in order');
    assert.strictEqual(G(['rev-list', '--merges', dev + '..' + r.to], fx.canon).trim(), '', 'no merge commits');
    assert.strictEqual(G(['status', '--porcelain=v1', '--untracked-files=all'], fx.slotB), '', 'slot clean at the new tip');
    assert.strictEqual(fs.readFileSync(path.join(fx.slotB, 'work', 'two', 'plan.md'), 'utf8'), 'ignored evidence\n', 'ignored evidence kept');
    assert.strictEqual(G(['show', '-s', '--format=%s', r.to + '~1'], fx.canon).trim(), 'task commit 1');
    assert.strictEqual(rev(fx.canon, r.to + ':work/two/brief.md'), rev(fx.canon, dev + ':work/two/brief.md'), 'brief blob equals branch-dev\'s');
    assert.ok(t1 !== r.to);
    assert.deepStrictEqual(G(['worktree', 'list'], fx.canon).trim().split('\n').length, 3, 'canonical + two slots only');
    assert.deepStrictEqual(tmpResyncDirs(), tmpBefore, 'no temp worktree directory left behind');
    const last = fx.audit().pop();
    assert.deepStrictEqual(
      { verb: last.verb, task: last.task, mode: last.mode, from: last.from, to: last.to, base: last.base, result: last.result },
      { verb: 'resync', task: 'task/two', mode: 'R', from: t2, to: r.to, base: dev, result: 'ok' });
  } finally { fx.cleanup(); }
});

test('RS-3b: Mode R where the replay would change the commit set (a task change already on branch-dev) -> refused R4, nothing changed', () => {
  const fx = buildFixture();
  try {
    fx.commitIn(fx.slotB, { 'a.txt': 'same\n' }, 'task commit 1 (also lands on dev)');
    fx.commitIn(fx.slotB, { 'work/two/foo.txt': 'foo\n' }, 'task commit 2');
    fx.advanceDev({ 'a.txt': 'same\n' }, 'dev has the identical change');
    const before = state(fx);
    const r = fx.resync(fx.task2);
    assert.strictEqual(r.ok, false, JSON.stringify(r));
    assert.match(r.reason, /R4:/);
    assertUnchanged(fx, before);
  } finally { fx.cleanup(); }
});

// ── RS-4: Mode R conflict ─────────────────────────────────────────────────────────────────
test('RS-4: Mode R conflict -> refused; slot, task ref and branch-dev untouched; temp worktree gone', () => {
  const fx = buildFixture();
  try {
    fx.commitIn(fx.slotB, { 'shared.txt': 'line1\nTASK\nline3\n' }, 'task edits shared.txt');
    fx.advanceDev({ 'shared.txt': 'line1\nDEV\nline3\n' }, 'dev edits shared.txt');
    const before = state(fx);
    const r = fx.resync(fx.task2);
    assert.strictEqual(r.ok, false, JSON.stringify(r));
    assert.match(r.reason, /R3: conflict/);
    assertUnchanged(fx, before);
    assert.strictEqual(G(['status', '--porcelain=v1'], fx.canon), '', 'canonical checkout untouched');
    const last = fx.audit().pop();
    assert.strictEqual(last.result, 'refuse');
    assert.strictEqual(last.mode, 'R');
  } finally { fx.cleanup(); }
});

// The removal call, used by RS-4b and MUT-RS-7 (a failed removal is simulated by dropping it).
const REMOVE_TEMP_ANCHOR = 'removeTempWorktree(G, canonicalRoot, tmpParent, wt);';
test('RS-4b (R6): a temporary worktree that could not be removed is surfaced on a REFUSAL too, not lost behind the conflict reason', () => {
  const mutSrc = mutantTool('RS-4b', [[REMOVE_TEMP_ANCHOR, '']]);
  const tmpBefore = tmpResyncDirs();
  const fx = buildFixture({ toolSource: mutSrc });
  try {
    fx.commitIn(fx.slotB, { 'shared.txt': 'line1\nTASK\nline3\n' });
    fx.advanceDev({ 'shared.txt': 'line1\nDEV\nline3\n' });
    const r = fx.resync(fx.task2);
    assert.strictEqual(r.ok, false, JSON.stringify(r));
    assert.match(r.reason, /R3: conflict/);
    assert.match(r.reason, /WARNING: the temporary worktree .* could not be removed/);
  } finally {
    fx.cleanup();
    for (const n of tmpResyncDirs().filter((d) => tmpBefore.indexOf(d) === -1)) rmrf(path.join(os.tmpdir(), n));
  }
  // control: with the removal in place the refusal carries no warning
  const fx2 = buildFixture();
  try {
    fx2.commitIn(fx2.slotB, { 'shared.txt': 'line1\nTASK\nline3\n' });
    fx2.advanceDev({ 'shared.txt': 'line1\nDEV\nline3\n' });
    const r2 = fx2.resync(fx2.task2);
    assert.strictEqual(r2.ok, false);
    assert.doesNotMatch(r2.reason, /WARNING/);
  } finally { fx2.cleanup(); }
});

// ── RS-5: Mode R dirty slot ───────────────────────────────────────────────────────────────
(function rs5() {
  const shapes = [
    ['a tracked edit', (fx) => W(path.join(fx.slotB, 'b.txt'), 'b-local\n')],
    ['an untracked file', (fx) => W(path.join(fx.slotB, 'untracked.txt'), 'u\n')]
  ];
  for (const [label, mutate] of shapes) {
    test('RS-5: Mode R with a dirty slot (' + label + ') -> refused R1, nothing changed', () => {
      const fx = buildFixture();
      try {
        fx.commitIn(fx.slotB, { 'work/two/foo.txt': 'foo\n' });
        fx.advanceDev({ 'dev-only.txt': 'd\n' });
        mutate(fx);
        const before = state(fx);
        const r = fx.resync(fx.task2);
        assert.strictEqual(r.ok, false, JSON.stringify(r));
        assert.match(r.reason, /R1: the slot is not clean/);
        assertUnchanged(fx, before);
      } finally { fx.cleanup(); }
    });
  }
})();

// ── RS-6: PROTECTED-approved tasks stay with the Owner (R-4) ──────────────────────────────
test('RS-6: a task commit touching a protected path -> refused R2, nothing changed', () => {
  const fx = buildFixture();
  try {
    fx.commitIn(fx.slotB, { 'AGENTS.md': 'protected change\n' }, 'task touches AGENTS.md');
    fx.advanceDev({ 'dev-only.txt': 'd\n' });
    const before = state(fx);
    const r = fx.resync(fx.task2);
    assert.strictEqual(r.ok, false, JSON.stringify(r));
    assert.match(r.reason, /R2: a task commit touches a protected path \(AGENTS\.md\)/);
    assertUnchanged(fx, before);
  } finally { fx.cleanup(); }
});
test('RS-6: a protected-commit audit entry for the task -> refused R2, nothing changed', () => {
  const fx = buildFixture();
  try {
    fx.commitIn(fx.slotB, { 'work/two/foo.txt': 'foo\n' });
    fx.advanceDev({ 'dev-only.txt': 'd\n' });
    fs.appendFileSync(path.join(fx.commonDir, 'pt-land-log'),
      JSON.stringify({ ts: NOW, verb: 'protected-commit', task: 'task/two', from: fx.base, to: fx.base, tree: fx.base, result: 'ok' }) + '\n');
    const before = state(fx);
    const r = fx.resync(fx.task2);
    assert.strictEqual(r.ok, false, JSON.stringify(r));
    assert.match(r.reason, /R2: .*protected-commit/);
    assertUnchanged(fx, before);
  } finally { fx.cleanup(); }
});

// ── RS-7: already up to date ──────────────────────────────────────────────────────────────
test('RS-7: branch-dev already an ancestor of the task tip -> "already up to date", exit 0, nothing changed (no audit line)', () => {
  const fx = buildFixture();
  try {
    fx.commitIn(fx.slotB, { 'work/two/foo.txt': 'foo\n' });
    const before = state(fx);
    const auditBefore = fx.audit().length;
    const r = fx.resync(fx.task2);
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.exitCode, 0);
    assert.strictEqual(r.mode, 'none');
    assert.match(r.message, /already up to date/);
    assertUnchanged(fx, before);
    assert.strictEqual(fx.audit().length, auditBefore, 'nothing was written');
  } finally { fx.cleanup(); }
});

// ── RS-8: refs, approvals and the remote are never touched ────────────────────────────────
test('RS-8: after Mode F and Mode R, refs main / branch-dev / origin/* are byte-identical, no approval record, no remote change', () => {
  for (const mode of ['F', 'R']) {
    const fx = buildFixture();
    try {
      if (mode === 'R') fx.commitIn(fx.slotB, { 'work/two/foo.txt': 'foo\n' });
      fx.advanceDev({ 'dev-only.txt': 'd\n' });
      const pick = (s) => ({
        main: rev(fx.canon, 'refs/heads/main'), dev: rev(fx.canon, 'refs/heads/branch-dev'),
        originMain: rev(fx.canon, 'refs/remotes/origin/main'), originDev: rev(fx.canon, 'refs/remotes/origin/branch-dev'),
        bare: G(['for-each-ref', '--format=%(refname) %(objectname)'], fx.bareDir), taskOne: rev(fx.canon, 'refs/heads/task/one'),
        approvals: fs.readdirSync(fx.commonDir).filter((n) => /^pt-.*-approval$/.test(n)).sort(), tags: G(['tag'], fx.canon)
      });
      const before = pick();
      const r = fx.resync(fx.task2);
      assert.strictEqual(r.ok, true, mode + ': ' + JSON.stringify(r));
      assert.deepStrictEqual(pick(), before, mode + ': protected refs, remote and approvals unchanged');
      assert.ok(!fs.existsSync(path.join(fx.commonDir, 'pt-land.lock')), mode + ': lock released');
      assert.strictEqual(G(['status', '--porcelain=v1'], fx.canon), '', mode + ': canonical clean');
    } finally { fx.cleanup(); }
  }
});

// ── RS-9: hooks are never executed ────────────────────────────────────────────────────────
function plantHooks(fx) {
  const marker = fwd(path.join(fx.tmp, 'hook-ran.txt'));
  for (const name of ['post-checkout', 'pre-rebase', 'post-rewrite', 'reference-transaction']) {
    const p = path.join(fx.commonDir, 'hooks', name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '#!/bin/sh\necho ' + name + ' >> "' + marker + '"\nexit 0\n', { mode: 0o755 });
  }
  return marker;
}
test('RS-9: a planted git hook is not executed (the tool refuses a hooks directory outright)', () => {
  const fx = buildFixture();
  try {
    fx.commitIn(fx.slotB, { 'work/two/foo.txt': 'foo\n' });
    fx.advanceDev({ 'dev-only.txt': 'd\n' });
    const marker = plantHooks(fx);
    const r = fx.resync(fx.task2);
    assert.strictEqual(r.ok, false, JSON.stringify(r));
    assert.match(r.reason, /S1: non-sample git hooks are installed/);
    assert.ok(!fs.existsSync(marker), 'no hook ran');
  } finally { fx.cleanup(); }
});

// ── RS-10: operation in progress, lock held ───────────────────────────────────────────────
test('RS-10: a rebase in progress in the slot -> refused S3, nothing changed', () => {
  for (const marker of ['rebase-merge', 'rebase-apply']) {
    const fx = buildFixture();
    try {
      fx.advanceDev({ 'dev-only.txt': 'd\n' });
      const gp = G(['rev-parse', '--git-path', marker], fx.slotB).trim();
      fs.mkdirSync(path.resolve(fx.slotB, gp), { recursive: true });
      const before = state(fx);
      const r = fx.resync(fx.task2);
      assert.strictEqual(r.ok, false, marker + ': ' + JSON.stringify(r));
      assert.match(r.reason, /S3: .*in progress/);
      assertUnchanged(fx, before, marker);
    } finally { fx.cleanup(); }
  }
});
test('RS-10: a merge or cherry-pick in progress in the slot -> refused S3', () => {
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD']) {
    const fx = buildFixture();
    try {
      fx.advanceDev({ 'dev-only.txt': 'd\n' });
      const gp = G(['rev-parse', '--git-path', marker], fx.slotB).trim();
      fs.writeFileSync(path.resolve(fx.slotB, gp), fx.base + '\n');
      const r = fx.resync(fx.task2);
      assert.strictEqual(r.ok, false, marker + ': ' + JSON.stringify(r));
      assert.match(r.reason, /S3: .*in progress/);
      assert.strictEqual(rev(fx.canon, 'task/two'), fx.base, marker + ': task ref unchanged');
    } finally { fx.cleanup(); }
  }
});
test('RS-10: the tool lock held -> refused, the lock file is left untouched, nothing changed', () => {
  const fx = buildFixture();
  try {
    fx.advanceDev({ 'dev-only.txt': 'd\n' });
    const lock = path.join(fx.commonDir, 'pt-land.lock');
    fs.writeFileSync(lock, 'held');
    const before = state(fx);
    const r = fx.resync(fx.task2);
    assert.strictEqual(r.ok, false, JSON.stringify(r));
    assert.match(r.reason, /S3: .*lock/);
    assert.strictEqual(fs.readFileSync(lock, 'utf8'), 'held', 'a lock the tool does not own is never removed');
    assertUnchanged(fx, before);
  } finally { fx.cleanup(); }
});

// ── RS-11: end to end ─────────────────────────────────────────────────────────────────────
test('RS-11: task 1 lands; task 2 land-request refuses Second LAND; resync; land-request + land fast-forward task 2', () => {
  const fx = buildFixture();
  try {
    for (const [slot, short] of [[fx.slotA, 'one'], [fx.slotB, 'two']]) {
      W(path.join(slot, 'work', short, 'foo.txt'), 'impl ' + short + '\n');
      W(path.join(slot, 'work', short, 'review.md'), '# review\n\n' + EVIDENCE + '\n');
      G(['add', '--', 'work/' + short + '/foo.txt', 'work/' + short + '/review.md'], slot);
      G(['commit', '-m', 'impl ' + short], slot);
    }
    const tip1 = rev(fx.slotA, 'HEAD');
    const TOOL = fx.requireTool();
    fs.writeFileSync(path.join(fx.commonDir, 'pt-land-approval'), 'LAND task/one ' + tip1 + ' ' + fx.base + '\n');
    const landed = TOOL.runLand({ cwd: fx.slotA, task: fx.task1 });
    assert.strictEqual(landed.ok, true, JSON.stringify(landed));
    assert.strictEqual(rev(fx.canon, 'branch-dev'), tip1);

    const stuck = TOOL.runLandRequest({ cwd: fx.slotB, task: fx.task2 });
    assert.strictEqual(stuck.ok, false);
    assert.match(stuck.reason, /Second LAND/);

    const r = fx.resync(fx.task2);
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.mode, 'R');
    assert.strictEqual(GR(['merge-base', '--is-ancestor', tip1, r.to], fx.canon).status, 0);

    const req = TOOL.runLandRequest({ cwd: fx.slotB, task: fx.task2 });
    assert.strictEqual(req.ok, true, JSON.stringify(req));
    assert.strictEqual(req.report.tip, r.to);
    assert.strictEqual(req.report.base, tip1);
    fs.writeFileSync(path.join(fx.commonDir, 'pt-land-approval'), 'LAND task/two ' + r.to + ' ' + tip1 + '\n');
    const done = TOOL.runLand({ cwd: fx.slotB, task: fx.task2 });
    assert.strictEqual(done.ok, true, JSON.stringify(done));
    assert.strictEqual(rev(fx.canon, 'branch-dev'), r.to, 'task 2 fast-forwarded into branch-dev');
    assert.strictEqual(G(['status', '--porcelain=v1'], fx.canon), '');
  } finally { fx.cleanup(); }
});

// ── RS-12: printed integrity parameters ───────────────────────────────────────────────────
test('RS-12: the printed --base-dev equals the post-resync branch-dev OID and --since equals the resync time (module result, audit line and CLI text)', () => {
  const fx = buildFixture();
  try {
    fx.commitIn(fx.slotB, { 'work/two/foo.txt': 'foo\n' });
    const dev = fx.advanceDev({ 'dev-only.txt': 'd\n' });
    const mainOid = rev(fx.canon, 'refs/heads/main');
    const r = fx.resync(fx.task2);
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.resyncTime, NOW);
    assert.strictEqual(r.integrity.baseMain, mainOid);
    assert.strictEqual(r.integrity.baseDev, dev);
    assert.strictEqual(r.integrity.task, 'task/two');
    assert.strictEqual(r.integrity.since, NOW);
    assert.strictEqual(fwd(r.integrity.root).toLowerCase(), fwd(fx.canon).toLowerCase());
    assert.strictEqual(fx.audit().pop().ts, NOW, 'the audit timestamp is the resync time');
    assert.strictEqual(rev(fx.canon, 'branch-dev'), dev, 'branch-dev was not moved');
  } finally { fx.cleanup(); }

  const fx2 = buildFixture();
  try {
    fx2.commitIn(fx2.slotB, { 'work/two/foo.txt': 'foo\n' });
    const dev2 = fx2.advanceDev({ 'dev-only.txt': 'd\n' });
    const t0 = Date.now();
    const cli = spawnSync(process.execPath, [path.join(fx2.canon, '.claude', 'hooks', 'pt-land.js'), 'resync', 'task/two'],
      { cwd: fx2.canon, env: cleanEnv(), encoding: 'utf8', windowsHide: true });
    assert.strictEqual(cli.status, 0, cli.stdout + cli.stderr);
    const baseDev = /--base-dev (\S+)/.exec(cli.stdout);
    const since = /--since (\S+)/.exec(cli.stdout);
    assert.ok(baseDev && since, 'the output prints the integrity parameters: ' + cli.stdout);
    assert.strictEqual(baseDev[1], dev2);
    assert.strictEqual(since[1], fx2.audit().pop().ts, 'printed --since is the audit timestamp');
    assert.ok(Date.parse(since[1]) >= t0 - 2000 && Date.parse(since[1]) <= Date.now() + 2000, 'a real timestamp');
    assert.match(cli.stdout, /mode R/);
    assert.ok(cli.stdout.indexOf(rev(fx2.canon, 'task/two')) !== -1, 'prints the new tip');
  } finally { fx2.cleanup(); }
});

// ── RS-13: S-preconditions (each refusal changes nothing) ─────────────────────────────────
(function rs13() {
  function refusal(label, setup, expectRe, callOpts) {
    test('RS-13: ' + label + ' -> refused ' + expectRe.source + ', nothing changed', () => {
      const fx = buildFixture();
      try {
        fx.advanceDev({ 'dev-only.txt': 'd\n' });
        const extra = setup(fx) || {};
        const before = state(fx);
        const r = fx.requireTool().runResync(Object.assign({ cwd: fx.canon, task: fx.task2, now: NOW }, callOpts || {}, extra));
        assert.strictEqual(r.ok, false, JSON.stringify(r));
        assert.match(r.reason, expectRe);
        assertUnchanged(fx, before);
      } finally { fx.cleanup(); }
    });
  }
  for (const key of ['GIT_DIR', 'GIT_CONFIG_COUNT']) {
    test('RS-13: session environment ' + key + ' set -> refused S1, nothing changed', () => {
      const fx = buildFixture();
      const saved = process.env[key];
      try {
        fx.advanceDev({ 'dev-only.txt': 'd\n' });
        const before = state(fx);
        process.env[key] = 'x';
        let r;
        try { r = fx.resync(fx.task2); } finally { if (saved === undefined) delete process.env[key]; else process.env[key] = saved; }
        assert.strictEqual(r.ok, false, JSON.stringify(r));
        assert.match(r.reason, /S1:/);
        assertUnchanged(fx, before);
      } finally { fx.cleanup(); }
    });
  }
  refusal('core.hooksPath configured', (fx) => { G(['config', 'core.hooksPath', fwd(path.join(fx.tmp, 'h'))], fx.canon); }, /S1: protected git config/);
  refusal('the running tool differs from the branch-dev blob', (fx) => {
    fs.appendFileSync(path.join(fx.canon, '.claude', 'hooks', 'pt-land.js'), '\n// tampered\n');
  }, /S1: self-integrity/);
  refusal('the canonical checkout is dirty', (fx) => { W(path.join(fx.canon, 'untracked.txt'), 'x\n'); }, /S2:/);
  refusal('the canonical checkout is not on branch-dev', (fx) => { G(['checkout', '-b', 'other-dev'], fx.canon); }, /S2:/);
  refusal('the task branch does not exist', () => ({ task: 'task/nope' }), /S3:/);
  refusal('the task branch is checked out in no slot', (fx) => {
    G(['branch', 'task/three', 'branch-dev'], fx.canon);
    return { task: 'task/three' };
  }, /S3: .*slot/);
  refusal('the task branch is checked out in a worktree that is not a Worker slot', (fx) => {
    G(['worktree', 'add', '-b', 'task/four', path.join(fx.tmp, 'some-other-tree'), 'branch-dev'], fx.canon);
    return { task: 'task/four' };
  }, /S3: .*slot/);
  refusal('called from the other Worker\'s slot (cwd slot is on a different task)', (fx) => ({ cwd: fx.slotA }), /S1: .*task\/two/);
  test('RS-13: work/<id>/brief.md missing at branch-dev (Worker slot available) -> refused S4', () => {
    const fx = buildFixture({ briefs: ['one'] });
    try {
      fx.advanceDev({ 'dev-only.txt': 'd\n' });
      const before = state(fx);
      const r = fx.resync(fx.task2);
      assert.strictEqual(r.ok, false, JSON.stringify(r));
      assert.match(r.reason, /S4:/);
      assertUnchanged(fx, before);
    } finally { fx.cleanup(); }
  });
  test('RS-13: a malformed task name is a usage error (exit 3), nothing touched', () => {
    const fx = buildFixture();
    try {
      for (const bad of ['branch-dev', 'task/', 'task/x y', '', undefined]) {
        const r = fx.requireTool().runResync({ cwd: fx.canon, task: bad });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.exitCode, 3, String(bad));
      }
    } finally { fx.cleanup(); }
  });
})();

// ── planted negatives: each mutates the PRODUCTION tool; the real tool passes the same scenario ──
function mutantRow(name, replacements, scenario) {
  test(name, () => {
    const mutSrc = mutantTool(name, replacements);
    const real = scenario(TOOL_PATH);
    const mutant = scenario(mutSrc);
    assert.strictEqual(real, true, 'the unmutated tool must satisfy the invariant: ' + real);
    assert.notStrictEqual(mutant, true, 'the mutant must violate the invariant (it was not caught)');
  });
}
// scenario helpers return true when the invariant holds, otherwise a short description of the violation.
function modeFWork(toolSource) {
  const fx = buildFixture({ toolSource });
  try {
    fx.advanceDev({ 'dev-only.txt': 'd\n' });
    W(path.join(fx.slotB, 'a.txt'), 'a-local\n');
    W(path.join(fx.slotB, 'u1.txt'), 'u1\n');
    const before = treeHash(fx.slotB);
    const r = fx.resync(fx.task2);
    if (!r.ok) return 'refused: ' + r.reason;
    const after = treeHash(fx.slotB);
    for (const k of Object.keys(before)) if (after[k] !== before[k]) return 'work not preserved: ' + k;
    return true;
  } finally { fx.cleanup(); }
}
function modeFOverlap(toolSource) {
  const fx = buildFixture({ toolSource });
  try {
    fx.advanceDev({ 'a.txt': 'a-dev\n' });
    W(path.join(fx.slotB, 'a.txt'), 'a-local\n');
    const r = fx.resync(fx.task2);
    if (r.ok) return 'overlap accepted';
    return rev(fx.slotB, 'HEAD') === fx.base && fs.readFileSync(path.join(fx.slotB, 'a.txt'), 'utf8') === 'a-local\n' ? true : 'refused but changed';
  } finally { fx.cleanup(); }
}
function modeRProtected(toolSource) {
  const fx = buildFixture({ toolSource });
  try {
    fx.commitIn(fx.slotB, { 'AGENTS.md': 'x\n' });
    fx.advanceDev({ 'dev-only.txt': 'd\n' });
    const r = fx.resync(fx.task2);
    return r.ok ? 'protected-path task replayed' : true;
  } finally { fx.cleanup(); }
}
function modeRAuditProtected(toolSource) {
  const fx = buildFixture({ toolSource });
  try {
    fx.commitIn(fx.slotB, { 'work/two/foo.txt': 'foo\n' });
    fx.advanceDev({ 'dev-only.txt': 'd\n' });
    fs.appendFileSync(path.join(fx.commonDir, 'pt-land-log'),
      JSON.stringify({ ts: NOW, verb: 'protected-commit', task: 'task/two', from: fx.base, to: fx.base, tree: fx.base, result: 'ok' }) + '\n');
    return fx.resync(fx.task2).ok ? 'PROTECTED-approved task replayed' : true;
  } finally { fx.cleanup(); }
}
function modeRUpstream(toolSource) {
  const fx = buildFixture({ toolSource });
  try {
    fx.commitIn(fx.slotB, { 'a.txt': 'same\n' });
    fx.commitIn(fx.slotB, { 'work/two/foo.txt': 'foo\n' });
    fx.advanceDev({ 'a.txt': 'same\n' });
    const before = rev(fx.canon, 'task/two');
    const r = fx.resync(fx.task2);
    return r.ok ? 'a replay that dropped a commit was accepted' : (rev(fx.canon, 'task/two') === before ? true : 'refused but task ref moved');
  } finally { fx.cleanup(); }
}
function modeRDirty(toolSource) {
  const fx = buildFixture({ toolSource });
  try {
    fx.commitIn(fx.slotB, { 'work/two/foo.txt': 'foo\n' });
    fx.advanceDev({ 'dev-only.txt': 'd\n' });
    W(path.join(fx.slotB, 'b.txt'), 'b-local\n');
    const tipBefore = rev(fx.canon, 'task/two');
    const r = fx.resync(fx.task2);
    if (r.ok) return 'dirty slot accepted';
    // R1 must refuse BEFORE anything moves; a later verification failing after the move does not count.
    return rev(fx.canon, 'task/two') === tipBefore && !/R5/.test(r.reason) ? true : 'refused only after the task ref moved: ' + r.reason;
  } finally { fx.cleanup(); }
}
function modeRConflict(toolSource) {
  const fx = buildFixture({ toolSource });
  try {
    fx.commitIn(fx.slotB, { 'shared.txt': 'line1\nTASK\nline3\n' });
    fx.advanceDev({ 'shared.txt': 'line1\nDEV\nline3\n' });
    const tmpBefore = tmpResyncDirs();
    const r = fx.resync(fx.task2);
    if (r.ok) return 'conflict accepted';
    const wtCount = G(['worktree', 'list'], fx.canon).trim().split('\n').length;
    const leaked = tmpResyncDirs().filter((n) => tmpBefore.indexOf(n) === -1);
    for (const n of leaked) rmrf(path.join(os.tmpdir(), n)); // a mutant's leftover must not outlive the suite
    if (wtCount !== 3) return 'temp worktree still registered (' + wtCount + ' worktrees)';
    if (leaked.length) return 'temp directory leaked: ' + leaked.join(',');
    return true;
  } finally { fx.cleanup(); }
}
function modeNone(toolSource) {
  const fx = buildFixture({ toolSource });
  try {
    fx.commitIn(fx.slotB, { 'work/two/foo.txt': 'foo\n' });
    const r = fx.resync(fx.task2);
    return r.ok && r.mode === 'none' && fx.audit().length === 0 ? true : 'not a no-op: ' + JSON.stringify({ ok: r.ok, mode: r.mode, audit: fx.audit().length });
  } finally { fx.cleanup(); }
}
function lockHeld(toolSource) {
  const fx = buildFixture({ toolSource });
  try {
    fx.advanceDev({ 'dev-only.txt': 'd\n' });
    fs.writeFileSync(path.join(fx.commonDir, 'pt-land.lock'), 'held');
    return fx.resync(fx.task2).ok ? 'ran while the lock was held' : true;
  } finally { fx.cleanup(); }
}
function briefMissing(toolSource) {
  const fx = buildFixture({ toolSource, briefs: ['one'] });
  try {
    fx.advanceDev({ 'dev-only.txt': 'd\n' });
    return fx.resync(fx.task2).ok ? 'ran without a brief at branch-dev' : true;
  } finally { fx.cleanup(); }
}
function canonDirty(toolSource) {
  const fx = buildFixture({ toolSource });
  try {
    fx.advanceDev({ 'dev-only.txt': 'd\n' });
    W(path.join(fx.canon, 'untracked.txt'), 'x\n');
    return fx.resync(fx.task2).ok ? 'ran with a dirty canonical checkout' : true;
  } finally { fx.cleanup(); }
}
function selfTampered(toolSource) {
  const fx = buildFixture({ toolSource });
  try {
    fx.advanceDev({ 'dev-only.txt': 'd\n' });
    fs.appendFileSync(path.join(fx.canon, '.claude', 'hooks', 'pt-land.js'), '\n// tampered\n');
    const r = fx.resync(fx.task2);
    return /S1: self-integrity/.test(r.reason || '') ? true : 'self-integrity not enforced: ' + JSON.stringify(r);
  } finally { fx.cleanup(); }
}
function hooksNotRun(toolSource) {
  const fx = buildFixture({ toolSource });
  try {
    fx.commitIn(fx.slotB, { 'work/two/foo.txt': 'foo\n' });
    fx.advanceDev({ 'dev-only.txt': 'd\n' });
    const marker = plantHooks(fx);
    fx.resync(fx.task2);
    return fs.existsSync(marker) ? 'a hook ran: ' + fs.readFileSync(marker, 'utf8').trim().replace(/\n/g, ',') : true;
  } finally { fx.cleanup(); }
}
function refsAndApprovals(toolSource) {
  const fx = buildFixture({ toolSource });
  try {
    fx.advanceDev({ 'dev-only.txt': 'd\n' });
    const dev = rev(fx.canon, 'branch-dev');
    const r = fx.resync(fx.task2);
    if (!r.ok) return 'refused: ' + r.reason;
    if (fs.readdirSync(fx.commonDir).some((n) => /^pt-.*-approval$/.test(n))) return 'an approval record was written';
    if (rev(fx.canon, 'branch-dev') !== dev) return 'branch-dev moved';
    return true;
  } finally { fx.cleanup(); }
}

mutantRow('MUT-RS-1: reset --keep replaced by --hard -> uncommitted work is overwritten and an overlap is accepted (caught by RS-1 / RS-2)',
  [["['reset', '--keep', oid]", "['reset', '--hard', oid]"]], (src) => {
    const a = modeFWork(src), b = modeFOverlap(src);
    return a === true && b === true ? true : (a !== true ? a : b);
  });
mutantRow('MUT-RS-2: the protected-path check dropped -> a task touching AGENTS.md is replayed (caught by RS-6)',
  [["if (protectedHit !== undefined) return refuse('R2', 'a task commit touches a protected path (' + protectedHit + ')', tip, null, dev);", '']], modeRProtected);
mutantRow('MUT-RS-2b: the protected-commit audit check dropped -> a PROTECTED-approved task is replayed (caught by RS-6)',
  [["if (hasProtectedCommit) return refuse('R2', 'the audit log has a protected-commit entry for this task', tip, null, dev);", '']], modeRAuditProtected);
mutantRow('MUT-RS-3: the R4 verification dropped -> a replay that dropped a commit is accepted (caught by RS-3b)',
  [["if (!r4.ok) return refuse('R4', r4.reason, tip, null, dev);", '']], modeRUpstream);
mutantRow('MUT-RS-4: the R1 clean-slot check dropped -> a dirty slot is replayed (caught by RS-5)',
  [["if (String(stR1.stdout).trim()) return refuse('R1', 'the slot is not clean', tip, null, dev);", '']], modeRDirty);
mutantRow('MUT-RS-5: the up-to-date short-circuit dropped -> a current task is replayed and audited (caught by RS-7)',
  [["if (upToDate.status === 0) return { ok: true, exitCode: 0, verb: 'resync', mode: 'none', task, from: tip, to: tip, base: dev, message: 'already up to date: ' + task + ' contains branch-dev ' + dev };", '']], modeNone);
mutantRow('MUT-RS-6: the hooks-clean refusal AND the core.hooksPath override both dropped -> a planted hook runs (caught by RS-9); with only the refusal dropped the override still keeps hooks silent',
  [["if (!hooks.ok) return refuse('S1', hooks.reason);", ''],
    ["const hooksOverride = ['-c', 'core.hooksPath=' + toForwardSlash(hooksDir)];", 'const hooksOverride = [];']], hooksNotRun);
test('MUT-RS-6b: with ONLY the hooks-clean refusal dropped the hooksPath override still keeps a planted hook from running', () => {
  const mutSrc = mutantTool('MUT-RS-6b', [["if (!hooks.ok) return refuse('S1', hooks.reason);", '']]);
  assert.strictEqual(hooksNotRun(mutSrc), true);
});
mutantRow('MUT-RS-7: temp worktree removal dropped -> a conflict leaves the worktree and directory behind (caught by RS-4)',
  [["removeTempWorktree(G, canonicalRoot, tmpParent, wt);", '']], modeRConflict);
mutantRow('MUT-RS-8: the lock check dropped -> the tool runs while the lock is held (caught by RS-10)',
  [["if (!lock.ok) return refuse('S3', lock.reason, tip, null, dev);", '']], lockHeld);
mutantRow('MUT-RS-9: the brief-at-branch-dev check dropped -> a task without a brief is re-synced (caught by RS-13)',
  [["if (briefAtDev.status !== 0) return refuse('S4', 'work/<id>/brief.md is missing at branch-dev', tip, null, dev);", '']], briefMissing);
mutantRow('MUT-RS-10: the canonical-clean check dropped -> a dirty canonical checkout is accepted (caught by RS-13)',
  [["if (!s2.ok) return refuse('S2', s2.reason, null, null, null);", '']], canonDirty);
mutantRow('MUT-RS-11: the self-integrity check dropped -> a modified tool still runs (caught by RS-13)',
  [["if (!si.ok) return refuse('S1', si.reason);", '']], selfTampered);
const AUDIT_OK_ANCHOR = "appendAudit(commonDir, { ts: resyncTime, verb: 'resync', task, mode, from: tip, to: newTip, base: dev, result: 'ok', reason: null });";
mutantRow('MUT-RS-12: an approval record written after a successful resync (caught by RS-8)',
  [[AUDIT_OK_ANCHOR, AUDIT_OK_ANCHOR + "\n    fs.writeFileSync(path.join(commonDir, 'pt-land-approval'), 'x\\n');"]], refsAndApprovals);
mutantRow('MUT-RS-13: branch-dev moved by a successful resync (caught by RS-8)',
  [[AUDIT_OK_ANCHOR, AUDIT_OK_ANCHOR + "\n    G(['update-ref', 'refs/heads/branch-dev', tip], canonicalRoot);"]], refsAndApprovals);

// ── summary ──────────────────────────────────────────────────────────────────────────────
for (const d of MUT_DIRS) rmrf(d);
if (failed > 0) {
  for (const f of failures) process.stdout.write('  FAIL  ' + f + '\n');
  process.stdout.write('\nOFFLINE VALIDATION (pt-land resync): FAIL (' + failed + '/' + (passed + failed) + ')\n');
  process.exit(1);
} else {
  process.stdout.write('  PASS  ' + passed + ' pt-land resync assertion(s) passed\n');
  process.stdout.write('OFFLINE VALIDATION (pt-land resync): PASS (' + passed + '/' + passed + ')\n');
  process.exit(0);
}
