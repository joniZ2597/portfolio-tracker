# Task brief: Guard hardening r10 — escapes, aliases, git config/hooks, ref-moving gaps, .git writes

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Baseline | f1a53aef6f22814f52001be9f8fd9d6c4592f7a5 = branch-dev = origin/branch-dev (main = origin/main = fbec2c1) |
| Branch / slot | task/guard-r10 in a Worker slot (Bootstrap assigns) |
| Mode | **Manual** (protected workflow surface / gate change) |
| qa:offline | 50 → 50 (existing suite extended; no new suite registered) |
| Status | CODE-READY on Owner approval of this brief, incl. R10-1…R10-8 |

Objective. Close the residual bypass families found after r9, add the narrowest deterministic
compensating control for what a command-text hook cannot close, and measure PreToolUse timeout
semantics. Preserve every existing r9 / R3g / R3m / R2 / R2b / r5–r8 decision. The hook stays deny-only.
The AGENTS.md Auto-worker policy remains frozen and is not part of this task.

## 1. Evidence (reproduced on f1a53ae; r7 b71d09c and r8 575fca4 give identical decisions — all pre-existing)

Decisions shown slot/main. "allow" = the hook has no opinion; the outcome then depends on the permission mode.
Impacts marked (c) were confirmed in a throwaway repo (Git 2.34, sandbox); host Git version not verified.

| ID | Exact command | f1a53ae | Impact |
|---|---|---|---|
| T1a | `g\it push` · `git pu\sh` · `git me\rge x` · `git re\base x` · `git pu\ll` | allow/allow | Bash removes `\` and real git runs (c). Defeats every hook deny |
| T1b | `git c\ommit -am x` | allow/allow | Skips the whole r9 commit gate; a commit was created (c) |
| T1c | `git reset --h\ard` · `git checkout ma\in` · `git update-ref refs/heads/branch-d\ev X` · `n\etlify deploy --prod` | allow/allow | Same class for flags, targets and programs |
| T1d | PowerShell tool ``g`it push`` | deny/allow | Main checkout only (slots: R2b) |
| T2a | `git -c alias.p=push p` · `git -c alias.ci=commit ci -am x` · `git -c alias.m=merge m x` | allow/allow | One-call push/commit/merge; push reached the remote (c) |
| T2b | `git config alias.p push` then `git p` | allow/allow | Persistent; config is shared by all worktrees (c) |
| T2c | `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.p GIT_CONFIG_VALUE_0=push git p` · `git --config-env=alias.p=V p` | allow/allow | Env-injected alias; pushed (c) |
| T2d | `".../libexec/git-core/git-push.exe" origin x` · `git-push` | allow/allow | Dashed program not recognised as git |
| T3a | a pre-commit hook in the common `.git/hooks/` doing `git add .claude/settings.json`, then plain `git commit -m x` in a slot | gate allow | Protected file committed on task/x after a clean gate read (c) |
| T3b | `git config core.hooksPath <dir>` · `git config include.path <file>` · `git -c core.fsmonitor=<prog> status` | allow/allow | Shared config: hooks also run in the Owner's terminal during LAND/push; post-checkout ran (c) |
| T3c | `cp x ../portfolio-tracker/.git/hooks/pre-commit` · `echo … >> .git/config` · Write/Edit tool into `.git/` | allow/allow; file tools never reach the hook | Hook/config planted without `git config` |
| T3d | `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/tmp/h git checkout x` | allow/allow | Code runs via checkout hooks |
| T4a | `git update-ref HEAD <sha>` · `git update-ref --no-deref HEAD <sha>` | allow/allow | In canonical: moves branch-dev (c) |
| T4b | `git branch -m newname` | allow/allow | In canonical: renames branch-dev; `git branch branch-dev <sha>` recreates it (c) |
| T4c | `git checkout -B branch-dev` · `git switch -C branch-dev` · `-Bbranch-dev` · `--force-create` · `git worktree add -f -B branch-dev ../w <sha>` · `-B BRANCH-DEV` | allow/allow | Resets branch-dev (c with -f / --ignore-other-worktrees) |
| T4d | `git checkout -B branch-dev --ignore-other-worktrees` · `git switch --ignore-other-worktrees branch-dev` | allow/allow | From a slot: moved branch-dev (c) |
| T5a | `git fetch . task/x:branch-dev` · `git fetch origin +main:main` · `git config remote.origin.fetch +refs/heads/*:refs/heads/*` · `git remote add --mirror=fetch m .` | allow/allow | From a slot: moved branch-dev (c) |
| T5b | `git cherry-pick <sha>` · `git revert HEAD` · `git am x.patch` · `git filter-branch …` | allow/allow | Commits without the gate: canonical (breaks RC2) or a slot (breaks the staged-set check) |
| T5c | `git reset --soft/--mixed HEAD~1` · `git reset HEAD~1` in the canonical checkout | allow/allow | Moves branch-dev |
| T6 | Write a script, then `node x.js` / `npm run …` where the script spawns `git push` etc. | allow/allow | See §5 — not closable by command-text analysis |

