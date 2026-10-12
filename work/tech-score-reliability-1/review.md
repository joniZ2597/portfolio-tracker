# review.md — tech-score-reliability-1 (Master, 3 slices, Worker A, Manual)

Brief: `work/tech-score-reliability-1/brief.md` (blob sha256 `75d5cf6a…`, commit `2f3939c`). Task base `411298d` (brief baseline `f6493ce`). Checkpoints: S1 `f222bde`, S2 `ae64ad7`, S3 `f5900d5`.

## Summary

- S2: `_ts1FetchRawSeries` gained an in-flight dedupe per symbol and a memory-only 15-minute cache that admits only non-error, non-empty `provider === 'polygon'` series (V-1, V-3, TSR-2). The fetch / parse / provenance body is byte-unchanged (it runs inside an inner async function started in a microtask); `adjustedBasis` stays `provider === 'polygon' ? 'explicit' : 'unknown'` (TSR-1 / I-1 preserved).
- S3: `_ts1FillRow` stamps each memo promise with the ticker's scan `_runId` (read from `_cockpitResults` through a `typeof` guard, never written) and, for a degraded result (`status === 'UNAVAILABLE'` or a `TS1_FAILCLOSED_INTEGRITY_CODES` reason, the latter through a `typeof` guard), a 120 s expiry. A different `_runId` or an expired stamp drops the entry and the engine runs again (V-4). A fill superseded by a newer one does not overwrite the newer cell. `_ts1RowText` and every UI string are untouched; memo keys stay plain symbols; stamps are properties `rowRunId` / `rowExpiresAt` on the promise.
- S1: new suite `qa/ts1_reliability_offline.js` (TR-1…TR-12, TR-5b, planted negatives, offline spy, event-loop-drain guard).

## Files changed
- Implementation (3): index.html, qa/ts1_reliability_offline.js, qa/fixtures/index-pins.json
- Evidence (tracked): work/tech-score-reliability-1/brief.md, work/tech-score-reliability-1/review.md

## Reading used: TR-3 clarification

The brief's TR-3 wording is "holding Polygon + SPY / QQQ Yahoo → RS components missing, coverage 70 %, integrity code present (the FROG 84.29 / 70 % shape)". With a sector ETF mapped and served by Polygon, SPY + QQQ on Yahoo yields coverage **77.5 %** (rs = 7.5 of 30 points), measured in the suite's scratch run. Coverage **70 %** arises when every RS benchmark is Yahoo, i.e. SPY, QQQ and the mapped sector ETF — which is what the evidence shows (page-load console `[history] yahoo: 251 candles for FROG/SPY/IGV/QQQ`). TR-3 therefore sets SPY, QQQ and the sector ETF (XLK) to Yahoo and asserts 70 % plus `SERIES_PROVENANCE_UNESTABLISHED`. This is a wording-vs-measurement reading under STOP-2's "wording mis-measures a condition the implementation plainly meets": the intent (a Yahoo benchmark keeps failing closed and costs RS points) is fully asserted. Codex was told of the reading and agreed (S1 review).

## QA

| Run | Result |
|---|---|
| Step 0 baseline (tree `411298d`) | PASS 82 suites, 0 FAIL, 1 advisory WARN (smart quote), 2026-10-12T20:11:28Z → 20:12:52Z (~84 s) |
| S1 RED (suite only) | TR-4, 5, 6, 7, 8, 11, 12 RED; TR-1, 2, 3, 5b, 9, 10 GREEN — exactly the brief's expectation |
| S2 targeted | TR-4, 5, 6, 12 GREEN |
| S3 targeted | `node qa/ts1_reliability_offline.js` PASS (50 asserts: 12 TR rows + TR-5b, 12 negative groups with unique-anchor, positive-control and bite checks, offline-spy check) |
| Step 10 full `npm run qa:offline` (tree `f5900d5`) | PASS 83 suites (= 82 + `ts1_reliability_offline.js`), 0 FAIL, same advisory WARN (line moved 10922 → 10964), 2026-10-12T20:33:01Z → 20:34:48Z (~107 s) |
| Coupled / land-tests after the final re-pin | `ts1_default_exposure` 72, `tech_snapshot_cache` 324, `eod_packet_v0` 196, `index_pins` 13, `high1y_label` 103, `ma_stack_label` 86, `no_synthetic_score` 160, `narrative_consistency` 105, `ath_isolation` 23, `deep_dive_v0` 74, `ui_hygiene` PASS; `index-pins --check` OK (378 functions, 25 regions) |

