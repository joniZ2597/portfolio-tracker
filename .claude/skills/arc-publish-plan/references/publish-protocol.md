# Publish Protocol — literal command sequence

Binding reference for `/arc-publish-plan`. Commands are Git Bash. Run them as written;
the ordering carries the atomicity guarantee.

Every executable block is tagged `# @op <name>` on its first line. `qa/arc_multi_arc_offline.js`
extracts the tagged blocks and **executes them in publish order with Git Bash** against temp git
repositories and temp runtime roots (D-31) — the QA proves the real sequence, never a mirror of it.
The only thing the QA re-points after the prelude is the four path variables `SCRATCH`, `RESOLVER`,
`LIB` and `IDENT` (to the checked-out scripts); every command runs verbatim.

```bash
# @op publish-prelude
COMMON="$(git rev-parse --path-format=absolute --git-common-dir)"   # absolute form is mandatory (Git >= 2.31)
case "$COMMON" in
  /*|[A-Za-z]:/*) : ;;
  *) echo "REFUSED - git-common-dir did not resolve to an absolute path: $COMMON"; exit 1 ;;
esac
ROOT="$COMMON/arc-runtime"
REPO="$(dirname "$COMMON")"
SCRATCH="$(mktemp -d -t arc-publish-XXXXXX)"     # outside the repo and the runtime; resolver output only
RESOLVER="$REPO/.claude/skills/arc-publish-plan/scripts/resolve-profiles.js"
LIB="$REPO/.claude/skills/arc-publish-plan/scripts/lib/profile-contract.js"      # post-CONFIRM checks (step 7)
IDENT="$REPO/.claude/skills/arc-publish-plan/scripts/lib/runtime-identity.js"    # ARC literal + three-way arcId identity (steps N, 10)
PUBLISH_HELD=0      # becomes 1 only when step 4 has written the holder; --dry-run never sets it
release_if_held() { if [ "$PUBLISH_HELD" = 1 ]; then rm "$M/holder.json" && rmdir "$M"; PUBLISH_HELD=0; fi; }
```

`REPO` is derived from the **absolute** common git dir, never from `--show-toplevel` and never
from the plain `--git-common-dir` output: without `--path-format=absolute` Git prints a
relative `.git`, `dirname` would yield `.`, and the assertion below would be meaningless;
from a linked worktree `--show-toplevel` names that worktree, and a publication staged from
there would pin the wrong tree (C-18).

## Arguments — bound by the skill from the typed invocation

```bash
# @op publish-args   (every value is a literal typed by the owner; nothing here is inferred)
SRC="${SRC:?source path required (P-V12)}"        # <source-path>, repo-relative
ARC="${ARC:-}"                                     # --arc <ARC-ID> literal, or empty for the legacy stream
PLAN_ID="${PLAN_ID:?plan id required (--plan-id or the skill default)}"
ACK_STALE="${ACK_STALE:-0}"; ACK_LIVE="${ACK_LIVE:-0}"; ACK_REF="${ACK_REF:-0}"; ACK_STALE_PROMO="${ACK_STALE_PROMO:-0}"
PUBLISHED_BY="${PUBLISHED_BY:-owner}"
ACK_LIVE_FLAG=""; [ "$ACK_LIVE" = 1 ] && ACK_LIVE_FLAG="--acknowledge-live-claims"
ACK_STALE_PROMO_FLAG=""; [ "$ACK_STALE_PROMO" = 1 ] && ACK_STALE_PROMO_FLAG="--acknowledge-stale-promotion"
```

`ARC` is the `--arc` literal **exactly as typed** — never trimmed, case-folded, or derived from a
task-id prefix, a filename, a slug or a `- Arc:` header. Empty means the legacy stream.

## Namespace selection — one pointer, one claims root, never the other

