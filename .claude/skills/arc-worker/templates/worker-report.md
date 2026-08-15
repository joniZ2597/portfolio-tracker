# Template — Worker Report

Emitted by `/arc-worker` at every terminal point, including IDLE.

**Task state and worker outcome are printed separately, always.** They are different
vocabularies: the state is what is on disk, the outcome is what this conversation did. A
pre-claim mutex refusal is `taskState UNCLAIMED` with `outcome STOPPED` — reporting it as
`BLOCKED` would assert a transition the model does not permit.

```
================================================================
ARC WORKER REPORT
================================================================
lane          MAIN
task          <TASK-ID>              (or: none eligible)
planId        <plan-id>
planHash      <sha256>               verified: yes
conversation  <id>                   resumeCount <n>

task state    CLAIMED | WAITING_OWNER_GO | AUTHORIZED
              | BLOCKED | COMPLETE | UNCLAIMED
worker outcome  IDLE | STOPPED
entryMode     DIRECT | PLAN

----------------------------------------------------------------
MUTEXES
----------------------------------------------------------------
acquired (canonical order)
  CODE:index-html          -> mutex/CODE__index-html
  QA:browser-runtime       -> mutex/QA__browser-runtime
released      <list | none - RETAINED because state is BLOCKED>
blocked on    <class, held by taskId>   (only on a contention stop)

----------------------------------------------------------------
WRITES PERFORMED
----------------------------------------------------------------
claims/<TASK-ID>/claim.json
mutex/<CLASS>/holder.json          x<n>
  Both shapes are inside the allowlist. Nothing else was written.

----------------------------------------------------------------
WORK
----------------------------------------------------------------
close condition   <verbatim from the published row>
met?              yes | no - <reason>
evidence          <what was produced, where it lives>
stop condition    <verbatim>   triggered? no | yes - <which>

----------------------------------------------------------------
NOTES
----------------------------------------------------------------
<newer .ai-reports artifact observed, if any - reported, NOT acted on>
<any fail-closed condition encountered>
================================================================
STOPPED. No second task was selected.
Recommended next step: <single next action, owner's to take>
================================================================
```

---

## Per-outcome requirements

**IDLE** — state the specific reason from the fail-closed catalogue: missing root, no
`current.json`, hash mismatch, invalid lane, or no eligible task. Never report a bare
"nothing to do"; each cause has a different fix.

**WAITING_OWNER_GO** — say explicitly that execution has **not** started and that
`/arc-authorize <TASK-ID>` is required. List the mutexes held, since they are reserved
while the owner decides. Do not describe what the work would involve — that reads as
having begun it.

**BLOCKED** — record the exact blocker, and state that mutexes are **RETAINED** and which
ones. Name the three owner options: RELEASE, RESUME, ABANDON.

**COMPLETE** — evidence against the published `closeCondition`, confirmation that each
released mutex was verified as this task's before release, and `mutexesReleasedAt`. The
claim persists as `COMPLETE` for audit until the owner issues RELEASE.

**STOPPED on contention** — the blocking class and its holder. Make clear the task is
still `UNCLAIMED` and that nothing was written; the next attempt is a fresh claim, not a
resume.

## Standing rules for this report

**Never report a task as done because its conversation ended.** Only a met
`closeCondition` produces `COMPLETE`.

**Never recommend the next task.** One task per conversation; suggesting a successor is
the automatic-N+1 behaviour principle 5 forbids. The Recommended next step names a single
owner action.

**Never present a claim as authorization.** A claimed task with `requiresOwnerGo: true`
has reserved resources and nothing more.
