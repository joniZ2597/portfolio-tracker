# Review: ai-output-2 — K3 / K4 precision (C1) + Tech Score display rounding (RND-1)

Branch `task/ai-output-2`, Worker A, Mode Auto (attended). Task base `25e41e0cbccf9981d33eb1d13451d05433210972` (task-base record, `startedAt` 2026-10-12T18:37:05.400Z).

## Files changed
- Implementation (5): index.html, qa/narrative_consistency_offline.js, qa/ts1_default_exposure_offline.js, qa/fixtures/index-pins.json, BACKLOG.md
- Evidence (tracked): work/ai-output-2/brief.md, work/ai-output-2/review.md

`index.html` changes only `_nlmConsistencyChecks` (K3-a, K4-a) and `_ts1RowText` (RND-a). `qa/run-offline.js`, `qa/fixtures/index-pins-frozen.json`, `qa/lib/index-pins-core.js` and `qa/tools/index-pins.js` are untouched.

## What changed
- **K3-a:** reference prices = the displayed price plus `item._verifiedPrice` when finite and > 0. A `%` / `$` pair whose level is within 0.05 % (`|level − ref| / ref ≤ 0.0005`) of a reference is a day-change statement and is skipped with `continue`. Regex, 0.5 pp tolerance, first-mismatch `break`, message text and the `price === null` skip are unchanged.
- **K4-a:** floors are the `$`-prefixed numbers in `entry_zone`; the invalidation is the first `$`-prefixed number in `invalidation`. Bare numbers (MA names, `1.2x`, `Add 25 %`) are never read. Silent when either side has no `$` number. Verdict, text and long-setup rule unchanged. Implemented with one inner `const` arrow helper (`dollars`); no new top-level function or global; no brace characters inside any string, template, regex or comment.
- **RND-a:** `_ts1RowText` renders `Math.round(result.score)` and `Math.round(result.coveragePct)`. Guards, the "—" glyph, the `GATE_OFF` / `UNAVAILABLE` branch, separator and order are unchanged. No other function (`runTechScoreV1`, `scoreTickerTech`, `_ts1FillRow`, `_ts1RowMemo`) is touched.

## Evidence limitation
The 2026-10-10 repeat-pilot replies were not stored. Every fixture in NC-13 / NC-14 is a **reconstruction** from the quoted fragments (e.g. "0.52 % to $229.28", "floor 20 ≤ 50", "1.2 ≤ 20", CRWD "Add 25 %"), never captured reply text. The suite header says so.

## Before / after
Pre-implementation (RED) runs of the new rows, then after:

| Fragment (reconstructed) | Before | After |
|---|---|---|
| "Shares rose 0.52% to $229.28" at price 229.28 | K3 | none |
| same day change, displayed price 231.10, scan price 229.28 (fixture uses 1.52 %, see deviation) | K3 | none |
| entry "MA20–MA50 zone", invalidation "$272" | K4 ("floor 20 ≤ 272") | none |
| entry "$280–$285 on 1.2x volume", invalidation "$270" | K4 ("1.2 ≤ 270") | none |
| entry "Add 25 % near $300", invalidation "$280" | K4 ("25 ≤ 280") | none |
| "MA50 $221.39 – MA20 $226.10" / "Daily close below MA50 $221.39" | K4 (wrong evidence) | K4, floor 221.39 ≤ 221.39 |
| a real wrong distance ("A 17.0% move to $117.97" at 100) | K3 | K3 (unchanged) |

Tech Score row: MRNA 88.23529411764706 → "88 / 100"; NVDA 76.875 → "77 / 100"; CBOE 61.08108108108108 → "61 / 100"; 72 → "72 / 100" (each with coverage 100 → "· 100% coverage"); 87.5 coverage → "88% coverage"; null score → "— · 35% coverage"; `GATE_OFF` / `UNAVAILABLE` → "—".

RED proof (tests before the implementation): `narrative_consistency` FAIL 31 of 105, `ts1_default_exposure` FAIL 7 of 68. After: PASS 105 and PASS 72.

## Deviations from the brief
1. **NC-13b fixture text** uses "rose **1.52 %** to $229.28" instead of the brief's "0.52 %". With 0.52 % and a displayed price of 231.10 the pair is 0.787 % away, within the 0.5 pp tolerance even without the scan-price reference, so the planted negative "reference = ctx.price only" could not bite. 1.52 % makes the pair fire without the reference. The assertion also checks that the same text without `_verifiedPrice` still fires. Codex judged the deviation justified.
2. **R-3 `--diff` output** printed exactly two entries (`functions._nlmConsistencyChecks`, `functions._ts1RowText`) and no separate "file digest" row; there is no remainder, region or other entry.
3. **NC-14a fixtures** include two mixed-side sub-cases (MA names in the entry zone with a `$` invalidation, and the reverse in NC-14d) because with MA names on both sides the "bare read restored on one side" negative would not bite (the other side stays silent).

## R-3 pin-map output (`node qa/tools/index-pins.js --diff 25e41e0`)
```
index-pins --diff 25e41e0: 2 changed, 0 added, 0 removed
changed  functions._nlmConsistencyChecks
changed  functions._ts1RowText
```
(plus the unified function-text diffs; every `-`/`+` line is in the two functions). Then `--update` ("378 functions, 25 regions") and `--check` OK.

