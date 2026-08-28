'use strict';

/*
 * qa/arc_runtime_ops_offline.js
 *
 * Multi-ARC V1 — Increment P-E execution side (batch B6): executable contract for the ARC-aware
 * worker (`/arc-worker <LANE> --arc <ARC-ID>`), `/arc-authorize --arc` and the owner-ops namespace
 * selector (ULTRAPLAN r3 §4-B6, §5.1 proofs A/B/C/D/E/F, §5.2, §8, §16-B6; owner rulings D-6, D-28,
 * D-29, D-31, K14, K15, X-2 and the frozen B6 contract of 2026-08-22).
 *
 * Pure Node, no network, no browser, NO live runtime write, NO live registry write. Reads only:
 *   - .claude/skills/arc-worker/references/claim-protocol.md        (the `# @op` bash blocks, EXTRACTED AND EXECUTED
 *   - .claude/skills/arc-authorize/references/owner-ops.md            by Git Bash against temp git repos + temp
 *                                                                     runtime roots — D-31, never a semantic mirror)
 *   - .claude/skills/arc-publish-plan/scripts/lib/runtime-identity.js (B4 helper: the identity rules, never re-implemented)
 *   - the committed schemas (shape checks on real output), the worker/authorize docs (behaviour greps),
 *     the forbidden set (byte checks vs HEAD)
 * Every temp tree lives under os.tmpdir() and is removed in `finally`; the closing proofs assert the live
 * runtime tree hash is untouched.
 *
 * Git Bash is resolved from `git --exec-path`; absent ⇒ FAIL, never a silent substitute (D-31).
 * Determinism: no pinned wall-clock dates — the executed sequences use the real clock and every assertion
 * is on structure, identity and bytes, never on a timestamp value.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const WORKER_DIR = '.claude/skills/arc-worker';
const AUTH_DIR = '.claude/skills/arc-authorize';
const PUB_DIR = '.claude/skills/arc-publish-plan';
const SCHEMA_DIR = PUB_DIR + '/references/schemas';
const REL = {
  identity: PUB_DIR + '/scripts/lib/runtime-identity.js',
  gate: WORKER_DIR + '/scripts/phase-gate.js',
  runtime: '.git/arc-runtime',
  schemas: {
    claim: SCHEMA_DIR + '/claim.schema.json',
    authorized: SCHEMA_DIR + '/authorized.schema.json',
    holder: SCHEMA_DIR + '/holder.schema.json',
    current: SCHEMA_DIR + '/current.schema.json'
  },
  docs: {
    claimProtocol: WORKER_DIR + '/references/claim-protocol.md',
    runtimeContract: WORKER_DIR + '/references/runtime-contract.md',
    workerSkill: WORKER_DIR + '/SKILL.md',
    workerReport: WORKER_DIR + '/templates/worker-report.md',
    authorizeSkill: AUTH_DIR + '/SKILL.md',
    authorizeReport: AUTH_DIR + '/templates/authorize-report.md',
    ownerOps: AUTH_DIR + '/references/owner-ops.md',
    runner: 'qa/run-offline.js'
  },
  // B6 never touches these (B5 / B4 / B3 surfaces, and the two worker artifacts B6 proved it does not
  // need to change); byte-identical to HEAD
  forbidden: [
    WORKER_DIR + '/scripts/phase-gate.js',
    WORKER_DIR + '/references/execution-profile.md',
    PUB_DIR + '/SKILL.md', PUB_DIR + '/references/publish-protocol.md', PUB_DIR + '/references/plan-validation.md',
    PUB_DIR + '/references/bootstrap.md', PUB_DIR + '/templates/plan-projection.md', PUB_DIR + '/templates/publish-report.md',
    PUB_DIR + '/scripts/resolve-profiles.js', PUB_DIR + '/scripts/lib/profile-contract.js', PUB_DIR + '/scripts/lib/runtime-identity.js',
    SCHEMA_DIR + '/plan.schema.json', SCHEMA_DIR + '/current.schema.json', SCHEMA_DIR + '/claim.schema.json',
    SCHEMA_DIR + '/authorized.schema.json', SCHEMA_DIR + '/holder.schema.json', SCHEMA_DIR + '/arc.schema.json',
    SCHEMA_DIR + '/execution-profile.schema.json',
    '.claude/skills/arc-registry/SKILL.md', '.claude/skills/arc-registry/references/registry-contract.md',
    '.claude/skills/arc-registry/templates/status-report.md',
    '.claude/skills/arc-progress-auditor/SKILL.md',
    '.claude/skills/arc-progress-auditor/templates/arc-audit.md',
    'netlify.toml'
  ]
};
const abs = (p) => path.join(ROOT, p);
const exists = (p) => fs.existsSync(abs(p));
const readText = (p) => fs.readFileSync(abs(p), 'utf8');
const stripCR = (s) => String(s).replace(/\r/g, '');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const fwd = (p) => String(p).replace(/\\/g, '/');
const rdJson = (f) => JSON.parse(stripCR(fs.readFileSync(f, 'utf8')));
const wrJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n'); };

// ── harness ──────────────────────────────────────────────────────────────────
let total = 0, failed = 0;
const failures = [];
function check(name, cond) { total += 1; if (!cond) { failed += 1; failures.push(name); console.log('  FAIL  ' + name); } }
function section(title) { console.log('== ' + title + ' =='); }
const tempDirs = [];
function tmp(label) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-r-' + label + '-')); tempDirs.push(d); return d; }
function cleanup() { for (const d of tempDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* best effort */ } } }
function treeHash(dir) {
  if (!fs.existsSync(dir)) return 'ABSENT';
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
function gitShow(rel) {
  const r = spawnSync('git', ['show', 'HEAD:' + rel], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? stripCR(r.stdout) : null;
}
function git(args, cwd) { return spawnSync('git', args, { cwd: cwd || ROOT, encoding: 'utf8' }); }

// ── Git Bash, resolved from `git --exec-path` (D-31: absent ⇒ FAIL, never substitute) ────────
const BASH = (() => {
  const r = git(['--exec-path']);
  if (r.status !== 0) return null;
  const ep = r.stdout.trim();
  const cands = [path.resolve(ep, '..', '..', '..', 'usr', 'bin', 'bash.exe'), path.resolve(ep, '..', '..', '..', 'bin', 'bash.exe'), path.resolve(ep, '..', '..', 'bin', 'bash')];
  return cands.find((c) => fs.existsSync(c)) || null;
})();
// The composed sequence is written to a file and run as `bash <file>`: a multi-line script with nested
// quotes cannot survive Windows command-line re-quoting through `bash -c <script>` (B5 lesson 1).
function bash(script, cwd, env) {
  const f = path.join(cwd, 'qa-seq-' + (++bash.n) + '.sh');
  fs.writeFileSync(f, script.replace(/\r\n/g, '\n'));
  const r = spawnSync(BASH, [fwd(f)], { cwd, encoding: 'utf8', env: Object.assign({}, process.env, env || {}), maxBuffer: 16 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', out: (r.stdout || '') + (r.stderr || '') };
}
bash.n = 0;

// ── schema-driven structural validator (keyword subset used by the committed schemas) ────────
function typeOf(v) { return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number') : typeof v; }
function validate(schema, value, root, at, out) {
  out = out || []; at = at || '$';
  if (schema === true) return out;
  if (!isObj(schema)) { out.push(at + ': schema not an object'); return out; }
  if ('$ref' in schema) {
    if (!schema.$ref.startsWith('#/')) return out;
    let node = root; for (const seg of schema.$ref.slice(2).split('/')) node = node && node[seg];
    if (!node) { out.push(at + ': unresolved $ref ' + schema.$ref); return out; }
    return validate(node, value, root, at, out);
  }
  if ('type' in schema) { const types = Array.isArray(schema.type) ? schema.type : [schema.type]; const t = typeOf(value); if (!(types.includes(t) || (t === 'integer' && types.includes('number')))) { out.push(at + ': type ' + t + ' not in ' + types.join('|')); return out; } }
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) out.push(at + ': not const');
  if ('enum' in schema && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) out.push(at + ': not in enum');
  if ('not' in schema && validate(schema.not, value, root, at, []).length === 0) out.push(at + ': matches forbidden schema (not)');
  if (typeof value === 'string') {
    if ('pattern' in schema && !new RegExp(schema.pattern).test(value)) out.push(at + ': pattern');
    if ('maxLength' in schema && value.length > schema.maxLength) out.push(at + ': maxLength');
    if ('minLength' in schema && value.length < schema.minLength) out.push(at + ': minLength');
  }
  if (Array.isArray(value)) {
    if ('minItems' in schema && value.length < schema.minItems) out.push(at + ': minItems');
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) out.push(at + ': uniqueItems');
    if ('items' in schema) value.forEach((v, i) => validate(schema.items, v, root, at + '[' + i + ']', out));
  }
  if (isObj(value)) {
    for (const r of schema.required || []) if (!(r in value)) out.push(at + ': missing required ' + r);
    const props = schema.properties || {};
    for (const k of Object.keys(value)) {
      if (k in props) validate(props[k], value[k], root, at + '.' + k, out);
      else if (schema.additionalProperties === false) out.push(at + ': additional property ' + k);
    }
  }
  return out;
}
const SCHEMAS = {};
for (const k of Object.keys(REL.schemas)) { try { SCHEMAS[k] = rdJson(abs(REL.schemas[k])); } catch (_) { SCHEMAS[k] = null; } }
function schemaViol(kind, value) { return SCHEMAS[kind] ? validate(SCHEMAS[kind], value, SCHEMAS[kind], '$', []) : ['schema ' + kind + ' unavailable']; }
function schemaOk(kind, value) { return schemaViol(kind, value).length === 0; }

// ── the committed B4 identity helper (consumed, never re-implemented) ────────────────────────
let ident = null;
try { ident = require(abs(REL.identity)); } catch (e) { console.log('  (runtime-identity.js not loadable: ' + e.message.split('\n')[0] + ')'); }

// ── live-runtime baseline (read only; never written by this suite) ───────────
const LIVE_RUNTIME = abs(REL.runtime);
const LIVE_BEFORE = fs.existsSync(LIVE_RUNTIME) ? treeHash(LIVE_RUNTIME) : null;
const LIVE_HAD_ARC_CLAIMS = fs.existsSync(path.join(LIVE_RUNTIME, 'arc-claims'));
const LIVE_HAD_ARC_PLANS = fs.existsSync(path.join(LIVE_RUNTIME, 'plans', 'arcs'));

// ── fixtures ─────────────────────────────────────────────────────────────────
const REGISTRY_CLASSES =['AUTHORITY:published-plan', 'CODE:index-html', 'CODE:netlify-functions', 'DEPLOY:netlify',
  'EXTERNAL:live-provider', 'QA:browser-runtime', 'RUNTIME:gates', 'RUNTIME:owner-profile'];
const REF = 'b'.repeat(40);
const task = (id, o) => Object.assign({ id, lane: 'MAIN', entryMode: 'DIRECT', requiresOwnerGo: false, mutexes: [], dependsOn: [], priority: 1, closeCondition: 'fixture close condition for ' + id }, o || {});
const TASKS_DEP = () => ([task('TASK-10', { priority: 1 }), task('TASK-20', { priority: 2, dependsOn: ['TASK-10'] })]);
const TASKS_CODE = () => ([task('T-CODE', { priority: 1, mutexes: ['CODE:index-html'] })]);

function mkPlan(o) {
  o = o || {};
  const p = {
    planId: o.planId || 'arc-a-r1',
    source: '.ai-reports/handoffs/2026-08-22_b6-fixture.MAIN.md',
    sourceHash: 'a'.repeat(64),
    repoRef: o.repoRef || REF,
    generatedAt: '2026-08-22T00:00:00Z',
    mutexRegistry: REGISTRY_CLASSES.slice(),
    tasks: o.tasks || TASKS_DEP()
  };
  if (o.arcId) p.arcId = o.arcId;
  return p;
}
function claimRec(taskId, state, planId, arcId, planHash, mutexes) {
  const c = {
    taskId, lane: 'MAIN', planId: planId || 'arc-a-r1', planHash: planHash || null,
    conversationId: 'qa-fixture', startedAt: '2026-08-22T00:00:00Z',
    mutexes: mutexes || [], state,
    stateHistory: [{ state, at: '2026-08-22T00:00:00Z', by: 'worker' }],
    reason: null, mutexesReleasedAt: null, resumeCount: 0
  };
  if (arcId) c.arcId = arcId;
  return c;
}
function holderRec(taskId, arcId, lane) {
  const h = { taskId, lane: lane || 'MAIN', acquiredAt: '2026-08-22T00:00:00Z' };
  if (arcId) h.arcId = arcId;
  return h;
}
const encodeClass = (c) => c.replace(/:/g, '__');

/*
 * mkRuntime(root, spec) writes a runtime root:
 *   spec.snapshots  { <planId>: { tasks, arcId } }            -> plans/<planId>/plan.json (+ manifest)
 *   spec.legacyPointer  <planId>                              -> plans/current.json
 *   spec.arcPointers    { <ARC>: <planId> }                   -> plans/arcs/<ARC>/current.json
 *   spec.arcRetired     { <ARC>: <planId> }                   -> plans/arcs/<ARC>/retired-<planId>.json
 *   spec.arcContainers  [ <ARC> ]                             -> arc-claims/<ARC>/   (empty container)
 *   spec.legacyClaims   { <TASK>: claimRec | 'EMPTY-DIR' }
 *   spec.arcClaims      { <ARC>: { <TASK>: claimRec | 'EMPTY-DIR' } }
 *   spec.mutex          { <CANONICAL-CLASS>: holderRec | 'NO-HOLDER' }
 */
function mkRuntime(root, spec) {
  spec = spec || {};
  for (const d of ['plans', 'claims', 'mutex']) fs.mkdirSync(path.join(root, d), { recursive: true });
  const hashes = {};
  const snapshots = spec.snapshots || {};
  for (const planId of Object.keys(snapshots)) {
    const s = snapshots[planId] || {};
    const plan = mkPlan({ planId, tasks: s.tasks, arcId: s.arcId, repoRef: s.repoRef });
    const dir = path.join(root, 'plans', planId);
    fs.mkdirSync(dir, { recursive: true });
    const bytes = JSON.stringify(plan, null, 2) + '\n';
    fs.writeFileSync(path.join(dir, 'plan.json'), bytes);
    fs.writeFileSync(path.join(dir, 'source.md'), '# fixture source\n');
    hashes[planId] = sha256(Buffer.from(bytes));
    const man = pointer(planId, hashes[planId], s.arcId);
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(man, null, 2) + '\n');
  }
  function pointer(planId, planHash, arcId) {
    const c = {
      planId, planHash, source: '.ai-reports/handoffs/2026-08-22_b6-fixture.MAIN.md', sourceHash: 'a'.repeat(64),
      ref: REF, publishedAt: '2026-08-22T00:00:00Z', publishedBy: 'qa-owner', supersedesPlanId: null,
      staleSourceAcknowledged: false, refMismatchAcknowledged: false, carriedOverClaims: []
    };
    if (arcId) c.arcId = arcId;
    return c;
  }
  if (spec.legacyPointer) {
    const pid = spec.legacyPointer;
    wrJson(path.join(root, 'plans', 'current.json'), Object.assign(pointer(pid, hashes[pid]), spec.legacyPointerExtra || {}));
  }
  for (const arc of Object.keys(spec.arcPointers || {})) {
    const pid = spec.arcPointers[arc];
    wrJson(path.join(root, 'plans', 'arcs', arc, 'current.json'), Object.assign(pointer(pid, hashes[pid], arc), (spec.arcPointerExtra || {})[arc] || {}));
  }
  for (const arc of Object.keys(spec.arcRetired || {})) {
    const pid = spec.arcRetired[arc];
    wrJson(path.join(root, 'plans', 'arcs', arc, 'retired-' + pid + '.json'), pointer(pid, hashes[pid], arc));
  }
  for (const arc of spec.arcContainers || []) fs.mkdirSync(path.join(root, 'arc-claims', arc), { recursive: true });
  const withHash = (rec) => { if (rec && rec !== 'EMPTY-DIR' && !rec.planHash) rec.planHash = hashes[rec.planId] || 'c'.repeat(64); return rec; };
  for (const t of Object.keys(spec.legacyClaims || {})) {
    const rec = spec.legacyClaims[t];
    fs.mkdirSync(path.join(root, 'claims', t), { recursive: true });
    if (rec !== 'EMPTY-DIR') wrJson(path.join(root, 'claims', t, 'claim.json'), withHash(rec));
  }
  for (const arc of Object.keys(spec.arcClaims || {})) {
    fs.mkdirSync(path.join(root, 'arc-claims', arc), { recursive: true });
    for (const t of Object.keys(spec.arcClaims[arc])) {
      const rec = spec.arcClaims[arc][t];
      fs.mkdirSync(path.join(root, 'arc-claims', arc, t), { recursive: true });
      if (rec !== 'EMPTY-DIR') wrJson(path.join(root, 'arc-claims', arc, t, 'claim.json'), withHash(rec));
    }
  }
  for (const cl of Object.keys(spec.mutex || {})) {
    const dir = path.join(root, 'mutex', encodeClass(cl));
    fs.mkdirSync(dir, { recursive: true });
    if (spec.mutex[cl] !== 'NO-HOLDER') fs.writeFileSync(dir + path.sep + 'holder.json', JSON.stringify(spec.mutex[cl]) + '\n');
  }
  return hashes;
}
function mkRepo(label, spec) {
  const dir = tmp(label);
  git(['init', '-q'], dir);
  const root = path.join(dir, '.git', 'arc-runtime');
  const hashes = mkRuntime(root, spec);
  return { dir, root, hashes, claims: path.join(root, 'claims'), arcClaims: path.join(root, 'arc-claims'), mutex: path.join(root, 'mutex'), plans: path.join(root, 'plans') };
}

// ── extract-and-execute (D-31) ───────────────────────────────────────────────
function extractOps(text) {
  const ops = {}; const order = [];
  const re = /```bash\n# @op ([A-Za-z0-9-]+)[^\n]*\n([\s\S]*?)```/g;
  let m; while ((m = re.exec(text))) { ops[m[1]] = m[2]; order.push(m[1]); }
  return { ops, order };
}
const claimText = exists(REL.docs.claimProtocol) ? stripCR(readText(REL.docs.claimProtocol)) : '';
const ownerText = exists(REL.docs.ownerOps) ? stripCR(readText(REL.docs.ownerOps)) : '';
const CP = extractOps(claimText);
const OO = extractOps(ownerText);
const authSkillText = exists(REL.docs.authorizeSkill) ? stripCR(readText(REL.docs.authorizeSkill)) : '';
const AUTH = extractOps(authSkillText);

const CLAIM_TAGS = ['worker-prelude', 'worker-args', 'worker-namespace', 'step0-preconditions', 'step1-snapshot',
  'step1a-filter', 'step1b-bind-profile', 'step2-claim', 'step3-mutex', 'step4-rollback', 'step5-commit-claim',
  'step6-owner-go', 'step6a-phase-entry', 'step7-complete', 'step8-blocked', 'step9-resume', 'step9b-resume-rebind'];
const OWNER_TAGS = ['owner-prelude', 'owner-selector', 'owner-inspect', 'owner-release', 'owner-abandon',
  'owner-resume', 'owner-mutex-acquire', 'owner-mutex-release', 'owner-retire'];
const AUTH_TAGS = ['authorize-prelude', 'authorize-namespace', 'authorize-ladder'];

const CLAIM_SEQ = ['worker-prelude', 'worker-args', 'worker-namespace', 'step0-preconditions', 'step1-snapshot', 'step1a-filter', 'step2-claim', 'step3-mutex', 'step4-rollback', 'step5-commit-claim'];
const FILTER_SEQ = ['worker-prelude', 'worker-args', 'worker-namespace', 'step0-preconditions', 'step1-snapshot', 'step1a-filter'];
const COMPLETE_SEQ = CLAIM_SEQ.concat(['step7-complete']);
const RESUME_SEQ = ['worker-prelude', 'worker-args', 'worker-namespace', 'step0-preconditions', 'step1-snapshot', 'step9-resume'];
const RELEASE_ONLY_SEQ = ['worker-prelude', 'worker-args', 'worker-namespace', 'step7-complete'];

// The QA re-points only the path variables a temp repo cannot carry: IDENT and GATE after the
// worker/owner preludes, GATE alone after authorize-prelude (which declares no IDENT, so binding one
// would contradict its charter). Every other command in every block runs verbatim.
function runOps(repo, source, opNames, env, glue) {
  glue = glue || {};
  const parts = [];
  for (const op of opNames) {
    if (!source.ops[op]) { parts.push('echo "MISSING-OP ' + op + '"; exit 97'); break; }
    parts.push('# ---- ' + op);
    parts.push(source.ops[op]);
    if (op === 'worker-prelude' || op === 'owner-prelude') parts.push('IDENT="$QA_IDENT"; GATE="$QA_GATE"');
    if (op === 'authorize-prelude') parts.push('GATE="$QA_GATE"');
    if (glue[op]) parts.push(glue[op]);
  }
  parts.push('echo "::DONE::"');
  const e = Object.assign({ QA_IDENT: fwd(abs(REL.identity)), QA_GATE: fwd(abs(REL.gate)), LANE: 'MAIN', ARC: '', CONV: 'qa-conv' }, env || {});
  return bash(parts.join('\n'), repo.dir, e);
}
const runWorker = (repo, seq, env, glue) => runOps(repo, CP, seq, env, glue);
const runOwner = (repo, seq, env, glue) => runOps(repo, OO, seq, env, glue);
// `done` = the composed sequence ran to the end. `ok` = it exited 0 at a documented early stop
// (IDLE, STOPPED, BLOCKED, owner-GO): those paths `exit 0` before the trailing marker by design,
// so requiring the marker there would assert the absence of a fail-closed exit.
const done = (r) => r.status === 0 && /::DONE::/.test(r.stdout);
const ok = (r) => r.status === 0;
const tail = (r) => r.status !== 0 ? ' - exit ' + r.status + ': ' + r.out.slice(-700) : '';

// ── gate stubs + argv reader shared by EP-R11 / EP-R12 (B6.1) ────────────────
// $GATE is a path variable this suite already re-points by contract; pointing it at a stub makes
// the argv the REAL committed block passes observable. Neither stub prints the real gate's
// "PHASE-GATE   task ..." head line, which is what lets EP-R11 prove phase-gate.js itself ran.
const REAL_GATE = fwd(abs(REL.gate));
const GATE_REC_SRC = ["'use strict';",
  "var fs = require('fs');",
  "fs.appendFileSync(process.env.QA_ARGV_LOG, JSON.stringify(process.argv.slice(2)) + String.fromCharCode(10));",
  "console.log('worktree          none');",
  'process.exit(0);'].join('\n');
const GATE_EXIT4_SRC = ["'use strict';",
  "console.log('PROFILE BINDING   TASK-10');",
  "console.log('  profile  profile-binding-missing');",
  'process.exit(4);'].join('\n');
const readArgvLog = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; } };
const claimDirOf = (calls, flag) => { const c = calls.find((a) => a.indexOf(flag) !== -1); if (!c) return null; const i = c.indexOf('--claim-dir'); return i === -1 ? '(ABSENT)' : c[i + 1]; };

