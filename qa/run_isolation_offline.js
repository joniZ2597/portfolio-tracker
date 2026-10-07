'use strict';

/*
 * qa/run_isolation_offline.js
 *
 * work/qa-isolation-meter/brief.md §1.5 (RI-1 .. RI-6, MT-1 .. MT-7; every row has a planted negative).
 * Exercises the two test-only helpers qa/lib/run-tmp.js (private temp root per run) and
 * qa/lib/spawn-meter.js (process meter), and statically pins the three edits (E1-E3) in the two land suites.
 *
 * Offline: no network. Every row runs the helper in a FRESH child Node process (module state such as
 * "idempotent per process" and the installed spawn wrapper cannot leak between rows) and every temp
 * directory a row makes lives under one sandbox folder this suite creates and removes. The children get
 * TEMP / TMP / TMPDIR pointing at a sandbox sub-folder, so no row ever touches the real temp folder - in
 * particular never a real <tmp>/pt-oag* directory that a land suite from another run might be using.
 * A planted negative mutates the PRODUCTION helper source (a copy in a temp dir, every anchor counted
 * exactly once) or removes the thing under test, and the same probe must then fail.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(__dirname, 'lib');
const NODE = process.execPath;

let passed = 0;
let failed = 0;
const failures = [];
const pending = [];

// Rows are queued so the async ones (two concurrent children) and the sync ones share one runner.
function test(name, fn) { pending.push({ name, fn }); }
async function runAll() {
  for (const t of pending) {
    try { await t.fn(); passed += 1; } catch (e) { failed += 1; failures.push(t.name + ' -- ' + (e && e.message ? e.message : String(e))); }
  }
}

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'ptqa-ri-'));
let subCounter = 0;
function sub(label) {
  subCounter += 1;
  const d = path.join(SANDBOX, label + '-' + subCounter);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function W(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }

// Environment for a child: the real one minus GIT_* / NODE_OPTIONS (as the resync suite's cleanEnv does), with the
// temp variables pointing at `temp`.
function envFor(temp, withTemp) {
  const env = {};
  for (const k of Object.keys(process.env)) if (!/^GIT_/i.test(k) && k !== 'NODE_OPTIONS' && !/^(TEMP|TMP|TMPDIR)$/i.test(k)) env[k] = process.env[k];
  if (withTemp !== false) { env.TEMP = temp; env.TMP = temp; env.TMPDIR = temp; }
  return env;
}
// Runs `code` in a fresh node; the child prints one JSON line last. libDir = which copy of the helpers it loads.
function child(code, o) {
  o = o || {};
  const prelude = 'const LIB = ' + JSON.stringify(o.libDir || LIB) + '; const SANDBOX_TEMP = ' + JSON.stringify(o.temp || '') + ';\n';
  const r = spawnSync(NODE, ['-e', prelude + code].concat(o.args || []), { env: o.env || envFor(o.temp), encoding: 'utf8', windowsHide: true, cwd: o.cwd || SANDBOX });
  const lines = String(r.stdout).trim().split('\n').filter(Boolean);
  let json = null;
  // The last line that parses as JSON (a "@@QA-SURFACE@@ run-tmp: root left behind" line may follow it).
  for (let i = lines.length - 1; i >= 0 && json === null; i -= 1) { try { json = JSON.parse(lines[i]); } catch (e) { json = null; } }
  return { status: r.status, stdout: String(r.stdout), stderr: String(r.stderr), lines, json };
}

// A copy of both helpers in a temp dir with the replacements applied to one file (each anchor must occur exactly once).
function mutantLib(label, file, replacements) {
  const dir = sub('mut-' + label);
  for (const f of ['run-tmp.js', 'spawn-meter.js']) fs.copyFileSync(path.join(LIB, f), path.join(dir, f));
  let src = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n');
  for (const [find, replace] of replacements) {
    const n = src.split(find).length - 1;
    assert.strictEqual(n, 1, 'mutant "' + label + '": anchor found ' + n + ' time(s): ' + find.slice(0, 90));
    src = src.replace(find, () => replace);
  }
  fs.writeFileSync(path.join(dir, file), src);
  return dir;
}
// probe(libDir) returns true when the invariant holds, otherwise a short description.
function mutantRow(name, mutants, probe) {
  test(name, () => {
    const real = probe(LIB);
    assert.strictEqual(real, true, 'the real helper must satisfy the invariant: ' + real);
    for (const [label, file, replacements] of mutants) {
      const mutated = probe(mutantLib(label, file, replacements));
      assert.notStrictEqual(mutated, true, 'planted negative "' + label + '" was NOT caught');
    }
  });
}

// ═════════════════════════════ run-tmp.js ═════════════════════════════════════════════════
const RI1_CHILD = `
const fs = require('fs'), os = require('os'), path = require('path');
const before = os.tmpdir();
const envBefore = Object.assign({}, process.env);
const lib = require(LIB + '/run-tmp');
const a = lib.isolate('ptqa-ri1-');
const b = lib.isolate('ptqa-ri1-');
const changed = Object.keys(process.env).filter((k) => process.env[k] !== envBefore[k]).map((k) => k.toUpperCase()).sort();
const removed = Object.keys(envBefore).filter((k) => !(k in process.env));
console.log(JSON.stringify({ before, root: a.root, parent: a.parent, now: os.tmpdir(), same: a.root === b.root && a.parent === b.parent,
  changed, removed, exists: fs.existsSync(a.root), dirOfRoot: path.dirname(a.root), base: path.basename(a.root) }));
`;
function ri1Probe(libDir) {
  const temp = sub('ri1');
  const r = child(RI1_CHILD, { temp, libDir });
  if (r.status !== 0 || !r.json) return 'child failed: ' + r.stderr.slice(0, 200);
  const j = r.json;
  if (j.parent !== j.before) return 'parent is not the original temp folder';
  if (path.resolve(j.dirOfRoot) !== path.resolve(j.before)) return 'the root is not a direct child of the original temp folder';
  if (j.root === j.before) return 'the root equals the original temp folder';
  if (!/^ptqa-ri1-/.test(j.base)) return 'the root does not carry the prefix';
  if (j.now !== j.root) return 'os.tmpdir() does not return the root';
  if (!j.exists) return 'the root does not exist';
  if (!j.same) return 'a second call returned a different root';
  if (JSON.stringify(j.changed) !== JSON.stringify(['TEMP', 'TMP', 'TMPDIR'])) return 'environment changed: ' + j.changed.join(',');
  if (j.removed.length) return 'environment variables removed: ' + j.removed.join(',');
  // Two separate runs must not share a root (a fixed directory name would re-create the collision).
  const again = child(RI1_CHILD, { temp, libDir });
  if (!again.json) return 'second child failed: ' + again.stderr.slice(0, 200);
  if (again.json.root === j.root) return 'two runs got the same root: ' + j.root;
  return true;
}
test('RI-1: isolate() sets TEMP/TMP/TMPDIR to a NEW directory under the original temp folder, os.tmpdir() returns it, a second call returns the same root, no other variable is touched (and no GIT_* variable)', () => {
  assert.strictEqual(ri1Probe(LIB), true);
});
test('RI-1 negative: a child that never calls isolate() keeps the original temp folder', () => {
  const temp = sub('ri1n');
  const r = child("const os = require('os'); console.log(JSON.stringify({ now: os.tmpdir(), temp: SANDBOX_TEMP }));", { temp });
  assert.strictEqual(path.resolve(r.json.now), path.resolve(r.json.temp));
});
mutantRow('RI-1 mutants: a fixed shared directory, a skipped TMP, a skipped TMPDIR, a second call that makes a new root -> each caught',
  [
    ['fixed-dir', 'run-tmp.js', [["fs.mkdtempSync(path.join(parent, prefix))", "(function () { const d = path.join(parent, prefix + 'shared'); fs.mkdirSync(d, { recursive: true }); return d; })()"]]],
    ['skip-tmp', 'run-tmp.js', [["process.env.TMP = root;", '']]],
    ['skip-tmpdir', 'run-tmp.js', [["process.env.TMPDIR = root;", '']]],
    ['not-idempotent', 'run-tmp.js', [["if (state) return state;", '']]]
  ], ri1Probe);

const RI1B_CHILD = `
const os = require('os');
const pinned = os.tmpdir();
os.tmpdir = () => pinned;               // the environment can no longer redirect it
let threw = null;
try { require(LIB + '/run-tmp').isolate('ptqa-ri1b-'); } catch (e) { threw = String(e && e.message); }
console.log(JSON.stringify({ threw }));
`;
function ri1bProbe(libDir) {
  const temp = sub('ri1b');
  const r = child(RI1B_CHILD, { temp, libDir });
  if (!r.json) return 'child failed: ' + r.stderr.slice(0, 200);
  return r.json.threw && /tmpdir/.test(r.json.threw) ? true : 'isolate() did not throw when os.tmpdir() could not be redirected: ' + r.json.threw;
}
mutantRow('RI-1b: isolate() throws when os.tmpdir() cannot be redirected (the suite fails before any row runs); the verification dropped -> caught',
  [['no-verify', 'run-tmp.js', [["if (os.tmpdir() !== root) throw new Error(", "if (false) throw new Error("]]]], ri1bProbe);

// RI-2: the collision itself.
const RI2_CHILD = `
const fs = require('fs'), os = require('os'), path = require('path');
const [mode, id, coord] = process.argv.slice(1);
if (mode === 'iso') require(LIB + '/run-tmp').isolate('ptqa-ri2-');
const dir = path.join(os.tmpdir(), 'pt-oag1', 'protected');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'manifest.json');
fs.writeFileSync(file, 'content-' + id);
fs.writeFileSync(path.join(coord, id + '.written'), '1');
const other = id === 'A' ? 'B' : 'A';
const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const t0 = Date.now();
while (!fs.existsSync(path.join(coord, other + '.written')) && Date.now() - t0 < 20000) wait(20);
wait(300);
console.log(JSON.stringify({ id, tmp: os.tmpdir(), file, back: fs.readFileSync(file, 'utf8') }));
`;
function runPair(mode, libDir) {
  const temp = sub('ri2-' + mode);
  const coord = sub('ri2c-' + mode);
  const launch = (id) => new Promise((resolve) => {
    const prelude = 'const LIB = ' + JSON.stringify(libDir || LIB) + '; const SANDBOX_TEMP = ' + JSON.stringify(temp) + ';\n';
    const p = spawn(NODE, ['-e', prelude + RI2_CHILD, mode, id, coord], { env: envFor(temp), windowsHide: true });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => {
      let json = null;
      try { json = JSON.parse(out.trim().split('\n').filter(Boolean).pop()); } catch (e) { /* asserted by the caller */ }
      resolve({ code, json, err });
    });
  });
  return Promise.all([launch('A'), launch('B')]);
}
test('RI-2: two CONCURRENT children, each isolate() + <os.tmpdir()>/pt-oag1/protected/manifest.json with different content -> each reads back its own content, and the two roots differ', async () => {
  const [a, b] = await runPair('iso');
  assert.ok(a.json && b.json, 'both children reported: ' + a.err + b.err);
  assert.strictEqual(a.json.back, 'content-A');
  assert.strictEqual(b.json.back, 'content-B');
  assert.notStrictEqual(a.json.tmp, b.json.tmp, 'the two private roots differ');
  assert.notStrictEqual(a.json.file, b.json.file);
});
test('RI-2 planted negative: the same two children WITHOUT isolate() resolve the same pt-oag1 path and at least one reads the other\'s content', async () => {
  const [a, b] = await runPair('plain');
  assert.ok(a.json && b.json, 'both children reported: ' + a.err + b.err);
  assert.strictEqual(a.json.file, b.json.file, 'the same path');
  assert.ok(a.json.back !== 'content-A' || b.json.back !== 'content-B', 'one child saw the other\'s manifest (the collision)');
});
test('RI-2 mutant: isolate() that returns the shared parent as the root re-creates the collision -> caught', async () => {
  const dir = mutantLib('ri2-shared', 'run-tmp.js', [["fs.mkdtempSync(path.join(parent, prefix))", "parent"]]);
  let caught = false;
  try {
    const [a, b] = await runPair('iso', dir);
    caught = !(a.json && b.json && a.json.back === 'content-A' && b.json.back === 'content-B' && a.json.tmp !== b.json.tmp);
  } catch (e) { caught = true; }
  assert.strictEqual(caught, true, 'the shared-root mutant must violate RI-2');
});

