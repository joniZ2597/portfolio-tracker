# review.md - worker-exec-permissions-1 (Worker A, Manual)

Task: narrow guard grant (R15) for task-scoped Worker edits, fail-closed Manual mode lock, `onFailure:"block"`, and the exact `wmic` allow rule (PROTECTED). Files (brief section 1): `.claude/hooks/pretooluse-guard.js`, `.claude/settings.json`, `AGENTS.md` (through step 13a), `qa/auto_mode_hardening_offline.js`, `qa/pt_land_offline.js` (the two pin statements and the one parity row only), this file.

## Commits
- `6bd926b92c10ba5290d1fa25c11b0a1cc672caf7` first r9 commit (the two QA files; staged list was exactly those two paths).
- `184d81b49f757a9ee489aae70a0999d05ed02e82` PROTECTED-COMMITTED (`6bd926b..184d81b`, tree `67244cc3146a224e96cdeef06b32370c6b2a802f`). Committed blobs, `git show HEAD:<path> | sha256sum`: guard `3e3b9b16faf88ca08a4008615789ed79432f2a785f0cb635e836b92b7c6c6d2d`, settings `fc6e3b962ed7667c051d4695e2d38e15dc551a7fa1df17856fb78f81f3dd4f6f`, AGENTS.md `ab1b9d5277e964c34e0b0e46c2ff6b80c8fb8df8cec928faaa25c4acd202c758` - all equal to the PROTECTED-approved candidates; `HEAD^{tree}` = the approved tree.
- The second r9 commit (the two pin statements + this file) follows at step 9 on a separate go-ahead.

