'use strict';

/*
 * Auto-mode hardening offline QA (work/auto-mode-hardening/brief.md §6, AH-1..AH-10).
 *
 * Pure Node, no network, no git, no netlify. Table-driven against the REAL decide() and the
 * REAL CLI (spawned with process.execPath) in .claude/hooks/pretooluse-guard.js. Every class
 * carries a planted negative; production-source mutants are written to an os.tmpdir() scratch
 * dir and must each flip at least one assertion. AH-8 is a static check of the real
 * .claude/settings.json (override with AH_SETTINGS_PATH); it is only green once the Owner has
 * applied brief §5 — the applied-fixture control proves it can pass, the mutants prove it can fail.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const HOOK_PATH = process.env.AH_HOOK_PATH
  ? path.resolve(process.env.AH_HOOK_PATH)
  : path.join(ROOT, '.claude', 'hooks', 'pretooluse-guard.js');
const SETTINGS_PATH = process.env.AH_SETTINGS_PATH
  ? path.resolve(process.env.AH_SETTINGS_PATH)
  : path.join(ROOT, '.claude', 'settings.json');

let failures = 0;
let asserts = 0;
function check(name, cond) {
  asserts += 1;
  if (!cond) {
    failures += 1;
    console.log('  FAIL  ' + name);
  }
}

// ── cwd fixtures (R1) ───────────────────────────────────────────────────────────────────
const SLOT_A = 'C:\\Users\\Owner\\Documents\\Project\\pt-wt-worker-a';
const SLOT_B_SUB = 'C:\\Users\\Owner\\Documents\\Project\\pt-wt-worker-b\\qa';
const SLOT_A_POSIX = '/c/Users/Owner/Documents/Project/pt-wt-worker-a';
const SLOT_A_UPPER = 'c:/USERS/owner/documents/project/PT-WT-WORKER-A/';
const MAIN = 'C:\\Users\\Owner\\Documents\\Project\\portfolio-tracker';
const DECOY_OLD = 'C:\\Users\\Owner\\Documents\\Project\\pt-wt-worker-a-old';
const DECOY_C = 'C:\\Users\\Owner\\Documents\\Project\\pt-wt-worker-c';

let guard = null;
let loadError = null;
try {
  guard = require(HOOK_PATH);
} catch (e) {
  loadError = e;
}
check('hook module loads and exports decide()/runCli()',
  guard && typeof guard.decide === 'function' && typeof guard.runCli === 'function');
if (loadError) console.log('  (load error: ' + loadError.message + ')');

// r9 commit gate: table rows never touch the real fs / git, they read this fixed task branch and empty staged set (AH-16 covers the real readers)
const slotRootFromCwd = (cwd) => { const m = /^(.*?\/pt-wt-worker-[ab])(?:\/|$)/i.exec(String(cwd).replace(/\\/g, '/').replace(/\/+/g, '/')); return m ? m[1] : undefined; };
// r10: hermetic stubs for the new commit-gate / reset-gate / file-tool deps so table rows never touch real git/fs.
const OK_CFG = () => ({ ok: true, bad: [] });
const OK_HOOKS = () => ({ ok: true, bad: [] });
const R10_STUBS = { protectedConfigState: OK_CFG, hooksState: OK_HOOKS, pathExists: () => false, resolveFileToolTarget: (cwd, raw) => String(raw) };
const TEST_DEPS = Object.assign({ readHeadRef: () => 'ref: refs/heads/task/x', stagedPaths: () => [], repoRoot: slotRootFromCwd }, R10_STUBS);
function dec(mod, command, cwd, tool) {
  try {
    return mod.decide({ tool_name: tool || 'Bash', tool_input: { command }, cwd: cwd === undefined ? SLOT_A : cwd }, TEST_DEPS);
  } catch (e) {
    return { decision: 'THROW', reason: String(e && e.message) };
  }
}
function d(command, cwd, tool) {
  if (!guard) return { decision: 'NOMODULE', reason: '' };
  return dec(guard, command, cwd, tool);
}
function expectAll(label, rows, cwd, expected, tool) {
  for (const cmd of rows) {
    const r = d(cmd, cwd, tool);
    check(label + ' [' + (tool || 'Bash') + ' ' + (cwd === MAIN ? 'main' : 'slot') + '] ' + cmd + ' -> ' + expected + ' (got ' + r.decision + ')',
      r.decision === expected);
  }
}

// ── AH-1 allowed ─────────────────────────────────────────────────────────────────────────
const ALLOWED = [
  'npm run qa:offline',
  'npm run test:x',
  'node qa/x_offline.js',
  'codex review --uncommitted',
  'git status --short --branch',
  'git log --oneline -3',
  'git log --oneline origin/main -1',
  'git diff --stat',
  'git diff --cached --stat',
  'git branch --show-current',
  'git merge-base --is-ancestor a b',
  'git worktree list',
  'git -C ../x status --short',
  'git switch -c task/x 91e5c03',
  'git checkout -b task/x main',
  'git clean -n',
  'git reset --soft HEAD~1',
  'echo "git push"',
  'echo git push --force',
  'git diff 5ad0a5f -- . \':(exclude)work/\'',
  'npm run qa:offline > work/x/qa.log 2>&1',
  'npm run qa:offline 2>&1 | tail -5',
  'node qa/x_offline.js &> /dev/null',
  'cat x >> work/x/qa.log',
  'node -e "console.log(1)"',
  'netlify status',
  'netlify sites:list',
  'netlify env:list',
  'netlify env:get X',
  'netlify logs',
  'codex exec "review" < /dev/null'
];
expectAll('AH-1', ALLOWED, SLOT_A, 'allow');
expectAll('AH-1', ALLOWED, MAIN, 'allow');
check('AH-1 git commit -m "doc: explain git push": the message text is not a push — slot allow (plain task-branch commit), main deny with R3c (never the push reason)',
  d('git commit -m "doc: explain git push"', SLOT_A).decision === 'allow' &&
  d('git commit -m "doc: explain git push"', MAIN).decision === 'deny' && /R3c/.test(d('git commit -m "doc: explain git push"', MAIN).reason) && !/push manually/.test(d('git commit -m "doc: explain git push"', MAIN).reason));
check('AH-1 heredoc commit message containing "git push" and ")" is not classified',
  d('git commit -m "$(cat <<\'EOF\'\nfix (thing)\ngit push --force\nEOF\n)"', SLOT_A).decision === 'allow');
check('AH-1 non-Bash/PowerShell tool -> allow', dec(guard || { decide: () => ({ decision: 'NOMODULE' }) }, 'x', SLOT_A, 'Read').decision === 'allow');
check('AH-1 every decision has a string reason',
  ['git push', 'git status', 'git commit -m x'].every((c) => typeof d(c).reason === 'string'));

// ── AH-2 denied (Bash) — destructive: deny in slot AND main ─────────────────────────────
const DESTRUCTIVE = [
  'git push --force',
  'git push -f origin x',
  'git push --force-with-lease',
  'git push --mirror',
  'git push --delete origin x',
  'git push -d origin x',
  'git push -uf origin x',
  'git -C x push -f',
  'git -c k=v push --force-with-lease',
  'git push origin +main',
  'git push origin :branch-dev',
  '/usr/bin/git push --force',
  '"C:\\Program Files\\Git\\bin\\git.exe" push --force',
  'git --no-pager -C x --git-dir=y push -f',
  'git reset --hard',
  'git reset --hard HEAD~1',
  'git -C x reset --hard',
  'git clean -f',
  'git clean -fd',
  'git clean -xdf',
  'git clean --force',
  'git branch -d t',
  'git branch -D t',
  'git branch --delete t',
  'git update-ref -d refs/heads/x',
  'git checkout main',
  'git checkout -f main',
  'git checkout -B main',
  'git checkout origin/main',
  'git switch main',
  'git switch -C main',
  'git -C x checkout main',
  'git worktree remove --force x',
  'git -c alias.p="!git push" p'
];
expectAll('AH-2', DESTRUCTIVE, SLOT_A, 'deny');
expectAll('AH-2', DESTRUCTIVE, MAIN, 'deny');

// AH-2b integration: merge / rebase are denied in every session (R3m, see AH-15) — see also AH-7. Push is NOT in this table: git push is denied in every session (AH-11).
const PUSHES = ['git push', 'git push origin task/x', 'git push --dry-run'];
const MERGE_REBASE = ['git merge x', 'git -C x merge y', 'git rebase branch-dev', 'git -C x rebase y'];
const INTEGRATION = PUSHES.concat(MERGE_REBASE); // AH-6 PowerShell rows: every git row is denied there
expectAll('AH-2b', MERGE_REBASE, SLOT_A, 'deny');
expectAll('AH-2b', MERGE_REBASE, MAIN, 'deny');
expectAll('AH-2b', PUSHES, SLOT_A, 'deny');
expectAll('AH-2b', PUSHES, MAIN, 'deny');

// AH-2c netlify writes: slot deny / main ask
const NETLIFY = ['netlify deploy', 'netlify deploy --prod', 'netlify env:set A b', 'netlify env:unset A', 'netlify env:clone', 'netlify env:import x',
  'netlify sites:create', 'netlify sites:delete x', 'netlify api x', 'netlify link', 'netlify unlink', 'npx netlify deploy', 'npx -y netlify env:set A b'];
expectAll('AH-2c', NETLIFY, SLOT_A, 'deny');
expectAll('AH-2c', NETLIFY, MAIN, 'ask');

// ── AH-3 wrappers -> inner op's class ───────────────────────────────────────────────────
const b64 = (s) => Buffer.from(s, 'utf16le').toString('base64');
const WRAP_INTEGRATION = [
  'bash -c "git push"',
  'sh -c \'git merge x\'',
  'cmd /c git push',
  'cmd.exe /c "git push"',
  'powershell -Command "git push"',
  'pwsh -NoProfile -EncodedCommand ' + b64('git push'),
  'eval "git push"',
  'env A=1 git push',
  'a && git push',
  'a; git push',
  'a | git push',
  'a || git push',
  'echo $(git push)',
  'echo `git push`',
  'echo "$(git push)"',
  '(git push)',
  '{ git push; }',
  'xargs git push',
  'echo x | xargs -n 1 git push',
  'nohup git push',
  'time git push',
  'if true; then git push; fi',
  'for x in a; do git push; done',
  'bash -c "bash -c \\"git push\\""',
  'iex "git push"',
  'Invoke-Expression "git push"',
  'Start-Process git -ArgumentList "push"',
  '& git push',
  'git.exe push',
  'git push\ngit status'
];
expectAll('AH-3', WRAP_INTEGRATION, SLOT_A, 'deny');
// Push wrappers are denied in the main checkout too (AH-11); so is the one merge wrapper (R3m, AH-15).
const WRAP_MERGE = WRAP_INTEGRATION.filter((c) => /merge/.test(c));
const WRAP_PUSH = WRAP_INTEGRATION.filter((c) => !/merge/.test(c)); // every other row wraps a push (incl. the base64 -EncodedCommand row)
check('AH-3 wrapper tables partition WRAP_INTEGRATION (a merge wrapper and push wrappers both present)',
  WRAP_MERGE.length >= 1 && WRAP_PUSH.length >= 1 && WRAP_MERGE.length + WRAP_PUSH.length === WRAP_INTEGRATION.length);
expectAll('AH-3', WRAP_MERGE, MAIN, 'deny');
expectAll('AH-3', WRAP_PUSH, MAIN, 'deny');
const WRAP_DESTRUCTIVE = ['cmd.exe /c "git reset --hard"', 'bash -c "git push -f"', 'pwsh -EncodedCommand ' + b64('git clean -fd'), 'eval "git branch -D x"'];
expectAll('AH-3', WRAP_DESTRUCTIVE, SLOT_A, 'deny');
expectAll('AH-3', WRAP_DESTRUCTIVE, MAIN, 'deny');
check('AH-3 wrapper around a benign command stays allow',
  d('bash -c "git status"', SLOT_A).decision === 'allow' && d('cmd /c git log --oneline -3', SLOT_A).decision === 'allow' &&
  d('env A=1 git status', SLOT_A).decision === 'allow' && d('echo $(git status)', SLOT_A).decision === 'allow');
// AH-3b unresolvable -> deny (both cwds)
const UNRESOLVABLE = ['echo "unbalanced', 'echo \'unbalanced', 'echo $(git status', 'pwsh -EncodedCommand !!notbase64!!', 'powershell -EncodedCommand',
  'bash -c', 'bash -c "$(' + '$('.repeat(20) + ')'.repeat(21) + ')"'];
expectAll('AH-3b', UNRESOLVABLE, SLOT_A, 'deny');
expectAll('AH-3b', UNRESOLVABLE, MAIN, 'deny');

// ── AH-4 interpreter spawn ──────────────────────────────────────────────────────────────
const INTERP_DENY = [
  'node -e "require(\'child_process\').execSync(\'git push\')"',
  'node --eval "require(\'child_process\').spawnSync(\'git\',[\'push\'])"',
  'node -p "require(\'child_process\').execSync(\'netlify deploy\')"',
  'python3 -c "import subprocess;subprocess.run([\'git\',\'push\'])"',
  'python -c "import os;os.system(\'git push\')"',
  'py -c "import subprocess;subprocess.Popen([\'git\',\'push\'])"',
  'perl -e "system(\'git push\')"',
  'ruby -e "system(\'git push\')"',
  'deno eval "new Deno.Command(\'git\',{args:[\'push\']}).spawn()"',
  'node -e "const {exec}=require(\'child_process\');exec(\'netlify api x\')"'
];
expectAll('AH-4', INTERP_DENY, SLOT_A, 'deny');
expectAll('AH-4', INTERP_DENY, MAIN, 'deny');
expectAll('AH-4', ['node -e "console.log(1)"', 'python3 -c "print(1)"', 'node -e "require(\'child_process\').execSync(\'ls\')"'], SLOT_A, 'allow');

// ── AH-5 protected writes: slot deny / main ask; other paths allow ──────────────────────
const PROTECTED_WRITES = [
  'echo x > package.json',
  'echo x >> package-lock.json',
  'echo x > CLAUDE.md',
  'echo x > ./AGENTS.md',
  'echo x > .gitignore',
  'echo x > netlify.toml',
  'echo x > qa/run-offline.js',
  'echo x > work/foo/brief.md',
  'echo x > .claude/settings.json',
  'echo x > .claude/settings.local.json',
  'echo x > .claude/hooks/pretooluse-guard.js',
  'echo x > .claude/rules/qa-suites.md',
  'echo x > C:\\Users\\Owner\\Documents\\Project\\pt-wt-worker-a\\.claude\\settings.json',
  'echo x &> package.json',
  'echo x | tee package.json',
  'echo x | tee -a AGENTS.md',
  'sed -i s/a/b/ AGENTS.md',
  'sed -i.bak s/a/b/ CLAUDE.md',
  'sed --in-place s/a/b/ .gitignore',
  'cp x package.json',
  'mv x CLAUDE.md',
  'cp -t .claude/hooks x',
  'Copy-Item x -Destination .claude\\settings.json',
  'Move-Item x CLAUDE.md',
  'Set-Content CLAUDE.md x',
  'Set-Content -Path .claude/settings.json -Value x',
  'Add-Content AGENTS.md x',
  'Out-File -FilePath package.json',
  'echo x | Out-File package-lock.json',
  'New-Item .claude/hooks/x.js',
  'node -e "require(\'fs\').writeFileSync(\'.claude/settings.json\',\'{}\')"',
  'node -e "require(\'fs\').appendFileSync(\'CLAUDE.md\',\'x\')"',
  'node -e "require(\'fs\').renameSync(\'a\',\'AGENTS.md\')"',
  'node -e "require(\'fs\').unlinkSync(\'.claude/hooks/pretooluse-guard.js\')"',
  'node -e "require(\'fs\').copyFileSync(\'a\',\'package.json\')"',
  'python3 -c "open(\'.gitignore\',\'w\').write(\'x\')"',
  'python3 -c "import pathlib;pathlib.Path(\'netlify.toml\').write_text(\'x\')"',
  'bash -c "echo x > package.json"'
];
expectAll('AH-5', PROTECTED_WRITES, SLOT_A, 'deny');
expectAll('AH-5', PROTECTED_WRITES, MAIN, 'ask');
const BENIGN_WRITES = [
  'echo x > work/foo/plan.md',
  'echo x > work/foo/review.md',
  'echo x >> work/foo/qa.log',
  'echo x > qa/new_offline.js',
  'echo x > /dev/null',
  'echo x | tee work/foo/codex.md',
  'sed -i s/a/b/ qa/x_offline.js',
  'cp package.json /tmp/package.json.bak',
  'cp x package.json.bak',
  'cat package.json',
  'cat AGENTS.md CLAUDE.md > /tmp/all.txt',
  'Set-Content work/foo/plan.md x',
  'Get-Content package.json',
  'node -e "require(\'fs\').writeFileSync(\'work/foo/plan.md\',\'x\')"',
  'node -e "console.log(require(\'fs\').readFileSync(\'package.json\',\'utf8\'))"',
  'echo "see .claude/settings.json" > work/foo/plan.md',
  'echo "AGENTS.md" > work/foo/note.txt'
];
expectAll('AH-5 (other paths)', BENIGN_WRITES, SLOT_A, 'allow');
expectAll('AH-5 (other paths)', BENIGN_WRITES, MAIN, 'allow');

// ── AH-6 PowerShell parity ──────────────────────────────────────────────────────────────
// R2: any git program through the PowerShell tool is denied by the hook (both cwds), so every git row is deny.
expectAll('AH-6', DESTRUCTIVE, SLOT_A, 'deny', 'PowerShell');
expectAll('AH-6', DESTRUCTIVE, MAIN, 'deny', 'PowerShell');
expectAll('AH-6', INTEGRATION, SLOT_A, 'deny', 'PowerShell');
expectAll('AH-6', INTEGRATION, MAIN, 'deny', 'PowerShell');
expectAll('AH-6', NETLIFY, SLOT_A, 'deny', 'PowerShell');
expectAll('AH-6', PROTECTED_WRITES, SLOT_A, 'deny', 'PowerShell');
expectAll('AH-6', PROTECTED_WRITES, MAIN, 'ask', 'PowerShell');
expectAll('AH-6', BENIGN_WRITES, MAIN, 'allow', 'PowerShell'); // main checkout: governed, not blanket-denied
expectAll('AH-6', BENIGN_WRITES, SLOT_A, 'deny', 'PowerShell'); // Worker slot: PowerShell tool denied outright (R2)
// R2 planted negatives: read-only git and every executable-path form is denied by the HOOK (not by settings prefix rules).
const PS_GIT = [
  'git status', 'git log --oneline -3', 'git.exe status', 'GIT.EXE status',
  "& 'C:/Program Files/Git/cmd/git.exe' status",
  "& 'C:\\Program Files\\Git\\cmd\\git.exe' status",
  '"C:\\Program Files\\Git\\cmd\\git.exe" status',
  "'C:/Program Files/Git/cmd/git.exe' status",
  '& git status', 'git -C x log', 'env A=1 git status', 'a; git status',
  'git commit -m x', 'git merge-base a b', 'git worktree list', 'Get-ChildItem | ForEach-Object { git status }'
];
for (const cwd of [SLOT_A, MAIN]) {
  expectAll('AH-6 R2', PS_GIT, cwd, 'deny', 'PowerShell');
  for (const cmd of PS_GIT) {
    const r = d(cmd, cwd, 'PowerShell');
    check('AH-6 R2 reason cites R2, not R1: ' + cmd, /R2/.test(r.reason) && !/R1/.test(r.reason));
  }
}
// Bash controls: the R2 marker must not leak into the Bash tool.
expectAll('AH-6 R2 Bash control', ['git status --short --branch', 'git log --oneline -3', 'git.exe status', "'C:/Program Files/Git/cmd/git.exe' status"], SLOT_A, 'allow', 'Bash');
expectAll('AH-6 R2 Bash control', ['git status'], MAIN, 'allow', 'Bash');
check('AH-6 R2 Bash git push: slot deny with R1, main deny (push manually), slot commit allow (r9 gate)',
  d('git push', SLOT_A, 'Bash').decision === 'deny' && /R1/.test(d('git push', SLOT_A, 'Bash').reason) &&
  d('git push', MAIN, 'Bash').decision === 'deny' && /push manually/.test(d('git push', MAIN, 'Bash').reason) &&
  d('git commit -m x', SLOT_A, 'Bash').decision === 'allow');
// Non-git PowerShell: governed in the main checkout (allow), but the whole PowerShell tool is denied in Worker slots.
expectAll('AH-6 R2 non-git PowerShell', ['Get-ChildItem', 'echo "git push"', 'Write-Output git'], MAIN, 'allow', 'PowerShell');
expectAll('AH-6 R2 non-git PowerShell', ['Get-ChildItem', 'echo "git push"', 'Write-Output git'], SLOT_A, 'deny', 'PowerShell');

// AH-6b: Worker-slot PowerShell is a blanket deny (closes alias / variable / function indirection to git).
const PS_SLOT_ALL = [
  'Get-ChildItem', 'git status', 'git push', 'Set-Alias g git; g status', 'New-Alias g git.exe; g push', 'sal g git; g status',
  "$G='git'; & $G push", 'function g { git push }; g', 'Write-Output x', 'npm run qa:offline', ''
];
for (const slot of [SLOT_A, SLOT_B_SUB, SLOT_A_POSIX, SLOT_A_UPPER]) {
  for (const cmd of PS_SLOT_ALL) {
    const r = d(cmd, slot, 'PowerShell');
    check('AH-6b slot PowerShell blanket deny [' + slot + '] ' + JSON.stringify(cmd) + ' (got ' + r.decision + ')',
      r.decision === 'deny' && /R2/.test(r.reason) && !/R1/.test(r.reason));
  }
}
check('AH-6b slot PowerShell with missing cwd is denied (strict slot)',
  guard && guard.decide({ tool_name: 'PowerShell', tool_input: { command: 'Get-ChildItem' } }).decision === 'deny');
// Main / non-slot PowerShell is NOT blanket-denied and keeps its governed behaviour.
for (const notSlot of [MAIN, DECOY_OLD, DECOY_C]) {
  check('AH-6b non-slot PowerShell not blanket-denied [' + notSlot + ']: Get-ChildItem allow, git status deny (R2), protected write ask',
    d('Get-ChildItem', notSlot, 'PowerShell').decision === 'allow' && d('git status', notSlot, 'PowerShell').decision === 'deny' &&
    d('Set-Content package.json x', notSlot, 'PowerShell').decision === 'ask');
}
// Bash in a slot is untouched by the PowerShell blanket deny.
check('AH-6b slot Bash unchanged: status allow, push deny R1, commit allow (r9 gate), qa:offline allow',
  d('git status', SLOT_A, 'Bash').decision === 'allow' && d('git push', SLOT_A, 'Bash').decision === 'deny' && /R1/.test(d('git push', SLOT_A, 'Bash').reason) &&
  d('git commit -m x', SLOT_A, 'Bash').decision === 'allow' && d('npm run qa:offline', SLOT_A, 'Bash').decision === 'allow');
check('AH-6 PowerShell &-call and -EncodedCommand forms',
  d('& "C:\\Program Files\\Git\\bin\\git.exe" push', SLOT_A, 'PowerShell').decision === 'deny' &&
  d('pwsh -EncodedCommand ' + b64('git push'), SLOT_A, 'PowerShell').decision === 'deny' &&
  d('Set-Location x; git push', SLOT_A, 'PowerShell').decision === 'deny' &&
  d('Get-ChildItem | ForEach-Object { git push }', SLOT_A, 'PowerShell').decision === 'deny' &&
  d('$x = @\'\nit\'s "fine"\n\'@\ngit status', SLOT_A, 'PowerShell').decision === 'deny');

// ── AH-7 cwd (R1) ───────────────────────────────────────────────────────────────────────
for (const slot of [SLOT_A, SLOT_B_SUB, SLOT_A_POSIX, SLOT_A_UPPER]) {
  check('AH-7 slot cwd ' + slot + ': push deny, merge deny, rebase deny, protected write deny',
    d('git push', slot).decision === 'deny' && d('git merge x', slot).decision === 'deny' &&
    d('git rebase x', slot).decision === 'deny' && d('echo x > package.json', slot).decision === 'deny');
}
for (const notSlot of [MAIN, DECOY_OLD, DECOY_C, 'C:\\somewhere\\else']) {
  check('AH-7 non-slot cwd ' + notSlot + ': push deny (every session), merge deny, rebase deny (R3m), protected write ask',
    d('git push', notSlot).decision === 'deny' && d('git merge x', notSlot).decision === 'deny' &&
    d('git rebase x', notSlot).decision === 'deny' && d('echo x > package.json', notSlot).decision === 'ask');
  check('AH-7 non-slot cwd ' + notSlot + ': destructive still deny',
    d('git push -f', notSlot).decision === 'deny' && d('git reset --hard', notSlot).decision === 'deny');
}
check('AH-7 missing cwd fails strict (treated as a Worker slot)',
  guard && guard.decide({ tool_name: 'Bash', tool_input: { command: 'git push' } }).decision === 'deny');

// ── AH-11 push is denied in EVERY Claude Code session (Owner ruling: the ask gate is not a reliable boundary) ──
const CANON_BRANCH_DEV = MAIN; // canonical / branch-dev / main checkout are all non-slot cwds
const PUSH_FORMS = PUSHES.concat(['git -C x push', 'git -c k=v push origin x', '/usr/bin/git push', "'C:/Program Files/Git/cmd/git.exe' push",
  'git push -u origin task/x', 'git push origin main', 'git push origin branch-dev', 'git commit -m x && git push']);
for (const cwd of [SLOT_A, SLOT_B_SUB, SLOT_A_POSIX, SLOT_A_UPPER, CANON_BRANCH_DEV, DECOY_OLD, DECOY_C, 'C:\\somewhere\\else', undefined]) {
  for (const cmd of PUSH_FORMS) {
    check('AH-11 [Bash ' + String(cwd) + '] ' + cmd + ' -> deny', d(cmd, cwd === undefined ? '' : cwd).decision === 'deny');
  }
}
check('AH-11 canonical git push --dry-run -> deny (the Owner ruling case)', d('git push --dry-run', CANON_BRANCH_DEV).decision === 'deny');
check('AH-11 Worker git push -> deny', d('git push', SLOT_A).decision === 'deny');
check('AH-11 main git push -> deny', d('git push', MAIN).decision === 'deny');
check('AH-11 non-slot reason says to push manually outside Claude Code', /push manually/.test(d('git push', MAIN).reason));
for (const cmd of ['git push', 'git push --dry-run', "& 'C:/Program Files/Git/cmd/git.exe' push", 'powershell -Command "git push"']) {
  check('AH-11 [PowerShell main] ' + cmd + ' -> deny', d(cmd, MAIN, 'PowerShell').decision === 'deny');
}
// Controls: only push moved here. Commit stays ASK, merge/rebase are denied everywhere (R3m, AH-15), read-only git stays allow.
for (const cwd of [SLOT_A, MAIN]) {
  check('AH-11 control [' + (cwd === MAIN ? 'main' : 'slot') + ']: git commit follows the r9 gate (slot: plain allow, -C form deny; main: deny) — incl. a message that mentions git push',
    cwd === MAIN
      ? d('git commit -m x', cwd).decision === 'deny' && d('git commit -m "doc: explain git push"', cwd).decision === 'deny' && d('git -C x commit -m y', cwd).decision === 'deny'
      : d('git commit -m x', cwd).decision === 'allow' && d('git commit -m "doc: explain git push"', cwd).decision === 'allow' && d('git -C x commit -m y', cwd).decision === 'deny');
  check('AH-11 control [' + (cwd === MAIN ? 'main' : 'slot') + ']: read-only git stays allow',
    ['git status --short --branch', 'git log --oneline -3', 'git diff --stat', 'git merge-base a b', 'git worktree list', 'git rev-parse HEAD', 'git show HEAD']
      .every((c) => d(c, cwd).decision === 'allow'));
  check('AH-11 control [' + (cwd === MAIN ? 'main' : 'slot') + ']: echoing "git push" is not a push',
    d('echo "git push"', cwd).decision === 'allow');
}
check('AH-11 control: merge/rebase are deny in slot and main (R3m)',
  d('git merge x', SLOT_A).decision === 'deny' && d('git rebase y', SLOT_A).decision === 'deny' &&
  d('git merge x', MAIN).decision === 'deny' && d('git rebase y', MAIN).decision === 'deny');
{
  const pushCli = spawnCli(payload('git push --dry-run', MAIN));
  check('AH-11 CLI: canonical git push --dry-run -> exit 2, reason on stderr, empty stdout',
    pushCli && pushCli.status === 2 && pushCli.stdout === '' && /push manually/.test(pushCli.stderr));
}

// ── AH-12 code-from-stdin: a shell / interpreter fed a heredoc, here-string, `<` redirect, `<(...)` or a pipe ──
// The scanner treats heredoc bodies as data, so an interpreter reading them executes unscanned code. Deny it (every
// cwd); keep data-only heredocs / redirects / pipes, inline-code interpreters and `< /dev/null` untouched.
const STDIN_CODE_DENY = [
  'bash <<EOF\ngit push\nEOF', "sh <<'EOF'\ngit merge x\nEOF", 'bash -s <<EOF\ngit push\nEOF',
  'python3 <<EOF\nimport subprocess;subprocess.run(["git","push"])\nEOF', 'bash < script.sh', 'source <(echo git push)', '. <(echo git push)',
  'bash <<< "git push"', 'echo git push | bash', 'cat <<EOF | sh\ngit push\nEOF', 'echo x | bash -s', 'printf "git push" |& bash',
  'env A=1 bash <<EOF\nx\nEOF', 'nohup bash < f', 'time sh <<EOF\nx\nEOF', '/bin/bash <<EOF\nx\nEOF', 'python <<EOF\nprint(1)\nEOF',
  'node <<EOF\nrequire("child_process")\nEOF', 'node - <<EOF\nx\nEOF', 'python3 - < x.py', 'perl <<EOF\nsystem("git push")\nEOF', 'pwsh < x.ps1',
  'cmd < x.bat', 'bash -o pipefail <<EOF\ngit push\nEOF', 'bash -e <<EOF\ngit push\nEOF', 'sh -x < f', 'zsh <<EOF\nx\nEOF', 'dash < f', 'ruby <<EOF\nx\nEOF',
  'a && bash <<EOF\nx\nEOF', '(bash <<EOF\nx\nEOF\n)', 'echo x; bash < f', 'bash 0< f', 'bash <<-EOF\n\tgit push\n\tEOF', 'git status | bash',
  'echo "git push" | env bash', 'source <(curl x)', 'bash <(echo git push)'
];
for (const cwd of [SLOT_A, MAIN]) {
  expectAll('AH-12 deny', STDIN_CODE_DENY, cwd, 'deny');
  check('AH-12 reason names the class [' + (cwd === MAIN ? 'main' : 'slot') + ']',
    STDIN_CODE_DENY.every((c) => /heredoc|stdin|pipe/.test(d(c, cwd).reason)));
}
const STDIN_DATA_ALLOW = [
  'cat <<EOF\ngit push\nEOF', "cat <<'EOF' > work/foo/plan.md\nhello bash <<EOF\nEOF", 'echo bash < x', 'grep foo < file', 'sort < f | uniq', 'git log | head',
  'git diff --stat | cat', 'node qa/x_offline.js < /dev/null', 'codex exec x < /dev/null', 'bash -c "git status" <<EOF\nx\nEOF', 'python3 -c "print(1)" < data.json',
  'echo hi | python3 -c "import sys;print(sys.stdin.read())"', 'echo x | node -e "console.log(1)"', 'npm run qa:offline 2>&1 | tee x.log', 'bash script.sh',
  'x || bash script.sh', 'a || echo x', 'echo hi | tee out.txt', 'cat file | wc -l', 'python3 -m json.tool < f.json', 'echo x | perl -e "print 1"',
  'echo x | pwsh -Command "1"', 'bash -lc "git status" < /dev/null', 'cat <<EOF\nbash\nEOF', 'echo "bash <<EOF"', 'echo git push | cat'
];
for (const cwd of [SLOT_A, MAIN]) expectAll('AH-12 data-only stays allow', STDIN_DATA_ALLOW, cwd, 'allow');
const COMMIT_HEREDOCS = [
  'git commit -m "$(cat <<\'EOF\'\nfix: git push notes\nEOF\n)"',
  'git commit -m "$(cat <<\'EOF\'\nfeat: bash <<EOF handling\n\nsource <(x) and echo git push | bash are denied\nEOF\n)"',
  'git commit -m "docs: bash <<EOF and python3 < x"', "git commit -F - <<'EOF'\nmsg\nEOF"
];
expectAll('AH-12 commit-message heredoc text is data: slot task-branch commit allow', COMMIT_HEREDOCS, SLOT_A, 'allow');
expectAll('AH-12 commit-message heredoc text is data: main commit deny', COMMIT_HEREDOCS, MAIN, 'deny');
check('AH-12 main commit deny carries R3c (not the heredoc / stdin / push reason)', COMMIT_HEREDOCS.every((c) => /R3c/.test(d(c, MAIN).reason) && !/heredoc|stdin|pipe|push manually/.test(d(c, MAIN).reason)));
check('AH-12 PowerShell main: interpreter fed by redirect denied, plain pipeline allowed',
  d('powershell < x.ps1', MAIN, 'PowerShell').decision === 'deny' && d('Get-ChildItem | Sort-Object', MAIN, 'PowerShell').decision === 'allow');
check('AH-12 unbalanced heredoc delimiter into bash still fails closed', d('bash <<"EOF\nx', MAIN).decision === 'deny');
check('AH-12 R1 / R3g preserved: canonical push deny, slot push R1 suffix, slot PowerShell blanket deny, main commit deny (R3c)',
  d('git push --dry-run', MAIN).decision === 'deny' && /R1/.test(d('git push', SLOT_A).reason) &&
  d('Get-ChildItem', SLOT_A, 'PowerShell').decision === 'deny' && d('git commit -m x', MAIN).decision === 'deny');
{
  const heredocCli = spawnCli(payload('bash <<EOF\ngit push\nEOF', MAIN));
  check('AH-12 CLI: heredoc into bash -> exit 2, reason on stderr, empty stdout',
    heredocCli.status === 2 && heredocCli.stdout === '' && /heredoc/.test(heredocCli.stderr));
  const benignCli = spawnCli(payload('cat <<EOF\nx\nEOF', MAIN));
  check('AH-12 CLI: benign cat heredoc -> exit 0, no output', benignCli.status === 0 && benignCli.stdout === '' && benignCli.stderr === '');
}

// ── AH-13 stdin-fed state through groups / subshells / substitutions / compound commands / wrappers ──
// A pipe or a stdin redirect feeds the WHOLE group or compound; a shell / interpreter inside it reads that text.
const GROUP_STDIN_DENY = [
  "printf 'git push\\n' | (bash)", "printf 'git push\\n' | { bash; }", 'echo x | ( bash )', 'echo x | (cd /tmp; bash)', 'echo x | { cd /tmp; bash; }', 'echo x | (bash) 2>&1',
  'echo x | echo $(bash)', 'echo x | echo `bash`', 'echo x | (echo a; (bash))', 'echo x | ( { bash; } )', 'echo x | (python3)', 'echo x | { node; }', 'echo x | (sh -x)',
  '(bash) < script.sh', '{ bash; } < script.sh', '(bash) <<EOF\ngit push\nEOF', '{ bash; } <<< "git push"', '{ bash; } < <(echo git push)', '(python3) < x.py',
  'echo x | while read l; do bash; done', 'echo x | if true; then bash; fi', 'echo x | for a in 1; do bash; done', 'while read l; do bash; done < f',
  'for a in 1; do sh; done <<EOF\nx\nEOF', 'if true; then bash; fi < f', 'echo x | while true; do while true; do bash; done; done', 'echo x | while read l\ndo\n  bash\ndone',
  'echo x | until false; do bash; break; done', 'echo x | (env A=1 bash)', 'echo x | { nohup bash; }', 'echo x | (exec bash)', 'echo x | (sudo bash)',
  'echo x | sudo -u root bash', 'setsid bash < f', 'echo x | sudo -E -u root bash -s', 'stdbuf -o0 bash <<EOF\nx\nEOF'
];
const GROUP_STDIN_ALLOW = [
  'echo x | (cat)', 'echo x | { cat; }', 'echo x | (cd /tmp; ls)', 'git log | (head -1)', 'printf x | { read a; echo $a; }', '(cd x; git status)', '{ git status; }',
  'echo x | ( bash -c "echo hi" )', 'echo x | { node -e "console.log(1)"; }', '(bash script.sh)', '{ bash script.sh; }', '(bash) < /dev/null', '{ bash; } < /dev/null',
  'for a in 1 2; do bash script.sh; done', 'while true; do bash script.sh; done < /dev/null', 'for f in a b; do echo $f; done', 'echo x | while read l; do echo $l; done',
  'git log | while read l; do git show $l; done', 'cat f | while read l; do grep $l g; done', 'if true; then bash script.sh; fi', 'x || (bash script.sh)', 'a || { bash script.sh; }',
  // the fed state must not leak past the group / pipeline that owns it
  'echo x; (bash script.sh)', 'echo x | (cat); bash script.sh', 'echo x | cat; (bash script.sh)', 'echo x | { cat; }; bash script.sh', 'echo x | while read l; do echo $l; done; bash script.sh',
  'sudo ls', 'exec ls', 'timeout 5 ls', 'command -v bash', 'echo x | timeout 5 cat', 'echo x | sudo tee out.txt', 'echo x | xargs echo', 'if true; then echo a; fi | cat',
  // realistic Worker commands
  'git stash list | head', 'grep -r x . | sort | uniq -c | sort -rn | head', 'node -e "console.log(1)" | sort', 'find . -name x | xargs grep y', 'echo $(git rev-parse HEAD)',
  'ls | (head -3)', '{ echo a; echo b; } > work/foo/plan.md', 'cat > work/foo/plan.md <<EOF\nhello\nEOF', '(cd x && npm ci)', 'for f in qa/a_offline.js qa/b_offline.js; do node $f; done',
  'while read l; do echo $l; done < list.txt', 'npm run qa:offline 2>&1 | tee work/foo/qa.log', 'git log --oneline -3 | head -1', 'git status --short --branch | grep task',
  'echo x | (grep y)', 'echo x | { grep y; }', 'if [ -f x ]; then echo y; fi'
];
for (const cwd of [SLOT_A, MAIN]) {
  expectAll('AH-13 group/compound stdin deny', GROUP_STDIN_DENY, cwd, 'deny');
  expectAll('AH-13 group/compound benign stays allow', GROUP_STDIN_ALLOW, cwd, 'allow');
}
check('AH-13 tables are non-trivial and disjoint',
  GROUP_STDIN_DENY.length > 0 && GROUP_STDIN_ALLOW.length > 0 && GROUP_STDIN_DENY.every((c) => GROUP_STDIN_ALLOW.indexOf(c) === -1));
const COMMIT_FORM_TEXT = ['git commit -m "$(printf x | (cat))"', 'git commit -m "docs: printf x | (bash) is denied"', 'git commit -m "$(cat <<\'EOF\'\nfeat: { bash; } < f and echo x | (bash)\nEOF\n)"'];
expectAll('AH-13 commit text mentioning the forms is data: slot allow', COMMIT_FORM_TEXT, SLOT_A, 'allow');
expectAll('AH-13 commit text mentioning the forms is data: main deny (R3c)', COMMIT_FORM_TEXT, MAIN, 'deny');
check('AH-13 PowerShell main: group into powershell denied, plain pipeline allowed',
  d('echo x | (powershell)', MAIN, 'PowerShell').decision === 'deny' && d('Get-ChildItem | Sort-Object', MAIN, 'PowerShell').decision === 'allow');
check('AH-13 unbalanced group into bash still fails closed', d('echo x | (bash', MAIN).decision === 'deny' && d('echo x | { bash', MAIN).decision === 'deny');
{
  const groupCli = spawnCli(payload("printf 'git push\\n' | (bash)", MAIN));
  check('AH-13 CLI: printf | (bash) -> exit 2, reason on stderr, empty stdout',
    groupCli.status === 2 && groupCli.stdout === '' && /heredoc|stdin|pipe/.test(groupCli.stderr));
  const benignGroupCli = spawnCli(payload('echo x | (cat)', MAIN));
  check('AH-13 CLI: benign group pipeline -> exit 0, no output', benignGroupCli.status === 0 && benignGroupCli.stdout === '' && benignGroupCli.stderr === '');
}

// ── AH-14 `case ... in PATTERN) command;; esac`: the command shares a raw segment with the header / arm pattern ──
// Each row was classified as `case` / `PATTERN)` (so allowed) before the prefix stripping; the wrapped command must now
// get exactly the decision the plain command gets.
const CASE_PUSH_DENY = [
  'case x in x) git push;; esac', 'case x in a|b) git push;; esac', 'case x in a | b) git push;; esac', 'case x in a|b|c) git push;; esac', 'case x in (a) git push;; esac',
  'case x in "a b") git push;; esac', "case x in 'a b') git push;; esac", 'case x in *) git push;; esac', 'case "$1" in push) git push;; esac',
  'case x in a) echo hi;; b) git push;; esac', 'case x in a) echo hi;;\nb) git push;;\nesac', 'case x in\n a) git push;;\nesac', 'case x in\n a|b)\n  git push\n  ;;\nesac',
  '(case x in x) git push;; esac)', '$(case x in x) git push;; esac)', 'echo "$(case x in x) git push;; esac)"', 'if true; then case x in x) git push;; esac; fi',
  'for a in 1; do case $a in 1) git push;; esac; done', 'case x in a) case y in b) git push;; esac;; esac', 'case x in x) git push --dry-run;; esac',
  'case x in x) git -C y push;; esac', 'case x in x) /usr/bin/git push;; esac', 'case x in x) bash -c "git push";; esac', 'case x in x) env A=1 git push;; esac',
  'case x in x) git push ;; esac', 'case x in x) git push;esac', 'case x in x) git push\nesac', 'case x in x) git push;;\n*) echo;;\nesac'
];
for (const cwd of [SLOT_A, MAIN]) expectAll('AH-14 case-prefixed git push deny', CASE_PUSH_DENY, cwd, 'deny');
const CASE_CMD_PAIRS = ['git merge y', 'git rebase y', 'git reset --hard', 'git checkout main', 'netlify deploy', 'echo x > package.json', 'bash < f',
  'git status', 'git log --oneline -3', 'echo hi', 'npm run qa:offline'];
const CASE_FORMS = ['case x in x) CMD;; esac', 'case x in a|b) CMD;; esac', 'case x in a) echo;; b) CMD;; esac', 'case x in\n a) CMD;;\nesac', '(case x in x) CMD;; esac)'];
for (const cwd of [SLOT_A, MAIN]) for (const cmd of CASE_CMD_PAIRS) {
  const plain = d(cmd, cwd).decision;
  check('AH-14 case-wrapped == plain [' + (cwd === MAIN ? 'main' : 'slot') + '] ' + cmd + ' (plain ' + plain + ')',
    CASE_FORMS.every((form) => d(form.replace('CMD', cmd), cwd).decision === plain));
}
const CASE_ALLOW = [
  'case x in x) echo hi;; esac', 'case x in x) git status;; esac', 'case "$1" in a|b) ls;; *) echo none;; esac', 'case x in a) echo "a) b";; esac', 'case $(uname) in Linux) echo l;; esac',
  'case x in\n a) echo a;;\n *) echo b;;\nesac', 'for f in a; do case $f in a) echo a;; esac; done', 'echo "case x in x) git push;; esac"', "echo 'case x in a|b) git push;; esac'",
  'case x in x) npm run qa:offline;; esac', 'case x in x) git log --oneline -3;; esac', 'case x in x) ;; esac', 'case x in a) (cd /tmp; ls);; esac', 'case x in a) { echo a; };; esac',
  'case x in a) echo $(git rev-parse HEAD);; esac', 'echo x | case x in x) cat;; esac', 'case x in *.js) echo js;; *.ts) echo ts;; esac', 'case x in [a-z]*) echo l;; esac',
  '(case x in x) echo hi;; esac)', '$(case $(uname) in Linux) echo l;; esac)', 'echo $(case x in a|b) echo y;; esac)'
];
for (const cwd of [SLOT_A, MAIN]) expectAll('AH-14 benign case bodies stay allow', CASE_ALLOW, cwd, 'allow');
for (const cwd of [SLOT_A, MAIN]) expectAll('AH-14 multiline case: command on its own line unchanged',
  ['case x in x)\n git status\n;;\nesac'], cwd, 'allow');
check('AH-14 multiline case: command on its own line still classified (push deny, main commit deny with R3c)',
  d('case x in x)\n git push\n;;\nesac', MAIN).decision === 'deny' && d('case x in x)\n git commit -m y\n;;\nesac', MAIN).decision === 'deny' &&
  /R3c/.test(d('case x in x)\n git commit -m y\n;;\nesac', MAIN).reason));
const COMMIT_CASE_TEXT = ['git commit -m "case x in x) git push;; esac"', "git commit -m 'fix: case x in a|b) git push;; esac'", 'git commit -m "$(cat <<\'EOF\'\nfix: case x in a|b) git push;; esac\nEOF\n)"',
    'git commit -m "docs: (case x in x) git push;; esac)"', "git commit -F - <<'EOF'\ncase x in x) git push;; esac\nEOF"];
expectAll('AH-14 commit text containing case syntax is data: slot allow', COMMIT_CASE_TEXT, SLOT_A, 'allow');
expectAll('AH-14 commit text containing case syntax is data: main deny (R3c)', COMMIT_CASE_TEXT, MAIN, 'deny');
check('AH-14 fed state reaches a case body (pipe into a group holding a case)',
  d('echo x | case x in x) bash;; esac', MAIN).decision === 'deny' && d('echo x | (case x in x) bash;; esac)', MAIN).decision === 'deny');
check('AH-14 unbalanced case still fails closed', d('case x in x) git push;; "esac', MAIN).decision === 'deny' && d('(case x in x) git push', MAIN).decision === 'deny');
{
  const caseCli = spawnCli(payload('case x in a|b) git push;; esac', MAIN));
  check('AH-14 CLI: single-line case push -> exit 2, reason on stderr, empty stdout', caseCli.status === 2 && caseCli.stdout === '' && /push manually/.test(caseCli.stderr));
  const benignCaseCli = spawnCli(payload('case x in x) echo hi;; esac', MAIN));
  check('AH-14 CLI: benign case -> exit 0, no output', benignCaseCli.status === 0 && benignCaseCli.stdout === '' && benignCaseCli.stderr === '');
}

// ── AH-15 merge / rebase / pull are denied in EVERY Claude Code session (R3m; RM1 / RM2, hook r8) ──
// permissions.ask and a hook "ask" were observed not to prompt, so integration is a deterministic exit-2 deny in the slot AND the
// main checkout; the Owner runs LAND merges / rebases / pulls from a normal terminal (same path as push, AH-11).
const NO_CWD = { missing: true }; // sentinel: the hook input carries no cwd key at all
const cwdLabel = (c) => (c === NO_CWD ? 'missing' : c === '' ? 'empty' : c === MAIN ? 'main' : c);
function dAt(command, cwd, tool) {
  if (!guard) return { decision: 'NOMODULE', reason: '' };
  const input = { tool_name: tool || 'Bash', tool_input: { command } };
  if (cwd !== NO_CWD) input.cwd = cwd;
  try {
    return guard.decide(input, TEST_DEPS);
  } catch (e) {
    return { decision: 'THROW', reason: String(e && e.message) };
  }
}
const INTEG_CWDS = [SLOT_A, SLOT_B_SUB, SLOT_A_POSIX, SLOT_A_UPPER, MAIN, DECOY_OLD, DECOY_C, 'C:\\somewhere\\else', '', NO_CWD];
const INTEG_OPS = ['merge x', 'merge --no-ff x', 'merge --ff-only branch-dev', 'merge --abort', 'rebase branch-dev', 'rebase -i HEAD~3', 'rebase --continue',
  'rebase --abort', 'pull', 'pull --rebase', 'pull -r', 'pull --ff-only origin branch-dev', 'pull origin main'];
const GIT_PREFIXES = ['git ', 'git -C x ', 'git -c k=v ', 'git --no-pager ', 'git --git-dir=y -C x ', '/usr/bin/git ', 'git.exe ',
  '"C:\\Program Files\\Git\\bin\\git.exe" ', "'C:/Program Files/Git/cmd/git.exe' "];
for (const cwd of INTEG_CWDS) {
  for (const op of INTEG_OPS) {
    check('AH-15 [Bash ' + cwdLabel(cwd) + '] git ' + op + ' -> deny', dAt('git ' + op, cwd).decision === 'deny');
  }
}
for (const cwd of [SLOT_A, MAIN, NO_CWD]) {
  for (const prefix of GIT_PREFIXES) {
    for (const op of INTEG_OPS) {
      check('AH-15 [Bash ' + cwdLabel(cwd) + '] ' + prefix + op + ' -> deny', dAt(prefix + op, cwd).decision === 'deny');
    }
  }
}
const INTEG_WRAPPERS = ['CMD', 'bash -c "CMD"', "sh -c 'CMD'", 'cmd /c CMD', 'cmd.exe /c "CMD"', 'powershell -Command "CMD"', 'eval "CMD"', 'env A=1 CMD', 'a && CMD',
  'a; CMD', 'a | CMD', 'a || CMD', 'echo $(CMD)', 'echo `CMD`', 'echo "$(CMD)"', '(CMD)', '{ CMD; }', 'xargs CMD', 'echo x | xargs -n 1 CMD', 'nohup CMD', 'time CMD',
  'if true; then CMD; fi', 'for x in a; do CMD; done', 'iex "CMD"', 'Invoke-Expression "CMD"', '& CMD', 'CMD\ngit status', 'case x in x) CMD;; esac',
  'bash -c "bash -c \\"CMD\\""', 'git commit -m x && CMD', 'git commit -m x; CMD'];
for (const cmd of ['git merge x', 'git rebase y', 'git pull']) {
  const rows = INTEG_WRAPPERS.map((form) => form.replace(/CMD/g, cmd)).concat(['pwsh -NoProfile -EncodedCommand ' + b64(cmd)]);
  for (const cwd of [SLOT_A, MAIN, NO_CWD]) {
    for (const row of rows) check('AH-15 wrapper [Bash ' + cwdLabel(cwd) + '] ' + JSON.stringify(row) + ' -> deny', dAt(row, cwd).decision === 'deny');
  }
}
for (const cwd of [SLOT_A, MAIN]) {
  for (const op of INTEG_OPS) {
    check('AH-15 [PowerShell ' + cwdLabel(cwd) + '] git ' + op + ' -> deny', dAt('git ' + op, cwd, 'PowerShell').decision === 'deny');
  }
}
// Reason text: names R3m and the manual path; a Worker-slot session additionally carries the existing R1 suffix (as push does).
for (const cmd of ['git merge x', 'git rebase y', 'git pull', 'git -C x pull --rebase']) {
  const m = dAt(cmd, MAIN);
  check('AH-15 reason [main] ' + cmd + ': R3m + manual path, no R1 suffix', /R3m/.test(m.reason) && /manually/.test(m.reason) && !/R1/.test(m.reason));
  const s = dAt(cmd, SLOT_A);
  check('AH-15 reason [slot] ' + cmd + ': R3m + manual path + R1 suffix', /R3m/.test(s.reason) && /manually/.test(s.reason) && /R1/.test(s.reason));
}
// Controls: read-only git stays allow, commit / push / checkout behaviour is unchanged, text that merely mentions the words is not integration.
const READONLY_GIT = ['git status --short --branch', 'git log --oneline -3', 'git diff --stat', 'git diff --cached --stat', 'git merge-base a b', 'git merge-base --is-ancestor a b',
  'git merge-tree a b c', 'git config pull.rebase true', 'git worktree list', 'git rev-parse HEAD', 'git show HEAD', 'git branch --show-current', 'git -C x status --short',
  'echo "git pull"', 'echo git merge x', 'echo "git rebase main"', 'git log --grep="git pull" --oneline -3'];
for (const cwd of [SLOT_A, MAIN, NO_CWD]) {
  for (const cmd of READONLY_GIT) check('AH-15 control [Bash ' + cwdLabel(cwd) + '] ' + cmd + ' -> allow', dAt(cmd, cwd).decision === 'allow');
}
for (const cwd of [SLOT_A, MAIN]) {
  check('AH-15 control [' + cwdLabel(cwd) + ']: a commit whose message mentions merge / rebase / pull is data, not integration (slot allow, main deny with R3c only)',
    ['git commit -m x', 'git commit -m "docs: git merge, git rebase and git pull are denied"',
      'git commit -m "$(cat <<\'EOF\'\nfix: git pull --rebase notes\nEOF\n)"'].every((c) => {
      const r = dAt(c, cwd);
      return cwd === MAIN ? r.decision === 'deny' && /R3c/.test(r.reason) && !/R3m/.test(r.reason) : r.decision === 'allow';
    }));
  check('AH-15 control [' + cwdLabel(cwd) + ']: push deny, checkout/switch main deny, switch -c / checkout -b allow',
    dAt('git push', cwd).decision === 'deny' && dAt('git checkout main', cwd).decision === 'deny' && dAt('git switch main', cwd).decision === 'deny' &&
    dAt('git switch -c task/x 91e5c03', cwd).decision === 'allow' && dAt('git checkout -b task/x main', cwd).decision === 'allow');
}
// CLI (real spawn): exit 2, empty stdout, R3m on stderr — slot, main, empty cwd and a missing cwd key (runCli falls back to CLAUDE_PROJECT_DIR, so
// a missing cwd is spawned with the variable unset, set to the main checkout and set to a slot: every combination denies).
function spawnCliEnv(stdin, projectDir) {
  const env = Object.assign({}, process.env);
  delete env.CLAUDE_PROJECT_DIR;
  if (projectDir !== undefined) env.CLAUDE_PROJECT_DIR = projectDir;
  return spawnSync(process.execPath, [HOOK_PATH], { input: stdin, encoding: 'utf8', timeout: 15000, env });
}
for (const cmd of ['git merge x', 'git rebase y', 'git pull', 'git -C x pull --rebase']) {
  const cases = [['slot', payload(cmd, SLOT_A), undefined], ['main', payload(cmd, MAIN), undefined], ['empty cwd, no project dir', payload(cmd, ''), undefined],
    ['missing cwd, no project dir', payload(cmd), undefined], ['missing cwd, project dir = main', payload(cmd), MAIN], ['missing cwd, project dir = slot', payload(cmd), SLOT_A]];
  for (const c of cases) {
    const r = spawnCliEnv(c[1], c[2]);
    check('AH-15 CLI [' + c[0] + '] ' + cmd + ' -> exit 2, empty stdout, R3m + manual path on stderr',
      r.status === 2 && r.stdout === '' && /R3m/.test(r.stderr) && /manually/.test(r.stderr));
  }
}
{
  const roMain = spawnCliEnv(payload('git status --short --branch', MAIN));
  check('AH-15 CLI control: read-only git -> exit 0, no output', roMain.status === 0 && roMain.stdout === '' && roMain.stderr === '');
  const commitMain = spawnCliEnv(payload('git commit -m x', MAIN));
  check('AH-15 CLI control: git commit (main) -> exit 2, R3c (not R3m) on stderr, empty stdout (RC2; was ask before r9)',
    commitMain.status === 2 && commitMain.stdout === '' && /R3c/.test(commitMain.stderr) && !/R3m/.test(commitMain.stderr));
  const pushMain = spawnCliEnv(payload('git push', MAIN));
  check('AH-15 CLI control: git push -> exit 2 with the push reason (R3g wording unchanged)', pushMain.status === 2 && /push manually/.test(pushMain.stderr) && !/R3m/.test(pushMain.stderr));
}

// ── AH-16 slot-scoped commit gate (hook r9; RC1-RC4) ─────────────────────────────────────────────────────────────
// Model D (brief RC1): a Worker may commit only on its OWN task/* branch, in its OWN slot, in plain form, with a clean staged set; everything
// else is denied with R3c (commit from a normal terminal). Table rows inject the two readers, so they never touch the real fs / git;
// the temp-repo block at the end of this section drives the REAL readers. Nothing here creates a commit in the repository under test.
const HEAD_TASK = 'ref: refs/heads/task/x';
function depsOf(head, staged, log, repo, cfg, hooks) {
  return Object.assign({}, R10_STUBS, {
    readHeadRef: (root) => { if (log) log.push(['head', root]); return typeof head === 'function' ? head(root) : head; },
    stagedPaths: (root) => { if (log) log.push(['staged', root]); return typeof staged === 'function' ? staged(root) : staged; },
    // the repository that contains the session cwd: by default the slot itself (nested repos / worktrees are exercised through `repo`)
    repoRoot: (cwd) => { if (log) log.push(['repo', cwd]); return typeof repo === 'function' ? repo(cwd) : repo !== undefined ? repo : slotRootFromCwd(cwd); },
    protectedConfigState: (root) => { if (log) log.push(['cfg', root]); return typeof cfg === 'function' ? cfg(root) : cfg !== undefined ? cfg : { ok: true, bad: [] }; },
    hooksState: (root) => { if (log) log.push(['hooks', root]); return typeof hooks === 'function' ? hooks(root) : hooks !== undefined ? hooks : { ok: true, bad: [] }; }
  });
}
function dc(command, cwd, head, staged, tool, log, repo, cfg, hooks) {
  if (!guard) return { decision: 'NOMODULE', reason: '' };
  const input = { tool_name: tool || 'Bash', tool_input: { command } };
  if (cwd !== NO_CWD) input.cwd = cwd;
  try {
    return guard.decide(input, depsOf(head, staged, log, repo, cfg, hooks));
  } catch (e) {
    return { decision: 'THROW', reason: String(e && e.message) };
  }
}
const COMMIT_SLOT_CWDS = [SLOT_A, SLOT_B_SUB, SLOT_A_POSIX, SLOT_A_UPPER];
const COMMIT_ALLOW = [
  'git commit -m x', 'git commit -m "feat: multi word message"', "git commit -m 'msg'", 'git commit --message x', 'git commit --message=x', 'git commit -mx',
  'git commit -F msg.txt', 'git commit -F -', 'git commit --file=msg.txt', 'git commit --file msg.txt', 'git commit -s -m x',
  'git commit -sm x', 'git commit -qm x', 'git commit -v -m x', 'git commit -m x --no-edit', 'git commit --allow-empty -m x',
  'git commit --dry-run -m x', 'git commit --dry-run --allow-empty -m probe', 'git commit -q -m x', 'git commit', 'git commit -m "-x"',
  'git commit -m "$(cat <<\'EOF\'\nfix: text with git push and )\nEOF\n)"', "git commit -F - <<'EOF'\nmsg\nEOF", 'git commit -m x 2>&1', 'git commit -m "docs: a && b; c | d"'
];
// RC1 allow row, every slot cwd form
for (const cwd of COMMIT_SLOT_CWDS) {
  for (const cmd of COMMIT_ALLOW) {
    const r = dc(cmd, cwd, HEAD_TASK, []);
    check('AH-16 allow [slot ' + cwd + '] ' + JSON.stringify(cmd) + ' -> allow (got ' + r.decision + ')', r.decision === 'allow');
  }
}
// RC1 branch rows: only refs/heads/task/<id>[/...] passes
for (const head of ['ref: refs/heads/task/x', 'ref: refs/heads/task/commit-gate-hook', 'ref: refs/heads/task/a/b', 'ref: refs/heads/task/x.y_z-1', 'ref: refs/heads/task/x\r']) {
  check('AH-16 branch allow ' + JSON.stringify(head), dc('git commit -m x', SLOT_A, head, []).decision === 'allow');
}
const HEAD_DENY = ['ref: refs/heads/branch-dev', 'ref: refs/heads/main', 'ref: refs/heads/claude/x', 'ref: refs/heads/feature/x', 'ref: refs/heads/tasks/x', 'ref: refs/heads/task/',
  'ref: refs/heads/task', 'ref: refs/heads/mytask/x', 'ref: refs/remotes/origin/main', 'ref:refs/heads/task/x', 'ref: refs/heads/task/x y', 'ref: refs/heads/task/x/',
  '0123456789abcdef0123456789abcdef01234567', '', 'garbage', ' ', null, undefined, 42, {}];
for (const head of HEAD_DENY) {
  const r = dc('git commit -m x', SLOT_A, head, []);
  check('AH-16 branch deny ' + JSON.stringify(head) + ' -> deny with R3c (got ' + r.decision + ')', r.decision === 'deny' && /R3c/.test(r.reason));
}
// RC1 plain-form rows: any deviation is a deny, and NOTHING is read from the fs / git for them (no I/O before the form checks)
const COMMIT_FORM_DENY = [
  'git commit -a -m x', 'git commit --all -m x', 'git commit -am x', 'git commit -i f', 'git commit --include f -m x', 'git commit -o f -m x', 'git commit --only f -m x',
  'git commit -p', 'git commit --patch', 'git commit --interactive', 'git commit file.txt -m x', 'git commit -m x -- file', 'git commit -m x file', 'git commit -n -m x',
  'git commit --no-verify -m x', 'git commit --author=a -m x', 'git commit -C HEAD', 'git commit -c HEAD', 'git commit --reuse-message=HEAD', 'git commit --fixup=HEAD',
  'git commit --squash=HEAD', 'git commit -e -m x', 'git commit --pathspec-from-file=f', 'git commit -S -m x', 'git commit -m', 'git commit -F', 'git commit --message',
  'git commit -u', 'git commit --unknown', 'git commit --signoff -m x', 'git commit --quiet -m x', 'git commit --verbose -m x', 'git commit --dry-run=x', 'git commit -',
  'git -C x commit -m y', 'git -C . commit --dry-run -m x', 'git -c k=v commit -m x', 'git --git-dir=y commit -m x', 'git --work-tree=y commit -m x', 'git --no-pager commit -m x',
  'GIT_DIR=x git commit -m y', 'GIT_INDEX_FILE=/tmp/i git commit -m x', 'A=1 git commit -m x', 'env A=1 git commit -m x', 'env GIT_DIR=x git commit -m x',
  'git add -A && git commit -m x', 'git add x; git commit -m x', 'cd ../portfolio-tracker && git commit -m x', 'echo x | git commit -F -', 'true || git commit -m x',
  'git commit -m x && git status', 'git commit -m x; git log', 'git commit -m x\ngit status', 'git commit -m x 2>&1 | tail -3', 'git commit -m x || git commit -m y',
  'bash -c "git commit -m x"', "sh -c 'git commit -m x'", 'eval "git commit -m x"', 'cmd /c git commit -m x', 'powershell -Command "git commit -m x"', 'nohup git commit -m x',
  'time git commit -m x', 'xargs git commit -m x', 'exec git commit -m x', 'command git commit -m x', '(git commit -m x)', '{ git commit -m x; }', 'echo $(git commit -m x)',
  'echo `git commit -m x`', 'if true; then git commit -m x; fi', 'for x in a; do git commit -m x; done', 'while true; do git commit -m x; done',
  'case x in x) git commit -m y;; esac', '/usr/bin/git commit -m x', 'git.exe commit -m x', '"C:\\Program Files\\Git\\bin\\git.exe" commit -m x',
  'git commit -m "$(git add -A; echo m)"', 'git commit -m "$(git log -1 --format=%s)"', 'iex "git commit -m x"', 'npx git commit -m x',
  'git commit --amend', 'git commit --amend -m x', 'git commit --amend --no-edit', 'git commit -m x --amend', 'git commit -a --amend'
];
// r10: a GIT_DIR/GIT_WORK_TREE command prefix on git is denied earlier via R10-5 (destructive), not the R3c commit gate.
const R10_ENV_PREFIX_COMMIT = /^GIT_(?:DIR|WORK_TREE)=/;
for (const cwd of [SLOT_A, SLOT_B_SUB]) {
  for (const cmd of COMMIT_FORM_DENY) {
    const log = [];
    const r = dc(cmd, cwd, HEAD_TASK, [], 'Bash', log);
    if (R10_ENV_PREFIX_COMMIT.test(cmd)) {
      check('AH-16 form deny [slot ' + cwd + '] ' + JSON.stringify(cmd) + ' -> deny via R10-5, no reads (got ' + r.decision + ', reads ' + log.length + ')',
        r.decision === 'deny' && /R10-5/.test(r.reason) && log.length === 0);
    } else {
      check('AH-16 form deny [slot ' + cwd + '] ' + JSON.stringify(cmd) + ' -> deny with R3c, no reads (got ' + r.decision + ', reads ' + log.length + ')',
        r.decision === 'deny' && /R3c/.test(r.reason) && /normal terminal/.test(r.reason) && log.length === 0);
    }
  }
}
// RC3: --amend is named in the reason
for (const cmd of COMMIT_FORM_DENY.filter((c) => /--amend/.test(c) && !/-a --amend/.test(c))) {
  check('AH-16 RC3 amend reason [slot] ' + cmd, /RC3/.test(dc(cmd, SLOT_A, HEAD_TASK, []).reason));
}
// RC1 staged rows (matrix list: .claude/settings*.json, .claude/hooks/**, CHECKPOINT.md, .env*, work/*/brief.md add / modify / delete)
const STAGED_DENY = ['.claude/settings.json', '.claude/settings.local.json', '.claude/settings.backup.json', '.claude/hooks/pretooluse-guard.js', '.claude/hooks/x/y.js',
  'CHECKPOINT.md', 'checkpoint.md', 'CHECKPOINT.MD', '.env', '.env.local', '.envrc', 'work/foo/brief.md', 'work/merge-rebase-hook/brief.md'];
