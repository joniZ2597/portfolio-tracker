# Review: analyst-parser-r4a — item-by-item analyst-action parser

Brief: `work/analyst-parser-r4a/brief.md` (committed `5522c4d`, base `dd51188`). Worker B, Mode Manual (attended).

## Files changed
- Implementation (4): index.html, qa/analyst_parser_offline.js, qa/fixtures/analyst-parser/cases.json, BACKLOG.md
- Evidence (tracked): work/analyst-parser-r4a/brief.md, work/analyst-parser-r4a/review.md

## What changed
- `index.html`, inside `parsePerplexityContext` only (four hunks, CRLF preserved, no other function touched):
  - P1: `ACTION_RE` / `_extractActions` replaced by local helpers: verb vocabulary (base / -s / -ing / past forms, past-tense output), rating vocabulary read only in the fixed positions, amount rules (no ceiling, B/M/K/bn/mn/billion/million/thousand never a target), item splitting, per-item parse with target rules (a)-(f), rows and de-duplication (cap 5 each).
  - P2: `_readAnalystActions` reads the labelled line plus following lines up to the next template label; `_readField` unchanged and still used for every other label.
  - P3: `ratingOnlyActions` added next to `analystActions`; the `_allNone` expression is byte-identical (sha256 pin).
  - P4: `__raw__` fallback uses the same extractor and adds `ratingOnlyActions`; `_allNone = rawActions.length === 0` unchanged.
- `qa/analyst_parser_offline.js` (new, auto-discovered by `qa:offline`): AP-1..AP-14 plus FX-1 (fixture integrity) and extra assertions listed under "Added assertions".
- `qa/fixtures/analyst-parser/cases.json` (new): byte copy of the held fixture, sha256 `f01adf53c416547b4e68e63df36a1b701a588225b866cfe1c5daa043b13bf268`, 42 cases.
- `BACKLOG.md`: B1 (entry 33, DONE) and B2 (DONE / HISTORY line) only.

