# Master Brief: tase-units-1 — TASE prices in ILS on screen and in AI prompts; research lookup for dotted symbols (CB-1; PA-01 + PA-02; priority HIGH)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL, HELD** (COWORK, 2026-10-13). Batch **`2026-10-13-B2`, position 2**; §D ruled (A-2).
- Swept at `2c2b0d9`; re-swept at the batch base `c72697756719a1c79f478cd0e4c468001f19fb18`.
- The brief is committed with the batch.
- **Task-start is sequential (§SEQ):** only after `market-status-pill-1` has LANDed, been pushed and been cleaned up, and after the §TS checks pass at that tip. The brief text is designed not to need an edit for that; any §TS failure → STOP, return to COWORK.

| | |
|---|---|
| Evidence | Audit register: PA-01 (V-DEV: stored narratives "$8884", "$43,970", "$21,550"; Portfolio ₪88.00 vs Research $8884.00 for MTRX.TA). PA-02 (V-CODE + DEV: all `.TA` results with 0 catalysts and 8 sources). COWORK prototype §F |
| Backlog | none (audit findings) |
| Baseline | Batch base `c726977`. **Valid only if** the §TS task-start checks pass at the task-start tip. `functions._athAccept`, `_pfLiveNormalize`, `_nlmConsistencyChecks`, `analyzeChunk`, `orchestrate` and `fetchYahoo` stay byte-identical **through** this task |
| Branch / slot | `task/tase-units-1`, first free slot, created from the tip **after** `market-status-pill-1` cleanup (not from the batch commit) |
| Mode | **Manual**, attended. It changes AI **input** text for `.TA` (research now present; prices in ILS). No scoring **logic**, storage or network change |
| qa:offline | step-0 count **+1** (`qa/tase_units_offline.js`) |
| Parallel with | not with any `index.html` / pins task; may run alongside a disjoint lane-B task. One heavy run at a time |

## §0 Findings

| ID | Statement | Status | Evidence (`2c2b0d9`) |
|---|---|---|---|
| F-1 | `fetchYahoo` returns `.TA` prices in **agorot** (Yahoo currency `ILA`) with no conversion. `meta.currency` is in scope but not returned | **Confirmed** | :5356–5409 |
| F-2 | The research panel shows agorot with a hard-coded `$`: <br>• header price :8245; <br>• post-↻ price :8488; <br>• change amount :8675; <br>• extended price :8697; <br>• `fmtMA` :8385–8388 (MA rows) | **Confirmed** | code + DEV |
| F-3 | AI prompts carry agorot with `$`: <br>• `formatStockContext` :5506–5518 (price, open, prev close, high, low); <br>• `buildTechSnapshotBlock` :1141–1143 (MA levels; also used by Deep Dive) | **Confirmed** | code; DEV narratives |
| F-4 | Existing conversions to reuse as patterns: <br>• `_pfLiveNormalize` (`meta.currency === 'ILA'` → ÷100, ILS); <br>• `_athAccept` :6620 (`unit === 'ILA'`); <br>• ATH row :8596–8599 (suffix `/\.TA$/`, `_dispRaw / 100`), which **assumes stored `_verifiedPrice` is agorot** | **Confirmed** | code; `ath_client` AC-11 |
| F-5 | The ratios are unit-safe today: pct-from-MA, 1Y-high distance, RS and volume use the same raw units on both sides | **Confirmed** | code |
| F-6 | Ticker-header regex `([A-Z]{1,6})(?=\b|\*\*|\s|$)` :5925 turns `MTRX.TA` into `MTRX` and `BRK.B` into `BRK`. The lookup `finalParsed[sym]` :6859 misses, and `__raw__` is not built, so research is dropped. This forces a wasted retry (`parsedFrom: 'empty'`) and the prompt says "No research data" | **Confirmed** | code; DEV |
| F-7 | The consistency checker K2 / K3 binds only to `$`-prefixed levels, and K3 also uses the raw `_verifiedPrice` internally | **Confirmed** | :7212–7234 |
| I-1 | Stored `pt_results` values (`_verifiedPrice`, candles, snapshots) stay in **raw provider units**. This keeps F-4 / F-5 / F-7 consistent and requires no data migration | **Design rule (this brief)** | — |

