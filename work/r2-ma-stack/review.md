# Review: r2-ma-stack — claim "20 > 50 > 150" only when the averages are actually stacked (R-2, Entry 35)

Brief: `work/r2-ma-stack/brief.md` (brief-only commit `8933a7b`). Worker A, Mode Auto (attended), after `/plan` (`work/r2-ma-stack/plan.md`, untracked).
Code base: `e7bbbbb` (`index.html` byte-identical at `e7bbbbb`, `32c4388`, `d9c5a0e`); slot HEAD at task start `312c34b` = `branch-dev` (two brief-only commits above the base).

## Files changed
- Implementation (9): index.html, qa/ma_stack_label_offline.js, qa/vis_score_caliper_offline.js, qa/ts1_default_exposure_offline.js, qa/tech_snapshot_cache_offline.js, qa/high1y_label_offline.js, qa/analyst_parser_offline.js, qa/ath_isolation_offline.js, BACKLOG.md
- Evidence (tracked): work/r2-ma-stack/brief.md, work/r2-ma-stack/review.md

## What changed
- `index.html` — `renderMainPanel` only, at the `_tsAssess` declaration: the one line is replaced by four (three local consts `_maStackKey`, `_maStackAll`, `_maStacked` and the new `_tsAssess` line), CRLF preserved. The stack test reads `_panelSnap.sma20 / sma50 / sma150` (the snapshot the card renders and classifies, Entry 32) with strict `>` and `Number.isFinite`. Wording per brief §2.2: stacked → today's text byte-identical; all three finite but not strictly stacked → `Price above all key moving averages — healthy uptrend; averages not fully stacked`; any average missing / non-finite → `Healthy uptrend — price above key moving averages`; every other setup and `unknown` → exactly today's behaviour. `_tsAssessMap`, `classifyTechnicalSetup`, the card template and `_tsAssessHtml` are untouched; no new top-level function; no storage, scoring, ranking or prompt change.
- New suite `qa/ma_stack_label_offline.js` (auto-discovered): MS-1..MS-8 (81 asserts incl. 9 planted negatives), real `renderMainPanel` executed in the `tech_snapshot` `buildRenderer` harness pattern.
- Existing suites — only the brief §4 edits: re-pins (below) and, in `qa/tech_snapshot_cache_offline.js`, the R-2 table (`R2_OLD` / `R2_NEW` / `applyR2` / `revertR2`), the TC-10 chain `revertI7(revertA9(revertR2(rm)))` with forward `applyR2(applyA9(applyI7(...)))` and line count base + 6, the TC-15 base variant `revertI7(revertR2(rm))`, the TC-14 expectation via `r2Assess` (brief §2.2) and the TC-14 planted negative re-anchored to the R-2 `_tsAssess` line, plus two comment lines.
- `BACKLOG.md`: Entry 35 created in NEXT as DONE and its DONE / HISTORY line (step 10a).

## Step-0 baseline and QA
- Step-0 pre-edit baseline (first line of `qa.log`): `npm run qa:offline` PASS, **68 suites**, 14 phases, 0 failures, 840 771 ms, one pre-existing advisory warning; 3A-M sampler running (Owner, natural capture).
- RED: the final suite bytes against the pre-edit `index.html` fail 22 of 68 asserts (MS-2, MS-3, MS-4, MS-6, MS-7 behaviour rows and the MS-1 static stack-key row; MS-5 and MS-8 pass as invariants) — recorded in `qa.log`.
- GREEN land-tests on the final tree (`qa.log`): `ma_stack_label` PASS 81 · `vis_score_caliper` PASS 307 · `ts1_default_exposure` PASS 45 · `tech_snapshot_cache` PASS 319 · `high1y_label` PASS 101 · `analyst_parser` PASS 57 · `ath_isolation` ALL PASS 18 · `deep_dive_v0` PASS 74 (unmodified) · `ui_hygiene` PASS (unmodified). `qa/run-offline.js` T6 untouched.
- Planted negatives (mutation on an in-memory copy of the production source, unique anchor, paired with the clean run), all caught: stack test inverted (MS-1) · stack always claimed (MS-2) · `>=` (MS-3) · null/NaN treated as present (MS-4) · another key's text changed (MS-5) · stack test reads stored item fields (MS-6) · a second `renderMainPanel` region changed (MS-7) · a new top-level function (MS-8) · `classifyTechnicalSetup` threshold changed (MS-8). The existing suites keep their own negatives (TC-10 second-line, TC-11/TC-13 pin-left-at-base, TX-3 byte change, AR-7 PN rows, the re-anchored TC-14 negative).
- Full `npm run qa:offline` at step 10 (final tree, Owner-approved, 3A-M natural capture): **PASS, 69 spawned suites, 14 phases, 0 failures, 760 956 ms**, one pre-existing advisory warning (`qa.log`, "STEP-10 FULL RUN").