const STAGED_ALLOW = [[], ['qa/x_offline.js'], ['work/foo/review.md'], ['work/foo/plan.md'], ['index.html', 'netlify/functions/x.js'], ['work/foo/brief.md.bak'], ['work/foo/xbrief.md'],
  ['work/brief.md'], ['docs/checkpoint.md.txt'], ['x/environment/notes.txt'], ['.claude/notes.md']];
for (const p of STAGED_DENY) {
  const r = dc('git commit -m x', SLOT_A, HEAD_TASK, ['qa/ok.js', p]);
  check('AH-16 staged deny ' + JSON.stringify(p) + ' -> deny with R3c naming the path (got ' + r.decision + ')', r.decision === 'deny' && /R3c/.test(r.reason) && r.reason.indexOf(p) !== -1);
}
for (const staged of STAGED_ALLOW) {
  check('AH-16 staged allow ' + JSON.stringify(staged), dc('git commit -m x', SLOT_A, HEAD_TASK, staged).decision === 'allow');
}
// RC1 fail closed: reader errors / odd returns deny, never allow
const boom = () => { throw new Error('planted read failure'); };
check('AH-16 fail closed: HEAD reader throws -> deny (R3c)', dc('git commit -m x', SLOT_A, boom, []).decision === 'deny' && /R3c/.test(dc('git commit -m x', SLOT_A, boom, []).reason));
check('AH-16 fail closed: staged reader throws (spawn error / timeout / non-zero exit) -> deny (R3c)',
  dc('git commit -m x', SLOT_A, HEAD_TASK, boom).decision === 'deny' && /R3c/.test(dc('git commit -m x', SLOT_A, HEAD_TASK, boom).reason));
