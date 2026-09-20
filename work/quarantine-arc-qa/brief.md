# Brief — Quarantine legacy ARC QA suites

Branch: `task/quarantine-arc-qa` (worktree `pt-wt-arc-qa-quarantine`), based on `branch-dev` @ `08e83f7`.
Backlog ref: `BACKLOG.md` NEXT #2 · "Quarantine legacy ARC QA suites".

## Goal

Remove the nine legacy ARC-era QA suites from the active `qa:offline` / LAND gate, using the
**existing** `OFFLINE_TESTS_DENYLIST` mechanism in `qa/run-offline.js` — no new mechanism, no
file deletion, no loss of historical evidence, no weakening of current product coverage.

## Suites being quarantined (exactly 9)

All nine read only `.claude/skills/arc-*/**` contract/schema/script surfaces (frozen legacy
per `CLAUDE.md` FROZEN LEGACY section). None touch `index.html`, `netlify/functions/`, or
`services/` product code — confirmed by reading each suite's header and grepping for any
`require()` of these files elsewhere in `qa/` (none found; each runs only as an isolated
`spawnSync` child of `run-offline.js`, or standalone):

1. `qa/arc_execution_profiles_offline.js`
2. `qa/arc_multi_arc_offline.js`
3. `qa/arc_publish_profiles_offline.js`
4. `qa/arc_registry_offline.js` — contains the `D10-l` / `auNormalize` defect the backlog
   entry names as the concrete recurring blocker (hardcoded pin against the live
   `.ai-reports/handoffs/` corpus; a `"NOT ratified"` -> `RATIFIED` substring bug)
5. `qa/arc_runtime_ops_offline.js`
6. `qa/arc_runtime_schemas_offline.js`
7. `qa/arc_safecheck_offline.js`
8. `qa/arc_worker_handshake_offline.js`
9. `qa/phase_gate_offline.js` — tests `.claude/skills/arc-worker/scripts/phase-gate.js`
   directly; not part of `OFFLINE_TESTS_BASELINE`, currently pulled in only by
   auto-discovery

The first 8 are landed members of the frozen 41-entry `OFFLINE_TESTS_BASELINE` array (never
edited by this task — see "Explicitly not changed" below); `phase_gate_offline.js` is not in
the baseline and is excluded purely by the denylist entry.

`qa/lib/arc-safecheck.js` and `qa/lib/named-args.js` are ARC-only support libs used solely by
`arc_safecheck_offline.js`. They are already outside the gate (`qa/lib/**` is never
discovered — `run-offline.js`'s `walkJs`/`discoverSuites` do not recurse) and are **not**
moved or edited by this task.

## Implementation scope — exactly two files

1. **`qa/run-offline.js`** (ASK-tier — `qa/run-offline.js` is listed in AGENTS.md's ASK tier;
   listed here by path so the Worker may edit it under the MANUAL posture):
   - Preserve the 2 existing `OFFLINE_TESTS_DENYLIST` entries unchanged, and add exactly the
     9 approved legacy suites above, with deterministic ordering (the resulting array has a
     single fixed byte-for-byte form — whatever order is chosen, it is final and not
     re-shuffled).
   - Update the two comments immediately above `OFFLINE_TESTS_DENYLIST` and above
     `OFFLINE_TESTS_BASELINE` that describe the arrays, to record why these 9 are denylisted
     (one line, pointing at this brief/backlog entry — no new prose beyond that).
   - No other line in this file changes. `OFFLINE_TESTS_BASELINE` (41 entries, order,
     content) is **not** touched.

2. **`qa/run_offline_discovery_offline.js`** (not ASK-tier; ordinary product/QA file):
   - `D08` currently hardcodes the denylist size twice: `'the denylist block holds exactly 2
     quoted qa/ literals'` and `'the exported denylist resolves to exactly 2 entries'`. Both
     literals change from `2` to `11` (2 existing + 9 new) to match the new denylist size.
     This is the discovery mechanism's own shape-contract suite verifying its pinned
     invariant tracks the real array — not a weakening: the suite still fails closed if the
     denylist array and its declared count ever drift apart. **Done and verified.**
   - **Owner-approved amendment (STOP resolution, in-session):** `D01` and the shape guard
     originally assumed `OFFLINE_TESTS_BASELINE` and `OFFLINE_TESTS_DENYLIST` are always
     disjoint — every baseline entry is asserted present in the live effective set, and
     `PRE_SLICE_EFFECTIVE_COUNT = 41` is asserted fully present. That assumption is
     structurally false once 8 baseline members are intentionally denylisted by this task.
     `D01`'s and the shape guard's assertions that require disjointness are replaced —
     narrowly, in this same file only — with equivalent assertions that instead verify:
     - every **non-denylisted** baseline entry is present in `OFFLINE_TESTS`;
     - no baseline entry is absent from `OFFLINE_TESTS` unless it is explicitly denylisted;
     - surviving (non-denylisted) baseline entries retain their original relative order at
       the front of the effective set;
     - discovered additions after that surviving-baseline prefix are exactly the
       independently re-derived additions, in the existing discovery contract's sorted
       order;
     - every denylisted entry is absent from `OFFLINE_TESTS` (unchanged — already correct).
   - `OFFLINE_TESTS_BASELINE` stays at exactly 41 entries, same order/content.
     `OFFLINE_TESTS_DENYLIST` stays at exactly 11 entries. `D03`, `D05`, `D06`, `D07`, and
     `D08`'s baseline-count checks (`OFFLINE_TESTS_BASELINE.length === 41`,
     `PRE_SLICE_EFFECTIVE_COUNT = 41`) are untouched — none of them assumed disjointness.
     No unrelated discovery/existence/membership/shape guard is weakened.
   - No other file changes; `qa/run-offline.js` is not touched further.

