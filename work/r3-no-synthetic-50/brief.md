# Task brief: r3-no-synthetic-50 — a failed AI analysis stays failed: null score, never a synthetic 50 (R-3)

Operational only when the Owner has approved these exact contents and the brief-only commit records them unchanged.

| | |
|---|---|
| Backlog | **New Entry 36, created and closed by this task** — "36 · Failed AI analysis shows no score, never a synthetic 50 (R-3)" (each remediation task owns its entry; 36 is the next free number at the baseline). `BACKLOG.md` is in the file set and land-scope (step 10a) |
| Baseline | `a183db8da42a1bce1135bf4585497f3ad387b988` (`branch-dev` = `origin/branch-dev`, after R-2) |
| Branch / slot | `task/r3-no-synthetic-50`, **Worker A** (detached and clean at `a183db8`). `index.html` lane, position 2 |
| Mode | **Manual** — scoring / null semantics (`orchestrate` overrides), a persistence gate (`_isValidScanResult`) and a ranking surface (`_srGroupResults`) |
| qa:offline | step-0 baseline **69** → **70** (+ `qa/no_synthetic_score_offline.js`). The count stays "unchanged from baseline + 1" if B2-auto lands first (then 71 → 72) |
| Parallel with | Worker B `task/r1b2-ath-auto` (server only): no shared file. **One full `qa:offline` at a time** |
| 3A-M | start the sampler before step 0 and step 10 (natural captures) |
| Status | FINAL (2026-10-08). Source: pilot finding N2 (NVDA, 3 Oct); Owner ruling D4 |

## 0. Owner rulings (not reopened)

1. **D4 (2026-10-07; confirmed 2026-10-08):**
   - a failed / null AI analysis **never** becomes a synthetic score of 50;
   - it **stays null / failed**;
   - Scan Results places failed / null scores **last**;
   - Daily Review shows a group **"Analysis failed — rescan"**;
   - **an old score is never shown as the current result**.
2. R-3 is **sensitive / Manual** (scoring and null semantics).
3. `index.html` lane, after R-2. **No new top-level function** in `index.html` (the R-2 lesson: render sandboxes use
   fixed helper lists).
4. Each remediation task creates and closes its own BACKLOG entry.

## 1. Current behaviour (read at `a183db8`)

- **The bug.** In `analyzeChunk`'s Anthropic fallback (both the error path and the parse-failure path), each result is
  built with `sentiment: 'neutral'`, **`sentiment_score: 50`**, `_aiUnavailable: true` and
  `_aiParseFailed: <bool>`. It then passes through `orchestrate` and `enforceScoreConsistency`. It is persisted because
  `_isValidScanResult` accepts the numeric 50.
- **Latent defects if the score were simply set to `null`** — R-3 must fix these together with the fallback:

  | Location | Defect |
  |---|---|
  | `orchestrate` | `chg > 5 && item.sentiment_score < 40` is **true for `null`**, which would turn a failed item into **55 / positive** |
  | `orchestrate` | the setup action overrides give a failed item an action (`hold_wait` / `avoid`), `sentiment: 'negative'`, a conflict and a key risk |
  | `_isValidScanResult` | **rejects** a `null` score. A failed rescan would be dropped, `mergeResultsByTicker` would keep the previous result, and **the old score would be shown as current** (violates D4.4) |
  | `renderMainPanel` Technical Setup "Score" row | `${score} / 100` with class `neg` would render **"null / 100"** |

- **Already correct, left unchanged:**
  - `_ptScoreNorm` / `_ptScoreText` / `_ptScoreCmp` (missing sorts after every numeric score) / `_ptScoreAvg` (missing
    excluded);
  - `enforceScoreConsistency` (skips `_aiUnavailable` and non-numeric);
  - `_ptScoreDial` (no-score dial);
  - `_renderPortfolioPanel` (`_aiUnavailable` → "Unavailable (AI analysis)", no score);
  - `_dd0FetchAnalysis` (`typeof === 'number'` guard);
  - `openScanResultsOverlay` / `_srRenderGrouped` (score via `_ptScoreText` → "—");
  - `applyCapitalReturnsNudge` — **uncalled**; `qa/run-offline.js` asserts it occurs exactly once. Not touched.

