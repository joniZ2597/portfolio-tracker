# Review — qa-template-fixtures, Stage 1: build identical land-suite fixture bases once per run and copy them

Brief: `work/qa-template-fixtures/brief.md` @ `21514ba` (brief-only commit). Baseline `f3c0728807c7bc2d66faaf4cc1387a83f8a979e6` (`branch-dev` = `origin/branch-dev`, Slice 0 landed).
Mode: Manual (attended), Worker A. Test-only: no tool, hook, protected, ASK-tier or `qa/run-offline.js` change.

## Summary

Both land suites now build their identical fixture repositories once per run and give each row an isolated copy made with the file system. The main suite uses a base template
(plain and `.gitignore` variants) and a landed-and-pushed cleanup template for nine cleanup rows; the resync suite uses one full-recipe template. Mutant tool sources and custom-origin
fixtures still build fresh, step for step as before. No row name, order, assertion or mutant changed: PASS counts are unchanged (166 and 49/49).

**Result against the brief's gates**

- Git-start reduction targets: **MET** (main suite −30.7 %, resync suite −24.0 %).
- Functional QA: **PASS** (both land suites, run-isolation, the new suite, and the full `npm run qa:offline`).
- Wall-clock runtime: **did NOT improve as expected** (see "Wall-clock result" below). Per the Owner's ruling, Stage 1 is not changed further to chase wall-clock time in this task.

## Files changed

- Implementation (5): qa/lib/fixture-template.js (new), qa/fixture_template_offline.js (new), qa/pt_land_offline.js, qa/pt_land_resync_offline.js, qa/run_isolation_offline.js
- Evidence (tracked): work/qa-template-fixtures/brief.md, work/qa-template-fixtures/review.md

## Step 0

- Baseline `npm run qa:offline`: **PASS, 58 spawned suites**, 1 advisory warning (started 2026-10-06 03:16:59, no other QA process active). The brief's "57" was stale; the measured count is 58 and the expected final count is 59.
- Pre-step benchmark (brief §4.2; median of 5 fresh builds vs median of 5 copies, copy = copy + rewrite + leak scan; quiet laptop):

| Template | Fresh setup | Copy | Copy / setup |
|---|---|---|---|
| main plain base | 3 070 ms (14 Git starts) | 320 ms | 0.104 |
| main `.gitignore` base | 3 990 ms (17 Git starts) | 399 ms | 0.100 |
| landed-and-pushed cleanup state | 19 567 ms | 658 ms | 0.034 |
| resync full recipe | 4 414 ms (20 Git starts) | 692 ms | 0.157 |

  Worst ratio 0.157 against the 0.40 STOP limit: not triggered. Raw numbers are in `qa.log`.
- One benchmark attempt crashed with EPERM (Git for Windows marks a worktree's `.git` file hidden; a truncating open is refused). The helper now rewrites such files in place. The crash left `tpl-*` / `ptbench-*` folders in the temp folder; the helper's "already exists" guard refused them, and only those leftovers were removed.

## Tests first

`qa/fixture_template_offline.js` against no helper: **13 of 20 rows FAIL** (RED). After the helper and the suite edits: **20/20 PASS**.
Four defects in the new suite itself were fixed before it could run: template key collision across harness instances (now an instance prefix), a harness `require` without `resolve`/`cache`, `git status` in a bare repo, and a malformed FT-6 negative.

## QA

- `node qa/fixture_template_offline.js`: **PASS 20** (FT-1 … FT-7 with planted negatives, including fail-closed landed guard, leak scan, copy independence and path rewriting in three spellings).
- `node qa/run_isolation_offline.js`: **PASS 28**. RI-6 now masks the builder functions, applies the 18-line §1.2b table to the expected text, and carries planted cases (an edit inside a masked builder is masked; an edit outside is detected; an unapplied row line is detected; a stray `'clN'` substitution is detected).
- Behaviour proof, each suite alone: main land suite **PASS 166**, resync land suite **PASS 49/49**; every planted mutant row still caught (`(caught)` lines present, no FAIL).
- Full `npm run qa:offline`, run by the Owner from a normal terminal on this checkout: **PASS, 59 suites, 0 failures**, 4 411 546 ms (about 73.5 min). The Worker's own attempts at the full run were killed twice by the system for low memory, so the Owner ran it.
- One mid-task defect: the first main-suite run crashed because `crypto` was not in scope inside `buildFixture`; a local `require('crypto')` was added and everything re-run.

## Measurement summary — Git starts (spawn meter, suites run alone)

| | Before (Slice 0, f3c0728) | After | Change | Gate |
|---|---|---|---|---|
| main land suite | 8 475 | **5 869** | **−30.7 %** | ≥ 30 % (≤ 5 932) — met |
| resync land suite | 4 234 | **3 216** | **−24.0 %** | ≥ 15 % (≤ 3 598) — met |

## Wall-clock result (recorded honestly — inputs for Stage 2)

Owner's full-run figures: `pt_land_offline.js` 2 275 931 ms, `pt_land_resync_offline.js` 821 208 ms, `fixture_template_offline.js` 1 028 555 ms (about 17.1 min).

- **Wall-clock did not improve as the brief predicted.** The full run took 4 411 546 ms (about 73.5 min) against the measured earlier baseline of 3 412 139 ms (about 56.9 min).
- **The new verification suite costs about 17.1 min in the full run.** It rebuilds the real builders from source, exercises every template path and several mutants, so it spends much of the saving it verifies.
- **`pt_land` stayed slow despite fewer Git starts** because the per-start cost was substantially higher in the main land suite's run: average Git start time 251.0 ms before and 353.9 ms after (about 41 % higher). This is specific to the main suite, not a global Git slowdown: the resync suite was essentially unchanged (236.3 ms before, 234.3 ms after). The saved starts therefore did not translate into saved minutes for the main suite.
- These measurements are inputs for Stage 2 optimisation. By Owner ruling, Stage 1 is not modified further for wall-clock time in this task.

## Codex review (implementation diff, base `f3c0728`; two untracked new files verbatim)

Raw response in `work/qa-template-fixtures/codex.md` (untracked, gitignored). Verdict: **No findings.** Scope matches the five implementation files; land-suite changes are confined to the approved builder functions and the 18 §1.2b row lines; resync changes are confined to `buildFixture`; helper rewrites, leak scan, fail-closed guards, RI-6 masking and planted negatives are consistent with the brief.

## FIX / DEFER / REJECT ledger

No findings, so nothing to classify. No FIX, DEFER or REJECT entries.

## Fresh-context self-review (step 7)

- Re-read the brief and the diff against the requirement map: every FT row maps to a §1 requirement; the 18 row lines equal the brief table character for character.
- Changed as a result: added the local `crypto` require inside `buildFixture` (found by the first heavy run); corrected a stale count in the plan (57 → 58 → 59).
- Line endings: the three edited suites are LF at HEAD and in the working tree; the autocrlf notices Git prints are not churn.

## Backlog reconciliation

Brief Backlog row: **none**. The finished work's effect is `none`; no `BACKLOG.md` edit.

## Final check

Final lightweight Codex check (step 12) run on the complete task diff: the implementation diff against `f3c0728` with the two new files verbatim, plus this file verbatim before this section was filled in. Raw response in `work/qa-template-fixtures/codex-final.md` (untracked). Verdict: **No findings.** QA counts, Git-start totals, runtime figures, per-start averages, backlog effect and scope all match the supplied facts and the brief. No Class I or Class II finding; no implementation edit followed.

LAND-EVIDENCE: qa-offline=PASS 59; targeted=PASS; codex-classI-unresolved=0
