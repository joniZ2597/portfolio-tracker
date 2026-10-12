# review.md — narrative-consistency-2 (K2 / K3 / K4 checker precision)

## Summary

Three ordered slices inside `_nlmConsistencyChecks` (warn-only, D9): **S1 (K2)** — the level number pattern no longer consumes a sentence-ending "." and the direction word *nearest* the level binds (tempered gap); **S2 (K3)** — dual denominator (NC2-1), `%`→`$` gap excludes `)` and `,`, magnitude-suffix skip (NC2-3), range skip (NC2-2); **S3 (K4)** — `invLevel`: the first `$` level whose own clause is not upside / breakout context, otherwise silent (NC2-4). All seven captured DEV false positives (C-4a, C-4b, C-1, C-2, C-3, C-3b, C-5) are resolved by the stated mechanisms; G-1 (FROG K4), G-2 (K1, untouched) and G-3 (every NC-1…NC-14 verdict and message text) are preserved. Message texts and ids K1…K6 are unchanged.

## Files changed

- Implementation (3): index.html, qa/narrative_consistency_offline.js, qa/fixtures/index-pins.json
- Evidence (tracked): work/narrative-consistency-2/brief.md, work/narrative-consistency-2/review.md

(`BACKLOG.md` is also edited — brief §Y / `land-scope` step 10a; see "Backlog reconciliation".)

## QA

- Step 0 (pre-edit): `npm run qa:offline` PASS **83** suites (`qa.log` line 1).
- RED: suite with NC-15…NC-18 and the planted negatives before any production edit: FAIL (47 of 152 asserts) — exactly the new rows plus the two re-pointed anchors (`mutation anchor found 0 times`).
- Targeted per slice: S1 `node qa/narrative_consistency_offline.js` PASS (114 asserts) · S2 PASS (130) · S3 / final PASS (**153**); `node qa/tools/index-pins.js --check` OK (378 functions, 25 regions); `node qa/tools/index-pins.js --diff 2c2b0d9` = `functions._nlmConsistencyChecks` only; `qa/index_pins_offline.js` PASS 13.
- Step 10: `npm run qa:offline` on the final synchronised tree (HEAD `6c3fad1`) PASS **83** suites — count unchanged — 80 s (`qa.log`).
- E1: the four E1 contracts print `SKIP (contract pinned …)`; E1-D7 not due; no heavy-lane go-ahead needed.

## Planted negatives and re-pinned anchors

- Re-pointed, same mutation intent (brief §C): **NC-2 "window removed"** (`[^$\n]{0,400}…` replaces the new tempered window, new number pattern kept) and **NC-14 "bare number read on the invalidation side"** (anchor `    const inv = invLevel(item.invalidation);`, same bare-number replacement). Both bite again.
- Added (each anchor unique, each bites): trailing-"." number pattern restored → NC-15a · first-word binding restored → NC-15b · single denominator restored → NC-16a · `)` / `,` allowed in the gap → NC-16b · suffix skip removed → NC-16c (the no-comma variant makes it bite) · range skip removed → NC-16d · first-`$` K4 restored → NC-17a · K4 skips downside levels too ("below" counted as upside context) → NC-17b.
- SETUP row (NC-15): `_nlmConsistencyChecks` extracts completely — balanced braces including the regex quantifiers, ends with `return out;` + `}`.

## Codex ledger (raw responses in `codex.md`, untracked)

| # | Round | Finding | Class | Disposition |
|---|---|---|---|---|
| 1 | S1 review | none | — | PASS |
| 2 | S2 review | `isRange` does not read a spaced ASCII hyphen ("3 - 5% … $705 - $715") as a range | I | REJECT — a spaced `-` after a digit is an ordinary separator in LLM text ("MA20 - 12% below …"); reading it as a range would silence genuine wrong-percentage claims, contradicting NC2-1/NC2-2 and "genuine detection is preserved". Locked by an NC-16 assertion ("Support at MA20 - 12% below $90" still K3) |
| 3 | S3 review | `invLevel` skips a whole clause containing an upside word even when it also holds the downside invalidation ("Close below $94.41 after a failed move above $100") | I | DEFER — NC2-4 is the Owner's ruling at clause granularity ("the first `$` level whose own clause is not upside / breakout context"); a per-level rule changes the ruled contract (a level followed by "= breakout" would become eligible) and needs a new brief + ruling. The effect is a missed warning on a warn-only checker, never a false one. Routed as a [design] lesson below |
| 4 | Final check | none | — | PASS |

## Brief §3 confirmations

