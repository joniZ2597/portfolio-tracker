# Publish Protocol — literal command sequence

Binding reference for `/arc-publish-plan`. Commands are Git Bash. Run them as written;
the ordering carries the atomicity guarantee.

```bash
COMMON="$(git rev-parse --path-format=absolute --git-common-dir)"   # absolute form is mandatory (Git >= 2.31)
case "$COMMON" in
  /*|[A-Za-z]:/*) : ;;
  *) echo "REFUSED - git-common-dir did not resolve to an absolute path: $COMMON"; exit 1 ;;
esac
ROOT="$COMMON/arc-runtime"
REPO="$(dirname "$COMMON")"
SCRATCH="$(mktemp -d -t arc-publish-XXXXXX)"     # outside the repo and the runtime; resolver output only
RESOLVER="$REPO/.claude/skills/arc-publish-plan/scripts/resolve-profiles.js"
PUBLISH_HELD=0      # becomes 1 only when step 4 has written the holder; --dry-run never sets it
release_if_held() { if [ "$PUBLISH_HELD" = 1 ]; then rm "$M/holder.json" && rmdir "$M"; PUBLISH_HELD=0; fi; }
```

`REPO` is derived from the **absolute** common git dir, never from `--show-toplevel` and never
from the plain `--git-common-dir` output: without `--path-format=absolute` Git prints a
relative `.git`, `dirname` would yield `.`, and the assertion below would be meaningless;
from a linked worktree `--show-toplevel` names that worktree, and a publication staged from
there would pin the wrong tree (C-18).

## Step 0 — Assert the main worktree

```bash
[ "$(git rev-parse --show-toplevel)" = "$REPO" ] \
  || { echo "REFUSED - not the main worktree: $(git rev-parse --show-toplevel) != $REPO"; exit 1; }
```

Runs before anything else and before the mutex. Publication is a main-worktree act.

## Step 1 — Resolve the root

```bash
[ -d "$ROOT/plans" ] && [ -d "$ROOT/claims" ] && [ -d "$ROOT/mutex" ] \
  || { echo "REFUSED - runtime root absent or incomplete"; exit 1; }
```

A missing root is a **refusal**, never an invitation to bootstrap. Creation is a separate,
explicit, one-time owner step documented in `bootstrap.md`.

## Step 2 — Validate the source path (P-V12)

```bash
SRC="$1"
case "$SRC" in
  /*|\\*|[A-Za-z]:*|*..*) echo "P-V12 REFUSED - $SRC"; exit 1 ;;
  .ai-reports/*.md) : ;;
  *) echo "P-V12 REFUSED - $SRC"; exit 1 ;;
esac
[ -f "$REPO/$SRC" ] || { echo "P-V12 REFUSED - no such file: $SRC"; exit 1; }
```

## Step 3 — Stale-source check (P-V14)

```bash
SRC_T=$(stat -c %Y "$REPO/$SRC")
CHK_T=$(stat -c %Y "$REPO/CHECKPOINT.md")
if [ "$CHK_T" -gt "$SRC_T" ] && [ "$ACK_STALE" != "1" ]; then
  echo "P-V14 REFUSED - stale source"
  echo "  source     $SRC             $(date -u -d @$SRC_T +%Y-%m-%dT%H:%M:%SZ)"
  echo "  CHECKPOINT.md               $(date -u -d @$CHK_T +%Y-%m-%dT%H:%M:%SZ)  <- newer"
  exit 1
fi
```

Steps 2 and 3 run **before** the mutex, so a bad path or stale source costs nothing.

## Step 4 — Acquire the authority mutex

```bash
M="$ROOT/mutex/AUTHORITY__published-plan"
mkdir "$M" || { echo "REFUSED - publish already in flight"; cat "$M/holder.json"; exit 1; }
printf '{"taskId":"__PUBLISH__","lane":"OWNER","acquiredAt":"%s"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$M/holder.json"
PUBLISH_HELD=1
```

Plain `mkdir`, **never `-p`**. `EEXIST` is the "already held" answer, not an error to retry.

**Every exit path from here on must release this mutex.** A refusal that leaves it held
deadlocks all future publication.

## Step 5 — Derive the projection, RESOLVE profiles, and require CONFIRM

Parse the source into a proposed `plan.json` — every task row carries its `executionProfile`
id; the proposed plan carries **no** `executionProfiles`. Write it to scratch and run the
resolver; it validates P-V1 … P-V9, P-V15 and P-V21 … P-V26, embeds the referenced profiles,
and writes the canonical snapshot bytes:

