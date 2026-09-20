# Task brief: workflow rule adoption (first-two-tasks advisory)

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Only then may implementation begin, per `AGENTS.md`
"Task folder convention".

## Baseline

| | |
|---|---|
| `branch-dev` = `origin/branch-dev` | **`3ba80c1`** — in sync, tracked tree clean |
| `origin/main` | `fbec2c1` |
| `npm run qa:offline` | **PASS** — 42 effective suites (11 denylisted) |
| Source advisory | `.ai-reports/status/first-two-tasks-workflow-comparison.ADVISORY.local.md` (local-only, git-excluded) |

## Objective

Adopt the advisory's seven rule changes into `AGENTS.md`, normalized to the smallest coherent
edit. Every change removes a loop that actually occurred in `work/quarantine-arc-qa` or
`work/remove-unused-history-service`; none weakens an Owner boundary.

## Implementation scope — one file

```
AGENTS.md    modify
```

**Out of scope, named explicitly:** `CLAUDE.md` · `.claude/settings.json` · `.claude/rules/**` ·
`.gitignore` · `qa/**` · any product or runtime file · `BACKLOG.md` · any brief template file.

**`BACKLOG.md` is excluded from this task.** Under the precedence rule this brief itself
installs, a `[backlog]` lesson from this task is recorded in `review.md` as
`[backlog] — pending routing` and is **not** acted on.

**`AGENTS.md` is ASK-tier and is listed here by path**, satisfying the brief-listing rule. The
Worker adopts the MANUAL posture for each edit to it (M5).

## Pre-approval compatibility sweep

*(This row is itself change 7; it is applied to this task.)*

| Check | Result |
|---|---|
| QA suites that **read `AGENTS.md` as text** | **none.** The single `AGENTS.md` occurrence in `qa/` is `qa/instruction_layer_offline.js:130`, `claudeMd.indexOf('AGENTS.md') !== -1` — an assertion about **`CLAUDE.md`'s** content, not about `AGENTS.md`. Editing `AGENTS.md` cannot move it |
| `AGENTS.md` in the fingerprint baseline | **no.** `FINGERPRINTS` pins `CLAUDE.md`, `portfolio-skill-router/SKILL.md`, `optimization-rules.md` only |
| Fingerprint pairing rule triggered | **no** — `CLAUDE.md` is untouched |
| QA suites that read `work/**` as text | **none.** Every `work/` hit in `qa/` is prose inside a comment |
| `require()`/import dependency on `AGENTS.md` | **none** — it is not a module |

**Expected QA delta: zero.** `qa:offline` must be PASS before and after, with the same suite count.

## The seven changes, by `AGENTS.md` section

### 1 · Worktree bootstrap — "Worker execution contract" + "Simplified worktree model"

New **step 0** before step 1:

> **0. Worktree bootstrap — automatic, pre-authorized.** Confirm the session's cwd is the task
> worktree on the task branch. If `node_modules/` is missing or older than `package-lock.json`,
> run `npm ci` (it touches only the gitignored `node_modules/`). Then run `npm run qa:offline`
> once, before any edit, and record the result and suite count on the first line of
> `work/<id>/qa.log` as the pre-edit baseline every Definition of Done is measured against. A red
> pre-edit baseline is an **M4** transition (diagnose first), not a STOP. A harness permission
> prompt for any of these steps is answered under this authorization; it is not an Owner decision.

One sentence added to "Simplified worktree model": a new worktree has no `node_modules/`; step 0
handles it.

*Removes: the `npm ci` governance decision (recurred verbatim in both tasks) and the
"baseline is red" STOP. Makes every DoD measurable.*

### 2 · Two diffs — "Codex as diff reviewer" + the `review.md` bullet

Under **"Codex as diff reviewer"**, a "Two diffs" paragraph:

> **Implementation diff** — `git diff <base>...HEAD -- . ':(exclude)work/' ':(exclude)BACKLOG.md'`,
> where `<base>` is the `branch-dev` commit named in the brief. Every "Implementation scope" and
> "Definition of done" statement, and the implementation Codex review, refer to this diff.
> **Task diff** — the whole branch, `git diff <base>...HEAD`; the final Codex check, the commit
> request and the LAND request refer to that. A brief never needs to name its own `brief.md` or
> `review.md` in its implementation scope — they are evidence, outside the implementation diff by
> definition. **This changes no permission:** `work/*/brief.md` remains ASK-tier and the
> brief-listing rule is unchanged. A task is two commits: the brief-only commit, then
> implementation + `review.md` (+ permitted `BACKLOG.md` one-liners).

In the **`review.md`** bullet under "Task folder convention", the fixed two-row shape:

> ```
> ## Files changed
> - Implementation (N): <paths>     ← must equal the brief's Implementation scope
> - Evidence (tracked): work/<id>/brief.md, work/<id>/review.md
> ```

*Removes: both "exactly N files" incidents and the review prose written to explain them.*

### 3 · Step 12 — class I / class II

Replace step 12's second sentence:

