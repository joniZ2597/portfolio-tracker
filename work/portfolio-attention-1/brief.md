# Brief: portfolio-attention-1: the Portfolio tab lists held names whose last scan shows a signal (display only; first task-scoped Auto Mode pilot)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. DRAFT by the Planner, 2026-10-24, for MAIN's independent review (including §AUTO). **Nothing here is approved.** Baseline: `branch-dev` = `origin/branch-dev` = `5e35915` (the `cop-display-fix-1` LAND commit, now pushed; T = the tip the task starts from). Every line number, hash and count below is **re-sweep at T**. Owner rulings PA-1..PA-8 were given on 2026-10-24 as recommended, and PA-9 (plain-text symbols) the same day (§0).

**What the Owner sees afterwards (one outcome):** with the Portfolio research switch on, the Portfolio tab shows a block **"Held names with scan signals (n)"** above "Needs Attention". It lists the held names whose last scan shows a bearish setup, a day move of 5 % or more at scan time, or whose scan is missing, failed or older than 48 h; each row shows only stored values with their source and scan date, and the ticker symbol is plain text (no link, no navigation). No score, action, ranking of scan results, prompt, stored record, fetch or flag changes.

| | |
|---|---|
| Source | `Pulse-Planning\planner\portfolio-attention-1\proposal.md` (2026-10-21) as ruled; `pipeline-next.md` #1; Owner selection 2026-10-24 |
| Branch / slot / mode | `task/portfolio-attention-1` · the next free Worker slot · **Mode: Auto** (attended-only), the first task-scoped Auto pilot; the Auto marker line is in §UER |
| Scoring boundary | **No** change to scoring (`orchestrate`, `analyzeChunk`, `enforceScoreConsistency`, `_ptScore*`, `_techCache`), `_srGroupResults`, Scan Results or Daily Review order, Actionable Take, prompts, normal scan, holdings schema, persistence (`pt_results`, `pt_tickers`, `pt_holdings`, `pt_active_ticker`, any localStorage key: **no read or write by the new code**), flags, network or production. **Not in scope:** ticker navigation from the block (follow-up slice) |
| Gate verification | **Client gate:** the block renders only when `window.PT_ENABLE_PORTFOLIO_RESEARCH === true` (strict boolean; existing gate, set at load from `localStorage.pt_enable_portfolio_research` or the session-only Labs switch; no default change, no new flag). **Server gate:** N/A, no fetch and no upstream I/O (so no `=== 'true'` env check exists to place). `plan.md` records both |
| Deploy | branch-dev, then DEV branch deploy through the Owner's push record. No `main`, no other Netlify write |
| qa:offline | **+1 suite** (`qa/portfolio_scan_signals_offline.js`, auto-discovered; no `qa/run-offline.js` edit). Step-10 count = step-0 count + 1 (expected N = 107 after `cop-display-fix-1`, so 108; **re-measure at T**) |
| Skills | `pt-offline-suite`: **Required** (edits `index.html`, adds a suite). Optional: `portfolio-tracker-ux-review` |

