'use strict';

/*
 * arc-publish-plan/scripts/lib/profile-contract.js
 *
 * Execution Profile V1.2 — P-B publisher contract library (Multi-ARC V1 ULTRAPLAN r3 §4-B1).
 * Pure Node, CommonJS, zero dependencies, no git, NO WRITES. Everything here is a pure
 * function over in-memory objects except the explicitly read-only helpers `loadLibrary`,
 * `readSkillFrontmatter` and `runtimeChecks`, which only read.
 *
 * Consumers: scripts/resolve-profiles.js (the publisher's RESOLVE step), the QA mirrors, and
 * (P-C, B2) arc-worker/scripts/phase-gate.js, which must `require` `deriveLockouts` and
 * `renderLadder` rather than re-implement them.
 *
 * Contracts (r3 §3): K2 embedded snapshot = plan.executionProfiles{ "<ID>": object +
 * libraryHash after version }, keys sorted, one per distinct id, 2-space + LF.
 * K3 libraryHash = sha256(JSON.stringify(obj − libraryHash, null, 2) + '\n') ≡ sha256 of the
 * CR-stripped library file. Rule wording for P-V23(d) and P-V24 follows the owner's ratified
 * text of 2026-08-22 (see references/plan-validation.md).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── vocabulary (mirrors execution-profile.schema.json and plan.schema.json) ──
const MODES = ['MANUAL', 'ACCEPT_EDITS', 'AUTO'];
const RANK = { MANUAL: 0, ACCEPT_EDITS: 1, AUTO: 2 };
const MODE_ABBR = { MANUAL: 'M', ACCEPT_EDITS: 'A', AUTO: 'AUTO' };
const KINDS = ['PLAN', 'IMPLEMENT', 'VERIFY', 'REPORT', 'TERMINAL'];
const GATES = ['NONE', 'AUTHORIZED_JSON', 'OWNER_TYPES_SKILL', 'OWNER_TYPED_LITERAL'];
const LANES = ['MAIN', 'LAB', 'COWORK', 'OWNER'];
const ENTRY_MODES = ['DIRECT', 'PLAN'];
const BOUNDARIES = ['git-stage', 'git-commit', 'git-push', 'deploy', 'env-change', 'gate-toggle',
  'live-external-call', 'pt-write', 'runtime-mutation-other-claim', 'scope-expansion', 'production'];
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
const MUTEX_REGISTRY = ['AUTHORITY:published-plan', 'CODE:index-html', 'CODE:netlify-functions', 'DEPLOY:netlify',
  'EXTERNAL:live-provider', 'QA:browser-runtime', 'RUNTIME:gates', 'RUNTIME:owner-profile'];
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
const TASK_ID_RE = /^[A-Z0-9]([A-Z0-9._-]*[A-Z0-9])?$/;
const PLAN_ID_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
const SOURCE_RE = /^\.ai-reports\/[A-Za-z0-9._/-]+\.md$/;
const HEX64_RE = /^[a-f0-9]{64}$/;
const HEX40_RE = /^[a-f0-9]{40}$/;
const ISO_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;
const RESERVED_TASK_IDS = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
const RESERVED_PLAN_IDS = ['arcs'];
const LIVE_STATES = ['CLAIMED', 'WAITING_OWNER_GO', 'AUTHORIZED', 'BLOCKED'];
const PLAN_TOP_REQUIRED = ['planId', 'source', 'sourceHash', 'repoRef', 'generatedAt', 'mutexRegistry', 'tasks'];
const PLAN_TOP_OPTIONAL = ['safeParallelSets', 'executionProfiles'];
const TASK_REQUIRED = ['id', 'lane', 'entryMode', 'requiresOwnerGo', 'closeCondition'];
const TASK_OPTIONAL = ['mutexes', 'dependsOn', 'priority', 'stopCondition', 'notes', 'mayParallelWith', 'mustNotParallelWith', 'executionProfile'];
// P-V25 / P-V23 code surfaces: the special CODE mutex mapping. Used ONLY for class resolution
// (hard grant-class checks and lock-outs) — never to narrow the MAIN grant boundary of P-V23(d).
const CODE_SURFACES = [
  { re: /^(branch-dev:)?index\.html$/, class: 'CODE:index-html' },
  { re: /^(branch-dev:)?netlify\/(functions\/)?\*\*$/, class: 'CODE:netlify-functions' }
];
const NEVER_WRITABLE = [/^\.git\//, /^\.netlify\//, /^netlify\.toml$/, /^\.env/, /pt_/];
const RUNTIME_WRITE_RE = /^(claims\/|arc-claims\/|mutex\/|\.git\/arc-runtime\/)/;
const AI_REPORTS_RE = /^\.ai-reports\//;
const SANDBOX_RE = /^<worktree>\//;
const RULE_ORDER = ['P-V1', 'P-V2', 'P-V3', 'P-V4', 'P-V5', 'P-V6', 'P-V7', 'P-V8', 'P-V9', 'P-V11', 'P-V13', 'P-V15', 'P-V21', 'P-V22', 'P-V23', 'P-V24', 'P-V25', 'P-V26'];
const RULE_LABEL = {
  'P-V1': 'task fields complete', 'P-V2': 'ids unique / normalized / fs-safe', 'P-V3': 'lanes valid, HERDR absent',
  'P-V4': 'entryMode in {DIRECT, PLAN}', 'P-V5': 'mutex classes in registry', 'P-V6': 'dependencies resolve',
  'P-V7': 'no dependency cycles', 'P-V8': 'mustNotParallelWith symmetric', 'P-V9': 'no parallel-set mutex conflict',
  'P-V11': 'planId not reserved / not already published', 'P-V13': 'no live claims against outgoing plan',
  'P-V15': 'conditions literal, never pointers', 'P-V21': 'profiles present and resolvable',
  'P-V22': 'profile lane matches task lane', 'P-V23': 'mode ceilings and recommendations',
  'P-V24': 'entry-mode agreement', 'P-V25': 'scope <-> mutex coverage', 'P-V26': 'required skills invocable'
};

// ── primitives ───────────────────────────────────────────────────────────────
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const isStrArr = (x) => Array.isArray(x) && x.every((s) => typeof s === 'string');
const stripCR = (text) => String(text).replace(/\r/g, '');
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const canonicalize = (obj) => JSON.stringify(obj, null, 2) + '\n';
const clone = (o) => JSON.parse(JSON.stringify(o));

function withoutLibraryHash(profile) {
  const out = {};
  for (const k of Object.keys(profile)) if (k !== 'libraryHash') out[k] = profile[k];
  return out;
}
function libraryHash(profile) { return sha256(canonicalize(withoutLibraryHash(profile))); }
function embedProfile(profile, hash) {
  const h = hash || libraryHash(profile);
  const out = { profileId: profile.profileId, version: profile.version, libraryHash: h };
  for (const k of Object.keys(profile)) if (k !== 'profileId' && k !== 'version' && k !== 'libraryHash') out[k] = profile[k];
  return out;
}

// ── executable mirror of execution-profile.schema.json (EP-V1…V11, V14) ─────
function validateProfile(p) {
  const v = [];
  const keysOk = (obj, req, opt, where) => {
    for (const k of req) if (!(k in obj)) v.push(where + ':missing:' + k);
    for (const k of Object.keys(obj)) if (!req.includes(k) && !opt.includes(k)) v.push(where + ':unknown:' + k);
  };
  if (!isObj(p)) return ['profile:not-object'];
  keysOk(p, TOP_REQUIRED, TOP_OPTIONAL, 'profile');
  if (typeof p.profileId !== 'string' || !PROFILE_ID_RE.test(p.profileId) || p.profileId.length > 32) v.push('profileId:pattern');
  if (!Number.isInteger(p.version) || p.version < 1) v.push('version:int');
  if ('libraryHash' in p && !HEX64_RE.test(String(p.libraryHash))) v.push('libraryHash:pattern');
  if ('requiresOwnerGo' in p && typeof p.requiresOwnerGo !== 'boolean') v.push('requiresOwnerGo:type');
  if (!LANES.includes(p.appliesToLane)) v.push('appliesToLane:enum');
  if (isObj(p.scope)) {
    keysOk(p.scope, SCOPE_REQUIRED, [], 'scope');
    if (typeof p.scope.worktree !== 'string' || !/^([a-z0-9.-]+|none)$/.test(p.scope.worktree)) v.push('scope.worktree:pattern');
    if (!(p.scope.pinnedRef === 'PLAN_REPO_REF' || HEX40_RE.test(String(p.scope.pinnedRef)))) v.push('scope.pinnedRef:pattern');
    for (const k of ['writes', 'readOnly', 'forbidden']) {
      if (!isStrArr(p.scope[k])) v.push('scope.' + k + ':strings');
      else if (k === 'writes') p.scope[k].forEach((s) => { if (!PLACEHOLDER_RE.test(s)) v.push('scope.writes:placeholder'); });
    }
  } else v.push('scope:object');
  if (isObj(p.capabilities)) {
    keysOk(p.capabilities, Object.keys(CAP), [], 'capabilities');
    for (const k of Object.keys(CAP)) if (!CAP[k].includes(p.capabilities[k])) v.push('capabilities.' + k + ':enum');
  } else v.push('capabilities:object');
  if (isObj(p.tools)) { keysOk(p.tools, ['allowed', 'forbidden'], [], 'tools'); if (!isStrArr(p.tools.allowed) || !isStrArr(p.tools.forbidden)) v.push('tools:strings'); } else v.push('tools:object');
  if (isObj(p.skills)) { keysOk(p.skills, ['required', 'demandOnly', 'ownerInvokedOnly'], [], 'skills'); for (const k of ['required', 'demandOnly', 'ownerInvokedOnly']) if (!isStrArr(p.skills[k])) v.push('skills.' + k + ':strings'); } else v.push('skills:object');
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
  if (isObj(p.verification)) { keysOk(p.verification, VERIF_REQUIRED, [], 'verification'); if (!isStrArr(p.verification.suites)) v.push('verification.suites:strings'); } else v.push('verification:object');
  if (!Array.isArray(p.triggers)) v.push('triggers:array');
  else p.triggers.forEach((t, i) => { if (!isObj(t)) { v.push('trigger[' + i + ']:object'); return; } keysOk(t, ['on', 'action'], ['reason'], 'trigger[' + i + ']'); if (!TRIGGER_ON.includes(t.on)) v.push('trigger[' + i + ']:on'); if (!TRIGGER_ACTION.includes(t.action)) v.push('trigger[' + i + ']:action'); });
  if (isObj(p.cleanup)) keysOk(p.cleanup, CLEANUP_REQUIRED, [], 'cleanup'); else v.push('cleanup:object');
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

// ── library access (read-only) ───────────────────────────────────────────────
function libraryFromEntries(entries, dir) {
  const lib = { dir: dir || null, profiles: {}, errors: [] };
  const seen = new Set();
  for (const e of entries) {
    if (e.error) { lib.errors.push(e.error); continue; }
    const id = e.obj.profileId;
    if (typeof id !== 'string') { lib.errors.push({ file: e.file, code: 'profileId', message: e.file + ': profileId missing or not a string' }); continue; }
    if (e.file !== id + '.json') lib.errors.push({ file: e.file, code: 'filename', message: e.file + ': file name does not equal profileId + .json (' + id + ')' });
    if ('libraryHash' in e.obj) lib.errors.push({ file: e.file, code: 'libraryHash', message: e.file + ': a library file must never carry libraryHash (publisher-owned)' });
    if (e.fileHash !== e.canonicalHash) lib.errors.push({ file: e.file, code: 'canonical', message: e.file + ': library file is not canonical (file hash ' + e.fileHash.slice(0, 12) + '... != canonical hash ' + e.canonicalHash.slice(0, 12) + '...); tampered or re-serialized' });
    const folded = id.toLowerCase();
    if (seen.has(folded)) lib.errors.push({ file: e.file, code: 'duplicate', message: e.file + ': duplicate profile id (case-folded) ' + id });
    seen.add(folded);
    lib.profiles[id] = { id, file: e.file, obj: e.obj, raw: e.raw, fileHash: e.fileHash, canonicalHash: e.canonicalHash };
  }
  return lib;
}

function loadLibrary(dir) {
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error('library directory not found: ' + dir);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const entries = files.map((file) => {
    const raw = stripCR(fs.readFileSync(path.join(dir, file), 'utf8'));
    let obj;
    try { obj = JSON.parse(raw); } catch (e) { return { file, error: { file, code: 'parse', message: file + ': cannot parse library file (' + e.message + ')' } }; }
    if (!isObj(obj)) return { file, error: { file, code: 'parse', message: file + ': library file is not a JSON object' } };
    return { file, obj, raw, fileHash: sha256(raw), canonicalHash: sha256(canonicalize(obj)) };
  });
  return libraryFromEntries(entries, dir);
}

function libraryFromObjects(objects) {
  const entries = objects.map((obj) => {
    const text = canonicalize(obj);
    return { file: String(obj && obj.profileId) + '.json', obj: clone(obj), raw: text, fileHash: sha256(text), canonicalHash: sha256(text) };
  });
  return libraryFromEntries(entries, null);
}

function readSkillFrontmatter(skillsRoot, name) {
  const file = path.join(skillsRoot, name, 'SKILL.md');
  if (!fs.existsSync(file)) return { name, path: file, exists: false, disableModelInvocation: null, frontmatter: null };
  const lines = stripCR(fs.readFileSync(file, 'utf8')).split('\n');
  const fm = [];
  if (lines[0] && lines[0].trim() === '---') {
    for (let i = 1; i < lines.length; i += 1) { if (lines[i].trim() === '---') break; fm.push(lines[i]); }
  }
  let disable = false;
  for (const l of fm) {
    const m = l.match(/^\s*disable-model-invocation\s*:\s*(.+?)\s*$/);
    if (m) disable = m[1].toLowerCase() === 'true';
  }
  return { name, path: file, exists: true, disableModelInvocation: disable, frontmatter: fm.join('\n') };
}

// ── source rule (P-V21): a source never authors executionProfiles ───────────
function sourceAuthorsProfiles(text) {
  let inFence = false;
  for (const rawLine of stripCR(String(text)).split('\n')) {
    const line = rawLine.trim();
    if (/^(```|~~~)/.test(line)) { inFence = !inFence; if (inFence && /executionProfiles/.test(line)) return true; continue; }
    if (inFence) { if (/executionProfiles/.test(line)) return true; continue; }
    if (line.startsWith('|')) {
      const cells = line.split('|').map((c) => c.replace(/[`*_]/g, '').trim());
      if (cells.some((c) => c === 'executionProfiles')) return true;
    }
  }
  return false;
}

// ── P-V25 helpers (shared with P-C phase-gate.js) ────────────────────────────
function codeClassFor(write) {
  for (const s of CODE_SURFACES) if (s.re.test(write)) return s.class;
  return null;
}
function deriveLockouts(taskMutexes, profile) {
  const held = Array.isArray(taskMutexes) ? taskMutexes : [];
  const out = [];
  const seen = new Set();
  const consider = (w) => { const c = codeClassFor(w); if (c && !held.includes(c) && !seen.has(w)) { seen.add(w); out.push({ surface: w, class: c }); } };
  if (isObj(profile) && isObj(profile.scope) && isStrArr(profile.scope.writes)) profile.scope.writes.forEach(consider);
  if (isObj(profile) && Array.isArray(profile.phases)) profile.phases.forEach((ph) => { if (isObj(ph) && isStrArr(ph.writes)) ph.writes.forEach(consider); });
  return out;
}
function renderLadder(profile) {
  return profile.phases.map((ph) => ph.id + ' ' + MODE_ABBR[ph.recommendedMode] + '/' + MODE_ABBR[ph.modeCeiling]).join(' → ');
}
function requiredClasses(task, profile) {
  const need = [];
  const add = (cls, why) => { if (!need.some((n) => n.class === cls)) need.push({ class: cls, why }); };
  const c = profile.capabilities || {};
  if (c.browser === 'isolated-profile') { add('QA:browser-runtime', 'browser: isolated-profile'); add('CODE:index-html', 'build-stability rule (browser QA against a stable build)'); }
  if (c.browser === 'owner-profile') add('RUNTIME:owner-profile', 'browser: owner-profile (D-21: RUNTIME:owner-profile only)');
  if (c.ownerProfile === 'read' || c.ownerProfile === 'write') add('RUNTIME:owner-profile', 'ownerProfile: ' + c.ownerProfile);
  if (c.gates === 'toggle-with-repark') add('RUNTIME:gates', 'gates: toggle-with-repark');
  if (c.network === 'live-provider') add('EXTERNAL:live-provider', 'network: live-provider');
  (profile.phases || []).forEach((ph) => {
    if (isObj(ph.grant) && typeof ph.grant.mutexClass === 'string') add(ph.grant.mutexClass, 'grant on phase ' + ph.id);
    (ph.actions || []).forEach((a) => {
      if (a === 'gate-toggle') add('RUNTIME:gates', 'action gate-toggle (phase ' + ph.id + ')');
      if (a === 'live-external-call') add('EXTERNAL:live-provider', 'action live-external-call (phase ' + ph.id + ')');
      if (a === 'pt-write') add('RUNTIME:owner-profile', 'action pt-write (phase ' + ph.id + ')');
    });
  });
  return need;
}

// ── P-V15 helper ─────────────────────────────────────────────────────────────
function pointerReason(value) {
  const s = String(value).replace(/[*_`]/g, '').trim();
  if (s === '') return 'd';
  if (/^(see|per|refer to|as in|as per|cf\.)\b/i.test(s)) return 'a';
  if (/(§|section\s+\d|table\s+\d|appendix)/i.test(s)) return 'b';
  if (/^as\s+[A-Z0-9][A-Z0-9._-]*$/.test(s)) return 'c';
  if (s.split(/\s+/).filter(Boolean).length < 3) return 'e';
  return null;
}

// ── planCheck: P-V1…P-V9, P-V11 (reserved), P-V15, P-V21…P-V26 ───────────────
function planCheck(plan, opts) {
  opts = opts || {};
  const library = opts.library || null;
  const skillsRoot = opts.skillsRoot || null;
  const requireProfiles = opts.requireProfiles !== false;
  const allowEmbedded = opts.allowEmbedded === true;
  const res = { ok: false, violations: [], warnings: [], lockouts: [], profilesUsed: [], rules: {} };
  const add = (rule, detail) => { res.violations.push(Object.assign({ rule, task: null, phase: null, field: null, value: null }, detail, { message: rule + ' REFUSED - ' + detail.message })); };
  const warn = (rule, detail) => { res.warnings.push(Object.assign({ rule, task: null }, detail, { message: rule + ' WARN - ' + detail.message })); };

  if (!isObj(plan)) { add('P-V1', { message: 'plan is not an object' }); return finish(); }

  // P-V1 — shape
  for (const k of PLAN_TOP_REQUIRED) if (!(k in plan)) add('P-V1', { field: k, message: 'plan is missing required field ' + k });
  for (const k of Object.keys(plan)) if (!PLAN_TOP_REQUIRED.includes(k) && !PLAN_TOP_OPTIONAL.includes(k)) add('P-V1', { field: k, message: 'plan carries unknown field ' + k });
  if (typeof plan.planId !== 'string' || !PLAN_ID_RE.test(plan.planId) || plan.planId.length > 96) add('P-V1', { field: 'planId', value: plan.planId, message: 'planId "' + plan.planId + '" does not match ' + PLAN_ID_RE });
  if (typeof plan.source !== 'string' || !SOURCE_RE.test(plan.source)) add('P-V1', { field: 'source', value: plan.source, message: 'source "' + plan.source + '" is not a repo-relative .ai-reports path' });
  if (!HEX64_RE.test(String(plan.sourceHash))) add('P-V1', { field: 'sourceHash', value: plan.sourceHash, message: 'sourceHash is not a sha256 hex' });
  if (!HEX40_RE.test(String(plan.repoRef))) add('P-V1', { field: 'repoRef', value: plan.repoRef, message: 'repoRef is not a 40-char commit sha' });
  if (!ISO_RE.test(String(plan.generatedAt))) add('P-V1', { field: 'generatedAt', value: plan.generatedAt, message: 'generatedAt is not an ISO UTC timestamp' });
  if (!Array.isArray(plan.mutexRegistry) || plan.mutexRegistry.length < 1) add('P-V1', { field: 'mutexRegistry', message: 'mutexRegistry must be a non-empty array' });
  else {
    if (new Set(plan.mutexRegistry).size !== plan.mutexRegistry.length) add('P-V1', { field: 'mutexRegistry', message: 'mutexRegistry has duplicates' });
    plan.mutexRegistry.forEach((c) => { if (!MUTEX_REGISTRY.includes(c)) add('P-V5', { field: 'mutexRegistry', value: c, message: 'mutexRegistry names unknown class "' + c + '"' }); });
  }
  if ('safeParallelSets' in plan) {
    if (!Array.isArray(plan.safeParallelSets)) add('P-V1', { field: 'safeParallelSets', message: 'safeParallelSets must be an array' });
    else plan.safeParallelSets.forEach((s, i) => {
      if (!isObj(s) || typeof s.name !== 'string' || !s.name || !Array.isArray(s.taskIds) || s.taskIds.length < 1) add('P-V1', { field: 'safeParallelSets[' + i + ']', message: 'safeParallelSets[' + i + '] must be { name, taskIds[] }' });
      else for (const k of Object.keys(s)) if (k !== 'name' && k !== 'taskIds') add('P-V1', { field: 'safeParallelSets[' + i + '].' + k, message: 'safeParallelSets[' + i + '] carries unknown field ' + k });
    });
  }
  // executionProfiles: publisher-owned; authored ⇒ P-V21 (unless re-checking resolved output)
  if ('executionProfiles' in plan) {
    if (!allowEmbedded) add('P-V21', { field: 'executionProfiles', message: 'the plan carries an authored executionProfiles field; profiles are resolved from the library by the publisher, never authored' });
    else if (!isObj(plan.executionProfiles)) add('P-V21', { field: 'executionProfiles', message: 'executionProfiles must be an object' });
    else {
      const ids = Object.keys(plan.executionProfiles);
      if (JSON.stringify(ids) !== JSON.stringify(ids.slice().sort())) add('P-V21', { field: 'executionProfiles', message: 'executionProfiles keys are not sorted' });
      ids.forEach((id) => {
        const e = plan.executionProfiles[id];
        if (!isObj(e) || e.profileId !== id) { add('P-V21', { field: 'executionProfiles.' + id, message: 'embedded profile key ' + id + ' does not match its profileId' }); return; }
        if (!HEX64_RE.test(String(e.libraryHash))) add('P-V21', { field: 'executionProfiles.' + id + '.libraryHash', message: 'embedded profile ' + id + ' has no valid libraryHash' });
        else if (libraryHash(e) !== e.libraryHash) add('P-V21', { field: 'executionProfiles.' + id + '.libraryHash', value: e.libraryHash, message: 'embedded profile ' + id + ' libraryHash ' + e.libraryHash.slice(0, 12) + '... does not equal the hash re-derived from the embedded bytes' });
        const viol = validateProfile(withoutLibraryHash(e));
        if (viol.length) add('P-V21', { field: 'executionProfiles.' + id, message: 'embedded profile ' + id + ' does not validate: ' + viol.join(', ') });
        if (Object.keys(e).slice(0, 3).join(',') !== 'profileId,version,libraryHash') add('P-V21', { field: 'executionProfiles.' + id, message: 'embedded profile ' + id + ' key order must be profileId, version, libraryHash, ...' });
      });
    }
  }
  if (!Array.isArray(plan.tasks) || plan.tasks.length < 1) { add('P-V1', { field: 'tasks', message: 'tasks must be a non-empty array' }); return finish(); }
  const tasks = plan.tasks;
  const ids = [];
  tasks.forEach((t, i) => {
    const where = isObj(t) && typeof t.id === 'string' ? t.id : 'tasks[' + i + ']';
    if (!isObj(t)) { add('P-V1', { task: where, message: 'task ' + where + ' is not an object' }); return; }
    for (const k of TASK_REQUIRED) if (!(k in t)) add('P-V1', { task: where, field: k, message: 'task ' + where + ' is missing required field ' + k });
    for (const k of Object.keys(t)) if (!TASK_REQUIRED.includes(k) && !TASK_OPTIONAL.includes(k)) add('P-V1', { task: where, field: k, message: 'task ' + where + ' carries unknown field ' + k });
    if (typeof t.requiresOwnerGo !== 'boolean') add('P-V1', { task: where, field: 'requiresOwnerGo', value: t.requiresOwnerGo, message: 'task ' + where + ' requiresOwnerGo must be boolean' });
    if ('priority' in t && (!Number.isInteger(t.priority) || t.priority < 1)) add('P-V1', { task: where, field: 'priority', value: t.priority, message: 'task ' + where + ' priority must be an integer >= 1' });
    for (const k of ['mutexes', 'dependsOn', 'mayParallelWith', 'mustNotParallelWith']) if (k in t && (!isStrArr(t[k]) || new Set(t[k]).size !== t[k].length)) add('P-V1', { task: where, field: k, message: 'task ' + where + ' ' + k + ' must be a unique string array' });
    for (const k of ['closeCondition', 'stopCondition', 'notes']) if (k in t && typeof t[k] !== 'string') add('P-V1', { task: where, field: k, message: 'task ' + where + ' ' + k + ' must be a string' });
    if ('closeCondition' in t && typeof t.closeCondition === 'string' && t.closeCondition.length < 1) add('P-V1', { task: where, field: 'closeCondition', message: 'task ' + where + ' closeCondition is empty' });
    if ('stopCondition' in t && typeof t.stopCondition === 'string' && t.stopCondition.length < 1) add('P-V1', { task: where, field: 'stopCondition', message: 'task ' + where + ' stopCondition is empty' });
    ids.push(t.id);
  });
  const byId = {};
  tasks.forEach((t) => { if (isObj(t) && typeof t.id === 'string') byId[t.id] = t; });

  // P-V2 — ids
  const folded = new Set();
  tasks.forEach((t) => {
    if (!isObj(t)) return;
    const id = t.id;
    if (typeof id !== 'string') { add('P-V2', { task: String(id), message: 'task id ' + JSON.stringify(id) + ' is not a string' }); return; }
    if (id.startsWith('__')) add('P-V2', { task: id, value: id, message: 'task id "' + id + '" begins with __ (reserved for __PUBLISH__ / __OWNER__)' });
    else if (!TASK_ID_RE.test(id) || id.length > 64) add('P-V2', { task: id, value: id, message: 'task id "' + id + '" is not uppercase / filesystem-safe / <= 64 chars' });
    if (RESERVED_TASK_IDS.includes(id)) add('P-V2', { task: id, value: id, message: 'task id "' + id + '" is a Windows reserved device name' });
    const f = id.toLowerCase();
    if (folded.has(f)) add('P-V2', { task: id, value: id, message: 'task id "' + id + '" collides case-folded with another task' });
    folded.add(f);
  });
  // P-V3 / P-V4
  tasks.forEach((t) => {
    if (!isObj(t)) return;
    if (t.lane === 'HERDR') add('P-V3', { task: t.id, field: 'lane', value: t.lane, message: 'task ' + t.id + ' declares lane "HERDR"; HERDR is not an execution lane' });
    else if (!LANES.includes(t.lane)) add('P-V3', { task: t.id, field: 'lane', value: t.lane, message: 'task ' + t.id + ' declares lane "' + t.lane + '"' });
    if (!ENTRY_MODES.includes(t.entryMode)) add('P-V4', { task: t.id, field: 'entryMode', value: t.entryMode, message: 'task ' + t.id + ' declares entryMode "' + t.entryMode + '"' });
  });
  // P-V5 — classes
  const registry = Array.isArray(plan.mutexRegistry) ? plan.mutexRegistry : [];
  tasks.forEach((t) => {
    if (!isObj(t) || !isStrArr(t.mutexes)) return;
    t.mutexes.forEach((c) => { if (!MUTEX_REGISTRY.includes(c) || !registry.includes(c)) add('P-V5', { task: t.id, field: 'mutexes', value: c, message: 'task ' + t.id + ' references unknown mutex class "' + c + '"' }); });
  });
  // P-V6 — dependencies
  tasks.forEach((t) => {
    if (!isObj(t) || !isStrArr(t.dependsOn)) return;
    t.dependsOn.forEach((d) => { if (!(d in byId)) add('P-V6', { task: t.id, field: 'dependsOn', value: d, message: 'task ' + t.id + ' depends on "' + d + '", which is not a task in this plan' }); });
  });
  // P-V7 — cycles
  const state = {};
  const stack = [];
  const reported = new Set();
  const visit = (id) => {
    if (state[id] === 2) return;
    if (state[id] === 1) {
      const cyc = stack.slice(stack.indexOf(id)).concat([id]);
      const key = cyc.slice().sort().join('|');
      if (!reported.has(key)) { reported.add(key); add('P-V7', { task: id, message: 'dependency cycle: ' + cyc.join(' -> ') }); }
      return;
    }
    state[id] = 1; stack.push(id);
    const t = byId[id];
    if (t && isStrArr(t.dependsOn)) t.dependsOn.forEach((d) => { if (d in byId) visit(d); });
    stack.pop(); state[id] = 2;
  };
  Object.keys(byId).forEach(visit);
  // P-V8 — symmetry
  tasks.forEach((t) => {
    if (!isObj(t) || !isStrArr(t.mustNotParallelWith)) return;
    t.mustNotParallelWith.forEach((o) => {
      const other = byId[o];
      if (!other) add('P-V8', { task: t.id, value: o, message: t.id + ' excludes "' + o + '", which is not a task in this plan' });
      else if (!isStrArr(other.mustNotParallelWith) || !other.mustNotParallelWith.includes(t.id)) add('P-V8', { task: t.id, value: o, message: t.id + ' excludes ' + o + ' but ' + o + ' does not exclude ' + t.id });
    });
  });
  // P-V9 — parallel sets
  const shared = (a, b) => (isStrArr(a.mutexes) ? a.mutexes : []).filter((c) => (isStrArr(b.mutexes) ? b.mutexes : []).includes(c));
  (Array.isArray(plan.safeParallelSets) ? plan.safeParallelSets : []).forEach((s) => {
    if (!isObj(s) || !Array.isArray(s.taskIds)) return;
    s.taskIds.forEach((id) => { if (!(id in byId)) add('P-V9', { value: id, message: 'set "' + s.name + '" names unknown task ' + id }); });
    for (let i = 0; i < s.taskIds.length; i += 1) for (let j = i + 1; j < s.taskIds.length; j += 1) {
      const a = byId[s.taskIds[i]], b = byId[s.taskIds[j]];
      if (!a || !b) continue;
      const x = shared(a, b);
      if (x.length) add('P-V9', { task: a.id, value: b.id, message: 'set "' + s.name + '": ' + a.id + ' and ' + b.id + ' both require ' + x.join(', ') });
    }
  });
  tasks.forEach((t) => {
    if (!isObj(t) || !isStrArr(t.mayParallelWith)) return;
    t.mayParallelWith.forEach((o) => { const other = byId[o]; if (other) { const x = shared(t, other); if (x.length) add('P-V9', { task: t.id, value: o, message: t.id + ' mayParallelWith ' + o + ' but both require ' + x.join(', ') }); } });
  });
  // P-V11 — reserved plan ids (existence is a runtime check, see runtimeChecks)
  if (RESERVED_PLAN_IDS.includes(plan.planId)) add('P-V11', { field: 'planId', value: plan.planId, message: 'planId "' + plan.planId + '" is reserved for the plans/arcs/ pointer container' });
  // P-V15 — literal conditions
  tasks.forEach((t) => {
    if (!isObj(t)) return;
    for (const f of ['closeCondition', 'stopCondition']) {
      if (!(f in t) || typeof t[f] !== 'string') continue;
      const r = pointerReason(t[f]);
      if (r) add('P-V15', { task: t.id, field: f, value: t[f], message: 'task ' + t.id + ' ' + f + ' is a reference, not a condition (' + r + '): "' + t[f] + '"' });
    }
  });

  // P-V21…P-V26 — execution profiles
  if (requireProfiles) {
    if (opts.sourceText !== undefined && opts.sourceText !== null && sourceAuthorsProfiles(opts.sourceText)) add('P-V21', { field: 'source', message: 'the source authors executionProfiles (fenced block or table cell); profiles are referenced by id only' });
    if (!library) add('P-V21', { message: 'no execution-profile library provided' });
    else if (library.errors.length) library.errors.forEach((e) => add('P-V21', { field: 'library', value: e.file, message: 'library integrity: ' + e.message }));
    const used = new Set();
    tasks.forEach((t) => {
      if (!isObj(t) || typeof t.id !== 'string') return;
      const ref = t.executionProfile;
      if (ref === undefined) { add('P-V21', { task: t.id, field: 'executionProfile', message: 'task ' + t.id + ' names no executionProfile (every task must reference a library profile by id)' }); return; }
      if (typeof ref !== 'string') { add('P-V21', { task: t.id, field: 'executionProfile', value: ref, message: 'task ' + t.id + ' executionProfile must be a library id string, not ' + (isObj(ref) ? 'an inline object' : typeof ref) }); return; }
      if (!PROFILE_ID_RE.test(ref)) { add('P-V21', { task: t.id, field: 'executionProfile', value: ref, message: 'task ' + t.id + ' executionProfile "' + ref + '" is not a library id (uppercase, ' + PROFILE_ID_RE + ')' }); return; }
      if (!library || library.errors.length) return;
      const entry = library.profiles[ref];
      if (!entry) { add('P-V21', { task: t.id, field: 'executionProfile', value: ref, message: 'task ' + t.id + ' executionProfile "' + ref + '" is not in the committed library (exact id, no case folding)' }); return; }
      const viol = validateProfile(entry.obj);
      if (viol.length) add('P-V21', { task: t.id, field: 'executionProfile', value: ref, message: 'task ' + t.id + ' profile ' + ref + ' does not validate: ' + viol.join(', ') });
      else used.add(ref);
      // Row rules still run on a structurally sound profile so a refusal names the specific
      // P-V22…P-V26 clause (task, phase, field, value) next to the P-V21 validation failure.
      if (rowCheckable(entry.obj)) checkRow(t, entry.obj);
    });
    res.profilesUsed = Array.from(used).sort();
  }
  return finish();

  function rowCheckable(p) {
    return isObj(p) && typeof p.profileId === 'string' && Array.isArray(p.phases) && p.phases.length > 0
      && p.phases.every((ph) => isObj(ph) && typeof ph.id === 'string' && isStrArr(ph.writes) && MODES.includes(ph.modeCeiling) && MODES.includes(ph.recommendedMode))
      && isObj(p.scope) && isStrArr(p.scope.writes) && isObj(p.capabilities) && isObj(p.skills);
  }

  function checkRow(t, p) {
    const mx = isStrArr(t.mutexes) ? t.mutexes : [];
    // P-V22
    if (p.appliesToLane !== t.lane) add('P-V22', { task: t.id, field: 'lane', value: t.lane, message: 'task ' + t.id + ' lane ' + t.lane + ' does not match profile ' + p.profileId + ' appliesToLane ' + p.appliesToLane });
    // P-V23
    p.phases.forEach((ph) => {
      const base = { task: t.id, phase: ph.id };
      ph.writes.forEach((w) => {
        if (NEVER_WRITABLE.some((re) => re.test(w))) add('P-V23', Object.assign({}, base, { field: 'writes', value: w, message: '(a) task ' + t.id + ' phase ' + ph.id + ' writes "' + w + '", which is never writable by a worker' }));
        else if (RUNTIME_WRITE_RE.test(w) && ph.modeCeiling !== 'MANUAL') add('P-V23', Object.assign({}, base, { field: 'modeCeiling', value: ph.modeCeiling, message: '(a) task ' + t.id + ' phase ' + ph.id + ' writes runtime path "' + w + '" and must be MANUAL' }));
      });
      if (Array.isArray(ph.actions) && ph.actions.length && ph.modeCeiling !== 'MANUAL') add('P-V23', Object.assign({}, base, { field: 'modeCeiling', value: ph.modeCeiling, message: '(a) task ' + t.id + ' phase ' + ph.id + ' declares actions [' + ph.actions.join(', ') + '] and must be MANUAL' }));
      if (RANK[ph.recommendedMode] > RANK[ph.modeCeiling]) add('P-V23', Object.assign({}, base, { field: 'recommendedMode', value: ph.recommendedMode, message: '(b) task ' + t.id + ' phase ' + ph.id + ' recommendedMode ' + ph.recommendedMode + ' exceeds modeCeiling ' + ph.modeCeiling }));
      const auto = ph.modeCeiling === 'AUTO' || ph.recommendedMode === 'AUTO';
      if (auto) {
        const field = ph.modeCeiling === 'AUTO' ? 'modeCeiling' : 'recommendedMode';
        if (t.lane === 'MAIN') add('P-V23', Object.assign({}, base, { field, value: 'AUTO', message: '(c) task ' + t.id + ' phase ' + ph.id + ' is AUTO on the MAIN lane (never permitted)' }));
        if (ph.kind !== 'VERIFY') add('P-V23', Object.assign({}, base, { field, value: 'AUTO', message: '(c) task ' + t.id + ' phase ' + ph.id + ' is AUTO but kind is ' + ph.kind + ' (AUTO only on VERIFY)' }));
        if (p.capabilities.network !== 'none') add('P-V23', Object.assign({}, base, { field, value: 'AUTO', message: '(c) task ' + t.id + ' phase ' + ph.id + ' is AUTO with network ' + p.capabilities.network + ' (AUTO requires network none)' }));
        ph.writes.forEach((w) => { if (!SANDBOX_RE.test(w)) add('P-V23', Object.assign({}, base, { field: 'writes', value: w, message: '(c) task ' + t.id + ' phase ' + ph.id + ' is AUTO but writes "' + w + '" outside the sandbox output' })); });
      }
      // (d) ratified MAIN grant boundary (owner wording 2026-08-22): ACCEPT_EDITS without a grant
      // only when the phase's writes are limited to no writes or .ai-reports/**.
      if (t.lane === 'MAIN' && RANK[ph.modeCeiling] > RANK.MANUAL) {
        const outside = ph.writes.filter((w) => !AI_REPORTS_RE.test(w));
        const g = ph.grant;
        if (outside.length > 0 || g !== undefined) {
          const d = (field, value, msg) => add('P-V23', Object.assign({}, base, { field, value, message: '(d) task ' + t.id + ' phase ' + ph.id + ' ' + msg }));
          if (!isObj(g)) d('grant', null, 'is ' + ph.modeCeiling + ' and writes outside .ai-reports/** (' + outside.join(', ') + ') without a grant');
          else {
            if (ph.kind !== 'IMPLEMENT') d('kind', ph.kind, 'carries a grant but kind is ' + ph.kind + ' (grant only on IMPLEMENT)');
            if (g.toMode !== 'ACCEPT_EDITS') d('grant.toMode', g.toMode, 'grant toMode must be ACCEPT_EDITS');
            if (!isStrArr(g.paths) || !g.paths.every((x) => p.scope.writes.includes(x))) d('grant.paths', JSON.stringify(g.paths), 'grant paths are not a subset of scope.writes');
            if (typeof g.mutexClass !== 'string' || !/^CODE:/.test(g.mutexClass)) d('grant.mutexClass', g.mutexClass, 'grant mutexClass must be a CODE:* class');
            else if (!mx.includes(g.mutexClass)) d('grant.mutexClass', g.mutexClass, 'grant mutexClass ' + g.mutexClass + ' is not held by the task row (mutexes: ' + (mx.join(', ') || 'none') + ')');
            if (t.requiresOwnerGo !== true) d('requiresOwnerGo', t.requiresOwnerGo, 'carries a grant but task.requiresOwnerGo is not true');
          }
        }
      }
      if (ph.kind === 'TERMINAL' && ph.modeCeiling !== 'MANUAL') add('P-V23', Object.assign({}, base, { field: 'modeCeiling', value: ph.modeCeiling, message: '(e) task ' + t.id + ' TERMINAL phase ' + ph.id + ' must be MANUAL' }));
    });
    // P-V24 — ratified five clauses (owner wording 2026-08-22)
    const f = p.phases[0];
    const gated = p.phases.map((ph, i) => ({ ph, i })).filter((x) => x.ph.entryGate === 'AUTHORIZED_JSON');
    if ((t.entryMode === 'PLAN') !== (f.kind === 'PLAN')) add('P-V24', { task: t.id, phase: f.id, field: 'entryMode', value: t.entryMode, message: '(1) task ' + t.id + ' entryMode ' + t.entryMode + ' but phases[0] ' + f.id + ' kind is ' + f.kind + ' (entryMode PLAN iff phases[0].kind PLAN)' });
    if (f.kind === 'PLAN' && f.modeCeiling !== 'MANUAL') add('P-V24', { task: t.id, phase: f.id, field: 'modeCeiling', value: f.modeCeiling, message: '(1) task ' + t.id + ' PLAN first phase ' + f.id + ' must have modeCeiling MANUAL' });
    if (t.requiresOwnerGo === true && f.entryGate !== 'AUTHORIZED_JSON') add('P-V24', { task: t.id, phase: f.id, field: 'entryGate', value: f.entryGate, message: '(2) task ' + t.id + ' requiresOwnerGo true but phases[0] ' + f.id + ' entryGate is ' + f.entryGate + ' (must be AUTHORIZED_JSON)' });
    if (t.requiresOwnerGo === false && gated.length > 0) add('P-V24', { task: t.id, phase: gated[0].ph.id, field: 'entryGate', value: 'AUTHORIZED_JSON', message: '(3) task ' + t.id + ' requiresOwnerGo false but phase ' + gated[0].ph.id + ' has entryGate AUTHORIZED_JSON (no phase may be gated)' });
    if (gated.length > 1 || (gated.length === 1 && gated[0].i !== 0)) add('P-V24', { task: t.id, phase: gated[gated.length - 1].ph.id, field: 'entryGate', value: 'AUTHORIZED_JSON', message: '(4) task ' + t.id + ' profile ' + p.profileId + ' has ' + gated.length + ' AUTHORIZED_JSON phase(s) at index ' + gated.map((x) => x.i).join(',') + ' (at most one, and only phases[0])' });
    if (p.requiresOwnerGo === true && t.requiresOwnerGo !== true) add('P-V24', { task: t.id, field: 'requiresOwnerGo', value: t.requiresOwnerGo, message: '(5) task ' + t.id + ' uses profile ' + p.profileId + ' (requiresOwnerGo true) but task.requiresOwnerGo is ' + t.requiresOwnerGo });
    // P-V25 — hard capability-implied classes + CODE-surface lock-outs
    requiredClasses(t, p).forEach((n) => { if (!mx.includes(n.class)) add('P-V25', { task: t.id, field: 'mutexes', value: n.class, message: 'task ' + t.id + ' requires ' + n.class + ' (' + n.why + ') but the row does not hold it' }); });
    deriveLockouts(mx, p).forEach((l) => {
      res.lockouts.push({ task: t.id, surface: l.surface, class: l.class });
      warn('P-V25', { task: t.id, message: 'lock-out: ' + l.surface + ' (' + l.class + ' not held by ' + t.id + ') is removed from the effective write scope' });
    });
    // P-V26 — required skills invocable
    (isStrArr(p.skills.required) ? p.skills.required : []).forEach((s) => {
      if (!skillsRoot) { add('P-V26', { task: t.id, value: s, message: 'task ' + t.id + ' requires skill ' + s + ' but no skills root was provided' }); return; }
      const fm = readSkillFrontmatter(skillsRoot, s);
      if (!fm.exists) add('P-V26', { task: t.id, value: s, message: 'task ' + t.id + ' requires skill "' + s + '", which does not exist under ' + skillsRoot });
      else if (fm.disableModelInvocation && !p.phases.some((ph) => ph.entryGate === 'OWNER_TYPES_SKILL')) add('P-V26', { task: t.id, value: s, message: 'task ' + t.id + ' requires skill "' + s + '" (disable-model-invocation: true) but no phase has entryGate OWNER_TYPES_SKILL' });
    });
  }

  function finish() {
    for (const r of RULE_ORDER) {
      if (r === 'P-V13') continue;
      res.rules[r] = res.violations.some((v) => v.rule === r) ? 'REFUSED' : 'PASS';
    }
    res.ok = res.violations.length === 0;
    return res;
  }
}

// ── resolution: embed the referenced profiles (K2) ───────────────────────────
function resolveProfiles(plan, library) {
  const ids = Array.from(new Set(plan.tasks.map((t) => t.executionProfile))).sort();
  const embedded = {};
  for (const id of ids) {
    const e = library.profiles[id];
    if (!e) throw new Error('resolveProfiles: profile not in library: ' + id);
    embedded[id] = embedProfile(e.obj, e.canonicalHash);
  }
  const out = {};
  for (const k of Object.keys(plan)) {
    if (k === 'executionProfiles') continue;
    if (k === 'tasks') out.executionProfiles = embedded;
    out[k] = plan[k];
  }
  if (!('executionProfiles' in out)) out.executionProfiles = embedded;
  return { plan: out, text: canonicalize(out), profilesUsed: ids };
}

// ── runtime checks (read-only): P-V11 existence, P-V13 live-claim scan ──────
function runtimeChecks(root, plan, opts) {
  opts = opts || {};
  const res = { violations: [], warnings: [], rules: {}, liveClaims: [], outgoingPlanId: null };
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('runtime root not found: ' + root);
  for (const d of ['plans', 'claims', 'mutex']) if (!fs.existsSync(path.join(root, d)) || !fs.statSync(path.join(root, d)).isDirectory()) throw new Error('runtime root incomplete (missing ' + d + '/): ' + root);
  const add = (rule, message, extra) => res.violations.push(Object.assign({ rule, task: null, phase: null, field: null, value: null }, extra || {}, { message: rule + ' REFUSED - ' + message }));
  const pid = String(plan.planId);
  if (fs.existsSync(path.join(root, 'plans', pid))) add('P-V11', 'plans/' + pid + ' already exists; snapshots are immutable', { field: 'planId', value: pid });
  if (fs.existsSync(path.join(root, 'plans', '.staging-' + pid))) add('P-V11', 'plans/.staging-' + pid + ' exists from an interrupted run; report it for owner disposition', { field: 'planId', value: pid });
  res.rules['P-V11'] = res.violations.some((v) => v.rule === 'P-V11') ? 'REFUSED' : 'PASS';
  const cur = path.join(root, 'plans', 'current.json');
  let outgoing = null;
  if (fs.existsSync(cur)) {
    try { const j = JSON.parse(stripCR(fs.readFileSync(cur, 'utf8'))); if (j && typeof j.planId === 'string') outgoing = j.planId; } catch (_) { outgoing = null; }
  }
  res.outgoingPlanId = outgoing;
  if (outgoing) {
    for (const dir of fs.readdirSync(path.join(root, 'claims')).sort()) {
      const file = path.join(root, 'claims', dir, 'claim.json');
      if (!fs.existsSync(file)) continue;
      let c = null;
      try { c = JSON.parse(stripCR(fs.readFileSync(file, 'utf8'))); } catch (_) { continue; }
      if (isObj(c) && c.planId === outgoing && LIVE_STATES.includes(c.state)) res.liveClaims.push({ taskId: dir, state: c.state, planId: c.planId });
    }
  }
  if (res.liveClaims.length) {
    const list = res.liveClaims.map((c) => c.taskId + ' (' + c.state + ')').join(', ');
    if (opts.acknowledgeLiveClaims) { res.rules['P-V13'] = 'OVERRIDDEN'; res.warnings.push({ rule: 'P-V13', task: null, message: 'P-V13 WARN - ' + res.liveClaims.length + ' live claim(s) against plan ' + outgoing + ' acknowledged (--acknowledge-live-claims); to be recorded in carriedOverClaims[]: ' + list }); }
    else add('P-V13', res.liveClaims.length + ' live claim(s) against plan ' + outgoing + ': ' + list, { value: outgoing });
  }
  if (!res.rules['P-V13']) res.rules['P-V13'] = res.violations.some((v) => v.rule === 'P-V13') ? 'REFUSED' : 'PASS';
  return res;
}

// ── renderers (projection fragments) ─────────────────────────────────────────
function renderProfilesSection(resolvedPlan) {
  const ids = Object.keys(resolvedPlan.executionProfiles || {});
  const lines = ['PROFILES (' + ids.length + ')'];
  for (const id of ids) {
    const e = resolvedPlan.executionProfiles[id];
    lines.push('  ' + id + '  v' + e.version + '  libraryHash ' + e.libraryHash);
    canonicalize(e).replace(/\n$/, '').split('\n').forEach((l) => lines.push('    ' + l));
  }
  return lines.join('\n');
}
function renderTaskProfileLines(plan, library, lockouts) {
  const lines = ['TASK PROFILES (' + plan.tasks.length + ')'];
  plan.tasks.forEach((t, i) => {
    const e = library && library.profiles[t.executionProfile];
    if (!e) { lines.push('[' + (i + 1) + '] ' + t.id + '  profile ' + String(t.executionProfile) + '  UNRESOLVED'); return; }
    lines.push('[' + (i + 1) + '] ' + t.id + '  profile ' + e.obj.profileId + '  phases ' + renderLadder(e.obj));
    e.obj.phases.forEach((ph) => { if (isObj(ph.grant)) lines.push('    grant ' + ph.id + ' -> ' + ph.grant.toMode + ' paths ' + ph.grant.paths.join(', ') + ' mutex ' + ph.grant.mutexClass + ' (requiresOwnerGo ' + t.requiresOwnerGo + ')'); });
    (lockouts || []).filter((l) => l.task === t.id).forEach((l) => lines.push('    P-V25 lock-out WARN: ' + l.surface + ' (' + l.class + ' not held by ' + t.id + ')'));
  });
  return lines.join('\n');
}
function renderValidation(rules, violations, notes) {
  const lines = ['VALIDATION'];
  for (const r of RULE_ORDER) {
    const status = (rules && rules[r]) || (notes && notes[r]) || 'NOT CHECKED';
    const label = (r + ' ' + RULE_LABEL[r]).padEnd(46, '.');
    lines.push(label + ' ' + status);
  }
  (violations || []).forEach((v) => lines.push('  ' + v.message));
  return lines.join('\n');
}

module.exports = {
  MODES, RANK, MODE_ABBR, KINDS, GATES, LANES, ENTRY_MODES, BOUNDARIES, WORKER_ACTIONS, CAP, TRIGGER_ON, TRIGGER_ACTION, GRANT_MUTEX,
  MUTEX_REGISTRY, PROFILE_ID_RE, TASK_ID_RE, PLAN_ID_RE, RESERVED_TASK_IDS, RESERVED_PLAN_IDS, LIVE_STATES, RULE_ORDER, RULE_LABEL, CODE_SURFACES,
  stripCR, sha256, canonicalize, libraryHash, embedProfile, withoutLibraryHash, validateProfile,
  loadLibrary, libraryFromObjects, readSkillFrontmatter, sourceAuthorsProfiles, codeClassFor, deriveLockouts, renderLadder, requiredClasses,
  pointerReason, planCheck, resolveProfiles, runtimeChecks, renderProfilesSection, renderTaskProfileLines, renderValidation
};
