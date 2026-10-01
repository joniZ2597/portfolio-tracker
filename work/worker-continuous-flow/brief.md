# Task brief: Worker continuous flow — safe-command allowlist, `git --output` guard, post-LAND slot cleanup

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Baseline | dd389bae820d7701891aeeff4f3294efd1c3e434 = branch-dev = origin/branch-dev (R12 `193c7df`, DH-M4b `e27ce1c`, Entry 11 `5a32c4d`, DH-M4c `dd389ba` landed and pushed); main = origin/main = fbec2c193346d7afd1dab6fd11a46b5efe55238b; the task branch starts at this brief's commit |
| Branch / slot | `task/worker-continuous-flow`, in **Worker B** (`pt-wt-worker-b`). Bootstrap switches the slot from its landed and pushed `task/dh-fx-limitation-wording` to the new task branch at this brief's commit, only while the slot is clean. **Worker A's slot is deliberately left untouched** on the landed and pushed `task/selected-only-watchlist`, so it can be the first real `cleanup` (L-A4) |
| Mode | **Manual** (DENY-tier settings, hook and `pt-land.js`; ASK-tier AGENTS.md) |
| qa:offline | the baseline count measured at Step 0 → unchanged (existing suites are extended; no suite is added) |
| Parallel with | none. This is the final infrastructure alignment; P1 and P2 start after it lands and the reduced-prompt flow is verified |
| Status | CODE-READY on Owner approval, incl. rulings AL-1…AL-6 |

Objective. Let attended Workers run with far fewer permission prompts:
- read-only inspection, offline QA and Codex review are auto-approved;
- closed tasks clean up their own slot deterministically.

Every approval the Owner has kept stays exactly where it is: commits outside the r9 gate, LAND, push,
rebase/merge, `main` and protected refs, destructive commands, scope and architecture changes. The hook
remains the only enforced boundary. Allowlist entries only remove prompts for commands the hook already
permits.

## 1. Rulings (approved with this brief)

- **AL-1 — allowlist = exactly §3.** `defaultMode` stays `default` (Manual). Attended Auto and
  `acceptEdits` stay as AGENTS.md defines them. Unattended Auto stays prohibited.
- **AL-2 — `sed` is not allowlisted.** GNU `sed -n` can execute shell commands (`e`) and write files
  (`w`/`W`) from its script. A prefix rule cannot exclude those forms, and the hook does not parse sed
  scripts. Line-range reads use the Read tool (offset/limit), `head` / `tail`, or `grep -n`. `sed` keeps
  prompting.
- **AL-3 — `git diff` / `show` / `log` / `format-patch` with `--output` are hook-denied** (R13, §4).
  `--output` makes git write an arbitrary file, including inside `.git/`, outside every R10 writer rule.
  Allowlisting `git diff *` / `git show *` / `git log *` is safe only with this guard.
- **AL-4 — post-LAND cleanup is a fifth `pt-land.js` verb, `cleanup task/<id>`, with no approval
  record.** It is mechanical and refuses unless the task is LANDed **and** pushed. It deletes the local
  branch only with safe `git branch -d`, never `-D`. It is allowlisted.
- **AL-5 — the archive location for a closed task's ignored evidence** (`work/<id>/plan.md`, `codex.md`,
  `qa.log`, and any other ignored file under `work/<id>/`) is
  `<parent of canonical>/pt-work-artifacts/<id>/<UTC yyyymmddThhmmssZ>/`, outside the repo. The directory
  already exists.
- **AL-6 — scratch files:**
  - **Bash** scratch lives under `/tmp/pt-<task-id>/` (Git Bash `/tmp`).
  - The **file-tool** scratch rule (§3, last row) is included **only if** live probe L-A3 shows it
    matches. Otherwise the Owner removes that one entry before applying settings, and file-tool scratch
    writes keep prompting.

## 2. Verified facts (at `dd389ba`; the infrastructure files are byte-identical to `02788b5`, where they were first inspected)

- **Hook (current):** decisions for a slot cwd with clean gate deps. "allow" means the hook has no
  opinion.
  - **allow:** `grep -n …`, `cat`, `head`, `tail`, `wc`, `git status|log|diff|show|rev-parse|ls-files`,
    `git diff --output=/tmp/x` (**the gap AL-3 closes**), `codex exec --sandbox read-only "…"`,
    `node qa/guard_integrity_check.js …`, `mkdir -p /tmp/pt-x`, `npm run qa:offline`,
    `node .claude/hooks/pt-land.js land-request task/x`.
  - **deny:** `git switch --detach branch-dev` (R10-4), `git branch -d task/x` (branch delete),
    `node .claude/hooks/pt-land.js cleanup task/x` (R12 form).
  - Cleanup therefore **must** be a protected tool verb. It cannot be a Worker command sequence.
