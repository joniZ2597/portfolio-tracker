# Review: research-parser-hygiene-1 (CB-1b: PA-S06, PA-17, PA-S07)

## Result

Implemented as briefed. `parsePerplexityContext` now keeps catalysts that start with "-" or "Unknown", drops bare dashes, and reads `PT $X to $Y` as target Y with from-target X. `by $10 to $300` stays target 300 with no from-target.

## Files changed
- Implementation (3): index.html, qa/fixtures/index-pins.json, qa/research_parser_hygiene_offline.js
- Evidence (tracked): work/research-parser-hygiene-1/brief.md, work/research-parser-hygiene-1/review.md

## Change summary
- E-1 `NONE_RE`: `/^(?:(?:NONE|N\/?A)\b|unknown\.?$|[-—–]+\.?$)/i` plus a two-line comment.
- E-2 `_AA_RULE_A2` added before `_AA_RULE_C`, with a `(?<!\bby\s{0,3})` look-behind.
- E-3 `_AA_RULE_A2` branch added after the `_AA_RULE_B` branch in `_aaParseItem`, gated on `hasTW`.
- `qa/fixtures/index-pins.json` regenerated with `node qa/tools/index-pins.js --update`; only `fileSha256` and `functions.parsePerplexityContext` changed.
- No other function changed. `analyzeChunk`, `orchestrate`, `enforceScoreConsistency` and the 7B-3B3 none-test are untouched. `qa/analyst_parser_offline.js` and its fixtures are unchanged.

## QA
- Step 0 (pre-edit baseline): `npm run qa:offline` PASS, 91 suites. Process check clean.
- RED: RP-1, RP-2, RP-3, RP-5 failed on the base source; RP-4, RP-6, RP-7, RP-8 passed (unchanged behaviour).
- GREEN: `node qa/research_parser_hygiene_offline.js` PASS (18 asserts): RP-1..RP-8, planted negatives RP-N1 (E-1 reverted, fails RP-1/RP-2/RP-3), RP-N2 (E-3 removed) and RP-N2b (E-2 neutralised) (both fail RP-5), RP-N3 (look-behind dropped, fails RP-7). Each anchor occurs exactly once.
- Must stay green, all PASS: `node qa/analyst_parser_offline.js` (57, file unchanged), `node qa/no_synthetic_score_offline.js` (160), `node qa/tase_units_offline.js` (9), `node qa/index_pins_offline.js` (13), `node qa/tools/index-pins.js --check` (380 functions, 25 regions).
- Step 10: `npm run qa:offline` PASS, 92 suites (step 0 + 1). Process check clean.
- `no_synthetic_score_offline` failed 14 of 160 asserts between the `index.html` edit and `index-pins --update` (stale pin only); PASS after the update.

## Pre-existing NP57 note
The task handoff named a pre-existing NP57 failure. NP57 lives in `qa/news_catalysts_provider_offline.js`, which `qa/run-offline.js` denylists from `qa:offline`. Run at the base tip `84d6c7e` it reported ALL PASS (66 passed, 0 failed), NP57 included. No NP57 failure was reproduced and none is attributable to this task.

## Codex
- Round one (step 8) on the real implementation diff: PASS, no findings. Raw output in `codex.md`.
- Final check (step 12) on the complete task diff, `review.md` included: no Class I findings, two Class II. Raw output in `codex.md` under `## Final check`.

| Finding | Class | Decision | Reason |
|---|---|---|---|
| Round one: none | n/a | n/a | n/a |
| Final: `review.md` listed as tracked evidence while still untracked | II | REJECT | It is untracked only until the step-13 commit that adds it; the Files-changed two-row shape is fixed by AGENTS.md. |
| Final: "recorded below" pointed at a result the file did not show | II | FIX | Final-check result and summary line added here; `qa.log` gained a CODEX-2 line. |

Final check: 1 round, 1 class-II finding fixed, 1 rejected, self-checked; no implementation change, no QA re-run.

## Definition of Done
1. RP-1..RP-8 and RP-N1..N3 pass: yes.
2. Must-stay-green suites pass unchanged: yes.
3. Step 10 PASS at step 0 + 1 (91 -> 92): yes.
4. Codex: no unresolved Class I: yes.

## Backlog reconciliation
- Brief's Backlog row: none (audit correction batch).
- Action taken: none. `BACKLOG.md` not edited.
- Entries affected: none (before -> after: n/a). Confirmed: no BACKLOG text was written, so nothing to match against the diff.

## Lessons
- [local] The Edit tool dropped a trailing space from an inserted line while adding E-2, producing a one-character change on the neighbouring `_AA_RULE_C` line. It was caught by reading `git diff` before any QA result was counted and was restored; the final diff is 5 insertions and 1 deletion in `index.html`.
- [covered] A pin-guarded suite (`no_synthetic_score_offline`) fails until `index-pins --update` is run after an `index.html` edit — already covered by the brief's step S2.

LAND-EVIDENCE: qa-offline=PASS 92; targeted=PASS; codex-classI-unresolved=0
