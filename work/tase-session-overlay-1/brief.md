# Task brief: tase-session-overlay-1 — no US extended-hours overlay for TASE symbols (PA-S01)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL, HELD** (COWORK, 2026-10-14). Swept at `c95cde5` and against the `market-data-resilience-1` r2 candidate. Next Worker B task: **CB-1c, server part** (correction backlog rank 6, the highest open item). Placed only on the Owner's R11 approval of this exact hash, after independent Codex review.

| | |
|---|---|
| Problem | **PA-S01 (Med–High, verified in code):** on the daily path (`1d` / `5d`), the handler adds a US extended-hours overlay whenever New York is in PRE (04:00–09:30 ET) or POST (16:00–20:00 ET). For a `.TA` symbol, NY pre-market overlaps TASE's trading day. So live TASE bars are labelled `marketState: 'PRE'` with a "pre-market price", and the client shows TASE prices as pre-market |
| Objective | A `.TA` symbol never gets the US extended-hours overlay: no intraday request, and no `marketState` / `preMarketPrice` / `postMarketPrice` / change-percent fields. US symbols, including dot-class shares such as `BRK.B`, are unchanged |
| Source | Correction backlog CB-1c (`CORRECTION-BACKLOG.md` rank 6); `FINDINGS-REGISTER.md` PA-S01. **PA-S08** (legacy RS positional pairing, client `index.html`) is **not** in this task; it stays in the lane-A queue. Hypothesis H-3 (DEV observation 04:00–09:30 ET) is an optional read-only follow-up after PUSH |
| Backlog | **none** (audit correction batch). No `BACKLOG.md` edit |
| Baseline / start (§TS) | Starts **after `market-data-resilience-1` has LANDed, been pushed and cleaned up** (same file). At the task-start tip T, Bootstrap checks: <ol><li>in `netlify/functions/market-data.js`, these two lines each occur exactly once: `      _session      = getEtSession();` and `      _needsOverlay = _session === 'PRE' \|\| _session === 'POST';`;</li><li>`qa/ath_isolation_offline.js` `BASE_PINS['netlify/functions/market-data.js']` equals the LF sha256 of `market-data.js` at T (i.e. the predecessor re-pinned it);</li><li>`qa/market_data_live_offline.js` PASSes at T.</li></ol> Any failure → STOP, return to COWORK (re-sweep, no redesign) |
| Branch / slot | `task/tase-session-overlay-1`, **Worker B** |
| Mode | **Manual** (server behaviour) |
| qa:offline | step-0 count **+1** (`qa/tase_session_overlay_offline.js`) |
| Parallel with | `display-honesty-1` (Worker A): **no shared file**. One heavy run at a time (AGENTS process check) |

## §1 Files (exactly)

- `netlify/functions/market-data.js` — **only** the two §2 lines in the daily branch
- `qa/tase_session_overlay_offline.js` (new)
- `qa/ath_isolation_offline.js` — **only** the `BASE_PINS` value for `netlify/functions/market-data.js` (expected RED, AR-7i)
- `work/tase-session-overlay-1/review.md`

**Forbidden:**
- `index.html`;
- `qa/market_data_live_offline.js`;
- any other `netlify/**` file, and no new function file;
- the budget logic (`takeLiveBudget`): its PRE / POST 2-unit count for `1d` / `5d` stays as is. It over-counts by one for `.TA` in those windows, which is conservative and out of scope;
- `qa/run-offline.js`, `package*.json`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `BACKLOG.md`.

## §2 Exact change (daily branch)

| # | Rule |
|---|---|
| T-1 | `_needsOverlay` is true only when the session is PRE or POST **and** the symbol does not match `/\.TA$/i` |
| T-2 | The daily branch reads the ET session from `event._testClock.nowMs` when it is a finite number (the same validation `takeLiveBudget` uses), else real time. Behaviour without the hook is unchanged |
| T-3 | Unchanged: the historical branch, `purpose` / gate / budget, response bodies and status codes, the overlay itself for US symbols, `deriveExtendedOverlay`, `fetchYahooIntraday`, every planted-negative anchor of `qa/market_data_live_offline.js` (`polygonAllowed`, `isDailyPriceRange`, the budget guard block, `if (_mainRes.status === 'fulfilled' && _mainRes.value) {`) |