```bash
# ... write "$SCRATCH/proposed.json" from the parsed source ...
node "$RESOLVER" --in "$SCRATCH/proposed.json" --out "$SCRATCH/plan.json" \
     --source "$REPO/$SRC" --runtime-root "$ROOT" $ACK_LIVE_FLAG | tee "$SCRATCH/resolve.txt"
RC=${PIPESTATUS[0]}
case "$RC" in
  0) : ;;
  2) echo "REFUSED - resolver refused (see $SCRATCH/resolve.txt)"; release_if_held; exit 1 ;;
  *) echo "REFUSED - resolver error (exit $RC)";                    release_if_held; exit 1 ;;
esac
PROJECTION_HASH=$(sha256sum "$SCRATCH/plan.json" | cut -d' ' -f1)
```

`$ACK_LIVE_FLAG` is `--acknowledge-live-claims` when the owner passed it, else empty. The
resolver writes only `$SCRATCH/plan.json` — never under `$ROOT` — and takes no mutex; its
`--runtime-root` checks (P-V11 existence, P-V13 scan) are read-only. Under `--dry-run` this
step runs without step 4: `PUBLISH_HELD` stays `0`, so a resolver refusal or error exits
without referencing or releasing the mutex directory at all. In a real publish
`PUBLISH_HELD` is `1` and `release_if_held` releases `AUTHORITY:published-plan` on both
failure paths.

Render the projection with `templates/plan-projection.md` and print it **in full** — every
field of every task, each annotated with the source section it came from, the PROFILES
section and per-task ladder lines from `$SCRATCH/resolve.txt`, the `RESOLVER` line, and
`projectionHash $PROJECTION_HASH`.

**Condition resolution is a deterministic join, not a lookup the reader performs.** Where the
source carries close/stop conditions in a table separate from the task table, resolve them
**by Task ID** and place the literal text into `plan.json`:

```
for each task T in the task table:
    row = conditions_table[T.id]          # exact Task ID match, no fuzzy matching
    if row is missing            -> REFUSE  "P-V1 REFUSED - task <id> has no conditions row"
    T.closeCondition = row.close          # literal text, verbatim
    T.stopCondition  = row.stop           # literal text, verbatim, when present
```

**Never emit a placeholder, a pointer, or a section reference in place of a resolved
condition.** A task whose conditions cannot be resolved is a refusal, never a default. The
resolved values are then checked by P-V15.

Then require the owner to type `CONFIRM`. Anything else — silence, "ok", "go ahead", "looks
right", a request to proceed — is **not** confirmation. Release the mutex and stop.

If any mandatory field cannot be determined from the source, name the task and field,
release the mutex, and refuse. **Never infer a value.**

## Step 6 — Validate (P-V1 … P-V11, P-V15, P-V21 … P-V26)

Record the resolver's results for P-V1 … P-V9, P-V15 and P-V21 … P-V26 (computed at step 5,
before `CONFIRM`), and settle P-V10 (`repoRef` vs `git rev-parse HEAD`) and P-V11 (snapshot
and staging directory absent; `arcs` reserved) here. On any failure: release the mutex,
report the rule id and the offending value, write nothing.

## Step 7 — Live-claim scan (P-V13)

```bash
OUTGOING=$(grep -o '"planId"[[:space:]]*:[[:space:]]*"[^"]*"' "$ROOT/plans/current.json" 2>/dev/null \
           | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
for c in "$ROOT"/claims/*/; do
  [ -f "$c/claim.json" ] || continue
  grep -q "\"planId\"[[:space:]]*:[[:space:]]*\"$OUTGOING\"" "$c/claim.json" || continue
  grep -q '"state"[[:space:]]*:[[:space:]]*"\(CLAIMED\|WAITING_OWNER_GO\|AUTHORIZED\|BLOCKED\)"' \
    "$c/claim.json" && echo "LIVE: $(basename "$c")"
done
```

Any output and no `--acknowledge-live-claims` → release the mutex and refuse. With the flag,
record each into `carriedOverClaims[]`. **Never modify a `claim.json`.**

## Step 8 — Stage the snapshot

