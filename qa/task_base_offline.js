'use strict';
// Slice 0 (work/qa-isolation-meter): private temp root per run, then counting/timing only.
require('./lib/run-tmp').isolate('ptqa-tb-');
const meter = require('./lib/spawn-meter').install();

/*
 * qa/task_base_offline.js
 *
 * work/task-base-record/brief.md §9 (TB-1 .. TB-19). Real git in temp dirs under os.tmpdir() (no network): a bare
 * origin.git, a canonical clone at <tmp>/portfolio-tracker (main + branch-dev, a committed copy of the tool and of
 * qa/guard_integrity_check.js, one brief per task) and linked worktrees <tmp>/pt-wt-worker-a (task/one) and
 * <tmp>/pt-wt-worker-b (task/two) - the slot names the tool's resolveCaller expects.
 *
 * PT_LAND_TOOL_PATH validates a not-yet-applied candidate tool before the PROTECTED gate copies it into the DENY-tier
 * path (same override shape as qa/pt_land_resync_offline.js).
 *
 * Every row has a planted negative: a mutation of the production source (a copy of the tool or of the integrity module
 * with one anchor replaced; the anchor must occur exactly once) or a fixture input that must flip the verdict.
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
// The last commit before this task: the "no record = today" comparisons run the tool and the integrity module as they
// were there (read with git show; nothing is copied into the repo).
const BASELINE_COMMIT = '1e4b773bb0262b62c1f12e1f612c288f45bbd792';

let passed = 0;
let failed = 0;
const failures = [];
const MUT_DIRS = [];

function test(name, fn) {
  if (process.env.TB_ONLY && !new RegExp(process.env.TB_ONLY).test(name)) return; // developer aid: run a subset of the rows
  meter.beginRow(name); try {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failed += 1;
    failures.push(name + ' -- ' + (e && e.message ? e.message : String(e)));
  }
  } finally { meter.endRow(); }
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
function sleepMs(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function cleanEnv() {
  const env = {};
  for (const k of Object.keys(process.env)) if (!/^GIT_/i.test(k) && k !== 'NODE_OPTIONS') env[k] = process.env[k];
  return env;
}
// Reflog timestamps have one-second resolution: wait until a whole second after `iso`, so every ref move made
// afterwards is strictly newer than the recorded start (the integrity module compares the second to the start).
function waitPast(iso) {
  const t = Date.parse(iso);
  while (Math.floor(Date.now() / 1000) * 1000 <= t) sleepMs(25);
}
// Replace every 40-hex oid by a placeholder numbered in order of first appearance, so two fixtures that differ only in
// their (time-dependent) commit ids compare equal.
function normOids(value) {
  const seen = new Map();
  return JSON.stringify(value).replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, 'TS').replace(/\b[0-9a-f]{40}\b/g, (m) => {
    if (!seen.has(m)) seen.set(m, 'OID' + seen.size);
    return seen.get(m);
  });
}
function gitShow(spec) {
  const r = spawnSync('git', ['show', spec], { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) throw new Error('git show ' + spec + ' failed: ' + (r.stderr || ''));
  return String(r.stdout);
}
function writeTemp(name, text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pttb-src-'));
  MUT_DIRS.push(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  return file;
}

const NOW = '2026-10-03T12:00:00.000Z';
const EVIDENCE = 'LAND-EVIDENCE: qa-offline=PASS 53; targeted=PASS; codex-classI-unresolved=0';

// Mutated copy of a source file (LF-normalised; every anchor must occur exactly once).
function mutantOf(srcPath, label, replacements, outName) {
  let src = fs.readFileSync(srcPath, 'utf8').replace(/\r\n/g, '\n');
  for (const [find, replace] of replacements) {
    const n = src.split(find).length - 1;
    assert.strictEqual(n, 1, 'mutant "' + label + '": anchor found ' + n + ' time(s): ' + find.slice(0, 80));
    src = src.replace(find, () => replace);
  }
  return writeTemp(outName, src);
}
function mutantTool(label, replacements) { return mutantOf(TOOL_PATH, label, replacements, 'pt-land.js'); }
function mutantIntegrity(label, replacements) { return mutantOf(INTEGRITY_PATH, label, replacements, 'guard_integrity_check.js'); }

// ── fixture ──────────────────────────────────────────────────────────────────────────────
// Canonical branch-dev carries README/shared files, a .gitignore for the task evidence files, the committed tool and
// integrity module, and a brief (with a land-scope block) for task/one and task/two. Slot A is on task/one, slot B on
// task/two, both created at branch-dev with no commits of their own.
function buildFixture(o) {
  o = o || {};
  const toolSource = o.toolSource || TOOL_PATH;
  const integritySource = o.integritySource || INTEGRITY_PATH;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pttb-qa-'));
  const sameContent = (a, b) => a === b || sha256(fs.readFileSync(a)) === sha256(fs.readFileSync(b));
  const buildRecipe = (root) => {
    const bareDir = path.join(root, 'origin.git');
    const canon = path.join(root, 'portfolio-tracker');
    const slotA = path.join(root, 'pt-wt-worker-a');
    const slotB = path.join(root, 'pt-wt-worker-b');
    fs.mkdirSync(bareDir, { recursive: true });
    G(['init', '--bare', '-b', 'main', bareDir], root);
    fs.mkdirSync(canon, { recursive: true });
    G(['init', '-b', 'main', canon], root);
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
    fs.copyFileSync(integritySource, path.join(canon, 'qa', 'guard_integrity_check.js'));
    G(['add', '.claude/hooks/pt-land.js', 'qa/guard_integrity_check.js'], canon);
    G(['commit', '-m', 'add tool'], canon);
    for (const s of ['one', 'two']) {
      W(path.join(canon, 'work', s, 'brief.md'),
        '# brief ' + s + '\n\n<!-- land-scope:begin -->\n- work/' + s + '/foo.txt\n- work/' + s + '/bar.txt\n<!-- land-scope:end -->\n');
      G(['add', 'work/' + s + '/brief.md'], canon);
      G(['commit', '-m', 'brief ' + s], canon);
    }
    G(['push', 'origin', 'branch-dev'], canon);
    G(['worktree', 'add', '-b', 'task/one', slotA, 'branch-dev'], canon);
    G(['worktree', 'add', '-b', 'task/two', slotB, 'branch-dev'], canon);
  };
  const useTemplate = sameContent(toolSource, TOOL_PATH) && sameContent(integritySource, INTEGRITY_PATH);
  if (useTemplate) {
    const FT = require('./lib/fixture-template');
    const t = FT.template('tb:' + sha256(fs.readFileSync(TOOL_PATH)) + ':' + sha256(fs.readFileSync(INTEGRITY_PATH)), (dir) => { buildRecipe(dir); });
    FT.materialize(t.dir, tmp, ['portfolio-tracker/.git/config', 'portfolio-tracker/.git/worktrees/*/gitdir', 'pt-wt-worker-a/.git', 'pt-wt-worker-b/.git']);
  } else {
    buildRecipe(tmp);
  }
  const bareDir = path.join(tmp, 'origin.git');
  const canon = path.join(tmp, 'portfolio-tracker');
  const slotA = path.join(tmp, 'pt-wt-worker-a');
  const slotB = path.join(tmp, 'pt-wt-worker-b');
  const base = rev(canon, 'branch-dev');
  const commonDir = path.join(canon, '.git');
  const enc = (task) => encodeURIComponent(task.replace(/^task\//, ''));

  const fx = {
    tmp, bareDir, canon, slotA, slotB, base, commonDir, task1: 'task/one', task2: 'task/two',
    recordPath(task) { return path.join(commonDir, 'pt-task', enc(task) + '.json'); },
    readRecord(task) { return JSON.parse(fs.readFileSync(fx.recordPath(task), 'utf8')); },
    hasRecord(task) { return fs.existsSync(fx.recordPath(task)); },
    requireTool() {
      const p = path.join(canon, '.claude', 'hooks', 'pt-land.js');
      delete require.cache[require.resolve(p)];
      return require(p);
    },
    requireIntegrity(file) {
      const p = file || path.join(canon, 'qa', 'guard_integrity_check.js');
      delete require.cache[require.resolve(p)];
      return require(p);
    },
    commitIn(slot, files, msg) {
      for (const rel of Object.keys(files)) W(path.join(slot, rel), files[rel]);
      G(['add', '--'].concat(Object.keys(files)), slot);
      G(['commit', '-m', msg || 'task commit'], slot);
      return rev(slot, 'HEAD');
    },
    // Another task landing first (test setup, not the tool): a plain commit on canonical branch-dev.
    advanceDev(files, msg) {
      for (const rel of Object.keys(files)) W(path.join(canon, rel), files[rel]);
      G(['add', '--'].concat(Object.keys(files)), canon);
      G(['commit', '-m', msg || 'dev advances'], canon);
      return rev(canon, 'branch-dev');
    },
    // ... and the audit line the real LAND tool would have written for it.
    logLand(task, from, to) { fx.appendAudit({ ts: NOW, verb: 'land', task, from, to, result: 'ok', reason: null }); },
    appendAudit(entry) { fs.appendFileSync(path.join(commonDir, 'pt-land-log'), JSON.stringify(entry) + '\n'); },
    audit() {
      const p = path.join(commonDir, 'pt-land-log');
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    },
    tool(fn, task, extra) { return fx.requireTool()[fn](Object.assign({ cwd: canon, task, now: NOW }, extra || {})); },
    // task-start runs on the real clock (the integrity module compares the recorded start with the reflog times).
    start(task, extra) { return fx.requireTool().runTaskStart(Object.assign({ cwd: canon, task }, extra || {})); },
    // A valid record written by the fixture (record file + the audit line that carries its sha256).
    forgeRecord(task, patch) {
      const baseOid = (patch && patch.base) || base;
      const rec = Object.assign({
        schema: 'pt-task-base/v1', task, base: baseOid, mainAtStart: rev(canon, 'main'),
        originDevAtStart: rev(canon, 'origin/branch-dev'), startedAt: new Date().toISOString(),
        briefPath: 'work/' + task.replace(/^task\//, '') + '/brief.md', briefSha256: sha256(Buffer.from('x')),
        briefCommit: baseOid, adopted: false,
        history: [{ ts: new Date().toISOString(), verb: 'task-start', mode: null, from: null, to: baseOid }]
      }, patch || {});
      fx.writeRecordRaw(task, rec);
      return rec;
    },
    writeRecordRaw(task, rec, noAudit) {
      const text = typeof rec === 'string' ? rec : JSON.stringify(rec, null, 2) + '\n';
      fs.mkdirSync(path.dirname(fx.recordPath(task)), { recursive: true });
      fs.writeFileSync(fx.recordPath(task), text);
      if (!noAudit) fx.appendAudit({ ts: NOW, verb: 'task-start', task, from: null, to: base, result: 'ok', reason: null, recordSha256: sha256(Buffer.from(text)) });
    },
    integrity(opts, mod) {
      return (mod || fx.requireIntegrity()).runIntegrity(Object.assign({ task: 'task/one', root: canon }, opts || {}));
    },
    cli(args) {
      const r = spawnSync(process.execPath, [path.join(canon, 'qa', 'guard_integrity_check.js')].concat(args), {
        cwd: canon, encoding: 'utf8', windowsHide: true, env: cleanEnv(), maxBuffer: 8 * 1024 * 1024 });
      return { status: r.status, stdout: String(r.stdout), stderr: String(r.stderr) };
    },
    toolCli(args, cwd) {
      const r = spawnSync(process.execPath, [path.join(canon, '.claude', 'hooks', 'pt-land.js')].concat(args), {
        cwd: cwd || canon, encoding: 'utf8', windowsHide: true, env: cleanEnv(), maxBuffer: 8 * 1024 * 1024 });
      return { status: r.status, stdout: String(r.stdout), stderr: String(r.stderr) };
    },
    refs(cwd) { return G(['for-each-ref', '--format=%(refname) %(objectname)'], cwd || canon); },
    approvals() { return fs.readdirSync(commonDir).filter((n) => /^pt-.*-approval$/.test(n)).sort(); },
    cleanup() { rmrf(tmp); }
  };
  return fx;
}
function failText(res) { return (res.failures || []).join(' | '); }
// A task commit that satisfies the fixture brief's land scope (+ the review.md with its LAND-EVIDENCE line).
function landableCommit(fx, slot, id) {
  return fx.commitIn(slot, { ['work/' + id + '/foo.txt']: 'foo\n', ['work/' + id + '/review.md']: '# review\n\n' + EVIDENCE + '\n' }, 'task work');
}
function approvalFile(fx, kind, text) { fs.writeFileSync(path.join(fx.commonDir, 'pt-' + kind + '-approval'), text + '\n'); }

const NO_TOOL_MSG = TOOL_PATH + ' does not exist';
if (!fs.existsSync(TOOL_PATH)) {
  process.stdout.write('  FAIL  ' + NO_TOOL_MSG + '\n');
  process.stdout.write('OFFLINE VALIDATION (task-base record): FAIL (0/0)\n');
  process.exit(1);
}

// Anchors in the integrity module (each must occur exactly once; mutantOf() proves it).
const A_SHA = 'if (latest.recordSha256 !== sha) return bad(';
const A_BASE_MM = 'if (opts.baseDev && opts.baseDev !== rec.base) {';
const A_MAIN_MM = 'if (opts.baseMain && opts.baseMain !== rec.mainAtStart) {';
const A_SINCE_MM = 'if (opts.since && Date.parse(opts.since) !== Date.parse(rec.startedAt)) {';
const A_MAIN_STRICT = 'if (mainOid !== rec.mainAtStart) failures.push(';
const A_MONO = 'if (idx < lastIdx) {';
const A_STALE = 'if (mb !== rec.base) failures.push(';
const A_ONE_FILE = 'lines.length === 1 && ';
const A_LEGACY_MAIN = 'if (mainOid !== opts.baseMain)';

// ── TB-1: brief baseline == task base ─────────────────────────────────────────────────────
test('TB-1: task-start, a task commit, integrity --task with no flags -> PASS and "mode task-record"; the CLI and --print-record agree', () => {
  const fx = buildFixture();
  try {
    const s = fx.start(fx.task1);
    assert.strictEqual(s.ok, true, JSON.stringify(s));
    const rec = fx.readRecord(fx.task1);
    assert.strictEqual(rec.schema, 'pt-task-base/v1');
    assert.strictEqual(rec.task, fx.task1);
    assert.strictEqual(rec.base, fx.base, 'brief baseline == task base here');
    assert.strictEqual(rec.mainAtStart, rev(fx.canon, 'main'));
    assert.strictEqual(rec.adopted, false);
    assert.strictEqual(rec.history.length, 1);
    assert.strictEqual(rec.history[0].verb, 'task-start');
    assert.strictEqual(rec.history[0].to, fx.base);
    fx.commitIn(fx.slotA, { 'work/one/foo.txt': 'foo\n' });
    const r = fx.integrity();
    assert.strictEqual(r.ok, true, failText(r));
    assert.ok(r.report.some((l) => /^mode task-record task=task\/one base=[0-9a-f]{40} /.test(l)), JSON.stringify(r.report));
    const c = fx.cli(['--task', fx.task1, '--root', fx.canon]);
    assert.strictEqual(c.status, 0, c.stdout + c.stderr);
    assert.match(c.stdout, /REPORT: mode task-record/);
    assert.match(c.stdout, /guard-integrity: PASS/);
    const p = fx.cli(['--task', fx.task1, '--root', fx.canon, '--print-record']);
    assert.strictEqual(p.status, 0, p.stdout + p.stderr);
    assert.match(p.stdout, /"schema": "pt-task-base\/v1"/);
    assert.match(p.stdout, /mode: task-record/);
    // planted negative: the record's base edited -> the sha256 chain breaks -> RECORD INVALID, no C-check output
    const text = fs.readFileSync(fx.recordPath(fx.task1), 'utf8').replace(rec.base, rev(fx.canon, 'main'));
    fs.writeFileSync(fx.recordPath(fx.task1), text);
    const bad = fx.integrity();
    assert.strictEqual(bad.ok, false);
    assert.match(failText(bad), /RECORD INVALID/);
    assert.ok(!/C\d/.test(failText(bad).replace(/RECORD INVALID.*/, '')), 'no C-check ran');
    const cb = fx.cli(['--task', fx.task1, '--root', fx.canon]);
    assert.strictEqual(cb.status, 1);
    assert.match(cb.stderr, /RECORD INVALID/);
    const pb = fx.cli(['--task', fx.task1, '--root', fx.canon, '--print-record']);
    assert.strictEqual(pb.status, 1, '--print-record of an invalid record exits 1');
  } finally { fx.cleanup(); }
});

// ── TB-2: brief baseline older than the task base ─────────────────────────────────────────
test('TB-2: a logged LAND and another brief between the brief baseline and the fork -> record.base = the fork tip; PASS; C6 excludes the earlier files', () => {
  const fx = buildFixture();
  try {
    const briefPin = fx.base;
    const mid = fx.advanceDev({ 'dev-only.txt': 'd\n' }, 'another task landed');
    fx.logLand('task/other', briefPin, mid);
    const tip = fx.advanceDev({ 'work/late/brief.md': '# brief late\n\n<!-- land-scope:begin -->\n- work/late/foo.txt\n<!-- land-scope:end -->\n' }, 'brief late');
    G(['switch', '-c', 'task/late', 'branch-dev'], fx.slotB);
    // planted negative first: the legacy form with the brief pin shows the earlier files in C6 and fails C1
    const legacy = fx.integrity({ task: 'task/late', baseMain: rev(fx.canon, 'main'), baseDev: briefPin });
    assert.strictEqual(legacy.ok, false);
    assert.match(failText(legacy), /C6 base-dev\.\.\.task touches protected paths: work\/late\/brief\.md/);
    assert.match(failText(legacy), /C1 local branch-dev/);
    const s = fx.start('task/late');
    assert.strictEqual(s.ok, true, JSON.stringify(s));
    const rec = fx.readRecord('task/late');
    assert.strictEqual(rec.base, tip);
    assert.notStrictEqual(rec.base, briefPin);
    fx.commitIn(fx.slotB, { 'work/late/foo.txt': 'foo\n' });
    const r = fx.integrity({ task: 'task/late' });
    assert.strictEqual(r.ok, true, failText(r));
  } finally { fx.cleanup(); }
});

// ── TB-3: a logged LAND moves branch-dev ──────────────────────────────────────────────────
test('TB-3: branch-dev advances after start by a logged LAND -> PASS with "chain land:"; the same advance unlogged, or logged from the wrong commit -> C1 FAIL', () => {
  const fx = buildFixture();
  try {
    const s = fx.start(fx.task1);
    assert.strictEqual(s.ok, true, JSON.stringify(s));
    fx.commitIn(fx.slotA, { 'work/one/foo.txt': 'foo\n' });
    waitPast(fx.readRecord(fx.task1).startedAt);
    const to = fx.advanceDev({ 'dev-only.txt': 'd\n' }, 'another task landed');
    // planted negative: the same advance with no audit line is a direct commit
    const direct = fx.integrity();
    assert.strictEqual(direct.ok, false);
    assert.match(failText(direct), /C1 unexplained branch-dev advance at /);
    // planted negative: a LAND line that does not start at the recorded base
    fx.logLand('task/other', to, to);
    assert.match(failText(fx.integrity()), /C1 unexplained branch-dev advance at /);
    fx.logLand('task/other', fx.base, to);
    const r = fx.integrity();
    assert.strictEqual(r.ok, true, failText(r));
    assert.ok(r.report.some((l) => l === 'chain land:' + fx.base + '..' + to), JSON.stringify(r.report));
    assert.ok(!r.failures.length);
  } finally { fx.cleanup(); }
});

// ── TB-4: a brief-only addition moves branch-dev ──────────────────────────────────────────
test('TB-4: branch-dev advances by a brief-only addition -> PASS with "chain brief:"; two files, a modified brief, or a non-brief file -> each FAILs', () => {
  const variants = [
    ['a clean single-file brief addition', { 'work/three/brief.md': '# three\n' }, true],
    ['the commit also adds a 2nd file', { 'work/three/brief.md': '# three\n', 'zz-extra.txt': 'x\n' }, false],
    ['the commit modifies an existing brief', { 'work/two/brief.md': '# two edited\n' }, false],
    ['the commit adds work/x/notes.md', { 'work/x/notes.md': 'n\n' }, false]
  ];
  for (const [label, files, expectOk] of variants) {
    const fx = buildFixture();
    try {
      assert.strictEqual(fx.start(fx.task1).ok, true);
      waitPast(fx.readRecord(fx.task1).startedAt);
      const c = fx.advanceDev(files, 'dev advances: ' + label);
      const r = fx.integrity();
      if (expectOk) {
        assert.strictEqual(r.ok, true, label + ': ' + failText(r));
        assert.ok(r.report.some((l) => l === 'chain brief:' + c + ' work/three/brief.md'), JSON.stringify(r.report));
      } else {
        assert.strictEqual(r.ok, false, label + ' must FAIL');
        assert.match(failText(r), /C1 unexplained branch-dev advance at /, label);
      }
    } finally { fx.cleanup(); }
  }
  // planted negative on the source: without the "exactly one file" rule the 2-file commit would pass the chain
  const fx = buildFixture();
  try {
    const mut = mutantIntegrity('brief-only: exactly one file dropped', [[A_ONE_FILE, 'true && ']]);
    assert.strictEqual(fx.start(fx.task1).ok, true);
    waitPast(fx.readRecord(fx.task1).startedAt);
    fx.advanceDev({ 'work/three/brief.md': '# three\n', 'zz-extra.txt': 'x\n' }, 'two files');
    assert.strictEqual(fx.integrity().ok, false, 'real module: FAIL');
    assert.doesNotMatch(failText(fx.integrity({}, fx.requireIntegrity(mut))), /C1 unexplained branch-dev advance/, 'mutant: the rule is gone');
  } finally { fx.cleanup(); }
});

// ── TB-5: the task's own brief-only commit before start ───────────────────────────────────
test('TB-5: the task\'s own brief commit before start is not a move and not in C6 -> PASS; a record start base set before the brief commit -> C6 FAIL', () => {
  const fx = buildFixture();
  try {
    assert.strictEqual(fx.start(fx.task1).ok, true);
    fx.commitIn(fx.slotA, { 'work/one/foo.txt': 'foo\n' });
    const ok = fx.integrity();
    assert.strictEqual(ok.ok, true, failText(ok));
    assert.ok(!ok.report.some((l) => /^chain /.test(l)), 'no chain step: the brief commit precedes the start');
    // planted negative: forge a record whose start base is the commit BEFORE both briefs
    const early = rev(fx.canon, 'branch-dev~2');
    fx.forgeRecord(fx.task1, { base: early, history: [{ ts: NOW, verb: 'task-start', mode: null, from: null, to: early }] });
    const bad = fx.integrity();
    assert.strictEqual(bad.ok, false);
    assert.match(failText(bad), /C6 base-dev\.\.\.task touches protected paths: .*work\/one\/brief\.md/);
  } finally { fx.cleanup(); }
});

// ── TB-6: a wrong --base-dev ──────────────────────────────────────────────────────────────
test('TB-6: wrong --base-dev -> BASE MISMATCH naming the recorded SHA, exit 1, no C output, module mismatch:true', () => {
  const fx = buildFixture();
  try {
    assert.strictEqual(fx.start(fx.task1).ok, true);
    const wrong = rev(fx.canon, 'main');
    const r = fx.integrity({ baseDev: wrong });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.mismatch, true);
    assert.deepStrictEqual(r.report, []);
    assert.strictEqual(r.failures.length, 1);
    assert.ok(r.failures[0].startsWith('BASE MISMATCH: --base-dev ' + wrong + ' != recorded task base ' + fx.base + ' (task/one, started '), r.failures[0]);
    assert.ok(r.failures[0].endsWith('). Re-run without --base-dev.'), r.failures[0]);
    const c = fx.cli(['--task', fx.task1, '--root', fx.canon, '--base-dev', wrong]);
    assert.strictEqual(c.status, 1);
    assert.match(c.stderr, /BASE MISMATCH: --base-dev /);
    assert.match(c.stdout, /guard-integrity: FAIL \(BASE MISMATCH\)/);
    assert.ok(!/REPORT|C\d/.test(c.stdout + c.stderr.replace(/BASE MISMATCH.*/, '')), 'no C-check output');
    // planted negative: the comparison removed -> the mismatch is not detected
    const mut = mutantIntegrity('base mismatch dropped', [[A_BASE_MM, 'if (false) {']]);
    const m = fx.integrity({ baseDev: wrong }, fx.requireIntegrity(mut));
    assert.notStrictEqual(m.mismatch, true);
  } finally { fx.cleanup(); }
});

// ── TB-7: wrong --since / --base-main; equal values accepted ──────────────────────────────
test('TB-7: wrong --since / --base-main -> SINCE / MAIN MISMATCH; equal values -> PASS', () => {
  const fx = buildFixture();
  try {
    assert.strictEqual(fx.start(fx.task1).ok, true);
    fx.commitIn(fx.slotA, { 'work/one/foo.txt': 'foo\n' });
    const rec = fx.readRecord(fx.task1);
    const since = fx.integrity({ since: '2020-01-01T00:00:00.000Z' });
    assert.strictEqual(since.mismatch, true);
    assert.match(since.failures[0], /^SINCE MISMATCH: --since 2020-01-01T00:00:00\.000Z != recorded start /);
    const main = fx.integrity({ baseMain: rev(fx.canon, 'branch-dev') });
    assert.strictEqual(main.mismatch, true);
    assert.match(main.failures[0], /^MAIN MISMATCH: --base-main [0-9a-f]{40} != recorded main at start [0-9a-f]{40}/);
    const cs = fx.cli(['--task', fx.task1, '--root', fx.canon, '--since', '2020-01-01T00:00:00.000Z']);
    assert.match(cs.stdout, /guard-integrity: FAIL \(SINCE MISMATCH\)/);
    assert.strictEqual(cs.status, 1);
    const cm = fx.cli(['--task', fx.task1, '--root', fx.canon, '--base-main', rev(fx.canon, 'branch-dev')]);
    assert.match(cm.stdout, /guard-integrity: FAIL \(MAIN MISMATCH\)/);
    // equal values are accepted (compatibility)
    const eq = fx.integrity({ baseDev: rec.base, baseMain: rec.mainAtStart, since: rec.startedAt });
    assert.strictEqual(eq.ok, true, failText(eq));
    // planted negatives: the since / main comparisons removed
    const mutS = mutantIntegrity('since mismatch dropped', [[A_SINCE_MM, 'if (false) {']]);
    assert.notStrictEqual(fx.integrity({ since: '2020-01-01T00:00:00.000Z' }, fx.requireIntegrity(mutS)).mismatch, true);
    const mutM = mutantIntegrity('main mismatch dropped', [[A_MAIN_MM, 'if (false) {']]);
    assert.notStrictEqual(fx.integrity({ baseMain: rev(fx.canon, 'branch-dev') }, fx.requireIntegrity(mutM)).mismatch, true);
  } finally { fx.cleanup(); }
});

// ── TB-8: rewind / force-move ─────────────────────────────────────────────────────────────
test('TB-8: branch-dev reset back then forward -> C2 FAIL (decreasing); moved to an off-chain commit -> C1 FAIL; --remote with an unexplained origin branch-dev -> C-remote FAIL', () => {
  const fx = buildFixture();
  try {
    assert.strictEqual(fx.start(fx.task1).ok, true);
    waitPast(fx.readRecord(fx.task1).startedAt);
    const c1 = fx.advanceDev({ 'work/three/brief.md': '# three\n' }, 'brief three');
    assert.strictEqual(fx.integrity().ok, true, failText(fx.integrity()));
    G(['reset', '--hard', '-q', fx.base], fx.canon);
    G(['reset', '--hard', '-q', c1], fx.canon);
    const rw = fx.integrity();
    assert.strictEqual(rw.ok, false, 'the chain is intact at the end, but the history went backwards');
    assert.match(failText(rw), /C2 .*branch-dev/);
    // planted negative: the monotonic check removed -> the rewind is not detected
    const mut = mutantIntegrity('monotonic check dropped', [[A_MONO, 'if (false) {']]);
    const m = fx.integrity({}, fx.requireIntegrity(mut));
    assert.strictEqual(m.ok, true, 'mutant: ' + failText(m));
  } finally { fx.cleanup(); }
  const fy = buildFixture();
  try {
    assert.strictEqual(fy.start(fy.task1).ok, true);
    waitPast(fy.readRecord(fy.task1).startedAt);
    // an off-chain commit: a sibling of the base, never logged
    G(['checkout', '-q', '--detach', fy.base], fy.canon);
    W(path.join(fy.canon, 'off.txt'), 'off\n');
    G(['add', 'off.txt'], fy.canon);
    G(['commit', '-q', '-m', 'off chain'], fy.canon);
    const off = rev(fy.canon, 'HEAD');
    G(['checkout', '-q', 'branch-dev'], fy.canon);
    G(['reset', '--hard', '-q', off], fy.canon);
    const r = fy.integrity();
    assert.strictEqual(r.ok, false);
    assert.match(failText(r), /C1 unexplained branch-dev advance at /);
    assert.match(failText(r), /C2 /, 'the reflog entry is off the chain too');
    // --remote: origin/branch-dev pushed off-chain
    G(['push', '-q', '--force', 'origin', 'branch-dev'], fy.canon);
    const rr = fy.integrity({ remote: true });
    assert.match(failText(rr), /C-remote origin\/branch-dev /);
  } finally { fy.cleanup(); }
});

// ── TB-9: main moved after start ──────────────────────────────────────────────────────────
test('TB-9: main moved after start -> C1 and C2 FAIL; main relaxed like branch-dev would not be caught (planted negative)', () => {
  const fx = buildFixture();
  try {
    assert.strictEqual(fx.start(fx.task1).ok, true);
    waitPast(fx.readRecord(fx.task1).startedAt);
    const tree = rev(fx.canon, 'main^{tree}');
    const moved = G(['commit-tree', tree, '-p', 'main', '-m', 'main moved'], fx.canon).trim();
    G(['update-ref', 'refs/heads/main', moved], fx.canon);
    const r = fx.integrity();
    assert.strictEqual(r.ok, false);
    assert.match(failText(r), /C1 local main /);
    assert.match(failText(r), /C2 .*refs\/heads\/main/);
    const mut = mutantIntegrity('main strictness dropped', [[A_MAIN_STRICT, 'if (false) failures.push(']]);
    const m = fx.integrity({}, fx.requireIntegrity(mut));
    assert.doesNotMatch(failText(m), /C1 local main /, 'mutant: C1 no longer sees main');
  } finally { fx.cleanup(); }
});

// ── TB-10: no record ──────────────────────────────────────────────────────────────────────
test('TB-10: no record: --task without --base-* -> exit 3; with them -> the legacy result identical to the baseline module\'s, plus the WARN line', () => {
  const fx = buildFixture();
  try {
    const base = gitShow(BASELINE_COMMIT + ':qa/guard_integrity_check.js');
    const baseMod = fx.requireIntegrity(writeTemp('baseline_integrity.js', base));
    const main = rev(fx.canon, 'main');
    const cases = [
      { baseMain: main, baseDev: fx.base, task: 'task/one', root: fx.canon },
      { baseMain: main, baseDev: fx.base, task: 'task/one', root: fx.canon, since: '2020-01-01T00:00:00.000Z' },
      { baseMain: main, baseDev: main, task: 'task/one', root: fx.canon },
      { baseMain: main, baseDev: fx.base, root: fx.canon }
    ];
    for (const c of cases) {
      assert.deepStrictEqual(fx.integrity(c), baseMod.runIntegrity(Object.assign({}, c)), 'identical to the baseline module for ' + JSON.stringify(c));
    }
    const noFlags = fx.cli(['--task', fx.task1, '--root', fx.canon]);
    assert.strictEqual(noFlags.status, 3, noFlags.stdout + noFlags.stderr);
    const flags = fx.cli(['--task', fx.task1, '--root', fx.canon, '--base-main', main, '--base-dev', fx.base]);
    assert.strictEqual(flags.status, 0, flags.stdout + flags.stderr);
    assert.match(flags.stdout, /WARN: no task-base record \(legacy mode\)/);
    const noTask = fx.cli(['--root', fx.canon, '--base-main', main, '--base-dev', fx.base]);
    assert.strictEqual(noTask.status, 0);
    assert.ok(!/WARN/.test(noTask.stdout), 'no --task: no WARN');
    const noTaskNoBases = fx.cli(['--root', fx.canon]);
    assert.strictEqual(noTaskNoBases.status, 3, 'no --task and no bases is still a usage error');
    // planted negative: a legacy check altered -> the comparison with the baseline module sees it
    const mut = mutantIntegrity('legacy C1 main check dropped', [[A_LEGACY_MAIN, 'if (false)']]);
    const bad = { baseMain: fx.base, baseDev: fx.base, task: 'task/one', root: fx.canon };
    assert.notDeepStrictEqual(fx.integrity(bad, fx.requireIntegrity(mut)), baseMod.runIntegrity(Object.assign({}, bad)));
  } finally { fx.cleanup(); }
});

// ── TB-11: invalid records ────────────────────────────────────────────────────────────────
test('TB-11: malformed JSON / missing field / sha256 != the latest audit recordSha256 / no audit line -> RECORD INVALID, no scan', () => {
  const fx = buildFixture();
  try {
    const STARTED = new Date().toISOString();
    const good = { schema: 'pt-task-base/v1', task: fx.task1, base: fx.base, mainAtStart: rev(fx.canon, 'main'), originDevAtStart: null,
      startedAt: STARTED, briefPath: 'work/one/brief.md', briefSha256: 'a'.repeat(64), briefCommit: fx.base, adopted: false,
      history: [{ ts: STARTED, verb: 'task-start', mode: null, from: null, to: fx.base }] };
    const cases = [
      ['malformed JSON', () => fx.writeRecordRaw(fx.task1, '{ not json')],
      ['a missing field', () => { const r = Object.assign({}, good); delete r.mainAtStart; fx.writeRecordRaw(fx.task1, r); }],
      ['a short oid', () => fx.writeRecordRaw(fx.task1, Object.assign({}, good, { base: 'abc123' }))],
      ['a base that is not history[last].to', () => fx.writeRecordRaw(fx.task1, Object.assign({}, good, { base: rev(fx.canon, 'main') }))],
      ['a task that differs from the requested one', () => fx.writeRecordRaw(fx.task1, Object.assign({}, good, { task: 'task/two' }))],
      ['an empty history', () => fx.writeRecordRaw(fx.task1, Object.assign({}, good, { history: [] }))],
      ['a sha256 that differs from the latest audit line', () => { fx.writeRecordRaw(fx.task1, good); fs.appendFileSync(fx.recordPath(fx.task1), ' '); }],
      ['no audit line at all', () => fx.writeRecordRaw(fx.task1, good, true)]
    ];
    for (const [label, setup] of cases) {
      rmrf(path.join(fx.commonDir, 'pt-land-log'));
      rmrf(path.join(fx.commonDir, 'pt-task'));
      setup();
      const r = fx.integrity();
      assert.strictEqual(r.ok, false, label);
      assert.strictEqual(r.failures.length, 1, label + ': ' + failText(r));
      assert.match(r.failures[0], /^RECORD INVALID: /, label);
      assert.deepStrictEqual(r.report, [], label + ': no scan ran');
    }
    // positive control: the same good record with its audit line is accepted
    rmrf(path.join(fx.commonDir, 'pt-land-log'));
    rmrf(path.join(fx.commonDir, 'pt-task'));
    fx.writeRecordRaw(fx.task1, good);
    assert.strictEqual(fx.integrity({ since: undefined }).ok, true, failText(fx.integrity()));
    // planted negative: the sha256 comparison removed -> a tampered record is accepted
    fs.appendFileSync(fx.recordPath(fx.task1), ' ');
    assert.match(failText(fx.integrity()), /RECORD INVALID/);
    const mut = mutantIntegrity('record sha256 check dropped', [[A_SHA, 'if (false) return bad(']]);
    assert.strictEqual(fx.integrity({}, fx.requireIntegrity(mut)).ok, true, 'mutant accepts the tampered record');
  } finally { fx.cleanup(); }
});

// Anchors in the tool (each must occur exactly once; mutantOf() proves it).
const A_T4 = "if (existing.exists) return refuse('T4',";
const A_WX = "const fd = fs.openSync(recPath, 'wx');";
const A_REF_POINT = 'const startedAt = nowIso(opts);';
const A_REC_WRITE = 'writeRecordAtomic(commonDir, task, newRecord);';
const A_L3_MM = 'if (recL.record.base !== l3.base) {';
const A_APPROVAL = 'if (!apr || apr.task !== task || apr.base !== d.base || apr.startedAt !== d.startedAt) {';
const A_ARCHIVE = 'fs.renameSync(recPath, archivedPath);';

// Everything a refusal must leave untouched, except the audit log (a refusal appends its own refuse line).
function snap(fx) {
  const files = {};
  (function walk(d, rel) {
    if (!fs.existsSync(d)) return;
    for (const name of fs.readdirSync(d)) {
      const abs = path.join(d, name);
      const r = rel ? rel + '/' + name : name;
      if (fs.statSync(abs).isDirectory()) walk(abs, r); else files[r] = sha256(fs.readFileSync(abs));
    }
  })(path.join(fx.commonDir, 'pt-task'), '');
  return {
    canonRefs: fx.refs(), originRefs: fx.refs(fx.bareDir), approvals: fx.approvals(), taskFiles: files,
    canonStatus: G(['status', '--porcelain=v1', '--untracked-files=all'], fx.canon),
    slotA: rev(fx.slotA, 'HEAD'), slotB: rev(fx.slotB, 'HEAD')
  };
}
function lastAudit(fx) { return fx.audit().pop(); }

// ── TB-12: resync updates the record ──────────────────────────────────────────────────────
test('TB-12: resync with a record, mode F and mode R: base = dev, history +1, audit recordSha256 matches, the printed next step is the record form, integrity PASS after', () => {
  for (const mode of ['F', 'R']) {
    const fx = buildFixture();
    try {
      assert.strictEqual(fx.start(fx.task1).ok, true);
      const startedAt = fx.readRecord(fx.task1).startedAt;
      if (mode === 'R') landableCommit(fx, fx.slotA, 'one');
      waitPast(startedAt);
      const dev = fx.advanceDev({ 'dev-only.txt': 'd\n' }, 'another task landed');
      fx.logLand('task/other', fx.base, dev);
      const r = mode === 'F' ? fx.tool('runResync', fx.task1) : null;
      let out = null;
      if (mode === 'R') { out = fx.toolCli(['resync', fx.task1]); assert.strictEqual(out.status, 0, out.stdout + out.stderr); }
      else assert.strictEqual(r.ok, true, JSON.stringify(r));
      const rec = fx.readRecord(fx.task1);
      assert.strictEqual(rec.base, dev, mode + ': base = branch-dev');
      assert.strictEqual(rec.history.length, 2, mode + ': history +1');
      assert.strictEqual(rec.history[0].verb, 'task-start');
      assert.strictEqual(rec.history[1].verb, 'resync');
      assert.strictEqual(rec.history[1].mode, mode);
      assert.strictEqual(rec.history[1].from, fx.base);
      assert.strictEqual(rec.history[1].to, dev);
      assert.strictEqual(rec.startedAt, startedAt, 'startedAt is never rewritten');
      const audit = lastAudit(fx);
      assert.strictEqual(audit.verb, 'resync');
      assert.strictEqual(audit.result, 'ok');
      assert.strictEqual(audit.recordSha256, sha256(fs.readFileSync(fx.recordPath(fx.task1))), mode + ': audit recordSha256 matches the file');
      if (mode === 'R') {
        assert.match(out.stdout, /node qa\/guard_integrity_check\.js --task task\/one --root /, 'the printed next step is the record form');
        assert.ok(!/--base-dev|--since|--base-main/.test(out.stdout), 'no typed baseline in the printed step');
      } else {
        assert.strictEqual(r.record, true, 'the result says a record was advanced');
      }
      const i = fx.integrity();
      assert.strictEqual(i.ok, true, mode + ': ' + failText(i));
    } finally { fx.cleanup(); }
  }
  // planted negative: the record write dropped (the audit line still carries the new sha256) -> invalid record
  const mut = mutantTool('record write dropped', [[A_REC_WRITE, '/* record write dropped */']]);
  const fy = buildFixture({ toolSource: mut });
  try {
    assert.strictEqual(fy.start(fy.task1).ok, true);
    waitPast(fy.readRecord(fy.task1).startedAt);
    const dev = fy.advanceDev({ 'dev-only.txt': 'd\n' });
    fy.logLand('task/other', fy.base, dev);
    assert.strictEqual(fy.tool('runResync', fy.task1).ok, true);
    assert.strictEqual(fy.readRecord(fy.task1).base, fy.base, 'mutant: the record kept the old base');
    assert.match(failText(fy.integrity()), /RECORD INVALID/);
  } finally { fy.cleanup(); }
});

test('TB-12b: without a record the resync output and audit line are byte-identical to the baseline tool', () => {
  const runOne = (toolSource) => {
    const fx = buildFixture({ toolSource });
    try {
      fx.advanceDev({ 'dev-only.txt': 'd\n' }, 'another task landed');
      const f = fx.toolCli(['resync', fx.task2]);
      fx.advanceDev({ 'dev-two.txt': 'd2\n' }, 'and another');
      fx.commitIn(fx.slotA, { 'work/one/foo.txt': 'foo\n' });
      const rr = fx.toolCli(['resync', fx.task1]);
      const audit = fx.audit().map((e) => { const c = Object.assign({}, e); delete c.ts; return c; });
      const out = { f: { s: f.status, o: f.stdout, e: f.stderr }, r: { s: rr.status, o: rr.stdout, e: rr.stderr }, audit,
        ptTaskDir: fs.existsSync(path.join(fx.commonDir, 'pt-task')) };
      const t = fx.tmp;
      const bs = String.fromCharCode(92);
      return JSON.parse(JSON.stringify(out).split(t.split(bs).join(bs + bs)).join('TMP').split(t.split(bs).join('/')).join('TMP'));
    } finally { fx.cleanup(); }
  };
  const baseline = runOne(writeTemp('baseline_tool.js', gitShow(BASELINE_COMMIT + ':.claude/hooks/pt-land.js')));
  const candidate = runOne(TOOL_PATH);
  assert.strictEqual(baseline.ptTaskDir, false);
  assert.strictEqual(candidate.ptTaskDir, false, 'no record directory is created');
  assert.strictEqual(normOids(candidate), normOids(baseline));
  assert.ok(candidate.f.o.includes('--base-main'), 'the legacy next-step form is kept');
});

// ── TB-13: LAND ───────────────────────────────────────────────────────────────────────────
test('TB-13: LAND: a recorded, current task lands; a rebase outside resync -> L3 RECORD MISMATCH; a tampered record -> L3 RECORD INVALID; dev advanced without resync -> Second LAND', () => {
  // recorded and current -> land-request and land
  const fx = buildFixture();
  try {
    assert.strictEqual(fx.start(fx.task1).ok, true);
    const tip = landableCommit(fx, fx.slotA, 'one');
    const lr = fx.tool('runLandRequest', fx.task1);
    assert.strictEqual(lr.ok, true, JSON.stringify(lr));
    assert.ok(lr.report.checks.indexOf('L10 PASS') !== -1);
    assert.strictEqual(lr.report.base, fx.base);
    approvalFile(fx, 'land', 'LAND task/one ' + tip + ' ' + fx.base);
    const l = fx.tool('runLand', fx.task1);
    assert.strictEqual(l.ok, true, JSON.stringify(l));
    assert.strictEqual(rev(fx.canon, 'branch-dev'), tip);
  } finally { fx.cleanup(); }
  // branch-dev advanced and the task not resynced -> today's reason
  const fd = buildFixture();
  try {
    assert.strictEqual(fd.start(fd.task1).ok, true);
    landableCommit(fd, fd.slotA, 'one');
    const to = fd.advanceDev({ 'dev-only.txt': 'd\n' });
    fd.logLand('task/other', fd.base, to);
    const r = fd.tool('runLandRequest', fd.task1);
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /^L3: branch-dev moved: Second LAND/);
  } finally { fd.cleanup(); }
  // rebased outside resync -> RECORD MISMATCH (and the mutant without the check gets past L3)
  for (const mutate of [false, true]) {
    const src = mutate ? mutantTool('L3 record check dropped', [[A_L3_MM, 'if (false) {']]) : TOOL_PATH;
    const fr = buildFixture({ toolSource: src });
    try {
      assert.strictEqual(fr.start(fr.task1).ok, true);
      landableCommit(fr, fr.slotA, 'one');
      const to = fr.advanceDev({ 'dev-only.txt': 'd\n' });
      fr.logLand('task/other', fr.base, to);
      G(['rebase', 'branch-dev'], fr.slotA);
      const r = fr.tool('runLandRequest', fr.task1);
      assert.strictEqual(r.ok, false);
      if (!mutate) assert.ok(r.reason.startsWith('L3: RECORD MISMATCH: recorded task base ' + fr.base + ' != branch-dev ' + to + ' - resync through pt-land.js resync'), r.reason);
      else assert.doesNotMatch(r.reason, /RECORD MISMATCH/, 'mutant: the L3 record check is gone');
    } finally { fr.cleanup(); }
  }
  // tampered record -> RECORD INVALID
  const fi = buildFixture();
  try {
    assert.strictEqual(fi.start(fi.task1).ok, true);
    landableCommit(fi, fi.slotA, 'one');
    fs.appendFileSync(fi.recordPath(fi.task1), ' ');
    const r = fi.tool('runLandRequest', fi.task1);
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /^L3: RECORD INVALID/);
  } finally { fi.cleanup(); }
});