## 2. Rules (approved with this brief)

- **R10-1 Escape differential.** Analyse each command twice: literally, and with shell escapes removed.
  - Bash tool: unquoted `\X`→`X`, and `\<newline>` removed.
  - PowerShell tool: backtick escapes outside single quotes removed.
  - Nested `bash -c`, `eval` and `pwsh -Command` inherit the pass.
  - Deny (R10-E), every session, when a finding appears in the escape-removed pass but not the literal
    one. A finding key is its class, reason and commit formIssue.
  - The literal pass and its decisions are unchanged. The commit gate runs once, on the literal pass only.
- **R10-2 Known-subcommand allowlist.** A git subcommand outside a frozen constant list → deny (R10-A),
  every session. External helpers (incl. git-lfs) get no exception.
  - The list is generated on the host, read-only, from `git --list-cmds=main`; the Git version is
    recorded in review.md.
  - A program named `git-<sub>` (any path, `.exe` stripped) is classified as `git <sub>`.
- **R10-3 Git config execution paths.** Protected keys: `core.hooksPath`, `core.fsmonitor`,
  `include.path` and `includeIf.*.path`.
  - (a) Commit gate: deny unless both checks pass. Each is evaluated once and stored.
    - Config check: `git config --get-regexp` shows none of the protected keys, or `core.fsmonitor` is a
      boolean. Exit 1 = none; any other exit, timeout or error = deny. Session `GIT_CONFIG_*` is kept so
      the gate sees what the commit sees.
    - Hooks check: the common git dir's `hooks/` has no entry except `*.sample`. A missing dir = none;
      a read error = deny.
  - (b) Deny, every session:
    - `git config` write forms naming a protected key (read forms stay allowed);
    - `-c` / `--config-env` with a protected key, on any git command;
    - `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_n`, `GIT_CONFIG_VALUE_n`, `GIT_CONFIG_PARAMETERS`,
      `GIT_CONFIG_GLOBAL` or `GIT_CONFIG_SYSTEM` set as a prefix or through `env` on a git program.
  - (c) Bash/PowerShell writers (redirects, tee, cp/mv, sed -i, Set-Content and inline interpreter
    code) targeting any path with a `.git` segment, or a `.git` file → deny, every session.
- **R10-4 RC4 extension.** Deny, every session:
  - non-delete `update-ref` of `HEAD` (with or without `--no-deref`);
  - `branch -m`, `-M` or `--move` with exactly one positional;
  - `checkout -B`, `switch -C` or `--force-create` (separate and attached values), and `worktree add`
    whose `-b`/`-B` value or checkout target is main/branch-dev (case-insensitive, `refs/heads/` stripped);
  - `--ignore-other-worktrees` on checkout or switch.
