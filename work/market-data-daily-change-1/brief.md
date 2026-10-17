# Task brief: market-data-daily-change-1 (V-1) — the daily change belongs to the session of the price

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL-DRAFT rev 1.1 — pre-R11 Codex review complete and triaged under C+ (S rulings recorded in §6, W findings in §W, M corrections applied); ready for the Owner's R11** (COWORK draft; Bootstrap M revision, 2026-10-17). Built on `branch-dev` = `1b48971` (`origin/branch-dev` = `6f094f5`; `1b48971` adds only `work/evidence-memory-1-s2/brief.md`). Main Control **D-26** (2026-10-17): V-1 before `evidence-capture-1` in lane A, high-priority data integrity. First brief under the **C+ review workflow** (§C+). **D-27** (§6) and the two S rulings (S-1c, S-6) are recorded as ruled by Main Control (2026-10-17). **Pre-R11 Codex review:** done, the one review C+ allows (`shared-reports/codex/2026-10-17_market-data-daily-change-1-review.md`, "Rev 1 — verdict"); no further pre-R11 review. **Remaining:** the Owner's R11. The appendices (§A1–§A3) are unchanged from the reviewed text.

| | |
|---|---|
| Problem (DEV validation 2026-10-17, `C:/Users/Owner/Documents/Project/shared-reports/deploy/2026-10-17_final-dev-volatile-session-validation.md` (outside the repository)) | After the close, Yahoo's daily candle for the current session has `close: null` until it is finalised. `fetchYahoo` takes the **last two non-null closes**, so the "verified" change is the **previous day's move** and "Prev Close" is **two sessions back**, while the price is today's. Observed on all four scanned tickers: PLTR −0.23 % (true −7.22 %), FOXF +5.84 % (−13.30 %), AA +0.85 % (+2.55 %), CRWV +5.94 % (−11.91 %). The AI repeated the wrong figures ("FOXF down 5.84 %", "CRWV collapsed 5.94 %"), and the existing ±5 % score-override guard in `orchestrate` never saw PLTR's real −7.22 % (card 68 / positive). Two more silent substitutions exist in the same block: the range-start `chartPreviousClose` fallback (five sessions back) and a default **+0 %** when nothing is known |
| Objective | Price, previous close, daily change and session dates always refer to the **same pair of sessions**; when the previous session's close is not known, the change is **unknown** — never a substituted value |
| Source | DEV validation (above, §3 root cause); Bootstrap's independent closes for MSTR / MRNA / ARM / IGV (`shared-reports/deploy/2026-10-17_final-dev-volatile-session-validation-plan.md` §2a); the governed calendar `TS1_POLICY_V1.calendar` (US, TASE: week rules, holidays, coverage) |
| Decisions | D-26 (priority). **D-27** (§6): scope (`fetchYahoo` only; `_pfLiveNormalize` → V-1b), the corrected change reaching the existing ±5 % score guard, the existing Alpha Vantage fallback in the rare unknown case |
| Backlog | none. No `BACKLOG.md` edit |
| Depends on | nothing open |
| Baseline / start (§TS) | Start at the current tip T. Valid only if all hold; otherwise HOLD: <ul><li>`index.html` = `8b5e05da2642426ccad341ffbd783697d5d054e0` (every §A1 OLD block exactly once);</li><li>`qa/tase_units_offline.js` = `5bcb956c8e07a8e3d576164150b3c8714828e194`;</li><li>`qa/ai_request_hygiene_offline.js` = `18714a608c8a7894af6bcc369065ea73c8c3c7ac`;</li><li>`qa/fixtures/index-pins.json` = `a46b8b5e77f95f7b753108e5dd9226987d0d7a7e`;</li><li>`qa/lib/index-pins-core.js` = `a8ae73317d65aa43129b9fe41aa09f4c34d5e888`;</li><li>`qa/market_daily_change_offline.js` does not exist.</li></ul>Any tip on which all of these blobs match is valid |
| Branch / slot / mode | `task/market-data-daily-change-1` · **Worker A** · **Manual** (market-data correctness; changes the inputs of an existing score guard) |
| qa:offline | step-0 count **+1** (`qa/market_daily_change_offline.js`; 100 → 101 at `1b48971`; auto-discovered; the runner stays forbidden) |
| Parallel with | Worker B (`evidence-memory-1` S2: `services/`, `qa/` new files): no shared file. One heavy QA run at a time |
| Skills | none required |
| Scoring boundary | **No scoring code changes** (`orchestrate`, `enforceScoreConsistency`, `analyzeChunk` byte-identical; DC-12). The **inputs** become correct: the existing ±5 % override in `orchestrate` will fire where the true change crosses ±5 % (D-27b) |
| Gate verification | N/A: no new path, endpoint or I/O; the edit corrects values on the existing market-data path |

## §1 Files (exactly)

- `index.html` — three anchored edits (exact OLD / NEW: **§A1**): a new pure helper `_dailySessionChange` placed immediately before `fetchYahoo`; `fetchYahoo`'s daily-change block replaced by a call to it; three additive fields in `fetchYahoo`'s result (`sessionDate`, `prevSessionDate`, `dailyBasis`)
- `qa/fixtures/index-pins.json` — `node qa/tools/index-pins.js --update`; exactly **four** values change: `fileSha256`, `remainderSha256`, `functions.fetchYahoo`, and the added `functions._dailySessionChange`
- `qa/tase_units_offline.js` (blob `5bcb956c…`) and `qa/ai_request_hygiene_offline.js` (blob `18714a60…`) — **one line each**: the pinned `fetchYahoo` digest → `da826004…99d1` (**§A3**). Any other change to these suites is a STOP
- `qa/market_daily_change_offline.js` (new) — exact text **§A2**
- `work/market-data-daily-change-1/review.md`

**Forbidden:** every other function and line of `index.html` — in particular `_pfLiveNormalize` (V-1b), `isValidStockData`, `fetchStockData`, `fetchAlphaVantage`, `formatStockContext`, `orchestrate`, `enforceScoreConsistency`, `analyzeChunk`, `computeTechnicalSnapshot`, `_refreshPriceRow`, the `_ts1*` helpers and `TS1_POLICY_V1` (reused read-only); `netlify/**`; `qa/run-offline.js`; every other `qa/` file; `package*.json`; `.claude/**`; `AGENTS.md`; `CLAUDE.md`; `BACKLOG.md`.

## §1a Consumer sweep (every reader of `change_percent`, `previous_close`, the new fields)

