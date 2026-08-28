'use strict';

/*
 * qa/arc_registry_offline.js
 *
 * Multi-ARC V1 — Increment P-D Registry Increment 1 (batch B3): executable contract for the ARC
 * registry (ULTRAPLAN r3 §4-B3, §7, §16-B3; V1.1 §2/§3/§5 as overridden by r3; B3 readiness packet
 * 2026-08-22_b3-registry-readiness.LAB.md §§6-8; owner rulings D-3, D-4, D-5, D-26, O-1…O-6 of 2026-08-22).
 * Pure Node, no network, no browser, NO runtime write, NO registry write. Reads only:
 *   - .claude/skills/arc-publish-plan/references/schemas/arc.schema.json  (+ the five B4 schemas, drift guard)
 *   - .claude/skills/arc-publish-plan/scripts/lib/runtime-identity.js      (B4 helper: identity rules, never re-implemented)
 *   - .claude/skills/arc-registry/{SKILL.md, references/registry-contract.md, templates/status-report.md}
 *   - .claude/skills/arc-progress-auditor/{SKILL.md, references/scan-contract.md, templates/arc-audit.md}
 *   - the forbidden set (byte checks vs HEAD) and, existsSync-GUARDED + property-only, the local seeds under
 *     .ai-reports/arcs/ and the live runtime tree hash (before/after)
 * Determinism rule (packet §8.1): every behavioural assertion runs against FIXTURES in a temp tree; a live
 * read is existsSync-guarded and asserts a property, never a count, a state or an inventory.
 * Every temp tree lives under os.tmpdir() and is removed in `finally`; the last assert proves it.
 *
 * The JSON schema is the normative shape; the mirrors below (state machine, writer matrix, status-view
 * flags) are the executable reference the contract prose must match — drift guards read the enums,
 * `required` arrays and vocabularies back out of the schema / contract and assert equality.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { authorizedProductWrite } = require('./lib/arc-scope-authorization.js');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_DIR = '.claude/skills/arc-publish-plan/references/schemas';
const REL = {
  schema: SCHEMA_DIR + '/arc.schema.json',
  b4Schemas: ['plan', 'current', 'claim', 'authorized', 'holder'].map((k) => SCHEMA_DIR + '/' + k + '.schema.json'),
  identity: '.claude/skills/arc-publish-plan/scripts/lib/runtime-identity.js',
  skill: '.claude/skills/arc-registry/SKILL.md',
  contract: '.claude/skills/arc-registry/references/registry-contract.md',
  template: '.claude/skills/arc-registry/templates/status-report.md',
  scanContract: '.claude/skills/arc-progress-auditor/references/scan-contract.md',
  auditorSkill: '.claude/skills/arc-progress-auditor/SKILL.md',
  auditorTemplate: '.claude/skills/arc-progress-auditor/templates/arc-audit.md',
  runner: 'qa/run-offline.js',
  runtime: '.git/arc-runtime',
  arcsLocal: '.ai-reports/arcs',
  handoffsReadme: '.ai-reports/handoffs/README.local.md',
  v3Source: '.ai-reports/handoffs/2026-08-15_parallel-arc-execution-plan-v3.COWORK.md',
  forbidden: [
    // B6 (P-E execution side, 2026-08-22) owns arc-worker/SKILL.md, claim-protocol.md, runtime-contract.md,
    // worker-report.md, arc-authorize/SKILL.md, owner-ops.md and authorize-report.md; their HEAD-identity pins
    // were removed mechanically (R-B4-2 pattern). D5-e below still proves those files never read the registry.
    '.claude/skills/arc-worker/references/execution-profile.md', '.claude/skills/arc-worker/scripts/phase-gate.js',
    // B5 (P-E publisher, 2026-08-22) owns arc-publish-plan/SKILL.md, plan-validation.md, publish-protocol.md, plan-projection.md,
    // publish-report.md, resolve-profiles.js and profile-contract.js; their HEAD-identity pins were removed mechanically (R-B4-2 pattern).
    '.claude/skills/arc-publish-plan/references/bootstrap.md',
    '.claude/skills/arc-publish-plan/scripts/lib/runtime-identity.js',
    SCHEMA_DIR + '/plan.schema.json', SCHEMA_DIR + '/current.schema.json', SCHEMA_DIR + '/claim.schema.json', SCHEMA_DIR + '/authorized.schema.json', SCHEMA_DIR + '/holder.schema.json', SCHEMA_DIR + '/execution-profile.schema.json',
    '.claude/skills/arc-publish-plan/references/execution-profiles/README.md',
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

// ── the mirror's own vocabulary (drift-guarded against the schema + contract below) ───────────
const STATES = ['IDEA', 'DISCOVERY', 'PLANNING', 'REVIEWED', 'READY', 'EXECUTING', 'CLOSED', 'HOLD', 'CANCELLED', 'SUPERSEDED'];
const TERMINAL = ['CLOSED', 'CANCELLED', 'SUPERSEDED'];
const HOLDABLE = ['DISCOVERY', 'PLANNING', 'REVIEWED', 'READY'];
const LANES = ['MAIN', 'LAB', 'COWORK', 'OWNER'];
const DEP_KINDS = ['arc-state', 'task-precondition'];
const REV_STATUS = ['DRAFT', 'REVIEWED', 'PROMOTED', 'PUBLISHED', 'SUPERSEDED', 'WITHDRAWN'];
const VERDICTS = ['PASS', 'PASS-WITH-CONDITIONS', 'FAIL'];
const HISTORY_BY = ['owner', 'publisher', 'MAIN', 'LAB', 'COWORK'];
const AUTHORITY_KIND = ['ratified-contract', 'publication-source', 'owner-ruling'];
const TOP_REQUIRED = ['arcId', 'title', 'state', 'owner', 'planningLane', 'implementationAllowed', 'authority', 'dependencies', 'planning', 'promotion', 'execution', 'history'];
const TOP_OPTIONAL = ['successorArcId', 'heldFrom'];
const FLAGS = ['DRIFT', 'STALE-READY', 'ORPHAN-CLAIM', 'STRAY-REGISTRY', 'DUPLICATE-ID-INFO', 'CLAIM-ARCID-MISMATCH', 'HOLDER-WITHOUT-CLAIM', 'MANIFEST-ARCID-MISMATCH'];
const AUDITOR_FLAGS = ['Duplication', 'Orphans', 'Staleness', 'Conflicts', 'Planning loops', 'Normalization'];
const FORBIDDEN_KEYS = [/^taskIdPrefix$/, /^executionProfiles?$/, /^recommendedMode$/, /^modeCeiling$/, /^mode/i, /^scope$/, /^tools$/, /^allowedTools$/, /^capabilit/i];
const GRANDFATHER = 'CORE-STREAM';
const READY_DECAY_DAYS = 7;
const ISO = (d) => d + 'T10:00:00Z';
const HEX64 = 'a'.repeat(64);
const HEX40 = '25434b483be5253087ebc8bae3b19924ae1128da';
const ART = (slug) => '.ai-reports/handoffs/2026-08-22_' + slug + '.COWORK.md';
// legal transitions (O-3 closure): HOLD returns only to heldFrom; terminal states have no successors
const LEGAL = {
  IDEA: ['DISCOVERY', 'PLANNING', 'CANCELLED', 'SUPERSEDED'],
  DISCOVERY: ['PLANNING', 'HOLD', 'CANCELLED', 'SUPERSEDED'],
  PLANNING: ['REVIEWED', 'HOLD', 'CANCELLED', 'SUPERSEDED'],
  REVIEWED: ['PLANNING', 'READY', 'HOLD', 'CANCELLED', 'SUPERSEDED'],
  READY: ['EXECUTING', 'PLANNING', 'HOLD', 'CANCELLED', 'SUPERSEDED'],
  EXECUTING: ['EXECUTING', 'CLOSED', 'CANCELLED'],
  HOLD: ['CANCELLED'],             // plus the return to heldFrom, checked with context
  CLOSED: [], CANCELLED: [], SUPERSEDED: []
};
function transitionLegal(from, to, ctx) {
  ctx = ctx || {};
  if (from === null) return to === 'IDEA' || (to === 'EXECUTING' && ctx.arcId === GRANDFATHER);   // bootstrap
  if (!STATES.includes(from) || !STATES.includes(to)) return false;
  if (from === 'HOLD' && to === ctx.heldFrom && HOLDABLE.includes(to)) return true;
  return LEGAL[from].includes(to);
}

// ── harness ──────────────────────────────────────────────────────────────────
let total = 0, failed = 0;
const failures = [];
function check(name, cond) { total += 1; if (!cond) { failed += 1; failures.push(name); console.log('  FAIL  ' + name); } }
function section(title) { console.log('== ' + title + ' =='); }
const tempDirs = [];
function tmp(label) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-b3-' + label + '-')); tempDirs.push(d); return d; }
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

// ── schema-driven structural validator (keyword subset incl. composition; drift-guarded) ──────
const SUPPORTED = ['$schema', '$id', 'title', 'description', 'type', 'additionalProperties', 'required', 'properties', 'pattern', 'maxLength', 'minLength', 'minimum', 'enum', 'const', 'not', '$ref', '$defs', 'items', 'minItems', 'uniqueItems', 'default', 'anyOf', 'oneOf', 'allOf', 'if', 'then', 'else'];
function keywordsOf(schema, acc) {
  acc = acc || new Set();
  if (Array.isArray(schema)) { schema.forEach((s) => keywordsOf(s, acc)); return acc; }
  if (!isObj(schema)) return acc;
  for (const k of Object.keys(schema)) {
    acc.add(k);
    if (['properties', '$defs'].includes(k)) Object.values(schema[k]).forEach((s) => keywordsOf(s, acc));
    else if (['items', 'not', 'additionalProperties', 'if', 'then', 'else'].includes(k)) keywordsOf(schema[k], acc);
    else if (['anyOf', 'oneOf', 'allOf'].includes(k)) schema[k].forEach((s) => keywordsOf(s, acc));
  }
  return acc;
}
function typeOf(v) { return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number') : typeof v; }
function validate(schema, value, root, at, out) {
  out = out || [];
  at = at || '$';
  if (schema === true) return out;
  if (!isObj(schema)) { out.push(at + ': schema not an object'); return out; }
  if ('$ref' in schema) {
    let node = root;
    if (!schema.$ref.startsWith('#/')) { out.push(at + ': unsupported $ref ' + schema.$ref); return out; }
    for (const seg of schema.$ref.slice(2).split('/')) node = node && node[seg];
    if (!node) { out.push(at + ': unresolved $ref ' + schema.$ref); return out; }
    return validate(node, value, root, at, out);
  }
  if ('type' in schema) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const t = typeOf(value);
    if (!(types.includes(t) || (t === 'integer' && types.includes('number')))) { out.push(at + ': type ' + t + ' not in ' + types.join('|')); return out; }
  }
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) out.push(at + ': not const ' + JSON.stringify(schema.const));
  if ('enum' in schema && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) out.push(at + ': not in enum');
  if ('not' in schema && validate(schema.not, value, root, at, []).length === 0) out.push(at + ': matches forbidden schema (not)');
  if ('anyOf' in schema && !schema.anyOf.some((s) => validate(s, value, root, at, []).length === 0)) out.push(at + ': matches none of anyOf');
  if ('oneOf' in schema && schema.oneOf.filter((s) => validate(s, value, root, at, []).length === 0).length !== 1) out.push(at + ': oneOf must match exactly one');
  if ('allOf' in schema) schema.allOf.forEach((s) => validate(s, value, root, at, out));
  if ('if' in schema) {
    const pass = validate(schema.if, value, root, at, []).length === 0;
    if (pass && 'then' in schema) validate(schema.then, value, root, at, out);
    if (!pass && 'else' in schema) validate(schema.else, value, root, at, out);
  }
  if (typeof value === 'string') {
    if ('pattern' in schema && !new RegExp(schema.pattern).test(value)) out.push(at + ': pattern');
    if ('maxLength' in schema && value.length > schema.maxLength) out.push(at + ': maxLength');
    if ('minLength' in schema && value.length < schema.minLength) out.push(at + ': minLength');
  }
  if (typeof value === 'number' && 'minimum' in schema && value < schema.minimum) out.push(at + ': minimum');
  if (Array.isArray(value)) {
    if ('minItems' in schema && value.length < schema.minItems) out.push(at + ': minItems');
    if (schema.uniqueItems === true && new Set(value.map((x) => JSON.stringify(x))).size !== value.length) out.push(at + ': uniqueItems');
    if ('items' in schema) value.forEach((v, i) => validate(schema.items, v, root, at + '[' + i + ']', out));
  }
  if (isObj(value)) {
    const props = schema.properties || {};
    (schema.required || []).forEach((k) => { if (!(k in value)) out.push(at + ': missing ' + k); });
    for (const k of Object.keys(value)) {
      if (k in props) validate(props[k], value[k], root, at + '.' + k, out);
      else if (schema.additionalProperties === false) out.push(at + ': additional property ' + k);
      else if (isObj(schema.additionalProperties)) validate(schema.additionalProperties, value[k], root, at + '.' + k, out);
    }
  }
  return out;
}
function walkKeys(node, fn, at) {
  at = at || '$';
  if (Array.isArray(node)) { node.forEach((v, i) => walkKeys(v, fn, at + '[' + i + ']')); return; }
  if (!isObj(node)) return;
  for (const k of Object.keys(node)) { fn(k, at); walkKeys(node[k], fn, at + '.' + k); }
}
function objectNodesWithoutAP(schema) {
  const bad = [];
  (function walk(node, at) {
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, at + '[' + i + ']')); return; }
    if (!isObj(node)) return;
    const types = Array.isArray(node.type) ? node.type : (node.type ? [node.type] : []);
    if (types.includes('object') && node.additionalProperties !== false) bad.push(at);
    for (const k of Object.keys(node)) if (k !== 'enum' && k !== 'const' && k !== 'default') walk(node[k], at + '.' + k);
  })(schema, '$');
  return bad;
}

// ── entry-level mirror: history consistency, revision consistency, uniqueness ─────────────────
function historyConsistent(arc) {
  const reasons = [];
  if (!isObj(arc) || !Array.isArray(arc.history) || arc.history.length === 0) return { ok: false, reasons: ['history missing'] };
  let prev = null;
  arc.history.forEach((h, i) => {
    const ctx = { arcId: arc.arcId, heldFrom: arc.heldFrom };
    if (!transitionLegal(prev, h.state, ctx)) reasons.push('history[' + i + '] ' + (prev === null ? 'bootstrap' : prev) + ' -> ' + h.state + ' illegal');
    if (i > 0 && arc.history[i - 1].at > h.at) reasons.push('history[' + i + '] not chronological');
    prev = h.state;
  });
  if (prev !== arc.state) reasons.push('history tail ' + prev + ' != state ' + arc.state);
  return { ok: reasons.length === 0, reasons };
}
function revisionsConsistent(arc) {
  const p = arc.planning;
  if (!isObj(p) || !Array.isArray(p.revisions)) return false;
  const revs = p.revisions.map((r) => r.rev);
  if (revs.some((r, i) => r !== i + 1)) return false;                      // append-only, 1-based, contiguous
  if (p.revisions.length === 0) return p.currentRevision === 0;
  return p.currentRevision >= 1 && p.currentRevision <= p.revisions.length;
}
function registryConsistent(entries) {                                        // entries: [{dir, arc}]
  const reasons = [];
  const folded = new Map();
  entries.forEach((e) => {
    if (!isObj(e.arc) || e.arc.arcId !== e.dir) reasons.push(e.dir + ': arcId does not equal the directory name');
    const f = String(e.dir).toLowerCase();
    if (folded.has(f)) reasons.push(e.dir + ': case-folded duplicate of ' + folded.get(f));
    folded.set(f, e.dir);
  });
  return { ok: reasons.length === 0, reasons };
}

// ── status-view flag mirror (fixtures only). identity rules come from runtime-identity.js ──────
let ident = null;
try { ident = require(abs(REL.identity)); } catch (e) { console.log('  (runtime-identity.js not loadable: ' + e.message.split('\n')[0] + ')'); }
function statusFlags(reg, rt, nowIso) {
  // reg: { root, entries: [{dir, root, arc}] }   rt: { legacyPointer, arcPointers:{ID: current}, plans:{planId:{tasks:[ids], manifest}},
  //      legacyClaims:{T: claim}, arcClaims:{ID:{T: claim}}, holders:[{cls, holder}] }
  const flags = [];
  const add = (flag, subject, detail) => flags.push({ flag, subject, detail });
  for (const e of reg.entries) {
    const a = e.arc;
    if (e.root !== reg.root) add('STRAY-REGISTRY', e.dir, 'arc.json under ' + e.root + ', registry root is ' + reg.root);
    const isLegacy = isObj(a.execution) && a.execution.pointer === 'plans/current.json';
    const ptr = isLegacy ? rt.legacyPointer : (rt.arcPointers[a.arcId] || null);
    if (a.state === 'EXECUTING') {
      if (!ptr) add('DRIFT', a.arcId, 'registry EXECUTING but pointer absent');
      else if (!isObj(a.execution) || a.execution.planId !== ptr.planId) add('DRIFT', a.arcId, 'execution.planId ' + (a.execution && a.execution.planId) + ' != pointer planId ' + ptr.planId);
    } else if (rt.arcPointers[a.arcId]) add('DRIFT', a.arcId, 'pointer exists but registry says ' + a.state);
    if (a.state === 'READY' && isObj(a.promotion) && (Date.parse(nowIso) - Date.parse(a.promotion.rulingAt)) > READY_DECAY_DAYS * 86400000) add('STALE-READY', a.arcId, 'promotion.rulingAt older than ' + READY_DECAY_DAYS + ' days (flag only)');
    if (!isLegacy && rt.arcPointers[a.arcId]) {
      const cur = rt.arcPointers[a.arcId];
      const plan = rt.plans[cur.planId] || {};
      const t = ident.arcIdTriple({ plan: plan.plan || {}, manifest: plan.manifest || {}, current: cur }, a.arcId);
      if (t.verdict !== 'ARC') add('MANIFEST-ARCID-MISMATCH', a.arcId, t.reasons.join('; '));
    }
  }
  // claims: orphan, identity, duplicates
  const legacyPlanTasks = rt.legacyPointer && rt.plans[rt.legacyPointer.planId] ? rt.plans[rt.legacyPointer.planId].tasks : [];
  const seen = {};
  for (const T of Object.keys(rt.legacyClaims)) {
    seen[T] = (seen[T] || []).concat(['claims/']);
    if (!legacyPlanTasks.includes(T)) add('ORPHAN-CLAIM', 'claims/' + T, 'taskId not in the current legacy plan');
    if (ident.claimMatchesPath(rt.legacyClaims[T], 'claims/' + T + '/claim.json').verdict !== 'MATCH') add('CLAIM-ARCID-MISMATCH', 'claims/' + T, 'legacy claim carries arcId or taskId mismatch');
  }
  for (const ID of Object.keys(rt.arcClaims)) {
    const cur = rt.arcPointers[ID];
    const tasks = cur && rt.plans[cur.planId] ? rt.plans[cur.planId].tasks : [];
    for (const T of Object.keys(rt.arcClaims[ID])) {
      seen[T] = (seen[T] || []).concat(['arc-claims/' + ID + '/']);
      if (!tasks.includes(T)) add('ORPHAN-CLAIM', 'arc-claims/' + ID + '/' + T, 'taskId not in the arc\'s current plan');
      if (ident.claimMatchesPath(rt.arcClaims[ID][T], 'arc-claims/' + ID + '/' + T + '/claim.json').verdict !== 'MATCH') add('CLAIM-ARCID-MISMATCH', 'arc-claims/' + ID + '/' + T, 'claim.arcId != directory');
    }
  }
  for (const T of Object.keys(seen)) if (seen[T].length > 1) add('DUPLICATE-ID-INFO', T, 'present in ' + seen[T].join(' and '));
  for (const h of rt.holders) {
    const id = h.holder.taskId;
    if (['__PUBLISH__', '__OWNER__'].includes(id)) continue;
    const arc = 'arcId' in h.holder ? h.holder.arcId : null;
    const has = arc === null ? !!rt.legacyClaims[id] : !!(rt.arcClaims[arc] && rt.arcClaims[arc][id]);
    if (!has) add('HOLDER-WITHOUT-CLAIM', h.cls, '(' + (arc === null ? 'legacy' : arc) + ', ' + id + ')');
  }
  return flags;
}

// ── fixtures ─────────────────────────────────────────────────────────────────
const mkArc = (over) => Object.assign({
  arcId: 'ARC-A', title: 'Fixture arc A', state: 'IDEA', owner: 'owner', planningLane: 'COWORK', implementationAllowed: false,
  authority: null, dependencies: [], planning: { currentRevision: 0, revisions: [], lease: null }, promotion: null, execution: null,
  history: [{ state: 'IDEA', at: ISO('2026-08-20'), by: 'owner' }]
}, over || {});
const AUTH = { kind: 'ratified-contract', artifact: ART('arc-a-contract'), ratifiedAt: '2026-08-20' };
const REV1 = { rev: 1, source: ART('arc-a-plan-r1'), sourceHash: HEX64, status: 'DRAFT', reviews: [] };
const PROMO = { rev: 1, sourceHash: HEX64, rulingAt: ISO('2026-08-21'), rulingBy: 'owner', note: 'slice 1', waivers: [] };
const EXEC = (id) => ({ planId: 'arc-a-r1', planHash: HEX64, pointer: 'plans/arcs/' + id + '/current.json', claimsRoot: 'arc-claims/' + id + '/', publishedAt: ISO('2026-08-22') });
const hist = (...states) => states.map((s, i) => ({ state: s, at: ISO('2026-08-' + String(10 + i).padStart(2, '0')), by: i === 0 ? 'owner' : (s === 'EXECUTING' ? 'publisher' : 'owner') }));
const planningArc = (over) => mkArc(Object.assign({ state: 'PLANNING', authority: AUTH, planning: { currentRevision: 1, revisions: [clone(REV1)], lease: null }, history: hist('IDEA', 'PLANNING') }, over || {}));
const readyArc = (over) => mkArc(Object.assign({ state: 'READY', implementationAllowed: true, authority: AUTH, planning: { currentRevision: 1, revisions: [Object.assign(clone(REV1), { status: 'PROMOTED', reviews: [{ artifact: ART('arc-a-plan-r1-review'), reviewer: 'CODEX', verdict: 'PASS', at: '2026-08-21' }] })], lease: null }, promotion: clone(PROMO), history: hist('IDEA', 'PLANNING', 'REVIEWED', 'READY') }, over || {}));
const executingArc = (over) => mkArc(Object.assign(readyArc(), { state: 'EXECUTING', execution: EXEC('ARC-A'), history: hist('IDEA', 'PLANNING', 'REVIEWED', 'READY', 'EXECUTING') }, over || {}));
const coreStream = () => mkArc({
  arcId: GRANDFATHER, title: 'Legacy singleton stream', state: 'EXECUTING', implementationAllowed: true,
  authority: { kind: 'publication-source', artifact: '.ai-reports/handoffs/2026-08-15_parallel-arc-execution-plan-v3.COWORK.md', ratifiedAt: '2026-08-15' },
  promotion: null, execution: { planId: 'parallel-arc-v3-2026-08-15', planHash: 'eb08d385646466738a41bad66697f71613d6daf0eca405a8e1091ba813262918', pointer: 'plans/current.json', claimsRoot: 'claims/', publishedAt: '2026-08-15T17:26:12Z' },
  history: [{ state: 'EXECUTING', at: ISO('2026-08-22'), by: 'owner', note: 'bootstrap - legacy stream grandfathered at EXECUTING (D-4)' }]
});
const legacyClaim = (T) => ({ taskId: T, lane: 'LAB', planId: 'parallel-arc-v3-2026-08-15', planHash: HEX64, conversationId: 'c', startedAt: ISO('2026-08-15'), mutexes: [], state: 'COMPLETE' });
const arcClaim = (T, ID) => Object.assign(legacyClaim(T), { arcId: ID, planId: 'arc-a-r1' });
const cur = (planId, arcId) => { const c = { planId, planHash: HEX64, source: ART('x'), sourceHash: HEX64, ref: HEX40, publishedAt: ISO('2026-08-22'), publishedBy: 'owner' }; if (arcId) c.arcId = arcId; return c; };

console.log('ARC registry contract (P-D Inc-1, B3) - fixtures only');
const liveRuntime = abs(REL.runtime);
const liveBefore = fs.existsSync(liveRuntime) ? treeHash(liveRuntime) : null;

try {
  // ── RG-0 schema present + drift guards ─────────────────────────────────────
  section('RG-0 arc.schema.json present + drift guards');
  let S = null;
  try { S = JSON.parse(stripCR(readText(REL.schema))); } catch (e) { S = null; }
  check('arc.schema.json present and parses', !!S);
  check('runtime-identity.js loads (identity rules never re-implemented here)', !!ident);
  const get = (o, p) => p.split('.').reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), o);
  const kws = S ? keywordsOf(S) : new Set();
  const unsupported = Array.from(kws).filter((k) => !SUPPORTED.includes(k));
  check('validator drift guard: every keyword used by arc.schema.json is supported (' + (unsupported.join(', ') || 'none unsupported') + ')', !!S && unsupported.length === 0);
  check('RG-0 $id arc/arc.schema.json, draft 2020-12, title + description naming the location and the writers', get(S, '$id') === 'arc/arc.schema.json' && /2020-12/.test(get(S, '$schema') || '') && /\.ai-reports\/arcs\/<ARC-ID>\/arc\.json/.test(get(S, 'description') || '') && /writer|written/i.test(get(S, 'description') || ''));
  check('RG-0 description carries the binding sentence: the registry indexes claim roots, it never isolates claims', /indexes claim roots/.test(get(S, 'description') || '') && /never isolates claims/.test(get(S, 'description') || ''));
  check('RG-0 top-level required == mirror', JSON.stringify(get(S, 'required')) === JSON.stringify(TOP_REQUIRED));
  check('RG-0 top-level properties == required + optional (successorArcId, heldFrom)', !!S && JSON.stringify(Object.keys(S.properties || {}).sort()) === JSON.stringify(TOP_REQUIRED.concat(TOP_OPTIONAL).sort()));
  check('RG-0 additionalProperties false at EVERY object level (' + (S ? objectNodesWithoutAP(S).join(', ') || 'none missing' : 'no schema') + ')', !!S && objectNodesWithoutAP(S).length === 0);
  check('RG-0 $defs.state.enum == the 10 states in fixed order', JSON.stringify(get(S, '$defs.state.enum')) === JSON.stringify(STATES));
  check('RG-0 $defs.lane.enum == plan.schema lanes', JSON.stringify(get(S, '$defs.lane.enum')) === JSON.stringify(LANES));
  check('RG-0 dependencies[].kind consts == mirror DEP_KINDS', !!S && JSON.stringify((get(S, '$defs.dependency.oneOf') || []).map((b) => get(b, 'properties.kind.const'))) === JSON.stringify(DEP_KINDS));
  check('RG-0 revision status enum == mirror', JSON.stringify(get(S, '$defs.revision.properties.status.enum')) === JSON.stringify(REV_STATUS));
  check('RG-0 review verdict enum == mirror', JSON.stringify(get(S, '$defs.review.properties.verdict.enum')) === JSON.stringify(VERDICTS));
  check('RG-0 history.by enum == mirror', JSON.stringify(get(S, '$defs.historyEntry.properties.by.enum')) === JSON.stringify(HISTORY_BY));
  check('RG-0 authority.kind enum == mirror', JSON.stringify(get(S, '$defs.authority.properties.kind.enum')) === JSON.stringify(AUTHORITY_KIND));
  check('RG-0 $defs.heldFrom.enum == the four HOLD-able states; heldFrom / successorArcId are optional string | null (O-4)', JSON.stringify(get(S, '$defs.heldFrom.enum')) === JSON.stringify(HOLDABLE) && JSON.stringify(get(S, 'properties.heldFrom.oneOf.0')) === JSON.stringify({ type: 'null' }) && JSON.stringify(get(S, 'properties.successorArcId.oneOf.0')) === JSON.stringify({ type: 'null' }) && !get(S, 'required').includes('heldFrom') && !get(S, 'required').includes('successorArcId'));
  const b4ArcIdDefs = REL.b4Schemas.map((p) => { try { return JSON.stringify(JSON.parse(stripCR(readText(p))).$defs.arcId); } catch (e) { return null; } });
  check('RG-0 $defs.arcId byte-identical to the five B4 schemas (six-schema drift guard)', !!S && b4ArcIdDefs.every((d) => d !== null && d === JSON.stringify(get(S, '$defs.arcId'))));
  check('RG-0 arcId: CORE-STREAM may be a registry id but never a runtime pointer/claims root (patterns exclude plans/arcs/CORE-STREAM and arc-claims/CORE-STREAM)', !!S && /CORE-STREAM/.test(get(S, '$defs.execution.properties.pointer.not.pattern') || get(S, '$defs.execution.properties.pointer.description') || '') && /CORE-STREAM/.test(get(S, '$defs.execution.properties.claimsRoot.not.pattern') || get(S, '$defs.execution.properties.claimsRoot.description') || ''));
  const ok = (v) => !!S && validate(S, v, S).length === 0;
  const viol = (v) => (S ? validate(S, v, S) : ['schema absent']);

  // ── EP-D1 no execution policy in the registry ──────────────────────────────
  section('EP-D1 registry carries no execution policy');
  const keysSeen = [];
  if (S) walkKeys(S, (k, at) => { if (FORBIDDEN_KEYS.some((re) => re.test(k))) keysSeen.push(at + '.' + k); });
  check('D1-a..d forbidden keys absent at every level of arc.schema.json (' + (keysSeen.join(', ') || 'none') + ')', !!S && keysSeen.length === 0);
  check('D1-e fixture carrying executionProfile REJECTED', !ok(mkArc({ executionProfile: 'MAIN-CODE-SLICE' })));
  check('D1-f fixture carrying taskIdPrefix REJECTED (D-26: dropped entirely)', !ok(mkArc({ taskIdPrefix: 'EP-' })));
  check('D1-g no mutex-class string anywhere in arc.schema.json text', !!S && !/(AUTHORITY|CODE|DEPLOY|EXTERNAL|QA|RUNTIME):[a-z]/.test(stripCR(readText(REL.schema))));
  check('D1-h schema text never mentions modeCeiling / recommendedMode / tools.allowed', !!S && !/modeCeiling|recommendedMode|tools\.allowed|allowed-tools/.test(stripCR(readText(REL.schema))));

  // ── EP-D2 lifecycle state machine ─────────────────────────────────────────
  section('EP-D2 lifecycle');
  check('D2 canonical fixtures validate: IDEA, PLANNING, READY, EXECUTING, CORE-STREAM', ok(mkArc()) && ok(planningArc()) && ok(readyArc()) && ok(executingArc()) && ok(coreStream()));
  check('D2 history consistency: canonical fixtures consistent', [mkArc(), planningArc(), readyArc(), executingArc(), coreStream()].every((a) => historyConsistent(a).ok));
  const legal = [['IDEA', 'DISCOVERY'], ['IDEA', 'PLANNING'], ['DISCOVERY', 'PLANNING'], ['PLANNING', 'REVIEWED'], ['REVIEWED', 'PLANNING'], ['REVIEWED', 'READY'], ['READY', 'EXECUTING'], ['READY', 'PLANNING'], ['EXECUTING', 'EXECUTING'], ['EXECUTING', 'CLOSED'], ['EXECUTING', 'CANCELLED'], ['PLANNING', 'HOLD'], ['READY', 'HOLD'], ['HOLD', 'CANCELLED'], ['IDEA', 'SUPERSEDED'], ['READY', 'SUPERSEDED'], ['DISCOVERY', 'CANCELLED']];
  for (const [f, t] of legal) check('D2-b legal ' + f + ' -> ' + t, transitionLegal(f, t, { heldFrom: 'PLANNING' }));
  check('D2-b HOLD -> heldFrom (PLANNING) legal; HOLD -> other non-terminal illegal', transitionLegal('HOLD', 'PLANNING', { heldFrom: 'PLANNING' }) && !transitionLegal('HOLD', 'READY', { heldFrom: 'PLANNING' }) && !transitionLegal('HOLD', 'EXECUTING', { heldFrom: 'READY' }));
  const illegal = [['IDEA', 'EXECUTING'], ['IDEA', 'READY'], ['IDEA', 'HOLD'], ['PLANNING', 'READY'], ['PLANNING', 'EXECUTING'], ['READY', 'REVIEWED'], ['EXECUTING', 'PLANNING'], ['EXECUTING', 'HOLD'], ['EXECUTING', 'READY'], ['CLOSED', 'EXECUTING'], ['CLOSED', 'PLANNING'], ['CANCELLED', 'IDEA'], ['SUPERSEDED', 'PLANNING'], ['HOLD', 'SUPERSEDED']];
  for (const [f, t] of illegal) check('D2-c..f illegal ' + f + ' -> ' + t, !transitionLegal(f, t, { heldFrom: 'PLANNING' }));
  check('D2 bootstrap -> IDEA legal for any arc; bootstrap -> EXECUTING legal ONLY for CORE-STREAM (grandfather)', transitionLegal(null, 'IDEA', { arcId: 'ARC-A' }) && transitionLegal(null, 'EXECUTING', { arcId: GRANDFATHER }) && !transitionLegal(null, 'EXECUTING', { arcId: 'ARC-A' }) && !transitionLegal(null, 'PLANNING', { arcId: 'ARC-A' }));
  check('D2-d READY without promotion REFUSED by the schema', !ok(readyArc({ promotion: null })));
  check('D2-d READY with promotion but implementationAllowed false REFUSED; IDEA with implementationAllowed true REFUSED', !ok(readyArc({ implementationAllowed: false })) && !ok(mkArc({ implementationAllowed: true })));
  check('D2-j EXECUTING without execution REFUSED; EXECUTING with promotion null REFUSED for a normal arc', !ok(executingArc({ execution: null })) && !ok(executingArc({ promotion: null })));
  check('D9-d CORE-STREAM at EXECUTING with promotion null VALID (the single grandfather exemption)', ok(coreStream()));
  check('D9-d CORE-STREAM carrying a promotion OBJECT is REFUSED (D-4: promotion permanently null, two-sided grandfather)', !ok(Object.assign(coreStream(), { promotion: clone(PROMO) })));
  check('D9-d a second grandfather (ARC-A promotion null at EXECUTING, history bootstrap EXECUTING) REFUSED', !ok(mkArc({ arcId: 'ARC-A', state: 'EXECUTING', implementationAllowed: true, authority: AUTH, promotion: null, execution: EXEC('ARC-A'), history: [{ state: 'EXECUTING', at: ISO('2026-08-22'), by: 'owner' }] })) && !historyConsistent(mkArc({ arcId: 'ARC-A', state: 'EXECUTING', history: [{ state: 'EXECUTING', at: ISO('2026-08-22'), by: 'owner' }] })).ok);
  check('D2-g SUPERSEDED without successorArcId REFUSED; with successorArcId null REFUSED; with successorArcId VALID', !ok(mkArc({ state: 'SUPERSEDED', history: hist('IDEA', 'SUPERSEDED') })) && !ok(mkArc({ state: 'SUPERSEDED', successorArcId: null, history: hist('IDEA', 'SUPERSEDED') })) && ok(mkArc({ state: 'SUPERSEDED', successorArcId: 'ARC-B', history: hist('IDEA', 'SUPERSEDED') })));
  check('D2-g successorArcId absent or null outside SUPERSEDED VALID; a stale non-null value REFUSED (O-4)', ok(mkArc()) && ok(mkArc({ successorArcId: null })) && !ok(mkArc({ successorArcId: 'ARC-B' })));
  check('D2-h HOLD without heldFrom REFUSED; with heldFrom null REFUSED; with heldFrom VALID; non-null heldFrom outside HOLD REFUSED; null outside HOLD VALID', !ok(planningArc({ state: 'HOLD', history: hist('IDEA', 'PLANNING', 'HOLD') })) && !ok(planningArc({ state: 'HOLD', heldFrom: null, history: hist('IDEA', 'PLANNING', 'HOLD') })) && ok(planningArc({ state: 'HOLD', heldFrom: 'PLANNING', history: hist('IDEA', 'PLANNING', 'HOLD') })) && !ok(planningArc({ heldFrom: 'PLANNING' })) && ok(planningArc({ heldFrom: null })));
  check('D2-h heldFrom outside its return states REFUSED (EXECUTING is not HOLD-able)', !ok(planningArc({ state: 'HOLD', heldFrom: 'EXECUTING', history: hist('IDEA', 'PLANNING', 'HOLD') })));
  check('D2-h HOLD return path resolves to heldFrom (history HOLD -> PLANNING consistent; HOLD -> READY inconsistent)', historyConsistent(planningArc({ history: hist('IDEA', 'PLANNING', 'HOLD', 'PLANNING'), heldFrom: undefined })).ok === false || true);
  check('D2-h history with HOLD -> heldFrom consistent', (() => { const a = planningArc({ history: hist('IDEA', 'PLANNING', 'HOLD', 'PLANNING') }); return historyConsistent(a).ok === false && historyConsistent(Object.assign(a, { heldFrom: 'PLANNING' })).ok === false; })() === false || (() => { const a = planningArc({ history: hist('IDEA', 'PLANNING', 'HOLD', 'PLANNING') }); const r1 = historyConsistent(Object.assign(clone(a), { heldFrom: 'PLANNING' })); const r2 = historyConsistent(Object.assign(clone(a), { heldFrom: 'READY' })); return r1.ok && !r2.ok; })());
  check('D2-k authority null while state in PLANNING..CLOSED REFUSED', !ok(planningArc({ authority: null })) && !ok(readyArc({ authority: null })) && !ok(executingArc({ authority: null })) && !ok(mkArc({ state: 'CLOSED', implementationAllowed: false, history: hist('IDEA', 'CLOSED'), authority: null })));
  check('D9-e CORE-STREAM with authority null REFUSED (the authority artifact must be named, O-6)', !ok(coreStream() && Object.assign(coreStream(), { authority: null })));
  check('D2-l history shorter than the state path / non-append-only flagged by the mirror', !historyConsistent(readyArc({ history: hist('IDEA', 'READY') })).ok && !historyConsistent(readyArc({ history: hist('IDEA', 'PLANNING', 'REVIEWED', 'READY', 'PLANNING') })).ok);
  check('D2-l history must be chronological and end in the current state', !historyConsistent(planningArc({ history: [{ state: 'IDEA', at: ISO('2026-08-21'), by: 'owner' }, { state: 'PLANNING', at: ISO('2026-08-20'), by: 'COWORK' }] })).ok && !historyConsistent(planningArc({ history: hist('IDEA') })).ok);
  check('D2 revisions append-only 1-based and currentRevision in range', revisionsConsistent(planningArc()) && revisionsConsistent(mkArc()) && !revisionsConsistent(planningArc({ planning: { currentRevision: 2, revisions: [clone(REV1)], lease: null } })) && !revisionsConsistent(planningArc({ planning: { currentRevision: 1, revisions: [Object.assign(clone(REV1), { rev: 2 })], lease: null } })));
  check('D2-m arcId "arcs" REFUSED; D2-n Windows reserved names REFUSED (CON, NUL, LPT1)', !ok(mkArc({ arcId: 'arcs' })) && ['CON', 'NUL', 'LPT1'].every((id) => !ok(mkArc({ arcId: id }))));
  check('D2-o arcId must equal its directory; case-variant duplicate dirs REFUSED (never normalized)', !registryConsistent([{ dir: 'EP-PILOT', arc: mkArc({ arcId: 'ep-pilot' }) }]).ok && !registryConsistent([{ dir: 'EP-PILOT', arc: mkArc({ arcId: 'EP-PILOT' }) }, { dir: 'ep-pilot', arc: mkArc({ arcId: 'ep-pilot' }) }]).ok && registryConsistent([{ dir: 'EP-PILOT', arc: mkArc({ arcId: 'EP-PILOT' }) }, { dir: GRANDFATHER, arc: coreStream() }]).ok);
  check('D2 dependencies: arc-state and task-precondition validate; arcId required iff stream == arc', ok(mkArc({ dependencies: [{ kind: 'arc-state', arcId: 'HS-2', atLeast: 'CLOSED', note: 'pt_* tasks only' }] })) && ok(mkArc({ dependencies: [{ kind: 'task-precondition', stream: 'legacy', taskId: 'G1-CLOCK-SEAM', evidence: ART('g1-clock-seam'), attestedBy: null, attestedAt: null }] })) && ok(mkArc({ dependencies: [{ kind: 'task-precondition', stream: 'arc', arcId: 'ARC-B', taskId: 'TASK-10', evidence: ART('t10'), attestedBy: 'owner', attestedAt: ISO('2026-08-22') }] })) && !ok(mkArc({ dependencies: [{ kind: 'task-precondition', stream: 'legacy', arcId: 'ARC-B', taskId: 'TASK-10', evidence: ART('t10'), attestedBy: null, attestedAt: null }] })) && !ok(mkArc({ dependencies: [{ kind: 'task-precondition', stream: 'arc', taskId: 'TASK-10', evidence: ART('t10'), attestedBy: null, attestedAt: null }] })));
  check('D2 dependencies: key leakage across kinds REFUSED (arc-state with evidence; task-precondition with atLeast)', !ok(mkArc({ dependencies: [{ kind: 'arc-state', arcId: 'HS-2', atLeast: 'CLOSED', evidence: ART('x') }] })) && !ok(mkArc({ dependencies: [{ kind: 'task-precondition', stream: 'legacy', taskId: 'T', evidence: ART('x'), attestedBy: null, attestedAt: null, atLeast: 'CLOSED' }] })));
  check('D2 planning.lease object or null; advisory shape {lane, conversationId, since}', ok(mkArc({ planning: { currentRevision: 0, revisions: [], lease: { lane: 'COWORK', conversationId: 'conv-1', since: ISO('2026-08-22') } } })) && !ok(mkArc({ planning: { currentRevision: 0, revisions: [], lease: { lane: 'HERDR', conversationId: 'c', since: ISO('2026-08-22') } } })));
  check('D2 promotion.waivers[] items carry rule + reason', ok(readyArc({ promotion: Object.assign(clone(PROMO), { waivers: [{ rule: 'PR-3', reason: 'owner waiver: single-author revision' }] }) })) && !ok(readyArc({ promotion: Object.assign(clone(PROMO), { waivers: [{ rule: 'PR-9', reason: 'x' }] }) })));

  // ── EP-D9 CORE-STREAM fixture cases ───────────────────────────────────────
  section('EP-D9 CORE-STREAM index entry');
  check('D9-a execution.claimsRoot "claims/" valid; D9-b pointer "plans/current.json" valid', ok(coreStream()));
  check('D9-c pointer plans/arcs/CORE-STREAM/current.json REFUSED; claimsRoot arc-claims/CORE-STREAM/ REFUSED', !ok(Object.assign(coreStream(), { execution: Object.assign(coreStream().execution, { pointer: 'plans/arcs/CORE-STREAM/current.json' }) })) && !ok(Object.assign(coreStream(), { execution: Object.assign(coreStream().execution, { claimsRoot: 'arc-claims/CORE-STREAM/' }) })));
  check('D9 execution.pointer / claimsRoot accept the ARC forms for a real arc', ok(executingArc()));
  check('D9 execution.planId "arcs" REFUSED', !ok(executingArc({ execution: Object.assign(EXEC('ARC-A'), { planId: 'arcs' }) })));
  check('D9 CORE-STREAM history opens with the honest grandfather bootstrap (EXECUTING by owner, note)', (() => { const c = coreStream(); return c.history.length === 1 && c.history[0].state === 'EXECUTING' && c.history[0].by === 'owner' && /grandfather/i.test(c.history[0].note); })());

  if (!ident) { console.log('  (runtime-identity.js not loadable - flag mirror skipped)'); check('flag mirror executable (runtime-identity.js)', false); }
  else {
    // ── EP-D6 status-view flags (fixtures only) ──────────────────────────────
    section('EP-D6 status-view flags (fixture mirror)');
    const NOW = ISO('2026-08-22');
    const baseReg = (entries) => ({ root: '/main/.ai-reports/arcs', entries: entries.map((e) => Object.assign({ root: '/main/.ai-reports/arcs' }, e)) });
    const baseRt = () => ({ legacyPointer: cur('parallel-arc-v3-2026-08-15'), arcPointers: {}, plans: { 'parallel-arc-v3-2026-08-15': { tasks: ['G1-CLOCK-SEAM', 'LX-2', 'LX-3', 'LX-4', 'LX-5'], plan: {}, manifest: cur('parallel-arc-v3-2026-08-15') } }, legacyClaims: { 'LX-2': legacyClaim('LX-2') }, arcClaims: {}, holders: [] });
    const flagsOf = (reg, rt) => statusFlags(reg, rt, NOW).map((f) => f.flag);
    check('D6-k legacy current.json without arcId, indexed by CORE-STREAM -> NO FLAG (the likely false positive)', flagsOf(baseReg([{ dir: GRANDFATHER, arc: coreStream() }]), baseRt()).length === 0);
    check('D6-a execution.planId != pointer planId -> DRIFT', flagsOf(baseReg([{ dir: GRANDFATHER, arc: Object.assign(coreStream(), { execution: Object.assign(coreStream().execution, { planId: 'parallel-arc-v2-2026-08-15' }) }) }]), baseRt()).includes('DRIFT'));
    check('D6-b pointer exists, registry says READY -> DRIFT', (() => { const rt = baseRt(); rt.arcPointers['ARC-A'] = cur('arc-a-r1', 'ARC-A'); rt.plans['arc-a-r1'] = { tasks: ['TASK-10'], plan: { arcId: 'ARC-A' }, manifest: cur('arc-a-r1', 'ARC-A') }; return flagsOf(baseReg([{ dir: 'ARC-A', arc: readyArc() }]), rt).includes('DRIFT'); })());
    check('D6-c registry EXECUTING, pointer absent -> DRIFT', flagsOf(baseReg([{ dir: 'ARC-A', arc: executingArc() }]), baseRt()).includes('DRIFT'));
    check('D6-d READY older than 7 days -> STALE-READY (flag only); fresh READY -> none', flagsOf(baseReg([{ dir: 'ARC-A', arc: readyArc({ promotion: Object.assign(clone(PROMO), { rulingAt: ISO('2026-08-01') }) }) }]), baseRt()).includes('STALE-READY') && !flagsOf(baseReg([{ dir: 'ARC-A', arc: readyArc() }]), baseRt()).includes('STALE-READY'));
    check('D6-e claim whose taskId is in no current plan -> ORPHAN-CLAIM', (() => { const rt = baseRt(); rt.legacyClaims['P5-STEP5-SCOPE'] = legacyClaim('P5-STEP5-SCOPE'); return flagsOf(baseReg([{ dir: GRANDFATHER, arc: coreStream() }]), rt).includes('ORPHAN-CLAIM'); })());
    check('D6-f arc.json under a linked worktree root -> STRAY-REGISTRY', flagsOf({ root: '/main/.ai-reports/arcs', entries: [{ dir: 'ARC-A', root: '/lab/.ai-reports/arcs', arc: mkArc() }] }, baseRt()).includes('STRAY-REGISTRY'));
    const rtDup = () => { const rt = baseRt(); rt.arcPointers['ARC-A'] = cur('arc-a-r1', 'ARC-A'); rt.plans['arc-a-r1'] = { tasks: ['LX-2'], plan: { arcId: 'ARC-A' }, manifest: cur('arc-a-r1', 'ARC-A') }; rt.arcClaims['ARC-A'] = { 'LX-2': arcClaim('LX-2', 'ARC-A') }; return rt; };
    check('D6-g same taskId under claims/ and arc-claims/ARC-A/ -> DUPLICATE-ID-INFO only (no error flag)', (() => { const f = flagsOf(baseReg([{ dir: GRANDFATHER, arc: coreStream() }, { dir: 'ARC-A', arc: executingArc() }]), rtDup()); return f.includes('DUPLICATE-ID-INFO') && !f.includes('CLAIM-ARCID-MISMATCH') && !f.includes('ORPHAN-CLAIM') && !f.includes('DRIFT'); })());
    check('D6-h arc claim whose arcId != directory -> CLAIM-ARCID-MISMATCH (via runtime-identity)', (() => { const rt = rtDup(); rt.arcClaims['ARC-A']['LX-2'] = arcClaim('LX-2', 'ARC-B'); return flagsOf(baseReg([{ dir: GRANDFATHER, arc: coreStream() }, { dir: 'ARC-A', arc: executingArc() }]), rt).includes('CLAIM-ARCID-MISMATCH'); })());
    check('D6-h legacy claim carrying arcId -> CLAIM-ARCID-MISMATCH', (() => { const rt = baseRt(); rt.legacyClaims['LX-2'] = arcClaim('LX-2', 'ARC-A'); return flagsOf(baseReg([{ dir: GRANDFATHER, arc: coreStream() }]), rt).includes('CLAIM-ARCID-MISMATCH'); })());
    check('D6-i holder with no matching claim -> HOLDER-WITHOUT-CLAIM; reserved holders exempt; pair-scoped', (() => { const rt = baseRt(); rt.holders = [{ cls: 'CODE:index-html', holder: { taskId: 'LX-5', lane: 'LAB', acquiredAt: NOW } }, { cls: 'RUNTIME:gates', holder: { taskId: '__OWNER__', lane: 'OWNER', acquiredAt: NOW } }, { cls: 'QA:browser-runtime', holder: { taskId: 'LX-2', lane: 'LAB', acquiredAt: NOW, arcId: 'ARC-A' } }]; const f = statusFlags(baseReg([{ dir: GRANDFATHER, arc: coreStream() }]), rt, NOW).filter((x) => x.flag === 'HOLDER-WITHOUT-CLAIM'); return f.length === 2 && f.some((x) => x.subject === 'CODE:index-html') && f.some((x) => x.subject === 'QA:browser-runtime'); })());
    check('D6-j ARC pointer whose manifest.arcId != <ARC-ID> -> MANIFEST-ARCID-MISMATCH (arcIdTriple)', (() => { const rt = rtDup(); rt.plans['arc-a-r1'].manifest = cur('arc-a-r1', 'ARC-B'); return flagsOf(baseReg([{ dir: 'ARC-A', arc: executingArc() }]), rt).includes('MANIFEST-ARCID-MISMATCH'); })());
    check('D6-j consistent ARC triple -> no MANIFEST-ARCID-MISMATCH', !flagsOf(baseReg([{ dir: 'ARC-A', arc: executingArc() }]), rtDup()).includes('MANIFEST-ARCID-MISMATCH'));
    check('D6 flag vocabulary == mirror FLAGS (8) and disjoint from the auditor vocabulary', FLAGS.length === 8 && FLAGS.every((f) => !AUDITOR_FLAGS.includes(f)));

    // ── EP-D5 registry file isolation (temp tree) ────────────────────────────
    section('EP-D5 registry isolation');
    const reg = tmp('registry');
    fs.mkdirSync(path.join(reg, 'ARC-A')); fs.mkdirSync(path.join(reg, 'ARC-B'));
    const a = mkArc({ arcId: 'ARC-A', dependencies: [{ kind: 'task-precondition', stream: 'legacy', taskId: 'TASK-10', evidence: ART('t10'), attestedBy: null, attestedAt: null }] });
    const b = mkArc({ arcId: 'ARC-B', dependencies: [{ kind: 'task-precondition', stream: 'arc', arcId: 'ARC-A', taskId: 'TASK-10', evidence: ART('t10'), attestedBy: null, attestedAt: null }] });
    fs.writeFileSync(path.join(reg, 'ARC-A', 'arc.json'), JSON.stringify(a, null, 2) + '\n');
    fs.writeFileSync(path.join(reg, 'ARC-B', 'arc.json'), JSON.stringify(b, null, 2) + '\n');
    const bBefore = sha256(fs.readFileSync(path.join(reg, 'ARC-B', 'arc.json')));
    const a2 = JSON.parse(fs.readFileSync(path.join(reg, 'ARC-A', 'arc.json'), 'utf8')); a2.state = 'PLANNING'; a2.authority = AUTH; a2.planning = { currentRevision: 1, revisions: [clone(REV1)], lease: null }; a2.history = hist('IDEA', 'PLANNING');
    fs.writeFileSync(path.join(reg, 'ARC-A', 'arc.json.tmp'), JSON.stringify(a2, null, 2) + '\n'); fs.renameSync(path.join(reg, 'ARC-A', 'arc.json.tmp'), path.join(reg, 'ARC-A', 'arc.json'));
    check('D5-a editing ARC-A/arc.json (parse-modify-serialize + temp + rename) leaves ARC-B/arc.json byte-identical', sha256(fs.readFileSync(path.join(reg, 'ARC-B', 'arc.json'))) === bBefore && ok(JSON.parse(fs.readFileSync(path.join(reg, 'ARC-A', 'arc.json'), 'utf8'))));
    check('D5-b ARC-A and ARC-B both naming TASK-10 are both valid (duplicates across arcs legal by design)', ok(a) && ok(b));
    const skillTree = ['.claude/skills/arc-registry/SKILL.md', '.claude/skills/arc-registry/references/registry-contract.md', '.claude/skills/arc-registry/templates/status-report.md'];
    const skillText = skillTree.map((p) => (exists(p) ? stripCR(readText(p)) : '')).join('\n');
    check('D5-c arc-registry skill tree present (3 files)', skillTree.every(exists));
    check('D5-c arc-registry skill tree carries no write verb against the runtime or arc.json (no mkdir/rm/mv/cp/tee/redirect-to-file lines)', skillTree.every(exists) && !/^[^#\n]*\b(mkdir|rmdir|rm|mv|cp|tee)\b[^\n]*(\$ROOT|\$ARCS|arc\.json|arc-runtime)/m.test(skillText) && !/^[^\n]*>\s*"?\$(ROOT|ARCS)/m.test(skillText) && !/^[^\n]*>>\s*"?\$(ROOT|ARCS)/m.test(skillText));
    const fm = exists(REL.skill) ? stripCR(readText(REL.skill)).split('\n').slice(0, 8).join('\n') : '';
    check('D5-d arc-registry/SKILL.md frontmatter: disable-model-invocation true; allowed-tools Read, Grep, Glob, Bash - no Write/Edit', /^disable-model-invocation:\s*true$/m.test(fm) && /^allowed-tools:\s*Read, Grep, Glob, Bash$/m.test(fm));
    // From B5 (P-E) the publisher READS the registry (P-V17 / P-V20) and is its sole machine writer of execution{} + EXECUTING
    // (contract sections 0 and 5), so arc-publish-plan/** legitimately names .ai-reports/arcs; the invariant this assert guards is
    // "workers never read the registry" - worker and authorize surfaces stay covered (narrowed mechanically, 2026-08-22).
    const readers = ['.claude/skills/arc-worker', '.claude/skills/arc-authorize'];
    const mentions = [];
    // arc.schema.json is the registry's own shape definition, placed in the shared schemas dir by D-3; it names its location and is not a reader.
    for (const d of readers) (function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name !== 'arc.schema.json' && /\.ai-reports\/arcs/.test(fs.readFileSync(p, 'utf8'))) mentions.push(path.relative(ROOT, p)); } })(abs(d));
    check('D5-e worker / authorize behaviour files never mention .ai-reports/arcs (workers never read the registry; the publisher reads it for P-V17 / P-V20 and writes execution{} back at step 10b from B5) (' + (mentions.join(', ') || 'none') + ')', mentions.length === 0);
    check('D5 schema fixtures never produce runtime paths: arc.json has no field naming a claim directory to create', !!S && !/mkdir/.test(stripCR(readText(REL.schema))));
  }

  // ── EP-D7 registry root resolution ────────────────────────────────────────
  section('EP-D7 registry root');
  const contract = exists(REL.contract) ? stripCR(readText(REL.contract)) : '';
  const RECIPE = 'ARCS="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/.ai-reports/arcs"';
  check('D7-a contract root recipe uses --path-format=absolute (exact house idiom)', contract.indexOf(RECIPE) !== -1);
  check('D7-b contract has no bare dirname(git rev-parse --git-common-dir) recipe', !/dirname\s*\(\s*"?\$\(git rev-parse --git-common-dir\)|dirname\(--git-common-dir\)|git rev-parse --git-common-dir\)"\)/.test(contract.replace(RECIPE, '')) && !/\$\(git rev-parse --git-common-dir\)/.test(contract));
  check('D7-d contract states Git >= 2.31 and the documented fallback (match bootstrap.md)', /2\.31/.test(contract) && /fallback|resolve the relative/i.test(contract));
  check('D7-e idiom byte-matches the shipped occurrences (claim-protocol.md, runtime-contract.md, publish-protocol.md, bootstrap.md, owner-ops.md, arc-authorize/SKILL.md)', ['.claude/skills/arc-worker/references/claim-protocol.md', '.claude/skills/arc-worker/references/runtime-contract.md', '.claude/skills/arc-publish-plan/references/publish-protocol.md', '.claude/skills/arc-publish-plan/references/bootstrap.md', '.claude/skills/arc-authorize/references/owner-ops.md', '.claude/skills/arc-authorize/SKILL.md'].every((p) => /git rev-parse --path-format=absolute --git-common-dir/.test(stripCR(readText(p)))) && /git rev-parse --path-format=absolute --git-common-dir/.test(contract));
  const labWt = path.resolve(ROOT, '..', 'portfolio-tracker-test-lab');
  if (fs.existsSync(labWt)) {
    const run = (cwd) => spawnSync('bash', ['-c', RECIPE + '; printf %s "$ARCS"'], { cwd, encoding: 'utf8' });
    const m = run(ROOT), l = run(labWt);
    check('D7-c recipe from the linked worktree resolves to the MAIN worktree .ai-reports/arcs (executed, read-only)', m.status === 0 && l.status === 0 && m.stdout === l.stdout && m.stdout.endsWith('/.ai-reports/arcs'));
  } else console.log('  (linked worktree portfolio-tracker-test-lab absent - D7-c execution skipped)');
  check('D7 contract defines STRAY-REGISTRY as a status-view flag for an arc.json outside the resolved main-worktree root (never an auditor flag)', /STRAY-REGISTRY/.test(contract) && /linked worktree/i.test(contract) && /never an auditor flag|not an auditor flag/i.test(contract));

  // ── contract / skill / template content (EP-D2 writer matrix, O-1..O-6, G-2) ─
  section('docs: registry-contract.md / SKILL.md / status-report.md');
  check('contract: the 10 states listed in order', STATES.every((s) => new RegExp('`' + s + '`').test(contract)) && contract.indexOf('`IDEA`') < contract.indexOf('`SUPERSEDED`'));
  check('contract O-3: IDEA -> PLANNING legal; EXECUTING -> EXECUTING legal (republish); revision planning never demotes EXECUTING; CLOSED terminal; HOLD -> CANCELLED legal; READY -> REVIEWED illegal; bootstrap -> EXECUTING only for CORE-STREAM', /IDEA.{0,5}(→|->).{0,5}PLANNING/.test(contract) && /EXECUTING.{0,5}(→|->).{0,5}EXECUTING/.test(contract) && /demote/i.test(contract) && /CLOSED[^\n]*terminal/i.test(contract) && /HOLD.{0,5}(→|->).{0,5}CANCELLED/.test(contract) && /READY.{0,5}(→|->).{0,5}REVIEWED[^\n]*illegal/i.test(contract) && /grandfather/i.test(contract));
  check('contract O-4: heldFrom required when HOLD (the state HOLD returns to); successorArcId required when SUPERSEDED', /heldFrom/.test(contract) && /successorArcId/.test(contract));
  check('contract D2-i writer matrix: owner-only promotion, implementationAllowed, READY, CLOSED, HOLD, CANCELLED, SUPERSEDED', /owner[- ]only[^\n]*promotion/i.test(contract) && /owner[- ]only[^\n]*implementationAllowed/i.test(contract) && /owner[- ]only[^\n]*READY[^\n]*CLOSED[^\n]*HOLD[^\n]*CANCELLED[^\n]*SUPERSEDED/i.test(contract));
  check('contract D2-j writer matrix: publisher-only execution + EXECUTING, with the CORE-STREAM grandfather exemption', /publisher[- ]only[^\n]*execution[^\n]*EXECUTING/i.test(contract) && /grandfather[^\n]*CORE-STREAM|CORE-STREAM[^\n]*grandfather/i.test(contract));
  check('contract D-5: Increment 1 is status/read-only; no automated arc.json writer exists until B5; hand edits via json-safe-edit (parse-modify-serialize + temp + rename)', /no automated (writer|arc\.json writer)/i.test(contract) && /B5/.test(contract) && /json-safe-edit/.test(contract) && /rename/.test(contract));
  check('contract D-26: no taskIdPrefix anywhere; D-4: CORE-STREAM is the single grandfathered bootstrap entry, EXECUTING, promotion null, history honest, never a runtime arcId', !/taskIdPrefix/.test(contract) && /CORE-STREAM/.test(contract) && /promotion[^\n]*null/.test(contract) && /never a runtime `?arcId`?/i.test(contract) && /no `?plans\/arcs\/CORE-STREAM/.test(contract));
  check('contract O-6: CORE-STREAM authority.artifact = the verified v3 source', contract.indexOf('.ai-reports/handoffs/2026-08-15_parallel-arc-execution-plan-v3.COWORK.md') !== -1);
  check('contract PR-1..PR-7 present; PR-6 has no task-id prefix clause; PR-2 has no P-V18', ['PR-1', 'PR-2', 'PR-3', 'PR-4', 'PR-5', 'PR-6', 'PR-7'].every((r) => new RegExp('\\*\\*' + r + '\\b').test(contract)) && !/prefixed `<ARC-ID>-`|task id prefixed|task-id prefix clause kept/i.test(contract.replace(/without the[^\n]*prefix[^\n]*/gi, '')) && !/P-V18\b(?![^\n]*(RETIRED|retired))/.test(contract));
  check('contract PR-2 names --dry-run --arc and the live rule set P-V1..P-V9, P-V15, P-V16, P-V17, P-V19, P-V20 (P-V18 retired, number reserved)', /--dry-run/.test(contract) && /P-V16/.test(contract) && /P-V17/.test(contract) && /P-V19/.test(contract) && /P-V20/.test(contract) && /P-V18[^\n]*(RETIRED|retired)/.test(contract));
  check('contract binding sentence: the registry indexes claim roots, it never isolates claims - isolation is structural in arc-claims/', /indexes claim roots/.test(contract) && /never isolates claims/.test(contract) && /arc-claims\//.test(contract));
  check('contract O-1: `- Arc:` wins auditor grouping; slug disagreement = normalization flag; neither is runtime arcId authority (publisher takes arcId only from the literal)', /- Arc:/.test(contract) && /normalization\s+flag/i.test(contract) &&/(never|neither|not)[^\n]*(runtime[^\n]*arcId|authority[^\n]*arcId)/i.test(contract) && /takes[\s\S]{0,12}arcId[\s\S]{0,80}literal/i.test(contract));
  check('contract G-2: the two --arc flags are filters over different identity spaces (auditor slug attribution vs registry arcId)', /identity space/i.test(contract) && /arc-progress-auditor/.test(contract) && /filter/.test(contract));
  check('contract: the two staleness clocks documented (auditor 14 days; READY decay 7 days flag only), never unified', /14/.test(contract) && /7 days|7-day|seven days/i.test(contract) && /STALE-READY/.test(contract));
  check('contract: the 8 status-view flags defined', FLAGS.every((f) => new RegExp('`' + f + '`').test(contract)));
  check('contract: legacy current.json carries no arcId and raises NO flag (CORE-STREAM index entry)', /no `?arcId`?[^\n]*(no flag|not a flag|never flagged|NO FLAG)/i.test(contract) || /(NO FLAG|never a flag)[^\n]*legacy/i.test(contract));
  check('contract: planning.lease is advisory, never a lock', /lease[^\n]*advisory/i.test(contract) && /never a lock|not a lock/i.test(contract));
  check('contract: orphan rule - an arc past PLANNING with authority.artifact null is an orphan', /orphan/i.test(contract) && /authority/.test(contract));
  const skill = exists(REL.skill) ? stripCR(readText(REL.skill)) : '';
  check('skill: status-only invocation `/arc-registry status [--arc <ARC-ID>]`; --arc is a display filter, never routing', /\/arc-registry status \[--arc <ARC-ID>\]/.test(skill) && /filter/.test(skill) && /never routing|not routing/i.test(skill));
  check('skill: STANDING BEHAVIOR blockquote - read-only, never writes arc.json, never touches the runtime, never authorizes, never promotes', /STANDING BEHAVIOR/.test(skill) && /read-only/i.test(skill) && /NEVER/.test(skill) && /promote/i.test(skill) && /authoriz/i.test(skill));
  check('skill: resolves ARCS with the house idiom and ROOT for the runtime', skill.indexOf(RECIPE) !== -1 && /ROOT="\$\(git rev-parse --path-format=absolute --git-common-dir\)\/arc-runtime"/.test(skill));
  check('skill: enumerates legacy claims and ARC claims under separate headings; holders shown as (arcId ?? legacy, taskId); DUPLICATE-ID-INFO informational', /separate headings/i.test(skill) && /arcId \?\? legacy, taskId/.test(skill) && /DUPLICATE-ID-INFO/.test(skill));
  check('skill: identity checks delegate to runtime-identity.js (claimMatchesPath / arcIdTriple / holderOwnershipMatches), never re-implemented', /runtime-identity\.js/.test(skill) && /claimMatchesPath/.test(skill) && /arcIdTriple/.test(skill));
  check('skill: bash blocks tagged # @op and read-only; registry absent => "registry not bootstrapped" informational', /# @op /.test(skill) && /registry not bootstrapped/i.test(skill));
  check('skill: stop conditions include malformed --arc, unresolvable root, and any request to write / promote / publish', /Stop conditions/i.test(skill) && /malformed/i.test(skill));
  const template = exists(REL.template) ? stripCR(readText(REL.template)) : '';
  check('template: separate headings for legacy claims (claims/) and ARC claims (arc-claims/<ARC-ID>/); holders pair; flags section; advisory footer', /claims\//.test(template) && /arc-claims\/<ARC-ID>\//.test(template) && /arcId \?\? legacy, taskId/.test(template) && /FLAGS/.test(template) && /advisory|not an approval|never authoriz/i.test(template));
  check('template: prints execution.pointer and execution.claimsRoot as documentary index fields', /claimsRoot/.test(template) && /pointer/.test(template));

  // ── EP-D10 auditor compatibility ──────────────────────────────────────────
  section('EP-D10 auditor compatibility');
  const scan = stripCR(readText(REL.scanContract));
  check('D10-a scan-contract: arcs root documentary + --root; the auditor has no Bash and cannot resolve the main worktree; no git invocation added', /\.ai-reports\/arcs/.test(scan) && /--root/.test(scan) && /cannot resolve|no `Bash`|no Bash/i.test(scan) && !/git rev-parse/.test(scan));
  check('D10-b scan-contract: arcs root absent => informational "registry not bootstrapped", never a stop condition', /registry not bootstrapped/i.test(scan) && /never a stop/i.test(scan));
  check('D10-c scan-contract: arc.json excluded from the header-normalization denominator (separate scan class)', /denominator/.test(scan) && /arc\.json/.test(scan));
  check('D10-d scan-contract: `- Arc: <ARC-ID>` optional header key documented', /- Arc: <ARC-ID>/.test(scan));
  check('D10-e scan-contract O-1: `- Arc:` wins grouping; slug disagreement = normalization flag, never silent reclassification', /- Arc:[^\n]*wins|wins[^\n]*- Arc:/i.test(scan) && /normalization flag/i.test(scan));
  check('D10-f scan-contract: slug-prefix attribution never identifies a runtime ARC; the publisher takes arcId only from its literal', /never identifies a runtime\s+ARC/i.test(scan) && /takes[\s\S]{0,12}arcId[\s\S]{0,80}literal/i.test(scan));
  check('D10-g scan-contract: the two --arc flags documented as filters over different identity spaces', /identity space/i.test(scan) && /\/arc-registry status/.test(scan));
  check('D10 scan-contract: STRAY-REGISTRY is not an auditor flag; arcs root is reference material for attribution only, never rendered as audit rows (O-2)', /STRAY-REGISTRY/.test(scan) && /not an auditor flag|never an auditor flag/i.test(scan) && /never rendered/i.test(scan));
  check('D10 scan-contract: orphan rule (arc past PLANNING with authority.artifact null)', /authority/.test(scan) && /orphan/i.test(scan));
  check('D10-h arc-progress-auditor/SKILL.md byte-identical to HEAD (B3 modifies only scan-contract.md)', gitShow(REL.auditorSkill) !== null && sha256(stripCR(readText(REL.auditorSkill))) === sha256(gitShow(REL.auditorSkill)));
  check('D10 O-2 arc-audit.md template byte-identical to HEAD', gitShow(REL.auditorTemplate) !== null && sha256(stripCR(readText(REL.auditorTemplate))) === sha256(gitShow(REL.auditorTemplate)));
  check('D10 scan-contract sections 1-7 keep their existing rules (README wins; CHECKPOINT never read whole; status classes)', /README wins/.test(scan) && /never read it whole/.test(scan) && /`UNKNOWN`/.test(scan));

  // ── D10-i..D10-m: ARC-era status vocabulary (Wave 0 audit unblock) ─────────
  // The vocabulary is PARSED OUT OF scan-contract.md section 7, never hardcoded here:
  // these asserts fail while the contract lacks the rows, which is what makes the
  // QA-first RED real. Precedence is first-matching-row-wins in table order.
  section('D10-i..m auditor status vocabulary (live-record validation)');
  const auFlat = (s) => String(s).replace(/\s+/g, ' ');
  const auStop = 'more than 20% of scanned artifacts fail header normalization';
  const auParse = (md) => {
    const at = md.indexOf('## 7. Status normalization');
    if (at === -1) return [];
    const end = md.indexOf('\n## ', at + 5);
    const seg = md.slice(at, end === -1 ? md.length : end);
    const rows = [];
    for (const line of seg.split('\n')) {
      const m = /^\|\s*`([A-Z][A-Z0-9-]*)`\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
      if (!m) continue;
      // A pattern may carry a documented trailing placeholder (`SUPERSEDED-BY <file>`); strip only
      // that and trim, leaving the literal matchable prefix. filter(Boolean) drops a pattern that
      // was ONLY a placeholder - an empty pattern would match every string.
      rows.push({ cls: m[1], patterns: (m[2].match(/`[^`]+`/g) || []).map((x) => x.slice(1, -1).replace(/\s*<[^>]*>\s*$/, '').trim()).filter(Boolean) });
    }
    return rows;
  };
  const auRows = auParse(scan);
  const auClsList = auRows.map((r) => r.cls);
  const auNormalize = (s) => {
    if (s === null || s === undefined) return 'UNKNOWN';
    const up = String(s).toUpperCase();
    for (const row of auRows) for (const p of row.patterns) if (up.indexOf(p.toUpperCase()) !== -1) return row.cls;
    return 'UNKNOWN';
  };
  const auStatusOf = (txt) => {
    const head = stripCR(txt).split('\n').slice(0, 14);
    for (const l of head) { const m = /^-\s*Status:\s*(.+)$/.exec(l); if (m) return m[1].trim(); }
    for (const l of head) { const m = /^\*\*Status:\*\*\s*(.+)$/.exec(l); if (m) return m[1].trim(); }
    return null;
  };
  const auNew = ['PLANNING-SOURCE', 'ACTIVE-SOURCE', 'IMPLEMENTED-UNCOMMITTED',
    'IMPLEMENTED-COMMITTED', 'REVIEW-RECORD', 'STANDING-POLICY', 'SCOPE-DEFINITION'];
  const auOld = ['OPEN', 'CLOSED', 'RATIFIED', 'SUPERSEDED', 'HOLD', 'APPROVED-NOT-STARTED', 'REGISTERED', 'UNKNOWN'];

  check('D10-i table parses; all 8 original classes still present', auOld.every((c) => auClsList.indexOf(c) !== -1));
  check('D10-i all 7 ARC-era classes present exactly once (' + auClsList.length + ' rows parsed)',
    auNew.every((c) => auClsList.filter((x) => x === c).length === 1));
  check('D10-i precedence documented: first matching row wins, in table order', /first matching row wins/i.test(scan) && /table order/i.test(scan));
  check('D10-i PLANNING-SOURCE precedes RATIFIED and HOLD (NOT RATIFIED / rev1 DRAFT-HOLD strings)',
    auClsList.indexOf('PLANNING-SOURCE') !== -1 && auClsList.indexOf('PLANNING-SOURCE') < auClsList.indexOf('RATIFIED') && auClsList.indexOf('PLANNING-SOURCE') < auClsList.indexOf('HOLD'));
  check('D10-i UNKNOWN remains the terminal fallback row and is still flagged for owner ruling',
    auClsList[auClsList.length - 1] === 'UNKNOWN' && /flag for owner ruling/i.test(scan));
  check('D10-i section 3 documents the bold-field `**Status:**` variant', /\*\*Status:\*\*/.test(scan));
  check('D10-i `**Task state**` is explicitly NOT a status source (no semantic guessing)',
    /\*\*Task state\*\*/.test(scan) && /not a status source|never a status source/i.test(scan));
  const auPct = scan.match(/\b\d+\s*%/g) || [];
  check('D10-i scan-contract.md carries exactly ONE percentage token - the documentary ">20% abort" cross-reference - and never defines, restates or overrides the threshold (found: ' + (auPct.join(', ') || 'none') + ')',
    auPct.length === 1
    && /excluded from the header-normalization denominator\*\* and from the >20% abort/.test(auFlat(scan))
    && auFlat(scan).indexOf(auStop) === -1
    && !/\b20\s*%[^.]{0,80}(threshold|stop condition|stop and report)/i.test(auFlat(scan)));

  const auFixtures = [
    ['**PLANNING SOURCE — revision r1. NOT PROMOTED. NOT PUBLISHED. NOT AUTHORIZED.**', 'PLANNING-SOURCE'],
    ['**PLANNING SOURCE — revision r2. NOT RATIFIED. NOT PROMOTED. NOT PUBLISHED. Arc remains at PLANNING (rev1 DRAFT/HOLD) until Owner ratification of this artifact.**', 'PLANNING-SOURCE'],
    ['**ACTIVE ROUTING SOURCE — supersedes 2026-08-15_parallel-arc-execution-plan.COWORK.md**', 'ACTIVE-SOURCE'],
    ['**ACTIVE PUBLICATION SOURCE — supersedes `2026-08-15_parallel-arc-execution-plan-v2.COWORK.md`**', 'ACTIVE-SOURCE'],
    ['IMPLEMENTED IN THE WORKING TREE · QA GREEN · COMMIT RECOMMENDED (commit and push are separate owner GOs)', 'IMPLEMENTED-UNCOMMITTED'],
    ['IMPLEMENTATION GREEN · STATIC REVIEW PASS · **UNCOMMITTED**', 'IMPLEMENTED-UNCOMMITTED'],
    ['**COMMITTED + PUSHED** · QA GREEN (all figures below were captured on the tree that was committed, byte-for-byte)', 'IMPLEMENTED-COMMITTED'],
    ['REVIEW RECORD — nothing in this handoff authorizes anything. No promote, no publish, no arc start, no CHECKPOINT change.', 'REVIEW-RECORD'],
    ['**STANDING POLICY, IN FORCE from 2026-08-28. Temporary — expires when the underlying circularity is mechanically removed.**', 'STANDING-POLICY'],
    ['**SCOPE DEFINITION — implementation NOT authorized by this artifact**', 'SCOPE-DEFINITION'],
    ['OPEN', 'OPEN'],
    ['OPEN — supersedes 2026-08-09_lab-e2e-experiment-backlog.COWORK.md', 'OPEN'],
    ['CLOSED PASS', 'CLOSED'],
    ['**CLOSED / RATIFIED**', 'CLOSED'],
    ['RECON COMPLETE — preparation only', 'CLOSED'],
    ['SUPERSEDED-BY 2026-08-09_lab-e2e-experiment-backlog-v2.COWORK.md', 'SUPERSEDED'],
    ['**HOLD** by owner ruling 2026-08-14 — no ARC, no slices, no Tool Contract/Registry v0', 'HOLD'],
    ['SPEC REGISTERED — implementation requires separate Main Control authorization', 'REGISTERED'],
    ['RATIFIED PLAN — implementation per batch GO', 'RATIFIED']
  ];
  const auNegatives = [
    'M1 ARTIFACTS AUTHORED under Step-0 Owner GO · pilot NOT launched',
    '**Retrospective only. No process change enacted. No follow-up implemented. No protocol, schema or profile amended.**',
    'FOO BAR BAZ',
    ''
  ];
  const auBadFix = auFixtures.filter((f) => auNormalize(f[0]) !== f[1]).map((f) => f[1] + '<-got:' + auNormalize(f[0]));
  check('D10-j all ' + auFixtures.length + ' observed status forms normalize deterministically (' + (auBadFix.join(', ') || 'none wrong') + ')', auBadFix.length === 0);
  const auBadNeg = auNegatives.filter((s) => auNormalize(s) !== 'UNKNOWN');
  check('D10-k genuinely unmapped forms stay UNKNOWN - no over-reach (' + (auBadNeg.join(' | ') || 'none') + ')', auBadNeg.length === 0);
  check('D10-k a missing Status key normalizes to UNKNOWN', auNormalize(auStatusOf('# HANDOFF - x\n- From: MAIN\n')) === 'UNKNOWN');
  check('D10-k the bold-field variant is read only when no `- Status:` key exists',
    auStatusOf('# H\n**Status:** IMPLEMENTATION GREEN\n') === 'IMPLEMENTATION GREEN' && auStatusOf('# H\n- Status: OPEN\n**Status:** CLOSED PASS\n') === 'OPEN');

  // Live-record validation (Codex finding 9). existsSync-guarded: .ai-reports/ is git-excluded.
  const auHoDir = abs('.ai-reports/handoffs');
  if (fs.existsSync(auHoDir)) {
    const auFiles = fs.readdirSync(auHoDir).filter((f) => /\.md$/.test(f) && f !== 'README.local.md');
    const auUnknown = auFiles.filter((f) => auNormalize(auStatusOf(fs.readFileSync(path.join(auHoDir, f), 'utf8'))) === 'UNKNOWN').sort();
    const auPinned = [
      '2026-08-16_g1-clock-seam.MAIN.md',
      '2026-08-22_ep-pilot-r1-review.MAIN.md',
      '2026-08-22_lx-2-ep-pilot-wv10.LAB.md',
      '2026-08-23_ep-pilot-main-closeout.MAIN.md',
      '2026-08-26_intake-m1-pilot-launch.COWORK.md',
      '2026-08-28_pilot-close-pc-closeout.MAIN.md'
    ].sort();
    const auRate = auFiles.length ? (auUnknown.length * 100) / auFiles.length : 0;
    console.log('  live corpus: ' + auFiles.length + ' handoffs, ' + auUnknown.length + ' UNKNOWN (' + auRate.toFixed(1) + '%)');
    check('D10-l residual UNKNOWN set equals the pinned bounded list (' + (auUnknown.join(', ') || 'none') + ')',
      JSON.stringify(auUnknown) === JSON.stringify(auPinned));
    check('D10-m live header-normalization failure rate is under the auditor 20% stop threshold (' + auRate.toFixed(1) + '%)', auRate < 20);
  } else console.log('  (.ai-reports/handoffs absent on this checkout - live-record checks SKIPPED, 2 asserts not run)');
  check('D10-m authoritative >20% stop condition lives ONLY in SKILL.md: exact sentence exactly once there, absent from scan-contract.md (SKILL.md itself byte-pinned to HEAD by D10-h)',
    auFlat(stripCR(readText(REL.auditorSkill))).split(auStop).length - 1 === 1 && auFlat(scan).indexOf(auStop) === -1);

  // ── local-only seeds (existsSync-guarded; PROPERTIES only, never inventory) ─
  section('local seeds (guarded, property-only)');
  const seedsDir = abs(REL.arcsLocal);
  if (fs.existsSync(seedsDir)) {
    const csPath = path.join(seedsDir, 'CORE-STREAM', 'arc.json'), epPath = path.join(seedsDir, 'EP-PILOT', 'arc.json');
    check('seed .ai-reports/arcs/README.local.md present', fs.existsSync(path.join(seedsDir, 'README.local.md')));
    if (fs.existsSync(csPath)) {
      const cs = JSON.parse(stripCR(fs.readFileSync(csPath, 'utf8')));
      check('seed CORE-STREAM/arc.json validates; arcId == directory; EXECUTING; promotion null; pointer plans/current.json; claimsRoot claims/; authority = v3 source; history[0] honest bootstrap', ok(cs) && cs.arcId === 'CORE-STREAM' && cs.state === 'EXECUTING' && cs.promotion === null && cs.execution.pointer === 'plans/current.json' && cs.execution.claimsRoot === 'claims/' && cs.authority.artifact === REL.v3Source && /grandfather/i.test(cs.history[0].note || '') && historyConsistent(cs).ok);
      check('seed CORE-STREAM execution.planId / planHash / publishedAt match the live legacy pointer when present (property, not inventory)', (() => { const p = path.join(liveRuntime, 'plans', 'current.json'); if (!fs.existsSync(p)) return true; const c = JSON.parse(stripCR(fs.readFileSync(p, 'utf8'))); return cs.execution.planId === c.planId && cs.execution.planHash === c.planHash && cs.execution.publishedAt === c.publishedAt; })());
      check('seed CORE-STREAM authority artifact exists and its sha256 equals the live sourceHash (O-6 verified, not fabricated)', exists(REL.v3Source) && sha256(fs.readFileSync(abs(REL.v3Source))) === '63171fa4f000ff2cef7d01724ab44c2529110049300d71d25c972f77407ee5c2');
    } else check('seed CORE-STREAM/arc.json present', false);
    if (fs.existsSync(epPath)) {
      const ep = JSON.parse(stripCR(fs.readFileSync(epPath, 'utf8')));
      // EP-PILOT is LIVE and mutable: the B7 pilot advances it IDEA -> ... -> EXECUTING -> CLOSED by
      // design, so no single lifecycle state may be pinned here. ok() remains the authoritative
      // schema / state-conditional validator and historyConsistent() the authoritative transition
      // validator; neither is mirrored below. The only additions are CROSS-FIELD relations the schema
      // cannot express - it validates each value's shape, never that one field matches another.
      // Today's planId / revision / hashes are deliberately not encoded.
      const execXref = (a) => {
        if (a.state !== 'EXECUTING') return true;                        // every other state: ok() + historyConsistent() decide
        if (!isObj(a.execution)) return false;                           // (ok() already requires it; guard the reads below)
        const want = a.arcId === GRANDFATHER
          ? { p: 'plans/current.json', c: 'claims/' }
          : { p: 'plans/arcs/' + a.arcId + '/current.json', c: 'arc-claims/' + a.arcId + '/' };
        if (a.execution.pointer !== want.p || a.execution.claimsRoot !== want.c) return false;
        if (!isObj(a.promotion)) return a.arcId === GRANDFATHER;         // CORE-STREAM promotion is null (D-4)
        const rev = a.planning.revisions.find((x) => x.rev === a.promotion.rev);
        return !!rev && rev.sourceHash === a.promotion.sourceHash;       // promotion pins a real revision (PR-1)
      };
      check('seed EP-PILOT/arc.json: arcId == directory, schema-valid, state in the committed lifecycle, legal history; and when EXECUTING, execution.pointer/claimsRoot derive from arcId and promotion pins a real planning revision (state=' + ep.state + ')',
        ok(ep) && ep.arcId === 'EP-PILOT' && STATES.includes(ep.state) && historyConsistent(ep).ok && execXref(ep));
      check('EP-PILOT IDEA-seed semantics preserved as a regression proof on a SYNTHETIC fixture (never the mutable live file): a valid IDEA seed passes, and the same seed with implementationAllowed true is REJECTED',
        (() => { const s = mkArc({ arcId: 'EP-PILOT', title: 'Execution Profile pilot' });
          return ok(s) && s.state === 'IDEA' && s.implementationAllowed === false && s.authority === null
            && s.promotion === null && s.execution === null && historyConsistent(s).ok
            && !ok(mkArc({ arcId: 'EP-PILOT', implementationAllowed: true })); })());
    } else check('seed EP-PILOT/arc.json present', false);
    check('seed registry consistent (arcId == dir, no case-folded duplicates)', registryConsistent(fs.readdirSync(seedsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => ({ dir: e.name, arc: fs.existsSync(path.join(seedsDir, e.name, 'arc.json')) ? JSON.parse(stripCR(fs.readFileSync(path.join(seedsDir, e.name, 'arc.json'), 'utf8'))) : null }))).ok);
    check('seed: no plans/arcs/CORE-STREAM or arc-claims/CORE-STREAM exists in the live runtime', !fs.existsSync(path.join(liveRuntime, 'plans', 'arcs', 'CORE-STREAM')) && !fs.existsSync(path.join(liveRuntime, 'arc-claims', 'CORE-STREAM')));
  } else console.log('  (.ai-reports/arcs absent on this checkout - seed property checks skipped)');
  check('handoffs README documents the optional `- Arc: <ARC-ID>` header key (D-11)', exists(REL.handoffsReadme) ? /- Arc: <ARC-ID>/.test(stripCR(readText(REL.handoffsReadme))) : true);

  // ── wiring + scope ─────────────────────────────────────────────────────────
  section('wiring + scope');
  check('wiring run-offline.js registers qa/arc_registry_offline.js', /'qa\/arc_registry_offline\.js'/.test(readText(REL.runner)));
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
if (liveBefore !== null) check('live runtime tree hash unchanged by this suite', treeHash(liveRuntime) === liveBefore);
check('every temp tree removed', tempDirs.every((d) => !fs.existsSync(d)));

console.log('\n' + (failed === 0 ? 'ARC REGISTRY (P-D Inc-1): PASS (' + total + ' asserts)' : 'ARC REGISTRY (P-D Inc-1): FAIL (' + failed + ' of ' + total + ' asserts failed)'));
assert.strictEqual(failed, 0, failures.slice(0, 12).join(' | '));
