# Optimization Rules — reference for `approval-flow-optimizer`

Advisory rulebook only. Nothing here authorizes any action. All optimizations
are proposals; every write, execution, owner-UI action, external call,
control-log append, or posture change still requires its own separate, explicit,
one-time owner approval.

## 1. Classification matrix (13 categories)

Classify each remaining step by one or more categories. The weight column is the
authority/write cost that governs whether a step can ever be merged.

| Category | One-line test | Weight |
|---|---|---|
| planning | Produces a plan/spec/prompt only; writes no artifact but the plan file | none |
| read-only review | Inspects existing bytes; makes no change | none |
| read-only preflight | Re-verifies live state immediately before an action; no change | none |
| file creation | Creates a new local file | write |
| local write | Edits/creates a local, non-control, non-runtime file | write |
| control-log append | Appends to an authoritative control record (e.g. EXECUTION_LOG) | high — audit |
| Git mutation | add/commit/push/merge/reset/checkout/branch | high |
| external-system mutation | Netlify env/gate/deploy, remote state change | high |
| owner UI action | An action only the owner performs in an external UI | owner-only |
| live call | A real request to an external/live API or endpoint | high |
| time-critical transaction | A step inside a bounded freshness window (e.g. 30s) | sequenced |
| evidence generation | Produces a pinned evidence artifact | write |
| reporting | Emits a verbatim result/summary; no change | none |

## 2. Safe-consolidation rules (allowed patterns)

a. **Combine adjacent read-only review + preflight** — only under the
   review/preflight-merge rule in §3.
b. **Batch read-only checks** — hashes, `node --check` / syntax checks, literal
   two-file diffs, and invariant/count checks may run together in one read-only
   turn.
c. **Front-load a time-critical window** — prepare all helpers, prompts,
   decision branches, and owner-UI instructions *before* the window opens.
   Nothing inside the window may require new tooling, review, or preflight.
d. **Helper over inline sequence** — replace a complex/fragile inline command
   sequence with one reviewed, pinned, bounded, single-purpose helper (see §7).
e. **One approval for one atomic helper** — a single exact approval may cover a
   helper that represents one already-approved atomic purpose (e.g. the ratified
   execute + capture + verify bundle).
f. **Stop restating unchanged anchors; pre-produce boundaries** — do not re-list
   anchors that have not changed, and may pre-produce the next several planned
   boundaries in advance — while still requiring separate authorization wherever
   the contract requires it.

## 3. Review/preflight merge rule

Static review and execution preflight may be merged **only when all three
hold**:

1. they inspect the **same immutable bytes**,
2. **no intervening mutation** occurred between them, and
3. **every check is read-only**.

If any of the three fails — different bytes, any mutation in between, or any
non-read-only step — they remain **separate boundaries**.

## 4. Prohibited-consolidation rules (never merge)

- planning **with** execution
- unreviewed helper creation **with** helper execution
- unrelated writes in one boundary
- an owner-UI mutation **with** any hidden or additional command
- an external mutation **with** its evidence reconciliation
- a control-log append **with** the operation it records, when the governing
  contract requires an independent append boundary
- any retry, rollback, cleanup, deletion, or broader authority not already
  approved
- **catch-all:** anything whose visible approval preview would no longer be
  **one short, literal, understandable action**

## 5. Approval-preview rules

Every proposed consolidated action MUST still render as a single clean literal
preview. Reject the consolidation if it would introduce: shell expansion, a
second command, a wildcard, a persistent/broader permission grant, or any
element that makes the preview not one short understandable action. The visible
approval preview is authoritative — if it is duplicated, expanded, truncated, or
warned, the action is not ready.

## 6. Time-critical-transaction preparation rules

- Everything reviewable is staged, reviewed, and preflighted **before** the
  clock starts.
- Once the window opens, no planning, helper creation, static review, or new
  preflight may occur inside it.
- If the window expires before the gated action begins, discard and recapture
  under a new, separately approved execution — never reuse a stale snapshot.

## 7. Helper-versus-inline-command decision rules

Prefer **one reviewed, pinned, single-purpose helper** when the action is
multi-step, is fragile under shell quoting (e.g. backslash/JSON payloads), or
requires byte-exact fidelity. Prefer **one literal read-only command** when the
check is a single hash/list/type/diff and a helper would add more surface than
it removes. A helper is only as trustworthy as its own static review at a pinned
SHA.

## 8. Contract-amendment decision rules

If an optimization is reachable **only** by changing a specific written contract
rule:

- name the **exact** rule it would change,
- place it in bucket **B** (amendment-required), never bucket A,
- state the benefit and the new risk,
- give a **recommend-only** verdict — the skill never self-adopts an amendment;
  adoption is an explicit owner action.

## 9. Bucket separation (A / B / C)

- **A — allowed now:** fully permitted under the current contract; depends on no
  rule change.
- **B — amendment-required:** needs an explicit contract change (per §8).
- **C — must remain separate:** a boundary that cannot be compressed (per §4),
  with the reason stated.

Never let efficiency, urgency, context limits, or fatigue move an item from B or
C into A.
