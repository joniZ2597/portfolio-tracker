# Review: evidence-memory-1 S1 — local research memory (snapshots, retention, export)

Result: implementation complete inside the approved brief (`work/evidence-memory-1-s1/brief.md`, committed blob sha256 `3ad830493f5633ce3f357dc2d2cccd463074d94a15729a720e85ceae88151d1f`, LF). Mode: Manual. Worker B, branch `task/evidence-memory-1-s1`, task base `c843333`.

## Files changed
- Implementation (2): services/evidence-memory.js, qa/evidence_memory_offline.js
- Evidence (tracked): work/evidence-memory-1-s1/brief.md, work/evidence-memory-1-s1/review.md

## What changed
- `services/evidence-memory.js` (new): the module of brief section A1, unchanged. Structured snapshot (`pulse.evidence-snapshot/v1`) built and validated by one rule set, four-method storage contract, `memoryBackend` and `indexedDbBackend`, 90-day retention with caps, export (`pulse.evidence-memory-export/v1`).
- `qa/evidence_memory_offline.js` (new): the suite of brief section A2, unchanged. EM-1..EM-27 and planted negatives EM-N1..EM-N26.
- Both files were produced by a script that extracts the two fenced blocks from the committed brief blob (`git show HEAD:work/evidence-memory-1-s1/brief.md`), not retyped. Byte audit: `cmp` against a fresh extraction is identical for both files; both are LF with zero CR bytes (38060 and 70247 bytes).
- Nothing else changed: `index.html` is only read by EM-24; `qa/run-offline.js`, fixtures, `package*.json` and governance files are untouched.

## QA
- Step 0 baseline: PASS 98 suites (`qa.log` line 1).
- RED before implementation: with the suite present and the module absent, `node qa/evidence_memory_offline.js` exits 1 (ENOENT on `services/evidence-memory.js`).
- Targeted: `node qa/evidence_memory_offline.js` PASS (27 rows, 26 negatives), about 33 s.
- Step 10, full run on the final tree: `npm run qa:offline` PASS, 99 suites (98 + 1), one advisory warning (the pre-existing one); the new suite ran in 30.5 s.
- Heavy-run check before step 10: one `wmic` listing, no other `qa/run-offline.js` / `qa:offline` / `qa/*_offline.js` process (11 node processes, all MCP servers); recorded in `qa.log`.

## Codex
- Round one (step 8, implementation diff): 1 finding, classified REJECT. Class I (appendix fidelity check did not pass): Codex's own extraction selected the wrong code fence and the reviewer itself called the result "inconclusive"; a fresh extraction from the committed blob is byte-identical to both files (`cmp`).
- Round one-b (step 8 re-run, same diff, verified extractor supplied): 1 finding, classified REJECT. Class I (`.claude/settings.local.json` is also untracked): the file is not in `git status` in this slot (ignored by the user-level global gitignore `**/.claude/settings.local.json`, dated 2026-10-12, not created by this task); the implementation diff is exactly the two files. Codex reported no implementation finding, and could not rerun the byte-fidelity check because its shell resolved `/tmp/...` to `C:\tmp\...`; the `cmp` evidence above covers it.
- Final check (step 12, complete task diff including this file): verdict HOLD on two Class II findings only, 0 Class I. Finding A (the "Evidence (tracked)" row lists `brief.md` although it is unchanged): REJECT, the two-row shape is fixed by AGENTS.md "Task folder convention" and is the same in prior reviews. Finding B (no step-12 summary recorded): fixed by this paragraph and the line below; the raw output is appended to `codex.md` under `## Final check`.
- Final check: 1 rounds, 1 class-II findings fixed, self-checked; no implementation change, no QA re-run.
- Raw responses are in `work/evidence-memory-1-s1/codex.md`.

## FIX / DEFER / REJECT ledger
| # | Finding | Class | Disposition | Reason |
|---|---|---|---|---|
| 1 | Appendix fidelity not shown | I | REJECT | Codex's parser used the wrong fence (self-declared inconclusive); fresh extraction `cmp` identical for both files |
| 2 | `.claude/settings.local.json` untracked, outside scope | I | REJECT | not present in this slot's `git status` (globally ignored, pre-existing 2026-10-12); diff is exactly the two section-1 files |
| 3 | Evidence row lists unchanged `brief.md` (final check) | II | REJECT | fixed two-row shape mandated by AGENTS.md |
| 4 | No step-12 summary recorded (final check) | II | FIX | summary line and `codex.md` `## Final check` added |

## Backlog reconciliation
- Brief Backlog row: none. Action taken: none. No `BACKLOG.md` entry is affected and `BACKLOG.md` is not in this task's scope.
- Confirmation: no BACKLOG text was edited, which matches the diff, the QA results and the work being landed.

## Notes and recorded deviations
- Form denial: the heavy-run process listing through the PowerShell tool was denied (`pretooluse-guard: BLOCKED - PowerShell tool - denied in Worker-slot sessions (R2)`). The Worker stopped and reported it; Bootstrap relayed a ruling that the same listing may run once through the Bash tool in the AGENTS.md `wmic` form. It was run exactly once in that form.
- The working-tree `brief.md` hashes differently from the committed blob only because `core.autocrlf=true` checks it out as CRLF (index LF); the committed blob equals the task record's sha256.
- Not claimed: real-browser IndexedDB behaviour (brief section 2.7 lists it as checked at the wiring slice on DEV); accepted residuals R-1, R-4, R-7 of the brief.

## Lessons
- [backlog] WF: when Codex is asked to verify byte fidelity of appendix code, hand it a ready extractor path it can reach (Codex's shell maps `/tmp` to `C:\tmp`) or the precomputed hash, instead of letting it write its own fence parser — pending routing

LAND-EVIDENCE: qa-offline=PASS 99; targeted=PASS; codex-classI-unresolved=0
