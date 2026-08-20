# ARC Owner Operations — manual recovery procedures

Every operation here is an **owner act**, performed by hand. None is wrapped in a skill.

Contract section 6.2 is explicit about why: RELEASE, RESUME and ABANDON are rare,
destructive, and must be deliberate. A convenience wrapper is exactly the wrong ergonomics
for the operations that defeat principle 8 (no stale claim stealing).

```bash
ROOT="$(git rev-parse --path-format=absolute --git-common-dir)/arc-runtime"
```

## 1. Standing rules

| Rule | Why |
|---|---|
| Never touch another worker's **live** claim | Principle 8. A live claim is `CLAIMED`, `WAITING_OWNER_GO`, or `AUTHORIZED` with a running conversation |
| Never hand-edit anything under `plans/` | Snapshots are immutable and hash-pinned. A change is a new `planId`, published through the skill |
| Never let a worker perform any operation in this file | Workers write only their own claim and their own mutex holders |
| Release a mutex only after confirming `holder.json.taskId` | Deleting a directory held by someone else is the one unrecoverable mistake here |
| Record every operation in CHECKPOINT | Runtime state is durable but undocumented; CHECKPOINT is the audit trail |

A conversation that died without reaching a terminal state **retains its mutexes**. That is
the intended fail-closed cost of principle 8, not a bug to be automated away.

## 2. INSPECT — read-only

```bash
# Active plan
cat "$ROOT/plans/current.json"

# Every claim and its state
for c in "$ROOT"/claims/*/; do
  printf '%s  ' "$(basename "$c")"
  if [ -f "$c/claim.json" ]; then
    grep -o '"state"[[:space:]]*:[[:space:]]*"[A-Z_]*"' "$c/claim.json"
  else
    echo 'INCOMPLETE-CLAIM (no claim.json)'
  fi
done

# Every held mutex and its holder
for m in "$ROOT"/mutex/*/; do
  printf '%s  ' "$(basename "$m")"
  cat "$m/holder.json" 2>/dev/null || echo 'NO HOLDER FILE'
done
```

Run this first, always. Every other operation below depends on knowing the current state.

## 3. RELEASE

Removes a **stopped** claim so the task returns to `UNCLAIMED` and can be claimed again.

**Precondition:** state is `BLOCKED` or `ABANDONED`. Never release a live claim.

**`COMPLETE` is not a legal RELEASE source (owner ruling 2026-08-20, R-M; analysis:
`.ai-reports/handoffs/2026-08-16_arc-v1-completion-durability-ruling.MAIN.md`).** A retained
`COMPLETE` claim is the runtime's *only* record that the task finished, and worker
dependency resolution reads exactly that record (`arc-worker/references/runtime-contract.md`
§5.1). Releasing it makes every task that `dependsOn` it permanently and silently
unselectable — the worker reports `IDLE`, which is indistinguishable from having nothing to
do. `COMPLETE` claims are retained by design: they **are** the completion ledger, not
clutter (~1 KB per task).

To deliberately make a completed task runnable again, withdraw the completion on the record
first — the capability is preserved, it just cannot be silent:

```
COMPLETE --[OWNER ABANDON, section 5]--> ABANDONED --[OWNER RELEASE, here]--> UNCLAIMED
```

**Procedure** — for a `BLOCKED` or `ABANDONED` claim only:

```bash
TASK=<TASK-ID>
cat "$ROOT/claims/$TASK/claim.json"          # 1. confirm the state, then archive this
                                             #    text into your own notes or CHECKPOINT

for m in "$ROOT"/mutex/*/; do                # 2. release mutexes still held BY THIS TASK
  if grep -q "\"taskId\"[[:space:]]*:[[:space:]]*\"$TASK\"" "$m/holder.json" 2>/dev/null; then
    rm "$m/holder.json" && rmdir "$m" && echo "released $(basename "$m")"
  fi
done

rm "$ROOT/claims/$TASK"/*.json               # 3. remove the claim
rmdir "$ROOT/claims/$TASK"
```

