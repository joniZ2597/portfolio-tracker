'use strict';

/*
 * qa/arc_publish_profiles_offline.js
 *
 * Execution Profile V1.2 — Increment P-B (publisher resolution + embedding) executable
 * contract: EP-B0 … EP-B15 of the Multi-ARC V1 ULTRAPLAN r3 (§5.2) plus the doc greps.
 * Pure Node, no network, no browser, no runtime write. Reads only:
 *   - .claude/skills/arc-publish-plan/scripts/lib/profile-contract.js   (the B1 library)
 *   - .claude/skills/arc-publish-plan/scripts/resolve-profiles.js       (the B1 CLI, spawned)
 *   - .claude/skills/arc-publish-plan/references/execution-profiles/*.json (committed library)
 *   - .claude/skills/**\/SKILL.md frontmatter (P-V26)
 *   - the publisher docs (greps) and, read-only, the live v2/v3 snapshots when present
 * Every temp tree lives under os.tmpdir() and is removed in `finally`.
 *
 * Rule wording follows the owner's ratified text of 2026-08-22 for P-V23(d) and P-V24.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REL = {
  lib: '.claude/skills/arc-publish-plan/scripts/lib/profile-contract.js',
  cli: '.claude/skills/arc-publish-plan/scripts/resolve-profiles.js',
  libDir: '.claude/skills/arc-publish-plan/references/execution-profiles',
  skillsRoot: '.claude/skills',
  v3Plan: '.git/arc-runtime/plans/parallel-arc-v3-2026-08-15/plan.json',
  v2Plan: '.git/arc-runtime/plans/parallel-arc-v2-2026-08-15/plan.json',
  runtime: '.git/arc-runtime',
  docs: {
    skill: '.claude/skills/arc-publish-plan/SKILL.md',
    protocol: '.claude/skills/arc-publish-plan/references/publish-protocol.md',
    validation: '.claude/skills/arc-publish-plan/references/plan-validation.md',
    projection: '.claude/skills/arc-publish-plan/templates/plan-projection.md',
    report: '.claude/skills/arc-publish-plan/templates/publish-report.md',
    readme: '.claude/skills/arc-publish-plan/references/execution-profiles/README.md',
    contract: '.claude/skills/arc-worker/references/execution-profile.md',
    runner: 'qa/run-offline.js'
  }
};
const abs = (p) => path.join(ROOT, p);
const readText = (p) => fs.readFileSync(abs(p), 'utf8');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const clone = (o) => JSON.parse(JSON.stringify(o));

// ── harness ──────────────────────────────────────────────────────────────────
let total = 0, failed = 0;
const failures = [];
function check(name, cond) { total += 1; if (!cond) { failed += 1; failures.push(name); console.log('  FAIL  ' + name); } }
function section(title) { console.log('== ' + title + ' =='); }

const tempDirs = [];
function tmp(label) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-pb-' + label + '-')); tempDirs.push(d); return d; }
function cleanup() { for (const d of tempDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* best effort */ } } }

function treeHash(dir) {
  const entries = [];
  (function walk(d, rel) {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = rel ? rel + '/' + e.name : e.name;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { entries.push('D ' + r); walk(full, r); }
      else entries.push('F ' + r + ' ' + sha256(fs.readFileSync(full)));
    }
  })(dir, '');
  return sha256(entries.sort().join('\n'));
}

function runCli(args, opts) {
  const r = spawnSync(process.execPath, [abs(REL.cli)].concat(args), { encoding: 'utf8', cwd: ROOT });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', out: (r.stdout || '') + (r.stderr || '') };
}

// ── fixtures: the v3-derived 9-row table with an executionProfile column ─────
// Derived from the live parallel-arc-v3-2026-08-15 snapshot (ids, lanes, modes, mutexes,
// dependsOn, literal conditions) + the V1.2 §3.5 profile mapping. The real v3 source and
// snapshot are never edited; this is an inline fixture.
const V3_ROWS = [
  { id: 'HS2-E2-SNAPSHOT', priority: 10, lane: 'OWNER', entryMode: 'DIRECT', requiresOwnerGo: false, mutexes: ['RUNTIME:owner-profile'], dependsOn: [], executionProfile: 'OWNER-MANUAL',
    closeCondition: "A BACKUP export has been taken from the owner's real browser profile and verified to satisfy all five checks: schemaVersion equals 4; the holding count matches the live portfolio; NXSN.TA is present and preserves its ILS costBasis; at least one real USD holding such as NVDA or MRNA preserves both costBasis and costBasisILS; the tickers array is non-empty. The file is stored outside the repo.",
    stopCondition: 'Stop and report immediately if the BACKUP export fails because pt_holdings or pt_tickers contains invalid JSON, because that means corruption is already present. Capture the raw localStorage strings before any further page reload, since an unparseable pt_tickers is silently replaced by the hardcoded 23-symbol seed on the next boot and the audit evidence is then destroyed permanently.' },
  { id: 'G1-CLOCK-SEAM', priority: 30, lane: 'MAIN', entryMode: 'PLAN', requiresOwnerGo: true, mutexes: ['CODE:index-html'], dependsOn: [], executionProfile: 'MAIN-CODE-SLICE',
    closeCondition: 'The injected clock is threaded through both remaining call sites in index.html, namely _pfComputePortfolioReporting at line 8147 and the call inside _pfHoldingPl at line 8282, so that every freshness and staleness evaluation within one packet derives from the single injected clock. The P-3 Phase 9 and P-4A-1 Phase 10 offline suites are green, no money figure changes, and a handoff is written.',
    stopCondition: 'Stop immediately if any P-3 formula result changes, if FX-state semantics drift in any way, if two consecutive attempts at the same step fail, or if the change grows beyond the two named call sites.' },
  { id: 'LX-2', priority: 40, lane: 'LAB', entryMode: 'DIRECT', requiresOwnerGo: false, mutexes: [], dependsOn: [], executionProfile: 'LAB-SANDBOX-STATIC',
    closeCondition: 'The A-3 _pfLiveBatch parity specification and differential harness are complete in the portfolio-tracker-test-lab worktree, built from fixtures only, and a .LAB.md handoff recording the result is registered.',
    stopCondition: 'Stop immediately on any containment breach, on any need for a live provider call, a Netlify deploy, or a gate change, on any read or write of pt_ data, or if the target surface changes mid-task.' },
  { id: 'LX0-REGISTER', priority: 50, lane: 'COWORK', entryMode: 'DIRECT', requiresOwnerGo: false, mutexes: [], dependsOn: [], executionProfile: 'COWORK-REGISTER',
    closeCondition: "The LX-0 Netlify LAB readiness remediation plan is registered as a handoff in .ai-reports/handoffs/, recording the verified findings — LAB site portfoliotrk-test-lab, the missing boi-fx-proxy function, the two armed fund-facts gates on the production context, and the repo's .netlify/state.json pointing at the production site — together with its five proposed actions. Execution of those actions is not started.",
    stopCondition: "Stop immediately if any move is made toward executing LX-0's five actions, toward any Netlify environment or deploy action, or toward any deploy command that lacks an explicit site target." },
  { id: 'LX-3', priority: 60, lane: 'LAB', entryMode: 'DIRECT', requiresOwnerGo: false, mutexes: [], dependsOn: ['LX-2'], executionProfile: 'LAB-SANDBOX-STATIC',
    closeCondition: 'The coverage analyzer and export schema are complete in the portfolio-tracker-test-lab worktree, operating read-only over the already-captured SC-T2b LOCAL.json export artifacts, and a .LAB.md handoff recording the result is registered.',
    stopCondition: 'Stop immediately on any containment breach, on any need for a live provider call or a fresh data-collection run, on any Netlify deploy or gate change, on any read or write of pt_ data, or if the target surface changes mid-task.' },
  { id: 'P4A-BROWSER-QA', priority: 70, lane: 'MAIN', entryMode: 'DIRECT', requiresOwnerGo: true, mutexes: ['CODE:index-html', 'QA:browser-runtime'], dependsOn: [], executionProfile: 'MAIN-BROWSER-QA',
    closeCondition: 'All seven P-4A-1 reconciliation display states are exercised live in a browser against a running build under full pt_ write-set isolation including pt_recon, the stale-comparison path and the real Meitav fixture numbers are verified, and the result is registered as a handoff.',
    stopCondition: "Stop immediately on any new failure class, on any unexpected pt_ byte change, or if the browser session reaches the owner's real portfolio data instead of the isolated fixture state." },
  { id: 'LX-4', priority: 80, lane: 'LAB', entryMode: 'DIRECT', requiresOwnerGo: false, mutexes: [], dependsOn: ['LX-3'], executionProfile: 'LAB-SANDBOX-STATIC',
    closeCondition: 'The missing-data coercion scanner is complete in the portfolio-tracker-test-lab worktree as a static analysis over source, and a .LAB.md handoff recording the result is registered.',
    stopCondition: 'Stop immediately on any containment breach, on any need for a live provider call, a Netlify deploy, or a gate change, on any read or write of pt_ data, or if the target surface changes mid-task.' },
  { id: 'CALL2-TOOLUSE-QA', priority: 90, lane: 'MAIN', entryMode: 'DIRECT', requiresOwnerGo: true, mutexes: ['CODE:index-html', 'QA:browser-runtime', 'RUNTIME:gates', 'EXTERNAL:live-provider'], dependsOn: [], executionProfile: 'MAIN-GATED-LIVE-QA',
    closeCondition: 'The P-5 Call-2 tool-use path is verified end to end with both gates ON, namely PT_ENABLE_P5_CALL2_TOOL_USE on the server and PT_ENABLE_P5_CALL2_TOOL_USE_CLIENT on the client, all four D-5 extraction failure conditions are observed as four separate test cases even though they share the reason string model-output-unparseable, both gates are re-parked OFF at the end of the session, and no pt_ bytes change.',
    stopCondition: 'Stop immediately if either gate is left ON at session end, on any pt_ mutation, on any new failure class, or if any retry, auto-repair, or fallback to the legacy text parser is observed.' },
  { id: 'LX-5', priority: 100, lane: 'LAB', entryMode: 'DIRECT', requiresOwnerGo: false, mutexes: [], dependsOn: ['LX-4'], executionProfile: 'LAB-SANDBOX-STATIC',
    closeCondition: 'The symbol-grammar conformance harness is complete in the portfolio-tracker-test-lab worktree as a static analysis over every persistence-path symbol validator, and a .LAB.md handoff recording the result is registered.',
    stopCondition: 'Stop immediately on any containment breach, on any need for a live provider call, a Netlify deploy, or a gate change, on any read or write of pt_ data, or if the target surface changes mid-task.' }
];
const MUTEX_REGISTRY = ['AUTHORITY:published-plan', 'CODE:index-html', 'CODE:netlify-functions', 'DEPLOY:netlify', 'EXTERNAL:live-provider', 'QA:browser-runtime', 'RUNTIME:gates', 'RUNTIME:owner-profile'];
const EXPECTED_PROFILE_IDS = ['COWORK-REGISTER', 'LAB-SANDBOX-STATIC', 'MAIN-BROWSER-QA', 'MAIN-CODE-SLICE', 'MAIN-GATED-LIVE-QA', 'OWNER-MANUAL'];

