# Template — Authorize Report

Emitted by `/arc-authorize` after `claim.json` reaches `AUTHORIZED`.

```
================================================================
ARC TASK AUTHORIZED
================================================================
task          <TASK-ID>
lane          MAIN
arc           <ARC-ID>             | none - legacy stream
claim root    arc-claims/<ARC-ID>/<TASK-ID>   | claims/<TASK-ID>   (legacy namespace)
planId        <plan-id>            planHash <sha256>  verified: yes
              from plans/arcs/<ARC-ID>/current.json | plans/current.json
authorizedAt  <ISO>                authorizedBy <owner>
note          <verbatim, or: none>

state         WAITING_OWNER_GO  ->  AUTHORIZED
mode          normal | repair (completed an interrupted authorization)

----------------------------------------------------------------
WRITES PERFORMED
----------------------------------------------------------------
<claim root>/authorized.json         created   (sole writer; arcId iff --arc)
<claim root>/claim.json              state updated, stateHistory appended
  Nothing else was written. No mutex was acquired or released.
  No plan, snapshot, or other claim was touched, and the namespace this
  invocation did not select was never read.

----------------------------------------------------------------
MUTEXES HELD BY THIS CLAIM
----------------------------------------------------------------
CODE:index-html          -> mutex/CODE__index-html          holder (<ARC-ID> | legacy, <TASK-ID>)
EXTERNAL:live-provider   -> mutex/EXTERNAL__live-provider   holder (<ARC-ID> | legacy, <TASK-ID>)
  Held since the claim was taken. Unchanged by this authorization.
  Classes are global: these are blocked for every other ARC and for the
  legacy stream while this claim holds them.

----------------------------------------------------------------
WHAT WAS AUTHORIZED
----------------------------------------------------------------
entryMode        DIRECT | PLAN
closeCondition   <verbatim from the published row>
stopCondition    <verbatim from the published row>

----------------------------------------------------------------
PHASE LADDER   (phase-gate.js --ladder, pasted verbatim - A-V5)
----------------------------------------------------------------
profile        MAIN-CODE-SLICE v1  libraryHash <sha256>  W-V10 verified
phases         PLAN M/M -> IMPLEMENT M/M -> VERIFY A/A -> HANDOFF A/A -> CLOSE M/M
grant          none | IMPLEMENT -> ACCEPT_EDITS paths index.html mutex CODE:index-html (requiresOwnerGo true)
lock-out       netlify/functions/** (CODE:netlify-functions not held by <TASK-ID>) | none
  Legacy snapshot: "profile none (legacy snapshot)" - no ladder, no refusal.
  This GO covers the ladder, every grant and every lock-out exactly as printed.
  It authorizes the row's terms, not a permission mode.

================================================================
AUTHORIZED IS NOT RUNNING.

Nothing executes until:
    /arc-worker <LANE> --resume <TASK-ID> [--arc <ARC-ID>]

with the SAME selector this grant was issued under. That worker
re-verifies the claim's namespace identity, the token, the plan
pinning, and every mutex holder pair before it does any work.

This grant is pinned to plan <plan-id> in <arc <ARC-ID> | the legacy
stream>. If that plan is republished, the authorization no longer
applies and the claim needs owner recovery - not a re-grant against
stale terms. It says nothing about the same <TASK-ID> in any other
namespace.
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

**Paste the ladder, never paraphrase it.** The PHASE LADDER block is the `--ladder` output of
`arc-worker/scripts/phase-gate.js` (single renderer, K7). A `grant` line is the bounded MAIN
`ACCEPT_EDITS` grant the GO covers; a `lock-out` line is a code surface the row cannot write
because it does not hold the class. Omitting either widens or narrows what was approved.

**Repair mode is stated explicitly.** An owner seeing `mode repair` learns an earlier
invocation was interrupted, which is worth knowing even though the outcome is identical.
`authorizedAt` is preserved from the original token, not refreshed.

## On refusal, this template is not used

Report the rule id (`A-V1`…`A-V6`), the exact offending value, and the single corrective
action. There is no partial authorization: either `authorized.json` exists and the claim
reads `AUTHORIZED`, or neither is true.

**Name the namespace in every refusal.** "UNCLAIMED" means unclaimed *here*; the same `TASK-ID` may
well be claimed under another selector, and the corrective action is to retype the selector, not to
re-run the same command. Never resolve the ambiguity by searching — say which namespace was looked
in and stop.

Never soften a refusal into a conditional grant. `A-V3` in particular — a claim pinned to
a superseded plan — must go to owner recovery, because re-granting against terms that have
since changed is precisely the silent retargeting the publication model forbids.
