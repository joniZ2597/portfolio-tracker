# Review: r1a-high1y-relabel — R-1 Slice A: show and send the 1-year high as "1Y High", never as ATH

Brief: `work/r1a-high1y-relabel/brief.md`, amendment 2 (brief commits `fe336b8`, `754da24`, `63b7a2d`). Worker B, Mode Manual (attended).
Code base: `57afd9d`; re-synced fast-forward onto `branch-dev` `21514ba` (Owner / Bootstrap, governed).

## Files changed
- Implementation (8): index.html, qa/high1y_label_offline.js, qa/tech_snapshot_cache_offline.js, qa/vis_score_caliper_offline.js, qa/deep_dive_v0_offline.js, qa/ts1_default_exposure_offline.js, qa/analyst_parser_offline.js, BACKLOG.md
- Evidence (tracked): work/r1a-high1y-relabel/brief.md, work/r1a-high1y-relabel/review.md

## What changed
- `index.html`, A1-A10 only (CRLF preserved, uniformly):
  - A1 `computeATHDistance` -> `computeHigh1yDistance` (same body, new names and doc comment);
  - A2 `classifyTechnicalSetup` reads `high1yDist` (thresholds, order, conditions and returned enum strings unchanged);
  - A3 new pure `_setupDisplay(key)`;
  - A4 two template lines of `buildTechSnapshotBlock` (`[setup: X = display]`, `1Y High Dist:`);
  - A5 `_techDeriveSnap` returns `high1yDist, hasHigh1y` in the former key slots;
  - A6 scan-prompt gating lines say "1-year high" plus the one explanation line;
  - A7 `orchestrate` audit trail stores `high1yDist` (old stored results keep `athDist`; nothing reads it);
  - A8 `_srGroupResults` group name `Extended / near 1Y high`;
  - A9 `renderMainPanel`, exactly four lines (two assessment strings, the `1Y High Distance` row, the Setup value through `_setupDisplay`);
  - A10 Deep Dive `TECHNICAL SETUP:` line carries the display wording.
- New suite `qa/high1y_label_offline.js` (auto-discovered): HL-1..HL-8 (101 asserts).
- Existing suites: only the section 2 edits (see "Existing-suite edits and revert proofs").
- `BACKLOG.md`: B1 only, new entry 34 (open, partial).

## RED / GREEN
- RED (final suite bytes against the pristine baseline `index.html`): HL-2, HL-3, HL-4, HL-5, HL-6 and HL-7 fail; HL-1 and HL-8 pass (invariants), as the brief specifies. 29 of 70 asserts failed at baseline.
- GREEN: new suite PASS 101; the approved light suites PASS on the final tree: `tech_snapshot_cache` 319, `vis_score_caliper` 307, `deep_dive_v0` 74, `scan_results_enrichment` 66, `ts1_default_exposure` 45, `analyst_parser` 57.
- Planted negatives (one mutation per scratch mirror of the GREEN tree, exact suite bytes), all caught:
  - threshold moved: HL-1 (+HL-8);
  - `athDist` left in the snapshot: HL-2 (+HL-8);
  - an "ATH" label left in the snapshot block: HL-3;
  - an "all-time" wording left in the assessment map: HL-3;
  - display map missing a key: HL-4 (+HL-3, HL-6);
  - audit still writing `athDist`: HL-7 (+HL-8);
  - an enum string changed outside the named functions: HL-8 (layer 1);
  - a score clamp changed inside a named function (orchestrate 62 -> 63): HL-8 (layer 2);
  - an extra `renderMainPanel` line: tech-snapshot TC-10 (+TC-11, TC-13);
  - A8 reverted in `_srGroupResults`: the caliper pin.
