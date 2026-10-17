# review.md — evidence-memory-1-s2-r2

Brief: `work/evidence-memory-1-s2-r2/brief.md` (committed blob sha256 `d1af4a8b9efc350cfa221a783228ba15167ad5dac9e48a5fece1af2adf3edf95`). Branch `task/evidence-memory-1-s2-r2`, base `792da92`, Worker B, Manual mode, C+ workflow. Replaces the aborted `evidence-memory-1-s2` (retired id).

## Result

`services/evidence-changes.js` adds the pure change engine: `createChangeEngine(memoryModule).diffSnapshots(prev, next)` returns the ordered material changes between two S1 snapshots of one ticker, one `shown` entry per real-world event (at most 7), and counts what it suppressed. Analyst event identity and evidence keys are JSON-encoded field lists (rev 3, EC-19, EC-N21, EC-N22). `qa/evidence_changes_offline.js` is the suite: 19 rows (EC-1…EC-19) and 22 planted negatives (EC-N1…EC-N22). Nothing calls the module; no storage, network, `index.html` or S1 change.

## Files changed
- Implementation (2): services/evidence-changes.js, qa/evidence_changes_offline.js
- Evidence (tracked): work/evidence-memory-1-s2-r2/brief.md, work/evidence-memory-1-s2-r2/review.md

## Appendix deltas

None. Both implementation files are the brief appendices extracted by a script outside the repo (brief text normalised to LF, fenced block between the `js` fence markers, one trailing newline). The files are therefore identical to §A1 and §A2, not re-typed. A1 sha256 `e8ef455c7a6ff026c7a69fc6097f359b5306a7e916a67edf07a39bfcd9538a48` (264 lines), A2 sha256 `25f59ee94f3f5d898eaaf0998f104ee284e56fcff629b0ec4f9f1aed2af77033` (516 lines). No §2 rule, test, land-scope, land-tests or acceptance criterion was touched, so the amendment clause was not used and no S change arose.

## QA
- Step 0 baseline (before any edit): `npm run qa:offline` PASS, 101 suites (as the GO message expected). §TS held: the two new files absent; `services/evidence-memory.js` blob `c74d6404…`, the live-capture fixture blob `54526e2c…`, `qa/run-offline.js` blob `0f57950f…`; `parsePerplexityContext(` occurs once in `index.html`.
- RED: the suite with only A2 present stops with ENOENT on `services/evidence-changes.js` (exit 1).
- GREEN: `node qa/evidence_changes_offline.js` PASS (19 rows, 22 negatives). EC-1 ran the real parser over the live-capture fixture (8 captures, each shown empty against itself a day later).
- EOL: both files LF, 0 CR bytes.
- Step 10: `npm run qa:offline` PASS, 102 suites (step 0 + 1). Heavy-run checks before both full runs found no other QA process (lines in `qa.log`).

LAND-EVIDENCE: qa-offline=PASS 102; targeted=PASS; codex-classI-unresolved=0

## Fresh-context self-review
Re-read the brief (§2 contract, §3 rows, §C+) and both files as if new. The files equal the appendices byte for byte (hashes above); the requirement→test map in `plan.md` maps every §2 rule to a named row and every row to a rule; no orphan test. No defect found, so nothing changed after the review. Scope: only the §1 files plus this review.

## Codex
- Step 8 (independent read-only review of both new files against the brief; raw in `codex.md`): PASS, no findings.
- Final check (step 12, whole task diff incl. this file; raw in `codex.md` under `## Final check`): PASS, no Class I or Class II findings. Codex's own appendix-comparison snippet failed to run (a PowerShell index error in its scratch command); its PASS rests on the hash match against `qa.log` / this file, and the byte equality with the appendices was established by the extraction step above.

## FIX / DEFER / REJECT ledger
No findings. Nothing to classify.

## Backlog reconciliation
Brief Backlog row: none. Action taken: none. No `BACKLOG.md` edit; no entry affected. The diff, QA results and the work being landed carry no backlog effect (the D-16 refresh the brief names is a separate deferred task).

## Risks / not tested
As in the brief §6 (R-1…R-4) and its accepted limits: numeric dates (`10/14`) are not masked; paraphrased descriptions of one event by different sources stay two entries until S3; a stock split shows as a large price move. The module is unwired, so no UI or runtime behaviour was exercised. No live call was made.

## Lessons
- [local] The extract-by-script method (appendix block to file, then hash compare) avoided hand-paste corruption for two large files; it is a substitute method for the brief's "Write tool" note and proves the same thing (file equals appendix).
