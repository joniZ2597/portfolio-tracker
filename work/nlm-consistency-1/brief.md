# Master Brief: nlm-consistency-1 — Pulse vs Analyst separation, ATH in the UI and AI context, narrative consistency warnings

This Master Brief has operational effect only when the Owner has approved these exact contents and the brief-only
commit records them unchanged. Everything it relies on is written below. Model: `_held-briefs/master-brief-model.md`
(M-1…M-5).

| | |
|---|---|
| Backlog | **S1:** new **Entry 37** "Separate Pulse's view from the analyst consensus (R-5)" — created and closed. **S2:** Entry 34 "1Y High vs true all-time high" — **close**. **S3:** Entry 14 "AI narrative validation" — **partial** (slice 1: deterministic checks K1–K6; the 8b gate lifted for this slice only, D9-4). `BACKLOG.md` is in the file set and land-scope |
| Baseline | **`1e4b773bb0262b62c1f12e1f612c288f45bbd792`** = `branch-dev` = `origin/branch-dev` (R-3 landed, pushed, cleaned); `main` = `origin/main` = `fbec2c1`. Anchors verified at `1e4b773` (§A) |
| Branch / slot | `task/nlm-consistency-1`, **Worker A** (detached, clean at `1e4b773`) |
| Mode | **Manual (attended)** — all three slices are Manual; `qa/run-offline.js` (ASK-tier) is in scope through the PROTECTED gate |
| qa:offline | step 0 **72** (83 discovered − 11 denylisted at `1e4b773`) → step 10 **75** (+`qa/pulse_analyst_view_offline.js`, `qa/ath_client_offline.js`, `qa/narrative_consistency_offline.js`). If `task-base-record` lands first, 73 → 76: "unchanged from the step-0 baseline + 3" is the rule |
| Parallel with | Worker B (`task-base-record`, then 3A-L): no shared file. One `index.html` task at a time; one full `qa:offline` at a time |
| Status | FINAL (2026-10-09) |

## §P Placement conditions (all hold at `1e4b773`)

1. R-3 LANDed, pushed and cleaned — **met** (`branch-dev` = `origin/branch-dev` = `1e4b773`; Worker A detached).
2. B2-auto LANDed and pushed (`ath-read-v2`, `ath-ensure` on `branch-dev`) — **met**.
3. §D empty — **met**.
4. Canonical checkout clean; Worker A free — **met** (read 2026-10-08 22:23 UTC). Re-checked at placement.
5. **Handoff:** if `task-base-record` has landed by then, Bootstrap runs `pt-land.js task-start` and the Worker uses the
   record form of step 13; otherwise the handoff carries the actual task base and start time.

## §D Open decisions

**None.** D5 / A1 / B1, D6, D-B4-1, D-B4-2 and D9 are ruled (§0).

## §0 Owner rulings (not reopened)

1. **R-5 — D5 / A1 / B1 (2026-10-07 / 08):**
   - dial = Pulse action / score only;
   - colour from the score band: ≥ 65 green, ≤ 40 red, otherwise the existing neutral / blue;
   - the text under the dial = the **existing** action rendering;
   - `Analyst view · <rating> · PT <target>` shown separately and neutral;
   - Pulse-labelled header chip;
   - no silent "Neutral" fallback;
   - grouping unchanged; **Pulse-only tie-breaking**; the "Rating" column renamed "Analyst";
   - the prompt `Rating:` keeps its meaning;
   - no new action wording.
2. **B4 — D6 + public read + automatic maintenance (2026-10-08):**
   - ATH is display + AI context only, never setup or score;
   - `*_near_ath` stays 1Y-High-based; never the 1Y High as ATH;
   - public read, no token or cookie;
   - the browser calls `ath-ensure` with the ticker only;
   - `stale-suspect` / `unresolved` / unavailable → no value.
3. **Master model M-1…M-5:** checkpoint commits; pre-authorised close at the last passed slice; gaps inside the
   program follow M-5 (§2).
4. **R-2 lesson:** no new top-level function referenced by `renderMainPanel`. **The only exception is S3's checker**,
   added to every render harness that executes the changed renderers (S3.4).
