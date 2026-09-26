# Review — Entry 10 Scan Results row enrichment (narrowed)

## Scope change (Owner ruling 2026-09-26)
The committed brief's Risk/Reward column and chips (§3 items 1-3, SE-1/2/7 as written) were **removed from scope by Owner ruling**: Risk/Reward are score-derived and must not appear in Scan Results as independent metrics. Delivered: the **HELD marker only**. After Owner approval, `brief.md` was amended documentation-only (one inserted section, no deletions) to record this ruling; the brief's 3-file Implementation scope is unchanged.

## Behavior removed
Never shipped: no Risk / Reward `<th>`/`<td>`/chips, no colspan changes (ranked 7, review 6 unchanged). Nothing existing was removed; Deep Dive "Risk Level / Reward Potential" card and `_ptScoreStates` are untouched.

## What remains in the row enrichment
`<span class="sr-held">HELD</span>` after the symbol inside the `sr-sym` cell, both renderers; membership via `loadHoldings()` read once per render (`_srHeldMap`), case-insensitive, own-property only; unreadable/empty holdings => no marker. One CSS rule `.sr-held` (inline-only, no layout properties).

## Files changed
- Implementation (3): index.html, qa/vis_score_caliper_offline.js, qa/scan_results_enrichment_offline.js
- Evidence (tracked): work/scan-results-enrichment/brief.md, work/scan-results-enrichment/review.md

## QA
- Pre-edit baseline: PASS, 47 suites. Post-edit `npm run qa:offline`: PASS, 48 suites (1 advisory: pre-existing smart-quote warning at index.html:10175, not in this diff).
- New suite `scan_results_enrichment_offline.js`: 66 assertions PASS incl. planted negatives (SE-3/4/5/6, SE-RR1-4, SE-8/9/10, score-unchanged).
- Caliper: PASS 307; only `_srRenderGrouped` pin changed `02a07846…71a4` → `1301f2fa…9ea1` (function now reads `_srHeldMap()` and emits `_srHeldHtml`).

## Codex
Implementation-diff review (read-only, Worker-launched): PASS, no findings. Raw in `codex.md`.

## FIX / DEFER / REJECT
None.

## Lessons
- [local] Owner narrowed scope mid-task after brief approval; the Owner then approved a documentation-only brief amendment recording the ruling.

## Final check
Final check: 1 round, 1 finding (REJECT — the "Implementation (3)" count is correct; the third file `qa/scan_results_enrichment_offline.js` is untracked/new so it is absent from `git diff --stat`, which Codex was given); no implementation change, no QA re-run.

Final check (commit diff, post brief amendment): 1 round, 2 class-II findings fixed (line-count claim removed as unverifiable by the diff view; stale Lessons line corrected), self-checked; no implementation change, no QA re-run.
