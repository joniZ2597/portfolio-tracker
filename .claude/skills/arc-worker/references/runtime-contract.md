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
<ROOT>/
├── plans/
│   ├── current.json                 active plan manifest        [READ-ONLY to workers]
│   └── <plan-id>/
│       ├── plan.json                immutable, hash-pinned      [READ-ONLY to workers]
│       ├── source.md                verbatim source copy        [READ-ONLY to workers]
│       └── manifest.json            id, hashes, ref, provenance [READ-ONLY to workers]
├── claims/
│   └── <TASK-ID>/
│       ├── claim.json               written by the holding worker
│       └── authorized.json          [OWNER-WRITTEN ONLY - never by a worker]
└── mutex/
    └── <ENCODED-CLASS>/
        └── holder.json              { taskId, lane, acquiredAt }
```

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

## 5. Legal transitions

```
UNCLAIMED --mkdir, requiresOwnerGo=false--> CLAIMED             (worker)
UNCLAIMED --mkdir, requiresOwnerGo=true --> WAITING_OWNER_GO    (worker)

WAITING_OWNER_GO ------[OWNER ONLY]-------> AUTHORIZED

CLAIMED | AUTHORIZED ---------------------> BLOCKED   (worker or owner)
CLAIMED | AUTHORIZED ---------------------> COMPLETE  (worker)

<any of the 6 persisted states> --[OWNER]-> ABANDONED

BLOCKED -------------[OWNER ONLY]---------> CLAIMED | AUTHORIZED   (RESUME)
COMPLETE | BLOCKED | ABANDONED --[OWNER]--> UNCLAIMED              (RELEASE)
```

Every transition not listed is **illegal and fails closed to `BLOCKED`**.

`ABANDONED` is **not reachable from `UNCLAIMED`** (owner ruling 2026-08-15) — there is no
`claim.json` to write to, so there is nothing on disk to abandon.

**A worker may never write `AUTHORIZED` or `ABANDONED`.** This is the single most
important rule in the model and the one with the weakest technical enforcement.

## 6. Worker write allowlist

```
<ROOT>/claims/<own TASK-ID>/claim.json
<ROOT>/mutex/<own declared class>/holder.json
```

Creating the two containing directories is part of claiming and is permitted. Every other
write is an unconditional STOP.

Never written by a worker: `authorized.json` · anything under `plans/` · another task's
claim · a mutex whose `holder.json` names a different `taskId` · the runtime root.

## 7. Fail-closed catalogue

| Condition | Result |
|---|---|
| `git rev-parse` fails, or root absent/incomplete | IDLE |
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
| Claim `planId` is not the current `planId` | BLOCKED — owner recovery only |
| Mutex holder mismatch on resume | BLOCKED, retaining what is held |
| A newer `.ai-reports` artifact than the snapshot | **report it, stay on the snapshot** |

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
