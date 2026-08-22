# Template — Publish Report

Emitted by `/arc-publish-plan` at step 11, after the `current.json` swap has committed.

```
================================================================
ARC PLAN PUBLISHED
================================================================
planId        <plan-id>
planHash      <sha256 of plan.json as written>
projectionHash <sha256 confirmed at step 5 - equal to planHash, asserted at step 8>
RESOLVER      scripts/resolve-profiles.js <sha256> · lib/profile-contract.js <sha256>
source        .ai-reports/handoffs/<file>.md
sourceHash    <sha256>
ref           <40-char SHA>
publishedAt   <ISO>          publishedBy  <owner>
supersedes    <prior planId | none>
arc           <ARC-ID> (plan.json · manifest.json · current.json all carry arcId <ARC-ID>; arcIdTriple ARC)
              | none - legacy stream (no arcId written anywhere; arcIdTriple LEGACY)
claims root   arc-claims/<ARC-ID>/ | claims/
container     arc-claims/<ARC-ID>/ created | already present  |  n/a (legacy stream)

snapshot      <ROOT>/plans/<plan-id>/
                plan.json      <n> bytes
                source.md      <n> bytes
                manifest.json  <n> bytes
pointer       plans/arcs/<ARC-ID>/current.json | plans/current.json  -> <plan-id>   (atomic replace committed)
registry write-back   OK - .ai-reports/arcs/<ARC-ID>/arc.json state EXECUTING, execution.planId <plan-id>
                      | DRIFT - <reason>; runtime pointer NOT rolled back; owner repair (registry-contract.md section 9)
                      | n/a (legacy stream)

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
PROFILES EMBEDDED  <n>
----------------------------------------------------------------
<PROFILE-ID>   v<version>   libraryHash <sha256>   tasks <n>
<or: none - legacy snapshot; P-V21 refuses this for every new publication>

----------------------------------------------------------------
VALIDATION   P-V1 ... P-V17 · P-V19 ... P-V26   <n> PASS · <n> OVERRIDDEN · <n> N/A · 0 REFUSED
             (a published plan has no REFUSED rule; OVERRIDDEN rules are listed below;
              N/A only for P-V17 / P-V19 / P-V20 on a legacy publication; P-V18 retired, no row)
----------------------------------------------------------------
OVERRIDES    <none | list, each also recorded in current.json;
              --acknowledge-stale-promotion is recorded in the registry history note>
LOCK-OUTS    <none | <TASK-ID>: <surface> (<class> not held)>

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
AUTHORITY:published-plan   released   (holder was {__PUBLISH__, arcId <ARC-ID>} | {__PUBLISH__, no arcId})
<other classes currently held, with holder (arcId ?? legacy, taskId), or: none held>

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

**Lock-outs and embedded profiles are always shown**, including the "none" case, for the
same reason: a worker's effective write scope is the embedded profile's scope minus the
lock-outs, and the owner must be able to read that from the report alone. `projectionHash`
equals `planHash` by construction — step 8 refuses otherwise — so the report restates both.

**Mutex state is printed at publish time** because it is the cheapest moment to notice a
stranded class from a dead conversation — before anyone tries to claim against the new plan
and gets an unexplained refusal.

**The `arc` line restates the three-way identity** (X-3): for an ARC publication `plan.json`,
`manifest.json` and `plans/arcs/<ARC-ID>/current.json` carry one equal `arcId`, asserted by
`runtime-identity.js arcIdTriple` before the swap; a legacy publication writes none. `claims root`
and `container` say which namespace the publication reaches and whether step 9b created it.

**A `DRIFT` write-back is reported, never repaired here.** The runtime commit point (step 10)
stands; the registry index is the owner's to reconcile (registry-contract.md section 9). A report
that rolled the pointer back to "fix" the index would destroy a valid publication.

**On refusal, this template is not used.** Report the P-V rule id, the offending value, the
source location, and the single corrective action. Do not emit a partial publish report;
there is no partial publish.
