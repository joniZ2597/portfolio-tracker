# Master Brief: surface-2 — explicit ETF / Stock choice, persisted through backup and cloud sync (BACKLOG 12, P2b)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL, HELD** (COWORK, 2026-10-13). Batch **`2026-10-13-B2`, position 4**.
- Swept at `105b9f9`; re-swept at the batch base `c72697756719a1c79f478cd0e4c468001f19fb18`. Every §A anchor matches once; every target function is byte-identical to `105b9f9`; the oracle commit stays `105b9f9`.
- Scope unchanged (A-5).
- The brief is committed with the batch.
- **Task-start is sequential (§SEQ):** only after `score-boost-removal-1` has LANDed, been pushed and been cleaned up, and after the §TS checks pass. Any §TS failure → STOP, return to COWORK.

| | |
|---|---|
| Rulings | **SD-1…SD-7** approved in principle (2026-10-12); this brief fixes the exact storage / migration contract (§SC) |
| Backlog | Entry **12** → `close` (P2a landed in `surface-1`, P2b here). `BACKLOG.md` is in scope for step-10a reconciliation of entry 12 only |
| Baseline | Batch base `c726977`. **Valid only if** the §TS task-start checks pass at the task-start tip |
| Branch / slot | `task/surface-2`, first free slot, created from the tip **after** `score-boost-removal-1` cleanup (`ai-output-2` and GU-2 have long since landed) |
| Mode | **Manual** — persistence, backup and cloud-sync contract, plus one server file |
| qa:offline | step-0 count → **+1** (`qa/asset_choice_offline.js`) |
| Parallel with | Worker B on a lane-B task that does **not** touch `netlify/functions/portfolio-sync.js`, `index.html`, `BACKLOG.md` entry 12 or `qa/run-offline.js`. Conflict check at placement. One heavy / forced run at a time |

**Objective.**
- **Choice:** the user can set a ticker to **Automatic / ETF / Stock** in the Edit-ticker dialog.
- **Effect:** the choice drives the ETF behaviour `surface-1` introduced (catalyst categories, the Capital Returns and Fund Facts "not applicable" text).
- **Persistence:** it is stored in the watchlist and survives backup → restore and cloud save → load.
- **Unchanged:** entries without a choice are byte-identical in storage, in backups and in cloud documents; `ptAssetType` stays pure.

## §SEQ / §TS Sequential start and task-start baseline checks (Bootstrap, read-only, at the task-start tip T)

**Predecessor:** `score-boost-removal-1`. Its LAND, PUSH and `cleanup` entries are in `pt-land-log`; `branch-dev` = `origin/branch-dev` = T. The canonical checkout is clean; `task/surface-2` and its record are absent.

| # | Check (all must hold; else STOP and return to COWORK) | Value at batch base `c726977` |
|---|---|---|
| TS-1 | pins at T **equal** the base for every target function: `ptAssetType`, `migrateWatchlist`, `loadWatchlist`, `saveWatchlist`, `upsertTicker`, `openEditModal`, `saveEditModal`, `_runCRResearchCard`, `_runFundFactsCard`, `exportPortfolioBackup`, `_downloadPreImportBackup`, `_validatePortfolioBackup`, `importPortfolioBackup`, `_validateCloudDoc`, `_applyCloudDoc`, `_validateLocalForUpload` | `ae0b8ead` · `f0dd6fdb` · `c17673d4` · `3193971f` · `4687e2d3` · `3837962a` · `e64bb675` · `8c71c7c7` · `148bbe17` · `b5b5906c` · `156b6aab` · `db5c19a5` · `81311e2c` · `81d0b344` · `97163297` · `3b8619b5` (all identical to `105b9f9`) |
| TS-2 | blobs at T equal the base: `netlify/functions/portfolio-sync.js`, `qa/asset_type_offline.js`, `qa/portfolio_ticker_source_offline.js`, `qa/fund_facts_route_offline.js`, `qa/fund_facts_read_client_test.js`, `qa/fund_facts_panel_offline.js` | `776e09a265cf` · `1eab25015297` · `cccf66009693` · `f098d7b6fddb` · `a0829943fbe9` · `bc26f9900c0f` |
| TS-3 | `qa/run-offline.js` at T differs from the base (`354191e67a90`) **only** in `score-boost-removal-1`'s approved §PS rows (`git diff c726977 T -- qa/run-offline.js`). The backup-fidelity, Phase 8 and server-gate sections are unchanged; the `.TA` pattern count = 3 | — |
| TS-4 | every §A text anchor matches exactly once (line numbers informational) | matched at `c726977` |
| TS-5 | `ptEffectiveAssetType`, `editAssetType`, `qa/asset_choice_offline.js` absent; `work/surface-2/` contains only `brief.md` | absent |

