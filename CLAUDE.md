# Portfolio Tracker / Pulse — Claude Working Instructions

## Session start

Before each project task, read:
1. This file (`CLAUDE.md`)
2. `AGENTS.md` for the active simplified workflow (repo orientation, test commands, LAND/SHIP boundaries)

Local-only `CHECKPOINT.md` may be consulted for legacy historical background (old phase
history from the pre-2026-09-18 ARC model), but it is not authoritative — see "Source of
current project state" below.

## Project workflow

- `CHECKPOINT.md` is local-only and excluded from version control. Never stage, commit, push, or recreate it elsewhere. Never disclose secrets from it.
- Task branches/worktrees should normally be based on `branch-dev`, which is the integration branch. Do not edit, merge into, deploy, or otherwise change `main`/production without explicit user approval after QA.
- Apply minimal scoped changes only. Do not expand the requested phase or bundle unrelated work.
- Ordinary scoped implementation flow (no separate planning/approval ceremony required): inspect
  → short task brief → implement within requested scope → targeted tests → review the actual
  diff (Codex or Owner) → full LAND QA / integration verification → Owner LAND → Owner SHIP when
  applicable. Full QA is a gate that must pass before LAND, not after it. Owner approval is
  required only at the explicit protected boundaries in this file and in `AGENTS.md` (commit,
  push, `main`/production, Netlify writes, live external canaries, destructive Git ops). After
  the approved brief-only commit exists, ordinary in-scope implementation edits do not require
  repeated Owner approval.
- Ordinary implementation does not require a separate implementation-plan approval step. For
  implementation tasks under the simplified workflow, the exact task scope is recorded in
  `work/<id>/brief.md`. Implementation may begin only after the Owner approves the exact current
  contents of that brief and its brief-only commit. This is the single scope-approval boundary,
  not a separate planning ceremony. Read-only inspection, research, status checks, and other
  non-implementation work do not need a `work/<id>/` brief unless they become implementation
  tasks.

### Active workflow model (simplified, effective 2026-09-18)

This project uses the simplified workflow described in `AGENTS.md`: Claude Code as primary
implementation owner, Codex as diff reviewer, plain Git worktrees for parallel tasks, and
`npm run qa:offline` (+ relevant targeted `test:*` scripts) as the required gate at LAND.
Ordinary tasks are **not** routed through `portfolio-skill-router`, the `arc-*` skill family,
or any registry/claim/mutex/publish/authorize machinery — those are frozen legacy (see bottom
of this file) and are used only if the Owner explicitly asks for that specific old workflow.

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
| Real-repo file edits, local validation, Git actions | Claude Code / PowerShell |
| Hosted browser QA, read-only visual/runtime verification | Cowork / browser-capable session |
| Netlify / environment changes | Verify exact site and branch-only scope first; no production changes without separate explicit Owner approval; require explicit approval before writes |

Cowork may not edit or claim to update the real repo unless that exact repo folder is connected and verified.

## Validation and temporary files

- Run local validation appropriate to the change before requesting commit.
- Temporary harness files must be created outside the repo, deleted after use, and never committed.
- Browser QA must capture relevant before/after state and verify no persistence, scoring, or config side effects when required.

## Task completion report

At LAND-request time, return one concise report:

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

Current operational truth comes from Git (branches, log, diff), active worktrees, current task
evidence, QA results, review results, and current Owner instructions — not from any single
document. Local-only `CHECKPOINT.md` is legacy historical context from the pre-2026-09-18 ARC
model; it is not the sole source of current state and is not required to be kept up to date.
Do not duplicate or hard-code changing project state in this file.

## Frontend aesthetics

<frontend_aesthetics>

