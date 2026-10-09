'use strict';
require('./lib/run-tmp').isolate('ptqa-ft-');

/*
 * qa/fixture_template_offline.js
 *
 * work/qa-template-fixtures/brief.md §1.5 (FT-1, FT-1c, FT-2 .. FT-7 and their planted negatives).
 * Proves that a fixture built from a per-run template (copied with the file system, no Git process) is equivalent to a freshly
 * built one, that copies are independent and leak no template path, that mutant / custom-origin fixtures never use a template,
 * and that the two land suites changed only where the brief allows.
 *
 * The land suites are scripts (they run their rows when loaded), so their fixture builders are taken from SOURCE TEXT: the
 * function bodies are extracted by brace matching and evaluated in a harness that supplies the few free names they use. "Fresh"
 * is the builder of the baseline commit (git show), "copied" is the builder in the working tree. Planted negatives mutate the
 * extracted production source (every anchor counted exactly once) or feed a checker a deliberately broken input.
 *
 * Everything runs under a private temp root (qa/lib/run-tmp.js); offline, real Git, no network.
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const QA_DIR = __dirname;
const BASELINE_OID = 'f3c0728807c7bc2d66faaf4cc1387a83f8a979e6';
const REAL_TOOL_PATH = path.join(ROOT, '.claude', 'hooks', 'pt-land.js');
const REAL_INTEGRITY_PATH = path.join(ROOT, 'qa', 'guard_integrity_check.js');
const DEFAULT_LAND_EVIDENCE = 'LAND-EVIDENCE: qa-offline=PASS 52; targeted=PASS; codex-classI-unresolved=0';
const GITIGNORE_TEXT = 'work/*/plan.md\nwork/*/codex.md\nwork/*/qa.log\n';

let passed = 0;
let failed = 0;
const failures = [];
const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

