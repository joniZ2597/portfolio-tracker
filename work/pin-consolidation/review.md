# review.md — pin-consolidation

LAND-EVIDENCE: qa-offline=PASS 77; targeted=PASS; codex-classI-unresolved=0

Status: candidate for the step-12 final Codex check on the complete task diff. Nothing is committed.

Baseline `f40d6b6` (task base = the brief commit). Mode: attended Auto, offline work only.

## QA result
- Step-0 baseline (`work/pin-consolidation/qa.log` line 1): `npm run qa:offline` PASS, 76 suites, 1209 s.
- Targeted suites after migration and freeze (each exit 0): `index_pins` 13 rows (IP-1 .. IP-12, IP-1 as positive + negative), `vis_score_caliper` 307, `tech_snapshot_cache` 324, `no_synthetic_score` 160, `dh_ui_vocabulary` 65, `eod_preexport_warning` 58, `eod_packet_v0` 196, `ts1_default_exposure` 45, `ma_stack_label` 86, `pulse_analyst_view` 108, `high1y_label` 103, `analyst_parser` 57, `ath_isolation` 23, `ath_client` 123; untouched readers `narrative_consistency` 79, `scan_results_enrichment` 67, `deep_dive_v0` 74, `ui_hygiene` PASS. `node qa/tools/index-pins.js --check`: OK (375 functions, 25 regions).
- Full `qa:offline` (clean retry, after the first attempt was interrupted by memory pressure and its orphaned process tree was stopped): `OFFLINE VALIDATION: PASS`, **77 spawned suites** (76 baseline + `qa/index_pins_offline.js`), 1276 s (21m16s), exit 0, 0 FAIL lines, 1 advisory warning (smart quote at `index.html` line 10813, identical to the step-0 baseline). Both runs, including the interrupted one (marked INCOMPLETE), are in `work/pin-consolidation/qa.log`.

## RED -> GREEN record (new assertions)
`qa/index_pins_offline.js` written first: 12/12 FAIL (core/tool absent), then GREEN after the core, tool and map were built; one design correction on the way (regions may span whole functions, partial overlaps still rejected). IP-12 (frozen fixture integrity) was added during the freeze.

## Codex review (steps 8, 9 and 12)
Raw output verbatim in `work/pin-consolidation/codex.md` (untracked): round 1 (implementation diff), "## Re-review" (round 2) and "## Final check" (round 3). Every Codex finding is classified FIX / DEFER / REJECT below; no DEFER was needed.

- Round 1 (implementation diff): **HOLD** on Class I findings 2, 3 and 15, which the Worker disputed with evidence.
- Round 2 (re-review of the disputed findings plus the two approved test fixes): **PASS** - findings 2, 3 and 15 RESOLVED, finding 13 fixed. Round 2 raised no new finding.
- Round 3 (step-12 final check on the complete task diff including this file): **HOLD** on one Class I finding (A, landing scope), rejected with committed-rule evidence (below), plus one Class II documentation finding (B), fixed here. Sections C (implementation), D (evidence) and E (governance) had no finding.

### Round 1 and 2 ledger
| # | Codex finding | Class | Disposition | Reason / evidence |
|---|---|---|---|---|
| 1 | Scope: all 13 + 5 paths are in brief section 8; `index.html` and product files unchanged | I (as labelled by Codex) | **REJECT** | Not a defect: a statement of compliance, nothing to change |
| 2 | Whole-file/masked replacements (AP-14, HL-8 layer 1, MS-8, NS-11) lose coverage of a newly added top-level function because `entryNamesExcept` lists only names already in the map | I | **REJECT** (claim not correct; independently confirmed in round 2) | Every function span is replaced in the remainder by a placeholder carrying its key (`\0functions.NAME\0`) and every R2 check includes `remainder`, so an added, deleted, renamed or reordered function changes `remainderSha256` (a function inside a spanning region changes that region). Measured with the map NOT refreshed, one top-level function added / renamed / deleted: `analyst_parser` AP-14, `high1y_label` HL-8 layer 1, `ma_stack_label` MS-8, `no_synthetic_score` NS-11, `ath_isolation` AR-7i and `index_pins` IP-1 all FAIL, the same suites that fail on the old HEAD suites. Codex round 2 traced `buildMapDetailed` / `entryMismatches` and found no escaping case |
| 3 | NS-11 omits `fileSha256` | I | **REJECT** (confirmed in round 2) | `fileSha256` cannot be compared in NS-11: the old pin let the five changed functions vary. Functions + regions + remainder partition the file, so any change outside the five is some entry's change |
| 4 | R2 replacements otherwise use the intended granular entries | informational | **REJECT** | Not a defect; the open point it refers to is finding 2 |
| 5 | R3 anchors and region spans: no proven region-granularity loss | informational | **REJECT** | Not a defect |
| 6 | Named R2 replacements, `dh_ui_vocabulary` `constOk`, layer 2 raw digests | informational | **REJECT** | Not a defect; the only open point is finding 2 |
| 7 | `entryMismatches` behaviour (fails closed, does not report unrequested entries) | informational | **REJECT** | Not a defect; unrequested additions are carried by `remainder` (finding 2) |
| 8 | R7 review: no behaviour assertion altered; dead pin-only helpers / capture paths removed | II | **REJECT** | Not a defect: confirmation. The helper removals are listed under residual risks below |
| 9 | Frozen-chain negatives bite (the mutated frozen input is what `evaluate` receives) | informational | **REJECT** | Not a defect: confirmation |
| 10 | Extractor limitation (character brace matching, column-0 fallback) is disclosed | II | **REJECT** | Disclosed in the core header and `plan.md`; parity with the old extractors is pinned by IP-11 |
| 11 | Region resolution and map comparison correct | informational | **REJECT** | Not a defect |
| 12 | Tool modes (`--check`, `--update`, `--diff`) correct | informational | **REJECT** | Not a defect |
| 13 | IP-10 asserts selected entries only, not the full changed-entry set | II | **FIX** | `qa/index_pins_offline.js`: IP-10 now parses every `changed/added/removed` line of the `--diff` output and compares the sorted set exactly, with two controls (extra line, missing line). Mutation: a tool that prints a spurious `changed  functions.gamma` makes IP-10 FAIL on the exact-set assertion. Round 2: correct, order-independent, non-vacuous |
| 14 | IP-11 handling of duplicate names | II | **REJECT** | Duplicates are tested in IP-8; IP-11 deliberately uses unique names |
| 15 | Add a function-set assertion before the whole-file checks are "equivalent" | I | **FIX** (assertion added; the underlying claim is rejected as in finding 2) | IP-5 now proves that an added, deleted and renamed top-level function changes `remainderSha256` and that `entryMismatches(text, map, entryNamesExcept(...))` flags `remainder`, with controls (unchanged text passes; a masked function may still change; a named-functions-only check does not see an added function, which shows the remainder is the carrier). Mutation: a core whose placeholder no longer carries the function key makes IP-5 FAIL on "renamed: remainderSha256 changes". Round 2: RESOLVED |

