# Review — analyst-action-coverage-1

## Result
The analyst-action parser now reads the forms it missed or misread. Changes are confined to the `_aa*` helpers inside `parsePerplexityContext` (E-1…E-7):
- E-1: `reaffirmed` joins the rating verb group.
- E-2: rating names match with an optional separator, and `_aaRatingName` compares without spaces / hyphens ("Equalweight" → `Equal Weight`).
- E-3: new rules B2 (`PT $X from $Y`), A3 (`PT [to] $X → $Y`, PT-anchored), E2 (`maintained / reiterated / reaffirmed <Rating> at / with $X`, not before "per share" / "a share" / "/share" / "share"), and the consensus guard.
- E-4: a firm string containing stock(s) / shares / saw / (price) target(s) is dropped.
- E-5: rule B3 (`PT [to] $X (≤ 40 chars, no `$`) [,] from $Y`, PT-anchored).
- E-6: `_aaItems` splits before a connector only when the part before it has its own action verb.
- E-7: `_extractActions` splits a firm string containing " and " into separate firms, with the corporate-suffix guard (Company / Co / Cos / Partners / Associates / Sons).

New suite `qa/analyst_action_coverage_offline.js`; `qa/research_ai_context_offline.js` carries exactly the three allowed deltas (RC-3, RC-4, RC-6); `qa/fixtures/index-pins.json` updated by `--update`. No scoring code, prompt text, `formatNewsContext` or persisted shape changed.

## QA
- Step 0 baseline: `qa:offline` PASS, 95 suites (HEAD `7ece529`, node v24.14.0), after a process check showed no other heavy run (line 1 and the check line of `qa.log`).
- Targeted (all PASS): `analyst_action_coverage_offline` 72 asserts; `analyst_parser_offline` 57 (unchanged file); `research_parser_hygiene_offline` 18 (unchanged); `research_ai_context_offline` 31 (with the three §1 deltas only); `tase_units_offline`; `no_synthetic_score_offline` 160; `high1y_label_offline` 103; `tech_snapshot_cache_offline` 324; `index_pins_offline` 13; `index-pins --check` OK.
- Pin delta (`index-pins --update`, diff of `index-pins.json`): `parsePerplexityContext` and `fileSha256` only.
- Step 10: full `qa:offline` PASS, 96 suites (= step 0 + 1), 0 FAIL, the same 1 pre-existing advisory warning (smart quote, `index.html` line 11053).
- Planted negatives (each mutates the production source, anchor exactly once; the named row fails): AC-N1 (E-1 forms → AC-1), AC-N2 (E-2 separator → AC-3), AC-N3 (B2 → AC-4), AC-N4a/b (A3 arrow → AC-5; A3 PT anchor → AC-16), AC-N5a/b (E2 branch → AC-2, AC-13; share lookahead → AC-17, AC-18), AC-N6 (consensus guard → AC-6, AC-24), AC-N7 (firm filter → AC-7), AC-N8a/b/c (B3 branch → AC-10a, AC-10c; B3 PT anchor → AC-14; B3 no-`$` rule → AC-15), AC-N9 (list-split guard → AC-11), AC-N10 (multi-firm emit → AC-11, AC-12), AC-N11 (corporate-suffix guard → AC-19, AC-20).

LAND-EVIDENCE: qa-offline=PASS 96; targeted=PASS; codex-classI-unresolved=0

## RED record (S1)
Against the unmodified source the new suite gave 20 rows failing (AC-1…AC-9, AC-10a-c, AC-11, AC-12, AC-13, AC-19…AC-22, AC-24) and all 15 planted-negative anchors absent (`occurs 0 times`): 35 of 51 asserts. The unchanged-behaviour and rev-3 guard rows (AC-U1…U7, AC-14…AC-18, AC-23, AC-25) passed on the old source, as they pin behaviour that must not change. After E-1…E-7 all 72 asserts pass.

