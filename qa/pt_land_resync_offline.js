'use strict';
// Slice 0 (work/qa-isolation-meter): private temp root per run, then counting/timing only.
require('./lib/run-tmp').isolate('ptqa-resync-');
const meter = require('./lib/spawn-meter').install();

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
  // Slice 1 (work/qa-template-fixtures): the whole recipe below is built ONCE per run for the real tool and copied per fixture; a
  // mutant tool source builds it fresh, step for step as before.
  const sameContent = (a, b) => a === b ||
    crypto.createHash('sha256').update(fs.readFileSync(a)).digest('hex') === crypto.createHash('sha256').update(fs.readFileSync(b)).digest('hex');
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
    G(['worktree', 'add', '-b', 'task/one', slotA, 'branch-dev'], canon);
    G(['worktree', 'add', '-b', 'task/two', slotB, 'branch-dev'], canon);
  };
  const useTemplate = sameContent(toolSource, TOOL_PATH);
  if (useTemplate) {
    const FT = require('./lib/fixture-template');
    const realHash = crypto.createHash('sha256').update(fs.readFileSync(TOOL_PATH)).digest('hex');
    const t = FT.template('resync:' + realHash + ':' + JSON.stringify(o.briefs || ['one', 'two']), (dir) => { buildRecipe(dir); });
    FT.materialize(t.dir, tmp, ['portfolio-tracker/.git/config', 'portfolio-tracker/.git/worktrees/*/gitdir', 'pt-wt-worker-a/.git', 'pt-wt-worker-b/.git']);
  } else {
    buildRecipe(tmp);
  }
  const base = rev(canon, 'branch-dev');
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

// ═══════════════ E1: the digest gate (work/qa-e1-digest-gate/brief.md) ═══════════════
// Every row of this suite that starts a process (real Git, Node, the hook CLI) is HEAVY: it is registered through heavy() and is skipped only
// when the source digest equals RESYNC_CONTRACT_PIN.source AND the environment key is one of RESYNC_CONTRACT_PIN.environments (the GC-4 / FT-0 pattern; digestParts of
// qa/lib/exec-env-fingerprint.js). Every other case runs it: a changed input runs it and then FAILS "re-pin required"; an unproven environment
// runs it and passes with a notice; an override variable or PT_QA_FORCE_HEAVY=1 is a full replay. A pin is set only from a forced replay's printed digests.
const FPLIB = require('./lib/exec-env-fingerprint');
const e1crypto = require('crypto');
const RESYNC_CONTRACT_PIN = {
  source: '043981f5b4cd173d177aacfa72b06ac3f20dc6505a7d696d4b1aa2dec3c09075',
  environments: ['5257c227140204f038c0ec7eb724abb44dbf4e31a2c6d3c5e8a6f07727f1aeb0']
};
const E1_LABEL = 'pt-land-resync';
const E1_PART_NAMES = [
  '.claude/hooks/pt-land.js',
  'qa/guard_integrity_check.js',
  'qa/lib/fixture-template.js',
  'qa/lib/run-tmp.js',
  'qa/lib/spawn-meter.js',
  'qa/lib/exec-env-fingerprint.js'
];
const E1_OVERRIDE_VARS = ['PT_LAND_TOOL_PATH', 'AH_HOOK_PATH', 'AH_SETTINGS_PATH', 'TB_ONLY', 'NODE_OPTIONS'];
const E1_HEX64 = /^[0-9a-f]{64}$/;
const E1_OWN_NAME = 'qa/' + path.basename(__filename);
function e1Assert(cond, message) { if (!cond) throw new Error(message); }
function e1Normalise(text) { return String(text).replace(/\r\n/g, '\n'); }
// A pin cannot be part of its own digest: the pin statement is neutralised in this file's own source part.
function e1OwnNeutral(text) { return e1Normalise(text).replace(/const RESYNC_CONTRACT_PIN = \{[\s\S]*?\n\};/, 'const RESYNC_CONTRACT_PIN = PIN;'); }
function e1PinValid(pin) {
  return !!pin && typeof pin.source === 'string' && E1_HEX64.test(pin.source) && Array.isArray(pin.environments) && pin.environments.length > 0 &&
    pin.environments.every((x) => typeof x === 'string' && E1_HEX64.test(x)) && new Set(pin.environments).size === pin.environments.length;
}
// R4, a pure function. G0 force set to anything but exactly "1"; G6 pin malformed; G4 an override variable set (defined and non-empty);
// G3 source differs from the pin; G5 force "1"; G2 environment not in the pin; G1 skip.
function e1Decide(o) {
  const vars = o.vars || {};
  const force = vars.PT_QA_FORCE_HEAVY;
  if (force !== undefined && force !== '1') return 'invalid-force';
  if (!e1PinValid(o.pin)) return 'pin-invalid';
  const over = E1_OVERRIDE_VARS.filter((v) => vars[v] !== undefined && vars[v] !== '');
  if (over.length > 0) return 'override:' + over[0];
  if (o.pin.source !== o.src) return 'replay-fail';
  if (force === '1') return 'forced';
  if (o.pin.environments.indexOf(o.env) === -1) return 'replay-notice';
  return 'skip';
}
// The source parts (R2), always read from the repo paths under ROOT (never from an override path), LF-normalised, plus this file's own source.
function e1Parts(ownText) {
  const parts = [];
  for (const rel of E1_PART_NAMES) parts.push({ name: rel, bytes: Buffer.from(e1Normalise(fs.readFileSync(path.join(ROOT, rel), 'utf8')), 'utf8') });
  parts.push({ name: E1_OWN_NAME, bytes: Buffer.from(e1OwnNeutral(ownText), 'utf8') });
  return parts;
}
const E1_OWN_TEXT = fs.readFileSync(__filename, 'utf8');
const E1_PARTS = e1Parts(E1_OWN_TEXT);
const E1_SRC = FPLIB.digestParts(E1_PARTS);
// R3: the environment key = the GC-4 / FT environment digest plus the FULL Node version (E1-D5); qa/lib/exec-env-fingerprint.js is unchanged.
const E1_ENV = e1crypto.createHash('sha256').update('e1-env-v1\n' + FPLIB.collect().digest + '\nnode ' + process.version).digest('hex');
const E1_VARS = {};
for (const k of ['PT_QA_FORCE_HEAVY'].concat(E1_OVERRIDE_VARS)) if (process.env[k] !== undefined) E1_VARS[k] = process.env[k];
const E1_GATE = e1Decide({ src: E1_SRC, env: E1_ENV, pin: RESYNC_CONTRACT_PIN, vars: E1_VARS });
const E1_SKIP = E1_GATE === 'skip';
let e1Reached = 0;
let e1Skipped = 0;
let e1HeavyRun = 0;
// A heavy row: skipped (and counted) under a matching pin, otherwise the existing test(name, fn) runs it unchanged.
function heavy(name, fn) {
  e1Reached += 1;
  if (E1_SKIP) { e1Skipped += 1; return; }
  e1HeavyRun += 1;
  test(name, fn);
}
// A heavy block: an immediately-invoked function that builds a real-Git fixture outside any row and registers `rows` rows inside it.
// Skipped as a whole (its declared rows counted), or run, and then the number of rows it really ran must equal the declared number.
function heavyFn(id, rows, fn) {
  return function heavyBlock() {
    e1Reached += rows;
    if (E1_SKIP) { e1Skipped += rows; return undefined; }
    const before = passed + failed;
    const result = fn.apply(this, arguments);
    const ran = passed + failed - before;
    e1HeavyRun += ran;
    if (ran !== rows) { failed += 1; failures.push('E1 heavy block ' + id + ' -- declared ' + rows + ' row(s), ran ' + ran); }
    return result;
  };
}
function e1Row(name, fn) { test(name, fn); }

