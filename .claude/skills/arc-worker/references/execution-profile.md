# Execution Profile — binding contract (ARC V1.2, owner-accepted r2 + amendment r2.1)

> **Increment status.** P-A defines and provides this contract, `arc-publish-plan/references/schemas/execution-profile.schema.json`,
> the committed library at `arc-publish-plan/references/execution-profiles/`, and the additive optional
> `plan.schema.json` fields (working-tree implementation under QA; commit/push require their own owner authorization).
> **P-B (publisher resolution + embedding, P-V21…P-V26) and P-C (worker phase handshake) are not implemented and are inactive.**
> `arc-worker/SKILL.md` is unchanged; no worker reads a profile yet. This document states the contract those
> increments will implement, so it cannot drift from what the library encodes today.

Design record: `.ai-reports/handoffs/2026-08-21_execution-profile-amendment-v1-2.MAIN.md` (r2, FINAL ACCEPTED) with the
r2.1 owner amendments of 2026-08-21 appended there.

## 1. Vocabulary

```
mode      ∈ { MANUAL, ACCEPT_EDITS, AUTO }     strictly ordered  MANUAL < ACCEPT_EDITS < AUTO
kind      ∈ { PLAN, IMPLEMENT, VERIFY, REPORT, TERMINAL }
entryGate ∈ { NONE, AUTHORIZED_JSON, OWNER_TYPES_SKILL, OWNER_TYPED_LITERAL }
boundary  ∈ { git-stage, git-commit, git-push, deploy, env-change, gate-toggle,
              live-external-call, pt-write, runtime-mutation-other-claim, scope-expansion, production }
```

Per phase: `recommendedMode` (operator ergonomics — the preferred mode) and `modeCeiling` (safety — the highest
mode under which the phase may perform a write), with the invariant **`recommendedMode ≤ modeCeiling`**.

| Harness mapping (observed at P-A; names to be re-checked at P-C) | Profile value |
|---|---|
| default — every write and command prompts | `MANUAL` |
| acceptEdits — file edits auto-accepted, commands prompt | `ACCEPT_EDITS` |
| Auto Mode — broad auto-approval | `AUTO` |

## 2. Mode is a prompting policy, never an authority

A stricter mode than recommended is **always legal**. The profile declares ceilings and recommendations and
grants **nothing**: what a worker may touch is fixed by `scope`, `capabilities`, `tools`, `approvalBoundaries`
and the V1 runtime write allowlist, **identically in every mode**. A mode above the ceiling is
**STOP-before-write**. The worker **never changes the harness mode itself** (section 5).

## 3. Ceiling rules (validator-enforced at publish, P-V23 — P-B)

| Phase touches… | Ceiling | Grantable higher? |
|---|---|---|
| git refs (stage / commit / push / merge / checkout / reset), `.git/arc-runtime/**` beyond own claim + own holders, deploy, Netlify, env vars, gates, production, `pt_*` / owner profile, live external calls | **MANUAL** | **Never**, in any lane (r2.1 ruling 3). |
| **MAIN lane — any phase** | **MANUAL** by default; `ACCEPT_EDITS` only by an explicit per-phase `grant` (bounded, section 4) | **Never `AUTO`, in any MAIN phase, not even a no-write VERIFY** (r2.1 ruling 1). |
| linked-worktree sandbox, `network: none`, `git: read-only`, no mutex class, LAB | `ACCEPT_EDITS` for IMPLEMENT / REPORT | `AUTO` only for `kind: VERIFY` with writes ⊆ sandbox output ∪ scratchpad |
| `.ai-reports/**` only, COWORK | `ACCEPT_EDITS` | — |
| `kind: TERMINAL` (writes `claim.json`) | **MANUAL** | never |
| OWNER lane | `MANUAL` | n/a — not workable |

**A linked worktree isolates files, not authority**: all worktrees share one `.git`, so a LAB sandbox must
declare `git: read-only` explicitly. The main worktree's `.netlify/state.json` is linked to the production
site, so `deploy` is `none` for every worker profile.

## 4. Boundaries, actions and the bounded grant (r2.1 rulings 3 and 4)

- **No boundary is grantable.** `approvalBoundaries.inside` must be **empty**; `approvalBoundaries.outside`
  must list **all eleven** names. Every boundary crossing is a MANUAL owner act.
- **Actions.** A phase that performs a boundary action declares it in `actions[]` (worker-declarable set:
  `git-stage`, `git-commit`, `gate-toggle`, `live-external-call`, `pt-write`). **Non-empty `actions` force
  `modeCeiling: MANUAL`.** `git-push`, `deploy`, `env-change`, `production`, `runtime-mutation-other-claim`
  and `scope-expansion` are never worker actions.
