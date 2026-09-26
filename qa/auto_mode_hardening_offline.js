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

function dec(mod, command, cwd, tool) {
  try {
    return mod.decide({ tool_name: tool || 'Bash', tool_input: { command }, cwd: cwd === undefined ? SLOT_A : cwd });
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
check('AH-1 git commit -m "doc: explain git push" -> ask (never deny)',
  d('git commit -m "doc: explain git push"', SLOT_A).decision === 'ask' &&
  d('git commit -m "doc: explain git push"', MAIN).decision === 'ask');
check('AH-1 heredoc commit message containing "git push" and ")" is not classified',
  d('git commit -m "$(cat <<\'EOF\'\nfix (thing)\ngit push --force\nEOF\n)"', SLOT_A).decision === 'ask');
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
check('AH-6 R2 Bash git push: slot deny with R1, main deny (push manually), commit ask',
  d('git push', SLOT_A, 'Bash').decision === 'deny' && /R1/.test(d('git push', SLOT_A, 'Bash').reason) &&
  d('git push', MAIN, 'Bash').decision === 'deny' && /push manually/.test(d('git push', MAIN, 'Bash').reason) &&
  d('git commit -m x', SLOT_A, 'Bash').decision === 'ask');
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
check('AH-6b slot Bash unchanged: status allow, push deny R1, commit ask, qa:offline allow',
  d('git status', SLOT_A, 'Bash').decision === 'allow' && d('git push', SLOT_A, 'Bash').decision === 'deny' && /R1/.test(d('git push', SLOT_A, 'Bash').reason) &&
  d('git commit -m x', SLOT_A, 'Bash').decision === 'ask' && d('npm run qa:offline', SLOT_A, 'Bash').decision === 'allow');
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
  check('AH-11 control [' + (cwd === MAIN ? 'main' : 'slot') + ']: git commit stays ask (incl. a message that mentions git push)',
    d('git commit -m x', cwd).decision === 'ask' && d('git commit -m "doc: explain git push"', cwd).decision === 'ask' && d('git -C x commit -m y', cwd).decision === 'ask');
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
for (const cwd of [SLOT_A, MAIN]) expectAll('AH-12 commit-message heredoc text stays ask', COMMIT_HEREDOCS, cwd, 'ask');
check('AH-12 PowerShell main: interpreter fed by redirect denied, plain pipeline allowed',
  d('powershell < x.ps1', MAIN, 'PowerShell').decision === 'deny' && d('Get-ChildItem | Sort-Object', MAIN, 'PowerShell').decision === 'allow');
check('AH-12 unbalanced heredoc delimiter into bash still fails closed', d('bash <<"EOF\nx', MAIN).decision === 'deny');
check('AH-12 R1 / R3g preserved: canonical push deny, slot push R1 suffix, slot PowerShell blanket deny, commit ask',
  d('git push --dry-run', MAIN).decision === 'deny' && /R1/.test(d('git push', SLOT_A).reason) &&
  d('Get-ChildItem', SLOT_A, 'PowerShell').decision === 'deny' && d('git commit -m x', MAIN).decision === 'ask');
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
expectAll('AH-13 commit text mentioning the forms stays ask',
  ['git commit -m "$(printf x | (cat))"', 'git commit -m "docs: printf x | (bash) is denied"', 'git commit -m "$(cat <<\'EOF\'\nfeat: { bash; } < f and echo x | (bash)\nEOF\n)"'], MAIN, 'ask');
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
const CASE_CMD_PAIRS = ['git commit -m y', 'git merge y', 'git rebase y', 'git reset --hard', 'git checkout main', 'netlify deploy', 'echo x > package.json', 'bash < f',
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
check('AH-14 multiline case: command on its own line still classified (push deny, commit ask)',
  d('case x in x)\n git push\n;;\nesac', MAIN).decision === 'deny' && d('case x in x)\n git commit -m y\n;;\nesac', MAIN).decision === 'ask');
expectAll('AH-14 commit text containing case syntax stays ask',
  ['git commit -m "case x in x) git push;; esac"', "git commit -m 'fix: case x in a|b) git push;; esac'", 'git commit -m "$(cat <<\'EOF\'\nfix: case x in a|b) git push;; esac\nEOF\n)"',
    'git commit -m "docs: (case x in x) git push;; esac)"', "git commit -F - <<'EOF'\ncase x in x) git push;; esac\nEOF"], MAIN, 'ask');
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
    return guard.decide(input);
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
  check('AH-15 control [' + cwdLabel(cwd) + ']: commit stays ask (incl. messages that mention merge / rebase / pull)',
    ['git commit -m x', 'git -C x commit -m y', 'git commit -m "docs: git merge, git rebase and git pull are denied"',
      'git commit -m "$(cat <<\'EOF\'\nfix: git pull --rebase notes\nEOF\n)"'].every((c) => dAt(c, cwd).decision === 'ask'));
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
  let commitJson = null;
  try { commitJson = JSON.parse(commitMain.stdout); } catch (e) { commitJson = null; }
  check('AH-15 CLI control: git commit (main) -> exit 0 + permissionDecision "ask"',
    commitMain.status === 0 && commitJson && commitJson.hookSpecificOutput && commitJson.hookSpecificOutput.permissionDecision === 'ask');
  const pushMain = spawnCliEnv(payload('git push', MAIN));
  check('AH-15 CLI control: git push -> exit 2 with the push reason (R3g wording unchanged)', pushMain.status === 2 && /push manually/.test(pushMain.stderr) && !/R3m/.test(pushMain.stderr));
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
  const ask = spawnCli(payload('git commit -m x', MAIN));
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
mutantCatches('push not denied (downgraded to commit/ask)', "cls: 'push', reason", "cls: 'commit', reason",
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
mutantCatches('checkout main not destructive', "'origin/main'", "'origin/main-x'",
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
const HOOK_COMMAND = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/pretooluse-guard.js"';

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
  if (!sameSet(deny, [...BASE_DENY, ...ADD_DENY])) p.push('deny set is not base + §5 additions');
  if (!sameSet(ask, [...BASE_ASK.filter((x) => MOVED_TO_DENY.indexOf(x) === -1), ...ADD_ASK])) p.push('ask set is not (base − moved) + §5 additions');
  if (!sameSet(allow, BASE_ALLOW)) p.push('allow set changed (must be unchanged)');
  if (allow.some((r) => /^Bash\(npm run \*\)$|node -e|python3? -c/.test(r))) p.push('broad allow (npm run * / node -e / python3 -c) present');
  if (perms.defaultMode !== 'acceptEdits') p.push('defaultMode is not acceptEdits');
  if (/bypassPermissions|"auto"/.test(JSON.stringify(s))) p.push('bypassPermissions/auto present');
  const pre = s && s.hooks && s.hooks.PreToolUse;
  const wired = Array.isArray(pre) && pre.some((e) => e && e.matcher === 'Bash|PowerShell' && Array.isArray(e.hooks) &&
    e.hooks.some((h) => h && h.type === 'command' && h.command === HOOK_COMMAND && h.timeout === 10));
  if (!wired) p.push('PreToolUse hook not wired with matcher Bash|PowerShell / exact command / timeout 10');
  return p;
}
function appliedSettings() {
  return {
    hooks: { PreToolUse: [{ matcher: 'Bash|PowerShell', hooks: [{ type: 'command', command: HOOK_COMMAND, timeout: 10 }] }] },
    permissions: {
      deny: [...BASE_DENY, ...ADD_DENY],
      ask: [...BASE_ASK.filter((x) => MOVED_TO_DENY.indexOf(x) === -1), ...ADD_ASK],
      allow: BASE_ALLOW.slice(),
      defaultMode: 'acceptEdits'
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
  check('AH-8 planted negatives: each mutated settings fixture is rejected',
    [m1, m2, m3, m4, m5, m6, m7, m8, m9].every((m) => settingsProblems(m).length > 0));
  check('AH-8 planted negative: pre-§5 baseline settings are rejected',
    settingsProblems({ permissions: { deny: BASE_DENY, ask: BASE_ASK, allow: BASE_ALLOW, defaultMode: 'acceptEdits' } }).length > 0);
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
  const bashAllow = ((realSettings.permissions && realSettings.permissions.allow) || []).filter((r) => /^Bash\(.*\)$/.test(r));
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

if (failures) {
  console.log('Auto-mode hardening: FAIL (' + failures + ' of ' + asserts + ' assertions)');
  process.exit(1);
}
console.log('Auto-mode hardening: PASS (' + asserts + ' assertions)');
