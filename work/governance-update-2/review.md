# governance-update-2 - review

Branch `task/governance-update-2`, base `61691df`. Commits: `dbc316e` (S1, AH suite), `512c23b` (PROTECTED commit, `AGENTS.md` + `.claude/settings.json`), `9f63bfa` (AH_CONTRACT_PIN, pin-statement-only).

## Codex findings ledger

| # | Step | Finding | Class | Decision | Reason |
|---|---|---|---|---|---|
| 1 | 8 (S1 implementation diff) | `FAIL AH-16 real: HEAD restored -> allow`, seen in Codex's own run of `AH_SETTINGS_PATH=<candidate> node qa/auto_mode_hardening_offline.js`; Codex could not tie it to the diff and reported the candidate run as incomplete | I | **REJECT** | Sandbox artifact. Codex ran inside `--sandbox read-only` through PowerShell, where AH-16's real-repo HEAD-restore step cannot complete. The same command outside that sandbox passed in full: `Auto-mode hardening: PASS (4287 assertions)`, E1 REPLAY PASS (override AH_SETTINGS_PATH), 0 failures. The later forced replay on the protected-commit tree also ran all 22 heavy blocks with AH-16 passing (4287 assertions, the only failure the expected re-pin line). The diff does not touch AH-16 or any existing row. The rest of Codex's review found the 7 / 2 / 11 lists, the EXPECT_* derivations, the bypass-key check and the six planted negatives correct. |
| 2 | 12 (final check) | Class II: `review.md` is untracked while listed as tracked evidence | II | **REJECT** | By design: `review.md` is committed after this check (step 13 commit); a Worker cannot commit it earlier than its own review. Not a defect. |
| 3 | 12 (final check) | Class II: "pending routing" wording | II | **REJECT** | Occurs only on `[rule]` lesson lines, which the step-12 self-check exempts; no section reads Pending or TBD. |

Final check: 1 round, 0 class-I findings, 2 class-II observations both REJECT (no defect); no implementation change, no QA re-run. Self-check: both `work/governance-update-2/` paths named exist, counts match `qa.log`, no Pending/TBD section.

Raw evidence preserved verbatim in the gitignored `work/governance-update-2/codex.md` (step 8 section, including Codex's own exec transcript and the AH-16 line). Not paraphrased here.

## QA evidence

- Baseline (step 0, `task/governance-update-2` @ `61691df`): `qa:offline` PASS, 81 spawned suites, 81190 ms, 4 E1 SKIP lines (AH pin `bda8013612f9`).
- S1 validation: candidate settings (sha256 `48172673ed8a...`) PASS 4287 assertions (E1 replay via `AH_SETTINGS_PATH`); the current `settings.json` fails AH-8 only (1 of 4277), so the suite bites.
- Protected commit `512c23b`: committed blobs `AGENTS.md` sha256 `3de6f56d4de0b891b51a96b1e550e762136c92ff3c5fccfc90ea41177606ec76` and `.claude/settings.json` sha256 `48172673ed8a58827593af9cd75296655a02ffaea57a0af0852b30d9f5ff3025`, equal to brief section 1.
- Lightweight suites on the `512c23b` tree: instruction_layer PASS (58), git_contract PASS (34), fixture_template PASS (5, heavy rows SKIP per its pin), run_offline_discovery PASS (42).
- Pin initialisation (one forced replay, Owner heavy-lane approval, `PT_QA_FORCE_HEAVY=1 node qa/auto_mode_hardening_offline.js` on `512c23b`, 105 s): 4287 assertions, 1 failure, which is exactly `E1 auto-mode-hardening: re-pin required: source 89e9b370f9fb29ec6fb298d1316ee432a1097c3cd2847399d68a609aed75be90 environment 5257c227140204f038c0ec7eb724abb44dbf4e31a2c6d3c5e8a6f07727f1aeb0`. Valid per brief S2.
- Independent source-digest recompute (scratch script outside the repo, reading the committed blobs with `git show HEAD:<path>`, LF-normalised, pin statement neutralised): `89e9b370f9fb29ec6fb298d1316ee432a1097c3cd2847399d68a609aed75be90`, equal to the printed value. Environment key unchanged.
- Pin edit `9f63bfa`: one line, `AH_CONTRACT_PIN.source` only (`bda80136...` to `89e9b370...`); environments unchanged. Post-pin non-forced AH run: SKIP (contract pinned: 89e9b370f9fb/5257c2271402), PASS 4065 assertions, 2 s.
- Step 10, full `npm run qa:offline` on the final code tree (`9f63bfa`): PASS, 81 spawned suites (count unchanged), 75138 ms, 1 advisory warning (same as baseline), all four `E1 ... SKIP` lines present with AH on the new `src12` `89e9b370f9fb`; pt-land `d4dc37aa7584`, pt-land-resync `043981f5b4cd`, task-base `19cdac7a0634` unchanged; no GC-4 / FT pin changed (neither suite is in the task diff).
- Timing: forced AH replay 105 s (one run, no second heavy run); full qa:offline 75 s vs 81 s baseline.

## Backlog reconciliation

Brief Backlog row: `none` (BACKLOG 29 is a separate prerequisite, not closed here). Action taken: `none`. No BACKLOG.md entry changed; the finished work's effect is `none`, matching the brief, so no edit and no STOP-1.

## Files changed
- Implementation (3): qa/auto_mode_hardening_offline.js, AGENTS.md, .claude/settings.json
- Evidence (tracked): work/governance-update-2/brief.md, work/governance-update-2/review.md

## Lessons
- [rule] The R1 hook blocks `cp`/writes onto any file whose basename is `AGENTS.md` or `settings.json`, even in `/tmp/pt-<id>/protected/`; step-13a flat candidates need other names (e.g. `agents-candidate.md`), mapped by the manifest `source`. - pending routing
- [rule] `git commit` must be one standalone top-level command (R3c): no `&&`, no heredoc message, no `$(...)`; use `-m` twice for the trailer. - pending routing
- [rule] A Codex review run in `--sandbox read-only` can fail real-repo rows (AH-16) that pass outside it; judge such a failure against a run outside the sandbox before classifying. - pending routing

## LAND-EVIDENCE
LAND-EVIDENCE: qa-offline=PASS 81; targeted=PASS; codex-classI-unresolved=0
