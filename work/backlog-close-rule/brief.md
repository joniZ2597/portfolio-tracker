# Task brief: backlog-close-rule — BACKLOG reconciliation becomes a mandatory part of task close

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Backlog | **none** — workflow rule only; no BACKLOG entry is closed or changed by this task (so `BACKLOG.md` is not in scope) |
| Baseline | 21315ee936378ae606c390bf066e8a04e2993ef0 = branch-dev = origin/branch-dev (worker-continuous-flow landed); main = origin/main = fbec2c193346d7afd1dab6fd11a46b5efe55238b; the task branch starts at this brief's commit |
| Branch / slot | `task/backlog-close-rule`, in a slot refreshed to current `branch-dev` (for example Worker B after `pt-land.js cleanup task/worker-continuous-flow`) |
| Mode | **Manual** (`AGENTS.md` is ASK tier) |
| qa:offline | the baseline count measured at Step 0 → unchanged (documentation only) |
| Status | CODE-READY on Owner approval of this brief |

Objective. Make BACKLOG reconciliation a mandatory, verified part of every task's close. Repository state,
task evidence and `BACKLOG.md` must agree when a task lands, so separate reconciliation tasks (such as P1, a
one-time historical cleanup) are no longer needed.

## 1. Rulings (approved; not reopened)

- **A:** a new mandatory step 10a, Backlog reconciliation.
- **B + C, as clarified by the Owner (2026-10-02):**
  - every brief has a Backlog row stating the expected effect: `close` / `partial` / `none`;
  - if the task may change `BACKLOG.md`, `BACKLOG.md` must be listed in the brief's `land-scope` and
    implementation file set;
  - **no separate exception** allows `BACKLOG.md` edits outside the approved scope;
  - if the effect is `none`, no `BACKLOG.md` edit is made.
- **D:** `review.md` gains `## Backlog reconciliation`. The final Codex check verifies it, and a missing or
  incorrect reconciliation is Class I (it blocks commit, and through it LAND, push and cleanup).
- **E** (removing volatile snapshot fields from BACKLOG) is done **in P1**, not here.
- **Order:** this task runs before P1 and P2a. P2a is the first task to follow the new rule.

## 2. Exact edits (`AGENTS.md` only)

Each "old" text matches exactly once at `21315ee` when line breaks are read as spaces. Rewrap only the
edited paragraph. Keep CRLF. The `>` quote markers are not part of the inserted text.

- **K1 — Task brief convention.** Insert a new paragraph immediately after the paragraph that ends
  `a suite can read a file it never imports.)*`:

  > **Backlog row (required).** Every brief has a Backlog row naming the `BACKLOG.md` entry or entries it concerns and the expected effect: `close`, `partial` or `none`. If the effect is `close` or `partial` — or the task may otherwise change `BACKLOG.md` — `BACKLOG.md` is listed in the brief's implementation file set **and** its `land-scope` block. If the effect is `none`, the task makes no `BACKLOG.md` edit; a stale entry discovered along the way is recorded as a `[backlog]` lesson.

- **K2 — Worker execution contract.** Insert a new step immediately after
  ``10. Run full `npm run qa:offline`.``:

  > 10a. **Backlog reconciliation (mandatory).** Check the brief's Backlog row against the finished work. If the effect is `close` or `partial`, update `BACKLOG.md` in this task, and only: the affected entry's heading/status text, plus — when an entry closes — one line in DONE / HISTORY, in entry-number order, of the form ``**<n>** <title> — `work/<id>/` ``. Never edit the snapshot table, counts or unrelated entries. If the finished work's effect differs from the brief's Backlog row and `BACKLOG.md` is not in scope, that is **STOP-1**. If the effect is `none`, make no `BACKLOG.md` edit. Record the result in `review.md` (step 11).

- **K3 — Step 12 Class I definition.** Replace
  `(implementation, scope, security, correctness, or brief conflict)` with
  `(implementation, scope, security, correctness, brief conflict, or a missing or incorrect backlog reconciliation)`.

- **K4 — Lessons table.** In the `[backlog]` row, replace `now, under the standing finalization allowance below`
  with ``now, when `BACKLOG.md` is in the brief's scope (step 10a); otherwise recorded `— pending routing` ``.