## Reading used (wording, not a STOP)
- The brief's sandbox preflight counts ("32 / 32 at candidate; 18 fail at base") describe the COWORK prototype's row split. This suite evaluates 34 named rows and 15 mutations (72 asserts); every §3 row appears once, AC-N1…N12 are realised as 15 mutations over 11 labels covering each rule and guard the brief lists. The measured outcome (all rows pass at the candidate, the defects fail at base) is what the brief's sentence asserts.
- AC-8 compares the 8 live captures against base-recorded truncated sha256 digests for every result that must stay identical (non-analyst fields of all 8; the analyst arrays of the 5 unchanged captures) and explicit expected arrays for MSFT#2, FROG#3 and ENPH#4, which equal the §1 deltas. AC-9 does the same for the 21 stored items (16 digests, 5 explicit expectations); the 21 items are inlined from `evidence/stored-items.txt`.
- The exact edits follow the brief's reference candidate (`evidence/candidate-index.diff`, rev 3), read from the held-brief folder as a reference only; each anchor matched once in `index.html`.
- Line endings: `index.html` is CRLF in the working tree (git stores LF, `core.autocrlf=true`); the edit was applied byte-exactly with every anchor matched once and CRLF kept, audited by byte count (16544 CRLF, 0 bare LF). `research_ai_context_offline.js` and `index-pins.json` stay LF.
- A first scripted apply sent through the shell heredoc lost its backslash escapes in transit (anchors found 0 times, nothing written); the apply script was then authored with the Write tool, so the anchors and the replacement text matched byte for byte.

## Codex
- Round one (step 8): raw output in `work/analyst-action-coverage-1/codex.md`. Verdict PASS, no findings. It affirmed that the `index.html` change stays within the `_aa*` helpers and matches E-1…E-7 including rule order and guards, that the suite maps the AC and U rows with genuine planted negatives, that the `research_ai_context_offline.js` diff holds only RC-3 / RC-4 / RC-6, that the pin delta is `parsePerplexityContext` and the file digest only, and that nothing outside the file set changed.

- Final check (step 12, raw in `codex.md` under `## Final check`): HOLD on one Class II finding — the RED record in this review had no matching line in `qa.log`. FIXED as documentation evidence only: the new suite was re-run against the base `index.html` (`git show 7ece529:index.html` in a scratch copy) and the observed result (35 of 51 asserts failed, 20 rows + 15 anchors) is logged in `qa.log` as the `S1 RED` line; it equals the figures stated above. Codex otherwise confirmed the diff is confined to the brief's file set, the pin delta, the three RC deltas, the QA totals and the 15-mutation list, with no remaining implementation issue.
  Final check: 1 round, 1 class-II finding fixed, self-checked; no implementation change, no QA re-run.

## Files changed
- Implementation (4): index.html, qa/fixtures/index-pins.json, qa/analyst_action_coverage_offline.js, qa/research_ai_context_offline.js
- Evidence (tracked): work/analyst-action-coverage-1/brief.md, work/analyst-action-coverage-1/review.md

## Backlog reconciliation
- Brief's Backlog row: none.
- Action taken: none. No `BACKLOG.md` edit; the finished work's effect matches the row.
- Entry headings: n/a.
- The diff, QA results and the work being landed agree: no BACKLOG text was changed.

## Not run
- No live or DEV check: no Perplexity or Haiku call, no deploy, no canary, no env change. The size of the AI-output shift per ticker (brief R-1) is unmeasured offline.

## Lessons

- [local] A tool-mediated shell heredoc can lose regex backslashes in transit; authoring the apply script with the Write tool and anchoring every replacement exactly once avoided silent corruption.
- [backlog] Brief R-9 (the landed A2 rule reads a share-price move as a target when a PT word is in the same item) and R-6 (a block whose only content is rating-only actions is `_allNone`, so the RATING ACTIONS line is not sent to the AI) remain open for a Main Control / Owner decision — pending routing
