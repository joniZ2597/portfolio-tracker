# Review: r3-no-synthetic-50 — a failed AI analysis stays failed: null score, never a synthetic 50 (R-3, Entry 36)

Brief: `work/r3-no-synthetic-50/brief.md` (brief-only commit `0560632`). Worker A, Mode Manual (the session was switched to Auto by the Owner after the scoring / persistence edits — see "Process record"), after `/plan` (`work/r3-no-synthetic-50/plan.md`, untracked).
Code base: `a183db8` (`index.html` byte-identical at `a183db8` and at the slot HEAD `0560632`, one brief-only commit above the base).

## Files changed
- Implementation (10): index.html, qa/no_synthetic_score_offline.js, qa/vis_score_caliper_offline.js, qa/ts1_default_exposure_offline.js, qa/tech_snapshot_cache_offline.js, qa/high1y_label_offline.js, qa/ma_stack_label_offline.js, qa/analyst_parser_offline.js, qa/ath_isolation_offline.js, BACKLOG.md
- Evidence (tracked): work/r3-no-synthetic-50/brief.md, work/r3-no-synthetic-50/review.md

## What changed
- `index.html` — exactly the five functions the brief names, twelve hunks, +2 lines, CRLF preserved (`git ls-files --eol` → `w/crlf`); the LF pin of the file with those five functions masked is unchanged, so no other byte of the file moved and no top-level function was added.
  - `analyzeChunk` (one literal): the Anthropic fallback result carries `sentiment_score: null`; `sentiment: 'neutral'`, both failure summaries, the Perplexity-derived alerts, `news: []`, `_aiUnavailable: true` and `_aiParseFailed` are unchanged (NS-1 compares every other field to the pre-task function).
  - `orchestrate` (guards only): the two day-change overrides additionally require `typeof item.sentiment_score === 'number'`; the four setup clamp / override `if`s (`extended_near_ath` clamp and gate, `below_key_mas` clamp and gate) additionally require `item._aiUnavailable !== true`. Identity, verified price / change, the extended-hours cache, the deterministic `technical_setup`, the analyst alerts, the catalyst fields and the audit trail are untouched; every non-failed item is byte-for-byte as before (NS-4, 1536 fixture combinations over all 8 setups).
  - `_isValidScanResult` (one predicate): the numeric 0–100 predicate is now `(numeric 0–100) || (sentiment_score === null && _aiUnavailable === true)`; every other predicate unchanged. A failed rescan therefore replaces the stored result through `mergeResultsByTicker` (NS-6).
  - `_srGroupResults` (one group): fifth, last group `{ name: 'Analysis failed — rescan', items: [] }`; a guard-first `if (r._aiUnavailable === true) groups[4].items.push(r); else …` leaves the existing chain and the other four groups' membership unchanged (NS-8); the display-order comment names the new group.
  - `renderMainPanel` (the Score-row line only): `null` → `—` in `neutral-v`; the numeric branch, including the Entry 32 "from scan" span, renders byte-identically (NS-9 compares against the pre-task render); the `<span class="rr-lbl">Score</span>` literal is unchanged and still occurs once (T6 / TC-13).
- New suite `qa/no_synthetic_score_offline.js` (auto-discovered): NS-1..NS-12, 157 asserts incl. 11 planted negatives. Real functions extracted from `index.html` and executed in sandboxes (`analyzeChunk` with the real `parseJSON` and counterfeit upstreams; `orchestrate` with the real `classifyTechnicalSetup` and a fixed clock; the terminal chain; the Scan Results renderers in a `vm` context; the `renderMainPanel` render harness). The pre-task function is reproduced from the task source by the R-3 revert tables (NS-12) and executed beside it for the fixture regressions.
- Existing suites — only the brief §4 edits: re-pins (ledger below); `qa/tech_snapshot_cache_offline.js` gains the R-3 table (`R3_OLD` / `R3_NEW` / `applyR3` / `revertR3`) applied first in the TC-10 chain `revertI7(revertA9(revertR2(revertR3(rm))))` with the forward chain `applyR3(applyR2(applyA9(applyI7(…))))`, the TC-15 base variant `revertI7(revertR2(revertR3(rm)))`, the TC-11 cross-pin `BASE_CALIPER_PINS._srGroupResults`, and two comment lines; `qa/ma_stack_label_offline.js` gains the same R-3 table and the MS-7 chain `revertR2(revertR3(rm))` / `applyR3(applyR2(…))` plus one comment line; `qa/high1y_label_offline.js` HL-3 group count 4 → 5 (Owner ruling, below).
- `BACKLOG.md`: Entry 36 created in NEXT as DONE, with the stated residual, and its DONE / HISTORY line after **35** (step 10a).

