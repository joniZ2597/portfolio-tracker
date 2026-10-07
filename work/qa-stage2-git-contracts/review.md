# Review — qa-stage2-git-contracts, Stage 2: zero-process decision tests on recorded Git contracts, real-Git thinning, template-contract gating

Brief: `work/qa-stage2-git-contracts/brief.md` @ `5844eab` (brief-only commit). Baseline `bb9f94c59e4ca3faae94cbdfad48c36a2fc70eea` (`branch-dev`, Stage 1 landed).
Mode: Manual (attended), Worker A, with the mid-task Owner gate G-MAP. Test-only: no tool, hook, product, `qa/run-offline.js`, `AGENTS.md` or `CLAUDE.md` change.

## Summary

The decision rows of the two land suites now run without any process: each moved row replays a Git transcript recorded once against real Git, through a strict load-time fake that answers only from the transcript and throws on anything unscripted, and proves "nothing changed" through the zero-process oracle (no mutating call and byte-identical watched directories, except the expected audit line). One real-Git representative per family stays real, and every row whose point is Git, process or file-system semantics stays real. The 153 recorded scenarios are proven against real Git by a digest-gated contract suite (GC-4), executed in resumable batches of 10 with a memory floor, and skipped only while the pinned source digest and the pinned environment digest both match. The template-equivalence proofs (FT-0) are gated the same way.

**Result against the brief's gates**

- A1 Git starts: **MET** — main 2,244 (≤ 2,400), resync 1,443 (≤ 1,500); both logic suites exactly 0 Git and 0 Node starts; the pinned FT and GC suites 2 and 4 starts.
- A2 heavy-suite runtime: **MET** — main 8.1 min, resync 6.6 min, FT pinned 0.5 s, GC pinned 1.1 s; heavy body 14.7 min (≤ 18). Measured once each on a quiet laptop, not as a median of two.
- A3 full `qa:offline`: **MET** — PASS, 63 suites, 14 phases, 0 failures, 683,861 ms (11.4 min; ≤ 26). Stage 1 measured 73.5 min.
- A4 coverage preserved: **MET** — every one of the 166 + 49 rows is accounted for in `row-map.md`; every M row has a logic row with the same name + ` [logic]`, the same outcome assertion and the oracle; every previous mutant still exists (real or under the fake) and is caught by assertion or oracle, never by `UNSCRIPTED_GIT` alone; dual-run identity 153/153; the GC-3, GC-4 and FT-0 planted negatives bite.

## Files changed

