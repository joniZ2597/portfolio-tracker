# Task brief: catalyst-hygiene-2 — drop filler and price-only catalyst rows; rating-only research is coverage

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL-DRAFT rev 5, HELD — NOT R11-ready** (COWORK, 2026-10-16).
- Built on `branch-dev` = `origin/branch-dev` = `2dc9c30`. `index.html` is unchanged from `6f23f58`, where `analyst-action-coverage-1` closed.
- Main Control decisions applied: **D-5** (a price move counts only with an explicitly stated catalyst; causality is never inferred from price action), **D-6** (rating-only research is coverage, never "no data"), and the **earnings-panel fix is split out** (not a dependency).
- **Rev 2** answers the Codex review of rev 1 (`shared-reports/codex/2026-10-16_catalyst-hygiene-2-brief-review.md`, verdict preserved: NOT READY, 4 Class I): every downstream consumer of R-6 is listed and tested (I-1, I-2: CH-9, CH-10); an explicitly stated cause now keeps a price row (I-3: E-7, CH-11); coverage added (I-4). Adjudication: `shared-reports/codex/2026-10-16_catalyst-hygiene-2-adjudication.md`.
- **Rev 3** applies the Main Control rulings on the rev-2 re-check (`shared-reports/codex/2026-10-16_catalyst-hygiene-2-rev2-recheck.md`, verdict preserved: NOT READY, 2 Class I): I-1 closed (short rating-only retry behaviour preserved as documented); **I-2:** CH-10 now tests the confidence badge, the catalyst-evidence fallback row and the audit source label; **I-3 (not accepted as residual):** E-7 is inverted — a cue word counts only when followed by a **concrete event**, so vague market descriptions are never a cause (CH-11, CH-12, CH-N5…N7). Bootstrap's rejection of the "board approved a sale" sub-claim is preserved (that row is kept, CH-11).
- **Rev 4** answers the rev-3 re-check (`shared-reports/codex/2026-10-16_catalyst-hygiene-2-rev3-recheck.md`, verdict preserved: NOT READY, 1 Class I = I-3) under the Main Control rulings (I-1 and I-2 closed; I-3 open, not accepted as residual; no further keyword-list patch): **E-7 is rebuilt as a grammatical-role classifier** (clause, subject, head noun, anchoring) with a market-description veto, measured on four held-out sets written before the rule they measure (§3, `evidence/feasibility.md`). A **full consumer sweep** (§1a) adds the catalyst-array consumers missed by revs 1–3 (retry counts, catalyst direction, confidence badge).
- **Rev 5** (closure, minimal) applies the Main Control rulings on the rev-4 review (`shared-reports/codex/2026-10-16_catalyst-hygiene-2-rev4-recheck.md`, verdict preserved: NOT READY, 2 blocking items): **B-1** "amid widespread caution" no longer counts as a cause (one adjective added to the existing adjective class; regression row in CH-11, negative CH-N11); **B-2** CH-16 now asserts the key-risk contradiction guard from its exact source block; R-9 is out of scope (separate follow-up); the four documented conservative false negatives are accepted known limitations for this task (R-7b). No other rule change.
- Rev 1–4 are kept in `rev1/` … `rev4/`; the focused deltas are `evidence/rev4.diff` and `evidence/rev5.diff`.
- **Remaining before R11:** Bootstrap's independent focused verification of the rev-5 changes (no further Codex round unless they change the rule structure), then closure-evidence acceptance by Main Control / Owner and final hash acceptance.

| | |
|---|---|
| Problem (live + real text) | <ul><li>**N-4:** a filler phrase is booked as a catalyst (MSFT live BEARISH: "No specific downside catalyst reported").</li><li>**N-5:** price-only rows quoted in ILA / ₪ pass the price-history filter that catches the same row in `$` (MGOR.TA live: 3 rows, e.g. "October 13 — MGOR closed at ILA 47,840, up 3.84%").</li><li>**D-11:** a bare U+2212 minus "−" is kept as an item.</li><li>**R-6:** a research block whose only content is rating-only analyst actions is `_allNone`, so the AI receives "No catalyst, analyst, earnings, or revision data returned" instead of the RATING ACTIONS line.</li></ul> |
| Objective | These rows are dropped (N-4, N-5, D-11) and rating-only research counts as coverage (R-6). Every other parse result is unchanged: the 6 other live captures, the 42-case fixture and the existing suites |
| Source | `shared-reports/research/2026-10-15_live-perplexity-sampling.md` (N-4, N-5, D-11); `shared-reports/deploy/2026-10-16_cycle-N-six-ticker-dev-validation.md` (R-6); `analyst-action-coverage-1` brief §5 R-6; repo fixture `qa/fixtures/research-live-2026-10-15.json` |
| Decisions (Main Control, 2026-10-16) | **D-5** — FROG live "fell 7.37% … despite UBS's target increase, indicating heavy profit-taking … near the 52-week high": its cause is inferred from price action, so it **stays filtered (unchanged)**; a move with a stated catalyst term is kept (unchanged rule, locked by CH-3). **D-6** — R-6 fixed here. **Earnings panel (D-13)** — out of scope, separate future task |
| Backlog | none. No `BACKLOG.md` edit |
| Depends on | `analyst-action-coverage-1` (CLOSED, `6f23f58`): same function and pin map. Nothing open |
| Baseline / start (§TS) | Start at the current tip T. Valid only if all of these hold; otherwise HOLD: <ul><li>`qa/analyst_parser_offline.js` = `fd2624ea8f5262a6600560891202713fe2be494a`;</li><li>`qa/analyst_action_coverage_offline.js` = `803fdc3e7a1ea1bcc03cf3f82032943962afadac`;</li><li>`qa/research_ai_context_offline.js` = `64356d63d54d1df4a8339572d3bcec80ee24d373`;</li><li>`qa/research_parser_hygiene_offline.js` = `294068a9705e7bc56e18738aebba9dbd89359e32`;</li><li>`qa/fixtures/research-live-2026-10-15.json` = `54526e2c15414dab849bd52cb544daaff5bcd2b3`;</li><li>every §2 anchor occurs exactly once in `index.html` (reference blob at `2dc9c30`: `c333321373e164bb224029b79ef3c411f43c64ef`).</li></ul> |
| Branch / slot / mode | `task/catalyst-hygiene-2` · **Worker A** · **Manual** (changes what the AI receives) |
| qa:offline | step-0 count **+1** (`qa/catalyst_hygiene_offline.js`; 97 → 98 at `2dc9c30`). `qa/run-offline.js` auto-discovers it; the runner stays forbidden |
| Parallel with | nothing in lane A (sequential). Lane B: no `index.html` overlap |
| Skills | none required |
| Scoring boundary | No scoring code, prompt text, `formatNewsContext`, `orchestrate`, `analyzeChunk`, `renderMainPanel` or persisted shape is changed; only `parsePerplexityContext` changes. Its output feeds display labels, the AI context and the retry heuristic: every consumer is listed in **§1a** with its assertion or "listed, untested". None is a score |

