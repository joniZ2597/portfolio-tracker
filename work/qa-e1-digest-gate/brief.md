# Task brief: qa-e1-digest-gate — digest-gated heavy rows in four unchanged governance QA suites

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below. **Status: FINAL** — revalidated read-only on 2026-10-11 at `5b338691010cebc3902213fd964e6e6af5ec09ec` (§1a). Placed only on Main Control's separate approval of this exact hash.

| | |
|---|---|
| Origin | QA-efficiency pilot **E1** (FABLE QA Execution Feasibility Review; COWORK `E1-DIGEST-GATE-PILOT-PLAN.md`, `E1-PRE-FINAL-DESIGN.md`). Main Control rulings **E1-D1…E1-D11** (2026-10-11, §0) |
| Backlog | **none** — no numbered entry concerns QA runtime. Roadmap row B3 (3A-L, "QA tiers, heavy-lane lock") is related but is neither closed nor edited. `BACKLOG.md` is **not** in scope |
| Baseline | **`5b338691010cebc3902213fd964e6e6af5ec09ec`** (`branch-dev` = `origin/branch-dev` after `catalyst-evidence-2-s1`'s LAND, push and cleanup). This brief's commit adds only `work/qa-e1-digest-gate/brief.md` on top of the then-current tip. **Valid only if** `git diff --quiet ba1d2593a518f5a776b30a9d0d3120bde3f5c352 <tip> -- qa/task_base_offline.js qa/pt_land_offline.js qa/pt_land_resync_offline.js qa/auto_mode_hardening_offline.js .claude/hooks/pt-land.js .claude/hooks/pretooluse-guard.js .claude/settings.json qa/guard_integrity_check.js qa/lib qa/fixture_template_offline.js qa/git_contract_offline.js qa/run_isolation_offline.js qa/pt_land_logic_offline.js qa/pt_land_resync_logic_offline.js qa/tools qa/run-offline.js package.json` exits 0 (true at `5b33869`; every gated input is byte-identical to `ba1d259`). Otherwise HOLD and re-pin this brief (§1 hashes) |
| Branch / slot | `task/qa-e1-digest-gate`, **Worker B** (`pt-wt-worker-b`), created from `branch-dev` at this brief's commit by Bootstrap `task-start`. Worker B is detached at `5b33869` after `catalyst-evidence-2-s1`'s cleanup. Runs **before `market-data-1`** (E1-D4) |
| Mode | **Manual** (it changes what the QA gate executes) |
| qa:offline | **No new suite; count unchanged** (= the step-0 count: **78** at `5b33869`; 80 if `surface-1` lands first — the rule is "equal to step 0") |
| Parallel with | Worker A — **active on `task/surface-1`** (`index.html`, `qa/asset_type_offline.js`, `qa/labs_panel_offline.js`, `qa/dh_ui_vocabulary_offline.js`, `qa/fixtures/index-pins.json`, `BACKLOG.md`): untouched by this task. No shared file (this task makes no `BACKLOG.md` edit). **One heavy run at a time**: each heavy run only on the Owner's heavy-lane go-ahead (§4), never while another full run is active. If `branch-dev` moves, AGENTS 9.4 / 9.5 and Second LAND apply as written |

**Objective.** In `qa/task_base_offline.js`, `qa/pt_land_offline.js`, `qa/pt_land_resync_offline.js` and `qa/auto_mode_hardening_offline.js`, the rows that start processes (real Git, Node, the hook CLI) are **skipped only when every input they depend on and the execution environment equal a pinned, previously replayed state**, exactly as GC-4 (`qa/git_contract_offline.js`) and FT-0 (`qa/fixture_template_offline.js`) already do. Every other case runs them. A changed input runs them and then **fails closed with "re-pin required"**. Expected effect: a normal full `qa:offline` drops from about 22 min to a few minutes (measured, §3 E1-8). **No production code, hook, settings, integrity module, library, runner or instruction file changes.**

## 0. Rulings (not reopened)

- **E1-D1 — scope.** Four existing QA suites only. No changes to hooks, LAND tools, integrity, `qa/run-offline.js`, `AGENTS.md` or `CLAUDE.md`.
- **E1-D2 — fail-closed.** On changed source or contract inputs: full replay, then fail-closed `re-pin required`. Unproven environments and explicit overrides must never silently SKIP.
- **E1-D3 — forced replay.** Before each governed SHIP and weekly; separate from normal digest-gated product QA (§9).
- **E1-D4 — placement.** Worker B after `catalyst-evidence-2-s1` closes, before `market-data-1`, subject to final effort and safety validation.
- **E1-D5 — full Node version** in E1's environment key, without modifying the GC-4 / FT-0 pins or contracts.
- **E1-D6 — one go-ahead for forced replay + step 10, approved in principle** under the conditions copied into §4 (gate O-3, "HL-2 conditions"). This design approval authorises neither run.
- **E1-D7 — weekly rule.** A forced replay only if the current pins have not had a successful full replay within 7 days. It piggy-backs on the next otherwise-required step 0. No separate scheduled run, automation or Owner interruption. If no step 0 occurs, the condition stays due; it never triggers a standalone run.
- **E1-D8 — `NODE_OPTIONS` override.** If `NODE_OPTIONS` is set, the suites replay and must not silently SKIP (R4 G4).
- **E1-D9 — no automatic retry.** Any unexpected forced-replay failure, including the intermittent AH-16, requires diagnosis and an explicit Owner decision before another full run (§5).
- **E1-D10 — reporting.** The existing `@@QA-SURFACE@@ ` mechanism is used only if the runner and the existing reporting contracts are unmodified: E1 lines are **additive**; no existing output line changes (R7, R8, §5).
- **E1-D11 — pin-initialization checkpoint.** The four expected pre-pin failures are treated as the planned pin-initialization checkpoint **only after every underlying assertion passes and the digests are verified**. They are **never reported as a full QA PASS** (§4, §5, §6).

## 1a. Revalidation record (COWORK, read-only, 2026-10-11T10:40Z)

- **Host probe:**
  - `branch-dev` = `origin/branch-dev` = `5b33869`; canonical checkout CLEAN; no blocking lock;
  - `pt-wt-worker-b` detached at `5b33869`;
  - `pt-wt-worker-a` on `task/surface-1` at `5718d5f` (not inspected, not touched).
- **Moved since the draft** (`ba1d259` → `5b33869`): `ai-output-1-s1a` (`index.html`, `qa/ai_parse_repair_offline.js`, pin map, entry 38), the `surface-1` brief, and `catalyst-evidence-2-s1` (`netlify/functions/lib/news-catalysts-provider.js`, the two news-catalyst suites, two replay fixtures, entry 4). **None touches a gated input, a reader, `qa/lib`, `qa/tools` or `qa/run-offline.js`:** the Baseline row's `git diff --quiet` exits 0.
- **Hashes:** every §1 sha256 (LF) is identical at `5b33869`.
- **Readers:** the set of files referencing the four suites, `record-git-transcripts`, `landHelperSources`, `LAND_SUITE` or `RESYNC_SUITE` is unchanged (§1 table). `exec-env-fingerprint` is still used only by GC-4 and FT. No file uses `PT_QA_FORCE_HEAVY`, the four pin names or an `@@QA-SURFACE@@ E1` line.
- **Suite count:** 78 (77 + `qa/ai_parse_repair_offline.js`; `catalyst-evidence-2-s1` added none).
- **AH-16 recurred** in `catalyst-evidence-2-s1`'s step 0 at `afd3f87` (1 of 4 265 assertions; it passed on that task's step 10). This is evidence for E1-D9: a recurrence in R0 or R2 is diagnosed and decided by the Owner, never retried automatically.

