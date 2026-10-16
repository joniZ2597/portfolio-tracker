# review.md — ai-request-hygiene-1

Brief: `work/ai-request-hygiene-1/brief.md` (committed blob sha256 `47b5734fbe083eb885d2ce075f28a2ded5c6222e6bf411fff8a0843d20c35e52`). Branch `task/ai-request-hygiene-1`, base `c3d5439`, Worker A, Manual mode.

## Result

The scan request now carries `max_tokens: 2500` on the first attempt and the retry (`_AI_MAX_TOKENS`). Every attempt writes a best-effort, memory-only record to the `Map` `window._aiReqDebug` (last 4 attempts per ticker, last 100 tickers, least recently written dropped). `formatStockContext` prints `n/a` for an invalid or missing price, volume or change %, and USD prices with 2 decimals (up to 4 below $1). `P5_CALL2_TIMEOUT_MS` is 52,000. No prompt, schema, retry, scoring or persistence change.

## Files changed
- Implementation (4): index.html, qa/fixtures/index-pins.json, qa/tase_units_offline.js, qa/ai_request_hygiene_offline.js
- Evidence (tracked): work/ai-request-hygiene-1/brief.md, work/ai-request-hygiene-1/review.md

## QA
- Step 0 baseline (before any edit): `npm run qa:offline` PASS, 99 suites.
- RED (S1): new suite on the unmodified source failed HY-1, HY-5, HY-6, HY-7, HY-8, HY-9, HY-10 and passed HY-2, HY-3, HY-4, HY-11, as the brief states.
- GREEN (S2): `node qa/ai_request_hygiene_offline.js` PASS (11 rows, 15 negatives); `qa/tase_units_offline.js` PASS (9 assertions, negatives caught); `no_synthetic_score` PASS (160); `high1y_label` PASS (103); `pulse_analyst_view` PASS (108); `index-pins --check` OK (380 functions, 25 regions); `index_pins_offline` PASS (13).
- Pin map: `index-pins --update` changed exactly four values — `fileSha256`, `remainderSha256`, `functions.fetchAnthropicAnalysis` (`99eb1e8d…5089`, equals the §A3.3 digest), `functions.formatStockContext`.
- Step 10: `npm run qa:offline` PASS, 100 suites (step 0 + 1), 1 advisory warning (same as baseline).
- EOL audit: `index.html`, `qa/tase_units_offline.js`, `qa/fixtures/index-pins.json`, `qa/ai_request_hygiene_offline.js` contain 0 CR bytes (LF, as at base).

LAND-EVIDENCE: qa-offline=PASS 100; targeted=PASS; codex-classI-unresolved=0

## Fresh-context self-review
Re-read the brief and the full diff against the requirement→test map (`plan.md`). The five `index.html` hunks equal the §A1 NEW text; the four `tase_units` hunks equal §A3; the new suite was extracted verbatim from §A2. No change outside §1/§2. Nothing changed as a result.

## Codex
- Round 1 (step 8, diff review, raw in `codex.md`): NOT READY, 1 Class I.
  - HY-7 exercises 4 price fields (`open`, `previous_close`, `high`, `low`) and not the headline `price` field. **REJECT**: the brief's HY-7 row and §A2 state "12 bad price inputs × 4 fields" and §A2 is the exact approved text of a new suite; the `Price:` field goes through the same `_px` the four tested fields use (and `HY-8`'s block asserts a valid `price`), so the behaviour is covered; adding a field would depart from the approved suite text.
  - Codex confirmed: only the four approved files plus the new suite changed; `index.html` edits equal A1; pin diff is exactly four values; A3 edits present; no scoring, prompt, schema, retry or persistence change.
- Final check (step 12, raw in `codex.md` under `## Final check`): PASS, no findings; Codex supported the REJECT above.

Final check: 1 round, 0 class-I findings — 0 FIX, 0 DEFER, 0 REJECT, 0 unresolved; no class-II findings.

## FIX / DEFER / REJECT ledger
| # | Finding | Class | Decision | Reason |
|---|---|---|---|---|
| 1 | HY-7 omits the headline `price` field | I | REJECT | Exact approved §A2 text and brief HY-7 row fix 4 fields; same `_px` path; see above |

## Backlog reconciliation
Brief Backlog row: none. Action taken: none. No `BACKLOG.md` edit; no entry affected. The diff, QA results and landed work contain no backlog effect.

## Risks / not tested
As listed in the brief §RT "Untested risks": scan cost/time at 2,500 and whether the model uses the extra room are measured on DEV after LAND (separate Owner approval); no live call was made.
