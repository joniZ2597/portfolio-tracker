---
name: arc-publish-plan
description: Owner-invoked publication of an approved execution plan into an immutable ARC runtime snapshot, for the legacy stream (no flag) or for one ARC (--arc <ARC-ID>, the typed literal being the only source of the arcId). Parses the source artifact into a proposed plan.json, resolves every task's execution profile from the committed library (scripts/resolve-profiles.js) and embeds it hash-pinned, prints the projection in full for owner confirmation, runs validation P-V1 through P-V17 and P-V19 through P-V26 (P-V18 retired), and on explicit CONFIRM writes the snapshot, atomically swaps the selected pointer (plans/current.json or plans/arcs/<ARC-ID>/current.json) and writes the registry execution index back. --dry-run runs every check and writes nothing. Sole writer of plans/, both pointer kinds, the per-ARC claim container and the registry execution{} field. Refuses atomically on any validation failure. Never publishes automatically and never modifies a live claim.
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Grep, Glob
---

# ARC Publish Plan

> **STANDING BEHAVIOR — OWNER-INVOKED ONLY. NEVER AUTOMATIC.**
> This skill is the **sole writer** of `plans/`, of the pointers `plans/current.json` and
> `plans/arcs/<ARC-ID>/current.json`, of the per-ARC claim container `arc-claims/<ARC-ID>/`
> (step 9b) and of the registry `execution{}` field + state `EXECUTING` (step 10b). No worker,
> in any lane, may invoke it. It NEVER publishes without an explicit owner `CONFIRM` typed
> in response to the printed projection. It NEVER modifies a claim, a mutex holder, or
> `authorized.json`. It NEVER edits the source artifact. It NEVER creates the runtime
> root, nor the ARC roots `plans/arcs/` and `arc-claims/` — a missing root is a refusal,
> not an invitation to bootstrap (the roots are owner-bootstrap, `references/bootstrap.md`).
> It NEVER derives an ARC identity from anything but the typed `--arc` literal. It NEVER
> "fixes" a validation failure by adjusting the plan; it reports and stops. **Publishing is
> not authorization to execute anything.**

Publication converts a mutable planning artifact into an immutable, hash-pinned snapshot.
Workers consume that snapshot and nothing else. Without it, two workers reading the same
`.md` mid-edit can hold different views of who may run in parallel — precisely the
guarantee the mutex layer exists to provide.

## Invocation

    /arc-publish-plan <source-path> [--plan-id <id>]
                      [--arc <ARC-ID>]
                      [--dry-run]
                      [--acknowledge-stale-source]
                      [--acknowledge-live-claims]
                      [--allow-ref-mismatch]
                      [--acknowledge-stale-promotion]

- `<source-path>` — repo-relative, must resolve under `.ai-reports/`. Validated by P-V12.
- `--plan-id` — snapshot id. Defaults to the source basename, lowercased. Must not already
  exist and must not be the reserved `arcs` (P-V11).
- `--arc <ARC-ID>` — publish for one ARC. The literal is the **only** source of the `arcId`
  (P-V16): never a task-id prefix, a filename, a slug or a `- Arc:` header. It must be a
  valid ARC id (`^[A-Z0-9]([A-Z0-9-]*[A-Z0-9])?$`, ≤ 24, no reserved device name); a case
  variant is refused, never normalized; `CORE-STREAM` is refused — it is the registry's index
  entry for the legacy stream, never a runtime arc. With the flag the publication touches only
  `plans/arcs/<ARC-ID>/current.json` and `arc-claims/<ARC-ID>/` (plus the shared `plans/<id>/`
  and `mutex/`), checks the registry entry `.ai-reports/arcs/<ARC-ID>/arc.json` (P-V17, P-V20)
  and the ARC claim namespace (P-V13 per arc, P-V19), and writes `execution{}` back to the
  registry after the swap. Without the flag the behaviour and the bytes are the legacy
  stream's — `plans/current.json`, `claims/` — and `arc-claims/` is never read.
- `--dry-run` — run steps 0–3 and the full RESOLVE + validation (P-V1 … P-V17,
  P-V19 … P-V26; P-V11 existence, P-V13, and with `--arc` P-V17 / P-V19 / P-V20 read-only
  against the live root and registry), print the complete projection under a `DRY RUN`
  banner, and stop. Takes no mutex, never prompts for `CONFIRM`, writes nothing under the
  runtime root, the registry or the repository — only the resolver's output in the session
  scratch directory.
- `--acknowledge-stale-source` — owner override for P-V14. Recorded in `current.json`.
- `--acknowledge-live-claims` — owner override for P-V13. Recorded in `current.json`.
- `--allow-ref-mismatch` — owner override for P-V10. Recorded in `current.json`.
- `--acknowledge-stale-promotion` — owner override for the P-V17 READY-decay clause
  (`promotion.rulingAt` older than 7 days, `STALE-READY`). Recorded in the registry
  write-back `history` note at step 10b — the manifest field set is fixed by
  `current.schema.json` and carries no slot for it. Meaningful only with `--arc`.