## 1. Situation (read-only, `ba1d259`; unchanged at `5b33869`)

**Timings** (`ai-output-1-s1` step 0, full run 1 312 674 ms):

| Suite | ms | Harness |
|---|---|---|
| `qa/task_base_offline.js` | 497 278 | `test(name, fn)` rows (:42; `TB_ONLY` filter, spawn-meter rows); PASS line `(passed/passed)` |
| `qa/pt_land_offline.js` | 433 411 | `test(name, fn)` (:38) |
| `qa/pt_land_resync_offline.js` | 215 438 | `test(name, fn)` (:40) |
| `qa/auto_mode_hardening_offline.js` | 83 931 | `check(name, cond)` assertions (:30) in top-level blocks; PASS line `(N assertions)`; **4 265 assertions** at `afd3f87` (= `ba1d259` for this file and its inputs) |

**Byte identity at `ba1d259`** (sha256 of the LF-normalised text):

| File | sha256 |
|---|---|
| `qa/task_base_offline.js` | `edd0ba47e8f1d5a1086995bae5bd06f2062a984753a1c29e5994cd8eb62b4217` |
| `qa/pt_land_offline.js` | `ee11064e16a6aeb289e3a0b94e972a2fed81b0ed6f84f1518286a90c140949de` |
| `qa/pt_land_resync_offline.js` | `5cc2a4fa246a0b3115d103044991a3dea4ba87928210b6ae23bc6b4381ab260a` |
| `qa/auto_mode_hardening_offline.js` | `6214a11c170a8977907ff11c0f34c072609a9ddca800857aa6830b4025dd2947` |
| `.claude/hooks/pt-land.js` | `a391cbec653037ab938098db62ae2e6f7f9155ad6d14787e63d81ba317148b0a` |
| `.claude/hooks/pretooluse-guard.js` | `c4df95b51e40257facdef41e7f6be24e1803da6c1bbcdcf7cbd4c18cec0e3c3b` |
| `.claude/settings.json` | `39b17320f403451467eae35c9f8f1665383bcd727cb0c4bc1c15cbd659b05de3` |
| `qa/guard_integrity_check.js` | `a284be3f22465039fffe29dc36931548bc9b426cd6808c730e22b9f5f14fbb95` |
| `qa/lib/fixture-template.js` | `5b1f24be50b7c12c438079a135d45960249917dd4721e8cc38b07ec6321b36a0` |
| `qa/lib/run-tmp.js` | `a9d9a01e061753ea4f2abc90299ff00edcc34bc3810278f292b50144e34e8f3d` |
| `qa/lib/spawn-meter.js` | `78987deb399c53357eb3726227e2f3588a5d62bc142f0df438ea5dae2774ad21` |
| `qa/lib/exec-env-fingerprint.js` | `b73c5b24c8abf4bb2d56d428ae6ba67c9f52afb728a16b6ca7dd59d12ad04789` |
| `qa/run-offline.js` | `40deef25a4d14e5492d278589605a1a0669187292fe8ce2197a616ed21c72312` |

