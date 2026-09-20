# Task brief: Domain Logic support in the Capability Breakdown

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Only then may implementation begin, per `AGENTS.md`
"Task folder convention".

## Baseline

| | |
|---|---|
| Worktree / branch | `pt-wt-domain-logic` · `task/domain-logic-breakdown` |
| `<base>` = `origin/branch-dev` | **`cec170f`** — tracked tree clean; `AGENTS.md` identical to `9d71dc1` |
| `origin/main` | `fbec2c1` — untouched by this task |
| `npm run qa:offline` | last recorded **PASS, 43 spawned suites** at `9d71dc1` (`work/catalyst-news-write/review.md`); `cec170f` added docs only; re-measured at step 0 |
| Source | Owner task text 2026-09-21 ("smallest workflow update proposed by FABLE"); Owner rulings C1–C5 2026-09-21 (below); worked example `work/catalyst-news/breakdown.md` (tracked at `cec170f`, read-only reference, not touched) |

## Objective

Make domain-heavy product logic reviewable inside the existing Capability Breakdown before a
Worker brief is frozen: a five-question trigger, a compact `## Domain logic` section with
numbered Owner rulings `DR-n`, and a gap rule that routes uncovered domain cases back to the
Breakdown instead of letting the Worker guess. No new stage, artifact type, approval gate, or
mandatory external-model review.

## Implementation scope — one file

```
AGENTS.md    modify — "Capability Breakdown (optional)" section only
```

**Out of scope, named explicitly:** `CLAUDE.md` · `.claude/**` · `.gitignore` · `qa/**` ·
`BACKLOG.md` · every product/runtime file · every Catalyst News file (`netlify/functions/**`,
`services/**`, `work/catalyst-news*/**`) · every other `AGENTS.md` section.

**`BACKLOG.md` is excluded from this task.** A `[backlog]` lesson is recorded in `review.md` as
`[backlog] <lesson text> — pending routing` and not acted on.

**`AGENTS.md` is ASK-tier and is listed here by path**, satisfying the brief-listing rule. The
Worker adopts the MANUAL posture for each edit to it (M5). `AGENTS.md` is LF in the index and
CRLF in the working copy under autocrlf; the edit must not change the committed EOL.

## Pre-approval compatibility sweep

| Check | Result |
|---|---|
| QA suites that read `AGENTS.md` as text | **none.** The only `AGENTS.md` hit in `qa/` is `qa/instruction_layer_offline.js:130`, an assertion about `CLAUDE.md`'s content |
| `AGENTS.md` in the fingerprint baseline | **no** — fingerprint pairing rule not triggered; `CLAUDE.md` untouched |
| QA suites that enumerate `work/` | **none** that assert on `work/domain-logic-breakdown/` |
| `require()`/import dependency on `AGENTS.md` | none — not a module |

**Expected QA delta: zero** — PASS at 43 suites before and after.

## The edits — all inside "Capability Breakdown (optional)"

Quoted text is the exact proposed wording. Line references are to `AGENTS.md` at `cec170f`
(identical to `9d71dc1`).

### E1 · Entry test (line 210–211) — one sentence appended *(C1)*

> **Not a mandatory stage.** The entry test is mechanical — can exact files expected to change,
> and testing coverage required, already be filled in? If yes, skip straight to a brief. **If the
> Domain logic trigger below fires, a Breakdown is required before the brief: testing coverage
> cannot be filled in honestly until the rulings it depends on exist, so the entry test fails.**

### E2 · Structure line (line 213–214) — one clause

> **Structure — six sections:** Outcome · Current/Change Map (mandatory whenever a Breakdown
> exists) · Decisions · Unknowns/Gaps · Split/Dependencies · Not in v1 — **plus `## Domain
> logic` when its trigger fires (below).**

### E3 · New block after the Current/Change Map paragraph (after line 220) *(C5)*

> **Domain logic — trigger.** Every Breakdown answers five questions. Does the capability:
>
> - create or change a user-visible category vocabulary;
> - create or change an inclusion rule — materiality, relevance, freshness, semantic dedup;
> - affect scoring, ranking, recommendations, or Actionable Take;
> - map external data into internal meaning;
> - define something competent domain readers could reasonably disagree on?
>
> Any YES → the Breakdown carries a `## Domain logic` section. All NO → the Breakdown **must**
> record this exact line in its place: `Domain logic: none, engineering-only`. Silence is not
> an answer.
>
> **`## Domain logic` — compact.** It holds: vocabulary and definitions · inclusion and boundary
> rules · overlap/precedence where two rules can both apply · numbered Owner rulings `DR-1`,
> `DR-2`, … · a positive and a negative or boundary example per ruling · and, for each ruling
> that is mechanically testable, the QA fixture or test it maps to. **A ruling that governs model
> or human judgment gets no invented fixture** — mark it `pilot` or `human review`; a unit
> fixture for a judgment rule is an over-claim, not coverage. Independent model challenge of the
> rulings is risk-based and Owner-directed, never required.

