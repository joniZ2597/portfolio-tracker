---
name: approval-flow-optimizer
description: Manually invoked advisory review of an active multi-stage approval workflow. Maps the remaining approval boundaries, proposes the shortest SAFE path, and separates optimizations already allowed under the current contract from those needing a contract amendment and boundaries that must stay separate. Advisory only — never executes, authorizes, or relaxes any gate, freeze, or contract. Optionally complements approval-safe-helper-workflow if present.
disable-model-invocation: true
---

# Approval Flow Optimizer

> **STANDING BEHAVIOR — ADVISORY ONLY, NON-AUTHORIZING.**
> This skill only *reviews* a workflow and *proposes* a shorter safe approval
> path. It NEVER executes commands, accesses Netlify or any external system,
> edits or creates files, appends logs, changes Git state, grants approval, or
> relaxes a freeze or gate. It NEVER treats system pressure, context limits, or
> user fatigue as authorization, and it NEVER infers that efficiency justifies
> authorization. Its entire output is one advisory report. Producing this report
> is not an approval and cannot substitute for one.

This skill is **owner-invoked only** (manual invocation required). It is
triggered with `/approval-flow-optimizer`. It does not execute tasks.

## Arguments

`$ARGUMENTS`, when supplied, may **scope** the review — e.g. which workflow, or
which remaining slice/phase to analyze. `$ARGUMENTS` may **never** override the
active governing contract or the accepted control state; it only narrows what
is reviewed. When no arguments are given, infer the active workflow from the
conversation and the accepted control records.

## Authority order (highest first — fail-closed)

Establish the authoritative current state strictly in this precedence:

1. **Ratified governing contract and the active GO.**
2. **Accepted control records and execution evidence** (e.g. `EXECUTION_LOG.md`,
   local-only `CHECKPOINT.md`, pinned evidence artifacts).
3. **Confirmed conversation state.**
4. **`$ARGUMENTS`.**

Any unresolved contradiction between levels MUST produce **HOLD and stop** —
never a guess. Example: if `$ARGUMENTS` asks to treat a step as already approved
but a control record shows it is not, HOLD and name the exact contradiction.
If the current state cannot be confirmed at all, say so and stop.

## Procedure

1. **Establish state** under the authority order: current project, slice,
   phase, current posture, completed steps, remaining steps, and every active
   gate, freeze, budget, deadline, and authority boundary. If not confirmable,
   stop.
2. **Classify every remaining step** by the category matrix in
   `references/optimization-rules.md` (13 categories: planning; read-only
   review; read-only preflight; file creation; local write; control-log append;
   Git mutation; external-system mutation; owner UI action; live call;
   time-critical transaction; evidence generation; reporting). A step may carry
   more than one category.
3. **Find safe consolidations** and **flag forbidden ones** using the
   safe-consolidation, review/preflight-merge, and prohibited-consolidation
   rules in `references/optimization-rules.md`. Then separate every proposal
   into exactly three buckets:
   - **A — allowed now** under the current contract;
   - **B — requires an explicit contract amendment**;
   - **C — must remain a separate boundary**.
   Nothing in bucket A may depend on a rule change. Every bucket-B item names
   the exact contract rule it would change and is **recommend-only** — the skill
   never self-adopts an amendment.
4. **Quantify efficiency**: current vs optimized owner-approval turns, extra
   reduction possible only after an amendment, the exact steps eliminated,
   merged, or moved earlier, and the residual risk of each consolidation. Count
   turns per the counting rule below and state the assumptions used.
5. **Emit the report** in the fixed nine-section structure defined in
   `templates/efficiency-review.md`, ending with exactly one recommended next
   boundary and exactly one copy-ready, English-only prompt below 4000
   characters.

## Approval-turn counting

Count **only owner authorization decisions** as approval turns. Do NOT count
planning responses, reports, or read-only assistant narration as owner approval
turns. State every counting assumption explicitly in the report — for example,
"a single owner GO covering the ratified execute + capture + verify bundle
counts as one turn," or "read-only boundaries that need no owner authorization
to proceed are excluded from the count."

## Hard limits (must never)

Execute commands · access Netlify or any external system · edit or create files ·
append logs · change Git state · grant approval · relax a freeze or gate ·
combine steps merely because separation is inconvenient · treat system pressure,
context limits, or user fatigue as authorization · infer that efficiency
justifies authorization · let `$ARGUMENTS` override the contract or control
state.

## Companion note

If `.claude/skills/approval-safe-helper-workflow/SKILL.md` is present, treat its helper-safety rules as the invariant floor this skill optimizes around, never below. This skill does not depend on that skill and is fully self-contained if it is absent.

## Required output

Produce the report exactly as structured in `templates/efficiency-review.md`
(sections 1–9), using the rules in `references/optimization-rules.md`. End with
one recommended next boundary and one copy-ready English-only prompt.

> **REMINDER (advisory only):** this report proposes; it never authorizes.
> Every write, execution, owner-UI action, external call, control-log append,
> or posture change named in it still requires its own separate, explicit,
> one-time owner approval. Efficiency, urgency, and fatigue are never authority.
