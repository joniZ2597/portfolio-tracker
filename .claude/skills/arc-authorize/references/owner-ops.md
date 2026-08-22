# ARC Owner Operations — manual recovery procedures

Every operation here is an **owner act**, performed by hand. None is wrapped in a skill.

Contract section 6.2 is explicit about why: RELEASE, RESUME and ABANDON are rare,
destructive, and must be deliberate. A convenience wrapper is exactly the wrong ergonomics
for the operations that defeat principle 8 (no stale claim stealing).

Every executable block is tagged `# @op <name>` on its first line. `qa/arc_runtime_ops_offline.js`
extracts the tagged blocks and **executes them with Git Bash** against temp runtime roots (D-31),
so the selector, the pair checks and the RETIRE rename are proven as written, not as a mirror.

```bash
# @op owner-prelude
COMMON="$(git rev-parse --path-format=absolute --git-common-dir)"
ROOT="$COMMON/arc-runtime"
REPO="$(dirname "$COMMON")"
IDENT="$REPO/.claude/skills/arc-publish-plan/scripts/lib/runtime-identity.js"

# Identity is resolved through the committed helper runtime-identity.js (K9, K14); never re-implemented.
ident_arc_ok() { node -e 'process.exit(require(process.argv[1]).isValidArcId(process.argv[2]) ? 0 : 1)' "$IDENT" "$1"; }
holder_is_owner() { node -e 'var id=require(process.argv[1]);var fs=require("fs");var h;try{h=JSON.parse(fs.readFileSync(process.argv[2],"utf8"))}catch(e){process.exit(1)}var a=process.argv[4]===""?null:process.argv[4];process.exit(id.holderOwnershipMatches(h,{arcId:a,taskId:process.argv[3]}).ok?0:1)' "$IDENT" "$1" "$2" "$3"; }
json_get() { node -e 'var fs=require("fs");var o;try{o=JSON.parse(fs.readFileSync(process.argv[1],"utf8"))}catch(e){process.exit(1)}var v=process.argv[2].split(".").reduce(function(a,k){return a==null?a:a[k]},o);if(v===undefined||v===null)process.exit(1);process.stdout.write(Array.isArray(v)?v.join(" "):String(v))' "$1" "$2"; }
```

## 1. Standing rules

| Rule | Why |
|---|---|
| Never touch another worker's **live** claim | Principle 8. A live claim is `CLAIMED`, `WAITING_OWNER_GO`, or `AUTHORIZED` with a running conversation |
| Never hand-edit anything under `plans/` | Snapshots are immutable and hash-pinned. A change is a new `planId`, published through the skill |
| Never let a worker perform any operation in this file | Workers write only their own claim and their own mutex holders |
| Release a mutex only after confirming the full holder pair `(arcId ?? null, taskId)` | Deleting a directory held by someone else is the one unrecoverable mistake here, and after multi-ARC the same `taskId` can name three different owners |
| Every **mutating** operation names its namespace explicitly | Section 1a. A mutation that searches for its own target is stale-claim stealing with extra steps |
| Record every operation in CHECKPOINT | Runtime state is durable but undocumented; CHECKPOINT is the audit trail |

A conversation that died without reaching a terminal state **retains its mutexes**. That is
the intended fail-closed cost of principle 8, not a bug to be automated away.

## 1a. Namespace selector — required by every mutating operation (X-2)

```bash
# @op owner-selector   (runs BEFORE any namespace read; a missing or doubled selector reads nothing)
SEL="${SEL:-}"                 # "legacy" for --legacy, "arc" for --arc, empty when neither was typed
ARC="${ARC:-}"                 # the --arc <ARC-ID> literal, exactly as typed
case "$SEL" in
  legacy)
    [ -z "$ARC" ] || { echo "REFUSED - --legacy and --arc are mutually exclusive; exactly one selector, nothing read"; exit 1; }
    CLAIMS="$ROOT/claims"; PTR="$ROOT/plans/current.json"; NS=legacy ;;
  arc)
    [ -n "$ARC" ] || { echo "REFUSED - --arc requires an ARC-ID literal; nothing read"; exit 1; }
    ident_arc_ok "$ARC" \
      || { echo "REFUSED - --arc \"$ARC\" is not a valid ARC id (case-exact, never normalized); nothing read"; exit 1; }
    CLAIMS="$ROOT/arc-claims/$ARC"; PTR="$ROOT/plans/arcs/$ARC/current.json"; NS=arc ;;
  *)
    echo "REFUSED - a mutating owner operation requires exactly one namespace selector: --legacy | --arc <ARC-ID>"
    echo "  nothing was read and nothing was written. This command never searches for its own target."
    exit 1 ;;
esac
```

