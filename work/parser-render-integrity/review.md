# Review — 8a Rating regex de-duplication (r2)

Task: `task/rating-regex-dedup` (worktree `pt-wt-rating-regex-dedup`), base `branch-dev` @ `87e45a6`.
Brief: `work/parser-render-integrity/brief.md` r2 (Owner-approved; brief-only commit `87e45a6`,
blob `4d8f2336a9106cc318ecaaaf596f33ceaea00c96`).

## Result

**PASS.** Five identical inline `Rating:` parser regex literals in `index.html` replaced by one shared
top-level definition; every call site keeps its surrounding resolution / fallback logic unchanged. Full
`npm run qa:offline` gate passes at 43 spawned suites (43 → 43). Codex implementation-diff review:
PASS, no findings. **No user-observable behaviour change.** No STOP condition fired. Not committed,
not pushed, not landed.

## Files changed
- Implementation (4): index.html, qa/run-offline.js, qa/ui1b_cards_offline.js, qa/vis_score_caliper_offline.js
- Evidence (tracked): work/parser-render-integrity/brief.md, work/parser-render-integrity/review.md

Scope distinction (Owner ruling 2026-09-22): the four implementation files above are the
implementation scope; `work/parser-render-integrity/review.md` is separate task evidence intended
to be tracked, not an expansion of that scope. Untracked Worker evidence (`plan.md`, `qa.log`,
`codex.md`) was kept **outside the repository** in the session scratchpad by the same ruling; raw
QA and Codex output referenced below live there.

## Implementation vs. the approved brief

### `index.html` — exactly six changed regions

| Region | Line (post) | Change |
|---|---|---|
| insertion | `:4723` | `var RATING_SUMMARY_RE = /Rating:\s*(Buy\|Neutral\|Sell)/i;` — top level, immediately after the `END-VERBATIM services/fund-facts-read-client.js` marker |
| S-1 | `:6426` | `_srGroupResults` → `rRank`: receiver swap only |
| S-2 | `:6476` | `_srRenderGrouped`: receiver swap only |
| S-3 | `:6674` | `openScanResultsOverlay`: receiver swap only |
| S-4 | `:7379` | `renderMainPanel`: receiver swap only |
| S-5 | `:9992` | `_renderPortfolioPanel` result-row builder: receiver swap only |

`r.rating` precedence (S-1/S-2/S-3), regex-only `'Neutral'` fallback (S-4) and the conditional
render with no fallback (S-5) are untouched. `getS`, PT handling, the `:7895` (pre-edit; `:7896` post-edit) tail-strip
`/Rating:.*$/s`, the prompt text and the stale `:6672` (pre-edit; `:6673` post-edit) comment are untouched. `BACKLOG.md` untouched.
Same pattern, flag `i` only — no `g`/`y`, so sharing one `RegExp` instance introduces no
`lastIndex` state.

**Insertion relocation (recorded reading, M4 → M6).** The brief's placement cue ("grouped with the
`:4155` constant cluster") points inside the DO-NOT-EDIT verbatim inline copy of
`services/fund-facts-read-client.js` (`index.html:4144-4722`, markers inclusive), which `qa/fund_facts_read_client_test.js`
RC31 compares byte-for-byte (LF-normalized) against the canonical service. The first post-edit run
failed RC31 for exactly that reason. The insertion was relocated to directly after the
`END-VERBATIM` marker — still top level, outside every function and every inlined-service block,
textually before S-1, a single `;`, and the first `var RATING_SUMMARY_RE` occurrence for
`extractVarSource`. Every constraint the brief states is met; only the line hint changed. Owner
confirmed the relocation in-session and rejected one attempt that also touched the
`SAMPLE_TICKERS` spacing; it was reapplied anchored on the marker line only.

### `qa/run-offline.js` — Phase 13 only, the two §5.3 edits

- `pieces` gains `ratingRe: extractVarSource(content, 'RATING_SUMMARY_RE')` (`:3562`).
- `pieces.ratingRe + '\n'` is prepended to the `new Function` factory body (`:3573`).

`extractVarSource` unmodified; `missingPieces` guard, fixtures, expected values and every other
phase untouched; the `:3523` `callCount === 2` pin (backlog task 6) untouched. Tests-first proof:
before the `index.html` edit, Phase 13 failed loudly via the unchanged guard —
`could not extract from index.html: ratingRe`. After: the real extracted `_srGroupResults` still
executes and Phase 13 passes **130/130 assertions, identical to the pre-edit baseline** — the
behavioural invariant the brief requires.

### `qa/vis_score_caliper_offline.js` — exactly three hashes moved

| Pin | Old | New (host CRLF working tree) |
|---|---|---|
| `_srGroupResults` | `b15709ae…6df57` | `192d7dd36905c72cde459091569e0d9749a2d4b5a861c86d09c54c762078ddb1` |
| `_srRenderGrouped` | `f4372e1f…b9aea` | `02a0784614a0ab60ddafaf1a319dc0b89cdb7bcc8670161f527d5c18564c71a4` |
| `renderMainPanel` | `cd15e31c…d1e55` | `6d98820eab986afe5d64ad77b36faf00b538aab74e7b112314569f212666c7a5` |

