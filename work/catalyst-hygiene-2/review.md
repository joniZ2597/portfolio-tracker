# Review: catalyst-hygiene-2 — drop filler and price-only catalyst rows; rating-only research is coverage

Result: implementation complete inside the approved brief (`work/catalyst-hygiene-2/brief.md`, sha256 `dc8221adbb9609cf49ab31ca3d09863966df00e7290ced851a191018337d1b19`, LF-normalised). Mode: Manual. Worker A, branch `task/catalyst-hygiene-2`, task base `d446bb2`.

## Files changed
- Implementation (6): index.html, qa/fixtures/index-pins.json, qa/catalyst_hygiene_offline.js, qa/analyst_parser_offline.js, qa/analyst_action_coverage_offline.js, qa/research_ai_context_offline.js
- Evidence (tracked): work/catalyst-hygiene-2/brief.md, work/catalyst-hygiene-2/review.md

## What changed
- `index.html`, only inside `parsePerplexityContext`:
  - E-1 / E-2: `_isPriceHistoryOnly` accepts `$`, the shekel sign, `ILA`, `ILS`, `NIS` before the price (closed-at pattern and date-first pattern); new local helper `_isDatedPriceMove` (date then dash or colon, a currency price level and a `%` move) is the new alternative.
  - E-7a / E-7b: the E-7 classifier inserted verbatim from brief section A1 just before the 7B-3B1 comment; `return !hasCatalyst;` became `return !(hasCatalyst || _statedEventCause(t));`.
  - E-3 / E-4: new `_FILLER_RE` (whole-item match) and the `_splitList` none check `|| _FILLER_RE.test(s)`.
  - E-5 / E-6: the ticker-block `_allNone` also requires `ratingOnlyActions.length === 0`; the `__raw__` fallback requires `_rawAA.ratingOnlyActions.length === 0`.
