# Task brief: Technical Score v1 surfacing (backlog task 6)

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

| | |
|---|---|
| Base | **`52c322b`** = `branch-dev` = `origin/branch-dev` |
| Branch / worktree | new `task/technical-score-surfacing`, separate worktree |
| `qa:offline` baseline | **44 suites → 44** |
| Lane | **B (parallel product)** |
| Lane B sequence | BACKLOG correction → **VERIFY ×4** → **task 6** → 9 → 10 → 11 → 12 |
| Status | **CODE-READY: YES** — the `#ts-card` decision is ruled (§2) |
| Revision | **r2** — Owner ruling 2026-09-23: UI pinned · stale caliper hash corrected |

**Two steps.** Step 0 refreshes `BACKLOG.md`; step 1 surfaces the score. They are separate commits.

---

## 0 · Step 0 — `BACKLOG.md` refresh (prerequisite)

`BACKLOG.md` is materially stale. Verified on disk at `52c322b`:

| Entry | File says | Repository says |
|---|---|---|
| 1 · TradingView ingestion | NOW, brief approved | **DONE** — `tradingview-webhook.js`, its preflight lib and suite all present |
| 2 · Quarantine legacy ARC QA | NEXT, "add to denylist" | **DONE** — all nine entries in `OFFLINE_TESTS_DENYLIST` (`run-offline.js:227`) |
| 3 · Remove `services/history.js` | NEXT, "delete the file" | **DONE** — file absent |
| 5 · Benchmark self-comparison guard | NEXT, blocks task 6 | **DONE** — `9cade5b`, confirmed ancestor of `52c322b` |
| 6 · Technical Score v1 surfacing | blocked by 5 | **UNBLOCKED, not started** — pin still `callCount === 2` |
| 8 · Parser / render integrity | three defects, stale anchors | **8a DONE** (`9f8171d`) · 8b HELD · D-2 DROPPED · "second copy" was five |
| Base snapshot | `branch-dev` = `e1442ab`, 21 active | `52c322b`; counts stale |

**Why this is a prerequisite and not tidying.** Two Workers planning from this file would re-open
finished work or collide. **`BACKLOG.md` is a tracked file, so this is its own governed change** —
the delta above is the complete proposed edit, and no entry is re-opened, re-scoped or deleted;
completed entries move to the DONE/HISTORY section with their commit SHAs.

**Separate commit, before step 1.** Owner approval required for the tracked-file edit.

---

## 1 · Step 1 — exact product behaviour

Surface the already-landed Technical Score v1 engine on the Ticker Detail `#ts-card`
(`index.html:7816`). **Display only** — no ranking influence, no persistence, no scoring change.

**Three structural facts that constrain the design:**

1. **`runTechScoreV1` is `async` and performs network fetches.** It calls `_ts1FetchRawSeries` for
   the symbol **and up to three benchmarks** (SPY, QQQ, sector ETF), each an await. It **cannot be
   called inline** from `renderMainPanel`, which is a synchronous template builder.
   **Therefore: async post-render fill**, following the existing `'Loading candle data…'` pattern
   already present at `:7819` — render a placeholder, fill on resolve.
2. **It is gated.** `window.PT_ENABLE_TECH_SCORE !== true` returns `{status: 'GATE_OFF'}`
   (`:2148`). The gate stays; default remains off. **With the gate off the card must render exactly
   as it does today** — that is the primary regression assertion.
3. **A per-symbol session memo is required, not optional.** Without it every re-render refires up to
   four network fetches. Follow the existing `_techCache` shape (`:1008`, written `:1215`):
   in-memory object, session-scoped. **No `localStorage`, no persistence.**

**Return states to handle:** `GATE_OFF` · `UNAVAILABLE` with a `reason` · a scored result. The
display must degrade quietly on the first two — no error text where a score would go.

---

## 2 · UI ruling — pinned, not open

**One distinct row inside `#ts-card`, labelled exactly `Tech Score v1`, carrying two values:**

| Value | Source field | Notes |
|---|---|---|
| **score** | `result.score` | the composite |
| **coverage** | `result.coveragePct` | how much of the score's input was actually available |

**Explicitly excluded, all four:**

1. **No state colour.** The row is neutral-toned. No `pos`/`neg`/`warn`/`neutral-v` class is applied
   to the score value.
2. **No four-component breakdown** (`sma`, `rs`, `high52w`, `volume`).
3. **No second generic `Score` label** anywhere. The label is `Tech Score v1`, once. `#ts-card`
   must not end up with two things a reader could both call "the score".
4. No ranking, sorting, persistence or scoring influence.

> **Observation, not a change.** `coveragePct` is computed as `100 * availablePoints / 100`
> (`index.html:1891`) — arithmetically identical to `availablePoints`. **Render it as-is.**
> `scoreTickerTech` is off-limits (§3), so this is reported, not touched.

**Nothing in this brief is now open.**

---

## 3 · Files

```
index.html            gated invocation site · #ts-card display block · per-symbol session memo
qa/run-offline.js     Phase 13 pin  callCount === 2  →  3   (:3523)
```

**Two files. No new suite.** Suite count **44 → 44**.

**Also required:** `qa/vis_score_caliper_offline.js` — the `renderMainPanel` pin moves, since
`#ts-card` at `:7816` is inside that function.

