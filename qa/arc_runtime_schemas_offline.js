'use strict';

/*
 * qa/arc_runtime_schemas_offline.js
 *
 * Multi-ARC V1 — Increment P-E0 (B4): runtime schemas + topology contract, STRUCTURAL proofs only
 * (ULTRAPLAN r3 §4-B4, §5.1 column "B4", §16-B4; owner rulings D-22, D-23, D-24, N-1, N-2, N-3 and
 * R-B4-1 of 2026-08-22). Pure Node, no network, no browser, NO runtime write. Reads only:
 *   - .claude/skills/arc-publish-plan/references/schemas/{plan,current,claim,authorized,holder}.schema.json
 *   - .claude/skills/arc-publish-plan/scripts/lib/runtime-identity.js   (the B4 helper, required)
 *   - .claude/skills/arc-publish-plan/scripts/lib/profile-contract.js   (B1, read-only: external $ref + registry)
 *   - the live runtime (.git/arc-runtime) READ-ONLY: the 8 LEGACY_SCHEMA_SET records and the 12 LEGACY_BYTE_SET files
 *   - the B4 docs (greps) and the forbidden set (byte checks vs HEAD)
 * Every temp tree lives under os.tmpdir() and is removed in `finally`; the last assert proves it.
 *
 * It makes NO claim about runtime behaviour (no depSatisfied, no release logic, no routing) — those
 * proofs belong to B5/B6 against the real sequences (D-31). There is no ajv in this repo, so the
 * validator below is a schema-DRIVEN structural checker: it reads the schema files and enforces
 * exactly the keyword subset they use; an unsupported keyword is a FAIL, never silently ignored.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_DIR = '.claude/skills/arc-publish-plan/references/schemas';
const REL = {
  schemas: {
    plan: SCHEMA_DIR + '/plan.schema.json',
    current: SCHEMA_DIR + '/current.schema.json',
    claim: SCHEMA_DIR + '/claim.schema.json',
    authorized: SCHEMA_DIR + '/authorized.schema.json',
    holder: SCHEMA_DIR + '/holder.schema.json'
  },
  identity: '.claude/skills/arc-publish-plan/scripts/lib/runtime-identity.js',
  lib: '.claude/skills/arc-publish-plan/scripts/lib/profile-contract.js',
  runtime: '.git/arc-runtime',
  docs: {
    runtimeContract: '.claude/skills/arc-worker/references/runtime-contract.md',
    bootstrap: '.claude/skills/arc-publish-plan/references/bootstrap.md',
    runner: 'qa/run-offline.js',
    handshakeQa: 'qa/arc_worker_handshake_offline.js'
  },
  // B5 (P-E publisher, 2026-08-22) owns arc-publish-plan/SKILL.md, plan-validation.md, publish-protocol.md,
  // profile-contract.js and resolve-profiles.js; their HEAD-identity pins were removed here mechanically
  // (same pattern as R-B4-2). Worker / authorize surfaces stay pinned until B6.
  forbidden: [
    // B6 (P-E execution side, 2026-08-22) owns arc-worker/SKILL.md, claim-protocol.md, arc-authorize/SKILL.md
    // and owner-ops.md; their HEAD-identity pins were removed mechanically (R-B4-2 pattern). The structural
    // schema, topology and legacy-byte proofs of this suite are unaffected.
    '.claude/skills/arc-worker/references/execution-profile.md',
    '.claude/skills/arc-publish-plan/references/schemas/execution-profile.schema.json',
    '.claude/skills/arc-publish-plan/references/execution-profiles/COWORK-REGISTER.json',
    '.claude/skills/arc-publish-plan/references/execution-profiles/LAB-SANDBOX-STATIC.json',
    '.claude/skills/arc-publish-plan/references/execution-profiles/MAIN-BROWSER-QA.json',
    '.claude/skills/arc-publish-plan/references/execution-profiles/MAIN-CODE-SLICE-BOUNDED.json',
    '.claude/skills/arc-publish-plan/references/execution-profiles/MAIN-CODE-SLICE.json',
    '.claude/skills/arc-publish-plan/references/execution-profiles/MAIN-GATED-LIVE-QA.json',
    '.claude/skills/arc-publish-plan/references/execution-profiles/OWNER-MANUAL.json',
    'netlify.toml'
  ]
};
// N-1: LEGACY_SCHEMA_SET = 8 records that validate against a schema; LEGACY_BYTE_SET = 12 files hashed.
const LEGACY_SCHEMA_SET = [
  { file: 'plans/current.json', schema: 'current' },
  { file: 'plans/parallel-arc-v2-2026-08-15/manifest.json', schema: 'current' },
  { file: 'plans/parallel-arc-v3-2026-08-15/manifest.json', schema: 'current' },
  { file: 'claims/G1-CLOCK-SEAM/claim.json', schema: 'claim' },
  { file: 'claims/LX-2/claim.json', schema: 'claim' },
  { file: 'claims/LX-3/claim.json', schema: 'claim' },
  { file: 'claims/LX-4/claim.json', schema: 'claim' },
  { file: 'claims/G1-CLOCK-SEAM/authorized.json', schema: 'authorized' }
];
const LEGACY_BYTE_SET = [
  'claims/G1-CLOCK-SEAM/authorized.json', 'claims/G1-CLOCK-SEAM/claim.json', 'claims/LX-2/claim.json', 'claims/LX-3/claim.json', 'claims/LX-4/claim.json',
  'plans/current.json',
  'plans/parallel-arc-v2-2026-08-15/manifest.json', 'plans/parallel-arc-v2-2026-08-15/plan.json', 'plans/parallel-arc-v2-2026-08-15/source.md',
  'plans/parallel-arc-v3-2026-08-15/manifest.json', 'plans/parallel-arc-v3-2026-08-15/plan.json', 'plans/parallel-arc-v3-2026-08-15/source.md'
];
const RESERVED_DEVICE_NAMES = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
const MUTEX_REGISTRY = ['AUTHORITY:published-plan', 'CODE:index-html', 'CODE:netlify-functions', 'DEPLOY:netlify', 'EXTERNAL:live-provider', 'QA:browser-runtime', 'RUNTIME:gates', 'RUNTIME:owner-profile'];
const ROOT_TRIPLE = ['plans', 'claims', 'mutex'];
const ISO = '2026-08-22T10:00:00Z';
const HEX64 = 'a'.repeat(64);
const HEX40 = '7b54b39d13ef260919b58e3a1c5afd7f8e65c74b';

const abs = (p) => path.join(ROOT, p);
const readText = (p) => fs.readFileSync(abs(p), 'utf8');
const stripCR = (s) => String(s).replace(/\r/g, '');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const clone = (o) => JSON.parse(JSON.stringify(o));
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

// ── harness ──────────────────────────────────────────────────────────────────
let total = 0, failed = 0;
const failures = [];
function check(name, cond) { total += 1; if (!cond) { failed += 1; failures.push(name); console.log('  FAIL  ' + name); } }
function section(title) { console.log('== ' + title + ' =='); }
const tempDirs = [];
function tmp(label) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-b4-' + label + '-')); tempDirs.push(d); return d; }
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
function sectionOf(text, startRe) {
  const lines = stripCR(text).split('\n');
  let i = lines.findIndex((l) => startRe.test(l));
  if (i < 0) return null;
  const out = [lines[i]];
  for (i += 1; i < lines.length && !/^## /.test(lines[i]); i += 1) out.push(lines[i]);
  return out.join('\n');
}

// ── schema-driven structural validator (keyword subset; drift-guarded) ───────
const SUPPORTED = ['$schema', '$id', 'title', 'description', 'type', 'additionalProperties', 'required', 'properties', 'pattern', 'maxLength', 'minLength', 'minimum', 'enum', 'not', '$ref', '$defs', 'items', 'minItems', 'uniqueItems', 'default', 'anyOf'];
let lib = null;
try { lib = require(abs(REL.lib)); } catch (e) { console.log('  (B1 library not loadable: ' + e.message.split('\n')[0] + ')'); }
function keywordsOf(schema, acc) {
  acc = acc || new Set();
  if (Array.isArray(schema)) { schema.forEach((s) => keywordsOf(s, acc)); return acc; }
  if (!isObj(schema)) return acc;
  for (const k of Object.keys(schema)) {
    acc.add(k);
    if (['properties', '$defs'].includes(k)) Object.values(schema[k]).forEach((s) => keywordsOf(s, acc));
    else if (['items', 'not', 'additionalProperties'].includes(k)) keywordsOf(schema[k], acc);
    else if (k === 'anyOf') schema[k].forEach((s) => keywordsOf(s, acc));
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
    const ref = schema.$ref;
    if (ref.startsWith('#/')) {
      let node = root;
      for (const seg of ref.slice(2).split('/')) node = node && node[seg];
      if (!node) { out.push(at + ': unresolved $ref ' + ref); return out; }
      return validate(node, value, root, at, out);
    }
    if (ref === 'execution-profile.schema.json') {
      if (!lib) { out.push(at + ': external $ref needs profile-contract.js'); return out; }
      lib.validateProfile(lib.withoutLibraryHash(value)).forEach((c) => out.push(at + ': profile ' + c));
      return out;
    }
    out.push(at + ': unsupported external $ref ' + ref); return out;
  }
  if ('type' in schema) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const t = typeOf(value);
    const okT = types.includes(t) || (t === 'integer' && types.includes('number'));
    if (!okT) { out.push(at + ': type ' + t + ' not in ' + types.join('|')); return out; }
  }
  if ('enum' in schema && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) out.push(at + ': not in enum');
  if ('not' in schema && validate(schema.not, value, root, at, []).length === 0) out.push(at + ': matches forbidden schema (not)');
  if ('anyOf' in schema && !schema.anyOf.some((s) => validate(s, value, root, at, []).length === 0)) out.push(at + ': matches none of anyOf');
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

// ── fixtures ─────────────────────────────────────────────────────────────────
const legacyClaim = (taskId) => ({ taskId, lane: 'LAB', planId: 'arc-a-r1', planHash: HEX64, conversationId: 'conv-1', startedAt: ISO, mutexes: [], state: 'COMPLETE', stateHistory: [{ state: 'CLAIMED', at: ISO, by: 'worker' }, { state: 'COMPLETE', at: ISO, by: 'worker' }], reason: null, mutexesReleasedAt: ISO, resumeCount: 0 });
const arcClaim = (taskId, arcId) => Object.assign(legacyClaim(taskId), { arcId });
const legacyToken = (taskId) => ({ taskId, planId: 'arc-a-r1', planHash: HEX64, authorizedAt: ISO, authorizedBy: 'owner' });
const arcToken = (taskId, arcId) => Object.assign(legacyToken(taskId), { arcId });
const mkPlan = (arcId) => { const p = { planId: 'arc-a-r1', source: '.ai-reports/handoffs/2026-08-22_arc-a.COWORK.md', sourceHash: HEX64, repoRef: HEX40, generatedAt: ISO, mutexRegistry: MUTEX_REGISTRY.slice(), tasks: [{ id: 'TASK-10', lane: 'LAB', entryMode: 'DIRECT', requiresOwnerGo: false, mutexes: [], dependsOn: [], priority: 10, closeCondition: 'A fixture harness is complete and a handoff is registered.' }] }; if (arcId) p.arcId = arcId; return p; };
const mkCurrent = (arcId) => { const c = { planId: 'arc-a-r1', planHash: HEX64, source: '.ai-reports/handoffs/2026-08-22_arc-a.COWORK.md', sourceHash: HEX64, ref: HEX40, publishedAt: ISO, publishedBy: 'owner', supersedesPlanId: null, staleSourceAcknowledged: false, refMismatchAcknowledged: false, carriedOverClaims: [] }; if (arcId) c.arcId = arcId; return c; };
const holderLegacy = (taskId, lane) => ({ taskId, lane: lane || 'LAB', acquiredAt: ISO });
const holderArc = (taskId, arcId, lane) => Object.assign(holderLegacy(taskId, lane), { arcId });

console.log('ARC runtime schemas + topology contract (P-E0, B4) - structural proofs');
const liveRuntime = abs(REL.runtime);
const liveExists = fs.existsSync(liveRuntime);
const liveBefore = liveExists ? treeHash(liveRuntime) : null;
const legacyHashBefore = {};
if (liveExists) for (const f of LEGACY_BYTE_SET) { const p = path.join(liveRuntime, f); legacyHashBefore[f] = fs.existsSync(p) ? sha256(fs.readFileSync(p)) : null; }

let ident = null;
try { ident = require(abs(REL.identity)); } catch (e) { console.log('  (runtime-identity.js not loadable: ' + e.message.split('\n')[0] + ')'); }

try {
  // ── RS-0 schemas present, drift guards ─────────────────────────────────────
  section('RS-0 schemas present + drift guards');
  const S = {};
  for (const k of Object.keys(REL.schemas)) {
    try { S[k] = JSON.parse(stripCR(readText(REL.schemas[k]))); } catch (e) { S[k] = null; }
    check('schema ' + k + '.schema.json present and parses', !!S[k]);
  }
  check('B1 library loads (external $ref + registry cross-check)', !!lib);
  const kws = new Set();
  Object.values(S).forEach((s) => keywordsOf(s, kws));
  const unsupported = Array.from(kws).filter((k) => !SUPPORTED.includes(k));
  check('validator drift guard: every keyword used by the five schemas is supported (' + (unsupported.join(', ') || 'none unsupported') + ')', unsupported.length === 0);
  const get = (o, p) => p.split('.').reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), o);
  const defsArc = (s) => (s && s.$defs && s.$defs.arcId) ? JSON.stringify(s.$defs.arcId) : null;
  check('RS-0 arcId definition present in $defs of plan/current/claim/authorized/holder', Object.values(S).every((s) => defsArc(s) !== null));
  check('RS-0 arcId definition IDENTICAL across the five schemas (no drift)', (() => { const v = Object.values(S).map(defsArc); return v.every((x) => x !== null && x === v[0]); })());
  check('RS-0 arcId: pattern ^[A-Z0-9]([A-Z0-9-]*[A-Z0-9])?$, maxLength 24, reserved device names excluded (N-3)', get(S, 'plan.$defs.arcId.pattern') === '^[A-Z0-9]([A-Z0-9-]*[A-Z0-9])?$' && get(S, 'plan.$defs.arcId.maxLength') === 24 && JSON.stringify(get(S, 'plan.$defs.arcId.not.enum')) === JSON.stringify(RESERVED_DEVICE_NAMES));
  for (const k of ['plan', 'current', 'claim', 'authorized', 'holder']) check('RS-0 ' + k + '.schema: properties.arcId refs #/$defs/arcId and arcId is OPTIONAL (not in required)', !!(S[k] && S[k].properties.arcId && S[k].properties.arcId.$ref === '#/$defs/arcId' && !S[k].required.includes('arcId')));
  check('RS-2 plan.schema required unchanged', !!(S.plan && JSON.stringify(S.plan.required) === JSON.stringify(['planId', 'source', 'sourceHash', 'repoRef', 'generatedAt', 'mutexRegistry', 'tasks'])));
  check('RS-2 plan.schema task required unchanged', !!(S.plan && JSON.stringify(S.plan.$defs.task.required) === JSON.stringify(['id', 'lane', 'entryMode', 'requiresOwnerGo', 'closeCondition'])));
  check('RS-2 current.schema required unchanged', !!(S.current && JSON.stringify(S.current.required) === JSON.stringify(['planId', 'planHash', 'source', 'sourceHash', 'ref', 'publishedAt', 'publishedBy'])));
  check('RS-2 claim.schema required unchanged', !!(S.claim && JSON.stringify(S.claim.required) === JSON.stringify(['taskId', 'lane', 'planId', 'planHash', 'conversationId', 'startedAt', 'mutexes', 'state'])));
  check('RS-2 authorized.schema required unchanged', !!(S.authorized && JSON.stringify(S.authorized.required) === JSON.stringify(['taskId', 'planId', 'planHash', 'authorizedAt', 'authorizedBy'])));
  check('RS-0 holder.schema required == [taskId, lane, acquiredAt], additionalProperties false, $id arc/holder.schema.json', !!(S.holder && JSON.stringify(S.holder.required) === JSON.stringify(['taskId', 'lane', 'acquiredAt']) && S.holder.additionalProperties === false && S.holder.$id === 'arc/holder.schema.json'));
  check('RS-0 every schema keeps additionalProperties false', Object.values(S).every((s) => s && s.additionalProperties === false));
  check('RS-9 plan.schema planId reserves "arcs" (not.enum)', !!(S.plan && S.plan.properties.planId.not && JSON.stringify(S.plan.properties.planId.not.enum) === JSON.stringify(['arcs'])));
  check('RS-9 current.schema planId reserves "arcs" (not.enum)', !!(S.current && S.current.properties.planId.not && JSON.stringify(S.current.properties.planId.not.enum) === JSON.stringify(['arcs'])));
  check('RS-10 global mutex-class count unchanged: plan.schema 8 == claim.schema 8 == profile-contract MUTEX_REGISTRY 8, none carries an ARC qualifier', !!(S.plan && S.claim && lib && S.plan.$defs.mutexClass.enum.length === 8 && JSON.stringify(S.plan.$defs.mutexClass.enum) === JSON.stringify(MUTEX_REGISTRY) && JSON.stringify(S.claim.properties.mutexes.items.enum) === JSON.stringify(MUTEX_REGISTRY) && JSON.stringify(lib.MUTEX_REGISTRY) === JSON.stringify(MUTEX_REGISTRY) && MUTEX_REGISTRY.every((c) => !/ARC/.test(c))));
  check('RS-0 current.schema description states the manifest reuses the field set verbatim (arcId lands in both)', !!(S.current && /manifest\.json/.test(S.current.description) && /arcId/.test(S.current.description)));
  check('RS-0 claim.schema arcId description: required in arc-claims/ records (equal to the directory), absent in claims/ records; shape-only', /arc-claims/.test(get(S, 'claim.properties.arcId.description') || '') && /claims\//.test(get(S, 'claim.properties.arcId.description') || '') && /shape/i.test(get(S, 'claim.properties.arcId.description') || ''));
  check('RS-0 authorized.schema arcId description: same namespace rule', /arc-claims/.test(get(S, 'authorized.properties.arcId.description') || ''));
  check('RS-0 holder.schema: taskId accepts task ids and the reserved __PUBLISH__ / __OWNER__; lane enum MAIN/LAB/COWORK/OWNER', Array.isArray(get(S, 'holder.properties.taskId.anyOf')) && JSON.stringify(get(S, 'holder.$defs.reservedHolderId.enum')) === JSON.stringify(['__PUBLISH__', '__OWNER__']) && JSON.stringify(get(S, 'holder.properties.lane.enum')) === JSON.stringify(['MAIN', 'LAB', 'COWORK', 'OWNER']));
  check('RS-0 holder.schema description states the owner pair (arcId ?? null, taskId) and that classes stay global', /arcId \?\? null, taskId/.test(get(S, 'holder.description') || '') && /global/.test(get(S, 'holder.description') || ''));
  const ok = (k, v) => !!S[k] && validate(S[k], v, S[k]).length === 0;
  const viol = (k, v) => (S[k] ? validate(S[k], v, S[k]) : ['schema absent']);

  // ── RS-1 the 8 LEGACY_SCHEMA_SET records validate byte-for-byte ───────────
  section('RS-1 / RS-13 live legacy records (read-only)');
  check('live runtime present (' + REL.runtime + ')', liveExists);
  if (liveExists) {
    for (const rec of LEGACY_SCHEMA_SET) {
      const p = path.join(liveRuntime, rec.file);
      let obj = null;
      try { obj = JSON.parse(stripCR(fs.readFileSync(p, 'utf8'))); } catch (e) { obj = null; }
      const v = obj ? viol(rec.schema, obj) : ['unreadable'];
      check('RS-1 legacy ' + rec.file + ' validates under expanded ' + rec.schema + '.schema' + (v.length ? ' - ' + v.slice(0, 3).join('; ') : ''), v.length === 0);
      check('RS-1 legacy ' + rec.file + ' carries no arcId (legacy stream)', !!obj && !('arcId' in obj));
    }
    check('RS-1 LEGACY_SCHEMA_SET count == 8 (N-1)', LEGACY_SCHEMA_SET.length === 8);
    for (const f of ['plans/parallel-arc-v2-2026-08-15/plan.json', 'plans/parallel-arc-v3-2026-08-15/plan.json']) {
      try { const o = JSON.parse(stripCR(fs.readFileSync(path.join(liveRuntime, f), 'utf8'))); const v = viol('plan', o); console.log('  (info) ' + f + ' under plan.schema: ' + (v.length ? 'violations ' + v.slice(0, 3).join('; ') : 'valid')); } catch (e) { console.log('  (info) ' + f + ' unreadable'); }
    }
    check('RS-13 LEGACY_BYTE_SET count == 12 and every file present (N-1)', LEGACY_BYTE_SET.length === 12 && LEGACY_BYTE_SET.every((f) => legacyHashBefore[f] !== null));
    check('RS-12 live runtime has no arc-claims/ and no plans/arcs/ (B4 creates nothing)', !fs.existsSync(path.join(liveRuntime, 'arc-claims')) && !fs.existsSync(path.join(liveRuntime, 'plans', 'arcs')));
    check('RS-12 live runtime root completeness is exactly plans + claims + mutex', ROOT_TRIPLE.every((d) => fs.existsSync(path.join(liveRuntime, d))));
  }

  // ── RS-3 ARC-shaped plan / current / manifest ───────────────────────────────
  section('RS-3 ARC-shaped records + arcIdTriple');
  check('RS-3 ARC plan with arcId validates', ok('plan', mkPlan('ARC-A')));
  check('RS-3 legacy plan without arcId still validates', ok('plan', mkPlan(null)));
  check('RS-3 ARC current.json / manifest.json with arcId validate', ok('current', mkCurrent('ARC-A')));
  check('RS-3 legacy current.json without arcId still validates', ok('current', mkCurrent(null)));
  check('RS-9 plan.schema rejects planId "arcs"', !ok('plan', Object.assign(mkPlan(null), { planId: 'arcs' })));
  check('RS-9 current.schema rejects planId "arcs"', !ok('current', Object.assign(mkCurrent(null), { planId: 'arcs' })));
  check('RS-9 profile-contract planCheck refuses planId "arcs" under P-V11 (B1 consistency)', !!lib && lib.planCheck(Object.assign(mkPlan(null), { planId: 'arcs' }), { requireProfiles: false }).violations.some((v) => v.rule === 'P-V11'));
  for (const bad of ['arc-a', 'ARC_A', '-ARC', 'ARC-', 'A'.repeat(25), 'CON', 'COM1', 'LPT9', 'NUL']) {
    check('RS-11 arcId ' + JSON.stringify(bad) + ' rejected by plan/current/claim/authorized/holder schemas', !ok('plan', mkPlan(bad)) && !ok('current', mkCurrent(bad)) && !ok('claim', arcClaim('TASK-10', bad)) && !ok('authorized', arcToken('TASK-10', bad)) && !ok('holder', holderArc('TASK-10', bad)));
  }
  check('RS-11 taskId reserved device name still rejected by plan.schema (uniform guard, N-3)', !ok('plan', (() => { const p = mkPlan(null); p.tasks[0].id = 'CON'; return p; })()));

  if (!ident) {
    console.log('  (runtime-identity.js not loadable - helper groups RS-4..RS-8 skipped; RED)');
    check('runtime-identity.js present and loads', false);
  } else {
    section('RS-15 runtime-identity.js purity + exports');
    const src = stripCR(readText(REL.identity));
    for (const fn of ['namespaceOf', 'claimIdentityFromPath', 'claimMatchesPath', 'authorizedMatchesPath', 'holderOwnershipMatches', 'arcIdTriple']) check('RS-15 exports ' + fn, typeof ident[fn] === 'function');
    check('RS-15 pure: no fs / child_process / http / net requires', !/require\(['"](fs|child_process|http|https|net|os|path)['"]\)/.test(src));
    check('RS-15 pure: no clock, no randomness, no process / globalThis access', !/\bDate\b|Math\.random|process\.|globalThis|setTimeout|setInterval/.test(src));
    check('RS-15 pure: no write / mkdir / spawn tokens', !/writeFile|mkdir|rename|unlink|rmSync|spawn|exec\(/.test(src));
    check('RS-15 never mentions ARC routing flags or root-completeness triples (no behaviour leak)', !/--arc\b|depSatisfied|RUNTIME_ROOT|'plans', 'claims', 'mutex'/.test(src));
    check('RS-15 reserved device names exported and equal the schema list', JSON.stringify(ident.RESERVED_DEVICE_NAMES) === JSON.stringify(RESERVED_DEVICE_NAMES));
    check('RS-15 isValidArcId / isValidTaskId apply the reserved guard uniformly (N-3)', ident.isValidArcId('ARC-A') && !ident.isValidArcId('CON') && !ident.isValidArcId('arc-a') && !ident.isValidArcId('A'.repeat(25)) && ident.isValidTaskId('TASK-10') && !ident.isValidTaskId('CON') && !ident.isValidTaskId('__OWNER__'));
    check('RS-15 node --check', spawnSync(process.execPath, ['--check', abs(REL.identity)], { encoding: 'utf8' }).status === 0);

    // ── RS-4 schema-alone proof: namespace-invalid records still validate ────
    section('RS-4 schema validates shape only (D-23); namespace rule lives in the helper');
    const wrong1 = arcClaim('TASK-10', 'ARC-A');          // arcId on a LEGACY path
    const wrong2 = legacyClaim('TASK-10');                 // no arcId on an ARC path
    check('RS-4 claim with arcId validates by schema but claimMatchesPath(legacy path) -> MISMATCH', ok('claim', wrong1) && ident.claimMatchesPath(wrong1, 'claims/TASK-10/claim.json').verdict === 'MISMATCH');
    check('RS-4 claim without arcId validates by schema but claimMatchesPath(arc path) -> MISMATCH', ok('claim', wrong2) && ident.claimMatchesPath(wrong2, 'arc-claims/ARC-A/TASK-10/claim.json').verdict === 'MISMATCH');
    check('RS-4 token with arcId validates by schema but authorizedMatchesPath(legacy path) -> MISMATCH', ok('authorized', arcToken('TASK-10', 'ARC-A')) && ident.authorizedMatchesPath(arcToken('TASK-10', 'ARC-A'), 'claims/TASK-10/authorized.json').verdict === 'MISMATCH');
    check('RS-4 token without arcId validates by schema but authorizedMatchesPath(arc path) -> MISMATCH', ok('authorized', legacyToken('TASK-10')) && ident.authorizedMatchesPath(legacyToken('TASK-10'), 'arc-claims/ARC-A/TASK-10/authorized.json').verdict === 'MISMATCH');

    // ── RS-5 namespaceOf / claimIdentityFromPath / claimMatchesPath / authorizedMatchesPath
    section('RS-5 path identity helpers');
    const n1 = ident.namespaceOf('claims/TASK-10/claim.json');
    check('RS-5 namespaceOf legacy claim.json', n1.ok && n1.namespace === 'legacy' && n1.arcId === null && n1.taskId === 'TASK-10' && n1.file === 'claim.json');
    const n2 = ident.namespaceOf('arc-claims/ARC-A/TASK-10/authorized.json');
    check('RS-5 namespaceOf arc authorized.json', n2.ok && n2.namespace === 'arc' && n2.arcId === 'ARC-A' && n2.taskId === 'TASK-10' && n2.file === 'authorized.json');
    const n3 = ident.namespaceOf('arc-claims/ARC-B/TASK-10');
    check('RS-5 namespaceOf arc directory (no file)', n3.ok && n3.namespace === 'arc' && n3.arcId === 'ARC-B' && n3.file === null);
    check('RS-5 namespaceOf normalizes backslashes', ident.namespaceOf('claims\\TASK-10\\claim.json').ok === true);
    for (const bad of ['claims/arcs/TASK-10', 'arc-claims/TASK-10', 'arc-claims/ARC-A', '../claims/TASK-10', '/claims/TASK-10', 'claims/TASK-10/other.json', 'mutex/CODE__index-html/holder.json', 'arc-claims/arc-a/TASK-10', 'arc-claims/CON/TASK-10', 'claims/con/claim.json', 'claims//TASK-10', 'arc-claims/ARC-A/TASK-10/claim.json/extra', '', 'plans/arcs/ARC-A/current.json']) {
      const r = ident.namespaceOf(bad);
      check('RS-5 namespaceOf rejects ' + JSON.stringify(bad) + ' fail-closed (ok false, namespace null)', r.ok === false && r.namespace === null && typeof r.reason === 'string' && r.reason.length > 0);
    }
    const k1 = ident.claimIdentityFromPath('claims/TASK-10');
    const k2 = ident.claimIdentityFromPath('arc-claims/ARC-A/TASK-10');
    const k3 = ident.claimIdentityFromPath('arc-claims/ARC-B/TASK-10');
    check('RS-5 claimIdentityFromPath keys: legacy (null, TASK-10), ARC-A, ARC-B all distinct', k1.ok && k2.ok && k3.ok && JSON.stringify(k1.key) === JSON.stringify({ arcId: null, taskId: 'TASK-10' }) && JSON.stringify(k2.key) === JSON.stringify({ arcId: 'ARC-A', taskId: 'TASK-10' }) && JSON.stringify(k3.key) === JSON.stringify({ arcId: 'ARC-B', taskId: 'TASK-10' }));
    check('RS-5 claimMatchesPath legacy MATCH', ident.claimMatchesPath(legacyClaim('TASK-10'), 'claims/TASK-10/claim.json').verdict === 'MATCH' && ident.claimMatchesPath(legacyClaim('TASK-10'), 'claims/TASK-10').ok === true);
    check('RS-5 claimMatchesPath arc MATCH', ident.claimMatchesPath(arcClaim('TASK-10', 'ARC-A'), 'arc-claims/ARC-A/TASK-10/claim.json').verdict === 'MATCH');
    check('RS-5 claimMatchesPath taskId != directory -> MISMATCH', ident.claimMatchesPath(legacyClaim('TASK-11'), 'claims/TASK-10/claim.json').verdict === 'MISMATCH');
    check('RS-5 claimMatchesPath arcId != directory -> MISMATCH (ARC-B claim under ARC-A)', ident.claimMatchesPath(arcClaim('TASK-10', 'ARC-B'), 'arc-claims/ARC-A/TASK-10/claim.json').verdict === 'MISMATCH');
    check('RS-5 claimMatchesPath authorized.json path -> INVALID (wrong record kind)', ident.claimMatchesPath(legacyClaim('TASK-10'), 'claims/TASK-10/authorized.json').verdict === 'INVALID');
    check('RS-5 claimMatchesPath malformed inputs -> INVALID, ok false', ident.claimMatchesPath(null, 'claims/TASK-10/claim.json').ok === false && ident.claimMatchesPath(legacyClaim('TASK-10'), 'claims/arcs/TASK-10').ok === false && ident.claimMatchesPath({ taskId: 'TASK-10', arcId: 'con' }, 'arc-claims/CON/TASK-10').ok === false);
    check('RS-5 authorizedMatchesPath legacy / arc MATCH', ident.authorizedMatchesPath(legacyToken('TASK-10'), 'claims/TASK-10/authorized.json').verdict === 'MATCH' && ident.authorizedMatchesPath(arcToken('TASK-10', 'ARC-A'), 'arc-claims/ARC-A/TASK-10/authorized.json').verdict === 'MATCH' && ident.authorizedMatchesPath(arcToken('TASK-10', 'ARC-A'), 'arc-claims/ARC-A/TASK-10').ok === true);
    check('RS-5 authorizedMatchesPath taskId / arcId mismatch -> MISMATCH; claim.json path -> INVALID', ident.authorizedMatchesPath(legacyToken('TASK-11'), 'claims/TASK-10/authorized.json').verdict === 'MISMATCH' && ident.authorizedMatchesPath(arcToken('TASK-10', 'ARC-B'), 'arc-claims/ARC-A/TASK-10/authorized.json').verdict === 'MISMATCH' && ident.authorizedMatchesPath(legacyToken('TASK-10'), 'claims/TASK-10/claim.json').verdict === 'INVALID');
    check('RS-5 every verdict object is structured {ok, verdict, reasons[]}', (() => { const r = ident.claimMatchesPath(legacyClaim('TASK-10'), 'claims/TASK-11/claim.json'); return r.ok === false && r.verdict === 'MISMATCH' && Array.isArray(r.reasons) && r.reasons.length > 0; })());
    if (liveExists) {
      for (const d of ['G1-CLOCK-SEAM', 'LX-2', 'LX-3', 'LX-4']) {
        const c = JSON.parse(stripCR(fs.readFileSync(path.join(liveRuntime, 'claims', d, 'claim.json'), 'utf8')));
        check('RS-5 live legacy claim ' + d + ' claimMatchesPath(claims/' + d + '/claim.json) -> MATCH', ident.claimMatchesPath(c, 'claims/' + d + '/claim.json').verdict === 'MATCH');
      }
      const tok = JSON.parse(stripCR(fs.readFileSync(path.join(liveRuntime, 'claims', 'G1-CLOCK-SEAM', 'authorized.json'), 'utf8')));
      check('RS-5 live G1 authorized.json authorizedMatchesPath -> MATCH', ident.authorizedMatchesPath(tok, 'claims/G1-CLOCK-SEAM/authorized.json').verdict === 'MATCH');
    }

    // ── RS-6 holder schema positive / negative ─────────────────────────────
    section('RS-6 holder.schema.json');
    check('RS-6 legacy holder {taskId, lane, acquiredAt} validates', ok('holder', holderLegacy('TASK-10')));
    check('RS-6 ARC holder {..., arcId} validates', ok('holder', holderArc('TASK-10', 'ARC-A')));
    check('RS-6 __PUBLISH__ holder (lane OWNER) validates, with and without arcId', ok('holder', holderLegacy('__PUBLISH__', 'OWNER')) && ok('holder', holderArc('__PUBLISH__', 'ARC-A', 'OWNER')));
    check('RS-6 __OWNER__ holder (lane OWNER) validates', ok('holder', holderLegacy('__OWNER__', 'OWNER')));
    check('RS-6 live-shaped legacy holder line validates (claim-protocol printf)', ok('holder', JSON.parse('{"taskId":"LX-5","lane":"LAB","acquiredAt":"2026-08-22T10:00:00Z"}')));
    check('RS-6 missing acquiredAt rejected', !ok('holder', { taskId: 'TASK-10', lane: 'LAB' }));
    check('RS-6 extra key rejected', !ok('holder', Object.assign(holderLegacy('TASK-10'), { planId: 'x' })));
    check('RS-6 bad lane rejected', !ok('holder', holderLegacy('TASK-10', 'HERDR')));
    check('RS-6 __OTHER__ reserved-shaped id rejected', !ok('holder', holderLegacy('__OTHER__', 'OWNER')));
    check('RS-6 lowercase taskId rejected', !ok('holder', holderLegacy('task-10')));
    check('RS-6 reserved device-name taskId rejected', !ok('holder', holderLegacy('CON')));
    check('RS-6 bad acquiredAt rejected', !ok('holder', { taskId: 'TASK-10', lane: 'LAB', acquiredAt: 'yesterday' }));
    check('RS-6 arcId null rejected (absent, never null)', !ok('holder', Object.assign(holderLegacy('TASK-10'), { arcId: null })));

    // ── RS-7 holderOwnershipMatches (K14, D-28) ────────────────────────────
    section('RS-7 holderOwnershipMatches');
    const own = (h, i) => ident.holderOwnershipMatches(h, i);
    check('RS-7 legacy holder vs legacy identity -> OWNER', own(holderLegacy('TASK-10'), { taskId: 'TASK-10' }).verdict === 'OWNER' && own(holderLegacy('TASK-10'), { taskId: 'TASK-10', arcId: null }).ok === true);
    check('RS-7 ARC-A holder vs ARC-A identity -> OWNER', own(holderArc('TASK-10', 'ARC-A'), { taskId: 'TASK-10', arcId: 'ARC-A' }).verdict === 'OWNER');
    check('RS-7 legacy identity vs ARC holder with the same taskId -> NOT-OWNER (D-28)', own(holderArc('TASK-10', 'ARC-A'), { taskId: 'TASK-10' }).verdict === 'NOT-OWNER');
    check('RS-7 ARC identity vs legacy holder with the same taskId -> NOT-OWNER (D-28)', own(holderLegacy('TASK-10'), { taskId: 'TASK-10', arcId: 'ARC-A' }).verdict === 'NOT-OWNER');
    check('RS-7 ARC-A identity vs ARC-B holder, same taskId -> NOT-OWNER (E)', own(holderArc('TASK-10', 'ARC-B'), { taskId: 'TASK-10', arcId: 'ARC-A' }).verdict === 'NOT-OWNER');
    check('RS-7 different taskId -> NOT-OWNER', own(holderLegacy('TASK-11'), { taskId: 'TASK-10' }).verdict === 'NOT-OWNER');
    check('RS-7 __OWNER__ reserved holder vs __OWNER__ identity -> OWNER; vs task identity -> NOT-OWNER', own(holderLegacy('__OWNER__', 'OWNER'), { taskId: '__OWNER__' }).verdict === 'OWNER' && own(holderLegacy('__OWNER__', 'OWNER'), { taskId: 'TASK-10' }).verdict === 'NOT-OWNER');
    check('RS-7 __PUBLISH__ holder acting for ARC-A vs __PUBLISH__ legacy identity -> NOT-OWNER', own(holderArc('__PUBLISH__', 'ARC-A', 'OWNER'), { taskId: '__PUBLISH__' }).verdict === 'NOT-OWNER');
    check('RS-7 malformed holder / identity -> INVALID, ok false (fail closed)', own(null, { taskId: 'TASK-10' }).verdict === 'INVALID' && own({ lane: 'LAB' }, { taskId: 'TASK-10' }).ok === false && own(holderLegacy('TASK-10'), {}).ok === false && own(Object.assign(holderLegacy('TASK-10'), { arcId: 'con' }), { taskId: 'TASK-10', arcId: 'con' }).verdict === 'INVALID');
    check('RS-7 verdict carries the compared pairs', (() => { const r = own(holderArc('TASK-10', 'ARC-A'), { taskId: 'TASK-10' }); return r.pair && r.pair.holder.arcId === 'ARC-A' && r.pair.identity.arcId === null; })());

    // ── RS-3b arcIdTriple ─────────────────────────────────────────────────
    section('RS-3 arcIdTriple');
    const triple = (p, m, c, exp) => ident.arcIdTriple({ plan: p, manifest: m, current: c }, exp);
    check('RS-3 ARC triple equal -> ARC ok', (() => { const r = triple(mkPlan('ARC-A'), mkCurrent('ARC-A'), mkCurrent('ARC-A'), 'ARC-A'); return r.ok && r.verdict === 'ARC' && r.arcId === 'ARC-A'; })());
    check('RS-3 ARC triple equal, no expectation -> ARC ok', triple(mkPlan('ARC-A'), mkCurrent('ARC-A'), mkCurrent('ARC-A')).verdict === 'ARC');
    check('RS-3 legacy triple (all absent), no expectation -> LEGACY ok', (() => { const r = triple(mkPlan(null), mkCurrent(null), mkCurrent(null)); return r.ok && r.verdict === 'LEGACY' && r.arcId === null; })());
    check('RS-3 legacy triple but ARC expected -> MISMATCH', triple(mkPlan(null), mkCurrent(null), mkCurrent(null), 'ARC-A').verdict === 'MISMATCH');
    check('RS-3 manifest missing arcId -> MISMATCH', triple(mkPlan('ARC-A'), mkCurrent(null), mkCurrent('ARC-A')).verdict === 'MISMATCH');
    check('RS-3 current differs -> MISMATCH', triple(mkPlan('ARC-A'), mkCurrent('ARC-A'), mkCurrent('ARC-B')).verdict === 'MISMATCH');
    check('RS-3 expected differs from the equal triple -> MISMATCH', triple(mkPlan('ARC-A'), mkCurrent('ARC-A'), mkCurrent('ARC-A'), 'ARC-B').verdict === 'MISMATCH');
    check('RS-3 invalid / reserved arcId in the triple -> INVALID', triple(mkPlan('CON'), mkCurrent('CON'), mkCurrent('CON')).verdict === 'INVALID' && triple(null, mkCurrent('ARC-A'), mkCurrent('ARC-A')).ok === false);
    check('RS-3 reasons name the offending member', /manifest/.test(triple(mkPlan('ARC-A'), mkCurrent(null), mkCurrent('ARC-A')).reasons.join(' ')));

    // ── RS-8 topology coexistence (filesystem, temp tree) ─────────────────
    section('RS-8 legacy + ARC topology coexistence (temp tree)');
    const rt = tmp('topology');
    for (const d of ROOT_TRIPLE) fs.mkdirSync(path.join(rt, d));
    fs.mkdirSync(path.join(rt, 'arc-claims'));                  // the future owner-bootstrap root (simulated here only)
    fs.mkdirSync(path.join(rt, 'plans', 'arcs'));
    const mk = (rel) => { try { fs.mkdirSync(path.join(rt, rel)); return true; } catch (e) { return e.code; } };
    check('RS-8 mkdir claims/TASK-10, arc-claims/ARC-A/TASK-10, arc-claims/ARC-B/TASK-10 all succeed (plain mkdir)', mk('claims/TASK-10') === true && mk('arc-claims/ARC-A') === true && mk('arc-claims/ARC-A/TASK-10') === true && mk('arc-claims/ARC-B') === true && mk('arc-claims/ARC-B/TASK-10') === true);
    check('RS-8 a second plain mkdir of each fails EEXIST (claim atomicity preserved per namespace)', mk('claims/TASK-10') === 'EEXIST' && mk('arc-claims/ARC-A/TASK-10') === 'EEXIST' && mk('arc-claims/ARC-B/TASK-10') === 'EEXIST');
    const recs = [['claims/TASK-10/claim.json', legacyClaim('TASK-10')], ['arc-claims/ARC-A/TASK-10/claim.json', arcClaim('TASK-10', 'ARC-A')], ['arc-claims/ARC-B/TASK-10/claim.json', arcClaim('TASK-10', 'ARC-B')]];
    recs.forEach(([rel, obj]) => fs.writeFileSync(path.join(rt, rel), JSON.stringify(obj, null, 2) + '\n'));
    check('RS-8 the three coexisting claim.json validate and each matches its own path', recs.every(([rel]) => { const o = JSON.parse(fs.readFileSync(path.join(rt, rel), 'utf8')); return ok('claim', o) && ident.claimMatchesPath(o, rel).verdict === 'MATCH'; }));
    check('RS-8 claim identities are three distinct keys', new Set(recs.map(([rel]) => JSON.stringify(ident.claimIdentityFromPath(rel).key))).size === 3);
    check('RS-8 sibling arc-claims/ is invisible to a claims/* loop (readdir claims == [TASK-10])', JSON.stringify(fs.readdirSync(path.join(rt, 'claims'))) === JSON.stringify(['TASK-10']));
    check('RS-8 plans/arcs/ is a sibling container under plans/ that a plans/<planId> loop would see as "arcs" - hence the reserved planId', fs.readdirSync(path.join(rt, 'plans')).includes('arcs') && !ok('plan', Object.assign(mkPlan(null), { planId: 'arcs' })));
    check('RS-8 root completeness of the temp tree is the triple (arc-claims / plans/arcs are additional, never required)', ROOT_TRIPLE.every((d) => fs.existsSync(path.join(rt, d))));
    const bashGlob = spawnSync('bash', ['-c', 'cd "$1" && for c in "$1"/claims/*/; do basename "$c"; done', '_', rt], { encoding: 'utf8' });
    if (bashGlob.status === 0) check('RS-8 the owner-ops INSPECT glob "$ROOT"/claims/*/ lists only TASK-10 (bash)', bashGlob.stdout.trim() === 'TASK-10');
    else console.log('  (bash not available for the glob check - readdir proof stands)');
    // holders: the same global class directory name, disambiguated only by holder.arcId
    fs.mkdirSync(path.join(rt, 'mutex', 'CODE__index-html'));
    fs.writeFileSync(path.join(rt, 'mutex', 'CODE__index-html', 'holder.json'), JSON.stringify(holderArc('TASK-10', 'ARC-A')) + '\n');
    check('RS-8 mutex class directory is global: a second mkdir of mutex/CODE__index-html fails EEXIST regardless of ARC', mk('mutex/CODE__index-html') === 'EEXIST');
    check('RS-8 ARC-B identity does not own the ARC-A holder of the global class (structural pair rule)', ident.holderOwnershipMatches(JSON.parse(fs.readFileSync(path.join(rt, 'mutex', 'CODE__index-html', 'holder.json'), 'utf8')), { taskId: 'TASK-10', arcId: 'ARC-B' }).verdict === 'NOT-OWNER');
  }

  // ── docs ──────────────────────────────────────────────────────────────────
  section('docs + wiring');
  const rc = fs.existsSync(abs(REL.docs.runtimeContract)) ? stripCR(readText(REL.docs.runtimeContract)) : '';
  const sec2 = sectionOf(rc, /^## 2\. Layout/) || '', sec3 = sectionOf(rc, /^## 3\. Mutex registry/) || '', sec51 = sectionOf(rc, /^## 5\.1 Dependency resolution/) || '', sec6 = sectionOf(rc, /^## 6\. Worker write allowlist/) || '', sec1 = sectionOf(rc, /^## 1\. Root resolution/) || '';
  check('docs runtime-contract §2 layout names arc-claims/<ARC-ID>/<TASK-ID>/ and plans/arcs/<ARC-ID>/current.json and the holder arcId', /arc-claims\/<ARC-ID>\/<TASK-ID>\//.test(sec2) && /plans\/arcs\/<ARC-ID>\/current\.json/.test(sec2) && /arcId/.test(sec2));
  check('docs runtime-contract §2: roots are owner-bootstrap; publisher creates only arc-claims/<ARC-ID>/ (step 9b); workers never create; root completeness stays plans + claims + mutex', /bootstrap/.test(sec2) && /9b/.test(sec2) && /never create/i.test(sec2) && /plans.{0,30}claims.{0,30}mutex/.test(sec2));
  check('docs runtime-contract §2: legacy claims/ frozen for the legacy stream; nothing reads across namespaces', /legacy/i.test(sec2) && /across/i.test(sec2));
  check('docs runtime-contract §3 holder record per holder.schema.json with the (arcId ?? null, taskId) pair; classes stay global; helper named', /holder\.schema\.json/.test(sec3) && /arcId \?\? null, taskId/.test(sec3) && /global/i.test(sec3) && /runtime-identity\.js/.test(sec3) && /holderOwnershipMatches/.test(sec3));
  check('docs runtime-contract §3 mutex registry table unchanged (8 classes)', MUTEX_REGISTRY.every((c) => sec3.indexOf('`' + c + '`') !== -1) && !/ARC:/.test(sec3));
  check('docs runtime-contract §5.1 namespace-scoped depSatisfied(arcId, D) over arc-claims/<arcId>/<D> and legacy claims/<D>; never cross-namespace / cross-ARC', /depSatisfied\(arcId, D\)/.test(sec51) && /arc-claims\/<arcId>\/<D>/.test(sec51) && /claims\/<D>/.test(sec51) && /never\s+cross-namespace/i.test(sec51) && /never\s+cross-ARC/i.test(sec51));
  check('docs runtime-contract §5.1 keeps the generation-durability rule: dependency planId is NOT consulted; own claim stays authority and plan-pinned', /planId.{0,20}NOT consulted/.test(sec51) && /authority/.test(sec51) && /evidence/.test(sec51));
  check('docs runtime-contract §6 two write shapes PER NAMESPACE: claims/<own TASK-ID>/claim.json and arc-claims/<ARC-ID>/<own TASK-ID>/claim.json + mutex holder; never both; never the container', /<ROOT>\/claims\/<own TASK-ID>\/claim\.json/.test(sec6) && /<ROOT>\/arc-claims\/<ARC-ID>\/<own TASK-ID>\/claim\.json/.test(sec6) && /<ROOT>\/mutex\/<own declared class>\/holder\.json/.test(sec6) && /namespace/i.test(sec6));
  check('docs runtime-contract §1 root completeness unchanged (plans/, claims/ and mutex/)', /`plans\/`, `claims\/` and `mutex\/`/.test(sec1) && !/arc-claims/.test(sec1));
  // B6 (P-E execution side, 2026-08-22) implements the routing these B4 sections deliberately deferred.
  // The invariant is now sharper, not weaker: the runtime selector is named ONLY in §2, and §3 / §5.1 / §6
  // still state their rules namespace-generically, with no selector literal leaking into them.
  check('docs runtime-contract §2 names the runtime selector contract (P-E routing) while §3 / §5.1 / §6 stay selector-free (topology stated generically)', /--arc <ARC-ID>/.test(sec2) && /--legacy/.test(sec2) && !/--arc\b/.test(sec3 + sec51 + sec6));
  const rcHead = gitShow(REL.docs.runtimeContract);
  // §4 and §7 are B6-owned from 2026-08-22 (the STOPPED vocabulary note and the ARC fail-closed rows);
  // their HEAD-identity pins were removed mechanically and replaced by the content assertions below.
  if (rcHead) for (const [label, re] of [['5.2', /^## 5\.2/], ['8', /^## 8\./], ['9', /^## 9\./]]) check('docs runtime-contract section ' + label + ' byte-identical to HEAD (B2 / untouched)', sectionOf(rc, re) !== null && sectionOf(rc, re) === sectionOf(rcHead, re));
  const sec4 = sectionOf(rc, /^## 4\./) || '';
  const sec7 = sectionOf(rc, /^## 7\./) || '';
  check('docs runtime-contract §4 keeps the two vocabularies and adds the wrong-`--arc` resume as a STOPPED outcome with no state written', /Task state/.test(sec4) && /Worker outcome/.test(sec4) && /STOPPED/.test(sec4) && /UNCLAIMED/.test(sec4));
  check('docs runtime-contract §7 carries every ARC fail-closed row', ['arc-not-published', 'arc-retired', 'pointer-arc-mismatch', 'claim-arc-mismatch', 'arc-claims-container-missing', 'plan-not-current-for-arc'].every((r) => new RegExp('`' + r + '`').test(sec7)));
  const bs = fs.existsSync(abs(REL.docs.bootstrap)) ? stripCR(readText(REL.docs.bootstrap)) : '';
  check('docs bootstrap.md: fresh bootstrap AND extending the existing legacy root documented separately', /fresh/i.test(bs) && /existing/i.test(bs) && /extend/i.test(bs));
  check('docs bootstrap.md: future owner bootstrap creates plans/arcs and arc-claims with plain mkdir (no mkdir -p command line)', /mkdir "\$ROOT\/plans\/arcs"/.test(bs) && /mkdir "\$ROOT\/arc-claims"/.test(bs) && !/^\s*(&&\s*)?mkdir -p/m.test(bs));
  check('docs bootstrap.md: B4 performs ZERO runtime mkdir; workers never create roots; publisher creates only the per-ARC container at step 9b', /B4/.test(bs) && /zero/i.test(bs) && /never/i.test(bs) && /9b/.test(bs) && /arc-claims\/<ARC-ID>\//.test(bs));
  check('docs bootstrap.md: root completeness stays exactly plans + claims + mutex (arc-claims / plans/arcs never required)', /plans.{0,30}claims.{0,30}mutex/.test(bs) && /never/.test(bs));
  check('docs bootstrap.md: teardown uses rmdir only (no rm -rf command line), per-ARC containers and plans/arcs before the roots', /rmdir/.test(bs) && !/^\s*rm -rf/m.test(bs) && /arc-claims/.test(sectionOf(bs, /^## Teardown/) || ''));
  check('wiring run-offline.js registers qa/arc_runtime_schemas_offline.js', /'qa\/arc_runtime_schemas_offline\.js'/.test(fs.existsSync(abs(REL.docs.runner)) ? readText(REL.docs.runner) : ''));
  check('wiring arc_worker_handshake_offline.js no longer pins runtime-contract §2/§3/§5.1/§6 to HEAD (R-B4-1 narrow flip)', !/byte-identical to HEAD \(B4\/B6 ownership\)/.test(fs.existsSync(abs(REL.docs.handshakeQa)) ? readText(REL.docs.handshakeQa) : ''));

  // ── scope: forbidden files unchanged vs HEAD ──────────────────────────────
  section('scope: forbidden files unchanged');
  for (const f of REL.forbidden) {
    const head = gitShow(f);
    check('scope unchanged vs HEAD: ' + f, head !== null && fs.existsSync(abs(f)) && sha256(stripCR(readText(f))) === sha256(head));
  }
  const ih = gitShow('index.html');
  check('scope unchanged vs HEAD: index.html', ih !== null && sha256(stripCR(readText('index.html'))) === sha256(ih));
} finally {
  cleanup();
}

// ── RS-12 / RS-13 / RS-14 closing proofs ─────────────────────────────────────
section('RS-12 / RS-13 / RS-14 closing proofs');
if (liveExists) {
  check('RS-12 live runtime tree hash unchanged by this suite', treeHash(liveRuntime) === liveBefore);
  check('RS-12 live runtime still has no arc-claims/ and no plans/arcs/ after the suite', !fs.existsSync(path.join(liveRuntime, 'arc-claims')) && !fs.existsSync(path.join(liveRuntime, 'plans', 'arcs')));
  check('RS-13 all 12 LEGACY_BYTE_SET hashes identical before/after', LEGACY_BYTE_SET.every((f) => { const p = path.join(liveRuntime, f); return fs.existsSync(p) && sha256(fs.readFileSync(p)) === legacyHashBefore[f]; }));
}
check('RS-14 every temp tree removed', tempDirs.every((d) => !fs.existsSync(d)));

console.log('\n' + (failed === 0 ? 'ARC RUNTIME SCHEMAS (P-E0): PASS (' + total + ' asserts)' : 'ARC RUNTIME SCHEMAS (P-E0): FAIL (' + failed + ' of ' + total + ' asserts failed)'));
assert.strictEqual(failed, 0, failures.slice(0, 12).join(' | '));
