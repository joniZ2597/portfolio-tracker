# Task brief: S2 · A5 — Hub source identity (Rule S)

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

| | |
|---|---|
| Base | **`52c322b`** = `branch-dev` = `origin/branch-dev` |
| Branch / worktree | new `task/s2-hub-source-identity`, separate worktree |
| `qa:offline` baseline | **44 suites → 44** |
| Lane | **A (ARC)** |
| Sequence | `A5` → `D-A2-2` → `A3a` → `A3b*` → `A7a` → `A4*/A7b*` · **A6 HOLD** |
| Status | **CODE-READY: YES** |
| Revision | **r2** — Owner ruling 2026-09-23: R-1 representative re-pointed · provider tests renumbered NP50+ · LAND evidence made explicit |

**Objective.** Stop a generic hub/index page conferring source identity on distinct catalysts,
without touching any article URL. **This is a survivor-changing task** — the first in S2.

---

## 1 · Problem, measured

`https://investors.jfrog.com/news/default.aspx` binds **two distinct catalysts** in
`p4-2312-FROG` (2026-08-27 and 2026-09-02). It escapes the existing H-B guard because
`GENERIC_SOURCE_PATH_RE` (`provider:87`) matches a generic segment only when **nothing follows it**,
and `default.aspx` follows it.

```js
var GENERIC_SOURCE_PATH_RE = /^\/(news|press-release|press-releases|investors|investor-relations|newsroom|media)\/?$/i;
```

---

## 2 · Contract — Rule S, exactly

**A trailing index-document filename is transparent for genericity purposes.** Strip it from the
path, then apply `GENERIC_SOURCE_PATH_RE` **completely unchanged**.

```js
var INDEX_DOC_LEAF_RE = /\/(?:default|index)\.(?:aspx|html?|php)$/i;
...
var groundedPath = new URL(grounded.normalized).pathname.replace(INDEX_DOC_LEAF_RE, '');
if (groundedPath === '' || groundedPath === '/' || GENERIC_SOURCE_PATH_RE.test(groundedPath)) {
  skippedItems.push({ reason: 'GENERIC_SOURCE_URL' });
  continue;
}
```

| Path | After strip | Outcome |
|---|---|---|
| `/news/default.aspx` | `/news` | **rejected** — the hub |
| `/news/news-details/2026/<slug>/default.aspx` | `/news/news-details/2026/<slug>` | **survives** |
| `/news` | `/news` | rejected (unchanged) |
| `/` | `/` | rejected (unchanged) |
| `/default.aspx` | `''` | **rejected** — hence the explicit `''` test |

**The `''` case is why the empty-string check exists.** Stripping the leaf from a path that is
*only* the leaf yields `''`, which `GENERIC_SOURCE_PATH_RE` does not match and which would otherwise
survive as a bare site-root document.

**Ruled and fixed:**

- **Reuse `GENERIC_SOURCE_URL`.** `SKIP_REASONS` stays at **12**. No new reason, no core re-export
  change, no vocabulary change.
- **Do NOT add `default.aspx` / `index.aspx` to the generic-leaf list.** Measured: that rejects
  **19 of 37** survivors — 51% of the corpus — because 19 legitimate article URLs end in
  `/default.aspx`. Rule S rejects **2**.
- **Ladder position unchanged** — the check stays exactly where it is at `:662`, after grounding
  resolution and before `category`.
- **No identity change.** Tuple, `IDENTITY_SCHEMA_VERSION` and every surviving `identityHash`
  untouched.
- **No contract change.** The 17-field item and the 17+2 record are untouched. Core is not modified.

---

## 3 · Files

```
netlify/functions/lib/news-catalysts-provider.js    1 new const + 2 changed lines at :661-662
qa/news_catalysts_provider_offline.js               positive + negative control tests
qa/news_catalysts_replay_offline.js                 corpus-delta assertions
qa/fixtures/replay/p4-20260921T2312Z-FROG.json      regenerated expected (§4)
qa/fixtures/replay/index.json                       that case's fixtureSha256 only
```

**Five files, all Lane A.** Suite count **44 → 44**, no suite added.

**Explicitly not touched:** `news-catalysts-core.js` · `news-catalysts.mjs` · `evidence-contract.js`
· `qa/run-offline.js` · `index.html` · any Lane B file · the other eight fixtures.

---

## 4 · Survivor delta — measured, not predicted

Simulated by applying Rule S to a copy of the provider **outside the repo** and replaying all nine
fixtures through the real `getNewsCatalysts`. Result:

