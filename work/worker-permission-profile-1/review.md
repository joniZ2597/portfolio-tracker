# review.md - worker-permission-profile-1 (Worker A, Manual)

Task: Worker command rules (AGENTS.md), the task-scoped scratch directory at task-start / adopt (land tool), the R16 task-scoped staging grant plus two force-staging deny rules (guard, settings), and four read-only Claude in Chrome allow rules (settings). Brief: work/worker-permission-profile-1/brief.md (rev 2, Owner rulings D-1..D-7). Backlog: none.

## Files changed
- Implementation (6): `.claude/hooks/pretooluse-guard.js`, `.claude/hooks/pt-land.js`, `.claude/settings.json`, `AGENTS.md` (the four protected targets, applied only through 13a: commit 1c37a7f, tree a5c48bbf82cbc6dcdc597cd9dea97fb116a2e58d), `qa/auto_mode_hardening_offline.js`, `qa/pt_land_offline.js`
- Evidence (tracked): work/worker-permission-profile-1/brief.md, work/worker-permission-profile-1/review.md

## What changed
- Guard (R16, brief 2.3): `r16Grant` grants one raw-string-matched `git add [--] <paths>` call (1..64 distinct plain relative paths) in the task's own Manual slot (mode exactly `default`, project dir and hook cwd both the slot root, HEAD `task/<id>`, valid record, ancestry, brief sha256), only for existing regular files (nlink 1, real path equal) listed in the brief's land-scope and outside its protected-scope and the R15 exclusions. It runs only after every other Bash rule returned no opinion; any exception is no opinion. `runCli` maps a Bash grant only with the reason prefix `R16 stage grant `; every other Bash, PowerShell or MCP grant still blocks. Header and export updated.
- Land tool (brief 2.2): `ensureTaskScratch` after the record and audit of `task-start` and `adopt`: creates `<realpath(tmpdir)>/pt-<id>` (non-recursive), or reports present / NOT READY; never fails the verb, never deletes or empties S. Printed lines: `scratch: created <S>`, `scratch: present <S>`, `scratch: NOT READY <S> (<code>); scratch writes will prompt`, with no leading spaces (see the indentation correction below). Seams `opts.tmpDir` and `opts.mkdir` are tests-only.
- Settings (brief 2.1): exactly two hunks: deny `Bash(git add -f*)`, `Bash(git add --force*)`; allow `mcp__claude-in-chrome__read_page`, `__get_page_text`, `__find`, `__read_console_messages`. `read_network_requests` is excluded (D-4).
- AGENTS.md (brief 2.4): W1 (the Worker command rules paragraph) and W2 (a) and (b). Checklist 2.4a: `**Worker command rules.**` = 1, `R16` = 1, `read_console_messages` = 1, `read_network_requests` = 0, 0 CR bytes.
- QA suites: AH-8 constants re-baselined (`WPP_DENY_ADDED`, `WPP_ALLOW_ADDED`), WPP planted negatives, AH-23 forbidden substrings, AH-31 (R16 grant / no-grant / must-keep / SE rows, runCli plumbing, 18 planted mutants), PL-57..62 and MUT-WPP-1..4 (scratch directory), and the two digest pins.

## Requirement to test results
| Requirement | Test | Result |
|---|---|---|
| 2.1 settings hunks, 3.1 re-baseline | AH-8 set equality, WPP negatives 1-6, AH-23 substrings and wildcard checks | PASS |
| 2.3 R16 grant and no-opinion rows (S1-S9, SE) | AH-31 (5 grant rows, about 100 no-grant rows, SE rows, must-keep rows, zero-read rows) | PASS |
| 2.3 plumbing | AH-31 runCli rows; AH-29 N91 unchanged | PASS |
| 3.2 mutants | AH-31 mutants (S2 start / end / option, S3, S4, S5, S6, S7, S8 two, SE, order, runCli three) plus the narrowed WEP runCli mutant | all caught |
| 2.2 scratch created / present / file / junction / mkdir throws / tmpdir missing / tmpdir parent a file, task-start and adopt | PL-57..61, PL-62 (CLI, exactly one scratch line, existing lines byte-identical) | PASS |
| 3.3 mutants | MUT-WPP-1 (recursive mkdir), 2 (NOT READY fails the verb, both verbs), 3 (unrealpathed tmpdir), 4 (S deleted when present) | all caught |
| 2.4a AGENTS checklist, settings parse | candidate build asserts; AH-8 on the committed file | PASS |
| 3.4 pins | AH_CONTRACT_PIN and LAND_CONTRACT_PIN set (see the D1 exception below) | step 7: both SKIP |

