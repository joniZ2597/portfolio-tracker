# Publish Protocol — literal command sequence

Binding reference for `/arc-publish-plan`. Commands are Git Bash. Run them as written;
the ordering carries the atomicity guarantee.

```bash
ROOT="$(git rev-parse --path-format=absolute --git-common-dir)/arc-runtime"
REPO="$(git rev-parse --show-toplevel)"
```

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
```

Plain `mkdir`, **never `-p`**. `EEXIST` is the "already held" answer, not an error to retry.

**Every exit path from here on must release this mutex.** A refusal that leaves it held
deadlocks all future publication.

## Step 5 — Derive the projection and require CONFIRM

Parse the source into a proposed `plan.json`. Render it with
`templates/plan-projection.md` and print it **in full** — every field of every task, each
annotated with the source section it came from.

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

## Step 6 — Validate (P-V1 … P-V11)

Run every rule in `plan-validation.md`. On any failure: release the mutex, report the rule
id and the offending value, write nothing.

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

# write plan.json, then hash exactly the bytes written
cp "$REPO/$SRC" "$STAGE/source.md"
# ... write "$STAGE/plan.json" ...
PLAN_HASH=$(sha256sum "$STAGE/plan.json" | cut -d' ' -f1)
SRC_HASH=$(sha256sum  "$STAGE/source.md" | cut -d' ' -f1)
# ... write "$STAGE/manifest.json" using both hashes ...
```

`planHash` is the SHA-256 of `plan.json` **as written**. Hash the file, never an in-memory
serialization — a re-serialization can differ by whitespace and every worker re-verifies
this value.

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

## Crash recovery

| Crash point | State | Recovery |
|---|---|---|
| Before step 9 | `plans/.staging-<id>/` orphan; `current.json` unchanged | Owner deletes the staging directory |
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