| Reader | Effect | Assertion |
|---|---|---|
| `isValidStockData` (the validity gate in `fetchStockData`) | unchanged; an **unknown** change (`null`) now fails it → the **existing** Alpha Vantage fallback (its own quote: Alpha Vantage's change and previous close come from its own quote basis, **not** from the Yahoo session dates of this contract) or "no market data". Only when the previous session's candle is missing / unpublished — not in the observed after-close case, where Thursday's close exists | DC-10 |
| `formatStockContext` → AI price block (`Price (chg)`, `Prev Close`) | now one consistent pair of sessions | DC-1 (values), unchanged function (DC-12) |
| `orchestrate` `_verifiedChangePct` / `_auditTrail.dayChange` → cards, Scan Results, Ticker Detail, portfolio card | correct daily change shown | values via DC-1; readers unchanged (DC-12) |
| `orchestrate` **±5 % score override** (`chg < −5 && score > 60 → ≤ 45, negative`; `chg > 5 && score < 40 → ≥ 55, positive`) | fires on the true change (PLTR would have been capped at 45) | scoring code byte-identical (DC-12); behaviour change acknowledged in **D-27b** |
| `_refreshPriceRow` → extended-hours cache `regularChangePct` | correct regular-session change in the price row | unchanged function (DC-12) |
| `computeTechnicalSnapshot` SPY / QQQ daily change (via `fetchStockData`) | corrected **when Yahoo returns a valid, aligned result**; when the change is unknown the existing route applies (Alpha Vantage fallback, otherwise no market data and no benchmark) | unchanged function (DC-12); fallback flow W3 |
| `orchestrate` `const chg = mkt?.change_percent ?? 0` (the value that feeds the ±5 % guard) | existing, **unchanged**; with no market data it means "no override" and `dayChange` stays `null` (`mkt?.change_percent ?? null`); with valid data it now receives the aligned change | readers unchanged (DC-12); W4 asserts the corrected value reaches the guard |
| Other readers of `change_percent` / `previous_close` (the `[PT] Market OK` console log, holdings / portfolio cards) | all read the `fetchYahoo` / Alpha Vantage result; they get the aligned value or the existing no-data route | listed; none changes |
| AI console log `[PT] Market OK: …%` | correct value | listed |
| New fields `sessionDate`, `prevSessionDate`, `dailyBasis` | **no reader yet** (labels for V-2 and the surface); additive, never persisted | DC-10 |
| `_pfLiveNormalize` (portfolio live prices, default-off gate) | **unchanged** — same defect class, separate task V-1b (`eod_packet_v0` RD-F1 relies on its `chartPreviousClose` fallback). **Surface still affected:** portfolio live prices, only when that default-off gate is enabled; the scan path, price row, and SPY / QQQ are corrected by this task. Follow-up: **V-1b** (Main Control D-27a); "out of scope" is a scoping decision, not a claim that the defect is harmless | DC-12 (byte-identical) |
| Suites pinning `fetchYahoo`: `tase_units` TU-8, `ai_request_hygiene` HY-11 | digest line updated (§A3) | sandbox PASS |
| Pin-map readers (`index_pins`, `no_synthetic_score`, `high1y_label`, `pulse_analyst_view`) | green after `--update` | sandbox PASS |
| Other market-data suites (`eod_packet_v0`, `tech_snapshot_cache`, `market_data_live`, `market_data_resilience`, `tase_session_overlay`) | do not run `fetchYahoo` (stubs / server code) | sandbox PASS |

## §2 Contract — session alignment (normative; exact code §A1)

| # | Rule |
|---|---|
| A-1 | **Price session** S = the exchange-local date of the **provider's** `regularMarketTime` (the price's own timestamp, **not** the scan's wall-clock time: a Saturday scan sees Friday's `regularMarketTime`, so S = Friday). Time zone: the governed calendar's zone when the market resolves (`_ts1ResolveMarket`: US `America/New_York`, TASE `Asia/Jerusalem`, `.TA` suffix fallback), otherwise the provider's `exchangeTimezoneName`; none → unknown |
| A-2 | **Previous session** S−1: if S lies in the calendar's coverage, the latest trading session before S per `_ts1IsTradingSession` (weekends, holidays, the TASE Mon–Fri week from 2026-01-04); a price stamped on a non-trading day → unknown; stepping out of coverage → unknown. Without a calendar (other markets, dates outside coverage): the latest daily candle dated before S. **Ruling S-1c (Main Control, 2026-10-17):** this candle basis is accepted only with `dailyBasis: 'candles'` explicit; it is **not** a verified previous-trading-session change (a missing candle can make it span more than one session), nothing may present it as one (the new fields have no reader yet; labelling belongs to V-2), and gaps between candles must be tested (W5) |
| A-3 | **Previous close** = the close of the daily candle whose exchange-local date is S−1; with several candles that date, the last one with a valid close **in array order**. **Candle dating convention:** a daily candle is dated by the exchange-local date of its own timestamp; verified 2026-10-17 for Yahoo daily charts — US candles are stamped 13:30 UTC (the 09:30 ET open) and TASE candles 06:30 UTC (`Asia/Jerusalem`) — both fall on the session's own local date. A provider that stamped daily bars at another time of day (e.g. UTC midnight) is outside this contract (risk R-5; W1 pins the verified convention) |
| A-4 | **Daily change** = (`regularMarketPrice` − previous close) / previous close × 100, 2 decimals. The current candle's close is never used |
| A-5 | **No substitution:** S or S−1 unknown, the S−1 candle missing, or its close `null` / not positive → previous close and change are `null`. Never an older candle, never `chartPreviousClose`, never "the last two non-null closes", never a default 0 |
| A-6 | **Unknown is visible:** `fetchYahoo` returns `change_percent: null`, `previous_close: null` and logs one warning naming the symbol and both sessions; the existing validity gate then routes to the existing fallback |
| A-7 | `fetchYahoo` adds `sessionDate` (S), `prevSessionDate` (S−1) and `dailyBasis` (`calendar` / `candles` / `null`); every other field is unchanged; `.TA` values stay in provider units (agorot) |
| A-8 | `_dailySessionChange` is pure (its arguments and the calendar constant only) and never throws |

**Session alignment table (what the user sees):**

| When the scan runs | Price | Previous close | Change |
|---|---|---|---|
| during the session | live price (S = today) | close of the previous trading session | today's move so far |
| after the close, today's candle not yet finalised (observed case) | today's close | previous session's close | today's move |
| after the close, finalised | today's close | previous session's close | today's move |
| weekend / holiday / pre-open (S is taken from the provider's price timestamp, not the scan's wall clock) | last session's close (S = last session) | the session before it | the last session's move (labelled by `sessionDate`) |
| previous session's close missing or unpublished | — | unknown | unknown → fallback provider or "no market data" |

## §3 QA — new suite `qa/market_daily_change_offline.js` (exact text §A2)

Runs the **real** `fetchYahoo`, `_dailySessionChange`, `isValidStockData`, the `_ts1*` helpers and `TS1_POLICY_V1` extracted from `index.html`, with a stubbed `fetchYahooChart`. Expected values come from §RT (written before the code) and from independent closes.

| Row | Checks |
|---|---|
| DC-1 | **the four observed mismatches**, helper and end to end through `fetchYahoo`: PLTR −7.22 / 200.50, FOXF −13.30 / 18.50, AA +2.55 / 40.42, CRWV −11.91 / 69.69; sessions 2026-10-16 / 2026-10-15; never the old value |
| DC-2 | independent closes (MSTR −9.56, MRNA −7.82, ARM −6.94, IGV −4.80) |
| DC-3 | intraday: the price (188.00), not the live candle close (190.10) → −6.23 |
| DC-4 | after the close with the candle finalised; pre-market Monday (provider stamps Friday; a Monday candle without close) |
| DC-5 | 00:30 UTC Saturday = Friday ET; TASE 01:30 IDT; Australia/Sydney (candles stamped 23:00 UTC the previous UTC day, candle basis); US DST end 2026-11-02 |
| DC-6 | Tuesday after Labor Day → Friday; Friday after Thanksgiving (short session) → Wednesday; TASE Tuesday 2026-09-22 after two holidays and a weekend → Thursday 09-17; TASE and US Mondays → Friday |
| DC-7 | **no substitution:** Thursday candle absent; Thursday close `null`; only `chartPreviousClose` → all `null`; **200 seeded candle arrays** against an independent oracle (change vs Thursday or `null`) |
| DC-8 | no time stamp; price 0 / negative / NaN / text; no meta; price stamped on Saturday (Friday close present) → unknown; 2028 (outside coverage) → candle basis; no zone and no market → unknown |
| DC-9 | two Thursday candles: the last valid close; last one `null` → the earlier valid one |
| DC-10 | `fetchYahoo` result field by field (incl. `open` NaN kept, `timestamp`, `source`, the three new fields); unknown change → `null`, rejected by `isValidStockData`, exactly one warning naming symbol and session; no candles → `null`, never +0 % |
| DC-11 | `.TA` agorot payload: price stays 8884, previous close 8800, +0.95 |
| DC-12 | 18 protected functions byte-identical to the base (incl. `_pfLiveNormalize`, `orchestrate`, `isValidStockData`, the `_ts1*` helpers); the helper never throws on 8 hostile inputs |
| DC-N1…N8 | the old "last two non-null closes" · UTC date · older close substituted · `chartPreviousClose` fallback · candle close instead of price · calendar ignored · first duplicate wins · non-trading stamp accepted — each makes its named rows fail |

**COWORK sandbox preflight** (git archive of `1b48971`, Linux, node 22; edits from §A1 / §A3):
- New suite **12 / 12 rows, 8 / 8 negatives PASS** (≈ 0.4 s). Without the edit the suite cannot load the helper (RED); DC-N1 restores the old algorithm and makes DC-1 / DC-10 fail.
- `tase_units` 9 / 9, `ai_request_hygiene` 11 / 15, `index_pins`, `no_synthetic_score`, `high1y_label`, `pulse_analyst_view`, `eod_packet_v0`, `tech_snapshot_cache`, `market_data_live`, `market_data_resilience`, `tase_session_overlay` PASS; `index-pins --check` OK with exactly the four listed values.
- Full `run-offline`: **100 → 101 suites**, the **same 17** environment-only failing suites as the base; 187 files parse; Phase 3 PASS.

## §RT Risk & Test Design (spec-first matrix `risk-test-design.spec-first.md`, sha256 `f25a917e…3807`, written before the code)

**Task type:** market-data correctness + calendar / time-zone logic + financial values.

