# Master Brief: land-evidence-check-1 — read-only pre-LAND readiness check for the L9 LAND-EVIDENCE line (OPTIONAL lane-B; L9-T1)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL, HELD, OPTIONAL** (COWORK, 2026-10-13). Batch `2026-10-13-B2`, **position 5 (lane B, parallel)**. Base `c72697756719a1c79f478cd0e4c468001f19fb18`.

**Owner decision needed:** L9 ruling 3 approved *planning* this task and said "do not install or integrate it yet". Placing this brief **is** the installation step, so it is included only if the Owner explicitly selects it in the batch approval. Integration into the command card / AGENTS.md stays a later governance step (L9-T2, GOV-L9-1).

| | |
|---|---|
| Evidence | `_held-briefs/workflow/L9-LAND-EVIDENCE-PROPOSAL.md` §5 P3; reference implementation `_held-briefs/workflow/land-evidence-check.js` (verified READY on `task/tech-score-reliability-1`; fixtures NOT READY as expected) |
| Backlog | none (`workflow/BACKLOG-CANDIDATES.md` L9-T1) |
| Baseline | **`c726977`**. **Valid only if** at the task-start tip: <br>• `qa/land_evidence_check.js` and `qa/land_evidence_check_offline.js` are absent; <br>• `.claude/hooks/pt-land.js` contains exactly one `const LAND_EVIDENCE_RE = /…/;` line and exactly one `function landEvidenceCheck(` |
| Branch / slot | `task/land-evidence-check-1`, **Worker A** (Worker B runs `market-status-pill-1`). Created from the batch's last brief commit |
| Mode | **Manual**, attended. A new read-only QA tool plus its suite; no app, hook, settings or governance change |
| qa:offline | step-0 count **+1** (`qa/land_evidence_check_offline.js`) |
| Parallel with | `market-status-pill-1` (disjoint files). Later LAND does a Second-LAND resync. One heavy run at a time |

## §0 Contract (from `pt-land.js`, read-only)

- `LAND_EVIDENCE_RE = /^LAND-EVIDENCE: qa-offline=PASS \d+; targeted=PASS; codex-classI-unresolved=0$/`.
- `landEvidenceCheck(G, root, tip, reviewPath)` reads `git show <tip>:<reviewPath>`, splits on CRLF / CR / LF and requires **exactly 1** matching line (L9).

## §C Hard constraints

| Constraint |
|---|
| The tool **reads** `.claude/hooks/pt-land.js` (text only; never `require`s it) and derives the regex from it, so it cannot drift. No hook, `settings.json`, `AGENTS.md`, `CLAUDE.md` or `qa/run-offline.js` change |
| Read-only: no Git write, no file write, no network. Git is used only through `git -C <root> show <task>:work/<id>/review.md`, with `GIT_OPTIONAL_LOCKS=0` and `GIT_CONFIG_PARAMETERS` removed from the child environment |
| CLI: `--root <canonical> --task task/<id>`, or `--root <canonical> --file <path>`. Exit 0 = READY, 1 = NOT READY, 3 = usage. The module exports `extractContract(ptLandText)` and `checkReviewText(text, re)` for the suite |
| Not integrated anywhere (no card / AGENTS / handoff change in this task) |

## §1 Slices

**S1 — suite (RED).** New `qa/land_evidence_check_offline.js` (pure Node; fixtures in memory; no temp repo).

| ID | Assertion |
|---|---|
| LE-1 | `extractContract` on the real `pt-land.js` text yields a RegExp whose `.source` equals the literal in `pt-land.js` |
| LE-2 | READY: one valid line (LF); one valid line (CRLF); one line under a `## LAND-EVIDENCE` heading |
| LE-3 | NOT READY with the reason "exact = 0" plus a near-miss: bullet / backticks / bold / trailing space / `82/82` / `targeted=n/a` / extra text |
| LE-4 | NOT READY "exact = 2": duplicate line |
| LE-5 | NOT READY: integrity-output leak (`guard-integrity: PASS`, `REPORT: …`, `mode: task-record`, `WARN: no task-base record`) even with a valid line |
| LE-6 | **Parity with L9:** `landEvidenceCheck` and `LAND_EVIDENCE_RE` extracted from `pt-land.js` text, run with a fake `G` on every LE-2…LE-5 fixture. `ok === true` exactly where the tool's exact count = 1 |
| LE-7 | CLI `--file` on fixture files written under `os.tmpdir()` (deleted after): exit codes 0 / 1 / 3 |
| LE-8 | Static: the tool contains no `writeFile`, `fetch(`, `http`, `require(` of `pt-land.js`, or Git write verb |

