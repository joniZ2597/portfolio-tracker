# Brief: portfolio-live-budget-fix-1 — make the portfolio-live hourly budget work in its runtime (BACKLOG entry 20)

DRAFT (MAIN, 2026-10-23) for Owner approval. Mode: Manual, current workflow (R11 brief commit, LAND, PUSH). Base: `branch-dev` at task-start (the R11 commit of this brief, after its PUSH; `55b0618` today). Owner decision D-1 (2026-10-23): "Eventual-consistency read". There are no open decisions.

**What the Owner sees afterwards:** on the DEV Portfolio tab with "Live prices" on, holdings and the SPY/QQQ strip show real prices, day % and freshness labels instead of "Not available". The hourly upstream budget still applies and still refuses on any error.

## Root cause (established read-only, 2026-10-23)
- `netlify/functions/market-data.js` is a legacy Lambda-style function (`exports.handler`). Its budget gets the Blobs context only through `connectLambda(event)` (market-data.js:602).
- In `@netlify/blobs` 10.7.9, `connectLambda` (node_modules/@netlify/blobs/dist/main.cjs:72-81) sets only `edgeURL`, `siteID`, `deployID` and `token`. It never sets `uncachedEdgeURL`.
- `lib/market-data-live-budget.js` `take()` reads the counter with `{ consistency: 'strong' }`. A strong read without `uncachedEdgeURL` throws "Netlify Blobs has failed to perform a read using strong consistency because the environment has not been configured with a 'uncachedEdgeURL' property" (main.cjs:88, :256).
- `take()` swallows the error and returns false, so every `purpose=portfolio-live` request answers 429 `BUDGET_EXHAUSTED` with no upstream request. This happened on the first call of the hour, on DEV deploy `6adb70334d44580fd62b7485` and locally.
- The functions whose strong reads work (`ath-*`, `fund-facts*`, `news-catalysts*`, `sec-evidence-pull`) are v2 `.mjs` entries wrapped with `withLambda`, which get the full ambient context. The other `connectLambda` users (`portfolio-sync`, `tradingview-webhook`, `sec-evidence-store`, `lib/evidence-cache`) use no strong reads.

## Scope (exactly)

| # | Change |
|---|---|
| F-1 | `take()` reads the counter with the default (eventual) consistency: `store.get(key)` with no strong option; the `STRONG` constant is removed. Everything else in `take()` is unchanged: the argument checks, the missing-store check, the digits-only counter check, `Number.isSafeInteger`, the `used + units > BUDGET_PER_HOUR` refusal, the write of `used + units`, and the counter key format. |
| F-2 | Sanitized refusal diagnostics in `take()` only. Every `return false` path logs exactly one line, `[market-data-live-budget] refused: <CATEGORY>`. CATEGORY is one of the fixed values `BAD_UNITS`, `BAD_TIME`, `NO_STORE`, `BAD_COUNTER`, `CAP_REACHED`, `STORE_ERROR:<name>`. `<name>` is the thrown value's `name` only when it matches `/^[A-Za-z]{1,40}$/`, otherwise `Error`. Never logged: error messages, stack traces, URLs, tokens, headers, symbols, keys, counter values, or any request or portfolio data. The admitted path logs nothing. |
| F-3 | The module header comment documents the reason: the strong read is unsupported under `connectLambda`; eventual consistency makes the counter approximate under bursts, which is acceptable for a cost backstop; it still fails closed. |

**Must not change:** `BUDGET_PER_HOUR` (300), `STORE_NAME`, `KEY_PREFIX`, `keyFor`, the export list, fail-closed behaviour on every error path, `netlify/functions/market-data.js` (byte-identical; pinned by `qa/ath_isolation_offline.js` and `qa/market_structure_offline.js`), the scan path, any other function, `index.html`, env vars, netlify.toml, package files.

**Not in scope:** migrating market-data to the v2 runtime, any cap or units change, any client change, BACKLOG.md text, the FX path.

## Files
`netlify/functions/lib/market-data-live-budget.js` (F-1..F-3) · `qa/market_data_live_offline.js` (declared test update: re-anchor the existing "fail open" planted negative at :558 to the new catch text, keeping its meaning; add the rows below) · `work/portfolio-live-budget-fix-1/review.md`. Any other test needing an update → STOP and report.

**Backlog:** entry 20, effect `none` for this task. It makes the already-built path work; the entry's status text is recorded later by `backlog-refresh-1`. `BACKLOG.md` is not edited. `review.md` carries a `[backlog]` lesson for entry 20.