## Owner-approved deviation (Route A, relayed by MAIN, 2026-10-23)
Defect (independent focused Codex review, Class I, MAIN-confirmed; triage `Pulse-Planning/agent-handoff-1/worker-exec-permissions-1/codex-impl-focused-1.md`): `r15Candidate` / `r15Lock` identified a slot only by the literal `pt-wt-worker-[ab]` text. If both `CLAUDE_PROJECT_DIR` and the hook cwd were an alias of the slot (8.3 name, mixed 8.3, junction, symlink, subst drive) a non-default mode got no slot candidate and the lock passed.
Owner ruling (substance): brief rulings R-c, R-d and R-f take precedence over the narrower section 2.4 M1 path-recognition rule for this defect only. Brief bytes and the integrity chain are untouched.
What was done: in `cand-guard.js` only (grant logic, settings, AGENTS.md untouched), `r15Lock` in non-default modes resolves PD and the hook cwd through the injectable `realpathNative` dep (real default: native realpath) and evaluates both the raw and the resolved form; a failed, empty or non-string resolution of a non-empty PD/HC is ambiguous -> DENY (brief id "?"); `\\?\` / UNC / drive-less forms stay ambiguous -> DENY; mode `default` still passes with zero reads. The deviation makes section 2.4 M1 stricter than written (it can only deny more); it is the only deviation from section 2.

## Incidents
- Hook denial (form denial, logged, one compliant reissue): at step 6 a `grep` whose pattern contained the land tool's name was blocked by the guard's R12 rule ("R12: the command is not exactly one of the permitted forms"). Reissued once without that text; it ran. No work-around, no other denial in this task.
- Non-card process check (read-only): the step-6 heavy-run process checks ran as `wmic process where "name='node.exe'" get ProcessId,CommandLine | tr -d '\0' | grep -ci "run-offline\|qa/"` (piped and filtered) instead of the bare card line. It only listed processes, was prompted and Owner-approved, so the exact `wmic` allow rule did not apply to it. Every heavy run was preceded by such a check (result 0 each time) and no two heavy runs overlapped.
- No R15 denial, no guard crash, no mode change after the protected commit (the slot ran the new guard for steps 6-8; Manual mode lock off by M0).
- The brief-hash check for approval-envelope-1 (CRLF working copy vs LF blob) is a different task's incident; for this task the committed-blob sha256 equals the record from the start.

## Codex ledger
- Round one (step 3, Worker-run, read-only, task diff + three candidates): no findings in five categories. Class I 0, Class II 0.
- Focused review 1 (independent, MAIN-run): Class I - alias bypass of the mode lock (above). Disposition: FIX via the Owner-approved deviation (cand-guard `3e3b9b16...`).
- Focused review 2 (MAIN-run, on the alias fix `3e3b9b16...`): Q1/Q2/Q3 SAFE. F1 (Codex labelled Class I: the three resolution mutants use one input each) -> Owner-confirmed CLASS II (optional test hardening, not a demonstrated defect: the regression rows already assert every failure value - throws, '', null, number, object - in three contexts, and both `\\?\` and UNC as DENY; each mutant replaces a single all-values branch). Disposition DEFER, no change. F2 (Class II, > 260 character alias) -> REJECTED, already covered by `R15_LONG_ALIAS` in the alias loop (and the literal > 260 character slot-name row). Evidence: `Pulse-Planning/agent-handoff-1/worker-exec-permissions-1/codex-impl-focused-2.md`.
- Final check (step 8, Worker-run, read-only, task diff `0a5fdf9..HEAD` + the two-pin working-tree change + this file; evidence logs listed in the prompt): one finding, Class I at `review.md:24` - this ledger bullet was an unfilled placeholder ("recorded below after it ran") and the file held no final-check verdict. Disposition: FIX - this bullet now records the verdict; documentation only, no code or test change. Codex raised nothing else: no mismatch between the cited counts / digests / commit ids and the logs, no overstated test claim, no contradiction with brief section 5. After the fix Class I unresolved = 0, Class II = 0.

## QA
- Step 0: `qa:offline` PASS, 104 suites (1 existing WARN `index.html:12214`).
- Targeted, before the protected commit (override runs, `AH_HOOK_PATH` + `AH_SETTINGS_PATH`): AH PASS 4917 assertions, 0 FAIL; PL (`AH_HOOK_PATH`) PASS 69. Against the unmodified base guard the new AH rows were RED (32 FAIL, then abort); against a raw-name-only copy of the candidate they were RED (65 FAIL incl. the real junction / symlink / 8.3 / nonexistent-path rows).
- Step 6 (protected commit `184d81b`): `qa:offline` PASS, 104 suites (= step 0), AH and PL replayed with stale-pin lines (total 734 938 ms). Land-test `node qa/auto_mode_hardening_offline.js` PASS 4917 assertions. Forced replays, one at a time after a process check: `PT_QA_FORCE_HEAVY=1 node qa/auto_mode_hardening_offline.js` PASS 4917 (src `7e2484b69f76416ced46aad3d51abe1a12abdb58eef797983eab516d59761b07`, env `5257c227140204f038c0ec7eb724abb44dbf4e31a2c6d3c5e8a6f07727f1aeb0`, 23 heavy blocks run, 0 skipped); `PT_QA_FORCE_HEAVY=1 node qa/pt_land_offline.js` PASS 69 (src `49dd76219c7896d28e38b4917f08c231aac8ec3c2e24596a2941a5a19e388795`, same env, 48 heavy + 21 light rows run, 0 skipped).
- Pins set (only the pin statements changed): `AH_CONTRACT_PIN.source` = `7e2484b6...1b07`, `LAND_CONTRACT_PIN.source` = `49dd7621...8795`; environments unchanged.
- Step 7 (working tree with pins): `qa:offline` PASS, 104 suites (= step 0); AH `SKIP (contract pinned: 7e2484b69f76/5257c2271402) 23 heavy block(s) not run, 4676 assertion(s) PASS`; PL `SKIP (contract pinned: 49dd76219c78/5257c2271402) 48 heavy row(s) not run, 21 light row(s) PASS`; total 129 634 ms. This is the LAND QA; N = 104.

## Conformance (section 2.6a, candidate then committed file)
- AGENTS.md: base anchors = 1 each (TS-4); `**Auto-edit-scope block (optional, Worker briefs).**` 1, `**Mode lock (R15, HOOK-DENY).**` 1, `the Manual mode lock (R15)` 1, `or an R15 mode-lock denial;` 1, `wmic process where` 2; 0 CR bytes; diff against the base = exactly 5 hunks. Committed AGENTS.md sha256 = the candidate.
- settings.json: diff against the base = exactly 2 hunks (`"onFailure": "block"` after `"timeout": 10`; the exact `wmic` rule appended after `Edit(//tmp/pt-*/**)`); parses; AH-8/AH-10/AH-23 pass on it.
- Guard: diff against the base removes exactly 5 lines (two header-comment lines, the DEFAULT_DEPS tail, the runCli decideFn call, the module.exports line), all re-added in the new form.

## Requirement -> test results (brief section 3.6, N1-N100; "NO" = no opinion; every row PASS unless marked)
AH-27 = grant (hermetic world + real-filesystem rows), AH-28 = mode lock (+ alias rows), AH-29 = runCli plumbing, AH-30 = real git fixture / real CLI, AH-8/10/23 = settings.
- N1-N5 scope, cwd drift, PD missing: AH-27 PASS (N4 also AH-28; N5 also hook-cwd-null). N6 fake slots: AH-27 hermetic + 5 real-fs rows (own .git directory, back-pointer elsewhere, non-sibling slot, .git file with no gitdir line, relative gitdir) PASS. N7-N15 other task / unlisted / M5 / outside land-scope / duplicate marker / working-tree-only block / case / other task qa.log: PASS.
- N16-N21 record missing, edited, no ok audit, sha mismatch, base not a commit, loader throws: hermetic + real-fs (edited, no audit, audit not ok, audit sha, base != history, briefPath) + AH-30 (non-ancestor with real merge-base) PASS. N22-N24 detached / branch-dev / main / refs/heads/task-foo: PASS.
- N25-N29 (5 modes x 6 tools), N30 plan, N31 absent/null, N32 Auto brief + acceptEdits, N33, N34 cd to canonical, N35 subagent: AH-28 PASS (exact text `R15 mode lock: brief wx-1 is Manual, session mode is <mode> - STOP-6`; CLI exit 2 in AH-30).
- N36-N41 protected / ASK / DENY / dot names in the block (30 entries x 2 checks): PASS. N37 `.git` writes: DENY, byte-identical R10-6 text, also under the lock. N42 ask still prompts: LIVE (section LC, not testable offline). N43-N44 case variants and dot segments: PASS.
- N45 junction / symlink to another slot or directory: hermetic + real junction row PASS. N46 8.3 names; N47 mixed separators (GRANT); N48 UNC / device prefixes; N49 trailing dot / space; N50 ADS; N51 drive-relative; N52 new file / missing directory (GRANT); N53 NotebookEdit; N54-N55 Edit / Write / MultiEdit (GRANT): PASS. N56-N57 injected exception / budget -> no opinion: PASS. N58-N59 exact grant bytes, no `updatedInput` / `additionalContext`: AH-29 + AH-30 PASS.
- N60 every existing no-opinion row unchanged: the pre-existing AH/PL assertions run unchanged except the nine lines declared in plan.md Q4 (each equivalent or stronger); `qa:offline` PASS. N61 parity: record loader vs `loadTaskRecord` on 13 shared fixtures (AH) and land-scope + protected-scope parsers vs the land tool on 13 shared fixtures (PL-56): identical. N62 repeated denial: PASS. N63 review.md rewording in scope: residual, process-only (R-6).
- N64 subdirectory cwd and N65 case / separator differences (GRANT): PASS. N66 decoys, N67 8.3 PD, N68 UNC PD: PASS. N69-N70 drive-less and POSIX temp paths: PASS. N71 scratch (24 rows: GRANT for nested files; NO for protected/PROTECTED/Protected, other task, lookalike, junction, missing, realpath differs, dot segment, never-approvable name): PASS. N72 hard link (hermetic + real `fs.linkSync` row): PASS. N73-N75 void rules (glob, `./`, backslash, `..`, space, empty, 65 entries, duplicates, no land-scope, two land-scope blocks, two protected-scope blocks; 64 entries and CRLF / bullets positive): PASS. N76-N78 non-ancestor, blob read fails, task id case / slash: PASS. N79-N80 `"Default"`, number, object, null modes: PASS.
- N81-N89 lock: detached pass, branch-dev / unreadable HEAD / no record / invalid record / sha mismatch / fake slot -> DENY, worker-mode variants (twice, auto+manual, AUTO, spacing, trailing text, inline, no marker, extra named line, working-tree-only) -> DENY, PD / cwd on different slots, canonical unaffected, both missing, throwing evaluator / budget, zero reads in `default`: PASS. N90-N92 runCli own keys, `grant` for Bash -> exit 2, direct `decide()` without the key unchanged: PASS. N93 spies, N94 exception asymmetry, N97 bypass attempts: PASS. N95-N96 settings (missing / `continue` / `allow` / `Block` / `true` / other-entry `onFailure`; `Bash(wmic *)`, `Bash(wmic process *)`, wmic in ask / deny): AH-8/AH-23 PASS. N98 hook failure with `onFailure:"block"`: configuration asserted statically (AH-8), behaviour LIVE (section LC). N99 evidence path under a missing directory: PASS. N100 E6 cd drift in a real session: UNVERIFIED (section LC-6); the hermetic cwd-drift rows (N2-N4, N34, N85) and the AH-30 real-CLI drift rows PASS.
- Planted negatives: 46 `mutantCatches` on the guard (`R15` and `runCli` prefixes), each with an anchor check, a "mutant is caught" check and an "unmutated passes" check.
- Alias rows (Route A): see the table below. AH assertions 4809 -> 4917.

## Alias table (REAL = created and observed on this machine/volume; INJECTED = through the realpath dep only)
| Form | REAL | INJECTED |
|---|---|---|
| 8.3 short name of the slot directory (`PT-WT-~1`) | yes (8.3 generation is enabled here; passes, red on the pre-fix guard) | yes |
| mixed 8.3 / long (short user dir + short slot) | no | yes |
| junction | yes (no privilege needed; passes, red pre-fix) | yes |
| directory symlink | yes (creation succeeded here; passes, red pre-fix) | yes |
| subst drive | no - a real `subst` is system-wide and was not run | yes |
| relative `gitdir` in the slot `.git` file | yes (identity unproven -> Manual -> DENY; passes before and after, a regression guard, not an alias) | - |
| `\\?\` real path naming the slot | no | yes (ambiguous -> DENY; canonical checkout in that form passes) |
| path > 260 characters | no | yes (alias form and literal slot name) |
| resolution failure | yes (a nonexistent PD / hook cwd) | yes (throws, '', null, number, object; PD, hook cwd, file tools) |
No real-environment pass is claimed for the INJECTED-only forms. Real aliases exist only inside the suite's own `os.tmpdir()` fixture directories (prefix `ah27-`), removed after each row.

## Backlog reconciliation
none

## Residuals (for the Owner)
- `worktree.useRelativePaths=true`, or a `\\?\` real path of the slot, turns the GRANT off (identity unproven / ambiguous); the lock then treats such a slot as Manual. Fail-safe, not fail-open.
- An all-8.3 PD with no long form is now resolved by the alias fix; a form that cannot be resolved denies in non-default modes.
- The scratch grant can hold files a later Bash call could run (T6, brief R-5); running them still prompts.
- Section LC (post-LAND live check) is a separate Owner-approved step; N42, N98 and N100 stay LIVE / UNVERIFIED until then.
- F1 (Class II, optional): a separate input per resolution mutant would make the test intent more explicit.

## Lessons
- A grep pattern or file name containing the land tool's name triggers the R12 form rule even in a read-only command; the card form for output filtering is a pattern without that text.
- A forced heavy replay of the AH and PL suites takes ~12 minutes of wall time in total on this machine; run them in the background one at a time and check processes first.
- A planted-negative probe can pass for the wrong reason (a Bash payload with no command is denied by an unrelated rule): prove each new row red against the pre-fix source, not only green against the fix.
- Tests written against injected deps do not prove real-filesystem behaviour; the alias table keeps REAL and INJECTED apart.

LAND-EVIDENCE: qa-offline=PASS 104; targeted=PASS; codex-classI-unresolved=0
