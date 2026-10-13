# review.md — tase-units-1 (Worker A, Manual, attended)

## Result
S1 (characterisation suite), S2 (display), S3 (prompts) and S4 (research lookup) all passed; no slice was cut (§L not used).
TASE prices (`.TA`) are shown in ILS (`₪88.84`) in the research panel and stated in ILS (`88.84 ILS` + one `CURRENCY:` line) in the AI prompts; the ticker-header regex keeps a 1–2 letter `.`/`-` suffix so `MTRX.TA`, `BRK.B` and `BRK-B` find their research. Conversion happens only at the display and prompt boundary (I-1); stored and fetched values stay raw agorot. No scoring logic, storage, network, system prompt or `market-data.js` change.

## Files changed
- Implementation (5): index.html, qa/tase_units_offline.js, qa/tech_snapshot_cache_offline.js, qa/labs_panel_offline.js, qa/fixtures/index-pins.json
- Evidence (tracked): work/tase-units-1/brief.md, work/tase-units-1/review.md

## What changed
- `index.html` `renderMainPanel` (S2): `_pxDiv` / `_pxSym` declared once next to `price` (inline `/\.TA$/` rule, no new top-level function); used at the five sites: header price, `fmtMA`, post-↻ regular price, change amount (`… /100 / _pxDiv`), extended price.
- `index.html` `formatStockContext` / `buildTechSnapshotBlock` (S3): per-row `_ta` / `_px` and the `.TA`-only `CURRENCY:` line; `fmtL` for the three MA levels (pct, ATH line and every other field untouched).
- `index.html` `parsePerplexityContext` (S4): the ticker-header capture becomes `([A-Z]{1,6}(?:[.\-][A-Z]{1,2})?)`.
- `qa/tase_units_offline.js`: new, TU-1…TU-9 + planted negatives NEG-1…NEG-10 (19 PASS lines); loads LF and CRLF source (EOL-1, checked in TU-9).
- `qa/fixtures/index-pins.json`: regenerated per slice; `index-pins --diff 14d6c94` lists only `renderMainPanel`, `formatStockContext`, `buildTechSnapshotBlock`, `parsePerplexityContext` (plus digest). `index-pins: OK (379 functions, 25 regions)`.

## TU table (S1 RED state → GREEN)
| ID | At S1 (index.html unchanged) | Final |
|---|---|---|
| TU-1 header price ₪88.84 / US $226.73 | US GREEN, `.TA` RED | GREEN (S2) |
| TU-2 MA rows ÷100 with ₪ | US GREEN, `.TA` RED | GREEN (S2) |
| TU-3 change amount ÷100 (0.84); US 2.15 | US GREEN, `.TA` RED | GREEN (S2) |
| TU-4 PRE / POST ext price and post-↻ regular price (incl. POST header) | US GREEN, `.TA` RED | GREEN (S2) |
| TU-5 formatStockContext + CURRENCY line | US GREEN, `.TA` RED | GREEN (S3) |
| TU-6 buildTechSnapshotBlock `87.00 ILS`, ATH line kept | US GREEN, `.TA` RED | GREEN (S3) |
| TU-7 parser keys MTRX.TA / BRK.B / BRK-B / AAPL. → AAPL / AAPL.COM → AAPL | RED | GREEN (S4) |
| TU-8 invariants (raw `_verifiedPrice`, ATH AC-11 shape −8.33%, K-check callers, 10 fetch/scoring digests) | GREEN | GREEN |
| TU-9 SETUP (extraction, CRLF load, renderMainPanel reference set) | GREEN | GREEN |
| NEG-1…NEG-10 (all seven §3 negatives, plus MA-prompt, change-amount, ext-price) | n/a (anchors absent) | each bites its row |

## US byte-identity proof
- TU-1…TU-4: the US assertions run first in every row and pass at S1 (unchanged source) and at every later slice.
- TU-5: `formatStockContext` for NVDA equals the literal pre-task oracle byte for byte; a mixed map keeps the NVDA row unchanged and emits `CURRENCY:` exactly once.
- TU-6: the US `buildTechSnapshotBlock` equals the literal oracle (`MA20: $180.00 (+5.56%)   MA50: …`).
- Unmodified suites that pin US output pass: `ath_client` 123 (AC-5, AC-11), `high1y_label` 103, `tech_snapshot_cache` 324 (TC-12 dynamic rows), `ma_stack_label` 86, `narrative_consistency` 153, `deep_dive_v0` 74.

