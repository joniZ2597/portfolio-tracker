# review.md - approval-envelope-1 (Worker A, Manual)

Task: add the execution envelope and the paired LAND/PUSH decision to AGENTS.md (E1-E7). Files: `AGENTS.md`, `work/approval-envelope-1/review.md`.

## Incidents
- **V1 brief-hash check (EOL only).** The assignment's first check hashed the CRLF working file: `cb3436150d6b74d66e6c71297b61aedc4aa5f490d5abcbe500dd75b376f95f01`, not `0c57e4f7...33fd`. I STOPPED and reported to MAIN before step 0. Cause: `core.autocrlf` (`git ls-files --eol`: i/lf w/crlf). `git show HEAD:work/approval-envelope-1/brief.md | sha256sum` = `0c57e4f73cf8a5b5e3c97d5f6a4e0e2d554c5a859e607f366f4ea4fb8daa33fd` = the record's `briefSha256` (`--print-record`). Owner ruling relayed by MAIN: the committed blob sha is binding; STOP cleared; the brief was not modified.
- No hook denial, form denial or Auto-mode block occurred. Session stayed Manual.

## Candidate and commit
- Step 1: candidate copied from the D-6 location to the step-13a temp directory; sha256 `9147d55a9f0628c165689e914ede2c022f306bfe89edbe1f9bb09570a912407a` = brief section 1; 0 CR bytes.
- Step 3 (13a): `protected-request` tree `b901549c9790a33849556b6cc69e6284dd5813ce`; `protected-commit` result `PROTECTED-COMMITTED task/approval-envelope-1 38f0b3e076cb67e96c1e0c549d848de663c6e759..97e0499b6bca6f7b1ceb7c6db5f9fe32cfa89ed6`. Committed `git show HEAD:AGENTS.md | sha256sum` = `9147d55a...407a`.

## Conformance checklist (section 2a)
1. Base counts (TS-2) = 1 each for the six anchors; TS-1 blob `17c14f5b5f46fa350970bbed67e5c7b49f4dbeb5`; TS-3 envelope/LAND-and-PUSH strings = 0. PASS.
2. Candidate and committed AGENTS.md (Grep tool): `### Execution envelope (one Owner act per task)` 1; `**LAND and PUSH - one Owner decision, two records.**` 1; `The R11 line also opens the task's execution envelope` 1; `One consolidated push after a batch is preferred` / `Task-start sequencing by the Owner is` / `performs approved, deterministic` 0 combined; rows `| V1 |`..`| V8 |` 8 (1 each); `Claude never writes an approval record` 2. PASS.
3. Candidate LF sha256 = section 1; 0 CR bytes (candidate); committed blob sha equals it. PASS.
4. Codex confirmation: see ledger.

## Codex ledger
- Round one (step 2, read-only, candidate vs `HEAD:AGENTS.md`): "No findings" - diff is E1-E7 only, section 3 intact, LF-only. Class I = 0, Class II = 0.
- Final check (step 5, read-only, task diff `38f0b3e..HEAD` plus review.md): the AGENTS.md diff equals E1-E7 with no additional edits; review.md has exactly one column-1 LAND-EVIDENCE line in the required form, Backlog reconciliation (none) and Lessons. One Class I finding: this ledger bullet was an unfilled placeholder ("recorded below after it ran") and did not state the check's verdict. Disposition: FIX - this bullet now records the verdict; documentation-only, no implementation change. Class I unresolved after the fix = 0 (Class II = 0).

## QA
- Step 0: `qa:offline` PASS, 104 suites, 1 existing advisory WARN (index.html:12214 smart quote).
- Step 4 (tested commit `97e0499`): `qa:offline` PASS, 104 suites (= step 0), same single WARN. `node qa/instruction_layer_offline.js` PASS (58 checks). `CLAUDE.md` unchanged.

## Backlog reconciliation
none

## Lessons
- A CRLF working copy of an LF-committed brief makes a plain `sha256sum` of the working file disagree with the pinned hash; V1-style checks should hash `git show HEAD:<path>`.
- Codex output for a whole-file comparison is huge (it echoes both files); read only its tail for the verdict.

LAND-EVIDENCE: qa-offline=PASS 104; targeted=PASS; codex-classI-unresolved=0