**The precedent (copied, not changed).**
- `qa/lib/exec-env-fingerprint.js`:
  - `collect()` runs in `os.tmpdir()`, outside any repository. It digests platform, arch, OS release, filesystem case and symlink behaviour, `git version --build-options`, git config (system and global scope; `user.*`, credential, editor, pager, alias excluded), every `GIT_*` variable, `LANG` / `LC_ALL` / `LC_MESSAGES` / `TZ` / `HOME` / `XDG_CONFIG_HOME`, and the Node **major**.
  - `digestParts(parts)` produces the source digest; `gateDecision(src, env, pin)` returns `skip` | `replay-notice` | `replay-fail`.
- FT-0 (`qa/fixture_template_offline.js` :219–249, :515–519):
  - `TEMPLATE_CONTRACT_PIN`;
  - parts read LF-normalised; its own source with the pin statement neutralised by `/const TEMPLATE_CONTRACT_PIN = \{[\s\S]*?\n\};/`;
  - `heavy(name, fn)` → `test` or skip;
  - a verdict row that runs last: `SKIP  (contract pinned: <src12>/<env12>) n heavy …`, or the `re-pin required: source <64> environment <64>` error.
- Pinned environment `ef28452b4eb84527b7208fc76792410d4948cc9d0fa91173a94c79edefa90858` (GC-4 and FT).
  - **Both slots match it:** in Worker A's `ai-output-1-s1a` C-3 record GC-4 / FT print `SKIP … /ef28452b4eb8`, with `node v24.14.0`; Worker B's `catalyst-evidence-2-s1` step 0 shows GC-4 1 029 ms and FT 569 ms (skip timings).

**How `qa:offline` shows suite output.** `qa/run-offline.js` spawns each suite with the inherited environment (:387) and **discards a passing suite's stdout**, except lines carrying the marker `@@QA-SURFACE@@ ` (:395–402, :418). E1 uses that existing marker; the runner is unchanged.

**QA suites and tools that read in-scope files as text** (AGENTS "Task brief convention"):

| Reader | What it reads | Survives only if |
|---|---|---|
| `qa/fixture_template_offline.js` (FT-0 digest; `landBuilders` / `resyncBuilder`) | `pt_land_offline.js` `buildFixture`, `buildCleanupFixture`; `pt_land_resync_offline.js` `buildFixture` (working tree and base) | those functions are byte-identical |
| `qa/git_contract_offline.js` (GC-4 digest) via `qa/tools/record-git-transcripts.js` | the nine `LAND_HELPER_NAMES` functions of `pt_land_offline.js` (`buildFixture`, `buildCleanupFixture`, `manifestRoot`, `writeManifest`, `buildProtectedFixture`, `payloadOf`, `approveProtected`, `buildApprovedLandFixture`, `writeIgnoredEvidence`) and resync `buildFixture` | the same — and no new top-level function with any of these names |
| `qa/pt_land_logic_offline.js`, `qa/pt_land_resync_logic_offline.js` (through `record-git-transcripts.js`) | the same helper functions | the same |
| `qa/run_isolation_offline.js` RI-6 (:320–357) | `pt_land_offline.js` and `pt_land_resync_offline.js` as text | lines 2–4 unchanged; `require('./lib/run-tmp').isolate('<prefix>');` before the first `const { spawnSync } = require('child_process');` and the first `os.tmpdir(`; `meter.beginRow(name);`, the exact line `  } finally { meter.endRow(); }`, and `meter.report(process.stdout, '<label>');` each present unchanged |
| `qa/tools/pt_land_dualrun.js` (tool, not a suite) | the same helper functions | the same |

