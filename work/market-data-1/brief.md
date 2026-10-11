# Master Brief: market-data-1 — live portfolio prices: Yahoo-only provider policy and an hourly server budget (BACKLOG 20)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below. **Status: FINAL, HELD** (COWORK, re-pinned 2026-10-12 at `aff45b286b5a9552beac2c721a57b35c7226e3a3`; §R). Placed only on Main Control's separate approval of this exact hash. **That approval includes the S2.1 `BUDGET_EXHAUSTED` / HTTP 429 envelope (§D).**

| | |
|---|---|
| Backlog | Entry **20** (Live prices activation) → **`partial`**: the server-side cost backstop is built; activation stays an Owner env action. `BACKLOG.md` is in scope for the step-10a status text only |
| Baseline | **`aff45b286b5a9552beac2c721a57b35c7226e3a3`** (= `origin/branch-dev`). The brief-only commit adds only `work/market-data-1/brief.md` on top of the then-current tip. **Valid only if, at that tip, all of these hold** (all verified at `aff45b2`):<br>(1) `git diff --quiet aff45b286b5a9552beac2c721a57b35c7226e3a3 <tip> -- netlify/functions/market-data.js netlify/functions/lib/ath-ensure-core.js qa/ath_isolation_offline.js qa/fund_facts_route_offline.js` exits 0. LF sha256 at `aff45b2`: `market-data.js` `f9b70977…1125` (= the `ath_isolation` pin), `ath-ensure-core.js` `0adb3077…cc29`, `ath_isolation_offline.js` `7bc002d6…87ae`, `fund_facts_route_offline.js` `3fa47540…31bd`;<br>(2) the top-level file list of `netlify/functions/` is unchanged (it equals `fund_facts_route_offline.js`'s `EXPECTED_FUNCTIONS`);<br>(3) `netlify/functions/lib/market-data-live-budget.js` and `qa/market_data_live_offline.js` are absent;<br>(4) the pin-map entries `functions._pfLiveIsTerminalEnvelope` and `functions._pfLiveBatch` equal their `aff45b2` values (MB-8 reads them).<br>**Changes elsewhere in `netlify/functions/lib/`** — e.g. `catalyst-evidence-2-s1`'s `news-catalysts-provider.js` — **do not invalidate the baseline**. Otherwise HOLD and re-pin |
| Branch / slot | `task/market-data-1`, **Worker B** (`pt-wt-worker-b`, detached at `be9f56a` after `qa-e1-digest-gate`'s cleanup; Bootstrap switches it to the new task branch created at this brief's commit); `task-start` by Bootstrap |
| Mode | **Manual.** It adds a server-side write path (an hourly Blob counter) and a new typed response on a cost / contract surface. `index.html` and the client are not touched |
| qa:offline | step-0 count **79** at `aff45b2` → **80** (+ `qa/market_data_live_offline.js`; auto-discovered; `qa/run-offline.js` unchanged). Digest-gated runs take about 100 s (§E1) |
| Parallel with | Worker A on `surface-1b` (`index.html`, `qa/labs_panel_offline.js`, `qa/ts1_default_exposure_offline.js`, `qa/dh_ui_vocabulary_offline.js`, pin map, `BACKLOG.md` entries 22 / 30): **disjoint files**. `BACKLOG.md` uses a different entry. `surface-1b` runs `qa/ath_isolation_offline.js` as a land-test, which this task edits (the `market-data.js` pin): whichever task lands second resyncs and re-runs its land-tests (Second LAND). **One forced / heavy run at a time.** If `branch-dev` moves, the AGENTS Second-LAND resync ("Owner LAND / SHIP boundaries") applies |
| Status | **FINAL, HELD** — see the status line above |

**Program objective.** Live portfolio prices can later be enabled on DEV without unbounded upstream use:
- portfolio-live requests use **Yahoo only**, never the metered Polygon key;
- the server makes at most **300 portfolio-live upstream calls per hour**;
- beyond the cap it answers with a typed envelope and makes no upstream call.

The scan path is unchanged.

## §P Placement conditions

1. `catalyst-evidence-2-s1` **and** `qa-e1-digest-gate` (E1-D4: E1 before `market-data-1`) LANDed, pushed and cleaned. **Observed 2026-10-12:** `branch-dev` = `origin/branch-dev` = `aff45b2`; canonical CLEAN, no blocking lock; `pt-wt-worker-b` detached at `be9f56a`. Slot cleanliness is confirmed by Bootstrap (`git status --short`) before `task-start`.
2. The canonical checkout is CLEAN; `work/market-data-1/`, `task/market-data-1` and its record are absent.
3. Every §A anchor re-verified at the tip.
4. §D is empty.

## §D Open decisions

**None.**
- M-1 = A is ruled.
- **Main Control's FINAL approval covers one contract addition:** the S2.1 envelope (`BUDGET_EXHAUSTED`, HTTP 429), which extends the G-L envelope family. Without that approval the brief is not placed.

## §0 Owner rulings (not reopened)

- **M-1 = A (Main Control, 2026-10-11):**
  - 300 portfolio-live upstream calls per hour;
  - Yahoo only for portfolio-live;
  - no paid Polygon fallback;
  - **no environment activation**: `PT_ENABLE_PORTFOLIO_LIVE_PRICES_SERVER` stays as it is, set by the Owner separately if ever;
  - M-2 unchanged (production is a separate SHIP decision).
- **O-4 = C:** not related; catalyst date enforcement stays deferred.
- G-L purpose routing as landed: absent purpose → `scan`; `portfolio-live` server gate checked before any upstream I/O; DISABLED / INVALID / AMBIGUOUS envelopes unchanged.

## §A Anchors (`netlify/functions/market-data.js`, byte-identical at `ac8f39b` and `aff45b2`; each verified at `aff45b2`; line numbers indicative)

| Anchor | Line |
|---|---|
| `if (purpose === 'portfolio-live' &&` / `process.env.PT_ENABLE_PORTFOLIO_LIVE_PRICES_SERVER !== 'true') {` → `return res(200, ENVELOPE_SERVER_DISABLED);` (two-line condition) | :40–43 |
| symbol validation `if (!/^[A-Z0-9.\-^=]+$/.test(sym))` | :51–53 |
| `const polygonKey = process.env.POLYGON_API_KEY || '';` | :55 |
| `const isDailyPriceRange = range === '1d' || range === '5d';` | :61 |
| daily branch: `Promise.allSettled([ fetchYahoo(...), _needsOverlay ? fetchYahooIntraday(sym, 5000) : … ])` | :75–78 |
| daily branch Polygon fallback `if (polygonKey) {` (first of exactly two occurrences) | :106 |
| historical branch Polygon first `if (polygonKey) {` (second occurrence) | :125 |
| `const ENVELOPE_SERVER_DISABLED = {` … `const ALLOWED_PURPOSES` | :452–470 |

**Proven pattern reused:** `netlify/functions/lib/ath-ensure-core.js`:
- `BUDGET_PER_HOUR = 300`;
- `takeBudget(store, nowIso)` — an hourly key `<prefix><YYYY-MM-DDTHH>`, read-modify-write, an invalid counter is treated as exhausted;
- lazy `require('@netlify/blobs')`.

**The client is unchanged** (`index.html` at `aff45b2`: `_pfLiveIsTerminalEnvelope` :11362, `_pfLiveBatch` :11559):
- a non-terminal, non-OK response sets the symbol's 60 s fail TTL;
- the persisted EOD data keeps rendering stale / missing per symbol.

## §R Placement re-pin record (COWORK, read-only, 2026-10-12)

- **Moved since the FINAL-DRAFT** (`ac8f39b` → `aff45b2`):
  - `ai-output-1-s1a` (`index.html` repair functions);
  - `catalyst-evidence-2-s1` (`netlify/functions/lib/news-catalysts-provider.js`, news-catalyst suites, replay fixtures);
  - `qa-e1-digest-gate` (four governance suites);
  - `surface-1` S1 (`index.html` classifier, `qa/asset_type_offline.js`).
- **None touches this Master's inputs:** `market-data.js`, `lib/ath-ensure-core.js`, `qa/ath_isolation_offline.js` and `qa/fund_facts_route_offline.js` are byte-identical to `ac8f39b`; the `netlify/functions/` top-level list is unchanged; the `_pfLiveIsTerminalEnvelope` / `_pfLiveBatch` pins are unchanged.
- **The draft's Baseline clause was too broad:** it named the whole `lib/` folder, which `catalyst-evidence-2-s1` changed. It is narrowed to the files this Master depends on (Baseline row), without dropping any of them.
- **Readers of the edited files at `aff45b2`:**
  - `qa/ath_isolation_offline.js` (`BASELINE_PINS['netlify/functions/market-data.js']` :219 = `f9b70977…1125`);
  - `qa/fund_facts_route_offline.js` (top-level function list; the new lib file is not top-level);
  - `qa/arc_runtime_ops_offline.js` (path string only; legacy, denylisted in `run-offline.js`).
  - `run-offline.js`'s lib walks select `/evidence/` and `fund-facts-*` names only, so the new `market-data-live-budget.js` is not selected.
- **`takeBudget` pattern present** in `ath-ensure-core.js` (`BUDGET_PER_HOUR` :46, lazy blobs require :72, `takeBudget` :100).
- **Suite count:** 79.

## §1 Program, order, entry conditions

| Slice | Entry condition |
|---|---|
| **S1 — provider policy** | §P holds; step 0 done |
| **S2 — hourly budget guard** | S1 checkpoint committed |

## §2 Continuation and STOP

**Continuation (approved multi-slice model — no Owner gate between successful slices).** After S1's checkpoint commit the Worker **continues automatically into S2** only when all of these hold:
- S1's targeted tests and its land-tests PASS;
- the `ath_isolation` pin update has its revert proof;
- Codex has no unresolved Class I finding (one scoped re-pass);
- S2's entry condition holds;
- the repo still matches §A.

M-5 gaps go to `review.md` `## Lessons` and do not stop the program.

**Owner gates that remain** (governance, not slice gates):
- the R11 brief-only record;
- the heavy-lane go-ahead for any forced or heavy run;
- the R12 LAND and PUSH records.

**§E1 — QA gate and forced replay.** This task touches **no** E1-gated input (`pt-land.js`, `pretooluse-guard.js`, `.claude/settings.json`, `qa/guard_integrity_check.js`, `qa/lib/{fixture-template,run-tmp,spawn-meter,exec-env-fingerprint}.js`, or the four gated suites). Normal full runs (step 0, step 10, post-resync) are digest-gated and must show the four `E1 … SKIP (contract pinned: …)` surfaced lines.
- **Forced replay — required only when the E1-D7 weekly replay is due at step 0.** The last full replay with all heavy rows passing was `qa-e1-digest-gate`'s second R2 on 2026-10-11, so it is due from **2026-10-18**. Then step 0 runs as `PT_QA_FORCE_HEAVY=1 npm run qa:offline` on the Owner's heavy-lane go-ahead.
- **Never otherwise:** `PT_QA_FORCE_HEAVY`, `PT_LAND_TOOL_PATH`, `AH_HOOK_PATH`, `AH_SETTINGS_PATH`, `TB_ONLY` and `NODE_OPTIONS` stay unset for step 0, step 10 and the post-resync run.
- **E1 STOP conditions:**
  - a normal run printing any `E1 … re-pin required`, `pin invalid`, `override` or `environment not proven` line;
  - **any failing heavy row in a forced replay (AH-16 included) → STOP, diagnose, explicit Owner decision before another full run; no automatic retry, and not M4**;
  - any edit to an E1-gated input;
  - two forced / heavy runs overlapping.

**Program STOP**, in addition:
- any change to the scan path's behaviour;
- any env or Netlify action;
- any `index.html` change;
- a new top-level function file under `netlify/functions/` (the `fund_facts_route_offline.js` `EXPECTED_FUNCTIONS` list must stay unchanged);
- a blobs import that executes on the scan path;
- any live upstream call in tests;
- any edit outside the land-scope, including `index.html` and `qa/fund_facts_route_offline.js` (`EXPECTED_FUNCTIONS` unchanged);
- any change to an `ath_isolation` pin other than `netlify/functions/market-data.js`'s;
- DEV activation or a live check (not part of this Master).

## §3 Skills

- `pt-offline-suite` Recommended: planted negatives; coupling sweep (grep `qa/` for `market-data`, `portfolio-live`, `POLYGON_API_KEY`).
- `/plan` is mandatory, covering both slices.

## §S1 Slice 1 — provider policy: portfolio-live is Yahoo-only

**S1.1 Requirements**
- For `purpose === 'portfolio-live'` only:
  - the daily branch never calls `fetchPolygon` (Yahoo fails → the existing 502 error body);
  - the historical branch skips Polygon and uses Yahoo only.
- `purpose === 'scan'` (and absent purpose): byte-identical behaviour, including Polygon order and fallbacks.
- `ensureProvider(data, 'yahoo')` is unchanged.

**S1.2 Files:** `netlify/functions/market-data.js` · `qa/market_data_live_offline.js` (NEW).

**S1.3 Tests (ML rows; injected `fetch` spy; `POLYGON_API_KEY` set in the test env)**

| ID | Assertion |
|---|---|
| ML-1 | scan daily: Yahoo first, then Polygon on a Yahoo failure (call order recorded), as today |
| ML-2 | scan historical: Polygon first, then Yahoo, as today |
| ML-3 | portfolio-live daily, Yahoo fails → 502 and **zero** Polygon calls |
| ML-4 | portfolio-live historical → Yahoo only, zero Polygon calls |
| ML-5 | gate off → `SERVER_DISABLED` with zero fetches (existing behaviour pinned) |
| ML-6 | INVALID / AMBIGUOUS purpose envelopes unchanged |

Planted negatives: Polygon re-enabled for portfolio-live; the scan order changed.

**S1.4 Coupling.** `qa/ath_isolation_offline.js` `BASELINE_PINS['netlify/functions/market-data.js']` (:219) pins this file's digest. **This Master authorises exactly that one pin to be updated**:
- at S1 to the S1 digest, and at S2 to the final digest;
- each with a revert proof: reverting only this slice's listed lines restores the previous digest.

No other pin and no other assertion in that suite changes.

**S1.5 Rollback:** checkpoint C1.

## §S2 Slice 2 — hourly budget guard for portfolio-live

**S2.1 Requirements**

- **New lib** `netlify/functions/lib/market-data-live-budget.js` — pure, with an injected store and clock:
  - `BUDGET_PER_HOUR = 300`;
  - key `md:live-budget:<YYYY-MM-DDTHH>` (UTC);
  - store name `market-data-live-budget`;
  - `take(store, nowIso, units)` → `true` (and counted) or `false`;
  - a missing counter is 0; an invalid or negative counter, or a store error → `false` (**fail closed**);
  - `used + units > 300` → `false`.
- **Wiring in `market-data.js`, only for `portfolio-live`:**
  - placed after the server gate and symbol validation, **before any upstream I/O**;
  - `units` = 1, plus 1 when the ET session needs the extended-hours overlay (the overlay is a second Yahoo call);
  - the blobs module is required **lazily inside this branch only**, so the scan path never loads it;
  - on `false` → **HTTP 429** with `{ status: 'ERROR', reason: 'BUDGET_EXHAUSTED', detail: 'portfolio live price budget exhausted for this hour; no upstream request made.', errors: ['BUDGET_EXHAUSTED'] }` and zero upstream calls.
- The scan path never reads or writes the store.

**S2.2 Files:** `netlify/functions/lib/market-data-live-budget.js` (NEW) · `netlify/functions/market-data.js` · `qa/market_data_live_offline.js` · `qa/ath_isolation_offline.js` (the one pin, per S1.4).

**S2.3 Tests (MB rows; in-memory store; injected clock)**

| ID | Assertion |
|---|---|
| MB-1 | the 300th unit in an hour is allowed; the next → 429 `BUDGET_EXHAUSTED`, fetch spy 0 |
| MB-2 | a new UTC hour → a new key; allowed again |
| MB-3 | overlay sessions (PRE / POST) take 2 units; CLOSED / REGULAR take 1 |
| MB-4 | store `get` throws / the counter is `'abc'` or `-1` → 429, fetch spy 0 (fail closed) |
| MB-5 | the scan path: the store spy records zero reads and writes; the blobs module is not required |
| MB-6 | gate off → `SERVER_DISABLED` before any budget read |
| MB-7 | the budget is taken before the first fetch (call-order spy) |
| MB-8 | **client compatibility, read-only:** `_pfLiveIsTerminalEnvelope` extracted from `index.html` returns `false` for the 429 body, so the client treats it as a per-symbol failure (existing 60 s fail TTL, existing stale / missing display). `index.html` is not modified |

Planted negatives: the guard after the fetch; the counter not checked; scan counted; fail-open on a store error.

**S2.4 Rollback:** checkpoint C2.

## §C / §L / §X

- **§C:** one checkpoint per slice, `wip(market-data-1): slice k <name> — checkpoint`, r9; the final step-13 commit carries `review.md` and the `BACKLOG.md` reconciliation.
- **§L — close at S1** (pre-authorised, M-4). If S2 STOPs and the Owner chooses to close:
  1. **archive first:** exclusive copy of S2's uncommitted files, plus `git diff <C1>` and a sha256 inventory, into a new `pt-work-artifacts/market-data-1-s2/<UTC>/`;
  2. reset only S2's work to C1 (`git restore` / file delete; never `reset --hard`, `clean -f` or `stash`; any hook denial → STOP-6);
  3. `ath_isolation` pin = the S1 digest;
  4. step 10;
  5. `review.md` records the unfinished slice; entry 20 stays open (status text: S1 only);
  6. final Codex check; step 13; LAND / push.
- **§X:**
  1. step-10 full `qa:offline` (= step 0 + 1, digest-gated per §E1; the heavy-lane go-ahead is needed only if forced);
  2. step 10a — entry 20's status text: the cost backstop has landed (300 / h, Yahoo-only for portfolio-live, `work/market-data-1/`); activation remains an Owner env action;
  3. `review.md`;
  4. final Codex check;
  5. step-13 commit;
  6. integrity;
  7. R12 LAND / push / cleanup.

**No DEV activation and no live check is part of this Master.**

## §Y Land-scope, land-tests, Definition of Done

<!-- land-scope:begin -->
netlify/functions/market-data.js
netlify/functions/lib/market-data-live-budget.js
qa/market_data_live_offline.js
qa/ath_isolation_offline.js
BACKLOG.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/market_data_live_offline.js
node qa/ath_isolation_offline.js
node qa/fund_facts_route_offline.js
<!-- land-tests:end -->

**Definition of Done**
- **S1:** ML-1…ML-6 PASS with negatives caught; C1.
- **S2:** MB-1…MB-8 PASS with negatives caught; C2.
- **Program:**
  - the `ath_isolation` pin updated exactly once per slice with revert proofs;
  - full `qa:offline` = step 0 + 1, PASS;
  - Codex: no unresolved Class I;
  - step 10a exact;
  - LANDed, pushed, cleaned through R12.
