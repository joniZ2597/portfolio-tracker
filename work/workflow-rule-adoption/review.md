# Review: workflow-rule-adoption

## Files changed
- Implementation (1): AGENTS.md
- Evidence (tracked): work/workflow-rule-adoption/brief.md, work/workflow-rule-adoption/review.md

## Baseline

`branch-dev` at task start: `3ba80c1` (in sync with `origin/branch-dev`, tracked tree clean).
Pre-edit `qa:offline`: PASS, 42 effective suites (11 denylisted).

## What changed

All seven approved rule changes from `work/workflow-rule-adoption/brief.md`, applied to
`AGENTS.md` only:

1. Worktree bootstrap step 0 (Worker execution contract) + one sentence in "Simplified
   worktree model".
2. "Two diffs" paragraph under "Codex as diff reviewer" + fixed two-row "Files changed" shape
   in the `review.md` bullet under "Task folder convention".
3. Step 12 replaced with Class I / Class II final-review handling.
4. "Finalization allowance" — brief exclusion overrides the `BACKLOG.md` allowance.
5. M2 row — pre-edit mechanical brief-tracked/unmodified check (in-place edit of the existing
   row, not a new rule).
6. "These five files are evidence and scope" sentence tightened to state the set is closed
   (in-place edit) + one sentence added to the `codex.md` bullet.
7. "Task brief convention" — added PREP row for QA suites that read in-scope files as text.

Per the brief's own normalization: the STOP-2 clarifier ("a wording gap is not STOP-2") was
placed in STOP condition 2, the single site where STOP-2 is defined, rather than duplicated in
step 12.

## Owner-authorized amendments beyond the brief's literal wording

Codex's first review of the initial implementation surfaced seven rule-quality issues, all
traceable to wording quoted verbatim from the approved brief. Rather than land those issues as
DEFER, the Owner explicitly authorized in-scope (`AGENTS.md`-only) wording corrections across
four review rounds. Two of those corrections depart from the brief's literal text and are
recorded here as Owner-authorized amendments, per the Owner's explicit instruction not to
retroactively amend the already-approved brief:

- **Diff commands now cover uncommitted and untracked work**, replacing the brief's literal
  `git diff <base>...HEAD`. The "Two diffs" paragraph ("Codex as diff reviewer") now defines
  the Implementation diff and Task diff as comparisons of `<base>` against the current working
  tree (tracked + scoped untracked paths), not `<base>...HEAD`. Owner ruling (this task,
  round 4): "The working-tree-inclusive definition is explicitly Owner-authorized by the
  amendment. It supersedes the brief's literal `git diff <base>...HEAD` wording for this task."
- **"A task is two commits" is now a non-exclusive minimum, not a strict count.** The governed
  commit shape requires a brief-only commit and a final implementation + `review.md` commit,
  without forbidding intermediate functional commits before that final commit (consistent with
  the existing "Test commands" allowance). Owner ruling (this task, round 4): "The clarification
  ... is also explicitly Owner-authorized. Do not revert either change. Do not amend the
  already-approved brief retroactively."

All other corrections across the four rounds are wording/consistency fixes that preserve the
brief's approved intent (see "Codex review" below for the itemized list).

## Validation

- `npm run qa:offline` — **PASS, 42 effective suites** (unchanged from baseline), confirmed
  after every correction round, final run recorded in `qa.log`.
- `node qa/instruction_layer_offline.js` — **PASS (58 checks)**, final run recorded in
  `qa.log`. Confirms no `CLAUDE.md` anchor or fingerprint moved — the mechanical proof
  `CLAUDE.md` was not touched.
- Implementation diff — exactly one file, `AGENTS.md`: `git status --short` and
  `git diff --stat` (working tree vs. `3ba80c1`) show only `AGENTS.md` modified throughout all
  four rounds.
- Read-back of `AGENTS.md`: all seven changes present in their mapped sections; every item in
  the brief's "Explicitly preserved — no change" list still present verbatim (spot-checked: the
  five STOP conditions, the ASK tier, the six M-transitions, the fingerprint pairing rule, the
  Lessons section); the Worker execution contract's own "returns to the Owner only at commit
  approval, LAND, or on a STOP condition" framing (line 36) remains true after the step-12
  terminator correction — the new "unresolved Class I" case surfaces at the existing
  commit-approval boundary (step 13), not a new return point.

## Fresh-context self-review

Performed after the initial implementation and again after the final correction round: re-read
the brief and the complete `AGENTS.md` diff against the requirement→test map in `plan.md`. All
seven changes map to their brief section; no orphan edits found; no requirement left
unimplemented. The final pass additionally confirmed internal consistency across the "Two
diffs" definition, step 12's Class I/II handling, and the M2 row after four rounds of
correction — no contradiction found between any two corrected passages.

## Codex review — implementation diff (four rounds)

Full raw output for all four rounds in `codex.md`. All findings classified under the current
(pre-this-task) FIX/DEFER/REJECT rule (step 8/9) — this is the implementation-diff review, not
the step-12 final check, whose Class I/II handling is itself one of the seven changes this task
installs.

