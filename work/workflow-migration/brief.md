# Task brief: next-generation Worker workflow migration

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Only then may implementation begin, per `AGENTS.md`
"Task folder convention".

## Baseline

| | |
|---|---|
| `branch-dev` = `origin/branch-dev` | **`10b8003dd55cbed874bb901636d633b68c09b471`** — in sync, clean tree |
| `origin/main` | `fbec2c1` — `branch-dev` is 9 commits ahead |
| `npm run qa:offline` | **green on the host.** `instruction_layer_offline` PASS 58/58 after `41c3945`; `arc_registry` fails only `D7-c`, the known Linux-sandbox worktree-path artifact that passes on Windows |
| Authority | `.ai-reports/status/next-gen-worker-flow.PREP.local.md`, sections **M** and **N**, rulings **W-1 … W-9** |

## Scope — six files, no alternatives

```
AGENTS.md                          modify
CLAUDE.md                          modify
qa/instruction_layer_offline.js    modify   (CLAUDE.md fingerprint only)
.gitignore                         modify
.claude/settings.json              modify
.claude/rules/qa-suites.md         new      (the pilot rule — exactly one)
```

**Out of scope, named so the boundary is explicit:**

- `.claude/rules/netlify-functions.md` and `.claude/rules/client-index.md` — **held until the pilot
  proves path-scoped loading in this repository**
- `.claude/skills/land-prep/` — **not built** (W-5 deferred)
- `Bash(git commit*)` — **stays in `ask`** (W-2 not approved)
- Any product code, any other QA suite, `BACKLOG.md` beyond the finalization carve-out below
- The three existing `work/*/review.md` files — **not retrofitted** with the Lessons model

## Intended change per file

### 1 · `AGENTS.md` — the Worker contract *(the substance of this migration)*

Add, without removing any existing section:

- **Worker execution contract.** After a tracked approved `brief.md` exists, the Worker: maps every
  requirement to a named assertion **before writing code** (`plan.md`); names conventions **followed
  and overridden**, with the brief winning over repo precedent; writes failing tests first;
  implements and fixes autonomously in scope; runs targeted QA to green; performs a fresh-context
  self-review; runs Codex on the real diff; resolves in-scope findings; runs full QA; writes
  `review.md`; commits on the task branch; requests LAND. **The Owner does not approve individual
  file edits, inspect previews, relay Codex findings, or decide ordinary in-scope questions.**
- **Five STOP conditions, complete list** — edit outside approved scope/files · contract cannot be
  satisfied as written · security assumption conflicts with repository/vendor evidence · a required
  test or action needs a live/production/deployment/protected mutation · two approved requirements
  contradict each other.
- **Codex findings: FIX / DEFER / REJECT.** FIX resolved autonomously inside approved files and
  contract; DEFER and REJECT each carry a written reason in `review.md`; a finding that triggers a
  STOP is escalated rather than classified.
- **Worker mode policy** — protection tiers (K-1), the three postures with **MANUAL is not STOP**
  (K-2), the six transitions M1–M6 (K-3), and the one-line posture-change note in `plan.md` (K-7).
- **Task folder convention**, extended:
  ```
  work/<capability>/breakdown.md   TRACKED    (only when needed)
  work/<id>/brief.md               TRACKED
  work/<id>/plan.md                untracked
  work/<id>/codex.md               untracked
  work/<id>/qa.log                 untracked
  work/<id>/review.md              TRACKED
  ```
- **Capability Breakdown (optional)** — the entry test; six sections; the nine fixed Current/Change
  Map rows with the `none`/`new`/`modify`/`read` prefix; the allowed/not-allowed boundary; the four
  readiness conditions with *partial readiness is expected*; the three-artifact table including
  **"is a gate: no / yes / no"**; COWORK's three optional situations; parent + sibling children; the
  not-added list; size limits (9 rows, ≤80 lines); the **`Change: none` gap rule** routing to STOP-1.