## Owner rulings recorded during the task
1. **HL-3 (2026-10-08):** "HL-3 is approved within the existing R-3 brief scope. The change `groups.length === 4` → `groups.length === 5` is an expected test update caused directly by the approved fifth Daily Review group `Analysis failed — rescan`. No brief amendment is required." — the sweep's one uncovered row (reported at the STOP before implementation) is covered by this ruling.
2. **Mode (2026-10-08):** the switch of the session from Manual to Auto was Owner-initiated, to avoid repeated read-permission prompts. All four scoring / persistence edits (the M5 surfaces) were made before the switch, under Manual, by one count-checked script after a dry run; after the switch only QA suites, `BACKLOG.md` and task evidence were edited.

## Step-0 baseline and QA
- Step-0 pre-edit baseline (first line of `qa.log`, Owner-approved, 3A-M sampler natural capture): `npm run qa:offline` PASS, **69 suites**, 14 phases, 0 failures, 1 033 921 ms, one pre-existing advisory warning.
- RED: the final suite against the pre-edit `index.html` fails 55 of 114 asserts (`qa.log`, "RED") — the `null → 55` lift (NS-2), the invented `hold_wait` / `avoid` (NS-3), the validator rejecting the failed item and the old 72 surviving (NS-5 / NS-6), `null / 100` in the `neg` class (NS-9), the fifth group absent (NS-8), the revert tables not applying (NS-12). RED also surfaced two harness defects, fixed before implementation: `parseJSON` carries a literal `{` inside a log string so brace-balanced extraction never closes (that one extraction falls back to the column-0 `\n}\n` rule of `qa/high1y_label_offline.js`); `_isValidScanResult(undefined)` throws in production (`JSON.stringify(undefined).slice`) — the suite calls it with `null`, not `undefined`.
- GREEN on the final tree (`qa.log`): `no_synthetic_score` PASS 157 · `vis_score_caliper` PASS 307 · `ts1_default_exposure` PASS 45 · `tech_snapshot_cache` PASS 319 · `high1y_label` PASS 101 · `ma_stack_label` PASS 81 · `analyst_parser` PASS 57 · `ath_isolation` ALL PASS 18 · `scan_results_enrichment` PASS 66 (unmodified) · `deep_dive_v0` PASS 74 (unmodified) · `ui_hygiene` PASS (unmodified). `qa/run-offline.js` untouched.
- Planted negatives (mutation on an in-memory copy of the production source, unique anchor asserted, paired with the clean run), all caught: synthetic 50 restored (NS-1) · `typeof` guard removed from the `chg > 5` override (NS-2) · action overrides applied to failed items (NS-3) · a guard leaking to normal items — `extended_near_ath` gate inverted (NS-4) · `null` accepted without `_aiUnavailable` (NS-5) · validator rejecting the failed item, old 72 survives (NS-6) · failed items left in their setup groups (NS-8) · `${score} / 100` restored (NS-9) · dial rendered for a failed item (NS-10) · a new top-level function (NS-11) · a second `renderMainPanel` region changed (NS-12). The existing suites keep their own negatives (TC-10 second-line, TC-11 / TC-13 pin-left-at-base, TX-3 byte change, AR-7 PN rows, MS-7 / MS-8).
- Full `npm run qa:offline` at step 10 (final tree incl. the BACKLOG edit, Owner-approved, 3A-M natural capture): **PASS, 70 spawned suites, 14 phases, 0 failures, 759 764 ms**, one pre-existing advisory warning (`qa.log`, "STEP-10 FULL RUN").

