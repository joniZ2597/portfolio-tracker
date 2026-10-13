# review.md — score-boost-removal-1 (DQ-1 = A; PA-04; scoring boundary)

Mode: Manual, attended. Base `7888fa5`. Brief commit `8ec192c` (sha256 `f2b6501d…`).

## Files changed
- Implementation (4): index.html, qa/score_boost_removal_offline.js, qa/run-offline.js, qa/fixtures/index-pins.json
- Evidence (tracked): work/score-boost-removal-1/brief.md, work/score-boost-removal-1/review.md

## What changed
`enforceScoreConsistency` (index.html) is now a named no-op: `return results.slice();` with the brief's comment. Name, signature and the call site are unchanged. `orchestrate`, `analyzeChunk`, `_isValidScanResult`, `mergeResultsByTicker`, clamps, prompts and persistence are byte-identical (`index-pins --diff 7888fa5` lists only `functions.enforceScoreConsistency`; the pin map changed only for that function and the file digest).

### Previous function text (rollback reference, verbatim from 7888fa5)
```js
function enforceScoreConsistency(results, newsContext) {
  const tierOneBullish = ['raised pt', 'raised price target', 'pt hike', 'upgrade', 'earnings beat', 'revenue beat', 'buy rating initiated'];
  const tierOneBearish = ['downgrade', 'cut pt', 'sell rating', 'missed earnings', 'guidance cut'];
  const ctxLower = (newsContext || '').toLowerCase();
  const bullishCount = tierOneBullish.filter(s => ctxLower.includes(s)).length;
  const bearishCount = tierOneBearish.filter(s => ctxLower.includes(s)).length;

  return results.map(item => {
    const score = item.sentiment_score;
    const chgPct = item._changePct || 0;
    // Terminal-chain integrity: a synthetic/AI-failure fallback item must
    // never be rewritten into a fabricated bullish score — its honest
    // neutral/50 fallback state is the correct final state.
    if (item._aiUnavailable === true) { console.log(`[PT] enforceScore: skipping boost for ${item.ticker} (AI unavailable — synthetic fallback item)`); return item; }
    // LX-4 Slice B: a score that is not a finite number in [0,100] is MISSING. It must
    // never become 50 and never qualify for the boost — the item passes through
    // unchanged and the persistence gate (_isValidScanResult, same predicate) rejects
    // it like any other malformed result. Strings are never parsed.
    if (typeof score !== 'number' || !(score >= 0 && score <= 100)) { console.log(`[PT] enforceScore: skipping boost for ${item.ticker} (no valid numeric score)`); return item; }
    // Terminal-chain integrity: _changePct above is coerced to 0 when
    // market data is missing, which would otherwise silently defeat the
    // down-day guard on an unknown-price day. _verifiedChangePct is set by
    // orchestrate() only when real market data was fetched (genuinely
    // absent, never coerced, otherwise) — the correct signal for whether
    // we actually know this ticker's price moved. A genuinely verified
    // 0.00% day still passes this check normally.
    if (typeof item._verifiedChangePct !== 'number') { console.log(`[PT] enforceScore: skipping boost for ${item.ticker} (no verified market data)`); return item; }
    if (typeof chgPct === 'number' && chgPct < -3) { console.log(`[PT] enforceScore: skipping boost for ${item.ticker} (down day ${chgPct}%)`); return item; }
    if (item.technical_setup === 'extended_near_ath') { console.log(`[PT] enforceScore: skipping boost for ${item.ticker} (extended_near_ath)`); return item; }
    if (item.technical_setup === 'below_key_mas') { console.log(`[PT] enforceScore: skipping boost for ${item.ticker} (below_key_mas)`); return item; }
    if (bullishCount >= 2 && bearishCount === 0 && score < 65) { console.warn(`[PT-SCORE] ${item.ticker}: Tier1 boost ${score} → 72`); return { ...item, sentiment: 'positive', sentiment_score: 72 }; }
    return item;
  });
}
```

## SB table (qa/score_boost_removal_offline.js)
| ID | Assertion | At S1 (before the edit) | After S2 |
|---|---|---|---|
| SB-1 | No raise: 0/1/30/50/62.5/64/64.9 + bullish context -> same reference, score and sentiment unchanged | RED | GREEN |
| SB-2 | Keyword independence across bullish / negated / product-sense / dated / neutral / empty contexts | RED | GREEN |
| SB-3 | Order preserved 30 / 64 / 66 | RED | GREEN |
| SB-4 | Guards unchanged; `_isValidScanResult` rejects undefined / null / 'abc' / NaN / 101 / -1 | GREEN | GREEN |
| SB-5 | New array, same item references | GREEN | GREEN |
| SB-6 | Static: no keyword list, no `72` literal, no `sentiment` / `sentiment_score` write; `orchestrate` / `analyzeChunk` pinned; anchors unique | RED | GREEN |
| PN-1..PN-4 | Planted negatives: re-added boost (SB-1+SB-3), kept keyword list (SB-6), `sentiment_score` write (SB-6), mutated copy (SB-1) | bite | bite |