Evidence trail (qa.log): RED against the base (AH 26 of 5057 failed, PL 18/87 failed); targeted AH and PL replays against the candidates; step 0 and step 10 / 10c full runs.

## QA
- Step 0 (base 9d98734): exact `npm run qa:offline` PASS, 105 suites, one advisory WARN (index.html:12234 smart quote).
- Targeted, after the indentation correction: AH against the candidate guard and settings: REPLAY PASS, 5089 assertions, 0 heavy skipped. PL against the candidate guard and land tool: REPLAY PASS, 66 heavy + 21 light rows, 0 heavy skipped. The same two runs passed before the correction.
- Step 6.1 / step 10 (protected commit 1c37a7f): exact `npm run qa:offline` PASS, exit 0, 105 suites, total 3469783 ms, same single WARN; stale-pin REPLAY PASS lines for auto-mode-hardening, pt-land, pt-land-resync and task-base.
- Step 6.2: forced AH replay (PT_QA_FORCE_HEAVY=1) PASS, source digest 5c3fae45117124d54f444fc4e4f4177e7fddae94cba254aa8f4ee93410737e0c.
- Step 7 / 10c (after the pins): exact `npm run qa:offline` PASS, exit 0, `(105 offline test file(s))`, total 1235390 ms, same single WARN. `E1 auto-mode-hardening: SKIP (contract pinned: 5c3fae451171/5257c2271402) 23 heavy block(s) not run, 4848 assertion(s) PASS`; `E1 pt-land: SKIP (contract pinned: 72a8c0b66d0e/5257c2271402) 66 heavy row(s) not run, 21 light row(s) PASS`. `pt-land-resync` and `task-base` still REPLAY PASS with pin stale. No FAIL line.
- Offline only: no dev server, no live call, no Netlify command, no network.

## Owner exception to brief section 3.4 (D1, 2026-10-24)
The brief says to set both pins from forced replays. The forced PL replay (card line 378) was killed by Claude Code for low system memory (background task bwzqxqrzo; not evidence, not retried). The Owner approved setting LAND_CONTRACT_PIN from the step-10 full-run stale replay instead. MAIN's equivalence points:
1. The step-10 PL line ran `66 heavy + 21 light row(s) run, 0 heavy skipped`: the same 87 rows as every forced or targeted PL run.
2. `e1Decide` (qa/pt_land_offline.js:252-263) tests `pin.source !== src` before `force === '1'`, so with the stale pin a forced run takes the identical replay-stale path (the forced AH replay printed "pin stale" too).
3. All 7 E1 parts (land tool, guard, guard_integrity_check, fixture-template, run-tmp, spawn-meter, exec-env-fingerprint) and the suite file were byte-identical to HEAD 1c37a7f; their mtimes were before step 10 started and unchanged since.
4. The env key 5257c227... is identical in the step-10 run and the forced AH replay.
5. Nothing mandatory is bypassed: step 7 re-checks the pins, because AH and PL must then SKIP.
Confirmation: step 7 printed SKIP (pin matched) for both AH (5c3fae45...) and pt-land (72a8c0b6...). Pins set: AH_CONTRACT_PIN.source 7e2484b6... to 5c3fae45117124d54f444fc4e4f4177e7fddae94cba254aa8f4ee93410737e0c; LAND_CONTRACT_PIN.source 49dd7621... to 72a8c0b66d0e721533177eb4cae2e209d1058fabbe1b27f2a44875c420e0888e; environments unchanged.