`task_base_offline.js` and `auto_mode_hardening_offline.js` are read by no other suite. None of the four files is ASK- or DENY-tier (ordinary).

## 2. Requirements

| # | Requirement |
|---|---|
| R1 | **Pattern.** In each suite, FT-0's pattern exactly: (1) a pin constant; (2) a parts list; (3) one gate decision computed **once, at load**; (4) heavy rows registered through `heavy(...)`; (5) a verdict that runs **last**. Pin names: `TB_CONTRACT_PIN`, `LAND_CONTRACT_PIN`, `RESYNC_CONTRACT_PIN`, `AH_CONTRACT_PIN`. Each is a multi-line statement `const <NAME> = {\n  source: '<64 hex>',\n  environments: ['<64 hex>']\n};` and is neutralised in the own-source part by `/const <NAME> = \{[\s\S]*?\n\};/` → `const <NAME> = PIN;`. The placeholder used for R2 keeps the same multi-line form: `const <NAME> = {\n  source: null,\n  environments: []\n};` |
| R2 | **Source parts (exact; each LF-normalised; the name is the repo path).** **TB:** `.claude/hooks/pt-land.js`, `qa/guard_integrity_check.js`, `qa/lib/fixture-template.js`, `qa/lib/run-tmp.js`, `qa/lib/spawn-meter.js`, `qa/lib/exec-env-fingerprint.js`, own source. **LAND:** the TB list + `.claude/hooks/pretooluse-guard.js`. **RESYNC:** the TB list. **AH:** `.claude/hooks/pretooluse-guard.js`, `.claude/settings.json`, `qa/guard_integrity_check.js`, `qa/lib/exec-env-fingerprint.js`, own source. Parts are always read from the **repo paths** (`ROOT`), never from an override path. Reads at fixed commits (`task_base` `git show 1e4b773…`) are immutable and are not parts. Dynamic `require(p)` / `require(mutSrc)` of temporary copies or mutants derived from declared parts are listed by line in `plan.md` as justified |
| R3 | **Environment key (E1-D5).** `E1_ENV = sha256('e1-env-v1\n' + FPLIB.collect().digest + '\nnode ' + process.version)` (hex). Pins hold `E1_ENV` values. `qa/lib/exec-env-fingerprint.js` is **not** changed; the GC-4 / FT pins and digests are unaffected |
| R4 | **Gate decision (pure function, e.g. `e1Decide({ src, env, pin, vars })`, tested in memory).** Overrides = `PT_LAND_TOOL_PATH`, `AH_HOOK_PATH`, `AH_SETTINGS_PATH`, `TB_ONLY`, `NODE_OPTIONS` — **"set" means defined and non-empty**; every suite checks the whole list. Force = `PT_QA_FORCE_HEAVY`. The cases, in this order: **G0** force set to any value other than exactly `1` → `invalid-force` (heavy rows run; verdict FAIL `invalid PT_QA_FORCE_HEAVY`). **G6** pin malformed (source not 64 lowercase hex, `environments` not a non-empty array of distinct 64-hex strings) → `pin-invalid` (heavy rows run; verdict FAIL `pin invalid: source <64> environment <64>`, so the forced replay yields the digests). **G4** any override set → `override:<VAR>` (heavy rows run; verdict by rows only; never SKIP; **no pin verdict**). **G3** source ≠ pin.source → `replay-fail` (heavy rows run; verdict FAIL `re-pin required: source <64> environment <64>` even when every row passed; also when forced). **G5** force = `1` → `forced` (heavy rows run; PASS by rows). **G2** env ∉ pin.environments → `replay-notice` (heavy rows run; PASS by rows, with a notice). **G1** otherwise → `skip` |
| R5 | **Heavy-row rule.** A row or block is **heavy** if it, or a helper it calls, starts a process (`spawnSync` / `execFileSync` / `execSync` / `spawn` of `git`, `node` or the hook CLI); or builds a fixture with real Git; or uses a fixture or result produced by such a step. Everything else is **light** and always runs — including in-process mutant loading from a temporary directory (AH `mutantCatches` / `mutantCatchesMulti`) and AH's `R11_CANON` directory (`mkdtempSync` + `mkdirSync`, no process). `plan.md` maps **every** row / `check` block of the four suites to heavy or light with the reason |
| R6 | **How heavy code is wrapped.** LAND / RESYNC / TB: a heavy row's `test(` becomes `heavy(`; `heavy(name, fn)` either skips (counts it) or calls the existing `test(name, fn)`, which stays byte-identical. AH: a heavy top-level block `{ … }` (or `if (…) { … }`) becomes `heavy('<block id>', () => { … });`, and top-level heavy statements outside a block move into one. **No re-indentation and no change to any row body, row name, assertion or helper**, except moving code into a heavy block |
| R7 | **Verdict lines (exact; via the existing marker).** On success each suite prints, as its last surfaced line: `@@QA-SURFACE@@ E1 <label>: SKIP (contract pinned: <src12>/<env12>) <k> heavy row(s) not run, <n> light row(s) PASS` or `@@QA-SURFACE@@ E1 <label>: REPLAY PASS (<reason>) src <src64> env <env64>, <h> heavy + <n> light row(s) run, 0 heavy skipped`. `<reason>` is `forced`, `environment not proven` or `override <VAR>`. Labels: `task-base`, `pt-land`, `pt-land-resync`, `auto-mode-hardening`. For AH, "rows" are `heavy` blocks and `check` assertions, reported as `<h> heavy block(s) / <a> assertion(s)`. Every FAIL verdict makes the suite exit 1 (the runner then prints its output). **E1-D10:** these lines are additive. Every existing output line of the four suites (including their `PASS` / `FAIL` summary lines and `@@PL-METER@@` lines), every other suite's output and `qa/run-offline.js` stay unchanged |
| R8 | **Placement inside the files.** The pin, parts, gate and verdict code sits after the existing header and imports (never on lines 1–4), outside every function listed in §1 "readers". No new top-level function shares a name with `LAND_HELPER_NAMES` or `buildFixture`. No new `require('child_process')`. In the two LAND suites the RI-6 anchors stay exactly as listed in §1. `meter.report(...)` and the final PASS / FAIL lines stay; the E1 verdict is added before them |
| R9 | **Nothing else changes.** No edit to any file outside the four suites (§7). `qa/lib/*`, `qa/tools/*`, `qa/run-offline.js`, hooks, settings, integrity, `package.json`, `AGENTS.md` and `CLAUDE.md` are byte-identical. No new file under `qa/`. The suite count is unchanged |
| R10 | **Pins come only from the forced replay** (§4 R2): each pin's `source` and its single `environments` entry are the 64-hex values printed by that suite's R2 verdict. A working-tree "dev pin" may be used during development to make suites SKIP while iterating; it is never committed unless equal to the R2 values. The step-13 commit's pins equal R2's printed digests, checked by Codex and recorded in `review.md` |

