# review.md — Technical Score v1 surfacing (backlog task 6, step 1)

Evidence only; authorizes nothing. Commit, LAND and SHIP remain Owner decisions.

| | |
|---|---|
| Brief | `work/technical-score-surfacing/brief.md` r2, committed `6c7dbf7` (sha256 `daa71726…9f7485`, blob `61827e43…927b`) — already-landed baseline evidence, unchanged by this task |
| Task baseline | `bcf31c1` = `branch-dev` at task start (`52c322b` brief base + brief `6c7dbf7` + BACKLOG correction `bcf31c1`); task branch `task/technical-score-surfacing`, worktree `pt-wt-technical-score-surfacing` (fresh `npm ci`) |
| Step 0 (BACKLOG refresh) | landed by the Owner as `bcf31c1` before this task; not touched here (brief STOP-10) |
| Commit | `a6c46d1` on `task/technical-score-surfacing` (Owner-approved exact scope, 2026-09-24), **rebased onto `branch-dev` = `810586d` after A5 landed → `80c6de0`**; patch content byte-identical before/after rebase (`cmp` of the two diffs); A5 (`810586d`, news-catalysts hub-index fix) touched none of Task 6's files |
| Result | **Implementation complete · `npm run qa:offline` PASS at 44 (pre- and post-rebase) · scoped Codex reviews PASS on base `bcf31c1` (historical) and on the rebased diff base `810586d` (one Class II documentation finding, fixed below) · not pushed, not landed** |

## Post-rebase evidence (2026-09-24)

| | |
|---|---|
| Rebase | `a6c46d1` → `80c6de0`, `git rebase branch-dev` at `810586d`, no conflicts; `git diff 810586d...HEAD --stat` = the same 4 files, +249/−8 |
| Caliper | all ten function pins re-derived from the rebased host CRLF tree (15484 CRLF / 0 bare LF) MATCH; `renderMainPanel` stays `d6499b34…f36768`, zero further movement |
| `qa:offline` | PASS — 44 suites, 14 phases, 275 technical-score assertions, caliper PASS, A5's news-catalysts suites PASS alongside |
| Codex | scoped review base `810586d` → `80c6de0`: no Class I findings; STOP conditions 1–11 re-verified on the new base; A5 shares no files, pins, fixtures or assertions with Task 6; one Class II finding (this file omitted the rebase evidence) — fixed by this section |

## Files changed
- Implementation (3): index.html, qa/run-offline.js, qa/vis_score_caliper_offline.js
- Evidence (tracked): work/technical-score-surfacing/brief.md (committed baseline `6c7dbf7`, unchanged by this task), work/technical-score-surfacing/review.md (new)

The task's changes are the three implementation/QA files plus `review.md`; `brief.md` is listed in the evidence row only because the canonical row shape names it, it is already-landed baseline evidence. Untracked task evidence (plan.md, codex.md, qa.log) is kept outside the worktree in the session scratchpad per the Owner ruling of 2026-09-22 (worktree = implementation files + tracked review.md only); the three names are gitignored either way.

## What was built (index.html, +46/−5 incl. comments — `git diff --numstat bcf31c1`; qa/run-offline.js +125/−2; qa/vis_score_caliper_offline.js +1/−1; total +172/−8)

- `_ts1RowMemo` — module-level in-memory object keyed by ticker → the engine promise (like `_techCache`; never persisted). Ordinary and concurrent re-renders share one in-flight/settled computation; a rejected promise removes only its own entry so a later render may retry (no retry loop); a resolved `UNAVAILABLE` may remain memoised.
- `_ts1RowText(result)` — `GATE_OFF` / `UNAVAILABLE` / empty → `—`; otherwise `<score> / 100 · <coveragePct>% coverage`, both values rendered exactly as the engine returns them (null score → `— · N% coverage`).
- `_ts1FillRow(symbol)` — strict `window.PT_ENABLE_TECH_SCORE !== true` early return, then memo-first engine call, then fills `#ts1-val-<ticker>` via `textContent`. The single new `runTechScoreV1(` call site (file count 2 → 3).
- `renderMainPanel` — builds `_ts1RowHtml` (gate `=== true` ? one `.rr-table` row labelled `Tech Score v1` with a `class="rr-val"` value span carrying no state class : `''`), interpolates it immediately after `${_tsAssessHtml}` with no added template whitespace (gate-off output byte-identical), and kicks off `_ts1FillRow(item.ticker)` after the card init calls. `runTechScoreV1` is never called inline.
- Engine header comment (`:1408-1410`, `:1416`) corrected: no longer claims "invoked manually (console)" / "no display surface".

