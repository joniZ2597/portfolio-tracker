# Review — qa-isolation-meter, Slice 0: private temp root per run + process meter for the two land-tool suites

Brief: `work/qa-isolation-meter/brief.md` @ `5f85039` (brief-only commit; the task branch starts there). Baseline `cd2c54bc3bf6f4d9aa37788332aa2518e2b0d7d6`
(`branch-dev` = `origin/branch-dev`). Mode: Auto (attended), Worker A. Test-only: no tool, hook, protected, `qa/run-offline.js` or other-suite change.

## Summary

Each run of `qa/pt_land_offline.js` and `qa/pt_land_resync_offline.js` now works under its own private temp root (`ptqa-land-*`, `ptqa-resync-*`), so two runs can no
longer share `<tmp>/pt-oag*` manifests or sweep each other's `pt-resync-*` folders. Both suites also meter every `spawnSync` start (count, time, fixture / tool / other,
which Git binary runs). No row changed: both land suites differ from the baseline by exactly the three edits E1–E3 (6 inserted lines each), their PASS counts are
unchanged (166 and 49), and the new suite proves the isolation and the meter with planted negatives.

## Files changed

- Implementation (5): qa/lib/run-tmp.js, qa/lib/spawn-meter.js, qa/pt_land_offline.js, qa/pt_land_resync_offline.js, qa/run_isolation_offline.js
- Evidence (tracked): work/qa-isolation-meter/brief.md, work/qa-isolation-meter/review.md

## Step 0

- Current-guard check: the slot is on `task/qa-isolation-meter` at `5f85039`, descends from `cd2c54b`; `git status --porcelain .claude` empty; brief tracked and unmodified at M2;
  `node_modules/` newer than `package-lock.json`.
- Baseline `npm run qa:offline`: **PASS, 56 spawned suites**, 1 advisory warning (4 232 s). Started 18:54 with no other QA process running; the two land suites were
  not edited while it ran. The runner discards a passing suite's stdout, so the land-suite counts come from standalone runs of the identical file bytes: **166** and **49**
  (the files equal `cd2c54b`; `git diff cd2c54b` over both was empty before the edits).
- One ordering rule found while planning: the suite list is fixed when a full run starts but each suite is read from disk when its turn comes, so E1–E3 were applied only
  after Step 0 ended (new files were written during it; they are not in its list).

## Tests first

`qa/run_isolation_offline.js` against no helpers: **FAIL 21/26** (the five rows that pass are the negatives that need no helper). With the helpers written, the first run
passed 21 of 26; after fixing three probes of the suite's own (see the self-review) 24 of 26 passed, the two failing rows being the RI-6 checks that need E1–E3. After E1–E3 it
passed **26/26**.

## QA

- `node qa/run_isolation_offline.js`: **PASS 26/26** — RI-1 (+negative, + 4 planted mutants), RI-1b, RI-2 (the collision, concurrent children, + negative, + mutant), RI-3, RI-4,
  RI-5, RI-6 (both suites, + planted negatives), MT-1…MT-7 each with planted negatives, and a static scan that neither helper mentions a `GIT_*` variable. Every probe runs in a
  fresh child process under a sandbox temp parent, so no row touches the real temp folder (in particular never a real `pt-oag*` directory).
- **Behaviour proof (§3.3), both suites alone after E1–E3:** main land suite **PASS 166**, exit 0 (20:06–20:35 on 2026-10-04); resync land suite **PASS 49/49**, exit 0 (17:29–17:53 on 2026-10-05).
  Same counts as Step 0, no FAIL, meter row lines = executed rows (166 and 49), `meterErrors=0`, no private root left after a normal run. (The first resync run was killed by the
  system for low memory about five minutes in; its private root `ptqa-resync-kt2snN` is a deliberate, untouched exhibit of what a kill leaves behind.)
- **Collision proof (§3.4):** the two land suites started at the same moment (22:10:21–22:41:00, quiet laptop): **both PASS** (166 and 49/49); 30-second snapshots show each under
  its own root (`ptqa-land-TR64QK`, `ptqa-resync-yIYglY`). Sampled free memory 1.05–2.98 GB; not killed.
