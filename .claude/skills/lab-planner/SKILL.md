---
name: lab-planner
description: Manual lab router for Portfolio Tracker / Pulse. Classifies every request into a Work Mode, recommends a model, identifies the target, and returns a structured routing card. Does not execute tasks.
disable-model-invocation: true
---

# Lab Planner / Lab Router

This skill is a manual router only. It does not execute tasks. It must not implement changes, edit files, commit, push, deploy, change Netlify settings, invoke live APIs, or run browser QA. Its only output is a structured routing card for a future session.

## 1. Required Pre-checks

Before producing the routing card, read CLAUDE.md and local-only CHECKPOINT.md.

Run and report these read-only checks:

* git branch --show-current
* git status --short --branch
* git log --oneline -3
* git log --oneline origin/main -1
* git log --oneline origin/branch-dev -1
* git diff --stat
* git diff --cached --stat

Stop if the current branch is main, Git state is dirty beyond expected untracked files, CHECKPOINT.md is staged/tracked/modified, or project state cannot be confirmed.

## 2. Work Mode Classification

Classify the requested task into exactly one Work Mode:

* `READ_ONLY_LAB`
  Inspection, audit, grep, mapping, or analysis only. No file edits. No worktree required.

* `IMPLEMENTATION_PLANNING`
  Drafting a plan, spec, or prompt for a future session. No file edits. No execution.

* `EXPERIMENT_IMPLEMENTATION`
  Scoped prototype or exploratory implementation on `experiment/*` only. Not branch-dev. Not production.

* `IMPLEMENTATION`
  Approved scoped work on `branch-dev`. Must have a cleared plan in CHECKPOINT.md before proceeding.

* `QA_ONLY`
  Browser, static, or fixture QA only. No app code edits. No schema or storage mutation unless explicitly restored.

* `RELEASE_DECISION`
  Cherry-pick planning, release branch creation, promotion to main, or production deploy decision. Requires explicit user approval before any action.

* `LOCAL_MAINTENANCE`
  Tooling, skills, CLAUDE.md, non-app local-only files. No app runtime code. No CHECKPOINT edit unless explicitly approved.

State the classification and reason before the routing card.

## 3. Recommended Model

Select exactly one model based on the Work Mode and task complexity:

* `Fable 5`
  Use for: wide planning, architecture, roadmap, endgame planning, release strategy memos, risk analysis, implementation planning, prompt/spec design, and Claude Design / NLM handoff briefs.
  Do not use for: direct implementation, commits, deploys, or CHECKPOINT edits.

* `Sonnet 4.6`
  Use for: standard Claude Code work — scoped implementation on `branch-dev`, local QA, small fixes, controlled file edits, validation, and normal engineering execution.

* `Haiku 4.5`
  Use for: summaries, extraction, short audits, text cleanup, local maintenance drafts, CHECKPOINT cleanup drafts, and lightweight read-only organization work.

* `Opus 4.7`
  Use only for: hard blockers — complex debugging, persistent regressions, architecture conflicts, difficult multi-step reasoning, or failed attempts by Sonnet or Fable.
  Not a default model for normal release decisions.

## 4. Target

Select the primary target surface for the task:

* `No files` — read-only inspection, no writes anywhere
* `experiment/*` — isolated lab branch only
* `branch-dev` — staging branch implementation
* `local-only doc` — CLAUDE.md, skill files, local non-repo docs
* `CHECKPOINT local-only` — CHECKPOINT.md only; never staged or committed
* `Claude Design` — Figma / design system handoff
* `NLM` — NotebookLM source or podcast handoff
* `Cowork` — browser/visual QA and runtime verification only; no repo edits unless explicitly approved

## 5. Safety Boundaries

The routing card must enforce:

* No main or production changes.
* No Netlify env var, gate, deploy configuration, or deploy action.
* No live SEC/EDGAR, Perplexity, Anthropic, Alpha Vantage, Finance Search, or other external API calls unless explicitly approved.
* Git write actions require separate explicit approval: add, commit, push, cherry-pick, merge, reset, branch switch.
* CHECKPOINT.md is read-only and must never be staged, committed, pushed, recreated, or modified by the lab.
* No writes to pt_results, pt_tickers, localStorage schema, scoring engines, orchestrate, analyzeChunk, enforceScoreConsistency, _techCache, Actionable Take, normal scan behavior, or production scoring unless explicitly approved.
* No scope expansion or bundling unrelated work.

## 6. Required Output — Routing Card

Return exactly this structure:

```
Work Mode:          <mode>
Recommended Model:  <model>
Target:             <target>

Collision check:    <what this might conflict with — branch, gate, schema, or open arc>
Allowed actions:    <explicit list of permitted actions for this routing>
Forbidden actions:  <explicit list of prohibited actions for this routing>
Required output:    <what a PASS looks like — specific artifact or observable result>
Stop condition:     <what triggers BLOCKED or NEEDS DECISION>

Final status:       PASS / BLOCKED / NEEDS DECISION
```

If the status is BLOCKED or NEEDS DECISION, state the exact blocker or decision required before proceeding.

## 7. Stop Conditions

Return `BLOCKED` or `NEEDS DECISION` if:

* The current branch is main or cannot be confirmed.
* CHECKPOINT.md is staged, tracked, modified, missing, or unreadable.
* Git state is unexpectedly dirty.
* The task requires main, production, Netlify env/gates, deploys, or live APIs without explicit approval.
* The task touches protected surfaces without explicit approval.
* The task requires a new experiment branch without approval.
* The scope is unclear or too broad.
* More than one Work Mode is plausible — surface the ambiguity and stop.

## 8. Handoff Report

At the end, return only:

* Work Mode and reason
* Recommended Model and reason
* Target
* Routing card (Section 6 format)
* Files expected to change, or none
* Files protected
* Required approvals before execution
* Git state
* Blockers or open decisions, if any
* One recommended next step only
