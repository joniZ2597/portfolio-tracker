# Plan Validation — P-V1 through P-V15, P-V21 through P-V26

Binding reference for `/arc-publish-plan`. Every rule below is checked before anything is
written. **Refusal is atomic: on any failure, nothing is created, nothing is renamed, and
`current.json` is untouched.**

Rules are numbered so a review can be mechanical. When reporting a refusal, quote the rule
id and the exact offending value — never a paraphrase. P-V16 … P-V20 are reserved for
Increment 2 (`--arc`).

## Ordering

P-V12 and P-V14 run **before** the mutex is acquired, so a bad path or a stale source costs
nothing. P-V1 … P-V9, P-V15 and P-V21 … P-V26 are **computed by the resolver at step 5,
before the owner types `CONFIRM`** (`scripts/resolve-profiles.js` →
`scripts/lib/profile-contract.js planCheck`), so the projection prints their results, the
PROFILES section and any P-V25 lock-out. With `--runtime-root` the resolver also performs,
**read-only and before `CONFIRM`**, the P-V11 existence check and the P-V13 live-claim scan.
`CONFIRM` is requested **only after** the full projection and every validation result have
been shown; a refusal at step 5 ends the run before any `CONFIRM` prompt. P-V10, P-V11 and
P-V13 are settled authoritatively against git and the runtime after `CONFIRM` (steps 6–7),
where the step-5 results are recorded alongside them.

| Phase | Rules |
|---|---|
| Pre-mutex | P-V12, P-V14, main-worktree assert (`publish-protocol.md` step 0) |
| Step 5 — resolver, **before `CONFIRM`** | P-V1 … P-V9, P-V15, P-V21 … P-V26 (computed and printed); P-V11 existence + P-V13 scan read-only when `--runtime-root` is given |
| Post-`CONFIRM` (steps 6–7, authoritative) | P-V10, P-V11, P-V13; step-5 results recorded |

---

## P-V1 · Source parses; every task carries the mandatory fields

Each task must carry `id`, `lane`, `entryMode`, `requiresOwnerGo`, and `closeCondition`.

**Detect:** validate the projection against `references/schemas/plan.schema.json`.

**Reject:** `P-V1 REFUSED - task <id> is missing required field <field>`

If a field cannot be determined from the source, refuse. **Never infer a value.** A guessed
`requiresOwnerGo` or `mutexes` entry silently removes an approval boundary.

## P-V2 · Task ids unique, normalized, filesystem-safe

Each `id` must be uppercase, start and end alphanumeric, match
`^[A-Z0-9]([A-Z0-9._-]*[A-Z0-9])?$`, be at most 64 characters, and be unique under
**case-folded** comparison.

Rejected outright:

- Windows reserved device names: `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`
- Any id beginning `__` — reserved for the non-task holders `__PUBLISH__` and `__OWNER__`
- Trailing dot or trailing hyphen — NTFS-hostile
- Any whitespace, or any character outside `A-Z 0-9 . _ -`

**Why case-folded:** NTFS is case-insensitive, so `p5-step4` and `P5-STEP4` would collide as
directory names while comparing unequal as strings.

**Reject:** `P-V2 REFUSED - task id "<id>" <reason>`

## P-V3 · Lane is valid; HERDR is rejected

`lane` must be one of `MAIN`, `LAB`, `COWORK`, `OWNER`.

`HERDR` is **rejected at publish time**. Herdr hosts and launches worker conversations; it
is never an execution lane, never claims a task, and never holds a mutex (contract
principle 4). A Herdr-launched worker is a MAIN, LAB, or COWORK worker like any other.

Lane `OWNER` is publishable but **not workable** — `/arc-worker` accepts only `MAIN`, `LAB`,
and `COWORK`. OWNER tasks exist in the plan for dependency and mutex bookkeeping; their
classes are acquired through the owner-ops ACQUIRE procedure using holder id `__OWNER__`.

**Reject:** `P-V3 REFUSED - task <id> declares lane "<lane>"; HERDR is not an execution lane`

## P-V4 · Entry mode is DIRECT or PLAN

**Reject:** `P-V4 REFUSED - task <id> declares entryMode "<value>"`

This value is the sole source of DIRECT-vs-`/plan` routing. A worker may never upgrade or
downgrade it.

## P-V5 · Every referenced mutex class exists in the registry

