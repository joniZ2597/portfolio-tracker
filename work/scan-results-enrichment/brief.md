# Task brief: Entry 10 — Scan Results row enrichment

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

| | |
|---|---|
| Backlog | **Entry 10** · Scan Results row enrichment (Daily Review) · Track: Portfolio Analysis → ARC: Scan & Review surfaces |
| Preparation baseline | **`20a81e2`** = `branch-dev` = `origin/branch-dev` |
| Last validated | `20a81e2`, 2026-09-26 — every anchor in §2 re-derived at this commit |
| Branch / slot | new `task/scan-results-enrichment`, bound to Worker slot **`pt-wt-worker-a`** (no new worktree path) |
| `qa:offline` | **47 → 48** — one new auto-discovered suite; `qa/run-offline.js` **not** edited |
| Lane | **B** (`index.html`) — one `index.html` task at a time. **Entry 9 dependency satisfied** (`bf936de`, landed) |
| Status | **CODE-READY on Owner approval of these exact contents** |

**Objective.** Show each scan-result row's Risk and Reward state and whether the ticker is currently
held, in **both** result renderers — presentation only, from values that already exist.

---

## 1 · Standing rulings carried in (not reopened)

| Ruling | Source |
|---|---|
| **Risk chip + Reward chip + Held marker, presentation only. No held-only toggle.** Score, rating, grouping, sort order, persistence, portfolio data and scoring logic unchanged | Owner D-1, 2026-09-12 (WP-P6) |
| Chips derive from `_ptScoreStates(_ptScoreNorm(r.sentiment_score))` — `riskState/riskCls`, `reward/rewardCls` — **never** `rs`/`rsCls` | WP-P6 §5; entry 9 removed the dead `rs`/`rsCls` locals |
| Held marker derives from **`loadHoldings()` membership at render time**, not the sticky `position.hasPosition` | WP-P6 §4 |
| Apply to **both** renderers (ranked and Daily Review) | WP-P6 §5 |
| Selected-for-scan visibility (BC-8) is **not** in this task — it is entry 11 | Owner D-2, 2026-09-12 |
| **Separate "Risk / Reward" column** (not folded into an existing cell); **"HELD" marker inside the ticker cell** | Owner, 2026-09-26 |
| **Responsive guard:** the new presentation must not regress existing narrow-width/mobile behaviour of the overlay — **without** redesigning the table or introducing broader layout changes (§3 item 5, SE-10) | Owner, 2026-09-26 |

## 2 · Reality check at `20a81e2`

| Surface | Anchor | State |
|---|---|---|
| Daily Review renderer | `_srRenderGrouped` `index.html:6526` | 6 columns; group header and empty row use `colspan="6"`; already computes `score = _ptScoreNorm(r.sentiment_score)` per row |
| Ranked renderer | inline in `openScanResultsOverlay` `:6703`, rows `:6739-6760` | 7 columns; empty row `colspan="7"`; score cell is the VSCR literal `<td class="r sr-score">${_vscCellHtml(score)}</td>` |
| Header | `<thead>` `:15498-15506` (`#`, Ticker, Company, Score, Rating, Setup, Chg %) | hidden in review mode (`.sr-panel.mode-review .sr-table thead{display:none}` `:496`) |
| Risk/Reward source | `_ptScoreStates` `:6467` | pure; `missing:true` branch returns `'—'` / `neutral-v` |
| Holdings source | `loadHoldings` `:8430` | returns a null-prototype map keyed by symbol; **reassigns the global `_pfRootCorrupted`** from storage on every call (idempotent re-derivation, already done at 24 call sites) |
| Row CSS | `.sr-sym` `:468`, `.sr-rating/.sr-setup/.sr-chg` `:488-491`, compact `:464-466` | — |
| **Narrow-width behaviour** | `.sr-overlay` `:433`, `.sr-panel` `:438` (`width:min(92vw,860px)`), `.sr-table-wrap` `:455` (`overflow-y:auto` ⇒ the table scrolls inside the panel), `.sr-table td` `:462` (`white-space:nowrap`) | **no `@media` rule targets the overlay**; the panel never exceeds 92vw, and wide rows scroll horizontally inside `.sr-table-wrap` — this is the behaviour that must not regress |
| **Caliper pins** | `qa/vis_score_caliper_offline.js` `PROTECTED_FN_HASHES` | **`_srRenderGrouped` is pinned** (raw CRLF host bytes) → must be re-pinned. `_srGroupResults`, `_ptScoreStates`, `_ptScore*` and the `.sr-score…` CSS block are pinned and **must not move**. `openScanResultsOverlay` is not hash-pinned, but its `RANKED_CELL` literal and the `vsc-` class-prefix boundary are asserted |
| Existing coverage | `qa/run-offline.js:3826+` (`_srGroupResults` behaviour) | untouched by this task |

