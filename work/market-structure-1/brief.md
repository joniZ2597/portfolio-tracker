# Master Brief: market-structure-1 — pure market-structure engine (requirement C; feeds `compare-1` and entry 25 Layer A)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL, HELD** (COWORK, re-pinned 2026-10-12 at `b4ab2251e0664d496301385cc2335508e1a1bc27`, after `governance-update-2`; §RP). MS-1…MS-6 were ruled on 2026-10-12. It is placed only on Main Control's separate approval of this exact hash.

| | |
|---|---|
| Rulings | R-2 (lane-B order); **R-6 = MS-1…MS-6 APPROVED as planning defaults** (2026-10-12). **Descriptive and historical only:** no score, label, rating, Actionable Take, prompt or UI change. Output never presents a historical observation as an expected or guaranteed future outcome (§NF) |
| Backlog | none today (requirement C is roadmap-only). No `BACKLOG.md` edit; the R-9 refresh records it |
| Baseline | **`b4ab2251e0664d496301385cc2335508e1a1bc27`**; the brief-only commit adds only `work/market-structure-1/brief.md` on top of the then-current tip. **Valid only if** at that tip: (1) `services/market-structure.js` and `qa/market_structure_offline.js` are absent; (2) `function _ts1Atr14(candles, policy)` and `atr: { period: 14, minCandles: 15 }` each match exactly once in `index.html` (parity oracle); (3) `qa/run-offline.js` still auto-discovers `qa/*_offline.js` (W1). **All three hold at `b4ab225`.** If `ai-output-2` lands first, its files are disjoint; only the suite count and the base move. Otherwise HOLD and re-pin |
| Branch / slot | `task/market-structure-1`, **Worker B** (`pt-wt-worker-b`, detached at `b4ab225`) |
| Mode | **Auto**. Session: **attended Auto** — new files only, no persistence, no network, no protected path; permitted because GU-2 has landed and V1–V6 have passed (PQ-2). Unattended: not authorised. The Owner is present for the R12 prompts |
| qa:offline | step-0 count (**81** at `b4ab225`) → **+1** (`qa/market_structure_offline.js`) |
| Parallel with | Worker A on `ai-output-2` (no shared file: `index.html`, `BACKLOG.md` and the pin map are not touched here). **One heavy / forced run at a time** |

**Objective.** Add one pure library, `services/market-structure.js`. Given daily candles and an explicit `asOf` date, it describes:
- data sufficiency per horizon;
- ATR14 and the volatility regime;
- confirmed swings and the nearest support / resistance levels;
- the historical move / correction profile, with a minimum-sample gate.

It is **not wired** into `index.html` and has no fetch, no DOM, no storage, no clock and no randomness. Data acquisition and display belong to `compare-1`:
- client `range=5y` + trim for 3y (Yahoo has no `3y`; `rangeToDateWindow` already supports `5y`);
- `market-data.js` is **not** touched here.

## §P Placement conditions

1. `market-data-1` and `governance-update-2` LANDed, pushed and cleaned; V1–V6 PASS (**observed 2026-10-12**, `b4ab225`). Worker B detached and clean at the tip.
2. Canonical CLEAN; `work/market-structure-1/`, `task/market-structure-1` and its record are absent.
3. Baseline row holds.

## §RP Placement re-pin record (COWORK, read-only, 2026-10-12, `b4ab225`)

- **Moved since the sweep** (`105b9f9` → `b4ab225`): `market-data-1` (`market-data.js`, budget lib, `ath_isolation` server pin, new `market_data_live` suite), `governance-update-2` (`AGENTS.md`, settings, AH suite). `index.html` is byte-identical to `105b9f9`.
- **Baseline:** both new paths are absent; `_ts1Atr14` (line 1922) and the `policy.atr` line (1512) each match once; W1 auto-discovery is unchanged.
- **Phase-1 checks that will read the new file:** `run-offline` syntax-checks every `services/*.js` (`node --check`) and scans `services/` for token persistence. A pure module passes both. No suite enumerates `services/` for inlining.
- **Suite count:** 81.

## §D Open decisions