## Known constant edits (§C, the only suite edits)
- `qa/tech_snapshot_cache_offline.js` TC-12 static:
  - `BASE_PRICE_LINE` before: `  let price = item._verifiedPrice ? `$${item._verifiedPrice.toFixed(2)}` : '—';\n`
  - after: the three lines `const _pxDiv = …`, `const _pxSym = …`, `let price = item._verifiedPrice ? `${_pxSym}${(item._verifiedPrice / _pxDiv).toFixed(2)}` : '—';`
  - `BASE_EXT_OVERRIDE` before: `… price = `$${_extC.regularPrice.toFixed(2)}`;` → after: `… price = `${_pxSym}${(_extC.regularPrice / _pxDiv).toFixed(2)}`;`
- `qa/labs_panel_offline.js` LB-8 `BASE_PINS.renderMainPanel` before: `afce25945eea3cbd…` (market-status-pill-1) → after: `9ae8e8b04e0d21fd6f39c922397736521291904b8ce3f21b296ac881b2971493`.

## QA
- Step 0 (pre-edit baseline, slot A, HEAD 14d6c94): `OFFLINE VALIDATION: PASS`, 85 suites.
- Step 10 (final tree, HEAD 41e9bb9): `OFFLINE VALIDATION: PASS`, 86 suites (= 85 + `qa/tase_units_offline.js`).
- Land-tests (all 18 in the brief's block) PASS: tase_units 9 rows + 10 negatives, index-pins `--check` OK, index_pins 13, tech_snapshot_cache 324, labs_panel 32, ath_client 123, high1y_label 103, ma_stack_label 86, narrative_consistency 153, deep_dive_v0 74, analyst_parser 57, no_synthetic_score 160, ui_hygiene, pulse_analyst_view 108, scan_results_enrichment 67, vis_score_caliper 307, ts1_default_exposure 72, eod_packet_v0 196.
- §F comparison: counts identical to the prototype where listed; only the two known constants needed editing, and after them TC-12 static and LB-8 pass.

## Fresh-context self-review (step 7)
Re-read the brief and the 5-file diff against the requirement→test map: every §1 row and every §3 negative has a named assertion; no orphan assertion. Result of the review: none beyond the Codex-driven fixes below.

## Codex
- S1 diff review: 2 Class I (test coverage) — both FIX: EOL-1 CRLF load now checked in TU-9; TU-4 now asserts the POST header (post-↻) price. 
- S2 diff review: PASS, no findings.
- S3 diff review: PASS, no findings.
- S4 diff review: 1 finding (reported Class II): "NEG-10 does not bite". **REJECT** — greedy `{1,3}` takes `.COM`, so TU-7 reads key `AAPL.COM` vs wanted `AAPL`; the suite prints `negative caught: NEG-10 … ("TICKER: AAPL.COM" → ["AAPL.COM"], want ["AAPL"])`.
- Final check (step 12, whole task diff incl. review.md): PASS, no Class I or Class II findings (1 round); appended under `## Final check` in codex.md.
- Raw outputs in codex.md.

## Backlog reconciliation
- Brief's Backlog row: none (audit findings PA-01 / PA-02; the correction backlog records them).
- Action taken: none. No `BACKLOG.md` edit; the finished work's effect matches the row.

## Incident
One R1 hook denial (a Bash heredoc `node - <<EOF` used to edit `qa/tase_units_offline.js`); the command did not execute. Treated as STOP-6, not retried or rerouted. Owner ruling "R1 Recovery" (one-time, task-specific) authorised three Edit-tool corrections in that suite (local `countOf`, pinned `BASE_RM_REFS`, US-first assertion order), made as ordinary Edit-tool operations. No other denial occurred. Details in qa.log.

## Lessons
- [local] Do not feed edit scripts to `node` through a heredoc in a Worker slot (R1); use the Edit tool.
- [local] A reviewer can mis-trace regex backtracking; verify a "does not bite" claim by printing the mutant's actual failure message in the suite output.
- [covered] The brief-listed constant edits (TC-12 static, LB-8) were predicted by §C and §F; no new coupling found.

LAND-EVIDENCE: qa-offline=PASS 86; targeted=PASS; codex-classI-unresolved=0
