# Brief: qa-lifecycle-v2 — a QA lifecycle with no silent slow-downs (QA tooling and process only)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. DRAFT by the Planner, 2026-10-24, for MAIN's independent intake review. **Nothing here is approved.** Nothing goes to R11 without the Owner. Baseline-dependent values are marked **re-sweep at that LAND tip**, because this brief lands after `worker-permission-profile-1` (WPP-1), which changes the land tool, guard, settings, `AGENTS.md` and two QA files.

**What the Owner sees afterwards:** a full `npm run qa:offline` on a freshly pinned tree finishes in about 2–3 minutes and says, in its own summary, which pinned suites replayed instead of skipping. A LAND-evidence run refuses to pass while any pin is stale. A run that suddenly takes more than twice its usual time is flagged. No product behaviour changes.

| | |
|---|---|
| Problem | Since `qa-pin-decouple-1` (`f0483ee`) a stale pin is a PASS ("replay, re-pin optional") with no forcing function, so any change to a pinned part silently makes later full runs slow (WPP-1: 139 s → 3,470 s). The runner shows only E1 stale lines; heavy proofs ran ~4× per changed suite; the coupling sweep has no digest-part-list class. Detail: MAIN's diagnosis, `intake-main.md` |
| Objective | Deliver the nine Owner-ruled outcomes of §0, each with acceptance tests and a rollback condition, without weakening any test, raising any timeout, or touching the land tool, guard, hooks or settings |
| Depends on | WPP-1 LANDED and pushed. **T = `4c02a7813cf5b159ddd9d1a214017bd49b6668d2`** (`branch-dev` = `origin/branch-dev`) |
| Baseline | T. Line numbers quoted below come from earlier reads: **re-sweep at T** |
| Branch / slot / mode | `task/qa-lifecycle-v2` · **slot A only** (`pt-wt-worker-a`, where `byefmxjcf` ran; route A′ needs it) · **Manual**, attended. PROTECTED needs: see §1 tier table (`.claude/skills/**` only; no hook, guard, settings or land-tool edit) |
| qa:offline | **+1 suite** (`qa/qa_lifecycle_offline.js`, auto-discovered). Step-0 count + 1 = step-10 count; the brief states the delta, it does not hard-code a total |
| Parallel with | nothing that edits `qa/run-offline.js`, a pinned suite, or the land tool. One heavy run at a time (`AGENTS.md` Test commands) |
| Scoring boundary | none touched. No `index.html`, no `services/`, `netlify/**`, scoring, persistence or gates |
| Gate verification | N/A (QA tooling only) |
| Skills | `pt-offline-suite` — **Required** (this task edits the skill itself and six pinned suites' constants) |

## §0 The nine outcomes (Owner ruling 3) — each with acceptance and rollback

| # | Outcome | How (section) | Acceptance (all must hold) | Rollback condition |
|---|---|---|---|---|
| 1 | No stale contract pin at LAND. **Owner ruled Option B (supersedes QD-1 for the runner's default):** plain `npm run qa:offline` FAILS on a stale pin or missing SKIP evidence. **LAND enforcement stays procedural:** MAIN checks the `QA-LIFECYCLE:` line and the run record at land-request; the land tool does not independently enforce it (a later PROTECTED task could) | §2 R2 (default-fail, `--allow-stale`) | the LAND-evidence run is the plain command: PASS, `SKIP` for every pinned suite, `Stale pins: none`; a planted stale input makes the plain command exit 1; the same input with `--allow-stale` PASSes and lists the stale suites; `landEligible` rejects an allow-stale record | the default FAILs a run whose pins are all fresh and whose suites SKIP (false STOP) → revert R2, keep R1 |
| 2 | Visible reporting of every stale suite (E1, FT, GC) | §2 R1 | summary prints a `Stale pins` section naming each suite, kind (E1/FT/GC) and reason; planted negative: synthetic child output with a stale note must appear in the section, and the same output with the line removed must make the test fail | the section prints a suite that SKIPped, or omits one that replayed → revert R1 |
| 3 | Reuse of equivalent verified results | §2 R3 (record + pin-from-record) | a pin is set only from a recorded full-run PASS replay passing all six D3 checks, checked by `qa/tools/pin-from-run.js`; each failing check has a planted negative that makes the tool refuse | the tool prints a pin for a run that is killed, orphaned, FAIL, or whose parts changed → remove the tool, fall back to forced replays |
| 4 | No redundant replays | §3 lifecycle text in `AGENTS.md` | the text names mandatory and redundant runs; measured: ≤1 heavy replay per changed suite per task on this task's own run log | the text contradicts an existing mandatory rule (e.g. step-10 full run, LAND-EVIDENCE) → revert the text |
| 5 | Runtime regression detection | §2 R4 | the runner stores a total-time baseline per environment key and prints `RUNTIME REGRESSION` when total > 2× baseline; planted negative with an injected clock | the flag fires on a normal fresh-pinned run, twice in a row → raise nothing; revert R4 and re-plan the threshold |
| 6 | T1 re-pin of TEMPLATE, GIT, TB, RESYNC | §4 step 1 (route A′, OQ-1) | the step-2 full run prints `SKIP` for all six pinned suites and finishes under 600 s | any suite still reports a stale pin after its re-pin → STOP, no second guess re-pin |
| 7 | Memory safety for any remaining long run | §5 | the heavy-run plan holds; GC-4 resume state is the only mechanism a long run depends on | a run killed twice by the reaper → STOP, return to MAIN with `qa.log` |
| 8 | `pt-offline-suite` gains class (f), digest-part lists | §2 R5 | `coupling-classes.md` and `SKILL.md` carry class (f); the sweep it describes, run on the six pinned suites, finds exactly the suites `pin-deps.js` reports | the skill text contradicts PC-1/PC-2 → revert the skill edit |
| 9 | Everything preserved | §6 | step-10 full `qa:offline` PASS with the step-0 count + 1; Codex review of the actual diff; integrity chain; every Owner gate; `git diff` shows no test weakened and no timeout changed | any removed or loosened assertion, or any changed timeout → STOP |

## §TS Task-start baseline checks (read-only, at T)

| # | Check (all must hold; else STOP and return to MAIN) |
|---|---|
| TS-0 | `branch-dev` = `origin/branch-dev` = T (`4c02a78…`), clean tree, CRLF/LF audit of the files in §1 per `AGENTS.md`/§EOL |
| TS-1 | AH and PL are fresh at T, shown by **WPP-1 step-7 run `byefmxjcf`**: `E1 auto-mode-hardening: SKIP (contract pinned: 5c3fae451171/5257c2271402)` and `E1 pt-land: SKIP (contract pinned: 72a8c0b66d0e/5257c2271402)`, on bytes identical to T for their parts (`git diff 1c37a7f 4c02a78` = the two `source:` pin lines + WPP-1 `review.md`, none a digest part of these suites). **Not** `pin-deps --range`: over a range the tool cannot see that a pin was re-pinned inside it. Not shown → STOP |
| TS-2 | the five-suite digest-part lists at T equal §PIN: `E1_PART_NAMES` of PL (7 parts + own), AH (4 parts + own), and the `for (const rel of [...])` / `parts.push` lists of TEMPLATE, GIT, TB, RESYNC. Any difference → STOP |
| TS-3 | **Step-0 baseline reuse (route A′; Owner exception X-1, not yet granted).** TEMPLATE, GIT, TB and RESYNC are stale at T in the pin sense, so `AGENTS.md:94-97` (Environment: SKIP lines) is not met for them. WPP-1's run `byefmxjcf` (step 7, 105 PASS, exit 0) replayed all four on **T-identical digest inputs**: its tree was `1c37a7f` + the two pin-line edits later committed unchanged. MAIN recomputed TB `0bbf3bef…4993fe` and RESYNC `db3c5f69…f9300` from the T tree with the repo's own `digestParts`; both equal what that run printed. The Tree, Suites and Same-slot conditions of `AGENTS.md:86-106` hold **in slot A only** (where `byefmxjcf` ran and `node_modules` is unchanged). Tree: `git diff 4c02a78..<brief commit>` is `work/**` only (QA-inert), and WPP-1's `review.md` is the only file changed after that run. **X-1 must also cover the Same-slot wording:** slot A's reflog after the run shows commit `4c02a78`, the cleanup detach at `4c02a78`, then the switch onto `task/qa-lifecycle-v2`, while the strict rule allows only "commits and the switch onto this task". The Worker re-verifies by hand and records it as the first `qa.log` line |
| TS-4 | The digest parts of the four suites are byte-identical between `byefmxjcf`'s tree and T: TB/RESYNC parts are `E1_PART_NAMES` (non-suite files) + own neutralised text; TEMPLATE and GIT digest only **extracted functions** of the PL/RESYNC suites (`fixture_template_offline.js:232-243`, `git_contract_offline.js:403-413`), and the pin statements are outside those functions. Check: `git diff 1c37a7f T` = exactly the AH and PL `source:` lines + WPP-1 `review.md`; the PL change is the top-level `const LAND_CONTRACT_PIN` at `pt_land_offline.js:225`, outside every extracted function (`buildFixture` :71 and the `LAND_HELPER_NAMES` functions); all other parts are byte-identical |
| TS-5 | `grep -c` of the literals this brief anchors on (§2) each equals the count stated there; `--allow-stale`, `PT_QA_RECORD_DIR` and `qa-lifecycle` occur nowhere in the repo yet. **Runner-spawning suites** (e.g. `run_offline_discovery`, `run_isolation`; Grep `qa/` for `run-offline` spawns) must still pass with the new default: they use fixtures; the Worker confirms at T by reading each and by the step-2 run |

## §PIN Contract-pin dependencies (PC-1 / PC-2; output of `pin-deps.js`, re-run by MAIN)

Tool: `node C:/Users/Owner/Documents/Pulse-Planning/tools/pin-deps.js --repo C:/Users/Owner/Documents/Project/portfolio-tracker --brief <this brief> --timings <ref>`, ref = `…/f9509d9e-da80-4415-92d6-cbdafba307c3/tasks/bh96e21pi.output`. Run on this draft's `land-scope` block; **re-run by MAIN at T**.

| Suite | Pin | Status from this brief's files | Disposition |
|---|---|---|---|
| `qa/fixture_template_offline.js` | `TEMPLATE_CONTRACT_PIN` | tool: "self", digest-neutral (pin statement neutralised, `fixture_template_offline.js:240`); stale at T in the pin sense | **re-pin in scope** (§4 step 1): pin constant only, from a single-suite stale-replay NOTE line at T (~6 min) |
| `qa/git_contract_offline.js` | `GIT_CONTRACT_PIN` | tool (fixed, sha256 `160447cf…`): "self-excluded: not stale" — `sourceParts()` (`git_contract_offline.js:403-413`) does not read its own text. Stale at T in the pin sense | **re-pin in scope**: pin constant only, from a single-suite run at T that resumes all 16 GC-4 batches from the state file (seconds) and prints its `NOTE  pin stale … source … environment …` line. Its parts include `qa/tools/record-git-transcripts.js`: not edited; the new tool is another file |
| `qa/task_base_offline.js` | `TB_CONTRACT_PIN` | tool: "self", digest-neutral (`e1OwnNeutral`, `task_base_offline.js:300`) | **re-pin in scope**: from `byefmxjcf`'s printed digest `0bbf3bef…` (MAIN-recomputed from T) |
| `qa/pt_land_resync_offline.js` | `RESYNC_CONTRACT_PIN` | tool: "self", digest-neutral (`pt_land_resync_offline.js:276`) | **re-pin in scope**: from `byefmxjcf`'s printed digest `db3c5f69…` (MAIN-recomputed from T) |
| `qa/pt_land_offline.js` | `LAND_CONTRACT_PIN` | not in scope; REVIEW hit `AGENTS.md` at lines 1829/1833/1835 is a fixture string (`buildApprovedLandFixture('oag15', 'AGENTS.md', …)`), not a digest part | **no stale** if fresh at T (TS-1) |
| `qa/auto_mode_hardening_offline.js` | `AH_CONTRACT_PIN` | not in scope; REVIEW hits `qa/run-offline.js` (line 3642) and `AGENTS.md` (769, 3470, 3642) are fixture command strings, not digest parts (its parts: guard, settings, `guard_integrity_check`, `exec-env-fingerprint`) | **no stale** if fresh at T (TS-1) |

**Re-run at T with the fixed tool (sha256 `160447cf…`, output in `pin-deps-output.txt`):** the "STALE" rows for TEMPLATE, RESYNC and TB are pin-only self-edits, which the tool states are digest-neutral; GIT is "self-excluded: not stale". Its "~20 min" estimate therefore does not apply: no suite is replayed in full by this task. REVIEW hits moved at T (`run-offline.js` 3681/4458, `AGENTS.md` 769/3509/3681 for AH; `AGENTS.md` 2015/2019/2021 for PL) and are the same fixture strings. The reading below was done at `9d98734`: **the Worker re-confirms at T**.

**REVIEW hits resolved by reading (4 of 4):** (1)–(2) the AH hits and (4) the PL hit are fixture strings, above. (3) `fixture_template_offline.js` ← `qa/pt_land_resync_offline.js` (lines 139–140, `RS_SRC_BASE`/`RS_SRC_NOW`): TEMPLATE digests only the extracted function `buildFixture` of RESYNC (`fixture_template_offline.js:238`, parts `resync-now:buildFixture` and `resync-base:buildFixture`), and FT-2 uses the whole source as a fixture builder input. The RESYNC edit here is the `RESYNC_CONTRACT_PIN` statement only, outside `buildFixture`, so TEMPLATE's digest does not move. **Planted check for the Worker (no heavy run):** after the RESYNC pin edit, `git diff` of that file shows no hunk inside `buildFixture`; and the step-2 full run shows TEMPLATE's own SKIP line, so any surprise surfaces there. **Re-sweep at T** (WPP-1 touches 2 QA files).

Final check, one line: **after step 1 no digest pin includes a changed file**: `qa/run-offline.js`, `qa/lib/qa-lifecycle.js`, `qa/tools/pin-from-run.js`, `qa/qa_lifecycle_offline.js`, `AGENTS.md` and the two skill files are in no suite's digest parts (`qa/lib/exec-env-fingerprint.js`, `qa/lib/run-tmp.js`, `qa/lib/spawn-meter.js`, `qa/lib/fixture-template.js`, the guard, hooks and settings are **not** edited). Re-check with `--range <T>..<tip>` before LAND; a hit is a STOP.

**PC-2 statement:** every full `qa:offline` is expected under 600 s once step 1 is done (≈ 139 s measured fresh-pinned; the new suite adds < 2 s). The only non-trivial run before that is the TEMPLATE single-suite run (~6 min, foreground); the plan is §5. For reference, a stale replay of all four suites would cost ≈ 44 min extra (TEMPLATE ≈ 378 s, GIT ≈ 1445 s without GC-4 state, RESYNC ≈ 273 s, TB ≈ 520 s); route A′ avoids it.

**PC-1 supersession (stated, per advisor review):** `BRIEF-PREFLIGHT-CHECKS.md` PC-1 rule 2 currently allows "accepted stale replay" as a disposition. Outcome 1 ends that disposition **for LAND**: after this task, a stale pin at LAND is a STOP. Matching Planner-side edits (outside the repo, done by the Planner/MAIN, **not** the Worker): amend PC-1 rule 2 and the closing line of `pin-deps.js` ("accepted, disclosed stale replay") so a brief may accept a stale replay only for *intermediate* runs, never for the LAND-evidence run; extend `pin-deps.js` `PARTS_HINT` with the class (f) shapes of R5. Listed in §7.

## §1 Files (exactly) and tiers

| Path | Change | Tier / gate |
|---|---|---|
| `qa/run-offline.js` | R1, R2, R4 (§2): stale-note parsing, summary section, default-fail + `--allow-stale`, baseline compare | **ASK** tier |
| `qa/lib/qa-lifecycle.js` (new) | pure functions: `parseStaleNotes`, `staleVerdict`, `landEligible`, `runtimeVerdict`, record/baseline store | ordinary |
| `qa/tools/pin-from-run.js` (new) | R3: checks 1–6, prints the pin text; **never writes a repo file** | ordinary |
| `qa/qa_lifecycle_offline.js` (new) | the suite for all of the above; no process spawns, no real Git | ordinary |
| `qa/fixture_template_offline.js`, `qa/git_contract_offline.js`, `qa/task_base_offline.js`, `qa/pt_land_resync_offline.js` | **pin constant only** (T1) | ordinary; one-statement edit each |
| `AGENTS.md` | the Test commands lifecycle text (§3), nothing else | **ASK** tier |
| `.claude/skills/pt-offline-suite/SKILL.md`, `.claude/skills/pt-offline-suite/references/coupling-classes.md` | R5, class (f); "five classes" → "six" | **PROTECTED** (`.claude/**`) |
| `work/qa-lifecycle-v2/review.md` | evidence only | ordinary |

**Forbidden:** `.claude/hooks/**`, `.claude/settings*.json`, the land tool and guard, `qa/lib/exec-env-fingerprint.js`, `qa/lib/run-tmp.js`, `qa/lib/spawn-meter.js`, `qa/lib/fixture-template.js`, `qa/guard_integrity_check.js`, `qa/pt_land_offline.js`, `qa/auto_mode_hardening_offline.js`, every other `qa/**` suite, `index.html`, `services/**`, `netlify/**`, `package*.json`, `CLAUDE.md`, `work/*/brief.md` (protected after commit), `BACKLOG.md`. No timeout is raised. No assertion is removed or loosened. The runner's existing output lines are not altered or reordered; new lines are additive.

**Protected-boundary needs:** PROTECTED approval for the two `.claude/skills/**` files (a separate Owner-typed `!` line, exactly as for earlier skill tasks). If the Owner declines that approval, the task does not land partially (§L); the skill edit can be split into its own task by returning the brief to the Planner (OQ-4).

**§EOL:** per file, read `git ls-files --eol` at T; edit with Edit/Write only; byte-audit every touched file (`grep -c $'\r$'` is not proof).

## §2 Design (normative; every quoted literal is exact; every anchor occurs once at T, re-verified by Grep in TS-5)

### R1 — stale reporting (outcome 2)
The runner's Phase 2 loop drops a passing suite's stdout except `@@QA-SURFACE@@` lines (`qa/run-offline.js:399-402`). Three stale shapes exist today:
- E1 suites (AH, PL, RESYNC, TB): `@@QA-SURFACE@@ E1 <label>: REPLAY PASS (pin stale, re-pin optional) src … env …` (already echoed).
- FT: `  NOTE  pin stale (every heavy proof above ran against real Git): source … environment …; re-pin optional` (`fixture_template_offline.js:526`).
- GC: `  NOTE  pin stale (every transcript replayed identically against real Git in <n> batches): source <digest> environment <digest>; re-pin optional` (`git_contract_offline.js:686`; printed only after every batch is complete).

**The six SKIP literals, verbatim from the suites at drafting (re-verified by Grep at T, TS-5):**
- AH `qa/auto_mode_hardening_offline.js:419`, PL `qa/pt_land_offline.js:566`, RESYNC `qa/pt_land_resync_offline.js:597`, TB `qa/task_base_offline.js:621`: `@@QA-SURFACE@@ E1 <label>: SKIP (contract pinned: <12 hex>/<12 hex>) <counts>` (labels `auto-mode-hardening`, `pt-land`, `pt-land-resync`, `task-base`).
- TEMPLATE `qa/fixture_template_offline.js:520` and GIT `qa/git_contract_offline.js:675`: `  SKIP  (contract pinned: <12 hex>/<12 hex>)` (TEMPLATE appends ` <n> heavy real-Git row(s) not run`). These two are plain child stdout, which the runner has today and discards; parsing child stdout needs no suite edit.

**The suites are not edited** (editing them would stale the very pins this task re-pins). The runner parses these exact existing shapes with `parseStaleNotes(stdout)` in `qa/lib/qa-lifecycle.js`, returning `{kind, reason}` for: E1 `REPLAY PASS (pin stale`, E1 `REPLAY PASS (environment not pinned` / `(override`, FT/GC `NOTE  pin stale`, FT/GC `NOTE  environment not pinned`. A pinned suite whose stdout contains none of the six SKIP literals above and no recognised note is reported as `no-skip-line` — so a suite that changes its wording cannot make itself invisible, and the format-pinning assertion below fails first. **False-STOP guard:** a fresh-pinned tree must report all six as SKIP; the step-2 plain run (§4) is the proof, and the rollback of outcome 1 covers a miss.
The summary gains, after the timing summary and before `=== Summary ===`, a section `Stale pins` listing each non-SKIP pinned suite with kind and reason, or the single line `  none`.
**Format pinning:** a literal-text assertion in the new suite reads each of the three suites' source and asserts the note literal still exists there (class (e) coupling, recorded in the sweep) — a wording change fails the new suite instead of silently blinding the runner. The set of pinned suites is **derived** (every top-level suite whose source declares `const <NAME>_PIN = {`), then compared with a fixed list of the six in the runner; a seventh pinned suite fails the test rather than going unreported.
**Planted negatives (synthetic child stdout, a fixture input per `.claude/rules/qa-suites.md`):** (a) stale E1 line → listed; (b) FT note → listed; (c) GC note → listed; (d) a pinned suite's stdout with no SKIP and no note → listed `no-skip-line`; (e) all six SKIP → `none`.

### R2 — default-fail on stale pins, `--allow-stale` for intermediate runs (outcome 1; Owner Option B, supersedes QD-1 for the runner's default)
1. **Default.** Plain `npm run qa:offline` FAILS when any pinned suite is stale **or** lacks valid SKIP evidence (R1's `no-skip-line` counts as a failure): a hard failure `stale-pin: <suite> (<kind>)`, the run ends `OFFLINE VALIDATION: FAIL (… hard failure(s))`, exit 1, with the line `LAND STOP: stale pin(s) — re-pin with proof; see AGENTS.md Test commands`.
2. **`--allow-stale`** is a runner **argv flag**, never an environment variable (no `VAR=value` command prefix, which is a known approval-prompt source). It is not inherited by the spawned suites, so it cannot reach any digest (`E1_OVERRIDE_VARS`, `GIT_*`, `ENV_NAMED` at `exec-env-fingerprint.js:27` are all unaffected). Its name contains no `pt-land` text (guard R12 trigger `/pt-land/i`, `pretooluse-guard.js:1348`); the flag name must never contain that substring. An unknown flag is a runner error. It is allowed **only** for explicitly identified intermediate runs: step 0 when PC-1 says pins are stale, and step 10a. With it, stale suites are listed in the `Stale pins` section and the run PASSes (QD-1 behaviour, now opt-in).
3. **Run record and eligibility.** Every PASS run writes a record (R3) with `mode: "default"` or `mode: "allow-stale"`. An allow-stale record is usable by `pin-from-run` but **NEVER qualifies as LAND evidence**. `landEligible(record)` in `qa/lib/qa-lifecycle.js` is true only for `mode: "default"`, all six pinned suites SKIP, PASS, exit 0 and the expected suite count. The `QA-LIFECYCLE:` line carries `mode=default` and the run id.
4. **LAND evidence = the plain default command** (allow-listed, no prompt): PASS, six SKIP, `Stale pins: none`.
5. **Limitation, stated plainly:** LAND enforcement stays **procedural**. MAIN checks the `QA-LIFECYCLE:` line and the record (`landEligible`) at land-request. The land tool does not independently enforce it; a later PROTECTED task could. Under route A′ this task itself uses `--allow-stale` zero times.
**Why in the runner, not the land tool:** the land tool and guard are `.claude/**` (protected).
**Planted negatives (synthetic child stdout):** default + stale input → FAIL and the `LAND STOP` line; default + a pinned suite with neither SKIP nor a recognised note (`no-skip-line`) → FAIL; `--allow-stale` + stale input → PASS and the suite listed; default + all six SKIP → PASS; `landEligible` rejects an allow-stale record, a FAIL record, a record with a non-SKIP suite and a wrong suite count, and accepts a default all-SKIP PASS record; unknown flag → runner error; the new suite asserts the runner passes no new variable to the spawned children (spawn options read from the source text). Step 2's plain run is the end-to-end proof.
**Header truth:** the runner header says it "only reads repo files" (`run-offline.js:5`). R3/R4 write state outside the repo on a PASS run, so the header comment is updated in the same edit. Grep of `qa/*_offline.js` found no assertion that the runner does not write. The record and baseline are **persistent state on the GC-4 precedent** (`..\pt-work-artifacts\…`), not temporary harness files, and are never committed.

### R3 — record + pin from record (outcome 3; generalises the GC-4 pattern)
GC-4 persists results by key `(source digest, environment digest, ids)` in a state file outside the repo (`..\pt-work-artifacts\…`). R3 does the same at run level:
1. The runner, **only on a run that ends `OFFLINE VALIDATION: PASS`, exit 0, with no override variable set**, atomically writes `run-record.json` (write + rename) to `PT_QA_RECORD_DIR` (default `..\pt-work-artifacts\qa-lifecycle\`, outside the repo; tests use a temp dir): run id, `git rev-parse HEAD`, `git status --porcelain` empty flag, suite count, total ms, and per pinned suite `{gate, src, env, heavyRows, lightRows, skipped, partHashes}` (`partHashes`: check 3 below) parsed from the suite's own printed digests (E1 lines carry `src … env …`; FT/GC notes carry `source … environment …`). A killed or orphaned run never writes one (the write is the last step).
2. `node qa/tools/pin-from-run.js --record <file> --suite <name>` checks the six D3 conditions and prints the exact pin statement (it edits nothing):
   1. the suite's stale line shows a **complete** replay, per kind: E1 (AH, PL, RESYNC, TB): `REPLAY PASS (pin stale…)`, `0 heavy skipped`, heavy/light counts equal the suite's own; FT: `NOTE  pin stale (every heavy proof above ran against real Git)` with `skippedHeavy` 0 (the note is printed only on `replay-stale`, where the code asserts it); GC: `NOTE  pin stale (every transcript replayed identically against real Git in <n> batches)` — printed only after every batch is persisted/complete (`pinEligible`, `git_contract_offline.js:472-473`);
   2. the record is a complete PASS run with the expected suite count;
   3. every digest part is unchanged since the run, by **content hash, not by Git**: the record stores, per pinned suite, a sha256 of every digest-part file (LF-normalised; a suite's own file is hashed with **all** `const *_CONTRACT_PIN = {…};` statements neutralised, so pin edits do not count). `pin-from-run` recomputes them from the working tree; any mismatch → refuse → forced replay. No HEAD or clean-tree requirement, so it works on the uncommitted work of a normal task. For TEMPLATE and GIT (which digest only extracted functions of PL/RESYNC) the whole PL/RESYNC files are hashed — a conservative superset. Parts list from class (f) discovery (R5), not typed;
   4. the printed environment key is unchanged and is in the pin's `environments` list (or the Owner has ruled to add it);
   5. (checked later, by R2) the next full run must SKIP that suite;
   6. the output prints the text for `review.md` (run id, line, checks 1–5).
3. A forced replay stays required when any check fails or the suite was not replayed in the record.
**Reuse is never a pass:** a recorded result never satisfies outcome 1; only a SKIP in the run itself does. The pin is the only thing a later run trusts, and it still goes through the suites' own digests.
**Normal lifecycle (uncommitted final tree):** step 10a full `--allow-stale` run → record (`mode: "allow-stale"`) written → `pin-from-run` recomputes the part hashes from the same working tree → pin edits (digest-neutral) → step 10b the plain default run, all SKIP (the LAND evidence) → step-13 commit.
**Planted negatives (each makes the tool refuse):** killed-run record (no final flag); FAIL record; wrong suite count; **one digest part changed after the record** (temp files in the test); environment key not in the pin; `heavy skipped` ≠ 0; row counts differ. **Planted positive:** a **pin-only edit** (a `*_CONTRACT_PIN` statement changed) is accepted.
**Scope note:** GC-4-style per-batch persistence for the other five suites is **not** built here: only GIT exceeds 600 s alone, it already has it, and the other four fit once the pins are fresh. Evaluated, not adopted (§8 OQ-5).

### R4 — runtime regression flag (outcome 5)
The runner already measures `totalMs` (`printTimingSummary`). R4 compares it with `runtime-baseline.json` in `PT_QA_RECORD_DIR`, **keyed by the environment key** (`FPLIB.collect().digest`; runtimes depend on the host, and `collect()` costs 2 Git starts — about 0.3 s). Rules: baseline is written/updated only by a run that PASSed, with R1 `none` (fresh-pinned); a run with stale pins never updates it (otherwise slow becomes normal). `total > 2 × baseline` prints `RUNTIME REGRESSION: <total> s vs baseline <base> s (<ratio>×)` in the summary; no baseline prints `runtime baseline: none for this environment — recorded`. The flag is **advisory in ordinary runs and listed in LAND evidence**; it is not a hard failure, because host load (reaper pressure, other sessions) can double a run without any pin being stale (OQ-2 asks the Owner whether LAND should fail on it).
**Planted negatives (injected clock and baseline):** 2.01× → flag; 1.99× → no flag; a stale-pin run does not overwrite the baseline; a different environment key reads no baseline.

### R5 — `pt-offline-suite` class (f), digest-part lists (outcome 8)
Add class **(f) digest-part lists** to `references/coupling-classes.md`, and change "five classes" to "six" in `SKILL.md` (lines 3 and 105 at drafting; **re-sweep at T**; Grep found no `qa/` suite asserting the literal "five classes" or "(a)–(e)", so no suite pins this text — TS-5 re-checks).
Class (f): **Looks like** a named array of repo paths that a suite hashes together with its own text — `E1_PART_NAMES = [`, a `for (const rel of [` loop, `parts.push(`, `digestParts(`, `_SOURCES = [` (the exact shapes `pin-deps.js` `PARTS_HINT` matches). **Grep:** those shapes across `qa/*.js`. **Known instances (re-verify):** AH (4 parts), PL (7), and the TEMPLATE, GIT, TB, RESYNC lists. **Trips on:** *any* byte change in a listed file, **including a comment**, turns the suite's pin stale and its next full run into a replay (≈ 4.5–24 min each on this host). **Procedure:** list every pinned suite; run `pin-deps.js` on the planned file set; each STALE row needs a disposition (PC-1 as amended, §PIN); a suite on the list that is in scope needs its re-pin step ordered **before** the first post-change full run (PC-2 rule 3). Aligned with `BRIEF-PREFLIGHT-CHECKS.md` PC-1/PC-2 and `tools/pin-deps.js`; the sweep's own grep patterns are the tool's `PARTS_HINT`. The "Reporting a hit" block adds one column: *stale if tripped? (suite · pin)*.

## §3 `AGENTS.md` "Test commands" lifecycle text (outcome 4; ASK tier; quoted text is exact, replaces nothing existing — appended after the "Check before every heavy run" list)

```
- **QA lifecycle (mandatory vs redundant runs).**
  - Mandatory per task: one full `npm run qa:offline` at step 0 (or the allowed baseline reuse); the
    targeted tests for the changed area; and the step-10 run on the final synchronised tree, which is
    the plain `npm run qa:offline` (the LAND-evidence run: PASS, all pinned suites SKIP, `Stale pins: none`).
  - If a pinned suite's digest part changed since the last full run, step 10 is two runs: **10a** a
    `npm run qa:offline -- --allow-stale` full run (also at step 0 when PC-1 says pins are stale) (replays the stale suites once; it PASSes, so V4 is not triggered), then
    re-pin from its record (`node qa/tools/pin-from-run.js`), then **10b** the plain run. Otherwise
    step 10 is the plain run alone. An `--allow-stale` record never qualifies as LAND evidence.
  - Redundant (do not run): a forced replay of a suite the previous full run already replayed on
    the same bytes (use `node qa/tools/pin-from-run.js`); a second full run on an unchanged tree;
    a heavy suite run alone after it was just replayed by a full run.
  - A pin is set from a forced replay, or from a recorded full-run PASS replay that passes all six
    checks of `pin-from-run.js`. Re-pin at the earliest safe step so later full runs SKIP.
  - At LAND no pinned suite may print a stale-pin or environment note: the plain run shows SKIP
    for every pinned suite, otherwise LAND STOP. The runner summary lists any stale suite
    (E1, FT, GC) and flags a total above twice the stored baseline.
```
Existing wording ("A heavy run is …", "One heavy run at a time", the pre-run check, the 4 GB check of PC-2) is unchanged. MAIN checks that no existing AGENTS.md rule is contradicted (outcome 9).

## §4 Steps (ordered so every full run after step 1 SKIPs)

| Step | Action | Heavy? |
|---|---|---|
| 0 | §TS checks at T. **Baseline = WPP-1 run `byefmxjcf`, reused under `AGENTS.md:86-106`** (route A′; needs exception X-1, OQ-1): the Worker records the four reuse conditions, the TS-3/TS-4 evidence and count N on `qa.log` line 1. No new full run | 0 |
| 1 | **T1 re-pin of TEMPLATE, GIT, TB, RESYNC, one at a time (needs exception X-2, OQ-1).** **TB, RESYNC:** pin from `byefmxjcf`'s printed digests, after the Worker re-derives each by hand with the repo's `digestParts` (D3 checks 1–4 of §2 R3: complete replay line, PASS run, parts byte-identical, environment key in the pin's `environments`). **GIT:** `node qa/git_contract_offline.js` once at T (resumes the 16 persisted GC-4 batches, seconds) and take `source`/`environment` from its `NOTE  pin stale` line. **TEMPLATE:** `node qa/fixture_template_offline.js` once at T (~6 min, foreground, §5 preflight) and take the digests from its NOTE line. Edit only the pin constant. These are evidence-producing runs of an unedited tree, not forced replays. **If X-2 is declined:** `PT_QA_FORCE_HEAVY=1` forced replays, TB ≈ 8.7, RESYNC ≈ 4.6 min extra | 2 single-suite (≈ 6 min + seconds) |
| 1a | Revert proof per suite: the suite's own in-suite pin-edited row (`pt_land_offline.js:631`-style) already proves a changed pin moves the gate; confirm it exists and passes for each of the four; **no extra heavy revert run** | 0 |
| 2 | Full `npm run qa:offline` (foreground, < 600 s expected): the four E1 suites print their `SKIP (contract pinned: …)` lines; the runner discards TEMPLATE's and GIT's SKIP lines (R1 not built), so afterwards run `node qa/fixture_template_offline.js` and `node qa/git_contract_offline.js` once each (≈ 1–2 s SKIP runs, allow-listed forms, heavy-run check before each) and record their `SKIP (contract pinned: …)` lines in `qa.log`. Record the total as the first fresh-pinned time. Any suite still stale → STOP, no second-guess re-pin | 1 + 2 SKIP runs (≈ 2.5 min) |
| 3 | Implement R1, R2, R4, `qa/lib/qa-lifecycle.js`, `qa/qa_lifecycle_offline.js` (runner is ASK tier: Owner approval prompts expected) | 0 |
| 4 | Targeted: `node qa/qa_lifecycle_offline.js` (no spawns, < 2 s) — all planted negatives, plus the mutation proof: each production-side mutation (drop the FT pattern; drop the default failure; threshold 2× → 3×) makes the named row fail, then is reverted | 0 |
| 5 | Implement R3 `qa/tools/pin-from-run.js` + its negatives in the same suite | 0 |
| 6 | `AGENTS.md` §3 text (ASK); skill class (f) (PROTECTED approval line typed by the Owner) | 0 |
| 7 | `pin-deps.js --range T..tip` (MAIN): zero STALE; any hit → STOP | 0 |
| 8 | Codex review of the actual diff (two diffs per `AGENTS.md`), findings classified; fix in scope | 0 |
| 9 | Final tree synchronised with `branch-dev` per `AGENTS.md` (conflict → STOP) | 0 |
| 10 | **LAND-evidence run** (digest parts untouched since step 2, so no 10a; `pin-deps --range` of step 7 proves it): the **plain** `npm run qa:offline` (allow-listed, no prompt): PASS, count N+1, `Stale pins: none`, all six SKIP, no `RUNTIME REGRESSION`; first run also records the baseline for this environment key. If the runner's R1 section is not yet trusted, also record the two single-suite SKIP lines as in step 2. Then in the committed `review.md`: the **exact existing** line `LAND-EVIDENCE: qa-offline=PASS <N+1>; targeted=PASS; codex-classI-unresolved=0` (the only form the land tool accepts) plus a **separate** line `QA-LIFECYCLE: mode=default run=<id> stale=0 pinned_skip=6/6 total_s=<n> regression=none`, integrity chain, land-request, Owner LAND | 1 (~2.5 min) |

## §5 Heavy-run plan (minutes and memory checkpoints)

No long background run is planned. Every run is under 600 s and foreground. **Re-sweep timings at T** (reference: `pin-deps.js --timings`).

| Run | Expected | Where | Checkpoints |
|---|---|---|---|
| H1 `git_contract` single-suite (step 1) | seconds (all 16 GC-4 batches resume; 1.1 s at WPP-1 step 7). If the state file is gone or its key differs: ~24 min, **then background**, resumable, kill loses ≤ 1 batch | foreground | before: MAIN free RAM ≥ 4 GB (`wmic OS get FreePhysicalMemory`), 0 `qa:offline`/`*_offline.js` processes, no orphans of a killed run, idle Claude sessions listed for the Owner to close; GC-4 logs `free … MB before` per batch and STOPs below 2048 MB; after: exit code, printed digests |
| H2 `fixture_template` single-suite (step 1) | ~6.3 min (378 s) | foreground | same preflight and after-checks |
| H3 step-2 full run | ~2.5 min | foreground | same preflight |
| H4 step-10 plain full run | ~2.5 min | foreground | same preflight |

**Heavy-run count:** 4 (≈ 12 min), against ≈ 55 min for a fresh step-0 stale replay or ≈ 99 min with forced replays. **Memory rule (decision):** 4 GB free is MAIN's *start* gate (PC-2, covers other sessions); 2048 MB is the *in-run* floor GC-4 already enforces. Both stay; neither is lowered. A run killed by the idle-reaper or system pressure is **not evidence**, even if orphans finish; clean up and repeat (GIT resumes). Never two heavy runs at once; order H1 → H2 → H3 → H4.

## §6 Preserved (outcome 9)
All mandatory QA stays: step-0/step-10 full runs, targeted tests, the in-suite pin-edited and planted-negative rows, `LAND-EVIDENCE`, the integrity chain, Codex review of the actual diff, and every Owner gate (brief approval, PROTECTED, LAND, push, any Netlify write, any main/production change). No test is weakened; no timeout is raised; no suite is skipped except by a matching valid pin, as today. The default-fail plain run is **additional rigor** (stale = FAIL), not less. Netlify/live canaries/SEC: none involved.

## §7 Non-repo deliverables (Planner/MAIN, outside the Worker's scope; listed for completeness)
- `BRIEF-PREFLIGHT-CHECKS.md` PC-1 rule 2 amendment and a new line in PC-2 pointing at the lifecycle text.
- `tools/pin-deps.js`: closing line wording; `PARTS_HINT` aligned with class (f).
- D3 proposal `D3-pin-from-full-run-proposal.md` marked **absorbed into qa-lifecycle-v2** once the brief is approved.
- `pin-deps.js` over a `--range`: report "pin statement changed in range: verify freshness from the run evidence", because the tool cannot see a re-pin inside the range (e.g. `9d98734..4c02a78` shows AH/PL STALE). The tool's GIT self-exclusion fix (sha256 `160447cf…`) is already in.
- A seventh-suite check: `pin-deps.js` and the new suite both derive the pinned set from `_PIN = {` declarations.

## §8 Governance conflicts and open questions for the Owner (stated, not silently resolved)

| # | Item | Recommendation |
|---|---|---|
| OQ-1 | **Two Owner exceptions to request (neither granted yet), because D3 is not in force until this task lands.** **X-1:** reuse WPP-1 run `byefmxjcf` as the step-0 baseline, waiving the `AGENTS.md:94-97` Environment SKIP condition for the four known-stale suites (evidence: TS-3/TS-4, MAIN's recomputation). Narrow: this task only. **X-2:** pin from evidence (D1 precedent: WPP-1 `review.md`, LAND_CONTRACT_PIN): TB/RESYNC from `byefmxjcf`'s digests; GIT/TEMPLATE from single-suite NOTE lines at T. Neither removes a mandatory check: the step-2 full run must show SKIP for all six, and step 10, Codex, the integrity chain and every Owner gate stay | Grant X-1 and X-2 (route A′, ≈ 12 min of heavy work). If declined: fresh step-0 full run (≈ 55 min, background) and forced replays (route B, ≈ 99 min) |
| OQ-7 | **SUPERSEDED by Option B.** (Was: allow-rule friction for `-- --strict-pins`.) The LAND run is now the allow-listed plain `npm run qa:offline`, so no new allow rule is needed. `--allow-stale` runs prompt but are rare: zero in this task under route A′ | none |
| OQ-2 | Should `RUNTIME REGRESSION` fail LAND? | No: advisory, cited in LAND evidence; false STOPs from host load cost more than they save |
| OQ-3 | **DECIDED by the Owner: Option B** (plain run FAILs on a stale pin; `--allow-stale` only for step 0 / 10a), superseding the 2026-10-14 ruling QD-1 (stale pin = PASS with a notice) for the runner's default. The old opt-in `--strict-pins` wording is **superseded** and must not appear in the implementation. **LAND enforcement remains procedural:** MAIN checks the `QA-LIFECYCLE:` line (`mode=default`, run id) and the record at land-request; the land tool does not independently enforce it. Tool-level enforcement is `.claude/**` and a later PROTECTED task | recorded; no further decision needed |
| OQ-4 | Skill class (f) is the only PROTECTED part. Split into its own task if PROTECTED is declined | Keep together; split only on decline |
| OQ-5 | GC-4-style batching for the other five suites | Not adopted; revisit only if a non-GIT suite alone exceeds 600 s |
| OQ-6 | Record/baseline directory `..\pt-work-artifacts\qa-lifecycle\` is outside the repo (GC-4 precedent) | Accept; tests use a temp dir via `PT_QA_RECORD_DIR` |

## §9 Definition of Done and success metrics
Measured on this task's own `qa.log`:
- full `qa:offline` on a fresh-pinned tree **≤ 3 min** (steps 2 and 10);
- **0 stale notes at LAND**: the step-10 plain run shows 6 SKIP and `Stale pins: none`;
- **≤ 1 heavy replay per changed suite per task**: route A′ = 1 for TEMPLATE and 0 new for TB, RESYNC, GIT (WPP-1's run was the one replay); forced replays would be 2;
- **0 reaper kills** during the task (any kill → the run is repeated and the count reported);
- step-10 suite count = step-0 count + 1; Codex findings resolved; integrity chain green.
Benchmark lines in `review.md` (deviation = test failure): `LAND-EVIDENCE: qa-offline=PASS <N+1>; targeted=PASS; codex-classI-unresolved=0` (exact, once) and, separately, `QA-LIFECYCLE: mode=default run=<id> stale=0 pinned_skip=6/6 total_s<=180 regression=none`.

## §10 External QA runner (Owner ruling 4)

Evaluation only and **not task scope**: see `external-runner-evaluation.md` in this folder (separate planning note).

## §UER Execution readiness

**ATTENDED-ONLY.** Mode: **Manual** (ASK-tier files `qa/run-offline.js` and `AGENTS.md`; PROTECTED `.claude/skills/**`).

**§L:** no partial land. (If the Owner declines the PROTECTED skill edit, MAIN returns the brief to the Planner to split it out — OQ-4.)

**auto-edit-scope** (R15 grants only these paths, plus `plan.md`, `codex.md`, `qa.log` and scratch; never "allow all edits" in the slot): test files, the new lib/tool and evidence. `qa/run-offline.js` (ASK), `AGENTS.md` (ASK) and the two skill files (PROTECTED) are deliberately **not** listed and prompt on every edit.

<!-- auto-edit-scope:begin -->
qa/lib/qa-lifecycle.js
qa/tools/pin-from-run.js
qa/qa_lifecycle_offline.js
qa/fixture_template_offline.js
qa/git_contract_offline.js
qa/task_base_offline.js
qa/pt_land_resync_offline.js
work/qa-lifecycle-v2/review.md
<!-- auto-edit-scope:end -->
<!-- land-scope:begin -->
qa/run-offline.js
qa/lib/qa-lifecycle.js
qa/tools/pin-from-run.js
qa/qa_lifecycle_offline.js
qa/fixture_template_offline.js
qa/git_contract_offline.js
qa/task_base_offline.js
qa/pt_land_resync_offline.js
AGENTS.md
.claude/skills/pt-offline-suite/SKILL.md
.claude/skills/pt-offline-suite/references/coupling-classes.md
work/qa-lifecycle-v2/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/qa_lifecycle_offline.js
<!-- land-tests:end -->

**Note on land-tests:** the new suite is the targeted gate; the step-10 plain full `qa:offline` covers the rest. `LAND-EVIDENCE` `targeted=PASS` means that line passed.