Every override is written into the published manifest (the stale-promotion acknowledgement
into the registry history note). An override that is not durably recorded is
indistinguishable from a check that never ran.

## Procedure

Read `references/publish-protocol.md` for the literal command sequence and
`references/plan-validation.md` for P-V1 through P-V15 in full. Both are binding; this
section is the map, not the territory.

```
 N. Bind the arguments; judge the --arc literal (valid id, not CORE-STREAM,
    never normalized) and select exactly one namespace:
      no --arc : PTR = plans/current.json,            CLAIMS = claims/
      --arc X  : PTR = plans/arcs/X/current.json,     CLAIMS = arc-claims/X/   [P-V16]
 0. Assert the main worktree: show-toplevel ==
    dirname(git rev-parse --path-format=absolute --git-common-dir); else REFUSE
 1. Resolve root; absent -> REFUSE (bootstrap is a separate owner act);
    with --arc also require plans/arcs/ and arc-claims/ -> else REFUSE
    (owner bootstrap, bootstrap.md section 4a; never created here)
 2. Validate the source path                                        [P-V12]
 3. Compare mtime(CHECKPOINT.md) vs mtime(source)                   [P-V14]
    --dry-run: continue to step 5 without the mutex, print, stop
 4. Acquire mutex AUTHORITY__published-plan, holder __PUBLISH__
    (holder carries arcId X for an ARC publication, no arcId for legacy)
 5. Parse source -> PROPOSED plan.json (no arcId); RESOLVE execution profiles
    (scripts/resolve-profiles.js [--arc X --registry-root]: P-V1 ... P-V9,
    P-V15, P-V16, P-V21 ... P-V26; with --arc also P-V17, P-V19, P-V20 and
    P-V13 scoped to CLAIMS; declares plan.arcId = X; embeds executionProfiles;
    prints ARC, PROFILES + per-task ladders, RESOLVER and projectionHash);
    print the projection in full; require the owner to type CONFIRM
 6. Record the step-5 results; settle P-V10 against git;
    any failure -> REFUSE, nothing written
 7. Re-settle P-V11 / P-V13 / P-V19 (runtime) and P-V17 / P-V20 (registry)
    through the committed library; collect carriedOverClaims from CLAIMS only
 8. Write plans/.staging-<planId>/ complete - plan.json is the confirmed
    resolver bytes copied verbatim; planHash must equal projectionHash;
    manifest.json = the current.json field set (+ arcId X for an ARC)
 9. Rename staging -> plans/<planId>          (atomic, target cannot exist)
9b. --arc only: mkdir arc-claims/X/  (idempotent container; EEXIST on an
    existing directory is the only ignored failure; the root is never created)
10. Write PTR.tmp from the manifest; assert the three-way identity with the
    committed runtime-identity.js arcIdTriple({plan, manifest, current}, X)
    == ARC (legacy: LEGACY); rename PTR.tmp over PTR  (atomic replace)
10b. --arc only: registry write-back (.ai-reports/arcs/X/arc.json ->
    execution{planId, planHash, pointer, claimsRoot, publishedAt}, state
    EXECUTING, one history entry by publisher; json-safe-edit). A failure is
    reported as DRIFT for owner repair - the pointer is NEVER rolled back
11. Release the mutex; emit the publish report
```

## The projection is derived, then owner-confirmed

`plan.json` is **derived from the source artifact by this skill**, not hand-authored. That
derivation is the one model-mediated step in the whole ARC design, so it is fenced:

1. Render the full proposal using `templates/plan-projection.md` — every field, every task,
   each with the source section it came from.
2. Print it **in its entirety**. Never summarise, never elide a task, never show a diff
   against a previous plan in place of the whole projection.
3. Require the owner to type `CONFIRM`. Any other response, including silence, an
   approval-shaped word, or a request to proceed, is **not** confirmation.
4. Only then run the remaining validation and write.

If a field cannot be determined from the source, **do not infer it**. Report the specific
task and field, and refuse. A guessed `requiresOwnerGo` or `mutexes` entry is the failure
mode this fence exists to stop.

## Execution profiles are resolved, never authored

Every task row names a library profile by id (`executionProfile` — the only authoring
surface, `references/execution-profiles/README.md`). At step 5 the publisher runs the
committed pure-Node helper `scripts/resolve-profiles.js` (library
`scripts/lib/profile-contract.js`), which validates the proposed plan (P-V1 … P-V9, P-V15)
and the profile rules (P-V21 … P-V26, `references/plan-validation.md`), embeds one copy of
every referenced profile as `plan.json.executionProfiles` — keys sorted, `libraryHash`
inserted after `version`, equal to the hash of the CR-stripped library file — and writes the
canonical `plan.json` bytes to the session scratch directory. Those exact bytes are what the
owner confirms (`projectionHash`) and what step 8 stages; the snapshot is never
re-serialized. A source or proposed plan that carries `executionProfiles` itself is refused
(P-V21); a row missing a capability-implied mutex class is refused (P-V25); a code surface
whose `CODE:*` class the row does not hold is **locked out** with a WARN, never silently
granted. Workers consume the embedded copy only (P-C, not yet active) and never read the
library.