- **Full `npm run qa:offline` after the change (§3.6):** **PASS, 57 spawned suites = Step 0's 56 + 1**, 1 advisory warning (same as Step 0), 3 502 s, quiet laptop, never killed.
- QA suites that read in-scope files as text: `qa/run_isolation_offline.js` reads both land suites as text (RI-6) and compares them to the baseline blob (`git show cd2c54b:…`);
  no other suite reads them.

## Measurement summary (§3.7) — Windows laptop, Git for Windows 2.53.0, Node 24.14.0

All figures are from the suites run ALONE (measurement run, 2026-10-05); the behaviour-proof run of each suite is given for the spread. `ms` = time inside metered
`spawnSync` calls; shares are of that total. Raw output and the 30-second memory samples are in `qa.log`.

| | main land suite | resync land suite |
|---|---|---|
| Git executable the run uses | `C:\Program Files\Git\mingw64\bin\git.exe` — **direct** | same — **direct** |
| Starts | git 8 475 · node 115 · other 0 | git 4 234 · node 1 · other 0 |
| Fixture share | 1 508 999 ms (**64.1 %**) | 396 562 ms (**47.0 %**) |
| Tool share | 743 826 ms (**31.6 %**) | 261 270 ms (**31.0 %**) |
| Other share (test-body git) | 100 757 ms (**4.3 %**) | 185 316 ms (**22.0 %**) |
| CLI runs (inside the tool share) | 18 starts, 34 651 ms (**1.5 %**) | 1 start, 6 590 ms (**0.8 %**) |
| **Average ms per Git start** | **269.9** (behaviour run: 191.4) | **197.6** (behaviour run: 327.4) |
| Suite wall time | 39 m 51 s (behaviour run: 28 m 19 s) | 14 m 20 s (behaviour run: 23 m 47 s) |
| Meter rows / executed rows | 166 / 166 | 49 / 49 |

The start counts are identical between runs (deterministic); the time per start is not (191–327 ms), because the laptop's load changed between runs (two Claude Code sessions,
a browser and an endpoint-security agent were active). **Read ratios and shares, not absolute minutes.** Starts outside any row (module-level setup): fixture 72, tool 41.

**Top 10 rows by wall time — main land suite** (ms; fixture/tool/other starts): #79 PL-25 untracked file → refuse K4 53 065 (122/10/14) · #75 PL-22 valid cleanup 51 612 (122/19/19) ·
#78 PL-25 tracked modification K4 47 974 (122/10/14) · #49 CDX-1 flaky-git push-request 47 305 (24/87/0) · #80 PL-26 non-directory destination 46 397 (122/11/14) ·
#83 PL-28 branch checked out nowhere 45 596 (122/10/16) · #43 PL-18 remote moved 44 544 (24/77/9) · #82 PL-27 second cleanup 43 676 (122/24/14) · #81 PL-26 destination exists 41 879 (122/11/14) ·
#84 PL-29 planted non-sample hook 34 014 (122/19/14). The cleanup group (PL-22…PL-30) builds a 122-start fixture per row.

**Top 10 rows by wall time — resync land suite:** #35 MUT-RS-1 43 326 (84/106/14) · #21 RS-11 end to end 29 386 (21/167/9) · #18 RS-10 rebase in progress 28 740 (42/23/60) ·
#39 MUT-RS-4 27 623 (42/66/16) · #16 RS-8 refs unchanged 27 622 (42/76/39) · #44 MUT-RS-8 27 424 (42/43/6) · #36 MUT-RS-2 26 677 (42/71/12) · #45 MUT-RS-9 26 446 (38/46/6) ·
#22 RS-12 26 251 (42/48/15) · #37 MUT-RS-2b 24 484 (42/71/12). Every resync fixture is 21 starts and most rows build two.