### Round 3 (final check) ledger
| # | Codex finding | Class | Disposition | Reason / evidence |
|---|---|---|---|---|
| A | `review.md` is listed in brief section 8 but not in the `land-scope` block, so the approved landing scope does not cover the complete diff | I | **REJECT** (false positive; committed rules verified, tree clean against HEAD for `.claude/**` and `AGENTS.md`) | (1) `.claude/hooks/pt-land.js` `diffCheck` builds `allowed = new Set(scopePaths.concat([reviewPath]))` (line 444) and refuses when `files.indexOf(reviewPath) === -1` (line 447); the `land-request` path passes `'work/' + idPart + '/review.md'` as `reviewPath` (lines 553-557); `landEvidenceCheck` reads the LAND-EVIDENCE line from that same path (lines 470-476). `review.md` is therefore required in the diff and implicitly allowed, never listed. (2) `AGENTS.md` lines 532-534: "A brief never needs to name its own `brief.md` or `review.md` in its implementation scope - they are evidence, outside the implementation diff by definition." (3) The `late-sync-1` brief's `land-scope` block likewise omits `review.md`. The brief is not amended |
| B | The Codex ledger does not consistently use FIX / DEFER / REJECT | II | **FIX** | This section: every row above carries FIX or REJECT with a reason. Done in `review.md` only; no implementation change |
| C | Implementation: no remaining Class I finding | - | **REJECT** | No finding raised; Codex re-checked the core, tool, frozen fixture, IP-5 and IP-10 |
| D | Mutation evidence: the 115 scratch mutations cannot be recounted from the task diff | observation | **REJECT** | Not a defect: the raw output is scratch evidence by design and is not tracked; the counts are recorded in this file and the key mutations were re-run in round 2 |
| E | Governance: no ASK-, DENY- or PROTECTED-tier path touched | - | **REJECT** | No finding raised |

Final check: 1 round, 1 class-I finding - 0 FIX, 0 DEFER, 1 REJECT, 0 unresolved; 1 class-II finding fixed, self-checked; no implementation change, no QA re-run.

### Round-2 mutation evidence for the contested findings (private sandbox copies; the working tree was not touched)
- ADD / RENAME / DELETE one top-level function, map not refreshed: FAIL in AP-14, HL-8 layer 1, MS-8, NS-11, AR-7i and IP-1 (and IP-11 for rename / delete). Same suites fail on the old HEAD suites for the same edit.
- Mutated core (placeholder without the function key): `index_pins` exit 1 - IP-1 positive and IP-5 ("renamed: remainderSha256 changes").
- Mutated tool (`--diff` prints a spurious extra entry): `index_pins` exit 1 - IP-10 exact-set assertion.
- Targeted after the two test changes: `node qa/index_pins_offline.js` 13/13 PASS, `node qa/tools/index-pins.js --check` OK (375 functions, 25 regions).

## Files changed
- Implementation (18): qa/lib/index-pins-core.js, qa/tools/index-pins.js, qa/fixtures/index-pins.json, qa/fixtures/index-pins-frozen.json, qa/index_pins_offline.js, qa/vis_score_caliper_offline.js, qa/tech_snapshot_cache_offline.js, qa/no_synthetic_score_offline.js, qa/dh_ui_vocabulary_offline.js, qa/eod_preexport_warning_offline.js, qa/eod_packet_v0_offline.js, qa/ts1_default_exposure_offline.js, qa/ma_stack_label_offline.js, qa/pulse_analyst_view_offline.js, qa/high1y_label_offline.js, qa/analyst_parser_offline.js, qa/ath_isolation_offline.js, qa/ath_client_offline.js
- Evidence (tracked): work/pin-consolidation/brief.md, work/pin-consolidation/review.md

## Backlog reconciliation
Brief Backlog row: none. Action taken: none. No `BACKLOG.md` edit; the finished work's effect is none, matching the brief.

