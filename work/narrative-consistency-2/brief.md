# Master Brief: narrative-consistency-2 — K2 / K3 / K4 checker precision (priority MEDIUM)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below. **Status: FINAL, HELD** (COWORK, 2026-10-12, swept at `f6493ce8a8567ff84ac0549dad0caccb05046401`; Owner rulings NC2-1…NC2-4 and BT-SEQ recorded in §D). It is placed only on the Owner's batch placement approval of this exact hash (batch `2026-10-12-B1`, position **2 of 2**). **Its task-start is deferred** (§SEQ).

| | |
|---|---|
| Evidence | DEV live-scan report 2026-10-12 §4, C-1…C-5 (fixtures below are verbatim fragments captured from that scan's stored results; replies were stored, so they are **captured**, not reconstructed) |
| Backlog | Entry **14** stays `partial`; its status text gains the clause "K2 / K3 / K4 precision (`work/narrative-consistency-2/`)". "Beyond K1–K6 stays behind 8b" is unchanged |
| Baseline | the `branch-dev` tip **at this task's task-start** (after `tech-score-reliability-1` has LANDed; §SEQ). **Valid only if** at that tip:<br>• `functions._nlmConsistencyChecks` in `qa/fixtures/index-pins.json` = `093156a4…`;<br>• `qa/narrative_consistency_offline.js` sha256 = `588da38a…` (its `f6493ce` content);<br>• every §A anchor matches exactly once.<br>Otherwise HOLD and re-pin |
| Branch / slot | `task/narrative-consistency-2`; the first Worker slot free after `tech-score-reliability-1` LANDs |
| Mode | **Auto** (attended): deterministic warn-only checker; offline QA; no ASK / DENY file; no score / action / grouping effect (D9) |
| qa:offline | **no new suite; count unchanged** |
| Parallel with | **not** `tech-score-reliability-1` (shared `index.html` + pin map). Any disjoint lane-B task is fine. One heavy run at a time |

## §SEQ Sequential execution dependency (explicit; BT-SEQ, Owner 2026-10-12)

| Step | Condition |
|---|---|
| Brief-only commit | placed in batch `2026-10-12-B1` as position 2, parent = **T1** (the `tech-score-reliability-1` brief commit) |
| Task-start | **only after `tech-score-reliability-1` is LANDed, R12-pushed and cleaned** (`pt-land-log` `cleanup` entry for `task/tech-score-reliability-1`) |
| Why | both tasks change `index.html` and `qa/fixtures/index-pins.json`; in parallel, the second task's Second-LAND resync would conflict on the pin map |
| At task-start | Bootstrap (or COWORK) re-checks this brief's Baseline row and §A anchors at the then-current tip, then creates `task/narrative-consistency-2` **from that tip** in the first free slot and runs `task-start`. Any mismatch → STOP and return to COWORK for re-pin (no improvising) |
| If seq 1 closes partially or is abandoned | this task may start on the resulting tip after the same re-check |

## §0 Findings (all confirmed by code reading against captured text; DEV prices in brackets)

| ID | Check | Captured fragment | Mechanism (confirmed) |
|---|---|---|---|
| C-4a | K2 FP | FROG [97.52]: "…Reduce any extended positions above $103. Invalidation: break below $94 (MA20 support) ends…" → "downside/support level $103 is above the price" | the number pattern `\d[\d,]*\.?\d*` **consumes the sentence-ending "."** after `$103`, so the no-clause-break window `[^;.,\n]{0,40}?` continues into the next sentence and binds "support" |
| C-4b | K2 FP | QQQ [746.165]: "…50bps of yield upside → 3–5% downside to $705–$715 support zone…" → "upside/resistance level $705 is below the price" | the **first** direction word in the window binds ("upside", about yields), not the one **nearest** the level ("downside") |
| C-1 | K3 FP | FROG [97.52] "30.71% above MA150 ($74.61"; MSFT [540.093] "$500.45 (+7.92%)"; QQQ [746.165] "$691.15 (+7.96%)" | the narrative states price ÷ level − 1 (correct); K3 checks only \|level − price\| ÷ price |
| C-2 | K3 FP | NVDA [226.73] "…(0.00% distance), MA50 at $222.08" → "0% to $222.08" | the `%` → `$` gap allows `)` and `,`, so a `%` from one clause pairs with the next clause's level |
| C-3 | K3 FP | FROG [102.23] "+28.7% YoY revenue, $148.0M" (pre-scan stored result) | a `$` business figure with a magnitude suffix read as a price level |
| C-3b | K3 FP-in-waiting | QQQ "3–5% downside to $705–$715" (masked today because K3 stops at its first flag) | range endpoints treated as one point claim |
| C-5 | K4 FP | QQQ invalidation: "Break above intraday high $749.79 + close above $750 … = early breakout signal, shift to add_on_breakout; conversely, close below MA50 $724.52 on heavy volume = thesis deterioration, exit to cash." → floor 735 ≤ 749.79 | K4 takes the **first** `$` in the invalidation field, here a bullish breakout trigger |

**Genuine detections that must be preserved:**
- **G-1 FROG K4:** entry "$94.00–$96.00 …", invalidation "Break below MA20 ($94.41) closes healthy uptrend; pivot to avoid if daily close below $93.50." → K4 "floor 94 ≤ 94.41".
- **G-2 NVDA K1:** "today" vs a 2026-10-09 catalyst (unchanged logic).
- **G-3:** every existing NC-1…NC-14 fixture keeps its verdict and message text (e.g. CBOE C3 "17% to $117.97 is 17.97% from the price 100.00"; "Support at $90 (-12%)" fires; "(-10%)" passes).

## §D Rulings (Owner, 2026-10-12; no open decision)

| ID | Ruling |
|---|---|
| NC2-1 | **Approved:** a K3 pair passes if either convention is within 0.5 pp (\|L − P\| ÷ P **or** \|P − L\| ÷ L). The message keeps the price-relative figure |
| NC2-2 | **Approved:** a K3 pair is skipped when the `%` or the `$` is part of a range |
| NC2-3 | **Approved:** a `$` amount followed by a magnitude suffix (M, B, K, mn, bn, million, billion, thousand) is not a price level |
| NC2-4 | **Approved:** K4 uses the first `$` level whose own clause is not upside / breakout context; no eligible level → silent |
| Condition | **Genuine inconsistency detection is preserved** (G-1…G-3; NC-18) |
| BT-SEQ | **Approved:** sequential execution after `tech-score-reliability-1` (§SEQ) |

## §A Anchors (`f6493ce`; each exactly once, inside `_nlmConsistencyChecks` :7154–7231)

| Anchor | Line |
|---|---|
| `    const reK2 = /` | :7187 |
| `      const word = String(m2[1] \|\| m2[4]).toLowerCase();` | :7190 |
| `    const re = /(\d+(?:\.\d+)?)\s?%` | :7199 |
| `      if (refs.some(ref => Math.abs(level - ref) / ref <= 0.0005)) continue;` | :7206 |
| `      const actual = Math.abs(level - price) / price * 100;` | :7207 |
| `      if (Math.abs(actual - pct) > 0.5) { out.push({ id: 'K3'` | :7208 |
| `    const floors = dollars(item.entry_zone);` · `    const inv = dollars(item.invalidation)[0];` | :7214 · :7215 |

## §C Hard constraints

- **Message texts, ids:** exactly K1…K6; every message text is unchanged.
- **D9:** warn-only; AI text never altered; no score / action / grouping / ordering / persistence effect.
- **Edit scope:** edits only inside `_nlmConsistencyChecks`; no new top-level function or global; braces inside literals stay balanced, with a SETUP row proving complete extraction.
- **Byte-identical lines** (planted-negative anchors in the NC suite): `refs.some(...) continue;` :7206, `refs.push(item._verifiedPrice);`, `const actual = …` :7207, `if (Math.abs(actual - pct) > 0.5)` :7208, `const floors = dollars(item.entry_zone);` :7214, the K2 direction comparisons (`if ((word === 'downside' || word === 'support') && level > price)`), and the `if (floor <= inv) out.push({ id: 'K4'` line.
- **Re-anchoring evidence (Owner check 1):** in the COWORK prototype the only two failures were these two planted negatives, both `mutation anchor found 0 times`. Their production lines change by design, so the failure is in the anchor, not the behaviour. With each anchor re-pointed to the new text and the **same mutation intent**, the suite passes **105 / 105**, and both negatives bite again:
  - NC-2 "window removed": `[^$;.,\n]{0,40}…` → `[^$\n]{0,400}…`, keeping the new number pattern `(\d[\d,]*(?:\.\d+)?)`;
  - NC-14 "bare number read on the invalidation side": anchor `    const inv = invLevel(item.invalidation);` → the same bare-number replacement as today.

  No functional assertion failed, so these are obsolete anchors, not regressions.
- **Lines that must change, with their negatives updated to the new text and the same intent:** the K2 regex (NC-2 "window removed" negative) and the `const inv = …` line (NC-14 negative). No assertion is weakened.
- **Pin map:** `index-pins --diff <base>` lists exactly `functions._nlmConsistencyChecks` (+ the file digest).

## §1 Slices (continuous; automatic continuation on PASS)

| Slice | Change | New NC rows (RED first, then GREEN) |
|---|---|---|
| **S1 — K2** | (a) number pattern `\d[\d,]*(?:\.\d+)?` so a sentence-ending "." is never consumed; (b) bind the direction word **nearest** the level within the existing window | NC-15a FROG C-4a → no K2; NC-15b QQQ C-4b → no K2; NC-15c a true support-above-price in one clause still fires; NC-15d existing NC-2 fixtures unchanged |
| **S2 — K3** | NC2-1 dual denominator (as an added `continue` **before** the unchanged :7208 line); C-2 gap of the `%`→`$` alternative excludes `)` and `,`; NC2-3 magnitude-suffix skip; NC2-2 range skip | NC-16a FROG / MSFT / QQQ C-1 → no K3; NC-16b NVDA C-2 → no K3; NC-16c FROG C-3 (captured, with comma) and a no-comma variant "Revenue rose 28.7% to $148.0M in Q2." at 102.23 → no K3 (the variant makes the suffix rule's negative bite); NC-16d QQQ C-3b range → no K3; NC-16e CBOE C3 still K3 with the identical text; NC-16f "Support at $90 (-12%)" still K3 |
| **S3 — K4** | NC2-4 level choice | NC-17a QQQ C-5 → no K4; NC-17b FROG G-1 → K4 "floor 94 is at or below the invalidation 94.41"; NC-17c all NC-4 / NC-14 fixtures unchanged; NC-17d an invalidation with only upside levels → silent |

**Whole-scan regression row NC-18:** the §F fixture table (captured DEV fragments) produces exactly the "after" column of §F. FROG G-1 → `K4` ("entry-zone floor 94 is at or below the invalidation 94.41"); every other row → no K2 / K3 / K4; the C3 control fires with its unchanged text. NVDA's K1 (G-2) stays covered by the existing NC-1 fixtures.

**Planted negatives (added):**
- first-word binding restored → NC-15b;
- trailing-"." number pattern restored → NC-15a;
- single denominator restored → NC-16a;
- `)` / `,` allowed in the gap → NC-16b;
- suffix skip removed → NC-16c;
- range skip removed → NC-16d;
- first-`$` K4 restored → NC-17a;
- K4 skips downside levels too → NC-17b.

**§2 Continuation:**
- rows GREEN and NC-1…NC-14 unchanged;
- `--diff` = `_nlmConsistencyChecks` only;
- no unresolved Codex Class I.

**Program STOP:**
- a message text or id change;
- any edit outside `_nlmConsistencyChecks` in `index.html`;
- a G-1…G-3 detection lost;
- a fixture presented as anything other than captured DEV text;
- any live scan;
- a second heavy run.

## §3 Codex review requirements

Step 8 per slice. Codex confirms:
- each C-n fixture is resolved by the stated mechanism, not by a blanket skip;
- G-1…G-3 preserved;
- the byte-identical anchor lines are untouched;
- every planted negative bites;
- the D9 invariants hold.

Step 12: final check.

## §F Fixture table (captured from the 2026-10-12 DEV scan; `price` = `_verifiedPrice` = `ctx.price`)

| Row | Fields | Before (`f6493ce`) | After |
|---|---|---|---|
| FROG C-4a | summary "Reduce any extended positions above $103. Invalidation: break below $94 (MA20 support) ends healthy uptrend." · 97.52 | K2 "$103 … above the price" | — |
| QQQ C-4b | summary "Near-term risk: hot CPI print → 50bps of yield upside → 3–5% downside to $705–$715 support zone (MA100 approx)." · 746.165 | K2 + K3 | — |
| FROG C-1 | summary "Stock is -7.79% below 1Y high, but +30.71% above MA150 ($74.61) and +3.30% above MA20 ($94.41)." · 97.52 | K3 | — |
| MSFT C-1 | summary "MA20 at $510.10 (+5.88%), MA50 at $500.45 (+7.92%), MA150 at $432.75 (+24.80%) all supporting structure." · 540.093 | K3 | — |
| QQQ C-1 | summary "MA20 at $737.54 (+1.17%), MA50 at $724.52 (+2.99%), and MA150 at $691.15 (+7.96%) confirm healthy uptrend structure intact." · 746.165 | K3 | — |
| NVDA C-2 | summary "MA20 at $226.73 is exactly current price (0.00% distance), MA50 at $222.08 (+2.10%), MA150 at $207.54 (+9.25%)." · 226.73 | K3 | — |
| FROG C-3 | summary "Q2 earnings beat ($0.27 EPS vs $0.24 consensus, +28.7% YoY revenue, $148.0M) in August." · 102.23 | K3 | — |
| QQQ C-3b | summary "hot CPI print → 3–5% downside to $705–$715 support zone." · 746.165 | K3 | — |
| QQQ C-5 | action `hold_wait` · entry "Add on pullback to $735–$740 (MA20 support) only after CPI/PPI confirmation that inflation is cooling; avoid chasing current price near 1Y high." · invalidation "Break above intraday high $749.79 + close above $750 on >0.8x volume = early breakout signal, shift to add_on_breakout; conversely, close below MA50 $724.52 on heavy volume = thesis deterioration, exit to cash." · 746.165 | K4 735 ≤ 749.79 | — |
| FROG G-1 | action `add_on_pullback` · entry "$94.00–$96.00 (near MA20, 3–5% dip); confirm on volume >1.2M. Breakout buy zone: $100.50+ with volume expansion." · invalidation "Break below MA20 ($94.41) closes healthy uptrend; pivot to avoid if daily close below $93.50." · 97.52 | K4 | **K4 (unchanged)** |
| MSFT K4 | `hold_wait` · entry "$525–$530 on pullback to MA20; add_on_breakout above $542.74 only if volume >1.2x 20D avg" · invalidation "Close below MA20 ($510.10) on volume >1.0x 20D avg signals breakdown risk to MA50 retest." · 540.093 | — | — |
| NVDA K4 | `add_on_pullback` · entry "MA50 at $222.08 (2% pullback from current); confirmation required: volume >1.2x 20D avg and hold above MA50 close." · invalidation "Break below MA150 ($207.54) without recovery closes the uptrend structure and signals deeper pullback risk. Close below $220 on volume >2x 20D avg would signal capitulation and require reassessment." · 226.73 | — | — |
| C3 control | summary "A 17.0% move to $117.97 is the target." · 100 | K3 "17% to $117.97 is 17.97% from the price 100.00" | **K3 (identical text)** |

**Feasibility evidence** (COWORK scratch prototype at `f6493ce`, outside the repo, deleted after the check; reference only, no approval):
- A prototype of S1–S3 inside `_nlmConsistencyChecks` produced the "after" column exactly.
- `narrative_consistency` ran 103 / 105 functional + negative asserts PASS. The only 2 failures are the planned anchor updates (the NC-2 window negative and the NC-14 `inv` negative).
- The suffix-rule negative bites on the no-comma variant.
- `pin-span-check`: COMPLETE, core 378 = acorn 378, errors 0 (the existing AT-RISK warning only).

## §ET (ET-1; non-blocking)

**Estimate:** about **50 min** plus Owner gates: 10 min setup, then S1 about 8 min, S2 about 12 min, S3 about 8 min, then 15 min closure. `## Timing` as in the card.

## §CMD Command card (one command per Bash call; Bash only; absolute canonical root)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
node qa/guard_integrity_check.js --task task/narrative-consistency-2 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/narrative_consistency_offline.js
node qa/tools/index-pins.js --diff <base>
node qa/tools/index-pins.js --update
node qa/tools/index-pins.js --check
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/narrative-consistency-2 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/narrative-consistency-2
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B:** `git add <explicit paths>`.
- **C:** R11, R12 LAND, R12 PUSH; a heavy-lane go-ahead only if E1-D7 is due.
- **Never:** `curl`, `WebFetch`, `netlify`, PowerShell.

## §PEP / §UER

- **§PEP:** expected prompts are `git add` and the R12 verbs. FORM-RECOVERY applies only if task-started after `form-recovery-1` lands.
- **§UER:** **ATTENDED-ONLY**.

## §Y Files, land-scope, land-tests

```
index.html                            _nlmConsistencyChecks only
qa/narrative_consistency_offline.js   NC-15…NC-18 + planted negatives; two anchor updates (NC-2 window, NC-14 inv)
qa/fixtures/index-pins.json           regenerated
BACKLOG.md                            step 10a: entry 14 status clause
```

<!-- land-scope:begin -->
index.html
qa/narrative_consistency_offline.js
qa/fixtures/index-pins.json
BACKLOG.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/narrative_consistency_offline.js
node qa/tools/index-pins.js --check
node qa/index_pins_offline.js
node qa/high1y_label_offline.js
node qa/ma_stack_label_offline.js
node qa/no_synthetic_score_offline.js
node qa/analyst_parser_offline.js
node qa/ath_isolation_offline.js
node qa/pulse_analyst_view_offline.js
node qa/ath_client_offline.js
node qa/scan_results_enrichment_offline.js
node qa/tech_snapshot_cache_offline.js
node qa/deep_dive_v0_offline.js
node qa/ui_hygiene_offline.js
<!-- land-tests:end -->

**Skills:** `pt-offline-suite` Required; `pt-ai-output-change` Recommended (finding vocabulary). `/plan` mandatory.

**§L:** close at the last passed slice (M-4).

**Post-push DEV check** (separate approval): re-open stored results read-only and confirm the Consistency lines for FROG / QQQ / NVDA / MSFT match NC-18. No scan.
