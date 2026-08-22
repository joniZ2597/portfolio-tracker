---
name: arc-publish-plan
description: Owner-invoked publication of an approved execution plan into an immutable ARC runtime snapshot. Parses the source artifact into a proposed plan.json, resolves every task's execution profile from the committed library (scripts/resolve-profiles.js) and embeds it hash-pinned, prints the projection in full for owner confirmation, runs validation P-V1 through P-V15 and P-V21 through P-V26, and on explicit CONFIRM writes the snapshot and atomically swaps plans/current.json. --dry-run runs every check and writes nothing. Sole writer of plans/ and current.json. Refuses atomically on any validation failure. Never publishes automatically and never modifies a live claim.
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Grep, Glob
---

# ARC Publish Plan

> **STANDING BEHAVIOR — OWNER-INVOKED ONLY. NEVER AUTOMATIC.**
> This skill is the **sole writer** of `plans/` and `plans/current.json`. No worker, in
> any lane, may invoke it. It NEVER publishes without an explicit owner `CONFIRM` typed
> in response to the printed projection. It NEVER modifies a claim, a mutex holder, or
> `authorized.json`. It NEVER edits the source artifact. It NEVER creates the runtime
> root — a missing root is a refusal, not an invitation to bootstrap. It NEVER "fixes"
> a validation failure by adjusting the plan; it reports and stops. **Publishing is not
> authorization to execute anything.**

Publication converts a mutable planning artifact into an immutable, hash-pinned snapshot.
Workers consume that snapshot and nothing else. Without it, two workers reading the same
`.md` mid-edit can hold different views of who may run in parallel — precisely the
guarantee the mutex layer exists to provide.

## Invocation

    /arc-publish-plan <source-path> [--plan-id <id>]
                      [--dry-run]
                      [--acknowledge-stale-source]
                      [--acknowledge-live-claims]
                      [--allow-ref-mismatch]

- `<source-path>` — repo-relative, must resolve under `.ai-reports/`. Validated by P-V12.
- `--plan-id` — snapshot id. Defaults to the source basename, lowercased. Must not already
  exist and must not be the reserved `arcs` (P-V11).
- `--dry-run` — run steps 0–3 and the full RESOLVE + validation (P-V1 … P-V15,
  P-V21 … P-V26; P-V11 existence and P-V13 read-only against the live root), print the
  complete projection under a `DRY RUN` banner, and stop. Takes no mutex, never prompts for
  `CONFIRM`, writes nothing under the runtime root or the repository — only the resolver's
  output in the session scratch directory.
- `--acknowledge-stale-source` — owner override for P-V14. Recorded in `current.json`.
- `--acknowledge-live-claims` — owner override for P-V13. Recorded in `current.json`.
- `--allow-ref-mismatch` — owner override for P-V10. Recorded in `current.json`.

Every override is written into the published manifest. An override that is not durably
recorded is indistinguishable from a check that never ran.

## Procedure

Read `references/publish-protocol.md` for the literal command sequence and
`references/plan-validation.md` for P-V1 through P-V15 in full. Both are binding; this
section is the map, not the territory.

```
 0. Assert the main worktree: show-toplevel ==
    dirname(git rev-parse --path-format=absolute --git-common-dir); else REFUSE
 1. Resolve root; absent -> REFUSE (bootstrap is a separate owner act)
 2. Validate the source path                                        [P-V12]
 3. Compare mtime(CHECKPOINT.md) vs mtime(source)                   [P-V14]
    --dry-run: continue to step 5 without the mutex, print, stop
 4. Acquire mutex AUTHORITY__published-plan, holder __PUBLISH__
 5. Parse source -> PROPOSED plan.json; RESOLVE execution profiles
    (scripts/resolve-profiles.js: P-V1 ... P-V9, P-V15, P-V21 ... P-V26,
    embeds executionProfiles, prints PROFILES + per-task ladders,
    RESOLVER and projectionHash); print the projection in full;
    require the owner to type CONFIRM
 6. Record P-V1 ... P-V15 + P-V21 ... P-V26; settle P-V10, P-V11 against
    git and the runtime; any failure -> REFUSE, nothing written
 7. Scan for live claims against the outgoing plan                  [P-V13]
 8. Write plans/.staging-<planId>/ complete - plan.json is the confirmed
    resolver bytes copied verbatim; planHash must equal projectionHash
 9. Rename staging -> plans/<planId>          (atomic, target cannot exist)
10. Write current.json.tmp; rename over current.json  (atomic replace)
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

## `--dry-run`

`/arc-publish-plan <source> --dry-run` performs steps 0–3, then step 5 with
`--runtime-root "$ROOT"` so P-V11 (existence) and P-V13 (live-claim scan) are also evaluated
**read-only**, prints the complete projection — PROFILES, per-task ladders, every P-V line,
`RESOLVER`, `projectionHash` — under a `DRY RUN` banner, and stops. It never acquires
`AUTHORITY:published-plan`, never prompts for `CONFIRM`, and writes nothing under `$ROOT` or
`$REPO`; the only artifact is the resolver output in scratch. A dry run that passes is
evidence the plan is machine-valid (PR-2), not a publication and not an authorization.

## Atomicity

`current.json` is swapped **only after** the snapshot directory exists complete under its
final name. A crash at any point leaves either the previous plan fully active or a
recognisable `plans/.staging-<id>/` orphan. A partial snapshot is never reachable through
`current.json`.

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
runtime root is missing; `AUTHORITY:published-plan` is already held; the source cannot be
parsed into a complete projection; the resolver refuses (exit 2) or errors (exit 3); the
source or proposed plan authors `executionProfiles`; any P-V rule fails; the owner does not
type `CONFIRM`; the staged `plan.json` hash differs from the confirmed `projectionHash`;
`plans/<planId>` already exists or `planId` is the reserved `arcs`; a staging directory from
an earlier interrupted run is present; or the request asks this skill to modify a claim, a
mutex holder, `authorized.json`, a library profile, or the source artifact.

## Known limitation

`allowed-tools` is **not runtime-enforced** (execution-plan conflict X-9, CHECKPOINT
2026-08-14). The guarantee that only this skill writes `plans/` rests on charter prose and
owner review, exactly as `arc-progress-auditor`'s read-only fence does. Recorded rather
than papered over.
