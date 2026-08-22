---
name: arc-authorize
description: Owner-invoked authorization of a single claimed ARC task. Moves exactly one task from WAITING_OWNER_GO to AUTHORIZED by writing authorized.json and updating claim.json, after verifying the claim exists, is in the correct state, and is pinned to the current published plan of its own namespace. Selects exactly one namespace from the typed literal — the legacy stream, or --arc <ARC-ID> — and never searches or falls back to the other. Sole writer of authorized.json. Repair-capable and idempotent. Never claims, never executes, never publishes, never abandons. Prints the task's execution-profile ladder from the embedded snapshot (arc-worker/scripts/phase-gate.js --ladder, A-V5) so the GO visibly covers every phase, grant and lock-out.
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Grep, Glob
---

# ARC Authorize

> **STANDING BEHAVIOR — OWNER-INVOKED ONLY. THE AUTHORIZATION BOUNDARY.**
> This skill is the **sole writer** of `authorized.json` and the only path by which a claim
> may reach `AUTHORIZED`. It authorizes **one** task per invocation. It NEVER claims a
> task, NEVER executes one, NEVER publishes, NEVER writes `ABANDONED`, NEVER releases or
> acquires a mutex, and NEVER creates the runtime root. It NEVER authorizes a task that is
> not already claimed into `WAITING_OWNER_GO`. **Authorizing is not executing** — a worker
> must still be resumed to run the task. It NEVER reads the namespace it did not select and
> NEVER falls back from one to the other.

`WAITING_OWNER_GO -> AUTHORIZED` is the one transition the whole approval model rests on.
Nothing else in ARC V1 can produce it.

## Invocation

    /arc-authorize <TASK-ID> [--arc <ARC-ID>] [--note "<text>"]

`--note` records the scope or condition of the grant — for example a live call authorized
for one symbol only. It is stored verbatim in `authorized.json` and is durable evidence of
what was actually approved.

`--arc <ARC-ID>` selects the ARC namespace: the pointer is `plans/arcs/<ARC-ID>/current.json` and
the claim is `arc-claims/<ARC-ID>/<TASK-ID>/`. **Without the flag the invocation is legacy-only**:
it reads `plans/current.json` and `claims/<TASK-ID>/` and never searches `arc-claims/`, even when
the same `TASK-ID` plainly exists there. Use the same selector the claim was taken under; the
worker prints it in its `WAITING_OWNER_GO` report.

## Procedure

```bash
# @op authorize-namespace   (resolves the one namespace this grant lives in; reads nothing)
ROOT="$(git rev-parse --path-format=absolute --git-common-dir)/arc-runtime"
case "${ARC:-}" in
  "")           PTR="$ROOT/plans/current.json";           CLAIMS="$ROOT/claims" ;;
  CORE-STREAM)  echo "REFUSED - CORE-STREAM is the registry index entry for the legacy stream, never a runtime arcId"; exit 1 ;;
  *)            PTR="$ROOT/plans/arcs/$ARC/current.json"; CLAIMS="$ROOT/arc-claims/$ARC" ;;
esac
C="$CLAIMS/$TASK_ID/claim.json"
A="$CLAIMS/$TASK_ID/authorized.json"
```

```
1. Resolve root; absent -> REFUSE (never bootstrap)
1a. Resolve the namespace from the literal; an invalid --arc, an unpublished or
    retired ARC, or a missing arc-claims/<ARC-ID>/ container -> REFUSE, nothing read
2. Read the selected pointer; load plans/<planId>/plan.json; verify planHash [A-V1]
3. Read claim.json under the SELECTED claim root only
     missing or malformed                                    -> REFUSE
     state != WAITING_OWNER_GO                                -> REFUSE     [A-V2]
       exception: state == WAITING_OWNER_GO and authorized.json
       already present -> REPAIR MODE, resume at step 5
4. claim.planId == pointer.planId AND claim.planHash == pointer.planHash
     else                                                     -> REFUSE     [A-V3]
4a. claim.arcId equals the --arc literal, and is absent without it          [A-V6]
     else                                                     -> REFUSE
5. The task's row in the published plan still declares requiresOwnerGo: true
     else                                                     -> REFUSE     [A-V4]
5a. Profile binding (P-C): node "$MAIN_WT/.claude/skills/arc-worker/scripts/phase-gate.js"
        --plan "$ROOT/plans/<planId>/plan.json" --task <TASK-ID> --ladder
     exit 0 "W-V10 verified"                  -> paste the ladder into the report
     exit 0 "profile none (legacy snapshot)"  -> report "profile none", no refusal
     exit 4 (profile-binding-missing |
             profile-hash-mismatch)            -> REFUSE     [A-V5]
6. write authorized.json.tmp (carrying arcId iff --arc) ; mv -f -> authorized.json
7. write claim.json.tmp (state=AUTHORIZED, stateHistory appended) ; mv -f
8. Emit the report from templates/authorize-report.md
```

`authorized.json` carries `arcId` when, and only when, `--arc` was typed, so the token matches its
own directory under `runtime-identity.js authorizedMatchesPath` — the committed helper, never a
re-implementation. A token in `claims/` must not carry one; a token in
`arc-claims/<ARC-ID>/<TASK-ID>/` must carry exactly that one.

### Why step 6 precedes step 7

The invariant is **`state == AUTHORIZED` if and only if a valid, plan-matched
`authorized.json` exists.**

