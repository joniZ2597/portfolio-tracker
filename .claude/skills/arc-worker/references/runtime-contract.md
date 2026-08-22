# ARC Runtime Contract — layout, vocabulary, fail-closed rules

Binding reference for `/arc-worker`. Everything here is read-only background for the
worker except the two write shapes in section 6.

## 1. Root resolution

```bash
ROOT="$(git rev-parse --path-format=absolute --git-common-dir)/arc-runtime"
```

The command failing, or `ROOT` not containing `plans/`, `claims/` and `mutex/`, is
**IDLE**. A worker never creates the root or any of its top-level directories — creation
is a one-time owner act (`arc-publish-plan/references/bootstrap.md`).

`--git-common-dir` resolves to the **same** path from the main worktree and from every
linked worktree, and to a different path in an independent clone. The coordination domain
comes free from Git rather than from a convention someone must remember.

**Coordination domain (owner ruling 2026-08-15).** This project's domain is the main
worktree plus every linked worktree resolving to the same `.git`. `portfolio-tracker-test-lab`
is a **linked worktree, not an independent clone** — its claims and mutexes are
**enforcing**, not informational. The cross-clone rule is retained forward-looking: a true
independent clone would be a separate domain, V1 provides no coordination across domains,
and any task whose safety depends on that must fail closed. No independent clone of this
repository exists as of 2026-08-15.

## 2. Layout

```
<ROOT>/                                  root completeness = exactly plans/ + claims/ + mutex/ (section 1)
├── plans/
│   ├── current.json                 LEGACY singleton pointer    [READ-ONLY to workers; no arcId]
│   ├── <plan-id>/
│   │   ├── plan.json                immutable, hash-pinned      [READ-ONLY to workers; an ARC snapshot carries arcId]
│   │   ├── source.md                verbatim source copy        [READ-ONLY to workers]
│   │   └── manifest.json            id, hashes, ref, provenance [READ-ONLY to workers; same field set as current.json]
│   └── arcs/<ARC-ID>/current.json   per-ARC pointer, arcId == <ARC-ID>    [P-E; container plans/arcs/ is owner-bootstrap]
├── claims/
│   └── <TASK-ID>/                   LEGACY stream namespace - claim identity (null, <TASK-ID>)
│       ├── claim.json               written by the holding worker          [no arcId]
│       └── authorized.json          [OWNER-WRITTEN ONLY - never by a worker]
├── arc-claims/                      ARC namespace root, SIBLING of claims/  [owner-bootstrap; P-E]
│   └── <ARC-ID>/                    per-ARC container - created only by the publisher (step 9b, idempotent)
│       └── <TASK-ID>/               claim identity (<ARC-ID>, <TASK-ID>); claim.json + authorized.json carry arcId == <ARC-ID>
└── mutex/
    └── <ENCODED-CLASS>/             GLOBAL classes (section 3) - never namespaced by ARC
        └── holder.json              { taskId, lane, acquiredAt, arcId? }   (holder.schema.json)
```

**Namespaces (topology contract, B4 / P-E0; the behaviour that selects one is P-E — publisher in
B5, worker / authorize / owner-ops in B6).** A worker, an authorization and every **mutating** owner
operation select exactly one namespace per invocation, from an explicit literal —
`--arc <ARC-ID>`, or its absence (worker / authorize) or `--legacy` (owner-ops) — and never fall
back from one to the other, never search both to decide a target, and never read the one they did
not select. Only read-only inspection (`owner-ops.md` section 2, `/arc-registry status`) enumerates
both. The legacy stream (`plans/current.json`, `claims/<TASK-ID>/`) and the ARC namespace
(`plans/arcs/<ARC-ID>/current.json`, `arc-claims/<ARC-ID>/<TASK-ID>/`) are **sibling** trees: a
`claims/*/` loop never sees an ARC claim, an `arc-claims/<ARC-ID>/*/` loop never sees a legacy one,
and nothing ever reads across the two (K15). `plans/<plan-id>/` and `mutex/` are the only shared
surfaces. Claim identity is structural — `(arcId ?? null, taskId)`, taken from the directory and
checked against the record (`arc-publish-plan/scripts/lib/runtime-identity.js` `claimMatchesPath` /
`authorizedMatchesPath`, schemas `claim.schema.json` / `authorized.schema.json`) — never from a
task-id prefix, a filename or a slug; the same `taskId` may exist in `claims/` and in several ARCs
as distinct identities. `arcs` is a reserved `planId` so the pointer container can never collide
with a snapshot directory. Legacy records stay byte-unchanged and carry no `arcId`.

