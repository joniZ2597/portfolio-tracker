# Claim Protocol — literal command sequences

Binding reference for `/arc-worker`. Git Bash. The ordering carries the guarantees; run
them as written.

Every executable block is tagged `# @op <name>` on its first line.
`qa/arc_runtime_ops_offline.js` extracts the tagged blocks and **executes them with Git Bash**
against temp git repositories and temp runtime roots (D-31) — the QA proves the real sequence,
never a mirror of it. The only things it re-points after the prelude are the two path variables
`IDENT` and `GATE` (to the checked-out scripts); every command runs verbatim.

```bash
# @op worker-prelude
COMMON="$(git rev-parse --path-format=absolute --git-common-dir)"
case "$COMMON" in
  /*|[A-Za-z]:/*) : ;;
  *) echo "IDLE - git-common-dir did not resolve to an absolute path: $COMMON"; exit 0 ;;
esac
ROOT="$COMMON/arc-runtime"
REPO="$(dirname "$COMMON")"
MAIN_WT="$REPO"
GATE="$REPO/.claude/skills/arc-worker/scripts/phase-gate.js"
IDENT="$REPO/.claude/skills/arc-publish-plan/scripts/lib/runtime-identity.js"
HELD=""; ROLLBACK=0; STATE=""; CLAIM_DIR=""

# Identity is resolved through the committed helper runtime-identity.js (K9, K13, K14) and is never
# re-implemented here. Every wrapper below is a thin call into it.
ident_arc_ok() { node -e 'process.exit(require(process.argv[1]).isValidArcId(process.argv[2]) ? 0 : 1)' "$IDENT" "$1"; }
claim_matches_path() { node -e 'var id=require(process.argv[1]);var fs=require("fs");var r;try{r=JSON.parse(fs.readFileSync(process.argv[2],"utf8"))}catch(e){console.log("unparseable claim record");process.exit(1)}var v=id.claimMatchesPath(r,process.argv[3]);if(!v.ok)console.log(v.reasons.join("; "));process.exit(v.ok?0:1)' "$IDENT" "$1" "$2"; }
holder_is_mine() { node -e 'var id=require(process.argv[1]);var fs=require("fs");var h;try{h=JSON.parse(fs.readFileSync(process.argv[2],"utf8"))}catch(e){process.exit(1)}var a=process.argv[4]===""?null:process.argv[4];process.exit(id.holderOwnershipMatches(h,{arcId:a,taskId:process.argv[3]}).ok?0:1)' "$IDENT" "$1" "$2" "$3"; }

# Read-only accessors. json_get reads a runtime record, row_get reads one field of one plan row.
json_get() { node -e 'var fs=require("fs");var o;try{o=JSON.parse(fs.readFileSync(process.argv[1],"utf8"))}catch(e){process.exit(1)}var v=process.argv[2].split(".").reduce(function(a,k){return a==null?a:a[k]},o);if(v===undefined||v===null)process.exit(1);process.stdout.write(Array.isArray(v)?v.join(" "):String(v))' "$1" "$2"; }
row_get() { node -e 'var p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));var t=(p.tasks||[]).filter(function(x){return x.id===process.argv[2]})[0];var v=t?t[process.argv[3]]:undefined;process.stdout.write(v===undefined||v===null?"":(Array.isArray(v)?v.join(" "):String(v)))' "$PLAN" "$1" "$2"; }
```

`REPO` is derived from the **absolute** common git dir. `--git-common-dir` resolves to the same
path from the main worktree and from every linked worktree, so the coordination domain comes
free from Git (`runtime-contract.md` section 1).

## Arguments — bound by the skill from the typed invocation

```bash
# @op worker-args   (every value is a literal typed by the owner; nothing here is inferred)
LANE="${LANE:?lane required}"          # MAIN | LAB | COWORK
ARC="${ARC:-}"                          # --arc <ARC-ID> literal, or empty for the legacy stream
TASK_ID="${TASK_ID:-}"                  # empty before SELECT; set by --resume <TASK-ID>
RESUME="${RESUME:-0}"                   # 1 in a --resume conversation
CONV="${CONV:-$$}"                      # this conversation's id
```