- Pulse is a premium, calm, evidence-driven U.S. equities research workspace.
- Dark palette: background `#080D16`, surfaces `#101A2A`, primary accent `#4B82F1`.
- Typography: Space Grotesk headings, Inter or IBM Plex Sans body, JetBrains Mono/tabular numbers for tickers and financial metrics.
- Semantic colors only: green `#22C58B` for positive/verified evidence; red `#F05D6C` for negative/risk/error; amber `#F4B860` for extended-hours/partial/pending status.
- Avoid generic SaaS styling, crypto-terminal neon, glow gradients, glassmorphism, decorative semantic colors, and distracting motion.
- Keep UI transitions subtle, generally `120ms–240ms`.

</frontend_aesthetics>

## Deployment and QA policy

<deployment_and_qa_policy>

- Every Netlify write requires explicit Owner approval — including branch deploys, deploy previews, production deploys, environment-variable changes, and any other Netlify mutation. Read-only Netlify inspection does not require approval.
- Local validation remains required before requesting a DEV deploy whenever feasible; batch related fixes when practical.
- DEV deploy approval does not authorize scope expansion, state/localStorage/scoring/provenance changes, uncontrolled runtime testing, or production actions.
- Explicit approval remains required before live external API/SEC/Perplexity canaries, repeated or long-running Function/background-runtime tests, commit, push, merge, or any `main`/production change.
- Production remains protected and requires reviewed diff, clean Git state, successful relevant DEV QA, and separate approval.

</deployment_and_qa_policy>

---

### Agent Pre-Flight Skills & Goal Checklist

Produced once per task, in `work/<id>/plan.md`, before implementation begins — not before each
edit, and not in the conversation. All four items are required; none may be skipped or
abbreviated. Under the simplified workflow this is part of the Worker execution contract in
`AGENTS.md`, and the Owner does not review it edit-by-edit.

**[Skill - Pattern Auditing]**
Identify and explicitly reference at least two existing code patterns in the repository that dictate the architectural style for this change. Name the function(s), file(s), and the specific structural decisions being matched (gate style, storage key, fetch shape, result structure, etc.).

**[Skill - State & Boundary Isolation]**
Trace the exact boundaries of the proposed change. Confirm zero accidental mutation of:
- `localStorage` (no reads or writes to `pt_results`, `pt_tickers`, or any existing key)
- DOM (no injection outside the explicitly scoped element, if any)
- Scoring engines (`orchestrate`, `analyzeChunk`, `enforceScoreConsistency`, `_techCache`)
- Any existing Deep Dive, normal scan, or Actionable Take flow

**[Skill - Gate Verification]**
Verify that code execution is guarded by:
- A client-side boolean gate (explicit `=== true` strict check, not truthy, reset on every page reload)
- A server-side environment toggle (`=== 'true'` string check, checked before any upstream I/O)

State the exact variable names and check expressions for both gates.

**[Goal - Definition of Done]**
Specify the exact JSON shape or logic outcome that constitutes a successful run. This output shape serves as the strict QA benchmark — any deviation from it is a test failure, not a warning.

---

## FROZEN LEGACY — pre-2026-09-18 ARC / execution-routing model

> Owner-ruled 2026-09-18: superseded by the simplified workflow in `AGENTS.md`. Kept for
> historical reference and for the rare case the Owner explicitly asks for this specific old
> workflow on a specific task. Do not route ordinary work through this section by default.

The old model required Main to internally apply the `portfolio-skill-router` execution-routing
decision model at the start of each task, every phase transition, scope/authority changes, reroute
triggers, before dry-run-to-live, and before any external/production mutation, with explicit
`/portfolio-skill-router` invocation reserved for ambiguous/high-risk/`REROUTE_REQUIRED` cases, and
approval-preview handling governed by `approval-flow-optimizer` optimization-rules. It also included
the full `arc-*` skill family (`arc-authorize`, `arc-progress-auditor`, `arc-publish-plan`,
`arc-registry`, `arc-worker`) and their registry/claim/mutex/publish/authorize machinery under
`.ai-reports/arcs/`. All of the above remain present on disk, otherwise behaviorally unchanged, and
are frozen rather than deleted.
