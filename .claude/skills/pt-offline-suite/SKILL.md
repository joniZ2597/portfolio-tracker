---
name: pt-offline-suite
description: Use when the approved brief lists pt-offline-suite as Required or Recommended — a Pulse task that edits index.html or another surface pinned by an offline QA suite, or that adds an offline suite. Runs the coupling sweep (five classes), points at the existing harness patterns, and records planted negatives and re-pins with a revert proof. Read-only procedures; decides nothing the brief or AGENTS.md owns.
---

# pt-offline-suite

Worker-side Skill for Portfolio Tracker / Pulse offline QA. Governance (Git safety, tiers, gates,
Modes, STOP conditions, approvals) lives in `AGENTS.md` and `CLAUDE.md`; suite rules live in
`.claude/rules/qa-suites.md`. This Skill references them and never restates them.

Supporting files (all in this folder):
- `references/coupling-classes.md` — the five coupling classes, their search patterns and the
  instances known at the time of writing (re-verify at your baseline).
- `references/suite-patterns.md` — pointers to the existing harness patterns (no copies).
- `templates/plan-sections.md` — copy-ready blocks for `plan.md` and `review.md`.

## Purpose

Every change to `index.html` or another pinned surface arrives with its test coupling known
before the brief freezes and again at `/plan`, so that no pin, sandbox list or literal assertion
is discovered mid-implementation. The Skill also gives one reusable way to build Pulse offline
suites.

## When the brief lists this Skill

Inputs the brief must supply (exact names, not descriptions):
- the functions, regions and files the task edits;
- the re-pins the brief allows, by suite and pin name;
- for a new suite: its name and the requirement list it covers.

If an input is missing, the sweep still runs; its result is reported against what the brief does
say, and any gap is reported as the "sweep matches brief: no" outcome below.

## 1. Coupling sweep (the core)

Run with the Grep and Read tools only. No script, no shell pipeline, nothing that needs a new
command allowlist entry. For a historical replay, read each file through `git show <commit>:<path>`
(read-only) instead of the working tree.

1. **Edit targets.** List every function, region and file the brief edits, by exact name.
2. **Class (a) — sha256 pins of a function or region.** Grep `qa/*.js` and `qa/lib/*.js` for
   64-hex string literals. Map each literal to the symbol it pins: the object key it sits under,
   the constant name, or the nearest `extractFunctionSource` / `extractFn` call that feeds the
   hash. Record the EOL form the pin uses (LF-normalised or CRLF form).
3. **Class (b) — whole-file or masked-file pins.** Grep for masked-file pins
   (`PIN_MASKED_FILE`, `sha256(masked)`) and whole-file hashes of `index.html` or another target.
   Any edit outside the masked region trips them, whatever function it touches.
4. **Class (c) — sandbox dependency lists.** Grep for `FNS =`, `ENGINE_FNS =`, `names = [`,
   `REAL_FNS =`, `RENDER_REAL =` and similar arrays of function names. For each edited function
   on such a list, ask whether the edit makes it call a function that is not on the list; the
   sandbox then throws at run time.
5. **Class (d) — extracted-function harnesses.** Grep `extractFunctionSource(` and
   `extractFn(` for each edited symbol across `qa/*.js`, including `qa/run-offline.js`. These
   break on signature, brace-balance or free-name changes. Report `qa/run-offline.js` hits in
   their own rows and mark them ASK-tier (see `AGENTS.md`); the Mode and approval consequence is
   `AGENTS.md`'s, not this Skill's.
6. **Class (e) — literal-text assertions on edited code.** Grep for the literal strings, markup
   fragments and regex extractions a suite applies to the edited function: `indexOf('…')`,
   `countOf(…) === 1`, `split('…').length`, `.exec(fnSource)` with a literal shape, line-count
   deltas, signature regexes. These trip on wording, order or line-count changes.
7. **Output.** One table — suite · symbol · class · what trips it · tripped by the planned edit?
   · covered by the brief? · ASK-tier? — using the block in `templates/plan-sections.md`, and the
   line "sweep matches brief: yes / no".

**Stop rule.** A hit the brief does not list, or a re-pin the brief does not name, is not planned
around: report it as STOP-1 material (`AGENTS.md`) and do not start the implementation. COWORK
runs the same sweep read-only before freezing any brief that edits a pinned surface.

## 2. Suite patterns

Point at the existing harnesses in `references/suite-patterns.md`; do not copy them into a new
suite without reading the original first. The patterns: `extractFunctionSource` + `new Function`
sandbox; the `renderMainPanel` render harness with real score and price helpers, neutral stubs
and a captured panel; stubbed `fetch`, `localStorage` and timers; the private temp root for
suites that write files; no network and no browser (`.claude/rules/qa-suites.md`).

## 3. Planted negatives

Every violable invariant carries a planted negative, and the mutation lands on the production
source or its fixture input, never on the test (`.claude/rules/qa-suites.md`). Each negative:
- names its anchor (the literal, line or function the mutation replaces) and proves the anchor
  occurs exactly once before mutating — a zero or double match is a harness defect, not a pass;
- is paired with a positive control: the unmutated source passes the same assertion;
- records that the mutated run fails for the asserted reason, not for an unrelated crash.

## 4. Re-pin with a revert proof

Only for pins the brief names. For each:
1. compute the new value from the task source, in the same EOL form the suite uses;
2. revert only the brief's listed lines in a copy of the source and prove that the reverted copy
   hashes to the OLD value — this shows the edit, and nothing else, moved the pin;
3. record old → new → revert-proof result in the ledger (`templates/plan-sections.md`).
Do the proof once per EOL form when two suites pin the same function in different forms (the
score caliper uses the CRLF form, the TS1 suite the LF-normalised form).

## 5. Count discipline

The suite count follows auto-discovery (`.claude/rules/qa-suites.md`). After any re-sync of the
task branch, re-measure the count from the runner's own summary line; never carry a count forward
from memory or from the brief.

## Outputs

- `plan.md`: the coupling-sweep table (all five classes); the requirement → assertion map; the
  planted-negative list with positive controls; "sweep matches brief: yes / no".
- `review.md`: the per-pin re-pin ledger (old, new, revert-proof result); the RED → GREEN record
  for new assertions; the sweep re-run at the end with no new hits.

## With `/plan`

`/plan` runs the sweep first. If any hit is not covered by the brief, `/plan` stops and reports
it as STOP-1 material instead of planning around it. Only then does it write the requirement →
assertion map and the planted-negative list.

## STOP conditions (Skill-level)

- a sweep hit the brief does not list;
- a revert proof that fails;
- a re-pin of a value the brief does not name;
- a planted negative that does not bite, or whose anchor is not unique;
- any need to edit an ASK- or DENY-tier file (see `AGENTS.md`) to make a test pass.

## Boundaries — what this Skill never owns

- QA tiers, or which suites a LAND must run (governance);
- whether a re-pin is allowed (the brief / Owner decides);
- editing `qa/run-offline.js` or any ASK- or DENY-tier file;
- the heavy land-tool suites, which have their own briefs;
- product behaviour.

Surfaces and couplings are named by file and symbol, never by line number; verify every name at
the task's baseline before relying on it.
