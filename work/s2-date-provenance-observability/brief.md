# Task brief: S2-M2 — Date provenance observability (A3a)

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

| | |
|---|---|
| ARC / Slice | **S2** (ACTIVE) · **M2** Date provenance observability |
| Preparation baseline | **`aa62aea`** = `branch-dev` |
| Last validated | `aa62aea`, 2026-09-24 |
| Branch / worktree | new `task/s2-date-provenance-observability`, separate worktree |
| `qa:offline` | **no change** — no suite added |
| Status | **PREPARED — READY FOR BRIEF COMMIT** → CODE-READY after the brief-only commit + §10 revalidation |

**Objective.** Measure and classify, for every surviving catalyst, how its `eventDate` relates to the
date on the evidence entry it bound to. **Observation only. Nothing is rejected.**

---

## 1 · Owner rulings carried in (ratified 2026-09-24)

**O-4 — A3a and A3b remain separate.**

- **A3a (this slice):** observability / measurement only · **no enforcement** · **no survivor
  change** · **no persisted reader-visible shape change**.
- **A3b:** conditional enforcement only · may be considered later **using measured A3a evidence** ·
  **requires its own Owner-approved rule / truth manifest before implementation**.

**O-5 — `upcoming_event` is excluded** from the eventDate-vs-evidence-date comparison.

> **Why O-5 is load-bearing, not a detail.** For an `upcoming_event` the source legitimately
> *predates* the event — that is what announcing a future event means. Measured over all 37 corpus
> survivors, including upcoming events produces **8 "differences" and 6 "evidence earlier" cases**;
> restricted to the 31 catalysts it is **3 and 1**. Including them would manufacture violations and
> corrupt the very evidence A3b would later be ruled from.

**A3b enforcement must not be pulled into this slice.**

## 2 · Reality check at `aa62aea`

| Input | State |
|---|---|
| A2 `evidenceBindings` | landed at `52c322b` — `{itemIndex, evidenceIndex, evidenceKind, normalizedSourceUrl}` per surviving item, plus `evidenceSetSize` |
| Bound-entry metadata | `appendEvidenceEntry` retains `date` and `lastUpdated` when present — **currently read by no decision anywhere** |
| Replay corpus | 9 fixtures, byte-pinned; 37 survivors, **31 catalysts + 6 upcoming_event** |
| Measured baseline (catalysts only) | **26 equal · 3 differ · 2 no evidence date**; of the 3, **1 has evidence EARLIER** than `eventDate` |
| `fetch_url_result` date coverage | **0 / 10** — the richer entry kind carries no date at all; `search_result` is 333/411 |

**Conclusion: the measurement is fully determined by the pinned corpus.** No live call, no new data
source.

## 3 · Scope

Classify each surviving **catalyst** by the relation between `eventDate` and the bound evidence
entry's `date`: **equal · evidence-later · evidence-earlier · no-evidence-date**.

**Where the classification lives.** Extend the **A2 sidecar** — the `evidenceBindings` structure on
the provider envelope — exactly as A2 did. **This is the proven-safe seam**: core builds stored
records only from the 17 `ITEM_FIELDS` + `sourceTier` + `contractVersion`, and **never stringifies an
envelope wholesale**, so a sidecar field cannot reach persistence.

**Definition:** the comparison uses the bound entry's `date` only. `lastUpdated` is **not** a
publication date and must not be substituted — the P-5 sourcing validator already rules that
explicitly.

## 4 · Out of scope

- **Any rejection, filter or survivor change.** Zero.
- **Any persisted reader-visible field.** The 17+2 record is untouched; **D-S3-1 does not reopen.**
- **A3b rule creation**, any date-truth manifest, any enforcement threshold.
- Any `upcoming_event` comparison (O-5).
- Any use of `lastUpdated` as a date source.
- Any traversal-order change (D-A2-3 stands: do not reorder toward `fetch_url_result`, which carries
  **no dates at all**).
- Any Lane B file; any S3-M1 file.

## 5 · Expected implementation files — **4**

```
netlify/functions/lib/news-catalysts-provider.js            date-provenance classification on the A2 sidecar
qa/news_catalysts_provider_offline.js                       synthetic classification cases
qa/news_catalysts_replay_offline.js                         corpus-wide measurement assertions
work/s2-date-provenance-observability/review.md             NEW  tracked task artifact
```

**Fixture impact: expected NONE.** The classification is a sidecar field, and the replay suite
asserts it as a **derived invariant**, not a pinned snapshot — the same design that let A2 land with
**zero fixture change**. **Any `fixtureSha256` movement is a STOP** (§7.3).

**Not touched:** `news-catalysts-core.js` · `news-catalysts.mjs` · `evidence-contract.js` ·
`qa/run-offline.js` · `qa/fixtures/replay/**` · `index.html`.

