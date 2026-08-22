#!/usr/bin/env node
'use strict';

/*
 * arc-worker/scripts/phase-gate.js — the worker's profile binding, phase-entry decision and
 * scope resolution (P-C, B2 of the Multi-ARC V1 ULTRAPLAN r3 §4-B2 / §6; contract in
 * arc-worker/references/execution-profile.md §5).
 *
 *   node phase-gate.js --plan <plan.json> --task <TASK-ID> --ladder [--claim-dir <rel>]
 *   node phase-gate.js --plan <plan.json> --task <TASK-ID> --phase <PHASE-ID> --last-ack <UNKNOWN|MANUAL|ACCEPT_EDITS|AUTO>
 *                      [--answered] [--resumed] [--acknowledged-at <ISO>] [--harness-signal <text>]
 *                      [--claim-dir <rel>] [--worktree-path <abs>]
 *   node phase-gate.js --plan <plan.json> --task <TASK-ID> --scope --phase <PHASE-ID> [--claim-dir <rel>] [--worktree-path <abs>]
 *
 * Pure Node, CommonJS, zero dependencies beyond the B1 contract library, which it requires
 * READ-ONLY for the W-V10 round trip (libraryHash / withoutLibraryHash / validateProfile) and
 * the shared P-V25 helpers (deriveLockouts / renderLadder). It performs exactly ONE read — the
 * snapshot named by --plan — and NO write of any kind. It never reads the profile library: the
 * worker consumes the embedded copy only (K4). It makes no git call: the protocol's bash side
 * resolves the worktree and the claim directory and passes them in (R-2 / D-16), which keeps
 * this script claim-root-agnostic (--claim-dir defaults to the legacy claims/<TASK-ID>).
 *
 * Exit codes: 0 CONTINUE / rendered / legacy snapshot · 2 STOP (HANDSHAKE-REQUIRED,
 * STOP-request-MODE-literal, STOP-before-write, INVALID-PHASE, entry-gate-unsatisfied) ·
 * 3 usage / IO · 4 profile binding failure (profile-binding-missing, profile-hash-mismatch).
 *
 * Mode is prompting policy, never authority. The harness mode is never changed here and a
 * harness transition is never asserted: the operator's typed literal is the evidence of record,
 * quoted with its timestamp (R-7 / R-8). Handshake state is report-only (R-4 / D-15).
 */

const fs = require('fs');
const path = require('path');
const lib = require('../../arc-publish-plan/scripts/lib/profile-contract.js');

const MODES = lib.MODES;                       // MANUAL < ACCEPT_EDITS < AUTO
const RANK = lib.RANK;
const ACK_MODES = ['UNKNOWN'].concat(MODES);
const HARNESS_MODE_MAP = { manual: 'MANUAL', acceptEdits: 'ACCEPT_EDITS', auto: 'AUTO' };
const UNMAPPED_HARNESS_MODES = ['plan', 'dontAsk', 'bypassPermissions'];
const ACTIONS = ['CONTINUE', 'HANDSHAKE-REQUIRED', 'STOP-request-MODE-literal', 'STOP-before-write', 'INVALID-PHASE', 'STOP'];
const OUTCOMES = ['as-recommended', 'stricter-than-recommended', 'looser-than-recommended', 'declined-increase', 'stopped-above-ceiling', 'SKIP-evidenced'];
const LITERALS = { 'MODE MANUAL': 'MANUAL', 'MODE ACCEPT_EDITS': 'ACCEPT_EDITS', 'MODE AUTO': 'AUTO' };
const HEX64_RE = /^[a-f0-9]{64}$/;
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
const RULE = '----------------------------------------------------------------';

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const pad = (label) => (label + '                  ').slice(0, 18);
const encodeClass = (c) => String(c).replace(/:/g, '__');

// ── task lookup ──────────────────────────────────────────────────────────────
function findTask(plan, taskId) {
  if (!isObj(plan) || !Array.isArray(plan.tasks)) return null;
  return plan.tasks.find((t) => isObj(t) && t.id === taskId) || null;
}

