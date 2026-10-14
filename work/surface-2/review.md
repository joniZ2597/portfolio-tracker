# Review: surface-2 — explicit ETF / Stock choice, persisted through backup and cloud sync (BACKLOG 12, P2b)

## Result
PASS. All four slices implemented; each passed its targeted tests, land-tests, pin diff and a Codex slice review before its checkpoint commit.

Checkpoints on `task/surface-2` (base `c95cde5`): S1 `83c0afd` · S2 `3bf4140` · S3 `761f6d9` · S4 `ca32812`.

## Files changed
- Implementation (6): index.html, netlify/functions/portfolio-sync.js, qa/asset_choice_offline.js, qa/asset_type_offline.js, qa/fixtures/index-pins.json, BACKLOG.md
- Evidence (tracked): work/surface-2/brief.md, work/surface-2/review.md

## What changed
- S1: `ptEffectiveAssetType` (new, directly after `ptAssetType`, which is byte-identical to `105b9f9`); `migrateWatchlist` keeps a valid `assetType`; `saveWatchlist` writes it only when valid, as the last key; `_selectCats`, the C3 and C4 guards use the wrapper.
- S2: Edit-ticker select `editAssetType` (Automatic (ETF) / Automatic (Stock) / ETF / Stock) after the benchmark-ETF row; `saveEditModal` passes `assetType` to `upsertTicker`.
- S3: `_validatePortfolioBackup` keeps a valid `assetType` inline (no new helper, global or constant); `schemaVersion` stays 4; export, pre-import download and restore unchanged.
- S4: `_validateCloudDoc` and `_validateLocalForUpload` keep a valid `assetType` inline; server `buildPersistedSubset` adds it only when `'ETF'` / `'STOCK'` after `trimString`.

## QA
- Step 0 baseline (HEAD `c95cde5`, node v24.14.0): `npm run qa:offline` PASS 87 suites.
- Step 10 (tree = `ca32812` + the BACKLOG.md edit): `npm run qa:offline` PASS 88 suites = step 0 + 1 (`qa/asset_choice_offline.js`). The backup-fidelity, Phase 8 and server-gate sections of `qa/run-offline.js` pass unmodified.
- Land-tests (all rc=0 after every slice and at the end): asset_choice, asset_type, index_pins (and `index-pins --check` OK, 380 functions / 25 regions), fund_facts_read_client_test (RC34), fund_facts_panel_offline (PN17), portfolio_ticker_source_offline (BTS11), fund_facts_route_offline, labs_panel, deep_dive_v0, no_synthetic_score, high1y_label, ma_stack_label, ath_isolation, ui_hygiene.
- Heavy-run process check (read-only `wmic` listing through Bash, null-stripped; filter validated by counting `node.exe` lines first) before step 0 and before step 10: no other QA process.

## AC table (qa/asset_choice_offline.js — 13 rows, 40 planted negatives, 53 assertions)
| Row | Covers | Negatives |
|---|---|---|
| AC-1 | precedence: valid choice beats the classifier; none / invalid -> classifier; undefined / non-array watchlist | 3 |
| AC-2 | `saveWatchlist` byte-identity against the `105b9f9` function; `assetType` last key | 3 |
| AC-3 | `migrateWatchlist` keeps valid, drops invalid; other branches equal the oracle | 2 |
| AC-4 | `_selectCats`, Capital Returns and Fund Facts cards use the effective type | 3 |
| AC-5 | SETUP extraction (acorn), `ptAssetType` byte-identical, wrapper pure and directly after it | 3 |
| AC-6 | Edit-ticker control: options, labels ("Automatic (Stock)" for UNKNOWN), preselection, placement, no `innerHTML` with user values | 4 |
| AC-7 | save: ETF / Stock set the field, Automatic removes it, no other field and no `_techCache` change | 4 |
| AC-8 | `_validatePortfolioBackup` keeps valid / drops invalid; v1-v4 outputs equal the oracle | 3 |
| AC-9 | run-offline factory compatibility (validator + six dependencies); `.TA` pattern count = 3 | 2 |
| AC-10 | round trip save -> export -> validate -> restore -> load; export / restore / download functions unchanged | 2 |
| AC-13 | S2D-1: pre-feature backup over choices -> every entry Automatic; comment at the `assetType` line | 2 |
| AC-11 | cloud validators keep valid / drop invalid; no-field documents equal the oracle; `_applyCloudDoc` unchanged | 5 |
| AC-12 | server whitelist keeps valid / drops invalid (trimmed); no-field tickers equal the oracle; `SYMBOL_RE`, `whitelistServerDoc`, `handlePut` unchanged | 4 |

