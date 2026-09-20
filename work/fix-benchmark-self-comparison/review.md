# Review — fix-benchmark-self-comparison

## QA

- Pre-edit baseline: `npm run qa:offline` PASS, 14 phases, 214 technical-score assertions,
  1 pre-existing advisory (unrelated).
- Post-edit: `npm run qa:offline` PASS, 14 phases, 224 technical-score assertions (+10 new,
  matching the 10 new `check()` calls added), same 1 pre-existing advisory, 0 failures.
- `qa/run-offline.js` has no phase-selection flag — every invocation runs the full 14-phase
  harness. A direct `node qa/run-offline.js` full-harness rerun was also done (not a
  phase-scoped run) to confirm Phase 12 in isolation from the npm wrapper's stdout buffering;
  its Phase 12 result matched: 0 failures.

## Codex review (implementation diff)

Raw output captured verbatim in `work/fix-benchmark-self-comparison/codex.md`.

Findings:

1. **[P2] Live-path identity checks use untrimmed symbols** — `computeTechnicalSnapshot`'s
   `sym`/`etf` are `.toUpperCase()`d but not `.trim()`d, so a hypothetical whitespace-padded
   stored `sectorEtf` (e.g. `" QQQ "`) would fetch the same candle series as `sym` while
   bypassing the new `etf !== sym` guard, reproducing the self-comparison defect.
   - **Classification: DEFER.** The approved brief scoped the guard to a plain identity
     check at the two named lines; normalizing `sym`/`etf` more broadly (`.trim()`) changes
     this function's general symbol-normalization behavior (affects the `_techCache` key and
     the `candles[sym]` map lookup too), which is outside the approved guard-only scope.
     Correction after final-check re-verification: the interactive edit-save path
     (`index.html` lines ~6918, ~7012, ~13852, ~14307, ~14683) does apply
     `.trim().toUpperCase()` before storage, but `migrateWatchlist`'s object-form forward-fill
     (`index.html` ~4817: `sectorEtf: e.sectorEtf ?? d.sectorEtf`) does not re-trim a
     pre-existing persisted or imported value — so a legacy/imported entry carrying a
     whitespace-padded `sectorEtf` has a real, evidenced code path to reach
     `computeTechnicalSnapshot` untrimmed. No current write path is known to actually produce
     such a padded value, so this remains a defense-in-depth gap rather than a confirmed live
     defect. Recorded here for Owner visibility; if the Owner wants it hardened, it belongs to
     either a brief amendment on this task or a small follow-up normalization task on
     `computeTechnicalSnapshot`'s `sym`/`etf` derivation — not silently absorbed into this
     diff.
   - No other findings. Exact self-comparisons return `null` without integrity noise, RS
     weight is not redistributed, and distinct/valid benchmark comparisons are unchanged.

## Files changed

- Implementation (2): index.html, qa/run-offline.js
- Evidence (tracked): work/fix-benchmark-self-comparison/brief.md,
  work/fix-benchmark-self-comparison/review.md

## BACKLOG.md routing (Owner ruling)

`BACKLOG.md` item #5 ("Benchmark self-comparison guard") describes exactly this defect and is
now fully addressed by this task (guard at `computeTechnicalSnapshot`, guard at the scoring
path via `_ts1RsValue`, focused regression coverage added to the existing Technical Score QA
in `qa/run-offline.js`; the Comparison render needed no separate change since it already
renders `null` as "RS unavailable"). This task also surfaced one new small follow-up (the
deferred `sym`/`etf` trim hardening above). Per prior Owner ruling recorded in
`work/remove-unused-history-service/brief.md` ("BACKLOG.md ... marking item #3 done — Owner
has ruled these are closeout metadata, updated only after successful implementation/QA/LAND,
not part of the code-change scope") and confirmed again for this task, **`BACKLOG.md` is left
untouched by this task's commit.** Both items below are recorded as `pending routing` rather
than acted on:

## Lessons

- [backlog] `BACKLOG.md` item #5 ("Benchmark self-comparison guard") is fully addressed by
  this task's implementation + QA — pending routing (Owner marks it done separately).
- [backlog] Consider trimming `sym`/`etf` in `computeTechnicalSnapshot` (index.html ~1129,
  ~1138) as defense-in-depth so a whitespace-padded stored `sectorEtf` can never bypass a
  symbol-identity guard, even though no current write path is known to produce one — pending
  routing (belongs in `BACKLOG.md` as a small, separate normalization task).
- [local] Two independent RS-computation code paths exist in this file (`_ts1RsValue` for
  the gated SCORE-V1 scorer, `computeRelativePerf`/`computeTechnicalSnapshot` for the live
  panel) and had to be fixed in parallel with the same guard shape — true of this task only,
  no destination.

## Final check

Raw output captured verbatim in `work/fix-benchmark-self-comparison/codex.md` under
`## Final check`. 4 findings: 2 Class I, 2 Class II.

- Class I — `qa.log` missing: **FIX** (created, pre-edit baseline on first line + full
  post-edit `npm run qa:offline` output).
- Class I — `[backlog]` lesson not routed into `BACKLOG.md`: **REJECT** — Owner-confirmed
  this task follows the same precedent as `work/remove-unused-history-service/brief.md`
  (BACKLOG.md closeout marking is handled separately, not part of code-change scope); both
  backlog lessons recorded as `pending routing` instead.
- Class II — targeted-run claim inaccurate: fixed (reworded; `qa/run-offline.js` has no
  phase-selection flag, both runs were full-harness).
- Class II — deferred-finding rationale overstated normalization coverage: fixed (corrected
  to name `migrateWatchlist`'s un-retrimmed forward-fill path).

Final check: 1 round, 2 class-I findings — 1 FIX, 0 DEFER, 1 REJECT, 0 unresolved; 2 class-II
findings fixed, self-checked. No implementation file (`index.html`, `qa/run-offline.js`) was
touched by this round's fixes — only task-evidence files (`qa.log`, `review.md`) — so no QA
re-run or scoped Codex re-pass was required.
