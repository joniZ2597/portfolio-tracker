# Task brief: S2-M1 — Skip-reason resolution (D-A2-2)

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

| | |
|---|---|
| ARC / Slice | **S2** (ACTIVE) · **M1** Skip-reason resolution |
| Base | **`aa62aea`** = `branch-dev` |
| Branch / worktree | new `task/s2-skip-reason-resolution`, separate worktree |
| `qa:offline` | **44 → 44** — no suite added or removed |
| Status | **PREPARED — READY FOR BRIEF COMMIT.** Promotes to execution CODE-READY after the Owner-approved brief-only commit exists locally and §11 revalidation passes |

**Objective.** Make the two distinct `INVALID_SOURCE_URL` failures distinguishable in production
telemetry, without replay. **Nothing a user sees changes.**

---

## 1 · Exact current emit sites

`netlify/functions/lib/news-catalysts-provider.js`, inside the candidate ladder:

```js
var candidate = contract.optionalHttpsUrl(raw.sourceUrl);
if (candidate === null) {
  skippedItems.push({ reason: 'MISSING_SOURCE_URL' });     // :646  — untouched
  continue;
}
if (candidate === contract.INVALID) {
  skippedItems.push({ reason: 'INVALID_SOURCE_URL' });     // :650  ← SITE A · malformed syntax
  continue;
}
var groundedIndex = resolveGrounded(candidate, grounding);
if (groundedIndex === -1) {
  skippedItems.push({ reason: 'INVALID_SOURCE_URL' });     // :655  ← SITE B · grounding miss
  continue;
}
```

Two sites, one reason string. Site A = the URL is not a usable https URL. Site B = the URL is
well-formed but was never retrieved. Different failures, different remedies, indistinguishable today.

## 2 · Ruling (2026-09-24)

| Site | Condition | Reason emitted |
|---|---|---|
| **A** · `:650` | `optionalHttpsUrl` returns `INVALID` — malformed / unusable URL | **`INVALID_SOURCE_URL`** — unchanged |
| **B** · `:655` | well-formed https URL absent from the grounded evidence set | **`UNRETRIEVED_SOURCE_URL`** — new, appended |

`MISSING_SOURCE_URL` at `:646` is untouched.

> **Naming boundary — enforced in both directions.** The production reason is
> **`UNRETRIEVED_SOURCE_URL`**. The replay suite's internal attribution bucket
> **`Q3_UNRETRIEVED_SOURCE_URL`** (`replay:178`) **keeps its name** — `Q3_` is replay-analysis
> vocabulary and must not enter the production contract, and the bucket must **not** be renamed to
> match production. §4's simplification is a *mapping*, not a rename of either. Renaming the bucket
> moves R-5/R-9 labels and is a STOP.

## 3 · Enum change

```js
var SKIP_REASONS = deepFreeze([   // provider :120
  … indices 0–11 byte-identical, order unchanged …
  'UNRETRIEVED_SOURCE_URL'        // index 12 — appended last, append-only preserved
]);
```

**Count 12 → 13.** Exported once at `provider:943`.

**`news-catalysts-core.js` and `news-catalysts.mjs` contain zero `SKIP_REASONS` references** —
verified. The only consumer outside the provider is the provider QA suite.

## 4 · Measured fixture impact

All **4** corpus `INVALID_SOURCE_URL` skips are **Site B**; **zero** are Site A.

```
p3-20260921T2045Z-NVDA   ×3  →  UNRETRIEVED_SOURCE_URL
p4-20260921T2312Z-NVDA   ×1  →  UNRETRIEVED_SOURCE_URL
```

| Artifact | Change |
|---|---|
| `p3-20260921T2045Z-NVDA.json` | 3 `skippedItems[].reason` |
| `p4-20260921T2312Z-NVDA.json` | 1 `skippedItems[].reason` |
| `index.json` | those **2** `fixtureSha256`; the other **7 byte-identical** |
| `index.json` `referenceManifest` | the `nvda-q2-fy27-earnings` note names `INVALID_SOURCE_URL` — **prose only**; no `outcome`, `refId` or `matchedItemSourceUrl` change |

**`expected.attribution` must be byte-identical in both changed fixtures.** Those four candidates
were already classified `Q3_UNRETRIEVED_SOURCE_URL`; only the reason *label* moves, never the
classification. **An attribution delta means the mapping was written wrong — STOP.**