## 3 · Scope — exactly these changes

1. **Header.** Insert one `<th>Risk / Reward</th>` after `Setup` in the `:15498` thead.
2. **Ranked renderer** (`openScanResultsOverlay`): add one cell after the setup cell —
   `<td class="sr-rr"><span class="sr-rr-chip ${riskCls}">${riskState}</span><span class="sr-rr-chip ${rewardCls}">${reward}</span></td>`;
   empty-row `colspan` `7 → 8`.
3. **Daily Review renderer** (`_srRenderGrouped`): the identical cell in the same position; group-header
   and empty-row `colspan` `6 → 7`.
4. **Held marker**, both renderers: inside the existing `sr-sym` cell, after the symbol,
   `<span class="sr-held">HELD</span>` when the row ticker (upper-cased, trimmed) is a key of the
   holdings map. **Read `loadHoldings()` once per render**, never per row. Absent / empty / corrupt
   holdings ⇒ no marker on any row, no error, no "not held" text.
5. **CSS.** New rules for `.sr-rr`, `.sr-rr-chip` (+ `pos/neg/warn/neutral-v` variants using the
   existing colour variables) and `.sr-held`, placed next to `:491`. Inline elements only — no
   `display:block|flex|grid`, no new row padding; font-size ≤ the existing `.sr-setup` size, so
   **row height is unchanged in both densities**.
   **Responsive guard:** no new `@media` rule; no `position`, `width`, `min-width` or `flex-basis`
   on the new classes; no edit to the `.sr-overlay`, `.sr-panel`, `.sr-table-wrap`, `.sr-table`
   (incl. `td`/`th`) or compact rules (`:433-466`, `:496`). The extra column is absorbed by the
   existing in-panel horizontal scroll; panel width and viewport fit are unchanged. The column stays
   visible in Compact density (no new hide rule).
6. **Caliper re-pin.** Change **only** the `_srRenderGrouped` value in `PROTECTED_FN_HASHES`, computed
   with the suite's own `extractFunctionSource` + `sha256` over the raw host (CRLF) bytes — same
   convention as the other nine; no newline normalization.
7. **New suite** `qa/scan_results_enrichment_offline.js` (§6), auto-discovered.

**Wording rule.** Chip text is **exactly** the `_ptScoreStates` return value — no text of this task's
own except the header `Risk / Reward` and the marker `HELD`.

## 4 · Out of scope

`_srGroupResults` (sort, thresholds, partition, group names/order) · `_ptScoreStates` and every other
`_ptScore*` function · `_vscCellHtml` and the `RANKED_CELL` literal · the `.sr-score…` protected CSS
block and any `vsc-` class · `sentiment_score`, `orchestrate`, `analyzeChunk`, `enforceScoreConsistency`
· any write to `pt_results`, `pt_tickers`, `pt_holdings`, `inScan` · `loadHoldings`/`saveHoldings`/
`_reconcileWatchlistPositionsFromHoldings` · the Key Levels card · a held-only filter · selected-for-scan
visibility (entry 11) · asset-type presentation (entry 12) · any change to the `Rating:` parse copy
inside the renderers.

## 5 · Expected implementation files — **3**

```
index.html                              §3 items 1-5
qa/vis_score_caliper_offline.js         §3 item 6 — one hash value
qa/scan_results_enrichment_offline.js   NEW — §6
work/scan-results-enrichment/review.md  NEW — tracked task artifact
```

**QA suites that read in-scope files as text** (Worker confirms against all `index.html` readers at plan
time): `vis_score_caliper_offline.js` (`_srRenderGrouped` pin — re-pinned; `RANKED_CELL` literal,
`vsc-` boundary, CSS pin and the other 9 function pins must stay green unchanged) ·
`run-offline.js` (`_srGroupResults`, `_ptScoreStates` behaviour — untouched code, must stay green) ·
`ui1b_cards_offline.js` (Key Levels — untouched) · `ui_hygiene_offline.js` (search predicates, Hebrew,
dead locals — untouched, must stay green).

## 6 · QA boundary — `qa/scan_results_enrichment_offline.js`

Real functions extracted from `index.html` into a sandbox; each assertion with a positive or negative
control.

