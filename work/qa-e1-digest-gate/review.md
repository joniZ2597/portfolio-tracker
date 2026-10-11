# Review: qa-e1-digest-gate — digest-gated heavy rows in four unchanged governance QA suites (QA-efficiency pilot E1)

Task branch `task/qa-e1-digest-gate`, recorded task base `54284726400720346b27bc9aff51eff7c608eafa` (brief-only commit on code base `5b338691010cebc3902213fd964e6e6af5ec09ec`). Slot B, Mode Manual.

## Files changed
- Implementation (4): qa/task_base_offline.js, qa/pt_land_offline.js, qa/pt_land_resync_offline.js, qa/auto_mode_hardening_offline.js
- Evidence (tracked): work/qa-e1-digest-gate/brief.md, work/qa-e1-digest-gate/review.md

Git diff stat of the implementation: 1960 insertions(+), 123 deletions(-) (numstat 494/44, 507/44, 476/14, 483/21). The 123 deleted lines are exactly the transformed lines: 21 (task-base) + 38 + 3×2 (land) + 14 (resync) + 22×2 (auto-mode-hardening). No other file changed; working-tree CRLF preserved (`git ls-files --eol`: `i/lf w/crlf` for all four); `git diff --check` clean.

## What was built
In each of the four suites, one **E1 block** (pin constant, parts list, one gate decision computed once at load, `heavy()` registrations, a verdict that runs last, and rows E1-1…E1-5) following the GC-4 / FT-0 pattern. Every row or block that starts a process is heavy and is skipped only when the source digest equals the pin **and** the environment key (`e1-env-v1` + the GC-4/FT environment digest + the full Node version, E1-D5) is pinned; any other case runs it and a changed input then fails closed with `re-pin required`.

