# Template — Authorize Report

Emitted by `/arc-authorize` after `claim.json` reaches `AUTHORIZED`.

```
================================================================
ARC TASK AUTHORIZED
================================================================
task          <TASK-ID>
lane          MAIN
planId        <plan-id>            planHash <sha256>  verified: yes
authorizedAt  <ISO>                authorizedBy <owner>
note          <verbatim, or: none>

state         WAITING_OWNER_GO  ->  AUTHORIZED
mode          normal | repair (completed an interrupted authorization)

----------------------------------------------------------------
WRITES PERFORMED
----------------------------------------------------------------
claims/<TASK-ID>/authorized.json     created   (sole writer)
claims/<TASK-ID>/claim.json          state updated, stateHistory appended
  Nothing else was written. No mutex was acquired or released.
  No plan, snapshot, or other claim was touched.

----------------------------------------------------------------
MUTEXES HELD BY THIS CLAIM
----------------------------------------------------------------
CODE:index-html          -> mutex/CODE__index-html
EXTERNAL:live-provider   -> mutex/EXTERNAL__live-provider
  Held since the claim was taken. Unchanged by this authorization.

----------------------------------------------------------------
WHAT WAS AUTHORIZED
----------------------------------------------------------------
entryMode        DIRECT | PLAN
closeCondition   <verbatim from the published row>
stopCondition    <verbatim from the published row>

================================================================
AUTHORIZED IS NOT RUNNING.

Nothing executes until:
    /arc-worker <LANE> --resume <TASK-ID>

That worker re-verifies the token, the plan pinning, and every
mutex before it does any work.

This grant is pinned to plan <plan-id>. If the plan is republished,
the authorization no longer applies and the claim needs owner
recovery - not a re-grant against stale terms.
================================================================
```

---

## Reporting notes

**The closing block is load-bearing.** A report that reads as "the task is underway" is
the failure this template exists to prevent. Authorization reserves permission; a worker
resume is a separate, explicit act.

**Print the mutexes even though this skill does not change them.** They were acquired at
claim time and are reserved while the owner deliberates. Showing them makes the cost of a
long-held `WAITING_OWNER_GO` visible — a claim holding `CODE:index-html` blocks every
other Main-lane slice for as long as it sits there.

**Echo `note` verbatim.** If the grant was narrow — one symbol, one run, gates re-parked
afterwards — that scope is the durable record of what was actually approved. Paraphrasing
it widens it.

**Repair mode is stated explicitly.** An owner seeing `mode repair` learns an earlier
invocation was interrupted, which is worth knowing even though the outcome is identical.
`authorizedAt` is preserved from the original token, not refreshed.

## On refusal, this template is not used

Report the rule id (`A-V1`…`A-V4`), the exact offending value, and the single corrective
action. There is no partial authorization: either `authorized.json` exists and the claim
reads `AUTHORIZED`, or neither is true.

Never soften a refusal into a conditional grant. `A-V3` in particular — a claim pinned to
a superseded plan — must go to owner recovery, because re-granting against terms that have
since changed is precisely the silent retargeting the publication model forbids.
