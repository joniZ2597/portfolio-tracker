# Task brief: Integrity result is LAND evidence — not written back into review.md

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Baseline | the current `branch-dev` at the time of this brief's commit (it must contain the auto-policy `ea5a632`) |
| Branch / slot | `task/integrity-evidence-rule`, created from this brief's commit in whichever Worker slot is free and current |
| Mode | **Manual** (`AGENTS.md` is ASK tier) |
| qa:offline | 50 → 50 (no suite added or changed) |
| Status | CODE-READY on Owner approval of this brief |

Objective. Remove a lifecycle loop found during DH-M2b. `review.md` is committed in the single gated
step-13 commit, but `guard_integrity_check` can only run after that commit. Recording its result in
`review.md` would therefore need an amend or a second commit. This change codifies the Owner ruling
of 2026-09-29 in two places: `AGENTS.md` and the integrity script's header comment. It does not
change behaviour, the hook, settings, CLAUDE.md, or any gate.

## 1. Owner ruling (approved with this brief)

- **IE-1.** Post-commit integrity results are **LAND evidence**. They are reported in the Worker's
  step-13 handoff (the CLAUDE.md task-completion report) or by the Owner before LAND. They are
  **never** written back into the committed `review.md`, with no amend and no second commit made only
  to record them.
- **IE-2.** `review.md` contains all pre-commit implementation, QA and Codex evidence. It does not list
  the integrity check as pending.
- **IE-3.** An integrity FAIL is **STOP-6**. If the Owner resolves a baseline or ruling issue and a
  re-run PASSes **without any implementation change**, the task proceeds to LAND with the original
  task commit unchanged.

## 2. Root causes (verified at `9be7717`)

1. `qa/guard_integrity_check.js` header, line 6: "Run by the Worker at STOP (result -> review.md)".
2. `AGENTS.md`:
   - step 13 says to "report … integrity results" without saying where;
   - the `review.md` definition calls it "final evidence";
   - the step-12 Class-II self-check forbids any section reading "Pending".
3. `work/guard-r10/brief.md` R10-8 says "result in review.md". That is historical committed evidence
   and is **not edited**; this brief supersedes it for future tasks.

## 3. Implementation file set — exactly 3

```
AGENTS.md                                   edits G1–G3 (§4)
qa/guard_integrity_check.js                 edit G4 (§4) — header comment only
work/integrity-evidence-rule/review.md      NEW — tracked task evidence
```

**QA suites that read in-scope files as text:**
- `qa/auto_mode_hardening_offline.js` requires `qa/guard_integrity_check.js` and mutates it by
  source-anchor replacement. The header comment is not a mutant anchor, so those rows are unaffected.
  The Worker verifies this.
- No suite reads `AGENTS.md` beyond path strings.
- `CLAUDE.md` is untouched, so its fingerprint is unchanged.

## 4. Edits

Anchors match exactly once when line breaks are treated as spaces. Rewrap only the edited paragraph.
Both files are checked out with **CRLF** line endings; keep them.

- **G1 — AGENTS.md step 13.** Immediately after the bullet ending "Any FAIL is **STOP-6**." and before
  "- Then **STOP**: report the implementation, QA, Codex and integrity results, and request LAND.",
  insert two bullets:

  > - The integrity result is **LAND evidence**: report it only in the step-13 STOP report (the `CLAUDE.md` task-completion report). It is never written into `review.md` — no amend, and no second commit made only to record it — and `review.md` does not list it as pending.
  > - If a FAIL comes from a baseline or ruling issue that the Owner resolves, and a re-run PASSes without any implementation change, the task proceeds to LAND with the original task commit unchanged.

- **G2 — AGENTS.md `review.md` definition (Task folder convention).** After "…and the FIX / DEFER /
  REJECT ledger with a reason for every DEFER and REJECT.", insert:

  > It holds pre-commit evidence only; the post-commit integrity check is LAND evidence (step 13).