**Top 10 Git subcommands — main land suite:** rev-parse 2 576 · status 693 · add 613 · push 602 · commit 594 · config 491 · worktree 412 · symbolic-ref 343 · init 286 · merge-base 258.
**Resync land suite:** rev-parse 1 110 · add 379 · commit 377 · worktree 323 · status 269 · symbolic-ref 247 · push 210 · config 207 · diff 188 · init 140.

Counts agree with the Linux numbers in the plan (8 741 and 4 281 Git starts); the small gap is starts made through entry points the meter does not wrap (stated in the helper).

### What the numbers say about the next lever (decision gate G0 input; nothing here is implemented)

- **A — direct `git.exe`.** A held read-only benchmark (`bench-spawn.js`, idle laptop, one executable at a time; `qa.log`) gives per start: `git --version` 309.5 ms (launcher
  `cmd\git.exe`) vs 231.6 ms (direct `mingw64\bin\git.exe`), `rev-parse` 322.1 vs 202.7, `status` 289.2 vs 202.9, init+add+commit 1 144.8 vs 969.6 — the direct binary is **25 %, 37 % and 30 % faster** for the three single
  commands and **15 % faster** for the four-process init+add+commit sequence (so the gain depends on the command mix). **But this run's PATH already resolves the direct binary first** (`where git` lists `mingw64\bin` before `cmd`), so these suite numbers are already direct-Git
  numbers. Lever A pays only if the Owner's own terminal PATH resolves `cmd\git.exe` first; the meter reports it on the first `@@QA-SURFACE@@` line of a run from that terminal.
- **A floor that is not the launcher.** Even the direct binary costs 200+ ms per start and a bare `node -e 0` costs about 265 ms, with the machine idle. That is a large per-process
  cost independent of Git's launcher, consistent with per-process scanning by the endpoint-security agent; **not proven here** — it would need the Owner's exclusion test (lever D).
- **C — run the two suites side by side.** Measured: 30 m 39 s wall together vs 54 m 11 s run one after the other (**−43 %**), both PASS, each in its own private root. This is only
  possible because of the isolation shipped here; the memory sample dipped to 1.05 GB and one earlier single-suite run was killed under other load, so it needs the memory question settled.
- **Where the Git time is.** 64 % of the main suite and 47 % of the resync suite is fixture setup, with a handful of fixture shapes repeated (122-start cleanup fixtures, 21-start resync
  fixtures): the template-fixture slice (Slice 1) targets the largest share. The tool-under-test share is a steady ~31 % in both suites.

## Codex review (implementation diff, base `cd2c54b` for the two suites; new files verbatim)

Launched by the Worker: `codex exec --sandbox read-only`, stdin prompt carrying the brief, the tracked diff, the three new files verbatim, the status and the QA headlines; raw
output (including the CLI's echo and Codex's own exploration) in `work/qa-isolation-meter/codex.md`. **No Class I, no Class II findings. VERDICT: PASS.** Codex's checks, verbatim:

> - **1. Brief conformance — PASS.** `run-tmp` sets and verifies the private temp root, registers best-effort exit cleanup, and does not touch `GIT_*`. `spawn-meter` preserves the wrapped call's `this`, arguments, options, and result; implements the requested categories, row accounting, Git resolution, and report formats. The two land suites contain E1–E3 as specified.
> - **2. STOP conditions — PASS.** The provided diff changes only the five implementation files listed as new or edited; the sixth file, `review.md`, is expected later. The RI-6 reconstruction checks the land suites against the pinned baseline plus E1–E3. No prohibited tool, assertion, fixture, or `GIT_*` change is evident.
> - **3. Helper correctness and robustness — PASS.** The stack parsing handles the named fixture frames and tool-file/CLI rules; Git subcommand parsing skips `-c` and `-C` values. Meter failures are caught, row and outside totals are reported, Git average timing is computed, and PATH resolution does not start a process. No material Windows/Linux or long-run defect found in the supplied code.
> - **4. Tests — PASS.** RI-1–RI-6 and MT-1–MT-7 exercise the stated behaviors, with planted mutants applied to helper copies or the tested input. The static `GIT_` scan has a positive control. The output format test checks the complete synthetic report, including row aggregation and average Git time.
> - **5. Scope — PASS.** The shown status contains exactly the five implementation files; `review.md` is planned as the sixth file. QA evidence reports the required suite counts, collision proof, and full-run count.