- **Capability ↔ action, exactly:** `gates: toggle-with-repark` ⇒ a MANUAL `gate-toggle` phase ·
  `network: live-provider` ⇒ a MANUAL `live-external-call` phase · `ownerProfile: write` ⇒ a MANUAL
  `pt-write` phase · `git: stage` ⇒ a MANUAL `git-stage` phase and **no** `git-commit` · `git: commit` ⇒ a
  MANUAL `git-commit` phase (plus `git-stage` wherever the workflow stages) · `git: read-only` ⇒ no git action.
  **`git-stage` is its own boundary; `git-commit` is never overloaded to mean generic git mutation.**
- **Bounded MAIN grant** (`ACCEPT_EDITS` only): `kind: IMPLEMENT` only; named code paths ⊆ `scope.writes`
  and never `.git/`, `.netlify/`, `netlify.toml`, `.env*`, `pt_`; a `CODE:*` class the task row must hold;
  profile `requiresOwnerGo: true` (P-B forces the row to match); **never `AUTO`; never co-located with any
  action**.

## 5. Mode Transition Protocol — operator handshake (documented here; **implemented in P-C, not yet active**)

The worker never changes the Claude Code permission mode. At **every phase entry**, before any write of that
phase, it prints:

```
PHASE ENTRY   <TASK-ID>   phase <id> (<kind>)   [<n> of <N>]
recommendedMode   … | modeCeiling … | last acknowledged … (operator, <ISO>) | UNKNOWN at first phase
harness signal    <value if exposed> | NOT MACHINE-VERIFIABLE
write scope       … | forbidden here … | action …
```

| Situation (vs `lastAcknowledgedMode`, UNKNOWN until the first handshake) | Worker action |
|---|---|
| First phase of the task | **Always handshake** — launch mode is unknown. STOP; request `MODE <X>`. |
| `recommendedMode` > last acknowledged (more automation wanted) | **STOP.** Ask the operator to change the mode in the UI and reply with the literal `MODE <MODE-THEY-SET>`. Continue only after it. |
| last acknowledged > `modeCeiling` | **STOP-before-write — mandatory.** No write until the operator acknowledges a mode ≤ ceiling. |
| ≤ ceiling but stricter than recommended | **Continue**; record `stricter-than-recommended`. |
| equals recommended | **Continue**; record `as-recommended`. |

Acknowledgement is the typed literal `MODE MANUAL` / `MODE ACCEPT_EDITS` / `MODE AUTO` in the operator's own
message; approval-shaped words are not an acknowledgement. The worker never prints "mode changed"; it prints
"operator acknowledged `MODE X` at <ISO>". Record is **report-only** (`claim.json` unchanged).

**Harness-signal observation (section 7-1 of the design record, recorded at P-A, 2026-08-21):** in the installed
Claude Code build, transitions into and out of Auto Mode surface as *system notices inside the conversation*;
there is **no on-demand query**, and no notice was observed for Manual ⇄ Accept Edits. A notice is
corroboration when present; the operator's literal remains the evidence of record. **P-C must re-verify**
before relying on any signal.

## 6. Placement and authoring

Profiles live **only** in the committed library; a plan source references one **by id** (`executionProfile`).
Top-level `executionProfiles` in `plan.schema.json` is the **publisher-owned embedded snapshot field** (written
by P-B resolution; never authored). Workers will consume the embedded copy **only**. The ARC registry
(Increment 1) carries **no** execution policy. `libraryHash` = sha256 of the library file bytes (CR stripped),
computed at resolution; never stored in the library.

## 7. Validation map

| Layer | Where |
|---|---|
| Normative schema | `arc-publish-plan/references/schemas/execution-profile.schema.json` (closed enums, `if/then` invariants) |
| Executable mirror (P-A) | `qa/arc_execution_profiles_offline.js` — EP-V1…EP-V15, with drift guards that read the enums and `required` arrays back out of the schema |
| Publish-time rules (P-B, **not yet active**) | P-V21 profile present/resolvable (mandatory for every new publication) · P-V22 lane match · P-V23 ceilings/recommendations · P-V24 entry-mode agreement · P-V25 scope ↔ mutex coverage · P-V26 skill invocability |

## 8. Amendment r2.1 — owner rulings of 2026-08-21 (recorded so schema and governance record cannot drift)

1. **MAIN lane: AUTO is never permitted in any phase** (supersedes r2 sections 3.2/3.5, which allowed AUTO on a
   no-write MAIN VERIFY). `MAIN-CODE-SLICE` VERIFY is `ACCEPT_EDITS/ACCEPT_EDITS`.
2. The two optional `plan.schema.json` fields belong to P-A; nothing becomes required; legacy plans stay valid.
3. **No boundary is grantable.** Gate / live-provider / `pt_*` / git / runtime / deploy / env / production
   actions occur only in MANUAL phases, declared per phase via `actions[]`; `inside` is always empty.
4. **`git-stage` is a distinct boundary/action** (vocabulary ten → eleven); staging is never represented as
   `git-commit`; `git-stage`, `git-commit`, `git-push` are all non-grantable.
