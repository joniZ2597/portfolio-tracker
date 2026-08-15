# Template — Publish Report

Emitted by `/arc-publish-plan` at step 11, after the `current.json` swap has committed.

```
================================================================
ARC PLAN PUBLISHED
================================================================
planId        <plan-id>
planHash      <sha256 of plan.json as written>
source        .ai-reports/handoffs/<file>.md
sourceHash    <sha256>
ref           <40-char SHA>
publishedAt   <ISO>          publishedBy  <owner>
supersedes    <prior planId | none>

snapshot      <ROOT>/plans/<plan-id>/
                plan.json      <n> bytes
                source.md      <n> bytes
                manifest.json  <n> bytes
current.json  -> <plan-id>     (atomic replace committed)

----------------------------------------------------------------
TASKS PUBLISHED  <n>
----------------------------------------------------------------
lane MAIN    <n>    lane LAB     <n>
lane COWORK  <n>    lane OWNER   <n>   (not workable; owner-executed)

requiresOwnerGo: true   <n>  -> these CANNOT execute until /arc-authorize
requiresOwnerGo: false  <n>
entryMode PLAN          <n>
entryMode DIRECT        <n>

----------------------------------------------------------------
VALIDATION   P-V1 ... P-V14 all PASS
----------------------------------------------------------------
OVERRIDES    <none | list, each also recorded in current.json>

----------------------------------------------------------------
CARRIED-OVER CLAIMS  <n>
----------------------------------------------------------------
<TASK-ID>  state <STATE>  planId <old-plan-id>
  Recorded for audit only. claim.json was NOT modified.
  The holding worker will detect the planId mismatch at its next
  checkpoint and stop. Resolve via owner-ops section 9.
<or: none>

----------------------------------------------------------------
MUTEX STATE
----------------------------------------------------------------
AUTHORITY:published-plan   released
<other classes currently held, with holder taskId, or: none held>

================================================================
PUBLICATION IS NOT AUTHORIZATION.

Every task still requires its own owner GO before execution.
Tasks with requiresOwnerGo: true additionally require
/arc-authorize before any worker may run them.

No task has been claimed. No worker has been started.
================================================================
```

---

## Reporting notes

**The closing block is not decoration.** Publication makes work *discoverable*, never
approved. A report that reads as a green light is the failure mode this block exists to
prevent — the execution plan itself states that nothing in it authorizes implementation and
that every READY row still needs its own owner GO.

**Carried-over claims are always shown**, including the "none" case. Their silent absence
would be indistinguishable from a scan that did not run.

**Mutex state is printed at publish time** because it is the cheapest moment to notice a
stranded class from a dead conversation — before anyone tries to claim against the new plan
and gets an unexplained refusal.

**On refusal, this template is not used.** Report the P-V rule id, the offending value, the
source location, and the single corrective action. Do not emit a partial publish report;
there is no partial publish.
