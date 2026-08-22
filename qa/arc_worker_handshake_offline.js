'use strict';

/*
 * qa/arc_worker_handshake_offline.js
 *
 * Execution Profile V1.2 — Increment P-C (worker phase handshake + authorize print) executable
 * contract: EP-C0 … EP-C16 of the Multi-ARC V1 ULTRAPLAN r3 (§5.2, §6) plus the doc / wiring
 * greps and the B2 scope proofs. Pure Node, no network, no browser, no runtime write. Reads only:
 *   - .claude/skills/arc-worker/scripts/phase-gate.js                    (the B2 script: required + spawned)
 *   - .claude/skills/arc-publish-plan/scripts/lib/profile-contract.js   (the B1 library, to BUILD fixtures)
 *   - .claude/skills/arc-publish-plan/references/execution-profiles/*.json (to build resolved fixtures —
 *     the script under test must never read this directory; EP-C0/EP-C1 prove it)
 *   - the worker / authorize docs (greps) and, read-only, the live runtime (hash before/after)
 * Every temp tree lives under os.tmpdir() and is removed in `finally`.
 *
 * Owner rulings encoded (2026-08-22, B2): R-1 B1 QA flip · R-2/D-16 git-free, claim-root-agnostic
 * phase-gate · R-3/D-17 Edit in allowed-tools, tools = allowed-tools ∩ tools.allowed · R-4/D-15
 * report-only record · R-7 harness mapping manual/acceptEdits/auto, plan/dontAsk/bypassPermissions
 * UNMAPPED (cannot acknowledge; visible ⇒ STOP-before-write) · R-8 no toggle · R-9 A-V5 · R-10 CLI
 * surface exactly --ladder | --phase | --scope · R-11 pre-claim binding failure IDLE, resume BLOCKED,
 * AUTHORIZED_JSON satisfied only by the --resume preconditions · R-12 README status line.
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
  runtime: '.git/arc-runtime',
  v3Plan: '.git/arc-runtime/plans/parallel-arc-v3-2026-08-15/plan.json',
  docs: {
    workerSkill: '.claude/skills/arc-worker/SKILL.md',
    claimProtocol: '.claude/skills/arc-worker/references/claim-protocol.md',
    runtimeContract: '.claude/skills/arc-worker/references/runtime-contract.md',
    contract: '.claude/skills/arc-worker/references/execution-profile.md',
    workerReport: '.claude/skills/arc-worker/templates/worker-report.md',
    authorizeSkill: '.claude/skills/arc-authorize/SKILL.md',
    authorizeReport: '.claude/skills/arc-authorize/templates/authorize-report.md',
    readme: '.claude/skills/arc-publish-plan/references/execution-profiles/README.md',
    epQa: 'qa/arc_execution_profiles_offline.js',
    pbQa: 'qa/arc_publish_profiles_offline.js',
    runner: 'qa/run-offline.js'
  },
  // B5 (P-E publisher, 2026-08-22) owns the publisher docs, resolve-profiles.js and profile-contract.js;
  // their HEAD-identity pins were removed here mechanically (same pattern as R-B4-2). The B2 consumer
  // contract on the library (exports + return shapes) stays asserted by the handshake groups below.
  // B6 (P-E execution side, 2026-08-22) owns owner-ops.md; its HEAD-identity pin was removed mechanically
  // (R-B4-2 pattern). The B2 handshake assertions below are unaffected.
  forbidden: [
    '.claude/skills/arc-publish-plan/references/schemas/execution-profile.schema.json',
    'netlify.toml'
  ]
};
const abs = (p) => path.join(ROOT, p);
const readText = (p) => fs.readFileSync(abs(p), 'utf8');
const stripCR = (s) => String(s).replace(/\r/g, '');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const clone = (o) => JSON.parse(JSON.stringify(o));

// ── harness ──────────────────────────────────────────────────────────────────
let total = 0, failed = 0;
const failures = [];
function check(name, cond) { total += 1; if (!cond) { failed += 1; failures.push(name); console.log('  FAIL  ' + name); } }
function section(title) { console.log('== ' + title + ' =='); }

const tempDirs = [];
function tmp(label) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-pc-' + label + '-')); tempDirs.push(d); return d; }
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
  return sha256(entries.sort().join('\n'));
}
function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d); else fs.copyFileSync(s, d);
  }
}
function gitShow(rel) {
  const r = spawnSync('git', ['show', 'HEAD:' + rel], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? stripCR(r.stdout) : null;
}
function sectionOf(text, startRe) {
  const lines = stripCR(text).split('\n');
  let i = lines.findIndex((l) => startRe.test(l));
  if (i < 0) return null;
  const out = [lines[i]];
  for (i += 1; i < lines.length && !/^## /.test(lines[i]); i += 1) out.push(lines[i]);
  return out.join('\n');
}

// ── fixtures ─────────────────────────────────────────────────────────────────
const MUTEX_REGISTRY = ['AUTHORITY:published-plan', 'CODE:index-html', 'CODE:netlify-functions', 'DEPLOY:netlify', 'EXTERNAL:live-provider', 'QA:browser-runtime', 'RUNTIME:gates', 'RUNTIME:owner-profile'];
const ROWS = [
  { id: 'HS2-E2-SNAPSHOT', priority: 10, lane: 'OWNER', entryMode: 'DIRECT', requiresOwnerGo: false, mutexes: ['RUNTIME:owner-profile'], dependsOn: [], executionProfile: 'OWNER-MANUAL', closeCondition: 'A BACKUP export is taken and verified outside the repo.', stopCondition: 'Stop immediately if the export fails because stored JSON is invalid.' },
  { id: 'G1-CLOCK-SEAM', priority: 30, lane: 'MAIN', entryMode: 'PLAN', requiresOwnerGo: true, mutexes: ['CODE:index-html'], dependsOn: [], executionProfile: 'MAIN-CODE-SLICE', closeCondition: 'The injected clock is threaded through both call sites and the suites are green.', stopCondition: 'Stop immediately if any formula result changes.' },
  { id: 'LX-2', priority: 40, lane: 'LAB', entryMode: 'DIRECT', requiresOwnerGo: false, mutexes: [], dependsOn: [], executionProfile: 'LAB-SANDBOX-STATIC', closeCondition: 'The parity harness is complete in the lab worktree and a handoff is registered.', stopCondition: 'Stop immediately on any containment breach or live call.' },
  { id: 'LX0-REGISTER', priority: 50, lane: 'COWORK', entryMode: 'DIRECT', requiresOwnerGo: false, mutexes: [], dependsOn: [], executionProfile: 'COWORK-REGISTER', closeCondition: 'The remediation plan is registered as a handoff.', stopCondition: 'Stop immediately on any move toward execution.' },
  { id: 'LX-3', priority: 60, lane: 'LAB', entryMode: 'DIRECT', requiresOwnerGo: false, mutexes: [], dependsOn: ['LX-2'], executionProfile: 'LAB-SANDBOX-STATIC', closeCondition: 'The coverage analyzer is complete and a handoff is registered.', stopCondition: 'Stop immediately on any containment breach.' },
  { id: 'P4A-BROWSER-QA', priority: 70, lane: 'MAIN', entryMode: 'DIRECT', requiresOwnerGo: true, mutexes: ['CODE:index-html', 'QA:browser-runtime'], dependsOn: [], executionProfile: 'MAIN-BROWSER-QA', closeCondition: 'All seven display states are exercised live and a handoff is registered.', stopCondition: 'Stop immediately on any unexpected pt_ byte change.' },
  { id: 'LX-4', priority: 80, lane: 'LAB', entryMode: 'DIRECT', requiresOwnerGo: false, mutexes: [], dependsOn: ['LX-3'], executionProfile: 'LAB-SANDBOX-STATIC', closeCondition: 'The coercion scanner is complete and a handoff is registered.', stopCondition: 'Stop immediately on any containment breach.' },
  { id: 'CALL2-TOOLUSE-QA', priority: 90, lane: 'MAIN', entryMode: 'DIRECT', requiresOwnerGo: true, mutexes: ['CODE:index-html', 'QA:browser-runtime', 'RUNTIME:gates', 'EXTERNAL:live-provider'], dependsOn: [], executionProfile: 'MAIN-GATED-LIVE-QA', closeCondition: 'The tool-use path is verified end to end with both gates re-parked OFF.', stopCondition: 'Stop immediately if either gate is left ON at session end.' },
  { id: 'LX-5', priority: 100, lane: 'LAB', entryMode: 'DIRECT', requiresOwnerGo: false, mutexes: [], dependsOn: ['LX-4'], executionProfile: 'LAB-SANDBOX-STATIC', closeCondition: 'The conformance harness is complete and a handoff is registered.', stopCondition: 'Stop immediately on any containment breach.' }
];
function mkProposed(mut) {
  const plan = {
    planId: 'fixture-pc-profiled-r1',
    source: '.ai-reports/handoffs/2026-08-22_fixture-pc.COWORK.md',
    sourceHash: sha256('fixture-source'),
    repoRef: '7b54b39d13ef260919b58e3a1c5afd7f8e65c74b',
    generatedAt: '2026-08-22T00:00:00Z',
    mutexRegistry: MUTEX_REGISTRY.slice(),
    tasks: clone(ROWS)
  };
  if (mut) mut(plan);
  return plan;
}
function mkLegacy() {
  const p = mkProposed();
  p.planId = 'fixture-pc-legacy-r1';
  p.tasks.forEach((t) => { delete t.executionProfile; });
  return p;
}
const ALL_ACKS = ['UNKNOWN', 'MANUAL', 'ACCEPT_EDITS', 'AUTO'];
const BOUNDARIES = ['git-stage', 'git-commit', 'git-push', 'deploy', 'env-change', 'gate-toggle', 'live-external-call', 'pt-write', 'runtime-mutation-other-claim', 'scope-expansion', 'production'];

// ── load the B1 library (fixture builder) and the B2 script (under test) ─────
let lib = null, gate = null, library = null;
try { lib = require(abs(REL.lib)); } catch (e) { console.log('  (B1 library not loadable: ' + e.message.split('\n')[0] + ')'); }
try { gate = require(abs(REL.gate)); } catch (e) { console.log('  (phase-gate.js not loadable: ' + e.message.split('\n')[0] + ')'); }
if (lib) { try { library = lib.loadLibrary(abs(REL.libDir)); } catch (e) { console.log('  (library not loadable: ' + e.message.split('\n')[0] + ')'); } }

function resolved(mut) {
  const r = lib.resolveProfiles(mkProposed(mut), library);
  return JSON.parse(r.text);
}
function writePlan(root, plan) {
  const dir = path.join(root, 'plans', plan.planId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'plan.json');
  fs.writeFileSync(file, JSON.stringify(plan, null, 2) + '\n');
  return file;
}
function mkRuntime(label) {
  const root = tmp(label);
  for (const d of ['plans', 'claims', 'mutex']) fs.mkdirSync(path.join(root, d), { recursive: true });
  return root;
}
function runGate(args, cwd) {
  const r = spawnSync(process.execPath, [abs(REL.gate)].concat(args), { encoding: 'utf8', cwd: cwd || ROOT });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', out: (r.stdout || '') + (r.stderr || '') };
}
const has = (s, re) => (re instanceof RegExp ? re.test(s) : s.indexOf(re) !== -1);

console.log('ARC worker handshake contract (P-C, B2)');
const liveRuntime = abs(REL.runtime);
const liveBefore = fs.existsSync(liveRuntime) ? treeHash(liveRuntime) : null;

try {
  // ── EP-C0 artifact, exports, source guards ─────────────────────────────────
  section('EP-C0 phase-gate.js present, exports, source guards');
  check('B1 library profile-contract.js loads (fixture builder)', !!lib && !!library);
  check('phase-gate.js present', fs.existsSync(abs(REL.gate)));
  check('phase-gate.js loads', !!gate);
  const nc = fs.existsSync(abs(REL.gate)) ? spawnSync(process.execPath, ['--check', abs(REL.gate)], { encoding: 'utf8' }) : { status: 1 };
  check('phase-gate.js passes node --check', nc.status === 0);
  const src = fs.existsSync(abs(REL.gate)) ? stripCR(readText(REL.gate)) : '';
  check('phase-gate.js requires the B1 library by relative path (read-only require)', has(src, "require('../../arc-publish-plan/scripts/lib/profile-contract.js')"));
  check('phase-gate.js never names the library directory', !/execution-profiles/.test(src));
  check('phase-gate.js never calls loadLibrary / libraryFromObjects', !/loadLibrary|libraryFromObjects/.test(src));
  check('phase-gate.js has no write / mutation syscalls', !/writeFileSync|writeFile\(|appendFileSync|mkdirSync|mkdir\(|renameSync|unlinkSync|rmSync|rmdirSync|copyFileSync|createWriteStream|truncateSync|chmodSync|symlinkSync/.test(src));
  check('phase-gate.js spawns nothing and never calls git (R-2: git-free)', !/child_process|execSync|spawnSync|spawn\(|exec\(|\bgit\b\s+(rev-parse|worktree|branch|show)/.test(src));
  check('phase-gate.js reuses lib.deriveLockouts and lib.renderLadder (no re-implementation)', /lib\.deriveLockouts\(/.test(src) && /lib\.renderLadder\(/.test(src) && !/function (deriveLockouts|renderLadder)\s*\(/.test(src));
  check('phase-gate.js reuses lib.libraryHash / withoutLibraryHash / validateProfile for W-V10', /lib\.libraryHash\(/.test(src) && /lib\.withoutLibraryHash\(/.test(src) && /lib\.validateProfile\(/.test(src));
  check('phase-gate.js never prints "mode changed"', !/mode changed/i.test(src));
  check('phase-gate.js public CLI surface is exactly --ladder | --phase | --scope (R-10: no --ack / --phases / --arc)', /--ladder/.test(src) && /--phase/.test(src) && /--scope/.test(src) && !/'--ack'|"--ack"|--phases\b|--arc\b|--trail\b/.test(src));
  if (gate) {
    for (const fn of ['findTask', 'bindProfile', 'decide', 'parseAck', 'harnessModeOf', 'resolveScope', 'renderLadderBlock', 'renderEntry', 'renderPhases', 'runCli']) check('phase-gate exports ' + fn, typeof gate[fn] === 'function');
    check('phase-gate exports HARNESS_MODE_MAP manual/acceptEdits/auto (R-7)', JSON.stringify(gate.HARNESS_MODE_MAP) === JSON.stringify({ manual: 'MANUAL', acceptEdits: 'ACCEPT_EDITS', auto: 'AUTO' }));
    check('phase-gate exports UNMAPPED_HARNESS_MODES plan/dontAsk/bypassPermissions (R-7)', JSON.stringify(gate.UNMAPPED_HARNESS_MODES) === JSON.stringify(['plan', 'dontAsk', 'bypassPermissions']));
    check('phase-gate exports OUTCOMES vocabulary', Array.isArray(gate.OUTCOMES) && ['as-recommended', 'stricter-than-recommended', 'looser-than-recommended', 'declined-increase', 'stopped-above-ceiling', 'SKIP-evidenced'].every((o) => gate.OUTCOMES.includes(o)));
  }

  if (!gate || !lib || !library) {
    console.log('  (phase-gate.js / B1 library not loadable - rule groups EP-C1..C16 skipped; RED)');
    check('EP-C1..C16 executable (phase-gate.js + B1 library loadable)', false);
  } else {
    const libLab = library.profiles['LAB-SANDBOX-STATIC'].obj;
    const libMain = library.profiles['MAIN-CODE-SLICE'].obj;
    const rtA = mkRuntime('rt');
    const planA = resolved();
    const planAFile = writePlan(rtA, planA);
    const legacyPlan = mkLegacy();
    const legacyFile = writePlan(rtA, legacyPlan);
    const cwdScratch = tmp('cwd');

    // ── EP-C1 worker reads the embedded snapshot only ─────────────────────────
    section('EP-C1 embedded snapshot only (W-V10 from the embedded bytes)');
    const b = gate.bindProfile(planA, 'LX-2');
    check('EP-C1 bindProfile LX-2 -> bound LAB-SANDBOX-STATIC', b.status === 'bound' && b.id === 'LAB-SANDBOX-STATIC' && b.profile && b.profile.profileId === 'LAB-SANDBOX-STATIC');
    check('EP-C1 bound hash equals the embedded libraryHash and the library file hash', b.hash === planA.executionProfiles['LAB-SANDBOX-STATIC'].libraryHash && b.hash === library.profiles['LAB-SANDBOX-STATIC'].canonicalHash);
    // embedded copy deliberately differs from the library (exit text changed, re-hashed): the
    // ladder must reflect the EMBEDDED copy, proving the library is never consulted.
    const divergent = clone(planA);
    const e = divergent.executionProfiles['LAB-SANDBOX-STATIC'];
    e.phases[0].exit = 'EMBEDDED-ONLY-MARKER harness green';
    e.libraryHash = lib.libraryHash(e);
    const divergentFile = writePlan(rtA, Object.assign(divergent, { planId: 'fixture-pc-divergent-r1' }));
    const bd = gate.bindProfile(divergent, 'LX-2');
    check('EP-C1 divergent embedded copy (re-hashed) binds', bd.status === 'bound' && bd.hash !== library.profiles['LAB-SANDBOX-STATIC'].canonicalHash);
    const ladderDiv = runGate(['--plan', divergentFile, '--task', 'LX-2', '--ladder'], cwdScratch);
    check('EP-C1 --ladder on the divergent snapshot exit 0', ladderDiv.status === 0);
    check('EP-C1 --ladder reflects the embedded copy (marker printed), not the library', has(ladderDiv.stdout, 'EMBEDDED-ONLY-MARKER'));
    check('EP-C1 --ladder prints the embedded libraryHash (64 hex) with W-V10 verified', new RegExp('libraryHash\\s+' + bd.hash).test(ladderDiv.stdout) && /W-V10 verified/.test(ladderDiv.stdout));
    check('EP-C1 --ladder runs from a foreign cwd (no cwd dependence)', ladderDiv.status === 0);

    // ── EP-C2 recommended > ceiling ⇒ INVALID-PHASE ───────────────────────────
    section('EP-C2 invalid phase');
    for (const ack of ALL_ACKS) {
      const d = gate.decide({ lane: 'LAB', phase: { id: 'X', kind: 'IMPLEMENT', recommendedMode: 'AUTO', modeCeiling: 'ACCEPT_EDITS', entryGate: 'NONE', writes: [] }, lastAck: ack, answered: false });
      check('EP-C2 decide(rec AUTO > ceiling ACCEPT_EDITS, lastAck ' + ack + ') -> INVALID-PHASE', d.action === 'INVALID-PHASE');
    }
    const inv = clone(planA);
    inv.executionProfiles['LAB-SANDBOX-STATIC'].phases[0].recommendedMode = 'AUTO';
    inv.executionProfiles['LAB-SANDBOX-STATIC'].libraryHash = lib.libraryHash(inv.executionProfiles['LAB-SANDBOX-STATIC']);
    const invFile = writePlan(rtA, Object.assign(inv, { planId: 'fixture-pc-invalid-r1' }));
    const invRun = runGate(['--plan', invFile, '--task', 'LX-2', '--phase', 'BUILD', '--last-ack', 'ACCEPT_EDITS'], cwdScratch);
    check('EP-C2 CLI: an embedded profile with recommended>ceiling is refused at binding (exit 4, names recommended>ceiling)', invRun.status === 4 && /recommended>ceiling/.test(invRun.out));

    // ── EP-C3 MAIN never AUTO ─────────────────────────────────────────────────
    section('EP-C3 MAIN never AUTO');
    for (const ph of libMain.phases) {
      for (const answered of [false, true]) {
        const d = gate.decide({ lane: 'MAIN', phase: ph, lastAck: 'AUTO', answered });
        check('EP-C3 MAIN ' + ph.id + ' lastAck AUTO answered=' + answered + ' -> STOP-before-write main-never-auto', d.action === 'STOP-before-write' && /main-never-auto/.test(d.reason));
      }
    }
    const c3 = runGate(['--plan', planAFile, '--task', 'G1-CLOCK-SEAM', '--phase', 'PLAN', '--last-ack', 'AUTO', '--resumed', '--worktree-path', cwdScratch], cwdScratch);
    check('EP-C3 CLI G1 PLAN --last-ack AUTO -> exit 2 main-never-auto', c3.status === 2 && /main-never-auto/.test(c3.stdout) && /STOP-before-write/.test(c3.stdout));
    const c3h = gate.decide({ lane: 'MAIN', phase: libMain.phases[2], lastAck: 'ACCEPT_EDITS', answered: true, harnessMode: { mapped: 'AUTO', raw: 'auto' } });
    check('EP-C3 MAIN VERIFY lastAck ACCEPT_EDITS but harness signal maps to auto -> STOP-before-write (regardless of how learned)', c3h.action === 'STOP-before-write' && /main-never-auto/.test(c3h.reason));

    // ── EP-C4 stricter operator mode is legal ─────────────────────────────────
    section('EP-C4 stricter than recommended continues');
    const RUN = libLab.phases[1], BUILD = libLab.phases[0];
    check('EP-C4 LAB RUN (AUTO/AUTO) lastAck MANUAL not answered -> STOP-request-MODE-literal', gate.decide({ lane: 'LAB', phase: RUN, lastAck: 'MANUAL', answered: false }).action === 'STOP-request-MODE-literal');
    const r1 = gate.decide({ lane: 'LAB', phase: RUN, lastAck: 'MANUAL', answered: true });
    check('EP-C4 LAB RUN lastAck MANUAL answered -> CONTINUE stricter-than-recommended', r1.action === 'CONTINUE' && r1.outcome === 'stricter-than-recommended');
    const r2 = gate.decide({ lane: 'LAB', phase: RUN, lastAck: 'ACCEPT_EDITS', answered: true });
    check('EP-C4 LAB RUN lastAck ACCEPT_EDITS answered -> CONTINUE stricter-than-recommended', r2.action === 'CONTINUE' && r2.outcome === 'stricter-than-recommended');
    const r3 = gate.decide({ lane: 'LAB', phase: RUN, lastAck: 'AUTO', answered: false });
    check('EP-C4 LAB RUN lastAck AUTO -> CONTINUE as-recommended', r3.action === 'CONTINUE' && r3.outcome === 'as-recommended');
    const r4 = gate.decide({ lane: 'LAB', phase: { id: 'Y', kind: 'IMPLEMENT', recommendedMode: 'MANUAL', modeCeiling: 'ACCEPT_EDITS', entryGate: 'NONE', writes: [] }, lastAck: 'ACCEPT_EDITS', answered: false });
    check('EP-C4 rec MANUAL / ceiling ACCEPT_EDITS, lastAck ACCEPT_EDITS -> CONTINUE looser-than-recommended (within ceiling)', r4.action === 'CONTINUE' && r4.outcome === 'looser-than-recommended');
    const c4 = runGate(['--plan', planAFile, '--task', 'LX-2', '--phase', 'BUILD', '--last-ack', 'MANUAL', '--answered', '--worktree-path', cwdScratch], cwdScratch);
    check('EP-C4 CLI LX-2 BUILD --last-ack MANUAL --answered -> exit 0 CONTINUE stricter-than-recommended', c4.status === 0 && /CONTINUE/.test(c4.stdout) && /stricter-than-recommended/.test(c4.stdout));
    const c4b = runGate(['--plan', planAFile, '--task', 'LX-2', '--phase', 'BUILD', '--last-ack', 'MANUAL', '--worktree-path', cwdScratch], cwdScratch);
    check('EP-C4 CLI LX-2 BUILD --last-ack MANUAL (not answered) -> exit 2 STOP-request-MODE-literal requesting MODE ACCEPT_EDITS', c4b.status === 2 && /STOP-request-MODE-literal/.test(c4b.stdout) && /MODE ACCEPT_EDITS/.test(c4b.stdout));

    // ── EP-C5 the acknowledgement literal ─────────────────────────────────────
    section('EP-C5 MODE literal parser');
    const pos = [['MODE MANUAL', 'MANUAL'], ['MODE ACCEPT_EDITS', 'ACCEPT_EDITS'], ['MODE AUTO', 'AUTO'], ['switched, here you go\nMODE AUTO\nthanks', 'AUTO'], ['  MODE MANUAL  ', 'MANUAL'], ['MODE ACCEPT_EDITS\r\n', 'ACCEPT_EDITS']];
    for (const [t, m] of pos) { const p = gate.parseAck(t); check('EP-C5 ack ' + JSON.stringify(t) + ' -> ' + m, p.ok === true && p.mode === m); }
    const neg = ['mode manual', 'Mode Auto', 'MODE AUTO please', 'please MODE AUTO', '"MODE AUTO"', '> MODE AUTO', 'MODE ACCEPT EDITS', 'MODE', 'ok', 'go ahead', 'switched to auto', 'MODE MANUAL\nMODE AUTO', 'MODE AUTO MODE AUTO', '```\nMODE AUTO\n```', '', 'MODE_AUTO', 'MODE AUTO.'];
    for (const t of neg) { const p = gate.parseAck(t); check('EP-C5 not an ack: ' + JSON.stringify(t), p.ok === false); }
    check('EP-C5 two literals reported as more-than-one', /more than one|two/i.test(gate.parseAck('MODE MANUAL\nMODE AUTO').reason || ''));
    check('EP-C5 harnessModeOf("auto") -> mapped AUTO', JSON.stringify(gate.harnessModeOf('auto')) === JSON.stringify({ mapped: 'AUTO', raw: 'auto' }));
    check('EP-C5 harnessModeOf("Auto Mode notice: entering auto mode") -> mapped AUTO', (gate.harnessModeOf('Auto Mode notice: entering auto mode') || {}).mapped === 'AUTO');
    check('EP-C5 harnessModeOf("acceptEdits") -> mapped ACCEPT_EDITS', (gate.harnessModeOf('acceptEdits') || {}).mapped === 'ACCEPT_EDITS');
    check('EP-C5 harnessModeOf("manual") -> mapped MANUAL', (gate.harnessModeOf('manual') || {}).mapped === 'MANUAL');
    for (const u of ['plan', 'dontAsk', 'bypassPermissions']) check('EP-C5 harnessModeOf("' + u + '") -> unmapped (R-7)', (gate.harnessModeOf(u) || {}).unmapped === u);
    check('EP-C5 harnessModeOf("") / NOT MACHINE-VERIFIABLE -> null', gate.harnessModeOf('') === null && gate.harnessModeOf('NOT MACHINE-VERIFIABLE') === null);

    // ── EP-C6 renderer never claims a mode change ─────────────────────────────
    section('EP-C6 PHASES renderer');
    const trail = [
      { phase: 'BUILD', kind: 'IMPLEMENT', recommended: 'ACCEPT_EDITS', ceiling: 'ACCEPT_EDITS', acknowledged: 'ACCEPT_EDITS', acknowledgedAt: '2026-08-22T10:00:00Z', outcome: 'as-recommended' },
      { phase: 'RUN', kind: 'VERIFY', recommended: 'AUTO', ceiling: 'AUTO', acknowledged: 'ACCEPT_EDITS', acknowledgedAt: '2026-08-22T10:05:00Z', outcome: 'declined-increase' },
      { phase: 'HANDOFF', kind: 'REPORT', recommended: 'ACCEPT_EDITS', ceiling: 'ACCEPT_EDITS', acknowledged: 'AUTO', acknowledgedAt: '2026-08-22T10:09:00Z', outcome: 'stopped-above-ceiling' },
      { phase: 'HANDOFF', kind: 'REPORT', recommended: 'ACCEPT_EDITS', ceiling: 'ACCEPT_EDITS', acknowledged: 'MANUAL', acknowledgedAt: '2026-08-22T10:10:00Z', outcome: 'stricter-than-recommended' },
      { phase: 'CLOSE', kind: 'TERMINAL', recommended: 'MANUAL', ceiling: 'MANUAL', acknowledged: 'MANUAL', acknowledgedAt: '2026-08-22T10:20:00Z', outcome: 'as-recommended' }
    ];
    const rendered = gate.renderPhases(trail, {});
    check('EP-C6 renderer prints a PHASES block with every row', /PHASES/.test(rendered) && ['BUILD', 'RUN', 'HANDOFF', 'CLOSE'].every((p) => rendered.indexOf(p) !== -1) && /stopped-above-ceiling/.test(rendered) && /declined-increase/.test(rendered));
    check('EP-C6 renderer never prints "mode changed"', !/mode changed/i.test(rendered));
    check('EP-C6 renderer quotes the acknowledgement with its timestamp', /operator acknowledged MODE ACCEPT_EDITS at 2026-08-22T10:00:00Z/.test(rendered) && /operator acknowledged MODE MANUAL at 2026-08-22T10:20:00Z/.test(rendered));
    const renderedResumed = gate.renderPhases([{ phase: 'BUILD', kind: 'IMPLEMENT', recommended: 'ACCEPT_EDITS', ceiling: 'ACCEPT_EDITS', acknowledged: 'UNKNOWN', acknowledgedAt: null, outcome: 'SKIP-evidenced' }], { resumed: true });
    check('EP-C6 resumed render states prior acknowledgements not carried + SKIP-evidenced', /resumed: yes; prior acknowledgements not carried/.test(renderedResumed) && /SKIP-evidenced/.test(renderedResumed) && !/mode changed/i.test(renderedResumed));
    check('EP-C6 renderer rejects an unknown outcome', (() => { try { gate.renderPhases([{ phase: 'X', kind: 'VERIFY', recommended: 'AUTO', ceiling: 'AUTO', acknowledged: 'AUTO', acknowledgedAt: '2026-08-22T10:00:00Z', outcome: 'mode-changed' }], {}); return false; } catch (_) { return true; } })());
    check('EP-C6 renderer rejects an unknown acknowledged mode', (() => { try { gate.renderPhases([{ phase: 'X', kind: 'VERIFY', recommended: 'AUTO', ceiling: 'AUTO', acknowledged: 'bypassPermissions', acknowledgedAt: '2026-08-22T10:00:00Z', outcome: 'as-recommended' }], {}); return false; } catch (_) { return true; } })());
    const entry = gate.renderEntry({ taskId: 'LX-2', phase: BUILD, index: 0, count: 4, binding: b, claimDir: 'claims/LX-2', pinnedRef: planA.repoRef, lastAck: 'UNKNOWN', acknowledgedAt: null, harnessSignal: null, scope: gate.resolveScope({ plan: planA, task: gate.findTask(planA, 'LX-2'), profile: b.profile, phase: BUILD, claimDir: 'claims/LX-2', worktreePath: cwdScratch }), decision: gate.decide({ lane: 'LAB', phase: BUILD, lastAck: 'UNKNOWN', answered: false }), resumed: false });
    check('EP-C6 PHASE ENTRY banner carries every field in order', (() => {
      const order = ['PHASE ENTRY', 'profile', 'claim', 'pinnedRef', 'recommendedMode', 'modeCeiling', 'last acknowledged', 'harness signal', 'write scope', 'forbidden here', 'entry gate', 'action'];
      let last = -1; for (const k of order) { const i = entry.indexOf(k, last + 1); if (i < 0) return false; last = i; } return true;
    })());
    check('EP-C6 banner: NOT MACHINE-VERIFIABLE when no harness signal; UNKNOWN at first phase; never "mode changed"', /harness signal\s+NOT MACHINE-VERIFIABLE/.test(entry) && /last acknowledged\s+UNKNOWN/.test(entry) && !/mode changed/i.test(entry));
    check('EP-C6 banner: forbidden here lists all eleven boundaries', BOUNDARIES.every((x) => entry.indexOf(x) !== -1));
    check('EP-C6 banner: [1 of 4] and the embedded hash prefix', /\[1 of 4\]/.test(entry) && entry.indexOf(b.hash.slice(0, 8)) !== -1);

    // ── EP-C7 W-V10 tamper / binding missing ──────────────────────────────────
    section('EP-C7 W-V10 tamper + profile-binding-missing');
    const tamper = (mut) => { const p = clone(planA); mut(p); return p; };
    const t1 = tamper((p) => { p.executionProfiles['LAB-SANDBOX-STATIC'].phases[0].exit = 'tampered'; });
    check('EP-C7 tampered embedded byte (hash not re-derived) -> mismatch', gate.bindProfile(t1, 'LX-2').status === 'mismatch');
    const t2 = tamper((p) => { p.executionProfiles['LAB-SANDBOX-STATIC'].libraryHash = 'a'.repeat(64); });
    check('EP-C7 tampered libraryHash -> mismatch', gate.bindProfile(t2, 'LX-2').status === 'mismatch');
    const t3 = tamper((p) => { const e2 = p.executionProfiles['LAB-SANDBOX-STATIC']; const o = {}; o.version = e2.version; o.profileId = e2.profileId; for (const k of Object.keys(e2)) if (!(k in o)) o[k] = e2[k]; p.executionProfiles['LAB-SANDBOX-STATIC'] = o; });
    check('EP-C7 wrong key order (version before profileId) -> mismatch', gate.bindProfile(t3, 'LX-2').status === 'mismatch');
    const t4 = tamper((p) => { const e2 = p.executionProfiles['LAB-SANDBOX-STATIC']; e2.approvalBoundaries.inside = ['git-push']; e2.libraryHash = lib.libraryHash(e2); });
    check('EP-C7 re-hashed but schema-invalid embedded profile (inside [git-push]) -> mismatch naming inside:must-be-empty', (() => { const r = gate.bindProfile(t4, 'LX-2'); return r.status === 'mismatch' && /inside:must-be-empty/.test(r.reason); })());
    const t5 = tamper((p) => { delete p.executionProfiles; });
    check('EP-C7 executionProfiles absent while the row references a profile -> missing', gate.bindProfile(t5, 'LX-2').status === 'missing');
    const t6 = tamper((p) => { delete p.tasks.find((t) => t.id === 'LX-2').executionProfile; });
    check('EP-C7 row without executionProfile while the map is present -> missing', gate.bindProfile(t6, 'LX-2').status === 'missing');
    const t7 = tamper((p) => { p.tasks.find((t) => t.id === 'LX-2').executionProfile = 'NOT-A-PROFILE'; });
    check('EP-C7 reference not a key of the embedded map -> missing', gate.bindProfile(t7, 'LX-2').status === 'missing');
    const t8 = tamper((p) => { p.tasks.find((t) => t.id === 'LX-2').executionProfile = 'lab-sandbox-static'; });
    check('EP-C7 lowercase reference (no case folding) -> missing', gate.bindProfile(t8, 'LX-2').status === 'missing');
    const t9 = tamper((p) => { p.executionProfiles['LAB-SANDBOX-STATIC'].profileId = 'OTHER'; p.executionProfiles['LAB-SANDBOX-STATIC'].libraryHash = lib.libraryHash(p.executionProfiles['LAB-SANDBOX-STATIC']); });
    check('EP-C7 embedded key != profileId -> mismatch', gate.bindProfile(t9, 'LX-2').status === 'mismatch');
    const t1File = writePlan(rtA, Object.assign(clone(t1), { planId: 'fixture-pc-tamper-r1' }));
    const t1Run = runGate(['--plan', t1File, '--task', 'LX-2', '--ladder'], cwdScratch);
    check('EP-C7 CLI --ladder on a tampered snapshot -> exit 4 profile-hash-mismatch (W-V10)', t1Run.status === 4 && /profile-hash-mismatch/.test(t1Run.out) && /W-V10/.test(t1Run.out));
    const t5File = writePlan(rtA, Object.assign(clone(t5), { planId: 'fixture-pc-missing-r1' }));
    const t5Run = runGate(['--plan', t5File, '--task', 'LX-2', '--phase', 'BUILD', '--last-ack', 'UNKNOWN', '--worktree-path', cwdScratch], cwdScratch);
    check('EP-C7 CLI --phase on a binding-missing snapshot -> exit 4 profile-binding-missing, no banner decision', t5Run.status === 4 && /profile-binding-missing/.test(t5Run.out) && !/HANDSHAKE-REQUIRED/.test(t5Run.out));
    check('EP-C7 CLI unknown task -> exit 3 usage', runGate(['--plan', planAFile, '--task', 'NOPE', '--ladder'], cwdScratch).status === 3);
    check('EP-C7 CLI unknown phase -> exit 3 usage', runGate(['--plan', planAFile, '--task', 'LX-2', '--phase', 'NOPE', '--last-ack', 'UNKNOWN', '--worktree-path', cwdScratch], cwdScratch).status === 3);
    check('EP-C7 CLI bad --last-ack -> exit 3 usage', runGate(['--plan', planAFile, '--task', 'LX-2', '--phase', 'BUILD', '--last-ack', 'auto', '--worktree-path', cwdScratch], cwdScratch).status === 3);
    check('EP-C7 CLI missing plan -> exit 3 usage', runGate(['--plan', path.join(rtA, 'nope.json'), '--task', 'LX-2', '--ladder'], cwdScratch).status === 3);
    check('EP-C7 CLI no mode flag -> exit 3 usage', runGate(['--plan', planAFile, '--task', 'LX-2'], cwdScratch).status === 3);

    // ── EP-C8 legacy snapshot: V1 behaviour, no handshake ─────────────────────
    section('EP-C8 legacy snapshot (K5)');
    const bl = gate.bindProfile(legacyPlan, 'LX-2');
    check('EP-C8 legacy bindProfile -> legacy, profile none', bl.status === 'legacy' && bl.profile === null && /profile none \(legacy snapshot\)/.test(bl.reason));
    // ── EP-C10 (B6, P-E execution side): the committed renderer already serves BOTH claim
    // namespaces, which is why B6 changed neither phase-gate.js nor execution-profile.md.
    section('EP-C17 phase-gate is claim-root-agnostic across namespaces (B6 conditional NOT used)');
    const ARC_DIR = 'arc-claims/ARC-A/LX-2';
    const sArc = runGate(['--plan', planAFile, '--task', 'LX-2', '--scope', '--phase', 'BUILD', '--claim-dir', ARC_DIR, '--worktree-path', cwdScratch], cwdScratch);
    const sLeg = runGate(['--plan', planAFile, '--task', 'LX-2', '--scope', '--phase', 'BUILD', '--claim-dir', 'claims/LX-2', '--worktree-path', cwdScratch], cwdScratch);
    check('EP-C17 --claim-dir arc-claims/<ARC-ID>/<TASK-ID> is accepted and heads the V1 allowlist', sArc.status === 0 && has(sArc.stdout, ARC_DIR + '/claim.json'));
    check('EP-C17 the legacy claim line is marked "(legacy namespace)" and the ARC one is not', has(sLeg.stdout, 'claims/LX-2 (legacy namespace)') && !has(sArc.stdout, ARC_DIR + ' (legacy namespace)'));
    check('EP-C17 only the claim path differs between the two namespaces: worktree, pinnedRef, write scope, read-only and forbidden lines are identical', (() => {
      const pick = (s) => s.split('\n').filter((l) => /^(worktree|pinnedRef|write scope|read-only|forbidden|declared actions|scope STOP)/.test(l)).join('\n');
      return sArc.status === 0 && sLeg.status === 0 && pick(sArc.stdout) === pick(sLeg.stdout) && pick(sArc.stdout).length > 0;
    })());
    check('EP-C17 a --claim-dir that does not end in the task id -> exit 3 usage; no namespace is ever inferred', runGate(['--plan', planAFile, '--task', 'LX-2', '--scope', '--phase', 'BUILD', '--claim-dir', 'arc-claims/ARC-A/OTHER', '--worktree-path', cwdScratch], cwdScratch).status === 3);
    check('EP-C17 a single-segment --claim-dir -> exit 3 usage', runGate(['--plan', planAFile, '--task', 'LX-2', '--scope', '--phase', 'BUILD', '--claim-dir', 'LX-2', '--worktree-path', cwdScratch], cwdScratch).status === 3);
    const ladderArc = runGate(['--plan', planAFile, '--task', 'LX-2', '--ladder', '--claim-dir', ARC_DIR], cwdScratch);
    check('EP-C17 --ladder prints the ARC claim root, so /arc-authorize pastes the ladder of the namespace it actually grants in (A-V5 + A-V6)', ladderArc.status === 0 && has(ladderArc.stdout, ARC_DIR));
    const entryArc = runGate(['--plan', planAFile, '--task', 'LX-2', '--phase', 'BUILD', '--last-ack', 'ACCEPT_EDITS', '--answered', '--claim-dir', ARC_DIR, '--worktree-path', cwdScratch], cwdScratch);
    check('EP-C17 the PHASE ENTRY banner carries the ARC claim root and still CONTINUEs (mode policy is namespace-independent)', entryArc.status === 0 && has(entryArc.stdout, ARC_DIR) && has(entryArc.stdout, 'CONTINUE'));

    const l1 = runGate(['--plan', legacyFile, '--task', 'LX-2', '--ladder'], cwdScratch);
    check('EP-C8 CLI --ladder legacy -> exit 0 "profile none (legacy snapshot)"', l1.status === 0 && /profile none \(legacy snapshot\)/.test(l1.stdout));
    const l2 = runGate(['--plan', legacyFile, '--task', 'LX-2', '--phase', 'BUILD', '--last-ack', 'UNKNOWN'], cwdScratch);
    check('EP-C8 CLI --phase legacy -> exit 0 NO HANDSHAKE (legacy snapshot), no STOP', l2.status === 0 && /NO HANDSHAKE \(legacy snapshot\)/.test(l2.stdout) && !/HANDSHAKE-REQUIRED/.test(l2.stdout));
    const l3 = runGate(['--plan', legacyFile, '--task', 'LX-2', '--scope', '--phase', 'BUILD'], cwdScratch);
    check('EP-C8 CLI --scope legacy -> exit 0, V1 allowlist only', l3.status === 0 && /legacy snapshot/.test(l3.stdout) && /claims\/LX-2\/claim\.json/.test(l3.stdout));
    if (fs.existsSync(abs(REL.v3Plan))) {
      const v3 = runGate(['--plan', abs(REL.v3Plan), '--task', 'LX-5', '--ladder'], cwdScratch);
      check('EP-C8 live v3 snapshot (read-only) -> legacy, profile none', v3.status === 0 && /profile none \(legacy snapshot\)/.test(v3.stdout));
    } else console.log('  (live v3 snapshot absent - legacy live check skipped)');

    // ── EP-C9 ack AUTO then HANDOFF / CLOSE ───────────────────────────────────
    section('EP-C9 above-ceiling after AUTO');
    const HANDOFF = libLab.phases[2], CLOSE = libLab.phases[3];
    for (const answered of [false, true]) {
      check('EP-C9 LAB HANDOFF (A/A) lastAck AUTO answered=' + answered + ' -> STOP-before-write mode-exceeds-ceiling', (() => { const d = gate.decide({ lane: 'LAB', phase: HANDOFF, lastAck: 'AUTO', answered }); return d.action === 'STOP-before-write' && /mode-exceeds-ceiling/.test(d.reason); })());
      check('EP-C9 LAB CLOSE (M/M) lastAck AUTO answered=' + answered + ' -> STOP-before-write mode-exceeds-ceiling', (() => { const d = gate.decide({ lane: 'LAB', phase: CLOSE, lastAck: 'AUTO', answered }); return d.action === 'STOP-before-write' && /mode-exceeds-ceiling/.test(d.reason); })());
    }
    check('EP-C9 HANDOFF after MODE MANUAL -> CONTINUE stricter-than-recommended', (() => { const d = gate.decide({ lane: 'LAB', phase: HANDOFF, lastAck: 'MANUAL', answered: true }); return d.action === 'CONTINUE' && d.outcome === 'stricter-than-recommended'; })());
    check('EP-C9 CLOSE after MODE MANUAL -> CONTINUE as-recommended', (() => { const d = gate.decide({ lane: 'LAB', phase: CLOSE, lastAck: 'MANUAL', answered: true }); return d.action === 'CONTINUE' && d.outcome === 'as-recommended'; })());
    check('EP-C9 CLOSE after MODE ACCEPT_EDITS -> STOP-before-write again (> ceiling)', gate.decide({ lane: 'LAB', phase: CLOSE, lastAck: 'ACCEPT_EDITS', answered: true }).action === 'STOP-before-write');
    const c9 = runGate(['--plan', planAFile, '--task', 'LX-2', '--phase', 'CLOSE', '--last-ack', 'AUTO', '--worktree-path', cwdScratch], cwdScratch);
    check('EP-C9 CLI LX-2 CLOSE --last-ack AUTO -> exit 2 STOP-before-write mode-exceeds-ceiling', c9.status === 2 && /STOP-before-write/.test(c9.stdout) && /mode-exceeds-ceiling/.test(c9.stdout));
    const c9h = gate.decide({ lane: 'LAB', phase: CLOSE, lastAck: 'MANUAL', answered: true, harnessMode: { mapped: 'AUTO', raw: 'auto' } });
    check('EP-C9 CLOSE lastAck MANUAL but harness signal auto -> STOP-before-write (above ceiling regardless of how learned)', c9h.action === 'STOP-before-write' && /mode-exceeds-ceiling/.test(c9h.reason));
    for (const u of ['plan', 'dontAsk', 'bypassPermissions']) {
      const d = gate.decide({ lane: 'LAB', phase: BUILD, lastAck: 'ACCEPT_EDITS', answered: true, harnessMode: { unmapped: u, raw: u } });
      check('EP-C9 unmapped harness mode ' + u + ' visible -> STOP-before-write unmapped-harness-mode (R-7)', d.action === 'STOP-before-write' && /unmapped-harness-mode/.test(d.reason) && d.reason.indexOf(u) !== -1);
    }
    const c9u = runGate(['--plan', planAFile, '--task', 'LX-2', '--phase', 'BUILD', '--last-ack', 'ACCEPT_EDITS', '--answered', '--harness-signal', 'bypassPermissions', '--worktree-path', cwdScratch], cwdScratch);
    check('EP-C9 CLI --harness-signal bypassPermissions -> exit 2 unmapped-harness-mode, asks for manual | acceptEdits | auto', c9u.status === 2 && /unmapped-harness-mode/.test(c9u.stdout) && /manual/.test(c9u.stdout) && /acceptEdits/.test(c9u.stdout));

    // ── EP-C10 boundaries MANUAL / non-grantable ──────────────────────────────
    section('EP-C10 action phases and boundaries');
    const gated = library.profiles['MAIN-GATED-LIVE-QA'].obj;
    const SETUP = gated.phases[0];
    check('EP-C10 fixture: MAIN-GATED-LIVE-QA SETUP declares gate-toggle and is MANUAL/MANUAL', (SETUP.actions || []).includes('gate-toggle') && SETUP.modeCeiling === 'MANUAL');
    check('EP-C10 SETUP [gate-toggle] lastAck ACCEPT_EDITS -> STOP-before-write', gate.decide({ lane: 'MAIN', phase: SETUP, lastAck: 'ACCEPT_EDITS', answered: true }).action === 'STOP-before-write');
    check('EP-C10 SETUP [gate-toggle] lastAck MANUAL -> CONTINUE as-recommended', gate.decide({ lane: 'MAIN', phase: SETUP, lastAck: 'MANUAL', answered: true }).outcome === 'as-recommended');
    const bG = gate.bindProfile(planA, 'CALL2-TOOLUSE-QA');
    const entryG = gate.renderEntry({ taskId: 'CALL2-TOOLUSE-QA', phase: SETUP, index: 0, count: 5, binding: bG, claimDir: 'claims/CALL2-TOOLUSE-QA', pinnedRef: planA.repoRef, lastAck: 'MANUAL', acknowledgedAt: '2026-08-22T11:00:00Z', harnessSignal: null, scope: gate.resolveScope({ plan: planA, task: gate.findTask(planA, 'CALL2-TOOLUSE-QA'), profile: bG.profile, phase: SETUP, claimDir: 'claims/CALL2-TOOLUSE-QA', worktreePath: cwdScratch }), decision: gate.decide({ lane: 'MAIN', phase: SETUP, lastAck: 'MANUAL', answered: true }), resumed: true });
    check('EP-C10 banner lists all eleven boundaries and the declared action gate-toggle', BOUNDARIES.every((x) => entryG.indexOf(x) !== -1) && /declared actions\s+gate-toggle/.test(entryG));
    check('EP-C10 banner quotes the acknowledgement with its timestamp', /last acknowledged\s+MANUAL\s+\(operator, 2026-08-22T11:00:00Z\)/.test(entryG));
    check('EP-C10 binding asserts approvalBoundaries.inside empty (bound profile)', bG.status === 'bound' && bG.profile.approvalBoundaries.inside.length === 0);

    // ── EP-C11 restart / resume ───────────────────────────────────────────────
    section('EP-C11 restart / resume');
    const c11 = runGate(['--plan', planAFile, '--task', 'LX-2', '--phase', 'BUILD', '--last-ack', 'UNKNOWN', '--resumed', '--worktree-path', cwdScratch], cwdScratch);
    check('EP-C11 --resumed first entry -> HANDSHAKE-REQUIRED, resumed line present', c11.status === 2 && /HANDSHAKE-REQUIRED/.test(c11.stdout) && /resumed\s+yes - prior acknowledgements not carried/.test(c11.stdout));
    const c11b = runGate(['--plan', planAFile, '--task', 'LX-2', '--phase', 'BUILD', '--last-ack', 'UNKNOWN', '--worktree-path', cwdScratch], cwdScratch);
    check('EP-C11 fresh first entry -> HANDSHAKE-REQUIRED, resumed no', c11b.status === 2 && /HANDSHAKE-REQUIRED/.test(c11b.stdout) && /resumed\s+no/.test(c11b.stdout));
    check('EP-C11 the ladder is walked in phases[] order (renderPhases keeps trail order)', (() => { const r = gate.renderPhases(libLab.phases.map((ph) => ({ phase: ph.id, kind: ph.kind, recommended: ph.recommendedMode, ceiling: ph.modeCeiling, acknowledged: 'UNKNOWN', acknowledgedAt: null, outcome: 'SKIP-evidenced' })), { resumed: true }); const idx = libLab.phases.map((ph) => r.indexOf(ph.id + ' ')); return idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1])); })());

    // ── EP-C12 exhaustive decision table ──────────────────────────────────────
    section('EP-C12 exhaustive decision table (3 lanes x 6 valid pairs x 4 lastAck x answered)');
    const RANK = { MANUAL: 0, ACCEPT_EDITS: 1, AUTO: 2 };
    const PAIRS = [['MANUAL', 'MANUAL'], ['MANUAL', 'ACCEPT_EDITS'], ['ACCEPT_EDITS', 'ACCEPT_EDITS'], ['MANUAL', 'AUTO'], ['ACCEPT_EDITS', 'AUTO'], ['AUTO', 'AUTO']];
    // QA-side mirror of ULTRAPLAN r3 §6 rows 1..6 (independent of the implementation)
    function expect(lane, rec, ceil, ack, answered) {
      if (RANK[rec] > RANK[ceil]) return 'INVALID-PHASE';
      if (lane === 'MAIN' && ack === 'AUTO') return 'STOP-before-write';
      if (ack === 'UNKNOWN') return 'HANDSHAKE-REQUIRED';
      if (RANK[ack] > RANK[ceil]) return 'STOP-before-write';
      if (RANK[rec] > RANK[ack] && !answered) return 'STOP-request-MODE-literal';
      return 'CONTINUE:' + (RANK[ack] === RANK[rec] ? 'as-recommended' : (RANK[ack] < RANK[rec] ? 'stricter-than-recommended' : 'looser-than-recommended'));
    }
    let rows = 0, bad = 0;
    for (const lane of ['MAIN', 'LAB', 'COWORK']) for (const [rec, ceil] of PAIRS) for (const ack of ALL_ACKS) for (const answered of [false, true]) {
      rows += 1;
      const d = gate.decide({ lane, phase: { id: 'P', kind: 'IMPLEMENT', recommendedMode: rec, modeCeiling: ceil, entryGate: 'NONE', writes: [] }, lastAck: ack, answered });
      const got = d.action === 'CONTINUE' ? 'CONTINUE:' + d.outcome : d.action;
      if (got !== expect(lane, rec, ceil, ack, answered)) { bad += 1; console.log('  row ' + [lane, rec, ceil, ack, answered].join('/') + ' expected ' + expect(lane, rec, ceil, ack, answered) + ' got ' + got); }
    }
    check('EP-C12 ' + rows + ' rows agree with the §6 mirror (' + bad + ' disagree)', rows === 144 && bad === 0);
    const lit = [
      ['MAIN', 'MANUAL', 'MANUAL', 'UNKNOWN', false, 'HANDSHAKE-REQUIRED'],
      ['MAIN', 'MANUAL', 'MANUAL', 'MANUAL', false, 'CONTINUE:as-recommended'],
      ['MAIN', 'MANUAL', 'MANUAL', 'ACCEPT_EDITS', true, 'STOP-before-write'],
      ['MAIN', 'ACCEPT_EDITS', 'ACCEPT_EDITS', 'MANUAL', false, 'STOP-request-MODE-literal'],
      ['MAIN', 'ACCEPT_EDITS', 'ACCEPT_EDITS', 'MANUAL', true, 'CONTINUE:stricter-than-recommended'],
      ['MAIN', 'ACCEPT_EDITS', 'ACCEPT_EDITS', 'AUTO', true, 'STOP-before-write'],
      ['LAB', 'AUTO', 'AUTO', 'UNKNOWN', true, 'HANDSHAKE-REQUIRED'],
      ['LAB', 'AUTO', 'AUTO', 'AUTO', false, 'CONTINUE:as-recommended'],
      ['LAB', 'MANUAL', 'MANUAL', 'AUTO', true, 'STOP-before-write'],
      ['COWORK', 'ACCEPT_EDITS', 'ACCEPT_EDITS', 'ACCEPT_EDITS', false, 'CONTINUE:as-recommended'],
      ['COWORK', 'MANUAL', 'MANUAL', 'ACCEPT_EDITS', false, 'STOP-before-write'],
      ['LAB', 'MANUAL', 'AUTO', 'ACCEPT_EDITS', false, 'CONTINUE:looser-than-recommended']
    ];
    for (const [lane, rec, ceil, ack, answered, want] of lit) {
      const d = gate.decide({ lane, phase: { id: 'P', kind: 'IMPLEMENT', recommendedMode: rec, modeCeiling: ceil, entryGate: 'NONE', writes: [] }, lastAck: ack, answered });
      const got = d.action === 'CONTINUE' ? 'CONTINUE:' + d.outcome : d.action;
      check('EP-C12 literal ' + [lane, rec + '/' + ceil, ack, 'answered=' + answered].join(' ') + ' -> ' + want, got === want);
    }
    check('EP-C12 HANDSHAKE-REQUIRED names the literal to request (recommended mode)', /MODE ACCEPT_EDITS/.test(gate.decide({ lane: 'LAB', phase: BUILD, lastAck: 'UNKNOWN', answered: false }).request || ''));
    check('EP-C12 decide never returns an action outside the vocabulary', ['CONTINUE', 'HANDSHAKE-REQUIRED', 'STOP-request-MODE-literal', 'STOP-before-write', 'INVALID-PHASE'].includes(gate.decide({ lane: 'LAB', phase: BUILD, lastAck: 'AUTO', answered: true }).action));

    // ── EP-C13 scope resolution (D-16) ────────────────────────────────────────
    section('EP-C13 scope resolution');
    const taskLX2 = gate.findTask(planA, 'LX-2');
    const wt = path.join(cwdScratch, 'portfolio-tracker-test-lab');
    const s1 = gate.resolveScope({ plan: planA, task: taskLX2, profile: b.profile, phase: BUILD, claimDir: 'claims/LX-2', worktreePath: wt });
    check('EP-C13 {TASK_ID} + <worktree> substituted in BUILD writes', s1.errors.length === 0 && s1.writes.length === 1 && s1.writes[0].resolved === wt + '/lab-LX-2/**');
    check('EP-C13 readOnly <pinnedRef> -> plan.repoRef', s1.readOnly.some((x) => x === 'git show ' + planA.repoRef + ':**'));
    check('EP-C13 pinnedRef PLAN_REPO_REF -> plan.repoRef', s1.pinnedRef === planA.repoRef);
    const s2 = gate.resolveScope({ plan: planA, task: taskLX2, profile: b.profile, phase: CLOSE, claimDir: 'claims/LX-2', worktreePath: wt });
    check('EP-C13 TERMINAL claims/{TASK_ID}/claim.json -> claims/LX-2/claim.json (legacy namespace, default)', s2.writes.length === 1 && s2.writes[0].resolved === 'claims/LX-2/claim.json');
    const s3 = gate.resolveScope({ plan: planA, task: taskLX2, profile: b.profile, phase: CLOSE, claimDir: 'arc-claims/ARC-A/LX-2', worktreePath: wt });
    check('EP-C13 the logical claim name resolves into the given claim dir (structural, ARC-shaped path) -> arc-claims/ARC-A/LX-2/claim.json', s3.errors.length === 0 && s3.writes[0].resolved === 'arc-claims/ARC-A/LX-2/claim.json');
    check('EP-C13 V1 allowlist = own claim.json + own holder.json per declared class', s2.allowlist.includes('claims/LX-2/claim.json') && s2.allowlist.length === 1);
    const taskG1 = gate.findTask(planA, 'G1-CLOCK-SEAM');
    const bG1 = gate.bindProfile(planA, 'G1-CLOCK-SEAM');
    const s4 = gate.resolveScope({ plan: planA, task: taskG1, profile: bG1.profile, phase: bG1.profile.phases[1], claimDir: 'claims/G1-CLOCK-SEAM', worktreePath: cwdScratch });
    check('EP-C13 G1 IMPLEMENT under MAIN-CODE-SLICE: netlify/functions/** locked out (CODE:netlify-functions not held), index.html + qa/** kept', s4.lockouts.some((l) => l.surface === 'netlify/functions/**' && l.class === 'CODE:netlify-functions') && s4.writes.map((w) => w.resolved).join(',') === 'index.html,qa/**');
    check('EP-C13 G1 allowlist names mutex/CODE__index-html/holder.json', s4.allowlist.includes('mutex/CODE__index-html/holder.json') && s4.allowlist.includes('claims/G1-CLOCK-SEAM/claim.json'));
    const s5 = gate.resolveScope({ plan: planA, task: taskLX2, profile: b.profile, phase: BUILD, claimDir: 'claims/LX-2', worktreePath: null });
    check('EP-C13 LAB profile without --worktree-path -> worktree-unresolved error', s5.errors.some((x) => /worktree-unresolved/.test(x)));
    const taskOwner = gate.findTask(planA, 'HS2-E2-SNAPSHOT');
    const bOwner = gate.bindProfile(planA, 'HS2-E2-SNAPSHOT');
    const s6 = gate.resolveScope({ plan: planA, task: taskOwner, profile: bOwner.profile, phase: bOwner.profile.phases[0], claimDir: 'claims/HS2-E2-SNAPSHOT', worktreePath: null });
    check('EP-C13 scope.worktree none needs no path', s6.errors.length === 0 && s6.worktree.name === 'none');
    for (const bad1 of ['claims/OTHER', '../claims/LX-2', '/abs/claims/LX-2', 'claims/LX-2/', 'claims//LX-2']) {
      const s = gate.resolveScope({ plan: planA, task: taskLX2, profile: b.profile, phase: CLOSE, claimDir: bad1, worktreePath: wt });
      check('EP-C13 claimDir ' + JSON.stringify(bad1) + ' rejected (must be relative, clean, ending in /LX-2)', s.errors.some((x) => /claim-dir/.test(x)));
    }
    const c13 = runGate(['--plan', planAFile, '--task', 'G1-CLOCK-SEAM', '--scope', '--phase', 'IMPLEMENT', '--worktree-path', cwdScratch], cwdScratch);
    check('EP-C13 CLI --scope prints write scope with the lock-out and the V1 allowlist', c13.status === 0 && /lock-out/.test(c13.stdout) && /netlify\/functions\/\*\*/.test(c13.stdout) && /mutex\/CODE__index-html\/holder\.json/.test(c13.stdout) && /pinnedRef\s+7b54b39d13ef260919b58e3a1c5afd7f8e65c74b/.test(c13.stdout));
    const c13b = runGate(['--plan', planAFile, '--task', 'LX-2', '--scope', '--phase', 'CLOSE', '--claim-dir', 'arc-claims/ARC-A/LX-2', '--worktree-path', wt], cwdScratch);
    check('EP-C13 CLI --scope --claim-dir (ARC-shaped, structural only) resolves the TERMINAL write', c13b.status === 0 && /arc-claims\/ARC-A\/LX-2\/claim\.json/.test(c13b.stdout));
    check('EP-C13 CLI --scope LAB without --worktree-path -> exit 3 worktree-unresolved', (() => { const r = runGate(['--plan', planAFile, '--task', 'LX-2', '--scope', '--phase', 'BUILD'], cwdScratch); return r.status === 3 && /worktree-unresolved/.test(r.out); })());
    check('EP-C13 CLI --scope bad --claim-dir -> exit 3', runGate(['--plan', planAFile, '--task', 'LX-2', '--scope', '--phase', 'CLOSE', '--claim-dir', 'claims/OTHER', '--worktree-path', wt], cwdScratch).status === 3);

    // ── EP-C14 zero writes ────────────────────────────────────────────────────
    section('EP-C14 phase-gate performs zero writes');
    const rtCopy = tmp('live-copy');
    if (fs.existsSync(liveRuntime)) copyTree(liveRuntime, rtCopy); else { for (const d of ['plans', 'claims', 'mutex']) fs.mkdirSync(path.join(rtCopy, d), { recursive: true }); }
    const copyPlan = writePlan(rtCopy, Object.assign(clone(planA), { planId: 'fixture-pc-copy-r1' }));
    const hBefore = treeHash(rtCopy);
    const cwdBefore = treeHash(cwdScratch);
    const runs = [
      ['--plan', copyPlan, '--task', 'LX-2', '--ladder'],
      ['--plan', copyPlan, '--task', 'G1-CLOCK-SEAM', '--ladder'],
      ['--plan', copyPlan, '--task', 'LX-2', '--phase', 'BUILD', '--last-ack', 'UNKNOWN', '--worktree-path', wt],
      ['--plan', copyPlan, '--task', 'LX-2', '--phase', 'RUN', '--last-ack', 'AUTO', '--worktree-path', wt],
      ['--plan', copyPlan, '--task', 'LX-2', '--phase', 'CLOSE', '--last-ack', 'AUTO', '--worktree-path', wt],
      ['--plan', copyPlan, '--task', 'LX-2', '--scope', '--phase', 'BUILD', '--worktree-path', wt],
      ['--plan', copyPlan, '--task', 'NOPE', '--ladder'],
      ['--plan', copyPlan, '--task', 'LX-2', '--scope', '--phase', 'BUILD']
    ];
    const codes = runs.map((a) => runGate(a, cwdScratch).status);
    check('EP-C14 every CLI mode ran (exit codes ' + codes.join(',') + ' within {0,2,3,4})', codes.every((c) => [0, 2, 3, 4].includes(c)));
    check('EP-C14 runtime copy tree hash unchanged after every CLI mode', treeHash(rtCopy) === hBefore);
    check('EP-C14 cwd tree unchanged (no stray output files)', treeHash(cwdScratch) === cwdBefore);
    check('EP-C14 mutex/ in the copy still empty', fs.readdirSync(path.join(rtCopy, 'mutex')).length === 0);

    // ── EP-C15 ladder / grant / lock-out print (K7, A-V5) ─────────────────────
    section('EP-C15 ladder print for authorize (single renderer)');
    const ladG1 = runGate(['--plan', planAFile, '--task', 'G1-CLOCK-SEAM', '--ladder'], cwdScratch);
    check('EP-C15 G1 --ladder exit 0 and prints lib.renderLadder verbatim', ladG1.status === 0 && ladG1.stdout.indexOf(lib.renderLadder(libMain)) !== -1);
    check('EP-C15 G1 --ladder prints profile id, version, 64-hex libraryHash, W-V10 verified', /profile\s+MAIN-CODE-SLICE v1/.test(ladG1.stdout) && /libraryHash\s+[a-f0-9]{64}/.test(ladG1.stdout) && /W-V10 verified/.test(ladG1.stdout));
    check('EP-C15 G1 --ladder prints the lock-out line', /lock-out/.test(ladG1.stdout) && /netlify\/functions\/\*\*/.test(ladG1.stdout) && /CODE:netlify-functions not held/.test(ladG1.stdout));
    check('EP-C15 G1 --ladder prints lane / entryMode / requiresOwnerGo and the claim dir', /lane\s+MAIN/.test(ladG1.stdout) && /entryMode\s+PLAN/.test(ladG1.stdout) && /requiresOwnerGo\s+true/.test(ladG1.stdout) && /claims\/G1-CLOCK-SEAM/.test(ladG1.stdout));
    check('EP-C15 G1 --ladder: per-phase rows with gate and writes', /PLAN\s+PLAN\s+M\/M\s+gate AUTHORIZED_JSON/.test(ladG1.stdout) && /CLOSE\s+TERMINAL\s+M\/M/.test(ladG1.stdout));
    check('EP-C15 G1 --ladder: no grant -> "grant none"', /grant\s+none/.test(ladG1.stdout));
    const bounded = resolved((p) => { p.tasks.find((t) => t.id === 'G1-CLOCK-SEAM').executionProfile = 'MAIN-CODE-SLICE-BOUNDED'; });
    const boundedFile = writePlan(rtA, Object.assign(bounded, { planId: 'fixture-pc-bounded-r1' }));
    const ladB = runGate(['--plan', boundedFile, '--task', 'G1-CLOCK-SEAM', '--ladder'], cwdScratch);
    check('EP-C15 bounded fixture --ladder prints the grant line (IMPLEMENT -> ACCEPT_EDITS paths index.html mutex CODE:index-html, requiresOwnerGo true)', ladB.status === 0 && /grant\s+IMPLEMENT -> ACCEPT_EDITS paths index\.html mutex CODE:index-html \(requiresOwnerGo true\)/.test(ladB.stdout));
    check('EP-C15 --ladder never prints "mode changed" and carries boundaries inside (none)', !/mode changed/i.test(ladG1.stdout) && /inside:\s+\(none\)/.test(ladG1.stdout));
    const ladOwner = runGate(['--plan', planAFile, '--task', 'HS2-E2-SNAPSHOT', '--ladder'], cwdScratch);
    check('EP-C15 OWNER task --ladder renders (informational; not workable)', ladOwner.status === 0 && /OWNER-MANUAL/.test(ladOwner.stdout) && /not workable/i.test(ladOwner.stdout));

    // ── EP-C16 entry gate (R-11) ──────────────────────────────────────────────
    section('EP-C16 entry gate AUTHORIZED_JSON');
    const g1 = runGate(['--plan', planAFile, '--task', 'G1-CLOCK-SEAM', '--phase', 'PLAN', '--last-ack', 'MANUAL', '--worktree-path', cwdScratch], cwdScratch);
    check('EP-C16 G1 PLAN (AUTHORIZED_JSON) without --resumed -> exit 2 entry-gate-unsatisfied', g1.status === 2 && /entry-gate-unsatisfied/.test(g1.stdout) && /--resume/.test(g1.stdout));
    const g2 = runGate(['--plan', planAFile, '--task', 'G1-CLOCK-SEAM', '--phase', 'PLAN', '--last-ack', 'UNKNOWN', '--resumed', '--worktree-path', cwdScratch], cwdScratch);
    check('EP-C16 G1 PLAN with --resumed -> gate satisfied by the resume preconditions; HANDSHAKE-REQUIRED', g2.status === 2 && /entry gate\s+AUTHORIZED_JSON \(satisfied by the --resume preconditions R1-R5\)/.test(g2.stdout) && /HANDSHAKE-REQUIRED/.test(g2.stdout));
    const g3 = runGate(['--plan', planAFile, '--task', 'G1-CLOCK-SEAM', '--phase', 'PLAN', '--last-ack', 'MANUAL', '--resumed', '--worktree-path', cwdScratch], cwdScratch);
    check('EP-C16 G1 PLAN --resumed --last-ack MANUAL -> CONTINUE as-recommended', g3.status === 0 && /CONTINUE/.test(g3.stdout) && /as-recommended/.test(g3.stdout));
    const g4 = runGate(['--plan', planAFile, '--task', 'LX-2', '--phase', 'BUILD', '--last-ack', 'ACCEPT_EDITS', '--worktree-path', cwdScratch], cwdScratch);
    check('EP-C16 LX-2 BUILD (gate NONE) needs no resume -> CONTINUE', g4.status === 0 && /entry gate\s+NONE/.test(g4.stdout));
    check('EP-C16 gate check precedes the mode decision (AUTHORIZED_JSON + lastAck AUTO without --resumed -> entry-gate-unsatisfied, not main-never-auto)', /entry-gate-unsatisfied/.test(runGate(['--plan', planAFile, '--task', 'G1-CLOCK-SEAM', '--phase', 'PLAN', '--last-ack', 'AUTO', '--worktree-path', cwdScratch], cwdScratch).stdout));
  }

  // ── docs / wiring (run regardless; RED until the B2 edits land) ─────────────
  section('docs + wiring');
  const doc = (k) => (fs.existsSync(abs(REL.docs[k])) ? stripCR(readText(REL.docs[k])) : '');
  const ws = doc('workerSkill');
  check('docs arc-worker/SKILL.md allowed-tools includes Edit (D-17)', /^allowed-tools:.*\bEdit\b/m.test(ws));
  check('docs arc-worker/SKILL.md names phase-gate.js, PHASE ENTRY, the MODE literal and the three flags', /phase-gate\.js/.test(ws) && /PHASE ENTRY/.test(ws) && /MODE MANUAL/.test(ws) && /--ladder/.test(ws) && /--phase/.test(ws) && /--scope/.test(ws));
  check('docs arc-worker/SKILL.md: binding step before CLAIM (W-V10), IDLE on binding failure, BLOCKED on resume', /W-V10/.test(ws) && /profile-binding-missing/.test(ws) && /profile-hash-mismatch/.test(ws) && /BLOCKED/.test(ws));
  check('docs arc-worker/SKILL.md: scope STOP scope-expansion, legacy snapshot path, never changes the mode', /scope-expansion/.test(ws) && /legacy snapshot/.test(ws) && /never changes the/i.test(ws));
  check('docs arc-worker/SKILL.md: claim directory written claim-root-agnostic', /claim directory per `runtime-contract\.md` (section|§) ?2/.test(ws));
  check('docs arc-worker/SKILL.md: write allowlist unchanged (two shapes)', /<ROOT>\/claims\/<own TASK-ID>\/claim\.json/.test(ws) && /<ROOT>\/mutex\/<own declared class>\/holder\.json/.test(ws));
  check('docs arc-worker/SKILL.md: resume resets lastAck to UNKNOWN', /UNKNOWN/.test(ws) && /prior acknowledgements not carried/.test(ws));
  const cp = doc('claimProtocol');
  check('docs claim-protocol.md: phase-gate --ladder / --phase / --scope calls, worktree resolution (bash), tools rule (D-17)', /phase-gate\.js/.test(cp) && /--ladder/.test(cp) && /--phase/.test(cp) && /--scope/.test(cp) && /git worktree list/.test(cp) && /allowed-tools/.test(cp) && /tools\.forbidden/.test(cp));
  check('docs claim-protocol.md: Never += continue past a STOP action, print mode changed, read the library', /mode changed/.test(cp) && /library/.test(cp));
  const rc = doc('runtimeContract');
  check('docs runtime-contract.md: new section 5.2 profile consumption', /^## 5\.2/m.test(rc) && /executionProfiles/.test(rc) && /W-V10/.test(rc));
  for (const row of ['profile-binding-missing', 'profile-hash-mismatch', 'mode-exceeds-ceiling', 'unmapped-harness-mode', 'automation-increase-needed', 'entry-gate-unsatisfied', 'scope-expansion']) check('docs runtime-contract.md section 7 row ' + row, new RegExp('`' + row + '`').test(rc));
  check('docs runtime-contract.md section 7 carries no target-surface-changed row (deferred by owner ruling 2026-08-22)', !/`target-surface-changed`/.test(rc));
  // B4-owned sections (§2 / §3 / §5.1 / §6): structural presence + the contract lines P-C relies on
  // (R-B4-1, 2026-08-22 - the former byte-identical-to-HEAD pins proved B2's scope, now committed).
  for (const [label, re] of [['2 Layout', /^## 2\. Layout/], ['3 Mutex registry', /^## 3\. Mutex registry/], ['5.1 Dependency resolution', /^## 5\.1 Dependency resolution/], ['6 Worker write allowlist', /^## 6\. Worker write allowlist/]]) {
    check('docs runtime-contract.md section ' + label + ' present (B4/B6-owned surface)', sectionOf(rc, re) !== null);
  }
  check('docs runtime-contract.md section 5.1 keeps "planId is NOT consulted" (own claim = authority; dependency = evidence)', /planId.{0,20}NOT consulted/.test(sectionOf(rc, /^## 5\.1 Dependency resolution/) || ''));
  check('docs runtime-contract.md section 6 still names the legacy write shapes claims/<own TASK-ID>/claim.json + mutex/<own declared class>/holder.json', /<ROOT>\/claims\/<own TASK-ID>\/claim\.json/.test(sectionOf(rc, /^## 6\. Worker write allowlist/) || '') && /<ROOT>\/mutex\/<own declared class>\/holder\.json/.test(sectionOf(rc, /^## 6\. Worker write allowlist/) || ''));
  const ct = doc('contract');
  check('docs execution-profile.md header no longer says P-B/P-C not implemented', !/P-B[^\n]*not implemented/.test(ct) && !/P-C[^\n]*not implemented/.test(ct) && !/no worker reads a profile yet/.test(ct));
  check('docs execution-profile.md states P-C implemented in B2 and names phase-gate.js', /implemented in B2/.test(ct) && /phase-gate\.js/.test(ct));
  check('docs execution-profile.md section 1 re-checked mapping manual / acceptEdits / auto + unmapped plan / dontAsk / bypassPermissions (R-7)', /`manual`/.test(ct) && /`acceptEdits`/.test(ct) && /`auto`/.test(ct) && /bypassPermissions/.test(ct) && /dontAsk/.test(ct) && /UNMAPPED|unmapped/.test(ct));
  check('docs execution-profile.md section 5 decision rows 1-6 + literal rules + restart/resume', /INVALID-PHASE/.test(ct) && /HANDSHAKE-REQUIRED/.test(ct) && /STOP-request-MODE-literal/.test(ct) && /STOP-before-write/.test(ct) && /prior acknowledgements not carried/.test(ct) && /SKIP-evidenced/.test(ct));
  check('docs execution-profile.md harness-signal re-verification recorded (no machine-readable API; P-A observation not re-observed; R-8 no toggle)', /NOT MACHINE-VERIFIABLE/.test(ct) && /not re-observed/.test(ct) && /2\.1\.239/.test(ct));
  check('docs execution-profile.md section 7 names the P-C QA file and phase-gate', /arc_worker_handshake_offline\.js/.test(ct));
  const wr = doc('workerReport');
  check('docs worker-report.md: profile, claim root, resumed lines and PHASES block with the K6 columns', /profile/.test(wr) && /claim root/.test(wr) && /resumed/.test(wr) && /PHASES/.test(wr) && /acknowledged/.test(wr) && /outcome/.test(wr));
  check('docs worker-report.md: never "mode changed"; acknowledgement quoted with timestamp', !/mode changed/i.test(wr) && /operator acknowledged/.test(wr));
  const as = doc('authorizeSkill');
  check('docs arc-authorize/SKILL.md: A-V5 + phase-gate.js --ladder (single renderer) + legacy "profile none"', /A-V5/.test(as) && /phase-gate\.js/.test(as) && /--ladder/.test(as) && /profile none \(legacy snapshot\)/.test(as));
  check('docs arc-authorize/SKILL.md: A-V5 refusal row', /A-V5 REFUSED/.test(as));
  const ar = doc('authorizeReport');
  check('docs authorize-report.md: PHASE LADDER section with grant + lock-out lines', /PHASE LADDER/.test(ar) && /grant/.test(ar) && /lock-out/.test(ar));
  check('docs execution-profiles/README.md status says P-C implemented in B2 (R-12)', /P-C[^\n]*implemented in B2/.test(doc('readme')) && !/P-C[^\n]*not implemented/.test(doc('readme')));
  check('wiring run-offline.js registers qa/arc_worker_handshake_offline.js', /'qa\/arc_worker_handshake_offline\.js'/.test(doc('runner')));
  check('wiring arc_execution_profiles_offline.js EP-V15 worker half flipped (workerActive, no HEAD-identical assert)', /workerActive/.test(doc('epQa')) && !/workerInactive/.test(doc('epQa')) && !/byte-identical to HEAD \(P-C inactive\)/.test(doc('epQa')));
  check('wiring arc_publish_profiles_offline.js B1 pre-P-C asserts flipped (R-1)', !/wiring no B2 artifact/.test(doc('pbQa')) && /phase-gate\.js/.test(doc('pbQa')));
  // ── B6 (P-E execution side): the B2 surfaces this suite owns gained the namespace selector ──
  check('docs B6 arc-worker/SKILL.md: --arc <ARC-ID> invocation and the ARC write-allowlist shape alongside the legacy shapes (never replacing them)',
    /--arc <ARC-ID>/.test(ws) && /<ROOT>\/arc-claims\/<ARC-ID>\/<own TASK-ID>\/claim\.json/.test(ws));
  check('docs B6 arc-worker/SKILL.md: W-V13 / W-V14 and the wrong-`--arc` resume as a STOPPED outcome, not BLOCKED', /W-V13/.test(ws) && /W-V14/.test(ws) && /STOPPED/.test(ws));
  check('docs B6 claim-protocol.md: namespace selection block with both roots, and no fallback', /arc-claims\/\$ARC/.test(cp) && /plans\/arcs\/\$ARC\/current\.json/.test(cp) && /never/i.test(cp));
  check('docs B6 claim-protocol.md still passes a resolved --claim-dir to phase-gate (single renderer, K7)', /--claim-dir/.test(cp));
  check('docs B6 arc-authorize/SKILL.md: --arc selector and A-V6, legacy-only without the flag', /--arc <ARC-ID>/.test(as) && /A-V6/.test(as) && /arc-claims/.test(as));
  check('docs B6 runtime-contract.md section 7 carries the six new ARC rows', ['arc-not-published', 'arc-retired', 'pointer-arc-mismatch', 'claim-arc-mismatch', 'arc-claims-container-missing', 'plan-not-current-for-arc'].every((r) => new RegExp('`' + r + '`').test(rc)));
  check('wiring run-offline.js registers the B6 runtime-ops suite qa/arc_runtime_ops_offline.js', /'qa\/arc_runtime_ops_offline\.js'/.test(doc('runner')));
  // ── scope proofs: forbidden files byte-identical to HEAD ───────────────────
  section('scope: forbidden files unchanged');
  for (const f of REL.forbidden) {
    const head = gitShow(f);
    check('scope unchanged vs HEAD: ' + f, head !== null && fs.existsSync(abs(f)) && sha256(stripCR(readText(f))) === sha256(head));
  }
  const ih = gitShow('index.html');
  check('scope unchanged vs HEAD: index.html', ih !== null && sha256(stripCR(readText('index.html'))) === sha256(ih));
  if (liveBefore !== null) check('live runtime tree hash unchanged by this suite', treeHash(liveRuntime) === liveBefore);
} finally {
  cleanup();
}

console.log('\n' + (failed === 0 ? 'ARC WORKER HANDSHAKE (P-C): PASS (' + total + ' asserts)' : 'ARC WORKER HANDSHAKE (P-C): FAIL (' + failed + ' of ' + total + ' asserts failed)'));
assert.strictEqual(failed, 0, failures.slice(0, 12).join(' | '));