### Re-pin ledger
| Suite | Pin | EOL form | Old value | New value | Revert proof (reverting only the twelve R-3 lines restores the old value) |
|---|---|---|---|---|---|
| `qa/vis_score_caliper_offline.js` | `PROTECTED_FN_HASHES._srGroupResults` | CRLF (raw) | `56cf3149645d276df0fc66cdae605cfacf6f3a838e7b06c21b06f57ff0ed6741` | `71055cd1d74cc51564c400b0a0c306caae816c5f4f22096324eb3eb8bb3bf0fc` | PASS |
| `qa/vis_score_caliper_offline.js` | `PROTECTED_FN_HASHES.renderMainPanel` | CRLF (raw) | `f5df295f45f8b8b7978b57962379ada5395c6a62c7c175e219a355c8e3f8aa30` | `d1f693b557b37ba0afaa27573ff4c9d8984377b867d467383e1d0482d0c8e6f4` | PASS |
| `qa/ts1_default_exposure_offline.js` | `BASE_HASHES.renderMainPanel` (TX-3) | LF | `e84c5e61abcb1179add1c5db28d5d5b1e958daa10b0363fdb339d83363fed869` | `12789bcb207faf5df5dd9b10215442fb2da54b3c8521fd419f873c0cd35a6616` | PASS |
| `qa/tech_snapshot_cache_offline.js` | `NEW_RM_LF` | LF | `e84c5e61abcb1179add1c5db28d5d5b1e958daa10b0363fdb339d83363fed869` | `12789bcb207faf5df5dd9b10215442fb2da54b3c8521fd419f873c0cd35a6616` | PASS (TC-10 also proves `BASE_RM_LF` / `OLD_RM_CALIPER_PIN` through the full chain) |
| `qa/tech_snapshot_cache_offline.js` | `NEW_RM_CALIPER_PIN` | CRLF (derived) | `f5df295f45f8b8b7978b57962379ada5395c6a62c7c175e219a355c8e3f8aa30` | `d1f693b557b37ba0afaa27573ff4c9d8984377b867d467383e1d0482d0c8e6f4` | PASS |
| `qa/tech_snapshot_cache_offline.js` | `BASE_CALIPER_PINS._srGroupResults` (TC-11 cross-pin of the caliper file) | CRLF (caliper form) | `56cf3149645d276df0fc66cdae605cfacf6f3a838e7b06c21b06f57ff0ed6741` | `71055cd1d74cc51564c400b0a0c306caae816c5f4f22096324eb3eb8bb3bf0fc` | PASS |
| `qa/high1y_label_offline.js` | `PINS.layer1` (HL-8, whole file with the nine named functions masked) | LF | `2c0f449029ae1d679f074cd10d510dc8735bc74f8e54f3d20ccb3562be86c441` | `bc552dfc4b3c88b6083e14606d4cf56202566131acff4b6d17fba2c593ce6f50` | PASS |
| `qa/high1y_label_offline.js` | `PINS.layer2.orchestrate` | LF after `NORM` | `459af22a391331a196587b339c0460cbaf23d55d24469b5d09cabebe380d4a6f` | `d772badfdfa6c434c59b8fdce68d635544bf7ac173cc0460e4518267be238f67` | PASS |
| `qa/high1y_label_offline.js` | `PINS.layer2._srGroupResults` | LF after `NORM` | `048d6e03894de63b3e52da1766e64f8c51625f7624e3f4281f2f92aef79989ad` | `f16b2f1d48b2bc37f0320e3317273a399bdfc3fd80830f47243f34db3719e5c2` | PASS |
| `qa/high1y_label_offline.js` | `PINS.layer2.renderMainPanel` | LF after `NORM` | `11b3c2fe852a217fe19176ed9e59d83148f65c7526390fb19757509a5a62a20b` | `22a2ffe8a1c462f858cace60594167e3786bbfbfdbb8a6128c1d1b9fa6d05907` | PASS |
| `qa/ma_stack_label_offline.js` | `PIN_MASKED_MINUS_RM_LF` (MS-8) | LF, `renderMainPanel` masked | `3510e41eac89051f48c893b130cad435da62b607440c129573e1714d7a49da21` | `96dfb952d9b9aa9ea1df3e9ea626fcfb0a3a27b3bfe26a2dbd4c07c5a7583189` | PASS |
| `qa/analyst_parser_offline.js` | `PIN_MASKED_FILE` (AP-14) | LF, `parsePerplexityContext` masked | `e28588022c780721df56c811562dded7abba6a96e5035a819907ddb071e9046c` | `988a710a98d96f16079efc2a87f3ddd396ce32aa9eb4bd0334e4b8f78bdf4c03` | PASS |
| `qa/ath_isolation_offline.js` | `BASELINE_PINS['index.html']` (AR-7i) | LF whole file | `8d929721c8fef3762ef731181fe85b2040ad0b464aaed60407f781c7a4944cf4` | `9d8f7dc6762c58afc3b5813c4d7d0bf27e6cc0ee5d8ae0a3b4826fe3d6edf403` | PASS |