```bash
# @op publish-namespace   (runs before the mutex; reads nothing; the ARC literal is judged by runtime-identity.js)
case "$ARC" in
  "")           PTR="$ROOT/plans/current.json";           CLAIMS="$ROOT/claims" ;;
  CORE-STREAM)  echo "P-V16 REFUSED - --arc CORE-STREAM is the registry index entry for the legacy stream, never a runtime arcId; use the no-flag invocation"; exit 1 ;;
  *)            node -e 'process.exit(require(process.argv[1]).isValidArcId(process.argv[2]) ? 0 : 1)' "$IDENT" "$ARC" \
                  || { echo "P-V16 REFUSED - --arc \"$ARC\" is not a valid ARC id (case-exact, never normalized)"; exit 1; }
                PTR="$ROOT/plans/arcs/$ARC/current.json"; CLAIMS="$ROOT/arc-claims/$ARC" ;;
esac
PTR_TMP="$PTR.tmp"
```

`PTR` and `CLAIMS` are the **only** pointer and claim root this invocation touches (K15, X-2). A
no-flag publish never reads `arc-claims/` or `plans/arcs/`; an `--arc` publish never reads
`claims/` or `plans/current.json`. `CORE-STREAM` is the registry's grandfathered *index entry* for
the legacy stream and is refused as a runtime selector (registry-contract.md section 2).

## Step 0 — Assert the main worktree

```bash
# @op step0-main-worktree
[ "$(git rev-parse --show-toplevel)" = "$REPO" ] \
  || { echo "REFUSED - not the main worktree: $(git rev-parse --show-toplevel) != $REPO"; exit 1; }
```

Runs before anything else and before the mutex. Publication is a main-worktree act.

## Step 1 — Resolve the root

```bash
# @op step1-root
[ -d "$ROOT/plans" ] && [ -d "$ROOT/claims" ] && [ -d "$ROOT/mutex" ] \
  || { echo "REFUSED - runtime root absent or incomplete"; exit 1; }
if [ -n "$ARC" ]; then
  [ -d "$ROOT/plans/arcs" ] && [ -d "$ROOT/arc-claims" ] \
    || { echo "REFUSED - ARC roots absent (plans/arcs/ and/or arc-claims/): owner bootstrap per bootstrap.md section 4a; the publisher never creates them"; exit 1; }
fi
```

A missing root is a **refusal**, never an invitation to bootstrap. Creation is a separate,
explicit, one-time owner step documented in `bootstrap.md`. Root completeness stays exactly
`plans/` + `claims/` + `mutex/`; the ARC roots `plans/arcs/` and `arc-claims/` are an additional
precondition of an `--arc` publication only (section 4a of `bootstrap.md`) — the publisher creates
neither of them, ever. It creates only the per-ARC container `arc-claims/<ARC-ID>/` (step 9b) and
the per-ARC pointer directory `plans/arcs/<ARC-ID>/` (step 10), both idempotently.

## Step 2 — Validate the source path (P-V12)

```bash
# @op step2-source-path
case "$SRC" in
  /*|\\*|[A-Za-z]:*|*..*) echo "P-V12 REFUSED - $SRC"; exit 1 ;;
  .ai-reports/*.md) : ;;
  *) echo "P-V12 REFUSED - $SRC"; exit 1 ;;
esac
[ -f "$REPO/$SRC" ] || { echo "P-V12 REFUSED - no such file: $SRC"; exit 1; }
```

## Step 3 — Stale-source check (P-V14)

```bash
# @op step3-stale-source
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
# @op step4-mutex
M="$ROOT/mutex/AUTHORITY__published-plan"
mkdir "$M" || { echo "REFUSED - publish already in flight"; cat "$M/holder.json"; exit 1; }
if [ -n "$ARC" ]; then
  printf '{"taskId":"__PUBLISH__","lane":"OWNER","acquiredAt":"%s","arcId":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ARC" > "$M/holder.json"
else
  printf '{"taskId":"__PUBLISH__","lane":"OWNER","acquiredAt":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$M/holder.json"
fi
PUBLISH_HELD=1
```

Plain `mkdir`, **never `-p`**. `EEXIST` is the "already held" answer, not an error to retry.
The class is global; the holder is disambiguated by `arcId` (K14): `__PUBLISH__` carries the
ARC literal when publishing for an ARC and no `arcId` for the legacy stream (`holder.schema.json`).

**Every exit path from here on must release this mutex.** A refusal that leaves it held
deadlocks all future publication.