// ── TB-14: a stale record at integrity ────────────────────────────────────────────────────
test('TB-14: integrity on a task rebased outside resync -> RECORD STALE', () => {
  const run = (integrityMod) => {
    const fx = buildFixture();
    try {
      assert.strictEqual(fx.start(fx.task1).ok, true);
      landableCommit(fx, fx.slotA, 'one');
      waitPast(fx.readRecord(fx.task1).startedAt);
      const to = fx.advanceDev({ 'dev-only.txt': 'd\n' });
      fx.logLand('task/other', fx.base, to);
      G(['rebase', 'branch-dev'], fx.slotA);
      return fx.integrity({}, integrityMod ? fx.requireIntegrity(integrityMod) : undefined);
    } finally { fx.cleanup(); }
  };
  const r = run(null);
  assert.strictEqual(r.ok, false);
  assert.match(failText(r), /RECORD STALE: task\/one was rebased outside resync \(merge-base [0-9a-f]{40} != recorded base [0-9a-f]{40}\)/);
  // planted negative: the STALE check removed
  const mut = mutantIntegrity('stale check dropped', [[A_STALE, 'if (false) failures.push(']]);
  assert.doesNotMatch(failText(run(mut)), /RECORD STALE/);
});

// ── TB-15: task-start ─────────────────────────────────────────────────────────────────────
test('TB-15: task-start refusals each change nothing (and append a refuse line); write-once', () => {
  const fx = buildFixture();
  try {
    const refuseCase = (label, re, setup, teardown, extra) => {
      if (setup) setup();
      const before = snap(fx);
      const auditBefore = fx.audit().length;
      const r = fx.start((extra && extra.task) || fx.task1, extra && extra.opts);
      assert.strictEqual(r.ok, false, label + ' must refuse: ' + JSON.stringify(r));
      assert.strictEqual(r.exitCode, 1);
      assert.match(r.reason, re, label);
      assert.deepStrictEqual(snap(fx), before, label + ': nothing changed');
      if (!(extra && extra.noAudit)) {
        const a = fx.audit();
        assert.strictEqual(a.length, auditBefore + 1, label + ': one refuse line');
        assert.strictEqual(a[a.length - 1].verb, 'task-start');
        assert.strictEqual(a[a.length - 1].result, 'refuse');
      }
      if (teardown) teardown();
    };
    // from a Worker slot
    {
      const before = snap(fx);
      const r = fx.requireTool().runTaskStart({ cwd: fx.slotA, task: fx.task1, now: NOW });
      assert.strictEqual(r.ok, false);
      assert.match(r.reason, /T1: /);
      assert.deepStrictEqual(snap(fx), before);
    }
    refuseCase('branch missing', /T2: /, null, null, { task: 'task/nope' });
    refuseCase('branch in no slot', /T2: /, () => G(['branch', 'task/loose', 'branch-dev'], fx.canon), () => G(['branch', '-D', 'task/loose'], fx.canon), { task: 'task/loose' });
    refuseCase('brief missing', /T3: /, () => G(['switch', '-c', 'task/nobrief', 'branch-dev'], fx.slotB), () => G(['switch', 'task/two'], fx.slotB), { task: 'task/nobrief' });
    refuseCase('canonical dirty', /T1: /, () => W(path.join(fx.canon, 'dirty.txt'), 'x\n'), () => rmrf(path.join(fx.canon, 'dirty.txt')));
    refuseCase('lock held', /T5: /, () => W(path.join(fx.commonDir, 'pt-land.lock'), ''), () => rmrf(path.join(fx.commonDir, 'pt-land.lock')));
    refuseCase('tip differs from branch-dev', /T2: /, () => fx.commitIn(fx.slotA, { 'work/one/foo.txt': 'foo\n' }), () => G(['reset', '--hard', '-q', fx.base], fx.slotA));
    // the audit append fails -> nothing is recorded
    {
      rmrf(path.join(fx.commonDir, 'pt-land-log'));
      fs.mkdirSync(path.join(fx.commonDir, 'pt-land-log'));
      const before = snap(fx);
      const r = fx.start(fx.task1);
      assert.strictEqual(r.ok, false);
      assert.match(r.reason, /audit/i);
      assert.strictEqual(fx.hasRecord(fx.task1), false, 'no record is left behind');
      assert.deepStrictEqual(snap(fx), before);
      rmrf(path.join(fx.commonDir, 'pt-land-log'));
    }
    // write-once: the second start refuses and the bytes stay
    assert.strictEqual(fx.start(fx.task1).ok, true);
    const bytes = fs.readFileSync(fx.recordPath(fx.task1));
    refuseCase('a record exists', /T4: /);
    assert.ok(bytes.equals(fs.readFileSync(fx.recordPath(fx.task1))), 'record bytes unchanged');
    const p = fx.start(fx.task1, { now: '2027-01-01T00:00:00.000Z' });
    assert.strictEqual(p.ok, false);
  } finally { fx.cleanup(); }
  // planted negative: the write-once guards dropped -> a second start overwrites the record
  const mut = mutantTool('write-once dropped', [[A_T4, 'if (false) return refuse(\'T4\','], [A_WX, "const fd = fs.openSync(recPath, 'w');"]]);
  const fy = buildFixture({ toolSource: mut });
  try {
    assert.strictEqual(fy.start(fy.task1).ok, true);
    const first = fs.readFileSync(fy.recordPath(fy.task1));
    assert.strictEqual(fy.start(fy.task1, { now: '2027-01-01T00:00:00.000Z' }).ok, true, 'mutant: the second start succeeds');
    assert.ok(!first.equals(fs.readFileSync(fy.recordPath(fy.task1))), 'mutant: the record was overwritten');
  } finally { fy.cleanup(); }
});