## §D Rulings (Owner A-2, 2026-10-13: all four defaults approved; no open decision)

| ID | Question | Ruling (A-2) |
|---|---|---|
| CB1-D1 | Where to convert | **Display and prompt layer only** (I-1), using the suffix rule `/\.TA$/` already used by the ATH row and the server. Converting at fetch time would divide the ATH row twice, mix units in stored results and break the K-check references |
| CB1-D2 | Consistency-check callers (:7290, :7490, :8624) | **Unchanged**: they keep passing raw prices. <br>• New `.TA` narratives state levels in ILS without `$`, so K2 / K3 skip them. <br>• Legacy `$8884` narratives stay internally consistent until rescan. <br>• Converting the callers would raise false flags on every legacy `.TA` result |
| CB1-D3 | Display currency format | Screen: **`₪88.84`** (as the Portfolio view). AI prompt: **`88.84 ILS`** (as the existing ATH prompt line) plus one `CURRENCY:` instruction line |
| CB1-D4 | If Perplexity echoes `TICKER: MTRX` (no suffix), a fallback lookup would need `analyzeChunk` (scoring-engine boundary) | **Out of scope.** The prompt asks for `TICKER: ${ticker}`. The post-push check observes the actual echo; a miss becomes a separate, scoring-boundary item |

## §SEQ / §TS Sequential start and task-start baseline checks (Bootstrap, read-only, at the task-start tip T)

**Predecessor:** `market-status-pill-1`. Its R12 LAND, PUSH and `cleanup` entries are in `pt-land-log`; `branch-dev` = `origin/branch-dev` = T.

