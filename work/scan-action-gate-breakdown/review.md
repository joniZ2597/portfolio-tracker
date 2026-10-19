# review.md — scan-action-gate-breakdown

Mode: Manual, attended. Base `eb4670f`. Docs-only task: lands the Capability Breakdown for the scan action gate.

## Files changed
- Implementation (1): work/scan-action-gate/breakdown.md
- Evidence (tracked): work/scan-action-gate-breakdown/brief.md, work/scan-action-gate-breakdown/review.md

## What changed
New file `work/scan-action-gate/breakdown.md`, written with the Write tool from the brief's §2c block. Git blob `718bf5938e4dc2d86508ca010de5aac59de712d6` (expected value), sha256 `71fcc4e34b600f2de53d4b88712278720756b0c4db75478c71d3dec86a2b46fb`, 94 lines, LF only (`git ls-files --eol`: `i/lf w/lf`; 0 CR bytes). No other implementation file changed; `BACKLOG.md`, `AGENTS.md`, `qa/**`, `index.html`, `services/**` and `work/scan-action-gate-1/**` untouched.

## §2b conformance checklist
1. Seven headings in order: Outcome, Current / Change Map, Decisions, Unknowns / Gaps, Split / Dependencies, Not in v1, Domain logic (`## ` lines 7, 15, 29, 40, 46, 51, 63) — PASS.
2. Change Map has nine rows (Client, Server functions, Storage / schema, Scores / Actionable Take, Persistence, Gates / environment, QA, Deploy / external, Docs); each Change cell begins with `modify` or `none` — PASS.
3. 62 lines outside Domain logic (heading on line 63; limit 80; file 94 lines) — PASS.
4. No function name or code expression in the Change Map or Not-in-v1 sections (identifiers there are file names and setup / action values) — PASS.
5. Domain-logic trigger answered by the `## Domain logic` section; the line `Domain logic: none, engineering-only` is absent (Grep count 0) — PASS.
6. Staged blob id equals `718bf5938e4dc2d86508ca010de5aac59de712d6` (`git rev-parse :work/scan-action-gate/breakdown.md`) — PASS.
DoD 3: the known-limitation wording is present as "this is **not** complete eight-setup enforcement" (bold markers as in §2c) — PASS.

## QA results (raw in work/scan-action-gate-breakdown/qa.log, untracked)
- Step-0 `npm run qa:offline`: PASS, 102 suites (baseline).
- Step-10 `npm run qa:offline`: PASS, 102 suites (count unchanged).
- Land-test `node qa/index_pins_offline.js`: PASS (13 index-pin assertions).
- Step-0 sweep: no `qa/` suite reads a `breakdown.md`, references `scan-action-gate`, or lints Breakdown shape (Grep: none), so the §2a items were not blocking.
- The brief's open point on §5 ("No dependency on an unlanded task") is kept verbatim as the brief directs; ordering relative to `evidence-capture-1` is covered by the "shares `index.html` and the pin map … not parallel" sentence.

## Codex
Round one (step 8), raw in codex.md: PASS, no findings.

Final check (step 12), raw in codex.md: PASS for the implementation; 3 class-II findings. (1) "Evidence (tracked)" reads inaccurately while `review.md` is untracked — REJECT: it is the fixed two-row `## Files changed` shape of AGENTS.md, and `review.md` is tracked once the step-13 commit is made. (2) qa.log lacked the suite counts — fixed: the `102 spawned suite(s)` lines of both runs are now in qa.log. (3) the `LAND-EVIDENCE` line was absent — fixed: it is written below after the final pass, as the brief requires.
Final check: 1 round, 2 class-II findings fixed and 1 rejected with a reason, self-checked (every `work/<id>/` path named exists, every count matches a line in `qa.log`, no section reads Pending or TBD); no implementation change, no QA re-run.

## Form denials
none.

## Backlog reconciliation
- Brief's Backlog row: none (no matching entry).
- Action taken: none. `BACKLOG.md` not edited.

## Lessons
- [covered] A Breakdown whose text is embedded in a brief is verified by git blob id after `git add`; the brief's §2b item 6 already does this.
- [local] The known-limitation phrase appears with bold markers inside the sentence, so a plain-text Grep for the unbroken phrase finds nothing; match with the markers or split the words.

LAND-EVIDENCE: qa-offline=PASS 102; targeted=PASS; codex-classI-unresolved=0
