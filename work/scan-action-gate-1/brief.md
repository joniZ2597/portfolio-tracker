# Brief: scan-action-gate-1 — enforce the setup → action contract for setups 1–7 and make the deterministic setup authoritative (DR-1 / DR-2; ACTIONABLE TAKE BOUNDARY)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below. Parent: `work/scan-action-gate/breakdown.md` (landed on `branch-dev` by the docs task `scan-action-gate-breakdown`, blob `718bf593…2d6`; this task does not touch it). Where the two differ, this brief wins.

Drafted by MAIN, 2026-10-19. Revision: rev 2 (Planner, 2026-10-20, against `9cacba8`) — adds the evidence-capture suite re-pin (S), the post-capture §TS, the parent path and the post-gate snapshot note (M).

| | |
|---|---|
| Evidence | MAIN Phase 1 diagnosis (2026-10-19): only `extended_near_ath` and `below_key_mas` gate the action (`orchestrate`); the AI's setup claim survives a deterministic `unknown`; the 62 cap and the action gate read different setup sources. No raw AI responses exist in the repo |
| Rulings | DR-1 (mapping, refined: invalid → `hold_wait` where permitted; AI risk warnings kept), DR-2, DR-3 (no score logic); D2, D4–D10, F1; Q1 = **X** (prompt unchanged, documented safety exception); Q2 = feature flag N/A; **D11 = D** (no `unknown` gate in this task) |
| Known limitation | **Action enforcement covers setups 1–7 only. On `unknown` the AI action passes through unchanged. This task does not deliver complete eight-setup enforcement.** Follow-up D11-A owns the `unknown` gate together with the `renderMainPanel` change |
| Backlog | **none** (no matching entry). Lessons recorded in `review.md` as `[backlog] — pending routing` (§X) |
| Baseline | `branch-dev` tip at task-start, **valid only if** the §TS checks pass. Drafted at `1eef672`, refreshed at `9cacba8` (post `evidence-capture-1`, `qa-evidence-changes-eol-1` and `scan-action-gate-breakdown`) |
| Branch / slot | `task/scan-action-gate-1`, first free slot, created from the verified tip |
| Mode | **Manual**, attended. Actionable Take boundary (precedent: `score-boost-removal-1`) |
| qa:offline | step-0 count **+1** (one new auto-discovered suite); the step-0 count is the post-capture value `<N>` (TS-10) |
| Parallel with | not with any task touching `index.html`, `qa/fixtures/index-pins.json`, the three `orchestrate`-re-pinned suites or `qa/evidence_capture_offline.js`; starts only after `evidence-capture-1` and `scan-action-gate-breakdown` are LANDED and pushed. One heavy run at a time (AGENTS.md "Test commands") |

## §0 Findings (restated as facts)

| ID | Statement | Status |
|---|---|---|
| F-1 | The prompt's setup → action table (`fetchAnthropicAnalysis`, "TECHNICAL SETUP GATING") is enforced in code for 2 of 8 setups | Confirmed (code) |
| F-2 | `orchestrate` keeps the AI's `technical_setup` when `classifyTechnicalSetup` returns `unknown`; the 62 cap reads `item.technical_setup`, the action gate reads `_setup6a` | Confirmed (code) |
| F-3 | `sentiment_score` is written only by the AI and four `orchestrate` clamps (45 / 55 / 62 / 45) plus the `null` fallback; nothing in this task adds a writer | Confirmed (sweep) |
| F-4 | `renderMainPanel` renders the structured Actionable Take block only when `item.action` is set — the reason the `unknown` gate is deferred (D11-A) | Confirmed (code) |

## §TS Task-start baseline checks (Bootstrap, read-only, at the task-start tip T)