> Classify every finding before editing.
> - **Class I** (implementation, scope, security, correctness, or brief conflict): FIX / DEFER /
>   REJECT as above. A FIX to an implementation file re-runs the relevant QA and gets one more
>   Codex pass scoped to the changed hunks. **This is the only path to a second Codex run.**
> - **Class II** (documentation-only, in `review.md`): fix, then self-check — every `work/<id>/`
>   path named exists and is one of the five canonical files; every count matches a line in
>   `qa.log`; no section reads "Pending" or "TBD" — and record one line in `review.md`:
>   `Final check: N rounds, M class-II findings fixed, self-checked; no implementation change, no
>   QA re-run.` **No further Codex.**
>
> A class-II fix that changes a claim about the implementation — a DoD tick flips, a file count
> changes, a finding is reclassified — is class I by definition.

*Removes: task 1's second final-Codex round and task 2's three corrective rounds. Caps the final
phase at ≤2 Codex rounds and names the terminator. Across both tasks the final check produced 13
documentation findings and 0 implementation findings.*

### 4 · Brief exclusion beats the allowance — "Finalization allowance"

One sentence:

> An explicit "not in scope" exclusion in the approved brief overrides this allowance. Under such
> a brief a `[backlog]` lesson is recorded in `review.md` as `[backlog] — pending routing` and is
> not acted on by the task.

### 5 · Pre-M2 mechanical check — the **M2** row

Prepend to M2's "What the Worker does":

> Before the first implementation edit, confirm `work/<id>/brief.md` is tracked
> (`git ls-files work/<id>/brief.md` non-empty) and unmodified (`git status --short
> work/<id>/brief.md` empty). An Owner message saying "proceed" does not replace the brief-only
> commit; only the commit does.

**Normalization:** the *principle* already exists verbatim in "Task folder convention"
("An uncommitted or merely staged brief does not authorize implementation"). **Only the two
mechanical commands are added; the principle is not restated.**

### 6 · Closed five-file set — "Task folder convention" + the `codex.md` bullet

Tighten the existing sentence to state the set is **closed**: no sixth evidence file, and no
name variants — no `codex-final.md`, no `qa-post-edit.log`. Add to the `codex.md` bullet:

> The final Codex check's raw output is appended to `codex.md` under `## Final check`.

**Normalization:** the existing sentence "These five files are evidence and scope" is edited in
place rather than joined by a new rule.

### 7 · Brief PREP row — "Task brief convention"

One row added to what a brief states before approval:

> **QA suites that read in-scope files as text:** `<list or none>`, and whether their assertions
> survive. *(Dependency sweeps that check only `require()`/import miss this class — a suite can
> read a file it never imports.)*

*Moves a task-1-style contract conflict from mid-task to pre-approval.*

## One normalization that departs from the advisory's placement

The advisory puts the "a wording gap is not STOP-2" clarifier inside step 12. **This brief puts
it in STOP condition 2 instead** — the single place STOP-2 is defined — so it is stated once and
inherited everywhere, including M6:

> A brief whose *wording* mis-measures a condition the implementation plainly meets is not this
> condition. Record the reading used and continue; the Owner sees it at commit approval. STOP-2 is
> reserved for a brief whose **intent** cannot be met.

*One sentence, one site, instead of the same rule in two.*

## Explicitly preserved — no change

Brief approval gate · implementation commit approval · LAND approval · PUSH / protected actions ·
all five STOP conditions (condition 2 is **clarified in scope, not narrowed in force**) ·
the ASK tier and the brief-listing rule · `qa/run-offline.js` ASK-tier · Codex on the
implementation diff · `qa:offline` at LAND · the Lessons section and one tag per lesson ·
the six M-transitions · the fingerprint pairing rule.

## Validation

1. `npm run qa:offline` → **PASS, 42 effective suites** — identical to the pre-edit baseline.
   A delta of any size is a finding, not a warning.
2. `node qa/instruction_layer_offline.js` → PASS. Confirms no `CLAUDE.md` anchor or fingerprint
   moved, which is the mechanical proof `CLAUDE.md` was not touched.
3. Implementation diff → **exactly one file**, `AGENTS.md`:
   `git diff --stat 3ba80c1...HEAD -- . ':(exclude)work/' ':(exclude)BACKLOG.md'`
4. Read-back of `AGENTS.md`: all seven changes present; each of the twelve preserved items in the
   list above still present verbatim.
5. Self-consistency: this task's own `review.md` uses the two-row "Files changed" shape and the
   class I / class II final-check line — **it is the first artifact written under the rules it
   installs, and therefore their first test.**

## STOP conditions

The five standing conditions, plus these task-specific instances:

1. Any file other than `AGENTS.md` in the implementation diff.
2. A proposed wording that **contradicts** a preserved rule rather than refining it — return the
   pair.
3. `qa:offline` suite count differs from the baseline in either direction.
4. Any change that would require editing `CLAUDE.md`, a QA suite, or a brief template — **that is
   evidence a recommendation does not fit one file**, and is STOP-1.

## Definition of done

`AGENTS.md` changed, and no other file in the implementation diff. All seven changes present in
their mapped sections, with changes 5 and 6 normalized as in-place edits rather than added rules,
and the STOP-2 clarifier in STOP condition 2 rather than step 12. `qa:offline` PASS at 42 suites,
unchanged from baseline. `instruction_layer_offline` PASS. `review.md` carries a `## Lessons`
section, the two-row "Files changed" block, and the final-check line.
