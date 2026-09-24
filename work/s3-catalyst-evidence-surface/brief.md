# Task brief: S3-M1 — `news-catalysts-read`

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

| | |
|---|---|
| ARC / Slice | **S3** (PLAN-READY) · **M1** Read route |
| Base | **`aa62aea`** = `branch-dev` |
| Branch / worktree | new `task/s3-catalyst-evidence-read`, separate worktree |
| `qa:offline` | **44 → 45** — this slice adds one suite |
| Reader contract | **`work/s3-catalyst-evidence-surface/D-S3-1-reader-contract.md`** (frozen, same commit) |
| Status | **PREPARED — READY FOR BRIEF COMMIT.** Promotes to execution CODE-READY only after the Owner-approved brief-only commit exists locally **and** a short baseline revalidation passes (§14) |

**Objective.** A gated, fail-closed server route that returns stored catalyst evidence for one
ticker over a fixed bounded window, returning **only** the frozen 19 fields.

---

## 1 · Design — mirror the precedent, do not re-invent

`fund-facts-read` is the governing precedent: an 8-line `.mjs` runtime entry delegating to a core
handler that owns every decision.

```
netlify/functions/news-catalysts-read.mjs            runtime entry; route = file base name
netlify/functions/lib/news-catalysts-read-core.js    all logic
```

**Ordered decision chain**, in shape from `fund-facts-read-core.js:256-320`:
CORS preflight → **server gate** → method allowlist → token/allowlist preflight → body parse →
store read → response.

---

## 2 · Read window — fixed 31 UTC calendar partitions

**Ruled 2026-09-24.**

- **D0** = the UTC calendar date of the **explicit injected instant**.
- Read **D0 and the previous 30 UTC calendar dates** — `ageDays 0..30`.
- **Maximum 31 daily index partitions.** No caller-supplied range in v1. No unbounded scan.

**Alignment, recorded deliberately:** this matches the existing J7 news/catalysts boundary —
**ageDay 30 = aging, ageDay 31 = stale**. The window stops exactly where evidence becomes stale, so
the route never returns records J7 would classify as stale.

**Clock.** The instant is injected by the caller, mirroring the write side's `acquireNowIso(event)`
(`news-catalysts-core.js:183`). **No wall-clock read anywhere** — replay determinism depends on it.

---

## 3 · Missing-day semantics — normal absence, never fatal

**Ruled 2026-09-24.**

- A **missing daily index** inside the 31-partition window is **normal absence for that day**.
- It **MUST NOT terminate the read.** Iteration continues across the remaining partitions.
- **`NOT_AVAILABLE` / `NO_RECORD` is returned only when the completed bounded window contains no
  usable catalyst record** — i.e. after all 31 partitions have been attempted.
- **Store failure and malformed stored evidence remain fail-visible** per §5 — they are never
  silently folded into "normal absence".

> This distinction is the slice's main correctness risk. An implementation that returns
> `NOT_AVAILABLE` on the first missing day would look correct against a freshly-seeded store and be
> wrong in production, where gaps are ordinary. **It is pinned in QA (§7, R-4 / R-5).**

---

## 4 · Persisted source and key lookup

| | |
|---|---|
| Item record key | `^fundstore:v1:news:[A-Z]{1,10}:\d{4}-\d{2}-\d{2}:[a-f0-9]{64}$` (`NEWS_KEY_RE`, provider `:76`) |
| Day index key | `fundstore:v1:news-index:<TICKER>:<YYYY-MM-DD>` |
| Index record | `{ ticker, fetchedAt, sourceTier, contractVersion, provider, keys[] }` |
| Store | `fund-facts-store`, **strong-consistency reads** (`{ consistency: 'strong' }`) |

**Flow:** resolve the 31 partition keys → read each index → read the item keys each index lists →
validate each record against D-S3-1 → return.

**Index-driven only.** Never a store scan; never a key constructed from a guessed hash.

---

## 5 · Validation, response and fail-closed behaviour

**Request validation.** Ticker `^[A-Z]{1,10}$` · the injected instant must match the strict UTC-Z
grammar the write side already requires · unknown body keys are rejected, not ignored.

**Returned fields.** **Exactly the 19 frozen fields per record, in persisted order. Nothing else.**
No `skippedItems`, no `evidenceBindings`, no `evidenceSetSize`, no envelope internals, no raw
provider response.

**Non-conforming record** — any missing key, `contractVersion` mismatch, or violated conditional-null
rule — is **omitted and counted, never partially returned and never repaired**.

