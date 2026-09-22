# Review — S2-A1 evidence replay corpus

Task: `task/s2-evidence-replay-corpus` (worktree `pt-wt-s2-evidence-replay-corpus`).
Brief: `work/s2-evidence-replay-corpus/brief.md` (Owner-approved, hash `1825dc29dd250532e23469eabc21a273fb39b65256b64fa51810c1500b4ff8bf`).

**Pre-commit sync provenance:** implementation and all QA above originated at `branch-dev`
`2e00bc1`. Immediately before task-branch commit, the task branch was fast-forwarded
(`git merge --ff-only branch-dev`, no merge commit) to `87e45a6`, whose sole intervening
change vs `2e00bc1` was `work/parser-render-integrity/brief.md` (docs-only, unrelated to A1,
zero overlap with the A1 file set). Full QA re-run against this post-sync base (`87e45a6`)
confirms no regression from the sync: replay suite **10/10 PASS**; `qa:offline` **PASS, 44
spawned suites**; provider **48/48 PASS**; core **30/30 PASS** — identical results to the
pre-sync run at `2e00bc1`.

## Result

**PASS.** All approved implementation paths created exactly as scoped; no production file
touched; full `qa:offline` gate PASS at **44** spawned suites (43 → 44, exactly +1); provider
**48/48**; core **30/30**; the new suite's own 10 assertions (R-1…R-10) all PASS. Includes a
second, Owner-reviewed correction round (§"Owner-review correction round" below) — apply
this review, do not treat the earlier one as final.

## Implementation base note

The Brief's baseline table (§Baseline) records `branch-dev` base as `1eda72c`. The actual
worktree/implementation base is `2e00bc1` — two docs-only commits ahead of `1eda72c` (the
brief-approval commit itself, plus an unrelated `docs(ui)` brief for a separate task). No
production file changed between `1eda72c` and `2e00bc1`; the provider file is byte-identical
at both commits (confirmed by `providerSha256` — see below). This delta was flagged during
the pre-implementation gap check and the Owner ruled it does not require rewriting the Brief.

## Files changed

**Implementation paths (approved scope — exactly 3 path patterns, 11 files):**

- `qa/news_catalysts_replay_offline.js` — NEW, 533 lines. Replay + attribution suite.
- `qa/fixtures/replay/index.json` — NEW. Corpus manifest (9 cases) + 5-entry curated
  reference-event manifest (brief §5).
- `qa/fixtures/replay/<case>.json` — NEW, 9 files (3 runs × 3 tickers: `p3-20260921T2045Z-*`,
  `p4-20260921T2307Z-*`, `p4-20260921T2312Z-*`).

