# review.md — evidence-capture-1

Mode: Manual, attended. Brief rev 1.2 (`briefSha256` ab2e575d…13252, brief commit 446f4df). Base `eb4670f` (fresh task record 2026-10-19T18:36:20Z). Every finished scan stores one S1 snapshot per scanned ticker in browser IndexedDB (90 days) through an inlined, byte-identical S1 module, with a Research history settings box (status / Export / Clear). No scan or scoring change.

Recovery: fresh task-start on eb4670f after the rev 1.2 amendment; old record archived (the old record started at 14d26db and could not account for the amended-brief commit 446f4df).

## Files changed
- Implementation (6): index.html, qa/fixtures/index-pins.json, qa/ai_request_hygiene_offline.js, qa/market_daily_change_offline.js, qa/market_structure_offline.js, qa/evidence_capture_offline.js (new)
- Evidence (tracked): work/evidence-capture-1/brief.md, work/evidence-capture-1/review.md

Diff vs eb4670f: index.html +937 / −0 (E-1 inlined S1 wrapper + capture section, E-2 one call in `runAnalysis`, E-3 `#ehBox`); qa/fixtures/index-pins.json +49 / −4 (`index-pins --update`: 426 functions, 25 regions; `--diff` vs base 2 changed — `runAnalysis`, remainder — 45 added, 0 removed, regions unchanged); qa/ai_request_hygiene_offline.js +1 / −1 and qa/market_daily_change_offline.js +1 / −1 (the pinned `runAnalysis` digest → `7d5c029b…aa7`); qa/market_structure_offline.js +42 / −2 (§AM); qa/evidence_capture_offline.js new, 492 lines.

## What changed
1. `index.html`: the S1 module inlined byte-identically in `var PulseEvidenceMemory = (function (module) {…return module.exports;})({ exports: {} });`; the capture section (`PT_EVIDENCE_CAPTURE` strict `!== true` gate, `_ehQueue`, `_ehMemory`, `_ehCaptureInput`, `_ehCaptureScan`, `_ehStatusText`, `_ehRender`, `_ehExport`, `_ehClear`); one fire-and-forget `_ehCaptureScan(dedupedNew, window._pplxDebug, runTimestamp);` after the final render in `runAnalysis`; a collapsed `#ehBox` after `#labsBox`.
2. `qa/evidence_capture_offline.js` (§A2 + the amendments below): 13 rows CP-1…CP-13, 17 planted negatives CP-N1…CP-N17.
3. `qa/market_structure_offline.js`: MS-T16 / PN MS-T16 exclude exactly the verified S1 block (§AM).
4. Pin digest lines and pin fixture refreshed by the pin tool.