// RI-3: the resync sweep is scoped.
const RI3_CHILD = `
const fs = require('fs'), os = require('os'), path = require('path');
const original = os.tmpdir();
fs.mkdirSync(path.join(original, 'pt-resync-x'), { recursive: true });
if (process.argv[1] === 'iso') require(LIB + '/run-tmp').isolate('ptqa-ri3-');
console.log(JSON.stringify({ listing: fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('pt-resync-')) }));
`;
function ri3Probe(libDir) {
  const temp = sub('ri3');
  const r = child(RI3_CHILD, { temp, libDir, args: ['iso'] });
  if (!r.json) return 'child failed: ' + r.stderr.slice(0, 200);
  if (r.json.listing.length) return 'the folder is visible after isolate(): ' + r.json.listing.join(',');
  if (!fs.existsSync(path.join(temp, 'pt-resync-x'))) return 'the original-temp folder did not survive the child\'s exit';
  return true;
}
test('RI-3: a pt-resync-x folder created in the ORIGINAL temp folder is invisible to a listing of os.tmpdir() after isolate(), and survives the child\'s exit', () => {
  assert.strictEqual(ri3Probe(LIB), true);
});
test('RI-3 negative: without isolate() the same folder IS listed', () => {
  const temp = sub('ri3n');
  const r = child(RI3_CHILD, { temp, args: ['plain'] });
  assert.deepStrictEqual(r.json.listing, ['pt-resync-x']);
});
mutantRow('RI-3 mutant: isolate() that does not redirect os.tmpdir() (root still created) -> the folder is visible -> caught',
  [['no-redirect', 'run-tmp.js', [["process.env.TEMP = root;", ''], ["process.env.TMP = root;", ''], ["process.env.TMPDIR = root;", ''], ["if (os.tmpdir() !== root) throw new Error(", "if (false) throw new Error("]]]], ri3Probe);