## 2. What must be true

1. **Fallback:** `analyzeChunk`'s fallback result has `sentiment_score: null`. Everything else in it is unchanged:
   `sentiment: 'neutral'`, summaries, `_aiUnavailable: true`, `_aiParseFailed`, alerts, news.
2. **`orchestrate`, for an item with `_aiUnavailable === true`:**
   - no score clamp or override changes its score (it stays `null`);
   - no action, sentiment, conflict or key-risk override is applied (no action is derived from a failed analysis);
   - identity, verified price / change, extended-hours cache, the deterministic `technical_setup`, the analyst alerts
     and the audit trail are unchanged.
   - The `chg` overrides also require `typeof item.sentiment_score === 'number'`, so no missing score can become a
     number.
   - **Every non-failed item behaves byte-for-byte as before** (fixture regression).
3. **`_isValidScanResult`:** additionally accepts `sentiment_score === null` **only when** `_aiUnavailable === true`.
   Every other predicate is unchanged, and a `null` score without `_aiUnavailable` is still rejected. A failed rescan
   therefore **replaces** the stored result (`mergeResultsByTicker`), and the old score is never kept as current.
4. **Scan Results (Ranked):** failed / null sorts last through the existing `_ptScoreCmp` (no change); its score cell
   is "—".
5. **Daily Review:**
   - `_srGroupResults` places **every** `_aiUnavailable === true` item in a new last group named exactly
     **`Analysis failed — rescan`**;
   - the other four groups and their membership rules are unchanged for non-failed items;
   - empty groups are not rendered (existing behaviour).
6. **Technical Setup card "Score" row:**
   - `null` → `—` in neutral colour (no digits, no "null");
   - numeric values render exactly as today, including the Entry 32 "from scan" marker;
   - the label literal `<span class="rr-lbl">Score</span>` is unchanged (`qa/run-offline.js` T6 counts it).
7. **The action block:** a failed item shows no dial and no Pulse chip, since it has no action. The existing
   "AI analysis unavailable" banner is unchanged.
8. **Unchanged:** prompts, retry logic, `enforceScoreConsistency`, `_ptScore*`, Tech Score,
   `classifyTechnicalSetup`, `localStorage` keys, backup / restore format (a `null` round-trips in JSON).

**Stated residual (not in scope):** results stored **before** this change with the synthetic 50 keep showing 50 until
that ticker is rescanned. They do move into the "Analysis failed — rescan" group because `_aiUnavailable` is set.
Normalising legacy stored values would change `_ptScoreCmp` semantics, which `qa/run-offline.js` Phase 13 pins
(ASK-tier). Owner remedy: rescan the affected tickers, or a later task.

## 3. Required / Recommended Skills

| Skill | Required / Recommended | Why |
|---|---|---|
| **`pt-offline-suite`** | **Required** | Five functions change across three pin classes (§4). Sweep, re-pins with revert proof, the R-3 revert tables, planted negatives |
| `pt-ai-output-change` | — | No prompt or AI-text change (the failure summaries are unchanged) |
| `browser-integrity-qa` | — | A failure cannot be forced live; offline fixtures only |

## 4. Files — exactly 10 + `review.md` (coupling sweep at `a183db8`, classes a–e)

**Functions changed in `index.html`:** `analyzeChunk` (one literal), `orchestrate` (guards), `_isValidScanResult` (one
predicate), `_srGroupResults` (one group), `renderMainPanel` (the Score row line). No new top-level function.