| Requirement | Failure mode | Test | Expected |
|---|---|---|---|
| A-3 / A-5 | the observed defect (current candle `null` after the close) | DC-1, DC-N1 | Thursday's close; Friday's move |
| A-3 | other names wrong | DC-2 | independent closes reproduced |
| A-4 | candle close used instead of the price | DC-3, DC-N5 | price-based |
| A-1 | UTC date instead of exchange-local | DC-5, DC-N2 | exchange-local S |
| A-2 | weekend / holiday / pre-open mis-stepped | DC-4, DC-6 | calendar's previous session |
| A-5 | **silent substitution** (older close, range-start close, +0 %) | DC-7, DC-10, DC-N3, DC-N4, DC-N6 | `null` |
| A-2 / A-5 | bad stamp, outside coverage, no zone | DC-8, DC-N8 | unknown / candle basis |
| A-3 | duplicate candles | DC-9, DC-N7 | last valid of that date |
| A-6 / A-7 | unknown passed on as data; fields changed | DC-10 | `null` + gate + warning; fields unchanged |
| A-7 | `.TA` converted | DC-11 | agorot kept |
| Scope / A-8 | other functions edited; helper throws | DC-12 | byte-identical; never throws |

**Self-review findings (before Codex):**
- A second producer has the same defect: `_pfLiveNormalize` (portfolio live prices). It is out of scope by construction (default-off gate; `eod_packet_v0` RD-F1 depends on its range-start fallback) → **V-1b**, D-27a.
- The old block had two further silent substitutions (range-start `chartPreviousClose`; default +0 %) — removed by the same rule (DC-7, DC-10).
- The ±5 % score-override guard is the materially affected consumer → D-27b.
- Suite errors found in my own draft, not in the code: `isValidStockData` returns a truthy value, not `true` (DC-10 check corrected); DC-1 tested only the helper, so the old-algorithm negative first went uncaught — DC-1 now also checks `fetchYahoo` end to end.

**Held-out probe** (not in the suite): an unchanged price → 0.00 (not unknown); daily candles stamped at 04:00 UTC (midnight ET); weekend and pre-open; Juneteenth 2026-06-19 → Monday 06-22 uses Thursday 06-18; market from the `.TA` suffix alone — all as specified.

**Accepted limits:** the calendar covers 2025–2027 (later dates use the candle basis until the calendar is extended); markets other than US / TASE use the candle basis (a missing previous-session candle there cannot be detected — the latest earlier candle is used, labelled `dailyBasis: candles`).

## §C+ Review workflow (adopted 2026-10-17; this text is part of the approved brief)