// RI-4: cleanup at exit.
const RI4_CHILD = `
const fs = require('fs');
const mode = process.argv[1];
const { root } = require(LIB + '/run-tmp').isolate('ptqa-ri4-');
fs.writeFileSync(root + '/inside.txt', 'x');
if (mode === 'stuck') fs.rmSync = () => { throw new Error('EBUSY (simulated: the root cannot be removed)'); };
console.log(JSON.stringify({ root }));
if (mode === 'throw') throw new Error('boom');
`;
function ri4Probe(libDir) {
  for (const mode of ['normal', 'throw']) {
    const temp = sub('ri4-' + mode);
    const r = child(RI4_CHILD, { temp, libDir, args: [mode] });
    if (!r.json) return mode + ': child did not report: ' + r.stderr.slice(0, 200);
    if (fs.existsSync(r.json.root)) return mode + ': the root is still there after the child exited';
    if (r.stdout.indexOf('root left behind') !== -1) return mode + ': a leftover line was printed although the root was removed';
    if (mode === 'throw' && r.status === 0) return 'the throwing child did not fail (the probe is not exercising the throw path)';
    if (mode === 'normal' && r.status !== 0) return 'the normal child failed';
  }
  const temp = sub('ri4-stuck');
  const r = child(RI4_CHILD, { temp, libDir, args: ['stuck'] });
  if (r.status !== 0) return 'a root that cannot be removed made the child fail (exit ' + r.status + '): the cleanup must never throw';
  const left = r.lines.filter((l) => l.indexOf('@@QA-SURFACE@@ run-tmp: root left behind ') === 0);
  if (left.length !== 1) return 'expected exactly one leftover line, got ' + left.length;
  if (left[0] !== '@@QA-SURFACE@@ run-tmp: root left behind ' + r.json.root) return 'the leftover line has the wrong format: ' + left[0];
  return true;
}
mutantRow('RI-4: the root is removed after a normal exit and after an uncaught throw; a root that cannot be removed prints ONE "@@QA-SURFACE@@ run-tmp: root left behind <root>" line and never throws',
  [
    ['no-cleanup', 'run-tmp.js', [["fs.rmSync(root, { recursive: true, force: true });", '/* cleanup dropped */']]],
    ['rethrows', 'run-tmp.js', [["leftover(root);", 'throw e;']]],
    ['wrong-line', 'run-tmp.js', [["'@@QA-SURFACE@@ run-tmp: root left behind '", "'@@QA-SURFACE@@ run-tmp: left '"]]]
  ], ri4Probe);

