# Execution Profile — binding contract (ARC V1.2, owner-accepted r2 + amendment r2.1)

> **Increment status.** P-A (committed `a2fec4e`) defines and provides this contract, `arc-publish-plan/references/schemas/execution-profile.schema.json`,
> the committed library at `arc-publish-plan/references/execution-profiles/`, and the additive optional
> `plan.schema.json` fields. **P-B (publisher resolution + embedding, P-V21…P-V26) is implemented in B1** (committed `7b54b39`;
> `arc-publish-plan/scripts/resolve-profiles.js`). **P-C (worker phase handshake, scope STOP, authorize ladder print) is implemented in B2**
> (`arc-worker/scripts/phase-gate.js`; working-tree implementation under QA — commit/push require their own owner authorization).
> `/arc-worker` and `/arc-authorize` read the profile **embedded in the published snapshot only**; nothing reads the library at
> runtime. This document states the contract the implementation encodes, so it cannot drift from the library or the scripts.

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

| Harness permission-mode vocabulary (CLI choices re-checked at P-C / B2 on Claude Code 2.1.239; the active harness mode is not machine-readable and was not re-observed) | Profile value |
|---|---|
| `manual` — every write and command prompts (P-A called this "default") | `MANUAL` |
| `acceptEdits` — file edits auto-accepted, commands prompt | `ACCEPT_EDITS` |
| `auto` — broad auto-approval | `AUTO` |
| `plan`, `dontAsk`, `bypassPermissions` | **UNMAPPED** — not profile modes and not ordered against any ceiling; they cannot satisfy an acknowledgement; if one is visibly active when a write would occur, the phase is STOP-before-write until the operator returns to `manual`, `acceptEdits` or `auto` (owner ruling R-7, 2026-08-22) |

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

## 5. Mode Transition Protocol — operator handshake (**implemented in P-C / B2** — `arc-worker/scripts/phase-gate.js --phase`; binding `--ladder`; scope `--scope`)

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

**Decision order (`phase-gate.js` `decide`, ULTRAPLAN r3 §6), evaluated at every phase entry after the entry
gate** (`AUTHORIZED_JSON` on `phases[0]` is satisfied only by the `--resume` preconditions R1–R5, never by
conversation text; `entry-gate-unsatisfied` is a STOP that waits until that precondition is satisfied):

```
1. recommended > ceiling                               → INVALID-PHASE (refuse the phase)
   an UNMAPPED harness mode visibly active             → STOP-before-write (unmapped-harness-mode)
2. lane == MAIN and AUTO acknowledged or signalled     → STOP-before-write (main-never-auto)
3. lastAcknowledgedMode == UNKNOWN                     → HANDSHAKE-REQUIRED: STOP, request MODE <recommended>
4. acknowledged or signalled mode > ceiling            → STOP-before-write (mode-exceeds-ceiling)
5. recommended > acknowledged, not yet asked           → STOP-request-MODE-literal (automation-increase-needed)
6. otherwise                                           → CONTINUE: as-recommended | stricter-than-recommended
                                                                    | looser-than-recommended (within the ceiling)
```

Rows 2–5 are resolved only by the operator's literal: any `MODE <X>` with `X ≤ ceiling` satisfies them (the
worker re-runs `--phase … --last-ack X --answered`); `X < recommended` continues as `stricter-than-recommended`
and is recorded `declined-increase` when it answers row 5; `X > ceiling` stops again; one handshake per phase
entry, never re-asked. The unmapped-harness rule is resolved only by the operator returning to a mapped harness
mode (`manual`, `acceptEdits`, `auto`), after which the worker re-evaluates. The literal is exactly
`MODE MANUAL` / `MODE ACCEPT_EDITS` / `MODE AUTO`, case-sensitive, on its own line, in the operator's own message;
approval words, lowercase, trailing words, quoted or fenced text, or two literals are not an acknowledgement
(`parseAck`). **Restart / resume:** `lastAcknowledgedMode := UNKNOWN`; walk the ladder from `phases[0]` with
`--resumed`, `SKIP-evidenced (no write)` where exit evidence exists, perform otherwise; the report states
`resumed: yes; prior acknowledgements not carried`. **Scope STOP:** a needed write outside the phase's resolved
write scope (`--scope`: placeholders substituted, P-V25 lock-outs removed) ∪ the V1 allowlist ⇒ BLOCKED
`scope-expansion`, mutexes retained. **PHASE EXIT** is one line with the exit evidence, then the next PHASE
ENTRY. The PHASES block (`renderPhases`: phase · kind · recommended · ceiling · acknowledged · acknowledgedAt ·
outcome) goes into the worker report and the handoff; outcomes are `as-recommended`, `stricter-than-recommended`,
`looser-than-recommended`, `declined-increase`, `stopped-above-ceiling`, `SKIP-evidenced`.