- **R10-5 Other ref-moving and commit-creating commands.**
  - Deny, every session:
    - `cherry-pick`, `revert`, `am` and `filter-branch` (all forms);
    - `fetch` with a refspec whose destination is main/branch-dev (optional `+`, `refs/heads/`,
      case-insensitive), or with `--refmap`;
    - `git config` writes of `remote.*.fetch` or `remote.*.mirror`;
    - `git remote add --mirror*`.
  - Reset: `--hard` stays denied everywhere. When the HEAD of the repository containing the cwd is
    `refs/heads/main` or `refs/heads/branch-dev` (fs read, injectable, unreadable = deny), deny every reset
    except these harmless forms:
    - `git reset` (no arguments), `git reset HEAD`, and `-q` variants;
    - `git reset [HEAD] -- <paths>`;
    - `git reset HEAD <paths>`;
    - `git reset <paths>` when every positional exists as a file relative to the cwd.
  - A reset with git global options (`-C`, `--git-dir`, `--work-tree`) or a `GIT_DIR`/`GIT_WORK_TREE`
    prefix → deny.
  - Slots on task/* keep today's reset behaviour.
- **R10-6 File-tool guard for `.git`.**
  - Owner-applied settings change: the PreToolUse `matcher` becomes
    `Bash|PowerShell|Write|Edit|MultiEdit|NotebookEdit`. Nothing else in settings changes.
  - The hook denies these tools, every session, when `file_path` / `notebook_path` has a `.git` segment
    or is a `.git` file (case-insensitive). The path is checked after resolving it against the cwd and
    taking `realpathSync.native` of the deepest existing ancestor, so junctions and symlinks count.
    A missing or unresolvable path is also denied.
  - Any other file-tool call → no opinion, so existing permission rules decide as today.
- **R10-7 Time budget.** The hook works to a fixed deadline of 8 s from start.
  - Each subprocess timeout = min(4 s, time remaining).
  - An exhausted budget = deny.
  - This stays inside the 10 s settings timeout whatever LV-0 shows.
- **R10-8 Integrity check (compensating control, detection only).** New read-only
  `qa/guard_integrity_check.js`, run by the Worker at STOP (result in review.md) and by the Owner
  before LAND.
  - Inputs: `--since <ISO>`, `--base-main <oid>`, `--base-dev <oid>`, `--task task/<id>`.
  - FAIL (exit 1) on any of:
    1. local main/branch-dev differ from the given oids;
    2. reflog entries newer than `--since` on refs/heads/main, refs/heads/branch-dev or
       refs/remotes/origin/* (incl. "update by push");
    3. any R10-3 protected key, a non-default `remote.*.fetch`, `remote.*.mirror` or any `alias.*`
       in effective config;
    4. any non-`.sample` hook;
    5. in any worktree, `.claude/settings*.json` or `.claude/hooks/**` differing from HEAD;
    6. `git diff --name-only <base-dev>...<task>` touching a protected path (the r9 staged-deny set);
    7. a worktree set other than canonical + the two slots, or main/branch-dev checked out outside
       canonical.
  - Report-only: other exec-bearing keys (core.sshCommand, core.pager, diff.external, filter.*,
    gpg.program, core.editor, sequence.editor).
  - Optional `--remote` (Owner only, network read): `git ls-remote origin main branch-dev` equals the
    expected oids.
  - All reads use `GIT_OPTIONAL_LOCKS=0`; each result is computed once and stored. Not part of qa:offline.

## 3. Scope — exactly
1. `.claude/hooks/pretooluse-guard.js`: r10 candidate built in the Worker scratchpad; the Owner copies
   it after a hash check (R3).
2. `.claude/settings.json`: the R10-6 matcher string only (Owner-applied, hash-checked; the suite's
   AH-8 literal is updated to match).
3. `qa/auto_mode_hardening_offline.js`: AH-17 (hook) and AH-18 (integrity check) rows, temp-repo checks,
   CLI rows, mutants; any flipped existing row is listed in review.md.
4. `qa/guard_integrity_check.js` (new).
5. `work/guard-r10/review.md`.

Not in scope: AGENTS.md, CLAUDE.md, `.claude/rules/**`, `package*.json`, other settings keys,
push/merge/rebase/pull semantics, Netlify/protected-write asks, OS/credential/GitHub-side controls,
product code, deploy.

## 4. QA and live validation
- **AH-17: every §1 row T1–T5 → deny**, in slot, main and missing-cwd, through `decide` and `runCli`
  (exit 2). This includes the file-tool rows for `.git` via relative, absolute, `..`, mixed-case and
  junction paths.
- **Keep-allowed rows (slot):**
  - `git status`, `git diff --cached --stat`, `git log --oneline -3`, `git add <path>`;
  - `git commit -m x` with a clean state; `git checkout -b task/n`; `git switch task/x`;
  - `git branch -m task/a task/b`, `git config --get core.hooksPath`, `git worktree list`,
    `git fetch origin`, `git reset -- f`, `git reset --soft HEAD~1`;
  - `echo a\ b`, quoted Windows paths;
  - Write/Edit of ordinary repo files and of `.github/…`, `.gitignore` (ASK tier unchanged).
- **Keep-allowed rows (canonical):** `git reset`, `git reset -- f`, `git reset HEAD f`,
  `git reset f` (existing file).
- **Real git (temp repos under os.tmpdir):**
  - pre-commit re-stage → gate deny;
  - hooksPath / fsmonitor / include.path set → deny;
  - `.sample`-only → allow;
  - unreadable config → deny;
  - canonical-HEAD reset rows;
  - integrity check PASS on a clean fixture, and FAIL on each of its seven conditions.
- **QA lesson:** every subprocess-backed check computes its result ONCE and asserts on the stored value.
- **Differential r9↔r10:** over the full existing corpus, only T-rows, unknown-subcommand rows and
  canonical-reset rows may change.
- **Mutants:** one per rule (≥ 10).
- **Gates:** full qa:offline 50; G1–G3 on the copied r10, incl. a file-tool activation check.
- **LV-0 timeout semantics** (Owner, harmless, any time, isolated empty folder outside every repo):
  1. The folder gets its own `.claude/settings.json`: a PreToolUse Bash hook `node slow.js`, where slow.js
     waits 20 s then exits 2, with `timeout: 3`.
  2. In a Claude Code session there, run `echo probe > marker.txt`: once in default mode, once in auto mode.
  3. Controls: a hook that exits 2 at once (expect blocked); a hook that exits 1 (expect fail-open).
  4. Result recorded in review.md: marker.txt created = fail-open; absent = fail-closed. Record the
     Claude Code version.
- **Live (Owner, after the Owner applies r10 and the matcher; restart sessions):**
  1. slot: `g\it push --dry-run` → blocked;
  2. `git -c alias.p=push p --dry-run` → blocked;
  3. `git switch --ignore-other-worktrees branch-dev` → blocked;
  4. `git fetch --dry-run . HEAD:branch-dev` → blocked;
  5. `git cherry-pick --abort` → blocked;
  6. Write tool to `<canonical>/.git/hooks/r10-probe.txt` → blocked, and the file is absent;
  7. `git commit --dry-run --allow-empty -m x` on task/* → passes;
  8. canonical session: `git reset --soft HEAD` → blocked, `git reset -- README.md` → allowed;
  9. `node qa/guard_integrity_check.js …` → PASS on the clean state.

STOP:
- any file outside scope;
- any settings change beyond the matcher;
- any differential row outside the allowed set;
- any change to push/merge/rebase/pull, read-only, R2/R2b or r5–r9 behaviour;
- a Worker hook or settings write;
- the budget exceeded in QA;
- non-deterministic reads;
- a G/L/LV gate failure (HOLD);
- any branch-dev commit, push, LAND, deploy or main change;
- any AGENTS.md or CLAUDE.md edit.

Order:
1. LV-0 (Owner, can run first).
2. Candidate + integrity script + suite.
3. Differential + mutants.
4. Owner applies r10 + matcher (hash-checked).
5. Full QA + G1–G3.
6. Independent Codex read-only review (Worker-launched).
7. Final check → STOP before commit (the Auto commit policy is not adopted yet).

## 5. Indirect script execution (T6) — cannot be closed by the hook

- **Remaining capability.** Any session that can write or modify a file that later runs (a new
  script, any `qa/*.js` suite run by qa:offline, test fixtures) and can run node, npm or npx can
  start child processes the hook never sees. Those processes run with the Worker's OS identity and
  environment, including cached Git credentials. They can push, merge or move refs, rewrite
  `.git/config` or `.git/hooks`, and edit `.claude/settings*.json` or `.claude/hooks/**`. Edit/Write
  deny rules do not apply to scripts.
- **Why it can't be closed.** Denying interpreter-on-file would break qa:offline and the required
  out-of-repo temp harnesses, and no text rule can tell a legitimate script from a harmful one.
- **Blast radius.**
  - Local refs, shared git config/hooks and governance files: detectable by R10-8, and recoverable
    through reflog or origin.
  - Any remote push, including `main`: not prevented and not locally reversible. If Netlify builds
    production from main, a pushed main would deploy.
- **Which Auto workflows can exercise it.** Every implementation task that edits JS or runs
  qa:offline or `test:*`, which is all Auto-eligible work.
- **Compensating boundary.**
  - In r10: R10-8 detection at STOP and before LAND.
  - Outside r10 (prevention): a GitHub ruleset blocking direct pushes to main (and optionally
    branch-dev), or Worker sessions without push credentials (a separate OS user or sandbox).
- **Assessment.**
  - Attended Auto (Owner reviews at STOP and runs R10-8 before LAND) is acceptable after r10.
  - Unattended Auto is **not** acceptable until a remote-side prevention boundary exists for at least main.

## 6. Documented residuals after r10
- T6 (above).
- Exec-bearing config keys outside R10-3 (report-only in R10-8).
- Bash writers outside the classified list (e.g. `dd of=`, `install`, scripts) writing `.git/`: the
  commit path is still blocked by R10-3(a), and the rest is detected by R10-8.
- Task-branch content crafted without a commit (`commit-tree` + `update-ref task/*`, slot
  `reset --soft`): caught by R10-8 check 6 and the LAND diff review.
- Dynamic construction (unchanged deferral).