- Each C-n fixture is resolved by its mechanism, not a blanket skip: C-4a number pattern · C-4b nearest word · C-1 dual denominator · C-2 gap excludes `)` `,` · C-3 comma exclusion + suffix skip (no-comma variant) · C-3b range skip · C-5 first non-upside clause.
- G-1…G-3 preserved: NC-18 FROG G-1 → `K4` "entry-zone floor 94 is at or below the invalidation 94.41"; C3 control → identical K3 text; NC-1…NC-14 unchanged and green.
- Byte-identical lines untouched (`git diff -U0` shows none of them): `refs.some(...) continue;`, `refs.push(item._verifiedPrice);`, `const actual = …`, `if (Math.abs(actual - pct) > 0.5)`, `const floors = dollars(item.entry_zone);`, the K2 direction comparisons, `if (floor <= inv) out.push({ id: 'K4'`.
- D9: warn-only; NC-10 static checks still prove no storage / score / action / prompt reference in the checker.

## Backlog reconciliation

- Brief's Backlog row: entry **14** stays `partial`; its status text gains "K2 / K3 / K4 precision (`work/narrative-consistency-2/`)".
- Action taken: `updated`. Entry 14 status text: `*K3 / K4 precision fixed (work/ai-output-2/).*` → `*K3 / K4 precision fixed (work/ai-output-2/); K2 / K3 / K4 precision (work/narrative-consistency-2/).*`. No snapshot table, count or other entry touched; entry 14 does not close, so no DONE / HISTORY line.
- The new BACKLOG text matches the diff, the QA results and the work being landed. "Beyond K1–K6 stays behind 8b" is unchanged.

## Definition of Done

- [x] NC-15…NC-18 GREEN; NC-1…NC-14 unchanged (153 asserts); all planted negatives bite.
- [x] `index-pins --diff 2c2b0d9` lists exactly `functions._nlmConsistencyChecks`.
- [x] Message texts and ids unchanged; no edit outside `_nlmConsistencyChecks` in `index.html`.
- [x] Step 10 PASS, 83 suites (count unchanged).
- [x] Files: index.html, qa/narrative_consistency_offline.js, qa/fixtures/index-pins.json, BACKLOG.md (step 10a).

## Fresh-context self-review (step 7)

Re-read the brief and the complete diff against the requirement → test map (`plan.md`): no change required. Checked specifically: every added assertion maps to a brief row (the spaced-hyphen, ordinary-word-after-level and "nearest still detects" rows are boundary rows for NC2-2, NC2-3 and S1b); `m[0].indexOf(m[3])` is the level start in the `$level (x%)` alternative (nothing precedes the number but `$` and an optional space); no division by zero (a `$0` level gives Infinity, which never passes the dual test); `invLevel(undefined)` cannot occur (K4 is gated on both fields being truthy) and `String(s)` guards the rest. The one change made during the slices: NC-15a/b assert "no K2" (not "no finding at all") so the S1 state is checkable before S2 fixes the K3 half of the same QQQ text.

## Timing

- Task start (record): 2026-10-12T21:12:36Z.
- Step 0: ≈21:16:06Z → 21:17:23Z (PASS 83, 77 s).
- S1 checkpoint 21:24:14Z (`cb7443a`); S2 21:25:54Z (`0dec462`); S3 21:27:05Z (`6c3fad1`).
- Step 10: ≈21:27:20Z → 21:28:40Z (PASS 83, 80 s).
- Codex rounds: S1 ×1, S2 ×1, S3 ×1; final check ×1 (see "Final check").

LAND-EVIDENCE: qa-offline=PASS 83; targeted=PASS; codex-classI-unresolved=0

## Final check

Final check: 1 rounds, 0 class-II findings fixed, self-checked; no implementation change, no QA re-run.

Self-check: every `work/narrative-consistency-2/` path named exists and is one of the five canonical files (brief.md, review.md, codex.md; plan.md and qa.log exist); the counts 83 (suites), 153 (asserts) and 47 of 152 (RED) match lines in `qa.log`; no section reads "Pending" or "TBD". Class I findings in the final round: none; the S2 REJECT and S3 DEFER above were classified at their slice reviews.

## Lessons

- [design] K4 invalidation-level choice is clause-granular (NC2-4). Destination-ready text for `work/narrative-consistency/breakdown.md`: "K4 reads the first `$` level whose own clause (split on `;`, `, ` and sentence-ending `. `) has no upside / breakout word. A downside level that shares a clause with an upside word ('Close below $94.41 after a failed move above $100') is not read, so K4 stays silent there. A per-level rule needs an Owner domain ruling (DR-n) first, because a level followed by '= breakout' would otherwise become eligible."
- [covered] A spaced ASCII hyphen is deliberately not a range separator in K3 — already covered by the NC-16 assertion added here and the REJECT in the ledger.
- [local] The slices were implemented in one pass, then rebuilt as three per-slice states from saved finals by a scratch script (outside the repo) so each checkpoint commit and Codex review saw a state that had passed its own targeted run; the final tree is byte-identical to the verified final (`cmp`).
- [local] The Edit tool wrote the literal en / em dash characters where `–` / `—` escapes were typed in the K3 `isRange` helper; behaviour is identical and the pin map was regenerated from the committed text.
