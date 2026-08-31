'use strict';

/*
 * qa/arc_safecheck_offline.js
 *
 * WU-WFT slice S2+S4 — fixture-driven offline suite for qa/lib/arc-safecheck.js (S2) and
 * qa/lib/named-args.js (S4).
 *
 * Pure Node, no network, NO runtime write, NO registry write. Asserts:
 *   - the normative r2 Definition-of-Done document shape, key-for-key and IN ORDER
 *   - every check's PASS / FAIL / UNVERIFIABLE branch
 *   - the four mandatory authorityArtifact acceptance branches, plus GRANDFATHERED (D-2)
 *   - detection-only: the fixture registry is byte-identical after a run (no silent repair)
 *   - named-args parser cases for the THREE recorded argv mechanisms (pilot-close P1)
 *   - the containment contract: exit 0/1/2, no writes, no network, read-only git
 *
 * Determinism rule (matching qa/arc_registry_offline.js): every behavioural assertion runs
 * against FIXTURES in a temp tree; the one live read is existsSync-guarded and asserts a
 * property, never a count or an inventory. Every temp tree lives under os.tmpdir() and is
 * removed in `finally`; the last assert proves it.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const safecheckLib = require('./lib/arc-safecheck.js');
const namedArgs = require('./lib/named-args.js');

const { PASS, FAIL, UNVERIFIABLE } = safecheckLib;

let total = 0;
let failed = 0;
const failures = [];
const tempDirs = [];

function section(name) { console.log('\n-- ' + name + ' --'); }

function check(label, ok) {
  total += 1;
  if (!ok) { failed += 1; failures.push(label); console.log('  FAIL  ' + label); }
}

function abs(rel) { return path.join(ROOT, rel); }
function readText(rel) { try { return fs.readFileSync(abs(rel), 'utf8'); } catch (e) { return ''; } }
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function stripCR(s) { return String(s).replace(/\r\n/g, '\n'); }

function mkTemp(tag) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wft-safecheck-' + tag + '-'));
  tempDirs.push(d);
  return d;
}

function writeFile(root, rel, body) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
  return full;
}

/** Hash an entire tree (path + content) so "nothing was written" is provable. */
function treeHash(dir) {
  if (!fs.existsSync(dir)) return 'ABSENT';
  const parts = [];
  (function walk(d) {
    fs.readdirSync(d).sort().forEach(function (e) {
      const full = path.join(d, e);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else parts.push(path.relative(dir, full) + ':' + sha256(fs.readFileSync(full)));
    });
  }(dir));
  return sha256(parts.join('|'));
}

/** A fixture repo with no git, no runtime and no registry — the total-absence baseline. */
function bareFixture(tag) {
  const root = mkTemp(tag);
  return {
    root: root,
    opts: {
      repoRoot: root,
      runtimeRoot: path.join(root, '.git', 'arc-runtime'),
      arcsRoot: path.join(root, '.ai-reports', 'arcs'),
      now: '2026-08-31T00:00:00Z'
    }
  };
}

function arcJson(over) {
  const base = {
    arcId: 'X-ARC',
    title: 't',
    state: 'EXECUTING',
    authority: { kind: 'publication-source', artifact: 'src/r2.md', ratifiedAt: '2026-08-31' },
    planning: {
      currentRevision: 2,
      revisions: [
        { rev: 1, source: 'src/r1.md', sourceHash: 'a', status: 'PROMOTED', reviews: [] },
        { rev: 2, source: 'src/r2.md', sourceHash: 'b', status: 'PROMOTED', reviews: [] }
      ]
    },
    execution: { planId: 'x-r2', planHash: 'h', pointer: 'p', claimsRoot: 'c', publishedAt: '2026-08-31T00:00:00Z' }
  };
  return Object.assign(base, over || {});
}

/** Build a registry fixture holding one arc per named branch, then run safecheck once. */
function authorityFixture(arcsByDir) {
  const f = bareFixture('authority');
  writeFile(f.root, 'src/r1.md', 'r1\n');
  writeFile(f.root, 'src/r2.md', 'r2\n');
  Object.keys(arcsByDir).forEach(function (dir) {
    writeFile(f.root, path.join('.ai-reports', 'arcs', dir, 'arc.json'), JSON.stringify(arcsByDir[dir], null, 2) + '\n');
  });
  const before = treeHash(f.opts.arcsRoot);
  const doc = safecheckLib.safecheck(f.opts);
  return { f: f, doc: doc, before: before, after: treeHash(f.opts.arcsRoot) };
}