for (const odd of ['x', null, undefined, {}, 42, [null], [1], ['ok.js', 5]]) {
  check('AH-16 fail closed: staged reader returns ' + JSON.stringify(odd) + ' -> deny', dc('git commit -m x', SLOT_A, HEAD_TASK, () => odd).decision === 'deny');
}
// RC1 repository identity: the commit runs in the repository that CONTAINS the cwd. A nested repo / worktree inside the slot (e.g. a `git worktree add -f`
// of branch-dev) must not borrow the slot's task branch and clean index.
for (const [label, repo] of [['nested worktree', SLOT_A + '\\sub\\x'], ['sibling repo', 'C:\\Users\\Owner\\Documents\\Project\\portfolio-tracker'], ['parent directory', 'C:\\Users\\Owner\\Documents\\Project'],
  ['non-string', 42], ['undefined', undefined && 0], ['other slot', SLOT_B_SUB.replace(/\\qa$/, '')]]) {
  const r = dc('git commit -m x', SLOT_A, HEAD_TASK, [], 'Bash', undefined, label === 'undefined' ? () => undefined : repo);
  check('AH-16 repo identity: cwd inside ' + label + ' -> deny with R3c (got ' + r.decision + ')', r.decision === 'deny' && /R3c/.test(r.reason) && /different repository|repository root/.test(r.reason));
}
check('AH-16 repo identity: repoRoot resolver throws -> deny (fail closed)', dc('git commit -m x', SLOT_A, HEAD_TASK, [], 'Bash', undefined, boom).decision === 'deny');
check('AH-16 repo identity: same root in another spelling (slashes, case, trailing slash) -> allow',
  dc('git commit -m x', SLOT_A, HEAD_TASK, [], 'Bash', undefined, 'c:/USERS/owner/documents/project/PT-WT-WORKER-A/').decision === 'allow');
{
  const log = [];
  dc('git commit -m x', SLOT_A, HEAD_TASK, [], 'Bash', log, 'C:\\elsewhere');
  check('AH-16 repo identity: a mismatch denies before HEAD / the staged set are read', log.filter((e) => e[0] !== 'repo').length === 0);
}
// Codex finding (implementation review, FIX): a session GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE / GIT_COMMON_DIR / GIT_OBJECT_DIRECTORY /
// GIT_ALTERNATE_OBJECT_DIRECTORIES override is invisible to the command-form check (it is set in the environment, not the command line) but is
// inherited by the real `git commit` the tool runs, so it could act on a different repository or index than the one the gate just inspected.
for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) {
  const saved = process.env[key];
  process.env[key] = 'x';
  try {
    const r = dc('git commit -m x', SLOT_A, HEAD_TASK, []);
    check('AH-16 env override: ' + key + ' set in the session -> deny naming it (got ' + r.decision + ')', r.decision === 'deny' && r.reason.indexOf(key) !== -1);
  } finally {
    if (saved === undefined) delete process.env[key]; else process.env[key] = saved;
  }
}
check('AH-16 env override control: no GIT_* override set -> allow', dc('git commit -m x', SLOT_A, HEAD_TASK, []).decision === 'allow');
mutantCatches('GIT_* environment override check dropped', 'const envOverride = Object.keys(process.env).find((k) => GIT_ENV_OVERRIDE_RE.test(k));', 'const envOverride = undefined;',
  (m) => { process.env.GIT_DIR = 'x'; try { return m.decide({ tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: SLOT_A }, depsOf(HEAD_TASK, [])).decision === 'deny'; } finally { delete process.env.GIT_DIR; } });
mutantCatches('GIT_* environment override regex narrowed (GIT_INDEX_FILE missed)', 'GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES)', 'GIT_(?:DIR|WORK_TREE)',
  (m) => { process.env.GIT_INDEX_FILE = 'x'; try { return m.decide({ tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: SLOT_A }, depsOf(HEAD_TASK, [])).decision === 'deny'; } finally { delete process.env.GIT_INDEX_FILE; } });
// RC2: non-slot sessions never commit; the reader is never consulted
for (const cwd of [MAIN, DECOY_OLD, DECOY_C, 'C:\\somewhere\\else', '', NO_CWD]) {
  for (const cmd of COMMIT_ALLOW) {
    const log = [];
    const r = dc(cmd, cwd, HEAD_TASK, [], 'Bash', log);
    check('AH-16 RC2 [Bash ' + cwdLabel(cwd) + '] ' + JSON.stringify(cmd) + ' -> deny with R3c, no reads (got ' + r.decision + ')',
      r.decision === 'deny' && /R3c/.test(r.reason) && /normal terminal/.test(r.reason) && log.length === 0);
  }
}
check('AH-16 RC2 reason for a non-slot session names the Worker slot rule',
  /outside a Worker slot/.test(dc('git commit -m x', MAIN, HEAD_TASK, []).reason) && /cwd is unknown/.test(dc('git commit -m x', NO_CWD, HEAD_TASK, []).reason));
// PowerShell unchanged: git is denied through the PowerShell tool (R2) and the gate reads nothing
for (const cwd of [SLOT_A, MAIN]) {
  const log = [];
  const r = dc('git commit -m x', cwd, HEAD_TASK, [], 'PowerShell', log);
  check('AH-16 PowerShell [' + cwdLabel(cwd) + '] git commit -> deny, unchanged (slot: blanket R2; main: git-program R2), no reads',
    r.decision === 'deny' && /R2/.test(r.reason) && !/R3c/.test(r.reason) && log.length === 0);
}
// non-commit controls: the gate never fires for anything else
for (const cwd of [SLOT_A, MAIN]) {
  const log = [];
  for (const cmd of READONLY_GIT.concat(['git add -A', 'git switch -c task/x', 'git stash list'])) {
    check('AH-16 control [' + cwdLabel(cwd) + '] ' + cmd + ' -> allow, no reads', dc(cmd, cwd, boom, boom, 'Bash', log).decision === 'allow');
  }
  check('AH-16 control [' + cwdLabel(cwd) + ']: no gate read for non-commit commands', log.length === 0);
}
// RC4 ref moves: denied in every session; controls stay allow
const RC4_DENY = ['git update-ref refs/heads/branch-dev HEAD', 'git update-ref refs/heads/main abc', 'git update-ref -m msg refs/heads/branch-dev HEAD', 'git update-ref --no-deref refs/heads/main abc',
  'git update-ref --create-reflog refs/heads/main abc', 'git update-ref branch-dev abc', 'git update-ref refs/heads/branch-dev abc def', 'git update-ref --stdin', 'git update-ref --stdin -z',
  'git -C x update-ref refs/heads/main abc', 'git branch -f branch-dev abc', 'git branch -f main abc', 'git branch --force main abc', 'git branch -fq main abc', 'git branch -m branch-dev x',
  'git branch -m x branch-dev', 'git branch -M main', 'git branch -M x main', 'git branch --move main x', 'git branch -c main x', 'git branch -C x main', 'git branch --copy branch-dev x',
  'git symbolic-ref HEAD refs/heads/main', 'git symbolic-ref HEAD refs/heads/branch-dev', 'git symbolic-ref -m msg HEAD refs/heads/main', 'git symbolic-ref refs/heads/main refs/heads/x',
  'git symbolic-ref HEAD main', 'bash -c "git update-ref refs/heads/main abc"', 'git status && git branch -f main abc'];
const RC4_ALLOW = ['git update-ref refs/heads/x abc', 'git update-ref refs/heads/task/x HEAD', 'git update-ref -m msg refs/heads/x abc', 'git branch -f x y', 'git branch -f task/x main',
  'git branch -m x y', 'git branch -c x y', 'git branch x', 'git branch --show-current', 'git branch -a', 'git branch -vv', 'git branch -u origin/main', 'git symbolic-ref HEAD',
  'git symbolic-ref --short HEAD', 'git symbolic-ref -q HEAD', 'git symbolic-ref HEAD refs/heads/task/x'];
for (const cwd of [SLOT_A, MAIN, NO_CWD]) {
  for (const cmd of RC4_DENY) {
    const r = dc(cmd, cwd, HEAD_TASK, []);
    check('AH-16 RC4 [Bash ' + cwdLabel(cwd) + '] ' + cmd + ' -> deny (got ' + r.decision + ')', r.decision === 'deny' && /RC4|R10-4/.test(r.reason));
  }
  for (const cmd of RC4_ALLOW) check('AH-16 RC4 control [Bash ' + cwdLabel(cwd) + '] ' + cmd + ' -> allow', dc(cmd, cwd, HEAD_TASK, []).decision === 'allow');
}
// CLI (in-process runCli with injected readers, then real spawns)
function cliDeps(cmd, cwd, head, staged) { return guard.runCli(payload(cmd, cwd), { deps: depsOf(head, staged) }); }
if (guard) {
  const okSlot = cliDeps('git commit -m x', SLOT_A, HEAD_TASK, []);
  check('AH-16 CLI allow [slot, task branch, clean] -> exit 0, empty stdout, empty stderr', okSlot.code === 0 && okSlot.stdout === '' && okSlot.stderr === '');
  for (const [label, r] of [['main', cliDeps('git commit -m x', MAIN, HEAD_TASK, [])], ['slot on branch-dev', cliDeps('git commit -m x', SLOT_A, 'ref: refs/heads/branch-dev', [])],
    ['slot --amend', cliDeps('git commit --amend', SLOT_A, HEAD_TASK, [])], ['slot -a', cliDeps('git commit -am x', SLOT_A, HEAD_TASK, [])],
    ['slot protected staged', cliDeps('git commit -m x', SLOT_A, HEAD_TASK, ['.claude/settings.json'])], ['slot reader throws', cliDeps('git commit -m x', SLOT_A, boom, [])]]) {
    check('AH-16 CLI deny [' + label + '] -> exit 2, empty stdout, R3c on stderr', r.code === 2 && r.stdout === '' && /R3c/.test(r.stderr));
  }
  check('AH-16 CLI RC4 -> exit 2, empty stdout, RC4 on stderr', (() => { const r = cliDeps('git update-ref refs/heads/branch-dev HEAD', MAIN, HEAD_TASK, []); return r.code === 2 && r.stdout === '' && /RC4/.test(r.stderr); })());
} else {
  check('AH-16 CLI rows need the hook module', false);
}
for (const cwd of [MAIN, '']) {
  const r = spawnCliEnv(payload('git commit -m x', cwd));
  check('AH-16 CLI spawn [' + (cwd === '' ? 'empty cwd' : 'main') + '] git commit -> exit 2, empty stdout, R3c on stderr', r.status === 2 && r.stdout === '' && /R3c/.test(r.stderr));
}
{
  const r = spawnCliEnv(payload('git update-ref refs/heads/branch-dev HEAD', SLOT_A));
  check('AH-16 CLI spawn RC4 -> exit 2, RC4 on stderr', r.status === 2 && r.stdout === '' && /RC4/.test(r.stderr));
}
// Real readers against a temp repo laid out like the Worker slots: <tmp>/portfolio-tracker (main checkout), <tmp>/pt-wt-worker-a (a `git worktree`, so
// .git is a FILE with `gitdir:`), <tmp>/pt-wt-worker-b (a standalone repo, so .git is a DIRECTORY). Offline; git runs only inside os.tmpdir().
{
  const gitVersion = spawnSync('git', ['--version'], { encoding: 'utf8' });
  check('AH-16 temp-repo: git is available on PATH', gitVersion.status === 0);
  if (gitVersion.status === 0) {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-commit-'));
    const G = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=ah', '-c', 'user.email=ah@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args],
      { cwd, encoding: 'utf8' });
    const put = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
    const realDecide = (cmd, cwd) => guard.decide({ tool_name: 'Bash', tool_input: { command: cmd }, cwd });
    try {
      const mainRepo = path.join(base, 'portfolio-tracker');
      const slotA = path.join(base, 'pt-wt-worker-a');
      const slotB = path.join(base, 'pt-wt-worker-b');
      fs.mkdirSync(mainRepo);
      G(mainRepo, 'init', '-q');
      G(mainRepo, 'checkout', '-q', '-b', 'branch-dev');
      for (const [rel, text] of [['.claude/settings.json', '{}\n'], ['.claude/hooks/x.js', '//\n'], ['CHECKPOINT.md', 'c\n'], ['work/x/brief.md', 'b\n'], ['qa/a.js', 'a\n'], ['keep.txt', 'k\n']]) put(mainRepo, rel, text);
      G(mainRepo, 'add', '-A');
      check('AH-16 temp-repo: seed commit created (in the temp repo only)', G(mainRepo, 'commit', '-q', '-m', 'seed').status === 0);
      check('AH-16 temp-repo: worktree slot created', G(mainRepo, 'worktree', 'add', '-q', '-b', 'task/x', slotA).status === 0);
      fs.mkdirSync(slotB);
      G(slotB, 'init', '-q');
      G(slotB, 'checkout', '-q', '-b', 'task/y');
      put(slotB, 'keep.txt', 'k\n');
      G(slotB, 'add', '-A');
      G(slotB, 'commit', '-q', '-m', 'seed');
      check('AH-16 temp-repo layout: slot A .git is a file, slot B .git is a directory',
        fs.statSync(path.join(slotA, '.git')).isFile() && fs.statSync(path.join(slotB, '.git')).isDirectory());
      const COMMIT = 'git commit -m x';
      // clean staged set on the own task branch -> allow (worktree gitdir file, slot subdirectory, standalone .git directory)
      put(slotA, 'a.txt', 'new\n');
      G(slotA, 'add', 'a.txt');
      check('AH-16 real: worktree slot, task/x, clean staged -> allow', realDecide(COMMIT, slotA).decision === 'allow');
      fs.mkdirSync(path.join(slotA, 'qa'), { recursive: true });
      check('AH-16 real: cwd is a subdirectory of the slot -> allow', realDecide(COMMIT, path.join(slotA, 'qa')).decision === 'allow');
      // a nested worktree of branch-dev and a nested standalone repo on a task branch, both INSIDE the slot: the commit would run there, not in the slot
      const nestedWt = path.join(slotA, 'sub', 'x');
      check('AH-16 real: nested worktree of branch-dev created inside slot A', G(slotA, 'worktree', 'add', '-q', '-f', nestedWt, 'branch-dev').status === 0);
      const nestedRepo = path.join(slotA, 'nested');
      fs.mkdirSync(nestedRepo);
      G(nestedRepo, 'init', '-q');
      G(nestedRepo, 'checkout', '-q', '-b', 'task/z');
      const nestedWtR = realDecide(COMMIT, nestedWt);
      check('AH-16 real: cwd in a nested worktree on branch-dev inside the slot -> deny with R3c (the slot HEAD / index must not be borrowed)',
        nestedWtR.decision === 'deny' && /R3c/.test(nestedWtR.reason) && /different repository/.test(nestedWtR.reason));
      check('AH-16 real: cwd in a nested standalone repo on task/z inside the slot -> deny (a different repository)', realDecide(COMMIT, nestedRepo).decision === 'deny');
      const slotStillOk = realDecide(COMMIT, slotA).decision === 'allow';
      const slotQaStillOk = realDecide(COMMIT, path.join(slotA, 'qa')).decision === 'allow';
      check('AH-16 real: the slot itself is still allowed while the nested repos exist', slotStillOk && slotQaStillOk);
      mutantCatches('repository-identity check dropped (nested worktree borrows the slot branch)', "if (typeof repo !== 'string' ||", 'if (false &&',
        (m) => m.decide({ tool_name: 'Bash', tool_input: { command: COMMIT }, cwd: nestedWt }).decision === 'deny' && m.decide({ tool_name: 'Bash', tool_input: { command: COMMIT }, cwd: nestedRepo }).decision === 'deny');
      G(slotA, 'worktree', 'remove', '--force', nestedWt);
      fs.rmSync(nestedRepo, { recursive: true, force: true });
      fs.rmSync(path.join(slotA, 'sub'), { recursive: true, force: true });
      put(slotB, 'b.txt', 'new\n');
      G(slotB, 'add', 'b.txt');
      check('AH-16 real: standalone slot (.git directory), task/y, clean staged -> allow', realDecide(COMMIT, slotB).decision === 'allow');
      check('AH-16 real: main checkout -> deny (RC2) even on a clean tree', realDecide(COMMIT, mainRepo).decision === 'deny');
      // protected staged paths (each staged for real), then unstaged again
      const stagedCase = (label, setup, undo) => {
        setup();
        const r = realDecide(COMMIT, slotA);
        check('AH-16 real: staged ' + label + ' -> deny with R3c (got ' + r.decision + ')', r.decision === 'deny' && /R3c/.test(r.reason));
        undo();
        const after = realDecide(COMMIT, slotA);
        check('AH-16 real: after undoing ' + label + ' -> allow again (got ' + after.decision + ')', after.decision === 'allow');
      };
      stagedCase('.claude/settings.json (modified)', () => { put(slotA, '.claude/settings.json', '{"x":1}\n'); G(slotA, 'add', '.claude/settings.json'); }, () => { G(slotA, 'reset', '-q', '--', '.claude/settings.json'); G(slotA, 'checkout', '--', '.claude/settings.json'); });
      stagedCase('.claude/hooks/x.js (modified)', () => { put(slotA, '.claude/hooks/x.js', '//2\n'); G(slotA, 'add', '.claude/hooks/x.js'); }, () => { G(slotA, 'reset', '-q', '--', '.claude/hooks/x.js'); G(slotA, 'checkout', '--', '.claude/hooks/x.js'); });
      stagedCase('CHECKPOINT.md (modified)', () => { put(slotA, 'CHECKPOINT.md', 'c2\n'); G(slotA, 'add', 'CHECKPOINT.md'); }, () => { G(slotA, 'reset', '-q', '--', 'CHECKPOINT.md'); G(slotA, 'checkout', '--', 'CHECKPOINT.md'); });
      stagedCase('.env (added)', () => { put(slotA, '.env', 'S=1\n'); G(slotA, 'add', '.env'); }, () => { G(slotA, 'reset', '-q', '--', '.env'); fs.rmSync(path.join(slotA, '.env')); });
      stagedCase('work/x/brief.md (modified)', () => { put(slotA, 'work/x/brief.md', 'b2\n'); G(slotA, 'add', 'work/x/brief.md'); }, () => { G(slotA, 'reset', '-q', '--', 'work/x/brief.md'); G(slotA, 'checkout', '--', 'work/x/brief.md'); });
      stagedCase('work/x/brief.md (deleted)', () => { G(slotA, 'rm', '-q', 'work/x/brief.md'); }, () => { G(slotA, 'reset', '-q', '--', 'work/x/brief.md'); G(slotA, 'checkout', '--', 'work/x/brief.md'); });
      stagedCase('work/y/brief.md (added)', () => { put(slotA, 'work/y/brief.md', 'n\n'); G(slotA, 'add', 'work/y/brief.md'); }, () => { G(slotA, 'reset', '-q', '--', 'work/y/brief.md'); fs.rmSync(path.join(slotA, 'work/y'), { recursive: true }); });
      // renaming a protected file away must still surface its OLD path (--no-renames)
      G(slotA, 'mv', '.claude/settings.json', 'renamed-settings.txt');
      check('AH-16 real: a protected file renamed away is still denied (--no-renames lists the old path)', realDecide(COMMIT, slotA).decision === 'deny');
      check('AH-16 real: the rename shows BOTH paths in the staged list', (() => { const r = G(slotA, 'diff', '--cached', '--name-only', '-z', '--no-renames'); return r.stdout.split('\0').filter(Boolean).length >= 2; })());
      // mutant proof on the real reader: without --no-renames git reports only the new name, so the rename-away slips through
      mutantCatches('staged read without --no-renames (rename-away hides the protected path)', ", '--no-renames'", '',
        (m) => m.decide({ tool_name: 'Bash', tool_input: { command: COMMIT }, cwd: slotA }).decision === 'deny');
      G(slotA, 'reset', '-q');
      G(slotA, 'checkout', '--', '.claude/settings.json');
      fs.rmSync(path.join(slotA, 'renamed-settings.txt'), { force: true });
      // branch rows on the real HEAD reader
      G(slotA, 'switch', '-q', '--detach');
      check('AH-16 real: detached HEAD -> deny', realDecide(COMMIT, slotA).decision === 'deny');
      G(slotA, 'switch', '-q', '-c', 'other');
      check('AH-16 real: non-task branch -> deny', realDecide(COMMIT, slotA).decision === 'deny');
      G(slotA, 'switch', '-q', 'task/x');
      check('AH-16 real: back on task/x -> allow', realDecide(COMMIT, slotA).decision === 'allow');
      G(slotB, 'checkout', '-q', '-b', 'main');
      check('AH-16 real: standalone slot on main -> deny', realDecide(COMMIT, slotB).decision === 'deny');
      G(slotB, 'checkout', '-q', 'task/y');
      // fail closed on the real readers
      const headFile = path.join(slotB, '.git', 'HEAD');
      const headSave = fs.readFileSync(headFile, 'utf8');
      for (const junk of ['garbage\n', '', 'ref: refs/heads/branch-dev\n', 'ref: refs/heads/task/y extra\n']) {
        fs.writeFileSync(headFile, junk);
        check('AH-16 real fail closed: HEAD contains ' + JSON.stringify(junk) + ' -> deny', realDecide(COMMIT, slotB).decision === 'deny');
      }
      fs.writeFileSync(headFile, headSave);
      check('AH-16 real: HEAD restored -> allow', realDecide(COMMIT, slotB).decision === 'allow');
      const bare = path.join(base, 'nogit', 'pt-wt-worker-b');
      fs.mkdirSync(bare, { recursive: true });
      const bareR = realDecide(COMMIT, bare);
      check('AH-16 real fail closed: slot directory with no .git -> deny (R3c)', /R3c/.test(bareR.reason) && bareR.decision === 'deny');
      const linked = path.join(base, 'badlink', 'pt-wt-worker-a');
      fs.mkdirSync(linked, { recursive: true });
      fs.writeFileSync(path.join(linked, '.git'), 'gitdir: ' + path.join(base, 'does-not-exist') + '\n');
      check('AH-16 real fail closed: .git file pointing at a missing gitdir -> deny', realDecide(COMMIT, linked).decision === 'deny');
      fs.writeFileSync(path.join(linked, '.git'), 'not a gitdir line\n');
      check('AH-16 real fail closed: unrecognised .git file -> deny', realDecide(COMMIT, linked).decision === 'deny');
      // git state check: staged set with a good HEAD but a broken index / unreadable repo -> deny (staged reader fails closed)
      const broken = path.join(base, 'broken', 'pt-wt-worker-b');
      fs.mkdirSync(path.join(broken, '.git'), { recursive: true });
      fs.writeFileSync(path.join(broken, '.git', 'HEAD'), 'ref: refs/heads/task/z\n');
      check('AH-16 real fail closed: good HEAD but not a real repository (git diff fails) -> deny', realDecide(COMMIT, broken).decision === 'deny');
      // CLI over the real readers (spawned process)
      put(slotA, 'cli.txt', 'x\n');
      G(slotA, 'add', 'cli.txt');
      const cliAllow = spawnCliEnv(payload(COMMIT, slotA));
      check('AH-16 real CLI: clean task-branch commit -> exit 0, empty stdout, empty stderr (got ' + cliAllow.status + ')', cliAllow.status === 0 && cliAllow.stdout === '' && cliAllow.stderr === '');
      put(slotA, '.claude/settings.json', '{"y":1}\n');
      G(slotA, 'add', '.claude/settings.json');
      const cliDeny = spawnCliEnv(payload(COMMIT, slotA));
      check('AH-16 real CLI: protected staged -> exit 2, R3c on stderr', cliDeny.status === 2 && cliDeny.stdout === '' && /R3c/.test(cliDeny.stderr));
      // the hook must not have created or changed any ref / commit while deciding
      const beforeHead = G(slotA, 'rev-parse', 'HEAD').stdout;
      realDecide(COMMIT, slotA);
      check('AH-16 real: deciding is read-only (HEAD unchanged)', G(slotA, 'rev-parse', 'HEAD').stdout === beforeHead);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  }
}

