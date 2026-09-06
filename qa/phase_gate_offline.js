'use strict';

/*
 * qa/phase_gate_offline.js
 *
 * WU-PHG / PHG-IMPL — regression suite for the two B6.2 phase-gate.js defects.
 *
 *   PG-1  harnessModeOf read mode names without reading entry-vs-exit, so a notice announcing an
 *         EXIT read as an ENTRY. The plan-mode notice carries lowercase "exited plan mode" and matched
 *         /(^|[^A-Za-z])plan([^A-Za-z]|$)/ -> unmapped-harness-mode; the auto-mode notice carries
 *         "exited auto mode" and matched /(^|[^A-Za-z])auto([^A-Za-z]|$)/i -> AUTO, re-firing
 *         main-never-auto.
 *   PG-2  --ladder returned at runCli before resolveScope, so validateClaimDir() was never called on
 *         the ladder path while --scope enforced it. Same bad value: --scope exit 3, --ladder exit 0.
 *
 * Both are exercised through the REAL surfaces — the exported harnessModeOf and the real command-line
 * entry point spawned as a child process, exactly as main() runs it — never a reimplementation.
 *
 * SIGNAL LITERALS — provenance is deliberate and bounded (owner ruling 2026-09-06):
 *   OBSERVED (.ai-reports/handoffs/2026-08-23_ep-pilot-main-closeout.MAIN.md:89,283):
 *     "exited plan mode", "exited auto mode"            — the two real exit notices (the defect)
 *     "While auto mode is active"                       — the real entry notice
 *   OBSERVED (qa/arc_worker_handshake_offline.js:284-289,402):
 *     "auto", "acceptEdits", "manual", "plan", "dontAsk", "bypassPermissions",
 *     "Auto Mode notice: entering auto mode", "", "NOT MACHINE-VERIFIABLE"
 *   SYNTHETIC, owner-approved 2026-09-06, each authorized ONLY to exercise a published
 *   closeCondition clause that no observed notice covers. Neither is evidence that the harness
 *   has ever emitted this exact text:
 *     "auto mode completed"                     — the closeCondition's COMPLETION clause
 *     "entering manual mode; entering auto mode" — the closeCondition's multi-name fail-closed
 *                                                  clause; composed from entry wording and mapped
 *                                                  mode names already in use, not a new cue
 *   No other exit or completion variant is asserted: "exiting plan mode", "plan mode exit" and
 *   "completion of auto mode" were considered and REFUSED as unevidenced inventions.
 *
 * The two kinds of claim-directory assertion are deliberately SEPARATE:
 *   - function level: validateClaimDir('') -> 'claim-dir missing', asserted as a DIRECT CALL ONLY.
 *   - command-line level: four structural classes, each exiting 3 through the real --ladder flag with
 *     the identical message --scope already produces for a value of that class.
 * This suite never asserts that --ladder REJECTS an empty value through the command line. It asserts
 * the opposite and true fact: runCli substitutes its non-empty default for an empty value on the
 * ladder, scope and phase paths alike, so an empty value is unreachable through any CLI entry point.
 *
 * Pure Node, no network, no browser. Every temp tree lives under os.tmpdir() and is removed in
 * `finally`. The live runtime is hashed before/after and never written.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REL = {
  gate: '.claude/skills/arc-worker/scripts/phase-gate.js',
  lib: '.claude/skills/arc-publish-plan/scripts/lib/profile-contract.js',
  libDir: '.claude/skills/arc-publish-plan/references/execution-profiles',
  runtime: '.git/arc-runtime'
};
const abs = (p) => path.join(ROOT, p);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const clone = (o) => JSON.parse(JSON.stringify(o));

// ── harness ──────────────────────────────────────────────────────────────────
let total = 0, failed = 0;
const failures = [];
function check(name, cond) { total += 1; if (!cond) { failed += 1; failures.push(name); console.log('  FAIL  ' + name); } }
function section(title) { console.log('== ' + title + ' =='); }

const tempDirs = [];
function tmp(label) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-' + label + '-')); tempDirs.push(d); return d; }
function cleanup() { for (const d of tempDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* best effort */ } } }