- **Classification.** Bootstrap classifies every Codex finding: **S** specification / contract / scope / product decision → COWORK / Main Control; **W** implementation or test defect inside approved scope → the Worker after R11; **M** mechanical documentation / status / hash / reference correction → Bootstrap (recorded as an exact line diff with the new sha256 in the review record; the Owner's R11 line on the new hash is the acceptance). One initial pre-R11 Codex review; a focused re-review only for a substantive S change.
- **Appendix-amendment clause.** The appendices are the **reference implementation**. A W finding may be fixed by amending them **only inside the §1 files**, without touching §2 (contract), land-scope, land-tests, the protected digests of DC-12 or the pin set of §1. Closure needs RED / GREEN evidence including a **planted negative that fails on the appendix as given**; every delta is listed in `review.md` under "Appendix deltas" and its hunks get independent Codex verification. W fixes are made and verified in the step-8 / 9 loop, so step 12 stays a final check; a W finding first seen at step 12 that needs a second re-pass goes to the Owner at the step-13 STOP. **Bound (ruling S-6, Main Control, 2026-10-17):** "An amendment may not change the meaning of a §2 rule or weaken a test; any change to observable contract behaviour or acceptance criteria is an S change needing a revised brief and a focused review." Anything beyond this is an S finding.

### §W Known findings (required behaviour for the Worker)

Classified W by Bootstrap from the one pre-R11 Codex review (`shared-reports/codex/2026-10-17_market-data-daily-change-1-review.md`, "Rev 1 — verdict"). They are **required behaviour and tests, implemented by the Worker after R11** under the amendment clause above (appendix A2 is the reference suite; each delta is a new row / assertion or a stronger assertion, listed in `review.md` under "Appendix deltas", with RED / GREEN evidence including a planted negative that fails on the appendix as given, and independent Codex verification of the changed hunks). None changes §2, the code in §A1, land-scope, land-tests, the protected digests or the pin set. Existing rows DC-1…DC-12 and DC-N1…DC-N8 stay and keep passing.

- **W1 — timestamp convention.** Rows with daily candles stamped as Yahoo does (US 13:30 UTC, TASE 06:30 UTC) pin the verified convention (A-3); a case with UTC-midnight candles documents what the contract does with a different convention (assert the actual A1 result and label it out of contract).
- **W2 — duplicate and out-of-order candles.** Duplicate candles on one date resolve to the last valid close **in array order** (valid then null, null then valid, two valid); out-of-order arrays give the same result as the sorted array for distinct dates.
- **W3 — fallback flow (D-27c).** Drive `fetchStockData` with stubs: Yahoo returns the unknown (null change) result → Alpha Vantage is called and a valid Alpha Vantage result is accepted as that provider's own quote; Alpha Vantage fails → the function returns `null` (no market data). The two outcomes are asserted, not only the validity gate.
- **W4 — targeted assertions per requirement and per negative.** DC-5 / DC-7 / DC-8 / DC-9 / DC-10 each get an assertion that fails on a wrong implementation (not only on the planted mutation); DC-N6 ("calendar ignored") must be caught by a calendar-specific assertion; DC-N1 restores each old branch (last two non-null closes, the range-start `chartPreviousClose`, the default 0) so each is caught; `dailyBasis`, `sessionDate`, `prevSessionDate` and the warning text on the unknown paths are asserted; a corrected daily change reaches `orchestrate`'s ±5 % guard (assert it, or record in `review.md` that it is covered by review only).
- **W5 — gaps between candles (S-1c).** For a market without a calendar and for a date outside coverage: a missing candle between the price session and the latest earlier candle gives `dailyBasis: 'candles'` and the **older** candle's change, asserted explicitly as the accepted behaviour, never presented as `calendar`; a weekend / holiday date outside coverage is asserted.

## §4 Steps

| Step | Action |
|---|---|
| 0 | §TS; process check → step-0 `qa:offline`; `plan.md` (CLAUDE.md preflight: Pattern Auditing — the `_ts1*` calendar helpers and `TS1_POLICY_V1` (reused, not copied); `_pfSessionDateFor`'s exchange-local session date. State & Boundary Isolation — no `localStorage`, DOM or scoring-code change (DC-12). Gate Verification — N/A. Definition of Done — §5) |
| S1 RED | `qa/market_daily_change_offline.js` (§A2) fails: the helper is absent |
| S2 GREEN | §A1 edits; §A3 edits; `node qa/tools/index-pins.js --update` (exactly the four §1 values); all rows + negatives + must-stay-green pass |
| 8 | Codex round one (diff review) |
| 10 | process check → full `qa:offline` PASS at step 0 + 1 |
| 11–13 | `review.md` (L9, incl. "Appendix deltas" if any), final Codex, step-13 commit, integrity |
| LAND / PUSH | usual R12 |

**STOP only for:** a change outside §1 / §2; a suite change beyond §A3 (amendments of the **new** suite §A2 under §C+ / §W are not a STOP); a pin delta beyond the four listed values; any existing suite failing; a denied protected action or an integrity FAIL.

**After LAND (DEV, separate Owner approval):** one scan of 2 tickers **after the close** (e.g. Friday evening ET) — the change and previous close must match the reference quote (`regularMarketPrice` vs the previous session's close); no paid call beyond that scan.

## §5 Definition of Done

1. DC-1…DC-12 and DC-N1…DC-N8 pass; `tase_units` and `ai_request_hygiene` pass with the §A3 lines; `index-pins --check` OK; `qa:offline` PASS at step 0 + 1.
2. `fetchYahoo` returns a daily change and previous close of the same pair of sessions as the price, or `null` for both — never a substituted value; the result carries `sessionDate`, `prevSessionDate`, `dailyBasis`.
3. No file or function outside §1 changes (DC-12).
4. The §W assertions (W1–W5) are present in the suite, each with RED / GREEN evidence and the appendix deltas listed in `review.md` under "Appendix deltas".

## §6 Decisions for Main Control (D-27) and risks

| # | Decision | Recommendation |
|---|---|---|
| D-27a | Scope: `fetchYahoo` (scan path, price row, SPY / QQQ daily change) now; `_pfLiveNormalize` (portfolio live prices, default-off; same defect class) as follow-up **V-1b** with its own tests (its `chartPreviousClose` behaviour is relied on by `eod_packet_v0`) | approve |
| D-27b | Acknowledge: the corrected change reaches the **existing** ±5 % score-override guard in `orchestrate`, so some scores change (e.g. PLTR on 10-16: 68 / positive → ≤ 45 / negative). Scoring code is unchanged | acknowledge |
| D-27c | In the rare unknown case (previous session's close missing / unpublished), keep the existing route: Yahoo result invalid → Alpha Vantage fallback → otherwise "no market data" (rather than showing the Yahoo price with change `n/a`, which would need a wider validity / consumer change) | approve |

**Ruled by Main Control (2026-10-17):** **D-27a** approved (`_pfLiveNormalize` stays a separate follow-up **V-1b**; V-1 scope is not expanded); **D-27b** approved (score changes caused solely by the corrected daily market data are accepted; scoring formulas, thresholds and protected scoring code are not modified; regression evidence must show that only the corrected input changes the outcome — DC-12 byte-identity and W4); **D-27c** approved (when the required previous-session close is unavailable the existing alternate-provider fallback is preserved; never silently an older session, never a fabricated 0 %); **S-1c** — the candle basis for markets without a supported calendar is accepted with `dailyBasis: 'candles'` explicit, gaps tested (W5), and not presented as a verified previous-trading-session change; **S-6** — the amendment bound quoted verbatim in §C+.

| # | Risk | Control |
|---|---|---|
| R-1 | More Alpha Vantage fallbacks | only when the previous session's candle is missing / unpublished (not the observed case); measured on DEV after LAND |
| R-2 | Calendar ends 2027-12-31 | candle basis afterwards; extending the calendar is a known maintenance item |
| R-3 | Scores move where the true change crosses ±5 % | intended (D-27b) |
| R-4 | The AI still says "today" for a weekend scan | the new `sessionDate` makes a label possible; displaying it belongs with V-2 |
| R-5 | The provider changes how daily candles are stamped (e.g. UTC midnight), so a US candle would be dated one day early and the change could be taken against the wrong session without a null | the convention is verified for Yahoo US (13:30 UTC) and TASE (06:30 UTC) and stated in A-3; W1 pins it; a different convention is outside the contract and would be a new S decision |
| R-6 | For markets without a calendar (and dates outside coverage) a missing candle makes the candle-basis change span more than one session (S-1c) | accepted by Main Control; `dailyBasis: 'candles'` is explicit and never presented as verified; gaps tested (W5); no live exposure today (US and TASE are calendared to 2027-12-31) |

## §A Appendix — exact inputs the Worker needs (the reference implementation; see the amendment clause in §C+)

<!-- pep-lint:off -->
<!-- (text to apply with the Edit / Write tools, not commands) -->

### §A1 `index.html` — the three edits (Edit tool: replace each OLD, which occurs exactly once, with NEW; LF; literal text). Reference script: `evidence/v1-apply.py`

#### A1.1 — E-1 the new helper `_dailySessionChange` (inserted immediately before `fetchYahoo`; the OLD lines are kept at the end of NEW)

OLD (exactly once):

~~~~text
// Fetch daily price from Yahoo Finance — uses multi-proxy fallback via fetchYahooChart
async function fetchYahoo(symbol) {
~~~~

NEW:

~~~~text
// market-data-daily-change-1 (V-1): the daily change belongs to the session of the price.
// S   = exchange-local date of regularMarketTime (the price's session);
// S-1 = the previous trading session before S - per the governed calendar (TS1_POLICY_V1) when S is covered,
//       otherwise the latest daily candle dated before S;
// previous close = the close of the daily candle dated S-1 (the last valid one of that date);
// change = (regularMarketPrice - previous close) / previous close.
// If S or S-1 is unknown, or the S-1 candle is missing or has no close yet, previous close and change are null:
// never an older candle, never the range-start chartPreviousClose, never "the last two non-null closes".
// Pure: reads only its arguments and the calendar constant; never throws.
function _dailySessionChange(result, sym) {
  var out = { prevClose: null, changePct: null, sessionDate: null, prevSessionDate: null, basis: null };
  try {
    var meta = result && result.meta;
    if (!meta) return out;
    var price = parseFloat(meta.regularMarketPrice);
    var rmt = meta.regularMarketTime;
    if (!isFinite(price) || price <= 0 || typeof rmt !== 'number' || !isFinite(rmt)) return out;
    var mkt = _ts1ResolveMarket(meta.exchangeTimezoneName, sym);
    var cal = (mkt.market === 'US' || mkt.market === 'TASE') ? TS1_POLICY_V1.calendar[mkt.market] : null;
    var tz = cal ? cal.timeZone : ((typeof meta.exchangeTimezoneName === 'string' && meta.exchangeTimezoneName) ? meta.exchangeTimezoneName : null);
    if (!tz) return out;
    var localDate = function (epochSec) {
      var d = new Date(epochSec * 1000);
      if (isNaN(d.getTime())) return null;
      var p = _ts1ExchangeLocalParts(d.toISOString(), tz);
      return p ? p.dateStr : null;
    };
    var sDate = localDate(rmt);
    if (!sDate) return out;
    out.sessionDate = sDate;
    // daily candles by exchange-local date; the last candle of a date with a valid close wins
    var ts = Array.isArray(result.timestamp) ? result.timestamp : [];
    var q = result.indicators && result.indicators.quote && result.indicators.quote[0];
    var closes = (q && Array.isArray(q.close)) ? q.close : [];
    var byDate = {};
    for (var i = 0; i < ts.length; i++) {
      if (typeof ts[i] !== 'number' || !isFinite(ts[i])) continue;
      var cd = localDate(ts[i]);
      if (!cd) continue;
      var c = closes[i];
      if (typeof c === 'number' && isFinite(c) && c > 0) byDate[cd] = c;
      else if (!Object.prototype.hasOwnProperty.call(byDate, cd)) byDate[cd] = null;
    }
    var prevDate = null, basis = null;
    var inCal = cal ? _ts1IsTradingSession(sDate, cal) : null;
    if (inCal === false) return out;                       // a price stamped on a non-trading day: unknown
    if (inCal === true) {
      var cur = new Date(sDate + 'T00:00:00Z');
      for (var k = 0; k < 15; k++) {
        cur = new Date(cur.getTime() - 86400000);
        var ds = cur.toISOString().slice(0, 10);
        var isSession = _ts1IsTradingSession(ds, cal);
        if (isSession === null) break;                     // left the calendar's coverage: unknown
        if (isSession === true) { prevDate = ds; break; }
      }
      basis = 'calendar';
    } else {
      var earlier = Object.keys(byDate).filter(function (d) { return d < sDate; }).sort();
      prevDate = earlier.length ? earlier[earlier.length - 1] : null;
      basis = 'candles';
    }
    if (!prevDate) return out;
    out.prevSessionDate = prevDate;
    out.basis = basis;
    var pc = Object.prototype.hasOwnProperty.call(byDate, prevDate) ? byDate[prevDate] : null;
    if (typeof pc !== 'number' || !isFinite(pc) || pc <= 0) return out;   // missing or not yet published: unknown
    out.prevClose = pc;
    out.changePct = parseFloat(((price - pc) / pc * 100).toFixed(2));
    return out;
  } catch (e) {
    return { prevClose: null, changePct: null, sessionDate: null, prevSessionDate: null, basis: null };
  }
}

// Fetch daily price from Yahoo Finance — uses multi-proxy fallback via fetchYahooChart
async function fetchYahoo(symbol) {
~~~~

#### A1.2 — E-2 `fetchYahoo`: the daily-change block

OLD (exactly once):

~~~~text
  // ── Daily change from chart candles (most reliable across market states) ──
  let change_percent = 0;
  let previous_close = 0;

  const closes = result?.indicators?.quote?.[0]?.close || [];
  const validCloses = closes.filter(c => c !== null && !isNaN(c) && c > 0);

  if (validCloses.length >= 2) {
    // Use last two valid daily closes from the 5d candle array
    const prevClose  = validCloses[validCloses.length - 2];
    const lastClose  = validCloses[validCloses.length - 1];
    previous_close   = prevClose;
    change_percent   = parseFloat(((lastClose - prevClose) / prevClose * 100).toFixed(2));
  } else {
    // Last resort: try meta fields (may be absent in market-closed state)
    previous_close = parseFloat(meta.chartPreviousClose) || parseFloat(meta.previousClose) || 0;
    if (previous_close > 0 && previous_close !== price) {
      change_percent = parseFloat(((price - previous_close) / previous_close * 100).toFixed(2));
    } else {
      console.warn('[market-data] daily change fallback unavailable for ' + symbol);
    }
  }
~~~~

NEW:

~~~~text
  // ── Daily change of the price's own session (market-data-daily-change-1, V-1) ──
  // null when the previous session's close is not known: isValidStockData then rejects this result and the
  // existing Alpha Vantage fallback (or the "no market data" state) applies - never a substituted change.
  const _sess = _dailySessionChange(result, symbol);
  const change_percent = _sess.changePct;
  const previous_close = _sess.prevClose;
  if (change_percent === null) {
    console.warn('[market-data] daily change unknown for ' + symbol + ' (session ' + _sess.sessionDate +
      ', previous session ' + _sess.prevSessionDate + ' close not available)');
  }
~~~~

#### A1.3 — E-3 `fetchYahoo`: three additive result fields

OLD (exactly once):

~~~~text
    source:         'yahoo',
    ...(_extMs     !== null ? { marketState: _extMs }                                                       : {}),
~~~~

NEW:

~~~~text
    source:         'yahoo',
    sessionDate:     _sess.sessionDate,
    prevSessionDate: _sess.prevSessionDate,
    dailyBasis:      _sess.basis,
    ...(_extMs     !== null ? { marketState: _extMs }                                                       : {}),
~~~~

### §A2 `qa/market_daily_change_offline.js` (new; exact text, LF)

```js
#!/usr/bin/env node
'use strict';
/*
 * qa/market_daily_change_offline.js - market-data-daily-change-1 (V-1; Main Control D-26).
 *
 * The daily change belongs to the session of the price: S = exchange-local date of regularMarketTime; S-1 = the
 * previous trading session (governed calendar TS1_POLICY_V1 when S is covered, else the latest earlier candle);
 * previous close = the close of the candle dated S-1; change = (price - previous close) / previous close.
 * Unknown S-1 close -> previous close and change are null: never an older close, never chartPreviousClose.
 *
 * Rows are derived from the brief's spec-first matrix (risk-test-design.spec-first.md), written before the code;
 * expected values come from the requirements and from independent closes, never from the new code's output.
 * The REAL functions (fetchYahoo, _dailySessionChange, the calendar helpers and constant, isValidStockData) are
 * extracted from index.html and run with a stubbed fetchYahooChart. Pure Node: no network, no browser, no storage.
 *
 *   DC-1  the four observed mismatches (DEV 2026-10-17; Friday candle close null after the close)
 *   DC-2  independent closes collected before the change (MSTR, MRNA, ARM, IGV)
 *   DC-3  intraday: the price, not the current candle's close, is compared
 *   DC-4  after the close with the day's candle finalised; pre-market Monday (provider stamps Friday)
 *   DC-5  time zones: exchange-local dates (US late evening UTC rollover, TASE, a non-calendar zone, US DST end)
 *   DC-6  weekends and holidays per the calendar (US Labor Day, Thanksgiving; TASE holidays and Mon-Fri week)
 *   DC-7  NO SUBSTITUTION: previous-session candle missing / null / only chartPreviousClose -> null (and a property
 *         over 200 seeded candle arrays against an independent oracle)
 *   DC-8  inputs: no time stamp, bad price, no meta, price stamped on a non-trading day, outside calendar coverage
 *   DC-9  duplicate candles for one date: the last valid close of that date
 *   DC-10 fetchYahoo end to end: fields, unknown change -> null + invalid + one warning; other fields unchanged
 *   DC-11 .TA stays in provider units (agorot)
 *   DC-12 scope: protected functions byte-identical to the base; the helper never throws
 *   DC-N1..N8 planted negatives (each mutates index.html; its named rows must fail)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const core = require(path.join(ROOT, 'qa', 'lib', 'index-pins-core.js'));
const SRC = core.normalizeText(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

// digests at the base (1b48971 / 6f094f5): functions this task must not change
const BASE_DIGESTS = {
  orchestrate: '2e352b3f1d4739e8f98fb079ed3c3865115263e12dcdc53dda70350bebf97dfb',
  isValidStockData: 'c785375bd6be1f80594d5e581794e4c78a6a7fcc6eab18c9ca5512703348d828',
  fetchStockData: 'c3f2a021b72b9e6cf0ade43ad0ae7d9f316e64e9b6c6d3e9461cf1dc0542d752',
  fetchAlphaVantage: '506fc899c5f89a7d4150e04c316f80c2539afb1a0692d3ca388f8bd1ca446c2b',
  formatStockContext: '4833b20da3470692c54d183d185c2e83581a93a71c981a8fd75fba46d697abd0',
  _pfLiveNormalize: 'c9e3b362c10d3325df9417d99f9abb7f5aba1f7b4cb4dddc9954e4df1cc5b6f1',
  computeTechnicalSnapshot: '373e9290a82129cb1ec2ec053ceb5263e81159fc7acc8a589a91defad8d2fc9d',
  enforceScoreConsistency: '28a3a5cac29be9a0b61e854182caaa7cac2ed241fe847fd5b65e8e05a8cbfc60',
  analyzeChunk: 'e9303a0690a6fad433918ee02772dcc63e0ad9d65f431f4dd7ee007b3c9ea703',
  fetchYahooChart: '2a55af04a7a6d1eb8e82cbf97d16a8685ed0747a163023dce4c1a9946d75ce6c',
  _refreshPriceRow: 'a0462f9876be6093ba2fd4c37fc82f00cd650a4b821cb39c926e39f1fbbd12d4',
  _ts1ExchangeLocalParts: 'f38e324cb412a233add7493f6551064b596bbd8da328a52db54216745ad89f60',
  _ts1IsTradingSession: 'e955dd6cd8f27f5d1e771efdce6469e935f4c8be2fcfb81eac872980ae9292df',
  _ts1RuleFor: 'dd62a58b61a09de395243d1b18169289ea4ba443eb74e119eed40093d3fe1ef6',
  _ts1ResolveMarket: '88daede9f4b83a35bba2c5b674814a6df7dbed4854af98d2058fd9c9f270083f',
  _pfSessionDateFor: '3f3954a128f39a99c781a4bb8a53a7394a3b2dbc18d092784a2d6f25c8747731',
  runAnalysis: '1b20f27d19618e9e43e512aa20cb8c8c032b8262c60e57c57d29be906bd2b676',
  renderMainPanel: '61e663bf2e3a734df928a4a8f59e6cc01691782edd0e51467caa5baebdeaecd1'
};

function fnText(src, name) {
  const hit = core.extractFunctions(src).filter(f => f.name === name);
  if (hit.length !== 1) throw new Error(name + ' does not extract exactly once');
  return hit[0].text;
}
function varText(src, decl) {
  const st = src.indexOf(decl);
  if (st === -1 || src.indexOf(decl, st + 1) !== -1) throw new Error(decl + ' not found exactly once');
  const bi = src.indexOf('{', st); let d = 0;
  for (let i = bi; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(st, i + 1) + ';'; } }
  throw new Error('unbalanced ' + decl);
}
// Build the real functions in an isolated context; fetchYahooChart returns the queued payload.
function build(src) {
  const ctx = { console: { log() {}, warn(...a) { ctx.__warns.push(a.join(' ')); }, error() {} }, __warns: [], __payload: null };
  ctx.fetchYahooChart = async () => ctx.__payload;
  vm.createContext(ctx);
  const names = ['_ts1ExchangeLocalParts', '_ts1RuleFor', '_ts1IsTradingSession', '_ts1ResolveMarket', '_dailySessionChange', 'fetchYahoo', 'isValidStockData'];
  vm.runInContext(varText(src, 'var TS1_POLICY_V1 = {') + '\n' + names.map(n => fnText(src, n)).join('\n') +
    '\nthis.H = _dailySessionChange; this.Y = fetchYahoo; this.V = isValidStockData;', ctx);
  return ctx;
}
const ep = iso => Date.parse(iso) / 1000;
// payload: candles = [[isoTimestamp, close], ...]
function payload(o) {
  const meta = Object.assign({ symbol: o.sym || 'TST', regularMarketPrice: o.price, regularMarketTime: o.rmt === undefined ? undefined : ep(o.rmt),
    exchangeTimezoneName: o.tz === undefined ? 'America/New_York' : o.tz, chartPreviousClose: o.chartPrev, currency: o.currency || 'USD',
    regularMarketDayHigh: o.high, regularMarketDayLow: o.low, regularMarketVolume: o.vol }, o.meta || {});
  if (o.rmt === undefined) delete meta.regularMarketTime;
  if (o.tz === null) delete meta.exchangeTimezoneName;
  return { chart: { result: [{ meta: meta, timestamp: (o.candles || []).map(c => ep(c[0])), indicators: { quote: [{ close: (o.candles || []).map(c => c[1]) }] } }] } };
}
const R = (ctx, o) => ctx.H(payload(o).chart.result[0], o.sym || 'TST');
const WEEK = d => ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].map((day, i) => [day + 'T13:30:00Z', d[i]]);

// The four payloads as captured on DEV (2026-10-17 00:06 UTC; closes at the precision shown by the capture)
const OBS = {
  PLTR: { sym: 'PLTR', price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK([209.00, 208.67, 200.97, 200.50, null]), chartPrev: 209.05, high: 203.55, low: 184.45, vol: 33027354,
    want: { prev: 200.50, chg: -7.22, old: -0.23 } },
  FOXF: { sym: 'FOXF', price: 16.04, rmt: '2026-10-16T20:00:00Z', candles: WEEK([18.02, 17.97, 17.48, 18.50, null]), chartPrev: 18.05, high: 17.18, low: 15.00, vol: 2658741,
    want: { prev: 18.50, chg: -13.30, old: 5.84 } },
  AA: { sym: 'AA', price: 41.45, rmt: '2026-10-16T20:02:00Z', candles: WEEK([41.67, 41.49, 40.08, 40.42, null]), chartPrev: 42.2, high: 44.35, low: 41.08, vol: 13631448,
    want: { prev: 40.42, chg: 2.55, old: 0.85 } },
  CRWV: { sym: 'CRWV', price: 61.39, rmt: '2026-10-16T20:00:00Z', candles: WEEK([80.26, 77.81, 65.78, 69.69, null]), chartPrev: 82.08, high: 66.69, low: 59.90, vol: 94362732,
    want: { prev: 69.69, chg: -11.91, old: 5.94 } }
};
// Independent closes (Bootstrap, plan rev 3 section 2a; Yahoo quote / 5-minute data, collected before this change)
const IND = { MSTR: [151.29, 136.83, -9.56], MRNA: [236.50, 218.01, -7.82], ARM: [244.79, 227.80, -6.94], IGV: [109.60, 104.34, -4.80] };

async function rows(src, only) {
  const out = {};
  const want = id => !only || only.indexOf(id) !== -1;
  const ok = (id, cond, detail) => { if (!(id in out) || out[id] === true) out[id] = cond ? true : (detail || 'fail'); };
  const guard = async (id, fn) => { try { await fn(); } catch (e) { ok(id, false, 'threw: ' + (e && e.message)); } };
  const ctx = build(src);
  const same = (r, prev, chg, s, p, basis) => r.prevClose === prev && r.changePct === chg && (s === undefined || r.sessionDate === s) && (p === undefined || r.prevSessionDate === p) && (basis === undefined || r.basis === basis);

  if (want('DC-1')) await guard('DC-1', async () => {
    const bad = [];
    for (const t of Object.keys(OBS)) {
      const r = R(ctx, OBS[t]);
      if (!same(r, OBS[t].want.prev, OBS[t].want.chg, '2026-10-16', '2026-10-15', 'calendar')) bad.push(t + ' helper ' + JSON.stringify(r));
      // end to end: what fetchYahoo hands to the scan (the observed defect was in this output)
      ctx.__payload = payload(OBS[t]);
      const y = await ctx.Y(t);
      if (!(y.change_percent === OBS[t].want.chg && y.previous_close === OBS[t].want.prev && y.change_percent !== OBS[t].want.old)) bad.push(t + ' fetchYahoo ' + y.change_percent + ' / ' + y.previous_close);
    }
    ok('DC-1', bad.length === 0, JSON.stringify(bad));
  });

  if (want('DC-2')) await guard('DC-2', () => {
    const bad = [];
    for (const t of Object.keys(IND)) {
      const [prev, price, chg] = IND[t];
      const r = R(ctx, { sym: t, price: price, rmt: '2026-10-16T20:00:01Z', candles: WEEK([prev * 1.01, prev * 1.02, prev * 0.99, prev, null]) });
      if (!same(r, prev, chg, '2026-10-16', '2026-10-15')) bad.push(t + ' ' + JSON.stringify(r));
    }
    ok('DC-2', bad.length === 0, JSON.stringify(bad));
  });

  if (want('DC-3')) await guard('DC-3', () => {
    // 11:00 ET on Friday: Friday's candle carries a live close (190.10) that differs from the price (188.00)
    const r = R(ctx, { price: 188.00, rmt: '2026-10-16T15:00:00Z', candles: WEEK([209.00, 208.67, 200.97, 200.50, 190.10]) });
    ok('DC-3', same(r, 200.50, -6.23, '2026-10-16', '2026-10-15'), JSON.stringify(r));
  });

  if (want('DC-4')) await guard('DC-4', () => {
    const fin = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK([209.00, 208.67, 200.97, 200.50, 186.03]) });
    // pre-market Monday 08:00 ET: the provider still stamps Friday's regular session; a Monday candle with no close
    const pre = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK([209.00, 208.67, 200.97, 200.50, 186.03]).concat([['2026-10-19T13:30:00Z', null]]) });
    ok('DC-4', same(fin, 200.50, -7.22, '2026-10-16', '2026-10-15') && same(pre, 200.50, -7.22, '2026-10-16', '2026-10-15'), JSON.stringify([fin, pre]));
  });

  if (want('DC-5')) await guard('DC-5', () => {
    const bad = [];
    // 00:30 UTC Saturday = 20:30 ET Friday
    const late = R(ctx, { price: 186.03, rmt: '2026-10-17T00:30:00Z', candles: WEEK([209.00, 208.67, 200.97, 200.50, null]) });
    if (!same(late, 200.50, -7.22, '2026-10-16', '2026-10-15')) bad.push('US late ' + JSON.stringify(late));
    // TASE (Asia/Jerusalem): 22:30 UTC Thursday = 01:30 IDT Friday; candles stamped 07:00 UTC
    const tase = R(ctx, { sym: 'NXSN.TA', tz: 'Asia/Jerusalem', currency: 'ILA', price: 8884, rmt: '2026-10-15T22:30:00Z',
      candles: [['2026-10-14T07:00:00Z', 8700], ['2026-10-15T07:00:00Z', 8800], ['2026-10-16T07:00:00Z', null]] });
    if (!same(tase, 8800, 0.95, '2026-10-16', '2026-10-15', 'calendar')) bad.push('TASE ' + JSON.stringify(tase));
    // a zone without a governed calendar: candles stamped 23:00 UTC the previous UTC day are local next-day sessions
    const syd = R(ctx, { sym: 'XYZ.AX', tz: 'Australia/Sydney', price: 10.50, rmt: '2026-10-16T05:10:00Z',
      candles: [['2026-10-13T23:00:00Z', 9.80], ['2026-10-14T23:00:00Z', 10.00], ['2026-10-15T23:00:00Z', 10.40]] });
    if (!same(syd, 10.00, 5.00, '2026-10-16', '2026-10-15', 'candles')) bad.push('Sydney ' + JSON.stringify(syd));
    // US DST ended Sunday 2026-11-01: Monday candles at 14:30 UTC
    const dst = R(ctx, { price: 103, rmt: '2026-11-02T21:00:00Z', candles: [['2026-10-29T13:30:00Z', 99], ['2026-10-30T13:30:00Z', 100], ['2026-11-02T14:30:00Z', null]] });
    if (!same(dst, 100, 3.00, '2026-11-02', '2026-10-30', 'calendar')) bad.push('DST ' + JSON.stringify(dst));
    ok('DC-5', bad.length === 0, JSON.stringify(bad));
  });

  if (want('DC-6')) await guard('DC-6', () => {
    const bad = [];
    const labor = R(ctx, { price: 110, rmt: '2026-09-08T20:00:00Z', candles: [['2026-09-03T13:30:00Z', 95], ['2026-09-04T13:30:00Z', 100], ['2026-09-08T13:30:00Z', null]] });
    if (!same(labor, 100, 10.00, '2026-09-08', '2026-09-04')) bad.push('Labor Day ' + JSON.stringify(labor));
    const thanks = R(ctx, { price: 99, rmt: '2026-11-27T18:00:00Z', candles: [['2026-11-24T14:30:00Z', 90], ['2026-11-25T14:30:00Z', 100], ['2026-11-27T14:30:00Z', null]] });
    if (!same(thanks, 100, -1.00, '2026-11-27', '2026-11-25')) bad.push('Thanksgiving ' + JSON.stringify(thanks));
    // TASE: Tue 2026-09-22 after holidays 09-18 (Fri) and 09-21 (Mon) and the weekend -> previous session Thu 09-17
    const taseHol = R(ctx, { sym: 'NXSN.TA', tz: 'Asia/Jerusalem', price: 9000, rmt: '2026-09-22T14:00:00Z',
      candles: [['2026-09-16T07:00:00Z', 8000], ['2026-09-17T07:00:00Z', 8800], ['2026-09-22T07:00:00Z', null]] });
    if (!same(taseHol, 8800, 2.27, '2026-09-22', '2026-09-17')) bad.push('TASE holidays ' + JSON.stringify(taseHol));
    // TASE Monday after a weekend (Mon-Fri week since 2026-01-04)
    const taseMon = R(ctx, { sym: 'NXSN.TA', tz: 'Asia/Jerusalem', price: 9100, rmt: '2026-10-19T14:00:00Z',
      candles: [['2026-10-15T07:00:00Z', 8900], ['2026-10-16T07:00:00Z', 9000], ['2026-10-19T07:00:00Z', null]] });
    if (!same(taseMon, 9000, 1.11, '2026-10-19', '2026-10-16')) bad.push('TASE Monday ' + JSON.stringify(taseMon));
    const usMon = R(ctx, { price: 101, rmt: '2026-10-19T20:00:00Z', candles: WEEK([1, 1, 1, 99, 100]).concat([['2026-10-19T13:30:00Z', null]]) });
    if (!same(usMon, 100, 1.00, '2026-10-19', '2026-10-16')) bad.push('US Monday ' + JSON.stringify(usMon));
    ok('DC-6', bad.length === 0, JSON.stringify(bad));
  });

  if (want('DC-7')) await guard('DC-7', () => {
    const bad = [];
    const nul = r => r.prevClose === null && r.changePct === null;
    // Thursday candle absent: Wednesday's close must NOT stand in
    const absent = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: [['2026-10-12T13:30:00Z', 209], ['2026-10-13T13:30:00Z', 208.67], ['2026-10-14T13:30:00Z', 200.97], ['2026-10-16T13:30:00Z', null]] });
    if (!(nul(absent) && absent.prevSessionDate === '2026-10-15')) bad.push('absent ' + JSON.stringify(absent));
    const notYet = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK([209.00, 208.67, 200.97, null, null]) });
    if (!nul(notYet)) bad.push('null close ' + JSON.stringify(notYet));
    const onlyRange = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK([null, null, null, null, null]), chartPrev: 209.05 });
    if (!nul(onlyRange)) bad.push('chartPreviousClose ' + JSON.stringify(onlyRange));
    // property: 200 seeded candle arrays for the week of 10-12; independent oracle: the previous session of Fri 10-16
    // is Thu 10-15 (no US holiday that week), so the change is vs Thursday's close or unknown
    let seed = 11;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let n = 0; n < 200; n++) {
      const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].filter(() => rnd() > 0.25);
      const cs = days.map(d => [d + 'T13:30:00Z', rnd() < 0.3 ? null : Math.round((50 + rnd() * 100) * 100) / 100]);
      const price = Math.round((50 + rnd() * 100) * 100) / 100;
      const r = R(ctx, { price: price, rmt: '2026-10-16T20:00:00Z', candles: cs, chartPrev: 77.77 });
      const thu = cs.find(c => c[0].startsWith('2026-10-15'));
      const exp = thu && typeof thu[1] === 'number' ? parseFloat(((price - thu[1]) / thu[1] * 100).toFixed(2)) : null;
      if (r.changePct !== exp || r.prevClose !== (exp === null ? null : thu[1])) { bad.push('property #' + n + ' ' + JSON.stringify({ cs, price, r })); break; }
    }
    ok('DC-7', bad.length === 0, JSON.stringify(bad).slice(0, 600));
  });

  if (want('DC-8')) await guard('DC-8', () => {
    const bad = [];
    const allNull = r => r.prevClose === null && r.changePct === null;
    const base = { price: 186.03, candles: WEEK([209.00, 208.67, 200.97, 200.50, 186.03]) };
    const noTime = R(ctx, Object.assign({}, base, { rmt: undefined }));
    if (!(allNull(noTime) && noTime.sessionDate === null)) bad.push('no time ' + JSON.stringify(noTime));
    for (const p of [0, -5, NaN, 'x']) { const r = R(ctx, Object.assign({}, base, { price: p, rmt: '2026-10-16T20:00:00Z' })); if (!allNull(r)) bad.push('price ' + p); }
    const noMeta = ctx.H({ timestamp: [], indicators: {} }, 'TST');
    if (!allNull(noMeta)) bad.push('no meta');
    // a price stamped on Saturday 11:00 ET (calendar mode): unknown, even though Friday's close exists
    const sat = R(ctx, Object.assign({}, base, { rmt: '2026-10-17T15:00:00Z' }));
    if (!(allNull(sat) && sat.sessionDate === '2026-10-17')) bad.push('saturday ' + JSON.stringify(sat));
    // outside the calendar's coverage (2028): latest earlier candle
    const out = R(ctx, { price: 105, rmt: '2028-01-05T20:00:00Z', candles: [['2028-01-03T14:30:00Z', 90], ['2028-01-04T14:30:00Z', 100], ['2028-01-05T14:30:00Z', null]] });
    if (!same(out, 100, 5.00, '2028-01-05', '2028-01-04', 'candles')) bad.push('coverage ' + JSON.stringify(out));
    // no time zone and no market: unknown (never a guessed zone)
    const noTz = R(ctx, Object.assign({}, base, { rmt: '2026-10-16T20:00:00Z', tz: null }));
    if (!allNull(noTz)) bad.push('no tz ' + JSON.stringify(noTz));
    ok('DC-8', bad.length === 0, JSON.stringify(bad));
  });

  if (want('DC-9')) await guard('DC-9', () => {
    const two = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK([209, 208.67, 200.97, 200.10, null]).concat([['2026-10-15T19:59:00Z', 200.50]]).sort((a, b) => a[0] < b[0] ? -1 : 1) });
    const lastNull = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK([209, 208.67, 200.97, 200.10, null]).concat([['2026-10-15T19:59:00Z', null]]).sort((a, b) => a[0] < b[0] ? -1 : 1) });
    ok('DC-9', same(two, 200.50, -7.22) && same(lastNull, 200.10, -7.03), JSON.stringify([two, lastNull]));
  });

  if (want('DC-10')) await guard('DC-10', async () => {
    const bad = [];
    ctx.__payload = payload(OBS.PLTR); ctx.__warns = [];
    const y = await ctx.Y('PLTR');
    const exp = { symbol: 'PLTR', price: 186.03, change_percent: -7.22, previous_close: 200.50, high: 203.55, low: 184.45, volume: 33027354,
      timestamp: '2026-10-16T20:00:00.000Z', source: 'yahoo', sessionDate: '2026-10-16', prevSessionDate: '2026-10-15', dailyBasis: 'calendar' };
    for (const k of Object.keys(exp)) if (y[k] !== exp[k]) bad.push(k + '=' + y[k]);
    if (!Number.isNaN(y.open)) bad.push('open should stay NaN when the provider gives none');
    if (!ctx.V(y) || ctx.__warns.length !== 0) bad.push('valid / no warning');   // the gate returns a truthy value, not true
    // unknown change: null, invalid for the existing gate (-> the existing Alpha Vantage fallback), one named warning
    ctx.__payload = payload({ sym: 'PLTR', price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK([209.00, 208.67, 200.97, null, null]), chartPrev: 209.05, high: 1, low: 1, vol: 1 }); ctx.__warns = [];
    const u = await ctx.Y('PLTR');
    if (!(u.change_percent === null && u.previous_close === null && u.sessionDate === '2026-10-16' && u.prevSessionDate === '2026-10-15')) bad.push('unknown ' + JSON.stringify(u));
    if (ctx.V(u)) bad.push('unknown must fail isValidStockData');
    if (!(ctx.__warns.length === 1 && /PLTR/.test(ctx.__warns[0]) && /2026-10-15/.test(ctx.__warns[0]))) bad.push('warning ' + JSON.stringify(ctx.__warns));
    // never the old silent "+0 %": a payload with no candles at all
    ctx.__payload = payload({ sym: 'PLTR', price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: [], chartPrev: 209.05, high: 1, low: 1, vol: 1 });
    const z = await ctx.Y('PLTR');
    if (z.change_percent !== null) bad.push('no candles -> ' + z.change_percent);
    ok('DC-10', bad.length === 0, JSON.stringify(bad));
  });

  if (want('DC-11')) await guard('DC-11', async () => {
    ctx.__payload = payload({ sym: 'NXSN.TA', tz: 'Asia/Jerusalem', currency: 'ILA', price: 8884, rmt: '2026-10-16T10:50:00Z',
      candles: [['2026-10-14T07:00:00Z', 8700], ['2026-10-15T07:00:00Z', 8800], ['2026-10-16T07:00:00Z', null]], high: 8950, low: 8790, vol: 1234567 });
    const y = await ctx.Y('NXSN.TA');
    ok('DC-11', y.price === 8884 && y.previous_close === 8800 && y.change_percent === 0.95 && y.high === 8950, JSON.stringify(y));
  });

  if (want('DC-12')) await guard('DC-12', () => {
    const changed = Object.keys(BASE_DIGESTS).filter(n => { try { return sha(fnText(src, n)) !== BASE_DIGESTS[n]; } catch (e) { return true; } });
    const boom = () => { throw new Error('hostile'); };
    const hostile = [null, undefined, 1, 'x', [], {}, { meta: new Proxy({}, { get: boom }) },
      { meta: { regularMarketPrice: 1, regularMarketTime: 1 }, get timestamp() { throw new Error('t'); } }];
    const threw = [];
    for (const h of hostile) { try { const r = ctx.H(h, 'TST'); if (!r || r.changePct !== null) threw.push('shape'); } catch (e) { threw.push('threw'); } }
    ok('DC-12', changed.length === 0 && threw.length === 0, JSON.stringify({ changed, threw }));
  });
  return out;
}

// ---- planted negatives: each mutates index.html; the named rows must fail ----
const rep = (a, b) => s => { if (s.split(a).length !== 2) throw new Error('anchor not found exactly once: ' + a.slice(0, 70)); return s.replace(a, b); };
const NEW_BLOCK = '  const _sess = _dailySessionChange(result, symbol);\n  const change_percent = _sess.changePct;\n  const previous_close = _sess.prevClose;\n';
const OLD_BLOCK = '  const _sess = _dailySessionChange(result, symbol);\n' +
  '  let change_percent = 0;\n  let previous_close = 0;\n' +
  '  const closes = result?.indicators?.quote?.[0]?.close || [];\n' +
  '  const validCloses = closes.filter(c => c !== null && !isNaN(c) && c > 0);\n' +
  '  if (validCloses.length >= 2) {\n    previous_close = validCloses[validCloses.length - 2];\n' +
  '    change_percent = parseFloat(((validCloses[validCloses.length - 1] - previous_close) / previous_close * 100).toFixed(2));\n  }\n';
const NEG = [
  ['DC-N1 the old "last two non-null closes"', rep(NEW_BLOCK, OLD_BLOCK), ['DC-1', 'DC-10']],
  ['DC-N2 UTC date instead of the exchange-local date', rep('      var p = _ts1ExchangeLocalParts(d.toISOString(), tz);\n      return p ? p.dateStr : null;\n', '      return d.toISOString().slice(0, 10);\n'), ['DC-5']],
  ['DC-N3 an older close substituted when the previous session has none', rep('    var pc = Object.prototype.hasOwnProperty.call(byDate, prevDate) ? byDate[prevDate] : null;\n',
    '    var pc = null;\n    Object.keys(byDate).filter(function (d) { return d <= prevDate && byDate[d] !== null; }).sort().forEach(function (d) { pc = byDate[d]; });\n'), ['DC-7']],
  ['DC-N4 chartPreviousClose fallback restored', rep('    if (typeof pc !== \'number\' || !isFinite(pc) || pc <= 0) return out;   // missing or not yet published: unknown\n',
    '    if (typeof pc !== \'number\' || !isFinite(pc) || pc <= 0) pc = parseFloat(meta.chartPreviousClose);\n    if (!isFinite(pc) || pc <= 0) return out;\n'), ['DC-7']],
  ['DC-N5 the current candle close used instead of the price', rep('    out.changePct = parseFloat(((price - pc) / pc * 100).toFixed(2));\n',
    '    var lastC = (Object.prototype.hasOwnProperty.call(byDate, sDate) && byDate[sDate]) ? byDate[sDate] : price;\n    out.changePct = parseFloat(((lastC - pc) / pc * 100).toFixed(2));\n'), ['DC-3']],
  ['DC-N6 calendar ignored', rep('    var inCal = cal ? _ts1IsTradingSession(sDate, cal) : null;\n', '    var inCal = null;\n'), ['DC-7', 'DC-8']],
  ['DC-N7 the first candle of a date wins', rep('      if (typeof c === \'number\' && isFinite(c) && c > 0) byDate[cd] = c;\n', '      if (typeof c === \'number\' && isFinite(c) && c > 0) { if (!byDate[cd]) byDate[cd] = c; }\n'), ['DC-9']],
  ['DC-N8 a price stamped on a non-trading day accepted', rep('    if (inCal === false) return out;                       // a price stamped on a non-trading day: unknown\n', ''), ['DC-8']]
];

(async () => {
  const main = await rows(SRC);
  let fails = 0;
  for (const [id, v] of Object.entries(main)) { if (v !== true) fails++; console.log((v === true ? '  PASS  ' : '  FAIL  ') + id + (v === true ? '' : '  ' + v)); }
  for (const [name, mutate, wantFail] of NEG) {
    let r;
    try { r = await rows(mutate(SRC), wantFail); } catch (e) { fails++; console.log('  FAIL  ' + name + ': ' + e.message); continue; }
    const caught = wantFail.every(w => r[w] !== true);
    if (!caught) fails++;
    console.log((caught ? '  PASS  ' : '  FAIL  ') + 'negative ' + name + ' -> ' + wantFail.join(', ') + ' fail' + (caught ? '' : '  (' + wantFail.map(w => w + '=' + (r[w] === true ? 'pass' : 'fail')).join(' ') + ')'));
  }
  console.log(fails ? 'MARKET DAILY CHANGE OFFLINE: FAIL (' + fails + ')' : 'MARKET DAILY CHANGE OFFLINE: PASS (' + Object.keys(main).length + ' rows, ' + NEG.length + ' negatives)');
  process.exitCode = fails ? 1 : 0;
})();
```

### §A3 the two suite lines (Edit tool; each OLD exactly once; literal text). Reference script: `evidence/v1-suite-deltas.py`

#### A3.1 — pinned `fetchYahoo` digest

File: `qa/tase_units_offline.js`

OLD (exactly once):

~~~~text
  fetchYahoo: '03b4938ed74daaaa38444d8c458d01b7aa622923a49bb881450ce622320b751b',
~~~~

NEW:

~~~~text
  fetchYahoo: 'da826004e7de4edbcd086a8def36ed775f3f656e9117eb37957a662bf2a899d1',   // market-data-daily-change-1 (V-1): session-aligned daily change
~~~~

#### A3.2 — pinned `fetchYahoo` digest

File: `qa/ai_request_hygiene_offline.js`

OLD (exactly once):

~~~~text
  fetchYahoo: '03b4938ed74daaaa38444d8c458d01b7aa622923a49bb881450ce622320b751b',
~~~~

NEW:

~~~~text
  fetchYahoo: 'da826004e7de4edbcd086a8def36ed775f3f656e9117eb37957a662bf2a899d1',   // market-data-daily-change-1 (V-1): session-aligned daily change
~~~~

<!-- pep-lint:on -->

## §CMD Command card (one command per Bash call; Bash tool only)

    Command hygiene (three guard-sensitive patterns; a breach is a form denial or STOP-6 per AGENTS.md):
    1. One command per Bash call, exactly as listed below: no &&, ||, ;, pipes, redirects, cd, echo, loops or wrappers.
    2. The land tool's file name appears only in the exact lines of this card - never in a read-only command, a search, or a Codex prompt. Call it "the land tool"; inspect it with Read / Grep.
    3. No inline interpreter code (node -e / -p, python -c, perl -e) whose text contains "git" or "netlify", even in a string or comment. Use Read / Grep / Edit / Write or a listed command.

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
node qa/guard_integrity_check.js --task task/market-data-daily-change-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/market_daily_change_offline.js
node qa/tase_units_offline.js
node qa/ai_request_hygiene_offline.js
node qa/no_synthetic_score_offline.js
node qa/high1y_label_offline.js
node qa/pulse_analyst_view_offline.js
node qa/eod_packet_v0_offline.js
node qa/tools/index-pins.js --check
node qa/tools/index-pins.js --update
node qa/index_pins_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/market-data-daily-change-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/market-data-daily-change-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (prompts):** `git add <explicit §1 paths>`; the read-only process listing before each heavy run; `node qa/tools/index-pins.js --diff <base>`; `codex exec --sandbox read-only <prompt>`.
- **C (Owner):** R11; LAND; PUSH; the post-LAND DEV scan.

<!-- land-scope:begin -->
index.html
qa/fixtures/index-pins.json
qa/tase_units_offline.js
qa/ai_request_hygiene_offline.js
qa/market_daily_change_offline.js
work/market-data-daily-change-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/market_daily_change_offline.js
node qa/tase_units_offline.js
node qa/ai_request_hygiene_offline.js
node qa/no_synthetic_score_offline.js
node qa/high1y_label_offline.js
node qa/pulse_analyst_view_offline.js
node qa/eod_packet_v0_offline.js
node qa/index_pins_offline.js
<!-- land-tests:end -->