## Step 5 — Derive the projection, RESOLVE profiles, and require CONFIRM

Parse the source into a proposed `plan.json` — every task row carries its `executionProfile`
id; the proposed plan carries **no** `executionProfiles` and **no** `arcId` (the resolver declares
`arcId` from the `--arc` literal, P-V16). Write it to scratch and run the resolver; it validates
P-V1 … P-V9, P-V15, P-V16 and P-V21 … P-V26 — and, with `--arc`, P-V17 / P-V19 / P-V20 against the
registry and the selected ARC namespace — embeds the referenced profiles, and writes the canonical
snapshot bytes:

```bash
# @op step5-resolve
# ... write "$SCRATCH/proposed.json" from the parsed source (no arcId; the resolver declares it from --arc) ...
ARC_ARGS=()
[ -n "$ARC" ] && ARC_ARGS=(--arc "$ARC" --registry-root "$REPO/.ai-reports/arcs" $ACK_STALE_PROMO_FLAG)
node "$RESOLVER" --in "$SCRATCH/proposed.json" --out "$SCRATCH/plan.json" \
     --source "$REPO/$SRC" --runtime-root "$ROOT" $ACK_LIVE_FLAG "${ARC_ARGS[@]}" | tee "$SCRATCH/resolve.txt"
RC=${PIPESTATUS[0]}
case "$RC" in
  0) : ;;
  2) echo "REFUSED - resolver refused (see $SCRATCH/resolve.txt)"; release_if_held; exit 1 ;;
  *) echo "REFUSED - resolver error (exit $RC)";                    release_if_held; exit 1 ;;
esac
PROJECTION_HASH=$(sha256sum "$SCRATCH/plan.json" | cut -d' ' -f1)
```

`$ACK_LIVE_FLAG` is `--acknowledge-live-claims` when the owner passed it, else empty;
`$ACK_STALE_PROMO_FLAG` is `--acknowledge-stale-promotion` (P-V17 READY decay) likewise. The
resolver writes only `$SCRATCH/plan.json` — never under `$ROOT`, never under `.ai-reports/arcs/` —
and takes no mutex; its `--runtime-root` / `--registry-root` checks (P-V11 existence, P-V13 scan,
P-V17, P-V19, P-V20) are read-only. Under `--dry-run` this step runs without step 4:
`PUBLISH_HELD` stays `0`, so a resolver refusal or error exits without referencing or releasing the
mutex directory at all. In a real publish `PUBLISH_HELD` is `1` and `release_if_held` releases
`AUTHORITY:published-plan` on both failure paths.

Render the projection with `templates/plan-projection.md` and print it **in full** — every
field of every task, each annotated with the source section it came from, the `ARC` line
(arc id, registry entry, pointer, claims root — or `none - legacy stream`), the PROFILES section
and per-task ladder lines from `$SCRATCH/resolve.txt`, the `RESOLVER` line, and
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

## Step 6 — Validate (P-V1 … P-V11, P-V15 … P-V17, P-V19 … P-V26)

Record the resolver's results for P-V1 … P-V9, P-V15, P-V16, P-V21 … P-V26 and (with `--arc`)
P-V17 / P-V19 / P-V20, computed at step 5 before `CONFIRM`; settle P-V10 here:

```bash
# @op step6-repo-ref
HEAD_SHA=$(git rev-parse HEAD)
PLAN_REF=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).repoRef)' "$SCRATCH/plan.json")
if [ "$PLAN_REF" != "$HEAD_SHA" ] && [ "$ACK_REF" != 1 ]; then
  echo "P-V10 REFUSED - plan repoRef $PLAN_REF does not match HEAD $HEAD_SHA"; release_if_held; exit 1
fi
```

On any failure: release the mutex, report the rule id and the offending value, write nothing.

## Step 7 — Post-CONFIRM runtime and registry checks (P-V11, P-V13, P-V17, P-V19, P-V20)

