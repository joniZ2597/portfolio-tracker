# Task brief: qa-isolation-meter — Slice 0: private temp root per run + process meter for the two land-tool suites

Operational only when the Owner has approved these exact contents and the brief-only commit records them unchanged.

| | |
|---|---|
| Backlog | **none** — workflow tooling (Track 6, "Faster land-tool tests", Slice 0); no `BACKLOG.md` change |
| Baseline | `cd2c54bc3bf6f4d9aa37788332aa2518e2b0d7d6` (`branch-dev` = `origin/branch-dev`, 2026-10-04) |
| Branch / slot | `task/qa-isolation-meter`, Worker A (`pt-wt-worker-a`, free, detached at `cd2c54b`) |
| Mode | **Auto (attended)** — test-only files; no production, protected or ASK-tier path; no tool behaviour change |
| qa:offline | baseline at Step 0 → **+1** (`qa/run_isolation_offline.js`) |
| Parallel with | Worker B `task/analyst-parser-r4a`: no shared file. Full `qa:offline` one at a time on the laptop |
| Status | FINAL. Owner rulings 2026-10-04 (§0); no decision open |

## 0. Owner rulings (2026-10-04; not reopened)

1. Temp isolation and instrumentation are **one test-only task**.
2. Pinned to `cd2c54bc3bf6f4d9aa37788332aa2518e2b0d7d6`, Worker A.
3. Scope:
   - per-suite private `TEMP` / `TMP` / `TMPDIR` for `qa/pt_land_offline.js` and `qa/pt_land_resync_offline.js`;
   - spawn / Git process metering;
   - `qa/run_isolation_offline.js`;
   - no product or tool behaviour change;
   - no `qa/run-offline.js` change.
4. The laptop measurements from this task decide the next lever after Slices 1–3, in this order of preference:
   - A — direct `git.exe`, if launcher overhead is confirmed;
   - B — deeper zero-process migration;
   - C — parallel heavy suites, only after isolation is proven;
   - D — antivirus exclusion, last resort and an Owner security decision.

   This task only measures; it implements none of them.
5. Until this task lands, only **one full `qa:offline`** runs on the laptop at a time.

Objective:
1. **Remove the temp-path collision.** Each run of `qa/pt_land_offline.js` and `qa/pt_land_resync_offline.js`
   works under its own private temp root, so concurrent runs can no longer share `pt-oag*` manifests or delete
   each other's `pt-resync-*` folders.
2. **Measure.** Count and time every process start in both suites, per row, split into fixture / tool / other,
   and record which Git executable actually runs.

No optimization. Every existing row keeps its name, order, assertions and result.

## 1. Exact changes

### 1.1 `qa/lib/run-tmp.js` (new; `qa/lib/` is not auto-discovered)

Exports `isolate(prefix)`:
- **Idempotent** per process; returns `{ root, parent }`.
- `parent` = `os.tmpdir()` read before any change; `root` = `fs.mkdtempSync(path.join(parent, prefix))`.
- Sets `process.env.TEMP`, `process.env.TMP` and `process.env.TMPDIR` to `root`, then verifies that
  `os.tmpdir() === root`. Otherwise it **throws**, so the suite fails before any row runs.
- Registers `process.on('exit')`: best-effort `fs.rmSync(root, { recursive: true, force: true })`. If removal
  fails, it prints one `@@QA-SURFACE@@ run-tmp: root left behind <root>` line; it never throws.
- Touches no `GIT_*` variable. The tool's environment refusals (`pt-land.js:49–50`) cover only `GIT_*`.

### 1.2 `qa/lib/spawn-meter.js` (new)

Exports `install()`, `beginRow(name)`, `endRow()`, `report(stream, suiteLabel)` and `resolveGitOnPath(env, platform)`.

- **`install()`** — idempotent. Replaces `require('child_process').spawnSync` with a wrapper that:
  1. reads `process.hrtime.bigint()`;
  2. calls the original `spawnSync` with **the same `this`, arguments and options object, unmodified**;
  3. records `{ exe, sub, ms, cat, row }`;
  4. **returns the original result object unchanged**.

  Meter-internal errors are caught and counted as `meterErrors`, never thrown.