| ID | Assertion |
|---|---|
| **SE-1** | **Chip fidelity** — for fixture scores covering every band edge (`0, 35, 36, 47, 48, 64, 65, 100`), each renderer's chip text/class equals `_ptScoreStates(_ptScoreNorm(score))` `riskState/riskCls` and `reward/rewardCls` exactly |
| **SE-2** | **No fabricated band** — `sentiment_score` null/absent/`'70'`/`NaN` ⇒ both chips `—` with `neutral-v`; no band word, no `0`. *Control:* a fixture rendering `MODERATE` for null fails |
| **SE-3** | **Grouping and order unchanged** — for a fixed fixture set, group names, group order and in-group ticker order from `_srRenderGrouped` equal `_srGroupResults` exactly; ranked order equals `sort(_ptScoreCmp)` |
| **SE-4** | **Held marker is presentation only** — with holdings `{AAA, CCC}`: marker on exactly those rows (case-insensitive ticker match); groups and row order byte-identical to the empty-holdings run. *Controls:* empty holdings ⇒ 0 markers; corrupt `pt_holdings` ⇒ 0 markers, no throw, no "not held" text |
| **SE-5** | **One holdings read per render** — `loadHoldings` called exactly once per renderer invocation regardless of row count |
| **SE-6** | **Both renderers agree** — same fixture item ⇒ identical chip and marker markup in ranked and review mode. *Control:* a fixture where only one renderer carries the cell fails |
| **SE-7** | **Column integrity** — ranked row cell count = header `<th>` count (8); review group-header/empty-row `colspan` = 7; ranked empty-row `colspan` = 8 |
| **SE-8** | **Density** — new CSS rules contain no `display:block|flex|grid`, no `padding`/`height`/`line-height` increase; new markup adds no `<div>` |
| **SE-9** | **No side effects** — the renderers' extracted sources contain no `localStorage.setItem`, `saveHoldings`, `orchestrate`, `analyzeChunk`, `enforceScoreConsistency`, `inScan =`, or `rs`/`rsCls` read |
| **SE-10** | **Responsive guard** — the existing overlay/panel/table-wrap/table/compact rule texts (`:433-466`, `:496`) are byte-identical to `20a81e2`; the `@media` rule count in `index.html` is unchanged; no new rule for `.sr-rr*`/`.sr-held` sets `position`, `width`, `min-width`, `flex-basis` or `display:block\|flex\|grid`. *Controls:* a fixture adding `min-width` to `.sr-rr` fails; a fixture editing `.sr-panel` width fails |

**Caliper:** `vis_score_caliper_offline.js` PASS with only `_srRenderGrouped`'s value changed.
**Browser (post-LAND Owner DEV check):** both modes × both densities at desktop and **375px** width —
chips visible, row height unchanged, HELD on held tickers only, the panel still fits the viewport and
the table still scrolls inside it (no page-level horizontal overflow).

## 7 · STOP conditions

1. Any file beyond §5, or `review.md` absent from the implementation commit.
2. Any change to `_srGroupResults`, any `_ptScore*` function, `_vscCellHtml`, the `RANKED_CELL` literal, the protected `.sr-score…` CSS block, or any caliper pin other than `_srRenderGrouped`.
3. Any write to `pt_*` storage or `inScan`; any scoring/ranking/grouping effect.
4. Any chip text not produced by `_ptScoreStates`, or any consumption of `rs`/`rsCls`.
5. Any held-only filter or other new control; any table redesign, new `@media` rule, or edit to the existing overlay/panel/table layout rules (SE-10).
6. Any edit to `qa/run-offline.js`.
7. Pre-edit `qa:offline` baseline not 47 green (diagnose under M4 first).

## 8 · Lifecycle / CLOSE

| closeCondition | Evidence | Actor | Possessable before CLOSE? |
|---|---|---|---|
| Enrichment correct in both renderers | SE-1, SE-2, SE-6, SE-7 | Worker | **YES** |
| Presentation only | SE-3, SE-4, SE-5, SE-9 + untouched `run-offline.js` coverage | Worker | **YES** |
| No responsive regression (static) | SE-10 | Worker | **YES** — the 375px browser confirmation is the post-LAND Owner DEV check |
| Re-pin is exactly this task's `_srRenderGrouped` change | review.md: old→new hash + extracted-source diff | Worker | **YES** |
| `qa:offline` PASS, 48 suites | full gate | Worker | **YES** |
| Diff reviewed | Codex (step 8 + final check), Worker-launched | Worker / Codex | NO — gate after CODE-READY |
| LAND | approval | Owner | NO — by design |

**SATISFIABLE offline.** No deploy, credential or live call.

## 9 · Definition of done

Both renderers show Risk/Reward chips and the HELD marker per §3; only `_srRenderGrouped` re-pinned;
SE-1…SE-10 pass with controls; `npm run qa:offline` green at **48**; `review.md` carries the re-pin
evidence, `## Lessons`, the files-changed block and the final-check line.