## §1 Files (exactly)

- `index.html` — **only** inside `parsePerplexityContext`: `_isPriceHistoryOnly` (two patterns, one new alternative, the stated-event keep), the E-7 classifier constants and helpers inserted just before it, a new `_FILLER_RE` constant, the `_splitList` none check, and the two `_allNone` expressions (§2)
- `qa/fixtures/index-pins.json` — `--update`; exactly three values change: `fileSha256`, `functions.parsePerplexityContext`, `regions.allnone_expr.sha256`
- `qa/catalyst_hygiene_offline.js` (new)
- `qa/analyst_parser_offline.js` (blob `fd2624ea…`) — **AP-13 only, exactly three edits** (D-6 reverses the rule this block locked):
  - the comment `// -- AP-13: _allNone unchanged --` → `// -- AP-13: _allNone (catalyst-hygiene-2, R-6 / D-6: rating-only research is coverage, never all-none) --`;
  - the check "a block whose only analyst content is rating-only has `_allNone === true`" → `… === false` (label and expression);
  - the check "`__raw__` fallback: rating-only row present, analystActions empty, `_allNone` true" → `… false` (label and expression).
  The other 55 assertions and the 42-case fixture are unchanged; the AP-13 pin-region check passes after `--update`.
- `qa/analyst_action_coverage_offline.js` (blob `803fdc3e…`) — **`LIVE_BASE` only, two values:** `'MSFT#2'` rest `ca834cbbf22211c8` → `90ffd3b019658ca6`; `'MGOR.TA#7'` rest `c474f85bb7f873d6` → `0cb937910c80e671` (`aa` unchanged)
- `qa/research_ai_context_offline.js` (blob `64356d63…`) — **`BASE` (RC-6) only, three array edits:** MSFT#2 `bearishCatalysts` loses `"No specific downside catalyst reported"`; MGOR.TA#7 `bullishCatalysts` becomes `[]`; MGOR.TA#7 `bearishCatalysts` loses its first element (the "October 6 — shares were reported at ILA 47,660 …" row)
- `work/catalyst-hygiene-2/review.md`

Reference for all suite edits: `evidence/ch2-suite-deltas.py` (anchored, each exactly once). Any other change to these three suites is a STOP.

**Forbidden:**
- `NONE_RE` / `_isNoneVal` lines (pinned by `research_parser_hygiene_offline`), the catalyst-term list in `_isPriceHistoryOnly`, `_readField`, every `_aa*` helper;
- `renderMainPanel` (including its earnings none-check, D-13), `formatNewsContext`, `analyzeChunk` (including `_NONE_RE_7B3B3`) and every other function;
- `qa/research_parser_hygiene_offline.js`, `qa/fixtures/research-live-2026-10-15.json`, `qa/fixtures/index-pins-frozen.json`;
- `netlify/**`, `qa/run-offline.js`, `package*.json`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `BACKLOG.md`.

## §1a Consumer sweep (rev 4; every reader of the changed output)

Changed outputs: (1) the contents of `bullishCatalysts` / `bearishCatalysts` / `macroDrivers` (N-4, N-5, D-11, E-7); (2) `_allNone` (R-6). Readers found by searching `index.html` for each symbol (`bullishCatalysts`, `bearishCatalysts`, `macroDrivers`, `_allNone`, `_catalystDataMissing`, `_catalysts`, `_hasStructuredCatalysts`, `_catalystDirection`). Effects derived from D-5 (a price move without a stated event is not a catalyst) and D-6 (rating-only research is coverage).

| Reader | Effect | Assertion |
|---|---|---|
| `formatNewsContext` BULLISH / BEARISH / MACRO lines and the all-none sentence (AI input) | fewer filler / price-only rows; rating-only blocks get the RATING ACTIONS line | CH-5, CH-6 |
| `orchestrate` `_catalystDataMissing` → confidence badge, catalyst fallback row, audit source label | rating-only: LIMITED → MODERATE, "No verified catalysts · MONITORING", `sonar-pro` | CH-10 |
| `orchestrate` `_hasStructuredCatalysts` / `_catalystDirection` (persisted on the result; "CATALYST <dir>" label in the portfolio list; key-risk contradiction guard) | rows that were only price moves no longer count: MGOR live `mixed` → `bearish`; a block of only price rows → no structured catalysts | CH-16 (direction, existence and the key-risk guard) |
| `deriveDataConfidence` `_hasCat` (bullish / bearish / PT) | price-only rows no longer lift the badge to HIGH: HIGH → MODERATE; a block that held only price rows becomes all-none → LIMITED | CH-17 |
| `analyzeChunk` `_detectWeakPerplexity` (`all-none`, `short-raw` counts) | long rating-only replies no longer retry; a **short** reply (< 500 chars) whose only catalyst rows were filler / price-only now counts 0, so the unchanged `short-raw` retry can fire once where it did not before (bounded: one retry per ticker) | CH-9, CH-15 |
| `analyzeChunk` `_retryIsBetter` (counts) | compares counts without the dropped rows; logic unchanged | listed, untested (follows from CH-6 counts) |
| `orchestrate` `item._catalysts` payload (persisted in results) → `renderMainPanel` catalyst rows (cap 5) | the dropped rows are not shown or stored | CH-6 (array contents); rendering listed, untested |
| `_nlmConsistencyChecks` K1 (dates in catalyst strings) | fewer strings to read dates from | listed, untested |
| `_auditTrail.inputs.catalysts` (bullish list copy) | same as `bullishCatalysts` | listed, untested (verbatim copy) |
| `_countSummary`, `_parsedCountsOf`, `_pplxDebug` | memory-only logs / telemetry | listed, untested |