## §D Open decisions

None. S2D-1 was ruled on 2026-10-12 (§0).

## §0 Rulings (not reopened)

| Ruling | Content |
|---|---|
| **S2D-1** (2026-10-12) | **APPROVED.** Restoring an older backup (or running an older build) may reset a manual ETF / Stock choice to Automatic. **Document** it in three places: <br>• a source comment at the `assetType` line of `_validatePortfolioBackup`; <br>• the `BACKLOG.md` entry-12 DONE line; <br>• `work/surface-2/review.md`. <br>**Test** backup / restore compatibility (AC-10, AC-13). No UI text is added |
| SD-1 | an optional `assetType` field on the `pt_tickers` entry |
| SD-2 | written only when set |
| SD-3 | three-way control |
| SD-4 | `ptAssetType` stays pure; the wrapper `ptEffectiveAssetType` serves the three call sites |
| SD-5 | additive field in backup v4 (no version bump) |
| SD-6 | cloud sync included (client validators + server whitelist) |
| SD-7 | Automatic + UNKNOWN is shown as "Automatic (Stock)" |
| 12-E / 12-F | explicit choice; UNKNOWN behaves as STOCK, never ETF |
| PC-2 / PC-3 | frozen revert chains; no new top-level function referenced by `renderMainPanel` |

## §SC Storage / migration contract (exact; validated in code at `105b9f9`)

| # | Contract |
|---|---|
| SC-1 | Field `assetType`. Valid values exactly `'ETF'` or `'STOCK'`. Absent or any other value = **Automatic** |
| SC-2 | `saveWatchlist` (:5227) writes `assetType` **only when valid**, as the **last** key after `position`. A list without valid choices serialises **byte-identically** to today |
| SC-3 | `migrateWatchlist` (:5189), object branch, keeps a valid `assetType` and drops anything else. The null / unparseable / non-array / empty / legacy `string[]` branches are unchanged |
| SC-4 | **Backup:** `exportPortfolioBackup` (:14522) and `_downloadPreImportBackup` (:14618) are **unchanged** (they export raw `pt_tickers`, so the field travels). `_validatePortfolioBackup` (:14700): the ticker rebuild keeps a valid `assetType` **inline** (`(t.assetType === 'ETF' \|\| t.assetType === 'STOCK')`) and drops anything else. **No new helper, global or constant** (`qa/run-offline.js` builds a factory from this function plus exactly six listed dependencies). The `.TA` symbol pattern still occurs exactly 3 times. `schemaVersion` stays 4; v1–v4 accepted as today; a backup without the field restores as Automatic |
| SC-5 | **Cloud:** `_validateCloudDoc` (:15155) and `_validateLocalForUpload` (:15510) keep a valid `assetType` inline, as in SC-4. Server `netlify/functions/portfolio-sync.js` `buildPersistedSubset` (:184) adds `assetType` to the rebuilt ticker only when valid (`'ETF'` / `'STOCK'` after `trimString`). `SYMBOL_RE` literal, `schemaVersion` 1, the gate and the response shapes are unchanged. `whitelistServerDoc` is unchanged (it passes stored tickers through) |
| SC-6 | `ptEffectiveAssetType(sym)`: a new top-level function placed directly after `ptAssetType`. It returns the valid `assetType` of the **in-memory** watchlist entry for the upper-cased, trimmed `sym` when present, otherwise `ptAssetType(sym)`. It is `typeof`-guarded so it works when `watchlist` is undefined (isolated sandboxes). No storage, DOM, network or clock. `ptAssetType` is byte-identical |
| SC-7 | **Call sites** switch to the wrapper, structure otherwise byte-identical: `_selectCats` (:12777) → `ptEffectiveAssetType(sym) === 'ETF'`; the C3 / C4 guards in `_runCRResearchCard` (:13797) / `_runFundFactsCard` (:14195) → `typeof ptEffectiveAssetType === 'function' && ptEffectiveAssetType(sym) === 'ETF'` |
| SC-8 | Restores (`importPortfolioBackup`, `_applyCloudDoc`) are unchanged: they write the validated tickers, and the next `loadWatchlist` applies SC-3 |

