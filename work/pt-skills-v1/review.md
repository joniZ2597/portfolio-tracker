# Review: pt-skills-v1 — `pt-offline-suite`, `browser-integrity-qa` refresh, `pt-ai-output-change`

Brief: `work/pt-skills-v1/brief.md` (FINAL 2026-10-07). Baseline `d9c5a0e` (`branch-dev` = `origin/branch-dev`);
brief commit `e5378aa`; task branch `task/pt-skills-v1` in Worker A. Documentation-only: three reusable Worker
Skills, no product, `qa/**` or governance file. All validation offline and read-only; historical replays read files
through `git show <commit>:<path>`.

## Files changed
- Implementation (10): `.claude/skills/pt-offline-suite/SKILL.md`, `.claude/skills/pt-offline-suite/references/coupling-classes.md`, `.claude/skills/pt-offline-suite/references/suite-patterns.md`, `.claude/skills/pt-offline-suite/templates/plan-sections.md`, `.claude/skills/browser-integrity-qa/SKILL.md`, `.claude/skills/browser-integrity-qa/references/live-scan-protocol.md`, `.claude/skills/browser-integrity-qa/templates/report.md`, `.claude/skills/pt-ai-output-change/SKILL.md`, `.claude/skills/pt-ai-output-change/references/ai-surfaces.md`, `.claude/skills/pt-ai-output-change/templates/findings.md`
- Evidence (tracked): work/pt-skills-v1/brief.md, work/pt-skills-v1/review.md

## What changed

- **`pt-offline-suite` (new, 4 files, model-invocable).** `SKILL.md`: Purpose · When the brief lists this Skill ·
  Coupling sweep (Grep/Read procedure, classes a–e, output table, stop rule) · Suite patterns (pointers) · Planted
  negatives (counted anchor + positive control) · Re-pin with revert proof (per EOL form) · Count discipline ·
  Outputs · With `/plan` · STOP conditions · Boundaries. `references/coupling-classes.md`: each class with search
  patterns, the instances known at `d9c5a0e` by suite and symbol (marked re-verify), what trips it.
  `references/suite-patterns.md`: seven pointers (sandbox, render harness, stubs, temp root, masked pin, LF/CRLF
  forms, counted negatives). `templates/plan-sections.md`: sweep table, requirement → assertion map, planted
  negatives, re-pin ledger, closing sweep.
- **`browser-integrity-qa` (refresh, 1 edit + 2 new files, stays `disable-model-invocation: true`).** R1: the
  `/phase-start` assumption and the `CHECKPOINT.md` gate-state read removed; context comes from the brief's
  live-actions section and `plan.md`. R2 State snapshot (per-`pt_*` sha256 in page, selection, active ticker). R3
  Scan-selection protocol. R4 Evidence extraction (≤ 950-character chunks, URLs and `?` `&` `=` stripped). R5
  One-action discipline (state check before any retry). R6 kept: always-required checks, scope-conditional checks,
  `<frontend_aesthetics>` reference, server-gate `NOT VERIFIED` rule, the closing read-only boundary paragraph
  (verbatim). R7 report additions (pre/post `pt_*` table, actions with counts, restore result).
  `references/live-scan-protocol.md`: steps 1–9 and the I-1…I-4 incident → rule map. `templates/report.md`.
- **`pt-ai-output-change` (new, 3 files, model-invocable).** `SKILL.md`: Purpose · When the brief lists this Skill ·
  Surface map · Data-gating pattern · Wording checks (exact string, banned term with the prohibition-line rule,
  enum → display) · Consumer-impact note · Finding taxonomy A/B/C/D · DEV hand-off · Outputs · With `/plan` · STOP
  conditions · Boundaries. `references/ai-surfaces.md`: ten rows by function name with feeds and consumers, the
  `*_near_ath` consumer note, usage steps. `templates/findings.md`: finding table, wording-check table,
  consumer-impact note, DEV hand-off.

Conventions followed / overridden are in `plan.md` (untracked). Overridden by the brief: the step-0 pre-edit full
run (§0.2), "tests first" (no suite added; §4 Land-tests: none), and the tool LAND (§0.8 Owner LAND).

## Step-0 baseline (brief §0.2)