```
index.html                           §2.1–§2.6
qa/no_synthetic_score_offline.js     NEW — §5
qa/vis_score_caliper_offline.js      class a: renderMainPanel (CRLF) and _srGroupResults pins
qa/ts1_default_exposure_offline.js   class a: TX-3 renderMainPanel pin
qa/tech_snapshot_cache_offline.js    class a/e: NEW_RM_LF, NEW_RM_CALIPER_PIN, TC-11; TC-10 revert chain gains an R-3 table applied before the R-2 / A9 / I7 tables (the Score-row line is an I7 line); TC-13 / TC-15 must still hold
qa/high1y_label_offline.js           class a/b: HL-8 layer 1 (whole file with the named functions masked — analyzeChunk and _isValidScanResult are outside the mask) and layer-2 pins for orchestrate, _srGroupResults, renderMainPanel
qa/ma_stack_label_offline.js         class a/b: MS-7 revert chain (revertR2(revertR3(rm)) reproduces the pre-R-2 source); MS-8 PIN_MASKED_MINUS_RM_LF (whole file minus renderMainPanel)
qa/analyst_parser_offline.js         class b: AP-14 PIN_MASKED_FILE
qa/ath_isolation_offline.js          class b: AR-7i whole-index.html pin; AR-7f must still hold
BACKLOG.md                           Entry 36 created and closed
```

**Expected unmodified** (an edit to any of them is STOP-1):

