# Task brief: qa-pin-decouple-1 — a stale digest pin replays and passes with a notice

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL r2, HELD** (COWORK, 2026-10-14). r2 = r1 + the R11-review corrections: the malformed-environments Class I fix (R-1, §4, DoD-2) and the separate docs-only commit (§5, §X). Swept at `28a0c7b` (`branch-dev`, canonical CLEAN, host probe 11:59Z). Placed only on the Owner's R11 approval of this exact hash.

| | |
|---|---|
| Problem | Six QA suites gate their heavy rows on a committed (source, environment) digest pin. When a **valid** pin's source differs, they run every heavy row and then **fail "re-pin required"**, even when every proof passed. The pin inputs overlap (land tool, integrity module, hook, fixture template), so one edit forces pin edits in up to six suites, including suites outside the editing task's scope (the WR-1 root cause) |
| Owner rulings (2026-10-14) | <ul><li>**QD-1:** a valid stale pin triggers the full heavy tests and a notice, not a suite failure. A genuine test failure, missing test execution or a malformed / missing pin still fails.</li><li>**QD-2:** the GC pin is refreshed from the verified full replay, keeping the existing Owner confirmation of that value.</li><li>**QD-3:** Worker A after normal Bootstrap slot preparation. Worker B and its three uncommitted files stay untouched.</li></ul> |
| Backlog | none |
| Baseline | the `branch-dev` tip at this brief's commit. **Valid only if** these blobs equal their `28a0c7b` values; otherwise HOLD: <ul><li>`qa/lib/exec-env-fingerprint.js` `57d21d5408bbdd98611155948f80a2b18a6a50ce`</li><li>`qa/auto_mode_hardening_offline.js` `fab0ba653fa3ec6c96ca49b2d3469d5afe5f4bec`</li><li>`qa/pt_land_offline.js` `e35d76da658621a70fdf87038781e0a4c10a584b`</li><li>`qa/pt_land_resync_offline.js` `8561f820300f6b40b6c3dc0f1e939e068fb526c8`</li><li>`qa/task_base_offline.js` `a721dd1cdb3cae470f5aaaa4cd623404316281f3`</li><li>`qa/fixture_template_offline.js` `64cffec0ab8f37a8f1d774011eb6e3db1ca5b84b`</li><li>`qa/git_contract_offline.js` `09d1f86f2805996a117a85a3d65ede7d1ea6e765`</li></ul> |
| Branch / slot | `task/qa-pin-decouple-1`, **Worker A** (`pt-wt-worker-a`) after Bootstrap's normal slot preparation. Slot B and its uncommitted files are not touched |
| Mode | **Manual**, attended. QA-only, ordinary paths (no protected path, no 13a) |
| qa:offline | suite count **unchanged** from step 0 |
| Parallel | allowed with any task that shares none of the files below. One heavy run at a time |

## §1 Files (exactly)

- `qa/lib/exec-env-fingerprint.js`
- `qa/auto_mode_hardening_offline.js`
- `qa/pt_land_offline.js`
- `qa/pt_land_resync_offline.js`
- `qa/task_base_offline.js`
- `qa/fixture_template_offline.js`
- `qa/git_contract_offline.js`
- `work/qa-pin-decouple-1/review.md`

