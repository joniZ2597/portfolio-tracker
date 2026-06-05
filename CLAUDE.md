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

- Netlify Personal permits Branch Deploys and Deploy Previews for DEV/browser QA; do not avoid a necessary `branch-dev` deploy solely to conserve deploy credits.
- Local validation remains required before DEV deploy whenever feasible; batch related fixes when practical.
- DEV deploy permission does not authorize scope expansion, state/localStorage/scoring/provenance changes, uncontrolled runtime testing, or production actions.
- Explicit approval remains required before Netlify environment-variable changes, live external API/SEC/Perplexity canaries, repeated or long-running Function/background-runtime tests, commit, push, merge, production deploy, or any `main`/production change.
- Production remains protected and requires reviewed diff, clean Git state, successful relevant DEV QA, and separate approval.

</deployment_and_qa_policy>

---

### Agent Pre-Flight Skills & Goal Checklist

Before proposing any code edits for **Client Probes** or **Server Components**, the agent must explicitly output a pre-flight evaluation covering all four items below. Do not skip, abbreviate, or defer any item. The evaluation must appear in full before any code or diff is shown.

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