// ── K4 / K5 / W-V10: bind the task's embedded profile from the snapshot alone ──
function bindProfile(plan, taskId) {
  const task = findTask(plan, taskId);
  if (!task) return { status: 'no-task', reason: 'task ' + taskId + ' is not in the snapshot', task: null, profile: null, id: null, hash: null };
  const ref = task.executionProfile;
  const map = isObj(plan) ? plan.executionProfiles : undefined;
  const missing = (why) => ({ status: 'missing', reason: 'profile-binding-missing - ' + why, task, profile: null, id: typeof ref === 'string' ? ref : null, hash: null });
  const mismatch = (why) => ({ status: 'mismatch', reason: 'profile-hash-mismatch (W-V10) - ' + why, task, profile: null, id: ref, hash: null });
  if (map === undefined && ref === undefined) return { status: 'legacy', reason: 'profile none (legacy snapshot) - V1 behaviour, no handshake', task, profile: null, id: null, hash: null };
  if (map === undefined) return missing('task ' + taskId + ' names executionProfile "' + String(ref) + '" but the snapshot carries no executionProfiles map');
  if (!isObj(map)) return missing('executionProfiles is not an object');
  if (ref === undefined) return missing('task ' + taskId + ' names no executionProfile while the snapshot carries executionProfiles');
  if (typeof ref !== 'string' || !lib.PROFILE_ID_RE.test(ref)) return missing('task ' + taskId + ' executionProfile ' + JSON.stringify(ref) + ' is not a library id (exact uppercase id, no case folding)');
  if (!Object.prototype.hasOwnProperty.call(map, ref)) return missing('task ' + taskId + ' executionProfile "' + ref + '" is not a key of the embedded executionProfiles (exact id, no case folding)');
  const e = map[ref];
  if (!isObj(e)) return mismatch('embedded entry ' + ref + ' is not an object');
  if (e.profileId !== ref) return mismatch('embedded key ' + ref + ' does not equal its profileId ' + JSON.stringify(e.profileId));
  if (!HEX64_RE.test(String(e.libraryHash))) return mismatch('embedded profile ' + ref + ' carries no valid libraryHash');
  if (Object.keys(e).slice(0, 3).join(',') !== 'profileId,version,libraryHash') return mismatch('embedded profile ' + ref + ' key order must be profileId, version, libraryHash, ... (K2)');
  const derived = lib.libraryHash(e);
  if (derived !== e.libraryHash) return mismatch('embedded profile ' + ref + ' libraryHash ' + e.libraryHash.slice(0, 12) + '... does not equal the hash re-derived from the embedded bytes ' + derived.slice(0, 12) + '...');
  const viol = lib.validateProfile(lib.withoutLibraryHash(e));
  if (viol.length) return mismatch('embedded profile ' + ref + ' does not validate: ' + viol.join(', '));
  return { status: 'bound', reason: 'W-V10 verified (re-derived from the embedded bytes)', task, profile: e, id: ref, hash: e.libraryHash };
}

// ── the operator's acknowledgement literal (§5 / R-7) ────────────────────────
function parseAck(text) {
  if (typeof text !== 'string') return { ok: false, reason: 'no text' };
  let inFence = false;
  const found = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (Object.prototype.hasOwnProperty.call(LITERALS, line)) found.push(LITERALS[line]);
  }
  if (found.length === 0) return { ok: false, reason: 'no MODE literal on its own line (exactly MODE MANUAL | MODE ACCEPT_EDITS | MODE AUTO, case-sensitive, unquoted)' };
  if (found.length > 1) return { ok: false, reason: 'more than one MODE literal in one message (two or more) - not an acknowledgement' };
  return { ok: true, mode: found[0] };
}

