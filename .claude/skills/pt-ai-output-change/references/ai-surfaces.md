# AI surfaces — map by function name

Every surface is named by its function in `index.html`. **Verify each name with Grep at your
task's baseline before relying on it; line numbers are never stored here.** "Feeds" says what the
function's text reaches; "Consumers" says who reads the result afterwards.

| # | Function | Surface | Feeds | Consumers / downstream readers |
|---|---|---|---|---|
| 1 | `fetchAnthropicAnalysis` | the scan prompt: system text, output-format rules, the `TECHNICAL SETUP GATING` block (one line per setup name → allowed actions, plus the explanatory note that forbids calling the 1Y high an all-time high — a prohibition line, asserted as an exact string and excluded from banned-term scans by that anchor), the research section built per ticker, the data section, the `Summary MUST end: "Rating: …"` instruction | the main scan's AI call | `analyzeChunk` (parse), `orchestrate` (overrides), every `RATING_SUMMARY_RE` consumer (row 9), persisted `pt_results` |
| 2 | `buildTechSnapshotBlock` | the deterministic technical block sent with the prompt: `[setup: <enum> = <display>]`, MA20 / MA50 / MA150 distances, `1Y High Dist`, volume ratio, relative strength | `fetchAnthropicAnalysis` (as `techSnapshotText`) and `_dd0FetchAnalysis` | the AI's technical wording; `tech_snapshot_cache` and `high1y_label` suites pin and assert it |
| 3 | `formatNewsContext` | the research context per ticker: `ANALYST ACTIONS`, `REVISION DIRECTION`, `EARNINGS`, `BULLISH`, `BEARISH`, `MACRO`, `SOURCES`, and the explicit unavailable lines ("No research data …", "No catalyst, analyst, earnings, or revision data …") | `fetchAnthropicAnalysis`; mirrored into `_pplxDebug[sym].formattedNewsContext` | the AI's catalyst and analyst wording; `enforceScoreConsistency` (reads the news context string) |
| 4 | `formatStockContext` | the live market-data block: price, change, open, previous close, intraday high / low, volume, the "do not infer lows" note, or empty when no data | `analyzeChunk` → `fetchAnthropicAnalysis` (`context`) | the AI's price wording; the data-section fallback text when empty |
| 5 | `fetchPerplexityContext` | the research query (window, `TICKER:`, `ANALYST_ACTIONS:` and the other labelled lines the parser expects) and the request shape | the research provider call | `parsePerplexityContext` (the parser contract — owned by the analyst-parser suite, referenced here, not restated), then row 3 |
| 6 | `_dd0FetchAnalysis` | the Deep Dive context: `TICKER`, `COMPANY`, `SENTIMENT`, `SENTIMENT SCORE`, `EXISTING SUMMARY`, `TECHNICAL SETUP: <enum> (<display>)`, `NEWS BIAS`, `NEWS`, `ALERTS`, `TECHNICAL SNAPSHOT` | the Deep Dive AI call | the Deep Dive card; `deep_dive_v0` suite sandbox list |
| 7 | `analyzeChunk` (parse and fallback path) | parsing the AI JSON, the retry, and the AI-failure fallback item (`summary` = the "AI analysis unavailable — market data shown only …" text, `_aiUnavailable`) | the result objects | `orchestrate`, `enforceScoreConsistency` (skips boosts for `_aiUnavailable`), the data-quality banner in `renderMainPanel`, persisted `pt_results` |
| 8 | `orchestrate` and `enforceScoreConsistency` | deterministic post-AI overrides: setup written from the deterministic classification, the `extended_near_ath` score clamp, the `_auditTrail` (incl. `sourceTrace`), the news-driven score nudges and their skip rules | the final result objects | every display of `sentiment_score`, `technical_setup` and the audit chips; `pt_results` |
| 9 | `RATING_SUMMARY_RE` readers: `_srGroupResults`, `_srRenderGrouped`, `openScanResultsOverlay`, `renderMainPanel` (the dial), `_renderPortfolioPanel` | AI-text-derived labels: the `Rating: Buy / Neutral / Sell` tail of the summary parsed into a rating | Scan Results grouping and rows, the overlay, the main-panel dial, the portfolio panel (Daily Review) | any change to the prompt's `Rating:` instruction (row 1) or to the regex reaches all five; `renderMainPanel` also uses `Rating:` as a section terminator and strips it from the Actionable Take strip |
| 10 | `_setupDisplay` and the `_tsAssessMap` literal in `renderMainPanel` | enum → display wording for `technical_setup` (the `*_near_ath` names are shown as "near 1Y high") | rows 2, 6 and the main panel | the setup rows in the panel; `high1y_label` and `tech_snapshot_cache` assert the wording |

## Consumer note — the `*_near_ath` setup names

The enum values `extended_near_ath` and `healthy_uptrend_near_ath` are computed from 1Y candles.
Every surface that shows or sends them must use the 1-year-high wording through `_setupDisplay`
(rows 2, 6, 10) and the gating block's explanatory note (row 1). The Scan Results group name and
the main-panel assessment text are display consumers of the same enum; a wording change to one
surface without the others is label drift.

## Using the map

1. For the brief's change, mark every row the change reaches (text, enum, field or regex).
2. Grep each function name at the baseline; confirm the surface still lives there.
3. List the consumers of each marked row in the consumer-impact note; a consumer the brief does
   not cover is a STOP condition.
4. Hand the pinned rows to `pt-offline-suite` for the coupling sweep (rows 2, 8, 9 and 10 are
   pinned or extracted by existing suites).