**Who creates what (D-24).** The roots `plans/`, `claims/`, `mutex/` and, for ARC execution,
`plans/arcs/` and `arc-claims/` are **owner-bootstrap-created**
(`arc-publish-plan/references/bootstrap.md`); the publisher later creates only the per-ARC
container `arc-claims/<ARC-ID>/` (publish step 9b, plain `mkdir`, EEXIST ignored, P-E); workers
never create roots or containers — only their own claim directory and their own mutex directories.
**Root completeness remains exactly `plans/` + `claims/` + `mutex/`** (section 1): `arc-claims/`
and `plans/arcs/` are never required for the root to be complete; their absence is an ARC-level
condition (P-E), not a missing root.

## 3. Mutex registry and encoding

`:` is **not a legal NTFS filename character** — verified empirically: `mkdir` of a raw
colon name fails `EINVAL`. Encoding is mandatory, not cosmetic.

- **Directory name** = canonical class with `:` replaced by `__`
- **Acquisition order is computed on the *unencoded* string**, ASCII order, then encoded

| Canonical class | Directory | Guards |
|---|---|---|
| `AUTHORITY:published-plan` | `AUTHORITY__published-plan` | `plans/` and `current.json` — publish only |
| `CODE:index-html` | `CODE__index-html` | any slice editing `index.html` |
| `CODE:netlify-functions` | `CODE__netlify-functions` | any slice editing `netlify/functions/*` |
| `DEPLOY:netlify` | `DEPLOY__netlify` | deploy targeting and site linkage |
| `EXTERNAL:live-provider` | `EXTERNAL__live-provider` | live external calls |
| `QA:browser-runtime` | `QA__browser-runtime` | a stable running build for browser QA |
| `RUNTIME:gates` | `RUNTIME__gates` | enabling or disabling any gate |
| `RUNTIME:owner-profile` | `RUNTIME__owner-profile` | the real browser profile and real `pt_*` data |

Sort-before-encode is defensive: `:` is `0x3A` and `_` is `0x5F`, so a pair like `CODE:x`
and `CODEX:a` would reorder under encoding. No such pair exists today; the rule exists so
a future addition cannot silently change acquisition order.

NTFS is case-insensitive — a case-variant directory collides with `EEXIST`. That fails
closed, which is safe, and is why canonical case is fixed by the registry.

**Build-stability rule.** Any task requiring a stable running build acquires
`CODE:index-html` **in addition to** `QA:browser-runtime`. Two distinct class directories
both succeed under `mkdir`, so this exclusion must be a shared class; as prose it would be
unenforced.

**Reserved holder ids.** `__PUBLISH__` (publish holding the authority class) and
`__OWNER__` (owner holding a class for an OWNER-lane task). Publish validation rejects any
task id beginning `__`, so a real task can never collide with either.

**Holder record (B4 / P-E0, `holder.schema.json`).** `holder.json` is
`{ taskId, lane, acquiredAt, arcId? }`. The owner of a held class is the **pair**
`(arcId ?? null, taskId)`: a legacy holder carries no `arcId`; a holder taken for an ARC task, or by
`__PUBLISH__` / `__OWNER__` acting for an ARC, carries `arcId` equal to that ARC. Release is legal
**only on an exact pair match** (`arc-publish-plan/scripts/lib/runtime-identity.js`
`holderOwnershipMatches`, K14): a legacy identity never owns an ARC holder with the same `taskId`,
and an ARC identity never owns a legacy holder (D-28). **Mutex classes stay global** — the eight
classes above are not namespaced by ARC; `CODE:index-html` held for `ARC-A/TASK-10` blocks
`ARC-B/TASK-10` and the legacy `TASK-10` alike. The holder's `arcId` disambiguates the holder,
never the class.

