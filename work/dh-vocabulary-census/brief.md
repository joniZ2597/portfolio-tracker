# Task brief: DH-M0a — Vocabulary census

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

| | |
|---|---|
| ARC / Slice | **DH** (BLOCKED at M0b) · **M0a** Vocabulary census |
| Preparation baseline | **`aa62aea`** = `branch-dev` |
| Last validated | `aa62aea`, 2026-09-24 |
| Branch / worktree | new `task/dh-vocabulary-census`, separate worktree |
| `qa:offline` | **no change** — no suite added, no assertion changed |
| Status | **PREPARED — READY FOR BRIEF COMMIT** → CODE-READY after the brief-only commit + §9 revalidation |

**Objective.** Produce the measured inventory that DH-M0b's ruling will be taken *from*.
**Census only. Read-only. It decides nothing.**

---

## 1 · Why this slice exists separately

DH-M0b must freeze **(a) authority ownership by data family** and **(b) one shared
vocabulary/mapping contract**. Neither can be ruled responsibly from a proposal — the earlier
three-term trio (Missing / Degraded / Failed) **omitted the two most-used state terms in the
codebase**, and would have become a fifth vocabulary rather than unifying four.

**M0a converts M0b from a judgement call into a choice over measured options.** It is the only DH
slice with no blocking dependency.

## 2 · Reality check at `aa62aea` — the starting measurement

Occurrences in `index.html`:

| Term | Count |
|---|---|
| `unavailable` / `Unavailable` | **84 + 23 = 107** |
| `STALE` / `Stale` | 27 + 34 = **61** |
| `MISSING` / `Missing` | 10 + 36 = **46** |
| `FAILED` / `Failed` | 8 + 16 = **24** |
| `DEGRADED` | **16** — *zero display-cased occurrences* |
| `insufficient` · `not covered` | 7 · 1 |

**Two live authorities, different units and different subjects:**

- **J7** — `netlify/functions/lib/evidence-freshness.js`, incl. `DEGRADED_NOTES` (`:105`)
- **`PF_*` family** — `PF_ATTENTION_STALE_MAX_DAYS`, `PF_CLOUD_STALE_MS`, `PF_FX_FRESH_MAX_AGE_DAYS`,
  `PF_FX_VALID_MAX_AGE_DAYS`, `PF_EOD_*_COOLDOWN_MS`

**A third vocabulary already exists inside the EOD packet** — `_eodReconciliationLimitationText`
emits *"stale — N day(s)"*, *"unavailable — Portfolio Total is incomplete"*, *"not recorded"*; and
`_p5BuildLocalContext` adds `reporting-incomplete` / `denominator-zero` /
`holding-ils-value-unavailable`, alongside `coverage: not-researched | zero-accepted | failed`.

**These counts are the starting point, not the deliverable.** The census must attribute each
occurrence to a call site and a data family — a raw count cannot distinguish a machine state from a
user-facing label.

## 3 · Scope

The census must inventory, per occurrence:

1. **the term**, and whether it is machine-cased or display-cased;
2. **the call site** — file and line;
3. **the data family** it describes (evidence · market/EOD · FX · portfolio/reporting · research
   coverage · reconciliation · sync);
4. **which authority owns that family today** — J7, `PF_*`, EOD-packet-local, or none;
5. **whether the term is user-visible, machine-internal, or both.**

**Deliverable: one tracked census artifact** (§5). Not code.

## 4 · Out of scope — hard boundaries

- **No DH-M0b decision.** The census names no winner, proposes no authority, selects no vocabulary.
- **No new vocabulary term** introduced anywhere.
- **No product semantic change.** No renderer touched, no threshold altered, no label changed.
- **No code change of any kind** — not even a comment.
- No EG-25D badge decision; no Amendment 2 implementation (that is DH-M1).

> **The temptation this slice must resist:** having measured four vocabularies, it is natural to
> propose the unified one. **That proposal is M0b and it is the Owner's.** A census that arrives
> with a recommendation attached has pre-empted the ruling it exists to inform.

## 5 · Expected implementation files — **2**

```
work/dh-vocabulary-census/census.md      NEW  the tracked inventory (the deliverable)
work/dh-vocabulary-census/review.md      NEW  tracked task artifact
```

**No product file. No QA file. Suite count unchanged.**

The census is **tracked**, not an `.ai-reports/` local artifact, because **DH-M0b's ruling and every
later consumer bind to it** — the same reasoning that made D-S3-1 tracked.

**Lane: neither.** It touches no `index.html` and no Lane-A file, so it is exempt from the
`index.html` serialization and can run alongside any other slice.

## 6 · QA boundary

**No QA changes.** The correctness bar is *completeness and accuracy of the inventory*, verified by
re-running the measurement:

| ID | Check |
|---|---|
| **C-1** | every occurrence of each term in `index.html` is accounted for — recount matches the census total exactly |
| **C-2** | every `PF_*` freshness/staleness constant is listed with its unit |
| **C-3** | every J7 state token is listed |
| **C-4** | the EOD-packet-local terms are listed |
| **C-5** | **no file outside `work/dh-vocabulary-census/` differs** — `git diff` over the rest of the tree is empty |

**C-5 is the load-bearing one:** it is the mechanical proof the census stayed read-only.

## 7 · STOP conditions

1. Any file beyond the two in §5.
2. **Any product or QA file modified** — C-5 must hold.
3. Any new vocabulary term introduced.
4. Any authority recommendation, ranking or preference recorded in the census.
5. Any renderer, threshold, label or semantic change.
6. Any DH-M0b, DH-M1, DH-M2 or DH-M3 work.
7. Any claim that a term is "wrong" — the census records what is, not what should be.

## 8 · Lifecycle / CLOSE and Actor-to-Evidence Closure Check

| closeCondition | Evidence | Phase | Actor | Authority | Possessable before CLOSE? |
|---|---|---|---|---|---|
| Inventory complete | C-1…C-4 recount | impl | Worker | read-only | **YES** |
| Census stayed read-only | C-5 `git diff` | impl | Worker | read | **YES** |
| No decision embedded | review of the census text | review | Codex / Owner | review | **NO — gate after CODE-READY** |
| LAND | approval | LAND | Owner | LAND | **NO — by design** |

**SATISFIABLE.** Entirely read-only, offline, no credential, no live call. **CLOSE is reachable the
same day it starts.**

## 9 · Execution dependencies and revalidation

**Blocking dependency: NONE.** This is the only DH slice that is genuinely unblocked, and the only
queued slice of any ARC that requires no Owner decision at all before execution.

**Downstream:** DH-M0b consumes this census; DH-M1/M2/M3 and every DH consumer (S3-M3, NC-M4
activation, NC-M6, CH, DR) depend on M0b, not on M0a directly.

**Revalidation trigger.** Re-run the §2 counts before execution; **any drift means the census scope
grew and the brief's §2 baseline must be updated**. Re-run whenever `branch-dev` moves.

## 10 · Definition of done

`work/dh-vocabulary-census/census.md` exists and attributes every state-term occurrence to a call
site, data family, owning authority and visibility class; C-1…C-5 pass; **no file outside the task
folder differs**; `review.md` carries `## Lessons`, the files-changed block and the final-check line.

**Not claimed:** any unified vocabulary. **M0a measures; M0b decides.**