No pre-edit full run. First line of `qa.log`: `LAND-EVIDENCE: qa-offline=PASS 63; targeted=PASS;
codex-classI-unresolved=0`, copied from `work/qa-stage2-git-contracts/review.md` at `d9c5a0e` (PASS, 63 suites,
14 phases, 0 failures, 683,861 ms). Task-specific exception, not a precedent.

## 5.1 `pt-offline-suite`

### V1-OS — historical replay of the R-1 Slice A miss — PASS

Sweep run against `57afd9d` (every file read through `git show 57afd9d:<path>`), edit list = Slice A's original
nine: `computeATHDistance`, `classifyTechnicalSetup`, `buildTechSnapshotBlock`, `_techDeriveSnap`, the scan-prompt
gating text in `fetchAnthropicAnalysis`, the `orchestrate` audit trail, `_srGroupResults`, `renderMainPanel`,
`_dd0FetchAnalysis`. Non-denylisted suites plus `qa/run-offline.js` (68 suite files at that commit).

| Suite | Symbol / pin | Class | What trips it | Tripped by Slice A? | In the original brief? |
|---|---|---|---|---|---|
| `qa/ts1_default_exposure_offline.js` | TX-3 pin `renderMainPanel` (LF) | **a** | any byte change in `renderMainPanel` | yes (label edit) | **no → forced amendment 1** |
| `qa/analyst_parser_offline.js` | `PIN_MASKED_FILE` (AP-14) | **b** | any `index.html` edit outside `parsePerplexityContext` | yes | **no → forced amendment 1** |
| `qa/tech_snapshot_cache_offline.js` | TC-6 `names` = `_dd0RunCard`, `buildTechSnapshotBlock`, `_techRefInput`, `_techSnapFor` | **c** | an edited function on the list calls a name not on it | yes — `buildTechSnapshotBlock` gained `_setupDisplay` (list at `138a681` carries it) | **no → forced amendment 2** |
| `qa/vis_score_caliper_offline.js` | `PROTECTED_FN_HASHES.renderMainPanel`, `._srGroupResults` (CRLF) | a | byte change | yes | yes |
| `qa/tech_snapshot_cache_offline.js` | `BASE_PINS` (`classifyTechnicalSetup`, `buildTechSnapshotBlock`, `computeATHDistance`, …) | a | byte change; a renamed key disappears | yes | yes |
| `qa/deep_dive_v0_offline.js` | `FNS` (`_dd0FetchAnalysis`, `buildTechSnapshotBlock`, …) | c | new callee | yes (`_setupDisplay`) | yes |
| `qa/tech_snapshot_cache_offline.js` | `ENGINE_FNS`, `RENDER_REAL` (name `computeATHDistance`, `classifyTechnicalSetup`, `buildTechSnapshotBlock`, `_techDeriveSnap`) | c | a renamed function (`computeATHDistance` → `computeHigh1yDistance`) is extracted as null | yes | explained: a rename trips every list that names the symbol |
| `qa/tech_snapshot_cache_offline.js` | `BASE_CALIPER_PINS._srGroupResults`, TC-11 / TC-13 cross-pin equality | a / e | asserts caliper and TS1 pins equal the hashes of the task function | yes, once the caliper re-pins | explained: cross-pins move with the primary pins |
| `qa/tech_snapshot_cache_offline.js` | TC-10 (revert I7a–I7i restores `BASE_RM_LF`; line count = base + 3), TC-13 (rr-lbl "Score" once), TC-5 (no `_techCache`) | e | any other `renderMainPanel` edit breaks the textual revert | yes (TC-10) | explained |
| `qa/tech_snapshot_cache_offline.js` | TC-4 `orchestrate` signature regex + no `_techCache` | e | signature change | no — audit-trail edit keeps the signature | explained |
| `qa/run-offline.js` | T6 extraction of `renderMainPanel` + literals ("Score" row once, "Tech Score v1", no inline `runTechScoreV1(`); `REAL_FNS` incl. `_srGroupResults`; scoring-reference regex | d / e / c — **ASK-tier** | literal or dependency change | no (label edits do not touch the T6 literals) | explained; must stay untouched |
| `qa/scan_results_enrichment_offline.js` | `FNS` incl. `_srGroupResults`; `SIDE` negative regex | c / e | new callee / side-effect token | no (group-name string edit) | explained |
| `qa/ui_hygiene_offline.js` | UH-6 / UH-7 extraction of `renderMainPanel` | d / e | `rsCls`, `setItem` counts | no | explained |
| ~20 server-side suites | negative regex "no `orchestrate` / `analyzeChunk` / `enforceScoreConsistency` / `_techCache`" over other files | e (negative, other files) | n/a | no | explained |
| `qa/high1y_label_offline.js` | — | — | did not exist at `57afd9d` (added by Slice A) | — | n/a |