// RI-5: children see the private root.
const RI5_CHILD = `
const { spawnSync } = require('child_process');
const os = require('os');
const { root, parent } = require(LIB + '/run-tmp').isolate('ptqa-ri5-');
const cleanEnv = {};                       // the resync suite's cleanEnv(): no GIT_*, no NODE_OPTIONS
for (const k of Object.keys(process.env)) if (!/^GIT_/i.test(k) && k !== 'NODE_OPTIONS') cleanEnv[k] = process.env[k];
// A child given an env that NAMES the original temp folder follows it (on Windows a child whose env merely omits TEMP still
// inherits the parent's, so "stripped" is not a meaningful negative there).
const originalEnv = Object.assign({}, cleanEnv, { TEMP: parent, TMP: parent, TMPDIR: parent });
const ask = (env) => String(spawnSync(process.execPath, ['-e', "console.log(require('os').tmpdir())"], { env, encoding: 'utf8' }).stdout).trim();
console.log(JSON.stringify({ root, parent, viaClean: ask(cleanEnv), viaInherit: ask(undefined), viaOriginal: ask(originalEnv) }));
`;
function ri5Probe(libDir) {
  const temp = sub('ri5');
  const r = child(RI5_CHILD, { temp, libDir });
  if (!r.json) return 'child failed: ' + r.stderr.slice(0, 200);
  if (r.json.viaClean !== r.json.root) return 'a child started with the cleanEnv() copy does not see the private root';
  if (r.json.viaInherit !== r.json.root) return 'a child inheriting process.env does not see the private root';
  return true;
}
test('RI-5: a child started the way the suites start CLI runs (inheriting process.env, or the resync suite\'s cleanEnv() copy) reports os.tmpdir() === root', () => {
  assert.strictEqual(ri5Probe(LIB), true);
});
test('RI-5 negative: a child whose env names the ORIGINAL temp folder does NOT see the private root (children follow the env they are given)', () => {
  const temp = sub('ri5n');
  const r = child(RI5_CHILD, { temp });
  assert.notStrictEqual(r.json.viaOriginal, r.json.root);
  assert.strictEqual(path.resolve(r.json.viaOriginal), path.resolve(r.json.parent));
});
mutantRow('RI-5 mutant: isolate() that only updates its own process view (no TEMP/TMP/TMPDIR written) -> children do not see the root -> caught',
  [['no-env', 'run-tmp.js', [["process.env.TEMP = root;", ''], ["process.env.TMP = root;", ''], ["process.env.TMPDIR = root;", ''], ["if (os.tmpdir() !== root) throw new Error(", "if (false) throw new Error("]]]], ri5Probe);