Net retry effect (corrects revs 1–3, which said "retries can only decrease"): fewer `all-none` retries for long rating-only replies; possibly one more `short-raw` retry for short replies whose only catalyst content was filler or price-only rows.

## §2 Exact change (reference `evidence/ch2-apply.py`; 8 anchored edits; `evidence/candidate-index.diff`; E-7 text `evidence/ch2-e7.js`)

| # | Change |
|---|---|
| E-1 (N-5) | In `_isPriceHistoryOnly`, the "closed / traded at <price>" pattern accepts `$`, `₪`, `ILA`, `ILS` or `NIS` before the number (today only `$`) |
| E-2 (N-5) | The date-first pattern gets the same currency parity, plus one new alternative: a row that **starts with a date followed by a dash or colon**, contains a currency price level **and** a `%` move counts as price history. As for every pattern, a row that also names a catalyst term is kept (unchanged rule) |
| E-7a (D-5, rev 4) | Insert the E-7 classifier (exact text in **§A1**) just before `_isPriceHistoryOnly`. For each cue (`after / following / amid / due to / because of / driven by / on the back of / in response to / on news of / that`) it takes the clause that follows — ending at `; : , \| ( [`, a sentence-ending period (not one inside `$2.5B` or `U.S.`), or a following conjunction / cue — and reads its first ten words **by grammatical role**: <ul><li>**(a) clause** `<subject> <past verb>` (regular `-ed` or the closed irregular-past class): an event unless the subject is market description (the market, an index, a market participant, a chart level) or the verb is a price-movement verb with a pronoun subject ("it fell"); passive voice is allowed with the stock as subject ("the stock was downgraded"); a participle cannot head the subject;</li><li>**(b) leading gerund** with a real object ("after losing a key client"), read through an infinitive ("failing to hold its moving average" → its object is the moving average);</li><li>**(c) noun phrase** whose **head** is an occurrence: an event-type noun, a verb-particle noun (`shake-up`, `write-down`), or a derived noun (`-tion -ment -ure -al …`) **anchored** by a noun modifier ("a supply disruption"), a possessive or an actor in its complement ("the departure of two senior executives"); unanchored derived nouns are states ("choppy conditions", "the current environment");</li><li>**(d)** "news / reports / word of X" is read as X.</li></ul>**Market description is a veto wherever it appears** — subject, head, modifier or complement: price action, trading, volume, flows, participants (investors, traders, buyers, sellers, funds …), mood (sentiment, optimism, jitters …), chart levels (highs, support, `200-day` line, patterns …) and times (hours, session, week …) |
| E-7b (D-5, rev 4) | `return !hasCatalyst;` becomes `return !(hasCatalyst \|\| _statedEventCause(t));` |
| E-3 (N-4, D-11) | New constant `_FILLER_RE`, matched against the **whole** list item: `No <specific / significant / notable / major / new / newer / other / additional / recent / clear> [up to 3 words] <catalyst(s) / news / action(s) / development(s) / event(s)> [was / were / has been / have been] [reported / found / identified / available / announced]`, `None reported / found / identified`, or a bare U+2212 run; optional final period. "No Sell ratings …", "No new contracts announced, …" and "No dividend increase this year" do not match |
| E-4 | `_splitList` treats a `_FILLER_RE` item as none: `if (!s \|\| _isNoneVal(s) \|\| _FILLER_RE.test(s)) return false;`. Filler items are not counted in the price-history filter stats |
| E-5 (R-6) | Ticker block: `_allNone` also requires `ratingOnlyActions.length === 0` |
| E-6 (R-6) | `__raw__` fallback: `_allNone = rawActions.length === 0 && _rawAA.ratingOnlyActions.length === 0` |

## §3 QA — new suite `qa/catalyst_hygiene_offline.js`

Extract `parsePerplexityContext` and `formatNewsContext` as `research_ai_context_offline` does; pure Node, vm sandbox, silent console. Prototype: `evidence/ch2-proto.js`.