- Implementation (13 entries, 33 files): qa/lib/git-fake.js (new), qa/lib/git-transcript.js (new), qa/lib/exec-env-fingerprint.js (new), qa/fixtures/git-contract/*.json (new, 21 family transcripts), qa/tools/record-git-transcripts.js (new, not a suite), qa/tools/pt_land_dualrun.js (new, not a suite), qa/git_contract_offline.js (new), qa/pt_land_logic_offline.js (new), qa/pt_land_resync_logic_offline.js (new), qa/pt_land_offline.js, qa/pt_land_resync_offline.js, qa/fixture_template_offline.js, qa/run_isolation_offline.js
- Evidence (tracked): work/qa-stage2-git-contracts/brief.md, work/qa-stage2-git-contracts/review.md, work/qa-stage2-git-contracts/row-map.md (the G-MAP deliverable the brief lists under §8)

## Step 0

Owner-ruled baseline (not a fresh run): the Owner's full `qa:offline` on the Stage 1 checkout at `bb9f94c` — PASS, 4,411,546 ms (73.5 min); `pt_land_offline.js` 5,869 Git starts in 2,275,931 ms, `pt_land_resync_offline.js` 3,216 starts in 821,208 ms, `fixture_template_offline.js` 1,028,555 ms. The Owner ruled not to re-run the 74-minute baseline for Step 0, since removing that cost is this task's purpose.

**Suite-count reconciliation (Owner ruling 2026-10-07).** The brief says 59 → 62; the runner counts 63. At `bb9f94c`, 71 suite files are tracked and the runner's `OFFLINE_TESTS_DENYLIST` excludes 11 (nine frozen `arc_*` / phase-gate suites, `fund_facts_read`, `news_catalysts_provider`), so 60 are discovered; Stage 2 adds 3 → 63. No suite file was added or removed between `bb9f94c` and HEAD. The brief's 59 was a counting error in its own wording; 63 is the expected actual total.

## Tests first

`qa/git_contract_offline.js` against no helpers: RED (the suite cannot load); after `git-fake.js`, `git-transcript.js` and `exec-env-fingerprint.js`: GC-1 … GC-3 and FP GREEN (26 rows) before any transcript existed. The logic suites were written against the scenario table before recording and were RED until the transcripts were recorded.

## G-MAP (mid-task Owner gate)

Delivered before any row was deleted: `row-map.md` (every row K / M / D / R / Z with replacement, remaining real coverage and planted negative), the dual-run summary (153 scenarios, 153 IDENTICAL, 0 mismatches, 0 stored-transcript differences, 1,465 s in 16 bounded batches) and the Codex review of both. Deviations from the brief's §5 tables, approved at G-MAP: main 102 M (not 104: the empty first "PL-8: brief missing at base" row retired, the exports precondition already zero-process), resync 32 M (not 33: RS-12 stays real because it asserts CLI text). The three per-scenario oracle allowances of note N3 (`failed-mutating` for the three RS-2 rows, `remote-read` and `object-only` for PL-53 and MUT-OAG-4) are declared per scenario and in use as proposed; the optional D-4 transcript shrink was not taken (21 files, 5.7 MB).

## QA

| Suite | Result | Note |
|---|---|---|
| `qa/pt_land_offline.js` (alone) | **PASS 63** | 166 → 63 rows: 48 K + 15 Z, 102 M removed, 1 R; 2,244 Git starts, 488 s, 185.6 ms per start |
| `qa/pt_land_resync_offline.js` (alone) | **PASS 17** | 49 → 17 rows: 17 K, 32 M removed; `mutantRow` control memoised per helper (D); 1,443 Git starts, 393 s |
| `qa/pt_land_logic_offline.js` | **PASS 103** | `git=0 node=0 other=0` asserted by the meter; 102 moved rows + the meter row |
| `qa/pt_land_resync_logic_offline.js` | **PASS 33** | `git=0 node=0 other=0`; 32 moved rows + the meter row |
| `qa/git_contract_offline.js` (pinned) | **PASS 34** | `SKIP (contract pinned: 77a1bc916bd3/ef28452b4eb8)`; 4 Git starts |
| `qa/fixture_template_offline.js` (pinned) | **PASS 5** | `SKIP (contract pinned: 16159dc55d59/ef28452b4eb8) 16 heavy real-Git row(s) not run`; FT-6 retired |
| `qa/run_isolation_offline.js` | **PASS 26** | RI-6 whole-file equality and its negative retired; structural checks E1 / E2 / E3 kept with their negatives |
| full `npm run qa:offline` | **PASS, 63 suites, 14 phases, 0 failures** | 683,861 ms (11.4 min); free memory 3,912 MB before, 4,125 MB after; no other heavy QA running |

Non-failures in the full run, noted for completeness: one advisory warning ("index.html has 1 smart quote char(s) inside script blocks at line(s): 10652") is pre-existing (present in the Stage 1 full-run logs; `index.html` is untouched by this task); the two "[PT] pt_cash: save failed Error: QUOTA_EXCEEDED" / "pt_fx: restore write failed" lines inside the passing Phase 8 are planted-failure output present in every earlier full-run log.

## GC-4 contract replay — batched execution and pin evidence

Owner ruling 2026-10-07: the monolithic replay of all 153 scenarios (killed once by low memory) was replaced by resumable batches of 10, in table order: free memory is read before each batch and the run stops below `GC4_MEMORY_FLOOR_MB = 2048` (Owner-approved); a batch is persisted (atomic write + rename) only after every scenario in it replayed identically; the first mismatch or scenario failure stops the run at once and that batch is never persisted; a rerun resumes from the first incomplete batch; the state is keyed by source digest, environment digest and the ordered id list and is never reused for other inputs; the pin verdict is reached only when every batch of every scenario is complete. The per-scenario comparison (calls, result, opts, file-system inputs, audit lines, real "nothing changed" verdict) is unchanged. Five zero-process regression rows prove the plan covers all 153 scenarios exactly once in batches of 10, that resume never skips a scenario, that a failed or incomplete batch is never pin-eligible, that the memory floor stops the run before the batch, and that a state for other inputs is discarded. Planted mutants of the helpers (memory check dropped, failed batch persisted early, resume skipping a batch, batch size 20, mismatch not stopping, environment digest dropped from the key, pin-eligibility defences dropped) are each caught; one mutant that drops only one of two pin-eligibility defences is equivalent (no observable change).

- **Real run 1** (17:18–17:28 UTC): batches 1–8 identical; **stopped at batch 9** — `pl42-absolute-source` differed in result and file-system inputs. Root cause: the scenario table evaluated `path.join(os.tmpdir(), 'abs.js')` at module load, before the recorder isolates its temp root, so the stored transcript carried the literal real temp path un-tokenised (a recording / normalisation defect, not a tool behaviour change; the refusal was identical). Owner-approved fix: the path is derived from the fixture in the scenario's `setup` and normalises to `<fx>`; only that scenario was re-recorded; the PL-42 logic row passes; no `Users\Owner` / `AppData` string remains in any transcript; the only other change in `g2.json` is a content-identical re-keying of `mut-oag9`'s call pool. The old-digest state (8 batches) was deleted; nothing from it was reused.
- **Real run 2** (17:40–17:57 UTC, from batch 1 under the new source digest): **16/16 batches, 153/153 identical**; 27–102 s per batch; free memory 3,434–3,957 MB before every batch; 8,453 Git starts; the only failure was the expected `re-pin required: source 77a1bc916bd33be923118365cdbd0e355b4d6ca72ec314a7e86ae65242b53cb5 environment ef28452b4eb84527b7208fc76792410d4948cc9d0fa91173a94c79edefa90858`.
- **Pin set (Owner-approved) from that run**; the pinned suite then skips the replay (`SKIP (contract pinned: 77a1bc916bd3/ef28452b4eb8)`, PASS 34, 4 Git starts).

Two defects of the contract suite itself were found and fixed on the way: the `--no-gc4` development flag exited 2 before printing FAIL lines (failures are now printed first; exit 2 only for a failure-free flagged run), and the GC-2 row "every transcript subcommand is classified" read a flat transcript shape that no longer existed and had been crashing silently; it now reads the pooled family documents and checks 2,405 recorded Git calls over 153 scenarios, all explicitly classified.

## FT-0 template-contract pin — recovered provenance (correction)

`TEMPLATE_CONTRACT_PIN` was set by the previous Worker A session at 18:46:46 local on 2026-10-07, but that run was not recorded in `qa.log`, and this session at first reported the pin as unset without reading the file. The evidence was recovered from the previous session's scratchpad (`real-ft.log`, `real-ft-meta.txt`; copies preserved under `pt-work-artifacts/qa-stage2-git-contracts/recovered-evidence-ba78bb57/`): `fixture_template_offline.js` ran 18:35:54–18:46:23 local (628 s), 20 rows passed including all 16 heavy real-Git equivalence proofs, and the only failure was the expected FT-0 "re-pin required" naming source `16159dc55d595761a60fa566db08b1bfe7066934e62ec5fcdfd8ad4ebed41126` and environment `ef28452b4eb84527b7208fc76792410d4948cc9d0fa91173a94c79edefa90858`. The pin was written 23 s after that run with exactly those digests; today's pinned run shows the source digest is still current and the environment is the same laptop environment as GC-4. The gap was documentation-only, now corrected in `qa.log`. Owner ruling 2026-10-07: provenance accepted; no forced re-run.

## Measurement summary

| | Stage 1 (`bb9f94c`) | Stage 2 | Gate |
|---|---|---|---|
| main land suite, Git starts | 5,869 | **2,244** | ≤ 2,400 — met |
| resync land suite, Git starts | 3,216 | **1,443** | ≤ 1,500 — met |
| main land suite, alone | 37.9 min (full run) | **488 s** | ≤ 12 min — met |
| resync land suite, alone | 13.7 min (full run) | **393 s** | ≤ 7 min — met |
| template suite, pinned | 17.1 min | **0.5 s** | ≤ 1 min — met |
| contract suite, pinned | — | **1.1 s** | ≤ 1 min — met |
| heavy body | ≈ 68.7 min | **≈ 14.7 min** | ≤ 18 min — met |
| full `qa:offline` | 73.5 min | **11.4 min** | ≤ 26 min — met |

The A1 and A2 figures for the two land suites are the previous session's single quiet runs (recorded in `qa.log` from the recovered logs); the pinned-suite and full-run figures are this session's.

## LAND path note

The approved brief describes its land-scope in prose (§8) but contains no `<!-- land-scope:begin -->` block, so `land-request` will refuse it as a legacy brief and the LAND is the Owner's, in a normal terminal. Nothing in this task can or should change the approved brief.

## Codex review (pre-G-MAP: libs, recorder, logic suites, row map)

Raw response in `work/qa-stage2-git-contracts/codex.md` (untracked, gitignored). No Class I defect. Two findings: (1) the `failed-mutating` oracle allowance against brief §3.1 "zero mutating calls" — DEFER to the Owner as G-MAP decision D-1, resolved there (the allowance is declared per scenario for the three RS-2 rows, whose decision is Git's own refusal of `reset --keep`); (2) an untracked `.claude/settings.local.json` outside the Stage 2 files — REJECT (ignored by the global gitignore, dated 2026-10-01, not part of this task). Codex also confirmed: no diff in the protected suites, hooks or `qa/run-offline.js`; the map accounts for 166 + 49 rows; the fake defaults unlisted subcommands to mutating; GC-4 skips only when both digests match; no vacuous pass in the logic-row assertion path.

## Codex review (complete implementation diff, base `bb9f94c`, post-G-MAP work)

Read-only Codex pass on the complete real diff: the tracked diff against `bb9f94c` (four suites) plus every untracked in-scope file read in full and the transcripts sampled, with the Owner rulings listed as settled. Raw response appended to `codex.md` under "Complete-diff review (post-G-MAP, 2026-10-07) - raw". Verdict as returned: **FAIL, one Class I finding, no Class II**:

1. Medium, Class I, `qa/fixture_template_offline.js:464`: "with the source and environment digests matching the pin, the `heavy()` wrapper skips the FT-5 spy assertion; brief §4 requires FT-5 spies and fail-closed checks always to run."

## FIX / DEFER / REJECT ledger

| # | Finding | Class | Disposition | Reason |
|---|---|---|---|---|
| 1 | FT-5 spy assertion skipped under the pin (Codex, complete-diff review) | I | **REJECT** — flagged for Owner confirmation at the pre-commit STOP | The cited line 464 lies inside the FT-5 row that is a plain `test()` and always runs: it holds the fail-closed throws and the spy assertion that nothing was built or templated before them, which is the "FT-5 spies and fail-closed throws" of brief §4. The three gated FT-5 rows (the spy over mutant / originUrl / real / same-content sources, the fresh-path equality, the planted negatives) each build real fixtures through the real builders, so they start Git processes and cannot be zero-process; running them under the pin would contradict §4's purpose and the §7 A1 limit of ≤ 50 Git starts for the pinned suite. They were proven in the real run that set the pin (20/21 rows, see FT-0 provenance) and re-run whenever any input or the environment changes. No implementation change. |
| 2 | `failed-mutating` allowance vs §3.1 (Codex, pre-G-MAP) | I | DEFER → resolved by the Owner at G-MAP (D-1) | Declared per scenario, three RS-2 rows only; in use as proposed. |
| 3 | Untracked `.claude/settings.local.json` (Codex, pre-G-MAP) | I | REJECT | Globally gitignored, predates the task, not in `git status`. |

## Fresh-context self-review (step 7)

- Re-read the brief, the row map and the complete diff against the requirement map in `plan.md` (Q1–Q13 and the 2026-10-07 amendment Q5a–Q5c, Q2 fix). Every requirement maps to a row; no orphan rows.
- Changed as a result: the GC-2 shape fix and the failure-reporting order (above); the literal pin of `GC4_BATCH_SIZE === 10` (the Owner ruled the number, so a derived count would not test the ruling); the PL-42 recording fix.
- Line endings: every edited or new JS file is LF in the working tree; the autocrlf notices Git prints for LF-at-HEAD files are not churn.
- Scope: `git status` shows only the brief's files; `.claude/hooks/*`, `qa/run-offline.js`, `AGENTS.md`, `CLAUDE.md` and every product file are untouched.

## Backlog reconciliation

Brief Backlog row: **none**. The finished work's effect is `none`; no `BACKLOG.md` edit.

## Lessons

- [rule]     A suite's development or skip flag must never exit before failures are reported: print FAIL lines and exit 1 first, then any "not a valid run" exit. — Destination-ready text for `AGENTS.md` "Test commands": *A QA suite that supports a development flag (a skipped heavy section, a dry run) reports its failures and exits non-zero before honouring the flag's own exit code; a flagged run is never evidence of a PASS.*
- [rule]     A scenario table or fixture definition must not evaluate the environment (`os.tmpdir()`, `process.env`, the clock) at module load; such values are derived inside the fixture-scoped setup so normalisation can tokenise them. — Destination-ready text for `AGENTS.md`: *Recorded QA fixtures derive every environment-dependent value (temp paths, env vars, times) from the fixture at setup time, never at module load, so no real path or clock enters a tracked fixture.*
- [rule]     Every real run that feeds a pin or a gate is recorded in `qa.log` at the time it is run, with its digests and verdict; a pin whose run is not in `qa.log` is treated as unproven until the evidence is recovered. — Destination-ready text for `AGENTS.md` "Task folder convention": *`qa.log` records every real run whose result is reused later (a pin, a baseline, a gate); a pin without its run in `qa.log` is unproven.*
- [local]    The brief's suite counts (59 → 62) were off by one against the runner's denylist arithmetic (60 → 63); reconciled by the Owner, no destination.
- [local]    The brief has no `land-scope` block, so this LAND is the Owner's; a future brief template should carry the block.
- [local]    Hook gotchas in this slot: R12 fires on any shell text naming the land tool file (use Grep / Read for it); R10-E refuses heavily quoted `node -e` one-liners (write a script to the scratchpad and run it by path).
- [covered]  Pins are bound to the environment digest and evidence is never reused across environments — brief §3.3 / §3.6.

## Final check

Final lightweight Codex check (step 12) run on the complete task diff: the implementation diff against `bb9f94c` with every untracked in-scope file (transcripts sampled), plus `row-map.md` and this file verbatim before this section was filled in. Raw response appended to `work/qa-stage2-git-contracts/codex.md` under "Final check" (untracked). Verdict: **No findings, PASS.** Codex confirmed that the FT-5 REJECT holds (the fail-closed spy assertion is in an always-run `test()` row; the three gated FT-5 rows build real fixtures and are covered by the accepted real run) and that the implementation file set, scope, QA counts, pins, batch results and transcript path scan match the evidence. Final check: 1 round, 0 class-I findings, 0 class-II findings; no implementation change, no QA re-run.

LAND-EVIDENCE: qa-offline=PASS 63; targeted=PASS; codex-classI-unresolved=0
