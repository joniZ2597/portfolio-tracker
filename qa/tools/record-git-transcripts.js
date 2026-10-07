#!/usr/bin/env node
'use strict';

/*
 * qa/tools/record-git-transcripts.js - work/qa-stage2-git-contracts/brief.md §3.3 (recorder) and the scenario table behind the moved
 * rows. NOT a suite (qa/tools/ is not discovered). Requiring this module starts no process and writes nothing; only record() /
 * the command line do.
 *
 *   node qa/tools/record-git-transcripts.js [--only id,id,...] [--family name,...] [--out dir]
 *
 * A SCENARIO is one real-Git row of qa/pt_land_offline.js or qa/pt_land_resync_offline.js written as data: the fixture the row builds,
 * the mutation of the fixture the row applies, the one verb call the row makes, and the outcome the row asserts. The recorder runs
 * each scenario against real Git under a recording stand-in for child_process (scoped, like the fake, to the tool copy and its
 * integrity module inside the fixture), normalises the Git calls the tool made (qa/lib/git-transcript.js) and writes them, with the
 * file-system inputs the verb read and the real outcome, to qa/fixtures/git-contract/<family>.json.
 *
 * The same table is read by qa/pt_land_logic_offline.js, qa/pt_land_resync_logic_offline.js (the moved rows, zero processes),
 * qa/git_contract_offline.js (GC-4, contract replay against real Git) and qa/tools/pt_land_dualrun.js (the one-time equivalence run).
 *
 * The fixture builders are taken from the SOURCE TEXT of the two land suites (they are scripts that run their rows when loaded):
 * the function bodies are extracted by brace matching and evaluated with the few free names they use - the same method as
 * qa/fixture_template_offline.js, so a scenario always builds exactly what the suite's own rows build.
 *
 * Outcome checks run on NORMALISED data (paths are role tokens, object ids are <oid:N>), identically for the real run and the
 * logic replay, so one `expect` serves both.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const realCp = require('child_process');
const T = require('../lib/git-transcript');
const FAKE = require('../lib/git-fake');

const ROOT = path.resolve(__dirname, '..', '..');
const TRANSCRIPT_DIR = path.join(ROOT, 'qa', 'fixtures', 'git-contract');
const REAL_TOOL_PATH = path.join(ROOT, '.claude', 'hooks', 'pt-land.js');
const REAL_INTEGRITY_PATH = path.join(ROOT, 'qa', 'guard_integrity_check.js');
const LAND_SUITE = path.join(ROOT, 'qa', 'pt_land_offline.js');
const RESYNC_SUITE = path.join(ROOT, 'qa', 'pt_land_resync_offline.js');
const DEFAULT_LAND_EVIDENCE = 'LAND-EVIDENCE: qa-offline=PASS 52; targeted=PASS; codex-classI-unresolved=0';
const GITIGNORE_TEXT = 'work/*/plan.md\nwork/*/codex.md\nwork/*/qa.log\n';
const NOW = '2026-10-03T12:00:00.000Z';

