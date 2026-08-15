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

## 4. Create the root

```bash
mkdir "$ROOT" \
  && mkdir "$ROOT/plans" \
  && mkdir "$ROOT/claims" \
  && mkdir "$ROOT/mutex"
```

Plain `mkdir`, **never `mkdir -p`**. If the root already exists, `mkdir` fails and that is
the correct answer — investigate rather than force.

## 5. Verify

```bash
ls -la "$ROOT"        # expect exactly: plans/ claims/ mutex/
git status --short    # expect NO new entries
```

The second check is the important one. `.git/` is not tracked, so nothing under
`arc-runtime/` can ever be staged, committed, pushed, or reach production. That guarantee
is **structural**, not a matter of `.gitignore` discipline — which is precisely why this
root lives inside `.git/` rather than in the working tree.

## 6. Record it

Add a CHECKPOINT entry noting the creation date, the resolved root path, and the Git
version used. The root is durable state that no artifact otherwise records.

## Teardown

Removing the root destroys all claim and mutex state. Only with every claim in a terminal
state and released:

```bash
rmdir "$ROOT/mutex" "$ROOT/claims" "$ROOT/plans" "$ROOT"
```

`rmdir` (not `rm -rf`) fails if anything is still inside — which is the safety property.
If it refuses, something is still held; go to `owner-ops.md` rather than forcing.