## index-pins --diff against the task base (closing evidence)
`node qa/tools/index-pins.js --diff f40d6b6` -> `index-pins --diff f40d6b6: no function or region differs` (`index.html` untouched; `git diff f40d6b6 -- index.html` is empty).

## Lessons
- [rule] A suite that compares "all map entries except the masked ones" gets added-function detection from the remainder placeholders, not from the name list; keep that property pinned by a test (IP-5) so a future change to the placeholder scheme cannot silently drop it.
- [rule] Chain checks that hash a reverted result need a frozen input; behaviour comparisons that only need the revert to succeed can stay live-derived. Freeze the first kind, not the second.
- [local] The `ts1_default_exposure` extractor drops `async `, so its pins did not equal the map digests in the generated ledger; the ledger was corrected during migration.
- [backlog] The Edit tool rewrote four CRLF suites to LF; byte-audit every touched file (restored here) — pending routing.

## Ledger and migration evidence (moved from plan.md)

## Migration record (Main Control ruling: migrate the 13 suites, R1-R3/R6 first, then freeze R4)

### Corrections to the generated ledger (rows above)
| Row | Generated label | Actual | Replacement |
|---|---|---|---|
| `ts1_default_exposure`:136, :137 | R5 historical | **live R1** (CRLF-normalised hash of the no-`async` extraction) | `functions.runTechScoreV1`, `functions._ts1FillRow` |
| `tech_snapshot_cache`:85, :86, :87 (`BASE_TS1_TX3`) | R5 historical | **R6**: expectations about the TS1 suite's pin values | rewritten to assert the TS1 suite's `TX3_FNS` list |
| `tech_snapshot_cache`:56-58 (`BASE_PINS` `_ptScoreDial/_ptScoreText/_ptScoreNorm`) | R1 | dead entries (never read) | removed with `BASE_PINS` |
| `ath_isolation`:212 (`index.html` whole file) | R2 | whole-file digest = map `fileSha256` (**equal to the old pin 953aaf6a…**, verified) | `fileSha256` check; 3 server pins stay (R5) |
| `tech_snapshot_cache`:62, :63; `ma_stack_label`:39, :40; `no_synthetic_score`:43-47 | R4/R5 | historical operands of the frozen chains | unchanged |
| `dh_ui_vocabulary`:274, :275 | OPEN-1 | retained under R7 (Owner ruling) | unchanged |

### Per-suite inventory (OPEN-2) and result — all targeted suites green after migration
| Suite | Pins migrated | Chain / text-read handling | Dead code removed | Result |
|---|---|---|---|---|
| `vis_score_caliper` | 10 fn + CSS region (R1, R3) | - | `sha256` helper | PASS 307 |
| `tech_snapshot_cache` | TC-9/TC-13 fn + TS1 region, TC-10 live, TC-11 CSS (R1, R3) | TC-11/TC-13 caliper+TS1 text reads rewritten (R6); **TC-10 frozen (R4)**; 4 planted negatives re-pointed, 2 frozen negatives added | `BASE_PINS`, `BASE_TS1_REGION`, `NEW_RM_*`, `BASE_CALIPER_*`, `BASE_TS1_TX3` | PASS 324 |
| `no_synthetic_score` | 12 isolation fn (R1), `PRE_MASKED_FIVE` (R2: every entry except the 5 changed fns) | **NS-12 frozen (R4)**, 2 frozen negatives; behaviour tests keep live `task`/`pre` (R7) | `ISOLATION_PINS`, `PRE_MASKED_FIVE`, capture-mode outputs | PASS 160 |
| `dh_ui_vocabulary` | 5+3 fn (R1), `CONST_HASH` (R3: line sequence + 20 regions) | FORBIDDEN_LINE_HASH kept (R7, OPEN-1); UV-5 literal compare kept | `FN_HASHES`, `AG6_HASHES`, `CONST_HASH` | PASS 65 |
| `eod_preexport_warning` | 6 fn + `DH_DISPLAY` region | - | `sha`, `crypto` | PASS 58 |
| `eod_packet_v0` | `_eodPacketToMarkdown`, `_pfEodIsStale` | `*_PRETASK_SHA256` / `*_DH_M1_SHA256` kept only for the historical "genuinely a re-pin" assertion (R5) | `crypto` | PASS 196 |
| `ts1_default_exposure` | 4 fn (TX-3) | - | `BASE_HASHES`, `sha256`, `crypto` | PASS 45 |
| `ma_stack_label` | `classifyTechnicalSetup`, `tsassessmap` region, MS-8 masked file (R2) | **MS-7 frozen (R4)**, 2 frozen negatives, live map check added | 3 `PIN_*` | PASS 86 |
| `pulse_analyst_view` | `fetchAnthropicAnalysis` | **PA-12 frozen (R4)**, 3 negatives; PA-6/PA-7 pre variants stay live-derived (R7) | `PIN_PROMPT_FN_LF` | PASS 108 |
| `high1y_label` | layer 2: 9 fn; layer 1 (R2: every entry except the 9 named fns and `_setupDisplay`) | - | `PINS`, `NORM`, `regionOf`, `layer1`, `pinsOf`, `HL_CAPTURE`, `sha256`, `crypto` | PASS 103 |
| `analyst_parser` | `fetchPerplexityContext`, `_allNone` region, AP-14 masked file (R2) | `PIN_FIXTURE` stays (R5) | 3 `PIN_*` | PASS 57 |
| `ath_isolation` | `index.html` whole-file -> `fileSha256` (R2) | 3 server pins stay (R5) | - | PASS 23 |
| `ath_client` | none (no live pin) | **AC-13 frozen (R4)**, 3 negatives; AC-1 pre variants stay live-derived (R7) | - | PASS 123 |

