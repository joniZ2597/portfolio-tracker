# Review: catalyst-evidence-2-s1 — deterministic `subType` formatting in the news-catalysts provider (A7a, Option A)

Task branch `task/catalyst-evidence-2-s1`, recorded task base `afd3f8702b3c7bef0d405e8195ecfa3557b7ea61` (brief commit; planning baseline `ac8f39b`). Slot B, attended Auto.

## Files changed
- Implementation (6): netlify/functions/lib/news-catalysts-provider.js, qa/news_catalysts_provider_offline.js, qa/news_catalysts_replay_offline.js, qa/fixtures/replay/p4-20260921T2307Z-MRNA.json, qa/fixtures/replay/index.json, BACKLOG.md
- Evidence (tracked): work/catalyst-evidence-2-s1/brief.md, work/catalyst-evidence-2-s1/review.md

## Implementation
- **Provider (R1–R5).** `normalizeSubType()`: `trim().toLowerCase()` (locale-independent), each run of whitespace or `-` becomes `_`, runs of `_` collapse to one, leading / trailing `_` removed; no other character is touched. It runs on a non-null `subType` **after** the existing `INVALID_SUB_TYPE` validity check and before the projection (`subType: subTypeOut`). An empty result is skipped with the **existing** `INVALID_SUB_TYPE` (no new reason); `null` stays `null`. The identity tuple is not touched, so `identityHash` and the 17-field item order are unchanged.
- **Reading used for "whitespace" (R1):** JavaScript `\s` (Unicode-aware). The brief says "whitespace" without qualification; Codex found the reading consistent. NP63 pins ASCII whitespace (space, tab, newline) and non-ASCII letters / CJK kept as text; it does not pin Unicode space characters.
- **Fixture re-snapshot (R6), exactly one value.** `qa/fixtures/replay/p4-20260921T2307Z-MRNA.json` line 60, `expected.items[k].subType`: `"clinical data presentation"` -> `"clinical_data_presentation"`. `qa/fixtures/replay/index.json` line 59, that case only: `fixtureSha256` `40f1d5cb…109e4e` -> `3b92ace0bcadced0aff9e6050ad845560eba4fde0199c67700baecee00d8e347`. Raw capture, `captureSha256` and `expected.providerVersion` unchanged (R-16 precedent). Done by a scripted single-occurrence replace; `git diff -U0` shows one line in each file.
- **Provider suite (R8).** NP63 (normaliser table), NP64 (idempotence plus a normal-form check, so a bare identity function cannot pass), NP65 (null rule and empty-after-normalise -> `INVALID_SUB_TYPE`), NP66 (`identityHash`, key order and every other field identical across formatting variants). NP01–NP62 untouched.
- **Replay suite (R7).** R-12 now expects four diverging cases (adds `p4-20260921T2307Z-MRNA`); R-14 excludes that case (five files byte-equal to `52c322b`); new R-17 with (a) the current fixture value exactly `"clinical_data_presentation"` and (b) the whole fixture deep-equal to the `52c322b` baseline once that one value is reverted.

## Owner rulings and events during the task
- **Step-0 baseline FAIL (not reclassified).** `npm run qa:offline` at `afd3f87`, 2026-10-10T23:08:29Z -> 23:30:30Z (22m01s): 76 of 77 suites PASS, `qa/auto_mode_hardening_offline.js` FAIL, 1 of 4265 assertions: `AH-16 real: after undoing work/y/brief.md (added) -> allow again (got deny)`. One standalone re-run immediately afterwards failed identically; two later in-repo re-runs and one scratch-path copy passed 4265/4265. Root cause not identified; the check runs in an isolated temp repo and involves no task file. Per AGENTS step 0 a red baseline is an M4 transition, not a STOP; the Owner ruled that tests-first work could proceed and that the baseline stays FAIL.
- **R2 hook denial.** A PowerShell process listing (heavy-lane check) was denied: `pretooluse-guard: BLOCKED - PowerShell tool - denied in Worker-slot sessions (R2)`. Treated as STOP-6; not retried or rerouted. The Owner confirmed the heavy lane by message.
- **M6 / STOP-2 ruling (replay R-5).** After the fixture re-snapshot, replay R-5 failed (`order-zip: unmatched raw candidate count must equal skippedItems length: 1 !== 0`): `candidateMatchesItem()` compared a raw model candidate's `subType` to the projected item's by strict equality, which the formatting makes false for the one MRNA item. Brief R7 ("no other assertion is changed or relaxed") did not anticipate this. The Owner ruled: in `qa/news_catalysts_replay_offline.js` only, `candidateMatchesItem()` compares `subType` after formatting both sides, strict equality for the other six fields, plus a planted negative. Done: a suite-side `formatSubType()` (strings only; `null` and non-strings compare strictly) and the new test R-18 (a candidate matches its own formatted item; `_acceptance`, an unrelated label, `null` vs string, and each of the six other fields do not match). No existing assertion was changed.