**Harness-signal observation (section 7-1 of the design record, recorded at P-A, 2026-08-21):** in the installed
Claude Code build, transitions into and out of Auto Mode surface as *system notices inside the conversation*;
there is **no on-demand query**, and no notice was observed for Manual ⇄ Accept Edits. A notice is
corroboration when present; the operator's literal remains the evidence of record.

**Re-verified at P-C / B2 (2026-08-22, Claude Code 2.1.239; owner ruling R-8 — no harness toggle or
re-observation was performed; only the CLI `--permission-mode` vocabulary was re-checked):** no tool, API or
command available to a session returns the current permission mode (`claude auto-mode config` prints settings,
not session state; `--permission-mode` is a launch flag). The P-A observation was **not re-observed** during B2
and stands unchanged. The banner therefore prints `harness signal NOT MACHINE-VERIFIABLE` unless a notice is
visible, in which case the worker passes its text as `--harness-signal` — corroboration only: a signalled mode
above the ceiling (or `auto` on MAIN) is STOP-before-write regardless of how it was learned, and the operator's
literal remains the evidence of record.

## 6. Placement and authoring

Profiles live **only** in the committed library; a plan source references one **by id** (`executionProfile`).
Top-level `executionProfiles` in `plan.schema.json` is the **publisher-owned embedded snapshot field** (written
by P-B resolution — `arc-publish-plan/scripts/resolve-profiles.js`, **implemented in B1**; never authored).
Workers consume the embedded copy **only** (P-C: `arc-worker/scripts/phase-gate.js` binds
`executionProfiles[row.executionProfile]` and verifies W-V10 from the embedded bytes alone; a snapshot without
`executionProfiles` is `profile none (legacy snapshot)` — V1 behaviour, no handshake). The ARC registry
(Increment 1) carries **no** execution policy. `libraryHash` = sha256 of the library file bytes (CR stripped), computed at resolution
(`arc-publish-plan/scripts/lib/profile-contract.js`); never stored in the library.

## 7. Validation map

| Layer | Where |
|---|---|
| Normative schema | `arc-publish-plan/references/schemas/execution-profile.schema.json` (closed enums, `if/then` invariants) |
| Executable mirror (P-A) | `qa/arc_execution_profiles_offline.js` — EP-V1…EP-V15, with drift guards that read the enums and `required` arrays back out of the schema |
| Publish-time rules (P-B, **implemented B1** — `arc-publish-plan/scripts/lib/profile-contract.js` `planCheck`, run by `scripts/resolve-profiles.js`; QA `qa/arc_publish_profiles_offline.js`) | P-V21 profile present/resolvable (mandatory for every new publication) · P-V22 lane match · P-V23 ceilings/recommendations · P-V24 entry-mode agreement · P-V25 scope ↔ mutex coverage · P-V26 skill invocability — full text in `arc-publish-plan/references/plan-validation.md` |
| Worker / authorize (P-C, **implemented B2** — `arc-worker/scripts/phase-gate.js`: `--ladder` binding + W-V10 + ladder print (A-V5), `--phase` decision + PHASE ENTRY banner, `--scope` resolution + P-V25 lock-outs; requires the B1 `profile-contract.js` helper module read-only and never reads the execution-profile library JSON at runtime; QA `qa/arc_worker_handshake_offline.js`) | K4 embedded-only · K5 legacy · W-V10 · section 5 decision rows 1–6 · literal parser · PHASES renderer · D-16 scope resolution (claim-root-agnostic `--claim-dir`) · entry gate · zero writes, git-free |

## 8. Amendment r2.1 — owner rulings of 2026-08-21 (recorded so schema and governance record cannot drift)

1. **MAIN lane: AUTO is never permitted in any phase** (supersedes r2 sections 3.2/3.5, which allowed AUTO on a
   no-write MAIN VERIFY). `MAIN-CODE-SLICE` VERIFY is `ACCEPT_EDITS/ACCEPT_EDITS`.
2. The two optional `plan.schema.json` fields belong to P-A; nothing becomes required; legacy plans stay valid.
3. **No boundary is grantable.** Gate / live-provider / `pt_*` / git / runtime / deploy / env / production
   actions occur only in MANUAL phases, declared per phase via `actions[]`; `inside` is always empty.
4. **`git-stage` is a distinct boundary/action** (vocabulary ten → eleven); staging is never represented as
   `git-commit`; `git-stage`, `git-commit`, `git-push` are all non-grantable.
