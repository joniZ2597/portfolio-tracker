# Review: 22a - expose Technical Score v1 by default (Entry 22, slice a)

## Result

D1 is implemented exactly as written in the brief: one block in `init()` of `index.html` that sets
`window.PT_ENABLE_TECH_SCORE = true;` on every load, with the original strict `=== true` / `!== true` checks
untouched. A new offline suite proves the placement, the absence of any other assignment or persistence, the
byte-equality of the four protected functions, the row behaviour, and that no other gate gained a default.
B1 is applied to `BACKLOG.md` (step 10a, effect `partial`).

## Files changed

- Implementation (3): index.html, qa/ts1_default_exposure_offline.js, BACKLOG.md
- Evidence (tracked): work/tech-score-default/brief.md, work/tech-score-default/review.md

The brief's "exactly 4" files are these three implementation files plus `review.md`; `brief.md` was committed
earlier and is not changed by this task.

## QA

| Run | Result |
|---|---|
| Step 0 baseline, before any edit (HEAD `a22c3aa`) | `npm run qa:offline` PASS, 53 suites |
| `node qa/ts1_default_exposure_offline.js` | PASS, 45 asserts (before D1 it failed as intended) |
| `node qa/vis_score_caliper_offline.js` (unmodified) | PASS, 307 asserts |
| Step 10 full `npm run qa:offline` (run 2, 03:20 to 03:45) | PASS, 54 suites, 0 FAIL = baseline 53 + 1 |
| B1 text check (file-content only, no spawned process) | B1 present once, directly before entry 22's `*Deps:*` line, text exact, every other line byte-equal to the reference file, CRLF preserved |

Two earlier full runs are not counted. The first was reaped by the harness for low memory. Its runner kept
running and finished with eight suites exiting with Windows code 3221225794 (resource exhaustion, child
processes could not start), so it is not valid evidence. Both are recorded in `qa.log`.

Post re-sync note: the task branch was fast-forwarded onto the moved `branch-dev` (`052e879`) with the
uncommitted work held byte-identical (hashes recorded in `plan.md`). The step 10 run above was on the tree
before that move. The moved base changes only `BACKLOG.md` outside entry 22, census files, and other task
folders, none of which this task edits. The full run at the final commit is reported in the step-13 report as
LAND evidence, since it can only run after the commit exists.

## Codex

Step 8 reviewed the real implementation diff (tracked diff plus the full contents of the untracked suite).
Raw output is in `codex.md`. Verdict was FINDINGS, four items.

| # | Finding | Class | Disposition |
|---|---|---|---|
| 1 | `isLive()` treated any line containing `/*` or `//` before a match as comment, so `/* note */ window.PT_ENABLE_X = true;` was invisible to TX-2 and TX-5 | I | FIX. A closed inline block comment now lets later code count as live. Controls and a negative added |
| 2 | TX-5 did not catch computed literal-key assignments such as `window['PT_ENABLE_DEEP_DIVE'] = true;` | I | FIX. The gate-assignment scan now includes literal-key bracket assignments. Control and negative added |
| 3 | TX-3 negatives covered only `renderMainPanel` and the filler, not the engine or `_ts1RowText` | I | FIX. Two negatives added, one per function |
| 4 | Diff supplied to the reviewer excluded `BACKLOG.md` and `work/`, so B1 and the review could not be verified from it | I | REJECT. Those paths are excluded from the implementation diff by definition. They are covered by the final check on the task diff |

After the FIX round the targeted suites were re-run (45 asserts and 307 asserts, both PASS) and the full run
above followed.

Final check (step 12, on the complete task diff including this file): no Class I findings. Two Class II
wording points in this file were fixed: the sentence about the final-commit full run, and a note that the
brief's four-file count includes `review.md`.

Final check: 1 rounds, 2 class-II findings fixed, self-checked; no implementation change, no QA re-run.

## Backlog reconciliation

- Backlog row in the brief: Entry 22, effect `partial`. `BACKLOG.md` is in the file set and in `land-scope`.
- Action taken: `updated`.
- Entry 22 heading, before and after: `### 22 · Gate exposure & surfacing policy` is unchanged, as the brief
  specifies. One paragraph was inserted immediately before the entry's `*Deps:*` line recording the ruling,
  that 22a landed, and that 22b (the session-only Labs section, Deep Dive) remains.
- No DONE line, snapshot, count or other-entry edit.
- The new BACKLOG text matches the diff (one added line), the QA results above and the work being landed:
  only Technical Score v1 became visible; every other hidden card stays hidden.

## Definition of Done

- D1 and B1 exact: yes.
- TX-1 to TX-5 and their negatives PASS: yes, 45 asserts.
- Caliper PASS: yes, unmodified.
- Full `qa:offline` = baseline + 1: yes, 54 against 53.
- Codex: no unresolved Class I finding.

## Lessons

- [rule] A full `qa:offline` started as a background shell can be reaped by the harness under memory pressure while its runner and child suites keep running, then fail with Windows code 3221225794. Before re-running, list surviving runner processes and wait for them, and never overlap two full runs, so the one re-run is the only run.
- [backlog] `qa/pt_land_offline.js` accounts for about 24 to 32 minutes of every full run, which makes QA gating slow and memory heavy — pending routing
- [local] The guard denied an inline `node -e` check that spawned git. File-content checks that read files only avoid it.
- [local] An uncommitted `BACKLOG.md` edit overlaps an incoming base that also changes `BACKLOG.md`, so the fast-forward kept the work only after that one edit was removed and re-applied.

LAND-EVIDENCE: qa-offline=PASS 54; targeted=PASS; codex-classI-unresolved=0