function treeHash(dir) {
  const entries = [];
  (function walk(d, rel) {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = rel ? rel + '/' + e.name : e.name;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { entries.push('D ' + r); walk(full, r); } else entries.push('F ' + r + ' ' + sha256(fs.readFileSync(full)));
    }
  })(dir, '');
  return sha256(entries.join('\n'));
}

let lib = null, gate = null, library = null;
try { lib = require(abs(REL.lib)); } catch (e) { console.log('  (B1 library not loadable: ' + e.message.split('\n')[0] + ')'); }
try { gate = require(abs(REL.gate)); } catch (e) { console.log('  (phase-gate.js not loadable: ' + e.message.split('\n')[0] + ')'); }
if (lib) { try { library = lib.loadLibrary(abs(REL.libDir)); } catch (e) { console.log('  (library not loadable: ' + e.message.split('\n')[0] + ')'); } }

// ── fixture: a resolved snapshot carrying a MAIN row, built through the B1 library ───
const MUTEX_REGISTRY = ['AUTHORITY:published-plan', 'CODE:index-html', 'CODE:netlify-functions', 'DEPLOY:netlify', 'EXTERNAL:live-provider', 'QA:browser-runtime', 'RUNTIME:gates', 'RUNTIME:owner-profile'];
const TASK = 'PG-MAIN';
const ROWS = [
  { id: TASK, priority: 10, lane: 'MAIN', entryMode: 'PLAN', requiresOwnerGo: true, mutexes: ['CODE:index-html'], dependsOn: [], executionProfile: 'MAIN-CODE-SLICE', closeCondition: 'The fixture row exists so the gate has a MAIN task to bind.', stopCondition: 'Stop immediately on any write outside the fixture tree.' }
];
function mkProposed() {
  return {
    planId: 'fixture-pg-r1',
    source: '.ai-reports/handoffs/2026-09-06_fixture-pg.COWORK.md',
    sourceHash: sha256('fixture-pg-source'),
    repoRef: '0f76af936683e13ee00033939b0ecd3b47f5b48f',
    generatedAt: '2026-09-06T00:00:00Z',
    mutexRegistry: MUTEX_REGISTRY.slice(),
    tasks: clone(ROWS)
  };
}
function resolved() { return JSON.parse(lib.resolveProfiles(mkProposed(), library).text); }
function writePlan(root, plan) {
  const dir = path.join(root, 'plans', plan.planId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'plan.json');
  fs.writeFileSync(file, JSON.stringify(plan, null, 2) + '\n');
  return file;
}
function runGate(args, cwd) {
  const r = spawnSync(process.execPath, [abs(REL.gate)].concat(args), { encoding: 'utf8', cwd: cwd || ROOT });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', out: (r.stdout || '') + (r.stderr || '') };
}
// The PHASE-GATE head line carries the absolute snapshot path, which varies per run; the ladder
// block below it is the rendering this task must leave byte-identical.
function ladderBody(stdout) { return String(stdout).split('\n').slice(1).join('\n'); }

// Byte-for-byte pin of the ACCEPTED-input ladder rendering, derived read-only from phase-gate.js
// BEFORE the PG-2 fix (owner-approved 2026-09-06). PG-2 changes only the refusal path, so this hash
// must survive the fix unchanged; a fix that altered accepted-input rendering, or that rejected a
// valid claim directory, breaks this assert.
const GOLDEN_LADDER_BODY_SHA = '6b41cc22e2439e4472a975950e673efba8d100a6c4fe40f4016de135be3e8c61';

console.log('phase-gate.js B6.2 regression (WU-PHG / PHG-IMPL)');
const liveRuntime = abs(REL.runtime);
const liveBefore = fs.existsSync(liveRuntime) ? treeHash(liveRuntime) : null;