None.

## §R Ruled values (R-6 → MS-1…MS-6, APPROVED as planning defaults, 2026-10-12)

| ID | Value |
|---|---|
| MS-1 | ZigZag on highs / lows. A reversal confirms when price moves ≥ k × ATR14 (ATR at the running-extreme bar) against the running extreme; **k = 2.0** |
| MS-2 | Minimum comparable moves per type (up-legs / corrections) per horizon: **8**. Fewer → `INSUFFICIENT_SAMPLE`, with `n`, no percentiles |
| MS-3 | **1y = the last 252 sessions (needs ≥ 240); 3y = the last 756 (needs ≥ 720).** Any gap > 7 calendar days inside the window → `GAPPED` (reported, not fatal) |
| MS-4 | **P25 / P50 / P75 / P90, linear interpolation (Hyndman–Fan type 7)**, rounded to 0.1 % / 1 session |
| MS-5 | ATR14 % of close vs its own trailing-252 distribution: **LOW < P33, NORMAL, HIGH > P67**; < 120 values → `UNKNOWN` |
| MS-6 | Levels from confirmed swing pivots in the 1y window, **clustered within 0.5 × ATR14**; up to 3 below and 3 above the last close; each with touch count and last-touch date |

Tuning any value later is a new Owner ruling. A value found unworkable on fixtures is a STOP, never a silent change.

## §NF Non-forecast rule (Owner condition)

- The output carries `"basis": "HISTORICAL_DESCRIPTIVE"`.
- It has no key, value or text that predicts a target, probability, expected move or outcome: no `target`, `expected`, `forecast`, `probability` or `likely`.
- `current.context` keys describe position within past observations only.
- Consumers (`compare-1`) must show these as "historically observed", never as a forecast. This is recorded here for `compare-1`; it is not enforced in this task.

## §DEF Fixed definitions (not decisions)

| Item | Definition |
|---|---|
| ATR14 | `_ts1Atr14` semantics exactly: simple mean of the last 14 true ranges; null when < 15 candles. Parity-tested against the extracted `index.html` function |
| ATR series | the same definition evaluated at each bar (for MS-1 and MS-5) |
| Candle input | `{ date: 'YYYY-MM-DD', open, high, low, close, volume }`. Normalisation: sort ascending, drop exact duplicate dates (keep last), drop non-finite / non-positive OHLC or `high < low`, drop dates after `asOf`; counts reported in `input.dropped` |
| Legs | up-leg = confirmed low → confirmed high: `%` = high / low − 1, duration = sessions. Correction = high → low: `%` = low / high − 1 (negative). Only confirmed legs count; the open leg is reported separately as `current` |
| Current context | the open leg's % and sessions, plus its percentile rank within the matching historical profile (or `null` when the profile is insufficient). Descriptive text keys only, e.g. `'WITHIN_TYPICAL'` (≤ P75), `'EXTENDED'` (P75–P90), `'BEYOND_P90'` |

## §1 Slices (continuous; automatic continuation on PASS)

| Slice | Content | Rows |
|---|---|---|
| **S1 — input + sufficiency** | module skeleton (`'use strict'`; `module.exports` guarded as in `services/research-evidence-client.js`); `normalizeCandles`, `assessSufficiency(candles, asOf)` | MS-T1…MS-T4 |
| **S2 — volatility, swings, levels** | `atrSeries`, `atr14` (parity), `volatilityRegime`, `zigzagSwings`, `levels` | MS-T5…MS-T10 |
| **S3 — move profile + public entry** | `moveProfile`, `currentLeg`, `analyzeMarketStructure(candles, { asOf })` → the §DoD shape; freeze the exports list | MS-T11…MS-T17 |

**§2 Continuation (no Owner gate between slices).** Continue when all of these hold:
- targeted tests and land-tests PASS;
- the diff touches only §Y files;
- Codex has no unresolved Class I (one scoped re-pass);
- the next entry condition holds.

**Program STOP:**
- any unexpected suite failure;
- any edit outside §Y;
- a §R value found unworkable on fixtures (a new Owner decision);
- any network / env / Blob / Netlify action;
- any ASK / DENY / protected path;
- a second heavy run.