**Round 1** (initial implementation) — 7 findings, all traced to brief-verbatim text. The Owner
amended the task rather than accept DEFER on rule-quality issues within this task's own reach;
all 7 were then resolved by correction (see "Owner-authorized amendments" above for the two
that depart from literal brief wording):

| # | Finding (summary) | Outcome |
|---|---|---|
| 1 | `git diff <base>...HEAD` omits uncommitted work | **FIX** — Owner-authorized amendment (working-tree-inclusive diffs) |
| 2 | Final-check scope had two competing definitions | **FIX** — task diff is now the sole authoritative definition |
| 3 | "second Codex run" ambiguous vs. step 8's review | **FIX** — step 12 now names step 8 as a separate, uncounted round |
| 4 | No terminator when a class-II fix becomes class-I | **FIX** — reclassification re-enters step 9's rule explicitly |
| 5 | M2 row restated an existing principle, contradicting the brief's own normalization note | **FIX** — restated sentence removed, only the two mechanical checks remain |
| 6 | "A task is two commits" read as forbidding intermediate commits | **FIX** — Owner-authorized amendment (non-exclusive minimum) |
| 7 | Class-II "no Pending" check conflicted with `[backlog] — pending routing` | **FIX** — exemption clause added |

**Round 2** (after round-1 corrections) — 4 new findings, all **FIX**ed:
- Stale "implementation + `review.md`" parenthetical in the `review.md` bullet, now pointing at
  the authoritative task-diff definition.
- Step 12's scoped re-pass needed an explicit exception to "Codex must receive every part."
- Class-II summary line was false for a round with a class-I reclassification — mixed-round
  form added.
- Backlog exemption's literal string didn't match real lesson lines — form generalized to
  `<lesson text>`.

**Round 3** (after round-2 corrections) — 4 new findings, all **FIX**ed:
- Step 12's new non-STOP Owner handback conflicted with the execution contract's "returns only
  at commit approval, LAND, or STOP" framing — reworded to surface at the existing
  commit-approval boundary instead of creating a new return point.
- The working-tree-inclusive diff and non-exclusive-commit-count corrections were flagged as
  exceeding the brief's literal wording — Owner reviewed and explicitly authorized both (see
  "Owner-authorized amendments" above); not re-flagged in round 4.
- No summary-line form existed for a pure class-I outcome — added, then refined to be
  outcome-aware (FIX/DEFER/REJECT/unresolved counts) per a follow-up Owner correction rather
  than assuming every class-I finding gets a QA re-run and re-pass.
- `[backlog] — pending routing` in the "Finalization allowance" section didn't match the
  `<lesson text>` form used in step 12 — normalized.

**Round 4** (final) — **0 findings.** All four round-3 items confirmed resolved; no remaining
or new issues.

No REJECT and no DEFER across any round — every correct finding was fixed within this task's
approved scope (`AGENTS.md` only), per Owner direction. No STOP condition fired at any point:
no file other than `AGENTS.md` entered the diff, no suite-count delta occurred, and no
correction required editing `CLAUDE.md`, a QA suite, or a brief template.

## Final check

Final lightweight Codex check run per step 12 against the task diff (implementation `AGENTS.md`,
tracked `brief.md`, and `review.md` — still untracked at check time, contents included
directly). Raw output appended to `codex.md` under `## Final check`. No Class I findings. Three
Class II findings — this "Final check" section's own "Pending" placeholder and stale task-diff
description, and a Lessons-section inaccuracy about which round exercised the summary-line
forms — fixed below (documentation-only; no implementation change, no QA re-run needed).

`Final check: 1 round, 3 class-II findings fixed, self-checked; no implementation change, no QA
re-run.`

## Lessons

- [local]    Four rounds of Codex re-review were required to reach a clean implementation-diff
             pass, all within this task's approved single-file scope. Two of the corrections
             (working-tree-inclusive diff commands, non-exclusive two-commit shape) departed
             from the brief's literal quoted text; the Owner explicitly authorized both rather
             than have this task land them as DEFER or trigger a brief amendment. See
             "Owner-authorized amendments" above for the exact rulings.
- [rule]     This task's M2 row correction (removing a restated principle) exists because the
             brief's quoted insertion text was longer than its own normalization note claimed —
             a future `wu-plan-prep`-style pre-approval check should flag that mismatch before
             Owner approval, not leave it for implementation time to discover.
- [local]    This task is the first artifact written under the two-row "Files changed" shape
             and the class I/II final-check line it itself installs (brief §"Self-consistency
             ... the first artifact written under the rules it installs, and therefore their
             first test"). Confirmed workable in practice: round 1 was the pre-existing step 8/9
             FIX/DEFER/REJECT review (not step 12, and not class I/II — that split did not exist
             until this task's own edit landed); the new step-12 class-II-only summary-line form
             was the one actually exercised, in this task's own final check above.
