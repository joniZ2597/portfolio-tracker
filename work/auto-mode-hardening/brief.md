# Task brief: Auto-mode hardening — permission rules + PreToolUse guard hook

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

| | |
|---|---|
| Track / ARC | Workflow / Dev Infra · Auto-mode readiness (FABLE Auto Mode Expansion Review, approved) |
| Baseline | **`5ad0a5fc32038010aff6d8b47ac151651a1067d0`** = `branch-dev` = `origin/branch-dev` |
| Branch / slot | new `task/auto-mode-hardening` in a Worker slot |
| `qa:offline` | **49 → 50** — one new auto-discovered suite; `qa/run-offline.js` **not** edited |
| Lane | neither (no `index.html`) |
| Status | **CODE-READY on Owner approval of these exact contents, including the §2 rulings** |

**Objective.** Close the known permission bypasses **before** Auto mode is used more widely: a
deterministic PreToolUse guard for Bash and PowerShell, plus defence-in-depth rule changes. **This is
not a Worker-mode policy change**: `defaultMode` stays `acceptEdits`, AGENTS.md is untouched, and
commit / LAND / push governance is unchanged.

---

## 1 · Facts this design relies on (Claude Code docs, checked 2026-09-26)

- A `PowerShell` tool exists on Windows; its rules mirror Bash (`PowerShell(<pattern>)`).
- `Bash(x *)` and `Bash(x:*)` are both valid. Compound commands (`&&` `||` `;` `|` `&`, newline) are
  split and each part is checked. **Prefix rules do not reliably catch `bash -c "…"`, `git -C … push`,
  or other wrappers.** That is why the hook exists.
- Deny is evaluated before ask, and ask before allow. **Deny rules apply in every mode.** PreToolUse
  hooks run in every mode **except `bypassPermissions`**. In Auto mode, deny/ask rules and PreToolUse
  hooks are evaluated **before** the classifier.
- A PreToolUse hook blocks with **exit 2 + stderr**, or with exit 0 plus JSON
  `hookSpecificOutput.permissionDecision` = `"deny"` / `"ask"`. **Any other non-zero exit is non-blocking,
  so the call proceeds (fail-open).** Hence §4 "fail closed".
- The matcher is a regex, so `"Bash|PowerShell"` works.

The Worker re-confirms these against the installed Claude Code version at plan time. **A mismatch is
M6 (the brief cannot be satisfied as written) and is recorded before any edit.**

## 2 · Owner rulings — **APPROVED 2026-09-26, R1–R5 exactly as below**

Owner summary: **R1** — Worker slots: push / merge / rebase = DENY; main/bootstrap checkout: push /
merge / rebase = ASK. **R2** — no Git through PowerShell; Worker Git operations use the governed Bash
path only. **R3** — `.claude/hooks/**` is DENY for Worker sessions. **R4** — Bash shell wrappers
denied outright as specified. **R5** — the Owner applies the `settings.json` / `settings.local.json`
edits manually at the instructed point (§3 order).

| # | Ruling | Why |
|---|---|---|
| **R1** | **Decision depends on the session's cwd.** A session whose cwd is a **Worker slot** (`…\pt-wt-worker-a` / `-b`) gets **DENY** for push/merge/rebase and for protected-file writes. A session in the **main checkout** (the Git/bootstrap Worker) gets **ASK** for those same ops, so the Owner approves each one in-session. Destructive ops are **DENY everywhere** (§4). | Keeps the Gen-5 flow (the bootstrap Worker lands and pushes with Owner approval, no PowerShell relay) while task Workers can never integrate. Not a bypass: every integration step still needs an explicit Owner approval. **If R1 is rejected**, protected ops become DENY everywhere, and the Owner path for rebase/merge/push is a **plain terminal** outside Claude Code |
| **R2** | **PowerShell becomes git-free and netlify-free.** All `git`, `netlify` and shell-escape forms are denied in the PowerShell tool. Git runs **only** through the Bash tool, where the hook and the rules apply. | One git channel, fully covered. The bootstrap Worker uses Bash for git |
| **R3** | **`.claude/hooks/**` joins the DENY tier** (same class as `.claude/settings*.json`). | The guard must not be editable by the sessions it guards |
| **R4** | **Bash shell wrappers are denied outright:** `bash -c`, `sh -c`, `cmd /c`, `cmd.exe /c`, `powershell`, `pwsh`, `eval`. | Nothing in the Worker contract needs them; the hook would also catch them (defence in depth) |
| **R5** | **The Owner applies the settings edits.** `.claude/settings.json` is DENY-tier for every task and `.claude/settings.local.json` is Owner-local and untracked. The Owner applies §5 to `settings.json` in the task slot (plain editor) and cleans `settings.local.json` in the main checkout **and both slots**. | Keeps the privilege-escalation surface Owner-only |