// ── TB-16: adopt-request / adopt ──────────────────────────────────────────────────────────
test('TB-16: adopt-request prints the derived values and the exact line and writes nothing; adopt needs the exact single-use ADOPT line', () => {
  const fx = buildFixture();
  try {
    fx.commitIn(fx.slotA, { 'work/one/foo.txt': 'foo\n' });
    const dev = fx.advanceDev({ 'dev-only.txt': 'd\n' });
    fx.logLand('task/other', fx.base, dev);
    const before = snap(fx);
    const req = fx.tool('runAdoptRequest', fx.task1);
    assert.strictEqual(req.ok, true, JSON.stringify(req));
    assert.strictEqual(req.base, fx.base, 'base = merge-base(branch-dev, task)');
    const created = G(['log', '-g', '--date=unix', '--format=%gd%x1f%gs', 'refs/heads/task/one'], fx.canon).split('\n').filter(Boolean)
      .filter((l) => /branch: Created from/.test(l)).pop();
    const sec = Number(/@\{(\d+)\}/.exec(created)[1]);
    assert.strictEqual(req.startedAt, new Date(sec * 1000).toISOString(), 'startedAt = the branch creation reflog entry');
    const payload = 'ADOPT task/one ' + req.base + ' ' + req.startedAt;
    assert.strictEqual(req.approvalLine, fx.requireTool().approvalLine('adopt', payload, fx.commonDir));
    assert.deepStrictEqual(snap(fx), before, 'adopt-request writes nothing');
    assert.strictEqual(fx.hasRecord(fx.task1), false);
    // adopt without / with a stale / with a malformed approval -> refused, nothing written
    const refuseAdopt = (label) => {
      const b = snap(fx);
      const r = fx.tool('runAdopt', fx.task1);
      assert.strictEqual(r.ok, false, label);
      assert.match(r.reason, /no\/stale ADOPT approval/, label);
      assert.strictEqual(fx.hasRecord(fx.task1), false, label);
      assert.deepStrictEqual(snap(fx).canonRefs, b.canonRefs);
    };
    refuseAdopt('no approval');
    approvalFile(fx, 'adopt', 'ADOPT task/one ' + rev(fx.canon, 'main') + ' ' + req.startedAt);
    refuseAdopt('a stale base');
    approvalFile(fx, 'adopt', 'ADOPT task/one ' + req.base + ' 2020-01-01T00:00:00.000Z');
    refuseAdopt('a stale startedAt');
    approvalFile(fx, 'adopt', 'ADOPT task/two ' + req.base + ' ' + req.startedAt);
    refuseAdopt('another task');
    // the exact line -> adopted
    approvalFile(fx, 'adopt', payload);
    const a = fx.tool('runAdopt', fx.task1);
    assert.strictEqual(a.ok, true, JSON.stringify(a));
    const rec = fx.readRecord(fx.task1);
    assert.strictEqual(rec.adopted, true);
    assert.strictEqual(rec.history.length, 1);
    assert.strictEqual(rec.history[0].verb, 'adopt');
    assert.strictEqual(rec.base, fx.base);
    assert.strictEqual(rec.startedAt, req.startedAt);
    assert.strictEqual(rec.mainAtStart, rev(fx.canon, 'main'));
    assert.strictEqual(fs.existsSync(path.join(fx.commonDir, 'pt-adopt-approval')), false, 'the approval is single-use');
    const audit = lastAudit(fx);
    assert.strictEqual(audit.verb, 'adopt');
    assert.strictEqual(audit.result, 'ok');
    assert.strictEqual(audit.recordSha256, sha256(fs.readFileSync(fx.recordPath(fx.task1))));
    const i = fx.integrity();
    assert.strictEqual(i.ok, true, failText(i));
    assert.ok(i.report.some((l) => /adopted=true/.test(l)));
    // an existing record -> refused
    const again = fx.tool('runAdoptRequest', fx.task1);
    assert.strictEqual(again.ok, false);
    assert.match(again.reason, /record/i);
  } finally { fx.cleanup(); }
  // refusals
  const fm = buildFixture();
  try {
    rmrf(path.join(fm.commonDir, 'logs', 'refs', 'heads', 'task', 'one'));
    const r = fm.tool('runAdoptRequest', fm.task1);
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /reflog/i, 'a missing creation reflog');
  } finally { fm.cleanup(); }
  const fg = buildFixture();
  try {
    fg.commitIn(fg.slotA, { 'work/one/foo.txt': 'foo\n' });
    G(['checkout', '-q', '-b', 'side', fg.base], fg.canon);
    W(path.join(fg.canon, 'side.txt'), 's\n');
    G(['add', 'side.txt'], fg.canon);
    G(['commit', '-q', '-m', 'side'], fg.canon);
    G(['checkout', '-q', 'branch-dev'], fg.canon);
    G(['merge', '--no-ff', '-q', '-m', 'merge side into the task', 'side'], fg.slotA);
    const r = fg.tool('runAdoptRequest', fg.task1);
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /merge commit/i);
  } finally { fg.cleanup(); }
  const fr = buildFixture();
  try {
    const mb = fr.base;
    fr.appendAudit({ ts: '2026-10-05T10:00:00.000Z', verb: 'resync', task: fr.task1, mode: 'F', from: mb, to: mb, base: rev(fr.canon, 'main'), result: 'ok', reason: null });
    const bad = fr.tool('runAdoptRequest', fr.task1);
    assert.strictEqual(bad.ok, false);
    assert.match(bad.reason, /rebased outside resync/);
    const resyncTs = new Date().toISOString();
    fr.appendAudit({ ts: resyncTs, verb: 'resync', task: fr.task1, mode: 'F', from: mb, to: mb, base: mb, result: 'ok', reason: null });
    const good = fr.tool('runAdoptRequest', fr.task1);
    assert.strictEqual(good.ok, true, JSON.stringify(good));
    assert.strictEqual(good.startedAt, resyncTs, 'startedAt = the latest resync ts');
  } finally { fr.cleanup(); }
  // planted negative: the approval check dropped -> adopt accepts a present but stale approval (a missing approval file is also
  // stopped by the fail-closed deletion of the single-use approval, so the stale one is what isolates this check)
  const STALE_APPROVAL = 'ADOPT task/one ' + '0'.repeat(40) + ' 2020-01-01T00:00:00.000Z';
  const fc = buildFixture();
  try {
    approvalFile(fc, 'adopt', STALE_APPROVAL);
    const c = fc.tool('runAdopt', fc.task1);
    assert.strictEqual(c.ok, false, 'control: the intact tool rejects the stale approval');
    assert.match(c.reason, /^A5: no\/stale ADOPT approval/);
    assert.strictEqual(fc.hasRecord(fc.task1), false);
  } finally { fc.cleanup(); }
  const mut = mutantTool('adopt approval check dropped', [[A_APPROVAL, 'if (false) {']]);
  const fy = buildFixture({ toolSource: mut });
  try {
    approvalFile(fy, 'adopt', STALE_APPROVAL);
    const a = fy.tool('runAdopt', fy.task1);
    assert.strictEqual(a.ok, true, 'mutant: adopt succeeds with a stale approval record');
    assert.strictEqual(fy.hasRecord(fy.task1), true);
  } finally { fy.cleanup(); }
});

