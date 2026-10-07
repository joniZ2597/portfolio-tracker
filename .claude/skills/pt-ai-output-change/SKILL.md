---
name: pt-ai-output-change
description: Use when the approved brief lists pt-ai-output-change — a Pulse task that changes what the AI is given or allowed to say (scan prompt, technical block, news or stock context, Deep Dive context, parse fallback, post-AI overrides, AI-text-derived labels). Maps the AI-facing surfaces by function name, applies the data-gating pattern, specifies offline wording checks, classifies narrative findings A / B / C / D, writes the consumer-impact note and hands the DEV check to browser-integrity-qa. Never runs live.
---

# pt-ai-output-change

Worker-side Skill for Portfolio Tracker / Pulse. A safe, repeatable way to change what the AI is
given or allowed to say, and to prove the AI-facing text is consistent with the displayed data.
Governance lives in `AGENTS.md` and `CLAUDE.md`; this Skill references and never restates it.
Pin mechanics belong to `pt-offline-suite`; live evidence collection belongs to
`browser-integrity-qa`.

Supporting files (this folder):
- `references/ai-surfaces.md` — the surface map by function name, what each feeds, and its consumers.
- `templates/findings.md` — the finding table (A / B / C / D) and the wording-check table.

## Purpose

Every AI-facing fix used to re-discover the same surfaces, the same risks and the same evidence
format. This Skill fixes the surface list, the gating pattern, the offline assertions and the
finding vocabulary, so a brief can name exactly which strings change and a Worker can prove
exactly that.

## When the brief lists this Skill

Inputs the brief must supply:
- the AI-facing strings to change, old → new, and the banned terms per surface;
- the data-gating rules (which statement is allowed only when which data line is present);
- the consumers in scope (which downstream readers of the changed field the task covers);
- whether a DEV check is approved, and its evidence fields.

## 1. Surface map (re-verified per task)

Locate every surface in `references/ai-surfaces.md` by function name with Grep at the task's
baseline — line numbers are never stored. For the brief's change, list every location the change
reaches: prompt text, context builders, the Deep Dive context, the parse / fallback path, the
deterministic overrides and the AI-text-derived labels. A reached location the brief does not
name is STOP-1 material (`AGENTS.md`); do not plan around it.

## 2. Data-gating pattern

"The AI may mention X only when the context carries the data line for X." Each gated statement
needs:
- the prompt instruction that ties the statement to its data line;
- an explicit "unavailable" line in the context when the data is absent, instead of silence (the
  context builders already do this for research and price data — follow that form);
- an offline assertion that the instruction and the data line are present together, and a planted
  negative that removes the data line and expects the gated statement's instruction to require
  "unavailable".
A gating rule that would make the AI state data it does not receive is a STOP condition.

## 3. Wording checks (offline, no live call)

In the task's offline suite (built with `pt-offline-suite`):
- **exact-string assertions** on the AI-facing strings the brief changes, read from the extracted
  function source or from the function's output on a fixture;
- **banned-term scan** on each named surface: the brief's term regex (for example
  `\bATH\b|all-time` on a 1Y-metric surface) must have no hit in the function output and in the
  surface's own prompt lines (select them by their anchor, for example the gating lines by their
  setup-name prefix), with a planted negative that re-introduces the term. A prohibition line that
  names the banned term in order to forbid it is not a hit: assert it separately as an exact string
  and exclude it from the scan by that exact anchor — never by loosening the regex;
- **enum → display mapping**: every enum value the AI or the UI shows has exactly one display
  string, asserted through the real mapping function, never a re-implementation.

## 4. Consumer-impact note

For every changed field or string, name each downstream reader and what it displays: the
dial label, Scan Results grouping, the Daily Review, persisted results in `pt_results`, the Deep
Dive context. The map in `references/ai-surfaces.md` lists the known readers per surface; verify
the list with Grep at the baseline. A consumer the brief does not cover is a STOP condition. This
is what prevents silent label drift.

## 5. Finding taxonomy

Classify every narrative finding from a pilot or DEV check with one primary class and, where the
evidence shows two causes, one secondary class (`templates/findings.md`):

| Class | Meaning | Typical evidence |
|---|---|---|
| **A** | deterministic — a computed value, label, clamp or override is wrong or stale | the displayed figure differs from the recomputed one; a label maps the wrong enum |
| **B** | AI narrative / prompt — the AI said something the prompt allowed or failed to forbid | the narrative claims a figure or term the context never carried, or ignores a gating rule |
| **C** | source / data — the upstream data (research provider, market data, parser input) is wrong, stale or missing | the context line itself is wrong; the parser received a shape it does not handle |
| **D** | portfolio-awareness — the output ignores or misstates the holding context (held vs. not held, size, P/L) | advice that contradicts the position state the app holds |

Each finding records the exact observed values (the string, the number, the ticker, the surface).
A finding without an exact observation is not a finding.

## 6. DEV hand-off

When the brief approves a DEV check, name the evidence fields `browser-integrity-qa` should
extract (for example the parsed analyst fields, the technical block as sent, the narrative's
rating line) and the permitted `pt_*` changes. This Skill never performs the live step; the Owner
or COWORK triggers `/browser-integrity-qa` at the brief's approved live step.

## Outputs

- `plan.md`: the touched AI surfaces (from the map, re-verified), the consumer-impact list, the
  planned wording assertions and planted negatives.
- `review.md`: the wording-check results, the banned-term scan per surface, the consumer-impact
  confirmation, and — when a DEV check ran — the evidence classified A / B / C / D.

## With `/plan`

`/plan` uses the surface map to list every AI-facing location the brief's change reaches. A
location not named in the brief → STOP-1 material. It schedules `pt-offline-suite` for the
assertions and the coupling sweep (many AI surfaces are pinned), and `browser-integrity-qa` for
the approved DEV step.

## STOP conditions (Skill-level)

- an AI-facing change outside the brief's listed strings;
- a consumer of the changed field the brief does not cover;
- a data-gating rule that would make the AI state data it does not receive;
- any need for a live call to complete offline QA.

## Boundaries — what this Skill never owns

- the product decision of what the AI should say or how a label should read (Owner / brief);
- running live scans (`browser-integrity-qa`, with approval);
- pin mechanics and suite construction (`pt-offline-suite`);
- scoring rules, thresholds or the parser contract (owned by their own suites and briefs).