`input`, `provenance`, `captureSha256` and `nowIso` are immutable in every fixture.

## 5 · QA affected — enumerated

**`qa/news_catalysts_provider_offline.js`**

| Test | Action |
|---|---|
| **NP06** `:502-517` | 4 Site-A cases — **expected to pass unchanged** |
| **NP07** `:522-531` | 4 grounding-absent cases — **→ `UNRETRIEVED_SOURCE_URL`** |
| `:774` · `:900` · `:1212` · **NP37** `:1261` · **NP49** `:1628` | classify each by site; update Site-B assertions only |
| **NP44** `:1509-1515` | `length` 12 → **13**; `slice(0,10)` unchanged; `slice(10)` becomes the three appended reasons in order |
| **NP57** `:1712-1718` | A5's "still 12" pin → **13**; restate its intent so it pins *Rule S added no reason* without contradicting M1 |
| *(new)* | one test asserting **the two sites emit different reasons** — the point of the slice |

**`qa/news_catalysts_replay_offline.js`**

| Site | Action |
|---|---|
| `:186` split logic | **replace the re-derived syntax check with a direct read of the production reason**, mapping `UNRETRIEVED_SOURCE_URL` → `Q3_UNRETRIEVED_SOURCE_URL` and `INVALID_SOURCE_URL` → `MALFORMED_CANDIDATE`. **Bucket names and counts unchanged** |
| `:376` R-6 | synthetic Q-3 case → `UNRETRIEVED_SOURCE_URL` |
| `:414` R-5 | expected reason vocabulary gains the new member; **bucket sums unchanged** |
| `:25` · `:276` · `:423` · `:445` | prose describing the overloaded single string |

**Suite count stays 44.**

## 6 · Invariants

- **No persisted record-shape change** — `skippedItems` is never persisted (`core.js:315`); records
  are built solely from the 17 `ITEM_FIELDS` + `sourceTier` + `contractVersion`.
- **No survivor change** — every `items[]` array in all 9 fixtures byte-identical.
- **No identity change** — tuple, `IDENTITY_SCHEMA_VERSION`, every `identityHash`.
- **No S3 reader-contract impact** — D-S3-1 covers the persisted 17+2; `skippedItems` is outside it.
  **S3-M0 may be frozen before, during or after M1**, and M1 cannot reopen it.
- **No ladder reordering** — both sites keep their positions.
- **Append-only `SKIP_REASONS`** — indices 0–11 untouched.

## 7 · Files expected to change — **exactly 7**

```
netlify/functions/lib/news-catalysts-provider.js       enum member + the :655 emit site only
qa/news_catalysts_provider_offline.js                  §5 assertions + one new site-distinction test
qa/news_catalysts_replay_offline.js                    §5 assertions + the :186 simplification
qa/fixtures/replay/p3-20260921T2045Z-NVDA.json         3 reason values
qa/fixtures/replay/p4-20260921T2312Z-NVDA.json         1 reason value
qa/fixtures/replay/index.json                          2 fixtureSha256 + manifest prose
work/s2-skip-reason-resolution/review.md               NEW  tracked task artifact
```

**Seven files, all Lane A, in one implementation commit.** `brief.md` is not counted — it lands in
its own earlier Owner-gated brief-only commit, per the `ccc5dba` → `810586d` pattern.

**Not touched:** `news-catalysts-core.js` · `news-catalysts.mjs` · `evidence-contract.js` ·
`qa/run-offline.js` · `index.html` · any Lane B file · **any S3-M1 file** · the other 7 fixtures.

## 8 · LAND evidence — four runs, reported separately

| Run | Why |
|---|---|
| `npm run qa:offline` — **PASS at 44** | the integration gate |
| `node qa/news_catalysts_provider_offline.js` | **denylisted from `qa:offline`** (`run-offline.js:229`) — a green gate proves nothing about NP06/NP07/NP44/NP57 |
| `node qa/news_catalysts_replay_offline.js` | task-specific replay evidence incl. the two regenerated fixtures |
| `node qa/news_catalysts_core_offline.js` | core is untouched; this proves it |

**Reporting `qa:offline` alone is not acceptable LAND evidence for this task.**

