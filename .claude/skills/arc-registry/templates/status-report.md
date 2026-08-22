# Template — Registry Status Report

Emitted by `/arc-registry status [--arc <ARC-ID>]` in the conversation only. Read-only;
advisory; not an approval. `CHECKPOINT.md` and the published snapshots remain authoritative.

```
================================================================
ARC REGISTRY STATUS                                <ISO>
================================================================
registry root   <ARCS>                             entries <n>   (filter: --arc <ARC-ID> | none)
runtime root    <ROOT>                             plans/arcs: present|absent   arc-claims: present|absent
schema          arc-publish-plan/references/schemas/arc.schema.json

----------------------------------------------------------------
REGISTRY
----------------------------------------------------------------
arcId          state       impl  rev  promotion          execution (documentary index)
CORE-STREAM    EXECUTING   true  0    none (grandfather) planId parallel-arc-v3-2026-08-15 · pointer plans/current.json · claimsRoot claims/
EP-PILOT       IDEA        false 0    none               none
<ARC-ID>       INVALID - <reason>                         (malformed entry; never repaired here)

----------------------------------------------------------------
POINTERS
----------------------------------------------------------------
legacy   plans/current.json                 planId <id>   planHash <8>…   (no arcId - correct; indexed by CORE-STREAM)
arc      plans/arcs/<ARC-ID>/current.json   planId <id>   planHash <8>…   arcId <ARC-ID>   triple ARC | MANIFEST-ARCID-MISMATCH
         (none - plans/arcs/ absent: pre-bootstrap, informational)

----------------------------------------------------------------
CLAIMS - legacy namespace  claims/
----------------------------------------------------------------
claims/<TASK-ID>                 <state>        planId <id>     identity (legacy, <TASK-ID>)   MATCH
claims/<TASK-ID>                 INCOMPLETE-CLAIM (no claim.json)

----------------------------------------------------------------
CLAIMS - ARC namespaces  arc-claims/<ARC-ID>/
----------------------------------------------------------------
arc-claims/<ARC-ID>/<TASK-ID>    <state>        planId <id>     identity (<ARC-ID>, <TASK-ID>)  MATCH | CLAIM-ARCID-MISMATCH
(none - arc-claims/ absent: pre-bootstrap, informational)

----------------------------------------------------------------
MUTEX HOLDERS   (arcId ?? legacy, taskId)
----------------------------------------------------------------
CODE__index-html          (legacy, <TASK-ID>)     lane MAIN   since <ISO>   claim present | HOLDER-WITHOUT-CLAIM
QA__browser-runtime       (<ARC-ID>, <TASK-ID>)   lane LAB    since <ISO>   claim present
(none held)

----------------------------------------------------------------
FLAGS
----------------------------------------------------------------
DRIFT                    <arcId>  <detail>
STALE-READY              <arcId>  promotion.rulingAt <ISO> older than 7 days (flag only)
ORPHAN-CLAIM             <claim path>  taskId not in the current plan of its namespace
STRAY-REGISTRY           <path>  arc.json outside the main-worktree root
DUPLICATE-ID-INFO        <TASK-ID>  present in claims/ and arc-claims/<ARC-ID>/   (informational, expected)
CLAIM-ARCID-MISMATCH     <claim path>  <reason from runtime-identity.js>
HOLDER-WITHOUT-CLAIM     <class>  (<arcId ?? legacy>, <taskId>)
MANIFEST-ARCID-MISMATCH  <ARC-ID>  <reason from runtime-identity.js arcIdTriple>
(no flags)
================================================================
ADVISORY ONLY. Nothing above is an approval, a promotion, a publication or an authorization.
Nothing was written. Owner acts remain typed literals (PROMOTE / CONFIRM / MODE / RESUME).
================================================================
```

## Rendering notes

- **Separate headings per claim namespace, always.** `claims/*` (legacy) and `arc-claims/*/*`
  (ARC) are never merged into one list; the same `taskId` appearing under both is
  `DUPLICATE-ID-INFO`, informational and expected.
- **The legacy pointer carries no `arcId` and is never flagged for it.** Only ARC pointers are put
  through `arcIdTriple({ plan, manifest, current }, "<ARC-ID>")`.
- `execution.pointer` and `execution.claimsRoot` are printed as what they are — a documentary
  index — and cross-checked against the runtime for `DRIFT`; they are never read by any runtime
  path.
- Holders print the owner pair `(arcId ?? legacy, taskId)`; `__PUBLISH__` / `__OWNER__` are
  reserved ids and never raise `HOLDER-WITHOUT-CLAIM`.
- A malformed `arc.json` is rendered `INVALID` with its reason and left untouched.
- `--arc <ARC-ID>` filters REGISTRY, POINTERS and the ARC-claims section (`--arc CORE-STREAM`
  filters to the legacy index entry); the legacy sections and the holders are always listed.
- Flag vocabulary is exactly the eight names of `registry-contract.md` section 9; auditor flags
  are never mixed in.