- **Settings `permissions.allow` (current, 24 entries):** QA (`npm run test:*`, `npm run qa:offline`,
  `node qa/*_offline.js`), `codex review --uncommitted`, seven fixed git status forms, `git commit` /
  `git commit *` (RC5), Netlify read-only commands and MCP readers. `defaultMode: "default"`.
  `qa/auto_mode_hardening_offline.js` AH-8 pins this set exactly (`EXPECT_ALLOW`).
- **`pt-land.js`** (R12, `193c7df`) has four verbs. It provides `resolveCaller`, `selfIntegrity`,
  `worktreeList`, `canonicalClean`, `acquireLock`, `appendAudit`, `stripGitEnv` and `emptyHooksDir`;
  cleanup reuses them. The R12 hook regex `R12_FORM_RE` admits only the four verbs.
- **Cleanup candidates exist now.**
  - Worker A's slot has `task/selected-only-watchlist` at `dfde9fb`; Worker B's slot has
    `task/dh-fx-limitation-wording` at `dd389ba`.
  - Both tips are ancestors of `origin/branch-dev` = `dd389ba`, so both are landed **and** pushed.
  - Worker A's stays in place for L-A4.

## 3. Settings change (Owner-applied via copy/hash; only these additions to `permissions.allow`)

```
"Bash(grep *)",
"Bash(cat *)",
"Bash(head *)",
"Bash(tail *)",
"Bash(wc *)",
"Bash(git status)",
"Bash(git status *)",
"Bash(git log)",
"Bash(git log *)",
"Bash(git diff)",
"Bash(git diff *)",
"Bash(git show *)",
"Bash(git rev-parse *)",
"Bash(git ls-files)",
"Bash(git ls-files *)",
"Bash(node qa/*_test.js)",
"Bash(node qa/guard_integrity_check.js *)",
"Bash(codex exec --sandbox read-only *)",
"Bash(mkdir -p /tmp/pt-*)",
"Bash(node .claude/hooks/pt-land.js land-request *)",
"Bash(node .claude/hooks/pt-land.js push-request)",
"Bash(node .claude/hooks/pt-land.js cleanup *)",
"Edit(//tmp/pt-*/**)"
```

- **Not changed:**
  - every `deny` / `ask` entry, `defaultMode`, the hook block and the matcher;
  - the existing allow entries;
  - `land` / `push` verbs are **not** allowlisted. They keep prompting, on top of their single-use
    records.
- `deny` / `ask` still take precedence over these entries, and the hook (exit 2) is unaffected by
  settings.

## 4. Hook change R13 (`.claude/hooks/pretooluse-guard.js`)

- In `classifyGit`, for subcommands `diff`, `show`, `log`, `format-patch`, `whatchanged`: an argument
  equal to `--output`, starting with `--output=`, or (for `format-patch`) `-o` / `--output-directory*`
  → finding `cls: 'destructive'`, reason `git <sub> --output writes files - denied in every session
  (R13)`.
- Extend `R12_FORM_RE` with exactly one more alternative, `cleanup task/<id>`, using the same task-name
  pattern:

  ```
  /^node \.claude\/hooks\/pt-land\.js (?:(?:land-request|land|cleanup) task\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*|push-request|push)$/
  ```

- Nothing else changes: R3g, R3m, RC2, RC4, r9, R10-1…R10-8, R11, R12 cwd and env checks, and the
  file-tool guard.

## 5. `pt-land.js` — new verb `cleanup task/<id>` (all checks fail closed; any refusal → exit 1, no change)

| # | Step |
|---|---|
| K1 | Caller context as L1. The task worktree is the slot whose HEAD is `refs/heads/task/<id>`. If no worktree has it checked out, slot steps K4/K6 are skipped (branch-only cleanup) |
| K2 | Self-integrity as L2 (the running file equals the `branch-dev` blob) |
| K3 | **Landed and pushed:** the tip of `refs/heads/task/<id>` is an ancestor of `refs/heads/branch-dev` **and** of `refs/remotes/origin/branch-dev`. Otherwise refuse ("not landed / not pushed") |
| K4 | The task worktree's `git status --porcelain=v2 --untracked-files=all` is **empty** (ignored files are allowed). Otherwise refuse ("slot not clean") |
| K5 | Take the lock (`pt-land.lock`) |
| K6 | **Archive:**<br>- list ignored files under `<slot>/work/<id>/` (`git ls-files --others --ignored --exclude-standard -- work/<id>/`);<br>- copy each to `<parent-of-canonical>/pt-work-artifacts/<id>/<UTC stamp>/<relative path>` (create dirs; never overwrite);<br>- verify each copy's sha256, then delete the originals.<br>Any failure → refuse with nothing deleted |
| K7 | `git -C <slot> -c core.hooksPath=<empty> switch --detach <branch-dev OID>` (by OID, so R10-4 is not involved), with GIT_* stripped |
| K8 | `git -C <canonical> -c core.hooksPath=<empty> branch -d task/<id>` (safe delete only; `-D` never appears in the code) |
| K9 | **Verify:** the slot HEAD is detached and equals the `branch-dev` OID; the slot status is empty; `refs/heads/task/<id>` is absent. Release the lock, append the audit line `{verb:'cleanup', task, from: tip, to: null, result}`, and print `CLEANED task/<id>; slot detached at <oid>; evidence archived to <dir>` |

