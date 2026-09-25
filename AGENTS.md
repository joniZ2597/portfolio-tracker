# AGENTS.md — Portfolio Tracker / Pulse (simplified workflow)

Shared guidance for Claude Code and Codex on this repo. Effective 2026-09-18, this replaces
the old ARC/registry/claim workflow as the active default (see `CLAUDE.md` FROZEN LEGACY
section for that history).

## Repo orientation

- Single-page app: `index.html` (client), `netlify/functions/` (server functions), `services/`
  (shared server-side helpers).
- `qa/` holds offline QA scripts, one per feature area (`qa/run-offline.js` is the aggregate
  runner).
- `CHECKPOINT.md` is local-only, gitignored legacy historical context from the old ARC
  workflow — useful background, but not authoritative. Current operational truth comes from
  Git (branches, log, diff), active worktrees, task evidence, and QA/review results — and the
  `work/<id>/` task-folder convention (see "Task folder convention" below). Never commit or
  recreate `CHECKPOINT.md` elsewhere.
- Task branches/worktrees should normally be based on `branch-dev`, the integration branch.
  Moving anything to `main`/production always requires separate, explicit Owner approval.
- `BACKLOG.md` is the canonical product backlog / queue of intent. It does not override Git,
  active worktrees, task evidence, QA, or review evidence as operational truth.

## Task brief convention

Before implementing, state in plain language: what file(s) will change, the smallest scoped
diff that satisfies the request, and how it will be validated. See "Task folder convention"
below for how this becomes an Owner-approved `work/<id>/brief.md`.

**QA suites that read in-scope files as text:** `<list or none>`, and whether their assertions
survive. *(Dependency sweeps that check only `require()`/import miss this class — a suite can
read a file it never imports.)*

## Worker execution contract

Once a tracked, Owner-approved `brief.md` exists, the Worker executes the whole task inside
that scope and returns to the Owner only at commit approval, LAND, or on a STOP condition
below.

**Before writing any implementation code:**

0. **Worktree bootstrap — automatic, pre-authorized.** Confirm the session's cwd is the assigned
   Worker slot (see "Worker slot model") with the task branch checked out. If `node_modules/`
   is missing or older than `package-lock.json`, run `npm ci` (it touches only the gitignored
   `node_modules/`). Then run `npm run qa:offline` once, before any edit, and record the result
   and suite count on the first line of `work/<id>/qa.log` as the pre-edit baseline every
   Definition of Done is measured against. A red pre-edit baseline is an **M4** transition
   (diagnose first), not a STOP. A harness permission prompt for any of these steps is answered
   under this authorization; it is not an Owner decision.
1. **Requirement → test map.** Every requirement in the brief maps to at least one named
   assertion, and every assertion maps back to a requirement. Write it to `work/<id>/plan.md`.
   An orphan test is drift; an unmapped requirement is an untested requirement.
2. **Conventions: followed and overridden.** Name the repository patterns this task follows,
   by file and function — and name every convention the brief **deliberately overrides**.
   **The brief wins over repo precedent.** Importing a convention the brief overrode is a
   defect, not a default.
3. **Tests first.** Write the assertions and watch them fail before the implementation exists.

**Then, autonomously and without Owner approval, inside the approved file set:**

4. Implement.
5. Run the targeted `test:<area>` script(s) until green.
6. Fix what the tests find. Ordinary implementation decisions are the Worker's.
7. **Fresh-context self-review** — re-read the brief and the complete diff as if seeing them
   for the first time, against the requirement→test map. Record what changed as a result.
8. **Codex review on the real diff** (never on a plan or a description). Capture the raw
   response verbatim in `work/<id>/codex.md`.
    - **The Worker launches the separate Codex read-only review process itself.** The review is
      independent and read-only; it inspects the actual diff, the brief, the review artifact and
      the QA evidence. **This is the default for every Worker task.** If a task genuinely cannot
      launch a separate Codex review process, **the brief must state that exception and its
      reason** — it is not decided at execution time.
9. Classify every finding **FIX / DEFER / REJECT** (see "Codex findings" below) and resolve
   every FIX autonomously.
