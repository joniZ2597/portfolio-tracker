# Master Brief: score-boost-removal-1 — remove the research-keyword score boost (CB-2a; PA-04; DQ-1 = A; SCORING BOUNDARY)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL, HELD** (COWORK, 2026-10-13). Batch **`2026-10-13-B2`, position 3**.
- Swept at the batch base `c72697756719a1c79f478cd0e4c468001f19fb18`.
- §PS and the scoring-boundary phase approved (**A-4a**).
- The brief is committed with the batch.
- **Task-start is sequential (§SEQ):** only after `tase-units-1` has LANDed, been pushed and been cleaned up, and after the §TS checks pass. Any §TS failure → STOP, return to COWORK.
- At run time, the step-13a PROTECTED approval is still required (normal gate).

| | |
|---|---|
| Evidence | `audit-2026-10-12/DQ1-SCORING-CORRECTION-PROPOSAL.md`; harness `audit-2026-10-12/evidence/dq1-boost-harness.js` (30 → 72 outranks 66; negated / product-sense / dated phrases boost); DEV 0 / 20 stored results at 72 |
| Ruling | DQ-1 = **A**. A-4: a separate scoring-boundary MASTER; **keep the function as a no-op**. **A-4a (2026-10-13): the scoring-boundary change is approved, and so are the five §PS row changes plus title rewording in this MASTER's scope. No scoring weights or score-formula changes are authorised.** Implementation remains subject to the normal R11 placement and step-13a PROTECTED gates |
| Backlog | none (audit finding PA-04) |
| Baseline | Batch base `c726977`. **Valid only if** the §TS task-start checks pass at the task-start tip |
| Branch / slot | `task/score-boost-removal-1`, first free slot, created from the tip **after** `tase-units-1` cleanup |
| Mode | **Manual**, attended. Scoring boundary + PROTECTED gate (precedent: `nlm-consistency-1` Phase 13) |
| qa:offline | step-0 count **+1** |
| Parallel with | not with any `index.html` / pins / `run-offline.js` task. One heavy run at a time |

## §0 Findings

| ID | Statement | Status |
|---|---|---|
| F-1 | `enforceScoreConsistency` (:6514) lifts any valid score < 65 to **72 / positive** when ≥ 2 of 7 bullish substrings and 0 of 5 bearish substrings occur in the ticker's research JSON (call :6997). Skip-guards: AI-unavailable, invalid score, no verified data, day < −3 %, `extended_near_ath`, `below_key_mas` | Confirmed (code) |
| F-2 | It is non-monotonic, negation-blind, word-sense-blind and date-blind; no marker is stored | Confirmed (harness) |
| F-3 | 5 protected `run-offline.js` rows assert the boost (§PS). All other terminal-chain / SLICE-B rows already pass with a no-op | Confirmed (COWORK harness against the no-op) |
| I-1 | The score is the AI score plus `orchestrate` clamps; `_isValidScanResult` and persistence are unchanged | Intended |

## §SEQ / §TS Sequential start and task-start baseline checks (Bootstrap, read-only, at the task-start tip T)

**Predecessor:** `tase-units-1`. Its LAND, PUSH and `cleanup` entries are in `pt-land-log`; `branch-dev` = `origin/branch-dev` = T.

| # | Check (all must hold; else STOP and return to COWORK) | Value at batch base `c726977` |
|---|---|---|
| TS-1 | pins at T: `functions.enforceScoreConsistency`, `_isValidScanResult`, `mergeResultsByTicker`, `analyzeChunk`, `orchestrate` **equal** the base values | `e1406d9b…` · `cfc5cc18…` · `20273240…` · `e9303a06…` · `2e352b3f…` |
| TS-2 | `git rev-parse T:qa/run-offline.js` equals the base blob (no batch predecessor touches it). The §PS rows are therefore at the listed lines | `354191e67a90…` |
| TS-3 | `git rev-parse T:qa/no_synthetic_score_offline.js` and `T:qa/narrative_consistency_offline.js` equal the base blobs | `94da7ff75430…` · `90bf4228018e…` |
| TS-4 | §A text anchors each match exactly once (line numbers informational: CB-3a / CB-1 add lines above them) | matched at `c726977` |
| TS-5 | `qa/score_boost_removal_offline.js` absent | absent |

## §A Anchors (text binding; `:N` at `c726977`, informational)

| Anchor | Line |
|---|---|
| `function enforceScoreConsistency(results, newsContext) {` | :6514 |
| `  return enforceScoreConsistency(resultsWithPct, JSON.stringify(pplxData));` (unchanged) | :6997 |

## §PS Protected scope — `qa/run-offline.js` (exact rows; explicit Owner approval required before implementation)

