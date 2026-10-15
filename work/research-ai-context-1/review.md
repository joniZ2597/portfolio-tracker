# Review — research-ai-context-1

## Result
The AI's research block now carries the three template fields it never received (GUIDANCE, CONTRACTS, PEER_MOVE) and the full parsed analyst-action detail. Changes are confined to `parsePerplexityContext` (E-1, E-2: three `_readField` reads and three new result keys `guidance`, `contracts`, `peerMove`) and `formatNewsContext` (E-3…E-7): `_cap` (300-char cap with "…"), `_dateOf` (U-1: date exactly as reported, a year-less date rendered `Mon D; year unverified`, a year never inferred), the `_extra` lines (`GUIDANCE:` / `CONTRACTS:` / `PEER MOVE:`) appended after EARNINGS and on the `_allNone` branch (whose sentence is unchanged), the analyst line `Bank: PT <verb> to|at $T[ from $F][; <ratingAction> <rating>][ (<date>)]`, the `RATING ACTIONS (no PT):` line, the exact `DATE NOTE:` line (once, only when a year-less date rendered), and the freshness tag renamed `[research freshness: …]`. The `index.html` diff is byte-identical (LF-normalised) to the planning reference candidate (`evidence/candidate-index.diff`). Nothing else in the scan changed: no scoring code, no prompt text, no persisted shape, no UI; `index.html` stays CRLF (16527 CRLF / 0 LF-only).

## QA
- Step 0 baseline: `qa:offline` PASS, 93 suites (HEAD `2673713`, node v24.14.0), run after Worker B's heavy run had exited.
- Targeted: `qa/research_ai_context_offline.js` PASS 31 asserts (RC-0, RC-1…RC-10e, planted negatives); must-stay-green unchanged and green: `analyst_parser_offline` 57, `research_parser_hygiene_offline` 18, `tase_units_offline`, `no_synthetic_score_offline` 160, `high1y_label_offline` 103, `tech_snapshot_cache_offline` 324, `index_pins_offline` 13; `index-pins --check` OK.
- Pin delta (`index-pins --diff 2673713`): `formatNewsContext`, `parsePerplexityContext` and `fileSha256` only.
- Step 10: full `qa:offline` PASS, 94 suites (= step 0 + 1), 0 FAIL, the same 1 pre-existing advisory warning.
- Planted negatives (each mutates the production source, anchor exactly once; the named row fails): RC-N1 (`lines.push(..._extra)` removed -> RC-1), RC-N2a/N2b (`ptFrom` / direction removed -> RC-3), RC-N3 (rating-only line removed -> RC-4), RC-N4 (year-less marker removed -> RC-10a), RC-N5a/N5b (DATE NOTE push removed / text altered -> RC-10e).

- Post-resync (base `7e5df3e`, tip `9a49190`): full `qa:offline` PASS, 95 suites (the resync brought in Worker B's `fund-facts-token-collision-1` suite; this task's +1 is unchanged), 0 FAIL, the same 1 pre-existing advisory warning; the four land-tests (`research_ai_context` 31, `analyst_parser` 57, `research_parser_hygiene` 18, `index_pins` 13) and `index-pins --check` PASS. The 94-suite result above was the pre-resync run (raw in `qa.log`).

LAND-EVIDENCE: qa-offline=PASS 95; targeted=PASS; codex-classI-unresolved=0

## RED record (S1)
Against the unmodified source the new suite gave 9 rows failing (RC-1, RC-3, RC-4, RC-7b, RC-9, RC-10a, RC-10b, RC-10d, RC-10e — RC-10b also fails on the old source because the old line drops the date) and all planted-negative anchors absent (`occurs 0 times`); RC-2, RC-5, RC-6, RC-7a, RC-8 and RC-10c passed on the old source, as they pin unchanged behaviour. After E-1…E-7 all pass. Raw output in `qa.log`.

## Accepted advisories (rev 3)
- **A-1** applied: RC-10e asserts the exact DATE NOTE text; exactly once (as a whole line) where any year-less date renders (checked on all 8 captures, and specifically MSFT / FROG / ENPH); absent when every date carries a year (RC-10b input) and for QQQ (no analyst actions); RC-N5a/N5b mutate it.
- **A-2** noted, not added: `analyzeChunk` / `fetchAnthropicAnalysis` are forbidden by the brief and stay byte-identical (pins). RC tests the exact `formatNewsContext` output those calls consume, initial and retry alike.
- **A-3** waived by Main Control / Owner (2026-10-15); not a STOP.
- **A-4** honoured: no external year lookup; dates as reported (RC-10c asserts no year is ever added).