- **Category** (`cat`), from the JS call stack (`Error.stackTraceLimit` raised temporarily and restored at once):
  - `fixture` — a frame named `buildFixture`, `buildCleanupFixture`, `buildProtectedFixture`,
    `buildApprovedLandFixture` or `makeFlakyGitViaNodeOptions`;
  - `tool` — otherwise, a frame in a file named `pt-land.js` or `guard_integrity_check.js`, or a Node spawn whose
    first argument ends in `pt-land.js` (marked `cli`);
  - `other` — everything else.
- **`exe` / `sub`** — the executable's base name and, for Git, the first non-option argument.
- **Rows** — `beginRow` / `endRow` bracket each `test()` call; spawns outside any row count as `outside`.
- **`resolveGitOnPath()`** — computes, **without starting a process**, the file that `spawnSync('git')` runs:
  - each `PATH` entry in order; on Windows, `git`, `git.com`, `git.exe`;
  - reports the path and its kind: `launcher` (`…\Git\cmd\git.exe` or `…\Git\bin\git.exe`), `direct`
    (`…\mingw64\bin\git.exe`) or `other`.
- **`report(stream, suiteLabel)`** writes, in order:
  - `@@QA-SURFACE@@ <suiteLabel> meter: git=<path> (<kind>); rows=<n>; starts git=<n> node=<n> other=<n>; ms fixture=<ms> tool=<ms> other=<ms>; cli=<n>/<ms>; avgGitMs=<ms>; meterErrors=<n>`;
  - `@@QA-SURFACE@@ <suiteLabel> meter: top git subcommands: <sub>=<n> …` (top 10);
  - one `@@PL-METER@@ <suiteLabel> row <i> <wallMs> fixture=<n>/<ms> tool=<n>/<ms> other=<n>/<ms> | <row name>` line
    per row, plus one `@@PL-METER@@ <suiteLabel> outside …` line.
- No environment variable, file write, network call or extra process. CLI child runs are counted with their wall
  time only.

### 1.3 `qa/pt_land_offline.js` — exactly three edits

- **E1** Immediately after `'use strict';` (`:1`):
  ```js
  // Slice 0 (work/qa-isolation-meter): private temp root per run, then counting/timing only.
  require('./lib/run-tmp').isolate('ptqa-land-');
  const meter = require('./lib/spawn-meter').install();
  ```
  Both lines must precede `const { spawnSync } = require('child_process');` (`:20`) and every `os.tmpdir()` use.
- **E2** `function test(name, fn)` (`:35`): wrap the existing body in
  `meter.beginRow(name); try { <existing body> } finally { meter.endRow(); }`.
- **E3** Immediately before `if (failed > 0) {` in the summary block (`:2294`):
  `meter.report(process.stdout, 'pt-land');`

### 1.4 `qa/pt_land_resync_offline.js` — exactly three edits

- **E1** after `'use strict';` (`:1`), before `:24`: the same two lines with prefix `'ptqa-resync-'`.
- **E2** `function test(` (`:37`): the same wrap.
- **E3** before `if (failed > 0) {` (`:898`): `meter.report(process.stdout, 'pt-land-resync');`

`tmpResyncDirs()` and its cleanup lines stay byte-identical. They now see only this run's private root.

### 1.5 `qa/run_isolation_offline.js` (new suite)

