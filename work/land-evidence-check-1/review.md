# Review: land-evidence-check-1 — read-only pre-LAND readiness check for the L9 evidence line

## Files changed
- Implementation (2): qa/land_evidence_check.js, qa/land_evidence_check_offline.js
- Evidence (tracked): work/land-evidence-check-1/brief.md, work/land-evidence-check-1/review.md

## What changed
- `qa/land_evidence_check.js` (new, read-only): reads `.claude/hooks/pt-land.js` as text, extracts the `LAND_EVIDENCE_RE` literal (never `require`s it), and classifies a `review.md` body: exact lines, near-misses, integrity-output leaks. CLI `--root <canonical> --task task/<id>` (via `git show`, `GIT_OPTIONAL_LOCKS=0`, `GIT_CONFIG_PARAMETERS` removed) or `--root <canonical> --file <path>`. Exit 0 READY, 1 NOT READY, 3 usage. Exports `extractContract(ptLandText)` and `checkReviewText(text, re)`.
- `qa/land_evidence_check_offline.js` (new): LE-1..LE-8 plus four planted negatives, 52 assertions, pure Node, fixtures in memory; the only files written are LE-7 temp fixtures under `os.tmpdir()`, deleted afterwards.
- No hook, settings, `AGENTS.md`, `CLAUDE.md`, `qa/run-offline.js` or command-card change; the tool is not integrated anywhere (L9-T2 stays a later governance step).

## LE table
| ID | Result | Evidence |
|---|---|---|
| LE-1 | PASS | `.source` equals the pt-land.js literal; a synthetic differing contract yields the differing regex; missing literal returns null |
| LE-2 | PASS | LF, CRLF, and a line under a `## LAND-EVIDENCE` heading are READY |
| LE-3 | PASS | bullet, backticks, bold, trailing space, `82/82`, `targeted=n/a`, extra text are each NOT READY with "exact = 0" and a near-miss report; an empty review is also NOT READY |
| LE-4 | PASS | duplicate line is NOT READY, "exact = 2" |
| LE-5 | PASS | four integrity-output leak kinds are NOT READY even beside a valid line |
| LE-6 | PASS | `landEvidenceCheck` and `LAND_EVIDENCE_RE` extracted from the pt-land.js text, run with a fake `G` over every LE-2..LE-5 fixture plus one stricter-than-L9 case: `ok === true` exactly where the tool's exact count is 1 |
| LE-7 | PASS | `--file` fixtures: exit 0 / 1 / 3 (also both-flags, bad task name, unreadable file) |
| LE-8 | PASS | tool source has no fs write, `fetch(`, `http`, `require` of pt-land.js, or Git write verb; Git child env hygiene asserted |

## Parity evidence
Parity (LE-6) holds on all 16 fixtures: L9's `ok` equals "tool exact count is 1". The tool is deliberately stricter than L9 only on near-miss and integrity-leak lines: valid line plus a bulleted copy is L9 `ok` but tool NOT READY (fixture LE-6x). That is the tool's purpose, not drift.

## Planted negatives (each mutates the tool source in memory, never the test)
- PN-1 hard-coded regex: caught by LE-1c (differing contract).
- PN-2 trimming lines: caught by LE-3 trailing space.
- PN-3 skipping the integrity scan: caught by LE-5.
- PN-4 `require`-ing pt-land.js: caught by LE-8.

## QA
- Step 0 baseline (before any edit): `npm run qa:offline` PASS 83 suites, wall 1m22.6s (22:04:13Z to 22:05:36Z), node v24.14.0, HEAD f1865d8. One advisory warning, present at baseline.
- Targeted: `node qa/land_evidence_check_offline.js` PASS (52 passed, 0 failed).
- Step 10 (final tree, after the Codex step-8 FIX): `npm run qa:offline` PASS 84 suites (83 + 1 new), wall about 1m14s (22:09:38Z to 22:10:52Z), same single advisory warning.
- Readiness of this file is checked with the task's own tool (`--file` before the commit) in the step-13 report.

## Incident: Bash hook denial during Codex review (STOP-6) and Owner recovery ruling
- The first Codex command was denied by the PreToolUse hook (R12, "not exactly one of the permitted forms"). Its prompt text named the protected hook script. The command did not execute (no Codex process, no `codex.md`), the staged set was empty and the two implementation files were unchanged.
- Owner ruling (2026-10-13): one-time, task-specific authorisation for exactly one compliant retry, with a prompt that does not name the hook script or its path; no R12 bypass, no hook or permission change, review not skipped; a second denial means STOP. The retry ran once and was not denied.

## Codex ledger
- Step 8 (implementation diff, raw output in `codex.md`): one Class I finding — LE-6 compares L9's `ok` only with the tool's exact count, so a future extra L9 refusal condition could go unnoticed; suggested comparing with `r.ready` and failing clearly when the L9 definition is missing.
  - FIX (part): extraction of `landEvidenceCheck` / `LAND_EVIDENCE_RE` now fails the suite with an explicit message if either is missing; targeted suite re-run PASS 52/0.
  - REJECT (part): comparing `ok` with `r.ready` contradicts brief LE-6 ("`ok === true` exactly where the tool's exact count = 1") and would fail by design on the stricter-than-L9 fixture. A new L9 refusal condition is out of this read-only check's contract (it would be a hook change, L9-T2).
- No other findings; no read-only violation; CRLF handling confirmed.

## Backlog reconciliation
- Brief Backlog row: none (`workflow/BACKLOG-CANDIDATES.md` L9-T1).
- Action taken: none. `BACKLOG.md` not touched.
- The `BACKLOG.md` state is unchanged and consistent with the diff, the QA results and the work being landed.

## Lessons
- [rule] A Bash command line that mentions the protected hook script anywhere, even inside a quoted Codex prompt, is denied by R12. Describe the target by function or constant name (for example `landEvidenceCheck`) and let the reviewer grep for it. — destination-ready text for AGENTS.md, owned by a governance task.
- [local] The suite's function extraction must tolerate CRLF line endings in the checked-out hook source (`\r?\n`).

## Final check
- Final check: 1 round, 0 class-I findings, 1 class-II finding (review.md "Evidence (tracked)" label while the file is still untracked) — REJECT: the two-row Files changed shape is mandated by AGENTS.md and the file is tracked by the step-13 commit; no claim about the implementation changes, no QA re-run. No class-I findings; step-8 disposition judged sound. Raw output in `codex.md` under "Final check".

## LAND evidence

LAND-EVIDENCE: qa-offline=PASS 84; targeted=PASS; codex-classI-unresolved=0