**Not in scope:**
- any change to what a row asserts;
- AH-16's intermittent failure (hook 8 s budget under load) — it is skipped under a matching pin and still runs in every replay;
- environments other than the one R2 runs in;
- the heavy-lane approval rule for light full runs after E1;
- the GC-4 / FT contracts;
- `AGENTS.md` wording (a sentence may later go into the held governance package).

## 3. QA (rows inside each suite unless stated; every planted negative runs **in memory on copies**, never on real files)

**Sequence — RED before the gate exists.**
1. Write the in-memory rows E1-1…E1-4 first, against a gate function that does not yet exist or is stubbed.
2. Watch them fail; record the result in `qa.log`.
3. Then implement.

| ID | Assertion (each suite) | Planted negative → must fail |
|---|---|---|
| E1-1 Closure | A static scan of the suite's own source finds every `require('./…')` (transitively through each required repo file), every `path.join(ROOT, …)` / `__dirname`-relative path and every repo path read, copied or spawned. Each is a declared R2 part, a fixed-commit read, or a justified dynamic require (R2). Required repo libs require only Node built-ins | (a) a copy with an added `require('./lib/x')`; (b) a copy with a new `path.join(ROOT, 'y')` read; (c) the parts list with one entry removed → `undeclared input` |
| E1-2 Heavy rule | A static scan finds every process-start call site (`spawnSync(`, `execFileSync(`, `execSync(`, `spawn(` as code, not inside string literals) and every call of a fixture builder. Each lies inside a `heavy(` callback, or inside a helper function whose every call site lies inside `heavy(` callbacks (`plan.md` lists these helpers). Allowed exception: the `collect()` probes inside `exec-env-fingerprint.js` | a copy with one heavy row's `heavy(` turned back into `test(` (AH: one heavy block unwrapped) → `unwrapped heavy code` |
| E1-3 Digest sensitivity | A one-byte change to **each** part changes the source digest; a removed part changes it; a change **only inside the pin statement** does not | per-part flips → not `skip`; a pin-literal edit → still the same digest |
| E1-4 Decision table | `e1Decide` returns R4's result for each case: G1, G2, G3, G3+force, G4 for each of the five overrides (empty string = unset), G5, G6 (null source, empty `environments`, a non-hex entry, duplicates), G0 (`true`, `0`, ` 1`) | (a) a variant that ignores overrides; (b) one that lets force skip the G3 FAIL; (c) one that skips on an unproven environment; (d) one that treats an empty pin as valid → each fails the table |
| E1-5 Verdict | Under a matching pin: the SKIP line, and `k` equals the number of `heavy(` registrations reached. Under force: `0 heavy skipped` | a verdict that runs before the heavy rows → caught by the count check |

