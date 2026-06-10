---
name: lab-planner
description: Planning-only skill to classify Portfolio Tracker / Pulse lab, overnight, audit, or implementation requests and generate one safe copy-ready Claude Code prompt. Does not execute the task.
disable-model-invocation: true
---

# Lab Planner

This skill is planning-only. It must not implement changes, edit files, commit, push, deploy, change Netlify settings, invoke live APIs, run browser QA, or start the lab task. Its only output is one safe, copy-ready Claude Code prompt for a future session.

## 1. Required Pre-checks

Before producing the prompt, read CLAUDE.md and local-only CHECKPOINT.md.

Run and report these read-only checks:

* git branch --show-current
* git status --short --branch
* git log --oneline -3
* git log --oneline origin/main -1
* git log --oneline origin/branch-dev -1
* git diff --stat
* git diff --cached --stat

Stop if the current branch is main, Git state is dirty beyond expected untracked files, CHECKPOINT.md is staged/tracked/modified, or project state cannot be confirmed.

## 2. Classification Modes

Classify the requested task into exactly one mode:

* READ-ONLY AUDIT: inspection, search, mapping, or analysis only. No file edits.
* EXPERIMENT/LAB BRANCH: prototype, spike, exploratory implementation, or uncertain scope. Prefer this for new arcs.
* BRANCH-DEV IMPLEMENTATION: approved scoped work already cleared for branch-dev in CHECKPOINT.md.
* BLOCKED / DEFERRED: unsafe, unclear, production-facing, missing approval, or touches protected surfaces.

State the classification and reason before the generated prompt.

## 3. Safety Boundaries

The generated prompt must enforce:

* No main or production changes.
* No Netlify env var, gate, deploy configuration, or deploy action.
* No live SEC/EDGAR, Perplexity, Anthropic, Alpha Vantage, Finance Search, or other external API calls unless explicitly approved.
* Git write actions require separate explicit approval: add, commit, push, cherry-pick, merge, reset, branch switch.
* CHECKPOINT.md is read-only and must never be staged, committed, pushed, recreated, or modified by the lab.
* No writes to pt_results, pt_tickers, localStorage schema, scoring engines, orchestrate, analyzeChunk, enforceScoreConsistency, _techCache, Actionable Take, normal scan behavior, or production scoring unless explicitly approved.
* No scope expansion or bundling unrelated work.

## 4. Output Requirements

Generate one copy-ready Claude Code prompt using plain Markdown only. Do not use markdown code fences.

The prompt must include:

* Classification line
* Target branch or branch requirement
* Goal
* Scope in
* Scope out
* Required pre-flight checks
* Tasks
* STOP markers before any approval-gated action
* Definition of Done
* Validation requirements
* Handoff report

## 5. Stop Conditions

Stop and return BLOCKED / DEFERRED if:

* The current branch is main or cannot be confirmed.
* CHECKPOINT.md is staged, tracked, modified, missing, or unreadable.
* Git state is unexpectedly dirty.
* The task requires main, production, Netlify env/gates, deploys, or live APIs without explicit approval.
* The task touches protected surfaces without explicit approval.
* The task requires a new experiment branch without approval.
* The scope is unclear or too broad.

## 6. Handoff Report

At the end, return only:

* Classification
* Reason
* Generated prompt status
* Files expected to change, or none
* Files protected
* Required approvals
* Validation required
* Git state
* Blockers, if any
* One recommended next step
