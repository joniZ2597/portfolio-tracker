# review.md — market-data-daily-change-1 (V-1)

Brief: `work/market-data-daily-change-1/brief.md` (committed blob sha256 `22c8e23247365c2a8e0c6774c1bd59fe3196160ee6223eb116255adae7086555`). Branch `task/market-data-daily-change-1`, base `a194ebf`, Worker A, Manual mode, C+ workflow.

## Result

`fetchYahoo` now takes its daily change and previous close from `_dailySessionChange`: the price session S is the exchange-local date of `regularMarketTime`, the previous session S-1 comes from the governed calendar (candle basis outside US/TASE coverage, labelled `dailyBasis: 'candles'`), and the previous close is the last valid close of the S-1 candle. An unknown S-1 close gives `change_percent: null` and `previous_close: null` with one warning naming the symbol and both sessions; `isValidStockData` then routes to the existing Alpha Vantage fallback or "no market data". The result carries `sessionDate`, `prevSessionDate`, `dailyBasis`. The four observed mismatches are reproduced and corrected end to end (PLTR −7.22, FOXF −13.30, AA +2.55, CRWV −11.91). No scoring code changed.

## Files changed
- Implementation (5): index.html, qa/fixtures/index-pins.json, qa/tase_units_offline.js, qa/ai_request_hygiene_offline.js, qa/market_daily_change_offline.js
- Evidence (tracked): work/market-data-daily-change-1/brief.md, work/market-data-daily-change-1/review.md

## Appendix deltas

The A1 / A3 edits are the appendix text applied by script, each OLD exactly once, with the file's own EOL kept. The A2 suite was extracted verbatim and **its rows DC-1…DC-12 and DC-N1…DC-N8 are unchanged** (a verbatim run of it on the final source: PASS 12 rows, 8 negatives). The deltas below are additions to the new suite `qa/market_daily_change_offline.js` only, under the §C+ amendment clause and §W; nothing in §2, §A1, land-scope, land-tests, the protected digests or the pin set was touched.