### Parts table (R2; each LF-normalised, read from the repo paths)
| Suite | Pin | Parts (plus the suite's own source with its pin statement neutralised) |
|---|---|---|
| task_base | `TB_CONTRACT_PIN` | `.claude/hooks/pt-land.js`, `qa/guard_integrity_check.js`, `qa/lib/fixture-template.js`, `qa/lib/run-tmp.js`, `qa/lib/spawn-meter.js`, `qa/lib/exec-env-fingerprint.js` |
| pt_land | `LAND_CONTRACT_PIN` | the task_base list + `.claude/hooks/pretooluse-guard.js` |
| pt_land_resync | `RESYNC_CONTRACT_PIN` | the task_base list |
| auto_mode_hardening | `AH_CONTRACT_PIN` | `.claude/hooks/pretooluse-guard.js`, `.claude/settings.json`, `qa/guard_integrity_check.js`, `qa/lib/exec-env-fingerprint.js` |
Dynamic requires of temporary copies / mutants / the declared tool are listed by base line in `plan.md` §6 as justified; fixed-commit reads (`git show 1e4b773…`) are immutable and not parts.

### Row map summary (full lists in `plan.md` §5)
- **task_base:** 21 heavy rows, 0 light. **resync:** 14 `test(` sites = 17 rows at run time, 0 light. **land:** 38 heavy `test(` sites + 3 `heavyFn` blocks (10 rows) = 48 heavy rows; 15 light (PL-21 ×12, the PL-32..55 precondition, PL-54, MUT-OAG-3 — all in-process). **auto_mode_hardening:** 22 heavy top-level blocks (hook-CLI spawns and real-Git temp-repo blocks); the table-driven rest is light.
- SKIP-mode counts printed by the suites: task-base 21 heavy / 5 light; pt-land 48 / 20; pt-land-resync 17 / 5; auto-mode-hardening 22 heavy blocks / 4048 assertions. Forced-replay totals (second R2): AH 4270 assertions = 4265 + 5 E1 rows; heavy + light rows equal the SKIP-mode k + n for every suite (E1-10).

## Rulings in force (E1-D1…D11, brief §0)
E1-D1 scope: four suites only. E1-D2 fail-closed on changed inputs, unproven environments and overrides. E1-D3 forced replay before each governed SHIP and weekly. E1-D4 placement before `market-data-1`. E1-D5 full Node version in the environment key. E1-D6 one go-ahead covers the forced replay and step 10. E1-D7 weekly rule piggy-backs on the next step 0. E1-D8 `NODE_OPTIONS` forces a replay. E1-D9 no automatic retry. E1-D10 E1 lines are additive. E1-D11 the pin-initialization checkpoint is never a QA PASS.

## Readings and deviations from the brief's wording (all recorded in `plan.md` §4; Owner-approved where noted)
- **R-1 `heavyFn`.** R6 names block wrapping for AH only. Three land IIFEs (`plHappyPath` 3 rows, `plPush` 3, `plCli` 4) build real-Git fixtures outside any `test(`; they are wrapped `(heavyFn('id', N, function id() {` … `}))();`. SKIP counts N rows and runs nothing from the block; a replay checks that exactly N rows ran. Owner conditionally approved 2026-10-11; the conditions are demonstrated (replay semantics test, SKIP census, E1-6 reversal).
- **R-2** `PT_QA_FORCE_HEAVY` defined but empty is `invalid-force` (fail closed); overrides use the brief's "defined and non-empty".
- **R-3** The E1 verdict call sits immediately after `meter.report(...)` and before the existing PASS/FAIL summary, so the E1 line is the last `@@QA-SURFACE@@` line while a FAIL verdict still reaches the existing summary (R7 "last surfaced line" versus R8 "before the final lines"). Owner approved the edit.
- **R-4** AH wording: SKIP `<k> heavy block(s) not run, <a> assertion(s) PASS`; replay `<h> heavy block(s) / <a> assertion(s) run, 0 heavy skipped`.
- **R-5** About 460 added lines per suite against the brief's 120–200 estimate, because E1-1 and E1-2 carry source scanners; Owner approved.
- **R-6** E1-2 lambda tables: a first version used one declared, self-checking exception for the PL-33 case table. The Owner preferred a structural rule; it was implemented as `tableOk` (a lambda table used exactly once as the iterable of a `for (const [..] of T)` loop whose body registers a heavy row and whose bound names are used only inside heavy callbacks), with six planted deviations rejected on a synthetic source. No declared exception remains.

## QA
- **Step 0** (before any edit): `npm run qa:offline` PASS, 78 suites, runner total 1647031 ms (wall 1650 s); line 1 of `qa.log`.
- **RED** (tests-first, E1 rows against a gate stubbed to pass everything): all five E1 rows fail on all four suites. **GREEN** against the real gate: 5/5 on all four, on LF copies and on actual CRLF copies.
- **E1-1…E1-5** green in all four suites; planted negatives bite: an added `require`, an added repo read and a removed part (E1-1); an unwrapped heavy registration and the lambda-table deviations (E1-2); per-part byte flips, a removed part and a pin-only edit (E1-3); the four decision-table variants (E1-4); a misplaced verdict, in LF and CRLF forms of all four suites (E1-5).
- **E1-6** mechanical equivalence: an independent pattern-based undo script reverses the allowed transforms; each suite reproduces its base byte for byte (sha256 `edd0ba47…`, `ee11064e…`, `5cc2a4fa…`, `6214a11c…`, equal to the brief §1 table), both for the generated builds and for the installed repo files.
- **E1-7** spawn census, SKIP mode, on the real pinned repo files (90 s guard): each suite prints its SKIP line in under 6 s; the only process starts are the two `exec-env-fingerprint.js` `collect()` probes; temp dirs only from `run-tmp.js` `isolate()` and the light helpers listed in `plan.md` §6.
- **E1-8** runtime, ms, Step 0 → R3: task_base 575648 → 546; pt_land 521700 → 736; pt_land_resync 325404 → 1029; auto_mode_hardening 114166 → 1452; whole run 1647031 → 99846.
- **E1-9** no cascade: `git_contract_offline.js` and `fixture_template_offline.js` PASS with unchanged SKIP lines (`552ccfc8e1ee/ef28452b4eb8`, `288591877fee/ef28452b4eb8`); `run_isolation_offline.js` (RI-6), `pt_land_logic_offline.js`, `pt_land_resync_logic_offline.js` and `run_offline_discovery_offline.js` PASS; the reader-protected functions (nine land helpers, the resync and task-base `buildFixture`) are byte-identical; no new `child_process` require.
- **E1-10** count consistency: see the row-map section.
- **E1-11** environment scope: `FPLIB.collect().digest` = `ef28452b4eb84527b7208fc76792410d4948cc9d0fa91173a94c79edefa90858` on node v24.14.0 = slot A's record, so **slot A covered**. `E1_ENV` = `5257c227140204f038c0ec7eb724abb44dbf4e31a2c6d3c5e8a6f07727f1aeb0`.

### R2 history
- **First R2 — `R2 PIN-INIT CHECKPOINT (INVALID) — not a QA PASS`.** `PT_QA_FORCE_HEAVY=1 npm run qa:offline`, once, placeholder pins: exit 1, wall 1411 s, runner total 1408635 ms. Besides the four expected `pin invalid` verdicts, row **E1-5** failed in each suite ("a verdict placed before the rows was not caught"). Cause: the planted negative inside E1-5 rewrote the suite's own source looking for `\ne1Finish();\n`, but the working-tree files are CRLF, so the early-verdict copy was never built; my scratch validation had only run LF copies. All other rows and suites passed. No pin was set and nothing was retried (E1-D9).
- **Correction** (Owner-approved steps 1–3 and a scoped Codex review): E1-5 normalises the suite's own text to LF (`e1Normalise`) before the order check and the planted copy, plus two guard assertions so the copy cannot be silently mis-built. One identical 8-line hunk per suite. Evidence: GREEN on LF and actual CRLF copies; the misplaced-verdict variants (LF and CRLF, four suites) make E1-5 fail and only E1-5; reversal, census and cross-reader suites re-run on the installed files.
- **Second R2 — `R2 PIN-INIT CHECKPOINT (VALID) — not a QA PASS`.** Exit 1, wall 1580 s, runner total 1577525 ms, 78 suites: the only failures are the four expected pin-invalid verdicts (auto_mode_hardening 1 of 4270 assertions, pt_land 1/69, pt_land_resync 1/23, task_base 1/27); no E1-5 and no AH-16 failure. The four printed source digests and the environment key were reproduced exactly by an independent recomputation (`FPLIB.digestParts` over the declared parts, own source pin-neutralised) before any pin was written.

### Pins and R3
Pins set by replacing only the four pin statements with the verified values (verified read-only: placeholders restored reproduce the pre-pin build exactly; pins equal the second-R2 printed digests and a fresh recomputation on the pinned files):
- task_base `19cdac7a063407dfc987fdd9da8da3bb2568318f5957907dd9d8c471f11f1e51`
- pt_land `d4dc37aa75844e52575c1001b23f24f1a8b28c033ad73666d5c789a88284479f`
- pt_land_resync `043981f5b4cd173d177aacfa72b06ac3f20dc6505a7d696d4b1aa2dec3c09075`
- auto_mode_hardening `bda8013612f9d8e145ffd7c781076a863cadc14c98f1ad1403abba458208ec38`
- environment, all four: `5257c227140204f038c0ec7eb724abb44dbf4e31a2c6d3c5e8a6f07727f1aeb0`

**R3** (plain `npm run qa:offline`, no force, no override): **PASS**, exit 0, 78 suites (equal to step 0), 94 PASS lines (equal to step 0), 0 FAIL lines, wall 103 s, runner total 99846 ms; the four `E1 … SKIP` lines show the pinned digests; the output differs from step 0 only by those lines and the spawn-meter numbers.

## Events and Owner rulings during the task
- **Hook denials, none retried or rerouted:** a Bash call naming the land tool in a pathspec (R12); a PowerShell process listing for the heavy-lane check (R2, "denied in Worker-slot sessions"); a stray `node -` heredoc (R1); two further Bash calls that carried the land-tool name inside a script body or an expression (R12). Each stopped the work and was resolved by an explicit Owner ruling (separate standalone commands, a directory-level `.claude/hooks` pathspec for the baseline check, the Edit tool for one scratchpad edit, the Write tool for scratchpad scripts). The brief's Baseline validity check passed with the Owner-approved directory-level pathspec.
- **Heavy-lane gates:** Step 0, both R2 runs and R3 each ran once, on an explicit Owner go-ahead with Worker A confirmed paused.
- **Codex HOLD and REJECT ruling** — see the ledger below.

## Fresh-context self-review
Re-read the brief and the complete diff against the requirement → test map. Changes that resulted: the scanner gained handling for dead helpers, helpers referenced as values and registrar functions after the first scan of the real files; the AH block anchors were made unique-match after the scanner caught an earlier loop with an identical header being wrapped instead of the real one; the verdict call was moved after `meter.report`; E1-5 was made EOL-agnostic after the first R2.

## Codex (raw output in `codex.md`)
- **Step 8** (full implementation diff, read-only): Overall verdict **PASS**; no Class I or Class II findings; R2, R4, R5/R6, R7, R8, R10 and scope confirmed.
- **Scoped re-pass after the failed R2** (the E1-5 correction hunks): Overall verdict **HOLD**, five answers "no finding" except one remark under question 1: a source file without a final newline would make the corrected E1-5 search fail closed.

### FIX / DEFER / REJECT ledger
- **REJECT — final-newline remark.** The search anchors on the verdict-call line's own trailing newline, and that line is never the last line of any suite (it sits 6–9 lines before the end). Verified by rewriting all four suites without a final newline, in LF and CRLF: the E1 rows stay GREEN 5/5 on all eight copies. The remark is also fail-closed, never a vacuous pass. The Owner approved the REJECT; the original HOLD is preserved and not relabelled PASS.
- No FIX and no DEFER.

### Final check (step 12, raw output in `codex.md` under `## Final check`)
Codex's overall verdict on the complete task diff was **HOLD**, on exactly one Class II finding and nothing else: the section 9 heading in this file did not match the brief's own heading, so the "copied verbatim" claim failed a character-for-character comparison (the body already matched). Fixed by using the brief's exact heading; the section 9 body was then compared with the brief's by script and is identical. Codex answered "no finding" on the implementation and pins, on review.md fidelity against `qa.log`, on the Class II self-check rules, and on scope; it supported `codex-classI-unresolved=0`.
Final check: 1 round, 1 class-II findings fixed, self-checked; no implementation change, no QA re-run.

## Backlog reconciliation
- Brief's Backlog row: none (no numbered entry concerns QA runtime; roadmap row B3 is related but neither closed nor edited).
- Action taken: **none** — `BACKLOG.md` is not in scope and was not edited.
- No entry heading changed.
- Confirmation: no BACKLOG text was changed, so none can disagree with the diff, the QA results or the work being landed.

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

Weekly-rule note for this task: the passing forced replay on the current pins is not available — the second R2 was a pin-initialization checkpoint (the four suites reached `pin invalid`, as designed), not four `REPLAY PASS (forced)` lines. The weekly rule is therefore first satisfiable by the next forced step 0 after LAND.

## Lessons
- [rule] A planted negative or any check that rewrites or scans a suite's own source must normalise the file's EOL before matching, and the scratch validation of such a suite must run on actual working-tree bytes (CRLF), not an LF copy. Destination-ready text for AGENTS.md: "A QA row that inspects its own source normalises EOL explicitly (`replace(/\r\n/g, '\n')`) before any text search, and its scratch validation runs on copies in the working-tree EOL; an LF-only validation of a CRLF file is not evidence."
- [backlog] The weekly forced-replay cadence and the SHIP forced replay (§9) are recorded only in this review; a sentence belongs in the held governance package (AGENTS.md "Test commands" / "Owner LAND / SHIP boundaries") — pending routing
- [backlog] After E1 the dominant remaining runtime in a full run is the light logic twins and isolation suite (`pt_land_logic_offline.js` 26991 ms, `run_isolation_offline.js` 18339 ms in R3); a later QA-efficiency task could look at them — pending routing
- [backlog] A planted-negative family keyed on exact text anchors (here `\ne1Finish();\n`) is brittle to EOL and layout; consider a shared helper in `qa/lib` for EOL-agnostic own-source scans — pending routing
- [local] The first R2 failed on the E1-5 EOL defect; the checkpoint was recorded as INVALID, corrected, and re-run once under an explicit Owner decision.
- [covered] Planted negatives and mutation proofs on production source or fixture inputs — already required by `.claude/rules/qa-suites.md`.

## LAND-EVIDENCE
LAND-EVIDENCE: qa-offline=PASS 78; targeted=PASS; codex-classI-unresolved=0
