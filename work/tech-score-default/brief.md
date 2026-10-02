# Task brief: 22a — expose Technical Score v1 by default (Entry 22, slice a)

This brief has operational effect only when the Owner has approved these exact contents and the brief-only
commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Backlog | **Entry 22 — `partial`.** 22a exposes Tech Score; 22b (session-only Labs, Deep Dive) remains. `BACKLOG.md` is in the file set **and** `land-scope` |
| Baseline | eab818f8fdcff302e680a09e3b5cee22365068d6 = branch-dev = origin/branch-dev (one-line approval gates landed); main = origin/main = fbec2c193346d7afd1dab6fd11a46b5efe55238b. Anchors verified at `5c711b1`; `index.html`, `BACKLOG.md` and every QA suite named in §2 are byte-identical at `eab818f` |
| Branch / slot | `task/tech-score-default`, **Worker B**, created from `branch-dev` after this brief's commit and the Entry 7 closeout brief commit placed right after it, so both Workers start from the same base |
| Mode | **Auto** (attended). No ASK- or DENY-tier file; no persistence, scoring or `renderMainPanel` change |
| qa:offline | baseline count at Step 0 → **+1** (`qa/ts1_default_exposure_offline.js`) |
| Parallel with | Entry 7 closeout (`task/entry7-closeout`, Worker A): shares only `BACKLOG.md`, different entries. P2a (held): `index.html` different regions and `BACKLOG.md`. Whichever task LANDs later needs a Second-LAND rebase in the Owner's terminal |
| Status | CODE-READY on Owner approval of this brief |

Objective. Owner ruling 2026-10-03: the Technical Score v1 row is shown by default. Nothing else becomes
visible.

## 1. Rulings (approved 2026-10-03; not reopened)

- Tech Score v1: **exposed by default**.
- Deep Dive: Labs-only (22b, not this task). Research Evidence: disabled. All other hidden cards: hidden until
  their backend/data exists.
- Labs switches are session-only; **no persistence anywhere**.

## 2. Current implementation (verified at `5c711b1`)

- The engine `runTechScoreV1` (`index.html:2162`) and the row filler `_ts1FillRow` (`:7720`) each start with a
  strict `if (window.PT_ENABLE_TECH_SCORE !== true)` check; the row placeholder `_ts1RowHtml` inside
  `renderMainPanel` (`:8088`) renders only when `=== true`; `_ts1FillRow(item.ticker)` runs post-render
  (`:8447`). Per-symbol results are memoized in memory (`_ts1RowMemo`); failures render `—`.
- No `PT_ENABLE_*` gate has a default today. `init()` (`:15474`, invoked once at `:15532`, before any render)
  already sets one gate at load: `PT_ENABLE_PORTFOLIO_RESEARCH` (`:15476–15480`) — the pattern this task
  follows.
- **QA suites that read in-scope code as text:**
  - `qa/run-offline.js` (client-gate strict-check scan; Task 6 block: row/fill/engine behaviour, call-site
    count `=== 3`, strict-gate-first regex) — must pass **unmodified**;
  - `qa/vis_score_caliper_offline.js` (`renderMainPanel` hash) — must pass **unmodified**;
  - no suite hashes or extracts `init()`; no active suite reads `BACKLOG.md`.

## 3. Exact changes

### `index.html` (line endings preserved)

**D1 — default in `init()`.** Immediately after

```js
  } catch (_) {
    window.PT_ENABLE_PORTFOLIO_RESEARCH = false;
  }
```

(unique at `5c711b1`), insert:

```js
  // Entry 22a (Owner ruling 2026-10-03): Technical Score v1 is exposed by default.
  // Re-applied on every load; every gate check stays strict (=== true). Nothing is
  // persisted. Session kill switch: window.PT_ENABLE_TECH_SCORE = false (console).
  window.PT_ENABLE_TECH_SCORE = true;
```

**Nothing else changes**, in particular: `runTechScoreV1`, `_ts1FillRow`, `_ts1RowText`, `renderMainPanel`
(and its caliper pin), every other `PT_ENABLE_*` gate (no default added for Deep Dive, Research Evidence,
Capital Returns, SEC Evidence Store, Fund Facts, EDGAR Form 4 or any other), scoring, ranking, normal scan,
storage, backup/restore, prompts.

### `BACKLOG.md` — step 10a (effect `partial`; working-tree line endings preserved)

**B1 — Entry 22 status.** Heading unchanged. Insert, immediately before the entry's `*Deps:*` line, one
paragraph:

> *Ruled 2026-10-03:* Tech Score v1 exposed by default; Deep Dive Labs-only; Research Evidence disabled; all other hidden cards stay hidden until their backend/data exists; Labs switches are session-only, never persisted. *22a landed (`work/tech-score-default/`):* Tech Score v1 shown by default. *Remains — 22b:* the session-only ⚙ Labs section (Deep Dive).

No DONE line, snapshot, count or other-entry edit.

## 4. Lifecycle walkthrough

