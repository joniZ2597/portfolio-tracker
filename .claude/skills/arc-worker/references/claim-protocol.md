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

## 1a. Bind the execution profile — after SELECT, before CLAIM (P-C)

```bash
MAIN_WT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
GATE="$MAIN_WT/.claude/skills/arc-worker/scripts/phase-gate.js"
PLAN="$ROOT/plans/$PLAN_ID/plan.json"
node "$GATE" --plan "$PLAN" --task "$TASK_ID" --ladder; RC=$?
case $RC in
  0) : ;;                                                  # W-V10 verified, or "profile none (legacy snapshot)"
  4) echo "IDLE - profile binding failed (profile-binding-missing | profile-hash-mismatch)"; exit 0 ;;
  *) echo "IDLE - phase-gate usage/IO error $RC"; exit 0 ;;
esac
```

`phase-gate.js` reads **one** file — the snapshot — and writes nothing; it never opens the
profile library (the embedded copy is the only source, K4). Exit 4 before the claim is
**IDLE with nothing written**; the same failure on `--resume` (section 9) is **BLOCKED**.
`profile none (legacy snapshot)` means a snapshot without `executionProfiles`: run the V1
sequence unchanged and skip section 6a entirely. Keep the ladder output: `/arc-authorize`
prints the same block (A-V5) and the report's `profile` line quotes it.

**Tools (D-17).** The effective tool set is the skill's `allowed-tools` (Bash, Read, Write,
Edit, Grep, Glob) ∩ the profile's `tools.allowed`; a profile never widens `allowed-tools`;
`tools.forbidden` is binding prose. `allowed-tools` is not runtime-enforced (X-9), so this
rule plus owner review is the fence.

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

## 6a. Phase entry — before the first write of every phase (P-C)

```bash
# the worktree named by scope.worktree (printed by --ladder); phase-gate.js is git-free, so
# the path is resolved here and passed in (D-16)
WT_NAME=$(node "$GATE" --plan "$PLAN" --task "$TASK_ID" --ladder | sed -n 's/^worktree  *\([^ ]*\).*/\1/p')
case "$WT_NAME" in
  none)       WT_PATH="" ;;
  branch-dev) WT_PATH="$MAIN_WT"
              [ "$(git -C "$MAIN_WT" branch --show-current)" = "branch-dev" ] \
                || { echo "BLOCKED - main worktree is not on branch-dev"; exit 0; } ;;
  *)          WT_PATH=$(git worktree list --porcelain | sed -n 's/^worktree //p' | grep "/$WT_NAME\$" | head -1)
              [ -n "$WT_PATH" ] || { echo "BLOCKED - linked worktree $WT_NAME not found"; exit 0; } ;;
esac
CLAIM_DIR="claims/$TASK_ID"     # the task's claim directory per runtime-contract.md section 2

# LAST_ACK is UNKNOWN at the first entry of every conversation; ANSWERED is set only after
# the operator's literal for THIS phase entry; RESUMED is set in a --resume conversation.
node "$GATE" --plan "$PLAN" --task "$TASK_ID" --phase "$PHASE" --last-ack "$LAST_ACK" \
     ${ANSWERED:+--answered} ${RESUMED:+--resumed} --claim-dir "$CLAIM_DIR" \
     ${WT_PATH:+--worktree-path "$WT_PATH"}; RC=$?
# 0 CONTINUE -> work the phase · 2 STOP -> print the banner and WAIT · 3 usage/IO -> BLOCKED

node "$GATE" --plan "$PLAN" --task "$TASK_ID" --scope --phase "$PHASE" \
     --claim-dir "$CLAIM_DIR" ${WT_PATH:+--worktree-path "$WT_PATH"}
```

On exit 2 the worker stops and waits. `HANDSHAKE-REQUIRED`, `STOP-request-MODE-literal` and
an acknowledged mode above the ceiling wait for the appropriate operator literal — exactly
`MODE MANUAL`, `MODE ACCEPT_EDITS` or `MODE AUTO` on its own line in the operator's own
message — after which the worker re-runs the same command with `--last-ack <X> --answered`
and prints `operator acknowledged MODE X at <ISO>`; nothing else updates `LAST_ACK`, a
literal above the ceiling stops again, one handshake per phase entry. An unmapped harness
mode (`plan`, `dontAsk`, `bypassPermissions`) waits until the operator returns to a mapped
harness mode, then the worker re-evaluates with the same command. `entry-gate-unsatisfied`
waits until the entry-gate / resume precondition is satisfied (section 9). Every write of
the phase must fall inside the `--scope` output or the V1 allowlist; anything else is
BLOCKED `scope-expansion` (section 8, mutexes retained). Close the phase with one
`PHASE EXIT <TASK_ID> <PHASE> - <evidence>` line; the CLOSE phase (TERMINAL, ceiling
MANUAL) then runs section 7.

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

```bash
node "$GATE" --plan "$PLAN" --task "$TASK_ID" --ladder || { echo "BLOCKED - profile binding failed on resume"; exit 0; }
LAST_ACK=UNKNOWN; ANSWERED=; RESUMED=1        # prior acknowledgements not carried
```

Then walk the ladder from `phases[0]` through section 6a with `--resumed`: phases whose exit
evidence already exists are recorded `SKIP-evidenced (no write)`, the rest are performed. The
`AUTHORIZED_JSON` entry gate of `phases[0]` is satisfied by R1–R5 above — mechanically, never
by conversation text.

## 10. Never

- `mkdir -p` on a claim or mutex directory
- Wait, sleep, retry or back off on a held mutex
- Write `AUTHORIZED` or `ABANDONED`
- Write, edit or delete `authorized.json`, anything under `plans/`, or another task's claim
- `rmdir` a mutex whose `holder.json` names a different `taskId`
- Create the runtime root
- Select a second task after a terminal state
- Publish, or act on a newer `.ai-reports` artifact
- Continue past a STOP action printed by `phase-gate.js` before its resolution (the operator's `MODE` literal, a return to a mapped harness mode, or the satisfied entry-gate / resume precondition)
- Change the permission mode, or print "mode changed" — the worker records what the operator acknowledged, never a harness transition
- Read the execution-profile library at runtime — the embedded snapshot copy is the only source
