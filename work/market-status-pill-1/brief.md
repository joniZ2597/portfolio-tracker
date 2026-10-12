# Master Brief: market-status-pill-1 — market-status pill: DST, 09:30–10:00 and holidays (CB-3a; PA-07; DEADLINE 2026-11-01)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL, HELD** (COWORK, 2026-10-13). Batch **`2026-10-13-B2`, position 1** (multi-MASTER batch handoff).
- Pinned at `c72697756719a1c79f478cd0e4c468001f19fb18` (= `branch-dev` = `origin/branch-dev`, after NC-2 push + cleanup; A-3).
- §D ruled (A-1).
- It is placed only on the Owner's batch placement approval of this exact hash, then its own R11 record.
- **Task-start: immediately after the batch's last brief-only commit** (no predecessor).

| | |
|---|---|
| Evidence | Audit register PA-07 (V-CODE) and FA-11 (DEV: pill "closed" at 16:29 ET while Yahoo said After-hours). COWORK prototype §F (15 / 15) |
| Backlog | none (audit finding; the correction backlog records it) |
| Baseline | **`c72697756719a1c79f478cd0e4c468001f19fb18`** (the batch's brief-only commits sit on top of it and add only `work/*/brief.md`). **Valid only if** at the task-start tip: <br>• `qa/fixtures/index-pins.json` `fileSha256` = `995e7478…`; <br>• `functions.renderMainPanel` = `a248cfab…`; <br>• `functions._ts1ExchangeLocalParts` = `f38e324c…`, `functions._ts1RuleFor` = `dd62a58b…`, `functions._ts1IsTradingSession` = `e955dd6c…`, `functions._ts1SessionCloseMinutes` = `69da5334…`; <br>• `qa/labs_panel_offline.js` `BASE_PINS.renderMainPanel` = `a248cfab…`; <br>• every §A anchor matches exactly once; <br>• `qa/market_pill_offline.js` is absent. <br>Otherwise HOLD and re-pin |
| Branch / slot | `task/market-status-pill-1`, **Worker B** (`pt-wt-worker-b`, clean, detached at `c726977`); Worker A (clean, detached at `2c2b0d9`) is equally valid |
| Mode | **Manual**, attended. Display only; no scoring / storage / network |
| qa:offline | step-0 count **+1** (`qa/market_pill_offline.js`) |
| Parallel with | **not** with any `index.html` / pins task (B2 positions 2–4 are sequential behind it). It **may** run alongside the optional lane-B `land-evidence-check-1` (disjoint files). One heavy run at a time |
| **Deadline** | must be LANDed and pushed **before Sun 2026-11-01 02:00 ET** (US DST end). From then on the current heuristic shows "open" from 09:00 ET and "closed" from 15:00 ET |

## §0 Findings

| ID | Statement | Status | Evidence |
|---|---|---|---|
| F-1 | When no fresh Yahoo `marketState` exists, the pill uses `_etHour = (getUTCHours() - 4 + 24) % 24`: a fixed UTC−4 offset | **Confirmed (code)** | `index.html` :8467 |
| F-2 | `_isOpen = _etHour >= 9.5 && …` compares an **integer** hour with 9.5, so 09:30–09:59 ET reads "Market closed" | **Confirmed (code + prototype)** | :8468; §F F1 |
| F-3 | No holidays and no shortened sessions (e.g. Thanksgiving 2026-11-26 reads "open") | **Confirmed (prototype)** | §F F9–F11 |
| F-4 | The same US heuristic is applied to `.TA` tickers | **Confirmed (code)** | :8466–8474 (no symbol check) |
| F-5 | An authoritative calendar already exists: `TS1_POLICY_V1.calendar.US` (holidays 2025–2027, shortened sessions, `America/New_York`, sourced from nyse.com) with pure helpers `_ts1ExchangeLocalParts`, `_ts1IsTradingSession`, `_ts1SessionCloseMinutes`. They are already reused outside TS1 by the EOD packet (`eod_packet_v0`) and the pre-export warning | **Confirmed (code)** | :1498–1540, :1627–1683; `qa/eod_packet_v0_offline.js` :91, `qa/eod_preexport_warning_offline.js` :92 |
| I-1 | A fresh Yahoo `marketState` (REGULAR / PRE / POST / CLOSED) takes precedence over the fallback | **Intended, unchanged** | :8469–8474 |

## §D Rulings (Owner A-1, 2026-10-13: all four defaults approved; no open decision)

| ID | Question | Ruling (A-1) |
|---|---|---|
| CB3A-D1 | Should the fallback also show **Pre-market** (04:00–09:30 ET) and **After-hours** (close–20:00 ET) on trading days? This would match the Yahoo labels (fixes FA-11) | **Yes** (both labels already exist; class stays `closed`) |
| CB3A-D2 | `.TA` tickers with no fresh `marketState` | **"Market status unavailable"** (class `closed`). No US-hours claim for TASE. A TASE-hours fallback would need a verified TASE open time; it is a follow-up |
| CB3A-D3 | R-2 rule ("no new top-level function referenced by `renderMainPanel`", PC-3 deferred) | Allow **one `typeof`-guarded reference** to the new pure helper, as for the `typeof` patterns of `ptEffectiveAssetType` / TSR. Harness renders, where the helper is absent, fall back to "Market status unavailable". No suite helper-list edits |
| CB3A-D4 | Outside calendar coverage (after 2027-12-31) | **"Market status unavailable"** (fail-honest, as TS1's `null`) |

## §P Re-pin record (A-3; COWORK, 2026-10-13; read-only)

1. **Host state:** `branch-dev` = `origin/branch-dev` = `c726977`; both slots detached and clean (Owner-confirmed).
2. **Canonical checkout:** probe reports `CRLF_ONLY` (5 files, 0 after CR normalisation). **Bootstrap clears it first** (handoff step 0).
3. **At `c726977` (`git archive`):** every §A anchor matches exactly once; the Baseline pins above hold; `qa/market_pill_offline.js` is absent.
4. **NC-2's changes** touched only `_nlmConsistencyChecks`, so `renderMainPanel` is unchanged.

## §A Anchors (`c726977`; each exactly once)

| Anchor | Line |
|---|---|
| `var TS1_POLICY_V1 = {` | :1498 |
| `function _ts1ExchangeLocalParts(computedAtIso, timeZone) {` · `function _ts1IsTradingSession(dateStr, cal) {` · `function _ts1SessionCloseMinutes(dateStr, cal) {` (read only) | :1627 · :1655 · :1670 |
| `function renderMainPanel(` | :8248 |
| `  const _now     = new Date();` (removed; no other use in `renderMainPanel`) | :8466 |
| `  const _etHour  = (_now.getUTCHours() - 4 + 24) % 24; // rough ET offset` | :8467 |
| `  const _isOpen  = _etHour >= 9.5 && _etHour < 16 && _now.getUTCDay() >= 1 && _now.getUTCDay() <= 5;` | :8468 |
| `                 : (_isOpen ? 'Market open · closes 4:00 PM ET' : 'Market closed');` | :8473 |
| `  const mktCls   = _ms === 'REGULAR' ? 'open' : _ms ? 'closed' : (_isOpen ? 'open' : 'closed');` | :8474 |

## §C Hard constraints (must pass unmodified; any need to change → STOP)

| Source | Constraint |
|---|---|
| `qa/run-offline.js` (protected) Phase 12 | `TS1_POLICY_V1` and every `_ts1*` function stay **byte-identical**. Only new **callers** are added |
| `eod_packet_v0` / `eod_preexport_warning` | calendar consumers unchanged |
| `renderMainPanel` suites | `tech_snapshot_cache`, `ath_client`, `high1y_label`, `ma_stack_label`, `narrative_consistency`, `deep_dive_v0`, `ui_hygiene`, `pulse_analyst_view`, `scan_results_enrichment`, `vis_score_caliper`, `ts1_default_exposure`, `no_synthetic_score` pass **unmodified, with no helper-list edits** (CB3A-D3) |
| **Known, in-scope suite edit** | `qa/labs_panel_offline.js` LB-8 hard-codes the `renderMainPanel` digest of its own task base (`BASE_PINS.renderMainPanel = 'a248cfab…'`). **Any** `renderMainPanel` change fails it. **The only permitted edit:** replace that one constant with the new LF digest of `renderMainPanel` (same pin-map method), with a comment `market-status-pill-1`. All other LB rows stay unchanged. Any other `labs_panel` failure → STOP |
| I-1 | the Yahoo `marketState` branch, `_todayLbl`, `_showExt`, the extended-price block and the EG-18 scan-age qualification (:8475–8485) are byte-identical |
| Scope | no scoring, storage, network, prompt or `market-data.js` change. PA-S01 (server PRE / POST for `.TA`) is **out of scope** |

## §1 Slices

**S1 — characterisation suite.** New `qa/market_pill_offline.js` (pure Node; real `TS1_POLICY_V1` + the three `_ts1*` helpers + the new helper extracted from `index.html`; injected ISO instants):

| ID | Instant (UTC) → expected | At S1 |
|---|---|---|
| MP-1 | 2026-10-30 13:45Z (EDT 09:45) → open | RED (today closed) |
| MP-2 | 2026-10-30 13:29Z → Pre-market (D1) / closed | GREEN on class |
| MP-3 | 2026-10-30 19:59Z → open; 20:00Z → After-hours (D1) | GREEN on class |
| MP-4 | 2026-11-02 14:00Z (EST 09:00) → **not** open | RED (today open) |
| MP-5 | 2026-11-02 14:30Z → open; 20:30Z (EST 15:30) → open; 21:00Z → closed | RED (15:30 is closed today) |
| MP-6 | 2026-11-26 16:00Z (Thanksgiving) → Market closed | RED |
| MP-7 | 2026-11-27 17:59Z → open, label "closes 1:00 PM ET"; 18:00Z → After-hours | RED |
| MP-8 | Saturday → Market closed; 2028-01-03 → Market status unavailable (D4) | RED (D4) |
| MP-9 | 2027-03-09 13:45Z (EST 08:45) → not open; 2027-03-15 13:45Z (EDT 09:45) → open | RED |
| MP-10 | `.TA` ticker, no `marketState` → "Market status unavailable" (D2) | RED |
| MP-11 | Yahoo `marketState` present (each of REGULAR / PRE / POST / CLOSED) → today's labels, byte-identical (I-1) | GREEN |
| MP-12 | Harness without the helper (D3) → "Market status unavailable", no throw | RED |
| MP-13 | SETUP / static: the helper is pure (no `Date.now`, `new Date()` without an argument, storage, DOM, network); `_ts1*` and `TS1_POLICY_V1` byte-identical to the pin map; `getUTCHours() - 4` no longer present | RED |

**S2 — implementation.**
1. **New pure helper** `_ptUsMarketPill(nowIso)`, placed directly before `renderMainPanel`:
   - It returns `{ cls, label }`. Logic as prototyped in §F: local parts via `_ts1ExchangeLocalParts(nowIso, cal.timeZone)`; session via `_ts1IsTradingSession`; close via `_ts1SessionCloseMinutes`.
   - **Open** = trading session and `570 ≤ minutes < close`. The label shows the close time from the calendar (`closes 4:00 PM ET` / `closes 1:00 PM ET`).
   - **Pre / After** per D1.
   - `null` anywhere → "Market status unavailable".
2. **In `renderMainPanel`:**
   - replace :8466–8468 (`_now`, `_etHour`, `_isOpen`) with one fallback object `_fbPill`, computed only when `_ms` is falsy:
     - `.TA` → unavailable (D2);
     - otherwise `typeof _ptUsMarketPill === 'function' ? _ptUsMarketPill(new Date().toISOString()) : { cls: 'closed', label: 'Market status unavailable' }`.
   - `mktLabel` / `mktCls` use it in place of `_isOpen`.
   - Nothing else changes.

MP-1…MP-13 turn GREEN.

**§2 Continuation:** S1 → S2 when:
- the S1 rows are as listed;
- §C holds;
- `index-pins --diff <base>` lists only `functions.renderMainPanel`, `functions._ptUsMarketPill` (added) and the file digest;
- Codex has no unresolved Class I.

**Program STOP:**
- any §C test would need editing;
- any `_ts1*` / policy change;
- a scoring / storage / network / prompt change;
- any live / DEV / Netlify action by the Worker;
- a second heavy run.

## §F Feasibility (COWORK scratch prototypes, outside the repo; reference only)

**Re-run at `c726977`** (scratch `git archive` copy; the working tree converted to CRLF as in the Windows slots):
- S2 applied; `index-pins --update` → `index-pins: OK (379 functions, 25 regions)`; `index_pins` PASS.
- PASS: `eod_packet_v0` (196), `eod_preexport_warning` (58), `tech_snapshot_cache` (324), `ath_client` (123), `high1y_label` (103), `ma_stack_label` (86), `narrative_consistency` (153), `deep_dive_v0` (74), `ui_hygiene`, `pulse_analyst_view` (108), `scan_results_enrichment` (67), `vis_score_caliper` (307), `ts1_default_exposure` (72), `no_synthetic_score` (160).
- **Only** `labs_panel` LB-8 fails (the expected constant, §C).
- Helper fixtures: **15 / 15**.
- Note: `eod_packet_v0` needs the CRLF checkout (its anchors carry `\r\n`); on an LF copy it fails before and after the change alike. Not caused by this task.

**Original sweep at `2c2b0d9`:**

- **Setup:** the real `TS1_POLICY_V1` + `_ts1ExchangeLocalParts` / `_ts1RuleFor` / `_ts1IsTradingSession` / `_ts1SessionCloseMinutes` extracted from `index.html`, plus the proposed helper.
- **Result: 15 / 15** fixtures as expected (MP-1…MP-9 instants).
- **Whole-change prototype.** I applied the S2 helper and the `renderMainPanel` fallback to a scratch copy of the repo at `2c2b0d9`, then ran `index-pins --update`.
  - 15 of 16 related suites PASS: `tech_snapshot_cache`, `ath_client`, `high1y_label`, `ma_stack_label`, `narrative_consistency`, `deep_dive_v0`, `ui_hygiene`, `pulse_analyst_view`, `scan_results_enrichment`, `vis_score_caliper`, `ts1_default_exposure`, `no_synthetic_score`, `eod_packet_v0`, `eod_preexport_warning`, `index_pins`.
  - The only failure is `labs_panel` LB-8 (the hard-coded digest; see §C).
  - `_now` has no other use in `renderMainPanel`.
  - Helper outputs: EDT 09:45 open · EST 09:00 Pre-market · EST 15:30 open · Thanksgiving closed · 27 Nov 12:59 "closes 1:00 PM ET" · 13:00 After-hours · 2028 unavailable.
- **Today's heuristic is wrong** at:
  - EDT 09:45 (closed);
  - EST 09:00 (open);
  - EST 15:30 (closed);
  - Thanksgiving (open);
  - 13:00 on 27 Nov (open);
  - 2028 (open).

## §3 Codex review

**Steps 8 / 12, on the real diff.** Codex confirms:
- the calendar is reused, not copied;
- I-1 is untouched;
- the helper is pure and uses an injected clock;
- the `typeof` guard is in place;
- no `_ts1*` change;
- each planted negative bites.

**Planted negatives:**
- a fixed `-4` offset → MP-4 / MP-5 fail;
- an integer-hour compare → MP-1 fails;
- the holiday check dropped → MP-6 fails;
- the shortened session ignored → MP-7 fails;
- US hours applied to `.TA` → MP-10 fails;
- an unguarded reference → MP-12 fails.

## §ET (ET-1; non-blocking)

**Estimate:**
- 10 min setup;
- S1 about 12 min;
- S2 about 8 min;
- 15 min closure.

**About 45 min** plus Owner gates.

## §CMD Command card (one command per Bash call; Bash only; absolute canonical root)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
node qa/guard_integrity_check.js --task task/market-status-pill-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/market_pill_offline.js
node qa/eod_packet_v0_offline.js
node qa/tech_snapshot_cache_offline.js
node qa/tools/index-pins.js --diff <base>
node qa/tools/index-pins.js --update
node qa/tools/index-pins.js --check
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/market-status-pill-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/market-status-pill-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (expected prompts):** `git add <explicit paths>`.
- **C (Owner gates):** R11, R12 LAND, R12 PUSH.
- **Never:** `curl`, `WebFetch`, `netlify`, PowerShell.
- **L9 readiness:** before the step-13 commit and again before `land-request`, run the Grep-tool checks E1 = 1, E2 = 1, E3 = 0 on `work/market-status-pill-1/review.md` (card r3 block).

## §X Closure

1. Step 10 full `qa:offline` (= step 0 + 1) PASS.
2. `review.md`:
   - the MP table;
   - the §F comparison;
   - `## Backlog reconciliation` (none);
   - **LAND-EVIDENCE line (L9)**: `review.md` contains **exactly one** line, on its own, starting at column 1, with no bullet, backticks, bold or trailing spaces: `LAND-EVIDENCE: qa-offline=PASS <N>; targeted=PASS; codex-classI-unresolved=0`.
     - `<N>` = the step-10 suite count.
     - Write it only when step 10, every land-test and Codex (no unresolved class I) passed.
     - Commit it in the same commit as the final implementation. It is the only occurrence of `LAND-EVIDENCE:` in `review.md`.
     - The integrity-check output is **not** written into `review.md`; it goes only in the step-13 STOP report.
     - **After an L9 refusal: STOP-6.** No recovery commit without an explicit, incident-specific Owner ruling.
3. Final Codex check.
4. Step 13; integrity; R12 LAND / push / cleanup.
5. COWORK post-push DEV check: read-only, separately approved. Read the pill text and class for a US ticker and a `.TA` ticker, with the current ET time recorded.

## §PEP / §UER

- **§PEP:** expected prompts are the `git add` staging and the two R12 verbs.
- **§UER:** **ATTENDED-ONLY**.

## §Y Files, land-scope, land-tests

```
index.html                       _ptUsMarketPill (NEW, pure) · renderMainPanel (fallback lines only)
qa/market_pill_offline.js        NEW (MP-1…MP-13 + planted negatives)
qa/labs_panel_offline.js         LB-8 BASE_PINS.renderMainPanel constant only (§C)
qa/fixtures/index-pins.json      regenerated
```

<!-- land-scope:begin -->
index.html
qa/market_pill_offline.js
qa/labs_panel_offline.js
qa/fixtures/index-pins.json
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/market_pill_offline.js
node qa/tools/index-pins.js --check
node qa/index_pins_offline.js
node qa/eod_packet_v0_offline.js
node qa/eod_preexport_warning_offline.js
node qa/tech_snapshot_cache_offline.js
node qa/ath_client_offline.js
node qa/high1y_label_offline.js
node qa/ma_stack_label_offline.js
node qa/narrative_consistency_offline.js
node qa/deep_dive_v0_offline.js
node qa/ui_hygiene_offline.js
node qa/labs_panel_offline.js
node qa/pulse_analyst_view_offline.js
node qa/scan_results_enrichment_offline.js
node qa/vis_score_caliper_offline.js
node qa/ts1_default_exposure_offline.js
node qa/no_synthetic_score_offline.js
<!-- land-tests:end -->

**Skills:** `pt-offline-suite` Required. `/plan` mandatory.

**§L:** close at the last passed slice (M-4).