Step 1 is not optional. Removing the claim destroys the only durable record that the task
ran, so the audit trail has to move somewhere before the directory goes.

## 4. RESUME

Returns a `BLOCKED` claim to an executable state.

**Precondition:** state is `BLOCKED`, and the blocking condition has actually been resolved.

Rewrite `claim.json` with `state` set to:

- `CLAIMED` — for a task whose plan row has `requiresOwnerGo: false`
- `AUTHORIZED` — **only** when `authorized.json` is present, valid, and its `planId` plus
  `planHash` match the current published plan

Append a `stateHistory` entry recording the transition, the timestamp, and the reason.
Then hand the task back to a worker:

```bash
/arc-worker <LANE> --resume <TASK-ID>
```

The worker re-verifies every mutex before executing. If any class it needs is now held by a
different `taskId`, it goes `BLOCKED` again and retains what it holds.

## 5. ABANDON

Owner-terminates a task held in any of the **six persisted states**.

**Not reachable from `UNCLAIMED`** (owner ruling, 2026-08-15). `UNCLAIMED` is the
absence of the claim directory, not a stored value — there is no `claim.json` to write
to, so there is nothing on disk to abandon. A task with no claim simply stays
unclaimed. This clarifies the model; it does not expand it.

```
state -> ABANDONED
```

Release its mutexes exactly as in section 3 step 2, but **retain the claim directory**.
`ABANDONED` is a durable record that the task was deliberately killed; deleting it would
make an abandoned task indistinguishable from one that never ran. Issue RELEASE later if
the task genuinely needs to become claimable again.

## 6. Owner-lane mutex ACQUIRE and RELEASE

Lane `OWNER` tasks are publishable but **not workable** — `/arc-worker` accepts only
`MAIN`, `LAB`, and `COWORK`. Without this procedure, an OWNER task's mutex classes would
never be held by anything, leaving the highest-value real-data operations unprotected.

The clearest live example: HS-2 E2 requires `RUNTIME:owner-profile`, which guards the real
browser profile and real `pt_*` data.

**Class name encoding.** `:` is not a legal NTFS filename character, so directory names
substitute `__` for it. Acquisition order is computed on the **unencoded** class string in
ASCII order, then each name is encoded:

| Canonical class | Directory |
|---|---|
| `AUTHORITY:published-plan` | `AUTHORITY__published-plan` |
| `CODE:index-html` | `CODE__index-html` |
| `CODE:netlify-functions` | `CODE__netlify-functions` |
| `DEPLOY:netlify` | `DEPLOY__netlify` |
| `EXTERNAL:live-provider` | `EXTERNAL__live-provider` |
| `QA:browser-runtime` | `QA__browser-runtime` |
| `RUNTIME:gates` | `RUNTIME__gates` |
| `RUNTIME:owner-profile` | `RUNTIME__owner-profile` |

ACQUIRE, using the reserved holder id `__OWNER__`:

```bash
CLASS=RUNTIME__owner-profile
mkdir "$ROOT/mutex/$CLASS" || { echo "HELD - stop"; cat "$ROOT/mutex/$CLASS/holder.json"; }
printf '{"taskId":"__OWNER__","lane":"OWNER","acquiredAt":"%s"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$ROOT/mutex/$CLASS/holder.json"
```

RELEASE:

```bash
rm "$ROOT/mutex/$CLASS/holder.json" && rmdir "$ROOT/mutex/$CLASS"
```

`__OWNER__` and `__PUBLISH__` are reserved. Publish validation rejects any task id starting
with a double underscore, so a published task can never collide with either.

## 7. Coordination domain — owner ruling 2026-08-15 (resolves R3)

**The domain for this project consists of the main worktree plus every linked worktree
whose `git rev-parse --git-common-dir` resolves to the same main `.git`.**

`portfolio-tracker-test-lab` is a **linked worktree, not an independent clone**. Any
contract or example wording treating it as a separate coordination domain is struck.
Claims and mutexes taken from those linked worktrees are therefore **enforcing**, and all
of them share one runtime at `<git-common-dir>/arc-runtime/`.