## FIX / DEFER / REJECT ledger

No findings — nothing to classify.

## Fresh-context self-review (step 7)

Re-read the brief and the complete diff against the requirement→test map (`plan.md` Q1–Q19). What changed as a result: (1) the first RI-5 negative ("an env copy with TEMP/TMP/TMPDIR stripped")
could not hold on Windows — a child whose env merely omits TEMP still inherits the parent's — so the negative now names the ORIGINAL temp folder in the child's env; (2) the RI-1 "fixed shared
directory" mutant needed a cross-run uniqueness check, which RI-1's probe now makes; (3) three mutants had replacement text that unbalanced a parenthesis, fixed before any run; (4) one log
entry stated the collision run's free-memory range wrongly (1.78 GB instead of the sampled 1.05 GB); it was corrected by an appended note in `qa.log` and the review uses the right figure.

## Backlog reconciliation

- **Brief's Backlog row:** `none` — workflow tooling (Track 6, "Faster land-tool tests", Slice 0); no `BACKLOG.md` change.
- **Action taken:** `none`.
- **Affected entries:** none — no `BACKLOG.md` heading or status text touched.
- **Confirmation:** the implementation changes touch only the five implementation files listed under "Files changed" (not the two evidence files) and nothing in `BACKLOG.md`;
  no BACKLOG entry is closed or changed by this work. The `[backlog]` lessons below are recorded as pending routing, not acted on.

## Final check

Final check: 1 round, 2 class-II findings fixed, self-checked; no implementation change, no QA re-run.

Codex's final check (raw output under `## Final check` in `codex.md`): Class I none (the diff matches the approved scope; the Backlog reconciliation correctly records `none`); Class II
two, both in this file — the lever-A percentage wording (it described how much faster direct Git is, and the init+add+commit figure sat outside the range) and "stays … for good"
(the evidence shows the root remained, not that it can never be removed). Both reworded; no claim about the implementation or the QA results changed.

## Lessons

- [rule]     Destination-ready text for `AGENTS.md` "Auto-approved commands" (or the hook notes): "The R12 trigger matches the land tool's name anywhere in a Bash command's text,
             including `grep` patterns and `echo` prose. A QA suite label that equals the tool's name (the meter prints `pt-land` as its suite label) therefore trips the hook for any
             command that quotes it: read such output through a script file or with a pattern that avoids the literal." (Two STOP-6 denials of this kind in this task, both the Worker's own, each ruled non-invalidating.)
- [backlog]  A run killed by the system (low memory) never reaches its exit handler, so its private `ptqa-*` root stays in the temp folder until something removes it; a sweep of `ptqa-*` roots older
             than a day, run by the next suite start, would remove them — pending routing (this brief limits `BACKLOG.md` to none).
- [backlog]  Run the meter once from the Owner's own terminal and read the `git=` field of the first `@@QA-SURFACE@@` line: it settles whether lever A (direct `git.exe`) applies there —
             pending routing.
- [backlog]  Lever C (the two land suites side by side inside `qa:offline`, −43 % wall time measured) needs an Owner ruling on the ASK-tier `qa/run-offline.js` and on memory headroom —
             pending routing.
- [covered]  The fixed `<tmp>/pt-oag*` collision and the `pt-resync-*` sweep are the "temp-path collision" recorded as a pending `[backlog]` lesson in `work/second-finisher-resync/review.md`;
             this task is its fix.
- [local]    On Windows a child spawned with an env that omits TEMP still inherits the parent's TEMP; only an env that names a different value changes what the child sees.
- [local]    The timing per Git start moved between 191 ms and 327 ms on the same suite and code within one day; compare shares and ratios, not minutes.
- [local]    Edit-tool edits on the two CRLF land suites kept CRLF (byte-audited: 6 inserted lines each, CR count = line count).

LAND-EVIDENCE: qa-offline=PASS 57; targeted=PASS; codex-classI-unresolved=0