The helper scripts are invoked through `Bash` and write only their `--out` file in scratch —
never under the runtime root, never in the repository. Exit `2` is a refusal (rule id and
offending value printed, nothing written); exit `3` is a usage or I/O error; either releases
the mutex and stops the publish.

## ARC identity originates only from the literal

An ARC publication is selected by `--arc <ARC-ID>` and by nothing else. The literal is judged
before the mutex (P-V16: valid id, not `CORE-STREAM`, never normalized), declared by the resolver
as `plan.json.arcId`, written into `manifest.json` at step 8 and into
`plans/arcs/<ARC-ID>/current.json` at step 10, and the three are asserted equal through the
committed helper `scripts/lib/runtime-identity.js arcIdTriple({ plan, manifest, current },
"<ARC-ID>")` **before** the pointer swap (K9, X-3). The rules live in that helper and are never
re-implemented here. A legacy publication (no flag) writes no `arcId` anywhere and its bytes are
those of a B1 publication.

The namespaces are disjoint (K15): an `--arc` publish never reads `claims/` or
`plans/current.json`; a legacy publish never reads `arc-claims/` or `plans/arcs/`. The registry
(`.ai-reports/arcs/<ARC-ID>/arc.json`) is read for P-V17 / P-V20 and written back at step 10b
(`execution{}`, state `EXECUTING`, one `history` entry) — the publisher is its sole machine
writer; a failed write-back is reported as `DRIFT` and the pointer is never rolled back.
Workers never read the registry.

## `--dry-run`

`/arc-publish-plan <source> [--arc <ARC-ID>] --dry-run` performs steps N and 0–3, then step 5
with `--runtime-root "$ROOT"` (and, with `--arc`, `--registry-root`) so P-V11 (existence),
P-V13 (live-claim scan in the selected namespace) and, for an ARC, P-V17 / P-V19 / P-V20 are
also evaluated **read-only**, prints the complete projection — the `ARC` line, PROFILES,
per-task ladders, every P-V line, `RESOLVER`, `projectionHash` — under a `DRY RUN` banner, and
stops. It never acquires `AUTHORITY:published-plan`, never prompts for `CONFIRM`, and writes
nothing under `$ROOT`, `$REPO` or `.ai-reports/arcs/`; the only artifact is the resolver output
in scratch. A dry run that passes is evidence the plan is machine-valid (PR-2), not a
publication and not an authorization.

## Atomicity

The pointer — `plans/current.json`, or `plans/arcs/<ARC-ID>/current.json` for an ARC — is
swapped **only after** the snapshot directory exists complete under its final name and the
three-way `arcId` identity holds. A crash at any point leaves either the previous plan fully
active or a recognisable `plans/.staging-<id>/` orphan (for an ARC, possibly an inert empty
`arc-claims/<ARC-ID>/` container). A partial snapshot is never reachable through a pointer.

Snapshots are immutable. A change is a new `planId` — never an edit (P-V11).

## Live claims are recorded, never retargeted

If a claim is live against the outgoing plan, publication refuses unless the owner passes
`--acknowledge-live-claims`. With the flag, the claims are copied into
`current.json.carriedOverClaims[]` **for audit only**. Their `claim.json` files are not
touched.

Plan advancement does not invalidate a live claim. The worker holding it detects the
`planId` mismatch at its next checkpoint and stops. Silently retargeting a live claim to a
new plan would be stale-claim stealing under another name.

## Stop conditions

Stop and report without publishing if: the invocation is not from the main worktree; the
runtime root is missing; with `--arc`, `plans/arcs/` or `arc-claims/` is missing (owner
bootstrap, never created here); the `--arc` literal is malformed, a case variant, or
`CORE-STREAM`; `AUTHORITY:published-plan` is already held; the source cannot be parsed into
a complete projection; the resolver refuses (exit 2) or errors (exit 3); the source or
proposed plan authors `executionProfiles` or an `arcId`; any P-V rule fails (P-V16, P-V17,
P-V19, P-V20 included); the owner does not type `CONFIRM`; the staged `plan.json` hash
differs from the confirmed `projectionHash`; the three-way `arcId` identity fails before the
swap; `plans/<planId>` already exists or `planId` is the reserved `arcs`; a staging directory
from an earlier interrupted run is present; or the request asks this skill to modify a claim,
a mutex holder, `authorized.json`, a library profile, a registry field other than `execution`
/ state `EXECUTING` / the appended history entry, or the source artifact.

## Known limitation

`allowed-tools` is **not runtime-enforced** (execution-plan conflict X-9, CHECKPOINT
2026-08-14). The guarantee that only this skill writes `plans/` rests on charter prose and
owner review, exactly as `arc-progress-auditor`'s read-only fence does. Recorded rather
than papered over.