## §A Anchors (text binding; `:N` at `105b9f9`; at `c726977` +25 … +55, informational)

| Anchor | Line |
|---|---|
| `function ptAssetType(sym) {` (+ `var PT_ETF_FUNDAMENTALS_NA_TEXT` after it) | :5150 / :5157 |
| `function migrateWatchlist(raw) {` · `let watchlist = [];` · `function loadWatchlist() {` · `function saveWatchlist() {` · `function findTicker(symbol)` · `function upsertTicker(symbol, fields) {` | :5189 · :5217 · :5219 · :5227 · :5242 · :5244 |
| `function openEditModal(sym) {` (`editSectorEtf` select inside) · `function saveEditModal() {` | :7613 · :7789 |
| `const _selectCats = sym => ptAssetType(sym) === 'ETF' ? …` | :12777 |
| C3 / C4 lines (`if (typeof ptAssetType === 'function' && ptAssetType(sym) === 'ETF') { …`) | :13797 · :14195 |
| `function exportPortfolioBackup()` · `function _downloadPreImportBackup()` · `function _validatePortfolioBackup(obj)` · `function importPortfolioBackup(file)` | :14522 · :14618 · :14700 · :14915 |
| `function _validateCloudDoc(doc)` · `function _applyCloudDoc(result)` · `function _validateLocalForUpload()` | :15155 · :15329 · :15510 |
| `portfolio-sync.js`: `const SYMBOL_RE = /^[A-Z]{1,10}$/;` · `function buildPersistedSubset(parsed) {` · its `tickers.push({` | :14 · :184 · within |

**Pin-span check (`105b9f9`):**
- core 378 = acorn 378, errors 0.
- **AT-RISK** (brace characters in literals; each needs a post-change SETUP row, P-3): `ptAssetType`, `_validatePortfolioBackup`, `_validateCloudDoc`, `_validateLocalForUpload`.
- All other targets COMPLETE, no warning.

## §1 Slices (continuous; automatic continuation on PASS)

| Slice | Content | Entry |
|---|---|---|
| **S1 — model + effective type** | SC-1, SC-2, SC-3, SC-6, SC-7; `qa/asset_type_offline.js` updated (AT-7 / AT-8 / AT-9 / AT-10 to the wrapper; AT-1…AT-6 unchanged; its negatives updated accordingly); new suite rows AC-1…AC-5 | §P; step 0 |
| **S2 — Edit-ticker control** | a select `id="editAssetType"` after the benchmark-ETF row:<br>• options `""` = "Automatic (ETF)" / "Automatic (Stock)", from `ptAssetType`, UNKNOWN → Stock;<br>• `"ETF"` = "ETF"; `"STOCK"` = "Stock";<br>• preselect a valid `entry.assetType`, else `""`.<br>`saveEditModal` passes `assetType: (v === 'ETF' \|\| v === 'STOCK') ? v : undefined` to `upsertTicker` (unchanged).<br>Text through `textContent` / `option.text` only; no `_techCache` change; sidebar label unchanged. Rows AC-6…AC-7 | S1 checkpoint |
| **S3 — backup** | SC-4, SC-8, S2D-1 documentation; rows AC-8…AC-10, AC-13 | S2 checkpoint |
| **S4 — cloud** | SC-5; rows AC-11…AC-12 | S3 checkpoint |

**§2 Continuation (no Owner gate between slices).** After each checkpoint the Worker continues when all of these hold:
- the slice's targeted tests and land-tests PASS;
- `index-pins --diff <previous checkpoint>` equals the slice's expected entries (§Y);
- Codex has no unresolved Class I (one scoped re-pass);
- the next entry condition holds;
- §A still matches.

M-5 gaps → `review.md` lessons.

**Program STOP:**
- an unexpected suite failure;
- an unresolved Class I;
- a brief / repo mismatch;
- a new Owner decision;
- any ASK / DENY / protected path;
- any live / env / Netlify action;
- any change to entries without a choice, to scoring, scan, prompt or `schemaVersion`;
- an edit to `qa/run-offline.js`, `fund_facts_*` suites, `portfolio_ticker_source` or `fund_facts_route`;
- a second heavy run.