function mkPlan(mut) {
  const plan = {
    planId: 'fixture-v3-profiled-r1',
    source: '.ai-reports/handoffs/2026-08-22_fixture-v3-profiled.COWORK.md',
    sourceHash: sha256('fixture-source'),
    repoRef: 'a2fec4ec6985cb7e8417686278bc275db04df053',
    generatedAt: '2026-08-22T00:00:00Z',
    mutexRegistry: MUTEX_REGISTRY.slice(),
    safeParallelSets: [
      { name: 'SET 1', taskIds: ['HS2-E2-SNAPSHOT', 'G1-CLOCK-SEAM', 'LX-2'] },
      { name: 'SET 2', taskIds: ['P4A-BROWSER-QA', 'LX0-REGISTER', 'LX-3'] },
      { name: 'SET 3', taskIds: ['CALL2-TOOLUSE-QA', 'LX-4'] },
      { name: 'SET 4', taskIds: ['LX-5'] }
    ],
    tasks: clone(V3_ROWS)
  };
  if (mut) mut(plan);
  return plan;
}
const task = (plan, id) => plan.tasks.find((t) => t.id === id);

function sourceMarkdown(variant) {
  const head = '# HANDOFF — fixture v3 profiled\n- From: COWORK  As-of: 2026-08-22\n\n## 2. Task table\n\n';
  const cols = '| taskId | priority | lane | entryMode | requiresOwnerGo | mutexes | dependsOn | executionProfile | closeCondition | stopCondition |\n|---|---|---|---|---|---|---|---|---|---|\n';
  const rows = V3_ROWS.map((r) => '| `' + r.id + '` | ' + r.priority + ' | ' + r.lane + ' | ' + r.entryMode + ' | ' + r.requiresOwnerGo + ' | ' + (r.mutexes.length ? r.mutexes.map((m) => '`' + m + '`').join(' · ') : '∅') + ' | ' + (r.dependsOn.length ? r.dependsOn.join(', ') : '—') + ' | `' + r.executionProfile + '` | ' + r.closeCondition + ' | ' + r.stopCondition + ' |').join('\n') + '\n';
  let tail = '\n## 3. Notes\n\nProfiles are referenced by id only; the publisher resolves them.\n';
  if (variant === 'fenced') tail += '\n```json\n{ "executionProfiles": { "LAB-SANDBOX-STATIC": { "profileId": "LAB-SANDBOX-STATIC" } } }\n```\n';
  if (variant === 'table') tail += '\n| executionProfiles | value |\n|---|---|\n| LAB-SANDBOX-STATIC | inline |\n';
  if (variant === 'prose') tail += '\nThe snapshot field executionProfiles is publisher-owned and is never authored here.\n';
  return head + cols + rows + tail;
}

// ── load the B1 library (RED until it exists) ────────────────────────────────
console.log('ARC publish-profile contract (P-B)');
section('EP-B0 library + CLI present');
let lib = null;
try { lib = require(abs(REL.lib)); } catch (e) { check('profile-contract.js present and loads (' + e.message.split('\n')[0] + ')', false); }
check('resolve-profiles.js present', fs.existsSync(abs(REL.cli)));
let library = null;
if (lib) {
  for (const fn of ['validateProfile', 'canonicalize', 'libraryHash', 'planCheck', 'loadLibrary', 'libraryFromObjects', 'resolveProfiles', 'embedProfile', 'deriveLockouts', 'renderLadder', 'readSkillFrontmatter', 'sourceAuthorsProfiles', 'runtimeChecks', 'stripCR', 'sha256']) {
    check('EP-B0 lib exports ' + fn, typeof lib[fn] === 'function');
  }
  check('EP-B0 lib RESERVED_PLAN_IDS includes arcs', Array.isArray(lib.RESERVED_PLAN_IDS) && lib.RESERVED_PLAN_IDS.includes('arcs'));
  check('EP-B0 lib MUTEX_REGISTRY == the eight canonical classes', JSON.stringify(lib.MUTEX_REGISTRY) === JSON.stringify(MUTEX_REGISTRY));
  try { library = lib.loadLibrary(abs(REL.libDir)); } catch (e) { check('EP-B0 loadLibrary throws: ' + e.message, false); }
  if (library) {
    check('EP-B0 library loads with zero errors' + (library.errors.length ? ' - ' + library.errors.map((e) => e.code).join(',') : ''), library.errors.length === 0);
    check('EP-B0 library has the seven canonical profiles', Object.keys(library.profiles).sort().join(',') === 'COWORK-REGISTER,LAB-SANDBOX-STATIC,MAIN-BROWSER-QA,MAIN-CODE-SLICE,MAIN-CODE-SLICE-BOUNDED,MAIN-GATED-LIVE-QA,OWNER-MANUAL');
    for (const id of Object.keys(library.profiles)) {
      const e = library.profiles[id];
      check('EP-B0 ' + id + ' canonical (fileHash == canonicalHash)', e.fileHash === e.canonicalHash);
      check('EP-B0 ' + id + ' carries no libraryHash in the library file', !('libraryHash' in e.obj));
      check('EP-B0 ' + id + ' lib.validateProfile == []', lib.validateProfile(e.obj).length === 0);
      check('EP-B0 ' + id + ' lib.libraryHash == sha256(CR-stripped file)', lib.libraryHash(e.obj) === sha256(lib.stripCR(fs.readFileSync(abs(path.join(REL.libDir, id + '.json')), 'utf8'))));
    }
  }
}

const ready = !!(lib && library && library.errors.length === 0 && fs.existsSync(abs(REL.cli)));
if (!ready) console.log('  (B1 library/CLI not loadable - rule groups EP-B1..B15 skipped; RED)');

const opts = () => ({ library, skillsRoot: abs(REL.skillsRoot) });
const viol = (res, rule) => res.violations.filter((v) => v.rule === rule);
const hasViol = (res, rule, re) => viol(res, rule).some((v) => !re || re.test(v.message));
const tempLib = (profiles) => lib.libraryFromObjects(profiles);
const libObj = (id) => clone(library.profiles[id].obj);

