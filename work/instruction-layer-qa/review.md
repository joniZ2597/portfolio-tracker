# Task review: instruction-layer QA re-baseline

## Task

Restore `qa/instruction_layer_offline.js` to green on the simplified workflow, per the approved
brief at `work/instruction-layer-qa/brief.md` (committed `26168e0`).

## Branch

`task/instruction-layer-qa` (worktree `C:/Users/Owner/Documents/Project/pt-wt-instruction-layer-qa`),
based on `branch-dev` at `26168e0`.

## Implementation file

- `qa/instruction_layer_offline.js` only.

## Implementation matches the approved brief exactly

- Change 1: obsolete `W4 CLAUDE.md: execution-routing checkpoint present` check replaced with
  `W4 CLAUDE.md: active simplified-workflow anchor present (effective 2026-09-18)`, matching the
  `### Active workflow model (simplified, effective 2026-09-18)` heading plus `AGENTS.md` and
  `portfolio-skill-router` presence — exact text as locked.
- Change 2: `CLAUDE.md` fingerprint re-baselined to `a1249aac3fde474c365646fc34ad1ec193d5ca0a0e39f89b24244031325db5e2`.
- Change 3: `portfolio-skill-router/SKILL.md` fingerprint re-baselined to `7702d67d91a7e8706a4ae2528dee0f11683d0be1427063039281650d90339056`.
- `optimization-rules.md` entry untouched. No other line of the file changed; header comment
  unedited.

## QA / verification evidence

- Targeted QA: `node qa/instruction_layer_offline.js` → `instruction_layer_offline: PASS (58 checks)`,
  exit 0. Check count unchanged (58 before and after).
- Independent fingerprint verification: recomputed sha256 (CR-stripped) for all three subject
  files — `CLAUDE.md`, `portfolio-skill-router/SKILL.md`, `optimization-rules.md` — all three
  match the brief's locked baseline strings exactly.
- Full `npm run qa:offline`: **PASS**, exit 0 — fully green, no failures anywhere in the suite.
- EOL hygiene: HEAD blob LF, working tree CRLF under `core.autocrlf=true` (expected checkout
  normalization); `git diff` showed only the three intended content hunks, no EOL-only churn.

## Codex review

- BLOCKING: NONE
- NON-BLOCKING: NONE
- VERDICT: READY FOR FINALIZATION

## Deviations

None.

## Unrelated files changed

None — only `qa/instruction_layer_offline.js` (implementation) and this `review.md` are part of
the task diff.

## Final task status

Ready for final commit / LAND preparation.