## §T Tests — new `qa/asset_choice_offline.js` (pure Node; real `index.html` and `portfolio-sync.js` extracted by text; DOM / storage stubs; every row has a planted negative)

| ID | Assertion |
|---|---|
| AC-1 | Precedence: a choice beats the classifier (Stock on `SPY` → STOCK; ETF on `NVDA` → ETF); no choice → `ptAssetType`; invalid stored values (`'etf'`, `'BOND'`, `42`) → classifier |
| AC-2 | `saveWatchlist` byte-identity: fixture lists without choices serialise exactly as the `105b9f9` function does (old function text embedded as the oracle); with a choice, `assetType` is the last key |
| AC-3 | `migrateWatchlist` keeps valid values and drops invalid ones; legacy / null / empty branches equal the oracle |
| AC-4 | Call sites: ETF choice on `NVDA` → 2 catalyst categories, CR / FF cards show the N/A text with no fetch / read spy call; Stock choice on `SPY` → the stock category list (`….slice(0, MAX_CALLS)`), one fetch / read |
| AC-5 | SETUP: `ptAssetType`, `ptEffectiveAssetType` and both card functions extract completely (P-3); `ptAssetType` byte-identical |
| AC-6 | Control: options and labels (incl. "Automatic (Stock)" for UNKNOWN), preselection, no `innerHTML` with user values |
| AC-7 | Save: ETF / Stock set the field; Automatic removes it from storage; no other entry field changes |
| AC-8 | `_validatePortfolioBackup` keeps valid / drops invalid; v1–v4 fixtures without the field produce outputs equal to the `105b9f9` oracle |
| AC-9 | run-offline factory compatibility: the validator plus its six dependencies evaluate standalone; the `.TA` pattern count = 3 |
| AC-10 | Round-trip: export → validate → restore → load keeps choices; a pre-feature backup restores as Automatic |
| AC-13 | S2D-1: restoring a pre-feature (no-`assetType`) v4 backup over a watchlist that has choices → every restored entry is Automatic; the documented comment is present at the `_validatePortfolioBackup` `assetType` line |
| AC-11 | `_validateCloudDoc` / `_validateLocalForUpload` keep valid / drop invalid; documents without the field equal the oracle |
| AC-12 | Server `buildPersistedSubset` (extracted): keeps valid / drops invalid; tickers without the field equal the oracle; `SYMBOL_RE` literal unchanged |

**Must pass unmodified:**
- `qa/run-offline.js` (backup-fidelity, Phase 8, server-gate);
- `fund_facts_read_client_test` (RC34), `fund_facts_panel_offline` (PN17);
- `portfolio_ticker_source_offline` (BTS11 literal), `fund_facts_route_offline`;
- `labs_panel`, `deep_dive_v0`, `ui_hygiene`;
- the map-based whole-file suites after `--update`.

## §PEP Execution preflight

| Step | Item | Class |
|---|---|---|
| all | land-test suites, `npm run qa:offline`, `git` read commands, `git commit` (r9), Codex read-only, `node qa/tools/index-pins.js …` (A after GU-2) | A |
| S1–S4 | oracle texts come from `git show 105b9f9:index.html` / `…:netlify/functions/portfolio-sync.js` inside the suite (no scratch file) | A |
| §L only | archive to `pt-work-artifacts/surface-2-s<k>/<UTC>/`, `git restore` | B (exceptional) |
| close | R11 record · R12 LAND / PUSH (`land` / `push` prompt by GU-2 rule) · heavy-lane go-ahead only if E1-D7 is due | C |

- **Expected prompts:** the R12 verbs only, once GU-2 has landed.
- **Continuation:** no Owner input between slices.

## §UER Execution readiness: **ATTENDED-ONLY**

Persistence and server-file change; T6 / forgery / egress / secrets are not technically mitigated.