| Row (line at `c726977`) | Current assertion | Replacement (same position; same `check(...)` form) |
|---|---|---|
| :1423 | `qualifying item: boost fires (score->72, sentiment positive)` → `=== 72 && 'positive'` | `bullish context -> item unchanged (no research-keyword boost, DQ-1)` → `out[0] === item && score 50 && sentiment 'neutral'` |
| :1431 | `verified 0.00% day is eligible for the boost …` → 72 | `verified 0.00% day + bullish context -> item unchanged` |
| :3873 | `valid 0 + bullish qualifying context -> existing boost rule still fires (0 -> 72, positive)` | `valid 0 + bullish context -> stays 0 (no boost, DQ-1)` |
| :3881 | `valid 1 / 64 / 62.5 remain boost-eligible under the existing rule` → 72 | `valid 1 / 64 / 62.5 -> same reference, unchanged` |
| :3915 | `reads item.sentiment_score directly` (literal `const score = item.sentiment_score;`) | `enforceScoreConsistency writes no score / sentiment` (its source contains no `sentiment_score:` / `sentiment:` property and no `sentiment_score =` assignment) |
| guard-row titles :1440, :1458, :1465, :1469, :1473, :3895 | text "… boost skipped / immune to the boost" | **title-only rewording** to "… unchanged". Predicates byte-identical. **Approved (A-4a)** |

**No other line of `run-offline.js` changes.** The candidate is built as a flat file and committed only through step 13a (`protected-request` → Owner approval line → `protected-commit`). The Worker never stages it.

<!-- protected-scope:begin -->
qa/run-offline.js
<!-- protected-scope:end -->

## §C Hard constraints

| Source | Constraint |
|---|---|
| Scoring boundary | Only `enforceScoreConsistency`'s **body** changes. `orchestrate`, `analyzeChunk`, `_isValidScanResult`, `mergeResultsByTicker`, `classifyTechnicalSetup`, clamps, prompts and persistence are byte-identical |
| Name and call | Function name, signature and the :6997 call are unchanged. The suites that extract or name it pass **unmodified**: `ath_client`, `high1y_label`, `no_synthetic_score` (incl. NS-6), `narrative_consistency` NC-10, `index_pins` NAMED, the isolation lists |
| Pins | `index-pins --diff <base>` lists only `functions.enforceScoreConsistency` + the digest |
| No stored change | no migration; legacy stored 72s stay until rescan |

## §1 Slices

**S1 — characterisation suite.** New `qa/score_boost_removal_offline.js` (real functions extracted):

| ID | Assertion | At S1 |
|---|---|---|
| SB-1 | **No raise:** for scores 0 / 1 / 30 / 50 / 62.5 / 64 / 64.9 and the bullish fixture → output item **same reference**, score and sentiment unchanged | RED |
| SB-2 | **Keyword independence:** bullish, negated (`no upgrade expected until an earnings beat …`), product-sense (`iPhone upgrade cycle; last year revenue beat`), dated and neutral contexts → identical outputs | RED |
| SB-3 | **Order preserved:** 30 / 64 / 66 stay 30 / 64 / 66 (no inversion) | RED |
| SB-4 | Guards unchanged: `_aiUnavailable`, invalid / missing scores pass through unchanged; `_isValidScanResult` rejects the invalid ones | GREEN |
| SB-5 | Returns a new array holding the same item references (callers unaffected) | GREEN |
| SB-6 | Static: no keyword list, no `72` literal, no write to `sentiment_score` / `sentiment` in the function; `orchestrate` / `analyzeChunk` byte-identical to the pin map | RED |

**S2 — no-op + protected amendment.**
1. The body becomes `return results.slice();`, with the comment `score-boost-removal-1 (DQ-1 = A, Owner 2026-10-13): research keywords never change a score or sentiment; kept as a named no-op so the terminal chain and its harnesses stay stable.`
2. SB-1…SB-6 turn GREEN.
3. Step 13a commits the §PS rows.

**§2 Continuation:** S1 → S2 when:
- the S1 rows are as listed;
- §C holds;
- Codex has no unresolved Class I.

**Program STOP:**
- any change outside the §PS rows in `run-offline.js`;
- any other scoring function touched;
- any suite failure other than the 5 §PS rows before step 13a;
- any live / DEV / Netlify action by the Worker;
- a second heavy run.

## §F Feasibility (COWORK harness at `c726977`, outside the repo; reference only)

- With the no-op body, the real `_isValidScanResult` and `mergeResultsByTicker`, the protected predicates behave as follows:
  - **fail exactly as listed in §PS:** :1423, :1431, :3873, :3881, :3915;
  - **still pass:** :3869 (same reference, missing score), :3882 (65 / 72 / 100 unchanged), :3907 (guard / gate equivalence), :3914 (no `_ptScore`).