- **K5 — the "Finalization allowance" section.**
  - Heading. Old: `## Finalization allowance`. New: `## Finalization and backlog reconciliation`.
  - Old (its first two paragraphs):
    > A task's final commit may include `work/<id>/review.md` and single-line `BACKLOG.md` additions/amendments for backlog items this task references. **`BACKLOG.md` is the single named exception to the brief-listing rule.** A task may make one-line additions or amendments to `BACKLOG.md` items it references, in its final commit, without `BACKLOG.md` appearing in `brief.md`. Every other unlisted file remains STOP-1.

    New:
    > A task's final commit includes `work/<id>/review.md` and — when the brief's Backlog row is `close` or `partial` — its `BACKLOG.md` reconciliation (step 10a). **There is no exception for `BACKLOG.md`:** like every other file, it may be edited only when the approved brief lists it, including in `land-scope`. Every other unlisted file remains STOP-1.
  - Old (its third paragraph):
    > An explicit "not in scope" exclusion in the approved brief overrides this allowance. Under such a brief a `[backlog]` lesson is recorded in `review.md` as `[backlog] <lesson text> — pending routing` and is not acted on by the task.

    New:
    > When `BACKLOG.md` is not in the brief's scope, a `[backlog]` lesson is recorded in `review.md` as `[backlog] <lesson text> — pending routing` and is not acted on by the task.
  - The section's last paragraph ("No standing allowance exists for `AGENTS.md` …") is unchanged.

- **K6 — the `review.md` definition (Task folder convention).** After
  `It holds pre-commit evidence only; the post-commit integrity check is LAND evidence (step 13).`, insert:

  > It always contains a `## Backlog reconciliation` section: the brief's Backlog row; the action taken (`closed`, `updated` or `none`); each affected entry's heading before → after; and a one-line confirmation that the new BACKLOG text matches the diff, the QA results and the work being landed.

- **K7 — Codex as diff reviewer.**
  - Replace ``plus any permitted `BACKLOG.md` change.`` with
    ``plus the task's `BACKLOG.md` reconciliation (step 10a), when the brief lists it.``
  - Replace ``(+ permitted `BACKLOG.md` one-liners)`` with
    ``(+ the step-10a `BACKLOG.md` reconciliation, when the brief lists it)``.
  - The implementation-diff definition (which excludes `BACKLOG.md`) is unchanged: the reconciliation is
    task evidence, reviewed in the step-12 task diff.

**Unchanged:**
- every other `AGENTS.md` line;
- `CLAUDE.md`, `BACKLOG.md`, the hook, `pt-land.js` and settings;
- the `LAND-EVIDENCE` format;
- R11 / R12 / R13 and all QA suites.

`pt-land.js` needs no change: it already refuses a diff outside `land-scope`, which now enforces C.

## 3. Implementation file set — exactly 2

```
AGENTS.md                            K1–K7 only
work/backlog-close-rule/review.md    NEW (contains its own ## Backlog reconciliation: "none")
```

There is no `land-scope` block on purpose: `AGENTS.md` is a protected path, so the Owner LANDs this task.

**QA suites that read in-scope files as text:** none read `AGENTS.md` beyond path strings
(`qa/auto_mode_hardening_offline.js` protected-write rows). `CLAUDE.md` is untouched, so its fingerprint is
unchanged.

## 4. QA

- Step 0: the `qa:offline` baseline.
- **Text checks** (a scratch script under `/tmp/pt-backlog-close-rule/`, deleted after use; results in
  `review.md`):
  - each K-new text is present exactly once;
  - each K-old text is absent;
  - `Finalization allowance` and `single named exception` no longer occur;
  - step numbering reads `10.` → `10a.` → `11.`;
  - CRLF is preserved;
  - `git diff --stat` shows only `AGENTS.md` (plus `review.md`).
- **Consistency check:** no remaining `AGENTS.md` sentence permits a `BACKLOG.md` edit outside the
  approved scope. Grep `BACKLOG` and list every hit in `review.md` with its verdict.
- `node qa/auto_mode_hardening_offline.js` and `node qa/instruction_layer_offline.js` PASS; full
  `qa:offline` at the Step-0 count.
- **Codex** read-only review, then the final check.
  - Focus: K-text exactness, no residual exception, no contradiction with steps 12–16 or R12 `land-scope`.
  - This task's own `## Backlog reconciliation` must read `none`.

## 5. Flow, STOP, Definition of Done

**Flow:** Manual.
1. Step 0;
2. `plan.md`;
3. K1–K7 one at a time;
4. QA;
5. Codex;
6. step 10a (`none`);
7. `review.md`;
8. the final check;
9. **STOP before commit (Owner instruction).** The Owner decides the commit; R12 tool LAND is not
   applicable to a protected path, so the Owner LANDs and pushes in a normal terminal.

**STOP:**
- STOP-1..6;
- any file other than §3;
- any wording beyond K1–K7;
- any `BACKLOG.md`, `CLAUDE.md`, hook, tool or settings change;
- any residual text allowing `BACKLOG.md` edits outside scope.

**Definition of Done:**
- K1–K7 exact;
- the text and consistency checks PASS;
- QA PASS at the baseline count;
- Codex: no unresolved Class I finding;
- `review.md` includes `## Backlog reconciliation: none`;
- STOP before commit.