| # | Check (all must hold; else STOP and return to COWORK) | Value at batch base `c726977` |
|---|---|---|
| TS-1 | `qa/fixtures/index-pins.json` at T: `functions.formatStockContext`, `buildTechSnapshotBlock`, `parsePerplexityContext`, `fetchYahoo`, `_athAccept`, `_pfLiveNormalize`, `_nlmConsistencyChecks`, `analyzeChunk`, `orchestrate` **equal** the base values | `e29ee0be…` · `2428a64e…` · `41b8f490…` · `03b4938e…` · `02bb7e3a…` · `c9e3b362…` · `6716b144…` · `e9303a06…` · `2e352b3f…` |
| TS-2 | every §A text anchor matches exactly once in `index.html` at T. Line numbers are informational (CB-3a inserts about 20 lines above `renderMainPanel`) | all matched once at `c726977` |
| TS-3 | `git rev-parse T:qa/tech_snapshot_cache_offline.js` equals the base blob (the TC-12 static constants this task replaces are unchanged) | `74c32496ade3…` |
| TS-4 | `qa/labs_panel_offline.js` at T differs from the base **only** in `BASE_PINS.renderMainPanel` (CB-3a's permitted edit): `git diff c726977 T -- qa/labs_panel_offline.js` | base blob `4c56dc828021…` |
| TS-5 | `qa/tase_units_offline.js` absent | absent |

**At `c726977`** (read-only re-sweep):
- prompts and parser are unchanged (:5506–5514, :1131–1143, :5925);
- the display sites are at :8255, :8397, :8498, :8685, :8707;
- NC-2 changed only `_nlmConsistencyChecks` (K2 / K3 still bind to `$` levels), which confirms CB1-D2.

## §A Anchors (text is binding and must match exactly once at task start; `:N` = line at `2c2b0d9`, informational)

| Anchor | Line |
|---|---|
| `function formatStockContext(stockMap) {` · `  const lines = Object.values(stockMap).map(d => {` | :5506 · :5508 |
| `` `  Price: $${d.price} (${chg}) | Open: $${d.open} | Prev Close: $${d.previous_close}\n` + `` | :5513 |
| `` `  Intraday High: $${d.high} | Intraday Low: $${d.low} | Volume: ${d.volume.toLocaleString()}\n` + `` | :5514 |
| `function buildTechSnapshotBlock(sym, snap, setupState) {` · `  const fmtV = v => v != null ? v.toFixed(2) + 'x' : '—';` | :1131 · :1135 |
| the three `${s.smaNN != null ? '$' + s.smaNN.toFixed(2) : '—'}` expressions | :1141–1143 |
| `function parsePerplexityContext(` · `    const tickerMatch = line.match(` | :5654 · :5925 |
| `  let price = item._verifiedPrice ? `` `$${item._verifiedPrice.toFixed(2)}` `` : '—';` | :8245 |
| `    return '$' + sma.toFixed(2);` (inside `fmtMA`) | :8387 |
| `price = `` `$${_extC.regularPrice.toFixed(2)}` ``;` | :8488 |
| `Math.abs(chg * _displayPriceBase/100).toFixed(2)` | :8675 |
| `class="ph-ext-price">$${_extPrice.toFixed(2)}` | :8697 |

## §C Hard constraints

| Source | Constraint |
|---|---|
| I-1 | No change to `fetchYahoo`, `fetchHistoricalCandles`, `computeTechnicalSnapshot`, `market-data.js`, stored fields or the consistency-check callers |
| Scoring boundary | `analyzeChunk`, `orchestrate`, `enforceScoreConsistency`, `_techCache`, the system prompt and JSON template (`fetchAnthropicAnalysis`) byte-identical |
| ATH | `_athAccept` and the ATH row byte-identical; `ath_client` AC-11 (agorot `_verifiedPrice` 11000 → 110.00) passes unmodified |
| US output | for every non-`.TA` symbol, `formatStockContext`, `buildTechSnapshotBlock` and every rendered price string are **byte-identical** to today. Proven by TU rows and by `ath_client` AC-5, `high1y_label`, `tech_snapshot_cache` TC-12 (dynamic) unmodified |
| R-2 | **no new top-level function** referenced by `renderMainPanel`. The unit rule is inline (`const _pxDiv = /\.TA$/.test(item.ticker \|\| '') ? 100 : 1; const _pxSym = …`), matching the existing ATH-row inline pattern |
| **Known, in-scope suite edits (only these)** | <br>• `qa/tech_snapshot_cache_offline.js`: the two static base constants `BASE_PRICE_LINE` and `BASE_EXT_OVERRIDE` (TC-12 static) are replaced with the new lines. The dynamic TC-12 rows stay unchanged. <br>• `qa/labs_panel_offline.js`: `BASE_PINS.renderMainPanel` (LB-8) is replaced with the new digest. <br>Any other suite failure → STOP |
| Protected | `qa/run-offline.js` untouched (it does not extract these functions) |

## §1 Slices

**S1 — characterisation suite.** New `qa/tase_units_offline.js` (pure Node; real functions extracted; render through the existing `renderMainPanel` harness pattern):

| ID | Assertion | At S1 |
|---|---|---|
| TU-1 | `.TA` item, `_verifiedPrice` 8884 → header shows `₪88.84`; US item 226.73 → `$226.73` | RED / GREEN |
| TU-2 | `.TA` MA rows show `₪87.00` etc. (÷100); US unchanged | RED / GREEN |
| TU-3 | `.TA` change amount: today's formula ÷100. PA-03 is **not** fixed here | RED |
| TU-4 | `.TA` PRE / POST: the extended price and the post-↻ price ÷100 with `₪` | RED |
| TU-5 | `formatStockContext` for `.TA`: `Price: 88.84 ILS … Open: 88.00 ILS …` + `CURRENCY: ILS (Tel Aviv listing; prices converted from agorot). State every price level in ILS.`; US output byte-identical to the `2c2b0d9` oracle | RED / GREEN |
| TU-6 | `buildTechSnapshotBlock` for `.TA`: `MA20: 87.00 ILS (+2.10%)`; percentages unchanged; ATH line unchanged; US byte-identical | RED / GREEN |
| TU-7 | `parsePerplexityContext`: `TICKER: MTRX.TA` → key `MTRX.TA`; `BRK.B` → `BRK.B`; `BRK-B` → `BRK-B`; `TICKER: AAPL.` → `AAPL`; `**NVDA**`, `## $MSFT`, `TICKER: TST` unchanged | RED / GREEN |
| TU-8 | Invariants: stored `_verifiedPrice` untouched; ATH row distance unchanged (AC-11 shape); K-check callers byte-identical; `analyzeChunk` / `orchestrate` byte-identical | GREEN |
| TU-9 | SETUP: every edited function extracts completely; no new top-level function referenced by `renderMainPanel` | GREEN |

**S2 — display** (`renderMainPanel` only):
- `_pxDiv` / `_pxSym` declared once, next to `price`;
- the five sites :8245, :8387, :8488, :8675, :8697 use them.

TU-1…TU-4 turn GREEN. Make the TC-12 static and LB-8 constant edits.

**S3 — prompts:**
- `formatStockContext`: per-row `_ta` / `_px` and the `CURRENCY:` line for `.TA` only;
- `buildTechSnapshotBlock`: `fmtL` for the three MA levels.

TU-5 and TU-6 turn GREEN.

**S4 — research lookup:** the regex at :5925 becomes `\s*([A-Z]{1,6}(?:[.\-][A-Z]{1,2})?)(?=\b|\*\*|\s|$)`. TU-7 turns GREEN; `analyst_parser` AP-1…AP-14 still pass unmodified.

**§2 Continuation:** each slice continues when:
- its rows are GREEN and earlier rows stay GREEN;
- §C holds;
- `index-pins --diff <base>` lists only the slice's functions (S2 `renderMainPanel`; S3 `formatStockContext`, `buildTechSnapshotBlock`; S4 `parsePerplexityContext`) plus the digest;
- Codex has no unresolved Class I.

**Program STOP:**
- any §C breach;
- a suite failure other than the two known constants;
- a change to stored data, fetch functions, scoring functions or the system prompt;
- any live / DEV / Netlify action by the Worker;
- a second heavy run.

## §F Feasibility (COWORK scratch copy of the repo at `2c2b0d9`, outside the repo; reference only)

- **S4 regex alone:**
  - `analyst_parser` PASS (57).
  - After `index-pins --update`: `no_synthetic_score` PASS (160), `index_pins` PASS.
  - Parser output: `MTRX.TA`, `BRK.B`, `BRK-B`, `AAPL` (from `AAPL.`), `NVDA`, `MSFT`.
- **S3 prompts:**
  - `.TA` output: `Price: 88.84 ILS (+0.95%) | Open: 88.00 ILS …` with the `CURRENCY:` line; `MA20: 87.00 ILS (+2.10%)`.
  - **US output identical** (`Price: $226.73`, `MA20: $226.73`).
  - `ath_client` (123), `high1y_label` (103), `deep_dive_v0` (74), `tech_snapshot_cache` (324) and `ma_stack_label` (86) PASS.
- **S2 display, plus all of the above:**
  - PASS: `ath_client`, `high1y_label`, `ma_stack_label`, `narrative_consistency` (105), `deep_dive_v0`, `ui_hygiene`, `pulse_analyst_view`, `scan_results_enrichment`, `vis_score_caliper`, `ts1_default_exposure`, `no_synthetic_score`, `analyst_parser`, `eod_packet_v0`, `index_pins`.
  - Expected failures only: `tech_snapshot_cache` TC-12 static ×2 and `labs_panel` LB-8 (the hard-coded base constants in §C).

## §3 Codex review

**Steps 8 / 12, on the real diff.** Codex confirms:
- I-1: no stored or fetched value is converted;
- US byte-identity;
- the ATH row is untouched;
- the K-check callers are untouched;
- the regex accepts only a 1–2-letter suffix after `.` / `-`;
- each planted negative bites.

**Planted negatives:**
- converting at fetch time → TU-8 / AC-11 fail;
- `$` kept for `.TA` → TU-1 fails;
- the ÷100 applied to US → TU-1 US fails;
- MA not converted → TU-2 fails;
- the prompt left in agorot → TU-5 fails;
- the old regex → TU-7 fails;
- a regex that accepts `AAPL.COM`-style 3+ letter suffixes → the TU-7 negative fails.

## §ET (ET-1; non-blocking)

**Estimate:**
- 10 min setup;
- S1 about 20 min;
- S2 about 10 min;
- S3 about 8 min;
- S4 about 6 min;
- 15 min closure.

**About 70 min** plus Owner gates.

## §CMD Command card (one command per Bash call; Bash only; absolute canonical root)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
node qa/guard_integrity_check.js --task task/tase-units-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/tase_units_offline.js
node qa/tech_snapshot_cache_offline.js
node qa/labs_panel_offline.js
node qa/ath_client_offline.js
node qa/analyst_parser_offline.js
node qa/tools/index-pins.js --diff <base>
node qa/tools/index-pins.js --update
node qa/tools/index-pins.js --check
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/tase-units-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/tase-units-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (expected prompts):** `git add <explicit paths>`.
- **C (Owner gates):** R11, R12 LAND, R12 PUSH.
- **Never:** `curl`, `WebFetch`, `netlify`, PowerShell.
- **L9 readiness:** before the step-13 commit and again before `land-request`, run the Grep-tool checks E1 = 1, E2 = 1, E3 = 0 on `work/tase-units-1/review.md` (card r3 block).

## §X Closure

1. Step 10 full `qa:offline` (= step 0 + 1) PASS.
2. `review.md`:
   - the TU table;
   - the US byte-identity proof;
   - the two known constant edits with before / after;
   - `## Backlog reconciliation` (none);
   - **LAND-EVIDENCE line (L9)**: `review.md` contains **exactly one** line, on its own, starting at column 1, with no bullet, backticks, bold or trailing spaces: `LAND-EVIDENCE: qa-offline=PASS <N>; targeted=PASS; codex-classI-unresolved=0`.
     - `<N>` = the step-10 suite count.
     - Write it only when step 10, every land-test and Codex (no unresolved class I) passed.
     - Commit it in the same commit as the final implementation. It is the only occurrence of `LAND-EVIDENCE:` in `review.md`.
     - The integrity-check output is **not** written into `review.md`; it goes only in the step-13 STOP report.
     - **After an L9 refusal: STOP-6.** No recovery commit without an explicit, incident-specific Owner ruling.
3. Final Codex check.
4. Step 13; integrity; R12 LAND / push / cleanup.
5. **COWORK post-push DEV check** (read-only, separately approved): open MTRX.TA, MGOR.TA and NXSN.TA.
   - Header `₪`, MA rows ÷100; NVDA unchanged.
   - Stored results stay raw (no write).
   - The new research and prompt effects are visible only after a separately approved G3 scan.

## §PEP / §UER

- **§PEP:** expected prompts are the `git add` staging and the two R12 verbs.
- **§UER:** **ATTENDED-ONLY**. The AI-input text changes for `.TA`.

## §Y Files, land-scope, land-tests

```
index.html                         renderMainPanel (5 sites) · formatStockContext · buildTechSnapshotBlock · parsePerplexityContext (regex line)
qa/tase_units_offline.js           NEW (TU-1…TU-9 + planted negatives)
qa/tech_snapshot_cache_offline.js  BASE_PRICE_LINE / BASE_EXT_OVERRIDE constants only
qa/labs_panel_offline.js           LB-8 BASE_PINS.renderMainPanel constant only
qa/fixtures/index-pins.json        regenerated per slice
```

<!-- land-scope:begin -->
index.html
qa/tase_units_offline.js
qa/tech_snapshot_cache_offline.js
qa/labs_panel_offline.js
qa/fixtures/index-pins.json
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/tase_units_offline.js
node qa/tools/index-pins.js --check
node qa/index_pins_offline.js
node qa/tech_snapshot_cache_offline.js
node qa/labs_panel_offline.js
node qa/ath_client_offline.js
node qa/high1y_label_offline.js
node qa/ma_stack_label_offline.js
node qa/narrative_consistency_offline.js
node qa/deep_dive_v0_offline.js
node qa/analyst_parser_offline.js
node qa/no_synthetic_score_offline.js
node qa/ui_hygiene_offline.js
node qa/pulse_analyst_view_offline.js
node qa/scan_results_enrichment_offline.js
node qa/vis_score_caliper_offline.js
node qa/ts1_default_exposure_offline.js
node qa/eod_packet_v0_offline.js
<!-- land-tests:end -->

**Skills:** `pt-offline-suite` Required. `/plan` mandatory.

**§L:** close at the last passed slice (M-4).

**Out of scope (recorded in the correction backlog):**
- PA-S01 (server PRE / POST for `.TA`, `market-data.js`);
- PA-S08 (legacy RS date pairing);
- PA-03 (change-amount formula, CB-3);
- the `$` inside the consistency-check text;
- the `PT: $X` wording in the system prompt;
- a fallback lookup when Perplexity drops the suffix (CB1-D4).