**Every mutating operation below — RELEASE, RESUME, ABANDON, re-pin, owner-lane mutex ACQUIRE and
RELEASE, and RETIRE — takes exactly one of `--legacy` or `--arc <ARC-ID>`, resolves exactly one
path, and reads no other namespace.** Missing or doubled selector ⇒ REFUSE **before any read**.
Target absent under the selector ⇒ REFUSE not-found; **never fall back** to the other namespace,
not even when the same `taskId` plainly exists there. `TASK-10` in `claims/`, in
`arc-claims/ARC-A/` and in `arc-claims/ARC-B/` are three different claims, and picking one by
searching is exactly the mistake the selector exists to make impossible.

**INSPECT (section 2) is the sole exception**: it is read-only, takes no selector, and enumerates
every namespace on purpose.

## 2. INSPECT — read-only, no selector, enumerates every namespace

```bash
# @op owner-inspect   (read-only: this block writes nothing, anywhere; no selector, both namespaces)
node -e 'var fs=require("fs"),path=require("path");var root=process.argv[1];var ls=function(d){try{return fs.readdirSync(d).sort()}catch(e){return[]}};var rd=function(f){try{return JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){return null}};var pad=function(s,n){s=String(s);while(s.length<n)s+=" ";return s};
console.log("== active pointers ==");var lc=rd(path.join(root,"plans","current.json"));if(lc)console.log("  legacy  "+lc.planId);
ls(path.join(root,"plans","arcs")).forEach(function(a){var d=path.join(root,"plans","arcs",a);var c=rd(path.join(d,"current.json"));console.log("  arc     "+pad(a,16)+(c?c.planId:"RETIRED ("+ls(d).join(" ")+")"))});
var ids={};var note=function(t,n){(ids[t]=ids[t]||[]).push(n)};
console.log("== claims/ (legacy stream) ==");ls(path.join(root,"claims")).forEach(function(t){var c=rd(path.join(root,"claims",t,"claim.json"));console.log("  "+pad(t,20)+(c?c.state:"INCOMPLETE-CLAIM (no claim.json)"));note(t,"legacy")});
console.log("== arc-claims/ (ARC namespaces) ==");ls(path.join(root,"arc-claims")).forEach(function(a){console.log("  "+a+"/");ls(path.join(root,"arc-claims",a)).forEach(function(t){var c=rd(path.join(root,"arc-claims",a,t,"claim.json"));console.log("    "+pad(t,18)+(c?c.state:"INCOMPLETE-CLAIM (no claim.json)"));note(t,a)})});
console.log("== mutex holders  (arcId ?? legacy, taskId) ==");ls(path.join(root,"mutex")).forEach(function(m){var h=rd(path.join(root,"mutex",m,"holder.json"));console.log("  "+pad(m,28)+(h?("("+(h.arcId||"legacy")+", "+h.taskId+")"):"NO HOLDER FILE"))});
console.log("== duplicate task ids across namespaces ==");var dup=Object.keys(ids).sort().filter(function(t){return ids[t].length>1});if(!dup.length)console.log("  none");dup.forEach(function(t){console.log("  DUPLICATE-ID-INFO "+t+" exists in: "+ids[t].join(" "))})' \
  "$ROOT"
```

Run this first, always. Every other operation below depends on knowing the current state.

**`DUPLICATE-ID-INFO` is information, never a warning.** The same `taskId` in more than one
namespace is legal and expected — that is the whole point of per-ARC claim identity. It is printed
so an owner about to type a selector can see which namespaces the id lives in.

## 3. RELEASE

Removes a **stopped** claim so the task returns to `UNCLAIMED` and can be claimed again.