## 3 · File set

| Path | Author | Tracked |
|---|---|---|
| `.claude/hooks/pretooluse-guard.js` | Worker — **NEW** | yes |
| `qa/auto_mode_hardening_offline.js` | Worker — **NEW**, auto-discovered | yes |
| `.claude/settings.json` | **Owner-applied** exact §5 edits, in the task slot, before the full QA run | yes (same task commit) |
| `.claude/settings.local.json` ×3 (main checkout, worker-a, worker-b) | **Owner-local**, §5 removals | no |
| `work/auto-mode-hardening/review.md` | Worker — **NEW** | yes |

**Order:** the Worker builds the hook and suite → the Owner applies §5 → the Worker runs full QA,
activation gate G1–G3 (§6a) and Codex → **STOP before commit** → G4 live check (§6a) before
hardening counts as active. After the Owner applies §5, `.claude/hooks/**` is DENY for the Worker
too, so all hook edits must be finished first. A late fix is a STOP back to the Owner.

## 4 · Hook design — `.claude/hooks/pretooluse-guard.js`

- **Shape.** Node, no dependencies. Exports a pure `decide({tool_name, tool_input, cwd})` →
  `{decision: 'allow'|'ask'|'deny', reason}`, plus a CLI wrapper (stdin JSON → exit/JSON). The suite
  tests the real module (`.claude/rules/qa-suites.md`).
- **Wiring** (Owner-applied, §5): `PreToolUse` with matcher `"Bash|PowerShell"` and command
  `node "$CLAUDE_PROJECT_DIR/.claude/hooks/pretooluse-guard.js"`, `timeout` 10.
- **Outputs.**
  - `deny` → **exit 2**, reason on stderr.
  - `ask` → exit 0 with `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":…}}`.
  - `allow` → exit 0, **no output** (defer to the normal rules; the hook never grants anything).
- **Fail closed.**
  - Unparseable stdin, a missing or non-string `command`, or any thrown error → **exit 2**.
  - A command the parser cannot fully resolve (unbalanced quotes, undecodable `-EncodedCommand`) →
    **deny**.
  - Other tools → exit 0 (no opinion).
- **Normalization.**
  - Split on `&& || ; | & newline`, and on PowerShell `;`.
  - Tokenize with quote handling.
  - **Recursively unwrap:** `bash|sh|zsh -c`, `cmd[.exe] /c|/k`, `powershell|pwsh -c|-Command|-EncodedCommand` (base64 → UTF-16LE), `Invoke-Expression`/`iex`, `Start-Process`, the `&` call operator, `eval`, `env VAR=… cmd`, `xargs`, `nohup`, `time`.
  - **Recognise git as a program:** `git`, `git.exe`, or any path ending `/git`, `\git`, `\git.exe`.
- **Git option skipping** before the subcommand: `-C <p>`, `-c <k=v>`, `--git-dir[=]`, `--work-tree[=]`, `--namespace[=]`, `--no-pager`, `-P`, `--exec-path[=]`, `--bare`.
- **Decision table** (subcommand after skipping; `merge-base` ≠ `merge`):