Writing the token first means a crash between the two steps leaves `authorized.json`
present with the state still `WAITING_OWNER_GO` — a detectable half-state that re-running
this command repairs. The reverse order would leave a claim reading `AUTHORIZED` with no
token, which a worker treats as **forgery or corruption** and refuses outright.

## Refusals

| # | Condition | Reject |
|---|---|---|
| A-V1 | `planHash` mismatch against the snapshot | `A-V1 REFUSED - published plan failed hash verification` |
| A-V2 | State is not `WAITING_OWNER_GO` | `A-V2 REFUSED - <TASK-ID> is <state>, not WAITING_OWNER_GO` |
| A-V3 | Claim pinned to a different plan | `A-V3 REFUSED - claim is against <planId>, current is <planId>` |
| A-V4 | Plan row no longer requires owner GO | `A-V4 REFUSED - <TASK-ID> does not declare requiresOwnerGo` |
| A-V5 | The task's embedded execution profile does not bind — `profile-binding-missing`, or `profile-hash-mismatch` under W-V10 (a legacy snapshot without `executionProfiles` is **not** a refusal) | `A-V5 REFUSED - <TASK-ID> profile binding <reason>` |
| A-V6 | The claim's identity is not the selected namespace: `claim.arcId` != the `--arc` literal, or an `arcId` present on a `claims/` record (`runtime-identity.js claimMatchesPath`) | `A-V6 REFUSED - <TASK-ID> claim carries arcId <x>, selector is <y>` |
| — | Invalid `--arc` literal, `--arc CORE-STREAM`, an unpublished or retired ARC, or a missing `arc-claims/<ARC-ID>/` container | `REFUSED - <reason>; nothing was read` |
| — | No claim directory **under the selected namespace** | `REFUSED - <TASK-ID> is UNCLAIMED in <arc \| the legacy stream>; there is nothing to authorize here. The other namespace is never searched` |
| — | `authorized.json` already present **and** state already `AUTHORIZED` | `REFUSED - already authorized at <ts>` |

**A-V3 exists because authorization must not survive a plan change.** `authorized.json`
carries `planId` and `planHash` for the same reason. If the plan moved under a claim, the
answer is owner recovery (`owner-ops.md` section 9), never a re-grant against stale terms.
The comparison is always against the pointer of the claim's **own** namespace; a legacy claim is
never compared to an ARC pointer, or the reverse.

**A-V6 exists because a grant is scoped to one identity.** The same `TASK-ID` can be claimed in the
legacy stream and in several ARCs at once; authorizing the wrong one would hand permission to a
task the owner never looked at. The selector, the directory and the record must all agree, and no
fallback search is performed to make them agree.

**A-V2 is not a formality.** A task must be *claimed* before it can be authorized —
authorizing an unclaimed task would grant permission with no reserved mutexes, so the
resources the task needs could be taken by someone else before it ever ran.

**A-V5 makes the GO visibly cover the execution policy.** The ladder — recommended/ceiling
per phase, any bounded `grant`, the P-V25 lock-outs — is printed by
`arc-worker/scripts/phase-gate.js --ladder` from the profile embedded in the published
snapshot (`executionProfiles[row.executionProfile]`, hash-pinned by `planHash`); this skill
is the single renderer's consumer (K7), never reads the profile library, and never
re-renders the ladder by hand. `MAIN_WT` is `dirname(git rev-parse --path-format=absolute
--git-common-dir)`. Mode is prompting policy, never authority: the GO authorizes the task
row's terms, not a permission mode, and `authorized.json` is unchanged (`planHash` already
pins the embedded profile).

## Repair mode

`authorized.json` present while the state still reads `WAITING_OWNER_GO` means an earlier
run crashed between steps 6 and 7. Re-running this command validates the existing token
against the current plan and completes the state transition. It is idempotent: the token
is not rewritten and `authorizedAt` is preserved.

If the existing token fails A-V3 against the current plan, **refuse** and hand it to owner
recovery — do not silently reissue it.

## After authorization

The task is authorized but **not running**. Nothing executes until:

    /arc-worker <LANE> --resume <TASK-ID> [--arc <ARC-ID>]

with the **same selector** this grant was issued under — a resume under a different `--arc` stops
with nothing written (D-6). The base worker lifecycle filters on *claim absent*, so an
`AUTHORIZED` task is invisible to it — `--resume` is the only path. That worker re-verifies the
claim's namespace identity, the token, the plan pinning, and every mutex holder pair before
executing.

## Stop conditions

Stop and report without writing if: the root is missing; the `--arc` literal is invalid or names an
ARC that is not published, is retired, or has no claim container; the plan fails hash verification;
the claim is absent **under the selected namespace**, malformed, or in any state other than
`WAITING_OWNER_GO`; the claim carries an `arcId` that is not the selector (A-V6); the claim
is pinned to a superseded plan; the plan row no longer requires owner GO; the task is
already authorized; or the request asks this skill to claim, execute, publish, abandon,
release a mutex, search the other namespace, or authorize more than one task.

## Known limitation

**R-1, accepted and unmitigated in V1.** Nothing in the filesystem prevents a worker
writing `authorized.json` itself; `allowed-tools` is not runtime-enforced (X-9). The
guarantee rests on charter prose plus owner review. The available mitigation — an
owner-supplied value a worker cannot derive — is reserved as the unused `ownerToken` field
in `authorized.schema.json` and deliberately not built now.