## RED (before implementation)
New suite against the baseline parser failed as specified (recorded in `qa.log`):
- 17 legacy bank/action/target mismatches: `1b 2b 6a 6b 7c 8a 8b 8c 8d 8f 8h 10b 10c 11a 11b 11e 11f` (exactly the brief's 17);
- 32 cases with missing structured fields;
- 5 missing rating-only events: `4b 10a 10b 10c X1`.
AP-11 and AP-14 passed at baseline, as they must (they pin unchanged behaviour).

## GREEN
- `node qa/analyst_parser_offline.js`: PASS (57 asserts).
- Land-tests: `vis_score_caliper_offline` PASS (307), `deep_dive_v0_offline` PASS (74); also `news_catalysts_provider_offline` PASS (62).
- Planted negatives (one mutation per scratch copy, exact suite bytes, all fail as the brief names):
  - firm keeps connector words: AP-1, AP-9;
  - first `$` as target: AP-1, AP-5;
  - `< 5000` ceiling restored: AP-1, AP-8;
  - any amount allowed, no suffix guard: AP-1, AP-6, AP-7;
  - rating-only rows dropped: AP-1, AP-6, AP-7, AP-12, AP-13;
  - `action` = first verb: AP-1, AP-3, AP-4;
  - continuation lines ignored: AP-1;
  - a consumer function edited (`formatNewsContext`): AP-14.
- Full `npm run qa:offline`, run alone: PASS, 56 spawned suites, advisory warning count 1 (pre-existing smart quote, `index.html` line 10497 at baseline, 10643 now; not introduced here).

## Step-0 baseline (deviation, stated plainly)
The pre-edit full `qa:offline` did not complete: Worker A's and Worker B's full runs overlapped and both stalled in `qa/pt_land_offline.js`; Worker B stopped its own run and the Owner ruled that no second full run start while Worker A's was active and that edits could continue meanwhile. 45 suites had passed before the stall and none had failed. The baseline count is therefore derived: the final full run spawned 56 suites including the new one, so baseline 55, and 56 = baseline + 1 holds by construction (the new suite is the only file added under `qa/`; suite discovery is automatic).

## Self-review (fresh read of brief and diff)
Re-read the brief and the complete diff against the requirement-to-test map. No code change resulted from it. Readings used:
- the rating rule "after `from ... to`" is subsumed by "after `to`" (identical behaviour), so it has no separate branch;
- the P2 label-stop test `^[A-Z_]{3,}:` is applied to the bullet-stripped line, the same prefix class `_readField` strips, so a bulleted next label also ends the read;
- for ptAction, a target verb wins over a coverage verb, which wins over `unchanged at`;
- items joined by rule 4 are joined with `; `.

## Added assertions (beyond the AP-1..14 rows, each mapped to a brief requirement)
- AP-6: suffixed amounts (`$2.3B`, `$2.3 billion`, `$300M`, `$5k`) are never targets, even beside a target word.
- AP-1: "downgraded to Reduce and cut PT to $50" gives `ptAction: cut` (rating word "Reduce" is not the target verb).
- AP-1 (P2): bulleted lowercase label, bulleted following label, empty first value reads the next lines, first value NONE gives no rows.
- FX-1: fixture hash and 42-case count.

## Codex ledger
Step 8 (implementation diff), raw in `codex.md`: 1 finding, no other issue; verdict FINDINGS.
| # | Finding | Class | Decision | Reason |
|---|---|---|---|---|
| 1 | `_aaItems` rescanned the whole remainder with `_aaVerbs` at every connector: quadratic on a long single line (184 KB: 5321 ms) | I | FIX | Inside scope, behaviour-neutral: the split test only needs a verb within the first 60 characters, so the scan is bounded to `rest.slice(0, 80)`. Same input now 59 ms, identical results; suite 57/57 re-run |

Final check (step 12), raw in `codex.md` under `## Final check`: complete task diff (including this file and the step-9 FIX hunk), verdict PASS, no findings.

Final check: 1 round, 0 findings, PASS; the step-9 FIX is covered by this pass over the complete diff; no class-I or class-II findings; no implementation change, no QA re-run.

## Backlog reconciliation
- Brief's Backlog row: Entry 33, effect `close`.
- Action taken: `closed` (entry added already closed, plus its DONE / HISTORY line).
- Entry heading before -> after: (absent) -> `### 33 · Fix analyst-action / price-target parsing — **DONE**`; DONE / HISTORY: line `**33** Fix analyst-action / price-target parsing — `work/analyst-parser-r4a/` ·` inserted after the entry-32 line.
- The new BACKLOG text matches the diff, the QA results and the work being landed: all 42 parser cases and the ROK / CBOE / MRNA regressions pass, the 25 legacy outputs are unchanged, rating-only events are preserved internally and not displayed, and no prompt, UI, consumer, retry-logic or live-API change was made.

## Boundaries confirmed
- No prompt text, UI, consumer, retry-logic, `pt_*` / localStorage or live-API change; no existing test edited.
- Only `parsePerplexityContext` changed in `index.html` (AP-14 masked-file pin and `fetchPerplexityContext` pin both pass).
- Persisted-shape effect (M5): `analystActions` rows gain four keys (`ratingAction`, `rating`, `ptAction`, `ptFrom`); old stored rows stay valid; `ratingOnlyActions` is not persisted.
- Residual ambiguities are as stated in brief section 7; none was widened.

## Lessons
- [backlog] The AP-14 masked-file sha256 pin fails on any future `index.html` change outside `parsePerplexityContext`, including a Second-LAND rebase over another `index.html` task; brief-mandated here, but a function-level pin would age better — pending routing
- [rule] Two full `qa:offline` runs on one machine (two Worker slots) can stall each other in `qa/pt_land_offline.js` for hours; a Worker should check for any other `run-offline` process before starting the full run and must not start a second one — pending routing
- [local] The baseline suite count was derived rather than measured because the pre-edit baseline run was interrupted by the overlap above.
- [covered] Planted negatives must run the exact committed suite bytes against a mutated copy of the target (path resolved from `__dirname`), not a re-implementation of the assertions — covered by the AP planted-negative method used here.
