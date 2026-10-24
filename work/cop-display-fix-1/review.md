# review.md - cop-display-fix-1 (evidence only; authorizes nothing)

Status: implementation and QA complete; the two evidence lines are at the end of this file (values confirmed by MAIN).

## What changed (display only, `renderMainPanel` + CSS)
- C-1: `deriveDataConfidence` untouched. New nested `_dcCoverage(dc, item, ks)`; labels `Data coverage: high|moderate|limited`; `item.conflict` (non-empty string) or K1-K6 warning -> never `pos` (uses `warn`) + note. `_nlmKs` computed once, shared by the badge and `_nlmLine`.
- C-2: two `src-tag unv` sibling tags (Entry/Invalidation once; analyst line once); `Cited sources · Perplexity` block from `item._catalysts.sources` (<= 8, escaped, http/https-only links with `rel="noopener noreferrer" target="_blank"`, other schemes plain text, `No citations stored for this result`, nothing when `_catalysts` absent); the line `Analyst rows above are Perplexity-sourced actions` shows only when `analystActions` is non-empty. CSS `.src-tag`, `.src-tag.unv` #F4B860, `.src-tag.sourced` #22C58B, `.src-cite`.
- C-3: `qa/cop_display_offline.js` (CD-1..13, N1-N11): PASS 110 asserts.
- Files: index.html (+43/-5 at first diff; final tracked diff 52 insertions / 13 deletions over 7 files), qa/cop_display_offline.js (new), 4 renderMainPanel suites + evidence_capture (constants/comments only), qa/fixtures/index-pins.json (3 lines, via `--update`).

## D11 limitation (verbatim from the brief)
scan-action-gate-1 enforces the setup→action contract for setups 1–7 only; on `unknown` the AI action passes through unchanged (D11-D). Follow-up D11-A owns the `unknown` gate together with its own `renderMainPanel` change. D11 is NOT solved by this task.

## Deviations and notes
- `_nlmKs` form (MAIN-reviewed): the brief shows a single `_nlmConsistencyChecks(...)` ternary, but `held` depends on the local `_h = _srHeldMap()`, so a bare call cannot carry the same arguments, and hoisting `_h` would add a `_srHeldMap` read for failed analyses. Final form: `const _nlmKs = (item._aiUnavailable === true) ? [] : (() => { const _h = _srHeldMap(); const _ks = _nlmConsistencyChecks(item, {...same arguments...}); return _ks; })();`. Computed once, `[]` when `_aiUnavailable`, before `_nlmLine`, reused by badge and line. The first form (`return _nlmConsistencyChecks(...)`) broke tase_units TU-8; see the sweep gap.
- Brief-sweep gap (class (e) literal coupling): `qa/tase_units_offline.js:212` (TU-8) requires the literal `const _ks = _nlmConsistencyChecks(item, { price: hasData ? _techPanelPrice(item) : null, mas: _panelSnap, held:` exactly once. Brief section 2 did not list tase_units. Resolved without editing tase_units: the literal is kept inside the `_nlmKs` function. The first full run FAILED on it (107 suites spawned, 1 hard failure, total 113602 ms, no run record written, so no run id exists; that run is not evidence).
- N11 is an addition beyond the brief's N1-N10 (failed-analysis guard on `_nlmKs` removed -> CD-3 fails).
- `_dcCoverage` is applied to AI_UNAVAILABLE as well (note shown if a conflict string exists); class stays `neg`.
- Working-copy EOL (Edit / `--update` effect, no commit churn): `qa/portfolio_today_offline.js` and `qa/fixtures/index-pins.json` are now `w/lf` (index `i/lf`; canonical working copies are `w/crlf`). Under autocrlf the committed blobs are unaffected and the diff is one line each.
- Cosmetic: `qa/labs_panel_offline.js:21` provenance comment has an unbalanced `(` ("(was 61e663bf… display-honesty-1 (was 9ae8…"). Left as is.

