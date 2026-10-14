# Task brief: market-data-resilience-1 — Polygon rate-limit resilience and fallback diagnostics on the scan history path (TSR-3 / F-4)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL r2, HELD** (COWORK, 2026-10-14). r2 = r1 + Codex F-1: classification of a Polygon body error by its `status` field (R-3, MR-4, MR-N5), plus the time-limit note in §2. Swept at `branch-dev` = `origin/branch-dev` = `c95cde5`. Placed only on the Owner's R11 approval of this exact hash, after the independent Codex review (§R).

| | |
|---|---|
| Problem | <ul><li>On the scan path, historical ranges (1mo+) go Polygon first. **Any** Polygon failure silently falls back to Yahoo.</li><li>With several symbols requested at once (holding + SPY + QQQ + sector ETF), Polygon's rate limit (HTTP 429) is the likely cause (unverified, F-4) of the intermittent Yahoo fallback.</li><li>That fallback drops Tech Score RS coverage to 70 % on first load (DEV observation D-1, `POST-PUSH-DEV-VALIDATION-c726977.md`; DEV smoke P-3).</li><li>The cause is invisible: the fallback reason is only a server log line.</li></ul> |
| Objective | <ol><li>**One bounded retry on a fast Polygon HTTP 429** on the scan historical path.</li><li>A **typed fallback reason**, in the existing log line and as a response header on the Yahoo-fallback response, so F-4 can be confirmed from the DEV network tab without live probes.</li></ol> Nothing else changes |
| Source | `work/tech-score-reliability-1/review.md` `[backlog]` lesson (TSR-3, F-4). DEV observation D-1 |
| Backlog | **none** (TSR-3 is a pending-routing lesson, not yet a BACKLOG entry; it is recorded at the next product BACKLOG refresh). No `BACKLOG.md` edit |
| Baseline | the `branch-dev` tip at this brief's commit. **Valid only if** these blobs hold; otherwise HOLD: <ul><li>`netlify/functions/market-data.js` blob `fc7c2a998c1c91fd6055c2991d1fdeb931057f18` (LF sha256 `955e7396536f4ea567a390b678be3db67a6978975e97c7b9f8782711768a0f17`);</li><li>`qa/market_data_live_offline.js` blob `d3e27794f71837f3b4f3dec43f95124ef8c967e3`;</li><li>`qa/ath_isolation_offline.js` blob `43baf553533a75f6d490b24129da0af48961244e`.</li></ul> The client (`index.html`) reads no response header of this function (verified at `c95cde5`) |
| Branch / slot | `task/market-data-resilience-1`, **Worker B** (slot B, after Bootstrap's recovery leaves it clean and detached at the current tip) |
| Mode | **Manual** (server behaviour) |
| qa:offline | step-0 count **+1** (`qa/market_data_resilience_offline.js`, auto-discovered) |
| Parallel with | `surface-2` (Worker A). **No shared file**: this task touches none of `index.html`, `netlify/functions/portfolio-sync.js`, `qa/fixtures/index-pins.json`, `qa/asset_*`, `BACKLOG.md` or `qa/run-offline.js`. One heavy run at a time across both slots (AGENTS "Test commands": a process check before every heavy run, recorded in `qa.log`) |

## §1 Files (exactly)

- `netlify/functions/market-data.js`
- `qa/market_data_resilience_offline.js` (new)
- `qa/ath_isolation_offline.js` — **only** the one `BASELINE_PINS` value for `netlify/functions/market-data.js` (expected RED, §4)
- `work/market-data-resilience-1/review.md`

**Forbidden:**
- `index.html`;
- any other `netlify/functions/**` file, and no new file under `netlify/functions/` (FR06 exposure pin);
- `qa/market_data_live_offline.js`;
- `qa/run-offline.js`, `package*.json`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`;
- `BACKLOG.md`.

## §2 Required behaviour (scan purpose, historical ranges only)

| # | Rule |
|---|---|
| R-1 | In the **historical** branch (range not `1d` / `5d`), when `polygonAllowed` and the Polygon request returns **HTTP 429** within **≤ 2000 ms** of being issued, the handler retries the same Polygon request **exactly once**: <ul><li>after a wait of `min(Retry-After seconds × 1000, 1500)` ms, or 1000 ms when `Retry-After` is absent or invalid;</li><li>with a per-request timeout of **3000 ms**.</li></ul> Success → the Polygon response is returned exactly as today. Any other outcome → the existing Yahoo fallback |
| R-2 | **No retry** for any other Polygon outcome: non-429 HTTP, `ERROR` / `NOT_AUTHORIZED` body, empty results, timeout or abort, network error, or a 429 slower than 2000 ms. **Never more than two Polygon requests** per handler call |
| R-3 | A Polygon failure on the historical branch is classified as exactly one of: `http-429`, `http-<status>` (other non-2xx), `auth`, `error`, `empty`, `timeout`, `network`. **The class comes from structured fields only, never from message text:** <ul><li>the HTTP status;</li><li>the response body's `status` field — `NOT_AUTHORIZED` → `auth`, `ERROR` → `error` — **also when the body carries an `error` string as well**. The Worker keeps the body status on the thrown error;</li><li>the abort error name → `timeout`.</li></ul> The class is: <ul><li>appended to the **existing** fallback `console.warn` line;</li><li>set as the response header **`X-PT-Polygon-Fallback: <class>`** on the response the Yahoo fallback then returns (200, 404 or 502).</li></ul> The header is absent on every other response |
| R-4 | **Unchanged:** the daily branch (`1d` / `5d`, Yahoo first), `purpose=portfolio-live` (Yahoo only, budget, envelopes), the purpose / gate / budget logic, response bodies and status codes, `fetchYahoo`, `polygonToYahooShape`, the provider order, and every existing header. No new `require`; no new module-level state; no cache |
| R-5 | Test hooks follow the existing `event._testClock` pattern: <ul><li>`event._testSleep(ms)`, when a function, replaces the real wait;</li><li>`event._testClock.nowMs` supplies the 2000 ms measurement.</li></ul> Both are ignored when absent or invalid |

**Time limit (verified 2026-10-14):** Netlify's functions configuration docs (last updated 2026-10-03) list the **synchronous execution limit as 60 s, not configurable**. `netlify.toml` sets no function timeout. The site's effective limit itself is not readable with read-only tools, so it is **not independently confirmed**.
- Worst case after this change: about 2 s fast 429 + ≤ 1.5 s wait + ≤ 3 s retry (Polygon phase ≤ 6.5 s, inside the existing 10 s Polygon timeout) + ≤ 10 s Yahoo ≈ 16.5 s.
- That is below 60 s, and not worse than today's 20 s double-timeout path. So no limit assumption changes the design.

**Text anchors that must stay byte-identical and unique** (they are planted-negative anchors in `qa/market_data_live_offline.js`):
- `const polygonAllowed = polygonKey !== '' && purpose !== 'portfolio-live';`
- `const isDailyPriceRange = range === '1d' || range === '5d';`
- the three-line budget guard block beginning `  if (purpose === 'portfolio-live' && !(await takeLiveBudget(event, range))) {`
- `    if (_mainRes.status === 'fulfilled' && _mainRes.value) {`

## §3 QA (new suite `qa/market_data_resilience_offline.js`; same harness style as `market_data_live_offline`: in-process handler, a `fetch` spy that throws on any other host, injected clock / sleep)

| Row | Assertion |
|---|---|
| MR-1 | historical scan: Polygon 429 then 200 → exactly 2 Polygon calls, 0 Yahoo; status 200; `_provider` polygon; **no** `X-PT-Polygon-Fallback` header |
| MR-2 | Polygon 429 twice → exactly 2 Polygon calls, then Yahoo; status 200 (Yahoo ok); header `http-429` |
| MR-3 | Polygon 500 → exactly 1 Polygon call, then Yahoo; header `http-500` |
| MR-4 | each with exactly 1 Polygon call: <ul><li>body `{status:'NOT_AUTHORIZED'}` → `auth`;</li><li>**body `{status:'NOT_AUTHORIZED', error:'Unknown API Key'}` → `auth`** (F-1);</li><li>body `{status:'ERROR', error:'<text mentioning NOT_AUTHORIZED>'}` → `error`;</li><li>empty results → `empty`;</li><li>abort → `timeout`;</li><li>network throw → `network`</li></ul> |
| MR-5 | wait: `Retry-After: 1` → 1000 ms; `Retry-After: 30` → 1500 ms (cap); absent / invalid → 1000 ms (via `_testSleep`) |
| MR-6 | a 429 observed after > 2000 ms (`_testClock`) → no retry; header `http-429` |
| MR-7 | unchanged paths: <ul><li>daily scan (Yahoo fail → Polygon 429) → exactly 1 Polygon call, no header;</li><li>`portfolio-live` (all ranges) → 0 Polygon calls, no header;</li><li>key unset → 0 Polygon calls, no header</li></ul> |
| MR-8 | Yahoo also fails after Polygon 429 ×2 → status 502 with the existing body text; header `http-429` |
| MR-N1…N5 | planted negatives on a temp copy of the production handler (every anchor exactly once). Each must fail its row: <ul><li>retry also on 500 → MR-3;</li><li>no retry cap → MR-2;</li><li>header set on success → MR-1;</li><li>retry added to the daily branch → MR-7;</li><li>**MR-N5:** classification from message text (`/NOT_AUTHORIZED/` on the thrown message) → MR-4's both-fields case fails (F-1)</li></ul> |

**Must stay green:**
- `node qa/market_data_live_offline.js` — **unchanged file**. ML-1…ML-7, LB, MB and every planted negative pass (its Polygon failure fixture is HTTP 500, so R-2 keeps its call counts).
- `node qa/fund_facts_route_offline.js` (no new function file).
- `node qa/market_structure_offline.js` (MS-T16 compares the introducing commit only).

## §4 Expected RED (resolved inside the task)

`qa/ath_isolation_offline.js` **AR-7i** pins `netlify/functions/market-data.js` at LF sha256 `955e7396…`. After the change it fails exactly on that file. The fix is the one-value re-pin to the new LF sha256, recorded in `review.md`. No other row, PN row or pin in that suite changes.

## §5 Steps (usual workflow)

| Step | Who | Action |
|---|---|---|
| 0 | Worker | baseline check (table above); process check → step-0 `qa:offline`; `plan.md` |
| S1 RED | Worker | write `qa/market_data_resilience_offline.js`; MR-1, MR-2, MR-5, MR-6, MR-8 and the R-3 header rows fail against the current handler; record them |
| S2 GREEN | Worker | implement R-1…R-5 in `market-data.js`; all MR rows + negatives pass; `market_data_live_offline` passes unchanged; re-pin AR-7i (§4) |
| 8 | Worker | Codex round one on the diff |
| 10 | Worker | process check → full `npm run qa:offline` PASS, count = step 0 + 1 |
| 11–13 | Worker | `review.md` (L9 line), final Codex, step-13 commit, integrity |
| LAND / PUSH | Bootstrap + Owner | usual R12 path. Second-LAND resync if `surface-2` lands first (no shared file) |

**Ordinary in-scope problems are the Worker's to fix.** STOP only for:
- a needed change outside §1;
- a change to R-4 behaviour;
- an anchor in §2 that must change;
- a denied protected action or an integrity FAIL.

## §6 Definition of Done

1. MR-1…MR-8 and MR-N1…N5 pass.
2. `market_data_live_offline`, `fund_facts_route_offline`, `market_structure_offline` and `ath_isolation_offline` (after the one re-pin) pass.
3. Step 10 `qa:offline` PASS at step 0 + 1.
4. Codex: no unresolved Class I.
5. `review.md` records the RED evidence, the re-pin, and a one-line DEV follow-up: after PUSH, open the DEV network tab on a first load and read `X-PT-Polygon-Fallback` (read-only; confirms or refutes F-4).

## §R Independent review before R11

Codex `--sandbox read-only` on this brief plus `netlify/functions/market-data.js`, `qa/market_data_live_offline.js` and `qa/ath_isolation_offline.js` at `c95cde5`. Questions:
1. Does any existing assertion contradict R-1…R-5?
2. Is the 2000 / 1500 / 3000 ms bounding safe for the function time limit?
3. Is the header safe for the client (no client reads response headers of this function)?
4. Is any coupled suite missing?

## §CMD Command card (one command per Bash call, exactly as written; Bash tool only)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
git rev-parse HEAD:netlify/functions/market-data.js
node qa/guard_integrity_check.js --task task/market-data-resilience-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/market_data_resilience_offline.js
node qa/market_data_live_offline.js
node qa/ath_isolation_offline.js
node qa/fund_facts_route_offline.js
node qa/market_structure_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/market-data-resilience-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/market-data-resilience-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (prompts):**
  - `git add <explicit §1 paths>`;
  - one read-only process listing before each heavy run (AGENTS "Test commands");
  - `codex exec --sandbox read-only <prompt>` (the prompt names functions, never the hook or the land tool by file path).
- **C (Owner):** R11; LAND; PUSH.

<!-- land-scope:begin -->
netlify/functions/market-data.js
qa/market_data_resilience_offline.js
qa/ath_isolation_offline.js
work/market-data-resilience-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/market_data_resilience_offline.js
node qa/market_data_live_offline.js
node qa/ath_isolation_offline.js
node qa/fund_facts_route_offline.js
<!-- land-tests:end -->