**LAND order: S2-M1 lands FIRST**, before S3-M1. S2-M1's baseline asserts 44; S3-M1 moves it to 45.
**S2-M1 must not be required to re-baseline against 45.**

## 9 · Lifecycle and Actor-to-Evidence Closure Check

| closeCondition | Evidence | Phase | Actor | Authority | Possessable before CLOSE? |
|---|---|---|---|---|---|
| Sites A and B emit distinct reasons | provider suite | impl | Worker | none | **YES** |
| `SKIP_REASONS` = 13, append-only | NP44 / NP57 | impl | Worker | none | **YES** |
| Survivors byte-identical, 9 cases | comparison vs `aa62aea` | impl | Worker | read | **YES** |
| **`expected.attribution` unchanged** | fixture comparison | impl | Worker | read | **YES** |
| Only 2 `fixtureSha256` moved | `index.json` comparison | impl | Worker | read | **YES** |
| Core untouched | core suite + empty diff | impl | Worker | none | **YES** |
| `qa:offline` PASS at 44 | gate run | pre-LAND | Worker | none | **YES** |
| Diff minimal and in scope | reviewed diff | review | Codex / Owner | review | **NO — gate after CODE-READY** |
| LAND | approval | LAND | Owner | LAND | **NO — by design** |

**SATISFIABLE.** No criterion requires a live run, a credential or production telemetry — the split
is fully determined by the pinned corpus plus synthetic Site-A cases.

## 10 · STOP conditions

1. Any file beyond the seven in §7, **or `review.md` absent from the implementation commit**.
2. **Any change to `items[]` in any fixture.**
3. **Any change to `expected.attribution` in any fixture.**
4. Any change to a fixture's `input`, `provenance`, `captureSha256` or `nowIso`.
5. Any `fixtureSha256` change beyond the two named.
6. **Any rename of the replay bucket `Q3_UNRETRIEVED_SOURCE_URL`**, or any `Q3_` token entering the
   production contract.
7. Any change to identity, `IDENTITY_SCHEMA_VERSION` or any `identityHash`.
8. Any change to `ITEM_FIELDS`, `projectItemRecord` or the 17+2 record.
9. Any reordering of existing `SKIP_REASONS` members; any count other than 13.
10. Any change to `MISSING_SOURCE_URL` at `:646` or to the Site-A emit at `:650`.
11. Any core, route or `evidence-contract` change.
12. **Any S3-M1 file**: `news-catalysts-read.mjs` · `lib/news-catalysts-read-core.js` ·
    `qa/news_catalysts_read_offline.js` · `work/s3-catalyst-evidence-surface/**`.
13. Any Lane B file; any live API call; any new capture.
14. Any suite added or removed; any count other than 44.

## 11 · Promotion to execution CODE-READY

This brief is **PREPARED — READY FOR BRIEF COMMIT** while it exists only as an untracked
working-tree file. Promotion requires all four:

1. Owner approval of these exact contents.
2. The brief-only commit exists locally on `branch-dev`.
3. The committed blob OID matches the approved value.
4. **Baseline revalidation:** clean tree · `qa:offline` **PASS at 44** · `SKIP_REASONS.length === 12`
   · both emit sites still present and still emitting `INVALID_SOURCE_URL` · the 9 fixtures'
   `fixtureSha256` values unchanged.

**Revalidation trigger.** Re-run step 4 whenever `branch-dev` moves before implementation starts.

## 12 · Definition of done

Site A emits `INVALID_SOURCE_URL`, Site B emits `UNRETRIEVED_SOURCE_URL`; `SKIP_REASONS` is 13 with
the new member at index 12 and 0–11 unchanged; the replay suite reads the production reason directly
and its bucket names and counts are unchanged; `p3-NVDA` and `p4-2312-NVDA` carry the new reason with
**items and attribution byte-unchanged**; the other 7 fixtures and their hashes untouched; all four
runs in §8 reported; `work/s2-skip-reason-resolution/review.md` exists in the implementation commit
with `## Lessons`, the seven-row files-changed block, the before/after reason delta and the
final-check line.

**Not claimed:** that any catalyst outcome improved. M1 makes an existing failure distinguishable in
production telemetry; nothing a user sees changes.
