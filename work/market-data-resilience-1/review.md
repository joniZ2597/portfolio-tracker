# review.md — market-data-resilience-1 (Polygon 429 retry + typed fallback reason)

Base `3e0a02b` (branch-dev tip at the brief commit; baseline blobs verified against the brief). Mode: Manual.

## What changed (brief §1 files only)
- `netlify/functions/market-data.js` — historical scan branch only:
  - `fetchPolygonWithRetry`: one retry on an HTTP 429 observed within 2000 ms of the request being issued, after `min(Retry-After × 1000, 1500)` ms (1000 ms when absent or invalid), with a 3000 ms timeout; never more than two Polygon requests.
  - `classifyPolygonFailure`: `http-429 | http-<status> | auth | error | empty | timeout | network`, from structured fields only (HTTP status, the response body's `status` field kept on the thrown error as `bodyStatus`, abort error name).
  - the class is appended to the existing fallback `console.warn` line and set as `X-PT-Polygon-Fallback` on the Yahoo-fallback response (200 / 404 / 502) through an optional third argument of `res()`; every other response is byte-identical.
  - test hooks `event._testSleep(ms)` and `event._testClock.nowMs` (same guarded pattern as `takeLiveBudget`).
  - the daily branch, `purpose=portfolio-live`, the budget, envelopes, `fetchYahoo`, `polygonToYahooShape` and the four §2 text anchors are unchanged.
- `qa/market_data_resilience_offline.js` (new): MR-1…MR-8, MR-N1…MR-N5.
- `qa/ath_isolation_offline.js`: the one `BASELINE_PINS` value for `netlify/functions/market-data.js`.

## RED evidence (S1, against the unmodified handler)
`node qa/market_data_resilience_offline.js` → FAIL 12/13: MR-1 (saw 1 Polygon call, expected 2), MR-2 (1 call), MR-3 (header undefined), MR-4 (header undefined, expected `auth`), MR-5 (waited `[]`, expected `[1000]`), MR-6 (header undefined), MR-8 (1 call), MR-N1/N2/N3/N5 (positive control on the real source fails), MR-N4 (anchor absent before the change). MR-7 passed (unchanged paths hold before and after).

## GREEN
- `market_data_resilience_offline` 13/13; every planted negative bites with the real handler passing the same scenario first.
- Unchanged-file suites: `market_data_live_offline` 30/30, `fund_facts_route_offline` 14/14, `market_structure_offline` 39/39.

## Re-pin (brief §4) — AR-7i in `qa/ath_isolation_offline.js`
| | value |
|---|---|
| old LF sha256 | `955e7396536f4ea567a390b678be3db67a6978975e97c7b9f8782711768a0f17` |
| new LF sha256 | `df1a9edbc4cdf2f978b01ac83616391253699de90e9fc23e3de74ecda8e63ea1` |
RED first: after the handler edit AR-7i failed exactly on `netlify/functions/market-data.js` and nothing else; after the one-value re-pin the suite is ALL PASS 23/23. (An intermediate value `eb371838…` was used before the Codex fix and superseded.) No other row, PN row or pin changed.

## Codex
- Round one (diff, read-only): 1 Class I — `Retry-After` of ten or more digits fell to the default instead of the 1500 ms cap; fixed (`/^\d+$/`) and covered by new MR-5 cases. 2 Class II — MR-5 cap coverage (added), MR-8 header fixture accepted any status (now requires 502; the handler's 404 branch is unreachable through the real `fetchYahoo`, which throws on an empty result, but it passes the header too).
- Final pass on the fixed diff: **No Class I findings**; both round-one fixes verified. Two Class II: (1) the 404 branch of the handler (which carries the header) is not exercised because `fetchYahoo` never returns a falsy value, so it is unreachable through the real provider — recorded, left as is (helper renamed to `s_headerOn502` so its name matches what it checks); (2) this record was incomplete — completed here.

LAND-EVIDENCE: qa-offline=PASS 88; targeted=PASS; codex-classI-unresolved=0

## Step 10
`npm run qa:offline`: PASS, 88 offline test files (step 0 = 87, +1 = `qa/market_data_resilience_offline.js`), 1 advisory warning (the existing smart quote at `index.html:10976`). Process check beforehand: no QA process active in either slot.

## DEV follow-up (read-only, after PUSH)
Open the DEV network tab on a first load and read `X-PT-Polygon-Fallback` on the scan history responses; this confirms or refutes F-4 (Polygon 429 as the cause of the intermittent Yahoo fallback and the 70 % RS coverage).

## Incidents / rulings during Step 0
Hook denials (PowerShell process listing under R2; a Bash heredoc under R12) were not retried; the Owner ruled the permitted alternatives (Bash `wmic` process check, Edit / Write for `qa.log` / `plan.md`). Details in `qa.log` (local).