**Task evidence outside the suites** (scratch under `/tmp/pt-qa-e1-digest-gate/`, deleted after use; outputs in `qa.log` and `review.md`):

| ID | Proof |
|---|---|
| E1-6 Mechanical equivalence | A scratch script undoes the allowed transforms in each suite: E1 code blocks removed, `heavy(` → `test(`, AH heavy wrappers removed. The result must equal the base file (`ba1d259`, byte-identical at `5b33869`) **byte for byte** (LF). Any other difference → STOP |
| E1-7 Spawn census (SKIP mode) | Each of the four suites runs directly with a scratch `--require` preload that counts calls (`child_process.spawnSync` / `execFileSync` / `execSync` / `spawn`, and `fs.mkdtempSync`) by caller file and line. Allowed under SKIP: only `exec-env-fingerprint.js`'s `collect()` probes; and `mkdtempSync` only from `run-tmp.js` `isolate()` and AH's light helpers listed in `plan.md`. Anything else → STOP. These runs are light (they come after the pins are set, R3 window) |
| E1-8 Runtime | From R3's `@@QA-TIMING@@` lines: per-suite ms for the four suites and the total, compared with step 0 |
| E1-9 No cascade | In R3, `git_contract_offline.js` and `fixture_template_offline.js` PASS. Direct runs print `SKIP  (contract pinned: 552ccfc8e1ee/ef28452b4eb8)` and `SKIP  (contract pinned: 288591877fee/ef28452b4eb8) …`. `run_isolation_offline.js`, `pt_land_logic_offline.js`, `pt_land_resync_logic_offline.js` and `run_offline_discovery_offline.js` PASS |
| E1-10 Count consistency | Per suite: forced (R2) `h + n` equals SKIP-mode (R3) `k + n`, with the same `n`. AH forced assertions = 4 265 + the E1 rows' assertions |
| E1-11 Environment scope | Record `FPLIB.collect().digest` and `process.version` in slot B. If they equal `ef28452b…0858` and `v24.14.0` (slot A's record, §1), the pinned `E1_ENV` covers both slots; record "slot A covered". Otherwise record "slot A not proven". Slot A's runs then replay with a notice until a later task adds that environment with evidence — safe, not a STOP |

## 4. Execution order and Owner gates

Owner touchpoints: O-0 … O-5 below. The two heavy-lane go-ahead slots (step 0 and step 10) already exist for every task; E1 merges the forced replay into the step-10 go-ahead (E1-D6), so it adds **no extra interruption**.

| # | Step | Who | Gate |
|---|---|---|---|
| O-0 | Placement: Baseline row re-verified (§1a); exact file and sha256 handed over | COWORK | **Main Control placement approval** (`catalyst-evidence-2-s1` and `ai-output-1-s1a` closed — verified; `surface-1` active and non-overlapping) |
| O-1 | Brief-only commit | Bootstrap / Owner | **Owner R11 `!` record** (the `brief-request` line) |
| 1 | `task-start task/qa-e1-digest-gate` (T1–T5) | Bootstrap | — |
| O-2 → R0 | **Step 0:** full `npm run qa:offline` before any edit; line 1 of `work/qa-e1-digest-gate/qa.log`. Fresh — no reuse unless the Owner rules otherwise. A red baseline is M4. A re-run needs a new heavy-lane go-ahead | Worker B | **Owner heavy-lane go-ahead HL-1** (no other full run active) |
| 2 | `/plan` (row map, R2 justification list, E1-2 helper list); RED (§3 sequence); implement; dev iterations. Direct suite runs that reach heavy rows count as heavy-lane use: during development use a dev pin (R10) or `TB_ONLY` subsets, and run the cross-reader suites (§1) directly — they are light | Worker B | — |
| 3 | Steps 7–9: self-review; Codex step 8 on the real diff; FIX / DEFER / REJECT | Worker B | — |
| O-3 → R2 → R3 | **R2 forced replay:** dev pins reverted to the brief's placeholder `{ source: null, environments: [] }`, no override set, then `PT_QA_FORCE_HEAVY=1 npm run qa:offline`. **Then, only if the R2 pin-initialization checkpoint is valid:** pins set from R2's printed digests (an edit to the four pin statements only), **R3 =** step 10 `npm run qa:offline` without force, then E1-7 and E1-9 direct runs | Worker B | **Owner heavy-lane go-ahead HL-2** covering R2 then R3 (E1-D6) |
| 4 | Step 10a: Backlog `none` — no edit. Step 11 `review.md`. Step 12 final Codex | Worker B | — |
| 5 | Step 13 commit (r9); `node qa/guard_integrity_check.js`. No protected path, so no step 13a | Worker B | r9 gate (no Owner record) |
| O-4 | LAND | Worker B via R12 | **Owner LAND record** |
| O-5 | Push → DEV deploy notice; cleanup | Worker B via R12 | **Owner PUSH record** |

**R2 pin-initialization checkpoint (E1-D11; with placeholder pins, fail-closed by design; never a QA PASS):**
- With the placeholder pin, force does not mask G6: each gated suite reaches `pin invalid`, and every heavy and light row runs.
- The checkpoint is **valid** only if all of these hold:
  - every row and assertion of all four suites PASSes;
  - the four suites fail **only** with the `pin invalid` verdict, each printing its source and `E1_ENV` digests;
  - every other suite PASSes;
  - the suite count is unchanged.
- The digests for the pins are taken from the four `pin invalid: source <64> environment <64>` lines (R4 G6).
- **Digests verified** before the pins are written: each is 64 lowercase hex; an independent scratch recomputation (outside the repo, deleted after use: `FPLIB.digestParts` over the declared R2 parts of the R2 tree, own source with the pin neutralised) reproduces each source digest; each `E1_ENV` equals the R3 formula applied to the E1-11 record. After the pin edit, R3's four SKIP lines — which appear only on exact equality — confirm both digests.
- **Recording:** `qa.log` and `review.md` record R2 as `R2 PIN-INIT CHECKPOINT (valid|invalid) — not a QA PASS`, with the four failing verdict lines verbatim. Only R3 is reported as the full `qa:offline` PASS.

**HL-2 conditions (E1-D6, verbatim intent).** R3 starts within HL-2 only if:
1. the R2 pin-initialization checkpoint is valid (above);
2. E1-1…E1-5 and their planted negatives passed;
3. the pins were set exactly from R2's printed values, and nothing else changed between R2 and R3 (proven by R3's SKIP lines, which require digest equality);
4. no STOP condition and no unexpected change occurred;
5. no other heavy run is active;
6. no existing gate (r9, R11, R12, integrity) is bypassed.