// ── plumbing ─────────────────────────────────────────────────────────────────────────────
function G(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ' in ' + cwd + ' failed: ' + (r.stderr || r.stdout));
  return String(r.stdout);
}
function GR(args, cwd) { return spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }); }
function W(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function fwd(p) { return String(p).replace(/\\/g, '/'); }
function lf(s) { return String(s).replace(/\r\n/g, '\n'); }
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function gitShow(rel) {
  const r = spawnSync('git', ['show', BASELINE_OID + ':' + rel], { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  assert.strictEqual(r.status, 0, 'git show ' + BASELINE_OID.slice(0, 7) + ':' + rel + ' failed: ' + r.stderr);
  return lf(r.stdout);
}
function readWork(rel) { return lf(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
function onceIn(text, needle, what) {
  const n = text.split(needle).length - 1;
  assert.strictEqual(n, 1, what + ': anchor found ' + n + ' time(s): ' + needle.slice(0, 90));
}

// ── extract a top-level or nested function by name (brace matching that skips strings, comments, template literals, regexes) ──
function extractFunction(src, name) {
  const m = new RegExp('(^|\\n)([ \\t]*)function ' + name + '\\(').exec(src);
  assert.ok(m, 'function ' + name + ' not found');
  const start = m.index + m[1].length;
  let i = src.indexOf('{', start + m[2].length);
  const open = i;
  let depth = 0;
  let prevSig = '';
  for (; i < src.length; i += 1) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1; i += 1; continue; }
    if (c === '\'' || c === '"') { const q = c; i += 1; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i += 1; i += 1; } prevSig = q; continue; }
    if (c === '`') { i += 1; while (i < src.length && src[i] !== '`') { if (src[i] === '\\') i += 1; i += 1; } prevSig = c; continue; }
    if (c === '/' && '(,=:[!&|?{};'.indexOf(prevSig) !== -1) {
      i += 1; let inClass = false;
      while (i < src.length && (src[i] !== '/' || inClass)) { if (src[i] === '\\') i += 1; else if (src[i] === '[') inClass = true; else if (src[i] === ']') inClass = false; i += 1; }
      prevSig = '/'; continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) return src.slice(start, i + 1); }
    if (!/\s/.test(c)) prevSig = c;
  }
  throw new Error('unbalanced braces in function ' + name + ' (opened at ' + open + ')');
}

// ── harness: evaluate extracted builders; `spy` records template() calls and (optionally) the template directories ──
const FT_REAL = require('./lib/fixture-template');
// One harness instance = one set of builders: its templates are keyed with an instance prefix, so a mutated builder can never be
// served a template that another instance built (and a template directory name is never reused).
let instanceCounter = 0;
function makeSpy() {
  const calls = [];
  instanceCounter += 1;
  const prefix = 'h' + instanceCounter + ':';
  const mod = {
    template(key, build) { const entry = FT_REAL.template(prefix + key, build); calls.push({ key, dir: entry.dir }); return entry; },
    materialize: FT_REAL.materialize,
    timings: FT_REAL.timings
  };
  return { calls, mod };
}
function harnessRequire(spyMod) {
  const r = (m) => {
    if (m === './lib/fixture-template') return spyMod;
    if (m === 'crypto') return crypto;
    if (m === 'fs') return fs;
    if (m === 'os') return os;
    if (m === 'path') return path;
    if (path.isAbsolute(m)) return require(m); // the fixture's own copy of the tool (requireTool)
    throw new Error('harness: unexpected require(' + m + ')');
  };
  r.resolve = require.resolve;
  r.cache = require.cache;
  return r;
}
// pt_land: { buildFixture, buildCleanupFixture }
function landBuilders(src, spyMod) {
  spyMod = spyMod || makeSpy().mod;
  const body = extractFunction(src, 'buildFixture') + '\n' + extractFunction(src, 'buildCleanupFixture') + '\nreturn { buildFixture: buildFixture, buildCleanupFixture: buildCleanupFixture };';
  const make = new Function('G', 'W', 'fs', 'os', 'path', 'crypto', 'REAL_TOOL_PATH', 'REAL_INTEGRITY_PATH', 'DEFAULT_LAND_EVIDENCE', 'rmrf', 'GITIGNORE_TEXT', 'require', body);
  return make(G, W, fs, os, path, crypto, REAL_TOOL_PATH, REAL_INTEGRITY_PATH, DEFAULT_LAND_EVIDENCE, rmrf, GITIGNORE_TEXT, harnessRequire(spyMod));
}
// resync: { buildFixture }
function resyncBuilder(src, spyMod) {
  spyMod = spyMod || makeSpy().mod;
  const body = extractFunction(src, 'buildFixture') + '\nreturn buildFixture;';
  const rev = (cwd, ref) => G(['rev-parse', ref], cwd).trim();
  const make = new Function('G', 'W', 'rev', 'fs', 'os', 'path', 'crypto', 'TOOL_PATH', 'INTEGRITY_PATH', 'NOW', 'rmrf', 'require', body);
  return make(G, W, rev, fs, os, path, crypto, REAL_TOOL_PATH, REAL_INTEGRITY_PATH, '2026-10-03T12:00:00.000Z', rmrf, harnessRequire(spyMod));
}
const LAND_SRC_BASE = () => gitShow('qa/pt_land_offline.js');
const LAND_SRC_NOW = () => readWork('qa/pt_land_offline.js');
const RS_SRC_BASE = () => gitShow('qa/pt_land_resync_offline.js');
const RS_SRC_NOW = () => readWork('qa/pt_land_resync_offline.js');

// ── what "equivalent" means: refs, tree OIDs, commit subjects and parent shape, HEADs, config, remote, status, fsck, worktrees ──
function treeAndShape(cwd, ref) {
  const log = G(['log', '--format=%s%x1f%P', ref], cwd).trim().split('\n').filter(Boolean).map((l) => { const [s, p] = l.split('\x1f'); return s + ' | parents=' + (p ? p.split(' ').length : 0); });
  return { tree: G(['rev-parse', ref + '^{tree}'], cwd).trim(), log };
}
function describeRepo(cwd, bare) {
  const refs = G(['for-each-ref', '--format=%(refname)'], cwd).trim().split('\n').filter(Boolean).sort();
  const out = { refs: {} };
  for (const r of refs) out.refs[r] = treeAndShape(cwd, r);
  const sym = GR(['symbolic-ref', '-q', 'HEAD'], cwd);
  out.head = sym.status === 0 ? String(sym.stdout).trim() : 'DETACHED ' + G(['rev-parse', 'HEAD^{tree}'], cwd).trim();
  out.status = bare ? '(bare)' : G(['status', '--porcelain=v1', '--untracked-files=all'], cwd);
  out.fsck = GR(['fsck', '--no-dangling'], cwd).status;
  return out;
}
function describeFixture(fx) {
  const norm = (s) => lf(fwd(s)).split(fwd(fx.tmp)).join('<TMP>').toLowerCase().split(fwd(fx.tmp).toLowerCase()).join('<TMP>');
  const d = { keys: Object.keys(fx).sort(), canon: describeRepo(fx.canon, false), bare: describeRepo(fx.bareDir, true) };
  const cfg = G(['config', '--list', '--local'], fx.canon).split('\n').filter((l) => l && l.indexOf('remote.origin.url=') !== 0).sort();
  d.config = cfg;
  d.remoteUrlIsOwn = path.resolve(G(['config', '--get', 'remote.origin.url'], fx.canon).trim()).toLowerCase() === path.resolve(fx.bareDir).toLowerCase();
  d.slotA = fx.slotA ? describeRepo(fx.slotA, false) : null;
  d.slotB = fx.slotB ? describeRepo(fx.slotB, false) : null;
  const wt = G(['worktree', 'list', '--porcelain'], fx.canon).split('\n').filter((l) => l.startsWith('worktree ') || l.startsWith('branch ') || l === 'detached').map(norm);
  d.worktrees = wt;
  const logPath = path.join(fx.commonDir, 'pt-land-log');
  d.audit = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => { const e = JSON.parse(l); return e.verb + ':' + e.result; }) : [];
  d.records = fs.readdirSync(fx.commonDir).filter((n) => /^pt-/.test(n)).sort();
  return d;
}
function equivalent(a, b) {
  try { assert.deepStrictEqual(a, b); return true; } catch (e) { return false; }
}
// every non-objects file under dir contains none of the path spellings of `tpl` (own scanner, independent of the helper)
function leaks(dir, tplDir) {
  const f = fwd(tplDir).toLowerCase();
  const b = f.replace(/\//g, '\\');
  const tokens = [f, b, b.replace(/\\/g, '\\\\'), path.basename(tplDir).toLowerCase()];
  const bad = [];
  (function walk(d) {
    for (const n of fs.readdirSync(d)) {
      if (n === 'objects') continue;
      const abs = path.join(d, n);
      const st = fs.lstatSync(abs);
      if (st.isDirectory()) { walk(abs); continue; }
      const t = fs.readFileSync(abs).toString('latin1').toLowerCase();
      if (tokens.some((x) => t.indexOf(x) !== -1)) bad.push(abs);
    }
  })(dir);
  return bad;
}
function treeHash(dir) {
  const out = {};
  (function walk(d, rel) {
    for (const n of fs.readdirSync(d)) {
      const abs = path.join(d, n);
      const r = rel ? rel + '/' + n : n;
      if (fs.lstatSync(abs).isDirectory()) walk(abs, r); else out[r] = sha256(fs.readFileSync(abs));
    }
  })(dir, '');
  return out;
}
function mutate(src, replacements, label) {
  let s = src;
  for (const [find, replace] of replacements) { onceIn(s, find, label); s = s.replace(find, () => replace); }
  return s;
}

const MUT_TOOLS = [];
function mutantToolFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptft-tool-'));
  MUT_TOOLS.push(dir);
  const f = path.join(dir, 'pt-land.js');
  fs.writeFileSync(f, fs.readFileSync(REAL_TOOL_PATH, 'utf8') + '\n// mutant marker\n');
  return f;
}