| # | Check (all must hold; else STOP and return to MAIN) | Value at `9cacba8` (Planner read, 2026-10-20) |
|---|---|---|
| TS-0 | `evidence-capture-1` (with its MS-T16 change), `qa-evidence-changes-eol-1` and `scan-action-gate-breakdown` are LANDED; `branch-dev` = `origin/branch-dev` = T | T = `9cacba8` or a later tip whose changes since `9cacba8` touch none of the paths checked below |
| TS-1 | pin map at T: `functions.orchestrate`, `fetchAnthropicAnalysis`, `classifyTechnicalSetup`, `renderMainPanel`, `analyzeChunk`, `enforceScoreConsistency`, `_isValidScanResult`, `_nlmConsistencyChecks` **equal** these values (capture does not touch them) | `2e352b3f…` · `99eb1e8d…` · `c143eb08…` · `61e663bf…` · `e9303a06…` · `28a3a5ca…` · `cfc5cc18…` · `6716b144…` (unchanged by capture) |
| TS-2 | blobs at T equal: `qa/market_daily_change_offline.js`, `qa/ai_request_hygiene_offline.js`, `qa/tase_units_offline.js`, `qa/no_synthetic_score_offline.js` | `4cca554f…` (capture changed it) · `a8b36014…` (capture changed it) · `53c2b25c…` · `94da7ff7…` |
| TS-3 | the exact anchor **texts** of §A each occur exactly once in `index.html` (checked by text, not by line; the line numbers are informational and shifted after capture) | matched at `9cacba8`: `:7555` · `:7590` · `:7500` |
| TS-4 | `qa/scan_action_gate_offline.js` absent | absent |
| TS-5 | `qa/evidence_capture_offline.js` blob `df7c92f1…`; its `BASE_INDEX_SHA` (line 38) equals `73a40426…6000` **and** `node qa/evidence_capture_offline.js` is GREEN at T (CP-10 passes) | `df7c92f1…` · `73a40426…6000`, GREEN (13 rows, 17 negatives) at `9cacba8` — any other constant value means another `index.html` task landed: STOP, re-base the brief |
| TS-6 | `index.html` blob at T | `6ee00f1e…` |
| TS-7 | `qa/market_structure_offline.js` blob at T (changed by the capture amendment rev 1.2) and its `indexScanText` markers present | `f944f6c9…` |
| TS-8 | `work/scan-action-gate/breakdown.md` present, blob | `718bf593…2d6` |
| TS-9 | the capture region (`HEAD_MARK`…`END_MARK`), the call lines and `#ehBox` each occur exactly once in `index.html` (CP-10's transformation applies) | yes (suite GREEN) |
| TS-10 | step-0 `qa:offline` count at T | `<N>` (MAIN reports 103 at `9cacba8`; the Worker records the count it sees) |

`work/evidence-capture-1/` (committed, landed) and `work/scan-action-gate/` (landed by the docs task) are not part of this task and are never touched by it.

## §A Anchors (text binding; `:N` at `9cacba8`, informational)

| Anchor | Line | Use |
|---|---|---|
| `    else item.technical_setup = item.technical_setup \|\| 'unknown';` | :7555 | **DR-2:** becomes `    else item.technical_setup = 'unknown';` (the only edit to this line) |
| `    // Attach structured audit trail — console + object level only in 6A-1` | :7590 | **DR-1:** the new gate block is inserted immediately **before** this line (after the existing `below_key_mas` block) |
| `function orchestrate(claudeResults, pplxData, stockData, techSnaps) {` | :7500 | signature unchanged |

Markdown escapes `|` as `\|` inside table cells; the source text itself contains no backslashes (`|| 'unknown'`).

## §1 Contract

### DR-1 — action gate for setups 1–6 (setup 7 keeps its existing gate)

Runs only when `item._aiUnavailable !== true`, keyed **only** on `_setup6a`. The AI action is trimmed and lowercased (D6). If the result is in the setup's allowed set, the canonical value is written; otherwise the setup's single fallback is written. Rows 7 (`below_key_mas`) and 8 (`unknown`) are not touched by the new block.

| # | Setup | Allowed (canonical) | Fallback for everything else |
|---|---|---|---|
| 1 | `extended_near_ath` | `hold_wait`, `trim`, `avoid` | `hold_wait` (incl. **`hold` → `hold_wait`, F1**) |
| 2 | `healthy_uptrend_near_ath` | `hold_wait`, `add_on_pullback`, `trim`, `avoid` | `hold_wait` |
| 3 | `healthy_uptrend` | `hold`, `add_on_pullback`, `add_on_breakout`, `trim`, `avoid` | `hold` |
| 4 | `pullback_in_uptrend` | `add_on_reclaim`, `add_on_pullback`, `hold_wait`, `trim`, `avoid` | `hold_wait` |
| 5 | `support_test` | `add_on_pullback`, `hold_wait`, `trim`, `avoid` | `hold_wait` |
| 6 | `breakdown_risk` | `trim`, `avoid` | `avoid` |
| 7 | `below_key_mas` | existing gate, unchanged (everything → `avoid`) | — |
| 8 | `unknown` | **not gated — known limitation (D11-D)** | — |

"Everything else" = missing, `null`, non-string, `buy`, any `add_*` not in the allowed set, `hold` / `hold_wait` where not allowed, and any unrecognised string. **Invariant:** an input that is not an add never becomes an add, and an invalid add never becomes another add. The code never writes `trim`.

**Safety exception (Q1 = X), recorded in a one-line comment at the block:** the code accepts more than the unchanged prompt lists, only in the safer direction — `hold_wait` for rows 4–5 and the AI's own `trim` / `avoid` for rows 1–5. The prompt text (`fetchAnthropicAnalysis`) is byte-identical.

**Logging (D7):** when the written value differs from the stored one, one `console.warn` whose output reads `[PT] Orchestrate: action override <SYM> <setup> → <written value> (was: <stored value>)` — the same shape as the existing `extended_near_ath` / `below_key_mas` messages. No new item field, no persisted change of shape. `_auditTrail.finalDecision.action` and `window._pplxDebug[sym].actionableAction` reflect the gated value because both are assembled after the block.

### DR-2 — the deterministic setup is authoritative

The §A :7555 edit only. Consequences, accepted by the Owner:
- an AI setup claim never survives a deterministic `unknown`: the Scan setup row, Scan Results setup column, Position Take, key-risk fallback and Deep Dive context read `unknown`;
- **D10:** the existing 62 cap no longer fires on an AI-claimed `extended_near_ath` when the code says `unknown` (the AI score stands). No score logic is added or removed; the cap line itself is byte-identical.

### §C Hard constraints

| Source | Constraint |
|---|---|
| Scope | Only `orchestrate` changes in `index.html`: the :7555 line and one inserted block. Every other function, region, the prompt, `classifyTechnicalSetup`, `renderMainPanel`, `_nlmConsistencyChecks`, clamps and persistence are byte-identical |
| R-3 / Entry 36 (`no_synthetic_score` NS-3 / NS-4 / NS-12) | Failed items get **no** `action` key. The six R-3 lines (the ±5 % guards, the 62 cap, the two `extended_near_ath` / `below_key_mas` blocks and the 45 cap) stay byte-identical and each occurs exactly once — the new block must not repeat any of their text |
| DQ-1 = A (`score-boost-removal-1`) | No write to `sentiment_score` or `sentiment` anywhere in the new code |
| Sandboxes (`tech_snapshot_cache` TC-4, `high1y_label` HL-7, `no_synthetic_score` buildOrchestrate, `ath_client` AC-6, `narrative_consistency` NC-10) | The mapping tables are **local to `orchestrate`** (no new top-level declaration — it would also move the pin map's remainder); no new free names; no `_techCache`, `_ath*`, `_nlmConsistencyChecks`, `localStorage`, `pt_` reference |
| `market_daily_change` DC-12 regexes | the `const chg = mkt?.change_percent ?? 0;` guard lines and `item._verifiedChangePct = mkt.change_percent;` unchanged |
| `evidence_capture` CP-10 | the suite hashes `index.html` outside the three capture insertions. The §A edits change that hash; **only** the `BASE_INDEX_SHA` constant (line 38 of the suite) may change, per §2. The capture region, the call lines and `#ehBox` stay byte-identical |
| `market_structure` MS-T16 (after the capture amendment) | the gate block, its tables and comments must not contain `market-structure` or `analyzeMarketStructure` anywhere in `index.html` |
| Pin map | `node qa/tools/index-pins.js --diff <base>` lists only `functions.orchestrate` and the file digest |
| EOL | `index.html` is CRLF in the working tree (`core.autocrlf`). Every touched file keeps its base EOL form; byte-audit after each edit (no CRLF → LF rewrite) |
| No stored change | no migration; saved results keep their stored action / setup until rescan |
| No live step | no AI / Perplexity / market call, no DEV scan, no Netlify action |

## §2 Re-pins (the only ones allowed)

Each: new value from the task source in the suite's own (LF-normalised, `index-pins-core`) form; revert proof — a copy of the task source with only the §A lines reverted hashes to the **old** value; ledger row old → new → proof in `review.md`. The constant gets a trailing comment `// scan-action-gate-1 (DR-1 / DR-2)` (precedent: `tase_units_offline.js` `fetchYahoo` row).

| Suite | Pin | Old |
|---|---|---|
| `qa/market_daily_change_offline.js` | `BASE_DIGESTS.orchestrate` (DC-12) | `2e352b3f…bf97dfb` |
| `qa/ai_request_hygiene_offline.js` | `BASE_DIGESTS.orchestrate` (HY-11) | `2e352b3f…bf97dfb` |
| `qa/tase_units_offline.js` | `BASE_DIGESTS.orchestrate` | `2e352b3f…bf97dfb` |
| `qa/evidence_capture_offline.js` | `BASE_INDEX_SHA` (CP-10, line 38) | `73a40426…6000` (read the value at T; TS-5) |
| `qa/fixtures/index-pins.json` | regenerated with `--update` (never hand-edited) | `functions.orchestrate` `2e352b3f…`; `fileSha256` `b2462c3e…` at `9cacba8` |

**The CP-10 constant is a whole-file hash, not an `orchestrate` digest.** New value = sha256 of the task's `index.html` after CP-10's own transformation (LF-normalise; remove the capture region, the capture call lines and the `#ehBox` block). The Worker takes the value from the suite's CP-10 failure message **and** proves it twice in the revert-proof script: (a) the task's `index.html` with only the §A lines reverted, put through the transformation, hashes to the **old** constant; (b) the task's `index.html` unreverted, put through the transformation, hashes to the **new** constant. Only line 38 of the suite changes; the trailing comment `// scan-action-gate-1 (DR-1 / DR-2)` is added to it. Any other change to that suite is STOP-1.

Not re-pinned, verified unaffected by the sweep: `no_synthetic_score` `PRE.orchestrate` (frozen-chain only), `qa/fixtures/index-pins-frozen.json` (IP-12), the denylisted `arc_*` whole-file pins. Any other hit at `/plan` → STOP-1.

## §3 Slices

**S1 — characterisation suite (RED first).** New `qa/scan_action_gate_offline.js`: real `orchestrate` + `classifyTechnicalSetup` extracted from `index.html` into a `new Function` sandbox (pattern: `qa/tech_snapshot_cache_offline.js` TC-4, `qa/no_synthetic_score_offline.js` buildOrchestrate); snapshot fixtures sanity-checked through the real classifier.

| ID | Assertion | At S1 |
|---|---|---|
| SG-1 | **Mapping:** setups 1–6 × {every enum value, `buy`, missing, `null`, `'strong_buy'`, `'Accumulate'`, `' Add_On_Pullback '`, `'HOLD_WAIT'`} (+ non-string `7` for rows 2–6) → allowed ⇒ canonical, else the row's fallback | RED |
| SG-2 | Row 7: every input → `avoid` (existing behaviour, positive control) | GREEN |
| SG-3 | **Never an add:** for setups 1–6, a non-add input never yields an add; an invalid add never yields another add | RED |
| SG-4 | **Risk warnings kept:** `trim` / `avoid` preserved in rows 1–6; the code never writes `trim` from a non-`trim` input | GREEN |
| SG-5a | **Known limitation pinned:** deterministic `unknown` → the AI action is unchanged for every input | GREEN |
| SG-5b | **DR-2:** deterministic `unknown` + AI-claimed setup → `technical_setup === 'unknown'`; a deterministic setup always wins | RED |
| SG-6 | **D10:** AI claims `extended_near_ath`, code `unknown`, score 90 → score 90; code `extended_near_ath`, 90 → 62 / `hold_wait` | RED |
| SG-7 | **Failed items:** `_aiUnavailable` items on setups 1–8 → no `action` key, setup assigned as today, score `null` | GREEN |
| SG-8 | **No score logic:** over ≥ 1000 non-failed combinations (domains fixed in the suite: 8 setups × change −7 / 0 / +7 × scores 0 / 30 / 70 / 90 × 10 actions (the seven enum values, `buy`, `null`, `'strong_buy'`) × bias `bullish` / `neutral` / `bearish` × key risk empty / non-empty = 5 760 cases; the suite asserts `cases.length >= 1000` before comparing), every field except `action`, `technical_setup`, `_auditTrail.finalDecision.action` and the per-call timestamp `_orchestratedAt` equals the output of the task function with the block removed and :7555 restored (an oracle built from the source by the block's unique marker comments); the SG-6 case is the only excluded class | RED (marker absent) |
| SG-9 | **Audit / log:** `_auditTrail.finalDecision.action === (item.action \|\| null)`; exactly one override `console.warn` per changed action in the §1 form; none when unchanged | RED |
| SG-10 | **Static:** signature unchanged; block delimited by two unique marker comments containing `scan-action-gate-1`; tables local to `orchestrate` (no top-level declaration of the block's table names); no forbidden names (§C); the six R-3 lines once each; the DR-2 line once; `fetchAnthropicAnalysis`, `renderMainPanel`, `classifyTechnicalSetup` equal their pin-map entries | RED |

**S2 — implementation + re-pins.**
1. The §A :7555 edit and the block (§1), with the safety-exception comment and the two marker comments.
2. SG-1…SG-10 GREEN.
3. **Re-pin RED first:** before any re-pin, run `node qa/evidence_capture_offline.js`; it must FAIL on **CP-10 only** (message `index.html differs from the base outside the three insertions: <sha>`; every other row and negative GREEN). Record the run and the printed sha in `qa.log`. A failure of any other row, or a pass, is a STOP.
4. §2 re-pins with revert proofs (the three `orchestrate` digests and the CP-10 constant); `--update`; `--diff <base>` shows only `functions.orchestrate` + the digest. Re-run `node qa/evidence_capture_offline.js` → GREEN (13 rows, 17 negatives, or the landed counts).

**Continuation S1 → S2:** the S1 column holds exactly as listed (each RED for the stated reason, not a crash); §C holds; no Codex Class I open.

**Planted negatives (mutate an in-memory copy of the production source, never the test; anchor proven unique first; each with a positive control):**
- drop row 2 from the allowed table → SG-1;
- row 2 fallback set to `add_on_pullback` → SG-3;
- `trim` removed from row 3's allowed set → SG-4;
- the gate applied to `unknown` (any value) → SG-5a;
- :7555 restored → SG-5b / SG-6;
- the `_aiUnavailable` guard removed from the block → SG-7;
- a `sentiment_score` write added inside the block → SG-8 / SG-10;
- normalisation skipped (exact match) → SG-1;
- the override `console.warn` removed → SG-9;
- a top-level `var <name> = {};` declaration, with `<name>` one of the block's table identifiers, inserted immediately before `function orchestrate(` → SG-10 (its "no top-level declaration of the block's table names" assertion fails; positive control: the unmutated source passes it).

**Program STOP:** any `index.html` change outside §A; any re-pin not in §2; any suite failure other than the §2 pins before re-pin; any live / DEV / Netlify action; a second concurrent heavy run; any guard denial (STOP, no rerouting).

## §4 QA suites that read in-scope files as text (AGENTS.md)

`no_synthetic_score` (NS-3/4/11/12 — survive under §C), `tech_snapshot_cache` (TC-4 — survives), `high1y_label` (HL-7/HL-8 — survive after `--update`), `market_daily_change` (DC-12 — **re-pin**), `ai_request_hygiene` (HY-11 — **re-pin**), `tase_units` (TS-1 — **re-pin**), `evidence_capture` (CP-10 whole-file hash — **re-pin**, the constant only), `market_structure` (MS-T16 token scan — survives, §C), `evidence_changes` (survives, not touched), `ath_client` (AC-6), `narrative_consistency` (NC-10), `catalyst_hygiene` (slices three `orchestrate` fragments by text anchor — the `_catalystDataMissing` line, the direction block, the key-risk guard; survives because the new block sits before them and must not repeat their anchor text), `pulse_analyst_view` (PA-9 prompt pin — survives, prompt unchanged), `analyst_parser`, `eod_preexport_warning` (pin-map readers — survive after `--update`), `index_pins` (IP-1…IP-12), `labs_panel`, `sec_evidence_store_view`, `ath_isolation` (AR-7i / PN reads `fileSha256` from the committed `qa/fixtures/index-pins.json`, so it survives exactly when that fixture is regenerated with `--update`; it is in the command card and land-tests for that reason), `dh_ui_vocabulary` (name-absence statics — survive).

## §5 Consumer impact (pt-ai-output-change §4; new scans only)

| Reader | Effect |
|---|---|
| `renderMainPanel` — dial label, `PULSE · <action>` chip, Actionable Take block, Scan setup row | show the gated action / deterministic setup |
| `_nlmConsistencyChecks` K4 | skipped when the gated action is `trim` / `avoid` (e.g. row 6 fallback `avoid`) |
| portfolio research row and research detail panel (`buy` / `hold_wait` / `avoid` allowlists) | unchanged code; more `hold_wait` / `avoid` values become visible chips; other values still hidden (separate UI issue) |
| Scan Results setup column, `derivePositionTake`, Deep Dive context | read the DR-2 setup |
| `_auditTrail`, `window._pplxDebug` | gated action; memory/console only for overrides |
| `pt_results` | same shape; new values for new scans; no migration |
| Research history (S1 snapshots written by `evidence-capture-1`) and the change engine (S2, later `what-changed-1`) | The first scan after this task is compared with snapshots stored before it. `action` and `technicalSetup` changes are material under D-20 / D-23, so the engine will report many "changes" that come from this gate (and from DR-2's setup authority), not from the market. No code change here; recorded as a `[backlog]` lesson (§X) for `what-changed-1` (count it, or mark a code-version boundary). Capture itself stores whatever the scan produces: nothing in this task reads or edits the store |

AI-facing strings changed: **none**. DEV check: **not approved** in this task.

## §6 Codex review

Steps 8 / 12 on the real diff. Codex confirms: only §A changed in `index.html`; the §1 table matches the code exactly; R-3 lines intact; no score / sentiment write; re-pins limited to §2 with proofs (including the CP-10 constant, line 38 only, and its two-way proof); planted negatives bite; prompt byte-identical; the known-limitation wording is present in `review.md` and nowhere claims eight-setup enforcement.

## §ET (non-blocking)

About 80 min: setup 10 · S1 20 · S2 20 · re-pins + proofs (incl. the CP-10 RED/GREEN and two-way proof) 20 · closure 10.

## §CMD Command card (one command per Bash call; Bash only; absolute canonical root)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
node qa/guard_integrity_check.js --task task/scan-action-gate-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/scan_action_gate_offline.js
node qa/no_synthetic_score_offline.js
node qa/tech_snapshot_cache_offline.js
node qa/high1y_label_offline.js
node qa/market_daily_change_offline.js
node qa/ai_request_hygiene_offline.js
node qa/evidence_capture_offline.js
node qa/tase_units_offline.js
node qa/ath_client_offline.js
node qa/ath_isolation_offline.js
node qa/narrative_consistency_offline.js
node qa/catalyst_hygiene_offline.js
node qa/pulse_analyst_view_offline.js
node qa/score_boost_removal_offline.js
node qa/index_pins_offline.js
node qa/tools/index-pins.js --diff <base>
node qa/tools/index-pins.js --update
node qa/tools/index-pins.js --check
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/scan-action-gate-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/scan-action-gate-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

## §PEP Execution preflight

| Step | Commands / tools / scratch | Class |
|---|---|---|
| Step 0 | git read-only lines above; `--print-record`; `npm run qa:offline` (heavy-run check first) | A |
| S1 | Write / Edit tools on `qa/scan_action_gate_offline.js`; `node qa/scan_action_gate_offline.js` | A (tools in slot) |
| S2 | Edit tool on `index.html` and the three suites; targeted `node qa/*_offline.js`; `index-pins --update / --check / --diff` | A |
| Revert proofs | one scratch script `/tmp/pt-scan-action-gate-1/revert-proof.js`, run once per checkpoint; it covers the three `orchestrate` digests and the CP-10 constant (both directions) | **B** |
| Staging | `git add <explicit paths>` | **B** |
| Step 10 / §L / closure | `npm run qa:offline`; integrity check; land-request; push-request | A, then **C** |
| Gates | R11 (this brief), R12 LAND, R12 PUSH | **C** |
| Never | `curl`, `WebFetch`, `netlify`, PowerShell, `node -e` with quoted escapes, any command naming a hook file except the card lines | **D** (must not appear) |

S1 → S2 continuation needs no Owner input when the §3 continuation conditions hold. Expected prompts: the revert-proof script run and `git add`; the C gates are separate.

## §UER Execution readiness

**ATTENDED-ONLY** (Actionable Take boundary; T6 indirect script execution remains unmitigated on this path).

## §X Closure

1. Step 10 full `qa:offline` (= step 0 + 1) PASS.
2. `review.md`:
   - the previous `orchestrate` text at :7554-7555 verbatim (rollback reference);
   - the SG table RED → GREEN; planted-negative results with positive controls;
   - the §2 re-pin ledger (old → new → proof), including the CP-10 constant with its two proofs and the RED-first record;
   - the coupling sweep re-run with no new hits ("sweep matches brief: yes");
   - the **known-limitation line verbatim:** `Known limitation: action enforcement covers setups 1–7 only; on unknown the AI action passes through unchanged (D11-D). Follow-up D11-A owns the unknown gate and the renderMainPanel change.`
   - `## Backlog reconciliation` (none);
   - lessons, each `[backlog] — pending routing`: (a) **D11-A** unknown-action gate + `renderMainPanel` risk-context rendering; (b) missing action chips (portfolio row / research detail allowlists); (c) **R10-E** guard false positive — Owner-ruled separate governed docs task registers BACKLOG entry 39; (d) the existing `extended_near_ath` gate throws on a truthy non-string action; (e) the CP-10 whole-file hash couples every later `index.html` task to `qa/evidence_capture_offline.js` (candidate QA-only decoupling task); (f) `what-changed-1` must decide how to treat the first scan after a gate/setup-authority change (code-version boundary or count it);
   - **LAND-EVIDENCE line (L9):** exactly one line, column 1, no bullet / backticks / bold / trailing spaces: `LAND-EVIDENCE: qa-offline=PASS <N>; targeted=PASS; codex-classI-unresolved=0` — written only after step 10, every land-test and Codex pass; committed with the final implementation; the integrity output goes only in the step-13 STOP report. **After an L9 refusal: STOP-6.**
3. Final Codex check.
4. Step 13 → integrity → R12 LAND / push / cleanup.
5. **Rollback:** revert the task commits on `branch-dev`, then R12 push. No data rollback.
6. Post-push DEV check: not part of this task; only if separately approved (read-only; new scans only).

## §Y Files, land-scope, land-tests

```
index.html                              orchestrate only: §A :7555 line + one inserted block
qa/scan_action_gate_offline.js          NEW (SG-1…SG-10 + planted negatives)
qa/market_daily_change_offline.js       re-pin BASE_DIGESTS.orchestrate only
qa/ai_request_hygiene_offline.js        re-pin BASE_DIGESTS.orchestrate only
qa/tase_units_offline.js                re-pin BASE_DIGESTS.orchestrate only
qa/evidence_capture_offline.js          re-pin BASE_INDEX_SHA only (line 38)
work/scan-action-gate-1/review.md       evidence, per the committed briefs' convention
qa/fixtures/index-pins.json             regenerated
```

<!-- land-scope:begin -->
index.html
qa/scan_action_gate_offline.js
qa/market_daily_change_offline.js
qa/ai_request_hygiene_offline.js
qa/tase_units_offline.js
qa/evidence_capture_offline.js
qa/fixtures/index-pins.json
work/scan-action-gate-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/scan_action_gate_offline.js
node qa/tools/index-pins.js --check
node qa/index_pins_offline.js
node qa/no_synthetic_score_offline.js
node qa/tech_snapshot_cache_offline.js
node qa/high1y_label_offline.js
node qa/market_daily_change_offline.js
node qa/ai_request_hygiene_offline.js
node qa/evidence_capture_offline.js
node qa/tase_units_offline.js
node qa/ath_client_offline.js
node qa/ath_isolation_offline.js
node qa/narrative_consistency_offline.js
node qa/catalyst_hygiene_offline.js
node qa/pulse_analyst_view_offline.js
node qa/score_boost_removal_offline.js
<!-- land-tests:end -->

**Skills:** `pt-offline-suite` Required · `pt-ai-output-change` Required (post-AI override; no AI-facing string changes; §5 is its consumer note). `/plan` mandatory; `plan.md` carries the CLAUDE.md pre-flight four items, with **Gate Verification recorded N/A per Owner Q2** (client-only deterministic logic, no I/O, no server path).

**§L:** close at S1 only if S2 cannot complete (M-4); never land a partial gate.
