# Template — Plan Projection

Printed by `/arc-publish-plan` at step 5, **before** any write and **before** the owner
types `CONFIRM`. This rendering is the owner's only review surface for a derivation that is
model-mediated, so it is printed in full every time.

**Rules for this rendering:**

- Print **every** task. Never summarise, never elide, never write "…and 5 more".
- Never show a diff against a previous plan in place of the whole projection.
- Annotate each task with the source section it was derived from, so a claim can be checked
  against the artifact without re-reading the whole file.
- Mark any field the source does not state as `NOT STATED` and refuse — do not fill it in.
- **Print `closeCondition` for every task, and `stopCondition` for every task that has one,
  as literal resolved text.** Never a section reference, never an ellipsis, never "as above".
  **If the projection omits either field for any task, the publish flow stops** — an omitted
  field cannot be reviewed, and this print is the only owner-facing check on a model-mediated
  join (see `references/plan-validation.md` P-V15).

---

```
================================================================
ARC PLAN PROJECTION - PROPOSED, NOTHING WRITTEN YET
================================================================
source        .ai-reports/handoffs/<file>.md
sourceHash    <sha256>
source mtime  <ISO>          CHECKPOINT.md mtime  <ISO>   [P-V14: PASS | OVERRIDDEN]
repoRef       <40-char SHA>  HEAD  <40-char SHA>          [P-V10: PASS | OVERRIDDEN]
planId        <plan-id>                                   [P-V11: not present]
supersedes    <prior planId | none>

mutexRegistry  8 classes, canonical order:
  AUTHORITY:published-plan   CODE:index-html         CODE:netlify-functions
  DEPLOY:netlify             EXTERNAL:live-provider  QA:browser-runtime
  RUNTIME:gates              RUNTIME:owner-profile

----------------------------------------------------------------
TASKS (<n>)
----------------------------------------------------------------
[1] <TASK-ID>                                    from: <section>
    lane             MAIN
    entryMode        DIRECT
    requiresOwnerGo  false
    priority         1
    mutexes          CODE:index-html
                     QA:browser-runtime
    dependsOn        (none)
    closeCondition   <verbatim from source>
    stopCondition    <verbatim from source>

[2] <TASK-ID>                                    from: <section>
    ...
----------------------------------------------------------------
SAFE PARALLEL SETS
----------------------------------------------------------------
SET 1   <TASK-A> | <TASK-B> | <TASK-C>
        mutex intersection: none                          [P-V9: PASS]
SET 2   ...
----------------------------------------------------------------
VALIDATION
----------------------------------------------------------------
P-V1  task fields complete .................... PASS
P-V2  ids unique / normalized / fs-safe ....... PASS
P-V3  lanes valid, HERDR absent ............... PASS
P-V4  entryMode in {DIRECT, PLAN} ............. PASS
P-V5  mutex classes in registry ............... PASS
P-V6  dependencies resolve .................... PASS
P-V7  no dependency cycles .................... PASS
P-V8  mustNotParallelWith symmetric ........... PASS
P-V9  no parallel-set mutex conflict .......... PASS
P-V10 repoRef matches HEAD .................... PASS
P-V11 planId not already published ............ PASS
P-V12 source path repo-relative ............... PASS
P-V13 no live claims against outgoing plan .... PASS
P-V14 source not older than CHECKPOINT ........ PASS
----------------------------------------------------------------
OVERRIDES IN EFFECT
----------------------------------------------------------------
<none | --acknowledge-stale-source | --acknowledge-live-claims
      | --allow-ref-mismatch>
Each override is written into current.json. An override that is not
durably recorded is indistinguishable from a check that never ran.
================================================================
Nothing has been written. plans/current.json still points at
<prior planId | nothing>.

Type CONFIRM to publish. Any other response cancels.
================================================================
```

---

## Rendering notes

**Overrides are printed even when none are active.** An empty overrides block is evidence
the run was clean; omitting the block when empty makes its absence ambiguous.

**Validation lines print `PASS`, `OVERRIDDEN`, or `REFUSED`.** A refusal ends the run at
that line — do not print a full table with one failure buried inside it, and never print a
projection whose validation block contains a `REFUSED` alongside a `CONFIRM` prompt.

**A pointer-shaped condition is a refusal, not a rendering choice.** If a resolved value
reads `per section 2.1`, `see §2.1`, ``as `LX-2` `` or similar, print it, name the task and
field, and refuse under P-V15. Do not silently substitute the referenced text — that hides
which artifact the owner actually approved.

**`NOT STATED` is terminal.** If any mandatory field renders as `NOT STATED`, print the
projection up to that point, name the task and field, release the authority mutex, and
refuse. The owner's fix is to amend the source artifact, not to supply the value in chat —
a value typed in conversation is not in the snapshot and cannot be hash-pinned.

**Publishing is not authorization.** A published task with `requiresOwnerGo: true` still
requires `/arc-authorize` before it can execute. Do not let a successful publish report
read as a GO.
