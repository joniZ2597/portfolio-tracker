# Review — S2 · A5 — Hub source identity (Rule S)

Task started from base `52c322b`. After Owner-approved rebase, the task commit sits on
`branch-dev @ bcf31c1` — `ccc5dba` (the approved brief commit) and the approved brief are now in
this branch's ancestry. Worktree: `pt-wt-s2-hub-source-identity`, branch
`task/s2-hub-source-identity`.
Brief: `work/s2-hub-source-identity/brief.md`, committed `ccc5dba`,
SHA256 `e1e6015ba347354d2694adcdf0ae35cb00e5766c6842fc6d6cef08d2f7dfbbbf` (r2, approved).

## Files changed

| File | Change |
|---|---|
| `netlify/functions/lib/news-catalysts-provider.js` | 1 new const (`INDEX_DOC_LEAF_RE`) + 2 changed lines at the ladder's generic-source check (was `:661-662`) |
| `qa/news_catalysts_provider_offline.js` | new tests NP50–NP57 (3 positive, 4 negative control, 1 regression pin including a source-level `GENERIC_SOURCE_PATH_RE` baseline comparison) |
| `qa/news_catalysts_replay_offline.js` | R-1 cross-process representative re-pointed FROG → NVDA; new tests R-12–R-15 |
| `qa/fixtures/replay/p4-20260921T2312Z-FROG.json` | `expected` block regenerated (items/skippedItems/attribution only) |
| `qa/fixtures/replay/index.json` | `fixtureSha256` updated for the FROG case only |

## Before / after delta — `p4-2312-FROG`

| | Before | After |
|---|---|---|
| items | 2 | 0 |
| skippedItems | `{DUPLICATE_IN_BATCH: 3}` | `{GENERIC_SOURCE_URL: 5}` |

The three `DUPLICATE_IN_BATCH` skips becoming `GENERIC_SOURCE_URL` is expected: the generic
check now rejects all five hub-bound candidates before the duplicate-detection stage is reached.
Verified via direct provider invocation against the fixture's `rawResponseBody` before touching
the fixture's `expected` block.

**Eight other cases confirmed unchanged.** R-14 compares each non-FROG fixture's full on-disk
content against `git show 52c322b:<path>`, with CRLF normalized to LF on both sides before
comparison, so a checkout line-ending difference is never reported as a divergence — this proves
the content is unchanged modulo checkout line endings, not raw-byte identity. R-9 separately
confirms on-disk bytes hash to the recorded `fixtureSha256`. Only the FROG entry's
`fixtureSha256` was changed in `index.json`.

## R-1 re-point

Representative case moved from `p4-20260921T2312Z-FROG` (now 0 items / 5 skips, no survivors to
exercise) to `p4-20260921T2312Z-NVDA` (5 items, 1 `INVALID_SOURCE_URL`, unaffected by Rule S).
Same in-process/cross-process byte comparison; the check is not weakened.

## Codex review round 1

Scoped Codex review (base `branch-dev @ bcf31c1`, target `2350ea9`) returned 2 BLOCKING + 1
NON-BLOCKING findings, all addressed here:

1. **BLOCKING** — NP56/NP57 proved `news-details` wasn't added and `SKIP_REASONS.length === 12`,
   but neither pinned `GENERIC_SOURCE_PATH_RE`'s segment list itself; a future widening (e.g.
   adding `events`) would pass every existing test while silently rejecting legitimate article
   paths under the new segment. Fixed: NP57 now extracts the `GENERIC_SOURCE_PATH_RE`
   declaration line's source text from the current file and from the approved baseline
   (`git show 52c322b:<path>`) and asserts they are equal — without exporting the regex and
   without re-running/reinterpreting the generic-path policy. Verified this pin actually fails
   against a mutated copy with `events` added to the segment list, then restored the real file
   and reconfirmed 56/56 pass.
2. **BLOCKING** — this `## Lessons` section lacked the AGENTS.md-required routing tags. Fixed
   below.
3. **NON-BLOCKING** — the "brief not present in worktree history" statement went stale after the
   rebase. Fixed in the header above.

## Codex review round 2

Follow-up scoped Codex review (base `branch-dev @ bcf31c1`, target `2350ea9` + working-tree
changes) confirmed round 1's findings 2 and 3 fully resolved, and found round 1's finding 1
**partially** resolved: NP57's `DECL_RE` was not line-anchored, so it could match the old,
unwidened declaration text if left behind as a comment directly above a widened real
declaration (`exec()` returns the first match in source order, which would be the comment).
Independently confirmed by Codex: an isolated mutation with the old line commented out above a
real widened line still passed NP57.

Fixed: `DECL_RE` is now anchored with `^...$` and the `m` flag, matching only a line that begins
at column 0 with the literal `var GENERIC_SOURCE_PATH_RE = ` — a `//`-commented-out copy of the
same text on its own line never matches, since such a line does not itself start with
`var GENERIC_SOURCE_PATH_RE = `. Added a companion `DECL_RE_G` global match with an exact-count
assertion (`=== 1`) on both the current file and the baseline, so more than one qualifying line
— or zero — fails loudly instead of silently. (This line-anchoring alone was later found by
Codex review round 3, below, to still be bypassable via a `/* ... */` block comment; that gap
is closed in round 3.)

Verified against three scenarios, each temporary mutation restored immediately afterward; after
each scenario the worktree returned to the intended A5 working-tree diff, with no mutation
residue remaining: (1) the original `events`-widening mutation still fails NP57 (55 passed, 1
failed); (2) the old declaration left as a `//` comment directly above a widened real
declaration — the exact scenario Codex raised — now correctly fails NP57 (55 passed, 1 failed,
comparing the *real* widened line, not the comment); (3) the real declaration replaced entirely
by a string-embedded copy of the same text fails loudly with an explicit
"expected exactly one ... found 0" message (20 passed, 36 failed — the module fails to load the
expected export shape), not a silent pass.