```bash
# @op step7-post-confirm   (authoritative re-run of the read-only checks through the committed library; never a second implementation)
OUTGOING=""
[ -f "$PTR" ] && OUTGOING=$(node -e 'const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8").replace(/\r/g, "")); process.stdout.write(typeof j.planId === "string" ? j.planId : "")' "$PTR")
CARRIED_JSON=$(node -e '
const lib = require(process.argv[1]); const fs = require("fs");
const [, root, planFile, arc, ackLive, registry, source, ackStale, now] = process.argv.slice(1);
const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
const rt = lib.runtimeChecks(root, plan, { arcId: arc || undefined, acknowledgeLiveClaims: ackLive === "1" });
let v = rt.violations.slice();
if (arc) v = v.concat(lib.registryChecks(registry, plan, { arcId: arc, runtimeRoot: root, sourceBytes: fs.readFileSync(source), nowIso: now, acknowledgeStalePromotion: ackStale === "1" }).violations);
if (v.length) { v.forEach((x) => console.error(x.message)); process.exit(2); }
process.stdout.write(JSON.stringify(rt.liveClaims.map((c) => ({ taskId: c.taskId, planId: c.planId, state: c.state }))));
' "$LIB" "$ROOT" "$SCRATCH/plan.json" "$ARC" "$ACK_LIVE" "$REPO/.ai-reports/arcs" "$REPO/$SRC" "$ACK_STALE_PROMO" "$(date -u +%Y-%m-%dT%H:%M:%SZ)") \
  || { echo "REFUSED - post-CONFIRM runtime / registry checks failed (P-V11 / P-V13 / P-V17 / P-V19 / P-V20 above)"; release_if_held; exit 1; }
```

`$OUTGOING` is the `planId` named by **this invocation's** pointer (`$PTR`) — the legacy pointer
for a no-flag publish, `plans/arcs/<ARC-ID>/current.json` for an ARC — and becomes
`supersedesPlanId`. The live-claim scan (P-V13) reads **only `$CLAIMS`**; a live claim against the
outgoing plan refuses unless `--acknowledge-live-claims` was passed, in which case each is carried
into `carriedOverClaims[]` for audit. **Never modify a `claim.json`.** For an ARC the same call
re-settles P-V19 (every `arc-claims/<ARC-ID>/*/claim.json` parses and matches its path identity)
and P-V17 / P-V20 against the registry.

## Step 8 — Stage the snapshot

```bash
# @op step8-stage
STAGE="$ROOT/plans/.staging-$PLAN_ID"
[ -e "$ROOT/plans/$PLAN_ID" ] && { echo "P-V11 REFUSED - snapshot exists"; release_if_held; exit 1; }
[ -e "$STAGE" ] && { echo "P-V11 REFUSED - staging dir exists from an interrupted run"; release_if_held; exit 1; }
mkdir "$STAGE"

# stage the CONFIRMED bytes verbatim, then hash exactly the bytes written
cp "$REPO/$SRC" "$STAGE/source.md"
cp "$SCRATCH/plan.json" "$STAGE/plan.json"
PLAN_HASH=$(sha256sum "$STAGE/plan.json" | cut -d' ' -f1)
[ "$PLAN_HASH" = "$PROJECTION_HASH" ] \
  || { echo "REFUSED - staged plan.json ($PLAN_HASH) differs from the confirmed projection ($PROJECTION_HASH)"; release_if_held; exit 1; }
SRC_HASH=$(sha256sum  "$STAGE/source.md" | cut -d' ' -f1)
PUBLISHED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# manifest.json = the current.schema field set; an ARC publication carries the --arc literal as arcId (last field)
node -e '
const fs = require("fs");
const [out, planId, planHash, source, sourceHash, ref, publishedAt, publishedBy, supersedes, stale, refMis, carried, arc] = process.argv.slice(1);
const m = { planId, planHash, source, sourceHash, ref, publishedAt, publishedBy, supersedesPlanId: supersedes || null,
            staleSourceAcknowledged: stale === "1", refMismatchAcknowledged: refMis === "1", carriedOverClaims: JSON.parse(carried) };
if (arc) m.arcId = arc;
fs.writeFileSync(out, JSON.stringify(m, null, 2) + "\n", { flag: "wx" });
' "$STAGE/manifest.json" "$PLAN_ID" "$PLAN_HASH" "$SRC" "$SRC_HASH" "$HEAD_SHA" "$PUBLISHED_AT" "$PUBLISHED_BY" "$OUTGOING" "$ACK_STALE" "$ACK_REF" "$CARRIED_JSON" "$ARC" \
  || { echo "REFUSED - cannot write manifest.json"; release_if_held; exit 1; }
```

