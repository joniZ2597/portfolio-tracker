# review.md - portfolio-live-budget-fix-1 (Worker A, Manual)

Task: make the portfolio-live hourly budget work in its runtime (BACKLOG entry 20). Root cause per the brief: `connectLambda` gives no `uncachedEdgeURL`, so the strong-consistency counter read in `take()` throws; the throw was swallowed and every `purpose=portfolio-live` call answered 429 BUDGET_EXHAUSTED.

## Files changed
- Implementation (2): `netlify/functions/lib/market-data-live-budget.js`, `qa/market_data_live_offline.js`
- Evidence (tracked): work/portfolio-live-budget-fix-1/brief.md, work/portfolio-live-budget-fix-1/review.md

## What changed
- F-1: the counter is read with `store.get(key)` (default, eventual consistency); the `STRONG` constant is gone. Argument checks, missing-store check, digits-only counter, `Number.isSafeInteger`, the 300 cap, the write of `used + units`, key format, exports and fail-closed behaviour are unchanged.
- F-2: every refusal goes through `refuse(category)`, which logs exactly one `[market-data-live-budget] refused: <CATEGORY>` line (BAD_UNITS, BAD_TIME, NO_STORE, BAD_COUNTER, CAP_REACHED, STORE_ERROR:<name>); `<name>` only if it matches `/^[A-Za-z]{1,40}$/`, else `Error`. No message, stack, URL, token, symbol, key or counter value is logged; the admitted path logs nothing. The log call is guarded, so a failing logger still yields a refusal, never a throw (Codex round 1).
- F-3: header comment documents why the read is eventual, that the count is approximate under bursts, and that it still fails closed.
- `netlify/functions/market-data.js` untouched (byte-identical; `ath_isolation` and `market_structure` pins PASS). `BUDGET_PER_HOUR`, `STORE_NAME`, `KEY_PREFIX`, `keyFor`, the export list untouched.

## Tests (qa/market_data_live_offline.js, 30 -> 39 rows)
- RED first: LB-6 (a store whose strong read throws `MissingBlobsEnvironmentError`, default read works) failed on the base before F-1: `the first request of the hour must be admitted` (`false !== true`, suite FAIL 1/31 with the new row added: 30 existing + LB-6). GREEN after F-1.
- New: LB-6 (root cause, plus set-throw and full-hour refusals under the same context), LB-7 (each refusal path logs exactly its category line; a message holding a URL, token-like string and symbol logs only `STORE_ERROR:TypeError`; non-alphabetic, over-long and empty names log `STORE_ERROR:Error`; counter value not leaked; admitted path silent; failing logger still refuses), LB-8 (no `consistency`/`strong` in the module code; read is `store.get(key)`).
- Planted negatives: MB-N8 (err.message logged), MB-N9 (strong read restored), MB-N10 (counter value logged), MB-N11 (raw error name logged), MB-N12 (admitted path logs), MB-N13 (unguarded log call). Each asserts the real source passes the scenario and the mutant fails it.
- Re-anchored (same file, text-only; meaning kept): MB-N4 "fail open" now mutates `return refuse('STORE_ERROR:' + name);` to `return true;`. MB-N2 and MB-N5 anchored on `return false;` lines that F-2 rewrote to `return refuse(...)`, so their anchors were updated the same way (same file, no other file touched); their mutations are unchanged in meaning.
- Side effect: the lib now writes refusal lines to stderr while the suite runs; stdout results are unaffected.

## QA
- Step 0 (base ebd83e7): exact `npm run qa:offline` PASS, 105 suites, one advisory WARN (index.html smart quote).
- Land-tests and regression: `market_data_live` PASS 39/39; `ath_isolation` PASS; `market_structure` PASS; `market_data_resilience` PASS 13/13; `tase_session_overlay` PASS 9/9.
- Step 10 (final tree): exact `npm run qa:offline` PASS, 105 suites (same count as step 0), 138455 ms, same single advisory WARN.
- Offline only: no dev server, no live call, no Netlify command. Acceptance 7 (DEV verification) is MAIN's post-PUSH step and is not claimed here.

## Codex ledger
- Round 1 (step 7, read-only, real diff): two Class I. (a) `take()` threw if `console.warn` threw (violates never-throws); (b) LB-7 had no failing-logger case. FIX both: guarded log call, failing-logger case in LB-7, MB-N13; relevant QA re-run PASS. F-1, F-3 and Scope: no findings. Raw output in `codex.md`.
- Final check (step 12): see line below.

Final check: 1 round, 0 class-I findings, 1 class-II finding REJECTED (it asked for a different "Files changed" shape; the two-row shape used here, Implementation (N) plus Evidence (brief.md, review.md), is the fixed shape AGENTS.md requires and already lists the brief and this file); verdict PASS; no implementation change, no QA re-run. Raw output in `codex.md`.

## Backlog reconciliation
- Brief row: entry 20, effect `none`. Action taken: `none`. `BACKLOG.md` not edited; no entry heading changed. Confirmation: the finished work makes the already-built portfolio-live budget path work and does not change the entry's HOLD/EXTERNAL activation status.

## Lessons
- [backlog] Entry 20 (Live prices activation, HOLD/EXTERNAL): root cause of the BUDGET_EXHAUSTED-on-first-call defect was a strong-consistency Blobs read under `connectLambda` (no `uncachedEdgeURL`); fixed by an eventual-consistency read (portfolio-live-budget-fix-1). The entry's status text should record the fix and that DEV verification (SPY 200 with Yahoo data, no `refused:` log line, Portfolio Today happy path) is what closes portfolio-today-1 - pending routing.
- [design] Any budget or counter in a legacy `exports.handler` function (Blobs context via `connectLambda`) must not use `consistency: 'strong'`; strong reads work only in v2 `.mjs` functions wrapped with `withLambda`. A swallowed store error hides this: refusals now log a fixed category so the cause is visible in the function log.
- Planted-negative anchors that quote production source lines break when the production text changes; a refactor that rewrites `return false;` lines must re-anchor every mutant that quotes them (here MB-N2, MB-N4, MB-N5).

LAND-EVIDENCE: qa-offline=PASS 105; targeted=PASS; codex-classI-unresolved=0