// ── source scanning (E1-1 / E1-2): comments, strings and regex literals are blanked so a scan sees only code ──
function e1Blank(src) {
  const out = src.split('');
  const n = src.length;
  const blankRange = (a, b) => { for (let k = a; k < b; k += 1) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0;
  let prev = '';
  let prevWord = '';
  while (i < n) {
    const c = src[i];
    const d2 = src[i + 1];
    if (c === '/' && d2 === '/') { let j = i; while (j < n && src[j] !== '\n') j += 1; blankRange(i, j); i = j; continue; }
    if (c === '/' && d2 === '*') { let j = src.indexOf('*/', i + 2); j = j === -1 ? n : j + 2; blankRange(i, j); i = j; continue; }
    if (c === '\'' || c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      blankRange(i + 1, j); i = j + 1; prev = c; prevWord = ''; continue;
    }
    if (c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== '`') j += src[j] === '\\' ? 2 : 1;
      blankRange(i + 1, j); i = j + 1; prev = c; prevWord = ''; continue;
    }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j += 1;
      prevWord = src.slice(i, j); prev = src[j - 1]; i = j; continue;
    }
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === '/') {
      const regexOk = prev === '' || '(,=:[!&|?{};+-*%<>~^'.indexOf(prev) !== -1 || /^(?:return|typeof|case|in|of|delete|void|throw|new|else|do)$/.test(prevWord);
      if (regexOk) {
        let j = i + 1;
        let cls = false;
        while (j < n && src[j] !== '\n') {
          const e = src[j];
          if (e === '\\') { j += 2; continue; }
          if (e === '[') cls = true; else if (e === ']') cls = false; else if (e === '/' && !cls) break;
          j += 1;
        }
        blankRange(i + 1, j); i = j + 1;
        while (i < n && /[a-z]/.test(src[i])) i += 1;
        prev = ')'; prevWord = ''; continue;
      }
    }
    prev = c; prevWord = ''; i += 1;
  }
  return out.join('');
}
// Index of the bracket that closes the one at blank[open], or -1.
function e1Match(blank, open) {
  const closeOf = { '(': ')', '[': ']', '{': '}' };
  const stack = [];
  for (let k = open; k < blank.length; k += 1) {
    const c = blank[k];
    if (c === '(' || c === '[' || c === '{') stack.push(closeOf[c]);
    else if (c === ')' || c === ']' || c === '}') {
      if (stack.pop() !== c) return -1;
      if (stack.length === 0) return k;
    }
  }
  return -1;
}
function e1Functions(blank) {
  const fns = [];
  const re = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(blank)) !== null) {
    const close = e1Match(blank, m.index + m[0].length - 1);
    if (close === -1) continue;
    let b = close + 1;
    while (b < blank.length && /\s/.test(blank[b])) b += 1;
    if (blank[b] !== '{') continue;
    const end = e1Match(blank, b);
    if (end === -1) continue;
    let a = m.index - 1;
    while (a >= 0 && /\s/.test(blank[a])) a -= 1;
    // a declaration is a statement (runs only when called); a named function expression (an IIFE, a callback) runs where it stands
    fns.push({ name: m[1], start: b, end, decl: a < 0 || ';{})'.indexOf(blank[a]) !== -1 });
  }
  return fns;
}
// E1-2: every process start (spawnSync / execFileSync / execSync / spawn as code) and every use of a helper that starts one lies inside a heavy
// callback, or inside a helper that does. A function that registers heavy rows is a registrar: its call arguments run inside them. The one structural
// exception is a lambda table consumed only by a `for ... of` loop whose heavy rows are the only users of the lambdas (see tableOk below).
function e1Scan(text) {
  const blank = e1Blank(text);
  const lineNo = (p) => text.slice(0, p).split('\n').length;
  const notDef = (p) => blank.slice(Math.max(0, p - 9), p) !== 'function ';
  const decls = e1Functions(blank).filter((f) => f.decl);
  let m;
  const procs = [];
  const procRe = /\b(?:spawnSync|execFileSync|execSync|spawn)\(/g;
  while ((m = procRe.exec(blank)) !== null) if (notDef(m.index)) procs.push(m.index);
  const regs = [];
  let firstHeavyCall = -1;
  const regRe = /\b(?:heavy|heavyFn)\(/g;
  while ((m = regRe.exec(blank)) !== null) {
    if (!notDef(m.index)) continue;
    const close = e1Match(blank, m.index + m[0].length - 1);
    if (close === -1) continue;
    if (m[0] === 'heavy(' && firstHeavyCall === -1) firstHeavyCall = m.index;
    regs.push([m.index, close]);
  }
  const uses = (name) => {
    const found = [];
    const re = new RegExp('(?<![.\\w$])' + name + '(?![\\w$])', 'g');
    let mm;
    while ((mm = re.exec(blank)) !== null) if (notDef(mm.index)) found.push(mm.index);
    return found;
  };
  const callsOf = (name) => uses(name).filter((p) => /^\s*\(/.test(blank.slice(p + name.length, p + name.length + 4)));
  for (const f of decls.filter((d) => regs.some((r) => r[0] > d.start && r[0] < d.end))) {
    for (const p of callsOf(f.name)) { const close = e1Match(blank, blank.indexOf('(', p + f.name.length)); if (close !== -1) regs.push([p, close]); }
  }
  const inReg = (p) => regs.some((r) => p > r[0] && p < r[1]);
  const inner = (p) => decls.filter((f) => p > f.start && p < f.end).sort((x, y) => (x.end - x.start) - (y.end - y.start))[0];
  const live = decls.filter((f) => uses(f.name).length > 0);
  const deadNames = new Set(decls.filter((f) => live.indexOf(f) === -1).map((f) => f.name));
  const heavyNames = new Set();
  for (let grew = true; grew;) {
    grew = false;
    for (const f of live) {
      if (heavyNames.has(f.name)) continue;
      const inBody = (p) => p > f.start && p < f.end && !inReg(p);
      const direct = procs.some(inBody);
      const via = !direct && Array.from(heavyNames).some((nm) => callsOf(nm).some(inBody));
      if (direct || via) { heavyNames.add(f.name); grew = true; }
    }
  }
  const allFns = e1Functions(blank);
  // A lambda table: `const T = [ ... lambdas ... ];` used exactly once, as the iterable of `for (const [a, b, ...] of T) {`, whose body registers a
  // heavy row, and whose destructured names are used only inside heavy callbacks. Then the lambdas can only run inside a heavy row. Anything
  // else (a second use of T, a destructured name used outside a heavy callback, no heavy registration in the loop) is NOT accepted.
  const tableOk = (p) => {
    const tre = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*\[/g;
    let t;
    while ((t = tre.exec(blank)) !== null) {
      const open = t.index + t[0].length - 1;
      const close = e1Match(blank, open);
      if (close === -1 || !(p > open && p < close)) continue;
      const name = t[1];
      const nameAt = t.index + t[0].indexOf(name, 5);
      const scope = allFns.filter((f) => open > f.start && open < f.end).sort((x, y) => (x.end - x.start) - (y.end - y.start))[0];
      const lo = scope ? scope.start : 0;
      const hi = scope ? scope.end : blank.length;
      const refs = uses(name).filter((q) => q > lo && q < hi && q !== nameAt);
      if (refs.length !== 1) return false;
      const head = /for\s*\(\s*const\s*\[([^\]]*)\]\s+of\s*$/.exec(blank.slice(Math.max(0, refs[0] - 120), refs[0]));
      if (!head || !/^\s*\)\s*\{/.test(blank.slice(refs[0] + name.length))) return false;
      const bodyOpen = blank.indexOf('{', refs[0]);
      const bodyClose = e1Match(blank, bodyOpen);
      if (bodyClose === -1 || !regs.some((r) => r[0] > bodyOpen && r[1] < bodyClose)) return false;
      const bound = head[1].split(',').map((s) => s.trim()).filter(Boolean);
      if (bound.length === 0 || bound.some((n) => !/^[A-Za-z_$][\w$]*$/.test(n))) return false;
      for (const n of bound) for (const q of uses(n)) if (q > bodyOpen && q < bodyClose && !inReg(q)) return false;
      return true;
    }
    return false;
  };
  const okHere = (p) => { if (inReg(p)) return true; const f = inner(p); return (!!f && (heavyNames.has(f.name) || deadNames.has(f.name))) || tableOk(p); };
  const violations = [];
  for (const p of procs) if (!okHere(p)) violations.push('unwrapped heavy code: process start at line ' + lineNo(p));
  for (const nm of heavyNames) for (const p of uses(nm)) if (!okHere(p)) violations.push('unwrapped heavy code: ' + nm + ' used at line ' + lineNo(p));
  return { violations, heavyCallSites: regs.length, processTokens: procs.length, firstHeavyCall, helpers: Array.from(heavyNames).sort() };
}
// E1-1: every require('./...') (transitively, through each declared JS part), every path.join(ROOT, '...') and every __dirname use names a declared part.
function e1Closure(ownText, names) {
  const problems = [];
  const declared = new Set(names);
  const builtin = new Set(require('module').builtinModules);
  const scanOne = (text, fromRel, own) => {
    const blank = e1Blank(text);
    let m;
    const reqRe = /\brequire\(/g;
    while ((m = reqRe.exec(blank)) !== null) {
      const lit = /^\(\s*(['"])([^'"\n]+)\1\s*\)/.exec(text.slice(m.index + 7));
      if (!lit) continue;
      const spec = lit[2];
      if (spec.charAt(0) === '.') {
        let rel = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
        if (!/\.[a-z]+$/.test(rel)) rel += '.js';
        if (!declared.has(rel)) problems.push('undeclared input: require(' + spec + ') -> ' + rel + ' in ' + fromRel);
      } else if (!builtin.has(spec) && !builtin.has(spec.replace(/^node:/, ''))) {
        problems.push('undeclared input: non-builtin require(' + spec + ') in ' + fromRel);
      }
    }
    if (!own) return;
    const joinRe = /\bpath\.join\(\s*ROOT\b/g;
    while ((m = joinRe.exec(blank)) !== null) {
      const open = blank.indexOf('(', m.index);
      const close = e1Match(blank, open);
      if (close === -1) continue;
      const args = /^\(\s*ROOT\s*((?:,\s*(['"])[^'"\n]*\2\s*)+)\)$/.exec(text.slice(open, close + 1));
      if (!args) continue;
      const rel = args[1].split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.slice(1, -1)).join('/');
      if (!declared.has(rel)) problems.push('undeclared input: path.join(ROOT, ...) -> ' + rel);
    }
    const rest = e1Blank(text.replace(/path\.resolve\(__dirname, '\.\.'\)/g, 'ROOT_EXPR'));
    if (/__dirname/.test(rest)) problems.push('undeclared input: a __dirname-relative path');
  };
  scanOne(ownText, E1_OWN_NAME, true);
  for (const p of E1_PARTS) if (/\.js$/.test(p.name) && p.name !== E1_OWN_NAME) scanOne(p.bytes.toString('utf8'), p.name, false);
  return problems;
}
// E1-4 helper: runs the R4 cases through a decision function and returns the cases it gets wrong.
function e1Table(fn) {
  const S = 'a'.repeat(64);
  const S2 = 'c'.repeat(64);
  const E = 'b'.repeat(64);
  const E2 = 'd'.repeat(64);
  const pin = { source: S, environments: [E] };
  const cases = [];
  const add = (label, o, want) => cases.push([label, o, want]);
  add('G1 matching pin', { src: S, env: E, pin, vars: {} }, 'skip');
  add('G2 unproven environment', { src: S, env: E2, pin, vars: {} }, 'replay-notice');
  add('G3 changed source', { src: S2, env: E, pin, vars: {} }, 'replay-fail');
  add('G3 changed source, forced', { src: S2, env: E, pin, vars: { PT_QA_FORCE_HEAVY: '1' } }, 'replay-fail');
  add('G3 changed source, unproven environment', { src: S2, env: E2, pin, vars: {} }, 'replay-fail');
  add('G5 forced', { src: S, env: E, pin, vars: { PT_QA_FORCE_HEAVY: '1' } }, 'forced');
  add('G5 forced, unproven environment', { src: S, env: E2, pin, vars: { PT_QA_FORCE_HEAVY: '1' } }, 'forced');
  for (const v of E1_OVERRIDE_VARS) {
    add('G4 ' + v + ' set', { src: S, env: E, pin, vars: { [v]: 'x' } }, 'override:' + v);
    add('G4 ' + v + ' empty is unset', { src: S, env: E, pin, vars: { [v]: '' } }, 'skip');
    add('G4 ' + v + ' set and forced', { src: S, env: E, pin, vars: { [v]: 'x', PT_QA_FORCE_HEAVY: '1' } }, 'override:' + v);
    add('G4 ' + v + ' set, changed source', { src: S2, env: E, pin, vars: { [v]: 'x' } }, 'override:' + v);
  }
  add('G6 null source', { src: S, env: E, pin: { source: null, environments: [] }, vars: {} }, 'pin-invalid');
  add('G6 empty environments', { src: S, env: E, pin: { source: S, environments: [] }, vars: {} }, 'pin-invalid');
  add('G6 non-hex environment', { src: S, env: E, pin: { source: S, environments: ['z'.repeat(64)] }, vars: {} }, 'pin-invalid');
  add('G6 duplicate environments', { src: S, env: E, pin: { source: S, environments: [E, E] }, vars: {} }, 'pin-invalid');
  add('G6 upper-case hex', { src: S, env: E, pin: { source: 'A'.repeat(64), environments: [E] }, vars: {} }, 'pin-invalid');
  add('G6 short source', { src: S, env: E, pin: { source: 'a'.repeat(63), environments: [E] }, vars: {} }, 'pin-invalid');
  add('G6 environments not an array', { src: S, env: E, pin: { source: S, environments: E }, vars: {} }, 'pin-invalid');
  add('G6 no pin at all', { src: S, env: E, pin: undefined, vars: {} }, 'pin-invalid');
  add('G6 beats force', { src: S, env: E, pin: { source: null, environments: [] }, vars: { PT_QA_FORCE_HEAVY: '1' } }, 'pin-invalid');
  add('G6 beats an override', { src: S, env: E, pin: { source: null, environments: [] }, vars: { NODE_OPTIONS: 'x' } }, 'pin-invalid');
  for (const f of ['true', '0', ' 1', '1 ', '', 'yes']) add('G0 force=' + JSON.stringify(f), { src: S, env: E, pin, vars: { PT_QA_FORCE_HEAVY: f } }, 'invalid-force');
  add('G0 beats an invalid pin', { src: S, env: E, pin: { source: null, environments: [] }, vars: { PT_QA_FORCE_HEAVY: 'true' } }, 'invalid-force');
  const bad = [];
  for (const [label, o, want] of cases) {
    const got = fn(o);
    if (got !== want) bad.push(label + ' -> ' + got + ' (want ' + want + ')');
  }
  return bad;
}
// R7: the verdict, a pure function of the run state -> { failure, line }.
function e1Verdict(st) {
  const s12 = String(st.src).slice(0, 12);
  const e12 = String(st.env).slice(0, 12);
  const gate = st.gate;
  const blocks = false;
  const counts = (replay) => (replay
    ? (blocks ? st.heavyRun + ' heavy block(s) / ' + st.light + ' assertion(s) run' : st.heavyRun + ' heavy + ' + st.light + ' light row(s) run')
    : (blocks ? st.skipped + ' heavy block(s) not run, ' + st.light + ' assertion(s) PASS' : st.skipped + ' heavy row(s) not run, ' + st.light + ' light row(s) PASS'));
  const replayLine = (reason) => '@@QA-SURFACE@@ E1 ' + E1_LABEL + ': REPLAY PASS (' + reason + ') src ' + st.src + ' env ' + st.env + ', ' + counts(true) + ', 0 heavy skipped';
  if (gate === 'invalid-force') return { failure: 'E1 ' + E1_LABEL + ': invalid PT_QA_FORCE_HEAVY (only 1 is accepted)', line: null };
  if (gate === 'pin-invalid') return { failure: 'E1 ' + E1_LABEL + ': pin invalid: source ' + st.src + ' environment ' + st.env, line: null };
  if (gate === 'replay-fail') return { failure: 'E1 ' + E1_LABEL + ': re-pin required: source ' + st.src + ' environment ' + st.env, line: null };
  if (gate === 'skip') {
    if (st.skipped !== st.reached) return { failure: 'E1 ' + E1_LABEL + ': ' + st.skipped + ' heavy unit(s) skipped but ' + st.reached + ' reached', line: null };
    return { failure: null, line: '@@QA-SURFACE@@ E1 ' + E1_LABEL + ': SKIP (contract pinned: ' + s12 + '/' + e12 + ') ' + counts(false) };
  }
  if (st.skipped !== 0) return { failure: 'E1 ' + E1_LABEL + ': ' + st.skipped + ' heavy unit(s) skipped under a replay', line: null };
  if (gate === 'forced') return { failure: null, line: replayLine('forced') };
  if (gate === 'replay-notice') return { failure: null, line: replayLine('environment not proven') };
  if (gate.indexOf('override:') === 0) return { failure: null, line: replayLine('override ' + gate.slice(9)) };
  return { failure: 'E1 ' + E1_LABEL + ': unknown gate ' + gate, line: null };
}
// The verdict is reported by e1Finish(), called once after the last row (the summary section below).
function e1Finish() {
  const v = e1Verdict({ gate: E1_GATE, src: E1_SRC, env: E1_ENV, skipped: e1Skipped, reached: e1Reached, heavyRun: e1HeavyRun, light: passed + failed - e1HeavyRun });
  if (v.failure) { failed += 1; failures.push(v.failure); } else if (failed === 0 && v.line) process.stdout.write(v.line + '\n');
}

e1Row('E1-1 closure: every require, path.join(ROOT, ...) and __dirname-relative path in this suite and in its declared JS parts names a declared part (planted: an added require, an added repo read, a removed part)', () => {
  const names = E1_PART_NAMES.concat([E1_OWN_NAME]);
  e1Assert(new Set(names).size === names.length, 'the parts list has a duplicate');
  const base = e1Closure(E1_OWN_TEXT, names);
  e1Assert(base.length === 0, base.join('; '));
  const added = e1Closure(E1_OWN_TEXT + '\nconst e1Planted = require(\'./lib/e1-planted\');\n', names);
  e1Assert(added.length === 1 && /undeclared input/.test(added[0]), 'an added require was not caught: ' + added.join('; '));
  const read = e1Closure(E1_OWN_TEXT + '\nfs.readFileSync(path.join(ROOT, \'e1-planted.txt\'));\n', names);
  e1Assert(read.length === 1 && /undeclared input/.test(read[0]), 'an added repo read was not caught: ' + read.join('; '));
  const removed = e1Closure(E1_OWN_TEXT, names.filter((n) => n !== E1_PART_NAMES[0]));
  e1Assert(removed.length > 0 && /undeclared input/.test(removed[0]), 'a removed part was not caught');
});
e1Row('E1-2 heavy rule: every process start and fixture-builder call lies inside a heavy callback or a helper whose every call site does (planted: one heavy registration turned back into a plain row)', () => {
  const scan = e1Scan(E1_OWN_TEXT);
  e1Assert(scan.violations.length === 0, scan.violations.join('; '));
  e1Assert(scan.heavyCallSites > 0 && scan.processTokens > 0 && scan.firstHeavyCall > 0, 'the scan found no heavy registration or no process start (a broken scanner)');
  const mutated = E1_OWN_TEXT.slice(0, scan.firstHeavyCall) + 'light' + E1_OWN_TEXT.slice(scan.firstHeavyCall + 5);
  const caught = e1Scan(mutated);
  e1Assert(caught.violations.length > 0 && /unwrapped heavy code/.test(caught.violations[0]), 'an unwrapped heavy registration was not caught');
  // the lambda-table rule, on a synthetic source: accepted only in its exact structure; each planted deviation is rejected (fail closed)
  const syn = [
    'function G(a) { return spawnSync(\'git\', a); }',
    'function heavy(n, f) { f(); }',
    '(function blk() {',
    '  const cases = [[\'x\', (fx) => { G([\'add\']); }]];',
    '  for (const [label, mutate] of cases) {',
    '    heavy(\'row \' + label, () => { mutate(1); });',
    '  }',
    '})();'
  ].join('\n');
  e1Assert(e1Scan(syn).violations.length === 0, 'the lambda-table structure was not accepted: ' + e1Scan(syn).violations.join('; '));
  const planted = [
    ['a second use of the table', syn.replace('})();', '  console.log(cases.length);\n})();')],
    ['an alias of the table', syn.replace('})();', '  const alias = cases;\n})();')],
    ['a destructured name used outside a heavy callback', syn.replace('    heavy(', '    mutate(2);\n    heavy(')],
    ['no heavy registration in the loop', syn.replace('heavy(\'row \'', 'light(\'row \'')],
    ['the lambda called after the loop', syn.replace('})();', '  [].forEach(cases[0][1]);\n})();')],
    ['a table that is not iterated with a destructuring for-of', syn.replace('for (const [label, mutate] of cases) {', 'for (const label of cases) { const mutate = label[1];')]
  ];
  for (const [what, text2] of planted) e1Assert(e1Scan(text2).violations.length > 0, 'the lambda-table rule accepted ' + what);
});
e1Row('E1-3 digest sensitivity: a one-byte change to each part (and to this file outside its pin statement) changes the source digest, a removed part changes it, a change only inside the pin statement does not', () => {
  const names = E1_PARTS.map((p) => p.name);
  for (const needed of E1_PART_NAMES.concat([E1_OWN_NAME])) e1Assert(names.indexOf(needed) !== -1, needed + ' is part of the digest');
  e1Assert(E1_PARTS.length === E1_PART_NAMES.length + 1, 'unexpected part count');
  for (let i = 0; i < E1_PARTS.length; i += 1) {
    const flipped = E1_PARTS.map((p, j) => (j === i ? { name: p.name, bytes: Buffer.concat([p.bytes, Buffer.from(' ')]) } : p));
    e1Assert(FPLIB.digestParts(flipped) !== E1_SRC, 'one byte appended to ' + E1_PARTS[i].name + ' did not change the digest');
  }
  e1Assert(FPLIB.digestParts(E1_PARTS.slice(1)) !== E1_SRC, 'a removed part did not change the digest');
  const pinEdited = E1_OWN_TEXT.replace(/const RESYNC_CONTRACT_PIN = \{[\s\S]*?\n\};/, 'const RESYNC_CONTRACT_PIN = {\n  source: \'' + 'a'.repeat(64) + '\',\n  environments: [\'' + 'b'.repeat(64) + '\']\n};');
  e1Assert(pinEdited !== E1_OWN_TEXT || /source: '[0-9a-f]{64}'/.test(E1_OWN_TEXT), 'the pin statement was not found');
  e1Assert(FPLIB.digestParts(e1Parts(pinEdited)) === E1_SRC, 'a change inside the pin statement changed the digest');
  e1Assert(FPLIB.digestParts(e1Parts(E1_OWN_TEXT + '\n// outside the pin\n')) !== E1_SRC, 'a change outside the pin statement did not change the digest');
});
e1Row('E1-4 decision table: e1Decide returns R4\'s result for G0..G6, every override variable and the force cases (planted: ignore overrides, force skips the G3 failure, skip on an unproven environment, an empty pin treated as valid)', () => {
  e1Assert(e1Table(e1Decide).length === 0, e1Table(e1Decide).join('; '));
  const noOverrides = (o) => e1Decide(Object.assign({}, o, { vars: Object.assign({}, o.vars, { PT_LAND_TOOL_PATH: '', AH_HOOK_PATH: '', AH_SETTINGS_PATH: '', TB_ONLY: '', NODE_OPTIONS: '' }) }));
  const forceSkipsG3 = (o) => ((o.vars || {}).PT_QA_FORCE_HEAVY === '1' && e1PinValid(o.pin) && o.pin.source !== o.src ? 'forced' : e1Decide(o));
  const skipUnproven = (o) => (e1Decide(o) === 'replay-notice' ? 'skip' : e1Decide(o));
  const emptyPinValid = (o) => (!e1PinValid(o.pin) ? e1Decide(Object.assign({}, o, { pin: { source: o.src, environments: [o.env] } })) : e1Decide(o));
  e1Assert(e1Table(noOverrides).length > 0, 'a variant that ignores overrides passed the table');
  e1Assert(e1Table(forceSkipsG3).length > 0, 'a variant that lets force skip the G3 failure passed the table');
  e1Assert(e1Table(skipUnproven).length > 0, 'a variant that skips on an unproven environment passed the table');
  e1Assert(e1Table(emptyPinValid).length > 0, 'a variant that treats an empty pin as valid passed the table');
});
e1Row('E1-5 verdict: the SKIP / REPLAY PASS lines and the fail-closed verdicts have R7\'s shape, k equals the heavy units reached, and the verdict runs after the last heavy registration (planted: a verdict moved before the rows)', () => {
  const st = { src: 'a'.repeat(64), env: 'b'.repeat(64), skipped: 3, reached: 3, heavyRun: 0, light: 5 };
  const s = e1Verdict(Object.assign({ gate: 'skip' }, st));
  e1Assert(s.failure === null && s.line.indexOf('@@QA-SURFACE@@ E1 ' + E1_LABEL + ': SKIP (contract pinned: aaaaaaaaaaaa/bbbbbbbbbbbb) 3 heavy ') === 0, 'SKIP line: ' + s.line);
  e1Assert(e1Verdict(Object.assign({ gate: 'skip' }, st, { reached: 4 })).failure !== null, 'a skip count that differs from the units reached passed');
  const f = e1Verdict(Object.assign({ gate: 'forced' }, st, { skipped: 0, reached: 3, heavyRun: 3 }));
  e1Assert(f.failure === null && f.line.indexOf('REPLAY PASS (forced) src ' + st.src + ' env ' + st.env + ', 3 heavy ') !== -1 && /, 0 heavy skipped$/.test(f.line), 'forced line: ' + f.line);
  e1Assert(e1Verdict(Object.assign({ gate: 'forced' }, st)).failure !== null, 'a replay that skipped heavy units passed');
  e1Assert(/REPLAY PASS \(environment not proven\)/.test(e1Verdict(Object.assign({ gate: 'replay-notice' }, st, { skipped: 0 })).line), 'notice line');
  e1Assert(/REPLAY PASS \(override NODE_OPTIONS\)/.test(e1Verdict(Object.assign({ gate: 'override:NODE_OPTIONS' }, st, { skipped: 0 })).line), 'override line');
  e1Assert(e1Verdict(Object.assign({ gate: 'replay-fail' }, st, { skipped: 0 })).failure === 'E1 ' + E1_LABEL + ': re-pin required: source ' + st.src + ' environment ' + st.env, 're-pin required text');
  e1Assert(e1Verdict(Object.assign({ gate: 'pin-invalid' }, st, { skipped: 0 })).failure === 'E1 ' + E1_LABEL + ': pin invalid: source ' + st.src + ' environment ' + st.env, 'pin invalid text');
  e1Assert(/invalid PT_QA_FORCE_HEAVY/.test(e1Verdict(Object.assign({ gate: 'invalid-force' }, st)).failure), 'invalid force text');
  const own = e1Normalise(E1_OWN_TEXT);
  const blank = e1Blank(own);
  const callAt = blank.lastIndexOf('e1Finish()');
  let lastHeavy = -1;
  const regRe = /\b(?:heavy|heavyFn)\(/g;
  let m;
  while ((m = regRe.exec(blank)) !== null) if (blank.slice(Math.max(0, m.index - 9), m.index) !== 'function ') lastHeavy = m.index;
  e1Assert(callAt > lastHeavy && lastHeavy > 0, 'the verdict call is not after the last heavy registration');
  const firstRow = own.indexOf('\ne1Row(\'E1-1');
  e1Assert(firstRow > 0 && own.indexOf('\ne1Finish();\n', firstRow) > firstRow, 'the verdict call line was not found where expected');
  const early = own.slice(0, firstRow) + '\ne1Finish();\n' + own.slice(firstRow).replace(/\ne1Finish\(\);\n/g, '\n');
  e1Assert(early.split('\ne1Finish();\n').length === 2, 'the planted early verdict was not built (one call line expected)');
  const blankEarly = e1Blank(early);
  const earlyAt = blankEarly.lastIndexOf('e1Finish()');
  let earlyLast = -1;
  while ((m = regRe.exec(blankEarly)) !== null) if (blankEarly.slice(Math.max(0, m.index - 9), m.index) !== 'function ') earlyLast = m.index;
  e1Assert(!(earlyAt > earlyLast), 'a verdict placed before the rows was not caught');
});
// E1 end

// ── RS-1: Mode F, non-overlapping uncommitted work stays byte-identical ───────────────────
heavy('RS-1: Mode F with non-overlapping tracked (unstaged + staged) and untracked changes -> HEAD = branch-dev, work byte-identical, audit line, staging loss reported', () => {
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


// ── RS-2: Mode F overlap -> refused, nothing changed ──────────────────────────────────────
(function rs2() {
  const shapes = [
    ['an unstaged edit of a file the new base changed', (fx) => W(path.join(fx.slotB, 'a.txt'), 'a-local\n')]
  ];
  for (const [label, mutate] of shapes) {
    heavy('RS-2: Mode F with ' + label + ' -> refused "uncommitted work overlaps the new base", nothing changed', () => {
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
heavy('RS-3: Mode R clean replay -> new tip descends from branch-dev, patch-ids equal in order, slot clean, ignored files kept, temp worktree gone', () => {
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

heavy('RS-3b: Mode R where the replay would change the commit set (a task change already on branch-dev) -> refused R4, nothing changed', () => {
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
heavy('RS-4: Mode R conflict -> refused; slot, task ref and branch-dev untouched; temp worktree gone', () => {
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
heavy('RS-4b (R6): a temporary worktree that could not be removed is surfaced on a REFUSAL too, not lost behind the conflict reason', () => {
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

// ── RS-6: PROTECTED-approved tasks stay with the Owner (R-4) ──────────────────────────────

// ── RS-7: already up to date ──────────────────────────────────────────────────────────────

// ── RS-8: refs, approvals and the remote are never touched ────────────────────────────────
heavy('RS-8: after Mode F and Mode R, refs main / branch-dev / origin/* are byte-identical, no approval record, no remote change', () => {
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
heavy('RS-9: a planted git hook is not executed (the tool refuses a hooks directory outright)', () => {
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
heavy('RS-10: a rebase in progress in the slot -> refused S3, nothing changed', () => {
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

// ── RS-11: end to end ─────────────────────────────────────────────────────────────────────
heavy('RS-11: task 1 lands; task 2 land-request refuses Second LAND; resync; land-request + land fast-forward task 2', () => {
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
heavy('RS-12: the printed --base-dev equals the post-resync branch-dev OID and --since equals the resync time (module result, audit line and CLI text)', () => {
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
    heavy('RS-13: ' + label + ' -> refused ' + expectRe.source + ', nothing changed', () => {
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
  refusal('the canonical checkout is dirty', (fx) => { W(path.join(fx.canon, 'untracked.txt'), 'x\n'); }, /S2:/);
})();

// ── planted negatives: each mutates the PRODUCTION tool; the real tool passes the same scenario ──
// The unmutated control of a scenario helper is computed ONCE per run (work/qa-stage2-git-contracts, D); mutants sharing a helper share it.
const REAL_CONTROLS = new Map();
function realControl(scenario) {
  if (!REAL_CONTROLS.has(scenario)) REAL_CONTROLS.set(scenario, scenario(TOOL_PATH));
  return REAL_CONTROLS.get(scenario);
}
function mutantRow(name, replacements, scenario) {
  heavy(name, () => {
    const mutSrc = mutantTool(name, replacements);
    const real = realControl(scenario);
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

mutantRow('MUT-RS-1: reset --keep replaced by --hard -> uncommitted work is overwritten and an overlap is accepted (caught by RS-1 / RS-2)',
  [["['reset', '--keep', oid]", "['reset', '--hard', oid]"]], (src) => {
    const a = modeFWork(src), b = modeFOverlap(src);
    return a === true && b === true ? true : (a !== true ? a : b);
  });
mutantRow('MUT-RS-3: the R4 verification dropped -> a replay that dropped a commit is accepted (caught by RS-3b)',
  [["if (!r4.ok) return refuse('R4', r4.reason, tip, null, dev);", '']], modeRUpstream);
mutantRow('MUT-RS-6: the hooks-clean refusal AND the core.hooksPath override both dropped -> a planted hook runs (caught by RS-9); with only the refusal dropped the override still keeps hooks silent',
  [["if (!hooks.ok) return refuse('S1', hooks.reason);", ''],
    ["const hooksOverride = ['-c', 'core.hooksPath=' + toForwardSlash(hooksDir)];", 'const hooksOverride = [];']], hooksNotRun);
heavy('MUT-RS-6b: with ONLY the hooks-clean refusal dropped the hooksPath override still keeps a planted hook from running', () => {
  const mutSrc = mutantTool('MUT-RS-6b', [["if (!hooks.ok) return refuse('S1', hooks.reason);", '']]);
  assert.strictEqual(hooksNotRun(mutSrc), true);
});
mutantRow('MUT-RS-7: temp worktree removal dropped -> a conflict leaves the worktree and directory behind (caught by RS-4)',
  [["removeTempWorktree(G, canonicalRoot, tmpParent, wt);", '']], modeRConflict);

// ── summary ──────────────────────────────────────────────────────────────────────────────
for (const d of MUT_DIRS) rmrf(d);
meter.report(process.stdout, 'pt-land-resync');
e1Finish();
if (failed > 0) {
  for (const f of failures) process.stdout.write('  FAIL  ' + f + '\n');
  process.stdout.write('\nOFFLINE VALIDATION (pt-land resync): FAIL (' + failed + '/' + (passed + failed) + ')\n');
  process.exit(1);
} else {
  process.stdout.write('  PASS  ' + passed + ' pt-land resync assertion(s) passed\n');
  process.stdout.write('OFFLINE VALIDATION (pt-land resync): PASS (' + passed + '/' + passed + ')\n');
  process.exit(0);
}