// ── TB-16b: the single-use ADOPT approval that cannot be deleted fails adopt closed ───────
const A_APR_FAILCLOSED = "return refuse('A6', 'could not delete the single-use ADOPT approval (";
const A_APR_ROLLBACK = "try { fs.unlinkSync(recPath); } catch (e2) { /* best effort - the approval could not be deleted: nothing may stay recorded */ }";
test('TB-16b: adopt whose single-use approval cannot be deleted refuses A6, leaves no record and appends no adopt line', () => {
  // The tool runs in this process, so fs.unlinkSync is made to fail for exactly the approval file (a real deletion failure).
  const scenario = (fx) => {
    fx.commitIn(fx.slotA, { 'work/one/foo.txt': 'foo\n' });
    const req = fx.tool('runAdoptRequest', fx.task1);
    assert.strictEqual(req.ok, true, JSON.stringify(req));
    approvalFile(fx, 'adopt', 'ADOPT task/one ' + req.base + ' ' + req.startedAt);
    const before = snap(fx);
    const auditBefore = fx.audit().length;
    const realUnlink = fs.unlinkSync;
    fs.unlinkSync = function (p) {
      if (path.basename(String(p)) === 'pt-adopt-approval') { const e = new Error('EPERM: operation not permitted (simulated)'); e.code = 'EPERM'; throw e; }
      return realUnlink.apply(this, arguments);
    };
    let r;
    try { r = fx.tool('runAdopt', fx.task1); } finally { fs.unlinkSync = realUnlink; }
    assert.strictEqual(r.ok, false, 'adopt must fail closed: ' + JSON.stringify(r));
    assert.match(r.reason, /^A6: could not delete the single-use ADOPT approval/, 'the brief-defined A6 refusal');
    assert.strictEqual(fx.hasRecord(fx.task1), false, 'the newly written record was rolled back');
    assert.strictEqual(fs.existsSync(path.join(fx.commonDir, 'pt-task', path.basename(fx.recordPath(fx.task1)))), false);
    assert.strictEqual(fs.existsSync(path.join(fx.commonDir, 'pt-adopt-approval')), true, 'the approval was not consumed');
    const added = fx.audit().slice(auditBefore);
    assert.ok(!added.some((l) => l.verb === 'adopt' && l.result === 'ok'), 'no adopt success audit line: ' + JSON.stringify(added));
    assert.deepStrictEqual(snap(fx).canonRefs, before.canonRefs, 'no ref moved');
  };
  const fx = buildFixture();
  try { scenario(fx); } finally { fx.cleanup(); }
  // positive control: with no failure injected the same fixture adopts (the scenario above fails only because of the injected failure)
  const fp = buildFixture();
  try {
    fp.commitIn(fp.slotA, { 'work/one/foo.txt': 'foo\n' });
    const req = fp.tool('runAdoptRequest', fp.task1);
    approvalFile(fp, 'adopt', 'ADOPT task/one ' + req.base + ' ' + req.startedAt);
    assert.strictEqual(fp.tool('runAdopt', fp.task1).ok, true, 'control: adopt succeeds when the approval can be deleted');
  } finally { fp.cleanup(); }
  // planted negatives (mutation on the production source): fail-closed dropped (the old swallowed unlink) and rollback dropped
  const swallowed = mutantTool('fail-closed dropped', [[A_APR_FAILCLOSED, "void ('A6', 'could not delete the single-use ADOPT approval ("]]);
  const fs1 = buildFixture({ toolSource: swallowed });
  try { assert.throws(() => scenario(fs1), assert.AssertionError, 'mutant: an undeletable approval no longer stops adopt'); } finally { fs1.cleanup(); }
  const noRollback = mutantTool('rollback dropped', [[A_APR_ROLLBACK, '/* rollback dropped */']]);
  const fs2 = buildFixture({ toolSource: noRollback });
  try { assert.throws(() => scenario(fs2), assert.AssertionError, 'mutant: the new record is left behind'); } finally { fs2.cleanup(); }
});