// ═══════════════ FT-0: the template-contract digest gate (work/qa-stage2-git-contracts/brief.md §4) ═══════════════
// The real-Git equivalence proofs - every row below that builds a fixture, marked heavy() - re-run whenever ANY input changed or this
// environment is not a proven one. They are skipped only when the source digest equals TEMPLATE_CONTRACT_PIN.source AND this
// environment digest (qa/lib/exec-env-fingerprint.js, brief §3.6) is in TEMPLATE_CONTRACT_PIN.environments. Rows that start no Git
// process (the FT-3 negatives, the FT-5 fail-closed throws, the FT-0 rows) always run. Evidence is never reused across environments:
// an unproven environment runs everything and passes with a notice; a changed source runs everything and then FAILS "re-pin required".
const FPLIB = require('./lib/exec-env-fingerprint');
const TEMPLATE_CONTRACT_PIN = {
  // set from the passing real run of this task (2026-10-07, Worker A laptop, Windows 11, Git for Windows 2.53.0, Node 24); further environments
  // are added only by a later task with evidence
  source: '288591877fee2d60d5de1732e72db18588107e58ccc486f61642d9fbcd216e90',
  environments: ['ef28452b4eb84527b7208fc76792410d4948cc9d0fa91173a94c79edefa90858']
};
function ftSourceParts() {
  const parts = [];
  for (const rel of ['.claude/hooks/pt-land.js', 'qa/guard_integrity_check.js', 'qa/lib/fixture-template.js']) parts.push({ name: rel, bytes: Buffer.from(readWork(rel), 'utf8') });
  for (const [label, src] of [['land-now', LAND_SRC_NOW()], ['land-base', LAND_SRC_BASE()]]) {
    for (const fn of ['buildFixture', 'buildCleanupFixture']) parts.push({ name: label + ':' + fn, bytes: Buffer.from(extractFunction(src, fn), 'utf8') });
  }
  for (const [label, src] of [['resync-now', RS_SRC_NOW()], ['resync-base', RS_SRC_BASE()]]) parts.push({ name: label + ':buildFixture', bytes: Buffer.from(extractFunction(src, 'buildFixture'), 'utf8') });
  // this suite's own source with the pin statement neutralised (a pin cannot be part of its own digest)
  const own = fs.readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n').replace(/const TEMPLATE_CONTRACT_PIN = \{[\s\S]*?\n\};/, 'const TEMPLATE_CONTRACT_PIN = PIN;');
  parts.push({ name: 'qa/fixture_template_offline.js', bytes: Buffer.from(own, 'utf8') });
  return parts;
}
const FT_PARTS = ftSourceParts();
const FT_SOURCE_DIGEST = FPLIB.digestParts(FT_PARTS);
const FT_ENV = FPLIB.collect();
const FT_GATE = FPLIB.gateDecision(FT_SOURCE_DIGEST, FT_ENV.digest, TEMPLATE_CONTRACT_PIN);
let skippedHeavy = 0;
function heavy(name, fn) { if (FT_GATE === 'skip') { skippedHeavy += 1; return; } test(name, fn); }
test('FT-0: the decision table - both digests pinned -> skip; unpinned environment -> replay, pass with a notice; changed source -> replay, then fail "re-pin required"', () => {
  const pin = { source: 'S', environments: ['E1', 'E2'] };
  assert.strictEqual(FPLIB.gateDecision('S', 'E1', pin), 'skip');
  assert.strictEqual(FPLIB.gateDecision('S', 'E3', pin), 'replay-notice', 'evidence is never reused across a different environment');
  assert.strictEqual(FPLIB.gateDecision('S2', 'E1', pin), 'replay-fail', 'a changed source never skips');
  assert.strictEqual(FPLIB.gateDecision('S', 'E1', { source: null, environments: [] }), 'replay-fail', 'an empty pin never skips');
  assert.strictEqual(FPLIB.gateDecision('S', 'E1', { source: 'S', environments: [] }), 'replay-notice', 'a source pin without a proven environment never skips');
});
test('FT-0 negative: a one-byte change to ANY source input (each is part of the digest) changes the source digest, and so does a removed input', () => {
  const names = FT_PARTS.map((p) => p.name);
  for (const needed of ['.claude/hooks/pt-land.js', 'qa/guard_integrity_check.js', 'qa/lib/fixture-template.js', 'land-now:buildFixture', 'land-now:buildCleanupFixture', 'land-base:buildFixture',
    'resync-now:buildFixture', 'resync-base:buildFixture', 'qa/fixture_template_offline.js']) assert.ok(names.indexOf(needed) !== -1, needed + ' is part of the digest');
  for (let i = 0; i < FT_PARTS.length; i += 1) {
    const changed = FT_PARTS.map((p, j) => (j === i ? { name: p.name, bytes: Buffer.concat([p.bytes, Buffer.from(' ')]) } : p));
    assert.notStrictEqual(FPLIB.digestParts(changed), FT_SOURCE_DIGEST, 'one byte appended to ' + FT_PARTS[i].name);
  }
  assert.notStrictEqual(FPLIB.digestParts(FT_PARTS.slice(1)), FT_SOURCE_DIGEST, 'a removed input');
});