## 4. Two vocabularies — never conflated

| Vocabulary | Values | Where |
|---|---|---|
| **Task state** | the six persisted states | `claim.json` on disk |
| **Worker outcome** | `IDLE` · `STOPPED` | the report only; never persisted |

`UNCLAIMED` is the **absence of the claim directory**, not a stored value. It is not
written, and it is not reachable as a transition target except through owner RELEASE.

A pre-claim mutex refusal is `outcome=STOPPED, taskState=UNCLAIMED` — the claim directory
is removed and **no state is written at all**. Recording it as `BLOCKED` would be an
illegal transition, since `UNCLAIMED -> BLOCKED` is not in the legal set.

The **wrong-`--arc` resume** (section 7, D-6) uses that same vocabulary for the same reason:
`outcome=STOPPED`, the task state on disk **unchanged**, nothing written and nothing released. The
resumed claim belongs to a namespace this invocation did not select, so this invocation has no
authority to record any transition on it — writing `BLOCKED` would assert one.

## 5. Legal transitions

```
UNCLAIMED --mkdir, requiresOwnerGo=false--> CLAIMED             (worker)
UNCLAIMED --mkdir, requiresOwnerGo=true --> WAITING_OWNER_GO    (worker)

WAITING_OWNER_GO ------[OWNER ONLY]-------> AUTHORIZED

CLAIMED | AUTHORIZED ---------------------> BLOCKED   (worker or owner)
CLAIMED | AUTHORIZED ---------------------> COMPLETE  (worker)

<any of the 6 persisted states> --[OWNER]-> ABANDONED

BLOCKED -------------[OWNER ONLY]---------> CLAIMED | AUTHORIZED   (RESUME)
BLOCKED | ABANDONED -------------[OWNER]--> UNCLAIMED              (RELEASE)
```

Every transition not listed is **illegal and fails closed to `BLOCKED`**.

`ABANDONED` is **not reachable from `UNCLAIMED`** (owner ruling 2026-08-15) — there is no
`claim.json` to write to, so there is nothing on disk to abandon.

`COMPLETE` is **terminal-durable** (owner ruling 2026-08-20, R-M): its only outgoing
transition is the owner-only `COMPLETE -> ABANDONED`. It is deliberately **not** a RELEASE
source, because the `COMPLETE` claim is the only durable record of completion and §5.1 below
resolves dependencies from exactly that record. The deliberate re-run path is preserved as
`COMPLETE -> ABANDONED -> RELEASE -> UNCLAIMED`. Retention is of the **record**, never of the
**resources**: mutex release at `COMPLETE` is unchanged.

**A worker may never write `AUTHORIZED` or `ABANDONED`.** This is the single most
important rule in the model and the one with the weakest technical enforcement.

## 5.1 Dependency resolution

Stated explicitly here rather than left inferred from `arc-worker/SKILL.md` step 4. Resolution
is **scoped to the namespace the worker operates in** — the legacy stream or one ARC — never
cross-namespace, never cross-ARC (owner ruling 2026-08-21; the rule is fixed in B4, the runtime
selection and this resolution are implemented in `claim-protocol.md` section 1a, B6):

```
legacy stream:  depSatisfied(D)         <=>  claims/<D>/claim.json                 exists
                                             AND parses
                                             AND .state == "COMPLETE"
ARC <arcId>:    depSatisfied(arcId, D)  <=>  arc-claims/<arcId>/<D>/claim.json     exists
                                             AND parses
                                             AND .state == "COMPLETE"
```

A COMPLETE `D` in another ARC, or in the legacy stream, never satisfies an ARC's dependency, and
an ARC's COMPLETE `D` never satisfies the legacy stream's. Every other case — directory absent,
unparseable, or **any** other state — is **not satisfied**. Fail-closed, with no state that is
true but unobservable:

