---
name: arc-registry
description: Owner-invoked, read-only status view of the ARC registry (.ai-reports/arcs/<ARC-ID>/arc.json) joined with the live runtime (legacy pointer, per-ARC pointers, legacy claims, ARC claims, mutex holders). Renders one report with the eight status flags. Increment 1 is status-only - it never writes a registry entry, never promotes, never publishes, never claims, never authorizes, never touches the runtime.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash
---

# ARC Registry — status view (Increment 1)

> **STANDING BEHAVIOR — READ-ONLY, ADVISORY ONLY, NON-AUTHORIZING.**
> This skill only *reads* the registry and the runtime and *returns one report in the
> conversation*. It NEVER writes, edits or creates any `arc.json`, any file under the
> runtime root, any handoff or `CHECKPOINT.md`. It NEVER promotes an arc, NEVER publishes,
> NEVER claims, NEVER authorizes, NEVER releases or acquires a mutex, and NEVER retires a
> pointer. It NEVER treats its own flags as authority: every flag is information for an owner
> ruling, `CHECKPOINT.md` remains the project-state record, and the published snapshot remains
> the only execution authority. **Producing this report is not an approval.**

Owner-invoked only (`/arc-registry status`). Not model-invocable. Contract:
`references/registry-contract.md` (binding). Render shape: `templates/status-report.md`.

## Invocation

    /arc-registry status [--arc <ARC-ID>]

`status` is the only verb in Increment 1 (D-5). `--arc <ARC-ID>` is a **display filter** over
registry `arcId` values (`^[A-Z0-9]([A-Z0-9-]*[A-Z0-9])?$`, case-exact) — it is never routing and
never a selector for any mutation. It is a different identity space from the auditor's
`/arc-progress-auditor --arc <name>`, which filters slug-attributed handoffs
(`registry-contract.md` section 8). Any other verb (`register`, `promote`, `set-state`, `close`,
…) does not exist yet: refuse and point at the contract's hand procedures.

## 1. Resolve the roots

```bash
# @op registry-root  (read-only; the house idiom - see registry-contract.md section 1)
ARCS="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/.ai-reports/arcs"
ROOT="$(git rev-parse --path-format=absolute --git-common-dir)/arc-runtime"
MAIN_WT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
[ -d "$ARCS" ] || { echo "registry not bootstrapped - $ARCS absent (informational; nothing to render)"; exit 0; }
[ -d "$ROOT/plans" ] && [ -d "$ROOT/claims" ] && [ -d "$ROOT/mutex" ] || echo "runtime root incomplete - registry rendered without the runtime join"
```

`--path-format=absolute` requires Git >= 2.31 (present: 2.53). The same command resolves to the
**main** worktree from every linked worktree; an `arc.json` found under a *linked* worktree's
`.ai-reports/arcs/` is `STRAY-REGISTRY`. A registry root that does not exist is an informational
line, never a stop. `plans/arcs/` and `arc-claims/` absent is the pre-bootstrap state of the
runtime (P-E), also informational.

## 2. Enumerate (read-only)

```bash
# @op status-enumerate  (read-only: cat / grep / basename only)
for a in "$ARCS"/*/; do                                   # registry entries
  id=$(basename "$a")
  [ -f "$a/arc.json" ] || { echo "$id  NO arc.json"; continue; }
  printf '%s  ' "$id"; grep -o '"state"[[:space:]]*:[[:space:]]*"[A-Z]*"' "$a/arc.json"
done
[ -f "$ROOT/plans/current.json" ] && cat "$ROOT/plans/current.json"          # legacy pointer (no arcId - correct)
for p in "$ROOT"/plans/arcs/*/current.json; do [ -f "$p" ] && { echo "$p"; cat "$p"; }; done   # per-ARC pointers
for c in "$ROOT"/claims/*/; do                            # legacy namespace
  printf 'claims/%s  ' "$(basename "$c")"
  [ -f "$c/claim.json" ] && grep -o '"state"[[:space:]]*:[[:space:]]*"[A-Z_]*"' "$c/claim.json" || echo 'INCOMPLETE-CLAIM'
done
for c in "$ROOT"/arc-claims/*/*/; do                      # ARC namespaces, listed separately
  [ -d "$c" ] || continue
  printf 'arc-claims/%s/%s  ' "$(basename "$(dirname "$c")")" "$(basename "$c")"
  [ -f "$c/claim.json" ] && grep -o '"state"[[:space:]]*:[[:space:]]*"[A-Z_]*"' "$c/claim.json" || echo 'INCOMPLETE-CLAIM'
done
for m in "$ROOT"/mutex/*/; do [ -d "$m" ] && { printf '%s  ' "$(basename "$m")"; cat "$m/holder.json" 2>/dev/null || echo 'NO HOLDER FILE'; }; done
```