**R3 criterion:**
- full PASS;
- suite count = step 0;
- the four `E1 … SKIP` surfaced lines show the pinned digests;
- GC-4 / FT unchanged (E1-9).

Any other outcome → STOP. Never re-pin from R3.

## 5. STOP (in addition to STOP-1…6)

- Any change outside the four suites (§7), or to a reader-protected function or anchor (§1, R8).
- E1-6 shows any difference beyond the allowed transforms; any row, name or assertion changed.
- A pin set from anything but R2's printed values; a pin left valid while R2 runs; a dev pin committed.
- R2 with any failing row, or any suite failing other than by the expected `pin invalid` verdict. **No automatic retry (E1-D9):** any unexpected forced-replay failure, AH-16 included, is diagnosed and needs an explicit Owner decision before another full run (also for R0).
- R2 reported or recorded as a QA PASS, or a pin written before its digests are verified (E1-D11).
- Any change to the runner or to an existing output line or reporting contract (E1-D10).
- R3 not fully green, any of the four suites not printing SKIP, or GC-4 / FT not printing their unchanged SKIP lines.
- E1-7: a process start or temp directory outside the allowed list.
- R2 or R3 run with any override variable set, or two heavy runs overlapping.
- Any edit to `qa/lib/*`, `qa/tools/*`, `qa/run-offline.js`, hooks, settings or integrity — even "harmless".
- A planted negative satisfied by weakening its assertion.

## 6. Definition of Done

- Step 0 recorded.
- RED recorded.
- E1-1…E1-5 green in all four suites, each planted negative biting.
- E1-6…E1-11 recorded.
- The R2 pin-initialization checkpoint recorded as valid (not a QA PASS), with its verified digests.
- Pins equal to them.
- R3 full PASS (count = step 0) with four SKIP lines and the measured runtime.
- Codex: no unresolved Class I. Codex specifically confirms R2 (parts), R4 (table), R5 / R6 (heavy mapping, no body change), R8 (reader anchors) and R10 (pin provenance).
- **`review.md`:**
  - E1-D1…D7;
  - the parts table;
  - the row map summary;
  - the R2 / R3 records and the E1-6…E1-11 outputs;
  - "slot A covered / not proven";
  - §9 copied verbatim;
  - `## Backlog reconciliation`: none;
  - a LAND-EVIDENCE line.