`planHash` is the SHA-256 of `plan.json` **as written**, and it must equal the
`projectionHash` the owner confirmed at step 5 — the snapshot is the resolver's bytes copied,
never re-serialized. Hash the file, never an in-memory serialization — a re-serialization can
differ by whitespace and every worker re-verifies this value. A mismatch refuses, releases
the mutex, and leaves `plans/.staging-<id>/` for owner disposition (crash table).

`manifest.json` reuses the `current.json` field set verbatim (`current.schema.json`); for an ARC
publication its `arcId` is the literal — the first of the three files that must agree (K9).

If `sha256sum` is unavailable, the documented fallback is
`certutil -hashfile <file> SHA256` via PowerShell.

## Step 9 — Rename staging into place

```bash
# @op step9-rename
mv "$STAGE" "$ROOT/plans/$PLAN_ID"
```

Atomic directory rename. The target cannot exist — P-V11 and step 8 both checked it — so
this is a create, never a replace.

## Step 9b — Ensure the per-ARC claim container (ARC only)

```bash
# @op step9b-container   (the one non-lock mkdir; idempotent; EEXIST on an existing DIRECTORY is the only ignored failure)
CONTAINER="n/a (legacy stream)"
if [ -n "$ARC" ]; then
  if mkdir "$ROOT/arc-claims/$ARC" 2>"$SCRATCH/mkdir.err"; then
    CONTAINER="created arc-claims/$ARC/"
  elif [ -d "$ROOT/arc-claims/$ARC" ]; then
    CONTAINER="already present arc-claims/$ARC/"
  else
    echo "REFUSED - cannot create arc-claims/$ARC/: $(cat "$SCRATCH/mkdir.err")"; release_if_held; exit 1
  fi
fi
```

Plain `mkdir` on exactly `arc-claims/<ARC-ID>/` (D-24). The root `arc-claims/` is never created
here — step 1 refused if it was absent. `EEXIST` is ignored **only** when the path is already a
directory (the republish case); any other failure — a file in the way, a permission error, a
vanished root — is a real refusal with the mutex released. No blanket error suppression. Ordering:
after step 9 and before step 10, so a refusal here leaves the snapshot unreferenced (crash table)
and a never-published arc never gains a container from a step-5/7/8 refusal.

## Step 10 — Assert the three-way arcId identity, then swap the pointer

```bash
# @op step10-pointer
if [ -n "$ARC" ]; then
  if ! mkdir "$ROOT/plans/arcs/$ARC" 2>"$SCRATCH/mkdir.err" && [ ! -d "$ROOT/plans/arcs/$ARC" ]; then
    echo "REFUSED - cannot create plans/arcs/$ARC/: $(cat "$SCRATCH/mkdir.err")"; release_if_held; exit 1
  fi
fi
cp "$ROOT/plans/$PLAN_ID/manifest.json" "$PTR_TMP"
node -e '
const id = require(process.argv[1]); const fs = require("fs");
const rd = (f) => JSON.parse(fs.readFileSync(f, "utf8").replace(/\r/g, ""));
const [, plan, manifest, current, arc] = process.argv.slice(1);
const r = id.arcIdTriple({ plan: rd(plan), manifest: rd(manifest), current: rd(current) }, arc || undefined);
console.log("arcIdTriple " + r.verdict + (arc ? " " + (r.arcId || "") : " (legacy)") + (r.reasons.length ? " - " + r.reasons.join("; ") : ""));
process.exit(r.verdict === (arc ? "ARC" : "LEGACY") ? 0 : 1);
' "$IDENT" "$ROOT/plans/$PLAN_ID/plan.json" "$ROOT/plans/$PLAN_ID/manifest.json" "$PTR_TMP" "$ARC" \
  || { echo "REFUSED - three-way arcId identity (plan.json / manifest.json / current.json) failed; pointer not swapped"; rm "$PTR_TMP"; release_if_held; exit 1; }
mv -f "$PTR_TMP" "$PTR"
```