// ── TB-17: cleanup archives the record ────────────────────────────────────────────────────
test('TB-17: cleanup archives the record; a no-record cleanup is unchanged', () => {
  const landAndPush = (fx, slot, task, id) => {
    const tip = landableCommit(fx, slot, id);
    G(['merge', '--ff-only', '-q', task], fx.canon);
    G(['push', '-q', 'origin', 'branch-dev'], fx.canon);
    return tip;
  };
  const fx = buildFixture();
  try {
    assert.strictEqual(fx.start(fx.task1).ok, true);
    const bytes = fs.readFileSync(fx.recordPath(fx.task1));
    landAndPush(fx, fx.slotA, fx.task1, 'one');
    const r = fx.tool('runCleanup', fx.task1, { archiveRoot: path.join(fx.tmp, 'arch') });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(fx.hasRecord(fx.task1), false, 'the live record is gone');
    const dir = path.join(fx.commonDir, 'pt-task', 'archive');
    const names = fs.readdirSync(dir);
    assert.strictEqual(names.length, 1);
    assert.match(names[0], /^one\.\d{8}T\d{6}Z\.json$/);
    assert.ok(bytes.equals(fs.readFileSync(path.join(dir, names[0]))), 'archived bytes equal');
    assert.strictEqual(lastAudit(fx).recordArchived, true);
  } finally { fx.cleanup(); }
  const fn = buildFixture();
  try {
    landAndPush(fn, fn.slotB, fn.task2, 'two');
    const r = fn.tool('runCleanup', fn.task2, { archiveRoot: path.join(fn.tmp, 'arch') });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.ok(!('recordArchived' in lastAudit(fn)), 'no recordArchived key without a record');
    assert.strictEqual(fs.existsSync(path.join(fn.commonDir, 'pt-task')), false);
  } finally { fn.cleanup(); }
  // planted negative: the archive step dropped -> the record stays live
  const mut = mutantTool('archive dropped', [[A_ARCHIVE, '/* archive dropped */']]);
  const fy = buildFixture({ toolSource: mut });
  try {
    assert.strictEqual(fy.start(fy.task1).ok, true);
    landAndPush(fy, fy.slotA, fy.task1, 'one');
    assert.strictEqual(fy.tool('runCleanup', fy.task1, { archiveRoot: path.join(fy.tmp, 'arch') }).ok, true);
    assert.strictEqual(fy.hasRecord(fy.task1), true, 'mutant: the record was not moved');
  } finally { fy.cleanup(); }
});