- Step-13 commit, integrity, LAND, push and cleanup via R12.

## 7. Files, land-scope, land-tests

```
qa/task_base_offline.js              TB_CONTRACT_PIN, parts, gate, heavy(), verdict, E1-1..E1-5
qa/pt_land_offline.js                LAND_CONTRACT_PIN, … (RI-6 anchors and helper functions untouched)
qa/pt_land_resync_offline.js         RESYNC_CONTRACT_PIN, … (RI-6 anchors and buildFixture untouched)
qa/auto_mode_hardening_offline.js    AH_CONTRACT_PIN, … (heavy blocks wrapped, no re-indent)
work/qa-e1-digest-gate/review.md     evidence
```

<!-- land-scope:begin -->
qa/task_base_offline.js
qa/pt_land_offline.js
qa/pt_land_resync_offline.js
qa/auto_mode_hardening_offline.js
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/task_base_offline.js
node qa/pt_land_offline.js
node qa/pt_land_resync_offline.js
node qa/auto_mode_hardening_offline.js
node qa/fixture_template_offline.js
node qa/git_contract_offline.js
node qa/run_isolation_offline.js
node qa/pt_land_logic_offline.js
node qa/pt_land_resync_logic_offline.js
node qa/run_offline_discovery_offline.js
<!-- land-tests:end -->

The land-tests are light once the pins are set.

**Skills:** `pt-offline-suite` **Required**. `/plan` mandatory.

## 8. Effort and risks

- **Effort (Worker B, one attended working day):**
  - `/plan` and row map: 1.5–2 h (AH is 2 928 lines, about 15 heavy blocks);
  - implementation and E1 rows: 3–4 h;
  - Codex rounds: about 1 h;
  - runs: R0 ≈ 22 min, R2 ≈ 22 min, R3 a few minutes.
  - Diff: four files, mostly `test(` → `heavy(` and block wrappers, plus about 120–200 lines of E1 code and rows per suite.
- **False skip from an undeclared input:**
  - **Mitigation:** E1-1 (closure), E1-2 (heavy rule), E1-6 (no body change), E1-7 (census), Codex.
  - **Residual:** inputs outside the digest (OS patches, antivirus, load) — covered by the §9 cadence.
- **Coverage while skipped:**
  - the decision logic of `pt_land` and `pt_land_resync` keeps running in their logic twins (`*_logic_offline.js`) and in GC-4's transcripts;
  - task-base and AH real-Git rows run in every replay;
  - a governance task that edits a part replays automatically (G3).
- **Later governance tasks:** any edit to a part (`pt-land.js`, the hook, settings, integrity, the three libs, a suite) must re-pin the affected suites in its own diff from its own replay, as GC-4 / FT already require. Their briefs list it.
- **Overlap:** never run in parallel with a task that edits a part, or with 3A-L.

## 9. Operating rules after LAND (recorded in `review.md`; no repository automation)

- **Normal product QA:**
  - plain `npm run qa:offline`;
  - never sets `PT_QA_FORCE_HEAVY` or any override;
  - a SKIP is valid only under R4.
- **SHIP** (AGENTS "Owner LAND / SHIP boundaries"):
  - **Definition:** promotion of `branch-dev` → `main` / production. LAND, push and the DEV deploy are not SHIP.
  - **Before SHIP:** one `PT_QA_FORCE_HEAVY=1 npm run qa:offline` on the exact commit to be shipped, run as part of SHIP preparation. It is run either by the Owner in a normal terminal (no extra request), or in an idle Worker slot detached at that commit on one heavy-lane go-ahead requested with the SHIP preparation.
  - **On PASS:** four `REPLAY PASS (forced)` lines with the current pins; this is SHIP evidence. SHIP approval itself stays separate and unchanged.
  - **On failure:** no SHIP proposal; STOP; diagnose; no re-pin.
- **Weekly (E1-D7):**
  - **Due** when no `qa.log` shows a **full replay PASS on the current pins** (all four suites `REPLAY PASS (forced)`, or the passing replay of a task that re-pinned them) within the last 7 days.
  - **When due:** COWORK marks the next task's step-0 go-ahead as **forced** (`PT_QA_FORCE_HEAVY=1 npm run qa:offline`). That task's brief or go-ahead adds one STOP: "a failing heavy row in a gated suite → STOP, not M4".
  - **No other run** is created for it; with no step 0, it stays due.
- **Environments:** a new `E1_ENV` (another machine, Node or Git version) replays with a notice. It is added to a pin only by a later task, with that environment's passing replay as evidence.