| Class | Matches | Worker-slot session | Main-checkout session |
|---|---|---|---|
| **Destructive** | `push` with `-f`/`--force`/`--force-with-lease`/`--mirror`/`--delete`/`-d`, a `+`-prefixed refspec, or a `:ref` refspec · `reset --hard` · `clean` with any `f` flag (`-f -fd -xdf --force`) · `branch -d/-D/--delete` · `update-ref -d` · `checkout`/`switch` (incl. `-f`, `-B`, `-C`, `--force`) whose target is `main` or `origin/main` · `worktree remove --force` | **deny** | **deny** |
| **Integration** | `push` (non-destructive) · `merge` · `rebase` | **deny** | **ask** |
| **Commit** | `commit` | **ask** | **ask** |
| **Netlify write** | `netlify deploy`, `env:set/unset/clone/import`, `sites:create/delete`, `api`, `link`, `unlink` | **deny** | **ask** |
| **Interpreter spawn** | `node -e/--eval/-p`, `python/python3/py -c`, `perl -e`, `ruby -e`, `deno eval` whose code references process spawning (`child_process`, `spawn`, `exec`, `execSync`, `execFile`, `subprocess`, `os.system`, `Popen`, `system(`, backticks) **and** a `git` or `netlify` token | **deny** | **deny** |
| **Protected-file write** | redirection `>`/`>>`, `tee`, `sed -i`, `cp`/`mv`/`Copy-Item`/`Move-Item` into, `Set-Content`/`Add-Content`/`Out-File`/`New-Item`, or interpreter code writing (`writeFile*`, `appendFile*`, `rename`, `copyFile`, `unlink`, `open(…,'w'/'a')`, `write_text`) targeting `.claude/settings*.json`, `.claude/hooks/**`, `.claude/rules/**`, `CLAUDE.md`, `AGENTS.md`, `.gitignore`, `qa/run-offline.js`, `work/*/brief.md`, `netlify.toml`, `package.json`, `package-lock.json` | **deny** | **ask** |
| everything else | e.g. `git status/log/diff/show/rev-parse/merge-base/worktree list`, `npm run qa:offline`, `node qa/*_offline.js` | allow (defer) | allow (defer) |

- **Worker-slot session** = hook `cwd` normalised to the path of `pt-wt-worker-a` or `pt-wt-worker-b`,
  or a directory under it (R1). **Only arguments in program/subcommand position are classified**: a
  commit message or `echo` text containing the words "git push" is not a git push.

## 5 · Exact rule changes

**`.claude/settings.json`: Owner-applied, additive except for one move.**

- `hooks.PreToolUse`: add `[{ "matcher": "Bash|PowerShell", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/pretooluse-guard.js\"", "timeout": 10 }] }]`.
- `permissions.deny`: **add**
  - `Edit(./.claude/hooks/**)`, `Write(./.claude/hooks/**)` (R3)
  - `Bash(git push --force-with-lease*)`, `Bash(git push * --force*)`, `Bash(git push * -f*)`,
    `Bash(git push * --delete*)`, `Bash(git -C * push --force*)`, `Bash(git -C * push -f*)`,
    `Bash(git -C * reset --hard*)`, `Bash(git -C * clean -f*)`, `Bash(git -C * branch -D*)`,
    `Bash(git branch -d *)`, `Bash(git branch --delete *)`
  - **moved from ask:** `Bash(git checkout main)`, `Bash(git checkout main *)`, `Bash(git switch main)`,
    `Bash(git switch main *)`
  - `Bash(git -C * checkout main*)`, `Bash(git -C * switch main*)`
  - (R4) `Bash(bash -c *)`, `Bash(sh -c *)`, `Bash(cmd /c *)`, `Bash(cmd.exe /c *)`, `Bash(powershell *)`,
    `Bash(pwsh *)`, `Bash(eval *)`
  - (R2) `PowerShell(git *)`, `PowerShell(git.exe *)`, `PowerShell(*\\git.exe *)`, `PowerShell(& git *)`,
    `PowerShell(netlify *)`, `PowerShell(npx netlify *)`, `PowerShell(bash *)`, `PowerShell(sh *)`,
    `PowerShell(wsl *)`, `PowerShell(cmd *)`, `PowerShell(cmd.exe *)`, `PowerShell(powershell *)`,
    `PowerShell(pwsh *)`, `PowerShell(Start-Process *)`, `PowerShell(Invoke-Expression *)`,
    `PowerShell(iex *)`