Read each `arc.json` with `Read` and check its shape against
`arc-publish-plan/references/schemas/arc.schema.json` (required keys, state enum, `arcId` ==
directory name, case-exact). A malformed entry is rendered with `INVALID` and its reason; it is
never repaired here.

## 3. Identity checks — delegated, never re-implemented

Every identity decision uses `arc-publish-plan/scripts/lib/runtime-identity.js` (N-2):

```bash
# @op status-identity  (read-only; prints verdicts, writes nothing)
IDENT="$MAIN_WT/.claude/skills/arc-publish-plan/scripts/lib/runtime-identity.js"
node -e '
const id = require(process.argv[1]); const fs = require("fs");
const [kind, file, rel] = process.argv.slice(2);
const obj = JSON.parse(fs.readFileSync(file, "utf8").replace(/\r/g, ""));
const r = kind === "authorized" ? id.authorizedMatchesPath(obj, rel) : id.claimMatchesPath(obj, rel);
console.log(kind, rel, r.verdict, r.reasons.join("; "));
' "$IDENT" claim "$ROOT/arc-claims/$ID/$T/claim.json" "arc-claims/$ID/$T/claim.json"
```

- `claimMatchesPath` / `authorizedMatchesPath` on every claim and token in both namespaces
  (`claims/<T>/…` and `arc-claims/<ID>/<T>/…`): any verdict other than `MATCH` ⇒ `CLAIM-ARCID-MISMATCH`.
- `arcIdTriple({ plan, manifest, current }, "<ARC-ID>")` on every **ARC** pointer — the committed
  B4 signature `arcIdTriple(files, expected)` with `files = { plan, manifest, current }` (the three
  parsed records) and `expected` = the arc id the pointer lives under: any verdict other than
  `ARC` ⇒ `MANIFEST-ARCID-MISMATCH`. The legacy pointer `plans/current.json` carries no `arcId`
  and is **never** put through this check (CORE-STREAM indexes it; no flag).
- `holderOwnershipMatches(holder, identity)` defines the owner pair `(arcId ?? legacy, taskId)`
  shown for every mutex holder; a holder whose pair has no claim in its namespace ⇒
  `HOLDER-WITHOUT-CLAIM` (`__PUBLISH__` / `__OWNER__` exempt).

## 4. Flags (contract section 9 — the only vocabulary)

`DRIFT` · `STALE-READY` · `ORPHAN-CLAIM` · `STRAY-REGISTRY` · `DUPLICATE-ID-INFO` ·
`CLAIM-ARCID-MISMATCH` · `HOLDER-WITHOUT-CLAIM` · `MANIFEST-ARCID-MISMATCH`. `DUPLICATE-ID-INFO`
(the same `taskId` in `claims/` and in one or more `arc-claims/<ID>/`) is **informational and
expected** — duplicates across namespaces are legal by design. `STALE-READY` is a flag, never a
state change. Flags are computed exactly as `qa/arc_registry_offline.js` `statusFlags` does
(the executable reference); the auditor's flag vocabulary is a different set and is never mixed in.

## 5. Render

Use `templates/status-report.md`: REGISTRY, POINTERS, then **legacy claims and ARC claims under
separate headings** (never merged), MUTEX HOLDERS as `(arcId ?? legacy, taskId)`, FLAGS. Print
`execution.pointer` / `execution.claimsRoot` as the documentary index fields they are. With
`--arc <ARC-ID>` restrict the REGISTRY, POINTERS and ARC-claims sections to that arc; the legacy
sections are still listed (they are not an arc). Report in the conversation only; write nothing.

## Stop conditions

Stop and report without rendering if: `--arc` is malformed (not an `arcId`, or a case variant
of one — never normalized); the root recipe cannot be resolved (`git rev-parse` fails);
`arc.schema.json` is unreadable; or the request asks this skill to write, register, promote,
set a state, close, publish, claim, authorize, release, retire, or touch the runtime or any
file — none of that exists in Increment 1, and none of it is ever this skill's act.
