'use strict';

/*
 * qa/arc_multi_arc_offline.js
 *
 * Multi-ARC V1 — Increment P-E publisher side (batch B5): executable contract for
 * `/arc-publish-plan --arc <ARC-ID>` (ULTRAPLAN r3 §1 T7a/T8/T17, §3 K9/K10, §4-B5, §5.1 H, §5.2,
 * §8, §16-B5; owner rulings D-24, D-25, D-31 and the B5 brief of 2026-08-22).
 * Pure Node, no network, no browser, NO live runtime write, NO live registry write. Reads only:
 *   - .claude/skills/arc-publish-plan/scripts/lib/profile-contract.js   (planCheck / runtimeChecks / registryChecks)
 *   - .claude/skills/arc-publish-plan/scripts/lib/runtime-identity.js   (B4 helper: the identity rules, never re-implemented)
 *   - .claude/skills/arc-publish-plan/scripts/resolve-profiles.js       (spawned; --arc)
 *   - .claude/skills/arc-publish-plan/references/publish-protocol.md    (the `# @op` bash blocks, EXTRACTED AND EXECUTED
 *                                                                        by Git Bash against temp git repos + temp runtime roots — D-31)
 *   - the committed schemas (shape checks on real output), the publisher docs (greps), the forbidden set (byte checks vs HEAD)
 *   - HEAD:resolve-profiles.js + HEAD:profile-contract.js via `git show` (legacy byte-compatibility oracle)
 * Every temp tree lives under os.tmpdir() and is removed in `finally`; the closing proofs assert the live runtime tree
 * hash, the 12 LEGACY_BYTE_SET hashes and the live registry are untouched.
 *
 * Determinism: library/CLI assertions pass a fixed `--now`; the executed protocol sequences use the real clock, so their
 * registry fixtures derive `promotion.rulingAt` from Date.now() (fresh = 1 h ago, stale = 10 days ago) — no pinned dates.
 * Git Bash is resolved from `git --exec-path`; absent ⇒ FAIL, never a silent substitute (D-31).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { authorizedProductWrite } = require('./lib/arc-scope-authorization.js');

const ROOT = path.resolve(__dirname, '..');
const SKILL_DIR = '.claude/skills/arc-publish-plan';
const SCHEMA_DIR = SKILL_DIR + '/references/schemas';
const REL = {
  lib: SKILL_DIR + '/scripts/lib/profile-contract.js',
  identity: SKILL_DIR + '/scripts/lib/runtime-identity.js',
  cli: SKILL_DIR + '/scripts/resolve-profiles.js',
  libDir: SKILL_DIR + '/references/execution-profiles',
  skillsRoot: '.claude/skills',
  runtime: '.git/arc-runtime',
  arcsLocal: '.ai-reports/arcs',
  schemas: { plan: SCHEMA_DIR + '/plan.schema.json', current: SCHEMA_DIR + '/current.schema.json', holder: SCHEMA_DIR + '/holder.schema.json', arc: SCHEMA_DIR + '/arc.schema.json' },
  docs: {
    skill: SKILL_DIR + '/SKILL.md',
    protocol: SKILL_DIR + '/references/publish-protocol.md',
    validation: SKILL_DIR + '/references/plan-validation.md',
    projection: SKILL_DIR + '/templates/plan-projection.md',
    report: SKILL_DIR + '/templates/publish-report.md',
    registrySkill: '.claude/skills/arc-registry/SKILL.md',
    runner: 'qa/run-offline.js'
  },
  // B5 never touches these (B4 / B3 / library surfaces); byte-identical to HEAD.
  // B6 (P-E execution side, 2026-08-22) owns arc-worker/SKILL.md, claim-protocol.md, runtime-contract.md,
  // worker-report.md, arc-authorize/SKILL.md, owner-ops.md and authorize-report.md; their HEAD-identity pins
  // were removed here mechanically (same pattern as R-B4-2 / the B5 narrowing). No assertion below is weakened:
  // execution-profile.md and phase-gate.js stay pinned because B6 proved it needed neither.
  forbidden: [
    '.claude/skills/arc-worker/references/execution-profile.md', '.claude/skills/arc-worker/scripts/phase-gate.js',
    SKILL_DIR + '/references/bootstrap.md', SKILL_DIR + '/scripts/lib/runtime-identity.js', SKILL_DIR + '/references/execution-profiles/README.md',
    SCHEMA_DIR + '/plan.schema.json', SCHEMA_DIR + '/current.schema.json', SCHEMA_DIR + '/claim.schema.json', SCHEMA_DIR + '/authorized.schema.json',
    SCHEMA_DIR + '/holder.schema.json', SCHEMA_DIR + '/arc.schema.json', SCHEMA_DIR + '/execution-profile.schema.json',
    SKILL_DIR + '/references/execution-profiles/COWORK-REGISTER.json', SKILL_DIR + '/references/execution-profiles/LAB-SANDBOX-STATIC.json',
    SKILL_DIR + '/references/execution-profiles/MAIN-BROWSER-QA.json', SKILL_DIR + '/references/execution-profiles/MAIN-CODE-SLICE-BOUNDED.json',
    SKILL_DIR + '/references/execution-profiles/MAIN-CODE-SLICE.json', SKILL_DIR + '/references/execution-profiles/MAIN-GATED-LIVE-QA.json',
    SKILL_DIR + '/references/execution-profiles/OWNER-MANUAL.json',
    '.claude/skills/arc-registry/references/registry-contract.md', '.claude/skills/arc-registry/templates/status-report.md',
    '.claude/skills/arc-progress-auditor/SKILL.md', '.claude/skills/arc-progress-auditor/templates/arc-audit.md',
    'netlify.toml'
  ]
};
const abs = (p) => path.join(ROOT, p);
const exists = (p) => fs.existsSync(abs(p));
const readText = (p) => fs.readFileSync(abs(p), 'utf8');
const stripCR = (s) => String(s).replace(/\r/g, '');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const clone = (o) => JSON.parse(JSON.stringify(o));
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const fwd = (p) => String(p).replace(/\\/g, '/');
const rdJson = (f) => JSON.parse(stripCR(fs.readFileSync(f, 'utf8')));
const wrJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n'); };
const isoOf = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

// ── harness ──────────────────────────────────────────────────────────────────
let total = 0, failed = 0;
const failures = [];
function check(name, cond) { total += 1; if (!cond) { failed += 1; failures.push(name); console.log('  FAIL  ' + name); } }
function section(title) { console.log('== ' + title + ' =='); }
const tempDirs = [];
function tmp(label) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-e-' + label + '-')); tempDirs.push(d); return d; }
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
// quotes cannot survive Windows command-line re-quoting through `bash -c <script>` (spawnSync argv rules).
function bash(script, cwd, env, file) {
  const f = file || path.join(cwd, 'qa-seq-' + (++bash.n) + '.sh');
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
    if (!schema.$ref.startsWith('#/')) return out;                       // external refs (execution-profile.schema.json) are out of scope here
    let node = root; for (const seg of schema.$ref.slice(2).split('/')) node = node && node[seg];
    if (!node) { out.push(at + ': unresolved $ref ' + schema.$ref); return out; }
    return validate(node, value, root, at, out);
  }
  if ('type' in schema) { const types = Array.isArray(schema.type) ? schema.type : [schema.type]; const t = typeOf(value); if (!(types.includes(t) || (t === 'integer' && types.includes('number')))) { out.push(at + ': type ' + t + ' not in ' + types.join('|')); return out; } }
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) out.push(at + ': not const');
  if ('enum' in schema && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) out.push(at + ': not in enum');
  if ('not' in schema && validate(schema.not, value, root, at, []).length === 0) out.push(at + ': matches forbidden schema (not)');
  if ('anyOf' in schema && !schema.anyOf.some((s) => validate(s, value, root, at, []).length === 0)) out.push(at + ': matches none of anyOf');
  if ('oneOf' in schema && schema.oneOf.filter((s) => validate(s, value, root, at, []).length === 0).length !== 1) out.push(at + ': oneOf must match exactly one');
  if ('allOf' in schema) schema.allOf.forEach((s) => validate(s, value, root, at, out));
  if ('if' in schema) { const pass = validate(schema.if, value, root, at, []).length === 0; if (pass && 'then' in schema) validate(schema.then, value, root, at, out); if (!pass && 'else' in schema) validate(schema.else, value, root, at, out); }
  if (typeof value === 'string') { if ('pattern' in schema && !new RegExp(schema.pattern).test(value)) out.push(at + ': pattern'); if ('maxLength' in schema && value.length > schema.maxLength) out.push(at + ': maxLength'); if ('minLength' in schema && value.length < schema.minLength) out.push(at + ': minLength'); }
  if (typeof value === 'number' && 'minimum' in schema && value < schema.minimum) out.push(at + ': minimum');
  if (Array.isArray(value)) { if ('minItems' in schema && value.length < schema.minItems) out.push(at + ': minItems'); if (schema.uniqueItems === true && new Set(value.map((x) => JSON.stringify(x))).size !== value.length) out.push(at + ': uniqueItems'); if ('items' in schema) value.forEach((v, i) => validate(schema.items, v, root, at + '[' + i + ']', out)); }
  if (isObj(value)) {
    const props = schema.properties || {};
    (schema.required || []).forEach((k) => { if (!(k in value)) out.push(at + ': missing ' + k); });
    for (const k of Object.keys(value)) { if (k in props) validate(props[k], value[k], root, at + '.' + k, out); else if (schema.additionalProperties === false) out.push(at + ': additional property ' + k); else if (isObj(schema.additionalProperties)) validate(schema.additionalProperties, value[k], root, at + '.' + k, out); }
  }
  return out;
}
const SCHEMAS = {};
for (const k of Object.keys(REL.schemas)) { try { SCHEMAS[k] = rdJson(abs(REL.schemas[k])); } catch (e) { SCHEMAS[k] = null; } }
const schemaOk = (k, v) => !!SCHEMAS[k] && validate(SCHEMAS[k], v, SCHEMAS[k]).length === 0;
const schemaViol = (k, v) => (SCHEMAS[k] ? validate(SCHEMAS[k], v, SCHEMAS[k]) : ['schema absent']);

// ── fs spy: which paths a library call touches (namespace-isolation proofs) ──────────────────
function spyFs(fn) {
  const names = ['readFileSync', 'existsSync', 'readdirSync', 'statSync', 'lstatSync', 'openSync', 'accessSync'];
  const orig = {}; const seen = [];
  for (const n of names) { orig[n] = fs[n]; fs[n] = function (p) { if (typeof p === 'string') seen.push(fwd(p)); return orig[n].apply(fs, arguments); }; }
  try { return { result: fn(), seen }; } finally { for (const n of names) fs[n] = orig[n]; }
}

// ── fixtures ─────────────────────────────────────────────────────────────────
const MUTEX_REGISTRY = ['AUTHORITY:published-plan', 'CODE:index-html', 'CODE:netlify-functions', 'DEPLOY:netlify', 'EXTERNAL:live-provider', 'QA:browser-runtime', 'RUNTIME:gates', 'RUNTIME:owner-profile'];
const HEX40 = 'de6ca529056ab778693f6307e921976c0c96c922';
const NOW = '2026-08-22T12:00:00Z';                         // fixed clock for library / CLI assertions
const NOW_MS = Date.now();                                  // real clock for the executed protocol (step 7 uses `date -u`)
const ART = (slug) => '.ai-reports/handoffs/2026-08-22_' + slug + '.COWORK.md';
const SRC_REL = ART('arc-a-plan-r1');
const ARC_ROWS = [
  { id: 'LX-2', priority: 10, lane: 'LAB', entryMode: 'DIRECT', requiresOwnerGo: false, mutexes: [], dependsOn: [], executionProfile: 'LAB-SANDBOX-STATIC',
    closeCondition: 'A fixture-only harness under the test-lab worktree re-derives libraryHash for every profile embedded in the ARC-A snapshot from the embedded bytes alone, proves each equals the embedded value, and a .LAB.md handoff recording the counts is registered.',
    stopCondition: 'Stop immediately on any containment breach, on any need for a live provider call, a Netlify deploy, or a gate change, or on any read or write of pt_ data.' },
  { id: 'MAIN-CLOSEOUT', priority: 20, lane: 'MAIN', entryMode: 'PLAN', requiresOwnerGo: true, mutexes: ['CODE:index-html'], dependsOn: ['LX-2'], executionProfile: 'MAIN-CODE-SLICE',
    closeCondition: 'A .MAIN.md closeout handoff is registered recording both tasks PHASES tables, the pointer path and the two claim paths under arc-claims/ARC-A/ together with the before and after hashes of the legacy runtime files.',
    stopCondition: 'Stop immediately if any index.html byte changes, on any pt_ mutation, or if two consecutive attempts at the same step fail.' },
  { id: 'TASK-10', priority: 30, lane: 'LAB', entryMode: 'DIRECT', requiresOwnerGo: false, mutexes: [], dependsOn: [], executionProfile: 'LAB-SANDBOX-STATIC',
    closeCondition: 'The duplicate-id coexistence probe is complete in the test-lab worktree as a static analysis and a .LAB.md handoff recording the result is registered.',
    stopCondition: 'Stop immediately on any containment breach, on any need for a live provider call, or on any read or write of pt_ data.' }
];
function sourceMarkdown(rows, title) {
  const head = '# HANDOFF — ' + (title || 'fixture arc plan') + '\n- From: COWORK  As-of: 2026-08-22\n- Arc: ARC-A\n\n## 2. Task table\n\n';
  const cols = '| taskId | priority | lane | entryMode | requiresOwnerGo | mutexes | dependsOn | executionProfile | closeCondition | stopCondition |\n|---|---|---|---|---|---|---|---|---|---|\n';
  const body = rows.map((r) => '| `' + r.id + '` | ' + r.priority + ' | ' + r.lane + ' | ' + r.entryMode + ' | ' + r.requiresOwnerGo + ' | ' + (r.mutexes.length ? r.mutexes.map((m) => '`' + m + '`').join(' · ') : '∅') + ' | ' + (r.dependsOn.length ? r.dependsOn.join(', ') : '—') + ' | `' + r.executionProfile + '` | ' + r.closeCondition + ' | ' + r.stopCondition + ' |').join('\n') + '\n';
  return head + cols + body + '\n## 3. Notes\n\nProfiles are referenced by id only; the publisher resolves them; the arc identity comes from the typed --arc literal, never from the header above.\n';
}
const SOURCE_A = sourceMarkdown(ARC_ROWS, 'ARC-A plan r1');
const SOURCE_A_HASH = sha256(Buffer.from(SOURCE_A, 'utf8'));
function mkPlan(o) {
  o = o || {};
  const plan = { planId: o.planId || 'arc-a-r1', source: o.source || SRC_REL, sourceHash: o.sourceHash || SOURCE_A_HASH, repoRef: o.repoRef || HEX40, generatedAt: '2026-08-22T00:00:00Z', mutexRegistry: MUTEX_REGISTRY.slice(), tasks: clone(o.rows || ARC_ROWS) };
  if (o.arcId !== undefined) plan.arcId = o.arcId;
  if (o.mut) o.mut(plan);
  return plan;
}
// registry entries (arc.schema.json shapes)
const AUTH = { kind: 'ratified-contract', artifact: ART('arc-a-contract'), ratifiedAt: '2026-08-20' };
const hist = (...states) => states.map((s, i) => ({ state: s, at: '2026-08-' + String(10 + i).padStart(2, '0') + 'T10:00:00Z', by: i === 0 ? 'owner' : (s === 'EXECUTING' ? 'publisher' : 'owner') }));
function mkEntry(id, o) {
  o = o || {};
  const srcHash = o.sourceHash || SOURCE_A_HASH;
  const src = o.source || SRC_REL;
  const rulingAt = o.rulingAt || '2026-08-21T10:00:00Z';
  const e = {
    arcId: id, title: 'Fixture arc ' + id, state: 'READY', owner: 'owner', planningLane: 'COWORK', implementationAllowed: true, authority: AUTH, dependencies: o.dependencies || [],
    planning: { currentRevision: 1, revisions: [{ rev: 1, source: src, sourceHash: srcHash, status: 'PROMOTED', reviews: [{ artifact: ART('arc-a-plan-r1-review'), reviewer: 'CODEX', verdict: 'PASS', at: '2026-08-21' }] }], lease: null },
    promotion: { rev: 1, sourceHash: srcHash, rulingAt, rulingBy: 'owner', note: 'slice 1', waivers: [] }, execution: null,
    history: hist('IDEA', 'PLANNING', 'REVIEWED', 'READY')
  };
  return Object.assign(e, o.over || {});
}
const ideaEntry = (id) => ({ arcId: id, title: 'Fixture arc ' + id, state: 'IDEA', owner: 'owner', planningLane: 'COWORK', implementationAllowed: false, authority: null, dependencies: [], planning: { currentRevision: 0, revisions: [], lease: null }, promotion: null, execution: null, history: hist('IDEA') });
const closedEntry = (id) => Object.assign(mkEntry(id), { state: 'CLOSED', implementationAllowed: false, execution: { planId: id.toLowerCase() + '-r1', planHash: 'a'.repeat(64), pointer: 'plans/arcs/' + id + '/current.json', claimsRoot: 'arc-claims/' + id + '/', publishedAt: '2026-08-15T10:00:00Z' }, history: hist('IDEA', 'PLANNING', 'REVIEWED', 'READY', 'EXECUTING', 'CLOSED') });
const executingEntry = (id, planId) => Object.assign(mkEntry(id), { state: 'EXECUTING', execution: { planId: planId || 'arc-a-r1', planHash: 'a'.repeat(64), pointer: 'plans/arcs/' + id + '/current.json', claimsRoot: 'arc-claims/' + id + '/', publishedAt: '2026-08-15T10:00:00Z' }, history: hist('IDEA', 'PLANNING', 'REVIEWED', 'READY', 'EXECUTING') });
// runtime records
const claimRec = (T, state, planId, arcId) => { const c = { taskId: T, lane: 'LAB', planId: planId || 'arc-a-r1', planHash: 'a'.repeat(64), conversationId: 'c', startedAt: '2026-08-15T10:00:00Z', mutexes: [], state: state || 'COMPLETE' }; if (arcId) c.arcId = arcId; return c; };
const curRec = (planId, arcId) => { const c = { planId, planHash: 'a'.repeat(64), source: SRC_REL, sourceHash: SOURCE_A_HASH, ref: HEX40, publishedAt: '2026-08-15T10:00:00Z', publishedBy: 'owner' }; if (arcId) c.arcId = arcId; return c; };
// temp registry + temp runtime builders
function mkRegistry(dir, entries) { for (const id of Object.keys(entries)) wrJson(path.join(dir, id, 'arc.json'), entries[id]); return dir; }
function mkRuntime(root, o) {
  o = o || {};
  for (const d of ['plans', 'claims', 'mutex']) fs.mkdirSync(path.join(root, d), { recursive: true });
  if (o.arcRoots !== false) { fs.mkdirSync(path.join(root, 'plans', 'arcs')); fs.mkdirSync(path.join(root, 'arc-claims')); }
  if (o.legacyPointer) wrJson(path.join(root, 'plans', 'current.json'), o.legacyPointer);
  for (const T of Object.keys(o.legacyClaims || {})) wrJson(path.join(root, 'claims', T, 'claim.json'), o.legacyClaims[T]);
  for (const ID of Object.keys(o.arcPointers || {})) wrJson(path.join(root, 'plans', 'arcs', ID, 'current.json'), o.arcPointers[ID]);
  for (const ID of Object.keys(o.arcClaims || {})) { fs.mkdirSync(path.join(root, 'arc-claims', ID), { recursive: true }); for (const T of Object.keys(o.arcClaims[ID])) { const v = o.arcClaims[ID][T]; if (v === 'EMPTY-DIR') fs.mkdirSync(path.join(root, 'arc-claims', ID, T)); else if (typeof v === 'string') { fs.mkdirSync(path.join(root, 'arc-claims', ID, T)); fs.writeFileSync(path.join(root, 'arc-claims', ID, T, 'claim.json'), v); } else wrJson(path.join(root, 'arc-claims', ID, T, 'claim.json'), v); } }
  for (const pid of Object.keys(o.plans || {})) { wrJson(path.join(root, 'plans', pid, 'plan.json'), o.plans[pid].plan); wrJson(path.join(root, 'plans', pid, 'manifest.json'), o.plans[pid].manifest); fs.writeFileSync(path.join(root, 'plans', pid, 'source.md'), '# src\n'); }
  return root;
}

// ── resolver runner ──────────────────────────────────────────────────────────
function runCli(args) {
  const r = spawnSync(process.execPath, [abs(REL.cli)].concat(args), { encoding: 'utf8', cwd: ROOT });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', out: (r.stdout || '') + (r.stderr || '') };
}
const hasLine = (text, re) => re.test(text);

console.log('ARC multi-arc publisher contract (P-E, B5) - fixtures + executed protocol blocks');
const liveRuntime = abs(REL.runtime);
const liveBefore = fs.existsSync(liveRuntime) ? treeHash(liveRuntime) : null;
const liveRegistry = abs(REL.arcsLocal);
const registryBefore = fs.existsSync(liveRegistry) ? treeHash(liveRegistry) : null;
const LEGACY_BYTE_SET = ['plans/current.json', 'plans/parallel-arc-v2-2026-08-15/manifest.json', 'plans/parallel-arc-v2-2026-08-15/plan.json', 'plans/parallel-arc-v2-2026-08-15/source.md', 'plans/parallel-arc-v3-2026-08-15/manifest.json', 'plans/parallel-arc-v3-2026-08-15/plan.json', 'plans/parallel-arc-v3-2026-08-15/source.md', 'claims/G1-CLOCK-SEAM/claim.json', 'claims/G1-CLOCK-SEAM/authorized.json', 'claims/LX-2/claim.json', 'claims/LX-3/claim.json', 'claims/LX-4/claim.json'];
const legacyHashesBefore = LEGACY_BYTE_SET.map((f) => (fs.existsSync(path.join(liveRuntime, f)) ? sha256(fs.readFileSync(path.join(liveRuntime, f))) : null));

let lib = null, ident = null;
try { lib = require(abs(REL.lib)); } catch (e) { console.log('  (profile-contract.js not loadable: ' + e.message.split('\n')[0] + ')'); }
try { ident = require(abs(REL.identity)); } catch (e) { console.log('  (runtime-identity.js not loadable: ' + e.message.split('\n')[0] + ')'); }
let library = null;
try { library = lib && lib.loadLibrary(abs(REL.libDir)); } catch (e) { library = null; }
const libReady = !!(lib && ident && library && library.errors.length === 0 && typeof lib.registryChecks === 'function');
const opts = (extra) => Object.assign({ library, skillsRoot: abs(REL.skillsRoot) }, extra || {});
const viol = (res, rule) => (res.violations || []).filter((v) => v.rule === rule);
const hasViol = (res, rule, re) => viol(res, rule).some((v) => !re || re.test(v.message));

try {
  // ── EP-E0 surfaces present ────────────────────────────────────────────────
  section('EP-E0 surfaces');
  check('EP-E0 Git Bash resolved from git --exec-path (' + (BASH || 'ABSENT - D-31: FAIL, never substitute') + ')', !!BASH);
  check('EP-E0 profile-contract.js loads; runtime-identity.js loads; library loads clean', !!lib && !!ident && !!library && library.errors.length === 0);
  check('EP-E0 lib exports registryChecks (P-V17 / P-V20) and keeps every B2 export (deriveLockouts, renderLadder, planCheck, runtimeChecks, resolveProfiles, libraryHash, withoutLibraryHash, validateProfile, MODES, RANK, MODE_ABBR, BOUNDARIES, KINDS, PROFILE_ID_RE)', !!lib && ['registryChecks', 'deriveLockouts', 'renderLadder', 'planCheck', 'runtimeChecks', 'resolveProfiles', 'libraryHash', 'withoutLibraryHash', 'validateProfile', 'stripCR', 'canonicalize'].every((f) => typeof lib[f] === 'function') && ['MODES', 'RANK', 'MODE_ABBR', 'BOUNDARIES', 'KINDS', 'PROFILE_ID_RE'].every((k) => k in lib));
  check('EP-E0 lib RESERVED_RUNTIME_ARC_IDS == [CORE-STREAM] (registry identity only, never a runtime --arc)', !!lib && JSON.stringify(lib.RESERVED_RUNTIME_ARC_IDS) === JSON.stringify(['CORE-STREAM']));
  check('EP-E0 lib RULE_ORDER carries P-V16, P-V17, P-V19, P-V20 after P-V15 and never P-V18 (retired, number reserved)', !!lib && Array.isArray(lib.RULE_ORDER) && ['P-V16', 'P-V17', 'P-V19', 'P-V20'].every((r) => lib.RULE_ORDER.indexOf(r) > lib.RULE_ORDER.indexOf('P-V15') && lib.RULE_ORDER.indexOf(r) < lib.RULE_ORDER.indexOf('P-V21')) && !lib.RULE_ORDER.includes('P-V18') && !!lib.RULE_LABEL && ['P-V16', 'P-V17', 'P-V19', 'P-V20'].every((r) => typeof lib.RULE_LABEL[r] === 'string'));
  check('EP-E0 profile-contract.js consumes runtime-identity.js (never re-implements the identity rules)', exists(REL.lib) && /require\('\.\/runtime-identity\.js'\)/.test(readText(REL.lib)) && !/ARC_ID_RE\s*=\s*\//.test(readText(REL.lib)));
  check('EP-E0 resolver usage names --arc, --registry-root, --acknowledge-stale-promotion and --now', exists(REL.cli) && ['--arc', '--registry-root', '--acknowledge-stale-promotion', '--now'].every((f) => readText(REL.cli).indexOf(f) !== -1));
  if (!libReady) console.log('  (B5 library surface absent - rule groups EP-E1..E8 (library/CLI) skipped; RED)');

  if (libReady) {
    // ── EP-E1 P-V16: arcId from the literal only ────────────────────────────
    section('EP-E1 P-V16 arcId from the --arc literal');
    const legacyOk = lib.planCheck(mkPlan(), opts());
    check('EP-E1 legacy plan (no arcId) without --arc ⇒ P-V16 PASS, ok', legacyOk.ok === true && legacyOk.rules['P-V16'] === 'PASS');
    check('EP-E1 plan carrying arcId without --arc ⇒ P-V16 REFUSED (arcId originates only from the literal)', hasViol(lib.planCheck(mkPlan({ arcId: 'ARC-A' }), opts()), 'P-V16', /--arc/));
    const arcOk = lib.planCheck(mkPlan({ arcId: 'ARC-A' }), opts({ arcId: 'ARC-A' }));
    check('EP-E1 --arc ARC-A with plan.arcId ARC-A ⇒ P-V16 PASS, ok (' + arcOk.violations.map((v) => v.message).join(' | ') + ')', arcOk.ok === true && arcOk.rules['P-V16'] === 'PASS');
    check('EP-E1 --arc ARC-A with plan.arcId absent ⇒ P-V16 PASS (the resolver declares it from the literal)', lib.planCheck(mkPlan(), opts({ arcId: 'ARC-A' })).rules['P-V16'] === 'PASS');
    check('EP-E1 --arc ARC-A with plan.arcId ARC-B ⇒ P-V16 REFUSED naming both', hasViol(lib.planCheck(mkPlan({ arcId: 'ARC-B' }), opts({ arcId: 'ARC-A' })), 'P-V16', /ARC-B[\s\S]*ARC-A|ARC-A[\s\S]*ARC-B/));
    check('EP-E1 --arc arc-a (case variant) ⇒ P-V16 REFUSED, never normalized', hasViol(lib.planCheck(mkPlan(), opts({ arcId: 'arc-a' })), 'P-V16', /arc-a/) && !lib.planCheck(mkPlan(), opts({ arcId: 'arc-a' })).violations.some((v) => /ARC-A/.test(v.value || '')));
    check('EP-E1 --arc Arc-A / "ARC A" / -ARC / 25-char ids ⇒ P-V16 REFUSED', ['Arc-A', 'ARC A', '-ARC', 'A'.repeat(25)].every((id) => hasViol(lib.planCheck(mkPlan(), opts({ arcId: id })), 'P-V16')));
    check('EP-E1 --arc CON / LPT1 (reserved device names) ⇒ P-V16 REFUSED', ['CON', 'LPT1'].every((id) => hasViol(lib.planCheck(mkPlan(), opts({ arcId: id })), 'P-V16')));
    check('EP-E1 --arc CORE-STREAM ⇒ P-V16 REFUSED (registry index entry, never a runtime arcId)', hasViol(lib.planCheck(mkPlan(), opts({ arcId: 'CORE-STREAM' })), 'P-V16', /CORE-STREAM/));
    check('EP-E1 plan.arcId malformed (lowercase) with the same --arc ⇒ P-V16 REFUSED', hasViol(lib.planCheck(mkPlan({ arcId: 'arc-a' }), opts({ arcId: 'arc-a' })), 'P-V16'));
    check('EP-E1 task ids unique within the plan only: a case-folded duplicate in one plan ⇒ P-V2 (unchanged); the same id in another plan / namespace is no concern of planCheck (P-V18 retired)', hasViol(lib.planCheck(mkPlan({ mut: (p) => { p.tasks.push(Object.assign(clone(p.tasks[0]), { id: 'lx-2' })); } }), opts({ arcId: 'ARC-A' })), 'P-V2') && lib.planCheck(mkPlan(), opts({ arcId: 'ARC-B' })).ok === true);
    check('EP-E1 P-V1 accepts arcId as an optional top-level field (no "unknown field arcId")', !lib.planCheck(mkPlan({ arcId: 'ARC-A' }), opts({ arcId: 'ARC-A' })).violations.some((v) => v.rule === 'P-V1' && /arcId/.test(v.message)));
    // resolution places arcId after executionProfiles, before tasks
    const rp = lib.resolveProfiles(mkPlan(), library, { arcId: 'ARC-A' });
    const keys = Object.keys(rp.plan);
    check('EP-E1 resolveProfiles(plan, library, {arcId}) embeds arcId right after executionProfiles and before tasks', rp.plan.arcId === 'ARC-A' && keys.indexOf('arcId') === keys.indexOf('executionProfiles') + 1 && keys.indexOf('tasks') === keys.indexOf('arcId') + 1);
    check('EP-E1 resolveProfiles without opts keeps the B1 signature and emits no arcId', !('arcId' in lib.resolveProfiles(mkPlan(), library).plan));
    check('EP-E1 resolved ARC output re-checks clean with allowEmbedded + arcId; refused under P-V16 without the literal', lib.planCheck(rp.plan, opts({ allowEmbedded: true, arcId: 'ARC-A' })).ok === true && hasViol(lib.planCheck(rp.plan, opts({ allowEmbedded: true })), 'P-V16'));
    check('EP-E1 resolved ARC plan validates against plan.schema.json (arcId optional, pattern)', schemaOk('plan', JSON.parse(JSON.stringify(rp.plan, (k, v) => (k === 'executionProfiles' ? undefined : v)))));

    // ── EP-E2 CLI --arc ──────────────────────────────────────────────────────
    section('EP-E2 resolver --arc');
    const io = tmp('io');
    const reg = mkRegistry(tmp('registry'), { 'ARC-A': mkEntry('ARC-A'), 'ARC-B': mkEntry('ARC-B') });
    const rt = mkRuntime(path.join(tmp('runtime'), 'arc-runtime'), { legacyPointer: curRec('legacy-plan'), legacyClaims: { 'LX-2': claimRec('LX-2', 'COMPLETE', 'legacy-plan') } });
    const srcFile = path.join(io, 'source.md'); fs.writeFileSync(srcFile, SOURCE_A);
    const inArc = path.join(io, 'proposed-arc.json'); fs.writeFileSync(inArc, JSON.stringify(mkPlan(), null, 2) + '\n');
    const base = ['--in', inArc, '--source', srcFile, '--runtime-root', rt, '--registry-root', reg, '--now', NOW];
    const o1 = path.join(io, 'arc-1.json'), o2 = path.join(io, 'arc-2.json');
    const a1 = runCli(base.concat(['--out', o1, '--arc', 'ARC-A']));
    const a2 = runCli(base.concat(['--out', o2, '--arc', 'ARC-A']));
    check('EP-E2 --arc ARC-A ⇒ exit 0' + (a1.status !== 0 ? ' - ' + a1.out.slice(0, 600) : ''), a1.status === 0);
    let resolvedArc = null;
    if (a1.status === 0 && a2.status === 0) {
      resolvedArc = rdJson(o1);
      check('EP-E2 two --arc runs ⇒ byte-identical output', fs.readFileSync(o1).equals(fs.readFileSync(o2)));
      check('EP-E2 output carries "arcId": "ARC-A" before tasks; tasks untouched', resolvedArc.arcId === 'ARC-A' && Object.keys(resolvedArc).indexOf('arcId') === Object.keys(resolvedArc).indexOf('tasks') - 1 && JSON.stringify(resolvedArc.tasks) === JSON.stringify(mkPlan().tasks));
      check('EP-E2 projectionHash == sha256(--out bytes)', (a1.stdout.match(/^projectionHash\s+([a-f0-9]{64})\s*$/m) || [])[1] === sha256(fs.readFileSync(o1)));
      check('EP-E2 stdout prints the ARC line (arc id, registry entry, pointer plans/arcs/ARC-A/current.json, claims root arc-claims/ARC-A/)', /^ARC\s+ARC-A\b/m.test(a1.stdout) && /plans\/arcs\/ARC-A\/current\.json/.test(a1.stdout) && /arc-claims\/ARC-A\//.test(a1.stdout));
      check('EP-E2 stdout VALIDATION lists P-V16, P-V17, P-V19, P-V20 PASS and no P-V18 line', ['16', '17', '19', '20'].every((n) => new RegExp('^P-V' + n + '\\b.*PASS\\s*$', 'm').test(a1.stdout)) && !/^P-V18\b/m.test(a1.stdout));
      check('EP-E2 stdout identical across the two runs except the --out path (no clock, no nondeterminism)', a1.stdout.replace(o1, '<OUT>').split('\\').join('/') === a2.stdout.replace(o2, '<OUT>').split('\\').join('/'));
    }
    check('EP-E2 --arc given without --runtime-root ⇒ exit 3 (P-V13/P-V19 need the runtime)', runCli(['--in', inArc, '--out', path.join(io, 'x1.json'), '--source', srcFile, '--registry-root', reg, '--arc', 'ARC-A']).status === 3);
    check('EP-E2 --arc given without --source ⇒ exit 3 (P-V17 pins the source bytes)', runCli(['--in', inArc, '--out', path.join(io, 'x2.json'), '--runtime-root', rt, '--registry-root', reg, '--arc', 'ARC-A']).status === 3);
    check('EP-E2 --arc arc-a ⇒ exit 2, P-V16 REFUSED, nothing written', (() => { const o = path.join(io, 'x3.json'); const r = runCli(base.concat(['--out', o, '--arc', 'arc-a'])); return r.status === 2 && /P-V16 REFUSED/.test(r.stdout) && !fs.existsSync(o); })());
    check('EP-E2 --arc CORE-STREAM ⇒ exit 2, P-V16 REFUSED', (() => { const r = runCli(base.concat(['--out', path.join(io, 'x4.json'), '--arc', 'CORE-STREAM'])); return r.status === 2 && /P-V16 REFUSED[^\n]*CORE-STREAM/.test(r.stdout); })());
    check('EP-E2 --arc ARC-A against a runtime root without plans/arcs + arc-claims ⇒ exit 3 (roots are owner bootstrap; never created here)', (() => { const r0 = mkRuntime(path.join(tmp('noroots'), 'arc-runtime'), { arcRoots: false }); const before = treeHash(r0); const r = runCli(['--in', inArc, '--out', path.join(io, 'x5.json'), '--source', srcFile, '--runtime-root', r0, '--registry-root', reg, '--arc', 'ARC-A', '--now', NOW]); return r.status === 3 && treeHash(r0) === before && !fs.existsSync(path.join(r0, 'arc-claims')); })());
    check('EP-E2 --arc ARC-A with --now not an ISO UTC instant ⇒ exit 3', runCli(base.slice(0, -2).concat(['--out', path.join(io, 'x6.json'), '--arc', 'ARC-A', '--now', 'yesterday'])).status === 3);
    check('EP-E2 runtime + registry trees unchanged by every --arc resolver run (read-only)', (() => { const h1 = treeHash(rt), h2 = treeHash(reg); runCli(base.concat(['--out', path.join(io, 'x7.json'), '--arc', 'ARC-A'])); return treeHash(rt) === h1 && treeHash(reg) === h2; })());
    check('EP-E2 proposed plan already carrying arcId ARC-A with --arc ARC-A ⇒ exit 0 (idempotent); ARC-B ⇒ exit 2 P-V16', (() => { const f1 = path.join(io, 'pa.json'); fs.writeFileSync(f1, JSON.stringify(mkPlan({ arcId: 'ARC-A' }))); const f2 = path.join(io, 'pb.json'); fs.writeFileSync(f2, JSON.stringify(mkPlan({ arcId: 'ARC-B' }))); const r1 = runCli(base.slice(2).concat(['--in', f1, '--out', path.join(io, 'pa-out.json'), '--arc', 'ARC-A'])); const r2 = runCli(base.slice(2).concat(['--in', f2, '--out', path.join(io, 'pb-out.json'), '--arc', 'ARC-A'])); return r1.status === 0 && r2.status === 2 && /P-V16 REFUSED/.test(r2.stdout); })());

    // ── EP-E2b legacy byte-compatibility: HEAD resolver vs working-tree resolver, no --arc ──
    section('EP-E2b legacy (no --arc) output byte-identical to the committed B1 resolver');
    const headDir = tmp('head');
    const headCli = gitShow(REL.cli), headLib = gitShow(REL.lib);
    if (headCli && headLib) {
      fs.mkdirSync(path.join(headDir, 'scripts', 'lib'), { recursive: true });
      fs.writeFileSync(path.join(headDir, 'scripts', 'resolve-profiles.js'), headCli);
      fs.writeFileSync(path.join(headDir, 'scripts', 'lib', 'profile-contract.js'), headLib);
      const headIdent = gitShow(REL.identity); if (headIdent) fs.writeFileSync(path.join(headDir, 'scripts', 'lib', 'runtime-identity.js'), headIdent);
      const legacyIn = path.join(io, 'legacy.json'); fs.writeFileSync(legacyIn, JSON.stringify(mkPlan({ planId: 'legacy-fixture-r1' }), null, 2) + '\n');
      const common = ['--in', legacyIn, '--library', abs(REL.libDir), '--skills-root', abs(REL.skillsRoot)];
      const hOut = path.join(io, 'head-out.json'), wOut = path.join(io, 'wt-out.json');
      const hr = spawnSync(process.execPath, [path.join(headDir, 'scripts', 'resolve-profiles.js')].concat(common, ['--out', hOut]), { encoding: 'utf8', cwd: ROOT });
      const wr = runCli(common.concat(['--out', wOut]));
      check('EP-E2b HEAD resolver exit 0 and working-tree resolver exit 0 on the same legacy input', hr.status === 0 && wr.status === 0);
      check('EP-E2b legacy --out bytes IDENTICAL (HEAD vs working tree) - no arcId, no behaviour change without the flag', hr.status === 0 && wr.status === 0 && fs.readFileSync(hOut).equals(fs.readFileSync(wOut)) && !('arcId' in rdJson(wOut)));
      const hOut2 = path.join(io, 'head-rt.json'), wOut2 = path.join(io, 'wt-rt.json');
      const hr2 = spawnSync(process.execPath, [path.join(headDir, 'scripts', 'resolve-profiles.js')].concat(common, ['--out', hOut2, '--runtime-root', rt]), { encoding: 'utf8', cwd: ROOT });
      const wr2 = runCli(common.concat(['--out', wOut2, '--runtime-root', rt]));
      check('EP-E2b with --runtime-root (legacy P-V11/P-V13): bytes identical; P-V11 and P-V13 PASS lines printed by both', hr2.status === 0 && wr2.status === 0 && fs.readFileSync(hOut2).equals(fs.readFileSync(wOut2)) && /^P-V13\b.*PASS/m.test(wr2.stdout) && /^P-V11\b.*PASS/m.test(wr2.stdout));
      check('EP-E2b legacy stdout: P-V16 PASS (arcId absent) and P-V17 / P-V19 / P-V20 marked N/A (no --arc), never REFUSED', /^P-V16\b.*PASS/m.test(wr2.stdout) && ['17', '19', '20'].every((n) => new RegExp('^P-V' + n + '\\b.*N/A', 'm').test(wr2.stdout)) && !/REFUSED/.test(wr2.stdout));
      check('EP-E2b legacy exit codes unchanged: refusal ⇒ 2, --out exists ⇒ 3, usage ⇒ 3', (() => { const bad = path.join(io, 'bad-legacy.json'); fs.writeFileSync(bad, JSON.stringify(mkPlan({ mut: (p) => { p.tasks[0].executionProfile = 'NOT-A-PROFILE'; } }))); return runCli(['--in', bad, '--out', path.join(io, 'bad-out.json')]).status === 2 && runCli(common.concat(['--out', wOut])).status === 3 && runCli(['--in', legacyIn]).status === 3; })());
    } else check('EP-E2b HEAD:resolve-profiles.js and HEAD:profile-contract.js readable via git show', false);

    // ── EP-E3 P-V17 registry admits publication ─────────────────────────────
    section('EP-E3 P-V17 registry entry');
    const srcBytes = Buffer.from(SOURCE_A, 'utf8');
    const rc = (entries, o) => { const d = mkRegistry(tmp('reg17'), entries); const rr = mkRuntime(path.join(tmp('rt17'), 'arc-runtime'), o && o.runtime); return lib.registryChecks(d, (o && o.plan) || mkPlan({ arcId: 'ARC-A' }), Object.assign({ arcId: 'ARC-A', runtimeRoot: rr, sourceBytes: srcBytes, nowIso: NOW }, (o && o.opts) || {})); };
    const good17 = rc({ 'ARC-A': mkEntry('ARC-A') });
    check('EP-E3 READY + implementationAllowed + promotion pinning the source bytes ⇒ P-V17 PASS (' + good17.violations.map((v) => v.message).join(' | ') + ')', good17.violations.length === 0 && good17.rules['P-V17'] === 'PASS');
    check('EP-E3 EXECUTING entry (republish) with a promotion pinning the new source ⇒ P-V17 PASS', rc({ 'ARC-A': executingEntry('ARC-A', 'arc-a-r0') }).rules['P-V17'] === 'PASS');
    check('EP-E3 IDEA ⇒ P-V17 REFUSED naming the state', hasViol(rc({ 'ARC-A': ideaEntry('ARC-A') }), 'P-V17', /IDEA/));
    check('EP-E3 PLANNING / REVIEWED / HOLD / CLOSED ⇒ P-V17 REFUSED', ['PLANNING', 'REVIEWED', 'CLOSED'].every((s) => hasViol(rc({ 'ARC-A': Object.assign(mkEntry('ARC-A'), { state: s, implementationAllowed: false }) }), 'P-V17', new RegExp(s))) && hasViol(rc({ 'ARC-A': Object.assign(mkEntry('ARC-A'), { state: 'HOLD', heldFrom: 'READY', implementationAllowed: false }) }), 'P-V17', /HOLD/));
    check('EP-E3 registry entry absent ⇒ P-V17 REFUSED (never created by the publisher)', hasViol(rc({ 'ARC-B': mkEntry('ARC-B') }), 'P-V17', /ARC-A/));
    check('EP-E3 registry root absent ⇒ P-V17 REFUSED "registry not bootstrapped"', hasViol(lib.registryChecks(path.join(tmp('noreg'), 'arcs'), mkPlan({ arcId: 'ARC-A' }), { arcId: 'ARC-A', runtimeRoot: mkRuntime(path.join(tmp('rt17b'), 'arc-runtime')), sourceBytes: srcBytes, nowIso: NOW }), 'P-V17', /not bootstrapped|absent/i));
    check('EP-E3 registry directory case variant (Arc-A) with --arc ARC-A ⇒ P-V17 REFUSED, never normalized', hasViol(rc({ 'Arc-A': mkEntry('ARC-A') }), 'P-V17', /case/i));
    check('EP-E3 arc.json arcId ARC-B inside directory ARC-A ⇒ P-V17 REFUSED', hasViol(rc({ 'ARC-A': mkEntry('ARC-B') }), 'P-V17', /ARC-B/));
    check('EP-E3 unparseable arc.json ⇒ P-V17 REFUSED', (() => { const d = tmp('regbad'); fs.mkdirSync(path.join(d, 'ARC-A')); fs.writeFileSync(path.join(d, 'ARC-A', 'arc.json'), '{"arcId": '); return hasViol(lib.registryChecks(d, mkPlan({ arcId: 'ARC-A' }), { arcId: 'ARC-A', runtimeRoot: mkRuntime(path.join(tmp('rt17c'), 'arc-runtime')), sourceBytes: srcBytes, nowIso: NOW }), 'P-V17', /parse/i); })());
    check('EP-E3 implementationAllowed false at READY ⇒ P-V17 REFUSED', hasViol(rc({ 'ARC-A': Object.assign(mkEntry('ARC-A'), { implementationAllowed: false }) }), 'P-V17', /implementationAllowed/));
    check('EP-E3 promotion null at READY ⇒ P-V17 REFUSED', hasViol(rc({ 'ARC-A': Object.assign(mkEntry('ARC-A'), { promotion: null }) }), 'P-V17', /promotion/));
    check('EP-E3 promotion.sourceHash != the publication source bytes ⇒ P-V17 REFUSED (promotion pins bytes, not a filename)', hasViol(rc({ 'ARC-A': mkEntry('ARC-A', { sourceHash: 'b'.repeat(64) }) }), 'P-V17', /sourceHash/));
    check('EP-E3 proposed plan.sourceHash != the source bytes ⇒ P-V17 REFUSED', hasViol(rc({ 'ARC-A': mkEntry('ARC-A') }, { plan: mkPlan({ arcId: 'ARC-A', sourceHash: 'c'.repeat(64) }) }), 'P-V17', /sourceHash/));
    check('EP-E3 promoted revision names a different source path than the plan ⇒ P-V17 REFUSED', hasViol(rc({ 'ARC-A': mkEntry('ARC-A', { source: ART('other-plan') }) }), 'P-V17', /revision|source/));
    check('EP-E3 promotion.rev without a matching planning.revisions entry ⇒ P-V17 REFUSED', hasViol(rc({ 'ARC-A': Object.assign(mkEntry('ARC-A'), { promotion: Object.assign(mkEntry('ARC-A').promotion, { rev: 2 }) }) }), 'P-V17', /rev/));
    check('EP-E3 READY decay: rulingAt 8 days before --now ⇒ P-V17 REFUSED naming STALE-READY', hasViol(rc({ 'ARC-A': mkEntry('ARC-A', { rulingAt: '2026-08-14T11:00:00Z' }) }), 'P-V17', /STALE-READY|stale/i));
    const ackStale = rc({ 'ARC-A': mkEntry('ARC-A', { rulingAt: '2026-08-14T11:00:00Z' }) }, { opts: { acknowledgeStalePromotion: true } });
    check('EP-E3 ... with acknowledgeStalePromotion ⇒ P-V17 OVERRIDDEN + WARN, no violation; stale{} reported', ackStale.violations.length === 0 && ackStale.rules['P-V17'] === 'OVERRIDDEN' && ackStale.warnings.some((w) => w.rule === 'P-V17') && !!ackStale.stale && ackStale.stale.rulingAt === '2026-08-14T11:00:00Z');
    check('EP-E3 rulingAt 6 days before --now ⇒ PASS (decay is 7 days); acknowledging a fresh promotion changes nothing', rc({ 'ARC-A': mkEntry('ARC-A', { rulingAt: '2026-08-16T12:00:00Z' }) }).rules['P-V17'] === 'PASS' && rc({ 'ARC-A': mkEntry('ARC-A') }, { opts: { acknowledgeStalePromotion: true } }).rules['P-V17'] === 'PASS');
    check('EP-E3 decay applies to READY only: EXECUTING entry with an old promotion ⇒ PASS', rc({ 'ARC-A': Object.assign(executingEntry('ARC-A', 'arc-a-r0'), { promotion: Object.assign(mkEntry('ARC-A').promotion, { rulingAt: '2026-08-01T10:00:00Z' }) }) }).rules['P-V17'] === 'PASS');
    check('EP-E3 registryChecks refuses --arc CORE-STREAM by throwing / P-V17 (never reads .ai-reports/arcs/CORE-STREAM as a runtime arc)', (() => { try { const r = lib.registryChecks(mkRegistry(tmp('regcs'), { 'CORE-STREAM': mkEntry('CORE-STREAM') }), mkPlan({ arcId: 'CORE-STREAM' }), { arcId: 'CORE-STREAM', runtimeRoot: mkRuntime(path.join(tmp('rtcs'), 'arc-runtime')), sourceBytes: srcBytes, nowIso: NOW }); return hasViol(r, 'P-V17') || hasViol(r, 'P-V16'); } catch (e) { return /CORE-STREAM/.test(e.message); } })());
    check('EP-E3 the CLI refuses P-V17 with exit 2 and prints the rule line REFUSED', (() => { const r2 = mkRegistry(tmp('regidea'), { 'ARC-A': ideaEntry('ARC-A') }); const r = runCli(base.slice(0, 8).concat(['--registry-root', r2, '--now', NOW, '--out', path.join(io, 'e3.json'), '--arc', 'ARC-A'])); return r.status === 2 && /^P-V17\b.*REFUSED/m.test(r.stdout); })());
    check('EP-E3 the CLI --acknowledge-stale-promotion ⇒ exit 0 and P-V17 OVERRIDDEN', (() => { const r2 = mkRegistry(tmp('regstale'), { 'ARC-A': mkEntry('ARC-A', { rulingAt: '2026-08-10T10:00:00Z' }) }); const args = base.slice(0, 8).concat(['--registry-root', r2, '--now', NOW, '--arc', 'ARC-A']); const ra = runCli(args.concat(['--out', path.join(io, 'e3a.json')])); const rb = runCli(args.concat(['--out', path.join(io, 'e3b.json'), '--acknowledge-stale-promotion'])); return ra.status === 2 && rb.status === 0 && /^P-V17\b.*OVERRIDDEN/m.test(rb.stdout); })());

    // ── EP-E4 P-V19 arc-claim integrity (selected namespace only) ──────────
    section('EP-E4 P-V19 ARC claim namespace integrity');
    const rt19 = (o) => lib.runtimeChecks(mkRuntime(path.join(tmp('rt19'), 'arc-runtime'), o), mkPlan({ arcId: 'ARC-A' }), { arcId: 'ARC-A' });
    check('EP-E4 container absent (first publication) ⇒ P-V19 PASS, P-V13 PASS; result shape stays the B1 contract exactly (no extra keys)', (() => { const r = rt19({}); return r.rules['P-V19'] === 'PASS' && r.rules['P-V13'] === 'PASS' && JSON.stringify(Object.keys(r).sort()) === JSON.stringify(['liveClaims', 'outgoingPlanId', 'rules', 'violations', 'warnings']); })());
    check('EP-E4 arc-claims/ARC-A/LX-2 carrying arcId ARC-A ⇒ P-V19 PASS', rt19({ arcClaims: { 'ARC-A': { 'LX-2': claimRec('LX-2', 'COMPLETE', 'arc-a-r1', 'ARC-A') } } }).rules['P-V19'] === 'PASS');
    check('EP-E4 claim carrying arcId ARC-B under ARC-A ⇒ P-V19 REFUSED naming LX-2', hasViol(rt19({ arcClaims: { 'ARC-A': { 'LX-2': claimRec('LX-2', 'COMPLETE', 'arc-a-r1', 'ARC-B') } } }), 'P-V19', /LX-2/));
    check('EP-E4 claim without arcId under arc-claims/ARC-A/ ⇒ P-V19 REFUSED', hasViol(rt19({ arcClaims: { 'ARC-A': { 'LX-2': claimRec('LX-2', 'COMPLETE', 'arc-a-r1') } } }), 'P-V19'));
    check('EP-E4 claim whose taskId != its directory ⇒ P-V19 REFUSED', hasViol(rt19({ arcClaims: { 'ARC-A': { 'LX-2': claimRec('LX-3', 'COMPLETE', 'arc-a-r1', 'ARC-A') } } }), 'P-V19'));
    check('EP-E4 unparseable claim.json ⇒ P-V19 REFUSED; directory without claim.json (residue) ⇒ P-V19 REFUSED naming owner-ops', hasViol(rt19({ arcClaims: { 'ARC-A': { 'LX-2': '{"taskId": ' } } }), 'P-V19', /parse/i) && hasViol(rt19({ arcClaims: { 'ARC-A': { 'LX-2': 'EMPTY-DIR' } } }), 'P-V19', /owner-ops|residue|no claim\.json/i));
    check('EP-E4 a bad claim in ARC-B and a legacy claim carrying arcId are INVISIBLE to --arc ARC-A (P-V19 PASS)', rt19({ arcClaims: { 'ARC-A': { 'LX-2': claimRec('LX-2', 'COMPLETE', 'arc-a-r1', 'ARC-A') }, 'ARC-B': { 'LX-2': claimRec('LX-2', 'COMPLETE', 'arc-b-r1', 'ARC-Z') } }, legacyClaims: { 'LX-2': claimRec('LX-2', 'COMPLETE', 'legacy', 'ARC-A') } }).rules['P-V19'] === 'PASS');
    check('EP-E4 P-V19 message names the rule, the path and the identity reason', (() => { const v = viol(rt19({ arcClaims: { 'ARC-A': { 'LX-2': claimRec('LX-2', 'COMPLETE', 'arc-a-r1', 'ARC-B') } } }), 'P-V19')[0]; return !!v && /^P-V19 REFUSED/.test(v.message) && /arc-claims\/ARC-A\/LX-2/.test(v.message) && /ARC-B/.test(v.message); })());
    check('EP-E4 legacy runtimeChecks (no arcId) never evaluates P-V19 and never reads arc-claims/', (() => { const root = mkRuntime(path.join(tmp('rt19l'), 'arc-runtime'), { legacyPointer: curRec('legacy-plan'), arcClaims: { 'ARC-A': { 'LX-2': claimRec('LX-2', 'CLAIMED', 'legacy-plan', 'ARC-Q') } } }); const s = spyFs(() => lib.runtimeChecks(root, mkPlan({ planId: 'legacy-next' }), {})); return !('P-V19' in s.result.rules) && s.result.rules['P-V13'] === 'PASS' && !s.seen.some((p) => /\/arc-claims(\/|$)/.test(p) || /\/plans\/arcs(\/|$)/.test(p)); })());

    // ── EP-E5 per-arc P-V13 ─────────────────────────────────────────────────
    section('EP-E5 per-arc P-V13');
    const rt13 = (o, ack) => { const root = mkRuntime(path.join(tmp('rt13'), 'arc-runtime'), o); const s = spyFs(() => lib.runtimeChecks(root, mkPlan({ planId: 'arc-a-r2', arcId: 'ARC-A' }), { arcId: 'ARC-A', acknowledgeLiveClaims: !!ack })); return Object.assign(s.result, { seen: s.seen }); };
    const outgoingA = { arcPointers: { 'ARC-A': curRec('arc-a-r1', 'ARC-A') } };
    check('EP-E5 live CLAIMED claim in arc-claims/ARC-A against the ARC-A outgoing plan ⇒ P-V13 REFUSED naming it', hasViol(rt13(Object.assign({ arcClaims: { 'ARC-A': { 'T-LIVE': claimRec('T-LIVE', 'CLAIMED', 'arc-a-r1', 'ARC-A') } } }, outgoingA)), 'P-V13', /T-LIVE \(CLAIMED\)/));
    check('EP-E5 COMPLETE claim against the outgoing plan ⇒ P-V13 PASS (proof C: later generations keep the ledger)', rt13(Object.assign({ arcClaims: { 'ARC-A': { 'LX-2': claimRec('LX-2', 'COMPLETE', 'arc-a-r1', 'ARC-A') } } }, outgoingA)).rules['P-V13'] === 'PASS');
    check('EP-E5 a live legacy claim (claims/T-LIVE, planId == ARC-A outgoing) is INVISIBLE to --arc ARC-A; nothing inside claims/ and no plans/current.json is ever read (only the frozen root-completeness stat of claims/ itself)', (() => { const r = rt13(Object.assign({ legacyPointer: curRec('arc-a-r1'), legacyClaims: { 'T-LIVE': claimRec('T-LIVE', 'CLAIMED', 'arc-a-r1') } }, outgoingA)); return r.rules['P-V13'] === 'PASS' && !r.seen.some((p) => /\/claims\/[^/]/.test(p) && !/arc-claims/.test(p)) && !r.seen.some((p) => /\/plans\/current\.json$/.test(p)); })());
    check('EP-E5 a live claim in arc-claims/ARC-B with the same planId is INVISIBLE to --arc ARC-A; arc-claims/ARC-B never read', (() => { const r = rt13(Object.assign({ arcClaims: { 'ARC-B': { 'T-LIVE': claimRec('T-LIVE', 'CLAIMED', 'arc-a-r1', 'ARC-B') }, 'ARC-A': {} } }, outgoingA)); return r.rules['P-V13'] === 'PASS' && !r.seen.some((p) => /\/arc-claims\/ARC-B(\/|$)/.test(p)); })());
    check('EP-E5 --acknowledge-live-claims ⇒ P-V13 OVERRIDDEN, liveClaims listed for carriedOverClaims', (() => { const r = rt13(Object.assign({ arcClaims: { 'ARC-A': { 'T-LIVE': claimRec('T-LIVE', 'CLAIMED', 'arc-a-r1', 'ARC-A') } } }, outgoingA), true); return r.rules['P-V13'] === 'OVERRIDDEN' && r.liveClaims.length === 1 && r.liveClaims[0].taskId === 'T-LIVE'; })());
    check('EP-E5 outgoing resolved from plans/arcs/ARC-A/current.json only (legacy pointer ignored); no pointer ⇒ outgoing null', rt13(Object.assign({ legacyPointer: curRec('legacy-plan') }, outgoingA)).outgoingPlanId === 'arc-a-r1' && rt13({ legacyPointer: curRec('legacy-plan') }).outgoingPlanId === null);
    check('EP-E5 P-V11 still refuses an existing plans/<planId> for an ARC publication (planId globally unique)', hasViol(rt13({ plans: { 'arc-a-r2': { plan: mkPlan({ planId: 'arc-a-r2', arcId: 'ARC-A' }), manifest: curRec('arc-a-r2', 'ARC-A') } } }), 'P-V11'));
    check('EP-E5 runtimeChecks root-completeness invariant unchanged: plans + claims + mutex exactly (arc roots are an ARC-level condition)', (() => { const src = readText(REL.lib); const m = src.match(/for \(const d of \['plans', 'claims', 'mutex'\]\)[^\n]*runtime root incomplete/); let threw = false; try { lib.runtimeChecks(mkRuntime(path.join(tmp('rtinc'), 'arc-runtime'), { arcRoots: false }), mkPlan(), {}); } catch (e) { threw = true; } return !!m && !threw; })());
    check('EP-E5 runtimeChecks with arcId but ARC roots absent ⇒ throws (never creates them)', (() => { const root = mkRuntime(path.join(tmp('rtnoarc'), 'arc-runtime'), { arcRoots: false }); let threw = false; try { lib.runtimeChecks(root, mkPlan({ arcId: 'ARC-A' }), { arcId: 'ARC-A' }); } catch (e) { threw = /plans\/arcs|arc-claims/.test(e.message); } return threw && !fs.existsSync(path.join(root, 'arc-claims')) && !fs.existsSync(path.join(root, 'plans', 'arcs')); })());
    check('EP-E5 runtimeChecks with a malformed / CORE-STREAM arcId ⇒ throws before any namespace read', ['arc-a', 'CORE-STREAM', 'CON'].every((id) => { const root = mkRuntime(path.join(tmp('rtbad'), 'arc-runtime')); const s = spyFs(() => { try { lib.runtimeChecks(root, mkPlan(), { arcId: id }); return false; } catch (e) { return true; } }); return s.result === true && !s.seen.some((p) => /\/(claims|arc-claims)\//.test(p)); }));

    // ── EP-E6 P-V20 stream-aware registry preconditions ─────────────────────
    section('EP-E6 P-V20 registry dependencies');
    const evidence = ART('t-dep-evidence');
    const r20 = (deps, o) => {
      o = o || {};
      const regDir = path.join(tmp('reg20'), '.ai-reports', 'arcs');
      mkRegistry(regDir, Object.assign({ 'ARC-A': mkEntry('ARC-A', { dependencies: deps }) }, o.entries || {}));
      if (o.evidence !== false) { const ev = path.join(regDir, '..', '..', evidence); fs.mkdirSync(path.dirname(ev), { recursive: true }); fs.writeFileSync(ev, '# evidence\n'); }
      const root = mkRuntime(path.join(tmp('rt20'), 'arc-runtime'), o.runtime);
      const s = spyFs(() => lib.registryChecks(regDir, mkPlan({ arcId: 'ARC-A' }), { arcId: 'ARC-A', runtimeRoot: root, sourceBytes: srcBytes, nowIso: NOW }));
      return Object.assign(s.result, { seen: s.seen });
    };
    const pre = (stream, arcId, over) => Object.assign({ kind: 'task-precondition', stream, taskId: 'T-DEP', evidence, attestedBy: 'owner', attestedAt: '2026-08-21T10:00:00Z' }, arcId ? { arcId } : {}, over || {});
    check('EP-E6 no dependencies ⇒ P-V20 PASS', r20([]).rules['P-V20'] === 'PASS');
    check('EP-E6 arc-state dependency at/after atLeast ⇒ PASS (ARC-B CLOSED, atLeast EXECUTING); below ⇒ REFUSED (ARC-B READY, atLeast EXECUTING)', r20([{ kind: 'arc-state', arcId: 'ARC-B', atLeast: 'EXECUTING' }], { entries: { 'ARC-B': closedEntry('ARC-B') } }).rules['P-V20'] === 'PASS' && hasViol(r20([{ kind: 'arc-state', arcId: 'ARC-B', atLeast: 'EXECUTING' }], { entries: { 'ARC-B': mkEntry('ARC-B') } }), 'P-V20', /ARC-B/));
    check('EP-E6 arc-state dependency on a missing registry entry ⇒ REFUSED; CANCELLED never satisfies a progressive atLeast', hasViol(r20([{ kind: 'arc-state', arcId: 'ARC-B', atLeast: 'CLOSED' }]), 'P-V20') && hasViol(r20([{ kind: 'arc-state', arcId: 'ARC-B', atLeast: 'CLOSED' }], { entries: { 'ARC-B': Object.assign(ideaEntry('ARC-B'), { state: 'CANCELLED', history: hist('IDEA', 'CANCELLED') }) } }), 'P-V20'));
    check('EP-E6 legacy task-precondition: evidence present + attested + claims/T-DEP COMPLETE ⇒ PASS', r20([pre('legacy')], { runtime: { legacyClaims: { 'T-DEP': claimRec('T-DEP', 'COMPLETE', 'legacy-plan') } } }).rules['P-V20'] === 'PASS');
    check('EP-E6 legacy task-precondition with no surviving claim directory ⇒ PASS (evidence-anchored, never claim-anchored)', r20([pre('legacy')]).rules['P-V20'] === 'PASS');
    check('EP-E6 surviving claims/T-DEP ABANDONED / BLOCKED / CLAIMED ⇒ REFUSED (contradicts)', ['ABANDONED', 'BLOCKED', 'CLAIMED'].every((s) => hasViol(r20([pre('legacy')], { runtime: { legacyClaims: { 'T-DEP': claimRec('T-DEP', s, 'legacy-plan') } } }), 'P-V20', new RegExp(s))));
    check('EP-E6 evidence artifact missing ⇒ REFUSED; attestedBy / attestedAt null ⇒ REFUSED', hasViol(r20([pre('legacy')], { evidence: false }), 'P-V20', /evidence/) && hasViol(r20([pre('legacy', null, { attestedBy: null, attestedAt: null })]), 'P-V20', /attest/));
    check('EP-E6 stream arc (ARC-B, T-DEP): reads ONLY arc-claims/ARC-B/T-DEP - a COMPLETE claims/T-DEP does not rescue an ABANDONED arc-claims/ARC-B/T-DEP', (() => { const r = r20([pre('arc', 'ARC-B')], { runtime: { legacyClaims: { 'T-DEP': claimRec('T-DEP', 'COMPLETE', 'x') }, arcClaims: { 'ARC-B': { 'T-DEP': claimRec('T-DEP', 'ABANDONED', 'arc-b-r1', 'ARC-B') } } } }); return hasViol(r, 'P-V20', /ABANDONED/) && !r.seen.some((p) => /\/claims\/T-DEP/.test(p) && !/arc-claims/.test(p)); })());
    check('EP-E6 stream legacy: reads ONLY claims/T-DEP - an ABANDONED arc-claims/ARC-B/T-DEP is invisible; arc-claims/ never read', (() => { const r = r20([pre('legacy')], { runtime: { legacyClaims: { 'T-DEP': claimRec('T-DEP', 'COMPLETE', 'x') }, arcClaims: { 'ARC-B': { 'T-DEP': claimRec('T-DEP', 'ABANDONED', 'arc-b-r1', 'ARC-B') } } } }); return r.rules['P-V20'] === 'PASS' && !r.seen.some((p) => /\/arc-claims(\/|$)/.test(p)); })());
    check('EP-E6 stream arc: the surviving claim must match its path identity (arc-claims/ARC-B/T-DEP carrying arcId ARC-C ⇒ REFUSED via claimMatchesPath)', hasViol(r20([pre('arc', 'ARC-B')], { runtime: { arcClaims: { 'ARC-B': { 'T-DEP': claimRec('T-DEP', 'COMPLETE', 'arc-b-r1', 'ARC-C') } } } }), 'P-V20'));
    check('EP-E6 unknown dependency kind ⇒ REFUSED (fail closed)', hasViol(r20([{ kind: 'task-state', taskId: 'X' }]), 'P-V20'));
    check('EP-E6 identity spaces: arc-state may target CORE-STREAM (registry identity/state) ⇒ PASS when satisfied; task-precondition stream arc with CORE-STREAM ⇒ REFUSED and arc-claims/CORE-STREAM/ is never constructed or inspected', (() => { const cs = Object.assign(mkEntry('CORE-STREAM'), { state: 'EXECUTING', promotion: null, execution: { planId: 'parallel-arc-v3-2026-08-15', planHash: 'a'.repeat(64), pointer: 'plans/current.json', claimsRoot: 'claims/', publishedAt: '2026-08-15T17:26:12Z' }, history: [{ state: 'EXECUTING', at: '2026-08-22T10:00:00Z', by: 'owner', note: 'grandfather' }] }); const ok = r20([{ kind: 'arc-state', arcId: 'CORE-STREAM', atLeast: 'EXECUTING' }], { entries: { 'CORE-STREAM': cs } }); const bad = r20([pre('arc', 'CORE-STREAM')], { entries: { 'CORE-STREAM': cs } }); return ok.rules['P-V20'] === 'PASS' && hasViol(bad, 'P-V20', /CORE-STREAM/) && !bad.seen.some((p) => /arc-claims\/CORE-STREAM/.test(p)); })());
    check('EP-E6 the CLI prints P-V20 REFUSED with exit 2 on a contradicting claim', (() => { const regDir = path.join(tmp('reg20c'), '.ai-reports', 'arcs'); mkRegistry(regDir, { 'ARC-A': mkEntry('ARC-A', { dependencies: [pre('legacy')] }) }); const ev = path.join(regDir, '..', '..', evidence); fs.mkdirSync(path.dirname(ev), { recursive: true }); fs.writeFileSync(ev, '# e\n'); const root = mkRuntime(path.join(tmp('rt20c'), 'arc-runtime'), { legacyClaims: { 'T-DEP': claimRec('T-DEP', 'ABANDONED', 'x') } }); const r = runCli(['--in', inArc, '--out', path.join(io, 'e6.json'), '--source', srcFile, '--runtime-root', root, '--registry-root', regDir, '--arc', 'ARC-A', '--now', NOW]); return r.status === 2 && /^P-V20\b.*REFUSED/m.test(r.stdout); })());

    // ── EP-E8 duplicate task ids across ARCs are safe (publisher half) ──────
    section('EP-E8 duplicate task ids across ARCs (publisher half)');
    check('EP-E8 publish --arc ARC-B listing TASK-10 while arc-claims/ARC-A/TASK-10 and claims/TASK-10 are COMPLETE ⇒ P-V16 PASS, P-V19 PASS, P-V13 PASS, exit 0', (() => { const regB = mkRegistry(tmp('regB'), { 'ARC-B': mkEntry('ARC-B') }); const root = mkRuntime(path.join(tmp('rtB'), 'arc-runtime'), { legacyClaims: { 'TASK-10': claimRec('TASK-10', 'COMPLETE', 'legacy') }, arcClaims: { 'ARC-A': { 'TASK-10': claimRec('TASK-10', 'COMPLETE', 'arc-a-r1', 'ARC-A') } } }); const r = runCli(['--in', inArc, '--out', path.join(io, 'e8.json'), '--source', srcFile, '--runtime-root', root, '--registry-root', regB, '--arc', 'ARC-B', '--now', NOW]); return r.status === 0 && ['16', '19', '13'].every((n) => new RegExp('^P-V' + n + '\\b.*PASS', 'm').test(r.stdout)) && rdJson(path.join(io, 'e8.json')).arcId === 'ARC-B'; })());
  }

  // ── executed protocol blocks (D-31): extract `# @op` bash blocks from publish-protocol.md ───
  section('EP-E7/E9/E11/E12/E13 publish-protocol.md blocks executed by Git Bash against temp repos');
  const protocolText = exists(REL.docs.protocol) ? stripCR(readText(REL.docs.protocol)) : '';
  const OPS = {};
  { const re = /```bash\n# @op ([A-Za-z0-9-]+)[^\n]*\n([\s\S]*?)```/g; let m; while ((m = re.exec(protocolText))) OPS[m[1]] = m[2]; }
  const FULL = ['publish-prelude', 'publish-args', 'publish-namespace', 'step0-main-worktree', 'step1-root', 'step2-source-path', 'step3-stale-source', 'step4-mutex', 'step5-resolve', 'step6-repo-ref', 'step7-post-confirm', 'step8-stage', 'step9-rename', 'step9b-container', 'step10-pointer', 'step10b-writeback', 'step11-release'];
  const DRY = ['publish-prelude', 'publish-args', 'publish-namespace', 'step0-main-worktree', 'step1-root', 'step2-source-path', 'step3-stale-source', 'dryrun-resolve'];
  check('EP-E7 publish-protocol.md carries every tagged block in publish order (' + FULL.concat(['dryrun-resolve']).filter((o) => !OPS[o]).join(', ') + ' missing)', FULL.concat(['dryrun-resolve']).every((o) => !!OPS[o]) && FULL.every((o, i) => i === 0 || protocolText.indexOf('# @op ' + FULL[i - 1]) < protocolText.indexOf('# @op ' + o)));
  const opsReady = !!BASH && FULL.every((o) => !!OPS[o]) && libReady;
  if (!opsReady) console.log('  (tagged blocks / bash / library not all available - executed scenarios skipped; RED)');

  function mkRepo(label, o) {
    o = o || {};
    const dir = tmp(label);
    git(['init', '-q'], dir);
    git(['-c', 'user.name=qa', '-c', 'user.email=qa@local', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'init'], dir);
    const head = git(['rev-parse', 'HEAD'], dir).stdout.trim();
    const root = path.join(dir, '.git', 'arc-runtime');
    mkRuntime(root, o.runtime);
    const srcAbs = path.join(dir, o.src || SRC_REL); fs.mkdirSync(path.dirname(srcAbs), { recursive: true }); fs.writeFileSync(srcAbs, o.source || SOURCE_A);
    const chk = path.join(dir, 'CHECKPOINT.md'); fs.writeFileSync(chk, '# checkpoint\n'); const old = new Date(Date.now() - 86400e3); fs.utimesSync(chk, old, old);
    const regDir = path.join(dir, '.ai-reports', 'arcs');
    if (o.registry !== null) { fs.mkdirSync(regDir, { recursive: true }); mkRegistry(regDir, o.registry || {}); }
    const scratch = path.join(dir, 'qa-scratch'); fs.mkdirSync(scratch);
    return { dir, head, root, regDir, scratch, srcHash: sha256(fs.readFileSync(srcAbs)) };
  }
  function runSeq(repo, env, opNames, glue) {
    glue = glue || {};
    const parts = [];
    for (const op of opNames) {
      if (!OPS[op]) { parts.push('echo "MISSING-OP ' + op + '"; exit 97'); break; }
      parts.push('# ---- ' + op); parts.push(OPS[op]);
      if (op === 'publish-prelude') parts.push('rmdir "$SCRATCH" 2>/dev/null; SCRATCH="$QA_SCRATCH"; RESOLVER="$QA_RESOLVER"; LIB="$QA_LIB"; IDENT="$QA_IDENT"');
      if (op === 'step4-mutex') parts.push('echo "::HOLDER::$(cat "$M/holder.json")"');
      if (op === 'step9b-container') parts.push('echo "::CONTAINER::$CONTAINER"');
      if (op === 'step10b-writeback') parts.push('echo "::WRITEBACK::$WRITEBACK"');
      if (glue[op]) parts.push(glue[op]);
    }
    parts.push('echo "::DONE::"');
    const e = Object.assign({ QA_SCRATCH: fwd(repo.scratch), QA_RESOLVER: fwd(abs(REL.cli)), QA_LIB: fwd(abs(REL.lib)), QA_IDENT: fwd(abs(REL.identity)), SRC: SRC_REL, ARC: '', PLAN_ID: 'arc-a-r1', ACK_STALE: '0', ACK_LIVE: '0', ACK_REF: '0', ACK_STALE_PROMO: '0', PUBLISHED_BY: 'qa-owner' }, env || {});
    return bash(parts.join('\n'), repo.dir, e);
  }
  const marker = (out, name) => { const m = out.match(new RegExp('^::' + name + '::(.*)$', 'm')); return m ? m[1] : null; };
  const mutexEmpty = (repo) => fs.readdirSync(path.join(repo.root, 'mutex')).length === 0;
  const noStaging = (repo) => !fs.readdirSync(path.join(repo.root, 'plans')).some((n) => n.startsWith('.staging-'));
  const fresh = () => isoOf(NOW_MS - 3600e3);
  const stale = () => isoOf(NOW_MS - 10 * 86400e3);
  const proposed = (repo, o) => wrJson(path.join(repo.scratch, 'proposed.json'), mkPlan(Object.assign({ repoRef: repo.head, sourceHash: repo.srcHash }, o || {})));

  if (opsReady) {
    // ── S1: full ARC publish (EP-E11 three-way identity · EP-E9 container · EP-E7 write-back · EP-E13 holder) ──
    const s1 = mkRepo('pubA', { runtime: { legacyPointer: curRec('legacy-v3'), legacyClaims: { 'LX-2': claimRec('LX-2', 'COMPLETE', 'legacy-v3') } }, registry: { 'ARC-A': mkEntry('ARC-A', { rulingAt: fresh() }), 'EP-X': ideaEntry('EP-X') } });
    check('S1 fixture: source bytes on disk hash to the promotion sourceHash', s1.srcHash === SOURCE_A_HASH);
    proposed(s1);
    const legacyPtrBefore = sha256(fs.readFileSync(path.join(s1.root, 'plans', 'current.json')));
    const legacyClaimsBefore = treeHash(path.join(s1.root, 'claims'));
    const epxBefore = sha256(fs.readFileSync(path.join(s1.regDir, 'EP-X', 'arc.json')));
    const r1 = runSeq(s1, { ARC: 'ARC-A' }, FULL);
    check('S1 full ARC publish sequence exit 0 and reaches ::DONE::' + (r1.status !== 0 ? ' - ' + r1.out.slice(-900) : ''), r1.status === 0 && /::DONE::/.test(r1.stdout));
    const ptrA = path.join(s1.root, 'plans', 'arcs', 'ARC-A', 'current.json');
    const snapA = path.join(s1.root, 'plans', 'arc-a-r1');
    const okS1 = r1.status === 0 && fs.existsSync(ptrA) && fs.existsSync(path.join(snapA, 'plan.json'));
    if (okS1) {
      const plan = rdJson(path.join(snapA, 'plan.json')), manifest = rdJson(path.join(snapA, 'manifest.json')), current = rdJson(ptrA);
      check('EP-E11 plan.json.arcId == manifest.json.arcId == plans/arcs/ARC-A/current.json.arcId == ARC-A on REAL publisher output', plan.arcId === 'ARC-A' && manifest.arcId === 'ARC-A' && current.arcId === 'ARC-A');
      check('EP-E11 runtime-identity arcIdTriple({plan, manifest, current}, "ARC-A") ⇒ ARC; the protocol printed the verdict before the swap', ident.arcIdTriple({ plan, manifest, current }, 'ARC-A').verdict === 'ARC' && /arcIdTriple ARC ARC-A/.test(r1.stdout));
      check('EP-E11 current.json bytes == manifest.json bytes (the pointer is the manifest, verbatim); both validate current.schema.json', fs.readFileSync(ptrA).equals(fs.readFileSync(path.join(snapA, 'manifest.json'))) && schemaOk('current', manifest) && schemaOk('current', current));
      check('EP-E11 manifest: planHash == sha256(plan.json bytes); sourceHash == source bytes; ref == temp HEAD; supersedesPlanId null; publishedBy recorded; arcId is the LAST field', manifest.planHash === sha256(fs.readFileSync(path.join(snapA, 'plan.json'))) && manifest.sourceHash === s1.srcHash && manifest.ref === s1.head && manifest.supersedesPlanId === null && manifest.publishedBy === 'qa-owner' && Object.keys(manifest).slice(-1)[0] === 'arcId' && Object.keys(manifest).slice(0, 11).join(',') === 'planId,planHash,source,sourceHash,ref,publishedAt,publishedBy,supersedesPlanId,staleSourceAcknowledged,refMismatchAcknowledged,carriedOverClaims');
      check('EP-E11 snapshot plan.json validates plan.schema.json (minus the external executionProfiles ref) and source.md is the source verbatim', schemaOk('plan', JSON.parse(JSON.stringify(plan, (k, v) => (k === 'executionProfiles' ? undefined : v)))) && fs.readFileSync(path.join(snapA, 'source.md'), 'utf8') === SOURCE_A);
      check('EP-E11 legacy pointer plans/current.json and claims/ byte-identical after an ARC publish; no current.json.tmp left', sha256(fs.readFileSync(path.join(s1.root, 'plans', 'current.json'))) === legacyPtrBefore && treeHash(path.join(s1.root, 'claims')) === legacyClaimsBefore && !fs.existsSync(ptrA + '.tmp') && !fs.existsSync(path.join(s1.root, 'plans', 'current.json.tmp')));
      check('EP-E13 AUTHORITY:published-plan holder carried {taskId __PUBLISH__, lane OWNER, acquiredAt, arcId ARC-A} while held (holder.schema.json valid); released at step 11', (() => { const h = marker(r1.stdout, 'HOLDER'); if (!h) return false; const o = JSON.parse(h); return o.taskId === '__PUBLISH__' && o.lane === 'OWNER' && o.arcId === 'ARC-A' && schemaOk('holder', o) && mutexEmpty(s1); })());
      check('EP-E9 step 9b created arc-claims/ARC-A/ (empty container) and nothing else under arc-claims/', marker(r1.stdout, 'CONTAINER') === 'created arc-claims/ARC-A/' && fs.existsSync(path.join(s1.root, 'arc-claims', 'ARC-A')) && fs.readdirSync(path.join(s1.root, 'arc-claims', 'ARC-A')).length === 0 && fs.readdirSync(path.join(s1.root, 'arc-claims')).join() === 'ARC-A');
      const arcJson = rdJson(path.join(s1.regDir, 'ARC-A', 'arc.json'));
      check('EP-E7 step 10b write-back: state EXECUTING; execution{planId, planHash, pointer, claimsRoot, publishedAt} == the published values; history appended by publisher; arc.schema.json valid', marker(r1.stdout, 'WRITEBACK') !== null && /^OK/.test(marker(r1.stdout, 'WRITEBACK')) && arcJson.state === 'EXECUTING' && arcJson.implementationAllowed === true && isObj(arcJson.execution) && arcJson.execution.planId === 'arc-a-r1' && arcJson.execution.planHash === manifest.planHash && arcJson.execution.pointer === 'plans/arcs/ARC-A/current.json' && arcJson.execution.claimsRoot === 'arc-claims/ARC-A/' && arcJson.execution.publishedAt === manifest.publishedAt && arcJson.history[arcJson.history.length - 1].state === 'EXECUTING' && arcJson.history[arcJson.history.length - 1].by === 'publisher' && schemaOk('arc', arcJson) && (schemaViol('arc', arcJson).join('; ') || true));
      check('EP-E7 write-back touched only ARC-A/arc.json (EP-X byte-identical); parse-modify-serialize + temp + rename left no arc.json.tmp; promotion untouched', sha256(fs.readFileSync(path.join(s1.regDir, 'EP-X', 'arc.json'))) === epxBefore && !fs.existsSync(path.join(s1.regDir, 'ARC-A', 'arc.json.tmp')) && isObj(arcJson.promotion) && arcJson.promotion.rev === 1);
      check('EP-E12 end state: mutex/ empty, no .staging-*, scratch holds resolve.txt + plan.json whose hash is the published planHash', mutexEmpty(s1) && noStaging(s1) && fs.existsSync(path.join(s1.scratch, 'resolve.txt')) && sha256(fs.readFileSync(path.join(s1.scratch, 'plan.json'))) === manifest.planHash);

      // ── EP-E14 (B6 cross-batch): the ARC this publisher just created is EXACTLY the one the
      // worker resolves. The worker's own tagged blocks are executed against the same temp root,
      // so the publisher/worker interface is proven by running both sides, never by comparing prose.
      const cpRel = '.claude/skills/arc-worker/references/claim-protocol.md';
      const cpText = exists(cpRel) ? stripCR(readText(cpRel)) : '';
      const CPOPS = {}; { const re = /```bash\n# @op ([A-Za-z0-9-]+)[^\n]*\n([\s\S]*?)```/g; let mm; while ((mm = re.exec(cpText))) CPOPS[mm[1]] = mm[2]; }
      const WSEQ = ['worker-prelude', 'worker-args', 'worker-namespace', 'step0-preconditions', 'step1-snapshot'];
      check('EP-E14 claim-protocol.md carries the blocks a worker needs to resolve a freshly published ARC (' + WSEQ.filter((o) => !CPOPS[o]).join(', ') + ')', WSEQ.every((o) => !!CPOPS[o]));
      if (WSEQ.every((o) => !!CPOPS[o])) {
        // PTR / CLAIMS are emitted where the namespace is resolved; PLANID only after the snapshot loads,
        // so a run that legitimately IDLEs later still proves which namespace it selected.
        const wp = [];
        for (const o of WSEQ) {
          wp.push('# ---- ' + o); wp.push(CPOPS[o]);
          if (o === 'worker-prelude') wp.push('IDENT="$QA_IDENT"');
          if (o === 'worker-namespace') { wp.push('echo "::PTR::$PTR"'); wp.push('echo "::CLAIMS::$CLAIMS"'); }
        }
        wp.push('echo "::PLANID::$PLAN_ID"'); wp.push('echo "::WDONE::"');
        const wrun = bash(wp.join('\n'), s1.dir, { QA_IDENT: fwd(abs(REL.identity)), LANE: 'MAIN', ARC: 'ARC-A', CONV: 'qa-x' });
        const rel = (v) => (v || '').replace(fwd(s1.root) + '/', '');
        check('EP-E14 a worker with --arc ARC-A resolves the publisher-created pointer, container and planId without any IDLE' + (wrun.status !== 0 ? ' - ' + wrun.out.slice(-500) : ''),
          wrun.status === 0 && /::WDONE::/.test(wrun.stdout) && !/IDLE/.test(wrun.stdout) &&
          rel(marker(wrun.stdout, 'PTR')) === 'plans/arcs/ARC-A/current.json' &&
          rel(marker(wrun.stdout, 'CLAIMS')) === 'arc-claims/ARC-A' &&
          marker(wrun.stdout, 'PLANID') === 'arc-a-r1');
        check('EP-E14 those resolved paths are byte-equal to what step 10b wrote into the registry as execution.pointer and execution.claimsRoot',
          rel(marker(wrun.stdout, 'PTR')) === rdJson(path.join(s1.regDir, 'ARC-A', 'arc.json')).execution.pointer &&
          rel(marker(wrun.stdout, 'CLAIMS')) + '/' === rdJson(path.join(s1.regDir, 'ARC-A', 'arc.json')).execution.claimsRoot);
        const wLegacy = bash(wp.join('\n'), s1.dir, { QA_IDENT: fwd(abs(REL.identity)), LANE: 'MAIN', ARC: '', CONV: 'qa-x' });
        check('EP-E14 the same worker without --arc resolves the untouched legacy pointer and claims/ root, says the ARC pointers are not considered, and never reaches into the ARC namespace (this fixture has no legacy snapshot, so it then IDLEs - correctly)',
          wLegacy.status === 0 && rel(marker(wLegacy.stdout, 'PTR')) === 'plans/current.json' && rel(marker(wLegacy.stdout, 'CLAIMS')) === 'claims' && /NOTICE[\s\S]*ARC-A/.test(wLegacy.stdout) && !/arc-claims/.test(wLegacy.stdout));
        const wCore = bash(wp.join('\n'), s1.dir, { QA_IDENT: fwd(abs(REL.identity)), LANE: 'MAIN', ARC: 'CORE-STREAM', CONV: 'qa-x' });
        check('EP-E14 CORE-STREAM is refused as a runtime selector on BOTH sides: P-V16 in the publisher and IDLE in the worker',
          wCore.status === 0 && /IDLE/.test(wCore.stdout) && /CORE-STREAM/.test(wCore.stdout) && !/::WDONE::/.test(wCore.stdout));
        check('EP-E14 the worker runs wrote nothing: the published ARC tree and the legacy tree are byte-identical afterwards',
          sha256(fs.readFileSync(path.join(s1.root, 'plans', 'current.json'))) === legacyPtrBefore && treeHash(path.join(s1.root, 'claims')) === legacyClaimsBefore &&
          fs.readdirSync(path.join(s1.root, 'arc-claims', 'ARC-A')).length === 0 && mutexEmpty(s1));
      }
      check('S1 resolver projection (scratch resolve.txt) printed the ARC line, P-V16/17/19/20 PASS and the projectionHash == planHash', (() => { const t = fs.readFileSync(path.join(s1.scratch, 'resolve.txt'), 'utf8'); return /^ARC\s+ARC-A\b/m.test(t) && ['16', '17', '19', '20'].every((n) => new RegExp('^P-V' + n + '\\b.*PASS', 'm').test(t)) && new RegExp('^projectionHash\\s+' + manifest.planHash, 'm').test(t); })());

      // ── S2: republish r2 of the same arc (EXECUTING -> EXECUTING), COMPLETE claim retained, container idempotent ──
      const SRC2 = ART('arc-a-plan-r2');
      const source2 = sourceMarkdown(ARC_ROWS, 'ARC-A plan r2');
      fs.writeFileSync(path.join(s1.dir, SRC2), source2);
      const src2Hash = sha256(fs.readFileSync(path.join(s1.dir, SRC2)));
      wrJson(path.join(s1.root, 'arc-claims', 'ARC-A', 'LX-2', 'claim.json'), claimRec('LX-2', 'COMPLETE', 'arc-a-r1', 'ARC-A'));
      const lx2Before = sha256(fs.readFileSync(path.join(s1.root, 'arc-claims', 'ARC-A', 'LX-2', 'claim.json')));
      const a2 = rdJson(path.join(s1.regDir, 'ARC-A', 'arc.json'));
      a2.planning.revisions.push({ rev: 2, source: SRC2, sourceHash: src2Hash, status: 'PROMOTED', reviews: [{ artifact: ART('arc-a-plan-r2-review'), reviewer: 'CODEX', verdict: 'PASS', at: '2026-08-22' }] });
      a2.planning.currentRevision = 2;
      a2.promotion = { rev: 2, sourceHash: src2Hash, rulingAt: fresh(), rulingBy: 'owner', note: 'r2', waivers: [] };
      wrJson(path.join(s1.regDir, 'ARC-A', 'arc.json'), a2);
      const snapABefore = treeHash(snapA);
      wrJson(path.join(s1.scratch, 'proposed.json'), mkPlan({ planId: 'arc-a-r2', source: SRC2, sourceHash: src2Hash, repoRef: s1.head }));
      fs.rmSync(path.join(s1.scratch, 'plan.json'));
      const r2 = runSeq(s1, { ARC: 'ARC-A', PLAN_ID: 'arc-a-r2', SRC: SRC2 }, FULL);
      check('S2 republish r2 (EXECUTING -> EXECUTING) exit 0' + (r2.status !== 0 ? ' - ' + r2.out.slice(-900) : ''), r2.status === 0 && /::DONE::/.test(r2.stdout));
      if (r2.status === 0) {
        const cur2 = rdJson(ptrA), arc2 = rdJson(path.join(s1.regDir, 'ARC-A', 'arc.json'));
        check('S2 pointer atomically replaced: planId arc-a-r2, supersedesPlanId arc-a-r1, arcId ARC-A; r1 snapshot untouched', cur2.planId === 'arc-a-r2' && cur2.supersedesPlanId === 'arc-a-r1' && cur2.arcId === 'ARC-A' && treeHash(snapA) === snapABefore);
        check('S2 proof C (publisher half): COMPLETE arc-claims/ARC-A/LX-2 (planId arc-a-r1) passed P-V13 + P-V19 and is byte-identical; carriedOverClaims []', sha256(fs.readFileSync(path.join(s1.root, 'arc-claims', 'ARC-A', 'LX-2', 'claim.json'))) === lx2Before && cur2.carriedOverClaims.length === 0);
        check('S2 step 9b idempotent: container already present, EEXIST ignored, no error', marker(r2.stdout, 'CONTAINER') === 'already present arc-claims/ARC-A/');
        check('S2 write-back: execution.planId arc-a-r2; two publisher EXECUTING history entries; still schema-valid; EP-X untouched', arc2.execution.planId === 'arc-a-r2' && arc2.history.filter((h) => h.by === 'publisher' && h.state === 'EXECUTING').length === 2 && schemaOk('arc', arc2) && sha256(fs.readFileSync(path.join(s1.regDir, 'EP-X', 'arc.json'))) === epxBefore && mutexEmpty(s1));
      }
    }

    // ── S3: legacy publish (no --arc) on a root that has ARC namespaces - never reads them, writes no arcId ──
    const s3 = mkRepo('pubL', { registry: null, runtime: { legacyPointer: curRec('legacy-v3'), legacyClaims: { 'LX-2': claimRec('LX-2', 'COMPLETE', 'legacy-v3') }, arcPointers: { 'ARC-A': curRec('arc-a-r1', 'ARC-A') }, arcClaims: { 'ARC-A': { 'T-LIVE': claimRec('T-LIVE', 'CLAIMED', 'legacy-v3', 'ARC-A') } } } });
    wrJson(path.join(s3.scratch, 'proposed.json'), mkPlan({ planId: 'legacy-next', repoRef: s3.head, sourceHash: s3.srcHash }));
    const arcsBefore3 = treeHash(path.join(s3.root, 'plans', 'arcs')), arcClaimsBefore3 = treeHash(path.join(s3.root, 'arc-claims'));
    const r3 = runSeq(s3, { ARC: '', PLAN_ID: 'legacy-next' }, FULL);
    check('S3 legacy publish (ARC empty) exit 0 with a CLAIMED arc-claims/ARC-A/T-LIVE against the same outgoing planId (invisible to the legacy path)' + (r3.status !== 0 ? ' - ' + r3.out.slice(-900) : ''), r3.status === 0 && /::DONE::/.test(r3.stdout));
    if (r3.status === 0) {
      const cur3 = rdJson(path.join(s3.root, 'plans', 'current.json')), man3 = rdJson(path.join(s3.root, 'plans', 'legacy-next', 'manifest.json')), plan3 = rdJson(path.join(s3.root, 'plans', 'legacy-next', 'plan.json'));
      check('EP-E11 legacy publish writes NO arcId in plan.json, manifest.json or current.json; arcIdTriple ⇒ LEGACY (printed)', !('arcId' in cur3) && !('arcId' in man3) && !('arcId' in plan3) && ident.arcIdTriple({ plan: plan3, manifest: man3, current: cur3 }).verdict === 'LEGACY' && /arcIdTriple LEGACY/.test(r3.stdout));
      check('S3 legacy pointer swapped: planId legacy-next, supersedesPlanId legacy-v3, field set byte-identical to the manifest; current.schema valid', cur3.planId === 'legacy-next' && cur3.supersedesPlanId === 'legacy-v3' && fs.readFileSync(path.join(s3.root, 'plans', 'current.json')).equals(fs.readFileSync(path.join(s3.root, 'plans', 'legacy-next', 'manifest.json'))) && schemaOk('current', cur3));
      check('S3 plans/arcs/ and arc-claims/ trees untouched; holder carried no arcId; container + write-back n/a; mutex released', treeHash(path.join(s3.root, 'plans', 'arcs')) === arcsBefore3 && treeHash(path.join(s3.root, 'arc-claims')) === arcClaimsBefore3 && (() => { const h = marker(r3.stdout, 'HOLDER'); return !!h && !('arcId' in JSON.parse(h)) && schemaOk('holder', JSON.parse(h)); })() && /^n\/a/.test(marker(r3.stdout, 'CONTAINER') || '') && /^n\/a/.test(marker(r3.stdout, 'WRITEBACK') || '') && mutexEmpty(s3));
    }

    // ── S4: refusal paths - release on every exit, nothing created for a never-published arc (EP-E9, EP-E12) ──
    const refusalOk = (repo, r, re) => r.status !== 0 && re.test(r.stdout) && mutexEmpty(repo) && noStaging(repo) && !fs.existsSync(path.join(repo.root, 'plans', 'arcs', 'ARC-A', 'current.json'));
    const s4a = mkRepo('refNs', { registry: { 'ARC-A': mkEntry('ARC-A', { rulingAt: fresh() }) } });
    const rootBefore4a = treeHash(s4a.root);
    check('S4a --arc arc-a ⇒ P-V16 REFUSED before the mutex (publish-namespace); runtime untouched', (() => { const r = runSeq(s4a, { ARC: 'arc-a' }, FULL); return r.status !== 0 && /P-V16 REFUSED[^\n]*arc-a/.test(r.stdout) && treeHash(s4a.root) === rootBefore4a; })());
    check('S4b --arc CORE-STREAM ⇒ P-V16 REFUSED before the mutex; runtime untouched', (() => { const r = runSeq(s4a, { ARC: 'CORE-STREAM' }, FULL); return r.status !== 0 && /P-V16 REFUSED[^\n]*CORE-STREAM/.test(r.stdout) && treeHash(s4a.root) === rootBefore4a; })());
    check('S4b --arc "ARC A" / Arc-A / CON ⇒ P-V16 REFUSED before the mutex', ['ARC A', 'Arc-A', 'CON'].every((id) => { const r = runSeq(s4a, { ARC: id }, FULL); return r.status !== 0 && /P-V16 REFUSED/.test(r.stdout) && treeHash(s4a.root) === rootBefore4a; }));
    const s4c = mkRepo('refRoots', { runtime: { arcRoots: false }, registry: { 'ARC-A': mkEntry('ARC-A', { rulingAt: fresh() }) } });
    proposed(s4c);
    check('S4c ARC roots absent (plans/arcs, arc-claims) ⇒ step 1 REFUSES; the publisher never creates them; mutex never taken', (() => { const before = treeHash(s4c.root); const r = runSeq(s4c, { ARC: 'ARC-A' }, FULL); return r.status !== 0 && /REFUSED[^\n]*(plans\/arcs|arc-claims)/.test(r.stdout) && treeHash(s4c.root) === before && !fs.existsSync(path.join(s4c.root, 'arc-claims')); })());
    const s4d = mkRepo('refIdea', { registry: { 'ARC-A': ideaEntry('ARC-A') } });
    proposed(s4d);
    check('S4d registry IDEA ⇒ resolver refuses P-V17 at step 5; mutex released; no container, no pointer, registry untouched', (() => { const rb = treeHash(s4d.regDir); const r = runSeq(s4d, { ARC: 'ARC-A' }, FULL); return refusalOk(s4d, r, /REFUSED - resolver refused/) && /^P-V17\b.*REFUSED/m.test(fs.readFileSync(path.join(s4d.scratch, 'resolve.txt'), 'utf8')) && !fs.existsSync(path.join(s4d.root, 'arc-claims', 'ARC-A')) && treeHash(s4d.regDir) === rb; })());
    const s4e = mkRepo('refLive', { runtime: { arcPointers: { 'ARC-A': curRec('arc-a-r0', 'ARC-A') }, arcClaims: { 'ARC-A': { 'T-LIVE': claimRec('T-LIVE', 'CLAIMED', 'arc-a-r0', 'ARC-A') } } }, registry: { 'ARC-A': Object.assign(executingEntry('ARC-A', 'arc-a-r0'), { promotion: Object.assign(mkEntry('ARC-A').promotion, { rulingAt: fresh() }) }) } });
    proposed(s4e);
    const tliveBefore = sha256(fs.readFileSync(path.join(s4e.root, 'arc-claims', 'ARC-A', 'T-LIVE', 'claim.json')));
    check('S4e live CLAIMED claim in arc-claims/ARC-A against the ARC-A outgoing plan ⇒ P-V13 refusal at step 5; mutex released; pointer unchanged', (() => { const r = runSeq(s4e, { ARC: 'ARC-A' }, FULL); return r.status !== 0 && /REFUSED - resolver refused/.test(r.stdout) && /P-V13 REFUSED[^\n]*T-LIVE \(CLAIMED\)/.test(fs.readFileSync(path.join(s4e.scratch, 'resolve.txt'), 'utf8')) && mutexEmpty(s4e) && rdJson(path.join(s4e.root, 'plans', 'arcs', 'ARC-A', 'current.json')).planId === 'arc-a-r0'; })());
    check('S4e ... with --acknowledge-live-claims ⇒ published; manifest.carriedOverClaims records T-LIVE (CLAIMED, arc-a-r0); claim.json byte-unchanged', (() => { const r = runSeq(s4e, { ARC: 'ARC-A', ACK_LIVE: '1' }, FULL); if (r.status !== 0) { console.log('    ' + r.out.slice(-600)); return false; } const cur = rdJson(path.join(s4e.root, 'plans', 'arcs', 'ARC-A', 'current.json')); return cur.planId === 'arc-a-r1' && cur.supersedesPlanId === 'arc-a-r0' && JSON.stringify(cur.carriedOverClaims) === JSON.stringify([{ taskId: 'T-LIVE', planId: 'arc-a-r0', state: 'CLAIMED' }]) && sha256(fs.readFileSync(path.join(s4e.root, 'arc-claims', 'ARC-A', 'T-LIVE', 'claim.json'))) === tliveBefore && mutexEmpty(s4e); })());
    const s4f = mkRepo('refV19', { runtime: { arcClaims: { 'ARC-A': { 'LX-2': claimRec('LX-2', 'COMPLETE', 'arc-a-r0', 'ARC-B') } } }, registry: { 'ARC-A': mkEntry('ARC-A', { rulingAt: fresh() }) } });
    proposed(s4f);
    check('S4f arc-claims/ARC-A/LX-2 carrying arcId ARC-B ⇒ P-V19 refusal at step 5; released; no pointer', (() => { const r = runSeq(s4f, { ARC: 'ARC-A' }, FULL); return refusalOk(s4f, r, /REFUSED - resolver refused/) && /P-V19 REFUSED[^\n]*LX-2/.test(fs.readFileSync(path.join(s4f.scratch, 'resolve.txt'), 'utf8')); })());
    const s4g = mkRepo('refStale', { registry: { 'ARC-A': mkEntry('ARC-A', { rulingAt: stale() }) } });
    proposed(s4g);
    check('S4g promotion.rulingAt 10 days old ⇒ P-V17 STALE-READY refusal; released; nothing created', (() => { const r = runSeq(s4g, { ARC: 'ARC-A' }, FULL); return refusalOk(s4g, r, /REFUSED - resolver refused/) && /P-V17 REFUSED[^\n]*(STALE-READY|stale)/i.test(fs.readFileSync(path.join(s4g.scratch, 'resolve.txt'), 'utf8')) && !fs.existsSync(path.join(s4g.root, 'arc-claims', 'ARC-A')); })());
    check('S4g ... with --acknowledge-stale-promotion ⇒ published; the acknowledgement is durably recorded in the registry history note (manifest field set is B4-frozen)', (() => { const r = runSeq(s4g, { ARC: 'ARC-A', ACK_STALE_PROMO: '1' }, FULL); if (r.status !== 0) { console.log('    ' + r.out.slice(-600)); return false; } const a = rdJson(path.join(s4g.regDir, 'ARC-A', 'arc.json')); const last = a.history[a.history.length - 1]; return a.state === 'EXECUTING' && /acknowledge-stale-promotion/.test(last.note || '') && schemaOk('arc', a) && fs.existsSync(path.join(s4g.root, 'plans', 'arcs', 'ARC-A', 'current.json')); })());
    const s4h = mkRepo('refTriple', { registry: { 'ARC-A': mkEntry('ARC-A', { rulingAt: fresh() }) } });
    proposed(s4h);
    check('S4h manifest.arcId tampered between step 9 and step 10 ⇒ arcIdTriple MISMATCH, pointer NOT swapped, tmp removed, mutex released, snapshot left for owner disposition, registry untouched (no write-back)', (() => { const rb = treeHash(s4h.regDir); const r = runSeq(s4h, { ARC: 'ARC-A' }, FULL, { 'step9-rename': 'node -e \'const fs=require("fs");const f=process.argv[1];const m=JSON.parse(fs.readFileSync(f,"utf8"));m.arcId="ARC-B";fs.writeFileSync(f,JSON.stringify(m,null,2)+"\\n")\' "$ROOT/plans/$PLAN_ID/manifest.json"' }); const ptr = path.join(s4h.root, 'plans', 'arcs', 'ARC-A', 'current.json'); return r.status !== 0 && /arcIdTriple MISMATCH/.test(r.stdout) && /REFUSED - three-way/.test(r.stdout) && !fs.existsSync(ptr) && !fs.existsSync(ptr + '.tmp') && fs.existsSync(path.join(s4h.root, 'plans', 'arc-a-r1', 'plan.json')) && mutexEmpty(s4h) && treeHash(s4h.regDir) === rb; })());
    const s4i = mkRepo('refDrift', { registry: { 'ARC-A': mkEntry('ARC-A', { rulingAt: fresh() }) } });
    proposed(s4i);
    check('S4i registry write-back fails after the commit point ⇒ DRIFT reported, pointer NOT rolled back (arcId ARC-A live), registry not repaired, mutex released, exit 0', (() => { const r = runSeq(s4i, { ARC: 'ARC-A' }, FULL, { 'step10-pointer': 'printf "not json" > "$REPO/.ai-reports/arcs/ARC-A/arc.json"' }); const ptr = path.join(s4i.root, 'plans', 'arcs', 'ARC-A', 'current.json'); return r.status === 0 && /^DRIFT/m.test(marker(r.stdout, 'WRITEBACK') || '') && /DRIFT/.test(r.stdout) && fs.existsSync(ptr) && rdJson(ptr).arcId === 'ARC-A' && fs.readFileSync(path.join(s4i.regDir, 'ARC-A', 'arc.json'), 'utf8') === 'not json' && !fs.existsSync(path.join(s4i.regDir, 'ARC-A', 'arc.json.tmp')) && mutexEmpty(s4i); })());
    const s4j = mkRepo('refFile', { registry: { 'ARC-A': mkEntry('ARC-A', { rulingAt: fresh() }) } });
    proposed(s4j);
    fs.writeFileSync(path.join(s4j.root, 'arc-claims', 'ARC-A'), 'not a directory\n');
    check('S4j arc-claims/ARC-A exists as a FILE ⇒ step 9b refuses (EEXIST is ignored only for a directory; no blanket || true); mutex released; pointer not swapped', (() => { const r = runSeq(s4j, { ARC: 'ARC-A' }, FULL); return r.status !== 0 && /REFUSED - cannot create arc-claims\/ARC-A\//.test(r.stdout) && mutexEmpty(s4j) && !fs.existsSync(path.join(s4j.root, 'plans', 'arcs', 'ARC-A', 'current.json')) && fs.statSync(path.join(s4j.root, 'arc-claims', 'ARC-A')).isFile(); })());
    const s4k = mkRepo('refRef', { registry: { 'ARC-A': mkEntry('ARC-A', { rulingAt: fresh() }) } });
    proposed(s4k, { repoRef: 'f'.repeat(40) });
    check('S4k plan repoRef != HEAD ⇒ P-V10 refusal at step 6 with the mutex released; --allow-ref-mismatch ⇒ published with refMismatchAcknowledged true', (() => { const r = runSeq(s4k, { ARC: 'ARC-A' }, FULL); const a = refusalOk(s4k, r, /P-V10 REFUSED/); fs.rmSync(path.join(s4k.scratch, 'plan.json'), { force: true }); const r2 = runSeq(s4k, { ARC: 'ARC-A', ACK_REF: '1' }, FULL); const ptr = path.join(s4k.root, 'plans', 'arcs', 'ARC-A', 'current.json'); return a && r2.status === 0 && fs.existsSync(ptr) && rdJson(ptr).refMismatchAcknowledged === true; })());
    check('S4 every refusal after step 4 in the tagged blocks releases the mutex (each `exit 1` line carries release_if_held)', ['step5-resolve', 'step6-repo-ref', 'step7-post-confirm', 'step8-stage', 'step9b-container', 'step10-pointer'].every((op) => OPS[op].split('\n').filter((l) => /exit 1/.test(l)).every((l) => /release_if_held/.test(l))));

    // ── S5: --dry-run with --arc: every check, nothing written, no mutex ──
    const s5 = mkRepo('dry', { runtime: { legacyPointer: curRec('legacy-v3') }, registry: { 'ARC-A': mkEntry('ARC-A', { rulingAt: fresh() }) } });
    proposed(s5);
    check('S5 --dry-run --arc ARC-A: exit 0, resolver output in scratch carries arcId, runtime + registry tree hashes unchanged, mutex/ empty, no container, no pointer', (() => { const rb = treeHash(s5.root), gb = treeHash(s5.regDir); const r = runSeq(s5, { ARC: 'ARC-A', DRY_RUN: '1' }, DRY); return r.status === 0 && /DRY RUN/.test(r.stdout) && fs.existsSync(path.join(s5.scratch, 'plan.json')) && rdJson(path.join(s5.scratch, 'plan.json')).arcId === 'ARC-A' && treeHash(s5.root) === rb && treeHash(s5.regDir) === gb && mutexEmpty(s5); })());
  }

  // ── docs (run even when the library is absent: part of RED) ───────────────
  section('docs: SKILL.md / plan-validation.md / publish-protocol.md / templates / arc-registry SKILL.md');
  const doc = (k) => (exists(REL.docs[k]) ? stripCR(readText(REL.docs[k])) : '');
  const once = (t, re) => (t.match(re) || []).length === 1;
  const skill = doc('skill'), validation = doc('validation'), projection = doc('projection'), report = doc('report'), regSkill = doc('registrySkill');
  check('docs SKILL.md invocation carries --arc <ARC-ID> and --acknowledge-stale-promotion; the identity originates only from the literal; case variants refused, never normalized', /--arc <ARC-ID>/.test(skill) && /--acknowledge-stale-promotion/.test(skill) && /literal/.test(skill) && /never normalized|case variant/i.test(skill));
  check('docs SKILL.md names P-V16, P-V17, P-V19, P-V20, P-V18 RETIRED, CORE-STREAM refused as a runtime --arc, steps 9b + 10b, arcIdTriple, DRIFT, roots never created', ['P-V16', 'P-V17', 'P-V19', 'P-V20'].every((r) => skill.indexOf(r) !== -1) && /P-V18[^\n]*(RETIRED|retired)/.test(skill) && /CORE-STREAM/.test(skill) && /9b/.test(skill) && /10b/.test(skill) && /arcIdTriple/.test(skill) && /DRIFT/.test(skill) && /never creates? (the )?(runtime )?roots?|roots? (are|is) (an? )?owner[- ]bootstrap/i.test(skill));
  check('docs plan-validation.md has ## P-V16, ## P-V17, ## P-V19, ## P-V20 exactly once each and ## P-V21..P-V26 intact', ['16', '17', '19', '20', '21', '22', '23', '24', '25', '26'].every((n) => once(validation, new RegExp('^## P-V' + n + '\\b', 'gm'))));
  check('docs plan-validation.md: P-V18 RETIRED (number reserved, never reused); P-V16 ids unique within the plan only; P-V13 scoped to arc-claims/<ARC-ID>/ for an ARC; P-V17 READY/EXECUTING + promotion pins the source; P-V19 claimMatchesPath; P-V20 stream-aware', /P-V18[^\n]*(RETIRED|retired)/.test(validation) && /never reused/.test(validation) && /unique within the plan/i.test(validation) && /arc-claims\/<ARC-ID>\//.test(validation) && /READY[^\n]*EXECUTING|EXECUTING[^\n]*READY/.test(validation) && /claimMatchesPath/.test(validation) && /stream/.test(validation) && /--acknowledge-stale-promotion/.test(validation));
  check('docs publish-protocol.md: step 9b is `mkdir "$ROOT/arc-claims/$ARC"` (no mkdir -p command line, no blanket || true); EEXIST only via a directory test', /mkdir "\$ROOT\/arc-claims\/\$ARC"/.test(protocolText) && !/^\s*mkdir -p\b/m.test(protocolText) && !/\|\|\s*true\b/.test(protocolText) && /\[ -d "\$ROOT\/arc-claims\/\$ARC" \]/.test(protocolText));
  check('docs publish-protocol.md: the pointer is never rm-ed (only PTR_TMP); swap is `mv -f "$PTR_TMP" "$PTR"`; three-way arcIdTriple via runtime-identity.js BEFORE the swap; step 10b after step 10; write-back failure ⇒ DRIFT, pointer not rolled back', !/\brm\b[^\n]*"\$PTR"(?!_)/.test(protocolText) && !/\brm\b[^\n]*current\.json/.test(protocolText) && /mv -f "\$PTR_TMP" "\$PTR"/.test(protocolText) && /arcIdTriple/.test(protocolText) && /runtime-identity\.js/.test(protocolText) && protocolText.indexOf('arcIdTriple') < protocolText.indexOf('mv -f "$PTR_TMP" "$PTR"') && protocolText.indexOf('# @op step10-pointer') < protocolText.indexOf('# @op step10b-writeback') && /DRIFT/.test(protocolText) && /not rolled back|NOT rolled back|never roll/i.test(protocolText));
  check('docs publish-protocol.md: B1 anchors intact (main-worktree assert, REPO from $COMMON, resolver call, projectionHash, cp of the confirmed bytes, PLAN_HASH == PROJECTION_HASH, --dry-run section)', /\[ "\$\(git rev-parse --show-toplevel\)" = "\$REPO" \]/.test(protocolText) && /REPO="\$\(dirname "\$COMMON"\)"/.test(protocolText) && /cp "\$SCRATCH\/plan\.json" "\$STAGE\/plan\.json"/.test(protocolText) && /PLAN_HASH" = "\$PROJECTION_HASH/.test(protocolText) && /--dry-run/.test(protocolText) && /git rev-parse --path-format=absolute --git-common-dir/.test(protocolText));
  check('docs publish-protocol.md: ARC roots absent ⇒ REFUSE at step 1 (owner bootstrap, never created); holder carries arcId for an ARC; resolver receives --arc and --registry-root; nothing ever reads across claims/ and arc-claims/', /plans\/arcs[^\n]*arc-claims[^\n]*REFUSE|REFUSE[^\n]*(plans\/arcs|arc-claims)/i.test(protocolText) && /"arcId":"%s"/.test(protocolText) && /--arc "\$ARC"/.test(protocolText) && /--registry-root/.test(protocolText) && /CLAIMS="\$ROOT\/arc-claims\/\$ARC"/.test(protocolText) && /CLAIMS="\$ROOT\/claims"/.test(protocolText));
  check('docs plan-projection.md prints arc / pointer / claims root lines, P-V16 P-V17 P-V19 P-V20 (no P-V18 row), --acknowledge-stale-promotion, and the per-ARC pointer in the closing block', /arc\s+<ARC-ID>|arc\s+<ARC-ID \| none/.test(projection) && /claims root/.test(projection) && ['P-V16', 'P-V17', 'P-V19', 'P-V20'].every((r) => projection.indexOf(r) !== -1) && !/^P-V18\s+[a-z]/m.test(projection) && /--acknowledge-stale-promotion/.test(projection) && /plans\/arcs\/<ARC-ID>\/current\.json/.test(projection));
  check('docs publish-report.md prints `arc <ARC-ID> (plan.json · manifest.json · current.json)`, claims root, container, registry write-back (OK | DRIFT), P-V16/17/19/20 in the VALIDATION range', /arc\s+<ARC-ID>[^\n]*plan\.json[^\n]*manifest\.json[^\n]*current\.json/.test(report) && /claims root/.test(report) && /container/i.test(report) && /write-back/.test(report) && /DRIFT/.test(report) && /P-V16|P-V17/.test(report));
  check('docs arc-registry/SKILL.md references the publisher step-10b write-back (sole machine writer of execution{} + EXECUTING) and still never writes itself', /10b|write-back/.test(regSkill) && /arc-publish-plan/.test(regSkill) && /NEVER writes/.test(regSkill));

  // ── wiring + scope ─────────────────────────────────────────────────────────
  section('wiring + scope');
  check('wiring run-offline.js registers qa/arc_multi_arc_offline.js after qa/arc_registry_offline.js', (() => { const t = readText(REL.docs.runner); return /'qa\/arc_multi_arc_offline\.js'/.test(t) && t.indexOf("'qa/arc_registry_offline.js'") < t.indexOf("'qa/arc_multi_arc_offline.js'"); })());
  for (const f of REL.forbidden) {
    const head = gitShow(f);
    check('scope unchanged vs HEAD: ' + f, head !== null && exists(f) && sha256(stripCR(readText(f))) === sha256(head));
  }
  const ih = gitShow('index.html');
  const ihAuth = authorizedProductWrite('index.html', { root: ROOT });
  check('scope index.html: byte-identical to HEAD, or modified only under a live owner-AUTHORIZED ARC claim holding CODE:index-html whose plan pins repoRef==HEAD and lists index.html in scope.writes [' + ihAuth.reason + ']',
    (ih !== null && sha256(stripCR(readText('index.html'))) === sha256(ih)) || ihAuth.authorized === true);
} finally {
  cleanup();
}

section('closing proofs');
if (liveBefore !== null) {
  check('live runtime tree hash unchanged by this suite', treeHash(liveRuntime) === liveBefore);
  check('live runtime: all 12 LEGACY_BYTE_SET hashes unchanged', LEGACY_BYTE_SET.every((f, i) => (fs.existsSync(path.join(liveRuntime, f)) ? sha256(fs.readFileSync(path.join(liveRuntime, f))) : null) === legacyHashesBefore[i]));
  check('live runtime: this suite created no arc-claims/ or plans/arcs/ (owner bootstrap territory)', (fs.existsSync(path.join(liveRuntime, 'arc-claims')) === (liveBefore !== null && fs.existsSync(path.join(liveRuntime, 'arc-claims')))) && (() => { const h = treeHash(liveRuntime); return h === liveBefore; })());
}
if (registryBefore !== null) check('live registry .ai-reports/arcs tree hash unchanged by this suite (no write-back outside temp repos)', treeHash(liveRegistry) === registryBefore);
check('every temp tree removed', tempDirs.every((d) => !fs.existsSync(d)));

console.log('\n' + (failed === 0 ? 'ARC MULTI-ARC PUBLISHER (P-E, B5): PASS (' + total + ' asserts)' : 'ARC MULTI-ARC PUBLISHER (P-E, B5): FAIL (' + failed + ' of ' + total + ' asserts failed)'));
assert.strictEqual(failed, 0, failures.slice(0, 12).join(' | '));