`ARC` is the `--arc` literal **exactly as typed** — never trimmed, case-folded, or derived from a
task-id prefix, a filename, a slug or a `- Arc:` header. Empty means the legacy stream. There is no
fallback in either direction.

## Namespace selection — one pointer, one claim root, never the other

```bash
# @op worker-namespace   (reads nothing; the ARC literal is judged by runtime-identity.js)
case "$ARC" in
  "")           PTR="$ROOT/plans/current.json";            CLAIMS="$ROOT/claims";             NS=legacy ;;
  CORE-STREAM)  echo "IDLE - --arc CORE-STREAM is the registry index entry for the legacy stream, never a runtime arcId; use the no-flag invocation"; exit 0 ;;
  *)            ident_arc_ok "$ARC" \
                  || { echo "IDLE - --arc \"$ARC\" is not a valid ARC id (case-exact, never normalized)"; exit 0; }
                PTR="$ROOT/plans/arcs/$ARC/current.json";  CLAIMS="$ROOT/arc-claims/$ARC";    NS=arc ;;
esac
```

`PTR` and `CLAIMS` are the **only** pointer and claim root this invocation touches (K15, X-2). A
no-flag worker never reads `arc-claims/` or an ARC pointer; an `--arc` worker never reads `claims/`
or `plans/current.json`. `CORE-STREAM` is the registry's grandfathered *index entry* for the legacy
stream and is refused as a runtime selector, exactly as the publisher refuses it (P-V16).

## 0. Preconditions

```bash
# @op step0-preconditions
[ -d "$ROOT/plans" ] && [ -d "$ROOT/claims" ] && [ -d "$ROOT/mutex" ] \
  || { echo "IDLE - runtime root absent or incomplete"; exit 0; }
case "$LANE" in MAIN|LAB|COWORK) : ;; *) echo "IDLE - lane $LANE"; exit 0 ;; esac
if [ "$NS" = arc ]; then
  if [ ! -f "$PTR" ]; then
    if [ -d "$ROOT/plans/arcs/$ARC" ] && ls "$ROOT/plans/arcs/$ARC"/retired-*.json >/dev/null 2>&1; then
      echo "IDLE - arc-retired: $ARC has no current pointer; plans/arcs/$ARC/ holds only retired-*.json"; exit 0
    fi
    echo "IDLE - arc-not-published: no plans/arcs/$ARC/current.json"; exit 0
  fi
  [ -d "$CLAIMS" ] \
    || { echo "IDLE - arc-claims-container-missing: arc-claims/$ARC/ absent (the publisher creates it at step 9b; a worker never does)"; exit 0; }
else
  [ -f "$PTR" ] || { echo "IDLE - no plans/current.json"; exit 0; }
  if [ -d "$ROOT/plans/arcs" ]; then
    ARCS_PRESENT=$(ls "$ROOT/plans/arcs" 2>/dev/null | tr '\n' ' ')
    [ -z "$ARCS_PRESENT" ] \
      || echo "NOTICE - legacy stream selected (no --arc). ARC pointers exist and are NOT considered here: $ARCS_PRESENT"
  fi
fi
```

`HERDR` and `OWNER` both land in the lane wildcard and exit IDLE.

**Root completeness stays exactly `plans/` + `claims/` + `mutex/`.** `arc-claims/` and `plans/arcs/`
are never required for the root to be complete; their absence is an ARC-level condition, not a
missing root (`runtime-contract.md` section 2).

**`arc-retired` and `arc-not-published` are different rows and are discriminated mechanically.**
After an owner RETIRE (`owner-ops.md` section 11) the pointer is *renamed* to
`retired-<planId>.json`, so `plans/arcs/<ARC-ID>/` still exists and still holds the pointer's bytes.
An ARC that was never published has no such sibling. Without that discriminator the two conditions
would be indistinguishable and the catalogue would silently collapse into one row.

**The legacy notice is report-only and post-decision.** The selector was already fixed by the
absent `--arc`; the notice reads `plans/arcs/` (never `arc-claims/`, never a claim record) purely so
an owner who forgot the flag sees it. It never participates in selecting a namespace, a plan or a
task.

## 1. Load and verify the snapshot

