# Review — Entry 11: Selected only watchlist view

## Governance status (current, authoritative)

**R11 is satisfied.** This task branch's base is `6411f70` on canonical `branch-dev` — a
docs-only commit (`docs(work): approve Entry 11 selected-only watchlist brief`) that adds
exactly `work/selected-only-watchlist/brief.md`, Status line `APPROVED`, nothing else.
`origin/branch-dev` is still `e27ce1c` (unpushed) — `6411f70` exists only on local
`branch-dev`, which is expected pre-push.

`git diff 6411f70 -- work/selected-only-watchlist/brief.md` is **empty**: this task's committed
brief is byte-identical to the canonical base — this task did not, and does not, re-edit the
brief.

This repairs a real sequencing gap from an earlier pass of this same task (see "Historical,
pre-repair state" below, kept for the record, not as current evidence).

## Historical, pre-repair state (superseded — not governing evidence)

An earlier pass implemented the same change on top of `e27ce1c` directly, with the brief only
written to disk and approved verbally in chat — no brief-only commit existed yet. A first Codex
review (on that pre-repair content) flagged this as High severity. The Owner ruled that chat
approval alone does not satisfy R11, and directed a clean repair rather than a waiver:
1. `work/selected-only-watchlist/brief.md` was committed on canonical `branch-dev` as `6411f70`.
2. This task branch was moved onto that base (`git reset --mixed 6411f70`, then the working-tree
   brief was restored from `6411f70` so it is byte-identical to the committed version).
3. The implementation diff (`index.html`, `qa/selected_only_watchlist_offline.js`) was carried
   over unchanged — it never depended on the brief's Status line.
4. Fresh targeted QA, full QA, and a second, independent Codex review were run against the
   repaired base (below). This is what governs the task now.

The pre-repair QA and Codex results are not reproduced here; they are superseded by the
post-repair runs below, which are evidentially equivalent or stronger (the QA suite was
tightened twice in response to Codex findings — see "Lessons").

## Scope — files touched

```
index.html                                   markup, CSS, 3 predicate functions, new handler
qa/selected_only_watchlist_offline.js        NEW — SO-1..SO-7
work/selected-only-watchlist/{brief,plan,qa.log,review.md}   tracked/scratch task artifacts
```

`brief.md` is identical to the `6411f70` base (not part of this task's own diff). `plan.md` and
`qa.log` are gitignored scratch artifacts (`work/*/plan.md`, `work/*/qa.log`); `review.md` (this
file) is the only other tracked artifact. No other file touched. No `localStorage` key added or
read for this feature. No scan-engine, scoring, or `getScanSymbols()` change.

## QA evidence (post-repair, on base `6411f70`)

- **Targeted suite**: `node qa/selected_only_watchlist_offline.js` → `PASS (SO-1..SO-7)`.
- **Governing constraint**: `node qa/ui_hygiene_offline.js` → `UI HYGIENE OFFLINE: PASS`
  (UH-1…UH-7 unchanged; UH-3's 5-field extraction is unaffected by the new, separate
  selected-only filter statements).
- **Full gate**: `npm run qa:offline` → `OFFLINE VALIDATION: PASS`, 53 spawned suites (52 base +
  1 new, auto-discovered), 1 advisory (pre-existing smart-quote char, unrelated to this task).

## Manual QA scenarios (design verification, traced against final code; no browser run performed)

- **OFF → current behaviour.** `_selectedOnly` defaults `false`; no filter applied beyond the
  existing search filter in all three functions — byte-identical to pre-task behaviour when OFF.
- **ON, search inside filtered view.** `_selectedOnlyPinned` is captured on toggle-ON from live
  `inScan` state; all three functions apply the search filter first, then the pinned-set filter —
  search narrows within the selected set, per brief.
- **Uncheck-while-active stays visible.** `toggleScanInclusion` (per-checkbox) never calls
  `renderWatchlistRows()` — it patches the single checkbox DOM node in place. Even across an
  unrelated re-render (e.g. a scan completing → `renderResults` → `renderWatchlistRows`), the row
  stays visible because the selected-only filter reads the fixed `_selectedOnlyPinned` snapshot,
  not live `inScan`, and `toggleScanInclusion` never touches that snapshot.
- **Re-pin on search change.** `filterWatchlistRows` refreshes `_selectedOnlyPinned` only when
  the normalised query actually changes while `_selectedOnly` is `true` — confirmed by SO-7
  (brace-depth-aware: the assignment is syntactically inside the `if (_selectedOnly) { ... }`
  block, itself after the "query unchanged" early return).
- **Toggle-all scoped to visible rows.** `toggleAllVisibleScanInclusion` computes `visibleRows`
  through the same two-stage filter (search, then pinned-set) before toggling.
- **Counts/badges immediate.** `toggleSelectedOnly()` calls `renderWatchlistRows()` then
  `updateRunScanCount()` on every flip.
- **Empty state.** Precedence: empty watchlist → existing copy; `_selectedOnly` true and the
  two-stage-filtered result empty → `No tickers selected for the next scan.`; otherwise a
  search-only miss → existing `No tickers match`.
- **Reload resets to OFF.** `_selectedOnly`/`_selectedOnlyPinned` are plain `let` locals with no
  `localStorage` reference anywhere (SO-2) — they cannot survive a reload.

**Not performed this session:** an actual browser/DOM run. A hosted browser QA pass (per
`CLAUDE.md`'s Cowork routing) is recommended before/at an optional Owner DEV check, consistent
with Entry 9's own closure precedent (not a blocking gate for an offline-only task).

## Codex review (read-only, `codex exec --sandbox read-only`, codex-cli 0.157.0) — two passes

**Pass 1 (pre-repair base, content since carried over unchanged for the non-QA files):**

| Finding | Severity | Disposition |
|---|---|---|
| Brief still said DRAFT; no brief-only commit backed the implementation | High | Confirmed accurate at the time. Led directly to the Owner-directed repair above — not fixed in place, repaired at the process level. |
| QA suite under-proved SO-1 (anchor ambiguity vs. a duplicate CSS comment), SO-2 (narrow argument-order case), SO-5/SO-7 (proximity instead of exact syntactic proof) | Medium | **FIX** — applied (anchor searched strictly after the toggle; ternary-exact regex; brace-depth containment). |
| Toggle-all can leave a ticker outside the pinned set invisible | Low | No change needed — matches the specified "toggle-all affects only visible rows" behaviour; confirmed by Codex's own trace. |

**Pass 2 (post-repair base `6411f70`, fresh and independent):**

| Finding | Severity | Disposition |
|---|---|---|
| `review.md` (this file, prior revision) still described the brief as uncommitted / the High finding as unresolved, which was now stale | High | **FIX** — applied. This revision replaces that narrative with the current governance status above and demotes the earlier text to an explicitly labeled historical section. |
| SO-1 anchor check proved source order but not anchor uniqueness or section containment — a duplicated anchor elsewhere in the file could in principle satisfy it | Medium | **FIX** — applied. SO-1 now also asserts each of the four anchors (`sb-scan-section`, `scanNote`, `selectedOnlyToggle`, `stale-banner`) occurs exactly once, with a new negative control planting a duplicate `#scanNote`. Full DOM-depth containment (verifying the toggle sits inside the section's own closing tag, not just before the next section's anchor) was judged disproportionate to this repo's static-assertion QA style (see `qa/ui_hygiene_offline.js`'s own anchors, which use the same source-order/count approach, not a parser) and was not added. |
| SO-2's persistence scan used a fixed 120-character window after each `localStorage` call, which a longer argument expression could outrun | Medium | **FIX** — applied. SO-2 now extracts each call's full argument list via balanced-paren matching (no fixed width), with a new negative control using an argument far longer than the old window. A call via a renamed alias or bracket-property access (`localStorage['setItem']`) is still outside this check's reach — noted as an accepted, narrow residual limitation consistent with every other string-literal-based suite in this repo (e.g. `qa/ui_hygiene_offline.js`'s own `localStorage.setItem` count in UH-7), not fixed further. |

A third, narrowly-scoped Codex round was run after this second round of SO-1/SO-2 tightening
(see "Pass 3" below) rather than relying on the targeted re-run alone. A full `qa:offline`
full-gate re-run after these two edits was also completed — see Status: **PASS, 53 suites.**

**Pass 3 (post-SO-1/SO-2-tightening, scoped to the SO-1/SO-2 fixes and this review file):**

| Finding | Severity | Disposition |
|---|---|---|
| Class I: none found | — | No action needed. |
| `review.md` itself contained an internal inconsistency: this table said the full `qa:offline` re-run was "pending" while the Status section already reported it as PASS | Class II | **FIX** — applied (this edit). The stale "pending" sentence is replaced with the actual, already-reported result. |

No fourth Codex round was run after this one-line documentation fix (no code or QA file changed).

## Lessons

- The triplicated 5-field search-filter pattern (kept deliberately per Entry 9) composes cleanly
  with a second, independent view filter as long as the second filter is a **separate statement**
  — never chained onto the same `.filter(e => ...)` call — because `qa/ui_hygiene_offline.js`'s
  UH-3 extraction only looks at the *first* `.filter(e =>` occurrence in a function up to its own
  `);`. Worth carrying forward as a standing constraint note for any future filter added to these
  three functions.
- A static QA checker that uses "is X within N characters of Y" as a proxy for "X gates Y" is
  weaker than it looks. Prefer matching the real implementation's exact syntactic form (a
  ternary regex, brace-depth containment, balanced-paren argument extraction) over a fixed
  window or loose proximity — applied across two Codex rounds on this task (SO-1, SO-2, SO-5,
  SO-7). There is a point of diminishing returns (full parsing/DOM containment) that this repo's
  existing suites do not cross either; matching that house style, not exceeding it, is itself a
  judgment call worth naming explicitly when made.