All three forced couplings present with suite, symbol and class; the four original-brief couplings present; every
other hit explained. **PASS.**

### V2-OS — template fit — PASS

`templates/plan-sections.md` block A filled for dry run D1 (below, §5.4); every cell sourced from a Grep of the
named suite at `d9c5a0e` (suite · symbol · class) or from the brief (covered?). No unsourced cell.

### V3-OS — no side effects — PASS

Read of the four files: procedures use Grep / Read and `git show` only; no write, commit, push, approval-record or
network instruction. Confirmed by the §6 grep (below): zero hits for `git commit|git push|printf|pt-*-approval|curl|http`.

## 5.2 `browser-integrity-qa`

### V1-BQ — tabletop replay of two DEV runs — PASS (no browser opened)

Inputs: the brief's §5.2 description of both runs and the 2026-10-03 pilot note
(`../_held-briefs/notebooklm-pilot/2026-10-03-post-fix-consistency-pilot.md`, "DEV state" section). No separate
record file exists for the 2026-10-05 R-4a post-push check in the repo or `_held-briefs`; the brief's description is
the replay input.

| Protocol step (`references/live-scan-protocol.md`) | 2026-10-03 consistency pilot (DEV, 4 tickers) | 2026-10-05 R-4a post-push check (DEV, 1 approved scan) |
|---|---|---|
| 1 hash every `pt_*` key in page, values never printed | needed: the pilot proved `pt_tickers`, `pt_holdings`, `pt_cash`, `pt_fx`, `pt_active_ticker` unchanged | needed: same no-side-effect proof |
| 2 record selection + active ticker | needed: selection of all 32, active ticker CRWD | needed |
| 3 selection-only via the UI toggle | needed: only MRNA · CBOE · NVDA · ROK selected (checkbox, never removal) | needed: the one ticker selected |
| 4 optional temporary add, only if allowed | needed: CBOE (not held) added for the scan | not needed |
| 5 exactly one approved action, state check before any retry | needed: one scan, 19:27–19:29 UTC | needed: one scan — **I-3** stale "Run scan" click did not fire → state check (no scan running, selection correct) before retry, no duplicate |
| 6 bounded extraction, URLs / `?` `&` `=` stripped | needed: price, MA, distance, setup, score, action per ticker from the result objects — **I-1** truncation → ≤ 950-char chunks | needed: exact parser fields (`_pplxDebug[sym]` analyst rows) — **I-1** chunking; **I-2** URLs / query strings in sources → stripped |
| 7 restore selection and active ticker; remove temporary ticker | needed: CBOE removed again, selection restored to all 32 — **I-4** renderer froze (CDP timeout) after the watchlist action although it had succeeded → state check, never repeat blindly | needed: selection restored |
| 8 re-hash and compare with the permitted list | needed: only `pt_date` and `pt_results` (four entries) changed — permitted | needed: `pt_date` and the one scanned entry |
| 9 clear scratch keys | needed | needed |

Incident coverage: I-1 → step 6 chunking rule; I-2 → step 6 stripping rule; I-3 → step 5 state-check rule; I-4 → step
5/7 state-check rule. Every protocol step maps to an action one of the runs needed. **PASS.**

### V2-BQ — negative read — PASS

Grep of `.claude/skills/browser-integrity-qa/**`: `CHECKPOINT` 0 hits, `phase-start` 0 hits;
`disable-model-invocation: true` present (frontmatter); the closing paragraph "`/browser-integrity-qa` is read-only
verification. … Each requires separate explicit approval." present verbatim; no instruction starts a live request
by itself (every live action is "the approved number", "only when … separately approved", "never initiate").
Diff of the edit: 33 insertions, 9 deletions, hunk-level (no whole-file churn).

## 5.3 `pt-ai-output-change`

### V1-AO — historical replay of R-1 Slice A — PASS

