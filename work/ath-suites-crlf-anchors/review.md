# Review: ath-suites-crlf-anchors

## Summary
Test-only fix. The four B2-auto ATH suites (`ath_auto`, `ath_ensure`, `ath_read`, `ath_record`) matched multi-line planted-negative anchors (`\n`-joined) against module source read without EOL normalisation, so on a checkout where the ATH product files are CRLF the anchors were not found (`MUTANT_ANCHOR_MISSING[_OR_NOT_UNIQUE]`). Each mutant loader now reads `fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')`. Nothing else changed.

## Files changed
- Implementation (4): qa/ath_auto_offline.js, qa/ath_ensure_offline.js, qa/ath_read_offline.js, qa/ath_record_offline.js
- Evidence (tracked): work/ath-suites-crlf-anchors/brief.md, work/ath-suites-crlf-anchors/review.md

## Owner rulings applied
- 2026-10-08: separate minimal task, Manual, exact change `fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')`; Worker B reused temporarily; `task/task-base-record` parked clean and unchanged.
- 2026-10-08: scope-completeness check of `ath_isolation`, `ath_write`, `ath_owner_tool` found none with the defect (all anchors single-line; `ath_isolation` has no mutant loader and pins through `sha256Lf`) - four-file brief approved as drafted.
- 2026-10-08: no temporary WIP commit/stash to manufacture a pre-edit baseline; accepted evidence = CRLF RED reproduction + revert proof + targeted PASS + full `qa:offline` PASS.
- 2026-10-08 (for the parked `task-base-record`, recorded here per the Owner's instruction): the mechanical AH-24 / AH-25 re-anchor was approved (PRE/POST line mapping; behaviour assertions, mutant/differential intent and coverage preserved; no brief amendment).

## Why a direct RED was not reproducible in this checkout
In this Worker B worktree the ATH product files are LF on disk (`git ls-files --eol`: `i/lf w/lf` for `netlify/functions/lib/ath-*.js` and the four suites), although `core.autocrlf=true`. The unedited suites therefore PASS here (44/31/22/34). The defect appears only where the product files are CRLF in the working tree (Worker A's checkout).

## CRLF reproduction evidence (raw output in `work/ath-suites-crlf-anchors/qa.log`)
A scratchpad copy (outside the repo; `mkrepro.js <repo> <out> crlf`) holds `netlify/functions/lib/**` converted to CRLF and the four suites byte-identical to the unedited repo versions.
- Pre-edit, CRLF product files (RED): ath_auto 6 failed / 38 passed; ath_ensure 1 / 30; ath_read 2 / 20; ath_record 2 / 32 = **11 failed negatives**, every one `MUTANT_ANCHOR_MISSING[_OR_NOT_UNIQUE]`.
- Post-edit, CRLF product files (GREEN): 44 / 31 / 22 / 34 passed, 0 failed.
- Post-edit, LF product files in scratch (control): 44 / 31 / 22 / 34 passed. Post-edit, the repo tree (LF): 44 / 31 / 22 / 34 passed. Pass counts equal the pre-edit LF counts, so no negative was dropped or weakened.

## Revert proof
In a CRLF scratch copy, reverting only the `ath_ensure` loader to the bare read (anchor proven to occur exactly once before the revert) reproduces the original failure: 1 failed / 30 passed, `MUTANT_ANCHOR_MISSING_OR_NOT_UNIQUE: async function fullDerive(ctx, existing) {`. The edit, and only the edit, moves the result.

## Targeted results (repo tree, post-edit)
ath_auto 44, ath_ensure 31, ath_read 22, ath_record 34, ath_isolation 22, ath_write 40, ath_owner_tool 27 - all PASS, 0 failed.

## Full QA
`npm run qa:offline` (Owner heavy-lane go-ahead), 2026-10-08T18:17:24Z - 18:30:29Z (~13 min): `OFFLINE VALIDATION: PASS`, 71 suites PASS, 0 failures, 1 advisory warning (existing `index.html` smart-quote notice at line 10655, unrelated). Slowest: pt_land_offline 363 s, pt_land_resync_offline 221 s, auto_mode_hardening_offline 105 s. No pre-edit step-0 count exists for this task (Owner ruled no WIP commit/stash for a baseline), so "same count" is not asserted by measurement; no suite was added or removed by the diff.

## Codex
Implementation-diff review: PASS, no Class I findings; one Class II note (the step-0 aggregate count is not recorded - addressed in the Full QA paragraph above). Raw output in `work/ath-suites-crlf-anchors/codex.md` (untracked).

Final check: 1 round, 0 class-I findings, 0 class-II findings - PASS; no implementation change, no QA re-run. Raw output appended to `codex.md` under `## Final check`.

## FIX / DEFER / REJECT ledger
- Codex Class II (step-0 count undocumented): FIX (documentation) - stated above; not an implementation change.
- No FIX / DEFER / REJECT for implementation.

## Backlog reconciliation
- Brief's Backlog row: none. Action taken: none. No BACKLOG.md entry affected; no edit made. The recorded lessons below are not acted on by this task.

## Lessons
- [rule] Mutant-source loaders normalise EOL before anchor matching: `fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')`, because multi-line `\n` anchors cannot match a CRLF working tree and EOL differs per checkout/file here (`git ls-files --eol`). Destination: `.claude/rules/qa-suites.md` (planted-negative bullet) - waits for the task that owns that file.
- [backlog] `ath_write_offline.js` and `ath_owner_tool_offline.js` use the same bare-read loader (`indexOf` anchors, all single-line today); a future multi-line anchor there would hit this defect — pending routing
- [local] A defect that depends on the checkout's working-tree EOL cannot be shown RED in an LF checkout; reproduce in a scratch copy with the product files converted, with the suite files byte-identical.

LAND-EVIDENCE: qa-offline=PASS 71; targeted=PASS; codex-classI-unresolved=0