// ═══════════════ FT-1: equivalence of the pt_land base (plain and .gitignore keys) ═════════════
const copies = {}; // shared evidence between rows (computed once, asserted against)
function landPair(opts) {
  const fresh = landBuilders(LAND_SRC_BASE()).buildFixture(opts);
  const spy = makeSpy();
  const cur = landBuilders(LAND_SRC_NOW(), spy.mod);
  const copied = cur.buildFixture(opts);
  return { fresh, copied, spy };
}
for (const [label, opts] of [['plain', { taskShort: 'ft1' }], ['.gitignore', { taskShort: 'ft1g', gitignore: GITIGNORE_TEXT }]]) {
  heavy('FT-1 (' + label + ' key): a copied pt_land fixture equals a fresh-built one - ref names, tree OIDs, commit messages, parent shape, HEADs, config, own remote URL, clean status, fsck, worktrees', () => {
    const { fresh, copied, spy } = landPair(opts);
    try {
      assert.ok(spy.calls.length >= 1, 'the working-tree builder used a template for the real tool');
      const a = describeFixture(fresh);
      const b = describeFixture(copied);
      assert.strictEqual(b.remoteUrlIsOwn, true, 'remote URL = the copy\'s own origin');
      assert.strictEqual(b.canon.status, '', 'clean status');
      assert.strictEqual(b.canon.fsck, 0, 'fsck clean');
      assert.deepStrictEqual(b, a, 'copied == fresh');
      copies[label] = { spy, dir: spy.calls[0].dir, fx: copied };
    } finally { fresh.cleanup(); if (!copies[label]) copied.cleanup(); }
  });
  heavy('FT-1 planted negative (' + label + '): a template with one push left out is NOT equivalent', () => {
    const fresh = landBuilders(LAND_SRC_BASE()).buildFixture(opts);
    const mutSrc = mutate(LAND_SRC_NOW(), [["G(['push', 'origin', 'main'], canon);", '/* push left out */']], 'FT-1 negative');
    const copied = landBuilders(mutSrc, makeSpy().mod).buildFixture(Object.assign({}, opts, { taskShort: opts.taskShort + 'x' }));
    try {
      const a = describeFixture(fresh);
      const b = describeFixture(copied);
      assert.strictEqual(equivalent(a, b), false, 'the divergent template must be detected');
    } finally { fresh.cleanup(); copied.cleanup(); }
  });
}

