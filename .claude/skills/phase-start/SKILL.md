---
name: phase-start
description: Run the Portfolio Tracker / Pulse pre-flight before starting or resuming implementation, QA, Git, deploy, or data-source work. Confirms scope, refs, gates, approvals, and stop conditions.
---

# Phase Start

Run before beginning the requested project phase.

1. Read `CLAUDE.md` for standing rules, Git safety, deployment policy, and applicable constraints.
2. Read local-only `CHECKPOINT.md` for current refs, active/completed phases, DEV gate states, blockers, approved scope, and next planned work.
3. Identify the requested phase from `$ARGUMENTS`, or only infer it when explicitly clear from the user request.
4. Run the Git pre-check procedure required by `CLAUDE.md`.
5. Apply all stop conditions and approval gates from `CLAUDE.md`.
6. Stop if `CHECKPOINT.md` is missing, current state cannot be confirmed, scope is unclear, or any Git/safety check fails.
7. Return one compact report containing: phase, allowed scope, current branch, HEAD, origin/branch-dev, origin/main, working-tree status, relevant gate state, required approvals, stop-condition result, and one recommended next action.

`/phase-start` is read-only. It must not implement changes, edit project files, commit, push, deploy, change Netlify settings or environment variables, run browser QA, invoke live APIs, or touch `main`/production unless a later separately approved step authorizes that action.