## Reading used (wording, not a STOP)
- RC-6 compares the parsed fields (analystActions, ratingOnlyActions, bullish / bearish / macro, earnings, revisionDirection, revisionRecency, dataFreshness, `_allNone`) with values recorded in the suite from the base `index.html` (`2673713`) on the 8 captures; the new keys are not part of the comparison.
- The brief's RC-8 "`__raw__` outputs unchanged" is exercised with a synthetic `__raw__` input that has no analyst actions (the analyst line itself intentionally changes under E-4): the `_allNone` sentence and the `RAW CONTEXT:` slice are asserted.
- RC-1 requires exactly 11 non-NONE GUIDANCE / CONTRACTS / PEER_MOVE fields in the fixture, as the brief states.
- The fixture is a byte copy of the capture file (sha256 `e6230373…87ca`, asserted in RC-0).
- Line endings: `index.html` is CRLF in the working tree (git stores LF, `core.autocrlf=true`); the edit was applied byte-exactly with every anchor matched once and CRLF restored, audited by byte count.

## Form denial
Form denial: a compound Bash call using escaped `\$` characters (R10-E, nothing ran) -> reissued as separate calls; the PowerShell tool is denied in Worker slots (R2), so the heavy-run process check used the Bash `wmic process where "name='node.exe'"` form (UTF-16 output piped through `tr -d '\000'`). Also: a first scripted apply of the edit lost its backslash escapes in transit and produced a syntax error in the working copy; `index.html` was restored from `HEAD` (file write, no git ref change) and re-applied with explicit tokens; the final diff equals the reference.

## Codex
- Round one (step 8): raw output in `work/research-ai-context-1/codex.md`. Verdict PASS (no Class I), no findings; it affirmed scope (only the two functions + pin map + allowed new files), the fixture digest, A-1 coverage and the planted-negative anchors.

- Final check (step 12, raw in `codex.md` under `## Final check`): PASS, no Class I findings. One Class II note — it observed that `brief.md` is listed under Evidence (tracked) although the base-to-tree diff does not change it. **REJECT**: `brief.md` is already committed (`603953a`) and the Evidence row is the fixed two-row shape AGENTS.md prescribes; `review.md` is untracked only until the step-13 commit, which adds it.
- One self-found FIX after the final check: RC-0 now hashes the LF-normalised fixture bytes, because `core.autocrlf=true` can check the fixture out with CRLF and would break the pinned digest in another slot (the pin value is unchanged). QA re-run: the suite PASS 31 asserts, `index_pins_offline` PASS. Scoped Codex re-pass on that hunk (raw in `codex.md`): the hunk is sound and does not weaken the pin; it answered HOLD only because the fixture was not yet in `HEAD`. **REJECT** (not a defect): the fixture is staged and `git show :qa/fixtures/research-live-2026-10-15.json | sha256sum` = `e6230373…87ca`, the pinned value; it enters `HEAD` in the step-13 commit.
  Final check: 1 round + 1 scoped re-pass, 0 class-I findings (1 re-pass HOLD rejected with evidence), 1 class-II finding rejected with reason; QA re-run for the one FIX hunk.

## Files changed
- Implementation (4): index.html, qa/fixtures/index-pins.json, qa/fixtures/research-live-2026-10-15.json, qa/research_ai_context_offline.js
- Evidence (tracked): work/research-ai-context-1/brief.md, work/research-ai-context-1/review.md

## Backlog reconciliation
- Brief's Backlog row: none (research stability findings); related BACKLOG 33-residual R-4b stays open (rating-only display / strict analyst template; this task sends rating-only actions to the AI context only, per OD-4).
- Action taken: none. No `BACKLOG.md` edit; the finished work's effect matches the row.
- Entry headings: n/a.
- The diff, QA results and the work being landed agree: no BACKLOG text was changed.

## Not run
- No live or DEV check (OD-3 option (a), offline QA only): no Perplexity or Haiku call, no deploy, no canary, no env change. The size of the AI-output shift per ticker (OD-1) is unmeasured offline.

## Lessons

- [local] A tool-mediated script that carries regex or template-literal backslashes can lose them in transit; the apply step used explicit tokens and the result was proven identical to the reference diff rather than trusted.
- [backlog] The AI-facing narrative can now cite guidance / contracts / peer moves that the Catalyst panel does not display (brief R-8) — a later display task — pending routing
