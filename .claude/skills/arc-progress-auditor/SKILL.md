---
name: arc-progress-auditor
description: Manually invoked read-only project/ARC reconciliation for Portfolio Tracker / Pulse. Scans durable handoffs, CHECKPOINT, and the endgame queue, then returns one concise audit — arc health, duplicate work, forgotten/orphaned approved work, stale or superseded artifacts, ownership conflicts, planning-loop warnings, recommended focus, and an explicit HOLD/IDLE list. Advisory only — never modifies state, never authorizes anything.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob
---

# Arc Progress Auditor

> **STANDING BEHAVIOR — READ-ONLY, ADVISORY ONLY, NON-AUTHORIZING.**
> This skill only *reads* durable project artifacts and *returns one report in
> the conversation*. It NEVER modifies roadmap or status fields, edits or creates
> any file, writes its own audit artifact, touches `CHECKPOINT.md` / the queue /
> any handoff, creates implementation work, launches LAB, changes Git state, runs
> shell commands, or calls any external system. It NEVER silently reclassifies
> anything — every reclassification is a flag for owner ruling. It NEVER becomes
> a competing source of truth: `CHECKPOINT.md` and ratified handoffs remain
> authoritative. It NEVER treats its own findings, system pressure, or context
> limits as authorization. **Producing this report is not an approval.**

Owner-invoked only (`/arc-progress-auditor`). Per Policy v3 §0.1 the audit runs
before starting a meaningful new arc, launching a new parallel LAB/Herdr batch,
reactivating an arc that has been HOLD for a while, after a major milestone when
the queue may have shifted, or when accumulated handoffs raise duplication risk.
Not for small edits.

## Invocation

    /arc-progress-auditor [--root <path>] [--since <YYYY-MM-DD>] [--arc <name>]

- `--root` — audit an alternate artifact root (verification fixtures). Default: repo root.
- `--since` — ignore artifacts dated before this date.
- `--arc` — restrict the report to a single arc.

## 1. SCAN

Read `references/scan-contract.md` first. It defines the artifact roots, the
filename and header contracts, the status normalization table, the required tool
mechanics, and the CHECKPOINT/queue reading rules.

Header-only. Never read a handoff body during SCAN. Extract per artifact: arc,
actor suffix, date, status, `Consumes:`, `Companion:`, and declared next step.
Anything that does not match the contract normalizes to `UNKNOWN` and is reported
as a flag — never silently bucketed.

## 2. RECONCILE

Group artifacts by arc. Order by date **for display only — date order is not
authority order.**

Succession may be established ONLY by explicit evidence:

- `Status: SUPERSEDED-BY <filename>` recorded in the superseded artifact, or
- a later artifact citing the earlier one in `Consumes:`, or
- a ratified owner / Main Control ruling that names the succession.

**A newer date alone NEVER overrides an older authoritative artifact.**

When two authoritative artifacts conflict and no explicit succession can be
proven, classify the arc `CONFLICT — OWNER RULING REQUIRED`, quote both
conflicting claims, and stop there. Do not choose a winner by inference. Do not
rank by recency, author, lane, verbosity, or confidence.

## 3. FLAG

- **Duplication** — two artifacts proposing the same work with no succession link between them.
- **Orphans** — approved work with no owner lane and no successor artifact.
- **Staleness** — an arc marked active with no meaningful progress for **14+ days** (heuristic; report it, never rule on it).
- **Conflicts** — two artifacts asserting different status or ownership for one arc (see RECONCILE).
- **Planning loops** — 3 or more consecutive planning/scoping artifacts on one arc with zero implementation artifacts between them.
- **Normalization flags** — unrecognized status string or actor suffix.

## 4. RECOMMEND

One recommended focus (maximum two) plus an explicit HOLD/IDLE list. Recommendations
are advisory input to Main Control, never a decision.

## 5. Output

Return the report **in the conversation only**, following `templates/arc-audit.md`
— 8 sections, target ≤2 pages. Do not write a file. If Main Control later
authorizes recording the audit durably, the filename is `<date>_arc-audit.MAIN.md`
(never `.COWORK.md` — the suffix denotes the authoring tool).

## Codex escalation

**Justified:** a finding that would deactivate or re-prioritize an arc the owner
believes is active; an ownership-conflict finding that would strip a lane of work;
any finding contradicting a ratified contract (e.g. HS-1).

**Unnecessary:** routine staleness or duplication flags, archival candidates, and
focus recommendations the owner can accept or reject from the table in under a minute.

## Stop conditions

Stop and report without completing the audit if: the artifact root is missing or
unreadable; `CHECKPOINT.md` is absent; more than 20% of scanned artifacts fail
header normalization (the contract has drifted — report it rather than guessing);
or the request asks for anything beyond a read-only advisory report.