Surface map applied at `57afd9d` to the change "never call the 1Y high ATH", compared with
`git diff 57afd9d 138a681 -- index.html` (34 insertions, 25 deletions):

| Map row | Location reached | Changed at `138a681` |
|---|---|---|
| 2 `buildTechSnapshotBlock` | the block's `ATH Dist:` label → `1Y High Dist:`; the `[setup: …]` header gained `= <display>` | yes |
| 1 `fetchAnthropicAnalysis` gating block | `extended_near_ath` line ("… Price is too extended." → "… near its 1-year high."); `healthy_uptrend_near_ath` line ("Near ATH = no chase." → "Near the 1-year high = no chase."); inserted explanation line `("ath" in these setup names means the 1-year high from 1Y candles — never call it an all-time high.)` | yes (2 lines + 1 inserted) |
| 6 `_dd0FetchAnalysis` | `TECHNICAL SETUP: <enum>` → `TECHNICAL SETUP: <enum> (<display>)` | yes |
| 9 / 10 consumer note for `*_near_ath` | `_srGroupResults` group "Extended / ATH" → "Extended / near 1Y high"; `_tsAssessMap` values "near all-time high" → "near its 1-year high"; `renderMainPanel` row label "ATH Distance" → "1Y High Distance" | yes (display consumers, not AI-facing text) |
| 8 deterministic fields | `computeATHDistance` → `computeHigh1yDistance`, `_techDeriveSnap` `athDist` / `hasATH` → `high1yDist` / `hasHigh1y`, `orchestrate` audit trail | yes — data fields feeding row 2, class A surfaces, not AI text |

