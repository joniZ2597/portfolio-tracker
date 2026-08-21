# Execution Profile Library — V1.2 P-A (committed, library-only)

This directory is the **only** place an execution profile may be authored. One file per
profile, `<PROFILE-ID>.json`, validated by `../schemas/execution-profile.schema.json`
(normative) and mirrored executably by `qa/arc_execution_profiles_offline.js` (EP-V1 … EP-V15).
The contract itself — mode model, ceilings, boundaries, the Mode Transition Protocol — is
written in `arc-worker/references/execution-profile.md`.

**Increment status.** P-A defines and provides this library, the schema and the contract
(working-tree implementation under QA; commit/push require their own owner authorization).
**P-B (publisher resolution and embedding) and P-C (worker phase handshake) are not
implemented**; nothing in `/arc-publish-plan` or `/arc-worker` reads this directory yet.

## Rules

| Rule | Statement |
|---|---|
| Library-only | No inline or ad-hoc profiles. A plan source names a profile **by id** (its `executionProfile` column); that is the only authoring surface. Top-level `executionProfiles` in `plan.schema.json` is the **future publisher-owned embedded snapshot field** — written only by P-B resolution from this library, never authored. P-B must refuse any source that attempts to author it. |
| Identity | File name `== profileId + '.json'`; ids match `^[A-Z0-9]([A-Z0-9-]*[A-Z0-9])?$` (≤ 32) and are unique case-folded. |
| Canonical serialization | UTF-8, LF, 2-space indent, schema key order, single trailing newline. `JSON.stringify(JSON.parse(file), null, 2) + '\n'` must reproduce the file byte-for-byte. |
| `libraryHash` | `sha256` of the profile file bytes with `\r` stripped. Computed and embedded **by the publisher at resolution time (P-B)**; **never stored in a library file**. |
| Mode ≠ authority | `recommendedMode` / `modeCeiling` are prompting policy. Scope, capabilities, tools, boundaries and the runtime write allowlist bind identically in every mode. |
| r2.1 (owner, 2026-08-21) | MAIN lane never AUTO in any phase · no boundary is grantable (`inside` is always empty; `outside` lists all eleven) · gate / live-provider / `pt_*` / git / runtime / deploy / env / production actions occur only in MANUAL phases, declared per phase via `actions[]` · `git-stage` is its own boundary; `git-commit` is never overloaded. |
| Change control | A new task shape ⇒ a new profile added here by a reviewed commit. Library files are immutable once a snapshot has embedded them (the embedded copy + `libraryHash` pin the bytes). |

## The seven canonical profiles (ladders are `recommended / ceiling`)

| Profile | Lane | Ladder |
|---|---|---|
| `LAB-SANDBOX-STATIC` | LAB | BUILD A/A → RUN AUTO/AUTO → HANDOFF A/A → CLOSE M/M |
| `MAIN-CODE-SLICE` | MAIN | PLAN M/M → IMPLEMENT M/M → VERIFY A/A → HANDOFF A/A → CLOSE M/M |
| `MAIN-CODE-SLICE-BOUNDED` | MAIN | PLAN M/M → IMPLEMENT A/A + grant (`index.html`, `CODE:index-html`, `requiresOwnerGo: true`) → VERIFY A/A → HANDOFF A/A → CLOSE M/M |
| `MAIN-BROWSER-QA` | MAIN | SETUP M/M → VERIFY M/M → HANDOFF A/A → CLOSE M/M |
| `MAIN-GATED-LIVE-QA` | MAIN | SETUP M/M `[gate-toggle]` → VERIFY M/M `[live-external-call, gate-toggle]` → REPARK M/M `[gate-toggle]` → HANDOFF A/A → CLOSE M/M |
| `COWORK-REGISTER` | COWORK | AUTHOR A/A → CLOSE M/M |
| `OWNER-MANUAL` | OWNER | OWNER M/M (not workable; informational) |

M = MANUAL, A = ACCEPT_EDITS. Every library profile is `git: read-only` and `deploy: none`;
commits remain separate owner GOs outside the task, as practiced.
