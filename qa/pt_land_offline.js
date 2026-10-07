'use strict';
// Slice 0 (work/qa-isolation-meter): private temp root per run, then counting/timing only.
require('./lib/run-tmp').isolate('ptqa-land-');
const meter = require('./lib/spawn-meter').install();

/*
 * qa/pt_land_offline.js
 *
 * R12 (work/worker-land-push/brief.md §7) — real git in temp dirs under os.tmpdir(), no network.
 * Exercises .claude/hooks/pt-land.js (the L1-L16 LAND checks and P1-P13 PUSH checks) against a
 * fixture matching qa/guard_integrity_check.js's worktree-name expectations: a bare origin.git, a
 * canonical clone at <tmp>/portfolio-tracker (main + branch-dev, with a committed copy of the real
 * pt-land.js and qa/guard_integrity_check.js and a brief with a land-scope block), and linked
 * worktrees <tmp>/pt-wt-worker-a (on task/x) and <tmp>/pt-wt-worker-b.
 * PL-32..55 (work/owner-one-action-gates/brief.md §6): G1 brief-request, G2 protected-request /
 * protected-commit (manifest under <os.tmpdir()>/pt-<id>/protected/), G3 land L8 revision, shape rule.
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
  meter.beginRow(name); try {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failed += 1;
    failures.push(name + ' -- ' + (e && e.message ? e.message : String(e)));
  }
  } finally { meter.endRow(); }
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
  // PL-32..55: paths listed in land-scope that the fixture never writes, and an optional protected-scope block.
  const landScopeOnlyPaths = opts.landScopeOnlyPaths || [];
  const protectedScopeRelPaths = opts.protectedScopeRelPaths || null;
  const twoLandScopeBlocks = opts.twoLandScopeBlocks === true;
  const originUrl = opts.originUrl; // if set, used instead of the bare dir path (P4 fixtures)
  // Slice 1 (work/qa-template-fixtures), internal options used only by the template builders: __root builds the fixture inside a
  // given directory (a template); __adopt wraps an already-materialised copy of the landed template (no Git process).
  const crypto = require('crypto');
  const adopt = opts.__adopt || null;

  const tmp = adopt ? adopt.tmp : (opts.__root || fs.mkdtempSync(path.join(os.tmpdir(), 'ptland-qa-')));
  const bareDir = path.join(tmp, 'origin.git');
  const canon = path.join(tmp, 'portfolio-tracker');
  const slotA = path.join(tmp, 'pt-wt-worker-a');
  const slotB = path.join(tmp, 'pt-wt-worker-b');

  if (adopt) return finish(adopt.meta.base, adopt.meta.tip, adopt.meta.mainOid, slotA, slotB);

  // Slice 1: the base below (bare origin .. tool commit [.. .gitignore]) is built ONCE per run for the real tool without a custom
  // origin and copied per fixture; a mutant tool source or a custom origin builds it fresh, step for step as before.
  const sameContent = (a, b) => a === b ||
    crypto.createHash('sha256').update(fs.readFileSync(a)).digest('hex') === crypto.createHash('sha256').update(fs.readFileSync(b)).digest('hex');
  const buildBase = (root) => {
    const bareDir = path.join(root, 'origin.git');
    const canon = path.join(root, 'portfolio-tracker');

    fs.mkdirSync(bareDir, { recursive: true });
    G(['init', '--bare', '-b', 'main', bareDir], root);

    fs.mkdirSync(canon, { recursive: true });
    G(['init', '-b', 'main', canon], root);
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

    // PL-22..31 (cleanup): an optional .gitignore, committed before the slot worktree is created
    // so ignored-evidence files (plan.md/codex.md/qa.log) are cleanly ignored, not merely untracked.
    if (opts.gitignore) {
      W(path.join(canon, '.gitignore'), opts.gitignore);
      G(['add', '.gitignore'], canon);
      G(['commit', '-m', 'add gitignore'], canon);
      if (!originUrl) G(['push', 'origin', 'branch-dev'], canon);
    }
  };
  const useTemplate = originUrl === undefined && sameContent(toolSource, REAL_TOOL_PATH);
  if (useTemplate) {
    const FT = require('./lib/fixture-template');
    const realHash = crypto.createHash('sha256').update(fs.readFileSync(REAL_TOOL_PATH)).digest('hex');
    const t = FT.template('pt_land base:' + realHash + ':' + (opts.gitignore || ''), (dir) => { buildBase(dir); });
    FT.materialize(t.dir, tmp, ['portfolio-tracker/.git/config']);
  } else {
    buildBase(tmp);
  }

  let briefBody = '# brief\n\n';
  if (!noLandScope) {
    briefBody += '<!-- land-scope:begin -->\n' + scopeRelPaths.concat(landScopeOnlyPaths).map((p) => '- ' + p).join('\n') + '\n<!-- land-scope:end -->\n';
    if (twoLandScopeBlocks) {
      briefBody += '<!-- land-scope:begin -->\n- ' + scopeRelPaths[0] + '\n<!-- land-scope:end -->\n';
    }
  }
  if (protectedScopeRelPaths) {
    briefBody += '<!-- protected-scope:begin -->\n' + protectedScopeRelPaths.map((p) => '- ' + p).join('\n') + '\n<!-- protected-scope:end -->\n';
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

  return finish(base, tip, G(['rev-parse', 'main'], canon).trim(), slotAPath, slotBPath);

  // The returned fixture object; also used (through __adopt) for an already-materialised copy of the landed template.
  function finish(baseOid, tipOid, mainOid, slotAOut, slotBOut) {
    const commonDir = path.join(canon, '.git');

    function requireTool() {
      delete require.cache[require.resolve(path.join(canon, '.claude', 'hooks', 'pt-land.js'))];
      return require(path.join(canon, '.claude', 'hooks', 'pt-land.js'));
    }
    function writeLandRecord(text) { fs.writeFileSync(path.join(commonDir, 'pt-land-approval'), text); }
    function writePushRecord(text) { fs.writeFileSync(path.join(commonDir, 'pt-push-approval'), text); }
    function cleanup() { rmrf(tmp); }

    return {
      tmp, bareDir, canon, slotA: slotAOut, slotB: slotBOut, task, taskShort, base: baseOid, tip: tipOid, mainOid,
      commonDir, requireTool, writeLandRecord, writePushRecord, cleanup, originUrl: originUrl || bareDir
    };
  }
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
    ['no record', (fx) => {}]
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
  // "Slot HEAD != tip" cannot arise through ordinary git commands for the CALLING slot: L1
  // already binds tip to that same slot's live HEAD ref, so they are read from the identical
  // ref and can never disagree except via the TOCTOU window L13 independently guards. The
  // reachable, distinct L5 case is a caller OTHER than the task's own slot (the Bootstrap/
  // canonical exception) finding that slot dirty - L5 must still catch it from that caller.
})();

// ── PL-8: brief refusals ────────────────────────────────────────────────────────────────
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

// ── PL-10: LAND-EVIDENCE refusals ───────────────────────────────────────────────────────
test('PL-10: LAND-EVIDENCE missing -> refuse', () => {
  const fx = buildFixture({ taskShort: 'r', landEvidenceLine: null });
  try {
    const r = fx.requireTool().runLand({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /L9/);
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
      ['no record', () => {}]
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






// ── PL-22..31: cleanup (work/worker-continuous-flow/brief.md §5/§8 K1-K9, AL-4) ──────────
(function plCleanup() {
  const crypto = require('crypto');
  const GITIGNORE_TEXT = 'work/*/plan.md\nwork/*/codex.md\nwork/*/qa.log\n';
  const EVIDENCE_NAMES = ['plan.md', 'codex.md', 'qa.log'];

  function Graw(args, cwd) { return spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }); }

  // Builds a cleanup fixture: buildFixture + a committed .gitignore, then (by default) lands and
  // pushes the task for real via runLand/runPush, so "landed and pushed" is proven by the same
  // tool under test, not merely asserted. opts.land=false / opts.push=false skip those steps.
  function buildCleanupFixture(opts) {
    opts = opts || {};
    if (opts.landed === true) {
      // Slice 1 (work/qa-template-fixtures): the landed-and-pushed state is built ONCE per run, through the fresh path below with
      // the fixed task id, and every call gets its own isolated copy of it. Only for the real tool, no custom origin, land and push
      // not disabled; any other combination throws (fail closed).
      const sameContent = (a, b) => a === b ||
        crypto.createHash('sha256').update(fs.readFileSync(a)).digest('hex') === crypto.createHash('sha256').update(fs.readFileSync(b)).digest('hex');
      const LANDED_TASK_SHORT = 'cltpl';
      const landedAllowed = (opts.toolSource === undefined || sameContent(opts.toolSource, REAL_TOOL_PATH)) && opts.originUrl === undefined &&
        opts.land !== false && opts.push !== false && (opts.taskShort === undefined || opts.taskShort === LANDED_TASK_SHORT);
      if (!landedAllowed) throw new Error('buildCleanupFixture: landed:true is only for the real tool, without originUrl, with land and push not disabled and the fixed task id ' + LANDED_TASK_SHORT);
      const FT = require('./lib/fixture-template');
      const realHash = crypto.createHash('sha256').update(fs.readFileSync(REAL_TOOL_PATH)).digest('hex');
      const t = FT.template('pt_land landed:' + realHash, (dir) => {
        const built = buildCleanupFixture({ taskShort: LANDED_TASK_SHORT, __root: dir });
        return { task: built.task, base: built.base, tip: built.tip, mainOid: built.mainOid };
      });
      const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'ptland-qa-'));
      FT.materialize(t.dir, copy, ['portfolio-tracker/.git/config', 'portfolio-tracker/.git/worktrees/*/gitdir', 'pt-wt-worker-a/.git', 'pt-wt-worker-b/.git']);
      return buildFixture({ taskShort: LANDED_TASK_SHORT, gitignore: GITIGNORE_TEXT, __adopt: { tmp: copy, meta: t.meta } });
    }
    const fx = buildFixture(Object.assign({}, opts, { gitignore: GITIGNORE_TEXT }));
    if (opts.land !== false && fx.slotA) {
      const TOOL = fx.requireTool();
      fx.writeLandRecord('LAND ' + fx.task + ' ' + fx.tip + ' ' + fx.base + '\n');
      const landRes = TOOL.runLand({ cwd: fx.slotA, task: fx.task });
      if (!landRes.ok) throw new Error('fixture setup: land failed: ' + landRes.reason);
      if (opts.push !== false) {
        const pr = TOOL.runPushRequest({ cwd: fx.canon, expectedOriginUrls: [fx.originUrl] });
        if (!pr.ok) throw new Error('fixture setup: push-request failed: ' + pr.reason);
        fx.writePushRecord('PUSH branch-dev ' + pr.L + ' ' + pr.R + '\n');
        const pushRes = TOOL.runPush({ cwd: fx.canon, expectedOriginUrls: [fx.originUrl] });
        if (!pushRes.ok) throw new Error('fixture setup: push failed: ' + pushRes.reason);
      }
    }
    return fx;
  }
  function writeIgnoredEvidence(fx) {
    const dir = path.join(fx.slotA, 'work', fx.taskShort);
    for (const name of EVIDENCE_NAMES) W(path.join(dir, name), name.toUpperCase() + ' CONTENT\n');
  }
  // PL-30 (byte-identical before/after): origin main, origin tags, the canonical branch-dev, and
  // the other slot (B) must never move as a side effect of any cleanup call, success or refusal.
  function snapshotUntouched(fx) {
    return {
      mainBare: G(['rev-parse', 'main'], fx.bareDir).trim(),
      devBare: G(['rev-parse', 'branch-dev'], fx.bareDir).trim(),
      tagsBare: G(['tag'], fx.bareDir).trim(),
      canonDev: G(['rev-parse', 'branch-dev'], fx.canon).trim(),
      devRemoteTracking: G(['rev-parse', 'refs/remotes/origin/branch-dev'], fx.canon).trim(),
      slotB: fx.slotB ? G(['rev-parse', 'HEAD'], fx.slotB).trim() : null,
      slotBStatus: fx.slotB ? G(['status', '--porcelain'], fx.slotB).trim() : null
    };
  }
  function assertUntouched(fx, before) {
    const after = snapshotUntouched(fx);
    assert.strictEqual(after.mainBare, before.mainBare, 'PL-30: origin main unchanged');
    assert.strictEqual(after.devBare, before.devBare, 'PL-30: origin branch-dev unchanged');
    assert.strictEqual(after.tagsBare, before.tagsBare, 'PL-30: origin tags unchanged');
    assert.strictEqual(after.canonDev, before.canonDev, 'PL-30: canonical branch-dev unchanged');
    assert.strictEqual(after.devRemoteTracking, before.devRemoteTracking, 'PL-30: canonical origin/branch-dev tracking ref unchanged');
    if (fx.slotB) {
      assert.strictEqual(after.slotB, before.slotB, 'PL-30: the other slot (B) HEAD untouched');
      assert.strictEqual(after.slotBStatus, before.slotBStatus, 'PL-30: the other slot (B) status untouched');
    }
  }

  test('PL-22: valid cleanup archives+sha256-verifies plan.md/codex.md/qa.log, deletes originals, detaches the slot at branch-dev\'s OID, deletes the branch, writes one audit line (+ PL-30)', () => {
    const fx = buildCleanupFixture({ landed: true });
    try {
      writeIgnoredEvidence(fx);
      const beforeHash = {};
      for (const name of EVIDENCE_NAMES) {
        beforeHash[name] = crypto.createHash('sha256').update(fs.readFileSync(path.join(fx.slotA, 'work', fx.taskShort, name))).digest('hex');
      }
      const before = snapshotUntouched(fx);
      const TOOL = fx.requireTool();
      const archiveRoot = path.join(fx.tmp, 'pt-work-artifacts');
      const devOid = G(['rev-parse', 'branch-dev'], fx.canon).trim();
      const r = TOOL.runCleanup({ cwd: fx.slotA, task: fx.task, archiveRoot, now: '2026-01-01T00:00:00.000Z' });
      assert.strictEqual(r.ok, true, JSON.stringify(r));
      assert.strictEqual(r.exitCode, 0);
      assert.strictEqual(r.verb, 'cleanup');
      const archiveDir = path.join(archiveRoot, fx.taskShort, '20260101T000000Z');
      for (const name of EVIDENCE_NAMES) {
        const orig = path.join(fx.slotA, 'work', fx.taskShort, name);
        assert.ok(!fs.existsSync(orig), name + ' original deleted');
        const archived = path.join(archiveDir, name);
        assert.ok(fs.existsSync(archived), name + ' archived');
        const h = crypto.createHash('sha256').update(fs.readFileSync(archived)).digest('hex');
        assert.strictEqual(h, beforeHash[name], name + ' sha256 matches');
      }
      assert.strictEqual(G(['rev-parse', 'HEAD'], fx.slotA).trim(), devOid, 'slot HEAD == branch-dev OID');
      assert.notStrictEqual(Graw(['symbolic-ref', '-q', 'HEAD'], fx.slotA).status, 0, 'slot HEAD is detached');
      assert.strictEqual(G(['status', '--porcelain'], fx.slotA).trim(), '', 'slot status clean');
      assert.notStrictEqual(Graw(['rev-parse', '--verify', '-q', 'refs/heads/' + fx.task], fx.canon).status, 0, 'branch deleted');
      const audit = fs.readFileSync(path.join(fx.commonDir, 'pt-land-log'), 'utf8').trim().split('\n');
      const last = JSON.parse(audit[audit.length - 1]);
      assert.strictEqual(last.verb, 'cleanup');
      assert.strictEqual(last.result, 'ok');
      assertUntouched(fx, before);
    } finally { fx.cleanup(); }
  });



  test('PL-25: a tracked modification in the task worktree -> refuse (K4); no archive written (+ PL-30)', () => {
    const fx = buildCleanupFixture({ landed: true });
    try {
      writeIgnoredEvidence(fx);
      fs.appendFileSync(path.join(fx.slotA, 'work', fx.taskShort, 'foo.txt'), 'dirty\n');
      const before = snapshotUntouched(fx);
      const TOOL = fx.requireTool();
      const archiveRoot = path.join(fx.tmp, 'pt-work-artifacts');
      const r = TOOL.runCleanup({ cwd: fx.slotA, task: fx.task, archiveRoot });
      assert.strictEqual(r.ok, false);
      assert.match(r.reason, /K4/);
      assert.ok(!fs.existsSync(archiveRoot), 'no archive written');
      assertUntouched(fx, before);
    } finally { fx.cleanup(); }
  });



  test('PL-28: the branch is checked out nowhere (branch-only cleanup) -> branch deleted, no slot step (+ PL-30)', () => {
    const fx = buildCleanupFixture({ landed: true });
    try {
      G(['worktree', 'remove', '--force', fx.slotA], fx.canon);
      const before = snapshotUntouched(fx);
      const TOOL = fx.requireTool();
      const r = TOOL.runCleanup({ cwd: fx.canon, task: fx.task });
      assert.strictEqual(r.ok, true, JSON.stringify(r));
      assert.match(r.message, /no slot was checked out/);
      assert.match(r.message, /no evidence to archive/);
      assert.notStrictEqual(Graw(['rev-parse', '--verify', '-q', 'refs/heads/' + fx.task], fx.canon).status, 0, 'branch deleted');
      assertUntouched(fx, before);
    } finally { fx.cleanup(); }
  });

  test('PL-29: a planted non-sample git hook is never executed during K7/K8 (+ PL-30)', () => {
    const fx = buildCleanupFixture({ landed: true });
    try {
      writeIgnoredEvidence(fx);
      const marker = path.join(fx.tmp, 'hook-ran-marker.txt');
      const hookBody = '#!/bin/sh\necho ran >> "' + marker.replace(/\\/g, '/') + '"\n';
      // Linked worktrees share one hooks dir (fx.commonDir/hooks) - planting it once covers both
      // K7 (slot switch --detach, in fx.slotA) and K8 (branch -d, in fx.canon).
      const hooksDir = path.join(fx.commonDir, 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      for (const name of ['post-checkout', 'pre-commit', 'post-commit']) {
        const hookPath = path.join(hooksDir, name);
        fs.writeFileSync(hookPath, hookBody);
        try { fs.chmodSync(hookPath, 0o755); } catch (e) { /* best effort on platforms without exec bits */ }
      }
      const before = snapshotUntouched(fx);
      const TOOL = fx.requireTool();
      const archiveRoot = path.join(fx.tmp, 'pt-work-artifacts');
      const r = TOOL.runCleanup({ cwd: fx.slotA, task: fx.task, archiveRoot, now: '2026-01-01T00:00:00.000Z' });
      assert.strictEqual(r.ok, true, JSON.stringify(r));
      assert.ok(!fs.existsSync(marker), 'planted hook never ran');
      assertUntouched(fx, before);
    } finally { fx.cleanup(); }
  });

  test('PL-31: CLI cleanup without a task -> exit 3; a refusal -> exit 1; a success -> exit 0', () => {
    const fx = buildCleanupFixture({ landed: true });
    try {
      const toolPath = path.join(fx.canon, '.claude', 'hooks', 'pt-land.js');
      function run(args, cwd) { return spawnSync('node', [toolPath].concat(args), { cwd, encoding: 'utf8' }); }
      const usage = run(['cleanup'], fx.slotA);
      assert.strictEqual(usage.status, 3, usage.stderr);
      const refusal = run(['cleanup', 'task/does-not-exist'], fx.slotA);
      assert.strictEqual(refusal.status, 1, refusal.stderr);
      const success = run(['cleanup', fx.task], fx.slotA);
      assert.strictEqual(success.status, 0, success.stderr);
      assert.match(success.stdout, /^CLEANED /);
    } finally { fx.cleanup(); }
  });

  // ── cleanup mutants (brief §8): K3 dropped, K4 dropped, -d -> -D, archive verify skipped ──


  test('MUT: cleanup K8 "-d" changed to "-D" -> force-deletes a branch unmerged relative to canonical HEAD (caught)', () => {
    const mutSrc = withMutantSource((s) => s.replace(
      "'branch', '-d', task",
      "'branch', '-D', task"
    ));
    const fx = buildCleanupFixture({ taskShort: 'mu6', toolSource: mutSrc });
    try {
      // Move canonical's own checkout to a detached point BEFORE the task's commits, so the
      // task branch is an ancestor of refs/heads/branch-dev (K3 still passes - a ref, not a
      // checkout) but is NOT merged relative to canonical's CURRENT HEAD - exactly the
      // condition git's own "-d" safety net (not K3) is the last line of defence against.
      G(['checkout', '--detach', fx.base], fx.canon);
      const TOOL = fx.requireTool();
      const r = TOOL.runCleanup({ cwd: fx.canon, task: fx.task });
      assert.strictEqual(r.ok, true, 'mutant -D should have force-deleted the HEAD-unmerged branch');
      const check = spawnSync('git', ['rev-parse', '--verify', '-q', 'refs/heads/' + fx.task], { cwd: fx.canon, encoding: 'utf8' });
      assert.notStrictEqual(check.status, 0, 'branch deleted by the mutant despite not being merged into canonical HEAD');
    } finally { fx.cleanup(); }
  });

  test('MUT: cleanup K6 archive sha256 verification skipped -> a corrupted copy is archived and the original still deleted (caught)', () => {
    const mutSrc = withMutantSource((s) => s.replace(
      "          fs.writeFileSync(destAbs, buf, { flag: 'wx' });\r\n          const srcHash = crypto.createHash('sha256').update(buf).digest('hex');\r\n          const destHash = crypto.createHash('sha256').update(fs.readFileSync(destAbs)).digest('hex');\r\n          if (srcHash !== destHash) throw new Error('sha256 mismatch for ' + rel);\r\n",
      "          fs.writeFileSync(destAbs, Buffer.concat([buf, Buffer.from('CORRUPT')]), { flag: 'wx' });\r\n"
    ));
    const fx = buildCleanupFixture({ taskShort: 'mu7', toolSource: mutSrc });
    try {
      writeIgnoredEvidence(fx);
      const TOOL = fx.requireTool();
      const archiveRoot = path.join(fx.tmp, 'pt-work-artifacts');
      const r = TOOL.runCleanup({ cwd: fx.slotA, task: fx.task, archiveRoot, now: '2026-01-01T00:00:00.000Z' });
      assert.strictEqual(r.ok, true, 'mutant should have let a corrupted archive copy through without verification');
      const archived = fs.readFileSync(path.join(archiveRoot, 'mu7', '20260101T000000Z', 'plan.md'), 'utf8');
      assert.ok(/CORRUPT$/.test(archived), 'the corrupted copy was written and never caught');
      assert.ok(!fs.existsSync(path.join(fx.slotA, 'work', 'mu7', 'plan.md')), 'the (now-unverified) original was still deleted');
    } finally { fx.cleanup(); }
  });
})();

