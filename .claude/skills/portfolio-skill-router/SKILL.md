---
name: portfolio-skill-router
description: Thin Portfolio Tracker / Pulse routing overlay. Given a task, returns a compact routing decision — lane, skill(s), model, gate flags, risk level, and next safe action. Does not execute tasks. For full work-mode classification use /lab-planner.
disable-model-invocation: true
---

# Portfolio Skill Router

This skill is a read-only routing selector for Portfolio Tracker / Pulse. It does not execute tasks, edit files, commit, push, deploy, invoke APIs, or change Netlify settings. Its only output is a compact routing decision.

## Prompt-Size Rule

Keep `/goal` under 4000 characters. Move long context to separate sections or split into multiple prompts.

## How to Use

Read the task description from `$ARGUMENTS` or the user message. Apply the routing rules below. Return the routing decision in the required format. Do not skip or expand the output.

## Routing Rules

Apply the first matching rule. If multiple rules match, apply all and flag the conflict.

1. **Pre-flight** — Before any implementation, QA, Git, deploy, or release action, always recommend `/phase-start` first.
2. **Full work-mode classification** — For a structured routing card with model, target, allowed/forbidden actions, and stop conditions, refer to `/lab-planner`.
3. **Browser / runtime QA** — Skill `/browser-integrity-qa`, lane `QA_ONLY`. Use after approved DEV work for localStorage, console, network, and gate-state checks.
4. **Strategic decisions** — Skill `/Decision_Council`. Use for release/promotion decisions, gate enable/disable, scope conflicts, or architecture tradeoffs.
5. **Workflow / data-flow diagrams** — Skill `/workflow-visualizer`, lane `Docs`. No repo edits.
6. **UI visual planning (non-implementation)** — Lane `Read-only Lab` or `Claude Design`. No code edits until separately approved.
7. **UI implementation** — Skill `/frontend-design`, lane `Claude Code`. Only after explicit approval. Must override generic aesthetics with PT/Pulse calm dark-fintech palette from `CLAUDE.md <frontend_aesthetics>`. One active `index.html` implementation lane at a time.
8. **G-R (`PT_ENABLE_PORTFOLIO_RESEARCH`)** — Flag as `approval-gated`. Do not enable, test, or invoke without explicit approval.
9. **G-L / live prices (`PT_ENABLE_PORTFOLIO_LIVE_PRICES`)** — Flag as `high risk, approval-gated`. Do not enable or invoke without explicit approval.
10. **`index.html` edits** — Flag `Touches index.html: YES`. Enforce one active implementation lane only.
11. **Data / localStorage audit** — Lane `Read-only Lab`. No schema changes, no `pt_holdings`/`pt_results`/`pt_tickers` writes unless a future slice is explicitly approved.
12. **Release / main / production / Netlify** — Lane `Main conversation approval only`. No merge, deploy, env-var change, or production action without explicit approval.
13. **Docs / NotebookLM summaries** — Lane `Docs`. No code edits.
14. **Repeated automated QA failures** — If automated QA fails repeatedly due to sandbox, localhost, or script duplication issues, recommend switching to manual browser/console QA when the check is simple and low-risk.
15. **Ambiguous task** — Default to safest lane: `Read-only Lab`.

## PT/Pulse Protected Surfaces

Never route any task toward unguarded writes to:
- `pt_results`, `pt_tickers`, `pt_holdings` (localStorage)
- `orchestrate`, `analyzeChunk`, `enforceScoreConsistency`, `_techCache` (scoring engines)
- Actionable Take, normal scan behavior, or production scoring
- `CHECKPOINT.md`, `PORTFOLIO_ENDGAME_QUEUE.md` (local-only docs)
- `main` branch or production Netlify site

## Required Output Format

Return exactly this block:

```
Skill Router Decision

Task classification:      <implementation / QA / planning / design / docs / release / audit / diagram>
Recommended lane:         <Main conversation / Read-only Lab / QA_ONLY / Claude Code / Claude Design / Docs / Approval required>
Recommended skill(s):     <comma-separated, e.g. /phase-start, /lab-planner>
Recommended model:        <Opus / Sonnet / Haiku>
Touches index.html:       <YES — one active lane only / NO>
Touches localStorage:     <YES — read-only audit / YES — write approved / NO>
Gate involvement:         <G-R approval-gated / G-L high-risk approval-gated / None>
Production/Netlify:       <Approval required / Not involved>
Risk level:               <Low / Medium / High / Approval-gated>
Forbidden actions:        <explicit list>
Next safe action:         <one action only>
```

If blocked or ambiguous, append:

```
Status: BLOCKED — <reason>
```

or

```
Status: NEEDS DECISION — <what must be decided before proceeding>
```

## Model Selection Guide

| Model | Use for |
|---|---|
| `Opus` | Deep planning, architecture, release strategy, risk analysis, complex reasoning |
| `Sonnet` | Scoped implementation on `branch-dev`, QA, validation, file edits |
| `Haiku` | Summaries, cleanup, lightweight read-only organization, short audits |