try {
  if (ready) {
    // ── EP-B1/B2 unknown / malformed profile references ─────────────────────
    section('EP-B1/B2 unknown or malformed profile rejected');
    const good = lib.planCheck(mkPlan(), opts());
    check('EP-B1 v3-derived 9-row fixture passes planCheck (' + good.violations.map((v) => v.rule + ':' + v.message).join(' | ') + ')', good.ok === true && good.violations.length === 0);
    check('EP-B1 9/9 rows resolve; six distinct profiles used', good.profilesUsed.length === 6 && JSON.stringify(good.profilesUsed) === JSON.stringify(EXPECTED_PROFILE_IDS));
    check('EP-B1 NOT-A-PROFILE refused under P-V21', hasViol(lib.planCheck(mkPlan((p) => { task(p, 'LX-2').executionProfile = 'NOT-A-PROFILE'; }), opts()), 'P-V21', /NOT-A-PROFILE/));
    check('EP-B1 lowercase id refused under P-V21 (no case folding)', hasViol(lib.planCheck(mkPlan((p) => { task(p, 'LX-2').executionProfile = 'lab-sandbox-static'; }), opts()), 'P-V21', /lab-sandbox-static/));
    check('EP-B1 case-variant id refused under P-V21', hasViol(lib.planCheck(mkPlan((p) => { task(p, 'LX-2').executionProfile = 'Lab-Sandbox-Static'; }), opts()), 'P-V21'));
    check('EP-B1 inline object refused under P-V21', hasViol(lib.planCheck(mkPlan((p) => { task(p, 'LX-2').executionProfile = { profileId: 'LAB-SANDBOX-STATIC' }; }), opts()), 'P-V21'));
    check('EP-B1 profile-less row refused under P-V21 (ruling 1: no legacy exemption)', hasViol(lib.planCheck(mkPlan((p) => { delete task(p, 'LX-5').executionProfile; }), opts()), 'P-V21', /LX-5/));
    check('EP-B1 refusal names the task', viol(lib.planCheck(mkPlan((p) => { delete task(p, 'LX-5').executionProfile; }), opts()), 'P-V21').every((v) => v.task === 'LX-5'));
    const brokenDir = tmp('brokenlib');
    for (const id of Object.keys(library.profiles)) fs.writeFileSync(path.join(brokenDir, id + '.json'), lib.canonicalize(library.profiles[id].obj));
    fs.writeFileSync(path.join(brokenDir, 'LAB-SANDBOX-STATIC.json'), '{"profileId": "LAB-SANDBOX-STATIC", "version": 1, ');
    const brokenLib = lib.loadLibrary(brokenDir);
    check('EP-B2 truncated library JSON reported as a library error', brokenLib.errors.some((e) => /LAB-SANDBOX-STATIC/.test(e.file)));
    check('EP-B2 truncated library file ⇒ P-V21 refusal via planCheck', hasViol(lib.planCheck(mkPlan(), { library: brokenLib, skillsRoot: abs(REL.skillsRoot) }), 'P-V21'));
    const invalidLib = tempLib([Object.assign(libObj('LAB-SANDBOX-STATIC'), { bogus: 1 })]);
    check('EP-B2 schema-invalid library object ⇒ P-V21 (profile does not validate)', hasViol(lib.planCheck(mkPlan(), { library: invalidLib, skillsRoot: abs(REL.skillsRoot) }), 'P-V21', /validate|unknown:bogus/));

    // ── EP-B3 deterministic resolution via the CLI ───────────────────────────
    section('EP-B3 deterministic resolution');
    const io = tmp('io');
    const inPath = path.join(io, 'proposed.json');
    fs.writeFileSync(inPath, JSON.stringify(mkPlan(), null, 2) + '\n');
    const inHashBefore = sha256(fs.readFileSync(inPath));
    const out1 = path.join(io, 'plan-1.json'), out2 = path.join(io, 'plan-2.json');
    const r1 = runCli(['--in', inPath, '--out', out1]);
    const r2 = runCli(['--in', inPath, '--out', out2]);
    check('EP-B3 CLI run 1 exit 0' + (r1.status !== 0 ? ' - ' + r1.out.slice(0, 400) : ''), r1.status === 0);
    check('EP-B3 CLI run 2 exit 0', r2.status === 0);
    const ok12 = r1.status === 0 && r2.status === 0 && fs.existsSync(out1) && fs.existsSync(out2);
    check('EP-B3 two runs ⇒ byte-identical output', ok12 && fs.readFileSync(out1).equals(fs.readFileSync(out2)));
    check('EP-B3 --in file unchanged by a run', sha256(fs.readFileSync(inPath)) === inHashBefore);
    let resolved = null;
    if (ok12) {
      const text = fs.readFileSync(out1, 'utf8');
      resolved = JSON.parse(text);
      check('EP-B3 output is canonical (2-space + trailing LF, no CR)', text === JSON.stringify(resolved, null, 2) + '\n' && text.indexOf('\r') === -1);
      const ids = Object.keys(resolved.executionProfiles || {});
      check('EP-B3 executionProfiles keys sorted, one per distinct id (6)', JSON.stringify(ids) === JSON.stringify(EXPECTED_PROFILE_IDS));
      check('EP-B3 executionProfiles placed before tasks (schema order)', Object.keys(resolved).indexOf('executionProfiles') === Object.keys(resolved).indexOf('tasks') - 1);
      check('EP-B3 embedded key order profileId, version, libraryHash, ...', ids.every((id) => Object.keys(resolved.executionProfiles[id]).slice(0, 3).join(',') === 'profileId,version,libraryHash'));
      check('EP-B3 tasks untouched by resolution (ids, order, executionProfile strings)', JSON.stringify(resolved.tasks) === JSON.stringify(mkPlan().tasks));
      check('EP-B3 generatedAt / repoRef / sourceHash untouched', resolved.generatedAt === '2026-08-22T00:00:00Z' && resolved.repoRef === mkPlan().repoRef && resolved.sourceHash === mkPlan().sourceHash);
      check('EP-B3 stdout carries a RESOLVER line with two 64-hex hashes', /^RESOLVER\s+.*resolve-profiles\.js\s+[a-f0-9]{64}.*profile-contract\.js\s+[a-f0-9]{64}/m.test(r1.stdout));
      check('EP-B3 stdout identical across the two runs except the --out path', r1.stdout.replace(out1, '<OUT>').split('\\').join('/') === r2.stdout.replace(out2, '<OUT>').split('\\').join('/'));
    }
    check('EP-B3 --out exists ⇒ exit 3, not overwritten', (() => { const h = ok12 ? sha256(fs.readFileSync(out1)) : null; const r = runCli(['--in', inPath, '--out', out1]); return r.status === 3 && (!ok12 || sha256(fs.readFileSync(out1)) === h); })());
    check('EP-B3 missing --out ⇒ exit 3 (usage)', runCli(['--in', inPath]).status === 3);
    check('EP-B3 missing --in ⇒ exit 3 (usage)', runCli(['--out', path.join(io, 'x.json')]).status === 3);
    check('EP-B3 unparsable --in ⇒ exit 3, nothing written', (() => { const bad = path.join(io, 'bad.json'); fs.writeFileSync(bad, '{"planId": '); const o = path.join(io, 'bad-out.json'); const r = runCli(['--in', bad, '--out', o]); return r.status === 3 && !fs.existsSync(o); })());
    check('EP-B3 missing --library dir ⇒ exit 3', runCli(['--in', inPath, '--out', path.join(io, 'y.json'), '--library', path.join(io, 'nope')]).status === 3);
    check('EP-B3 refusal ⇒ exit 2 and --out not written', (() => { const bad = path.join(io, 'refuse.json'); fs.writeFileSync(bad, JSON.stringify(mkPlan((p) => { task(p, 'LX-2').executionProfile = 'NOT-A-PROFILE'; }))); const o = path.join(io, 'refuse-out.json'); const r = runCli(['--in', bad, '--out', o]); return r.status === 2 && !fs.existsSync(o) && /P-V21 REFUSED/.test(r.stdout); })());

    // ── EP-B4 libraryHash ────────────────────────────────────────────────────
    section('EP-B4 libraryHash');
    if (resolved) {
      for (const id of Object.keys(resolved.executionProfiles)) {
        const emb = resolved.executionProfiles[id];
        const fileHash = sha256(lib.stripCR(fs.readFileSync(abs(path.join(REL.libDir, id + '.json')), 'utf8')));
        check('EP-B4 ' + id + ' embedded libraryHash == sha256(CR-stripped library file)', emb.libraryHash === fileHash);
        check('EP-B4 ' + id + ' re-derivable from the embedded copy alone (K3)', lib.libraryHash(emb) === emb.libraryHash);
        const copy = clone(emb); delete copy.libraryHash;
        check('EP-B4 ' + id + ' embedded minus libraryHash equals the library object byte-for-byte', lib.canonicalize(copy) === lib.canonicalize(library.profiles[id].obj));
        check('EP-B4 ' + id + ' embedded profile validates after removing libraryHash', lib.validateProfile(copy).length === 0);
      }
      const tampered = clone(resolved.executionProfiles['LAB-SANDBOX-STATIC']);
      tampered.phases[0].exit = tampered.phases[0].exit + '.';
      check('EP-B4 one-byte tamper of an embedded profile changes the re-derived hash', lib.libraryHash(tampered) !== resolved.executionProfiles['LAB-SANDBOX-STATIC'].libraryHash);
    }
    const reindentDir = tmp('reindent');
    for (const id of Object.keys(library.profiles)) fs.writeFileSync(path.join(reindentDir, id + '.json'), lib.canonicalize(library.profiles[id].obj));
    fs.writeFileSync(path.join(reindentDir, 'MAIN-CODE-SLICE.json'), JSON.stringify(library.profiles['MAIN-CODE-SLICE'].obj, null, 4) + '\n');
    const reLib = lib.loadLibrary(reindentDir);
    check('EP-B4 re-indented library file (file hash != canonical hash) reported as a library error', reLib.errors.some((e) => /MAIN-CODE-SLICE/.test(e.file) && /canonical/i.test(e.message)));
    check('EP-B4 re-indented library ⇒ P-V21 refusal', hasViol(lib.planCheck(mkPlan(), { library: reLib, skillsRoot: abs(REL.skillsRoot) }), 'P-V21'));
    const hashed = tmp('hashed');
    for (const id of Object.keys(library.profiles)) fs.writeFileSync(path.join(hashed, id + '.json'), lib.canonicalize(library.profiles[id].obj));
    fs.writeFileSync(path.join(hashed, 'OWNER-MANUAL.json'), lib.canonicalize(Object.assign({ profileId: 'OWNER-MANUAL', version: 1, libraryHash: 'a'.repeat(64) }, library.profiles['OWNER-MANUAL'].obj)));
    check('EP-B4 library file carrying libraryHash rejected', lib.loadLibrary(hashed).errors.some((e) => /OWNER-MANUAL/.test(e.file) && /libraryHash/.test(e.message)));
    check('EP-B4 input already carrying executionProfiles ⇒ P-V21 (authored snapshot field)', hasViol(lib.planCheck(mkPlan((p) => { p.executionProfiles = { 'LAB-SANDBOX-STATIC': libObj('LAB-SANDBOX-STATIC') }; }), opts()), 'P-V21', /executionProfiles/));
    check('EP-B4 CLI refuses an input carrying executionProfiles (exit 2)', (() => { const f = path.join(io, 'authored.json'); fs.writeFileSync(f, JSON.stringify(mkPlan((p) => { p.executionProfiles = {}; }))); return runCli(['--in', f, '--out', path.join(io, 'authored-out.json')]).status === 2; })());

    // ── EP-B5 source cannot author executionProfiles ────────────────────────
    section('EP-B5 source cannot author executionProfiles');
    check('EP-B5 sourceAuthorsProfiles: clean table ⇒ false', lib.sourceAuthorsProfiles(sourceMarkdown('clean')) === false);
    check('EP-B5 sourceAuthorsProfiles: fenced executionProfiles ⇒ true', lib.sourceAuthorsProfiles(sourceMarkdown('fenced')) === true);
    check('EP-B5 sourceAuthorsProfiles: table header executionProfiles ⇒ true', lib.sourceAuthorsProfiles(sourceMarkdown('table')) === true);
    check('EP-B5 sourceAuthorsProfiles: prose mention ⇒ false (no false positive)', lib.sourceAuthorsProfiles(sourceMarkdown('prose')) === false);
    check('EP-B5 planCheck with a fenced source ⇒ P-V21', hasViol(lib.planCheck(mkPlan(), Object.assign(opts(), { sourceText: sourceMarkdown('fenced') })), 'P-V21', /source/));
    check('EP-B5 planCheck with the clean source ⇒ PASS', lib.planCheck(mkPlan(), Object.assign(opts(), { sourceText: sourceMarkdown('clean') })).ok === true);
    const srcDir = tmp('src');
    fs.writeFileSync(path.join(srcDir, 'fenced.md'), sourceMarkdown('fenced'));
    fs.writeFileSync(path.join(srcDir, 'table.md'), sourceMarkdown('table'));
    fs.writeFileSync(path.join(srcDir, 'clean.md'), sourceMarkdown('clean'));
    check('EP-B5 CLI --source fenced ⇒ exit 2', runCli(['--in', inPath, '--out', path.join(io, 's1.json'), '--source', path.join(srcDir, 'fenced.md')]).status === 2);
    check('EP-B5 CLI --source table ⇒ exit 2', runCli(['--in', inPath, '--out', path.join(io, 's2.json'), '--source', path.join(srcDir, 'table.md')]).status === 2);
    check('EP-B5 CLI --source clean ⇒ exit 0', runCli(['--in', inPath, '--out', path.join(io, 's3.json'), '--source', path.join(srcDir, 'clean.md')]).status === 0);

    // ── EP-B6 embedded snapshot validates ───────────────────────────────────
    section('EP-B6 embedded snapshot');
    if (resolved) {
      const again = lib.planCheck(resolved, Object.assign(opts(), { allowEmbedded: true }));
      check('EP-B6 resolved output passes planCheck (embedded copy accepted, hashes verified)', again.ok === true);
      check('EP-B6 resolved output with one tampered embedded hash refused under P-V21', hasViol(lib.planCheck((() => { const p = clone(resolved); p.executionProfiles['OWNER-MANUAL'].libraryHash = 'b'.repeat(64); return p; })(), Object.assign(opts(), { allowEmbedded: true })), 'P-V21', /libraryHash/));
      const rp = lib.resolveProfiles(mkPlan(), library);
      check('EP-B6 lib.resolveProfiles text == CLI output bytes', rp.text === fs.readFileSync(out1, 'utf8'));
      check('EP-B6 lib.resolveProfiles never embeds an unreferenced profile', !('MAIN-CODE-SLICE-BOUNDED' in rp.plan.executionProfiles));
    }
    check('EP-B6 CLI stdout prints every used profile once in PROFILES', (() => { const m = r1.stdout.match(/^PROFILES \((\d+)\)/m); return !!m && m[1] === '6' && EXPECTED_PROFILE_IDS.every((id) => (r1.stdout.match(new RegExp('"profileId": "' + id + '"', 'g')) || []).length === 1); })());
    check('EP-B6 CLI stdout prints per-task ladder lines', /profile\s+LAB-SANDBOX-STATIC\s+phases\s+BUILD A\/A → RUN AUTO\/AUTO → HANDOFF A\/A → CLOSE M\/M/.test(r1.stdout));
    check('EP-B6 CLI stdout prints the G1 lock-out WARN', /P-V25 lock-out WARN: netlify\/functions\/\*\* \(CODE:netlify-functions not held by G1-CLOCK-SEAM\)/.test(r1.stdout));
    check('EP-B6 CLI stdout VALIDATION lists P-V21..P-V26 PASS', ['P-V21', 'P-V22', 'P-V23', 'P-V24', 'P-V25', 'P-V26'].every((r) => new RegExp('^' + r + '\\b.*PASS\\s*$', 'm').test(r1.stdout)));

    // ── EP-B7 legacy snapshots ───────────────────────────────────────────────
    section('EP-B7 legacy snapshots valid without republishing');
    if (fs.existsSync(abs(REL.v3Plan))) {
      const v3 = JSON.parse(readText(REL.v3Plan));
      const legacy = lib.planCheck(v3, Object.assign(opts(), { requireProfiles: false }));
      check('EP-B7 live v3 passes structural rules (requireProfiles false): ' + legacy.violations.map((v) => v.rule).join(','), legacy.ok === true);
      const strict = lib.planCheck(v3, opts());
      check('EP-B7 live v3 under mandatory P-V21 ⇒ 9 refusals (legacy never republished)', viol(strict, 'P-V21').length === 9 && strict.violations.every((v) => v.rule === 'P-V21'));
    } else console.log('  (v3 runtime snapshot absent - legacy checks skipped)');
    if (fs.existsSync(abs(REL.v2Plan))) {
      const v2 = JSON.parse(readText(REL.v2Plan));
      const legacy2 = lib.planCheck(v2, Object.assign(opts(), { requireProfiles: false }));
      check('EP-B7 live v2 structural rules pass except the documented P-V15 pointer defect', legacy2.violations.length > 0 && legacy2.violations.every((v) => v.rule === 'P-V15') && legacy2.violations.some((v) => /per v2 section/.test(v.value)));
    } else console.log('  (v2 runtime snapshot absent - v2 check skipped)');

    // ── EP-B8 / EP-B9 P-V23(b) and P-V23(c) ─────────────────────────────────
    section('EP-B8/B9 P-V23(b) (c)');
    const labOver = libObj('LAB-SANDBOX-STATIC'); labOver.phases[0].recommendedMode = 'AUTO';
    const r8 = lib.planCheck(mkPlan(), { library: tempLib([labOver, libObj('MAIN-CODE-SLICE'), libObj('MAIN-BROWSER-QA'), libObj('MAIN-GATED-LIVE-QA'), libObj('COWORK-REGISTER'), libObj('OWNER-MANUAL')]), skillsRoot: abs(REL.skillsRoot) });
    check('EP-B8 recommended AUTO > ceiling ACCEPT_EDITS refused under P-V23(b) naming task, phase, field, value', viol(r8, 'P-V23').some((v) => /\(b\)/.test(v.message) && v.task === 'LX-2' && v.phase === 'BUILD' && v.field === 'recommendedMode' && v.value === 'AUTO'));
    const labAutoImpl = libObj('LAB-SANDBOX-STATIC'); labAutoImpl.phases[0].recommendedMode = 'AUTO'; labAutoImpl.phases[0].modeCeiling = 'AUTO';
    const r9a = lib.planCheck(mkPlan(), { library: tempLib([labAutoImpl, libObj('MAIN-CODE-SLICE'), libObj('MAIN-BROWSER-QA'), libObj('MAIN-GATED-LIVE-QA'), libObj('COWORK-REGISTER'), libObj('OWNER-MANUAL')]), skillsRoot: abs(REL.skillsRoot) });
    check('EP-B9 AUTO on IMPLEMENT refused under P-V23(c)', viol(r9a, 'P-V23').some((v) => /\(c\)/.test(v.message) && v.phase === 'BUILD'));
    const labAutoAi = libObj('LAB-SANDBOX-STATIC'); labAutoAi.phases[1].writes = ['.ai-reports/handoffs/*.LAB.md'];
    const r9b = lib.planCheck(mkPlan(), { library: tempLib([labAutoAi, libObj('MAIN-CODE-SLICE'), libObj('MAIN-BROWSER-QA'), libObj('MAIN-GATED-LIVE-QA'), libObj('COWORK-REGISTER'), libObj('OWNER-MANUAL')]), skillsRoot: abs(REL.skillsRoot) });
    check('EP-B9 AUTO VERIFY writing outside the sandbox refused under P-V23(c)', viol(r9b, 'P-V23').some((v) => /\(c\)/.test(v.message) && v.phase === 'RUN'));
    const labAutoNet = libObj('LAB-SANDBOX-STATIC'); labAutoNet.capabilities.network = 'public-read';
    const r9c = lib.planCheck(mkPlan(), { library: tempLib([labAutoNet, libObj('MAIN-CODE-SLICE'), libObj('MAIN-BROWSER-QA'), libObj('MAIN-GATED-LIVE-QA'), libObj('COWORK-REGISTER'), libObj('OWNER-MANUAL')]), skillsRoot: abs(REL.skillsRoot) });
    check('EP-B9 AUTO VERIFY with network != none refused under P-V23(c)', viol(r9c, 'P-V23').some((v) => /\(c\)/.test(v.message) && v.phase === 'RUN'));
    const mainAuto = libObj('MAIN-CODE-SLICE'); mainAuto.phases[2].modeCeiling = 'AUTO'; mainAuto.phases[2].recommendedMode = 'AUTO';
    const r9d = lib.planCheck(mkPlan(), { library: tempLib([libObj('LAB-SANDBOX-STATIC'), mainAuto, libObj('MAIN-BROWSER-QA'), libObj('MAIN-GATED-LIVE-QA'), libObj('COWORK-REGISTER'), libObj('OWNER-MANUAL')]), skillsRoot: abs(REL.skillsRoot) });
    check('EP-B9 MAIN AUTO anywhere refused (P-V21 profile invalid and/or P-V23(c))', hasViol(r9d, 'P-V21') || viol(r9d, 'P-V23').some((v) => /\(c\)/.test(v.message)));
    check('EP-B9 LAB RUN AUTO/AUTO (sandbox writes, network none) accepted', good.ok === true);

    // ── EP-B10 boundaries + the ratified MAIN grant boundary (P-V23(d)) ─────
    section('EP-B10 boundaries + MAIN grant boundary');
    const inside = libObj('LAB-SANDBOX-STATIC'); inside.approvalBoundaries.inside = ['git-stage'];
    check('EP-B10 inside non-empty ⇒ refused (P-V21 profile invalid: nothing grantable)', hasViol(lib.planCheck(mkPlan(), { library: tempLib([inside, libObj('MAIN-CODE-SLICE'), libObj('MAIN-BROWSER-QA'), libObj('MAIN-GATED-LIVE-QA'), libObj('COWORK-REGISTER'), libObj('OWNER-MANUAL')]), skillsRoot: abs(REL.skillsRoot) }), 'P-V21', /inside/));
    const sixWith = (mainVariant) => tempLib([libObj('LAB-SANDBOX-STATIC'), mainVariant, libObj('MAIN-BROWSER-QA'), libObj('MAIN-GATED-LIVE-QA'), libObj('COWORK-REGISTER'), libObj('OWNER-MANUAL')]);
    const mainAA = (writes, grant) => { const p = libObj('MAIN-CODE-SLICE'); p.phases[1].modeCeiling = 'ACCEPT_EDITS'; p.phases[1].recommendedMode = 'ACCEPT_EDITS'; p.phases[1].writes = writes; if (grant) { p.phases[1].grant = grant; p.requiresOwnerGo = true; } return p; };
    const d = (p) => viol(lib.planCheck(mkPlan(), { library: sixWith(p), skillsRoot: abs(REL.skillsRoot) }), 'P-V23').filter((v) => /\(d\)/.test(v.message) && v.task === 'G1-CLOCK-SEAM');
    check('EP-B10 MAIN A/A phase with writes [] and no grant ⇒ PASS', d(mainAA([], null)).length === 0);
    check('EP-B10 MAIN A/A phase writing only .ai-reports/** and no grant ⇒ PASS', d(mainAA(['.ai-reports/handoffs/*.MAIN.md'], null)).length === 0);
    check('EP-B10 MAIN A/A phase writing qa/** without grant ⇒ REFUSE (P-V23(d))', d(mainAA(['qa/**'], null)).length === 1);
    check('EP-B10 MAIN A/A phase writing tools/** without grant ⇒ REFUSE (P-V23(d))', d(mainAA(['tools/**'], null)).length === 1);
    check('EP-B10 MAIN A/A phase writing index.html without grant ⇒ REFUSE (P-V23(d))', d(mainAA(['index.html'], null)).length === 1);
    check('EP-B10 MAIN A/A phase writing .ai-reports + qa/** without grant ⇒ REFUSE', d(mainAA(['.ai-reports/handoffs/*.MAIN.md', 'qa/**'], null)).length === 1);
    const okGrant = { toMode: 'ACCEPT_EDITS', paths: ['index.html'], mutexClass: 'CODE:index-html' };
    check('EP-B10 conforming grant on a row holding CODE:index-html + requiresOwnerGo true ⇒ PASS', d(mainAA(['index.html'], okGrant)).length === 0);
    check('EP-B10 conforming grant, row lacking CODE:index-html ⇒ REFUSE', viol(lib.planCheck(mkPlan((p) => { task(p, 'G1-CLOCK-SEAM').mutexes = []; }), { library: sixWith(mainAA(['index.html'], okGrant)), skillsRoot: abs(REL.skillsRoot) }), 'P-V23').some((v) => /\(d\)/.test(v.message) && /CODE:index-html/.test(v.message)));
    check('EP-B10 grant paths not in scope.writes ⇒ REFUSE', (() => { const p = mainAA(['index.html'], { toMode: 'ACCEPT_EDITS', paths: ['services/x.js'], mutexClass: 'CODE:index-html' }); p.scope.writes = ['index.html', '.ai-reports/handoffs/*.MAIN.md']; const r = lib.planCheck(mkPlan(), { library: sixWith(p), skillsRoot: abs(REL.skillsRoot) }); return hasViol(r, 'P-V21') || viol(r, 'P-V23').some((v) => /\(d\)/.test(v.message)); })());
    check('EP-B10 grant on a non-IMPLEMENT phase ⇒ REFUSE', (() => { const p = libObj('MAIN-CODE-SLICE'); p.requiresOwnerGo = true; p.phases[2].grant = okGrant; p.phases[2].writes = ['index.html']; const r = lib.planCheck(mkPlan(), { library: sixWith(p), skillsRoot: abs(REL.skillsRoot) }); return hasViol(r, 'P-V21') || viol(r, 'P-V23').some((v) => /\(d\)/.test(v.message)); })());
    check('EP-B10 grant.mutexClass not CODE:* ⇒ REFUSE', (() => { const p = mainAA(['index.html'], { toMode: 'ACCEPT_EDITS', paths: ['index.html'], mutexClass: 'QA:browser-runtime' }); const r = lib.planCheck(mkPlan(), { library: sixWith(p), skillsRoot: abs(REL.skillsRoot) }); return hasViol(r, 'P-V21') || viol(r, 'P-V23').some((v) => /\(d\)/.test(v.message)); })());
    check('EP-B10 library: every MAIN above-MANUAL phase is [], .ai-reports/**, or the BOUNDED grant', Object.keys(library.profiles).every((id) => { const p = library.profiles[id].obj; if (p.appliesToLane !== 'MAIN') return true; return p.phases.every((ph) => ph.modeCeiling === 'MANUAL' || ph.writes.every((w) => /^\.ai-reports\//.test(w)) || (ph.grant && id === 'MAIN-CODE-SLICE-BOUNDED')); }));
    check('EP-B10 P-V23(e) TERMINAL at ACCEPT_EDITS refused', (() => { const p = libObj('LAB-SANDBOX-STATIC'); p.phases[3].modeCeiling = 'ACCEPT_EDITS'; const r = lib.planCheck(mkPlan(), { library: tempLib([p, libObj('MAIN-CODE-SLICE'), libObj('MAIN-BROWSER-QA'), libObj('MAIN-GATED-LIVE-QA'), libObj('COWORK-REGISTER'), libObj('OWNER-MANUAL')]), skillsRoot: abs(REL.skillsRoot) }); return hasViol(r, 'P-V21') || viol(r, 'P-V23').some((v) => /\(e\)/.test(v.message)); })());
    check('EP-B10 P-V23(a) phase writing .netlify/state.json refused', (() => { const p = libObj('LAB-SANDBOX-STATIC'); p.scope.writes.push('.netlify/state.json'); p.phases[0].writes.push('.netlify/state.json'); const r = lib.planCheck(mkPlan(), { library: tempLib([p, libObj('MAIN-CODE-SLICE'), libObj('MAIN-BROWSER-QA'), libObj('MAIN-GATED-LIVE-QA'), libObj('COWORK-REGISTER'), libObj('OWNER-MANUAL')]), skillsRoot: abs(REL.skillsRoot) }); return viol(r, 'P-V23').some((v) => /\(a\)/.test(v.message)); })());

    // ── EP-B11 P-V24 ratified five clauses ───────────────────────────────────
    section('EP-B11 P-V24 entry-mode agreement (ratified five clauses)');
    const six = () => tempLib(EXPECTED_PROFILE_IDS.map(libObj).concat([libObj('MAIN-CODE-SLICE-BOUNDED')]));
    const p24 = (mut, libv) => viol(lib.planCheck(mkPlan(mut), { library: libv || six(), skillsRoot: abs(REL.skillsRoot) }), 'P-V24');
    check('EP-B11 (1a) entryMode PLAN on LAB-SANDBOX-STATIC (phases[0] BUILD) ⇒ REFUSE', p24((p) => { task(p, 'LX-2').entryMode = 'PLAN'; }).some((v) => /\(1\)/.test(v.message) && v.task === 'LX-2'));
    check('EP-B11 (1b) entryMode DIRECT on MAIN-CODE-SLICE (phases[0] PLAN) ⇒ REFUSE', p24((p) => { task(p, 'G1-CLOCK-SEAM').entryMode = 'DIRECT'; }).some((v) => /\(1\)/.test(v.message) && v.task === 'G1-CLOCK-SEAM'));
    check('EP-B11 (1c) PLAN first phase with ceiling ACCEPT_EDITS ⇒ REFUSE', (() => { const p = libObj('MAIN-CODE-SLICE'); p.phases[0].modeCeiling = 'ACCEPT_EDITS'; p.phases[0].recommendedMode = 'MANUAL'; const l = tempLib([libObj('LAB-SANDBOX-STATIC'), p, libObj('MAIN-BROWSER-QA'), libObj('MAIN-GATED-LIVE-QA'), libObj('COWORK-REGISTER'), libObj('OWNER-MANUAL')]); return p24(null, l).some((v) => /\(1\)/.test(v.message) && v.task === 'G1-CLOCK-SEAM'); })());
    check('EP-B11 (2) requiresOwnerGo true on LAB-SANDBOX-STATIC (phases[0] gate NONE) ⇒ REFUSE', p24((p) => { task(p, 'LX-2').requiresOwnerGo = true; }).some((v) => /\(2\)/.test(v.message) && v.task === 'LX-2'));
    check('EP-B11 (3) requiresOwnerGo false on MAIN-BROWSER-QA (a gated phase exists) ⇒ REFUSE', p24((p) => { task(p, 'P4A-BROWSER-QA').requiresOwnerGo = false; }).some((v) => /\(3\)/.test(v.message) && v.task === 'P4A-BROWSER-QA'));
    check('EP-B11 (4a) AUTHORIZED_JSON on phases[1] only ⇒ REFUSE', (() => { const p = libObj('MAIN-BROWSER-QA'); p.phases[0].entryGate = 'NONE'; p.phases[1].entryGate = 'AUTHORIZED_JSON'; const l = tempLib([libObj('LAB-SANDBOX-STATIC'), libObj('MAIN-CODE-SLICE'), p, libObj('MAIN-GATED-LIVE-QA'), libObj('COWORK-REGISTER'), libObj('OWNER-MANUAL')]); return p24(null, l).some((v) => /\(4\)/.test(v.message) && v.task === 'P4A-BROWSER-QA'); })());
    check('EP-B11 (4b) two AUTHORIZED_JSON phases ⇒ REFUSE', (() => { const p = libObj('MAIN-BROWSER-QA'); p.phases[1].entryGate = 'AUTHORIZED_JSON'; const l = tempLib([libObj('LAB-SANDBOX-STATIC'), libObj('MAIN-CODE-SLICE'), p, libObj('MAIN-GATED-LIVE-QA'), libObj('COWORK-REGISTER'), libObj('OWNER-MANUAL')]); return p24(null, l).some((v) => /\(4\)/.test(v.message) && v.task === 'P4A-BROWSER-QA'); })());
    check('EP-B11 (5) MAIN-CODE-SLICE-BOUNDED on a requiresOwnerGo false row ⇒ REFUSE under (5)', p24((p) => { const t = task(p, 'G1-CLOCK-SEAM'); t.executionProfile = 'MAIN-CODE-SLICE-BOUNDED'; t.requiresOwnerGo = false; }).some((v) => /\(5\)/.test(v.message) && v.task === 'G1-CLOCK-SEAM'));
    check('EP-B11 positives: all 9 v3 rows PASS P-V24', p24(null).length === 0);
    check('EP-B11 positive: G1-CLOCK-SEAM x MAIN-CODE-SLICE-BOUNDED PASS (P-V23/P-V24/P-V25)', (() => { const r = lib.planCheck(mkPlan((p) => { task(p, 'G1-CLOCK-SEAM').executionProfile = 'MAIN-CODE-SLICE-BOUNDED'; }), opts()); return r.ok === true; })());

    // ── EP-B12 P-V25 hard classes + lock-out ─────────────────────────────────
    section('EP-B12 P-V25 scope <-> mutex coverage');
    const p25 = (mut) => viol(lib.planCheck(mkPlan(mut), opts()), 'P-V25');
    check('EP-B12 P4A without QA:browser-runtime ⇒ REFUSE (isolated-profile)', p25((p) => { task(p, 'P4A-BROWSER-QA').mutexes = ['CODE:index-html']; }).some((v) => /QA:browser-runtime/.test(v.message) && v.task === 'P4A-BROWSER-QA'));
    check('EP-B12 P4A without CODE:index-html ⇒ REFUSE (build-stability rule)', p25((p) => { task(p, 'P4A-BROWSER-QA').mutexes = ['QA:browser-runtime']; }).some((v) => /CODE:index-html/.test(v.message) && v.task === 'P4A-BROWSER-QA'));
    check('EP-B12 CALL2 without RUNTIME:gates ⇒ REFUSE', p25((p) => { task(p, 'CALL2-TOOLUSE-QA').mutexes = ['CODE:index-html', 'QA:browser-runtime', 'EXTERNAL:live-provider']; }).some((v) => /RUNTIME:gates/.test(v.message)));
    check('EP-B12 CALL2 without EXTERNAL:live-provider ⇒ REFUSE', p25((p) => { task(p, 'CALL2-TOOLUSE-QA').mutexes = ['CODE:index-html', 'QA:browser-runtime', 'RUNTIME:gates']; }).some((v) => /EXTERNAL:live-provider/.test(v.message)));
    check('EP-B12 HS2 without RUNTIME:owner-profile ⇒ REFUSE', p25((p) => { task(p, 'HS2-E2-SNAPSHOT').mutexes = []; }).some((v) => /RUNTIME:owner-profile/.test(v.message)));
    check('EP-B12 HS2 (owner-profile browsing) without QA:browser-runtime PASSES (D-21)', p25(null).length === 0);
    check('EP-B12 BOUNDED grant on a row lacking CODE:index-html ⇒ REFUSE', p25((p) => { const t = task(p, 'G1-CLOCK-SEAM'); t.executionProfile = 'MAIN-CODE-SLICE-BOUNDED'; t.mutexes = []; }).some((v) => /CODE:index-html/.test(v.message)));
    const lo = lib.planCheck(mkPlan(), opts());
    check('EP-B12 G1 x MAIN-CODE-SLICE PASSES with a lock-out WARN for netlify/functions/** (C-3 fixed)', lo.ok === true && lo.lockouts.length === 1 && lo.lockouts[0].task === 'G1-CLOCK-SEAM' && lo.lockouts[0].surface === 'netlify/functions/**' && lo.lockouts[0].class === 'CODE:netlify-functions');
    check('EP-B12 lock-out is a warning, never a violation', lo.warnings.some((w) => w.rule === 'P-V25' && /lock-out/.test(w.message)) && viol(lo, 'P-V25').length === 0);
    check('EP-B12 G1 holding both CODE classes ⇒ no lock-out', lib.planCheck(mkPlan((p) => { task(p, 'G1-CLOCK-SEAM').mutexes = ['CODE:index-html', 'CODE:netlify-functions']; }), opts()).lockouts.length === 0);
    check('EP-B12 deriveLockouts([CODE:index-html], MAIN-CODE-SLICE) == [netlify/functions/**]', JSON.stringify(lib.deriveLockouts(['CODE:index-html'], libObj('MAIN-CODE-SLICE'))) === JSON.stringify([{ surface: 'netlify/functions/**', class: 'CODE:netlify-functions' }]));
    check('EP-B12 deriveLockouts([], LAB-SANDBOX-STATIC) == [] (no CODE surface in scope)', lib.deriveLockouts([], libObj('LAB-SANDBOX-STATIC')).length === 0);
    check('EP-B12 renderLadder(LAB) == owner ladder', lib.renderLadder(libObj('LAB-SANDBOX-STATIC')) === 'BUILD A/A → RUN AUTO/AUTO → HANDOFF A/A → CLOSE M/M');

    // ── EP-B13 P-V26 skill invocability ──────────────────────────────────────
    section('EP-B13 P-V26 skill invocability');
    const skills = tmp('skills');
    const mkSkill = (name, fm) => { fs.mkdirSync(path.join(skills, name)); fs.writeFileSync(path.join(skills, name, 'SKILL.md'), '---\nname: ' + name + '\n' + fm + '---\n\n# ' + name + '\n'); };
    mkSkill('phase-start', 'description: pre-flight\n');
    mkSkill('lab-planner', 'description: owner-invoked\ndisable-model-invocation: true\n');
    mkSkill('open-skill', 'description: open\ndisable-model-invocation: false\n');
    check('EP-B13 readSkillFrontmatter: invocable skill', (() => { const f = lib.readSkillFrontmatter(skills, 'phase-start'); return f.exists === true && f.disableModelInvocation === false; })());
    check('EP-B13 readSkillFrontmatter: disable-model-invocation true', lib.readSkillFrontmatter(skills, 'lab-planner').disableModelInvocation === true);
    check('EP-B13 readSkillFrontmatter: unknown skill ⇒ exists false', lib.readSkillFrontmatter(skills, 'nope').exists === false);
    const withReq = (req, gate) => { const p = libObj('MAIN-CODE-SLICE'); p.skills.required = req; if (gate) p.phases[1].entryGate = gate; return tempLib([libObj('LAB-SANDBOX-STATIC'), p, libObj('MAIN-BROWSER-QA'), libObj('MAIN-GATED-LIVE-QA'), libObj('COWORK-REGISTER'), libObj('OWNER-MANUAL')]); };
    const p26 = (l) => viol(lib.planCheck(mkPlan(), { library: l, skillsRoot: skills }), 'P-V26');
    check('EP-B13 required invocable skill ⇒ PASS', p26(withReq(['phase-start'])).length === 0);
    check('EP-B13 required disable-model-invocation skill without OWNER_TYPES_SKILL phase ⇒ REFUSE', p26(withReq(['lab-planner'])).some((v) => /lab-planner/.test(v.message) && v.task === 'G1-CLOCK-SEAM'));
    check('EP-B13 same with a phase entryGate OWNER_TYPES_SKILL ⇒ PASS', p26(withReq(['lab-planner'], 'OWNER_TYPES_SKILL')).length === 0);
    check('EP-B13 required unknown skill ⇒ REFUSE', p26(withReq(['not-a-skill'])).some((v) => /not-a-skill/.test(v.message)));
    check('EP-B13 demandOnly / ownerInvokedOnly skills are not checked by P-V26', p26(withReq([])).length === 0 && viol(lib.planCheck(mkPlan(), opts()), 'P-V26').length === 0);
    check('EP-B13 real skills root: all library profiles resolve their required skills', good.ok === true && viol(good, 'P-V26').length === 0);

    // ── EP-B14 --runtime-root read-only / dry-run writes nothing ────────────
    section('EP-B14 --dry-run writes nothing, no mutex');
    const rt = tmp('runtime');
    const rtRoot = path.join(rt, 'arc-runtime');
    if (fs.existsSync(abs(REL.runtime))) {
      fs.cpSync(abs(REL.runtime), rtRoot, { recursive: true });
      console.log('  (runtime copied from the live tree, read-only source)');
    } else {
      fs.mkdirSync(path.join(rtRoot, 'plans', 'legacy-v3'), { recursive: true });
      fs.mkdirSync(path.join(rtRoot, 'claims'), { recursive: true });
      fs.mkdirSync(path.join(rtRoot, 'mutex'), { recursive: true });
      fs.writeFileSync(path.join(rtRoot, 'plans', 'current.json'), JSON.stringify({ planId: 'legacy-v3' }) + '\n');
      console.log('  (live runtime absent - synthetic runtime root used)');
    }
    // rtRoot may be a copy of the LIVE runtime, whose mutex/ legitimately holds whatever an
    // in-flight ARC task owns. Pin the state as RECEIVED, never as empty.
    const mutexRoot = path.join(rtRoot, 'mutex');
    check('EP-B14 temp runtime mutex/ present before (state inherited from the copied source; never required to be empty)', fs.existsSync(mutexRoot));
    const mutexBefore = fs.existsSync(mutexRoot) ? treeHash(mutexRoot) : null;
    const before = treeHash(rtRoot);
    const outRt = path.join(io, 'rt-out.json');
    const rRt = runCli(['--in', inPath, '--out', outRt, '--runtime-root', rtRoot]);
    check('EP-B14 CLI with --runtime-root exit 0' + (rRt.status !== 0 ? ' - ' + rRt.out.slice(0, 300) : ''), rRt.status === 0);
    check('EP-B14 runtime tree hash unchanged after the run', treeHash(rtRoot) === before);
    check('EP-B14 mutex/ preserved exactly as received (no mutex taken)', mutexBefore !== null && treeHash(mutexRoot) === mutexBefore);
    check('EP-B14 stdout reports P-V11 and P-V13 PASS against the runtime root', /^P-V11\b.*PASS/m.test(rRt.stdout) && /^P-V13\b.*PASS/m.test(rRt.stdout));
    check('EP-B14 --out under the runtime root ⇒ exit 3, tree unchanged', (() => { const r = runCli(['--in', inPath, '--out', path.join(rtRoot, 'plans', 'x.json'), '--runtime-root', rtRoot]); return r.status === 3 && treeHash(rtRoot) === before; })());
    check('EP-B14 --runtime-root not a directory ⇒ exit 3', runCli(['--in', inPath, '--out', path.join(io, 'z.json'), '--runtime-root', path.join(rt, 'nope')]).status === 3);
    const existingId = fs.readdirSync(path.join(rtRoot, 'plans')).find((n) => fs.statSync(path.join(rtRoot, 'plans', n)).isDirectory() && !n.startsWith('.'));
    check('EP-B14 planId already published ⇒ P-V11 refusal (exit 2), tree unchanged', (() => { const f = path.join(io, 'dup.json'); fs.writeFileSync(f, JSON.stringify(mkPlan((p) => { p.planId = existingId; }))); const r = runCli(['--in', f, '--out', path.join(io, 'dup-out.json'), '--runtime-root', rtRoot]); return r.status === 2 && /P-V11 REFUSED/.test(r.stdout) && treeHash(rtRoot) === before; })());
    check('EP-B14 staging dir from an interrupted run ⇒ P-V11 refusal', (() => { const stage = path.join(rtRoot, 'plans', '.staging-fixture-v3-profiled-r1'); fs.mkdirSync(stage); const r = runCli(['--in', inPath, '--out', path.join(io, 'stg-out.json'), '--runtime-root', rtRoot]); fs.rmdirSync(stage); return r.status === 2 && /P-V11 REFUSED/.test(r.stdout) && /staging/.test(r.stdout); })());
    check('EP-B14 planId "arcs" ⇒ P-V11 refusal (reserved, no runtime root needed)', (() => { const r = lib.planCheck(mkPlan((p) => { p.planId = 'arcs'; }), opts()); return hasViol(r, 'P-V11', /reserved/); })());
    check('EP-B14 runtime tree hash unchanged after the refusal runs', treeHash(rtRoot) === before);
    const rtLive = path.join(tmp('runtime-live'), 'arc-runtime');
    fs.mkdirSync(path.join(rtLive, 'plans', 'outgoing-plan'), { recursive: true });
    fs.mkdirSync(path.join(rtLive, 'claims', 'T-LIVE'), { recursive: true });
    fs.mkdirSync(path.join(rtLive, 'claims', 'T-DONE'), { recursive: true });
    fs.mkdirSync(path.join(rtLive, 'mutex'), { recursive: true });
    fs.writeFileSync(path.join(rtLive, 'plans', 'current.json'), JSON.stringify({ planId: 'outgoing-plan', planHash: 'a'.repeat(64) }, null, 2) + '\n');
    fs.writeFileSync(path.join(rtLive, 'claims', 'T-LIVE', 'claim.json'), JSON.stringify({ taskId: 'T-LIVE', planId: 'outgoing-plan', state: 'CLAIMED' }, null, 2) + '\n');
    fs.writeFileSync(path.join(rtLive, 'claims', 'T-DONE', 'claim.json'), JSON.stringify({ taskId: 'T-DONE', planId: 'outgoing-plan', state: 'COMPLETE' }, null, 2) + '\n');
    const beforeLive = treeHash(rtLive);
    check('EP-B14 live claim against the outgoing plan ⇒ P-V13 refusal naming T-LIVE (CLAIMED) only', (() => { const r = runCli(['--in', inPath, '--out', path.join(io, 'live-out.json'), '--runtime-root', rtLive]); return r.status === 2 && /P-V13 REFUSED/.test(r.stdout) && /T-LIVE \(CLAIMED\)/.test(r.stdout) && !/T-DONE/.test(r.stdout); })());
    check('EP-B14 --acknowledge-live-claims ⇒ WARN, exit 0, carried-over list printed', (() => { const r = runCli(['--in', inPath, '--out', path.join(io, 'live-ack-out.json'), '--runtime-root', rtLive, '--acknowledge-live-claims']); return r.status === 0 && /P-V13\b.*OVERRIDDEN/.test(r.stdout) && /T-LIVE/.test(r.stdout); })());
    check('EP-B14 live-claim runtime tree unchanged (claim.json never modified)', treeHash(rtLive) === beforeLive);

    // ── EP-B15 projectionHash == staged bytes ────────────────────────────────
    section('EP-B15 projection <-> staged bytes');
    const m = r1.stdout.match(/^projectionHash\s+([a-f0-9]{64})\s*$/m);
    check('EP-B15 projectionHash line printed', !!m);
    if (m && ok12) {
      const bytes = fs.readFileSync(out1);
      check('EP-B15 projectionHash == sha256(--out bytes)', m[1] === sha256(bytes));
      const staged = path.join(io, 'staged-plan.json');
      fs.copyFileSync(out1, staged);
      check('EP-B15 byte copy (step 8 cp) hashes identical', sha256(fs.readFileSync(staged)) === m[1]);
      check('EP-B15 a re-serialization differs (why bytes are copied, never re-serialized)', sha256(JSON.stringify(JSON.parse(bytes.toString('utf8')))) !== m[1]);
    }

    // ── EP-B16 --arc (B5): arcId from the literal only; legacy bytes and B2 API shapes preserved ──
    section('EP-B16 --arc fixtures (B5)');
    check('EP-B16 lib exports registryChecks; RESERVED_RUNTIME_ARC_IDS == [CORE-STREAM]; P-V18 absent from RULE_ORDER', typeof lib.registryChecks === 'function' && JSON.stringify(lib.RESERVED_RUNTIME_ARC_IDS) === JSON.stringify(['CORE-STREAM']) && !lib.RULE_ORDER.includes('P-V18') && ['P-V16', 'P-V17', 'P-V19', 'P-V20'].every((r) => lib.RULE_ORDER.includes(r)));
    check('EP-B16 plan carrying arcId without a literal ⇒ P-V16; with the same literal ⇒ PASS; legacy plan without a literal ⇒ P-V16 PASS', hasViol(lib.planCheck(mkPlan((p) => { p.arcId = 'ARC-A'; }), opts()), 'P-V16') && lib.planCheck(mkPlan((p) => { p.arcId = 'ARC-A'; }), Object.assign(opts(), { arcId: 'ARC-A' })).ok === true && good.rules['P-V16'] === 'PASS');
    check('EP-B16 --arc arc-a / Arc-A / CORE-STREAM / CON refused under P-V16 (never normalized)', ['arc-a', 'Arc-A', 'CORE-STREAM', 'CON'].every((id) => hasViol(lib.planCheck(mkPlan(), Object.assign(opts(), { arcId: id })), 'P-V16')));
    if (ok12) check('EP-B16 resolveProfiles(plan, library) without opts yields the B1 bytes (legacy byte-compatibility) and the return shape {plan, text, profilesUsed}', (() => { const a = lib.resolveProfiles(mkPlan(), library); return a.text === fs.readFileSync(out1, 'utf8') && JSON.stringify(Object.keys(a)) === JSON.stringify(['plan', 'text', 'profilesUsed']); })());
    check('EP-B16 resolveProfiles(plan, library, {arcId}) places arcId between executionProfiles and tasks; return shape unchanged', (() => { const a = lib.resolveProfiles(mkPlan(), library, { arcId: 'ARC-A' }); const k = Object.keys(a.plan); return a.plan.arcId === 'ARC-A' && k.indexOf('arcId') === k.indexOf('executionProfiles') + 1 && k.indexOf('tasks') === k.indexOf('arcId') + 1 && JSON.stringify(Object.keys(a)) === JSON.stringify(['plan', 'text', 'profilesUsed']); })());
    check('EP-B16 runtimeChecks result shape unchanged (B2 contract) with and without arcId; ARC roots absent ⇒ throws, never created', (() => { const rt2 = path.join(tmp('rt16'), 'arc-runtime'); for (const d of ['plans', 'claims', 'mutex']) fs.mkdirSync(path.join(rt2, d), { recursive: true }); const keys = (o) => JSON.stringify(Object.keys(o)); const a = lib.runtimeChecks(rt2, mkPlan(), {}); let threw = false; try { lib.runtimeChecks(rt2, mkPlan(), { arcId: 'ARC-A' }); } catch (e) { threw = true; } fs.mkdirSync(path.join(rt2, 'plans', 'arcs')); fs.mkdirSync(path.join(rt2, 'arc-claims')); const b = lib.runtimeChecks(rt2, mkPlan(), { arcId: 'ARC-A' }); return keys(a) === keys(b) && keys(a) === JSON.stringify(['violations', 'warnings', 'rules', 'liveClaims', 'outgoingPlanId']) && threw && b.rules['P-V19'] === 'PASS'; })());
  }

  // ── docs and wiring (run even when the lib is absent: part of RED) ─────────
  section('Docs + QA wiring');
  const doc = (k) => (fs.existsSync(abs(REL.docs[k])) ? readText(REL.docs[k]) : '');
  const once = (t, re) => (t.match(re) || []).length === 1;
  check('docs plan-validation.md has ## P-V21 .. ## P-V26 exactly once each', ['21', '22', '23', '24', '25', '26'].every((n) => once(doc('validation'), new RegExp('^## P-V' + n + '\\b', 'gm'))));
  check('docs plan-validation.md P-V11 reserves planId "arcs"', /P-V11[\s\S]*?reserved[\s\S]*?`arcs`/.test(doc('validation')));
  check('docs plan-validation.md P-V24 carries the ratified five clauses', /P-V24[\s\S]*?iff[\s\S]*?AUTHORIZED_JSON[\s\S]*?at most one/i.test(doc('validation')));
  check('docs plan-validation.md P-V23(d) states the .ai-reports/** MAIN grant boundary', /\(d\)[\s\S]*?\.ai-reports\/\*\*/.test(doc('validation')));
  check('docs plan-validation.md P-V25 names lock-out and D-21', /lock-out/.test(doc('validation')) && /D-21|owner-profile/.test(doc('validation')));
  check('docs SKILL.md documents --dry-run', /--dry-run/.test(doc('skill')));
  check('docs SKILL.md names the resolver script', /scripts\/resolve-profiles\.js/.test(doc('skill')));
  check('docs publish-protocol.md has the pre-mutex main-worktree assert', /\[ "\$\(git rev-parse --show-toplevel\)" = "\$REPO" \]/.test(doc('protocol')) && /REPO="\$\(dirname "\$COMMON"\)"/.test(doc('protocol')));
  check('docs publish-protocol.md invokes resolve-profiles.js and records projectionHash', /resolve-profiles\.js/.test(doc('protocol')) && /PROJECTION_HASH|projectionHash/.test(doc('protocol')));
  check('docs publish-protocol.md step 8 stages the confirmed bytes (cp) and compares hashes', /cp "\$SCRATCH\/plan\.json" "\$STAGE\/plan\.json"/.test(doc('protocol')) && /PLAN_HASH" = "\$PROJECTION_HASH/.test(doc('protocol')));
  check('docs publish-protocol.md has a --dry-run section', /--dry-run/.test(doc('protocol')));
  check('docs plan-projection.md has PROFILES, RESOLVER, projectionHash and the lock-out WARN', /PROFILES/.test(doc('projection')) && /RESOLVER/.test(doc('projection')) && /projectionHash/.test(doc('projection')) && /lock-out WARN/.test(doc('projection')));
  check('docs plan-projection.md validation block lists P-V15 and P-V21..P-V26', /P-V15/.test(doc('projection')) && ['21', '22', '23', '24', '25', '26'].every((n) => new RegExp('P-V' + n + '\\b').test(doc('projection'))));
  check('docs publish-report.md has projectionHash and PROFILES EMBEDDED', /projectionHash/.test(doc('report')) && /PROFILES EMBEDDED/.test(doc('report')));
  check('docs B5: plan-validation.md has ## P-V16 / P-V17 / P-V19 / P-V20 once each and P-V18 RETIRED; SKILL.md and publish-protocol.md carry --arc', ['16', '17', '19', '20'].every((n) => once(doc('validation'), new RegExp('^## P-V' + n + '\\b', 'gm'))) && /P-V18[^\n]*(RETIRED|retired)/.test(doc('validation')) && /--arc <ARC-ID>/.test(doc('skill')) && /--arc "\$ARC"/.test(doc('protocol')));
  check('docs execution-profiles/README.md status names P-B as implemented and the resolver', /P-B[\s\S]*?implemented/i.test(doc('readme')) && /resolve-profiles\.js/.test(doc('readme')));
  check('docs execution-profile.md section 7 names the P-B implementation (P-C implemented in B2)', /profile-contract\.js/.test(doc('contract')) && /implemented in B2/.test(doc('contract')) && !/P-C[^\n]*not implemented/.test(doc('contract')));
  check('wiring run-offline.js registers qa/arc_publish_profiles_offline.js', /'qa\/arc_publish_profiles_offline\.js'/.test(doc('runner')));
  check('wiring B2 artifact (arc-worker/scripts/phase-gate.js) exists and requires this library read-only (P-C implemented in B2)', fs.existsSync(abs('.claude/skills/arc-worker/scripts/phase-gate.js')) && /require\('\.\.\/\.\.\/arc-publish-plan\/scripts\/lib\/profile-contract\.js'\)/.test(readText('.claude/skills/arc-worker/scripts/phase-gate.js')));
  for (const f of ['.claude/skills/arc-worker/SKILL.md', '.claude/skills/arc-worker/references/runtime-contract.md', '.claude/skills/arc-worker/references/claim-protocol.md', '.claude/skills/arc-worker/templates/worker-report.md', '.claude/skills/arc-authorize/SKILL.md']) {
    check('scope worker/authorize file carries the P-C vocabulary (B2): ' + f, fs.existsSync(abs(f)) && /executionProfile|phase-gate\.js/.test(readText(f)));
  }
} finally {
  cleanup();
}

console.log('\n' + (failed === 0 ? 'ARC PUBLISH PROFILES (P-B): PASS (' + total + ' asserts)' : 'ARC PUBLISH PROFILES (P-B): FAIL (' + failed + ' of ' + total + ' asserts failed)'));
assert.strictEqual(failed, 0, failures.slice(0, 12).join(' | '));
