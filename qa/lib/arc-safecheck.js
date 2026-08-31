'use strict';

/*
 * qa/lib/arc-safecheck.js
 *
 * WU-WFT slice S2+S4 (S2) — read-only ARC preflight safecheck (W-02 + D3 preflight JSON).
 *
 * Emits ONE JSON document to stdout and exits 0 = PASS, 1 = FAIL, 2 = UNVERIFIABLE.
 * Runs on demand (MAIN preflight + Lab resume points), never as a standing scheduled
 * runtime — D9, ruled with owner decision batch #1 D-3.
 *
 * CONTRACT (published source .ai-reports/handoffs/2026-08-31_wu-wft-plan-r2.COWORK.md §2):
 *   - read-only: NO writes, NO network, NO git mutation (read-only git queries only)
 *   - every check degrades to UNVERIFIABLE — never false-FAIL — when its whole surface is
 *     absent, so the same script is usable in a sandbox AND on the host
 *   - the output shape below is normative; any deviation is a test failure, not a warning
 *
 * DETECTION ONLY. This module never rewrites, repins or repairs any authority field. The
 * writer/repinning defect fix is WU-PROTO's property and is out of this arc's scope
 * (r2 stopCondition). Nothing here opens a file for writing.
 *
 * Pure Node. Reads `.git/arc-runtime/**`, `.ai-reports/arcs/**`,
 * `.ai-reports/qa-offline-primary-record/**`, and runs read-only `git` queries. Every
 * absence is guarded; nothing here throws on a missing or malformed surface.
 *
 * Owner rulings applied to authorityArtifact (2026-08-31, D-1/D-2 of the WFT-S2S4 plan):
 *   D-1(a) scope predicate is `execution != null` in arc.json; the terminal classifier is
 *          independently `state ∈ {CLOSED, CANCELLED}` ⇒ TERMINAL-HISTORICAL, reported
 *          as-is, never failed and never repaired.
 *   D-2    CORE-STREAM-shaped entries (published execution, but no revision to compare
 *          against) are reported with an explicit finding GRANDFATHERED — never silently
 *          excluded and never classified MISSING.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const namedArgs = require('./named-args');

const PASS = 'PASS';
const FAIL = 'FAIL';
const UNVERIFIABLE = 'UNVERIFIABLE';

const TERMINAL_ARC_STATES = ['CLOSED', 'CANCELLED'];
// Claim states that mean a conversation is actively holding the task (F2/F7 topology).
const LIVE_CLAIM_STATES = ['CLAIMED', 'WAITING_OWNER_GO', 'AUTHORIZED'];

// ── tiny read-only helpers; none of them throw ────────────────────────────────

function exists(p) {
  try { return fs.existsSync(p); } catch (e) { return false; }
}

function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
}

function readJSON(p) {
  const raw = readText(p);
  if (raw === null) return null;
  try { return JSON.parse(raw.replace(/\r\n/g, '\n')); } catch (e) { return null; }
}

function listDir(p) {
  try { return fs.readdirSync(p).sort(); } catch (e) { return []; }
}

function mtimeMs(p) {
  try { return fs.statSync(p).mtimeMs; } catch (e) { return null; }
}

/** Read-only git query. Returns trimmed stdout, or null when git or the repo is absent. */
function git(args, cwd) {
  try {
    const r = spawnSync('git', args, { cwd: cwd, encoding: 'utf8' });
    if (!r || r.status !== 0) return null;
    return String(r.stdout || '').trim();
  } catch (e) {
    return null;
  }
}

/*
 * Read-only git query preserving each line VERBATIM.
 *
 * `git()` trims, which is right for a single-token answer like `rev-parse` and WRONG for
 * `status --porcelain`, whose first two columns are significant and whose unstaged rows
 * begin with a space. Trimming turned " M path" into "M path", so the status field read as
 * a staged change and the path lost its first character (".claude/..." -> "claude/...").
 * Caught by the first live run of this module. Only trailing CR is removed.
 */