- `permissions.ask`: **add**
  - `Bash(git -C * commit*)`, `Bash(git -c * commit*)`, `Bash(git -C * merge*)`, `Bash(git -C * push*)`,
    `Bash(git rebase*)`, `Bash(git -C * rebase*)`
  - `Edit(./package.json)`, `Write(./package.json)`, `Edit(./package-lock.json)`, `Write(./package-lock.json)`
  - `Bash(npm install*)`, `Bash(npm i *)`, `Bash(npm uninstall*)`, `Bash(npm update*)`
- `permissions.allow`: **unchanged** (it keeps the narrow `npm run test:*`, `npm run qa:offline`,
  `node qa/*_offline.js`, the read-only git set and the read-only Netlify set).
- `defaultMode`: **unchanged** (`acceptEdits`). No `auto` and no `bypassPermissions` anywhere.

**`.claude/settings.local.json`: Owner-local, in the main checkout and in each slot where present.**
Remove only `Bash(npm run *)`, `Bash(node -e ' *)` and `Bash(python3 -c ' *)`. Everything else stays.

## 6 · QA — `qa/auto_mode_hardening_offline.js`

Table-driven, against the real `decide()` and the real CLI (spawned with `process.execPath`, no
network). Every class has a planted negative.

| ID | Checks |
|---|---|
| **AH-1 allowed** | `npm run qa:offline`, `npm run test:x`, `node qa/x_offline.js`, `codex review --uncommitted`, `git status --short --branch`, `git log --oneline -3`, `git diff --stat`, `git merge-base --is-ancestor a b`, `git worktree list`, `git commit -m "doc: explain git push"` (→ **ask**, never deny), `echo "git push"` → allow |
| **AH-2 denied (Bash)** | every destructive form in §4, incl. `git -C x push -f`, `git -c k=v push --force-with-lease`, `git push origin +main`, `git push origin :branch-dev`, `git clean -xdf`, `git branch -d t`, `git checkout -B main`, `git switch main`, `/usr/bin/git push --force` |
| **AH-3 wrappers** | `bash -c "git push"`, `sh -c 'git merge x'`, `cmd /c git push`, `cmd.exe /c "git reset --hard"`, `powershell -Command "git push"`, `pwsh -EncodedCommand <b64 of git push>`, `eval "git push"`, `env A=1 git push`, `a && git push` → the inner op's class (deny in slot) |
| **AH-4 interpreter** | `node -e "require('child_process').execSync('git push')"`, `python3 -c "import subprocess;subprocess.run(['git','push'])"` → deny; `node -e "console.log(1)"` → allow |
| **AH-5 protected writes** | `echo x > package.json`, `sed -i s/a/b/ AGENTS.md`, `node -e "require('fs').writeFileSync('.claude/settings.json','{}')"`, PowerShell `Set-Content CLAUDE.md x` → deny in slot / ask in main checkout; writes to other paths → allow |
| **AH-6 PowerShell path** | the AH-2…AH-5 set with `tool_name:'PowerShell'` gives the same decisions; `git status` via PowerShell → the rules deny it (AH-8) |
| **AH-7 cwd (R1)** | integration class: slot cwd → deny, main-checkout cwd → ask; destructive: deny in both |
| **AH-8 settings static** | `settings.json` contains exactly the §5 additions and the moved rules; hook wired with matcher `Bash|PowerShell`; no `npm run *`, `node -e`, `python3 -c` broad allow; `defaultMode` = `acceptEdits`; no `bypassPermissions`/`auto` |
| **AH-9 fail-closed CLI** | malformed stdin → exit 2; missing `command` → exit 2; thrown error (planted) → exit 2; `ask` → exit 0 + valid JSON; `allow` → exit 0, empty stdout |
| **AH-10 no regression** | every existing `permissions.allow` Bash pattern (instantiated with a sample) → `allow` |