- **Lessons retention** — the `## Lessons` section in `review.md`; the five tags
  `[covered] [backlog] [rule] [design] [local]`, exactly one per lesson; capturing never expands
  scope; `[rule]`/`[design]` carry destination-ready text and wait for the task that owns the
  destination; **no register, no IDs, no statuses, no new artifact**; pending routing derived
  **on demand** by comparing `review.md` against destination content.
- **Finalization allowance + carve-out**, both sentences:
  > The final commit may include `work/<id>/review.md` and single-line `BACKLOG.md` amendments to
  > items this task references.

  > `BACKLOG.md` is the single named exception to the brief-listing rule. A task may make one-line
  > additions or amendments to `BACKLOG.md` items it references, in its final commit, without
  > `BACKLOG.md` appearing in `brief.md`. Every other unlisted file remains STOP-1.

  **No standing allowance for `AGENTS.md`, `.claude/rules/**`, or `work/<capability>/breakdown.md`.**
- **The fingerprint pairing rule:**
  > Any change that edits `CLAUDE.md` updates its fingerprint in `qa/instruction_layer_offline.js`
  > in the same commit.
- **COWORK**, stated positively: external/vendor research · architecture or reconciliation needing
  broader analysis · a longer design discussion outside an execution session. **Otherwise the Worker
  proceeds directly.** COWORK is never an execution relay.

### 2 · `CLAUDE.md` — two changes, nothing else

- **Pre-flight checklist → once per task.** Replace the "before any code or diff is shown" preamble
  with: produced once per task in `work/<id>/plan.md`, before implementation. **The four items and
  the heading `### Agent Pre-Flight Skills & Goal Checklist` stay verbatim.**
- **Retire ChatGPT handoff mode.** Replace the courier premise with `## Task completion report`,
  keeping the six numbered report fields.

**Four assertions in `qa/instruction_layer_offline.js:124–137` must still pass afterwards** — Git
safety block with both literal commands · `### Active workflow model (simplified, effective
2026-09-18)` plus the literals `AGENTS.md` and `portfolio-skill-router` · the pre-flight heading ·
the `<frontend_aesthetics>` block. **Kept unchanged:** Git safety, protected actions, deployment and
QA policy, current project boundary, frontend aesthetics, FROZEN LEGACY.

### 3 · `qa/instruction_layer_offline.js` — one value

`FINGERPRINTS['CLAUDE.md']` → the sha256 of the edited `CLAUDE.md`, computed after change 2.
**Same commit as change 2.** Nothing else in the file is touched — the router and optimization-rules
hashes and every assertion stay as `41c3945` left them.

### 4 · `.gitignore`

```diff
 work/*/qa.log
+work/*/plan.md
+work/*/codex.md
```

**No `breakdown.md` line** — W-8 tracks it.

### 5 · `.claude/settings.json` — **W-1 and W-7 in one edit**

```diff
 {
   "permissions": {
+    "defaultMode": "acceptEdits",
     "deny": [
+      "Edit(./.claude/settings.json)",       "Write(./.claude/settings.json)",
+      "Edit(./.claude/settings.local.json)", "Write(./.claude/settings.local.json)",
       …7 destructive git ops unchanged…
     ],
     "ask": [
+      "Edit(./CLAUDE.md)",   "Write(./CLAUDE.md)",
+      "Edit(./AGENTS.md)",   "Write(./AGENTS.md)",
+      "Edit(./.gitignore)",
+      "Edit(./.claude/rules/**)",
+      "Edit(./qa/run-offline.js)",
+      "Edit(./netlify.toml)", "Write(./netlify.toml)",
       …all existing ask entries unchanged, including Bash(git commit) and Bash(git commit *)…
     ],
     "allow": [
+      "Bash(npm run test:*)", "Bash(npm run qa:offline)", "Bash(node qa/*_offline.js)",
+      "Bash(git status*)",    "Bash(git diff*)",          "Bash(git log*)",
       …netlify readers unchanged…
     ]
   }
 }
```

### 6 · `.claude/rules/qa-suites.md` — the pilot, exactly one file

```yaml
---
paths: "qa/**"
---
```

