# Review — domain-logic-breakdown

Task: Domain Logic support in the Capability Breakdown convention. Brief `d60a56a` on
`task/domain-logic-breakdown`, base `cec170f`. At review time `origin/branch-dev` had advanced
one commit to `fe0d5c0` (Catalyst News docs only; `AGENTS.md` untouched there); the task was
not rebased onto it. Nothing pushed, nothing deployed, `main` untouched.

## Files changed
- Implementation (1): AGENTS.md
- Evidence (tracked): work/domain-logic-breakdown/brief.md, work/domain-logic-breakdown/review.md

Evidence inventory from `git status` / `git ls-files` at review time: `brief.md` tracked,
committed `d60a56a`; `plan.md`, `codex.md`, `qa.log` present on disk and gitignored
(`.gitignore` lines 4–6); `review.md` is this file, untracked until the final commit.
`AGENTS.md` is the only modified tracked file.

`git diff cec170f -- AGENTS.md`: 5 hunks, 42 insertions, 14 deletions, all inside
"## Capability Breakdown (optional)" (lines 200–293 after the edit). An earlier audit counted
6 hunks; the readiness-paragraph re-wrap touched the lines between the readiness hunk and the
"Holds" table hunk and merged them, so 5 is the count of the final diff. Index EOL unchanged
(`i/lf`); working copy stayed CRLF throughout (byte audit: 0 lone LF).

## QA

| Run | Result |
|---|---|
| Pre-edit baseline `npm run qa:offline` (step 0, fresh worktree after `npm ci`) | PASS, 43 spawned suites, 14 phases, 1 advisory warning |
| Post-edit `npm run qa:offline` | PASS, 43 spawned suites, 14 phases, 1 advisory warning — delta zero |
| `node qa/instruction_layer_offline.js` | PASS (58 checks) — `CLAUDE.md` anchors and fingerprints unmoved |
| Read-back RB-1..RB-10, RB-13 (scripted, scratchpad harness, output in `qa.log`) | 10 FAIL / 1 PASS before the edit; 11/11 PASS after |

The one advisory warning is pre-existing and unrelated: `index.html` smart-quote WARN at line
10050; `index.html` is not in this task's diff.

## Codex

Round 1 (step 8, implementation diff): **0 findings** — "No further findings." Raw output in
`codex.md`.

### FIX / DEFER / REJECT ledger

| Class | Count | Entries |
|---|---|---|
| FIX | 0 | — |
| DEFER | 0 | — |
| REJECT | 0 | — |

### Final check (step 12, task diff incl. this file's contents)

Final check: 1 round, 0 class-II findings fixed, self-checked; no implementation change, no QA
re-run. Raw output appended to `codex.md` under `## Final check`.

## Requirement → outcome

| Brief item | Ruling | Present |
|---|---|---|
| E1 entry test — Breakdown required when the trigger fires | C1 | yes |
| E2 structure clause | — | yes |
| E3 trigger, required all-NO line `Domain logic: none, engineering-only`, section contents, no invented fixtures, model challenge risk-based | C5 | yes |
| E4 boundary-table cell exception | C2 | yes |
| E5 readiness parenthetical | — | yes |
| E6 artifacts table "Holds" item | — | yes |
| E7 size limits — compact, DR table may exceed 80 when necessary, no other exemption | C3 | yes |
| E8 gap rule — implementation discovery, uncovered domain case, do not guess, STOP-1 | C4 | yes |

Every "Explicitly preserved" item in the brief is present verbatim (RB-13 plus diff inspection:
no hunk outside the section).

## Corrections during the task

1. After the eight edits, RB-7 failed because the E5 parenthetical had been wrapped across a
   line break. Re-wrapped so the brief's quoted text is literal; the re-wrap left one over-long
   joined line, fixed by re-wrapping the paragraph (no wording change).
2. E5, E6 and E8 were first written without the bold markers the brief's quoted text carries. I
   proposed recording that as a "wording" reading; the Owner rejected that: the brief states the
   quoted E-text is exact wording, bold included. Bold restored verbatim; RB-7, RB-8 and RB-10
   were tightened to assert the exact bold text. No reading recorded.
3. The first draft of this file said 5 hunks while an earlier audit had reported 6, and listed
   only the tracked evidence files; both corrected above from actual git output at the Owner's
   direction.

## Lessons

- [covered]  Bold markers inside a brief's quoted text are part of the exact wording, not
             insertion emphasis — already covered by the brief's own "Quoted text is the exact
             proposed wording" and `AGENTS.md` step 2, "The brief wins over repo precedent."
- [covered]  The Edit tool preserved CRLF in the working copy this time, but the byte audit is
             still the only proof — already covered by the brief's EOL clause and validation
             item 4.
- [design]   `work/catalyst-news/breakdown.md` line 7 (at `fe0d5c0`) describes its Domain logic
             table as a "Size-limit deviation, stated deliberately". Under the new Size limits
             rule it is no longer a deviation. Destination-ready text for that note: "**Size:**
             the six standard sections are within the 80-line budget; `## Domain logic` is the
             compact DR table the Size limits rule allows to extend past it." — belongs in
             `work/catalyst-news/breakdown.md`, by the task that next owns it.
- [backlog]  Two `AGENTS.md`-only docs tasks have each hand-rolled a scratchpad read-back
             harness; a reusable `qa/` docs-readback helper taking an assertion list would make
             the "tests first" step mechanical for prose-only changes — pending routing
             (`BACKLOG.md` is excluded by this brief).
- [local]    Codex returned zero findings on a 56-line prose diff in one round; the read-back
             harness, not Codex, caught both defects in this task.
