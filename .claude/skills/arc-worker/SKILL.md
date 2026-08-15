---
name: arc-worker
description: Claims and executes exactly ONE task from the published ARC plan snapshot for a given lane (MAIN, LAB, or COWORK), then stops. Discovers eligible tasks, atomically claims one via mkdir, acquires its mutex classes in canonical order, routes DIRECT or /plan per the snapshot, reports, and reaches COMPLETE or BLOCKED. Never authorizes itself, never selects a second task, never publishes. Supports --resume for a task the owner has authorized.
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Grep, Glob
---

# ARC Worker

> **STANDING BEHAVIOR — ONE TASK, THEN STOP.**
> This skill NEVER writes `AUTHORIZED` or `ABANDONED` under any condition. It NEVER
> creates the runtime root. It NEVER writes anything under `plans/`. It NEVER touches
> another task's claim or another holder's mutex. It NEVER publishes, and NEVER
> auto-publishes a newer `.ai-reports` artifact it happens to notice. It NEVER selects a
> second task after finishing the first. It NEVER waits, retries, or backs off on a held
> mutex. **Claiming a task is not authorization to execute it.**

Invoked once per conversation, by the owner or a launching host. Not model-invocable: a
model in an unrelated conversation must never spontaneously claim a task.

## Invocation

    /arc-worker MAIN | LAB | COWORK  [--resume <TASK-ID>]

`HERDR` is **rejected** — Herdr hosts and launches worker conversations but is not an
execution lane (contract principle 4). A Herdr-launched worker is a MAIN, LAB, or COWORK
worker like any other.

`OWNER` is also rejected. OWNER-lane tasks appear in the plan for dependency and mutex
bookkeeping; the owner executes them and holds their classes via the owner-ops ACQUIRE
procedure using holder id `__OWNER__`.

Read `references/runtime-contract.md` for the layout, registry, encoding and vocabulary,
and `references/claim-protocol.md` for the literal command sequences. Both are binding.

## Lifecycle

```
 0. Lane in {MAIN, LAB, COWORK}?            else -> IDLE            [W-V1]
 1. Resolve ROOT; absent or unresolvable    -> IDLE (never bootstrap) [W-V2]
 2. Read plans/current.json; missing/bad    -> IDLE
 3. Load plans/<planId>/plan.json; verify planHash; mismatch -> IDLE  [W-V3]

    -- if --resume <TASK-ID>: see "Resume" below, then jump to 10 --

 4. FILTER: lane == <LANE>  AND  claims/<id> absent
            AND every dependsOn task is COMPLETE
    none eligible                           -> IDLE
 5. SELECT exactly ONE - lowest priority number. Present it to the owner.
 6. CLAIM:  mkdir claims/<TASK-ID>          EEXIST -> next candidate
 7. ACQUIRE mutexes in canonical sorted order
            any EEXIST -> roll back ALL, release the claim -> STOP
 8. WRITE claim.json
 9. requiresOwnerGo ?
      YES -> state = WAITING_OWNER_GO -> REPORT -> STOP. DO NOT EXECUTE.
      NO  -> state = CLAIMED
10. LOAD published context; execute per entryMode
11. TERMINAL:
      close condition met -> COMPLETE, release own mutexes -> REPORT
      blocker / boundary  -> BLOCKED, RETAIN mutexes       -> REPORT
12. STOP. No automatic N+1. Never re-enter step 4.
```

## Write allowlist — exactly two path shapes

```
<ROOT>/claims/<own TASK-ID>/claim.json
<ROOT>/mutex/<own declared class>/holder.json
```

Creating the two containing directories — `claims/<own TASK-ID>/` and
`mutex/<own declared class>/` — is part of claiming and is permitted. **Nothing else.**

Any need to write outside these shapes is an **unconditional STOP**, including
`authorized.json`, anything under `plans/`, another task's claim, a mutex whose
`holder.json` names a different `taskId`, and the runtime root itself.