- Cleanup never touches `branch-dev`, `main`, remotes, tags, records or other worktrees.
- Unit-test it through the module API `runCleanup(opts)` with injectable `archiveRoot` (a function
  parameter only, never an environment variable).

## 6. AGENTS.md (exact edits; anchors match once with line breaks as spaces; CRLF preserved)

- **AW-1.** In step 15, replace the final sentence
  > Then **STOP** with the final completion report.

  with:
  > Then run step 16.

- **AW-2.** Insert after step 15:
  > 16. **Cleanup.** After a verified push, run `node .claude/hooks/pt-land.js cleanup task/<id>` — it archives the task's ignored evidence (`plan.md`, `codex.md`, `qa.log`) to `pt-work-artifacts/<id>/`, detaches the slot at `branch-dev` and safely deletes the local task branch. A refusal is reported, not retried. Then **STOP** with the final completion report.

- **AW-3.** Insert as a new paragraph immediately before the heading
  `### Protection tiers — the enforced layer`:
  > **Auto-approved commands (settings allowlist).** Read-only inspection (`grep`, `cat`, `head`, `tail`, `wc`, and `git status|log|diff|show|rev-parse|ls-files`), offline QA (`npm run qa:offline`, `npm run test:*`, `node qa/*_offline.js`, `node qa/*_test.js`, `node qa/guard_integrity_check.js …`), Codex read-only review (`codex exec --sandbox read-only …`), scratch under `/tmp/pt-<task-id>/`, and the `pt-land.js` request and cleanup verbs run without a prompt. Everything else prompts in Manual. The hook remains the only enforced boundary. `sed` is deliberately not auto-approved; use the Read tool for line ranges.

## 7. Implementation file set — exactly 7

```
.claude/settings.json                  §3 additions only (Owner-applied, copy/hash)
.claude/hooks/pretooluse-guard.js      R13 (§4) only (Owner-applied, copy/hash)
.claude/hooks/pt-land.js               cleanup verb (§5) only (Owner-applied, copy/hash)
qa/auto_mode_hardening_offline.js      AH-8 EXPECT_ALLOW update + AH-23 rows + mutants
qa/pt_land_offline.js                  PL-22…PL-31 rows + mutants
AGENTS.md                              AW-1…AW-3 only
work/worker-continuous-flow/review.md  NEW
```

- No `CLAUDE.md` change. The routing row already says "LAND and push through the R12 tool". Cleanup is
  covered by AGENTS.md.
- No `land-scope` block: the diff touches protected paths, so the Owner LANDs it.

## 8. QA

**AH-8 (updated):** `EXPECT_ALLOW` = base + RC5 + the §3 entries, exactly. The rows W1–W3 from R11
Amendment 1 stay, and `Edit(//tmp/pt-*/**)` is the only file-tool rule added.

**AH-23 (new), each with a planted negative:**
- The allow list contains none of these:
  - `Bash(git push`, `merge`, `rebase`, `pull`, `reset`, `checkout`, `switch`, `branch`, `update-ref`,
    `symbolic-ref`, `cherry-pick`, `revert`, `am`, `clean`, `stash`, `config`, `remote`, `fetch`,
    `worktree`;
  - `Bash(rm`, `Bash(sed`, `Bash(node -e`, `Bash(bash`, `Bash(sh `, `Bash(npx`, `Bash(npm run *)`,
    `Bash(npm exec`;
  - `pt-land.js land task`, `pt-land.js push)`.
- R13: `git diff --output=x`, `git diff --output x`, `git show --output=.git/hooks/pre-commit`,
  `git log --output=/tmp/x`, `git format-patch -o out`, `git format-patch --output-directory=o` → deny in
  slot, main and missing-cwd.