## §T Tests — new `qa/market_structure_offline.js`

Pure Node. Deterministic synthetic candle generators live inside the suite: seeded LCG, fixed start date, **no fixture files**. Every row has a planted negative.

| ID | Assertion |
|---|---|
| MS-T1 | Normalisation: unsorted / duplicate / invalid / future-dated rows handled as §DEF; `dropped` counts exact |
| MS-T2 | Sufficiency: 239 / 240 / 719 / 720 sessions at the boundaries (MS-3); a 10-day hole → `GAPPED` |
| MS-T3 | 3y from a 5y series: trimmed by `asOf` to exactly the last 756 sessions |
| MS-T4 | Purity: the module source has no `fetch`, `XMLHttpRequest`, `localStorage`, `indexedDB`, `document`, `window.`, `Date.now`, `new Date()` without an argument, `Math.random` or `require(`; loads standalone |
| MS-T5 | ATR14 parity with the extracted `_ts1Atr14` + `policy.atr` on 5 generated series (exact equality); `< 15` → null |
| MS-T6 | Regime boundaries (P33 / P67) and `UNKNOWN` below 120 values |
| MS-T7 | ZigZag on a hand-built zig-zag series: exact pivot dates / prices; a sub-threshold wiggle produces no pivot |
| MS-T8 | Alternation: pivots strictly alternate high / low; the last open extreme is not confirmed |
| MS-T9 | Levels: clustering at 0.5 × ATR; ≤ 3 per side; ordering by distance; touch counts |
| MS-T10 | Flat / constant series: no swings, no levels, no crash; explicit empty states |
| MS-T11 | Profile percentiles (type 7) equal hand-computed values on a known leg set |
| MS-T12 | Minimum sample: 7 legs → `INSUFFICIENT_SAMPLE` with `n`, no percentiles; 8 → percentiles |
| MS-T13 | Current leg: % / sessions / rank and the three context keys at their boundaries |
| MS-T14 | Public output equals the §DoD shape exactly (key set and order, types); unknown keys fail |
| MS-T15 | Determinism: two runs, byte-identical `JSON.stringify` |
| MS-T16 | Isolation: `index.html`, `netlify/functions/market-data.js` and `qa/run-offline.js` are byte-identical to the base |
| MS-T17 | §NF: `basis` present; a recursive scan of the output keys and string values finds no `target` / `expected` / `forecast` / `probability` / `likely`; planted negative: a stub adding `expectedMove` is rejected |

**Must pass unmodified:** `qa/ath_isolation_offline.js`, `qa/market_data_live_offline.js`, `qa/no_synthetic_score_offline.js`, `qa/research_evidence_client_adapter_test.js`, the run-offline Tech Score phase (`_ts1Atr14` user).

## §DoD Public output (strict QA benchmark)

```json
{
  "schema": "market-structure/v1",
  "basis": "HISTORICAL_DESCRIPTIVE",
  "asOf": "YYYY-MM-DD",
  "input": { "sessions": 0, "firstDate": "YYYY-MM-DD", "lastDate": "YYYY-MM-DD", "dropped": { "invalid": 0, "duplicate": 0, "future": 0 } },
  "sufficiency": { "h1y": "OK|INSUFFICIENT|GAPPED", "h3y": "OK|INSUFFICIENT|GAPPED", "sessions1y": 0, "sessions3y": 0 },
  "volatility": { "atr14": 0.0, "atrPct": 0.0, "regime": "LOW|NORMAL|HIGH|UNKNOWN" },
  "swings": { "k": 2.0, "pivots": [ { "date": "YYYY-MM-DD", "type": "HIGH|LOW", "price": 0.0 } ] },
  "levels": { "support": [ { "price": 0.0, "touches": 0, "lastTouch": "YYYY-MM-DD" } ], "resistance": [] },
  "profile": {
    "h1y": { "up": { "status": "OK|INSUFFICIENT_SAMPLE", "n": 0, "pct": { "p25": 0, "p50": 0, "p75": 0, "p90": 0 }, "sessions": { "p25": 0, "p50": 0, "p75": 0, "p90": 0 } }, "down": { "…": "same" } },
    "h3y": { "…": "same as h1y, or status INSUFFICIENT when sufficiency.h3y is INSUFFICIENT" }
  },
  "current": { "direction": "UP|DOWN|NONE", "pct": 0.0, "sessions": 0, "rank1y": null, "context": "WITHIN_TYPICAL|EXTENDED|BEYOND_P90|UNKNOWN" }
}
```

