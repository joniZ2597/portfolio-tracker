# Review — second-finisher-resync: `pt-land.js resync` lets Bootstrap re-sync a task branch onto branch-dev

Brief: `work/second-finisher-resync/brief.md` @ `052e879` (brief-only commit; the task branch starts there). Mode: Manual, Worker A.
Diff base used throughout: `052e879`. `origin/main` = `fbec2c1`. `branch-dev` has moved on since the brief's baseline `ee98b35`
(see "Open item for LAND" below).

## Summary

Adds one tool verb, `node .claude/hooks/pt-land.js resync task/<id>`, that re-syncs a `task/*` branch onto `branch-dev` mechanically:
Mode F (task has no commits of its own: `git reset --keep`, uncommitted work proven byte-identical by hash) and Mode R (task has
commits: replay in a temporary detached worktree, verified commit-for-commit by patch-id, then `reset --keep` in the slot). Any
conflict, overlap or content difference refuses with nothing changed. It never moves `branch-dev`, `main` or `origin/*`, never
pushes, never writes an approval record and never deletes a slot file. The hook gains exactly one `R12_FORM_RE` alternative;
`.claude/settings.json` is unchanged (the verb prompts in Manual). AGENTS.md changes only A1–A3.

## Files changed

- Implementation (5): .claude/hooks/pt-land.js, .claude/hooks/pretooluse-guard.js, AGENTS.md, qa/pt_land_resync_offline.js, qa/auto_mode_hardening_offline.js
- Evidence (tracked): work/second-finisher-resync/brief.md, work/second-finisher-resync/review.md

The three protected files are built as candidates under `<os.tmpdir()>/pt-second-finisher-resync/protected/` (manifest.json +
flat sources) and enter the repository only through step 13a. Candidate sha256 (bytes as stored, CRLF):

| Candidate | Target | sha256 |
|---|---|---|
| `cand_tool.js` | `.claude/hooks/pt-land.js` | `8a340168bbe9e0198d459a816ce09e58c4b4f44f7cac9f9b9f491ade79b4e123` |
| `cand_guard.js` | `.claude/hooks/pretooluse-guard.js` | `3f284eec9ff605ed0151e747a85b5a6ea9b814679e5a5bc334e8a1af8754b4a3` |
| `cand_agents.md` | `AGENTS.md` | `5d0e67ec8af52f56a5b1ab99e26104ce42fa8aa4ffa6b51c8b18de9945259055` |

The hook candidate differs from the repo hook by exactly one line (the new alternative). The AGENTS.md candidate differs from the repo
file by exactly A1, A2 and A3 (a line-by-line `diff` against the repo file shows nothing else). Both keep CRLF.

## Step 0

- Current-guard check: `task/second-finisher-resync` descends from `ee98b35`; `git status --porcelain .claude` empty; brief tracked and
  unmodified at M2; `node_modules/` newer than `package-lock.json`.
- **Baseline `npm run qa:offline`: 53 spawned suites.** The first run (started 23:45 with no other full run active) came back
  **red**: 52 suites PASS and `qa/pt_land_offline.js` failed 7 of 166 rows (PL-35/36/37/38/42, "manifest.json not found" under the
  fixed `<tmp>/pt-oag*/protected` paths). Worker B's own full run started while mine was in that suite and the two runs share those
  fixed temp paths. **M4 (diagnose first):** `qa/pt_land_offline.js` run alone against the unmodified tool passed **166/166**, which
  attributes the red to the overlap. No single clean full run exists before the edits: the suite count the "+1" is measured against is
  **53** (from the overlapped run), and the resync work's own full runs are the clean evidence (54 = 53 + 1). Both runs are in `qa.log`.
