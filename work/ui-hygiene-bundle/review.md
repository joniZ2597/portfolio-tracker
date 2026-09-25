# Review — Entry 9 UI hygiene bundle

Branch `task/ui-hygiene-bundle`, baseline `7d0cc37` (brief-only commit; preparation base `e2bdfd2`).

## QA

- Pre-edit baseline: `npm run qa:offline` PASS, 46 suites.
- Tests first: `qa/ui_hygiene_offline.js` run before any `index.html` edit — 13 FAIL (UH-1, UH-2 controls/positive, UH-4, UH-5, UH-6); UH-3 and UH-7 already green (frozen / unchanged boundaries).
- Post-implementation and post-Codex-FIX: `npm run qa:offline` PASS, **47 suites** (46 + `ui_hygiene_offline.js`). `qa/run-offline.js` not edited.
- `qa/vis_score_caliper_offline.js` PASS (307 asserts); only the `renderMainPanel` pin changed, the other 9 function pins and the CSS pin untouched.
- Raw output: `work/ui-hygiene-bundle/qa.log`.

## Caliper re-pin evidence

- Old pin `d6499b3430267b60da2e729871d464c814ab6e86c5f392408d93bd0491f36768` (verified equal to the extracted `renderMainPanel` at baseline over the host CRLF checkout).
- New pin `d11b09a989f19ee1fa09770ac135e8f00ce518558b25cc7bce3ee23cf1b174ac`, computed with the suite's own `extractFunctionSource` + `sha256` over raw host bytes, no newline normalization.
- Diff of the extracted `renderMainPanel` source (baseline → now):

```
41,42d40
<   const rs        = _scoreSt.rs;
<   const rsCls     = _scoreSt.rsCls;
```

Only the two dead locals are removed.

## Scope and cross-slice guard

- `index.html`: 7 insertions, 12 deletions, exactly the brief §3 items 1–4 (git diff at 0 context reviewed line by line). EOL preserved: CRLF checkout, `git diff` shows no whole-file churn.
- DH census term grep over added `index.html` lines: no match.
- Predicates (`updateScanColToggle`, `toggleAllVisibleScanInclusion`, `renderWatchlistRows`), `_ptScoreStates`, Key Levels markup/comment: unchanged.

## Codex (step 8, raw in `codex.md`)

| # | Finding | Class | Resolution |
|---|---|---|---|
| 1 | UH-2 only denylists 7 terms; an unlisted extra disclosed word (e.g. `region`) still passes | FIX | Disclosure now reduced to field words + fixed connective vocabulary; any leftover word fails. Added a `region` control |
| 2 | UH-5 / UH-7 lacked planted-negative controls | FIX | Checkers refactored to functions; 4 UH-5 controls and 4 UH-7 controls added |
| 3 | UH-6 checked keys only in the last `return` of `_ptScoreStates` | FIX | Asserts both return objects carry all 7 keys; control drops a key from the missing-score return |

All three resolved in `qa/ui_hygiene_offline.js` only; full `qa:offline` re-run PASS 47.

## Discrepancies

- None against the brief. Note: the brief's §5 header says "3 files" but lists 3 implementation files plus `review.md`; the diff matches the list.

## Lessons

- [local] Hand-typed non-ASCII (Hebrew) escapes in an edit script are guesses; match by p{Script=Hebrew} regex with an exactly-one-match guard instead.
- [local] Shell heredocs containing quotes/`$` can break in this harness; the Write tool is safer for test files.

## Final check

Final check: 1 round, 3 class-II findings fixed, self-checked; no implementation change, no QA re-run.

## Files changed
- Implementation (3): index.html, qa/vis_score_caliper_offline.js, qa/ui_hygiene_offline.js
- Evidence (tracked): work/ui-hygiene-bundle/brief.md, work/ui-hygiene-bundle/review.md