**Current value at `52c322b`, re-read from disk:**

```
renderMainPanel: 6d98820eab986afe5d64ad77b36faf00b538aab74e7b112314569f212666c7a5
```

> An earlier revision of this brief cited `cd15e31c…2dd1e55`. **That value is stale** — it was the
> pre-8a hash, superseded when `9f8171d` de-duplicated the rating regex inside `renderMainPanel`.
> `_srGroupResults` and `_srRenderGrouped` were re-pinned by the same commit. **Regenerate from the
> host CRLF working tree by running the suite; never compute a hash from `git show` or in a sandbox.**

Exactly **one** caliper hash changes. The other nine function pins and the CSS pin must not.
**Any second caliper movement is a STOP.**

**Explicitly not touched:** `scoreTickerTech` (the caliper scans its source for `fetch(`,
`localStorage`, `document.`, `Date.now`, `Math.random` — any edit risks that isolation check) ·
`_ptScore*` helpers · `_srGroupResults` · `_srRenderGrouped` · every Lane A file.

---

## 4 · QA changes and stale pins

| Item | Action |
|---|---|
| `qa/run-offline.js:3523` `callCount === 2` | **→ 3.** Currently `runTechScoreV1(` appears twice — the comment at `:1409` and the definition at `:2147`. One real invocation makes three. **This pin is the stale one being retired** |
| `qa/run-offline.js` Phase 13 scorer isolation | must pass **unchanged** — proves `scoreTickerTech` was not touched |
| `vis_score_caliper` `renderMainPanel` hash | update from `6d98820e…66c7a5`, host-generated |
| `vis_score_caliper` other 9 fn pins + CSS pin | **unchanged** |
| New assertions | gate-off renders today's card · `UNAVAILABLE` renders no error text · the memo is in-memory only, **no `localStorage` key added** · the literal `Tech Score v1` appears **exactly once** · **no state-colour class is applied to the score value** · no second generic `Score` label is introduced |

**Deterministic offline QA already exists.** The engine landed dark with full coverage inside
`run-offline.js` Phase 13 — determinism, clamp, component order, isolation. **This task adds a
call site and a display, not a new engine, so no new suite is justified.**

---

## 5 · Zero dependency on the ARC contracts

| | |
|---|---|
| A5 / A3 / A4 / A7 files | **none touched** |
| News-catalyst contract, identity, `SKIP_REASONS` | **not read, not written** |
| `qa/fixtures/replay/**` | **not touched** |
| Measured basis | `index.html` contains **0** `news-catalysts` references; `qa/run-offline.js` contains **1**, and it is a denylist *string* at `:229` |

**No shared file, no shared contract, no shared pin, no shared fixture.**

---

## 6 · STOP conditions

1. Any file beyond `index.html`, `qa/run-offline.js` and — if gap-check confirms it —
   `qa/vis_score_caliper_offline.js`.
2. **Any Lane A file** — `news-catalysts-*`, `qa/news_catalysts_*`, `qa/fixtures/replay/**`.
   **STOP and report; do not edit across the lane boundary.**
3. Any edit to `scoreTickerTech`, any `_ptScore*` helper, `_srGroupResults` or `_srRenderGrouped`.
4. Any caliper pin movement beyond the single `renderMainPanel` hash.
5. Any change to ranking, sorting, persistence, or any stored value.
6. **Any `localStorage` read or write**, including a new key for the memo.
7. Any change to the `PT_ENABLE_TECH_SCORE` gate's default or its `=== true` strictness.
8. Any card rendering difference when the gate is off.
9. Any suite added or removed; any count other than 44.
10. `BACKLOG.md` edited in the same commit as the code change — step 0 and step 1 are separate.
11. Any network call added outside `runTechScoreV1`'s existing fetches.

---

## 7 · Rebase rule

**If Lane A LANDs first, this lane rebases onto the new `branch-dev` and re-runs `npm run
qa:offline` in full before requesting LAND.** A green run from the stale base is not accepted as
LAND evidence. **Re-derive the `renderMainPanel` caliper hash after any rebase** — Lane A does not
touch `index.html`, so it should be unchanged, but it must be re-read, not assumed.

## 8 · Definition of done

**Step 0:** `BACKLOG.md` reflects repository truth; 1/2/3/5/8a recorded DONE with SHAs; entry 4
relabelled 4a/4b/4c; 19 and 20 recorded as implemented-and-gated; 16 marked Owner-only; D-2 recorded
DROPPED; base snapshot `52c322b`. No entry re-opened, none invented. Separate commit.

**Step 1:** one gated invocation site; `#ts-card` carries a single `Tech Score v1` row with **score
and coverage, no state colour, no component breakdown, no second `Score` label**; async post-render
fill; per-symbol in-memory memo; gate-off output byte-identical to today; `UNAVAILABLE` degrades
quietly. `run-offline.js:3523` reads `callCount === 3` and Phase 13's isolation checks pass
unchanged. Exactly one caliper hash moved, host-generated. `npm run qa:offline` **PASS at 44**.
`review.md` carries `## Lessons`, the "Files changed" block and the final-check line.

**Not claimed:** any improvement in score quality. The engine is unchanged; this task makes existing,
already-tested output visible.