`qa/asset_type_offline.js`: AT-1..AT-6 unchanged; AT-7..AT-10 moved to the wrapper; the AT-5 negative anchor was updated because the wrapper now sits between `ptAssetType` and `PT_ETF_FUNDAMENTALS_NA_TEXT`; two negatives added (AT-7, AT-10). 25 assertions.

RED -> GREEN: every slice's new rows were run before the implementation and failed (missing wrapper / control / field, absent negative anchors), then passed after it.

## Re-pin ledger (`qa/fixtures/index-pins.json`, regenerated per slice with `index-pins --update`; `--diff <previous checkpoint>` printed and compared with brief section Y)
- S1: `ptEffectiveAssetType` (added), `migrateWatchlist`, `saveWatchlist`, `_runCRResearchCard`, `_runFundFactsCard`, `remainder` (the `_selectCats` line and the wrapper comment) — as expected.
- S2: `openEditModal`, `saveEditModal` — as expected.
- S3: `_validatePortfolioBackup` — as expected.
- S4: `_validateCloudDoc`, `_validateLocalForUpload` — as expected.
The `--diff` hunks show that only the listed lines moved each pin.

## S2D-1 (Owner ruling, documented in three places)
Restoring an older backup (or running an older build) may reset a manual ETF / Stock choice to Automatic. Documented in the source comment at the `assetType` line of `_validatePortfolioBackup`, in the `BACKLOG.md` entry-12 DONE line, and here. Tested by AC-10 and AC-13. No UI text was added.

## Codex ledger
- S1, S2, S3, S4 slice reviews (each on the slice diff, read-only): PASS, 0 findings each. Raw output in `codex.md`.
- Final check on the task diff including this file: one finding, classified Class I by Codex — this file pointed to a Final check line that did not exist yet. FIX: the line is recorded below. The fix touches only this evidence file (no implementation file), so no QA re-run and no scoped re-pass were required; the implementation, BACKLOG and scope checks in the same round were clean.
- Final check: 1 rounds, 1 class-I findings — 1 FIX, 0 DEFER, 0 REJECT, 0 unresolved; QA/re-pass performed where required; no class-II findings.

## Timing
- Step 0 `qa:offline`: 91740 ms. Step 10 `qa:offline`: 116630 ms. Whole task: one session on 2026-10-14.

## Backlog reconciliation
- Backlog row: entry 12 -> `close`. Action taken: `closed`.
- Entry 12 heading: "### 12 · Asset-type classifier + ETF suppression" -> "### 12 · Asset-type classifier + ETF suppression — **DONE**"; its Master paragraph now states that `surface-1` S1 (P2a) and `surface-2` (P2b) close the entry; one DONE / HISTORY line added after entry 11 (entry-number order) with the S2D-1 note. The snapshot tables and counts were not touched.
- The new BACKLOG text matches the diff, the QA results and the work being landed.

## Lessons
- [covered] `colFn` extraction ends at the closing brace without the trailing newline; extraction checks must expect that — covered by the pt-offline-suite coupling sweep (Class d).
- [local] A mutation anchor that was unique before a slice (the keep-line) stops being unique once the same line is added in two more validators; scope mutations with a per-function helper.
- [local] `qa/run-offline.js` extracts functions by brace counting, so comments added inside `_validatePortfolioBackup` must contain no brace characters.

LAND-EVIDENCE: qa-offline=PASS 88; targeted=PASS; codex-classI-unresolved=0