// ═══════════════ FT-1c: the landed-and-pushed cleanup template ═════════════════════════════
heavy('FT-1c: a copied landed fixture equals a fresh landed fixture (same task id cltpl) - branch-dev / origin/branch-dev / bare-origin trees, slot HEADs and status, exactly one land ok + one push ok audit line, no approval record, no lock', () => {
  const fresh = landBuilders(LAND_SRC_BASE()).buildCleanupFixture({ taskShort: 'cltpl' });
  const spy = makeSpy();
  const copied = landBuilders(LAND_SRC_NOW(), spy.mod).buildCleanupFixture({ landed: true });
  try {
    const a = describeFixture(fresh);
    const b = describeFixture(copied);
    assert.deepStrictEqual(b.audit, ['land:ok', 'push:ok'], 'exactly one land ok and one push ok line');
    assert.deepStrictEqual(b.records.filter((n) => /approval$/.test(n)), [], 'no approval record');
    assert.ok(!fs.existsSync(path.join(copied.commonDir, 'pt-land.lock')), 'no lock');
    assert.strictEqual(copied.taskShort, 'cltpl');
    assert.strictEqual(copied.canon === fresh.canon, false, 'a copy has its own directory');
    assert.deepStrictEqual(b, a, 'landed copy == fresh landed');
    const tree = (cwd, ref) => G(['rev-parse', ref + '^{tree}'], cwd).trim();
    assert.strictEqual(tree(copied.canon, 'refs/remotes/origin/branch-dev'), tree(fresh.canon, 'refs/remotes/origin/branch-dev'));
    assert.strictEqual(tree(copied.bareDir, 'refs/heads/branch-dev'), tree(fresh.canon, 'refs/heads/branch-dev'));
    copies.landed = { dir: spy.calls.find((c) => /landed/.test(c.key)).dir, fx: copied, spy };
  } finally { fresh.cleanup(); if (!copies.landed) copied.cleanup(); }
});
heavy('FT-1c planted negatives: a landed template missing the push, and one with an approval record left behind, are NOT equivalent', () => {
  const fresh = landBuilders(LAND_SRC_BASE()).buildCleanupFixture({ taskShort: 'cltpl' });
  try {
    const a = describeFixture(fresh);
    const noPush = mutate(LAND_SRC_NOW(), [["if (!pushRes.ok) throw new Error('fixture setup: push failed: ' + pushRes.reason);", "/* push result unchecked */"],
      ["const pushRes = TOOL.runPush({ cwd: fx.canon, expectedOriginUrls: [fx.originUrl] });", "const pushRes = { ok: true };"]], 'FT-1c no-push');
    const m1 = landBuilders(noPush, makeSpy().mod).buildCleanupFixture({ landed: true });
    try { assert.strictEqual(equivalent(a, describeFixture(m1)), false, 'missing push detected'); } finally { m1.cleanup(); }
    const leftRecord = mutate(LAND_SRC_NOW(), [["if (!pushRes.ok) throw new Error('fixture setup: push failed: ' + pushRes.reason);", "if (!pushRes.ok) throw new Error('fixture setup: push failed: ' + pushRes.reason); fx.writePushRecord('PUSH branch-dev x y\\n');"]], 'FT-1c record');
    const m2 = landBuilders(leftRecord, makeSpy().mod).buildCleanupFixture({ landed: true });
    try { assert.strictEqual(equivalent(a, describeFixture(m2)), false, 'a left-behind approval record detected'); } finally { m2.cleanup(); }
  } finally { fresh.cleanup(); }
});

// ═══════════════ FT-2: the resync recipe ═══════════════════════════════════════════════════
heavy('FT-2: a copied resync fixture equals a fresh one, incl. git worktree list (same worktrees, branches and HEADs, paths under the new directory) and both slots clean', () => {
  const fresh = resyncBuilder(RS_SRC_BASE())();
  const spy = makeSpy();
  const copied = resyncBuilder(RS_SRC_NOW(), spy.mod)();
  try {
    assert.ok(spy.calls.length >= 1, 'a template was used for the real tool');
    const a = describeFixture(fresh);
    const b = describeFixture(copied);
    assert.deepStrictEqual(b.worktrees.filter((l) => l.startsWith('worktree ')).length, 3);
    assert.ok(b.worktrees.filter((l) => l.startsWith('worktree ')).every((l) => l.indexOf('<tmp>') !== -1), 'every worktree path is under the new directory');
    assert.strictEqual(b.slotA.status, '');
    assert.strictEqual(b.slotB.status, '');
    assert.deepStrictEqual(b, a, 'copied == fresh');
    assert.strictEqual(copied.base, G(['rev-parse', 'branch-dev'], copied.canon).trim(), 'base is re-read from the copy');
    copies.resync = { dir: spy.calls[0].dir, fx: copied, spy };
  } finally { fresh.cleanup(); if (!copies.resync) copied.cleanup(); }
});
heavy('FT-2 planted negative: a missing worktree rewrite is caught (the copy throws, or is not equivalent)', () => {
  const mutSrc = mutate(RS_SRC_NOW(), [["'portfolio-tracker/.git/worktrees/*/gitdir', ", '']], 'FT-2 negative');
  let threw = false;
  try { const fx = resyncBuilder(mutSrc, makeSpy().mod)(); fx.cleanup(); } catch (e) { threw = /template path survives|rewrite/.test(String(e && e.message)); }
  assert.strictEqual(threw, true, 'the missing rewrite must be caught by the leak scan');
});