Excluded by ruling and verified absent: state colour on the value, four-component breakdown, a second generic `Score` label, ranking/sorting/persistence influence, any `localStorage` read or write (file occurrence count unchanged, 74 → 74).

## QA (see qa.log)

| Run | Result |
|---|---|
| Pre-edit baseline (fresh worktree @ `bcf31c1`) | `qa:offline` PASS — 44 suites, 14 phases, 1 advisory (pre-existing) |
| Tests first (QA block added, no impl) | FAIL — 3 hard failures (`callCount === 3`, helper extraction, `_ts1RowMemo` declaration); remaining T6 assertions gated behind extraction |
| Impl run 1 | FAIL — caliper `renderMainPanel` hash (expected: pin not yet moved) + `Tech Score v1` count 2 (helper comment header carried the literal → reworded) |
| Impl runs 2 and 3 (final state) | `qa:offline` **PASS — 44 suites**, Phase 12 `275 technical-score assertion(s) passed`, `qa/vis_score_caliper_offline.js` PASS (307 asserts) |
| Run 4 (step 12 Class I FIX re-run, implementation unchanged) | `qa:offline` **PASS — 44 suites**, 275 technical-score assertions, caliper PASS |

Caliper: exactly one pin moved — `renderMainPanel` `6d98820e…66c7a5` → `d6499b3430267b60da2e729871d464c814ab6e86c5f392408d93bd0491f36768`, generated from the host CRLF working tree (15484 CRLF / 0 bare LF); the other nine function pins and the CSS pin are unchanged and PASS. Phase 12 scorer-isolation scans pass unchanged (`scoreTickerTech` untouched). EOL byte audit after every edit: all three files 100 % CRLF, 0 bare LF.

New assertions (brief §4) → Phase 12 "Task 6" block: gate absent / `'true'` / `1` → zero engine calls, empty memo, DOM untouched · gate ON → one call, `72 / 100 · 100% coverage` · concurrent fills share one call · re-render does not refetch · per-symbol keys · `UNAVAILABLE` / rejection / `GATE_OFF` → `—` with no reason/error text · null score keeps coverage · helper sources free of `localStorage`/`sessionStorage`/`fetch(`/`document.cookie`/`indexedDB` (positive controls) · literal `Tech Score v1` exactly once, inside `renderMainPanel` · generic `Score` label count 1 · value span exactly `class="rr-val"`, no `pos`/`neg`/`warn`/`neutral-v`, no breakdown tokens · `_ts1RowHtml` evaluated with gate off / `'true'` → `''`, gate on → labelled row · interpolation adjacency · `renderMainPanel` never calls `runTechScoreV1(` inline · `_ts1FillRow` after `_initDd0Card()` · strict gate is the first statement. Every assertion maps to a brief requirement (plan.md map); no orphan tests.

## Owner rulings applied during implementation (2026-09-23)

1. QA must not pin the memo entry's internal shape, a permanent failure-memoisation policy, or integer rounding — none was ruled by the brief. Removed before approval.
2. Render `result.score` / `result.coveragePct` exactly as returned (no `Math.round`); memo stores the bare promise (no `computedAt`); a rejected engine call drops only its own memo entry so a later render may retry, no retry loop; resolved `UNAVAILABLE` may stay memoised.

## Observation, not a change (brief §2)