## QA
- Step-0 baseline: **FAIL 76/77** (above), `qa.log` line 1.
- RED run (tests-first, unmodified provider and fixtures): provider NP63, NP65, NP66 failed and NP64 passed vacuously; after the NP64 normal-form check was added NP63–NP66 all failed. Replay R-12 and R-17 failed (R-17 at its first assertion on the un-normalised value).
- Targeted green: `news_catalysts_provider_offline` 66/66, `news_catalysts_replay_offline` 36/36, `news_catalysts_core_offline` 30/30, `news_catalysts_read_offline` 20/20, `news_catalysts_client_test` 22 passed / 1240 assertions.
- Mutation proofs (production source or fixtures mutated, tests untouched, each restored byte-exact and `cmp`-verified): normaliser removed -> NP63–NP66 fail and replay R-2 and DP-3 fail; normaliser also strips non-ASCII -> NP63 and NP64 fail; `subType` added to the identity tuple -> NP01, NP04, NP15, NP31 and NP66 fail; a second byte changed in the MRNA fixture -> R-17 (with R-2, R-9, DP-3, DP-4) fails; a byte changed in an R-14-covered fixture -> R-14 fails; a byte changed in an R-16 fixture -> R-16 fails.
- **Step 10 full `npm run qa:offline`** (2026-10-11T09:21:26Z -> 09:46:01Z, 24m35s): **PASS, 77 suites**, equal to the step-0 count (AH-16 passed on this run).

## Fresh-context self-review
Re-read the brief and the complete diff against the requirement -> test map. One change resulted: the helper comment I inserted had split the existing `// A grounding-bearing field is valid …` comment from `validGroundingField`; moved back. Targeted suites re-run green afterwards.

## Codex (step 8, read-only, real diff; raw output in `codex.md`)
No Class I or Class II findings. Codex confirmed: R5 (identity tuple, item order, `evidenceBindings`, `dateProvenance` unchanged); R6 (one fixture value line, one `fixtureSha256` line, no `captureSha256` / raw capture / `providerVersion` change); C-1 (core, read-core, client and `index.html` unchanged, none switches on `subType` string equality); R7 and the Owner-ruled `candidateMatchesItem()` change; R8 (NP01–NP62 untouched); locale-independent lower-casing, no new skip reason, no vocabulary or merging.

### FIX / DEFER / REJECT ledger
- No findings: nothing to FIX, DEFER or REJECT.

### Final check (step 12, raw output in `codex.md` under `## Final check`)
Final check: 1 round, 0 findings — PASS on the complete task diff (implementation diff unchanged from the step-8 review, `review.md`, the BACKLOG reconciliation); no implementation change, no QA re-run.

## Backlog reconciliation
- Brief's Backlog row: entry **4** (catalyst news evidence pipeline, merged into `catalyst-evidence-2`), expected effect **`partial`**.
- Action taken: **updated**.
- Entry 4 heading is unchanged. Status text, before -> after: `*Remaining ARC sequence:* A3b* → A7a → A4*/A7b*. DONE: A5 · D-A2-2 · A3a` -> `*Remaining ARC sequence:* A3b* → A4*/A7b*. DONE: A5 · D-A2-2 · A3a · A7a (work/catalyst-evidence-2-s1/, deterministic subType formatting only)`.
- The new BACKLOG text matches the diff (formatting only, no vocabulary, no structural or reader-contract change), the QA results above and the work being landed. The entry stays open (A3b, A4, A7b remain), so no DONE / HISTORY line is added.
- Not touched: the snapshot table, counts and every other entry.

## Lessons
- [rule] A suite helper that matches a raw model candidate to a projected item by strict field equality (`candidateMatchesItem()` in `qa/news_catalysts_replay_offline.js`, used by R-3 / R-5 attribution) silently couples to every projection-side formatting change; the brief's coupling sweep covered assertions (`:300`, R-9, R-12, R-14, R-16) but not this helper. Destination-ready text for `.claude/skills/pt-offline-suite` / `.claude/rules/qa-suites.md`: "Before a task changes how a projected field is formatted, grep the suites for helpers that compare the raw input field to the projected field (`raw[f] === item[f]`-style) and list them in the brief's QA-suites-that-read-in-scope-files row."
- [backlog] The BACKLOG snapshot table row 85 (`4 | MERGED INTO catalyst-evidence-2 | A3b BLOCKED; A7a, A4 / A7b …`) still lists A7a as outstanding; outside this task's allowed edit (entry 4's status text only) — pending routing.
- [backlog] `qa/auto_mode_hardening_offline.js` `AH-16 real: after undoing work/y/brief.md (added)` fails intermittently (step-0 run and one standalone re-run failed; three later runs and the step-10 full run passed); root cause unidentified — pending routing.
- [local] The step-0 baseline was FAIL 76/77 and was not reclassified; the final full run is PASS 77.
- [covered] Planted negatives and mutation proofs on production source — already required by `.claude/rules/qa-suites.md`.

## LAND-EVIDENCE
LAND-EVIDENCE: qa-offline=PASS 77; targeted=PASS; codex-classI-unresolved=0
