# Task brief: Merge/rebase hook enforcement (hook r8)

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

| | |
|---|---|
| Baseline | 459f4d73046a7ccbb777841609df7b2c65554f99 = branch-dev = origin/branch-dev |
| Branch / slot | task/merge-rebase-hook in a Worker slot |
| Mode | **Manual** (protected workflow surface / gate change) |
| qa:offline | 50 → 50 (existing suite extended) |
| Status | CODE-READY on Owner approval, incl. RM1–RM3 |

Objective. Make merge/rebase/pull governance deterministic through the PreToolUse hook (exit 2),
because permissions.ask and hook "ask" were observed not to prompt (git merge --ff-only ran
un-asked in a main-checkout session).

Rulings (approved with this brief):
- RM1  git merge / git rebase are DENIED in every Claude Code session (slot and main); the Owner
       runs LAND merges/rebases from a normal terminal (same path as push, R3g).
- RM2  git pull (all forms) joins the integration class — deny everywhere.
- RM3  Ref-moving equivalents stay out of scope and documented (update-ref non-delete,
       branch -f, reset --soft/--mixed, cherry-pick, am, revert).

Scope — exactly:
1. Hook candidate r8 (Worker scratchpad, outside the repo): INTEGRATION_SUBCOMMANDS += 'pull';
   decisionFor('integration') → 'deny' unconditionally; R3m reason text. No other hook change.
   The Owner copies it to .claude/hooks/pretooluse-guard.js after a hash check (R3: Workers never
   write .claude/hooks/**).
2. qa/auto_mode_hardening_offline.js: AH-15 (r8) rows, CLI checks and mutants per the plan;
   AH-11/AH-7 rows that asserted main → ask for merge/rebase flipped to deny and listed in review.md.
3. work/merge-rebase-hook/review.md.
Not in scope: settings.json, AGENTS.md, CLAUDE.md, push/commit behaviour, product code, deploy.

QA: AH-15 deny/allow/ask/CLI rows in slot, main and missing cwd; r7↔r8 differential (only merge,
rebase and pull rows may change); four mutants; full qa:offline 50; G1–G3 on the copied r8.
Live (Owner, post-LAND): L1–L5 as specified.

STOP: file outside scope · settings change · non-integration differential row · any read-only,
push, commit, R2/R2b or r5–r7 change · a Worker hook write · G/L gate failure (HOLD) · any
push/LAND/deploy/main change.

Order: candidate + suite → differential + mutants → Owner copies r8 (hash-checked) → full QA +
G1–G3 → independent Codex read-only review (Worker-launched) → final check → STOP before commit.
