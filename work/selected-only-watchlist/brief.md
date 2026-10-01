# Task brief: Entry 11 — Selected only watchlist view

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

| | |
|---|---|
| Backlog | **Entry 11** · Selected only watchlist view (temporary scan-preview control) |
| Preparation baseline | **`e27ce1c`** = `branch-dev` = `origin/branch-dev` |
| Branch / worktree | `task/selected-only-watchlist`, Worker slot `pt-wt-worker-a` |
| `qa:offline` | current baseline **TBD at plan time** (one new auto-discovered suite added; `qa/run-offline.js` is **not** edited) |
| Lane | touches `index.html` — no other in-flight `index.html` task may run concurrently in this slot |
| Status | **APPROVED — Owner approved these exact contents** |

**Objective.** Add a temporary, non-persisted `Selected only` view toggle to the watchlist sidebar
so the user can see exactly which tickers are included in the next scan, without changing scan
behaviour, scoring, or any persisted state.

---

## 1 · Standing decisions carried in (Owner, pre-approved product decisions)

| Decision |
|---|
| Toggle location: inside `.sb-scan-section`, next to `#scanNote` |
| Default: **OFF** |
| **Not persisted** — no `localStorage`, resets to OFF on reload |
| Search continues to work inside the filtered view |
| Unchecking a ticker while `Selected only` is active keeps that row **visible, shown unchecked**, until the filter/search state changes — it must not look deleted from the watchlist |
| Counts and the Run-scan badge update immediately |
| Empty-state copy: `No tickers selected for the next scan.` |

## 2 · Reality check at `e27ce1c`

| Item | Anchor | State |
|---|---|---|
| Scan section markup | `index.html:890-902` (`.sb-scan-section`), `#scanNote` at `:897` (`"Checked tickers are included in the next scan. Unchecking does not remove them from the watchlist."`) | No existing "selected only" control. The toggle is added as a new element inside this `<div>`, after `#scanNote` |
| Search state | `let _filterQuery = '';` `:6612` — session-only, mutated by `filterWatchlistRows(query)` `:7412-7420` | No persistence; matches the "do not persist" shape this task needs for its own new toggle |
| Three search predicates | `updateScanColToggle` `:6624-6644`, `toggleAllVisibleScanInclusion` `:7422-7440`, `renderWatchlistRows` `:7442-7505` | Each independently re-implements the same 5-field `.filter(e => ...)` predicate (`symbol`, `name`, `exchange`, `sector`, `sectorEtf`) as its **first** `.filter(e =>` call in the function, closing with its own `);`. This triplication is an existing, accepted repo pattern (kept deliberately per the Entry 9 brief, §4) — Entry 11 follows it rather than extracting a helper |
| `toggleScanInclusion(symbol)` | `:6614-6622` | Per-checkbox toggle. Updates `entry.inScan` then patches the single checkbox DOM node in place — **it does not call `renderWatchlistRows()`**. A full re-render only happens from `filterWatchlistRows`, `toggleAllVisibleScanInclusion`, `switchTab`, or a new scan render (`renderResults`) |
| `updateRunScanCount()` | `:6646-6658` | Sets `#scanCount` badge from `getScanSymbols().length` (global in-scan count, not view-filtered), toggles `#runBtn` disabled state, sets `#countWatchlist`/`#countAll` to `watchlist.length`, then calls `updateScanColToggle()` |
| Data fields | `getScanSymbols()` `:5151`, `findTicker()` `:5152`, `setInScan()` `:5179-5182` | `entry.inScan` is the only field this task reads; no new data field is introduced |
| QA constraint | `qa/ui_hygiene_offline.js` UH-3 (`:52-82`) | Extracts, per predicate function, the field set used **inside the first `.filter(e => ...)` call only** (`indexOf('.filter(e =>')` → first `);` after it) and asserts it equals exactly the 5 frozen fields in all three functions. **A second, separate `.filter(...)` statement added after that call is invisible to this check**; a filter **chained onto the same call** (`.filter(e => ...).filter(e => ...)`) is not, because the first `);` found would then land at the end of the *second* filter, pulling its fields into the extracted body and breaking the 5-field-only assertion |

## 3 · Scope — exactly these changes

1. **New toggle markup**, inside `.sb-scan-section`, immediately after `#scanNote` (`index.html:897`):
   a checkbox-style control, e.g. `<label class="scan-selected-only"><input type="checkbox" id="selectedOnlyToggle" onchange="toggleSelectedOnly()"> Selected only</label>`, plus minimal matching CSS. No new color is introduced beyond the existing palette tokens.
