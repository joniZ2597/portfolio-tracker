# Brief: holdings-quantity-1 — a quantity (shares / units) on every holding (slice 1A of the portfolio data foundation)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below. DRAFT by the Planner (2026-10-22) for MAIN's review; not approved, not committed, not staged. Order of events: the Owner's R11 brief approval and the brief-only commit (Bootstrap / MAIN steps, AGENTS.md "task folder" section) come first; the Worker starts only after that commit exists, so the Worker steps in §4 begin at step 0 and contain no brief-request. Owner rulings applied (MAIN relay, 2026-10-21): proposal `holdings-quantity-1/proposal.md` (sha256 `0680410a…8292`) Q-1…Q-9 approved: two tasks (this is 1A; the baseline record and backup v5 are 1B `holdings-baseline-1`); quantity rejected at entry when ≤ 0; quantity excluded from the `baselineAt` rule; implied price shown muted; no Needs Attention item; quantity not in the EOD / P-5 packets. Implementation order: `scan-action-gate-1` → **this task** → `portfolio-freshness-1` → 1B → valuation / P&L → recording changes → Portfolio Attention.

**What the Owner sees afterwards:** each holding can carry a **quantity** (shares or units, fractions allowed) that appears on its card together with a derived average cost per unit and an implied price, and the Portfolio shows a "Quantity Coverage n / m" count; totals, P/L and everything else on screen are unchanged.

| | |
|---|---|
| Problem | `positionSize` is a hand-typed *recorded value*, so no market value, daily move or position record can be derived from prices. There is no quantity field anywhere (`PF_KNOWN_HOLDING_FIELDS`, `index.html:10275`) |
| Objective | `pt_holdings` entries may carry an optional `quantity` (finite number, 0 < q ≤ 1e12). It is kept by the normalizer, entered and edited in the Add / Edit forms, shown on the holding card with two derived lines, and counted in a coverage stat. Nothing is inferred, defaulted or computed from other fields: a holding without a quantity stays without one |
| Not in this task | the baseline record, "Baseline as of …", the unconfirmed-draft rule and backup `schemaVersion` 5 (all 1B); price × quantity valuation, daily P/L (later); the day-estimate freshness fix (`portfolio-freshness-1`); Needs Attention items; EOD / P-5 packet fields; cloud sync; any scoring, scan or network change |
| Backup | **no schema change.** The export writes `pt_holdings` as stored, so `quantity` travels inside each holding in a v4 file; the importer reads it through the same normalizer. An older build restoring such a file preserves it as an unknown ("legacy") field and shows its existing amber legacy-field note |
| Backlog | none (`backlog-refresh-1` records this later). `BACKLOG.md` is not edited |
| Baseline (§TS) | `branch-dev` tip T at task-start, **after `scan-action-gate-1` has landed and been pushed**. Planner read 2026-10-22 at `9cacba8` (before that landing); every value that the landing can change is therefore checked by rule, not fixed |
| Branch / slot / mode | `task/holdings-quantity-1` · first free slot · **Manual**, attended (money-relevant data model) |
| qa:offline | step-0 count `<N>` recorded at T (103 at `9cacba8`; 104 expected after `scan-action-gate-1`), **+1** (`qa/holdings_quantity_offline.js`, auto-discovered; the runner stays unedited) |
| Parallel with | not with any task touching `index.html`, `qa/fixtures/index-pins.json`, `qa/evidence_capture_offline.js` or `qa/labs_panel_offline.js`. `cp10-decouple-1` runs in another lane but also edits `qa/evidence_capture_offline.js`: if it has **not** landed, this task re-pins the CP-10 constant (option A, §2); if it **has** landed, §2 R-2 does not apply (TS-5). One heavy run at a time |
| Scoring boundary | none touched: `orchestrate`, `analyzeChunk`, `enforceScoreConsistency`, scan flow, persistence of scan results, prompts. No network call, no new flag, no env |
| Gate verification | N/A: no client or server gate is involved; the feature is a stored field plus display. (The research and live-price gates are untouched) |
| Skills | `pt-offline-suite` — Recommended |

## §TS Task-start baseline checks (Bootstrap, read-only, at the task-start tip T)

