# Claim Protocol — literal command sequences

Binding reference for `/arc-worker`. Git Bash. The ordering carries the guarantees; run
them as written.

```bash
ROOT="$(git rev-parse --path-format=absolute --git-common-dir)/arc-runtime"
```

## 0. Preconditions

```bash
[ -d "$ROOT/plans" ] && [ -d "$ROOT/claims" ] && [ -d "$ROOT/mutex" ] || { echo IDLE; exit 0; }
case "$LANE" in MAIN|LAB|COWORK) : ;; *) echo "IDLE - lane $LANE"; exit 0 ;; esac
```

`HERDR` and `OWNER` both land in the wildcard and exit IDLE.

## 1. Load and verify the snapshot

```bash
PLAN_ID=$(grep -o '"planId"[[:space:]]*:[[:space:]]*"[^"]*"' "$ROOT/plans/current.json" \
          | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
WANT=$(grep -o '"planHash"[[:space:]]*:[[:space:]]*"[a-f0-9]\{64\}"' "$ROOT/plans/current.json" \
       | head -1 | grep -o '[a-f0-9]\{64\}')
GOT=$(sha256sum "$ROOT/plans/$PLAN_ID/plan.json" | cut -d' ' -f1)
[ "$WANT" = "$GOT" ] || { echo "IDLE - plan hash mismatch"; exit 0; }
```

Hash the file, never a re-serialization — whitespace differences would produce false
mismatches.

## 2. Claim

```bash
mkdir "$ROOT/claims/$TASK_ID"
```

**Plain `mkdir`. Never `-p`.** `-p` is idempotent and would silently "succeed" on a claim
someone else holds, destroying the entire guarantee.

Exit 0 means acquired. Non-zero means held — move to the next candidate, never wait.

## 3. Acquire mutexes in canonical order

```bash
# sort on the UNENCODED strings, then encode each name
SORTED=$(printf '%s\n' "${CLASSES[@]}" | LC_ALL=C sort)
HELD=()
for CLASS in $SORTED; do
  DIR="$ROOT/mutex/$(printf '%s' "$CLASS" | sed 's/:/__/g')"
  if mkdir "$DIR" 2>/dev/null; then
    printf '{"taskId":"%s","lane":"%s","acquiredAt":"%s"}\n' \
      "$TASK_ID" "$LANE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DIR/holder.json"
    HELD+=("$CLASS")
  else
    echo "BLOCKED - $CLASS held by: $(cat "$DIR/holder.json" 2>/dev/null)"
    ROLLBACK=1; break
  fi
done
```

`LC_ALL=C` forces byte order. A locale-aware sort could order differently on another
machine, and two workers computing different orders is exactly the deadlock this prevents.

## 4. Rollback — complete, or not at all

```bash
if [ "$ROLLBACK" = 1 ]; then
  for (( i=${#HELD[@]}-1 ; i>=0 ; i-- )); do
    CLASS="${HELD[i]}"
    DIR="$ROOT/mutex/$(printf '%s' "$CLASS" | sed 's/:/__/g')"
    rm -f "$DIR/holder.json"; rmdir "$DIR"
  done
  rmdir "$ROOT/claims/$TASK_ID"
  exit 0
fi
```

Reverse acquisition order. The claim directory goes too, so the task returns to
`UNCLAIMED` and **no state is written**. Report `outcome=STOPPED, taskState=UNCLAIMED`,
reason `mutex-unavailable(<class>, held by <taskId>)`.

## 5. Commit the claim

```bash
cat > "$ROOT/claims/$TASK_ID/claim.json.tmp" <<JSON
{
  "taskId": "$TASK_ID", "lane": "$LANE",
  "planId": "$PLAN_ID", "planHash": "$GOT",
  "conversationId": "$CONV", "startedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "mutexes": [ ... canonical order ... ],
  "state": "$STATE",
  "stateHistory": [ { "state": "$STATE", "at": "...", "by": "worker" } ],
  "reason": null, "mutexesReleasedAt": null, "resumeCount": 0
}
JSON
mv -f "$ROOT/claims/$TASK_ID/claim.json.tmp" "$ROOT/claims/$TASK_ID/claim.json"
```

`STATE` is `WAITING_OWNER_GO` when the plan row has `requiresOwnerGo: true`, otherwise
`CLAIMED`. **Never `AUTHORIZED`.**