- R13 controls: `git diff --stat`, `git show HEAD:index.html`, `git log --oneline -5` → allow.
- R12 extended: `node .claude/hooks/pt-land.js cleanup task/x` → allow in slot and canonical; with a
  trailing space, env prefix, no task, or a `bash -c` wrapper → deny.
- **Differential R12→R13 over the full corpus:** decisions change only on rows containing `--output` /
  `-o` for the listed git subcommands, or `pt-land.js cleanup`.

**PL-22…PL-31 (`qa/pt_land_offline.js`, real-git fixture):**

| ID | Case | Expected |
|---|---|---|
| PL-22 | valid cleanup of a landed and pushed task with ignored `plan.md` / `codex.md` / `qa.log` | archive contains all three with matching sha256; originals gone; slot detached at branch-dev OID; local branch deleted; audit line |
| PL-23 | tip not an ancestor of branch-dev (not landed) | refuse; nothing changed |
| PL-24 | landed but not pushed (tracking behind) | refuse |
| PL-25 | slot has a tracked modification / an untracked non-ignored file | refuse ×2; no archive written |
| PL-26 | archive destination already exists or is not writable | refuse; originals intact |
| PL-27 | second cleanup after success | refuse (branch absent) |
| PL-28 | branch checked out nowhere (branch-only cleanup) | branch deleted; no slot step |
| PL-29 | a planted non-sample git hook | not executed during K7/K8 (marker absent) |
| PL-30 | `branch-dev`, `main`, origin refs, tags and the other slot | byte-identical before and after every PL-22…29 case |
| PL-31 | CLI: `cleanup` without a task → exit 3; refusal → 1; success → 0 | asserted |

**Also:**
- Mutants: K3 dropped, K4 dropped, `-d` → `-D`, archive verify skipped, `--output` guard dropped, cleanup
  regex widened. Each must be caught.
- Run `node qa/auto_mode_hardening_offline.js`, `node qa/pt_land_offline.js`, then full `npm run qa:offline`
  at the Step-0 count; G1–G3 on the copied hook.
- **QA lesson:** compute subprocess-backed results once and assert on the stored value.

**Owner live checks** (after applying settings, the hook and the tool; restart sessions):
- **L-A1:** in a Manual slot session, `git status`, `git log --oneline -5`, `grep -n x index.html`,
  `node qa/guard_integrity_check.js …` and `codex exec --sandbox read-only "…"` run **without** a prompt.
- **L-A2:** `git push` and `git merge` are still blocked (R3g / R3m); `git diff --output=.git/x` is
  blocked (R13); `sed -n 1p x` and `rm x` still prompt.
- **L-A3:** a Write-tool call to `/tmp/pt-probe/x.txt` runs without a prompt. **If it prompts, remove
  `Edit(//tmp/pt-*/**)` from the applied settings and record it.**
- **L-A4 (first real cleanup):** in Worker A's slot,
  `node .claude/hooks/pt-land.js cleanup task/selected-only-watchlist` → the archive is created, the slot
  is detached at branch-dev and the branch is deleted.

## 9. Worker flow, STOP, Definition of Done

**Flow:**
1. Step 0 (Worker B slot on `task/worker-continuous-flow`, current-guard check, baseline count).
2. `plan.md`: Gate Verification names R13 and K3.
3. Tests first.
4. **Build the three DENY-tier candidates (settings, hook, tool) in the scratchpad.** Report their sha256s;
   the Owner copies them in after a hash check.
5. AGENTS.md AW-1…AW-3 (Manual).
6. QA, then a Worker-launched Codex read-only review, then `review.md`, then the Codex final check.
7. **STOP before commit.** The commit stages protected paths, so it is made in the Owner's terminal.
   Post-commit integrity is LAND evidence only; the Owner LANDs and pushes.

**STOP:**
- STOP-1..6;
- any allowlist entry beyond §3;
- any change to `deny` / `ask` / `defaultMode` / the matcher;
- `sed` or a mutating git family allowlisted;
- any hook change beyond §4;
- a cleanup path that can use `-D`, touch `branch-dev` / `main` / remotes / tags, run git hooks, or delete
  an evidence file before its archived copy is verified;
- a Worker write to `.claude/**` or `.git/**`;
- a differential change outside AH-23;
- any push, merge, rebase, LAND or deploy by the Worker.

**Definition of Done:**
- §3–§6 are applied exactly; the Owner-applied files have recorded sha256s.
- AH-8, AH-23, PL-22…PL-31 and the mutants PASS; full `qa:offline` PASS at the baseline count; G1–G3 PASS.
- Codex: no unresolved Class I finding.
- STOP before the Owner's commit.