- The brief forbids overlapping full runs; this overlap was not avoidable at launch time (Worker B's run started later) and was
  caught at the end, not prevented. No further full run was started while another was active.

## Tests first

`qa/pt_land_resync_offline.js` against the unmodified tool: **FAIL 48/48** (`runResync is not a function`). `qa/auto_mode_hardening_offline.js`
against the unmodified hook: 13 failures, exactly the new AH-25 rows and the two re-pinned anchors.

## Implementation notes (decisions the brief leaves to the Worker)

- **`reset --keep` loses staging.** Git turns a staged change in a non-overlapping file into an unstaged one; the F1/F3 hash
  (`git diff HEAD --binary`) stays equal, so content is byte-identical. The tool reports the paths whose staging was lost
  (`stagedLost`, printed as a note). No extra refusal: the Worker re-stages with explicit `git add` at step 13 anyway.
- **Git refuses every overlap shape itself** (verified in scratch repos: edit, staged edit, untracked collision, edit identical to
  the new content), so F2 relies on git exactly as the brief says; no extra pre-check was added.
- **Already up to date** returns `mode: 'none'`, exit 0, and writes no audit line (nothing happened).
- **Refusals are audited** (`result: 'refuse'`, with the step and reason), like `land` does; successes append the brief's line plus `ts`/`reason`.
- **R2 reading:** a `protected-commit` audit entry counts only when its result is `ok` (a refused or failed entry approved nothing). Protected
  paths use the same lower-cased `PROTECTED_PATH_RES` list `land` uses, checked per commit (a commit that adds and a later one that removes a
  protected file still counts).
- **Merge commit in the task range** is refused early (label R3) rather than being flattened by the replay.
- **Hooks:** the replay uses the brief's literal `git -c core.hooksPath=<empty> …` (R3). Slot-side children (`reset --keep`) use the
  `GIT_CONFIG_*` triple that `protected-commit` already uses, so a git-shim can still see the subcommand.
- **Derived edits in the AH suite:** that suite pinned the real `R12_FORM_RE` line twice (the AH-20 widened-regex mutant anchor and the AH-24
  differential). Both follow the new line; AH-24's own claim ("the OAG alternation changes nothing else") is unchanged.
- **Unchanged on purpose:** `L3`'s refusal text still says "(Owner rebase, R3m)" (the brief does not list it and `qa/pt_land_offline.js`
  must not change).

## QA

- `node qa/pt_land_resync_offline.js` against the tool candidate: **PASS 49/49** (RS-1, RS-1b, RS-2 ×4, RS-3, RS-3b, RS-4, RS-4b, RS-5 ×2,
  RS-6 ×2, RS-7, RS-8, RS-9, RS-10 ×3, RS-11, RS-12, RS-13 ×12, plus 15 planted negatives MUT-RS-1…13 and 6b).
- `node qa/auto_mode_hardening_offline.js` against the hook candidate: **PASS (4145 assertions)**, including AH-25 (allow ×6, deny ×21,
  wrapper/compound/pipe CLI spawns, differential = changes only the three resync allow forms, settings has no resync entry, 2 mutants).
- Full `npm run qa:offline` with both candidates applied through `PT_LAND_TOOL_PATH` / `AH_HOOK_PATH`, run twice (before and after the
  Codex FIX): **PASS, 54 spawned suites** = baseline 53 + 1, 1 advisory warning (same as baseline). This covers `qa/pt_land_offline.js`
  (unchanged, 166 rows) against the new tool. **Required next step, not yet done:** the same full run against the repository files
  themselves after step 13a (the suites that read the real hook and tool are red before the gate applies them, by design).
- M4 note: one `AH-16 real: after undoing .env` failure appeared once in a standalone run of the AH suite against the unmodified hook,
  while two other full runs were active; two immediate re-runs were clean. A one-off load flake in a row that builds its own throwaway
  repos; nothing changed.
- QA suites that read in-scope files as text: `qa/auto_mode_hardening_offline.js` reads the real hook (and `settings.json`) as text (its
  assertions are updated as described above); `qa/pt_land_offline.js` reads the real tool as text for its mutants (CRLF-anchored; the tool
  edit adds lines only and the suite passed unchanged against the candidate); `qa/pt_land_resync_offline.js` reads the tool for its mutants
  (LF-normalised, every anchor counted exactly once).

## Codex review (implementation diff, base `052e879`)

Launched by the Worker: `codex exec --sandbox read-only`, stdin prompt carrying the brief, the three candidate diffs, the tracked AH diff, the
untracked suite verbatim, the manifest and the QA evidence; raw output (including the CLI's echo and Codex's own exploration) in
`work/second-finisher-resync/codex.md`. **Verdict FAIL: one Class I, one Class II.** Verbatim:

> ## Class I
>
> - **`.claude/hooks/pt-land.js:1362–1365` — FIX:** Temporary worktree removal failures are ignored. The caller checks for leftovers only when `outcome.ok` is true; after a replay refusal, failed cleanup is silent. That can leave a registered worktree or temp directory behind while reporting only the original refusal. R6 requires removal and pruning, and RS-4 requires the temp worktree to be gone.
>
> ## Class II
>
> - **`AGENTS.md:556` — FIX:** “the post-rebase integrity result” is stale after the specified flow changes from an Owner rebase to Bootstrap resync. The brief changes the integrity parameters to those printed by `resync`; this sentence should describe the post-resync result.

Codex's checks 2 (safety invariants) and 5 (scope) were PASS; 1, 3 and 4 failed only on the two findings above.

## FIX / DEFER / REJECT ledger

