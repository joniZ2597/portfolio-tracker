# Review — R12 follow-up: fix stale mutant anchors in qa/pt_land_offline.js

## Summary

Fixed three stale mutant anchors in `qa/pt_land_offline.js` discovered while validating DH-M4b's
Second LAND (`task/dh-fx-aged-current` rebased onto `branch-dev` `193c7df`, which had just landed
R12's land tool and its offline suite). Full `qa:offline` failed with 3 hard failures, all reading
`mutant must actually change the source`.

**Note on process:** this task did not go through the standard `work/<id>/brief.md`
Owner-approval-then-commit ceremony. It was authorized directly by the Owner in chat with an
explicit scoped instruction set ("R12 FOLLOW-UP — FIX STALE MUTANT ANCHORS ONLY", Mode: Manual,
hard boundaries listed, ending with an explicit "STOP before commit" instruction, followed by a
separate explicit commit approval). There is accordingly no tracked `brief.md` for this task; this
`review.md` is the sole tracked evidence file.

## Root cause

`.claude/hooks/pt-land.js` (the R12 land tool, DENY-tier, not touched by this task) is CRLF
end-to-end — confirmed via `Grep -c '\r'` returning 668, matching the file's 668 total lines. Three
of the five `withMutantSource` mutants in `qa/pt_land_offline.js` used a plain multi-line string
literal as the `.replace()` search argument, written with bare `\n` line breaks:

- `MUT: L12 record check skipped -> land proceeds without any approval record`
- `MUT: L3 ancestor check skipped -> Second LAND is not caught`
- `MUT: scope check dropped (diff allowed unconditionally) -> outside-scope diff is not caught`

Because the real file joins lines with `\r\n`, not `\n`, `String.prototype.replace` with an
`\n`-joined search string never matched — `.replace()` returned the string unchanged, and
`withMutantSource`'s own self-check (`assert.notStrictEqual(mutated, src, 'mutant must actually
change the source')`, line 875) correctly failed. This is staleness in the harness's own anchors,
**not a runtime defect in the land tool** — confirmed by directly comparing each anchor's text
content against the real source (`.claude/hooks/pt-land.js` lines 288-289, 225-226, 396-400): the
content matched byte-for-byte, only the embedded line-break character was wrong.

Two other mutants in the same file already avoid this: one uses a regex with `[\s\S]*?...\n\];`
(immune, since the literal `\n` there sits directly before `]`, which still matches in CRLF text),
the other is a single-line string with no embedded line break. Lines 483 and 845 in the same file
already use literal `\r\n` for other CRLF-aware fixtures, establishing the fix convention applied
here.

## Files changed

- Implementation (1): qa/pt_land_offline.js
- Evidence (tracked): work/mutant-anchor-fix/review.md (no brief.md — see process note above)

## Exact fixes

All three fixes change only the search-string line-break character from `\n` to `\r\n`; the third
mutant's replacement string is also changed from `\n` to `\r\n` for line-ending consistency within
the mutated temp file (cosmetic only — does not affect the mutant's tested behavior).

| Mutant | Location |
|---|---|
| `MUT: L12 record check skipped` | `qa/pt_land_offline.js` ~line 883 |
| `MUT: L3 ancestor check skipped` | `qa/pt_land_offline.js` ~line 895 |
| `MUT: scope check dropped` | `qa/pt_land_offline.js` ~lines 914-915 |

## QA

- `node qa/pt_land_offline.js` — PASS, 74/74 assertions.
- Full `npm run qa:offline` — **PASS, 52 suites**, 1 pre-existing advisory warning unrelated to
  this task.
  - An intermediate run showed a spurious FAIL (7 hard failures, all Windows access-violation
    exit codes `3221225794` on unrelated CLI subprocess tests) caused by two overlapping
    `qa:offline` invocations colliding over shared subprocess/lock resources — not a real defect.
    A clean single re-run (`work/mutant-anchor-fix/qa-clean.log`, untracked evidence) confirmed
    PASS with no such collision.

## Codex review (diff, base `branch-dev` `193c7df`)

Launched via `codex exec --sandbox read-only`. **No Class I findings.**

Codex's finding, verbatim:
> Class I findings: none. The diff changes only the three specified search anchors in
> `qa/pt_land_offline.js`; the scope-check mutant's replacement string also uses CRLF. No other
> mutant or land-tool source file appears in the diff.

## FIX / DEFER / REJECT ledger

None — no findings raised.

## Lessons

- [local] A CRLF-vs-LF mismatch between a fixture's literal search string and the real source it
  targets fails silently (`.replace()` returns the input unchanged) unless the harness has its own
  "mutant must actually change the source" self-check — true only of this suite's harness design,
  no destination.

## LAND-EVIDENCE

LAND-EVIDENCE: qa-offline=PASS 52; targeted=PASS; codex-classI-unresolved=0