10. Run full `npm run qa:offline`.
11. Write `work/<id>/review.md`.
12. Run one final lightweight Codex check against the task diff (the sole, authoritative
    "complete final diff" defined under "Codex as diff reviewer" above) — since `review.md`'s
    own content, and any late touch-ups it prompts, have not yet been reviewed. Classify every
    finding before editing.
    - **Class I** (implementation, scope, security, correctness, or brief conflict): FIX /
      DEFER / REJECT as above. A FIX to an implementation file re-runs the relevant QA and gets
      one more Codex pass **scoped to the changed hunks only** — a deliberate, narrower
      exception to "Codex must receive every part of whichever diff applies," which governs the
      task-diff check this step opens with, not this follow-up re-pass. **This final-check
      Codex pass, and the one scoped re-pass a Class I FIX may earn, are the only Codex rounds
      this step performs** — step 8's earlier implementation-diff review is a separate, prior
      round and is not counted against this limit. Findings from the scoped re-pass are
      classified under the same FIX/DEFER/REJECT rule: DEFER and REJECT close normally. If the
      scoped re-pass finds a new Class I FIX requiring another implementation change, do not
      apply it and do not start a third Codex round. Record it in `review.md` as an unresolved
      Class I finding and surface it at the existing commit-approval boundary (step 13) for
      Owner ruling — this does not create a new return point; it is a STOP only if one of
      STOP-1..5 independently applies. Record one line in `review.md` for a round with at least
      one class-I finding and no class-II findings: `Final check: N rounds, M class-I findings —
      X FIX, Y DEFER, Z REJECT, U unresolved; QA/re-pass performed where required; no class-II
      findings.`
    - **Class II** (documentation-only, in `review.md`): fix, then self-check — every
      `work/<id>/` path named exists and is one of the five canonical files; every count
      matches a line in `qa.log`; no section reads "Pending" or "TBD" (a lesson line matching
      `[backlog] <lesson text> — pending routing` is exempt) — and record one line in
      `review.md`: `Final check: N rounds, M class-II findings fixed, self-checked; no
      implementation change, no QA re-run.` **No further Codex.**

    A class-II fix that changes a claim about the implementation — a DoD tick flips, a file
    count changes, a finding is reclassified — is class I by definition: it re-enters step 9's
    FIX/DEFER/REJECT rule, including the QA re-run and the one scoped Codex re-pass a FIX earns,
    before `review.md` is finalized. It does not resolve silently inside the class-II
    self-check. **When a round mixes both classes, the summary line states the class-I outcome
    instead of the class-II line above** — e.g. `Final check: N rounds, M class-II findings
    fixed, 1 reclassified class-I (QA re-run + scoped Codex re-pass), self-checked.` **Three
    summary-line forms exist — class-II-only (above), mixed (above), and pure class-I (in the
    Class I bullet above)** — each used only for the round shape it names; the unmodified
    class-II line is used only for a round with zero class-I findings or reclassifications.

12a. **STOP BEFORE COMMIT.** When the final Codex check returns **PASS**, report the final
     implementation / QA / Codex state to the Owner and **halt**. This is a return point, not a
     pause inside a continuous run: the Worker does not carry on into step 13 as one motion.
     The commit gate itself is unchanged and lives in step 13 and "Protected actions" — **12a
     adds the halt and the report; it does not restate the commit rule.**

**Then, at the commit boundary — never autonomous:**

13. Prepare the task for its final commit (implementation + `review.md`), then request Owner
    commit approval for the exact scope. `git commit` stays `ask`-tier — see "Protected
    actions". Commit only after that approval, then request LAND.

**The Owner does not approve individual file edits, inspect code previews, relay Codex
findings, or decide ordinary in-scope implementation questions — commit approval and LAND
approval remain the Owner's, as they already are under "Protected actions" and "Owner LAND /
SHIP boundaries" below.**

**The Owner is never a relay for review context.** Diff, brief, QA evidence, `codex.md` and any
other review material are provided by the Worker directly to the Codex review process. The Owner
is not asked to copy them into a separate conversation when the Worker can supply them itself.

## Worker mode policy

