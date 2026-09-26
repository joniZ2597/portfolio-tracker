# Review: Merge/rebase hook enforcement (hook r8)

Evidence only; authorizes nothing. Brief: `work/merge-rebase-hook/brief.md` (approved commit `acd8525`). Diff base `459f4d7`.
Mode: Manual. Worker slot: `pt-wt-worker-a`, branch `task/merge-rebase-hook`.

## Result
- `git merge`, `git rebase` and `git pull` (all forms, every wrapper the classifier resolves) are a deterministic **deny** (CLI exit 2) in every
  Claude Code session: Worker slot, main checkout, other cwd, empty cwd and missing cwd — Bash and PowerShell.
- Read-only git stays allow; `git commit` stays ask; `git push` stays deny (R3g wording unchanged); R1/R2/R2b/r5/r6/r7 unchanged (differential).
- `settings.json`, `AGENTS.md`, `CLAUDE.md` untouched.

## Hook r8 (Owner-copied, hash-checked)
- Built in scratchpad by a scripted exact-replacement of the r7 bytes (LF-only, count-checked anchors); Worker never wrote `.claude/hooks/**`.
- Owner copied it into the slot; destination SHA256 `5195978afd16fe28a2db1611509887e65d565e08928f1141ac50ab2f454e48e9` = candidate; r7 was `bbe063eb…6e78`.
- `git diff 459f4d7 -- .claude/hooks/`: 3 insertions, 3 deletions — (1) `INTEGRATION_SUBCOMMANDS += 'pull'`; (2) `decisionFor`: `'integration'` moved into the
  unconditional deny group beside `'push'`; (3) R3m reason text on the integration finding.
- **R3m wording is Worker-chosen** (the brief does not define it; no definition exists in the repo): `git <sub> - denied in every Claude Code session (R3m); run merge, rebase and pull manually from a normal terminal`.
  Slot sessions still get the existing ` - denied in Worker-slot sessions (R1)` suffix, as push does.

## QA
- Pre-edit baseline: `npm run qa:offline` PASS, 50 suites (first line of `qa.log`).
- Tests first: suite vs r7 red only on AH-15 rows and the flipped rows below.
- Post-copy: `node qa/auto_mode_hardening_offline.js` PASS (2396 assertions); full `npm run qa:offline` PASS, **50 suites**, 1 pre-existing advisory warning.
- Differential r7↔r8 (scratchpad `differential.js`): 9306 unique inputs (2503 recorded from the suite + 7488 generated, deduplicated); 8291 identical (decision and reason),
  1015 changed — every one a merge/rebase/pull row, r7 allow/ask/deny → r8 deny with the R3m reason; **0 violations; 0 PowerShell rows changed**.
  Unchanged (identical): cherry-pick, am, revert, reset --soft/--mixed, update-ref (non-delete), branch -f, fetch, merge-base, commit, push, status, `git -c alias.m=merge m`.
- Activation gate G1–G3 on the copied r8 (`scratchpad/g123.js`, spawnSync): G1 `C:\Program Files\nodejs\node.exe`, v24.14.0; G2 allow → exit 0 empty stdout, ask → exit 0 + `permissionDecision:"ask"`,
  deny (`git push --force`) → exit 2 + stderr; G3 deny exit code = 2, incl. main-cwd `git merge --ff-only x` (the incident), `git pull`, `git rebase branch-dev` (all with R3m on stderr) and slot `git merge x`; malformed stdin → exit 2. **PASS.**
- G4 / L1–L5: Owner post-LAND live checks. L1–L5 are not specified anywhere in the repo, so no content is asserted here.