### Re-pin ledger
| Suite | Pin | EOL form | Old value | New value | Revert proof (reverting only the four R-2 lines restores the old value) |
|---|---|---|---|---|---|
| `qa/vis_score_caliper_offline.js` | `PROTECTED_FN_HASHES.renderMainPanel` | CRLF (raw) | `aea925b1775bef6c1475ff00979dda4c12cdead55e49b45d8045175052654254` | `f5df295f45f8b8b7978b57962379ada5395c6a62c7c175e219a355c8e3f8aa30` | PASS |
| `qa/ts1_default_exposure_offline.js` | `BASE_HASHES.renderMainPanel` (TX-3) | LF | `ed2c8bdcac6070d442241c4138b5f3ed155794b378d34349ac20cf0dc25aae2a` | `e84c5e61abcb1179add1c5db28d5d5b1e958daa10b0363fdb339d83363fed869` | PASS |
| `qa/tech_snapshot_cache_offline.js` | `NEW_RM_LF` | LF | `ed2c8bdcac6070d442241c4138b5f3ed155794b378d34349ac20cf0dc25aae2a` | `e84c5e61abcb1179add1c5db28d5d5b1e958daa10b0363fdb339d83363fed869` | PASS (TC-10 also proves `BASE_RM_LF` / `OLD_RM_CALIPER_PIN` through the full chain) |
| `qa/tech_snapshot_cache_offline.js` | `NEW_RM_CALIPER_PIN` | CRLF (derived) | `aea925b1775bef6c1475ff00979dda4c12cdead55e49b45d8045175052654254` | `f5df295f45f8b8b7978b57962379ada5395c6a62c7c175e219a355c8e3f8aa30` | PASS |
| `qa/high1y_label_offline.js` | `PINS.layer2.renderMainPanel` (HL-8) | LF after `NORM.renderMainPanel` | `4ca5c2a0ad3d0813e1a7f0342bc0a840506903da77e62ac0d37057d42bf18f91` | `11b3c2fe852a217fe19176ed9e59d83148f65c7526390fb19757509a5a62a20b` | PASS; `PINS.layer1` unchanged (it masks `renderMainPanel`) |
| `qa/analyst_parser_offline.js` | `PIN_MASKED_FILE` (AP-14) | LF, `parsePerplexityContext` masked | `9d3ffc5b3d98f5fa12ae75bd595bf5909ab10ef0962d587735a80fd42461948f` | `e28588022c780721df56c811562dded7abba6a96e5035a819907ddb071e9046c` | PASS |
| `qa/ath_isolation_offline.js` | `BASELINE_PINS['index.html']` (AR-7i) | LF whole file | `bda79e628bce30f33942e25a067700874db86998fed9f708f3eddf0065914de0` | `8d929721c8fef3762ef731181fe85b2040ad0b464aaed60407f781c7a4944cf4` | PASS |

Pins re-pinned: 7 values across 6 suites, all named in the brief §4 / §5. Pins the brief does not name: none. Ledger computed from the live tree (`qa.log`, "RE-PIN LEDGER"), once per EOL form.