The Worker runs in one permission mode for the whole session — `acceptEdits`. PLAN and MANUAL
are **postures the Worker adopts**, not modes it switches to; nothing stops a Worker that
ignores them except review.

### Protection tiers — the enforced layer

| Tier | Rule | Files | Rationale |
|---|---|---|---|
| **DENY** — never modifiable by a task | `deny` | `.claude/settings.json` · `.claude/settings.local.json` | The privilege-escalation surface, and only that. A task that can edit its own permissions has no permissions |
| **ASK** — sensitive, legitimately editable | `ask` | `CLAUDE.md` · `AGENTS.md` · `.gitignore` · `.claude/rules/**` · `qa/run-offline.js` · `netlify.toml` · `work/*/brief.md` (once approved/committed) | Real tasks edit these. `ask` prompts even under `acceptEdits` — one confirmation for a file that deserves one, no prompt for ordinary work |
| **ACCEPT EDITS** — ordinary | *(mode default)* | everything else in the approved brief | Autonomous |

**The brief-listing rule:** an ASK-tier file may be edited only if the approved `brief.md`
lists it by path. Listed → the Worker adopts the MANUAL posture for that edit, answers the
prompt, continues — no STOP unless one of the five real STOP conditions fires independently.
Not listed → **STOP-1**, edit outside approved scope. The Worker does not amend its own scope.

### Working postures — the behavioural layer, not enforced

| Posture | What the Worker does | Enforced by |
|---|---|---|
| **PLAN** | Reads, traces, builds the requirement→test map. Writes no code | nothing — discipline |
| **ACCEPT EDITS** | Implements autonomously inside the approved file set | the mode + the approved brief |
| **MANUAL** | Slows down: one edit at a time, re-reads the surrounding contract first | `ask` rules, for ASK-tier files. Discipline elsewhere |

**MANUAL is not STOP.** MANUAL means the Worker proceeding more carefully. STOP means
returning to the Owner, and happens only on the five STOP conditions below. A Worker that hands
back on every MANUAL transition rebuilds the courier problem.

### Transitions — six

| # | Trigger | → Posture | What the Worker does |
|---|---|---|---|
| **M1** | Task start, approach not trivial — more than one file, a new module, or any requirement without one obvious assertion | **PLAN** | Build the requirement→test map and the conventions-followed/overridden list in `plan.md`. No code. *(Trivial tasks skip straight to implementation — the map is still written, it is just short.)* |
| **M2** | `plan.md` complete: every requirement mapped, every override named | **ACCEPT EDITS** | Before the first implementation edit, confirm `work/<id>/brief.md` is tracked (`git ls-files work/<id>/brief.md` non-empty) and unmodified (`git status --short work/<id>/brief.md` empty). Then: failing tests first, then implement |
| **M3** | Two consecutive fix attempts fail on the same assertion | **PLAN** | Stop editing. Re-derive the cause from source before touching anything else |
| **M4** | An unexpected QA failure — a suite the task did not touch, or a failure class not seen before | **PLAN** | Diagnose first. Do not "fix" a suite you do not yet understand |
| **M5** | Next edit touches an ASK-tier file, or an architecture / security / contract surface — auth or token path, gate predicate, persisted shape, public contract, scoring or persistence boundary | **MANUAL** | One edit at a time. ASK-tier files also produce a real prompt |
| **M6** | Repository evidence conflicts with the approved brief | **MANUAL**, then assess | Record the conflict. Brief merely more specific than precedent → the brief wins, continue. Brief cannot be satisfied as written → **STOP-2** |

**Codex findings** are handled by the existing FIX / DEFER / REJECT rule, not by a transition:
classify before editing, then resolve FIX findings under M2 or M5 as their surface dictates.

**Announcing a posture change:** one line in `plan.md` naming the trigger — e.g. `M3: two
failed attempts on RD-7, back to PLAN`. Not a question to the Owner, not a status field, not a
state file. Its purpose is that `review.md` can show why the task moved as it did.

## Worker STOP conditions — the complete list

The Worker stops and returns to the Owner **only** when one of these is true:

1. A required edit falls **outside the approved scope or file set**.
2. The **approved contract cannot be satisfied as written**. A brief whose *wording*
   mis-measures a condition the implementation plainly meets is not this condition. Record the
   reading used and continue; the Owner sees it at commit approval. STOP-2 is reserved for a
   brief whose **intent** cannot be met.
3. A **security assumption in the brief conflicts with repository or vendor evidence**.
4. A required test or action needs a **live, production, deployment, or other protected
   mutation**.
5. **Two approved brief requirements contradict each other.**

Anything else is the Worker's to decide. A STOP names the condition, the evidence, and the
smallest decision that would clear it.

## Codex findings — FIX / DEFER / REJECT

The Worker invokes Codex itself after implementation and classifies each finding:

| Class | Meaning | Action |
|---|---|---|
| **FIX** | correct, and resolvable inside the approved files and contract | resolve autonomously; re-run targeted QA |
| **DEFER** | correct, but outside this task's approved scope | record in `review.md` with the reason and where it belongs |
| **REJECT** | not correct, or does not apply | record in `review.md` with the reason it does not apply |

**Every DEFER and REJECT carries a written reason.** A finding that triggers a STOP condition
is escalated rather than classified. The Owner does not relay findings.

## Capability Breakdown (optional)

An optional artifact for a backlog item that cannot yet be honestly written as a brief:

```
Breakdown  resolves uncertainty
Brief      locks scope
/plan      decides implementation
```

**Not a mandatory stage.** The entry test is mechanical — can exact files expected to change,
and testing coverage required, already be filled in? If yes, skip straight to a brief. **If the
Domain logic trigger below fires, a Breakdown is required before the brief: testing coverage
cannot be filled in honestly until the rulings it depends on exist, so the entry test fails.**

**Structure — six sections:** Outcome · Current/Change Map (mandatory whenever a Breakdown
exists) · Decisions · Unknowns/Gaps · Split/Dependencies · Not in v1 — **plus `## Domain
logic` when its trigger fires (below).**

**Current/Change Map — nine fixed rows, every row present** (Client · Server functions ·
Storage/schema · Scores/Actionable Take · Persistence · Gates/environment · QA ·
Deploy/external · Docs). `Change` must begin with exactly one of `none` · `new` · `modify` ·
`read`, then a short noun phrase. The empty rows are the point — they are where "we never
thought about persistence" becomes visible.

**Domain logic — trigger.** Every Breakdown answers five questions. Does the capability:

- create or change a user-visible category vocabulary;
- create or change an inclusion rule — materiality, relevance, freshness, semantic dedup;
- affect scoring, ranking, recommendations, or Actionable Take;
- map external data into internal meaning;
- define something competent domain readers could reasonably disagree on?

Any YES → the Breakdown carries a `## Domain logic` section. All NO → the Breakdown **must**
record this exact line in its place: `Domain logic: none, engineering-only`. Silence is not
an answer.

**`## Domain logic` — compact.** It holds: vocabulary and definitions · inclusion and boundary
rules · overlap/precedence where two rules can both apply · numbered Owner rulings `DR-1`,
`DR-2`, … · a positive and a negative or boundary example per ruling · and, for each ruling
that is mechanically testable, the QA fixture or test it maps to. **A ruling that governs model
or human judgment gets no invented fixture** — mark it `pilot` or `human review`; a unit
fixture for a judgment rule is an over-claim, not coverage. Independent model challenge of the
rulings is risk-based and Owner-directed, never required.

**Boundary — system level, and it holds:**

| Allowed | Not allowed |
|---|---|
| component names | function names |
| directory-level surfaces | line numbers |
| one-file component names where the file *is* the component (`index.html`) | helper design |
| dependencies | test IDs — except the Domain logic fixture mapping |
| Owner decisions | requirement→test map |
| external blockers | implementation order inside a task |
| which child touches which surface | *how* to implement |

Everything in the right column belongs to Worker `/plan`.

**Readiness for a child brief** — all four must hold for that child: every map row it touches
has a concrete Change entry, not a question · every Decision it depends on
**(including every `DR-n` ruling)** has an Owner answer · every Unknown it depends on is
resolved, or moved to Not in v1 · its dependencies are landed, or intentionally being briefed
ahead of it. **Partial readiness is the expected case** — a capability does not need every
child resolved before the first child starts.