// Harness signal text -> mapped profile mode, an UNMAPPED harness mode, or null (no signal).
function harnessModeOf(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (!t || /NOT MACHINE-VERIFIABLE/.test(t)) return null;
  for (const u of UNMAPPED_HARNESS_MODES) if (new RegExp('(^|[^A-Za-z])' + u + '([^A-Za-z]|$)').test(t)) return { unmapped: u, raw: t };
  const hits = [];
  if (/(^|[^A-Za-z])auto([^A-Za-z]|$)/i.test(t)) hits.push('AUTO');
  if (/acceptEdits|accept edits/i.test(t)) hits.push('ACCEPT_EDITS');
  if (/(^|[^A-Za-z])manual([^A-Za-z]|$)/i.test(t)) hits.push('MANUAL');
  if (!hits.length) return null;
  hits.sort((a, b) => RANK[b] - RANK[a]);          // the most automated mention wins (fail closed)
  return { mapped: hits[0], raw: t };
}

// ── §6 decision table, rows 1..6, plus the R-7 unmapped-harness rule ─────────
function decide(input) {
  const lane = input.lane;
  const ph = input.phase;
  const lastAck = input.lastAck;
  const answered = input.answered === true;
  const hm = input.harnessMode || null;
  const r = RANK[ph.recommendedMode];
  const c = RANK[ph.modeCeiling];
  if (r === undefined || c === undefined) return { action: 'INVALID-PHASE', reason: 'phase ' + ph.id + ' carries an unknown mode (' + ph.recommendedMode + ' / ' + ph.modeCeiling + ')' };
  if (!ACK_MODES.includes(lastAck)) return { action: 'INVALID-PHASE', reason: 'lastAcknowledgedMode ' + JSON.stringify(lastAck) + ' is not in UNKNOWN | MANUAL | ACCEPT_EDITS | AUTO' };
  // 1. recommended > ceiling -> refuse the phase
  if (r > c) return { action: 'INVALID-PHASE', reason: 'recommendedMode ' + ph.recommendedMode + ' exceeds modeCeiling ' + ph.modeCeiling + ' (P-V23(b) violated in the embedded profile)' };
  // R-7: an UNMAPPED harness mode can never satisfy an acknowledgement; visible -> STOP-before-write
  if (hm && hm.unmapped) return { action: 'STOP-before-write', reason: 'unmapped-harness-mode (' + hm.unmapped + '): not a profile mode and cannot be acknowledged - return to a mapped harness mode (manual | acceptEdits | auto) before any write of this phase, then acknowledge with the literal' };
  const harnessRank = hm && hm.mapped ? RANK[hm.mapped] : -1;
  // 2. MAIN lane is never AUTO, however the state was learned (r2.1 ruling 1)
  if (lane === 'MAIN' && (lastAck === 'AUTO' || harnessRank === RANK.AUTO)) return { action: 'STOP-before-write', reason: 'main-never-auto: the MAIN lane never runs under AUTO in any phase (' + (lastAck === 'AUTO' ? 'acknowledged AUTO' : 'harness signal ' + hm.raw) + ') - await a literal <= ' + ph.modeCeiling };
  // 3. first handshake of the conversation
  if (lastAck === 'UNKNOWN') return { action: 'HANDSHAKE-REQUIRED', reason: 'launch mode unknown - STOP; request the literal', request: 'MODE ' + ph.recommendedMode };
  // 4. above the ceiling, however learned (acknowledged or harness signal)
  if (RANK[lastAck] > c) return { action: 'STOP-before-write', reason: 'mode-exceeds-ceiling: acknowledged ' + lastAck + ' exceeds modeCeiling ' + ph.modeCeiling + ' - no write until the operator acknowledges a mode <= ' + ph.modeCeiling };
  if (harnessRank > c) return { action: 'STOP-before-write', reason: 'mode-exceeds-ceiling: harness signal ' + JSON.stringify(hm.raw) + ' maps to ' + hm.mapped + ', above modeCeiling ' + ph.modeCeiling + ' - no write until the operator acknowledges a mode <= ' + ph.modeCeiling };
  // 5. more automation wanted than acknowledged, not yet asked this phase entry
  if (r > RANK[lastAck] && !answered) return { action: 'STOP-request-MODE-literal', reason: 'automation-increase-needed: recommendedMode ' + ph.recommendedMode + ' > acknowledged ' + lastAck + ' - ask once; continue only on the literal', request: 'MODE ' + ph.recommendedMode };
  // 6. continue
  const outcome = RANK[lastAck] === r ? 'as-recommended' : (RANK[lastAck] < r ? 'stricter-than-recommended' : 'looser-than-recommended');
  return { action: 'CONTINUE', reason: outcome + (outcome === 'looser-than-recommended' ? ' (within modeCeiling ' + ph.modeCeiling + ')' : ''), outcome };
}