Missing data is always an explicit status. Numbers are never invented or defaulted.

## §PEP Execution preflight (GU-2 permission model)

| Step | Item | Class |
|---|---|---|
| all | land-test suites, `npm run qa:offline`, `git status / diff / show / log`, `git commit` (r9), `codex exec --sandbox read-only`, `sha256sum` / `ls` / `diff` / `cmp`, Read / Grep | **A** (allow-listed) |
| all | Write / Edit of the two new files in the slot | A (attended Auto) |
| S2 | the `_ts1Atr14` oracle is extracted from `index.html` inside the suite (no scratch file) | A |
| §L only | archive to `pt-work-artifacts/market-structure-1-s<k>/<UTC>/`, `git restore` | B (exceptional path) |
| close | `land-request` / `push-request` (A) · `land` / `push` (**ask**: always prompt) | **C: R11 brief record · R12 LAND · R12 PUSH** (heavy-lane go-ahead only if a forced replay is due, E1-D7, from 2026-10-18) |
| never | `curl` / `wget` / `WebFetch` / `netlify env:*` (ask), `git push` / merge / protected writes (hook) | not needed; their appearance is a STOP |

- **Expected prompts:** the two R12 verbs only.
- **Continuation:** no Owner input between slices.
- The Worker reads nothing outside its slot.

## §UER Execution readiness: **ATTENDED-ONLY**

GU-2's `ask` rules and bypass-disable are in force. T6, approval-record forgery, scripted network transfer and secret access through files are not technically mitigated (A4 prerequisites open).

## §ET Execution-time tracking (ET-1; non-blocking, no gate)

- **Estimate:** Worker ≈ 3–4 h (S1 ≈ 0.75 h, S2 ≈ 1.5 h, S3 ≈ 1.25 h); step 0 and step 10 ≈ 80 s each (digest-gated); task-start → cleanup ≈ 4–5 h including Owner gates.
- **Worker:** a `## Timing` table in `review.md` — step 0 start / end; each slice checkpoint; step 10 start / end; each Codex round; the `land-request` and `push-request` print times. `UNKNOWN` where not observed.
- **COWORK:** completes the table after cleanup from `.git/pt-task`, `pt-land-log` and commit author dates; separates Owner-gate waiting where both ends are evidenced; compares with the estimate.

## §X Closure

- Steps 0–13 run as usual; `review.md` carries `## Backlog reconciliation` (brief row `none` → action `none`), `## Timing` (§ET) and a LAND-EVIDENCE line.
- Codex: step 8 per slice on the real diff; step 12 final check. A Codex run inside `--sandbox read-only` that fails a real-repo row is judged against a run outside the sandbox before classifying (GU-2 lesson).
- Full `qa:offline`: count = step 0 + 1, PASS; four `E1 … SKIP` lines (AH `89e9b370f9fb`).

## §Y Files, land-scope, land-tests

```
services/market-structure.js        NEW (pure)
qa/market_structure_offline.js      NEW (MS-T1…MS-T17)
```

<!-- land-scope:begin -->
services/market-structure.js
qa/market_structure_offline.js
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/market_structure_offline.js
node qa/ath_isolation_offline.js
node qa/market_data_live_offline.js
node qa/no_synthetic_score_offline.js
node qa/research_evidence_client_adapter_test.js
<!-- land-tests:end -->

**Skills:** `pt-offline-suite` Required. `/plan` before S1.

**§L:** close at the last passed slice (M-4): archive first, reset only the unfinished slice.

**Effort:** small–medium (§ET; three slices; no `index.html`, no pin map).
