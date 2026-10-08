# Task brief: ath-suites-crlf-anchors — LF-normalise the mutant-source read in the four B2-auto ATH suites

This brief has operational effect only when the Owner has approved these exact contents and the brief-only
commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Backlog | **none** — blocking test defect exposed by Worker A's post-resync full QA of R-3 (no `BACKLOG.md` entry; a stale-entry discovery would be a `[backlog]` lesson) |
| Baseline | `branch-dev` tip at brief-commit time (currently `98510776a36de6a22f80169dfe0607796c4c683c`). The four suites are unchanged since `50a7cac` (B2-auto); **valid at any later `branch-dev` tip where `git diff 50a7cac <tip>` is empty for the four files in §3** |
| Branch / slot | `task/ath-suites-crlf-anchors` in Worker slot B (temporary blocker task; `task/task-base-record` is parked clean and unchanged and returns to slot B after this LANDs) |
| Mode | **Manual** (default). No ASK- or DENY-tier file is in scope, so `Mode: Auto` would be permitted, but the Owner has not asked for it |
| qa:offline | unchanged: the step-0 count → **same count** (no suite added or removed) |
| Parallel with | nothing that touches the four files |

**Objective.** The four B2-auto suites match multi-line planted-negative anchors (`\n`-joined) against module source
read from a CRLF working tree (`core.autocrlf=true`), so the anchor is missing and the planted negative cannot run.
Normalise the source to LF immediately after the read. No product code, no ATH behaviour, no assertion changes.

## 1. Situation (verified 2026-10-08, read-only)

- Each suite's mutant loader reads the module under test with a bare `fs.readFileSync(file, 'utf8')` and then
  requires every anchor to occur exactly once (`src.split(m[0]).length !== 2` → `MUTANT_ANCHOR_MISSING_OR_NOT_UNIQUE`),
  then applies `src.replace(m[0], m[1])`:
  - `qa/ath_auto_offline.js:45` (`loadMutated`)
  - `qa/ath_ensure_offline.js:45`
  - `qa/ath_read_offline.js:50`
  - `qa/ath_record_offline.js:44`
- The working tree is CRLF (index LF), so a multi-line anchor never matches there. Single-line anchors are unaffected.
- No other suite, `package.json` script, `qa/run-offline.js` or hook references these four files by name.
- Precedent: `qa/pt_land_resync_offline.js` `mutantTool` reads `…, 'utf8').replace(/\r\n/g, '\n')` before matching anchors.

## 2. Change (exact, approved by the Owner 2026-10-08)

In each of the four mutant loaders, change only the read expression:

```
fs.readFileSync(file, 'utf8')   →   fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
```

Nothing else: the uniqueness check, the replacement call, `new Function` loading, every anchor string, every
predicate and every positive control stay byte-for-byte as they are. EOL of each edited file is preserved (byte-audit).

## 3. Files — exactly 4

```
qa/ath_auto_offline.js
qa/ath_ensure_offline.js
qa/ath_read_offline.js
qa/ath_record_offline.js
```

Plus evidence `work/ath-suites-crlf-anchors/review.md` (`## Backlog reconciliation: none`; the LAND-EVIDENCE line).

**QA suites that read in-scope files as text:** none other than the four themselves (they read the ATH product
modules, which are not edited). Their assertions survive: the change only makes a multi-line anchor findable in a CRLF
checkout; on an LF checkout it is a no-op.

<!-- land-scope:begin -->
qa/ath_auto_offline.js
qa/ath_ensure_offline.js
qa/ath_read_offline.js
qa/ath_record_offline.js
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/ath_auto_offline.js
node qa/ath_ensure_offline.js
node qa/ath_read_offline.js
node qa/ath_record_offline.js
<!-- land-tests:end -->

## 4. QA

1. **Reproduction first (RED):** on the CRLF checkout, before the edit, run the four suites and record which planted
   negatives fail with `MUTANT_ANCHOR_MISSING_OR_NOT_UNIQUE` (raw output in `qa.log`).
2. Edit; rerun the four suites → all PASS, and every planted negative still reports "killed" (counts per suite equal
   before/after except for the previously failing rows now passing). Positive controls and uniqueness checks unchanged.
3. Targeted B2-auto set: the four suites plus `ath_isolation_offline`, `ath_write_offline`, `ath_owner_tool_offline`.
4. **Heavy-lane go-ahead requested from the Owner**, then one full `npm run qa:offline` after the targeted set passes;
   the suite count equals the step-0 count.
5. Report whether the CRLF reproduction is eliminated.
6. Mutation sanity of the fix itself (outside the repo, scratchpad copy): reverting one loader to the bare read makes
   its multi-line negatives fail again (proves the edit, and only the edit, moves the result).

## 5. Skills and pre-flight

- **Skills:** `pt-offline-suite` **Required** (anchor-class coupling, planted negatives, revert proof). `/plan` is
  mandatory. The Worker launches Codex itself (AGENTS.md step 8).
- **CLAUDE.md pre-flight:**
  - **Pattern audit:** `qa/pt_land_resync_offline.js` `mutantTool` (LF-normalised read, exactly-once anchor) and the
    existing `loadMutated` / `killed` helpers in the four suites.
  - **State isolation:** no `index.html`, `localStorage`, scoring or Deep Dive surface; no product code; no live call.
  - **Gate verification:** no client or server feature gates; the ATH routes stay dormant and untouched.
  - **Definition of Done:** the four suites PASS on a CRLF checkout with all planted negatives killed.

## 6. Flow, STOP, Definition of Done

**Flow (Manual):** step 0 baseline (heavy go-ahead) → `/plan` → reproduction (RED) → edit → targeted QA → Codex →
full run (heavy go-ahead) → `review.md` → final Codex check → task commit → integrity → **STOP before LAND/push**
(LAND request, push request and cleanup only on the Owner's lines).

**STOP (in addition to STOP-1..6):** any product-code edit; any ATH behaviour change; any anchor, predicate, positive
control or uniqueness check altered; any file outside §3; any `settings.json`, `run-offline.js` or `package.json` edit.

**Definition of Done:** the four loaders changed as in §2 only; the reproduction recorded RED then GREEN; targeted
set and full `qa:offline` PASS at the step-0 count; Codex no unresolved Class I; LANDed (then pushed and cleaned only
on the Owner's lines).

## 7. After this LANDs (Owner-sequenced, not part of this task)

Worker B returns to `task/task-base-record`; Worker A resyncs R-3 to the new `branch-dev` tip and re-validates.