5. **D-B4-1 = A:** a default `window.PT_ENABLE_ATH_CLIENT = true` assignment (the 22a pattern). The check stays strict
   `=== true`. The server gates are the kill switch.
6. **D9:**
   - 1 = A, warn only;
   - 2 = K1–K6;
   - 3 = a "Consistency" line under the Actionable Take, and ⚠ counts in Scan Results / Daily Review;
   - 4 = Entry 14 slice 1, with the 8b gate lifted for this slice only;
   - 5 = no re-prompt;
   - 6 = no effect on score, action or grouping.
7. **B2-auto server contract (landed `50a7cac`; facts):**
   - **Requests:** `POST /.netlify/functions/ath-ensure {ticker}` and `POST /.netlify/functions/ath-read {ticker}`.
   - **OK body (`ath-read-v2`):** `{readContractVersion:'ath-read-v2', status:'OK', ticker, recordStatus:
     'verified'|'unresolved'|'stale-suspect', athValue, athDate, unit:'USD'|'ILA'|'ILS', currency:'USD'|'ILS', basis,
     method:'auto'|'operator', verifiedAt}`. `athValue` / `athDate` are non-null only for `verified`. `ath-ensure`
     adds `action` and `budget:'ok'|'exhausted'`.
   - **Non-OK statuses:** `DISABLED`, `NOT_AVAILABLE`, `DEGRADED`, `INVALID_TICKER`, `INVALID_JSON`,
     `INVALID_SUBMISSION`, `METHOD_NOT_ALLOWED`, `ERROR`.
   - **Server gates:** `PT_ENABLE_ATH_ENSURE_SERVER` / `PT_ENABLE_ATH_READ_SERVER` (`=== 'true'`).
   - **TASE prices** are displayed in ILS (agorot ÷ 100, P-2A, `index.html` ~:11193).
8. **D-B4-2 = A:**
   - verified ATH only → exactly one AI line `All-time high (verified): <value> <USD|ILS> (<date>)`;
   - unavailable / unresolved / under review → no ATH line in the AI context;
   - never the 1Y High;
   - distance in the UI only.

## §A Anchors at `1e4b773` (by name; line numbers indicative)

| Name | Line | Note |
|---|---|---|
| `buildTechSnapshotBlock` | 1124 | shared by the scan prompt (~:6569) and Deep Dive `_dd0RunCard` (~:13328) |
| `fetchAnthropicAnalysis` | 5993 | contains the `("ath" in these setup names …)` explainer — unchanged |
| `orchestrate` | 6172 | **not touched** |
| `analyzeChunk` | 6480 | R-3 fallback `sentiment_score: null` |
| `_ptScoreCmp` | 6911 | unchanged; the only sort key after S6 |
| `_srGroupResults` | 6954 | 5 groups since R-3 (`Analysis failed — rescan` last); `rRank` tie-break at :6955–6962 (removed by S6) |
| `_srRenderGrouped` | 6994 | row rating cell :7020–7021 |
| `openScanResultsOverlay` | 7172 | row rating cell :7219–7220 |
| `renderMainPanel` | 7956 | `rating` / `rCls` :7976–7978; `_dialColor` / `_dial` / `_dialHtml` :8312–8316; header chip :8378–8384; research row `Rating` :8534; R-3 Score row (null → `—`) |
| `_renderPortfolioPanel` | 9743 | ResearchView `resStEl` :10583; analyst chip `pf-res-rating` :10598–10604 |
| `runAnalysis` | 15475 | candidate prefetch site (S2) |
| `_isValidScanResult` | 15444 | R-3; unchanged |
| Static overlay header | ~16030 | `<th>Rating</th>` (S4 / S5 header, outside any function) |

## §1 Program, order, entry conditions

| Slice | Entry condition (checked by the Worker before it starts) |
|---|---|
| **S1 — R-5** | §P holds |
| **S2 — B4 client** | S1 checkpoint committed; `ath-read-v2` / `ath-ensure` present at the baseline |
| **S3 — R-6 checker** | S2 checkpoint committed |

## §2 Continuation, gaps and STOP

**Continue to the next slice automatically** only when all of these hold:
- the slice's targeted tests and listed re-pins PASS;
- Codex has no unresolved Class I finding;
- the next entry condition holds;
- the repo still matches §A.