// ── TB-18: the new verbs and integrity never move a ref ───────────────────────────────────
test('TB-18: task-start / adopt* / integrity never move a ref or write an approval record', () => {
  const fx = buildFixture();
  try {
    const refsBefore = [fx.refs(), fx.refs(fx.bareDir)];
    assert.strictEqual(fx.start(fx.task1).ok, true);
    const req = fx.tool('runAdoptRequest', fx.task2);
    assert.strictEqual(req.ok, true, JSON.stringify(req));
    approvalFile(fx, 'adopt', 'ADOPT task/two ' + req.base + ' ' + req.startedAt);
    const approvalsWithOwnerLine = fx.approvals();
    assert.strictEqual(fx.tool('runAdopt', fx.task2).ok, true);
    fx.integrity();
    fx.integrity({ task: fx.task2 });
    assert.deepStrictEqual([fx.refs(), fx.refs(fx.bareDir)], refsBefore, 'every ref is byte-identical');
    assert.ok(fx.approvals().every((n) => approvalsWithOwnerLine.indexOf(n) !== -1), 'no approval record was written by the tool');
    assert.deepStrictEqual(fx.approvals().filter((n) => n !== 'pt-adopt-approval'), []);
  } finally { fx.cleanup(); }
  // planted negative: a ref move planted in task-start is detected by the same comparison
  const mut = mutantTool('ref move planted', [[A_REF_POINT, A_REF_POINT + "\n    G(['update-ref', 'refs/heads/planted', tip], canonicalRoot);"]]);
  const fy = buildFixture({ toolSource: mut });
  try {
    const before = fy.refs();
    assert.strictEqual(fy.start(fy.task1).ok, true);
    assert.notStrictEqual(fy.refs(), before, 'the planted ref move is visible');
  } finally { fy.cleanup(); }
});

