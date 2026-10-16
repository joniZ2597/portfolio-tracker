# Task brief: ai-request-hygiene-1 — AI output cap 2,500 with per-attempt telemetry; clean price block (G-1); P-5 timeout above the proxy

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL-DRAFT rev 3, HELD — NOT R11-ready** (COWORK, 2026-10-17). Built on `branch-dev` = `origin/branch-dev` = `0903940` (`evidence-memory-1` S1 landed; every file this task reads or edits is unchanged since `d5a03fe`). Main Control decisions applied: **D-7** (G-1 grouped here with distinct QA), **D-18a** (P-5 client timeout 52 s), **D-18b** (`n/a` for an invalid or missing price, volume or change %). Prepared under the Task-Specific Risk & Test Design practice (§RT). **Rev 2** closes the 3 Class I findings of Codex review #1 (verdict preserved in `shared-reports/codex/2026-10-16_ai-request-hygiene-1-review.md`, NOT READY): the telemetry store is bounded in tickers as well as attempts (least recently written dropped at 100); the P-5 test ceiling is the 60 s platform limit; the response status is read inside the telemetry `try` (hostile-response rows). Advisories applied: record fields stated, `$1.00` rounding listed, `p5_call1_offline` sweep row. **Rev 3** closes the one narrow Class I of re-check #2 (verdict preserved there): the telemetry store is a `Map`, so "least recently written" holds for every key form (a plain object lists digit-only keys first); HY-6 adds a digit-only row and a rewrite-while-stored row (N15). Rev 1 / rev 2: `rev1/`, `rev2/`; deltas `evidence/rev2.diff`, `evidence/rev3.diff`. **Remaining before R11:** Main Control's ruling on re-check #2 (accept Rev 3 as is, or a third focused Codex check — both pre-authorized runs are used), then acceptance of the final hash.