// ── PL-32..PL-55: owner-one-action-gates (work/owner-one-action-gates/brief.md §2 / §6) ───────
// G1 brief-request, G2 protected-request / protected-commit, G3 land (L8 revision), the approval-
// line shape rule, plus mutants. Like PL-1..31 these rows run against REAL_TOOL_PATH and are red
// against the real DENY-tier path until the Owner has applied the reviewed candidate.
(function plOwnerOneActionGates() {
  const crypto = require('crypto');
  const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
  const REAL_HOOK_PATH = path.join(ROOT, '.claude', 'hooks', 'pretooluse-guard.js');
  const APPROVAL_LINE_RE = /^! printf '%s\\n' '[^']+' > '[^']+\/pt-(brief|protected|land|push)-approval'$/;
  const fwd = (p) => String(p).replace(/\\/g, '/');
  function Graw(args, cwd) { return spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }); }

  // Precondition: the tool under test exports the OAG verbs (one informative failure instead of a
  // TypeError per row when the Owner has not applied the candidate yet).
  let hasVerbs = false;
  test('PL-32..55 precondition: the tool exports runBriefRequest / runProtectedRequest / runProtectedCommit / parseProtectedScope / approvalLine', () => {
    delete require.cache[require.resolve(REAL_TOOL_PATH)];
    const T = require(REAL_TOOL_PATH);
    for (const k of ['runBriefRequest', 'runProtectedRequest', 'runProtectedCommit', 'parseProtectedScope', 'approvalLine']) {
      assert.strictEqual(typeof T[k], 'function', k + ' missing (Owner has not applied the OAG candidate yet)');
    }
    hasVerbs = true;
  });
  if (!hasVerbs) return;

  // ── fixture helpers ─────────────────────────────────────────────────────────────────────
  // The tool reads candidates from <os.tmpdir()>/pt-<id>/protected/manifest.json (brief §2) - the
  // path is derived, not injectable, so every G2 row owns a unique short id and removes its dir.
  function manifestRoot(taskShort) { return path.join(os.tmpdir(), 'pt-' + taskShort); }
  function writeManifest(taskShort, files, rawManifest) {
    const dir = path.join(manifestRoot(taskShort), 'protected');
    rmrf(manifestRoot(taskShort));
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files) if (f.content !== undefined) fs.writeFileSync(path.join(dir, f.source), f.content);
    const manifest = rawManifest !== undefined ? rawManifest : JSON.stringify({ files: files.map((f) => ({ target: f.target, source: f.source })) });
    fs.writeFileSync(path.join(dir, 'manifest.json'), manifest);
    return dir;
  }
  const DEFAULT_TARGET = '.claude/hooks/sample-hook.js';
  const CAND_V1 = 'module.exports = 1; // candidate v1\n';
  // brief with a protected-scope block (and the target also in land-scope, never written by the
  // fixture's impl commit); slot A on task/<id> with the impl + review.md commit; a manifest.
  function buildProtectedFixture(opts) {
    opts = opts || {};
    const target = opts.target || DEFAULT_TARGET;
    const fx = buildFixture(Object.assign({}, opts, {
      scopeRelPaths: ['work/' + opts.taskShort + '/foo.txt'],
      landScopeOnlyPaths: [target].concat(opts.landScopeOnlyPaths || []),
      protectedScopeRelPaths: [target].concat(opts.extraProtectedScope || [])
    }));
    fx.target = target;
    if (opts.manifest !== false) {
      fx.manifestDir = writeManifest(fx.taskShort, opts.files || [{ target, source: 'cand.js', content: CAND_V1 }], opts.rawManifest);
    }
    const inner = fx.cleanup;
    fx.cleanup = () => { rmrf(manifestRoot(fx.taskShort)); inner(); };
    fx.writeProtectedRecord = (text) => fs.writeFileSync(path.join(fx.commonDir, 'pt-protected-approval'), text);
    fx.readAudit = () => {
      const p = path.join(fx.commonDir, 'pt-land-log');
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    };
    fx.rewriteAudit = (fn) => {
      const p = path.join(fx.commonDir, 'pt-land-log');
      fs.writeFileSync(p, fx.readAudit().map(fn).map((e) => JSON.stringify(e)).join('\n') + '\n');
    };
    return fx;
  }
  // The Owner's `!` line: `! printf '%s\n' '<payload>' > '<record>'` writes payload + "\n".
  function payloadOf(line) {
    const m = /^! printf '%s\\n' '([^']+)' > '([^']+)'$/.exec(line);
    assert.ok(m, 'approval line shape: ' + line);
    return { payload: m[1], recordPath: m[2] };
  }
  function approveProtected(fx, TOOL) {
    const req = TOOL.runProtectedRequest({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(req.ok, true, 'protected-request: ' + JSON.stringify(req));
    const p = payloadOf(req.approvalLine);
    fs.writeFileSync(p.recordPath, p.payload + '\n');
    return req;
  }
  // PL-35 "nothing written but objects": refs, both indexes (content), both worktrees, the slot
  // HEAD and every .git/pt-* record/log file - compared before/after as one value.
  function snapshotRepo(fx) {
    Graw(['update-index', '--refresh'], fx.canon);
    Graw(['update-index', '--refresh'], fx.slotA);
    const records = fs.readdirSync(fx.commonDir).filter((n) => /^pt-/.test(n)).sort()
      .map((n) => n + ':' + sha256(fs.readFileSync(path.join(fx.commonDir, n)))).join('|');
    return {
      refs: G(['for-each-ref'], fx.canon),
      canonIndex: G(['ls-files', '--stage'], fx.canon),
      slotIndex: G(['ls-files', '--stage'], fx.slotA),
      canonStatus: G(['status', '--porcelain=v2', '--untracked-files=all'], fx.canon),
      slotStatus: G(['status', '--porcelain=v2', '--untracked-files=all'], fx.slotA),
      slotHead: G(['rev-parse', 'HEAD'], fx.slotA),
      records
    };
  }
  function assertRefusedUnchanged(fx, headBefore, r, reasonRe) {
    assert.strictEqual(r.ok, false, JSON.stringify(r));
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.reason, reasonRe);
    assert.strictEqual(G(['rev-parse', 'HEAD'], fx.slotA).trim(), headBefore, 'slot HEAD unchanged');
    assert.strictEqual(G(['status', '--porcelain'], fx.slotA).trim(), '', 'slot clean');
    assert.strictEqual(G(['rev-parse', 'refs/heads/branch-dev'], fx.canon).trim(), fx.base, 'branch-dev untouched');
    assert.ok(!fs.existsSync(path.join(fx.commonDir, 'pt-land.lock')), 'no lock left behind');
  }
  function canonSnapshot(fx) {
    return {
      dir: fs.readdirSync(fx.commonDir).sort().join('|'),
      refs: G(['for-each-ref'], fx.canon),
      status: G(['status', '--porcelain=v2', '--untracked-files=all'], fx.canon)
    };
  }

  // ── G1: brief-request ────────────────────────────────────────────────────────────────────

  (function plBriefRequestRefusals() {
    const cases = [
      ['two staged entries', (fx) => { G(['add', 'work/g1x/brief.md'], fx.canon); W(path.join(fx.canon, 'other.txt'), 'x\n'); G(['add', 'other.txt'], fx.canon); }, /G1: .*not exactly one entry/]
    ];
    for (const [label, mutate, re] of cases) {
      test('PL-33: brief-request with ' + label + ' -> refuse (exit 1); nothing written', () => {
        const fx = buildFixture({ taskShort: 'oag2', withSlotA: false, withSlotB: false });
        try {
          const TOOL = fx.requireTool();
          W(path.join(fx.canon, 'work', 'g1x', 'brief.md'), '# brief\n');
          mutate(fx);
          const before = canonSnapshot(fx);
          const r = TOOL.runBriefRequest({ cwd: fx.canon, path: 'work/g1x/brief.md' });
          assert.strictEqual(r.ok, false, label + ': ' + JSON.stringify(r));
          assert.strictEqual(r.exitCode, 1, label);
          assert.match(r.reason, re, label);
          assert.deepStrictEqual(canonSnapshot(fx), before, label + ': a refusal must write nothing');
        } finally { fx.cleanup(); }
      });
    }
  })();

  test('PL-34: end-to-end - the printed sha256/OID written as the record are exactly what R11 accepts (real hook: allow; a tampered blob: deny); the plain commit then touches only the brief', () => {
    const fx = buildFixture({ taskShort: 'oag3', withSlotA: false, withSlotB: false });
    const savedProjectDir = process.env.CLAUDE_PROJECT_DIR;
    try {
      const TOOL = fx.requireTool();
      delete require.cache[require.resolve(REAL_HOOK_PATH)];
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const guard = require(REAL_HOOK_PATH);
      const briefText = '# brief z\n';
      W(path.join(fx.canon, 'work', 'g1z', 'brief.md'), briefText);
      G(['add', 'work/g1z/brief.md'], fx.canon);
      const r = TOOL.runBriefRequest({ cwd: fx.canon, path: 'work/g1z/brief.md' });
      assert.strictEqual(r.ok, true, JSON.stringify(r));
      const p = payloadOf(r.approvalLine);
      assert.strictEqual(p.recordPath, fwd(fx.commonDir) + '/pt-brief-approval');
      process.env.CLAUDE_PROJECT_DIR = fx.canon;
      const cmd = 'git commit -m "docs(work): add g1z brief"';
      // planted negative first: without the record the same commit is denied by R11 - this proves the
      // commit is routed through the brief-only gate (an R11 allow carries the hook's generic reason).
      const noRecord = guard.decide({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: fx.canon });
      assert.strictEqual(noRecord.decision, 'deny', JSON.stringify(noRecord));
      assert.match(noRecord.reason, /R11: there is no valid Owner approval record/);
      fs.writeFileSync(p.recordPath, p.payload + '\n');
      const allow = guard.decide({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: fx.canon });
      assert.strictEqual(allow.decision, 'allow', JSON.stringify(allow));
      // planted negative: the same record against a different staged blob is denied by the same hook
      fs.writeFileSync(path.join(fx.canon, 'work', 'g1z', 'brief.md'), briefText + 'tampered\n');
      G(['add', 'work/g1z/brief.md'], fx.canon);
      const deny = guard.decide({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: fx.canon });
      assert.strictEqual(deny.decision, 'deny', JSON.stringify(deny));
      assert.match(deny.reason, /R11: the staged content does not match the approved hash/);
      fs.writeFileSync(path.join(fx.canon, 'work', 'g1z', 'brief.md'), briefText);
      G(['add', 'work/g1z/brief.md'], fx.canon);
      assert.strictEqual(guard.decide({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: fx.canon }).decision, 'allow');
      const cm = Graw(['commit', '-m', 'docs(work): add g1z brief'], fx.canon);
      assert.strictEqual(cm.status, 0, cm.stderr);
      const changed = G(['show', '--name-only', '--format=', 'HEAD'], fx.canon).trim().split(/\r?\n/).filter(Boolean);
      assert.deepStrictEqual(changed, ['work/g1z/brief.md']);
      assert.strictEqual(G(['status', '--porcelain'], fx.canon).trim(), '');
    } finally {
      if (savedProjectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = savedProjectDir;
      fx.cleanup();
    }
  });

  // ── G2: protected-request / protected-commit ─────────────────────────────────────────────
  test('PL-35: valid protected-request -> tree OID, per-file blob + sha256, exact line; writes nothing but unreferenced objects', () => {
    const fx = buildProtectedFixture({ taskShort: 'oag4' });
    try {
      const TOOL = fx.requireTool();
      const before = snapshotRepo(fx);
      const r = TOOL.runProtectedRequest({ cwd: fx.slotA, task: fx.task });
      assert.strictEqual(r.ok, true, JSON.stringify(r));
      assert.strictEqual(r.exitCode, 0);
      assert.strictEqual(r.verb, 'protected-request');
      assert.match(r.tree, /^[0-9a-f]{40}$/);
      assert.strictEqual(r.head, fx.tip);
      assert.deepStrictEqual(r.files.map((f) => f.target), [fx.target]);
      assert.strictEqual(r.files[0].sha256, sha256(Buffer.from(CAND_V1)));
      assert.strictEqual(r.approvalLine,
        "! printf '%s\\n' 'PROTECTED " + fx.task + ' ' + fx.tip + ' ' + r.tree + "' > '" + fwd(fx.commonDir) + "/pt-protected-approval'");
      // the tree exists as an (unreferenced) object and is HEAD's tree plus exactly the candidate
      assert.strictEqual(G(['cat-file', '-t', r.tree], fx.canon).trim(), 'tree');
      const diff = G(['diff-tree', '-r', '--name-only', fx.tip + '^{tree}', r.tree], fx.canon).trim().split(/\r?\n/).filter(Boolean);
      assert.deepStrictEqual(diff, [fx.target]);
      assert.strictEqual(G(['rev-parse', r.tree + ':' + fx.target], fx.canon).trim(), r.files[0].blobOid);
      assert.deepStrictEqual(snapshotRepo(fx), before, 'protected-request must write nothing but objects');
    } finally { fx.cleanup(); }
  });

  test('PL-36: valid protected-commit -> HEAD^{tree} == approved tree, parent == recorded HEAD, exactly the target staged, record deleted, one ok audit line, slot clean', () => {
    const fx = buildProtectedFixture({ taskShort: 'oag5' });
    try {
      const TOOL = fx.requireTool();
      const req = approveProtected(fx, TOOL);
      const r = TOOL.runProtectedCommit({ cwd: fx.slotA, task: fx.task });
      assert.strictEqual(r.ok, true, JSON.stringify(r));
      assert.strictEqual(r.exitCode, 0);
      assert.strictEqual(r.verb, 'protected-commit');
      const head = G(['rev-parse', 'HEAD'], fx.slotA).trim();
      assert.notStrictEqual(head, fx.tip);
      assert.strictEqual(G(['rev-parse', 'HEAD^{tree}'], fx.slotA).trim(), req.tree);
      assert.strictEqual(G(['rev-parse', 'HEAD^'], fx.slotA).trim(), fx.tip);
      assert.strictEqual(G(['rev-parse', 'refs/heads/' + fx.task], fx.canon).trim(), head, 'the task branch moved with the slot HEAD');
      // the blob is LF (asserted via the tree above); the working copy may be CRLF under core.autocrlf=true
      assert.strictEqual(fs.readFileSync(path.join(fx.slotA, fx.target), 'utf8').replace(/\r\n/g, '\n'), CAND_V1);
      assert.strictEqual(G(['status', '--porcelain'], fx.slotA).trim(), '');
      assert.deepStrictEqual(G(['show', '--name-only', '--format=', 'HEAD'], fx.slotA).trim().split(/\r?\n/).filter(Boolean), [fx.target]);
      assert.strictEqual(G(['log', '-1', '--format=%s'], fx.slotA).trim(),
        'chore(protected): apply Owner-approved files (' + fx.task + ', tree ' + req.tree.slice(0, 12) + ')');
      assert.ok(!fs.existsSync(path.join(fx.commonDir, 'pt-protected-approval')), 'record deleted (single-use)');
      assert.ok(!fs.existsSync(path.join(fx.commonDir, 'pt-land.lock')), 'lock released');
      const audit = fx.readAudit();
      assert.strictEqual(audit.length, 1);
      assert.deepStrictEqual(
        { verb: audit[0].verb, task: audit[0].task, from: audit[0].from, to: audit[0].to, tree: audit[0].tree, result: audit[0].result },
        { verb: 'protected-commit', task: fx.task, from: fx.tip, to: head, tree: req.tree, result: 'ok' });
      assert.strictEqual(G(['rev-parse', 'refs/heads/branch-dev'], fx.canon).trim(), fx.base, 'branch-dev untouched');
      assert.strictEqual(r.message, 'PROTECTED-COMMITTED ' + fx.task + ' ' + fx.tip + '..' + head + ' tree ' + req.tree);
    } finally { fx.cleanup(); }
  });


  // §9: a logging git shim (CDX-1's NODE_OPTIONS --require pattern, delegating to real git) records
  // every git call the tool makes ({sub, args, cwd, indexFile}) and can advance the task ref by one
  // plain commit right before delegating the first `update-ref` (the compare-and-swap negative).
  function makeLoggingGitShim(dir, shimOpts) {
    const logFile = path.join(dir, 'git-calls.jsonl');
    const marker = path.join(dir, 'git-calls.advanced');
    const intercept = path.join(dir, 'logging-git-intercept.js');
    const advance = !!(shimOpts && shimOpts.advanceRefOnUpdateRef);
    fs.writeFileSync(intercept,
      "'use strict';\n" +
      "const fs = require('fs');\n" +
      "const path = require('path');\n" +
      "const { spawnSync } = require('child_process');\n" +
      "const rawArgs = process.argv.slice(1);\n" +
      "const sub = path.basename(rawArgs[0] || '');\n" +
      "const rest = rawArgs.slice(1);\n" +
      'fs.appendFileSync(' + JSON.stringify(logFile) + ", JSON.stringify({ sub, args: rest, cwd: process.cwd(), indexFile: typeof process.env.GIT_INDEX_FILE === 'string' }) + '\\n');\n" +
      (advance
        ? "if (sub === 'update-ref' && !fs.existsSync(" + JSON.stringify(marker) + ')) {\n' +
          '  fs.writeFileSync(' + JSON.stringify(marker) + ", '1');\n" +
          "  spawnSync('git', ['commit', '-q', '--allow-empty', '-m', 'race: another writer advanced the task ref'], { stdio: 'ignore', windowsHide: true });\n" +
          '}\n'
        : '') +
      "const r = spawnSync('git', [sub].concat(rest), { stdio: 'inherit', windowsHide: true });\n" +
      'process.exit(r.status === null ? 1 : r.status);\n');
    return {
      gitExec: process.execPath,
      nodeOptions: '--require ' + intercept,
      calls: () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])
    };
  }
  function withShim(shim, fn) {
    const saved = process.env.NODE_OPTIONS;
    process.env.NODE_OPTIONS = shim.nodeOptions;
    try { return fn(); } finally { if (saved === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = saved; }
  }
  const samePath = (a, b) => fwd(a).toLowerCase().replace(/\/+$/, '') === fwd(b).toLowerCase().replace(/\/+$/, '');

  test('PL-36 (atomic, brief §9): protected-commit creates the commit from the approved tree (commit-tree <tree> -p <HEAD>), moves the task ref by compare-and-swap (update-ref <ref> <new> <HEAD>), checks out exactly the targets from HEAD, and never runs add / commit / write-tree against the slot index', () => {
    const fx = buildProtectedFixture({ taskShort: 'oag5c' });
    try {
      const TOOL = fx.requireTool();
      const req = approveProtected(fx, TOOL);
      const shim = makeLoggingGitShim(fx.tmp);
      const r = withShim(shim, () => TOOL.runProtectedCommit({ cwd: fx.slotA, task: fx.task, gitExec: shim.gitExec }));
      assert.strictEqual(r.ok, true, JSON.stringify(r));
      const head = G(['rev-parse', 'HEAD'], fx.slotA).trim();
      const calls = shim.calls();
      const ct = calls.filter((c) => c.sub === 'commit-tree');
      assert.strictEqual(ct.length, 1, 'exactly one commit-tree');
      assert.deepStrictEqual(ct[0].args.slice(0, 4), [req.tree, '-p', fx.tip, '-m']);
      assert.deepStrictEqual(calls.filter((c) => c.sub === 'update-ref').map((c) => c.args), [['refs/heads/' + fx.task, head, fx.tip]]);
      const co = calls.filter((c) => c.sub === 'checkout');
      assert.deepStrictEqual(co.map((c) => c.args), [['HEAD', '--', fx.target]]);
      assert.ok(samePath(co[0].cwd, fx.slotA), 'checkout runs in the slot');
      assert.deepStrictEqual(calls.filter((c) => c.sub === 'add' || c.sub === 'commit'), [], 'never git add / git commit');
      assert.ok(calls.some((c) => c.sub === 'write-tree'), 'the request-side temporary-index build ran');
      assert.ok(calls.filter((c) => c.sub === 'write-tree').every((c) => c.indexFile === true), 'write-tree only ever on the temporary index (GIT_INDEX_FILE set)');
      assert.strictEqual(G(['rev-parse', 'HEAD^{tree}'], fx.slotA).trim(), req.tree);
      assert.strictEqual(G(['rev-parse', 'HEAD^'], fx.slotA).trim(), fx.tip);
      assert.strictEqual(G(['rev-parse', ':' + fx.target], fx.slotA).trim(), G(['rev-parse', req.tree + ':' + fx.target], fx.canon).trim(), 'index blob == approved blob');
      assert.strictEqual(G(['status', '--porcelain'], fx.slotA).trim(), '');
      assert.strictEqual(fs.readFileSync(path.join(fx.slotA, fx.target), 'utf8').replace(/\r\n/g, '\n'), CAND_V1);
      assert.ok(!fs.existsSync(path.join(fx.commonDir, 'pt-protected-approval')), 'record consumed');
      assert.strictEqual(fx.readAudit().filter((e) => e.result === 'ok').length, 1);
    } finally { fx.cleanup(); }
  });

  test('PL-36 (CAS negative, brief §9): the task ref advanced by another writer right before update-ref -> refuse (compare-and-swap); HEAD is that writer\'s commit, the approved tree was not committed onto it, slot clean, record kept', () => {
    const fx = buildProtectedFixture({ taskShort: 'oag5d' });
    try {
      const TOOL = fx.requireTool();
      const req = approveProtected(fx, TOOL);
      const shim = makeLoggingGitShim(fx.tmp, { advanceRefOnUpdateRef: true });
      const r = withShim(shim, () => TOOL.runProtectedCommit({ cwd: fx.slotA, task: fx.task, gitExec: shim.gitExec }));
      assert.strictEqual(r.ok, false, JSON.stringify(r));
      assert.strictEqual(r.exitCode, 1);
      assert.match(r.reason, /^G2: the task ref moved since the approval \(compare-and-swap\)/);
      assert.strictEqual(G(['log', '-1', '--format=%s'], fx.slotA).trim(), 'race: another writer advanced the task ref');
      assert.strictEqual(G(['rev-parse', 'HEAD^'], fx.slotA).trim(), fx.tip, 'exactly the race commit sits on the recorded HEAD');
      assert.notStrictEqual(G(['rev-parse', 'HEAD^{tree}'], fx.slotA).trim(), req.tree, 'the approved tree was not committed onto the moved ref');
      assert.strictEqual(G(['status', '--porcelain'], fx.slotA).trim(), '');
      assert.ok(fs.existsSync(path.join(fx.commonDir, 'pt-protected-approval')), 'record kept');
      assert.ok(!fs.existsSync(path.join(fx.commonDir, 'pt-land.lock')), 'lock released');
      assert.strictEqual(fx.readAudit().filter((e) => e.result === 'ok').length, 0, 'no ok entry');
    } finally { fx.cleanup(); }
  });

  test('PL-36 (live index, brief §9): an index/working-tree difference on the target path never reaches the committed tree - the dirty slot is refused before any commit', () => {
    const fx = buildProtectedFixture({ taskShort: 'oag5e' });
    try {
      const TOOL = fx.requireTool();
      approveProtected(fx, TOOL);
      W(path.join(fx.slotA, fx.target), 'module.exports = 99; // live-index content\n');
      G(['add', fx.target], fx.slotA);
      const r = TOOL.runProtectedCommit({ cwd: fx.slotA, task: fx.task });
      assert.strictEqual(r.ok, false, JSON.stringify(r));
      assert.match(r.reason, /G2: the slot is not clean/);
      assert.strictEqual(G(['rev-parse', 'HEAD'], fx.slotA).trim(), fx.tip);
      assert.ok(fs.existsSync(path.join(fx.commonDir, 'pt-protected-approval')), 'record kept');
    } finally { fx.cleanup(); }
  });

  test('PL-37: candidate edited after the request (tree mismatch) -> protected-commit refuses; nothing changes', () => {
    const fx = buildProtectedFixture({ taskShort: 'oag6' });
    try {
      const TOOL = fx.requireTool();
      approveProtected(fx, TOOL);
      fs.writeFileSync(path.join(fx.manifestDir, 'cand.js'), 'module.exports = 2; // edited after approval\n');
      const r = TOOL.runProtectedCommit({ cwd: fx.slotA, task: fx.task });
      assertRefusedUnchanged(fx, fx.tip, r, /G2: the candidate tree no longer matches the approved tree/);
      assert.ok(fs.existsSync(path.join(fx.commonDir, 'pt-protected-approval')), 'the record is not consumed by a refusal');
    } finally { fx.cleanup(); }
  });


  (function plRecordMismatch() {
    const cases = [
      ['another tree', (fx, req) => 'PROTECTED ' + fx.task + ' ' + req.head + ' ' + '0'.repeat(40) + '\n', /G2: the candidate tree no longer matches the approved tree/]
    ];
    for (const [label, record, re] of cases) {
      test('PL-39: protected-commit with ' + label + ' -> refuse; nothing changes', () => {
        const fx = buildProtectedFixture({ taskShort: 'oag8' });
        try {
          const TOOL = fx.requireTool();
          const req = TOOL.runProtectedRequest({ cwd: fx.slotA, task: fx.task });
          assert.strictEqual(req.ok, true, JSON.stringify(req));
          const text = record(fx, req);
          if (text !== null) fx.writeProtectedRecord(text);
          const r = TOOL.runProtectedCommit({ cwd: fx.slotA, task: fx.task });
          assertRefusedUnchanged(fx, fx.tip, r, re);
        } finally { fx.cleanup(); }
      });
    }
  })();




  test('PL-44: planted non-sample git hooks are never executed by protected-commit (commit still made, hooks path empty)', () => {
    const fx = buildProtectedFixture({ taskShort: 'oag13' });
    try {
      const marker = path.join(fx.tmp, 'protected-hook-ran.txt');
      const hooksDir = path.join(fx.commonDir, 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      const body = '#!/bin/sh\necho ran >> "' + marker.replace(/\\/g, '/') + '"\n';
      for (const name of ['pre-commit', 'commit-msg', 'post-commit', 'post-checkout', 'reference-transaction']) {
        fs.writeFileSync(path.join(hooksDir, name), body);
        try { fs.chmodSync(path.join(hooksDir, name), 0o755); } catch (e) { /* best effort */ }
      }
      const TOOL = fx.requireTool();
      const req = approveProtected(fx, TOOL);
      const r = TOOL.runProtectedCommit({ cwd: fx.slotA, task: fx.task });
      assert.strictEqual(r.ok, true, JSON.stringify(r));
      assert.strictEqual(G(['rev-parse', 'HEAD^{tree}'], fx.slotA).trim(), req.tree);
      assert.ok(!fs.existsSync(marker), 'the planted hooks must not have run');
    } finally { fx.cleanup(); }
  });


  // ── G3: land (L8 revision) ───────────────────────────────────────────────────────────────
  // Two targets: AGENTS.md (an ordinary allowed target) and a .claude/hooks/** target, which also
  // crosses L10 - qa/guard_integrity_check.js C6 exempts a PROTECTED-approved path (brief §8).
  const AGENTS_V2 = '# AGENTS v2\n';
  function buildApprovedLandFixture(taskShort, target, content) {
    const fx = buildProtectedFixture({ taskShort, target, files: [{ target, source: 'cand.txt', content }] });
    const TOOL = fx.requireTool();
    const req = approveProtected(fx, TOOL);
    const pc = TOOL.runProtectedCommit({ cwd: fx.slotA, task: fx.task });
    assert.strictEqual(pc.ok, true, 'fixture setup: protected-commit: ' + JSON.stringify(pc));
    fx.TOOL = TOOL;
    fx.req = req;
    fx.tip2 = G(['rev-parse', 'HEAD'], fx.slotA).trim();
    return fx;
  }

  test('PL-46: LAND allowed when the protected blob equals the approved tree - land-request lists path/blob/approving tree, LAND line unchanged, land fast-forwards branch-dev', () => {
    const fx = buildApprovedLandFixture('oag15', 'AGENTS.md', AGENTS_V2);
    try {
      const lr = fx.TOOL.runLandRequest({ cwd: fx.slotA, task: fx.task });
      assert.strictEqual(lr.ok, true, JSON.stringify(lr));
      assert.ok(lr.report.files.indexOf('AGENTS.md') !== -1);
      const blob = G(['rev-parse', fx.tip2 + ':AGENTS.md'], fx.canon).trim();
      assert.deepStrictEqual(lr.report.protectedFiles, [{ path: 'AGENTS.md', blob, tree: fx.req.tree }]);
      assert.strictEqual(G(['rev-parse', fx.req.tree + ':AGENTS.md'], fx.canon).trim(), blob, 'the blob is the one in the approved tree');
      assert.strictEqual(lr.approvalLine,
        "! printf '%s\\n' 'LAND " + fx.task + ' ' + fx.tip2 + ' ' + fx.base + "' > '" + fwd(fx.commonDir) + "/pt-land-approval'");
      // the CLI report shows the protected listing
      const toolPath = path.join(fx.canon, '.claude', 'hooks', 'pt-land.js');
      const cli = spawnSync('node', [toolPath, 'land-request', fx.task], { cwd: fx.slotA, encoding: 'utf8' });
      assert.strictEqual(cli.status, 0, cli.stderr);
      assert.match(cli.stdout, /protected \(PROTECTED-approved\):\n\s+AGENTS\.md {2}blob [0-9a-f]{40} {2}tree [0-9a-f]{40}\n/);
      fx.writeLandRecord('LAND ' + fx.task + ' ' + fx.tip2 + ' ' + fx.base + '\n');
      const land = fx.TOOL.runLand({ cwd: fx.slotA, task: fx.task });
      assert.strictEqual(land.ok, true, JSON.stringify(land));
      assert.strictEqual(G(['rev-parse', 'refs/heads/branch-dev'], fx.canon).trim(), fx.tip2);
      assert.strictEqual(fs.readFileSync(path.join(fx.canon, 'AGENTS.md'), 'utf8').replace(/\r\n/g, '\n'), AGENTS_V2);
      assert.strictEqual(G(['rev-parse', 'HEAD:AGENTS.md'], fx.canon).trim(), blob, 'the landed blob is the approved one');
    } finally { fx.cleanup(); }
  });

  test('PL-47: a protected file changed after approval -> land-request refuses "not PROTECTED-approved"', () => {
    const fx = buildApprovedLandFixture('oag16', 'AGENTS.md', AGENTS_V2);
    try {
      fs.writeFileSync(path.join(fx.slotA, 'AGENTS.md'), AGENTS_V2 + 'post-approval edit\n');
      G(['add', 'AGENTS.md'], fx.slotA);
      G(['commit', '-q', '-m', 'edit after approval'], fx.slotA);
      const lr = fx.TOOL.runLandRequest({ cwd: fx.slotA, task: fx.task });
      assert.strictEqual(lr.ok, false, JSON.stringify(lr));
      assert.match(lr.reason, /^L8: protected path not PROTECTED-approved: Owner LAND \(AGENTS\.md, changed after approval\)$/);
      assert.strictEqual(G(['rev-parse', 'refs/heads/branch-dev'], fx.canon).trim(), fx.base);
    } finally { fx.cleanup(); }
  });



  test('PL-50: the approving commit is no longer an ancestor (task rebased after a Second LAND) -> land-request refuses "not PROTECTED-approved" (not a Second-LAND refusal)', () => {
    const fx = buildApprovedLandFixture('oag19', 'AGENTS.md', AGENTS_V2);
    try {
      W(path.join(fx.canon, 'other.txt'), 'x\n');
      G(['add', 'other.txt'], fx.canon);
      G(['commit', '-q', '-m', 'another task landed first'], fx.canon);
      const rb = Graw(['rebase', 'refs/heads/branch-dev'], fx.slotA);
      assert.strictEqual(rb.status, 0, 'fixture rebase: ' + rb.stderr);
      const newTip = G(['rev-parse', 'HEAD'], fx.slotA).trim();
      assert.notStrictEqual(newTip, fx.tip2, 'the approving commit was rewritten');
      assert.strictEqual(G(['rev-parse', 'HEAD^{tree}:AGENTS.md'], fx.slotA).trim(), G(['rev-parse', fx.req.tree + ':AGENTS.md'], fx.canon).trim(), 'the blob itself is unchanged - only the ancestry broke');
      const lr = fx.TOOL.runLandRequest({ cwd: fx.slotA, task: fx.task });
      assert.strictEqual(lr.ok, false, JSON.stringify(lr));
      assert.match(lr.reason, /^L8: protected path not PROTECTED-approved: Owner LAND \(AGENTS\.md\)$/);
      assert.doesNotMatch(lr.reason, /Second LAND/);
    } finally { fx.cleanup(); }
  });



  // ── shape rule ───────────────────────────────────────────────────────────────────────────

  test('PL-54: approvalLine refuses a payload containing \', ;, $, a backtick or a newline (no line can carry a second command)', () => {
    // eslint-disable-next-line global-require
    const TOOL = require(REAL_TOOL_PATH);
    const A = 'a'.repeat(40);
    for (const bad of ["LAND task/x' ; rm -rf /; echo '", 'LAND task/x; echo hi', 'LAND $(whoami)', 'LAND `whoami`', 'LAND task/x\necho hi', 'LAND task/x\r', 42, null, undefined]) {
      assert.throws(() => TOOL.approvalLine('land', bad, '/repo/.git'), /approvalLine: unsafe payload/, 'payload ' + JSON.stringify(bad));
    }
    const ok = TOOL.approvalLine('land', 'LAND task/x ' + A + ' ' + A, 'C:\\repo\\.git');
    assert.strictEqual(ok, "! printf '%s\\n' 'LAND task/x " + A + ' ' + A + "' > 'C:/repo/.git/pt-land-approval'");
    assert.match(ok, APPROVAL_LINE_RE);
  });

  // ── CLI ──────────────────────────────────────────────────────────────────────────────────
  test('PL-55: CLI exit codes for the new verbs - usage 3, refusal 1, success 0 with the report and the line on stdout', () => {
    const fx = buildProtectedFixture({ taskShort: 'oag24' });
    try {
      const toolPath = path.join(fx.canon, '.claude', 'hooks', 'pt-land.js');
      const run = (args, cwd) => spawnSync('node', [toolPath].concat(args), { cwd, encoding: 'utf8' });
      assert.strictEqual(run(['protected-request'], fx.slotA).status, 3, 'protected-request without a task');
      assert.strictEqual(run(['protected-commit'], fx.slotA).status, 3, 'protected-commit without a task');
      assert.strictEqual(run(['protected-apply', fx.task], fx.slotA).status, 3, 'unknown verb');
      assert.strictEqual(run(['brief-request'], fx.canon).status, 3, 'brief-request without a path');
      assert.strictEqual(run(['brief-request', 'work/x/notes.md'], fx.canon).status, 3, 'brief-request with a wrong path shape');
      const pc = run(['protected-commit', fx.task], fx.slotA);
      assert.strictEqual(pc.status, 1, 'protected-commit without a record');
      assert.match(pc.stderr, /G2: no\/stale PROTECTED approval/);
      const preq = run(['protected-request', fx.task], fx.slotA);
      assert.strictEqual(preq.status, 0, preq.stderr);
      assert.match(preq.stdout, /^PROTECTED REQUEST for task\/oag24\n {2}HEAD: [0-9a-f]{40}\n {2}tree: [0-9a-f]{40}\n {2}files:\n {4}\.claude\/hooks\/sample-hook\.js {2}[0-9a-f]{40} {2}sha256=[0-9a-f]{64}\n\n! printf /);
      assert.ok(APPROVAL_LINE_RE.test(preq.stdout.trim().split('\n').pop()), 'the last stdout line is the approval line');
      const notStaged = run(['brief-request', 'work/nothere/brief.md'], fx.canon);
      assert.strictEqual(notStaged.status, 1, 'brief-request with nothing staged');
      assert.match(notStaged.stderr, /G1: /);
      W(path.join(fx.canon, 'work', 'cli', 'brief.md'), '# cli\n');
      G(['add', 'work/cli/brief.md'], fx.canon);
      const br = run(['brief-request', 'work/cli/brief.md'], fx.canon);
      assert.strictEqual(br.status, 0, br.stderr);
      assert.match(br.stdout, /^BRIEF REQUEST for work\/cli\/brief\.md\n {2}branch-dev OID: [0-9a-f]{40}\n {2}sha256: {9}[0-9a-f]{64}\n\n! printf /);
      assert.ok(APPROVAL_LINE_RE.test(br.stdout.trim().split('\n').pop()), 'the last stdout line is the approval line');
    } finally { fx.cleanup(); }
  });

  // ── mutants (each planted in the production source, committed into a fresh fixture) ───────
  test('MUT-OAG-3: approvalLine payload guard dropped -> a payload carrying a second command is printed (caught)', () => {
    const mutSrc = withMutantSource((s) => s.replace(
      "  if (typeof payload !== 'string' || /['\\r\\n;$`]/.test(payload)) {\r\n    throw new Error('approvalLine: unsafe payload for kind ' + kind);\r\n  }\r\n",
      ''
    ));
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const M = require(mutSrc);
    const line = M.approvalLine('land', "LAND task/x' ; echo pwned ; echo '", '/repo/.git');
    assert.strictEqual(typeof line, 'string', 'mutant should have returned a line instead of throwing');
    assert.match(line, /echo pwned/);
  });
  test('MUT-OAG-5: G2 step-2 tree check dropped -> an edited candidate is no longer refused (caught); under §9 the committed tree is still exactly the approved one', () => {
    const mutSrc = withMutantSource((s) => s.replace(
      "    if (built.tree !== record.tree) return refuse('the candidate tree no longer matches the approved tree');\r\n",
      ''
    ));
    const fx = buildProtectedFixture({ taskShort: 'mo5', toolSource: mutSrc });
    try {
      const TOOL = fx.requireTool();
      const req = approveProtected(fx, TOOL);
      fs.writeFileSync(path.join(fx.manifestDir, 'cand.js'), 'module.exports = 2; // edited after approval\n');
      const r = TOOL.runProtectedCommit({ cwd: fx.slotA, task: fx.task });
      assert.strictEqual(r.ok, true, 'mutant should no longer refuse the edited candidate: ' + JSON.stringify(r));
      assert.strictEqual(G(['rev-parse', 'HEAD^{tree}'], fx.slotA).trim(), req.tree, 'commit-tree still committed exactly the approved tree');
      assert.strictEqual(fs.readFileSync(path.join(fx.slotA, fx.target), 'utf8').replace(/\r\n/g, '\n'), CAND_V1, 'the slot holds the approved content, not the edited candidate');
    } finally { fx.cleanup(); }
  });
  test('MUT-OAG-6: G3 blob-equality check dropped -> a protected file changed after approval passes L8 (caught)', () => {
    const mutSrc = withMutantSource((s) => s.replace(
      "    if (tipBlobR.status !== 0 || String(tipBlobR.stdout).trim() !== approval.blob) {\r\n      return { ok: false, reason: 'protected path not PROTECTED-approved: Owner LAND (' + f + ', changed after approval)' };\r\n    }\r\n",
      ''
    ));
    const fx = buildProtectedFixture({ taskShort: 'mo6', toolSource: mutSrc, target: 'AGENTS.md', files: [{ target: 'AGENTS.md', source: 'a.md', content: AGENTS_V2 }] });
    try {
      const TOOL = fx.requireTool();
      approveProtected(fx, TOOL);
      assert.strictEqual(TOOL.runProtectedCommit({ cwd: fx.slotA, task: fx.task }).ok, true);
      fs.writeFileSync(path.join(fx.slotA, 'AGENTS.md'), AGENTS_V2 + 'post-approval edit\n');
      G(['add', 'AGENTS.md'], fx.slotA);
      G(['commit', '-q', '-m', 'edit after approval'], fx.slotA);
      const lr = TOOL.runLandRequest({ cwd: fx.slotA, task: fx.task });
      assert.strictEqual(lr.ok, true, 'mutant should have let a post-approval change pass L8: ' + JSON.stringify(lr));
    } finally { fx.cleanup(); }
  });
  test('MUT-OAG-8: compare-and-swap dropped (update-ref without the old value) -> a ref advanced by another writer is silently overwritten and the commit succeeds (caught)', () => {
    const mutSrc = withMutantSource((s) => s.replace(
      "    const urR = slotGit(['update-ref', 'refs/heads/' + pre.task, newHead, pre.headOid]);\r\n",
      "    const urR = slotGit(['update-ref', 'refs/heads/' + pre.task, newHead]);\r\n"
    ));
    const fx = buildProtectedFixture({ taskShort: 'mo8', toolSource: mutSrc });
    try {
      const TOOL = fx.requireTool();
      approveProtected(fx, TOOL);
      const shim = makeLoggingGitShim(fx.tmp, { advanceRefOnUpdateRef: true });
      const r = withShim(shim, () => TOOL.runProtectedCommit({ cwd: fx.slotA, task: fx.task, gitExec: shim.gitExec }));
      assert.strictEqual(r.ok, true, 'mutant should have overwritten the moved ref: ' + JSON.stringify(r));
      assert.strictEqual(G(['rev-parse', 'HEAD^'], fx.slotA).trim(), fx.tip, 'the other writer\'s commit was silently orphaned');
    } finally { fx.cleanup(); }
  });
})();

// ── summary ──────────────────────────────────────────────────────────────────────────────
meter.report(process.stdout, 'pt-land');
if (failed > 0) {
  for (const f of failures) process.stdout.write('  FAIL  ' + f + '\n');
  process.stdout.write('\nOFFLINE VALIDATION (pt-land): FAIL (' + failed + '/' + (passed + failed) + ')\n');
  process.exit(1);
} else {
  process.stdout.write('  PASS  ' + passed + ' pt-land assertion(s) passed\n');
  process.exit(0);
}
