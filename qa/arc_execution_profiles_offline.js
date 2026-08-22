'use strict';

/*
 * qa/arc_execution_profiles_offline.js
 *
 * Execution Profile V1.2 — Increment P-A executable contract mirror (EP-V1 … EP-V15;
 * EP-V15 publisher half updated by P-B / B1, worker half by P-C / B2: both surface sets active).
 * Pure Node, no network, no browser, no runtime write. Reads only:
 *   - .claude/skills/arc-publish-plan/references/schemas/execution-profile.schema.json
 *   - .claude/skills/arc-publish-plan/references/execution-profiles/*.json (+ README.md)
 *   - .claude/skills/arc-publish-plan/references/schemas/plan.schema.json
 *   - the ARC skill markdowns (inactivity proof) and, read-only, the live v3 snapshot
 *
 * The JSON schema is the normative contract; this file is its executable mirror.
 * Drift guards read every enum and `required` array back out of the schema file and
 * assert the mirror's own tables equal them, so schema and mirror cannot diverge silently.
 *
 * Owner rulings encoded (r2.1, 2026-08-21):
 *   1. MAIN lane: AUTO is never permitted in any phase.
 *   2. plan.schema.json gains two OPTIONAL fields; nothing becomes required.
 *   3. No boundary is grantable; gate / live-provider / pt_* / git / runtime / deploy / env /
 *      production actions occur only in MANUAL phases; `inside` must be empty.
 *   4. git-stage is its own boundary/action; git-commit is never overloaded.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REL = {
  schema: '.claude/skills/arc-publish-plan/references/schemas/execution-profile.schema.json',
  planSchema: '.claude/skills/arc-publish-plan/references/schemas/plan.schema.json',
  libDir: '.claude/skills/arc-publish-plan/references/execution-profiles',
  contractDoc: '.claude/skills/arc-worker/references/execution-profile.md',
  v3Plan: '.git/arc-runtime/plans/parallel-arc-v3-2026-08-15/plan.json',
  publisherLib: '.claude/skills/arc-publish-plan/scripts/lib/profile-contract.js',
  publisherCli: '.claude/skills/arc-publish-plan/scripts/resolve-profiles.js',
  publisherActive: [
    '.claude/skills/arc-publish-plan/SKILL.md',
    '.claude/skills/arc-publish-plan/references/publish-protocol.md',
    '.claude/skills/arc-publish-plan/references/plan-validation.md',
    '.claude/skills/arc-publish-plan/templates/plan-projection.md'
  ],
  workerActive: [
    '.claude/skills/arc-worker/SKILL.md',
    '.claude/skills/arc-worker/references/runtime-contract.md',
    '.claude/skills/arc-worker/references/claim-protocol.md',
    '.claude/skills/arc-worker/templates/worker-report.md',
    '.claude/skills/arc-authorize/SKILL.md'
  ]
};
const abs = (p) => path.join(ROOT, p);
const readText = (p) => fs.readFileSync(abs(p), 'utf8');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ── the mirror's own vocabulary (drift-guarded against the schema below) ──────
const MODES = ['MANUAL', 'ACCEPT_EDITS', 'AUTO'];
const RANK = { MANUAL: 0, ACCEPT_EDITS: 1, AUTO: 2 };
const KINDS = ['PLAN', 'IMPLEMENT', 'VERIFY', 'REPORT', 'TERMINAL'];
const GATES = ['NONE', 'AUTHORIZED_JSON', 'OWNER_TYPES_SKILL', 'OWNER_TYPED_LITERAL'];
const LANES = ['MAIN', 'LAB', 'COWORK', 'OWNER'];
const BOUNDARIES = ['git-stage', 'git-commit', 'git-push', 'deploy', 'env-change', 'gate-toggle',
  'live-external-call', 'pt-write', 'runtime-mutation-other-claim', 'scope-expansion', 'production'];
const NON_GRANTABLE = BOUNDARIES.slice();
const WORKER_ACTIONS = ['git-stage', 'git-commit', 'gate-toggle', 'live-external-call', 'pt-write'];
const CAP = {
  network: ['none', 'public-read', 'live-provider'],
  browser: ['none', 'isolated-profile', 'owner-profile'],
  git: ['read-only', 'stage', 'commit'],
  deploy: ['none'],
  gates: ['none', 'toggle-with-repark'],
  ownerProfile: ['none', 'read', 'write']
};
const TRIGGER_ON = ['containment-breach', 'live-call-needed', 'target-surface-changed', 'two-failed-attempts',
  'mode-exceeds-ceiling', 'automation-increase-needed', 'newer-artifact-observed', 'dependency-false',
  'scope-growth', 'new-failure-class'];
const TRIGGER_ACTION = ['STOP', 'BLOCKED', 'STOP-before-write', 'STOP-request-MODE-literal', 'REPORT-stay-on-snapshot', 'ESCALATE-OWNER'];
const GRANT_MUTEX = ['CODE:index-html', 'CODE:netlify-functions'];
const TOP_REQUIRED = ['profileId', 'version', 'appliesToLane', 'scope', 'capabilities', 'tools', 'skills', 'phases', 'approvalBoundaries', 'verification', 'triggers', 'cleanup'];
const TOP_OPTIONAL = ['libraryHash', 'requiresOwnerGo'];
const PHASE_REQUIRED = ['id', 'kind', 'recommendedMode', 'modeCeiling', 'entryGate', 'writes', 'exit'];
const PHASE_OPTIONAL = ['actions', 'grant'];
const SCOPE_REQUIRED = ['worktree', 'pinnedRef', 'writes', 'readOnly', 'forbidden'];
const VERIF_REQUIRED = ['suites', 'selfTest', 'evidence', 'proofStyle'];
const CLEANUP_REQUIRED = ['scratch', 'sandbox', 'gates', 'mutexes', 'handoff', 'checkpoint', 'conversation'];
const PLACEHOLDER_RE = /^[^{}]*(\{TASK_ID\}[^{}]*)*$/;
const GRANT_PATH_FORBIDDEN = [/^\.git\//, /^\.netlify\//, /^netlify\.toml$/, /^\.env/, /pt_/];
const PROFILE_ID_RE = /^[A-Z0-9]([A-Z0-9-]*[A-Z0-9])?$/;
const LIBRARY_IDS = ['LAB-SANDBOX-STATIC', 'MAIN-CODE-SLICE', 'MAIN-CODE-SLICE-BOUNDED', 'MAIN-BROWSER-QA', 'MAIN-GATED-LIVE-QA', 'COWORK-REGISTER', 'OWNER-MANUAL'];

// ── executable mirror of the contract: returns violation codes ──────────────
function validateProfile(p) {
  const v = [];
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const isStrArr = (x) => Array.isArray(x) && x.every((s) => typeof s === 'string');
  const keysOk = (obj, req, opt, where) => {
    for (const k of req) if (!(k in obj)) v.push(where + ':missing:' + k);
    for (const k of Object.keys(obj)) if (!req.includes(k) && !opt.includes(k)) v.push(where + ':unknown:' + k);
  };
  if (!isObj(p)) return ['profile:not-object'];
  keysOk(p, TOP_REQUIRED, TOP_OPTIONAL, 'profile');
  if (typeof p.profileId !== 'string' || !PROFILE_ID_RE.test(p.profileId) || p.profileId.length > 32) v.push('profileId:pattern');
  if (!Number.isInteger(p.version) || p.version < 1) v.push('version:int');
  if ('libraryHash' in p && !/^[a-f0-9]{64}$/.test(String(p.libraryHash))) v.push('libraryHash:pattern');
  if ('requiresOwnerGo' in p && typeof p.requiresOwnerGo !== 'boolean') v.push('requiresOwnerGo:type');
  if (!LANES.includes(p.appliesToLane)) v.push('appliesToLane:enum');
  // scope
  if (isObj(p.scope)) {
    keysOk(p.scope, SCOPE_REQUIRED, [], 'scope');
    if (typeof p.scope.worktree !== 'string' || !/^([a-z0-9.-]+|none)$/.test(p.scope.worktree)) v.push('scope.worktree:pattern');
    if (!(p.scope.pinnedRef === 'PLAN_REPO_REF' || /^[a-f0-9]{40}$/.test(String(p.scope.pinnedRef)))) v.push('scope.pinnedRef:pattern');
    for (const k of ['writes', 'readOnly', 'forbidden']) {
      if (!isStrArr(p.scope[k])) v.push('scope.' + k + ':strings');
      else if (k === 'writes') p.scope[k].forEach((s) => { if (!PLACEHOLDER_RE.test(s)) v.push('scope.writes:placeholder'); });
    }
  } else v.push('scope:object');
  // capabilities
  if (isObj(p.capabilities)) {
    keysOk(p.capabilities, Object.keys(CAP), [], 'capabilities');
    for (const k of Object.keys(CAP)) if (!CAP[k].includes(p.capabilities[k])) v.push('capabilities.' + k + ':enum');
  } else v.push('capabilities:object');
  // tools / skills
  if (isObj(p.tools)) { keysOk(p.tools, ['allowed', 'forbidden'], [], 'tools'); if (!isStrArr(p.tools.allowed) || !isStrArr(p.tools.forbidden)) v.push('tools:strings'); } else v.push('tools:object');
  if (isObj(p.skills)) { keysOk(p.skills, ['required', 'demandOnly', 'ownerInvokedOnly'], [], 'skills'); for (const k of ['required', 'demandOnly', 'ownerInvokedOnly']) if (!isStrArr(p.skills[k])) v.push('skills.' + k + ':strings'); } else v.push('skills:object');
  // phases
  let anyGrant = false;
  const declared = new Set();
  if (!Array.isArray(p.phases) || p.phases.length < 1) v.push('phases:minItems');
  else p.phases.forEach((ph, i) => {
    const w = 'phase[' + i + ']';
    if (!isObj(ph)) { v.push(w + ':object'); return; }
    keysOk(ph, PHASE_REQUIRED, PHASE_OPTIONAL, w);
    if (typeof ph.id !== 'string' || !/^[A-Z][A-Z0-9-]*$/.test(ph.id)) v.push(w + ':id');
    if (!KINDS.includes(ph.kind)) v.push(w + ':kind:enum');
    if (!MODES.includes(ph.recommendedMode)) v.push(w + ':recommendedMode:enum');
    if (!MODES.includes(ph.modeCeiling)) v.push(w + ':modeCeiling:enum');
    if (!GATES.includes(ph.entryGate)) v.push(w + ':entryGate:enum');
    if (typeof ph.exit !== 'string' || !ph.exit.trim()) v.push(w + ':exit');
    if (!isStrArr(ph.writes)) v.push(w + ':writes:strings'); else ph.writes.forEach((s) => { if (!PLACEHOLDER_RE.test(s)) v.push(w + ':writes:placeholder'); });
    const r = RANK[ph.recommendedMode], c = RANK[ph.modeCeiling];
    if (r !== undefined && c !== undefined && r > c) v.push(w + ':recommended>ceiling');
    if (ph.modeCeiling === 'AUTO' && ph.kind !== 'VERIFY') v.push(w + ':auto-only-verify');
    if (ph.kind === 'TERMINAL' && ph.modeCeiling !== 'MANUAL') v.push(w + ':terminal-manual');
    if (p.appliesToLane === 'MAIN' && (ph.modeCeiling === 'AUTO' || ph.recommendedMode === 'AUTO')) v.push(w + ':main-never-auto');
    if (p.appliesToLane === 'OWNER' && (ph.modeCeiling !== 'MANUAL' || ph.recommendedMode !== 'MANUAL')) v.push(w + ':owner-manual');
    if ('actions' in ph) {
      if (!isStrArr(ph.actions)) v.push(w + ':actions:strings');
      else {
        ph.actions.forEach((a) => { if (!WORKER_ACTIONS.includes(a)) v.push(w + ':actions:enum'); else declared.add(a); });
        if (ph.actions.length > 0 && ph.modeCeiling !== 'MANUAL') v.push(w + ':actions-require-manual');
      }
    }
    if ('grant' in ph) {
      anyGrant = true;
      const g = ph.grant;
      if (!isObj(g)) v.push(w + ':grant:object');
      else {
        keysOk(g, ['toMode', 'paths', 'mutexClass'], [], w + ':grant');
        if (g.toMode !== 'ACCEPT_EDITS') v.push(w + ':grant:toMode');
        if (!isStrArr(g.paths) || g.paths.length < 1) v.push(w + ':grant:paths');
        else {
          g.paths.forEach((s) => {
            if (!PLACEHOLDER_RE.test(s)) v.push(w + ':grant:placeholder');
            if (GRANT_PATH_FORBIDDEN.some((re) => re.test(s))) v.push(w + ':grant:forbidden-path');
            if (isObj(p.scope) && isStrArr(p.scope.writes) && !p.scope.writes.includes(s)) v.push(w + ':grant:path-not-in-scope');
          });
        }
        if (!GRANT_MUTEX.includes(g.mutexClass)) v.push(w + ':grant:mutexClass');
      }
      if (ph.kind !== 'IMPLEMENT') v.push(w + ':grant:kind');
      if (ph.modeCeiling !== 'ACCEPT_EDITS') v.push(w + ':grant:ceiling');
      if (Array.isArray(ph.actions) && ph.actions.length > 0) v.push(w + ':grant:no-actions');
      if (p.appliesToLane !== 'MAIN') v.push(w + ':grant:main-only');
    }
  });
  if (anyGrant && p.requiresOwnerGo !== true) v.push('grant:requiresOwnerGo');
  // approval boundaries
  if (isObj(p.approvalBoundaries)) {
    keysOk(p.approvalBoundaries, ['inside', 'outside'], [], 'approvalBoundaries');
    const ins = p.approvalBoundaries.inside, out = p.approvalBoundaries.outside;
    if (!Array.isArray(ins)) v.push('inside:array'); else if (ins.length !== 0) v.push('inside:must-be-empty');
    if (!isStrArr(out)) v.push('outside:strings');
    else {
      out.forEach((b) => { if (!BOUNDARIES.includes(b)) v.push('outside:enum'); });
      if (new Set(out).size !== out.length) v.push('outside:unique');
      BOUNDARIES.forEach((b) => { if (!out.includes(b)) v.push('outside:incomplete:' + b); });
    }
  } else v.push('approvalBoundaries:object');
  // verification / triggers / cleanup
  if (isObj(p.verification)) { keysOk(p.verification, VERIF_REQUIRED, [], 'verification'); if (!isStrArr(p.verification.suites)) v.push('verification.suites:strings'); } else v.push('verification:object');
  if (!Array.isArray(p.triggers)) v.push('triggers:array');
  else p.triggers.forEach((t, i) => { if (!isObj(t)) { v.push('trigger[' + i + ']:object'); return; } keysOk(t, ['on', 'action'], ['reason'], 'trigger[' + i + ']'); if (!TRIGGER_ON.includes(t.on)) v.push('trigger[' + i + ']:on'); if (!TRIGGER_ACTION.includes(t.action)) v.push('trigger[' + i + ']:action'); });
  if (isObj(p.cleanup)) keysOk(p.cleanup, CLEANUP_REQUIRED, [], 'cleanup'); else v.push('cleanup:object');
  // EP-V14 capability <-> action consistency (exact)
  if (isObj(p.capabilities)) {
    const c = p.capabilities;
    if (c.gates === 'toggle-with-repark' && !declared.has('gate-toggle')) v.push('consistency:gates-without-gate-toggle');
    if (c.gates === 'none' && declared.has('gate-toggle')) v.push('consistency:gate-toggle-without-capability');
    if (c.network === 'live-provider' && !declared.has('live-external-call')) v.push('consistency:live-provider-without-action');
    if (c.network !== 'live-provider' && declared.has('live-external-call')) v.push('consistency:live-action-without-capability');
    if (c.ownerProfile === 'write' && !declared.has('pt-write')) v.push('consistency:pt-write-capability-without-action');
    if (c.ownerProfile !== 'write' && declared.has('pt-write')) v.push('consistency:pt-write-action-without-capability');
    if (c.git === 'stage' && (!declared.has('git-stage') || declared.has('git-commit'))) v.push('consistency:git-stage');
    if (c.git === 'commit' && !declared.has('git-commit')) v.push('consistency:git-commit');
    if (c.git === 'read-only' && (declared.has('git-stage') || declared.has('git-commit'))) v.push('consistency:git-read-only');
  }
  return v;
}

// ── harness ──────────────────────────────────────────────────────────────────
let total = 0, failed = 0;
const failures = [];
function check(name, cond) { total += 1; if (!cond) { failed += 1; failures.push(name); console.log('  FAIL  ' + name); } }
const clone = (o) => JSON.parse(JSON.stringify(o));
const ok = (p) => validateProfile(p).length === 0;
const has = (p, code) => validateProfile(p).some((c) => c.indexOf(code) !== -1);

// ── canonical in-test fixtures (hand-authored; expected VALID) ───────────────
const ALL_OUT = BOUNDARIES.slice();
const LAB = {
  profileId: 'LAB-SANDBOX-STATIC', version: 1, appliesToLane: 'LAB',
  scope: { worktree: 'portfolio-tracker-test-lab', pinnedRef: 'PLAN_REPO_REF',
    writes: ['<worktree>/lab-{TASK_ID}/**', '.ai-reports/handoffs/*.LAB.md'],
    readOnly: ['<worktree>/**', 'git show <pinnedRef>:**'],
    forbidden: ['branch-dev:index.html', 'branch-dev:netlify/**', '.netlify/**', '.git/arc-runtime/** (except own claim + own mutex holders)', 'pt_*'] },
  capabilities: { network: 'none', browser: 'none', git: 'read-only', deploy: 'none', gates: 'none', ownerProfile: 'none' },
  tools: { allowed: ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit'], forbidden: ['mcp__claude_ai_Netlify__*', 'WebFetch', 'WebSearch', 'Bash(netlify *)', 'Bash(git push*)', 'Bash(git commit*)'] },
  skills: { required: [], demandOnly: ['lab-planner'], ownerInvokedOnly: ['lab-planner'] },
  phases: [
    { id: 'BUILD', kind: 'IMPLEMENT', recommendedMode: 'ACCEPT_EDITS', modeCeiling: 'ACCEPT_EDITS', entryGate: 'NONE', writes: ['<worktree>/lab-{TASK_ID}/**'], exit: 'harness green on its own fixtures' },
    { id: 'RUN', kind: 'VERIFY', recommendedMode: 'AUTO', modeCeiling: 'AUTO', entryGate: 'NONE', writes: ['<worktree>/lab-{TASK_ID}/out/**'], exit: 'scan complete; counts recorded' },
    { id: 'HANDOFF', kind: 'REPORT', recommendedMode: 'ACCEPT_EDITS', modeCeiling: 'ACCEPT_EDITS', entryGate: 'NONE', writes: ['.ai-reports/handoffs/*.LAB.md'], exit: 'handoff registered; closeCondition evidence present' },
    { id: 'CLOSE', kind: 'TERMINAL', recommendedMode: 'MANUAL', modeCeiling: 'MANUAL', entryGate: 'NONE', writes: ['claims/{TASK_ID}/claim.json'], exit: 'COMPLETE written; own mutexes released (claim-protocol section 7)' }
  ],
  approvalBoundaries: { inside: [], outside: ALL_OUT.slice() },
  verification: { suites: [], selfTest: 'asserts against hand-authored fixtures; counts printed', evidence: 'handoff + sandbox artifacts', proofStyle: 'counts-not-claims' },
  triggers: [
    { on: 'containment-breach', action: 'STOP' },
    { on: 'live-call-needed', action: 'BLOCKED', reason: 'needs EXTERNAL:live-provider - not in row' },
    { on: 'target-surface-changed', action: 'BLOCKED' },
    { on: 'two-failed-attempts', action: 'BLOCKED', reason: 'entry-mode-insufficient' },
    { on: 'mode-exceeds-ceiling', action: 'STOP-before-write' },
    { on: 'automation-increase-needed', action: 'STOP-request-MODE-literal' },
    { on: 'newer-artifact-observed', action: 'REPORT-stay-on-snapshot' }
  ],
  cleanup: { scratch: 'scratchpad only, deleted', sandbox: 'retain untracked in worktree', gates: 'n/a', mutexes: 'release at COMPLETE', handoff: 'required', checkpoint: 'owner note', conversation: 'retire after report (Policy v3 section D)' }
};
const MAINB = clone(LAB);
Object.assign(MAINB, { profileId: 'MAIN-CODE-SLICE-BOUNDED', appliesToLane: 'MAIN', requiresOwnerGo: true });
MAINB.scope = { worktree: 'branch-dev', pinnedRef: 'PLAN_REPO_REF', writes: ['index.html', '.ai-reports/handoffs/*.MAIN.md'], readOnly: ['**'], forbidden: ['.git/arc-runtime/** (except own claim + own mutex holders)', '.netlify/**', 'netlify.toml', 'pt_*'] };
MAINB.phases = [
  { id: 'PLAN', kind: 'PLAN', recommendedMode: 'MANUAL', modeCeiling: 'MANUAL', entryGate: 'AUTHORIZED_JSON', writes: [], exit: 'owner-approved plan' },
  { id: 'IMPLEMENT', kind: 'IMPLEMENT', recommendedMode: 'ACCEPT_EDITS', modeCeiling: 'ACCEPT_EDITS', entryGate: 'NONE', writes: ['index.html'], exit: 'edit complete', grant: { toMode: 'ACCEPT_EDITS', paths: ['index.html'], mutexClass: 'CODE:index-html' } },
  { id: 'VERIFY', kind: 'VERIFY', recommendedMode: 'ACCEPT_EDITS', modeCeiling: 'ACCEPT_EDITS', entryGate: 'NONE', writes: [], exit: 'offline suites green' },
  { id: 'HANDOFF', kind: 'REPORT', recommendedMode: 'ACCEPT_EDITS', modeCeiling: 'ACCEPT_EDITS', entryGate: 'NONE', writes: ['.ai-reports/handoffs/*.MAIN.md'], exit: 'handoff registered' },
  { id: 'CLOSE', kind: 'TERMINAL', recommendedMode: 'MANUAL', modeCeiling: 'MANUAL', entryGate: 'NONE', writes: ['claims/{TASK_ID}/claim.json'], exit: 'COMPLETE written' }
];

console.log('ARC execution-profile contract mirror (P-A)');

// ── EP-V0 the schema exists and the mirror's vocabulary equals it (drift guards) ──
console.log('== EP-V0 schema present + drift guards ==');
let schema = null;
try { schema = JSON.parse(readText(REL.schema)); } catch (e) { check('execution-profile.schema.json present and parses (' + e.message + ')', false); }
if (schema) {
  const d = schema.$defs || {};
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check('schema $id', schema.$id === 'arc/execution-profile.schema.json');
  check('schema additionalProperties false', schema.additionalProperties === false);
  check('schema required == mirror TOP_REQUIRED', eq(schema.required, TOP_REQUIRED));
  check('schema top-level properties == required + optional', eq(Object.keys(schema.properties || {}).sort(), TOP_REQUIRED.concat(TOP_OPTIONAL).sort()));
  check('$defs.mode == MODES', eq(d.mode && d.mode.enum, MODES));
  check('$defs.kind == KINDS', eq(d.kind && d.kind.enum, KINDS));
  check('$defs.entryGate == GATES', eq(d.entryGate && d.entryGate.enum, GATES));
  check('$defs.lane == LANES', eq(d.lane && d.lane.enum, LANES));
  check('$defs.boundary == 11 names incl. git-stage', eq(d.boundary && d.boundary.enum, BOUNDARIES));
  check('$defs.nonGrantableBoundary == boundary (all eleven)', eq(d.nonGrantableBoundary && d.nonGrantableBoundary.enum, NON_GRANTABLE));
  check('$defs.workerAction == WORKER_ACTIONS (no git-push, deploy, env, runtime, production, scope)', eq(d.workerAction && d.workerAction.enum, WORKER_ACTIONS));
  for (const k of Object.keys(CAP)) check('$defs.cap_' + k + ' == mirror', eq(d['cap_' + k] && (d['cap_' + k].enum || [d['cap_' + k].const]), CAP[k]));
  check('$defs.triggerOn == mirror', eq(d.triggerOn && d.triggerOn.enum, TRIGGER_ON));
  check('$defs.triggerAction == mirror', eq(d.triggerAction && d.triggerAction.enum, TRIGGER_ACTION));
  check('$defs.grant.toMode const ACCEPT_EDITS', !!(d.grant && d.grant.properties && d.grant.properties.toMode && d.grant.properties.toMode.const === 'ACCEPT_EDITS'));
  check('$defs.grant.mutexClass enum == GRANT_MUTEX', !!(d.grant && eq(d.grant.properties.mutexClass.enum, GRANT_MUTEX)));
  check('$defs.phase.required == PHASE_REQUIRED', !!(d.phase && eq(d.phase.required, PHASE_REQUIRED)));
  check('$defs.phase.properties == required + optional', !!(d.phase && eq(Object.keys(d.phase.properties).sort(), PHASE_REQUIRED.concat(PHASE_OPTIONAL).sort())));
  const ab = schema.properties && schema.properties.approvalBoundaries;
  check('approvalBoundaries.inside maxItems 0 (nothing grantable)', !!(ab && ab.properties.inside.maxItems === 0));
  check('approvalBoundaries.outside minItems 11 + uniqueItems', !!(ab && ab.properties.outside.minItems === 11 && ab.properties.outside.uniqueItems === true));
  check('scope.required == SCOPE_REQUIRED', eq(schema.properties.scope.required, SCOPE_REQUIRED));
  check('verification.required == VERIF_REQUIRED', eq(schema.properties.verification.required, VERIF_REQUIRED));
  check('cleanup.required == CLEANUP_REQUIRED', eq(schema.properties.cleanup.required, CLEANUP_REQUIRED));
  check('libraryHash optional 64-hex, publisher-owned', !!(schema.properties.libraryHash && schema.properties.libraryHash.pattern === '^[a-f0-9]{64}$' && !schema.required.includes('libraryHash')));
}

// ── EP-V1..V11 rule fixtures ───────────────────────────────────────────────
console.log('== EP-V1..V11 rule fixtures ==');
check('EP-V11 canonical LAB fixture validates', ok(LAB));
check('EP-V8/V11 canonical bounded MAIN fixture validates', ok(MAINB));
check('EP-V1 unknown profile name is not resolvable from the library', !fs.existsSync(abs(path.join(REL.libDir, 'NOT-A-PROFILE.json'))));
check('EP-V2 invalid JSON rejected', (() => { try { JSON.parse('{"profileId": '); return false; } catch (_) { return true; } })());
check('EP-V2 missing phases rejected', has((() => { const p = clone(LAB); delete p.phases; return p; })(), 'profile:missing:phases'));
check('EP-V2 missing scope rejected', has((() => { const p = clone(LAB); delete p.scope; return p; })(), 'profile:missing:scope'));
check('EP-V2 unknown top-level key rejected', has(Object.assign(clone(LAB), { bogus: 1 }), 'profile:unknown:bogus'));
check('EP-V3 modeCeiling "auto" rejected', has((() => { const p = clone(LAB); p.phases[1].modeCeiling = 'auto'; return p; })(), 'modeCeiling:enum'));
check('EP-V3 recommendedMode "YOLO" rejected', has((() => { const p = clone(LAB); p.phases[0].recommendedMode = 'YOLO'; return p; })(), 'recommendedMode:enum'));
check('EP-V4 recommended AUTO > ceiling ACCEPT_EDITS rejected', has((() => { const p = clone(LAB); p.phases[0].recommendedMode = 'AUTO'; return p; })(), 'recommended>ceiling'));
check('EP-V4 recommended ACCEPT_EDITS > ceiling MANUAL rejected', has((() => { const p = clone(LAB); p.phases[3].recommendedMode = 'ACCEPT_EDITS'; return p; })(), 'recommended>ceiling'));
check('EP-V4 stricter recommended accepted (MANUAL under ACCEPT_EDITS ceiling)', ok((() => { const p = clone(LAB); p.phases[0].recommendedMode = 'MANUAL'; return p; })()));
for (const f of PHASE_REQUIRED) check('EP-V5 phase missing ' + f + ' rejected', has((() => { const p = clone(LAB); delete p.phases[0][f]; return p; })(), 'missing:' + f));
check('EP-V6 MAIN IMPLEMENT AUTO ceiling rejected', has((() => { const p = clone(MAINB); p.requiresOwnerGo = false; delete p.phases[1].grant; p.phases[1].modeCeiling = 'AUTO'; p.phases[1].recommendedMode = 'AUTO'; return p; })(), 'main-never-auto'));
check('EP-V6 MAIN VERIFY (writes []) AUTO ceiling rejected (r2.1)', has((() => { const p = clone(MAINB); p.phases[2].modeCeiling = 'AUTO'; p.phases[2].recommendedMode = 'AUTO'; return p; })(), 'main-never-auto'));
check('EP-V6 MAIN recommended AUTO rejected', has((() => { const p = clone(MAINB); p.phases[2].recommendedMode = 'AUTO'; return p; })(), 'main-never-auto'));
check('EP-V7 LAB AUTO on IMPLEMENT rejected', has((() => { const p = clone(LAB); p.phases[0].modeCeiling = 'AUTO'; p.phases[0].recommendedMode = 'AUTO'; return p; })(), 'auto-only-verify'));
check('EP-V7 LAB AUTO on VERIFY accepted', ok(LAB));
check('EP-V7 TERMINAL at ACCEPT_EDITS rejected', has((() => { const p = clone(LAB); p.phases[3].modeCeiling = 'ACCEPT_EDITS'; return p; })(), 'terminal-manual'));
check('EP-V7 OWNER lane non-MANUAL rejected', has((() => { const p = clone(LAB); p.appliesToLane = 'OWNER'; return p; })(), 'owner-manual'));
const withGrant = (mut) => { const p = clone(MAINB); mut(p); return p; };
check('EP-V8 grant on VERIFY rejected', has(withGrant((p) => { p.phases[2].grant = clone(p.phases[1].grant); }), 'grant:kind'));
check('EP-V8 grant toMode AUTO rejected', has(withGrant((p) => { p.phases[1].grant.toMode = 'AUTO'; }), 'grant:toMode'));
check('EP-V8 grant paths not in scope.writes rejected', has(withGrant((p) => { p.phases[1].grant.paths = ['netlify/functions/x.js']; }), 'grant:path-not-in-scope'));
check('EP-V8 grant mutexClass QA:browser-runtime rejected', has(withGrant((p) => { p.phases[1].grant.mutexClass = 'QA:browser-runtime'; }), 'grant:mutexClass'));
check('EP-V8 grant on LAB rejected', has(withGrant((p) => { p.appliesToLane = 'LAB'; }), 'grant:main-only'));
check('EP-V8 grant without requiresOwnerGo true rejected', has(withGrant((p) => { p.requiresOwnerGo = false; }), 'grant:requiresOwnerGo'));
check('EP-V8 grant phase with actions [gate-toggle] rejected', has(withGrant((p) => { p.phases[1].actions = ['gate-toggle']; }), 'grant:no-actions'));
check('EP-V8 grant phase with actions [live-external-call] rejected', has(withGrant((p) => { p.phases[1].actions = ['live-external-call']; }), 'grant:no-actions'));
check('EP-V8 grant path .netlify/state.json rejected', has(withGrant((p) => { p.scope.writes.push('.netlify/state.json'); p.phases[1].grant.paths = ['.netlify/state.json']; }), 'grant:forbidden-path'));
check('EP-V8 grant path .git/arc-runtime/x rejected', has(withGrant((p) => { p.scope.writes.push('.git/arc-runtime/x'); p.phases[1].grant.paths = ['.git/arc-runtime/x']; }), 'grant:forbidden-path'));
for (const b of BOUNDARIES) check('EP-V9 inside [' + b + '] rejected (non-grantable)', has((() => { const p = clone(LAB); p.approvalBoundaries.inside = [b]; return p; })(), 'inside:must-be-empty'));
check('EP-V9 inside [] accepted', ok(LAB));
for (const b of BOUNDARIES) check('EP-V9 outside missing ' + b + ' rejected', has((() => { const p = clone(LAB); p.approvalBoundaries.outside = ALL_OUT.filter((x) => x !== b); return p; })(), 'outside:incomplete:' + b));
const withAction = (action, mode, capMut) => { const p = clone(LAB); p.phases[0].actions = [action]; p.phases[0].modeCeiling = mode; p.phases[0].recommendedMode = mode; if (capMut) capMut(p.capabilities); return p; };
check('EP-V10 actions [gate-toggle] at ACCEPT_EDITS rejected', has(withAction('gate-toggle', 'ACCEPT_EDITS', (c) => { c.gates = 'toggle-with-repark'; }), 'actions-require-manual'));
check('EP-V10 actions [gate-toggle] at AUTO rejected', has(withAction('gate-toggle', 'AUTO', (c) => { c.gates = 'toggle-with-repark'; }), 'actions-require-manual'));
check('EP-V10 actions [gate-toggle] at MANUAL accepted', ok(withAction('gate-toggle', 'MANUAL', (c) => { c.gates = 'toggle-with-repark'; })));
check('EP-V10 actions [git-stage] at ACCEPT_EDITS rejected', has(withAction('git-stage', 'ACCEPT_EDITS', (c) => { c.git = 'stage'; }), 'actions-require-manual'));
check('EP-V10 actions [git-stage] at MANUAL accepted', ok(withAction('git-stage', 'MANUAL', (c) => { c.git = 'stage'; })));
check('EP-V10 actions [git-commit] at ACCEPT_EDITS rejected', has(withAction('git-commit', 'ACCEPT_EDITS', (c) => { c.git = 'commit'; }), 'actions-require-manual'));
check('EP-V10 actions [git-push] rejected in any mode', has(withAction('git-push', 'MANUAL'), 'actions:enum'));
check('EP-V10 actions [bogus] rejected', has(withAction('bogus', 'MANUAL'), 'actions:enum'));
check('EP-V11 {SYMBOL} placeholder rejected', has((() => { const p = clone(LAB); p.phases[0].writes = ['<worktree>/lab-{SYMBOL}/**']; return p; })(), 'placeholder'));
check('EP-V11 {task_id} placeholder rejected', has((() => { const p = clone(LAB); p.scope.writes = ['<worktree>/lab-{task_id}/**']; return p; })(), 'placeholder'));
check('EP-V11 {TASK_ID} accepted', ok(LAB));

// ── EP-V14 capability <-> action consistency (exact) ─────────────────────────
console.log('== EP-V14 capability <-> action consistency ==');
check('EP-V14 gates toggle-with-repark without gate-toggle action rejected', has((() => { const p = clone(LAB); p.capabilities.gates = 'toggle-with-repark'; return p; })(), 'gates-without-gate-toggle'));
check('EP-V14 live-provider without live-external-call action rejected', has((() => { const p = clone(LAB); p.capabilities.network = 'live-provider'; return p; })(), 'live-provider-without-action'));
check('EP-V14 git stage without git-stage action rejected', has((() => { const p = clone(LAB); p.capabilities.git = 'stage'; return p; })(), 'consistency:git-stage'));
check('EP-V14 git stage with git-commit action rejected (staging is not committing)', has(withAction('git-commit', 'MANUAL', (c) => { c.git = 'stage'; }), 'consistency:git-stage'));
check('EP-V14 git commit without git-commit action rejected', has((() => { const p = clone(LAB); p.capabilities.git = 'commit'; return p; })(), 'consistency:git-commit'));
check('EP-V14 git commit with git-commit (+git-stage) in MANUAL phases accepted', ok((() => { const p = clone(LAB); p.capabilities.git = 'commit'; p.phases[0].modeCeiling = 'MANUAL'; p.phases[0].recommendedMode = 'MANUAL'; p.phases[0].actions = ['git-stage', 'git-commit']; return p; })()));
check('EP-V14 git read-only with any git action rejected', has(withAction('git-stage', 'MANUAL'), 'consistency:git-read-only'));
check('EP-V14 ownerProfile write without pt-write action rejected', has((() => { const p = clone(LAB); p.capabilities.ownerProfile = 'write'; return p; })(), 'pt-write-capability-without-action'));

// ── EP-V12/V13 the committed library ──────────────────────────────────────────
console.log('== EP-V12/V13 committed library ==');
let libFiles = [];
try { libFiles = fs.readdirSync(abs(REL.libDir)).filter((f) => f.endsWith('.json')).sort(); } catch (e) { check('library directory present (' + e.message + ')', false); }
check('EP-V12 library has exactly the seven canonical profiles', JSON.stringify(libFiles.slice().sort()) === JSON.stringify(LIBRARY_IDS.map((id) => id + '.json').sort()));
check('EP-V12 README.md present', fs.existsSync(abs(path.join(REL.libDir, 'README.md'))));
const seen = new Set();
const hashes = {};
for (const f of libFiles) {
  const raw1 = fs.readFileSync(abs(path.join(REL.libDir, f)), 'utf8');
  const raw2 = fs.readFileSync(abs(path.join(REL.libDir, f)), 'utf8');
  let obj = null;
  try { obj = JSON.parse(raw1); } catch (e) { check(f + ' parses', false); continue; }
  const viol = validateProfile(obj);
  check('EP-V12 ' + f + ' validates' + (viol.length ? ' - ' + viol.join(', ') : ''), viol.length === 0);
  check('EP-V12 ' + f + ' filename == profileId', f === obj.profileId + '.json');
  check('EP-V12 ' + f + ' id unique (case-folded)', !seen.has(String(obj.profileId).toLowerCase()));
  seen.add(String(obj.profileId).toLowerCase());
  check('EP-V12 ' + f + ' carries no libraryHash (publisher-owned)', !('libraryHash' in obj));
  const lf = raw1.replace(/\r/g, '');
  check('EP-V13 ' + f + ' canonical serialization (JSON.stringify 2-space + trailing LF)', lf === JSON.stringify(JSON.parse(lf), null, 2) + '\n');
  hashes[f] = sha256(lf);
  check('EP-V13 ' + f + ' hash stable across reads', sha256(raw2.replace(/\r/g, '')) === hashes[f]);
  if (obj.appliesToLane === 'MAIN') check('EP-V12 ' + f + ' (MAIN) has no AUTO anywhere', obj.phases.every((ph) => ph.modeCeiling !== 'AUTO' && ph.recommendedMode !== 'AUTO'));
  if (obj.profileId === 'LAB-SANDBOX-STATIC') check('EP-V12 LAB-SANDBOX-STATIC ladder == owner-specified BUILD A/A, RUN AUTO/AUTO, HANDOFF A/A, CLOSE M/M', JSON.stringify(obj.phases.map((p) => [p.id, p.recommendedMode, p.modeCeiling])) === JSON.stringify([['BUILD', 'ACCEPT_EDITS', 'ACCEPT_EDITS'], ['RUN', 'AUTO', 'AUTO'], ['HANDOFF', 'ACCEPT_EDITS', 'ACCEPT_EDITS'], ['CLOSE', 'MANUAL', 'MANUAL']]));
  if (obj.profileId === 'OWNER-MANUAL') check('EP-V12 OWNER-MANUAL all MANUAL', obj.phases.every((ph) => ph.modeCeiling === 'MANUAL' && ph.recommendedMode === 'MANUAL'));
  if (obj.profileId === 'MAIN-GATED-LIVE-QA') {
    const declaring = obj.phases.filter((ph) => Array.isArray(ph.actions) && ph.actions.some((a) => a === 'gate-toggle' || a === 'live-external-call'));
    check('EP-V12 MAIN-GATED-LIVE-QA declares gate-toggle and live-external-call', declaring.length > 0 && obj.phases.some((ph) => (ph.actions || []).includes('gate-toggle')) && obj.phases.some((ph) => (ph.actions || []).includes('live-external-call')));
    check('EP-V12 MAIN-GATED-LIVE-QA every gate/live phase is MANUAL/MANUAL', declaring.every((ph) => ph.modeCeiling === 'MANUAL' && ph.recommendedMode === 'MANUAL'));
    check('EP-V12 MAIN-GATED-LIVE-QA has no grant', obj.phases.every((ph) => !('grant' in ph)));
  }
  if (obj.profileId === 'MAIN-CODE-SLICE-BOUNDED') check('EP-V12 MAIN-CODE-SLICE-BOUNDED: requiresOwnerGo true + grant on IMPLEMENT only', obj.requiresOwnerGo === true && obj.phases.filter((ph) => 'grant' in ph).length === 1 && obj.phases.find((ph) => 'grant' in ph).kind === 'IMPLEMENT');
  check('EP-V12 ' + f + ' git capability is read-only (no library profile stages or commits)', !!(obj.capabilities && obj.capabilities.git === 'read-only'));
}
if (libFiles.length) { console.log('  library hashes (sha256 of CR-stripped bytes):'); for (const f of Object.keys(hashes)) console.log('    ' + f.padEnd(32) + hashes[f]); }

// ── EP-V15 legacy compatibility + P-B/P-C inactivity ───────────────────────
console.log('== EP-V15 legacy compatibility + inactivity ==');
let planSchema = null;
try { planSchema = JSON.parse(readText(REL.planSchema)); } catch (e) { check('plan.schema.json parses', false); }
if (planSchema) {
  check('EP-V15 plan.schema required unchanged (no executionProfiles)', JSON.stringify(planSchema.required) === JSON.stringify(['planId', 'source', 'sourceHash', 'repoRef', 'generatedAt', 'mutexRegistry', 'tasks']));
  check('EP-V15 task required unchanged (no executionProfile)', JSON.stringify(planSchema.$defs.task.required) === JSON.stringify(['id', 'lane', 'entryMode', 'requiresOwnerGo', 'closeCondition']));
  check('EP-V15 plan.schema has OPTIONAL executionProfiles map referencing execution-profile.schema.json', !!(planSchema.properties.executionProfiles && planSchema.properties.executionProfiles.additionalProperties && planSchema.properties.executionProfiles.additionalProperties.$ref === 'execution-profile.schema.json'));
  check('EP-V15 task has OPTIONAL executionProfile id with the library pattern', !!(planSchema.$defs.task.properties.executionProfile && planSchema.$defs.task.properties.executionProfile.pattern === '^[A-Z0-9]([A-Z0-9-]*[A-Z0-9])?$'));
  if (fs.existsSync(abs(REL.v3Plan))) {
    const v3 = JSON.parse(readText(REL.v3Plan));
    const v3Ok = !('executionProfiles' in v3)
      && planSchema.required.every((k) => k in v3)
      && v3.tasks.every((t) => planSchema.$defs.task.required.every((k) => k in t) && !('executionProfile' in t));
    check('EP-V15 live v3 snapshot has no executionProfiles and still satisfies required keys (no legacy republish)', v3Ok);
  } else {
    console.log('  (v3 runtime snapshot absent - legacy snapshot check skipped; schema-level checks still apply)');
  }
}
// P-B (B1) and P-C (B2) are implemented: the publisher surfaces carry the profile vocabulary and
// the committed helper scripts; the worker and authorize surfaces carry the profile binding,
// phase handshake and ladder-print vocabulary (arc-worker/scripts/phase-gate.js).
for (const f of REL.publisherActive) {
  const t = fs.existsSync(abs(f)) ? readText(f) : '';
  check('EP-V15 publisher active (P-B): ' + f + ' carries P-V21..26 / resolver vocabulary', /P-V2[1-6]\b/.test(t) && /executionProfile|resolve-profiles\.js|--dry-run/.test(t));
}
check('EP-V15 publisher active (P-B): SKILL.md documents --dry-run', /--dry-run/.test(readText('.claude/skills/arc-publish-plan/SKILL.md')));
for (const f of REL.workerActive) {
  const t = fs.existsSync(abs(f)) ? readText(f) : '';
  check('EP-V15 worker active (P-C): ' + f + ' carries the profile binding / phase-gate vocabulary', /executionProfile|phase-gate\.js/.test(t));
}
check('EP-V15 P-C artifact arc-worker/scripts/phase-gate.js present', fs.existsSync(abs('.claude/skills/arc-worker/scripts/phase-gate.js')));
let pbLib = null;
try { pbLib = require(abs(REL.publisherLib)); } catch (e) { console.log('  (P-B library not loadable: ' + e.message.split('\n')[0] + ')'); }
check('EP-V15 P-B library profile-contract.js loads', !!pbLib);
check('EP-V15 P-B resolver script resolve-profiles.js present', fs.existsSync(abs(REL.publisherCli)));
if (pbLib) {
  for (const fn of ['validateProfile', 'canonicalize', 'libraryHash', 'planCheck']) check('EP-V15 P-B library exports ' + fn, typeof pbLib[fn] === 'function');
  for (const f of libFiles) {
    const obj = JSON.parse(fs.readFileSync(abs(path.join(REL.libDir, f)), 'utf8').replace(/\r/g, ''));
    check('EP-V15 P-B lib.validateProfile agrees with the mirror on ' + f, pbLib.validateProfile(obj).length === 0 && validateProfile(obj).length === 0);
    check('EP-V15 P-B lib.libraryHash(' + f + ') == sha256(CR-stripped file) (K3)', pbLib.libraryHash(obj) === hashes[f]);
  }
}
check('EP-V15 arc-worker/SKILL.md allowed-tools includes Edit (D-17, B2)', /^allowed-tools:.*\bEdit\b/m.test(readText('.claude/skills/arc-worker/SKILL.md').replace(/\r/g, '')));
check('EP-V15 contract doc present and labels P-C as implemented (B2)', fs.existsSync(abs(REL.contractDoc)) && /P-C/.test(readText(REL.contractDoc)) && /implemented in B2/.test(readText(REL.contractDoc)) && !/P-C[^\n]*not implemented/.test(readText(REL.contractDoc)));

console.log('\n' + (failed === 0 ? 'ARC EXECUTION PROFILES (P-A): PASS (' + total + ' asserts)' : 'ARC EXECUTION PROFILES (P-A): FAIL (' + failed + ' of ' + total + ' asserts failed)'));
assert.strictEqual(failed, 0, failures.slice(0, 12).join(' | '));