// ── AH-9 CLI (real spawn) ───────────────────────────────────────────────────────────────
function spawnCli(stdin, hookPath) {
  return spawnSync(process.execPath, [hookPath || HOOK_PATH], { input: stdin, encoding: 'utf8', timeout: 15000 });
}
function payload(command, cwd, tool) {
  return JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool || 'Bash', tool_input: { command }, cwd });
}
{
  const allow = spawnCli(payload('git status --short --branch', SLOT_A));
  check('AH-9 allow -> exit 0, empty stdout', allow.status === 0 && allow.stdout === '');
  const ask = spawnCli(payload('echo x > package.json', MAIN)); // r9: commit no longer asks; a main-checkout protected write still does
  let askJson = null;
  try { askJson = JSON.parse(ask.stdout); } catch (e) { askJson = null; }
  check('AH-9 ask -> exit 0 + hookSpecificOutput permissionDecision "ask"',
    ask.status === 0 && askJson && askJson.hookSpecificOutput &&
    askJson.hookSpecificOutput.hookEventName === 'PreToolUse' &&
    askJson.hookSpecificOutput.permissionDecision === 'ask' &&
    typeof askJson.hookSpecificOutput.permissionDecisionReason === 'string' &&
    askJson.hookSpecificOutput.permissionDecisionReason.length > 0);
  const deny = spawnCli(payload('git push --force', SLOT_A));
  check('AH-9 deny -> exit 2 + reason on stderr', deny.status === 2 && deny.stderr.trim().length > 0 && deny.stdout === '');
  check('AH-9 PowerShell deny -> exit 2', spawnCli(payload('git push', SLOT_A, 'PowerShell')).status === 2);
  check('AH-9 malformed stdin -> exit 2', spawnCli('{not json').status === 2 && spawnCli('').status === 2);
  check('AH-9 non-object JSON -> exit 2', spawnCli('null').status === 2 && spawnCli('[]').status === 2 && spawnCli('"x"').status === 2);
  check('AH-9 missing command -> exit 2', spawnCli(JSON.stringify({ tool_name: 'Bash', tool_input: {}, cwd: SLOT_A })).status === 2 &&
    spawnCli(JSON.stringify({ tool_name: 'Bash', cwd: SLOT_A })).status === 2);
  check('AH-9 non-string command -> exit 2', spawnCli(JSON.stringify({ tool_name: 'PowerShell', tool_input: { command: 42 }, cwd: SLOT_A })).status === 2 &&
    spawnCli(JSON.stringify({ tool_name: 'Bash', tool_input: { command: ['git', 'push'] }, cwd: SLOT_A })).status === 2);
  const other = spawnCli(JSON.stringify({ tool_name: 'Read', tool_input: { file_path: 'x' }, cwd: SLOT_A }));
  check('AH-9 other tools -> exit 0, no output', other.status === 0 && other.stdout === '');
  const wired = spawnCli(payload('git push --dry-run', SLOT_A));
  check('AH-9 G4 shape: slot `git push --dry-run` -> exit 2', wired.status === 2 && /push|integrat|worker/i.test(wired.stderr));
  if (guard && typeof guard.runCli === 'function') {
    const thrown = guard.runCli(payload('git status', SLOT_A), { decideFn() { throw new Error('planted'); } });
    check('AH-9 thrown error inside decide -> exit 2 (fail closed)', thrown.code === 2 && /planted|error/i.test(thrown.stderr));
    const badShape = guard.runCli(payload('git status', SLOT_A), { decideFn() { return { decision: 'maybe', reason: 'x' }; } });
    check('AH-9 unknown decision value -> exit 2 (fail closed)', badShape.code === 2);
  } else {
    check('AH-9 runCli exported for planted-throw check', false);
  }
}