The pointer file is the manifest, verbatim. Before the swap the committed helper
`runtime-identity.js arcIdTriple({ plan, manifest, current }, "<ARC-ID>")` must return `ARC` for an
ARC publication (all three carry the literal) or `LEGACY` for a no-flag publication (none carries
an `arcId`); anything else refuses with the temp file removed, the mutex released and the snapshot
left unreferenced. The rules are never re-implemented in this protocol.

`mv -f` over an existing file is an atomic replace. **Never** delete the old pointer first —
that opens a window in which no active plan exists and every worker resolves to IDLE. The
per-ARC pointer directory `plans/arcs/<ARC-ID>/` is created idempotently here (same EEXIST rule as
step 9b); the root `plans/arcs/` never is.

This is the commit point. Before step 10 the previous plan is still active; after it, the
new one is. There is no intermediate state.

## Step 10b — Registry write-back (ARC only, after the commit point)

```bash
# @op step10b-writeback   (K10: after step 10 only; json-safe-edit = parse -> modify -> serialize -> temp -> rename; the publisher writes execution{} + state EXECUTING + one history entry, nothing else)
WRITEBACK="n/a (legacy stream)"
if [ -n "$ARC" ]; then
  WRITEBACK_NOTE="published $PLAN_ID from $SRC (planHash $PLAN_HASH)"
  [ "$ACK_STALE_PROMO" = 1 ] && WRITEBACK_NOTE="$WRITEBACK_NOTE; --acknowledge-stale-promotion: READY decay (promotion.rulingAt older than 7 days) acknowledged by the owner at publish"
  if node -e '
const fs = require("fs");
const [file, arc, planId, planHash, at, note] = process.argv.slice(1);
const a = JSON.parse(fs.readFileSync(file, "utf8").replace(/\r/g, ""));
if (a.arcId !== arc) throw new Error("registry arcId " + a.arcId + " != " + arc);
if (a.state !== "READY" && a.state !== "EXECUTING") throw new Error("registry state " + a.state + " admits no publication");
a.state = "EXECUTING";
a.execution = { planId, planHash, pointer: "plans/arcs/" + arc + "/current.json", claimsRoot: "arc-claims/" + arc + "/", publishedAt: at };
a.history.push({ state: "EXECUTING", at, by: "publisher", note });
fs.writeFileSync(file + ".tmp", JSON.stringify(a, null, 2) + "\n", { flag: "wx" });
fs.renameSync(file + ".tmp", file);
' "$REPO/.ai-reports/arcs/$ARC/arc.json" "$ARC" "$PLAN_ID" "$PLAN_HASH" "$PUBLISHED_AT" "$WRITEBACK_NOTE" 2>"$SCRATCH/writeback.err"; then
    WRITEBACK="OK - .ai-reports/arcs/$ARC/arc.json state EXECUTING, execution.planId $PLAN_ID"
  else
    WRITEBACK="DRIFT - registry write-back failed ($(tail -n 1 "$SCRATCH/writeback.err")); runtime pointer NOT rolled back; owner repair per registry-contract.md section 9 (DRIFT)"
    echo "$WRITEBACK"
  fi
fi
```

The publisher is the sole machine writer of `execution{}` and of the state `EXECUTING`
(registry-contract.md section 5); it appends exactly one `history` entry `{EXECUTING, publisher,
note}` and touches no other field — `promotion`, `implementationAllowed`, `planning` stay as the
owner and the planning lane wrote them. The `--acknowledge-stale-promotion` override is durably
recorded in that history note (the manifest field set is fixed by `current.schema.json`, which
carries no slot for it). **If the write-back fails, the runtime pointer is never rolled back**:
the publication stands, the report prints `DRIFT`, and the status view flags the divergence for
owner repair. Nothing is retried.

## Step 11 — Release and report

```bash
# @op step11-release
release_if_held
```

Then emit the report using `templates/publish-report.md` — including the `arc` line (plan.json ·
manifest.json · current.json), `claims root`, the step-9b `CONTAINER` result and the `WRITEBACK`
result.