```bash
# @op step1-snapshot
PLAN_ID=$(grep -o '"planId"[[:space:]]*:[[:space:]]*"[^"]*"' "$PTR" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
WANT=$(grep -o '"planHash"[[:space:]]*:[[:space:]]*"[a-f0-9]\{64\}"' "$PTR" | head -1 | grep -o '[a-f0-9]\{64\}')
PLAN="$ROOT/plans/$PLAN_ID/plan.json"
[ -f "$PLAN" ] || { echo "IDLE - snapshot missing: plans/$PLAN_ID/plan.json"; exit 0; }
GOT=$(sha256sum "$PLAN" | cut -d' ' -f1)
[ "$WANT" = "$GOT" ] || { echo "IDLE - plan hash mismatch"; exit 0; }

# W-V13 - pointer identity. The pointer's arcId is the ARC literal, or absent on the legacy stream.
PTR_ARC=$(grep -o '"arcId"[[:space:]]*:[[:space:]]*"[^"]*"' "$PTR" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
if [ "$NS" = arc ]; then
  [ "$PTR_ARC" = "$ARC" ] \
    || { echo "IDLE - pointer-arc-mismatch: plans/arcs/$ARC/current.json carries arcId \"${PTR_ARC:-none}\", --arc is \"$ARC\" (W-V13)"; exit 0; }
else
  [ -z "$PTR_ARC" ] \
    || { echo "IDLE - pointer-arc-mismatch: plans/current.json carries arcId \"$PTR_ARC\"; the legacy stream never does (W-V13)"; exit 0; }
fi
```

Hash the file, never a re-serialization — whitespace differences would produce false
mismatches.

**W-V13 is the mechanical half of D-6.** The `--arc` literal and the pointer must agree before
anything is claimed, so a worker launched against the wrong ARC stops with nothing written rather
than discovering the mismatch after taking resources.

## 1a. FILTER and SELECT — namespace-scoped

```bash
# @op step1a-filter
# One pass over the SELECTED claim root: W-V14 namespace integrity, then depSatisfied per row.
# Exit 3 = claim-arc-mismatch · exit 4 = nothing eligible · exit 0 = SELECTED <id> on the last line.
FILTER=$(node -e 'var id=require(process.argv[1]),fs=require("fs"),path=require("path");var plan=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));var claims=process.argv[3],lane=process.argv[4],arc=process.argv[5];var ns=arc?("arc-claims/"+arc):"claims";var label=arc||"the legacy stream";var ls=function(d){try{return fs.readdirSync(d)}catch(e){return[]}};var rd=function(f){try{return JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){return null}};var dirs=ls(claims);for(var i=0;i<dirs.length;i++){var f=path.join(claims,dirs[i],"claim.json");if(!fs.existsSync(f))continue;var rel=ns+"/"+dirs[i]+"/claim.json";var rec=rd(f);if(!rec){console.log(rel+" is unparseable");process.exit(3)}var v=id.claimMatchesPath(rec,rel);if(!v.ok){console.log(rel+": "+v.reasons.join("; "));process.exit(3)}}var rows=(plan.tasks||[]).filter(function(t){return t.lane===lane});rows.sort(function(a,b){return (a.priority||0)-(b.priority||0)});var sel=null;for(var j=0;j<rows.length;j++){var t=rows[j];if(fs.existsSync(path.join(claims,t.id))){console.log(t.id+" not eligible: a claim already exists in "+label);continue}var deps=t.dependsOn||[],bad=null;for(var k=0;k<deps.length;k++){var c=rd(path.join(claims,deps[k],"claim.json"));if(!c||c.state!=="COMPLETE"){bad=deps[k];break}}if(bad){console.log(t.id+" not eligible: dependency "+bad+" is not COMPLETE in "+label);continue}console.log(t.id+" eligible");if(!sel)sel=t.id}if(!sel)process.exit(4);console.log("SELECTED "+sel)' \
  "$IDENT" "$PLAN" "$CLAIMS" "$LANE" "$ARC"); RC=$?
printf '%s\n' "$FILTER"
case $RC in
  0) TASK_ID=$(printf '%s\n' "$FILTER" | sed -n 's/^SELECTED //p') ;;
  3) echo "IDLE - claim-arc-mismatch: a record in ${ARC:-the legacy stream} does not carry the identity of its own directory (W-V14)"; exit 0 ;;
  4) echo "IDLE - no eligible task for $LANE in ${ARC:-the legacy stream}"; exit 0 ;;
  *) echo "IDLE - FILTER error $RC"; exit 0 ;;
esac
```