| Suite | Why it should hold |
|---|---|
| `qa/run-offline.js` (ASK-tier) | Phase 6 terminal-chain checks (`enforceScoreConsistency` behaviour, `_isValidScanResult`'s existing cases, the mid-scan validator line, `applyCapitalReturnsNudge` occurring exactly once), Phase 13 score contract (injected items, unchanged helpers) and T6 (the "Score" label count) all hold |
| `qa/scan_results_enrichment_offline.js` | SE-3 computes its expectation from `_srGroupResults`; SIDE regex untouched |
| `qa/deep_dive_v0_offline.js` | — |
| `qa/ui_hygiene_offline.js` | — |
| the `tech_snapshot` `BASE_PINS` | `enforceScoreConsistency`, `_ptScore*`, `classifyTechnicalSetup`, `buildTechSnapshotBlock` are not edited |

<!-- land-scope:begin -->
index.html
qa/no_synthetic_score_offline.js
qa/vis_score_caliper_offline.js
qa/ts1_default_exposure_offline.js
qa/tech_snapshot_cache_offline.js
qa/high1y_label_offline.js
qa/ma_stack_label_offline.js
qa/analyst_parser_offline.js
qa/ath_isolation_offline.js
BACKLOG.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/no_synthetic_score_offline.js
node qa/vis_score_caliper_offline.js
node qa/ts1_default_exposure_offline.js
node qa/tech_snapshot_cache_offline.js
node qa/high1y_label_offline.js
node qa/ma_stack_label_offline.js
node qa/analyst_parser_offline.js
node qa/ath_isolation_offline.js
node qa/scan_results_enrichment_offline.js
node qa/deep_dive_v0_offline.js
node qa/ui_hygiene_offline.js
<!-- land-tests:end -->

## 5. QA — `qa/no_synthetic_score_offline.js` (real `index.html`; extracted functions in sandboxes; no new top-level names)

| ID | Requirement | Planted negative (on production source or fixtures) |
|---|---|---|
| NS-1 | The fallback (error and parse-failure paths) yields `sentiment_score === null`, `_aiUnavailable === true`; the other fields byte-identical | `50` restored |
| NS-2 | `orchestrate`: a failed item with `chg = +7` keeps `null` (no 55); with `chg = −7` stays `null` | `typeof` guard removed |
| NS-3 | `orchestrate`: a failed item on `extended_near_ath` / `below_key_mas` gets no action, no sentiment change, no conflict or key risk; the setup and audit trail are present | action override applied to failed items |
| NS-4 | `orchestrate`: non-failed fixtures (8 setups × chg ±7 / 0) produce output identical to the pre-task function | a guard leaking to normal items |
| NS-5 | `_isValidScanResult`: accepts `null` + `_aiUnavailable`; rejects `null` without it; rejects `null` + `_aiUnavailable` with a bad summary or sentiment; all pre-existing cases unchanged | `null` accepted without `_aiUnavailable` |
| NS-6 | Replacement: previous result `{AAPL, 72}` + new failed `{AAPL, null}` → the stored / merged result is the failed one; **72 is not shown** in Ranked, Daily Review or the panel | validator rejecting the failed item (old 72 survives) |
| NS-7 | Ranked order: `[0, 45, null, 90]` → 90, 45, 0, null; score cell "—" | — (existing comparator; asserted as a contract) |
| NS-8 | Daily Review: every `_aiUnavailable` item is in the last group, named exactly `Analysis failed — rescan`; non-failed membership identical to the pre-task function; an empty failed group is not rendered | failed item left in "Watch" |
| NS-9 | Score row: `null` → `—`, neutral class, no digits, no "null"; 70 → `70 / 100` (+ "from scan" when prices differ) | `${score} / 100` restored |
| NS-10 | Failed item in the panel: no dial, no Pulse chip; "AI analysis unavailable" banner present | dial rendered for a failed item |
| NS-11 | Isolation: `enforceScoreConsistency`, `_ptScore*`, `applyCapitalReturnsNudge`, `_renderPortfolioPanel`, `_dd0FetchAnalysis`, `classifyTechnicalSetup` byte-identical; no new top-level function | — |
| NS-12 | The R-3 revert tables reproduce each changed function's pre-task source byte-for-byte | a second region changed |

**Re-pins (each with revert proof):**
- caliper (`renderMainPanel`, `_srGroupResults`);
- TS1 TX-3;
- `tech_snapshot` (`NEW_RM_*`, TC-10 chain, TC-11);
- `high1y_label` (layer 1; layer 2 `orchestrate`, `_srGroupResults`, `renderMainPanel`);
- `ma_stack_label` (MS-7 chain, MS-8);
- `analyst_parser` AP-14;
- `ath_isolation` AR-7i.

**Full `qa:offline`:** 69 → 70, PASS.

## 6. Live actions

None. An optional DEV visual of a stored failed result happens only if one occurs naturally (COWORK, read-only).

## 7. Flow

- AGENTS.md steps 0–16, **Mode Manual**. `/plan` before the first file write, with the `CLAUDE.md` pre-flight
  checklist:
  - **State & Boundary Isolation:** names exactly the four scoring / persistence surfaces touched (`orchestrate`
    guards, `_isValidScanResult`, `_srGroupResults`, the fallback literal) and proves no other;
  - **Gate Verification:** "no runtime gate — semantics fix";
  - **definition of done:** §8.
- The `pt-offline-suite` sweep table and the re-pin ledger go into `plan.md`.
- **Before step 0's and step 10's full runs:** the Owner's heavy-lane go-ahead (the Owner starts the 3A-M sampler).

## 8. STOP (in addition to STOP-1..6)

- any change to `enforceScoreConsistency`, `_ptScore*`, `applyCapitalReturnsNudge`, prompts, retry logic,
  `classifyTechnicalSetup` or `localStorage` keys;
- a non-failed item's output changing;
- a new top-level function;
- a pin that the brief does not list trips;
- `qa/run-offline.js` or another unlisted suite needing an edit;
- a `null` score accepted without `_aiUnavailable`.

## 9. Definition of Done

- NS-1…NS-12 PASS with planted negatives caught.
- Listed re-pins done with revert proof.
- The land-tests PASS (the unmodified ones untouched).
- Full `qa:offline` PASS at 70.
- Entry 36 created and closed, with the stated residual recorded in its text.
- Codex: no unresolved Class I finding.
- LANDed, pushed, cleaned.