## RED → GREEN record (new assertions)

| Row | S1 | After S2 | After S3 |
|---|---|---|---|
| TR-1, TR-2, TR-3, TR-5b, TR-9, TR-10 | GREEN | GREEN | GREEN |
| TR-4, TR-5, TR-6, TR-12 | RED | GREEN | GREEN |
| TR-7, TR-8, TR-11 | RED | RED | GREEN |

## Re-pin ledger (pins the brief names)

`node qa/tools/index-pins.js --update` after each slice; the generated map changed only in the slice's entries.

| Pin | S2 | S3 |
|---|---|---|
| `functions._ts1FetchRawSeries` | `001ab301…` → new value (diff lists it) | unchanged |
| `regions.ts1_region` | changed (cache var + function) | unchanged |
| `functions._ts1FillRow` | unchanged | `306a720e…` → new value (diff lists it) |
| file digest | regenerated | regenerated |
| `functions.runTechScoreV1`, `functions._ts1RowText`, `functions._ts1ResolveMarket` | unchanged (`cbb5b8ae…`, `d81334a8…`, resolve-market unchanged) | unchanged |

`index-pins --diff` base-relative output at each slice listed only the slice's entries (S2: `functions._ts1FetchRawSeries` + `regions.ts1_region`; S3: `functions._ts1FillRow`). Revert proof: the S2 / S3 edits are pure insertions around unchanged lines (the `--diff` hunks show only `+` lines apart from the one replaced `_ts1FillRow` line), so reverting the listed lines restores the old bytes.

New suite pins (literal, in `qa/ts1_reliability_offline.js` TR-10, refreshed by `--print-pins`, not by `--update`): `_ts1ResolveMarket` sha256 `88daede9…`, `_ts1RowText` sha256 `d81334a8…` (equals the index-pin value), and the SCORE-V1 region top-level function count 24 (R-2).

## Planted negatives (all bite for the asserted reason; each has a unique anchor and a positive control)

TR-2 Yahoo treated as explicit · TR-10 third `runTechScoreV1(` · TR-10 `_ts1ResolveMarket` byte change · TR-6 Yahoo / non-error cached · TR-6 empty Polygon series cached · TR-5 dedupe removed · TR-5 request started before the in-flight entry is published · TR-12 TTL ignored · TR-11 scores cached instead of raw series · TR-8 `_runId` ignored · TR-7 degraded result kept forever · TR-8 superseded fill overwrites the newer cell.

## Codex ledger (raw responses in `codex.md`, untracked)

| # | Round | Finding | Class | Disposition |
|---|---|---|---|---|
| 1 | S1 review | TR-11 does not prove the builder runs again | I | FIX — added fresh snapshot / result object identity and `freshness.snapshotAsOf` checks |
| 2 | S1 review | Only one negative present | I | DEFER to S2 / S3 — the other negatives mutate S2 / S3 code whose anchors do not exist at S1; all added with their slices (list above) |
| 3 | S2 review | Empty Polygon series cached (V-1) | I | FIX — admission requires `out.bars.length > 0`; TR-6 `polygon-empty` case + negative |
| 4 | S2 review | In-flight re-entrancy window (`pending` null while the body starts) | I | FIX — body started via `Promise.resolve().then(...)` after `entry.pending` is set; TR-5 re-entrancy case + negative |
| 5 | S2 scoped re-pass | none | — | PASS |
| 6 | S3 review | Superseded fill that rejects skips the em-dash write | I | REJECT — by design the newer fill owns the cell; writing the dash from a stale rejected fill would overwrite a valid newer result. A lone rejected fill (the T6 flow) still renders the dash; pinned by a TR-9 assertion added in response |

