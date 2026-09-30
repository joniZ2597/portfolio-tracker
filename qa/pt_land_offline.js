'use strict';

/*
 * qa/pt_land_offline.js
 *
 * R12 (work/worker-land-push/brief.md §7) — real git in temp dirs under os.tmpdir(), no network.
 * Exercises .claude/hooks/pt-land.js (the L1-L16 LAND checks and P1-P13 PUSH checks) against a
 * fixture matching qa/guard_integrity_check.js's worktree-name expectations: a bare origin.git, a
 * canonical clone at <tmp>/portfolio-tracker (main + branch-dev, with a committed copy of the real
 * pt-land.js and qa/guard_integrity_check.js and a brief with a land-scope block), and linked
 * worktrees <tmp>/pt-wt-worker-a (on task/x) and <tmp>/pt-wt-worker-b.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
// PT_LAND_TOOL_PATH lets this suite validate a not-yet-copied candidate before the Owner applies
// it to the real DENY-tier path (same override shape as AH_HOOK_PATH in auto_mode_hardening_offline.js).
// It is only green against the real path once the Owner has copied the reviewed candidate in.
const REAL_TOOL_PATH = process.env.PT_LAND_TOOL_PATH
  ? path.resolve(process.env.PT_LAND_TOOL_PATH)
  : path.join(ROOT, '.claude', 'hooks', 'pt-land.js');
const REAL_INTEGRITY_PATH = path.join(ROOT, 'qa', 'guard_integrity_check.js');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failed += 1;
    failures.push(name + ' -- ' + (e && e.message ? e.message : String(e)));
  }
}

// ── git plumbing ─────────────────────────────────────────────────────────────────────────
function G(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) {
    throw new Error('git ' + args.join(' ') + ' in ' + cwd + ' failed: ' + (r.stderr || r.stdout));
  }
  return String(r.stdout);
}
function W(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }

const DEFAULT_LAND_EVIDENCE = 'LAND-EVIDENCE: qa-offline=PASS 52; targeted=PASS; codex-classI-unresolved=0';

// Builds: bare origin.git; canonical clone at <tmp>/portfolio-tracker (main+branch-dev, a
// committed pt-land.js + guard_integrity_check.js, a brief with a land-scope block); slot
// worktrees pt-wt-worker-a (on task/<id>, with the implementation + review.md commit already
// made) and pt-wt-worker-b (detached at branch-dev). Returns everything a test needs plus a
// requireTool() that requires the exact committed pt-land.js path for this fixture.
function buildFixture(opts) {
  opts = opts || {};
  const taskShort = opts.taskShort || 'x';
  const task = 'task/' + taskShort;
  const toolSource = opts.toolSource || REAL_TOOL_PATH;
  const withSlotB = opts.withSlotB !== false;
  const withSlotA = opts.withSlotA !== false;
  const landEvidenceLine = opts.landEvidenceLine === undefined ? DEFAULT_LAND_EVIDENCE : opts.landEvidenceLine;
  const scopeRelPaths = opts.scopeRelPaths || ['work/' + taskShort + '/foo.txt'];
  const noLandScope = opts.noLandScope === true;
  const twoLandScopeBlocks = opts.twoLandScopeBlocks === true;
  const originUrl = opts.originUrl; // if set, used instead of the bare dir path (P4 fixtures)

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ptland-qa-'));
  const bareDir = path.join(tmp, 'origin.git');
  const canon = path.join(tmp, 'portfolio-tracker');
  const slotA = path.join(tmp, 'pt-wt-worker-a');
  const slotB = path.join(tmp, 'pt-wt-worker-b');

  fs.mkdirSync(bareDir, { recursive: true });
  G(['init', '--bare', '-b', 'main', bareDir], tmp);

  fs.mkdirSync(canon, { recursive: true });
  G(['init', '-b', 'main', canon], tmp);
  G(['config', 'user.email', 'test@test.local'], canon);
  G(['config', 'user.name', 'Test'], canon);
  G(['remote', 'add', 'origin', originUrl || bareDir], canon);

  W(path.join(canon, 'README.md'), 'hello\n');
  G(['add', 'README.md'], canon);
  G(['commit', '-m', 'init'], canon);
  G(['branch', 'branch-dev'], canon);
  if (!originUrl) { G(['push', 'origin', 'main'], canon); G(['push', 'origin', 'branch-dev'], canon); }
  G(['checkout', 'branch-dev'], canon);

  fs.mkdirSync(path.join(canon, '.claude', 'hooks'), { recursive: true });
  fs.copyFileSync(toolSource, path.join(canon, '.claude', 'hooks', 'pt-land.js'));
  fs.mkdirSync(path.join(canon, 'qa'), { recursive: true });
  fs.copyFileSync(REAL_INTEGRITY_PATH, path.join(canon, 'qa', 'guard_integrity_check.js'));
  G(['add', '.claude/hooks/pt-land.js', 'qa/guard_integrity_check.js'], canon);
  G(['commit', '-m', 'add tool'], canon);
  if (!originUrl) G(['push', 'origin', 'branch-dev'], canon);

  let briefBody = '# brief\n\n';
  if (!noLandScope) {
    briefBody += '<!-- land-scope:begin -->\n' + scopeRelPaths.map((p) => '- ' + p).join('\n') + '\n<!-- land-scope:end -->\n';
    if (twoLandScopeBlocks) {
      briefBody += '<!-- land-scope:begin -->\n- ' + scopeRelPaths[0] + '\n<!-- land-scope:end -->\n';
    }
  }
  W(path.join(canon, 'work', taskShort, 'brief.md'), briefBody);
  G(['add', 'work/' + taskShort + '/brief.md'], canon);
  G(['commit', '-m', 'brief'], canon);
  if (!originUrl) G(['push', 'origin', 'branch-dev'], canon);
  const base = G(['rev-parse', 'branch-dev'], canon).trim();

  let slotAPath = null;
  let tip = null;
  if (withSlotA) {
    G(['worktree', 'add', '-b', task, slotA, 'branch-dev'], canon);
    slotAPath = slotA;
    if (opts.slotACommit !== false) {
      for (const rel of scopeRelPaths) W(path.join(slotA, rel), 'impl\n');
      const reviewText = '# review\n\n' + (landEvidenceLine === null ? '' : landEvidenceLine + '\n') +
        (opts.duplicateLandEvidence ? landEvidenceLine + '\n' : '');
      W(path.join(slotA, 'work', taskShort, 'review.md'), reviewText);
      const addList = scopeRelPaths.concat(['work/' + taskShort + '/review.md']);
      G(['add'].concat(addList), slotA);
      G(['commit', '-m', 'impl'], slotA);
      tip = G(['rev-parse', 'HEAD'], slotA).trim();
    }
  }

  let slotBPath = null;
  if (withSlotB) {
    G(['worktree', 'add', '--detach', slotB, 'branch-dev'], canon);
    slotBPath = slotB;
  }

  const mainOid = G(['rev-parse', 'main'], canon).trim();
  const commonDir = path.join(canon, '.git');

  function requireTool() {
    delete require.cache[require.resolve(path.join(canon, '.claude', 'hooks', 'pt-land.js'))];
    return require(path.join(canon, '.claude', 'hooks', 'pt-land.js'));
  }
  function writeLandRecord(text) { fs.writeFileSync(path.join(commonDir, 'pt-land-approval'), text); }
  function writePushRecord(text) { fs.writeFileSync(path.join(commonDir, 'pt-push-approval'), text); }
  function cleanup() { rmrf(tmp); }

  return {
    tmp, bareDir, canon, slotA: slotAPath, slotB: slotBPath, task, taskShort, base, tip, mainOid,
    commonDir, requireTool, writeLandRecord, writePushRecord, cleanup, originUrl: originUrl || bareDir
  };
}

// Clean, informative failure (rather than an uncaught ENOENT) when the R12 candidate has not
// yet been copied into the real DENY-tier path by the Owner.
if (!fs.existsSync(REAL_TOOL_PATH)) {
  process.stdout.write('  FAIL  ' + REAL_TOOL_PATH + ' does not exist (Owner has not applied the R12 pt-land.js candidate yet)\n');
  process.stdout.write('OFFLINE VALIDATION (pt-land): FAIL (0/0)\n');
  process.exit(1);
}

// ── PL-1 / PL-2: valid land-request / land ──────────────────────────────────────────────
(function plHappyPath() {
  const fx = buildFixture({ taskShort: 'a' });
  try {
    const TOOL = fx.requireTool();

    let r;
    test('PL-1: valid land-request from the slot -> exit 0, all checks PASS, no writes', () => {
      const before = fs.readdirSync(fx.commonDir).sort();
      r = TOOL.runLandRequest({ cwd: fx.slotA, task: fx.task });
      assert.strictEqual(r.ok, true, JSON.stringify(r));
      assert.strictEqual(r.exitCode, 0);
      assert.ok(r.report.checks.every((c) => /PASS$/.test(c)), 'every check PASS');
      const expectedLine = "! printf '%s\\n' 'LAND " + fx.task + ' ' + fx.tip + ' ' + fx.base + "' > '" +
        fx.commonDir.replace(/\\/g, '/') + "/pt-land-approval'";
      assert.strictEqual(r.approvalLine, expectedLine);
      const after = fs.readdirSync(fx.commonDir).sort();
      assert.deepStrictEqual(before, after, 'land-request must write nothing');
    });

    test('PL-2: valid land with the record -> branch-dev==tip, clean, record deleted, audit line, lock gone', () => {
      fx.writeLandRecord('LAND ' + fx.task + ' ' + fx.tip + ' ' + fx.base + '\n');
      const r2 = TOOL.runLand({ cwd: fx.slotA, task: fx.task });
      assert.strictEqual(r2.ok, true, JSON.stringify(r2));
      assert.strictEqual(G(['rev-parse', 'branch-dev'], fx.canon).trim(), fx.tip);
      assert.strictEqual(G(['status', '--porcelain'], fx.canon).trim(), '');
      assert.ok(!fs.existsSync(path.join(fx.commonDir, 'pt-land-approval')), 'record deleted');
      assert.ok(!fs.existsSync(path.join(fx.commonDir, 'pt-land.lock')), 'lock removed');
      const audit = fs.readFileSync(path.join(fx.commonDir, 'pt-land-log'), 'utf8').trim().split('\n');
      assert.strictEqual(audit.length, 1);
      const entry = JSON.parse(audit[0]);
      assert.strictEqual(entry.verb, 'land');
      assert.strictEqual(entry.result, 'ok');
    });

    test('PL-4: record reuse (second land with the same, now-deleted record) -> refuse', () => {
      fx.writeLandRecord('LAND ' + fx.task + ' ' + fx.tip + ' ' + fx.base + '\n');
      const r3 = TOOL.runLand({ cwd: fx.slotA, task: fx.task });
      assert.strictEqual(r3.ok, false);
      assert.match(r3.reason, /L12|L3|L4/);
    });
  } finally { fx.cleanup(); }
})();

// ── PL-3: land refusals on the record ────────────────────────────────────────────────────
(function plRecordRefusals() {
  const cases = [
    ['no record', (fx) => {}],
    ['malformed record', (fx) => fx.writeLandRecord('not a record\n')],
    ['wrong task', (fx) => fx.writeLandRecord('LAND task/other ' + fx.tip + ' ' + fx.base + '\n')],
    ['stale tip', (fx) => fx.writeLandRecord('LAND ' + fx.task + ' ' + '0'.repeat(40) + ' ' + fx.base + '\n')],
    ['stale base', (fx) => fx.writeLandRecord('LAND ' + fx.task + ' ' + fx.tip + ' ' + '0'.repeat(40) + '\n')],
    ['a PUSH record in the LAND file', (fx) => fx.writeLandRecord('PUSH branch-dev ' + fx.tip + ' ' + fx.base + '\n')]
  ];
  for (const [label, mutate] of cases) {
    test('PL-3: ' + label + ' -> refuse, nothing merged', () => {
      const fx = buildFixture({ taskShort: 'b' });
      try {
        mutate(fx);
        const before = G(['rev-parse', 'branch-dev'], fx.canon).trim();
        const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
        assert.strictEqual(r.ok, false, label);
        assert.strictEqual(G(['rev-parse', 'branch-dev'], fx.canon).trim(), before, 'nothing merged: ' + label);
      } finally { fx.cleanup(); }
    });
  }
})();

// ── PL-5 / PL-6: ancestry and merge-commit refusals ─────────────────────────────────────
test('PL-5: branch-dev advanced past the base (not an ancestor) -> refuse Second LAND, nothing merged', () => {
  const fx = buildFixture({ taskShort: 'c' });
  try {
    W(path.join(fx.canon, 'other.txt'), 'x\n');
    G(['add', 'other.txt'], fx.canon);
    G(['commit', '-m', 'advance branch-dev'], fx.canon);
    const before = G(['rev-parse', 'branch-dev'], fx.canon).trim();
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /Second LAND/);
    assert.strictEqual(G(['rev-parse', 'branch-dev'], fx.canon).trim(), before);
  } finally { fx.cleanup(); }
});

test('PL-6: merge commit in the task range -> refuse', () => {
  const fx = buildFixture({ taskShort: 'd' });
  try {
    // Fabricate a merge commit inside base..tip by merging an unrelated branch into the slot.
    G(['branch', 'side', fx.base], fx.canon);
    G(['checkout', 'side'], fx.canon);
    W(path.join(fx.canon, 'side.txt'), 'y\n');
    G(['add', 'side.txt'], fx.canon);
    G(['commit', '-m', 'side'], fx.canon);
    G(['checkout', 'branch-dev'], fx.canon);
    G(['merge', '--no-ff', '-m', 'merge side', 'side'], fx.slotA); // merge into the SLOT (task branch), not canonical
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /merge commit/);
  } finally { fx.cleanup(); }
});

test('PL-6: zero commits in base..tip -> refuse', () => {
  const fx = buildFixture({ taskShort: 'e', withSlotA: false });
  try {
    // task branch created but no impl commit: tip === base.
    G(['branch', fx.task, 'branch-dev'], fx.canon);
    const tmp2 = path.join(fx.tmp, 'pt-wt-worker-a');
    G(['worktree', 'add', tmp2, fx.task], fx.canon);
    const r = fx.requireTool().runLand({ cwd: tmp2, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /no commits/);
  } finally { fx.cleanup(); }
});

// ── PL-7: canonical/slot state refusals ─────────────────────────────────────────────────
(function plStateRefusals() {
  test('PL-7: canonical dirty (tracked change) -> refuse', () => {
    const fx = buildFixture({ taskShort: 'f' });
    try {
      fs.writeFileSync(path.join(fx.canon, 'README.md'), 'dirty\n');
      const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
      assert.strictEqual(r.ok, false);
      assert.match(r.reason, /L4/);
    } finally { fx.cleanup(); }
  });
  test('PL-7: canonical dirty (untracked file) -> refuse', () => {
    const fx = buildFixture({ taskShort: 'g' });
    try {
      fs.writeFileSync(path.join(fx.canon, 'untracked.txt'), 'x\n');
      const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
      assert.strictEqual(r.ok, false);
      assert.match(r.reason, /L4/);
    } finally { fx.cleanup(); }
  });
  test('PL-7: canonical not on branch-dev -> refuse', () => {
    const fx = buildFixture({ taskShort: 'h' });
    try {
      // Require the tool first (checking out a branch lacking the committed tool file would
      // delete it from disk, breaking L2 self-integrity before L4 is even reached). Branch off
      // branch-dev itself so the tool/qa files stay present but HEAD is no longer branch-dev.
      const TOOL = fx.requireTool();
      G(['checkout', '-b', 'other-dev'], fx.canon);
      const r = TOOL.runLand({ cwd: fx.slotA, task: fx.task });
      assert.strictEqual(r.ok, false);
      assert.match(r.reason, /L4/);
    } finally { fx.cleanup(); }
  });
  test('PL-7: slot dirty -> refuse', () => {
    const fx = buildFixture({ taskShort: 'i' });
    try {
      fs.writeFileSync(path.join(fx.slotA, 'dirty.txt'), 'x\n');
      const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
      assert.strictEqual(r.ok, false);
      assert.match(r.reason, /L5/);
    } finally { fx.cleanup(); }
  });
  // "Slot HEAD != tip" cannot arise through ordinary git commands for the CALLING slot: L1
  // already binds tip to that same slot's live HEAD ref, so they are read from the identical
  // ref and can never disagree except via the TOCTOU window L13 independently guards. The
  // reachable, distinct L5 case is a caller OTHER than the task's own slot (the Bootstrap/
  // canonical exception) finding that slot dirty - L5 must still catch it from that caller.
  test('PL-7: task worktree dirty, called from the canonical checkout (Bootstrap) -> refuse', () => {
    const fx = buildFixture({ taskShort: 'j' });
    try {
      fs.writeFileSync(path.join(fx.slotA, 'dirty-from-canon.txt'), 'x\n');
      const r = fx.requireTool().runLand({ cwd: fx.canon, task: fx.task });
      assert.strictEqual(r.ok, false);
      assert.match(r.reason, /L5/);
    } finally { fx.cleanup(); }
  });
})();

// ── PL-8: brief refusals ────────────────────────────────────────────────────────────────
(function plBriefRefusals() {
  test('PL-8: brief missing at base -> refuse', () => {
    const fx = buildFixture({ taskShort: 'k' });
    try {
      // Force base to a commit before the brief existed by resetting branch-dev backwards, then
      // fast-forward is broken -- instead exercise directly: build a fixture with no brief file.
    } finally { fx.cleanup(); }
  });
})();
test('PL-8: brief missing at base -> refuse (legacy brief: Owner LAND)', () => {
  const fx = buildFixture({ taskShort: 'l' });
  try {
    // Remove the brief on branch-dev by amending it out, at a NEW base that has no brief blob.
    rmrf(path.join(fx.canon, 'work', fx.taskShort));
    G(['add', '-A', 'work'], fx.canon);
    G(['commit', '-m', 'remove brief'], fx.canon);
    const newBase = G(['rev-parse', 'branch-dev'], fx.canon).trim();
    // Rebuild the slot on the new base so L3/L5 still line up.
    G(['worktree', 'remove', '--force', fx.slotA], fx.canon);
    G(['branch', '-D', fx.task], fx.canon);
    G(['worktree', 'add', '-b', fx.task, fx.slotA, 'branch-dev'], fx.canon);
    W(path.join(fx.slotA, 'work', fx.taskShort, 'foo.txt'), 'impl\n');
    W(path.join(fx.slotA, 'work', fx.taskShort, 'review.md'), '# review\n\n' + DEFAULT_LAND_EVIDENCE + '\n');
    G(['add', 'work/' + fx.taskShort + '/foo.txt', 'work/' + fx.taskShort + '/review.md'], fx.slotA);
    G(['commit', '-m', 'impl2'], fx.slotA);
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /L6|missing at the base/);
  } finally { fx.cleanup(); }
});
test('PL-8: brief edited by the task -> refuse', () => {
  const fx = buildFixture({ taskShort: 'm' });
  try {
    W(path.join(fx.slotA, 'work', fx.taskShort, 'brief.md'), '# tampered brief\n');
    G(['add', 'work/' + fx.taskShort + '/brief.md'], fx.slotA);
    G(['commit', '-m', 'edit brief'], fx.slotA);
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /L6/);
  } finally { fx.cleanup(); }
});
test('PL-8: no land-scope block -> refuse legacy brief: Owner LAND', () => {
  const fx = buildFixture({ taskShort: 'n', noLandScope: true });
  try {
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /legacy brief: Owner LAND/);
  } finally { fx.cleanup(); }
});
test('PL-8 (parser unit): two land-scope blocks -> legacy brief refusal', () => {
  const fx = buildFixture({ taskShort: 'n2', twoLandScopeBlocks: true });
  try {
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /legacy brief: Owner LAND/);
  } finally { fx.cleanup(); }
});

// ── PL-9: diff refusals ─────────────────────────────────────────────────────────────────
test('PL-9: diff outside land-scope -> refuse', () => {
  const fx = buildFixture({ taskShort: 'o' });
  try {
    W(path.join(fx.slotA, 'outside.txt'), 'x\n');
    G(['add', 'outside.txt'], fx.slotA);
    G(['commit', '-m', 'outside'], fx.slotA);
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /L8|outside land-scope/);
  } finally { fx.cleanup(); }
});
test('PL-9: review.md missing from the diff -> refuse', () => {
  const fx = buildFixture({ taskShort: 'p', landEvidenceLine: null });
  try {
    // Remove review.md from the slot's commit entirely (never added).
    rmrf(path.join(fx.slotA, 'work', fx.taskShort, 'review.md'));
    G(['add', '-A', 'work'], fx.slotA);
    G(['commit', '--amend', '-m', 'impl no review'], fx.slotA);
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /L8|does not contain/);
  } finally { fx.cleanup(); }
});
for (const [label, relPath] of [
  ['AGENTS.md', 'AGENTS.md'],
  ['.claude/hooks/x', '.claude/hooks/x'],
  ['package.json', 'package.json'],
  ['work/x/brief.md', 'work/other-task/brief.md']
]) {
  test('PL-9: diff touching a protected path (' + label + ') -> refuse', () => {
    const fx = buildFixture({ taskShort: 'q', scopeRelPaths: ['work/q/foo.txt', relPath] });
    try {
      W(path.join(fx.slotA, relPath), 'x\n');
      G(['add', relPath], fx.slotA);
      G(['commit', '-m', 'touch protected'], fx.slotA);
      const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
      assert.strictEqual(r.ok, false);
      assert.match(r.reason, /protected path|L8/);
    } finally { fx.cleanup(); }
  });
}

// ── PL-10: LAND-EVIDENCE refusals ───────────────────────────────────────────────────────
test('PL-10: LAND-EVIDENCE missing -> refuse', () => {
  const fx = buildFixture({ taskShort: 'r', landEvidenceLine: null });
  try {
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /L9/);
  } finally { fx.cleanup(); }
});
test('PL-10: codex-classI-unresolved=1 -> refuse', () => {
  const fx = buildFixture({ taskShort: 's', landEvidenceLine: 'LAND-EVIDENCE: qa-offline=PASS 52; targeted=PASS; codex-classI-unresolved=1' });
  try {
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /L9/);
  } finally { fx.cleanup(); }
});
test('PL-10: qa-offline=FAIL -> refuse', () => {
  const fx = buildFixture({ taskShort: 't', landEvidenceLine: 'LAND-EVIDENCE: qa-offline=FAIL 52; targeted=PASS; codex-classI-unresolved=0' });
  try {
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /L9/);
  } finally { fx.cleanup(); }
});
test('PL-10: duplicated LAND-EVIDENCE line -> refuse', () => {
  const fx = buildFixture({ taskShort: 'u', duplicateLandEvidence: true });
  try {
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /L9|duplicated/);
  } finally { fx.cleanup(); }
});

// ── PL-11: integrity FAIL refusals ──────────────────────────────────────────────────────
test('PL-11: a planted non-sample hook -> refuse, no merge, hook proven not executed', () => {
  const fx = buildFixture({ taskShort: 'v' });
  try {
    const marker = path.join(fx.tmp, 'planted-hook-ran.txt');
    const hooksDir = path.join(fx.canon, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    const script = process.platform === 'win32'
      ? '@echo off\r\n(echo ran) > "' + marker.replace(/\\/g, '/') + '"\r\nexit /b 0\r\n'
      : '#!/bin/sh\necho ran > "' + marker + '"\n';
    fs.writeFileSync(path.join(hooksDir, 'pre-commit'), script);
    if (process.platform !== 'win32') fs.chmodSync(path.join(hooksDir, 'pre-commit'), 0o755);
    const before = G(['rev-parse', 'branch-dev'], fx.canon).trim();
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /L10|integrity/);
    assert.strictEqual(G(['rev-parse', 'branch-dev'], fx.canon).trim(), before);
    assert.ok(!fs.existsSync(marker), 'the planted hook must not have run');
  } finally { fx.cleanup(); }
});
test('PL-11: core.hooksPath configured -> refuse', () => {
  const fx = buildFixture({ taskShort: 'w' });
  try {
    G(['config', 'core.hooksPath', '/tmp/somewhere'], fx.canon);
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /L10|integrity/);
  } finally { fx.cleanup(); }
});

// ── PL-12: race guard ────────────────────────────────────────────────────────────────────
test('PL-12: race - branch-dev advances between preflight and the merge -> refuse at L13', () => {
  const fx = buildFixture({ taskShort: 'y' });
  try {
    fx.writeLandRecord('LAND ' + fx.task + ' ' + fx.tip + ' ' + fx.base + '\n');
    const realGit = spawnSync;
    // Inject a gitExec that advances branch-dev the first time resolveL3 is called a second time
    // (simulated by racing branch-dev forward right before invoking land, then restoring the
    // approval record to the ORIGINAL base so L12 still passes but L13's re-check catches the move).
    W(path.join(fx.canon, 'race.txt'), 'x\n');
    G(['add', 'race.txt'], fx.canon);
    G(['commit', '-m', 'race advance'], fx.canon);
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /L13|L3|Second LAND/);
  } finally { fx.cleanup(); }
});

// ── PL-13: existing lock ────────────────────────────────────────────────────────────────
test('PL-13: existing lock file -> refuse; lock not removed by the tool', () => {
  const fx = buildFixture({ taskShort: 'z' });
  try {
    fx.writeLandRecord('LAND ' + fx.task + ' ' + fx.tip + ' ' + fx.base + '\n');
    const lockPath = path.join(fx.commonDir, 'pt-land.lock');
    fs.writeFileSync(lockPath, '');
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /L13|lock/);
    assert.ok(fs.existsSync(lockPath), 'the pre-existing lock must not be removed by the tool');
  } finally { fx.cleanup(); }
});

// ── PL-14: self-integrity ───────────────────────────────────────────────────────────────
test('PL-14: running pt-land.js differs from the branch-dev blob -> refuse', () => {
  const fx = buildFixture({ taskShort: 'aa' });
  try {
    fs.appendFileSync(path.join(fx.canon, '.claude', 'hooks', 'pt-land.js'), '\n// tampered\n');
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /L2|self-integrity/);
  } finally { fx.cleanup(); }
});

// ── PL-15 / PL-16 / PL-17: push ──────────────────────────────────────────────────────────
(function plPush() {
  const fx = buildFixture({ taskShort: 'ab' });
  try {
    fx.writeLandRecord('LAND ' + fx.task + ' ' + fx.tip + ' ' + fx.base + '\n');
    const TOOL = fx.requireTool();
    const landRes = TOOL.runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(landRes.ok, true, 'setup: land must succeed before push cases -- ' + JSON.stringify(landRes));

    let pr;
    test('PL-15: valid push-request -> exit 0, lists R..L, DEV-deploy notice + PUSH line, origin unchanged', () => {
      const originBefore = G(['rev-parse', 'main'], fx.bareDir);
      pr = TOOL.runPushRequest({ cwd: fx.canon, expectedOriginUrls: [fx.originUrl, fx.originUrl.replace(/\\/g, '/')] });
      assert.strictEqual(pr.ok, true, JSON.stringify(pr));
      assert.ok(/impl/.test(pr.commits));
      assert.match(pr.notice, /Netlify DEV deploy/);
      assert.match(pr.notice, /never touches main or production/);
      assert.match(pr.approvalLine, /^! printf '%s\\n' 'PUSH branch-dev [0-9a-f]{40} [0-9a-f]{40}' > '/);
      assert.strictEqual(G(['rev-parse', 'main'], fx.bareDir), originBefore);
    });

    test('PL-16: valid push -> bare origin branch-dev==L, tracking==L, record deleted, audit line', () => {
      fx.writePushRecord('PUSH branch-dev ' + pr.L + ' ' + pr.R + '\n');
      const r = TOOL.runPush({ cwd: fx.canon, expectedOriginUrls: [fx.originUrl, fx.originUrl.replace(/\\/g, '/')] });
      assert.strictEqual(r.ok, true, JSON.stringify(r));
      assert.strictEqual(G(['rev-parse', 'branch-dev'], fx.bareDir).trim(), pr.L);
      assert.strictEqual(G(['rev-parse', '--verify', 'refs/remotes/origin/branch-dev'], fx.canon).trim(), pr.L);
      assert.ok(!fs.existsSync(path.join(fx.commonDir, 'pt-push-approval')));
      const audit = fs.readFileSync(path.join(fx.commonDir, 'pt-land-log'), 'utf8').trim().split('\n');
      const last = JSON.parse(audit[audit.length - 1]);
      assert.strictEqual(last.verb, 'push');
      assert.strictEqual(last.result, 'ok');
    });

    for (const [label, mutate] of [
      ['no record', () => {}],
      ['stale record', () => fx.writePushRecord('PUSH branch-dev ' + '0'.repeat(40) + ' ' + '1'.repeat(40) + '\n')],
      ['LAND-type record', () => fx.writePushRecord('LAND ' + fx.task + ' ' + pr.L + ' ' + pr.R + '\n')]
    ]) {
      test('PL-17: push with ' + label + ' -> refuse; origin unchanged', () => {
        mutate();
        const before = G(['rev-parse', 'branch-dev'], fx.bareDir).trim();
        const r = TOOL.runPush({ cwd: fx.canon, expectedOriginUrls: [fx.originUrl, fx.originUrl.replace(/\\/g, '/')] });
        assert.strictEqual(r.ok, false, label);
        assert.strictEqual(G(['rev-parse', 'branch-dev'], fx.bareDir).trim(), before, label);
      });
    }
  } finally { fx.cleanup(); }
})();

// ── PL-18: remote / config refusals ─────────────────────────────────────────────────────
test('PL-18: remote moved (bare origin advanced independently) -> refuse; origin unchanged', () => {
  const fx = buildFixture({ taskShort: 'ac' });
  try {
    fx.writeLandRecord('LAND ' + fx.task + ' ' + fx.tip + ' ' + fx.base + '\n');
    const TOOL = fx.requireTool();
    assert.strictEqual(TOOL.runLand({ cwd: fx.slotA, task: fx.task }).ok, true);
    // Capture the PUSH approval line (L/R) BEFORE the remote races ahead independently.
    const pr = TOOL.runPushRequest({ cwd: fx.canon, expectedOriginUrls: [fx.originUrl] });
    assert.strictEqual(pr.ok, true, JSON.stringify(pr));
    fx.writePushRecord('PUSH branch-dev ' + pr.L + ' ' + pr.R + '\n');
    // Now advance the bare origin's branch-dev independently of the canonical clone's knowledge.
    const otherClone = path.join(fx.tmp, 'other-clone');
    G(['clone', fx.bareDir, otherClone], fx.tmp);
    G(['config', 'user.email', 'x@x'], otherClone);
    G(['config', 'user.name', 'x'], otherClone);
    G(['checkout', 'branch-dev'], otherClone);
    W(path.join(otherClone, 'other-push.txt'), 'x\n');
    G(['add', 'other-push.txt'], otherClone);
    G(['commit', '-m', 'race push'], otherClone);
    G(['push', 'origin', 'branch-dev'], otherClone);
    const beforeBare = G(['rev-parse', 'branch-dev'], fx.bareDir).trim();
    const r = TOOL.runPush({ cwd: fx.canon, expectedOriginUrls: [fx.originUrl] });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /remote moved/);
    assert.strictEqual(G(['rev-parse', 'branch-dev'], fx.bareDir).trim(), beforeBare);
  } finally { fx.cleanup(); }
});
test('PL-18: local not ahead of tracking -> refuse (nothing to push)', () => {
  const fx = buildFixture({ taskShort: 'ad', withSlotA: false });
  try {
    const r = fx.requireTool().runPushRequest({ cwd: fx.canon, expectedOriginUrls: [fx.originUrl] });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /nothing to push/);
  } finally { fx.cleanup(); }
});
test('PL-18: remote.origin.pushurl set -> refuse', () => {
  const fx = buildFixture({ taskShort: 'ae' });
  try {
    fx.writeLandRecord('LAND ' + fx.task + ' ' + fx.tip + ' ' + fx.base + '\n');
    const TOOL = fx.requireTool();
    assert.strictEqual(TOOL.runLand({ cwd: fx.slotA, task: fx.task }).ok, true);
    G(['config', 'remote.origin.pushurl', 'https://example.invalid/other.git'], fx.canon);
    const r = TOOL.runPushRequest({ cwd: fx.canon, expectedOriginUrls: [fx.originUrl] });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /pushurl/);
  } finally { fx.cleanup(); }
});
test('PL-18: url.*.insteadOf set -> refuse', () => {
  const fx = buildFixture({ taskShort: 'af' });
  try {
    fx.writeLandRecord('LAND ' + fx.task + ' ' + fx.tip + ' ' + fx.base + '\n');
    const TOOL = fx.requireTool();
    assert.strictEqual(TOOL.runLand({ cwd: fx.slotA, task: fx.task }).ok, true);
    G(['config', 'url.https://example.invalid/.insteadOf', 'https://real.invalid/'], fx.canon);
    const r = TOOL.runPushRequest({ cwd: fx.canon, expectedOriginUrls: [fx.originUrl] });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /insteadOf/i);
  } finally { fx.cleanup(); }
});
test('PL-18: origin URL not in the expected list -> refuse', () => {
  const fx = buildFixture({ taskShort: 'ag' });
  try {
    fx.writeLandRecord('LAND ' + fx.task + ' ' + fx.tip + ' ' + fx.base + '\n');
    const TOOL = fx.requireTool();
    assert.strictEqual(TOOL.runLand({ cwd: fx.slotA, task: fx.task }).ok, true);
    const r = TOOL.runPushRequest({ cwd: fx.canon, expectedOriginUrls: ['https://not-the-repo.invalid/x.git'] });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /not in the expected list/);
  } finally { fx.cleanup(); }
});

// ── PL-19: main and tags untouched ──────────────────────────────────────────────────────
test('PL-19: origin main and tags unchanged after a LAND+PUSH; no refs/tags/* pushed', () => {
  const fx = buildFixture({ taskShort: 'ah' });
  try {
    const mainBefore = G(['rev-parse', 'main'], fx.bareDir).trim();
    const tagsBefore = G(['tag'], fx.bareDir).trim();
    fx.writeLandRecord('LAND ' + fx.task + ' ' + fx.tip + ' ' + fx.base + '\n');
    const TOOL = fx.requireTool();
    assert.strictEqual(TOOL.runLand({ cwd: fx.slotA, task: fx.task }).ok, true);
    const pr = TOOL.runPushRequest({ cwd: fx.canon, expectedOriginUrls: [fx.originUrl] });
    fx.writePushRecord('PUSH branch-dev ' + pr.L + ' ' + pr.R + '\n');
    assert.strictEqual(TOOL.runPush({ cwd: fx.canon, expectedOriginUrls: [fx.originUrl] }).ok, true);
    assert.strictEqual(G(['rev-parse', 'main'], fx.bareDir).trim(), mainBefore);
    assert.strictEqual(G(['tag'], fx.bareDir).trim(), tagsBefore);
  } finally { fx.cleanup(); }
});

// ── Codex-review regression coverage (Class I fixes) ────────────────────────────────────
// A gitExec that fails only `log` and delegates every other subcommand to real git, built with
// NODE_OPTIONS=--require against process.execPath (a real, directly-executable native binary on
// every platform - no .cmd/.sh split needed, and no EINVAL from spawning a script file directly
// as argv[0] under { shell: false }, which pt-land.js's own git runner always uses).
function makeFlakyGitViaNodeOptions(dir) {
  const intercept = path.join(dir, 'flaky-git-intercept.js');
  fs.writeFileSync(intercept,
    "'use strict';\n" +
    "const path = require('path');\n" +
    "const { spawnSync } = require('child_process');\n" +
    // Node resolves the leading positional arg to an absolute path before a --require module
    // runs (it treats it as the would-be main-module path), so recover the subcommand by basename.
    "const rawArgs = process.argv.slice(1);\n" +
    "const sub = path.basename(rawArgs[0] || '');\n" +
    "const rest = rawArgs.slice(1);\n" +
    "if (sub === 'log') { process.exit(7); }\n" +
    "const r = spawnSync('git', [sub].concat(rest), { stdio: 'inherit', windowsHide: true });\n" +
    "process.exit(r.status === null ? 1 : r.status);\n");
  return { gitExec: process.execPath, nodeOptions: '--require ' + intercept };
}
test('CDX-1: push-request refuses (fail closed) if git log R..L cannot be read', () => {
  const fx = buildFixture({ taskShort: 'cx1' });
  try {
    fx.writeLandRecord('LAND ' + fx.task + ' ' + fx.tip + ' ' + fx.base + '\n');
    const TOOL = fx.requireTool();
    assert.strictEqual(TOOL.runLand({ cwd: fx.slotA, task: fx.task }).ok, true);
    // Control: real git (default gitExec, no shim, no env override) - proves the fixture/task
    // state itself is a normal, otherwise-successful push-request before the shim is introduced.
    const control = TOOL.runPushRequest({ cwd: fx.canon, expectedOriginUrls: [fx.originUrl] });
    assert.strictEqual(control.ok, true, 'control run (real git) -- ' + JSON.stringify(control));
    // The shim fails only `log`; every other call (rev-parse, merge-base, ls-remote, config, the
    // integrity module's own reads) delegates to real git untouched, so a failure here is
    // specifically attributable to the P8 "list the commits to publish" read.
    const shim = makeFlakyGitViaNodeOptions(fx.tmp);
    const savedNodeOptions = process.env.NODE_OPTIONS;
    process.env.NODE_OPTIONS = shim.nodeOptions;
    let r;
    try {
      r = TOOL.runPushRequest({ cwd: fx.canon, expectedOriginUrls: [fx.originUrl], gitExec: shim.gitExec });
    } finally {
      if (savedNodeOptions === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = savedNodeOptions;
    }
    assert.strictEqual(r.ok, false, JSON.stringify(r));
    assert.match(r.reason, /P8/);
    assert.match(r.reason, /git log/);
  } finally { fx.cleanup(); }
});
test('CDX-2: protected-path check is case-insensitive (a differently-cased alias is still caught)', () => {
  // PACKAGE.JSON (uppercase) has no pre-existing entry anywhere in the fixture (buildFixture
  // never creates a package.json), so this is a clean new path - not one that git/the filesystem
  // would case-fold against something already checked out, which would confound the probe.
  const fx = buildFixture({ taskShort: 'cx2', scopeRelPaths: ['work/cx2/foo.txt', 'PACKAGE.JSON'] });
  try {
    W(path.join(fx.slotA, 'PACKAGE.JSON'), '{}\n');
    G(['add', 'PACKAGE.JSON'], fx.slotA);
    G(['commit', '-m', 'case-alias protected path'], fx.slotA);
    const liveTip = G(['rev-parse', 'HEAD'], fx.slotA).trim();
    const diffFiles = G(['diff', '--name-only', fx.base, liveTip], fx.slotA).split('\n').map((s) => s.trim()).filter(Boolean);
    assert.ok(diffFiles.indexOf('PACKAGE.JSON') !== -1, 'the diff must record the literal uppercase path, not a case-folded one -- got ' + JSON.stringify(diffFiles));
    const r = fx.requireTool().runLandRequest({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /protected path/);
  } finally { fx.cleanup(); }
});
test('CDX-3: an audit-write failure after a verified LAND surfaces as a warning, not a false failure', () => {
  const fx = buildFixture({ taskShort: 'cx3' });
  try {
    fx.writeLandRecord('LAND ' + fx.task + ' ' + fx.tip + ' ' + fx.base + '\n');
    // Make the audit file path itself a directory, so fs.appendFileSync(..., 'pt-land-log') throws.
    fs.mkdirSync(path.join(fx.commonDir, 'pt-land-log'));
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    // The merge already happened and was independently verified (L15) before the audit append
    // ran - reporting ok:false here would misleadingly suggest the LAND itself failed.
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.match(r.auditWarning || '', /audit log append failed/);
    assert.strictEqual(G(['rev-parse', 'branch-dev'], fx.canon).trim(), fx.tip, 'the merge must still have happened');
  } finally { fx.cleanup(); }
});
test('CDX-4: an audit-write failure on a REFUSAL preserves the original refusal reason (not masked)', () => {
  const fx = buildFixture({ taskShort: 'cx4', noLandScope: true });
  try {
    // Make the audit dir itself unwritable-as-a-file target: pt-land-log is a directory.
    fs.mkdirSync(path.join(fx.commonDir, 'pt-land-log'));
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /legacy brief: Owner LAND/);
    assert.doesNotMatch(r.reason, /INTERNAL/);
  } finally { fx.cleanup(); }
});
test('CDX-5: the CLI prints an auditWarning to stderr on an otherwise-successful land', () => {
  const fx = buildFixture({ taskShort: 'cx5' });
  try {
    fx.writeLandRecord('LAND ' + fx.task + ' ' + fx.tip + ' ' + fx.base + '\n');
    fs.mkdirSync(path.join(fx.commonDir, 'pt-land-log'));
    const toolPath = path.join(fx.canon, '.claude', 'hooks', 'pt-land.js');
    const r = spawnSync('node', [toolPath, 'land', fx.task], { cwd: fx.slotA, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, JSON.stringify(r));
    assert.match(r.stderr, /WARNING - audit log append failed/);
    assert.strictEqual(G(['rev-parse', 'branch-dev'], fx.canon).trim(), fx.tip);
  } finally { fx.cleanup(); }
});

// ── PL-20: CLI exit codes ───────────────────────────────────────────────────────────────
(function plCli() {
  const fx = buildFixture({ taskShort: 'ai' });
  try {
    fx.writeLandRecord('LAND ' + fx.task + ' ' + fx.tip + ' ' + fx.base + '\n');
    const toolPath = path.join(fx.canon, '.claude', 'hooks', 'pt-land.js');
    function run(args, cwd) { return spawnSync('node', [toolPath].concat(args), { cwd, encoding: 'utf8' }); }

    test('PL-20: CLI usage error -> exit 3', () => {
      const r = run(['land'], fx.slotA); // missing task arg
      assert.strictEqual(r.status, 3);
    });
    test('PL-20: CLI unknown verb -> exit 3', () => {
      const r = run(['bogus'], fx.slotA);
      assert.strictEqual(r.status, 3);
    });
    test('PL-20: CLI refusal -> exit 1', () => {
      const r = run(['land-request', 'task/does-not-exist'], fx.slotA);
      assert.strictEqual(r.status, 1);
    });
    test('PL-20: CLI success -> exit 0', () => {
      const r = run(['land-request', fx.task], fx.slotA);
      assert.strictEqual(r.status, 0, r.stderr);
    });
  } finally { fx.cleanup(); }
})();

// ── PL-21: parseRecord / parseLandScope unit rows ───────────────────────────────────────
(function plUnitRows() {
  // eslint-disable-next-line global-require
  const TOOL = require(REAL_TOOL_PATH);
  const T = 'a'.repeat(40);
  const B = 'b'.repeat(40);

  test('PL-21: parseRecord LAND valid', () => {
    const r = TOOL.parseRecord('LAND task/x ' + T + ' ' + B, 'LAND');
    assert.deepStrictEqual(r, { kind: 'LAND', task: 'task/x', tip: T, base: B });
  });
  test('PL-21: parseRecord PUSH valid', () => {
    const r = TOOL.parseRecord('PUSH branch-dev ' + T + ' ' + B, 'PUSH');
    assert.deepStrictEqual(r, { kind: 'PUSH', branch: 'branch-dev', L: T, R: B });
  });
  test('PL-21: parseRecord extra fields -> null', () => {
    assert.strictEqual(TOOL.parseRecord('LAND task/x ' + T + ' ' + B + ' extra', 'LAND'), null);
  });
  test('PL-21: parseRecord uppercase hex -> null', () => {
    assert.strictEqual(TOOL.parseRecord('LAND task/x ' + T.toUpperCase() + ' ' + B, 'LAND'), null);
  });
  test('PL-21: parseRecord lowercase hex -> accepted', () => {
    assert.notStrictEqual(TOOL.parseRecord('LAND task/x ' + T + ' ' + B, 'LAND'), null);
  });
  test('PL-21: parseRecord >256 bytes -> null', () => {
    assert.strictEqual(TOOL.parseRecord('LAND task/x ' + T + ' ' + B + ' '.repeat(300), 'LAND'), null);
  });
  test('PL-21: parseRecord CRLF trailing -> accepted (stripped)', () => {
    assert.notStrictEqual(TOOL.parseRecord('LAND task/x ' + T + ' ' + B + '\r\n', 'LAND'), null);
  });
  test('PL-21: parseRecord BOM -> null', () => {
    assert.strictEqual(TOOL.parseRecord('﻿LAND task/x ' + T + ' ' + B, 'LAND'), null);
  });
  test('PL-21: parseRecord wrong verb for kind -> null', () => {
    assert.strictEqual(TOOL.parseRecord('PUSH branch-dev ' + T + ' ' + B, 'LAND'), null);
  });
  test('PL-21: parseLandScope two blocks -> null', () => {
    const text = '<!-- land-scope:begin -->\n- a\n<!-- land-scope:end -->\n<!-- land-scope:begin -->\n- b\n<!-- land-scope:end -->\n';
    assert.strictEqual(TOOL.parseLandScope(text), null);
  });
  test('PL-21: parseLandScope no block -> null', () => {
    assert.strictEqual(TOOL.parseLandScope('# brief\nno scope here\n'), null);
  });
  test('PL-21: parseLandScope valid, bullet-stripped paths', () => {
    const text = '<!-- land-scope:begin -->\n- a/b.js\n- `c/d.js`\n<!-- land-scope:end -->\n';
    assert.deepStrictEqual(TOOL.parseLandScope(text), { paths: ['a/b.js', 'c/d.js'] });
  });
})();

// ── AH-20 (hook R12) - see qa/auto_mode_hardening_offline.js for the pretooluse-guard.js rows ──
// (kept in that suite per repo convention: hook-decision rows live with the hook's other AH-* rows.)

// ── mutants (pt-land.js): each committed into a fresh fixture so L2 self-integrity does not
//    trivially kill it, then a specific should-refuse case must now succeed, or the refusal
//    reason must change. ──────────────────────────────────────────────────────────────────
function withMutantSource(mutateFn) {
  const src = fs.readFileSync(REAL_TOOL_PATH, 'utf8');
  const mutated = mutateFn(src);
  assert.notStrictEqual(mutated, src, 'mutant must actually change the source');
  const tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ptland-mut-')), 'pt-land.js');
  fs.writeFileSync(tmpFile, mutated);
  return tmpFile;
}

test('MUT: L12 record check skipped -> land proceeds without any approval record (caught)', () => {
  const mutSrc = withMutantSource((s) => s.replace(
    "  const record = parseRecord(readRecordFile(commonDir, LAND_RECORD_NAME), 'LAND');\r\n  if (!record || record.task !== task || record.tip !== l3.tip || record.base !== l3.base) {\r\n    return refuse('L12', 'no/stale LAND approval', l3.base, l3.tip);\r\n  }\r\n",
    ''
  ));
  const fx = buildFixture({ taskShort: 'mu1', toolSource: mutSrc });
  try {
    // No approval record written at all.
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, true, 'mutant should have let land proceed without a record');
  } finally { fx.cleanup(); }
});

test('MUT: L3 ancestor check skipped -> Second LAND is not caught (caught)', () => {
  const mutSrc = withMutantSource((s) => s.replace(
    "  const anc = G(['merge-base', '--is-ancestor', base, tip], canonicalRoot, { read: true });\r\n  if (anc.status !== 0) return { ok: false, reason: 'branch-dev moved: Second LAND (Owner rebase, R3m)' };\r\n",
    ''
  ));
  const fx = buildFixture({ taskShort: 'mu2', toolSource: mutSrc });
  try {
    W(path.join(fx.canon, 'advance.txt'), 'x\n');
    G(['add', 'advance.txt'], fx.canon);
    G(['commit', '-m', 'advance'], fx.canon);
    fx.writeLandRecord('LAND ' + fx.task + ' ' + fx.tip + ' ' + fx.base + '\n');
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    // With the ancestor check removed, rev-list --count base..tip on a non-ancestor base is still
    // meaningful in git, but the "Second LAND" reason must be gone -- if merge --ff-only still
    // fails structurally, the mutant is at least caught by a DIFFERENT (non-Second-LAND) reason.
    assert.ok(r.ok === true || !/Second LAND/.test(r.reason || ''), 'mutant caught: Second LAND reason must disappear or land must succeed wrongly');
  } finally { fx.cleanup(); }
});

test('MUT: scope check dropped (diff allowed unconditionally) -> outside-scope diff is not caught (caught)', () => {
  const mutSrc = withMutantSource((s) => s.replace(
    '  const outside = files.filter((f) => !allowed.has(f));\r\n  if (outside.length) return { ok: false, reason: \'diff outside land-scope: \' + outside.join(\', \') };\r\n',
    '  const outside = [];\r\n'
  ));
  const fx = buildFixture({ taskShort: 'mu3', toolSource: mutSrc });
  try {
    W(path.join(fx.slotA, 'outside.txt'), 'x\n');
    G(['add', 'outside.txt'], fx.slotA);
    G(['commit', '-m', 'outside'], fx.slotA);
    const r = fx.requireTool().runLandRequest({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, true, 'mutant should have let an out-of-scope diff pass L8');
  } finally { fx.cleanup(); }
});

test('MUT: protected-path list emptied -> a protected-path diff is not caught (caught)', () => {
  const mutSrc = withMutantSource((s) => s.replace(
    /const PROTECTED_PATH_RES = \[[\s\S]*?\n\];/,
    'const PROTECTED_PATH_RES = [];'
  ));
  const fx = buildFixture({ taskShort: 'mu4', scopeRelPaths: ['work/mu4/foo.txt', 'AGENTS.md'], toolSource: mutSrc });
  try {
    W(path.join(fx.slotA, 'AGENTS.md'), 'tampered\n');
    G(['add', 'AGENTS.md'], fx.slotA);
    G(['commit', '-m', 'touch agents'], fx.slotA);
    const r = fx.requireTool().runLandRequest({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, true, 'mutant should have let a protected-path diff pass L8');
  } finally { fx.cleanup(); }
});

test('MUT: LAND-EVIDENCE regex loosened -> a malformed evidence line is not caught (caught)', () => {
  const mutSrc = withMutantSource((s) => s.replace(
    "const LAND_EVIDENCE_RE = /^LAND-EVIDENCE: qa-offline=PASS \\d+; targeted=PASS; codex-classI-unresolved=0$/;",
    "const LAND_EVIDENCE_RE = /^LAND-EVIDENCE:/;"
  ));
  const fx = buildFixture({
    taskShort: 'mu5',
    toolSource: mutSrc,
    landEvidenceLine: 'LAND-EVIDENCE: qa-offline=FAIL 1; targeted=FAIL; codex-classI-unresolved=3'
  });
  try {
    const r = fx.requireTool().runLandRequest({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, true, 'mutant should have let a malformed LAND-EVIDENCE line pass L9');
  } finally { fx.cleanup(); }
});

// ── summary ──────────────────────────────────────────────────────────────────────────────
if (failed > 0) {
  for (const f of failures) process.stdout.write('  FAIL  ' + f + '\n');
  process.stdout.write('\nOFFLINE VALIDATION (pt-land): FAIL (' + failed + '/' + (passed + failed) + ')\n');
  process.exit(1);
} else {
  process.stdout.write('  PASS  ' + passed + ' pt-land assertion(s) passed\n');
  process.exit(0);
}