**Status vocabulary**, reused verbatim from the precedent: `DISABLED` · `UNAUTHORIZED` ·
`CONFIGURATION_MISSING` · `INVALID_TICKER` · `NOT_AVAILABLE`/`NO_RECORD` · `DEGRADED`
(`STORE_UNAVAILABLE`, `STORE_RECORD_INVALID`).

> **Store unavailable or record invalid yields `DEGRADED`, never an empty success.** An empty 200
> reads to the client as "no catalysts", which is the data-honesty failure class DH exists to
> prevent.

---

## 6 · Gate

New server gate **`PT_ENABLE_NEWS_CATALYSTS_READ_SERVER`**, checked as a **string `=== 'true'`**
before any store I/O. **Default off.**

**Distinct from the write gate** `PT_ENABLE_NEWS_CATALYSTS_SERVER` — read and write must be
independently armable.

---

## 7 · Offline QA — one new suite

`qa/news_catalysts_read_offline.js`. **Suite count 44 → 45.**

| ID | Assertion |
|---|---|
| **R-1** | gate off ⇒ `DISABLED` **and no store call is made** |
| **R-2** | method not allowed ⇒ 405; CORS preflight ⇒ 204 |
| **R-3** | bad ticker ⇒ `INVALID_TICKER`; malformed instant ⇒ rejected before any store I/O |
| **R-4** | **a window with some days missing returns the records from the days that exist** — missing days do not terminate the read |
| **R-5** | **all 31 partitions missing ⇒ `NOT_AVAILABLE`/`NO_RECORD`**, only after the whole window was attempted |
| **R-6** | store throw ⇒ `DEGRADED`/`STORE_UNAVAILABLE` — **never** `NOT_AVAILABLE` |
| **R-7** | malformed stored record ⇒ `DEGRADED`/`STORE_RECORD_INVALID`; **no partial record returned** |
| **R-8** | happy path ⇒ exactly the 19 frozen fields, in persisted order, per record |
| **R-9** | `contractVersion` mismatch ⇒ record omitted and counted |
| **R-10** | **window bound: exactly 31 partition keys attempted, D0 and D0−30; never 32, never unbounded** |
| **R-11** | **negative — no `store.set` of any kind** |
| **R-12** | **negative — no `skippedItems` key in any response** |
| **R-13** | **negative — no wall-clock read** in the core's extracted source |

**No seeded store and no live call are required.** An empty store is a valid, testable state.

---

## 8 · Files expected to change — **exactly 4**

```
netlify/functions/news-catalysts-read.mjs              NEW  runtime entry
netlify/functions/lib/news-catalysts-read-core.js      NEW  all logic
qa/news_catalysts_read_offline.js                      NEW  offline suite (44 → 45)
work/s3-catalyst-evidence-surface/review.md            NEW  tracked task artifact
```

**`qa/run-offline.js` is NOT pre-authorized.** Current repository evidence is that suites are
auto-discovered by `OFFLINE_SUITE_RE`, so no registration edit is expected. **If implementation
proves registration is actually required, that is a STOP** (§12.18): halt and return the evidence
for an Owner ruling. **The mutation boundary is not weakened speculatively.**

**Not touched:** `news-catalysts-provider.js` · `news-catalysts-core.js` · `news-catalysts.mjs` ·
`evidence-contract.js` · any `qa/news_catalysts_{provider,core,replay}_offline.js` ·
`qa/fixtures/replay/**` · `index.html` · any Lane B file.

---

## 9 · Hard prohibitions

**No write path** — no `store.set`, no `onlyIfNew`, no index write.
**No provider, grounding, identity, normalization or skip-vocabulary reimplementation** — the route
validates shape; it never re-derives meaning.
**No `SKIP_REASONS` consumption** — `skippedItems` are outside D-S3-1.

**Shared read-only imports.** The core will `require` `NEWS_KEY_RE`, `CONTRACT_VERSION`,
`SOURCE_TIER` and `PROVIDER_ID` from `news-catalysts-provider.js`. **Importing is not modifying**;
none of these four symbols is touched by S2-M1.

---

## 10 · LAND ordering — S2-M1 first, fixed

**Ruled 2026-09-24.** S2-M1 and S3-M1 may be **implemented and reviewed in parallel**. LAND order is
fixed:

```
S2-M1 LAND (suite count 44)
  → Worker 2 rebases onto the new branch-dev
  → Worker 2 re-runs ALL required S3-M1 QA
    → S3-M1 LAND (suite count 45)
```

**Reason:** S2-M1's approved baseline asserts 44. S3-M1 introduces the new suite and moves the
baseline to 45. **S2-M1 must not be required to re-baseline against 45.**

**A green run from the stale base is not accepted as LAND evidence.**

---

## 11 · Lifecycle / CLOSE and Actor-to-Evidence Closure Check