| | |
|---|---|
| Problem | <ul><li>**G-2:** normal-scan Haiku replies run at 1,180–1,800 of the 1,800-token cap; NVDA was cut once (the retry recovered). Nothing records `stop_reason` or token use, so truncation is invisible.</li><li>**G-1:** the AI price block sends `Open: $NaN`, unrounded closes (`$221.3000030517578`) and `Prev Close: $0` (the Yahoo "unavailable" fallback) on live tickers; a missing volume throws.</li><li>**P-5 note:** `P5_CALL2_TIMEOUT_MS = 28000` says "> proxy 25s", but the proxy now waits 50 s, so the client aborts first and a real 504 never surfaces.</li></ul> |
| Objective | The scan requests up to 2,500 output tokens; every attempt's `stop_reason` and token use is kept in memory; the price block shows only valid values (`n/a` otherwise) without float noise; the P-5 client waits just longer than the proxy. Prompt text, output schema, retry logic, scoring and persistence are unchanged |
| Source | `shared-reports/deploy/2026-10-16_N1-dev-validation.md` (G-1, G-2; **Check B:** one controlled DEV call with `max_tokens` 2,500 → 30,159 ms, HTTP 200, 2,500 output tokens); `shared-reports/research/2026-10-16_haiku-timeout-netlify-assessment.md`; `anthropic-proxy-timeout-1` (LANDed `2dc9c30`: proxy `TIMEOUT_MS` 50,000) |
| Decisions | Option B approved (cap after the proxy timeout); D-7; **D-18a** 52 s; **D-18b** `n/a` for invalid / missing price, volume and change % (Main Control, 2026-10-16). Derived from D-18b: a price is valid only as a finite number **> 0** (a 0 is the providers' "unavailable" fallback, l. 5399); volume as a finite number ≥ 0; change % as any finite number (0 % and 0 volume are real values) |
| Backlog | none. No `BACKLOG.md` edit |
| Depends on | nothing open (`anthropic-proxy-timeout-1` LANDed; Check B PASSED) |
| Baseline / start (§TS) | Start at the current tip T. Valid only if all hold; otherwise HOLD: <ul><li>`index.html` = `c98e6d501e9aff38272f465b93e38e95892e3f07` (every §2 anchor exactly once; unchanged from `d5a03fe` to `0903940`);</li><li>`qa/tase_units_offline.js` = `e722af99ead825452b321c403268e3cff629fc46`;</li><li>`qa/fixtures/index-pins.json` = `edf65a2e891aba4226de7e7c0a613538e196ad69`;</li><li>`netlify/functions/anthropic-proxy.js` = `39329aaed2dc3f719c0bb35a3b451dfe2b274428` (read by HY-2 / HY-10);</li><li>`qa/lib/index-pins-core.js` = `a8ae73317d65aa43129b9fe41aa09f4c34d5e888`;</li><li>`qa/ai_request_hygiene_offline.js` does not exist.</li></ul>Any tip on which all of these blobs match is valid (true at `0903940`) |
| Branch / slot / mode | `task/ai-request-hygiene-1` · **Worker A** · **Manual** (changes the AI request and what the AI receives) |
| qa:offline | step-0 count **+1** (`qa/ai_request_hygiene_offline.js`; 99 → 100 at `0903940`; auto-discovered; the runner stays forbidden) |
| Parallel with | Worker B (lane B: `services/` / `qa/` new files): no shared file. One heavy QA run at a time |
| Skills | none required |
| Scoring boundary | No change to `analyzeChunk`, `orchestrate`, `enforceScoreConsistency`, `_techCache`, `parseJSON`, `repairJSON`, the prompt text, the output schema, the retry block or any persisted shape (HY-11 digests). Telemetry is never read by scoring, rendering or persistence |
| Gate verification | N/A: no new execution path, endpoint or I/O; the edits change values on existing paths. Telemetry is passive memory, written only when the existing call runs |

## §1 Files (exactly)

- `index.html` — five anchored edits (exact old / new text: **§A1**), inside `fetchAnthropicAnalysis` (cap constant, telemetry helper, two telemetry calls), `formatStockContext` (`_fin`, `chg`, `_usd`, `_px`, `_vol`) and the one top-level line `var P5_CALL2_TIMEOUT_MS`
- `qa/fixtures/index-pins.json` — `node qa/tools/index-pins.js --update`; exactly **four** values change: `fileSha256`, `remainderSha256`, `functions.fetchAnthropicAnalysis`, `functions.formatStockContext`
- `qa/tase_units_offline.js` (blob `e722af99…`) — exactly four anchored edits (**§A3**): the US-oracle comment, the US oracle line (`$225.1` → `$225.10`, `$224.6` → `$224.60`, `$227.5` → `$227.50`, `$224.9` → `$224.90`), the `fetchAnthropicAnalysis` base digest (→ `b2497a24…52b2`), the NEG-7 anchor (moved to the new `_px` line, same mutation). Any other change to this suite is a STOP
- `qa/ai_request_hygiene_offline.js` (new) — exact text **§A2**
- `work/ai-request-hygiene-1/review.md`

**Forbidden:** every other function and line of `index.html` — in particular `analyzeChunk` (its retry block and the comment "no max_tokens change" stay as they are), `orchestrate`, `parseJSON`, `repairJSON`, `formatNewsContext`, `buildTechSnapshotBlock`, `renderMainPanel`, `_p5RequestSynthesis`, `_dd0FetchAnalysis`, `runAnalysis`, the market-data fetchers; `netlify/**`; `qa/run-offline.js`; every other `qa/` file; `package*.json`; `.claude/**`; `AGENTS.md`; `CLAUDE.md`; `BACKLOG.md`.

## §1a Consumer sweep (every reader of a changed value)

Changed values: (1) the scan request's `max_tokens`; (2) a new memory-only `window._aiReqDebug`; (3) the text of `formatStockContext`; (4) `P5_CALL2_TIMEOUT_MS`. Found by searching `index.html`, `netlify/functions/anthropic-proxy.js` and `qa/` for each symbol and for every `anthropic-proxy` caller.

| Reader | Effect | Assertion |
|---|---|---|
| `anthropic-proxy` (`Math.min(body.max_tokens \|\| 1000, 4000)`, `TIMEOUT_MS` 50,000) | 2,500 passes the clamp; a full 2,500-token reply (30.2 s on DEV) ends 20 s before the proxy aborts | HY-2 (values read from the proxy source) |
| Scan call site + its single retry in `analyzeChunk` (l. 7044, 7068; `BATCH_SIZE = 1`, sequential) | both attempts request 2,500; fewer cut replies → fewer parse-empty retries; the retry logic is unchanged | HY-1, HY-3 |
| Scan fetch: client timer | none exists on this call (only P-5 call 2 and the ping have one) | HY-2 |
| Other `anthropic-proxy` callers: P-5 call 2 (700 tokens), Deep Dive `_dd0FetchAnalysis` (Sonnet, 1,200), ping (15 s) | unchanged | HY-1, HY-11 |
| `window._aiReqDebug` | new; read by nothing in the app (console / DEV diagnosis only); never persisted, rendered or sent; same pattern as `window._pplxDebug`; bounded at 4 attempts × 100 tickers | HY-4, HY-5, HY-6 |
| `qa/p5_call1_offline.js` (pins the P-5 call-1 request, 1,200 tokens, a different call) | does not read `fetchAnthropicAnalysis`, `formatStockContext` or `P5_CALL2_TIMEOUT_MS`; unaffected | sandbox PASS (Codex #1 advisory) |
| `formatStockContext` → AI prompt "VERIFIED PRICE DATA" (l. 6884 → `fetchAnthropicAnalysis`) | prices without float noise; `n/a` where a value is invalid or missing (incl. `Prev Close: $0`); `(N/A)` for a missing change % becomes `(n/a)` (D-18b) | HY-7, HY-8, HY-9 |
| `formatStockContext` other readers | none (the only call site is l. 6884) | search result |
| `qa/tase_units_offline.js` TU-5 (US oracle), TU-8 (base digest), NEG-7 (anchor) | expected deltas, §1 / §A3 | suite PASS (9 rows, 10 negatives) |
| Pin-map suites: `no_synthetic_score`, `high1y_label`, `pulse_analyst_view`, `index_pins` | compare against the committed map → green after `--update` | sandbox PASS |
| Suites that only extract `fetchAnthropicAnalysis` text (`narrative_consistency`, `research_ai_context`) | unaffected | sandbox PASS |
| `anthropic_proxy_timeout_offline` AT-6 (its own fixture body with 1,800), `deep_dive_v0` (≤ 1,500 for Sonnet), `p5_call2_offline` (does not pin 28,000) | unaffected | sandbox PASS |
| `P5_CALL2_TIMEOUT_MS` → `AbortSignal.timeout` (l. 3704) → reason `timeout` vs `http-<status>` | a slow upstream now ends as the proxy's `http-504` (52 s) instead of a client `timeout` (28 s) | HY-10 |
| Scan duration / cost | worst case per ticker: 2 attempts × ~30 s and 2 × 2,500 output tokens; typical replies (1,180–1,800 tokens) unaffected | listed, untested (measured by E-2 on DEV) |

## §2 Exact change (exact text §A1; reference `evidence/ah1-apply.py`, five anchors, each exactly once)

| # | Change |
|---|---|
| E-1 (G-2) | `fetchAnthropicAnalysis`: `const _AI_MAX_TOKENS = 2500;` and the request body uses `max_tokens: _AI_MAX_TOKENS` (was the literal 1800). Model, system, messages unchanged |
| E-2 (G-2) | `fetchAnthropicAnalysis`: a local `_aiTel(response, data)` helper, called once on the non-OK path (before the existing error handling) and once after the reply is parsed. **Everything it reads — including `response.status` — is read inside its `try / catch`**, so it cannot throw into the scan. It appends `{ at, status, maxTokens, stopReason, inputTokens, outputTokens }` (time, HTTP status, the requested cap, stop reason, token counts; nothing else) to `window._aiReqDebug[<ticker>]`, keeping the **last 4 attempts** per ticker (a cut reply and its retry are always the latest pair) and the **last 100 tickers** (the least recently written ticker is dropped). The store is a **`Map`** (true write order for every key, including digit-only symbols); a non-`Map` value is replaced. Numbers are kept only as non-negative integers, `stopReason` only as a string (≤ 40 chars), else `null`. Returns early when there is no `window`; never persisted, rendered or sent |
| E-3 (G-1, D-18b) | `formatStockContext`: `_fin` (finite number); `chg` → `n/a` unless finite; `_px` → `n/a` unless a finite number > 0, otherwise `.TA` exactly as before (`(v / 100).toFixed(2) + ' ILS'`) and USD as `$` + `_usd(v)` (2 decimals from $1; below $1 `toFixed(4)` with up to two trailing zeros trimmed); `_vol` → `toLocaleString()` of a finite number ≥ 0, else `n/a`. Valid change % and volume print exactly as before |
| E-4 (P-5, D-18a) | `var P5_CALL2_TIMEOUT_MS = 52000;` with the comment "> proxy 50s (anthropic-proxy TIMEOUT_MS) and < Netlify's 60s limit, so a real 504 surfaces" |

## §3 QA — new suite `qa/ai_request_hygiene_offline.js` (exact text §A2)

Runs the **real** `fetchAnthropicAnalysis` in an isolated `vm` context (stubbed `fetch`, spy objects for storage and `document`) and the real `formatStockContext`. Expected values come from §RT, never from the edited code's own output; two base constants (rendered-prompt digest, protected-function digests) were computed at `d5a03fe`.

| Row | Checks |
|---|---|
| HY-1 | first attempt and retry send `max_tokens: 2500` (number) and the unchanged model; Deep Dive 1,200 and P-5 700 unchanged |
| HY-2 | proxy clamp ≥ 2,500 and proxy timeout > 30,159 ms (read from the proxy source); no timer / signal on the scan fetch |
| HY-3 | a cut reply (`stop_reason: max_tokens`) returns exactly the text it returns when ending normally; `analyzeChunk`, `parseJSON`, `repairJSON` byte-identical to `d5a03fe` |
| HY-4 | no storage / `document` / `indexedDB` access, one proxy request per call, returned text and the 504 error unchanged |
| HY-5 | cut reply + good retry → two records for the ticker, `max_tokens` then `end_turn`, with their token counts and the exact key set |
| HY-6 | 10 reply shapes (no `usage`; string / NaN / negative / non-object `usage`; `stop_reason` absent / non-string; HTTP 504; 401 without message; JSON without `content`; non-JSON body) × 6 windows (none, plain, junk store, junk entry, throwing property, throwing proxy) **and a response whose `status` getter throws**: the outcome (value or error) is identical in every case; recorded values valid or `null`; 6 attempts keep the last 4; tickers separate; **a ticker rewritten while stored moves to most recent; beyond 100 the least recently written is dropped; a digit-only symbol (`10`) keeps write order** |
| HY-7 | `n/a` for 12 bad price inputs × 4 fields (incl. `0`, `-5`, `'91.2'`), 7 bad change % inputs, 8 bad volume inputs |
| HY-8 | 11 USD cases (`221.3000030517578` → `$221.30`, `91.9` → `$91.90`, `1e6`, `0.5` → `$0.50`, `0.0345` → `$0.0345`, `0.99999` → `$1.00` …); the whole block for a normal row; valid change % (`-1.23456%`, `+0%`) and volume `0` unchanged; empty map → `''` |
| HY-9 | `.TA` block byte-identical; 6 finite agorot values equal the previous rule `(v / 100).toFixed(2)`; 5 invalid values → `n/a` |
| HY-10 | `P5_CALL2_TIMEOUT_MS` = 52,000, > proxy `TIMEOUT_MS`, **≤ 60,000** (platform limit); comment names 50 s, not 25 s |
| HY-11 | rendered request: system + messages + model digest equals `d5a03fe`; body keys exactly `max_tokens, messages, model, system`; 16 protected functions byte-identical to `d5a03fe` |
| HY-N1…N15 | cap 1800 · Deep Dive cap raised · telemetry to `localStorage` · retry overwrites · telemetry not contained · `n/a` guard removed · flat `toFixed(2)` · USD rounding in the `.TA` branch · P-5 50,000 · a 0 price accepted · volume guard removed · **P-5 61,000** · **ticker bound removed** · **status read outside the helper** · **rewritten ticker not moved to most recent** — each makes its named rows fail |

**Must stay green (unchanged):** every existing suite; `tase_units` with the §A3 deltas; `index-pins --check` after `--update`.

**COWORK sandbox preflight** (git archive of `0903940`, Linux, node 22; edits applied from §A1 / §A3 by replaying the brief text):
- New suite **11 / 11 rows, 15 / 15 negatives PASS** (≈ 3 s). On the unmodified base the requirement rows fail (HY-1, HY-5…HY-10) and the invariant rows pass (HY-2, 3, 4, 11). The rev-1 edit fails HY-6 (hostile status, unbounded tickers); the rev-2 store logic, run on the digit-only scenario, keeps the oldest ticker and drops the newest (`10`) — the rev-3 `Map` drops the oldest.
- `tase_units` 9 / 9 with its negatives; `no_synthetic_score`, `high1y_label`, `pulse_analyst_view`, `index_pins`, `narrative_consistency`, `research_ai_context`, `p5_call2`, `anthropic_proxy_timeout`, `deep_dive_v0` PASS; `index-pins --check` OK after `--update` (exactly the four listed values).
- Full `run-offline` at `0903940`: **99 → 100 suites**, the **same 17** environment-only failing suites as the pristine tip; Phase 3 scans PASS.

## §RT Risk & Test Design (Main Control practice; spec-first matrix `risk-test-design.spec-first.md`, sha256 `a8fc4a63…4a63`, written before the code was read)

**Task type:** API request + numeric display formatting. Rows marked ★ were added by the code review that challenged the spec-first matrix; † by this FINAL-DRAFT's sweep and held-out probe.

| Requirement | Failure mode | Test | Expected |
|---|---|---|---|
| Cap 2,500 on every scan attempt | other call sites changed; string value; model changed | HY-1, HY-N1, HY-N2 | number 2500 on both attempts; others unchanged |
| ★ 2,500 fits every limit | clamp < 2,500; client timer < ~35 s | HY-2 | clamp 4,000; no client timer; 50 s > 30.2 s |
| Truncation handling unchanged | cut reply parsed differently | HY-3 | same text; retry / parse functions identical |
| Telemetry memory-only | storage / DOM / network writes | HY-4, HY-N3 | none |
| ★ Each attempt kept | retry overwrites the cut attempt | HY-5, HY-N4 | 2 records, `max_tokens` then `end_turn` |
| Telemetry never changes behaviour, bounded | throws on odd replies, hostile `window` **or a hostile response**; unbounded **in attempts or tickers**; **eviction order wrong for some key forms** | HY-6, HY-N5, HY-N13, HY-N14, HY-N15 | identical outcome; ≤ 4 per ticker, ≤ 100 tickers, true write order |
| D-18b invalid / missing → `n/a` | NaN, `undefined`, strings, † **`0` price** (provider fallback) | HY-7, HY-N6, HY-N10, HY-N11 | `n/a` |
| USD without float noise, no information lost | ★ sub-$1 digits lost; non-price fields reformatted | HY-8, HY-N7 | 2 decimals; < $1 up to 4; change % / volume unchanged |
| ★ `.TA` unchanged for valid values | rounding leaks into ILS | HY-9, HY-N8 | previous rule exactly; invalid → `n/a` |
| D-18a P-5 above the proxy | ≤ 50 s; > 60 s; stale comment | HY-10, HY-N9, HY-N12 | 52,000 |
| Out of scope unchanged | prompt, schema, retry, scoring edited | HY-11 | digests equal `d5a03fe` |

**Self-review findings (resolved before Codex):**
- ★ The retry calls the same function, so a single per-ticker slot would lose the cut attempt → per-attempt records (HY-5).
- ★ Without touching the protected `analyzeChunk`, `fetchAnthropicAnalysis` cannot see a new scan → a bounded ring of the last 4 attempts, each time-stamped, instead of "replace per scan".
- † Yahoo's `previous_close` falls back to `0` (l. 5399) → a price is valid only when > 0 (derived from D-18b).
- † The base throws on an `undefined` volume (`toLocaleString`); producers emit `NaN`, not `undefined`, so this was latent; the guard removes it.
- † Two expected values in the first suite draft were wrong (not the code): `0.99999` → `$1.00` (trailing zeros trimmed), and `.TA` must equal the previous rule including float rounding (`8884.5` → `88.84 ILS`). Fixed in the test oracle.

**Untested risks / justified exclusions:**
- Cost and scan time at 2,500: measured on DEV through E-2 after LAND (the cap only removes truncation; typical replies are unchanged).
- Whether the model uses the extra room: DEV observation via E-2.
- A positive price below $0.00005 prints `$0.00` and a price ≥ $1e21 prints in exponent form: impossible for listed equities (minimum tick $0.0001); not handled.
- A price just below $1 that rounds up at 4 decimals (e.g. `0.99999`) prints `$1.00` (Codex #1 advisory); accepted.
- Change % is not rounded (outside G-1 / D-18; its values come pre-rounded from the providers).

## §4 Steps

| Step | Action |
|---|---|
| 0 | §TS; process check → step-0 `qa:offline`; `plan.md` (CLAUDE.md preflight: Pattern Auditing — `window._pplxDebug` memory-only telemetry in `analyzeChunk` and the 7B-4b rollup; `formatStockContext`'s existing `.TA` branch. State & Boundary Isolation — no `localStorage`, DOM or scoring change (HY-4, HY-11). Gate Verification — N/A, no new path. Definition of Done — §5) |
| S1 RED | `qa/ai_request_hygiene_offline.js` (§A2): HY-1 and HY-5…HY-10 fail on the current source |
| S2 GREEN | §A1 edits; §A3 edits; `node qa/tools/index-pins.js --update` (exactly the four §1 values); all rows + negatives + must-stay-green pass |
| 8 | Codex round one (diff review) |
| 10 | process check → full `qa:offline` PASS at step 0 + 1 |
| 11–13 | `review.md` (L9), final Codex, step-13 commit, integrity |
| LAND / PUSH | usual R12 |

**STOP only for:** a change outside §1 / §2; a suite change beyond §A3; a pin delta beyond the four listed values; any existing suite failing; a denied protected action or an integrity FAIL.

**After LAND (DEV, separate Owner approval):** one normal scan of 3 tickers; read the `Map` `window._aiReqDebug` in the console with `window._aiReqDebug.get('<ticker>')` (stop reasons, output tokens) and the price block in the request; record in the DEV validation report.

## §5 Definition of Done

1. HY-1…HY-11 and HY-N1…HY-N15 pass; `tase_units` passes with the §A3 deltas; `index-pins --check` OK; `qa:offline` PASS at step 0 + 1.
2. The scan request carries `max_tokens: 2500`; the `Map` `window._aiReqDebug` holds, read with `window._aiReqDebug.get('<ticker>')`, the last ≤ 4 attempts for at most 100 tickers; the price block prints `n/a` for invalid or missing price, volume and change %; `P5_CALL2_TIMEOUT_MS` = 52,000.
3. No file or function outside §1 / §2 changes (HY-11).

## §6 Risks

| # | Risk | Control |
|---|---|---|
| R-1 | Longer replies cost more and take longer (≤ 2 × 30 s per ticker in the worst case) | Only cut replies grow; Check B proved 30.2 s < 50 s; E-2 measures it on DEV |
| R-2 | The AI sees `n/a` / `(n/a)` where it saw `$NaN`, `$0` or `(N/A)` | Intended (G-1, D-18b): an explicit `n/a` replaces values that looked like data (`$0`, `$NaN`); post-LAND DEV scan reads the request |
| R-3 | Telemetry on `window` is visible to any script on the page | It holds only time, HTTP status, the requested cap, stop reason and token counts — no prompt, reply, key or holding; bounded at 4 × 100 records |
| R-4 | A slow P-5 call now waits up to 52 s instead of 28 s | Intended (D-18a): the proxy's 504 now reaches the user instead of a client timeout |

## §A Appendix — exact inputs the Worker needs

<!-- pep-lint:off -->
<!-- (text to apply with the Edit / Write tools, not commands) -->

### §A1 `index.html` — the five edits (Edit tool: replace each OLD, which occurs exactly once, with NEW; LF; every line is literal text — a `\n` shown inside a template literal is the two characters backslash + n already in the file). Reference script: `evidence/ah1-apply.py`

#### A1.1 — E-4 `P5_CALL2_TIMEOUT_MS` (one line)

OLD (exactly once):

~~~~text
var P5_CALL2_TIMEOUT_MS = 28000;                 // > proxy 25s and Netlify's 26s ceiling, so a real 504 surfaces
~~~~

NEW:

~~~~text
var P5_CALL2_TIMEOUT_MS = 52000;                 // > proxy 50s (anthropic-proxy TIMEOUT_MS) and < Netlify's 60s limit, so a real 504 surfaces
~~~~

#### A1.2 — E-3 `formatStockContext`: `_fin` and `chg` (replaces the `chg` line)

OLD (exactly once):

~~~~text
    const chg = isNaN(d.change_percent) ? 'N/A' : (d.change_percent >= 0 ? `+${d.change_percent}%` : `${d.change_percent}%`);
~~~~

NEW:

~~~~text
    // ai-request-hygiene-1 (G-1, D-18): an invalid or missing price, volume or change % prints n/a. A price is valid only
    // as a finite number > 0 (a 0 is the providers' "unavailable" fallback); volume as a finite number >= 0; change % as any
    // finite number. USD prices print 2 decimals (up to 4 below $1) instead of raw float noise; .TA stays agorot -> ILS.
    const _fin = v => typeof v === 'number' && Number.isFinite(v);
    const chg = !_fin(d.change_percent) ? 'n/a' : (d.change_percent >= 0 ? `+${d.change_percent}%` : `${d.change_percent}%`);
~~~~

#### A1.3 — E-3 `_usd`, `_px`, `_vol` (replaces the `_px` line)

OLD (exactly once):

~~~~text
    const _px = v => (_ta && typeof v === 'number' && isFinite(v)) ? (v / 100).toFixed(2) + ' ILS' : `$${v}`;
~~~~

NEW:

~~~~text
    const _usd = v => (v >= 1 ? v.toFixed(2) : v.toFixed(4).replace(/0{1,2}$/, ''));
    const _px = v => !(_fin(v) && v > 0) ? 'n/a' : (_ta ? (v / 100).toFixed(2) + ' ILS' : '$' + _usd(v));
    const _vol = (_fin(d.volume) && d.volume >= 0) ? d.volume.toLocaleString() : 'n/a';
~~~~

#### A1.4 — E-3 the Volume line

OLD (exactly once):

~~~~text
      `  Intraday High: ${_px(d.high)} | Intraday Low: ${_px(d.low)} | Volume: ${d.volume.toLocaleString()}\n` +
~~~~

NEW:

~~~~text
      `  Intraday High: ${_px(d.high)} | Intraday Low: ${_px(d.low)} | Volume: ${_vol}\n` +
~~~~

#### A1.5 — E-1 + E-2 `fetchAnthropicAnalysis`: cap, telemetry helper, request, two telemetry calls

OLD (exactly once):

~~~~text
  const response = await fetch('/.netlify/functions/anthropic-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1800, system: system, messages: [{ role: 'user', content: user }, { role: 'assistant', content: '{' }] })
  });
  if (!response.ok) { const err = await response.json(); throw new Error('Anthropic: ' + (err.error?.message || 'API error')); }
  const data = await response.json();
~~~~

NEW:

~~~~text
  // ai-request-hygiene-1 (G-2): output cap 2,500 (proven on DEV: 2,500 tokens in 30.2 s < the 50 s proxy timeout).
  const _AI_MAX_TOKENS = 2500;
  // E-2: memory-only telemetry of every attempt (first call and retry), mirroring window._pplxDebug. Never persisted,
  // never rendered, never sent. Every value it reads (including the response status) is read inside its try, so it can
  // never throw into the scan. Bounded: last 4 attempts per ticker, last 100 tickers (least recently written dropped;
  // a Map keeps true write order for every key, including digit-only ones).
  const _aiTel = (res, d) => {
    try {
      if (typeof window === 'undefined' || !window) return;
      const _int = v => (typeof v === 'number' && Number.isInteger(v) && v >= 0) ? v : null;
      const u = (d && typeof d === 'object' && d.usage && typeof d.usage === 'object') ? d.usage : {};
      const rec = {
        at: Date.now(), status: _int(res && res.status), maxTokens: _AI_MAX_TOKENS,
        stopReason: (d && typeof d === 'object' && typeof d.stop_reason === 'string') ? d.stop_reason.slice(0, 40) : null,
        inputTokens: _int(u.input_tokens), outputTokens: _int(u.output_tokens)
      };
      if (!(window._aiReqDebug instanceof Map)) window._aiReqDebug = new Map();
      const store = window._aiReqDebug;
      const key = batch.join(',');
      const prev = Array.isArray(store.get(key)) ? store.get(key) : [];
      store.delete(key);                                  // re-insert so the key becomes the most recent
      store.set(key, prev.concat([rec]).slice(-4));
      for (const k of store.keys()) { if (store.size <= 100) break; store.delete(k); }
    } catch (_e) { /* telemetry is best-effort */ }
  };

  const response = await fetch('/.netlify/functions/anthropic-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: _AI_MAX_TOKENS, system: system, messages: [{ role: 'user', content: user }, { role: 'assistant', content: '{' }] })
  });
  if (!response.ok) { _aiTel(response, null); const err = await response.json(); throw new Error('Anthropic: ' + (err.error?.message || 'API error')); }
  const data = await response.json();
  _aiTel(response, data);
~~~~

### §A2 `qa/ai_request_hygiene_offline.js` (new; exact text, LF)

```js
#!/usr/bin/env node
'use strict';
/*
 * qa/ai_request_hygiene_offline.js - ai-request-hygiene-1 (G-1, G-2, P-5 note; Main Control D-18).
 *
 * Rows are derived from the brief's Risk & Test Design (section RT), written from the requirements before the
 * implementation was read; expected values come from the requirements, never from the edited code's own output.
 * The REAL functions are extracted from index.html and run with stubs (no network, no browser, no storage).
 *
 *   HY-1  scan request: max_tokens 2500 (number) on every attempt; model unchanged; Deep Dive and P-5 caps unchanged
 *   HY-2  2500 fits every limit on the path: proxy clamp >= 2500; proxy timeout > the 30.2 s DEV proof; no client timer
 *   HY-3  truncation handling unchanged: same returned text for a cut reply; retry / parse functions byte-identical
 *   HY-4  telemetry is memory-only: no storage, DOM or extra network access; returned text identical
 *   HY-5  telemetry keeps each attempt per ticker (a cut reply and its retry are both kept)
 *   HY-6  telemetry never changes behaviour and is bounded: reply shapes x hostile windows x a hostile response;
 *         <= 4 attempts per ticker and <= 100 tickers (least recently written dropped, digit-only symbols included)
 *   HY-7  invalid or missing price / volume / change % print n/a (>= 5 inputs per field kind)
 *   HY-8  USD prices: 2 decimals (up to 4 below $1); only price fields change; whole block vs the expected text
 *   HY-9  .TA: finite values byte-identical to the previous rule; invalid values print n/a
 *   HY-10 P-5 call-2 client timeout: proxy timeout < value <= 60000 (platform limit); comment names the 50 s proxy
 *   HY-11 out of scope unchanged: prompt and model (digest of the rendered request), protected functions (digests at d5a03fe)
 *   HY-N1..N11 planted negatives (each mutates index.html; its named rows must fail)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const core = require(path.join(ROOT, 'qa', 'lib', 'index-pins-core.js'));
const SRC = core.normalizeText(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
const PROXY = fs.readFileSync(path.join(ROOT, 'netlify', 'functions', 'anthropic-proxy.js'), 'utf8').replace(/\r\n/g, '\n');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

// ---- constants taken from the base (d5a03fe), not from the edited code ----
// Rendered request (system + messages + model) for the fixed inputs below; the task changes only max_tokens.
const BASE_PROMPT_DIGEST = 'f7279ba21eca41cc41e634778afd75eb33b1206e94e1c16dcafe8e009f00feb8';
// Functions this task must not change (extracted with index-pins-core, sha256 of the text at d5a03fe).
const BASE_DIGESTS = {
  analyzeChunk: 'e9303a0690a6fad433918ee02772dcc63e0ad9d65f431f4dd7ee007b3c9ea703',
  orchestrate: '2e352b3f1d4739e8f98fb079ed3c3865115263e12dcdc53dda70350bebf97dfb',
  enforceScoreConsistency: '28a3a5cac29be9a0b61e854182caaa7cac2ed241fe847fd5b65e8e05a8cbfc60',
  parseJSON: 'c02413e78fb8c027bcfc8518fc36615ca8294637b5e8403196e5a2212f94c4e9',
  repairJSON: '9a8db71f54bd5b191e671a26c9838c44a785c5b6eaa29b06896b6945dd4d9eaa',
  formatNewsContext: '2690087b1a615637b8c1f8175cae1ab2180bbf874ca94ba6c3f6d0cc99d3409c',
  buildTechSnapshotBlock: 'ee1528756a40c24ed1647b889ff13c06002c87e12ee4eb0c7c01cef5000289a1',
  renderMainPanel: '61e663bf2e3a734df928a4a8f59e6cc01691782edd0e51467caa5baebdeaecd1',
  fetchPerplexityContext: '08c0d05765e5f07c138559978312bf6806dae72d5a16194cec2fbc93cb1b8e0d',
  parsePerplexityContext: '54a2feda31d3a7d4c3072f85dd10bb1e0ae5a1cd7d79cb1f87ab6bf5a367f6c5',
  _p5RequestSynthesis: '8152ce42c87fe272e5a9fa07f0af807c5d42c0564ea4187d19d196b94597e428',
  _dd0FetchAnalysis: 'bcec3745e3511b354337220208531e9a04143cd82df626f8348da57f39894a6c',
  fetchStockData: 'c3f2a021b72b9e6cf0ade43ad0ae7d9f316e64e9b6c6d3e9461cf1dc0542d752',
  fetchYahoo: '03b4938ed74daaaa38444d8c458d01b7aa622923a49bb881450ce622320b751b',
  fetchAlphaVantage: '506fc899c5f89a7d4150e04c316f80c2539afb1a0692d3ca388f8bd1ca446c2b',
  runAnalysis: '1b20f27d19618e9e43e512aa20cb8c8c032b8262c60e57c57d29be906bd2b676'
};
const DEV_PROOF_MS = 30159;   // Check B (2026-10-16): a 2,500-token reply took 30,159 ms and returned 200

// ---- helpers ----
function fnText(src, name) {
  const hit = core.extractFunctions(src).filter(f => f.name === name);
  if (hit.length !== 1) throw new Error(name + ' does not extract exactly once');
  return hit[0].text;
}
const reply = (text, extra) => Object.assign({ content: [{ type: 'text', text: text }], stop_reason: 'end_turn', usage: { input_tokens: 1200, output_tokens: 900 } }, extra || {});
const GOOD = '"results":[{"ticker":"NVDA","summary":"ok"}]}';
const CUT = '"results":[{"ticker":"NVDA","summary":"cut mid';
const ARGS = (sym) => [[sym || 'NVDA'], '16.10.2026', 'STOCK BLOCK\n%%NEWS_CONTEXT_START%%\n{"NVDA":{}}', 'TECH SNAP'];

// Build fetchAnthropicAnalysis in an isolated context. `win`: undefined -> no window at all; otherwise the window object.
// Every access to storage / document is recorded; fetch returns the queued replies in order.
function makeAnalysis(src, opts) {
  const o = opts || {};
  const log = { fetches: [], touched: [] };
  const queue = (o.replies || []).slice();
  const spy = name => new Proxy({}, { get(t, k) { log.touched.push(name + '.' + String(k)); return () => null; }, set(t, k) { log.touched.push(name + '=' + String(k)); return true; } });
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    formatNewsContext: (p, s) => 'NEWS ' + s,
    localStorage: spy('localStorage'), sessionStorage: spy('sessionStorage'), document: spy('document'), indexedDB: spy('indexedDB'),
    fetch: async (url, init) => {
      log.fetches.push({ url: url, init: init, body: JSON.parse(init.body) });
      const r = queue.length ? queue.shift() : { status: 200, body: reply(GOOD) };
      const res = { ok: r.status >= 200 && r.status < 300, json: async () => { if (r.badJson) throw new SyntaxError('bad json'); return r.body; } };
      if (o.hostileStatus) Object.defineProperty(res, 'status', { get() { throw new Error('hostile status'); } });
      else res.status = r.status;
      return res;
    }
  };
  if (o.win !== undefined) ctx.window = o.win;
  vm.createContext(ctx);
  vm.runInContext(fnText(src, 'fetchAnthropicAnalysis') + '\n;this.F = fetchAnthropicAnalysis;', ctx);
  return { F: ctx.F, log: log, ctx: ctx };
}
// telemetry entry of one ticker (the store is a Map; anything else counts as absent)
const tel = (w, k) => (w && w._aiReqDebug && typeof w._aiReqDebug.get === 'function') ? w._aiReqDebug.get(k) : undefined;
async function outcome(p) { try { return { ok: true, v: await p }; } catch (e) { return { ok: false, v: String(e && e.message) }; } }

function makeContext(src) { return new Function(fnText(src, 'formatStockContext') + '\nreturn formatStockContext;')(); }
const row = (sym, over) => Object.assign({ symbol: sym, source: 'yahoo', price: 226.73, open: 225.1, previous_close: 224.6, high: 227.5, low: 224.9, volume: 1234567, change_percent: 0.95 }, over || {});
const WRAP = body => '\n=== LIVE MARKET DATA (verified, use exactly as provided) ===\n' + body + '\n=== END MARKET DATA ===';
const NOTE = '  NOTE: Do NOT estimate or infer November low / April low \u2192 mark as "not available" if unknown.';
const CUR = '  CURRENCY: ILS (Tel Aviv listing; prices converted from agorot). State every price level in ILS.';
const lineOf = (txt, label) => { const m = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ': ([^|\\n]*)').exec(txt); return m ? m[1].trim() : null; };

// ---- rows ----
async function rows(src, only) {
  const R = {};
  const want = id => !only || only.indexOf(id) !== -1;
  const ok = (id, cond, detail) => { if (!(id in R) || R[id] === true) R[id] = cond ? true : (detail || 'fail'); };
  const guard = async (id, fn) => { try { await fn(); } catch (e) { ok(id, false, 'threw: ' + (e && e.message)); } };

  if (want('HY-1')) await guard('HY-1', async () => {
    const a = makeAnalysis(src, { win: {}, replies: [{ status: 200, body: reply(CUT, { stop_reason: 'max_tokens' }) }, { status: 200, body: reply(GOOD) }] });
    await a.F.apply(null, ARGS()); await a.F.apply(null, ARGS());   // first attempt and the retry use the same function
    const caps = a.log.fetches.map(f => f.body.max_tokens), models = a.log.fetches.map(f => f.body.model);
    ok('HY-1', a.log.fetches.length === 2 && caps.every(c => c === 2500) && models.every(m => m === 'claude-haiku-4-5-20251001'),
      JSON.stringify({ caps, models }));
    const dd = fnText(src, '_dd0FetchAnalysis');
    ok('HY-1', /max_tokens: 1200\b/.test(dd) && (src.match(/var P5_CALL2_MAX_TOKENS = 700;/g) || []).length === 1, 'Deep Dive / P-5 cap changed');
  });

  if (want('HY-2')) await guard('HY-2', async () => {
    const clamp = /max_tokens:\s*Math\.min\(body\.max_tokens \|\| \d+,\s*(\d+)\)/.exec(PROXY);
    const tmo = /const TIMEOUT_MS\s*=\s*(\d+);/.exec(PROXY);
    const fa = fnText(src, 'fetchAnthropicAnalysis');
    ok('HY-2', !!clamp && Number(clamp[1]) >= 2500 && !!tmo && Number(tmo[1]) > DEV_PROOF_MS && !/AbortSignal|setTimeout|signal\s*:/.test(fa),
      JSON.stringify({ clamp: clamp && clamp[1], timeout: tmo && tmo[1] }));
  });

  if (want('HY-3')) await guard('HY-3', async () => {
    // a cut reply returns exactly the text it returns when the same body ends normally (cap and telemetry do not alter it)
    const a = makeAnalysis(src, { win: {}, replies: [{ status: 200, body: reply(CUT, { stop_reason: 'max_tokens' }) }] });
    const b = makeAnalysis(src, { win: {}, replies: [{ status: 200, body: reply(CUT) }] });
    const x = await outcome(a.F.apply(null, ARGS())), y = await outcome(b.F.apply(null, ARGS()));
    ok('HY-3', x.ok && y.ok && x.v === y.v, JSON.stringify([x, y]));
    for (const n of ['analyzeChunk', 'parseJSON', 'repairJSON']) ok('HY-3', sha(fnText(src, n)) === BASE_DIGESTS[n], n + ' changed');
  });

  if (want('HY-4')) await guard('HY-4', async () => {
    const a = makeAnalysis(src, { win: {}, replies: [{ status: 200, body: reply(GOOD) }, { status: 504, body: { error: { message: 'Upstream timeout' } } }] });
    const v1 = await outcome(a.F.apply(null, ARGS())); const v2 = await outcome(a.F.apply(null, ARGS()));
    const fa = fnText(src, 'fetchAnthropicAnalysis');
    ok('HY-4', a.log.touched.length === 0 && a.log.fetches.length === 2 && a.log.fetches.every(f => f.url === '/.netlify/functions/anthropic-proxy') &&
      v1.ok && v1.v === '{"results":[{"ticker":"NVDA","summary":"ok"}]}' && !v2.ok && v2.v === 'Anthropic: Upstream timeout' &&
      !/localStorage|sessionStorage|indexedDB|document\.|pt_results/.test(fa), JSON.stringify({ touched: a.log.touched, v1, v2 }));
  });

  if (want('HY-5')) await guard('HY-5', async () => {
    const win = {};
    const a = makeAnalysis(src, { win: win, replies: [
      { status: 200, body: reply(CUT, { stop_reason: 'max_tokens', usage: { input_tokens: 5000, output_tokens: 2500 } }) },
      { status: 200, body: reply(GOOD, { usage: { input_tokens: 5000, output_tokens: 1400 } }) }] });
    await a.F.apply(null, ARGS()); await a.F.apply(null, ARGS());
    const e = tel(win, 'NVDA');
    ok('HY-5', Array.isArray(e) && e.length === 2 &&
      e[0].stopReason === 'max_tokens' && e[0].outputTokens === 2500 && e[0].inputTokens === 5000 && e[0].status === 200 && e[0].maxTokens === 2500 &&
      e[1].stopReason === 'end_turn' && e[1].outputTokens === 1400 && typeof e[0].at === 'number' &&
      Object.keys(e[0]).sort().join(',') === 'at,inputTokens,maxTokens,outputTokens,status,stopReason', JSON.stringify(e));
  });

  if (want('HY-6')) await guard('HY-6', async () => {
    const shapes = [
      ['no usage', { status: 200, body: { content: [{ type: 'text', text: GOOD }], stop_reason: 'end_turn' } }],
      ['usage strings', { status: 200, body: reply(GOOD, { usage: { input_tokens: '1200', output_tokens: '900' } }) }],
      ['usage NaN / negative / fraction', { status: 200, body: reply(GOOD, { usage: { input_tokens: NaN, output_tokens: -3.5 } }) }],
      ['usage not an object', { status: 200, body: reply(GOOD, { usage: 'many' }) }],
      ['stop_reason absent', { status: 200, body: { content: [{ type: 'text', text: GOOD }], usage: { input_tokens: 1, output_tokens: 2 } } }],
      ['stop_reason not a string', { status: 200, body: reply(GOOD, { stop_reason: { x: 1 } }) }],
      ['HTTP 504', { status: 504, body: { error: { message: 'Upstream timeout' } } }],
      ['HTTP 401 without message', { status: 401, body: {} }],
      ['JSON without content', { status: 200, body: { stop_reason: 'end_turn' } }],
      ['body not JSON', { status: 200, badJson: true }]
    ];
    const boom = () => { throw new Error('hostile'); };
    const wins = [() => undefined, () => ({}), () => ({ _aiReqDebug: 'not an object' }), () => ({ _aiReqDebug: { NVDA: 'junk' } }),
      () => { const w = {}; Object.defineProperty(w, '_aiReqDebug', { get: boom, set: boom }); return w; }, () => new Proxy({}, { get: boom, set: boom, has: boom })];
    const bad = [];
    for (const [label, r] of shapes) {
      let ref = null;
      // a response whose status getter throws must not change the outcome either (the status is read inside the helper)
      { const a = makeAnalysis(src, { win: {}, replies: [r], hostileStatus: true }); ref = JSON.stringify(await outcome(a.F.apply(null, ARGS()))); }
      for (let i = 0; i < wins.length; i++) {
        const w = wins[i]();
        const a = makeAnalysis(src, w === undefined ? { replies: [r] } : { win: w, replies: [r] });
        const out = JSON.stringify(await outcome(a.F.apply(null, ARGS())));
        if (ref === null) ref = out; else if (out !== ref) bad.push(label + ' / window#' + i + ': ' + out + ' vs ' + ref);
      }
      // the recorded values are null unless they are non-negative integers / strings
      const win = {}; const a = makeAnalysis(src, { win: win, replies: [r] }); await outcome(a.F.apply(null, ARGS()));
      const e = tel(win, 'NVDA');
      if (!r.badJson && !(Array.isArray(e) && e.length === 1)) bad.push(label + ': no record');
      if (Array.isArray(e) && e[0]) {
        for (const k of ['inputTokens', 'outputTokens', 'status']) if (!(e[0][k] === null || (Number.isInteger(e[0][k]) && e[0][k] >= 0))) bad.push(label + ': ' + k + '=' + e[0][k]);
        if (!(e[0].stopReason === null || typeof e[0].stopReason === 'string')) bad.push(label + ': stopReason');
      }
    }
    // bounded: six attempts for one ticker keep the last four; tickers are separate
    const win = {}; const a = makeAnalysis(src, { win: win, replies: Array.from({ length: 7 }, (_, i) => ({ status: 200, body: reply(GOOD, { usage: { input_tokens: i, output_tokens: i } }) })) });
    for (let i = 0; i < 6; i++) await a.F.apply(null, ARGS('NVDA'));
    await a.F.apply(null, ARGS('ARM'));
    const n = tel(win, 'NVDA') || [];
    if (!(n.length === 4 && n[0].inputTokens === 2 && n[3].inputTokens === 5 && (tel(win, 'ARM') || []).length === 1)) bad.push('bound ' + JSON.stringify(n.map(x => x.inputTokens)));
    // at most 100 tickers; the least recently written is dropped (writing a ticker again makes it the most recent)
    const w2 = {}; const b2 = makeAnalysis(src, { win: w2, replies: Array.from({ length: 130 }, () => ({ status: 200, body: reply(GOOD) })) });
    await b2.F.apply(null, ARGS('T0'));
    for (let i = 1; i <= 99; i++) await b2.F.apply(null, ARGS('T' + i));   // 100 tickers stored, T0 the oldest
    await b2.F.apply(null, ARGS('T0'));                                   // T0 rewritten while stored: now the most recent
    for (let i = 100; i <= 109; i++) await b2.F.apply(null, ARGS('T' + i)); // 10 more: T1..T10 must go, T0 must stay
    const ks = Array.from(w2._aiReqDebug.keys());
    if (!(ks.length === 100 && ks.indexOf('T0') !== -1 && ks.indexOf('T1') === -1 && ks.indexOf('T10') === -1 && ks.indexOf('T11') !== -1 && ks[ks.length - 1] === 'T109'))
      bad.push('ticker bound ' + ks.length + ' ' + JSON.stringify(ks.slice(0, 3)));
    // write order holds for every key form, including digit-only symbols (a plain object would list them first)
    const w3 = {}; const b3 = makeAnalysis(src, { win: w3, replies: Array.from({ length: 110 }, () => ({ status: 200, body: reply(GOOD) })) });
    await b3.F.apply(null, ARGS('A'));
    for (let i = 1; i <= 99; i++) await b3.F.apply(null, ARGS('B' + i));
    await b3.F.apply(null, ARGS('10'));                                   // the 101st ticker, digit-only: the oldest ('A') must go
    const k3 = Array.from(w3._aiReqDebug.keys());
    if (!(k3.length === 100 && k3.indexOf('A') === -1 && k3.indexOf('10') === k3.length - 1 && k3[0] === 'B1')) bad.push('digit-only order ' + JSON.stringify([k3.length, k3[0], k3[k3.length - 1]]));
    ok('HY-6', bad.length === 0, JSON.stringify(bad.slice(0, 6)));
  });

  if (want('HY-7')) await guard('HY-7', () => {
    const f = makeContext(src);
    const bad = [];
    // price fields: missing, non-number or not > 0 -> n/a (0 is the providers' "unavailable" fallback)
    const badPrices = [NaN, Infinity, -Infinity, undefined, null, '', '91.2', 0, -5, {}, [], true];
    for (const field of ['open', 'previous_close', 'high', 'low']) {
      const label = { open: 'Open', previous_close: 'Prev Close', high: 'Intraday High', low: 'Intraday Low' }[field];
      for (const v of badPrices) { const got = lineOf(f({ NVDA: row('NVDA', { [field]: v }) }), label); if (got !== 'n/a') bad.push(field + '=' + String(v) + ' -> ' + got); }
    }
    for (const v of [NaN, Infinity, undefined, null, '', '1.2', {}]) {        // change %: any non-finite / non-number
      const t = f({ NVDA: row('NVDA', { change_percent: v }) }); if (t.indexOf('Price: $226.73 (n/a) |') === -1) bad.push('chg=' + String(v));
    }
    for (const v of [NaN, Infinity, -1, undefined, null, '', '1000', {}]) {      // volume: non-number, non-finite or negative
      const got = lineOf(f({ NVDA: row('NVDA', { volume: v }) }), 'Volume'); if (got !== 'n/a') bad.push('vol=' + String(v) + ' -> ' + got);
    }
    ok('HY-7', bad.length === 0, JSON.stringify(bad.slice(0, 8)));
  });

  if (want('HY-8')) await guard('HY-8', () => {
    const f = makeContext(src);
    const cases = [[221.3000030517578, '$221.30'], [91.9, '$91.90'], [226.73, '$226.73'], [1, '$1.00'], [1e6, '$1000000.00'],
      [0.5, '$0.50'], [0.0345, '$0.0345'], [0.12, '$0.12'], [0.123, '$0.123'], [0.0001, '$0.0001'], [0.99999, '$1.00']];   // rounds to 1.0000; trailing zeros trimmed to 2 decimals
    const bad = cases.filter(([v, w]) => lineOf(f({ NVDA: row('NVDA', { open: v }) }), 'Open') !== w).map(([v, w]) => v + ' -> ' + lineOf(f({ NVDA: row('NVDA', { open: v }) }), 'Open') + ' want ' + w);
    // the whole block for a normal row: only the price formatting differs from the previous output
    const want = WRAP('NVDA [source: yahoo]\n  Price: $226.73 (+0.95%) | Open: $225.10 | Prev Close: $224.60\n  Intraday High: $227.50 | Intraday Low: $224.90 | Volume: 1,234,567\n' + NOTE);
    const got = f({ NVDA: row('NVDA') });
    if (got !== want) bad.push('block: ' + JSON.stringify(got));
    // change % and volume keep their previous formatting for valid values (not rounded, not re-formatted)
    const t = f({ NVDA: row('NVDA', { change_percent: -1.23456, volume: 0 }) });
    if (t.indexOf('(-1.23456%)') === -1 || lineOf(t, 'Volume') !== '0') bad.push('chg / volume reformatted');
    if (f({ NVDA: row('NVDA', { change_percent: 0 }) }).indexOf('(+0%)') === -1) bad.push('0% changed');
    if (f({}) !== '') bad.push('empty map');
    ok('HY-8', bad.length === 0, JSON.stringify(bad));
  });

  if (want('HY-9')) await guard('HY-9', () => {
    const f = makeContext(src);
    const ta = { symbol: 'MTRX.TA', source: 'yahoo', price: 8884, open: 8800, previous_close: 8800, high: 8950, low: 8790, volume: 1234567, change_percent: 0.95 };
    const want = WRAP('MTRX.TA [source: yahoo]\n  Price: 88.84 ILS (+0.95%) | Open: 88.00 ILS | Prev Close: 88.00 ILS\n  Intraday High: 89.50 ILS | Intraday Low: 87.90 ILS | Volume: 1,234,567\n' + CUR + '\n' + NOTE);
    const bad = [];
    if (f({ 'MTRX.TA': ta }) !== want) bad.push('block');
    // finite .TA values: exactly the previous rule (agorot / 100, toFixed(2), float rounding included), stated here as the oracle
    const prevRule = v => (v / 100).toFixed(2) + ' ILS';
    for (const v of [3.5, 45, 100000, 8884.5, 1, 12345.678]) {
      const got = lineOf(f({ 'MTRX.TA': Object.assign({}, ta, { open: v }) }), 'Open'); if (got !== prevRule(v)) bad.push(v + ' -> ' + got + ' want ' + prevRule(v));
    }
    for (const v of [NaN, 0, undefined, null, '8800']) { const got = lineOf(f({ 'MTRX.TA': Object.assign({}, ta, { previous_close: v }) }), 'Prev Close'); if (got !== 'n/a') bad.push('TA ' + String(v) + ' -> ' + got); }
    ok('HY-9', bad.length === 0, JSON.stringify(bad));
  });

  if (want('HY-10')) await guard('HY-10', () => {
    const m = /^var P5_CALL2_TIMEOUT_MS = (\d+);\s*\/\/ (.*)$/m.exec(src);
    const tmo = /const TIMEOUT_MS\s*=\s*(\d+);/.exec(PROXY);
    const n = m ? Number(m[1]) : NaN, p = tmo ? Number(tmo[1]) : NaN;
    ok('HY-10', !!m && !!tmo && n > p && n <= 60000 && n === 52000 && /50 ?s/.test(m[2]) && !/25 ?s/.test(m[2]) &&
      (src.match(/AbortSignal\.timeout\(P5_CALL2_TIMEOUT_MS\)/g) || []).length === 1, JSON.stringify({ n, p, comment: m && m[2] }));
  });

  if (want('HY-11')) await guard('HY-11', async () => {
    const a = makeAnalysis(src, { win: {}, replies: [{ status: 200, body: reply('"results":[]}') }] });
    await a.F(['NVDA'], '16.10.2026', 'STOCK BLOCK\n%%NEWS_CONTEXT_START%%\n{"NVDA":{}}', 'TECH SNAP');
    const b = a.log.fetches[0].body;
    const d = sha(JSON.stringify({ system: b.system, messages: b.messages, model: b.model }));
    const changed = Object.keys(BASE_DIGESTS).filter(n => { try { return sha(fnText(src, n)) !== BASE_DIGESTS[n]; } catch (e) { return true; } });
    ok('HY-11', d === BASE_PROMPT_DIGEST && Object.keys(b).sort().join(',') === 'max_tokens,messages,model,system' && changed.length === 0,
      JSON.stringify({ prompt: d === BASE_PROMPT_DIGEST, changed }));
  });
  return R;
}

// ---- planted negatives: each mutates index.html; the named rows must fail ----
const rep = (a, b) => s => { if (s.split(a).length !== 2) throw new Error('anchor not found exactly once: ' + a.slice(0, 60)); return s.replace(a, b); };
const NEG = [
  ['HY-N1 cap left at 1800', rep('  const _AI_MAX_TOKENS = 2500;', '  const _AI_MAX_TOKENS = 1800;'), ['HY-1']],
  ['HY-N2 Deep Dive cap raised too', s => { const t = fnText(s, '_dd0FetchAnalysis'); return s.replace(t, t.replace('max_tokens: 1200', 'max_tokens: 2500')); }, ['HY-1', 'HY-11']],
  ['HY-N3 telemetry written to localStorage', rep('      if (!(window._aiReqDebug instanceof Map)) window._aiReqDebug = new Map();',
    '      try { localStorage.setItem(\'pt_ai_tel\', JSON.stringify(rec)); } catch (_x) {}\n      if (!(window._aiReqDebug instanceof Map)) window._aiReqDebug = new Map();'), ['HY-4']],
  ['HY-N4 retry overwrites the first attempt', rep('store.set(key, prev.concat([rec]).slice(-4));', 'store.set(key, [rec]);'), ['HY-5', 'HY-6']],
  ['HY-N5 telemetry not contained', s => rep('    } catch (_e) { /* telemetry is best-effort */ }', '    } finally { /* not contained */ }')(s), ['HY-6']],
  ['HY-N6 n/a guard removed from prices', rep("const _px = v => !(_fin(v) && v > 0) ? 'n/a' : (_ta ?", "const _px = v => (_ta ?"), ['HY-7', 'HY-9']],
  ['HY-N7 flat toFixed(2) below $1', rep("const _usd = v => (v >= 1 ? v.toFixed(2) : v.toFixed(4).replace(/0{1,2}$/, ''));", 'const _usd = v => v.toFixed(2);'), ['HY-8']],
  ['HY-N8 USD rounding applied in the .TA branch', rep("(_ta ? (v / 100).toFixed(2) + ' ILS' :", "(_ta ? _usd(v / 100) + ' ILS' :"), ['HY-9']],
  ['HY-N9 P-5 timeout equal to the proxy', rep('var P5_CALL2_TIMEOUT_MS = 52000;', 'var P5_CALL2_TIMEOUT_MS = 50000;'), ['HY-10']],
  ['HY-N10 a 0 price accepted as valid', rep("const _px = v => !(_fin(v) && v > 0) ? 'n/a'", "const _px = v => !_fin(v) ? 'n/a'"), ['HY-7', 'HY-9']],
  ['HY-N12 P-5 timeout above the 60 s platform limit', rep('var P5_CALL2_TIMEOUT_MS = 52000;', 'var P5_CALL2_TIMEOUT_MS = 61000;'), ['HY-10']],
  ['HY-N13 ticker bound removed', rep('      for (const k of store.keys()) { if (store.size <= 100) break; store.delete(k); }', ''), ['HY-6']],
  ['HY-N14 status read outside the helper', rep('  _aiTel(response, data);', '  _aiTel({ status: response.status }, data);'), ['HY-6']],
  ['HY-N15 written ticker not moved to most recent', rep('      store.delete(key);                                  // re-insert so the key becomes the most recent\n', ''), ['HY-6']],
  ['HY-N11 volume guard removed', rep("const _vol = (_fin(d.volume) && d.volume >= 0) ? d.volume.toLocaleString() : 'n/a';", 'const _vol = String(d.volume.toLocaleString());'), ['HY-7']]
];

(async () => {
  const main = await rows(SRC);
  let fails = 0;
  for (const [id, v] of Object.entries(main)) { if (v !== true) fails++; console.log((v === true ? '  PASS  ' : '  FAIL  ') + id + (v === true ? '' : '  ' + v)); }
  for (const [name, mutate, wantFail] of NEG) {
    let r;
    try { r = await rows(mutate(SRC), wantFail); } catch (e) { fails++; console.log('  FAIL  ' + name + ': ' + e.message); continue; }
    const caught = wantFail.every(w => r[w] !== true);
    if (!caught) fails++;
    console.log((caught ? '  PASS  ' : '  FAIL  ') + 'negative ' + name + ' -> ' + wantFail.join(', ') + ' fail' + (caught ? '' : '  (' + wantFail.map(w => w + '=' + (r[w] === true ? 'pass' : 'fail')).join(' ') + ')'));
  }
  console.log(fails ? 'AI REQUEST HYGIENE OFFLINE: FAIL (' + fails + ')' : 'AI REQUEST HYGIENE OFFLINE: PASS (' + Object.keys(main).length + ' rows, ' + NEG.length + ' negatives)');
  process.exitCode = fails ? 1 : 0;
})();
```

### §A3 `qa/tase_units_offline.js` — the four edits (Edit tool; each OLD exactly once; literal text). Reference script: `evidence/ah1-suite-deltas.py`

#### A3.1 — US-oracle comment

OLD (exactly once):

~~~~text
// US oracle: the pre-task output (2c2b0d9 / 14d6c94), byte for byte
~~~~

NEW:

~~~~text
// US oracle: the pre-task output (2c2b0d9 / 14d6c94), byte for byte, except that USD prices print 2 decimals since
// ai-request-hygiene-1 (G-1): $225.1 -> $225.10 etc.
~~~~

#### A3.2 — US oracle line

OLD (exactly once):

~~~~text
const US_CONTEXT = WRAP('NVDA [source: yahoo]\n  Price: $226.73 (+0.95%) | Open: $225.1 | Prev Close: $224.6\n  Intraday High: $227.5 | Intraday Low: $224.9 | Volume: 1,234,567\n' + NOTE);
~~~~

NEW:

~~~~text
const US_CONTEXT = WRAP('NVDA [source: yahoo]\n  Price: $226.73 (+0.95%) | Open: $225.10 | Prev Close: $224.60\n  Intraday High: $227.50 | Intraday Low: $224.90 | Volume: 1,234,567\n' + NOTE);
~~~~

#### A3.3 — `fetchAnthropicAnalysis` base digest

OLD (exactly once):

~~~~text
  fetchAnthropicAnalysis: 'be916d0c24c40940d2cb9bc3338aba631292a708041003b15d7b28e1fddd70de',
~~~~

NEW:

~~~~text
  fetchAnthropicAnalysis: '99eb1e8d96c2c0f17acc4dc7af289815b87edaa0a57e5a5616c661373df95089',   // ai-request-hygiene-1 (E-1 cap, E-2 telemetry)
~~~~

#### A3.4 — NEG-7 line

OLD (exactly once):

~~~~text
  { id: 'NEG-7', row: 'TU-5', label: 'prompt left in agorot', f: s => mut(s, "(v / 100).toFixed(2) + ' ILS' : `$${v}`", "v + ' ILS' : `$${v}`") },
~~~~

NEW:

~~~~text
  { id: 'NEG-7', row: 'TU-5', label: 'prompt left in agorot', f: s => mut(s, "_ta ? (v / 100).toFixed(2) + ' ILS' : '$' + _usd(v)", "_ta ? v + ' ILS' : '$' + _usd(v)") },
~~~~

<!-- pep-lint:on -->

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
node qa/guard_integrity_check.js --task task/ai-request-hygiene-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/ai_request_hygiene_offline.js
node qa/tase_units_offline.js
node qa/no_synthetic_score_offline.js
node qa/high1y_label_offline.js
node qa/pulse_analyst_view_offline.js
node qa/tools/index-pins.js --check
node qa/tools/index-pins.js --update
node qa/index_pins_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/ai-request-hygiene-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/ai-request-hygiene-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (prompts):** `git add <explicit §1 paths>`; the read-only process listing before each heavy run; `node qa/tools/index-pins.js --diff <base>`; `codex exec --sandbox read-only <prompt>`.
- **C (Owner):** R11; LAND; PUSH; the post-LAND DEV scan.

<!-- land-scope:begin -->
index.html
qa/fixtures/index-pins.json
qa/tase_units_offline.js
qa/ai_request_hygiene_offline.js
work/ai-request-hygiene-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/ai_request_hygiene_offline.js
node qa/tase_units_offline.js
node qa/no_synthetic_score_offline.js
node qa/high1y_label_offline.js
node qa/pulse_analyst_view_offline.js
node qa/index_pins_offline.js
<!-- land-tests:end -->