Every AI-facing location the diff changed is listed by the map. **Banned-term check** `\bATH\b|all-time` on the
1Y-metric surfaces (block output line, the two gating lines, the Deep Dive line, the three display consumers):
at `57afd9d` hits in `buildTechSnapshotBlock` ("ATH Dist:"), the `healthy_uptrend_near_ath` gating line ("Near
ATH"), `_srGroupResults` ("Extended / ATH"), `_tsAssessMap` ("all-time high" ×2), `renderMainPanel` ("ATH
Distance"); at `138a681` **none** on those surfaces. The only remaining `all-time` in the file at `138a681` is
the inserted prohibition line, which the Skill treats as an exact-string assertion excluded from the scan by its
anchor — the same treatment the landed `qa/high1y_label_offline.js` HL-3 gives it. **PASS.**

### V2-AO — taxonomy fit — PASS (matches the answer key)

Finding texts read read-only from the pilot note; classified with `templates/findings.md` (primary; secondary where
the evidence shows two causes), then compared with the key.

| ID | Observed (exact, from the note) | Primary | Secondary | Reason | Key |
|---|---|---|---|---|---|
| M1 | "downgraded … **today**"; data dates it Sept 30; freshness field `today` | B | C | narrative asserts a date the context contradicts; the parser's freshness field is itself wrong | B+C ✓ |
| M2 | "ATH Distance −9.04%" from the 1Y high $208.90 | A | — | deterministic label names the wrong metric | A ✓ |
| M3 | stop "$175 (below MA50 $123.63 …)" | B | — | narrative arithmetic / direction error | B ✓ |
| M4 | "−57.9% gap to consensus bull case" (= Citi $80 Sell) | B | — | narrative mislabels a figure the context carried | B ✓ |
| M5 | dial "Sell"; action `hold_wait` | A | B | deterministic label parsed from the AI's `Rating:` line | A+B ✓ |
| M6 | self-contradictory invalidation wording | B | — | narrative | B ✓ |
| C1 | "downside to MA150 ($293.38)" with price $271.26 | B | — | level direction vs price | B ✓ |
| C2 | three entry levels; floor = invalidation | B | — | entry / invalidation geometry | B ✓ |
| C3 | "17.7% upside" vs 17.97% | B | — | narrative arithmetic | B ✓ |
| C4 | "Score: Bullish 42, Bearish 58" vs product 45 | B | — | narrative score ≠ product score | B ✓ |
| C5 | "hold only", "exit consideration" for an unheld ticker | D | — | portfolio-awareness | D ✓ |
| C6 | dial "Neutral"; action `avoid`; score 45 | A | B | same dial-label source as M5 | A+B ✓ |
| N1 | "AI response could not be parsed after retry" | B | — | AI response / prompt path, root cause unknown | B ✓ |
| N2 | Technical Setup card "Score 50 / 100"; fallback hard-codes 50 | A | — | deterministic fallback value | A ✓ |
| R1 | "20 > 50 > 150 — Healthy uptrend" with 20 < 150 < 50 | A | — | fixed assessment text claims an unchecked stack | A ✓ |
| R2 | parsed bank "and" → "maintained $500 / $475" | A | — | deterministic parser split | A ✓ |
| R3 | "Goldman cut … to Neutral" (source: PT cut, rating maintained) | B | — | narrative misreads the source line | B ✓ |
| R4 | "rallied … on Q2 FY2026 earnings beat"; "quarter ended June 30" | B | C | months-old cause asserted; the earnings field itself mislabels the quarter | B+C ✓ |
| R5 | entry "$428.11–$425.00" below invalidation MA50 $437.80 | B | — | geometry | B ✓ |
| R6 | "19% upside" vs 19.95% | B | — | arithmetic | B ✓ |
| R7 | dial "Neutral"; action `add_on_pullback`; score 62 | A | B | dial-label source | A+B ✓ |

Counts: A = M2, N2, R1, R2 · B = M3, M4, M6, C1, C2, C3, C4, N1, R3, R5, R6 · B+C = M1, R4 · A+B = M5, C6, R7 ·
D = C5. 21 of 21 match the key. **PASS.**

## 5.4 Dry runs through `/plan` (illustrative `plan.md` excerpts; nothing implemented)

### D1 — R-2 MA stack (`_tsAssessMap` / the stack claim in `renderMainPanel`), `pt-offline-suite`

Sweep at `d9c5a0e`, edit target `renderMainPanel` (`_tsAssessMap.bullish_stack` text and the stack condition):

| Suite | Symbol / pin | Class | What trips it | Tripped? | Covered by the brief? | ASK-tier? |
|---|---|---|---|---|---|---|
| `qa/vis_score_caliper_offline.js` | `PROTECTED_FN_HASHES.renderMainPanel` (CRLF) | a | byte change | yes | must be listed (re-pin + revert proof) | no |
| `qa/ts1_default_exposure_offline.js` | TX-3 `renderMainPanel` (LF) | a | byte change | yes | must be listed | no |
| `qa/tech_snapshot_cache_offline.js` | `NEW_RM_LF`, `NEW_RM_CALIPER_PIN`; TC-11 / TC-13 cross-pin equality | a / e | byte change; pins must equal caliper and TS1 | yes | must be listed | no |
| `qa/tech_snapshot_cache_offline.js` | TC-10 "exactly I7a–I7i changed", "line count = base + 3" | e | any other `renderMainPanel` line change, incl. added lines | yes (trips if R-2 adds lines) | must be listed | no |
| `qa/tech_snapshot_cache_offline.js` (TC-14 `assessMap`), `qa/high1y_label_offline.js` (HL-3) | regex extraction of the `_tsAssessMap` literal shape; HL-3 asserts the `*_near_ath` values say "1-year high" | e | shape change of the map literal; wording of the near-ath values | only if the literal's shape changes; not tripped by a `bullish_stack` text change | must be listed as a constraint | no |
| `qa/analyst_parser_offline.js` | `PIN_MASKED_FILE` | b | any `index.html` edit outside the parser | yes | must be listed | no |
| `qa/run-offline.js` | T6 extraction of `renderMainPanel` + literals (rr-lbl "Score" once, "Tech Score v1", no inline `runTechScoreV1(`) | d / e | literal change | no (R-2 does not touch them) | — | **yes — must stay untouched** |
| `qa/deep_dive_v0_offline.js`, `qa/ui_hygiene_offline.js` | `renderMainPanel` extractions (markup conditional; UH-6 / UH-7) | d | signature / brace / `rsCls` / `setItem` | no | — | no |

Outcome: every row marked "must be listed" that the R-2 brief does not list → `/plan` stops with this table as
STOP-1 material (`AGENTS.md`); otherwise it writes the table, the requirement → assertion map and the re-pin ledger
(four pins, two EOL forms) into `plan.md` and proceeds.

### D2 — R-7 NVDA parse investigation (one approved DEV scan), `browser-integrity-qa`

`plan.md` excerpt: scenario steps = protocol 1–9 with the selection reduced to NVDA only; permitted `pt_*` changes
= `pt_date` and the NVDA entry of `pt_results`; evidence fields = `_pplxDebug.NVDA` (raw response, formatted news
context, parser fields) and the parse-failure evidence, extracted in ≤ 950-character chunks with URLs and query
strings stripped; restore checklist = selection restored to the full list, active ticker restored, scratch keys
cleared, re-hash shows only the two permitted changes. The live step is marked **"the Owner or COWORK triggers
`/browser-integrity-qa` after approval"**; the Worker performs no live action. If the raw failure cannot be captured
from the existing debug evidence, the task STOPs for a separate debug brief rather than adding instrumentation.

### D3 — R-5 Pulse vs Analyst (Owner ruling D5: dial = Pulse only; analyst rating as "Analyst view"; prompt `Rating:` unchanged), `pt-ai-output-change` + `pt-offline-suite`

Surface map at `d9c5a0e` (names verified by Grep): every `RATING_SUMMARY_RE` consumer — `_srGroupResults`,
`_srRenderGrouped`, `openScanResultsOverlay`, `renderMainPanel` (the dial), `_renderPortfolioPanel`; the other
`Rating:` uses in `renderMainPanel` — the section-terminator alternative in the tag extractor regex and the
Actionable Take strip (`.replace(/Rating:.*$/s, '')`); the scan prompt's `Rating:` instruction lines in
`fetchAnthropicAnalysis` (`Summary MUST end: "Rating: …"` and `End: "Rating: …"`) — reached, listed as
unchanged per D5. Consumer-impact note: the Daily Review (`_renderPortfolioPanel`) and the Scan Results grouping
and rows (`_srGroupResults`, `_srRenderGrouped`, `openScanResultsOverlay`) read the same regex; relabelling the
dial without them is label drift. Wording assertions per the ruling: the dial shows Pulse's own label; the analyst
rating appears as "Analyst view"; the prompt lines are byte-equal to the baseline. Coupling sweep adds the caliper
`_srGroupResults` and `_srRenderGrouped` pins, the tech-snapshot `BASE_CALIPER_PINS` cross-pins and the
`scan_results_enrichment` `FNS` list to the D1 set. Anything the R-5 brief does not cover → stop. The DEV visual
check is handed to `browser-integrity-qa` at the brief's approved step.

## 6. Governance-duplication search — PASS (references only)

Grep over the 10 Skill files for the brief's pattern list (`pt-land.js`, `printf`, `pt-brief-approval`,
`pt-land-approval`, `pt-push-approval`, `git commit|push|merge|rebase|reset`, `R11`, `R12`, `r9`, `R3g`, `R3m`,
`STOP-[1-6]`, `Mode: Auto|Manual`, `DENY`, `ASK`, `land-scope`, the six palette values, `Netlify`, `deploy`,
`CHECKPOINT`, plus `phase-start`, `curl`, `http`, `approval`):