### E4 · Boundary table (line 230) — one cell *(C2)*

> `| dependencies | test IDs — except the Domain logic fixture mapping |`

### E5 · Readiness for a child brief (line 236–238) — one parenthetical

> · every Decision it depends on **(including every `DR-n` ruling)** has an Owner answer ·

### E6 · Three-artifacts table, Breakdown "Holds" cell (line 246) — one item

> system picture · uncertainty · Owner decisions · **domain rulings (`DR-n`)** · gaps · task
> split · dependencies · exclusions

### E7 · Size limits (line 257–259) — amended in place *(C3)*

> **Size limits:** map rows fixed at 9 (10 only if a genuinely new surface appears); whole
> breakdown ≤ 80 lines. **`## Domain logic` stays compact: narrative short, one row per ruling.
> Its `DR` table may extend past the 80-line limit when necessary; there is no other
> exemption.** Over that, materially — in the six sections or in Domain logic — reassess whether
> this is actually two capabilities.

### E8 · The gap rule (line 261–263) — extended in place *(C4)*

> **The gap rule:** if Worker `/plan` **or implementation** discovers that a surface recorded as
> `Change: none` must in fact change, **or meets a category, materiality, overlap, or other
> domain case the approved `DR-n` rulings do not cover,** that is a scope conflict, not a
> discovery to absorb — do not silently expand **and do not guess**; route back and update the
> Breakdown and the affected Brief, under **STOP-1**.

## Owner rulings, 2026-09-21

| # | Existing wording | Ruling | Applied as |
|---|---|---|---|
| C1 | "Not a mandatory stage" (l.210) | **ACCEPT E1.** Trigger fires ⇒ Breakdown required before the brief | E1 states it explicitly; "Not a mandatory stage" kept |
| C2 | Boundary table forbids "test IDs" (l.230) | **ACCEPT E4.** IDs allowed only inside the Domain logic mapping | E4 one-cell exception |
| C3 | "whole breakdown ≤ 80 lines" (l.258) | **AMEND E7.** No unlimited exemption; narrative short; DR table may exceed 80 when necessary; materially large ⇒ reassess split | E7 as above |
| C4 | Gap rule cites STOP-1 (l.263) | **KEEP STOP-1.** Uncovered domain case = scope/gap conflict, routes back to the Breakdown | E8 unchanged from proposal |
| C5 | Task text "may state" the none line | **REQUIRE** the explicit line `Domain logic: none, engineering-only` | E3 as above |

No open decisions remain.

## Explicitly preserved — no change

The five STOP conditions · the six M-transitions · the ASK tier and brief-listing rule · brief
approval, commit approval, LAND and SHIP gates · COWORK section (no mandatory external-model
review added) · Lessons tags incl. `[design]` → `breakdown.md` · Finalization allowance · the
nine fixed map rows · every `AGENTS.md` section other than "Capability Breakdown (optional)".

## Validation

1. `npm run qa:offline` → **PASS, 43 suites**, identical to the step-0 baseline.
2. `node qa/instruction_layer_offline.js` → PASS (mechanical proof `CLAUDE.md` is untouched).
3. Implementation diff → exactly one file: `git diff --stat cec170f -- . ':(exclude)work/'
   ':(exclude)BACKLOG.md'` lists `AGENTS.md` only; every hunk lies between the "## Capability
   Breakdown (optional)" and "## Lessons retention" headings.
4. `git ls-files --eol AGENTS.md` still reports `i/lf`.
5. Read-back: E1–E8 present exactly as worded above, as ruled under C1–C5; every item in
   "Explicitly preserved" present verbatim.

## STOP conditions

The five standing conditions, plus:

1. Any file other than `AGENTS.md` in the implementation diff, or any hunk outside the
   Capability Breakdown section.
2. A proposed wording that contradicts a preserved rule rather than refining it — return the pair.
3. `qa:offline` suite count differs from baseline in either direction.

## Definition of done

`AGENTS.md` changed and no other file in the implementation diff; all hunks inside the
Capability Breakdown section; E1–E8 present as ruled under C1–C5; `qa:offline` PASS at 43
suites, index EOL unchanged; `review.md` carries `## Lessons`, the two-row "Files changed"
block, and the final-check line. Nothing pushed, nothing deployed.