**S2 — tool.** New `qa/land_evidence_check.js`, adapted from the held reference implementation with the module exports (§C). LE-1…LE-8 turn GREEN.

**Planted negatives:**
- hard-coding the regex instead of extracting it → LE-1 fails when the fixture contract differs;
- trimming lines → LE-3 trailing-space fails;
- skipping the integrity scan → LE-5 fails;
- `require`-ing `pt-land.js` → LE-8 fails.

**Program STOP:**
- any change outside the two new files;
- any need to touch a hook / settings / governance file;
- a second heavy run.

## §ET

About 35 min: 10 min setup, S1 about 10 min, S2 about 5 min, 10 min closure.

## §CMD Command card (one command per Bash call; Bash only; absolute canonical root)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
node qa/guard_integrity_check.js --task task/land-evidence-check-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/land_evidence_check_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/land-evidence-check-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/land-evidence-check-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (expected prompts):**
  - `git add <explicit paths>`;
  - `node qa/land_evidence_check.js --root C:/Users/Owner/Documents/Project/portfolio-tracker --file work/land-evidence-check-1/review.md` (before the commit);
  - `node qa/land_evidence_check.js --root C:/Users/Owner/Documents/Project/portfolio-tracker --task task/land-evidence-check-1` (before `land-request`).
  
  The allow list covers only `node qa/*_offline.js` / `*_test.js` / `guard_integrity_check.js` / `index-pins`. A prompt-free tool needs a later `settings.json` allow rule (protected; GOV-L9 follow-up).
- **C (Owner gates):** R11, R12 LAND, R12 PUSH.
- **Never:** `curl`, `WebFetch`, `netlify`, PowerShell.
- **L9 readiness:** the task's own tool (`--file` before the commit, `--task` before `land-request`) plus the Grep checks E1 = 1, E2 = 1, E3 = 0.

## §X Closure

1. Step 10 full `qa:offline` (= step 0 + 1) PASS.
2. `review.md`:
   - the LE table;
   - the parity evidence;
   - `## Backlog reconciliation` (none);
   - **LAND-EVIDENCE line (L9)**: `review.md` contains **exactly one** line, on its own, starting at column 1, with no bullet, backticks, bold or trailing spaces: `LAND-EVIDENCE: qa-offline=PASS <N>; targeted=PASS; codex-classI-unresolved=0`.
     - `<N>` = the step-10 suite count.
     - Write it only when step 10, every land-test and Codex (no unresolved class I) passed.
     - Commit it in the same commit as the final implementation. It is the only occurrence of `LAND-EVIDENCE:` in `review.md`.
     - The integrity-check output is **not** written into `review.md`; it goes only in the step-13 STOP report.
     - **After an L9 refusal: STOP-6.** No recovery commit without an explicit, incident-specific Owner ruling.
3. Final Codex check.
4. Step 13; integrity; R12 LAND / push / cleanup (Second-LAND resync if `market-status-pill-1` landed first).

## §PEP / §UER

- **§PEP:** expected prompts are the `git add` staging and the two R12 verbs.
- **§UER:** **ATTENDED-ONLY**.

## §Y Files, land-scope, land-tests

```
qa/land_evidence_check.js            NEW (read-only tool)
qa/land_evidence_check_offline.js    NEW (LE-1…LE-8 + planted negatives)
```

<!-- land-scope:begin -->
qa/land_evidence_check.js
qa/land_evidence_check_offline.js
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/land_evidence_check_offline.js
<!-- land-tests:end -->

**Skills:** `pt-offline-suite` Required.

**§L:** close at S1 only if S2 cannot complete; never land a tool without its suite.
