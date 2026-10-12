# review.md — market-status-pill-1 (Worker B, Manual, attended)

## Result
S1 (characterisation suite) and S2 (implementation) both passed; closed at the last slice (§L / M-4).
Display only: no scoring, storage, network, prompt or `market-data.js` change; `_ts1*` and `TS1_POLICY_V1` byte-identical (MP-13 pins).

## Files changed
- Implementation (4): index.html, qa/market_pill_offline.js, qa/labs_panel_offline.js, qa/fixtures/index-pins.json
- Evidence (tracked): work/market-status-pill-1/brief.md, work/market-status-pill-1/review.md

## What changed
- `index.html`: new pure `_ptUsMarketPill(nowIso)` directly before `renderMainPanel`, reusing `TS1_POLICY_V1.calendar.US` via `_ts1ExchangeLocalParts` / `_ts1IsTradingSession` / `_ts1SessionCloseMinutes` (open = trading session and 570 <= min < close; Pre-market 04:00-09:30; After-hours close-20:00; null anywhere -> "Market status unavailable"). `renderMainPanel`: the `_now` / `_etHour` / `_isOpen` lines are replaced by one `_fbPill` (computed only when `_ms` is falsy; `.TA` -> unavailable; `typeof`-guarded helper reference), and `mktLabel` / `mktCls` read it. The Yahoo `marketState` branches, `_todayLbl`, `_showExt`, extended-price block and EG-18 lines are untouched (`index-pins --diff` shows only `functions._ptUsMarketPill` added, `functions.renderMainPanel` changed and the remainder comment lines).
- `qa/market_pill_offline.js`: new (46 assertions: MP-1..MP-13 + planted negatives MP-N1..N6).
- `qa/labs_panel_offline.js`: LB-8 `BASE_PINS.renderMainPanel` constant only (+ comment `market-status-pill-1`), as §C permits.
- `qa/fixtures/index-pins.json`: regenerated (`index-pins: OK (379 functions, 25 regions)`).
- Reading used: an unrecognised truthy `_ms` (e.g. `PREPRE`) no longer takes the heuristic label; `_fbPill` is null, so label = "Market closed", class `closed` (class was already `closed` before). No throw.

## MP table (S1 RED state -> S2 GREEN)
| ID | Result at S1 (index.html unchanged) | Result at S2 |
|---|---|---|
| MP-1 EDT 09:45 open | RED | GREEN |
| MP-2 09:29 -> Pre-market / closed | class GREEN, label RED | GREEN |
| MP-3 19:59Z open; 20:00Z After-hours | open + class GREEN, label RED | GREEN |
| MP-4 EST 09:00 not open | RED | GREEN |
| MP-5 14:30Z open; 15:30 open; 16:00 closed | 15:30 RED, others GREEN | GREEN |
| MP-6 Thanksgiving closed | RED | GREEN |
| MP-7 shortened session (1:00 PM close, After-hours) | RED | GREEN |
| MP-8 Saturday closed; 2028 unavailable | Saturday GREEN, 2028 RED | GREEN |
| MP-9 EST 08:45 not open; EDT 09:45 open | EST GREEN, EDT RED | GREEN |
| MP-10 `.TA` unavailable | RED | GREEN |
| MP-11 Yahoo states byte-identical | GREEN | GREEN |
| MP-12 helper absent -> unavailable | RED | GREEN |
| MP-13 purity / pins / no `-4` / typeof | RED (helper rows) | GREEN |
| MP-N1..N6 planted negatives | RED (target absent) | GREEN (each bites) |

## QA
- Step 0 (pre-edit baseline): `OFFLINE VALIDATION: PASS`, 83 suites, 1m18.691s (01:03:49 -> 01:05:08 +03:00).
- Step 10 (final tree): `OFFLINE VALIDATION: PASS`, 84 suites (= 83 + 1), 1m15.991s (01:10:51 -> 01:12:07 +03:00).
- Step 10 after the second Bootstrap resync (base `0a8bcc0`, tip `9b5cbb3`; the first post-resync run at base `de5b136` failed only in `qa/land_evidence_check_offline.js`, a suite from the base task, fixed upstream by `land-evidence-check-2`): `OFFLINE VALIDATION: PASS`, 85 suites (= 84 + the base's `land_evidence_check_offline.js`), 1m17.526s (01:50:23 -> 01:51:41 +03:00). This is the count in the LAND-EVIDENCE line.
- Land-tests (all 18 in the brief's land-tests block) PASS, counts identical to §F: eod_packet_v0 196, eod_preexport_warning 58, tech_snapshot_cache 324, ath_client 123, high1y_label 103, ma_stack_label 86, narrative_consistency 153, deep_dive_v0 74, pulse_analyst_view 108, scan_results_enrichment 67, vis_score_caliper 307, ts1_default_exposure 72, no_synthetic_score 160, index_pins 13, labs_panel 32 (LB-8 passes with the new constant), market_pill 46.

## §F comparison
Prototype (§F) predicted: only `labs_panel` LB-8 fails (expected constant) and all other listed suites PASS with the same assertion counts. Observed: identical counts for every suite listed in §F; after the one permitted constant edit LB-8 passes. Pin map: `index-pins: OK (379 functions, 25 regions)`, matching §F.

## Codex
- S1 diff review: PASS (raw in codex.md).
- Implementation diff review (step 8): one finding, below.

| # | Finding | Class | Disposition |
|---|---|---|---|
| 1 | MP-N4 (`_ts1SessionCloseMinutes` mutated to `960`) "does not bite" because at 18:00Z the mutated close is already past | I | **REJECT.** Wrong arithmetic: 2026-11-27 18:00Z is 13:00 EST = 780 min < 960, so the mutated helper returns open ("Market open - closes 4:00 PM ET"), not After-hours; the negative assertion (`!is(r,'closed','After-hours')`, no error) therefore holds only because the mutation changes the result, and the unmutated helper returns After-hours (MP-7). |

## Backlog reconciliation
- Brief's Backlog row: none (audit finding PA-07 / FA-11; the correction backlog records it).
- Action taken: none. No `BACKLOG.md` edit; the finished work's effect matches the row.

## Incident
R10-E hook denial (one read-only Bash call combining escaped-`\|` grep patterns) treated as STOP-6, not retried or rephrased. Owner ruling "R10-E Recovery" (one-time, task-specific): resume read-only inspection with the Grep/Read tools; STOP-6, permissions, hooks and governance unchanged. No other denial occurred. Details in qa.log.

## Lessons
- [local] An escaped-`\|` alternation inside a quoted Bash grep trips R10-E; use the Grep tool for pattern searches in this repo.
- [covered] `typeof`-guarded references to a new pure helper keep renderMainPanel suites' helper lists untouched — covered by brief CB3A-D3.

LAND-EVIDENCE: qa-offline=PASS 85; targeted=PASS; codex-classI-unresolved=0