## §3 QA — new suite `qa/tase_session_overlay_offline.js`

Same harness style as `market_data_live_offline`: in-process handler, a fetch spy that throws on unknown hosts, injected `_testClock`.

| Row | Assertion |
|---|---|
| TS-1 | US `AAPL`, PRE (a weekday 06:00 ET) → exactly one intraday request; `meta.marketState === 'PRE'`; `preMarketPrice` present (unchanged behaviour) |
| TS-2 | `MTRX.TA`, PRE → **zero** intraday requests; status 200; no `marketState`, `preMarketPrice` or `preMarketChangePercent` |
| TS-3 | `MTRX.TA`, POST (17:00 ET) → zero intraday requests; no `postMarketPrice` |
| TS-4 | `BRK.B` (dot-class US share), PRE → overlay as for `AAPL` |
| TS-5 | REGULAR / CLOSED, any symbol → zero intraday requests (unchanged) |
| TS-6 | `.ta` lower case → treated like `.TA` |
| TS-N1 / N2 | planted negatives on a mutated copy (each anchor exactly once), each must fail: <ul><li>`.TA` exclusion removed → TS-2;</li><li>regex widened to any dotted symbol → TS-4</li></ul> |

**Must stay green:** `node qa/market_data_live_offline.js` (unchanged file) and `node qa/market_data_resilience_offline.js` (the predecessor's suite).

## §4 Expected RED

`qa/ath_isolation_offline.js` **AR-7i** fails only on `market-data.js`. Fix: the one-value re-pin to the new LF sha256, recorded in `review.md`.

## §5 Steps

| Step | Action |
|---|---|
| 0 | §TS; process check → step-0 `qa:offline`; `plan.md` |
| S1 RED | write the suite; TS-2, TS-3 and TS-6 fail on the current source; record |
| S2 GREEN | T-1, T-2; the AR-7i re-pin; all TS rows + negatives pass; `market_data_live_offline` and `market_data_resilience_offline` pass |
| 8 | Codex round one |
| 10 | process check → full `qa:offline` PASS at step 0 + 1 |
| 11–13 | `review.md` (L9 line, plus the optional H-3 DEV follow-up: read `marketState` for a `.TA` symbol during 04:00–09:30 ET), final Codex, step-13 commit, integrity |
| LAND / PUSH | usual R12 |

**STOP only for:**
- a change outside §1 / §2;
- a needed change to the budget or the historical branch;
- a denied protected action or an integrity FAIL.

## §6 Definition of Done

1. TS-1…TS-6 and TS-N1 / N2 pass.
2. `market_data_live_offline` and `market_data_resilience_offline` pass.
3. AR-7i passes after the re-pin.
4. Step 10 PASS at step 0 + 1.
5. Codex: no unresolved Class I.

## §CMD Command card (one command per Bash call; Bash tool only)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
git rev-parse HEAD:netlify/functions/market-data.js
node qa/guard_integrity_check.js --task task/tase-session-overlay-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/tase_session_overlay_offline.js
node qa/market_data_live_offline.js
node qa/market_data_resilience_offline.js
node qa/ath_isolation_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/tase-session-overlay-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/tase-session-overlay-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (prompts):** `git add <explicit §1 paths>`; one read-only process listing before each heavy run; `codex exec --sandbox read-only <prompt>`.
- **C (Owner):** R11; LAND; PUSH.

<!-- land-scope:begin -->
netlify/functions/market-data.js
qa/tase_session_overlay_offline.js
qa/ath_isolation_offline.js
work/tase-session-overlay-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/tase_session_overlay_offline.js
node qa/market_data_live_offline.js
node qa/market_data_resilience_offline.js
node qa/ath_isolation_offline.js
<!-- land-tests:end -->
