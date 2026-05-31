# Portfolio Tracker / Pulse — Claude Working Instructions

## Session start

Before each project task, read:
1. This file (`CLAUDE.md`)
2. Local-only `CHECKPOINT.md` (current project state, phase history, QA results)

## Project workflow

- `CHECKPOINT.md` is local-only and excluded from version control. Never stage, commit, push, or recreate it elsewhere. Never disclose secrets from it.
- All feature work starts on `branch-dev`. Do not edit, merge into, deploy, or otherwise change `main`/production without explicit user approval after QA.
- Apply minimal scoped changes only. Do not expand the requested phase or bundle unrelated work.
- Workflow order: inspect → explain → smallest safe plan → approval → implement → verify → QA → summarize.

## Git safety

Before any edit, commit, push, merge, checkout, reset, deploy, or configuration change, run and report:

    git branch --show-current
    git status --short --branch
    git log --oneline -3
    git log --oneline origin/main -1
    git log --oneline origin/branch-dev -1
    git diff --stat
    git diff --cached --stat

Stop and report without proceeding on:
- Unexpected modified, staged, or untracked repo files
- Lock files, diverged branches, wrong branch, or unexpected commits
- Line-ending or format churn in the diff
- Any condition that does not match the expected clean state

Never commit or push unless specifically approved for that exact action and scope. Small scoped diffs only — no unrelated changes in a commit.

## Tool and environment routing

| Task | Use |
|------|-----|
| Real-repo file edits, local validation, Git actions, `CHECKPOINT.md` updates | Claude Code / PowerShell |
| Hosted browser QA, read-only visual/runtime verification | Cowork / browser-capable session |
| Netlify / environment changes | Verify exact site and branch-only scope first; no production changes; require explicit approval before writes |

Cowork may not edit or claim to update the real repo unless that exact repo folder is connected and verified.

## Validation and temporary files

- Run local validation appropriate to the change before requesting commit.
- Temporary harness files must be created outside the repo, deleted after use, and never committed.
- Browser QA must capture relevant before/after state and verify no persistence, scoring, or config side effects when required.

## ChatGPT handoff mode

Claude cannot communicate directly with ChatGPT. The user copies reports into ChatGPT manually.

At the end of each approved task, return a concise handoff report:

1. Current phase and PASS / FAIL / STOP result
2. Exact files changed
3. Validation or QA results
4. Git / deploy / Netlify / production impact
5. Any blocker or stop condition
6. Next single recommended step only

Do not bundle future phases or suggest multiple next actions unless the user requests it.

## Current project boundary

Treat the following as separate phases unless the prompt explicitly combines them:

- EDGAR Insider / Form 4 arc (7B-6E-x)
- General UI readability
- TradingView integration
- NotebookLM integration
- Future catalyst categories

Never alter scoring, Actionable Take, recommendations, normal scan, persistence, or production exposure unless the approved phase explicitly requires it.

## Source of current project state

Use local-only `CHECKPOINT.md` as the sole source for current commits, deployed state, completed phases, QA results, enabled DEV gates, and next planned work. Do not duplicate or hard-code changing project state in this file.