**The three artifacts, side by side:**

| | Breakdown | Brief | Worker `/plan` |
|---|---|---|---|
| **Holds** | system picture · uncertainty · Owner decisions · **domain rulings (`DR-n`)** · gaps · task split · dependencies · exclusions | exact files · exact contract · exact scope · exact exclusions · exact QA coverage · resolved decisions restated as facts · context/deps refs | implementation approach · requirement→test map · precedent files · conventions followed/overridden · execution order · QA triage · implementation detail |
| **Level** | system | file | function |
| **Tracked** | yes | yes | no |
| **Is a gate** | **no** | **yes** — the only scope approval | no |

**Multi-task capability** — children are sibling folders (`work/<child-1>/brief.md`,
`work/<child-2>/brief.md`, …), not nested; each runs the ordinary execution path. Explicitly
not added: parent lifecycle state · status fields · ARC IDs · registry · claim or mutex ·
readiness verdicts · any stored workflow state. Progress is derived from Git and the files
present.

**Size limits:** map rows fixed at 9 (10 only if a genuinely new surface appears); whole
breakdown ≤ 80 lines. **`## Domain logic` stays compact: narrative short, one row per ruling.
Its `DR` table may extend past the 80-line limit when necessary; there is no other
exemption.** Over that, materially — in the six sections or in Domain logic — reassess whether
this is actually two capabilities.

**The gap rule:** if Worker `/plan` **or implementation** discovers that a surface recorded as
`Change: none` must in fact change, **or meets a category, materiality, overlap, or other
domain case the approved `DR-n` rulings do not cover,** that is a scope conflict, not a
discovery to absorb — do not silently expand **and do not guess**; route back and update the
Breakdown and the affected Brief, under **STOP-1**.

## Lessons retention

`work/<id>/review.md` carries a `## Lessons` section, the unconditional capture point:

```markdown
## Lessons

- [covered]  <lesson> — already covered by <where>
- [backlog]  <lesson> — belongs in BACKLOG.md
- [rule]     <lesson> — destination-ready rule text for AGENTS.md or .claude/rules/**
- [design]   <lesson> — destination-ready capability/design text for
             work/<capability>/breakdown.md
- [local]    <lesson> — true only of this task; no destination
```

**Exactly one routing tag per lesson.** Capturing a lesson never expands task scope — writing
it down is free; acting on it is not.

| Tag | Means | Acted on |
|---|---|---|
| `[covered]` | an existing rule/doc already says this | never — it is a confirmation |
| `[backlog]` | product or workflow work | now, under the standing finalization allowance below |
| `[rule]` | destination-ready rule text for `AGENTS.md` or `.claude/rules/**` | later, by the task that owns that destination |
| `[design]` | destination-ready capability/design text for `work/<capability>/breakdown.md` | later, by the task that owns that destination |
| `[local]` | true of this task only | never |

`[rule]` and `[design]` lessons carry destination-ready text in `review.md` — written so the
future task can lift it, not re-derive it — and wait. **Neither destination is edited by the
current task unless it is separately in that task's approved scope.** No central register, no
IDs, no statuses, no new artifact. The lesson lives in the task's own review and nowhere else.
Pending routing is derived on demand — grep each tracked `work/*/review.md` for `[rule]`/
`[design]` lessons whose destination-ready text is absent from the named destination — not by
any scheduled or nightly process.

## Finalization allowance

A task's final commit may include `work/<id>/review.md` and single-line `BACKLOG.md`
additions/amendments for backlog items this task references.

**`BACKLOG.md` is the single named exception to the brief-listing rule.** A task may make
one-line additions or amendments to `BACKLOG.md` items it references, in its final commit,
without `BACKLOG.md` appearing in `brief.md`. Every other unlisted file remains STOP-1.

An explicit "not in scope" exclusion in the approved brief overrides this allowance. Under such
a brief a `[backlog]` lesson is recorded in `review.md` as `[backlog] <lesson text> — pending
routing` and is not acted on by the task.

