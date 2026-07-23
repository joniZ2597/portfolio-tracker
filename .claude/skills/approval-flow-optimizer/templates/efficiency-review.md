# Efficiency Review — output template for `approval-flow-optimizer`

Produce the report in exactly these nine sections, in order. Advisory only — the
report proposes; it never authorizes. End with exactly one recommended next
boundary and one copy-ready, English-only prompt below 4000 characters.

## 1. Current position

- Project
- Slice
- Phase
- Current posture (gates, freezes, budgets, deadlines)
- Completed
- Remaining

## 2. Current approval path

A numbered list of the remaining boundaries as currently designed — one line
each, in order.

## 3. Safe optimizations under the current contract

For each optimization (bucket A):

- current steps
- proposed consolidation
- why it is safe (cite the rule in `optimization-rules.md`)
- approvals saved
- residual risk

## 4. Optimizations requiring a contract amendment

For each optimization (bucket B):

- proposed change
- exact contract rule affected
- benefit
- new risk
- recommended verdict (recommend-only; never self-adopted)

## 5. Boundaries that must remain separate

State the reason for every non-compressible boundary (bucket C).

## 6. Optimized path

A numbered sequence showing the shortest safe path currently available under the
current contract (bucket A applied; B and C left intact).

## 7. Efficiency delta

- current owner approval turns
- optimized owner approval turns
- turns saved
- estimated reduction percentage

## 8. Recommended next boundary

Exactly one next action.

## 9. Copy-ready prompt

One English-only prompt, preferably below 4000 characters, that the owner can
paste to trigger the recommended next boundary.

---

## Supporting table — current vs optimized boundaries

| # | Boundary | Category | Approval type | Keep / Merge / Move-earlier | Note |
|---|---|---|---|---|---|
|   |          |          |               |                             |      |

## Supporting table — risk and approval savings

| Consolidation | Approvals saved | Residual risk | Verdict |
|---|---|---|---|
|               |                 |               |         |

## Approval-turn counting note

Count only owner authorization decisions as approval turns. Do not count planning
responses, reports, or read-only assistant narration. State every counting
assumption used — for example: "a single owner GO covering the ratified
execute + capture + verify bundle counts as one turn"; "read-only boundaries
that need no owner authorization to proceed are excluded."