## §0 Rulings applied (Owner, 2026-10-24; all as recommended in the proposal)
| ID | Ruling | Effect in this brief |
|---|---|---|
| PA-1 | The AI action is **not** shown | No `action` field is read by the new code |
| PA-2 | Day-move threshold 5 % | named constant, footnote text |
| PA-3 | `.TA` holdings are a counted "not covered" line, not ranked rows | `unsupported` status → `uncovered` list |
| PA-4 | Notes (analyst revision direction, earnings mention, "extended" setup) are unranked | notes only inside an already-listed row; never cause a row or change order |
| PA-5 | A stale scan keeps its bearish-setup signal with a `stale` tag | C1 on a stale scan fires with the tag; C2 never fires on a stale scan |
| PA-6 | Collapse after 10 rows | first 10 shown, "Show n more" for the rest (in memory only) |
| PA-7 | Title "Held names with scan signals (n)" | exact heading text |
| PA-8 | The day move uses the scan-time price (`_verifiedChangePct`), no live-price dependency | the new code never reads the EOD cache, `PT_ENABLE_PORTFOLIO_LIVE_PRICES` or any fetch |
| PA-9 | v1 shows ticker symbols as **plain text** (Owner, 2026-10-24, on MAIN's recommendation) | no `selectTicker`, no `switchMainView`, no navigation or click handler on a symbol, no read or write of any browser-storage key, existing or new. **Not in scope (potential follow-up slice): ticker navigation from this block** (it would write the existing `pt_active_ticker` pointer through `selectTicker`) |

## §TS Task-start baseline checks (read-only, at T)
| # | Check |
|---|---|
| TS-0 | `branch-dev` = `origin/branch-dev` = T, T contains `5e35915` (cop-display-fix-1 pushed); clean tree. Otherwise STOP, MAIN |
| TS-1 | Each anchor occurs exactly once (Grep): `function _pfComputeNeedsAttention(`, `function _renderPortfolioPanel(`, `// ─── P-4A-2: Needs Attention`, `var attentionItems = _pfComputeNeedsAttention(holdings, fxCache, recon, cashState);`, `function _researchViewForHolding(`, `var STALE_MS = 48 * 60 * 60 * 1000;`, `const _SR_BEARISH_TIER = new Set(['breakdown_risk', 'below_key_mas']);`, `function _pfHoldingIlsValue(`. Zero or double → STOP |
| TS-2 | The coupling sweep of §2 is completed read-only at T by the Planner and MAIN **before R11**, so the scope blocks are final; the Worker only re-confirms (Grep each pin/anchor). **Any new hit = STOP, no amendment** (an amended brief after R11 breaks the integrity chain). **A hit in a PROTECTED/ASK/DENY file = not Auto-suitable: STOP, MAIN** |
| TS-3 | `cp10-decouple-1` has not landed (else the CP-10 row changes and the sweep is redone before R11) |
| TS-4 | `node qa/index_pins_offline.js` and `node qa/labs_panel_offline.js` are in the step-0 PASS set (no pre-existing red) |
| TS-5 | The reads the new code makes are confirmed side-effect free: `_researchViewForHolding` → `_resolveResearchForHolding` → `_srSafeParseResults` (read of saved results, no write, no fetch), `loadHoldings`, `_pfHoldingIlsValue`, `_dhLabel`. If any of them writes storage → STOP. (The new code itself must not name `selectTicker`, `switchMainView` or any storage API, PS-2/PS-15.) |
| TS-6 | `git ls-files --eol index.html` recorded (expected `w/crlf`); byte-audit after each Edit (§4) |

## §1 Design
**Placement.** In `_renderPortfolioPanel`, after the unrealized-P/L note (`pfPlNote`) and **before** the `// ─── P-4A-2: Needs Attention` comment, inside the `else` branch that holds `holdings`, `fxCache` and the nested `_pfFmtCurrencyValue`. The Needs Attention block, `_pfComputeNeedsAttention` and everything after are untouched.

**Three new top-level functions, all next to `_pfComputeNeedsAttention`, and one named-constant pair:**
1. `PF_SCAN_SIGNAL_DAYCHG_PCT = 5` and `PF_SCAN_SIGNAL_CAP = 10` (one place; the footnote prints the first).
2. `_pfComputeScanSignals(rows)`: **pure** (no DOM, storage, fetch, clock, global write). `rows` = `[{ symbol, corrupt, ilsValue, valueText, view }]`, built by the render from `loadHoldings()` keys, `_pfHoldingIlsValue(h, fxCache)`, the nested `_pfFmtCurrencyValue` text (plus " (currency unknown)" as the holding card does) and `view = _researchViewForHolding(sym)` (read-only, no fetch; source selection stays in `_resolveResearchForHolding`; its 48 h stale rule is reused, not duplicated). Returns:
   `{ listed:[{ symbol, valueText, stale, signals:[{ id, text, source, asOf }], notes:[{ text, source }] }], uncovered:[symbol], counts:{ held, listed, noSignals, uncovered, unreadable }, thresholdPct:5, cap:10 }`.
3. `_pfBuildScanSignalsBlock(result)`: builds the DOM (textContent only, no innerHTML), reusing the existing classes `pf-attention`, `pf-attention-hdr`, `pf-attention-item`, `pf-attention-title`, `pf-attention-detail` and inline styles (no new CSS). **Plain-text symbols (PA-9):** no navigation callback, no link, no click handler on a symbol; the only interactive element is the in-memory "Show n more" button (a display toggle, `addEventListener`). The builder takes the compute result only. Returns the element or `null` (nothing to show).
4. The render wiring: `if (window.PT_ENABLE_PORTFOLIO_RESEARCH === true) { build rows → compute → build → panel.appendChild }`.

**Signals** (each held, readable holding is evaluated once):
| ID | Fires when | Row text (shared labels where one exists) | Source tag |
|---|---|---|---|
| C1 | `view.result.technical_setup` ∈ `_SR_BEARISH_TIER` (`breakdown_risk`, `below_key_mas`), `view.status` is `covered` or `stale`, not `unavailable` | `Setup: breakdown risk` / `Setup: below key moving averages` · `scan YYYY-MM-DD` (UTC); with `stale` tag when stale | Pulse technical setup (scan) |
| C2 | `view.status === 'covered'` and `_verifiedChangePct` is a finite number with `abs >= 5` (direction-neutral; sign shown, one decimal) | `Day change at scan: -6.2%` · `scan YYYY-MM-DD` | market data at scan |
| G1 | `view.status === 'missing'` | `Scan: ` + `_dhLabel('state', 'missing')` | none |
| G2 | `view.status === 'unavailable'` (AI failed) | `Scan: ` + `DH_DISPLAY.surface['ai-unavailable']` · `scan YYYY-MM-DD` | scan |
| G3 | `view.status === 'stale'` | `Scan: ` + `_dhLabel('state', 'stale')` · `last scan N d ago (older than 48 h)` | scan |
| G4 | `view.status === 'unsupported'` (`.TA`) | not a row; one muted line `Not covered by research: ABCD.TA, ... (symbol format not supported)` | none |
A holding is **listed** iff it has at least one of C1, C2, G1, G2, G3. **G2 suppresses C1, C2 and all notes** (R-3: a failed analysis carries no labels). `technical_setup` `unknown` or missing fires nothing. Corrupt holdings (`_corrupt === true`) are excluded and counted (`n holdings could not be read`).
**Notes** (inside a listed row only, muted, never rank): `Setup: extended near all-time high`; `Analyst revisions: downgrading|upgrading (research-sourced)` for `_catalysts.revisionDir` of exactly those two values; `Research mentions earnings: "..." (AI-sourced)` when `_catalysts.earnings` is a non-empty string not matching `/^(NONE|N\/?A|-|—|unknown)\b/i` (truncated to 120 characters).
**Wording (agreed by MAIN):** state words come from the shared display vocabulary (`_dhLabel`, `DH_DISPLAY.surface`), as `qa/dh_ui_vocabulary_offline.js` expects for every state word in this panel; the proposal's mock texts for G1-G3 were illustrative and PA-7 fixed only the title.
**Exact rendered strings (the Owner approves these; `ABCD` and the numbers are examples, every other character is literal; the shared words are the values `qa/dh_ui_vocabulary_offline.js` expects today: missing = `Not recorded`, stale = `Stale`, AI failed = `Unavailable (AI analysis)`):**
| Element | Rendered text |
|---|---|
| Heading | `Held names with scan signals (3)` |
| Row title (plain text) | `ABCD · $12,300.00 · Recorded position value` ; unknown currency: `ABCD · 12,300.00 · Recorded position value (currency unknown)` |
| C1 | `Setup: breakdown risk · scan 2026-10-20` or `Setup: below key moving averages · scan 2026-10-20`; when stale, ` · Stale` is appended |
| C2 | `Day change at scan: -6.2% · scan 2026-10-20` (a rise shows `+7.0%`) |
| G1 | `Scan: Not recorded` |
| G2 | `Scan: Unavailable (AI analysis) · scan 2026-10-20` |
| G3 | `Scan: Stale · last scan 5 d ago (older than 48 h)` |
| Source tags (muted) | `Pulse technical setup (scan)` · `market data at scan` |
| Notes (muted) | `Setup: extended near all-time high` · `Analyst revisions: downgrading (research-sourced)` (or `upgrading`) · `Research mentions earnings: "<first 120 characters>" (AI-sourced)` |
| Not-covered line | `Not covered by research: ABCD.TA, EFGH.TA (symbol format not supported)` |
| Unreadable | `2 holdings could not be read` |
| Collapse button | `Show 3 more` |
| Footer 1 | `Held names: 12 · listed: 3 · no signals from the last scan: 8 · not covered: 1` (`· unreadable: n` appended when n > 0) |
| Footer 2 | `Day-change threshold 5% · scans older than 48 h are marked stale · ordered by signals, then recorded value where known, then symbol` |
| Empty: no scans | `No scan results yet for the held names (4)` |
| Empty: no signals | `No scan signals for the 4 held names covered · last scan 2026-10-20` |
| Empty: all stale | footer 1 is followed by `all scans older than 48 h` |
The scan date is the leading `YYYY-MM-DD` of the stored timestamp text when it has that form (no `Date` object is used), else `scan date unknown`; `N d` is the whole days of `view.ageMs`.
**Order:** (1) rows with at least one C-signal first, gap-only rows after; (2) number of C-signals, descending; (3) fresh before stale; (4) recorded ILS-equivalent value, descending, null last (the key is not displayed); (5) symbol A-Z. No score, AI output or price target enters the ordering.
**Cap:** first `PF_SCAN_SIGNAL_CAP` rows visible; beyond that a "Show n more" button reveals the rest by toggling display (in memory; any panel re-render collapses again; nothing persisted).
**Footer lines:** `Held names: n · listed: m · no signals from the last scan: k · not covered: u` (plus `· unreadable: r` when r > 0) and `Day-change threshold 5% · scans older than 48 h are marked stale · ordered by signals, then recorded value where known, then symbol`.
**States:** gate off → nothing. No holdings → the panel's own empty state (the block lives in the non-empty branch). Holdings but no scan result for any covered name → `No scan results yet for the held names (n)` + footer (G1 rows still listed). Scans exist, no signals → `No scan signals for the n held names covered · last scan YYYY-MM-DD` + footer. All covered scans stale → rows show G3 and the footer says `all scans older than 48 h`.
**Wording rules:** noun phrases; every figure carries "at scan"/"scan <date>"; AI-sourced items say so; amber (existing `var(--yellow2)`) for concern lines, neutral grey for gap lines, no red; **no advice or imperative words** (buy, sell, trim, add, avoid, act, review now, should, recommend) and none of the substrings `Est. `, `dayEst`, `.netlify/functions`, `innerHTML` anywhere in the new code (PT-12/14/24 and PS-9 guard these).

## §2 Coupling sweep (pt-offline-suite classes (a)-(f), plus literal couplings and new strings). Seed from the Planner's read at `5e35915`; **Planner + MAIN complete it read-only at T before R11**; the Worker re-confirms only (TS-2)
| Class | Suite · symbol | Tripped? | Handling |
|---|---|---|---|
| (a) function sha256 | `qa/labs_panel_offline.js` `BASE_PINS._renderPortfolioPanel` (LB-8; hashed with the Slice 2 `S2_AFTER`→`S2_BEFORE` line reverted, so it is **not** the pin-map value) | **yes** (any byte inside `_renderPortfolioPanel`) | re-pin the constant, revert proof (skill §4): read the new digest from the suite's red output, prove that the S2-reverted copy of the pre-edit panel hashes to the old value; in land-scope |
| (a)/(d) pin map | `qa/fixtures/index-pins.json` (`_renderPortfolioPanel` entry; new entries for the three new functions; region and remainder hashes), checked by `qa/index_pins_offline.js`, read live by `no_synthetic_score_offline.js` (`ISOLATION_FNS` includes the panel) and `pulse_analyst_view_offline.js` | **yes** | regenerate with `node qa/tools/index-pins.js --update` only, never by hand; review the diff; in land-scope |
| (a) other | the four `renderMainPanel` hash suites (`ai_request_hygiene`, `labs_panel` LB-8 `renderMainPanel` entry, `market_daily_change`, `portfolio_today` PT-25): their pins name `renderMainPanel`, `orchestrate` and the `_pf*`/`_ts1*` functions in `BASE_DIGESTS`, **not** the panel | no (`renderMainPanel` untouched; `_renderPortfolioPanel` is not in `portfolio_today` `BASE_DIGESTS`) | untouched; the sweep re-confirms the key lists at T |
| (a) revert chains | `no_synthetic_score`, `pulse_analyst_view`, `ma_stack_label`, `tech_snapshot_cache`, `ath_client` on `qa/fixtures/index-pins-frozen.json` (frozen, never edited) | frozen sources: no | run each targeted after the edit; re-pin only a constant that names the live panel (none expected) |
| (b) whole-file | `qa/evidence_capture_offline.js` CP-10 `BASE_INDEX_SHA` | **yes, certain** | re-pin the constant (digest printed by CP-10) with revert proof; in land-scope |
| (c) sandbox lists | `pulse_analyst_view_offline.js` (`S1` table `_renderPortfolioPanel` text anchor `PP-1`, run as text), `labs_panel_offline.js:119` (the panel is a **spy**, never executed), `no_synthetic_score_offline.js:56`, `portfolio_today_offline.js:633` (`panelText`, text only) | no: the panel is not run in any sandbox, so new free names are not evaluated | the new suite runs the new functions in its own sandbox |
| (d) extracted function | `dh_ui_vocabulary_offline.js` extracts `_renderPortfolioPanel` (`PANEL`) and `_pfComputeNeedsAttention` (`FN_NAMES`, FW-2 exact after-line) | extraction: no. Anchors: see (e) | `_pfComputeNeedsAttention` stays byte-identical |
| (e) literal text (panel) | `dh_ui_vocabulary_offline.js` anchors inside the panel: `res._aiUnavailable === true` (U7), `} else if (!res) {` (B2), `fxState === 'missing'` (B1), `recon.status === 'unset'/'invalid'/'stale'/'total-incomplete'` (U2-U5), `!pl3.fxUsable` (U6), the U9 line `resStEl.className = 'pf-res-state ' + (isStale ? 'stale' : 'found');`, and `CONDS` regexes | **by construction no**: the new block lives in its own functions and uses neither these names nor these shapes; the render wiring uses `view`, `sig`, `rows` | PS-12 asserts each anchor still occurs exactly as before (count unchanged) |
| (e) literal text (panel, portfolio_today) | PT-11..14, PT-24: `Est. `, `dayEst`, `_pfPortfolioDayEstimate(`, `.netlify/functions` counts are **0** in the panel; `_pfBuildMarketStrip(` before `className = 'pf-sort-bar'`; the five `Recorded` strings | no, if the new wiring avoids those substrings | PS-9 asserts the new code adds none of them |
| (e) literal text (EOD packet) | `eod_packet_v0_offline.js` extracts `_pfComputeNeedsAttention` and reads `packet.portfolio.needsAttention` | no (function and packet untouched) | PS-11 asserts the packet shape source is unchanged |
| (e) new user-visible strings | grep of `qa/` for `Held names`, `scan signals`, `Not covered`, `No scan results`, `Show n more`/`Show more`, `Day change at scan`, `Last scan`, `at scan`, `_pfComputeScanSignals`, `_pfBuildScanSignalsBlock`, `pf-signals`: **no hit at 5e35915** | none | the sweep at T repeats this grep for every string and every class name the final diff adds, **and for the neighbouring strings it sits beside** (`Needs Attention`, `pf-attention`), and lists each hit; the COP `tase_units_offline.js:212` miss was a counted literal (`countOf(src, "<caller text>") === 1`), so also grep `countOf(` assertions on any literal the diff alters |
| `qa/run-offline.js` | hits at `:1871` (comment) and `:2154` (name list) | no hash of the panel there | **PROTECTED, untouched.** A hash of the portfolio panel or a count of its text found in `run-offline.js` at T = **not Auto-suitable: STOP** |
| (f) digest-part lists | none: `index.html` and the touched suites are in no E1/FT/GC digest part | no | `pin-deps.js`, §PIN |

## §PIN Contract-pin dependencies (`pin-deps.js`; MAIN re-runs at T)
Command: `node C:/Users/Owner/Documents/Pulse-Planning/tools/pin-deps.js --repo C:/Users/Owner/Documents/Project/portfolio-tracker --brief <this brief>`; result for this draft in `pin-deps-output.txt` (this folder). Result: see the "§PIN result" line at the end of this section. Any STALE row at T → STOP (the default-fail run would fail).
**§PIN result:** `pin-deps.js` on the 6 land-scope files: `no digest pin includes a changed file`. One REVIEW row: `qa/auto_mode_hardening_offline.js <- index.html` (string literals at lines 1228, 2228, 2607): test-input strings (for example the benign file-tool list), not digest parts (AH's parts are guard/settings/integrity/fingerprint), so not stale. No STALE row, no re-pin of any E1/FT/GC pin is needed.

## §3 Suite `qa/portfolio_scan_signals_offline.js` (new; style of `qa/portfolio_today_offline.js` and `qa/cop_display_offline.js`: `extractFunctionSource`, a `new Function` sandbox, in-memory mutation of a copy of `index.html`; no network, no browser, no storage)
| Row | Asserts |
|---|---|
| PS-1 | the render wiring is inside `if (window.PT_ENABLE_PORTFOLIO_RESEARCH === true)`; no truthy or loose test of the gate in the new code; gate off → no call to the compute/build functions |
| PS-2 | `_pfComputeScanSignals` and `_pfBuildScanSignalsBlock` contain none of `fetch(`, `XMLHttpRequest`, `localStorage`, `sessionStorage`, `indexedDB`, `pt_`, `saveHoldings`, `orchestrate`, `analyzeChunk`, `setTimeout`, `setInterval`, `Date.now`, `new Date(` (the scan date is derived from `view.asOf` text), `window[`, `innerHTML`, `selectTicker`, `switchMainView`; inputs are not mutated (deep-frozen fixtures) |
| PS-3 | C1 fires for exactly `breakdown_risk` and `below_key_mas`; not for `unknown`, missing, `extended_near_ath` (note only), healthy setups |
| PS-4 | C2 boundary: 4.9 and -4.9 no; 5.0 and -5.0 yes; non-number, NaN, null, string no; `stale` scan no; sign and one-decimal text |
| PS-5 | G1, G2, G3 rows; G2 suppresses C1, C2 and notes; G3 keeps C1 with the stale tag; `unsupported` → `uncovered` and no row; corrupt → `unreadable` |
| PS-6 | ordering: group, C-count, fresh before stale, ILS value descending with null last, symbol; permutations of the input give the same output |
| PS-7 | cap: 10 rows no button; 11 rows → 10 visible + "Show 1 more"; the button reveals and writes nothing |
| PS-8 | notes appear only inside a listed row; a note alone never lists a row nor changes order; revision note only for `upgrading`/`downgrading`; earnings `NONE`/`N/A` shows nothing; 120-character truncation |
| PS-9 | wording: the block's strings contain none of the advice/imperative words, `Est. `, `dayEst`, `.netlify/functions`; positive control: a planted `Sell` is detected |
| PS-10 | counts: `listed + noSignals + uncovered + unreadable === held`; footer and threshold footnote text exact |
| PS-11 | isolation: the untouched functions are byte-identical to their digests at T (`_pfComputeNeedsAttention`, `_researchViewForHolding`, `_resolveResearchForHolding`, `_srGroupResults`, `_pfHoldingIlsValue`, `selectTicker`, `switchMainView`, `loadHoldings`, `_pfNormalizeHoldingEntry`, `orchestrate`, `enforceScoreConsistency`, `_ptScoreCmp`; constants copied from `qa/fixtures/index-pins.json` at T, step 0); no new storage key literal; the `needsAttention` packet source unchanged |
| PS-12 | literal anchors unchanged: the dh_ui_vocabulary anchors of §2 (e) occur exactly once each in the panel; `var STALE_MS = 48 * 60 * 60 * 1000;` once in `_resolveResearchForHolding` (the footnote's 48 h); `_SR_BEARISH_TIER` set literal once |
| PS-13 | placement: the block call precedes the Needs Attention block; `var attentionItems = _pfComputeNeedsAttention(holdings, fxCache, recon, cashState);` and `'Needs Attention ('` each occur once |
| PS-14 | build smoke on a stub DOM (precedent `_pfBuildMarketStrip` / PT-23): the exact rendered strings of §1 (heading, row title, each signal and note, not-covered line, footers, empty states), row count, `null` for an empty result; every symbol is a text node (no `button`, `a`, `onclick` or `href` on a symbol) |
| PS-15 | plain-text symbols (PA-9): the source text of the two new functions **and of the render wiring block** contains none of `selectTicker`, `switchMainView`, `localStorage`, `sessionStorage`, `onclick`, `href`; the builder takes exactly one parameter (the result); the only element with a listener is the "Show n more" toggle, and clicking it changes display only (a recording `localStorage` stub in the stub DOM sees zero calls) |
**Planted negatives** (each mutates an in-memory copy of `index.html`, anchor proven to occur exactly once before mutating, positive control = the unmutated source passes; each must make the named row FAIL): N1 gate test becomes truthy (`PT_ENABLE_PORTFOLIO_RESEARCH` without `=== true`) → PS-1; N2 threshold `5` → `6` → PS-4; N3 C2 uses `>` instead of `>=` → PS-4; N4 C1 set gains `support_test` → PS-3; N5 G2 stops suppressing C1 → PS-5; N6 C2 allowed on a stale scan → PS-4/PS-5; N7 ordering drops the ILS tie-break → PS-6; N8 cap `10` → `11` → PS-7; N9 add `localStorage.setItem` in `_pfBuildScanSignalsBlock` → PS-2; N10 add the word `Sell` to a row text → PS-9; N11 block placed after Needs Attention → PS-13; N12 `view.stale` ignored (48 h rule re-implemented) → PS-12/PS-5; N13 earnings `NONE` shown → PS-8; N14 `selectTicker(` inserted into the render wiring or the builder → PS-15 (and PS-2); N15 `localStorage.getItem('pt_active_ticker')` inserted into `_pfComputeScanSignals` → PS-2/PS-15; N16 a symbol rendered as a `button` → PS-14/PS-15. Revert proof per N: restore the text, the row passes.

## §4 Steps (Bash calls use only the listed commands; see §AUTO for the exact command table and its permission analysis)
| Step | Action |
|---|---|
| 0 | Git safety block; §TS checks at T; baseline: reuse the `cop-display-fix-1` LAND-evidence run only if the four `AGENTS.md` conditions hold, else MAIN gives the memory GO and the Worker runs the plain `npm run qa:offline`; record count N (expected 107) |
| 1 | `plan.md` (Write): the four CLAUDE.md pre-flight items (patterns: `_pfComputeNeedsAttention` + the Needs Attention block; `_pfBuildMarketStrip` + PT-23 purity rows; `_researchViewForHolding` adapter. Boundaries: §Scoring boundary. Gates: §Gate verification. DoD: §6), the §2 sweep table, the requirement → row map |
| 2 | RED first: Write `qa/portfolio_scan_signals_offline.js` (PS-1..15, N1..16); run it on unmodified `index.html`: the new-behaviour rows red, PS-11/PS-12 isolation and anchor rows green |
| 3 | Implement in `index.html` with the Edit tool: the constants and three functions after `_pfComputeNeedsAttention`, then the render wiring (one complete edit per concern); after each Edit, `git ls-files --eol index.html` and `git diff --stat` (no whole-file churn; EOL unchanged) |
| 4 | The new suite green (PS rows and N1..16 red-then-green); then `node qa/tools/index-pins.js --update` and review the `index-pins.json` diff (only `_renderPortfolioPanel`, the three new functions, region/remainder lines); `node qa/tools/index-pins.js --check` |
| 5 | Targeted suites, each in its own call so each result is read separately: `labs_panel` (RED only on LB-8 → re-pin with revert proof → green), `evidence_capture` (RED only on CP-10 → re-pin → green), then `dh_ui_vocabulary`, `portfolio_today`, `eod_packet_v0`, `index_pins`, `no_synthetic_score`, `pulse_analyst_view`, `ma_stack_label`, `tech_snapshot_cache`, `ath_client`, `ui_hygiene`, `ui1b_cards`, `narrative_consistency`, `catalyst_hygiene`, `tase_units` |
| 6 | Codex review of the actual diff in the `AGENTS.md:339` form (the `codex exec` call, then the one copy call per round; §AUTO 1-2); classify findings, fix in scope |
| 7 | Sync with `branch-dev` (conflict → STOP) |
| 8 | MAIN's memory GO, then the plain `npm run qa:offline` (default mode, foreground): PASS, count N+1, `Stale pins: none`. `review.md` carries the exact `LAND-EVIDENCE: qa-offline=PASS <N+1>; targeted=PASS; codex-classI-unresolved=0` line once and a separate `QA-LIFECYCLE: mode=default run=<id> stale=0 pinned_skip=6/6 total_s=<n> regression=none` line; the pin ledger (old → new → revert proof) |
| 9 | Stage `land-scope` paths, commit on the task branch (gate permitting); MAIN: integrity chain, land-request; **Owner LAND**, then **Owner PUSH** = DEV deploy |
| 10 | After the DEV deploy, the Owner (or a read-only browser session) checks the Portfolio tab with the research switch on: block present above Needs Attention, a bearish-setup holding listed, `.TA` line, no change to the cards; before/after screenshots; storage keys unchanged. Acceptance only, no live canary, not a Worker step |

## §5 Files and tiers
| Path | Change | Tier |
|---|---|---|
| `index.html` | three functions + two constants + render wiring (§1) | ordinary (heavily pinned) |
| `qa/portfolio_scan_signals_offline.js` (new) | §3 | ordinary |
| `qa/labs_panel_offline.js` | the LB-8 `_renderPortfolioPanel` constant only | ordinary |
| `qa/evidence_capture_offline.js` | the CP-10 `BASE_INDEX_SHA` constant only | ordinary |
| `qa/fixtures/index-pins.json` | regenerated by `--update` only | ordinary (generated) |
| `work/portfolio-attention-1/review.md` | evidence | ordinary |
**Forbidden:** `qa/run-offline.js`, `AGENTS.md`, `CLAUDE.md`, `.claude/**`, `netlify/**`, `services/**`, `package*.json`, `qa/fixtures/index-pins-frozen.json`, the land tool, guard and settings, `work/*/brief.md`. **PROTECTED approval: none needed. ASK/DENY-tier files in scope: none.**

## §6 Acceptance and rollback
**Done =** the shape and rules of §1 hold for every PS row; N1..N16 red-then-green; every §2 suite green; the plain step-8 run PASS with count N+1; the step-10 check matches; `review.md` carries the pin ledger and the Auto measurement (§AUTO 7). A failed or missing input is shown as missing, never as "OK" or zero.
**Rollback:** revert the task commit on `branch-dev`, then the Owner's push. No data rollback: nothing stored changes.

## §7 Risks
- `_renderPortfolioPanel` is pinned by `labs_panel` LB-8 and the pin map: constants only. The sibling-function design keeps all literal anchors intact.
- The block's value depends on scans existing for held names; with none it shows the G1 rows and the empty-state line (no false "all clear").
- Symbols are plain text by Owner ruling (PA-9), so a reader cannot jump to the ticker from the block; ticker navigation is a **potential follow-up slice** (it would write the existing `pt_active_ticker` pointer via `selectTicker`, which crosses the state-isolation boundary and needs its own ruling).
- Auto pilot risks are in §AUTO.

## §AUTO Auto Mode compatibility (for MAIN to verify before Owner approval)
**Mode:** `Mode: Auto`, **attended-only** (the Owner present and responsive for the whole session; unattended Auto stays prohibited, `AGENTS.md` Worker mode policy). Auto is permitted, never required.

**Eligibility** (`AGENTS.md` "`Mode: Auto` eligibility", all must hold):
| Criterion | Brief evidence |
|---|---|
| approved committed brief with files and STOP conditions | this brief, §5 and the STOP rules below |
| bounded product or QA work | one display block + one suite |
| offline QA only | no live call, no canary; step 10 is a visual check |
| no schema, persistence, architecture, contract, scoring or ranking change | no stored field or key added; no scoring/ranking function changed. The block orders held names for display by signals: a new display order, not a change to any ranking function (`_ptScoreCmp`, `_srGroupResults`, Scan Results order untouched), agreed by MAIN. There is no click navigation and no storage read or write by the new code (PA-9, PS-15) |
| no ASK- or DENY-tier file in scope | confirmed, §5 |
| no environment, runtime, live-API, deploy or `main` need | confirmed; the DEV deploy is the Owner's push |
| every Owner ruling already exists | PA-1..PA-8, §0 |
| own slot under the current guard | the next free Worker slot |

**1-2. Exact command per step, and ask-rule hits.** Evidence codes follow `worker-command-list-draft.md` (S = exact allow rule in `.claude/settings.json`, T = observed auto-run in a Worker transcript). Only S/T rows are used, with the exceptions flagged E-1..E-3. **No command below matches a `permissions.ask` rule** (ask rules at `settings.json:72-115`: edits of CLAUDE.md/AGENTS.md/.gitignore/rules/run-offline/brief/netlify.toml/package*.json, `git push`, `git merge`, `git rebase`, `npm install/i/uninstall/update`, the land tool's `land` and `push` verbs, `netlify` writes and `env:get|list`, `curl`, `wget`, WebFetch, PowerShell web calls).
| Step | Exact command | Evidence | Ask rule? |
|---|---|---|---|
| 0 | `git branch --show-current` · `git status --short --branch` · `git log --oneline -3` · `git log --oneline origin/main -1` · `git log --oneline origin/branch-dev -1` · `git diff --stat` · `git diff --cached --stat` | S :122-128 | no |
| 0, 3 | `git ls-files --eol index.html` (and the touched `qa/` files) | S :154; T | no |
| 0-9 | Read / Grep / Glob tools for all reads and searches (no Bash `grep`, `cat`, `sed`) | tools | no |
| 0, 8 | `npm run qa:offline` (plain, foreground, after MAIN's memory GO) | S :119; T | no |
| 2, 4, 5 | `node qa/<name>_offline.js`, one suite per call (`portfolio_scan_signals`, `labs_panel`, `evidence_capture`, the §4 step-5 list) | S :120; T | no |
| 4 | `node qa/tools/index-pins.js --update`, then `node qa/tools/index-pins.js --check` | S :158, :157 | no |
| 3, 4 | `git diff --stat`; `git diff qa/fixtures/index-pins.json` | S :127, :149-150 | no |
| 5, 8 | `sha256sum <file>` where a file hash is needed for the ledger | S :160 | no |
| 6 | Codex review, per `AGENTS.md:339` (MAIN ruling: the AGENTS form binds): `codex exec --sandbox read-only -o <os.tmpdir()>/pt-portfolio-attention-1/codex-r<N>.md "<prompt>" < /dev/null`, foreground, no other redirect | S :164 (prefix rule); T (ran with no prompt in the Manual `cop-display-fix-1` rounds r1 and r2) | no |
| 6 | The one permitted shell write, one call per round: `{ printf '<round heading>'; cat <that -o file>; } >> work/portfolio-attention-1/codex.md`. The Worker does **not** Read the `-o` file outside the slot (that Read prompted in COP); the copy already carries the content | none: not allow-listed, **prompts by design in every mode** (not an `ask` rule) | no `ask` rule; counted as a **necessary** prompt |
| 9 | `git add -- <land-scope paths>` (one call), then `git commit -m "<single-line message>"` | `git commit`: S :129-130 plus the commit gate; `git add`: **E-1** (hook grant R16, source-evidenced, not S/T) | no |
| 1, 2, 3, 5 | Edit / Write on the §5 paths and on `work/portfolio-attention-1/plan.md`, `codex.md`, `qa.log`, `review.md` | R15 grant (Manual); T (12 hook approvals in WPP-1) | no |
| 9 (MAIN) | integrity check, land-request, push-request: MAIN's forms per `AGENTS.md`; the Worker runs none of the land-tool verbs | S :156, :166-167 | LAND and PUSH themselves are `ask`-tier and Owner `!` lines (gates below) |
Flags: **E-1** `git add -- <paths>` is a hook grant (R16), not an S/T row: R16 works in `default` mode only, so under Auto the classifier decides; **expected, not assumed: observe and log the first occurrence** (§AUTO 3 and 7). **Codex (MAIN ruling O-A1, closed):** the `AGENTS.md:339` form binds; the `codex exec … < /dev/null` call is now evidenced T (the Manual COP rounds), and the follow-up copy call prompts by design and is counted as a necessary prompt. **Command rules (`AGENTS.md:339`):** a Worker Bash call uses only commands from this table and the auto-approved list; chaining listed commands with `&&`, `;` or `|` is permitted, and the prompts come from unlisted parts (`echo`, `printf`, `for`, `node -e`, `>` redirects) except the single Codex copy call above. Not used (U rows): `git show` in a slot, `stat`, `git -C`.

**3. Edits and `git add` under Auto (EXPECTED, NOT ASSUMED).** The R15 edit grant (auto-edit-scope paths, `plan.md`, `codex.md`, `qa.log`) and the R16 stage grant work in the hook only when the permission mode is `default` (Manual). Under Auto (or `acceptEdits`) they are not what decides: the Auto classifier (or `acceptEdits` for edits in the working directory) decides. Expected: Edit/Write on scope paths and the single `git add -- <paths>` pass without an Owner prompt; **nothing is assumed**: the first occurrence of each is observed and logged (§AUTO 7). The mode lock (R15 HOOK-DENY) permits an Auto session in a slot only when the committed brief at the task-record base carries exactly one Auto marker line and no other line naming it, which this brief satisfies and which makes any wording change after R11 a new brief (an amended brief breaks the integrity chain).

**4. Broad rules dropped under Auto.** MAIN reports that Auto drops broad interpreter and package-runner allow rules. Which of ours are affected is **UNVERIFIED**: `Bash(npm run qa:offline)` is an exact string (narrow, expected to stay); `Bash(node qa/*_offline.js)` and `Bash(npm run test:*)` carry a wildcard on an interpreter/package-runner (**may be dropped and then go to the classifier**; `npm run test:*` is not used here); `Bash(node qa/tools/index-pins.js --check|--update)` and `Bash(node qa/guard_integrity_check.js *)` are fixed script paths. If `node qa/<name>_offline.js` goes to the classifier: it is an offline test of a repo file, expected to be allowed, but a prompt or block there is an **unexpected prompt pattern** (STOP rule below), not a silent retry.

**5. Mandatory Owner gates** (all stay; Auto changes none): (1) **brief approval**: the Owner approves these exact contents, then the R11 copy / brief-request commit; (2) **LAND**: the Owner's single-use `!` record (`ask`-tier); (3) **PUSH**: the Owner's single-use `!` record (`ask`-tier), also the DEV deploy approval; (4) any ASK-tier file: **none in scope, confirmed** (§5). Also unchanged and not Owner prompts: MAIN's memory GO before each full run, Codex review, the integrity chain, `git add -f` denied, bypass mode disabled. The Codex copy call (§AUTO 1-2) prompts by design in every mode; it is an expected, **necessary** prompt, not a gate and not an unexpected pattern.

**6. STOP rule (Auto-specific).** STOP-6 and fall back to Manual, SendMessage MAIN, never reroute, if: Auto bypasses any gate of item 5 (a LAND, PUSH or brief commit without the Owner's record); an ASK/DENY-tier or out-of-scope edit proceeds unprompted; a hook denial, classifier block or integrity FAIL occurs; or **any unexpected prompt pattern**: a prompt for a command the table above marks as no-prompt, a prompt on an Edit/Write of a scope path, a missing prompt where an `ask` rule applies, a prompt with wording not seen in the table, or two prompts for the same command. The one expected prompt per Codex round (the copy call) is not an unexpected pattern; a prompt on the `codex exec` call or on a Read of the `-o` file is. The Owner becoming unavailable ends the session; it never continues unattended.

**7. Measurement plan.** MAIN runs, at every Worker handoff (after `plan.md`; after the RED suite; after the implementation and targeted suites; after Codex; at land-request; after the push and DEV check), for the window since the previous handoff: `node C:/Users/Owner/Documents/Pulse-Planning/tools/phase-friction.js --slot <a|b> --since <ISO> --until <ISO> --task portfolio-attention-1 --phase <label> --main-dir C:/Users/Owner/.claude/projects/C--Users-Owner-Documents-Project-portfolio-tracker`, and appends a LEDGER line. The friction metric v2 is a proposal (not adopted, tool unchanged), so MAIN applies its rules **by hand** to each report: (a) headline = **Owner interruptions per handoff** = permission prompts (approved + rejected) + hook denials that needed a ruling + Owner `!` lines + ruling questions (AskUserQuestion or "Decision for you") ; (b) a prompt is **necessary** only if it matches a `permissions.ask` rule or a named gate (brief-request, protected, LAND, PUSH, cleanup, Netlify write, live canary) **or is the Codex copy call** (MAIN ruling), every other prompt is **avoidable** with a cause tag (`compound`, `inline-script`, `outside-workdir`, `not-allow-listed`, `redirect`); (c) record by hand the permission mode in force (default or auto) at each handoff, since the tool does not; (d) log the first observed behaviour of each item-3 and item-4 command (prompted / auto / classifier) in `review.md`; (e) unscanned sources (Codex, OS, Chrome prompts) are listed as a gap, never counted as zero. Baseline for comparison: the `cop-display-fix-1` window (v1: 9 prompts, 0 necessary, 2 STOP rulings, 1 test-failure ruling); the Planner sets no pass/fail threshold, the Owner judges the pilot from these numbers.

## §UER Execution readiness
**ATTENDED-ONLY.** Mode: **Auto**. **§L:** no partial land. The blocks below are final at R11; a hit outside them is a STOP, not an amendment (TS-2). Each auto-edit-scope entry is also in land-scope; one path per line, no globs, no protected, ASK or DENY paths.

<!-- worker-mode: auto -->

<!-- auto-edit-scope:begin -->
index.html
qa/portfolio_scan_signals_offline.js
qa/labs_panel_offline.js
qa/evidence_capture_offline.js
qa/fixtures/index-pins.json
work/portfolio-attention-1/review.md
<!-- auto-edit-scope:end -->
<!-- land-scope:begin -->
index.html
qa/portfolio_scan_signals_offline.js
qa/labs_panel_offline.js
qa/evidence_capture_offline.js
qa/fixtures/index-pins.json
work/portfolio-attention-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/portfolio_scan_signals_offline.js
<!-- land-tests:end -->