## Codex review round 3

Second follow-up scoped Codex review (same base/target as round 2) found round 2's fix only
**partially** closed the gap: a `/* ... */` block comment containing the OLD unwidened
declaration at column 0, with the real widened declaration left indented on the next line, still
defeated `DECL_RE`/`DECL_RE_G` — the line-anchored regex has no concept of "inside a comment," so
it matched the commented column-0 text and never saw the indented real one. Codex independently
confirmed the full provider suite passed 56/56 against this construction despite the runtime
regex containing `events`.

Fixed: `NP57` now strips both block comments (`/\* ... \*/`) and line comments (`// ...`) from
both the current and baseline source **before** running the line-anchored match, via
`stripComments`, reusing this repo's own established pattern verbatim from
`qa/fund_facts_route_offline.js:124` (`src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')`
— the same shape also used in `qa/fund_facts_teardown_offline.js`,
`qa/evidence_freshness_offline.js`, `qa/batch_pull_wiring_offline.js`, and
`qa/batch_owner_script_offline.js`), rather than inventing a new comment-handling approach. The
`GENERIC_SOURCE_PATH_RE` regex source contains no literal `//` (every slash is escaped as `\/`),
so line-comment stripping cannot truncate it.

Verified against Codex's exact construction and a variant, both restored immediately after: (1)
old declaration in a block comment, real widened declaration indented on the next line — now
fails loudly with "found 0" (comment-stripping removes the decoy; the indented real line doesn't
match the column-0 anchor either, so the test correctly refuses to guess rather than silently
pass); (2) old declaration in a block comment, real widened declaration left unindented — now
fails with a precise diff comparing the real widened value against the baseline, not the
decoy. Re-ran all three round-2 mutation scenarios afterward to confirm no regression: all three
still produce the same pass/fail outcome as round 2 reported.

## Codex review round 4

Third follow-up scoped Codex review (same base/target as rounds 2–3), tasked with hunting for
any further bypass of NP57's comment-stripped, line-anchored declaration pin and judging its
overall adequacy. **BLOCKING: none.** Round 3's block-comment bypass is fully resolved — Codex
independently re-ran both constructions (indented and column-0 real declaration) and confirmed
each now fails loudly and correctly, with no regression on the ordinary unmutated case (56/56).

**NON-BLOCKING (1) — accepted residual limitation.** NP57's extraction is textual
(comment-stripped, line-anchored), not JS-lexer/scope-aware. Codex constructed two further decoys
that still make NP57 pass incorrectly despite a widened runtime regex: the old declaration text
hidden inside a template literal, and inside an unused function body, in each case with the real
widened declaration left indented. `stripComments` only removes `/* */` and `//` comments, so
neither construction is textually a comment and both survive stripping.

**Accepted rationale (Owner + Codex, round 4):** this is a regression pin against an *ordinary,
accidental* widening of `GENERIC_SOURCE_PATH_RE` by a future edit — not a defense against a
deliberately obfuscated, adversarial edit to this test file itself. Both remaining bypasses
require an editor to knowingly preserve byte-identical old declaration text inside dead code
while separately changing and repositioning the real declaration — a level of intent
indistinguishable from directly disabling the test outright, which is already possible with the
same repo access and is out of scope for any single regression assertion to prevent. Codex's own
recommendation: **NP57 is adequate to LAND** as implemented; fully closing this residual class
would require AST-level (not textual) identification of the top-level `GENERIC_SOURCE_PATH_RE`
binding, which is disproportionate to what this pin is for. No further change to
`qa/news_catalysts_provider_offline.js` was made in response to this finding — the reviewed
implementation is preserved byte-for-byte.

## Final-check line

`npm run qa:offline` PASS 44 · `node qa/news_catalysts_provider_offline.js` ALL PASS (56 passed,
NP50–NP57 named) · `node qa/news_catalysts_replay_offline.js` ALL PASS (25 passed, R-1…R-15) ·
`node qa/news_catalysts_core_offline.js` ALL PASS (30 passed, untouched). All four LAND-evidence
runs green. No STOP condition triggered (§6, checked against the actual diff). No Lane B file
touched. No push, no LAND, no commit performed.

## Lessons

- [local] At the time this worktree was created (base `52c322b`), the brief's own commit
  (`ccc5dba`) had not yet landed on `branch-dev`, so the brief file was briefly absent from this
  worktree's history. R-12 and R-14 read the pre-change baseline directly via
  `git show 52c322b:<path>` instead of hardcoding expected values, which worked regardless. The
  post-rebase history now includes `ccc5dba` (see header above).
- [rule] A QA test that compares on-disk file content against a git-recorded baseline (e.g. via
  `git show <ref>:<path>`) must normalize CRLF to LF on both sides before comparing, so a
  Windows checkout's line-ending representation is never reported as a content divergence. Compare
  full file content, not a parsed subset of it, when the claim is "this file is unchanged."
- [rule] A regression test must never assert an "unchanged" invariant on a value via a module
  property that is intentionally not exported (e.g. `provider.SOME_INTERNAL_RE`) — the property
  reads `undefined` on both sides of the comparison and the assertion is vacuously true. Pin such
  invariants via a source-text comparison instead: extract the declaration line (or other minimal
  anchor) from the current file and from the baseline file (e.g. via
  `git show <baseline-ref>:<path>`), then assert the extracted source strings are equal. Verify
  the pin actually fails against a deliberately mutated copy before trusting it.
