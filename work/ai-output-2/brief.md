# Master Brief: ai-output-2 — trustworthy narrative-consistency warnings (C1: K3 / K4 precision) + Tech Score display rounding (RND-1)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below. **Status: FINAL r2, HELD** (COWORK, re-pinned 2026-10-12 at `b4ab2251e0664d496301385cc2335508e1a1bc27`, after `governance-update-2`; §R). It supersedes FINAL r1 (`45d028da…`). It is placed only on Main Control's separate approval of this exact hash.

| | |
|---|---|
| Backlog | Entry **14** → **`partial`** (AO2-2, ruled): entry 14's status text gains one clause, "K3 / K4 precision fixed (`work/ai-output-2/`)"; the entry stays open — "beyond K1–K6 stays behind 8b" is unchanged. RND-1 adds **no** BACKLOG entry (the rounding defect was never tracked); `review.md` records it as a pilot-derived display fix |
| Baseline | **`b4ab2251e0664d496301385cc2335508e1a1bc27`** (after GU-2's LAND); the brief-only commit adds only `work/ai-output-2/brief.md` on top of the then-current tip. Valid only if, at that tip:<br>(1) `functions._nlmConsistencyChecks` in `qa/fixtures/index-pins.json` = `f9eab8fc…a05fa855` (its `ba1d259` value);<br>(2) `functions._ts1RowText` = `6df1e835…f4f69a06` (its `105b9f9` value);<br>(3) `qa/narrative_consistency_offline.js` byte-identical to `ba1d259`;<br>(4) every §A anchor matches exactly once;<br>(5) the coupled suites (§S1.2 sweep list) are byte-identical to `b4ab225`. **All five hold at `b4ab225`.** Otherwise HOLD and re-pin |
| Branch / slot | `task/ai-output-2`, **Worker A** (`pt-wt-worker-a`, detached at `b4ab225`) |
| Mode | **Auto** (AO2-3, ruled). Session: **attended Auto** — permitted because GU-2 has landed and V1–V6 have passed (PQ-2). Unattended: not authorised. The Owner is present for the R12 prompts |
| qa:offline | **No new suite; count unchanged** = step 0 (**81** at `b4ab225`; 82 if `market-structure-1` lands first) |
| Parallel with | Worker B on `market-structure-1` (lane B: new `services/` file and its suite; no shared file). `BACKLOG.md`: only this task edits it. **One heavy / forced run at a time** |

**Objective.**
- **(C1)** The `Consistency:` line and the `⚠ n` counts stop misleading readers:
  - **K3** no longer reads a day-change statement ("rose 0.52 % to $229.28") as a distance claim;
  - **K4** reads only `$` price levels, never MA names (`MA20`, `MA150`), multipliers (`1.2x`) or position sizes (`Add 25 %`).
- **(RND-1)** The Tech Score v1 row shows whole numbers ("88 / 100", not "88.23529411764706 / 100").

Every other check, the D9 rules (warn-only, AI text never altered, warnings never touch score / action / grouping), every message text and every Tech Score calculation stay as they are.

## §P Placement conditions (COWORK; not met → not placed)

1. GU-2 LANDed, pushed, cleaned; V1–V6 PASS (**observed 2026-10-12**: LAND 17:30Z, push 17:33Z, cleanup 17:34Z; `b4ab225`). Worker A detached and clean at the tip.
2. The canonical checkout is CLEAN on `branch-dev`; `work/ai-output-2/`, `task/ai-output-2` and its record are absent.
3. The Baseline row holds; every §A anchor is re-verified at the tip.
4. §D is empty.

## §D Open decisions — **none**

| ID | Ruling (Main Control, 2026-10-12) |
|---|---|
| **AO2-1** | K4 reads **`$`-prefixed numbers only**; silent when a side has none |
| **AO2-2** | Entry 14 → `partial` (status text only) |
| **AO2-3** | Mode Auto (attended, after GU-2 + V1–V6) |
| **AO2-4** | No extra slices (R-4b, C3 / C4, 8b each need their own ruling) |
| **RND-1** | Tech Score display rounding **inside the existing slice S1**: display-only, focused QA, no scoring calculation change, no additional slice; if these conditions cannot be met → return for a decision |
| **PQ-2** | Attended Auto only after GU-2 + V1–V6; no unattended Auto |
| **ET-1** | Execution-time tracking, lightweight and non-blocking (§ET) |

## §0 Rulings and evidence (not reopened)

- **D9** (2026-10-08): warn only; K1–K6 in v1; a compact `Consistency` line plus `⚠ n`; never re-prompt; warnings never affect score, action or grouping.
- **RD-4** (2026-10-11): ai-output-2's initial scope is C1 (RND-1 added 2026-10-12).
- **Evidence** — the 2026-10-10 repeat pilot (`_held-briefs/notebooklm-pilot/2026-10-10-repeat-consistency-pilot.md` :42–45, :88–92, :109–110):
  - K3 false on 4 of 4 tickers (e.g. "0.52 % to $229.28 is 0.00 % from the price 229.28");
  - K4's verdict right on 4 of 4 but its evidence wrong on 4 of 4 ("floor 20 ≤ 50", "1.2 ≤ 20", "floor 20 ≤ 150");
  - old stored results show the same noise (CRWD "floor 25" from "Add 25 %");
  - Tech Score row unrounded: MRNA "88.23529411764706 / 100", CBOE "61.08108108108108", NVDA "76.875".
  - **Limitation:** the replies were not stored. Fixtures are **reconstructions** from the quoted fragments, never presented as captured text.
- **PC-2 / PC-3:** the five revert chains are frozen (`qa/fixtures/index-pins-frozen.json` is never edited; it holds `renderMainPanel` text, not `_ts1RowText`). The R-2 rule holds: no new top-level function.

## §R Placement re-pin record (COWORK, read-only, 2026-10-12, `b4ab225`)

- **Moved since r1** (`105b9f9` → `b4ab225`): `market-data-1` (server files, `ath_isolation` `BASELINE_PINS` line for `market-data.js`), `governance-update-2` (`AGENTS.md`, `.claude/settings.json`, AH suite). **`index.html` is byte-identical to `105b9f9`**, so every anchor keeps its line.
- **Pins:** `_nlmConsistencyChecks` `f9eab8fc…` (= `ba1d259`); `_ts1RowText` `6df1e835…` (= `105b9f9`).
- **Suites:** `narrative_consistency` = `ba1d259`; the coupled suites are unchanged since `105b9f9` except `ath_isolation` (server-pin line only; it does not read either function's text); `ts1_default_exposure` unchanged since `105b9f9`.
- **pin-span-check** (core 378 = acorn 378, errors 0): `_nlmConsistencyChecks` COMPLETE (AT-RISK, 40 brace characters in literals: the existing balanced regex quantifiers); `_ts1RowText` COMPLETE, no warning.
- **RND-1 feasibility:**
  - `qa/run-offline.js` T6 asserts only whole-number inputs (`'72 / 100 · 100% coverage'`, `'— · 35% coverage'`), so it passes **unmodified** (protected file, not edited);
  - `ts1_default_exposure` TX-3 and the TS1 guard in `tech_snapshot_cache` compare against the pin map, so `--update` carries them.
- **Suite count:** 81.

## §PEP Execution preflight (GU-2 permission model)

| Step | Item | Class |
|---|---|---|
| all | `node qa/<suite>_offline.js` (each land-test), `npm run qa:offline`, `git status / diff / show / log`, `git commit` (r9), `codex exec --sandbox read-only`, `node qa/tools/index-pins.js --diff <base>` / `--update` / `--check`, `sha256sum` / `ls` / `diff` / `cmp`, Read / Grep | **A** (allow-listed) |
| S1 | Write / Edit of the four in-scope files in the slot | A (attended Auto) |
| S1 | no scratch files needed (R-3 uses the pin tool's `--diff`) | — |
| §L only | archive to `pt-work-artifacts/ai-output-2-s1/<UTC>/`, `git restore` | B (exceptional path) |
| close | `land-request` / `push-request` (A) · `land` / `push` (**ask**: always prompt) | **C: R11 brief record · R12 LAND · R12 PUSH** (heavy-lane go-ahead only if a forced replay is due, E1-D7, from 2026-10-18) |
| never | `curl` / `wget` / `WebFetch` / `netlify env:*` (ask), `git push` / merge / protected writes (hook) | not needed; their appearance is a STOP |

- **Expected prompts:** the two R12 verbs only.
- **Continuation:** one slice; closure follows automatically on PASS.
- The evidence files named in §0 are for the record: **the Worker reads nothing outside its slot.**

## §UER Execution readiness: **ATTENDED-ONLY**

GU-2's `ask` rules and bypass-disable are in force. T6 (indirect script execution), approval-record forgery, scripted network transfer and secret access through files are not technically mitigated (A4 prerequisites open).

## §A Anchors (`b4ab225`; each must match exactly once)

| Anchor | Line |
|---|---|
| `function _nlmConsistencyChecks(item, ctx) {` | :7154 |
| `  const price = (typeof c.price === 'number' && isFinite(c.price) && c.price > 0) ? c.price : null;` | :7159 |
| K3: `    const re = /(\d+(?:\.\d+)?)\s?%[^.;\n]{0,60}?\$\s?(\d[\d,]*\.?\d*)\|…/g;` and `      if (pct === null \|\| level === null) continue;` | :7199 / :7204 |
| K4: `    const floors = (String(item.entry_zone).match(/\d[\d,]*\.?\d*/g) \|\| []).map(num).filter(v => v !== null);` and `    const inv = num((String(item.invalidation).match(/\d[\d,]*\.?\d*/g) \|\| [])[0]);` | :7211 / :7212 |
| Callers (unchanged): Ranked :7262, Daily Review :7462, `renderMainPanel` :8579 | — |
| RND: `function _ts1RowText(result) {` | :8164 |
| RND: `  const score = typeof result.score === 'number' && isFinite(result.score) ? result.score + ' / 100' : '—';` | :8166 |
| RND: `  const cov   = typeof result.coveragePct === 'number' && isFinite(result.coveragePct) ? result.coveragePct + '% coverage' : '';` | :8167 |

## §S1 Slice C1 — K3 / K4 precision + RND-1

### S1.1 Requirements (line endings preserved)

| # | Requirement |
|---|---|
| K3-a | **Reference prices** = `price` (ctx) plus `item._verifiedPrice` when it is a finite number > 0. A K3 `%` / `$` pair whose level lies within **0.05 %** (`|level − ref| / ref ≤ 0.0005`) of any reference price is a day-change statement: it is **skipped**, and the loop moves on to the next pair (`continue`, never `break`) |
| K3-b | Everything else in K3 is unchanged: both regex alternatives, the 0.5 pp tolerance, the first-mismatch `break`, the message text, the `price === null` skip |
| K4-a | Floors are every `$`-prefixed number in `entry_zone` (`\$\s?(\d[\d,]*\.?\d*)`); the invalidation is the first `$`-prefixed number in `invalidation`. Bare numbers are never read |
| K4-b | If either side yields no number, K4 does not fire |
| K4-c | Verdict and text unchanged: `min(floors) ≤ inv` → `entry-zone floor <n> is at or below the invalidation <n>`; long setups only (`trim` / `avoid` excluded); `entry_zone` and `invalidation` both required |
| RND-a | In `_ts1RowText` only: the score renders as `Math.round(result.score) + ' / 100'` and the coverage as `Math.round(result.coveragePct) + '% coverage'`. The finite-number guards, the "—" glyph, the `GATE_OFF` / `UNAVAILABLE` branch, the separator and the order are unchanged |
| RND-b | **Display only:** `runTechScoreV1`, `scoreTickerTech`, `_ts1FillRow`, `_ts1RowMemo`, the engine's result object and every other consumer are byte-identical |
| R-1 | K1, K2, K5, K6, the return shape, `_aiUnavailable` handling, the callers, `renderMainPanel`, the Scan Results renderers and every function other than `_nlmConsistencyChecks` and `_ts1RowText` are **byte-identical** |
| R-2 | No new top-level function or global. Inner `const` arrow helpers are allowed. **No new `{` or `}` inside any string, template, regex or comment**; the existing regex quantifiers stay balanced |
| R-3 | Pin map: `node qa/tools/index-pins.js --diff <base>` lists **exactly** `functions._nlmConsistencyChecks`, `functions._ts1RowText` and the file digest — no remainder, region or other entry. Then `--update`, then `--check` OK. `qa/fixtures/index-pins-frozen.json` untouched |

### S1.2 Tests

**`qa/narrative_consistency_offline.js`** — new rows NC-13 / NC-14; NC-1…NC-12 unchanged and green:

| ID | Assertion |
|---|---|
| NC-13a | NVDA-like: "Shares rose 0.52% to $229.28 …" at price 229.28 → no K3 |
| NC-13b | The same text with `ctx.price` 231.10 and `_verifiedPrice` 229.28 → no K3 (scan-price reference) |
| NC-13c | Boundary: a level 0.04 % from the price is skipped; 0.06 % is evaluated |
| NC-13d | A skipped day-change pair followed by a wrong distance pair in the same summary → K3 still fires on the second |
| NC-14a | `entry_zone` / `invalidation` with MA names only → no K4 |
| NC-14b | MA names with `$` levels ("MA50 $221.39 – MA20 $226.10" / "Daily close below MA50 $221.39") → K4 fires with 221.39 / 221.39; a CBOE-like case → K4 fires with `$` values only |
| NC-14c | "1.2x volume" and "Add 25 %" are never read |
| NC-14d | No `$` on one side → silent |
| NC-14e | All existing K4 fixtures keep their verdicts |

**`qa/ts1_default_exposure_offline.js`** — new rows TX-R1…TX-R3 (execute the real extracted `_ts1RowText`); TX-1…TX-n unchanged and green:

| ID | Assertion |
|---|---|
| TX-R1 | 88.23529411764706 → "88 / 100"; 76.875 → "77 / 100"; 61.08108108108108 → "61 / 100"; 72 → "72 / 100" (each with coverage 100 → "· 100% coverage") |
| TX-R2 | Fractional coverage is rounded (e.g. 87.5 → "88% coverage"); a null score keeps "— · 35% coverage"; `GATE_OFF` / `UNAVAILABLE` → "—" |
| TX-R3 | Display only: the result object passed in is deep-equal before and after the call (no mutation). No new per-suite digest: calculation / fill byte-identity is proven by R-3's `--diff` and by the existing TX-3 map check |

**Planted negatives** (each must bite):
- the K3-a skip removed → NC-13a fails;
- reference = `ctx.price` only → NC-13b fails;
- `break` instead of `continue` → NC-13d fails;
- the bare-number read restored on either side → NC-14a / NC-14c fail;
- `$`-only on `entry_zone` but not on `invalidation` → NC-14b fails;
- no rounding, or `toFixed(2)` → TX-R1 fails;
- coverage not rounded → TX-R2 fails;
- the score rounded by mutating `result.score` → TX-R3 fails.

**Coupling sweep (mandatory in `/plan`).** Readers that must pass **unmodified**:
- `narrative_consistency` (new rows only), `ath_client`, `high1y_label`, `ma_stack_label`, `no_synthetic_score`, `pulse_analyst_view`, `scan_results_enrichment`, `tech_snapshot_cache`;
- the map-based whole-file suites (`index_pins`, `analyst_parser`, `ath_isolation`);
- the `index.html` readers `deep_dive_v0`, `ui_hygiene`;
- `qa/run-offline.js` (T6 Tech Score rows) — **protected, never edited**.

Re-grep `qa/` at the tip for `_nlmConsistencyChecks`, `_ts1RowText`, `ts1-val`, `sr-warn`, `mp-nlm` and `Consistency`.

### S1.3 Feasibility evidence (COWORK, reference only, carries no approval)

- **C1 prototype** (scratch, `ba1d259`; `_nlmConsistencyChecks` unchanged since): before → after on the pilot fragments — day change K3 → none; "floor 20 ≤ 50" → none; MA + `$` → "floor 221.39 ≤ 221.39"; "1.2 ≤ 20" → none; "25 ≤ 280" → none; a real wrong distance still fires. `narrative_consistency` 79 / 79 PASS; after `--update`, every coupled suite PASS. Before `--update`, `high1y_label` (HL-8), `ma_stack_label` (MS-8) and `no_synthetic_score` (NS-11) fail as expected (whole-file map checks), which is why R-3 orders `--update` before the full run.
- **RND-1** (scratch, `b4ab225`; outside the repo, deleted):
  - **Rendering:** the RND-a two-token edit applied to a copy of `_ts1RowText` renders "72 / 100 · 100% coverage" and "— · 35% coverage" (the T6 strings, unchanged), plus "88 / 100", "77 / 100", "61 / 100 · 88% coverage"; "—" for `UNAVAILABLE` / `GATE_OFF`. The input is never mutated.
  - **Pin map:** `index-pins --check` on a scratch copy reports exactly `changed functions._ts1RowText` (no region; `ts1_region` spans lines 1474–2267 only).

### S1.4 STOP (in addition to STOP-1…6 and the program STOPs)

- Any edit outside `_nlmConsistencyChecks` and `_ts1RowText` in `index.html`.
- **Any change to a Tech Score calculation, to `qa/run-offline.js`, or to a T6 assertion → STOP and return for a decision (RND-1 condition).**
- A new top-level function or global.
- A changed consistency message text.
- Any prompt, score, action, grouping or persistence change.
- An `--diff` beyond R-3.
- Any edit to `index-pins-frozen.json`, `qa/lib/index-pins-core.js` or `qa/tools/index-pins.js`.
- An NC-1…NC-12 or existing TX assertion weakened.
- A fixture presented as a captured reply.
- Any live or DEV scan; any `curl` / `WebFetch` / `netlify` command.
- `BACKLOG.md` edited beyond entry 14's status clause.

## §C / §L / §X Checkpoint and closure (one slice)

- Steps 0–13 run as usual.
- **Codex:** step 8 on the real diff; step 12 final check. Codex must confirm K3-a (`continue`, both reference prices), K4-a (both sides), RND-a / RND-b (display only), R-1 (byte-identity) and that every planted negative bites. A Codex run inside `--sandbox read-only` that fails a real-repo row is judged against a run outside the sandbox before classifying (GU-2 lesson).
- **Full `qa:offline`:** count = step 0, PASS. Digest-gated (four `E1 … SKIP` lines, AH `89e9b370f9fb`); a forced replay only if E1-D7 is due at step 0.
- **`review.md`:** the evidence limitation; before / after on the pilot fragments and the four Tech Score values; the `--diff` output; `## Backlog reconciliation`; `## Timing` (§ET); a LAND-EVIDENCE line.
- **Post-push DEV check:** belongs to ATH-V (`_held-briefs/ath-v/`), planning only, separately approved. Not part of this task.

## §ET Execution-time tracking (ET-1; non-blocking, no gate)

- **Estimate:** Worker ≈ 2.5–3.5 h (C1 2–3 h + RND-1 ≈ 0.5 h); step 0 and step 10 ≈ 80 s each (digest-gated); task-start → cleanup ≈ 3–4 h including Owner gates.
- **Worker:** a `## Timing` table in `review.md` — step 0 start / end, step 10 start / end, each Codex round, the `land-request` and `push-request` print times. `UNKNOWN` where not observed.
- **COWORK:** completes the table after cleanup from `.git/pt-task`, `pt-land-log` and commit author dates; separates Owner-gate waiting where both ends are evidenced; compares with the estimate.

## §Y Files, land-scope, land-tests

```
index.html                                _nlmConsistencyChecks (K3-a, K4-a) · _ts1RowText (RND-a)
qa/narrative_consistency_offline.js       NC-13, NC-14 + planted negatives
qa/ts1_default_exposure_offline.js        TX-R1…TX-R3 + planted negatives
qa/fixtures/index-pins.json               regenerated (R-3)
BACKLOG.md                                step 10a only: entry 14 status clause (AO2-2 = partial)
work/ai-output-2/review.md                evidence
```

<!-- land-scope:begin -->
index.html
qa/narrative_consistency_offline.js
qa/ts1_default_exposure_offline.js
qa/fixtures/index-pins.json
BACKLOG.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/narrative_consistency_offline.js
node qa/ts1_default_exposure_offline.js
node qa/tools/index-pins.js --check
node qa/index_pins_offline.js
node qa/high1y_label_offline.js
node qa/ma_stack_label_offline.js
node qa/no_synthetic_score_offline.js
node qa/analyst_parser_offline.js
node qa/ath_isolation_offline.js
node qa/pulse_analyst_view_offline.js
node qa/ath_client_offline.js
node qa/scan_results_enrichment_offline.js
node qa/tech_snapshot_cache_offline.js
node qa/deep_dive_v0_offline.js
node qa/ui_hygiene_offline.js
<!-- land-tests:end -->

**Skills:**
- `pt-offline-suite` **Required**.
- `pt-ai-output-change`: **Recommended**, for its finding vocabulary only; the AI-output path itself is not touched.
- `/plan` mandatory.

**Effort:** small (§ET).

**Delta check at placement:** done 2026-10-12 at `b4ab225` (§R). If the tip moves before placement, only the Baseline row is re-checked.