| File | Hits | Classification |
|---|---|---|
| `pt-offline-suite/SKILL.md` | "STOP conditions, approvals) lives in `AGENTS.md`"; "ASK-tier (see `AGENTS.md`)" ×3; "STOP-1 material (`AGENTS.md`)" ×2; "ASK- or DENY-tier file (see `AGENTS.md`)" ×2 | references |
| `pt-offline-suite/references/coupling-classes.md` | "STOP-1 material (`AGENTS.md`)"; "ASK-tier file (`AGENTS.md`)"; "ASK-tier" ×3 (flags) | references |
| `pt-offline-suite/templates/plan-sections.md` | "ASK-tier?" column; "STOP-1 material per AGENTS.md" | references |
| `pt-offline-suite/references/suite-patterns.md` | none | — |
| `browser-integrity-qa/SKILL.md` | "deployed commit" ×2 (an observation field); "approved Netlify/environment inspection", "Do not infer Netlify … values" (kept R6 evidence rules); the kept closing paragraph ("does not authorize … Netlify environment-variable changes; deploys … Each requires separate explicit approval") | references / kept boundary, no rule restated |
| `browser-integrity-qa/references/live-scan-protocol.md`, `templates/report.md` | none | — |
| `pt-ai-output-change/SKILL.md` | "STOP-1 material (`AGENTS.md`)" ×2; "with approval" | references |
| `pt-ai-output-change/references/ai-surfaces.md`, `templates/findings.md` | none | — |

