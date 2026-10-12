# Review: land-evidence-check-2 — CRLF-safe shebang strip in the land-evidence offline suite

Base: brief commit `affef25` (code baseline `de5b136`). Mode: Manual. Test-only change.

## Defect
`qa/land_evidence_check_offline.js` stripped the tool's shebang with `/^#!.*\n/`. When `qa/land_evidence_check.js` has CRLF line endings, `.` stops at `\r`, `\n` never matches, the shebang stays in the body, and `new Function(...)` throws `SyntaxError: Invalid or unexpected token` at load. The suite then exits 1, and so does `npm run qa:offline` on a CRLF checkout.

## Change
- `SHEBANG_RE` constant above `loadFromSource`, now `/^#!.*\r?\n/` with a one-line comment; `loadFromSource(src, stripRe)` uses `stripRe || SHEBANG_RE`.
- LE-9 (after LE-8): `crlfSrc` is the tool source converted to CRLF. LE-9a asserts it starts with a CRLF shebang line. LE-9b asserts `loadsAndWorks(SHEBANG_RE) === true` (loads, `extractContract(ptLandText)` returns a RegExp with `.source === RE.source`, `checkReviewText` is a function).
- PN-5: `loadsAndWorks(/^#!.*\n/) === false` (reverting the strip is caught by LE-9b).
- LE-1..LE-8 and PN-1..PN-4 are unchanged. The production tool was not touched.

## RED -> GREEN
- RED (S1, LF checkout, old expression kept in `SHEBANG_RE`): `node qa/land_evidence_check_offline.js` exit 1, `FAIL (54 passed, 1 failed)`; only LE-9b FAIL, LE-9a and PN-5 PASS. The CRLF-checkout form (SyntaxError at load) was not run in this LF slot.
- GREEN (S2): `PASS (55 passed, 0 failed)`, 52 -> 55.
- Step 0 baseline `npm run qa:offline`: PASS 84 suites. Step 10 on the final tree: PASS 84 suites (count unchanged).

## Codex ledger
- Step 8 (S1 diff, read-only, independent): PASS, no findings. Confirmed only the allowed file changed, loader signature, LE-9 CRLF conversion and loader/contract exercise, PN-5 bites, no existing assertion edited.
- Final check (step 12, complete task diff incl. this file): 1 round, PASS, no findings.
- No FIX, DEFER or REJECT entries.

## Files changed
- Implementation (1): qa/land_evidence_check_offline.js
- Evidence (tracked): work/land-evidence-check-2/brief.md, work/land-evidence-check-2/review.md

## Backlog reconciliation
- Brief's Backlog row: none (repair of `land-evidence-check-1`).
- Action taken: none. No `BACKLOG.md` edit.
- Confirmation: no BACKLOG text changed; the diff, QA results and landed work are unaffected.

## Lessons
- [covered] A shebang-strip regex on source read from disk must tolerate CRLF — covered by LE-9 / PN-5 in this suite.
- [backlog] Loader-style test harnesses that strip a shebang should be checked for CRLF safety when a slot's EOL differs from the author's — pending routing
- [local] The slot used here is LF, so RED was shown in its LF form only.

LAND-EVIDENCE: qa-offline=PASS 84; targeted=PASS; codex-classI-unresolved=0
