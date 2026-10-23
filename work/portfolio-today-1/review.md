# review.md - portfolio-today-1 (Worker A, Manual)

Task: Portfolio Today v1 (brief rev 3, R11 commit `ac15d16`): Labs switches "Live prices" / "FX rate" (persisted browser-locally, off by default), SPY/QQQ market strip, "Day % - worst first / best first" sort, Est. Daily Move not rendered, per-card "on recorded value (as of <date>)", and freshness labels per US/TASE calendar.

## Files changed
- Implementation (6): `index.html`, `qa/portfolio_today_offline.js`, `qa/fixtures/index-pins.json`, `qa/labs_panel_offline.js`, `qa/evidence_capture_offline.js`, `qa/ts1_default_exposure_offline.js`
- Evidence (tracked): work/portfolio-today-1/brief.md, work/portfolio-today-1/review.md

Declared test updates only: `index-pins.json` via `node qa/tools/index-pins.js --update` (440 functions, 25 regions); `labs_panel_offline.js` LB-8 `_renderPortfolioPanel` digest; `evidence_capture_offline.js` CP-10 constant; `ts1_default_exposure_offline.js` TX-5: exactly the two `LABS_WRITERS` entries from the brief (`_pfSetLiveGate`), nothing else. `BACKLOG.md`, `netlify/**`, `services/**` untouched.

## Gates and boundaries
- Client gates keep their strict `=== true` checks; the Labs setter `_pfSetLiveGate(flag, on)` writes `window.PT_ENABLE_PORTFOLIO_LIVE_PRICES = (on === true);` / `window.PT_ENABLE_PORTFOLIO_FX = (on === true);`. Defaults stay off; storage keys `pt_enable_portfolio_live_prices` / `pt_enable_portfolio_fx` hold `'true'` or are absent.
- Server gates unchanged (`PT_ENABLE_PORTFOLIO_LIVE_PRICES_SERVER`, `PT_ENABLE_PORTFOLIO_FX_SERVER`); no `netlify/**` edit.
- No write to `pt_holdings`, `pt_results`, scoring, scan or Actionable Take (walkthrough localStorage audit below).

## QA
- Step 0 baseline (rev 1): PASS 104 suites. Resume step 0 (rev 2): FAIL, 13 hard failures; all fixed in scope except `ts1_default_exposure` TX-5, which rev 3 declared (see qa.log).
- `node qa/portfolio_today_offline.js`: PASS 40 rows (PT-1..PT-25 and planted negatives PT-N1..PT-N15, all caught).
- `node qa/ts1_default_exposure_offline.js`: PASS 72 asserts.
- Step 10 (final tree, exact `npm run qa:offline`): PASS, 105 suites, 118146 ms, one existing advisory WARN (index.html smart quote, line 12234).

## Functional walkthrough W (local, http://localhost:7001, test holdings only)
Local limitation, stated plainly: the `purpose=portfolio-live` path answered **429 BUDGET_EXHAUSTED** locally even with the canonical site id, because `takeLiveBudget` swallows a Blobs store error and fails closed. The happy path was therefore exercised with real Yahoo data by fetching `market-data` WITHOUT `purpose`, then running the real page functions `_pfLiveNormalize` and `_pfEodCacheSet` and re-rendering. The end-to-end `portfolio-live` check is the post-PUSH DEV walkthrough with real Blobs.

Screenshots unavailable (renderer timeout), two attempts including a fresh tab; DOM text evidence instead.

- **Happy path** (16:58 IDT / 09:58 EDT, Thu-Fri boundary data as fetched): strip SPY and QQQ with price, day %, "Today · in progress" and "fetched 16:58"; AAPL and NVDA "Today · in progress"; TEVA.TA "Last close · Oct 23" (TASE closed); unknown symbol ZZZNOTREAL (502) "Not available". Per-card "on recorded value (as of Oct 20)"; no "Est. Daily Move".
- **Sort via the real buttons:** worst first = TEVA.TA, NVDA, AAPL, then ZZZNOTREAL; best first = AAPL, NVDA, TEVA.TA, ZZZNOTREAL (.TA included, missing last). With AAPL Aged and NVDA Unknown: current row first, then "Aged · Oct 20 · 2 sessions old", "Unknown date", "Not available".
- **Forced fetch failure:** strip and rows "Refresh failed · showing <date>" (NVDA "showing date unknown"), prices kept, `lastFailAt` stamped on all cached rows.
- **Non-session and after-close labels** (real page functions): Saturday with Friday data "Last close"; Thursday data on Saturday "Aged · Oct 22 · 1 session old"; Monday pre-open with Friday data "Last close"; Thanksgiving "Last close · Nov 25" and a holiday phantom bar "Unknown date"; early close 13:30 EST "Last close · Nov 27"; TASE Friday 13:30 "Today · in progress", 14:00 "Last close", Sunday "Unknown date"; 2028 (outside calendar coverage) "Unknown date".
- **Switches:** ON through the real Labs checkboxes: gates true, both storage keys `'true'`, survive reload. OFF: gates false, keys removed, no strip, no live cells, three sort buttons, no REFRESH; stays off after reload.
- **Server flag off:** flagless dev server (no server flags, no site id): both switches on, no cache: `portfolio-live` answered 200, strip and every holding row "Not available", `pt_eod_cache` never written.
- **Writes:** localStorage keys only `pt_eod_cache`, `pt_eod_last_fetch`, `pt_fx`, `pt_holdings` (my seed), `pt_tickers`, plus the two switch keys; `pt_results` null.
- Dev-server hygiene: `--skip-gitignore` on every start after the incident below; `git diff --stat -- .gitignore` empty after each start; servers stopped and ports 7001/3999 confirmed free by MAIN.