| # | Finding | Class | Resolution |
|---|---|---|---|
| 1 | A failed temp-worktree removal after a replay *refusal* is silent (only checked when the outcome is ok) | I | **FIX** — the leftover check now runs for every outcome: an ok outcome carries `cleanupWarning`, a refusal carries `(WARNING: the temporary worktree … could not be removed)` in its reason. New row RS-4b simulates a failed removal (the removal call dropped in a mutant) and asserts the warning on a refusal, with a control. Tool candidate re-hashed; resync suite 49/49; full `qa:offline` re-run PASS 54. |
| 2 | AGENTS.md still says "the post-rebase integrity result is LAND evidence only" after A1 | II | **DEFER** — correct, but changing it is an AGENTS.md wording change beyond A1–A3, which the brief names as a STOP condition (§7); the Worker does not amend its own scope. Destination-ready text is in Lessons ([rule]); it belongs to the next task that owns AGENTS.md. |

## Fresh-context self-review (step 7)

Re-read the brief and the complete diff against the requirement→test map (`plan.md` Q1–Q22). Checked line by line: S1–S5 order and refusal
labels; F1–F3 hash proof; R1–R6 incl. the order "reset after verification, temp worktree removed last"; the audit shape; the printed
`--base-dev` / `--since`; the `R12_FORM_RE` line; A1–A3 text. What changed as a result: the planted negative for R1 (MUT-RS-4) first
asserted only `ok`, so a mutant that replayed and failed *after* moving the task ref still looked "refused"; the scenario now also asserts
the task ref did not move. Nothing else changed.

## Backlog reconciliation

- **Brief's Backlog row:** `none` — workflow tooling; `BACKLOG.md` is in neither the file set nor any `land-scope`.
- **Action taken:** `none`.
- **Affected entries:** none — no `BACKLOG.md` heading or status text touched.
- **Confirmation:** the implementation changes touch only the five implementation files listed under "Files changed" (not the two evidence
  files) and nothing in `BACKLOG.md`; no BACKLOG entry is closed or changed by this work. The `[backlog]` lessons below are recorded as pending routing, not acted on.

## Open item for LAND (not a defect)

`052e879` (this task's tip) is an ancestor of the current `branch-dev`, which has since advanced. `land-request` will therefore refuse
"branch-dev moved: Second LAND", and the new verb is not available in the current repository until the protected candidates are applied
(step 13a, before LAND) — and `resync` itself is only usable once those are on `branch-dev`. The one re-sync of this task is therefore the
Owner's, in a normal terminal — the gap this task closes for every later task.

## Final check

Final check: 1 round, 5 class-II findings (4 fixed in review.md wording; 1 restates the already-DEFERred finding 2 and needs no change), self-checked; no implementation change, no QA re-run.

Codex's final check (raw output under `## Final check` in `codex.md`): Class I none (the cleanup fix is present and tested by RS-4b; the Backlog
reconciliation is present and matches the brief's `none` effect); Class II five, handled as above; QA counts (53 / 54 / 49 / 4145) agree with `qa.log`.

## Lessons

- [rule]     (Deferred from finding 2; out of this task's scope — `AGENTS.md` is not in the Worker's gift beyond A1–A3.) Destination-ready text for
             "Owner LAND / SHIP boundaries", Second LAND bullet: replace "post-rebase integrity result" with "post-resync integrity result".
- [rule]     Destination-ready text for `AGENTS.md` "Auto-approved commands" (or the hook notes): "The R12 trigger matches the land tool's name
             anywhere in a Bash command's text, including heredoc prose and `grep` arguments. Put instruction text for a review packet in a
             file written with the Write tool, and reach the tool's path through a glob; never put the literal in a shell command." (A sixth
             STOP-6 of this kind across three tasks, this one the Worker's own.)
- [backlog]  `qa/pt_land_offline.js` writes its protected-gate fixtures under fixed `<tmp>/pt-oag*/protected` paths, so two concurrent runs
             (two Worker slots) delete each other's fixtures and fail with "manifest.json not found". Unique per-run directories would make
             overlapping runs safe — pending routing (this brief limits `BACKLOG.md` to none).
- [backlog]  `L3`'s refusal text still says "(Owner rebase, R3m)"; once `resync` is live it should name the Bootstrap re-sync — pending routing.
- [backlog]  `qa/pt_land_offline.js` takes 30–50 minutes and dominates `qa:offline`; the QA-performance task the Owner already queued
             covers it — pending routing.
- [local]    `git reset --keep` unstages staged changes in non-overlapping files; only a hash that includes the index (`git diff --cached`) would see it.
- [local]    A planted negative that asserts only the call's `ok` can be satisfied by a mutant that acts and fails afterwards; assert the state
             (here: the task ref did not move) as well.
- [local]    Edit-tool edits on the CRLF files (the two candidates, the AH suite, AGENTS.md candidate) kept CRLF every time; byte-audited after each.

LAND-EVIDENCE: qa-offline=PASS 54; targeted=PASS; codex-classI-unresolved=0