2. **New state**, declared beside `_filterQuery` (`:6612`):
   - `let _selectedOnly = false;` — session-only, resets on reload.
   - `let _selectedOnlyPinned = null;` — `Set<symbol>` snapshot of the tickers that were in-scan the moment `Selected only` was last turned on, or the moment the search query last changed while it was on. `null` whenever `_selectedOnly` is `false`.
3. **New handler** `toggleSelectedOnly()`:
   - Flips `_selectedOnly`.
   - On turning **ON**: sets `_selectedOnlyPinned = new Set(watchlist.filter(e => e.inScan).map(e => e.symbol))`.
   - On turning **OFF**: sets `_selectedOnlyPinned = null`.
   - Calls `renderWatchlistRows()` then `updateRunScanCount()` (which refreshes `updateScanColToggle()`).
4. **Re-pin on search change.** In `filterWatchlistRows(query)` (`:7412-7420`), when the normalised query differs from `_filterQuery` **and** `_selectedOnly` is `true`, refresh `_selectedOnlyPinned` to the live in-scan snapshot before re-rendering — this is the explicit "filter/search state changes" moment after which a previously-unchecked-but-pinned row is allowed to drop out.
5. **Apply the pinned filter, as a second, separate `.filter(...)` statement, strictly after the existing 5-field search `.filter(e => ...)` statement** (never chained onto it — see §2 QA constraint), in all three places, unchanged in substance:
   - `renderWatchlistRows` (`:7442-7505`)
   - `toggleAllVisibleScanInclusion` (`:7422-7440`)
   - `updateScanColToggle` (`:6624-6644`)

   Shape in each: after the existing `rows = rows.filter(e => <5-field predicate>);` (or `visibleRows = visibleRows.filter(...)`), add:
   ```js
   if (_selectedOnly) {
     rows = rows.filter(e => _selectedOnlyPinned.has(e.symbol));
   }
   ```
   (variable name `rows`/`visibleRows` per the existing local in each function). `toggleAllVisibleScanInclusion` then toggles `inScan` only on this filtered set, and `updateScanColToggle` computes its all-checked/mixed state only over this filtered set — both already do this today for the search-filtered set; this is the same pattern, one filter step later.
6. **Empty state in `renderWatchlistRows`.** Precedence, most specific first:
   - `watchlist.length === 0` → existing `"Add tickers to get started"`.
   - else `_selectedOnly` is `true` and the row count after both filters is `0` → **new**: `"No tickers selected for the next scan."`
   - else (search produced no match) → existing `"No tickers match"`.
7. **Counts/badges.** No change to what `updateRunScanCount()` measures (`getScanSymbols()` stays a global, view-independent count, matching current behaviour); it is simply invoked on every toggle flip so `#scanCount`, `#runBtn` and `updateScanColToggle()`'s tri-state reflect the new view immediately.
8. **New QA suite** `qa/selected_only_watchlist_offline.js` (auto-discovered, §6).

## 4 · Out of scope

- Any persistence of the toggle (`localStorage`, `pt_*` keys, or any other store).
- Any change to scan-engine behaviour, `runAnalysis`, scoring, or `getScanSymbols()`'s definition.
- Any redesign of the Watchlist/All tabs, `switchTab`, or `_activeTab`.
- Any new data source or new field on a watchlist entry.
- Extracting the triplicated 5-field predicate into a shared helper (standing exclusion, carried from Entry 9 — not reopened here).
- Any unrelated UI cleanup.

## 5 · Expected implementation files — **2**

```
index.html                                   §3 items 1-7
qa/selected_only_watchlist_offline.js        NEW — §6
work/selected-only-watchlist/review.md       NEW — tracked task artifact
```

<!-- land-scope:begin -->
index.html
qa/selected_only_watchlist_offline.js
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/selected_only_watchlist_offline.js
<!-- land-tests:end -->

**QA suites that read in-scope files as text** (to be re-verified at plan time against the exact
pre-edit commit): `qa/ui_hygiene_offline.js` (UH-2/UH-3, §2 above — the governing constraint for
this task) and any other suite asserting on `renderWatchlistRows`, `toggleAllVisibleScanInclusion`,
or `updateScanColToggle` source shape. The Worker enumerates and confirms the full list at
plan time (step 1 of the Worker execution contract) before editing.

## 6 · QA boundary — `qa/selected_only_watchlist_offline.js`

Static assertions over `index.html`, each with a positive or negative control.