## Backlog reconciliation

- Brief's Backlog row: none (findings P-3 / P-4 are not BACKLOG entries).
- Action taken: none. `BACKLOG.md` is not in scope and was not edited.
- Entries affected: none.
- The absence of any BACKLOG edit matches the diff, the QA results and the work being landed.

## Definition of Done

- [x] TR-1…TR-12 GREEN; every planted negative bites (S3 targeted run, 50 asserts; Step 10).
- [x] Row text unchanged: `_ts1RowText` byte-identical (pin `d81334a8…`).
- [x] `_ts1FetchRawSeries` result shape unchanged; provenance lines byte-identical to base.
- [x] Protected T6 / Phase 12, TX-3, RD-F2 and TC-13 pass unmodified; only pin-map entries moved via `--update`.
- [x] Step 10 PASS, 83 suites.
- [x] Files: index.html, qa/ts1_reliability_offline.js, qa/fixtures/index-pins.json.

## Fresh-context self-review (step 7)

Re-read the brief and the complete diff against the requirement → test map: no change required. Checked specifically: provenance lines unchanged, cache admission, shared-object non-mutation (`_ts1NormalizeCandles` builds new candle objects; TR-5b asserts it), `typeof` guards for `_cockpitResults` / `TS1_FAILCLOSED_INTEGRITY_CODES`, one `runTechScoreV1(` in `_ts1FillRow`, no storage or network token in the row helpers.

## Timing

- Task start (record): 2026-10-12T20:07:17Z.
- Step 0: 20:11:28Z → 20:12:52Z (PASS 82).
- S1 checkpoint 20:22:10Z (`f222bde`); S2 20:26:54Z (`ae64ad7`); S3 20:30:41Z (`f5900d5`).
- Step 10: 20:33:01Z → 20:34:48Z (PASS 83).
- Codex rounds: S1 ×1, S2 ×1 + scoped re-pass ×1, S3 ×1; final check ×1 (see "Final check").

## Final check

Final check: 1 rounds, 2 class-II findings fixed, self-checked; no implementation change, no QA re-run.

Class-II detail: (1) the summary line above was not yet written when Codex read this file — added; (2) `review.md` is untracked until the step-13 commit tracks it together with the implementation — the two-row "Files changed" shape is prescribed and unchanged. Self-check: every `work/tech-score-reliability-1/` path named exists and is one of the five canonical files (brief.md, review.md, codex.md; plan.md and qa.log exist); the counts 82 and 83 match qa.log; no section reads "Pending" or "TBD". Class I findings: none.

## Lessons

- [rule] An async offline suite must never read a drained event loop as a pass. Destination-ready text for `.claude/rules/qa-suites.md`: "An async suite installs a `process.on('exit')` guard that prints an ERROR and sets a non-zero exit code unless the suite marked itself complete; any await on a promise a mutated production copy can leave unsettled is bounded by a race with a short timer." (Node exits 0 when a promise never settles; found when a planted negative deadlocked TR-8.)
- [rule] A mutated-source negative needs a positive control on the unmutated source, otherwise a row that is already RED makes its negative bite vacuously. Destination-ready text for `.claude/rules/qa-suites.md`: "Each planted negative asserts that the unmutated source passes the same row, in addition to the mutated copy failing for the asserted reason (no crash)."
- [local] TR-3's 70 % figure needs every RS benchmark on Yahoo; with a Polygon sector ETF the engine reports 77.5 % (see the clarification above).
- [local] The Edit tool kept `index.html` fully CRLF across seven edits here; a node byte count before and after each edit confirmed it.
- [backlog] Findings P-3 / P-4 of the 2026-10-12 DEV smoke report are not BACKLOG entries yet — pending routing.
- [backlog] Server-side Polygon resilience in `market-data.js` (TSR-3) and the unverified cause of intermittent Polygon failures (F-4) belong in BACKLOG — pending routing.