No standing allowance exists for `AGENTS.md`, `.claude/rules/**`, or
`work/<capability>/breakdown.md`. Those wait for a task that owns them.

## The fingerprint pairing rule

Any change that edits `CLAUDE.md` updates its fingerprint in `qa/instruction_layer_offline.js`
in the same commit.

## COWORK

Use COWORK for a Breakdown, or for a broader question, only when: external or vendor research
is needed · architecture or reconciliation needs broader analysis · the Owner wants a longer
design discussion outside an execution session. **Otherwise the Worker proceeds directly.**
COWORK is never an execution relay.

## Task folder convention

Each implementation task uses `work/<id>/`, where `<id>` is a stable slug derived from the task's
branch name `task/<id>` (e.g. `work/p7-a2-news-catalysts/`, `work/tradingview-alerts/`). No
centrally allocated id, no lookup table, no registry.

- `brief.md` (tracked) — the Owner-approved task scope: what file(s) will change, the
  smallest scoped diff, how it will be validated. It may be drafted directly at
  `work/<id>/brief.md` before approval — the required sequence is: draft `work/<id>/brief.md`
  → Owner reviews the exact current contents → Owner approves the exact brief-only commit →
  commit it unchanged → implementation may begin. **An uncommitted or merely staged brief does
  not authorize implementation** — only the tracked, committed brief whose exact contents were
  Owner-approved does.
- `plan.md` (untracked, gitignored via `work/*/plan.md`) — the requirement→test map and the
  conventions-followed/overridden list. Written before implementation begins.
- `codex.md` (untracked, gitignored via `work/*/codex.md`) — the raw Codex review output,
  verbatim. Never reconstructed or paraphrased; if a review was not captured, the file says so.
  The final Codex check's raw output is appended to `codex.md` under `## Final check`.
- `qa.log` (untracked, gitignored via `work/*/qa.log`) — raw output from targeted/full QA runs
  for this task.
- `review.md` (tracked) — final evidence: QA result, Codex outcome, and the FIX / DEFER /
  REJECT ledger with a reason for every DEFER and REJECT. Populated after Codex reviews the
  implementation diff and any required fixes/QA re-runs are done; then one final lightweight
  Codex check runs against the task diff (see "Codex as diff reviewer" for its authoritative
  definition), so the complete final diff — including `review.md` itself — is reviewed before
  it is committed.
  `review.md` is committed in the same commit as any final implementation touch-ups — that
  commit's Owner approval and the separate, later Owner LAND approval are two distinct events,
  never conflated even when they happen close together. `review.md`'s "Files changed" section
  uses this fixed two-row shape:

  ```
  ## Files changed
  - Implementation (N): <paths>     ← must equal the brief's Implementation scope
  - Evidence (tracked): work/<id>/brief.md, work/<id>/review.md
  ```

**These five files are evidence and scope, and the set is closed — no sixth evidence file, and
no name variants (no `codex-final.md`, no `qa-post-edit.log`). None of them carries status,
state, or lifecycle.**
The only operational meaning of a tracked, committed `brief.md` is that implementation may
begin within its exact approved scope. `review.md` is evidence only and authorizes nothing.
Commit, LAND, and SHIP still require their explicit Owner decisions. No registry, claim, or
mutex exists anywhere in this convention.

## Test commands

- During implementation: run the targeted `test:<area>` script(s) in `package.json` relevant to
  the area being touched.
- At LAND: `npm run qa:offline` is the required full-suite gate, plus any additional targeted
  tests still relevant to the change. The full suite is not required before every intermediate
  functional commit — only at LAND.
- `npm run test:qa` — Playwright browser QA, used only when browser-level verification is
  needed.

## Codex as diff reviewer

Codex reviews the actual diff, not a plan or a description of intended changes. Before asking
for a Codex review, make the actual implementation diff available in the task working tree or
task branch, then give Codex the real diff (`git diff`, commit, or branch comparison). Codex
review normally happens before LAND.