// ── §6 scope resolution (D-16): placeholders, logical claim name, lock-outs ──
function validateClaimDir(claimDir, taskId) {
  if (typeof claimDir !== 'string' || !claimDir) return 'claim-dir missing';
  if (claimDir.startsWith('/') || /^[A-Za-z]:/.test(claimDir) || claimDir.startsWith('\\')) return 'claim-dir must be relative to the runtime root: ' + claimDir;
  const segs = claimDir.split('/');
  if (segs.length < 2) return 'claim-dir must be <namespace>/.../' + taskId + ': ' + claimDir;
  for (const s of segs) if (!SEGMENT_RE.test(s) || s === '.' || s === '..') return 'claim-dir carries an empty, dot or invalid segment: ' + claimDir;
  if (segs[segs.length - 1] !== taskId) return 'claim-dir must end with /' + taskId + ': ' + claimDir;
  return null;
}

function resolveScope(input) {
  const plan = input.plan, task = input.task, profile = input.profile, phase = input.phase;
  const taskId = task.id;
  const claimDir = input.claimDir || ('claims/' + taskId);
  const worktreePath = input.worktreePath || null;
  const errors = [];
  const cdErr = validateClaimDir(claimDir, taskId);
  if (cdErr) errors.push(cdErr);
  const wtName = isObj(profile.scope) ? String(profile.scope.worktree) : 'none';
  const strings = [].concat(profile.scope.writes || [], profile.scope.readOnly || [], profile.scope.forbidden || [], phase.writes || []);
  const usesWorktree = strings.some((s) => String(s).indexOf('<worktree>') !== -1);
  if (wtName !== 'none' && !worktreePath) errors.push('worktree-unresolved: scope.worktree "' + wtName + '" requires --worktree-path (resolved by the protocol bash side; absent => refuse)');
  if (wtName === 'none' && usesWorktree) errors.push('scope.worktree is none but a scope string names <worktree>');
  const pinnedRef = profile.scope.pinnedRef === 'PLAN_REPO_REF' ? String(plan.repoRef) : String(profile.scope.pinnedRef);
  const logicalClaim = 'claims/' + taskId + '/claim.json';
  const sub = (s) => {
    let out = String(s).replace(/\{TASK_ID\}/g, taskId).replace(/<pinnedRef>/g, pinnedRef);
    if (worktreePath) out = out.replace(/<worktree>/g, worktreePath);
    if (out === logicalClaim) out = claimDir + '/claim.json';        // logical name -> the task's claim directory in its namespace
    return out;
  };
  const lockoutsAll = lib.deriveLockouts(task.mutexes, profile);
  const locked = new Set(lockoutsAll.map((l) => l.surface));
  const writes = (phase.writes || []).filter((w) => !locked.has(w)).map((w) => ({ pattern: w, resolved: sub(w) }));
  const lockouts = (phase.writes || []).filter((w) => locked.has(w)).map((w) => lockoutsAll.find((l) => l.surface === w));
  const classes = Array.isArray(task.mutexes) ? task.mutexes.slice().sort() : [];
  const allowlist = [claimDir + '/claim.json'].concat(classes.map((cl) => 'mutex/' + encodeClass(cl) + '/holder.json'));
  return {
    errors, taskId, claimDir, legacyNamespace: /^claims\//.test(claimDir),
    worktree: { name: wtName, path: worktreePath }, pinnedRef,
    writes, lockouts, lockoutsAll, allowlist,
    readOnly: (profile.scope.readOnly || []).map(sub), forbidden: (profile.scope.forbidden || []).map(sub),
    actions: Array.isArray(phase.actions) ? phase.actions.slice() : []
  };
}