The rows are ordered by priority before the scan, so the first eligible id is the lowest priority
number — SELECT is a `head`, never a search. Present the selection to the owner before claiming.

It is **one** process, not one per task and one per dependency: the claim root is read once, every
record is parsed once, and `claimMatchesPath` comes from `runtime-identity.js` inside that same
pass. A per-row shell loop would spawn a Node process for each task, each dependency and each
existing claim, which is both slow and harder to reason about as an atomic read of the namespace.

**Dependency resolution never crosses a namespace.** A `COMPLETE` `D` in another ARC, or in the
legacy stream, does not satisfy this one, and this one's `COMPLETE` does not satisfy the legacy
stream (`runtime-contract.md` section 5.1). The dependency claim's `planId` is deliberately **not**
consulted: completion is a fact about the task, not about the plan version, within its namespace.
An INCOMPLETE-CLAIM directory fails the exists-AND-parses clause, so residue never reads as done.

## 1b. Bind the execution profile — after SELECT, before CLAIM (P-C)

```bash
# @op step1b-bind-profile
# The ladder is approval evidence (A-V5 pastes it verbatim), so it must render the claim root of
# the SELECTED namespace. Resolve it from $CLAIMS - never from the renderer's legacy default.
CLAIM_DIR_REL="${CLAIMS#"$ROOT/"}/$TASK_ID"
node "$GATE" --plan "$PLAN" --task "$TASK_ID" --ladder --claim-dir "$CLAIM_DIR_REL"; RC=$?
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

`phase-gate.js` is claim-root-agnostic by construction: `--claim-dir` accepts any
`<namespace>/.../<TASK-ID>` shape and is what makes the same renderer serve both namespaces, so it
needed no ARC change (section 6a passes the resolved value).

**Tools (D-17).** The effective tool set is the skill's `allowed-tools` (Bash, Read, Write,
Edit, Grep, Glob) ∩ the profile's `tools.allowed`; a profile never widens `allowed-tools`;
`tools.forbidden` is binding prose. `allowed-tools` is not runtime-enforced (X-9), so this
rule plus owner review is the fence.

## 2. Claim

```bash
# @op step2-claim
mkdir "$CLAIMS/$TASK_ID" \
  || { echo "IDLE - claim directory already exists in ${ARC:-the legacy stream}: $CLAIMS/$TASK_ID"; exit 0; }
```

**Plain `mkdir`. Never `-p`.** `-p` is idempotent and would silently "succeed" on a claim
someone else holds, destroying the entire guarantee. It is also why the per-ARC container
`arc-claims/<ARC-ID>/` must already exist: a worker creates its own claim directory and nothing
above it.

Exit 0 means acquired. Non-zero means held — move to the next candidate, never wait. The same
`TASK-ID` under a different ARC, or in the legacy stream, is a **different identity** and does not
collide (proof A).

## 3. Acquire mutexes in canonical order

```bash
# @op step3-mutex
CLASSES=$(row_get "$TASK_ID" mutexes)
# sort on the UNENCODED strings, then encode each name
SORTED=$(printf '%s\n' $CLASSES | LC_ALL=C sort)
HELD=""; ROLLBACK=0
for CLASS in $SORTED; do
  DIR="$ROOT/mutex/$(printf '%s' "$CLASS" | sed 's/:/__/g')"
  if mkdir "$DIR" 2>/dev/null; then
    if [ -n "$ARC" ]; then
      printf '{"taskId":"%s","lane":"%s","acquiredAt":"%s","arcId":"%s"}\n' \
        "$TASK_ID" "$LANE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ARC" > "$DIR/holder.json"
    else
      printf '{"taskId":"%s","lane":"%s","acquiredAt":"%s"}\n' \
        "$TASK_ID" "$LANE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DIR/holder.json"
    fi
    HELD="$HELD $CLASS"
  else
    echo "STOPPED - $CLASS held by: $(cat "$DIR/holder.json" 2>/dev/null)"
    ROLLBACK=1; break
  fi