## Planted negatives (all bite; each mutates production source, never the test)
- narrative_consistency: K3-a skip removed → NC-13a; reference = ctx.price only → NC-13b; `break` instead of `continue` → NC-13d; threshold widened to 0.5 % → NC-13c; bare read restored on the entry side → NC-14a / NC-14c; bare read on the invalidation side → NC-14a / NC-14b / NC-14d.
- ts1_default_exposure: no rounding → TX-R1; `toFixed(2)` → TX-R1; coverage not rounded → TX-R2; score rounded by mutating `result.score` → TX-R3.

## QA
- Step 0 baseline (pre-edit): PASS, 81 suites, `qa.log` line 1.
- Targeted: all 15 land-tests PASS after `--update` (see `qa.log`).
- Step 10: `npm run qa:offline` PASS, 81 suites (= step-0 count), digest-gated: four `E1 … SKIP (contract pinned …)` lines, AH `89e9b370f9fb`. No forced replay (E1-D7 is not due before 2026-10-18).
- `qa/run-offline.js` T6 passes unmodified.

## Incident: PowerShell tool denial and Owner recovery ruling
During Step 0 the Worker first ran the guard-integrity check through the **PowerShell tool**; the PreToolUse hook denied it ("PowerShell tool - denied in Worker-slot sessions (R2)"). The Worker then ran the identical standalone command through the **Bash tool** (the documented Worker shell), where it was allow-listed and passed. The Worker reported this as a possible STOP-6 reroute and stopped before the heavy QA runs. The Owner ruled (verbatim):

> # Owner Ruling — STOP-6 / R2 Incident
>
> Owner approves a one-time recovery for the documented PowerShell-to-Bash incident.
>
> Basis:
> - R2 denied the PowerShell tool in the Worker slot.
> - Bash is the documented shell for Worker operations.
> - The subsequent Bash guard check was read-only and passed the applicable guard.
> - No security guard was disabled or bypassed.
>
> This is an explicit Owner recovery authorization for this incident only, not a general STOP-6 exemption.
>
> Proceed with Step 10 `npm run qa:offline`, provided the heavy lane remains free.
>
> Record the incident and this ruling in review.md. Include both in the final independent Codex review.
>
> Do not retry any other denied action, modify governance, or expand scope.
>
> Preserve all remaining STOP and R12 approval gates.

No other denial occurred. The Worker used Bash only afterwards.

## Codex ledger
| Round | Scope | Result |
|---|---|---|
| Step 8 | real implementation diff vs `25e41e0` | PASS, no Class I or Class II findings; NC-13b deviation judged justified |
| Step 12 | complete task diff incl. this file, the incident and the ruling | 0 Class I findings; 1 Class II finding (REJECT); raw output in `codex.md` `## Final check` |

FIX: 0. DEFER: 0. REJECT: 1.

- **REJECT (Class II):** Codex flagged that the `Evidence (tracked)` row of `## Files changed` names `work/ai-output-2/review.md` while the file is still untracked. Reason it does not apply: the row's two-row shape is fixed by AGENTS.md ("Task folder convention"), `review.md` is by definition committed in the Worker's step-13 commit, and it is untracked only because that commit has not been made (the brief names it as a tracked evidence file in §Y). The claim is true from the step-13 commit onward; no wording change and no implementation change.

Final check: 1 round, 1 class-II finding rejected (reason above), 0 class-I findings; self-checked (every `work/ai-output-2/` path named exists and is one of the five canonical files; counts match `qa.log`; no section reads Pending or TBD); no implementation change, no QA re-run, no further Codex.

## Backlog reconciliation
- Brief's Backlog row: entry 14 → `partial` (AO2-2); RND-1 adds no entry.
- Action taken: updated.
- Entry 14 (LATER table, status text only) before → after: "…AI text never hidden, rewritten or re-prompted. **Remains: everything beyond K1–K6 …**" → "…AI text never hidden, rewritten or re-prompted. *K3 / K4 precision fixed (`work/ai-output-2/`).* **Remains: everything beyond K1–K6 …**". The entry stays open; "beyond K1–K6 stays behind 8b" is unchanged. A one-line `BACKLOG.md` diff, no other entry, count or table touched.
- The new text matches the diff (only `_nlmConsistencyChecks` K3 / K4), the QA results above and the work being landed. RND-1 (a pilot-derived display fix, never tracked) is recorded here only.

## Timing
| Item | Value |
|---|---|
| Task start (task-base record) | 2026-10-12T18:37:05Z |
| Step 0 start / end | UNKNOWN / UNKNOWN (run in the background; Worker wall-clock not recorded) |
| Step 10 start / end | UNKNOWN / UNKNOWN |
| Codex round 1 (step 8) | UNKNOWN |
| Codex round 2 (step 12) | UNKNOWN |
| `land-request` / `push-request` print times | not yet reached |

COWORK completes the table after cleanup from `.git/pt-task`, `pt-land-log` and commit author dates (§ET).

## Lessons
- [local] A guard check issued through the wrong shell tool is itself a STOP-6 event under the literal rule; the Owner's one-time recovery ruling is recorded above.
- [backlog] Brief fixture NC-13b (0.52 % at displayed price 231.10) cannot make its own planted negative bite; the brief fixture should use a percent that is outside the 0.5 pp tolerance — pending routing
- [covered] Whole-file map suites (HL-8, MS-8, NS-11, TX-3) fail until `--update`; the brief's R-3 ordering (`--update` before the full run) already covers this.

LAND-EVIDENCE: the integrity-check result is LAND evidence (AGENTS.md step 13) and is reported at the step-13 STOP, never written here.