`coveragePct` is computed as `100 * availablePoints / 100` (`scoreTickerTech`), arithmetically identical to `availablePoints`. Rendered as returned; `scoreTickerTech` is off-limits to this task.

## Codex (see codex.md)

Scoped implementation-diff review of record (2026-09-24, codex-cli 0.154.0, `codex exec --sandbox read-only`): **base `bcf31c1` (task worktree baseline = `branch-dev`) → current working tree, scope `index.html` · `qa/run-offline.js` · `qa/vis_score_caliper_offline.js` only** (258-line diff, 3 files, +172/−8; no untracked in-scope files). No edits during the review; `git status` / `git diff --stat` identical before and after. Verdict: **PASS — "No findings. Read-only validation: the scoped diff contains only the three authorized files, and `npm run qa:offline` passed all 44 suites, including 275 technical-score assertions and the updated caliper."**

An earlier review (2026-09-23) was run over `52c322b` → working tree with `work/` and `BACKLOG.md` excluded; that diff is byte-identical (`cmp`) to the `bcf31c1` scoped diff, and it also returned PASS with no findings, but the `bcf31c1` scoped run above is the review of record. Both raw outputs are in codex.md.

FIX / DEFER / REJECT ledger (scoped implementation review): no findings → nothing to classify.

Final check (step 12, 2026-09-24, read-only, task diff = the scoped implementation diff + this file's contents; raw output in codex.md): **HOLD, 3 findings, all in `review.md`, all FIX**:

1. Class I — `index.html` line counts were stated as +51/−4; `git diff --numstat bcf31c1` gives +46/−5. **FIX** (claim about the implementation corrected above; per contract this earns a full `qa:offline` re-run and one Codex re-pass scoped to the changed `review.md` hunks — results recorded in the final-check line below).
2. Class II — Evidence row omitted the committed `brief.md` named by the canonical two-row shape. **FIX**: row now lists `brief.md` as committed baseline (unchanged) alongside the new `review.md`, keeping the Owner's precision ruling that the task changed only the three implementation/QA files plus `review.md`.
3. Class II — final-check summary line absent. **FIX**: added at the end of this file after the re-pass.

## Not touched

`scoreTickerTech` · `_ptScore*` helpers · `_srGroupResults` · `_srRenderGrouped` · `PT_ENABLE_TECH_SCORE` gate default/strictness · any Lane A file (`news-catalysts-*`, `qa/news_catalysts_*`, `qa/fixtures/replay/**`) · `BACKLOG.md` · `brief.md` · any network call outside `runTechScoreV1`'s existing fetches · `main`/production · Netlify · env.

## Lessons

- [covered]  The brief's "literal `Tech Score v1` exactly once" applies to comments too — a helper comment header tripped it; covered by brief §4 and the assertion that caught it.
- [backlog]  `coveragePct === availablePoints` in `scoreTickerTech` (brief §2 observation); a scorer-side decision whether coverage should be a distinct field — pending routing
- [backlog]  Tech Score v1 row: fractional-score display formatting and a transient-failure retry policy were deliberately left unruled in task 6 (rendered as returned; rejection drops its memo entry) — pending routing
- [local]    Large-file Edit approval previews on `index.html` showed a phantom ×4 duplicate of `async function _ts1FillRow(`; proven a rendering artefact by counting the proposed block in the scratchpad (1) and the on-disk file (1). Prove with counts, never "fix" the phantom.
- [local]    A Codex diff must be taken against the task worktree baseline (`bcf31c1`), not the brief's older base with path exclusions, even when the two diffs are byte-identical — the range named in evidence must be the range reviewed.

Final check: 1 round, 2 class-II findings fixed, 1 class-I finding FIX (line-count claim; QA re-run PASS at 44 + scoped Codex re-pass PASS, no findings), self-checked; no implementation change.

Post-rebase check (base `810586d`): 1 round, 1 class-II finding fixed (rebase evidence recorded above), self-checked; no implementation change, post-rebase `qa:offline` PASS at 44 already recorded.