**Precondition:** state is `BLOCKED` or `ABANDONED`. Never release a live claim.

**`COMPLETE` is not a legal RELEASE source (owner ruling 2026-08-20, R-M; analysis:
`.ai-reports/handoffs/2026-08-16_arc-v1-completion-durability-ruling.MAIN.md`).** A retained
`COMPLETE` claim is the runtime's *only* record that the task finished, and worker
dependency resolution reads exactly that record (`arc-worker/references/runtime-contract.md`
§5.1). Releasing it makes every task that `dependsOn` it permanently and silently
unselectable — the worker reports `IDLE`, which is indistinguishable from having nothing to
do. `COMPLETE` claims are retained by design: they **are** the completion ledger, not
clutter (~1 KB per task).

To deliberately make a completed task runnable again, withdraw the completion on the record
first — the capability is preserved, it just cannot be silent:

```
COMPLETE --[OWNER ABANDON, section 5]--> ABANDONED --[OWNER RELEASE, here]--> UNCLAIMED
```

**Procedure** — for a `BLOCKED` or `ABANDONED` claim only, after section 1a has fixed the namespace:

```bash
# @op owner-release   (requires owner-selector; resolves exactly one path, never a search)
TASK="${TASK:?task id required}"
D="$CLAIMS/$TASK"
[ -d "$D" ] \
  || { echo "REFUSED - not-found: no claim directory at $D under the selected namespace (${ARC:-legacy}); the other namespace is never searched and there is no fallback"; exit 1; }
[ -f "$D/claim.json" ] || { echo "REFUSED - INCOMPLETE-CLAIM residue; use section 8, not RELEASE"; exit 1; }
S=$(json_get "$D/claim.json" state)
case "$S" in
  BLOCKED|ABANDONED) : ;;
  COMPLETE) echo "REFUSED - $TASK is COMPLETE: terminal-durable and the dependency ledger (R-M). Withdraw it with ABANDON first"; exit 1 ;;
  *)        echo "REFUSED - $TASK is $S; RELEASE takes only BLOCKED or ABANDONED"; exit 1 ;;
esac

cat "$D/claim.json"                          # 1. archive this text into CHECKPOINT before it goes

for m in "$ROOT"/mutex/*/; do                # 2. release mutexes held by THIS owner pair only
  [ -f "$m/holder.json" ] || continue
  holder_is_owner "$m/holder.json" "$TASK" "$ARC" || continue
  rm "$m/holder.json" && rmdir "$m" && echo "released $(basename "$m")"
done

rm "$D"/*.json                               # 3. remove the claim
rmdir "$D"
echo "RELEASED $TASK from ${ARC:-the legacy stream}"
```

Step 1 is not optional. Removing the claim destroys the only durable record that the task
ran, so the audit trail has to move somewhere before the directory goes.

The mutex loop matches the **full pair** `(arcId ?? null, taskId)` through
`runtime-identity.js holderOwnershipMatches`, so releasing `ARC-A/TASK-10` never touches the class
`ARC-B/TASK-10` or the legacy `TASK-10` is holding (D-28, K14). A worker completing normally
*skips* a class it does not own and carries on; this procedure is the owner's, so a
non-owned class is simply left alone and reported — but the claim removal itself is refused
outright rather than partially performed if the record is not a legal RELEASE source.

## 4. RESUME

Returns a `BLOCKED` claim to an executable state.

**Precondition:** state is `BLOCKED`, and the blocking condition has actually been resolved.