done
```

`LC_ALL=C` forces byte order. A locale-aware sort could order differently on another
machine, and two workers computing different orders is exactly the deadlock this prevents.

**Mutex classes are global and are never namespaced by ARC.** The holder record carries `arcId`
only to identify *who* holds the class — `CODE:index-html` taken for `ARC-A/T` blocks `ARC-B/T` and
the legacy `T` alike (proof D). The holder shape is exactly the publisher's step-4 shape
(`holder.schema.json`): `arcId` present for an ARC identity, absent for a legacy one.

## 4. Rollback — complete, or not at all

```bash
# @op step4-rollback
if [ "$ROLLBACK" = 1 ]; then
  for CLASS in $(printf '%s\n' $HELD | tac); do
    DIR="$ROOT/mutex/$(printf '%s' "$CLASS" | sed 's/:/__/g')"
    rm -f "$DIR/holder.json"; rmdir "$DIR"
  done
  rmdir "$CLAIMS/$TASK_ID"
  echo "STOPPED - taskState UNCLAIMED; rolled back every class this conversation acquired and removed the claim directory; nothing was written"
  exit 0
fi
```

Reverse acquisition order. The claim directory goes too, so the task returns to
`UNCLAIMED` and **no state is written**. Report `outcome=STOPPED, taskState=UNCLAIMED`,
reason `mutex-unavailable(<class>, held by <arcId ?? legacy>/<taskId>)`.

## 5. Commit the claim

```bash
# @op step5-commit-claim
CLAIM_DIR="$CLAIMS/$TASK_ID"
STATE=CLAIMED
[ "$(row_get "$TASK_ID" requiresOwnerGo)" = true ] && STATE=WAITING_OWNER_GO
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
node -e 'var fs=require("fs");var a=process.argv;var c={taskId:a[2],lane:a[3],planId:a[4],planHash:a[5],conversationId:a[6],startedAt:a[7],mutexes:a[9].split(" ").filter(Boolean),state:a[8],stateHistory:[{state:a[8],at:a[7],by:"worker"}],reason:null,mutexesReleasedAt:null,resumeCount:0};if(a[10])c.arcId=a[10];fs.writeFileSync(a[1],JSON.stringify(c,null,2)+"\n")' \
  "$CLAIM_DIR/claim.json.tmp" "$TASK_ID" "$LANE" "$PLAN_ID" "$GOT" "$CONV" "$NOW" "$STATE" "$HELD" "$ARC"
mv -f "$CLAIM_DIR/claim.json.tmp" "$CLAIM_DIR/claim.json"
echo "$STATE $TASK_ID in ${ARC:-the legacy stream}"
```

`STATE` is `WAITING_OWNER_GO` when the plan row has `requiresOwnerGo: true`, otherwise
`CLAIMED`. **Never `AUTHORIZED`.**

`arcId` is written **last** and **only** for an ARC claim, so the record matches its directory under
`claimMatchesPath`: a `claims/` record must not carry one, an `arc-claims/<ARC-ID>/` record must
carry exactly that one. The record is built by parse-modify-serialize rather than by string
interpolation so a task id or lane can never break the JSON.

Between step 2 and this write there is a window where the claim directory exists with no
`claim.json`. That is the documented INCOMPLETE-CLAIM residue and is owner-recoverable. It
is preferable to writing state before the mutexes are actually held.

## 6. Owner-GO stop

```bash
# @op step6-owner-go
if [ "$STATE" = WAITING_OWNER_GO ]; then
  echo "WAITING_OWNER_GO $TASK_ID - reserved in ${ARC:-the legacy stream}; the owner runs: /arc-authorize $TASK_ID${ARC:+ --arc $ARC}"
  echo "  mutexes stay held while the owner decides:$HELD"
  exit 0
