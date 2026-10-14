# review.md — display-honesty-1

Task: correct header change amount (PA-03) and real "Updated" time in the Actionable Take (PA-12). Branch `task/display-honesty-1`, base `2a26609`, Worker A, Mode Manual.

## Summary
- E-1 (PA-03): the header change amount is now `price − price / (1 + chg/100)` with the same `_pxDiv` conversion, and `—` when `1 + chg/100 ≤ 0`. FROG 97.52 / −4.61 % shows `▼4.71`, not `▼4.50`; US 226.73 / +0.95 % shows `▲2.13`; `.TA` 8884 agorot stays `▲0.84`.
- E-2 (PA-12): the Actionable Take shows `Updated: ${lastUpdated || '—'}`, the result's own time already derived by `renderMainPanel`.
- Both are the two exact §2 expressions inside `renderMainPanel`; nothing else in `index.html` changed (2-line diff, CRLF working copy preserved).

## Files changed
- Implementation (5): index.html, qa/fixtures/index-pins.json, qa/display_honesty_offline.js, qa/labs_panel_offline.js, qa/tase_units_offline.js
- Evidence (tracked): work/display-honesty-1/brief.md, work/display-honesty-1/review.md

## Execution record
- §TS at the task-start tip `2a26609`: both anchors occur exactly once in `renderMainPanel`; `BASE_PINS.renderMainPanel` = `9ae8e8b0…1493`; the TU-3 label, TU-3 US expectation and NEG-5 pair each occur once. The anchor line numbers differ from the brief's (:8687 / :8827 → :8730 / :8870) only because `surface-2` landed.
- Step 0: `qa:offline` PASS 89 suites (qa.log line 1).
- S1 RED: DH-1, DH-2 (US), DH-3, DH-4 failed on the unedited source as briefed; DH-5 (missing-timestamp half) also failed; DH-N1…N3 could not set up because the new anchors were absent.
- S2 GREEN: `index-pins --update`; `--diff 2a26609` = 1 changed (`functions.renderMainPanel`), 0 added, 0 removed; new digest `61e663bf2e3a734df928a4a8f59e6cc01691782edd0e51467caa5baebdeaecd1`. §4 deltas applied exactly (TU-3 label, TU-3 US `▲2.13`, NEG-5 pair, LB-8 re-pin with the `display-honesty-1 (was 9ae8e8b04e0d… tase-units-1)` comment).
- Targeted: display_honesty (5 rows + DH-N1…N3 caught), tase_units 9, labs_panel 32, index_pins 13, `index-pins --check` OK (380 functions, 25 regions). The other `renderMainPanel` suites PASS: asset_choice 53, tech_snapshot_cache 324, market_pill 46, narrative_consistency 153, ts1_default_exposure 72, no_synthetic_score 160, pulse_analyst_view 108, ma_stack_label 86, ath_client 123, high1y_label 103, vis_score_caliper 307, deep_dive_v0 74, ui_hygiene PASS. (The suites naming `renderMainPanel` number 16 besides the new one; the brief said 15.)
- Step 10: `qa:offline` PASS 90 suites (89 + 1), 0 FAIL, one pre-existing advisory warning.
- Process checks: step 0 clear; step 10 found Worker B's run active, waited, re-checked clear (qa.log).

## Form denial
Form denial: PowerShell process listing (R2) -> reissued as `wmic process where "name='node.exe'" get ProcessId,CommandLine` via Bash.

## Codex round one (step 8) — raw output in `codex.md`
| # | Finding | Class | Resolution |
|---|---|---|---|
| 1 | DH-3 did not assert that `chg = null` renders the dash; it only checked for no `Infinity` / `NaN` | I | **FIX**: DH-3 now asserts the null case equals `—` exactly (`hasData` false makes the whole span `—`); suite re-run green and DH-N2 still bites; included in the step-10 full run |

Codex found `index.html` matching E-1 and E-2 exactly, the formula, conversion, guard and empty-string fallback correct, DH-4 / DH-5 not sensitive to timezone or midnight, and the §4 deltas and pin changes within scope.

## Final check (step 12) — raw output in `codex.md` under `## Final check`
Final check: 1 round, 0 findings — PASS; no implementation change, no QA re-run, no class-II findings.

## Backlog reconciliation
- Brief's Backlog row: **none** (audit correction batch, not a BACKLOG entry).
- Action taken: `none`. No `BACKLOG.md` edit; the finished work's effect is `none`, so no entry changes heading before → after, and this matches the diff, the QA results and the work being landed.

## Definition of Done (brief §6)
1. DH-1…DH-5 and DH-N1…N3 pass — yes.
2. TU-3 and NEG-5 pass with the §4 delta — yes.
3. LB-8 passes after the re-pin — yes.
4. `index-pins --check` OK — yes.
5. Step 10 PASS at step 0 + 1 — yes (89 → 90).
6. Codex: no unresolved Class I — yes (see ledger).

LAND-EVIDENCE: qa-offline=PASS 90; targeted=PASS; codex-classI-unresolved=0

## Lessons
- [local] The brief's "15 `renderMainPanel` suites" is 16 on this tree; the count is informational and every one passed.
- [covered] A new `qa/*_offline.js` file must not be created while a full `qa:offline` run is in flight, because the runner auto-discovers it and shifts the count — already covered by `.claude/rules/qa-suites.md` (auto-discovery).
- [backlog] PA-16 (↻ refresh price mixing) remains deferred to CB-3 part 2 — pending routing