Then: full `npm run qa:offline` → **50**, green.

**Owner live check after LAND (daytime, not offline QA).** In a Worker-slot session:
- `git push --dry-run` is blocked by the hook;
- PowerShell `git status` is denied;
- `npm run qa:offline` still runs without a prompt.

In the main checkout, `git push --dry-run` prompts.

**Fail-closed limit:** if `node` itself cannot start, the hook command exits with a non-2 code, which
is fail-open. This is **not** left as an assumption; the activation gate (§6a) must prove it cannot
happen on this machine.

## 6a · Activation gate — Node / hook precheck (Owner amendment, 2026-09-26)

**Verification only; no scope change.** The hardened settings are **not considered active** until
every step passes. It runs **after** the Owner applies §5 and **before** LAND is requested. The
results are recorded verbatim in `review.md`.

| Step | Check | Pass condition |
|---|---|---|
| **G1** | Resolve the exact Node executable the hook command will use: `where node` from the Worker slot's shell, plus `node --version`. The resolved path is recorded | resolves to one executable, and the version prints |
| **G2** | Run the hook directly with that executable: `echo <json> \| node .claude/hooks/pretooluse-guard.js`, once each for an **allowed** command (`git status --short --branch`), an **ASK** command (`git commit -m x`, main-checkout cwd) and a **DENY** command (`git push --force`) | allowed → exit 0, empty stdout · ASK → exit 0 + valid `permissionDecision: "ask"` JSON · DENY → **exit 2** + reason on stderr |
| **G3** | Confirm the DENY exit code equals Claude Code's documented blocking code (**2**) | the observed exit code is exactly 2 |
| **G4** | One harmless **live** Claude Code check after §5 is applied (new session, so the settings reload): in a Worker-slot session run `git push --dry-run` | Claude Code shows the call **blocked by the PreToolUse hook**, and nothing is executed |
| **G5** | If Node cannot execute, or G2–G4 do not show the expected behaviour | **HARDENING = HOLD**: Auto mode must **not** be adopted broadly, and `review.md` records which step failed |

G1–G3 are run by the Worker (offline, no network). G4 is a live session step, run by the Owner or on
the Owner's instruction, and is **harmless by construction** because the denied call never runs.

## 7 · Out of scope

AGENTS.md (the tier table becomes stale for `.claude/hooks/**` and `package*.json`; alignment is a
**follow-up**) · CLAUDE.md · enabling Auto · `defaultMode` · commit/LAND/push governance ·
`branch-dev`/`main` · product code · scoring/schema/runtime · deploy · GitHub/Netlify settings ·
`qa/run-offline.js`.

## 8 · STOP conditions

1. Any file beyond §3.
2. The Worker would need to edit `.claude/settings*.json` itself. That is Owner-applied (R5).
3. A §1 fact is contradicted by the installed version (M6 → record → STOP if §4/§5 cannot be met).
4. A hook edit is needed after the Owner has applied §5.
5. Any existing allowed QA/test command becomes blocked.
6. Any change to `defaultMode`, AGENTS.md or commit/LAND/push governance.

## 9 · Definition of done

- `decide()` and the CLI pass AH-1…AH-10 with controls.
- `settings.json` matches §5 exactly (AH-8).
- `qa:offline` is green at 50.
- The independent Codex read-only review (Worker-launched) is done, and its findings resolved.
- `review.md` records the §6 live-check steps, the **§6a activation-gate results (G1–G5)**, the
  Owner's local-file cleanup confirmation, `## Lessons`, the files-changed block and the final-check
  line.
- Activation gate: **G1–G4 pass**. Any failure makes this **HARDENING = HOLD**, and Auto mode is not
  adopted broadly.
- **STOP before commit.**