| ID | Assertion |
|---|---|
| RI-1 | `isolate()` sets `TEMP` / `TMP` / `TMPDIR` to a new directory under the original temp folder, and `os.tmpdir()` returns it. A second call returns the same root |
| RI-2 | **Collision gone (the RED/GREEN proof):** two child Node processes, each calling `isolate()` and writing `<os.tmpdir()>/pt-oag1/protected/manifest.json` with different content, run at the same time. Each reads back its own content, and the two roots differ. **Planted negative:** the same two children without `isolate()` both resolve to the same `pt-oag1` path |
| RI-3 | **Resync sweep scoped:** a `pt-resync-x` folder created in the *original* temp folder is invisible to a listing of `os.tmpdir()` after `isolate()`, and survives the child's exit |
| RI-4 | **Cleanup:** after a child exits normally, its root is gone; a child that throws also removes its root |
| RI-5 | **Children see the private root:** a child Node process started the way the suites start CLI runs (inheriting `process.env`; the resync suite's `cleanEnv()` copy) reports `os.tmpdir() === root` |
| RI-6 | Static: in both land suites, E1 precedes the `child_process` destructuring and the first `os.tmpdir(`; E2 and E3 are present; no other line differs from the baseline except E1–E3 |
| MT-1 | Pass-through: for a `node -e` spawn, the wrapped call returns the identical result object and receives the identical arguments and options object (spy) |
| MT-2 | Categories: fixture-builder frames → `fixture`; a frame in `pt-land.js` → `tool`; a Node spawn of `…/pt-land.js` → `tool` + `cli`; otherwise `other` |
| MT-3 | Rows: spawns inside `beginRow` / `endRow` go to that row; outside → `outside` |
| MT-4 | `install()` twice wraps once; the meter adds no environment variable and writes no file |
| MT-5 | `resolveGitOnPath` with fake `PATH` folders: first match wins; `cmd\git.exe` and `bin\git.exe` → `launcher`; `mingw64\bin\git.exe` → `direct`; no process started |
| MT-6 | A meter-internal error is counted, never thrown; the spawn result is still returned |
| MT-7 | `report()` line formats match §1.2 exactly, including `avgGitMs` |

Every row has a planted negative.

<!-- land-scope:begin -->
qa/lib/run-tmp.js
qa/lib/spawn-meter.js
qa/pt_land_offline.js
qa/pt_land_resync_offline.js
qa/run_isolation_offline.js
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/run_isolation_offline.js
node qa/pt_land_resync_offline.js
<!-- land-tests:end -->

## 2. Files — exactly 6

```
qa/lib/run-tmp.js                   NEW — §1.1
qa/lib/spawn-meter.js               NEW — §1.2
qa/pt_land_offline.js               E1–E3 only
qa/pt_land_resync_offline.js        E1–E3 only
qa/run_isolation_offline.js         NEW — §1.5
work/qa-isolation-meter/review.md   NEW — ## Backlog reconciliation: none; measurement summary; LAND-EVIDENCE
```

`qa/run-offline.js`, `.claude/hooks/*` and every other suite are untouched.

## 3. QA and the measurement (laptop)

1. **Step 0:** full `qa:offline` baseline. It must be the only full run on the laptop (check Worker B first).
   Record both suites' PASS counts (Linux: 166 and 49).
2. **Tests first:** `qa/run_isolation_offline.js` is RED (no `run-tmp.js` / `spawn-meter.js` yet), then GREEN.
3. **Behaviour proof:** `node qa/pt_land_offline.js` and `node qa/pt_land_resync_offline.js` after E1–E3 give the
   same PASS counts as Step 0, no FAIL and exit 0. The number of `@@PL-METER@@` row lines equals the number of
   executed rows. No `ptqa-*` root is left in the temp folder afterwards.
4. **Collision proof on the laptop:** start the two land suites from two terminals at the same time. Both PASS.
   Record that each used its own `ptqa-*` root (`@@QA-SURFACE@@` lines).
5. **Measurement run:** each suite once more, **alone**. Keep the output in `work/qa-isolation-meter/qa.log`
   (ignored file).
6. Full `qa:offline` = Step-0 count + 1.
7. `review.md` measurement summary, per suite:
   - Git path and kind (launcher or direct);
   - starts by executable;
   - fixture / tool / other / cli shares of time;
   - **average ms per Git start**;
   - top 10 rows by time and top 10 Git subcommands.

   These numbers feed decision gate G0 (`qa-perf-execution-plan.md` §4).

## 4. Flow, STOP, Definition of Done

**Flow:** AGENTS.md steps 0–16 in attended Auto; step 10a effect `none`; LAND and push through R12 with the Owner's
two lines; cleanup.

**STOP:**
- STOP-1..6;
- any change to an existing assertion, row name, row order, fixture content or the tool;
- any edit to the two land suites beyond E1–E3;
- a different PASS count than Step 0;
- any `GIT_*` variable set, read-modified or removed by the new code;
- `isolate()` unable to redirect `os.tmpdir()` on the laptop (STOP and report; do not work around it);
- a `ptqa-*` root left behind after a normal run;
- a second full run on the laptop during Step 0, 5 or 6.

**Definition of Done:**
- E1–E3 in both suites and the three new files exact;
- RI-1…RI-6, MT-1…MT-7 and their negatives PASS;
- behaviour and collision proofs PASS on the laptop;
- full `qa:offline` = baseline + 1;
- measurement summary in `review.md`;
- Codex with no unresolved Class I finding;
- LANDed, pushed, cleaned.