Targets unchanged: `narrative_consistency` PASS 79, `scan_results_enrichment` PASS 67, `deep_dive_v0` PASS 74, `ui_hygiene` PASS. IP suite: 13 rows PASS (IP-12 added: frozen fixture integrity). `index-pins --check` OK (375 functions, 25 regions). `index.html` untouched.

### Mutation evidence (scratch sandbox copy of the repo, one 1-byte `/*m*/` insertion per entry, unmutated control passes first)
- 115 mutations x {old suites at HEAD, migrated suites}: **115/115 caught on each side**, 0 controls failing. Spans: every migrated function digest, the CSS / TS1 / DH_DISPLAY / `_allNone` / `_tsAssessMap` regions, the 20 `dh_const_*` regions, and for each R2 suite a function, a region and the remainder outside its masked set. Raw output kept in the Worker scratchpad (`evidence.txt`).
- An anchor-destroying mutation of a region makes the map uncomputable and the suites fail closed (stricter than the old pin, same outcome).

### Frozen-chain evidence (R4, applied only after the R1-R3/R6 gate above was green)
- `qa/fixtures/index-pins-frozen.json` (5 chains, 14 function texts, LF, sha256 per entry; IP-12 pins its integrity).
- A benign live `renderMainPanel` edit with the map NOT refreshed fails exactly one map-entry assertion per chain suite (TC-10, MS-7, NS-12, PA-12, AC-13; TC-13 TX-3 guard in tech) and none of the chain-structure assertions.
- Later-task simulation (comment line in `renderMainPanel`, one new top-level function, a PF_ constant edit appended comment): OLD suites at HEAD: 9 of 13 FAIL (caliper, tech, nss, ts1, ma, high1y, analyst_parser, ath_isolation, +dh with the PF edit). NEW suites after ONE `index-pins --update`: 13/13 + IP PASS (with the PF edit, dh still fails by design: a changed PF_ declaration needs its region anchor edited, the same re-pin the old `CONST_HASH` forced).
- Frozen planted negatives: TC-10 x2, MS-7 x2, NS-12 x2, PA-12 x2 (+1 live), AC-13 x2 (+1 live), each caught.

### Residual risks / items for review
1. Behaviour comparisons that build a "pre-change" variant by reverting the LIVE function (PA-6/PA-7, NS-4/NS-9, AC-1) are R7-unchanged by ruling and still depend on their table lines staying present; they are not hash-bound, so unrelated edits do not break them.
2. A deliberately changed `PF_*` / `STALE_RESULT_THRESHOLD_MS` declaration needs its `dh_const_*` region anchor edited in `qa/fixtures/index-pins.json` (anchors are definitions; digests stay generated).
3. A new top-level function is not itself an error any more: it changes `remainderSha256`, the committed map must be regenerated (`--update`) and the line-level evidence is `--diff <ref>` (this replaces the hand-written revert tables).
4. Small edits beyond pure pin swaps, all inside the 13 suites: removal of now-dead helpers (`sha`/`crypto`/capture modes), extra planted negatives for the frozen chains plus re-pointed text-read negatives, one extra IP row (IP-12).

## Pin -> replacement ledger (generated; baseline f40d6b6; map = qa/fixtures/index-pins.json: 375 functions, 25 regions)

Pin literals found in the 13 suites: 111. By rule: {"R3":7,"R1":79,"R4/R5":8,"R5":10,"R2":5,"OPEN-1":2}.

CONST_HASH join check (dh_const_* regions in file order, leading line break stripped): EQUAL to CONST_HASH.