| Observation (in the selected namespace) | Meaning | Dependency |
|---|---|---|
| dir present, `state: COMPLETE` | done, durably | **satisfied** |
| dir present, any other state | in flight / stopped / withdrawn | not satisfied |
| dir absent | never ran, **or** deliberately withdrawn via ABANDON+RELEASE, **or** completed only in another namespace | not satisfied |

**The dependency claim's `planId` is NOT consulted, deliberately.** Requiring
`planId == current` would re-strand a whole chain on the next replacement publication, since
a dependency completed under one plan keeps that `planId` forever. **Completion is a fact
about the task, not about the plan version** — within its namespace: for an ARC, across that
ARC's generations (`planId` changes, `arcId` does not). This rests on a recorded assumption: a
task id means the same thing across plans of the same stream or ARC.

> **Named non-conflict with §7.** That table's row *"Claim `planId` / `planHash` is not the
> current one of the selected namespace -> BLOCKED (`plan-not-current-for-arc`)"* is **not**
> contradicted here. A worker reads **its own** claim as *authority* and **a dependency's** claim as
> *evidence*, and only the former is plan-pinned. Acting under stale terms is the hazard §7
> prevents; reading another task's terminal record to answer "did this finish?" grants no authority
> and carries no such hazard.

An INCOMPLETE-CLAIM directory (no `claim.json`) fails the "exists AND parses" clause, so
owner-ops §8 residue cleanup remains correct and safe.

## 5.2 Profile consumption (P-C)

A worker binds its task's execution profile from the published snapshot **only**
(`arc-worker/scripts/phase-gate.js --ladder`, contract `execution-profile.md`):

```
profile(T)  =  plan.executionProfiles[ task(T).executionProfile ]                 (K4)
W-V10       :  libraryHash(embedded - libraryHash) == embedded.libraryHash
               AND key order profileId, version, libraryHash, ...
               AND the embedded object validates (execution-profile.schema.json mirror)
```

| Snapshot state | Binding | Worker |
|---|---|---|
| no `executionProfiles` and the row names no `executionProfile` | `profile none (legacy snapshot)` | V1 behaviour — lane + mutexes + allowlist; **no handshake** (K5) |
| map absent but the row references a profile · map present but the row names none · reference not a key (exact id, no case folding) | `profile-binding-missing` | before the claim ⇒ **IDLE**, nothing written; on `--resume` ⇒ **BLOCKED** |
| key present but the hash, key order or shape fails W-V10 | `profile-hash-mismatch` | same dispositions |
| bound | ladder printed; `--phase` at every phase entry; `--scope` on demand | CLAIM, then the Mode Transition Protocol handshake before the first write of every phase |

The library directory, the registry and conversation text are never a profile source.
`planHash` already pins the embedded bytes, so a W-V10 failure means the snapshot itself is
inconsistent — owner disposition, never a worker repair. Mode is prompting policy, never
authority: the two write shapes of section 6 bind identically under every acknowledged mode,
and the handshake record is report-only (`claim.json` unchanged, ruling 5 / D-15).

## 6. Worker write allowlist

Exactly two path shapes **per namespace**; a worker operates in one namespace per invocation
and never writes both:

```
legacy stream:  <ROOT>/claims/<own TASK-ID>/claim.json
                <ROOT>/mutex/<own declared class>/holder.json           (no arcId)

ARC <ARC-ID>:   <ROOT>/arc-claims/<ARC-ID>/<own TASK-ID>/claim.json      (arcId == <ARC-ID>)   [P-E]
                <ROOT>/mutex/<own declared class>/holder.json           (arcId == <ARC-ID>)   [P-E]
```

Creating the two containing directories — the own claim directory and the own mutex class
directory — is part of claiming and is permitted. Every other write is an unconditional STOP.

Never written by a worker: `authorized.json` · anything under `plans/` · another task's
claim · a mutex whose `holder.json` names a different owner pair `(arcId ?? null, taskId)` ·
the runtime root or any root container (`claims/`, `arc-claims/`, `arc-claims/<ARC-ID>/`,
`plans/arcs/`) · **anything at all in the namespace this invocation did not select.**