// RI-6: the three edits (E1-E3) in the two land suites - STRUCTURAL checks only.
// work/qa-stage2-git-contracts (D3, Owner-approved): the whole-file comparison with the Slice 0 baseline is retired, because Stage 2
// legitimately removes the moved rows from both suites; what stays is the check that each suite still carries E1 (before the
// child_process destructuring and the first os.tmpdir(), E2 and E3.
function lf(s) { return String(s).replace(/\r\n/g, '\n'); }
function checkEdits(current, prefix, label) {
  const cur = lf(current);
  const iUse = cur.indexOf("'use strict';");
  const iE1 = cur.indexOf("require('./lib/run-tmp').isolate('" + prefix + "');");
  const iDestructure = cur.indexOf("const { spawnSync } = require('child_process');");
  const iTmpdir = cur.indexOf('os.tmpdir(');
  if (iE1 === -1) return 'E1 is missing';
  if (!(iUse !== -1 && iUse < iE1)) return 'E1 does not follow use strict';
  if (iDestructure !== -1 && iE1 > iDestructure) return 'E1 does not precede the child_process destructuring';
  if (iTmpdir !== -1 && iE1 > iTmpdir) return 'E1 does not precede the first os.tmpdir(';
  if (cur.indexOf('meter.beginRow(name);') === -1 || cur.indexOf('meter.endRow();') === -1) return 'E2 is missing';
  if (cur.indexOf("meter.report(process.stdout, '" + label + "');") === -1) return 'E3 is missing';
  return true;
}
const LAND_SUITES = [
  ['qa/pt_land_offline.js', 'ptqa-land-', 'pt-land'],
  ['qa/pt_land_resync_offline.js', 'ptqa-resync-', 'pt-land-resync']
];
for (const [rel, prefix, label] of LAND_SUITES) {
  test('RI-6: ' + rel + ' carries E1 (before the child_process destructuring and the first os.tmpdir(), E2 and E3 (structure only)', () => {
    assert.strictEqual(checkEdits(fs.readFileSync(path.join(ROOT, rel), 'utf8'), prefix, label), true);
  });
  test('RI-6 planted negatives (' + rel + '): E1 after the destructuring, a missing E1, a missing E3, a missing E2 and a wrong prefix are each detected', () => {
    const good = lf(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    assert.strictEqual(checkEdits(good, prefix, label), true, 'the suite passes its own checker');
    const e1 = good.split('\n').slice(1, 4).join('\n') + '\n';
    assert.ok(good.indexOf(e1) !== -1, 'the E1 block is found');
    const moved = good.replace(e1, '').replace("const { spawnSync } = require('child_process');\n", () => "const { spawnSync } = require('child_process');\n" + e1);
    assert.notStrictEqual(checkEdits(moved, prefix, label), true, 'E1 moved after the destructuring');
    assert.notStrictEqual(checkEdits(good.replace(e1, ''), prefix, label), true, 'no E1');
    assert.notStrictEqual(checkEdits(good.replace("meter.report(process.stdout, '" + label + "');\n", ''), prefix, label), true, 'no E3');
    assert.notStrictEqual(checkEdits(good.replace('  } finally { meter.endRow(); }\n', ''), prefix, label), true, 'no E2 closing line');
    assert.notStrictEqual(checkEdits(good.replace("isolate('" + prefix + "')", "isolate('ptqa-other-')"), prefix, label), true, 'a wrong prefix');
  });
}

// ═════════════════════════════ spawn-meter.js ═════════════════════════════════════════════
// Child prelude: a deterministic clock (every process.hrtime.bigint() call advances 2 ms) and a fake base spawnSync (no process
// is started); each row of the child script prints one JSON line.
const CLOCK = `
let tick = 0n;
process.hrtime.bigint = () => { const v = tick; tick += 2000000n; return v; };
`;
function meterChild(code, o) {
  return child(CLOCK + code, o);
}

const MT1_CHILD = `
const cp = require('child_process');
const calls = [];
const RES = { status: 0, stdout: 'x' };
const fake = function () { calls.push({ self: this, args: Array.prototype.slice.call(arguments) }); return RES; };
cp.spawnSync = fake;
const meter = require(LIB + '/spawn-meter').install();
const opts = { cwd: '.', encoding: 'utf8' };
const keysBefore = Object.keys(opts).join();
const args = ['-e', '1'];
const self = { me: true };
const r = cp.spawnSync.call(self, process.execPath, args, opts);
console.log(JSON.stringify({ wrapped: cp.spawnSync !== fake, sameResult: r === RES, sameThis: calls[0].self === self, sameExe: calls[0].args[0] === process.execPath,
  sameArgv: calls[0].args[1] === args, sameOpts: calls[0].args[2] === opts, optsUntouched: Object.keys(opts).join() === keysBefore && opts.cwd === '.', n: calls.length }));
`;
function mt1Probe(libDir) {
  const r = meterChild(MT1_CHILD, { temp: sub('mt1'), libDir });
  if (!r.json) return 'child failed: ' + r.stderr.slice(0, 300);
  const j = r.json;
  for (const k of ['wrapped', 'sameResult', 'sameThis', 'sameExe', 'sameArgv', 'sameOpts', 'optsUntouched']) if (!j[k]) return 'pass-through broken: ' + k;
  return j.n === 1 ? true : 'the original was called ' + j.n + ' times';
}
mutantRow('MT-1: the wrapped call returns the identical result object and receives the identical this / arguments / options object; planted: a cloned options object, a cloned result',
  [
    ['clone-options', 'spawn-meter.js', [["const result = original.apply(this, arguments);", "const result = original.apply(this, [arguments[0], arguments[1], Object.assign({}, arguments[2])]);"]]],
    ['clone-result', 'spawn-meter.js', [["return result; // pass-through: the original result object, unchanged", "return Object.assign({}, result);"]]]
  ], mt1Probe);

// MT-2: categories, via the row lines the meter reports.
const MT2_CHILD = `
const cp = require('child_process');
const fs = require('fs'), path = require('path');
const RES = { status: 0 };
cp.spawnSync = function () { return RES; };
const meter = require(LIB + '/spawn-meter').install();
const dir = SANDBOX_TEMP;
fs.writeFileSync(path.join(dir, 'pt-land.js'), 'exports.run = function (cp) { return cp.spawnSync("git", ["status"]); };\\n');
fs.writeFileSync(path.join(dir, 'guard_integrity_check.js'), 'exports.run = function (cp) { return cp.spawnSync("git", ["log"]); };\\n');
const tool = require(path.join(dir, 'pt-land.js'));
const integ = require(path.join(dir, 'guard_integrity_check.js'));
function buildFixture() { return cp.spawnSync('git', ['init']); }
function buildCleanupFixture() { return cp.spawnSync('git', ['init']); }
function buildProtectedFixture() { return cp.spawnSync('git', ['init']); }
function buildApprovedLandFixture() { return cp.spawnSync('git', ['init']); }
function makeFlakyGitViaNodeOptions() { return cp.spawnSync('git', ['init']); }
const cases = [
  ['fixture-1', buildFixture], ['fixture-2', buildCleanupFixture], ['fixture-3', buildProtectedFixture], ['fixture-4', buildApprovedLandFixture],
  ['fixture-5', makeFlakyGitViaNodeOptions],
  ['tool-1', () => tool.run(cp)], ['tool-2', () => integ.run(cp)],
  ['cli', () => cp.spawnSync(process.execPath, [path.join(dir, 'pt-land.js'), 'land-request'])],
  ['other-1', () => cp.spawnSync('git', ['status'])],
  ['other-2', () => cp.spawnSync(process.execPath, [path.join(dir, 'something-else.js')])],
  ['fixture-wins-over-tool', function buildFixture() { return tool.run(cp); }]
];
for (const [name, fn] of cases) { meter.beginRow(name); fn(); meter.endRow(); }
const lines = [];
meter.report({ write: (s) => lines.push(s) }, 'mt2');
const text = lines.join('');
const rows = {};
for (const l of text.split('\\n')) {
  const m = /^@@PL-METER@@ mt2 row \\d+ \\d+ fixture=(\\d+)\\/\\d+ tool=(\\d+)\\/\\d+ other=(\\d+)\\/\\d+ \\| (.*)$/.exec(l);
  if (m) rows[m[4]] = { fixture: +m[1], tool: +m[2], other: +m[3] };
}
const head = /cli=(\\d+)\\/(\\d+)/.exec(text);
console.log(JSON.stringify({ rows, cli: head ? +head[1] : null }));
`;
function mt2Probe(libDir) {
  const r = meterChild(MT2_CHILD, { temp: sub('mt2'), libDir });
  if (!r.json) return 'child failed: ' + r.stderr.slice(0, 400);
  const want = {
    'fixture-1': 'fixture', 'fixture-2': 'fixture', 'fixture-3': 'fixture', 'fixture-4': 'fixture', 'fixture-5': 'fixture',
    'tool-1': 'tool', 'tool-2': 'tool', 'cli': 'tool', 'other-1': 'other', 'other-2': 'other', 'fixture-wins-over-tool': 'fixture'
  };
  for (const name of Object.keys(want)) {
    const row = r.json.rows[name];
    if (!row) return 'no meter line for row ' + name;
    const got = row.fixture ? 'fixture' : row.tool ? 'tool' : row.other ? 'other' : 'none';
    if (got !== want[name]) return 'row ' + name + ': expected ' + want[name] + ' got ' + got;
    if (row.fixture + row.tool + row.other !== 1) return 'row ' + name + ' counted ' + (row.fixture + row.tool + row.other) + ' spawns';
  }
  return r.json.cli === 1 ? true : 'cli count ' + r.json.cli + ' (expected exactly the one Node spawn of pt-land.js)';
}
mutantRow('MT-2: fixture-builder frames -> fixture; a frame in pt-land.js / guard_integrity_check.js -> tool; a Node spawn of .../pt-land.js -> tool + cli; otherwise other; planted: a builder name dropped, the tool-file rule dropped, the cli rule dropped',
  [
    ['no-fixture', 'spawn-meter.js', [["if (FIXTURE_FRAMES.indexOf(f.fn) !== -1) return { cat: 'fixture', cli: false };", '']]],
    ['no-tool-file', 'spawn-meter.js', [["if (TOOL_FILE_RE.test(f.file)) return { cat: 'tool', cli: false };", '']]],
    ['no-cli', 'spawn-meter.js', [["return { cat: 'tool', cli: true };", "return { cat: 'other', cli: false };"]]]
  ], mt2Probe);

// MT-3: rows.
const MT3_CHILD = `
const cp = require('child_process');
cp.spawnSync = function () { return { status: 0 }; };
const meter = require(LIB + '/spawn-meter').install();
cp.spawnSync('git', ['a']);                      // outside any row
meter.beginRow('first'); cp.spawnSync('git', ['b']); cp.spawnSync('git', ['c']); meter.endRow();
cp.spawnSync('git', ['d']);                      // outside again
meter.beginRow('second'); cp.spawnSync('git', ['e']); meter.endRow();
const lines = [];
meter.report({ write: (s) => lines.push(s) }, 'mt3');
const text = lines.join('');
const grab = (re) => { const m = re.exec(text); return m ? m[1] : null; };
console.log(JSON.stringify({
  rows: /rows=(\\d+)/.exec(text)[1],
  first: grab(/row 1 \\d+ fixture=\\d+\\/\\d+ tool=\\d+\\/\\d+ other=(\\d+)\\/\\d+ \\| first/),
  second: grab(/row 2 \\d+ fixture=\\d+\\/\\d+ tool=\\d+\\/\\d+ other=(\\d+)\\/\\d+ \\| second/),
  outside: grab(/outside fixture=\\d+\\/\\d+ tool=\\d+\\/\\d+ other=(\\d+)\\/\\d+/)
}));
`;
function mt3Probe(libDir) {
  const r = meterChild(MT3_CHILD, { temp: sub('mt3'), libDir });
  if (!r.json) return 'child failed: ' + r.stderr.slice(0, 300);
  const j = r.json;
  return j.rows === '2' && j.first === '2' && j.second === '1' && j.outside === '2' ? true : 'rows/first/second/outside = ' + [j.rows, j.first, j.second, j.outside].join('/');
}
mutantRow('MT-3: spawns inside beginRow/endRow go to that row, outside -> "outside"; planted: endRow that does not close the row, a row index that never advances',
  [
    ['row-never-closes', 'spawn-meter.js', [["meterState.current = null; // row closed", '/* row left open */']]],
    ['row-index-stuck', 'spawn-meter.js', [["meterState.rows.push(row);", "meterState.rows[0] = row;"]]]
  ], mt3Probe);

// MT-4: idempotent, no environment variable, no file, no extra process.
const MT4_CHILD = `
const cp = require('child_process');
const fs = require('fs'), os = require('os');
let calls = 0;
cp.spawnSync = function () { calls += 1; return { status: 0 }; };
const envBefore = JSON.stringify(Object.keys(process.env).sort().map((k) => [k, process.env[k]]));
const dirBefore = fs.readdirSync(os.tmpdir()).sort().join();
const m1 = require(LIB + '/spawn-meter').install();
const wrapperAfterFirst = cp.spawnSync;
const m2 = require(LIB + '/spawn-meter').install();
const lines = [];
cp.spawnSync('git', ['status']);
m1.report({ write: (s) => lines.push(s) }, 'mt4');
const envAfter = JSON.stringify(Object.keys(process.env).sort().map((k) => [k, process.env[k]]));
const dirAfter = fs.readdirSync(os.tmpdir()).sort().join();
console.log(JSON.stringify({ sameWrapper: wrapperAfterFirst === cp.spawnSync, sameApi: m1 === m2, calls, starts: /starts git=(\\d+)/.exec(lines.join(''))[1], envSame: envBefore === envAfter, dirSame: dirBefore === dirAfter }));
`;
function mt4Probe(libDir) {
  const r = meterChild(MT4_CHILD, { temp: sub('mt4'), libDir });
  if (!r.json) return 'child failed: ' + r.stderr.slice(0, 300);
  const j = r.json;
  if (!j.sameWrapper) return 'a second install() wrapped again';
  if (!j.sameApi) return 'a second install() returned a different api';
  if (j.calls !== 1 || j.starts !== '1') return 'one spawn was counted ' + j.starts + ' time(s) / the base was called ' + j.calls + ' time(s)';
  if (!j.envSame) return 'the meter changed the environment';
  if (!j.dirSame) return 'the meter wrote a file in the temp folder';
  return true;
}
mutantRow('MT-4: install() twice wraps once; the meter adds no environment variable, writes no file; planted: not idempotent, an environment variable set, a file written',
  [
    ['not-idempotent', 'spawn-meter.js', [["if (meterState.installed) return api;", '']]],
    ['sets-env', 'spawn-meter.js', [["meterState.installed = true;", "meterState.installed = true; process.env.QA_METER = '1';"]]],
    ['writes-file', 'spawn-meter.js', [["meterState.installed = true;", "meterState.installed = true; require('fs').writeFileSync(require('path').join(require('os').tmpdir(), 'meter.txt'), 'x');"]]]
  ], mt4Probe);

// MT-5: resolveGitOnPath without starting a process.
const MT5_CHILD = `
const cp = require('child_process');
const fs = require('fs'), path = require('path');
let started = 0;
for (const k of ['spawnSync', 'spawn', 'execFileSync', 'execSync', 'execFile', 'exec', 'fork']) cp[k] = function () { started += 1; throw new Error('a process was started: ' + k); };
const meter = require(LIB + '/spawn-meter');
const base = SANDBOX_TEMP;
const mk = (rel) => { const f = path.join(base, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'x'); return path.dirname(f); };
const cmd = mk('Git/cmd/git.exe'), bin = mk('Git/bin/git.exe'), mingw = mk('Git/mingw64/bin/git.exe'), other = mk('Other/tools/git.exe'), com = mk('WithCom/git.com');
const empty = path.join(base, 'Empty'); fs.mkdirSync(empty, { recursive: true });
const win = (dirs) => meter.resolveGitOnPath({ PATH: dirs.join(';') }, 'win32');
const cases = {
  cmdFirst: win([cmd, mingw]), mingwFirst: win([mingw, cmd]), bin: win([empty, bin]), other: win([other]), com: win([com]), none: win([empty]),
  lowerCaseKey: meter.resolveGitOnPath({ Path: [mingw].join(';') }, 'win32')
};
const out = {};
for (const k of Object.keys(cases)) out[k] = { kind: cases[k].kind, file: cases[k].path ? path.basename(path.dirname(cases[k].path)) + '/' + path.basename(cases[k].path) : null };
console.log(JSON.stringify({ started, out }));
`;
function mt5Probe(libDir) {
  const r = child(MT5_CHILD, { temp: sub('mt5'), libDir });
  if (!r.json) return 'child failed: ' + r.stderr.slice(0, 300);
  const o = r.json.out;
  if (r.json.started !== 0) return 'a process was started';
  if (o.cmdFirst.kind !== 'launcher' || o.cmdFirst.file !== 'cmd/git.exe') return 'cmd first: ' + JSON.stringify(o.cmdFirst);
  if (o.mingwFirst.kind !== 'direct' || o.mingwFirst.file !== 'bin/git.exe') return 'mingw64 first: ' + JSON.stringify(o.mingwFirst);
  if (o.bin.kind !== 'launcher') return 'Git\\bin\\git.exe is a launcher: ' + JSON.stringify(o.bin);
  if (o.other.kind !== 'other') return 'an unrelated git.exe is "other": ' + JSON.stringify(o.other);
  if (o.com.file !== 'WithCom/git.com' || o.com.kind !== 'other') return 'git.com is tried before git.exe and is "other": ' + JSON.stringify(o.com);
  if (o.none.file !== null) return 'no git on PATH must report no path: ' + JSON.stringify(o.none);
  if (o.lowerCaseKey.kind !== 'direct') return 'a "Path" key is honoured: ' + JSON.stringify(o.lowerCaseKey);
  return true;
}
mutantRow('MT-5: resolveGitOnPath with fake PATH folders: first match wins; cmd\\git.exe and bin\\git.exe -> launcher; mingw64\\bin\\git.exe -> direct; no process started; planted: PATH walked in reverse, launcher and direct swapped',
  [
    ['reverse-path', 'spawn-meter.js', [["const dirs = String(pathVar || '').split(isWin ? ';' : ':').filter(Boolean);", "const dirs = String(pathVar || '').split(isWin ? ';' : ':').filter(Boolean).reverse();"]]],
    ['swap-kinds', 'spawn-meter.js', [["return 'launcher';", "return 'direct-TMP';"], ["return 'direct';", "return 'launcher';"], ["return 'direct-TMP';", "return 'direct';"]]]
  ], mt5Probe);

// MT-6: a meter-internal error is counted, never thrown.
const MT6_CHILD = `
const cp = require('child_process');
const RES = { status: 0, stdout: 'kept' };
cp.spawnSync = function () { return RES; };
const meter = require(LIB + '/spawn-meter').install();
const realBigint = process.hrtime.bigint;
let broke = 0;
process.hrtime.bigint = () => { broke += 1; throw new Error('forced meter failure'); };
let threw = null; let result = null;
try { result = cp.spawnSync('git', ['status']); } catch (e) { threw = String(e && e.message); }
process.hrtime.bigint = realBigint;
const lines = [];
meter.report({ write: (s) => lines.push(s) }, 'mt6');
const m = /meterErrors=(\\d+)/.exec(lines.join(''));
console.log(JSON.stringify({ threw, sameResult: result === RES, meterErrors: m ? +m[1] : null, broke }));
`;
function mt6Probe(libDir) {
  const r = meterChild(MT6_CHILD, { temp: sub('mt6'), libDir });
  if (!r.json) return 'child failed: ' + r.stderr.slice(0, 300);
  const j = r.json;
  if (j.threw) return 'the meter error was thrown: ' + j.threw;
  if (!j.sameResult) return 'the spawn result was not returned';
  return j.meterErrors >= 1 ? true : 'the error was not counted (meterErrors=' + j.meterErrors + ')';
}
mutantRow('MT-6: a meter-internal error is counted (meterErrors), never thrown, and the spawn result is still returned; planted: the error rethrown, the error swallowed uncounted',
  [
    ['rethrows', 'spawn-meter.js', [["meterState.meterErrors += 1; // record failed", "throw e;"]]],
    ['uncounted', 'spawn-meter.js', [["meterState.meterErrors += 1; // record failed", '/* swallowed */']]]
  ], mt6Probe);

// MT-7: exact report formats on a deterministic synthetic state (every process.hrtime.bigint() call advances 2 ms; no process is started).
const MT7_CHILD = `
const cp = require('child_process');
const fs = require('fs'), path = require('path');
cp.spawnSync = function () { return { status: 0 }; };
const meter = require(LIB + '/spawn-meter').install();
const fakeGit = path.join(SANDBOX_TEMP, 'bin'); fs.mkdirSync(fakeGit, { recursive: true });
const gitName = process.platform === 'win32' ? 'git.exe' : 'git';
fs.writeFileSync(path.join(fakeGit, gitName), 'x');
process.env.PATH = fakeGit;
function buildFixture() { return cp.spawnSync('git', ['-c', 'core.hooksPath=x', 'status']); }
function plain() { return cp.spawnSync('git', ['rev-parse', 'HEAD']); }
meter.beginRow('alpha'); buildFixture(); plain(); meter.endRow();
meter.beginRow('beta'); cp.spawnSync(process.execPath, [path.join(SANDBOX_TEMP, 'pt-land.js'), 'x']); meter.endRow();
cp.spawnSync('git', ['log']);
const lines = [];
meter.report({ write: (s) => lines.push(s) }, 'lbl');
console.log(JSON.stringify({ text: lines.join(''), gitPath: path.join(fakeGit, gitName) }));
`;
function mt7Expected(gitPath) {
  return [
    '@@QA-SURFACE@@ lbl meter: git=' + gitPath + ' (other); rows=2; starts git=3 node=1 other=0; ms fixture=2 tool=2 other=4; cli=1/2; avgGitMs=2.0; meterErrors=0',
    '@@QA-SURFACE@@ lbl meter: top git subcommands: log=1 rev-parse=1 status=1',
    '@@PL-METER@@ lbl row 1 10 fixture=1/2 tool=0/0 other=1/2 | alpha',
    '@@PL-METER@@ lbl row 2 6 fixture=0/0 tool=1/2 other=0/0 | beta',
    '@@PL-METER@@ lbl outside fixture=0/0 tool=0/0 other=1/2',
    ''
  ].join('\n');
}
function mt7Probe(libDir) {
  const r = meterChild(MT7_CHILD, { temp: sub('mt7'), libDir });
  if (!r.json) return 'child failed: ' + r.stderr.slice(0, 300);
  const want = mt7Expected(r.json.gitPath);
  return r.json.text === want ? true : 'report text differs:\n' + r.json.text + '\nexpected:\n' + want;
}
mutantRow('MT-7: report() line formats match brief §1.2 exactly (header, top git subcommands, one row line per row, one outside line), including avgGitMs; planted: a swapped field order, a wrong average, a missing outside line',
  [
    ['swapped-fields', 'spawn-meter.js', [["'; starts git=' + gitStarts + ' node=' + nodeStarts + ' other=' + otherStarts", "'; starts node=' + nodeStarts + ' git=' + gitStarts + ' other=' + otherStarts"]]],
    ['wrong-average', 'spawn-meter.js', [["(gitStarts ? gitMs / gitStarts : 0).toFixed(1)", "(gitStarts ? gitMs : 0).toFixed(1)"]]],
    ['no-outside', 'spawn-meter.js', [["lines.push('@@PL-METER@@ ' + suiteLabel + ' outside ' + counts(outside));", '']]]
  ], mt7Probe);

// A static guard for the "no GIT_* variable touched" STOP: neither helper mentions a GIT_ variable at all.
test('RI/MT static: neither qa/lib/run-tmp.js nor qa/lib/spawn-meter.js sets, reads-and-modifies or removes any GIT_* variable (the token does not appear)', () => {
  for (const f of ['run-tmp.js', 'spawn-meter.js']) {
    const src = fs.readFileSync(path.join(LIB, f), 'utf8');
    assert.ok(!/GIT_[A-Z]/.test(src.replace(/^\s*(?:\/\/|\*).*$/gm, '')), f + ' mentions a GIT_ variable in code');
  }
  const planted = "process.env.GIT_DIR = 'x';";
  assert.ok(/GIT_[A-Z]/.test(planted), 'control: the scan pattern detects a planted GIT_ assignment');
});

// ── summary ──────────────────────────────────────────────────────────────────────────────
runAll().then(() => {
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  if (failed > 0) {
    for (const f of failures) process.stdout.write('  FAIL  ' + f + '\n');
    process.stdout.write('\nOFFLINE VALIDATION (run isolation): FAIL (' + failed + '/' + (passed + failed) + ')\n');
    process.exit(1);
  }
  process.stdout.write('  PASS  ' + passed + ' run-isolation assertion(s) passed\n');
  process.exit(0);
});