| Row | Input | Expect |
|---|---|---|
| CH-1 (N-4) | BEARISH `Real risk A (Oct 1) \| No specific downside catalyst reported \| No significant news. \| None reported \| no newer analyst action found`; and `No Sell ratings in one cited analyst set (October 14) \| No new contracts announced, a negative for growth \| No dividend increase this year` | first → `["Real risk A (Oct 1)"]`; second → all 3 kept |
| CH-2 (N-5) | BULLISH `October 13 — MGOR closed at ILA 47,840, up 3.84%[1] \| Shares closed at ₪47.80 \| October 9 — MGOR rose 2.96% to ILA 45,620 while the TA-35 fell 0.69%, showing relative strength[2] \| Oct 2: XYZ rose 3.1% to $45.10`; and `October 9 — Israeli equities declined, with the TA-35 down 0.69% and banking, finance, and insurance sectors leading the weakness[2] \| October 14 — Q3 revenue ₪88M, up 12% on record orders \| Record Q2 2026 results and EPS beat; $27.5 million in new orders[1][2]` | first → `[]`; second → all 3 kept |
| CH-3 (D-5, lock-in) | BEARISH `FROG fell 7.37% to $91.96 on October 14 after a guidance cut, near the 52-week high`; and the live FROG row `… despite UBS's target increase, indicating heavy profit-taking or selling pressure near the 52-week high` | kept (stated catalyst); filtered (cause inferred from price action). Passes today; guards D-5 |
| CH-4 (D-11) | BEARISH `A (Oct 1) \| − \| B (Oct 2)`; and `−5% guidance cut (Oct 3)` | `["A (Oct 1)","B (Oct 2)"]`; kept |
| CH-5 (R-6, D-6) | a block whose only content is `ANALYST_ACTIONS: UBS upgraded to Buy from Neutral (Oct 2)`; the same as `__raw__` prose; an all-NONE block; a PT block | `_allNone` false and `formatNewsContext` contains `RATING ACTIONS (no PT): UBS: upgraded Buy` and not the no-data sentence; `__raw__` false; all-NONE **true** (unchanged); PT block false |
| CH-6 | the 8 live captures (repo fixture) | MSFT#2 `bearishCatalysts` = the EPS-reduction row only; MGOR.TA#7 `bullishCatalysts` = `[]`, `bearishCatalysts` = the P/E row only; the other 6 parse identically to base (truncated sha256 of the canonical parse, recorded at `2dc9c30`: NVDA `7cfd036bfe01f582`, FROG `954ad147283de447`, ENPH `1fb48a32e3a760d8`, QQQ `8609f9c8d3a277f5`, NXSN.TA#6 `e85b78b1064de608`, NXSN.TA#8 `95c72854cb3cecf8`) |
| CH-7 | source text | the `NONE_RE` line is byte-unchanged |
| CH-8 | source text | `analyzeChunk`'s `_NONE_RE_7B3B3` line is byte-unchanged |
| CH-9 (I-1) | `_detectWeakPerplexity` sliced from the real (unchanged) `analyzeChunk` source; a short rating-only block (< 500 chars) and the same block padded past 500 chars | short → `short-raw` (retry allowed, as today); long → `null` (today `all-none`) |
| CH-10 (I-2, rev 3) | the real `deriveDataConfidence`, the exact catalyst-evidence fallback expression and the exact audit `newsContext` expression (each anchor asserted present exactly once and evaluated as written), fed `_catalystDataMissing` from the exact `orchestrate` line; a rating-only block and an all-NONE block | rating-only → badge `MODERATE`, fallback "No verified catalysts · MONITORING", label `perplexity-proxy / sonar-pro`; all-NONE → `LIMITED`, "No catalyst data returned · PERPLEXITY NONE", `perplexity-proxy / no catalyst data` (unchanged) |
| CH-11 (I-3) | each row alone, BEARISH. **Kept (concrete event):** `October 13 — XYZ closed at $45, up 3.8% after the CEO resigned` · `XYZ shares closed at $45 following news of a product recall` · `October 13 — XYZ fell to $45, down 8% after its largest customer filed for bankruptcy` · `XYZ closed at $45 after the board approved a sale` · `XYZ closed at $45 following an SEC probe` · `October 13 — XYZ closed at $52, up 6% after the company announced a takeover bid` · `October 13 — XYZ closed at $45, up 6% after a $2.5B deal with Microsoft` · `XYZ closed at $45 after the U.S. Commerce Department added export curbs`. **Filtered (no event, or the event is outside the clause):** `October 6 — shares were reported at ILA 47,660, down 4.51%, indicating elevated volatility after a sharp pullback[4]` · `XYZ closed at $40, down 5% after hours` · `October 2 — XYZ fell 6% to $30 following a 3-day decline` · `October 9 — XYZ rose 3% to $45 amid weakness` · `October 13 — XYZ closed at $45 after a volatile session` · `October 13 — XYZ up 3% to $45 amid investor concern` · `… amid broad market weakness` · `… amid optimism` · `XYZ closed at $40 after a strong rally` · `… after the index fell 2%` · `XYZ closed at $45 after a quiet session. Separately, the CEO resigned` · `XYZ closed at $45 after a quiet session; the CEO resigned later` · `XYZ closed at $45 after lunch; the CEO resigned later` · **rev 4 state nouns:** `… amid choppy conditions` · `… amid continued downward pressure` · `… amid the current environment` · `… following the absence of any catalyst` · **rev 5 regression:** `October 9 — XYZ rose 3% to $45 amid widespread caution`; **rev 4 kept:** `… after a supply disruption` · `… following the departure of two senior executives` | all 10 kept; all 18 filtered |
| CH-12 (rev 3) | sweep on the prefix `October 13 — XYZ closed at $45, down 6% ` + **20 event phrasings** (named a new CFO, Reuters report, FDA rejected its drug, short-seller report, fire at its plant, added to the S&P 500, missed estimates, government shutdown, hurricane hit its refinery, Q3 sales fell, profit warning, failed a late-stage trial, data breach, exploring a sale, board approved a sale, DOJ probe, merger announcement, cut its dividend, union strike, product recall) + **25 price-action / sentiment / time phrasings** (heavy volume, gap up, short squeeze, opening bell, risk-off sentiment, technical breakout, momentum buying, elevated volatility, 52-week high, market jitters, dead-cat bounce, yesterday's selloff, hit resistance, thin trading, volatile session, investor concern, broad market weakness, optimism, strong rally, index fell 2%, after hours, 3-day decline, profit-taking, choppy week, broader tech slump) | 20 / 20 kept; 25 / 25 filtered |
| CH-13 (rev 4) | the Codex rev-3 counter-examples on the CH-12 prefix: 12 events (product defect, data center fire, losing a key client, customer churn, supply disruption, product failure, CEO resigned, failed drug trial, downgrade, Fed decision, lost a major contract, stake sale) and 11 vague (a market report, strategic weakness, sales weakness, a weak market report, heavy trading volume reports, thin holiday trading and low order flow, broad sell-off, short squeeze, profit-taking, record high, market close) | 12 / 12 kept; 11 / 11 filtered |
| CH-14 (rev 4) | **held-out set 4** (written and hashed before the final rule; run once): prefix `October 15 — DEF dropped 7% to $12.05 ` + 30 events + 30 vague phrasings, listed in §A2 | 27 events kept; the **3 documented misses** (R-7) asserted as filtered; **30 / 30 vague filtered** |
| CH-15 (consumer) | `_detectWeakPerplexity` (real source): a short block whose only catalyst rows are an ILA price row and a filler row; a short block with a real catalyst | `short-raw` (today: no retry); `null` |
| CH-16 (consumer) | the exact `orchestrate` lines for `_hasStructuredCatalysts` / `_catalystDirection` and the exact key-risk contradiction-guard block (anchors asserted once), AI news empty, bias neutral, AI key_risk "No verified catalyst supports the move.", setup `healthy_uptrend`; MGOR live capture; a block of only price rows; a block whose only bullish row is an ILA price row; a block with a real bullish catalyst | MGOR → `true` / `bearish` (today `mixed`); price-only block → `false` / `null`; **key-risk: ILA price-only → key_risk left as written (today the guard replaces it); real catalyst → guard still replaces it with "Follow-through risk despite confirmed catalysts."** |
| CH-17 (consumer) | the real `deriveDataConfidence`; a price-only block with a revision line; a price-only block with nothing else | MODERATE (today HIGH); all-none → LIMITED (today HIGH) |
| CH-N1…N11 | planted negatives on a copy: `_FILLER_RE` check removed; the dated price-move alternative removed; E-5 reverted; the catalyst-term keep removed; the stated-event keep removed; the market veto removed from the noun phrase; the market-participant subject veto removed; derived-noun anchoring removed; the clause boundary removed; any word after a cue counts; `widespread` removed from the adjective class | CH-1 + CH-4; CH-2; CH-5 + CH-9 + CH-10; CH-2; CH-11…CH-14; CH-13; CH-14; CH-11; CH-11; CH-11…CH-14; CH-11 fail |

**Must stay green:**
- `analyst_parser_offline` 57 / 57 (with the §1 AP-13 edits only);
- `analyst_action_coverage_offline` 72 (with the §1 `LIVE_BASE` edits only);
- `research_ai_context_offline` 31 (with the §1 RC-6 edits only);
- `research_parser_hygiene_offline` 18 (unchanged file);
- `no_synthetic_score_offline`, `tase_units_offline`, `news_catalysts_provider_offline`, `index_pins_offline`, `index-pins --check`.

**COWORK sandbox preflight** (`evidence/feasibility.md`, git archive of `2dc9c30`, Linux):
- prototype (rev 5): **17 / 17 rows + 11 / 11 negatives at candidate; 14 rows fail at base** (CH-3, CH-7, CH-8 pass at base by design). The rev-3 candidate fails CH-13 and CH-14; the rev-4 candidate fails only the new CH-11 regression row;
- **E-7 adversarial measurement** (`evidence/feasibility.md` §1): four held-out sets, each written and hashed before the rule version it measures and run once. On the final rule's own held-out set 4: **27 / 30 events kept, 30 / 30 vague filtered** (rev 3 on the same set: 16 / 30 events). Across all 270 phrasings (rev 5): 127 / 130 events kept, 136 / 140 vague filtered — all 4 admissions come from the legacy catalyst-term keep (unchanged, R-9); none from E-7. Rev 4 → rev 5 changes exactly one outcome ("amid widespread caution") across 764 phrasings and the 24 real / fixture texts
- rev 4 vs rev 1 on all 24 real / fixture texts: **identical parse**, so the suite deltas are unchanged; only the pin values move;
- the three landed suites fail at candidate exactly on the listed deltas (AP-13 ×2, AC-8, RC-6) and pass with them;
- corpus replay (24 real / fixture texts with catalyst fields): 6 change, all listed — MSFT and MGOR (N-4 / N-5), three stored context texts parsed as `__raw__` and the AP-13 block (R-6: `_allNone` true → false);
- pin delta: exactly `fileSha256`, `parsePerplexityContext`, `regions.allnone_expr`;
- full `run-offline`: **97 → 98 suites**; the same 17 environment-only failing suites at base and candidate (git / Netlify ESM absent in the sandbox).

## §4 Steps

| Step | Action |
|---|---|
| 0 | §TS; process check → step-0 `qa:offline`; `plan.md` (Gate Verification: N/A — existing parser path; no new execution path, no new I/O) |
| S1 RED | the new suite; CH-1, CH-2, CH-4, CH-5, CH-6 and CH-9…CH-17 fail on the current source |
| S2 GREEN | E-1…E-6, E-7a, E-7b; the §1 suite edits; `--update`; all rows + negatives + must-stay-green pass |
| 8 | Codex round one |
| 10 | process check → full `qa:offline` PASS at step 0 + 1 |
| 11–13 | `review.md` (L9), final Codex, step-13 commit, integrity |
| LAND / PUSH | usual R12 |

**STOP only for:**
- a change outside §1 / §2;
- a suite change beyond the listed deltas;
- a pin delta beyond the three listed values;
- a denied protected action or an integrity FAIL.

## §5 Risks

| # | Risk | Assessment / control |
|---|---|---|
| R-1 | AI output shifts (cleaner catalyst lists; rating lines instead of the no-data sentence) | The intended effect (D-6); no scoring code changes. OD-1 principle |
| R-2 | `_FILLER_RE` drops a real "No …" catalyst | Whole-value match only, with a closed adjective and noun list; real "No …" rows in the corpus are kept (CH-1 second input) |
| R-3 | The dated price-move alternative drops a real dated catalyst | Requires date + dash / colon start, a currency price **and** a `%`; a catalyst term **or a stated concrete event (E-7)** keeps the row (CH-2 second input, CH-11, CH-12, CH-N4, CH-N5) |
| R-4 | Catalyst-term presence is not proof of causality ("fell despite a price target raise" is kept) | Pre-existing rule, unchanged; D-5 forbids inferring a cause from price action, which this does not do. Advisory only |
| R-5 | Retry behaviour shifts (§1a): long rating-only replies no longer retry; a short reply whose only catalyst rows were filler / price-only can now retry once via the unchanged `short-raw` branch | Derived from D-5 / D-6 (such replies carry no catalyst data). Bounded: at most one retry per ticker, as today (CH-9, CH-15) |
| R-7 | **I-3: vague commentary admitted as a cause** | Closed by the rule shape (§2 E-7a) plus the rev-5 correction: 0 / 140 vague phrasings admitted by E-7 (held-out set 4: 0 / 30); Codex's own 7 vague rev-4 examples all filtered. Regression locked by CH-11 / CH-N11 |
| R-7b | **Known limitations (accepted for this task by Main Control, follow-up tracked as F-1):** four conservative false negatives of E-7 — "a breakup of the joint venture" (unhyphenated verb-particle noun), "a downgrade by S&P Global" (index-name collision), "the startup lost its main investor" (market-participant collision), "a review by the FDA" (`review` not an occurrence head; the row is still kept today by the unchanged catalyst-term keep because it names the FDA) | Conservative direction: a price-history row is filtered, no vague row admitted. The first three are asserted in CH-14 so any change is visible |
| R-9 | **Out of scope (Main Control): separate follow-up F-2.** The legacy catalyst-term keep in `_isPriceHistoryOnly` (unchanged, §1 forbids it) matches a term anywhere in the row, so "amid sector-wide declines", "a rotation into defensives", "lingering macro caution" keep a price row (all 4 remaining vague admissions); several of its stems (`upgrad`, `approv`, `acquisit` …) never match because of a trailing `\b`. This task does not claim that broader problem closed | Tracked in `ROLLING-QUEUE.md` (F-2) |
| R-8 | Display labels change for rating-only research (LIMITED → MODERATE badge; "No verified catalysts · MONITORING") | The D-6 intent; display only, no score (CH-10) |
| R-6 | Large price moves without a stated cause (e.g. NXSN "shares fell 24% over four sessions") stay as risk rows | Unchanged today and not a dated price-level row; widening the filter to every price move is a separate product decision |

## §6 Out of scope (recorded)

- **D-13 earnings panel:** `renderMainPanel`'s own none-regex hides "-12% EPS miss" / "Unknown …". Not a dependency of this task → future lane-A task `earnings-panel-none-1` (touches `renderMainPanel`; its frozen-chain couplings are swept there).
- **N-10:** the pre-existing A2 share-price case (D-4).
- Citation markers "[n]": left as source text.

## §A Appendix — exact inputs the Worker needs

### §A1 E-7a text (insert verbatim, LF, immediately before the line `  // 7B-3B1: catalyst quality guard`)

<!-- pep-lint:off -->
<!-- (source code to insert with the Edit tool, not a command) -->
```js
  // catalyst-hygiene-2 E-7 (D-5, rev 4): does a price row state an explicit causal EVENT?
  // The text after a cue word ("after", "amid", "following", …) is cut at the clause end and read by grammatical ROLE, never by
  // matching a word anywhere nearby. An event needs an actor or an occurrence:
  //   (a) a clause "<subject> <past verb>" whose subject is not the market, the stock, a market participant or a chart level;
  //   (b) a leading gerund with a real object ("after losing a key client");
  //   (c) a noun phrase whose HEAD is an occurrence: an event-type noun, a verb-particle noun ("shake-up", "write-down"), or a
  //       derived noun (-tion, -ment, -ure, -al …) anchored to an actor or subject matter (a noun modifier, a possessive,
  //       or an actor in its complement);
  //   (d) "news / reports / word of X" is read as X.
  // Market description — price action, trading, participants, mood, chart levels and times — is never a cause, whether it is
  // the subject, the head, a modifier or the complement of the phrase.
  const _E7_CUE = /\b(?:after|following|amid|due\s+to|because\s+of|driven\s+by|on\s+the\s+back\s+of|in\s+response\s+to|on\s+news\s+(?:of|that))\s+/g;
  const _E7_END = /[;:,|([]|(?<!\b[a-z])\.(?=\s|$)|\s(?:and|but|while|whereas|as|amid|after|following|despite|even\s+as)\s/;
  const _E7_MKT = /^(?:markets?|trading|trades?|sessions?|volumes?|flows?|momentum|volatility|volatile|weakness|strength|rall(?:y|ies)|sell-?offs?|selling|buying|pullbacks?|rebounds?|bounces?|corrections?|consolidation|rotation|speculation|jitters|optimism|pessimism|sentiment|moods?|tone|tape|malaise|risk|risk-off|risk-on|appetite|liquidity|participation|breadth|exposure|positions?|positioning|stocks?|shares?|prices?|index|indices|indexes|nasdaq|dow|s&p|russell|benchmarks?|futures|options|caps|defensives|cyclicals|names|highs?|lows?|peaks?|floors?|records?|resistance|support|levels?|ranges?|averages?|lines?|trendlines?|trends?|uptrends?|downtrends?|patterns?|tops?|bottoms?|close|open|opening|bell|hours|days?|weeks?|weekend|months?|mornings?|afternoons?|holiday|gaps?|squeeze|breakouts?|breakdowns?|technicals?|charts?|profit-taking|profit-booking|slump|surge|slide|declines?|drops?|gains?|moves?|swings?|turmoil|run-up|run|streaks?|fade|reversal|retest|covering|drawdown|ground|valuations?|multiples?|52-week|intraday|year-to-date|ytd|\d+-(?:day|week|month|year)|traders?|investors?|bulls?|bears?|buyers?|sellers?|shorts|longs|funds|dip-buyers)$/;
  const _E7_ACTOR = /^(?:ceo|cfo|coo|chair(?:man|woman)?|founders?|executives?|directors?|board|management|auditors?|regulators?|government|court|judge|jury|fda|sec|ftc|doj|eu|senate|congress|company|firm|partners?|customers?|clients?|suppliers?|unions?|workers|employees|shareholders|creditors|lenders?|banks?|rivals?|competitors?|agency|authorities|officials|ministry|parent|subsidiary|insurers?)$/;
  const _E7_PRON = /^(?:it|they|this|that|these|those)$/;
  const _E7_POSS = /^(?:its|their|his|her|our)$/;
  const _E7_DET = /^(?:the|a|an|its|their|his|her|our|this|that|these|those|some|any|new|recent|latest|two|three|several|key|major)$/;
  const _E7_MOVE = /^(?:rose|fell|gained|dropped|surged|slid|rallied|jumped|climbed|sank|tumbled|plunged|soared|rebounded|dipped|closed|opened|traded|touched|reached|broke|slumped|retreated|advanced|declined|edged|spiked|crashed|gapped|drifted|faded|stalled|bounced|recovered|underperformed|outperformed|lagged)$/;
  const _E7_AMBIG = /^(?:hit|lost|gave|held|extended|added|shed|pared|erased|took)$/;
  // regular past (-ed) plus the closed class of irregular past forms (grammar, not event vocabulary)
  const _E7_PAST = /^(?:[a-z]{2,}ed|went|hit|cut|lost|won|made|said|set|sold|took|gave|bought|began|quit|led|left|paid|shut|split|struck|spent|fell|rose|sank|broke|bid|told|met|ran|grew|withdrew|forecast|chose|put|drove|sent|sought|stood|wrote|fought|froze|hid|swore|bore|tore|undercut|overtook|threw|fled|stole|flew|drew|shook|swung|spun|hung|stuck|caught|brought|kept|felt|dealt|built|lent|shed|spread|upset|cast|cost|hurt|let|undertook|forbade|oversaw|withheld|upheld|overrode|spoke|got|became|came|knew|blew|saw|did|had|found|read|fed|misled|sped|slid|shrank)$/;
  const _E7_AUX = /^(?:was|were|is|are|been|being|got|gets|has|have|had)$/;
  const _E7_PREP = /^(?:of|for|to|in|on|at|by|with|from|over|about|against|into|near|ahead|than|among|under|across|toward|towards|through|off|below|above)$/;
  const _E7_HEAD = /^(?:recalls?|probes?|breach(?:es)?|fires?|strikes?|lawsuits?|suits?|cases?|deals?|defects?|outages?|mergers?|bids?|bans?|wars?|rulings?|verdicts?|reports?|results|earnings|guidance|outlook|forecasts?|targets?|warnings?|offerings?|splits?|buybacks?|dividends?|churn|loss(?:es)?|hacks?|leaks?|crash(?:es)?|collapse|death|explosions?|spills?|layoffs?|shutdowns?|delays?|downgrades?|upgrades?|hikes?|cuts?|tariffs?|sanctions?|embargo(?:es)?|elections?|ceasefires?|storms?|hurricanes?|earthquakes?|floods?|outbreaks?|pandemic|trials?|launch(?:es)?|filings?|orders?|contracts?|wins?|sales?|ouster|exit|takeover|buyout|stake|ipo|scandal|fines?|penalt(?:y|ies)|subpoenas?|indictments?|charges?|default|bankruptcy|fraud|attacks?|cyberattacks?|complaints?|incidents?|derailments?|accidents?|restatement|inquiry|inquiries|approach|walkout|miss|beat)$/;
  const _E7_INFO = /^(?:news|reports?|word|reporting)$/;
  const _E7_PARTICLE = /^[a-z]{3,}-(?:up|down|off|out|in|over|back)$/;     // "shake-up", "write-down", "spin-off"
  const _E7_SUFFIX = /^[a-z-]{3,}(?:tion|sion|ment|ure|ance|ence|age|ship)s?$/;
  const _E7_AL = /^(?:approv|remov|withdraw|dismiss|refus|renew|propos|deni|revers|arriv|disapprov|referr|acquitt|repris)als?$/;
  // adjective-like modifiers (by suffix, including participles in -ed / -ing, plus the closed class of degree / time / tone adjectives) never anchor an event
  const _E7_ADJ = /^(?:[a-z-]+(?:ent|ant|ive|ous|ful|ic|al|ary|able|ible|ed|less|ish|ing)|broad|mixed|weak|strong|soft|firm|calm|quiet|general|overall|modest|sharp|brief|heavy|light|thin|early|late|lukewarm|tepid|muted|slow|fast|big|small|large|high|low|steady|choppy|jittery|nervous|cautious|sluggish|downward|upward|further|fresh|new|recent|current|ongoing|continued|prolonged|sudden|abrupt|surprise|unexpected|widespread)$/;
  const _e7Words = c => c.replace(/\[\d+\]/g, ' ').split(/\s+/)
    .map(w => w.replace(/^[^a-z0-9$&]+|[^a-z0-9%&]+$/g, '')).filter(Boolean).slice(0, 10);
  const _e7Upto = (ws) => { const o = []; for (const x of ws) { if (_E7_PREP.test(x)) break; o.push(x); } return o; };
  const _e7IsEvent = (w, depth) => {
    if (!w.length) return false;
    // (a) "<subject> <past verb>"
    for (let i = 1; i < w.length; i++) {
      if (_E7_PREP.test(w[i])) break;
      if (!_E7_PAST.test(w[i])) continue;
      const passive = _E7_AUX.test(w[i - 1]);
      const subj = w.slice(0, passive ? i - 1 : i).filter(x => !_E7_DET.test(x) && !_E7_AUX.test(x));
      if (!subj.length) break;                                   // "an expanded partnership" is a phrase, not a clause
      if (/ed$/.test(subj[subj.length - 1])) break;             // "elevated put volume": a participle cannot head the subject
      const obj = _e7Upto(w.slice(i + 1));
      if (_E7_MOVE.test(w[i]) && subj.every(x => _E7_PRON.test(x))) return false; // "it fell": the stock's own price movement
      if (_E7_AMBIG.test(w[i]) && obj.some(x => _E7_MKT.test(x))) return false;    // "it gave back early gains", "it lost ground"
      if (passive && !_E7_MOVE.test(w[i]) && !/^(?:off|lower|higher|up|down)$/.test(w[i + 1] || ''))
        return !subj.some(x => _E7_MKT.test(x) && !/^(?:stocks?|shares?)$/.test(x));  // "the stock was downgraded"
      if (subj.some(x => _E7_MKT.test(x))) return false;          // "investors took profits", "the shares retreated"
      return true;                                                // "the CEO resigned", "Q3 sales fell", "the deal closed"
    }
    // (b) leading gerund (checked after the clause test, so "Boeing halted deliveries" is a clause): not market activity; it needs a real object (an article / possessive / number, or an event noun),
    //     and the object is not market description. "failing to hold its moving average" is read through the infinitive.
    if (/^[a-z]{3,}ing$/.test(w[0]) && !_E7_MKT.test(w[0])) {
      const rest = w[1] === 'to' ? w.slice(3) : w.slice(1);
      const obj = _e7Upto(rest);
      if (!obj.length || obj.some(x => _E7_MKT.test(x))) return false;
      return _E7_DET.test(obj[0]) || /^[$\d]/.test(obj[0]) || obj.some(x => _E7_HEAD.test(x) || _E7_ACTOR.test(x));
    }
    // (c) noun phrase: the head is the last word before a preposition; no part of the phrase may be market description
    const np = _e7Upto(w);
    if (!np.length || np.some(x => _E7_MKT.test(x))) return false;
    const head = np[np.length - 1];
    const comp = _E7_PREP.test(w[np.length] || '') ? _e7Upto(w.slice(np.length + 1)) : null;
    if (comp && comp.some(x => _E7_MKT.test(x))) return false;    // "a reversal off the highs", "an absence of buyers"
    // (d) "news / reports / word of X": the event is X
    if (_E7_INFO.test(head) && comp && depth < 1 && /^(?:of|on|about)$/.test(w[np.length])) return _e7IsEvent(w.slice(np.length + 1), depth + 1);
    if (_E7_HEAD.test(head)) return true;
    if (_E7_PARTICLE.test(head)) return true;
    if (!(_E7_AL.test(head) || _E7_SUFFIX.test(head))) return false;
    // derived noun: anchored by a noun modifier ("a supply disruption"), or by a complement that names an actor, carries a
    // possessive or names an event ("the departure of two senior executives", "the withdrawal of its takeover offer")
    const mods = np.slice(0, -1).filter(x => !_E7_DET.test(x));
    if (mods.some(x => _E7_HEAD.test(x) || _E7_ACTOR.test(x) || _E7_SUFFIX.test(x) || !_E7_ADJ.test(x))) return true;
    return !!comp && comp.some(x => _E7_ACTOR.test(x) || _E7_POSS.test(x) || _E7_HEAD.test(x));
  };
  const _statedEventCause = t => {
    _E7_CUE.lastIndex = 0;
    let m;
    while ((m = _E7_CUE.exec(t)) !== null) {
      const rest = t.slice(m.index + m[0].length);
      const end = rest.search(_E7_END);
      if (_e7IsEvent(_e7Words(end === -1 ? rest : rest.slice(0, end)), 0)) return true;
    }
    return false;
  };
```
<!-- pep-lint:on -->

### §A2 CH-14 inputs (held-out set 4; prefix `October 15 — DEF dropped 7% to $12.05 `)

Events (27 kept; 3 documented misses asserted filtered):

- after the lender called in its loans
- after a recall of 400,000 airbags
- following the abrupt cancellation of its flagship project
- after the miner's CEO was arrested
- (documented miss, asserted filtered) after a breakup of the joint venture
- after the company scrapped its buyback
- after the regulator blocked the tie-up
- (documented miss, asserted filtered) following a downgrade by S&P Global
- (documented miss, asserted filtered) after the startup lost its main investor
- after a court froze its assets
- after the agency opened a safety probe
- after the firm restated three years of results
- following the sudden death of its chief executive
- after an explosion shut its refinery
- after it agreed to sell its software unit
- after its biggest client switched suppliers
- after the merger partner walked away
- following a write-down of its goodwill
- after the patent office rejected its application
- after a ransomware attack crippled its systems
- after the government revoked its permit
- after the drug trial was halted early
- after a failed bond sale
- following the collapse of talks with its creditors
- after it slashed its payout
- after the founder stepped down as chair
- after customs officials seized its shipments
- after a bigger rival cut prices
- following a profit warning from its parent
- after the airline cancelled thousands of flights

Vague (all 30 filtered):

- amid an uptick in selling pressure
- after a lackluster showing
- following a disappointing session
- amid widespread risk reduction
- after a sharp reversal off the highs
- amid the persistence of the downtrend
- after a muted response from buyers
- following the breakdown below support
- amid a deterioration in sentiment
- after a failed breakout attempt
- amid a continuation of recent weakness
- after a spike in volatility
- amid an exodus from small caps
- following a quiet stretch of trading
- after the completion of a head-and-shoulders top
- amid broad-based liquidation
- after a pause near resistance
- amid the absence of buyers
- after struggling to find a floor
- amid a reduction in exposure by funds
- following an extended run of losses for the stock
- after a burst of late selling
- amid shifting risk appetite
- after a retest of the lows
- amid deteriorating breadth
- after an inconclusive session
- following the unwinding of crowded positions
- amid a lack of conviction among buyers
- after the shares retreated from their peak
- amid generally weak tape action

## §CMD Command card (one command per Bash call; Bash tool only)

    Command hygiene (three guard-sensitive patterns; a breach is a form denial or STOP-6 per AGENTS.md):
    1. One command per Bash call, exactly as listed below: no &&, ||, ;, pipes, redirects, cd, echo, loops or wrappers.
    2. The land tool's file name appears only in the exact lines of this card - never in a read-only command, a search, or a Codex prompt. Call it "the land tool"; inspect it with Read / Grep.
    3. No inline interpreter code (node -e / -p, python -c, perl -e) whose text contains "git" or "netlify", even in a string or comment. Use Read / Grep / Edit / Write or a listed command.

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
node qa/guard_integrity_check.js --task task/catalyst-hygiene-2 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/catalyst_hygiene_offline.js
node qa/analyst_parser_offline.js
node qa/analyst_action_coverage_offline.js
node qa/research_ai_context_offline.js
node qa/research_parser_hygiene_offline.js
node qa/tools/index-pins.js --check
node qa/tools/index-pins.js --update
node qa/index_pins_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/catalyst-hygiene-2 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/catalyst-hygiene-2
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (prompts):** `git add <explicit §1 paths>`; the read-only process listing before each heavy run; `node qa/tools/index-pins.js --diff <base>`; `codex exec --sandbox read-only <prompt>`.
- **C (Owner):** R11; LAND; PUSH.

<!-- land-scope:begin -->
index.html
qa/fixtures/index-pins.json
qa/catalyst_hygiene_offline.js
qa/analyst_parser_offline.js
qa/analyst_action_coverage_offline.js
qa/research_ai_context_offline.js
work/catalyst-hygiene-2/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/catalyst_hygiene_offline.js
node qa/analyst_parser_offline.js
node qa/analyst_action_coverage_offline.js
node qa/research_ai_context_offline.js
node qa/research_parser_hygiene_offline.js
node qa/index_pins_offline.js
<!-- land-tests:end -->