function findingFor(doc, arcName) {
  const rows = doc.checks.authorityArtifact.arcs || [];
  const hit = rows.filter(function (r) { return r.arc === arcName; })[0];
  return hit ? hit.finding : null;
}

console.log('ARC SAFECHECK (WU-WFT S2+S4) — fixture-driven offline suite');

try {
  // ── 1. normative document shape (Definition of Done) ────────────────────────
  section('DoD document shape — r2 normative');
  const bare = bareFixture('shape');
  const doc = safecheckLib.safecheck(bare.opts);

  check('top-level keys are exactly at, baseline, checks, verdict — in order',
    JSON.stringify(Object.keys(doc)) === JSON.stringify(['at', 'baseline', 'checks', 'verdict']));
  check('baseline keys are exactly branch, head, originParity — in order',
    JSON.stringify(Object.keys(doc.baseline)) === JSON.stringify(['branch', 'head', 'originParity']));

  const EXPECTED_CHECKS = ['branchParity', 'pointerRegistry', 'liveClaims', 'mutexHolders',
    'stagingResidue', 'evidenceFreshness', 'pathToAuthority', 'authorityArtifact',
    'shellPerCommand', 'workerTopology'];
  check('checks are exactly the 10 r2 keys, in the published order (authorityArtifact sits beside pathToAuthority)',
    JSON.stringify(Object.keys(doc.checks)) === JSON.stringify(EXPECTED_CHECKS));
  check('authorityArtifact immediately follows pathToAuthority (r2 §2 placement)',
    Object.keys(doc.checks).indexOf('authorityArtifact') === Object.keys(doc.checks).indexOf('pathToAuthority') + 1);
  check('every check carries a state drawn from the three-value vocabulary',
    EXPECTED_CHECKS.every(function (k) { return [PASS, FAIL, UNVERIFIABLE].indexOf(doc.checks[k].state) !== -1; }));
  check('at is the injected ISO timestamp (determinism)', doc.at === '2026-08-31T00:00:00Z');
  check('liveClaims carries a claims array', Array.isArray(doc.checks.liveClaims.claims));
  check('mutexHolders carries a holders array', Array.isArray(doc.checks.mutexHolders.holders));
  check('evidenceFreshness carries lastGreenAt and writesAfterGreen',
    'lastGreenAt' in doc.checks.evidenceFreshness && Array.isArray(doc.checks.evidenceFreshness.writesAfterGreen));
  check('pathToAuthority carries undeclaredWrites', Array.isArray(doc.checks.pathToAuthority.undeclaredWrites));
  check('authorityArtifact carries an arcs array', Array.isArray(doc.checks.authorityArtifact.arcs));

  // ── 2. degrade rule: whole-surface absence is UNVERIFIABLE, never FAIL ───────
  section('degrade rule — absent surface is UNVERIFIABLE, never a false FAIL');
  check('pointerRegistry degrades when plans/arcs and the registry are absent', doc.checks.pointerRegistry.state === UNVERIFIABLE);
  check('liveClaims degrades when no claim root exists', doc.checks.liveClaims.state === UNVERIFIABLE);
  check('mutexHolders degrades when mutex/ is absent', doc.checks.mutexHolders.state === UNVERIFIABLE);
  check('evidenceFreshness degrades with no recorded GREEN', doc.checks.evidenceFreshness.state === UNVERIFIABLE);
  check('pathToAuthority degrades with no declared write list', doc.checks.pathToAuthority.state === UNVERIFIABLE);
  check('authorityArtifact degrades with no .ai-reports/arcs root (r2: whole-surface absence)', doc.checks.authorityArtifact.state === UNVERIFIABLE);
  check('shellPerCommand degrades with no pending-command input (F8-C has no repo surface)', doc.checks.shellPerCommand.state === UNVERIFIABLE);
  check('workerTopology degrades with no claim root', doc.checks.workerTopology.state === UNVERIFIABLE);
  check('no check FAILs on a totally absent surface',
    EXPECTED_CHECKS.every(function (k) { return doc.checks[k].state !== FAIL; }));

  // ── 3. the four mandatory authorityArtifact branches + D-2 ──────────────────
  section('authorityArtifact — four mandatory acceptance branches (r2) + D-2 GRANDFATHERED');

  const current = authorityFixture({ 'A-CUR': arcJson({ arcId: 'A-CUR' }) });
  check('branch 1/4 CURRENT: artifact = the published revision source -> finding CURRENT',
    findingFor(current.doc, 'A-CUR') === 'CURRENT');
  check('branch 1/4 CURRENT: check PASSes', current.doc.checks.authorityArtifact.state === PASS);

  const missing = authorityFixture({
    'A-MISS': arcJson({ arcId: 'A-MISS', authority: { kind: 'publication-source', artifact: 'src/gone.md', ratifiedAt: 'x' } })
  });
  check('branch 2/4 MISSING: dangling artifact -> finding MISSING', findingFor(missing.doc, 'A-MISS') === 'MISSING');
  check('branch 2/4 MISSING: check FAILs', missing.doc.checks.authorityArtifact.state === FAIL);
  check('branch 2/4 MISSING: the arc is named in the detail', /A-MISS/.test(missing.doc.checks.authorityArtifact.detail || ''));

  const superseded = authorityFixture({
    'A-SUP': arcJson({ arcId: 'A-SUP', authority: { kind: 'publication-source', artifact: 'src/r1.md', ratifiedAt: 'x' } })
  });
  check('branch 3/4 SUPERSEDED: artifact = superseded r(n-1) source while r(n) is published -> finding SUPERSEDED',
    findingFor(superseded.doc, 'A-SUP') === 'SUPERSEDED');
  check('branch 3/4 SUPERSEDED: check FAILs', superseded.doc.checks.authorityArtifact.state === FAIL);
  check('branch 3/4 SUPERSEDED: the arc is named in the detail', /A-SUP/.test(superseded.doc.checks.authorityArtifact.detail || ''));

  const terminal = authorityFixture({
    'A-TERM': arcJson({ arcId: 'A-TERM', state: 'CLOSED', authority: { kind: 'publication-source', artifact: 'src/r1.md', ratifiedAt: 'x' } })
  });
  check('branch 4/4 TERMINAL-HISTORICAL: CLOSED arc with a stale artifact -> finding TERMINAL-HISTORICAL',
    findingFor(terminal.doc, 'A-TERM') === 'TERMINAL-HISTORICAL');
  check('branch 4/4 TERMINAL-HISTORICAL: NOT a FAIL (r2: reported as-is, never flagged)',
    terminal.doc.checks.authorityArtifact.state === PASS);
  check('branch 4/4 TERMINAL-HISTORICAL: proves NO MUTATION of the fixture (no silent repair)',
    terminal.before === terminal.after && terminal.before !== 'ABSENT');

  const cancelled = authorityFixture({
    'A-CANC': arcJson({ arcId: 'A-CANC', state: 'CANCELLED', authority: { kind: 'publication-source', artifact: 'src/r1.md', ratifiedAt: 'x' } })
  });
  check('CANCELLED is terminal too -> TERMINAL-HISTORICAL, not a FAIL',
    findingFor(cancelled.doc, 'A-CANC') === 'TERMINAL-HISTORICAL' && cancelled.doc.checks.authorityArtifact.state === PASS);

  // D-2, owner ruling 2026-08-31: CORE-STREAM shape — published execution, no revision.
  const grandfathered = authorityFixture({
    'A-GRAND': arcJson({ arcId: 'A-GRAND', planning: { currentRevision: 0, revisions: [] } })
  });
  check('D-2: published execution with no revision to compare -> explicit finding GRANDFATHERED',
    findingFor(grandfathered.doc, 'A-GRAND') === 'GRANDFATHERED');
  check('D-2: GRANDFATHERED is reported, NOT classified MISSING, NOT silently excluded',
    grandfathered.doc.checks.authorityArtifact.state === PASS
    && (grandfathered.doc.checks.authorityArtifact.arcs || []).length === 1);

  // D-1(a), owner ruling 2026-08-31: scope predicate is execution != null.
  const unpublished = authorityFixture({
    'A-NOEXEC': arcJson({ arcId: 'A-NOEXEC', execution: null })
  });
  check('D-1(a): an arc with execution == null is OUT of scope entirely',
    (unpublished.doc.checks.authorityArtifact.arcs || []).length === 0
    && unpublished.doc.checks.authorityArtifact.state === UNVERIFIABLE);

  const mixed = authorityFixture({
    'M-CUR': arcJson({ arcId: 'M-CUR' }),
    'M-SUP': arcJson({ arcId: 'M-SUP', authority: { kind: 'publication-source', artifact: 'src/r1.md', ratifiedAt: 'x' } }),
    'M-TERM': arcJson({ arcId: 'M-TERM', state: 'CLOSED', authority: { kind: 'publication-source', artifact: 'src/r1.md', ratifiedAt: 'x' } })
  });
  check('mixed registry: every in-scope arc is reported, not just the failing one',
    (mixed.doc.checks.authorityArtifact.arcs || []).length === 3);
  check('mixed registry: one SUPERSEDED is enough to FAIL the check', mixed.doc.checks.authorityArtifact.state === FAIL);
  check('mixed registry: the TERMINAL arc is not counted as a defect',
    !/M-TERM/.test(mixed.doc.checks.authorityArtifact.detail || ''));
  check('mixed registry: DETECTION ONLY — registry bytes unchanged after the run',
    mixed.before === mixed.after);

  // ── 4. runtime-reading checks against fixtures ──────────────────────────────
  section('runtime checks — pointerRegistry, liveClaims, mutexHolders, workerTopology');

  const rt = bareFixture('runtime');
  const RT = rt.opts.runtimeRoot;
  writeFile(rt.root, 'src/r2.md', 'r2\n');
  writeFile(rt.root, path.join('.ai-reports', 'arcs', 'P-ARC', 'arc.json'),
    JSON.stringify(arcJson({ arcId: 'P-ARC', execution: { planId: 'p-r2' } }), null, 2) + '\n');
  fs.mkdirSync(path.join(RT, 'plans', 'arcs', 'P-ARC'), { recursive: true });
  fs.writeFileSync(path.join(RT, 'plans', 'arcs', 'P-ARC', 'current.json'), JSON.stringify({ planId: 'p-r2', arcId: 'P-ARC' }) + '\n');
  const rtMatch = safecheckLib.safecheck(rt.opts);
  check('pointerRegistry PASSes when pointer planId == registry execution.planId', rtMatch.checks.pointerRegistry.state === PASS);

  fs.writeFileSync(path.join(RT, 'plans', 'arcs', 'P-ARC', 'current.json'), JSON.stringify({ planId: 'p-r3', arcId: 'P-ARC' }) + '\n');
  const rtDrift = safecheckLib.safecheck(rt.opts);
  check('pointerRegistry FAILs on pointer/registry planId drift', rtDrift.checks.pointerRegistry.state === FAIL);
  check('pointerRegistry names the drifting arc and both planIds',
    /P-ARC/.test(rtDrift.checks.pointerRegistry.detail) && /p-r3/.test(rtDrift.checks.pointerRegistry.detail));

  const cl = bareFixture('claims');
  const CRT = cl.opts.runtimeRoot;
  fs.mkdirSync(path.join(CRT, 'arc-claims', 'C-ARC', 'T-1'), { recursive: true });
  fs.writeFileSync(path.join(CRT, 'arc-claims', 'C-ARC', 'T-1', 'claim.json'),
    JSON.stringify({ taskId: 'T-1', arcId: 'C-ARC', state: 'AUTHORIZED', conversationId: 'conv-A' }) + '\n');
  fs.mkdirSync(path.join(CRT, 'claims', 'T-LEGACY'), { recursive: true });
  fs.writeFileSync(path.join(CRT, 'claims', 'T-LEGACY', 'claim.json'),
    JSON.stringify({ taskId: 'T-LEGACY', state: 'COMPLETE', conversationId: 'conv-B' }) + '\n');
  const clDoc = safecheckLib.safecheck(cl.opts);
  check('liveClaims enumerates BOTH namespaces (legacy arc:null and ARC-scoped)',
    clDoc.checks.liveClaims.claims.length === 2
    && clDoc.checks.liveClaims.claims.some(function (c) { return c.arc === 'C-ARC' && c.task === 'T-1'; })
    && clDoc.checks.liveClaims.claims.some(function (c) { return c.arc === null && c.task === 'T-LEGACY'; }));
  check('liveClaims rows carry exactly arc, task, state (DoD shape)',
    clDoc.checks.liveClaims.claims.every(function (c) { return JSON.stringify(Object.keys(c)) === JSON.stringify(['arc', 'task', 'state']); }));
  check('liveClaims PASSes when every record parses', clDoc.checks.liveClaims.state === PASS);
  check('workerTopology PASSes when the one live claim has its own conversation', clDoc.checks.workerTopology.state === PASS);

  fs.mkdirSync(path.join(CRT, 'arc-claims', 'D-ARC', 'T-2'), { recursive: true });
  fs.writeFileSync(path.join(CRT, 'arc-claims', 'D-ARC', 'T-2', 'claim.json'),
    JSON.stringify({ taskId: 'T-2', arcId: 'D-ARC', state: 'CLAIMED', conversationId: 'conv-A' }) + '\n');
  const clShared = safecheckLib.safecheck(cl.opts);
  check('workerTopology FAILs when ONE conversation holds live claims for two tasks (F2/F7)',
    clShared.checks.workerTopology.state === FAIL);
  check('workerTopology names the shared conversation and both tasks',
    /conv-A/.test(clShared.checks.workerTopology.detail)
    && /C-ARC\/T-1/.test(clShared.checks.workerTopology.detail)
    && /D-ARC\/T-2/.test(clShared.checks.workerTopology.detail));

  const res = bareFixture('residue');
  fs.mkdirSync(path.join(res.opts.runtimeRoot, 'arc-claims', 'R-ARC', 'T-9'), { recursive: true });
  const resDoc = safecheckLib.safecheck(res.opts);
  check('liveClaims reports a claim directory with no claim.json as INCOMPLETE-CLAIM residue',
    resDoc.checks.liveClaims.claims.some(function (c) { return c.state === 'INCOMPLETE-CLAIM'; }));
  fs.writeFileSync(path.join(res.opts.runtimeRoot, 'arc-claims', 'R-ARC', 'T-9', 'claim.json'), '{ not json');
  const resBad = safecheckLib.safecheck(res.opts);
  check('liveClaims FAILs on an unparseable claim record', resBad.checks.liveClaims.state === FAIL);
  check('liveClaims reports the malformed record as MALFORMED',
    resBad.checks.liveClaims.claims.some(function (c) { return c.state === 'MALFORMED'; }));

  const mx = bareFixture('mutex');
  fs.mkdirSync(path.join(mx.opts.runtimeRoot, 'mutex', 'CODE__index-html'), { recursive: true });
  fs.writeFileSync(path.join(mx.opts.runtimeRoot, 'mutex', 'CODE__index-html', 'holder.json'),
    JSON.stringify({ taskId: 'T-1', lane: 'MAIN', acquiredAt: '2026-08-31T00:00:00Z', arcId: 'C-ARC' }) + '\n');
  const mxDoc = safecheckLib.safecheck(mx.opts);
  check('mutexHolders decodes the directory name back to the canonical class (__ -> :)',
    mxDoc.checks.mutexHolders.holders.length === 1 && mxDoc.checks.mutexHolders.holders[0].class === 'CODE:index-html');
  check('mutexHolders reports the full owner pair (arcId + taskId)',
    mxDoc.checks.mutexHolders.holders[0].arcId === 'C-ARC' && mxDoc.checks.mutexHolders.holders[0].taskId === 'T-1');
  check('mutexHolders PASSes with a well-formed holder', mxDoc.checks.mutexHolders.state === PASS);
  fs.mkdirSync(path.join(mx.opts.runtimeRoot, 'mutex', 'QA__browser-runtime'), { recursive: true });
  const mxOrphan = safecheckLib.safecheck(mx.opts);
  check('mutexHolders FAILs on a class directory with no holder.json (orphan residue)',
    mxOrphan.checks.mutexHolders.state === FAIL && /QA__browser-runtime/.test(mxOrphan.checks.mutexHolders.detail));

  // ── 5. F11 freshness and F13 path-to-authority ──────────────────────────────
  section('evidenceFreshness (F11) + pathToAuthority (F13)');

  const fr = bareFixture('fresh');
  writeFile(fr.root, 'surface/a.txt', 'a\n');
  const past = new Date('2026-01-01T00:00:00Z');
  fs.utimesSync(path.join(fr.root, 'surface', 'a.txt'), past, past);
  const frOld = safecheckLib.safecheck(Object.assign({}, fr.opts, {
    greenAt: '2026-06-01T00:00:00Z', declaredSurfaces: ['surface']
  }));
  check('evidenceFreshness PASSes when no declared-surface write postdates the GREEN',
    frOld.checks.evidenceFreshness.state === PASS && frOld.checks.evidenceFreshness.writesAfterGreen.length === 0);
  check('evidenceFreshness reports the GREEN it compared against', frOld.checks.evidenceFreshness.lastGreenAt === '2026-06-01T00:00:00Z');

  const frNew = safecheckLib.safecheck(Object.assign({}, fr.opts, {
    greenAt: '2020-01-01T00:00:00Z', declaredSurfaces: ['surface']
  }));
  check('evidenceFreshness FAILs when a declared-surface write postdates the GREEN (F11)',
    frNew.checks.evidenceFreshness.state === FAIL);
  check('evidenceFreshness names the offending file in writesAfterGreen',
    frNew.checks.evidenceFreshness.writesAfterGreen.indexOf('surface/a.txt') !== -1);
  check('evidenceFreshness: an explicit greenAt input wins over any on-disk record (run-#2 lesson: newest GREEN)',
    frNew.checks.evidenceFreshness.lastGreenAt === '2020-01-01T00:00:00Z');

  // pathToAuthority needs a real git repo; without git it must degrade, never false-FAIL.
  const pa = bareFixture('p2a');
  const paDoc = safecheckLib.safecheck(Object.assign({}, pa.opts, { declaredWrites: ['qa/**'] }));
  check('pathToAuthority degrades to UNVERIFIABLE outside a git repository (never a false FAIL)',
    paDoc.checks.pathToAuthority.state === UNVERIFIABLE);

  // ── 6. shellPerCommand (F8-C) ───────────────────────────────────────────────
  section('shellPerCommand (F8-C)');
  const shOk = safecheckLib.safecheck(Object.assign({}, bareFixture('sh-ok').opts, {
    shellPlan: [{ command: 'protocol block', requiredShell: 'bash', plannedShell: 'bash' }]
  }));
  check('shellPerCommand PASSes when the planned shell matches the required shell', shOk.checks.shellPerCommand.state === PASS);
  const shBad = safecheckLib.safecheck(Object.assign({}, bareFixture('sh-bad').opts, {
    shellPlan: [{ command: 'protocol block', requiredShell: 'bash', plannedShell: 'powershell' }]
  }));
  check('shellPerCommand FAILs on a shell mismatch (F8-C)', shBad.checks.shellPerCommand.state === FAIL);
  check('shellPerCommand names the command and both shells',
    /protocol block/.test(shBad.checks.shellPerCommand.detail) && /powershell/.test(shBad.checks.shellPerCommand.detail));

  // ── 7. verdict precedence + exit codes ──────────────────────────────────────
  section('verdict precedence + process contract');
  check('verdictOf: all PASS -> PASS', safecheckLib.verdictOf({ a: { state: PASS }, b: { state: PASS } }) === PASS);
  check('verdictOf: any UNVERIFIABLE with no FAIL -> UNVERIFIABLE',
    safecheckLib.verdictOf({ a: { state: PASS }, b: { state: UNVERIFIABLE } }) === UNVERIFIABLE);
  check('verdictOf: any FAIL dominates, even alongside UNVERIFIABLE',
    safecheckLib.verdictOf({ a: { state: UNVERIFIABLE }, b: { state: FAIL } }) === FAIL);
  check('exit code contract: PASS -> 0', safecheckLib.exitCodeFor(PASS) === 0);
  check('exit code contract: FAIL -> 1', safecheckLib.exitCodeFor(FAIL) === 1);
  check('exit code contract: UNVERIFIABLE -> 2', safecheckLib.exitCodeFor(UNVERIFIABLE) === 2);

  const cli = safecheckLib.runCli(['--repo-root', bare.root, '--now', '2026-08-31T00:00:00Z']);
  check('runCli emits parseable JSON on stdout', (function () { try { JSON.parse(cli.out); return true; } catch (e) { return false; } })());
  check('runCli exit code agrees with the document verdict', cli.code === safecheckLib.exitCodeFor(JSON.parse(cli.out).verdict));
  check('runCli rejects an unknown argument with usage, exit 3', safecheckLib.runCli(['--nope']).code === 3);
  check('runCli --help exits 0 with usage', safecheckLib.runCli(['--help']).code === 0);

  // ── 8. named-args — the THREE recorded argv mechanisms (pilot-close P1) ─────
  section('named-args (S4) — the three recorded argv mechanisms');

  const SPEC = { value: { '--plan': 'plan', '--task': 'task' }, boolean: { '--ladder': 'ladder' }, required: ['--plan'] };

  // Mechanism 1 — argv base index differs between `node -e` and a script file. The recorded
  // defect used argv[2] under `node -e`, producing a spurious P-V10 REFUSED.
  const rawEval = ['/usr/bin/node', '--plan', 'p.json'];
  const rawFile = ['/usr/bin/node', '/abs/script.js', '--plan', 'p.json'];
  check('mechanism 1: userArgv slices at 1 under node -e',
    JSON.stringify(namedArgs.userArgv(rawEval, { evalMode: true })) === JSON.stringify(['--plan', 'p.json']));
  check('mechanism 1: userArgv slices at 2 for a script file',
    JSON.stringify(namedArgs.userArgv(rawFile, { evalMode: false })) === JSON.stringify(['--plan', 'p.json']));
  check('mechanism 1: both forms parse to the SAME values — the defect is eliminated, not relocated',
    JSON.stringify(namedArgs.parse(namedArgs.userArgv(rawEval, { evalMode: true }), SPEC).values)
    === JSON.stringify(namedArgs.parse(namedArgs.userArgv(rawFile, { evalMode: false }), SPEC).values));

  // Mechanism 2 — a dummy leading argument shifted every index; the recorded blast radius
  // was a stray untracked file written into the repo root.
  const shifted = namedArgs.parse(['dummy', '--plan', 'p.json'], SPEC);
  check('mechanism 2: a shifting leading positional is REJECTED, never silently consumed',
    shifted.values === null && /positional/.test(shifted.error));
  check('mechanism 2: the rejection names the offending token', /dummy/.test(shifted.error));

  // Mechanism 3 — an argument simply not passed; nothing asserted arity before dereferencing.
  const noValue = namedArgs.parse(['--plan'], SPEC);
  check('mechanism 3: a value flag in final position is an arity error, not undefined',
    noValue.values === null && /--plan needs a value/.test(noValue.error));
  const missingReq = namedArgs.parse(['--ladder'], SPEC);
  check('mechanism 3: a missing REQUIRED flag is reported before any dereference',
    missingReq.values === null && /--plan is required/.test(missingReq.error));
  const flagAsValue = namedArgs.parse(['--plan', '--task', 'T'], SPEC);
  check('mechanism 3: a flag-shaped value is rejected (catches a shift that would otherwise parse)',
    flagAsValue.values === null && /needs a value but was followed by --task/.test(flagAsValue.error));

  section('named-args — general contract');
  const ok = namedArgs.parse(['--plan', 'p.json', '--task', 'T-1', '--ladder'], SPEC);
  check('a well-formed argv parses', ok.error === null && ok.values.plan === 'p.json' && ok.values.task === 'T-1' && ok.values.ladder === true);
  check('booleans default to false when absent', namedArgs.parse(['--plan', 'p'], SPEC).values.ladder === false);
  check('an unknown argument is rejected with the known set listed', /unknown argument --bogus/.test(namedArgs.parse(['--plan', 'p', '--bogus'], SPEC).error));
  check('a repeated flag is rejected as ambiguous', /repeated argument --plan/.test(namedArgs.parse(['--plan', 'a', '--plan', 'b'], SPEC).error));
  check('a repeated boolean is rejected too', /repeated argument --ladder/.test(namedArgs.parse(['--plan', 'p', '--ladder', '--ladder'], SPEC).error));
  check('an alias resolves to its canonical flag',
    namedArgs.parse(['-p', 'x'], { value: { '--plan': 'plan' }, aliases: { '-p': '--plan' } }).values.plan === 'x');
  check('a negative number is a value, not a flag', namedArgs.parse(['--plan', '-1'], SPEC).values.plan === '-1');
  check('isFlagLike: -- is not flag-like', namedArgs.isFlagLike('--') === false);
  check('isFlagLike: --flag is flag-like', namedArgs.isFlagLike('--flag') === true);
  check('parse never throws on bad USER input — it returns an error string',
    (function () { try { return namedArgs.parse(['--x'], SPEC).error !== null; } catch (e) { return false; } })());
  check('a malformed SPEC (caller bug) DOES throw, rather than being silently resolved',
    (function () { try { namedArgs.parse([], { value: { '--a': 'a' }, boolean: { '--a': 'a' } }); return false; } catch (e) { return true; } })());

  // ── 9. containment contract ────────────────────────────────────────────────
  section('containment — read-only, no network, no writes');
  const libSrc = readText('qa/lib/arc-safecheck.js');
  const argSrc = readText('qa/lib/named-args.js');
  check('arc-safecheck.js opens no network client (scanning the TARGET source, never this harness)',
    !/require\(['"]https?['"]\)|\bfetch\s*\(|XMLHttpRequest|net\.connect/.test(libSrc));
  check('arc-safecheck.js calls no filesystem WRITE api',
    !/writeFileSync|appendFileSync|mkdirSync|rmSync|unlinkSync|rmdirSync|createWriteStream/.test(libSrc));
  check('named-args.js touches no filesystem at all', !/require\(['"]fs['"]\)/.test(argSrc));
  // Match a CALL, not a mention: the module's own header documents that it never exits, and
  // a bare /process\.exit/ matched that prose instead of code (caught by the RED run).
  check('named-args.js never calls process.exit — callers own their exit code', !/process\.exit\s*\(/.test(argSrc));
  check('arc-safecheck.js spawns only git', (function () {
    const calls = libSrc.match(/spawnSync\(\s*'([^']+)'/g) || [];
    return calls.length > 0 && calls.every(function (c) { return /'git'/.test(c); });
  })());
  check('arc-safecheck.js declares detection-only for authority fields (r2 stopCondition)',
    /DETECTION ONLY/.test(libSrc) && /never rewrites, repins or repairs/.test(libSrc));

  const beforeBare = treeHash(bare.root);
  safecheckLib.safecheck(bare.opts);
  check('running safecheck writes nothing into the repository it inspects', treeHash(bare.root) === beforeBare);

  // ── 10. wiring + scope ─────────────────────────────────────────────────────
  section('wiring + scope');
  const runner = readText('qa/run-offline.js');
  check('wiring run-offline.js registers qa/arc_safecheck_offline.js', /'qa\/arc_safecheck_offline\.js'/.test(runner));
  check('wiring the registration is exactly ONE entry (r2: 3 new files + a single registration line)',
    (runner.match(/'qa\/arc_safecheck_offline\.js'/g) || []).length === 1);
  check('wiring the landed ordering assertions still hold (arc_runtime_ops after arc_multi_arc)',
    runner.indexOf("'qa/arc_multi_arc_offline.js'") < runner.indexOf("'qa/arc_runtime_ops_offline.js'"));

  // Scope: this slice may write ONLY under qa/**. index.html and netlify/functions are
  // P-V25 locked out (WFT-S2S4 holds no CODE mutex), so they must be byte-identical.
  const liveRuntime = path.join(ROOT, '.git', 'arc-runtime');
  const liveBefore = fs.existsSync(liveRuntime) ? treeHash(liveRuntime) : null;
  check('scope: index.html is not part of this slice and is not read or written here',
    !/index\.html/.test(libSrc) && !/index\.html/.test(argSrc));
  check('scope: netlify/functions is not part of this slice',
    !/netlify\/functions/.test(libSrc) && !/netlify\/functions/.test(argSrc));

  // ── 11. live read — existsSync-guarded, property-only ──────────────────────
  section('live read — guarded, property-only (never a count or an inventory)');
  if (fs.existsSync(path.join(ROOT, '.ai-reports', 'arcs'))) {
    const live = safecheckLib.safecheck({ repoRoot: ROOT, now: '2026-08-31T00:00:00Z' });
    check('live: the document still has exactly the 10 normative check keys in order',
      JSON.stringify(Object.keys(live.checks)) === JSON.stringify(EXPECTED_CHECKS));
    check('live: every authorityArtifact finding is drawn from the closed vocabulary',
      (live.checks.authorityArtifact.arcs || []).every(function (r) {
        return ['CURRENT', 'MISSING', 'SUPERSEDED', 'TERMINAL-HISTORICAL', 'GRANDFATHERED'].indexOf(r.finding) !== -1;
      }));
    check('live: every reported arc row carries the four DoD keys',
      (live.checks.authorityArtifact.arcs || []).every(function (r) {
        return JSON.stringify(Object.keys(r)) === JSON.stringify(['arc', 'publishedRevision', 'authorityArtifact', 'finding']);
      }));
    check('live: the verdict is one of the three legal values',
      [PASS, FAIL, UNVERIFIABLE].indexOf(live.verdict) !== -1);
  }
  if (liveBefore !== null) {
    check('live runtime tree hash unchanged by this suite', treeHash(liveRuntime) === liveBefore);
  }
} finally {
  for (let i = 0; i < tempDirs.length; i += 1) {
    try { fs.rmSync(tempDirs[i], { recursive: true, force: true }); } catch (e) { /* best effort */ }
  }
}

section('closing proofs');
check('every temp tree removed', tempDirs.every(function (d) { return !fs.existsSync(d); }));

console.log('\n' + (failed === 0
  ? 'ARC SAFECHECK (WU-WFT S2+S4): PASS (' + total + ' asserts)'
  : 'ARC SAFECHECK (WU-WFT S2+S4): FAIL (' + failed + ' of ' + total + ' asserts failed)'));
assert.strictEqual(failed, 0, failures.slice(0, 12).join(' | '));
