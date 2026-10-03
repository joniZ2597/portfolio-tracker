# Task brief: tech-snapshot-price-cache — a technical snapshot is never reused for a different price (Entry 32)

Operational only when the Owner has approved these exact contents and the brief-only commit records them
unchanged. Bug evidence was gathered read-only on DEV on 2026-10-03 and is summarised in §1.

| | |
|---|---|
| Backlog | **Entry 32 — `close`** (Track 2 · Scores & Signals). Entry 32 does not exist yet at the baseline: per the Owner ruling ("add it to the next backlog update that touches `BACKLOG.md`") this task adds it, already closed — B1 and B2 in §3 |
| Baseline | `24fabf0f7236172210557f37d448033bc9af4bb1` (`branch-dev` = `origin/branch-dev`, 2026-10-03). Every anchor below re-verified at this commit; `index.html` 15,860 lines |
| Branch / slot | `task/tech-snapshot-price-cache`, Worker B (`pt-wt-worker-b`) |
| Mode | **Manual, attended** — the task changes the snapshot that feeds `orchestrate()`'s setup override and score clamps (a scoring surface): AGENTS.md excludes it from `Mode: Auto` and makes it an M5 trigger. The Worker still runs implementation → QA → Codex → fixes on its own, in the MANUAL posture for those edits; it stops only on STOP-1..6 or an Owner gate |
| qa:offline | baseline at Step 0 → **+1** (`qa/tech_snapshot_cache_offline.js`) |
| Parallel with | Worker A `task/second-finisher-resync` — no shared file. **Full `qa:offline` runs one at a time on the machine** (Owner rule). P2a and 22b (held) also edit `index.html` and re-pin after this lands |
| Status | FINAL. Owner rulings 2026-10-03: bug confirmed (systemic, Track 2); D1 = (a); Setup-consistency correction; scan-time labels incl. the score dial; amendment (7th file): the Tech Score default-exposure suite's `renderMainPanel` pin is updated, nothing else in that suite. No decision open |

## 1. Problem and rule

`computeTechnicalSnapshot(symbol, sectorEtf, currentPrice)` caches by **symbol only** for 15 minutes and, on a hit,
returns the stored snapshot **ignoring `currentPrice`** — yet `pct20/50/150/200` and `athDist` depend on the price.
Opening a ticker's panel on an old stored result (`refreshTechPanel(…, item._verifiedPrice)`) and then scanning it
within 15 minutes makes the scan reuse distances measured from the old price. `orchestrate()` then re-reads the
global cache, forces `technical_setup` from it, applies the setup score clamps and writes the audit trail; the
Technical Setup panel and Deep Dive read the same cache.

**Rule (Owner, 2026-10-03):** no price-dependent technical value may be reused when its reference price or the
relevant market-data state has changed. Systemic fix; nothing ticker-specific.

## 2. Design

Split the cache into two parts:

| Part | Contents | Reused when |
|---|---|---|
| **base** (price-independent) | candles, SMA 20/50/150/200, volume ratio, RS vs SPY/QQQ/sector, SPY/QQQ day change, candle count | same symbol **and** same benchmark ETF **and** younger than `CACHE_TTL_MS` (unchanged 15 min, same as the candle cache) |
| **snap** (price-dependent) | `pct20/50/150/200`, `athDist` and the full snapshot object | **never reused for another price.** Derived on every call from the price passed in. Stored with `refInput` (the price it was derived for; `null` = last-close fallback) |

Every reader gets a snapshot that matches the price it is working with:
- **scan:** `orchestrate()` receives the scan's own snapshot object. It no longer reads the global cache, so a panel
  refresh finishing mid-scan cannot overwrite what the scan uses;
- **Technical Setup panel:** its reference price is **the price the panel displays in its header** —
  `_techPanelPrice(item)`, the same rule `renderMainPanel` uses for its headline price (`item._verifiedPrice`, or the
  live regular-market price after a ↻ refresh during pre-market / after-hours). The panel reads through
  `_techSnapFor(symbol, price)`, which returns the stored snapshot only if its `refInput` matches that price,
  otherwise `{}` (shown as "—" until `refreshTechPanel` recomputes at the same price and re-renders);
