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
 * WU-LABE / LABE-IMPL (R-2a, Owner ruling 2026-09-11) — LAB worktree isolation, six mechanical checks
 * in resolveScope for LAB-lane profiles only: worktree-not-detached · worktree-head-not-pinned ·
 * worktree-is-main · worktree-not-clean (first-phase entry only) · transfer-not-from-pinned-base ·
 * delta-base-or-hash-mismatch (TERMINAL entry; the REPORT entry prints the canonical Delta line).
 * Every fixture below is a REAL temporary repository with its own linked worktree (never the
 * repository this suite runs in, whose worktree registry is neither listed nor touched). Each check
 * has a planted negative that must fire and a positive twin that must not; the MAIN row proves
 * non-LAB profiles stay git-free.
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

    // ══ WU-LABE · LAB worktree isolation (R-2a) — real temp repositories, linked worktrees ═══
    section('WU-LABE LAB worktree isolation fixtures (real temporary repositories)');
    const git = (cwd, args) => { const r = spawnSync('git', ['-C', cwd, '-c', 'user.email=qa@fixture', '-c', 'user.name=qa'].concat(args), { encoding: 'utf8' }); if (r.status !== 0) throw new Error('fixture git ' + args.join(' ') + ': ' + (r.stderr || '').trim()); return (r.stdout || '').trim(); };
    const gitOk = typeof spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 'number' && spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
    check('WU-LABE git is available to build the fixtures (fail closed otherwise)', gitOk);
    // a base repository: one commit with index.html, qa/, and a .gitignore that ignores node_modules/
    const mkBase = (label) => {
      const base = tmp(label);
      git(base, ['init', '-q']);
      fs.writeFileSync(path.join(base, '.gitignore'), 'node_modules/\n');
      fs.writeFileSync(path.join(base, 'index.html'), '<!doctype html>\n<title>fixture</title>\n');
      fs.mkdirSync(path.join(base, 'qa'), { recursive: true });
      fs.writeFileSync(path.join(base, 'qa', 'fixture_offline.js'), "'use strict';\n");
      git(base, ['add', '-A']); git(base, ['commit', '-q', '-m', 'C0']);
      return { base, head: git(base, ['rev-parse', 'HEAD']) };
    };
    const addWt = (base, label, at, branch) => { const p = path.join(tmp(label), 'portfolio-tracker-test-lab'); git(base, ['worktree', 'add', '-q'].concat(branch ? ['-b', branch] : ['--detach']).concat([p, at])); return p; };
    const LAB_TASK = 'PG-LAB', LAB_ARC = 'WU-PGLAB', LAB_CLAIM = 'arc-claims/' + LAB_ARC + '/' + LAB_TASK;
    const labPlan = (repoRef, planId) => {
      const p = mkProposed();
      p.planId = planId; p.repoRef = repoRef;
      p.tasks = [{ id: LAB_TASK, priority: 10, lane: 'LAB', entryMode: 'PLAN', requiresOwnerGo: false, mutexes: [], dependsOn: [], executionProfile: 'LAB-CODE-SLICE', closeCondition: 'The fixture row exists so the gate has a LAB task to bind.', stopCondition: 'Stop immediately on any write outside the fixture tree.' }];
      const resolvedLab = JSON.parse(lib.resolveProfiles(p, library, { arcId: LAB_ARC }).text);
      return { plan: resolvedLab, file: writePlan(rt, resolvedLab) };
    };
    const scopeRun = (planFile, phaseId, wtPath) => runGate(['--plan', planFile, '--task', LAB_TASK, '--scope', '--phase', phaseId, '--claim-dir', LAB_CLAIM, '--worktree-path', wtPath], cwdScratch);
    const fires = (r, id) => r.status === 3 && new RegExp('(^|[;\\s])' + id + ':').test(r.out);
    const silent = (r, id) => !new RegExp('(^|[;\\s])' + id + ':').test(r.out);

    const wtRegList = () => (fs.existsSync(path.join(ROOT, '.git', 'worktrees')) ? fs.readdirSync(path.join(ROOT, '.git', 'worktrees')).sort().join(',') : '(none)');
    const wtRegBefore = wtRegList();
    const fx = mkBase('labe-base');
    const P = labPlan(fx.head, 'fixture-labe-r1');
    const bindLab = gate.bindProfile(P.plan, LAB_TASK);
    check('WU-LABE fixture binds LAB-CODE-SLICE and its first phase is PLAN', bindLab.status === 'bound' && bindLab.id === 'LAB-CODE-SLICE' && bindLab.profile.phases[0].id === 'PLAN' && bindLab.profile.appliesToLane === 'LAB');

    section('WU-LABE positive twin: detached, pinned, clean, linked -> every phase entry resolves');
    const wtGood = addWt(fx.base, 'labe-good', fx.head, null);
    const okPlan = scopeRun(P.file, 'PLAN', wtGood);
    check('WU-LABE POSITIVE --scope PLAN on a detached, pinned, clean, linked worktree -> exit 0', okPlan.status === 0);
    check('WU-LABE POSITIVE the scope output names the five checks that ran at PLAN', /isolation\s+LAB worktree checks passed: worktree-not-detached, worktree-head-not-pinned, worktree-is-main, worktree-not-clean, transfer-not-from-pinned-base/.test(okPlan.stdout));
    check('WU-LABE POSITIVE the owner root printed is the fixture base repository', okPlan.stdout.indexOf('owner ' + fs.realpathSync.native(fx.base)) !== -1 || okPlan.stdout.indexOf('owner ' + path.resolve(fx.base)) !== -1);
    const goodEntry = runGate(['--plan', P.file, '--task', LAB_TASK, '--phase', 'PLAN', '--last-ack', 'MANUAL', '--resumed', '--claim-dir', LAB_CLAIM, '--worktree-path', wtGood], cwdScratch);
    check('WU-LABE POSITIVE --phase PLAN --last-ack MANUAL --resumed (AUTHORIZED_JSON satisfied) -> exit 0 CONTINUE with the isolation line in the banner', goodEntry.status === 0 && /CONTINUE/.test(goodEntry.stdout) && /isolation\s+LAB worktree checks passed/.test(goodEntry.stdout));

    section('WU-LABE 1 worktree-not-detached');
    const wtBranch = addWt(fx.base, 'labe-branch', fx.head, 'pg-lab-branch');
    const nb = scopeRun(P.file, 'PLAN', wtBranch);
    check('WU-LABE NEGATIVE a branch-attached worktree is refused with worktree-not-detached (exit 3)', fires(nb, 'worktree-not-detached') && /refs\/heads\/pg-lab-branch/.test(nb.out));
    check('WU-LABE NEGATIVE the branch-attached worktree does NOT also read as the main worktree or unpinned (checks are independent)', silent(nb, 'worktree-is-main') && silent(nb, 'worktree-head-not-pinned'));
    check('WU-LABE POSITIVE the detached twin is silent on worktree-not-detached', silent(okPlan, 'worktree-not-detached'));

    section('WU-LABE 2 worktree-head-not-pinned');
    const wtMoved = addWt(fx.base, 'labe-moved', fx.head, null);
    git(wtMoved, ['commit', '-q', '--allow-empty', '-m', 'C1 (fixture: worktree moved off the pin)']);
    const nm = scopeRun(P.file, 'PLAN', wtMoved);
    check('WU-LABE NEGATIVE a detached worktree whose HEAD is not the pinned ref is refused with worktree-head-not-pinned', fires(nm, 'worktree-head-not-pinned') && nm.out.indexOf('!= pinnedRef ' + fx.head) !== -1);
    check('WU-LABE NEGATIVE a HEAD that is a DESCENDANT of the pin is still not a transfer-base failure (merge-base == pin)', silent(nm, 'transfer-not-from-pinned-base') && silent(nm, 'worktree-not-detached'));

    section('WU-LABE 3 worktree-is-main');
    git(fx.base, ['checkout', '-q', '--detach', fx.head]);
    const nmain = scopeRun(P.file, 'PLAN', fx.base);
    check('WU-LABE NEGATIVE the MAIN worktree of the repository (even detached at the pin, clean) is refused with worktree-is-main', fires(nmain, 'worktree-is-main'));
    check('WU-LABE NEGATIVE the main worktree is otherwise valid (detached at the pin), so only worktree-is-main fires', silent(nmain, 'worktree-not-detached') && silent(nmain, 'worktree-head-not-pinned') && silent(nmain, 'worktree-not-clean'));

    section('WU-LABE 4 worktree-not-clean (first-phase entry only, no exemptions)');
    const wtDirty = addWt(fx.base, 'labe-dirty', fx.head, null);
    fs.writeFileSync(path.join(wtDirty, 'stray.txt'), 'legacy\n');
    const nd1 = scopeRun(P.file, 'PLAN', wtDirty);
    check('WU-LABE NEGATIVE an untracked file at PLAN entry is refused with worktree-not-clean naming it', fires(nd1, 'worktree-not-clean') && /\?\? stray\.txt/.test(nd1.out));
    const nd1b = scopeRun(P.file, 'IMPLEMENT', wtDirty);
    check('WU-LABE POSITIVE the same untracked file at IMPLEMENT entry (not the first phase) is NOT a cleanliness refusal', nd1b.status === 0 && silent(nd1b, 'worktree-not-clean') && /worktree-is-main, transfer-not-from-pinned-base/.test(nd1b.stdout) && !/worktree-not-clean/.test(nd1b.stdout));
    fs.unlinkSync(path.join(wtDirty, 'stray.txt'));
    fs.appendFileSync(path.join(wtDirty, 'index.html'), '<!-- tracked modification -->\n');
    const nd2 = scopeRun(P.file, 'PLAN', wtDirty);
    check('WU-LABE NEGATIVE a tracked modification at PLAN entry is refused with worktree-not-clean naming it', fires(nd2, 'worktree-not-clean') && /M index\.html/.test(nd2.out));
    git(wtDirty, ['checkout', '-q', '--', 'index.html']);
    fs.mkdirSync(path.join(wtDirty, '.netlify'), { recursive: true }); fs.writeFileSync(path.join(wtDirty, '.netlify', 'state.json'), '{}\n');
    const nd3 = scopeRun(P.file, 'PLAN', wtDirty);
    check('WU-LABE NEGATIVE a stale .netlify/ directory is NOT exempt: refused with worktree-not-clean (Owner ruling 2026-09-11)', fires(nd3, 'worktree-not-clean') && /\?\? \.netlify\/state\.json/.test(nd3.out));
    fs.rmSync(path.join(wtDirty, '.netlify'), { recursive: true, force: true });
    fs.mkdirSync(path.join(wtDirty, 'node_modules'), { recursive: true }); fs.writeFileSync(path.join(wtDirty, 'node_modules', 'dep.js'), '');
    const nd4 = scopeRun(P.file, 'PLAN', wtDirty);
    check('WU-LABE POSITIVE a git-ignored path (node_modules/) never counts: PLAN entry passes with it present', nd4.status === 0 && silent(nd4, 'worktree-not-clean'));

    section('WU-LABE 5 transfer-not-from-pinned-base');
    const wtOld = addWt(fx.base, 'labe-old', fx.head, null);
    git(fx.base, ['commit', '-q', '--allow-empty', '-m', 'C1 (fixture: the plan pins a commit the worktree does not descend from)']);
    const c1 = git(fx.base, ['rev-parse', 'HEAD']);
    const P1 = labPlan(c1, 'fixture-labe-c1-r1');
    const nt = scopeRun(P1.file, 'PLAN', wtOld);
    check('WU-LABE NEGATIVE a worktree at C0 under a plan pinned to C1 (not an ancestor of C0) is refused with transfer-not-from-pinned-base', fires(nt, 'transfer-not-from-pinned-base') && nt.out.indexOf('merge-base ' + fx.head + ' != pinnedRef ' + c1) !== -1);
    check('WU-LABE NEGATIVE the same worktree is also unpinned (both checks fire, each with its own id)', fires(nt, 'worktree-head-not-pinned'));
    const ntGood = scopeRun(P.file, 'PLAN', wtOld);
    check('WU-LABE POSITIVE the same worktree under the plan pinned to C0 passes every check', ntGood.status === 0);

    section('WU-LABE 6 Delta record: REPORT prints the canonical line, TERMINAL requires exactly one matching record');
    const wtDelta = addWt(fx.base, 'labe-delta', fx.head, null);
    fs.appendFileSync(path.join(wtDelta, 'index.html'), '<!-- LAB edit -->\n');
    fs.writeFileSync(path.join(wtDelta, 'qa', 'new_lab_offline.js'), "'use strict'; // new untracked suite file\n");
    const ho = runGate(['--plan', P.file, '--task', LAB_TASK, '--phase', 'HANDOFF', '--last-ack', 'ACCEPT_EDITS', '--claim-dir', LAB_CLAIM, '--worktree-path', wtDelta], cwdScratch);
    const DELTA_OUT_RE = new RegExp('^  - Delta: arc=' + LAB_ARC + ' task=' + LAB_TASK + ' base=' + fx.head + ' sha256=([a-f0-9]{64})$', 'm');
    const dm = DELTA_OUT_RE.exec(ho.stdout);
    check('WU-LABE HANDOFF (REPORT) entry -> exit 0 and prints the canonical Delta line with base == pinnedRef', ho.status === 0 && !!dm);
    check('WU-LABE HANDOFF reports that the untracked new file is included in the digest (1 untracked file)', /1 untracked file included/.test(ho.stdout));
    const printedSha = dm ? dm[1] : '';
    const recomputed = gate.deltaDigest(wtDelta, fx.head);
    check('WU-LABE the printed sha256 equals an in-process recomputation (deterministic digest)', !!dm && recomputed.sha256 === printedSha && recomputed.untracked === 1);
    const hoScope = scopeRun(P.file, 'HANDOFF', wtDelta);
    check('WU-LABE --scope HANDOFF prints the identical Delta line', hoScope.status === 0 && (DELTA_OUT_RE.exec(hoScope.stdout) || [])[1] === printedSha);
    const handoffs = path.join(fx.base, '.ai-reports', 'handoffs');
    fs.mkdirSync(handoffs, { recursive: true });
    const cl0 = scopeRun(P.file, 'CLOSE', wtDelta);
    check('WU-LABE NEGATIVE CLOSE (TERMINAL) with no Delta record in the owner root -> delta-record-missing', fires(cl0, 'delta-record-missing'));
    const recLine = gate.deltaLine(LAB_ARC, LAB_TASK, fx.head, printedSha);
    fs.writeFileSync(path.join(handoffs, '2026-09-11_pg-lab.LAB.md'), '# HANDOFF fixture\n\n' + recLine + '\n');
    fs.writeFileSync(path.join(handoffs, '2026-09-11_other-task.LAB.md'), '# other\n' + gate.deltaLine(LAB_ARC, 'OTHER-TASK', fx.head, printedSha) + '\n');
    fs.writeFileSync(path.join(handoffs, '2026-09-11_not-a-lab.MAIN.md'), '# main\n' + recLine + '\n');
    const cl1 = scopeRun(P.file, 'CLOSE', wtDelta);
    check('WU-LABE POSITIVE CLOSE with exactly one matching record (other tasks and non-.LAB.md files ignored) -> exit 0, record line printed', cl1.status === 0 && /delta record\s+\.ai-reports\/handoffs\/2026-09-11_pg-lab\.LAB\.md:3/.test(cl1.stdout));
    fs.writeFileSync(path.join(handoffs, '2026-09-11_pg-lab-dup.LAB.md'), recLine + '\n');
    const cl2 = scopeRun(P.file, 'CLOSE', wtDelta);
    check('WU-LABE NEGATIVE two matching records (two files) -> delta-record-ambiguous naming both', fires(cl2, 'delta-record-ambiguous') && /pg-lab\.LAB\.md:3/.test(cl2.out) && /pg-lab-dup\.LAB\.md:1/.test(cl2.out));
    fs.unlinkSync(path.join(handoffs, '2026-09-11_pg-lab-dup.LAB.md'));
    fs.appendFileSync(path.join(wtDelta, 'qa', 'new_lab_offline.js'), '// changed after the record was written\n');
    const cl3 = scopeRun(P.file, 'CLOSE', wtDelta);
    check('WU-LABE NEGATIVE the worktree changed after the record (an UNTRACKED file edited) -> delta-base-or-hash-mismatch', fires(cl3, 'delta-base-or-hash-mismatch'));
    fs.writeFileSync(path.join(wtDelta, 'qa', 'new_lab_offline.js'), "'use strict'; // new untracked suite file\n");
    check('WU-LABE POSITIVE restoring the bytes restores the match (digest is content-addressed, not time-based)', scopeRun(P.file, 'CLOSE', wtDelta).status === 0);
    fs.writeFileSync(path.join(handoffs, '2026-09-11_pg-lab.LAB.md'), '# HANDOFF fixture\n\n' + gate.deltaLine(LAB_ARC, LAB_TASK, c1, printedSha) + '\n');
    const cl4 = scopeRun(P.file, 'CLOSE', wtDelta);
    check('WU-LABE NEGATIVE a record whose base is not the pinned ref (sha256 correct) -> delta-base-or-hash-mismatch', fires(cl4, 'delta-base-or-hash-mismatch'));
    fs.writeFileSync(path.join(handoffs, '2026-09-11_pg-lab.LAB.md'), '# HANDOFF fixture\n\n' + recLine + '\n');
    check('WU-LABE the CLI accepts no delta value from the Worker: --delta-base / --delta-hash are unknown arguments (exit 3)', runGate(['--plan', P.file, '--task', LAB_TASK, '--scope', '--phase', 'CLOSE', '--claim-dir', LAB_CLAIM, '--worktree-path', wtDelta, '--delta-base', fx.head], cwdScratch).status === 3 && runGate(['--plan', P.file, '--task', LAB_TASK, '--scope', '--phase', 'CLOSE', '--claim-dir', LAB_CLAIM, '--worktree-path', wtDelta, '--delta-hash', printedSha], cwdScratch).status === 3);
    check('WU-LABE the Delta record regex is the canonical shape and nothing looser', gate.DELTA_LINE_RE.test(recLine) && !gate.DELTA_LINE_RE.test(recLine.toUpperCase()) && !gate.DELTA_LINE_RE.test('Delta: arc=' + LAB_ARC + ' task=' + LAB_TASK + ' base=' + fx.head + ' sha256=' + printedSha) && !gate.DELTA_LINE_RE.test(recLine.replace('sha256=', 'sha256=0')));

    section('WU-LABE controls: non-LAB untouched, non-git path refused, read-only verb allowlist enforced at runtime');
    const mainOnDirtyBranch = runGate(['--plan', planFile, '--task', TASK, '--scope', '--phase', openPhase.id, '--worktree-path', wtBranch], cwdScratch);
    check('WU-LABE CONTROL a MAIN profile given the branch-attached LAB fixture as --worktree-path resolves at exit 0 with no isolation line (non-LAB stays git-free)', mainOnDirtyBranch.status === 0 && !/isolation/.test(mainOnDirtyBranch.stdout));
    const nonGit = scopeRun(P.file, 'PLAN', cwdScratch);
    check('WU-LABE NEGATIVE a --worktree-path that is not a git worktree is refused with worktree-not-a-git-worktree', fires(nonGit, 'worktree-not-a-git-worktree'));
    check('WU-LABE gitVerbOf skips -c key=value pairs and finds the verb', gate.gitVerbOf(['-c', 'core.quotepath=false', 'diff', '--no-color']) === 'diff' && gate.gitVerbOf(['rev-parse', 'HEAD']) === 'rev-parse');
    check('WU-LABE GIT_READ_VERBS is exactly the R-2a family', JSON.stringify(gate.GIT_READ_VERBS) === JSON.stringify(['rev-parse', 'symbolic-ref', 'status', 'merge-base', 'diff']));
    for (const bad of [['worktree', 'list'], ['checkout', '--detach'], ['commit', '-m', 'x'], ['-c', 'x=y', 'reset', '--hard'], ['stash'], ['show', 'HEAD:index.html']]) {
      let threw = false; try { gate.gitQuery(wtGood, bad); } catch (e) { threw = /read-only allowlist/.test(e.message); }
      check('WU-LABE NEGATIVE CONTROL gitQuery refuses a non-allowlisted verb at runtime: ' + bad.join(' '), threw);
    }
    check('WU-LABE the worktree registry of the repository this suite runs in is untouched by the fixtures (listing identical before/after)', wtRegList() === wtRegBefore);

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

console.log('\n' + (failed === 0 ? 'PHASE-GATE B6.2 REGRESSION + WU-LABE ISOLATION: PASS (' + total + ' asserts)' : 'PHASE-GATE B6.2 REGRESSION + WU-LABE ISOLATION: FAIL (' + failed + ' of ' + total + ' asserts failed)'));
assert.strictEqual(failed, 0, failures.slice(0, 12).join(' | '));