Content, from verified repository precedent only: auto-discovery by `qa/run-offline.js`
(`/(_offline|_test)\.js$`, top of `qa/`, **no registration edit**; `qa/lib/**` never discovered) ·
every requirement maps to ≥1 assertion and back · every violable invariant carries a planted
negative whose mutation lands on the production source or its fixture inputs, **never the test** ·
offline means no network, no live provider, no browser · assert against the real production module ·
prefer derived counts over hardcoded expected-count literals.

## Implementation order — three stages, each with its own validation

| Stage | Files | Gate |
|---|---|---|
| **S1 · Contract** | `AGENTS.md` · `CLAUDE.md` · `qa/instruction_layer_offline.js` · `.gitignore` | full `qa:offline` green |
| **S2 · Permissions** | `.claude/settings.json` | JSON parses; rules readable; full `qa:offline` green |
| **S3 · Rules pilot** | `.claude/rules/qa-suites.md` | full `qa:offline` green **+ the loading observation** |

**S1 before S2 is deliberate:** the contract must exist before the permission mode is loosened. A
Worker running autonomously with no written discipline is the risky ordering; the reverse costs
nothing, because the current default still prompts on every edit until S2 lands.

## Validation

**After S1**
- `node qa/instruction_layer_offline.js` → **PASS, 58 checks.** All four `CLAUDE.md` anchors hold and
  the fingerprint matches the edited bytes.
- `npm run qa:offline` → PASS.
- `git diff --stat` → exactly four files.

**After S2**
- `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))"` → no throw.
- `npm run qa:offline` → PASS *(no suite reads `.claude/settings.json`; this confirms no collateral)*.
- `git diff --stat` → exactly one file.
- **Read back** the written file and confirm: `defaultMode` present; both settings paths in `deny`
  with `Edit` and `Write`; six ASK paths present; **`Bash(git commit)` and `Bash(git commit *)` still
  in `ask`**; no existing entry removed.

**After S3**
- `npm run qa:offline` → PASS.
- **Loading observation:** in a fresh session, read any `qa/*_offline.js` file and record in
  `review.md` whether the rule's content was present in context. **PASS = loaded. FAIL = not
  loaded — record it and stop; the remaining two rule files stay out of scope either way.**

**Whole-task, before LAND**
- `npm run qa:offline` green on the canonical Windows host, captured to `work/workflow-migration/qa.log`.
- `git diff --stat` → **exactly six files**, no more.
- `D7-c` is expected to pass on Windows; a failure there is a real finding, not a sandbox artifact.

## STOP conditions

The five standing conditions, and these task-specific instances of them:

1. **Any file outside the six.** In particular: no second rule file, no `land-prep`, no product code,
   no other QA suite. *(The `BACKLOG.md` carve-out below is the only exception, and it is bounded.)*
2. **A `CLAUDE.md` edit that would break any of the four anchors** at
   `qa/instruction_layer_offline.js:124–137` — the contract cannot be satisfied as written; return
   with the specific anchor.
3. **The rules pilot does not load.** Record the observation, do **not** fall back to nested
   `CLAUDE.md` inside this task — that is a scope amendment.
4. **Any requirement here contradicting `AGENTS.md` as it stands** — return the pair.
5. Anything needing a live, production, deployment or Netlify mutation. **None is expected.**

## Lessons and finalization

`work/workflow-migration/review.md` carries a `## Lessons` section using the five tags — **this task
is the first use of the mechanism it installs.**

Under the standing allowance, the final commit may also carry **single-line `BACKLOG.md` amendments
to items this task references** — expected candidates: the rules-pilot outcome, and the deferred
status of `/land-prep` and the remaining two rule files. **One line each, referenced items only.**

## Operational notes

- **`.claude/settings.json` is read at session start.** `acceptEdits` will not take effect during
  this task; the **next** task is the first to run under it. Author S2 complete in one edit — after
  it lands, that file is `deny`-tier for future tasks.
- The three existing `work/*/review.md` files predate the Lessons model and **are not retrofitted**.

## Definition of done

Six files changed, no more. `npm run qa:offline` green on the Windows host with
`instruction_layer_offline` at 58/58. `git commit` still prompts. The rules-pilot loading result —
pass or fail — recorded in `review.md`. `review.md` carries a `## Lessons` section.