| # | Check (all must hold; else STOP and return to MAIN) | Value |
|---|---|---|
| TS-0 | `scan-action-gate-1` is LANDED and pushed; `branch-dev` = `origin/branch-dev` = T | `git log --oneline` shows its task commit |
| TS-1 | the exact anchor **texts** of §2 each occur exactly once in `index.html` (checked by text, not by line; lines are informational) | matched at `9cacba8` (lines in §2) |
| TS-2 | the text `quantity` as a holding field does not occur in `index.html` outside this task's edits: Grep `quantity` in `index.html` returns only insider-trading text (`shares` in the EDGAR panel) and no portfolio hit; no file under `qa/` mentions `quantity` | none at `9cacba8` |
| TS-3 | `qa/labs_panel_offline.js`: `BASE_PINS._renderPortfolioPanel` and `BASE_PINS._calcPortfolioAggregates` and `node qa/labs_panel_offline.js` PASS at T (LB-8 green) | `08286eba…78cf` and `8e480394…4b` at `9cacba8`; record the values read at T. If `scan-action-gate-1` changed either, they were re-pinned by it: use the value at T as the "old" value in §2 |
| TS-4 | pin map at T: record `functions._renderPortfolioPanel`, `_pfNormalizeHoldingEntry`, `saveAddPosition`, `saveEditPosition`, `openAddPositionModal`, `openEditPositionModal`, `_calcPortfolioAggregates` digests (informational; `--diff` at the end must list exactly these functions changed except `_calcPortfolioAggregates`, which must be **unchanged**) | `d328958f…` · `cba642f4…` · `c56d654f…` · … at `9cacba8` |
| TS-5 | `qa/evidence_capture_offline.js`: if `const BASE_INDEX_SHA =` exists, record its value as `<OLD_CP10>` and require `node qa/evidence_capture_offline.js` GREEN (CP-10 passes) at T; if the constant no longer exists (`cp10-decouple-1` landed), §2 R-2 is **skipped** and the suite's CP-14 is expected instead | constant present at `9cacba8` (`73a40426…6000`; changed by `scan-action-gate-1`) |
| TS-6 | the capture region, its call lines and `#ehBox` each occur exactly once in `index.html` | yes (suite GREEN) |
| TS-7 | `qa/holdings_quantity_offline.js` and `work/holdings-quantity-1/` (other than this brief) are absent | absent |
| TS-8 | `qa/market_structure_offline.js` has its `indexScanText` markers (MS-T16) | present |
| TS-9 | step-0 `qa:offline` count `<N>` and result recorded | PASS expected |

## §1 Files (exactly)

- `index.html` — the §2 edits only
- `qa/fixtures/index-pins.json` — only by `node qa/tools/index-pins.js --update`
- `qa/labs_panel_offline.js` — **one constant**: `BASE_PINS._renderPortfolioPanel` (§2 R-1)
- `qa/evidence_capture_offline.js` — **only if TS-5 shows the constant**: the `BASE_INDEX_SHA` line (§2 R-2)
- `qa/holdings_quantity_offline.js` (new)
- `work/holdings-quantity-1/review.md`

The task folder's untracked working artifacts (`plan.md`, `qa.log`, `codex.md`, the ignored raw outputs of AGENTS.md "task folder") are not part of the committed file set and are not committed.

**Forbidden:** `qa/run-offline.js`, `qa/asset_choice_offline.js` (the backup version is not touched in 1A), every other `qa/**`, `services/**`, `netlify/**` file, `package*.json`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `BACKLOG.md`, `work/**` other than this task's `review.md`. In `index.html`: no change to `_calcPortfolioAggregates`, `_pfComputeBaselineAt`, `_pfHoldingPl`, `_pfComputePortfolioPl`, `_pfComputePortfolioReporting`, `_pfComputeNeedsAttention`, the packet builders (`_p5PreloadContext`, `_eodBuildPacket` and their projections), `exportPortfolioBackup`, `_validatePortfolioBackup`, `importPortfolioBackup`, anything cloud-sync, and no new `.TA` regular expression (the pattern count of 3 is asserted).

## §EOL

`index.html` and the suites are `i/lf w/crlf` in the working tree. Use the Edit / Write tools directly (no scripted rewrite, no escape sequences through a shell heredoc into a template literal). After the edits, `git ls-files --eol index.html qa/labs_panel_offline.js qa/evidence_capture_offline.js` must still read `i/lf w/crlf` (never `w/mixed` or `w/lf`); the new suite and `review.md` read `i/lf` (a `w/crlf` rendering after staging is fine). The new suite reads `index.html` through `core.normalizeText` (CRLF → LF), like the neighbouring suites.

## §1a Consumer sweep

