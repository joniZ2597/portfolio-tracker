# ARC Registry Contract — identity, lifecycle, writers, promotion, status flags (Increment 1)

Binding reference for `/arc-registry` and for every hand edit of an `arc.json`. Transcribed from
the ratified Multi-ARC V1 ULTRAPLAN r3 (§1 T3/T4/T8, §3 K8, §4-B3, §7, §8 flag hygiene) with the
owner rulings of 2026-08-22 (D-3, D-4, D-5, D-26, O-1…O-6); V1.1 §2/§3/§5 applies only where r3
does not override it. Schema: `arc-publish-plan/references/schemas/arc.schema.json` (normative
shape; `additionalProperties: false` everywhere). Executable reference:
`qa/arc_registry_offline.js` (state machine, writer matrix and status flags are mirrored there
with drift guards — the prose here must match it).

## 0. What the registry is — and is not

- One directory per arc, one `arc.json`: `.ai-reports/arcs/<ARC-ID>/arc.json`, planning-side,
  git-excluded (`.git/info/exclude` → `.ai-reports/`), never committed.
- **The registry is an index of authority, not the authority.** `CHECKPOINT.md` stays the sole
  project-state record; the published snapshot stays the only execution authority; **workers never
  read the registry** (their chain is pointer → snapshot → claim → `authorized.json`).
- **The registry indexes claim roots, it never isolates claims — isolation is structural, in
  `arc-claims/<ARC-ID>/`** (sibling of `claims/`, `runtime-contract.md` section 2).
  `execution.claimsRoot` is a documentary index entry; no runtime path ever reads it.
- **No execution policy lives here.** No profile, mode, scope or tool field of any kind, and no
  task-id prefix field of any kind (D-26 — isolation is structural, duplicates across namespaces
  are legal). QA asserts the absence of every such key.
- **Increment 1 scope (D-5).** `/arc-registry status` is read-only. **No automated writer of
  `arc.json` exists until B5**: every field is hand-edited by its writer (section 5) with the
  `json-safe-edit` procedure — parse → modify → serialize → write a temp file → rename over the
  original. From B5 the publisher's step-10b write-back becomes the sole machine writer of
  `execution{}` (and of state `EXECUTING`); everything else stays hand-edited. There is no second
  writer to race in Increment 1, which is why this contract carries no concurrency rule.

## 1. Registry root

```bash
ARCS="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/.ai-reports/arcs"
```