The registry is **closed**. A task may not reference a class absent from it, and a
case-variant of a registry entry is not a match.

| Canonical class | On-disk directory |
|---|---|
| `AUTHORITY:published-plan` | `AUTHORITY__published-plan` |
| `CODE:index-html` | `CODE__index-html` |
| `CODE:netlify-functions` | `CODE__netlify-functions` |
| `DEPLOY:netlify` | `DEPLOY__netlify` |
| `EXTERNAL:live-provider` | `EXTERNAL__live-provider` |
| `QA:browser-runtime` | `QA__browser-runtime` |
| `RUNTIME:gates` | `RUNTIME__gates` |
| `RUNTIME:owner-profile` | `RUNTIME__owner-profile` |

### NTFS encoding rule — binding

`:` is **not a legal NTFS filename character**; it is the alternate-data-stream separator.
A directory named with the raw canonical string cannot be created on this machine — the
colon form appears **only** inside JSON values, never in a path.

- **Directory name** = canonical class string with `:` replaced by `__`
- **Acquisition order is computed on the *unencoded* string**, ASCII byte order, and only
  then is each name encoded

The sort-before-encode rule is defensive. `:` is `0x3A` and `_` is `0x5F`, so a pair such as
`CODE:x` and `CODEX:a` would reorder under encoding. No such pair exists in the current
registry; the rule exists so a future class addition cannot silently change acquisition
order and reintroduce the deadlock that canonical ordering prevents.

**Build-stability rule.** Any task requiring a stable running build acquires
`CODE:index-html` **in addition to** `QA:browser-runtime`. Browser QA against a build being
edited validates a moving target. Plain `mkdir` on two distinct class directories both
succeeds, so this exclusion must be expressed as a shared class — as prose it would be
unenforced.

**Reject:** `P-V5 REFUSED - task <id> references unknown mutex class "<class>"`

## P-V6 · Every dependency references an existing task id

**Reject:** `P-V6 REFUSED - task <id> depends on "<missing>", which is not a task in this plan`

## P-V7 · No dependency cycles

**Detect:** depth-first search over `dependsOn`; report the full cycle path.

**Reject:** `P-V7 REFUSED - dependency cycle: <A> -> <B> -> <A>`

## P-V8 · `mustNotParallelWith` is symmetric

If A excludes B, B must exclude A.

**Reject:** `P-V8 REFUSED - <A> excludes <B> but <B> does not exclude <A>`

Pairwise exclusion lists do not compose and must be maintained by hand. Mutex classes are
symmetric by construction and are the preferred expression of the same constraint.

## P-V9 · Mutex and parallel-set consistency

Two tasks sharing any mutex class may not appear in the same declared safe-parallel set,
and may not list each other in `mayParallelWith`.

**Detect:** for each set, intersect every task pair's mutex arrays; any non-empty
intersection fails.

**Reject:** `P-V9 REFUSED - set "<name>": <A> and <B> both require <class>`

> This rule has already earned its place. Applied to the 2026-08-15 execution plan it failed
> SAFE PARALLEL SET 4, which listed P-4A browser QA and Call-2 gate-on QA together — both
> require `QA:browser-runtime`. A defect caught by the contract before any code existed.
> The plan now carries SET 4A / SET 4B, strictly sequential.

## P-V10 · `repoRef` recorded and matching the branch head

**Detect:** compare the projection's `repoRef` against `git rev-parse HEAD`.

**Override:** `--allow-ref-mismatch`, recorded as `refMismatchAcknowledged: true`.

**Reject:** `P-V10 REFUSED - plan repoRef <a> does not match HEAD <b>`

## P-V11 · `planId` does not already exist

Snapshots are immutable. A change is a new id, never an edit.

**Detect:** `plans/<planId>` must not exist, and neither may `plans/.staging-<planId>`.

**Reject:** `P-V11 REFUSED - plans/<planId> already exists; snapshots are immutable`

A leftover staging directory means an earlier publish was interrupted. Do not reuse or
overwrite it — report it for owner disposition.

**Reserved ids.** `plans/arcs/` — the per-ARC pointer container of Increment 2 — shares the
`plans/` namespace with snapshot directories, and `arcs` matches the `planId` pattern. `arcs`
is therefore a reserved `planId`, refused explicitly with its own reason string rather than
by the "already exists" check — the same treatment the task-id vocabulary gives
`CON`/`PRN`/`AUX`/`NUL` and the `__` prefix.