## Incidents
- **INCIDENT 1 - netlify dev rewrites .gitignore (out-of-scope tool side effect).** `netlify dev` (v26.0.2) appended "# Local Netlify folder / .netlify" to the tracked `.gitignore` at every start without `--skip-gitignore`. Each time I stopped and reported; the Owner approved restoring it to the exact committed state (three times), verified equal to HEAD with no other untracked files created by the tool. No scope expansion, no governance edit. Rule going forward: always start with `--skip-gitignore`. Other CLI side effects: none beyond a local plugin cache install; no deploy, link or env write.
- **INCIDENT 2 - mode-lock STOP.** A hook denial "R15 mode lock ... session mode is acceptEdits" fired after the session left Manual. I stopped and reported; the Owner returned the session to default mode. I changed no setting. STOP-6 cleared by ruling; the session stayed Manual afterwards.
- **Form denial:** PowerShell Get-NetTCPConnection (port check) -> not reissued; MAIN verified ports 7001/3999 free.
- **Form denial:** step-13 `git commit -m ... && git log ... && git status` in one call (compound) -> reissued as a single plain `git commit -m` call.
- Second dev server on 7002 was impossible (static server fixed on port 3999); TaskStop leaves the child node process holding the ports, so MAIN stopped the stale PIDs (24120, 43928) after checking their command lines.

## Codex ledger
- Round 1 (step 8, read-only, real diff): two Class I findings, both the same root cause. (4) strip symbols appended after holdings so the 27-symbol batch cap could drop SPY/QQQ with 26+ holdings; (7) the suite did not check that. FIX: strip symbols now go first (`_pfWithStripSyms`), tests added (planted negative PT-N15), pins re-set, full QA re-run PASS. Raw output in `codex.md`.
- Final check (step 12): see line below.

Final check: 1 round, 0 findings (PASS) on the complete final diff including this file; no implementation change, no QA re-run. Raw output in `codex.md`.

## Backlog reconciliation
- Brief row: entries 20 and 22, effect `none` for both. Action taken: `none`. `BACKLOG.md` not edited; no entry heading changed. Confirmation: the finished work matches the brief (client switches only; server activation and the 2026-10-03 session-only ruling for the existing switches are untouched).

## Lessons
- [backlog] Entry 20 (Live prices activation, HOLD/EXTERNAL): locally, `purpose=portfolio-live` answers 429 BUDGET_EXHAUSTED even with the canonical site id and a Blobs context, because `takeLiveBudget` (`market-data-live-budget.js`) swallows a store error and fails closed, so the path cannot be exercised offline; investigate the swallowed error and add a local-dev budget bypass or a logged cause - pending routing.
- [backlog] Entry 22 (closed by `surface-1b`): its 2026-10-03 ruling "Labs switches are session-only, never persisted" is superseded for the two new Portfolio switches only (approval of this brief); the Deep Dive and Portfolio research switches stay session-only, so the entry text should say so - pending routing.
- [rule] `netlify dev` rewrites the tracked `.gitignore` unless started with `--skip-gitignore`; always pass the flag and check `git diff --stat -- .gitignore` after the start. Destination-ready text for AGENTS.md "Troubleshooting without the Owner": "Local dev server: start `netlify dev` with `--skip-gitignore`; a changed `.gitignore` is an out-of-scope tool side effect - stop and report."
- [rule] Never leave Manual in a Worker slot: "allow all edits this session" moves the session to acceptEdits and the R15 mode lock then denies every grant (STOP-6). Answer edit prompts with plain Yes.
- TaskStop on `netlify dev` kills only the wrapper; the child node process keeps ports 7001/3999, so a stopped server must be followed by a PID report to MAIN.

LAND-EVIDENCE: qa-offline=PASS 105; targeted=PASS; codex-classI-unresolved=0