try {
  // ══ EP-R0 · surfaces, tags and the executor ════════════════════════════════
  section('EP-R0 surfaces + tagged blocks');
  check('EP-R0 Git Bash resolved from `git --exec-path` (D-31: absent is a FAIL, never a skip)', !!BASH);
  check('EP-R0 runtime-identity.js loadable and exposes isValidArcId / claimMatchesPath / holderOwnershipMatches / namespaceOf (B4 API reused, never re-implemented)',
    !!ident && ['isValidArcId', 'claimMatchesPath', 'authorizedMatchesPath', 'holderOwnershipMatches', 'namespaceOf', 'claimIdentityFromPath'].every((k) => typeof ident[k] === 'function'));
  check('EP-R0 claim-protocol.md carries every tagged block in lifecycle order (' + (CLAIM_TAGS.filter((t) => !CP.ops[t]).join(', ') || 'all present') + ')',
    CLAIM_TAGS.every((t) => !!CP.ops[t]) && CLAIM_TAGS.every((t, i) => i === 0 || claimText.indexOf('# @op ' + CLAIM_TAGS[i - 1]) < claimText.indexOf('# @op ' + t)));
  check('EP-R0 owner-ops.md carries every tagged block (' + (OWNER_TAGS.filter((t) => !OO.ops[t]).join(', ') || 'all present') + ')', OWNER_TAGS.every((t) => !!OO.ops[t]));
  check('EP-R0 owner-ops.md: owner-selector precedes every mutating block in the document', OWNER_TAGS.every((t) => t === 'owner-prelude' || t === 'owner-selector' || t === 'owner-inspect' || ownerText.indexOf('# @op owner-selector') < ownerText.indexOf('# @op ' + t)));
  check('EP-R0 claim-protocol.md resolves identity through runtime-identity.js (isValidArcId / claimMatchesPath / holderOwnershipMatches named) and never re-implements the pair rule',
    /runtime-identity\.js/.test(claimText) && /isValidArcId/.test(claimText) && /claimMatchesPath/.test(claimText) && /holderOwnershipMatches/.test(claimText));
  check('EP-R0 owner-ops.md resolves holder ownership through runtime-identity.js holderOwnershipMatches', /runtime-identity\.js/.test(ownerText) && /holderOwnershipMatches/.test(ownerText));
  check('EP-R0 neither worker nor owner-ops mentions the registry root .ai-reports/arcs (workers and the owner runtime lane never read the registry — D5-e)',
    !/\.ai-reports\/arcs/.test(claimText) && !/\.ai-reports\/arcs/.test(ownerText));

  check('EP-R0 arc-authorize/SKILL.md carries every tagged block in order (' + (AUTH_TAGS.filter((t) => !AUTH.ops[t]).join(', ') || 'all present') + ')',
    AUTH_TAGS.every((t) => !!AUTH.ops[t]) && AUTH_TAGS.every((t, i) => i === 0 || authSkillText.indexOf('# @op ' + AUTH_TAGS[i - 1]) < authSkillText.indexOf('# @op ' + t)));
  check('EP-R0 arc-authorize/SKILL.md carries the house tagging sentence (R-3: the executable surface is declared, never implied)',
    /Every executable block is tagged `# @op <name>` on its first line/.test(authSkillText));

  const ready = !!BASH && !!ident && CLAIM_TAGS.every((t) => !!CP.ops[t]) && OWNER_TAGS.every((t) => !!OO.ops[t]);
  if (!ready) console.log('  (tagged blocks / bash / identity helper not all available - executed scenarios skipped; RED)');

  if (ready) {
    // ══ EP-R1r · proof A — ARC-A/TASK-10, ARC-B/TASK-10 and legacy TASK-10 coexist ═══════════
    section('EP-R1r proof A: duplicate taskIds coexist across namespaces (real claim sequence)');
    const a1 = mkRepo('proofA', {
      snapshots: { 'arc-a-r1': { arcId: 'ARC-A' }, 'arc-b-r1': { arcId: 'ARC-B' }, 'legacy-v3': {} },
      legacyPointer: 'legacy-v3', arcPointers: { 'ARC-A': 'arc-a-r1', 'ARC-B': 'arc-b-r1' }, arcContainers: ['ARC-A', 'ARC-B']
    });
    const rA = runWorker(a1, CLAIM_SEQ, { ARC: 'ARC-A' });
    const rB = runWorker(a1, CLAIM_SEQ, { ARC: 'ARC-B' });
    const rL = runWorker(a1, CLAIM_SEQ, { ARC: '' });
    check('EP-R1r --arc ARC-A claim sequence exit 0' + tail(rA), done(rA));
    check('EP-R1r --arc ARC-B claim sequence exit 0' + tail(rB), done(rB));
    check('EP-R1r legacy (no --arc) claim sequence exit 0' + tail(rL), done(rL));
    const pA = path.join(a1.root, 'arc-claims', 'ARC-A', 'TASK-10', 'claim.json');
    const pB = path.join(a1.root, 'arc-claims', 'ARC-B', 'TASK-10', 'claim.json');
    const pL = path.join(a1.root, 'claims', 'TASK-10', 'claim.json');
    check('EP-R1r all three claim.json exist side by side; none collided', fs.existsSync(pA) && fs.existsSync(pB) && fs.existsSync(pL));
    if (fs.existsSync(pA) && fs.existsSync(pB) && fs.existsSync(pL)) {
      const cA = rdJson(pA), cB = rdJson(pB), cL = rdJson(pL);
      check('EP-R1r each record carries the arcId of its own directory; the legacy record carries none', cA.arcId === 'ARC-A' && cB.arcId === 'ARC-B' && !('arcId' in cL));
      check('EP-R1r claimMatchesPath MATCH for all three against their runtime-root-relative paths',
        ident.claimMatchesPath(cA, 'arc-claims/ARC-A/TASK-10/claim.json').verdict === 'MATCH' &&
        ident.claimMatchesPath(cB, 'arc-claims/ARC-B/TASK-10/claim.json').verdict === 'MATCH' &&
        ident.claimMatchesPath(cL, 'claims/TASK-10/claim.json').verdict === 'MATCH');
      check('EP-R1r three distinct identity keys (arcId ?? null, taskId)', new Set([
        JSON.stringify(ident.claimIdentityFromPath('arc-claims/ARC-A/TASK-10/claim.json').key),
        JSON.stringify(ident.claimIdentityFromPath('arc-claims/ARC-B/TASK-10/claim.json').key),
        JSON.stringify(ident.claimIdentityFromPath('claims/TASK-10/claim.json').key)]).size === 3);
      check('EP-R1r all three validate claim.schema.json; each records its own planId and state CLAIMED', [cA, cB, cL].every((c) => schemaOk('claim', c)) &&
        cA.planId === 'arc-a-r1' && cB.planId === 'arc-b-r1' && cL.planId === 'legacy-v3' && [cA, cB, cL].every((c) => c.state === 'CLAIMED'));
      check('EP-R1r the legacy run printed the ARC-pointers notice (report-only; the selector was already fixed by the absent --arc)', /NOTICE[\s\S]*ARC/.test(rL.stdout));
      check('EP-R1r the --arc ARC-A run never wrote into claims/ or arc-claims/ARC-B/ (only its own claim directory appeared)',
        fs.readdirSync(path.join(a1.root, 'arc-claims', 'ARC-A')).join() === 'TASK-10' && fs.readdirSync(path.join(a1.root, 'arc-claims', 'ARC-B')).join() === 'TASK-10');
    }

    // ══ EP-R2 · proof B — a COMPLETE dependency in another namespace never satisfies ═════════
    section('EP-R2 proof B: dependency resolution is namespace-scoped');
    const b1 = mkRepo('proofB', {
      snapshots: { 'arc-a-r1': { arcId: 'ARC-A' }, 'arc-b-r1': { arcId: 'ARC-B' }, 'legacy-v3': {} },
      legacyPointer: 'legacy-v3', arcPointers: { 'ARC-A': 'arc-a-r1', 'ARC-B': 'arc-b-r1' }, arcContainers: ['ARC-A', 'ARC-B'],
      legacyClaims: { 'TASK-10': claimRec('TASK-10', 'COMPLETE', 'legacy-v3') },
      arcClaims: { 'ARC-A': { 'TASK-10': claimRec('TASK-10', 'COMPLETE', 'arc-a-r1', 'ARC-A') } }
    });
    const legacyBefore = treeHash(b1.claims), arcABefore = treeHash(path.join(b1.arcClaims, 'ARC-A'));
    const fB = runWorker(b1, FILTER_SEQ, { ARC: 'ARC-B' });
    check('EP-R2 --arc ARC-B: TASK-20 is NOT eligible although arc-claims/ARC-A/TASK-10 and claims/TASK-10 are COMPLETE; the reason names ARC-B' + tail(fB),
      done(fB) && /TASK-20/.test(fB.stdout) && /not COMPLETE/i.test(fB.stdout) && /ARC-B/.test(fB.stdout) && !/^ELIGIBLE.*TASK-20/m.test(fB.stdout));
    check('EP-R2 --arc ARC-B: TASK-10 itself IS eligible in ARC-B (its own namespace has no claim)', done(fB) && /^SELECTED TASK-10$/m.test(fB.stdout));
    const fA = runWorker(b1, FILTER_SEQ, { ARC: 'ARC-A' });
    check('EP-R2 --arc ARC-A: the same dependency IS satisfied (its own COMPLETE record) and TASK-20 is selected' + tail(fA), done(fA) && /^SELECTED TASK-20$/m.test(fA.stdout));
    const fL = runWorker(b1, FILTER_SEQ, { ARC: '' });
    check('EP-R2 legacy stream: satisfied by claims/TASK-10 only; TASK-20 selected' + tail(fL), done(fL) && /^SELECTED TASK-20$/m.test(fL.stdout));
    check('EP-R2 the FILTER runs are read-only: claims/ and arc-claims/ARC-A/ byte-identical afterwards', treeHash(b1.claims) === legacyBefore && treeHash(path.join(b1.arcClaims, 'ARC-A')) === arcABefore);
    const b2 = mkRepo('proofB2', {
      snapshots: { 'arc-a-r1': { arcId: 'ARC-A' } }, arcPointers: { 'ARC-A': 'arc-a-r1' }, arcContainers: ['ARC-A'],
      arcClaims: { 'ARC-A': { 'TASK-10': claimRec('TASK-10', 'BLOCKED', 'arc-a-r1', 'ARC-A') } }
    });
    const fBl = runWorker(b2, FILTER_SEQ, { ARC: 'ARC-A' });
    check('EP-R2 a BLOCKED dependency in the same ARC does not satisfy; no task is eligible ⇒ IDLE' + tail(fBl), ok(fBl) && /IDLE/.test(fBl.stdout) && !/^SELECTED/m.test(fBl.stdout));
    const b3 = mkRepo('proofB3', {
      snapshots: { 'arc-a-r1': { arcId: 'ARC-A' } }, arcPointers: { 'ARC-A': 'arc-a-r1' }, arcContainers: ['ARC-A'],
      arcClaims: { 'ARC-A': { 'TASK-10': 'EMPTY-DIR' } }
    });
    const fInc = runWorker(b3, FILTER_SEQ, { ARC: 'ARC-A' });
    check('EP-R2 an INCOMPLETE-CLAIM directory (no claim.json) fails the exists-AND-parses clause ⇒ dependency unsatisfied, IDLE' + tail(fInc), ok(fInc) && /IDLE/.test(fInc.stdout) && !/^SELECTED/m.test(fInc.stdout));

    // ══ EP-R3 · proof C — planId is not consulted for dependency satisfaction ════════════════
    section('EP-R3 proof C: completion is a fact about the task, not the plan version');
    const c1 = mkRepo('proofC', {
      snapshots: { 'arc-a-r1': { arcId: 'ARC-A' }, 'arc-a-r2': { arcId: 'ARC-A' } },
      arcPointers: { 'ARC-A': 'arc-a-r2' }, arcContainers: ['ARC-A'],
      arcClaims: { 'ARC-A': { 'TASK-10': claimRec('TASK-10', 'COMPLETE', 'arc-a-r1', 'ARC-A') } }
    });
    const fC = runWorker(c1, FILTER_SEQ, { ARC: 'ARC-A' });
    check('EP-R3 claim planId arc-a-r1 under pointer arc-a-r2 still satisfies TASK-20; FILTER excludes TASK-10 (directory present) and selects TASK-20' + tail(fC),
      done(fC) && /^SELECTED TASK-20$/m.test(fC.stdout) && !/^SELECTED TASK-10$/m.test(fC.stdout));

    // ══ EP-R4r · proof D — the global mutex serializes ARCs ═════════════════════════════════
    section('EP-R4r proof D: mutex classes are global; arbitration crosses ARCs');
    function contention(label, holder, env) {
      const r = mkRepo(label, {
        snapshots: { 'arc-a-r1': { arcId: 'ARC-A', tasks: TASKS_CODE() }, 'arc-b-r1': { arcId: 'ARC-B', tasks: TASKS_CODE() }, 'legacy-v3': { tasks: TASKS_CODE() } },
        legacyPointer: 'legacy-v3', arcPointers: { 'ARC-A': 'arc-a-r1', 'ARC-B': 'arc-b-r1' }, arcContainers: ['ARC-A', 'ARC-B'],
        mutex: { 'CODE:index-html': holder }
      });
      const before = treeHash(r.mutex);
      const out = runWorker(r, CLAIM_SEQ, env);
      const claimsRoot = env.ARC ? path.join(r.arcClaims, env.ARC) : r.claims;
      return { r, out, before, after: treeHash(r.mutex), claimDirGone: !fs.existsSync(path.join(claimsRoot, 'T-CODE')) };
    }
    const dAB = contention('proofD1', holderRec('T-CODE', 'ARC-A'), { ARC: 'ARC-B' });
    check('EP-R4r --arc ARC-B against a holder {arcId ARC-A, taskId T-CODE}: rollback, STOPPED/UNCLAIMED, claim directory removed, nothing written' + tail(dAB.out),
      ok(dAB.out) && /STOPPED/.test(dAB.out.stdout) && /UNCLAIMED/.test(dAB.out.stdout) && dAB.claimDirGone && dAB.after === dAB.before);
    check('EP-R4r the contention report names the holding class and the holder pair', /CODE:index-html/.test(dAB.out.stdout) && /ARC-A/.test(dAB.out.stdout));
    const dLA = contention('proofD2', holderRec('T-CODE', 'ARC-A'), { ARC: '' });
    check('EP-R4r legacy identity against an ARC-A holder of the same taskId: also blocked (the class is global), holder untouched' + tail(dLA.out),
      ok(dLA.out) && /STOPPED/.test(dLA.out.stdout) && dLA.claimDirGone && dLA.after === dLA.before);
    const dAL = contention('proofD3', holderRec('T-CODE', null), { ARC: 'ARC-A' });
    check('EP-R4r ARC identity against a legacy holder of the same taskId: also blocked, holder untouched' + tail(dAL.out),
      ok(dAL.out) && /STOPPED/.test(dAL.out.stdout) && dAL.claimDirGone && dAL.after === dAL.before);
    const dOk = mkRepo('proofD4', {
      snapshots: { 'arc-a-r1': { arcId: 'ARC-A', tasks: TASKS_CODE() } }, arcPointers: { 'ARC-A': 'arc-a-r1' }, arcContainers: ['ARC-A']
    });
    const dOkR = runWorker(dOk, CLAIM_SEQ, { ARC: 'ARC-A' });
    const holderPath = path.join(dOk.mutex, 'CODE__index-html', 'holder.json');
    check('EP-R4r an uncontended ARC acquire writes holder.json carrying arcId (holder.schema.json valid) and commits the claim' + tail(dOkR),
      done(dOkR) && fs.existsSync(holderPath) && (() => { const h = rdJson(holderPath); return h.taskId === 'T-CODE' && h.arcId === 'ARC-A' && h.lane === 'MAIN' && schemaOk('holder', h); })() &&
      fs.existsSync(path.join(dOk.arcClaims, 'ARC-A', 'T-CODE', 'claim.json')));
    const dOkL = mkRepo('proofD5', { snapshots: { 'legacy-v3': { tasks: TASKS_CODE() } }, legacyPointer: 'legacy-v3' });
    const dOkLR = runWorker(dOkL, CLAIM_SEQ, { ARC: '' });
    check('EP-R4r an uncontended legacy acquire writes a holder with NO arcId (holder.schema.json valid)' + tail(dOkLR),
      done(dOkLR) && (() => { const h = rdJson(path.join(dOkL.mutex, 'CODE__index-html', 'holder.json')); return h.taskId === 'T-CODE' && !('arcId' in h) && schemaOk('holder', h); })());

    // ══ EP-R5r / EP-E10 · proof E — release requires the exact (arcId ?? null, taskId) pair ══
    section('EP-R5r / EP-E10 proof E: holder release is pair-matched (D-28)');
    function releaseCase(label, holder, env) {
      const claimSpec = env.ARC
        ? { arcClaims: { [env.ARC]: { 'T-CODE': claimRec('T-CODE', 'CLAIMED', env.ARC === 'ARC-A' ? 'arc-a-r1' : 'arc-b-r1', env.ARC, null, ['CODE:index-html']) } } }
        : { legacyClaims: { 'T-CODE': claimRec('T-CODE', 'CLAIMED', 'legacy-v3', null, null, ['CODE:index-html']) } };
      const r = mkRepo(label, Object.assign({
        snapshots: { 'arc-a-r1': { arcId: 'ARC-A', tasks: TASKS_CODE() }, 'arc-b-r1': { arcId: 'ARC-B', tasks: TASKS_CODE() }, 'legacy-v3': { tasks: TASKS_CODE() } },
        legacyPointer: 'legacy-v3', arcPointers: { 'ARC-A': 'arc-a-r1', 'ARC-B': 'arc-b-r1' }, arcContainers: ['ARC-A', 'ARC-B'],
        mutex: { 'CODE:index-html': holder }
      }, claimSpec));
      const before = treeHash(r.mutex);
      const out = runWorker(r, RELEASE_ONLY_SEQ, Object.assign({ TASK_ID: 'T-CODE' }, env));
      return { r, out, before, after: treeHash(r.mutex), dirStillThere: fs.existsSync(path.join(r.mutex, 'CODE__index-html')) };
    }
    const eAB = releaseCase('proofE1', holderRec('T-CODE', 'ARC-B'), { ARC: 'ARC-A' });
    check('EP-R5r identity (ARC-A, T-CODE) never releases a holder (ARC-B, T-CODE): directory intact, bytes unchanged' + tail(eAB.out), done(eAB.out) && eAB.dirStillThere && eAB.after === eAB.before);
    const eLA = releaseCase('proofE2', holderRec('T-CODE', 'ARC-A'), { ARC: '' });
    check('EP-E10 a legacy identity never releases an ARC holder with the same taskId (D-28): directory intact' + tail(eLA.out), done(eLA.out) && eLA.dirStillThere && eLA.after === eLA.before);
    const eAL = releaseCase('proofE3', holderRec('T-CODE', null), { ARC: 'ARC-A' });
    check('EP-R5r an ARC identity never releases a legacy holder with the same taskId (D-28): directory intact' + tail(eAL.out), done(eAL.out) && eAL.dirStillThere && eAL.after === eAL.before);
    const eOk = releaseCase('proofE4', holderRec('T-CODE', 'ARC-A'), { ARC: 'ARC-A' });
    check('EP-R5r the matching pair (ARC-A, T-CODE) DOES release: holder.json and the class directory are gone' + tail(eOk.out), done(eOk.out) && !eOk.dirStillThere);
    check('EP-R5r COMPLETE is written to claim.json BEFORE any release, and the claim directory is retained', (() => {
      const c = path.join(eOk.r.arcClaims, 'ARC-A', 'T-CODE', 'claim.json');
      if (!fs.existsSync(c)) return false;
      const o = rdJson(c);
      return o.state === 'COMPLETE' && o.arcId === 'ARC-A' && schemaOk('claim', o) && o.stateHistory.some((h) => h.state === 'COMPLETE');
    })());
    check('EP-R5r a refused release leaves the claim at COMPLETE (record durable) while the foreign holder stands — retention is of the record, never of another owner resource', (() => {
      const c = path.join(eAB.r.arcClaims, 'ARC-A', 'T-CODE', 'claim.json');
      return fs.existsSync(c) && rdJson(c).state === 'COMPLETE';
    })());

    // ══ EP-E5 · `--arc` cannot resolve the wrong ARC ════════════════════════════════════════
    section('EP-E5 wrong --arc never resolves: malformed, case-variant, mismatched, missing container');
    const base = () => ({
      snapshots: { 'arc-a-r1': { arcId: 'ARC-A' }, 'legacy-v3': {} },
      legacyPointer: 'legacy-v3', arcPointers: { 'ARC-A': 'arc-a-r1' }, arcContainers: ['ARC-A']
    });
    function idleCase(label, env, spec) {
      const r = mkRepo(label, spec || base());
      const before = treeHash(r.root);
      const out = runWorker(r, CLAIM_SEQ, env);
      return { r, out, unchanged: treeHash(r.root) === before };
    }
    const w1 = idleCase('e5-lower', { ARC: 'arc-a' });
    check('EP-E5 malformed --arc "arc-a" (lowercase) ⇒ IDLE, nothing written, never normalized' + tail(w1.out), ok(w1.out) && /IDLE/.test(w1.out.stdout) && w1.unchanged);
    const w2 = idleCase('e5-case', { ARC: 'Arc-A' });
    check('EP-E5 case-variant --arc "Arc-A" ⇒ IDLE, nothing written (case-exact, never folded to ARC-A)' + tail(w2.out), ok(w2.out) && /IDLE/.test(w2.out.stdout) && w2.unchanged);
    const w3 = idleCase('e5-core', { ARC: 'CORE-STREAM' });
    check('EP-E5 --arc CORE-STREAM ⇒ IDLE: the registry index entry for the legacy stream is never a runtime selector' + tail(w3.out),
      ok(w3.out) && /IDLE/.test(w3.out.stdout) && /CORE-STREAM/.test(w3.out.stdout) && w3.unchanged);
    const w4 = idleCase('e5-ptr', { ARC: 'ARC-B' }, Object.assign(base(), { arcPointers: { 'ARC-A': 'arc-a-r1', 'ARC-B': 'arc-a-r1' }, arcPointerExtra: { 'ARC-B': { arcId: 'ARC-A' } }, arcContainers: ['ARC-A', 'ARC-B'] }));
    check('EP-E5 pointer identity mismatch (plans/arcs/ARC-B/current.json carries arcId ARC-A) ⇒ IDLE pointer-arc-mismatch, nothing written' + tail(w4.out),
      ok(w4.out) && /pointer-arc-mismatch/.test(w4.out.stdout) && w4.unchanged);
    const w4b = idleCase('e5-ptrlegacy', { ARC: '' }, Object.assign(base(), { legacyPointerExtra: { arcId: 'ARC-A' } }));
    check('EP-E5 a legacy pointer carrying arcId ⇒ IDLE pointer-arc-mismatch (the legacy stream never carries one)' + tail(w4b.out),
      ok(w4b.out) && /pointer-arc-mismatch/.test(w4b.out.stdout) && w4b.unchanged);
    const w5 = idleCase('e5-claimarc', { ARC: 'ARC-A' }, Object.assign(base(), { arcClaims: { 'ARC-A': { 'TASK-10': claimRec('TASK-10', 'CLAIMED', 'arc-a-r1', 'ARC-B') } } }));
    check('EP-E5 a claim record whose arcId is not its directory ⇒ IDLE claim-arc-mismatch, nothing written' + tail(w5.out),
      ok(w5.out) && /claim-arc-mismatch/.test(w5.out.stdout) && w5.unchanged);
    const w5b = idleCase('e5-claimlegacy', { ARC: '' }, Object.assign(base(), { legacyClaims: { 'TASK-10': claimRec('TASK-10', 'CLAIMED', 'legacy-v3', 'ARC-A') } }));
    check('EP-E5 a legacy claim record carrying arcId ⇒ IDLE claim-arc-mismatch (legacy records must not carry one)' + tail(w5b.out),
      ok(w5b.out) && /claim-arc-mismatch/.test(w5b.out.stdout) && w5b.unchanged);
    const w6 = idleCase('e5-container', { ARC: 'ARC-A' }, Object.assign(base(), { arcContainers: [] }));
    check('EP-E5 pointer present but arc-claims/ARC-A/ container missing ⇒ IDLE arc-claims-container-missing; the worker never creates a container' + tail(w6.out),
      ok(w6.out) && /arc-claims-container-missing/.test(w6.out.stdout) && w6.unchanged);

    // ══ EP-E6 · arc-retired and arc-not-published are separately reachable ══════════════════
    section('EP-E6 retired vs never-published: two distinct fail-closed rows');
    const np = idleCase('e6-np', { ARC: 'ARC-Z' }, base());
    check('EP-E6 no plans/arcs/ARC-Z/ at all ⇒ IDLE arc-not-published' + tail(np.out), ok(np.out) && /arc-not-published/.test(np.out.stdout) && !/arc-retired/.test(np.out.stdout) && np.unchanged);
    const rt = idleCase('e6-rt', { ARC: 'ARC-R' }, Object.assign(base(), { snapshots: { 'arc-a-r1': { arcId: 'ARC-A' }, 'arc-r-r1': { arcId: 'ARC-R' }, 'legacy-v3': {} }, arcRetired: { 'ARC-R': 'arc-r-r1' }, arcContainers: ['ARC-A', 'ARC-R'] }));
    check('EP-E6 plans/arcs/ARC-R/ holding only retired-arc-r-r1.json ⇒ IDLE arc-retired (distinct from arc-not-published)' + tail(rt.out),
      ok(rt.out) && /arc-retired/.test(rt.out.stdout) && !/arc-not-published/.test(rt.out.stdout) && rt.unchanged);
    const noRoot = idleCase('e6-noroot', { ARC: 'ARC-A' }, { snapshots: { 'legacy-v3': {} }, legacyPointer: 'legacy-v3' });
    check('EP-E6 arc-claims/ root absent entirely ⇒ IDLE, and the root triple plans/claims/mutex still counts as complete' + tail(noRoot.out), ok(noRoot.out) && /IDLE/.test(noRoot.out.stdout) && noRoot.unchanged);

    // ══ EP-E5b · plan-not-current and the wrong-`--arc` resume ══════════════════════════════
    section('EP-E5b resume: plan-not-current BLOCKED · wrong --arc STOPPED with no write');
    const pnc = mkRepo('e5-pnc', {
      snapshots: { 'arc-a-r1': { arcId: 'ARC-A' }, 'arc-a-r2': { arcId: 'ARC-A' } },
      arcPointers: { 'ARC-A': 'arc-a-r2' }, arcContainers: ['ARC-A'],
      arcClaims: { 'ARC-A': { 'TASK-10': claimRec('TASK-10', 'CLAIMED', 'arc-a-r1', 'ARC-A') } }
    });
    const pncBefore = treeHash(pnc.root);
    const pncR = runWorker(pnc, RESUME_SEQ, { ARC: 'ARC-A', TASK_ID: 'TASK-10', RESUME: '1' });
    check('EP-E5b resume of a claim pinned to arc-a-r1 while the ARC pointer is arc-a-r2 ⇒ BLOCKED plan-not-current-for-arc, nothing written' + tail(pncR),
      ok(pncR) && /BLOCKED/.test(pncR.stdout) && /plan-not-current-for-arc/.test(pncR.stdout) && treeHash(pnc.root) === pncBefore);
    const wr = mkRepo('e5-wrongarc', {
      snapshots: { 'arc-a-r1': { arcId: 'ARC-A' }, 'arc-b-r1': { arcId: 'ARC-B' } },
      arcPointers: { 'ARC-A': 'arc-a-r1', 'ARC-B': 'arc-b-r1' }, arcContainers: ['ARC-A', 'ARC-B'],
      arcClaims: { 'ARC-B': { 'TASK-10': claimRec('TASK-10', 'CLAIMED', 'arc-b-r1', 'ARC-A') } }
    });
    const wrBefore = treeHash(wr.root);
    const wrR = runWorker(wr, RESUME_SEQ, { ARC: 'ARC-B', TASK_ID: 'TASK-10', RESUME: '1' });
    check('EP-E5b --resume under --arc ARC-B on a record whose claim.arcId is ARC-A ⇒ STOPPED, no write (D-6, mechanical)' + tail(wrR),
      ok(wrR) && /STOPPED/.test(wrR.stdout) && treeHash(wr.root) === wrBefore);
    check('EP-E5b the wrong-ARC resume never fell back to the other namespace (the refusal names only the selected one)', /ARC-B/.test(wrR.stdout));
    const nf = mkRepo('e5-notfound', {
      snapshots: { 'arc-a-r1': { arcId: 'ARC-A' }, 'legacy-v3': {} },
      legacyPointer: 'legacy-v3', arcPointers: { 'ARC-A': 'arc-a-r1' }, arcContainers: ['ARC-A'],
      legacyClaims: { 'TASK-10': claimRec('TASK-10', 'BLOCKED', 'legacy-v3') }
    });
    const nfBefore = treeHash(nf.root);
    const nfR = runWorker(nf, RESUME_SEQ, { ARC: 'ARC-A', TASK_ID: 'TASK-10', RESUME: '1' });
    check('EP-E5b --resume under --arc ARC-A for a task that exists only in claims/ ⇒ BLOCKED no-claim, never a fallback to the legacy record' + tail(nfR),
      ok(nfR) && /BLOCKED/.test(nfR.stdout) && treeHash(nf.root) === nfBefore && !/claims\/TASK-10/.test(nfR.stdout.replace(/arc-claims\/[A-Z0-9-]+\/TASK-10/g, '')));

    // ══ EP-R8 · holder pair mismatch on resume ⇒ BLOCKED, retaining what is held ════════════
    section('EP-R8 resume: holder pair mismatch is BLOCKED and retains the held resource');
    const hp = mkRepo('r8', {
      snapshots: { 'arc-a-r1': { arcId: 'ARC-A', tasks: TASKS_CODE() } }, arcPointers: { 'ARC-A': 'arc-a-r1' }, arcContainers: ['ARC-A'],
      arcClaims: { 'ARC-A': { 'T-CODE': claimRec('T-CODE', 'CLAIMED', 'arc-a-r1', 'ARC-A', null, ['CODE:index-html']) } },
      mutex: { 'CODE:index-html': holderRec('T-CODE', 'ARC-B') }
    });
    const hpBefore = treeHash(hp.mutex);
    const hpR = runWorker(hp, RESUME_SEQ, { ARC: 'ARC-A', TASK_ID: 'T-CODE', RESUME: '1' });
    check('EP-R8 a declared class held by (ARC-B, T-CODE) while the resuming identity is (ARC-A, T-CODE) ⇒ BLOCKED, holder retained byte-identical' + tail(hpR),
      ok(hpR) && /BLOCKED/.test(hpR.stdout) && /held by another owner pair/.test(hpR.stdout) && treeHash(hp.mutex) === hpBefore);
    const hpOk = mkRepo('r8b', {
      snapshots: { 'arc-a-r1': { arcId: 'ARC-A', tasks: TASKS_CODE() } }, arcPointers: { 'ARC-A': 'arc-a-r1' }, arcContainers: ['ARC-A'],
      arcClaims: { 'ARC-A': { 'T-CODE': claimRec('T-CODE', 'CLAIMED', 'arc-a-r1', 'ARC-A', null, ['CODE:index-html']) } },
      mutex: { 'CODE:index-html': holderRec('T-CODE', 'ARC-A') }
    });
    const hpOkR = runWorker(hpOk, RESUME_SEQ, { ARC: 'ARC-A', TASK_ID: 'T-CODE', RESUME: '1' });
    check('EP-R8 the matching pair resumes: resumeCount incremented, conversationId updated, stateHistory appended, claim still schema-valid' + tail(hpOkR), (() => {
      const c = path.join(hpOk.arcClaims, 'ARC-A', 'T-CODE', 'claim.json');
      if (!done(hpOkR) || !fs.existsSync(c)) return false;
      const o = rdJson(c);
      return o.resumeCount === 1 && o.conversationId === 'qa-conv' && o.stateHistory.length >= 2 && o.arcId === 'ARC-A' && schemaOk('claim', o);
    })());
    const hpMissing = mkRepo('r8c', {
      snapshots: { 'arc-a-r1': { arcId: 'ARC-A', tasks: TASKS_CODE() } }, arcPointers: { 'ARC-A': 'arc-a-r1' }, arcContainers: ['ARC-A'],
      arcClaims: { 'ARC-A': { 'T-CODE': claimRec('T-CODE', 'CLAIMED', 'arc-a-r1', 'ARC-A', null, ['CODE:index-html']) } }
    });
    const hpMR = runWorker(hpMissing, RESUME_SEQ, { ARC: 'ARC-A', TASK_ID: 'T-CODE', RESUME: '1' });
    check('EP-R8 a missing declared class is re-acquired in canonical order with an arcId-carrying holder' + tail(hpMR), (() => {
      const h = path.join(hpMissing.mutex, 'CODE__index-html', 'holder.json');
      return done(hpMR) && fs.existsSync(h) && rdJson(h).arcId === 'ARC-A' && schemaOk('holder', rdJson(h));
    })());

    // ══ EP-R6 · proof F — owner-ops namespace selector (X-2) ═══════════════════════════════
    section('EP-R6 proof F: mutating owner operations require exactly one selector');
    const ownerSpec = () => ({
      snapshots: { 'arc-a-r1': { arcId: 'ARC-A' }, 'arc-b-r1': { arcId: 'ARC-B' }, 'legacy-v3': {} },
      legacyPointer: 'legacy-v3', arcPointers: { 'ARC-A': 'arc-a-r1', 'ARC-B': 'arc-b-r1' }, arcContainers: ['ARC-A', 'ARC-B'],
      legacyClaims: { 'TASK-10': claimRec('TASK-10', 'BLOCKED', 'legacy-v3') },
      arcClaims: { 'ARC-A': { 'TASK-10': claimRec('TASK-10', 'BLOCKED', 'arc-a-r1', 'ARC-A') }, 'ARC-B': { 'TASK-99': claimRec('TASK-99', 'BLOCKED', 'arc-b-r1', 'ARC-B') } }
    });
    const o1 = mkRepo('ownerF', ownerSpec());
    const oClaimsBefore = treeHash(o1.claims), oArcBefore = treeHash(o1.arcClaims);
    const noSel = runOwner(o1, ['owner-prelude', 'owner-selector', 'owner-release'], { SEL: '', ARC: '', TASK: 'TASK-10' });
    check('EP-R6 RELEASE with no selector ⇒ REFUSE (exit 1), before any namespace read', noSel.status === 1 && /REFUSED/.test(noSel.out) && !/::DONE::/.test(noSel.stdout));
    check('EP-R6 the no-selector refusal names no task id from either namespace and leaves both trees byte-identical (equivalent of the zero-read proof)',
      !/TASK-10|TASK-99/.test(noSel.out) && treeHash(o1.claims) === oClaimsBefore && treeHash(o1.arcClaims) === oArcBefore);
    const bothSel = runOwner(o1, ['owner-prelude', 'owner-selector', 'owner-release'], { SEL: 'legacy', ARC: 'ARC-A', TASK: 'TASK-10' });
    check('EP-R6 --legacy together with --arc ⇒ REFUSE (mutually exclusive), both trees unchanged',
      bothSel.status === 1 && /REFUSED/.test(bothSel.out) && treeHash(o1.claims) === oClaimsBefore && treeHash(o1.arcClaims) === oArcBefore);
    const relLeg = runOwner(o1, ['owner-prelude', 'owner-selector', 'owner-release'], { SEL: 'legacy', ARC: '', TASK: 'TASK-10' });
    check('EP-R6 --legacy RELEASE removes exactly claims/TASK-10 and leaves every ARC tree byte-identical' + tail(relLeg),
      done(relLeg) && !fs.existsSync(path.join(o1.claims, 'TASK-10')) && treeHash(o1.arcClaims) === oArcBefore);
    const o2 = mkRepo('ownerF2', ownerSpec());
    const o2LegBefore = treeHash(o2.claims), o2BBefore = treeHash(path.join(o2.arcClaims, 'ARC-B'));
    const relArc = runOwner(o2, ['owner-prelude', 'owner-selector', 'owner-release'], { SEL: 'arc', ARC: 'ARC-A', TASK: 'TASK-10' });
    check('EP-R6 --arc ARC-A RELEASE removes exactly arc-claims/ARC-A/TASK-10 and leaves claims/ and arc-claims/ARC-B/ byte-identical' + tail(relArc),
      done(relArc) && !fs.existsSync(path.join(o2.arcClaims, 'ARC-A', 'TASK-10')) && treeHash(o2.claims) === o2LegBefore && treeHash(path.join(o2.arcClaims, 'ARC-B')) === o2BBefore);
    const o3 = mkRepo('ownerF3', ownerSpec());
    const o3LegBefore = treeHash(o3.claims);
    const noFall = runOwner(o3, ['owner-prelude', 'owner-selector', 'owner-release'], { SEL: 'arc', ARC: 'ARC-B', TASK: 'TASK-10' });
    check('EP-R6 --arc ARC-B RELEASE of a taskId that exists only in claims/ and arc-claims/ARC-A/ ⇒ REFUSE not-found, never a fallback; claims/ untouched',
      noFall.status === 1 && /REFUSED/.test(noFall.out) && /not.found|no such claim|absent/i.test(noFall.out) && treeHash(o3.claims) === o3LegBefore && fs.existsSync(path.join(o3.claims, 'TASK-10')));
    const o4 = mkRepo('ownerF4', Object.assign(ownerSpec(), { arcClaims: { 'ARC-A': { 'TASK-10': claimRec('TASK-10', 'COMPLETE', 'arc-a-r1', 'ARC-A') }, 'ARC-B': { 'TASK-99': claimRec('TASK-99', 'BLOCKED', 'arc-b-r1', 'ARC-B') } } }));
    const relComplete = runOwner(o4, ['owner-prelude', 'owner-selector', 'owner-release'], { SEL: 'arc', ARC: 'ARC-A', TASK: 'TASK-10' });
    check('EP-R6 RELEASE of a COMPLETE claim ⇒ REFUSE (R-M: COMPLETE is terminal-durable and is the dependency ledger); the record survives',
      relComplete.status === 1 && /REFUSED/.test(relComplete.out) && /COMPLETE/.test(relComplete.out) && fs.existsSync(path.join(o4.arcClaims, 'ARC-A', 'TASK-10', 'claim.json')));
    const o5 = mkRepo('ownerF5', ownerSpec());
    const aban = runOwner(o5, ['owner-prelude', 'owner-selector', 'owner-abandon'], { SEL: 'arc', ARC: 'ARC-A', TASK: 'TASK-10' });
    check('EP-R6 --arc ARC-A ABANDON rewrites the record to ABANDONED and RETAINS the claim directory' + tail(aban), (() => {
      const c = path.join(o5.arcClaims, 'ARC-A', 'TASK-10', 'claim.json');
      return done(aban) && fs.existsSync(c) && rdJson(c).state === 'ABANDONED' && rdJson(c).arcId === 'ARC-A' && schemaOk('claim', rdJson(c));
    })());

    section('EP-R6 INSPECT is read-only and enumerates both namespaces');
    const o6 = mkRepo('ownerInspect', ownerSpec());
    const inspBefore = treeHash(o6.root);
    const insp = runOwner(o6, ['owner-prelude', 'owner-inspect'], {});
    check('EP-R6 INSPECT runs with no selector at all and exits 0' + tail(insp), done(insp));
    check('EP-R6 INSPECT prints separate headings for claims/ and arc-claims/*/ and lists both TASK-10 records plus ARC-B/TASK-99',
      /claims\//.test(insp.stdout) && /arc-claims\//.test(insp.stdout) && /ARC-A/.test(insp.stdout) && /ARC-B/.test(insp.stdout) && /TASK-99/.test(insp.stdout));
    check('EP-R6 INSPECT reports DUPLICATE-ID-INFO for the taskId present in more than one namespace', /DUPLICATE-ID-INFO/.test(insp.stdout) && /TASK-10/.test(insp.stdout));
    check('EP-R6 INSPECT wrote nothing: the whole runtime tree is byte-identical', treeHash(o6.root) === inspBefore);

    section('EP-R6 owner-lane mutex release is filtered by the (arcId ?? null, taskId) pair');
    function ownerMutex(label, holder, env) {
      const r = mkRepo(label, Object.assign(ownerSpec(), { mutex: { 'CODE:index-html': holder } }));
      const before = treeHash(r.mutex);
      const out = runOwner(r, ['owner-prelude', 'owner-selector', 'owner-mutex-release'], env);
      return { r, out, before, after: treeHash(r.mutex), stillThere: fs.existsSync(path.join(r.mutex, 'CODE__index-html')) };
    }
    const m1 = ownerMutex('ownerMx1', holderRec('__OWNER__', 'ARC-B', 'OWNER'), { SEL: 'arc', ARC: 'ARC-A', CLASS: 'CODE:index-html', TASK: '__OWNER__' });
    check('EP-R6 owner mutex RELEASE under --arc ARC-A refuses a holder (ARC-B, __OWNER__): REFUSED, directory intact', m1.out.status === 1 && /REFUSED/.test(m1.out.out) && m1.stillThere && m1.after === m1.before);
    const m2 = ownerMutex('ownerMx2', holderRec('__OWNER__', 'ARC-A', 'OWNER'), { SEL: 'legacy', ARC: '', CLASS: 'CODE:index-html', TASK: '__OWNER__' });
    check('EP-R6 owner mutex RELEASE under --legacy refuses an ARC holder of the same id (D-28): REFUSED, directory intact', m2.out.status === 1 && /REFUSED/.test(m2.out.out) && m2.stillThere && m2.after === m2.before);
    const m3 = ownerMutex('ownerMx3', holderRec('__OWNER__', 'ARC-A', 'OWNER'), { SEL: 'arc', ARC: 'ARC-A', CLASS: 'CODE:index-html', TASK: '__OWNER__' });
    check('EP-R6 owner mutex RELEASE with the exact pair succeeds: holder.json and class directory removed' + tail(m3.out), done(m3.out) && !m3.stillThere);
    const m4 = mkRepo('ownerMx4', ownerSpec());
    const acq = runOwner(m4, ['owner-prelude', 'owner-selector', 'owner-mutex-acquire'], { SEL: 'arc', ARC: 'ARC-A', CLASS: 'CODE:index-html' });
    check('EP-R6 owner mutex ACQUIRE under --arc writes a holder {taskId __OWNER__, lane OWNER, arcId ARC-A} (holder.schema.json valid)' + tail(acq), (() => {
      const h = path.join(m4.mutex, 'CODE__index-html', 'holder.json');
      if (!done(acq) || !fs.existsSync(h)) return false;
      const o = rdJson(h);
      return o.taskId === '__OWNER__' && o.lane === 'OWNER' && o.arcId === 'ARC-A' && schemaOk('holder', o);
    })());
    const m5 = mkRepo('ownerMx5', ownerSpec());
    const acqL = runOwner(m5, ['owner-prelude', 'owner-selector', 'owner-mutex-acquire'], { SEL: 'legacy', ARC: '', CLASS: 'CODE:index-html' });
    check('EP-R6 owner mutex ACQUIRE under --legacy writes a holder with no arcId' + tail(acqL), (() => {
      const h = path.join(m5.mutex, 'CODE__index-html', 'holder.json');
      return done(acqL) && fs.existsSync(h) && !('arcId' in rdJson(h)) && schemaOk('holder', rdJson(h));
    })());

    // ══ EP-R10 · the shipped worker ladder call sites pass the SELECTED claim root ═══════════
    // B7 live-pilot finding: the real claim landed in arc-claims/EP-PILOT/LX-2 while the step-1b
    // `--ladder` print rendered `claims/LX-2 (legacy namespace)`, because the call omitted
    // --claim-dir. A-V5 pastes that same ladder into the authorization report, so a GO could be
    // reviewed against a claim path the grant does not apply to.
    //
    // PROOF SPLIT - both halves executed, neither assumed:
    //   EP-R10 (here)  the shipped WORKER blocks COMPUTE and PASS the selected claim root,
    //                  byte-identical to the directory the same run actually creates.
    //   EP-C17 (arc_worker_handshake_offline.js)  the RENDERER honours that --claim-dir, marks
    //                  `(legacy namespace)` only for claims/, and never falls back.
    //                  This suite only checks EP-C17 is PRESENT with its evidence; running it is a
    //                  separate execution in the focused QA round, not something asserted here.
    // This suite deliberately does NOT bind a profile: the ladder only renders its claim line for
    // a bound snapshot, and binding is the B1-owned libraryHash rule. Binding + rendering are
    // proven where they are owned (EP-C17); the call sites are proven here.
    //
    // Both surfaces deferred here in B6 are now executed in B6.1: /arc-authorize A-V5 in EP-R11
    // (authorize-ladder is a tagged @op) and the resume-path re-bind in EP-R12 (step9b-resume-rebind).
    section('EP-R10 shipped worker ladder call sites pass the selected claim root (B7 pilot finding)');
    {
      // ── supplemental static evidence (call-site text) ──
      const cpLadder = claimText.split('\n').filter((l) => /^[^#|>]*node .*--ladder/.test(l));
      check('EP-R10 (static) claim-protocol.md: every executable --ladder call passes --claim-dir (' + cpLadder.length + ' call site(s), incl. the resume re-bind - tagged step9b-resume-rebind and executed in EP-R12)',
        cpLadder.length >= 3 && cpLadder.every((l) => /--claim-dir/.test(l)));
      const authTxt = exists(REL.docs.authorizeSkill) ? stripCR(readText(REL.docs.authorizeSkill)) : '';
      const aIdx = authTxt.indexOf('--task "$TASK_ID" --ladder');
      check('EP-R10 (static) arc-authorize/SKILL.md A-V5 passes --claim-dir of the selected claim root (now the executable authorize-ladder block; the argv itself is proven in EP-R11)',
        aIdx !== -1 && /--claim-dir/.test(authTxt.slice(aIdx, aIdx + 160)));
      check('EP-R10 (static) arc-authorize/SKILL.md states the renderer legacy default is never relied on for approval evidence', /never relied on here/.test(authTxt));

      // ── strict cross-suite link: the renderer-side half must exist AND carry its evidence ──
      const hs = exists('qa/arc_worker_handshake_offline.js') ? stripCR(readText('qa/arc_worker_handshake_offline.js')) : '';
      const c17At = hs.indexOf("section('EP-C17");
      const c17 = c17At === -1 ? '' : hs.slice(c17At, c17At + 4000);
      check('EP-R10 renderer-side half is PRESENT in EP-C17 (handshake suite): section exists AND carries --claim-dir evidence for BOTH namespaces. This is a presence check only - EP-C17 must be EXECUTED separately in the focused run before final PASS',
        c17At !== -1 && /--claim-dir/.test(c17) && /arc-claims\/ARC-A\/LX-2/.test(c17) && /legacy namespace/.test(c17));

      // ── executed: the REAL blocks run verbatim; only GATE - a path variable this suite already
      //    re-points by contract - points at an argv recorder, so the argv the block actually
      //    passes is captured. The blocks themselves are unmodified.
      const REC_SRC = "'use strict';\nconst fs=require('fs');\nfs.appendFileSync(process.env.QA_ARGV_LOG, JSON.stringify(process.argv.slice(2))+'\\n');\nconsole.log('worktree          none');\nprocess.exit(0);\n";
      const SPEC = () => ({ snapshots: { 'arc-a-r1': { arcId: 'ARC-A' }, 'legacy-v3': {} }, legacyPointer: 'legacy-v3', arcPointers: { 'ARC-A': 'arc-a-r1' }, arcContainers: ['ARC-A'] });
      const CLAIM_1B = ['worker-prelude', 'worker-args', 'worker-namespace', 'step0-preconditions', 'step1-snapshot', 'step1a-filter', 'step1b-bind-profile', 'step2-claim', 'step3-mutex', 'step4-rollback', 'step5-commit-claim'];
      const PHASE_6A = ['worker-prelude', 'worker-args', 'worker-namespace', 'step0-preconditions', 'step1-snapshot', 'step6a-phase-entry'];
      function record(label, seq, env) {
        const repo = mkRepo(label, SPEC());
        const rec = path.join(repo.dir, 'gate-argv-recorder.js');
        fs.writeFileSync(rec, REC_SRC);
        const log = path.join(repo.dir, 'argv.log');
        const r = runOps(repo, CP, seq, Object.assign({ QA_GATE: fwd(rec), QA_ARGV_LOG: fwd(log) }, env));
        let calls = []; try { calls = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { /* none recorded */ }
        return { repo, r, calls };
      }
      const cdOf = (calls, flag) => { const c = calls.find((a) => a.indexOf(flag) !== -1); if (!c) return null; const i = c.indexOf('--claim-dir'); return i === -1 ? '(ABSENT)' : c[i + 1]; };

      const a1 = record('r10arc', CLAIM_1B, { ARC: 'ARC-A' });
      const l1 = record('r10leg', CLAIM_1B, { ARC: '' });
      check('EP-R10 --arc ARC-A: the real step-1b block passes --claim-dir arc-claims/ARC-A/TASK-10 to the ladder' + tail(a1.r),
        done(a1.r) && cdOf(a1.calls, '--ladder') === 'arc-claims/ARC-A/TASK-10');
      check('EP-R10 no --arc: the same real step-1b block passes --claim-dir claims/TASK-10' + tail(l1.r),
        done(l1.r) && cdOf(l1.calls, '--ladder') === 'claims/TASK-10');
      check('EP-R10 the recorded ladder argv is the REAL committed call (--plan, --task TASK-10, --ladder all present)',
        (() => { const c = a1.calls.find((x) => x.indexOf('--ladder') !== -1) || [];
          return c.indexOf('--plan') !== -1 && c.indexOf('--task') !== -1 && c[c.indexOf('--task') + 1] === 'TASK-10'; })());
      // displayed == real: the recorded claim-dir is byte-identical to the directory the SAME run created
      const madeArc = fs.existsSync(path.join(a1.repo.arcClaims, 'ARC-A', 'TASK-10', 'claim.json')) ? 'arc-claims/ARC-A/TASK-10' : null;
      const madeLeg = fs.existsSync(path.join(l1.repo.claims, 'TASK-10', 'claim.json')) ? 'claims/TASK-10' : null;
      check('EP-R10 --arc ARC-A: the passed claim-dir is byte-identical to the claim directory this run actually created',
        madeArc !== null && cdOf(a1.calls, '--ladder') === madeArc, 'passed=' + cdOf(a1.calls, '--ladder') + ' created=' + madeArc);
      check('EP-R10 no --arc: the passed claim-dir is byte-identical to the claim directory this run actually created',
        madeLeg !== null && cdOf(l1.calls, '--ladder') === madeLeg, 'passed=' + cdOf(l1.calls, '--ladder') + ' created=' + madeLeg);
      check('EP-R10 the two namespaces never collapse: ARC != legacy, ARC starts arc-claims/, legacy starts claims/, neither inferred from the other',
        cdOf(a1.calls, '--ladder') !== cdOf(l1.calls, '--ladder') && /^arc-claims\//.test(cdOf(a1.calls, '--ladder') || '') && /^claims\//.test(cdOf(l1.calls, '--ladder') || '') && !/^arc-claims\//.test(cdOf(l1.calls, '--ladder') || ''));
      check('EP-R10 neither run fell through to the renderer legacy default by omission (--claim-dir present in both)',
        cdOf(a1.calls, '--ladder') !== '(ABSENT)' && cdOf(l1.calls, '--ladder') !== '(ABSENT)');

      // second executable call site: step 6a resolves the worktree from the ladder, then enters the phase
      const a2 = record('r10arc6a', PHASE_6A, { ARC: 'ARC-A', TASK_ID: 'TASK-10', PHASE: 'BUILD', LAST_ACK: 'UNKNOWN' });
      const l2 = record('r10leg6a', PHASE_6A, { ARC: '', TASK_ID: 'TASK-10', PHASE: 'BUILD', LAST_ACK: 'UNKNOWN' });
      check('EP-R10 step 6a --arc ARC-A: the block RAN TO COMPLETION and the ladder AND --phase entry both carry arc-claims/ARC-A/TASK-10' + tail(a2.r),
        done(a2.r) && cdOf(a2.calls, '--ladder') === 'arc-claims/ARC-A/TASK-10' && cdOf(a2.calls, '--phase') === 'arc-claims/ARC-A/TASK-10');
      check('EP-R10 step 6a no --arc: the block RAN TO COMPLETION and the ladder AND --phase entry both carry claims/TASK-10' + tail(l2.r),
        done(l2.r) && cdOf(l2.calls, '--ladder') === 'claims/TASK-10' && cdOf(l2.calls, '--phase') === 'claims/TASK-10');
      check('EP-R10 step 6a: both runs completed and the ladder agrees with the phase entry within each run - one namespace per invocation, never two',
        done(a2.r) && done(l2.r) && cdOf(a2.calls, '--ladder') === cdOf(a2.calls, '--phase') && cdOf(l2.calls, '--ladder') === cdOf(l2.calls, '--phase') && cdOf(a2.calls, '--phase') !== cdOf(l2.calls, '--phase'));
    }

    // ══ EP-R9 · /arc-authorize resolves exactly one namespace from the literal ══════════════
    section('EP-R9 authorize namespace selector (frozen contract section 1, executed)');
    const authText = exists(REL.docs.authorizeSkill) ? stripCR(readText(REL.docs.authorizeSkill)) : '';
    const AU = extractOps(authText);
    check('EP-R9 arc-authorize/SKILL.md carries the tagged authorize-namespace block', !!AU.ops['authorize-namespace']);
    if (AU.ops['authorize-namespace']) {
      const a1 = mkRepo('authNs', ownerSpec());
      const authBefore = treeHash(a1.root);
      const runAuth = (env) => bash(['# ---- authorize-prelude', AU.ops['authorize-prelude'],
        '# ---- authorize-namespace', AU.ops['authorize-namespace'],
        'echo "::PTR::$PTR"', 'echo "::CLAIMS::$CLAIMS"', 'echo "::C::$C"', 'echo "::A::$A"', 'echo "::ADONE::"'].join('\n'),
      a1.dir, Object.assign({ TASK_ID: 'TASK-10', ARC: '' }, env));
      const mk = (out, n) => { const m = out.match(new RegExp('^::' + n + '::(.*)$', 'm')); return m ? m[1] : null; };
      const relOf = (v) => (v || '').replace(fwd(a1.root) + '/', '');
      const arcRun = runAuth({ ARC: 'ARC-A' });
      check('EP-R9 --arc ARC-A resolves the ARC pointer, the ARC claim root and both ARC record paths' + tail(arcRun),
        arcRun.status === 0 && relOf(mk(arcRun.stdout, 'PTR')) === 'plans/arcs/ARC-A/current.json' && relOf(mk(arcRun.stdout, 'CLAIMS')) === 'arc-claims/ARC-A' &&
        relOf(mk(arcRun.stdout, 'C')) === 'arc-claims/ARC-A/TASK-10/claim.json' && relOf(mk(arcRun.stdout, 'A')) === 'arc-claims/ARC-A/TASK-10/authorized.json');
      const legRun = runAuth({ ARC: '' });
      check('EP-R9 the no-flag invocation is legacy-only: claims/<TASK-ID>, and no resolved path names arc-claims/' + tail(legRun),
        legRun.status === 0 && relOf(mk(legRun.stdout, 'PTR')) === 'plans/current.json' && relOf(mk(legRun.stdout, 'C')) === 'claims/TASK-10/claim.json' &&
        relOf(mk(legRun.stdout, 'A')) === 'claims/TASK-10/authorized.json' && !/arc-claims/.test(legRun.stdout));
      const coreRun = runAuth({ ARC: 'CORE-STREAM' });
      check('EP-R9 --arc CORE-STREAM is REFUSED before any path is resolved (same ruling as the publisher P-V16)',
        coreRun.status === 1 && /REFUSED/.test(coreRun.out) && /CORE-STREAM/.test(coreRun.out) && !/::ADONE::/.test(coreRun.stdout));
      check('EP-R9 resolving a namespace wrote nothing: the whole runtime tree is byte-identical', treeHash(a1.root) === authBefore);
      check('EP-R9 the ARC and legacy resolutions share no claim path (the two grants are different identities)',
        mk(arcRun.stdout, 'C') !== mk(legRun.stdout, 'C') && mk(arcRun.stdout, 'A') !== mk(legRun.stdout, 'A'));
    }

    // ══ EP-R11 · A-V5 computes, binds and passes the SELECTED claim root (B6.1) ══════
    // Caller-side binding only. This proves what the committed authorize-ladder block PASSES; it
    // makes no claim that phase-gate.js validates or rejects arbitrary --claim-dir values.
    section('EP-R11 A-V5 computes, binds and passes the selected claim root (executed argv, B6.1)');
    if (AUTH_TAGS.every((t) => !!AUTH.ops[t])) {
      const AUTH_SEQ = ['authorize-prelude', 'authorize-namespace', 'authorize-ladder'];
      const AUTH_SPEC = () => ({
        snapshots: { 'arc-a-r1': { arcId: 'ARC-A' }, 'legacy-v3': {} },
        legacyPointer: 'legacy-v3', arcPointers: { 'ARC-A': 'arc-a-r1' }, arcContainers: ['ARC-A'],
        arcClaims: { 'ARC-A': { 'TASK-10': claimRec('TASK-10', 'WAITING_OWNER_GO', 'arc-a-r1', 'ARC-A') } },
        legacyClaims: { 'TASK-10': claimRec('TASK-10', 'WAITING_OWNER_GO', 'legacy-v3') }
      });
      // gateSrc === null -> the REAL committed phase-gate.js, resolved explicitly (never an unset var).
      function authRun(label, env, gateSrc) {
        const repo = mkRepo(label, AUTH_SPEC());
        const before = treeHash(repo.root);
        const log = path.join(repo.dir, 'argv.log');
        let gate = REAL_GATE;
        if (gateSrc !== null) { const stub = path.join(repo.dir, 'gate-stub.js'); fs.writeFileSync(stub, gateSrc); gate = fwd(stub); }
        const e = Object.assign({ TASK_ID: 'TASK-10', QA_ARGV_LOG: fwd(log), QA_GATE: gate }, env);
        const r = runOps(repo, AUTH, AUTH_SEQ, e);
        return { repo, r, calls: readArgvLog(log), gate, before, after: treeHash(repo.root) };
      }
      const aArc = authRun('r11arc', { ARC: 'ARC-A' }, GATE_REC_SRC);
      const aLeg = authRun('r11leg', { ARC: '' }, GATE_REC_SRC);
      check('EP-R11 --arc ARC-A: the real authorize-ladder block passes --claim-dir arc-claims/ARC-A/TASK-10' + tail(aArc.r),
        done(aArc.r) && claimDirOf(aArc.calls, '--ladder') === 'arc-claims/ARC-A/TASK-10');
      check('EP-R11 no --arc: the same real block passes --claim-dir claims/TASK-10' + tail(aLeg.r),
        done(aLeg.r) && claimDirOf(aLeg.calls, '--ladder') === 'claims/TASK-10');
      check('EP-R11 the recorded ladder argv is the REAL committed call (--plan, --task TASK-10, --ladder)',
        (() => { const c = aArc.calls.find((x) => x.indexOf('--ladder') !== -1) || [];
          return c.indexOf('--plan') !== -1 && c[c.indexOf('--task') + 1] === 'TASK-10'; })());
      check('EP-R11 --arc ARC-A: the passed claim-dir is byte-identical to the claim directory the fixture holds',
        fs.existsSync(path.join(aArc.repo.arcClaims, 'ARC-A', 'TASK-10', 'claim.json')) && claimDirOf(aArc.calls, '--ladder') === 'arc-claims/ARC-A/TASK-10');
      check('EP-R11 no --arc: the passed claim-dir is byte-identical to the claim directory the fixture holds',
        fs.existsSync(path.join(aLeg.repo.claims, 'TASK-10', 'claim.json')) && claimDirOf(aLeg.calls, '--ladder') === 'claims/TASK-10');
      check('EP-R11 the two namespaces never collapse: ARC starts arc-claims/, legacy starts claims/, neither inferred from the other',
        claimDirOf(aArc.calls, '--ladder') !== claimDirOf(aLeg.calls, '--ladder') && /^arc-claims\//.test(claimDirOf(aArc.calls, '--ladder') || '') &&
        /^claims\//.test(claimDirOf(aLeg.calls, '--ladder') || '') && !/^arc-claims\//.test(claimDirOf(aLeg.calls, '--ladder') || ''));
      check('EP-R11 neither run relied on the renderer legacy default: --claim-dir was passed explicitly in both (caller-side binding)',
        claimDirOf(aArc.calls, '--ladder') !== '(ABSENT)' && claimDirOf(aLeg.calls, '--ladder') !== '(ABSENT)' &&
        claimDirOf(aArc.calls, '--ladder') !== null && claimDirOf(aLeg.calls, '--ladder') !== null);
      const aCore = authRun('r11core', { ARC: 'CORE-STREAM' }, GATE_REC_SRC);
      check('EP-R11 --arc CORE-STREAM is REFUSED in authorize-namespace: the ladder is never invoked (zero recorded gate calls)',
        aCore.r.status === 1 && /REFUSED/.test(aCore.r.out) && aCore.calls.length === 0);
      const a4 = authRun('r11x4', { ARC: 'ARC-A' }, GATE_EXIT4_SRC);
      check('EP-R11 gate exit 4 => the block REFUSES A-V5 and exits 1; no ladder is pasted',
        a4.r.status === 1 && /A-V5 REFUSED/.test(a4.r.out) && !/::DONE::/.test(a4.r.stdout));
      const aNone = authRun('r11none', { ARC: '' }, null);   // REAL phase-gate.js, legacy snapshot
      check('EP-R11 a legacy snapshot (no executionProfiles) is exit 0 "profile none (legacy snapshot)" and is explicitly NOT a refusal - run against the REAL committed phase-gate.js' + tail(aNone.r),
        exists(REL.gate) && aNone.gate === REAL_GATE && done(aNone.r) &&
        /PHASE-GATE\s+task TASK-10/.test(aNone.r.stdout) &&
        /profile none \(legacy snapshot\)/.test(aNone.r.stdout) && !/A-V5 REFUSED/.test(aNone.r.out));
      check('EP-R11 A-V5 wrote nothing: every temp runtime tree is byte-identical before and after (step 6 is the first write)',
        [aArc, aLeg, aCore, a4, aNone].every((x) => x.after === x.before));
    }

    // ══ EP-R12 · the resume re-bind renders the SELECTED namespace (B6.1) ══════════
    section('EP-R12 the resume re-bind renders the selected namespace (previously untagged fence, B6.1)');
    if (CP.ops['step9b-resume-rebind']) {
      const REBIND_SEQ = RESUME_SEQ.concat(['step9b-resume-rebind']);
      // The resumed claim HOLDS CODE:index-html: step9-resume verifies the pair and leaves the holder
      // untouched, so "nothing released" is observable rather than vacuous. One namespace per fixture -
      // classes are global, so a single holder can only ever match one owner pair.
      const RSPEC = (arc) => ({
        snapshots: { 'arc-a-r1': { arcId: 'ARC-A' }, 'legacy-v3': {} },
        legacyPointer: 'legacy-v3', arcPointers: { 'ARC-A': 'arc-a-r1' }, arcContainers: ['ARC-A'],
        arcClaims: arc ? { 'ARC-A': { 'TASK-10': claimRec('TASK-10', 'CLAIMED', 'arc-a-r1', 'ARC-A', null, ['CODE:index-html']) } } : { 'ARC-A': {} },
        legacyClaims: arc ? {} : { 'TASK-10': claimRec('TASK-10', 'CLAIMED', 'legacy-v3', null, null, ['CODE:index-html']) },
        mutex: { 'CODE:index-html': holderRec('TASK-10', arc || null) }
      });
      const HOLDER = (repo) => path.join(repo.root, 'mutex', 'CODE__index-html', 'holder.json');
      function rebind(label, arc, gateSrc) {
        const repo = mkRepo(label, RSPEC(arc));
        const mutexDir = path.join(repo.root, 'mutex');
        const mutexBefore = treeHash(mutexDir);
        const holderBefore = fs.readFileSync(HOLDER(repo));
        const log = path.join(repo.dir, 'argv.log');
        const g = path.join(repo.dir, 'gate.js'); fs.writeFileSync(g, gateSrc);
        const r = runOps(repo, CP, REBIND_SEQ, { TASK_ID: 'TASK-10', RESUME: '1', ARC: arc || '', QA_GATE: fwd(g), QA_ARGV_LOG: fwd(log) });
        return { repo, r, calls: readArgvLog(log), mutexBefore, mutexAfter: treeHash(mutexDir), holderBefore,
          holderAfter: fs.existsSync(HOLDER(repo)) ? fs.readFileSync(HOLDER(repo)) : null };
      }
      const rArc = rebind('r12arc', 'ARC-A', GATE_REC_SRC);
      const rLeg = rebind('r12leg', '', GATE_REC_SRC);
      check('EP-R12 --arc ARC-A: the resume re-bind passes --claim-dir arc-claims/ARC-A/TASK-10' + tail(rArc.r),
        done(rArc.r) && claimDirOf(rArc.calls, '--ladder') === 'arc-claims/ARC-A/TASK-10');
      check('EP-R12 no --arc: the resume re-bind passes --claim-dir claims/TASK-10' + tail(rLeg.r),
        done(rLeg.r) && claimDirOf(rLeg.calls, '--ladder') === 'claims/TASK-10');
      check('EP-R12 each re-bind names the claim directory step9-resume actually resumed - one namespace per invocation, never two',
        claimDirOf(rArc.calls, '--ladder') !== claimDirOf(rLeg.calls, '--ladder') &&
        fs.existsSync(path.join(rArc.repo.arcClaims, 'ARC-A', 'TASK-10', 'claim.json')) &&
        fs.existsSync(path.join(rLeg.repo.claims, 'TASK-10', 'claim.json')));
      const rFail = rebind('r12fail', 'ARC-A', GATE_EXIT4_SRC);
      check('EP-R12 a failed re-bind on resume is BLOCKED at exit 0 (the documented divergence from step 1b IDLE) and releases nothing: the seeded holder (ARC-A, TASK-10) and the whole mutex tree survive byte-identical',
        ok(rFail.r) && /BLOCKED - profile binding failed on resume/.test(rFail.r.stdout) &&
        rFail.mutexAfter === rFail.mutexBefore && rFail.holderAfter !== null && rFail.holderAfter.equals(rFail.holderBefore));
    }

    // ══ EP-R7 · RETIRE POINTER ═════════════════════════════════════════════════════════════
    section('EP-R7 RETIRE renames the pointer; it is never the deletion mechanism');
    function retireRepo(label, arcClaims) {
      return mkRepo(label, {
        snapshots: { 'arc-a-r1': { arcId: 'ARC-A' }, 'legacy-v3': {} },
        legacyPointer: 'legacy-v3', arcPointers: { 'ARC-A': 'arc-a-r1' }, arcContainers: ['ARC-A'],
        arcClaims: arcClaims ? { 'ARC-A': arcClaims } : undefined
      });
    }
    const t1 = retireRepo('retire1', { 'TASK-10': claimRec('TASK-10', 'COMPLETE', 'arc-a-r1', 'ARC-A'), 'TASK-20': claimRec('TASK-20', 'ABANDONED', 'arc-a-r1', 'ARC-A') });
    const ptrBytes = fs.readFileSync(path.join(t1.plans, 'arcs', 'ARC-A', 'current.json'));
    const snapBefore = treeHash(path.join(t1.plans, 'arc-a-r1'));
    const claimsBefore = treeHash(path.join(t1.arcClaims, 'ARC-A'));
    const ret = runOwner(t1, ['owner-prelude', 'owner-selector', 'owner-retire'], { SEL: 'arc', ARC: 'ARC-A' });
    check('EP-R7 RETIRE with only retained COMPLETE / ABANDONED claims succeeds' + tail(ret), done(ret));
    check('EP-R7 plans/arcs/ARC-A/current.json is GONE and retired-arc-a-r1.json carries the identical bytes (a rename, never a delete)',
      !fs.existsSync(path.join(t1.plans, 'arcs', 'ARC-A', 'current.json')) &&
      fs.existsSync(path.join(t1.plans, 'arcs', 'ARC-A', 'retired-arc-a-r1.json')) &&
      fs.readFileSync(path.join(t1.plans, 'arcs', 'ARC-A', 'retired-arc-a-r1.json')).equals(ptrBytes));
    check('EP-R7 the snapshot and every retained claim survive RETIRE byte-identical', treeHash(path.join(t1.plans, 'arc-a-r1')) === snapBefore && treeHash(path.join(t1.arcClaims, 'ARC-A')) === claimsBefore);
    const afterRetire = runWorker(t1, CLAIM_SEQ, { ARC: 'ARC-A' });
    check('EP-R7 a worker selecting the retired ARC afterwards reports arc-retired (not arc-not-published)' + tail(afterRetire), ok(afterRetire) && /arc-retired/.test(afterRetire.stdout));
    for (const st of ['CLAIMED', 'WAITING_OWNER_GO', 'AUTHORIZED', 'BLOCKED']) {
      const tx = retireRepo('retire-' + st, { 'TASK-10': claimRec('TASK-10', st, 'arc-a-r1', 'ARC-A') });
      const before = treeHash(path.join(tx.plans, 'arcs', 'ARC-A'));
      const r = runOwner(tx, ['owner-prelude', 'owner-selector', 'owner-retire'], { SEL: 'arc', ARC: 'ARC-A' });
      check('EP-R7 RETIRE refuses while a ' + st + ' claim lives in the ARC namespace; the pointer is byte-identical afterwards',
        r.status === 1 && /REFUSED/.test(r.out) && /TASK-10/.test(r.out) && treeHash(path.join(tx.plans, 'arcs', 'ARC-A')) === before);
    }
    const tInc = retireRepo('retire-inc', { 'TASK-10': 'EMPTY-DIR' });
    const incBefore = treeHash(path.join(tInc.plans, 'arcs', 'ARC-A'));
    const rInc = runOwner(tInc, ['owner-prelude', 'owner-selector', 'owner-retire'], { SEL: 'arc', ARC: 'ARC-A' });
    check('EP-R7 RETIRE refuses on an INCOMPLETE-CLAIM residue directory (state unreadable ⇒ fail closed); pointer unchanged',
      rInc.status === 1 && /REFUSED/.test(rInc.out) && treeHash(path.join(tInc.plans, 'arcs', 'ARC-A')) === incBefore);
    const tLeg = retireRepo('retire-legacy', null);
    const legPtrBefore = fs.readFileSync(path.join(tLeg.plans, 'current.json'));
    const rLeg = runOwner(tLeg, ['owner-prelude', 'owner-selector', 'owner-retire'], { SEL: 'legacy', ARC: '' });
    check('EP-R7 RETIRE under --legacy is REFUSED (legacy RETIRE is not part of this contract); plans/current.json byte-identical',
      rLeg.status === 1 && /REFUSED/.test(rLeg.out) && fs.readFileSync(path.join(tLeg.plans, 'current.json')).equals(legPtrBefore));
    const tTwice = retireRepo('retire-twice', null);
    runOwner(tTwice, ['owner-prelude', 'owner-selector', 'owner-retire'], { SEL: 'arc', ARC: 'ARC-A' });
    const rTwice = runOwner(tTwice, ['owner-prelude', 'owner-selector', 'owner-retire'], { SEL: 'arc', ARC: 'ARC-A' });
    check('EP-R7 a second RETIRE of the same ARC is REFUSED (no current pointer) and never touches the retired file',
      rTwice.status === 1 && /REFUSED/.test(rTwice.out) && fs.existsSync(path.join(tTwice.plans, 'arcs', 'ARC-A', 'retired-arc-a-r1.json')));
    check('EP-R7 no tagged owner block ever deletes a pointer: no `rm` line in owner-ops.md targets current.json',
      !/^[^#\n]*\brm\b[^\n]*current\.json/m.test(ownerText) && /\bmv\b[^\n]*retired-/.test(ownerText));
  }

  // ══ docs — behaviour-anchored surface checks ═══════════════════════════════
  section('docs: worker / authorize / owner-ops B6 surface');
  const rc = exists(REL.docs.runtimeContract) ? stripCR(readText(REL.docs.runtimeContract)) : '';
  const ws = exists(REL.docs.workerSkill) ? stripCR(readText(REL.docs.workerSkill)) : '';
  const wr = exists(REL.docs.workerReport) ? stripCR(readText(REL.docs.workerReport)) : '';
  const as = exists(REL.docs.authorizeSkill) ? stripCR(readText(REL.docs.authorizeSkill)) : '';
  const ar = exists(REL.docs.authorizeReport) ? stripCR(readText(REL.docs.authorizeReport)) : '';
  const ROWS = ['arc-not-published', 'arc-retired', 'pointer-arc-mismatch', 'claim-arc-mismatch', 'arc-claims-container-missing', 'plan-not-current-for-arc'];
  check('docs runtime-contract.md section 7 carries every new fail-closed row (' + ROWS.filter((r) => !new RegExp(r).test(rc)).join(', ') + ')', ROWS.every((r) => new RegExp(r).test(rc)));
  check('docs runtime-contract.md records the wrong-`--arc` resume as a STOPPED outcome that writes nothing, and the holder-pair mismatch as BLOCKED + retained',
    /wrong[- ]`?--arc`? resume|wrong-ARC resume/i.test(rc) && /STOPPED/.test(rc) && /holder/i.test(rc) && /retain/i.test(rc));
  check('docs arc-worker/SKILL.md invocation carries --arc <ARC-ID> and keeps --resume', /--arc <ARC-ID>/.test(ws) && /--resume <TASK-ID>/.test(ws));
  check('docs arc-worker/SKILL.md write allowlist keeps BOTH legacy shapes verbatim and adds the two ARC shapes',
    /<ROOT>\/claims\/<own TASK-ID>\/claim\.json/.test(ws) && /<ROOT>\/mutex\/<own declared class>\/holder\.json/.test(ws) && /<ROOT>\/arc-claims\/<ARC-ID>\/<own TASK-ID>\/claim\.json/.test(ws));
  check('docs arc-worker/SKILL.md keeps the claim-root-agnostic phrase B2 introduced', /claim directory per `runtime-contract\.md` (section|§) ?2/.test(ws));
  check('docs arc-worker/SKILL.md names W-V13 and W-V14 and the release pair rule', /W-V13/.test(ws) && /W-V14/.test(ws) && /\(arcId \?\? null, taskId\)|arcId \?\? null/.test(ws));
  check('docs worker-report.md claim root line covers both namespaces', /claims\/<TASK-ID>/.test(wr) && /arc-claims\/<ARC-ID>\/<TASK-ID>/.test(wr));
  check('docs arc-authorize/SKILL.md carries --arc, the ARC claim path and A-V6', /--arc <ARC-ID>/.test(as) && /arc-claims\/<ARC-ID>/.test(as) && /A-V6/.test(as));
  check('docs arc-authorize/SKILL.md states the no-flag invocation is legacy-only and never searches arc-claims/', /never (searches|reads)[^\n]*arc-claims/i.test(as));
  check('docs authorize-report.md prints the claim root / namespace of the grant', /arc-claims\/<ARC-ID>/.test(ar));
  check('docs owner-ops.md carries the RETIRE POINTER section and the selector contract', /RETIRE/.test(ownerText) && /--legacy/.test(ownerText) && /--arc <ARC-ID>/.test(ownerText));
  check('docs owner-ops.md section 8 residue table covers arc-claims/', /arc-claims\//.test(ownerText));
  check('docs A-V5 / phase-gate ladder wording from B2 is intact in arc-authorize/SKILL.md', /A-V5/.test(as) && /phase-gate\.js/.test(as) && /--ladder/.test(as));

  // ══ wiring + scope ════════════════════════════════════════════════════════
  section('wiring + scope');
  check('wiring run-offline.js registers qa/arc_runtime_ops_offline.js after qa/arc_multi_arc_offline.js', (() => {
    const t = readText(REL.docs.runner);
    return /'qa\/arc_runtime_ops_offline\.js'/.test(t) && t.indexOf("'qa/arc_multi_arc_offline.js'") < t.indexOf("'qa/arc_runtime_ops_offline.js'");
  })());
  check('scope phase-gate.js needed no B6/B6.1 change: it accepts --claim-dir and flags legacyNamespace; the <namespace>/.../<TASK-ID> shape check lives in resolveScope, so it runs on the --scope / --phase paths and NOT on --ladder (source-presence check only; --ladder validation is a deferred B6.2 candidate)',
    exists(REL.gate) && /--claim-dir/.test(readText(REL.gate)) && /legacyNamespace/.test(readText(REL.gate)) && /claim-dir must end with/.test(readText(REL.gate)));
  for (const f of REL.forbidden) {
    const head = gitShow(f);
    check('scope unchanged vs HEAD: ' + f, head !== null && exists(f) && sha256(stripCR(readText(f))) === sha256(head));
  }
  const ih = gitShow('index.html');
  check('scope unchanged vs HEAD: index.html', ih !== null && sha256(stripCR(readText('index.html'))) === sha256(ih));
  if (LIVE_BEFORE !== null) {
    check('live runtime tree untouched by this suite (no claim, holder, pointer or container written outside os.tmpdir())', treeHash(LIVE_RUNTIME) === LIVE_BEFORE);
    check('live runtime arc-claims/ and plans/arcs/ presence unchanged by this suite (B6 performs zero runtime writes)',
      fs.existsSync(path.join(LIVE_RUNTIME, 'arc-claims')) === LIVE_HAD_ARC_CLAIMS && fs.existsSync(path.join(LIVE_RUNTIME, 'plans', 'arcs')) === LIVE_HAD_ARC_PLANS);
  }
} finally {
  cleanup();
}

console.log('\n' + (failed === 0 ? 'ARC RUNTIME OPS (P-E, B6): PASS (' + total + ' asserts)' : 'ARC RUNTIME OPS (P-E, B6): FAIL (' + failed + ' of ' + total + ' asserts failed)'));
assert.strictEqual(failed, 0, failures.slice(0, 12).join(' | '));