The same command resolves to the **main worktree** from the main worktree and from every linked
worktree — the coordination domain comes from Git, not from a convention. `--path-format=absolute`
requires **Git >= 2.31** (verified present: `2.53.0.windows.2`); if the flag is unavailable,
resolve the relative `--git-common-dir` result against the worktree root instead — never guess
the path, and never use a bare `dirname` of the *relative* form, which resolves to `.` (the
caller's cwd) in the main worktree. This is the idiom every shipped protocol uses
(`claim-protocol.md`, `runtime-contract.md`, `publish-protocol.md`, `bootstrap.md`,
`owner-ops.md`, `arc-authorize/SKILL.md`).

`STRAY-REGISTRY` = an `arc.json` found under a **linked worktree**'s `.ai-reports/arcs/`, i.e. a
path whose parent is not the resolved main-worktree root. It is a `/arc-registry status` flag only
— **never an auditor flag**: `arc-progress-auditor` has no `Bash` and cannot resolve this root.

## 2. Identity

- `arcId` ~ `^[A-Z0-9]([A-Z0-9-]*[A-Z0-9])?$`, <= 24 chars, no Windows reserved device name
  (same guard as every other schema, N-3), **equal to the containing directory name, case-exact**;
  entries unique **case-folded** (`EP-PILOT` and `ep-pilot` can never coexist) and **never
  normalized** — a case variant is refused, not folded.
- `arcs` is a reserved `planId` (so `plans/arcs/` can never collide with a snapshot) and is not an
  `arcId` either.
- **`CORE-STREAM`** is the single grandfathered **registry** identity for the legacy singleton
  stream (`plans/current.json`, `claims/`). As a registry `arcId` it is addressable by the
  registry's own filter — `/arc-registry status --arc CORE-STREAM` is valid, because that flag
  filters registry entries. It is **never a runtime `arcId`**: no `plans/arcs/CORE-STREAM/` and
  no `arc-claims/CORE-STREAM/` may ever exist (the schema refuses both as `execution.pointer` /
  `execution.claimsRoot`), the legacy pointer carries no `arcId`, and the **runtime ARC
  selectors** — publisher, worker and authorize `--arc CORE-STREAM` (P-E) — must not exist and
  are refused: the legacy stream is reached only by the no-flag invocations. Its
  `authority.artifact` is the verified v3 publication source
  `.ai-reports/handoffs/2026-08-15_parallel-arc-execution-plan-v3.COWORK.md` (O-6; its sha256
  equals the live `sourceHash`).
- An arc is not a task-id namespace: the same `taskId` may exist in the legacy stream and in
  several arcs as distinct identities `(arcId ?? null, taskId)` (runtime-contract §2,
  `runtime-identity.js`).

## 3. Lifecycle — states and transitions

Ten states, fixed order: `IDEA`, `DISCOVERY`, `PLANNING`, `REVIEWED`, `READY`, `EXECUTING`,
`CLOSED`, `HOLD`, `CANCELLED`, `SUPERSEDED`. `CLOSED`, `CANCELLED` and `SUPERSEDED` are terminal.

| From | Legal next states | Notes |
|---|---|---|
| *(bootstrap)* | `IDEA` | the only legal first state — **except the `CORE-STREAM` grandfather, whose first and only history entry is `EXECUTING`** (section 5) |
| `IDEA` | `DISCOVERY`, `PLANNING`, `CANCELLED`, `SUPERSEDED` | `IDEA → PLANNING` is legal (DISCOVERY is optional) |
| `DISCOVERY` | `PLANNING`, `HOLD`, `CANCELLED`, `SUPERSEDED` | |
| `PLANNING` | `REVIEWED`, `HOLD`, `CANCELLED`, `SUPERSEDED` | `PLANNING → READY` is illegal: READY requires REVIEWED and a `promotion` |
| `REVIEWED` | `PLANNING`, `READY`, `HOLD`, `CANCELLED`, `SUPERSEDED` | any edit after review ⇒ new revision ⇒ `PLANNING`; `READY` only with a non-null `promotion` (PR-7) |
| `READY` | `EXECUTING`, `PLANNING`, `HOLD`, `CANCELLED`, `SUPERSEDED` | `READY → REVIEWED` is illegal (a revoked READY goes back to `PLANNING`); `READY → EXECUTING` only with a non-null `execution` (publisher) |
| `EXECUTING` | `EXECUTING`, `CLOSED`, `CANCELLED` | `EXECUTING → EXECUTING` is legal: the **republish** of a later revision of the same arc (the pointer swap, write-back, `history` append). `EXECUTING → PLANNING`, `→ READY`, `→ HOLD` are illegal as state transitions — see the two-level rule below |
| `HOLD` | `heldFrom`, `CANCELLED` | returns **only** to the state it left, stored in `heldFrom` (O-4); `HOLD → CANCELLED` is legal; `HOLD → SUPERSEDED` is not |
| `CLOSED` | — | terminal (O-3); a closed arc never reopens — new work is a new arc |
| `CANCELLED` | — | terminal |
| `SUPERSEDED` | — | terminal; `successorArcId` present and non-null (O-4) |

**Two-level rule (V1.1 line 98, O-3).** The arc's `state` is one thing; its current **planning
revision** is another. An `EXECUTING` arc may carry revision r+1 in `DRAFT` / `REVIEWED` /
`PROMOTED`; planning the next revision **never demotes** the arc — it stays `EXECUTING` on the
published snapshot until that revision is published (`EXECUTING → EXECUTING`) or the arc is
closed or cancelled. The V1.1 diagram's arrow from EXECUTING back to PLANNING is a *revision*
transition, not a state transition.

**History.** `history[]` is append-only and chronological; every consecutive pair must be a legal
transition above; the last entry equals `state`; the first entry is `IDEA` (CORE-STREAM:
`EXECUTING`). A hand edit producing an illegal history is an auditor `CONFLICT — OWNER RULING
REQUIRED` flag and an `INVALID` entry in the status view — never silently repaired.

## 4. Fields

| Field | Rule |
|---|---|
| `title`, `owner`, `planningLane` | `owner` is constant `"owner"` here (who rules); `planningLane` says who authors (`MAIN`/`LAB`/`COWORK`/`OWNER`) |
| `implementationAllowed` | owner-written only; `true` **exactly** in `READY` and `EXECUTING` (schema-enforced) |
| `authority` | `{kind ∈ ratified-contract \| publication-source \| owner-ruling, artifact, ratifiedAt}`; `null` only at `IDEA` / `DISCOVERY`; **required from `PLANNING` onward** — an arc past PLANNING with no `authority.artifact` is an **orphan** (approved work with no defining artifact), structurally visible |
| `dependencies[]` | two kinds only: `arc-state {arcId, atLeast}` (registry-checkable) and `task-precondition {stream legacy\|arc, arcId iff stream == arc, taskId, evidence, attestedBy, attestedAt}`. **Evidence-anchored, never claim-anchored**: `evidence` is a durable artifact; a surviving `claim.json` only corroborates (COMPLETE) or refuses (ABANDONED / BLOCKED / live); absence of a claim directory is never satisfaction. Checked at PR-5 and P-V20, **never by workers** (no cross-arc `dependsOn` in any plan) |
| `planning.revisions[]` | append-only, 1-based, contiguous; `{rev, source, sourceHash, status ∈ DRAFT\|REVIEWED\|PROMOTED\|PUBLISHED\|SUPERSEDED\|WITHDRAWN, reviews[]}`; `currentRevision` is 0 with no revision, else the rev being worked |
| `planning.lease` | `{lane, conversationId, since}` or `null` — **advisory, never a lock**; a held lease blocks nothing; two planners on one arc surface as auditor duplication, never as a refusal |
| `promotion` | owner-written only (PR-7); `{rev, sourceHash, rulingAt, rulingBy, note, waivers[{rule PR-n, reason}]}`; `sourceHash` pins the exact bytes; `null` until promoted — and permanently `null` for `CORE-STREAM`: a promotion object on the grandfather entry is refused by the schema |
| `execution` | `{planId, planHash, pointer, claimsRoot, publishedAt}` — documentary index of the runtime (r3 K8); `pointer` is `plans/current.json` (legacy index entry) or `plans/arcs/<ARC-ID>/current.json`; `claimsRoot` is `claims/` or `arc-claims/<ARC-ID>/`; the status view cross-checks it and flags `DRIFT` |
| `heldFrom` | optional `string \| null`; **present and non-null iff `state == HOLD`**: the state HOLD returns to (`DISCOVERY` / `PLANNING` / `REVIEWED` / `READY`; stored, never derived from `history`); absent or `null` otherwise — a stale non-null value outside HOLD is refused (O-4) |
| `successorArcId` | optional `string \| null`; **present and non-null iff `state == SUPERSEDED`**; absent or `null` otherwise (O-4) |
| `history[]` | `{state, at, by ∈ owner\|publisher\|MAIN\|LAB\|COWORK, note?}`, section 3 |

## 5. Writers

| Surface | Writer |
|---|---|
| states `IDEA` / `DISCOVERY` / `PLANNING` / `REVIEWED`; `planning.revisions[]`, `reviews[]`, `lease`; `dependencies[]`; `authority` | planning lane |
| **Owner-only:** `promotion`, `implementationAllowed`, `heldFrom`, `successorArcId`; states `READY`, `CLOSED`, `HOLD`, `CANCELLED`, `SUPERSEDED` | owner |
| **Publisher-only:** `execution`; state `EXECUTING` — exception: the **`CORE-STREAM` grandfather** bootstrap, written by the owner and recorded honestly in `history` | publisher (B5 write-back) |

**`CORE-STREAM` grandfather (D-4, 2026-08-22).** The legacy stream was published before the
registry existed, so its index entry is created **directly at `EXECUTING` by the owner** with
`promotion: null`, no `planning.revisions[]`, and a single honest `history` entry
`{state: EXECUTING, by: owner, note: "bootstrap — legacy stream grandfathered …"}`. No synthetic
promotion is fabricated, and none may ever be added: the schema refuses a promotion object on
`CORE-STREAM`. It is the **single** grandfathered entry: the schema admits `promotion: null` at
`EXECUTING` only for `arcId == CORE-STREAM`, and the state machine admits a bootstrap at
`EXECUTING` only for it. Every other arc enters at `IDEA` and reaches `EXECUTING` only through
`READY` (a real `promotion`) and the publisher.

Every write, by any writer, is parse → modify → serialize → temp → rename (`json-safe-edit`).
Forgery (a planning conversation writing `READY` / `EXECUTING` / `promotion`) is the same class as
V1's R-1: charter + typed literals + the status view's cross-check, recorded rather than solved.

## 6. Promotion — the gate `REVIEWED → READY` (PR-1 … PR-7)

Run by the owner **by hand** in Increment 1 (no `promote` command exists until Increment 3).
All seven must hold; any failure = REFUSE with the rule id and the offending value; nothing written.

| Rule | Check |
|---|---|
| **PR-1 Frozen** | revision `source` exists; `sha256(source) == revisions[N].sourceHash`; the file header `Status:` is not DRAFT / OPEN-editing. Promotion pins bytes, not a filename. |
| **PR-2 Projectable** | `/arc-publish-plan <source> --arc <ARC-ID> --dry-run` (P-E) passes P-V1…P-V9, P-V15, P-V16 (revised: `arcId` declared from the literal; task ids unique within the plan only), P-V17, P-V19, P-V20, P-V21…P-V26, and prints a complete projection; writes nothing. (**P-V18 is RETIRED** — number reserved, never reused, D-25; cross-arc duplicate task ids are legal.) |
| **PR-3 Independently reviewed** | ≥1 `reviews[]` entry for **this revision** from a reviewer other than the authoring lane, verdict PASS or PASS-WITH-CONDITIONS with every condition discharged in the revision text; else an explicit owner waiver in `promotion.waivers[]` with a reason. |
| **PR-4 Reconciled** | `mtime(source) >= mtime(CHECKPOINT.md)` (P-V14 semantics) **and** the arc has an audit within the audit-gate window or an owner waiver. |
| **PR-5 Dependencies satisfied** | every `arc-state` dependency at / after `atLeast`; every `task-precondition` resolved per section 4 (evidence artifact exists; any surviving `claim.json` corroborates rather than contradicts; owner attestation written to `attestedBy` / `attestedAt`). Absence of a claim directory is never satisfaction. |
| **PR-6 Isolation declared** | every task's `mutexes` are drawn from the closed registry and cover every shared surface it names (`index.html` ⇒ `CODE:index-html`; browser QA ⇒ `+QA:browser-runtime` per the build-stability rule; gates ⇒ `RUNTIME:gates`; live calls ⇒ `EXTERNAL:live-provider`; real `pt_*` ⇒ `RUNTIME:owner-profile`); no task references a class absent from the registry; every task resolves an execution profile whose scope the row's mutexes cover (P-V25). Isolation of claims is structural (`arc-claims/<ARC-ID>/`) — there is no task-id naming requirement of any kind. |
| **PR-7 Owner ruling** | the owner types `PROMOTE <ARC-ID> r<N>` (any other response is not a ruling) and writes `promotion{rev, sourceHash, rulingAt, rulingBy, note, waivers}`, `state: READY`, `implementationAllowed: true`, `revisions[N].status: PROMOTED`, and appends `history`. The same typed-literal fence as CONFIRM. |

## 7. READY invalidation, decay, and the two staleness clocks

READY is invalidated back to `PLANNING` (owner act, or refused at publish) when the source hash
changes, a dependency regresses, CHECKPOINT records a conflicting fact, or the promotion is stale.
**READY decay (D-10): `promotion.rulingAt` older than 7 days ⇒ `STALE-READY` — a status-view
flag only, never a state change**; publishing then requires `--acknowledge-stale-promotion`
(P-E), durably recorded like every override.

Two clocks, two subjects — never unified: the **auditor** flags an arc marked active with no
meaningful progress for **14+ days** (`arc-progress-auditor`, heuristic); the **registry**
flags a READY promotion older than **7 days** (`STALE-READY`). Both report; neither rules.

## 8. `- Arc:` header, attribution, and the two `--arc` flags

- Handoffs may carry the optional header key `- Arc: <ARC-ID>` (documentary; scan-contract rule
  3 already tolerates unknown keys). **For auditor grouping `- Arc:` wins** when present; the
  slug prefix is the fallback heuristic; a disagreement between the two is a **normalization
  flag** for owner ruling, never a silent reclassification (O-1).
- **Neither the header nor the slug is authority for a runtime `arcId`**: the publisher takes
  `arcId` only from its typed `--arc` literal (r3 T17); slug-prefix attribution never identifies
  a runtime ARC.
- `/arc-progress-auditor --arc <name>` and `/arc-registry status --arc <ARC-ID>` are both
  **filters**, over **different identity spaces**: the auditor filters slug-/header-attributed
  handoffs (heuristic, `UNATTRIBUTED` otherwise); the registry filters `arcId` values (exact).
  The values are not interchangeable; neither flag routes anything (r3 C-8).
- **Orphan rule:** an arc past `PLANNING` whose `authority.artifact` is null is an orphan —
  approved work with no defining artifact — reported by the auditor as an orphan and by the
  status view as `INVALID` (the schema refuses it).

## 9. Status-view flags (the only vocabulary)

| Flag | Raised when | Authority |
|---|---|---|
| `DRIFT` | registry `EXECUTING` but the pointer it indexes is absent, or `execution.planId` ≠ the pointer's `planId`; or an arc pointer exists while the registry says anything other than `EXECUTING` (e.g. `READY` — the publish half-state) | repair is an owner act |
| `STALE-READY` | `READY` with `promotion.rulingAt` older than 7 days | flag only |
| `ORPHAN-CLAIM` | a claim whose `taskId` is not in the current plan of its namespace (legacy: the legacy pointer's plan; ARC: that arc's pointer's plan) | owner-ops |
| `STRAY-REGISTRY` | an `arc.json` outside the resolved main-worktree root (section 1) | owner |
| `DUPLICATE-ID-INFO` | the same `taskId` present in `claims/` and in one or more `arc-claims/<ID>/` — **informational, expected, not an error** | — |
| `CLAIM-ARCID-MISMATCH` | `runtime-identity.js` `claimMatchesPath` / `authorizedMatchesPath` ≠ `MATCH` (an ARC record whose `arcId` ≠ its directory; a legacy record carrying `arcId`; `taskId` ≠ directory) | owner |
| `HOLDER-WITHOUT-CLAIM` | a `mutex/<CLASS>/holder.json` whose owner pair `(arcId ?? legacy, taskId)` has no claim in its namespace (`__PUBLISH__` / `__OWNER__` exempt) | owner-ops §8 |
| `MANIFEST-ARCID-MISMATCH` | an **ARC** pointer whose `plan.json` / `manifest.json` / `current.json` do not carry one equal `arcId` == `<ARC-ID>` (`runtime-identity.js` `arcIdTriple({ plan, manifest, current }, "<ARC-ID>")` ≠ `ARC`) | owner |

**The legacy pointer `plans/current.json` carries no `arcId` and raises NO FLAG** — CORE-STREAM
indexes it; the `arcId` equality rule applies to `execution.claimsRoot == arc-claims/<ID>/`
entries only. Legacy claims (`claims/*`) and ARC claims (`arc-claims/*/*`) are rendered under
**separate headings**, never merged. This vocabulary is disjoint from the auditor's
(`Duplication`, `Orphans`, `Staleness`, `Conflicts`, `Planning loops`, `Normalization`,
`CONFLICT — OWNER RULING REQUIRED`, `UNATTRIBUTED`); conflating the two is a review-stop.

## 10. Artifacts stay where they are

Revisions, reviews and contracts remain `.ai-reports/handoffs/` files under the existing
filename/header contract (write-once, one author). Every promotion, publication and close still
gets a CHECKPOINT entry; the registry never replaces it.