| Case | Before | After |
|---|---|---|
| `p4-2312-FROG` | items **2** · `{DUPLICATE_IN_BATCH: 3}` | items **0** · `{GENERIC_SOURCE_URL: 5}` |
| **all eight others** | — | **byte-identical `items` and `skippedItems`** |

**The three `DUPLICATE_IN_BATCH` become `GENERIC_SOURCE_URL`, and that is correct, not a
regression.** The generic check sits earlier in the ladder than identity construction, so all five
hub-bound candidates are now rejected before the duplicate stage is reached. **The Worker must
expect skip *reasons* to change, not only counts** — a reason-count diff on this case is the
expected result, not a STOP.

`p4-2312-FROG` becomes a **zero-item** case. Verified safe: no replay assertion requires
`items.length > 0`, and the R-10 reference manifest contains **no FROG refIds** (all five are MRNA
or NVDA), so no curated outcome is affected.

### Fixture rebaseline procedure

1. Apply the provider change **first**; run the replay suite and record every failure.
2. **Confirm the failures are confined to `p4-2312-FROG`.** Any failure in another case ⇒ **STOP**;
   the rule has over-reached.
3. Regenerate **only** `p4-20260921T2312Z-FROG.json`'s `expected` block. **`input`, `provenance`,
   `captureSha256` and `nowIso` are immutable** — the captured envelope is provenance evidence and
   is never re-derived.
4. Update **only that case's** `fixtureSha256` in `index.json`. The other eight values must be
   byte-identical.
5. Record in `review.md` the before/after for that case and an explicit statement that eight cases
   were unchanged.

---

## 5 · QA plan

### `qa/news_catalysts_provider_offline.js` — new tests numbered **NP50+**

Highest existing identifier is **NP49**; the new block starts at **NP50** with no reuse.

| ID | Class | Assertion |
|---|---|---|
| **NP50** | positive | `/news/default.aspx` ⇒ `GENERIC_SOURCE_URL` |
| **NP51** | positive | `/investors/index.aspx`, `/newsroom/index.html`, `/media/default.php` ⇒ rejected |
| **NP52** | positive | `/default.aspx` (bare root document) ⇒ rejected — the `''` branch |
| **NP53** | **negative control** | `/news/news-details/2026/JFrog-Introduces-Zero-Touch-Remediation…/default.aspx` ⇒ **SURVIVES** |
| **NP54** | **negative control** | `/news/press-release-details/2026/NVIDIA-Announces-Financial-Results…/default.aspx` ⇒ **SURVIVES** |
| **NP55** | **negative control** | `/news/q3-results`, `/news/2026/some-article` ⇒ survive (pre-existing behaviour preserved) |
| **NP56** | negative control | `/news-details/default.aspx` ⇒ survives — `news-details` is not in the generic list, proving the list was not widened |
| **NP57** | regression | `SKIP_REASONS.length === 12`; `GENERIC_SOURCE_PATH_RE` source byte-unchanged |

**NP53 and NP54 are the load-bearing tests.** They use the two real URL shapes Rule N would have
destroyed. Without them the brief's central safety claim is untested.

> **This suite does not run under `qa:offline`.** `qa/news_catalysts_provider_offline.js` is in
> `OFFLINE_TESTS_DENYLIST` (`run-offline.js:229`). **A green `qa:offline` proves nothing about
> NP50–NP57** — the targeted suite must be run and reported separately (§5.3).

### `qa/news_catalysts_replay_offline.js` — new tests **R-12+**

| ID | Class | Assertion |
|---|---|---|
| **R-12** | INVARIANT | exactly **one** case differs from the `52c322b` baseline; it is `p4-2312-FROG` |
| **R-13** | INVARIANT | `p4-2312-FROG` yields **0 items** and **5 × `GENERIC_SOURCE_URL`** |
| **R-14** | INVARIANT | the other eight cases' `items` and `skippedItems` are byte-identical to `52c322b` |
| **R-15** | INVARIANT | no surviving item in any case binds a path Rule S would reject — rule and corpus agree |

R-1…R-11 and the A2 binding invariants must pass unmodified apart from the single regenerated
fixture **and the R-1 re-point below**.

### 5.1 · Required change to R-1 — the cross-process representative

R-1 currently spawns its cross-process determinism check on **`p4-20260921T2312Z-FROG`**
(`replay_offline.js:274`), chosen because it was *"a case with both survivors and skips"*.

**A5 makes that case 0 items / 5 skips.** Its own stated selection rationale would no longer hold,
and the strongest determinism check in the suite would run against the weakest case — one with no
survivors, no bindings and no identity hashes to diverge.

