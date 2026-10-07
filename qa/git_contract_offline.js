'use strict';
require('./lib/run-tmp').isolate('ptqa-gc-');
const meter = require('./lib/spawn-meter').install();

/*
 * qa/git_contract_offline.js - work/qa-stage2-git-contracts/brief.md §3.3 (GC-1 .. GC-4) and §3.6 (FP).
 *
 *   GC-1  the strict fake (qa/lib/git-fake.js): answers only from a transcript, in order; any other call throws UNSCRIPTED_GIT
 *   GC-2  the closed mutation classification, and "every subcommand in every transcript is classified"
 *   GC-3  the zero-process unchanged-state oracle with planted negatives
 *   FP    the execution-environment fingerprint (qa/lib/exec-env-fingerprint.js): every factor changes the digest
 *   GC-4  contract replay of every transcript against real Git, digest-gated (source digest + environment digest), executed in
 *         resumable batches of 10 scenarios (Owner ruling 2026-10-07): a memory check before each batch, every successful batch
 *         persisted, a rerun resumes from the first incomplete batch, and the pin verdict only after ALL scenarios completed
 *
 * Offline: no network. GC-1..GC-3 and FP start no Git process except the fingerprint's two reads; every file lives under the private
 * run root of qa/lib/run-tmp.js. Planted negatives alter the production helper's input (a transcript, a snapshot, a source byte) and
 * the same check must then fail.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FAKE = require('./lib/git-fake');
const T = require('./lib/git-transcript');
const FP = require('./lib/exec-env-fingerprint');

let passed = 0;
let failed = 0;
const failures = [];
function test(name, fn) {
  meter.beginRow(name); try {
    try { fn(); passed += 1; } catch (e) { failed += 1; failures.push(name + ' -- ' + (e && e.message ? e.message : String(e))); }
  } finally { meter.endRow(); }
}
function W(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
function throwsWith(fn, re, what) {
  let msg = null;
  try { fn(); } catch (e) { msg = e && e.message ? e.message : String(e); }
  assert.ok(msg !== null, what + ': expected a throw');
  assert.match(msg, re, what + ': wrong message: ' + msg);
}

// ── a private skeleton the synthetic "tool" copies live in ───────────────────────────────────
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-'));
let n = 0;
function skeleton() {
  n += 1;
  const fx = path.join(BASE, 'fx' + n);
  const canon = path.join(fx, 'portfolio-tracker');
  const slotA = path.join(fx, 'pt-wt-worker-a');
  fs.mkdirSync(path.join(canon, '.claude', 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(canon, '.git'), { recursive: true });
  fs.mkdirSync(path.join(canon, 'qa'), { recursive: true });
  fs.mkdirSync(slotA, { recursive: true });
  const ctx = T.makeContext({ canon, slotA, fx, tmp: os.tmpdir() });
  return { fx, canon, slotA, ctx, tool: path.join(canon, '.claude', 'hooks', 'pt-land.js'), integrity: path.join(canon, 'qa', 'guard_integrity_check.js') };
}
const TOOL_SRC = [
  "'use strict';",
  "const { spawnSync } = require('child_process');",
  "exports.git = function (args, cwd, opts) { return spawnSync('git', args, Object.assign({ cwd, encoding: 'utf8' }, opts || {})); };",
  "exports.swallow = function (args, cwd) { try { return spawnSync('git', args, { cwd, encoding: 'utf8' }); } catch (e) { return { caught: e.message }; } };",
  "exports.other = function () { return spawnSync('node', ['-v'], { encoding: 'utf8' }); };",
  "exports.exec = function () { return require('child_process').execSync('git status'); };",
  "exports.spawn = function () { return require('child_process').spawn('git', ['status']); };",
  "exports.execFile = function () { return require('child_process').execFileSync('git', ['status']); };",
  "exports.fork = function () { return require('child_process').fork('x.js'); };"
].join('\n') + '\n';
function loadTool(sk, src) {
  W(sk.tool, src || TOOL_SRC);
  delete require.cache[require.resolve(sk.tool)];
  return require(sk.tool);
}
function entry(argv, stdout, o) {
  o = o || {};
  return { argv, cwd: o.cwd || '<canon>', enc: o.enc || 'utf8', stdin: o.stdin === undefined ? null : o.stdin, status: o.status === undefined ? 0 : o.status, stdout: stdout || '', stderr: o.stderr || '' };
}
function session(sk, calls) { return { calls, ctx: sk.ctx, scopeRoot: sk.fx }; }

// ═════════════ GC-1: the strict fake ═════════════════════════════════════════════════════════════
test('GC-1: a scripted call is answered exactly (status, stdout, stderr, signal null) and the transcript must be fully consumed', () => {
  const sk = skeleton();
  const res = FAKE.withFakeGit(session(sk, [entry(['rev-parse', 'HEAD'], '<oid:1>\n', { stderr: 'warn\n', status: 0 })]), () => {
    const tool = loadTool(sk);
    return tool.git(['rev-parse', 'HEAD'], sk.canon);
  });
  assert.strictEqual(res.value.status, 0);
  assert.strictEqual(res.value.stdout, T.syntheticOid(1) + '\n', '<oid:1> is answered with the synthetic id');
  assert.strictEqual(res.value.stderr, 'warn\n');
  assert.strictEqual(res.value.signal, null);
  assert.strictEqual(res.recorded.length, 1);
  assert.strictEqual(res.recorded[0].kind, 'read-only');
});
test('GC-1 negative: an unscripted call (wrong argv) throws UNSCRIPTED_GIT', () => {
  const sk = skeleton();
  throwsWith(() => FAKE.withFakeGit(session(sk, [entry(['rev-parse', 'HEAD'], 'x')]), () => loadTool(sk).git(['status'], sk.canon)), /UNSCRIPTED_GIT/, 'wrong argv');
});
test('GC-1 negative: calls in the wrong order throw UNSCRIPTED_GIT', () => {
  const sk = skeleton();
  const calls = [entry(['rev-parse', 'HEAD'], 'a'), entry(['status'], 'b')];
  throwsWith(() => FAKE.withFakeGit(session(sk, calls), () => { const t = loadTool(sk); t.git(['status'], sk.canon); t.git(['rev-parse', 'HEAD'], sk.canon); }), /UNSCRIPTED_GIT/, 'order');
});
test('GC-1 negative: an extra call beyond the transcript throws UNSCRIPTED_GIT', () => {
  const sk = skeleton();
  throwsWith(() => FAKE.withFakeGit(session(sk, [entry(['status'], '')]), () => { const t = loadTool(sk); t.git(['status'], sk.canon); t.git(['status'], sk.canon); }), /UNSCRIPTED_GIT.*beyond/, 'extra');
});
test('GC-1 negative: a scripted call the tool never makes (stopped early) fails the session', () => {
  const sk = skeleton();
  throwsWith(() => FAKE.withFakeGit(session(sk, [entry(['status'], ''), entry(['log'], '')]), () => { loadTool(sk).git(['status'], sk.canon); }), /stopped early/, 'unconsumed');
});
test('GC-1 negative: a non-git executable throws UNSCRIPTED_GIT', () => {
  const sk = skeleton();
  throwsWith(() => FAKE.withFakeGit(session(sk, []), () => loadTool(sk).other()), /UNSCRIPTED_GIT non-git/, 'node');
});
test('GC-1 negative: exec, execSync, execFile, execFileSync, spawn and fork all throw under the fake', () => {
  const sk = skeleton();
  for (const verb of ['exec', 'spawn', 'execFile', 'fork']) {
    throwsWith(() => FAKE.withFakeGit(session(sk, []), () => loadTool(sk)[verb]()), /UNSCRIPTED_GIT child_process\./, verb);
  }
});
test('GC-1: the fake is scoped - a pt-land.js outside the private root, and any other module under it, get the REAL child_process', () => {
  const sk = skeleton();
  const outside = path.join(BASE, 'outside', 'pt-land.js');
  W(outside, "'use strict';\nexports.cp = require('child_process');\n");
  const inside = path.join(sk.fx, 'other-module.js');
  W(inside, "'use strict';\nexports.cp = require('child_process');\n");
  FAKE.withFakeGit(session(sk, []), () => {
    delete require.cache[require.resolve(outside)]; delete require.cache[require.resolve(inside)];
    assert.strictEqual(require(outside).cp, require('child_process'), 'a tool copy outside the scope root keeps the real module');
    assert.strictEqual(require(inside).cp, require('child_process'), 'an unrelated module under the scope root keeps the real module');
    const sk2 = loadTool(sk);
    assert.notStrictEqual(sk2, undefined);
  });
});
test('GC-1: the hook is removed in finally (also when the callback throws) and the integrity module copy is scoped too', () => {
  const sk = skeleton();
  const Module = require('module');
  const before = Module._load;
  throwsWith(() => FAKE.withFakeGit(session(sk, []), () => { throw new Error('boom'); }), /boom/, 'callback');
  assert.strictEqual(Module._load, before, 'Module._load is restored after a throw');
  W(sk.integrity, "'use strict';\nexports.cp = require('child_process');\n");
  FAKE.withFakeGit(session(sk, []), () => {
    delete require.cache[require.resolve(sk.integrity)];
    assert.notStrictEqual(require(sk.integrity).cp, require('child_process'), 'the integrity module copy under the root gets the fake');
  });
  assert.strictEqual(Module._load, before, 'Module._load is restored after a normal run');
});
test('GC-1: a violation the tool swallows in its own try/catch still fails the session', () => {
  const sk = skeleton();
  throwsWith(() => FAKE.withFakeGit(session(sk, [entry(['status'], '')]), () => {
    const out = loadTool(sk).swallow(['log'], sk.canon);
    assert.ok(out.caught && /UNSCRIPTED_GIT/.test(out.caught), 'the tool saw the throw and swallowed it');
  }), /UNSCRIPTED_GIT/, 'swallowed violation');
});
test('GC-1: cwd, encoding and stdin are part of the match; a buffer call is answered with a Buffer', () => {
  const sk = skeleton();
  const input = Buffer.from('patch bytes\n', 'latin1');
  const stdin = T.stdinDigest(input, sk.ctx, T.newState(0));
  const ok = FAKE.withFakeGit(session(sk, [entry(['patch-id', '--stable'], 'bytes', { enc: 'buffer', stdin })]), () => loadTool(sk).git(['patch-id', '--stable'], sk.canon, { encoding: 'buffer', input }));
  assert.ok(Buffer.isBuffer(ok.value.stdout) && ok.value.stdout.toString('latin1') === 'bytes');
  const bad = (calls, run) => throwsWith(() => FAKE.withFakeGit(session(sk, calls), () => run(loadTool(sk))), /UNSCRIPTED_GIT/);
  bad([entry(['status'], '', { cwd: '<slotA>' })], (t) => t.git(['status'], sk.canon));
  bad([entry(['status'], '', { enc: 'buffer' })], (t) => t.git(['status'], sk.canon));
  bad([entry(['patch-id'], '', { enc: 'buffer', stdin })], (t) => t.git(['patch-id'], sk.canon, { encoding: 'buffer', input: Buffer.from('other\n') }));
});
test('GC-1: a path inside the skeleton is matched by role, so the same transcript replays in a different directory', () => {
  const a = skeleton();
  const b = skeleton();
  const calls = [entry(['rev-parse', '--show-toplevel'], '<canon>\n'), entry(['worktree', 'list'], '<slotA> <oid:1>\n')];
  for (const sk of [a, b]) {
    const res = FAKE.withFakeGit(session(sk, calls), () => {
      const t = loadTool(sk);
      return [t.git(['rev-parse', '--show-toplevel'], sk.canon).stdout, t.git(['worktree', 'list'], sk.canon).stdout];
    });
    assert.strictEqual(res.value[0], sk.canon.replace(/\\/g, '/') + '\n');
    assert.strictEqual(res.value[1], sk.slotA.replace(/\\/g, '/') + ' ' + T.syntheticOid(1) + '\n');
  }
});

// ═════════════ GC-2: classification ══════════════════════════════════════════════════════════════
test('GC-2: every subcommand of the brief\'s read-only list is read-only', () => {
  for (const sub of ['rev-parse', 'status', 'log', 'rev-list', 'cat-file', 'show', 'ls-files', 'ls-tree', 'for-each-ref', 'show-ref', 'merge-base', 'diff', 'diff-tree', 'patch-id']) {
    assert.strictEqual(FAKE.classify([sub, 'x']), 'read-only', sub);
  }
  assert.strictEqual(FAKE.classify(['worktree', 'list', '--porcelain']), 'read-only');
  assert.strictEqual(FAKE.classify(['--version']), 'read-only');
  assert.strictEqual(FAKE.classify(['version', '--build-options']), 'read-only');
  assert.strictEqual(FAKE.classify(['config', '--list', '--null']), 'read-only');
  assert.strictEqual(FAKE.classify(['config', '--get-all', 'remote.origin.url']), 'read-only');
  assert.strictEqual(FAKE.classify(['symbolic-ref', '-q', 'HEAD']), 'read-only');
  assert.strictEqual(FAKE.classify(['symbolic-ref', 'HEAD']), 'read-only');
  assert.strictEqual(FAKE.classify(['hash-object', '--path=x', '--', 'f']), 'read-only');
});
test('GC-2: mutating, object-only and remote-read subcommands are classified as such; the -c prefix is skipped', () => {
  for (const sub of ['update-ref', 'commit', 'commit-tree', 'merge', 'reset', 'checkout', 'switch', 'branch', 'push', 'tag', 'add', 'rm', 'rebase', 'cherry-pick', 'stash']) {
    assert.strictEqual(FAKE.classify([sub, 'x']), 'mutating', sub);
  }
  for (const argv of [['worktree', 'add', 'x'], ['worktree', 'remove', 'x'], ['worktree', 'prune'], ['config', 'user.name', 'x'], ['config', 'core.hooksPath', 'x'], ['symbolic-ref', 'HEAD', 'refs/heads/x'], ['symbolic-ref', '-d', 'HEAD']]) {
    assert.strictEqual(FAKE.classify(argv), 'mutating', argv.join(' '));
  }
  assert.strictEqual(FAKE.classify(['hash-object', '-w', '--path=x', '--', 'f']), 'object-only');
  for (const sub of ['write-tree', 'read-tree', 'update-index']) {
    assert.strictEqual(FAKE.classify([sub], { GIT_INDEX_FILE: 'x' }), 'object-only', sub + ' with a temporary index');
    assert.strictEqual(FAKE.classify([sub], {}), 'mutating', sub + ' without one');
  }
  assert.strictEqual(FAKE.classify(['ls-remote', 'origin']), 'remote-read');
  assert.strictEqual(FAKE.classify(['-c', 'core.hooksPath=/x', 'merge', '--ff-only', 'refs/heads/t']), 'mutating', 'the value of -c is not the subcommand');
  assert.strictEqual(FAKE.classify(['-c', 'core.hooksPath=/x', 'status']), 'read-only');
});
test('GC-2 negative: an unlisted subcommand, an empty argv and an option-only argv are mutating (the default)', () => {
  assert.strictEqual(FAKE.classify(['frobnicate']), 'mutating');
  assert.strictEqual(FAKE.classify([]), 'mutating');
  assert.strictEqual(FAKE.classify(['--no-pager']), 'mutating');
  assert.strictEqual(FAKE.isExplicitlyClassified(['frobnicate']), false, 'an unlisted subcommand is not "classified"');
  assert.strictEqual(FAKE.isExplicitlyClassified(['status']), true);
  assert.strictEqual(FAKE.isExplicitlyClassified(['update-ref', 'x']), true);
});
const TRANSCRIPT_DIR = path.join(ROOT, 'qa', 'fixtures', 'git-contract');
function transcriptFiles() {
  if (!fs.existsSync(TRANSCRIPT_DIR)) return [];
  return fs.readdirSync(TRANSCRIPT_DIR).filter((f) => /\.json$/.test(f)).sort().map((f) => path.join(TRANSCRIPT_DIR, f));
}
// A family document is { version, family, pools: { key: calls[] }, scenarios: { id: { invocations: [{ pool, ... }] } } } (identical call
// lists are stored once, in a pool); an invocation's calls are inv.calls when inlined, else doc.pools[inv.pool].
test('GC-2: every subcommand used by every recorded transcript is explicitly classified (none falls through to the default)', () => {
  let scenarios = 0;
  let calls = 0;
  for (const f of transcriptFiles()) {
    const doc = T.load(f);
    assert.ok(doc && doc.scenarios && doc.pools, path.basename(f) + ': not a family document');
    for (const id of Object.keys(doc.scenarios)) {
      scenarios += 1;
      for (const inv of doc.scenarios[id].invocations) {
        const list = inv.calls || doc.pools[inv.pool];
        assert.ok(Array.isArray(list), path.basename(f) + ' ' + id + ': the invocation has no call list (pool ' + inv.pool + ')');
        for (const c of list) { calls += 1; assert.ok(FAKE.isExplicitlyClassified(c.argv), path.basename(f) + ' ' + id + ': unclassified ' + JSON.stringify(c.argv)); }
      }
    }
  }
  assert.ok(scenarios > 0 && calls > 0, 'the check is not vacuous: ' + scenarios + ' scenario(s), ' + calls + ' call(s)');
  process.stdout.write('  NOTE  GC-2: ' + calls + ' recorded Git calls over ' + scenarios + ' scenarios, all explicitly classified\n');
});

// ═════════════ GC-3: the oracle ══════════════════════════════════════════════════════════════════
function oracleFixture() {
  const sk = skeleton();
  W(path.join(sk.canon, '.git', 'pt-land-log'), '{"a":1}\n');
  W(path.join(sk.canon, '.git', 'hooks', 'pre-commit.sample'), 'x\n');
  W(path.join(sk.slotA, 'work', 'x', 'foo.txt'), 'impl\n');
  const dirs = [path.join(sk.canon, '.git'), sk.slotA];
  const audit = path.join(sk.canon, '.git', 'pt-land-log');
  return { sk, dirs, audit, before: FAKE.snapshotDirs(dirs) };
}
const READS = [{ argv: ['status'], kind: 'read-only' }, { argv: ['rev-parse', 'HEAD'], kind: 'read-only' }];
test('GC-3: no mutating call and equal snapshots -> the oracle is true (a lock created and released leaves no trace)', () => {
  const o = oracleFixture();
  W(path.join(o.sk.canon, '.git', 'pt-land.lock'), '');
  fs.unlinkSync(path.join(o.sk.canon, '.git', 'pt-land.lock'));
  assert.strictEqual(FAKE.oracle(READS, o.dirs, o.before), true);
});
test('GC-3 negative: a scripted update-ref (or any mutating call) in a refusal makes the oracle false', () => {
  const o = oracleFixture();
  assert.strictEqual(FAKE.oracle(READS.concat([{ argv: ['update-ref', 'refs/heads/x', 'a'], kind: 'mutating' }]), o.dirs, o.before), false);
  assert.strictEqual(FAKE.oracle(READS.concat([{ argv: ['frobnicate'], kind: FAKE.classify(['frobnicate']) }]), o.dirs, o.before), false, 'unlisted = mutating');
});
test('GC-3 negative: a write into the common dir, a changed or deleted slot file and a new slot file each make the oracle false', () => {
  const edits = [
    (o) => W(path.join(o.sk.canon, '.git', 'pt-land-approval'), 'LAND\n'),
    (o) => W(path.join(o.sk.slotA, 'work', 'x', 'foo.txt'), 'changed\n'),
    (o) => fs.unlinkSync(path.join(o.sk.slotA, 'work', 'x', 'foo.txt')),
    (o) => W(path.join(o.sk.slotA, 'new.txt'), 'n\n'),
    (o) => fs.unlinkSync(path.join(o.sk.canon, '.git', 'hooks', 'pre-commit.sample'))
  ];
  for (const edit of edits) {
    const o = oracleFixture();
    edit(o);
    const d = FAKE.oracleDetail(READS, o.dirs, o.before);
    assert.strictEqual(d.ok, false);
    assert.ok(d.reasons.some((r) => /^changed: /.test(r)), 'the change is named: ' + d.reasons.join(' | '));
  }
});
test('GC-3: the expected audit line is allowed - exactly the named file, only appended whole lines, at most the allowed count', () => {
  const o = oracleFixture();
  fs.appendFileSync(o.audit, '{"b":2}\n');
  assert.strictEqual(FAKE.oracle(READS, o.dirs, o.before, { file: o.audit, maxNewLines: 1 }), true, 'one appended line');
  assert.strictEqual(FAKE.oracle(READS, o.dirs, o.before), false, 'without the allowance the same append fails');
  fs.appendFileSync(o.audit, '{"c":3}\n');
  assert.strictEqual(FAKE.oracle(READS, o.dirs, o.before, { file: o.audit, maxNewLines: 1 }), false, 'two lines against an allowance of one');
  assert.strictEqual(FAKE.oracle(READS, o.dirs, o.before, { file: o.audit, maxNewLines: 2 }), true, 'two lines against an allowance of two');
});
test('GC-3 negative: a rewritten or truncated audit file, and an append to a different file, are not "an expected audit line"', () => {
  const o1 = oracleFixture();
  W(o1.audit, '{"a":9}\n');
  assert.strictEqual(FAKE.oracle(READS, o1.dirs, o1.before, { file: o1.audit, maxNewLines: 5 }), false, 'rewritten');
  const o2 = oracleFixture();
  W(o2.audit, '');
  assert.strictEqual(FAKE.oracle(READS, o2.dirs, o2.before, { file: o2.audit, maxNewLines: 5 }), false, 'truncated');
  const o3 = oracleFixture();
  fs.appendFileSync(path.join(o3.sk.slotA, 'work', 'x', 'foo.txt'), 'more\n');
  assert.strictEqual(FAKE.oracle(READS, o3.dirs, o3.before, { file: o3.audit, maxNewLines: 5 }), false, 'append to another file');
  const o4 = oracleFixture();
  fs.appendFileSync(o4.audit, '{"partial"');
  assert.strictEqual(FAKE.oracle(READS, o4.dirs, o4.before, { file: o4.audit, maxNewLines: 5 }), false, 'a partial line');
});
test('GC-3: object-only and remote-read calls pass only where the row allows them', () => {
  const o = oracleFixture();
  const calls = READS.concat([{ argv: ['hash-object', '-w', 'f'], kind: 'object-only' }, { argv: ['ls-remote', 'origin'], kind: 'remote-read' }]);
  assert.strictEqual(FAKE.oracle(calls, o.dirs, o.before), false);
  assert.strictEqual(FAKE.oracle(calls, o.dirs, o.before, null, ['object-only']), false, 'remote-read still not allowed');
  assert.strictEqual(FAKE.oracle(calls, o.dirs, o.before, null, ['object-only', 'remote-read']), true);
});

// ═════════════ FP: the execution-environment fingerprint ═══════════════════════════════════════
let GC4_SKIPPED_BY_FLAG = false; // set only by the manual --no-gc4 development flag; such a run exits 2 and is never a valid run
let REAL_ENV = null; // the environment fingerprint of this run (read once, by the FP row below; GC-4 reuses it)
const CFG = (pairs) => pairs.map(([k, v]) => 'system\0file:/etc/gitconfig\0' + k + '\n' + v + '\0').join('');
const BUILD = 'git version 2.53.0.windows.2\ncpu: x86_64\nbuilt from commit: abc\nfeature: fsmonitor--daemon\n';
function facts(over) {
  return Object.assign({
    platform: 'win32', arch: 'x64', osRelease: '10.0.22631', fsCaseInsensitive: true, fsSymlinks: false,
    gitBuildOptions: BUILD, configZ: CFG([['core.autocrlf', 'true'], ['http.sslbackend', 'schannel'], ['user.name', 'Test']]),
    env: { LANG: 'en_US', TZ: 'UTC', HOME: '/home/x' }, nodeMajor: 24
  }, over || {});
}
const DIGEST0 = FP.fromFacts(facts()).digest;
test('FP: the digest is deterministic and every factor of brief §3.6 changes it (planted alterations of a synthetic snapshot)', () => {
  assert.strictEqual(FP.fromFacts(facts()).digest, DIGEST0, 'deterministic');
  const variants = {
    platform: facts({ platform: 'linux' }), arch: facts({ arch: 'arm64' }), osRelease: facts({ osRelease: '10.0.1' }),
    caseInsensitive: facts({ fsCaseInsensitive: false }), symlinks: facts({ fsSymlinks: true }),
    gitBuild: facts({ gitBuildOptions: BUILD.replace('2.53.0', '2.54.0') }),
    gitFeature: facts({ gitBuildOptions: BUILD.replace('fsmonitor--daemon', 'none') }),
    autocrlf: facts({ configZ: CFG([['core.autocrlf', 'false'], ['http.sslbackend', 'schannel'], ['user.name', 'Test']]) }),
    eol: facts({ configZ: CFG([['core.autocrlf', 'true'], ['core.eol', 'lf'], ['http.sslbackend', 'schannel'], ['user.name', 'Test']]) }),
    extraKey: facts({ configZ: CFG([['core.autocrlf', 'true'], ['http.sslbackend', 'schannel'], ['merge.ff', 'false'], ['user.name', 'Test']]) }),
    lang: facts({ env: { LANG: 'de_DE', TZ: 'UTC', HOME: '/home/x' } }), lcAll: facts({ env: { LANG: 'en_US', LC_ALL: 'C', TZ: 'UTC', HOME: '/home/x' } }),
    tz: facts({ env: { LANG: 'en_US', TZ: 'Asia/Jerusalem', HOME: '/home/x' } }), home: facts({ env: { LANG: 'en_US', TZ: 'UTC', HOME: '/home/y' } }),
    xdg: facts({ env: { LANG: 'en_US', TZ: 'UTC', HOME: '/home/x', XDG_CONFIG_HOME: '/c' } }),
    gitVar: facts({ env: { LANG: 'en_US', TZ: 'UTC', HOME: '/home/x', GIT_EDITOR: 'true' } }),
    node: facts({ nodeMajor: 22 })
  };
  for (const k of Object.keys(variants)) assert.notStrictEqual(FP.fromFacts(variants[k]).digest, DIGEST0, 'factor ' + k + ' changes the digest');
});
test('FP: only identity, editors and aliases are excluded - changing them does NOT change the digest (positive control)', () => {
  for (const [k, v] of [['user.name', 'Someone Else'], ['user.email', 'x@y'], ['credential.helper', 'store'], ['core.editor', 'vim'], ['core.pager', 'less'], ['sequence.editor', 'x'], ['gui.font', 'f'], ['alias.st', 'status']]) {
    const f = facts({ configZ: CFG([['core.autocrlf', 'true'], ['http.sslbackend', 'schannel'], ['user.name', 'Test'], [k, v]]) });
    assert.strictEqual(FP.fromFacts(f).digest, DIGEST0, k + ' is excluded');
  }
  assert.strictEqual(FP.fromFacts(facts({ configZ: CFG([['core.autocrlf', 'true'], ['http.sslbackend', 'schannel'], ['user.name', 'Test'], ['pull.rebase', 'true']]) })).digest === DIGEST0, false, 'an unexcluded key counts');
});
test('FP: the readable manifest holds platform fields, the Git version line and the explicit core.* fields - no URL, credential or path', () => {
  const f = facts({ configZ: CFG([['core.autocrlf', 'true'], ['core.eol', 'lf'], ['core.hooksPath', 'C:/secret/hooks'], ['core.excludesFile', '/home/x/.gitignore'],
    ['remote.origin.url', 'https://user:pw@example.com/r.git'], ['credential.helper', 'store --file=/home/x/.cred'], ['url.https://a/.insteadOf', 'b']]) });
  const m = FP.fromFacts(f).manifest;
  const text = JSON.stringify(m);
  assert.strictEqual(m.gitVersion, 'git version 2.53.0.windows.2');
  assert.strictEqual(m.platform, 'win32');
  assert.strictEqual(m.core.autocrlf, 'true');
  assert.strictEqual(m.core.eol, 'lf');
  assert.strictEqual(m.core.hookspath, 'set', 'a path-valued key is reduced to "set"');
  assert.strictEqual(m.core.excludesfile, 'set');
  for (const bad of ['://', 'secret', 'user:pw', 'example.com', '.cred', '.gitignore', 'C:/', '/home/x']) assert.ok(text.indexOf(bad) === -1, 'the manifest must not contain ' + bad);
  assert.ok(!/[A-Za-z]:[\\/]/.test(text), 'no drive path');
});
test('FP: reading the real environment costs exactly 2 Git starts (git version --build-options, one git config --list --show-scope --show-origin -z) and is stable', () => {
  const calls = [];
  const real = require('child_process').spawnSync;
  const spy = function counting(file, args, opts) { calls.push({ file, args: args.slice(), cwd: opts && opts.cwd }); return real.apply(this, arguments); };
  const a = FP.collect({ spawn: spy });
  assert.strictEqual(calls.length, 2, 'two starts');
  assert.deepStrictEqual(calls[0].args, ['version', '--build-options']);
  assert.deepStrictEqual(calls[1].args, ['config', '--list', '--show-scope', '--show-origin', '-z']);
  assert.ok(calls.every((c) => c.file === 'git' && c.cwd === os.tmpdir()), 'run from the private root, outside any repository');
  const b = FP.collect({});
  REAL_ENV = a;
  assert.strictEqual(a.digest, b.digest, 'two reads in one environment agree');
  assert.match(a.digest, /^[0-9a-f]{64}$/);
  assert.strictEqual(a.manifest.platform, process.platform);
  assert.strictEqual(a.manifest.nodeMajor, Number(process.versions.node.split('.')[0]));
});

// ═════════════ GC-4: contract replay against real Git, digest-gated ═══════════════════════════════
// The proof that the recorded transcripts still describe what real Git does for the land tool. It is expensive (every scenario is run
// again on real Git), so it runs whenever any input changed or the environment is not a proven one, and is skipped only when BOTH
// digests match the pin (brief §3.3). Evidence is never reused across a different environment.
//   source digest      = sha256 over the (line-ending-normalised) bytes of: the land tool, its integrity module, qa/lib/fixture-template.js,
//                        the extracted builder sources of both land suites, the recorder and transcript helper (they define the scenarios
//                        and the normalisation) and every transcript file;
//   environment digest = the execution-environment fingerprint of qa/lib/exec-env-fingerprint.js (brief §3.6).
// GIT_CONTRACT_PIN holds one source digest and the SET of environment digests proven for it. A task that changes an input re-proves and
// re-pins in its own diff; a further environment is added only by a later task with evidence.
const GIT_CONTRACT_PIN = {
  // set 2026-10-07 from the completed batched real replay (16/16 batches, 153/153 identical; Owner-approved)
  source: '77a1bc916bd33be923118365cdbd0e355b4d6ca72ec314a7e86ae65242b53cb5',
  environments: ['ef28452b4eb84527b7208fc76792410d4948cc9d0fa91173a94c79edefa90858'] // the Worker A laptop environment that ran the replay
};
const REC = require('./tools/record-git-transcripts');
function lfBytes(file) { return Buffer.from(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), 'utf8'); }
function sourceParts() {
  const parts = [];
  for (const rel of ['.claude/hooks/pt-land.js', 'qa/guard_integrity_check.js', 'qa/lib/fixture-template.js', 'qa/tools/record-git-transcripts.js', 'qa/lib/git-transcript.js']) {
    parts.push({ name: rel, bytes: lfBytes(path.join(ROOT, rel)) });
  }
  REC.landHelperSources().forEach((s, i) => parts.push({ name: 'land-builder#' + i, bytes: Buffer.from(s, 'utf8') }));
  const rsSrc = fs.readFileSync(REC.RESYNC_SUITE, 'utf8').replace(/\r\n/g, '\n');
  parts.push({ name: 'resync-builder', bytes: Buffer.from(REC.extractFunction(rsSrc, 'buildFixture'), 'utf8') });
  for (const f of transcriptFiles()) parts.push({ name: 'transcript/' + path.basename(f), bytes: lfBytes(f) });
  return parts;
}
const digestParts = FP.digestParts;
const gateDecision = FP.gateDecision; // 'skip' | 'replay-notice' (replay; pass with a notice) | 'replay-fail' (replay; then fail "re-pin required")
test('GC-4 gate: the decision table - both digests pinned -> skip; unpinned environment -> replay, pass with a notice; changed source -> replay, then fail "re-pin required"', () => {
  const pin = { source: 'S', environments: ['E1', 'E2'] };
  assert.strictEqual(gateDecision('S', 'E1', pin), 'skip');
  assert.strictEqual(gateDecision('S', 'E2', pin), 'skip');
  assert.strictEqual(gateDecision('S', 'E3', pin), 'replay-notice', 'evidence is never reused across a different environment');
  assert.strictEqual(gateDecision('S2', 'E1', pin), 'replay-fail', 'a changed source never skips');
  assert.strictEqual(gateDecision('S2', 'E3', pin), 'replay-fail');
  assert.strictEqual(gateDecision('S', 'E1', { source: null, environments: [] }), 'replay-fail', 'an empty pin never skips');
  assert.strictEqual(gateDecision('S', 'E1', { source: 'S', environments: [] }), 'replay-notice', 'a source pin without a proven environment never skips');
});
test('GC-4 negative: a one-byte change to ANY source input changes the source digest (each class of input)', () => {
  const parts = sourceParts();
  const base = digestParts(parts);
  assert.strictEqual(digestParts(sourceParts()), base, 'deterministic');
  assert.ok(parts.some((p) => p.name === '.claude/hooks/pt-land.js') && parts.some((p) => p.name === 'qa/guard_integrity_check.js') &&
    parts.some((p) => p.name === 'qa/lib/fixture-template.js') && parts.some((p) => /^land-builder#/.test(p.name)) && parts.some((p) => p.name === 'resync-builder') &&
    parts.some((p) => /^transcript\//.test(p.name)), 'every class of input is part of the digest');
  for (let i = 0; i < parts.length; i += 1) {
    const changed = parts.map((p, j) => (j === i ? { name: p.name, bytes: Buffer.concat([p.bytes, Buffer.from(' ')]) } : p));
    assert.notStrictEqual(digestParts(changed), base, 'one byte appended to ' + parts[i].name);
  }
  const dropped = parts.slice(1);
  assert.notStrictEqual(digestParts(dropped), base, 'a removed input');
  const crlf = parts.map((p) => ({ name: p.name, bytes: Buffer.from(p.bytes.toString('utf8').replace(/\n/g, '\r\n'), 'utf8') }));
  assert.strictEqual(digestParts(crlf.map((p) => ({ name: p.name, bytes: Buffer.from(p.bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8') }))), base, 'line endings are normalised before hashing (a CRLF checkout is the same source)');
});
// Re-runs ONE scenario on real Git and compares it with its stored transcript; returns the list of differences (empty = identical).
// This is the whole contract semantics of a scenario: calls, result, opts, file-system inputs, audit-line count and the real
// "nothing changed" verdict must all equal the stored transcript. Nothing below changes what is compared, only how the 153 runs are
// scheduled.
function replayOne(scn, families) {
  const diffs = [];
  const doc = families[scn.family];
  const stored = doc && doc.scenarios[scn.id];
  if (!stored) { diffs.push(scn.id + ': no stored transcript'); return diffs; }
  let fresh;
  try { fresh = REC.recordScenario(scn); } catch (e) { diffs.push(scn.id + ': real run failed: ' + String(e.message).split('\n')[0].slice(0, 300)); return diffs; }
  const sInv = stored.invocations[0];
  const fInv = fresh.entry.invocations[0];
  for (const [what, a, b] of [['calls', fInv.calls, doc.pools[sInv.pool]], ['result', fInv.result, sInv.result], ['opts', fInv.opts, sInv.opts], ['file-system inputs', fresh.entry.fs, stored.fs], ['audit lines', fInv.audit, sInv.audit]]) {
    if (!T.sameValue(a, b)) diffs.push(scn.id + ': ' + what + ' differ from the stored transcript');
  }
  if (fInv.realUnchanged !== sInv.realUnchanged) diffs.push(scn.id + ': the real "nothing changed" verdict differs');
  return diffs;
}

// ── GC-4 execution shape: resumable batches (Owner ruling 2026-10-07) ────────────────────────
// The replay of all scenarios on real Git is long (about 25 min) and was killed once by low memory when run as one monolithic
// loop. It therefore runs in batches of GC4_BATCH_SIZE scenarios, in table order:
//   - before each batch the free memory is read; below GC4_MEMORY_FLOOR_MB the run STOPS before the batch starts;
//   - a batch is persisted (atomically, write + rename) only after every one of its scenarios replayed identically; the first
//     mismatch or scenario failure STOPS the run at once and that batch is never persisted; a process kill loses at most the batch
//     in progress;
//   - a rerun loads the persisted state and resumes from the first incomplete batch; state is bound to the exact source digest,
//     environment digest and ordered id list (a state for other inputs is discarded, never reused);
//   - the pin verdict (PASS with a notice, or FAIL "re-pin required") is reached only when EVERY batch - every scenario of the
//     table - is complete (pinEligible). No scenario is skipped, weakened or made optional by the batching.
// The state lives beside the checkout under pt-work-artifacts/ (the land tool's own archive convention): outside the repository,
// never a tracked or untracked repo file, and it survives the private per-run temp root.
const GC4_BATCH_SIZE = 10;
const GC4_MEMORY_FLOOR_MB = 2048; // the safety floor the earlier batched recording / dual-run stayed above (free 2.2-3.1 GB; none killed)
const GC4_STATE_FILE = path.join(ROOT, '..', 'pt-work-artifacts', 'qa-stage2-git-contracts', 'gc4-replay-state.json');
function freeMb() { return Math.round(os.freemem() / 1048576); }
function batchPlan(ids, size) {
  const plan = [];
  for (let i = 0; i < ids.length; i += size) plan.push({ index: plan.length, ids: ids.slice(i, i + size) });
  return plan;
}
function replayStateKey(src, env, ids) { return T.sha256(Buffer.from(JSON.stringify({ source: src, environment: env, ids }), 'utf8')); }
function sameIdList(a, b) { return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]); }
function loadReplayState(file, key) {
  const fresh = { version: 1, key, batches: {} };
  if (!fs.existsSync(file)) return fresh;
  let st;
  try { st = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { fresh.discarded = 'unreadable state file'; return fresh; }
  if (!st || st.version !== 1 || st.key !== key || !st.batches || typeof st.batches !== 'object' || Array.isArray(st.batches)) {
    fresh.discarded = 'state key ' + String(st && st.key).slice(0, 12) + ' is not this run\'s ' + key.slice(0, 12);
    return fresh;
  }
  return { version: 1, key, batches: st.batches };
}
function saveReplayState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, key: state.key, batches: state.batches }, null, 2) + '\n');
  fs.renameSync(tmp, file);
}
// True only when every batch of the plan is persisted with exactly its ids and the persisted ids cover every scenario exactly once.
function pinEligible(state, plan) {
  if (!plan.length) return false;
  const seen = new Set();
  let expected = 0;
  for (const b of plan) {
    expected += b.ids.length;
    const done = state.batches[b.index];
    if (!done || !sameIdList(done.ids, b.ids)) return false;
    for (const id of done.ids) { if (seen.has(id)) return false; seen.add(id); }
  }
  return seen.size === expected;
}
// o: { ids, batchSize, floorMb, freeMb(), stateFile, key, replayOne(id) -> diffs, log(line) }. Returns { plan, state, ran, reused, complete }.
function runBatchedReplay(o) {
  const plan = batchPlan(o.ids, o.batchSize);
  const state = loadReplayState(o.stateFile, o.key);
  const log = o.log || (() => {});
  if (state.discarded) log('NOTE  a persisted replay state for other inputs was discarded (' + state.discarded + ')');
  const ran = [];
  const reused = [];
  for (const b of plan) {
    const done = state.batches[b.index];
    if (done && sameIdList(done.ids, b.ids)) { reused.push.apply(reused, b.ids); continue; }
    const free = o.freeMb();
    if (!(free >= o.floorMb)) {
      throw new Error('GC-4 STOP: free memory ' + free + ' MB is below the safety floor of ' + o.floorMb + ' MB before batch ' + (b.index + 1) + '/' + plan.length +
        '; ' + Object.keys(state.batches).length + ' batch(es) persisted in ' + o.stateFile + ' - rerun when memory is sufficient to resume');
    }
    const t0 = Date.now();
    for (const id of b.ids) {
      const diffs = o.replayOne(id); // a scenario failure throws and stops the run at once; the batch is not persisted
      if (diffs.length) throw new Error('GC-4 STOP: mismatch in batch ' + (b.index + 1) + '/' + plan.length + ' - the recorded transcripts no longer match real Git:\n' + diffs.join('\n'));
      ran.push(id);
    }
    state.batches[b.index] = { ids: b.ids.slice(), finishedAt: new Date().toISOString() };
    saveReplayState(o.stateFile, state);
    log('batch ' + (b.index + 1) + '/' + plan.length + ' ok: ' + b.ids[0] + ' .. ' + b.ids[b.ids.length - 1] + ' (' + b.ids.length + ' scenarios, free ' + free + ' MB before, ' + Math.round((Date.now() - t0) / 1000) + ' s)');
  }
  return { plan, state, ran, reused, complete: pinEligible(state, plan) };
}
const ALL_IDS = REC.SCENARIOS.map((s) => s.id);
// A zero-process stand-in for replayOne: records the ids it was asked for; o.mismatch -> that id returns a difference; o.throwAt -> that id throws.
function fakeReplay(o) {
  const calls = [];
  return { calls, fn: (id) => { calls.push(id); if (o && o.mismatch === id) return [id + ': calls differ from the stored transcript']; if (o && o.throwAt === id) throw new Error('fixture build failed for ' + id); return []; } };
}
function stateFileFor(name) { return path.join(BASE, 'gc4-state-' + name + '.json'); }
function readState(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
const PLENTY = () => GC4_MEMORY_FLOOR_MB + 1000;
test('GC-4 batches: the plan covers every scenario of the table exactly once, in table order, in batches of 10 (only the last one shorter); the state key binds the source digest, the environment digest and the exact id list', () => {
  assert.strictEqual(GC4_BATCH_SIZE, 10, 'Owner ruling 2026-10-07: batches of 10 - not fewer, larger batches');
  const plan = batchPlan(ALL_IDS, GC4_BATCH_SIZE);
  assert.strictEqual(new Set(ALL_IDS).size, ALL_IDS.length, 'scenario ids are unique');
  assert.strictEqual(ALL_IDS.length, REC.SCENARIOS.length, 'one id per scenario of the table');
  assert.ok(ALL_IDS.length >= 153, 'the table still holds every one of the 153 scenarios (has ' + ALL_IDS.length + ')');
  assert.strictEqual(plan.length, Math.ceil(ALL_IDS.length / GC4_BATCH_SIZE));
  const flat = [];
  plan.forEach((b, i) => {
    assert.strictEqual(b.index, i, 'batch indices are 0..n-1 in order');
    assert.ok(b.ids.length >= 1 && b.ids.length <= GC4_BATCH_SIZE, 'a batch holds 1..10 scenarios');
    if (i < plan.length - 1) assert.strictEqual(b.ids.length, GC4_BATCH_SIZE, 'every batch but the last holds exactly 10');
    flat.push.apply(flat, b.ids);
  });
  assert.deepStrictEqual(flat, ALL_IDS, 'the batches are the whole table in table order - no scenario dropped, duplicated or reordered');
  process.stdout.write('  NOTE  GC-4 batch plan: ' + ALL_IDS.length + ' scenarios in ' + plan.length + ' batches of ' + GC4_BATCH_SIZE + '\n');
  const k = replayStateKey('S', 'E', ALL_IDS);
  assert.strictEqual(replayStateKey('S', 'E', ALL_IDS.slice()), k, 'deterministic');
  assert.notStrictEqual(replayStateKey('S2', 'E', ALL_IDS), k, 'another source digest is another key');
  assert.notStrictEqual(replayStateKey('S', 'E2', ALL_IDS), k, 'another environment digest is another key (evidence is never reused across environments)');
  assert.notStrictEqual(replayStateKey('S', 'E', ALL_IDS.slice(1)), k, 'a shorter id list is another key');
  assert.notStrictEqual(replayStateKey('S', 'E', ALL_IDS.slice().reverse()), k, 'another order is another key');
});
test('GC-4 batches: a fresh run replays every scenario once and persists every batch; a rerun with a complete state replays nothing; resume runs only the incomplete batches, from the first incomplete one, and persisted + replayed = the whole table; a state for other inputs is discarded, not reused', () => {
  const file = stateFileFor('resume');
  const key = replayStateKey('S', 'E', ALL_IDS);
  const plan = batchPlan(ALL_IDS, GC4_BATCH_SIZE);
  const run = (o, k) => { const f = fakeReplay(o); const r = runBatchedReplay({ ids: ALL_IDS, batchSize: GC4_BATCH_SIZE, floorMb: GC4_MEMORY_FLOOR_MB, freeMb: PLENTY, stateFile: file, key: k || key, replayOne: f.fn }); return { r, calls: f.calls }; };
  // fresh
  const a = run();
  assert.deepStrictEqual(a.calls, ALL_IDS, 'a fresh run replays every scenario exactly once, in order');
  assert.strictEqual(a.r.complete, true);
  assert.strictEqual(Object.keys(readState(file).batches).length, plan.length, 'every batch persisted');
  // complete state: nothing to do, still pin-eligible
  const b = run();
  assert.deepStrictEqual(b.calls, [], 'a complete persisted state replays nothing');
  assert.strictEqual(b.r.complete, true);
  assert.deepStrictEqual(b.r.reused, ALL_IDS);
  // incomplete state with gaps: batches 2 and 7 missing -> exactly those are run, in order, first incomplete first
  const st = readState(file);
  delete st.batches[2]; delete st.batches[7];
  fs.writeFileSync(file, JSON.stringify(st));
  const c = run();
  assert.deepStrictEqual(c.calls, plan[2].ids.concat(plan[7].ids), 'only the incomplete batches run, from the first incomplete one');
  assert.strictEqual(c.calls[0], plan[2].ids[0], 'resume starts at the first scenario of the first incomplete batch');
  const union = c.r.reused.concat(c.r.ran).sort();
  assert.deepStrictEqual(union, ALL_IDS.slice().sort(), 'persisted + replayed is the whole table, each scenario exactly once');
  assert.strictEqual(c.r.complete, true);
  // prefix state (a kill after batch 4): resume from batch 5
  const st2 = readState(file);
  for (const i of Object.keys(st2.batches)) if (Number(i) > 4) delete st2.batches[i];
  fs.writeFileSync(file, JSON.stringify(st2));
  const d = run();
  assert.deepStrictEqual(d.calls, ALL_IDS.slice(5 * GC4_BATCH_SIZE), 'resume from the first incomplete batch to the end');
  assert.strictEqual(d.r.complete, true);
  // a state for other inputs (other source digest) is discarded: the whole table runs again
  const e = run(null, replayStateKey('S-changed', 'E', ALL_IDS));
  assert.deepStrictEqual(e.calls, ALL_IDS, 'a state keyed on other inputs is never reused');
  assert.strictEqual(readState(file).key, replayStateKey('S-changed', 'E', ALL_IDS), 'the new state replaces the old one');
});
test('GC-4 batches negative: a mismatch or a scenario failure stops the run at once; the failed batch is not persisted; the run is not pin-eligible', () => {
  const file = stateFileFor('fail');
  const key = replayStateKey('S', 'E', ALL_IDS);
  const plan = batchPlan(ALL_IDS, GC4_BATCH_SIZE);
  const bad = plan[2].ids[4];
  const f1 = fakeReplay({ mismatch: bad });
  throwsWith(() => runBatchedReplay({ ids: ALL_IDS, batchSize: GC4_BATCH_SIZE, floorMb: GC4_MEMORY_FLOOR_MB, freeMb: PLENTY, stateFile: file, key, replayOne: f1.fn }), /GC-4 STOP: mismatch in batch 3\//, 'mismatch');
  assert.strictEqual(f1.calls[f1.calls.length - 1], bad, 'the run stopped at the mismatching scenario');
  assert.strictEqual(f1.calls.length, 2 * GC4_BATCH_SIZE + 5, 'no later scenario ran');
  let st = readState(file);
  assert.deepStrictEqual(Object.keys(st.batches).sort(), ['0', '1'], 'only the two complete batches are persisted; the failed one is not');
  assert.strictEqual(pinEligible(st, plan), false, 'not pin-eligible');
  // a scenario failure (the real run threw) propagates and persists nothing new
  const f2 = fakeReplay({ throwAt: plan[2].ids[0] });
  throwsWith(() => runBatchedReplay({ ids: ALL_IDS, batchSize: GC4_BATCH_SIZE, floorMb: GC4_MEMORY_FLOOR_MB, freeMb: PLENTY, stateFile: file, key, replayOne: f2.fn }), /fixture build failed/, 'scenario failure');
  assert.deepStrictEqual(f2.calls, [plan[2].ids[0]], 'resumed at batch 3 and stopped at the failing scenario');
  st = readState(file);
  assert.deepStrictEqual(Object.keys(st.batches).sort(), ['0', '1'], 'still only the two complete batches');
  assert.strictEqual(pinEligible(st, plan), false);
});
test('GC-4 batches negative: free memory below the safety floor stops the run before the batch starts (no scenario of it runs); the earlier batches stay persisted', () => {
  const file = stateFileFor('memory');
  const key = replayStateKey('S', 'E', ALL_IDS);
  const plan = batchPlan(ALL_IDS, GC4_BATCH_SIZE);
  assert.ok(GC4_MEMORY_FLOOR_MB > 0, 'a positive floor');
  const f1 = fakeReplay();
  throwsWith(() => runBatchedReplay({ ids: ALL_IDS, batchSize: GC4_BATCH_SIZE, floorMb: GC4_MEMORY_FLOOR_MB, freeMb: () => GC4_MEMORY_FLOOR_MB - 1, stateFile: file, key, replayOne: f1.fn }), /below the safety floor .* before batch 1\//, 'low memory at the start');
  assert.deepStrictEqual(f1.calls, [], 'no scenario ran');
  assert.strictEqual(fs.existsSync(file), false, 'nothing persisted');
  let reads = 0;
  const f2 = fakeReplay();
  throwsWith(() => runBatchedReplay({ ids: ALL_IDS, batchSize: GC4_BATCH_SIZE, floorMb: GC4_MEMORY_FLOOR_MB, freeMb: () => { reads += 1; return reads <= 2 ? GC4_MEMORY_FLOOR_MB : GC4_MEMORY_FLOOR_MB - 1; }, stateFile: file, key, replayOne: f2.fn }), /before batch 3\//, 'memory drops before the third batch');
  assert.deepStrictEqual(f2.calls, ALL_IDS.slice(0, 2 * GC4_BATCH_SIZE), 'exactly the two batches with memory at or above the floor ran');
  const st = readState(file);
  assert.deepStrictEqual(Object.keys(st.batches).sort(), ['0', '1'], 'the two complete batches are persisted');
  assert.strictEqual(pinEligible(st, plan), false);
  throwsWith(() => runBatchedReplay({ ids: ALL_IDS, batchSize: GC4_BATCH_SIZE, floorMb: GC4_MEMORY_FLOOR_MB, freeMb: () => NaN, stateFile: file, key, replayOne: fakeReplay().fn }), /below the safety floor/, 'an unreadable memory value never passes the check');
});
test('GC-4 batches negative: only a complete state (every batch, every scenario exactly once) is pin-eligible - a missing batch, a truncated batch, a duplicated id, a foreign id or an empty plan is not', () => {
  const plan = batchPlan(ALL_IDS, GC4_BATCH_SIZE);
  const complete = () => { const s = { version: 1, key: 'k', batches: {} }; for (const b of plan) s.batches[b.index] = { ids: b.ids.slice() }; return s; };
  assert.strictEqual(pinEligible(complete(), plan), true, 'the complete state is pin-eligible');
  for (let i = 0; i < plan.length; i += 1) { const s = complete(); delete s.batches[i]; assert.strictEqual(pinEligible(s, plan), false, 'missing batch ' + i); }
  const t = complete(); t.batches[3].ids.pop(); assert.strictEqual(pinEligible(t, plan), false, 'a truncated batch (one scenario short)');
  const d = complete(); d.batches[3].ids[0] = d.batches[3].ids[1]; assert.strictEqual(pinEligible(d, plan), false, 'a duplicated id in place of a scenario');
  const x = complete(); x.batches[3].ids[0] = 'not-a-scenario'; assert.strictEqual(pinEligible(x, plan), false, 'a foreign id in place of a scenario');
  const o = complete(); o.batches[3].ids.reverse(); assert.strictEqual(pinEligible(o, plan), false, 'a batch recorded in another order is not the planned batch');
  assert.strictEqual(pinEligible(complete(), []), false, 'an empty plan is never pin-eligible');
  // a state persisted for a table one scenario shorter is bound to another key and is discarded on load
  const file = stateFileFor('shorter');
  const shorter = ALL_IDS.slice(0, -1);
  saveReplayState(file, { key: replayStateKey('S', 'E', shorter), batches: (() => { const b = {}; batchPlan(shorter, GC4_BATCH_SIZE).forEach((p) => { b[p.index] = { ids: p.ids }; }); return b; })() });
  const loaded = loadReplayState(file, replayStateKey('S', 'E', ALL_IDS));
  assert.deepStrictEqual(loaded.batches, {}, 'a state for a shorter table is not reused');
  assert.ok(loaded.discarded, 'and the discard is reported');
});
test('GC-4: contract replay of every transcript against real Git, in resumable batches of 10 - skipped only when the source digest = the pin and this environment digest is a proven one', () => {
  if (process.argv.indexOf('--no-gc4') !== -1) { process.stdout.write('  NOTE  GC-4 NOT RUN (--no-gc4): this is NOT a valid run of the suite\n'); GC4_SKIPPED_BY_FLAG = true; return; }
  const src = digestParts(sourceParts());
  const env = (REAL_ENV || FP.collect()).digest;
  const d = gateDecision(src, env, GIT_CONTRACT_PIN);
  if (d === 'skip') { process.stdout.write('  SKIP  (contract pinned: ' + src.slice(0, 12) + '/' + env.slice(0, 12) + ')\n'); return; }
  const families = REC.loadAll();
  const byId = new Map(REC.SCENARIOS.map((s) => [s.id, s]));
  const run = runBatchedReplay({
    ids: ALL_IDS, batchSize: GC4_BATCH_SIZE, floorMb: GC4_MEMORY_FLOOR_MB, freeMb, stateFile: GC4_STATE_FILE, key: replayStateKey(src, env, ALL_IDS),
    replayOne: (id) => replayOne(byId.get(id), families),
    log: (m) => process.stdout.write('  GC-4  ' + m + '\n')
  });
  assert.strictEqual(run.complete, true, 'the pin verdict needs every batch of every scenario complete');
  assert.strictEqual(run.ran.length + run.reused.length, REC.SCENARIOS.length, 'every scenario of the table replayed identically (in this run or in a persisted batch of the same source, environment and table)');
  if (d === 'replay-fail') throw new Error('re-pin required: source ' + src + ' environment ' + env + ' (every transcript replayed identically against real Git in ' + run.plan.length + ' batches; set GIT_CONTRACT_PIN to this source digest and add this environment digest)');
  process.stdout.write('  NOTE  environment not pinned: ' + env + '; record it in a task to enable the fast path\n');
});
// ── summary ────────────────────────────────────────────────────────────────────────────────
try { fs.rmSync(BASE, { recursive: true, force: true }); } catch (e) { /* best effort */ }
meter.report(process.stdout, 'git-contract');
// Failures are reported BEFORE the --no-gc4 exit: the development flag must never hide a failing row.
if (failed > 0) {
  for (const f of failures) process.stdout.write('  FAIL  ' + f + '\n');
  process.stdout.write('\nOFFLINE VALIDATION (git contract): FAIL (' + failed + '/' + (passed + failed) + ')\n');
  process.exit(1);
}
if (GC4_SKIPPED_BY_FLAG) { process.stdout.write('  NOTE  ' + passed + ' row(s) passed but GC-4 was NOT RUN (--no-gc4): not a valid run, exit 2\n'); process.exit(2); }
process.stdout.write('  PASS  ' + passed + ' git-contract assertion(s) passed\n');