Between step 2 and this write there is a window where the claim directory exists with no
`claim.json`. That is the documented INCOMPLETE-CLAIM residue and is owner-recoverable. It
is preferable to writing state before the mutexes are actually held.

## 6. Owner-GO stop

If `STATE` is `WAITING_OWNER_GO`: report and **STOP**. Do not execute, do not plan, do not
prepare. The mutexes stay held so the reservation is real while the owner decides.

## 7. COMPLETE — state first, then release

```bash
# 1. state
mv -f claim.json.tmp claim.json        # state=COMPLETE, stateHistory appended

# 2. release, verifying ownership per class
for CLASS in "${MINE[@]}"; do
  DIR="$ROOT/mutex/$(printf '%s' "$CLASS" | sed 's/:/__/g')"
  grep -q "\"taskId\"[[:space:]]*:[[:space:]]*\"$TASK_ID\"" "$DIR/holder.json" || continue
  rm "$DIR/holder.json" && rmdir "$DIR"
done

# 3. stamp mutexesReleasedAt
```

The ownership check is not optional. `rmdir` on a directory whose holder is another task
is the one unrecoverable mistake available to a worker.

Order is deliberate: a crash between 1 and 2 strands the mutexes on a `COMPLETE` claim,
which the owner clears. The reverse order would free them while the claim still read
`CLAIMED`, corrupting the audit trail.

## 8. BLOCKED — retain everything

```bash
mv -f claim.json.tmp claim.json        # state=BLOCKED, reason recorded
# NO mutex release
```

A half-finished `index.html` edit must not be raced. The owner decides RELEASE, RESUME or
ABANDON.

## 9. Resume

```bash
C="$ROOT/claims/$TASK_ID/claim.json"
[ -f "$C" ] || { echo "BLOCKED - no claim"; exit 0; }
grep -q "\"lane\"[[:space:]]*:[[:space:]]*\"$LANE\"" "$C" || { echo "BLOCKED - lane mismatch"; exit 0; }
grep -q '"state"[[:space:]]*:[[:space:]]*"\(AUTHORIZED\|CLAIMED\)"' "$C" || { echo "BLOCKED - state"; exit 0; }

A="$ROOT/claims/$TASK_ID/authorized.json"
if grep -q '"state"[[:space:]]*:[[:space:]]*"AUTHORIZED"' "$C"; then
  [ -f "$A" ] || { echo "BLOCKED - AUTHORIZED with no authorized.json"; exit 0; }
  grep -q "\"planId\"[[:space:]]*:[[:space:]]*\"$PLAN_ID\"" "$A" || { echo "BLOCKED - plan drift"; exit 0; }
  grep -q "\"planHash\"[[:space:]]*:[[:space:]]*\"$GOT\"" "$A"   || { echo "BLOCKED - hash drift"; exit 0; }
fi

for CLASS in "${MINE[@]}"; do                     # verify, re-acquire, or block
  DIR="$ROOT/mutex/$(printf '%s' "$CLASS" | sed 's/:/__/g')"
  if [ -d "$DIR" ]; then
    grep -q "\"taskId\"[[:space:]]*:[[:space:]]*\"$TASK_ID\"" "$DIR/holder.json" \
      || { echo "BLOCKED - $CLASS held by another task"; exit 0; }
  else
    mkdir "$DIR" || { echo "BLOCKED - $CLASS"; exit 0; }
    printf '{"taskId":"%s","lane":"%s","acquiredAt":"%s"}\n' \
      "$TASK_ID" "$LANE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DIR/holder.json"
  fi
done
```

Then increment `resumeCount`, update `conversationId`, append `stateHistory`, and execute.
Resume **never** writes `AUTHORIZED` — it consumes an authorization the owner already
wrote. A missing or mismatched `authorized.json` is BLOCKED, never repaired.

## 10. Never

- `mkdir -p` on a claim or mutex directory
- Wait, sleep, retry or back off on a held mutex
- Write `AUTHORIZED` or `ABANDONED`
- Write, edit or delete `authorized.json`, anything under `plans/`, or another task's claim
- `rmdir` a mutex whose `holder.json` names a different `taskId`
- Create the runtime root
- Select a second task after a terminal state
- Publish, or act on a newer `.ai-reports` artifact