**Re-point R-1's representative to `p4-20260921T2312Z-NVDA`** — 5 items and 1 `INVALID_SOURCE_URL`,
so it retains both survivors and skips, and is unaffected by Rule S. Update the fixture path, the
`loadCase` id and the accompanying comment. **The check itself is not weakened: the same
in-process/cross-process byte comparison runs, on a case that still exercises items, skips, bindings
and `evidenceSetSize`.**

### 5.3 · LAND evidence — both runs required, reported separately

| Evidence | Why |
|---|---|
| **`npm run qa:offline`** — PASS at **44** | the integration gate |
| **`node qa/news_catalysts_provider_offline.js`** — full pass, NP50–NP57 named | **denylisted from `qa:offline`; otherwise entirely unverified** |
| **`node qa/news_catalysts_replay_offline.js`** — R-1…R-15 | task-specific replay evidence, incl. the single regenerated fixture |
| **`node qa/news_catalysts_core_offline.js`** | core is untouched; this proves it |

**All four are required at LAND.** Reporting `qa:offline` alone is not acceptable LAND evidence for
this task.

---

## 6 · STOP conditions

1. Any file beyond the five in §3.
2. Any change to `GENERIC_SOURCE_PATH_RE` itself, or to the generic-segment list.
3. Any new `SKIP_REASONS` member; any count other than 12.
4. Any change to the identity tuple, `IDENTITY_SCHEMA_VERSION`, or any surviving `identityHash`.
5. Any change to the 17-field item contract or to `news-catalysts-core.js`.
6. **Any survivor change in a case other than `p4-2312-FROG`.**
7. Any edit to a fixture's `input`, `provenance`, `captureSha256` or `nowIso`.
8. Any change to another case's `fixtureSha256`.
9. Any move of the generic check's position in the ladder.
10. Any Lane B file — `index.html`, `qa/run-offline.js`, `vis_score_caliper*`, `ui1b_cards*`,
    `deep_dive_v0*`, `BACKLOG.md`. **STOP and report; do not edit across the lane boundary.**
11. Any live API call; any new capture.
12. Any suite added or removed; any count other than 44.

---

## 7 · Actor-to-Evidence Closure Check

| closeCondition | Evidence | Phase | Actor | Authority | Possessable before CLOSE? |
|---|---|---|---|---|---|
| NP50…NP57 rule behaviour | targeted provider suite output | impl | Worker | none | **YES** — offline, no key |
| R-12…R-15 corpus delta | replay suite output | impl | Worker | none | **YES** |
| R-1 re-point still deterministic | replay suite output | impl | Worker | none | **YES** |
| Eight cases unchanged | byte-comparison vs `52c322b` | impl | Worker | read of tracked fixtures | **YES** — baseline already committed |
| Only one `fixtureSha256` moved | `index.json` comparison | impl | Worker | read | **YES** |
| `qa:offline` PASS at 44 | gate run | pre-LAND | Worker | none | **YES** |
| Diff minimal and in scope | reviewed diff | review | Codex / Owner | review | **NO — a gate after CODE-READY** |
| LAND | approval | LAND | Owner | LAND | **NO — by design** |

**Closure SATISFIABLE.** Every closeCondition is producible offline, in-repo, with no credential, no
live call, and no other actor's prior action. **No acceptance criterion depends on a live run** —
the survivor delta is fully determined by the pinned corpus.

---

## 8 · Rebase rule

**If Lane B LANDs first, this lane rebases onto the new `branch-dev` and re-runs, in full:**
`npm run qa:offline` · the targeted news-catalysts **provider** suite · the task-specific **replay**
and **core** suites · **one scoped Codex re-review** of the rebased diff.

**A green run from the stale base is not accepted as LAND evidence.**

## 9 · Definition of done

`INDEX_DOC_LEAF_RE` exists; the check at `:662` strips it before applying the unchanged
`GENERIC_SOURCE_PATH_RE`; `SKIP_REASONS` is still 12. **NP50–NP57** pass, with NP53/NP54 proving
article URLs survive. **R-1 is re-pointed to `p4-2312-NVDA`** and still byte-identical
in-process vs cross-process. **R-12…R-15** pass. `p4-2312-FROG` is 0 items / 5
`GENERIC_SOURCE_URL`; **the other eight cases and their eight `fixtureSha256` values are unchanged**.
All four runs in §5.3 are reported. `review.md` carries `## Lessons`, the five-row "Files changed"
block, the before/after delta and the final-check line.

**Not claimed:** that hub URLs can no longer confer shared identity in general. Rule S handles the
*index-document* form. A hub at a path with no index-document leaf, or under a segment not in the
generic list, is untouched — and remains A5 follow-up work, not a silent gap.