## Pin ledger (final)
- renderMainPanel sha256: 61e663bf2e3a734df928a4a8f59e6cc01691782edd0e51467caa5baebdeaecd1 -> bbaafdd6c7fee70cb4aee8f5d1ef35c8ae097f0d412daed4c490574fab0ca997 in ai_request_hygiene:47, labs_panel:21, market_daily_change:68, portfolio_today:69 and qa/fixtures/index-pins.json:396 (regenerated with `node qa/tools/index-pins.js --update`; `--check` OK).
- evidence_capture BASE_INDEX_SHA: 2166c8b16d83… -> eadd5318a6d84e9c183da75608a1d87008640c40d6ff59be65c028b66d339725 (digest printed by CP-10).
- Untouched: no_synthetic_score e84c5e61 (frozen), index-pins-frozen.json, tase_units.
- Before each re-pin the suite was RED only on the pinned constant (HY-11, LB-8, DC-12, PT-25, CP-10); green after.
- Targeted suites run individually after the final edit: cop_display (110), tase_units (9), evidence_capture, ai_request_hygiene, labs_panel, market_daily_change, portfolio_today, index_pins, catalyst_hygiene, no_synthetic_score, pulse_analyst_view, ma_stack_label, tech_snapshot_cache, ath_client, narrative_consistency, ui_hygiene, ui1b_cards: PASS.

## Codex ledger
- r1 (implementation diff vs base 1c8513c plus the new suite file): no VERDICT line was produced (not invented here). Findings:
  - F1 (reported Class I): pin edits also changed provenance comments in evidence_capture and labs_panel. Disposition: REJECT. Rationale: the brief says re-pin; each of the 5 files changes only the hash value plus a trailing provenance comment (labs_panel's comment already carried a "(was ...)" history); no assertion, logic or count changed. Owner ruling: the rejection is accepted, F1 RESOLVED.
  - F2 (reported Class I): no assertion that `_srHeldMap` is not read for `_aiUnavailable` items. Disposition: FIXED / ADDRESSED. CD-3 call counters (failed item -> 0 reads, normal item -> exactly 1) plus planted negative N11 mutating the production guard.
- r2 (focused independent re-review at the Owner's request, same command form, foreground, read-only sandbox; diff vs base 1c8513c regenerated after the TU-8 fix): findings, as reported:
  - F2 follow-up: the CD-3 call counters (qa/cop_display_offline.js:169-170) assert 0 `_srHeldMap` reads for an `_aiUnavailable` item and exactly 1 for a normal item; N11 (:318) mutates the in-memory index.html string (not the test or the file on disk), its anchor occurs exactly once, and applying it makes the CD-3 zero-call assertion fail. Disposition: confirmed, no action.
  - TU-8: the `_nlmKs` function (index.html:9883-9885) keeps the base call, arguments and `_aiUnavailable` guard; the exact caller string required at qa/tase_units_offline.js:212 occurs once; qa/tase_units_offline.js has no diff against 1c8513c, no assertion weakened. Disposition: confirmed, no action.
  - Class I: none reported. Class II: none reported. r2 printed the closing line "VERDICT: 0 Class I, 0 Class II" (r1 printed no verdict line). codex-classI-unresolved stays 0.
- Raw output of r1 and r2 is in work/cop-display-fix-1/codex.md.

## Full QA (final, plain `npm run qa:offline`, foreground, tier F)
- OFFLINE VALIDATION: PASS, 107 offline test files (step-0 106 + 1), `=== Stale pins ===` none, E1 SKIP lines for auto-mode-hardening / pt-land / pt-land-resync / task-base (fixture_template and git_contract classified by the runner), no RUNTIME REGRESSION (baseline 106 s, this run 111 s), 1 advisory WARN (smart quote at index.html:12273, pre-existing).
- Run record: run=20261024-161916656-39760b mode=default suites=107; total 111356 ms.
- Step-0 baseline for reference: PASS 106, run 20261024-154921285-f4221b, 106483 ms.

## Not done / out of scope
- No browser check (step 7, after the DEV deploy, not mine). No commit, land-request, LAND or PUSH.

## Lessons
- [lesson] A refactor of a line that a pin suite quotes verbatim (class (e)) is invisible to a digest sweep; grep the quoted literal (`_nlmConsistencyChecks(item,`) across qa/ in the coupling sweep, not only function names and hashes.
- [lesson] Hook R1 denies interpreter code that spawns git inside a Worker slot; use `index-pins.js --update` plus Grep to obtain pin hashes.

LAND-EVIDENCE: qa-offline=PASS 107; targeted=PASS; codex-classI-unresolved=0
QA-LIFECYCLE: mode=default run=20261024-161916656-39760b stale=0 pinned_skip=6/6 total_s=111 regression=none