function gitLines(args, cwd) {
  try {
    const r = spawnSync('git', args, { cwd: cwd, encoding: 'utf8' });
    if (!r || r.status !== 0) return null;
    return String(r.stdout || '')
      .split('\n')
      .map(function (l) { return l.replace(/\r$/, ''); })
      .filter(function (l) { return l.trim() !== ''; });
  } catch (e) {
    return null;
  }
}

/** Walk a directory tree collecting file paths, relative to `base`. Bounded and guarded. */
function walk(dir, base, out) {
  out = out || [];
  const entries = listDir(dir);
  for (let i = 0; i < entries.length; i += 1) {
    const full = path.join(dir, entries[i]);
    let st;
    try { st = fs.statSync(full); } catch (e) { continue; }
    if (st.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

function result(state, extra) {
  const o = { state: state };
  if (extra) for (const k in extra) o[k] = extra[k];
  return o;
}

// ── individual checks ─────────────────────────────────────────────────────────

/** branchParity — HEAD vs its upstream, and the expected branch when one is declared. */
function checkBranchParity(ctx) {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], ctx.repoRoot);
  const head = git(['rev-parse', 'HEAD'], ctx.repoRoot);
  if (branch === null || head === null) {
    ctx.baseline = { branch: null, head: null, originParity: null };
    return result(UNVERIFIABLE, { detail: 'not a git repository, or git is unavailable' });
  }
  const origin = git(['rev-parse', 'origin/' + branch], ctx.repoRoot);
  const originParity = origin === null ? null : origin === head;
  ctx.baseline = { branch: branch, head: head, originParity: originParity };

  if (ctx.expectedBranch && branch !== ctx.expectedBranch) {
    return result(FAIL, { detail: 'on branch ' + branch + ', expected ' + ctx.expectedBranch });
  }
  if (ctx.expectedHead && head !== ctx.expectedHead) {
    return result(FAIL, { detail: 'HEAD ' + head + ' != expected ' + ctx.expectedHead });
  }
  if (origin === null) {
    return result(UNVERIFIABLE, { detail: 'no upstream origin/' + branch + ' to compare against' });
  }
  if (!originParity) {
    return result(FAIL, { detail: 'HEAD ' + head + ' != origin/' + branch + ' ' + origin });
  }
  return result(PASS, { detail: branch + ' = origin/' + branch + ' = ' + head });
}

/** pointerRegistry — plans/arcs/<ARC>/current.json planId == registry execution.planId. */
function checkPointerRegistry(ctx) {
  const arcsPointerRoot = path.join(ctx.runtimeRoot, 'plans', 'arcs');
  if (!exists(arcsPointerRoot) || !exists(ctx.arcsRoot)) {
    return result(UNVERIFIABLE, { detail: 'plans/arcs/ or the registry root is absent' });
  }
  const mismatches = [];
  const compared = [];
  const arcs = listDir(arcsPointerRoot);
  for (let i = 0; i < arcs.length; i += 1) {
    const arc = arcs[i];
    const ptr = readJSON(path.join(arcsPointerRoot, arc, 'current.json'));
    if (!ptr) continue; // retired or unreadable pointer: nothing live to compare
    const reg = readJSON(path.join(ctx.arcsRoot, arc, 'arc.json'));
    if (!reg) { mismatches.push(arc + ': live pointer but no registry entry'); continue; }
    const regPlan = reg.execution && reg.execution.planId;
    compared.push(arc);
    if (ptr.planId !== regPlan) {
      mismatches.push(arc + ': pointer planId ' + ptr.planId + ' != registry execution.planId ' + String(regPlan));
    }
  }
  if (!compared.length && !mismatches.length) {
    return result(UNVERIFIABLE, { detail: 'no live ARC pointer to compare' });
  }
  if (mismatches.length) return result(FAIL, { detail: mismatches.join(' | ') });
  return result(PASS, { detail: 'plans/arcs/*/current.json planId == registry execution.planId (' + compared.join(', ') + ')' });
}

/** Enumerate every claim record in both namespaces. Shared by liveClaims + workerTopology. */
function collectClaims(ctx) {
  const rows = [];
  const legacy = path.join(ctx.runtimeRoot, 'claims');
  const arcRoot = path.join(ctx.runtimeRoot, 'arc-claims');
  let anyRoot = false;

  if (exists(legacy)) {
    anyRoot = true;
    const tasks = listDir(legacy);
    for (let i = 0; i < tasks.length; i += 1) {
      rows.push(claimRow(null, tasks[i], path.join(legacy, tasks[i], 'claim.json')));
    }
  }
  if (exists(arcRoot)) {
    anyRoot = true;
    const arcs = listDir(arcRoot);
    for (let a = 0; a < arcs.length; a += 1) {
      const tasks = listDir(path.join(arcRoot, arcs[a]));
      for (let t = 0; t < tasks.length; t += 1) {
        rows.push(claimRow(arcs[a], tasks[t], path.join(arcRoot, arcs[a], tasks[t], 'claim.json')));
      }
    }
  }
  return { rows: rows, anyRoot: anyRoot };
}

function claimRow(arc, task, file) {
  if (!exists(file)) {
    // Documented INCOMPLETE-CLAIM residue: the directory exists with no claim.json.
    return { arc: arc, task: task, state: 'INCOMPLETE-CLAIM', conversationId: null, malformed: false };
  }
  const rec = readJSON(file);
  if (!rec) return { arc: arc, task: task, state: 'MALFORMED', conversationId: null, malformed: true };
  return {
    arc: arc,
    task: task,
    state: typeof rec.state === 'string' ? rec.state : 'MALFORMED',
    conversationId: rec.conversationId || null,
    malformed: typeof rec.state !== 'string'
  };
}

/** liveClaims — inventory; FAIL only on a malformed record. */
function checkLiveClaims(ctx) {
  const c = ctx.claims;
  if (!c.anyRoot) return result(UNVERIFIABLE, { claims: [] });
  const claims = c.rows.map(function (r) { return { arc: r.arc, task: r.task, state: r.state }; });
  const bad = c.rows.filter(function (r) { return r.malformed; });
  if (bad.length) {
    return result(FAIL, {
      claims: claims,
      detail: 'malformed claim record: ' + bad.map(function (r) { return (r.arc ? r.arc + '/' : '') + r.task; }).join(', ')
    });
  }
  return result(PASS, { claims: claims });
}

/** mutexHolders — inventory; FAIL on a class directory with no or an unreadable holder. */
function checkMutexHolders(ctx) {
  const mutexRoot = path.join(ctx.runtimeRoot, 'mutex');
  if (!exists(mutexRoot)) return result(UNVERIFIABLE, { holders: [] });
  const holders = [];
  const orphans = [];
  const dirs = listDir(mutexRoot);
  for (let i = 0; i < dirs.length; i += 1) {
    const cls = dirs[i].split('__').join(':');
    const rec = readJSON(path.join(mutexRoot, dirs[i], 'holder.json'));
    if (!rec) { orphans.push(dirs[i]); continue; }
    holders.push({
      class: cls,
      taskId: rec.taskId || null,
      lane: rec.lane || null,
      arcId: rec.arcId || null,
      acquiredAt: rec.acquiredAt || null
    });
  }
  if (orphans.length) {
    return result(FAIL, { holders: holders, detail: 'mutex directory with no readable holder.json: ' + orphans.join(', ') });
  }
  return result(PASS, { holders: holders });
}

/** stagingResidue — staged files / lock files / untracked. */
function checkStagingResidue(ctx) {
  const lines = gitLines(['status', '--porcelain'], ctx.repoRoot);
  if (lines === null) return result(UNVERIFIABLE, { detail: 'not a git repository, or git is unavailable' });

  const staged = [];
  const untracked = [];
  for (let i = 0; i < lines.length; i += 1) {
    // Porcelain v1: column 0 = index status, column 1 = worktree status, path from 3.
    // A leading space means "not staged" — which is why the raw line must not be trimmed.
    const x = lines[i].charAt(0);
    const name = lines[i].slice(3);
    if (lines[i].slice(0, 2) === '??') untracked.push(name);
    else if (x !== ' ' && x !== '?') staged.push(name);
  }
  // Locks are sampled once, BEFORE this module runs any git query of its own, so a lock
  // held transiently by our own read cannot be reported as residue.
  const locks = ctx.locksBefore || [];

  // "Unexpected" untracked requires a declared expectation; without one, untracked files
  // are reported but never failed, per the degrade rule.
  let unexpected = [];
  if (ctx.expectedUntracked) {
    unexpected = untracked.filter(function (u) { return ctx.expectedUntracked.indexOf(u) === -1; });
  }

  const problems = [];
  if (staged.length) problems.push('staged: ' + staged.join(', '));
  if (locks.length) problems.push('lock files: ' + locks.join(', '));
  if (unexpected.length) problems.push('unexpected untracked: ' + unexpected.join(', '));
  if (problems.length) return result(FAIL, { detail: problems.join(' | ') });

  return result(PASS, {
    detail: 'no staged files, no lock files; untracked reported only: '
      + (untracked.length ? untracked.join(', ') : 'none')
      + (ctx.expectedUntracked ? '' : ' (no expectedUntracked declared, so untracked are not failed)')
  });
}

/** Newest recorded GREEN: an explicit input wins, else the primary-record directory. */
function newestGreen(ctx) {
  if (ctx.greenAt) return { at: ctx.greenAt, source: 'input' };
  const dir = path.join(ctx.repoRoot, '.ai-reports', 'qa-offline-primary-record');
  if (!exists(dir)) return null;
  const files = listDir(dir).filter(function (f) { return /\.md$/.test(f); });
  let best = null;
  for (let i = 0; i < files.length; i += 1) {
    const text = readText(path.join(dir, files[i]));
    if (!text) continue;
    if (!/Exit code:\*\*\s*`?0`?/.test(text) && !/exit 0/i.test(text)) continue;
    const m = text.match(/\*\*Timestamp:\*\*\s*`([^`]+)`/);
    if (!m) continue;
    const t = Date.parse(m[1]);
    if (isNaN(t)) continue;
    // run-#2 lesson: always take the NEWEST green before flagging anything.
    if (best === null || t > best.ms) best = { ms: t, at: m[1], source: files[i] };
  }
  return best;
}

/** evidenceFreshness (F11) — FAIL only when a declared-surface write postdates the GREEN. */
function checkEvidenceFreshness(ctx) {
  const green = newestGreen(ctx);
  const surfaces = ctx.declaredSurfaces || [];
  if (!green) {
    return result(UNVERIFIABLE, { lastGreenAt: null, writesAfterGreen: [], detail: 'no recorded GREEN to compare against' });
  }
  if (!surfaces.length) {
    return result(UNVERIFIABLE, { lastGreenAt: green.at, writesAfterGreen: [], detail: 'no declared surfaces supplied' });
  }
  const greenMs = green.ms !== undefined ? green.ms : Date.parse(green.at);
  if (isNaN(greenMs)) {
    return result(UNVERIFIABLE, { lastGreenAt: green.at, writesAfterGreen: [], detail: 'unparseable GREEN timestamp' });
  }
  const after = [];
  for (let i = 0; i < surfaces.length; i += 1) {
    const full = path.join(ctx.repoRoot, surfaces[i]);
    if (!exists(full)) continue;
    let files;
    try { files = fs.statSync(full).isDirectory() ? walk(full, ctx.repoRoot) : [surfaces[i]]; } catch (e) { continue; }
    for (let f = 0; f < files.length; f += 1) {
      const ms = mtimeMs(path.join(ctx.repoRoot, files[f]));
      if (ms !== null && ms > greenMs) after.push(files[f]);
    }
  }
  if (after.length) {
    return result(FAIL, { lastGreenAt: green.at, writesAfterGreen: after.sort() });
  }
  return result(PASS, { lastGreenAt: green.at, writesAfterGreen: [] });
}

/** pathToAuthority (F13) — any repo write outside the declared file list since baseline. */
function checkPathToAuthority(ctx) {
  const declared = ctx.declaredWrites;
  if (!declared || !declared.length) {
    return result(UNVERIFIABLE, { undeclaredWrites: [], detail: 'no declared write list supplied' });
  }
  const lines = gitLines(['status', '--porcelain'], ctx.repoRoot);
  if (lines === null) {
    return result(UNVERIFIABLE, { undeclaredWrites: [], detail: 'not a git repository, or git is unavailable' });
  }
  const changed = lines.map(function (l) { return l.slice(3).trim(); });

  // Writes the owner accepted out of band (e.g. an ACCEPT + FREEZE ruling) are declared by
  // input, never inferred. Absent that input they correctly read as undeclared.
  const accepted = ctx.acceptedWrites || [];
  const undeclared = changed.filter(function (f) {
    if (accepted.indexOf(f) !== -1) return false;
    return !declared.some(function (d) {
      if (d.slice(-3) === '/**') return f.indexOf(d.slice(0, -2)) === 0;
      return f === d;
    });
  });
  if (undeclared.length) return result(FAIL, { undeclaredWrites: undeclared.sort() });
  return result(PASS, { undeclaredWrites: [] });
}

/**
 * authorityArtifact (r2) — is each arc's `authority.artifact` the authoritative source of
 * its currently published execution revision? DETECTION ONLY; never repaired.
 */
function checkAuthorityArtifact(ctx) {
  if (!exists(ctx.arcsRoot)) {
    return result(UNVERIFIABLE, { arcs: [], detail: 'no .ai-reports/arcs root' });
  }
  const arcs = [];
  const dirs = listDir(ctx.arcsRoot);
  for (let i = 0; i < dirs.length; i += 1) {
    const reg = readJSON(path.join(ctx.arcsRoot, dirs[i], 'arc.json'));
    if (!reg) continue;

    // D-1(a): scope predicate is a published execution revision.
    const hasExecution = !!(reg.execution && reg.execution.planId);
    if (!hasExecution) continue;

    const artifact = (reg.authority && reg.authority.artifact) || null;
    const revisions = (reg.planning && reg.planning.revisions) || [];
    const current = reg.planning && reg.planning.currentRevision;
    const currentRev = revisions.filter(function (r) { return r.rev === current; })[0];
    const row = {
      arc: reg.arcId || dirs[i],
      publishedRevision: current === undefined || current === null ? null : String(current),
      authorityArtifact: artifact,
      finding: null
    };

    // D-1(a): the terminal classifier is independent of the scope predicate.
    if (TERMINAL_ARC_STATES.indexOf(reg.state) !== -1) {
      row.finding = 'TERMINAL-HISTORICAL';
      arcs.push(row);
      continue;
    }
    // D-2: a published execution with no revision to compare against (CORE-STREAM shape).
    if (!currentRev) {
      row.finding = 'GRANDFATHERED';
      arcs.push(row);
      continue;
    }
    if (!artifact || !exists(path.join(ctx.repoRoot, artifact))) {
      row.finding = 'MISSING';
      arcs.push(row);
      continue;
    }
    if (artifact === currentRev.source) {
      row.finding = 'CURRENT';
      arcs.push(row);
      continue;
    }
    const earlier = revisions.filter(function (r) { return r.source === artifact && r.rev !== current; })[0];
    row.finding = earlier ? 'SUPERSEDED' : 'MISSING';
    arcs.push(row);
  }

  if (!arcs.length) return result(UNVERIFIABLE, { arcs: [], detail: 'no arc with a published execution revision' });
  const bad = arcs.filter(function (r) { return r.finding === 'MISSING' || r.finding === 'SUPERSEDED'; });
  if (bad.length) {
    return result(FAIL, {
      arcs: arcs,
      detail: bad.map(function (r) { return r.arc + ': ' + r.finding; }).join(', ')
    });
  }
  return result(PASS, { arcs: arcs });
}

/** shellPerCommand (F8-C) — input-driven; there is no repo-resident surface for it. */
function checkShellPerCommand(ctx) {
  const plan = ctx.shellPlan;
  if (!plan || !plan.length) {
    return result(UNVERIFIABLE, { detail: 'F8-C: required shell per pending command; no pending-command input supplied' });
  }
  const bad = plan.filter(function (c) { return c.requiredShell && c.plannedShell && c.requiredShell !== c.plannedShell; });
  if (bad.length) {
    return result(FAIL, {
      detail: 'F8-C: shell mismatch: ' + bad.map(function (c) {
        return String(c.command) + ' requires ' + c.requiredShell + ' but is planned for ' + c.plannedShell;
      }).join(' | ')
    });
  }
  return result(PASS, { detail: 'F8-C: required shell per pending command matches for all ' + plan.length + ' pending command(s)' });
}

/**
 * workerTopology (F2/F7) — distinct conversation per Lab. Derived from the live claims:
 * every non-terminal claim records its conversationId, so one conversation holding live
 * claims for two different tasks is a real, mechanically detectable topology violation.
 */
function checkWorkerTopology(ctx) {
  const c = ctx.claims;
  if (!c.anyRoot) {
    return result(UNVERIFIABLE, { detail: 'F2/F7: distinct conversation per Lab; no claim root to read' });
  }
  const live = c.rows.filter(function (r) {
    return LIVE_CLAIM_STATES.indexOf(r.state) !== -1 && r.conversationId;
  });
  if (!live.length) {
    return result(UNVERIFIABLE, { detail: 'F2/F7: distinct conversation per Lab; no live claim carries a conversationId' });
  }
  const byConv = {};
  for (let i = 0; i < live.length; i += 1) {
    const key = live[i].conversationId;
    const label = (live[i].arc ? live[i].arc + '/' : '') + live[i].task;
    if (!byConv[key]) byConv[key] = [];
    if (byConv[key].indexOf(label) === -1) byConv[key].push(label);
  }
  const shared = Object.keys(byConv).filter(function (k) { return byConv[k].length > 1; });
  if (shared.length) {
    return result(FAIL, {
      detail: 'F2/F7: one conversation holds live claims for multiple tasks: '
        + shared.map(function (k) { return k + ' -> ' + byConv[k].join(' + '); }).join(' | ')
    });
  }
  return result(PASS, {
    detail: 'F2/F7: distinct conversation per Lab; ' + live.length + ' live claim(s), no shared conversation'
  });
}

// ── composition ───────────────────────────────────────────────────────────────

/** Verdict precedence: any FAIL ⇒ FAIL; else any UNVERIFIABLE ⇒ UNVERIFIABLE; else PASS. */
function verdictOf(checks) {
  const states = Object.keys(checks).map(function (k) { return checks[k].state; });
  if (states.indexOf(FAIL) !== -1) return FAIL;
  if (states.indexOf(UNVERIFIABLE) !== -1) return UNVERIFIABLE;
  return PASS;
}

/**
 * Run every check and build the normative document.
 * Every path input is injectable so the QA suite can drive fixtures without touching the
 * live repository.
 */
function safecheck(options) {
  const opts = options || {};
  const repoRoot = opts.repoRoot || process.cwd();
  const runtimeRoot = opts.runtimeRoot || path.join(repoRoot, '.git', 'arc-runtime');
  const ctx = {
    repoRoot: repoRoot,
    runtimeRoot: runtimeRoot,
    arcsRoot: opts.arcsRoot || path.join(repoRoot, '.ai-reports', 'arcs'),
    expectedBranch: opts.expectedBranch || null,
    expectedHead: opts.expectedHead || null,
    declaredWrites: opts.declaredWrites || null,
    acceptedWrites: opts.acceptedWrites || null,
    declaredSurfaces: opts.declaredSurfaces || null,
    expectedUntracked: opts.expectedUntracked || null,
    greenAt: opts.greenAt || null,
    shellPlan: opts.shellPlan || null,
    baseline: { branch: null, head: null, originParity: null }
  };

  // Sample lock files FIRST, before any git query this module makes. `git` itself creates
  // and removes .git/index.lock during ordinary work, so sampling after our own calls
  // would race and could report our own transient lock as repository residue.
  const lockCandidates = ['.git/index.lock', '.git/HEAD.lock', 'package-lock.json.lock'];
  ctx.locksBefore = lockCandidates.filter(function (l) { return exists(path.join(repoRoot, l)); });

  ctx.claims = collectClaims(ctx);

  const checks = {};
  checks.branchParity = checkBranchParity(ctx);
  checks.pointerRegistry = checkPointerRegistry(ctx);
  checks.liveClaims = checkLiveClaims(ctx);
  checks.mutexHolders = checkMutexHolders(ctx);
  checks.stagingResidue = checkStagingResidue(ctx);
  checks.evidenceFreshness = checkEvidenceFreshness(ctx);
  checks.pathToAuthority = checkPathToAuthority(ctx);
  checks.authorityArtifact = checkAuthorityArtifact(ctx);
  checks.shellPerCommand = checkShellPerCommand(ctx);
  checks.workerTopology = checkWorkerTopology(ctx);

  return {
    at: opts.now || new Date().toISOString(),
    baseline: ctx.baseline,
    checks: checks,
    verdict: verdictOf(checks)
  };
}

/** PASS -> 0, FAIL -> 1, UNVERIFIABLE -> 2. */
function exitCodeFor(verdict) {
  if (verdict === PASS) return 0;
  if (verdict === FAIL) return 1;
  return 2;
}

const USAGE = [
  'arc-safecheck - read-only ARC preflight; one JSON document to stdout.',
  '',
  'usage: node qa/lib/arc-safecheck.js [options]',
  '  --repo-root <dir>          repository root (default: cwd)',
  '  --runtime-root <dir>       ARC runtime root (default: <repo>/.git/arc-runtime)',
  '  --arcs-root <dir>          registry root (default: <repo>/.ai-reports/arcs)',
  '  --expected-branch <name>   fail when HEAD is not on this branch',
  '  --expected-head <sha>      fail when HEAD is not this commit',
  '  --declared-writes <list>   comma-separated declared write surfaces (F13)',
  '  --accepted-writes <list>   comma-separated owner-accepted out-of-band writes (F13)',
  '  --declared-surfaces <list> comma-separated surfaces for the freshness stamp (F11)',
  '  --green-at <iso>           override the newest recorded GREEN timestamp',
  '  --now <iso>                fix the document timestamp (determinism)',
  '',
  'exit 0 = PASS, 1 = FAIL, 2 = UNVERIFIABLE'
].join('\n');

const CLI_SPEC = {
  value: {
    '--repo-root': 'repoRoot',
    '--runtime-root': 'runtimeRoot',
    '--arcs-root': 'arcsRoot',
    '--expected-branch': 'expectedBranch',
    '--expected-head': 'expectedHead',
    '--declared-writes': 'declaredWrites',
    '--accepted-writes': 'acceptedWrites',
    '--declared-surfaces': 'declaredSurfaces',
    '--green-at': 'greenAt',
    '--now': 'now'
  },
  boolean: { '--help': 'help' },
  aliases: { '-h': '--help' }
};

function splitList(v) {
  if (!v) return null;
  const parts = v.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  return parts.length ? parts : null;
}

/** Pure CLI shell: returns {code, out} and performs no I/O of its own. */
function runCli(argv) {
  const parsed = namedArgs.parse(argv, CLI_SPEC);
  if (parsed.error) return { code: 3, out: 'ARC-SAFECHECK ERROR - ' + parsed.error + '\n' + USAGE };
  if (parsed.values.help) return { code: 0, out: USAGE };

  const v = parsed.values;
  const doc = safecheck({
    repoRoot: v.repoRoot,
    runtimeRoot: v.runtimeRoot,
    arcsRoot: v.arcsRoot,
    expectedBranch: v.expectedBranch,
    expectedHead: v.expectedHead,
    declaredWrites: splitList(v.declaredWrites),
    acceptedWrites: splitList(v.acceptedWrites),
    declaredSurfaces: splitList(v.declaredSurfaces),
    greenAt: v.greenAt,
    now: v.now
  });
  return { code: exitCodeFor(doc.verdict), out: JSON.stringify(doc, null, 2) };
}

module.exports = {
  safecheck: safecheck,
  runCli: runCli,
  exitCodeFor: exitCodeFor,
  verdictOf: verdictOf,
  USAGE: USAGE,
  PASS: PASS,
  FAIL: FAIL,
  UNVERIFIABLE: UNVERIFIABLE
};

if (require.main === module) {
  const r = runCli(namedArgs.userArgv(process.argv, { evalMode: false }));
  process.stdout.write(r.out + '\n');
  process.exit(r.code);
}