- **Deep Dive:** reasons about the scan result, so its reference price is `item._verifiedPrice`. If the stored
  snapshot was computed for another price (e.g. the panel shows a ↻-refreshed price), Deep Dive sends **no**
  technical block rather than a mismatched one.

**Setup consistency (Owner correction, 2026-10-03).** The Technical Setup panel never shows distances from one
price state next to a Setup derived from another. Its Setup (the Timeframe Alignment value and the assessment line)
is recomputed with `classifyTechnicalSetup` from **the same snapshot object** whose distances it renders. If no
consistent snapshot exists — a mismatched or missing snapshot, no verified price, or a classification of
`unknown` — the Setup shows "—" / nothing (a mismatched snapshot already renders the card's "Loading candle data…"
state until `refreshTechPanel` re-renders). The panel never falls back to the scan-time `item.technical_setup`.

**Scan-time values are labelled as such (Owner rulings, 2026-10-03).** Three values on the panel are scan-time by
nature and stay visible: the Setup row and the score dial in the scan's action block, and the overall Score row in
the Technical Setup card. When the displayed price differs from the scan price (`_techPanelPrice(item) !== item._verifiedPrice`,
with verified data), they are marked as scan-time so they cannot read as recalculated from the refreshed price:
- action block: the label reads **"Scan setup"** instead of "Setup"; the value is unchanged;
- action-block score dial: a small **"from scan"** indicator after the dial's "Score" label; the dial, its number,
  its fill, the rating and the score calculation are unchanged (`_ptScoreDial` and the other pinned score
  functions are not touched);
- Technical Setup card: the label stays "Score" and the value gets a muted **"from scan"** tag after `NN / 100`.
  (The label text itself cannot change: the Tech Score suite's T6-11 check in the ASK-tier `qa/run-offline.js`
  requires exactly one literal `<span class="rr-lbl">Score</span>` in `renderMainPanel`; this task does not edit
  that file.)

When the displayed price equals the scan price, all three keep their current appearance, byte-for-byte. Values, classes,
the Action / Entry Zone / Invalidation rows, the Position Take text and the AI text are unchanged (CLAUDE.md
Actionable Take boundary).

Unchanged on purpose: the 15-minute base window, the candle cache, the SPY/QQQ day-change values, the
`delete _techCache[_editSym]` on benchmark edit, the snapshot's field names and order, and every classification
and formatting function.

## 3. Exact changes — `index.html`

**I1 — cache comment (`:1011–1013`).** Replace the comment `// key: ticker symbol → { snap, computedAt }` with:
```js
// key: ticker symbol → { base, computedAt, sectorEtf, snap, refInput }
//   base/computedAt/sectorEtf — price-independent candle data; reused for CACHE_TTL_MS for the same benchmark only
//   snap/refInput — the last snapshot and the price it was derived for (null = last-close fallback).
//   A snapshot is never served for a different price (Entry 32).
```

**I2 — new helpers**, inserted immediately before `async function computeTechnicalSnapshot(` (`:1133`):
- `_techRefInput(p)` → `p` if `typeof p === 'number' && isFinite(p) && p > 0`, else `null`;
- `_techPanelPrice(item)` → the panel's headline price rule, read-only:
  `const e = hasVerifiedMarketData(item) ? (_extendedMktCache[item.ticker] || null) : null; const ms = e ? e.marketState : null;`
  returns `e.regularPrice` if `(ms === 'PRE' || ms === 'POST') && typeof e.regularPrice === 'number'`, else
  `item._verifiedPrice`. This mirrors `renderMainPanel`'s `let price = …` line and its `_showExt && _extC` override
  block, which stay byte-identical (TC-12b);