Verify the domain membership of any worktree before trusting a claim taken from it:

```bash
cd <worktree> && git rev-parse --path-format=absolute --git-common-dir
```

**The cross-clone rule is retained as a forward-looking V1 constraint.** If a true
independent clone exists with a different git-common-dir, it is a separate coordination
domain. V1 provides no cross-domain claim or mutex coordination. Any task whose safety
depends on synchronisation across domains **must fail closed** until it is explicitly
re-routed or coordinated by owner action.

As of 2026-08-15 no independent clone of this repository exists, so that constraint is
currently forward-looking rather than active.

**Consequence for planning artifacts.** Any execution-plan reasoning that justifies a
mutex set by citing a separate coordination domain must be rewritten. Conclusions may be
kept only where they hold for the task's actual mutex requirements — never preserved by
assumption. This applies directly to the LX-2 through LX-5 rows.

## 8. Residue recovery

| Residue | Meaning | Recovery |
|---|---|---|
| Claim directory with no `claim.json` | INCOMPLETE-CLAIM — the conversation died between the claim `mkdir` and the first write | Confirm no `holder.json` anywhere names this task; release any that do; then `rmdir` the claim directory |
| `COMPLETE` claim whose mutexes are still held | Crash during release. The write-then-release ordering makes this outcome deliberate | Release the **mutexes only** (section 3 step 2) and **retain the claim directory**; stamp `mutexesReleasedAt`. Full RELEASE is illegal from `COMPLETE` |
| `authorized.json` present while state reads `WAITING_OWNER_GO` | Crash between the two authorization writes | Re-run `/arc-authorize <TASK-ID>`; it is repair-capable and completes the transition |
| State reads `AUTHORIZED` with no `authorized.json` | Forgery or corruption. A worker must never produce this | **Stop.** Investigate before any recovery — this is the one residue implying the authorization boundary was crossed |
| `plans/.staging-<id>/` directory | A publish was interrupted before the rename | `current.json` never pointed at it. Delete the staging directory |
| Mutex directory with no `holder.json` | Crash between `mkdir` and the holder write | Confirm no live claim declares the class, then `rmdir` |

## 9. Cross-plan claims

A claim whose `planId` differs from `current.json` is refused by every worker and by
`/arc-authorize`. Publishing a new plan never rewrites live claims — silently retargeting
one would be stale-claim stealing under a different name.

Two resolutions, both owner acts:

1. **ABANDON then RELEASE** — the safe default. The task is re-claimed fresh against the
   current plan.
2. **Re-pin** — rewrite the claim's `planId` and `planHash` to the current values. Legitimate
   **only** when the task's row is byte-identical in both plans: same `id`, `lane`,
   `entryMode`, `requiresOwnerGo`, `mutexes`, `dependsOn`, and `closeCondition`. Diff the two
   rows before doing this, and record the comparison in CHECKPOINT.

## 10. Legal transitions

```
UNCLAIMED --mkdir, requiresOwnerGo=false--> CLAIMED
UNCLAIMED --mkdir, requiresOwnerGo=true --> WAITING_OWNER_GO

WAITING_OWNER_GO ------[OWNER ONLY]-------> AUTHORIZED

CLAIMED | AUTHORIZED ---------------------> BLOCKED      (worker or owner)
CLAIMED | AUTHORIZED ---------------------> COMPLETE     (worker)

<any of the 6 persisted states> --[OWNER]--> ABANDONED

BLOCKED -------------[OWNER ONLY]---------> CLAIMED | AUTHORIZED    (RESUME)
BLOCKED | ABANDONED -------------[OWNER]--> UNCLAIMED               (RELEASE)
```

Anything not listed is illegal and fails closed to `BLOCKED`.

`COMPLETE` is **terminal-durable** (owner ruling 2026-08-20, R-M): its only outgoing transition is
the owner-only `COMPLETE -> ABANDONED`. It is deliberately **not** a RELEASE source — see
section 3.

`AUTHORIZED` and `ABANDONED` are writable only through an owner-invoked path. A worker may
never write either one, under any condition.