| ID | Assertion |
|---|---|
| **SO-1** | A `Selected only` toggle control exists inside `.sb-scan-section`, after `#scanNote` in source order. *Control:* a fixture without it fails |
| **SO-2** | `_selectedOnly` and `_selectedOnlyPinned` are declared, session-only (no `localStorage` read/write referencing either name anywhere in the file) |
| **SO-3** | In each of `renderWatchlistRows`, `toggleAllVisibleScanInclusion`, `updateScanColToggle`: the selected-only filter is a **second, separate** `.filter(...)` statement — not chained onto the 5-field search `.filter(e => ...)` call. *Control:* a fixture that chains them fails |
| **SO-4** | `UH-3`'s own check (the 5-field predicate, first-`.filter(e =>`-occurrence extraction) still returns exactly the frozen 5 fields in all three functions after this change — i.e. this task's own fixture re-runs the UH-3 predicate-extraction logic against the edited source and gets the same result as before. *Control:* a fixture where the new filter is chained (breaking the extraction) fails |
| **SO-5** | The literal empty-state string `No tickers selected for the next scan.` appears in `renderWatchlistRows`, reachable only on the `_selectedOnly`-true branch |
| **SO-6** | `toggleSelectedOnly()` calls both `renderWatchlistRows()` and `updateRunScanCount()` |
| **SO-7** | `filterWatchlistRows` re-pins `_selectedOnlyPinned` only when `_selectedOnly` is true and the query actually changed (not on every call) |

**Full gate:** `npm run qa:offline` green at the new suite count, and `qa/ui_hygiene_offline.js` (UH-1…UH-7) unchanged and passing.

## 7 · STOP conditions

1. Any file beyond the two in §5, or `review.md` missing from the implementation commit.
2. Any change to the 5-field search predicate itself, in any of the three functions.
3. Any chaining of the new selected-only filter onto the existing search `.filter(e => ...)` call (breaks UH-3's extraction — see §2, §3 item 5, §6 SO-3/SO-4).
4. Any `localStorage` read or write for the toggle or its pinned-set state.
5. Any change to scoring, ranking, `getScanSymbols()`, `runAnalysis`, or any `pt_*` key.
6. Any change to the Watchlist/All tab mechanism (`switchTab`, `_activeTab`).
7. A pre-edit `qa:offline` baseline that is not green (diagnose first, not a STOP by itself).

## 8 · Actor-to-Evidence Closure Check

| closeCondition | Evidence | Actor | Possessable before CLOSE? |
|---|---|---|---|
| Toggle present, OFF by default, not persisted | SO-1, SO-2 | Worker | YES |
| Search still works inside filtered view | manual QA scenario in `review.md` (type query with toggle ON, confirm subset) + SO-4 | Worker | YES |
| Uncheck-while-active does not look like deletion | manual QA scenario in `review.md` (toggle ON, uncheck one row, confirm it stays visible unchecked until query/toggle changes) | Worker | YES |
| Toggle-all affects only visible rows | existing `toggleAllVisibleScanInclusion` behaviour, re-verified against the pinned-filtered set | Worker | YES |
| Counts/badges update immediately | SO-6 + manual QA scenario | Worker | YES |
| Empty state copy exact | SO-5 | Worker | YES |
| Reload resets to OFF | SO-2 (no persistence) | Worker | YES |
| UH-3 contract intact | SO-3, SO-4, `qa/ui_hygiene_offline.js` green | Worker | YES |
| `qa:offline` full gate green | run log in `review.md` | Worker | YES |
| Diff reviewed | Codex (step 8 + final check) | Worker / Codex | NO — gate after CODE-READY |
| LAND | approval | Owner | NO — by design |

**SATISFIABLE offline.** No deploy, credential, or live call required.

## 9 · Definition of done

- `Selected only` toggle exists in `.sb-scan-section` next to `#scanNote`, default OFF, not persisted.
- ON shows only in-scan tickers (via the pinned snapshot); search narrows further within that view; OFF restores current behaviour exactly.
- Unchecking a ticker while the view is active leaves its row visible, unchecked, until the search query changes or the toggle is cycled off/on.
- `#scanCount`, `#runBtn`, and the `#scanColToggle` tri-state reflect the current view immediately on every toggle flip.
- Empty state shows `No tickers selected for the next scan.` exactly when `Selected only` is on and the view (after search) is empty, with the existing two empty-state strings unchanged for their own conditions.
- `qa/selected_only_watchlist_offline.js` passes SO-1…SO-7 with controls.
- `npm run qa:offline` is green, including `qa/ui_hygiene_offline.js` UH-1…UH-7 unchanged.
- `review.md` carries the manual QA scenario evidence, `## Lessons`, the files-changed block, and the final-check line.