## Suite changes (`qa/auto_mode_hardening_offline.js`)
- `AH_HOOK_PATH` override (precedent: `AH_SETTINGS_PATH`) — used to prove the candidate before the copy; default path unchanged.
- **AH-15**: merge/rebase/pull × 10 cwd forms × 13 ops; git-prefix forms (`-C`, `-c`, `--git-dir`, exe, quoted paths); 31 wrapper templates × 3 commands × 3 cwds (+ `-EncodedCommand`);
  PowerShell rows; reason rows (R3m + manual path; slot adds R1); controls (read-only, lookalikes `merge-base`/`merge-tree`, echo/commit-message text, commit ask, push deny, checkout/switch);
  CLI rows (slot, main, empty cwd, missing cwd with `CLAUDE_PROJECT_DIR` unset / = main / = slot → all exit 2, empty stdout, R3m on stderr).
- **Mutants** (four kinds; the first has three instances): subcommand dropped (merge / rebase / pull); integration decision slot-conditional again; R3m reason reverted; prefix match over-blocking lookalikes.
- **Existing assertions flipped (M6 — the brief named AH-11 and AH-7; the suite has more; same intent, brief wording under-counts):**
  AH-2b `MERGE_REBASE` main ask → deny · AH-3 `WRAP_MERGE` main ask → deny · AH-7 non-slot merge/rebase ask → deny · AH-11 control merge/rebase main ask → deny.
- **Existing mutants re-pointed:** "slot detection broken" now probes `netlify deploy` (merge no longer separates slot from main); "push downgraded to integration" now mutates to `cls: 'netlify'` (integration equals push under r8, so the old mutant became equivalent).

## Codex (independent, read-only, `codex exec --sandbox read-only`, codex-cli 0.157.0; raw in `codex.md`)
| Pass | Finding | Class | Disposition |
|---|---|---|---|
| Implementation diff | "Scope violation: the diff modifies `.claude/hooks/pretooluse-guard.js`; the brief puts r8 outside the repo and Workers never write it" | I | **REJECT** — misreads the brief's sequence. The Worker did not write the file: the Owner copied the scratchpad candidate after a hash check (destination SHA256 = candidate), exactly as brief scope item 1 and its Order line prescribe; the copied hook is part of the implementation diff by design (r8 must land in the repo). |

## DEFER / accepted gaps (not fixable under "no other hook change")
- Non-`!` git aliases (`git -c alias.m=merge m`, config aliases) still bypass the classifier — r7 behaviour, identical to `alias.p=push`; differential shows allow→allow. Belongs to a later guard-hardening task.
- RM3 ref-moving equivalents (update-ref non-delete, `branch -f`, `reset --soft/--mixed`, cherry-pick, am, revert) stay allow, per RM3; differential shows them unchanged. Not pinned in QA (unruled behaviour).
- `runCli` missing-cwd fallback to `CLAUDE_PROJECT_DIR` (Owner-accepted DEFER 2026-09-27): unchanged, but r8 makes integration independent of it — AH-15 CLI rows deny in all three env combinations.
- `git merge --abort` / `git rebase --abort` are also denied (RM1 has no carve-out); recovery runs from a normal terminal.
- The prior review's known gap "`git pull` … allowed" is closed by RM2.
- Loose `.claude/settings.backup.json` is untracked, predates the task, is outside every diff, and must be removed by the Owner before LAND can show a clean status.
- Live effect: this slot session runs r8 now; the main checkout stays on r7 until LAND.

## Files changed
- Implementation (2): .claude/hooks/pretooluse-guard.js, qa/auto_mode_hardening_offline.js
- Evidence (tracked): work/merge-rebase-hook/brief.md, work/merge-rebase-hook/review.md

## Lessons
- [rule]     A change to a gate's decision table must be swept for existing assertions AND mutant probes that used the changed row as their discriminator (a mutant whose probe stops separating the case it targets survives silently) — text for AGENTS.md: "When a task flips a guard decision, list every existing row and mutant probe that relied on the old decision in review.md and re-point the probes."
- [local]    R3m was undefined in the brief; the Worker chose the wording and the Owner ruled it by copying the hash-checked file.
- [covered]  Hook candidates are built by scripted byte replacement and hash-checked before the Owner copy — already covered by brief R3 / this brief's Order line.

Final check: 1 round, 0 findings (verdict PASS); no implementation change, no QA re-run.