## QA results (raw in work/evidence-capture-1/qa.log, untracked)
- Step 0 (HEAD 14d26db, before the rev 1.2 amendment): `npm run qa:offline` FAIL, 102 suites, only `evidence_changes_offline` (CRLF working tree; pre-existing, fixed by qa-evidence-changes-eol-1).
- S1 RED: the new suite fails on the base (all rows "marker not found exactly once", all negatives "mutation did not apply"). S2 GREEN: E-1…E-3, §A3, pins refreshed. W1–W4 RED then GREEN (see Appendix deltas).
- Step 10 at the first base: FAIL, 103 suites — `evidence_changes_offline` (pre-existing) and NEW `market_structure_offline` MS-T16 (the inlined S1 comment `// (matching services/market-structure.js).` at index.html:5159). Reported as STOP; resolved by the rev 1.2 amendment (§AM) and qa-evidence-changes-eol-1 (landed, `612f385`).
- §AM RED: unchanged MS-T16 on the task tree → 37 passed / 2 failed (MS-T16, PN MS-T16). §AM GREEN: `node qa/market_structure_offline.js` → ALL PASS (40 passed, 0 failed).
- R1.2 land-tests (2026-10-20): evidence_capture 13 rows / 17 negatives; ai_request_hygiene 11 / 15; market_daily_change 17 / 16; labs_panel 32; ui_hygiene PASS; evidence_memory 27 / 26; no_synthetic_score 160; high1y_label 103; pulse_analyst_view 108; index_pins 13; market_structure 40 / 0 — all PASS; `index-pins --check` OK (426 functions, 25 regions).
- Step 10 (2026-10-20, HEAD eb4670f + working tree): `npm run qa:offline` → OFFLINE VALIDATION: PASS, 103 spawned suites (Worker B's 102 at eb4670f + 1), 1 advisory warning (pre-existing smart quote, index.html line 12191), 129812 ms. No FAIL line.

## Appendix deltas
Made under the appendix-amendment clause (§C+) inside §1 files only; none changes a §2 rule or weakens a test (ruling S-6).
1. **MODULE_FILE normalised.** `qa/evidence_capture_offline.js` reads `services/evidence-memory.js` through `core.normalizeText` (CRLF → LF) so CP-1's byte-identity check holds on a CRLF working tree.
2. **W1 — Clear runs on the capture queue.** `_ehClear` chains on `_ehQueue` (`var cleared = _ehQueue.then(function () { return _ehMemory().clear(); }); _ehQueue = cleared.then(function () {}, function () {});`), and a rejected clear shows "Research history could not be cleared". Row CP-12 (Clear versus a queued capture, both orders); planted negative CP-N12 (Clear bypasses the queue) fails CP-12; CP-12 failed on the appendix as given ("a queued capture re-created cleared history: 2").
3. **W2 — Export containment and status announcement.** `_ehExport` wraps `_ptDownload(new Blob(...))` in try / catch → toast "Research history export failed", returns false; `#ehStatus` carries `role="status" aria-live="polite"`. Row CP-13; negatives CP-N13 (download failure uncontained) and CP-N14 (status not announced).
4. **W3 — CP-3 field-by-field mapping.** Live-field and "rich" fixture mapping of the parser output to the snapshot; negative CP-N10 (one parser field, `peerMove`, dropped) fails CP-3.
5. **W4 — CP-1 / CP-11.** CP-1 asserts the wrapper is strict at run time (negative CP-N15, `'use strict'` removed); row CP-11 covers cancellation after one ticker, a second scan while a capture is pending, and only this run's tickers (negatives CP-N11 merged results, CP-N16 capture ignores cancellation, CP-N17 no queue for back-to-back scans).
6. **Rev 1.2 (§AM).** `qa/market_structure_offline.js` +42 / −2: `EM_OPEN` / `EM_CLOSE` markers, `indexScanText(rawHtml)` (CRLF → LF; each marker exactly once else the suite fails with a message naming the marker; open before close; exactly that region removed; everything else, comments included, still scanned); MS-T16 scans `index.html` through it and `market-data.js` / `run-offline.js` whole; PN MS-T16 uses it for the positive control and keeps the appended-`require` negative; new row `PN MS-T16 AM-N1..N11` (N1 require before the open marker, N2 call after the close marker, N3 open duplicated, N4 open removed, N5 close removed, N6 open after close, N7 close duplicated, N8 text on the open marker's line, N9 text right after the close marker, N10 a bare `return module.exports;` plus comment outside, N11 comment outside), each mutation in memory on the `index.html` text with the live text as positive control. Titles, `GIT` part, `ISOLATED` and the regex unchanged. EOL byte audit of the edited file: `git ls-files --eol` `i/lf w/crlf`; 831 of 831 lines CRLF (the file was uniformly CRLF before and after; the Edit tool kept CRLF); the replaced region (lines 746–800) with CR stripped has sha256 `63b8c491fb7a6517e663d6aaad4b40811d31cfc4ed369cc1efcac1ab9b0486d2` = the reviewed replacement text; outside the region the file is identical to its base ignoring CR; file sha256 `46a8c635ca32b524692febe18e997948cbf6951449958e965a24379c5bd12f39`, 47943 bytes.

## Codex
- Round one (step 8, base 14d26db), raw in codex.md: "No findings … PASS".
- Round two (R1.2, whole task diff vs eb4670f, the §AM hunks verified independently), raw in codex.md: "No findings. PASS".
- Final check (step 12, whole task diff plus this review.md): 1 round, no findings, PASS; no implementation change, no QA re-run.
- Class I unresolved: 0.

## Form denials
Form denial: PowerShell Get-CimInstance Win32_Process -> reissued as Bash wmic listing (Owner-ruled; the retry passed).

Other stops (not form denials; each reported to MAIN and ruled by the Owner): the step-10 STOP (market_structure MS-T16 and the pre-existing evidence_changes failure); an auto-mode classifier "no verdict" on the first §AM edit call (STOP-6 → Manual mode ruling); a scratch-script edit of `qa/market_structure_offline.js` that failed to load (escaping defect), restored to its committed content, not used; an auto-mode classifier denial of a scratch-script write → the Owner ruled one direct Edit of §AM, applied once.

## Backlog reconciliation
- Brief's Backlog row: none.
- Action taken: none. Effect none; `BACKLOG.md` not edited.

## Lessons
- [rule] When a task copies a service file into `index.html` byte-for-byte, sweep every suite that scans `index.html` for the service's own name or path (comments included) before approving the brief; pin such scans to an exact, marker-verified region (each marker exactly once, in order, never a silent fallback) instead of loosening the regex.
- [rule] A scripted edit of a repo file must not carry escape sequences through a shell heredoc into a template literal; write the replacement text with the Write tool and read it from a file.
- [local] `qa/market_structure_offline.js` was uniformly CRLF in this slot and the Edit tool kept CRLF for the replaced region; the EOL was audited per line by byte count, not by `grep -c`.
- [local] The first step-10 STOP came from a comment line inside the S1 module that mentions another module; the S1 text stays byte-identical (C-1), so the fix belonged to the scanning suite.

LAND-EVIDENCE: qa-offline=PASS 103; targeted=PASS; codex-classI-unresolved=0