**Lane: A.** Serialize after S2-M1 — both edit `news-catalysts-provider.js` and both edit the two
S2 QA suites.

## 6 · QA boundary

| ID | Class | Assertion |
|---|---|---|
| **DP-1** | INVARIANT | every surviving **catalyst** carries exactly one classification; every **`upcoming_event` carries none** (O-5) |
| **DP-2** | INVARIANT | classification is one of the four defined values; derivable from the bound entry alone |
| **DP-3** | INVARIANT | **`items[]` and `skippedItems[]` byte-identical to the baseline in all 9 cases** — zero survival change |
| **DP-4** | INVARIANT | **all 9 `fixtureSha256` values unchanged** |
| **DP-5** | INVARIANT | replaying a case twice yields identical classifications |
| **DP-6** | SNAPSHOT | the corpus totals are reported (baseline: 26 / 3 / 2 over 31 catalysts) — **labelled SNAPSHOT, never presented as a rule** |
| **DP-7** | SYNTHETIC | `lastUpdated` present and `date` absent ⇒ classified **no-evidence-date**, never substituted |
| **DP-8** | NEGATIVE | no `pt_*`, no store write, no persisted field added |

**DP-3 and DP-4 are load-bearing:** together they are the mechanical proof that A3a observed without
enforcing.

## 7 · STOP conditions

1. Any file beyond the four in §5, or `review.md` absent from the implementation commit.
2. **Any change to `items[]` or `skippedItems[]` in any fixture.**
3. **Any `fixtureSha256` change.**
4. Any persisted field added, removed or changed; any `ITEM_FIELDS` or `projectItemRecord` edit.
5. Any rejection, filter, threshold or survivor change of any kind.
6. Any `upcoming_event` included in the comparison.
7. Any use of `lastUpdated` as a date.
8. Any A3b rule, manifest or enforcement scaffolding.
9. Any traversal-order change.
10. Any identity, `IDENTITY_SCHEMA_VERSION` or `identityHash` change.
11. Any core, route or `evidence-contract` change.
12. Any Lane B file; any S3-M1 file; any live call.
13. Any suite added or removed.

## 8 · Lifecycle / CLOSE

**Reachable and satisfiable offline.** Required at LAND, reported separately: `npm run qa:offline`
at its then-current count · the targeted **provider** suite (denylisted from `qa:offline`) · the
**replay** suite · the **core** suite proving core untouched.

## 9 · Actor-to-Evidence Closure Check

| closeCondition | Evidence | Phase | Actor | Authority | Possessable before CLOSE? |
|---|---|---|---|---|---|
| Every catalyst classified, no upcoming_event | DP-1, DP-2 | impl | Worker | none | **YES** |
| **Zero survival change** | DP-3 vs tracked baseline | impl | Worker | read | **YES** |
| **Zero fixture movement** | DP-4 | impl | Worker | read | **YES** |
| Determinism | DP-5 | impl | Worker | none | **YES** |
| No persistence reached | DP-8 + diff | impl | Worker | none | **YES** |
| `qa:offline` PASS | gate run | pre-LAND | Worker | none | **YES** |
| Diff minimal | reviewed diff | review | Codex / Owner | review | NO — gate after CODE-READY |
| LAND | approval | LAND | Owner | LAND | NO — by design |

**SATISFIABLE.** No acceptance criterion requires a live run or production telemetry — the
measurement is fully determined by the pinned corpus. **No criterion asserts that the measured
distribution is good or bad**; that judgement belongs to A3b.

## 10 · Execution dependencies and revalidation

**Semantic blockers: CLOSED** by O-4 and O-5.

**Execution dependency: serialize after S2-M1** — both slices edit
`news-catalysts-provider.js`, `qa/news_catalysts_provider_offline.js` and
`qa/news_catalysts_replay_offline.js`. **This is a file-level conflict, not a semantic one**; M2 does
not depend on M1's outcome.

**Revalidation trigger.** After S2-M1 lands: re-verify the A2 sidecar shape is unchanged · the 9
`fixtureSha256` values · the §2 baseline distribution (26/3/2 over 31 catalysts) · `SKIP_REASONS` is
13 and the two emit sites are distinct. **Any drift in the baseline distribution updates §2 before
execution.**

## 11 · Definition of done

Every surviving catalyst carries a date-provenance classification on the A2 sidecar; no
`upcoming_event` does; **`items[]`, `skippedItems[]` and all 9 `fixtureSha256` values are unchanged**;
DP-1…DP-8 pass; the four runs in §8 are reported; `review.md` carries `## Lessons`, the four-row
files-changed block, the measured distribution and the final-check line.

**Not claimed:** that any date is wrong, or that any rule should follow. **A3a measures; A3b — if it
ever happens — decides, under its own Owner-approved rule.**