- `_techSnapFor(symbol, price)` → `_techCache[(symbol||'').toUpperCase()]`; returns its `snap` only if it exists and
  `entry.refInput === _techRefInput(price)`; otherwise `{}`. Read-only;
- `async _techFetchBase(sym, etf)` → the **existing** fetch and compute body of `computeTechnicalSnapshot`
  (`:1141–1195` logic, moved unchanged): returns `{ candles: tc, sma20, sma50, sma150, sma200, volMetrics,
  rsSector, rsSPY, rsQQQ, sectorEtf: etf || null, spyChangePct, qqqChangePct }`;
- `_techDeriveSnap(base, refInput)` → pure. `price = refInput || (tc.length ? tc[tc.length-1].close : null)`, then
  `pct*` via `computePctDiff` and `athDist` via `computeATHDistance(tc, price)` — the same calls as today — and
  returns the **same snapshot object, same keys, same order** as `:1197–1218` today.

**I3 — `computeTechnicalSnapshot` body (`:1133–1227`).** Same signature, same `{}` on empty symbol or error,
same log line. New flow: normalise `sym`, `etf`, `refInput`; reuse `cached.base` only if `cached.sectorEtf === etf`
and within `CACHE_TTL_MS`, else `await _techFetchBase`; `snap = _techDeriveSnap(base, refInput)`;
`_techCache[sym] = { base, computedAt, sectorEtf: etf, snap, refInput }` (`computedAt` kept from the reused base);
return `snap`.

**I4 — `refreshTechPanel` (`:7685–7700`).** First resolve `item = _cockpitResults.find(r => r.ticker === symbol)` and
`ref = item ? _techPanelPrice(item) : currentPrice` (the call site in `renderMainPanel`, `:7911`, is **not** edited).
The early return requires, in addition to freshness, `cached.snap && cached.refInput === _techRefInput(ref) &&
cached.sectorEtf === (sectorEtf||'').toUpperCase()`; the recompute uses `ref`. The re-render condition is unchanged
(still the active ticker).

**I5 — `orchestrate` (`:5966`, `:6012`).** Signature becomes `function orchestrate(claudeResults, pplxData, stockData, techSnaps)`.
`:6012` becomes `const _snap6a = (techSnaps && techSnaps[sym]) ? techSnaps[sym] : {};`. No other line of `orchestrate` changes.

**I6 — `analyzeChunk` (`:6588`).** `orchestrate(raw, pplxData, stockData)` → `orchestrate(raw, pplxData, stockData, { [_sym6a]: _techSnap6a })`.
The prompt block (`:6363`) and `_lastRunState.techSnap` (`:6591`) already use `_techSnap6a`; unchanged.

**I7 — `renderMainPanel`: exactly nine lines — three inserted, six replaced** (Owner ruling D1 = a, extended by
the Setup-consistency correction and the two scan-time labelling rulings). `hasData` is already defined at `:7767`,
above all of them. No new CSS (the caliper also pins a protected CSS block); the tag uses an inline style like
the existing inline `color:var(--text3)` spans.

Inserted, in this order, immediately before the `const [phase,phCls]=…` line at `:7776`:
- **I7a** `const _panelSnap  = _techSnapFor(item.ticker, _techPanelPrice(item)); // Entry 32: one snapshot for distances and Setup`
- **I7b** `const _panelSetup = hasData ? classifyTechnicalSetup(_panelSnap) : 'unknown';`
- **I7c** `const _fromScan   = hasData && _techPanelPrice(item) !== item._verifiedPrice; // Entry 32: displayed price differs from scan price`

Replaced:
- **I7d** (`:7776`) `const [phase,phCls]=_tfMap[item.technical_setup]||['NEUTRAL','neutral-v'];`
  → `const [phase,phCls]=_panelSetup==='unknown'?['—','neutral-v']:(_tfMap[_panelSetup]||['NEUTRAL','neutral-v']);`