// ── renderers ────────────────────────────────────────────────────────────────
function claimLine(claimDir) { return claimDir + (/^claims\//.test(claimDir) ? ' (legacy namespace)' : ''); }

function renderLadderBlock(binding, opts) {
  opts = opts || {};
  const t = binding.task;
  const claimDir = opts.claimDir || ('claims/' + t.id);
  const lines = ['PROFILE BINDING   ' + t.id];
  if (binding.status !== 'bound') { lines.push(pad('profile') + binding.reason); return lines.join('\n'); }
  const p = binding.profile;
  lines.push(pad('profile') + p.profileId + ' v' + p.version + '  libraryHash ' + binding.hash + '  ' + binding.reason);
  lines.push(pad('lane') + t.lane + '   entryMode ' + t.entryMode + '   requiresOwnerGo ' + t.requiresOwnerGo);
  lines.push(pad('claim') + claimLine(claimDir));
  lines.push(pad('worktree') + String(p.scope.worktree) + (p.scope.worktree === 'none' ? ' (no filesystem scope)' : ' (path resolved by the protocol bash side, passed as --worktree-path)'));
  lines.push(pad('phases') + lib.renderLadder(p));
  p.phases.forEach((ph, i) => {
    const row = '  [' + (i + 1) + '] ' + (ph.id + '           ').slice(0, 11) + ' ' + (ph.kind + '          ').slice(0, 10) + ' ' + lib.MODE_ABBR[ph.recommendedMode] + '/' + lib.MODE_ABBR[ph.modeCeiling] + '   gate ' + ph.entryGate + '   writes ' + (ph.writes.length ? ph.writes.join(' · ') : '(none)') + (Array.isArray(ph.actions) && ph.actions.length ? '   actions [' + ph.actions.join(', ') + ']' : '') + '   exit: ' + ph.exit;
    lines.push(row);
  });
  const grants = p.phases.filter((ph) => isObj(ph.grant)).map((ph) => ph.id + ' -> ' + ph.grant.toMode + ' paths ' + ph.grant.paths.join(', ') + ' mutex ' + ph.grant.mutexClass + ' (requiresOwnerGo ' + t.requiresOwnerGo + ')');
  lines.push(pad('grant') + (grants.length ? grants.join('; ') : 'none'));
  const lock = lib.deriveLockouts(t.mutexes, p);
  lines.push(pad('lock-out') + (lock.length ? lock.map((l) => l.surface + ' (' + l.class + ' not held by ' + t.id + ')').join('; ') : 'none'));
  lines.push(pad('boundaries') + 'inside: ' + (p.approvalBoundaries.inside.length ? p.approvalBoundaries.inside.join(', ') : '(none)') + '   outside: ' + p.approvalBoundaries.outside.length + ' of ' + lib.BOUNDARIES.length);
  const acts = p.phases.filter((ph) => Array.isArray(ph.actions) && ph.actions.length).map((ph) => ph.id + ' [' + ph.actions.join(', ') + ']');
  lines.push(pad('actions') + (acts.length ? acts.join(' · ') : 'none'));
  lines.push(pad('workable') + (t.lane === 'OWNER' ? 'no - OWNER lane is not workable (informational)' : 'yes'));
  return lines.join('\n');
}

function gateLine(phase, resumed) {
  if (phase.entryGate === 'AUTHORIZED_JSON') return resumed ? 'AUTHORIZED_JSON (satisfied by the --resume preconditions R1-R5)' : 'AUTHORIZED_JSON (UNSATISFIED - only the --resume preconditions R1-R5 satisfy it, never conversation text)';
  if (phase.entryGate === 'OWNER_TYPES_SKILL') return 'OWNER_TYPES_SKILL (the owner must have typed the skill in this conversation)';
  if (phase.entryGate === 'OWNER_TYPED_LITERAL') return 'OWNER_TYPED_LITERAL (the owner must have typed the literal in this conversation)';
  return 'NONE';
}

function renderEntry(input) {
  const ph = input.phase;
  const b = input.binding;
  const s = input.scope;
  const d = input.decision;
  const lines = [RULE, 'PHASE ENTRY   ' + input.taskId + '   phase ' + ph.id + ' (' + ph.kind + ')   [' + (input.index + 1) + ' of ' + input.count + ']', RULE];
  lines.push(pad('profile') + b.profile.profileId + ' v' + b.profile.version + '  libraryHash ' + b.hash.slice(0, 8) + '…');
  lines.push(pad('claim') + claimLine(input.claimDir));
  lines.push(pad('pinnedRef') + input.pinnedRef);
  lines.push(pad('resumed') + (input.resumed ? 'yes - prior acknowledgements not carried' : 'no'));
  lines.push(pad('recommendedMode') + ph.recommendedMode);
  lines.push(pad('modeCeiling') + ph.modeCeiling);
  lines.push(pad('last acknowledged') + (input.lastAck === 'UNKNOWN' ? 'UNKNOWN' : input.lastAck + '  (operator, ' + (input.acknowledgedAt || 'timestamp not given') + ')'));
  lines.push(pad('harness signal') + (input.harnessSignal ? input.harnessSignal : 'NOT MACHINE-VERIFIABLE'));
  lines.push(pad('write scope') + (s.writes.length ? s.writes.map((w) => w.resolved).join(' · ') : '(none)'));
  s.lockouts.forEach((l) => lines.push('  lock-out        ' + l.surface + ' (' + l.class + ' not held by ' + input.taskId + ')'));
  lines.push(pad('forbidden here') + lib.BOUNDARIES.join(' · '));
  lines.push(pad('declared actions') + (s.actions.length ? s.actions.join(', ') + ' (MANUAL owner act declared for this phase)' : 'none'));
  lines.push(pad('entry gate') + gateLine(ph, input.resumed));
  lines.push(pad('action') + d.action + ' - ' + d.reason + (d.request ? '   request: ' + d.request : ''));
  lines.push(RULE);
  return lines.join('\n');
}

function renderPhases(trail, opts) {
  opts = opts || {};
  if (!Array.isArray(trail)) throw new Error('renderPhases: trail must be an array');
  const lines = ['PHASES (' + trail.length + ' rows)   phase · kind · recommended · ceiling · acknowledged · acknowledgedAt · outcome'];
  trail.forEach((row, i) => {
    if (!isObj(row) || typeof row.phase !== 'string') throw new Error('renderPhases: row ' + i + ' has no phase id');
    if (!lib.KINDS.includes(row.kind)) throw new Error('renderPhases: row ' + i + ' unknown kind ' + row.kind);
    if (!MODES.includes(row.recommended) || !MODES.includes(row.ceiling)) throw new Error('renderPhases: row ' + i + ' unknown recommended/ceiling');
    if (!ACK_MODES.includes(row.acknowledged)) throw new Error('renderPhases: row ' + i + ' acknowledged ' + JSON.stringify(row.acknowledged) + ' is not a profile mode (UNKNOWN | MANUAL | ACCEPT_EDITS | AUTO)');
    if (!OUTCOMES.includes(row.outcome)) throw new Error('renderPhases: row ' + i + ' unknown outcome ' + JSON.stringify(row.outcome) + ' (allowed: ' + OUTCOMES.join(', ') + ')');
    lines.push('  ' + (row.phase + '          ').slice(0, 10) + ' ' + (row.kind + '          ').slice(0, 10) + ' ' + (row.recommended + '             ').slice(0, 13) + ' ' + (row.ceiling + '             ').slice(0, 13) + ' ' + (row.acknowledged + '             ').slice(0, 13) + ' ' + (row.acknowledgedAt || '-') + '  ' + row.outcome);
    if (row.acknowledged !== 'UNKNOWN') lines.push('      operator acknowledged MODE ' + row.acknowledged + ' at ' + (row.acknowledgedAt || 'timestamp not given'));
    if (row.evidence) lines.push('      exit evidence: ' + row.evidence);
  });
  lines.push(opts.resumed ? 'resumed: yes; prior acknowledgements not carried' : 'resumed: no');
  return lines.join('\n');
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const USAGE = 'usage: phase-gate.js --plan <plan.json> --task <TASK-ID> (--ladder | --phase <PHASE-ID> --last-ack <UNKNOWN|MANUAL|ACCEPT_EDITS|AUTO> [--answered] [--resumed] [--acknowledged-at <ISO>] [--harness-signal <text>] | --scope --phase <PHASE-ID>) [--claim-dir <rel>] [--worktree-path <abs>]';

function parseArgs(argv) {
  const o = { answered: false, resumed: false, ladder: false, scope: false };
  const takes = { '--plan': 'plan', '--task': 'task', '--phase': 'phase', '--last-ack': 'lastAck', '--acknowledged-at': 'acknowledgedAt', '--harness-signal': 'harnessSignal', '--claim-dir': 'claimDir', '--worktree-path': 'worktreePath' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a in takes) { if (i + 1 >= argv.length) return { error: a + ' needs a value' }; o[takes[a]] = argv[i + 1]; i += 1; }
    else if (a === '--ladder') o.ladder = true;
    else if (a === '--scope') o.scope = true;
    else if (a === '--answered') o.answered = true;
    else if (a === '--resumed') o.resumed = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else return { error: 'unknown argument ' + a };
  }
  return o;
}

function runCli(argv) {
  const args = parseArgs(argv);
  const usage = (msg) => ({ code: 3, out: 'PHASE-GATE ERROR - ' + msg + '\n' + USAGE + '\n' });
  if (args.error) return usage(args.error);
  if (args.help) return { code: 0, out: USAGE + '\n' };
  if (!args.plan) return usage('--plan is required');
  if (!args.task) return usage('--task is required');
  const modes = (args.ladder ? 1 : 0) + (args.scope ? 1 : 0) + (args.phase && !args.scope ? 1 : 0);
  if (modes !== 1) return usage('exactly one of --ladder | --phase <ID> --last-ack <MODE> | --scope --phase <ID> is required');
  if (args.scope && !args.phase) return usage('--scope requires --phase <PHASE-ID>');
  const planPath = path.resolve(args.plan);
  if (!fs.existsSync(planPath)) return usage('--plan not found: ' + planPath);
  let plan;
  try { plan = JSON.parse(lib.stripCR(fs.readFileSync(planPath, 'utf8'))); } catch (e) { return usage('cannot parse --plan as JSON: ' + e.message); }
  if (!isObj(plan)) return usage('--plan is not a JSON object');
  const task = findTask(plan, args.task);
  if (!task) return usage('task ' + args.task + ' is not in the snapshot ' + planPath);
  const claimDir = args.claimDir || ('claims/' + task.id);
  const binding = bindProfile(plan, task.id);
  const head = 'PHASE-GATE    task ' + task.id + '   plan ' + String(plan.planId) + '   snapshot ' + planPath + '\n';

  if (binding.status === 'missing' || binding.status === 'mismatch') return { code: 4, out: head + 'PROFILE BINDING   ' + task.id + '\n' + pad('profile') + binding.reason + '\n' + pad('disposition') + 'pre-claim: IDLE, nothing written · on --resume: BLOCKED (R-11)\n' };

  if (args.ladder) return { code: 0, out: head + renderLadderBlock(binding, { claimDir }) + '\n' };

  let phase = null;
  if (binding.status === 'bound') {
    phase = binding.profile.phases.find((ph) => ph.id === args.phase) || null;
    if (!phase) return usage('phase ' + args.phase + ' is not a phase of profile ' + binding.id + ' (' + binding.profile.phases.map((ph) => ph.id).join(', ') + ')');
  }

  if (binding.status === 'legacy') {
    if (args.scope) return { code: 0, out: head + 'PHASE SCOPE   ' + task.id + '   phase ' + args.phase + '\n' + pad('profile') + binding.reason + '\n' + pad('write scope') + 'V1 allowlist only (legacy snapshot)\n' + pad('V1 allowlist') + [claimDir + '/claim.json'].concat((task.mutexes || []).slice().sort().map((cl) => 'mutex/' + encodeClass(cl) + '/holder.json')).join(' · ') + '\n' };
    return { code: 0, out: head + 'NO HANDSHAKE (legacy snapshot)   ' + task.id + '   phase ' + args.phase + '\n' + pad('profile') + binding.reason + '\n' + pad('action') + 'CONTINUE - V1 behaviour (lane + mutexes + allowlist); no PHASE ENTRY, no MODE literal\n' };
  }

  const scope = resolveScope({ plan, task, profile: binding.profile, phase, claimDir, worktreePath: args.worktreePath || null });
  if (scope.errors.length) return usage(scope.errors.join('; '));

  if (args.scope) {
    const lines = [head.trimEnd(), 'PHASE SCOPE   ' + task.id + '   phase ' + phase.id + ' (' + phase.kind + ')'];
    lines.push(pad('profile') + binding.profile.profileId + ' v' + binding.profile.version + '  libraryHash ' + binding.hash.slice(0, 8) + '…');
    lines.push(pad('worktree') + scope.worktree.name + (scope.worktree.path ? ' -> ' + scope.worktree.path : ' (no filesystem scope)'));
    lines.push(pad('pinnedRef') + scope.pinnedRef);
    lines.push(pad('claim') + claimLine(scope.claimDir));
    lines.push(pad('write scope') + (scope.writes.length ? scope.writes.map((w) => w.resolved).join(' · ') : '(none)'));
    scope.lockouts.forEach((l) => lines.push('  lock-out        ' + l.surface + ' (' + l.class + ' not held by ' + task.id + ')'));
    lines.push(pad('V1 allowlist') + scope.allowlist.join(' · '));
    lines.push(pad('read-only') + (scope.readOnly.length ? scope.readOnly.join(' · ') : '(none)'));
    lines.push(pad('forbidden') + (scope.forbidden.length ? scope.forbidden.join(' · ') : '(none)'));
    lines.push(pad('declared actions') + (scope.actions.length ? scope.actions.join(', ') : 'none'));
    lines.push(pad('scope STOP') + 'a needed write outside the write scope and the V1 allowlist is BLOCKED scope-expansion (mutexes retained)');
    return { code: 0, out: lines.join('\n') + '\n' };
  }

  if (!args.lastAck) return usage('--phase requires --last-ack <UNKNOWN|MANUAL|ACCEPT_EDITS|AUTO>');
  if (!ACK_MODES.includes(args.lastAck)) return usage('--last-ack must be exactly one of UNKNOWN | MANUAL | ACCEPT_EDITS | AUTO (got ' + JSON.stringify(args.lastAck) + ')');
  const index = binding.profile.phases.indexOf(phase);
  let decision;
  if (phase.entryGate === 'AUTHORIZED_JSON' && !args.resumed) {
    decision = { action: 'STOP', reason: 'entry-gate-unsatisfied: AUTHORIZED_JSON is satisfied only by the --resume preconditions (R1-R5 of the worker), never by conversation text - run this phase in the --resume conversation' };
  } else {
    decision = decide({ lane: task.lane, phase, lastAck: args.lastAck, answered: args.answered, harnessMode: harnessModeOf(args.harnessSignal) });
  }
  const banner = renderEntry({ taskId: task.id, phase, index, count: binding.profile.phases.length, binding, claimDir: scope.claimDir, pinnedRef: scope.pinnedRef, lastAck: args.lastAck, acknowledgedAt: args.acknowledgedAt || null, harnessSignal: args.harnessSignal || null, scope, decision, resumed: args.resumed });
  return { code: decision.action === 'CONTINUE' ? 0 : 2, out: head + banner + '\n' };
}

function main() {
  const r = runCli(process.argv.slice(2));
  process.stdout.write(r.out);
  process.exit(r.code);
}

module.exports = {
  MODES, RANK, ACK_MODES, HARNESS_MODE_MAP, UNMAPPED_HARNESS_MODES, ACTIONS, OUTCOMES, USAGE,
  findTask, bindProfile, parseAck, harnessModeOf, decide, resolveScope, validateClaimDir,
  renderLadderBlock, renderEntry, renderPhases, runCli
};

if (require.main === module) main();