The namespace is fixed once, from the literal, before the first read
(`claim-protocol.md` "Namespace selection"). Release is legal only on an exact holder-pair match
(section 3): at `COMPLETE` a worker **skips** a class it does not own and reports it retained, and
on `--resume` a mismatched pair is `BLOCKED` with everything already held kept.

## 7. Fail-closed catalogue

| Condition | Result |
|---|---|
| `git rev-parse` fails, or root absent/incomplete | IDLE |
| `--arc` literal malformed, case-variant, or `CORE-STREAM` | IDLE — nothing read, nothing written; never normalized |
| `--arc <ARC-ID>` with no `plans/arcs/<ARC-ID>/current.json` and no `retired-*.json` sibling | IDLE — `arc-not-published` |
| `--arc <ARC-ID>` whose pointer was retired (only `retired-*.json` survives) | IDLE — `arc-retired` |
| Pointer `arcId` != the `--arc` literal, or `plans/current.json` carrying an `arcId` (W-V13) | IDLE — `pointer-arc-mismatch` |
| A claim record in the selected namespace whose identity is not its own directory (W-V14) | IDLE — `claim-arc-mismatch` |
| ARC pointer present but `arc-claims/<ARC-ID>/` absent | IDLE — `arc-claims-container-missing`; a worker never creates a container |
| Claim `planId` / `planHash` is not the current one **of the selected namespace** | BLOCKED — `plan-not-current-for-arc`; owner recovery only |
| `--resume` on a claim whose identity is not the selected namespace (D-6) | **STOPPED**, no write, nothing released — the task state on disk is unchanged |
| Mutex holder pair `(arcId ?? null, taskId)` mismatch on resume | BLOCKED, retaining what is held |
| `current.json` missing or malformed | IDLE |
| `plan.json` missing, or `planHash` mismatch | IDLE |
| Lane not in {MAIN, LAB, COWORK} | IDLE |
| No eligible task for the lane | IDLE |
| Claim directory already exists | next candidate, then IDLE |
| Any required mutex held | roll back, STOP, task stays UNCLAIMED |
| `claim.json` malformed, or unknown `state` string | BLOCKED |
| Unknown mutex class in the claimed row | BLOCKED |
| Dependency unsatisfied or cyclic | BLOCKED |
| `AUTHORIZED` with no valid `authorized.json` | BLOCKED — never repaired by a worker |
| A newer `.ai-reports` artifact than the snapshot | **report it, stay on the snapshot** |
| `profile-binding-missing` / `profile-hash-mismatch` (W-V10) before the claim | IDLE — nothing written |
| `profile-binding-missing` / `profile-hash-mismatch` on `--resume` | BLOCKED |
| `mode-exceeds-ceiling` — an acknowledged or signalled mode above the phase ceiling | STOP-before-write — wait for the appropriate operator `MODE` literal (≤ ceiling) |
| `unmapped-harness-mode` — `plan`, `dontAsk` or `bypassPermissions` visibly active at a write | STOP-before-write — wait until the operator returns to a mapped harness mode, then re-evaluate |
| `automation-increase-needed` — recommended mode above the acknowledged mode | STOP-request-MODE-literal — wait for the operator's literal |
| `entry-gate-unsatisfied` — `AUTHORIZED_JSON` outside the `--resume` conversation | STOP — wait until the entry-gate / resume precondition is satisfied |
| `scope-expansion` — a needed write outside the phase scope and the allowlist | BLOCKED, mutexes retained |

## 8. One task per conversation

Selection happens **once**. After a terminal state the worker stops; it does not re-enter
the filter, does not scan for follow-on work, and does not start a successor conversation.
Automatic N+1 selection is forbidden (contract principle 5), which is also why V1 has no
daemon, watcher, scheduler or queue drainer.

## 9. Known limitation

`allowed-tools` is **not runtime-enforced** (X-9, CHECKPOINT 2026-08-14). Nothing in the
filesystem prevents a worker writing `authorized.json`. The guarantee rests on the section
6 allowlist plus owner review. Recorded rather than papered over; the available mitigation
is an owner-supplied token a worker cannot derive, deliberately not built in V1.