**Gaps (M-5):** a gap is recorded in `review.md` `## Lessons` as `[backlog]` / `[design]` for the next Master — it is
not fixed here and does not STOP the program — when it:
- does not block the current slice's DoD;
- belongs to this lane / objective;
- needs no new Owner decision and no protected / live / env boundary;
- can be isolated.

A genuine boundary, or a gap that directly blocks the current DoD, is a STOP. Genuine boundaries are: a protected /
ASK / DENY path beyond §Y's protected-scope; a live / deploy / env action; an unresolved Owner decision; findings-only
investigation; an incompatible mode; another lane.

**Program STOP** (in addition to STOP-1..6 and each slice's STOP):
- an unexpected test failure (M4);
- an unresolved material Codex finding after its one scoped re-pass;
- a brief / repo mismatch;
- a new Owner decision;
- any protected path other than §Y's protected-scope entry;
- any live DEV action or environment change before LAND;
- an unmet entry condition.

## §3 Skills

| Skill | Required / Recommended | Slices |
|---|---|---|
| `pt-offline-suite` | **Required** | all: sweep, re-pins with revert proof, revert-chain tables, harness lists, planted negatives |
| `pt-ai-output-change` | **Required** | S1 `RATING_SUMMARY_RE` consumers; S2 the AI line and banned terms ("all-time" only with a verified value); S3 consumer map, proof that no AI text is altered |
| `browser-integrity-qa` | Recommended (COWORK, after push) | S1 / S3 DEV visual (stored results); S2 DEV check (one approved scan) |

`/plan` is mandatory, with the `CLAUDE.md` pre-flight checklist. **Gate verification:**
- S2: `window.PT_ENABLE_ATH_CLIENT === true` (client) and the server gates `PT_ENABLE_ATH_ENSURE_SERVER === 'true'` /
  `PT_ENABLE_ATH_READ_SERVER === 'true'`;
- S1 / S3: no gate (display-only).

## §S1 Slice 1 — R-5 Pulse vs Analyst

**S1.1 Requirements:**

| # | Function | After |
|---|---|---|
| S1 | `renderMainPanel` dial (`_dialColor`) | colour from the Pulse score band (local const); word = the existing action rendering (as the Action row, :8495: `_esc(item.action).replace(/_/g,' ')`); no action → no word |
| S2 | `renderMainPanel` header chip | Pulse-labelled chip with the same action rendering, coloured by the score band. `NEEDS REVIEW` / `DATA UNAVAILABLE` branches byte-identical |
| S3 | `renderMainPanel` research row (:8534) | `Analyst view │ <RATING> · PT <pt>` in neutral colour; omitted when no `Rating:` is parsed |
| S1b | `renderMainPanel` action block | one neutral line `Analyst view · <rating> · PT <target>` under the dial; omitted without a rating; `PT` uses the existing `pt` (`—` when unavailable) |
| S4 | `openScanResultsOverlay` cells (:7219) + overlay header (~:16030) | header "Analyst"; values neutral; `—` without a rating (no "Neutral" fallback) |
| S5 | `_srRenderGrouped` cells (:7020) | as S4 |
| S6 | `_srGroupResults` | sort = `_ptScoreCmp` only (stable; `rRank` removed); group membership unchanged, **including R-3's "Analysis failed — rescan" group** |
| S7 | `_renderPortfolioPanel` (:10598) | text `Analyst <rating>` in neutral colour; omitted without a rating |

- The score band is a local const in `renderMainPanel` (no new top-level function).
- R-3's null behaviour is kept: a null score → the dashed no-score dial, neutral, and no Pulse chip for a failed item
  (NS-10).

**S1.2 Files:**
- `index.html` (S1–S7);
- `qa/pulse_analyst_view_offline.js` (NEW);
- the S1.4 re-pins;
- `qa/run-offline.js` (Phase 13, through the PROTECTED gate — S1.4);
- `BACKLOG.md` (Entry 37 created and closed).

**S1.3 Tests — `qa/pulse_analyst_view_offline.js`** (real `index.html`, function extraction):

| ID | Requirement | Planted negative |
|---|---|---|
| PA-1 | dial / chip colour: 65 → green, 64 → blue, 41 → blue, 40 → red, null → the no-score style | colour from the analyst rating restored |
| PA-2 | MRNA-type (38, `hold_wait`, `Rating: Sell`) → red dial, "hold wait", neutral "Analyst view · SELL · PT $80" | dial word = SELL |
| PA-3 | ROK-type (62, `add_on_pullback`, `Rating: Neutral`) → blue dial, "add on pullback", neutral analyst line | analyst colour applied |
| PA-4 | no `Rating:` → no analyst line and no "Neutral" anywhere (S1b / S3 / S7 omitted; S4 / S5 `—`) | "Neutral" fallback restored |
| PA-5 | action text equals the Action row's existing rendering for every action enum value | a new label map |
| PA-6 | Daily Review membership identical to the pre-change function on a 20-ticker fixture with ties | a group rule changed |
| PA-7 | equal scores keep source order; a different analyst rating no longer reorders | `rRank` restored |
| PA-8 | Ranked order unchanged (`_ptScoreCmp`) | — |
| PA-9 | the prompt text and `RATING_SUMMARY_RE` byte-identical | prompt edited |
| PA-10 | header chip `NEEDS REVIEW` / `DATA UNAVAILABLE` branches byte-identical | branch changed |
| PA-11 | R-3's "Analysis failed — rescan" group and its membership unchanged; failed items show no dial / chip | failed group reordered |

**S1.4 Coupling / pins (sweep at `1e4b773`):**
- `vis_score_caliper` — `PROTECTED_FN_HASHES` (`renderMainPanel`, `_srGroupResults`, `_srRenderGrouped`): re-pin. Its
  dial expectation changes by design.
- `ts1_default_exposure` — TX-3 `BASE_HASHES.renderMainPanel`: re-pin.
- `tech_snapshot_cache` — `NEW_RM_*`, TC-10 chain (+ S1 table), TC-11, the dial expectation ("score 70, Rating: Buy →
  green" becomes score-band based); TC-13 / TC-15 must hold.
- `high1y_label` — layer 2 (`renderMainPanel`, `_srGroupResults`); layer 1 unchanged.
- `ma_stack_label` — MS-7 chain (+ S1 table), MS-8.
- `analyst_parser` — AP-14 `PIN_MASKED_FILE`.
- `ath_isolation` — AR-7i (whole `index.html`); AR-7f still holds.
- `no_synthetic_score` (R-3):
  - **NS-11** `ISOLATION_PINS._renderPortfolioPanel` (S7) and `PRE_MASKED_FIVE` (any `index.html` edit outside its
    five functions, here the overlay header): re-pin;
  - **NS-12** revert tables for `_srGroupResults` and `renderMainPanel`: extended with an S1 table applied before the
    R-3 table;
  - **NS-8** "non-failed membership identical to the pre-task function" compares **order** — re-baselined to
    membership (set) comparison by design (S6).
- `dh_ui_vocabulary` — UV anchors U7 / B2 and `FORBIDDEN_LINE_HASH[_renderPortfolioPanel]` must still hold (S7 adds no
  forbidden token). An edit → STOP.
- `scan_results_enrichment` — SE-3 computes from the real `_srGroupResults`; `SIDE` regex untouched.
- `ui_hygiene` — UH-6 (`renderMainPanel` has no `rsCls` / `const rs`) and UH-7 (no `localStorage.setItem` in
  `renderMainPanel`) must hold.
- **`qa/run-offline.js` Phase 13 (`phaseScoreContract`, ASK-tier, PROTECTED gate):** two `_srGroupResults` assertions
  encode the analyst tie-break that ruling B1 removes. They are flipped by design, the same pattern as Phase 13's own
  "SLICE-B flipped pin":
  - `'Strong Setup keeps the Buy -> Neutral -> Sell tie-break among equal scores', ids(groups[0]) === 'D,F,E'` →
    `'Strong Setup: equal scores keep source order (Pulse-only tie-break, R-5 B1)', ids(groups[0]) === 'D,E,F'`;
  - `'Watch: … rating tie-break preserved within each tier (H,A and G,C)', ids(groups[1]) === 'B,H,A,G,C'` →
    `'Watch: numeric first (40), then genuine zeros, then missing last — source order within each tier (A,H and C,G)', ids(groups[1]) === 'B,A,H,C,G'`.

  No other `run-offline.js` byte changes (T6 and the rest of Phase 13 unchanged). The Worker edits it in the slot
  (Manual, listed by path); it enters only through step 13a.

**S1.5 Evidence:** sweep table; PA results; re-pin ledger with revert proofs; the Phase 13 before / after lines; Codex
S1 ledger.

**S1.6 Rollback:** checkpoint **C1** `wip(nlm-consistency-1): slice 1 R-5 — checkpoint` (ordinary paths only; the
Phase 13 edit stays in the slot's working tree until step 13a).

**S1.7 Slice STOP:**
- a prompt or `RATING_SUMMARY_RE` change;
- new action wording;
- a group-membership change;
- a scoring, setup or persistence change;
- a `run-offline.js` change beyond the two lines above.

## §S2 Slice 2 — B4 ATH client

**S2.1 Requirements:**
- **Gate:** a default `window.PT_ENABLE_ATH_CLIENT = true`; strict `=== true` check.
- **Scan prefetch:**
  - `ath-ensure` per scanned ticker, body exactly `{ticker}`, concurrency ≤ 4, 12 s timeout, no retry;
  - results in a memory-only `_athCache`;
  - placed at the start of `analyzeChunk` or in `runAnalysis`, whichever has the smaller coupling (recorded in
    `plan.md`); **`orchestrate` untouched**.
- **Non-scan views:** `ath-read` once per ticker per page load (same cache).
- **Acceptance rule (one place):**
  - *verified* = `status === 'OK'`, `readContractVersion === 'ath-read-v2'`, `recordStatus === 'verified'`, `athValue`
    finite > 0, and `athDate` `YYYY-MM-DD`;
  - *under review* = `recordStatus === 'stale-suspect'`;
  - *unavailable* = everything else (incl. `DISABLED`, an error, a timeout, `budget: 'exhausted'` without a verified
    record);
  - `action` / `budget` are never displayed.
- **Units:** `unit 'ILA'` → value ÷ 100, as ILS. Record currency ≠ the ticker's displayed currency → *unavailable*.
- **Technical Setup row:**
  - *verified* → value · date · distance at the **displayed** price (B1 rule: 2 % "near", "at / above"; Entry 32);
  - *under review* → "ATH under review";
  - *unavailable* → "—";
  - never the 1Y High.
- **AI line (D-B4-2 = A):**
  - only for *verified*: `  All-time high (verified): <value> <USD|ILS> (<YYYY-MM-DD>)` appended to
    `buildTechSnapshotBlock`'s output (two-space indent, 2 decimals, after the unit rule);
  - no line otherwise;
  - no signature change;
  - the `_athCache` read must not throw where it is undefined (the HL-3, `tech_snapshot` and `deep_dive_v0`
    harnesses build the function alone);
  - Deep Dive inherits the line through the shared function; no other Deep Dive change.
- **Isolation:** no path into setup / score / `_techCache` / persistence; no web storage or URL use.

**S2.2 Files:**
- `index.html`;
- `qa/ath_client_offline.js` (NEW);
- the S2.4 re-pins;
- `BACKLOG.md` (Entry 34 close).

**S2.3 Tests — `qa/ath_client_offline.js`** (stubbed `fetch`):

| ID | Requirement | Planted negative |
|---|---|---|
| AC-1 | gate off → zero requests; output and AI text byte-identical | gate check removed |
| AC-2 | one `ath-ensure` per scanned ticker; body exactly `{ticker}`; concurrency ≤ 4 | a value or price sent |
| AC-3 | verified → row value / date / distance at the displayed price | distance from the scan price |
| AC-4 | `stale-suspect` → "ATH under review"; unavailable / error → "—"; never the 1Y High | 1Y High substituted |
| AC-5 | verified → exactly one `  All-time high (verified): <value> <USD\|ILS> (<YYYY-MM-DD>)` line; under review / unavailable / gate off → block byte-identical to the base; no other prompt byte; no distance and no 1Y value in the line | an "unavailable" line; the 1Y High substituted; a distance appended |
| AC-6 | no data path into setup / score / `_techCache` / persistence | `_athCache` read by `classifyTechnicalSetup` |
| AC-7 | no `localStorage` / `sessionStorage` / URL use | cache persisted |
| AC-8 | no new top-level function referenced by `renderMainPanel` | helper added |
| AC-9 | a null-score (R-3 failed) item still gets the ATH row normally | row suppressed for failed items |
| AC-10 | the default assignment exists exactly once; `false` / `'true'` / `1` → zero requests | truthy check |
| AC-11 | `ILA` record → ÷ 100, shown in ILS, distance at the displayed ILS price; currency mismatch → "—" | ILA unconverted |
| AC-12 | each non-verified envelope → *unavailable*; `stale-suspect` → under review; verified + `budget:'exhausted'` still shows | `action` / `budget` used for display |

**S2.4 Coupling / pins:**
- `ath_isolation` **AR-7f re-baselined by design**:
  - allowed in `index.html`: `ath-ensure`, `ath-read` (incl. the `ath-read-v2` string), `PT_ENABLE_ATH_CLIENT`;
  - still forbidden: `ath-write`, `PT_ATH`, `PT_ENABLE_ATH_READ_SERVER`, `PT_ENABLE_ATH_ENSURE_SERVER`,
    `PT_ENABLE_ATH_WRITE_SERVER`, `ath-record-store`, `ath:v1`, `ath-verify-owner` — each with a planted negative;
  - AR-7i re-pinned; AR-7a–e, g, h unchanged.
- `high1y_label`:
  - HL-3 unchanged except one added row: with a verified cache entry, the only "all-time" line is the D-B4-2 line and no
    1Y line contains it;
  - layer 2 (`renderMainPanel`, `buildTechSnapshotBlock`);
  - layer 1 if `analyzeChunk` / `runAnalysis` change.
- `tech_snapshot_cache`: `NEW_RM_*`, TC-10 (+ S2 table), `BASE_PINS.buildTechSnapshotBlock`.
- `vis_score_caliper`, `ts1_default_exposure` TX-3, `ma_stack_label` (MS-7 + S2 table, MS-8), `analyst_parser` AP-14.
- `no_synthetic_score`: `PRE_MASKED_FIVE` (new top-level state / helper outside its five functions); NS-12 chains for
  `renderMainPanel` / `analyzeChunk` if touched.
- `deep_dive_v0` (sandbox `FNS` includes `buildTechSnapshotBlock`): must pass unchanged; an edit → STOP.
- `ui_hygiene` UH-5 / UH-7 (if `runAnalysis` hosts the prefetch): replacement strings once, catch / finally shape,
  `setItem` counts unchanged.

**S2.5 Evidence:** sweep; AC results; re-pin ledger; Codex S2 ledger; the `pt-ai-output-change` surface map for the
new line.

**S2.6 Rollback:** checkpoint **C2** `wip(nlm-consistency-1): slice 2 B4-client — checkpoint`.

**S2.7 Slice STOP:**
- any server-file change;
- ATH reaching setup / score;
- the 1Y High used as ATH;
- a token or cookie;
- a prompt change beyond the one verified-only line.

## §S3 Slice 3 — R-6 narrative consistency checker (Entry 14 slice 1)

**S3.1 Requirements:**
- **Checker:** one pure, deterministic top-level function, `_nlmConsistencyChecks(item, ctx)`.
  - It returns `{ id, text }[]` and never mutates `item`.
  - `ctx` = the displayed price (`_techPanelPrice`), the panel snapshot's MAs (`_techSnapFor`, Entry 32 consistency)
    and held / not-held (`loadHoldings`, read-only).
- **Checks (K1–K6 only; a check with missing or unparsable inputs is skipped, not failed):**

  | ID | Fails when |
  |---|---|
  | K1 | the narrative calls an event "today" while its catalyst date (`item._catalysts`) is an earlier day |
  | K2 | a level described as downside / support is above the displayed price, or upside / resistance below it |
  | K3 | a stated % to a stated level differs from the one computed from the displayed price by > 0.5 pp |
  | K4 | the entry-zone floor is at or below the invalidation level (long setups) |
  | K5 | holder / exit language ("current holders", "exit", "trim position") on a ticker not in holdings |
  | K6 | a score stated in the narrative differs from the product `sentiment_score` |

- **Display (D9-3):**
  - ticker detail: one compact line `Consistency: <failed check texts>` directly under the Actionable Take in
    `renderMainPanel`; omitted when nothing fails;
  - Ranked and Daily Review: `⚠ <n>` beside the ticker when n > 0.
- **Never:**
  - AI text hidden or rewritten;
  - a re-prompt;
  - an effect on score / action / grouping / sorting / persistence;
  - a prompt change;
  - a stored field.
- **Failed analyses:** `_aiUnavailable` → no checks, no ⚠.

**S3.2 Files:**
- `index.html`;
- `qa/narrative_consistency_offline.js` (NEW);
- the S3.4 re-pins and harness-list edits;
- `BACKLOG.md` (Entry 14 → partial, slice 1).

**S3.3 Tests — `qa/narrative_consistency_offline.js`** (fixtures from the 3 Oct pilot):

| ID | Requirement / fixture | Planted negative |
|---|---|---|
| NC-1 | K1: MRNA M1 ("today", catalyst 30 Sep) fails; same-day passes | date comparison removed |
| NC-2 | K2: CBOE C1 (MA150 293.38 "downside" at 271.26) fails; correct direction passes | direction inverted |
| NC-3 | K3: CBOE C3 (17.7 % vs 17.97 %) fails; ROK "10 %" for +10.05 % passes | tolerance widened to 1 pp |
| NC-4 | K4: ROK R5 / CBOE C2 entry floor ≤ invalidation fails | comparison flipped |
| NC-5 | K5: CBOE C5 (unheld + exit language) fails; held MRNA "current holders" passes | holdings ignored |
| NC-6 | K6: CBOE C4 ("42" vs 45) fails; equal passes | score compared to analyst rating |
| NC-7 | missing inputs → skipped, for each of K1–K6 | missing treated as failure |
| NC-8 | no mutation: item deep-equal before / after; summary and every AI field byte-identical in the render | text rewritten |
| NC-9 | detail line only with ≥ 1 failure; ⚠ counts in Ranked and Daily Review; none at 0 | line shown with 0 failures |
| NC-10 | score, action, groups, Ranked order and stored results identical with and without failures | ⚠ used in sorting |
| NC-11 | `_aiUnavailable` → no checks, no ⚠ | checks run on a failed item |
| NC-12 | K7 absent | — |

**S3.4 Coupling / pins:**
- The renderMainPanel family again: caliper, TS1 TX-3, `tech_snapshot` (`NEW_RM_*`, TC-10 + S3 table, TC-11),
  `high1y_label` L1 (the checker is outside the mask) / L2, `ma_stack_label` MS-7 / MS-8, `analyst_parser` AP-14,
  `ath_isolation` AR-7i.
- `no_synthetic_score`: NS-11 `PRE_MASKED_FIVE` and its "no new top-level function" wording — re-pinned by design for
  the §0.4 exception (the checker); NS-12 chains for `renderMainPanel`, `_srRenderGrouped` / `openScanResultsOverlay`
  if pinned.
- **Class c:** add the checker name to every helper list that executes a changed renderer:
  - `high1y_label` HL-5 `helperNames`;
  - `tech_snapshot` `RENDER_REAL`;
  - `ma_stack_label` `RENDER_REAL`;
  - `scan_results_enrichment` `FNS`;
  - S1's / S2's own suites if they render the panel.

  Each is an edit to the list only.
- `scan_results_enrichment` `SIDE` regex must still hold.

**S3.5 Evidence:** the K1–K6 fixture table (expected vs actual); sweep; re-pin and harness-list ledger; Codex S3
ledger; the `pt-ai-output-change` consumer map.

**S3.6 Rollback:** checkpoint **C3** `wip(nlm-consistency-1): slice 3 R-6 checker — checkpoint`.

**S3.7 Slice STOP:**
- any change to AI text, prompts, score, action, grouping, sorting or persistence;
- a check outside K1–K6;
- a re-prompt;
- a stored field.

## §C Checkpoint commits

- One per completed slice on `task/nlm-consistency-1`, through the r9 gate, ordinary paths only, never amended.
- The final step-13 commit carries `review.md` (sections per slice + program closure) and the BACKLOG reconciliation.
- `qa/run-offline.js` enters only through **step 13a** (protected-scope, below), after the step-13 commit.

## §L Close at the last passed slice (pre-authorised, M-4)

If S2 or S3 STOPs and the Owner chooses to close:
1. reset only the unfinished slice's work to the last checkpoint (C1 or C2), in the Worker's own working tree;
2. step-10 full `qa:offline` on the passed slices (expected count = step 0 + the number of passed slices);
3. `review.md` records the unfinished slice(s);
4. final Codex check;
5. step-13 commit; step 13a for `qa/run-offline.js` (S1 always runs first, so the Phase 13 edit always belongs to the
   landed set); integrity;
6. LAND and push.

Unfinished entries stay open (Entry 34 if S2, Entry 14 slice 1 if S3). No brief amendment.

## §X Program closure

1. Step-10 full `qa:offline` (step 0 + 3) with the Owner's heavy-lane go-ahead and the 3A-M sampler.
2. `review.md`.
3. Final Codex check on the whole task diff (base = the actual task base: the recorded base if `task-base-record` has
   landed, otherwise the handoff's task base).
4. Step-13 commit.
5. **Step 13a PROTECTED gate** for `qa/run-offline.js` (one Owner line).
6. Integrity check.
7. R12 LAND, R12 push, cleanup.
8. COWORK post-push DEV checks, each with the Owner's approval: S1 visual, S2 one scan, S3 visual. The S2 check first
   confirms **read-only** whether the ATH server gates are `'true'` on DEV. Enabling them is a separate Owner action;
   with them off the client shows "—", which is AC-12's DEV evidence.

## §Y Land-scope, land-tests, Definition of Done

<!-- protected-scope:begin -->
qa/run-offline.js
<!-- protected-scope:end -->
<!-- land-scope:begin -->
index.html
BACKLOG.md
qa/run-offline.js
qa/pulse_analyst_view_offline.js
qa/ath_client_offline.js
qa/narrative_consistency_offline.js
qa/vis_score_caliper_offline.js
qa/ts1_default_exposure_offline.js
qa/tech_snapshot_cache_offline.js
qa/high1y_label_offline.js
qa/ma_stack_label_offline.js
qa/analyst_parser_offline.js
qa/ath_isolation_offline.js
qa/no_synthetic_score_offline.js
qa/scan_results_enrichment_offline.js
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/pulse_analyst_view_offline.js
node qa/ath_client_offline.js
node qa/narrative_consistency_offline.js
node qa/vis_score_caliper_offline.js
node qa/ts1_default_exposure_offline.js
node qa/tech_snapshot_cache_offline.js
node qa/high1y_label_offline.js
node qa/ma_stack_label_offline.js
node qa/analyst_parser_offline.js
node qa/ath_isolation_offline.js
node qa/no_synthetic_score_offline.js
node qa/scan_results_enrichment_offline.js
node qa/dh_ui_vocabulary_offline.js
node qa/deep_dive_v0_offline.js
node qa/ui_hygiene_offline.js
<!-- land-tests:end -->

**Must pass unmodified** (an edit → STOP): `dh_ui_vocabulary`, `deep_dive_v0`, `ui_hygiene`, and every suite not in the
land-scope.

**Definition of Done:**
- **S1:** PA-1…PA-11 PASS with planted negatives caught; S1.4 re-pins with revert proof; Phase 13 flipped exactly as
  S1.4; C1.
- **S2:** AC-1…AC-12 PASS; S2.4 re-pins; C2.
- **S3:** NC-1…NC-12 PASS; S3.4 re-pins and helper lists; C3.
- **Program:**
  - full `qa:offline` = step 0 + 3 (75 at this baseline);
  - Codex has no unresolved Class I;
  - Entry 37 created and closed, Entry 34 closed, Entry 14 partial (slice 1);
  - `run-offline.js` in through step 13a;
  - LANDed, pushed, cleaned.
