# Master Brief: surface-1 — ETF-aware fundamentals cards, session-only Labs switches, shared "Stale" label

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

| | |
|---|---|
| Backlog | Entry **12** → `partial` (S1; P2b remains, `surface-2`) · Entry **22** → `close` (S2) · Entry **30** → `close` (S3). `BACKLOG.md` is in scope for step-10a reconciliation of exactly these three entries |
| Baseline | **`1b310279ec838d60bc2fbc80366c5424c22550b8`** — the `branch-dev` tip after `ai-output-1-s1a` LANDed, pushed and was cleaned (= `origin/branch-dev`; drafted at `ac8f39b`, delta-checked here on 2026-10-11). This brief's commit must add only `work/surface-1/brief.md` on top of it. Valid at a tip only if every §A anchor matches exactly once in its named function or block, and `git diff --quiet 1b310279ec838d60bc2fbc80366c5424c22550b8 <tip> -- index.html qa/fixtures/index-pins.json qa/dh_ui_vocabulary_offline.js qa/ts1_default_exposure_offline.js qa/fund_facts_read_client_test.js qa/fund_facts_panel_offline.js qa/deep_dive_v0_offline.js qa/run-offline.js` exits 0. Otherwise HOLD and re-pin |
| Branch / slot | `task/surface-1`, **Worker A** (`pt-wt-worker-a`, detached at `1b31027` after `ai-output-1-s1a`'s cleanup). Bootstrap creates the branch at this brief's commit and runs `task-start` |
| Mode | **attended Auto** (SF-3). No ASK / DENY / protected file; no persistence, scoring, scan, prompt or contract change. Any need for one → STOP |
| qa:offline | step-0 count **78** (after `ai-output-1-s1a`) → **80** (+ `qa/asset_type_offline.js`, `qa/labs_panel_offline.js`; auto-discovered; `qa/run-offline.js` unchanged) |
| Parallel with | Worker B (lane B). No `index.html` work in parallel. Shared file: `BACKLOG.md` only (different entries). **One heavy run at a time.** If `branch-dev` moves, AGENTS 9.4 / 9.5 apply as written |
| Status | **FINAL** (re-pinned at `1b31027`). Placed only on Main Control's approval of this exact hash |

**Program objective.** Three ruled, user-visible improvements to the product surface, in one governed task:
- **S1:** ETFs stop being treated as companies: TAN, ITA and KRE are recognised as ETFs, and the Capital Returns and Fund Facts cards say "not applicable" instead of showing missing company fields.
- **S2:** the two working-but-hidden features (Deep Dive, Portfolio research) can be switched on for the session from the ⚙ panel, with no devtools needed.
- **S3:** the ResearchView "Stale" badge uses the shared data-state label (no visible change).

## §P Placement conditions (checked by COWORK; not met → not placed)

1. `ai-output-1-s1a` LANDed, pushed and cleaned; Worker A detached and clean. **Observed 2026-10-11T09:45Z:** `branch-dev` = `origin/branch-dev` = `1b31027`; canonical checkout CLEAN, no blocking lock; `pt-wt-worker-a` detached at `1b31027`. Slot cleanliness is confirmed by Bootstrap (`git status --short` in the slot) before `task-start`.
2. The canonical checkout is CLEAN on `branch-dev`; `work/surface-1/`, `task/surface-1` and its task-base record are absent.
3. Every §A anchor is re-verified at the tip. A stale anchor means HOLD and re-pin; it is never approximate.
4. §D is empty.

## §D Open decisions

**None.**
- **SF-4 was ruled by Main Control on 2026-10-11:** unrelated `BACKLOG.md` rulings stay outside `surface-1`.
- The entry-19 blocker text and the new entry 31 "ETF fund facts and distributions" (Owner rulings of 2026-10-03) are recorded through `governance-docs-1` (D6), never here.

## §R Placement re-pin record (COWORK, read-only, 2026-10-11)

- **Moved since the draft** (`ac8f39b` → `1b31027`): only `ai-output-1-s1a`.
  - Files: `index.html`, `qa/ai_parse_repair_offline.js` (new), `qa/fixtures/index-pins.json`, `BACKLOG.md` (entry 38 only), `work/ai-output-1-s1a/review.md`.
  - Pin-map change: exactly `functions.repairJSON`, `functions.parseJSON`, `remainderSha256` and `fileSha256`. No §A function and no surface-1 entry is touched.
- **§A:** every anchor matches exactly once at its site. Lines shift by +86 after `repairJSON`.
- **Pin-span check at `1b31027`:**
  - core 375 = acorn 375, **errors 0** (the `repairJSON` truncation is gone);
  - `_runCRResearchCard`, `_runFundFactsCard`, `toggleApiStatus`, `renderApiTable`, `_renderPortfolioPanel` and `_dhLabel` are COMPLETE with no warning.
- **Coupled suites** (`dh_ui_vocabulary` U1–U8, `ts1_default_exposure`, the two fund-facts suites, `deep_dive_v0`, `eod_packet_v0`, `p5_step5_ui`, `vis_score_caliper`, `qa/run-offline.js`): byte-identical since `ac8f39b`. No suite references any surface-1 identifier.
- **New `index.html` reader since the draft:** `qa/ai_parse_repair_offline.js`. It extracts only `repairJSON` / `parseJSON`. It is added to the land-tests and must pass unmodified.
- **Absent at the tip:** `qa/asset_type_offline.js`, `qa/labs_panel_offline.js`, `work/surface-1/`, `task/surface-1`'s record.
- **Suite count:** 78 (`ai-output-1-s1a`'s step 10: PASS, 78).
- **SF-3 condition holds:** the final coupling check found no sensitive or manual-only dependency, so the Mode stays attended Auto.

## §0 Owner rulings (not reopened)

- **SF-1 / SF-2 / SF-3** (2026-10-08): composition P2a + 22b + Entry 30, in that order, attended Auto.
- **Entry 12** (2026-10-01): 12-A (vocabulary `STOCK` / `ETF` / `UNKNOWN`); 12-B (one classifier; `_isETF` retired); 12-C (ETF → stock-only SEC fundamentals not applicable); 12-F (UNKNOWN behaves as STOCK, never ETF); 12-G (known-ETF seed = the 9 default ETFs ∪ every symbol of the old `_isETF` regex); P2a / P2b split (no persistence here); 12-D deferred.
- **Entry 22** (2026-10-03):
  - Labs holds experimental-but-working features only. Tech Score stays out (default since 22a); Research Evidence stays disabled; every other hidden card stays hidden.
  - Deep Dive and Portfolio research are the only Labs switches. Portfolio research shows **existing** results only.
  - Switches are session-only. The `init()` read of `pt_enable_portfolio_research` is untouched (its cleanup is separate scope).
- **Entry 30 / D8:** route "Stale" through the shared labels, text-identical, no visible change.
- **RD-3 (2026-10-11):** C5 Tech Score rounding is **not** in this Master.
- **PC-2 / PC-3:** the five revert chains are frozen. The R-2 rule stays in force: no new top-level function may be referenced **by `renderMainPanel`**. No slice here adds one: `ptAssetType`, `renderLabsToggles` and `setLabsFlag` are called from card handlers and the ⚙ modal, never from `renderMainPanel`.

## §A Anchors (swept at `ac8f39b`; re-verified at `1b31027` on 2026-10-11 — every anchor matches exactly once at its site; line numbers at `1b31027`, indicative)

| Slice | Anchor (must match exactly once at the named site) | `1b31027` |
|---|---|---|
| S1 | `const TICKER_DEFAULTS = {` … its closing `};` (9 entries with `sector: 'ETF'`: SPY QQQ XLE SOXX TAN ITA IGV CIBR KRE) | :5106–5137 |
| S1 | `const _isETF = sym => /^(QQQ|SPY|IGV|SOXX|IWM|DIA|VOO|XL[A-Z]|ARKK|SMH|CIBR|XBI)$/i.test(sym);` and the next line `const _selectCats = sym => _isETF(sym) ? …` inside the gated query-split IIFE (`MAX_CALLS = 7` at :12733) | :12757–12758 |
| S1 | in `_runCRResearchCard`: `if (!btn || !panel) return;` | :13774 / :13777 |
| S1 | in `_runFundFactsCard`: `if (btn.disabled) return;` (`btn`, `input`, `panel` are defined just above it) | :14167 / :14174 |
| S2 | `.api-info-text{…}` CSS rule | :662 |
| S2 | the `api-info-box` element containing `About API Status`, the last child of the api modal | :16250–16256 |
| S2 | `function toggleApiStatus()` with the line `if (!isOpen) renderApiTable();` | :16117 / :16121 |
| S2 | `function renderApiTable()` closing brace | :16124 → :16155 |
| S2 | `let _cockpitResults`, `let _activeTicker` | :6958 / :6960 |
| S2 | `function _pfIsPortfolioViewActive()`; `let   _pfLiveRunCanceller   = null;` | :11098 / :10987 |
| S2 | `init()` read `(localStorage.getItem('pt_enable_portfolio_research') === 'true')` — **untouched** | :15941 |
| S3 | in `_renderPortfolioPanel`: `resStEl.textContent = isStale ? 'Stale' : 'Research';` | :10828 |
| S3 | `DH_DISPLAY.state` `'stale': 'Stale'`; `function _dhLabel(group, code)` | :2753 / :2783 |

## §1 Program, order, entry conditions

| Slice | Entry condition (the Worker checks before it starts) |
|---|---|
| **S1 — P2a classifier** | §P holds; step 0 done |
| **S2 — 22b Labs** | S1 checkpoint committed |
| **S3 — Entry 30 Stale label** | S2 checkpoint committed |

## §2 Continuation, gaps and STOP (as proven in `nlm-consistency-1`)

**Continue to the next slice automatically only when all of these hold:**
- the slice's targeted tests and its land-tests PASS;
- the slice's `index-pins --diff` lists exactly the slice's expected entries (§S*.4);
- Codex has no unresolved Class I finding (FIX done and re-passed, or REJECT / DEFER with reasons; one scoped re-pass);
- the next entry condition holds;
- the repo still matches §A.

**Gaps (M-5):** a gap that does not block the current slice's DoD, stays in this lane, needs no Owner decision and no protected / live / env boundary, and can be isolated is recorded in `review.md` `## Lessons` as `[backlog]` / `[design]`. It is not fixed here and does not stop the program.

**Program STOP** (in addition to STOP-1..6 and each slice's STOP):
- an unexpected test failure (an unlisted suite, or a new failure class);
- an unresolved Class I finding after its one scoped re-pass;
- a brief / repo mismatch;
- a new Owner decision;
- any ASK / DENY / protected path;
- any live DEV action, env or Netlify change before LAND;
- any storage, persistence, scoring, scan or prompt change;
- an unmet entry condition;
- a second heavy run while one is active.

**Coupling sweep (pilot lesson; mandatory in `/plan`, per slice):**
- grep the whole `qa/` tree for every identifier, label, literal and occurrence count the slice adds, removes or renames;
- build the slice's targeted run from that grep;
- any suite the grep finds that is not in §Y's land-tests is added to the targeted run, and **must pass unmodified**.

## §3 Skills

- `pt-offline-suite` **Required** (RED → GREEN, planted negatives, coupling sweep). For `index.html` pins the pin-map procedure governs: per slice `node qa/tools/index-pins.js --diff <previous checkpoint or base>` → `--update` → `--check`. The revert chains are frozen and not extended.
- `/plan` is mandatory, covering all three slices before S1 starts.
- `browser-integrity-qa`: COWORK, post-push DEV checks only, each separately approved.

## §S1 Slice 1 — P2a canonical STOCK / ETF / UNKNOWN classifier

### S1.1 Requirements (exact changes in `index.html`, line endings preserved)

**C1 — classifier**, inserted immediately after the closing `};` of `TICKER_DEFAULTS`:

```js
// Entry 12 / P2a (12-A, 12-B, 12-F, 12-G): the single asset-type classifier.
// Known-ETF seed = the 9 default ETFs ∪ every symbol the former _isETF regex covered
// (incl. the whole XL? family). UNKNOWN behaves as STOCK everywhere and is never ETF.
// P2b will extend this function to read a stored per-ticker choice first; P2a reads none.
var PT_KNOWN_ETF_SYMBOLS = ['SPY', 'QQQ', 'XLE', 'SOXX', 'TAN', 'ITA', 'IGV', 'CIBR', 'KRE',
  'IWM', 'DIA', 'VOO', 'ARKK', 'SMH', 'XBI'];
var PT_KNOWN_ETF_PATTERN = /^XL[A-Z]$/;
function ptAssetType(sym) {
  var s = (typeof sym === 'string') ? sym.trim().toUpperCase() : '';
  if (!/^[A-Z0-9.\-]{1,12}$/.test(s)) return 'UNKNOWN';
  if (PT_KNOWN_ETF_SYMBOLS.indexOf(s) !== -1 || PT_KNOWN_ETF_PATTERN.test(s)) return 'ETF';
  if (Object.prototype.hasOwnProperty.call(TICKER_DEFAULTS, s)) return 'STOCK';
  return 'UNKNOWN';
}
var PT_ETF_FUNDAMENTALS_NA_TEXT = 'Not applicable — ETF. SEC company fundamentals apply to operating companies, not funds.';
```

**C2 — catalyst selection** (in the IIFE):
- delete the `const _isETF = …` line;
- replace `_selectCats` with
  `const _selectCats = sym => ptAssetType(sym) === 'ETF' ? ['analyst','risk'] : ['earnings','analyst','insider','contracts','mna','buyback','risk'].slice(0,MAX_CALLS);`

**C3 — Capital Returns card** (`_runCRResearchCard`): immediately after `if (!btn || !panel) return;`, insert
`  if (typeof ptAssetType === 'function' && ptAssetType(sym) === 'ETF') { panel.textContent = PT_ETF_FUNDAMENTALS_NA_TEXT; return; }`

**C4 — Fund Facts card** (`_runFundFactsCard`): immediately after `if (btn.disabled) return;`, insert
`  if (typeof ptAssetType === 'function' && ptAssetType(sym) === 'ETF') { input.value = ''; panel.textContent = PT_ETF_FUNDAMENTALS_NA_TEXT; return; }`

- For an ETF there is no network call. The token field is cleared exactly as the normal path does.
- The `typeof` guard follows the S6-B hook pattern, because `qa/fund_facts_read_client_test.js` evaluates `_runFundFactsCard` in isolation.

**Nothing else changes:** `renderMainPanel`, `_crFetchForScan`, the scan / prefetch paths, `computeTechnicalSnapshot`, the `TICKER_DEFAULTS` values, the prompt, `_ffpRenderFromResult`, storage, backup / restore, scoring, `pt_*`.

### S1.2 Files

`index.html` (C1–C4) · `qa/asset_type_offline.js` (NEW) · `qa/fixtures/index-pins.json` (regenerated).

### S1.3 Tests — `qa/asset_type_offline.js`

Pure Node, real `index.html` (CRLF-normalised), `vm` extraction.

| ID | Assertion |
|---|---|
| AT-1 | Every return value over a large mixed input set is `STOCK`, `ETF` or `UNKNOWN` |
| AT-2 | 12-G seed: the 9 defaults → ETF; every explicit symbol of the old regex → ETF; all 26 `XLA…XLZ` → ETF; case- and whitespace-insensitive (`' qqq '` → ETF) |
| AT-3 | No regression: for every symbol the old regex matched (enumerated from the old literal recorded in the suite), the new result is ETF |
| AT-4 | Every `TICKER_DEFAULTS` key whose `sector !== 'ETF'` → STOCK |
| AT-5 | `'RKLB'`, `'VTI'`, `''`, `null`, `42`, `'X'.repeat(20)`, `'BRK.B'` → UNKNOWN, never ETF |
| AT-6 | Deterministic; no `localStorage`, `document`, `window`, `fetch` or `Date` in `ptAssetType` |
| AT-7 | `_isETF` no longer occurs in `index.html`; `_selectCats` references `ptAssetType`; with `MAX_CALLS = 7`, TAN → `['analyst','risk']`, NVDA and RKLB → seven categories |
| AT-8 | `_runCRResearchCard` with a DOM stub: ETF → panel text equals the N/A text and the `fetch` spy is not called; STOCK and UNKNOWN → the existing path (the `fetch` spy is called once) |
| AT-9 | `_runFundFactsCard` with the gate on and a DOM stub: ETF → N/A text, input cleared, the `requestFundFactsRead` spy not called; STOCK and UNKNOWN → the spy called once. Gate off → unchanged early return |
| AT-10 | `_crFetchForScan`, `computeTechnicalSnapshot` and the `TICKER_DEFAULTS` literal are byte-equal to the base; the C3 / C4 guards are `typeof`-guarded exactly as written |

Every row has a planted negative: the seed missing TAN; `XL[A-Z]` dropped; UNKNOWN → ETF; the N/A path still fetching; `_isETF` left in place.

### S1.4 Coupling and pin impacts (swept at `ac8f39b`; re-swept at `1b31027`, unchanged)

- Suites that read the edited code:
  - `qa/fund_facts_read_client_test.js` (isolated `_runFundFactsCard`; RC34 checks the **first** `input.value = ''` precedes `requestFundFactsRead({` — C4's early clear keeps that true);
  - `qa/fund_facts_panel_offline.js` (PN17: exactly one `typeof _ffpRenderFromResult === 'function'` in the S6-B block — C4 adds a different `typeof` and leaves it at one).
  - Both must pass **unmodified**.
- No suite references `_isETF`, `_selectCats`, `MAX_CALLS` or `TICKER_DEFAULTS`.
- **Pin map:** `--diff <base>` lists exactly `functions.ptAssetType` (added), `functions._runCRResearchCard`, `functions._runFundFactsCard`, `remainderSha256` (C1's `var`s, C2's IIFE edit) and the file digest. No region, no other function.

### S1.5 Evidence

`review.md` S1 section: RED → GREEN, planted negatives, the `--diff` output, Codex ledger.

### S1.6 Rollback

Checkpoint C1.

### S1.7 STOP

- UNKNOWN treated as ETF anywhere.
- A seed missing an old-regex or default-ETF symbol.
- Any change to `renderMainPanel`, `_crFetchForScan`, the scan path or storage.
- Any edit to the two fund-facts suites.

## §S2 Slice 2 — 22b session-only Labs switches

### S2.1 Requirements (exact changes in `index.html`)

**L1 — CSS.** Immediately after the `.api-info-text{…}` rule:

```css
.labs-box{padding:14px 20px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px}
.labs-title{font-size:13px;font-weight:600;color:var(--text)}
.labs-sub{font-size:12px;color:var(--text2)}
.labs-row{display:flex;gap:10px;align-items:flex-start;font-size:12.5px;color:var(--text2);cursor:pointer}
.labs-row b{color:var(--text);font-weight:600}
```

**L2 — Labs section.** Immediately after the closing `</div>` of the `api-info-box` element, still inside the api modal:

```html
    <div class="labs-box" id="labsBox">
      <div class="labs-title">Labs</div>
      <div class="labs-sub">Experimental features that already work. Switches reset when you reload the page.</div>
      <label class="labs-row"><input type="checkbox" id="labs-PT_ENABLE_DEEP_DIVE" onchange="setLabsFlag('PT_ENABLE_DEEP_DIVE', this.checked)">
        <span><b>Deep Dive</b> — adds the AI Deep Dive card to the ticker view. Each run is one paid AI call, only when you press its button.</span></label>
      <label class="labs-row"><input type="checkbox" id="labs-PT_ENABLE_PORTFOLIO_RESEARCH" onchange="setLabsFlag('PT_ENABLE_PORTFOLIO_RESEARCH', this.checked)">
        <span><b>Portfolio research</b> — shows research results you already have in the Portfolio view. Starts no new research.</span></label>
    </div>
```

**L3 — setter and sync.** Immediately after the closing `}` of `renderApiTable`:

```js
// Entry 22b (Owner ruling 2026-10-03): session-only Labs switches. Each switch sets its gate to a
// strict boolean in memory only — no storage write, no fetch, no scan. Gates keep their strict
// === true checks; the existing Portfolio Research init read is untouched (its cleanup is separate scope).
const PT_LABS_FLAGS = ['PT_ENABLE_DEEP_DIVE', 'PT_ENABLE_PORTFOLIO_RESEARCH'];
function renderLabsToggles() {
  PT_LABS_FLAGS.forEach(function (flag) {
    var el = document.getElementById('labs-' + flag);
    if (el) el.checked = (window[flag] === true);
  });
}
function setLabsFlag(flag, on) {
  if (PT_LABS_FLAGS.indexOf(flag) === -1) return;
  window[flag] = (on === true);
  if (flag === 'PT_ENABLE_DEEP_DIVE') {
    if (_activeTicker) {
      const item = _cockpitResults.find(r => r.ticker === _activeTicker);
      if (item) renderMainPanel(item);
    }
  } else if (_pfIsPortfolioViewActive() && !_pfLiveRunCanceller) {
    _renderPortfolioPanel();
  }
  renderLabsToggles();
}
```

**L4 — sync on open.** In `toggleApiStatus`, replace `if (!isOpen) renderApiTable();` with
`if (!isOpen) { renderApiTable(); renderLabsToggles(); }`.

**Nothing else changes:** `renderMainPanel`, `_renderPortfolioPanel`, `_calcPortfolioAggregates`, `renderApiTable`, `init()` and its Portfolio research read, the Tech Score default, every other `PT_ENABLE_*` gate, Deep Dive internals, live prices, scans, scoring, storage, backup / restore, prompts.

### S2.2 Files

`index.html` (L1–L4) · `qa/labs_panel_offline.js` (NEW) · `qa/fixtures/index-pins.json` (regenerated).

### S2.3 Tests — `qa/labs_panel_offline.js`

| ID | Assertion |
|---|---|
| LB-1 | `#labsBox` exists inside the api modal, after `api-info-box`, with exactly two switches (`labs-PT_ENABLE_DEEP_DIVE`, `labs-PT_ENABLE_PORTFOLIO_RESEARCH`); no Tech Score, Research Evidence or other gate switch |
| LB-2 | `PT_LABS_FLAGS` is exactly those two; `setLabsFlag` with any other name (e.g. `PT_ENABLE_TECH_SCORE`, `PT_ENABLE_RESEARCH_EVIDENCE_CLIENT`) changes nothing |
| LB-3 | Strict booleans: `true` → `true`; `false`, `'true'`, `1`, `undefined` → `false` |
| LB-4 | No persistence: the L3 sources contain no `localStorage`, `sessionStorage`, `indexedDB` or `document.cookie`, and run in a sandbox without storage globals; `pt_enable_portfolio_research` still occurs exactly once in `index.html` |
| LB-5 | No network or jobs: the L3 sources reference no `fetch`, `XMLHttpRequest`, `_dd0RunCard`, `_dd0FetchAnalysis`, `_pfLiveBatch`, `_pfEodManualRefresh`, scan or scoring function; spies record zero calls |
| LB-6 | Deep Dive redraw: an active ticker with a result → `renderMainPanel` called once with that item; no active ticker → not called |
| LB-7 | Portfolio redraw: view active and no live run → `_renderPortfolioPanel` called once; `_pfLiveRunCanceller` set → not called; view inactive → not called |
| LB-8 | `renderMainPanel`, `_renderPortfolioPanel`, `_calcPortfolioAggregates`, `renderApiTable` and the `init()` read are unchanged: their pin-map entries equal the S1 checkpoint's |
| LB-9 | `toggleApiStatus` calls `renderLabsToggles()` on open; `renderLabsToggles` reflects `window[flag] === true` only |

Every row has a planted negative: a third switch; a storage write; a fetch in the setter; truthy instead of strict; a redraw during a live run; the init read edited.

### S2.4 Coupling and pin impacts (swept at `ac8f39b`; re-swept at `1b31027`, unchanged)

- `qa/ts1_default_exposure_offline.js` TX-5 (`liveGateAssignments`) flags `window.PT_ENABLE_X =`, a bare `PT_ENABLE_X =`, `window['PT_ENABLE_X'] =` and `PT_ENABLE_X:` object-literal defaults.
  - L1–L4 contain none of these: the setter assigns through the **variable** key `window[flag]`, and the names appear only as array strings and HTML attribute values. TX-5 must pass **unmodified**.
  - **Recorded limit:** TX-5 does not see variable-key assignments. The Labs setter is a click-time assignment, allowed by the ruling, and the test does not need to cover it.
- `qa/run-offline.js` Portfolio research block (the init read is pinned by regex) and `qa/deep_dive_v0_offline.js` must pass unmodified.
- No suite references `api-info`, `toggleApiStatus`, `renderApiTable`, the api modal or `btn-gear`.
- **Pin map:** `--diff <C1>` lists exactly `functions.toggleApiStatus`, `functions.renderLabsToggles` and `functions.setLabsFlag` (both added), `remainderSha256` (CSS, HTML, `const PT_LABS_FLAGS`) and the file digest.

### S2.5 Evidence

The `review.md` S2 section. After push, a COWORK DEV check (approved separately): ⚙ shows Labs with two switches, both off; Deep Dive on → the card appears with no network call until its button is pressed; Portfolio research on → existing rows appear with no network call; reload → both off.

### S2.6 Rollback

Checkpoint C2.

### S2.7 STOP

- Any storage write.
- Any edit to the `init()` read.
- Any fetch, scan or job reachable from the setter.
- A switch for any other flag.
- Any edit to `ts1_default_exposure_offline.js` or another existing suite. If one flags this change, STOP and re-plan; never weaken it.

## §S3 Slice 3 — Entry 30: ResearchView "Stale" through the shared labels

### S3.1 Requirement

- In `_renderPortfolioPanel` replace `resStEl.textContent = isStale ? 'Stale' : 'Research';` with `resStEl.textContent = isStale ? _dhLabel('state', 'stale') : 'Research';`.
- `DH_DISPLAY.state['stale']` is `'Stale'`, so the rendered text is byte-identical.
- `'Research'` is not a data-state word and stays a literal. The CSS class (`stale` / `found`) is unchanged.

### S3.2 Files

`index.html` (one line) · `qa/dh_ui_vocabulary_offline.js` (one new site row) · `qa/fixtures/index-pins.json`.

### S3.3 Tests

`qa/dh_ui_vocabulary_offline.js` gains one site row **U9**, the next id after U8, in the existing UV table:
- the site's label comes from `_dhLabel('state', 'stale')`;
- the before-literal `'Stale'` is absent **at that site**;
- the control fixture follows the U7 pattern (same function, `resStEl.textContent`);
- a render check confirms the visible text is still `Stale` / `Research`.

The existing U1–U8 rows and their assertions are unchanged.

### S3.4 Coupling and pin impacts

- `dh_ui_vocabulary` U7 anchors the same function (unchanged).
- `eod_packet_v0` asserts no `staleTag.textContent = 'Stale'` literal elsewhere (unaffected).
- `p5_step5_ui_offline.js` checks a **button** text `'Research'` (unaffected).
- **Pin map:** `--diff <C2>` lists exactly `functions._renderPortfolioPanel` and the file digest.

### S3.5 Evidence

The `review.md` S3 section.

### S3.6 Rollback

Checkpoint C3.

### S3.7 STOP

- Any visible text change.
- Any change to U1–U8.

## §C Checkpoint commits

- One per completed slice on `task/surface-1`, through the r9 gate, ordinary paths only, never amended: `wip(surface-1): slice k <name> — checkpoint`.
- The final step-13 commit carries `review.md` (one section per slice, plus program closure) and the step-10a `BACKLOG.md` reconciliation.

## §L Close at the last passed slice (pre-authorised, M-4)

If S2 or S3 STOPs and the Owner chooses to close:
1. reset only the unfinished slice's work to the last checkpoint, in the Worker's own tree;
2. regenerate the pin map at that tree;
3. step-10 full `qa:offline` (expected = step 0 + the passed slices' new suites);
4. `review.md` records the unfinished slices; their entries stay open;
5. final Codex check;
6. step-13 commit; integrity;
7. LAND and push.

No brief amendment.

## §X Program closure

1. Step-10 full `qa:offline` (step 0 + 2), on the Owner's heavy-lane go-ahead, never concurrent with another heavy run.
2. Step 10a: `BACKLOG.md`:
   - entry 12 status text (P2a landed; P2b remains — `partial`, no DONE line);
   - entry 22 status + heading `— **DONE**` + DONE / HISTORY line;
   - entry 30 row status + DONE / HISTORY line, in entry-number order (`**22**` and `**30**` between `**11**` and `**32**`).
3. `review.md` with `## Backlog reconciliation` and a LAND-EVIDENCE line.
4. Final Codex check on the whole task diff (base = the recorded task base).
5. Step-13 commit; integrity (record form).
6. R12 LAND, R12 push, cleanup.
7. COWORK post-push DEV checks (S2 Labs; S3 visual unchanged), each with the Owner's approval.

## §Y Land-scope, land-tests, Definition of Done

<!-- land-scope:begin -->
index.html
qa/asset_type_offline.js
qa/labs_panel_offline.js
qa/dh_ui_vocabulary_offline.js
qa/fixtures/index-pins.json
BACKLOG.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/asset_type_offline.js
node qa/labs_panel_offline.js
node qa/dh_ui_vocabulary_offline.js
node qa/tools/index-pins.js --check
node qa/index_pins_offline.js
node qa/fund_facts_read_client_test.js
node qa/fund_facts_panel_offline.js
node qa/ts1_default_exposure_offline.js
node qa/deep_dive_v0_offline.js
node qa/vis_score_caliper_offline.js
node qa/no_synthetic_score_offline.js
node qa/analyst_parser_offline.js
node qa/high1y_label_offline.js
node qa/ma_stack_label_offline.js
node qa/ath_isolation_offline.js
node qa/eod_packet_v0_offline.js
node qa/p5_step5_ui_offline.js
node qa/ai_parse_repair_offline.js
<!-- land-tests:end -->

**Definition of Done**
- **S1:** AT-1…AT-10 PASS with negatives caught; C1.
- **S2:** LB-1…LB-9 PASS; C2.
- **S3:** U9 PASS; C3.
- **Program:**
  - the per-slice `--diff` outputs exactly as in §S*.4;
  - full `qa:offline` = step 0 + 2, PASS;
  - Codex: no unresolved Class I;
  - step 10a exact;
  - `review.md` complete;
  - LANDed, pushed and cleaned through R12.
