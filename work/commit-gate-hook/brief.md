# Task brief: Commit governance — slot-scoped commit gate (hook r9)

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

| | |
|---|---|
| Baseline | 575fca47e2ca4b33c0b4f7a8b15c0b39c157d8ec = branch-dev = origin/branch-dev |
| Branch / slot | task/commit-gate-hook in a Worker slot |
| Mode | **Manual** (protected workflow surface / gate change) |
| qa:offline | 50 → 50 (existing suite extended) |
| Status | CODE-READY on Owner approval, incl. RC1–RC5 |

Objective. Replace ASK-based commit governance with a deterministic hook gate: Workers may commit
only on their own task/* branch in their own slot, in plain form, with a clean staged set;
everything else is denied. Integration and push stay Owner-terminal-only.

Rulings (approved with this brief):
- RC1  Model D: slot-scoped commit gate (matrix above).
- RC2  Main-checkout / non-slot commits are DENIED; brief-only commits, LAND and push run in the
       Owner's normal terminal.
- RC3  --amend denied in slots (Workers add a new commit instead).
- RC4  Ref moves of branch-dev/main (update-ref non-delete, branch -f/-m/-M/-c/-C, symbolic-ref)
       denied in every session.
- RC5  settings.json (Owner-applied): remove the four commit ask entries; add Bash(git commit) and
       Bash(git commit *) to allow. The hook remains deny-only.

Scope — exactly:
1. Hook candidate r9 (Worker scratchpad, outside the repo): commit gate (fs HEAD read; staged
   set via git diff --cached --name-only -z with GIT_OPTIONAL_LOCKS=0 and a 5 s timeout; plain-form
   and flag allowlist; protected-path set; fail closed), canonical deny with R3c text, RC4 rows,
   injectable deps. No other hook change. The Owner copies it to .claude/hooks/pretooluse-guard.js
   after a hash check.
2. .claude/settings.json: RC5 only (Owner-applied).
3. qa/auto_mode_hardening_offline.js: AH-16 rows, real-fs + temp-repo checks, CLI, AH-8 literal
   update, mutants; flipped commit → ask rows listed in review.md.
4. work/commit-gate-hook/review.md.
Not in scope: AGENTS.md / CLAUDE.md (next task), push/merge/rebase/pull, Netlify/protected-write
asks, product code, deploy.

QA: AH-16 + differential r8↔r9 (only commit and RC4 rows change) + six mutants + full qa:offline
50 + G1–G3 on the copied r9. Live (Owner, post-LAND): L1–L7, all --dry-run probes.

STOP: file outside scope · settings beyond RC5 · non-commit/RC4 differential row · any push,
merge, rebase, pull, read-only, R2/R2b or r5–r8 change · a Worker hook write · non-deterministic
branch/staged reads or G/L gate failure (HOLD) · any branch-dev commit, push, LAND, deploy or main
change · any AGENTS.md/CLAUDE.md edit.

Order: candidate + suite → differential + mutants → Owner applies r9 (hash-checked) + RC5 →
full QA + G1–G3 → independent Codex read-only review (Worker-launched) → final check → STOP.
Until the AGENTS.md follow-up lands, Workers still STOP before commit under the current contract.
