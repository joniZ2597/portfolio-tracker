# ARC AUDIT — <YYYY-MM-DD>

Advisory only. Not an approval. `CHECKPOINT.md` and ratified handoffs remain authoritative.

**Coverage** — root: `<path>` · handoffs scanned: `<n>` · CHECKPOINT headings: `<n>` ·
queue items: `<n>` · filters: `<--since / --arc / none>`
**Normalization flags** — unrecognized status: `<n>` · unknown actor suffix: `<n>` ·
unattributed arc: `<n>` (each listed in §5)

## 1. ARC health

| Arc | Status | Last meaningful progress | Expected next step | Owner lane |
|---|---|---|---|---|
| | | | | |

Status is the normalized class plus the raw string where they differ.
"Last meaningful progress" = newest artifact showing execution, not planning.

## 2. Duplicate / overlapping work

Two artifacts proposing the same work with no succession link. State both filenames
and the overlap. If a succession link exists, this is not duplication — report it in §4.

## 3. Forgotten / orphaned approved work

Approved work with no owner lane and no successor artifact. State the approving
artifact, its date, and its age in days.

## 4. Stale / superseded artifacts

Archival candidates only — **never deletion**. Supersession is listed here only where
it is explicit (`SUPERSEDED-BY`, `Consumes:`, or a named ratified ruling).

## 5. Ownership / lane conflicts

Two artifacts asserting different status or ownership for one arc.

Where no explicit succession can be proven, classify `CONFLICT — OWNER RULING REQUIRED`
and quote both conflicting claims. **Do not choose a winner by inference.** A newer
date alone is not succession.

Normalization flags (unrecognized status strings, unknown actor suffixes, unattributed
arcs) are listed here as items requiring owner ruling, never silently resolved.

## 6. Planning-loop warnings

Arcs with 3+ consecutive planning/scoping artifacts and zero implementation artifacts
between them. List the chain in date order.

## 7. Recommended focus

One recommendation. Two maximum. Say why, in one sentence each.

## 8. Explicit HOLD / IDLE

What should not be started, and what should stay idle, with the reason. Anything
awaiting an owner ruling from §5 belongs here.

---

Escalate to Codex only when a finding would deactivate or re-prioritize an arc the
owner believes is active, would strip a lane of work, or contradicts a ratified
contract. Routine staleness/duplication flags and focus recommendations do not.