- Full `npm run qa:offline` (Owner's manual run, outside the harness, on the resynced tree): **PASS, 59 spawned suites, 0 failures**, 3 412 139 ms.

## Step-0 baseline and Owner rulings (stated plainly)
- Interim pre-edit evidence: Owner's manual full run at `57afd9d` = PASS, 57 suites; no code changed between that and the first edit (brief commits add only `work/` files).
- Fresh baseline after Worker A's Slice 0 landed (`f3c0728`, which adds one suite, `qa/run_isolation_offline.js`) = 58 suites; this task adds one suite, so the required count is 59, and the run above spawned 59.
- The full run was made by the Owner outside the harness. Two harness-run attempts were stopped by the low-memory reaper and are not evidence.
- After the full run, `branch-dev` moved once more (`21514ba`, a Worker A brief-only commit adding `work/qa-template-fixtures/brief.md`). Owner ruling: the existing 59-suite PASS remains valid (that commit changes no suite or source), no full-QA rerun, no further resync. Pre-commit integrity on the new base (`--base-dev 21514ba`, `--since 2026-10-06T08:54:33.541Z`) was run by Bootstrap: PASS, exit 0. That result is pre-commit only; Bootstrap re-runs integrity on the committed state.

## Existing-suite edits and revert proofs
Every re-pinned value, old -> new, with the proof that reverting the brief's edits reproduces the old value (script output `pins.js`, recorded in `qa.log`):
| Suite / value | Old | New | Revert proof |
|---|---|---|---|
| tech-snapshot `BASE_PINS.computeATHDistance` -> `computeHigh1yDistance` | `5f48f3d4d619dcc1be0353df0e67732ee7cc3b8c5ea14aa0656f9a0eab703138` | `e42268120acd9618ecc13a0a811c9cbdc6846d51e6a8448a1557a635bcc3b1e3` | A1 reverted -> old pin: true |
| tech-snapshot `BASE_PINS.classifyTechnicalSetup` | `bb838ad298dca58362af6521bb0a288f613d89295f0d1e99cbc699cef1415c68` | `c143eb08d982cff036dd5678def08dc38e7dede6e2a0f4ae11a79d277e3ab3ad` | A2 reverted -> old pin: true |
| tech-snapshot `BASE_PINS.buildTechSnapshotBlock` | `d4109a8e5aab963589d658d6e573ac0cb0c17860814eebcb448255e66ba908e7` | `62addea0cf73ea3e349294a359893716cabc08cb3632860b620060eaa155be29` | A4 reverted -> old pin: true |
| tech-snapshot `NEW_RM_LF`, ts1 TX-3 `renderMainPanel` (LF) | `978f40e5325c229637b1ffb0ba6f2accbe69cb604f07728781e499e78791b9d4` | `ed2c8bdcac6070d442241c4138b5f3ed155794b378d34349ac20cf0dc25aae2a` | A9 reverted (LF) -> old: true |
| tech-snapshot `NEW_RM_CALIPER_PIN`, caliper `renderMainPanel` (CRLF) | `a219c9508c69da079ac838d06aadeb97da44957c86a20ff03ca199f868e11aed` | `aea925b1775bef6c1475ff00979dda4c12cdead55e49b45d8045175052654254` | A9 reverted (CRLF) -> old: true |
| tech-snapshot `BASE_CALIPER_PINS._srGroupResults`, caliper `_srGroupResults` | `192d7dd36905c72cde459091569e0d9749a2d4b5a861c86d09c54c762078ddb1` | `56cf3149645d276df0fc66cdae605cfacf6f3a838e7b06c21b06f57ff0ed6741` | A8 reverted (CRLF form, and the caliper's raw form) -> old: true (both) |
| `analyst_parser` `PIN_MASKED_FILE` | `de37b698e29d63d8bb2f3ff1999508626c5b0d2650c663a4d52dd93689688447` | `9d3ffc5b3d98f5fa12ae75bd595bf5909ab10ef0962d587735a80fd42461948f` | `parsePerplexityContext` masked and A1-A10 reverted -> old: true |
Other edits, no assertion changed: tech-snapshot identifier renames only on the listed lines (`SNAP_KEYS`, `ENGINE_FNS` + `'_setupDisplay'`, the engine return list, TC-3, TC-8 expectation, TC-4 audit key, the TC-9 pin loop, the TC-9 "classification threshold changed" mutant anchor with the same `> 10` -> `> 11` mutation); TC-10 reverts A9 first then I7 (`revertI7(revertA9(rm))`, forward `applyA9(applyI7(...))`) via a four-entry whole-line A9 table; (g) `'_setupDisplay'` appended to the TC-6 sandbox `names` list (amendment 2); `deep_dive_v0` `FNS` + `'_setupDisplay'`. TC-11 and TC-13 only read the updated constants. The planted extra `renderMainPanel` line still fails TC-10.

## Codex ledger
Step 8 (implementation diff vs `57afd9d` plus the untracked new suite), raw in `codex.md`: no findings, verdict PASS.
| # | Finding | Class | Decision | Reason |
|---|---|---|---|---|
| - | none | - | - | - |
Final check (step 12), raw in `codex.md` under `## Final check`: complete task diff (including this file), verdict PASS, no findings.

Final check: 1 round, 0 findings, PASS; no class-I or class-II findings; no implementation change, no QA re-run.

## Backlog reconciliation
- Brief's Backlog row: Entry 34, effect `partial`.
- Action taken: `updated` (entry 34 added, open, with its partial status; no DONE / HISTORY line because the entry stays open).
- Entry heading before -> after: (absent) -> `### 34 · 1Y High vs true all-time high` (no DONE marker).
- The new BACKLOG text matches the diff, the QA results and the work being landed: Slice A relabels the 1Y High in the UI and in AI text and adds no all-time-high metric; Slice B (a true all-time high from a validated long-history source) remains.

## Boundaries confirmed
- No new data request or `fetch`, no `localStorage` / `pt_*` change, no change to setup thresholds, enum strings, score clamps, actions or Tech Score v1; the enum strings are identical everywhere (HL-1, HL-8).
- `qa/run-offline.js` (ASK-tier) not touched.
- Persisted-shape effect: new stored results carry `_auditTrail.dataCollected.high1yDist`; old stored results keep `athDist` and nothing reads it.
- Readings recorded: A3 `_setupDisplay` is inserted above the doc comment of `buildTechSnapshotBlock` so that comment stays attached to its function; `fetchAnthropicAnalysis` holds the AI prompt text, whose braces are unbalanced, so the new suite extracts it by its column-0 closing brace; HL-3 scans the two A6 gating lines and checks the mandated explanation line (which contains "ath" and "all-time") separately for presence exactly once.

## Process record
- Two valid STOP-1s were raised and resolved by brief amendments: (1) existing suites pinning values A1-A10 necessarily change (found by a pre-edit scratch sweep); (2) the TC-6 sandbox dependency, which the first sweep had hidden behind TC-1's earlier failure.
- Guard denials met and not worked around: R1 (a brief overwrite from the Worker slot; done by Bootstrap) and R10-E (an inline shell command that only edited a scratch script; the same change was made with the Edit tool on that scratch file, outside the repo).
- Light suites were run while another session's heavy QA was active; no heavy QA was started by this task during Worker A's runs.

## Lessons
- [rule] A pre-edit scratch sweep for a rename or pin task must list EVERY failing assertion per suite, not only the first lines: a group that throws at its first assertion (TC-1) hides later groups (TC-6) and under-reports the needed suite edits — pending routing
- [backlog] A suite that hashes all of `index.html` outside one function (`analyst_parser` AP-14 `PIN_MASKED_FILE`) must be re-pinned by every later task that edits `index.html`; a per-function pin would age better — pending routing
- [backlog] The same applies to the three duplicated `renderMainPanel` pins (tech-snapshot, caliper, ts1 TX-3): one shared pin source would remove the triple edit — pending routing
- [local] The pre-edit full baseline was taken from the Owner's manual run at `57afd9d` (interim) and re-measured after the resync (58 + 1 = 59).
- [covered] A full `qa:offline` started inside the harness can be reaped for low memory and leave late suites failing by construction; the full run is made by the Owner outside the harness — covered by the previous task's `[rule]` lesson.

## LAND-EVIDENCE
LAND-EVIDENCE: qa-offline=PASS 59; targeted=PASS; codex-classI-unresolved=0
