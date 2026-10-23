# Brief: portfolio-today-1 — Portfolio Today v1 (real daily market view on the Portfolio tab)

REV 3 (MAIN, 2026-10-23) for Owner approval. Supersedes rev 2 (R11 commit `d9880bb`, blob sha256 `bd196074…30ea`), which superseded rev 1 (R11 commit `18a3653`, blob sha256 `dbd38a0d…dab046`). **Objective, Scope, Not-in-scope, Acceptance, Dependencies are unchanged from rev 1.**
- Rev 2 added the auto-edit-scope block, the execution preflight block, the execution readiness line, the Backlog row and the Resume section.
- Rev 3 adds one declared test update, `qa/ts1_default_exposure_offline.js` (TX-5 `LABS_WRITERS`, see Files), to Files, auto-edit-scope, land-scope and land-tests, and updates the Resume and preflight sections.

Mode: Manual, current workflow (R11 brief commit, LAND, PUSH). Base: `branch-dev` at task-start (the rev-3 R11 commit, after its PUSH).

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
`index.html` (the changes above) · `qa/portfolio_today_offline.js` (new) · declared pin updates only: `qa/fixtures/index-pins.json` (via `node qa/tools/index-pins.js --update`), `qa/labs_panel_offline.js` (portfolio-panel pin), `qa/evidence_capture_offline.js` (CP-10 constant) · `qa/ts1_default_exposure_offline.js` (TX-5 only: two entries added to `LABS_WRITERS`, each one strict write inside one named setter, exactly `PT_ENABLE_PORTFOLIO_LIVE_PRICES: { fn: '_pfSetLiveGate', stmt: 'window.PT_ENABLE_PORTFOLIO_LIVE_PRICES = (on === true);' }` and `PT_ENABLE_PORTFOLIO_FX: { fn: '_pfSetLiveGate', stmt: 'window.PT_ENABLE_PORTFOLIO_FX = (on === true);' }`; nothing else in the file changes — no comment, `ALLOWED_DEFAULTS` or other row edit) · `work/portfolio-today-1/review.md`. Any other test needing an update → STOP and report.

**Backlog:** entries 20 and 22, effect `none` for both. `BACKLOG.md` is not edited; `backlog-refresh-1` records the changes below later.
- **20 Live prices activation (HOLD/EXTERNAL): `none`.** The new switch only sets the existing client gate. Activation stays blocked on the Owner's server env action (`PT_ENABLE_PORTFOLIO_LIVE_PRICES_SERVER`), so the entry stays accurate.
- **22 (closed by `surface-1b`): `none` to its status.** Its Owner ruling of 2026-10-03, "Labs switches are session-only, never persisted", is **explicitly superseded by approving this brief, for the two new switches only** ("Live prices", "FX rate", persisted as in V1-1). The existing Deep Dive and Portfolio research switches stay session-only and unchanged.
- `review.md` carries a `[backlog]` lesson for each of the two entries above, so `backlog-refresh-1` picks them up.

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

## Resume (rev 3 restart of an in-progress task)
History:
- Rev 1 was paused on 2026-10-23 and restarted as rev 2, with the files restored and parity proven.
- Under rev 2 the Worker finished all in-scope work. `npm run qa:offline` then ran 105 suites with exactly one hard failure, `qa/ts1_default_exposure_offline.js` TX-5, which is outside rev 2's file set. `node qa/portfolio_today_offline.js` passed 39 (PT-1..PT-25 and PT-N1..N14).
- MAIN proved the TX-5 change listed under Files on a scratch copy outside the repository: 72/72 asserts PASS, against 1 failure unmodified.

Restart steps:
1. The work is backed up outside the repository with a sha256 manifest: `index.html`, `qa/portfolio_today_offline.js`, `qa/fixtures/index-pins.json`, `qa/labs_panel_offline.js`, `qa/evidence_capture_offline.js`, plus the ignored `plan.md` / `qa.log`.
2. The rev-2 task record is closed by `cleanup`.
3. A fresh record is made by `task-start` on the rev-3 base.
4. The files are restored, with sha256 and size parity proven against the manifest, before the Worker resumes.

