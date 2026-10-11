# Master Brief: surface-1b — session-only Labs switches (22b) and the shared "Stale" label (Entry 30)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below. **Status: FINAL, HELD** (COWORK, re-pinned 2026-10-12 at `aff45b286b5a9552beac2c721a57b35c7226e3a3`; §R). Placed only on Main Control's separate approval of this exact hash.

| | |
|---|---|
| Lineage | Continues `surface-1` (closed at S1 under §L, Main Control **SR-1**: `work/surface-1/review.md`, landed `5931296` + `aff45b2`). Takes over its S2 (22b) and S3 (Entry 30). **Seed archive:** `C:\Users\Owner\Documents\Project\pt-work-artifacts\surface-1-s2\20261011T112905Z\`, with `ARCHIVE-INVENTORY.txt` sha256 **`7b4b093a37f38c70aa4feb0c71d19024dd8929ff39c58191550af49ba5f21d28`** listing:<br>• `index.html` `b9bef22b…3fae`<br>• `qa/labs_panel_offline.js` `b45b4d16…add9`<br>• `s2-index.diff` `ddc55a2f…b9673`<br>• `s1-checkpoint-9c40c49.patch` `74f2cc69…113a`<br>• `s1-patch-id.txt` `f935145d…c4ec`<br>• the `work/` evidence snapshot<br>The seed is **reference material only** and carries no approval. Its L3 (`window[flag] = …`) is superseded by S1.1 |
| Backlog | Entry **22** → `close` (S1) · Entry **30** → `close` (S2). `BACKLOG.md` is in scope for step-10a reconciliation of exactly these two entries |
| Baseline | **`aff45b286b5a9552beac2c721a57b35c7226e3a3`** (= `origin/branch-dev`). The brief-only commit adds only `work/surface-1b/brief.md` on top of the then-current tip. Valid only if at that tip: (1) every §A anchor matches exactly once; (2) `qa/ts1_default_exposure_offline.js` LF sha256 = `b933433cf9ea0f46d9dbae9073de0064bcfd91ee33671957dd4ac6e23a422af5` and `qa/dh_ui_vocabulary_offline.js` = `6060c88fccf274d4e505a681e1749947d6ca66cf244bf664208919a9fd203559` (unchanged since `ac8f39b`); (3) `ptAssetType` is present (S1 landed) and `setLabsFlag`, `renderLabsToggles`, `PT_LABS_FLAGS`, `labsBox` are absent; (4) `qa/labs_panel_offline.js` is absent; (5) `git diff --quiet aff45b286b5a9552beac2c721a57b35c7226e3a3 <tip> -- index.html qa/fixtures/index-pins.json qa/ts1_default_exposure_offline.js qa/dh_ui_vocabulary_offline.js qa/deep_dive_v0_offline.js qa/run-offline.js` exits 0. Otherwise HOLD and re-pin. **All five hold at `aff45b2` (§R)** |
| Branch / slot | `task/surface-1b`, **Worker A** (`pt-wt-worker-a`, detached at `aff45b2` after `surface-1`'s cleanup). **Before `ai-output-2`** (SR-2) |
| Mode | **Manual** — S1 changes an existing QA contract (TX-5) under an Owner ruling and writes a client gate (M5) |
| qa:offline | step-0 count **79** at `aff45b2` → **80** (+ `qa/labs_panel_offline.js`; auto-discovered; `qa/run-offline.js` unchanged). Digest-gated: a normal full run takes about 100 s (E1). **No E1-gated input is in this task's scope, so no forced replay is required** — unless the E1-D7 weekly replay is due at step 0 (§E1) |
| Parallel with | Worker B on `market-data-1`: disjoint files (its land-scope is `netlify/functions/market-data.js`, `netlify/functions/lib/market-data-live-budget.js`, `qa/market_data_live_offline.js`, `qa/ath_isolation_offline.js` and `BACKLOG.md` entry 20). The only shared file is `BACKLOG.md`, with a different entry. Whichever task lands second performs the Second-LAND resync. **One forced / heavy run at a time** |

**Objective:**
- **S1:** the ⚙ panel gains a Labs section with two session-only switches, Deep Dive and Portfolio research. Gate writes stay statically auditable: no computed-key write anywhere, exactly one strict writer per Labs gate.
- **S2:** the ResearchView "Stale" badge uses the shared data-state label (no visible change).

## §P Placement conditions (COWORK; not met → not placed)

1. `surface-1` closed: LANDed, pushed and cleaned per `PARTIAL-CLOSE-S1.md`. **Observed 2026-10-12:** `branch-dev` = `origin/branch-dev` = `aff45b2`; canonical CLEAN, no blocking lock; `pt-wt-worker-a` detached at `aff45b2`. Slot cleanliness is confirmed by Bootstrap (`git status --short`) before `task-start`.
2. The canonical checkout is CLEAN; `work/surface-1b/`, `task/surface-1b` and its record are absent.
3. The Baseline row holds. The seed archive exists with the inventory sha256 in the Lineage row (verified 2026-10-12; each listed file re-hashes to its inventory value).
4. §D is empty.

## §D Open decisions

**None.** LB-R1 and SR-2 are ruled (§0).

## §R Placement re-pin record (COWORK, read-only, 2026-10-12)

- **Moved since the FINAL-DRAFT** (`5b33869` → `aff45b2`): `qa-e1-digest-gate` (`5428472`, `be9f56a`) and `surface-1`'s S1 + closure (`5931296`, `aff45b2`).
  - `index.html` and `qa/fixtures/index-pins.json` at `aff45b2` are **byte-identical to the S1 checkpoint `9c40c49`** that the reference prototype was built on.
  - `qa/ts1_default_exposure_offline.js` (`b933433c…`), `qa/dh_ui_vocabulary_offline.js` (`6060c88f…`), `deep_dive_v0`, `asset_type`, `ai_parse_repair`, `eod_packet_v0`, `p5_step5_ui` and `qa/run-offline.js` are unchanged since `9c40c49`.
  - The prototype results therefore carry over unchanged: refined suite 61 / 61 on the corrected code; unrefined fails only TX-5; the brief-L3 tree fails TX-2.
- **Coupling grep at `aff45b2`:**
  - no suite references `api-info`, `toggleApiStatus`, `renderApiTable`, `btn-gear`, `labsBox`, `setLabsFlag`, `renderLabsToggles`, `PT_LABS_FLAGS` or `labs_panel_offline`;
  - `resStEl` occurs only in `dh_ui_vocabulary` (U7);
  - the string `PT_ENABLE_DEEP_DIVE =` occurs in `deep_dive_v0` and `ts1_default_exposure` (both in the coupled set).
- **Suite count:** 79 at `aff45b2` (`work/surface-1/review.md`: step 10 PASS 79).

## §0 Owner rulings (not reopened)

- **Entry 22 / 22b** (2026-10-03):
  - Labs holds experimental-but-working features only. Deep Dive and Portfolio research are the only Labs switches. Portfolio research shows **existing** results only.
  - Switches are session-only. The `init()` read of `pt_enable_portfolio_research` is untouched.
  - Tech Score stays out of Labs; Research Evidence stays disabled.
- **Entry 30 / D8:** route "Stale" through the shared labels, text-identical.
- **SR-1** (2026-10-11): `surface-1` closes at S1. **SR-2:** `surface-1b` runs before `ai-output-2`.
- **LB-R1** (2026-10-11): a user-initiated, session-only Labs toggle is **not a load-time default**.
  - TX-5 may be narrowly refined to permit **exactly one explicit strict-boolean assignment to `window.PT_ENABLE_DEEP_DIVE`, exclusively inside `setLabsFlag`**.
  - All existing safety invariants are preserved.
  - Mutation negatives must reject: automatic initialization, duplicate writers, non-strict assignments, computed-key writes, and indirect `globalThis` / `Reflect.set` workarounds.
- **PC-2 / PC-3:** the five revert chains are frozen (`index-pins-frozen.json` untouched). R-2 rule: no new top-level function is referenced by `renderMainPanel`; `setLabsFlag` / `renderLabsToggles` are called from the ⚙ modal only.

## §A Anchors (each verified to match exactly once at `aff45b2`; line numbers from `aff45b2`, indicative)

| Slice | Anchor | `aff45b2` |
|---|---|---|
| S1 | `.api-info-text{` CSS rule | :662 |
| S1 | `<div class="api-info-box">` containing `About API Status` (last child of the api modal) | :16266 / :16269 |
| S1 | `function toggleApiStatus()` with `  if (!isOpen) renderApiTable();` | :16133 / :16137 |
| S1 | `function renderApiTable()` … closing `}` | :16140 → :16171 |
| S1 | `let _cockpitResults = [];` · `let _activeTicker` | :6973 / :6975 |
| S1 | `function _pfIsPortfolioViewActive()` · `let   _pfLiveRunCanceller   = null;` | :11113 / :11002 |
| S1 | `init()` read `(localStorage.getItem('pt_enable_portfolio_research') === 'true')` — **untouched** | :15957 |
| S1 | `qa/ts1_default_exposure_offline.js`: `function checkTx5(src) {` · `const MUST_HAVE_NO_DEFAULT = [` · NEG entry `{ id: 'TX-5', label: 'unrelated gate default added'` | each ×1 |
| S2 | in `_renderPortfolioPanel` (:10001): `resStEl.textContent = isStale ? 'Stale' : 'Research';` | :10843 |
| S2 | `DH_DISPLAY.state` `'stale': 'Stale'` · `function _dhLabel(group, code)` | :2753 / :2783 |
| — | absent at `aff45b2`: `setLabsFlag`, `renderLabsToggles`, `PT_LABS_FLAGS`, `labsBox` (0 each); present: `function ptAssetType(` (:5145) | — |

## §1 Order and entry conditions

| Slice | Entry condition |
|---|---|
| **S1 — 22b Labs (static setter + TX-5 refinement)** | §P holds; step 0 done |
| **S2 — Entry 30 Stale label** | S1 checkpoint committed |

**§2 Continuation (approved multi-slice model — no Owner gate between successful slices).** After S1's checkpoint commit, the Worker **continues automatically into S2** only when all of these hold:
- S1's targeted tests and its land-tests PASS;
- `node qa/tools/index-pins.js --diff <task base>` lists exactly S1.4's entries;
- Codex has no unresolved Class I finding (FIX done and re-passed, or REJECT / DEFER with reasons; one scoped re-pass);
- S2's entry condition holds;
- the repo still matches §A.

**Gaps (M-5).** A gap that does not block the current slice's Definition of Done, stays in this lane, needs no Owner decision and no protected / live / env boundary, and can be isolated, goes to `review.md` `## Lessons` as `[backlog]` / `[design]`. It does not stop the program.

**Program STOP** (in addition to STOP-1…6 and each slice's STOP):
- an unexpected test failure (an unlisted suite, or a new failure class);
- an unresolved Class I after its one scoped re-pass;
- a brief / repo mismatch;
- a new Owner decision;
- any ASK / DENY / protected path;
- any live DEV, env or Netlify action before LAND;
- any storage, persistence, scoring, scan or prompt change;
- an unmet entry condition;
- a second heavy / forced run while one is active.

**Owner gates that remain** (governance, not slice gates):
- the R11 brief-only record;
- the heavy-lane go-ahead for any forced or heavy run;
- the R12 LAND and PUSH records.

**§E1 (QA gate).** Normal full runs are digest-gated (four suites SKIP when pinned; about 100 s). This task touches no E1 input (`pt-land.js`, the hook, settings, integrity, `qa/lib/{fixture-template,run-tmp,spawn-meter,exec-env-fingerprint}.js`, or the four gated suites).
- **Forced replay required only if:** the E1-D7 weekly replay is due at step 0 (no full replay PASS on the current pins in the last 7 days — the last was `qa-e1-digest-gate`'s second R2 on 2026-10-11: every heavy row passed, recorded as a valid pin-initialization checkpoint. That is "the passing replay of a task that re-pinned them" under E1 §9, so the replay is due from 2026-10-18). In that case step 0 runs as `PT_QA_FORCE_HEAVY=1 npm run qa:offline` on the heavy-lane go-ahead, and **a failing heavy row in a gated suite → STOP (not M4)**.
- Any `E1 … re-pin required` / `pin invalid` / `override` line in a normal run → STOP.

Additionally:
- **Coupling execution rule (lesson from `surface-1`):** before each slice's first commit, every coupled suite in §Y's land-tests is **run** against the slice's real code, not reviewed in prose.

**Skills:**
- `pt-offline-suite` **Required**.
- `/plan` mandatory (both slices before S1).
- `browser-integrity-qa`: COWORK post-push DEV checks only, each separately approved.

## §S1 Slice 1 — 22b session-only Labs switches

### S1.1 `index.html` (exact; line endings preserved)

The seed's L1, L2 and L4 hunks are byte-identical to the texts below.

**L1 — CSS**, immediately after the `.api-info-text{…}` rule:

```css
.labs-box{padding:14px 20px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px}
.labs-title{font-size:13px;font-weight:600;color:var(--text)}
.labs-sub{font-size:12px;color:var(--text2)}
.labs-row{display:flex;gap:10px;align-items:flex-start;font-size:12.5px;color:var(--text2);cursor:pointer}
.labs-row b{color:var(--text);font-weight:600}
```

**L2 — Labs section**, immediately after the closing `</div>` of the `api-info-box` element, still inside the api modal:

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

**L4 — sync on open.** In `toggleApiStatus`, replace `if (!isOpen) renderApiTable();` with `if (!isOpen) { renderApiTable(); renderLabsToggles(); }`.

**L3 — setter and sync**, immediately after the closing `}` of `renderApiTable`. **Verbatim** (it replaces `surface-1`'s L3; the only change is the static per-gate writes):

```js
// Entry 22b (Owner ruling 2026-10-03; LB-R1 2026-10-11): session-only Labs switches. Each switch writes
// its gate by name as a strict boolean, in memory only — no storage write, no fetch, no scan, no
// computed-key write. Gates keep their strict === true checks; the existing Portfolio Research init
// read is untouched (its cleanup is separate scope).
const PT_LABS_FLAGS = ['PT_ENABLE_DEEP_DIVE', 'PT_ENABLE_PORTFOLIO_RESEARCH'];
function renderLabsToggles() {
  PT_LABS_FLAGS.forEach(function (flag) {
    var el = document.getElementById('labs-' + flag);
    if (el) el.checked = (window[flag] === true);
  });
}
function setLabsFlag(flag, on) {
  if (flag === 'PT_ENABLE_DEEP_DIVE') {
    window.PT_ENABLE_DEEP_DIVE = (on === true);
    if (_activeTicker) {
      const item = _cockpitResults.find(r => r.ticker === _activeTicker);
      if (item) renderMainPanel(item);
    }
  } else if (flag === 'PT_ENABLE_PORTFOLIO_RESEARCH') {
    window.PT_ENABLE_PORTFOLIO_RESEARCH = (on === true);
    if (_pfIsPortfolioViewActive() && !_pfLiveRunCanceller) _renderPortfolioPanel();
  } else {
    return;
  }
  renderLabsToggles();
}
```

- `renderLabsToggles` only **reads** `window[flag] === true`. TX-2 bans computed-key writes, not reads; `index.html` already reads `window[FLAG]` in the query-split IIFE.

**Nothing else changes:** `renderMainPanel`, `_renderPortfolioPanel`, `_calcPortfolioAggregates`, `renderApiTable`, `init()` and its Portfolio-research read, every other `PT_ENABLE_*` gate, Deep Dive internals, scans, scoring, storage, backup / restore, prompts.

### S1.2 `qa/ts1_default_exposure_offline.js` — TX-5 refinement (LB-R1; exact)

1. **After `MUST_HAVE_NO_DEFAULT`**, insert `LABS_WRITERS` and `labsWriterSpan` (below).
2. **In `checkTx5`:**
   - first reject any live gate write through a global alias (`globalThis|self|top|parent|frames`) and any `Reflect.set` / `Reflect.defineProperty` on `window|globalThis|self`;
   - then, for each `LABS_WRITERS` gate that has live assignments, require all of: exactly one assignment; exactly one `window.<GATE> =` form; that assignment located inside `setLabsFlag` (which must be unique); its text exactly the strict statement. Remove it from further checks;
   - every other rule (allow-list, `MUST_HAVE_NO_DEFAULT`, object-literal defaults) applies unchanged to the remainder.

```js
// LB-R1 (Owner, 2026-10-11): a user-initiated, session-only Labs toggle is not a load-time default.
// Exactly one strict write per listed gate is allowed, and only inside the named setter.
const LABS_WRITERS = { PT_ENABLE_DEEP_DIVE: { fn: 'setLabsFlag', stmt: 'window.PT_ENABLE_DEEP_DIVE = (on === true);' } };
function labsWriterSpan(src, fn) {
  const body = extractFunctionSource(src, fn);
  if (!body || src.split('function ' + fn + '(').length - 1 !== 1) return null;
  const at = src.indexOf(body);
  return [at, at + body.length];
}
```

**New planted negatives** — appended before the existing `'unrelated gate default added'` entry. Each mutates an in-memory copy; anchor = the S1.1 setter line `    window.PT_ENABLE_DEEP_DIVE = (on === true);\n`:

| # | Negative | Rejected by |
|---|---|---|
| N1 | the strict Deep Dive write placed in `init()` after the D1 block (**automatic initialization**) | TX-5 |
| N2 | a **duplicate** Deep Dive writer in `setLabsFlag` | TX-5 |
| N3 | **non-strict** `= on;` | TX-5 |
| N4 | **non-strict** `= true;` | TX-5 |
| N5 | **computed-key** `window[flag] = (on === true);` in `setLabsFlag` | TX-2 (unchanged ban) |
| N6 | `globalThis.PT_ENABLE_DEEP_DIVE = (on === true);` | TX-5 |
| N7 | `Reflect.set(window, 'PT_ENABLE_DEEP_DIVE', on === true);` | TX-5 |
| N8 | another forbidden gate (`PT_ENABLE_FUND_FACTS_READ_CLIENT`) written inside `setLabsFlag` | TX-5 |

- TX-1…TX-4, TX-2's dynamic ban, the eight scan controls and **all 16 existing negatives are unchanged and must still bite**.
- The file-header TX-5 comment may gain one line naming LB-R1. Nothing else in the suite changes.
- **Reference prototype** (COWORK scratch, outside the repo; carries no approval): `reference/ts1-tx5-LB-R1.prototype.diff` (sha256 `b421d679…49aa363`) and `reference/index-labs-corrected.prototype.diff` (`37bd6c66…cb9ee`).
  - On the S1 checkpoint plus the corrected L1–L4: the refined suite **PASSes 61 / 61**, with every existing and new negative biting.
  - The unrefined suite fails exactly TX-5 (`default assignment for PT_ENABLE_DEEP_DIVE`).
  - The brief-L3 `window[flag]` tree fails TX-2 under the refined suite.
  - `deep_dive_v0` 74 / 74 and `asset_type` PASS on the corrected tree.

### S1.3 `qa/labs_panel_offline.js` (NEW; seed = the archived `surface-1` S2 suite, revised)

| ID | Assertion |
|---|---|
| LB-1 | `#labsBox` exists inside the api modal, after `api-info-box`, with exactly two switches (`labs-PT_ENABLE_DEEP_DIVE`, `labs-PT_ENABLE_PORTFOLIO_RESEARCH`); no Tech Score, Research Evidence or other gate switch |
| LB-2 | `PT_LABS_FLAGS` is exactly those two. `setLabsFlag` with any other name (e.g. `PT_ENABLE_TECH_SCORE`, `PT_ENABLE_RESEARCH_EVIDENCE_CLIENT`) changes nothing (the `else return` branch) |
| LB-3 | Strict booleans: `true` → `true`; `false`, `'true'`, `1`, `undefined` → `false` |
| LB-4 | No persistence: the L3 sources contain no `localStorage`, `sessionStorage`, `indexedDB` or `document.cookie`, and run in a sandbox without storage globals; `pt_enable_portfolio_research` still occurs exactly once in `index.html` |
| LB-5 | No network or jobs: the L3 sources reference no `fetch`, `XMLHttpRequest`, `_dd0RunCard`, `_dd0FetchAnalysis`, `_pfLiveBatch`, `_pfEodManualRefresh`, scan or scoring function; spies record zero calls |
| LB-6 | Deep Dive redraw: an active ticker with a result → `renderMainPanel` called once with that item; no active ticker → not called |
| LB-7 | Portfolio redraw: view active and no live run → `_renderPortfolioPanel` called once; `_pfLiveRunCanceller` set → not called; view inactive → not called |
| LB-8 | `renderMainPanel`, `_renderPortfolioPanel`, `_calcPortfolioAggregates`, `renderApiTable` and the `init()` read are unchanged: their pin-map entries equal the base's |
| LB-9 | `toggleApiStatus` calls `renderLabsToggles()` on open; `renderLabsToggles` reflects `window[flag] === true` only |
| **LB-10** | `index.html` has **no live `window[…] =`** (TX-2's own regex). There is exactly one live writer per Labs gate inside `setLabsFlag`; the only Portfolio-research writers elsewhere are the existing `init()` read and its `false` fallback |
| **LB-11** | Each Labs writer's right-hand side is exactly `(on === true)`. Values `false`, `'true'`, `1`, `undefined` yield `false` (LB-3) |

**Every row has a planted negative.** The seed's mutation anchors target the old L3 text and fail to apply on the corrected code (observed: 5 of them). They are rewritten to the S1.1 text. Negatives:
- a third switch;
- a storage write;
- a fetch in the setter;
- truthy instead of strict;
- a redraw during a live run;
- the `init()` read edited;
- a computed-key setter;
- a second Portfolio-research writer;
- `= on`.

### S1.4 Coupling and pin impacts

**Must pass unmodified** (re-grep `qa/` at the re-pin):
- `deep_dive_v0`;
- `qa/run-offline.js` (the Portfolio-research static rows 12 / 13 and `CLIENT_GATES`);
- `asset_type`, `ai_parse_repair`, `index_pins`;
- the map-based whole-file suites after `--update` (`no_synthetic_score`, `analyst_parser`, `high1y_label`, `ma_stack_label`, `ath_isolation`).

**Pin map:** `--diff <task base>` lists exactly `functions.toggleApiStatus`, `functions.renderLabsToggles` and `functions.setLabsFlag` (both added), `remainderSha256` and `fileSha256`.

### S1.5 STOP

- Any computed-key write.
- Any gate write outside `setLabsFlag` (beyond the existing `init()` lines).
- Any storage write, fetch, scan or job reachable from the setter.
- A switch for any other flag.
- **Any change to `qa/ts1_default_exposure_offline.js` beyond S1.2**, or any existing negative removed or weakened.
- Any edit to another existing suite.

## §S2 Slice 2 — Entry 30: ResearchView "Stale" through the shared labels

Carried over verbatim from `surface-1`'s S3 (requirements restated in full):
- **Change:** in `_renderPortfolioPanel` replace `resStEl.textContent = isStale ? 'Stale' : 'Research';` with `resStEl.textContent = isStale ? _dhLabel('state', 'stale') : 'Research';`.
  - `DH_DISPLAY.state['stale']` is `'Stale'`, so the rendered text is byte-identical.
  - `'Research'` stays a literal; the CSS class (`stale` / `found`) is unchanged.
- **Test:** `qa/dh_ui_vocabulary_offline.js` gains site row **U9**, the next id after U8, in the existing UV table:
  - the site's label comes from `_dhLabel('state', 'stale')`;
  - the before-literal `'Stale'` is absent at that site;
  - the control fixture follows the U7 pattern;
  - a render check confirms the visible text is still `Stale` / `Research`.
  - U1–U8 and their assertions are unchanged.
- **Coupling:** `dh_ui_vocabulary` U7 anchors the same function (unchanged); `eod_packet_v0` and `p5_step5_ui` are unaffected.
- **Pin map:** `--diff <C1>` lists exactly `functions._renderPortfolioPanel` and the file digest.
- **STOP:** any visible text change; any change to U1–U8.

## §C / §L / §X

- **Checkpoints:** `wip(surface-1b): slice k <name> — checkpoint` through r9, one per slice.
- **§L — close at the last passed slice** (pre-authorised, M-4). If S2 STOPs and the Owner chooses to close:
  1. **archive first:** exclusive copy of S2's uncommitted files, plus `git diff <S1 checkpoint>` and a sha256 inventory, into a new `pt-work-artifacts/surface-1b-s2/<UTC>/`;
  2. reset only S2's work to the S1 checkpoint, in the Worker's own tree (`git restore` / file delete; never `reset --hard`, `clean -f` or `stash`; any hook denial → STOP-6);
  3. regenerate and check the pin map;
  4. step-10 full `qa:offline` (expected = step 0 + 1);
  5. `review.md` records the unfinished slice; entry 30 stays open;
  6. final Codex check; step 13; integrity; LAND and push.

  No brief amendment.
- **§X closure:**
  1. Step 10 full `qa:offline` = step 0 + 1, PASS, on the heavy-lane go-ahead.
  2. Step 10a: entries 22 and 30 → status + `— **DONE**` + DONE / HISTORY lines, in entry-number order.
  3. `review.md`: LB-R1 verbatim, the TX-5 diff, the negatives table, the seed inventory, `## Backlog reconciliation`, LAND-EVIDENCE.
  4. Final Codex check. Codex must confirm: the TX-5 exception admits only the S1.1 statement inside `setLabsFlag`; N1–N8 bite; all 16 prior negatives unchanged.
  5. Step 13; integrity; R12 LAND / push / cleanup.
  6. COWORK post-push DEV checks (⚙ Labs: two switches, both off; Deep Dive on → card appears, no network until its button; Portfolio research on → existing rows only; reload → both off), each separately approved.

## §Y Land-scope, land-tests

<!-- land-scope:begin -->
index.html
qa/labs_panel_offline.js
qa/ts1_default_exposure_offline.js
qa/dh_ui_vocabulary_offline.js
qa/fixtures/index-pins.json
BACKLOG.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/labs_panel_offline.js
node qa/ts1_default_exposure_offline.js
node qa/dh_ui_vocabulary_offline.js
node qa/tools/index-pins.js --check
node qa/index_pins_offline.js
node qa/deep_dive_v0_offline.js
node qa/asset_type_offline.js
node qa/ai_parse_repair_offline.js
node qa/no_synthetic_score_offline.js
node qa/analyst_parser_offline.js
node qa/high1y_label_offline.js
node qa/ma_stack_label_offline.js
node qa/ath_isolation_offline.js
node qa/eod_packet_v0_offline.js
node qa/p5_step5_ui_offline.js
<!-- land-tests:end -->

**Effort:** small to medium. About 0.5–1 Worker day (the seed exists; the TX-5 refinement is prototyped), plus step 0 / step 10 (light once `qa-e1-digest-gate` has landed).