Zero hits for `pt-land.js`, `printf`, the approval-record names, any `git` verb, `R11`, `R12`, `r9`, `R3g`, `R3m`,
`Mode:`, `land-scope`, the palette values, `CHECKPOINT`, `phase-start`, `curl`, `http`. No STOP definition, tier
table, command sequence or value restated. Line-number scan (`:[0-9]{3,}`, `line N`) over the 10 files: 0 hits.

## Self-review (fresh read of brief and diff, step 7)

Re-read brief §1–§6 and the full diff (tracked edit + nine untracked files) against the requirement → evidence map
in `plan.md`. Changes made as a result: the banned-term rule in `pt-ai-output-change` §3 and `ai-surfaces.md` row 1
gained the prohibition-line clause (prompted by V1-AO: the inserted explanation line names the banned term in order
to forbid it, and the landed HL-3 check excludes it by exact anchor). No other change.

## Codex ledger

Implementation-diff review (step 8): `codex exec --sandbox read-only`, prompt on stdin, raw output verbatim in
`work/pt-skills-v1/codex.md` (untracked). Verdict: FINDINGS 1 class I, 0 class II.

| ID | Class | Severity | Finding | Decision | Resolution |
|---|---|---|---|---|---|
| I-1 | I | medium | `live-scan-protocol.md` step 8 re-hashes only `pt_*` keys while the baseline captures the full `localStorage` key inventory and the always-required checks promise "no unexpected `localStorage` writes or new keys"; a new non-`pt_*` key could go undetected | **FIX** | protocol step 1 now records the complete key inventory; step 8 compares it with the baseline and lists every added or removed key of any prefix as permitted / not; `SKILL.md` step 9 says the same. Files: `browser-integrity-qa/references/live-scan-protocol.md`, `browser-integrity-qa/SKILL.md` (both in scope). No targeted QA exists for a documentation file; V2-BQ re-read after the fix: unchanged result |

DEFER: none. REJECT: none.

Final check (step 12) on the task diff, raw output appended to `codex.md` under "Final check": FINDINGS 1 class I,
0 class II. Then the one scoped re-pass the step allows, on the fixed hunks only: FINDINGS 1 class I (new), 0 class II.

| ID | Round | Class | Severity | Finding | Decision | Resolution |
|---|---|---|---|---|---|---|
| I-1 (final) | final check | I | medium | the fix above compared the key inventory but hashed only `pt_*` values; a changed value under an existing non-`pt_*` key would go undetected and the report could not record it | **FIX** | protocol steps 1 and 8, `SKILL.md` steps 2 and 9 and the report table now hash and compare every `localStorage` key (values never printed) and list every changed, added or removed key of any prefix. No suite reads these files (no relevant QA to re-run); the scoped re-pass below is the required Codex re-pass |
| I-1R (re-pass) | scoped re-pass | I | medium | the fix is verified as resolving I-1, values stay unprinted and R2 is respected; new point: the "session scratch keys" of step 1 are not stated to live outside `localStorage`, so a reader could place them in `localStorage` where they would appear as additions in the step-8 comparison | **FIX (Owner-ruled)** | Surfaced unresolved at the step-13 STOP per AGENTS.md step 12 (no third Codex round). Owner ruling 2026-10-08: apply the one-line clarification. Applied in `live-scan-protocol.md` step 1 and `SKILL.md` step 2: "`sessionStorage` scratch keys (outside `localStorage`, so never part of the comparison)". No suite reads these files; no further Codex round (Owner-ruled) |

Final check: 1 round + 1 scoped re-pass, 2 class-I findings — 2 FIX (one by Owner ruling at the step-13 STOP), 0 DEFER, 0 REJECT, 0 unresolved; QA/re-pass performed where required; no class-II findings.

## Full `qa:offline` (step 10)