fi
```

Report and **STOP**. Do not execute, do not plan, do not prepare. The mutexes stay held so the
reservation is real while the owner decides. The authorize invocation carries the **same selector**
the claim was taken under; without it `/arc-authorize` would look in the legacy namespace and refuse.

## 6a. Phase entry — before the first write of every phase (P-C)

```bash
# @op step6a-phase-entry
# the worktree named by scope.worktree (printed by --ladder); phase-gate.js is git-free, so
# the path is resolved here and passed in (D-16)
CLAIM_DIR_REL="${CLAIMS#"$ROOT/"}/$TASK_ID"   # the task's claim directory per runtime-contract.md section 2
WT_NAME=$(node "$GATE" --plan "$PLAN" --task "$TASK_ID" --ladder --claim-dir "$CLAIM_DIR_REL" | sed -n 's/^worktree  *\([^ ]*\).*/\1/p')
case "$WT_NAME" in
  none)       WT_PATH="" ;;
  branch-dev) WT_PATH="$MAIN_WT"
              [ "$(git -C "$MAIN_WT" branch --show-current)" = "branch-dev" ] \
                || { echo "BLOCKED - main worktree is not on branch-dev"; exit 0; } ;;
  *)          WT_PATH=$(git worktree list --porcelain | sed -n 's/^worktree //p' | grep "/$WT_NAME\$" | head -1)
              [ -n "$WT_PATH" ] || { echo "BLOCKED - linked worktree $WT_NAME not found"; exit 0; } ;;
esac

# LAST_ACK is UNKNOWN at the first entry of every conversation; ANSWERED is set only after
# the operator's literal for THIS phase entry; RESUMED is set in a --resume conversation.
node "$GATE" --plan "$PLAN" --task "$TASK_ID" --phase "$PHASE" --last-ack "$LAST_ACK" \
     ${ANSWERED:+--answered} ${RESUMED:+--resumed} --claim-dir "$CLAIM_DIR_REL" \
     ${WT_PATH:+--worktree-path "$WT_PATH"}; RC=$?
# 0 CONTINUE -> work the phase · 2 STOP -> print the banner and WAIT · 3 usage/IO -> BLOCKED

node "$GATE" --plan "$PLAN" --task "$TASK_ID" --scope --phase "$PHASE" \
     --claim-dir "$CLAIM_DIR_REL" ${WT_PATH:+--worktree-path "$WT_PATH"}
```

`CLAIM_DIR_REL` is `claims/<TASK-ID>` on the legacy stream and `arc-claims/<ARC-ID>/<TASK-ID>` under
`--arc`; `phase-gate.js` substitutes it for the logical `claims/<TASK-ID>/claim.json` token wherever
a phase scope names the claim, and prints `(legacy namespace)` only for the legacy shape.

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
# @op step7-complete
C="$CLAIMS/$TASK_ID/claim.json"
[ -f "$C" ] || { echo "BLOCKED - no claim to complete at $C"; exit 0; }
MINE=$(json_get "$C" mutexes)

# 1. state
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
node -e 'var fs=require("fs");var f=process.argv[1];var c=JSON.parse(fs.readFileSync(f,"utf8"));c.state="COMPLETE";c.stateHistory=(c.stateHistory||[]).concat([{state:"COMPLETE",at:process.argv[2],by:"worker"}]);fs.writeFileSync(f+".tmp",JSON.stringify(c,null,2)+"\n")' "$C" "$NOW"
mv -f "$C.tmp" "$C"

# 2. release, verifying the FULL owner pair per class
RELEASED=""
for CLASS in $MINE; do
  DIR="$ROOT/mutex/$(printf '%s' "$CLASS" | sed 's/:/__/g')"
  [ -f "$DIR/holder.json" ] || continue
  holder_is_mine "$DIR/holder.json" "$TASK_ID" "$ARC" \
    || { echo "RETAINED $CLASS - holder is not this owner pair (arcId ${ARC:-none}, taskId $TASK_ID)"; continue; }
  rm "$DIR/holder.json" && rmdir "$DIR" && RELEASED="$RELEASED $CLASS"
done

# 3. stamp mutexesReleasedAt
node -e 'var fs=require("fs");var f=process.argv[1];var c=JSON.parse(fs.readFileSync(f,"utf8"));c.mutexesReleasedAt=process.argv[2];fs.writeFileSync(f+".tmp",JSON.stringify(c,null,2)+"\n")' "$C" "$NOW"
mv -f "$C.tmp" "$C"
echo "COMPLETE $TASK_ID - released:${RELEASED:- none}"
```