// ── planted negatives: mutate the PRODUCTION source, the suite must notice ───────────────
function mutantCatches(label, find, replace, probe) {
  let src;
  try { src = fs.readFileSync(HOOK_PATH, 'utf8').replace(/\r\n/g, '\n'); } catch (e) { check('MUT ' + label + ': hook source readable', false); return; }
  const idx = src.indexOf(find);
  check('MUT ' + label + ': anchor present in production source', idx !== -1);
  if (idx === -1) return;
  const mutated = src.slice(0, idx) + replace + src.slice(idx + find.length);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-mut-'));
  try {
    const file = path.join(dir, 'pretooluse-guard.js');
    fs.writeFileSync(file, mutated);
    const mod = require(file);
    check('MUT ' + label + ': mutant is caught by its probe', probe(mod) === false);
    check('MUT ' + label + ': unmutated production passes the same probe', guard && probe(guard) === true);
  } catch (e) {
    check('MUT ' + label + ': mutant loads (' + e.message + ')', false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
mutantCatches('push not denied (downgraded to a protected-write class)', "cls: 'push', reason", "cls: 'protected', reason", // slot deny / main ask; 'commit' is a deny-everywhere-but-a-gated-slot class under r9, so it can no longer stand in
  (m) => dec(m, 'git push', SLOT_A).decision === 'deny' && dec(m, 'git push --dry-run', MAIN).decision === 'deny');
mutantCatches('push downgraded to a main-ask class (main ask again)', "cls: 'push', reason", "cls: 'netlify', reason", // integration is deny-everywhere under r8, so netlify stands in for the slot-deny / main-ask column
  (m) => dec(m, 'git push --dry-run', MAIN).decision === 'deny');
mutantCatches('merge not integration', "'push', 'merge', 'rebase'", "'push', 'rebase'",
  (m) => dec(m, 'git merge x', SLOT_A).decision === 'deny');
mutantCatches('reset --hard not destructive', "'--hard'", "'--hard-x'",
  (m) => dec(m, 'git reset --hard', MAIN).decision === 'deny');
mutantCatches('slot detection broken', '[ab]', '[x]',
  (m) => dec(m, 'netlify deploy', SLOT_A).decision === 'deny'); // netlify, not push/merge: those are deny in every cwd now (AH-11, AH-15), so they no longer tell slot from main
mutantCatches('deny exit code drifts', 'FAIL_CLOSED_EXIT = 2', 'FAIL_CLOSED_EXIT = 1',
  (m) => m.runCli(payload('git push -f', SLOT_A)).code === 2);
mutantCatches('protected tail dropped (package.json)', 'package\\\\.json', 'package_x\\\\.json',
  (m) => dec(m, 'echo x > package.json', SLOT_A).decision === 'deny');
mutantCatches('wrapper unwrap dropped (bash -c)', "'bash', 'sh', 'zsh'", "'zsh'",
  (m) => dec(m, 'bash -c "git push"', SLOT_A).decision === 'deny');
mutantCatches('netlify deploy not write', "'deploy'", "'deploy-x'",
  (m) => dec(m, 'netlify deploy', SLOT_A).decision === 'deny');
mutantCatches('checkout main not destructive', "=== 'origin/main'", "=== 'origin/main-x'",
  (m) => dec(m, 'git checkout origin/main', MAIN).decision === 'deny');
mutantCatches('R2 git-program marker dropped', "out.push({ cls: 'git-program'", "void ({ cls: 'git-program'",
  (m) => dec(m, "& 'C:/Program Files/Git/cmd/git.exe' status", MAIN, 'PowerShell').decision === 'deny'); // main cwd: the slot blanket deny would mask it
mutantCatches('R2 PowerShell-only filter dropped (leaks into Bash)', "tool === 'PowerShell' ? findings", 'true ? findings',
  (m) => dec(m, 'git status', SLOT_A, 'Bash').decision === 'allow');
// The Worker-slot PowerShell blanket deny is itself mutation-tested (probes use alias forms only the blanket deny catches).
mutantCatches('slot PowerShell blanket deny disabled', "tool === 'PowerShell' && isWorkerSlot(input.cwd)", "false && isWorkerSlot(input.cwd)",
  (m) => dec(m, 'New-Alias g git.exe; g push', SLOT_A, 'PowerShell').decision === 'deny' && dec(m, 'Get-ChildItem', SLOT_A, 'PowerShell').decision === 'deny');
mutantCatches('slot PowerShell blanket deny leaks into Bash / non-slot', "tool === 'PowerShell' && isWorkerSlot(input.cwd)", "isWorkerSlot(input.cwd)",
  (m) => dec(m, 'git status', SLOT_A, 'Bash').decision === 'allow' && dec(m, 'Get-ChildItem', MAIN, 'PowerShell').decision === 'allow');
mutantCatches('slot PowerShell blanket deny widened to every cwd', "tool === 'PowerShell' && isWorkerSlot(input.cwd)", "tool === 'PowerShell'",
  (m) => dec(m, 'Get-ChildItem', MAIN, 'PowerShell').decision === 'allow');
// (The former 'reason falls back to R1' mutant is dropped: with the blanket deny, the slot+git-program reason branch is unreachable.)
// AH-12 code-from-stdin mutants. Each probe holds the property on production and fails on the mutant.
const HEREDOC_BASH = 'bash <<EOF\ngit push\nEOF';
mutantCatches('stdin-fed interpreter check disabled', 'if (segStdinFed && STDIN_INTERPRETER_RE', 'if (false && STDIN_INTERPRETER_RE',
  (m) => dec(m, HEREDOC_BASH, MAIN).decision === 'deny' && dec(m, 'bash < script.sh', MAIN).decision === 'deny');
mutantCatches('pipe marker dropped (echo x | bash escapes)', 'out.push(fed ? PIPE_MARK + body : body)', 'out.push(body)',
  (m) => dec(m, 'echo git push | bash', MAIN).decision === 'deny');
mutantCatches('errexit -e counted as inline code (bash -e <<EOF escapes)', 'return args.some((a) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));',
  'return args.some((a) => /^-[a-zA-Z]*[ce][a-zA-Z]*$/.test(a));',
  (m) => dec(m, 'bash -e <<EOF\ngit push\nEOF', MAIN).decision === 'deny');
mutantCatches('/dev/null exemption removed (benign stdin over-blocked)', "!(op === '<' && w.text === '/dev/null')", 'true',
  (m) => dec(m, 'node qa/x_offline.js < /dev/null', MAIN).decision === 'allow');
mutantCatches('stdin redirect not counted', "if (c === '<' && !(op", "if (false && !(op",
  (m) => dec(m, 'bash < script.sh', MAIN).decision === 'deny' && dec(m, 'source <(echo git push)', MAIN).decision === 'deny');
mutantCatches('sh dropped from the interpreter list', '/^(?:bash|sh|zsh|dash|ash|ksh|csh|tcsh|fish|busybox|pwsh|', '/^(?:bash|zsh|dash|ash|ksh|csh|tcsh|fish|busybox|pwsh|',
  (m) => dec(m, "sh <<'EOF'\ngit merge x\nEOF", MAIN).decision === 'deny');
// AH-13 group / compound propagation mutants
mutantCatches('fed state not inherited by ( ) subshell groups', "i = scanCode(src, i + 1, ')', out, level + 1, fedNow());", "i = scanCode(src, i + 1, ')', out, level + 1, false);",
  (m) => dec(m, "printf 'git push\\n' | (bash)", MAIN).decision === 'deny');
mutantCatches('fed state not inherited by { } groups', "i = scanCode(src, i + 1, '}', out, level + 1, fedNow());", "i = scanCode(src, i + 1, '}', out, level + 1, false);",
  (m) => dec(m, "printf 'git push\\n' | { bash; }", MAIN).decision === 'deny');
mutantCatches('fed state not inherited by $( ) substitutions', "i = scanCode(src, i + 2, ')', out, level + 1, fedNow());\n      cur += '__SUB__';\n      continue;\n    }\n    if (c === '(')",
  "i = scanCode(src, i + 2, ')', out, level + 1, false);\n      cur += '__SUB__';\n      continue;\n    }\n    if (c === '(')",
  (m) => dec(m, 'echo x | echo $(bash)', MAIN).decision === 'deny');
mutantCatches('redirect on a ( ) / { } group ignored', 'function groupRedirected(src, i) {', 'function groupRedirected(src, i) {\n  return false;',
  (m) => dec(m, '(bash) < script.sh', MAIN).decision === 'deny' && dec(m, '{ bash; } <<< "git push"', MAIN).decision === 'deny');
mutantCatches('compound commands not tracked (pipe into while/if/for escapes)', 'if (opened) compounds.push', 'if (false) compounds.push',
  (m) => dec(m, 'echo x | while read l; do bash; done', MAIN).decision === 'deny');
mutantCatches('redirect on a compound (done < f) ignored', 'if (e && STDIN_REDIRECT_RE.test(head)) markFed', 'if (false && STDIN_REDIRECT_RE.test(head)) markFed',
  (m) => dec(m, 'while read l; do bash; done < f', MAIN).decision === 'deny');
mutantCatches('pass-through wrappers (sudo -u x / setsid) not followed', '} else if (segStdinFed && STDIN_PASSTHROUGH_RE', '} else if (false && STDIN_PASSTHROUGH_RE',
  (m) => dec(m, 'echo x | sudo -u root bash', MAIN).decision === 'deny' && dec(m, 'setsid bash < f', MAIN).decision === 'deny');
mutantCatches('every segment treated as fed (benign scripts over-blocked)', 'const fed = fedNow();', 'const fed = true;',
  (m) => dec(m, '(bash script.sh)', MAIN).decision === 'allow' && dec(m, 'echo x | (cat); bash script.sh', MAIN).decision === 'allow');
// AH-14 case-prefix mutants
mutantCatches('case header prefix not stripped', 'body = stripCaseHeaders(head);', 'body = text;',
  (m) => dec(m, 'case x in x) git push;; esac', MAIN).decision === 'deny');
mutantCatches('case arm prefix not stripped (later arms / a|b) escape)', 'body = stripCaseArm(text);', 'body = text;',
  (m) => dec(m, 'case x in a|b) git push;; esac', MAIN).decision === 'deny' && dec(m, 'case x in a) echo hi;; b) git push;; esac', MAIN).decision === 'deny');
mutantCatches('case scope not tracked (compound kind lost)', "top.kind === 'case'", "top.kind === 'caseX'",
  (m) => dec(m, 'case x in a) echo hi;; b) git push;; esac', MAIN).decision === 'deny');
mutantCatches('( ) group closes at a case-arm paren (fed state lost)', "!(closer === ')' &&", '!(false &&',
  (m) => dec(m, 'echo x | (case x in x) bash;; esac)', MAIN).decision === 'deny');
mutantCatches('esac exemption dropped (benign (case ...) over-blocked)', '!/^\\s*esac\\s*$/.test(cur) &&', 'true &&',
  (m) => dec(m, '(case x in x) echo hi;; esac)', MAIN).decision === 'allow');
mutantCatches('(pattern) arm form not stripped', 'const CASE_ARM_RE = /^\\s*(?:__SUB__|', 'const CASE_ARM_RE = /^\\s*(?:__NEVER__|',
  (m) => dec(m, 'case x in (a) git push;; esac', MAIN).decision === 'deny');
mutantCatches('quoted case patterns not handled', '/^\\s*(?:__SUB__|(?:"[^"]*"|\'[^\']*\'|[^\\s()"\'])*\\))\\s*/', '/^\\s*(?:__SUB__|(?:[^\\s()"\'])*\\))\\s*/',
  (m) => dec(m, 'case x in "a b") git push;; esac', MAIN).decision === 'deny');
mutantCatches('nested case headers not followed', 'guard < 8 &&', 'guard < 1 &&',
  (m) => dec(m, 'case x in a) case y in b) git push;; esac;; esac', MAIN).decision === 'deny');
mutantCatches('inline-code exemption removed (benign python -c over-blocked)', 'return args.some((a) => /^-[a-zA-Z]*[cm][a-zA-Z]*$/.test(a));', 'return false;',
  (m) => dec(m, 'python3 -c "print(1)" < data.json', MAIN).decision === 'allow');
// AH-15 mutants (r8): a subcommand dropped, the decision made slot-conditional again, the R3m reason reverted, and a prefix match over-blocking lookalikes.
for (const sub of ['merge', 'rebase', 'pull']) {
  mutantCatches('integration subcommand dropped (' + sub + ')', "['push', 'merge', 'rebase', 'pull']",
    '[' + ['push', 'merge', 'rebase', 'pull'].filter((s) => s !== sub).map((s) => "'" + s + "'").join(', ') + ']',
    (m) => ['git ' + sub + ' x'].every((c) => dec(m, c, MAIN).decision === 'deny' && dec(m, c, SLOT_A).decision === 'deny' && dec(m, c, '').decision === 'deny'));
}
mutantCatches('integration decision slot-conditional again (main ask)', "    case 'push':\n    case 'integration':\n      return 'deny';\n    case 'netlify':",
  "    case 'push':\n      return 'deny';\n    case 'integration':\n    case 'netlify':",
  (m) => ['git merge x', 'git rebase y', 'git pull'].every((c) => dec(m, c, MAIN).decision === 'deny'));
mutantCatches('R3m reason text reverted', "' - denied in every Claude Code session (R3m); run merge, rebase and pull manually from a normal terminal'", "''",
  (m) => { const r = dec(m, 'git merge x', MAIN).reason; return /R3m/.test(r) && /manually/.test(r); });
mutantCatches('integration match widened to a prefix (lookalikes over-blocked)', 'INTEGRATION_SUBCOMMANDS.indexOf(sub) !== -1', 'INTEGRATION_SUBCOMMANDS.some((s) => sub.indexOf(s) === 0)',
  (m) => dec(m, 'git merge x', MAIN).decision === 'deny' && dec(m, 'git merge-base a b', MAIN).decision === 'allow' && dec(m, 'git merge-tree a b c', SLOT_A).decision === 'allow');

// AH-16 mutants (r9). Six kinds, each with instances; every probe holds on production and fails on the mutant.
// (1) RC2 non-slot commit allowed  (2) branch check  (3) staged-set check  (4) plain-form / flag allowlist  (5) fail open on a read error  (6) RC4 ref moves
function mutantCatchesMulti(label, edits, probe) {
  let src;
  try { src = fs.readFileSync(HOOK_PATH, 'utf8').replace(/\r\n/g, '\n'); } catch (e) { check('MUT ' + label + ': hook source readable', false); return; }
  let mutated = src;
  for (const [find, replace] of edits) {
    const idx = mutated.indexOf(find);
    check('MUT ' + label + ': anchor present in production source (' + find.slice(0, 40).replace(/\n/g, ' ') + ')', idx !== -1);
    if (idx === -1) return;
    mutated = mutated.slice(0, idx) + replace + mutated.slice(idx + find.length);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-mut-'));
  try {
    const file = path.join(dir, 'pretooluse-guard.js');
    fs.writeFileSync(file, mutated);
    const mod = require(file);
    check('MUT ' + label + ': mutant is caught by its probe', probe(mod) === false);
    check('MUT ' + label + ': unmutated production passes the same probe', guard && probe(guard) === true);
  } catch (e) {
    check('MUT ' + label + ': mutant loads (' + e.message + ')', false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const cd = (m, cmd, cwd, head, staged, repo) => { try { return m.decide({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: cwd === undefined ? SLOT_A : cwd }, depsOf(head === undefined ? HEAD_TASK : head, staged === undefined ? [] : staged, undefined, repo)).decision; } catch (e) { return 'THROW'; } };
const selfRoot = (c) => c; // a repoRoot that agrees with whatever root the (mutated) slot resolver produced, so only the defence under test can deny
// (1) RC2
mutantCatchesMulti('non-slot commit allowed (RC2 dropped)',
  [['if (!slot) return briefCommitGate(f, cwd, gitCount, deps);', ''], ['return m ? m[1] : null;', 'return m ? m[1] : s;']],
  (m) => cd(m, 'git commit -m x', MAIN, undefined, undefined, selfRoot) === 'deny' && cd(m, 'git commit -m x', 'C:\\somewhere\\else', undefined, undefined, selfRoot) === 'deny');
mutantCatchesMulti('missing cwd trusted (unknown session commits)',
  [["if (typeof cwd !== 'string' || !cwd) return commitDeny(", 'if (false) return commitDeny('], ['return m ? m[1] : null;', 'return m ? m[1] : s;']],
  (m) => m.decide({ tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }, depsOf(HEAD_TASK, [], undefined, () => 'undefined')).decision === 'deny');
// (2) branch
mutantCatches('branch check dropped', '!TASK_BRANCH_RE.test(head.trim())', 'false',
  (m) => cd(m, 'git commit -m x', SLOT_A, 'ref: refs/heads/branch-dev') === 'deny' && cd(m, 'git commit -m x', SLOT_A, 'ref: refs/heads/main') === 'deny');
mutantCatches('branch regex widened to any branch', 'ref: refs\\/heads\\/task\\/[A-Za-z0-9._-]+', 'ref: refs\\/heads\\/[A-Za-z0-9._\\/-]+',
  (m) => cd(m, 'git commit -m x', SLOT_A, 'ref: refs/heads/branch-dev') === 'deny' && cd(m, 'git commit -m x', SLOT_A, 'ref: refs/heads/claude/x') === 'deny');
mutantCatches('detached HEAD accepted', '!TASK_BRANCH_RE.test(head.trim())', "!/^(?:ref: refs\\/heads\\/task\\/.+|[0-9a-f]{40})$/.test(head.trim())",
  (m) => cd(m, 'git commit -m x', SLOT_A, '0123456789abcdef0123456789abcdef01234567') === 'deny');
// (3) staged set
mutantCatches('staged-set check dropped', 'const bad = staged.find((p) => isStagedDenied(p));', 'const bad = undefined;',
  (m) => cd(m, 'git commit -m x', SLOT_A, HEAD_TASK, ['.claude/settings.json']) === 'deny');
mutantCatches('staged array validation dropped', '!Array.isArray(staged) ||', 'false ||',
  (m) => cd(m, 'git commit -m x', SLOT_A, HEAD_TASK, 'not-an-array') === 'deny');
for (const [name, find, replace, path0] of [
  ['settings', "'^\\\\.claude/settings[\\\\w.-]*\\\\.json$'", "'^__never__$'", '.claude/settings.local.json'],
  ['hooks', "'^\\\\.claude/hooks/'", "'^__never__$'", '.claude/hooks/pretooluse-guard.js'],
  ['CHECKPOINT.md', "'^checkpoint\\\\.md$'", "'^__never__$'", 'CHECKPOINT.md'],
  ['.env', "'^\\\\.env[\\\\w.-]*$'", "'^__never__$'", '.env.local'],
  ['work/*/brief.md', "'^work/[^/]+/brief\\\\.md$'", "'^__never__$'", 'work/foo/brief.md']
]) {
  mutantCatches('staged protected pattern dropped (' + name + ')', find, replace, (m) => cd(m, 'git commit -m x', SLOT_A, HEAD_TASK, ['qa/ok.js', path0]) === 'deny');
}
mutantCatches('staged pattern anchors dropped (brief.md.bak over-blocked)', "'^work/[^/]+/brief\\\\.md$'", "'^work/[^/]+/brief\\\\.md'",
  (m) => cd(m, 'git commit -m x', SLOT_A, HEAD_TASK, ['work/foo/brief.md.bak']) === 'allow' && cd(m, 'git commit -m x', SLOT_A, HEAD_TASK, ['work/foo/brief.md']) === 'deny');
// (4) plain form / flag allowlist
mutantCatches('-a accepted in a flag cluster', "const COMMIT_CLUSTER_OK = 'sqv';", "const COMMIT_CLUSTER_OK = 'sqva';",
  (m) => cd(m, 'git commit -am x') === 'deny');
mutantCatches('--all accepted', "const COMMIT_FLAGS_PLAIN = [", "const COMMIT_FLAGS_PLAIN = ['--all', ",
  (m) => cd(m, 'git commit --all -m x') === 'deny');
mutantCatchesMulti('--amend accepted (RC3 dropped: explicit check AND allowlist)',
  [["if (a === '--amend') return 'amend is not allowed (RC3) - add a new commit instead';", ''], ['const COMMIT_FLAGS_PLAIN = [', "const COMMIT_FLAGS_PLAIN = ['--amend', "]],
  (m) => cd(m, 'git commit --amend') === 'deny' && cd(m, 'git commit --amend -m x') === 'deny');
mutantCatches('--amend explicit RC3 check dropped (reason no longer names RC3)', "if (a === '--amend') return 'amend is not allowed (RC3) - add a new commit instead';", '',
  (m) => /RC3/.test(m.decide({ tool_name: 'Bash', tool_input: { command: 'git commit --amend' }, cwd: SLOT_A }, depsOf(HEAD_TASK, [])).reason));
mutantCatches('long-form flags accepted (--signoff / --quiet / --verbose are not in the approved allowlist)', "const COMMIT_FLAGS_PLAIN = [", "const COMMIT_FLAGS_PLAIN = ['--signoff', '--quiet', '--verbose', ",
  (m) => cd(m, 'git commit --signoff -m x') === 'deny' && cd(m, 'git commit --quiet -m x') === 'deny' && cd(m, 'git commit --verbose -m x') === 'deny');
mutantCatches('protected staged pattern made nested-equivalent (root-relative semantics broadened)', "\"'^\\\\.claude/hooks/'\"".slice(1, -1), "'(?:^|/)\\\\.claude/hooks/'",
  (m) => cd(m, 'git commit -m x', SLOT_A, HEAD_TASK, ['docs/.claude/hooks/x.md']) === 'allow' && cd(m, 'git commit -m x', SLOT_A, HEAD_TASK, ['.claude/hooks/x.js']) === 'deny');
mutantCatches('--no-verify accepted', "const COMMIT_FLAGS_PLAIN = [", "const COMMIT_FLAGS_PLAIN = ['--no-verify', ",
  (m) => cd(m, 'git commit --no-verify -m x') === 'deny');
mutantCatches('pathspec argument accepted', "return 'argument ' + a + ' is not allowed (pathspecs bypass the staged-set check)';", 'continue;',
  (m) => cd(m, 'git commit -m x file.txt') === 'deny');
mutantCatches('unknown long flag accepted', "if (a.startsWith('-')) return 'flag ' + a + ' is not in the commit allowlist';", "if (a.startsWith('-')) continue;",
  (m) => cd(m, 'git commit --author=a -m x') === 'deny');
mutantCatches('git global options accepted (-C / -c / --git-dir)', 'i !== 0 ?', 'false ?',
  (m) => cd(m, 'git -C x commit -m y') === 'deny' && cd(m, 'git --git-dir=y commit -m x') === 'deny');
mutantCatches('env prefix not tracked (GIT_DIR=x git commit)', 'w.shift();\n      via = true;', 'w.shift();',
  (m) => cd(m, 'GIT_DIR=x git commit -m y') === 'deny' && cd(m, 'GIT_INDEX_FILE=/tmp/i git commit -m x') === 'deny');
mutantCatches('generic wrapper not tracked (nohup / time git commit)', 'classifyWords(skipGenericWrapper(prog, args), depth, out, true)', 'classifyWords(skipGenericWrapper(prog, args), depth, out, false)',
  (m) => cd(m, 'nohup git commit -m x') === 'deny' && cd(m, 'time git commit -m x') === 'deny');
mutantCatches('xargs wrapper not tracked', "classifyWords(skipXargs(args), depth, out, true)", "classifyWords(skipXargs(args), depth, out, false)",
  (m) => cd(m, 'xargs git commit -m x') === 'deny');
mutantCatches('env wrapper not tracked (env A=1 git commit)', 'classifyWords(args.slice(i), depth, out, true);', 'classifyWords(args.slice(i), depth, out, false);',
  (m) => cd(m, 'env A=1 git commit -m x') === 'deny');
mutantCatches('non-git spelling accepted (/usr/bin/git, git.exe)', "via || w[0] !== 'git'", 'via',
  (m) => cd(m, '/usr/bin/git commit -m x') === 'deny' && cd(m, 'git.exe commit -m x') === 'deny');
mutantCatches('single top-level segment not required (git add && git commit)', 'depth === 0 && top.length === 1 && top[0] === segNo', 'depth === 0',
  (m) => cd(m, 'git add -A && git commit -m x') === 'deny' && cd(m, 'cd ../portfolio-tracker && git commit -m x') === 'deny' && cd(m, '(git commit -m x)') === 'deny');
mutantCatches('wrapped analyze depth ignored (bash -c "git commit")', 'depth === 0 && top.length', 'top.length',
  (m) => cd(m, 'bash -c "git commit -m x"') === 'deny' && cd(m, "sh -c 'git commit -m x'") === 'deny');
mutantCatches('second git in the same call ignored', 'if (gitCount > 1) return commitDeny(', 'if (false) return commitDeny(',
  (m) => cd(m, 'git commit -m "$(git add -A; echo m)"') === 'deny');
mutantCatches('commit findings routed through the old ask (gate bypassed)', 'const g = commitGate(f, input.cwd, slot, gitCount, gateDeps);', "const g = { decision: 'ask', reason: 'old' };",
  (m) => cd(m, 'git commit -m x', MAIN) === 'deny' && cd(m, 'git commit --amend') === 'deny');
// (5) fail open on a read error
mutantCatches('HEAD read error fails open', "return commitDeny('HEAD could not be read (' + (e && e.message ? e.message : String(e)) + ')');", "head = 'ref: refs/heads/task/x';",
  (m) => cd(m, 'git commit -m x', SLOT_A, () => { throw new Error('planted'); }) === 'deny');
mutantCatches('staged read error fails open', "return commitDeny('the staged set could not be read (' + (e && e.message ? e.message : String(e)) + ')');", 'staged = [];',
  (m) => cd(m, 'git commit -m x', SLOT_A, HEAD_TASK, () => { throw new Error('planted'); }) === 'deny');
mutantCatchesMulti('slot root unresolved fails open',
  [["if (root === null) return commitDeny('the Worker slot root could not be resolved');", ''], ["if (typeof repo !== 'string' ||", 'if (false &&']],
  (m) => cd(m, 'git commit -m x', 'pt-wt-worker-a') === 'deny');
// (6) RC4 ref moves
mutantCatches('RC4 update-ref on branch-dev/main dropped', 'return target !== undefined && isRefMoveTarget(target) ? why : null;', 'return null;',
  (m) => cd(m, 'git update-ref refs/heads/branch-dev HEAD', MAIN) === 'deny' && cd(m, 'git update-ref refs/heads/main abc', SLOT_A) === 'deny');
mutantCatches('RC4 update-ref --stdin allowed', "if (flags.indexOf('--stdin') !== -1) return", "if (false) return",
  (m) => cd(m, 'git update-ref --stdin', MAIN) === 'deny');
mutantCatches('RC4 branch -f dropped', 'if (force) return pos.length > 0 && isRefMoveTarget(pos[0]) ? why : null;', 'if (force) return null;',
  (m) => cd(m, 'git branch -f branch-dev abc', MAIN) === 'deny' && cd(m, 'git branch -f main abc', SLOT_A) === 'deny');
mutantCatches('RC4 branch -m/-M/-c/-C dropped', 'if (move) return pos.some(isRefMoveTarget) ? why : null;', 'if (move) return null;',
  (m) => cd(m, 'git branch -M main', MAIN) === 'deny' && cd(m, 'git branch -m x branch-dev', SLOT_A) === 'deny' && cd(m, 'git branch -C x main', MAIN) === 'deny');
mutantCatches('RC4 symbolic-ref dropped', 'return pos.length >= 2 && (isRefMoveTarget(pos[0]) || isRefMoveTarget(pos[1])) ? why : null;', 'return null;',
  (m) => cd(m, 'git symbolic-ref HEAD refs/heads/main', MAIN) === 'deny');
mutantCatches('RC4 target list narrowed (branch-dev dropped)', "const REF_MOVE_TARGETS = ['main', 'branch-dev'];", "const REF_MOVE_TARGETS = ['main'];",
  (m) => cd(m, 'git update-ref refs/heads/branch-dev HEAD', MAIN) === 'deny');
mutantCatches('RC4 refs/heads/ prefix not stripped', "REF_MOVE_TARGETS.indexOf(String(name).toLowerCase().replace(/^refs\\/heads\\//, ''))", 'REF_MOVE_TARGETS.indexOf(String(name).toLowerCase())',
  (m) => cd(m, 'git update-ref refs/heads/main abc', MAIN) === 'deny');
mutantCatches('RC4 block skipped (branch subcommand)', "if (sub === 'update-ref' || sub === 'symbolic-ref' || sub === 'branch') {", "if (false) {",
  (m) => cd(m, 'git branch -f main abc', MAIN) === 'deny');

// ── AH-8 settings static + AH-10 no regression ──────────────────────────────────────────
// Baseline settings.json at the brief's landing (pre-§5), kept as literals so the "exactly the §5
// additions" comparison is independent of the file under test.
const BASE_DENY = [
  'Edit(./.claude/settings.json)', 'Write(./.claude/settings.json)', 'Edit(./.claude/settings.local.json)', 'Write(./.claude/settings.local.json)',
  'Bash(git push --force*)', 'Bash(git push -f*)', 'Bash(git reset --hard*)', 'Bash(git clean -f*)', 'Bash(git clean -fd*)',
  'Bash(git branch -D*)', 'Bash(git branch --delete --force*)'
];
const BASE_ASK = [
  'Edit(./CLAUDE.md)', 'Write(./CLAUDE.md)', 'Edit(./AGENTS.md)', 'Write(./AGENTS.md)', 'Edit(./.gitignore)', 'Write(./.gitignore)',
  'Edit(./.claude/rules/**)', 'Write(./.claude/rules/**)', 'Edit(./qa/run-offline.js)', 'Write(./qa/run-offline.js)',
  'Edit(./work/*/brief.md)', 'Write(./work/*/brief.md)', 'Edit(./netlify.toml)', 'Write(./netlify.toml)',
  'Bash(git commit)', 'Bash(git commit *)', 'Bash(git push)', 'Bash(git push *)', 'Bash(git merge)', 'Bash(git merge *)',
  'Bash(git checkout main)', 'Bash(git checkout main *)', 'Bash(git switch main)', 'Bash(git switch main *)',
  'Bash(netlify deploy*)', 'Bash(netlify env:set*)', 'Bash(netlify env:unset*)', 'Bash(netlify env:clone*)', 'Bash(netlify env:import*)',
  'Bash(netlify sites:create*)', 'Bash(netlify sites:delete*)', 'Bash(netlify api*)',
  'mcp__claude_ai_Netlify__netlify-deploy-services-updater', 'mcp__claude_ai_Netlify__netlify-extension-services-updater',
  'mcp__claude_ai_Netlify__netlify-project-services-updater'
];
const BASE_ALLOW = [
  'Bash(npm run test:*)', 'Bash(npm run qa:offline)', 'Bash(node qa/*_offline.js)', 'Bash(codex review --uncommitted)',
  'Bash(git branch --show-current)', 'Bash(git status --short --branch)', 'Bash(git log --oneline -3)',
  'Bash(git log --oneline origin/main -1)', 'Bash(git log --oneline origin/branch-dev -1)', 'Bash(git diff --stat)',
  'Bash(git diff --cached --stat)', 'Bash(netlify status*)', 'Bash(netlify sites:list*)', 'Bash(netlify env:list*)',
  'Bash(netlify env:get*)', 'Bash(netlify logs*)',
  'mcp__claude_ai_Netlify__netlify-deploy-services-reader', 'mcp__claude_ai_Netlify__netlify-extension-services-reader',
  'mcp__claude_ai_Netlify__netlify-project-services-reader', 'mcp__claude_ai_Netlify__netlify-team-services-reader',
  'mcp__claude_ai_Netlify__netlify-user-services-reader', 'mcp__claude_ai_Netlify__get-netlify-coding-context'
];
// Brief §5 — rule strings as parsed (the JSON file must encode each backslash pair as four).
const MOVED_TO_DENY = ['Bash(git checkout main)', 'Bash(git checkout main *)', 'Bash(git switch main)', 'Bash(git switch main *)'];
const ADD_DENY = [
  'Edit(./.claude/hooks/**)', 'Write(./.claude/hooks/**)',
  'Bash(git push --force-with-lease*)', 'Bash(git push * --force*)', 'Bash(git push * -f*)', 'Bash(git push * --delete*)',
  'Bash(git -C * push --force*)', 'Bash(git -C * push -f*)', 'Bash(git -C * reset --hard*)', 'Bash(git -C * clean -f*)',
  'Bash(git -C * branch -D*)', 'Bash(git branch -d *)', 'Bash(git branch --delete *)',
  ...MOVED_TO_DENY,
  'Bash(git -C * checkout main*)', 'Bash(git -C * switch main*)',
  'Bash(bash -c *)', 'Bash(sh -c *)', 'Bash(cmd /c *)', 'Bash(cmd.exe /c *)', 'Bash(powershell *)', 'Bash(pwsh *)', 'Bash(eval *)',
  'PowerShell(git *)', 'PowerShell(git.exe *)', 'PowerShell(*\\\\git.exe *)', 'PowerShell(& git *)', 'PowerShell(netlify *)',
  'PowerShell(npx netlify *)', 'PowerShell(bash *)', 'PowerShell(sh *)', 'PowerShell(wsl *)', 'PowerShell(cmd *)',
  'PowerShell(cmd.exe *)', 'PowerShell(powershell *)', 'PowerShell(pwsh *)', 'PowerShell(Start-Process *)',
  'PowerShell(Invoke-Expression *)', 'PowerShell(iex *)'
];
const ADD_ASK = [
  'Bash(git -C * commit*)', 'Bash(git -c * commit*)', 'Bash(git -C * merge*)', 'Bash(git -C * push*)', 'Bash(git rebase*)',
  'Bash(git -C * rebase*)', 'Edit(./package.json)', 'Write(./package.json)', 'Edit(./package-lock.json)', 'Write(./package-lock.json)',
  'Bash(npm install*)', 'Bash(npm i *)', 'Bash(npm uninstall*)', 'Bash(npm update*)'
];
// RC5 (hook r9, Owner-applied): the four commit ask entries leave permissions.ask and plain commit joins permissions.allow; the hook is the gate.
const RC5_ASK_REMOVED = ['Bash(git commit)', 'Bash(git commit *)', 'Bash(git -C * commit*)', 'Bash(git -c * commit*)'];
const RC5_ALLOW_ADDED = ['Bash(git commit)', 'Bash(git commit *)'];
const EXPECT_ASK = [...BASE_ASK.filter((x) => MOVED_TO_DENY.indexOf(x) === -1), ...ADD_ASK].filter((x) => RC5_ASK_REMOVED.indexOf(x) === -1);
// work/owner-one-action-gates/brief.md §3: exactly these two entries added to permissions.allow
// (brief-request and protected-request - protected-commit stays prompting, record-gated).
const OAG_ALLOW_ADDED = [
  'Bash(node .claude/hooks/pt-land.js brief-request *)',
  'Bash(node .claude/hooks/pt-land.js protected-request *)'
];
// work/worker-continuous-flow/brief.md §3 (AL-1): exactly these 23 entries added to permissions.allow.
// Read-only inspection, offline QA, Codex read-only review, the pt-land.js request/cleanup verbs
// and the /tmp/pt-<task-id>/ scratch rule. No deny/ask/defaultMode/matcher change (AL-1).
const WCF_ALLOW_ADDED = [
  'Bash(grep *)', 'Bash(cat *)', 'Bash(head *)', 'Bash(tail *)', 'Bash(wc *)',
  'Bash(git status)', 'Bash(git status *)', 'Bash(git log)', 'Bash(git log *)',
  'Bash(git diff)', 'Bash(git diff *)', 'Bash(git show *)', 'Bash(git rev-parse *)',
  'Bash(git ls-files)', 'Bash(git ls-files *)',
  'Bash(node qa/*_test.js)', 'Bash(node qa/guard_integrity_check.js *)',
  'Bash(codex exec --sandbox read-only *)', 'Bash(mkdir -p /tmp/pt-*)',
  'Bash(node .claude/hooks/pt-land.js land-request *)', 'Bash(node .claude/hooks/pt-land.js push-request)',
  'Bash(node .claude/hooks/pt-land.js cleanup *)', 'Edit(//tmp/pt-*/**)'
];
const EXPECT_ALLOW = [...BASE_ALLOW, ...RC5_ALLOW_ADDED, ...WCF_ALLOW_ADDED, ...OAG_ALLOW_ADDED];
const HOOK_COMMAND = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/pretooluse-guard.js"';
// r10 R10-6: the Owner-applied matcher extends coverage to the file tools.
const R10_MATCHER = 'Bash|PowerShell|Write|Edit|MultiEdit|NotebookEdit';
// R11 Amendment 1 (A1-1, Owner-applied copy/hash): these twelve inert Write(...) rules are removed
// from settings.json at c35f76e lines 19,21,30,74,76,78,80,82,84,86,107,109. Each has an Edit(...)
// twin, in the SAME tier, that stays (the table in work/brief-commit-gate/brief.md "Amendment 1").
const R11_WRITE_REMOVED = [
  'Write(./.claude/settings.json)', 'Write(./.claude/settings.local.json)', 'Write(./.claude/hooks/**)',
  'Write(./CLAUDE.md)', 'Write(./AGENTS.md)', 'Write(./.gitignore)', 'Write(./.claude/rules/**)',
  'Write(./qa/run-offline.js)', 'Write(./work/*/brief.md)', 'Write(./netlify.toml)',
  'Write(./package.json)', 'Write(./package-lock.json)'
];
const R11_WRITE_REMOVED_TIER = {
  'Write(./.claude/settings.json)': 'deny', 'Write(./.claude/settings.local.json)': 'deny', 'Write(./.claude/hooks/**)': 'deny',
  'Write(./CLAUDE.md)': 'ask', 'Write(./AGENTS.md)': 'ask', 'Write(./.gitignore)': 'ask', 'Write(./.claude/rules/**)': 'ask',
  'Write(./qa/run-offline.js)': 'ask', 'Write(./work/*/brief.md)': 'ask', 'Write(./netlify.toml)': 'ask',
  'Write(./package.json)': 'ask', 'Write(./package-lock.json)': 'ask'
};
const EXPECT_DENY_R11 = [...BASE_DENY, ...ADD_DENY].filter((x) => R11_WRITE_REMOVED.indexOf(x) === -1);
const EXPECT_ASK_R11 = EXPECT_ASK.filter((x) => R11_WRITE_REMOVED.indexOf(x) === -1);

function sameSet(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  return a.length === sa.size && b.length === sb.size && sa.size === sb.size && [...sa].every((x) => sb.has(x));
}
// Returns a list of human-readable failures; [] means settings match brief §5 exactly.
function settingsProblems(s) {
  const p = [];
  const perms = (s && s.permissions) || {};
  const deny = Array.isArray(perms.deny) ? perms.deny : [];
  const ask = Array.isArray(perms.ask) ? perms.ask : [];
  const allow = Array.isArray(perms.allow) ? perms.allow : [];
  if (!sameSet(deny, EXPECT_DENY_R11)) p.push('deny set is not base + §5 additions - R11 Write(...) removals (A1-1)');
  if (!sameSet(ask, EXPECT_ASK_R11)) p.push('ask set is not (base − moved) + §5 additions − RC5 commit entries − R11 Write(...) removals (A1-1)');
  if (!sameSet(allow, EXPECT_ALLOW)) p.push('allow set is not base + RC5 (Bash(git commit) and Bash(git commit *))');
  if (allow.some((r) => /^Bash\(npm run \*\)$|node -e|python3? -c/.test(r))) p.push('broad allow (npm run * / node -e / python3 -c) present');
  if (perms.defaultMode !== 'default') p.push('defaultMode is not default (Manual)');
  if (/bypassPermissions|"auto"/.test(JSON.stringify(s))) p.push('bypassPermissions/auto present');
  if ([...deny, ...ask, ...allow].some((r) => /^Write\(/.test(r))) p.push('a Write(...) rule is present (R11 A1-1: none may remain)');
  for (const [entry, tier] of Object.entries(R11_WRITE_REMOVED_TIER)) {
    const editTwin = entry.replace(/^Write\(/, 'Edit(');
    const list = tier === 'deny' ? deny : ask;
    if (list.indexOf(editTwin) === -1) p.push('Edit twin missing/misplaced for ' + editTwin + ' (expected ' + tier + ')');
  }
  const pre = s && s.hooks && s.hooks.PreToolUse;
  const wired = Array.isArray(pre) && pre.some((e) => e && e.matcher === R10_MATCHER && Array.isArray(e.hooks) &&
    e.hooks.some((h) => h && h.type === 'command' && h.command === HOOK_COMMAND && h.timeout === 10));
  if (!wired) p.push('PreToolUse hook not wired with matcher ' + R10_MATCHER + ' / exact command / timeout 10');
  return p;
}
function appliedSettings() {
  return {
    hooks: { PreToolUse: [{ matcher: R10_MATCHER, hooks: [{ type: 'command', command: HOOK_COMMAND, timeout: 10 }] }] },
    permissions: {
      deny: EXPECT_DENY_R11.slice(),
      ask: EXPECT_ASK_R11.slice(),
      allow: EXPECT_ALLOW.slice(),
      defaultMode: 'default'
    }
  };
}
const clone = (o) => JSON.parse(JSON.stringify(o));

check('AH-8 control: §5-applied fixture has no problems', settingsProblems(appliedSettings()).length === 0);
{
  const m1 = clone(appliedSettings()); m1.permissions.deny.pop();
  const m2 = clone(appliedSettings()); m2.permissions.allow.push('Bash(npm run *)');
  const m3 = clone(appliedSettings()); m3.permissions.defaultMode = 'bypassPermissions';
  const m4 = clone(appliedSettings()); delete m4.hooks;
  const m5 = clone(appliedSettings()); m5.permissions.ask.push('Bash(git checkout main)');
  const m6 = clone(appliedSettings()); m6.hooks.PreToolUse[0].matcher = 'Bash';
  const m7 = clone(appliedSettings()); m7.permissions.allow.push('Bash(node -e ' + "'" + ' *)');
  const m8 = clone(appliedSettings()); m8.permissions.ask = m8.permissions.ask.filter((x) => x !== 'Edit(./package.json)');
  const m9 = clone(appliedSettings()); m9.permissions.deny = m9.permissions.deny.map((x) => x === 'PowerShell(*\\\\git.exe *)' ? 'PowerShell(*\\git.exe *)' : x);
  // RC5 planted negatives: a missing allow entry, a commit ask entry left behind (each of the four), a commit allow broadened past the two literals
  const m10 = clone(appliedSettings()); m10.permissions.allow = m10.permissions.allow.filter((x) => x !== 'Bash(git commit *)');
  const m11 = RC5_ASK_REMOVED.map((entry) => { const m = clone(appliedSettings()); m.permissions.ask.push(entry); return m; });
  const m12 = clone(appliedSettings()); m12.permissions.allow.push('Bash(git -C * commit*)');
  const m13 = clone(appliedSettings()); m13.permissions.allow.push('Bash(git commit:*)');
  const m14 = clone(appliedSettings()); m14.permissions.defaultMode = 'acceptEdits';
  check('AH-8 planted negatives: each mutated settings fixture is rejected',
    [m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m12, m13, m14, ...m11].every((m) => settingsProblems(m).length > 0));
  check('AH-8 planted negative (RC5): the pre-RC5 (r8) settings shape is rejected — commit ask entries present, commit allow entries absent',
    settingsProblems(Object.assign(clone(appliedSettings()), { permissions: Object.assign(clone(appliedSettings()).permissions, {
      ask: [...EXPECT_ASK, ...RC5_ASK_REMOVED], allow: BASE_ALLOW.slice() }) })).length > 0);
  check('AH-8 planted negative: pre-§5 baseline settings are rejected',
    settingsProblems({ permissions: { deny: BASE_DENY, ask: BASE_ASK, allow: BASE_ALLOW, defaultMode: 'acceptEdits' } }).length > 0);
}
// AH-8-W (R11 Amendment 1, A1-1): the twelve Write(...) rules are gone, their Edit(...) twins stay in tier, and
// no re-added Write(...), dropped Edit(...), tier-moved Edit(...) or allow-listed one of the 12 paths is accepted.
check('AH-8-W1: no rule in deny/ask/allow starts with Write( on the §5+A1-1 fixture',
  [...appliedSettings().permissions.deny, ...appliedSettings().permissions.ask, ...appliedSettings().permissions.allow]
    .every((r) => !/^Write\(/.test(r)));
{
  const negatives = [];
  for (const removed of R11_WRITE_REMOVED) {
    const m = clone(appliedSettings());
    m.permissions[R11_WRITE_REMOVED_TIER[removed] === 'deny' ? 'deny' : 'ask'].push(removed);
    negatives.push(m);
  }
  check('AH-8-W1 negative: re-adding any one removed Write(...) entry is rejected', negatives.every((m) => settingsProblems(m).length > 0));
}
{
  const negatives = [];
  for (const removed of R11_WRITE_REMOVED) {
    const editTwin = removed.replace(/^Write\(/, 'Edit(');
    const tier = R11_WRITE_REMOVED_TIER[removed];
    const list = tier === 'deny' ? 'deny' : 'ask';
    // dropping the Edit(...) twin
    const mDrop = clone(appliedSettings());
    mDrop.permissions[list] = mDrop.permissions[list].filter((x) => x !== editTwin);
    negatives.push(mDrop);
    // moving a deny-tier Edit(...) into ask (only meaningful for the 3 deny-tier paths)
    if (tier === 'deny') {
      const mMove = clone(appliedSettings());
      mMove.permissions.deny = mMove.permissions.deny.filter((x) => x !== editTwin);
      mMove.permissions.ask.push(editTwin);
      negatives.push(mMove);
    }
    // adding one of the 12 paths' Edit(...) to allow
    const mAllow = clone(appliedSettings());
    mAllow.permissions.allow.push(editTwin);
    negatives.push(mAllow);
  }
  check('AH-8-W2 negatives: dropping/moving an Edit(...) twin, or adding one to allow, is rejected', negatives.every((m) => settingsProblems(m).length > 0));
  check('AH-8-W2 control: every one of the 12 Edit(...) twins is present in exactly the table tier on the §5+A1-1 fixture',
    Object.keys(R11_WRITE_REMOVED_TIER).every((removed) => {
      const editTwin = removed.replace(/^Write\(/, 'Edit(');
      const tier = R11_WRITE_REMOVED_TIER[removed];
      const s = appliedSettings().permissions;
      return (tier === 'deny' ? s.deny : s.ask).indexOf(editTwin) !== -1;
    }));
}
check('AH-8-W3: Edit(...) is the only file-tool rule family (no MultiEdit(/NotebookEdit( rule) on the §5+A1-1 fixture',
  [...appliedSettings().permissions.deny, ...appliedSettings().permissions.ask, ...appliedSettings().permissions.allow]
    .every((r) => !/^(MultiEdit|NotebookEdit)\(/.test(r)));
{
  const mIntroduced = clone(appliedSettings());
  mIntroduced.permissions.deny.push('MultiEdit(./.claude/hooks/**)');
  check('AH-8-W3 negative: an introduced MultiEdit(...) rule does not silently pass (informational; deny-set-equality already rejects it)',
    settingsProblems(mIntroduced).length > 0);
}
let realSettings = null;
try { realSettings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); } catch (e) { realSettings = null; }
check('AH-8 settings file parses as JSON (' + path.relative(ROOT, SETTINGS_PATH) + ')', realSettings !== null);
if (realSettings) {
  const problems = settingsProblems(realSettings);
  check('AH-8 settings.json matches brief §5 exactly' + (problems.length ? ' — ' + problems.join('; ') : ''), problems.length === 0);
  // AH-6 rules leg: defence in depth only; the HOOK is the R2 enforcement (see PS_GIT), not these prefix rules.
  const deny = (realSettings.permissions && realSettings.permissions.deny) || [];
  check('AH-6/AH-8 PowerShell(git *) and PowerShell(git.exe *) are deny rules', deny.indexOf('PowerShell(git *)') !== -1 && deny.indexOf('PowerShell(git.exe *)') !== -1);
  // AH-10: every existing allow Bash pattern instantiated with a sample -> hook allows (both cwds).
  // RC5: the two commit allow rules are gated by the hook (AH-16), not "always allowed", so they are not instantiated here.
  // WCF: the three pt-land.js-wrapping rules need a real task/<id> sample and a real canonical
  // cwd/CLAUDE_PROJECT_DIR (R12), not AH-10's blind "*" -> "x" substitution and generic MAIN stub —
  // they are gated by R12 (AH-20/AH-23 below), not "always allowed", so they are not instantiated here.
  const WCF_PTLAND_ALLOW = [
    'Bash(node .claude/hooks/pt-land.js land-request *)', 'Bash(node .claude/hooks/pt-land.js push-request)',
    'Bash(node .claude/hooks/pt-land.js cleanup *)'
  ];
  // owner-one-action-gates: the two new request verbs need the same treatment - a real task/<id>
  // or work/<id>/brief.md sample and real slot/canonical context (G1/G2 below), not AH-10's blind
  // "*" -> "x" substitution.
  const bashAllow = ((realSettings.permissions && realSettings.permissions.allow) || [])
    .filter((r) => /^Bash\(.*\)$/.test(r) && RC5_ALLOW_ADDED.indexOf(r) === -1 &&
      WCF_PTLAND_ALLOW.indexOf(r) === -1 && OAG_ALLOW_ADDED.indexOf(r) === -1);
  const sample = (rule) => rule.slice(5, -1).replace(/\*/g, 'x');
  check('AH-10 found existing Bash allow patterns to instantiate', bashAllow.length >= BASE_ALLOW.filter((r) => /^Bash\(/.test(r)).length);
  for (const rule of bashAllow) {
    const cmd = sample(rule);
    for (const cwd of [SLOT_A, MAIN]) {
      const r = d(cmd, cwd);
      check('AH-10 ' + rule + ' -> "' + cmd + '" allow (got ' + r.decision + ')', r.decision === 'allow');
    }
  }
}
// AH-10 control independent of the settings file: the base allow patterns themselves.
for (const rule of BASE_ALLOW.filter((r) => /^Bash\(/.test(r))) {
  const cmd = rule.slice(5, -1).replace(/\*/g, 'x');
  check('AH-10 (base) ' + rule + ' -> allow', d(cmd, SLOT_A).decision === 'allow' && d(cmd, MAIN).decision === 'allow');
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// AH-17 — r10 bypass families (brief §1 T1–T5) -> deny in slot / main / missing-cwd (decide + CLI).
// AH-18 — R10-8 integrity check. Plus R10-1..R10-8 production mutants.
// ══════════════════════════════════════════════════════════════════════════════════════════
const integrity = require(path.join(ROOT, 'qa', 'guard_integrity_check.js'));
const IDENTITY_FT = Object.assign({}, TEST_DEPS, { resolveFileToolTarget: (c, x) => String(x) });
const AH17_CWDS = [SLOT_A, MAIN, NO_CWD];
function dAtF(command, cwd) { // dAt but forces the identity file-resolver hermetic stub set
  if (!guard) return { decision: 'NOMODULE', reason: '' };
  const input = { tool_name: 'Bash', tool_input: { command } };
  if (cwd !== NO_CWD) input.cwd = cwd;
  try { return guard.decide(input, IDENTITY_FT); } catch (e) { return { decision: 'THROW', reason: String(e && e.message) }; }
}
function denyAll(label, rows, reasonRe) {
  for (const cmd of rows) for (const cwd of AH17_CWDS) {
    const r = dAtF(cmd, cwd);
    check('AH-17 ' + label + ' [' + cwdLabel(cwd) + '] ' + JSON.stringify(cmd) + ' -> deny (got ' + r.decision + ')',
      r.decision === 'deny' && (!reasonRe || reasonRe.test(r.reason)));
  }
}

// ── AH-17a R10-1 escape differential ──
const T1_ESCAPE_DENY = ['g\\it push', 'git pu\\sh', 'git me\\rge x', 'git re\\base x', 'git pu\\ll', 'git c\\ommit -am x',
  'git reset --h\\ard', 'git checkout ma\\in', 'git update-ref refs/heads/branch-d\\ev X', 'n\\etlify deploy --prod'];
denyAll('T1 escape-diff', T1_ESCAPE_DENY);
check('AH-17 T1d PowerShell backtick escape at main -> deny', dAtF('g`it push', MAIN).decision === 'deny' || d('g`it push', MAIN, 'PowerShell').decision === 'deny');
for (const c of ['echo a\\ b', 'echo hi', 'git status'])
  check('AH-17 escape control (literal unchanged) allow ' + JSON.stringify(c), dAtF(c, SLOT_A).decision === 'allow');
check('AH-17 stripShellEscapes Bash strips unquoted backslash', guard && guard.stripShellEscapes('g\\it push', 'Bash') === 'git push');
check('AH-17 stripShellEscapes single-quote preserved', guard && guard.stripShellEscapes("echo 'a\\b'", 'Bash') === "echo 'a\\b'");
check('AH-17 stripShellEscapes PowerShell backtick stripped', guard && guard.stripShellEscapes('g`it push', 'PowerShell') === 'git push');

// ── AH-17b R10-2 subcommand allowlist + git-<sub> ──
const T2_DENY = ['git p', 'git -c alias.p=push p', 'git -c alias.ci=commit ci -am x', 'git -c alias.m=merge m x',
  'git --config-env=alias.p=V p', 'git zzz', 'git lfs push', 'git-push', 'git-lfs push',
  '"C:/Program Files/Git/mingw64/libexec/git-core/git-push.exe" origin x'];
denyAll('T2 unknown-sub', T2_DENY, /R10-A|push/);
for (const c of ['git status', 'git log --oneline -3', 'git diff --stat', 'git show HEAD', 'git rev-parse HEAD', 'git worktree list'])
  check('AH-17 T2 known-sub control allow ' + c, dAtF(c, SLOT_A).decision === 'allow');
check('AH-17 R10-2 allowlist push/commit/reset present, zzz absent, size>150',
  guard && guard.KNOWN_GIT_SUBCOMMANDS.has('push') && guard.KNOWN_GIT_SUBCOMMANDS.has('commit') && guard.KNOWN_GIT_SUBCOMMANDS.has('reset') &&
  !guard.KNOWN_GIT_SUBCOMMANDS.has('zzz') && guard.KNOWN_GIT_SUBCOMMANDS.size > 150);

// ── AH-17c R10-3 config execution paths ──
const T3_CONFIG_DENY = ['git config core.hooksPath /tmp/h', 'git config include.path /tmp/f', 'git config --add includeIf.gitdir:x.path /tmp/f',
  'git config core.fsmonitor /tmp/p', 'git -c core.fsmonitor=/tmp/p status', 'git -c core.hooksPath=/tmp/h status', 'git -c include.path=/tmp/f log',
  'git --config-env=core.hooksPath=X status', 'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/tmp/h git checkout x',
  'GIT_CONFIG_GLOBAL=/tmp/g git status', 'GIT_CONFIG_SYSTEM=/tmp/s git status', 'GIT_CONFIG_PARAMETERS=x git status'];
denyAll('T3 config-exec', T3_CONFIG_DENY, /R10-3/);
for (const c of ['git config --get core.hooksPath', 'git config --get-regexp core', 'git config --list', 'git config pull.rebase true'])
  check('AH-17 R10-3 read/benign control allow ' + c, dAtF(c, SLOT_A).decision === 'allow');

// ── AH-17d R10-3c .git writers ──
const T3_DOTGIT_DENY = ['echo x > .git/config', 'echo x >> .git/hooks/pre-commit', 'cp x ../portfolio-tracker/.git/hooks/pre-commit',
  'cp x .git/config', 'mv x .git/hooks/pre-commit', 'tee .git/config', 'sed -i s/a/b/ .git/config', 'echo x > ./.git/config',
  'echo x > sub/.git/hooks/h', 'cp x C:/repo/.GIT/hooks/h', 'Set-Content .git/config x',
  'node -e "require(\'fs\').writeFileSync(\'.git/hooks/pre-commit\',\'x\')"'];
denyAll('T3c dotgit-write', T3_DOTGIT_DENY);
for (const c of ['echo x > .github/workflows/ci.yml', 'cp x .gitmodules', 'echo x > sub/notes.txt'])
  check('AH-17 T3c non-.git control allow ' + c, dAtF(c, SLOT_A).decision === 'allow');

// ── AH-17e R10-4 ref-moving ──
const T4_DENY = ['git update-ref HEAD abc', 'git update-ref --no-deref HEAD abc', 'git branch -m newname', 'git branch -M single',
  'git checkout -B branch-dev', 'git checkout -Bbranch-dev', 'git checkout -BBRANCH-DEV', 'git switch -C branch-dev', 'git switch -Cbranch-dev',
  'git switch --force-create branch-dev', 'git checkout -B refs/heads/main', 'git checkout -B main', 'git switch -Cmain',
  'git worktree add -B branch-dev ../w', 'git worktree add -Bmain ../w', 'git worktree add ../w branch-dev', 'git worktree add ../w main',
  'git worktree add -f ../w branch-dev', 'git worktree add --detach ../w branch-dev', 'git worktree add --ignore-other-worktrees ../w abc',
  'git checkout --ignore-other-worktrees x', 'git switch --ignore-other-worktrees branch-dev'];
denyAll('T4 refmove', T4_DENY, /R10-4|RC4/);
for (const c of ['git checkout -B task/x', 'git switch -c task/y', 'git checkout -B branch-dev-feature', 'git branch -m old new',
  'git worktree add ../w task/z', 'git worktree add ../w', 'git worktree add -b task/w ../w', 'git worktree add ../w HEAD~1', 'git checkout -b feature main'])
  check('AH-17 T4 control allow ' + c, dAtF(c, SLOT_A).decision === 'allow');

// ── AH-17f R10-5 other ref-moving / commit-creating ──
const T5_DENY = ['git cherry-pick abc', 'git revert HEAD', 'git am x.patch', 'git filter-branch --all',
  'git fetch . task/x:branch-dev', 'git fetch origin +main:main', 'git fetch --refmap=+refs/heads/*:refs/heads/main origin',
  'git fetch origin refs/heads/x:refs/heads/branch-dev', 'git fetch --mirror origin',
  'git config remote.origin.fetch +refs/heads/*:refs/heads/*', 'git config remote.origin.mirror true', 'git config --add remote.o.fetch x',
  'git remote add --mirror=fetch m .', 'git remote add --mirror=push m .', 'git remote add --mirror m .'];
denyAll('T5 refmove-commit', T5_DENY, /R10-5/);
for (const c of ['git fetch origin', 'git fetch origin refs/heads/x:refs/heads/feature', 'git config --get remote.origin.fetch', 'git remote add -m master m .', 'git remote -v'])
  check('AH-17 T5 control allow ' + c, dAtF(c, SLOT_A).decision === 'allow');

// ── AH-17f R10-5 canonical reset (HEAD=branch-dev/main; slot keeps old behavior) ──
function decCanonReset(cmd) {
  const deps = Object.assign({}, depsOf('ref: refs/heads/branch-dev', [], undefined, () => MAIN),
    { pathExists: (p) => path.basename(String(p)) === 'keep.txt', resolveFileToolTarget: (c, r) => String(r) });
  try { return guard.decide({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: MAIN }, deps).decision; } catch (e) { return 'THROW'; }
}
for (const c of ['git reset --soft HEAD~1', 'git reset --mixed HEAD~1', 'git reset HEAD~1', 'git reset abc123', 'git reset --soft branch-dev', 'git reset nonexistent-file'])
  check('AH-17 R10-5 canonical reset deny ' + c, decCanonReset(c) === 'deny');
for (const c of ['git reset', 'git reset -q', 'git reset --quiet', 'git reset HEAD', 'git reset -q HEAD', 'git reset -- keep.txt', 'git reset -q -- keep.txt', 'git reset HEAD -- keep.txt', 'git reset HEAD keep.txt', 'git reset keep.txt'])
  check('AH-17 R10-5 canonical harmless reset allow ' + c, decCanonReset(c) === 'allow');
for (const c of ['git reset --soft HEAD~1', 'git reset HEAD~1'])
  check('AH-17 R10-5 slot reset keeps old behavior (allow) ' + c, dAtF(c, SLOT_A).decision === 'allow');
check('AH-17 R10-5 canonical reset with GIT_DIR override -> deny',
  guard && guard.decide({ tool_name: 'Bash', tool_input: { command: 'GIT_DIR=x git reset --soft HEAD~1' }, cwd: MAIN }, depsOf('ref: refs/heads/branch-dev', [], undefined, () => MAIN)).decision === 'deny');

// ── AH-17g R10-6 file-tool guard ──
function df(tool, fp, cwd, deps) { try { return guard.decide({ tool_name: tool, tool_input: { file_path: fp }, cwd }, deps || IDENTITY_FT).decision; } catch (e) { return 'THROW'; } }
const FILE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];
const DOTGIT_PATHS = ['.git/config', './.git/hooks/pre-commit', '../portfolio-tracker/.git/hooks/x', 'sub/.git/x', 'C:/repo/.GIT/config', 'a/b/../.git/x'];
for (const tool of FILE_TOOLS) for (const fp of DOTGIT_PATHS) for (const cwd of [SLOT_A, MAIN, NO_CWD])
  check('AH-17 R10-6 ' + tool + ' [' + cwdLabel(cwd) + '] ' + fp + ' -> deny', df(tool, fp, cwd) === 'deny');
check('AH-17 R10-6 NotebookEdit notebook_path .git -> deny',
  guard && guard.decide({ tool_name: 'NotebookEdit', tool_input: { notebook_path: '.git/x.ipynb' }, cwd: SLOT_A }, IDENTITY_FT).decision === 'deny');
check('AH-17 R10-6 missing path -> deny', guard && guard.decide({ tool_name: 'Write', tool_input: {}, cwd: SLOT_A }, IDENTITY_FT).decision === 'deny');
for (const fp of ['index.html', 'work/x/review.md', '.github/workflows/ci.yml', '.gitignore', 'qa/x_offline.js', 'C:/repo/src/app.js'])
  check('AH-17 R10-6 benign file-tool allow ' + fp, df('Write', fp, SLOT_A) === 'allow');
check('AH-17 R10-6 Read tool -> allow (no opinion)', guard && guard.decide({ tool_name: 'Read', tool_input: { file_path: '.git/config' }, cwd: SLOT_A }, IDENTITY_FT).decision === 'allow');
// real resolver: deepest existing ancestor, junction, fail-closed
if (guard) {
  const ftBase = fs.mkdtempSync(path.join(os.tmpdir(), 'ah17-ft-'));
  try {
    fs.mkdirSync(path.join(ftBase, '.git', 'hooks'), { recursive: true });
    fs.mkdirSync(path.join(ftBase, 'work'), { recursive: true });
    const realWrite = (fp) => guard.decide({ tool_name: 'Write', tool_input: { file_path: fp }, cwd: ftBase }).decision;
    check('AH-17 R10-6 real: existing .git target -> deny', realWrite(path.join(ftBase, '.git', 'hooks', 'pre-commit')) === 'deny');
    check('AH-17 R10-6 real: new file, existing parent -> allow', realWrite(path.join(ftBase, 'work', 'plan.md')) === 'allow');
    check('AH-17 R10-6 real: new file in NEW subdir (deepest ancestor) -> allow', realWrite(path.join(ftBase, 'work', 'newid', 'brief.md')) === 'allow');
    check('AH-17 R10-6 real: new file in NEW nested subdir -> allow', realWrite(path.join(ftBase, 'a', 'b', 'c', 'x.txt')) === 'allow');
    check('AH-17 R10-6 real: relative new file in new subdir -> allow', guard.decide({ tool_name: 'Write', tool_input: { file_path: 'work/newid2/plan.md' }, cwd: ftBase }).decision === 'allow');
    check('AH-17 R10-6 real: unresolvable cwd -> deny', guard.decide({ tool_name: 'Write', tool_input: { file_path: 'x.txt' }, cwd: path.join(ftBase, 'nope', 'deeper') }).decision === 'deny');
    let junctionMade = false;
    try { fs.symlinkSync(path.join(ftBase, '.git'), path.join(ftBase, 'link-to-git'), 'junction'); junctionMade = true; } catch (e) { junctionMade = false; }
    check('AH-17 R10-6 real: junction into .git -> deny' + (junctionMade ? '' : ' (skipped, no privilege)'),
      junctionMade ? realWrite(path.join(ftBase, 'link-to-git', 'config')) === 'deny' : true);
  } finally { fs.rmSync(ftBase, { recursive: true, force: true }); }
}

// ── AH-17 R10-7 time budget ──
check('AH-17 R10-7 spawnBudgetMs caps at 4000', guard && guard.spawnBudgetMs(Date.now() + 100000) === 4000);
check('AH-17 R10-7 spawnBudgetMs shrinks near deadline', guard && (() => { const v = guard.spawnBudgetMs(Date.now() + 400); return v > 0 && v <= 400; })());
check('AH-17 R10-7 spawnBudgetMs throws when exhausted', guard && (() => { try { guard.spawnBudgetMs(Date.now() - 1); return false; } catch (e) { return true; } })());

// ── AH-17 CLI (real spawn) sample -> exit 2 ──
for (const cmd of ['g\\it push', 'git p', 'git config core.hooksPath /tmp/h', 'git update-ref HEAD abc', 'git worktree add ../w branch-dev', 'git cherry-pick abc', 'git remote add --mirror m .', 'echo x > .git/config']) {
  const r = spawnCli(payload(cmd, SLOT_A));
  check('AH-17 CLI [slot] ' + JSON.stringify(cmd) + ' -> exit 2', r.status === 2 && r.stdout === '');
}
{
  const denyFt = spawnCli(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: 'C:/x/.git/config' }, cwd: SLOT_A }));
  check('AH-17 CLI Write .git target -> exit 2', denyFt.status === 2 && denyFt.stdout === '');
  const okFt = spawnCli(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: path.join(SLOT_A, 'qa', 'ah17_probe.js') }, cwd: SLOT_A }));
  check('AH-17 CLI Write ordinary (existing parent) -> exit 0', okFt.status === 0 && okFt.stdout === '');
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// AH-18 — R10-8 integrity check: clean PASS, 7 induced FAILs, report-only, usage error (temp repo).
// ══════════════════════════════════════════════════════════════════════════════════════════
{
  const gv = spawnSync('git', ['--version'], { encoding: 'utf8' });
  check('AH-18 git available on PATH', gv.status === 0);
  if (gv.status === 0) {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ah18-'));
    const canonical = path.join(base, 'portfolio-tracker');
    const slotA = path.join(base, 'pt-wt-worker-a');
    const slotB = path.join(base, 'pt-wt-worker-b');
    const G = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=ah', '-c', 'user.email=ah@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8' });
    const put = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
    const run = (opts) => integrity.runIntegrity(Object.assign({ root: canonical, gitExec: 'git' }, opts));
    try {
      fs.mkdirSync(canonical, { recursive: true });
      G(canonical, 'init', '-q', '-b', 'main');
      put(canonical, '.claude/settings.json', '{"a":1}\n');
      put(canonical, 'keep.txt', 'k\n');
      G(canonical, 'add', '-A');
      G(canonical, 'commit', '-q', '-m', 'seed');
      G(canonical, 'branch', 'branch-dev');
      G(canonical, 'worktree', 'add', '-q', '-b', 'task/x', slotA, 'branch-dev');
      G(canonical, 'worktree', 'add', '-q', '-b', 'task/y', slotB, 'branch-dev');
      const baseMain = G(canonical, 'rev-parse', 'main').stdout.trim();
      const baseDev = G(canonical, 'rev-parse', 'branch-dev').stdout.trim();
      // clean PASS (no --since so C2 skipped)
      const clean = run({ baseMain, baseDev, task: 'task/x' });
      check('AH-18 clean fixture -> PASS (ok, no failures): ' + clean.failures.join('; '), clean.ok === true && clean.failures.length === 0);
      // C1
      const c1 = run({ baseMain: '0'.repeat(40), baseDev, task: 'task/x' });
      check('AH-18 C1 wrong base-main -> FAIL', c1.ok === false && c1.failures.some((f) => /^C1/.test(f)));
      // C2 (since epoch -> any reflog entry is newer)
      const c2 = run({ baseMain, baseDev, task: 'task/x', since: '1970-01-01T00:00:00Z' });
      check('AH-18 C2 reflog newer than --since -> FAIL', c2.ok === false && c2.failures.some((f) => /^C2/.test(f)));
      // C2 (Codex FIX): a future --since with reflogs intact -> no C2; a deleted reflog on a protected ref -> C2 FAIL (fail-closed)
      const future = new Date(Date.now() + 86400000).toISOString();
      const c2quiet = run({ baseMain, baseDev, task: 'task/x', since: future });
      check('AH-18 C2 future --since, reflogs intact -> no C2', !c2quiet.failures.some((f) => /^C2/.test(f)));
      const devReflog = path.join(canonical, '.git', 'logs', 'refs', 'heads', 'branch-dev');
      const savedReflog = fs.readFileSync(devReflog);
      fs.rmSync(devReflog, { force: true });
      const c2err = run({ baseMain, baseDev, task: 'task/x', since: future });
      fs.mkdirSync(path.dirname(devReflog), { recursive: true }); fs.writeFileSync(devReflog, savedReflog);
      check('AH-18 C2 deleted protected-ref reflog -> FAIL (fail-closed)', c2err.ok === false && c2err.failures.some((f) => /^C2/.test(f)));
      // C3 alias / protected key
      G(canonical, 'config', 'alias.foo', 'status');
      const c3 = run({ baseMain, baseDev, task: 'task/x' });
      G(canonical, 'config', '--unset', 'alias.foo');
      check('AH-18 C3 alias present -> FAIL', c3.ok === false && c3.failures.some((f) => /^C3/.test(f)));
      // C4 non-sample hook
      put(canonical, '.git/hooks/pre-commit', '#!/bin/sh\n');
      const c4 = run({ baseMain, baseDev, task: 'task/x' });
      fs.rmSync(path.join(canonical, '.git', 'hooks', 'pre-commit'), { force: true });
      check('AH-18 C4 non-sample hook -> FAIL', c4.ok === false && c4.failures.some((f) => /^C4/.test(f)));
      // C5 governance file differs from HEAD in a worktree
      put(slotA, '.claude/settings.json', '{"a":2}\n');
      const c5 = run({ baseMain, baseDev, task: 'task/x' });
      G(slotA, 'checkout', '--', '.claude/settings.json');
      check('AH-18 C5 governance file differs from HEAD -> FAIL', c5.ok === false && c5.failures.some((f) => /^C5/.test(f)));
      // C6 base-dev...task touches a protected path
      put(slotA, '.claude/settings.json', '{"a":3}\n');
      G(slotA, 'add', '.claude/settings.json');
      G(slotA, 'commit', '-q', '-m', 'touch protected');
      const c6 = run({ baseMain, baseDev, task: 'task/x' });
      check('AH-18 C6 base-dev...task touches protected -> FAIL', c6.ok === false && c6.failures.some((f) => /^C6/.test(f)));
      G(slotA, 'reset', '-q', '--hard', 'branch-dev');
      // AH-18 C6 exemption (work/owner-one-action-gates/brief.md §8): a PROTECTED-approved hit - an ok
      // protected-commit audit entry for the task whose `to` is an ancestor of the task tip with
      // to^{tree} == tree, and the blob at the tip equal to the blob in that tree - passes C6; every
      // other hit, and every never-exempt path, still FAILs.
      {
        const auditPath = path.join(canonical, '.git', 'pt-land-log');
        const writeAudit = (entries) => fs.writeFileSync(auditPath, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
        put(slotA, '.claude/hooks/approved.js', 'module.exports = 1;\n');
        G(slotA, 'add', '.claude/hooks/approved.js');
        G(slotA, 'commit', '-q', '-m', 'chore(protected): apply Owner-approved files (task/x, tree x)');
        const tipA = G(slotA, 'rev-parse', 'HEAD').stdout.trim();
        const treeA = G(slotA, 'rev-parse', 'HEAD^{tree}').stdout.trim();
        const entry = (o) => Object.assign({ ts: '2026-01-01T00:00:00.000Z', verb: 'protected-commit', task: 'task/x', from: baseDev, to: tipA, tree: treeA, result: 'ok' }, o);
        const c6Hit = (r) => r.failures.some((f) => /^C6 .*approved\.js/.test(f));
        writeAudit([entry()]);
        const c6ok = run({ baseMain, baseDev, task: 'task/x' });
        check('AH-18 C6 PROTECTED-approved hooks diff (ok entry, ancestor, tree + blob match) -> PASS: ' + c6ok.failures.join('; '), c6ok.ok === true && !c6Hit(c6ok));
        for (const [label, entries] of [
          ['no entry', null],
          ['entry for another task', [entry({ task: 'task/y' })]],
          ['entry with result refuse', [entry({ result: 'refuse' })]],
          ['entry for another verb', [entry({ verb: 'land' })]],
          ['entry tree != to^{tree}', [entry({ tree: '0'.repeat(40) })]],
          ['malformed audit line only', 'not json\n']
        ]) {
          if (entries === null) fs.rmSync(auditPath, { force: true });
          else if (typeof entries === 'string') fs.writeFileSync(auditPath, entries);
          else writeAudit(entries);
          const r = run({ baseMain, baseDev, task: 'task/x' });
          check('AH-18 C6 ' + label + ' -> FAIL', r.ok === false && c6Hit(r));
        }
        // `to` not an ancestor of the task tip: an otherwise-valid ok entry pointing at slot B's commit.
        put(slotB, '.claude/hooks/approved.js', 'module.exports = 1;\n');
        G(slotB, 'add', '.claude/hooks/approved.js');
        G(slotB, 'commit', '-q', '-m', 'other task');
        writeAudit([entry({ to: G(slotB, 'rev-parse', 'HEAD').stdout.trim(), tree: G(slotB, 'rev-parse', 'HEAD^{tree}').stdout.trim() })]);
        const c6anc = run({ baseMain, baseDev, task: 'task/x' });
        check('AH-18 C6 entry `to` not an ancestor of the task tip -> FAIL', c6anc.ok === false && c6Hit(c6anc));
        G(slotB, 'reset', '-q', '--hard', 'branch-dev');
        // blob changed after approval -> FAIL; a later ok entry for the new tip (most recent wins) -> PASS.
        writeAudit([entry()]);
        put(slotA, '.claude/hooks/approved.js', 'module.exports = 2;\n');
        G(slotA, 'add', '.claude/hooks/approved.js');
        G(slotA, 'commit', '-q', '-m', 'edit after approval');
        const c6blob = run({ baseMain, baseDev, task: 'task/x' });
        check('AH-18 C6 blob changed after approval -> FAIL', c6blob.ok === false && c6Hit(c6blob));
        const tipA2 = G(slotA, 'rev-parse', 'HEAD').stdout.trim();
        writeAudit([entry(), entry({ from: tipA, to: tipA2, tree: G(slotA, 'rev-parse', 'HEAD^{tree}').stdout.trim() })]);
        const c6later = run({ baseMain, baseDev, task: 'task/x' });
        check('AH-18 C6 a later ok entry for the re-approved blob (most recent wins) -> PASS: ' + c6later.failures.join('; '), c6later.ok === true && !c6Hit(c6later));
        // never-exempt paths FAIL even with a matching ok entry.
        for (const never of ['work/x/brief.md', 'CHECKPOINT.md', '.env']) {
          G(slotA, 'reset', '-q', '--hard', 'branch-dev');
          put(slotA, never, 'x\n');
          G(slotA, 'add', '-f', never);
          G(slotA, 'commit', '-q', '-m', 'never-exempt path');
          writeAudit([entry({ to: G(slotA, 'rev-parse', 'HEAD').stdout.trim(), tree: G(slotA, 'rev-parse', 'HEAD^{tree}').stdout.trim() })]);
          const r = run({ baseMain, baseDev, task: 'task/x' });
          check('AH-18 C6 never-exempt ' + never + ' with a matching ok entry -> FAIL', r.ok === false && r.failures.some((f) => f.indexOf('C6 ') === 0 && f.indexOf(never) !== -1));
        }
        fs.rmSync(auditPath, { force: true });
        G(slotA, 'reset', '-q', '--hard', 'branch-dev');
      }
      // C7 extra worktree
      const extra = path.join(base, 'pt-wt-worker-extra');
      G(canonical, 'worktree', 'add', '-q', '-b', 'task/extra', extra, 'branch-dev');
      const c7 = run({ baseMain, baseDev, task: 'task/x' });
      check('AH-18 C7 unexpected worktree set -> FAIL', c7.ok === false && c7.failures.some((f) => /^C7/.test(f)));
      G(canonical, 'worktree', 'remove', '--force', extra);
      // C5 (Codex FIX): an UNTRACKED planted hook (the primary tamper vector, not gitignored) differs from HEAD -> FAIL.
      // A gitignored .claude/settings.local.json is intentionally NOT flagged (legit DENY-tier local file); control below.
      put(slotA, '.claude/hooks/evil.js', '//evil\n');
      const c5u = run({ baseMain, baseDev, task: 'task/x' });
      fs.rmSync(path.join(slotA, '.claude', 'hooks', 'evil.js'), { force: true });
      check('AH-18 C5 untracked planted hook -> FAIL', c5u.ok === false && c5u.failures.some((f) => /^C5/.test(f)));
      // control: a gitignored settings.local.json is NOT a false-positive (it is a legit local file, DENY-tier)
      put(slotA, '.claude/settings.local.json', '{"u":1}\n');
      const chkIgnored = spawnSync('git', ['check-ignore', '.claude/settings.local.json'], { cwd: slotA, encoding: 'utf8' });
      const c5ig = run({ baseMain, baseDev, task: 'task/x' });
      fs.rmSync(path.join(slotA, '.claude', 'settings.local.json'), { force: true });
      // only assert the no-false-positive property when the host actually gitignores it (else it is a plain untracked file)
      if (chkIgnored.status === 0) check('AH-18 C5 gitignored settings.local.json -> no false positive', !c5ig.failures.some((f) => /^C5/.test(f)));
      // C3 (Codex FIX): per-remote default fetch is fine; a fetch into another namespace fails
      G(canonical, 'remote', 'add', 'upstream', 'https://example.invalid/x.git');
      const c3ok = run({ baseMain, baseDev, task: 'task/x' });
      check('AH-18 C3 legit non-origin remote (own default fetch) -> no C3', c3ok.ok === true && !c3ok.failures.some((f) => /^C3/.test(f)));
      G(canonical, 'config', 'remote.upstream.fetch', '+refs/heads/*:refs/remotes/origin/*');
      const c3bad = run({ baseMain, baseDev, task: 'task/x' });
      G(canonical, 'remote', 'remove', 'upstream');
      check('AH-18 C3 remote fetch into another namespace -> FAIL', c3bad.ok === false && c3bad.failures.some((f) => /^C3/.test(f)));
      // report-only key does not fail
      G(canonical, 'config', 'core.pager', 'less');
      const rep = run({ baseMain, baseDev, task: 'task/x' });
      G(canonical, 'config', '--unset', 'core.pager');
      check('AH-18 report-only core.pager -> PASS with a report line', rep.ok === true && rep.report.some((r) => /core\.pager/.test(r)));
      // usage error (bad --since) and CLI usage error (no base args)
      const badSince = run({ baseMain, baseDev, since: 'not-a-date' });
      check('AH-18 unparseable --since -> usage error', badSince.ok === false && badSince.usage === true);
      const cliUsage = spawnSync(process.execPath, [path.join(ROOT, 'qa', 'guard_integrity_check.js')], { encoding: 'utf8' });
      check('AH-18 CLI no args -> exit 3 (usage)', cliUsage.status === 3);
      // CLI PASS/FAIL exit codes against the fixture
      const cliPass = spawnSync(process.execPath, [path.join(ROOT, 'qa', 'guard_integrity_check.js'), '--base-main', baseMain, '--base-dev', baseDev, '--task', 'task/x', '--root', canonical], { encoding: 'utf8' });
      check('AH-18 CLI clean -> exit 0', cliPass.status === 0 && /PASS/.test(cliPass.stdout));
      const cliFail = spawnSync(process.execPath, [path.join(ROOT, 'qa', 'guard_integrity_check.js'), '--base-main', '0'.repeat(40), '--base-dev', baseDev, '--task', 'task/x', '--root', canonical], { encoding: 'utf8' });
      check('AH-18 CLI wrong base-main -> exit 1', cliFail.status === 1 && /FAIL/.test(cliFail.stdout));
    } finally {
      try { G(canonical, 'worktree', 'prune'); } catch (e) { /* ignore */ }
      fs.rmSync(base, { recursive: true, force: true });
    }
  }
}

// ── R10 mutants: production-source mutation, ≥1 per R10-1..R10-8 ──
mutantCatches('R10-1 escape differential disabled', 'const stripped = stripShellEscapes(command, tool);', 'const stripped = command;',
  (m) => dec(m, 'g\\it push', SLOT_A).decision === 'deny');
mutantCatches('R10-2 subcommand allowlist dropped', 'if (!KNOWN_GIT_SUBCOMMANDS.has(sub)) {', 'if (false) {',
  (m) => dec(m, 'git p', SLOT_A).decision === 'deny' && dec(m, 'git zzz', MAIN).decision === 'deny');
mutantCatches('R10-2 git-<sub> program classification dropped', "/^git-[a-z0-9][a-z0-9._-]*$/i.test(prog)", '/^__never__$/.test(prog)',
  (m) => dec(m, 'git-push', SLOT_A).decision === 'deny');
mutantCatches('R10-3 config-exec -c/config-write not denied', 'if (writeish && isProtectedConfigKey(key)) {', 'if (false) {',
  (m) => dec(m, 'git config core.hooksPath /tmp/h', SLOT_A).decision === 'deny');
mutantCatches('R10-3 GIT_CONFIG_* env prefix not denied', 'const R10_GIT_CONFIG_ENV_RE = /^GIT_CONFIG_/i;', 'const R10_GIT_CONFIG_ENV_RE = /^__never__$/i;',
  (m) => dec(m, 'GIT_CONFIG_GLOBAL=/tmp/g git status', MAIN).decision === 'deny');
mutantCatches('R10-3 .git writer not denied', "if (dg !== undefined) { out.push({ cls: 'destructive', reason: what + ' .git path '", "if (false) { out.push({ cls: 'destructive', reason: what + ' .git path '",
  (m) => dec(m, 'cp x .git/config', SLOT_A).decision === 'deny');
mutantCatches('R10-3 commit-gate config check dropped', "if (!cfg || cfg.ok !== true) return commitDeny(", 'if (false) return commitDeny(',
  (m) => m.decide({ tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: SLOT_A }, depsOf(HEAD_TASK, [], undefined, undefined, () => ({ ok: false, bad: ['core.hooksPath=x'] }))).decision === 'deny');
mutantCatches('R10-3 commit-gate hooks check dropped', "if (!hooks || hooks.ok !== true) return commitDeny(", 'if (false) return commitDeny(',
  (m) => m.decide({ tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: SLOT_A }, depsOf(HEAD_TASK, [], undefined, undefined, undefined, () => ({ ok: false, bad: ['pre-commit'] }))).decision === 'deny');
mutantCatches('R10-4 update-ref HEAD not denied', "if (String(target || '').toUpperCase() === 'HEAD') return 'git update-ref HEAD", "if (false) return 'git update-ref HEAD",
  (m) => dec(m, 'git update-ref HEAD abc', MAIN).decision === 'deny');
mutantCatches('R10-4 branch one-name move not denied', 'if (move && pos.length === 1) return', 'if (false) return',
  (m) => dec(m, 'git branch -m newname', SLOT_A).decision === 'deny' && dec(m, 'git branch -M single', MAIN).decision === 'deny');
mutantCatches('R10-4 worktree checkout-target not denied', "if (addPositional.length >= 2 && protectedRefName(addPositional[1])) {", 'if (false) {',
  (m) => dec(m, 'git worktree add ../w branch-dev', SLOT_A).decision === 'deny');
mutantCatches('R10-4 attached -B/-C not denied', "const attached = /^-([bBcC])(.+)$/.exec(a);", 'const attached = null;',
  (m) => dec(m, 'git checkout -Bbranch-dev', SLOT_A).decision === 'deny' && dec(m, 'git switch -Cmain', MAIN).decision === 'deny');
mutantCatches('R10-5 always-deny set dropped (cherry-pick)', 'if (R10_ALWAYS_DENY_GIT.has(sub)) {', 'if (false) {',
  (m) => dec(m, 'git cherry-pick abc', SLOT_A).decision === 'deny' && dec(m, 'git revert HEAD', MAIN).decision === 'deny');
mutantCatches('R10-5 remote add --mirror not denied', "rest.slice(1).some((a) => a === '--mirror' || a.startsWith('--mirror='))", 'false',
  (m) => dec(m, 'git remote add --mirror m .', SLOT_A).decision === 'deny');
mutantCatches('R10-5 fetch refspec-to-protected not denied', 'const risky = rest.some((a) => refspecTargetsProtected(a) ||', 'const risky = rest.some((a) => false && refspecTargetsProtected(a) ||',
  (m) => dec(m, 'git fetch . task/x:branch-dev', MAIN).decision === 'deny');
mutantCatches('R10-5 canonical reset ref-move not denied', "return { decision: 'deny', reason: 'git reset can move main/branch-dev - denied in every session (R10-5)' };", "return { decision: 'allow', reason: 'x' };",
  (m) => decCanonResetMod(m, 'git reset --soft HEAD~1') === 'deny');
mutantCatches('R10-6 file-tool .git target not denied', 'if (isDotGitText(resolved) || isDotGitText(raw)) return { decision: \'deny\', reason: tool +', 'if (false) return { decision: \'deny\', reason: tool +',
  (m) => m.decide({ tool_name: 'Write', tool_input: { file_path: '.git/config' }, cwd: SLOT_A }, IDENTITY_FT).decision === 'deny');
mutantCatches('R10-7 time budget exhausted not denied', 'const R10_BUDGET_MS = 8000;', 'const R10_BUDGET_MS = 0;',
  (m) => dec(m, 'git status', SLOT_A).decision === 'allow');
function decCanonResetMod(m, cmd) {
  const deps = Object.assign({}, depsOf('ref: refs/heads/branch-dev', [], undefined, () => MAIN), { pathExists: () => false, resolveFileToolTarget: (c, r) => String(r) });
  try { return m.decide({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: MAIN }, deps).decision; } catch (e) { return 'THROW'; }
}
// R10-8 integrity-script mutants (mutate qa/guard_integrity_check.js)
function integrityMutantCatches(label, find, replace, probe) {
  const src0 = fs.readFileSync(path.join(ROOT, 'qa', 'guard_integrity_check.js'), 'utf8').replace(/\r\n/g, '\n');
  const idx = src0.indexOf(find);
  check('MUT ' + label + ': anchor present', idx !== -1);
  if (idx === -1) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ah18-mut-'));
  try {
    const file = path.join(dir, 'guard_integrity_check.js');
    fs.writeFileSync(file, src0.slice(0, idx) + replace + src0.slice(idx + find.length));
    const mod = require(file);
    check('MUT ' + label + ': caught by probe', probe(mod) === false);
    check('MUT ' + label + ': production passes probe', probe(integrity) === true);
  } catch (e) { check('MUT ' + label + ': mutant loads (' + e.message + ')', false); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
if (guard && integrity && spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0) {
  // shared fixture for integrity mutants
  const mbase = fs.mkdtempSync(path.join(os.tmpdir(), 'ah18-mf-'));
  const mcanon = path.join(mbase, 'portfolio-tracker');
  const G = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=ah', '-c', 'user.email=ah@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...a], { cwd, encoding: 'utf8' });
  try {
    fs.mkdirSync(mcanon, { recursive: true });
    G(mcanon, 'init', '-q', '-b', 'main');
    fs.mkdirSync(path.join(mcanon, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(mcanon, '.claude', 'settings.json'), '{"a":1}\n');
    fs.writeFileSync(path.join(mcanon, 'keep.txt'), 'k\n');
    G(mcanon, 'add', '-A'); G(mcanon, 'commit', '-q', '-m', 'seed'); G(mcanon, 'branch', 'branch-dev');
    G(mcanon, 'worktree', 'add', '-q', '-b', 'task/x', path.join(mbase, 'pt-wt-worker-a'), 'branch-dev');
    G(mcanon, 'worktree', 'add', '-q', '-b', 'task/y', path.join(mbase, 'pt-wt-worker-b'), 'branch-dev');
    const bMain = G(mcanon, 'rev-parse', 'main').stdout.trim();
    const bDev = G(mcanon, 'rev-parse', 'branch-dev').stdout.trim();
    integrityMutantCatches('R10-8 C1 local-ref check dropped', 'if (mainOid !== opts.baseMain)', 'if (false)',
      (mod) => mod.runIntegrity({ root: mcanon, gitExec: 'git', baseMain: '0'.repeat(40), baseDev: bDev, task: 'task/x' }).ok === false);
    integrityMutantCatches('R10-8 C3 alias check dropped', "} else if (/^alias\\./i.test(key)) {", '} else if (false) {',
      (mod) => { G(mcanon, 'config', 'alias.foo', 'status'); const r = mod.runIntegrity({ root: mcanon, gitExec: 'git', baseMain: bMain, baseDev: bDev, task: 'task/x' }).ok === false; G(mcanon, 'config', '--unset', 'alias.foo'); return r; });
    integrityMutantCatches('R10-8 C6 protected-diff check dropped', '.filter((p) => STAGED_DENY_RES.some((re) => re.test(p.replace(/\\\\/g, \'/\'))))', '.filter(() => false)',
      (mod) => { fs.writeFileSync(path.join(mbase, 'pt-wt-worker-a', '.claude', 'settings.json'), '{"a":9}\n'); const sa = path.join(mbase, 'pt-wt-worker-a'); G(sa, 'add', '.claude/settings.json'); G(sa, 'commit', '-q', '-m', 't'); const r = mod.runIntegrity({ root: mcanon, gitExec: 'git', baseMain: bMain, baseDev: bDev, task: 'task/x' }).ok === false; G(sa, 'reset', '-q', '--hard', 'branch-dev'); return r; });
    integrityMutantCatches('R10-8 C6 approval exemption forced true (brief §8)', "const unapproved = hits.filter((p) => !protectedApprovedInTask(G, root, opts.task, p.replace(/\\\\/g, '/')));", 'const unapproved = [];',
      (mod) => { fs.writeFileSync(path.join(mbase, 'pt-wt-worker-a', '.claude', 'settings.json'), '{"a":8}\n'); const sa = path.join(mbase, 'pt-wt-worker-a'); G(sa, 'add', '.claude/settings.json'); G(sa, 'commit', '-q', '-m', 't'); const r = mod.runIntegrity({ root: mcanon, gitExec: 'git', baseMain: bMain, baseDev: bDev, task: 'task/x' }).ok === false; G(sa, 'reset', '-q', '--hard', 'branch-dev'); return r; });
    integrityMutantCatches('R10-8 C5 misses untracked governance (Codex FIX)', "['status', '--porcelain', '--', '.claude']", "['diff', '--name-only', 'HEAD', '--', '.claude']",
      (mod) => { const p = path.join(mbase, 'pt-wt-worker-a', '.claude', 'hooks'); fs.mkdirSync(p, { recursive: true }); fs.writeFileSync(path.join(p, 'evil.js'), '//\n'); const r = mod.runIntegrity({ root: mcanon, gitExec: 'git', baseMain: bMain, baseDev: bDev, task: 'task/x' }).failures.some((f) => /^C5/.test(f)); fs.rmSync(path.join(p, 'evil.js'), { force: true }); return r; });
    integrityMutantCatches('R10-8 C3 remote-fetch hardcoded to origin (Codex FIX)', "'+refs/heads/*:refs/remotes/' + rname + '/*'", "'+refs/heads/*:refs/remotes/origin/*'",
      (mod) => { G(mcanon, 'remote', 'add', 'upstream', 'https://example.invalid/x.git'); const r = mod.runIntegrity({ root: mcanon, gitExec: 'git', baseMain: bMain, baseDev: bDev, task: 'task/x' }); G(mcanon, 'remote', 'remove', 'upstream'); return r.ok === true && !r.failures.some((f) => /^C3/.test(f)); });
    integrityMutantCatches('R10-8 C2 emptied/missing reflog fails open (Codex FIX)', "if (requireReflog && lines.length === 0) { failures.push('C2 protected ref '", "if (false) { failures.push('C2 protected ref '",
      (mod) => { const future = new Date(Date.now() + 86400000).toISOString(); const rl = path.join(mcanon, '.git', 'logs', 'refs', 'heads', 'branch-dev'); const saved = fs.readFileSync(rl); fs.rmSync(rl, { force: true }); const r = mod.runIntegrity({ root: mcanon, gitExec: 'git', baseMain: bMain, baseDev: bDev, task: 'task/x', since: future }).failures.some((f) => /^C2/.test(f)); fs.mkdirSync(path.dirname(rl), { recursive: true }); fs.writeFileSync(rl, saved); return r; });
  } finally { try { G(mcanon, 'worktree', 'prune'); } catch (e) { /* ignore */ } fs.rmSync(mbase, { recursive: true, force: true }); }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// AH-19 — R11 Owner-approved brief-only commit gate for the canonical checkout
// (work/brief-commit-gate/brief.md §2-3, Amendment 1). Table rows inject the R11 readers so
// they never touch real fs/git; AH-19-13 drives the REAL readers against a temp canonical repo.
// Pattern reused from AH-16 depsOf()/dc() (table rows never touch real fs/git) and AH-18's
// real-git temp-repo fixtures (mkdtempSync + a `G()` git runner with a fixed identity).
// ══════════════════════════════════════════════════════════════════════════════════════════
// A real directory with a real (empty) .git DIRECTORY on disk, distinct from any pt-wt-worker-[ab]
// slot: briefCommitGate's canonical-identity step does an un-injectable fs.statSync(root + '/.git'),
// so table rows need this to exist for real (AH-16's depsOf() has no such constraint; R11 does).
const R11_CANON = fs.mkdtempSync(path.join(os.tmpdir(), 'ah19-canon-'));
fs.mkdirSync(path.join(R11_CANON, '.git'));
const R11_BRIEF_PATH = 'work/brief-commit-gate/brief.md';
const R11_HASH = 'a'.repeat(64);
const R11_OID = 'b'.repeat(40);
const R11_VALID_MSG = 'git commit -m "docs(work): add x brief"';
const R11_VALID_AMEND_MSG = 'git commit -m "docs(work): amend x brief"';
function r11Record(overrides) { return Object.assign({ hash: R11_HASH, path: R11_BRIEF_PATH, oid: R11_OID }, overrides); }
function r11Entry(overrides) { return Object.assign({ kind: '1', xy: 'A.', sub: 'N...', path: R11_BRIEF_PATH }, overrides); }
function r11Status(overrides) { return Object.assign({ branch: 'branch-dev', oid: R11_OID, entries: [r11Entry()] }, overrides); }
function depsR11(opts) {
  const o = opts || {};
  const log = o.log;
  return Object.assign({}, R10_STUBS, {
    repoRoot: (cwd) => { if (log) log.push(['repo', cwd]); return typeof o.repoRoot === 'function' ? o.repoRoot(cwd) : (o.repoRoot !== undefined ? o.repoRoot : R11_CANON); },
    briefApproval: (root) => {
      if (log) log.push(['approval', root]);
      if (typeof o.briefApproval === 'function') return o.briefApproval(root);
      return o.briefApproval !== undefined ? o.briefApproval : r11Record();
    },
    canonicalStatus: (root) => {
      if (log) log.push(['status', root]);
      return typeof o.canonicalStatus === 'function' ? o.canonicalStatus(root) : (o.canonicalStatus !== undefined ? o.canonicalStatus : r11Status());
    },
    indexBlobSha256: (root, p) => {
      if (log) log.push(['blob', root, p]);
      return typeof o.indexBlobSha256 === 'function' ? o.indexBlobSha256(root, p) : (o.indexBlobSha256 !== undefined ? o.indexBlobSha256 : R11_HASH);
    },
    protectedConfigState: (root) => { if (log) log.push(['cfg', root]); return typeof o.protectedConfigState === 'function' ? o.protectedConfigState(root) : OK_CFG(); },
    hooksState: (root) => { if (log) log.push(['hooks', root]); return typeof o.hooksState === 'function' ? o.hooksState(root) : OK_HOOKS(); }
  });
}
function r11DecideOn(mod, cmd, opts) {
  const o = opts || {};
  const saved = process.env.CLAUDE_PROJECT_DIR;
  const projectDir = Object.prototype.hasOwnProperty.call(o, 'projectDir') ? o.projectDir : R11_CANON;
  if (projectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = projectDir;
  try {
    const cwd = Object.prototype.hasOwnProperty.call(o, 'cwd') ? o.cwd : R11_CANON;
    const input = { tool_name: o.tool || 'Bash', tool_input: { command: cmd } };
    if (cwd !== NO_CWD) input.cwd = cwd;
    return mod.decide(input, depsR11(o));
  } catch (e) {
    return { decision: 'THROW', reason: String(e && e.message) };
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = saved;
  }
}
function r11Decide(cmd, opts) { return guard ? r11DecideOn(guard, cmd, opts) : { decision: 'NOMODULE', reason: '' }; }

// AH-19-1/2: valid new brief (A.) and valid amendment (M.)
check('AH-19-1 valid: canonical cwd, record matches, one A. entry, blob hash matches, config/hooks ok -> allow',
  r11Decide(R11_VALID_MSG).decision === 'allow');
check('AH-19-2 valid amendment: one M. entry -> allow',
  r11Decide(R11_VALID_AMEND_MSG, { canonicalStatus: () => r11Status({ entries: [r11Entry({ xy: 'M.' })] }) }).decision === 'allow');

// AH-19-3: a second staged file / an untracked extra file / an unstaged change elsewhere / the brief itself also modified (AM) -> deny x4
const AH19_3_ROWS = [
  ['a second staged file', r11Status({ entries: [r11Entry(), r11Entry({ path: 'work/x/other.md' })] })],
  ['an untracked extra file', r11Status({ entries: [r11Entry(), { kind: '?' }] })],
  ['an unstaged change elsewhere', r11Status({ entries: [r11Entry(), r11Entry({ xy: '.M', path: 'index.html' })] })],
  ['the brief itself also modified in the worktree (AM)', r11Status({ entries: [r11Entry({ xy: 'AM' })] })]
];
for (const [label, status] of AH19_3_ROWS) {
  check('AH-19-3 ' + label + ' -> deny', r11Decide(R11_VALID_MSG, { canonicalStatus: () => status }).decision === 'deny');
}

// AH-19-4: the single entry is an implementation file, or the record path points at it -> deny
check('AH-19-4 staged entry is an implementation file (path mismatch) -> deny',
  r11Decide(R11_VALID_MSG, { canonicalStatus: () => r11Status({ entries: [r11Entry({ path: 'index.html' })] }) }).decision === 'deny');
check('AH-19-4 record path points at an implementation file (path mismatch) -> deny',
  r11Decide(R11_VALID_MSG, { briefApproval: () => r11Record({ path: 'index.html' }) }).decision === 'deny');

// AH-19-5: record path shapes -> deny (exercised end-to-end against the REAL reader in AH-19-13, which
// enforces R11_RECORD_PATH_RE; the injected-deps rows above already cover the entry/record equality check).

// AH-19-6: branch.head = main, another branch, or missing -> deny
for (const branch of ['main', 'task/x', null, undefined, '(detached)']) {
  check('AH-19-6 branch.head=' + JSON.stringify(branch) + ' -> deny',
    r11Decide(R11_VALID_MSG, { canonicalStatus: () => r11Status({ branch }) }).decision === 'deny');
}

// AH-19-7: hash mismatch / record absent / malformed / path mismatch / stale parent-OID -> deny
check('AH-19-7 hash mismatch -> deny', r11Decide(R11_VALID_MSG, { indexBlobSha256: () => 'f'.repeat(64) }).decision === 'deny');
check('AH-19-7 record absent (null) -> deny', r11Decide(R11_VALID_MSG, { briefApproval: () => null }).decision === 'deny');
for (const bad of [{ hash: R11_HASH }, { hash: R11_HASH, path: R11_BRIEF_PATH }, 'x', 42, {}, undefined]) {
  check('AH-19-7 record malformed ' + JSON.stringify(bad) + ' -> deny', r11Decide(R11_VALID_MSG, { briefApproval: () => bad }).decision === 'deny');
}
check('AH-19-7 record path mismatch -> deny', r11Decide(R11_VALID_MSG, { briefApproval: () => r11Record({ path: 'work/other/brief.md' }) }).decision === 'deny');
check('AH-19-7 stale parent-OID -> deny', r11Decide(R11_VALID_MSG, { briefApproval: () => r11Record({ oid: 'c'.repeat(40) }) }).decision === 'deny');

// AH-19-8: form deviations -> deny with the UNCHANGED r9 R3c reason and zero reads (§3 "Order matters")
const R11_FORM_DENY = [
  'git commit --amend -m "docs(work): x"', 'git commit --fixup=HEAD -m "docs(work): x"', 'git commit --squash=HEAD -m "docs(work): x"',
  'git commit -a -m "docs(work): x"', 'git commit -m "docs(work): x" file.txt', 'git commit -F msg.txt', 'git commit -s -m "docs(work): x"',
  'git commit --allow-empty -m "docs(work): x"', 'git commit --no-verify -m "docs(work): x"', 'git commit -m "docs(work): x" -m "docs(work): y"',
  'git commit -m "not-docs-work: x"', 'git commit -m "docs(work):x"', 'git -C x commit -m "docs(work): x"', 'git -c k=v commit -m "docs(work): x"',
  'GIT_INDEX_FILE=/tmp/i git commit -m "docs(work): x"', 'git commit -m "docs(work): x" && git status', 'git commit -m "docs(work): x"; git log',
  "echo x | git commit -F -", 'bash -c \'git commit -m "docs(work): x"\'', 'git commit -m "docs(work): x"\ngit status'
];
for (const cmd of R11_FORM_DENY) {
  const log = [];
  const r = r11Decide(cmd, { log });
  check('AH-19-8 form deny, zero reads: ' + JSON.stringify(cmd) + ' (got ' + r.decision + ', reads ' + log.length + ')',
    r.decision === 'deny' && /R3c/.test(r.reason) && log.length === 0);
}
{
  // PowerShell: §3.1 "the tool must be Bash" — decide() never reaches commitGate for a PowerShell
  // commit at all (the R2 git-program blanket denies it first), so this is zero R11 reads by construction.
  const log = [];
  const r = r11Decide(R11_VALID_MSG, { tool: 'PowerShell', log });
  check('AH-19-8 PowerShell tool -> deny (R2, not R11/R3c), zero reads', r.decision === 'deny' && /R2/.test(r.reason) && log.length === 0);
}

// AH-19-9: session env overrides / CLAUDE_PROJECT_DIR missing or different / .git is a file -> deny
for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG_GLOBAL']) {
  const saved = process.env[key];
  process.env[key] = 'x';
  try {
    check('AH-19-9 session env ' + key + ' set -> deny', r11Decide(R11_VALID_MSG).decision === 'deny');
  } finally {
    if (saved === undefined) delete process.env[key]; else process.env[key] = saved;
  }
}
check('AH-19-9 CLAUDE_PROJECT_DIR missing -> deny', r11Decide(R11_VALID_MSG, { projectDir: undefined }).decision === 'deny');
check('AH-19-9 CLAUDE_PROJECT_DIR different from repoRoot -> deny', r11Decide(R11_VALID_MSG, { projectDir: 'C:\\elsewhere' }).decision === 'deny');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ah19-gitfile-'));
  fs.writeFileSync(path.join(dir, '.git'), 'gitdir: ../x\n');
  try {
    check('AH-19-9 .git is a file (linked worktree, not canonical) -> deny',
      r11Decide(R11_VALID_MSG, { cwd: dir, projectDir: dir, repoRoot: () => dir }).decision === 'deny');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// AH-19-10: R10-3 integrity (protected config / non-sample hooks) -> deny
check('AH-19-10 protected git config active -> deny', r11Decide(R11_VALID_MSG, { protectedConfigState: () => ({ ok: false, bad: ['core.hooksPath=x'] }) }).decision === 'deny');
check('AH-19-10 non-sample git hooks installed -> deny', r11Decide(R11_VALID_MSG, { hooksState: () => ({ ok: false, bad: ['pre-commit'] }) }).decision === 'deny');

// AH-19-11: fail-closed on a thrown reader or a malformed return value
const boomR11 = () => { throw new Error('planted read failure'); };
for (const dep of ['repoRoot', 'briefApproval', 'canonicalStatus', 'indexBlobSha256', 'protectedConfigState', 'hooksState']) {
  check('AH-19-11 ' + dep + ' throws -> deny', r11Decide(R11_VALID_MSG, { [dep]: boomR11 }).decision === 'deny');
}
for (const odd of [null, undefined, 'x', 42, {}, []]) {
  check('AH-19-11 canonicalStatus returns ' + JSON.stringify(odd) + ' -> deny', r11Decide(R11_VALID_MSG, { canonicalStatus: () => odd }).decision === 'deny');
}
// Budget exhaustion / timeout: decide() computes its own deadline (Date.now() + R10_BUDGET_MS) and
// applies it to gateDeps AFTER the injected deps are merged, so a shortened deadline cannot be
// injected from a table row (the same constraint AH-16/R10-7's mutant-only coverage lives under).
// The closest constructible proxy — a reader that throws a timeout-shaped error — is exercised by
// the per-dep throw loop above; each of those readers is exactly where a real subprocess timeout
// (spawnBudgetMs throwing "r10 time budget exhausted") or ECONNRESET-style failure would surface.
check('AH-19-11 timeout-shaped reader error (proxy for a real subprocess timeout) -> deny',
  r11Decide(R11_VALID_MSG, { canonicalStatus: () => { const e = new Error('r10 time budget exhausted'); e.code = 'ETIMEDOUT'; throw e; } }).decision === 'deny');

// AH-19-12: CLI — the valid case exits 0; a deny exits 2 with R11/R3c in stderr
function r11Cli(cmd, opts) {
  const o = opts || {};
  const saved = process.env.CLAUDE_PROJECT_DIR;
  const projectDir = Object.prototype.hasOwnProperty.call(o, 'projectDir') ? o.projectDir : R11_CANON;
  if (projectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = projectDir;
  try {
    return guard.runCli(payload(cmd, Object.prototype.hasOwnProperty.call(o, 'cwd') ? o.cwd : R11_CANON), { deps: depsR11(o) });
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = saved;
  }
}
if (guard) {
  const okR = r11Cli(R11_VALID_MSG);
  check('AH-19-12 CLI valid -> exit 0, empty stdout/stderr', okR.code === 0 && okR.stdout === '' && okR.stderr === '');
  const denyR = r11Cli(R11_VALID_MSG, { canonicalStatus: () => r11Status({ branch: 'main' }) });
  check('AH-19-12 CLI deny -> exit 2, empty stdout, R11 on stderr', denyR.code === 2 && denyR.stdout === '' && /R11/.test(denyR.stderr));
  const denyFormR = r11Cli('git commit -m x');
  check('AH-19-12 CLI form deny -> exit 2, empty stdout, R3c on stderr (unchanged reason)', denyFormR.code === 2 && denyFormR.stdout === '' && /R3c/.test(denyFormR.stderr));
} else {
  check('AH-19-12 CLI rows need the hook module', false);
}

// AH-19-13: REAL readers against a temp canonical repo (offline; git runs only inside os.tmpdir()).
{
  const gitVersion = spawnSync('git', ['--version'], { encoding: 'utf8' });
  check('AH-19-13: git is available on PATH', gitVersion.status === 0);
  if (guard && gitVersion.status === 0) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ah19-real-'));
    const G = (...a) => spawnSync('git', ['-c', 'user.name=ah', '-c', 'user.email=ah@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...a], { cwd: root, encoding: 'utf8' });
    const savedProjectDir = process.env.CLAUDE_PROJECT_DIR;
    const writeRecord = (buf) => fs.writeFileSync(path.join(root, '.git', 'pt-brief-approval'), buf);
    const realDecide = (cmd) => guard.decide({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: root });
    try {
      G('init', '-q', '-b', 'main');
      fs.writeFileSync(path.join(root, 'keep.txt'), 'k\n');
      G('add', '-A'); G('commit', '-q', '-m', 'seed');
      G('branch', 'branch-dev'); G('checkout', '-q', 'branch-dev');
      fs.mkdirSync(path.join(root, 'work', 'x'), { recursive: true });
      const briefText = 'brief text\n';
      fs.writeFileSync(path.join(root, 'work', 'x', 'brief.md'), briefText);
      G('add', 'work/x/brief.md');
      const parentOid = G('rev-parse', 'branch-dev').stdout.trim();
      const blobHash = crypto.createHash('sha256').update(Buffer.from(briefText)).digest('hex');
      writeRecord(blobHash + ' work/x/brief.md ' + parentOid);
      process.env.CLAUDE_PROJECT_DIR = root;

      check('AH-19-13 real-git valid -> allow', realDecide(R11_VALID_MSG).decision === 'allow');
      // G1 (brief §6 "Also run"): a real hook-process spawn for the allow case.
      {
        const spawnEnv = Object.assign({}, process.env, { CLAUDE_PROJECT_DIR: root });
        const g1 = spawnSync(process.execPath, [HOOK_PATH], { input: payload(R11_VALID_MSG, root), env: spawnEnv, encoding: 'utf8', timeout: 15000 });
        check('G1 real hook-process spawn, allow case -> exit 0, empty stdout/stderr', g1.status === 0 && g1.stdout === '' && g1.stderr === '');
      }
      const cm = G('commit', '-m', 'docs(work): add x brief');
      check('AH-19-13 real-git commit succeeds', cm.status === 0);
      const changed = G('show', '--name-only', '--format=', 'HEAD').stdout.trim().split(/\r?\n/).filter(Boolean);
      check('AH-19-13 real-git commit touches exactly one path (work/x/brief.md)', changed.length === 1 && changed[0] === 'work/x/brief.md');

      // Fresh amendment round for the negatives, isolated from the committed state above.
      const newParent = G('rev-parse', 'branch-dev').stdout.trim();
      const amendText = briefText + 'amend\n';
      fs.writeFileSync(path.join(root, 'work', 'x', 'brief.md'), amendText);
      G('add', 'work/x/brief.md');
      const amendHash = crypto.createHash('sha256').update(Buffer.from(amendText)).digest('hex');
      writeRecord(amendHash + ' work/x/brief.md ' + newParent);

      const spawnDeny = (label, msg) => {
        const spawnEnv = Object.assign({}, process.env, { CLAUDE_PROJECT_DIR: root });
        const r = spawnSync(process.execPath, [HOOK_PATH], { input: payload(msg, root), env: spawnEnv, encoding: 'utf8', timeout: 15000 });
        check(label + ' -> exit 2, empty stdout, R11 on stderr', r.status === 2 && r.stdout === '' && /R11/.test(r.stderr));
      };

      fs.writeFileSync(path.join(root, 'stray.txt'), 'x\n');
      check('AH-19-13 real-git extra untracked file -> deny', realDecide(R11_VALID_AMEND_MSG).decision === 'deny');
      spawnDeny('G2 real hook-process spawn, extra untracked file', R11_VALID_AMEND_MSG);
      fs.rmSync(path.join(root, 'stray.txt'));

      writeRecord(amendHash + ' work/x/brief.md ' + 'f'.repeat(40));
      check('AH-19-13 real-git stale parent -> deny', realDecide(R11_VALID_AMEND_MSG).decision === 'deny');
      spawnDeny('G3 real hook-process spawn, stale parent', R11_VALID_AMEND_MSG);

      writeRecord('f'.repeat(64) + ' work/x/brief.md ' + newParent);
      check('AH-19-13 real-git wrong hash -> deny', realDecide(R11_VALID_AMEND_MSG).decision === 'deny');
      spawnDeny('G4 real hook-process spawn, wrong hash', R11_VALID_AMEND_MSG);

      // AH-19-5: record path shapes the real reader must reject.
      for (const badPath of ['work/x/notes.md', 'work/x/y/brief.md', 'work/../brief.md', 'WORK/x/brief.md', 'work/.x/brief.md']) {
        writeRecord(amendHash + ' ' + badPath + ' ' + newParent);
        check('AH-19-5 real-git record path shape ' + JSON.stringify(badPath) + ' -> deny', realDecide(R11_VALID_AMEND_MSG).decision === 'deny');
      }

      writeRecord(amendHash + ' work/x/brief.md ' + newParent);
      check('AH-19-13 real-git amendment (M.) -> allow', realDecide(R11_VALID_AMEND_MSG).decision === 'allow');

      // AH-19-7: malformed record forms the real reader must reject.
      const goodRecordBuf = fs.readFileSync(path.join(root, '.git', 'pt-brief-approval'));
      writeRecord(Buffer.from(amendHash + ' work/x/brief.md ' + newParent + '\u00e9', 'utf8'));
      check('AH-19-7 real-git record non-ASCII -> deny', realDecide(R11_VALID_AMEND_MSG).decision === 'deny');
      writeRecord(Buffer.from(amendHash + ' work/x/brief.md ' + newParent + '\nextra\n', 'ascii'));
      check('AH-19-7 real-git record multi-line -> deny', realDecide(R11_VALID_AMEND_MSG).decision === 'deny');
      writeRecord(Buffer.alloc(0));
      check('AH-19-7 real-git record empty -> deny', realDecide(R11_VALID_AMEND_MSG).decision === 'deny');
      fs.rmSync(path.join(root, '.git', 'pt-brief-approval'), { force: true });
      check('AH-19-7 real-git record missing -> deny', realDecide(R11_VALID_AMEND_MSG).decision === 'deny');
      writeRecord(goodRecordBuf);
    } finally {
      if (savedProjectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = savedProjectDir;
      fs.rmSync(root, { recursive: true, force: true });
    }
  } else {
    check('AH-19-13 real-git rows need the hook module and git', false);
  }
}

// AH-19-14: every existing AH-16 row (including the RC2 reasons/zero-reads rows) is exercised unmodified
// above this point in the file and passed; a slot commit staging work/x/brief.md is still denied by
// STAGED_DENY (unchanged R11 scope: the brief-only gate only ever applies to a NON-slot session).
check('AH-19-14 slot commit staging work/x/brief.md is still denied by STAGED_DENY (R11 does not touch the slot path)',
  dc('git commit -m x', SLOT_A, HEAD_TASK, ['work/x/brief.md']).decision === 'deny');

// ── R11 mutants (≥10), each caught ──
mutantCatches('R11 narrow-form check dropped (any message reaches the gate)', "if (!isNarrowBriefCommitForm(f, gitCount)) return commitDeny('denied outside a Worker slot');",
  "if (false) return commitDeny('denied outside a Worker slot');",
  (m) => r11DecideOn(m, 'git commit -m x').decision === 'deny');
mutantCatches('R11 message regex widened (prefix-only match)', 'const R11_BRIEF_MSG_RE = /^docs\\(work\\): \\S[^\\r\\n]{0,150}$/;', 'const R11_BRIEF_MSG_RE = /^docs\\(work\\)/;',
  (m) => r11DecideOn(m, 'git commit -m "docs(work)x"').decision === 'deny');
mutantCatches('R11 single-entry check dropped', "if (!Array.isArray(status.entries) || status.entries.length !== 1) return r11Deny('the staged/working set is not exactly one entry');",
  'if (false) { /* dropped */ }',
  (m) => r11DecideOn(m, R11_VALID_MSG, { canonicalStatus: () => r11Status({ entries: [r11Entry(), r11Entry({ path: 'work/x/other.md' })] }) }).decision === 'deny');
mutantCatches('R11 XY tier widened (D. accepted)', "(entry.xy !== 'A.' && entry.xy !== 'M.')", "(entry.xy !== 'A.' && entry.xy !== 'M.' && entry.xy !== 'D.')",
  (m) => r11DecideOn(m, R11_VALID_MSG, { canonicalStatus: () => r11Status({ entries: [r11Entry({ xy: 'D.' })] }) }).decision === 'deny');
mutantCatches('R11 branch check dropped', "if (!status || status.branch !== 'branch-dev') return r11Deny('HEAD is not branch-dev');", 'if (!status) return r11Deny(\'HEAD is not branch-dev\');',
  (m) => r11DecideOn(m, R11_VALID_MSG, { canonicalStatus: () => r11Status({ branch: 'main' }) }).decision === 'deny');
mutantCatches('R11 parent-OID binding dropped (stale record accepted)', "if (status.oid !== record.oid) return r11Deny('branch-dev has moved since the approval record was written (stale parent)');",
  'if (false) { /* dropped */ }',
  (m) => r11DecideOn(m, R11_VALID_MSG, { briefApproval: () => r11Record({ oid: 'c'.repeat(40) }) }).decision === 'deny');
mutantCatches('R11 hash check dropped', "if (typeof blobHash !== 'string' || blobHash.toLowerCase() !== record.hash.toLowerCase()) {", 'if (false) {',
  (m) => r11DecideOn(m, R11_VALID_MSG, { indexBlobSha256: () => 'f'.repeat(64) }).decision === 'deny');
{
  // A real directory with a real .git DIRECTORY (not a worktree file), distinct from R11_CANON, so the
  // probe below isolates the canonical-identity string comparison from the separate dotGitStat defense.
  const identityFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ah19-identity-'));
  spawnSync('git', ['init', '-q'], { cwd: identityFixture });
  try {
    mutantCatches('R11 canonical-identity check dropped', 'if (typeof root !== \'string\' || normalizePath(root).replace(/\\/+$/, \'\') !== normalizePath(projectDir).replace(/\\/+$/, \'\')) {',
      'if (false) {',
      (m) => r11DecideOn(m, R11_VALID_MSG, { repoRoot: () => identityFixture }).decision === 'deny');
  } finally {
    fs.rmSync(identityFixture, { recursive: true, force: true });
  }
}
mutantCatches('R11 R10-3 config/hooks readers skipped', "if (!cfg || cfg.ok !== true) return r11Deny('protected git config is active');", 'if (false) { /* dropped */ }',
  (m) => r11DecideOn(m, R11_VALID_MSG, { protectedConfigState: () => ({ ok: false, bad: ['core.hooksPath=x'] }) }).decision === 'deny');
mutantCatches('R11 staged-entry path match dropped (wrong file accepted)', "if (entry.path !== record.path) return r11Deny('the staged entry does not match the approved brief path');",
  'if (false) { /* dropped */ }',
  (m) => r11DecideOn(m, R11_VALID_MSG, { canonicalStatus: () => r11Status({ entries: [r11Entry({ path: 'index.html' })] }) }).decision === 'deny');
mutantCatches('R11 sub (submodule) field not checked (submodule entry accepted)', "entry.sub !== 'N...'", 'false',
  (m) => r11DecideOn(m, R11_VALID_MSG, { canonicalStatus: () => r11Status({ entries: [r11Entry({ sub: 'S..U' })] }) }).decision === 'deny');
{
  // Path regex widened: drives the REAL briefApprovalFs reader (not injected) against a real
  // .git/pt-brief-approval holding a non-brief.md path, so only R11_RECORD_PATH_RE is exercised.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ah19-pathregex-'));
  fs.mkdirSync(path.join(dir, '.git'));
  const badPath = 'work/x/notes.md';
  const hash = 'd'.repeat(64);
  const oid = 'e'.repeat(40);
  fs.writeFileSync(path.join(dir, '.git', 'pt-brief-approval'), hash + ' ' + badPath + ' ' + oid);
  try {
    mutantCatches('R11 record-path regex widened (non-brief.md path accepted)',
      "const R11_RECORD_PATH_RE = /^work\\/[a-z0-9][a-z0-9._-]*\\/brief\\.md$/;", 'const R11_RECORD_PATH_RE = /^work\\/.*$/;',
      (m) => {
        const deps = depsR11({ repoRoot: () => dir, canonicalStatus: () => r11Status({ oid, entries: [r11Entry({ path: badPath })] }), indexBlobSha256: () => hash });
        delete deps.briefApproval; // let DEFAULT_DEPS.briefApproval (the real reader under test) run
        const saved = process.env.CLAUDE_PROJECT_DIR;
        process.env.CLAUDE_PROJECT_DIR = dir;
        try { return m.decide({ tool_name: 'Bash', tool_input: { command: R11_VALID_MSG }, cwd: dir }, deps).decision === 'deny'; }
        finally { if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = saved; }
      });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
mutantCatchesMulti('R11 reads-before-form order swapped (narrow-form check moved after the readers)',
  [["if (!isNarrowBriefCommitForm(f, gitCount)) return commitDeny('denied outside a Worker slot');\n\n  // 2. Environment.", '// 2. Environment.'],
   ['  // 7. R10-3 integrity.', "  if (!isNarrowBriefCommitForm(f, gitCount)) return commitDeny('denied outside a Worker slot');\n\n  // 7. R10-3 integrity."]],
  (m) => { const log = []; const r = r11DecideOn(m, 'git commit -m x', { log }); return r.decision === 'deny' && log.length === 0; });

// ── AH-20 (hook R12): pt-land.js LAND/push tool gate (work/worker-land-push/brief.md §4) ──
// R11_CANON (a real dir with a real .git DIRECTORY) doubles as the canonical checkout here -
// R12's canonical-identity branch does the same un-injectable fs.statSync(root + '/.git').
const R12_FORMS = [
  'node .claude/hooks/pt-land.js land-request task/x',
  'node .claude/hooks/pt-land.js land task/x',
  'node .claude/hooks/pt-land.js push-request',
  'node .claude/hooks/pt-land.js push',
  // AH-23 (work/worker-continuous-flow/brief.md §5/§8, R12 extended): the fifth verb, same form shape.
  'node .claude/hooks/pt-land.js cleanup task/x'
];
function r12DecideOn(mod, cmd, opts) {
  const o = opts || {};
  const saved = process.env.CLAUDE_PROJECT_DIR;
  const projectDir = Object.prototype.hasOwnProperty.call(o, 'projectDir') ? o.projectDir : R11_CANON;
  if (projectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = projectDir;
  try {
    const cwd = Object.prototype.hasOwnProperty.call(o, 'cwd') ? o.cwd : SLOT_A;
    const input = { tool_name: o.tool || 'Bash', tool_input: { command: cmd } };
    if (cwd !== NO_CWD) input.cwd = cwd;
    const deps = o.repoRoot ? Object.assign({}, R10_STUBS, { repoRoot: o.repoRoot }) : undefined;
    return mod.decide(input, deps);
  } catch (e) {
    return { decision: 'THROW', reason: String(e && e.message) };
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = saved;
  }
}
function r12Decide(cmd, opts) { return guard ? r12DecideOn(guard, cmd, opts) : { decision: 'NOMODULE', reason: '' }; }

// AH-20 allow (no opinion): the four exact forms, from a slot cwd and from the canonical cwd.
for (const form of R12_FORMS) {
  check('AH-20 allow, slot cwd: ' + JSON.stringify(form), r12Decide(form, { cwd: SLOT_A }).decision === 'allow');
  check('AH-20 allow, canonical cwd: ' + JSON.stringify(form), r12Decide(form, { cwd: R11_CANON, projectDir: R11_CANON }).decision === 'allow');
}

// AH-20 deny: every named deviation, from the slot cwd (representative - the identity branch is
// covered separately below).
const R12_DENY_FORMS = [
  ['trailing space', 'node .claude/hooks/pt-land.js push '],
  ['double space', 'node .claude/hooks/pt-land.js  land-request task/x'],
  ['leading ./', 'node ./.claude/hooks/pt-land.js push'],
  ['absolute path', 'node C:/repo/.claude/hooks/pt-land.js push'],
  ['../portfolio-tracker/.claude/...', 'node ../portfolio-tracker/.claude/hooks/pt-land.js push'],
  ['env prefix', 'FOO=bar node .claude/hooks/pt-land.js push'],
  ['bash -c wrapper', 'bash -c "node .claude/hooks/pt-land.js push"'],
  ['npm exec wrapper', 'npm exec -- node .claude/hooks/pt-land.js push'],
  ['node -e requiring pt-land', 'node -e "require(\'./.claude/hooks/pt-land.js\').runPush({})"'],
  ['compound &&', 'node .claude/hooks/pt-land.js push && echo done'],
  ['compound ;', 'node .claude/hooks/pt-land.js push; echo done'],
  ['pipe', 'node .claude/hooks/pt-land.js push-request | cat'],
  ['escaped pt\\-land', 'node .claude/hooks/pt\\-land.js push'],
  ['quoted arguments', 'node .claude/hooks/pt-land.js "push"'],
  ['unknown verb', 'node .claude/hooks/pt-land.js status'],
  ['land without a task', 'node .claude/hooks/pt-land.js land'],
  ['non-task/ ref', 'node .claude/hooks/pt-land.js land branch-dev'],
  // AH-23: cleanup-specific deviations (brief §8 R12-extended row).
  ['cleanup trailing space', 'node .claude/hooks/pt-land.js cleanup task/x '],
  ['cleanup env prefix', 'FOO=bar node .claude/hooks/pt-land.js cleanup task/x'],
  ['cleanup no task', 'node .claude/hooks/pt-land.js cleanup'],
  ['cleanup bash -c wrapper', 'bash -c "node .claude/hooks/pt-land.js cleanup task/x"']
];
for (const [label, cmd] of R12_DENY_FORMS) {
  check('AH-20 deny (' + label + ')', r12Decide(cmd, { cwd: SLOT_A }).decision === 'deny');
}
check('AH-20 deny: the PowerShell tool', r12Decide('node .claude/hooks/pt-land.js push', { cwd: SLOT_A, tool: 'PowerShell' }).decision === 'deny');
check('AH-20 deny: a missing cwd', r12Decide('node .claude/hooks/pt-land.js push', { cwd: NO_CWD }).decision === 'deny');
check('AH-20 deny: an empty-string cwd', r12Decide('node .claude/hooks/pt-land.js push', { cwd: '' }).decision === 'deny');
check('AH-20 deny: cwd outside the slots and canonical',
  r12Decide('node .claude/hooks/pt-land.js push', { cwd: 'C:\\Users\\Owner\\Documents\\Project\\somewhere-else', projectDir: R11_CANON }).decision === 'deny');
for (const key of ['GIT_DIR', 'GIT_CONFIG_COUNT']) {
  const saved = process.env[key];
  process.env[key] = 'x';
  try {
    check('AH-20 deny: session env ' + key + ' set', r12Decide('node .claude/hooks/pt-land.js push', { cwd: SLOT_A }).decision === 'deny');
  } finally {
    if (saved === undefined) delete process.env[key]; else process.env[key] = saved;
  }
}
// canonical-identity branch: repoRoot resolving to a DIFFERENT real .git dir than CLAUDE_PROJECT_DIR -> deny
{
  const otherReal = fs.mkdtempSync(path.join(os.tmpdir(), 'ah20-other-'));
  fs.mkdirSync(path.join(otherReal, '.git'));
  try {
    check('AH-20 deny: canonical-identity mismatch (repoRoot != CLAUDE_PROJECT_DIR)',
      r12Decide('node .claude/hooks/pt-land.js push', { cwd: otherReal, projectDir: R11_CANON, repoRoot: () => otherReal }).decision === 'deny');
  } finally {
    fs.rmSync(otherReal, { recursive: true, force: true });
  }
}

// ── AH-23 (work/worker-continuous-flow/brief.md §3/§4/§8) ────────────────────────────────
// R13 risky forms -> deny in slot, main and a missing cwd (the cwd/canonical checks that gate
// R12 are irrelevant to R13 - the --output guard fires inside classifyGit itself, before any
// cwd/slot/canonical branching, so it must deny regardless of context).
const R13_RISKY_FORMS = [
  'git diff --output=x', 'git diff --output x', 'git show --output=.git/hooks/pre-commit',
  'git log --output=/tmp/x', 'git format-patch -o out', 'git format-patch --output-directory=o'
];
for (const cmd of R13_RISKY_FORMS) {
  for (const cwd of [SLOT_A, MAIN, NO_CWD]) {
    check('AH-23 R13 deny [' + (cwd === NO_CWD ? 'missing cwd' : cwd === MAIN ? 'main' : 'slot') + '] ' + cmd,
      d(cmd, cwd === NO_CWD ? undefined : cwd).decision === 'deny');
  }
}
// R13 controls -> allow (the guard has no opinion; these are read-only, no --output).
const R13_CONTROL_FORMS = ['git diff --stat', 'git show HEAD:index.html', 'git log --oneline -5'];
for (const cmd of R13_CONTROL_FORMS) {
  check('AH-23 R13 control allow [slot] ' + cmd, d(cmd, SLOT_A).decision === 'allow');
  check('AH-23 R13 control allow [main] ' + cmd, d(cmd, MAIN).decision === 'allow');
}
// R13 mutant: dropping the --output guard lets a risky form through.
mutantCatches('R13 --output guard dropped (git diff --output=x accepted)',
  "if (['diff', 'show', 'log', 'format-patch', 'whatchanged'].indexOf(sub) !== -1) {\n    const risky = rest.some((a) => a === '--output' || a.startsWith('--output=') ||\n      (sub === 'format-patch' && (a === '-o' || a.startsWith('--output-directory'))));\n    if (risky) {\n      out.push({ cls: 'destructive', reason: 'git ' + sub + ' --output writes files - denied in every session (R13)' });\n      return;\n    }\n  }",
  '',
  (m) => dec(m, 'git diff --output=x', SLOT_A).decision === 'deny');

// Allow list contains none of these mutating-git / shell-escape / unbounded-wrapper families,
// and neither of the two still-prompting pt-land.js verbs (land/push themselves, as opposed to
// their request/cleanup forms).
const AH23_FORBIDDEN_ALLOW_SUBSTRINGS = [
  'Bash(git push', 'Bash(git merge', 'Bash(git rebase', 'Bash(git pull', 'Bash(git reset',
  'Bash(git checkout', 'Bash(git switch', 'Bash(git branch', 'Bash(git update-ref',
  'Bash(git symbolic-ref', 'Bash(git cherry-pick', 'Bash(git revert', 'Bash(git am',
  'Bash(git clean', 'Bash(git stash', 'Bash(git config', 'Bash(git remote', 'Bash(git fetch',
  'Bash(git worktree',
  'Bash(rm', 'Bash(sed', 'Bash(node -e', 'Bash(bash', 'Bash(sh ', 'Bash(npx', 'Bash(npm run *)', 'Bash(npm exec',
  'pt-land.js land task', 'pt-land.js push)',
  // owner-one-action-gates: protected-commit mutates and is record-gated - it stays prompting,
  // never allow-listed, same tier as land/push themselves.
  'pt-land.js protected-commit'
];
// The one pre-existing, narrow, read-only exception: 'git branch --show-current' prints the
// current branch name - no mutation, no wildcard - and predates this brief by several ARCs.
const AH23_KNOWN_SAFE_ALLOW = ['Bash(git branch --show-current)'];
function ah23ForbiddenHits(allowList) {
  const candidates = allowList.filter((rule) => AH23_KNOWN_SAFE_ALLOW.indexOf(rule) === -1);
  return AH23_FORBIDDEN_ALLOW_SUBSTRINGS.filter((sub) => candidates.some((rule) => rule.indexOf(sub) !== -1));
}
// Tests the REAL on-disk settings.json allow list (not just the suite's own EXPECT_ALLOW
// expectation) - AH-8's set-equality check already proves real==EXPECT_ALLOW when it passes,
// but this check stands on its own even if that one were ever weakened.
const AH23_REAL_ALLOW = (realSettings && realSettings.permissions && Array.isArray(realSettings.permissions.allow))
  ? realSettings.permissions.allow : EXPECT_ALLOW;
check('AH-23: the real allow list contains none of the forbidden mutating-git/shell-escape/wrapper/bare-land-push substrings (' +
  ah23ForbiddenHits(AH23_REAL_ALLOW).join('; ') + ')', ah23ForbiddenHits(AH23_REAL_ALLOW).length === 0);
check('AH-23 control: a planted forbidden entry is detected',
  ah23ForbiddenHits([...AH23_REAL_ALLOW, 'Bash(git push --force*)']).length > 0);

// Differential: over a representative corpus (every AH-1 ALLOWED command, every R12 form/deny
// form, and the R13 risky/control forms), the pre-R13 and post-R13 hook disagree on a decision
// ONLY for the six R13-risky forms (or an R12 cleanup form, covered separately above and
// unaffected by this specific diff, since R13 and the cleanup extension are independent edits
// to disjoint lines) - R13 never widens or narrows any other existing decision.
{
  const r13Block = "\n  // R13 (work/worker-continuous-flow/brief.md §4): git diff/show/log/format-patch/whatchanged\n  // --output writes an arbitrary file, including inside .git/, outside every R10 writer rule\n  // (which only inspects Write/Edit/tee/sed -i/cp/mv-style targets, never a git subcommand's own\n  // output flag). Allowlisting these read subcommands (AL-3) is safe only with this guard.\n  if (['diff', 'show', 'log', 'format-patch', 'whatchanged'].indexOf(sub) !== -1) {\n    const risky = rest.some((a) => a === '--output' || a.startsWith('--output=') ||\n      (sub === 'format-patch' && (a === '-o' || a.startsWith('--output-directory'))));\n    if (risky) {\n      out.push({ cls: 'destructive', reason: 'git ' + sub + ' --output writes files - denied in every session (R13)' });\n      return;\n    }\n  }\n";
  const normalizedSrc = fs.readFileSync(HOOK_PATH, 'utf8').replace(/\r\n/g, '\n');
  const srcBeforeR13 = normalizedSrc.replace(r13Block, '');
  check('AH-23 differential sanity: the R13 block was found and removed exactly once to build the pre-R13 module',
    normalizedSrc.length - srcBeforeR13.length === r13Block.length);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-r13-diff-'));
  let modBeforeR13 = null;
  try {
    const file = path.join(dir, 'pretooluse-guard.js');
    fs.writeFileSync(file, srcBeforeR13);
    modBeforeR13 = require(file);
  } catch (e) { /* handled by the null check below */ } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  check('AH-23 differential sanity: the pre-R13 module loads', modBeforeR13 !== null);
  if (modBeforeR13) {
    const corpus = [...ALLOWED, ...R12_FORMS, ...R12_DENY_FORMS.map((row) => row[1]), ...R13_RISKY_FORMS, ...R13_CONTROL_FORMS];
    const changed = [];
    for (const cmd of corpus) {
      const before = dec(modBeforeR13, cmd, SLOT_A).decision;
      const after = dec(guard, cmd, SLOT_A).decision;
      if (before !== after) changed.push(cmd + ' (' + before + ' -> ' + after + ')');
    }
    const expectedChanged = new Set(R13_RISKY_FORMS);
    const onlyExpected = changed.every((entry) => expectedChanged.has(entry.split(' (')[0])) &&
      R13_RISKY_FORMS.every((cmd) => changed.some((entry) => entry.startsWith(cmd + ' (')));
    check('AH-23 differential: R13 changes a decision only on the six risky forms, nothing else in the corpus (' + changed.join('; ') + ')',
      onlyExpected);
  }
}

// ── AH-24 (work/owner-one-action-gates/brief.md §3) ──────────────────────────────────────
// R12 gains exactly three new alternatives: brief-request work/<id>/brief.md,
// protected-request task/<id>, protected-commit task/<id>. The shared trigger/cwd/env/identity
// branching (AH-20 above) is not re-specialized per verb, so only the form-shape rows differ.
const OAG_FORMS = [
  'node .claude/hooks/pt-land.js brief-request work/x/brief.md',
  'node .claude/hooks/pt-land.js protected-request task/x',
  'node .claude/hooks/pt-land.js protected-commit task/x'
];
for (const form of OAG_FORMS) {
  check('AH-24 allow, slot cwd: ' + JSON.stringify(form), r12Decide(form, { cwd: SLOT_A }).decision === 'allow');
  check('AH-24 allow, canonical cwd: ' + JSON.stringify(form), r12Decide(form, { cwd: R11_CANON, projectDir: R11_CANON }).decision === 'allow');
}
const OAG_DENY_FORMS = [
  ['brief-request trailing space', 'node .claude/hooks/pt-land.js brief-request work/x/brief.md '],
  ['brief-request no path', 'node .claude/hooks/pt-land.js brief-request'],
  ['brief-request review.md, not brief.md', 'node .claude/hooks/pt-land.js brief-request work/x/review.md'],
  ['brief-request uppercase id (R11 pattern is lowercase-only)', 'node .claude/hooks/pt-land.js brief-request work/X/brief.md'],
  ['brief-request env prefix', 'FOO=bar node .claude/hooks/pt-land.js brief-request work/x/brief.md'],
  ['brief-request bash -c wrapper', 'bash -c "node .claude/hooks/pt-land.js brief-request work/x/brief.md"'],
  ['protected-request no task', 'node .claude/hooks/pt-land.js protected-request'],
  ['protected-request non-task/ ref', 'node .claude/hooks/pt-land.js protected-request branch-dev'],
  ['protected-request trailing space', 'node .claude/hooks/pt-land.js protected-request task/x '],
  ['protected-request compound &&', 'node .claude/hooks/pt-land.js protected-request task/x && echo done'],
  ['protected-commit no task', 'node .claude/hooks/pt-land.js protected-commit'],
  ['protected-commit bash -c wrapper', 'bash -c "node .claude/hooks/pt-land.js protected-commit task/x"'],
  ['protected-commit compound &&', 'node .claude/hooks/pt-land.js protected-commit task/x && echo done'],
  ['unknown verb protected-apply', 'node .claude/hooks/pt-land.js protected-apply task/x']
];
for (const [label, cmd] of OAG_DENY_FORMS) {
  check('AH-24 deny (' + label + ')', r12Decide(cmd, { cwd: SLOT_A }).decision === 'deny');
}
// Differential: swap the real, on-disk R12_FORM_RE line (post-OAG) for its pre-OAG shape and
// reload - over the pre-existing corpus (every AH-1 ALLOWED command, every R12/R13 form/deny
// form), the two modules must disagree ONLY on the three new OAG forms (R12_FORM_RE only gains
// alternatives; nothing else in the hook changes - brief §3 "Nothing else changes"). This check
// is red until the Owner applies the candidate (HOOK_PATH still has the pre-OAG line), matching
// every other "real on-disk hook" check in this suite (AH-8/AH-23 above).
{
  const postOagLine = 'const R12_FORM_RE = /^node \\.claude\\/hooks\\/pt-land\\.js (?:(?:land-request|land|cleanup) task\\/[A-Za-z0-9._-]+(?:\\/[A-Za-z0-9._-]+)*|push-request|push|brief-request work\\/[a-z0-9][a-z0-9._-]*\\/brief\\.md|(?:protected-request|protected-commit) task\\/[A-Za-z0-9._-]+(?:\\/[A-Za-z0-9._-]+)*)$/;';
  const preOagLine = 'const R12_FORM_RE = /^node \\.claude\\/hooks\\/pt-land\\.js (?:(?:land-request|land|cleanup) task\\/[A-Za-z0-9._-]+(?:\\/[A-Za-z0-9._-]+)*|push-request|push)$/;';
  const normalizedSrc = fs.readFileSync(HOOK_PATH, 'utf8').replace(/\r\n/g, '\n');
  const found = normalizedSrc.split(postOagLine).length - 1;
  check('AH-24 differential sanity: the post-OAG R12_FORM_RE line was found exactly once', found === 1);
  if (found === 1) {
    const srcBeforeOag = normalizedSrc.replace(postOagLine, preOagLine);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-oag-diff-'));
    let modBeforeOag = null;
    try {
      const file = path.join(dir, 'pretooluse-guard.js');
      fs.writeFileSync(file, srcBeforeOag);
      modBeforeOag = require(file);
    } catch (e) { /* handled by the null check below */ } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    check('AH-24 differential sanity: the pre-OAG module loads', modBeforeOag !== null);
    if (modBeforeOag) {
      const corpus = [...ALLOWED, ...R12_FORMS, ...R12_DENY_FORMS.map((row) => row[1]), ...R13_RISKY_FORMS, ...R13_CONTROL_FORMS];
      const changed = [];
      for (const cmd of corpus) {
        const before = dec(modBeforeOag, cmd, SLOT_A).decision;
        const after = dec(guard, cmd, SLOT_A).decision;
        if (before !== after) changed.push(cmd + ' (' + before + ' -> ' + after + ')');
      }
      check('AH-24 differential: the pre-existing corpus is unaffected by the OAG alternation (' + changed.join('; ') + ')',
        changed.length === 0);
    }
  }
}

// AH-24 CLI (brief §6 "G1-G3 hook spawns"): a real hook-process spawn for each new form - allow from
// a slot cwd (exit 0, silent) - and the wrapped / compound variants deny with R12 on stderr.
for (const form of OAG_FORMS) {
  const r = spawnCliEnv(payload(form, SLOT_A), undefined);
  check('AH-24 CLI allow [slot] ' + form + ' -> exit 0, empty stdout/stderr', r.status === 0 && r.stdout === '' && r.stderr === '');
}
for (const [label, cmd] of OAG_DENY_FORMS.filter((row) => /wrapper|compound/.test(row[0]))) {
  const r = spawnCliEnv(payload(cmd, SLOT_A), undefined);
  check('AH-24 CLI deny (' + label + ') -> exit 2, empty stdout, R12 on stderr', r.status === 2 && r.stdout === '' && /R12/.test(r.stderr));
}

// AH-20 unchanged: direct git merge/push and a Claude write of the approval record stay denied
// with their existing R3m/R3g/R10 reasons - R12 never opens a new path for these.
check('AH-20 unchanged: git merge --ff-only task/x still denied (R3m)',
  dec(guard, 'git merge --ff-only task/x', SLOT_A).decision === 'deny' && /R3m/.test(dec(guard, 'git merge --ff-only task/x', SLOT_A).reason));
check('AH-20 unchanged: git push origin branch-dev still denied (R3g/push)',
  dec(guard, 'git push origin branch-dev', SLOT_A).decision === 'deny');
check('AH-20 unchanged: git -C ../portfolio-tracker merge x still denied',
  dec(guard, 'git -C ../portfolio-tracker merge x', SLOT_A).decision === 'deny');
check('AH-20 unchanged: a Bash redirect into .git/pt-land-approval still denied (R10-3c)',
  dec(guard, "printf 'x' > .git/pt-land-approval", SLOT_A).decision === 'deny');

// AH-20 mutants (5, each caught): the R12-specific guard-side invariants.
mutantCatches('R12 form regex widened (any pt-land invocation accepted)',
  // owner-one-action-gates: the anchor is the post-OAG line (three new alternatives, brief §3).
  "const R12_FORM_RE = /^node \\.claude\\/hooks\\/pt-land\\.js (?:(?:land-request|land|cleanup) task\\/[A-Za-z0-9._-]+(?:\\/[A-Za-z0-9._-]+)*|push-request|push|brief-request work\\/[a-z0-9][a-z0-9._-]*\\/brief\\.md|(?:protected-request|protected-commit) task\\/[A-Za-z0-9._-]+(?:\\/[A-Za-z0-9._-]+)*)$/;",
  'const R12_FORM_RE = /pt-land/;',
  (m) => r12DecideOn(m, 'node .claude/hooks/pt-land.js push extra-arg', { cwd: SLOT_A }).decision === 'deny');
mutantCatches('R12 tool check dropped (PowerShell accepted)',
  "if (tool !== 'Bash') return r12Deny('the PowerShell tool');",
  'if (false) { /* dropped */ }',
  // The canonical (non-slot) cwd, not a slot cwd: R2's earlier "PowerShell - denied in
  // Worker-slot sessions" already catches a slot cwd regardless of this check, so a slot-cwd
  // probe would mask the mutation rather than exercise it.
  (m) => r12DecideOn(m, 'node .claude/hooks/pt-land.js push', { cwd: R11_CANON, projectDir: R11_CANON, tool: 'PowerShell' }).decision === 'deny');
mutantCatches('R12 cwd check dropped (outside slot/canonical accepted)',
  "if (!r12Slot && !r12Canonical) return r12Deny('the cwd is neither a Worker slot nor the canonical checkout');",
  'if (false) { /* dropped */ }',
  (m) => r12DecideOn(m, 'node .claude/hooks/pt-land.js push', { cwd: 'C:\\Users\\Owner\\Documents\\Project\\somewhere-else', projectDir: R11_CANON }).decision === 'deny');
mutantCatches('R12 env check dropped (GIT_DIR override accepted)',
  "if (r12EnvBad !== undefined) return r12Deny('the session environment sets ' + r12EnvBad);",
  'if (false) { /* dropped */ }',
  (m) => {
    const saved = process.env.GIT_DIR;
    process.env.GIT_DIR = 'x';
    try { return r12DecideOn(m, 'node .claude/hooks/pt-land.js push', { cwd: SLOT_A }).decision === 'deny'; }
    finally { if (saved === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = saved; }
  });
mutantCatches('R12 trigger dropped (the whole gate is skipped)',
  "if (R12_TRIGGER_RE.test(command) || R12_TRIGGER_RE.test(stripShellEscapes(command, tool))) {",
  'if (false) {',
  (m) => r12DecideOn(m, 'node .claude/hooks/pt-land.js push extra-arg', { cwd: SLOT_A }).decision === 'deny');

fs.rmSync(R11_CANON, { recursive: true, force: true });

if (failures) {
  console.log('Auto-mode hardening: FAIL (' + failures + ' of ' + asserts + ' assertions)');
  process.exit(1);
}
console.log('Auto-mode hardening: PASS (' + asserts + ' assertions)');
