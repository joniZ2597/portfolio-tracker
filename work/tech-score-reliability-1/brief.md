# Master Brief: tech-score-reliability-1 — Tech Score v1 fetch resilience and row freshness (priority HIGH)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below. **Status: FINAL, HELD** (COWORK, 2026-10-12, swept at `f6493ce8a8567ff84ac0549dad0caccb05046401`; Owner rulings TSR-0…TSR-3 and BT-SEQ recorded in §D). It is placed only on the Owner's batch placement approval of this exact hash (batch `2026-10-12-B1`, position **1 of 2**).

| | |
|---|---|
| Evidence | `_held-briefs/dev-scan-smoke/DEV-LIVE-SCAN-SMOKE-REPORT-2026-10-12.md` P-3 / P-4, and the 2026-10-12 read-only smoke check (both recorded below; the Worker reads nothing outside its slot) |
| Backlog | none (findings P-3 / P-4 are not BACKLOG entries yet; the R-9 refresh records them) |
| Baseline | **`f6493ce8a8567ff84ac0549dad0caccb05046401`** (this brief's commit is the first of the batch, on top of it). **Valid only if** at that tip, in `qa/fixtures/index-pins.json`:<br>• `functions.runTechScoreV1` = `cbb5b8ae…`;<br>• `functions._ts1FetchRawSeries` = `001ab301…`;<br>• `functions._ts1FillRow` = `306a720e…`;<br>• `functions._ts1RowText` = `d81334a8…`;<br>and every §A anchor matches exactly once; `qa/ts1_reliability_offline.js` is absent. Otherwise HOLD and re-pin |
| Branch / slot | `task/tech-score-reliability-1`, **Worker A** |
| Mode | **Manual** — a provenance-adjacent fetch path and a memo contract. Attended; not Auto, because the slices touch fail-closed data-honesty surfaces (M5) |
| qa:offline | step-0 count **+1** (`qa/ts1_reliability_offline.js`) |
| Parallel with | **not** `narrative-consistency-2` (§SEQ): both change `index.html` and `qa/fixtures/index-pins.json`. Any lane-B / governance task with disjoint files may run alongside (e.g. `form-recovery-1`). **One heavy run at a time** |

## §0 Findings: confirmed vs hypothesis vs intended behaviour

| ID | Statement | Status | Evidence |
|---|---|---|---|
| F-1 | Tech Score fails closed (`SERIES_PROVENANCE_UNESTABLISHED`, score null / coverage 0) when the **holding's** 1y series comes from Yahoo; RS components drop (coverage 70 %) when a **benchmark** series comes from Yahoo | **Confirmed (code)** | `_ts1FetchRawSeries` :2194–2195: `adjustedBasis = provider === 'polygon' ? 'explicit' : 'unknown'`; `_ts1BuildSnapshot` :1885–1891; `_ts1RsValue` :1826–1832 |
| F-2 | `market-data` serves 1y ranges **Polygon first, Yahoo on any Polygon failure** (`market-data.js` historical branch) | **Confirmed (code)** | `netlify/functions/market-data.js` "Historical: Polygon → Yahoo fallback" |
| F-3 | On DEV the same symbol alternates between Polygon and Yahoo within minutes | **Confirmed (observed)** | Page-load console `[history] yahoo: 251 candles for FROG/SPY/IGV/QQQ (1y)`; a direct `_ts1FetchRawSeries('FROG')` minutes later → `provider: polygon`. FROG 84.29 / 70 % on one load, null / 0 % on the next, 72.5 / 100 % after the scan; NVDA, MSFT null / 0 % right after the scan |
| F-4 | **Why** Polygon fails intermittently (rate limit vs transient error) | **Hypothesis (UNVERIFIED)** | One page load issues about 8 1y requests (history service: ticker, sector ETF, SPY, QQQ; Tech Score: the same 4 again, **not deduplicated** — `_ts1FetchRawSeries` calls `fetch` directly while the history service has its own cache). A burst of this size is consistent with a request-rate limit. Netlify function logs would show `polygon failed for … : <message>` |
| F-5 | The Tech Score row keeps a session-long memo: a degraded result (UNAVAILABLE / provenance) and a pre-scan result are reused for the whole session | **Confirmed (code + observed)** | `_ts1FillRow` :8174–8186 drops the memo only on a **rejected** promise. Observed: FROG row "84 / 100 · 70 %" (page load) while a fresh run after the scan gave "73 / 100 · 100 %" |
| F-6 | Only one UI component shows Tech Score: the main-panel row `ts1-val-<ticker>` | **Confirmed (code)** | the only engine caller is `_ts1FillRow`; `runTechScoreV1(` occurs exactly 3 times (pinned by `qa/run-offline.js`) |
| I-1 | Yahoo's split adjustment is **not** a verified basis, so a Yahoo series must fail closed | **Intended behaviour (ratified rev-2)** | comment :2160–2162. **Must not change** (TSR-1) |

## §D Rulings (Owner, 2026-10-12; no open decision)

| ID | Ruling |
|---|---|
| TSR-1 | **Keep** the Yahoo price-series provenance fail-closed rule (I-1). Nothing in this task may treat a Yahoo series as `explicit` / `documented` |
| TSR-2 | **15-minute in-memory cache of Polygon successes only; 120-second expiry for failed / partial Tech Score rows. A new scan must force recomputation** |
| TSR-3 | Server-side Polygon resilience **deferred** to a separate future task |
| TSR-0 | Optional read-only Netlify log check (COWORK / Owner); **not a blocker** |
| BT-SEQ | **Sequential execution:** this task runs first; `narrative-consistency-2` is task-started only after this task is LANDed, pushed and cleaned (§SEQ) |

## §SEQ Sequential execution dependency (explicit)

- **Why:** this task and `narrative-consistency-2` both change `index.html` and `qa/fixtures/index-pins.json` (the `fileSha256` / function entries). Running them in parallel would make the second task's Second-LAND resync conflict on the pin map.
- **Order:** this task first (HIGH).
- **Handoff point:** `narrative-consistency-2` may be task-started only after this task's R12 PUSH **and** cleanup (`pt-land-log` `cleanup` entry), on the new tip.
- **Effect on this task:** none; it never waits for seq 2.
- **Effect on seq 2:** its brief commit already exists (batch), and its baseline is re-checked at its own task-start.
- **Abort rule:** if this task closes at a partial slice (§L) or is abandoned, seq 2 may still start on the resulting tip after its baseline re-check. COWORK reports any anchor drift before task-start.

## §V Validation guarantees for caching and invalidation (Owner condition)

| # | Guarantee | Enforced by |
|---|---|---|
| V-1 | The raw-series cache admits **only** responses whose `meta._provider === 'polygon'` (provenance `explicit`). Yahoo, error, timeout and empty responses are returned to the caller **and never cached**, so a fail-closed result is never upgraded or masked by the cache | S2 code; TR-6, TR-12 |
| V-2 | The cache holds **raw series only, never scores or snapshots**. Every computation, cached series or not, runs the full unchanged path: `_ts1NormalizeCandles` → `_ts1BuildSnapshot` (provenance, identity, continuity) → `scoreTickerTech` (freshness `DATA_AGED`, coverage floor) with a fresh `computedAt` | §C (pure functions byte-identical); TR-11 |
| V-3 | **No silent reuse beyond the approved window:** a cached series is used for at most 15 min after it was fetched (TSR-2). Freshness of the bars themselves is still judged against the new `computedAt` (`dataAsOf` / age rules unchanged) | S2 TTL; TR-12 |
| V-4 | **A new scan forces recomputation:** a fill for a ticker whose `_cockpitResults` `_runId` differs from the memo's drops the memo and calls the engine again. A failed / partial row recomputes after 120 s | S3; TR-7, TR-8, TR-11 |
| V-5 | Without scan context (no `_cockpitResults`, e.g. the T6 harness) behaviour is exactly today's | TR-9; protected T6 unchanged |

## §A Anchors (`f6493ce`; each exactly once)

| Anchor | Line |
|---|---|
| `async function _ts1FetchRawSeries(symbol) {` | :2178 |
| `async function runTechScoreV1(symbol) {` | :2230 |
| `  var raw = await _ts1FetchRawSeries(symbol);` · `      var braw = await _ts1FetchRawSeries(names[key]);` | :2237 · :2252 |
| `const _ts1RowMemo = {};` | :8165 |
| `async function _ts1FillRow(symbol) {` · `    if (_ts1RowMemo[symbol] === pending) delete _ts1RowMemo[symbol];` | :8174 · :8182 |
| `let _cockpitResults = [];` (read only, never written by this task) | :6978 |

## §C Hard constraints (protected / frozen tests that must pass **unmodified**; any need to change them → STOP)

| Source | Constraint |
|---|---|
| `qa/run-offline.js` (protected) Phase 12 | the pure functions it extracts stay **byte-identical**: `_ts1NormalizeCandles`, `_ts1ValidateContinuity`, `_ts1RsValue`, `_ts1BuildSnapshot`, `scoreTickerTech`, `TS1_POLICY_V1`, `TS1_FAILCLOSED_INTEGRITY_CODES` and the other listed `_ts1*` helpers. No provenance rule changes |
| `qa/run-offline.js` :3522 | the literal `runTechScoreV1(` occurs **exactly 3 times** in `index.html` |
| `qa/run-offline.js` T6 harness | `_ts1FillRow` is evaluated with only `window`, `document`, `runTechScoreV1` and `var _ts1RowMemo = {}` in scope, so:<br>• every other identifier it uses is `typeof`-guarded or a JS global;<br>• memo keys stay **plain symbols**;<br>• a full result is reused on re-render (no refetch);<br>• concurrent fills share one call;<br>• the first statement stays the strict gate;<br>• `_ts1FillRow` contains exactly one `runTechScoreV1(`;<br>• `_ts1RowText` + `_ts1FillRow` contain no `fetch(`, `localStorage`, `sessionStorage`, `document.cookie`, `indexedDB` |
| `qa/eod_packet_v0_offline.js` RD-F2 | `_ts1ResolveMarket` **unchanged**; `_ts1FetchRawSeries` still calls it; the timezone literal is defined once |
| `qa/ts1_default_exposure_offline.js` TX-3 | the engine's first statement stays the strict gate. The map entries change only through `--update` |
| `qa/tech_snapshot_cache_offline.js` TC-13 | TS1 region / function pins carried by `--update`; no `_ts1*` reference added to that suite's guarded functions |
| R-2 | no new top-level **function** outside `_ts1FetchRawSeries`'s region helpers below. Braces inside literals stay balanced; a post-change SETUP row proves complete extraction of every edited function |

## §1 Slices (continuous; automatic continuation on PASS)

**S1 — characterisation suite (RED / GREEN baseline).** New `qa/ts1_reliability_offline.js`: pure Node, real functions extracted from `index.html`, stub `fetch` returning Polygon-shaped (`meta._provider: 'polygon'`, `exchangeTimezoneName: 'America/New_York'`) or Yahoo-shaped (`_provider` absent) chart JSON from seeded generators. Rows:

| ID | Assertion | Expected at S1 |
|---|---|---|
| TR-1 | holding Polygon + all benchmarks Polygon → numeric score, 100 % coverage, no integrity code | GREEN |
| TR-2 | holding **Yahoo** → `SERIES_PROVENANCE_UNESTABLISHED`, score null, coverage 0 (I-1 safeguard) | GREEN — must stay GREEN in every slice |
| TR-3 | holding Polygon + SPY / QQQ **Yahoo** → RS components missing, coverage 70 %, integrity code present (the FROG 84.29 / 70 % shape) | GREEN — must stay GREEN |
| TR-4 | one `runTechScoreV1(X)` issues 1 holding + ≤ 3 benchmark fetches; two runs for two tickers within the TTL fetch SPY / QQQ **once** | **RED** at S1 (today: refetched) |
| TR-5 | concurrent `_ts1FetchRawSeries('SPY')` calls share one request | **RED** |
| TR-6 | a Yahoo-provenanced or failed response is **never cached**; the next call refetches | **RED** (cache absent) |
| TR-7 | `_ts1FillRow`: a degraded result (status `UNAVAILABLE`, or any `TS1_FAILCLOSED_INTEGRITY_CODES` reason) is reused within 120 s and recomputed after 120 s (injected clock via `Date.now` stub) | **RED** |
| TR-8 | `_ts1FillRow`: a full result is recomputed when the ticker's `_cockpitResults` entry carries a different `_runId` than the one the memo was filled for; same `_runId` → reused | **RED** |
| TR-9 | with `_cockpitResults` undefined (T6 harness shape), behaviour equals today's: one call, memo reused, keys = symbols | GREEN |
| TR-11 | after a `_runId` change, the row recomputes: the engine runs again (new `computedAt` in `_techScoreDebug`) and the snapshot builder's provenance checks run again, **including when the raw series is served from the cache**; a cached Polygon series plus a Yahoo benchmark still yields the integrity code | **RED** |
| TR-12 | a cache entry older than 15 min (injected clock) is refetched. If that refetch returns Yahoo, the result fails closed exactly as TR-2 (the expired Polygon entry is not reused) | **RED** |
| TR-10 | SETUP: every edited function extracts completely; the §C invariants hold (`runTechScoreV1(` count 3; helper sources clean of storage / network tokens; `_ts1ResolveMarket` byte-identical) | GREEN |

**S2 — fetch dedupe and positive cache** (inside `_ts1FetchRawSeries` only, plus at most one module-level `var` holding the in-memory cache, placed directly above it in the SCORE-V1 region):
- In-flight dedupe per symbol.
- Positive cache for `provider === 'polygon'` responses only, keyed by symbol, TTL 15 min (TSR-2).
- Yahoo / error / timeout results are returned but not cached.
- Memory only; never persisted. The returned object shape is unchanged.
- TR-4…TR-6 and TR-12 turn GREEN; TR-1…TR-3, TR-9, TR-10 stay GREEN.

**S3 — row freshness** (inside `_ts1FillRow` only):
- After resolution, a degraded result is stamped to expire after 120 s.
- The memo entry is stamped with the ticker's current `_runId` (read from `_cockpitResults` through a `typeof` guard). A later fill with a different `_runId`, or past expiry, drops the entry and recomputes.
- A full result with an unchanged `_runId` is reused.
- No UI text change: `_ts1RowText` untouched; no reason text in the row.
- TR-7…TR-9 and TR-11 turn GREEN.

**§2 Continuation:** each slice continues when:
- its rows are GREEN and earlier rows stay GREEN;
- §C holds;
- `index-pins --diff <base>` lists only the slice's functions (S2: `functions._ts1FetchRawSeries` + `regions.ts1_region` + digest; S3: `functions._ts1FillRow` + digest);
- Codex has no unresolved Class I.

**Program STOP:**
- any §C test would need editing;
- any provenance rule or pure TS1 function changes;
- the `runTechScoreV1(` count ≠ 3;
- any UI text change;
- any live / DEV / Netlify action by the Worker;
- `market-data.js` touched;
- a second heavy run.

## §F Feasibility evidence (COWORK scratch prototype at `f6493ce`, outside the repo, deleted after the check; reference only, no approval)

- **Characterisation, real `runTechScoreV1` region, stub fetch:**
  - Polygon everywhere → scored, 100 %.
  - Yahoo holding → `SERIES_PROVENANCE_UNESTABLISHED` (+ `BELOW_COVERAGE_FLOOR`, `SMA_COMPONENT_UNAVAILABLE`), score null, coverage 0. This is the NVDA / MSFT DEV shape.
  - Yahoo SPY / QQQ → coverage 70 % with `SERIES_PROVENANCE_UNESTABLISHED`. This is the FROG 84.29 / 70 % DEV shape.
  - Two tickers fetch SPY / QQQ twice (8 calls).
- **S2 prototype:** the same two tickers make 6 calls (SPY / QQQ once). A Yahoo holding is refetched (not cached) and still fails closed. A later ticker reuses cached Polygon benchmarks.
- **S3 prototype:** a replica of the protected T6 harness (`window`, `document`, `runTechScoreV1` only) passes all T6 assertions (gate, concurrent sharing, memo reuse, keys, degrade texts, clean helper sources, strict gate first, one engine call). Degraded TTL (reuse < 120 s, refetch > 120 s) and `_runId` invalidation behave as specified. 21 / 21 checks.

## §3 Codex review requirements

- **Step 8, per slice, on the real diff.** Confirm:
  - I-1 preserved (TR-2 / TR-3 unchanged);
  - the cache admits Polygon-provenanced data only and is memory-only;
  - no storage / network token in the row helpers;
  - the T6 harness shape still works (`typeof` guards);
  - `runTechScoreV1(` count 3;
  - each planted negative bites.
- **Step 12:** final check.

**Planted negatives (in the suite):**
- caching Yahoo results → TR-6 fails;
- removing in-flight dedupe → TR-5 fails;
- degraded results kept forever → TR-7 fails;
- ignoring `_runId` → TR-8 fails;
- treating Yahoo as `explicit` → TR-2 fails;
- cache TTL ignored → TR-12 fails;
- scores cached instead of raw series (skipping the builder) → TR-11 fails.

## §ET (ET-1; non-blocking)

**Estimate (calibrated model):**
- 10 min setup;
- S1 about 15 min (fixtures);
- S2 and S3 about 8 min each;
- 15 min closure;

**about 55 min** plus Owner gates. The Worker records step 0 / step 10 start–end, slice checkpoints, Codex rounds and request print times in `## Timing`.

## §CMD Command card (one command per Bash call; Bash only; absolute canonical root)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
node qa/guard_integrity_check.js --task task/tech-score-reliability-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/ts1_reliability_offline.js
node qa/ts1_default_exposure_offline.js
node qa/tech_snapshot_cache_offline.js
node qa/eod_packet_v0_offline.js
node qa/tools/index-pins.js --diff <base>
node qa/tools/index-pins.js --update
node qa/tools/index-pins.js --check
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/tech-score-reliability-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/tech-score-reliability-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (expected prompts):** `git add <explicit paths>`.
- **C (Owner gates):** R11, R12 LAND, R12 PUSH; a heavy-lane go-ahead only if E1-D7 (weekly forced replay) is due at step 0 (from 2026-10-18).
- **Never:** `curl`, `WebFetch`, `netlify`, PowerShell.

## §PEP / §UER

- **§PEP:** classes as in the card; expected prompts are the `git add` staging and the two R12 verbs. Slice continuation needs no Owner input. FORM-RECOVERY applies only if this task is task-started after `form-recovery-1` lands; otherwise STOP-6 applies as written.
- **§UER:** **ATTENDED-ONLY**.

## §Y Files, land-scope, land-tests

```
index.html                         _ts1FetchRawSeries (+ one cache var above it) · _ts1FillRow
qa/ts1_reliability_offline.js      NEW (TR-1…TR-12 + planted negatives)
qa/fixtures/index-pins.json        regenerated per slice
```

<!-- land-scope:begin -->
index.html
qa/ts1_reliability_offline.js
qa/fixtures/index-pins.json
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/ts1_reliability_offline.js
node qa/ts1_default_exposure_offline.js
node qa/tech_snapshot_cache_offline.js
node qa/eod_packet_v0_offline.js
node qa/tools/index-pins.js --check
node qa/index_pins_offline.js
node qa/high1y_label_offline.js
node qa/ma_stack_label_offline.js
node qa/no_synthetic_score_offline.js
node qa/narrative_consistency_offline.js
node qa/ath_isolation_offline.js
node qa/deep_dive_v0_offline.js
node qa/ui_hygiene_offline.js
<!-- land-tests:end -->

**Skills:** `pt-offline-suite` Required. `/plan` mandatory (all three slices).

**§L:** close at the last passed slice (M-4): archive first, reset only the unfinished slice.

**Post-push DEV check** (separate approval, COWORK, read-only): reload DEV twice, read `_techScoreDebug` / row text for the active ticker, and compare call counts from the network log. No scan.