**Task evidence (not implementation scope, per the Brief's finalization allowance):**

- `work/s2-evidence-replay-corpus/review.md` — this file.

**No production file in the diff.** `git status --short` in the worktree shows exactly these
three untracked paths (`qa/fixtures/`, `qa/news_catalysts_replay_offline.js`,
`work/s2-evidence-replay-corpus/review.md`); `git diff --stat` against tracked files is empty.

## Fixture/corpus inventory

All 9 `(run, ticker)` cases extracted, each with full provenance (`pilot`, `runId`, `ticker`,
`captureSha256` verbatim from the source manifest, `nowIso`, `providerSha256`,
`providerCommit`, `harnessPinset`, `extractedAtUtc`, `extractedBy`) and both hash chains
(original `captureSha256` re-verified byte-for-byte against the source manifest at extraction
time; `index.json` records each extracted fixture's own SHA256). The two Pilot 4 runs
(`p4-20260921T2307Z`, `p4-20260921T2312Z`) are kept as separate, never-merged cases per §1.

| caseId | raw | survived | skipped |
|---|---|---|---|
| p3-20260921T2045Z-NVDA | 7 | 4 | 3 |
| p3-20260921T2045Z-FROG | 7 | 7 | 0 |
| p3-20260921T2045Z-MRNA | 4 | 4 | 0 |
| p4-20260921T2307Z-NVDA | 8 | 8 | 0 |
| p4-20260921T2307Z-FROG | 3 | 3 | 0 |
| p4-20260921T2307Z-MRNA | 2 | 2 | 0 |
| p4-20260921T2312Z-NVDA | 6 | 5 | 1 |
| p4-20260921T2312Z-FROG | 5 | 2 | 3 |
| p4-20260921T2312Z-MRNA | 2 | 2 | 0 |

## Attribution results (§4 buckets, per case, all disjoint and summing to raw)

Only two skip reasons occur in the real 9-case data: `INVALID_SOURCE_URL` (P3 NVDA: 3, P4b
NVDA: 1 — all attributed `Q3_UNRETRIEVED_SOURCE_URL`, none `MALFORMED_CANDIDATE`) and
`DUPLICATE_IN_BATCH` (P4b FROG: 3, attributed `DUPLICATE_IN_BATCH`). `GENERIC_SOURCE_URL`,
`FUTURE_DATED_CATALYST`, and the remaining `MALFORMED_CANDIDATE` reasons never fire in the
real data. Per the Owner-review correction (below), R-6 now exercises **every** §4 bucket on
synthetic candidates built inline in the suite (not persisted as fixtures), per brief §7
("on a synthetic case") — see "R-6 classifier bucket coverage" below for the full breakdown.

**Attribution mechanism — zero ladder reimplementation (brief §6, STOP-1):** each raw
candidate is matched to its surviving item by exact equality on the 7 original fields
(`eventDate, category, direction, sourceUrl, eventType, relevanceScope, subType`); the
leftover unmatched raw candidates, in their original array order, are zipped 1:1 against the
REAL provider's own `skippedItems` array, also in original order — valid because the
provider's single forward-pass loop never reorders either output array. This is pure
structural reconciliation of two arrays the real provider already produced; it never predicts
or re-derives an outcome. The only additional predicate applied is the same syntax-only https
check the D-M2 reconstruction already uses (`isAcceptableSourceUrl`, ported from
`pt-pilot3/4-harness/lib/capture.js`), used only to split the single `INVALID_SOURCE_URL`
reason string into its two real, independently-verified emission sites
(`news-catalysts-provider.js:641` malformed-syntax vs `:646` grounding-miss) — never a re-run
of the ladder.

The one **declared, checked duplication** (brief §6) is the D-M2 Evidence Set reconstruction,
ported verbatim from the Pilot 3/4 harness's `lib/capture.js#reconstructEvidenceSet`. R-7
independently verifies it agrees with real provider grounding behaviour on a known case
(P3 NVDA): every survivor's `sourceUrl` is present in the reconstruction; all 3 known Q-3
candidates are absent from it.

## R-6 classifier bucket coverage (synthetic, tests the classifier only)

R-6 now covers, on synthetic candidates validated by the REAL provider (never a fabricated
skip reason, never a re-run of the ladder — only `attributeCandidates`, the classifier, is
under test):

- Case A: a well-formed, never-retrieved URL → real provider skips `INVALID_SOURCE_URL` →
  classifier attributes `Q3_UNRETRIEVED_SOURCE_URL` (not `MALFORMED_CANDIDATE`).
- Case B: the identical candidate, now retrieved → survives; Q-3 bucket correctly 0
  (correct-by-absence, never inferred).
- Case C: one combined envelope with 6 candidates, each engineered to trip a different real
  skip path — asserted against the REAL provider's own `skippedItems` order first, then
  against the classifier's bucket assignment:
  - future-dated catalyst → real `FUTURE_DATED_CATALYST` → `DETERMINISTIC_VALIDATION_REJECTION`
  - unknown category (a `MALFORMED_REASONS` member) → real `UNKNOWN_CATEGORY` → `MALFORMED_CANDIDATE`
  - non-https URL → real `INVALID_SOURCE_URL` (syntax site) → `MALFORMED_CANDIDATE`
  - byte-identical duplicate candidate → real `DUPLICATE_IN_BATCH` → `DUPLICATE_IN_BATCH`
  - grounded-but-generic path (`/news`) → real `GENERIC_SOURCE_URL` → `GROUNDING_REJECTION`
  - (the one survivor) → `SURVIVED`

  Final bucket vector asserted exactly:
  `{SURVIVED:1, MALFORMED_CANDIDATE:2, Q3_UNRETRIEVED_SOURCE_URL:0, GROUNDING_REJECTION:1,
  DETERMINISTIC_VALIDATION_REJECTION:1, DUPLICATE_IN_BATCH:1}` — every one of the six §4
  buckets is now exercised by at least one real-provider-validated case, real or synthetic.

## Replay reproduction results (R-2)

All 9 cases replay byte-identically to the provider output recorded in the original capture.
This was **not guaranteed a priori**: Pilot 3 ran against an older `providerSha256`
(`91206eaa…`, repo `4a61959`, pre-H-C-hardening) while Pilot 4 and the current worktree share
`providerSha256` `b065e838…` (post-H-C-hardening, `1eda72c`/`2e00bc1`). Empirically verified
before writing the suite: replaying all 3 Pilot 3 captures through the *current* provider
reproduces the recorded output exactly for these specific candidates — the H-C hardening did
not change the outcome for any of the 9 real cases. Had it not reproduced, that would have
been a genuine STOP (§10.6), not a baseline update.

## Reference-case outcomes (§5, curated — lower authority than candidate-level attribution)

All 5 refIds from the Brief, no 6th case invented. Outcomes are **pinned exact-URL matches**
recorded in `index.json`, established by direct inspection of the reconstructed Evidence Set
and replayed items for each run — never inferred by the suite at runtime, and never derived
by fuzzy matching:

| refId | P3 | P4a (`…2307Z`) | P4b (`…2312Z`) |
|---|---|---|---|
| mrna-fda-covid-2026-27 | RESOLVED_EMITTED | RESOLVED_EMITTED | NOT_ASSESSED (no confident match) |
| mrna-interpath-ph3 | RESOLVED_EMITTED | RESOLVED_EMITTED | Q-1 |
| nvda-doj-probe | Q-2 | Q-2 | Q-2 |
| nvda-q2-fy27-earnings | Q-3 (candidate-level) | RESOLVED_EMITTED | Q-1 |
| mrna-convertible-notes | C-1_OBSERVED | C-1_NOT_OBSERVED | C-1_NOT_OBSERVED |

R-10 cross-checks every `RESOLVED_EMITTED`/`Q-1` pinned URL against live replay output
(asserts the URL really is/isn't among survivors and really is in/out of the reconstructed
Evidence Set); `Q-2`/`NOT_ASSESSED`/`C-1_*` outcomes are recorded but never asserted by the
suite (absence is never inferred as certainty beyond what a human curator pinned). Two
P4b cells (`mrna-fda-covid-2026-27`, and the `NOT_ASSESSED` reasoning) reflect genuine
ambiguity found during extraction — deliberately left unresolved rather than guessed.

## QA results and suite count

- `node qa/news_catalysts_replay_offline.js` — **ALL PASS (10 passed, 0 failed)**: R-1…R-8
  green as INVARIANTs (R-6 now with full 6-bucket synthetic coverage); R-9 now also verifies
  the executable fixture SHA256 hash chain; R-10 now also verifies the 15-mapping
  reconciliation — all documented above.
- `npm run qa:offline` — **PASS**, **44** spawned suites (43 → 44, exactly +1, per §9).
- `node qa/news_catalysts_provider_offline.js` — **48/48 PASS**, unchanged.
- `node qa/news_catalysts_core_offline.js` — **30/30 PASS**, unchanged.
- No network call; no live API key used; injected `fetchImpl` only.

## Owner-review correction round

The Owner reviewed the first implementation pass and required four in-scope QA-integrity
corrections before LAND-request, all applied and re-verified (still no production file, still
44/44/48/30 PASS):

1. **R-10 no silent reference-case skip.** The `if (!caseId) { continue; }` pattern was
   already replaced with a hard `assert.ok` (an earlier self-correction), but the Owner
   additionally required an explicit reconciliation check. Added: `index.referenceManifest`
   must contain exactly 5 refIds (never 6, never fewer), and a running `actualVisits` counter
   is asserted to equal both a computed `expectedVisits` (sum of `perRun` keys across all 5
   refIds) and the literal `15` (5 × 3) — so a future edit that silently drops a mapping, or
   silently adds one, fails loudly instead of passing quietly. Exact curated mapping semantics
   preserved — no fuzzy matching introduced.
2. **Fixture SHA256 runtime integrity, made executable.** R-9 now reads each fixture's raw
   on-disk bytes, computes SHA256, and asserts it equals the `fixtureSha256` `index.json`
   recorded at extraction — a mismatch is a hard failure, not a warning. This checks the
   **repo's own fixture files** only; the external Pilot harness trees are never re-read at
   suite runtime (per §8, "a QA suite must not depend on a path outside the repo" — this task
   deliberately keeps that boundary at the repo's `qa/fixtures/replay/*.json`, not the pilot
   `out/` directories). `crypto` (previously a dead import, removed in the first pass) is
   reintroduced and now genuinely used for this hash.
3. **Classifier branch coverage extended.** R-6 (not a new top-level test — the existing R-1…
   R-10 structure is unchanged) now exercises all 6 §4 buckets on synthetic candidates; see
   "R-6 classifier bucket coverage" above. No provider validation ladder logic was
   reimplemented in the suite. Each synthetic candidate is passed through the real
   `getNewsCatalysts` provider, whose existing validation ladder produces the real outcome;
   the suite only tests the attribution classifier against that outcome.
4. **`review.md` accuracy.** This file now distinguishes implementation paths (3 patterns, 11
   files) from task evidence (this file) explicitly, corrected the untracked-path count, and
   the R-6 coverage description above now matches exactly what the final suite tests.

## Secret / provenance verification

R-8 scans every fixture file for API-key, `Bearer`, `Authorization:`, Google-key, and
`"init":` patterns — none found (independently re-verified against all 9 raw manifests and
the pilot capture files themselves before extraction, per the gap-check evidence
verification). Every fixture's `provenance` block carries the original `captureSha256`
verbatim; `index.json` additionally records each extracted fixture's own SHA256, per §8's
two-link hash-chain model.

## Independent review (Codex-role)

An independent adversarial review of the diff against the Brief found:

1. **CONFIRMED (fixed):** `qa/news_catalysts_replay_offline.js` imported `crypto` but never
   used it — dead import, removed.
2. **CONFIRMED (fixed):** R-1's test label overclaimed cross-process coverage ("every case")
   when only one representative case is actually spawned cross-process. Label reworded to
   state exactly what is checked (in-process determinism for all 9; cross-process for one
   representative case with both survivors and skips).
3. No STOP-condition violation found. The order-zip attribution mechanism was independently
   confirmed to be structural reconciliation, not a hidden ladder reimplementation, and was
   verified against all 9 real fixtures (including the one real `DUPLICATE_IN_BATCH` case)
   with zero misattribution. R-7 was confirmed to carry real signal (not tautological). R-10
   was confirmed to use pinned matches only, never fuzzy inference.

Both findings were applied; the suite and full gate were re-run after the fix (still 10/10,
still 44/44/48/30 PASS — see above).

## Lessons

- [rule] When a fixture corpus's `expected` output is defined as "what the real provider
  produces," always verify empirically that the *specific* fixture's authoring provider
  commit doesn't differ from the current provider commit — a `providerSha256` mismatch (as
  found here for Pilot 3, pre- vs post-H-C-hardening) is silent unless checked, and could
  turn a genuine R-2 pass into a false one if the provider drift and the fixture's real
  candidates happened to interact differently.
- [design] "No reimplementation of the ladder" (brief §6, STOP-1) does not forbid *all*
  candidate-level classification — matching two arrays the real provider already produced
  (survivors ↔ raw candidates by field equality, then order-zipping the remainder against the
  real `skippedItems`) is structural reconciliation, not re-derivation, and stays within
  scope. The only additional judgment call needed (splitting one skip reason into two
  emission sites) was resolved with a single reused syntax predicate, not a second validation
  pass.
- [local] Five-refId curated matching against 3 runs (15 cells) required direct textual
  archaeology of each run's reconstructed Evidence Set and survived items — no shortcut
  exists, and two cells were left `NOT_ASSESSED`/ambiguous rather than guessed, per the
  Brief's "never inferred" rule.

## Next single recommended step

Owner review of this `review.md` and the 11 implementation files (the suite +
`qa/fixtures/replay/index.json` + 9 case fixtures), then task-branch commit decision.

LAND to `branch-dev` is a separate later Owner decision after the task commit is verified.

Push is also separate and requires explicit Owner approval.

No further implementation, commit, LAND, or push has been performed.