## `--dry-run` — every check, no write, no mutex

```bash
# @op dryrun-resolve   (steps 0-3 as written, then step 5 WITHOUT step 4: PUBLISH_HELD stays 0, nothing under $ROOT or $REPO is touched)
HEAD_SHA=$(git rev-parse HEAD)        # P-V10, read-only: compare with the proposed repoRef in the projection
OUTGOING=""
[ -f "$PTR" ] && OUTGOING=$(node -e 'const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8").replace(/\r/g, "")); process.stdout.write(typeof j.planId === "string" ? j.planId : "")' "$PTR")
ARC_ARGS=()
[ -n "$ARC" ] && ARC_ARGS=(--arc "$ARC" --registry-root "$REPO/.ai-reports/arcs" $ACK_STALE_PROMO_FLAG)
node "$RESOLVER" --in "$SCRATCH/proposed.json" --out "$SCRATCH/plan.json" \
     --source "$REPO/$SRC" --runtime-root "$ROOT" $ACK_LIVE_FLAG "${ARC_ARGS[@]}" | tee "$SCRATCH/resolve.txt"
RC=${PIPESTATUS[0]}
[ "$RC" = 0 ] || { echo "DRY RUN - resolver exit $RC (see $SCRATCH/resolve.txt); nothing written, no mutex taken"; exit 1; }
echo "DRY RUN - nothing written, no mutex taken, no CONFIRM accepted. ${PTR#$ROOT/} still points at ${OUTGOING:-nothing}."
```

Not performed: step 4 (no `AUTHORITY:published-plan` holder), the `CONFIRM` prompt, steps
6–11. Nothing under `$ROOT`, `$REPO` or `.ai-reports/arcs/` is created or modified — the tree
hashes of the runtime root and of the registry are identical before and after, and `mutex/` is
untouched. The scratch output is the only artifact. A dry run is evidence of machine validity
(PR-2), never a publication.

## Crash recovery

| Crash point | State | Recovery |
|---|---|---|
| Before step 9 | `plans/.staging-<id>/` orphan; pointer unchanged | Owner deletes the staging directory |
| Step 8 `projectionHash` mismatch | `plans/.staging-<id>/` left in place; mutex released; pointer unchanged | Owner deletes the staging directory, then re-runs the publish |
| Between 9 and 10 (incl. a step-9b or step-10 identity refusal) | New snapshot exists but is unreferenced; previous plan still active; for an ARC the empty container `arc-claims/<ARC-ID>/` may exist (inert; listed by INSPECT) | Owner deletes the snapshot directory, or re-runs step 10 deliberately |
| After step 10, step 10b failed | Published; registry not updated (`DRIFT`) | Owner repairs `arc.json` per registry-contract.md section 9; the pointer is never rolled back |
| After step 10b | Published and indexed | None needed |
| Any point | `AUTHORITY__published-plan` still held | Owner releases it per `owner-ops.md` section 6 |

A snapshot directory that exists without being named by a pointer is inert. Workers
resolve the active plan only through their namespace's pointer, never by scanning `plans/`.

## Never

- Publish without an explicit typed `CONFIRM`
- Infer a mandatory field that the source does not state
- Infer `arcId` from a task-id prefix, a filename, a slug or a `- Arc:` header — only the typed `--arc` literal
- Write, edit, or delete any `claim.json`, `holder.json`, or `authorized.json`
- Edit the source artifact
- Reuse or overwrite an existing `planId` or staging directory
- Create the runtime root, `plans/arcs/` or `arc-claims/` (owner bootstrap only)
- Read the other namespace: `claims/` / `plans/current.json` on an `--arc` publish, `arc-claims/` / `plans/arcs/` on a no-flag publish
- Roll the pointer back after a failed registry write-back (report `DRIFT` instead)
- Leave the authority mutex held on a refusal path
- Treat a P-V14 pass as evidence the plan is reconciled
- Run the resolver with `--out` under `$ROOT`, or stage any bytes other than the confirmed `$SCRATCH/plan.json`
- Author `executionProfiles` or `arcId` in a source or proposed plan (P-V21 / P-V16 refuse it)