### Sweep re-run at the final diff
Baseline `e7bbbbb`, edit targets `renderMainPanel` (`_tsAssess` region), `index.html`, new suite, `BACKLOG.md`. Re-run of the five-class sweep over the final tree: new hits since `plan.md`: none. Suite count: 69 (from the runner's summary line in `qa.log`; baseline 68).

## Readings recorded (AGENTS.md STOP-2 note)
1. TC-15 in `qa/tech_snapshot_cache_offline.js` also builds its base render through `revertI7(rm)`; the brief names the TC-10 revert chain. The same R-2 revert is applied at that second call site (`revertI7(revertR2(rm))`). No new pin, same brief-listed suite. Codex (step 8) judged it inside the brief's row for that suite.
2. The TC-14 planted negative "assessment taken from item.technical_setup" was anchored on the pre-R-2 `_tsAssess` line; it is re-anchored to the R-2 line with the same mutation and the same biting check.
3. `/plan` = the AGENTS.md Worker PLAN posture (`plan.md`); no `/plan` skill exists in the session.
4. Step 10a (BACKLOG) was done before the step-10 full run so that the full run covers the final tree; `BACKLOG.md` is read by no suite.
5. The TS1 suite comment calls its TX-3 pins "CRLF-normalised"; the pin is LF (its value equals `tech_snapshot`'s `NEW_RM_LF`, cross-asserted by TC-13). Re-pinned in LF form; the comment was not edited (outside the brief's lines).

## Codex ledger
Step 8 (implementation diff vs `e7bbbbb` plus the untracked new suite; Codex also ran the nine land-test suites itself), raw in `codex.md`: verdict PASS, no findings.
| # | Finding | Class | Decision | Reason |
|---|---|---|---|---|
| - | none | - | - | - |

Final check (step 12), raw in `codex.md` under `## Final check`: complete task diff (index.html, the six suites, the new suite, `BACKLOG.md`, this file); it re-ran `ma_stack_label` (81) and `tech_snapshot_cache` (319). Verdict: 0 class I, 1 class II.
| # | Finding | Class | Resolution |
|---|---|---|---|
| 1 | "review.md says the brief's diff against `e7bbbbb` is expected to be empty; it is a 166-line addition committed in `8933a7b`" | II (documentation) | The sentence Codex quotes was in the review prompt handed to Codex, not in this file; this file states the brief's own commit (`8933a7b`) and that the base `e7bbbbb` sits two brief-only commits below the slot HEAD. Verified by re-reading this file: no text to change. The brief is tracked and unmodified since `8933a7b` (`git status --short work/r2-ma-stack/brief.md` empty). |

Final check: 1 round, 1 class-II finding resolved (prompt wording, not review.md text — no edit needed), self-checked; no implementation change, no QA re-run.

## Backlog reconciliation
- Brief's Backlog row: New Entry 35, created and closed by this task (effect `close`).
- Action taken: `closed` — entry 35 added to NEXT with the DONE marker and one DONE / HISTORY line after **33**, in entry-number order; snapshot table, counts and other entries untouched.
- Entry heading before → after: (absent) → `### 35 · Claim the MA stack only when the averages are stacked (R-2) — **DONE**`.
- The new BACKLOG text matches the diff, the QA results and the work being landed: wording-only change in `renderMainPanel`, classification unchanged, stack claimed only when the shown snapshot is stacked.

## Boundaries confirmed
- No `localStorage` / `sessionStorage` / `pt_*` access (UH-7: `renderMainPanel` still 0 `setItem`); no scoring, ranking, Tech Score, prompt, Deep Dive or Actionable Take change (`classifyTechnicalSetup` pin, `_tsAssessMap` pin, HL-8 layer 1, TC-13, T6 all hold); no new top-level function (MS-8 masked-file pin); locals avoid `rs` / `rsCls` (UH-6).
- `qa/run-offline.js` (ASK-tier) not touched; `deep_dive_v0` and `ui_hygiene` unmodified and green.
- No live, deploy, Netlify or environment action. DEV visual (browser-integrity-qa) is COWORK, after push, optional.

## Process record
- Posture: M1 → PLAN (`plan.md`: pre-flight checklist, five-class coupling sweep "matches brief: yes", requirement → assertion map, planted negatives) → M2 (brief tracked + unmodified) → IMPLEMENT. Tests first: the new suite was written and run RED before the `index.html` edit.
- Repo edits were applied byte-exactly by scratchpad scripts (CRLF preserved; audited) after the identical edits were proven on a scratch mirror outside the repo (RED on the untouched copy, GREEN on the edited copy, exactly the brief's pins tripped).
- One guard denial (R10-E on a compound read-only shell command at pre-flight) — Owner-ruled command-form gotcha (2026-10-08), not retried; the facts were gathered with Grep / Read.
- Full `qa:offline` runs were serialised by the Owner (step 0 and step 10 each on explicit approval; 3A-M sampler natural captures).

## Lessons
- [covered] A whole-file or masked-file pin (`analyst_parser` AP-14, `ath_isolation` AR-7i) moves on every `index.html` task — already recorded as `[backlog]` lessons in `work/r1a-high1y-relabel/review.md`.
- [backlog] `qa/tech_snapshot_cache_offline.js` now carries three stacked revert tables (I7, A9, R-2) that every later `renderMainPanel` task must extend; a single "pre-task source" fixture (or a per-task table file) would stop the chain growing — pending routing
- [local] A scratch mirror (edited copy of `index.html` + copies of the coupled suites, outside the repo) proved the exact sweep outcome and all re-pin values before any repo edit; the repo edits were then byte-copies of the proven mirror files.
- [local] The TS1 suite's TX-3 comment says "CRLF-normalised" while its pin is LF; harmless, outside this brief.

## LAND-EVIDENCE
LAND-EVIDENCE: qa-offline=PASS 69; targeted=PASS; codex-classI-unresolved=0