| # | Suite:line | Old pin | Rule | Old pin covers | Replacement |
|---|---|---|---|---|---|
| 1 | `vis_score_caliper`:84 | `b4c63e696fe9` | R3 | `protectedCssBlock !== null && sha256(protectedCssBlock) === <h>);` | regions.caliper_protected_css (CRLF form; sha equal to the old pin) |
| 2 | `vis_score_caliper`:87 | `f1e1fb44de60` | R1 | `_ptScoreNorm: <h>,` | functions._ptScoreNorm (CRLF form; sha equal to the old pin) |
| 3 | `vis_score_caliper`:88 | `27c3d9d3ad7b` | R1 | `_ptScoreText: <h>,` | functions._ptScoreText (CRLF form; sha equal to the old pin) |
| 4 | `vis_score_caliper`:89 | `bf237908d383` | R1 | `_ptScoreCmp: <h>,` | functions._ptScoreCmp (CRLF form; sha equal to the old pin) |
| 5 | `vis_score_caliper`:90 | `29413b98a5ed` | R1 | `_ptScoreAvg: <h>,` | functions._ptScoreAvg (CRLF form; sha equal to the old pin) |
| 6 | `vis_score_caliper`:91 | `41968b418333` | R1 | `_ptScoreStates: <h>,` | functions._ptScoreStates (CRLF form; sha equal to the old pin) |
| 7 | `vis_score_caliper`:92 | `dfeb1959f3ca` | R1 | `_ptScoreFillHtml: <h>,` | functions._ptScoreFillHtml (CRLF form; sha equal to the old pin) |
| 8 | `vis_score_caliper`:93 | `4092f243120f` | R1 | `_ptScoreDial: <h>,` | functions._ptScoreDial (CRLF form; sha equal to the old pin) |
| 9 | `vis_score_caliper`:94 | `f4ebde1c851d` | R1 | `_srGroupResults: <h>, // R-5 (Entry 37) re-pin: Pulse-only ordering` | functions._srGroupResults (CRLF form; sha equal to the old pin) |
| 10 | `vis_score_caliper`:95 | `cf7cc5c9dffd` | R1 | `_srRenderGrouped: <h>, // R-5 (Entry 37) + R-6 (Entry 14 s1) re-pin: n` | functions._srRenderGrouped (CRLF form; sha equal to the old pin) |
| 11 | `vis_score_caliper`:96 | `cb02c3957535` | R1 | `renderMainPanel: <h> // R-5 (Entry 37) + B4 (Entry 34) + R-6 (Entry 14` | functions.renderMainPanel (CRLF form; sha equal to the old pin) |
| 12 | `tech_snapshot_cache`:44 | `c143eb08d982` | R1 | `classifyTechnicalSetup: <h>,` | functions.classifyTechnicalSetup (LF form; sha equal to the old pin) |
| 13 | `tech_snapshot_cache`:45 | `2428a64e204b` | R1 | `buildTechSnapshotBlock: <h>, // B4 (Entry 34, D-B4-2 = A) re-pin: the ` | functions.buildTechSnapshotBlock (LF form; sha equal to the old pin) |
| 14 | `tech_snapshot_cache`:46 | `c477a33a601b` | R1 | `computeSMA: <h>,` | functions.computeSMA (LF form; sha equal to the old pin) |
| 15 | `tech_snapshot_cache`:47 | `ec61724ddae4` | R1 | `computePctDiff: <h>,` | functions.computePctDiff (LF form; sha equal to the old pin) |
| 16 | `tech_snapshot_cache`:48 | `84f3e7318a95` | R1 | `computeRelativePerf: <h>,` | functions.computeRelativePerf (LF form; sha equal to the old pin) |
| 17 | `tech_snapshot_cache`:49 | `5fc9378eded8` | R1 | `computeVolumeMetrics: <h>,` | functions.computeVolumeMetrics (LF form; sha equal to the old pin) |
| 18 | `tech_snapshot_cache`:50 | `e42268120acd` | R1 | `computeHigh1yDistance: <h>,` | functions.computeHigh1yDistance (LF form; sha equal to the old pin) |
| 19 | `tech_snapshot_cache`:51 | `e1406d9bfe83` | R1 | `enforceScoreConsistency: <h>,` | functions.enforceScoreConsistency (LF form; sha equal to the old pin) |
| 20 | `tech_snapshot_cache`:52 | `306a720ed517` | R1 | `_ts1FillRow: <h>,` | functions._ts1FillRow (LF form; sha equal to the old pin) |
| 21 | `tech_snapshot_cache`:53 | `e31f1671b090` | R1 | `_initTsCard: <h>,` | functions._initTsCard (LF form; sha equal to the old pin) |
| 22 | `tech_snapshot_cache`:54 | `cbb5b8aef9cd` | R1 | `runTechScoreV1: <h>,` | functions.runTechScoreV1 (LF form; sha equal to the old pin) |
| 23 | `tech_snapshot_cache`:55 | `6df1e8355698` | R1 | `_ts1RowText: <h>,` | functions._ts1RowText (LF form; sha equal to the old pin) |
| 24 | `tech_snapshot_cache`:56 | `22a2c59e47fc` | R1 | `_ptScoreDial: <h>,` | functions._ptScoreDial (LF form; sha equal to the old pin) |
| 25 | `tech_snapshot_cache`:57 | `5b22d6c5daa4` | R1 | `_ptScoreText: <h>,` | functions._ptScoreText (LF form; sha equal to the old pin) |
| 26 | `tech_snapshot_cache`:58 | `4ab627ca0c86` | R1 | `_ptScoreNorm: <h>` | functions._ptScoreNorm (LF form; sha equal to the old pin) |
| 27 | `tech_snapshot_cache`:60 | `9b267da4c06a` | R3 | `const BASE_TS1_REGION = <h>;` | regions.ts1_region (LF form; sha equal to the old pin) |
| 28 | `tech_snapshot_cache`:62 | `a8c13d283ad9` | R4/R5 | BASE_RM_LF: pre-task renderMainPanel; operand of the table revert chain TC-10 | frozen source (index-pins-frozen.json) |
| 29 | `tech_snapshot_cache`:63 | `d11b09a989f1` | R5 | OLD_RM_CALIPER_PIN: historical caliper pin of the pre-task renderMainPanel | unchanged (historical) |
| 30 | `tech_snapshot_cache`:65 | `a248cfabfa0b` | R1 | `const NEW_RM_LF = <h>;` | functions.renderMainPanel (LF form; sha equal to the old pin) |
| 31 | `tech_snapshot_cache`:66 | `cb02c3957535` | R1 | `const NEW_RM_CALIPER_PIN = <h>;` | functions.renderMainPanel (CRLF form; sha equal to the old pin) |
| 32 | `tech_snapshot_cache`:72 | `f1e1fb44de60` | R1 | `_ptScoreNorm: <h>,` | functions._ptScoreNorm (CRLF form; sha equal to the old pin) |
| 33 | `tech_snapshot_cache`:73 | `27c3d9d3ad7b` | R1 | `_ptScoreText: <h>,` | functions._ptScoreText (CRLF form; sha equal to the old pin) |
| 34 | `tech_snapshot_cache`:74 | `bf237908d383` | R1 | `_ptScoreCmp: <h>,` | functions._ptScoreCmp (CRLF form; sha equal to the old pin) |
| 35 | `tech_snapshot_cache`:75 | `29413b98a5ed` | R1 | `_ptScoreAvg: <h>,` | functions._ptScoreAvg (CRLF form; sha equal to the old pin) |
| 36 | `tech_snapshot_cache`:76 | `41968b418333` | R1 | `_ptScoreStates: <h>,` | functions._ptScoreStates (CRLF form; sha equal to the old pin) |
| 37 | `tech_snapshot_cache`:77 | `dfeb1959f3ca` | R1 | `_ptScoreFillHtml: <h>,` | functions._ptScoreFillHtml (CRLF form; sha equal to the old pin) |
| 38 | `tech_snapshot_cache`:78 | `4092f243120f` | R1 | `_ptScoreDial: <h>,` | functions._ptScoreDial (CRLF form; sha equal to the old pin) |
| 39 | `tech_snapshot_cache`:79 | `f4ebde1c851d` | R1 | `_srGroupResults: <h>, // R-5 (Entry 37) re-pin: Pulse-only ordering (R` | functions._srGroupResults (CRLF form; sha equal to the old pin) |
| 40 | `tech_snapshot_cache`:80 | `cf7cc5c9dffd` | R1 | `_srRenderGrouped: <h> // R-5 (Entry 37) + R-6 (Entry 14 s1) re-pin: ne` | functions._srRenderGrouped (CRLF form; sha equal to the old pin) |
| 41 | `tech_snapshot_cache`:82 | `b4c63e696fe9` | R3 | `const BASE_CALIPER_CSS_HASH = <h>;` | regions.caliper_protected_css (CRLF form; sha equal to the old pin) |
| 42 | `tech_snapshot_cache`:85 | `f36bc4eb5cba` | R5 | BASE_TS1_TX3.runTechScoreV1: pre-task value (the live pin is a BASE_PINS row) | unchanged (historical) |
| 43 | `tech_snapshot_cache`:86 | `17c8863a09b3` | R5 | BASE_TS1_TX3._ts1FillRow: pre-task value | unchanged (historical) |
| 44 | `tech_snapshot_cache`:87 | `6df1e8355698` | R1 | `_ts1RowText: <h>` | functions._ts1RowText (LF form; sha equal to the old pin) |
| 45 | `no_synthetic_score`:43 | `58ba6884b740` | R4/R5 | PRE.analyzeChunk: pre-task value, NS-12 revert chain | frozen source |
| 46 | `no_synthetic_score`:44 | `86977a95cf70` | R4/R5 | PRE.orchestrate: pre-task, NS-12 | frozen source |
| 47 | `no_synthetic_score`:45 | `05411db01b99` | R4/R5 | PRE._isValidScanResult: pre-task, NS-12 | frozen source |
| 48 | `no_synthetic_score`:46 | `e7d27b3cfc81` | R4/R5 | PRE._srGroupResults: pre-task, NS-12 | frozen source |
| 49 | `no_synthetic_score`:47 | `e84c5e61abcb` | R4/R5 | PRE.renderMainPanel: pre-task, NS-12 | frozen source |
| 50 | `no_synthetic_score`:52 | `f122f497eccc` | R2 | PRE_MASKED_FIVE: index.html with 5 functions masked (NS-11) | functions.* + regions.* + remainderSha256 (finer: every function has its own entry) |
| 51 | `no_synthetic_score`:55 | `e1406d9bfe83` | R1 | `enforceScoreConsistency: <h>,` | functions.enforceScoreConsistency (LF form; sha equal to the old pin) |
| 52 | `no_synthetic_score`:56 | `4ab627ca0c86` | R1 | `_ptScoreNorm: <h>,` | functions._ptScoreNorm (LF form; sha equal to the old pin) |
| 53 | `no_synthetic_score`:57 | `5b22d6c5daa4` | R1 | `_ptScoreText: <h>,` | functions._ptScoreText (LF form; sha equal to the old pin) |
| 54 | `no_synthetic_score`:58 | `aa1725886484` | R1 | `_ptScoreCmp: <h>,` | functions._ptScoreCmp (LF form; sha equal to the old pin) |
| 55 | `no_synthetic_score`:59 | `34885d90dd63` | R1 | `_ptScoreAvg: <h>,` | functions._ptScoreAvg (LF form; sha equal to the old pin) |
| 56 | `no_synthetic_score`:60 | `6a3fc2e35040` | R1 | `_ptScoreStates: <h>,` | functions._ptScoreStates (LF form; sha equal to the old pin) |
| 57 | `no_synthetic_score`:61 | `389f2ba8e399` | R1 | `_ptScoreFillHtml: <h>,` | functions._ptScoreFillHtml (LF form; sha equal to the old pin) |
| 58 | `no_synthetic_score`:62 | `22a2c59e47fc` | R1 | `_ptScoreDial: <h>,` | functions._ptScoreDial (LF form; sha equal to the old pin) |
| 59 | `no_synthetic_score`:63 | `eef0d08a4d9e` | R1 | `applyCapitalReturnsNudge: <h>,` | functions.applyCapitalReturnsNudge (LF form; sha equal to the old pin) |
| 60 | `no_synthetic_score`:64 | `08286eba0216` | R1 | `_renderPortfolioPanel: <h>, // R-5 (Entry 37) re-pin: neutral "Analyst` | functions._renderPortfolioPanel (LF form; sha equal to the old pin) |
| 61 | `no_synthetic_score`:65 | `bcec3745e351` | R1 | `_dd0FetchAnalysis: <h>,` | functions._dd0FetchAnalysis (LF form; sha equal to the old pin) |
| 62 | `no_synthetic_score`:66 | `c143eb08d982` | R1 | `classifyTechnicalSetup: <h>` | functions.classifyTechnicalSetup (LF form; sha equal to the old pin) |
| 63 | `dh_ui_vocabulary`:245 | `251a554adacb` | R1 | `_pfEodIsStale: <h>,` | functions._pfEodIsStale (LF form; sha equal to the old pin) |
| 64 | `dh_ui_vocabulary`:246 | `e59989a2b68b` | R1 | `_pfFxState: <h>,` | functions._pfFxState (LF form; sha equal to the old pin) |
| 65 | `dh_ui_vocabulary`:247 | `175a6ae8ddeb` | R1 | `_pfComputeReconciliation: <h>,` | functions._pfComputeReconciliation (LF form; sha equal to the old pin) |
| 66 | `dh_ui_vocabulary`:248 | `f42b25e47060` | R1 | `_pfComputeNeedsAttention: <h>,` | functions._pfComputeNeedsAttention (LF form; sha equal to the old pin) |
| 67 | `dh_ui_vocabulary`:249 | `2b62766507c2` | R1 | `_pfComputePortfolioReporting: <h>` | functions._pfComputePortfolioReporting (LF form; sha equal to the old pin) |
| 68 | `dh_ui_vocabulary`:251 | `8c802d21fa4e` | R3 | CONST_HASH: joined lines of PF_* / STALE_RESULT_THRESHOLD_MS declarations | 20 regions dh_const_* (one per declaration line incl. its line break); join check below |
| 69 | `dh_ui_vocabulary`:274 | `fecd54030753` | OPEN-1 | FORBIDDEN_LINE_HASH[PANEL]: hash of the forbidden-token LINES inside one function (derived line set, not a span) | function entry covers the text, but the invariant is a derived property: see OPEN-1 |
| 70 | `dh_ui_vocabulary`:275 | `e3b0c44298fc` | OPEN-1 | FORBIDDEN_LINE_HASH[BANNER]: sha256 of the empty string = no forbidden lines in the banner function | see OPEN-1 |
| 71 | `dh_ui_vocabulary`:624 | `e59989a2b68b` | R1 | `_pfFxState: <h>,` | functions._pfFxState (LF form; sha equal to the old pin) |
| 72 | `dh_ui_vocabulary`:625 | `b444b89c17e2` | R1 | `_pfFxRateValid: <h>,` | functions._pfFxRateValid (LF form; sha equal to the old pin) |
| 73 | `dh_ui_vocabulary`:626 | `900eb54bd0ac` | R1 | `_dhLabel: <h>` | functions._dhLabel (LF form; sha equal to the old pin) |
| 74 | `eod_preexport_warning`:118 | `75dd711f2911` | R1 | `_eodComputeReadiness: <h>,` | functions._eodComputeReadiness (CRLF form; sha equal to the old pin) |
| 75 | `eod_preexport_warning`:119 | `7624e7139a69` | R1 | `_eodBuildPacket: <h>,` | functions._eodBuildPacket (CRLF form; sha equal to the old pin) |
| 76 | `eod_preexport_warning`:120 | `d1b7c64763db` | R1 | `_eodReadinessLines: <h>,` | functions._eodReadinessLines (CRLF form; sha equal to the old pin) |
| 77 | `eod_preexport_warning`:121 | `bdaba2e2a460` | R1 | `_eodPacketToMarkdown: <h>,` | functions._eodPacketToMarkdown (CRLF form; sha equal to the old pin) |
| 78 | `eod_preexport_warning`:122 | `120d02d68633` | R1 | `_eodPacketToBriefing: <h>,` | functions._eodPacketToBriefing (CRLF form; sha equal to the old pin) |
| 79 | `eod_preexport_warning`:123 | `1d95989fe9ee` | R1 | `_dhLabel: <h>,` | functions._dhLabel (CRLF form; sha equal to the old pin) |
| 80 | `eod_preexport_warning`:124 | `ba21a8118149` | R3 | `DH_DISPLAY: <h>` | regions.dh_display (CRLF form; sha equal to the old pin) |
| 81 | `eod_packet_v0`:695 | `b7ea051d1b5c` | R5 | EOD_PACKET_TO_MARKDOWN_PRETASK_SHA256: historical operand | unchanged (historical) |
| 82 | `eod_packet_v0`:696 | `366f51e36c1f` | R1 | `const EOD_PACKET_TO_MARKDOWN_DH_M1_SHA256 = <h>;` | functions._eodPacketToMarkdown (LF form; sha equal to the old pin) |
| 83 | `eod_packet_v0`:1120 | `251a554adacb` | R1 | `const IS_STALE_BASE_SHA256 = <h>;` | functions._pfEodIsStale (LF form; sha equal to the old pin) |
| 84 | `ts1_default_exposure`:136 | `f36bc4eb5cba` | R5 | TX-3 pre-task runTechScoreV1 (historical operand) | unchanged (historical) |
| 85 | `ts1_default_exposure`:137 | `17c8863a09b3` | R5 | TX-3 pre-task _ts1FillRow (historical operand) | unchanged (historical) |
| 86 | `ts1_default_exposure`:138 | `6df1e8355698` | R1 | `_ts1RowText: <h>,` | functions._ts1RowText (LF form; sha equal to the old pin) |
| 87 | `ts1_default_exposure`:139 | `a248cfabfa0b` | R1 | `renderMainPanel: <h>` | functions.renderMainPanel (LF form; sha equal to the old pin) |
| 88 | `ma_stack_label`:39 | `ed2c8bdcac60` | R4/R5 | PRE_RM_LF: pre-task renderMainPanel, MS-7 revert chain | frozen source |
| 89 | `ma_stack_label`:40 | `aea925b1775b` | R4/R5 | PRE_RM_CRLF: pre-task renderMainPanel (CRLF form), MS-7 | frozen source |
| 90 | `ma_stack_label`:41 | `c143eb08d982` | R1 | `const PIN_CLASSIFY_LF = <h>;` | functions.classifyTechnicalSetup (LF form; sha equal to the old pin) |
| 91 | `ma_stack_label`:43 | `79b78d1ed91f` | R3 | `const PIN_TSASSESSMAP_LF = <h>;` | regions.tsassessmap (LF form; sha equal to the old pin) |
| 92 | `ma_stack_label`:46 | `2cb45b3fbdd4` | R2 | PIN_MASKED_MINUS_RM_LF: index.html minus renderMainPanel (MS-8) | functions.* + regions.* + remainderSha256 |
| 93 | `pulse_analyst_view`:34 | `be916d0c24c4` | R1 | `const PIN_PROMPT_FN_LF = <h>; // fetchAnthropicAnalysis (PA-9)` | functions.fetchAnthropicAnalysis (LF form; sha equal to the old pin) |
| 94 | `high1y_label`:67 | `f800c5a374f3` | R2 | HL-8 layer1: masked whole-file digest | functions.* + regions.* + remainderSha256 |
| 95 | `high1y_label`:69 | `39b8ce7ec6d2` | R1 | layer-2 NORMALISED digest of computeHigh1yDistance | functions.computeHigh1yDistance (raw digest, stricter than the normalised pin) |
| 96 | `high1y_label`:70 | `579f5bfea08f` | R1 | layer-2 NORMALISED digest of classifyTechnicalSetup | functions.classifyTechnicalSetup (raw digest, stricter than the normalised pin) |
| 97 | `high1y_label`:71 | `3bd4b2787884` | R1 | layer-2 NORMALISED digest of buildTechSnapshotBlock | functions.buildTechSnapshotBlock (raw digest, stricter than the normalised pin) |
| 98 | `high1y_label`:72 | `39b93ac18718` | R1 | layer-2 NORMALISED digest of _techDeriveSnap | functions._techDeriveSnap (raw digest, stricter than the normalised pin) |
| 99 | `high1y_label`:73 | `fad40ac1ea98` | R1 | layer-2 NORMALISED digest of fetchAnthropicAnalysis | functions.fetchAnthropicAnalysis (raw digest, stricter than the normalised pin) |
| 100 | `high1y_label`:74 | `d772badfdfa6` | R1 | layer-2 NORMALISED digest of orchestrate | functions.orchestrate (raw digest, stricter than the normalised pin) |
| 101 | `high1y_label`:75 | `657105a2f62a` | R1 | layer-2 NORMALISED digest of _srGroupResults | functions._srGroupResults (raw digest, stricter than the normalised pin) |
| 102 | `high1y_label`:76 | `a3b3c7427aa0` | R1 | layer-2 NORMALISED digest of renderMainPanel | functions.renderMainPanel (raw digest, stricter than the normalised pin) |
| 103 | `high1y_label`:77 | `50b6d52bc1ec` | R1 | layer-2 NORMALISED digest of _dd0FetchAnalysis | functions._dd0FetchAnalysis (raw digest, stricter than the normalised pin) |
| 104 | `analyst_parser`:69 | `3f907c17c706` | R2 | PIN_MASKED_FILE (AP-14): masked whole-file digest | functions.* + regions.* + remainderSha256 |
| 105 | `analyst_parser`:70 | `998a9fc01dfa` | R3 | `const PIN_ALLNONE_EXPR = <h>;` | regions.allnone_expr (LF form; sha equal to the old pin) |
| 106 | `analyst_parser`:71 | `08c0d05765e5` | R1 | `const PIN_FETCH_PPLX = <h>;` | functions.fetchPerplexityContext (LF form; sha equal to the old pin) |
| 107 | `analyst_parser`:72 | `f01adf53c416` | R5 | PIN_FIXTURE: fixture file digest (not index.html) | unchanged |
| 108 | `ath_isolation`:212 | `953aaf6a661b` | R2 | AR-7i index.html entry (whole-file digest) | functions.* + regions.* + remainderSha256 |
| 109 | `ath_isolation`:213 | `2a9a4d3682d6` | R5 | AR-7i server module digest (not index.html) | unchanged |
| 110 | `ath_isolation`:214 | `1ce8c4c5bead` | R5 | AR-7i server module digest (not index.html) | unchanged |
| 111 | `ath_isolation`:215 | `f9b70977eade` | R5 | AR-7i server module digest (not index.html) | unchanged |