```bash
# @op owner-resume   (requires owner-selector)
TASK="${TASK:?task id required}"
NEXT="${NEXT:?CLAIMED or AUTHORIZED required}"
D="$CLAIMS/$TASK"
[ -f "$D/claim.json" ] \
  || { echo "REFUSED - not-found: no claim.json at $D under the selected namespace (${ARC:-legacy}); never a fallback"; exit 1; }
[ "$(json_get "$D/claim.json" state)" = BLOCKED ] || { echo "REFUSED - RESUME takes only a BLOCKED claim"; exit 1; }
if [ "$NEXT" = AUTHORIZED ]; then
  [ -f "$D/authorized.json" ] || { echo "REFUSED - AUTHORIZED requires a valid authorized.json"; exit 1; }
  [ "$(json_get "$D/authorized.json" planId)" = "$(json_get "$PTR" planId)" ] \
    || { echo "REFUSED - the token is pinned to a superseded plan; section 9, never a re-grant"; exit 1; }
fi
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
node -e 'var fs=require("fs");var f=process.argv[1];var c=JSON.parse(fs.readFileSync(f,"utf8"));c.state=process.argv[2];c.reason=process.argv[4]||null;c.stateHistory=(c.stateHistory||[]).concat([{state:process.argv[2],at:process.argv[3],by:"owner"}]);fs.writeFileSync(f+".tmp",JSON.stringify(c,null,2)+"\n")' \
  "$D/claim.json" "$NEXT" "$NOW" "${NOTE:-}"
mv -f "$D/claim.json.tmp" "$D/claim.json"
echo "RESUMED-TO $NEXT $TASK in ${ARC:-the legacy stream}"
```

`AUTHORIZED` is legal **only** when `authorized.json` is present, valid, and its `planId` plus
`planHash` match the pointer of the **selected** namespace. Then hand the task back to a worker
under the **same selector**:

```bash
/arc-worker <LANE> --resume <TASK-ID> [--arc <ARC-ID>]
```

The worker re-verifies the claim's namespace identity and every mutex before executing. A resume
launched under the wrong `--arc` stops with nothing written (D-6); a class now held by a different
owner pair sends it `BLOCKED` again, retaining what it holds.

## 5. ABANDON

Owner-terminates a task held in any of the **six persisted states**.

**Not reachable from `UNCLAIMED`** (owner ruling, 2026-08-15). `UNCLAIMED` is the
absence of the claim directory, not a stored value — there is no `claim.json` to write
to, so there is nothing on disk to abandon. A task with no claim simply stays
unclaimed. This clarifies the model; it does not expand it.

```bash
# @op owner-abandon   (requires owner-selector)
TASK="${TASK:?task id required}"
D="$CLAIMS/$TASK"
[ -f "$D/claim.json" ] \
  || { echo "REFUSED - not-found: no claim.json at $D under the selected namespace (${ARC:-legacy}); never a fallback"; exit 1; }
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
node -e 'var fs=require("fs");var f=process.argv[1];var c=JSON.parse(fs.readFileSync(f,"utf8"));c.state="ABANDONED";c.reason=process.argv[3]||c.reason||null;c.stateHistory=(c.stateHistory||[]).concat([{state:"ABANDONED",at:process.argv[2],by:"owner"}]);fs.writeFileSync(f+".tmp",JSON.stringify(c,null,2)+"\n")' \
  "$D/claim.json" "$NOW" "${NOTE:-}"
mv -f "$D/claim.json.tmp" "$D/claim.json"
for m in "$ROOT"/mutex/*/; do                # release this owner pair's classes; RETAIN the claim
  [ -f "$m/holder.json" ] || continue
  holder_is_owner "$m/holder.json" "$TASK" "$ARC" || continue
  rm "$m/holder.json" && rmdir "$m" && echo "released $(basename "$m")"
done
echo "ABANDONED $TASK in ${ARC:-the legacy stream} - claim directory RETAINED"
```

`ABANDONED` is a durable record that the task was deliberately killed; deleting it would
make an abandoned task indistinguishable from one that never ran. Issue RELEASE later if
the task genuinely needs to become claimable again.

## 6. Owner-lane mutex ACQUIRE and RELEASE

Lane `OWNER` tasks are publishable but **not workable** — `/arc-worker` accepts only
`MAIN`, `LAB`, and `COWORK`. Without this procedure, an OWNER task's mutex classes would
never be held by anything, leaving the highest-value real-data operations unprotected.

The clearest live example: HS-2 E2 requires `RUNTIME:owner-profile`, which guards the real
browser profile and real `pt_*` data.

**Class name encoding.** `:` is not a legal NTFS filename character, so directory names
substitute `__` for it. Acquisition order is computed on the **unencoded** class string in
ASCII order, then each name is encoded:

| Canonical class | Directory |
|---|---|
| `AUTHORITY:published-plan` | `AUTHORITY__published-plan` |
| `CODE:index-html` | `CODE__index-html` |
| `CODE:netlify-functions` | `CODE__netlify-functions` |
| `DEPLOY:netlify` | `DEPLOY__netlify` |
| `EXTERNAL:live-provider` | `EXTERNAL__live-provider` |
| `QA:browser-runtime` | `QA__browser-runtime` |
| `RUNTIME:gates` | `RUNTIME__gates` |
| `RUNTIME:owner-profile` | `RUNTIME__owner-profile` |

**Classes stay global; only the holder is namespaced.** The eight classes above are never
per-ARC. Holding `CODE:index-html` for an `ARC-A` task blocks the identical class for `ARC-B` and
for the legacy stream; the holder's `arcId` says *who* holds it, never *which* class.

ACQUIRE, using the reserved holder id `__OWNER__`:

```bash
# @op owner-mutex-acquire   (requires owner-selector)
CLASS="${CLASS:?canonical class required}"
DIR="$ROOT/mutex/$(printf '%s' "$CLASS" | sed 's/:/__/g')"
mkdir "$DIR" || { echo "HELD - stop"; cat "$DIR/holder.json" 2>/dev/null; exit 1; }
if [ "$NS" = arc ]; then
  printf '{"taskId":"__OWNER__","lane":"OWNER","acquiredAt":"%s","arcId":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ARC" > "$DIR/holder.json"
else
  printf '{"taskId":"__OWNER__","lane":"OWNER","acquiredAt":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DIR/holder.json"
fi
echo "ACQUIRED $CLASS as (${ARC:-legacy}, __OWNER__)"
```

RELEASE:

```bash
# @op owner-mutex-release   (requires owner-selector)
CLASS="${CLASS:?canonical class required}"
TASK="${TASK:-__OWNER__}"
DIR="$ROOT/mutex/$(printf '%s' "$CLASS" | sed 's/:/__/g')"
[ -f "$DIR/holder.json" ] || { echo "REFUSED - not-found: $CLASS is not held"; exit 1; }
holder_is_owner "$DIR/holder.json" "$TASK" "$ARC" \
  || { echo "REFUSED - $CLASS is held by a different owner pair than (${ARC:-legacy}, $TASK); never released from here"; cat "$DIR/holder.json"; exit 1; }
rm "$DIR/holder.json" && rmdir "$DIR"
echo "RELEASED $CLASS from (${ARC:-legacy}, $TASK)"
```

`__OWNER__` and `__PUBLISH__` are reserved. Publish validation rejects any task id starting
with a double underscore, so a published task can never collide with either. The release is
pair-filtered exactly like every other release in the model: a `--legacy` invocation never frees a
holder carrying an `arcId`, and `--arc ARC-A` never frees `ARC-B`'s (D-28).

## 7. Coordination domain — owner ruling 2026-08-15 (resolves R3)

**The domain for this project consists of the main worktree plus every linked worktree
whose `git rev-parse --git-common-dir` resolves to the same main `.git`.**

`portfolio-tracker-test-lab` is a **linked worktree, not an independent clone**. Any
contract or example wording treating it as a separate coordination domain is struck.
Claims and mutexes taken from those linked worktrees are therefore **enforcing**, and all
of them share one runtime at `<git-common-dir>/arc-runtime/`.

Verify the domain membership of any worktree before trusting a claim taken from it:

```bash
cd <worktree> && git rev-parse --path-format=absolute --git-common-dir
```

**The cross-clone rule is retained as a forward-looking V1 constraint.** If a true
independent clone exists with a different git-common-dir, it is a separate coordination
domain. V1 provides no cross-domain claim or mutex coordination. Any task whose safety
depends on synchronisation across domains **must fail closed** until it is explicitly
re-routed or coordinated by owner action.

As of 2026-08-15 no independent clone of this repository exists, so that constraint is
currently forward-looking rather than active.

**Consequence for planning artifacts.** Any execution-plan reasoning that justifies a
mutex set by citing a separate coordination domain must be rewritten. Conclusions may be
kept only where they hold for the task's actual mutex requirements — never preserved by
assumption. This applies directly to the LX-2 through LX-5 rows.

## 8. Residue recovery

Residue is diagnosed by INSPECT (no selector) and repaired under a selector, in the namespace the
residue actually lives in.

