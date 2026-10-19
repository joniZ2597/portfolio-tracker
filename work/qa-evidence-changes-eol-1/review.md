# review.md — qa-evidence-changes-eol-1

Mode: Manual, attended. Base `875e121`. QA-only task: `qa/evidence_changes_offline.js` made independent of working-tree line endings.

## Files changed
- Implementation (1): qa/evidence_changes_offline.js
- Evidence (tracked): work/qa-evidence-changes-eol-1/brief.md, work/qa-evidence-changes-eol-1/review.md

Diff of the suite: 35 insertions, 3 deletions. The 3 deleted lines are the header line `EC-N1..N22 planted negatives ...` (replaced by the EC-20 / EC-N1..N23 header text) and the two raw `fs.readFileSync` reads. Every existing row, negative N1..N22, anchor and expected value is byte-identical.

## What changed
1. `toLF` (`text.replace(/\r\n/g, '\n')`, the rule of `qa/lib/index-pins-core.js` `normalizeText`) and `readLF`; the two module reads go through it.
2. Row `EC-20` (one row key; sub-assertions a/b/c collected into one detail): (a) `S1_SRC` and the text under test contain no CR; (b) the CRLF rendering of the LF text through `toLF` equals the LF text byte-for-byte and every EC-N1..N22 `mutate` applies without an anchor throw, on both the text under test and the helper output; (c) `rows()` for EC-1..EC-19 is identical on the LF text and on the CRLF rendering through the helper (nested calls pass `only`, so no recursion).
3. Planted negative `EC-N23`: tuple `[name, s => s.replace(/\n/g, '\r\n'), ['EC-20']]` in the unchanged runner loop. It feeds the CRLF rendering without the helper; EC-20 must fail.
4. Header comment lists EC-20 / EC-N23.

## QA results (raw in work/qa-evidence-changes-eol-1/qa.log, untracked)
- Step 0: `npm run qa:offline` PASS, 102 suites (the brief expected FAIL; see "Reading used").
- RED 1: unchanged suite on scratch CRLF copies -> FAIL with exactly EC-N7, N8, N9, N12, N15, N16, N18, N21.
- RED 2: EC-20 added, reads still raw, scratch CRLF -> EC-20 FAIL (`S1_SRC has CR`, `SRC has CR`, anchors N7, N8, N9, N12, N15, N16, N18, N21).
- GREEN: helper added -> `EVIDENCE CHANGES OFFLINE: PASS (20 rows, 23 negatives)` on scratch CRLF copies and in the slot.
- EC-N23 probe (scratch): it fails EC-20 with detail `["SRC has CR","anchors not found exactly once in the text under test: EC-N7,EC-N8,EC-N9,EC-N12,EC-N15,EC-N16,EC-N18,EC-N21"]`, the intended reason.
- Step 10: `npm run qa:offline` PASS, 102 suites (count unchanged). Land-tests: `node qa/evidence_changes_offline.js` PASS (20 rows, 23 negatives); `node qa/evidence_memory_offline.js` PASS (27 rows, 26 negatives).
- Byte audit of the edited file: `git ls-files --eol` = `i/lf w/lf`; 0 CR bytes (`tr -cd '\r' | wc -c`).

## Reading used (STOP-2 wording carve-out; AGENTS.md "A method is not a requirement")
The brief expects a CRLF slot. In the Worker B slot `git ls-files --eol` showed `w/lf` for the suite, `services/evidence-changes.js` and `services/evidence-memory.js` (never re-checked-out here; `index.html` is `w/crlf`), so the unchanged suite passed in place. The same RED/GREEN was proved on CRLF copies of the suite and both modules (plus `index.html` and the live-capture fixture for EC-1) under `/tmp/pt-qa-evidence-changes-eol-1/crlf`. What is proved is unchanged; only the method of making the working copy CRLF differs. MAIN confirmed the reading independently and had no objection. No service file, Git configuration or renormalisation was touched.

## Codex
Round one (step 8), raw in codex.md: 2 Class I findings.
- EC-20b reports a duplicate anchor as "not found exactly once" — REJECT: the wording is the existing `rep()` message, and both zero and more-than-one occurrences are correctly rejected.
- EC-20c compares result objects that could include EC-20 — REJECT: the nested `rows()` calls pass `only` = EC-1..EC-19, and `rows()` returns only the requested ids, so EC-20 is not in the compared objects and cannot recurse.
Codex confirmed EC-N23 fails for the intended reason and that no existing row, negative, anchor or expected value changed.

## Form denials
none.

## Backlog reconciliation
- Brief's Backlog row: none (no matching entry).
- Action taken: none. `BACKLOG.md` not edited.

## Lessons
- [rule] A QA suite that reads source files as text and anchors on text spanning a newline must normalise CRLF to LF on read (`/\r\n/g`), because working copies are CRLF under `core.autocrlf=true`; planted negatives need a CRLF-fed negative proving the normalisation is load-bearing.
- [local] The slot's three in-scope files were LF while the rest of the checkout was CRLF, so the defect only reproduces on files Git re-checks-out; CRLF copies under `/tmp/pt-<id>/` reproduce it deterministically.

LAND-EVIDENCE: qa-offline=PASS 102; targeted=PASS; codex-classI-unresolved=0