- The DQ-1 cases (0 / 30 / 64 / 66 / 100 with bullish and negated contexts) all come back as the same references.

## §3 Codex review

**Steps 8 / 12, on the real diff.** Codex confirms:
- only the function body changed;
- the §PS rows match the table exactly (no other protected line);
- SB planted negatives bite;
- no stored or prompt change.

**Planted negatives:**
- re-adding the boost line → SB-1 / SB-3 fail;
- a keyword list kept → SB-6 fails;
- any `sentiment` write → SB-6 fails;
- returning a mutated copy → SB-1 (reference) fails.

## §ET (ET-1; non-blocking)

**Estimate:**
- 10 min setup;
- S1 about 12 min;
- S2 about 8 min;
- 13a protected flow about 10 min plus the Owner gate;
- 15 min closure.

**About 55 min.**

## §CMD Command card (one command per Bash call; Bash only; absolute canonical root)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
node qa/guard_integrity_check.js --task task/score-boost-removal-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/score_boost_removal_offline.js
node qa/no_synthetic_score_offline.js
node qa/narrative_consistency_offline.js
node qa/tools/index-pins.js --diff <base>
node qa/tools/index-pins.js --update
node qa/tools/index-pins.js --check
git commit -m <message>
git log -1 --format=%h%x20%aI
node .claude/hooks/pt-land.js protected-request task/score-boost-removal-1
node qa/guard_integrity_check.js --task task/score-boost-removal-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/score-boost-removal-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (expected prompts):**
  - `git add <explicit paths>` (never `qa/run-offline.js`);
  - `node .claude/hooks/pt-land.js protected-commit task/score-boost-removal-1`: no allow rule, so it prompts. Run it only after the Owner has entered the `protected-request` approval line. It runs before the integrity check.
- **C (Owner gates):** R11, **step-13a PROTECTED approval**, R12 LAND, R12 PUSH.
- **Never:** `curl`, `WebFetch`, `netlify`, PowerShell.
- **L9 readiness:** E1 = 1, E2 = 1, E3 = 0 on `work/score-boost-removal-1/review.md`, before the step-13 commit and again before `land-request`.

## §X Closure

1. Step 10 full `qa:offline` (= step 0 + 1) PASS **after** the protected commit.
2. `review.md`:
   - the previous function text verbatim (rollback reference);
   - the SB table;
   - the §PS before / after;
   - `## Backlog reconciliation` (none);
   - **LAND-EVIDENCE line (L9)**: `review.md` contains **exactly one** line, on its own, starting at column 1, with no bullet, backticks, bold or trailing spaces: `LAND-EVIDENCE: qa-offline=PASS <N>; targeted=PASS; codex-classI-unresolved=0`.
     - `<N>` = the step-10 suite count.
     - Write it only when step 10, every land-test and Codex (no unresolved class I) passed.
     - Commit it in the same commit as the final implementation. It is the only occurrence of `LAND-EVIDENCE:` in `review.md`.
     - The integrity-check output is **not** written into `review.md`; it goes only in the step-13 STOP report.
     - **After an L9 refusal: STOP-6.** No recovery commit without an explicit, incident-specific Owner ruling.
3. Final Codex check.
4. Step 13 → 13a → integrity → R12 LAND / push / cleanup.
5. **Rollback:** the Owner reverts both commits on `branch-dev` in a normal terminal (protected path), then R12 push. No data rollback is needed.
6. **COWORK post-push DEV check** (read-only, separately approved): Scan Results order equals the stored score order; no new results are required.

## §PEP / §UER

- **§PEP:** expected prompts are the `git add` staging, the protected approval and the two R12 verbs.
- **§UER:** **ATTENDED-ONLY** (scoring boundary, protected file).

## §Y Files, land-scope, land-tests

```
index.html                           enforceScoreConsistency body only
qa/score_boost_removal_offline.js    NEW (SB-1…SB-6 + planted negatives)
qa/run-offline.js                    PROTECTED: §PS rows only (step 13a)
qa/fixtures/index-pins.json          regenerated
```

<!-- land-scope:begin -->
index.html
qa/score_boost_removal_offline.js
qa/run-offline.js
qa/fixtures/index-pins.json
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/score_boost_removal_offline.js
node qa/tools/index-pins.js --check
node qa/index_pins_offline.js
node qa/no_synthetic_score_offline.js
node qa/narrative_consistency_offline.js
node qa/ath_client_offline.js
node qa/high1y_label_offline.js
node qa/deep_dive_v0_offline.js
node qa/vis_score_caliper_offline.js
node qa/scan_results_enrichment_offline.js
<!-- land-tests:end -->

**Skills:** `pt-offline-suite` Required. `/plan` mandatory.

**§L:** close at S1 only if S2 cannot complete (M-4); never land a partial protected change.