The ownership check is not optional, and it is the **pair** `(arcId ?? null, taskId)`, not the task
id alone (K14, D-28). `rmdir` on a directory whose holder is another owner is the one unrecoverable
mistake available to a worker, and after multi-ARC the same `taskId` can legitimately name three
different owners. A class held by someone else is **skipped**, never forced: the worker completes
and reports what it retained. That is a different disposition from owner RELEASE, which refuses
outright rather than skipping (`owner-ops.md` section 3).

Order is deliberate: a crash between 1 and 2 strands the mutexes on a `COMPLETE` claim,
which the owner clears. The reverse order would free them while the claim still read
`CLAIMED`, corrupting the audit trail. The `COMPLETE` claim itself is **retained** — it is the
completion ledger section 5.1 resolves dependencies from.

## 8. BLOCKED — retain everything

```bash
# @op step8-blocked
C="$CLAIMS/$TASK_ID/claim.json"
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
node -e 'var fs=require("fs");var f=process.argv[1];var c=JSON.parse(fs.readFileSync(f,"utf8"));c.state="BLOCKED";c.reason=process.argv[3];c.stateHistory=(c.stateHistory||[]).concat([{state:"BLOCKED",at:process.argv[2],by:"worker"}]);fs.writeFileSync(f+".tmp",JSON.stringify(c,null,2)+"\n")' "$C" "$NOW" "$REASON"
mv -f "$C.tmp" "$C"
# NO mutex release
echo "BLOCKED $TASK_ID - mutexes RETAINED:${MINE:-$HELD}"
```

A half-finished `index.html` edit must not be raced. The owner decides RELEASE, RESUME or
ABANDON — each under the same selector this claim lives in.

## 9. Resume

```bash
# @op step9-resume
CLAIM_DIR="$CLAIMS/$TASK_ID"
C="$CLAIM_DIR/claim.json"
[ -f "$C" ] \
  || { echo "BLOCKED - no claim for $TASK_ID under $CLAIM_DIR; the other namespace is never searched"; exit 0; }

# W-V14 / D-6 - the record must belong to the SELECTED namespace. A record naming another ARC (or a
# legacy record carrying an arcId) is a wrong-`--arc` resume: STOPPED, nothing written, nothing released.
CREL="${CLAIM_DIR#"$ROOT/"}/claim.json"
claim_matches_path "$C" "$CREL" >/dev/null \
  || { echo "STOPPED - wrong-ARC resume: the claim at $CREL does not carry the identity of ${ARC:-the legacy stream} (W-V14, D-6); nothing was written and nothing was released"; exit 0; }

grep -q "\"lane\"[[:space:]]*:[[:space:]]*\"$LANE\"" "$C" || { echo "BLOCKED - lane mismatch"; exit 0; }
grep -q '"state"[[:space:]]*:[[:space:]]*"\(AUTHORIZED\|CLAIMED\)"' "$C" || { echo "BLOCKED - state"; exit 0; }

[ "$(json_get "$C" planId)" = "$PLAN_ID" ] \
  || { echo "BLOCKED - plan-not-current-for-arc: claim is against $(json_get "$C" planId), current in ${ARC:-the legacy stream} is $PLAN_ID"; exit 0; }
[ "$(json_get "$C" planHash)" = "$GOT" ] \
  || { echo "BLOCKED - plan-not-current-for-arc: planHash drift"; exit 0; }

A="$CLAIM_DIR/authorized.json"
if grep -q '"state"[[:space:]]*:[[:space:]]*"AUTHORIZED"' "$C"; then
  [ -f "$A" ] || { echo "BLOCKED - AUTHORIZED with no authorized.json"; exit 0; }
  grep -q "\"planId\"[[:space:]]*:[[:space:]]*\"$PLAN_ID\"" "$A" || { echo "BLOCKED - plan drift"; exit 0; }
  grep -q "\"planHash\"[[:space:]]*:[[:space:]]*\"$GOT\"" "$A"   || { echo "BLOCKED - hash drift"; exit 0; }
fi

MINE=$(json_get "$C" mutexes)
for CLASS in $MINE; do                            # verify the pair, re-acquire, or block
  DIR="$ROOT/mutex/$(printf '%s' "$CLASS" | sed 's/:/__/g')"
  if [ -d "$DIR" ]; then
    [ -f "$DIR/holder.json" ] || { echo "BLOCKED - $CLASS has no holder.json; owner residue recovery"; exit 0; }
    holder_is_mine "$DIR/holder.json" "$TASK_ID" "$ARC" \
      || { echo "BLOCKED - $CLASS is held by another owner pair; retaining what is already held"; exit 0; }
  else
    mkdir "$DIR" || { echo "BLOCKED - $CLASS"; exit 0; }
    if [ -n "$ARC" ]; then
      printf '{"taskId":"%s","lane":"%s","acquiredAt":"%s","arcId":"%s"}\n' \
        "$TASK_ID" "$LANE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ARC" > "$DIR/holder.json"
    else
      printf '{"taskId":"%s","lane":"%s","acquiredAt":"%s"}\n' \
        "$TASK_ID" "$LANE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DIR/holder.json"
    fi
  fi
done

NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
node -e 'var fs=require("fs");var f=process.argv[1];var c=JSON.parse(fs.readFileSync(f,"utf8"));c.resumeCount=(c.resumeCount||0)+1;c.conversationId=process.argv[2];c.stateHistory=(c.stateHistory||[]).concat([{state:c.state,at:process.argv[3],by:"worker"}]);fs.writeFileSync(f+".tmp",JSON.stringify(c,null,2)+"\n")' "$C" "$CONV" "$NOW"
mv -f "$C.tmp" "$C"
echo "RESUMED $TASK_ID in ${ARC:-the legacy stream} - resumeCount $(json_get "$C" resumeCount)"
```