| closeCondition | Evidence | Phase | Actor | Authority | Possessable before CLOSE? |
|---|---|---|---|---|---|
| Route returns only the 19 frozen fields | R-8, R-9 | impl | Worker | none | **YES** |
| Conformance to D-S3-1 | diff against the tracked contract | impl | Worker | read of a **tracked** file | **YES** — the contract is committed in this same brief-only commit |
| Window is exactly 31 partitions | R-10 | impl | Worker | none | **YES** |
| Missing days do not terminate the read | R-4, R-5 | impl | Worker | none | **YES** |
| Fail-visible on store failure / malformed record | R-6, R-7 | impl | Worker | none | **YES** |
| No write path | R-11 + diff | impl | Worker | none | **YES** |
| `qa:offline` PASS at **45** | gate run | pre-LAND | Worker | none | **YES** |
| Rebase onto post-S2-M1 `branch-dev` + full re-run | gate run | pre-LAND | Worker | none | **YES** |
| Diff minimal and in scope | reviewed diff | review | Codex / Owner | review | **NO — gate after CODE-READY** |
| LAND | approval | LAND | Owner | LAND | **NO — by design** |

**Closure SATISFIABLE.** Every Worker-side condition is offline, in-repo, needs no credential, no
live call and no seeded store. **The conformance row is satisfiable only because D-S3-1 is a tracked
artifact** — an untracked contract could not serve as the reference for a tracked commit's review.

---

## 12 · STOP conditions

1. Any file beyond the **four** in §8, **or `review.md` absent from the implementation commit**.
2. **Any S2-M1 file**: `news-catalysts-provider.js` · `qa/news_catalysts_provider_offline.js` ·
   `qa/news_catalysts_replay_offline.js` · `qa/fixtures/replay/**` ·
   `work/s2-skip-reason-resolution/**`.
3. Any write to the store; any index mutation; any `store.set`.
4. Any re-implementation of grounding, identity, normalization or skip logic.
5. Any `skippedItems` exposure, or any `SKIP_REASONS` consumption.
6. Any field returned outside the 19, or out of persisted order.
7. Any partial record returned for a record that failed validation.
8. **Any `NOT_AVAILABLE` returned before the whole 31-partition window was attempted.**
9. **Any `DEGRADED` condition reported as `NOT_AVAILABLE`**, or as an empty success.
10. Any wall-clock read.
11. Any ticker-specific branch or hard-coded symbol.
12. Reuse of the write gate instead of the distinct read gate.
13. Any unbounded scan, or a window other than exactly 31 partitions.
14. Any change to `D-S3-1-reader-contract.md` — it is frozen; changing it is a re-freeze, not a task edit.
15. Any live API call; any Netlify, env or activation change.
16. Suite count other than 45.
17. LAND attempted before S2-M1 has landed and the rebase + full re-run are complete.
18. **Any edit to `qa/run-offline.js`.** If suite discovery proves registration is required, **STOP
    and return the evidence for an Owner ruling** — do not edit it under this brief.

---

## 13 · Definition of done

The route exists, gated off by default, fail-closed, returning exactly the 19 frozen fields in
persisted order over a fixed 31-partition UTC window from an injected instant; missing days are
traversed rather than fatal; store failure and malformed records are fail-visible; no write path
exists. R-1…R-13 pass. `npm run qa:offline` **PASS at 45**, re-run after rebasing onto the
post-S2-M1 `branch-dev`. `work/s3-catalyst-evidence-surface/review.md` exists in the implementation
commit with `## Lessons`, the files-changed block, and the final-check line.

**Not claimed:** that any catalyst is visible to a user. M1 is the server read surface only —
the client adapter is M2 and the card is M3, and **activation and seeding remain Activation Register
work, outside this ARC's implementation.**

---

## 14 · Promotion to execution CODE-READY

This brief is **PREPARED — READY FOR BRIEF COMMIT** while it and the reader contract exist only as
untracked working-tree files. **An untracked brief cannot anchor a governed task**: the conformance
closeCondition in §11 requires the Worker to verify against a *tracked* D-S3-1, and the approved
contents must be pinned by a commit before implementation can be bounded.

**Promotion requires all four:**

1. Owner approval of these exact contents and of `D-S3-1-reader-contract.md`.
2. The brief-only commit exists locally on `branch-dev`.
3. Both blob OIDs in the commit match the approved values.
4. **Baseline revalidation passes:** clean tree · `qa:offline` **PASS at 44** · the four §8 target
   paths still absent · `qa/run-offline.js` unchanged and suite discovery still auto-discovering.

**Revalidation trigger.** Re-run step 4 whenever `branch-dev` moves — in particular after S2-M1
lands, per the §10 LAND ordering.