| Reader | Effect | Assertion |
|---|---|---|
| `qa/labs_panel_offline.js` LB-8 (`:212-222`) | pins `_renderPortfolioPanel` (after reverting Slice 2's one line) and `_calcPortfolioAggregates` byte-for-byte | `_renderPortfolioPanel` changes here → **re-pin one constant** (§2 R-1); `_calcPortfolioAggregates` is untouched → its pin stays |
| `qa/evidence_capture_offline.js` CP-10 | whole-file `index.html` hash outside the capture insertions | **re-pin the constant** unless `cp10-decouple-1` has landed (§2 R-2, TS-5) |
| `qa/index_pins_offline.js`, `qa/fixtures/index-pins.json` | per-function and region digests | regenerated by `--update`; `--diff <T>` lists only the §2 functions |
| `qa/no_synthetic_score_offline.js` (ISOLATION list includes `_renderPortfolioPanel`) | compares with the live pin map | survives after `--update` |
| `qa/pulse_analyst_view_offline.js` PA-4 | counts the analyst-chip strings inside `_renderPortfolioPanel` | survives (those lines are not edited) |
| `qa/dh_ui_vocabulary_offline.js` AG-5 etc. | exact chip / qualifier text in `_renderPortfolioPanel` and other functions | survives (not edited) |
| `qa/run-offline.js` (portfolio factories: `_pfNormalizeHoldingEntry`, `PF_KNOWN_HOLDING_FIELDS`, `_validatePortfolioBackup`, `_pfComputeBaselineAt`, `_calcPortfolioAggregates`, `.TA` pattern count 3) | extracts these functions standalone with a fixed dependency list | survives: the normalizer gains no new function call (it already uses `_pfIsFiniteNum`); `_validatePortfolioBackup`, `_pfComputeBaselineAt`, `_calcPortfolioAggregates` and the `.TA` pattern are untouched; `schemaVersion` 5 stays rejected |
| `qa/asset_choice_offline.js` | extracts the validator and normalizer; asserts "schemaVersion 4 is the accepted ceiling" | survives (no version change) |
| `qa/eod_packet_v0_offline.js`, `qa/p5_*_offline.js` | load `_pfNormalizeHoldingEntry`, `PF_KNOWN_HOLDING_FIELDS`, the packet builders; assert the holding projection keys (`HOLDING_PROJECTION_KEYS`) | survive; `quantity` is **not** added to any projection (HQ-8) |
| `qa/tase_units_offline.js`, `qa/market_structure_offline.js` | token / text scans of `index.html` | survive; new text must not contain `market-structure` or `analyzeMarketStructure` |
| Export / import of a backup containing `quantity` | stored as-is / normalized on read | HQ-7 |

## §2 Contract (normative; quoted text is exact; anchors by text, lines informational at `9cacba8`)

**Entry rule.** `quantity` is valid iff it is a finite number with `0 < q ≤ 1e12`. Blank = unset. The Owner can enter fractions. Units are those the broker reports (shares or units); a `.TA` holding's quantity is units of the security, never agorot; value and cost stay in the holding's native currency exactly as today. No function in this task divides or multiplies `positionSize`, `costBasis` or `costBasisILS` by 100.

| # | Edit | Anchor (exact text) and change |
|---|---|---|
| E-1 | known field | `var PF_KNOWN_HOLDING_FIELDS = ['symbol', 'positionSize', 'manualPlPct', 'currency', 'source', 'updatedAt', 'baselineAt', 'costBasis', 'costBasisILS'];` (:10275) → the same array with `'quantity'` appended after `'costBasisILS'` |
| E-2 | normalizer | immediately after the block that starts `  if (src.costBasisILS !== undefined && src.costBasisILS !== null) {` (:10410) insert a block of the same shape: when `src.quantity` is neither `undefined` nor `null`, a finite number (`_pfIsFiniteNum`) is kept as `entry.quantity`; otherwise `issues.push({ field: 'quantity', raw: src.quantity })`. **Type check only; no sign or range check and no new function call inside the normalizer** (it is extracted standalone by other suites) |
| E-3 | helpers | three new top-level pure functions placed directly after `_pfEffectiveCostIls`: `_pfQuantityValid(q)` (true iff finite number, `0 < q ≤ 1e12`); `_pfQuantityText(q)` (`Number(q).toLocaleString('en-US', { maximumFractionDigits: 6 })`, so `12.5` → `12.5`, `1000` → `1,000`, `0.1234567` → `0.123457`); `_pfQuantityCoverage(holdings)` → `{ covered, total }` with `total` = number of holdings (all keys) and `covered` = non-corrupt holdings whose `quantity` passes `_pfQuantityValid`. Pure: no DOM, no storage, no clock |
| E-4 | Add form | after the line `  body.appendChild(_apField('Recorded position value',          'apInvested', 'e.g. 5000'));` (:13190) insert `  body.appendChild(_apField('Quantity (units / shares, optional)', 'apQuantity', 'e.g. 12.5 — units as your broker reports; TASE: units, not agorot'));` |
| E-5 | Edit form | after the line `  body.appendChild(_epField('Recorded position value',          'apEditInvested', 'e.g. 5000',         h.positionSize));` (:13486) insert `  body.appendChild(_epField('Quantity (units / shares, optional)', 'apEditQuantity', 'e.g. 12.5 — units as your broker reports; TASE: units, not agorot', h.quantity));` |
| E-6 | flagged-field repair | `      var _epEditableIssueFields = { manualPlPct: true, currency: true, costBasis: true, costBasisILS: true };` (:13470) → add `quantity: true` |
| E-7 | save (Add and Edit, two places each) | in `saveAddPosition` and in `saveEditPosition`: read the new input (`apQuantity` / `apEditQuantity`) next to the other optional inputs, with the same "blank = unset, present-and-invalid = reject" pattern; the value is `Number(raw.trim())` (not `parseFloat`); not `_pfQuantityValid` → `warnEl.textContent = 'Quantity must be a number greater than 0, or leave blank.';` focus the input and return. After `if (costBasisILS !== undefined) entry.costBasisILS = costBasisILS;` (two occurrences: :13381 and :13639) add `  if (quantity !== undefined) entry.quantity = quantity;`. **The `_pfComputeBaselineAt(...)` calls keep their exact arguments** (quantity does not move `baselineAt`). Clearing the field on an existing holding removes its quantity (as for the other optional fields); an untouched prefilled field keeps it |
| E-8 | card lines | immediately after `      card.appendChild(meta);` (:11973), inside the non-corrupt branch, add one block: (1) a `div.pf-pos-meta` with text `Quantity ` + `_pfQuantityText(h.quantity)` when `_pfQuantityValid(h.quantity)`; muted `Quantity — not recorded` when `h.quantity` is undefined or null; amber (`var(--yellow2)`) `Quantity — invalid (must be greater than 0)` when a quantity is present but not valid. (2) Only when the quantity is valid **and** `_currencyKnown` is true: a muted line `Avg cost per unit (derived) ` + `_pfFmtCurrencyValue(costBasis / quantity, h.currency)` when `costBasis` is a finite number > 0 (tooltip `recorded cost ÷ quantity`), and a muted line `Implied price at record (derived) ` + `_pfFmtCurrencyValue(positionSize / quantity, h.currency)` (tooltip `recorded value ÷ quantity`). Muted = `style.color = 'var(--text3)'`. No line is shown for a corrupt card or an unknown currency. The whole inserted block is wrapped in the two comment lines `      // holdings-quantity-1 (card) begin` and `      // holdings-quantity-1 (card) end`, which the suite uses to scope its text checks (HQ-5, N12) |
| E-9 | coverage stat | after `    covRow.appendChild(_mkCovStat('Manual P/L Coverage', agg.manualPl.covered, agg.manualPl.total));` (:11833) add `    var _qCov = _pfQuantityCoverage(holdings);` and `    covRow.appendChild(_mkCovStat('Quantity Coverage', _qCov.covered, _qCov.total));` |
| E-10 | guidance | immediately before `    if (guidanceText !== null) {` (:11867) add: when `guidanceText === null` and `_qCov.covered < _qCov.total`, set `guidanceText = 'Quantity not entered for ' + n + ' holding' + (n === 1 ? '' : 's');` with `n = _qCov.total - _qCov.covered` (existing guidance cases keep priority) |

**Re-pins (the only allowed changes to existing suites):**
- **R-1 `qa/labs_panel_offline.js`:** `BASE_PINS._renderPortfolioPanel` (value `08286eba…78cf` at `9cacba8`, or the value TS-3 recorded at T) → the sha256 of the LF text of `_renderPortfolioPanel` after the suite's own `S2_AFTER → S2_BEFORE` replacement, computed with the suite's own method (`core.extractFunctions`, replace, `core.sha256`). `_calcPortfolioAggregates`, `renderMainPanel`, `renderApiTable`, `init` pins stay. Proof (scratch script, §PEP): the task's `index.html` with only the §2 lines of E-8, E-9, E-10 reverted hashes to the **old** pin; unreverted it hashes to the **new** pin. RED first: after the `index.html` edit and before the re-pin, `node qa/labs_panel_offline.js` fails on LB-8 only; record it.
- **R-2 `qa/evidence_capture_offline.js`** (only if TS-5 shows the constant): `BASE_INDEX_SHA` (the `const BASE_INDEX_SHA =` line) → the value the suite prints on its CP-10 failure (`index.html differs from the base outside the three insertions: <sha>`), proved in the same script both ways (the task's lines reverted → `<OLD_CP10>`; unreverted → the new value). RED first: CP-10 alone fails before the re-pin. Only that line changes (a trailing comment `// holdings-quantity-1` is allowed).

## §3 QA — new suite `qa/holdings_quantity_offline.js` (written first; RED recorded)

Pure Node; the real functions are extracted from `index.html` (`core.extractFunctions`); DOM, `localStorage` and `fetch` are stubs/spies. Counts are derived (`rows.length`), not hard-coded.

| Row | Checks |
|---|---|
| HQ-1 normalizer | `quantity` values 12, 0.5, 1e-6, 1e12 kept; `'12'`, `true`, `{}` → `_issues` entry `{ field: 'quantity' }` and no `entry.quantity`; `null`/absent → absent; `0`, `-3` and `1e13` are type-valid and **kept** by the normalizer (range is the consumers' job); an unknown legacy key still lands in `_legacyFields` and `quantity` does not; round trip through `_pfSerializeHoldingForStorage` keeps the stored form |
| HQ-2 helpers | `_pfQuantityValid` table (0, negative, NaN, Infinity, string, 1e12 true, 1e12+1 false); `_pfQuantityText` examples of E-3; `_pfQuantityCoverage` counts valid only, excludes corrupt, `total` = all keys |
| HQ-3 Add / Edit save | blank → no `quantity` key written; `12.5` saved; `0`, `-1`, `abc`, `1e13` rejected with the exact message and nothing written; Edit prefills the stored value; Edit with the field untouched keeps it; Edit blank removes it; an edit of another field keeps the quantity; a duplicate Add overwrites like the other fields; a flagged `quantity` is shown blank in Edit and a valid entry repairs it; **no quantity is ever created for a holding whose field is blank** |
| HQ-4 `baselineAt` | a quantity-only change leaves `baselineAt` equal; a value / cost change still advances it (the existing `_pfComputeBaselineAt` behaviour) |
| HQ-5 card | the three states of E-8 with exact strings; derived lines only for a valid quantity and known currency; derived numbers: value 5000 / quantity 12.5 → 400; cost 4000 / 12.5 → 320; no derived line for an unknown currency, a corrupt card, or an invalid quantity; a `.TA` holding with quantity 100 and value ₪5000 renders `Quantity 100`, avg cost / implied price computed as plain ratios (5000 ÷ 100 = ₪50.00, no scaling); and **within the new code only** (the sources of `_pfQuantityValid`, `_pfQuantityText`, `_pfQuantityCoverage` and the text between the two `holdings-quantity-1 (card)` marker comments) neither `/ 100` nor `* 100` occurs (the rest of `index.html` legitimately uses percentages) |
| HQ-6 coverage and guidance | `Quantity Coverage n / m` text; guidance sentence exact; existing guidance cases keep priority; `_calcPortfolioAggregates` source is byte-identical to its pin |
| HQ-7 backup | `exportPortfolioBackup` output for holdings with `quantity` contains it; `_validatePortfolioBackup` on a v4 doc with `quantity` returns it; on a v4 doc without it returns none; `schemaVersion` 5 is still rejected |
| HQ-8 packets | the EOD packet and the P-5 research context for a holding with a quantity are byte-identical to those for the same holding without it |
| HQ-9 no side effects | a `fetch` spy sees zero calls through every flow; the only storage write on save is `pt_holdings` |
| HQ-10 wording and tokens | exact strings of E-4, E-5, E-7, E-8, E-10; the new text contains no `market-structure` / `analyzeMarketStructure` |
| HQ-11 EOL | the suite loads `index.html` through `core.normalizeText`; a CRLF rendering produces identical rows; every negative's anchor occurs exactly once |

**Planted negatives (HQ-N1 …)** — each mutates the production text of `index.html` in memory; its named rows must fail, with a positive control:

| # | Mutation | Must fail |
|---|---|---|
| N1 | blank quantity defaults to 1 | HQ-3 |
| N2 | quantity inferred from `positionSize` when blank | HQ-3, HQ-5 |
| N3 | `quantity` passed into the `_pfComputeBaselineAt` call | HQ-4 |
| N4 | `0` accepted at save | HQ-3 |
| N5 | normalizer keeps a string quantity | HQ-1 |
| N6 | derived lines shown for an invalid quantity | HQ-5 |
| N7 | derived lines shown for an unknown currency | HQ-5 |
| N8 | coverage counts invalid / corrupt | HQ-2, HQ-6 |
| N9 | `quantity` added to the EOD / P-5 holding projection | HQ-8 |
| N10 | Edit blank keeps the old quantity | HQ-3 |
| N11 | invalid quantity rendered as "not recorded" | HQ-5 |
| N12 | a `/ 100` applied to the quantity inside the marked card block | HQ-5 |
| N13 | CRLF text fed without the line-ending helper (control for HQ-11) | HQ-11 |

**RED / GREEN:** (S1) the suite fails on the base (no field, no helpers, anchors missing); (S2) after §2 E-1…E-10 all rows and negatives pass; then the re-pins with their RED-first steps.

## §RT Risk and test design

| Requirement | Failure mode | Test | Expected |
|---|---|---|---|
| Missing stays missing | a quantity appears without the Owner entering it | HQ-3, N1, N2 | none created |
| Range / type | 0, negative, text, huge numbers accepted | HQ-1, HQ-3, N4, N5 | rejected at entry, flagged at read |
| Units | `.TA` quantity treated as agorot / value | HQ-5, N12 | never scaled |
| `baselineAt` | quantity edits flip the reconciliation to stale | HQ-4, N3 | unchanged |
| Derived lines | shown from invalid or unit-less data | HQ-5, N6, N7 | suppressed |
| Privacy | quantity reaches AI or packets | HQ-8, N9 | byte-identical packets |
| Back-compat | older / v4 backups | HQ-7 | restore with quantity missing; v5 still rejected |
| Existing pins | silent edit of a pinned function | R-1, `--diff`, TS-4 | only §2 functions differ; `_calcPortfolioAggregates` unchanged |

**Accepted limits:** a stored holding written by another build with a numeric legacy `quantity` is adopted as the quantity (I found no writer in this repo); the Owner sees it in the Edit form. No unit-price sanity check against live prices (later steps).

## §4 Steps

| Step | Action |
|---|---|
| 0 | §TS; the process check (Bash `wmic process where "name='node.exe'" get ProcessId,CommandLine`, never PowerShell in a slot; one line in `qa.log` before each heavy run, here and at step 10) → step-0 `qa:offline` (record `<N>`; PASS expected; a failure is recorded and reported to MAIN); `plan.md` with (a) the requirement → test map (§2 E-1…E-10, R-1, R-2 ↔ HQ rows and negatives, no orphan), (b) conventions **followed** (`costBasis` pattern for the field, normalizer issue shape, `_pfFmtCurrencyValue`, the `pf-pos-meta` and `_mkCovStat` styles, the suite's `row()` / `NEG` mechanics from `qa/evidence_capture_offline.js` and `qa/labs_panel_offline.js`) and **overridden** (quantity is stricter than `costBasis` at entry — `> 0` and `≤ 1e12` are rejected, not tolerated and suppressed — Owner ruling Q-8), (c) the four CLAUDE.md items (Pattern Auditing: the `costBasis` / `costBasisILS` path through normalizer, forms and saves; State & Boundary Isolation: `pt_holdings` only, no other key, no network, no scoring; Gate Verification N/A; Definition of Done = §5) |
| S1 RED | write `qa/holdings_quantity_offline.js` from §2 / §3 first; it fails on the base; record the output |
| S2 GREEN | apply E-1…E-10; the suite passes (rows and negatives) |
| 2 | byte audit (`git ls-files --eol`); targeted suites of the `land-tests` block except the two re-pinned ones |
| Re-pins | R-1: RED first (`node qa/labs_panel_offline.js` fails on LB-8 only), then re-pin with the two-way proof; R-2 (if applicable): RED first (CP-10 alone fails), then re-pin with the two-way proof; `node qa/tools/index-pins.js --update`, then `--diff <T>` lists only entries that the §2 edits touch (the Worker names each one in `review.md` and maps it to an E-number: expected `_pfNormalizeHoldingEntry`, `openAddPositionModal`, `openEditPositionModal`, `saveAddPosition`, `saveEditPosition`, `_renderPortfolioPanel`, the pin-map entry for `PF_KNOWN_HOLDING_FIELDS` if the tool pins it, the three new helpers as additions) and **not** `_calcPortfolioAggregates`; `--check` OK |
| 7 | fresh-context self-review: re-read this brief and the complete diff as if new, against the map; record what changed as a result in `review.md` |
| 8 | Codex round one on the real diff (raw response in `codex.md`) |
| 9 | classify every finding FIX / DEFER / REJECT; fix FIX items with RED / GREEN |
| 10 | process check (line in `qa.log`) → full `qa:offline` PASS at step 0 + 1 |
| 11 | `review.md` (map results; the re-pin ledger old → new → proof; the S1 RED output; `## Backlog reconciliation`: none; lessons; exactly one line at column 1 `LAND-EVIDENCE: qa-offline=PASS <N+1>; targeted=PASS; codex-classI-unresolved=0`, written only after step 10, the land-tests and the Codex pass) |
| 12 | final Codex read-only check on the complete task diff **including `review.md`** (`codex exec --sandbox read-only`, output in the ignored `codex.md`); findings resolved FIX / DEFER / REJECT |
| 13 | step-13 commit of the §1 files (explicit `git add` paths, then the commit in a separate call); then the integrity check from the card. Its result is **LAND evidence**: reported only in the step-13 STOP report, never written into `review.md` |
| LAND / PUSH | usual R12 |

**STOP for:** TS-0…TS-9 failing; any change outside §1; a change to `_calcPortfolioAggregates` or any forbidden function; a re-pin other than R-1 / R-2; any existing suite failing other than the RED-first expectation; a denied protected action or an integrity FAIL; any guard denial except an AGENTS.md form denial (reissue once in compliant form, log it in `review.md`, report to MAIN); a second concurrent heavy run.

**Coordination:** the Worker reports `ACK-ASSIGN`, `PROGRESS`, `GATE`, `STOP` and `RESULT` to MAIN under the handoff pilot; a message never approves a gate.

## §5 Definition of Done

1. HQ-1…HQ-11 and the planted negatives pass; `qa:offline` PASS at step 0 + 1.
2. A holding can be created and edited with and without a quantity; invalid input is rejected with the exact message; a blank quantity is never filled; the card, coverage stat and guidance show exactly the §2 strings; derived lines appear only under the §2 conditions.
3. `_calcPortfolioAggregates`, `_pfComputeBaselineAt`, the packet builders and the backup functions are unchanged; `schemaVersion` 5 is still rejected; EOD / P-5 packets are byte-identical.
4. Only the §1 files changed; the pin map differs from T only by the §2 functions; R-1 (and R-2 when applicable) re-pins carry their two-way proofs.

## §6 Risks

| # | Risk | Control |
|---|---|---|
| R-1 | an edit of `_renderPortfolioPanel` breaks LB-8 | R-1 re-pin with RED-first and two-way proof |
| R-2 | CP-10 whole-file hash | R-2 (TS-5) or skipped when `cp10-decouple-1` has landed |
| R-3 | the normalizer gains a dependency and breaks the standalone extraction in other suites | E-2 forbids a new call; `qa:offline` covers `run-offline.js` / `asset_choice` |
| R-4 | quantity mistaken for a value or for agorot | placeholder text, HQ-5, N12 |
| R-5 | Owner data with a stray numeric legacy `quantity` | visible in the Edit form; nothing uses it until later steps |
| R-6 | `scan-action-gate-1` lands differently than planned | TS-0, TS-3, TS-5 read the real values at T |

## §CMD Command card (one command per Bash call; Bash tool only; absolute canonical root)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
git ls-files --eol index.html qa/labs_panel_offline.js qa/evidence_capture_offline.js qa/holdings_quantity_offline.js
node qa/guard_integrity_check.js --task task/holdings-quantity-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/holdings_quantity_offline.js
node qa/labs_panel_offline.js
node qa/evidence_capture_offline.js
node qa/eod_packet_v0_offline.js
node qa/p5_packet_offline.js
node qa/p5_call1_offline.js
node qa/p5_call2_offline.js
node qa/p5_step5_ui_offline.js
node qa/asset_choice_offline.js
node qa/dh_ui_vocabulary_offline.js
node qa/pulse_analyst_view_offline.js
node qa/no_synthetic_score_offline.js
node qa/tase_units_offline.js
node qa/market_structure_offline.js
node qa/index_pins_offline.js
node qa/tools/index-pins.js --diff <T>
node qa/tools/index-pins.js --update
node qa/tools/index-pins.js --check
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/holdings-quantity-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/holdings-quantity-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

## §PEP Execution preflight

The Worker proceeds from step to step without Owner input while every gate passes (RED / GREEN recorded, targeted suites, Codex classification, full `qa:offline`); only the class C items need the Owner. Expected prompts (class B) are listed separately from the Owner gates (class C). Classes: **A** auto-approved · **B** expected permission prompt · **C** Owner gate · **D** hook-denied (must not appear). The only scratch location is `/tmp/pt-holdings-quantity-1/` (deleted after use).

| Step | Commands / tools / scratch / paths | Class |
|---|---|---|
| before step 0 | R11 on this brief | **C** |
| Step 0 | git read-only lines of the card; `--print-record`; `npm run qa:offline`; `node qa/evidence_capture_offline.js`; `node qa/labs_panel_offline.js` (TS-3 / TS-5); Read / Grep / Glob | A |
| Step 0 | the Bash `wmic` listing before the heavy run | **B** |
| S1 RED / S2 GREEN | Write / Edit tools on `qa/holdings_quantity_offline.js` and `index.html`; `node qa/holdings_quantity_offline.js` | **B** (Write / Edit tools on repo files: no allow rule, `.claude/settings.json` :168 allows Edit only under `//tmp/pt-*/**`), A (`node qa/holdings_quantity_offline.js`) |
| Step 2 | the targeted `node qa/*_offline.js` lines of the card; `git ls-files --eol` | A |
| Re-pins | Edit tool on `qa/labs_panel_offline.js` and (if applicable) `qa/evidence_capture_offline.js`; `node qa/tools/index-pins.js --update / --diff / --check`; `node qa/index_pins_offline.js` | **B** (Edit tool on repo files), A (the `node qa/tools/index-pins.js` and `node qa/index_pins_offline.js` lines; `.claude/settings.json` :117, :154-156) |
| Re-pins | one scratch script `/tmp/pt-holdings-quantity-1/revert-proof.js`, run once per checkpoint; it covers the LB-8 pin and, if applicable, the CP-10 constant, both directions | **B** |
| Steps 7-9 | Read; Grep; `codex exec --sandbox read-only <prompt>` (allow-listed) | A |
| Step 10 | `npm run qa:offline` after the process check; the `wmic` listing | A, **B** (`wmic`) |
| Steps 11-12 | Write / Edit on `work/holdings-quantity-1/review.md`; `codex exec --sandbox read-only <prompt>` (allow-listed) | **B** (Write / Edit on repo files), A (`codex exec`; `.claude/settings.json` :161) |
| Closure (step 13) | the git read-only lines; `--print-record`; the integrity check | A |
| Closure (step 13) | `git add <explicit §1 paths>` | **B** |
| Closure (step 13) | the step-13 commit approval if prompted | **C** |
| §L | `land-request`, `push-request` lines of the card; R12 LAND; R12 PUSH | **C** |
| Never (all steps) | `curl`, `WebFetch`, `netlify`; PowerShell in the slot; `node -e` / `-p`; any Git configuration change; editing a file outside §1; a shell pattern search containing escaped double quotes (use the Grep tool); a scripted rewrite of `index.html` | **D** |

## §UER Execution readiness

**ATTENDED-ONLY.**

**§L:** no partial land.

<!-- land-scope:begin -->
index.html
qa/fixtures/index-pins.json
qa/labs_panel_offline.js
qa/evidence_capture_offline.js
qa/holdings_quantity_offline.js
work/holdings-quantity-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/holdings_quantity_offline.js
node qa/labs_panel_offline.js
node qa/evidence_capture_offline.js
node qa/eod_packet_v0_offline.js
node qa/p5_packet_offline.js
node qa/asset_choice_offline.js
node qa/dh_ui_vocabulary_offline.js
node qa/pulse_analyst_view_offline.js
node qa/no_synthetic_score_offline.js
node qa/index_pins_offline.js
<!-- land-tests:end -->

**Note on land-scope:** `qa/evidence_capture_offline.js` is listed because R-2 may apply; if TS-5 shows `cp10-decouple-1` has landed, the file is not edited and the Worker removes nothing: an unedited listed file is allowed, and the brief is not amended. `LAND-EVIDENCE` `targeted=PASS` means every `land-tests` line passed.
