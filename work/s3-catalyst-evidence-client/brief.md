# Task brief: S3-M2 — Client adapter

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

| | |
|---|---|
| ARC / Slice | **S3** (PLAN-READY) · **M2** Client adapter |
| Preparation baseline | **`aa62aea`** = `branch-dev` |
| Last validated | `aa62aea`, 2026-09-24 |
| Branch / worktree | new `task/s3-catalyst-evidence-client`, separate worktree |
| `qa:offline` | **+1 suite** — exact post-S3-M1 count confirmed at revalidation |
| Status | **PREPARED-WAITING** — see §9 |

**Objective.** A client adapter that calls `news-catalysts-read` and returns validated catalyst
records to the UI. **Validation only — it re-derives nothing.**

---

## 1 · Blocking dependency — stated plainly

**S3-M1 must land first.** The route this adapter calls **does not exist**: at `aa62aea`,
`netlify/functions/news-catalysts-read.mjs` and `netlify/functions/lib/news-catalysts-read-core.js`
are both absent.

**This brief is written against two sources, and their evidentiary weight differs:**

| Source | Weight |
|---|---|
| **`work/s3-catalyst-evidence-surface/D-S3-1-reader-contract.md`** — the frozen 17+2 reader contract | **Authoritative.** Frozen, tracked, independent of S3-M1's implementation |
| **`work/s3-catalyst-evidence-surface/brief.md`** — the *planned* S3-M1 route contract | **Planned, not evidence.** Status vocabulary, window semantics and response shape are what the brief *specifies*, not what any code does |

**The unlanded route implementation is not treated as evidence anywhere in this brief.**

## 2 · Reality check at `aa62aea`

| Component | State |
|---|---|
| `news-catalysts-read` route | **absent** — S3-M1 |
| `services/news-catalysts-client.js` | **absent** — this slice |
| **Adapter precedent** | `services/fund-facts-read-client.js` — **577 lines**, a full validator: `_ffrValidOkEnvelope`, `_ffrValidErrorEnvelope`, `_ffrHasExactKeys`, `_ffrForbiddenFieldsAbsent`, `_ffrResult(kind,status,reason,ticker,envelope)` |
| Its QA | `qa/fund_facts_read_client_test.js` — **44** assertions |
| Sibling adapters | `research-evidence-client.js` · `sec-evidence-store-client.js` |

**Conclusion: the pattern is mature and should be mirrored, not invented.** In particular
`_ffrHasExactKeys` and `_ffrForbiddenFieldsAbsent` are the precedent for "exactly the frozen fields,
nothing else" — which is D-S3-1's §6 conformance rule expressed in client code.

## 3 · Scope

- `services/news-catalysts-client.js` — request construction, response validation against **D-S3-1**,
  and a normalized result envelope in the `_ffrResult` shape.
- Validate **exactly the 19 frozen fields**, in persisted order; reject unknown keys.
- Surface the route's status vocabulary **without collapsing it** — `DEGRADED` must never be
  presented as "no records".
- One offline suite.

## 4 · Out of scope

Any UI rendering (that is M3) · any state wording — **M3 binds to the DH shared mapping contract, M2
does not author one** · any re-derivation of grounding, identity, normalization or skip logic · any
write path · any `skippedItems` handling (outside D-S3-1) · any activation or gate flip · any
ticker-specific behaviour.

## 5 · Expected implementation files — **3**

```
services/news-catalysts-client.js                     NEW  adapter + validator
qa/news_catalysts_client_test.js                      NEW  offline suite (+1)
work/s3-catalyst-evidence-client/review.md            NEW  tracked task artifact
```

**`qa/run-offline.js` is NOT pre-authorized.** Suites are auto-discovered by `OFFLINE_SUITE_RE`. If
implementation proves registration is required, **STOP and return the evidence for an Owner ruling**
(§7.9).

**Suite count:** +1 from the post-S3-M1 baseline. **Exact numbers are confirmed at revalidation, not
asserted now** — S3-M1 itself moves the count to 45.

**Lane:** neither A nor B — `services/` and a new `qa/` file only. No `index.html`, no S2 file.

## 6 · QA boundary