// ── TB-19: end to end ─────────────────────────────────────────────────────────────────────
test('TB-19: fork; another task LANDs (logged) and a brief is added; the task commits; integrity with no flags PASSes; LAND refuses (Second LAND); resync advances the record; integrity PASSes; LAND ok', () => {
  const fx = buildFixture();
  try {
    assert.strictEqual(fx.start(fx.task1).ok, true);
    const startedAt = fx.readRecord(fx.task1).startedAt;
    landableCommit(fx, fx.slotA, 'one');
    waitPast(startedAt);
    const dev1 = fx.advanceDev({ 'dev-only.txt': 'd\n' }, 'another task landed');
    fx.logLand('task/other', fx.base, dev1);
    const dev2 = fx.advanceDev({ 'work/three/brief.md': '# three\n' }, 'brief three');
    const i1 = fx.integrity();
    assert.strictEqual(i1.ok, true, failText(i1));
    assert.ok(i1.report.some((l) => l === 'chain land:' + fx.base + '..' + dev1));
    assert.ok(i1.report.some((l) => l === 'chain brief:' + dev2 + ' work/three/brief.md'));
    const refused = fx.tool('runLandRequest', fx.task1);
    assert.strictEqual(refused.ok, false);
    assert.match(refused.reason, /Second LAND/);
    const rs = fx.tool('runResync', fx.task1);
    assert.strictEqual(rs.ok, true, JSON.stringify(rs));
    assert.strictEqual(rs.mode, 'R');
    assert.strictEqual(fx.readRecord(fx.task1).base, dev2);
    const i2 = fx.integrity();
    assert.strictEqual(i2.ok, true, failText(i2));
    const lr = fx.tool('runLandRequest', fx.task1);
    assert.strictEqual(lr.ok, true, JSON.stringify(lr));
    approvalFile(fx, 'land', 'LAND task/one ' + lr.report.tip + ' ' + lr.report.base);
    const l = fx.tool('runLand', fx.task1);
    assert.strictEqual(l.ok, true, JSON.stringify(l));
    assert.strictEqual(rev(fx.canon, 'branch-dev'), lr.report.tip);
  } finally { fx.cleanup(); }
});

// ── summary ──────────────────────────────────────────────────────────────────────────────
for (const d of MUT_DIRS) rmrf(d);
meter.report(process.stdout, 'task-base');
if (failed > 0) {
  for (const f of failures) process.stdout.write('  FAIL  ' + f + '\n');
  process.stdout.write('\nOFFLINE VALIDATION (task-base record): FAIL (' + failed + '/' + (passed + failed) + ')\n');
  process.exit(1);
} else {
  process.stdout.write('  PASS  ' + passed + ' task-base record assertion(s) passed\n');
  process.stdout.write('OFFLINE VALIDATION (task-base record): PASS (' + passed + '/' + passed + ')\n');
  process.exit(0);
}
