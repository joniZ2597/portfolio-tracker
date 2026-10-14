# review.md — qa-pin-decouple-1 (task/qa-pin-decouple-1, Worker A, base c004a57)

Brief: `work/qa-pin-decouple-1/brief.md` (blob SHA256 `6d389032230f0927213a6acdeed2385eb70571270656f48a28d856b18dee30d0`, unmodified). Task record: mode task-record, base `c004a57`, started 2026-10-14T12:44:52Z. Raw evidence: `qa.log`, `codex.md`, `plan.md` (untracked, gitignored).

## Step 0
Baseline blob check: all seven §1 code files equal their `28a0c7b` blobs. Baseline `npm run qa:offline` (Bootstrap heavy-lane clearance 2026-10-14T12:52:22Z): PASS, 87 suites, 137.6 s, one pre-existing advisory warning (smart quote, `index.html:10976`).

## S1 RED
Only the §4 assertion changes were applied (six suites; E1-4 title unchanged by Owner ruling). Against the unchanged gate: `pt_land_offline.js` FAIL 3/69 (E1-4 three G3 rows, E1-5 stale line `null`, the old re-pin verdict); the new FT-0 and GC-4 gate-table expectations: 5 of 12 rows RED (the stale rows and the missing-pin TypeError). The two "malformed pin + stale source" rows passed by accident before the change and are guarded by the lib negative below. Owner ruled the brief's S1 does not require six separate full RED runs.

## S2 GREEN
R-1: `gateDecision` returns `replay-fail` for no pin, a source that is not a non-empty string, or a pin with a malformed source or environments, before the source comparison (Owner clarification); a valid pin whose source differs returns `replay-stale`; an empty `environments` array stays valid. R-2: the four E1 suites. R-3: FT verdict row. R-4: GC-4 verdict. R-6: comments. Diff: seven files, 75 insertions / 40 deletions, no line-ending churn.

Targeted (exact command-card form, one at a time): `fixture_template` PASS 21 (stale NOTE); `pt_land` PASS 68, `pt_land_resync` PASS 22, `task_base` PASS 26, `auto_mode_hardening` PASS 4287 (each printed `REPLAY PASS (pin stale, re-pin optional) … 0 heavy skipped`); `git_contract` PASS 34 (printed `SKIP (contract pinned: 552ccfc8e1ee/ef28452b4eb8)`, see the GC-4 ruling); `pt_land_logic` PASS 103, `pt_land_resync_logic` PASS 33, `run_isolation` PASS 26.

## DoD-2 negatives (scratch copies outside the repo)
- Empty pin, and malformed or missing environments with a stale source: caught by the gate table rows; the lib check removed in a scratch copy fails 4 rows.
- Stale treated as skip (lib scratch copy): fails 2 rows.
- `PT_QA_FORCE_HEAVY=0` on `pt_land_resync`: FAIL 1/23, `invalid PT_QA_FORCE_HEAVY (only 1 is accepted)`.
- One E1 heavy row skipped on `pt_land_resync`: FAIL 1/22, `1 heavy unit(s) skipped under a replay`.
- One behavioural break (integrity module report text) on `task_base`: FAIL, `TB-1` fails (`TB-10` and `TB-12b` fail only because the scratch copy has no `.git`).
- **One FT heavy row skipped: CAUGHT (proven by the second attempt).** The first scratch copy crashed at load (the suite reads git history with `git show`, and a `.git` copy to give it history was denied by the hook, R10-3, not retried). Under the Owner's FT ruling the negative was rerun without Git clone and without any `.git` copy: a scratch copy of the suite in `/tmp/pt-qa-pin-decouple-1/`, edited only with the Edit tool so that `ROOT` is the real worktree (read-only) and the four relative imports are absolute paths into it, with one planted mutation that skips the final heavy row (FT-7 planted negative) under the stale pin. A diff against the real suite showed exactly those seven hunks. One run: exit 1, `FAIL FT-0: the gate … -- a stale pin never skips a heavy row` / `1 !== 0` / `OFFLINE VALIDATION (fixture templates): FAIL (1/20)`. The only failure is the R-3 assertion `skippedHeavy === 0` under `replay-stale`; the other 19 registered rows passed and there was no Git-setup failure. The real repo, suite, pins, task record and brief were not changed.

