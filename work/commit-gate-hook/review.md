# Review: Commit governance — slot-scoped commit gate (hook r9)

Evidence only; authorizes nothing. Brief: `work/commit-gate-hook/brief.md` (approved commit `8b0d1d1`). Diff base `575fca4`.
Mode: Manual. Worker slot: `pt-wt-worker-a`, branch `task/commit-gate-hook`.

## Result
- `git commit` is a deterministic hook gate (Model D, RC1): allowed only on the slot's OWN `task/*` branch, in plain form,
  with a clean staged set, and only when the commit runs in the repository that contains the session cwd (no nested
  worktree/repo can borrow the slot's branch/index). Everything else is denied with R3c ("commit from a normal terminal").
- RC2: non-slot / main-checkout commits are DENIED (was ask). RC3: `--amend` denied in slots. RC4: ref moves of
  `main`/`branch-dev` (`update-ref` non-delete incl. `--stdin`, `branch -f/-m/-M/-c/-C`, `symbolic-ref` write form) are
  denied in every session. RC5 (Owner-applied): `settings.json` moved plain `Bash(git commit)` / `Bash(git commit *)`
  from `ask` to `allow`; the hook is the sole gate.
- R1/R2/R2b/R3g/R3m/r5/r6/r7/r8 unchanged (differential).

## Provenance of the brief's referenced matrix / R3c / L1-L7
The approved `brief.md` (commit `8b0d1d1`) references "the matrix above", R3c and L1-L7 but its own text contains none of
them. They exist in the Cowork session that drafted the brief (`local_bd45572a`, plan text extracted verbatim to
scratchpad `cowork_plan.md`). Owner-ruled 2026-09-27:
1. APPROVED: use the Cowork-derived matrix.
2. APPROVED R3c wording (verbatim, used in the hook): `git commit - <cause> - commit from a normal terminal (R3c)`.
3. L1-L7 remain Owner post-LAND live checks (not run by the Worker; not asserted in this review).
4. APPROVED: keep the repository-identity defence for nested repositories/worktrees (Worker addition beyond the literal
   brief text, closing a local-landing route the matrix didn't anticipate).
5. REJECTED the Worker's added long-form flags (`--signoff`, `--quiet`, `--verbose`); allowlist kept exactly as the
   matrix's short forms (`-s`, `-q`, `-v`, `--no-edit`, `--allow-empty`, `--dry-run`).
6. Protected staged-path matching kept root-relative (`^...`), not broadened to nested-path equivalents.
7. RC5 approved unchanged; applied by the Owner after the r9 copy, in a separate step.

## Hook r9 (Owner-copied, hash-checked, three rounds)
| Round | SHA256 | Change | Owner action |
|---|---|---|---|
| 1 | `4446e069c89a7437560c659c8cc9867c97bb677c17830e5eb6eea1a470fc385a` | initial candidate (matrix + RC1-RC4 + repo-identity defence) | not copied — superseded before copy |
| 2 | `a2ca84ce654e8edcb7ecc1a8c915de14d8a2c4d062a8f96dccb29163183e6d04` | rulings 5 (drop long-form flags) and 6 (root-relative staged paths) applied | copied + hash-verified; RC5 applied + hash-verified (`bd0165797cd0ebbc0d465603206c01e071be85200eedba07d74f99a8b0ac82f1`) |
| 3 (final) | `5ecf2240f49877a1f24b4fa25406ec6f411526d6c847415c7798cace6532a312` | Codex implementation-review FIX: deny when the session sets `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE`/`GIT_COMMON_DIR`/`GIT_OBJECT_DIRECTORY`/`GIT_ALTERNATE_OBJECT_DIRECTORIES` (+3/-0, one hunk vs round 2) | copied + hash-verified (live now) |

`git diff 575fca4 -- .claude/hooks/`: 14 hunks, +218/-13 vs r8 (final state). Base r8 bytes preserved at
`scratchpad/candidate/pretooluse-guard.js` (`5195978a…`) for differential comparisons.

## QA
- Pre-edit baseline: `npm run qa:offline` PASS, 50 suites, hook = r8 (first line of `qa.log`).
- Tests first: new suite vs r8 failed 711 of 3176 assertions (every AH-16/RC4/RC5 row, by design).
- Round 2 candidate: suite PASS 3270 (with `AH_HOOK_PATH`/`AH_SETTINGS_PATH`); full `qa:offline` PASS 50 with the same overrides.
- Round 3 (final) candidate: suite PASS 3283 (11 new env-override rows + 2 mutants); full `qa:offline` PASS 50.
- **Post-copy, live, un-overridden:** targeted suite PASS 3283; full `qa:offline` PASS 50 (after the M4 fix below).
- **Differential r8↔r9 (fixed deps: HEAD `task/x`, staged `[]`):** 13607 unique rows; 11713 identical (decision+reason);
  1894 changed — 132 commit ask→allow (slot), 1082 commit ask→deny (R3c), 652 RC4 allow→deny, 28 deny→deny compounds
  whose reason moved from the r8 finding (push/merge/rebase/pull) to the r9 commit finding at equal severity, decision
  unchanged. **0 violations, 0 PowerShell rows changed.** A scoped differential of round-2-installed vs round-3 (the
  env-override fix) showed **0 changed rows** — the fix is inert unless one of the six variables is actually set.
- **G1-G3** (`scratchpad/g123_r9.js`, real spawns against the live hook): G1 `C:\Program Files\nodejs\node.exe` v24.14.0;
  G2 allow (`git status --short --branch`, slot) → exit 0 empty; ask (`echo x > package.json`, main — re-pointed since
  commit no longer asks) → exit 0 + `permissionDecision:"ask"`; deny (`git push --force`) → exit 2. G3: main
  `git merge --ff-only x` (original incident) and `git pull` → R3m; `git merge-base a b` → allow; main
  `git commit --dry-run --allow-empty -m probe` → R3c; `git update-ref refs/heads/branch-dev HEAD` → RC4; slot
  `git commit --amend` → RC3; malformed stdin → exit 2; a real temp-repo slot-cwd `git commit -m x` on its task branch
  with a clean staged set → exit 0, **and the decision created no commit** (verified by comparing `git log` before/after).
  **PASS.**

### M4 — diagnosed mid-task (not a STOP)
One full `npm run qa:offline` run (post-final-copy) showed 1 hard failure: `AH-16 real: after undoing CHECKPOINT.md
(modified) -> allow again`, dropping the run to 49/50 suites. The targeted suite passed standalone (3283/3283) both
immediately before and after that run. Diagnosis: several of the new AH-16 real-git checks called `realDecide()` **twice**
per assertion (once building the message string, once for the boolean) — each call spawns a real `git` subprocess; under
the load of 49 concurrent suites this occasionally raced. This is QA-harness fragility introduced by this task, not a
hook logic defect (the hook itself was never re-copied or changed for this). **FIX**: single-called the four affected
sites in `qa/auto_mode_hardening_offline.js` and reused the stored result. Re-verified: standalone suite PASS 3283; full
`qa:offline` PASS on 4 consecutive re-runs, 50 suites each.

## Suite changes (`qa/auto_mode_hardening_offline.js`)
- **AH-16**: allow row (every slot-cwd form × the approved short-flag allowlist); branch rows (`task/*` only, incl.
  detached/garbage/odd-typed HEAD); plain-form rows (flags outside the allowlist, git globals, env prefixes, wrappers,
  compounds, groups, a second git in the same call); RC3 `--amend`; staged rows (the five root-relative protected
  patterns, `--no-renames` rename-away, clean/other paths); fail-closed rows (reader throws, odd return shapes);
  repository-identity rows (nested worktree/repo inside the slot, mismatched root, resolver throws); the GIT_*
  environment-override rows (Codex FIX); RC2 (every non-slot cwd, no reader consulted); PowerShell-unchanged; RC4 rows
  and controls; CLI rows (in-process injected deps + real spawns, incl. missing-cwd combinations); a real-git temp-repo
  block (worktree slot with a `.git` file, standalone slot with a `.git` directory, nested worktree/repo, detached HEAD,
  non-task branch, corrupted/missing/misdirected `.git`, a real CLI allow/deny pair, and a read-only-decision proof).
- **Mutants**: six kinds — RC2 non-slot allowed, branch check, staged-set check, plain-form/flag allowlist, fail-open on
  a read error, RC4 ref moves — plus the repository-identity defence and the GIT_* environment-override check (Codex
  FIX), each with instances (~48 total). Four turned out equivalent to a second defence in the same gate (RC2 non-slot,
  missing cwd, slot-root-unresolved, `--amend`) and were re-expressed as multi-edit mutants that disable both defences
  at once, restoring a true kill.
- **AH-8 / RC5**: `EXPECT_ASK` / `EXPECT_ALLOW` literals updated to base − 4 commit-ask entries + 2 commit-allow entries;
  a control asserting the pre-RC5 shape is rejected; `AH-10`'s Bash-allow instantiation excludes the two gated commit
  rules (they are conditionally allowed by the hook, not unconditionally).
- **Existing rows converted (commit was the "ask" carrier for many classes)**: AH-1, AH-6 R2/AH-6b, AH-9, AH-11 control,
  AH-12 (`COMMIT_HEREDOCS` + the R1/R3g-preserved check), AH-13, AH-14 (`CASE_CMD_PAIRS` — a case-wrapped commit is now a
  non-plain form and dropped from that table; the case-text-is-data rows), AH-15 controls and the CLI control. Each was
  re-pointed to assert the r9 gate outcome (slot allow / main deny-with-R3c) instead of the old universal ask, or
  re-pointed to a class that still asks in main (`echo x > package.json`) where the row's purpose was "prove ask exists".
  Full before/after is in the diff; nothing here reads as "Pending".
- Deterministic `TEST_DEPS` (HEAD `task/x`, staged `[]`, `repoRoot` = the slot itself) wired into `dec()`/`d()`/`runCli`'s
  shim so every existing table row is judged the same way regardless of the real filesystem/git state.

## Codex (independent, read-only, `codex exec --sandbox read-only`, raw in `codex.md`)
| Pass | Finding | Class | Disposition |
|---|---|---|---|
| Implementation diff (round 2 candidate + settings + suite, base `575fca4`) | "Inherited Git environment (`GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE`) can make the gate inspect a different repository/index than the commit uses" | I | **FIX** — added the GIT_*-override deny (round 3, sha `5ecf2240…`), 11 QA rows + 2 mutants, re-ran the differential (0 unexpected changes) and full `qa:offline` (PASS 50). No bypass found in the command-form parser (global options, wrappers, extra top-level segments, non-allowlisted flags) — Codex's own words: "I found no bypass in those parser paths." |

## DEFER / accepted gaps (not fixable under "no other hook change" / brief scope)
- A `pre-commit` hook or `core.hooksPath` could re-stage files after the gate's read (git re-reads the index in
  `pre-commit`, and `.git/hooks/**` is not a protected path). Belongs to a follow-up hardening task.
- RC4's enumerated list doesn't cover `git fetch . x:main`, `checkout -B`/`switch -C` onto `main`/`branch-dev`, or
  `reset --soft`/`--mixed` inside a `branch-dev` worktree. Differential confirms these are unchanged (still allow).
- The pre-existing `runCli` missing-cwd fallback to `CLAUDE_PROJECT_DIR` is unchanged; AH-16's CLI rows cover it for the
  commit gate specifically (deny in every combination tested).
- Non-`!` git aliases still bypass the classifier (pre-existing, r7 behaviour); the differential shows `git -c
  alias.c=commit c` unchanged (still allow, as any unresolved alias body is in r7/r8).
- The nested-worktree/repo real-git rows prove the fix inside `os.tmpdir()`; a live nested-worktree probe under the
  real Worker slot is an Owner L-series item, not run here.

## Files changed
- Implementation (3): .claude/hooks/pretooluse-guard.js, .claude/settings.json, qa/auto_mode_hardening_offline.js
- Evidence (tracked): work/commit-gate-hook/brief.md, work/commit-gate-hook/review.md

## Lessons

- [rule]     A real-git QA check must compute its decision/result ONCE per assertion and reuse the stored value for both
             the failure message and the boolean — two live calls to the same real subprocess-backed function is a
             latent flake under load, not a logic bug, and it surfaced only in the full aggregate run, not standalone.
             Destination-ready text for AGENTS.md / `.claude/rules/qa-suites.md`: "A QA check whose assertion calls a
             function with real side effects (spawns a process, touches the filesystem) computes the result once into a
             variable and reuses it for the message and the condition — never two live calls in one check."
- [backlog]  RC4's ref-move list is not exhaustive (fetch-into-branch-dev, checkout -B/switch -C onto a protected
             branch, reset --soft/--mixed inside a branch-dev worktree) — belongs in a future hook-hardening task.
- [local]    The approved brief referenced a "matrix above" that was not in its own committed text; the source (a
             Cowork session) had to be located and the Owner asked to ratify it before implementation could proceed.
- [covered]  Hook candidates are built by scripted byte replacement and hash-checked before every Owner copy, including
             mid-task revisions for Owner rulings and a Codex FIX — already covered by brief R3 / this brief's Order line.

Final check: 1 round, 1 class-II finding fixed (diff-stat corrected: +218/-13, not +215/-13), self-checked; no implementation change, no QA re-run.
