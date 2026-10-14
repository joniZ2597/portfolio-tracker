# Review — tase-session-overlay-1 (PA-S01)

## Result
A `.TA` symbol no longer gets the US extended-hours overlay on the daily path (`1d` / `5d`). In `netlify/functions/market-data.js` the daily branch now (T-2) reads the ET session from `event._testClock.nowMs` via the existing `polygonNowMs(event)` helper (same finite-number validation as `takeLiveBudget`; real time without the hook) and (T-1) sets `_needsOverlay` only when the session is PRE/POST and `sym` does not match `/\.TA$/i`. Nothing else in the handler changed: historical branch, `purpose` / gate / budget, response bodies and status codes, `deriveExtendedOverlay`, `fetchYahooIntraday` and the `getEtDateStr()` call are untouched.

## QA
- Step 0 baseline: `qa:offline` PASS, 89 suites (HEAD `2d0c5ab`, node v24.14.0).
- Targeted: `qa/tase_session_overlay_offline.js` PASS 9/9 (TS-1, TS-1b, TS-2, TS-3, TS-4, TS-5, TS-6, TS-N1, TS-N2); `market_data_live_offline` PASS 30/30; `market_data_resilience_offline` PASS 13/13; `ath_isolation_offline` PASS 23/23 after the re-pin.
- Step 10: full `qa:offline` PASS, 90 suites (= step 0 + 1).
- Planted negatives: N1 (exclusion removed) fails TS-2; N2 (regex widened to any dotted symbol) fails TS-4; each anchor occurs exactly once.

LAND-EVIDENCE: qa-offline=PASS 90; targeted=PASS; codex-classI-unresolved=0

## RED record (S1)
- Against the unmodified source the daily branch ignores `_testClock` (session follows real time, outside PRE/POST when run), so TS-2 / TS-3 / TS-6 pass vacuously and TS-1, TS-1b, TS-4 fail instead (no overlay request because the clock is not read). This differs from the brief's predicted RED shape (TS-2/3/6).
- Substitute method, same proof: T-2 applied alone (clock honoured, no exclusion) gave the predicted RED — TS-2, TS-3, TS-6 fail (`intraday requests = 1`), TS-1 / TS-1b / TS-4 pass. Then T-1 was applied. Raw output in `qa.log`.
- AR-7i expected RED confirmed (1 failed on `market-data.js` only), then fixed by the one-value re-pin.

## AR-7i re-pin
`qa/ath_isolation_offline.js` `BASELINE_PINS['netlify/functions/market-data.js']` (the brief calls it `BASE_PINS`): `df1a9edbc4cdf2f978b01ac83616391253699de90e9fc23e3de74ecda8e63ea1` -> `d5821ec68e7108a01cb2daa19be94b5f5021ec1ea61f6185d64394381bd4dc6d` (LF sha256 of the new `market-data.js`; the file has no CR bytes). No other value changed.

## Reading used (wording, not a STOP)
- The brief says the suite has rows TS-1…TS-6 + N1/N2; the suite adds one row, TS-1b (US `AAPL` POST keeps its overlay), covering T-3 "the overlay itself for US symbols". It maps to T-3; it is not an orphan.
- T-2 is implemented as `new Date(polygonNowMs(event))` inside the existing line, reusing the helper with the identical `_testClock.nowMs` validation, instead of duplicating the expression.
- `getEtDateStr()` (line 95) stays on real time per T-3, so TS-1 / TS-1b / TS-4 place the fixture bar on the real ET date at an in-session ET hour (computed with Intl in the suite).

## Form denial
Form denial: PowerShell process listing (heavy-run check) -> reissued as the Bash `wmic process where "name='node.exe'"` form from AGENTS.md. (R2; nothing ran.)

## Codex
- Round one (step 8): raw output in `work/tase-session-overlay-1/codex.md`. One finding.
  - **REJECT** (Class I claim) — `qa/ath_isolation_offline.js:219`: Codex states the pin differs from the LF-normalised digest (`8ac1cb2a…`). Reason it does not apply: `market-data.js` contains no CR, so raw and LF digests are identical, `d5821ec6…` (`tr -d '\r' | sha256sum`), equal to the pin; AR-7i, which hashes with the suite's own `sha256Lf`, passes; Codex's own Node digest command had crashed with a quoting `SyntaxError` before it reported the number.
  - All other review points PASS (two-line change only, `.TA` / `BRK.B` behaviour, clock validation, suite rows and mutants, nothing forbidden touched).

- Final check (step 12, raw in `codex.md` under `## Final check`): PASS, no Class I findings. One Class II note — it flagged `review.md` as untracked in the "Evidence (tracked)" row. **REJECT**: `review.md` is untracked only until the step-13 commit, which adds it in the same commit; the row uses the fixed two-row shape AGENTS.md prescribes.
  Final check: 1 round, 0 class-I findings, 1 class-II finding rejected with reason; no implementation change, no QA re-run.

## Files changed
- Implementation (3): netlify/functions/market-data.js, qa/tase_session_overlay_offline.js, qa/ath_isolation_offline.js
- Evidence (tracked): work/tase-session-overlay-1/brief.md, work/tase-session-overlay-1/review.md

## Backlog reconciliation
- Brief's Backlog row: none (audit correction batch).
- Action taken: none. No `BACKLOG.md` edit; the finished work's effect matches the row.
- Entry headings: n/a.
- The diff, QA results and the work being landed agree: no BACKLOG text was changed.

## Not run
- H-3 optional DEV follow-up (read `marketState` for a `.TA` symbol during 04:00–09:30 ET): not run; it is read-only and only possible after PUSH.

## Lessons

- [local] RED shape depends on whether the code under test reads the injected clock: with the clock ignored, session-gated "must not overlay" rows pass vacuously on the old source; applying the clock hook first (T-2) yields the meaningful RED.
- [covered] A leaked-overlay negative needs an intraday fixture that would otherwise produce an overlay (valid bar on the real ET date) — already the shape of the pattern in `qa/market_data_live_offline.js` planted negatives; recorded here as a confirmation.