**Forbidden:**
- `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `qa/run-offline.js`, `package*.json`;
- `qa/guard_integrity_check.js`, `qa/lib/` files other than the one above, `qa/tools/**`;
- `qa/fixtures/**` (transcripts), `qa/*_logic_offline.js`;
- `BACKLOG.md`.

## §2 Required behaviour

| # | Rule |
|---|---|
| R-1 | `gateDecision(src, env, pin)` in `qa/lib/exec-env-fingerprint.js`: <ul><li>no pin; a source that is not a non-empty string; or `environments` missing, not an array, or holding an entry that is not a non-empty string → `'replay-fail'`. This check runs **before** the source comparison, so a stale source never masks a malformed pin. An empty array stays valid (`'replay-notice'`, kept row);</li><li>source ≠ the pin's source → **`'replay-stale'`**;</li><li>otherwise `'skip'` if `env` is a proven environment, else `'replay-notice'`.</li></ul> |
| R-2 | The four E1 suites: `e1Decide` returns `'replay-stale'` where it returned `'replay-fail'` (same position: after the invalid-force, pin-invalid and override checks, before force). `e1Verdict`: <ul><li>removes the "re-pin required" branch;</li><li>accepts `'replay-stale'` **only after** the existing "heavy unit(s) skipped under a replay" check;</li><li>emits `REPLAY PASS (pin stale, re-pin optional) src <64> env <64>, …, 0 heavy skipped`.</li></ul> An unknown gate value, including `'replay-fail'`, still fails closed |
| R-3 | FT verdict row: on `'replay-stale'` it asserts `skippedHeavy === 0`, then prints `NOTE  pin stale (every heavy proof above ran against real Git): source <64> environment <64>; re-pin optional`. `'replay-fail'` keeps its "re-pin required" failure |
| R-4 | GC-4: on `'replay-stale'`, **after** the existing "every batch complete" and "every scenario replayed identically" assertions, it prints `NOTE  pin stale (every transcript replayed identically against real Git in <n> batches): source <64> environment <64>; re-pin optional`. `'replay-fail'` keeps its throw |
| R-5 | A stale pin never skips: heavy rows, blocks and GC-4 batches are skipped only on `'skip'`. Any heavy failure, any skipped heavy unit, or an incomplete or mismatching GC-4 replay **fails the suite** |
| R-6 | Comments describing the old "changed source fails" rule are updated to R-1…R-5. No other code changes |

**Reference candidate:** `_held-briefs/qa/qa-pin-decouple-1/evidence/candidate.diff` (r2: 82+ / 41−). The Worker may implement it as written or equivalently, within §1–§3.

## §3 Kept unchanged (security and detection)

Every row and condition below stays as it is. Only the expected value or text named in §4 changes.
- skip only on an exact source **and** proven-environment match; an environment's evidence is never reused for another;
- G0 invalid `PT_QA_FORCE_HEAVY`; G6 every malformed / missing pin case; G4 override variables (full replay); G5 forced;
- E1-1 closure, E1-2 heavy rule, E1-3 digest sensitivity (one byte, removed part, CRLF, pin self-neutralisation);
- the FT-0 and GC-4 negative rows (one-byte / removed-input sensitivity);
- GC-1…GC-3, FP, the GC-4 batching, memory floor, resume and state-key rows;
- every functional row of all seven files.

## §4 Assertions that change (complete list)

- **E1 suites (×4), `e1Table`:** the three `G3 changed source…` rows expect `'replay-stale'`.
- **E1-4:** add the planted variant "a stale pin treated as skip" (it must fail the table). The existing four planted variants are kept.
- **E1-5:** the `'re-pin required text'` assertion is replaced by three assertions:
  - the stale line has the R-2 shape;
  - a stale verdict with skipped heavy units fails;
  - `'replay-fail'` now fails closed as an unknown gate.
- **FT-0 table:**
  - `gateDecision('S2','E1',pin)` expects `'replay-stale'`;
  - add `('S2','E3',pin)` → `'replay-stale'`;
  - add `(…, undefined)` → `'replay-fail'`;
  - add `('S2','E1',{ source: 'S' })` → `'replay-fail'` (missing environments, stale source).
- **GC-4 gate table:**
  - `('S2','E1')` and `('S2','E3')` expect `'replay-stale'`;
  - add `('S2','E1',{ source: 'S', environments: 'E1' })` → `'replay-fail'` (malformed environments, stale source).
- **Row titles** of FT-0 (both rows) and the GC-4 gate row: update the "changed source → … fail" wording to R-1…R-4.

**Any other assertion change is out of scope.**

## §5 Steps (the usual workflow)

| Step | Who | Action |
|---|---|---|
| 0 | Worker | Baseline blob check (table above). Heavy-lane go-ahead → full `npm run qa:offline` (`qa.log` line 1). `plan.md` |
| S1 | Worker | **RED:** apply the §4 assertion changes only. Then the E1-4 rows (the G3 cases), FT-0 and the GC-4 gate rows fail against the unchanged gate code; record which |
| S2 | Worker | **GREEN:** R-1…R-6. Targeted: the seven suites' own files plus `node qa/pt_land_logic_offline.js`, `node qa/pt_land_resync_logic_offline.js` and `node qa/run_isolation_offline.js` → PASS. The six pinned suites now print their stale-pin line, as expected: the task changed their inputs |
| 8 | Worker | Codex on the full diff (§7). Classify and fix |
| 10a | Worker | Heavy-lane go-ahead → full `npm run qa:offline`. Expect PASS, with every pinned suite printing its stale-pin line and digests. GC-4 replays all 153 scenarios (about 25 min, resumable; memory-floor STOP → resume) |
| 10a-GC | Worker → Owner | Report the GC-4 `NOTE  pin stale …` line verbatim. **The Owner confirms the `GIT_CONTRACT_PIN` value in one line** (QD-2, the existing 2026-10-07 practice) |
| pin | Worker | **One pin commit:** each `*_CONTRACT_PIN` = `{ source: <printed source>, environments: [<printed environment>] }`, using the values printed at 10a. The GC pin only after the Owner's line. Pin statements are neutralised in their own digests, so this commit does not change any source digest |
| 10b | Worker | Full `npm run qa:offline` on the pin commit = **the tested commit**: PASS, count = step 0, and all six suites print SKIP (`SKIP (contract pinned: …)` / `E1 … SKIP (contract pinned: …)`) |
| 11–13 | Worker | `review.md` (with the L9 line); final Codex on the complete diff including `review.md`. **Step 13 = one separate docs-only commit, authorized by this brief:** <ul><li>it contains only `work/qa-pin-decouple-1/review.md`;</li><li>it is made after the tested pin commit and its step-10b QA;</li><li>no other commit follows the tested commit.</li></ul> Then integrity. The tested commit stays the step-10b pin commit, and `review.md` records it as `Tested commit: <oid>` |
| LAND / PUSH | Bootstrap + Owner | usual R12 path; cleanup |

**Ordinary in-scope fixes need no Owner ruling.** Any QA failure the Worker can fix inside §1 without touching §3 is fixed in this task. After a fix, re-run the affected targeted suites. A fix after step 10a repeats 10a → pin → 10b. STOP only per §8.

## §6 Definition of Done

1. No path in the seven files fails a suite *only* because a valid pin's source differs (R-1…R-4).
2. Under a stale pin, every heavy unit runs. A failing or skipped heavy unit, an incomplete or mismatching GC-4 replay, a malformed / missing pin and an invalid force each still **fail**. This is shown by the §4 rows plus the step-S2 negatives recorded in `review.md`: <ul><li>empty pin;</li><li>**missing or malformed `environments` with a stale source** (the FT-0 and GC-4 rows of §4, plus the lib check removed in a scratch copy → both rows fail);</li><li>`PT_QA_FORCE_HEAVY=0`;</li><li>one heavy row skipped (E1 and FT);</li><li>stale treated as skip (lib);</li><li>one behavioural break in a pinned suite's subject.</li></ul> Each is run once in a scratch copy and reverted.
3. Every §3 row passes unchanged.
4. Step 10b: full `qa:offline` PASS, count = step 0, all six SKIP lines; land-tests PASS.
5. Codex: no unresolved Class I.

## §7 Codex (steps 8 and 12; read-only)

Codex confirms:
- only §1 files changed;
- each §4 change is exactly as listed, and nothing in §3 was removed or weakened;
- `'replay-stale'` cannot skip a heavy unit or hide a failure (R-5);
- the pin commit touches only the six pin statements.

**Prompt rule:** the prompt says "the land tool" and "the hook", never their file paths.

## §8 STOP

- A needed change outside §1, or to a §3 row.
- A step-10a failure that is not an in-scope QA fix (for example a real transcript mismatch in GC-4).
- A GC-4 memory-floor STOP that does not clear on resume.
- A `GIT_CONTRACT_PIN` edit without the Owner's line.
- Two heavy runs at once.
- Any hook denial (STOP-6).
- Any live / DEV / Netlify action.

## §CMD Command card (one command per Bash call, run exactly as written; never name the land tool's or the hook's file in any other command; read them with the Read / Grep tools)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
git rev-parse HEAD:qa/lib/exec-env-fingerprint.js
node qa/guard_integrity_check.js --task task/qa-pin-decouple-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/auto_mode_hardening_offline.js
node qa/pt_land_offline.js
node qa/pt_land_resync_offline.js
node qa/task_base_offline.js
node qa/fixture_template_offline.js
node qa/git_contract_offline.js
node qa/pt_land_logic_offline.js
node qa/pt_land_resync_logic_offline.js
node qa/run_isolation_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/qa-pin-decouple-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/qa-pin-decouple-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- The baseline blob check repeats the `git rev-parse HEAD:<file>` line once per §1 code file.
- **B (prompts):** `git add <explicit §1 paths>`; the planted-negative copies are made with the Write / Edit tools in a scratch directory outside the repo.
- **C (Owner gates):** R11; heavy-lane go-ahead (steps 0, 10a, 10b); the GC pin line; R12 LAND; R12 PUSH.

## §X Closure

`review.md`:
- step 0;
- S1 RED;
- S2 GREEN + the DoD-2 negatives;
- the 10a stale lines (digests);
- the Owner's GC line;
- 10b SKIP lines;
- Codex ledger;
- `## Timing`;
- `## Backlog reconciliation` (none);
- **exactly one** line: `LAND-EVIDENCE: qa-offline=PASS <N>; targeted=PASS; codex-classI-unresolved=0` (N = the step-10b count), committed in the step-13 docs-only commit (§5). All other LAND-evidence requirements are unchanged.

Integrity output goes only into the step-13 STOP report.

<!-- land-scope:begin -->
qa/lib/exec-env-fingerprint.js
qa/auto_mode_hardening_offline.js
qa/pt_land_offline.js
qa/pt_land_resync_offline.js
qa/task_base_offline.js
qa/fixture_template_offline.js
qa/git_contract_offline.js
work/qa-pin-decouple-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/auto_mode_hardening_offline.js
node qa/pt_land_offline.js
node qa/pt_land_resync_offline.js
node qa/task_base_offline.js
node qa/fixture_template_offline.js
node qa/git_contract_offline.js
<!-- land-tests:end -->