Stated as literal patterns so owner review is a mechanical diff. `allowed-tools` is not
runtime-enforced (X-9), so this list plus review is the only real fence.

## Resume

`--resume` exists because the base lifecycle cannot reach an authorized task: step 4
filters on *claim absent*, so a task the owner moved to `AUTHORIZED` would never be
selected. Resume is fail-closed at every precondition.

```
R1. claims/<TASK-ID>/claim.json present, well-formed, lane == <LANE>     [W-V9]
R2. state == AUTHORIZED, or CLAIMED following an owner RESUME
R3. authorized.json present, valid, planId AND planHash match current.json
      state AUTHORIZED with no valid authorized.json -> BLOCKED. Never repair it.
R4. every declared mutex directory exists AND its holder.json names THIS taskId
      missing        -> re-acquire in canonical order
      held by another -> BLOCKED, retain what is already held
R5. increment resumeCount, update conversationId, append stateHistory
```

Any precondition failing means **BLOCKED**, never "proceed anyway". Resume never changes
`state` to `AUTHORIZED` — it only consumes an authorization the owner already wrote.

## Mutexes

Acquired in **canonical sorted order by every worker, without exception** — that is the
entire deadlock-avoidance strategy. Order is computed on the **unencoded** class string;
the `:` to `__` substitution happens only when forming the directory name.

There is **no timeout, no backoff, and no retry loop.** Contention is a terminal stop.
Those mechanisms would reintroduce the races `mkdir` was chosen to eliminate.

| Event | Disposition |
|---|---|
| `COMPLETE` | Release **own** mutexes, after verifying each `holder.json.taskId` |
| `BLOCKED` | **RETAIN** — a half-finished edit must not be raced |
| Conversation dies | **RETAIN** — the intended fail-closed cost; recovery is an owner act |
| Another holder's mutex | **Never** touched |

`COMPLETE` is written to `claim.json` **before** any release. A crash between the two
strands the mutexes, which the owner can clear; the reverse order would free them while
the claim still read `CLAIMED`.

## Routing — DIRECT vs `/plan`

`entryMode` comes **only** from the published snapshot. The worker may not upgrade or
downgrade it, and may not infer it from how large the task looks.

- `DIRECT` — execute against the task's `closeCondition`.
- `PLAN` — first action after claiming (and after authorization where required) is `/plan`
  scoped to this task, owner-approved, then execute.

A `DIRECT` task that hits a Policy v3 RE-PLAN trigger — material scope change, a blocker
invalidating the approach, two consecutive failed attempts, a dependency proven false, an
imminent boundary crossing — goes **BLOCKED** with reason `entry-mode-insufficient`.
Re-routing is an owner act.

## Fail-closed catalogue

Every one resolves to IDLE or BLOCKED. **None resolves to "proceed anyway."**

Missing root · unreadable `current.json` · plan hash mismatch · unknown lane · unknown
mutex class · unsatisfied or cyclic dependency · malformed `claim.json` · unknown state
string · `AUTHORIZED` without a valid `authorized.json` · claim recorded against a
`planId` that is no longer current · mutex holder mismatch on resume · a newer
`.ai-reports` artifact than the published snapshot.

That last one is worth stating plainly: a worker noticing a newer planning artifact does
exactly one thing — **report it and stay on the published snapshot.**

## Reporting

Use `templates/worker-report.md`. Report both the **task state** (what is on disk) and the
**worker outcome** (what this conversation did). They are different vocabularies and
conflating them produces illegal transitions — a pre-claim mutex refusal leaves the task
`UNCLAIMED` with outcome `STOPPED`, and writes no state at all.

## Stop conditions

Stop and report without executing if: the lane is invalid; the root is missing; the plan
hash mismatches; no task is eligible; the selected task requires owner GO; a mutex is
held; a resume precondition fails; the claim's `planId` is not current; or the task would
require writing outside the two allowlisted path shapes.
