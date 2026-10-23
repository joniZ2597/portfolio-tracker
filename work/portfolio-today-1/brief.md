# Brief: portfolio-today-1 — Portfolio Today v1 (real daily market view on the Portfolio tab)

DRAFT (MAIN, 2026-10-23) for Owner approval. Not committed. Owner-approved scope: Portfolio Today v1 (V1-1…V1-4) + clarifications F (freshness) and W (DEV walkthrough). Mode: Manual, current workflow (R11 brief commit, LAND, PUSH). Base: `branch-dev` at task-start (4899ed3 today).

**What the Owner sees afterwards:** on the Portfolio tab, with "Live prices" and "FX rate" switched on in ⚙ Labs: a market strip (SPY, QQQ), every holding's price and day % with an explicit freshness label (today in progress / last close / aged / unknown / failed), sorting by day %, and no ₪ figure built from typed values presented as a market move.

## Scope (exactly)

| # | Change | Reuse (index.html @4899ed3) |
|---|---|---|
| V1-1 | Labs switches "Live prices" and "FX rate", persisted browser-locally (`pt_enable_portfolio_live_prices`, `pt_enable_portfolio_fx` = `'true'`), off by default; they set the existing `window.PT_ENABLE_PORTFOLIO_LIVE_PRICES` / `PT_ENABLE_PORTFOLIO_FX` (strict `=== true` checks unchanged) | Portfolio-research switch pattern (:17269) |
| V1-2 | Market strip at the top of the Portfolio panel: SPY and QQQ price, day %, freshness label, fetch time. Fetched in the same `purpose=portfolio-live` batch (2 extra symbols, same cache, same 300/h budget) | `_pfLiveNormalize` :12710, `_pfEodCacheSet` :12353 |
| V1-3 | Sort options "Day % — worst first" / "best first"; ordering uses only rows whose freshness is *current* (F-1); other rows follow, grouped by state, each labelled | sort helper :11272, options :11916 |
| V1-4 | Portfolio "Est. Daily Move" not rendered; per-card "≈ est." relabelled "≈ on recorded value (as of <updatedAt date>)"; recorded value and allocation keep their "Recorded" wording | :11736, :12968 |
| F | **Freshness labels** for every price row (holdings and strip), per market calendar (US / TASE, `TS1_POLICY_V1.calendar`, `_ts1AgeSessions` :1702, `sessionDate` from `_pfSessionDateFor` :12700): **Today · in progress** (sessionDate = exchange-local today, session not completed; delayed intraday); **Last close · <date>** (age 0, session completed); **Aged · <date> · n sessions old** (age ≥ 1, amber, never called "today", never in the "current" sort group); **Unknown date** (no market, no session date, or outside calendar coverage — fail closed); **Refresh failed · showing <date>** (existing `lastFailAt`); **Not available** (never fetched / server off). Fetch time shown on the strip | existing helpers only; one pure classifier |

**Not in scope:** quantity, valuation, ₪ P/L, FX day effect, VIX/breadth/sectors, attention list, any default-on change, scoring / scan / Actionable Take / `pt_results` / `pt_holdings` writes, new endpoints or providers, `netlify/**`, `services/**`.

## Files
`index.html` (the changes above) · `qa/portfolio_today_offline.js` (new) · declared pin updates only: `qa/fixtures/index-pins.json` (via `node qa/tools/index-pins.js --update`), `qa/labs_panel_offline.js` (portfolio-panel pin), `qa/evidence_capture_offline.js` (CP-10 constant) · `work/portfolio-today-1/review.md`. Any other test needing an update → STOP and report.

## Acceptance
1. Switches persist across reload, are off by default, and with both server flags on make prices/day % appear without DevTools.
2. Strip: SPY and QQQ day %, freshness label, fetch time; unavailable shown as such, never 0.
3. Freshness (F): no price whose session is not the current/latest completed session of its own market is labelled today or last close; US and TASE evaluated on their own calendars (incl. TASE Mon–Fri from 2026-01-04, US holidays); outside calendar coverage → Unknown date.
4. Day-% sort orders current rows correctly (.TA included); aged/unknown/failed/missing rows follow, labelled.
5. No ₪ value from typed data shown as a market move; Est. Daily Move absent; per-card estimate states basis and date.
6. No write to `pt_holdings`, `pt_results`, scoring or scan; only the existing portfolio-live and BoI endpoints are called.
7. Offline QA: new suite covers F (each state, both markets, weekend/holiday/early-close, coverage edge), V1-3 ordering, V1-1 persistence, V1-4 rendering; `npm run qa:offline` green (count +1).
8. **W — functional walkthrough (required for completion):**
   - **Pre-LAND, local** (`http://localhost:7001`, separate origin, test holdings only; live Yahoo/BoI calls through local functions with the two server flags set locally — authorized by approving this brief): happy path (US + .TA holdings, strip), switches off, server flag off (→ Not available), an unknown symbol (→ Not available), a forced fetch failure (→ Refresh failed · showing <date>), and a non-session day/after-close check of the labels. Screenshots + notes in `review.md`.
   - **Post-PUSH, DEV** (`branch-dev--portfoliotrk.netlify.app`, Chrome, read-only: no change to the Owner's holdings): switches on/off, strip, labels, sort, plus whichever unavailable states occur naturally (e.g. TASE or US closed). Requires the Owner's DEV env flags (below). The task is complete only after this walkthrough passes; a failure becomes a fix task, not a silent pass.

## Dependencies
- Owner, before the DEV walkthrough: Netlify env, branch-deploy/DEV context only: `PT_ENABLE_PORTFOLIO_LIVE_PRICES_SERVER=true`, `PT_ENABLE_PORTFOLIO_FX_SERVER=true` (redeploy after the change).
- Runs alone among `index.html` tasks (before holdings-quantity-1 / portfolio-freshness-1).

## Effort
~1 Worker day implementation + offline QA; ~1–2 h local walkthrough; ~30 min DEV walkthrough. Owner: R11 line, LAND line, PUSH line, the env change.

<!-- land-scope:begin -->
index.html
qa/portfolio_today_offline.js
qa/fixtures/index-pins.json
qa/labs_panel_offline.js
qa/evidence_capture_offline.js
work/portfolio-today-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/portfolio_today_offline.js
<!-- land-tests:end -->