- **I7e** (`:7803`) `const snap  = (_techCache[item.ticker] && _techCache[item.ticker].snap) || {};`
  → `const snap  = _panelSnap;`
- **I7f** (`:8083`) `const _tsAssess = hasData && item.technical_setup ? (_tsAssessMap[item.technical_setup] || '') : '';`
  → `const _tsAssess = _panelSetup !== 'unknown' ? (_tsAssessMap[_panelSetup] || '') : '';`
- **I7g** (`:8224`, Score row) — keep the line byte-identical except the value: `${score} / 100</span>` →
  `${score} / 100${_fromScan ? '<span style="color:var(--text3);font-size:10px;margin-left:6px">from scan</span>' : ''}</span>`.
  The literal `<span class="rr-lbl">Score</span>` stays.
- **I7h** (`:8274`, action-block Setup row) — keep the line byte-identical except the label:
  `<span class="mp-act-lbl">Setup</span>` → `<span class="mp-act-lbl">${_fromScan ? 'Scan setup' : 'Setup'}</span>`.

- **I7i** (`:8095`, `_dialHtml`) — keep the line byte-identical except the dial label:
  `<div class="at-dial-lbl">Score</div>` →
  `<div class="at-dial-lbl">Score${_fromScan ? '<span style="margin-left:6px;text-transform:none;font-weight:400">from scan</span>' : ''}</div>`.
  The span inherits the label's size and muted colour, so it stays small; `_ptScoreDial(score, _dialColor)`,
  `_ptScoreText(score)`, `rating` and `rCls` are untouched.

No other line of `renderMainPanel` changes — in particular the headline price lines, the other action rows,
`derivePositionTake`, the `_dial` computation, the Tech Score row and the `refreshTechPanel` call.

**I8 — `_dd0RunCard` (`:13106`).** `const snap = (_techCache[sym] && _techCache[sym].snap) || {};`
→ `const snap = _techSnapFor(sym, item._verifiedPrice);` (`item` is already resolved at `:13100`).

**Nothing else changes**, in particular: `classifyTechnicalSetup`, `buildTechSnapshotBlock`, the `compute*` helpers,
`enforceScoreConsistency`, the Tech Score v1 region (`TS1_*`, `runTechScoreV1` — it does not use `_techCache`),
the prompt text, `CACHE_TTL_MS`, `historicalCache`, the edit-flow delete (`:7380`), `pt_*` storage.

### `BACKLOG.md` — step 10a (effect `close`; CRLF line endings preserved; nothing else changes)