The other seven function pins (`_ptScoreNorm`, `_ptScoreText`, `_ptScoreCmp`, `_ptScoreAvg`,
`_ptScoreStates`, `_ptScoreFillHtml`, `_ptScoreDial`) and the protected CSS pin
`b4c63e69…828d5` are **unchanged** — 11 of 11 verified against host bytes. Hashes were computed on
the host from the worktree's CRLF `index.html` with the suite's own `extractFunctionSource`
semantics and SHA-256 (scratchpad script, Owner-approved), never from `git show`, blob/LF content
or a sandbox checkout. Pre-update the suite failed exactly these three pins (3 of 307 asserts);
post-update it passes 307/307.

### `qa/ui1b_cards_offline.js` — U17, no new suite

`U17: drift pin - single Rating parser regex definition`, four assertions per brief §5.1: zero inline
literals remaining, `RATING_SUMMARY_RE` exactly 6 occurrences, the definition exactly once, the
`:7895` (pre-edit; `:7896` post-edit) tail-strip still present. Header comment gains the matching `U17` line. **Reading
recorded:** the shared definition line is itself the one legitimate carrier of the literal, so the
"exactly 0" count is taken after excising that definition; the separate exact-definition-count
assertion prevents the excision from masking a missing or duplicated definition. U17 failed before
the implementation existed and passes after (19 tests / 64 assertions).

## QA evidence

| Run | Result |
|---|---|
| Pre-edit baseline `npm run qa:offline` @ `87e45a6` | PASS, 43 spawned suites, exit 0 |
| Tests-first run (U17 + Phase 13 edits, no `index.html` change) | FAIL as designed: U17 + `score-contract: could not extract … ratingRe` |
| First post-edit run (insertion inside verbatim block) | FAIL: RC31 canonical/inline drift guard only |
| Final `npm run qa:offline` | **PASS, 43 spawned suites, exit 0**; Phase 13 130/130 |
| `node qa/ui1b_cards_offline.js` | PASS, 19 tests / 64 assertions |
| `node qa/vis_score_caliper_offline.js` | PASS, 307 asserts |
| `node qa/fund_facts_read_client_test.js` | PASS, 37/37 (RC31 green after relocation) |
| Line endings | CR count == line count in all four implementation files; `git diff --stat` == `git diff --ignore-cr-at-eol --stat` |
| Diff shape (implementation scope) | 4 implementation files, +23 / −9; `index.html` exactly 6 hunks; no untracked implementation files. `work/parser-render-integrity/review.md` is separate task evidence intended to be tracked, added after these runs and outside the implementation diff |

## Codex review (implementation diff)

Invocation: `codex exec --sandbox read-only` (codex-cli 0.154.0) on
`git diff --ignore-cr-at-eol 87e45a6 -- . ':(exclude)work/' ':(exclude)BACKLOG.md'`, against the
r2 brief. **VERDICT: PASS — "the diff matches the approved four-file contract and preserves all
five call sites' behavior."** No findings in any of the seven requested categories (behaviour,
declaration order/scope, file scope, Phase 13, caliper pins, U17, churn). Codex independently
concurred with the U17 excision reading. FIX / DEFER / REJECT ledger: **empty**.

## Lessons

- [rule]     A brief's "QA suites that read in-scope files as text" list must include sha256
             function pins and `new Function` sandboxes: before fixing scope, grep `qa/` for
             `extractFunctionSource(content, '<fn>')`, `PROTECTED_FN_HASHES` and `new Function(`
             naming any function the task edits. A `require()`/import sweep misses both classes.
- [rule]     Any top-level insertion in `index.html` must be checked against the
             `BEGIN-VERBATIM` / `END-VERBATIM` inlined-service regions (RC31 drift guard) before a
             line is chosen; a line-number cue in a brief does not override a DO-NOT-EDIT marker.
- [backlog]  `BACKLOG.md` task 8 says "second copy"; there were five — pending routing
- [backlog]  `index.html:6672` (pre-edit; `:6673` post-edit) comment misdescribes the S-3 fallback as "same method as renderMainPanel" — pending routing
- [local]    Caliper hashes are over CRLF working-tree bytes on this host; an LF checkout would fail those pins.
- [covered]  Worker evidence files stay out of the repo when the Owner limits the worktree to the approved files — AGENTS.md already keeps `plan.md`/`codex.md`/`qa.log` untracked; location is an Owner call.

## Final Codex check (complete task diff, including this file)

Invocation: `codex exec --sandbox read-only` (codex-cli 0.154.0) on the implementation diff plus the full
contents of this then-untracked `review.md`. Implementation diff confirmed unchanged since the prior
PASS; no Class I findings. Four Class II findings, all documentation-only in this file, fixed: three
line references that cited pre-edit numbers without saying so (`:7895`→`:7896`, `:6672`→`:6673`,
verbatim block end `4722` not `4723`) now carry both pre- and post-edit numbers; and this section with
its summary line was added. Self-check: every `work/parser-render-integrity/` path named here is one of
the five canonical files; every count matches a QA run recorded above; no section reads Pending or TBD.

Final check: 1 round, 4 class-II findings fixed, self-checked; no implementation change, no QA re-run.