| ID | Assertion |
|---|---|
| **CL-1** | happy path ⇒ exactly the 19 frozen fields per record, in persisted order |
| **CL-2** | a record with an **absent** key ⇒ rejected as unreadable, **never treated as null** (D-S3-1 §1) |
| **CL-3** | `contractVersion` mismatch ⇒ record rejected before any other field is interpreted |
| **CL-4** | conditional-null rules enforced: `direction` null iff `upcoming_event`; `subType` non-empty iff `other_catalyst` |
| **CL-5** | **`subType` is treated as opaque text** — no branch on its value (D-S3-1 §C-1) |
| **CL-6** | unknown response key ⇒ rejected, not ignored |
| **CL-7** | **`DEGRADED` surfaces as degraded — never as an empty success or `NOT_AVAILABLE`** |
| **CL-8** | `NOT_AVAILABLE`/`NO_RECORD` surfaces distinctly from `DEGRADED` |
| **CL-9** | negative — no write, no `pt_*` key, no storage access |
| **CL-10** | negative — no `skippedItems` consumption |

**CL-7 is load-bearing:** collapsing `DEGRADED` into emptiness is the data-honesty failure the route
was designed to prevent, and the adapter is the second place it can be undone.

## 7 · STOP conditions

1. Any file beyond the three in §5, or `review.md` absent from the implementation commit.
2. **Any S3-M1 file** — `news-catalysts-read.mjs`, `lib/news-catalysts-read-core.js`,
   `qa/news_catalysts_read_offline.js`, `work/s3-catalyst-evidence-surface/**`.
3. **Any S2 file** — provider, core, route, `qa/news_catalysts_{provider,core,replay}_offline.js`,
   `qa/fixtures/replay/**`.
4. Any `index.html` change — rendering is M3.
5. Any write path, storage access or `pt_*` key.
6. Any re-derivation of grounding, identity, normalization or skip logic.
7. Any branch on `subType` value; any field consumed outside the 19.
8. Any `DEGRADED` presented as empty or absent data.
9. **Any edit to `qa/run-offline.js`** — STOP and return evidence instead.
10. Any state wording authored here; any activation or gate change; any live call.

## 8 · Lifecycle / CLOSE and Actor-to-Evidence Closure Check

| closeCondition | Evidence | Phase | Actor | Authority | Possessable before CLOSE? |
|---|---|---|---|---|---|
| Returns only the 19 frozen fields | CL-1, CL-6 | impl | Worker | none | **YES** |
| Conformance to D-S3-1 | diff against the **tracked** contract | impl | Worker | read | **YES** |
| Status vocabulary not collapsed | CL-7, CL-8 | impl | Worker | none | **YES** |
| No write path | CL-9 + diff | impl | Worker | none | **YES** |
| `qa:offline` PASS at the confirmed count | gate run | pre-LAND | Worker | none | **YES** |
| **Route interface matches the §1 planned contract** | S3-M1's landed code | **pre-impl** | **Worker, after S3-M1 lands** | read | **NO before S3-M1 lands — this is the blocking dependency** |
| Diff minimal | reviewed diff | review | Codex / Owner | review | NO — gate after CODE-READY |
| LAND | approval | LAND | Owner | LAND | NO — by design |

**Closure is SATISFIABLE only after S3-M1 lands.** The route-interface row is exactly why this slice
is PREPARED-WAITING rather than CODE-READY: the Worker cannot possess that evidence today.

The adapter's own QA needs **no live route and no seeded store** — responses are stubbed.

## 9 · Revalidation trigger and promotion

**Trigger: after S3-M1 LAND.** Compare the **actual** landed route interface against the §1 planned
assumptions:

1. status vocabulary — `DISABLED` · `UNAUTHORIZED` · `CONFIGURATION_MISSING` · `INVALID_TICKER` ·
   `NOT_AVAILABLE`/`NO_RECORD` · `DEGRADED` (`STORE_UNAVAILABLE`, `STORE_RECORD_INVALID`);
2. response envelope shape and record array key;
3. the 31-partition window and missing-day semantics as observable from the response;
4. request shape — ticker + injected instant;
5. the read gate name.

**If the interface matches: promote by delta revalidation only** — confirm the five points, confirm
the suite count, and this brief stands unchanged.

**If it differs: update only the affected sections** (§1 table, §6 CL-7/CL-8, §3). **Do not rewrite
the brief**, and do not widen scope on the strength of an interface change.

**Also re-confirm at that point:** D-S3-1 unchanged (A3b has not reopened it) · the exact post-S3-M1
suite count · `qa/run-offline.js` still auto-discovering.

## 10 · Definition of done

`services/news-catalysts-client.js` validates responses strictly against D-S3-1, returns exactly the
19 frozen fields in order, surfaces the full status vocabulary without collapsing `DEGRADED`, and
performs no write; CL-1…CL-10 pass; `qa:offline` green at the confirmed count; `review.md` carries
`## Lessons`, the three-row files-changed block and the final-check line.

**Not claimed:** that any catalyst is visible to a user. **M2 is the adapter; the card is M3, and
activation remains Activation Register work.**