**Two diffs.** Both compare `<base>` — the `branch-dev` commit named in the brief — against the
current working tree, covering committed, staged, and unstaged tracked changes, **and** any new
untracked in-scope files; neither diff is ever taken against `HEAD` alone, and neither omits an
untracked file just because it is new. Untracked coverage is always scoped to named paths —
never a repo-wide untracked scan, which would pull in unrelated local/untracked files (a stray
`.claude/settings.local.json`, an unrelated in-progress skill folder, etc.).

**Implementation diff** — tracked portion: `git diff <base> -- . ':(exclude)work/'
':(exclude)BACKLOG.md'`; untracked portion: `git ls-files --others --exclude-standard --`
followed by the exact paths named in the brief's Implementation scope, with each listed file's
contents. Every "Implementation scope" and "Definition of done" statement, and the
implementation Codex review (step 8/9), refer to this diff — tracked and untracked parts
together.

**Task diff** — the complete implementation diff, plus tracked task evidence intended for
repository history: `git diff <base> -- work/<id>/brief.md work/<id>/review.md`; if `review.md`
is still untracked at final-review time, its contents are included directly (this is how a
still-untracked `review.md` reaches the final check); plus any permitted `BACKLOG.md` change.
`plan.md`, `codex.md`, and `qa.log` stay untracked/gitignored task evidence — available as
supporting evidence but not part of the task diff. The final Codex check (step 12), the commit
request and the LAND request refer to the task diff; it is the sole, authoritative definition of
"the complete final diff" wherever that phrase is used — nothing else defines it separately.

**Codex must receive every part of whichever diff applies** — the tracked diff and the
untracked in-scope files' contents — never the tracked diff alone. A brief never needs to name
its own `brief.md` or `review.md` in its implementation scope — they are evidence, outside the
implementation diff by definition. **This changes no permission:** `work/*/brief.md` remains
ASK-tier and the brief-listing rule is unchanged. The governed commit shape requires a
brief-only commit, then a final implementation + `review.md` commit (+ permitted `BACKLOG.md`
one-liners) — this does not imply the task's history contains only two commits total;
intermediate functional commits before the final commit are unaffected, per "Test commands"
above.

## Owner LAND / SHIP boundaries

- **LAND** (integrate the reviewed task into `branch-dev`): requires `npm run qa:offline`
  passing, a clean `git status`, and a reviewed diff (Codex or Owner). Claude Code may prepare
  and request LAND; it does not decide LAND is done — the Owner confirms.
- **SHIP** (`branch-dev` → `main`/production): always requires explicit, separate Owner
  approval, on top of a landed and QA'd `branch-dev` state. Never bundled with a LAND approval.

## Protected actions (always require explicit Owner approval)

- Any edit, merge, checkout, reset, or deploy touching `main`/production.
- `git push`, force-push, or any destructive Git operation (`reset --hard`, `clean -f`,
  `branch -D`, etc.).
- Every Netlify write requires explicit Owner approval — including deployments, branch
  deploys/previews, environment-variable changes, and any other Netlify mutation. Read-only
  Netlify inspection does not require approval.
- Live external API canaries (SEC, Perplexity, or similar).
- Committing — Claude Code prepares and requests, the Owner approves the exact scope.

## Worker slot model

- Parallel work uses two **permanent** worktree paths — Worker slots — beside the main checkout:
  `pt-wt-worker-a` and `pt-wt-worker-b`. No registry, claim file, or mutex; a slot is just an
  isolated checkout.
- Slot paths are **reused between Slices**. Do **not** create a new filesystem worktree path per
  Slice (no per-task `git worktree add`), and do not remove a slot when its Slice lands.
- Task branches remain **per Slice** (`task/<id>`): created from the current `branch-dev` and
  switched to inside the assigned slot (`git -C <slot> switch -c task/<id> <base>`). A slot is
  switched only when its working tree is clean.
- One Slice per slot at a time; do not stack unrelated work on a slot's task branch. Between
  Slices a slot sits detached and clean at `branch-dev`.
- A slot keeps its `node_modules/`; step 0 of the Worker execution contract refreshes it when it
  is missing or older than `package-lock.json`.
- LAND, push, and every other protected action are unchanged (see "Owner LAND / SHIP boundaries"
  and "Protected actions").