| # | Delta | Why |
|---|---|---|
| Δ1 | helper `build3(src)`: the real functions plus `fetchStockData`, stubbed `fetchYahooChart` and `fetchAlphaVantage`, `var _stockDataInflight = {}` | W3 drives `fetchStockData` |
| Δ2 | row **W1**: US candles at 13:30 / 14:30 UTC and TASE at 06:30 / 07:30 UTC give the calendar result; UTC-midnight candles documented out of contract (the A1 result asserted: a finalised Friday candle is read as Thursday's, change 0 against the wrong session with no null; an unfinalised one gives null) | W1, risk R-5 |
| Δ3 | row **W2**: six duplicate-candle shapes resolved by the last valid close **in array order** (including array order against time order), all-null → unknown; reversed and 20 seeded permutations of distinct-date candles equal the sorted result | W2 |
| Δ4 | row **W3**: unknown Yahoo change → Alpha Vantage called once and its valid result accepted untouched; AV throws / returns null / `null` change / text change → `null`; known Yahoo result → AV not called; no price time stamp (`fetchYahoo` rejects, unchanged) → the same fallback | W3, D-27c |
| Δ5 | row **W4**: zone boundaries (US 19:59:59 / 23:59:59 EDT, 00:00 Saturday, 23:59:59 EST Sunday / 00:00 Monday after DST end; TASE 23:59:59 / 00:00 IDT); calendar-specific skips (a candle on Labor Day, a candle on a Sunday); Thursday close `0`, `-1`, `NaN`, `'200.5'` → null with sessions and basis reported; price stamped on a Sunday and on Labor Day → unknown; the three new fields and the **exact warning text** on the close-missing, Saturday and no-time paths and no warning on the known path; the absent-candle + `chartPreviousClose` case → null / null (neither `0` nor the range-start close); the corrected change crosses the −5 guard threshold parsed from `orchestrate`'s own source where the old value did not (PLTR −7.22 vs old −0.23; CRWV −11.91 vs old +5.94 which had crossed the +5 guard) | W4, D-27b |
| Δ6 | row **W5**: no-calendar zone with a missing candle between S and the latest earlier candle → the older candle's change, `dailyBasis: 'candles'` (and the no-gap control); 2028 gap; Saturday 2028 and MLK Monday 2028 stamps accepted on the candle basis; the same Saturday inside coverage → unknown; no earlier candle → unknown | W5, S-1c, R-6 |
| Δ7 | negatives **W-N1…W-N8** (mutations of `index.html` source): W-N1 duplicates by time stamp · W-N2 UTC date for candles · W-N3 fixed UTC−5 for US · W-N4 calendar ignored · W-N5 `chartPreviousClose` fallback restored in `fetchYahoo` · W-N6 default +0 restored · W-N7 candle basis labelled `calendar` · W-N8 warning without sessions | W4 (each old branch of DC-N1), W2, W1, W5 |
| Δ8 | header comment lists the deltas | documentation |

**RED / GREEN and "fails on the appendix as given"** (scratchpad script outside the repo; each W-N mutation applied to the final `index.html`, then the **original A2 suite** and the **amended suite** run on it; full table in `qa.log`):
- W-N1 and W-N3 are **not caught by any original A2 row** (all DC rows pass; only the original's own negatives lose their anchors); the amended suite fails W2 and W4 respectively. These are the planted negatives that fail on the appendix as given.
- W-N2, W-N4…W-N8 are also caught by the original rows (DC-5, DC-1/5/7/8/10, DC-10, DC-10, DC-5/8, DC-10); the amended suite fails the named W rows in addition.
- Control: the unmutated source passes both (original exit 0, amended exit 0). The amended suite on the final source: PASS 17 rows, 16 negatives.
- RED for the base: the A2 suite on the unmodified source fails to load the helper (`_dailySessionChange does not extract exactly once`), as the brief states.

**Judgement recorded:** a first draft of W3 expected a `NaN` Alpha Vantage change to be rejected; the unchanged `isValidStockData` accepts it (`typeof NaN === 'number'`). That was my wrong expectation, not a defect in V-1, so the case was replaced by a text-change case. This is **not** a weakened test and not an S change. Observation for Main Control (outside V-1, not changed): an Alpha Vantage result with a `NaN` change passes the validity gate.

## QA
- Step 0 baseline (before any edit): `npm run qa:offline` PASS, 100 suites. The GO message said 101; 100 is the measured count at this tip and equals the brief's "100 → 101" (the new suite).
- A2 verbatim on the final source: PASS 12 rows, 8 negatives. Amended suite: PASS 17 rows, 16 negatives.
- `tase_units` PASS (9); `ai_request_hygiene` PASS (11 rows, 15 negatives); `no_synthetic_score` PASS (160); `high1y_label` PASS (103); `pulse_analyst_view` PASS (108); `eod_packet_v0` PASS (200); `index-pins --check` OK (381 functions, 25 regions); `index_pins_offline` PASS (13).
- Pin map: `index-pins --update` changed exactly four values — `fileSha256`, `remainderSha256`, `functions.fetchYahoo` (`da826004…99d1`, equals the §A3 digest) and the added `functions._dailySessionChange`.
- Step 10: `npm run qa:offline` PASS, 101 suites (step 0 + 1), 1 advisory warning (as at baseline).
- DC-12: 18 protected functions byte-identical to the base digests (`orchestrate`, `enforceScoreConsistency`, `analyzeChunk`, `isValidStockData`, `fetchStockData`, `fetchAlphaVantage`, `formatStockContext`, `_pfLiveNormalize`, the `_ts1*` helpers …).
- EOL: in this checkout `index.html` is CRLF in the working tree (autocrlf) and was edited with its EOL kept (edit script checked uniform CRLF); the three other code files are LF. Committed blobs are normalised by Git; the pin map is computed over the normalised text.

LAND-EVIDENCE: qa-offline=PASS 101; targeted=PASS; codex-classI-unresolved=0

## Fresh-context self-review
Re-read the brief and the full diff against the requirement→test map (`plan.md`). The three `index.html` hunks equal §A1; the two suite hunks equal §A3; the suite differs from §A2 only by the listed deltas. Nothing outside the §1 files. Result of the review: the `NaN` Alpha Vantage expectation was corrected (above); nothing else changed.

## Codex
- Step 8 (diff review, raw in `codex.md`): PASS, no findings. Codex verified the three `index.html` hunks against A1, the one-line A3 changes, the four pin values, the unchanged protected functions, that the W1–W5 expected values follow from §2 and do not weaken or contradict A2 or §2, and that each W-N negative mutates production source and fails its named rows (the independent verification of the changed hunks that §C+ requires).
- Final check (step 12, raw in `codex.md` under `## Final check`): one Class II finding — this very line pointed to a result that was not yet written; fixed here. Scope, `index.html` edits, the listed deltas, QA claims and the backlog section were confirmed otherwise.

Final check: 1 round, 1 class-II finding fixed, self-checked; no implementation change, no QA re-run.

## FIX / DEFER / REJECT ledger
No findings in either round. Nothing to classify.

## Backlog reconciliation
Brief Backlog row: none. Action taken: none. No `BACKLOG.md` edit; no entry affected. The diff, QA results and landed work contain no backlog effect. Follow-ups named by the brief (not backlog edits here): V-1b (`_pfLiveNormalize`) and V-2 (display of the session labels).

## Risks / not tested
As in the brief §6 (R-1…R-6): more Alpha Vantage fallbacks, calendar ends 2027-12-31, scores move where the true change crosses ±5 % (D-27b), the new fields have no reader yet, a provider re-stamping daily candles (pinned by W1, out of contract), candle-basis gaps (W5). The execution of `orchestrate` itself with the corrected value is not run in the suite: W4 asserts the value flow into its guard threshold and DC-12 pins the function byte-identical; the guard's behaviour is covered by review only. No live call was made; the after-close DEV scan is a separate Owner approval.