| Situation | Before | After |
|---|---|---|
| Page load, open any ticker | no Tech Score row | row `Tech Score v1` shows `…`, then `<n> / 100 · <c>% coverage` or `—` |
| Same ticker re-rendered | — | memoized; no refetch |
| Market data unavailable / unsupported market | — | `—` (engine `UNAVAILABLE`) |
| Console `window.PT_ENABLE_TECH_SCORE = false`, re-render | — | row hidden; engine and filler return at the gate |
| Reload | — | default re-applied (on) |
| Deep Dive, Research Evidence, SEC cards | hidden | **hidden (unchanged)** |

**Cost/load note:** each newly opened ticker triggers up to 4 one-year `market-data` requests (symbol, SPY,
QQQ, sector ETF), memoized per symbol for the session. Benchmarks are not shared across symbols. Measured in
the DEV check (§5); no change in this slice.

## 5. QA

**New suite `qa/ts1_default_exposure_offline.js`** (pure Node; real `index.html`, CRLF-normalized):

| ID | Assertion |
|---|---|
| TX-1 | `init()` contains exactly one `window.PT_ENABLE_TECH_SCORE = true;`, after the `PT_ENABLE_PORTFOLIO_RESEARCH` block and before the first `loadWatchlist();` |
| TX-2 | No other assignment to `PT_ENABLE_TECH_SCORE` in `index.html`; no `localStorage` / `sessionStorage` access with a tech-score key |
| TX-3 | `runTechScoreV1`, `_ts1FillRow`, `_ts1RowText` and `renderMainPanel` sources are byte-equal to the base (sha256 recorded in the suite); the two strict `!== true` checks are still the first statements of the engine and the filler |
| TX-4 | Sandbox: after the D1 assignment the `_ts1RowHtml` expression yields the row; after `= false` it yields `''`; after `= 'true'` (string) it yields `''` |
| TX-5 | No default assignment exists for `PT_ENABLE_DEEP_DIVE`, `PT_ENABLE_RESEARCH_EVIDENCE_CLIENT`, `PT_ENABLE_CAPITAL_RETURNS_CLIENT`, `PT_ENABLE_SEC_EVIDENCE_STORE_CLIENT`, `PT_ENABLE_FUND_FACTS_READ_CLIENT`, `PT_ENABLE_EDGAR_FORM4` or any other `PT_ENABLE_*` except `PT_ENABLE_PORTFOLIO_RESEARCH` (existing) and `PT_ENABLE_TECH_SCORE` |

- Every row has a planted negative (assignment moved after `loadWatchlist`; a second assignment; a
  `localStorage` write; Deep Dive default added; `renderMainPanel` byte changed).
- **BACKLOG text check** (scratch under `/tmp/pt-tech-score-default/`, deleted after use): B1 present once,
  inserted before entry 22's `*Deps:*` line; every other line byte-equal to the base.
- **Runs:** `node qa/ts1_default_exposure_offline.js`; `node qa/vis_score_caliper_offline.js`; full
  `npm run qa:offline` → baseline + 1 (the `run-offline.js` Task 6 block passes unmodified).
- **DEV check after push** (Cowork, browser, read-only): open 3 tickers incl. one ETF and one TASE ticker → the
  row fills or shows `—`; no console errors; Deep Dive / Research Evidence / SEC cards absent; reload → row
  still present; count `market-data` requests and note any 429 / provider fallback.

<!-- land-scope:begin -->
index.html
qa/ts1_default_exposure_offline.js
BACKLOG.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/ts1_default_exposure_offline.js
node qa/vis_score_caliper_offline.js
<!-- land-tests:end -->

## 6. Files — exactly 4

```
index.html                              D1 only
qa/ts1_default_exposure_offline.js      NEW — §5
BACKLOG.md                              B1 only (step 10a, effect partial)
work/tech-score-default/review.md       NEW — ## Backlog reconciliation; ends with the LAND-EVIDENCE line
```

No path is ASK- or DENY-tier or protected → LAND and push through R12.

## 7. Flow, STOP, Definition of Done

**Flow:** AGENTS.md steps 0–16 in attended Auto: tests first → D1 → QA + Codex read-only → step 10a (B1,
`partial`) → `review.md` (`## Backlog reconciliation`: row `partial`, action `updated`, entry 22 before →
after) with `LAND-EVIDENCE` → Codex final check → gated commit → integrity (reported) → LAND request → Owner
`!` → LAND → push request (public DEV deploy notice) → Owner `!` → push → cleanup → DEV check.

**STOP:** STOP-1..6; any change to `renderMainPanel`, the engine, the filler or any other gate; any
persistence; any `BACKLOG.md` edit beyond B1; any file outside §6; a `qa:offline` count other than baseline + 1.

**Definition of Done:** D1 and B1 exact; TX-1…TX-5 and negatives PASS; caliper PASS; full `qa:offline` =
baseline + 1; Codex no unresolved Class I; LANDed, pushed, cleaned; DEV check recorded.