## Acceptance
1. **Root-cause regression row (RED first).** A fake store whose `get` throws a `MissingBlobsEnvironmentError`-named error when called with `{ consistency: 'strong' }`, and works otherwise (the `connectLambda` context), admits a first request and counts it. The row fails on the base, before F-1.
2. **Fail closed is kept:** a store that throws on `get` or `set`, a missing store, a non-digit or unsafe counter, bad units or a bad time, and `used + units > 300` all refuse (false). The existing rows MB-* stay green.
3. **Diagnostics are sanitized:** each refusal path logs exactly its fixed category line. A thrown error whose message holds a URL, a token-like string and a symbol logs only `STORE_ERROR:<name>`; a non-alphabetic name logs `STORE_ERROR:Error`. The admitted path logs nothing. A planted negative that logs `err.message` must fail.
4. No strong-consistency option remains in the module; `market-data.js` is byte-identical to the base.
5. `npm run qa:offline` is green with the same suite count as step 0 (no new suite file).
6. **Independent Codex review** of the real diff (round 1 and final): no unresolved Class I finding.
7. **DEV verification (post-PUSH, MAIN, read-only; required for completion).** The env flags are already set (branch-dev only). The push deploy must show `branch-dev`, branch-deploy context and the landed commit. Then:
   - `market-data?symbol=SPY&purpose=portfolio-live&interval=1d&range=5d` on `branch-dev--portfoliotrk.netlify.app` answers 200 with Yahoo data (`meta._provider` = yahoo).
   - The function log (`netlify logs`) shows no `refused:` line for that call.
   - The Portfolio Today v1 DEV walkthrough happy path passes (live prices, day %, Today / Last close / Aged labels, "Refresh failed · showing <date>" when forced), with the Owner's holdings unchanged (SHA-256 before and after). That closes portfolio-today-1 as well.
   - A failure becomes a ruling or fix task, not a silent pass.

## Dependencies
- portfolio-today-1 is landed (`55b0618`) and stays open until acceptance 7 passes.
- Env flags `PT_ENABLE_PORTFOLIO_LIVE_PRICES_SERVER` / `PT_ENABLE_PORTFOLIO_FX_SERVER` = `true`, branch-dev only (set 2026-10-23). No env change in this task.
- Runs in a free Worker slot; touches no `index.html`.

## Effort
~1–2 Worker hours plus QA; ~30 min DEV verification. Owner: R11 line, LAND line, PUSH line.

## Execution preflight
Classes: **A** auto-approved by `.claude/settings.json` (or by the R15 grant for edits) · **B** permission prompt · **C** governance gate · **D** hook-denied (must not appear).

| Stage | Command / tool | Class |
|---|---|---|
| Step 0 | `node qa/guard_integrity_check.js --task task/portfolio-live-budget-fix-1 --root <canonical checkout> --print-record` | A |
| Step 0 / 10 | `npm run qa:offline`, run in exactly this form: no redirect, pipe, `;` or `echo` suffix | A |
| Slices | `node qa/market_data_live_offline.js` (land test); `node qa/ath_isolation_offline.js`, `node qa/market_structure_offline.js`, `node qa/market_data_resilience_offline.js`, `node qa/tase_session_overlay_offline.js` (regression checks) | A |
| Edits | Edit / Write / MultiEdit on the auto-edit-scope paths below, and on `work/portfolio-live-budget-fix-1/plan.md`, `codex.md`, `qa.log` | A (R15 grant) |
| Edits | scratch files only under `/tmp/pt-portfolio-live-budget-fix-1/`, created with the Write tool (no `mkdir`) | A (R15 grant) |
| Reading logs and output | Read / Grep tools only (never `tail`, `cut`, `cat` pipelines, never PowerShell in the slot) | A |
| Codex review | `codex exec` in the foreground with `< /dev/null` | B |
| Step 13 | r9 task-branch commit staging only land-scope paths (two calls: `git add <paths>`, then `git commit -m "<single line>"`) | B (+ envelope (f) checks) |
| Step 13 | integrity check, `land-request` | A / C |
| LAND, PUSH, cleanup | R12 tool lines | C |
| DEV verification | MAIN: `netlify api listSiteDeploys` / `getDeploy` (approved read-only form), one `curl` of the DEV endpoint, `netlify logs`, Chrome walkthrough | B (MAIN session) |

No local dev server and no live call from the Worker: offline QA only. Slice-to-slice continuation needs no Owner input when the gates PASS. Expected prompts (B) are listed above, separately from the C gates. No D items are on the path.

**Execution readiness:** ATTENDED-ONLY.

<!-- auto-edit-scope:begin -->
netlify/functions/lib/market-data-live-budget.js
qa/market_data_live_offline.js
work/portfolio-live-budget-fix-1/review.md
<!-- auto-edit-scope:end -->
<!-- land-scope:begin -->
netlify/functions/lib/market-data-live-budget.js
qa/market_data_live_offline.js
work/portfolio-live-budget-fix-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/market_data_live_offline.js
node qa/ath_isolation_offline.js
node qa/market_structure_offline.js
<!-- land-tests:end -->