try {
  check('phase-gate.js loads and exports harnessModeOf / validateClaimDir / runCli',
    !!gate && typeof gate.harnessModeOf === 'function' && typeof gate.validateClaimDir === 'function' && typeof gate.runCli === 'function');
  check('B1 library and profile library loadable (fixtures buildable)', !!lib && !!library);

  if (!gate || !lib || !library) {
    check('PG-1..PG-2 executable (phase-gate.js + B1 library + profile library loadable)', false);
  } else {
    const rt = tmp('rt');
    fs.mkdirSync(path.join(rt, 'plans'), { recursive: true });
    const plan = resolved();
    const planFile = writePlan(rt, plan);
    const wt = tmp('wt');
    const cwdScratch = tmp('cwd');
    const binding = gate.bindProfile(plan, TASK);
    check('fixture binds MAIN-CODE-SLICE (W-V10 verified from the embedded bytes)', binding.status === 'bound' && binding.id === 'MAIN-CODE-SLICE');
    const openPhase = binding.profile.phases.find((p) => p.entryGate !== 'AUTHORIZED_JSON');
    check('fixture profile exposes a phase whose entry gate is not AUTHORIZED_JSON', !!openPhase);

    // ══ PG-1 · an EXIT notice is not an ENTRY (both literals OBSERVED) ═════════════════
    section('PG-1 harnessModeOf entry-vs-exit (the two observed harness notices)');
    check('PG-1 harnessModeOf("exited plan mode") -> null (an exit notice is not a current unmapped mode)',
      gate.harnessModeOf('exited plan mode') === null);
    check('PG-1 harnessModeOf("exited auto mode") -> null (an exit notice does not map to AUTO)',
      gate.harnessModeOf('exited auto mode') === null);
    // SYNTHETIC literal, owner-approved: exercises the closeCondition's COMPLETION clause, which no
    // observed harness notice covers. Not evidence that the harness emits this exact text.
    check('PG-1 harnessModeOf("auto mode completed") -> null (a completion notice does not map to AUTO) [SYNTHETIC literal]',
      gate.harnessModeOf('auto mode completed') === null);
    // SYNTHETIC composition, owner-approved: the observed exit literal followed by approved entry
    // wording for a DIFFERENT mode. Proves suppression is per occurrence — suppressing one
    // exit-oriented occurrence must not hide a genuine entry-oriented one elsewhere (fail-closed).
    check('PG-1 an exit for one mode does not hide a genuine entry for another -> mapped AUTO [SYNTHETIC composition]',
      (gate.harnessModeOf('exited plan mode and entering auto mode') || {}).mapped === 'AUTO');

    section('PG-1 the exit notice no longer drives a decide() refusal');
    const dAutoExit = gate.decide({ lane: 'MAIN', phase: openPhase, lastAck: 'MANUAL', answered: true, harnessMode: gate.harnessModeOf('exited auto mode') });
    check('PG-1 decide(MAIN, harness "exited auto mode") does not re-fire main-never-auto',
      !/main-never-auto/.test(String(dAutoExit.reason)));
    const dPlanExit = gate.decide({ lane: 'MAIN', phase: openPhase, lastAck: 'MANUAL', answered: true, harnessMode: gate.harnessModeOf('exited plan mode') });
    check('PG-1 decide(MAIN, harness "exited plan mode") does not report unmapped-harness-mode',
      !/unmapped-harness-mode/.test(String(dPlanExit.reason)));

    section('PG-1 the same two notices through the real command-line entry point');
    const cliAutoExit = runGate(['--plan', planFile, '--task', TASK, '--phase', openPhase.id, '--last-ack', 'MANUAL', '--answered', '--harness-signal', 'exited auto mode', '--worktree-path', wt], cwdScratch);
    check('PG-1 CLI --harness-signal "exited auto mode" does not stop with main-never-auto',
      !/main-never-auto/.test(cliAutoExit.out));
    const cliPlanExit = runGate(['--plan', planFile, '--task', TASK, '--phase', openPhase.id, '--last-ack', 'MANUAL', '--answered', '--harness-signal', 'exited plan mode', '--worktree-path', wt], cwdScratch);
    check('PG-1 CLI --harness-signal "exited plan mode" does not stop with unmapped-harness-mode',
      !/unmapped-harness-mode/.test(cliPlanExit.out));

    // ══ PG-1 preserved — every case the file's own EP-C5 tests already cover ═══════════
    section('PG-1 preserved: entry signals, no-signal, unmapped entries, fail-closed ordering');
    check('PG-1 preserved harnessModeOf("auto") -> mapped AUTO',
      JSON.stringify(gate.harnessModeOf('auto')) === JSON.stringify({ mapped: 'AUTO', raw: 'auto' }));
    check('PG-1 preserved harnessModeOf("acceptEdits") -> mapped ACCEPT_EDITS', (gate.harnessModeOf('acceptEdits') || {}).mapped === 'ACCEPT_EDITS');
    check('PG-1 preserved harnessModeOf("manual") -> mapped MANUAL', (gate.harnessModeOf('manual') || {}).mapped === 'MANUAL');
    check('PG-1 preserved harnessModeOf("Auto Mode notice: entering auto mode") -> mapped AUTO (observed entry notice)',
      (gate.harnessModeOf('Auto Mode notice: entering auto mode') || {}).mapped === 'AUTO');
    check('PG-1 preserved harnessModeOf("While auto mode is active") -> mapped AUTO (observed entry notice)',
      (gate.harnessModeOf('While auto mode is active') || {}).mapped === 'AUTO');
    for (const u of ['plan', 'dontAsk', 'bypassPermissions']) {
      check('PG-1 preserved harnessModeOf("' + u + '") -> unmapped ' + u + ' (a genuine currently-unmapped entry signal)',
        (gate.harnessModeOf(u) || {}).unmapped === u);
    }
    check('PG-1 preserved harnessModeOf("") / "NOT MACHINE-VERIFIABLE" / non-string -> null (no mode signal at all)',
      gate.harnessModeOf('') === null && gate.harnessModeOf('NOT MACHINE-VERIFIABLE') === null && gate.harnessModeOf(null) === null);
    // SYNTHETIC composition, owner-approved: entry wording and mapped mode names already in use,
    // combined to exercise the closeCondition's most-automated-wins clause. Not a new harness cue.
    check('PG-1 preserved fail-closed: two entry-oriented mapped names in one text -> the most automated wins [SYNTHETIC composition]',
      (gate.harnessModeOf('entering manual mode; entering auto mode') || {}).mapped === 'AUTO');

    // ══ PG-2 · function level — the EMPTY value, direct call ONLY ═════════════════════
    section('PG-2 validateClaimDir, function level (direct call only — never through the CLI)');
    check('PG-2 validateClaimDir("", TASK) -> "claim-dir missing" (direct function call)',
      gate.validateClaimDir('', TASK) === 'claim-dir missing');
    check('PG-2 validateClaimDir(undefined, TASK) -> "claim-dir missing" (direct function call)',
      gate.validateClaimDir(undefined, TASK) === 'claim-dir missing');
    // NOT an assertion that --ladder rejects an empty value: it asserts the opposite and true fact,
    // that runCli substitutes its non-empty default, which is WHY the empty value is CLI-unreachable.
    const emptyLadder = runGate(['--plan', planFile, '--task', TASK, '--ladder', '--claim-dir', ''], cwdScratch);
    check('PG-2 --ladder with an empty claim dir renders under the substituted default claims/' + TASK + ' (the empty value never reaches validateClaimDir)',
      emptyLadder.status === 0 && new RegExp('claim\\s+claims/' + TASK).test(emptyLadder.stdout));

    // ══ PG-2 · command-line level — four structural classes through the real --ladder ══
    section('PG-2 --ladder enforces the same validateClaimDir contract --scope already enforced');
    const CLASSES = [
      ['not relative to the runtime root (absolute path)', '/abs/' + TASK],
      ['not relative to the runtime root (Windows drive letter)', 'C:/abs/' + TASK],
      ['not relative to the runtime root (leading backslash)', '\\abs\\' + TASK],
      ['fewer than two path segments', TASK],
      ['a segment that is empty', 'arc-claims//' + TASK],
      ['a segment that is a single dot', './' + TASK],
      ['a segment that is a double dot', 'arc-claims/../' + TASK],
      ['a segment that is otherwise invalid', 'arc-claims/bad seg/' + TASK],
      ['a final segment that is not the exact task id', 'arc-claims/WU-PHG/SOMEONE-ELSE']
    ];
    for (const pair of CLASSES) {
      const label = pair[0], value = pair[1];
      const ladder = runGate(['--plan', planFile, '--task', TASK, '--ladder', '--claim-dir', value], cwdScratch);
      const scope = runGate(['--plan', planFile, '--task', TASK, '--scope', '--phase', openPhase.id, '--claim-dir', value, '--worktree-path', wt], cwdScratch);
      check('PG-2 --ladder rejects ' + label + ' with exit 3', ladder.status === 3);
      check('PG-2 --ladder rejects ' + label + ' with the identical message --scope produces', scope.status === 3 && ladder.out === scope.out);
      check('PG-2 --ladder rejects ' + label + ' without rendering a ladder block', !/PROFILE BINDING/.test(ladder.out));
    }

    // ══ PG-2 · the ACCEPTED-input rendering is untouched ══════════════════════════════
    section('PG-2 a valid claim directory still renders the ladder block, byte for byte');
    const good = runGate(['--plan', planFile, '--task', TASK, '--ladder', '--claim-dir', 'arc-claims/WU-PHG/' + TASK], cwdScratch);
    check('PG-2 a valid claim directory renders the ladder at exit 0', good.status === 0 && /PROFILE BINDING/.test(good.stdout) && /W-V10 verified/.test(good.stdout));
    check('PG-2 the rendered ladder names the claim directory it was given', new RegExp('claim\\s+arc-claims/WU-PHG/' + TASK).test(good.stdout));
    check('PG-2 accepted-input ladder rendering is byte-identical to the pre-fix pin',
      sha256(ladderBody(good.stdout)) === GOLDEN_LADDER_BODY_SHA);
    const legacyGood = runGate(['--plan', planFile, '--task', TASK, '--ladder', '--claim-dir', 'claims/' + TASK], cwdScratch);
    check('PG-2 the legacy claim root remains an accepted value (exit 0, flagged legacy namespace)',
      legacyGood.status === 0 && /\(legacy namespace\)/.test(legacyGood.stdout));

    // ══ source guard: the literal token this task must never introduce ════════════════
    section('source guard');
    const gateSrc = fs.readFileSync(abs(REL.gate), 'utf8');
    check('phase-gate.js contains no occurrence of the literal token --arc', !/--arc\b/.test(gateSrc));
    check('phase-gate.js still performs no write / mutation syscall',
      !/writeFileSync|writeFile\(|appendFileSync|mkdirSync|mkdir\(|renameSync|unlinkSync|rmSync|rmdirSync|copyFileSync|createWriteStream|truncateSync|chmodSync|symlinkSync/.test(gateSrc));
  }

  if (liveBefore !== null) check('live runtime tree hash unchanged by this suite', treeHash(liveRuntime) === liveBefore);
} finally {
  cleanup();
}

console.log('\n' + (failed === 0 ? 'PHASE-GATE B6.2 REGRESSION: PASS (' + total + ' asserts)' : 'PHASE-GATE B6.2 REGRESSION: FAIL (' + failed + ' of ' + total + ' asserts failed)'));
assert.strictEqual(failed, 0, failures.slice(0, 12).join(' | '));