## §PS before / after (qa/run-offline.js — step-13a candidate; the Worker has not edited the repo file)
| Row | Before | After |
|---|---|---|
| :1423 | `qualifying item: boost fires (score->72, sentiment positive)` | `bullish context -> item unchanged (no research-keyword boost, DQ-1)` · `out[0] === item && score 50 && sentiment 'neutral'` |
| :1431 | `verified 0.00% day is eligible for the boost …` | `verified 0.00% day + bullish context -> item unchanged` |
| :3873 | `valid 0 + bullish qualifying context -> existing boost rule still fires (0 -> 72, positive)` | `valid 0 + bullish context -> stays 0 (no boost, DQ-1)` |
| :3881 | `valid 1 / 64 / 62.5 remain boost-eligible under the existing rule` | `valid 1 / 64 / 62.5 -> same reference, unchanged` |
| :3915 | `enforceScoreConsistency reads item.sentiment_score directly …` | `enforceScoreConsistency writes no score / sentiment (DQ-1)` |
| :1440 :1458 :1465 :1469 :1473 :3895 | titles "… immune to the boost / boost skipped" | title-only rewording to "… unchanged"; predicates byte-identical |

Reading used: the :1423 predicate asserts `out[0] === item` as the brief specifies, which needs a local `item`; the candidate therefore changes line 1422 to `const item = baseItem(); const out = enforceScoreConsistency([item], BULLISH_CTX);`. This is the only changed line outside the listed row lines; Codex judged it the necessary minimal reading.

## QA
- Step-0 baseline (pre-edit): `qa:offline` PASS, 86 spawned suites.
- Targeted after the change: `score_boost_removal` PASS (SB-1..6, PN-1..4); `index-pins --check` OK; `index_pins`, `no_synthetic_score` (160), `narrative_consistency` (153), `ath_client` (123), `high1y_label` (103), `deep_dive_v0` (74), `vis_score_caliper` (307), `scan_results_enrichment` (67) all PASS.
- Full `qa:offline` runs once, after the step-13a protected commit (the five §PS rows assert the old boost until then); expected suite count 87.

## Codex
- Step 8 implementation-diff review: NO FINDINGS, VERDICT: PASS (see codex.md). Ledger: 0 FIX, 0 DEFER, 0 REJECT.
- Step 12 final check on the task diff: one Class II finding (stale "final check" status in the evidence), fixed. Final check: 1 rounds, 1 class-II findings fixed, self-checked; no implementation change, no QA re-run.

## Owner ruling (STOP-2, wording defect — recorded verbatim)
> I approve Bootstrap's incident-specific STOP-2 ruling.
>
> For score-boost-removal-1, the §X.2 requirement that LAND-EVIDENCE appear "in the same commit as the final implementation" is a wording defect.
>
> Approved execution order:
>
> 1. Complete the final Codex review and Step 13 implementation commit, excluding the protected qa/run-offline.js.
> 2. Execute Step 13a protected-request and STOP for my exact PROTECTED approval.
> 3. After protected-commit, obtain heavy-lane clearance and run full qa:offline plus all required land-tests.
> 4. Add the single LAND-EVIDENCE line in one docs-only commit modifying only work/score-boost-removal-1/review.md, using the actual QA suite count.
> 5. Run the integrity check and land-request. STOP for my exact LAND approval.
>
> The extra `const item = baseItem();` declaration in the protected candidate at line 1422 is approved as within the §PS scope.
>
> No other changes to the brief's scope, protected files, land-tests or approvals are authorized.

## Backlog reconciliation
- Brief's Backlog row: none (audit finding PA-04). Action taken: none. No `BACKLOG.md` edit; no affected entries. The finished work's effect matches the brief's row.

## Lessons
- [local] Preflight greps anchored with `$` miss on CRLF working-tree files (index.html is LF in the index, CRLF in the working tree) — use unanchored patterns or `git show`.
- [rule] The LAND-EVIDENCE line requires step 10 to have passed, but step 10 runs after the step-13a protected commit, which follows the step-13 commit that must already contain the line — a protected-run-offline.js brief cannot satisfy the ordering as written (Owner-ruled above as a wording defect for this task: the line goes in a later docs-only commit of review.md). Destination-ready text for AGENTS.md: "For a brief with a `protected-scope` block whose rows the change breaks, step 10 runs after step 13a and the LAND-EVIDENCE line is committed in a docs-only review.md commit once step 10 has passed." — pending routing.