## §CMD Command card (one command per Bash call; Bash only; absolute canonical root)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
node qa/guard_integrity_check.js --task task/surface-2 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/asset_choice_offline.js
node qa/asset_type_offline.js
node qa/portfolio_ticker_source_offline.js
node qa/tools/index-pins.js --diff <base>
node qa/tools/index-pins.js --update
node qa/tools/index-pins.js --check
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/surface-2 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/surface-2
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (expected prompts):** `git add <explicit paths>`.
- **C (Owner gates):** R11, R12 LAND, R12 PUSH.
- **Never:** `curl`, `WebFetch`, `netlify`, PowerShell.
- **L9 readiness:** before the step-13 commit and again before `land-request`, run the Grep-tool checks E1 = 1, E2 = 1, E3 = 0 on `work/surface-2/review.md`.

## §X Closure

1. Step 10 full `qa:offline` (= step 0 + 1) PASS.
2. Step 10a: `BACKLOG.md` entry 12 → `close` + DONE line (with the S2D-1 note).
3. `review.md`:
   - the AC table;
   - the S2D-1 documentation;
   - `## Backlog reconciliation`;
   - **LAND-EVIDENCE line (L9)**: `review.md` contains **exactly one** line, on its own, starting at column 1, with no bullet, backticks, bold or trailing spaces: `LAND-EVIDENCE: qa-offline=PASS <N>; targeted=PASS; codex-classI-unresolved=0`.
     - `<N>` = the step-10 suite count.
     - Write it only when step 10, every land-test and Codex (no unresolved class I) passed.
     - Commit it in the same commit as the final implementation. It is the only occurrence of `LAND-EVIDENCE:` in `review.md`.
     - The integrity-check output is **not** written into `review.md`; it goes only in the step-13 STOP report.
     - **After an L9 refusal: STOP-6.** No recovery commit without an explicit, incident-specific Owner ruling.
4. Final Codex check.
5. Step 13; integrity; R12 LAND / push / cleanup.
6. COWORK post-push DEV check (read-only, separately approved): open the Edit dialog view only, with no save.

## §Y Files, land-scope, land-tests

```
index.html                                ptEffectiveAssetType (new) · migrateWatchlist · saveWatchlist · openEditModal · saveEditModal ·
                                          _selectCats (IIFE) · _runCRResearchCard · _runFundFactsCard · _validatePortfolioBackup ·
                                          _validateCloudDoc · _validateLocalForUpload
netlify/functions/portfolio-sync.js       buildPersistedSubset only
qa/asset_choice_offline.js                NEW (AC-1…AC-13)
qa/asset_type_offline.js                  AT-7…AT-10 to the wrapper (+ negatives)
qa/fixtures/index-pins.json               regenerated per slice
BACKLOG.md                                step 10a: entry 12 → closed + DONE line
```

**Expected pin `--diff`:**
- **S1:** `functions.ptEffectiveAssetType` (added), `functions.migrateWatchlist`, `functions.saveWatchlist`, `functions._runCRResearchCard`, `functions._runFundFactsCard`, `remainderSha256` (the IIFE `_selectCats` line), file digest.
- **S2:** `functions.openEditModal`, `functions.saveEditModal`, file digest.
- **S3:** `functions._validatePortfolioBackup`, file digest.
- **S4:** `functions._validateCloudDoc`, `functions._validateLocalForUpload`, file digest.

<!-- land-scope:begin -->
index.html
netlify/functions/portfolio-sync.js
qa/asset_choice_offline.js
qa/asset_type_offline.js
qa/fixtures/index-pins.json
BACKLOG.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/asset_choice_offline.js
node qa/asset_type_offline.js
node qa/tools/index-pins.js --check
node qa/index_pins_offline.js
node qa/fund_facts_read_client_test.js
node qa/fund_facts_panel_offline.js
node qa/portfolio_ticker_source_offline.js
node qa/fund_facts_route_offline.js
node qa/labs_panel_offline.js
node qa/deep_dive_v0_offline.js
node qa/no_synthetic_score_offline.js
node qa/high1y_label_offline.js
node qa/ma_stack_label_offline.js
node qa/ath_isolation_offline.js
node qa/ui_hygiene_offline.js
<!-- land-tests:end -->

**Skills:** `pt-offline-suite` Required. `/plan` mandatory (all four slices before S1).

**§L:** close at the last passed slice (M-4): archive first, reset only the unfinished slice, regenerate pins, step 10, `review.md`, Codex, step 13, LAND.

**Effort:** medium (four slices; the largest risk is S4's server file).