## Step 10a (full `npm run qa:offline`, one run under Bootstrap clearance 2026-10-14T15:19:06Z)
PASS: 87 suites (= Step 0), 14 phases, 0 failures, 3031203 ms, one pre-existing advisory warning, exit 0. Tree: `c004a57` plus the seven modified QA files plus this untracked `review.md`.

Stale-pin lines (every heavy test ran, 0 heavy skipped):
- E1 auto-mode-hardening: src `d27722c7e9229a39c0c36ebca2d939dd7a64fd3e20fcde3874d33b68f9220823`, env `5257c227140204f038c0ec7eb724abb44dbf4e31a2c6d3c5e8a6f07727f1aeb0`, 22 heavy blocks / 4287 assertions.
- E1 pt-land: src `00b41e9e1e3fa5ececf88ea3c11d0179fd8ba2bb2f4c9bd46709f166355aab64`, same env, 48 heavy + 20 light rows.
- E1 pt-land-resync: src `3bd1e8d09bc1e717391c41e3b146c18be21eca7a14e22605369d01dab4be601c`, same env, 17 heavy + 5 light rows.
- E1 task-base: src `fa5f20c702f153b7bc9f635c5398babf63d6e68c77c0ec94efdee2f288ff59c7`, same env, 21 heavy + 5 light rows.
- fixture_template (FT-0): src `2477be30067a21f32b30e9006b75d85a3ff9b2ea90b5f3245072065d441dedb8`, env `ef28452b4eb84527b7208fc76792410d4948cc9d0fa91173a94c79edefa90858` (the runner does not forward the suite's NOTE line; the digests are from the targeted run on the same sources).

GC-4: PASS; the approved pinned `SKIP (contract pinned: 552ccfc8e1ee/ef28452b4eb8)` (targeted run on the same sources; the runner does not forward the line). `GIT_CONTRACT_PIN` unchanged, no forced replay.

## Pin update and tested commit
The five stale `source` values were updated from the step-10a digests (exactly five `source:` line changes against `c004a57`; no `environments` line changed; `GIT_CONTRACT_PIN` untouched). Owner ruling: the brief's §7 pin-only restriction applies to the pin changes, not to the whole tested commit, so the implementation and the five pin updates are one commit: `f0483ee` (`f0483ee9a31a542f090a8b39a1fa63b54a48f54a`), seven QA files, 80 insertions / 45 deletions. A first commit attempt was denied by the pre-tool hook (R12, the message text named the land tool through two suite names); it was not retried and the Owner approved one neutral-message attempt, which succeeded.

## Codex step 8 (raw in `codex.md`)
| # | Finding | Class | Decision |
|---|---|---|---|
| 1 | GC-4 stays pinned, so the brief's step 10a GC stale line, 153-scenario replay and Owner GC pin line cannot occur as written | I (brief conflict) | DEFER to the Owner ruling below; no fix exists inside §1 without widening the GC-4 digest (§3) |

No implementation findings: only the seven §1 files changed, §4 matches the brief, nothing in §3 was weakened, a malformed pin fails before the source comparison, and `replay-stale` cannot skip a heavy unit or hide a failure.

Final check (after Step 10b, on the tested commit `f0483ee` plus this `review.md`; raw in `codex.md` under "Final check"): **PASS, no findings** (Class I or II). The earlier Class I item is resolved by the Owner ruling below; no Class I remains unresolved; the implementation is unchanged since step 8 apart from the five pin source lines.

## Owner ruling: GC-4 (2026-10-14, "approved with verification")
For this task only, step 10a may accept the existing GC-4 `SKIP (contract pinned: …)` instead of the stale-pin NOTE and the full replay, provided the three conditions below hold. `GIT_CONTRACT_PIN` stays unchanged, with no forced GC replay and no artificial repin. The final pin commit updates only the five stale pins (FT and the four E1 suites). Step 10b must still show all six SKIP outcomes. The approved brief is not modified.

Verification (read-only):
1. **153/153 replay.** `work/qa-stage2-git-contracts/review.md` records the 2026-10-07 replay: 16/16 batches, 153/153 identical, for source digest `77a1bc91…`. The pin now in the file, `552ccfc8e1ee3924571063b210d2da97285331bb82f97683ab389738b20d80ed`, was set by the task-base-record task (commit `4ca4c90`, 2026-10-09): its fixed-candidate replay was 153 scenarios (2405 recorded Git calls) identical in 16/16 batches, then re-pinned. Date nuance: the code comment says 2026-10-07, but the replay that validated this digest is the 2026-10-09 one.
2. **Digest equality.** `node qa/git_contract_offline.js` printed `SKIP (contract pinned: 552ccfc8e1ee/ef28452b4eb8)`, which is printed only when the full 64-hex source digest equals the pin and the environment digest is in the pin.
3. **Inputs unchanged.** `git diff --name-only c004a57` lists exactly the seven task files, none a direct GC digest input. The two inputs that live inside files this task edited (the nine land helper functions and the resync suite's `buildFixture`) compare byte-identical to base: 10 of 10 the same.

Consequence: R-4's `NOTE  pin stale` line is covered only by the GC-4 gate-table row and the decision logic; no real run in this task can produce it.

## Step 10b (full `npm run qa:offline` on the tested commit, one run under Bootstrap clearance 2026-10-14T16:29:12Z)
Tested commit: f0483ee9a31a542f090a8b39a1fa63b54a48f54a (`f0483ee`), tracked tree clean (only this untracked `review.md`).

PASS: 87 suites (= Step 0 = Step 10a), 14 phases, 0 failures, 142610 ms, one pre-existing advisory warning, exit 0.

All six pinned suites report SKIP:
- E1 auto-mode-hardening: `SKIP (contract pinned: d27722c7e922/5257c2271402) 22 heavy block(s) not run, 4065 assertion(s) PASS`
- E1 pt-land: `SKIP (contract pinned: 00b41e9e1e3f/5257c2271402) 48 heavy row(s) not run, 20 light row(s) PASS`
- E1 pt-land-resync: `SKIP (contract pinned: 3bd1e8d09bc1/5257c2271402) 17 heavy row(s) not run, 5 light row(s) PASS`
- E1 task-base: `SKIP (contract pinned: fa5f20c702f1/5257c2271402) 21 heavy row(s) not run, 5 light row(s) PASS`
- fixture_template: `SKIP (contract pinned: 2477be30067a/ef28452b4eb8) 16 heavy real-Git row(s) not run`, PASS 5 (direct run on the same tree; the runner does not forward the line)
- git_contract (GC-4): `SKIP (contract pinned: 552ccfc8e1ee/ef28452b4eb8)`, PASS 34 (direct run on the same tree; `GIT_CONTRACT_PIN` unchanged, no forced replay)

## Timing
- Step 0 baseline `qa:offline`: 137.6 s. Step 10a (five stale suites replaying their heavy tests): 3031.2 s (50.5 min). Step 10b (all pinned): 142.6 s.
- Targeted heavy suites during S2 (stale pin, every heavy test run), each started in the background after the 600 s tool timeout or finished inside it: `pt_land`, `pt_land_resync`, `task_base`, `auto_mode_hardening`; `git_contract` ran pinned (SKIP).
- DoD-2 suite negatives in scratch copies: 384 s, 375 s, 594 s (plus a 2 s load crash on the first FT copy), then the FT negative.

## Backlog reconciliation
none (the brief's Backlog row is `none`; the finished work has no backlog effect and no `BACKLOG.md` edit was made).

LAND-EVIDENCE: qa-offline=PASS 87; targeted=PASS; codex-classI-unresolved=0