```bash
STAGE="$ROOT/plans/.staging-$PLAN_ID"
[ -e "$ROOT/plans/$PLAN_ID" ] && { echo "P-V11 REFUSED - snapshot exists"; exit 1; }
[ -e "$STAGE" ] && { echo "P-V11 REFUSED - staging dir exists from an interrupted run"; exit 1; }
mkdir "$STAGE"

# stage the CONFIRMED bytes verbatim, then hash exactly the bytes written
cp "$REPO/$SRC" "$STAGE/source.md"
cp "$SCRATCH/plan.json" "$STAGE/plan.json"
PLAN_HASH=$(sha256sum "$STAGE/plan.json" | cut -d' ' -f1)
[ "$PLAN_HASH" = "$PROJECTION_HASH" ] \
  || { echo "REFUSED - staged plan.json ($PLAN_HASH) differs from the confirmed projection ($PROJECTION_HASH)"; rm "$M/holder.json" && rmdir "$M"; exit 1; }
SRC_HASH=$(sha256sum  "$STAGE/source.md" | cut -d' ' -f1)
# ... write "$STAGE/manifest.json" using both hashes ...
```

`planHash` is the SHA-256 of `plan.json` **as written**, and it must equal the
`projectionHash` the owner confirmed at step 5 — the snapshot is the resolver's bytes copied,
never re-serialized. Hash the file, never an in-memory serialization — a re-serialization can
differ by whitespace and every worker re-verifies this value. A mismatch refuses, releases
the mutex, and leaves `plans/.staging-<id>/` for owner disposition (crash table).

If `sha256sum` is unavailable, the documented fallback is
`certutil -hashfile <file> SHA256` via PowerShell.

## Step 9 — Rename staging into place

```bash
mv "$STAGE" "$ROOT/plans/$PLAN_ID"
```

Atomic directory rename. The target cannot exist — P-V11 and step 8 both checked it — so
this is a create, never a replace.

## Step 10 — Swap current.json

```bash
# ... write "$ROOT/plans/current.json.tmp" ...
mv -f "$ROOT/plans/current.json.tmp" "$ROOT/plans/current.json"
```

`mv -f` over an existing file is an atomic replace. **Never** `rm` the old file first — that
opens a window in which no active plan exists and every worker resolves to IDLE.

This is the commit point. Before step 10 the previous plan is still active; after it, the
new one is. There is no intermediate state.

## Step 11 — Release and report

```bash
rm "$M/holder.json" && rmdir "$M"
```

Then emit the report using `templates/publish-report.md`.

## `--dry-run` — every check, no write, no mutex

```bash
# steps 0-3 as written (main-worktree assert, root, P-V12, P-V14)
HEAD_SHA=$(git rev-parse HEAD)        # P-V10, read-only: compare with the proposed repoRef
# step 5 as written, WITHOUT step 4: the resolver runs with --runtime-root "$ROOT"
#   (P-V11 existence + P-V13 scan, read-only) and writes only "$SCRATCH/plan.json"
# print the full projection under the DRY RUN banner (templates/plan-projection.md); exit 0
```

Not performed: step 4 (no `AUTHORITY:published-plan` holder), the `CONFIRM` prompt, steps
8–11. Nothing under `$ROOT` or `$REPO` is created or modified — the tree hash of the runtime
root is identical before and after, and `mutex/` is untouched. The scratch output is the only
artifact. A dry run is evidence of machine validity (PR-2), never a publication.

## Crash recovery

| Crash point | State | Recovery |
|---|---|---|
| Before step 9 | `plans/.staging-<id>/` orphan; `current.json` unchanged | Owner deletes the staging directory |
| Step 8 `projectionHash` mismatch | `plans/.staging-<id>/` left in place; mutex released; `current.json` unchanged | Owner deletes the staging directory, then re-runs the publish |
| Between 9 and 10 | New snapshot exists but is unreferenced; previous plan still active | Owner deletes the snapshot directory, or re-runs step 10 deliberately |
| After step 10 | Published | None needed |
| Any point | `AUTHORITY__published-plan` still held | Owner releases it per `owner-ops.md` section 6 |

A snapshot directory that exists without being named by `current.json` is inert. Workers
resolve the active plan only through `current.json`, never by scanning `plans/`.

## Never

- Publish without an explicit typed `CONFIRM`
- Infer a mandatory field that the source does not state
- Write, edit, or delete any `claim.json`, `holder.json`, or `authorized.json`
- Edit the source artifact
- Reuse or overwrite an existing `planId` or staging directory
- Create the runtime root
- Leave the authority mutex held on a refusal path
- Treat a P-V14 pass as evidence the plan is reconciled
- Run the resolver with `--out` under `$ROOT`, or stage any bytes other than the confirmed `$SCRATCH/plan.json`
- Author `executionProfiles` in a source or proposed plan (P-V21 refuses it)