## Disclosures
- Indentation correction (Owner ruling, step 4): the first candidate printed the scratch lines with two leading spaces; the Owner ruled brief 2.2 exact, so the printers were changed to no indentation in the candidate build (`mk-cands.js`) and the PL-62 expectations were updated. Candidate land tool sha256 082c201f... became ea195ac14c9cb80ad77586d7d0c2c49d00ab3239ba9d87adc33bb257ffa29127; the PL and AH targeted runs were repeated after it.
- R12 form denials (2, both logged and reissued once in compliant form, no STOP-6): `git rev-parse HEAD:<land tool path>` (TS-1) and `git ls-files --eol` listing the land tool path were refused because the command text named the land tool; reissued as `git ls-tree HEAD .claude/hooks/` and `git ls-files --eol .claude/hooks AGENTS.md ...`.
- CRLF normalisation in `withMutantSource` (qa/pt_land_offline.js): the source is normalised to CRLF before the existing CRLF-anchored MUT-OAG anchors apply, because an LF candidate would never match them.
- WEP re-anchor: the old planted negative "runCli maps a grant for any tool (Bash granted)" is re-anchored on `(!fileGrant && !stageGrant)) return block(` (narrowed, not removed, as 3.2 requires).
- Candidate builder: the 2000-line protected targets cannot be reproduced by a Write, so a scratch script (`mk-cands.js`, under `<os.tmpdir()>/pt-worker-permission-profile-1/`) builds the four candidates from `git show HEAD:<target>` plus the brief 2 edits, each anchor asserted to occur exactly once, with a settings diff assertion. No Edit or Write touched a protected path in the slot. manifest.json also carries a sha256 per entry (ignored by `loadManifest`).
- Dialog-mismatch / parallel-batch incidents (2, for the permission-friction audit): in each, two or more Bash calls sent in one parallel batch produced an approval dialog that showed a different command than the tool header; the Owner interrupted, all calls in the batch were rejected, nothing ran, and each command was reissued singly. First: `node .../mk-cands.js` with the process check. Second: four step-5 verification commands (ls-tree, two blob rev-parses, the tree rev-parse). Every Bash call since has been issued alone.
- TEMPORARY Owner-ruled local permission rules: 4 exact allow rules in `pt-wt-worker-a/.claude/settings.local.json` (card lines 376-379), installed by MAIN with the Owner's authority as an interim measure. They are not task evidence and are removed at cleanup.
- Killed and overlong runs (not evidence): the first step 6.1 `npm run qa:offline` (task b8s64if83) was killed by Claude Code for critically low memory; the forced PL replay (bwzqxqrzo) was killed the same way; the Owner-approved foreground retry of step 6.1 passed the 600 s tool timeout and finished in the background (task bh96e21pi, PASS).
- Four undeclared stale contract pins: the TEMPLATE, GIT, TB and RESYNC contract pins digest the land tool (or the guard) and went stale; the brief's preflight did not declare them (brief-preflight gap). They still replay their heavy proofs, as REPLAY PASS with pin stale notes (task-base and pt-land-resync show the line; fixture_template and git_contract ran in full in step 10). They remain stale and are not edited here; they are fixed in the follow-up task qa-lifecycle-v2.
- R16 observation: none yet at the time of writing. The slot has run the new guard since 1c37a7f, but the only `git add` here before step 9 predates it. This is an observation only, not live-check evidence; step 9's staging call may show whether the grant applied.

## Codex ledger
- Round 1 (step 3, read-only, real diff plus the four candidates): PASS, no Class I or Class II findings. Raw output in `codex.md`.
- Final check (step 8): see the line below.

Final check: 1 round, 0 class-I findings, 0 class-II findings, verdict PASS; no implementation change, no QA re-run. Raw output in `codex.md`.

## Backlog reconciliation
- Brief row: none. `BACKLOG.md` not edited; no entry heading changed.

## Lessons
- [rule] A new Worker staging grant must be keyed on raw-string equality of the command (an anchored regex with no shell metacharacters possible), and its planted negatives must be anchored on production text so the mutant changes one decision, e.g. the R12-text row to prove ordering.
- [design] A changed protected tool silently stales every contract pin that digests it. Preflight must list the suites whose pins digest the protected targets (TEMPLATE, GIT, TB, RESYNC here), or the LAND QA turns into an hour of undeclared replays.
- Parallel Bash batches in a Worker session can mismatch the approval dialog and the tool header; issue each Bash call alone.
- Heavy suites and a full `qa:offline` need free memory first; a background run can be killed for low memory and is then not evidence.

LAND-EVIDENCE: qa-offline=PASS 105; targeted=PASS; codex-classI-unresolved=0