- **G3 — AGENTS.md Owner LAND / SHIP boundaries.**
  - Replace "`node qa/guard_integrity_check.js` passes (this covers an empty `core.hooksPath` and only
    `.sample` git hooks)." with "`node qa/guard_integrity_check.js` passes (this covers an empty
    `core.hooksPath` and only `.sample` git hooks) — run after the task commit and reported in the
    Worker's step-13 report or by the Owner, never recorded in the committed `review.md`."
  - In the **Second LAND** bullet, replace "re-runs `npm run qa:offline` and the relevant targeted tests
    in its slot and reports" with "re-runs `npm run qa:offline`, the relevant targeted tests and the
    integrity check (against the rebased commit) in its slot and reports".

- **G4 — `qa/guard_integrity_check.js` header comment (line 6).** Replace:

  ` * Run by the Worker at STOP (result -> review.md) and by the Owner before LAND.`

  with:

  ` * Run by the Worker after its step-13 commit (result -> the step-13 report / LAND evidence, never review.md) and by the Owner before LAND.`

  No other byte of the script changes.

**Unchanged:**
- every other `AGENTS.md` line (incl. step 12, STOP-1..6, the tier table and Auto policy);
- `CLAUDE.md`, the hook and settings;
- all other suites;
- active tasks `task/dh-ruled-surfaces` and `task/backlog-reconcile` and their briefs.

## 5. QA

- Step 0: `npm run qa:offline` PASS 50, recorded in `qa.log`.
- `node qa/auto_mode_hardening_offline.js` PASS, including the AH-18 integrity rows and mutants.
- `node qa/instruction_layer_offline.js` PASS (CLAUDE.md fingerprint unchanged).
- **Text checks** (a scratch script outside the repo; results in `review.md`):
  - the G1–G4 texts are present exactly once;
  - "result -> review.md" is absent from `qa/guard_integrity_check.js`;
  - `git diff` of `qa/guard_integrity_check.js` is one changed line;
  - the `AGENTS.md` diff hunks map one-to-one to G1–G3;
  - CRLF is preserved in both files;
  - no other file changed.
- Full `npm run qa:offline` PASS 50.
- **QA lesson:** any check whose assertion calls something with real side effects computes its result
  once and asserts on the stored value.

## 6. Worker flow

1. **Step 0:**
   - cwd = assigned slot, HEAD on `task/integrity-evidence-rule` at this brief's commit;
   - run the current-guard check;
   - record the baseline.
2. **`plan.md`:** requirement→test map plus the CLAUDE.md pre-flight checklist.
   - Gate Verification: no gated execution path changes.
   - Definition of Done: §8.
3. Apply G1–G4 (Manual), then targeted QA and the text checks.
4. Worker-launched Codex read-only review of the diff.
   - Focus: wording matches §4 exactly, no behaviour or gate change, no contradiction with step 12/13
     or STOP-6.
   - Resolve findings FIX / DEFER / REJECT.
5. Full `qa:offline`, then `review.md` (pre-commit evidence only, per IE-2), then the Codex final check.
6. **Step 13:**
   - stage `AGENTS.md`, `qa/guard_integrity_check.js` and `work/integrity-evidence-rule/review.md` with
     explicit paths in one call;
   - plain `git commit -m "docs(workflow): treat post-commit integrity result as LAND evidence"` in a
     separate call (r9 gate; no protected path is staged);
   - then run the integrity check, report the result in the STOP report only (IE-1), and request LAND.

## 7. STOP conditions

- **STOP-1..5** per AGENTS.md, including any file outside §3 or any edit beyond G1–G4.
- **STOP-6:**
  - any hook denial, safety-classifier block, or integrity-check FAIL;
  - any Manual fallback trigger;
  - the Owner becoming unavailable.

  Never retry in another form.
- Any behaviour change in `qa/guard_integrity_check.js`, or any change to the hook, settings,
  `CLAUDE.md`, other suites, or the active tasks' files or briefs.
- An amend, or a second commit.
- Any push, merge, rebase, LAND, deploy, environment or `main` action.

## 8. Definition of Done

- G1–G4 applied exactly; the text checks pass.
- `auto_mode_hardening`, `instruction_layer` and full `qa:offline` (50) PASS.
- Codex: no unresolved Class I finding.
- One gated task-branch commit with exactly the §3 files.
- Integrity check PASS, reported in the step-13 report (not in `review.md`).