One run, at the end, after Main Control released the heavy lane (Worker B's post-resync full run complete; no
overlap). Task branch `task/pt-skills-v1` at base `e5378aa` with the 10 Skill files in the working tree.
Result: **`OFFLINE VALIDATION: PASS` — 63 spawned suites, 14 phases, 0 failures, 788,280 ms** (13.1 min). One
advisory warning, non-failing and pre-existing: "index.html has 1 smart quote char(s) inside script blocks at
line(s): 10652" — the same advisory the Stage 2 run recorded; unrelated to this task. Count unchanged from the §0.2 baseline (63), as the brief expects: no `qa/` file
added or changed. Raw output appended to `work/pt-skills-v1/qa.log`.

**Second-LAND note (evidence, not a change):** while this task ran, `branch-dev` moved from `e5378aa` to `32c4388`
(Worker B's `task/r1b-ath-store-seed`, fast-forwarded 2026-10-08 00:48 local). That commit touches none of this
task's 11 paths, `qa/run-offline.js` or the instruction-layer pins, so the coupling sweep and this result stand for
the task's base; it adds five discovered suites, so a post-resync full run will count **68**, not 63. The Owner
decides the re-sync (AGENTS.md Second LAND) and the count re-pin; the post-resync QA and integrity results are LAND
evidence and are not recorded here.

## Backlog reconciliation

Brief Backlog row: **none** (workflow tooling, Track 6). Action taken: none — no `BACKLOG.md` edit. No entry heading
changes. The BACKLOG text is unchanged and consistent with the diff, the QA results and the work being landed.

## Boundaries confirmed

- Exactly the 10 `land-scope` files plus this file; no `qa/**`, product, `BACKLOG.md`, `AGENTS.md`, `CLAUDE.md`,
  `.claude/rules/**`, `.claude/hooks/**`, `.claude/settings*` or other Skill touched (`git status`).
- Coupling sweep of the 10 Skill paths at `d9c5a0e`: only `qa/instruction_layer_offline.js` reads `.claude/skills/**`
  among executed suites (two untouched legacy pins); every suite that walks the skills tree is denylisted; no `qa/`
  file added → count stays 63 by construction.
- `browser-integrity-qa` keeps `disable-model-invocation: true` and its read-only boundary; the two new Skills are
  model-invocable with narrow "use when the approved brief lists …" descriptions.
- No Skill instruction commits, pushes, writes an approval record, calls the network or starts a live request.

## Lessons

- [local]    Three guard denials in this slot, all on read-only commands: R12 on a `find -name` naming the land tool's file (pre-GO), R10-E on a heavily quoted `grep -nE` one-liner, R2 on the PowerShell tool (denied in Worker slots). None was retried or rephrased; the Grep / Read tools and the attended Owner replace them. Surfaced at the step-13 report for the Owner's STOP-6 reading.
- [local]    `grep -c $'\r'` reports every line as CRLF on this host even for pure-LF files; `tr -cd '\r' | wc -c` gives the true count. The Write tool writes LF; the index is LF for every Skill file (autocrlf shows CRLF only on checkout), so the edited `SKILL.md` diff is hunk-level.
- [local]    No separate record exists for the 2026-10-05 R-4a post-push DEV check; the brief's §5.2 description served as the V1-BQ input, with the 2026-10-03 pilot note's "DEV state" section as the recorded evidence.
- [covered]  `.claude/skills/**` is ordinary for the guard and the tiers, but protected for the LAND tool's path set — brief §0.8 (Owner LAND).
- [covered]  A banned-term scan must exclude the prohibition line by exact anchor, never by loosening the regex — already the landed practice in `qa/high1y_label_offline.js` HL-3; now written into `pt-ai-output-change`.

## Final check

Final lightweight Codex check run on the complete task diff (implementation diff against `d9c5a0e` with every
untracked in-scope file, plus `brief.md` and this file). One class-I finding (I-1 final) → FIX applied; the one
scoped re-pass verified the fix and surfaced I-1R, held unresolved at the step-13 STOP without committing
(AGENTS.md step 12) and then FIXED by Owner ruling (the one-line `sessionStorage` clarification). Raw outputs in
`codex.md` under "Final check".
Final check: 1 round + 1 scoped re-pass, 2 class-I findings — 2 FIX (one by Owner ruling at the step-13 STOP),
0 DEFER, 0 REJECT, 0 unresolved; QA/re-pass performed where required; no class-II findings.

LAND-EVIDENCE: qa-offline=PASS 63; targeted=n/a (brief lists none); codex-classI-unresolved=0