**Reject:** `P-V11 REFUSED - planId "arcs" is reserved for the plans/arcs/ pointer container`

## P-V12 · Source path is repo-relative, no traversal

The path must match `^\.ai-reports/[A-Za-z0-9._/-]+\.md$` **after** normalization, and the
resolved absolute path must remain inside the repository's `.ai-reports/` directory.

Rejected: any absolute path, any drive letter (`C:`), any leading `/` or `\`, any `..`
segment, any symlink that escapes the directory, and any UNC path.

**Reject:** `P-V12 REFUSED - source path "<path>" is not a repo-relative .ai-reports path`

Runs **before** the mutex is acquired, so a bad path costs nothing.

## P-V13 · No live claims against the outgoing plan

Live states are `CLAIMED`, `WAITING_OWNER_GO`, `AUTHORIZED`, and `BLOCKED`.

**Detect:** read every `claims/*/claim.json`; collect those whose `planId` equals the
outgoing `current.json.planId` and whose state is live.

**Override:** `--acknowledge-live-claims`. With it, each is copied into
`carriedOverClaims[]` and `claim.json` is **left byte-unchanged**.

**Reject:** `P-V13 REFUSED - <n> live claim(s) against plan <id>: <TASK-A> (CLAIMED), ...`

Publication never rewrites a claim under any flag.

## P-V14 · Source is not older than CHECKPOINT.md

**Detect:** `mtime(CHECKPOINT.md) > mtime(<source>)` fails.

**Override:** `--acknowledge-stale-source`, recorded as `staleSourceAcknowledged: true`.

**Reject:**

```
P-V14 REFUSED - stale source
  source     <path>  <mtime>
  CHECKPOINT.md      <mtime>   <- newer
CHECKPOINT may record state this plan does not.
Reconcile the plan, or re-run with --acknowledge-stale-source
```

**Detects one direction only.** A source *newer* than CHECKPOINT is **not** evidence of
reconciliation — an edit to an unrelated section moves the mtime while the stale section
survives. A P-V14 pass must never be read as an all-clear.

**Why the rule exists.** On 2026-08-15 CHECKPOINT recorded P-5 Step 4 as CLOSED while the
execution plan still listed it as READY and current-N. P-V10 did not catch it: the plan's
`repoRef` matched HEAD exactly. Content staleness and ref staleness are different failures.

Runs **before** the mutex is acquired, so a stale source costs nothing.

---

## P-V15 · Conditions are literal, never pointers

Every task's `closeCondition`, and its `stopCondition` when present, must be the **literal
executable condition text**. A reference to where the condition lives is not a condition.

**Detect** — apply to each value after stripping markdown emphasis and backticks:

| # | Reject when the value | Example |
|---|---|---|
| a | starts with a reference verb: `^(see\|per\|refer to\|as in\|as per\|cf\.)` | `per v2 section 2.1` |
| b | contains a section, table or appendix reference: `(§\|section\s+\d\|table\s+\d\|appendix)` | `see §2.1` |
| c | is a bare cross-task reference: `^as\s+<TASK-ID>$` | ``as `LX-2` `` |
| d | is empty or whitespace-only | `""` |
| e | is fewer than three words after stripping | `per card` |

**Reject:** `P-V15 REFUSED - task <id> <field> is a reference, not a condition: "<value>"`

**Why this rule exists.** The first real publication (`parallel-arc-v2-2026-08-15`, 2026-08-15)
shipped all ten tasks with `closeCondition` and `stopCondition` set to `"per v2 section 2.1"`.
The projection had parsed the task table but never joined the separate conditions table, and
`P-V1` passed because it checks presence, not literalness. The conditions were recoverable
from the snapshot's `source.md`, so the defect was degraded rather than unsafe — but the
guarantee that a worker can act from the published row alone did not hold.

**Length cannot substitute for this rule.** Measured against the ratified corpus, legitimate
conditions run 9–375 characters while pointer-shaped values run 8–18 — the ranges overlap, so
no minimum-length threshold separates them. That is why the schema keeps the condition fields
structurally non-empty and P-V15 carries the semantic check.

**Scope limit, stated rather than implied.** P-V15 catches **syntactic** pointers. It cannot
judge whether a syntactically valid condition is substantively adequate. That judgement stays
with the owner at the projection, which is why P-V15 and the mandatory literal print in
`templates/plan-projection.md` are a **pair, not alternatives** — the rule blocks the
mechanical failure, the print blocks the semantic one.

**Known consequence.** The 2026-08-15 v2 source carries three stop conditions of the form
``as `LX-2` `` (LX-3, LX-4, LX-5), which pattern **c** rejects. Any replacement source must
expand them into literal text. This is the rule working, not a false positive.

---

## P-V21 · Every task names a resolvable library profile; profiles are never authored

Every task must carry `executionProfile: "<ID>"` — a library id matching
`^[A-Z0-9]([A-Z0-9-]*[A-Z0-9])?$` (exact case, no folding) that exists as
`references/execution-profiles/<ID>.json`. There is **no legacy exemption**: a publication
with one profile-less row is refused (V1.2 ruling 1). The committed library is the **only**
authoring surface (rulings 2/3): a source or proposed plan that carries `executionProfiles`
(a fenced block, a table cell, or a top-level field) is refused, as is an inline object or a
path in place of an id.

**Detect** (step 5 — `scripts/resolve-profiles.js` → `scripts/lib/profile-contract.js`
`planCheck`): for every task the id resolves; the library file is canonical (the `sha256` of
the CR-stripped file equals `sha256(JSON.stringify(obj, null, 2) + '\n')` — a re-serialized
or tampered file is refused); it carries no `libraryHash`; the object validates against
`schemas/execution-profile.schema.json` (executable mirror `validateProfile`). The referenced
profiles are then embedded as `plan.json.executionProfiles` — one entry per distinct id, keys
sorted, each object carrying `libraryHash` after `version` (K2/K3). A worker re-derives the
hash from the embedded bytes alone and never reads the library.

**Reject:** `P-V21 REFUSED - task <id> executionProfile "<value>" is not in the committed library (exact id, no case folding)` ·
`P-V21 REFUSED - task <id> names no executionProfile …` ·
`P-V21 REFUSED - task <id> executionProfile must be a library id string, not an inline object` ·
`P-V21 REFUSED - the plan carries an authored executionProfiles field …` ·
`P-V21 REFUSED - the source authors executionProfiles (fenced block or table cell) …` ·
`P-V21 REFUSED - library integrity: <file>: library file is not canonical …`

## P-V22 · Profile lane matches the task lane

`profile.appliesToLane` must equal `task.lane`. `appliesToLane` is a constraint, not a second
lane declaration.

**Reject:** `P-V22 REFUSED - task <id> lane <lane> does not match profile <ID> appliesToLane <lane>`

## P-V23 · Mode ceilings and recommendations

For every phase of the task's profile. A refusal names the task, phase, field and value.

| | Rule |
|---|---|
| **(a)** | The ceiling never exceeds what the phase touches: a phase that writes a runtime path (`claims/…`, `arc-claims/…`, `mutex/…`, `.git/arc-runtime/…`) or declares `actions[]` must be `MANUAL`; a write under `.git/`, `.netlify/`, `netlify.toml`, `.env*` or `pt_*` is refused outright — never writable by a worker. |
| **(b)** | `recommendedMode ≤ modeCeiling`. |
| **(c)** | `AUTO` — as ceiling or recommendation — only on `kind: VERIFY`, with `capabilities.network: none` and every write under the sandbox (`<worktree>/…`). The MAIN lane is never `AUTO`, in any phase (r2.1 ruling 1). |
| **(d)** | **MAIN grant boundary (ratified wording 2026-08-22, D-14).** A MAIN phase may use `ACCEPT_EDITS` **without a grant only when its writes are limited to no writes or `.ai-reports/**`**. If a MAIN phase above `MANUAL` writes anything outside `.ai-reports/**` — or carries a `grant` — the grant requirements must hold: `kind: IMPLEMENT`, `toMode: ACCEPT_EDITS`, `paths ⊆ scope.writes`, `mutexClass ∈ task.mutexes ∩ CODE:*`, and `task.requiresOwnerGo == true`. The CODE mutex mapping (`index.html` ⇒ `CODE:index-html`, `netlify/functions/**` ⇒ `CODE:netlify-functions`) serves class resolution under P-V25 and the grant-class check; it never narrows this boundary. |
| **(e)** | `kind: TERMINAL` ⇒ ceiling `MANUAL`. |

**Reject:** `P-V23 REFUSED - (<letter>) task <id> phase <PHASE> <what>` — for example
`P-V23 REFUSED - (d) task G1-CLOCK-SEAM phase IMPLEMENT is ACCEPT_EDITS and writes outside .ai-reports/** (qa/**) without a grant`.

## P-V24 · Entry-mode agreement (five clauses on `phases[0]`)

| # | Clause |
|---|---|
| 1 | `task.entryMode == PLAN` **iff** `phases[0].kind == PLAN`, and a PLAN first phase has `modeCeiling == MANUAL`. |
| 2 | `task.requiresOwnerGo == true` ⇒ `phases[0].entryGate == AUTHORIZED_JSON`. |
| 3 | `task.requiresOwnerGo == false` ⇒ **no** phase may have `entryGate == AUTHORIZED_JSON`. |
| 4 | At most one `AUTHORIZED_JSON` phase may exist, and if present it must be `phases[0]`. |
| 5 | `profile.requiresOwnerGo == true` ⇒ `task.requiresOwnerGo == true`. |

The gate sits on `phases[0]` because a `requiresOwnerGo` task is claimed into
`WAITING_OWNER_GO` before its first phase runs; `MAIN-CODE-SLICE` gates its PLAN phase for
exactly this reason (C-2 / D-7).

**Reject:** `P-V24 REFUSED - (<n>) task <id> …` naming the task, phase, field and value.

## P-V25 · Scope ↔ mutex coverage (hard capability classes; code surfaces lock out)

**Hard — refused when the row lacks the class:**

| Profile declares | Row must hold |
|---|---|
| `browser: isolated-profile` | `QA:browser-runtime` **and** `CODE:index-html` (build-stability rule, P-V5) |
| `browser: owner-profile` | `RUNTIME:owner-profile` only (D-21 — not `QA:browser-runtime`) |
| `ownerProfile: read` \| `write` | `RUNTIME:owner-profile` |
| `gates: toggle-with-repark` / action `gate-toggle` | `RUNTIME:gates` |
| `network: live-provider` / action `live-external-call` | `EXTERNAL:live-provider` |
| action `pt-write` | `RUNTIME:owner-profile` |
| any phase `grant` | its `mutexClass` |

**Lock-out — restricts, never refuses (D-2):** a code surface in `scope.writes` or a phase's
`writes` whose class the row does not hold (`index.html` ⇒ `CODE:index-html`,
`netlify/functions/**` ⇒ `CODE:netlify-functions`) is **removed from the task's effective
write scope** and printed in the projection as
`P-V25 lock-out WARN: <surface> (<class> not held by <TASK>)`. The embedded profile bytes are
untouched (the `libraryHash` stays valid); the worker re-derives the same set from the row and
the embedded profile (`profile-contract.js deriveLockouts`, r3 §6 banner "write scope minus
P-V25 lock-outs"). `G1-CLOCK-SEAM` under `MAIN-CODE-SLICE` therefore publishes with
`netlify/functions/**` locked out instead of being refused (C-3).

**Reject:** `P-V25 REFUSED - task <id> requires <class> (<why>) but the row does not hold it`

## P-V26 · Required skills are invocable

Every `skills.required` entry must exist as `.claude/skills/<name>/SKILL.md`. A required skill
whose frontmatter is `disable-model-invocation: true` cannot be auto-invoked by a worker (D4
ruling: owner-invoked skills are advisory), so it is refused unless a phase of the profile has
`entryGate: OWNER_TYPES_SKILL`. `demandOnly` and `ownerInvokedOnly` skills are not checked —
they are never auto-invoked by construction.

**Detect:** the resolver reads the frontmatter block of each required skill.

**Reject:** `P-V26 REFUSED - task <id> requires skill "<name>" (disable-model-invocation: true) but no phase has entryGate OWNER_TYPES_SKILL` ·
`P-V26 REFUSED - task <id> requires skill "<name>", which does not exist under <skills root>`

---

## Refusal reporting

On any refusal, report: the rule id, the exact offending value, the file and section it came
from, and the single corrective action. Then stop.

**Never** offer to publish "with the problem noted", never adjust the projection to make a
rule pass, and never proceed on a partial validation. Most of these twenty-one rules protect
an approval or concurrency boundary; passing one by accommodation removes the boundary
entirely.