Resume **never** writes `AUTHORIZED` — it consumes an authorization the owner already
wrote. A missing or mismatched `authorized.json` is BLOCKED, never repaired.

**The wrong-`--arc` resume is a `STOPPED` outcome, not a state.** It writes nothing, releases
nothing, and leaves the task exactly as it was — the same vocabulary as the pre-claim mutex refusal
(`runtime-contract.md` section 4). Recording it as `BLOCKED` would assert a transition on a claim
this invocation has no authority over.

```bash
# @op step9b-resume-rebind   (section 9 continued: re-bind the profile in the SELECTED namespace)
CLAIM_DIR_REL="${CLAIM_DIR#"$ROOT/"}"         # the resumed claim, in the SELECTED namespace
node "$GATE" --plan "$PLAN" --task "$TASK_ID" --ladder --claim-dir "$CLAIM_DIR_REL" \
  || { echo "BLOCKED - profile binding failed on resume"; exit 0; }
LAST_ACK=UNKNOWN; ANSWERED=; RESUMED=1        # prior acknowledgements not carried
```

Then walk the ladder from `phases[0]` through section 6a with `--resumed`: phases whose exit
evidence already exists are recorded `SKIP-evidenced (no write)`, the rest are performed. The
`AUTHORIZED_JSON` entry gate of `phases[0]` is satisfied by the preconditions above —
mechanically, never by conversation text.

## 10. Never

- `mkdir -p` on a claim or mutex directory
- Create a claim root or a per-ARC container (`claims/`, `arc-claims/`, `arc-claims/<ARC-ID>/`, `plans/arcs/`)
- Read, list or write the namespace this invocation did not select, or fall back to it
- Derive an ARC identity from anything but the typed `--arc` literal
- Wait, sleep, retry or back off on a held mutex
- Write `AUTHORIZED` or `ABANDONED`
- Write, edit or delete `authorized.json`, anything under `plans/`, or another task's claim
- `rmdir` a mutex whose `holder.json` names a different owner pair `(arcId ?? null, taskId)`
- Create the runtime root
- Select a second task after a terminal state
- Publish, or act on a newer `.ai-reports` artifact
- Continue past a STOP action printed by `phase-gate.js` before its resolution (the operator's `MODE` literal, a return to a mapped harness mode, or the satisfied entry-gate / resume precondition)
- Change the permission mode, or print "mode changed" — the worker records what the operator acknowledged, never a harness transition
- Read the execution-profile library at runtime — the embedded snapshot copy is the only source