// ── plumbing (the suites' own helpers, repeated here because the suites are scripts) ──────────
function G(args, cwd) {
  const r = realCp.spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ' in ' + cwd + ' failed: ' + (r.stderr || r.stdout));
  return String(r.stdout);
}
function GR(args, cwd) { return realCp.spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }); }
function W(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
const H = { G, GR, W, rmrf, fs, os, path, crypto, sha256, DEFAULT_LAND_EVIDENCE, GITIGNORE_TEXT, NOW, realCp };

// ── extraction of the suites' builders from source text ──────────────────────────────────────
function extractFunction(src, name) {
  const m = new RegExp('(^|\\n)([ \\t]*)function ' + name + '\\(').exec(src);
  if (!m) throw new Error('function ' + name + ' not found');
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
function harnessRequire() {
  const r = (m) => {
    if (m === './lib/fixture-template') return require('../lib/fixture-template');
    if (m === 'crypto') return crypto;
    if (m === 'fs') return fs;
    if (m === 'os') return os;
    if (m === 'path') return path;
    if (path.isAbsolute(m)) return require(m);
    throw new Error('recorder: unexpected require(' + m + ')');
  };
  r.resolve = require.resolve;
  r.cache = require.cache;
  return r;
}
// The main suite's fixture helpers, taken from its source text. buildFixture is top level; the rest are nested in the suite's IIFEs
// (cleanup, owner-one-action-gates), so they are found by name. The few constants they read are the suite's own literals.
const LAND_HELPER_NAMES = ['buildFixture', 'buildCleanupFixture', 'manifestRoot', 'writeManifest', 'buildProtectedFixture', 'payloadOf',
  'approveProtected', 'buildApprovedLandFixture', 'writeIgnoredEvidence'];
const LAND_CONSTANTS = { DEFAULT_TARGET: '.claude/hooks/sample-hook.js', CAND_V1: 'module.exports = 1; // candidate v1\n', AGENTS_V2: '# AGENTS v2\n', EVIDENCE_NAMES: ['plan.md', 'codex.md', 'qa.log'] };
function landHelperSources() {
  const src = fs.readFileSync(LAND_SUITE, 'utf8').replace(/\r\n/g, '\n');
  return LAND_HELPER_NAMES.map((n) => extractFunction(src, n));
}
let landBuildersCache = null;
function landBuilders() {
  if (landBuildersCache) return landBuildersCache;
  const body = landHelperSources().join('\n') + '\nreturn { ' + LAND_HELPER_NAMES.join(', ') + ' };';
  const make = new Function('G', 'W', 'fs', 'os', 'path', 'crypto', 'assert', 'REAL_TOOL_PATH', 'REAL_INTEGRITY_PATH', 'DEFAULT_LAND_EVIDENCE', 'rmrf', 'GITIGNORE_TEXT',
    'DEFAULT_TARGET', 'CAND_V1', 'AGENTS_V2', 'EVIDENCE_NAMES', 'spawnSync', 'require', body);
  const C = LAND_CONSTANTS;
  landBuildersCache = make(G, W, fs, os, path, crypto, require('assert'), REAL_TOOL_PATH, REAL_INTEGRITY_PATH, DEFAULT_LAND_EVIDENCE, rmrf, GITIGNORE_TEXT,
    C.DEFAULT_TARGET, C.CAND_V1, C.AGENTS_V2, C.EVIDENCE_NAMES, realCp.spawnSync, harnessRequire());
  return landBuildersCache;
}
let resyncBuilderCache = null;
function resyncBuilder() {
  if (resyncBuilderCache) return resyncBuilderCache;
  const src = fs.readFileSync(RESYNC_SUITE, 'utf8').replace(/\r\n/g, '\n');
  const body = extractFunction(src, 'buildFixture') + '\nreturn buildFixture;';
  const rev = (cwd, ref) => G(['rev-parse', ref], cwd).trim();
  const make = new Function('G', 'W', 'rev', 'fs', 'os', 'path', 'crypto', 'TOOL_PATH', 'INTEGRITY_PATH', 'NOW', 'rmrf', 'require', body);
  resyncBuilderCache = make(G, W, rev, fs, os, path, crypto, REAL_TOOL_PATH, REAL_INTEGRITY_PATH, NOW, rmrf, harnessRequire());
  return resyncBuilderCache;
}
Object.defineProperty(H, 'L', { get: landBuilders });
Object.defineProperty(H, 'C', { value: LAND_CONSTANTS });

// ── tool sources (real and mutated) ──────────────────────────────────────────────────────────
function realToolText() { return fs.readFileSync(REAL_TOOL_PATH, 'utf8'); }
function realIntegrityText() { return fs.readFileSync(REAL_INTEGRITY_PATH, 'utf8'); }
// mutation: [[find (string | RegExp), replace]]; each find must change the text, exactly like the suites' withMutantSource.
// once: every string anchor must occur exactly once (the resync suite's own rule).
function mutatedToolText(mutation, once) {
  let s = realToolText();
  for (const [find, replace] of mutation) {
    if (once && typeof find === 'string') {
      const n = s.split(find).length - 1;
      if (n !== 1) throw new Error('mutant anchor found ' + n + ' time(s): ' + find.slice(0, 90));
    }
    const next = s.replace(find, () => replace);
    if (next === s) throw new Error('mutant anchor not found: ' + String(find).slice(0, 90));
    s = next;
  }
  return s;
}

// ── scenario table ───────────────────────────────────────────────────────────────────────────
// Field reference:
//   id, family, suite ('land' | 'resync'), name (the exact name of the real row; several scenarios may share one name - the logic row
//   is built from all of them), build { fn, opts }, mutate ([[find, replace]] applied to the tool source), setup(fx, h), step { fn, opts(fx) },
//   env, expect { ok, exitCode, verb, reason (RegExp | [RegExp]), reasonNot (RegExp), check(res, k) -> [problems] }, allow (oracle allowances),
//   audit (max audit lines the verb may add; default: what the real run added).
const SCENARIOS = [];
function add(s) { SCENARIOS.push(s); return s; }
const fwd = (p) => String(p).replace(/\\/g, '/');
const landRecord = (fx) => 'LAND ' + fx.task + ' ' + fx.tip + ' ' + fx.base + '\n';
const bf = (opts) => ({ fn: 'buildFixture', opts });
const bcf = (opts) => ({ fn: 'buildCleanupFixture', opts });
const bpf = (opts) => ({ fn: 'buildProtectedFixture', opts });
const fromSlot = (fn, extra) => ({ fn, opts: (fx) => Object.assign({ cwd: fx.slotA, task: fx.task }, extra ? extra(fx) : {}) });
const fromCanon = (fn, extra) => ({ fn, opts: (fx) => Object.assign({ cwd: fx.canon, task: fx.task }, extra ? extra(fx) : {}) });
const refuse = (reason, extra) => Object.assign({ ok: false, reason }, extra || {});
function land(id, family, name, build, setup, expect, o) {
  o = o || {};
  return add(Object.assign({ id, family, suite: 'land', name, build, setup, step: o.step || fromSlot('runLand'), expect }, o.more || {}));
}
const urlsOf = (fx) => ({ expectedOriginUrls: [fx.originUrl, fx.originUrl.replace(/\\/g, '/')] });
// PL-15 .. PL-19 share one fixture: record, a real LAND, a push-request, then (PL-16) a real push; the PL-17 rows run AFTER that push.
function landThenPush(fx) {
  fx.writeLandRecord(landRecord(fx));
  const TOOL = fx.requireTool();
  const lr = TOOL.runLand({ cwd: fx.slotA, task: fx.task });
  if (!lr.ok) throw new Error('setup: land must succeed -- ' + JSON.stringify(lr));
  const pr = TOOL.runPushRequest(Object.assign({ cwd: fx.canon }, urlsOf(fx)));
  if (!pr.ok) throw new Error('setup: push-request must succeed -- ' + JSON.stringify(pr));
  fx.writePushRecord('PUSH branch-dev ' + pr.L + ' ' + pr.R + '\n');
  const ps = TOOL.runPush(Object.assign({ cwd: fx.canon }, urlsOf(fx)));
  if (!ps.ok) throw new Error('setup: push must succeed -- ' + JSON.stringify(ps));
  fx.pr = pr;
}
function landOnly(fx) {
  fx.writeLandRecord(landRecord(fx));
  const TOOL = fx.requireTool();
  const lr = TOOL.runLand({ cwd: fx.slotA, task: fx.task });
  if (!lr.ok) throw new Error('setup: land must succeed -- ' + JSON.stringify(lr));
  return TOOL;
}

// ── family pl3: land refusals on the record ("no record" stays real) ──────────────────────────
for (const [slug, label, mutate] of [
  ['malformed', 'malformed record', (fx) => fx.writeLandRecord('not a record\n')],
  ['wrong-task', 'wrong task', (fx) => fx.writeLandRecord('LAND task/other ' + fx.tip + ' ' + fx.base + '\n')],
  ['stale-tip', 'stale tip', (fx) => fx.writeLandRecord('LAND ' + fx.task + ' ' + '0'.repeat(40) + ' ' + fx.base + '\n')],
  ['stale-base', 'stale base', (fx) => fx.writeLandRecord('LAND ' + fx.task + ' ' + fx.tip + ' ' + '0'.repeat(40) + '\n')],
  ['push-in-land', 'a PUSH record in the LAND file', (fx) => fx.writeLandRecord('PUSH branch-dev ' + fx.tip + ' ' + fx.base + '\n')]
]) {
  land('pl3-' + slug, 'pl3', 'PL-3: ' + label + ' -> refuse, nothing merged', bf({ taskShort: 'b' }), mutate, refuse(/L12/));
}

// ── family pl6: merge commit / zero commits ──────────────────────────────────────────────────
add({
  id: 'pl6-zero-commits', family: 'pl6', suite: 'land', name: 'PL-6: zero commits in base..tip -> refuse',
  build: bf({ taskShort: 'e', withSlotA: false }),
  setup(fx, h) {
    h.G(['branch', fx.task, 'branch-dev'], fx.canon);
    fx.zeroSlot = path.join(fx.tmp, 'pt-wt-worker-a');
    h.G(['worktree', 'add', fx.zeroSlot, fx.task], fx.canon);
  },
  step: { fn: 'runLand', opts: (fx) => ({ cwd: fx.zeroSlot, task: fx.task }) },
  expect: refuse(/no commits/)
});

// ── family pl7: canonical / slot state refusals (the tracked-change row stays real) ───────────
land('pl7-canon-untracked', 'pl7', 'PL-7: canonical dirty (untracked file) -> refuse', bf({ taskShort: 'g' }),
  (fx) => fs.writeFileSync(path.join(fx.canon, 'untracked.txt'), 'x\n'), refuse(/L4/));
land('pl7-not-on-branch-dev', 'pl7', 'PL-7: canonical not on branch-dev -> refuse', bf({ taskShort: 'h' }),
  (fx, h) => h.G(['checkout', '-b', 'other-dev'], fx.canon), refuse(/L4/));
land('pl7-slot-dirty', 'pl7', 'PL-7: slot dirty -> refuse', bf({ taskShort: 'i' }),
  (fx) => fs.writeFileSync(path.join(fx.slotA, 'dirty.txt'), 'x\n'), refuse(/L5/));
land('pl7-taskwt-dirty-from-canon', 'pl7', 'PL-7: task worktree dirty, called from the canonical checkout (Bootstrap) -> refuse', bf({ taskShort: 'j' }),
  (fx) => fs.writeFileSync(path.join(fx.slotA, 'dirty-from-canon.txt'), 'x\n'), refuse(/L5/), { step: fromCanon('runLand') });

// ── family pl8: brief refusals ("brief edited by the task" stays real; the first "missing at base" row has no assertion: see row-map) ──
land('pl8-missing-at-base', 'pl8', 'PL-8: brief missing at base -> refuse (legacy brief: Owner LAND)', bf({ taskShort: 'l' }), (fx, h) => {
  h.rmrf(path.join(fx.canon, 'work', fx.taskShort));
  h.G(['add', '-A', 'work'], fx.canon);
  h.G(['commit', '-m', 'remove brief'], fx.canon);
  h.G(['worktree', 'remove', '--force', fx.slotA], fx.canon);
  h.G(['branch', '-D', fx.task], fx.canon);
  h.G(['worktree', 'add', '-b', fx.task, fx.slotA, 'branch-dev'], fx.canon);
  h.W(path.join(fx.slotA, 'work', fx.taskShort, 'foo.txt'), 'impl\n');
  h.W(path.join(fx.slotA, 'work', fx.taskShort, 'review.md'), '# review\n\n' + h.DEFAULT_LAND_EVIDENCE + '\n');
  h.G(['add', 'work/' + fx.taskShort + '/foo.txt', 'work/' + fx.taskShort + '/review.md'], fx.slotA);
  h.G(['commit', '-m', 'impl2'], fx.slotA);
}, refuse(/L6|missing at the base/));
land('pl8-no-land-scope', 'pl8', 'PL-8: no land-scope block -> refuse legacy brief: Owner LAND', bf({ taskShort: 'n', noLandScope: true }), null, refuse(/legacy brief: Owner LAND/));
land('pl8-two-blocks', 'pl8', 'PL-8 (parser unit): two land-scope blocks -> legacy brief refusal', bf({ taskShort: 'n2', twoLandScopeBlocks: true }), null, refuse(/legacy brief: Owner LAND/));

// ── family pl9: diff refusals ("diff outside land-scope" stays real) ──────────────────────────
land('pl9-review-missing', 'pl9', 'PL-9: review.md missing from the diff -> refuse', bf({ taskShort: 'p', landEvidenceLine: null }), (fx, h) => {
  h.rmrf(path.join(fx.slotA, 'work', fx.taskShort, 'review.md'));
  h.G(['add', '-A', 'work'], fx.slotA);
  h.G(['commit', '--amend', '-m', 'impl no review'], fx.slotA);
}, refuse(/L8|does not contain/));
for (const [label, relPath] of [['AGENTS.md', 'AGENTS.md'], ['.claude/hooks/x', '.claude/hooks/x'], ['package.json', 'package.json'], ['work/x/brief.md', 'work/other-task/brief.md']]) {
  land('pl9-protected-' + label.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase(), 'pl9', 'PL-9: diff touching a protected path (' + label + ') -> refuse',
    bf({ taskShort: 'q', scopeRelPaths: ['work/q/foo.txt', relPath] }), (fx, h) => {
      h.W(path.join(fx.slotA, relPath), 'x\n');
      h.G(['add', relPath], fx.slotA);
      h.G(['commit', '-m', 'touch protected'], fx.slotA);
    }, refuse(/protected path|L8/));
}

// ── family pl10: LAND-EVIDENCE refusals ("LAND-EVIDENCE missing" stays real) ──────────────────
land('pl10-classI', 'pl10', 'PL-10: codex-classI-unresolved=1 -> refuse',
  bf({ taskShort: 's', landEvidenceLine: 'LAND-EVIDENCE: qa-offline=PASS 52; targeted=PASS; codex-classI-unresolved=1' }), null, refuse(/L9/));
land('pl10-qa-fail', 'pl10', 'PL-10: qa-offline=FAIL -> refuse',
  bf({ taskShort: 't', landEvidenceLine: 'LAND-EVIDENCE: qa-offline=FAIL 52; targeted=PASS; codex-classI-unresolved=0' }), null, refuse(/L9/));
land('pl10-duplicated', 'pl10', 'PL-10: duplicated LAND-EVIDENCE line -> refuse', bf({ taskShort: 'u', duplicateLandEvidence: true }), null, refuse(/L9|duplicated/));

// ── family pl11: integrity ("a planted non-sample hook" stays real) ───────────────────────────
land('pl11-hookspath', 'pl11', 'PL-11: core.hooksPath configured -> refuse', bf({ taskShort: 'w' }),
  (fx, h) => h.G(['config', 'core.hooksPath', '/tmp/somewhere'], fx.canon), refuse(/L10|integrity/));

// ── family pl13: existing lock ───────────────────────────────────────────────────────────────
land('pl13-lock', 'pl13', 'PL-13: existing lock file -> refuse; lock not removed by the tool', bf({ taskShort: 'z' }), (fx) => {
  fx.writeLandRecord(landRecord(fx));
  fs.writeFileSync(path.join(fx.commonDir, 'pt-land.lock'), '');
}, refuse(/L13|lock/));

// ── family pl17: push with a bad record (the "no record" row stays real). These rows run AFTER PL-16's real push, so P5 refuses first. ──
for (const [slug, label, mutate] of [
  ['stale-record', 'stale record', (fx) => fx.writePushRecord('PUSH branch-dev ' + '0'.repeat(40) + ' ' + '1'.repeat(40) + '\n')],
  ['land-record', 'LAND-type record', (fx) => fx.writePushRecord('LAND ' + fx.task + ' ' + fx.pr.L + ' ' + fx.pr.R + '\n')]
]) {
  land('pl17-' + slug, 'pl17', 'PL-17: push with ' + label + ' -> refuse; origin unchanged', bf({ taskShort: 'ab' }), (fx) => { landThenPush(fx); mutate(fx); },
    { ok: false }, { step: fromCanon('runPush', (fx) => urlsOf(fx)) });
}

// ── family pl18: push preconditions ("remote moved" stays real) ───────────────────────────────
land('pl18-not-ahead', 'pl18', 'PL-18: local not ahead of tracking -> refuse (nothing to push)', bf({ taskShort: 'ad', withSlotA: false }), null,
  refuse(/nothing to push/), { step: fromCanon('runPushRequest', (fx) => ({ expectedOriginUrls: [fx.originUrl] })) });
land('pl18-pushurl', 'pl18', 'PL-18: remote.origin.pushurl set -> refuse', bf({ taskShort: 'ae' }), (fx, h) => {
  landOnly(fx);
  h.G(['config', 'remote.origin.pushurl', 'https://example.invalid/other.git'], fx.canon);
}, refuse(/pushurl/), { step: fromCanon('runPushRequest', (fx) => ({ expectedOriginUrls: [fx.originUrl] })) });
land('pl18-insteadof', 'pl18', 'PL-18: url.*.insteadOf set -> refuse', bf({ taskShort: 'af' }), (fx, h) => {
  landOnly(fx);
  h.G(['config', 'url.https://example.invalid/.insteadOf', 'https://real.invalid/'], fx.canon);
}, refuse(/insteadOf/i), { step: fromCanon('runPushRequest', (fx) => ({ expectedOriginUrls: [fx.originUrl] })) });
land('pl18-url-not-expected', 'pl18', 'PL-18: origin URL not in the expected list -> refuse', bf({ taskShort: 'ag' }), (fx) => { landOnly(fx); },
  refuse(/not in the expected list/), { step: fromCanon('runPushRequest', () => ({ expectedOriginUrls: ['https://not-the-repo.invalid/x.git'] })) });

// ── family cdx: Codex-review regressions ─────────────────────────────────────────────────────
land('cdx2-case-alias', 'cdx', 'CDX-2: protected-path check is case-insensitive (a differently-cased alias is still caught)',
  bf({ taskShort: 'cx2', scopeRelPaths: ['work/cx2/foo.txt', 'PACKAGE.JSON'] }), (fx, h) => {
    h.W(path.join(fx.slotA, 'PACKAGE.JSON'), '{}\n');
    h.G(['add', 'PACKAGE.JSON'], fx.slotA);
    h.G(['commit', '-m', 'case-alias protected path'], fx.slotA);
  }, refuse(/protected path/), { step: fromSlot('runLandRequest') });
land('cdx3-audit-warning', 'cdx', 'CDX-3: an audit-write failure after a verified LAND surfaces as a warning, not a false failure', bf({ taskShort: 'cx3' }), (fx) => {
  fx.writeLandRecord(landRecord(fx));
  fs.mkdirSync(path.join(fx.commonDir, 'pt-land-log'));
}, { ok: true, check: (res) => (/audit log append failed/.test(res.auditWarning || '') ? [] : ['no auditWarning: ' + JSON.stringify(res)]) });
land('cdx4-refusal-reason', 'cdx', 'CDX-4: an audit-write failure on a REFUSAL preserves the original refusal reason (not masked)', bf({ taskShort: 'cx4', noLandScope: true }),
  (fx) => fs.mkdirSync(path.join(fx.commonDir, 'pt-land-log')), refuse(/legacy brief: Owner LAND/, { reasonNot: /INTERNAL/ }));

// ── family mutland: land-tool mutants (each committed into a fresh fixture, so L2 does not trivially kill it) ──
function mutant(id, family, name, build, mutate, setup, expect, o) {
  return add(Object.assign({ id, family, suite: 'land', name, build, mutate, setup, step: (o && o.step) || fromSlot('runLand'), expect }, (o && o.more) || {}));
}
mutant('mut-l12', 'mutland', 'MUT: L12 record check skipped -> land proceeds without any approval record (caught)', bf({ taskShort: 'mu1' }),
  [["  const record = parseRecord(readRecordFile(commonDir, LAND_RECORD_NAME), 'LAND');\r\n  if (!record || record.task !== task || record.tip !== l3.tip || record.base !== l3.base) {\r\n    return refuse('L12', 'no/stale LAND approval', l3.base, l3.tip);\r\n  }\r\n", '']],
  null, { ok: true });
mutant('mut-l3', 'mutland', 'MUT: L3 ancestor check skipped -> Second LAND is not caught (caught)', bf({ taskShort: 'mu2' }),
  [["  const anc = G(['merge-base', '--is-ancestor', base, tip], canonicalRoot, { read: true });\r\n  if (anc.status !== 0) return { ok: false, reason: 'branch-dev moved: Second LAND (Owner rebase, R3m)' };\r\n", '']],
  (fx, h) => {
    h.W(path.join(fx.canon, 'advance.txt'), 'x\n');
    h.G(['add', 'advance.txt'], fx.canon);
    h.G(['commit', '-m', 'advance'], fx.canon);
    fx.writeLandRecord(landRecord(fx));
  }, { check: (res) => ((res.ok === true || !/Second LAND/.test(res.reason || '')) ? [] : ['Second LAND reason still present: ' + JSON.stringify(res)]) });
mutant('mut-scope', 'mutland', 'MUT: scope check dropped (diff allowed unconditionally) -> outside-scope diff is not caught (caught)', bf({ taskShort: 'mu3' }),
  [["  const outside = files.filter((f) => !allowed.has(f));\r\n  if (outside.length) return { ok: false, reason: 'diff outside land-scope: ' + outside.join(', ') };\r\n", '  const outside = [];\r\n']],
  (fx, h) => {
    h.W(path.join(fx.slotA, 'outside.txt'), 'x\n');
    h.G(['add', 'outside.txt'], fx.slotA);
    h.G(['commit', '-m', 'outside'], fx.slotA);
  }, { ok: true }, { step: fromSlot('runLandRequest') });
mutant('mut-protected-list', 'mutland', 'MUT: protected-path list emptied -> a protected-path diff is not caught (caught)', bf({ taskShort: 'mu4', scopeRelPaths: ['work/mu4/foo.txt', 'AGENTS.md'] }),
  [[/const PROTECTED_PATH_RES = \[[\s\S]*?\n\];/, 'const PROTECTED_PATH_RES = [];']],
  (fx, h) => {
    h.W(path.join(fx.slotA, 'AGENTS.md'), 'tampered\n');
    h.G(['add', 'AGENTS.md'], fx.slotA);
    h.G(['commit', '-m', 'touch agents'], fx.slotA);
  }, { ok: true }, { step: fromSlot('runLandRequest') });
mutant('mut-evidence', 'mutland', 'MUT: LAND-EVIDENCE regex loosened -> a malformed evidence line is not caught (caught)',
  bf({ taskShort: 'mu5', landEvidenceLine: 'LAND-EVIDENCE: qa-offline=FAIL 1; targeted=FAIL; codex-classI-unresolved=3' }),
  [['const LAND_EVIDENCE_RE = /^LAND-EVIDENCE: qa-offline=PASS \\d+; targeted=PASS; codex-classI-unresolved=0$/;', 'const LAND_EVIDENCE_RE = /^LAND-EVIDENCE:/;']],
  null, { ok: true }, { step: fromSlot('runLandRequest') });

// ── family cleanup: PL-22..27 refusals and the two decision mutants ───────────────────────────
const archiveRootOf = (fx) => path.join(fx.tmp, 'pt-work-artifacts');
const cleanupStep = (extra) => fromSlot('runCleanup', (fx) => Object.assign({ archiveRoot: archiveRootOf(fx) }, extra || {}));
add({
  id: 'pl23-not-landed', family: 'cleanup', suite: 'land', name: 'PL-23: tip not an ancestor of branch-dev (not landed) -> refuse (K3); nothing changed (+ PL-30)',
  build: bcf({ taskShort: 'cl2', land: false }), step: fromSlot('runCleanup'), expect: refuse([/K3/, /not landed/])
});
add({
  id: 'pl24-not-pushed', family: 'cleanup', suite: 'land', name: 'PL-24: landed but not pushed (local branch-dev ahead of the origin tracking ref) -> refuse (K3) (+ PL-30)',
  build: bcf({ taskShort: 'cl3', push: false }), step: fromSlot('runCleanup'), expect: refuse([/K3/, /not pushed/])
});
add({
  id: 'pl25-untracked', family: 'cleanup', suite: 'land', name: 'PL-25: an untracked, non-ignored file in the task worktree -> refuse (K4); no archive written (+ PL-30)',
  build: bcf({ landed: true }), setup: (fx, h) => { h.L.writeIgnoredEvidence(fx); h.W(path.join(fx.slotA, 'stray.txt'), 'x\n'); },
  step: cleanupStep(), expect: refuse(/K4/)
});
add({
  id: 'pl26-dest-occupied', family: 'cleanup', suite: 'land', name: 'PL-26: archive destination already occupied by a non-directory -> refuse (K6); originals intact, nothing deleted (+ PL-30)',
  build: bcf({ landed: true }), setup: (fx, h) => {
    h.L.writeIgnoredEvidence(fx);
    const archiveDir = path.join(archiveRootOf(fx), fx.taskShort, '20260101T000000Z');
    fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
    h.W(archiveDir, 'occupied\n');
  }, step: cleanupStep({ now: '2026-01-01T00:00:00.000Z' }), expect: refuse([/K6/, /nothing deleted/])
});
add({
  id: 'pl26-dest-file', family: 'cleanup', suite: 'land', name: 'PL-26: one exact destination file already exists (never overwritten) -> refuse (K6); all originals intact, nothing deleted, no partial copy left behind (+ PL-30)',
  build: bcf({ landed: true }), setup: (fx, h) => {
    h.L.writeIgnoredEvidence(fx);
    const archiveDir = path.join(archiveRootOf(fx), fx.taskShort, '20260101T000000Z');
    fs.mkdirSync(archiveDir, { recursive: true });
    h.W(path.join(archiveDir, 'codex.md'), 'pre-existing, must not be overwritten\n');
  }, step: cleanupStep({ now: '2026-01-01T00:00:00.000Z' }), expect: refuse([/K6/, /already exists/])
});
add({
  id: 'pl27-second-cleanup', family: 'cleanup', suite: 'land', name: 'PL-27: a second cleanup of an already-cleaned task -> refuse (branch absent) (+ PL-30)',
  build: bcf({ landed: true }), setup: (fx, h) => {
    h.L.writeIgnoredEvidence(fx);
    const first = fx.requireTool().runCleanup({ cwd: fx.slotA, task: fx.task, archiveRoot: archiveRootOf(fx), now: '2026-01-01T00:00:00.000Z' });
    if (!first.ok) throw new Error('setup: first cleanup must succeed -- ' + JSON.stringify(first));
  }, step: fromCanon('runCleanup', (fx) => ({ archiveRoot: archiveRootOf(fx) })), expect: refuse([/K3/, /does not exist/])
});
mutant('mut-cleanup-k3', 'cleanup', 'MUT: cleanup K3 (landed/pushed ancestry) check skipped -> cleanup proceeds on a landed-but-unpushed task (caught)', bcf({ taskShort: 'mu4', push: false }),
  [["  const devAnc = G(['merge-base', '--is-ancestor', tip, 'refs/heads/branch-dev'], canonicalRoot, { read: true });\r\n  if (devAnc.status !== 0) return refuse('K3', 'not landed (tip is not an ancestor of branch-dev)');\r\n  const originAnc = G(['merge-base', '--is-ancestor', tip, 'refs/remotes/origin/branch-dev'], canonicalRoot, { read: true });\r\n  if (originAnc.status !== 0) return refuse('K3', 'not pushed (tip is not an ancestor of origin/branch-dev)');\r\n", '']],
  null, { ok: true }, { step: fromSlot('runCleanup') });
mutant('mut-cleanup-k4', 'cleanup', 'MUT: cleanup K4 (slot-clean) check skipped -> archives/deletes-original/deletes-branch on a dirty slot before K9 (too late) catches it (caught)', bcf({ taskShort: 'mu5' }),
  [["  if (hadSlot) {\r\n    const st = G(['status', '--porcelain=v2', '--untracked-files=all'], slotTree.path, { read: true });\r\n    if (st.status !== 0) return refuse('K4', 'the task worktree status could not be read');\r\n    if (String(st.stdout).trim()) return refuse('K4', 'slot not clean');\r\n  }\r\n", '']],
  (fx, h) => { h.L.writeIgnoredEvidence(fx); h.W(path.join(fx.slotA, 'stray.txt'), 'x\n'); },
  { ok: false, reason: /K9/ }, { step: cleanupStep({ now: '2026-01-01T00:00:00.000Z' }) });

// ── family g1: brief-request (PL-32, PL-33; "two staged entries" stays real) ──────────────────
const BRIEF_PATH = 'work/g1x/brief.md';
const g1Build = bf({ taskShort: 'oag2', withSlotA: false, withSlotB: false });
const g1Step = (p) => ({ fn: 'runBriefRequest', opts: (fx) => ({ cwd: fx.canon, path: p === undefined ? BRIEF_PATH : p }) });
const g1Brief = (fx, h) => h.W(path.join(fx.canon, 'work', 'g1x', 'brief.md'), '# brief\n');
add({
  id: 'pl32-valid', family: 'g1', suite: 'land', name: 'PL-32: valid brief-request from the canonical checkout -> exact line (sha256 of the staged blob, path, branch-dev OID); nothing written',
  build: bf({ taskShort: 'oag1', withSlotA: false, withSlotB: false }),
  setup: (fx, h) => { h.W(path.join(fx.canon, 'work', 'g1x', 'brief.md'), '# new brief\n\nbody\n'); h.G(['add', 'work/g1x/brief.md'], fx.canon); },
  step: g1Step(),
  expect: {
    ok: true, exitCode: 0, verb: 'brief-request',
    check(res, k) {
      const out = [];
      const want = sha256(Buffer.from('# new brief\n\nbody\n'));
      if (res.sha256 !== want) out.push('sha256 ' + res.sha256 + ' != ' + want);
      if (res.path !== BRIEF_PATH) out.push('path ' + res.path);
      const dev = k.stdoutOf(['rev-parse', 'refs/heads/branch-dev']).trim();
      if (res.oid !== dev) out.push('oid ' + res.oid + ' != branch-dev ' + dev);
      const line = "! printf '%s\\n' '" + want + ' ' + BRIEF_PATH + ' ' + dev + "' > '<canon>/.git/pt-brief-approval'";
      if (res.approvalLine !== line) out.push('approvalLine ' + res.approvalLine);
      return out;
    }
  }
});
for (const [slug, label, mutate, re] of [
  ['am', 'an unstaged change on the staged brief (AM)', (fx, h) => { h.G(['add', BRIEF_PATH], fx.canon); fs.appendFileSync(path.join(fx.canon, 'work', 'g1x', 'brief.md'), 'more\n'); }, /G1: .*(not exactly one entry|not a plain added\/modified file)/],
  ['untracked-extra', 'an untracked extra file', (fx, h) => { h.G(['add', BRIEF_PATH], fx.canon); h.W(path.join(fx.canon, 'zz-extra.txt'), 'x\n'); }, /G1: .*not exactly one entry/],
  ['unstaged', 'the brief only in the working tree (not staged)', () => {}, /G1: .*(not exactly one entry|not a plain added\/modified file)/],
  ['different-brief', 'a different brief staged than requested', (fx, h) => { h.rmrf(path.join(fx.canon, 'work', 'g1x')); h.W(path.join(fx.canon, 'work', 'g1y', 'brief.md'), 'y\n'); h.G(['add', 'work/g1y/brief.md'], fx.canon); }, /G1: .*does not match the requested path/],
  ['not-on-branch-dev', 'not on branch-dev', (fx, h) => { h.G(['add', BRIEF_PATH], fx.canon); h.G(['checkout', '-q', '-b', 'other-dev'], fx.canon); }, /G1: HEAD is not branch-dev/],
  ['hook', 'a non-sample git hook present', (fx, h) => {
    h.G(['add', BRIEF_PATH], fx.canon);
    fs.mkdirSync(path.join(fx.commonDir, 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(fx.commonDir, 'hooks', 'pre-commit'), '#!/bin/sh\nexit 0\n');
  }, /G1: non-sample git hooks are installed/],
  ['hookspath', 'core.hooksPath configured', (fx, h) => { h.G(['add', BRIEF_PATH], fx.canon); h.G(['config', 'core.hooksPath', '/tmp/somewhere'], fx.canon); }, /G1: protected git config is active/]
]) {
  add({
    id: 'pl33-' + slug, family: 'g1', suite: 'land', name: 'PL-33: brief-request with ' + label + ' -> refuse (exit 1); nothing written', build: g1Build,
    setup: (fx, h) => { g1Brief(fx, h); mutate(fx, h); }, step: g1Step(), expect: refuse(re, { exitCode: 1 })
  });
}
add({
  id: 'pl33-git-env', family: 'g1', suite: 'land', name: 'PL-33: brief-request with a GIT_* override in the session environment -> refuse', build: bf({ taskShort: 'oag2b', withSlotA: false, withSlotB: false }),
  setup: (fx, h) => { g1Brief(fx, h); h.G(['add', BRIEF_PATH], fx.canon); }, env: { GIT_DIR: 'x' }, step: g1Step(), expect: refuse(/G1: the session environment sets GIT_DIR/)
});
for (const badPath of ['work/g1x/review.md', 'work/G1X/brief.md', 'work/g1x/sub/brief.md', 'brief.md', 'work/../brief.md', '']) {
  add({
    id: 'pl33-shape-' + (badPath.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'empty').toLowerCase(), family: 'g1', suite: 'land',
    name: 'PL-33: brief-request with a wrong path shape ' + JSON.stringify(badPath) + ' -> usage error (exit 3)', build: bf({ taskShort: 'oag2c', withSlotA: false, withSlotB: false }),
    step: g1Step(badPath), expect: refuse(undefined, { exitCode: 3 })
  });
}
add({
  id: 'pl33-slot-cwd', family: 'g1', suite: 'land', name: 'PL-33: brief-request from a Worker slot cwd -> refuse (canonical checkout only)', build: bf({ taskShort: 'oag2d' }),
  setup: (fx, h) => { g1Brief(fx, h); h.G(['add', BRIEF_PATH], fx.canon); },
  step: { fn: 'runBriefRequest', opts: (fx) => ({ cwd: fx.slotA, path: BRIEF_PATH }) }, expect: refuse(/G1: brief-request runs only from the canonical checkout/)
});
mutant('mut-oag1', 'g1', 'MUT-OAG-1: G1 single-entry check dropped -> a second (untracked) entry is accepted (caught)', bf({ taskShort: 'mo1', withSlotA: false, withSlotB: false }),
  [["  if (lines.length !== 1) return { ok: false, exitCode: 1, reason: 'G1: the staged/working set is not exactly one entry' };\r\n", '']],
  (fx, h) => {
    h.W(path.join(fx.canon, 'work', 'g1m', 'brief.md'), '# m\n');
    h.G(['add', 'work/g1m/brief.md'], fx.canon);
    h.W(path.join(fx.canon, 'zz-extra.txt'), 'x\n');
  }, { ok: true }, { step: { fn: 'runBriefRequest', opts: (fx) => ({ cwd: fx.canon, path: 'work/g1m/brief.md' }) } });
mutant('mut-oag2', 'g1', 'MUT-OAG-2: G1 hooks check dropped -> a planted non-sample hook is accepted (caught)', bf({ taskShort: 'mo2', withSlotA: false, withSlotB: false }),
  [["  const hooks = hooksClean(commonDir);\r\n  if (!hooks.ok) return { ok: false, exitCode: 1, reason: 'G1: ' + hooks.reason };\r\n", '']],
  (fx, h) => {
    h.W(path.join(fx.canon, 'work', 'g1m', 'brief.md'), '# m\n');
    h.G(['add', 'work/g1m/brief.md'], fx.canon);
    fs.mkdirSync(path.join(fx.commonDir, 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(fx.commonDir, 'hooks', 'pre-commit'), '#!/bin/sh\nexit 0\n');
  }, { ok: true }, { step: { fn: 'runBriefRequest', opts: (fx) => ({ cwd: fx.canon, path: 'work/g1m/brief.md' }) } });

// ── family g2: protected-request / protected-commit refusals ──────────────────────────────────
const prot = (fn) => fromSlot(fn);
const approve = (fx, h) => h.L.approveProtected(fx, fx.requireTool());
add({
  id: 'pl36-audit-load-bearing', family: 'g2', suite: 'land',
  name: 'PL-36 (Codex FIX): the ok audit entry is load-bearing - when it cannot be recorded, protected-commit reports failure (exit 1), keeps the record, and the task cannot LAND through the governed path',
  build: bpf({ taskShort: 'oag5b' }), setup: (fx, h) => { approve(fx, h); fs.mkdirSync(path.join(fx.commonDir, 'pt-land-log')); },
  step: prot('runProtectedCommit'), expect: refuse(/^G2: protected-commit made and verified .* but the approval audit entry could not be recorded/, { exitCode: 1 })
});
add({
  id: 'pl38-stale-head', family: 'g2', suite: 'land', name: 'PL-38: stale HEAD (slot advanced after the request) -> protected-commit refuses; nothing changes',
  build: bpf({ taskShort: 'oag7' }), setup: (fx, h) => {
    approve(fx, h);
    h.W(path.join(fx.slotA, 'work', fx.taskShort, 'later.txt'), 'later\n');
    h.G(['add', 'work/' + fx.taskShort + '/later.txt'], fx.slotA);
    h.G(['commit', '-q', '-m', 'later'], fx.slotA);
  }, step: prot('runProtectedCommit'), expect: refuse(/G2: no\/stale PROTECTED approval/, { exitCode: 1 })
});
for (const [slug, label, record] of [
  ['another-task', 'another task', (fx, req) => 'PROTECTED task/other ' + req.head + ' ' + req.tree + '\n'],
  ['another-head', 'another HEAD', (fx, req) => 'PROTECTED ' + fx.task + ' ' + '0'.repeat(40) + ' ' + req.tree + '\n'],
  ['land-record', 'a LAND record in the PROTECTED file', (fx, req) => 'LAND ' + fx.task + ' ' + req.head + ' ' + req.tree + '\n'],
  ['no-record', 'no record', () => null]
]) {
  add({
    id: 'pl39-' + slug, family: 'g2', suite: 'land', name: 'PL-39: protected-commit with ' + label + ' -> refuse; nothing changes', build: bpf({ taskShort: 'oag8' }),
    setup: (fx) => {
      const req = fx.requireTool().runProtectedRequest({ cwd: fx.slotA, task: fx.task });
      if (!req.ok) throw new Error('setup: protected-request must succeed -- ' + JSON.stringify(req));
      const text = record(fx, req);
      if (text !== null) fx.writeProtectedRecord(text);
    }, step: prot('runProtectedCommit'), expect: refuse(/G2: no\/stale PROTECTED approval/, { exitCode: 1 })
  });
}
add({
  id: 'pl40-not-listed', family: 'g2', suite: 'land', name: 'PL-40: a target not listed in the protected-scope block -> protected-request refuses (even though it matches an allowed-target pattern)',
  build: bpf({ taskShort: 'oag9', files: [{ target: '.claude/hooks/other.js', source: 'o.js', content: 'x\n' }] }), step: prot('runProtectedRequest'),
  expect: refuse(/G2: target not approvable \(\.claude\/hooks\/other\.js\)/, { exitCode: 1 })
});
add({
  id: 'pl40-outside-allowed', family: 'g2', suite: 'land', name: 'PL-40: a target listed in protected-scope but outside the allowed-target list (index.html) -> protected-request refuses',
  build: bpf({ taskShort: 'oag9b', extraProtectedScope: ['index.html'], files: [{ target: 'index.html', source: 'i.html', content: 'x\n' }] }), step: prot('runProtectedRequest'),
  expect: refuse(/G2: target not approvable \(index\.html\)/, { exitCode: 1 })
});
for (const never of ['work/x/brief.md', 'CHECKPOINT.md', '.env', '.env.local', '.claude/settings.local.json', '.git/x', '.git/hooks/pre-commit']) {
  add({
    id: 'pl41-' + never.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase(), family: 'g2', suite: 'land',
    name: 'PL-41: never-approvable target ' + JSON.stringify(never) + ' -> protected-request refuses even when the brief lists it',
    build: bpf({ taskShort: 'oag10', extraProtectedScope: [never], files: [{ target: never, source: 'n.txt', content: 'x\n' }] }), step: prot('runProtectedRequest'),
    expect: refuse(/G2: target not approvable/, { exitCode: 1 })
  });
}
const DEFAULT_TARGET = LAND_CONSTANTS.DEFAULT_TARGET;
// A scenario value must never be computed from the environment at module load: the recorder and the dual-run isolate their temp root
// only after this module is loaded, so such a value would carry the REAL temp directory into the transcript, un-tokenised (found by
// GC-4 on 2026-10-07 in pl42-absolute-source). Environment-dependent values are derived from the FIXTURE in `setup`, where every path
// is a role (<fx>, <tmp>, <canon>, ...) and normalises.
const ABSOLUTE_SOURCE_SETUP = (fx, h) => h.W(path.join(fx.manifestDir, 'manifest.json'), JSON.stringify({ files: [{ target: DEFAULT_TARGET, source: path.join(fx.tmp, 'abs.js') }] }));
for (const [slug, label, opts, re, setup] of [
  ['traversal', 'a path-traversal target (../x)', { files: [{ target: '../x', source: 'c.js', content: 'x\n' }] }, /G2: manifest target is not a safe relative path/],
  ['dot-segment', 'a dot-segment target (./a/./b)', { files: [{ target: 'a/./b', source: 'c.js', content: 'x\n' }] }, /G2: manifest target is not a safe relative path/],
  ['absolute-source', 'an absolute source', { files: [{ target: DEFAULT_TARGET, source: 'abs.js', content: undefined }] }, /G2: manifest source is not a flat file name/, ABSOLUTE_SOURCE_SETUP],
  ['dir-source', 'a source with a directory component', { files: [{ target: DEFAULT_TARGET, source: 'sub/c.js', content: undefined }] }, /G2: manifest source is not a flat file name/],
  ['duplicate', 'a duplicate target', { files: [{ target: DEFAULT_TARGET, source: 'a.js', content: 'a\n' }, { target: DEFAULT_TARGET, source: 'b.js', content: 'b\n' }] }, /G2: duplicate manifest target/],
  ['missing-source', 'a missing source file', { files: [{ target: DEFAULT_TARGET, source: 'missing.js', content: undefined }] }, /G2: manifest source does not exist/],
  ['invalid-json', 'invalid JSON', { files: [], rawManifest: '{ not json' }, /G2: manifest\.json is not valid JSON/],
  ['empty-files', 'an empty files list', { files: [], rawManifest: '{"files":[]}' }, /G2: manifest\.json has no files/],
  ['malformed-entry', 'a malformed entry', { files: [], rawManifest: '{"files":[{"target":".claude/hooks/sample-hook.js"}]}' }, /G2: manifest\.json has a malformed entry/],
  ['no-manifest', 'no manifest at all', { manifest: false }, /G2: manifest\.json not found/]
]) {
  add({
    id: 'pl42-' + slug, family: 'g2', suite: 'land', name: 'PL-42: manifest with ' + label + ' -> protected-request refuses; nothing changes',
    build: bpf(Object.assign({ taskShort: 'oag11' }, opts)), setup, step: prot('runProtectedRequest'), expect: refuse(re, { exitCode: 1 })
  });
}
for (const part of ['request', 'commit']) {
  add({
    id: 'pl43-' + part, family: 'g2', suite: 'land', name: 'PL-43: a dirty slot -> protected-request refuses, and protected-commit (approved while clean) refuses; nothing changes',
    build: bpf({ taskShort: 'oag12' }), setup: (fx, h) => { approve(fx, h); h.W(path.join(fx.slotA, 'stray.txt'), 'x\n'); },
    step: prot(part === 'request' ? 'runProtectedRequest' : 'runProtectedCommit'), expect: refuse(/G2: the slot is not clean/)
  });
}
add({
  id: 'pl45-record-reuse', family: 'g2', suite: 'land', name: 'PL-45: record reuse (same record re-written after a successful protected-commit) -> refuse; HEAD unchanged',
  build: bpf({ taskShort: 'oag14' }), setup: (fx, h) => {
    const TOOL = fx.requireTool();
    const req = h.L.approveProtected(fx, TOOL);
    const first = TOOL.runProtectedCommit({ cwd: fx.slotA, task: fx.task });
    if (!first.ok) throw new Error('setup: protected-commit must succeed -- ' + JSON.stringify(first));
    fx.writeProtectedRecord('PROTECTED ' + fx.task + ' ' + fx.tip + ' ' + req.tree + '\n');
  }, step: prot('runProtectedCommit'), expect: refuse(/G2: no\/stale PROTECTED approval/, { exitCode: 1 })
});

// ── family g3: land (L8 revision) and the protected listing ───────────────────────────────────
const L8_NOT_APPROVED = (extra) => new RegExp('^L8: protected path not PROTECTED-approved: Owner LAND \\(AGENTS\\.md' + (extra || '') + '\\)$');
// A build step that is itself a helper call: buildApprovedLandFixture(taskShort, target, content) (protected-request, record, protected-commit).
function approvedBuild(taskShort, target, content) {
  return { fn: 'buildApprovedLandFixture', args: [taskShort, target, content] };
}
add({
  id: 'pl46b-request', family: 'g3', suite: 'land', name: 'PL-46 (brief §8): a PROTECTED-approved .claude/hooks target LANDs end-to-end through the governed path - request, record, protected-commit, land-request (L8 and L10 PASS, protected listing), record, land',
  build: approvedBuild('oag15b', DEFAULT_TARGET, LAND_CONSTANTS.CAND_V1), step: fromSlot('runLandRequest'),
  expect: {
    ok: true,
    check(res) {
      const out = [];
      if (res.report.checks.indexOf('L8 PASS') === -1 || res.report.checks.indexOf('L10 PASS') === -1) out.push('L8/L10 not PASS');
      const pf = res.report.protectedFiles || [];
      if (pf.length !== 1 || pf[0].path !== DEFAULT_TARGET || !/^<oid:\d+>$/.test(pf[0].blob) || !/^<oid:\d+>$/.test(pf[0].tree)) out.push('protectedFiles ' + JSON.stringify(pf));
      return out;
    }
  }
});
add({
  id: 'pl46b-land', family: 'g3', suite: 'land', name: 'PL-46 (brief §8): a PROTECTED-approved .claude/hooks target LANDs end-to-end through the governed path - request, record, protected-commit, land-request (L8 and L10 PASS, protected listing), record, land',
  build: approvedBuild('oag15b', DEFAULT_TARGET, LAND_CONSTANTS.CAND_V1), setup: (fx) => { fx.writeLandRecord('LAND ' + fx.task + ' ' + fx.tip2 + ' ' + fx.base + '\n'); },
  step: fromSlot('runLand'), expect: { ok: true }
});
add({
  id: 'pl48-direct', family: 'g3', suite: 'land', name: 'PL-48: a protected path in both scope blocks but committed directly (no approval entry) -> land-request refuses "not PROTECTED-approved"',
  build: bpf({ taskShort: 'oag17', target: 'AGENTS.md', manifest: false }), setup: (fx, h) => {
    h.W(path.join(fx.slotA, 'AGENTS.md'), LAND_CONSTANTS.AGENTS_V2);
    h.G(['add', 'AGENTS.md'], fx.slotA);
    h.G(['commit', '-q', '-m', 'direct protected edit'], fx.slotA);
  }, step: fromSlot('runLandRequest'), expect: refuse(L8_NOT_APPROVED())
});
add({
  id: 'pl48-not-in-land-scope', family: 'g3', suite: 'land', name: 'PL-48: a protected path in protected-scope but NOT in land-scope -> land-request refuses at L8',
  build: bf({ taskShort: 'oag17b', scopeRelPaths: ['work/oag17b/foo.txt'], protectedScopeRelPaths: ['AGENTS.md'] }), setup: (fx, h) => {
    h.W(path.join(fx.slotA, 'AGENTS.md'), LAND_CONSTANTS.AGENTS_V2);
    h.G(['add', 'AGENTS.md'], fx.slotA);
    h.G(['commit', '-q', '-m', 'protected edit outside land-scope'], fx.slotA);
  }, step: fromSlot('runLandRequest'), expect: refuse(/^L8: /)
});
function rewriteAudit(fx, fn) {
  const p = path.join(fx.commonDir, 'pt-land-log');
  const entries = fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  fs.writeFileSync(p, entries.map(fn).map((e) => JSON.stringify(e)).join('\n') + '\n');
}
add({
  id: 'pl49-other-task', family: 'g3', suite: 'land', name: 'PL-49: the approval entry belongs to another task -> land-request refuses "not PROTECTED-approved"',
  build: approvedBuild('oag18', 'AGENTS.md', LAND_CONSTANTS.AGENTS_V2), setup: (fx) => rewriteAudit(fx, (e) => (e.verb === 'protected-commit' ? Object.assign({}, e, { task: 'task/other' }) : e)),
  step: fromSlot('runLandRequest'), expect: refuse(L8_NOT_APPROVED())
});
add({
  id: 'pl51-tree-differs', family: 'g3', suite: 'land', name: 'PL-51: the approving commit\'s tree differs from the audit entry -> land-request refuses "not PROTECTED-approved"',
  build: approvedBuild('oag20', 'AGENTS.md', LAND_CONSTANTS.AGENTS_V2), setup: (fx) => rewriteAudit(fx, (e) => (e.verb === 'protected-commit' ? Object.assign({}, e, { tree: '0'.repeat(40) }) : e)),
  step: fromSlot('runLandRequest'), expect: refuse(L8_NOT_APPROVED())
});
for (const never of ['work/other/brief.md', 'CHECKPOINT.md', '.env']) {
  add({
    id: 'pl52-' + never.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase(), family: 'g3', suite: 'land',
    name: 'PL-52: ' + never + ' is always refused by land, even with both scope listings and a forged ok approval entry',
    build: bf({ taskShort: 'oag21', scopeRelPaths: ['work/oag21/foo.txt'], landScopeOnlyPaths: [never], protectedScopeRelPaths: [never] }), setup: (fx, h) => {
      h.W(path.join(fx.slotA, never), 'x\n');
      h.G(['add', '-f', never], fx.slotA);
      h.G(['commit', '-q', '-m', 'never-allowed path'], fx.slotA);
      const tip2 = h.G(['rev-parse', 'HEAD'], fx.slotA).trim();
      const forged = { ts: '2026-01-01T00:00:00.000Z', verb: 'protected-commit', task: fx.task, from: fx.tip, to: tip2, tree: h.G(['rev-parse', tip2 + '^{tree}'], fx.slotA).trim(), result: 'ok' };
      fs.writeFileSync(path.join(fx.commonDir, 'pt-land-log'), JSON.stringify(forged) + '\n');
    }, step: fromSlot('runLandRequest'), expect: refuse(new RegExp('^L8: protected path: Owner LAND \\(' + never.replace(/[.\/]/g, '\\$&') + '\\)$'), { reasonNot: /PROTECTED-approved/ })
  });
}
mutant('mut-oag4', 'g3', 'MUT-OAG-4: G2 protected-scope membership dropped from targetApprovable -> an unlisted hooks target is accepted (caught)',
  bpf({ taskShort: 'mo4', files: [{ target: '.claude/hooks/other.js', source: 'o.js', content: 'x\n' }] }),
  [['  return Array.isArray(scopePaths) && scopePaths.indexOf(target) !== -1;\r\n', '  return true;\r\n']], null, { ok: true },
  { step: prot('runProtectedRequest'), more: { allow: ['object-only'] } });
mutant('mut-oag7', 'g3', 'MUT-OAG-7: G3 never-allowed check dropped -> work/*/brief.md with a forged approval entry passes L8 (caught)',
  bf({ taskShort: 'mo7', scopeRelPaths: ['work/mo7/foo.txt'], landScopeOnlyPaths: ['work/other/brief.md'], protectedScopeRelPaths: ['work/other/brief.md'] }),
  [["    if (PROTECTED_NEVER_LAND_RE.test(lower)) return { ok: false, reason: 'protected path: Owner LAND (' + f + ')' };\r\n", '']],
  (fx, h) => {
    h.W(path.join(fx.slotA, 'work', 'other', 'brief.md'), 'x\n');
    h.G(['add', 'work/other/brief.md'], fx.slotA);
    h.G(['commit', '-q', '-m', 'brief path'], fx.slotA);
    const tip2 = h.G(['rev-parse', 'HEAD'], fx.slotA).trim();
    const forged = { ts: '2026-01-01T00:00:00.000Z', verb: 'protected-commit', task: fx.task, from: fx.tip, to: tip2, tree: h.G(['rev-parse', tip2 + '^{tree}'], fx.slotA).trim(), result: 'ok' };
    fs.writeFileSync(path.join(fx.commonDir, 'pt-land-log'), JSON.stringify(forged) + '\n');
  }, { check: (res) => ((/^L8/.test(res.reason || '') || !(res.ok === true || /^L10: integrity FAIL: .*C6 /.test(res.reason))) ? ['unexpected: ' + JSON.stringify(res)] : []) },
  { step: fromSlot('runLandRequest') });
mutant('mut-oag9', 'g2', 'MUT-OAG-9: both slot-clean checks dropped -> a dirty slot is no longer refused (caught); the committed tree is still exactly the approved one, independent of the live index (brief §9)',
  bpf({ taskShort: 'mo9' }), (() => {
    const a = "  if (String(st.stdout).trim()) return { ok: false, exitCode: 1, reason: 'G2: the slot is not clean' };\r\n";
    const b = "    if (stB.status !== 0 || String(stB.stdout).trim() || headB.status !== 0 || String(headB.stdout).trim() !== pre.headOid) {\r\n";
    const b2 = "    if (stB.status !== 0 || headB.status !== 0 || String(headB.stdout).trim() !== pre.headOid) {\r\n";
    return [[a, ''], [b, b2]];
  })(), (fx, h) => {
    approve(fx, h);
    h.W(path.join(fx.slotA, fx.target), 'module.exports = 99; // live-index content\n');
    h.G(['add', fx.target], fx.slotA);
  }, { ok: true }, { step: prot('runProtectedCommit') });

// ── family shape: PL-53, the one fixed shape of every printed approval line (one scenario per verb; the row asserts all four) ──
const SHAPE_NAME = 'PL-53: every printed approval line has the one fixed shape; LAND and PUSH lines are byte-identical to the pre-refactor templates';
const SHAPE_RE = /^! printf '%s\\n' '[^']+' > '[^']+\/pt-(brief|protected|land|push)-approval'$/;
function shapeCheck(kind, payloadOf) {
  return (res) => {
    const out = [];
    const m = SHAPE_RE.exec(String(res.approvalLine));
    if (!m) return ['line shape: ' + res.approvalLine];
    if (m[1] !== kind) out.push(kind + ' line names record kind ' + m[1]);
    // the module-level formatter is the single producer: it must reproduce the printed line exactly
    const TOOL = require(REAL_TOOL_PATH);
    const want = TOOL.approvalLine(kind, payloadOf(res), '<canon>/.git');
    if (res.approvalLine !== want) out.push('the printed line differs from approvalLine(): ' + res.approvalLine + ' vs ' + want);
    return out;
  };
}
add({
  id: 'pl53-land', family: 'shape', suite: 'land', name: SHAPE_NAME, build: bf({ taskShort: 'oag22' }), step: fromSlot('runLandRequest'),
  expect: { ok: true, check: shapeCheck('land', (r) => 'LAND ' + r.report.task + ' ' + r.report.tip + ' ' + r.report.base) }
});
add({
  id: 'pl53-push', family: 'shape', suite: 'land', name: SHAPE_NAME, build: bf({ taskShort: 'oag22' }), setup: (fx) => { landOnly(fx); },
  step: fromCanon('runPushRequest', (fx) => ({ expectedOriginUrls: [fx.originUrl] })),
  expect: { ok: true, check: shapeCheck('push', (r) => 'PUSH branch-dev ' + r.L + ' ' + r.R) }, allow: ['remote-read']
});
add({
  id: 'pl53-brief', family: 'shape', suite: 'land', name: SHAPE_NAME, build: bf({ taskShort: 'oag22' }),
  setup: (fx, h) => { h.W(path.join(fx.canon, 'work', 'shape', 'brief.md'), '# shape\n'); h.G(['add', 'work/shape/brief.md'], fx.canon); },
  step: { fn: 'runBriefRequest', opts: (fx) => ({ cwd: fx.canon, path: 'work/shape/brief.md' }) },
  expect: { ok: true, check: shapeCheck('brief', (r) => r.sha256 + ' ' + r.path + ' ' + r.oid) }
});
add({
  id: 'pl53-protected', family: 'shape', suite: 'land', name: SHAPE_NAME, build: bpf({ taskShort: 'oag23' }), step: fromSlot('runProtectedRequest'),
  expect: { ok: true, check: shapeCheck('protected', (r) => 'PROTECTED ' + r.task + ' ' + r.head + ' ' + r.tree) }, allow: ['object-only']
});

// ═══════════════ the resync suite (qa/pt_land_resync_offline.js) ═════════════════════════════════
const rbf = (opts) => ({ fn: 'buildFixture', opts: opts || {} });
const rstep = (extra) => ({ fn: 'runResync', opts: (fx) => Object.assign({ cwd: fx.canon, task: fx.task2, now: NOW }, extra ? extra(fx) : {}) });
function rs(id, family, name, build, setup, expect, o) {
  return add(Object.assign({ id, family, suite: 'resync', name, build: build || rbf(), setup, step: (o && o.step) || rstep(), expect }, (o && o.more) || {}));
}
const DEV_ONLY = { 'dev-only.txt': 'd\n' };

// ── family rsa: Mode F / R / none decisions ──────────────────────────────────────────────────
rs('rs1b-own-slot', 'rsa', 'RS-1b: Mode F run from the task\'s own slot behaves the same', null, (fx) => {
  fx.advanceDev(DEV_ONLY);
  W(path.join(fx.slotB, 'u1.txt'), 'u1\n');
}, { ok: true, check: (res) => (res.mode === 'F' && res.to === res.base ? [] : ['not Mode F to branch-dev: ' + JSON.stringify(res)]) }, { step: { fn: 'runResync', opts: (fx) => ({ cwd: fx.slotB, task: fx.task2, now: NOW }) } });
for (const [slug, label, mutate] of [
  ['staged', 'a staged edit of a file the new base changed', (fx) => { W(path.join(fx.slotB, 'a.txt'), 'a-staged\n'); G(['add', 'a.txt'], fx.slotB); }],
  ['untracked', 'an untracked file where the new base adds a tracked file', (fx) => W(path.join(fx.slotB, 'new.txt'), 'mine\n')],
  ['identical', 'a local edit identical to the new base content', (fx) => W(path.join(fx.slotB, 'a.txt'), 'a-dev\n')]
]) {
  rs('rs2-' + slug, 'rsa', 'RS-2: Mode F with ' + label + ' -> refused "uncommitted work overlaps the new base", nothing changed', null, (fx) => {
    fx.advanceDev({ 'a.txt': 'a-dev\n', 'new.txt': 'new-dev\n' });
    mutate(fx);
  }, refuse(/F2: uncommitted work overlaps the new base/, { exitCode: 1, check: (res, k) => ((k.audit.length && k.audit[k.audit.length - 1].result === 'refuse' && k.audit[k.audit.length - 1].mode === 'F') ? [] : ['the last audit line is not a Mode F refusal']) }),
  { more: { allow: ['failed-mutating'] } });
}
for (const [slug, label, mutate] of [
  ['tracked', 'a tracked edit', (fx) => W(path.join(fx.slotB, 'b.txt'), 'b-local\n')],
  ['untracked', 'an untracked file', (fx) => W(path.join(fx.slotB, 'untracked.txt'), 'u\n')]
]) {
  rs('rs5-' + slug, 'rsa', 'RS-5: Mode R with a dirty slot (' + label + ') -> refused R1, nothing changed', null, (fx) => {
    fx.commitIn(fx.slotB, { 'work/two/foo.txt': 'foo\n' });
    fx.advanceDev(DEV_ONLY);
    mutate(fx);
  }, refuse(/R1: the slot is not clean/, { exitCode: undefined }));
}
rs('rs6-protected-path', 'rsa', 'RS-6: a task commit touching a protected path -> refused R2, nothing changed', null, (fx) => {
  fx.commitIn(fx.slotB, { 'AGENTS.md': 'protected change\n' }, 'task touches AGENTS.md');
  fx.advanceDev(DEV_ONLY);
}, refuse(/R2: a task commit touches a protected path \(AGENTS\.md\)/));
rs('rs6-audit-entry', 'rsa', 'RS-6: a protected-commit audit entry for the task -> refused R2, nothing changed', null, (fx) => {
  fx.commitIn(fx.slotB, { 'work/two/foo.txt': 'foo\n' });
  fx.advanceDev(DEV_ONLY);
  fs.appendFileSync(path.join(fx.commonDir, 'pt-land-log'), JSON.stringify({ ts: NOW, verb: 'protected-commit', task: 'task/two', from: fx.base, to: fx.base, tree: fx.base, result: 'ok' }) + '\n');
}, refuse(/R2: .*protected-commit/));
rs('rs7-up-to-date', 'rsa', 'RS-7: branch-dev already an ancestor of the task tip -> "already up to date", exit 0, nothing changed (no audit line)', null,
  (fx) => { fx.commitIn(fx.slotB, { 'work/two/foo.txt': 'foo\n' }); },
  { ok: true, exitCode: 0, check: (res, k) => [].concat(res.mode === 'none' ? [] : ['mode ' + res.mode], /already up to date/.test(res.message) ? [] : ['message ' + res.message], k.audit.length === 0 ? [] : ['an audit line was written']) });

// ── family rs10: operation in progress / lock held ("a rebase in progress" stays real) ────────
for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD']) {
  rs('rs10-' + marker.toLowerCase().replace(/_/g, '-'), 'rs10', 'RS-10: a merge or cherry-pick in progress in the slot -> refused S3', null, (fx) => {
    fx.advanceDev(DEV_ONLY);
    const gp = G(['rev-parse', '--git-path', marker], fx.slotB).trim();
    fs.writeFileSync(path.resolve(fx.slotB, gp), fx.base + '\n');
  }, refuse(/S3: .*in progress/));
}
rs('rs10-lock', 'rs10', 'RS-10: the tool lock held -> refused, the lock file is left untouched, nothing changed', null, (fx) => {
  fx.advanceDev(DEV_ONLY);
  fs.writeFileSync(path.join(fx.commonDir, 'pt-land.lock'), 'held');
}, refuse(/S3: .*lock/));

// ── family rs13: S-preconditions ("the canonical checkout is dirty" stays real) ──────────────
function rs13(slug, label, source, setup, expectRe, callOpts, build) {
  return rs('rs13-' + slug, 'rs13', 'RS-13: ' + label + ' -> refused ' + source + ', nothing changed', build, (fx) => {
    fx.advanceDev(DEV_ONLY);
    fx.rsExtra = (setup && setup(fx)) || {};
  }, refuse(expectRe), { step: { fn: 'runResync', opts: (fx) => Object.assign({ cwd: fx.canon, task: fx.task2, now: NOW }, callOpts || {}, fx.rsExtra) } });
}
for (const key of ['GIT_DIR', 'GIT_CONFIG_COUNT']) {
  rs('rs13-env-' + key.toLowerCase().replace(/_/g, '-'), 'rs13', 'RS-13: session environment ' + key + ' set -> refused S1, nothing changed', null,
    (fx) => fx.advanceDev(DEV_ONLY), refuse(/S1:/), { more: { env: { [key]: 'x' } } });
}
rs13('hookspath', 'core.hooksPath configured', 'S1: protected git config', (fx) => { G(['config', 'core.hooksPath', fwd(path.join(fx.tmp, 'h'))], fx.canon); }, /S1: protected git config/);
rs13('self-integrity', 'the running tool differs from the branch-dev blob', 'S1: self-integrity', (fx) => {
  fs.appendFileSync(path.join(fx.canon, '.claude', 'hooks', 'pt-land.js'), '\n// tampered\n');
}, /S1: self-integrity/);
rs13('not-on-branch-dev', 'the canonical checkout is not on branch-dev', 'S2:', (fx) => { G(['checkout', '-b', 'other-dev'], fx.canon); }, /S2:/);
rs13('no-branch', 'the task branch does not exist', 'S3:', () => ({ task: 'task/nope' }), /S3:/);
rs13('no-slot', 'the task branch is checked out in no slot', 'S3: .*slot', (fx) => {
  G(['branch', 'task/three', 'branch-dev'], fx.canon);
  return { task: 'task/three' };
}, /S3: .*slot/);
rs13('not-worker-slot', 'the task branch is checked out in a worktree that is not a Worker slot', 'S3: .*slot', (fx) => {
  G(['worktree', 'add', '-b', 'task/four', path.join(fx.tmp, 'some-other-tree'), 'branch-dev'], fx.canon);
  return { task: 'task/four' };
}, /S3: .*slot/);
rs13('other-slot', 'called from the other Worker\'s slot (cwd slot is on a different task)', 'S1: .*task\\/two', (fx) => ({ cwd: fx.slotA }), /S1: .*task\/two/);
rs('rs13-brief-missing', 'rs13', 'RS-13: work/<id>/brief.md missing at branch-dev (Worker slot available) -> refused S4', rbf({ briefs: ['one'] }),
  (fx) => fx.advanceDev(DEV_ONLY), refuse(/S4:/));
['branch-dev', 'task/', 'task/x y', '', undefined].forEach((bad, i) => {
  rs('rs13-badname-' + (i + 1), 'rs13', 'RS-13: a malformed task name is a usage error (exit 3), nothing touched', null, null, refuse(undefined, { exitCode: 3 }),
    { step: { fn: 'runResync', opts: (fx) => ({ cwd: fx.canon, task: bad }) } });
});

// ── family mutrs: resync decision mutants. Each has an UNMUTATED control (computed once per helper) and the mutant. ──
// The real rows assert real === invariant-holds and mutant !== invariant-holds; here each side is its own scenario.
const AUDIT_OK_ANCHOR = "appendAudit(commonDir, { ts: resyncTime, verb: 'resync', task, mode, from: tip, to: newTip, base: dev, result: 'ok', reason: null });";
const INVARIANTS = {
  protectedPath: { build: null, setup: (fx) => { fx.commitIn(fx.slotB, { 'AGENTS.md': 'x\n' }); fx.advanceDev(DEV_ONLY); }, inv: (res) => (res.ok ? 'protected-path task replayed' : true) },
  auditProtected: {
    build: null,
    setup: (fx) => {
      fx.commitIn(fx.slotB, { 'work/two/foo.txt': 'foo\n' });
      fx.advanceDev(DEV_ONLY);
      fs.appendFileSync(path.join(fx.commonDir, 'pt-land-log'), JSON.stringify({ ts: NOW, verb: 'protected-commit', task: 'task/two', from: fx.base, to: fx.base, tree: fx.base, result: 'ok' }) + '\n');
    },
    inv: (res) => (res.ok ? 'PROTECTED-approved task replayed' : true)
  },
  dirty: {
    build: null,
    setup: (fx) => { fx.commitIn(fx.slotB, { 'work/two/foo.txt': 'foo\n' }); fx.advanceDev(DEV_ONLY); W(path.join(fx.slotB, 'b.txt'), 'b-local\n'); },
    inv: (res) => (res.ok ? 'dirty slot accepted' : (/R5/.test(res.reason) ? 'refused only after the task ref moved: ' + res.reason : true))
  },
  none: {
    build: null,
    setup: (fx) => { fx.commitIn(fx.slotB, { 'work/two/foo.txt': 'foo\n' }); },
    inv: (res, k) => (res.ok && res.mode === 'none' && k.audit.length === 0 ? true : 'not a no-op')
  },
  lockHeld: { build: null, setup: (fx) => { fx.advanceDev(DEV_ONLY); fs.writeFileSync(path.join(fx.commonDir, 'pt-land.lock'), 'held'); }, inv: (res) => (res.ok ? 'ran while the lock was held' : true) },
  briefMissing: { build: rbf({ briefs: ['one'] }), setup: (fx) => { fx.advanceDev(DEV_ONLY); }, inv: (res) => (res.ok ? 'ran without a brief at branch-dev' : true) },
  canonDirty: { build: null, setup: (fx) => { fx.advanceDev(DEV_ONLY); W(path.join(fx.canon, 'untracked.txt'), 'x\n'); }, inv: (res) => (res.ok ? 'ran with a dirty canonical checkout' : true) },
  selfTampered: {
    build: null,
    setup: (fx) => { fx.advanceDev(DEV_ONLY); fs.appendFileSync(path.join(fx.canon, '.claude', 'hooks', 'pt-land.js'), '\n// tampered\n'); },
    inv: (res) => (/S1: self-integrity/.test(res.reason || '') ? true : 'self-integrity not enforced')
  },
  refsAndApprovals: {
    build: null,
    setup: (fx) => { fx.advanceDev(DEV_ONLY); },
    inv: (res, k) => {
      if (!res.ok) return 'refused: ' + res.reason;
      if (k.commonFiles.some((n) => /^pt-.*-approval$/.test(n))) return 'an approval record was written';
      if (k.argvs.some((a) => a[0] === 'update-ref' && a.indexOf('refs/heads/branch-dev') !== -1)) return 'branch-dev moved';
      return true;
    }
  }
};
const controlsDone = new Set();
function mutRs(id, name, helper, mutate, once) {
  const h = INVARIANTS[helper];
  if (!controlsDone.has(helper)) {
    controlsDone.add(helper);
    rs('ctl-' + helper, 'mutrs', 'control (unmutated tool): ' + helper, h.build, h.setup,
      { check: (res, k) => { const v = h.inv(res, k); return v === true ? [] : ['the unmutated tool violates the invariant: ' + v]; } }, { more: { control: true } });
  }
  return rs(id, 'mutrs', name, h.build, h.setup, { check: (res, k) => (h.inv(res, k) === true ? ['the mutant was not caught (the invariant holds)'] : []) }, { more: { mutate, helper } });
}
mutRs('mut-rs2', 'MUT-RS-2: the protected-path check dropped -> a task touching AGENTS.md is replayed (caught by RS-6)', 'protectedPath',
  [["if (protectedHit !== undefined) return refuse('R2', 'a task commit touches a protected path (' + protectedHit + ')', tip, null, dev);", '']]);
mutRs('mut-rs2b', 'MUT-RS-2b: the protected-commit audit check dropped -> a PROTECTED-approved task is replayed (caught by RS-6)', 'auditProtected',
  [["if (hasProtectedCommit) return refuse('R2', 'the audit log has a protected-commit entry for this task', tip, null, dev);", '']]);
mutRs('mut-rs4', 'MUT-RS-4: the R1 clean-slot check dropped -> a dirty slot is replayed (caught by RS-5)', 'dirty',
  [["if (String(stR1.stdout).trim()) return refuse('R1', 'the slot is not clean', tip, null, dev);", '']]);
mutRs('mut-rs5', 'MUT-RS-5: the up-to-date short-circuit dropped -> a current task is replayed and audited (caught by RS-7)', 'none',
  [["if (upToDate.status === 0) return { ok: true, exitCode: 0, verb: 'resync', mode: 'none', task, from: tip, to: tip, base: dev, message: 'already up to date: ' + task + ' contains branch-dev ' + dev };", '']]);
mutRs('mut-rs8', 'MUT-RS-8: the lock check dropped -> the tool runs while the lock is held (caught by RS-10)', 'lockHeld',
  [["if (!lock.ok) return refuse('S3', lock.reason, tip, null, dev);", '']]);
mutRs('mut-rs9', 'MUT-RS-9: the brief-at-branch-dev check dropped -> a task without a brief is re-synced (caught by RS-13)', 'briefMissing',
  [["if (briefAtDev.status !== 0) return refuse('S4', 'work/<id>/brief.md is missing at branch-dev', tip, null, dev);", '']]);
mutRs('mut-rs10', 'MUT-RS-10: the canonical-clean check dropped -> a dirty canonical checkout is accepted (caught by RS-13)', 'canonDirty',
  [["if (!s2.ok) return refuse('S2', s2.reason, null, null, null);", '']]);
mutRs('mut-rs11', 'MUT-RS-11: the self-integrity check dropped -> a modified tool still runs (caught by RS-13)', 'selfTampered',
  [["if (!si.ok) return refuse('S1', si.reason);", '']]);
mutRs('mut-rs12', 'MUT-RS-12: an approval record written after a successful resync (caught by RS-8)', 'refsAndApprovals',
  [[AUDIT_OK_ANCHOR, AUDIT_OK_ANCHOR + "\n    fs.writeFileSync(path.join(commonDir, 'pt-land-approval'), 'x\\n');"]]);
mutRs('mut-rs13', 'MUT-RS-13: branch-dev moved by a successful resync (caught by RS-8)', 'refsAndApprovals',
  [[AUDIT_OK_ANCHOR, AUDIT_OK_ANCHOR + "\n    G(['update-ref', 'refs/heads/branch-dev', tip], canonicalRoot);"]]);

// ── outcome check (the row's own assertion, applied to the real and to the logic result; both are NORMALISED) ──
function checkExpect(expect, res, k) {
  const problems = [];
  if (expect.ok !== undefined && res.ok !== expect.ok) problems.push('ok ' + res.ok + ' != ' + expect.ok);
  if (expect.exitCode !== undefined && res.exitCode !== expect.exitCode) problems.push('exitCode ' + res.exitCode + ' != ' + expect.exitCode);
  if (expect.verb !== undefined && res.verb !== expect.verb) problems.push('verb ' + res.verb + ' != ' + expect.verb);
  const reasons = expect.reason === undefined ? [] : [].concat(expect.reason);
  for (const re of reasons) if (!re.test(String(res.reason))) problems.push('reason ' + JSON.stringify(res.reason) + ' !~ ' + re);
  if (expect.reasonNot && expect.reasonNot.test(String(res.reason))) problems.push('reason ' + JSON.stringify(res.reason) + ' ~ ' + expect.reasonNot);
  if (expect.check) for (const p of expect.check(res, k || { stdoutOf: () => '' })) problems.push(p);
  return problems;
}
// What a check may consult (all NORMALISED, identical for the real run and the logic replay):
//   k.stdoutOf(['rev-parse', 'x'])  stdout of the first call whose argv starts with that prefix
//   k.argvs                         every Git call's argv, in order
//   k.commonFiles                   the pt-* entries of the common dir after the verb ran
//   k.audit                         the parsed lines of the audit log after the verb ran
function checkContext(calls, after) {
  return {
    stdoutOf(prefix) {
      const c = calls.find((x) => prefix.every((p, i) => x.argv[i] === p));
      if (!c) throw new Error('checkContext: no call starting with ' + JSON.stringify(prefix));
      return c.stdout;
    },
    argvs: calls.map((c) => c.argv),
    commonFiles: (after && after.commonFiles) || [],
    audit: (after && after.audit) || []
  };
}
// After-the-run facts of a real fixture (the logic side computes the same from its skeleton in qa/lib/git-fake.js runLogic).
function afterFacts(fx) {
  const gitDir = path.join(fx.canon, '.git');
  const commonFiles = fs.readdirSync(gitDir).filter((n) => /^pt-/.test(n)).sort();
  const log = path.join(gitDir, 'pt-land-log');
  const audit = fs.existsSync(log) && fs.lstatSync(log).isFile() ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { commonFiles, audit };
}

// ── recording ────────────────────────────────────────────────────────────────────────────────
function fsSpec(fx) {
  const gitDir = path.join(fx.canon, '.git');
  const spec = [{
    dir: gitDir,
    include: (rel) => /^pt-[^/]*$/.test(rel) || /^hooks(\/|$)/.test(rel) || (/^worktrees(\/|$)/.test(rel) && !/(^|\/)index$/.test(rel) && !/\/logs(\/|$)/.test(rel))
  }];
  for (const slot of [fx.slotA, fx.slotB]) if (slot) spec.push({ dir: path.join(slot, 'work'), include: () => true });
  spec.push({ dir: path.join(fx.tmp, 'pt-work-artifacts'), include: () => true });
  if (fx.manifestDir) spec.push({ dir: path.dirname(fx.manifestDir), include: () => true });
  // Untracked, non-ignored files of a slot outside work/ (resync hashes them: uncommittedSnapshot reads each one).
  for (const slot of [fx.slotA, fx.slotB]) {
    if (!slot || !fs.existsSync(slot)) continue;
    const u = GR(['ls-files', '--others', '--exclude-standard', '-z'], slot);
    for (const rel of String(u.stdout).split('\0').filter(Boolean)) if (!/^work\//.test(rel)) spec.push({ file: path.join(slot, rel) });
  }
  return spec;
}
// The state a refusal must leave alone, as plain data (refs, HEADs, status, config, worktrees, every file outside .git, pt-* files).
function realState(fx) {
  const out = {};
  const refs = (cwd) => GR(['for-each-ref', '--format=%(refname) %(objectname)'], cwd).stdout.split('\n').filter(Boolean).sort();
  out.refs = refs(fx.canon);
  out.bareRefs = fs.existsSync(fx.bareDir) ? refs(fx.bareDir) : null;
  const head = (cwd) => { const s = GR(['symbolic-ref', '-q', 'HEAD'], cwd); return s.status === 0 ? String(s.stdout).trim() : 'DETACHED ' + String(GR(['rev-parse', 'HEAD'], cwd).stdout).trim(); };
  const status = (cwd) => String(GR(['status', '--porcelain=v2', '--untracked-files=all'], cwd).stdout);
  const places = [['canon', fx.canon], ['slotA', fx.slotA], ['slotB', fx.slotB], ['zero', fx.zeroSlot]];
  for (const [k, p] of places) {
    if (p && fs.existsSync(p)) { out['head:' + k] = head(p); out['status:' + k] = status(p); }
  }
  out.config = String(GR(['config', '--list', '--null'], fx.canon).stdout);
  out.worktrees = String(GR(['worktree', 'list', '--porcelain'], fx.canon).stdout);
  const files = {};
  const walk = (dir, rel, skipGit) => {
    for (const n of fs.readdirSync(dir).sort()) {
      if (skipGit && n === '.git') continue;
      const abs = path.join(dir, n);
      const r = rel ? rel + '/' + n : n;
      const st = fs.lstatSync(abs);
      if (st.isDirectory()) walk(abs, r, skipGit); else if (st.isFile()) files[r] = sha256(fs.readFileSync(abs));
    }
  };
  for (const [k, p] of places) if (p && fs.existsSync(p)) walk(p, k, true);
  const gitDir = path.join(fx.canon, '.git');
  for (const n of fs.readdirSync(gitDir).sort()) {
    if (/^pt-/.test(n) && n !== 'pt-land-log') {
      const abs = path.join(gitDir, n);
      files['.git/' + n] = fs.lstatSync(abs).isFile() ? sha256(fs.readFileSync(abs)) : 'DIR';
    }
  }
  const hooks = path.join(gitDir, 'hooks');
  if (fs.existsSync(hooks)) for (const n of fs.readdirSync(hooks).sort()) files['.git/hooks/' + n] = sha256(fs.readFileSync(path.join(hooks, n)));
  const art = path.join(fx.tmp, 'pt-work-artifacts');
  if (fs.existsSync(art)) walk(art, 'artifacts', false);
  if (fx.manifestDir && fs.existsSync(path.dirname(fx.manifestDir))) walk(path.dirname(fx.manifestDir), 'manifest', false);
  out.files = files;
  const log = path.join(gitDir, 'pt-land-log');
  out.auditLines = fs.existsSync(log) && fs.lstatSync(log).isFile() ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).length : 0;
  return out;
}
function stateDiff(a, b) {
  const diffs = [];
  for (const k of Object.keys(a)) {
    if (k === 'auditLines') continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diffs.push(k);
  }
  return diffs;
}

function buildFixtureFor(scn, toolSourcePath) {
  if (scn.suite === 'resync') {
    const o = Object.assign({}, scn.build.opts || {});
    if (toolSourcePath) o.toolSource = toolSourcePath;
    return resyncBuilder()(o);
  }
  const L = landBuilders();
  if (scn.build.fn === 'buildApprovedLandFixture') {
    if (toolSourcePath) throw new Error('buildApprovedLandFixture has no toolSource option');
    return L.buildApprovedLandFixture.apply(null, scn.build.args);
  }
  const opts = Object.assign({}, scn.build.opts || {});
  if (toolSourcePath) opts.toolSource = toolSourcePath;
  return L[scn.build.fn](opts);
}

// Runs one scenario against real Git; returns { entry, real } where entry is the transcript scenario record.
function recordScenario(scn) {
  let toolFile = null;
  let tmpToolDir = null;
  if (scn.mutate) {
    tmpToolDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptrec-mut-'));
    toolFile = path.join(tmpToolDir, 'pt-land.js');
    fs.writeFileSync(toolFile, mutatedToolText(scn.mutate, scn.suite === 'resync'));
  }
  const fx = buildFixtureFor(scn, toolFile);
  try {
    if (scn.setup) scn.setup(fx, H);
    // The slot roles exist even when a fixture has no slot there (a scenario may create one at the conventional place).
    const ctx = T.makeContext({
      canon: fx.canon, slotA: fx.slotA || path.join(fx.tmp, 'pt-wt-worker-a'), slotB: fx.slotB || path.join(fx.tmp, 'pt-wt-worker-b'),
      bare: fx.bareDir, fx: fx.tmp, tmp: os.tmpdir()
    });
    // Everything is captured RAW while the scenario runs and normalised afterwards in one pass (see git-transcript.js prescan).
    const stepOpts = scn.step.opts(fx);
    const fsRaw = T.captureFs(fsSpec(fx), ctx, null);
    const before = realState(fx);
    const rawCalls = [];
    const recorder = Object.assign({}, realCp, {
      spawnSync(file, args, opts) {
        const r = realCp.spawnSync.apply(realCp, arguments);
        rawCalls.push({ file, args: (args || []).slice(), opts: { cwd: opts && opts.cwd, input: opts && opts.input, encoding: opts && opts.encoding }, result: { status: r.status, stdout: r.stdout, stderr: r.stderr } });
        return r;
      }
    });
    const saved = {};
    for (const k of Object.keys(scn.env || {})) { saved[k] = process.env[k]; process.env[k] = scn.env[k]; }
    let res;
    const remove = FAKE.installLoadHook(fx.tmp, () => recorder);
    try {
      // The integrity module copy is cached by require; a setup step that already ran a verb would leave a copy bound to the REAL
      // child_process, and its Git calls would be missing from the transcript. A fresh load inside the hook records them.
      const integrityCopy = path.join(fx.canon, 'qa', 'guard_integrity_check.js');
      if (fs.existsSync(integrityCopy)) delete require.cache[require.resolve(integrityCopy)];
      const tool = fx.requireTool();
      res = tool[scn.step.fn](stepOpts);
    } finally {
      remove();
      for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    }
    const after = realState(fx);
    const diffs = stateDiff(before, after);
    const afterRaw = afterFacts(fx);
    // one pass: register every object id of the scenario, then normalise everything with that complete knowledge
    const state = T.newState(0);
    T.prescan([fsRaw, stepOpts, rawCalls.map((c) => [c.args, c.opts.cwd, c.opts.input, c.result.stdout, c.result.stderr]), res, afterRaw.audit], ctx, state);
    const fsEntries = T.normalizeValue(fsRaw, ctx, state);
    const sink = rawCalls.map((c) => T.normalizeCall(c.file, c.args, c.opts, c.result, ctx, state));
    const normResult = T.normalizeValue(res, ctx, state);
    const problems = checkExpect(scn.expect, normResult, checkContext(sink, { commonFiles: afterRaw.commonFiles, audit: T.normalizeValue(afterRaw.audit, ctx, state) }));
    if (problems.length) throw new Error('scenario ' + scn.id + ': the real outcome does not satisfy the row\'s assertion: ' + problems.join('; ') + ' -- ' + JSON.stringify(res));
    const invocation = {
      fn: scn.step.fn,
      opts: T.normalizeValue(stepOpts, ctx, state),
      calls: sink,
      result: normResult,
      audit: after.auditLines - before.auditLines,
      realUnchanged: diffs.length === 0,
      realChanged: diffs
    };
    const entry = { row: scn.name, tool: scn.mutate ? 'mutant' : 'real', env: scn.env || {}, fs: fsEntries, invocations: [invocation] };
    return { entry, real: { result: res, unchanged: diffs.length === 0, changed: diffs } };
  } finally {
    try { fx.cleanup(); } catch (e) { /* best effort */ }
    if (tmpToolDir) rmrf(tmpToolDir);
  }
}

// ── families on disk ─────────────────────────────────────────────────────────────────────────
// Identical call lists across scenarios are stored once (pools keyed by sha256); the scenario refers to its pool.
function familyFile(family) { return path.join(TRANSCRIPT_DIR, family + '.json'); }
function buildFamilyDocument(family, recorded) {
  const doc = { version: 1, family, pools: {}, scenarios: {} };
  for (const { id, entry } of recorded) {
    const inv = entry.invocations[0];
    const key = sha256(JSON.stringify(inv.calls)).slice(0, 16);
    doc.pools[key] = inv.calls;
    const copy = JSON.parse(JSON.stringify(entry));
    delete copy.invocations[0].calls;
    copy.invocations[0].pool = key;
    doc.scenarios[id] = copy;
  }
  return doc;
}
function loadFamily(family) {
  return T.load(familyFile(family));
}
function loadAll() {
  const out = {};
  if (!fs.existsSync(TRANSCRIPT_DIR)) return out;
  for (const f of fs.readdirSync(TRANSCRIPT_DIR).filter((n) => /\.json$/.test(n)).sort()) out[f.replace(/\.json$/, '')] = T.load(path.join(TRANSCRIPT_DIR, f));
  return out;
}

// ── logic replay (shared by the two logic suites and the dual-run) ───────────────────────────
// Rows of one suite, in table order: [{ name, parts: [scenario...] }]. A mutant row also carries its unmutated control (replayed first).
function logicRows(suite) {
  const m = new Map();
  for (const s of SCENARIOS) {
    if (s.suite !== suite || s.control) continue;
    if (!m.has(s.name)) m.set(s.name, []);
    if (s.helper) {
      const ctl = SCENARIOS.find((c) => c.id === 'ctl-' + s.helper);
      if (!ctl) throw new Error('control scenario missing for ' + s.id);
      m.get(s.name).push(ctl);
    }
    m.get(s.name).push(s);
  }
  return Array.from(m, ([name, parts]) => ({ name, parts }));
}
// Replays one scenario's stored transcript under the strict fake (no process) and compares with what the real run recorded.
function replayScenario(scn, families, baseDir) {
  const doc = families[scn.family];
  if (!doc || !doc.scenarios[scn.id]) throw new Error('no recorded transcript for ' + scn.id + ' (run qa/tools/record-git-transcripts.js)');
  const entry = doc.scenarios[scn.id];
  return replayEntry(scn, entry, doc.pools, baseDir);
}
function replayEntry(scn, entry, pools, baseDir) {
  const inv = entry.invocations[0];
  const toolText = scn.mutate ? mutatedToolText(scn.mutate, scn.suite === 'resync') : realToolText();
  const out = FAKE.runLogic(entry, pools, { baseDir, toolText, integrityText: realIntegrityText(), allow: scn.allow });
  const problems = [];
  if (!T.sameValue(out.result, inv.result)) problems.push('the outcome differs from the recorded real outcome: ' + JSON.stringify(out.result) + ' vs ' + JSON.stringify(inv.result));
  for (const p of checkExpect(scn.expect, out.result, checkContext(out.calls, out.after))) problems.push(p);
  // A MUTANT row is judged by its invariant (checkExpect above), not by "nothing changed": a mutant may perform mutating calls whose net
  // effect on the real repository is nil (e.g. a replay onto an identical base), which the conservative oracle still reports as a change.
  if (!scn.mutate && out.oracle.ok !== inv.realUnchanged) problems.push('the oracle says ' + (out.oracle.ok ? 'unchanged' : 'changed') + ' (' + out.oracle.reasons.join(' | ') + ') but the real run was ' + (inv.realUnchanged ? 'unchanged' : 'changed (' + inv.realChanged.join(',') + ')'));
  return { problems, out, inv };
}

function record(o) {
  o = o || {};
  const only = o.only ? new Set(o.only) : null;
  const families = o.family ? new Set(o.family) : null;
  let picked = SCENARIOS.filter((s) => (!only || only.has(s.id)) && (!families || families.has(s.family)));
  if (o.resume) {
    // keep what is already recorded: only scenarios without a stored transcript are run
    const have = loadAll();
    picked = picked.filter((s) => !(have[s.family] && have[s.family].scenarios[s.id]));
  }
  record.remainingBefore = picked.length;
  if (o.limit) picked = picked.slice(0, o.limit); // a bounded batch; a rerun with --resume continues where it stopped
  const failed = [];
  let done = 0;
  for (const scn of picked) {
    const t0 = Date.now();
    let rec;
    try { rec = recordScenario(scn); } catch (e) {
      failed.push(scn.id + ': ' + String(e && e.message ? e.message : e).split('\n')[0].slice(0, 600));
      if (o.log) o.log('FAILED ' + scn.id + ': ' + failed[failed.length - 1]);
      continue;
    }
    // saved at once: a later failure must not lose what is already recorded
    saveScenario(scn.family, scn.id, rec.entry, o);
    done += 1;
    if (o.log) o.log('recorded ' + scn.id + ' (' + (Date.now() - t0) + ' ms, ' + rec.entry.invocations[0].calls.length + ' calls, real unchanged=' + rec.real.unchanged + ')');
  }
  record.failed = failed;
  return done;
}
// Merges one scenario into its family file (the other scenarios of the family are kept).
function saveScenario(family, id, entry, o) {
  const file = o && o.out ? path.join(o.out, family + '.json') : familyFile(family);
  const existing = fs.existsSync(file) ? T.load(file) : null;
  const all = [];
  if (existing) {
    for (const eid of Object.keys(existing.scenarios)) {
      if (eid === id) continue;
      const sc = JSON.parse(JSON.stringify(existing.scenarios[eid]));
      const inv = sc.invocations[0];
      inv.calls = existing.pools[inv.pool];
      delete inv.pool;
      all.push({ id: eid, entry: sc });
    }
  }
  all.push({ id, entry });
  T.save(file, buildFamilyDocument(family, all.sort((a, b) => (a.id < b.id ? -1 : 1))));
}

module.exports = {
  SCENARIOS, H, G, GR, W, rmrf, landBuilders, resyncBuilder, extractFunction, realToolText, realIntegrityText, mutatedToolText, checkExpect, checkContext,
  logicRows, replayScenario, replayEntry,
  recordScenario, record, saveScenario, loadFamily, loadAll, buildFamilyDocument, TRANSCRIPT_DIR, REAL_TOOL_PATH, REAL_INTEGRITY_PATH, LAND_SUITE, RESYNC_SUITE, landRecord,
  landHelperSources
};

if (require.main === module) {
  require('../lib/run-tmp').isolate('ptqa-rec-');
  const args = process.argv.slice(2);
  const o = { log: (m) => process.stdout.write(m + '\n') };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--only') o.only = args[++i].split(',');
    else if (args[i] === '--family') o.family = args[++i].split(',');
    else if (args[i] === '--out') o.out = path.resolve(args[++i]);
    else if (args[i] === '--resume') o.resume = true;
    else if (args[i] === '--limit') o.limit = Number(args[++i]);
    else { process.stderr.write('record-git-transcripts: unknown argument ' + args[i] + '\n'); process.exit(3); }
  }
  const n = record(o);
  process.stdout.write('record-git-transcripts: ' + n + ' scenario(s) recorded, ' + record.failed.length + ' failed, ' + Math.max(0, record.remainingBefore - n - record.failed.length) + ' remaining\n');
  for (const m of record.failed) process.stdout.write('  FAILED ' + m + '\n');
  process.exit(record.failed.length ? 1 : 0);
}