| Residue | Meaning | Recovery |
|---|---|---|
| Claim directory with no `claim.json`, in `claims/` or in `arc-claims/<ARC-ID>/` | INCOMPLETE-CLAIM — the conversation died between the claim `mkdir` and the first write | Confirm no `holder.json` anywhere names this owner pair; release any that do; then `rmdir` the claim directory under its own selector |
| `COMPLETE` claim whose mutexes are still held | Crash during release. The write-then-release ordering makes this outcome deliberate | Release the **mutexes only** (section 3 step 2, pair-matched) and **retain the claim directory**; stamp `mutexesReleasedAt`. Full RELEASE is illegal from `COMPLETE` |
| `authorized.json` present while state reads `WAITING_OWNER_GO` | Crash between the two authorization writes | Re-run `/arc-authorize <TASK-ID> [--arc <ARC-ID>]`; it is repair-capable and completes the transition |
| State reads `AUTHORIZED` with no `authorized.json` | Forgery or corruption. A worker must never produce this | **Stop.** Investigate before any recovery — this is the one residue implying the authorization boundary was crossed |
| `claim.json` whose `arcId` is not its directory (or a `claims/` record carrying one) | CLAIM-ARCID-MISMATCH. Every worker in that namespace goes IDLE until it is resolved | **Stop.** The record's identity is not trustworthy; decide by hand whether the directory or the record is right, and record the ruling. Never "fix" it by copying the directory name in |
| `arc-claims/<ARC-ID>/` container with no ARC pointer | The publisher created the container and the publication did not complete, or the ARC was retired | Leave it. An empty container is inert; a worker reports `arc-not-published` or `arc-retired` and writes nothing |
| `plans/arcs/<ARC-ID>/` holding both `current.json` and `retired-*.json` | A RETIRE was followed by a fresh publication. Legal | Nothing to do — the retired pointer is history, `current.json` is authority |
| `plans/.staging-<id>/` directory | A publish was interrupted before the rename | `current.json` never pointed at it. Delete the staging directory |
| Mutex directory with no `holder.json` | Crash between `mkdir` and the holder write | Confirm no live claim in **any** namespace declares the class, then `rmdir` |

## 9. Cross-plan claims

A claim whose `planId` differs from the pointer of **its own namespace** is refused by every worker
and by `/arc-authorize`. Publishing a new plan never rewrites live claims — silently retargeting
one would be stale-claim stealing under a different name. Comparison is always against
`plans/current.json` for a legacy claim and `plans/arcs/<ARC-ID>/current.json` for an ARC claim;
the two are never compared to each other.

Two resolutions, both owner acts, both under a selector:

1. **ABANDON then RELEASE** — the safe default. The task is re-claimed fresh against the
   current plan of that namespace.
2. **Re-pin** — rewrite the claim's `planId` and `planHash` to the current values. Legitimate
   **only** when the task's row is byte-identical in both plans: same `id`, `lane`,
   `entryMode`, `requiresOwnerGo`, `mutexes`, `dependsOn`, and `closeCondition`. Diff the two
   rows before doing this, and record the comparison in CHECKPOINT. A re-pin never changes
   `arcId`: moving a claim between namespaces is not a repair, it is a different claim.

## 10. Legal transitions

```
UNCLAIMED --mkdir, requiresOwnerGo=false--> CLAIMED
UNCLAIMED --mkdir, requiresOwnerGo=true --> WAITING_OWNER_GO

WAITING_OWNER_GO ------[OWNER ONLY]-------> AUTHORIZED

CLAIMED | AUTHORIZED ---------------------> BLOCKED      (worker or owner)
CLAIMED | AUTHORIZED ---------------------> COMPLETE     (worker)

<any of the 6 persisted states> --[OWNER]--> ABANDONED

BLOCKED -------------[OWNER ONLY]---------> CLAIMED | AUTHORIZED    (RESUME)
BLOCKED | ABANDONED -------------[OWNER]--> UNCLAIMED               (RELEASE)
```

Anything not listed is illegal and fails closed to `BLOCKED`.