**No other implementation files change.** Normal workflow evidence artifacts under
`work/quarantine-arc-qa/` (`plan.md`, `codex.md`, `qa.log`, `review.md`) are created and
tracked/gitignored per `AGENTS.md`'s task folder convention as this task proceeds — that is
expected process evidence, not an expansion of implementation scope. No suite file is
deleted, renamed, or moved — every quarantined suite remains on disk, in Git history, and
independently runnable by hand (`node qa/arc_registry_offline.js`, etc.) as historical
evidence.

## Explicitly not changed / not in scope

- `OFFLINE_TESTS_BASELINE` in `qa/run-offline.js` — stays at 41 entries, same order, same
  content, byte-identical. Quarantine happens via the denylist filter that already runs
  against baseline entries (confirmed: `computeEffective()` filters `baseline` through
  `isDenied` before concatenating discovered additions), not by removing them from the
  historical baseline record.
- Deleting, renaming, or moving any `arc_*` file, `phase_gate_offline.js`,
  `qa/lib/arc-safecheck.js`, or `qa/lib/named-args.js`.
- Any change to `.claude/skills/arc-*/**` (frozen legacy skill machinery itself).
- Any change to product code (`index.html`, `netlify/functions/`, `services/`).
- Any other QA suite's assertions (checked: `fund_facts_panel_offline.js` and
  `fund_facts_read_client_test.js` each assert their *own* filename appears exactly once in
  `OFFLINE_TESTS` — unaffected by denylist size).
- `main`/production — untouched; this task lands on `branch-dev` only, and only after Owner
  LAND approval.

## Validation

- Targeted: `node qa/run_offline_discovery_offline.js` — the discovery-contract suite itself must pass with the updated `11` literals, proving the denylist array and its declared size stay in sync.
- Historical-evidence check: run each of the 9 quarantined suites standalone (`node qa/<suite>.js`) to confirm each still executes and still reports its own result. This proves the suites remain intact and runnable as historical evidence — it does not by itself demonstrate anything about current product coverage.
- Full gate: `npm run qa:offline` must pass (see Definition of done for the exact expected counts).

## Definition of done

`npm run qa:offline` passes with `OFFLINE_TESTS.length` reduced by exactly 9 versus the
current run, `OFFLINE_TESTS_DENYLIST` containing exactly 11 entries (the 2 existing entries
preserved + the 9 approved legacy suites), `OFFLINE_TESTS_BASELINE` unchanged (41 entries,
byte-identical order/content), and `qa/run_offline_discovery_offline.js` passing with its
updated `11`-literal assertions. Any deviation (baseline touched, a suite deleted/moved, a
non-listed file edited, an existing denylist entry dropped, or the gate still executing any
of the 9 suites) is a task failure.