After the restore, the Worker:
1. makes only the TX-5 edit listed under Files;
2. runs `node qa/ts1_default_exposure_offline.js`;
3. re-runs step 0 (`npm run qa:offline`) on the restored tree and records the count;
4. continues with the PENDING items in `plan.md` (self-review, Codex, step 10, `review.md`, walkthrough W, step 13).

No completed work is re-done unless a run shows it failing.

STOP if restore parity fails, or if any restored file at the rev-3 base differs from rev-2 base `d9880bb` outside `work/portfolio-today-1/brief.md`.

After any later `index.html` edit, re-run `node qa/tools/index-pins.js --update` and re-set the CP-10 constant. Re-set the LB-8 digest only if `_renderPortfolioPanel` changes.

## Execution preflight
Classes: **A** auto-approved by `.claude/settings.json` (or by the R15 grant for edits) · **B** permission prompt · **C** governance gate · **D** hook-denied (must not appear).

| Stage | Command / tool | Class |
|---|---|---|
| Step 0 | `node qa/guard_integrity_check.js --task task/portfolio-today-1 --root <canonical checkout> --print-record` | A |
| Step 0 / 10 | `npm run qa:offline` — run exactly this form, no redirect, pipe, `;` or `echo` suffix | A |
| Slices | `node qa/portfolio_today_offline.js` (land test), and any existing `node qa/<name>_offline.js` re-check, exact form | A |
| Slices | `node qa/labs_panel_offline.js`, `node qa/evidence_capture_offline.js`, `node qa/index_pins_offline.js`, `node qa/ts1_default_exposure_offline.js` | A |
| Pins | `node qa/tools/index-pins.js --check` / `--update` / `--diff <arg>` | A |
| Edits | Edit / Write / MultiEdit on the auto-edit-scope paths below, and on `work/portfolio-today-1/plan.md`, `codex.md`, `qa.log` | A (R15 grant) |
| Edits | scratch files only under `/tmp/pt-portfolio-today-1/`, created with the Write tool, which makes the folder itself (no `mkdir`, which prompts) | A (R15 grant) |
| Reading logs and output | Read / Grep tools only (never `tail`, `cut`, `cat` pipelines) | A |
| Local walkthrough W | local dev server on port 7001 with the two server flags set locally; Chrome on `http://localhost:7001` | B (expected prompts: server start, browser tools) |
| Codex review | `codex exec` foreground with `< /dev/null` | B |
| Step 13 | r9 task-branch commit staging only land-scope paths | B (+ envelope (f) checks) |
| Step 13 | integrity check, `land-request` | A / C |
| LAND, PUSH, cleanup | R12 tool lines | C |

Slice-to-slice continuation needs no Owner input when the gates PASS. Expected prompts (B) are listed above, separately from the C gates. No D items are on the path. Any other command form that prompts is not improvised around: use the listed form.

**Execution readiness:** ATTENDED-ONLY.

<!-- auto-edit-scope:begin -->
index.html
qa/portfolio_today_offline.js
qa/fixtures/index-pins.json
qa/labs_panel_offline.js
qa/evidence_capture_offline.js
qa/ts1_default_exposure_offline.js
work/portfolio-today-1/review.md
<!-- auto-edit-scope:end -->
<!-- land-scope:begin -->
index.html
qa/portfolio_today_offline.js
qa/fixtures/index-pins.json
qa/labs_panel_offline.js
qa/evidence_capture_offline.js
qa/ts1_default_exposure_offline.js
work/portfolio-today-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/portfolio_today_offline.js
node qa/ts1_default_exposure_offline.js
<!-- land-tests:end -->