// ═══════════════ FT-3: no path leak ════════════════════════════════════════════════════════
heavy('FT-3: after materialisation no file outside objects/ contains the template path in any spelling (copied pt_land, landed and resync fixtures)', () => {
  assert.ok(copies.plain && copies.landed && copies.resync, 'FT-1 / FT-1c / FT-2 produced copies');
  for (const key of ['plain', 'landed', 'resync']) {
    const c = copies[key];
    assert.deepStrictEqual(leaks(c.fx.tmp, c.dir), [], key + ': no template path survives');
    assert.ok(fs.existsSync(c.dir), key + ': the template itself still exists (it is never handed to a test)');
    assert.notStrictEqual(path.resolve(c.fx.tmp).toLowerCase(), path.resolve(c.dir).toLowerCase());
  }
});
test('FT-3 planted negatives: a skipped rewrite is caught by the helper, and the independent scanner really finds a leak in an un-rewritten copy', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ptft-leak-'));
  try {
    const tpl = path.join(root, 'tpl-aaaaaaaaaaaa');
    const cfg = path.join(tpl, 'portfolio-tracker', '.git', 'config');
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    const s = (p) => [fwd(p), p.replace(/\//g, '\\'), p.replace(/\//g, '\\').replace(/\\/g, '\\\\')];
    fs.writeFileSync(cfg, '[remote "origin"]\n\turl = ' + s(tpl)[2] + '\n\turl2 = ' + s(tpl)[1] + '\n\turl3 = ' + s(tpl)[0] + '\n');
    const dest = path.join(root, 'copy');
    fs.mkdirSync(dest);
    assert.throws(() => FT_REAL.materialize(tpl, dest, []), /template path survives/, 'no rewrite listed -> leak -> throws');
    const dest2 = path.join(root, 'copy2');
    fs.mkdirSync(dest2);
    FT_REAL.materialize(tpl, dest2, ['portfolio-tracker/.git/config']);
    assert.deepStrictEqual(leaks(dest2, tpl), [], 'all three spellings rewritten');
    const text = fs.readFileSync(path.join(dest2, 'portfolio-tracker', '.git', 'config'), 'utf8');
    for (const form of s(dest2)) assert.ok(text.indexOf(form) !== -1, 'the destination spelling is present: ' + form);
    const manual = path.join(root, 'manual');
    fs.cpSync(tpl, manual, { recursive: true });
    assert.ok(leaks(manual, tpl).length > 0, 'the independent scanner finds a leak in a plain copy');
  } finally { rmrf(root); }
});

// ═══════════════ FT-4: independence ════════════════════════════════════════════════════════
function independence(fxA, fxB, tplDir) {
  const beforeB = { refs: G(['for-each-ref'], fxB.canon), files: treeHash(fxB.tmp) };
  const beforeT = treeHash(tplDir);
  G(['checkout', '-q', '-b', 'indep-branch'], fxA.canon);
  W(path.join(fxA.canon, 'indep.txt'), 'x\n');
  G(['add', 'indep.txt'], fxA.canon);
  G(['commit', '-q', '-m', 'indep commit'], fxA.canon);
  G(['worktree', 'add', '-q', path.join(fxA.tmp, 'extra-wt'), '-b', 'indep-wt'], fxA.canon);
  const sameB = G(['for-each-ref'], fxB.canon) === beforeB.refs && equivalent(treeHash(fxB.tmp), beforeB.files);
  const sameT = equivalent(treeHash(tplDir), beforeT);
  const aChanged = G(['for-each-ref'], fxA.canon) !== beforeB.refs;
  return sameB && sameT && aChanged;
}
heavy('FT-4: two fixtures from one template are independent - a commit, a branch and a worktree in one change neither the other nor the template (ref lists and file-tree hashes)', () => {
  const spy = makeSpy();
  const cur = landBuilders(LAND_SRC_NOW(), spy.mod);
  const a = cur.buildFixture({ taskShort: 'ft4a' });
  const b = cur.buildFixture({ taskShort: 'ft4b' });
  try {
    assert.notStrictEqual(a.tmp, b.tmp);
    assert.strictEqual(spy.calls.length, 2);
    assert.strictEqual(spy.calls[0].dir, spy.calls[1].dir, 'one template');
    assert.strictEqual(independence(a, b, spy.calls[0].dir), true);
  } finally { a.cleanup(); b.cleanup(); }
});
heavy('FT-4 planted negative: a checker fed two fixtures that SHARE one directory reports them dependent', () => {
  const cur = landBuilders(LAND_SRC_NOW(), makeSpy().mod);
  const a = cur.buildFixture({ taskShort: 'ft4s' });
  try {
    const tplDirCopy = path.join(os.tmpdir(), 'ptft-shared-tpl');
    fs.cpSync(a.tmp, tplDirCopy, { recursive: true });
    try { assert.strictEqual(independence(a, a, tplDirCopy), false, 'the same fixture passed as both is not independent'); } finally { rmrf(tplDirCopy); }
  } finally { a.cleanup(); }
});

// ═══════════════ FT-5: the fresh paths ═════════════════════════════════════════════════════
heavy('FT-5: a mutant source, an explicit non-real toolSource and an originUrl fixture never call template(); the real source passed explicitly does', () => {
  const spy = makeSpy();
  const cur = landBuilders(LAND_SRC_NOW(), spy.mod);
  const mut = mutantToolFile();
  const fxs = [];
  try {
    fxs.push(cur.buildFixture({ taskShort: 'ft5m', toolSource: mut }));
    assert.strictEqual(spy.calls.length, 0, 'a mutant tool source builds fresh');
    fxs.push(cur.buildFixture({ taskShort: 'ft5o', originUrl: 'https://example.invalid/x.git' }));
    assert.strictEqual(spy.calls.length, 0, 'an originUrl fixture builds fresh');
    fxs.push(cur.buildFixture({ taskShort: 'ft5r', toolSource: REAL_TOOL_PATH }));
    assert.ok(spy.calls.length >= 1, 'the real source passed explicitly uses a template');
    const n = spy.calls.length;
    const copyOfReal = path.join(path.dirname(mut), 'same-content.js');
    fs.copyFileSync(REAL_TOOL_PATH, copyOfReal);
    fxs.push(cur.buildFixture({ taskShort: 'ft5c', toolSource: copyOfReal }));
    assert.ok(spy.calls.length > n, 'a different file with the SAME content as the real tool is the real tool (content hash)');
  } finally { for (const f of fxs) f.cleanup(); }
});
test('FT-5: buildCleanupFixture with landed:true plus a mutant source, originUrl, land:false, push:false or another task id THROWS (fail closed); mu4-mu7, cl2 and cl3 take the fresh path', () => {
  const spy = makeSpy();
  const cur = landBuilders(LAND_SRC_NOW(), spy.mod);
  const mut = mutantToolFile();
  for (const [label, o] of [['mutant source', { landed: true, toolSource: mut }], ['originUrl', { landed: true, originUrl: 'https://example.invalid/x.git' }],
    ['land:false', { landed: true, land: false }], ['push:false', { landed: true, push: false }], ['another task id', { landed: true, taskShort: 'other' }]]) {
    assert.throws(() => cur.buildCleanupFixture(o), /landed/, label + ' must throw');
  }
  assert.strictEqual(spy.calls.length, 0, 'the throws happen before anything is built or templated');
  // the rows that must stay fresh pass no `landed` option: their option sets are statically absent from the land suite
  const src = LAND_SRC_NOW();
  for (const needle of ["buildCleanupFixture({ taskShort: 'mu6', toolSource: mutSrc })", "buildCleanupFixture({ taskShort: 'mu7', toolSource: mutSrc })"]) onceIn(src, needle, 'FT-5 fresh-path row');
  // cl2, cl3, mu4 and mu5 moved to the zero-process logic suite (work/qa-stage2-git-contracts, G-MAP): their scenarios in the recorder's
  // table must still build fresh, i.e. pass no `landed` option.
  const REC = require('./tools/record-git-transcripts');
  for (const id of ['pl23-not-landed', 'pl24-not-pushed', 'mut-cleanup-k3', 'mut-cleanup-k4']) {
    const scn = REC.SCENARIOS.find((s) => s.id === id);
    assert.ok(scn && scn.build.fn === 'buildCleanupFixture' && scn.build.opts.landed === undefined, id + ' takes the fresh path');
  }
});
heavy('FT-5: the fresh path of the working-tree builder equals the baseline builder (a mutant-source fixture)', () => {
  const mut = mutantToolFile();
  const a = landBuilders(LAND_SRC_BASE()).buildFixture({ taskShort: 'ft5e', toolSource: mut });
  const b = landBuilders(LAND_SRC_NOW(), makeSpy().mod).buildFixture({ taskShort: 'ft5e', toolSource: mut });
  try { assert.deepStrictEqual(describeFixture(b), describeFixture(a)); } finally { a.cleanup(); b.cleanup(); }
});
heavy('FT-5 planted negatives: a mutant routed through a template is caught by the spy; landed with a mutant not throwing is caught', () => {
  const mut = mutantToolFile();
  const route = mutate(LAND_SRC_NOW(), [['const useTemplate = originUrl === undefined && sameContent(toolSource, REAL_TOOL_PATH);', 'const useTemplate = true;']], 'FT-5 route');
  const spy = makeSpy();
  const fx = landBuilders(route, spy.mod).buildFixture({ taskShort: 'ft5n', toolSource: mut });
  try { assert.ok(spy.calls.length >= 1, 'the spy sees the template call for a mutant source'); } finally { fx.cleanup(); }
  const noThrow = mutate(LAND_SRC_NOW(), [['if (!landedAllowed) throw new Error(', 'if (false) throw new Error(']], 'FT-5 throw');
  let threw = true;
  try { const f = landBuilders(noThrow, makeSpy().mod).buildCleanupFixture({ landed: true, toolSource: mut }); f.cleanup(); threw = false; } catch (e) { threw = true; }
  assert.strictEqual(threw, false, 'with the guard removed, landed + mutant no longer throws');
});

// ═══════════════ FT-7: no vacuous path checks ══════════════════════════════════════════════
function landedPathsOk(fx) {
  const t = fx.taskShort;
  const ok = [
    fs.existsSync(path.join(fx.slotA, 'work', t, 'foo.txt')),
    fs.existsSync(path.join(fx.slotA, 'work', t, 'review.md')),
    GR(['rev-parse', '--verify', '-q', 'refs/heads/task/' + t], fx.canon).status === 0,
    GR(['rev-parse', '--verify', '-q', fx.task + '^{commit}'], fx.canon).status === 0,
    fx.task === 'task/' + t
  ];
  return ok.every(Boolean);
}
heavy('FT-7: for a materialised landed fixture every path the nine cleanup rows inspect exists before cleanup - under work/<fx.taskShort>/ in slot A and as task/<fx.taskShort> in the canonical refs; the ignored evidence files can be written there', () => {
  assert.ok(copies.landed, 'FT-1c produced a landed copy');
  const fx = copies.landed.fx;
  assert.strictEqual(landedPathsOk(fx), true);
  for (const name of ['plan.md', 'codex.md', 'qa.log']) W(path.join(fx.slotA, 'work', fx.taskShort, name), name + '\n');
  assert.strictEqual(G(['status', '--porcelain'], fx.slotA).trim(), '', 'ignored evidence is cleanly ignored (the .gitignore came with the template)');
});
heavy('FT-7 planted negative: a copy whose claimed task id differs from its committed content fails the path check', () => {
  assert.ok(copies.landed, 'FT-1c produced a landed copy');
  const fx = copies.landed.fx;
  assert.strictEqual(landedPathsOk(Object.assign({}, fx, { taskShort: 'cl1', task: 'task/cl1' })), false);
});

// FT-0 verdict: runs LAST, after every heavy proof above has run (or was skipped under a matching pin)
test('FT-0: the gate - skipped only under a matching pin; an unproven environment passes with a notice; a changed or unpinned source fails "re-pin required"', () => {
  if (FT_GATE === 'skip') { process.stdout.write('  SKIP  (contract pinned: ' + FT_SOURCE_DIGEST.slice(0, 12) + '/' + FT_ENV.digest.slice(0, 12) + ') ' + skippedHeavy + ' heavy real-Git row(s) not run\n'); return; }
  if (FT_GATE === 'replay-fail') {
    throw new Error('re-pin required: source ' + FT_SOURCE_DIGEST + ' environment ' + FT_ENV.digest + ' (every heavy proof above passed against real Git; set TEMPLATE_CONTRACT_PIN to this source digest and add this environment digest)');
  }
  process.stdout.write('  NOTE  environment not pinned: ' + FT_ENV.digest + '; record it in a task to enable the fast path\n');
});

// ── run, then clean ─────────────────────────────────────────────────────────────────────
(async () => {
  for (const t of pending) {
    try { await t.fn(); passed += 1; } catch (e) { failed += 1; failures.push(t.name + ' -- ' + (e && e.message ? e.message : String(e))); }
  }
  for (const k of Object.keys(copies)) { try { copies[k].fx.cleanup(); } catch (e) { /* best effort */ } }
  for (const d of MUT_TOOLS) rmrf(d);
  if (failed > 0) {
    for (const f of failures) process.stdout.write('  FAIL  ' + f + '\n');
    process.stdout.write('\nOFFLINE VALIDATION (fixture templates): FAIL (' + failed + '/' + (passed + failed) + ')\n');
    process.exit(1);
  }
  process.stdout.write('  PASS  ' + passed + ' fixture-template assertion(s) passed\n');
  process.exit(0);
})();