- `qa/catalyst_hygiene_offline.js` (new): CH-1..CH-17, planted negatives CH-N1..CH-N11, 49 assertions. Consumers (`_detectWeakPerplexity`, the `orchestrate` lines, the confidence badge, the catalyst fallback row, the audit label, `deriveDataConfidence`) are evaluated from the real unchanged source slices, each anchor asserted exactly once.
- `qa/analyst_parser_offline.js`: AP-13 only, exactly the three listed edits (comment; two expectations true to false).
- `qa/analyst_action_coverage_offline.js`: `LIVE_BASE` only (MSFT#2 `90ffd3b019658ca6`, MGOR.TA#7 `0cb937910c80e671`); both values were recomputed from the real parse and equal the brief's.
- `qa/research_ai_context_offline.js`: `BASE` (RC-6) only, the three listed array edits.
- `qa/fixtures/index-pins.json`: `--update`; exactly `fileSha256`, `functions.parsePerplexityContext` and `regions.allnone_expr.sha256` changed.

## QA
- Step 0 baseline: PASS 97 suites (`qa.log` line 1).
- Targeted (qa.log): catalyst_hygiene 49 asserts PASS; analyst_parser 57 PASS; analyst_action_coverage 72 PASS; research_ai_context 31 PASS; research_parser_hygiene 18 PASS; index_pins 13 PASS; `index-pins --check` OK; no_synthetic_score 160 PASS; tase_units 9 PASS; news_catalysts_provider (on the runner denylist, run directly) 66 PASS.
- RED before implementation: the new suite failed 25 of 29 asserts (CH-3, CH-7, CH-8 pass by design).
- Step 10, final full run on the final tree: `npm run qa:offline` PASS, 98 suites (97 + 1), one advisory warning (smart quote at the same pre-existing place).
- Corpus: the six unchanged live captures reproduce the brief's six canonical-parse hashes exactly; MSFT#2 bearish = the EPS row only; MGOR.TA#7 bullish `[]`, bearish = the P/E row only.

## Codex
- Round one (step 8, implementation diff): 2 findings, both classified REJECT.
  - Class I (CH-N4 does not reliably test the catalyst-term keep): REJECT. With the keep removed, CH-2's row `October 14 — Q3 revenue ... up 12% on record orders` is filtered (3 kept becomes 2), and the suite's own assertion `CH-N4 makes CH-2 fail` passes; reproduced by hand and recorded in `codex.md`.
  - Class I (E-2 currency pattern): REJECT. Codex withdrew it in the same bullet ("The implementation does catch this case, so no finding here"); the case is covered by CH-2 and CH-N2.
- Final check (step 12, complete task diff including this file): verdict PASS, 0 Class I findings, 2 Class II observations. One was fixed (the hash evidence the review cites was added to `qa.log`); the other confirmed the Lessons convention is met.
- Final check: 1 rounds, 1 class-II findings fixed, self-checked; no implementation change, no QA re-run.
- Raw responses are in `work/catalyst-hygiene-2/codex.md`.

## FIX / DEFER / REJECT ledger
| # | Finding | Class | Disposition | Reason |
|---|---|---|---|---|
| 1 | CH-N4 ineffective | I | REJECT | contradicted by the suite (CH-N4 makes CH-2 fail) and by a manual reproduction |
| 2 | E-2 currency form missed | I | REJECT | withdrawn by Codex; covered by CH-2 and CH-N2 |

## Backlog reconciliation
- Brief Backlog row: none. Action taken: none. No `BACKLOG.md` entry is affected and `BACKLOG.md` is not in this task's scope.
- Confirmation: no BACKLOG text was edited, which matches the diff, the QA results and the work being landed.

## Notes and recorded deviations
- The brief's `evidence/` helper files (apply script, E-7 text, prototype, suite-delta script) were not in the slot. E-7 came verbatim from section A1; E-1..E-6 were written from the section 2 wording and the suites from the section 1 and 3 text. Equivalence evidence: the recomputed LIVE_BASE values and the six CH-6 hashes equal the brief's precomputed values. CH-12 and CH-13 phrasings were authored from the brief's phrase labels; every row passes without any rule change.
- The brief's status prose still reads "FINAL-DRAFT rev 5, HELD - NOT R11-ready". The brief is tracked, committed through the brief-only commit and its hash equals the task record, so it governs (M6 note, not a STOP).
- E-5 placement: the new condition sits before `_isNoneVal(revDir)` so the pinned `allnone_expr` region end anchor stays byte-identical; only the region sha256 moves, as the brief allows.
- `_FILLER_RE` uses real unicode regex escapes (not literal characters) so the advisory smart-quote count in `qa:offline` stays at its baseline of 1.
- `qa/news_catalysts_provider_offline.js`, named in the brief's must-stay-green list, is on the runner's `OFFLINE_TESTS_DENYLIST`; it passes when run directly (66). Wording defect only.
- Form denial: PowerShell process listing for the heavy-run check -> reissued as the `wmic` listing through the Bash tool.
- Scratch probes were written to the session scratchpad rather than `/tmp/pt-catalyst-hygiene-2/`; nothing under the repo, nothing committed.
- Line endings: `index.html` and `analyst_parser_offline.js` keep CRLF in the working copy (byte-audited); three other edited files are LF in the working copy (tool rewrite). Committed blobs are LF (autocrlf); the diff shows only the intended hunks.
- Not claimed: the broader legacy catalyst-term keep (R-9 / follow-up F-2) and the four documented conservative false negatives (R-7b) are unchanged and out of scope.

## Lessons
- [backlog] WF: a brief that cites `evidence/*` helper scripts must ship them in the slot (or embed E-1..E-6 verbatim as it does for E-7); otherwise the Worker re-derives regexes from prose — pending routing
- [backlog] WF: text passed to the Edit and Write tools has a unicode escape sequence decoded into the literal character, so a regex that needs a real escape must be patched with a script that builds the backslash from its character code — pending routing
- [backlog] WF: the brief's must-stay-green list named a denylisted suite (`news_catalysts_provider_offline`); list only suites the runner discovers, or say "run directly" — pending routing

LAND-EVIDENCE: qa-offline=PASS 98; targeted=PASS; codex-classI-unresolved=0