- Confirm a literal anchor string is unique in the file before using it as a QA ordering anchor —
  `index.html` had the same words ("Missing key warning") in both a CSS comment and the intended
  HTML comment; an un-anchored `indexOf` silently picked the wrong one.
- **Process**: verbal/chat Owner approval of a brief's exact contents is necessary but is not, by
  itself, sufficient to begin implementation under this repo's R11 contract. The brief-only
  commit through the R11 gate is a distinct, required step with its own approval record. The
  Owner explicitly declined to waive this after the fact, and directed a clean repair (new
  brief-only commit → rebase task branch → replay diff → fresh QA/Codex) rather than accepting
  the earlier evidence as valid. Confirm the brief-only commit exists (or is explicitly waived by
  the Owner, in writing, for a named task) *before* writing any implementation file, not after.
- A review document (this file) is itself task evidence and can go stale the same way code can —
  it needed its own correction pass once the governing base moved. Treat `review.md` as subject
  to the same "re-verify against current state, don't assume yesterday's write-up still holds"
  discipline as the code it describes.

## Status

Owner approved the task commit on base `6411f70`.

- Targeted suite, `qa/ui_hygiene_offline.js`, and one full `qa:offline` run were green on base
  `6411f70` (53 suites) **before** this round's SO-1/SO-2 tightening.
- SO-1/SO-2 were tightened after that full run, in response to Codex pass 2; the targeted suite
  was re-run green immediately after (`node qa/selected_only_watchlist_offline.js` → PASS,
  SO-1..SO-7, with the new negative controls also passing). A fresh full `npm run qa:offline` was
  then re-run on this final state: **PASS, 53 suites, zero FAILs**, same pre-existing advisory.
- Brief confirmed governing and unedited by this task (`git diff 6411f70 -- brief.md` empty).
- A third, narrowly-scoped Codex round (Pass 3 above) was run against the SO-1/SO-2 tightening
  and this review file: **zero Class I findings**; one Class II finding (this file's own stale
  "pending" sentence, now fixed in this revision). No fourth Codex round was run after that
  one-line documentation fix.
- Task commit made on `task/selected-only-watchlist` (r9 gate); post-commit
  `qa/guard_integrity_check.js` PASS. LAND/push remain pending separate Owner approval (R12).

LAND-EVIDENCE: qa-offline=PASS 53; targeted=PASS; codex-classI-unresolved=0