Pins re-pinned: 13 values across 7 suites, all named in the brief §4 / §5 (the `ma_stack` `PRE_RM_LF` / `PRE_RM_CRLF` values are unchanged: the MS-7 chain reproduces the pre-R-2 source after reverting R-3 first). Pins the brief does not name: none. Ledger computed from the live tree once per EOL form (`qa.log`, "RE-PIN LEDGER": `pins-pre.json` = pre-task tree, `pins-task.json` = task tree, `pins-revert.json` = task tree with only the twelve R-3 lines reverted, byte-equal to `pins-pre.json`; the high1y pins by the suite's own `HL_CAPTURE` mode on the task tree and on the reverted mirror).

### Sweep re-run at the final diff
Baseline `a183db8`, same edit targets (`analyzeChunk`, `orchestrate`, `_isValidScanResult`, `_srGroupResults`, `renderMainPanel`, `index.html`, the new suite, `BACKLOG.md`). Re-run of the five-class sweep over the final tree: new hits since `plan.md`: none (the HL-3 row is covered by the Owner ruling). Suite count: **70** (from the runner's summary line in `qa.log`; baseline 69).

## Readings recorded (AGENTS.md STOP-2 note)
1. TC-15 in `qa/tech_snapshot_cache_offline.js` builds its base render through the same revert chain as TC-10; the brief names the TC-10 chain. The R-3 revert is applied at that second call site too (`revertI7(revertR2(revertR3(rm)))`), as R-2 did for its table (R-2 review reading 1, Codex-accepted).
2. `qa/ma_stack_label_offline.js` MS-7's forward check becomes `applyR3(applyR2(reverted)) === rm` under the brief's "MS-7 revert chain (revertR2(revertR3(rm)) reproduces the pre-R-2 source)" wording; the line-count check (+3) holds because R-3 replaces one line by one line.
3. The `chg` overrides in `orchestrate` are single-line statements; their R-3 anchors are line prefixes (count-checked to exactly one), not whole lines.
4. `/plan` = the AGENTS.md Worker PLAN posture (`plan.md`); no `/plan` skill exists in the session.
5. Step 10a (BACKLOG) was done before the step-10 full run so that the full run covers the final tree; `BACKLOG.md` is read by no suite.
6. `qa/run-offline.js` has no phase-selection flag, so its Phase 6 / Phase 13 / T6 checks on the edited functions are verified by the step-10 full run only; NS-5 and NS-8 exercise the same fixtures (existing validator cases; the `B,H,A,G,C` Watch order with the C / G null-without-marker items) beforehand.

## Codex ledger
Step 8 (implementation diff vs `a183db8` plus the untracked new suite; Codex also ran the eleven land-test suites itself), raw in `codex.md`: verdict PASS, no findings.
| # | Finding | Class | Decision | Reason |
|---|---|---|---|---|
| - | none | - | - | - |

Final check (step 12), raw in `codex.md` under `## Final check`: the complete task diff (index.html, the seven edited suites, the new suite, `BACKLOG.md`, this file). Verdict: 0 class I, 1 class II.
| # | Finding | Class | Resolution |
|---|---|---|---|
| 1 | "the Final check summary line is not present in review.md" | II (documentation) | Expected by the step-12 sequence (the line is recorded after the check has run); recorded below. No other text changed. Self-check: every `work/<id>/` path named in this file exists and is one of the five canonical files; every count matches a line in `qa.log`; no section reads "Pending" / "TBD" (the two `[backlog] … — pending routing` lesson lines are the exempt form). |

Final check: 1 round, 1 class-II finding fixed, self-checked; no implementation change, no QA re-run.

## Backlog reconciliation
- Brief's Backlog row: New Entry 36, created and closed by this task (effect `close`).
- Action taken: `closed` — entry 36 added to NEXT with the DONE marker and one DONE / HISTORY line after **35**, in entry-number order; snapshot table, counts and other entries untouched.
- Entry heading before → after: (absent) → `### 36 · Failed AI analysis shows no score, never a synthetic 50 (R-3) — **DONE**`.
- The new BACKLOG text matches the diff, the QA results and the work being landed: the fallback carries `null`, `orchestrate` applies no override to a failed item, the validator accepts `null` only with the marker, Daily Review gains the last group, the Score row shows `—`; the residual (legacy stored synthetic 50s until rescanned) is recorded in the entry text.

## Boundaries confirmed
- No `localStorage` / `sessionStorage` / `pt_*` access added (UH-7: `renderMainPanel` still 0 `setItem`; NS-11 masked-file pin); `enforceScoreConsistency`, the seven `_ptScore*` helpers, `applyCapitalReturnsNudge` (still defined once, uncalled), `_renderPortfolioPanel`, `_dd0FetchAnalysis`, `classifyTechnicalSetup` byte-identical (NS-11; TC-9 / TC-13 / HL-8 / MS-8 / T6 hold); prompts, retry logic, Tech Score and storage keys untouched; no new top-level function.
- A `null` score is accepted only with `_aiUnavailable === true` (strict boolean; `'true'`, `1`, `false`, a bad summary or sentiment, or a marker are still rejected); `undefined` / `NaN` / `'50'` with the marker are still rejected.
- Every non-failed item's `orchestrate` output is identical to the pre-task function (1536 combinations); the existing overrides still fire for normal items (positive controls).
- `qa/run-offline.js` (ASK-tier) not touched; `scan_results_enrichment`, `deep_dive_v0`, `ui_hygiene` unmodified and green.
- No live, deploy, Netlify or environment action. The optional DEV visual of a stored failed result is COWORK, after push, only if one occurs naturally.

## Process record
- Posture: M1 → PLAN (`plan.md`: pre-flight checklist, five-class coupling sweep — one uncovered hit, HL-3, reported as STOP-1 material before any implementation; the Owner ruled it covered) → M2 (brief tracked + unmodified) → IMPLEMENT. Tests first: the new suite was written with the exact R-3 line tables and run RED against the pre-task source before the `index.html` edit.
- The `index.html` edits were applied by one count-checked scratchpad script (every anchor exactly once, line delta +2, CRLF preserved) after a dry run; the re-pin values and the revert proof were computed on scratch copies outside the repo; the suite edits were applied with the editor and the EOL form of every edited file audited afterwards (`git ls-files --eol`: `w/crlf`, `w/lf` for `ma_stack` as before, never `w/mixed`).
- Hook denials (Owner-ruled command-form gotchas, not retried): R10-E on a compound quoted read-only shell one-liner at pre-flight; R2 on the PowerShell tool in the Worker slot. Facts were gathered with Grep / Read / plain git commands.
- The 3A-M sampler was Owner-side; full `qa:offline` runs were serialised by the Owner (step 0 and step 10 each on explicit approval).
- The session's switch from Manual to Auto was Owner-initiated (to avoid repeated read-permission prompts) and happened after the M5 surfaces were edited; the harness notice is recorded in `plan.md`.

## Lessons
- [covered] A whole-file or masked-file pin (`analyst_parser` AP-14, `ath_isolation` AR-7i, `ma_stack` MS-8, `high1y` layer 1) moves on every `index.html` task — recorded as `[backlog]` lessons in `work/r1a-high1y-relabel/review.md` and `work/r2-ma-stack/review.md`.
- [backlog] `qa/tech_snapshot_cache_offline.js` now carries four stacked revert tables (I7, A9, R-2, R-3) and `qa/ma_stack_label_offline.js` two; every later `renderMainPanel` task must extend both chains — a single pre-task-source fixture per task would stop the chains growing — pending routing
- [backlog] A brace-balanced function extractor cannot extract `parseJSON` (a literal `{` inside a log-string literal); any suite that needs it must use the column-0 closing-brace rule — pending routing
- [rule] A class (e) literal-count assertion in a listed suite (HL-3's `groups.length === 4`) is as much a coupling as a pin: a brief that adds an enumerated item (group, row, key) should name the count literals of every listed suite in its sweep rows, so the sweep can match without an Owner ruling. Destination-ready text for `AGENTS.md` "Task brief convention": *"QA suites that read in-scope files as text: list pins **and** literal-count assertions (class e) per suite; an unlisted one is STOP-1 at `/plan`."*
- [local] The production validator `_isValidScanResult` throws on `undefined` input (`JSON.stringify(undefined).slice`) — a pre-existing property outside this brief; the new suite tests `null`, which is the brief's value.
- [local] The two `chg` overrides in `orchestrate` are single-line statements, so their anchors are line prefixes; the edit script's whole-line boundary check had to become a leading-boundary check.

## LAND-EVIDENCE
LAND-EVIDENCE: qa-offline=PASS 70; targeted=PASS; codex-classI-unresolved=0