`COMPLETE` is **terminal-durable** (owner ruling 2026-08-20, R-M): its only outgoing transition is
the owner-only `COMPLETE -> ABANDONED`. It is deliberately **not** a RELEASE source — see
section 3.

`AUTHORIZED` and `ABANDONED` are writable only through an owner-invoked path. A worker may
never write either one, under any condition.

The transition table is **per claim identity** `(arcId ?? null, taskId)`. `ARC-A/TASK-10` reaching
`COMPLETE` says nothing about `ARC-B/TASK-10` or about the legacy `TASK-10`.

## 11. RETIRE POINTER — end an ARC's execution phase

RETIRE ends an ARC's ability to be worked, **without destroying anything**. It renames the ARC's
current pointer:

```
plans/arcs/<ARC-ID>/current.json  ->  plans/arcs/<ARC-ID>/retired-<planId>.json
```

**The pointer is never deleted.** Deletion would make a retired ARC indistinguishable from one that
was never published, and the worker catalogue would lose a row: `arc-retired` and
`arc-not-published` are discriminated purely by whether a `retired-*.json` sibling survives
(`claim-protocol.md` section 0). Retention also keeps the snapshot reachable by hand for audit.

**Precondition: no live claim in that ARC namespace.** Live means anything that is not a retained
terminal record — `CLAIMED`, `WAITING_OWNER_GO`, `AUTHORIZED` **and `BLOCKED`**. `BLOCKED` counts
as live deliberately: it retains mutexes and its legal futures are RESUME, RELEASE and ABANDON, and
a RESUME needs the current pointer to verify `planId` / `planHash`. Retiring under it would strand a
resumable task. `COMPLETE` and `ABANDONED` are retained records and are **allowed** — they are the
ARC's ledger and are exactly what should survive retirement. An INCOMPLETE-CLAIM directory refuses
too: its state cannot be read, so it fails closed (clean it with section 8 first).

**RETIRE is ARC-only in this contract.** `--legacy` is refused: the legacy stream has one
singleton pointer that the publisher replaces in place, and there is no V1 operation that ends it.

```bash
# @op owner-retire   (requires owner-selector; ARC only)
[ "$NS" = arc ] \
  || { echo "REFUSED - RETIRE is an ARC operation; --legacy has no pointer to retire in V1"; exit 1; }
[ -f "$PTR" ] \
  || { echo "REFUSED - not-found: no current pointer at plans/arcs/$ARC/current.json (already retired, or never published)"; exit 1; }

# One pass over the ARC claim root: anything that is not a retained COMPLETE or ABANDONED is live.
LIVE=$(node -e 'var fs=require("fs"),path=require("path");var claims=process.argv[1];var out=[];var dirs;try{dirs=fs.readdirSync(claims).sort()}catch(e){dirs=[]}dirs.forEach(function(t){var f=path.join(claims,t,"claim.json");if(!fs.existsSync(f)){out.push(t+"(INCOMPLETE-CLAIM)");return}var c;try{c=JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){out.push(t+"(UNPARSEABLE)");return}if(c.state!=="COMPLETE"&&c.state!=="ABANDONED")out.push(t+"("+c.state+")")});process.stdout.write(out.join(" "))' \
  "$CLAIMS")
[ -z "$LIVE" ] \
  || { echo "REFUSED - live claims remain in arc-claims/$ARC/: $LIVE - resolve each (RESUME, RELEASE or ABANDON) before retiring"; exit 1; }

PLAN_ID=$(json_get "$PTR" planId)
mv "$PTR" "$ROOT/plans/arcs/$ARC/retired-$PLAN_ID.json"
echo "RETIRED $ARC - plans/arcs/$ARC/current.json -> retired-$PLAN_ID.json"
echo "  snapshot plans/$PLAN_ID/, the arc-claims/$ARC/ container and every retained claim are untouched"
```

After RETIRE, `/arc-worker <LANE> --arc <ARC-ID>` reports `arc-retired` and writes nothing, and
`/arc-authorize --arc <ARC-ID>` refuses for the same reason. Re-publishing the ARC writes a fresh
`current.json` beside the retired file and the ARC is workable again; retiring twice is refused,
because the second invocation finds no current pointer.

Record the retirement in CHECKPOINT together with the final `/arc-registry status` for that ARC.
