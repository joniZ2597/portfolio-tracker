# ARC Runtime Bootstrap — one-time owner procedure

Creates the shared coordination root. **Run once per coordination domain.** This is a
documented manual owner act, deliberately not wrapped in a skill.

> **Workers never run this.** A missing root is `IDLE` (contract principle 9), never an
> invitation to bootstrap. If `/arc-worker` ever creates a directory under `arc-runtime/`
> other than its own claim or mutex dirs, that is a defect — stop and report it.

## 1. Resolve the root

```bash
ROOT="$(git rev-parse --path-format=absolute --git-common-dir)/arc-runtime"
echo "$ROOT"
```

Expected on this machine:

```
C:/Users/Owner/Documents/Project/portfolio-tracker/.git/arc-runtime
```

`--path-format=absolute` requires **Git >= 2.31**. Verified present: `2.53.0.windows.2`.
If the flag is unavailable, resolve the relative `--git-common-dir` result against the
worktree root instead — do not guess the path.

## 2. Verify the domain before creating anything

```bash
git rev-parse --path-format=absolute --git-common-dir     # from the main worktree
git worktree list                                         # every linked worktree
```

Every linked worktree must report the **same** common dir. That shared value is the
coordination domain (owner ruling, 2026-08-15 — see `owner-ops.md` section 7).

## 3. Verify the filesystem

The `mkdir` primitive requires real create-or-fail atomicity. Confirm the path is:

- **local**, not a network share or mapped drive
- **not sync-managed** — OneDrive, Dropbox, Google Drive

Verified for this repo 2026-08-15: local NTFS, not sync-managed (contract V-2 RESOLVED).

If the repo is ever moved under a sync-managed folder, **the entire model is invalid** —
the dangerous failure is not a refused lock but a falsely granted one, where two workers
both believe they hold `CODE:index-html`. Exclude `.git/arc-runtime/` from sync, or stop.

## 4. Fresh bootstrap — create the root

```bash
mkdir "$ROOT" \
  && mkdir "$ROOT/plans" \
  && mkdir "$ROOT/claims" \
  && mkdir "$ROOT/mutex"
```

Plain `mkdir`, **never `mkdir -p`**. If the root already exists, `mkdir` fails and that is
the correct answer — investigate rather than force. **Root completeness is exactly these three
directories — `plans/` + `claims/` + `mutex/`** (`runtime-contract.md` section 1); the ARC
containers of section 4a are never required for the root to be complete.

## 4a. Extending the existing legacy root for ARC execution — future owner act

The root on this machine already exists (created 2026-08-15) with `plans/ claims/ mutex/` and
the legacy stream's live state inside it. Multi-ARC execution (P-E) needs two more containers,
**added to the existing root without touching anything in it**:

```bash
[ -d "$ROOT/plans" ] && [ -d "$ROOT/claims" ] && [ -d "$ROOT/mutex" ] \
  || { echo "root incomplete - stop"; exit 1; }
# fail closed BEFORE either mkdir: both targets must be absent
[ ! -e "$ROOT/plans/arcs" ] && [ ! -e "$ROOT/arc-claims" ] \
  || { echo "plans/arcs or arc-claims already exists - STOP and investigate; nothing created"; exit 1; }
mkdir "$ROOT/plans/arcs"
mkdir "$ROOT/arc-claims"
```

Plain `mkdir`, **never `mkdir -p`**, each on its own line. The pre-check runs before either
`mkdir`: if `plans/arcs/` or `arc-claims/` already exists, **STOP and investigate** before any
mutation; do not force, and do not treat root bootstrap as idempotent. Only the publisher's
later per-ARC container creation at step 9b is idempotent.
Who creates what (D-24): these two roots are **owner-bootstrap only**; the publisher later
creates only the per-ARC container `arc-claims/<ARC-ID>/` (publish step 9b, idempotent, P-E)
and writes the per-ARC pointer under `plans/arcs/<ARC-ID>/`; **workers never create roots or
containers** — only their own claim and mutex directories. **B4 (P-E0) performs ZERO runtime
`mkdir`:** it ships the schemas, `runtime-identity.js` and this procedure; the two `mkdir`s
above are a recorded owner act before the first ARC publication (B7). Root completeness stays
exactly `plans/` + `claims/` + `mutex/` — a root without `plans/arcs/` or `arc-claims/` is
complete for the legacy stream; their absence is an ARC-level condition (P-E), never a missing
root.

## 5. Verify

```bash
ls -la "$ROOT"        # fresh: expect exactly plans/ claims/ mutex/
                      # after section 4a: plans/ claims/ mutex/ arc-claims/ (and plans/arcs/ inside plans/)
                      # root completeness is still judged on plans/ + claims/ + mutex/ only
git status --short    # expect NO new entries
```

The second check is the important one. `.git/` is not tracked, so nothing under
`arc-runtime/` can ever be staged, committed, pushed, or reach production. That guarantee
is **structural**, not a matter of `.gitignore` discipline — which is precisely why this
root lives inside `.git/` rather than in the working tree.

## 6. Record it

Add a CHECKPOINT entry noting the creation date, the resolved root path, and the Git
version used — and, for section 4a, the date the two ARC containers were added. The root is
durable state that no artifact otherwise records.

## Teardown

Removing the root destroys all claim and mutex state. B4 documents **structural order only**.
`COMPLETE` claims are terminal-durable and are never RELEASEd (`runtime-contract.md` section 5,
owner ruling 2026-08-20); teardown of a claim or ARC directory that is not already empty
requires a **separately authorized future owner procedure — B4 does not define it**. Every
`rmdir` below is legal only on a directory already proven empty; if any directory is not
empty, STOP.

```bash
# 1. per-ARC containers and plans/arcs/<ARC-ID>/ structures (each only when already empty)
rmdir "$ROOT/arc-claims/<ARC-ID>"          # repeat per ARC
rmdir "$ROOT/plans/arcs/<ARC-ID>"          # repeat per ARC, if present
# 2. the ARC roots
rmdir "$ROOT/plans/arcs"
rmdir "$ROOT/arc-claims"
# 3. mutex, claims, plans, root
rmdir "$ROOT/mutex"
rmdir "$ROOT/claims"
rmdir "$ROOT/plans"
rmdir "$ROOT"
```

`rmdir` (not `rm -rf`) fails if anything is still inside — which is the safety property.
If it refuses, something is still held; go to `owner-ops.md` rather than forcing.