**B1 — new entry 32, closed.** Insert after line `:142` (entry 22's `*Evidence:*` line), before the blank line and
`---` that precede `## LATER`, with one blank line before the heading:

```
### 32 · Technical snapshot reuses a stale price — **DONE**
**Scores / Signals** · data honesty · **bug, added 2026-10-03**

The technical snapshot cache (`_techCache`) was keyed by ticker only and ignored the price on a
cache hit. Opening a ticker's panel on an old stored result, then scanning it within 15 minutes,
reused distances measured from the old price; the wrong setup then reached the score clamps, the
AI narrative, the audit trail, the Technical Setup panel and Deep Dive. Systemic, not
ticker-specific (found in the 2026-10-03 NotebookLM pilot).
*Landed (`work/tech-snapshot-price-cache/`):* price-dependent values are always derived from the
price in use; the Technical Setup panel's Setup follows the snapshot it shows; scan-time Setup
and Score are marked "from scan" when the displayed price differs from the scan price.
*Deps:* none.
```

**B2 — DONE / HISTORY line.** Insert immediately after line `:227` (``**11** Selected-for-scan visibility — `work/selected-only-watchlist/` ·``):

```
**32** Technical snapshot reuses a stale price — `work/tech-snapshot-price-cache/` ·
```

## 4. Owner ruling D1 (2026-10-03) — option (a)

Allowed: the `renderMainPanel` change I7 so the Technical Setup panel never displays a snapshot calculated for a
different price — one line under the original ruling; nine lines (I7a–I7i) after the Owner's same-day
follow-ups: the Setup-consistency correction (panel Setup from the same snapshot) and the scan-time labelling
rulings ("Scan setup" / "from scan" on the action Setup row, the card's Score row and the action score dial when
the displayed price differs from the scan price). The protected
fingerprint for `renderMainPanel` in `qa/vis_score_caliper_offline.js` is updated to the new hash. Required proof
(TC-10 … TC-15): I7a–I7i are the only main-panel changes; no other protected panel content changed; the displayed
price and the snapshot always match; Setup and distances always come from the same price state; scan-time values
are never presented as current; Tech Score untouched. `review.md` records the old pin `d11b09a989f19ee1fa09770ac135e8f00ce518558b25cc7bce3ee23cf1b174ac`
and the new one.

**Amendment (Owner ruling 2026-10-03, brief-only).** The Tech Score default-exposure suite
`qa/ts1_default_exposure_offline.js` pins `renderMainPanel` byte-for-byte (`BASE_HASHES.renderMainPanel`, TX-3), so
I7 necessarily changes that pin. The suite is added as the **7th in-scope file**. Allowed change: **only** the
`BASE_HASHES.renderMainPanel` value, set to the sha256 of the final CRLF-normalized `renderMainPanel`. No other test
logic, assertion, negative case or pin in that file may change, and the TS1 protection is not weakened. Product scope
is unchanged. Required proof (TC-13): the suite PASSES with that one pin updated; `review.md` records that its diff
from `24fabf0` is exactly one line and that the other TX-3 pins (`runTechScoreV1`, `_ts1FillRow`, `_ts1RowText`) are
byte-equal to the base.

**Not in scope (later, no decision now):** before any re-scan, the panel of an old stored result shows distances
from the *stored* price to *current* averages — consistent with the price it displays, but mixed-time.

## 5. Tests — `qa/tech_snapshot_cache_offline.js` (new)

Pattern: `extractFunctionSource` + `new Function` sandbox as in `qa/deep_dive_v0_offline.js`; stubbed
`fetchHistoricalCandles` / `fetchStockData` with call counters; stubbed `Date.now`. Synthetic symbol `TST` with a
fixture reproducing the pilot shape (SMAs ≈ 165.64 / 120.97 / 76.72; old price 59.93; fresh price 190.01).

**Harness rules.**
- **Render harness** (TC-12c, TC-14, TC-15): `renderMainPanel` extracted and run with the **real**
  `hasVerifiedMarketData`, `_techPanelPrice`, `_techSnapFor`, `_techRefInput`, `classifyTechnicalSetup`,
  `_ptScoreNorm`, `_ptScoreText` and `_ptScoreDial`; every other free identifier stubbed to a neutral value; a
  `document.getElementById('mainPanel')` stub capturing `innerHTML`.
- **"Base render"** (TC-15): the suite builds the base variant from the task's `renderMainPanel` source by
  reverting I7a–I7i textually, **proves** that variant hashes to the old pin `d11b09a9…` (TC-10), and renders both
  with identical inputs. No Git history is read at test time.
- **"Byte-equal to the base"** (TC-9, TC-12b, TC-13): sha256 pins of the named regions, captured from the baseline
  at Step 0 and embedded in the suite (the caliper pattern).
- **Review-time proofs** (recorded in `review.md`, from `git diff 24fabf0`): TC-11's one-line caliper diff, the
  `qa/deep_dive_v0_offline.js` FNS-only diff, and TC-13's one-line `qa/ts1_default_exposure_offline.js` diff
  (`BASE_HASHES.renderMainPanel` only; the other TX-3 pins unchanged).

| ID | Owner requirement | Assertion |
|---|---|---|
| TC-1 | panel opened with a stale stored price | `refreshTechPanel('TST', etf, 59.93)` then the scan call `computeTechnicalSnapshot('TST', etf, 190.01)` at +2.5 min: returns a **new** snapshot; `_techCache.TST.refInput === 190.01` |
| TC-2 | fresh scan inside the 15-minute window | the second call **does not refetch candles** (counter unchanged — base reused) yet yields fresh distances |
| TC-3 | distances recomputed from the fresh price | `pct20/50/150/200 === (190.01 − sma)/sma × 100` and `athDist === computeATHDistance(candles, 190.01)`; `classifyTechnicalSetup` of the result ≠ `below_key_mas` and equals the classification of a cold computation at 190.01 |
| TC-4 | score / setup / narrative use the same refreshed snapshot | (a) `orchestrate` extracted with stubs (`formatNewsContext`, `findTicker`, real `classifyTechnicalSetup`, real `enforceScoreConsistency`), global `_techCache` **poisoned** with the 59.93 snapshot, called with `techSnaps = { TST: fresh }`: `technical_setup`, the setup score clamp outcome and every `_auditTrail.dataCollected` technical field come from `fresh`; (b) the prompt block `buildTechSnapshotBlock('TST', fresh, setup)` contains the fresh `pct20` text; (c) static: `analyzeChunk` passes `{ [_sym6a]: _techSnap6a }`, builds the prompt block and `_lastRunState.techSnap` from `_techSnap6a`, and `orchestrate` contains no `_techCache` reference |
| TC-5 | Technical Setup panel does not inherit stale data | `_techSnapFor` returns `{}` for a different price and the stored snapshot for the same price; `refreshTechPanel` recomputes at `_techPanelPrice(item)` (and calls the `renderMainPanel` stub once) when the stored `refInput` differs, and is a no-op when price and benchmark match; static: `renderMainPanel` reads the snapshot only via `_techSnapFor(item.ticker, _techPanelPrice(item))` |
| TC-6 | Deep Dive does not inherit stale data | `_dd0RunCard` with the cache holding a 59.93 snapshot and `item._verifiedPrice = 190.01`: the technical text passed to `_dd0FetchAnalysis` (spy) is empty; with a matching snapshot it equals `buildTechSnapshotBlock` of that snapshot; `_techCache` byte-identical before/after |
| TC-7 | market-data state | different `sectorEtf` → base refetched; after `CACHE_TTL_MS` → base refetched; `null`/`0`/non-number price → last-close fallback with `refInput === null` |
| TC-8 | shape preserved | snapshot keys and order equal the base version's literal; same values as the base implementation for a cold call at the same price |
| TC-10 | only main-panel change | `renderMainPanel` extracted from the base and from the task: a line diff shows **exactly** I7a–I7c added at their position and I7d–I7i replaced (old → new text as in §3), nothing else; the task source with I7a–I7c removed and I7d–I7i restored hashes to the old pin `d11b09a9…`; the task source hashes to the new pin |
| TC-11 | no other protected panel content changed | `qa/vis_score_caliper_offline.js` differs from the base in **one line only** — the `renderMainPanel` hash value (review-time proof); the other nine function pins and the protected CSS block hash are byte-equal to the base and still PASS; the caliper suite PASS |
| TC-12 | displayed price and snapshot always match | (a) `_techPanelPrice` over a state table — no extended cache; REGULAR; CLOSED; PRE and POST with `regularPrice`; PRE without `regularPrice`; `hasVerifiedMarketData` false — equals the headline price rule; (b) static: `renderMainPanel`'s `let price = …` line and its `_showExt && _extC` override block are byte-equal to the base; (c) **render harness:** `renderMainPanel` extracted with every free identifier stubbed to neutral values and a `mainPanel` stub capturing `innerHTML`; for each state in (a), plus a race (cache holding a snapshot for another price), the rendered MA20 distance either equals `fmtPct((displayed − sma20) / sma20 × 100)` for the rendered `ph-price` value or is `—`; never a distance from another price |
| TC-14 | Setup and distances never from different price states | Render harness (as TC-12c), states: matching snapshot; ↻ PRE/POST refreshed headline price; race (snapshot for another price); stale stored result whose `item.technical_setup` (e.g. `below_key_mas`) differs from the classification at the displayed price; insufficient candles (`unknown`); no verified price. In every state the rendered Timeframe Alignment value and assessment line equal `_tfMap` / `_tsAssessMap` of `classifyTechnicalSetup(S)`, where S is the snapshot whose distances are rendered — or "—" / absent when there is no consistent S; they never equal a value derived only from `item.technical_setup`. Planted negatives: phase or assessment read from `item.technical_setup`; setup classified from a second, different snapshot |
| TC-15 | scan-time values never presented as current | Render harness, `item.action` set, all three elements present. **Price differs** (↻ PRE/POST with `regularPrice ≠ _verifiedPrice`): the action-block label is "Scan setup" (never bare "Setup") with the unchanged `item.technical_setup` value; the Score row shows `NN / 100` followed by "from scan"; the dial's label block reads "Score" followed by the "from scan" indicator, and the dial markup (class, style, number, number colour, rating, rating class) equals the base render. **Price equal** (no extended cache; REGULAR; PRE/POST with `regularPrice === _verifiedPrice`): the Setup row, the Score row and `_dialHtml` are byte-equal to the base render. **No verified price:** no indicator anywhere. Score values (`_ptScoreText(score)`, dial fill) are identical in the differ and equal cases for the same item. Static: the literal `<span class="rr-lbl">Score</span>` occurs exactly once in `renderMainPanel`; `qa/run-offline.js` unedited and its T6 and dial checks PASS. Planted negatives: indicator missing on any of the three when prices differ; indicator shown when equal; dial number, fill or rating altered; Score label literal replaced |
| TC-13 | Tech Score untouched | the TS1 region (from its banner comment to `end SCORE-V1-S1`), `_ts1FillRow` and `_initTsCard` byte-equal to the base; new code references no `_ts1*`, `runTechScoreV1` or `_techScoreDebug`; `qa/ts1_default_exposure_offline.js` PASSES with **only** its `BASE_HASHES.renderMainPanel` pin updated (review-time proof: its diff from `24fabf0` is exactly one line, and the other TX-3 pins, every assertion and every negative case are unchanged); the `qa/run-offline.js` T6 checks PASS unmodified |
| TC-9 | isolation (static) | `_techCache` occurs only in the cache declaration, I2–I4 helpers, the edit-flow delete and the existing self-test line; no `localStorage` / `pt_` in new code; `classifyTechnicalSetup`, `buildTechSnapshotBlock`, `compute*` helpers, the TS1 region and `enforceScoreConsistency` byte-equal to the base |

Every row has a planted negative (cache hit ignoring price; `orchestrate` reading the global cache; panel or Deep
Dive reading `.snap` directly; base reused across benchmarks; key order changed; a second `renderMainPanel` line
changed beyond I7a–I7i; another caliper pin changed; Setup taken from `item.technical_setup`; scan-time mark missing or misplaced; panel keyed to `item._verifiedPrice` while the header shows a refreshed
price; a TS1 byte changed).

**Existing suites:** `qa/deep_dive_v0_offline.js` — add `'_techSnapFor'` and `'_techRefInput'` to its `FNS` list
only (no assertion change; required because `_dd0RunCard` now calls the helper). `qa/vis_score_caliper_offline.js`
— the `renderMainPanel` hash value only (D1 a), with the TC-10 revert-hash proof recorded in `review.md`.
`qa/ts1_default_exposure_offline.js` — the `BASE_HASHES.renderMainPanel` value only (Owner amendment; one line, no
other pin, assertion or negative case changes), with the TC-13 one-line-diff proof recorded in `review.md`.
`qa/run-offline.js` (ASK-tier) is **not** edited.

<!-- land-scope:begin -->
index.html
qa/tech_snapshot_cache_offline.js
qa/deep_dive_v0_offline.js
qa/vis_score_caliper_offline.js
qa/ts1_default_exposure_offline.js
BACKLOG.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/tech_snapshot_cache_offline.js
node qa/deep_dive_v0_offline.js
node qa/vis_score_caliper_offline.js
node qa/ts1_default_exposure_offline.js
<!-- land-tests:end -->

## 6. Files — exactly 7

```
index.html                              I1–I8 only
qa/tech_snapshot_cache_offline.js       NEW — §5
qa/deep_dive_v0_offline.js              FNS list +2 names only
qa/vis_score_caliper_offline.js         renderMainPanel hash value only (D1 a)
qa/ts1_default_exposure_offline.js      BASE_HASHES.renderMainPanel value only (amendment; one line)
BACKLOG.md                              B1 and B2 only (step 10a, effect close)
work/tech-snapshot-price-cache/review.md  NEW — ## Backlog reconciliation; old/new pin and TC-10 proof; LAND-EVIDENCE
```

## 7. QA, flow, STOP, Definition of Done

**QA:** Step-0 full `qa:offline` baseline (one full run on the machine at a time) → tests first (red) → I1–I8 →
green → land-tests → full `qa:offline` = baseline + 1.
**Post-push DEV check (needs a separate Owner OK — it calls live scan APIs):** open DEV with a ticker whose stored
price differs from today's, open its panel, scan it within 15 minutes; the stored audit `pctAboveMA20` must equal
(price ÷ MA20 − 1) × 100 and the setup must match it.

**Pre-flight checklist (CLAUDE.md, in `plan.md`):** Pattern Auditing — `qa/deep_dive_v0_offline.js`
(`extractFunctionSource` + `new Function` sandbox) and `qa/vis_score_caliper_offline.js` (sha256 pins); the
edit-flow invalidation `delete _techCache[_editSym]`. State & Boundary — no `localStorage` / `pt_*` access; DOM
only inside `renderMainPanel`'s existing template; scoring engines changed only as I5/I6 state. Gate Verification —
**not applicable, stated explicitly**: this fixes an always-on path; no new capability and no gate is added (a gate
would change normal-scan behaviour). Definition of Done — §7.

**Flow:** AGENTS.md steps 0–16, Mode Manual (attended); before **every** full `qa:offline` (Step 0 and step 10),
confirm no other full run is active on the machine (Worker A); step 10a effect `close` (B1, B2); `review.md` with
`## Backlog reconciliation`; Codex review and FIX/DEFER/REJECT; LAND and push through R12 with the Owner's two
lines; cleanup. No `main`, production, Netlify or live-API action.

**STOP:** STOP-1..6; any `BACKLOG.md` edit beyond B1 and B2; any change outside I1–I8 and the three existing-suite edits; any change to snapshot keys or
order, classification thresholds, score clamps, prompt text, `CACHE_TTL_MS` or the Tech Score v1 region; any
ticker-specific code; any persistence or `pt_*` change; any `renderMainPanel` change beyond I7a–I7i; any change to
the scan-time values themselves, the score calculation, `_ptScoreDial` / `_ptScoreText` / other pinned score
functions, the other action rows, Position Take or AI text; any edit to
`qa/run-offline.js`; any new CSS rule; any
caliper change other than the `renderMainPanel` value; any change to `qa/ts1_default_exposure_offline.js` other than
the single `BASE_HASHES.renderMainPanel` line (a second changed line, another pin, an assertion or a negative case);
caliper revert proof failing; the render harness (TC-12c)
not buildable — STOP and report rather than weaken it; a `qa:offline` count other
than baseline + 1.

**Definition of Done:** I1–I8 (I7a–I7i) exact; TC-1…TC-15 and negatives PASS; existing suites PASS; full `qa:offline` =
baseline + 1; `review.md` with `## Backlog reconciliation` (`close` / entry 32 DONE), the caliper proof and the TS1
one-line-diff proof; Codex no
unresolved Class I; LANDed, pushed, cleaned; DEV check recorded when the Owner approves it.

