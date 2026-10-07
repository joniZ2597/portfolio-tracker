# Task brief: r1b2-ath-auto — R-1 Slice B2-auto: automatic, server-derived ATH maintenance

Operational only when the Owner has approved these exact contents and the brief-only commit records them unchanged.

| | |
|---|---|
| Backlog | **Entry 34 — `partial`**: automatic maintenance done; B4 (client wiring) remains. `BACKLOG.md` is in the file set and land-scope; only the Entry 34 text changes (step 10a) |
| Baseline | `e7bbbbb0cd903cae13ee81c7f162a64a4f024e25` (`branch-dev` = `origin/branch-dev`, 2026-10-08, after `pt-skills-v1`). The ATH files are byte-identical to `32c4388` |
| Branch / slot | `task/r1b2-ath-auto`, **Worker B**. Bootstrap moves the slot from `32c4388` to the brief commit |
| Mode | **Manual** — persisted schema (`ath:v2`), a new public route, server-side external fetches, live DEV enablement |
| qa:offline | step-0 baseline **68** → **70** (+ `qa/ath_auto_offline.js`, `qa/ath_ensure_offline.js`) |
| Parallel with | Worker A in the `index.html` lane (R-2). No shared file. One full `qa:offline` at a time on the laptop |
| 3A-M | **Start the 3A-M sampler before step 0 and before step 10** (natural full runs; `_held-briefs/qa-calibration/3A-M-procedure.md`) |
| Status | FINAL, Owner rulings §0 (2026-10-08). Supersedes `r1b2-ath-refresh-brief.FINAL.md` |

## 0. Owner rulings (not reopened)

1. **Automatic maintenance (2026-10-08):**
   - during a scan the stored verified ATH is read;
   - if none exists, the server derives and stores it from trusted market data;
   - if the current price / high reaches or exceeds it, the server re-checks candles and updates it;
   - a split marks the record `stale-suspect` and it is re-derived server-side;
   - normal operation needs no operator CLI and no manual TradingView verification.
2. **Trust rule:**
   - the browser never submits an authoritative ATH value;
   - every automatically written value is derived server-side from trusted market data;
   - public reads are read-only;
   - write / seed / admin mutation paths stay protected.
3. **D-A1:** a public `ath-ensure`, ticker-only input. Admin / write routes stay separately protected.
4. **D-A2:** automatic records for **any valid supported ticker** within the server budget. The tracked-universe
   allowlist is **not** the automatic gate.
5. **D-A3 (with the Owner's change):** encoded exactly in §2.4.
6. **D-A4:**
   - introduce `ath:v2`; automatic records are re-derived automatically;
   - **operator-fixed / recovery records keep precedence** and are never silently replaced by a full automatic
     re-derive.
7. **D-A5 (DEV calibration values, review after the first week):**
   - verified cooldown **6 h**;
   - unresolved cooldown **24 h**;
   - Yahoo fetch budget **300 / hour**.
8. **Public read contract (2026-10-08):** read by symbol is public and read-only. It exposes only the public ATH
   record / status — no portfolio, watchlist, holdings or operator-activity data.
9. **Still binding from R-1:**
   - **never** the 1Y High as ATH;
   - `stale-suspect` / `unresolved` → ATH omitted;
   - a failed refresh never discards a verified ATH;
   - ATH is display + AI only, never setup or score (D6);
   - DEV only;
   - TradingView / operator verification only as exceptional recovery.

## 1. Scope

**In (server only):**
- schema `ath:v2` + v1 upgrade;
- pure derivation, incremental-update and split functions with the D-A3 rule;
- a Yahoo fetch / parse module;
- the public `ath-ensure` route with cooldowns and budget;
- the public `ath-read` (contract `ath-read-v2`);
- the write route kept as the protected recovery path, producing v2 operator records;
- suites;
- the FR06 route re-pin;
- the Entry 34 text.

**Out:**
- `index.html` and any client code (B4);
- prompts, UI, scoring, setup;
- the operator tool (`tools/ath-verify-owner.js` stays byte-identical; it is the recovery path);
- Polygon or any other provider for ATH;
- scheduled functions;
- production.

## 2. What must be true

### 2.1 Schema `ath:v2` (`ath-record.js`)

- **Exact key set:** `schema` (`'ath:v2'`), `ticker`, `providerSymbol`, `currency`, `unit`, `basis`, `status`
  (`verified | unresolved | stale-suspect` — vocabulary unchanged), `method` (`auto | operator`), `athValue`,
  `athDate`, `verifiedAt`, `evidence`, `refresh` (`{ status: none | unresolved, lastAttemptAt, reason }`),
  `lastCheckedAt`, `splitCheckedThrough` (ISO day or `null`).
- **Evidence by `method`:**

  | `method` | `evidence` |
  |---|---|
  | `auto` | `{ source: 'yahoo-daily', firstTradeDate, firstBarDate, barCount, matchedBar: { date, high, open, close }, rejectedBars: [{ date, high, open, close, reason }] (≤ 500), splitsSeen: [{ date, ratio }] }` |
  | `operator` | the v1 evidence object unchanged (TradingView readings, matched bar, higher bars, coverage, independent / search) |

- **v1 records:**
  - read as `method: 'operator'` through a pure `upgradeV1(record)`; never re-derived by a full automatic derive;
  - all existing v1 records were operator-written by B3;
  - the upgrade is written back only when the record next changes.
- **Reason codes** (fixed vocabulary, written to `refresh.reason`, or to `evidence` for `unresolved`): `FETCH_FAILED`,
  `BODY_INVALID`, `COVERAGE`, `SUSPECT_MATERIAL`, `NO_RELIABLE_ATH`, `SPLIT_INCONSISTENT`, `UNSUPPORTED`.

### 2.2 Trusted source (`ath-yahoo.js`, the only ATH module allowed to make a network call)

- **Request:** `GET https://query1.finance.yahoo.com/v8/finance/chart/<SYM>` with
  `interval=1d&period1=0&period2=<now>&events=split`, server-side, 12 s timeout, one request per decision. Recent
  checks use `period1=<lastCheckedAt day − 7 d>`.
- **Requires:**
  - `meta.currency`;
  - `meta.firstTradeDate`;
  - aligned `timestamp` / `indicators.quote[0].{open,high,close}`.

  Bar dates are converted to the exchange day (`meta.exchangeTimezoneName`). Bars with no high are skipped. Splits
  come from `events.splits` (`{ date, ratio = numerator / denominator }`).
- **Unit** follows the instrument (ILA for `.TA`, as B1). Highs are split-adjusted and not dividend-adjusted (validated
  2026-10-05).
- **No Polygon, no other provider.** Any failure → `FETCH_FAILED` / `BODY_INVALID`, nothing derived.

### 2.3 Full derive (pure: `deriveAuto(series, nowIso)`)

1. **Coverage:** the first bar is within **62 days** of `firstTradeDate`, otherwise `unresolved` / `COVERAGE`.
2. **Classify every bar** (§2.4).
3. **A** = the maximum high over **accepted** bars. Ties go to the earliest date. `athDate` = that bar's exchange
   day.
4. **Materiality check** (§2.4).
5. **Result:** `verified` (`method: 'auto'`) with `matchedBar`, `rejectedBars` and `splitsSeen`, or `unresolved` with
   its reason.

### 2.4 D-A3 — suspect bars and materiality (exact rule)

For each bar with a finite positive `high`, let `body = max(open, close)` over its finite positive values.

| Bar class | Condition | Can be an ATH candidate? |
|---|---|---|
| **accepted** | `body` defined and `high ≤ 2 × body` | yes |
| **suspect** | `body` defined and `high > 2 × body` (strictly more than double both its open and its close) | **no** — recorded in `rejectedBars` with reason `SUSPECT_SPIKE` |
| **unassessable** | neither `open` nor `close` is a finite positive number | **no** — recorded with reason `UNASSESSABLE` |

Let **A** = the maximum high of the accepted bars.
- **`NO_RELIABLE_ATH`:** there are no accepted bars → `unresolved`.
- **Material suspect:** a suspect bar is *material* iff `2 × body > A`. Its true high is unknown but at least `body`,
  and a genuine high up to `2 × body` would be plausible, so that day could hold the real ATH. Any material suspect bar
  → `unresolved` / `SUSPECT_MATERIAL`.
- **Material unassessable:** an unassessable bar is *material* iff its `high > A`. Any material unassessable bar →
  `unresolved` / `SUSPECT_MATERIAL`.
- **Non-material bars are recorded and ignored.** They never block an otherwise deterministic ATH, **however many
  there are**. There is no count cap.
- **Boundaries are strict:**
  - `high = 2 × body` is accepted;
  - `2 × body = A` is not material.

### 2.5 Incremental update (pure: `applyRecentBars(record, recentSeries, nowIso)`)

- **Scope:** only bars dated **after** the stored `athDate` are considered, classified with §2.4.
- **New candidate:** the maximum accepted high among them is **B**. If `B > athValue`, the record becomes `athValue = B`
  with its exact day; `method` is unchanged. An operator record raised this way stays `operator`, with the new matched
  bar appended to its evidence as `autoRaise`.
- **Material suspect in the recent bars** (`2 × body > max(athValue, B)`, or an unassessable bar with
  `high > max(athValue, B)`):
  - the stored value is kept (verified stays shown, per the "failed refresh never discards" rule);
  - `refresh` = `{ status: 'unresolved', reason: 'SUSPECT_MATERIAL' }`, flagged for recovery.
- **Unchanged:** `verifiedAt`, `evidence.firstTradeDate`, coverage.
- **Always updated:** `lastCheckedAt` and `splitCheckedThrough`.

### 2.6 Splits (pure: `applySplits(record, splits, nowIso)` + `checkSplitConsistency`)

1. **Trigger:** a split dated after `splitCheckedThrough` (or after `verifiedAt` when that is null) → `status:
   'stale-suspect'`, value kept but suppressed by the reader. **Persisted before any re-derive.**
2. **`method: 'auto'` records:** a full derive follows in the same request.
   - It is accepted only if **either** the new ATH's date is after the split date, **or** `|A_new / (A_old / ratio) − 1|
     ≤ 0.005`.
   - Otherwise the record stays `stale-suspect` with `refresh.reason = 'SPLIT_INCONSISTENT'` and is retried after the
     cooldown.
3. **`method: 'operator'` records:** they stay `stale-suspect` (`refresh.reason = 'SPLIT_NEEDS_RECOVERY'`). **No
   automatic full re-derive** (D-A4 precedence). They return to `verified` only through the protected recovery path,
   or by the Owner deleting the record through the existing protected teardown path, after which a fresh automatic
   record can be derived.

### 2.7 `ath-ensure` route (new: `netlify/functions/ath-ensure.mjs` + `lib/ath-ensure-core.js`)

- **Gate:** `PT_ENABLE_ATH_ENSURE_SERVER === 'true'`, checked first; otherwise `DISABLED`.
- **Input:** `POST`, body exactly `{ "ticker": "<SYM>" }` matching `^[A-Z]{1,10}(\.TA)?$`. Any other key, a price, a
  value or a date → `400 INVALID_SUBMISSION`. No `Authorization` is needed, and one that is supplied is ignored.
- **Decision table:**

  | Stored state | Cooldown passed? | Action |
  |---|---|---|
  | none | — (the budget applies) | full derive |
  | `auto` `unresolved` | 24 h since `lastCheckedAt` | full derive |
  | `stale-suspect` (auto) | 6 h | full derive (split rule §2.6) |
  | `stale-suspect` (operator) | — | no fetch |
  | `verified` (either method) | 6 h | recent check: splits first (§2.6), then the incremental update (§2.5) |
  | any state, cooldown not passed | — | no fetch, no write |

- **Budget:** at most **300** Yahoo fetches per clock hour, counted in Blob key `ath:budget:<YYYY-MM-DDTHH>` by
  read-modify-write. Approximate under concurrency, which is acceptable for DEV. When exhausted → no fetch, current
  record returned, response `budget: 'exhausted'`.
- **Writes:**
  - only `set(ath:v1:<TICKER>, <v2 record>)` — the key namespace is unchanged so existing records upgrade in place;
  - the budget counter key;
  - no `list`, no `delete`.
  - A full derive never lowers a higher stored verified value **except** through the accepted split path.
  - Writes are skipped when the derived record equals the stored one apart from timestamps.
- **Response:** the public projection (§2.8) plus `{ action: 'none' | 'derived' | 'checked' | 'raised' |
  'stale-suspect', budget: 'ok' | 'exhausted' }`. No raw Yahoo data. No evidence beyond the projection.

### 2.8 Public read (`ath-read`, contract `ath-read-v2`)

- **Gate** `PT_ENABLE_ATH_READ_SERVER === 'true'` kept; **no token, no allowlist on read**; ticker format check kept;
  `POST { ticker }` kept.
- **Projection keys, exactly:** `readContractVersion` (`'ath-read-v2'`), `status`, `ticker`, `recordStatus`,
  `athValue`, `athDate`, `unit`, `currency`, `basis`, `method`, `verifiedAt`.
- `athValue` / `athDate` only for `verified`. `stale-suspect` / `unresolved` → `null` + `recordStatus`. No record →
  `NOT_AVAILABLE`.
- **Never exposed, including in errors:** `evidence`, `refresh`, `lastCheckedAt`, `splitCheckedThrough`, allowlist
  contents.
- Store access is exactly one `get`; no `list`, `set` or `delete`.
- `Cache-Control: public, max-age=60`. `ath-ensure` responses are `no-store`.

### 2.9 Protected write path (recovery)

- `ath-write` keeps its gate, Bearer write token, allowlist and collision checks **byte-identical in behaviour**.
- A successful operator verification now writes a v2 record with `method: 'operator'` and the v1 evidence shape.
- The B1+B3 write rules are otherwise unchanged (a failed attempt never overwrites a verified or `stale-suspect`
  record).
- `PT_ATH_READ_TOKEN` is no longer read by the reader. It stays in the write side's collision list only if present.

## 3. Required / Recommended Skills

| Skill | Required / Recommended | Why |
|---|---|---|
| `pt-offline-suite` | **Required** | Sweep across the `ath_*` suites, FR06 and AR-7; re-baselines with revert proof; planted negatives on production source and fixtures |
| `pt-ai-output-change` | — | No AI surface in this task (B4 owns it) |
| `browser-integrity-qa` | — | No browser step |

## 4. Files — exactly 15 + `review.md` (sweep at `e7bbbbb`)

```
netlify/functions/lib/ath-record.js      v2 schema, upgradeV1, deriveAuto, applyRecentBars, applySplits, checkSplitConsistency, §2.4 classifier
netlify/functions/lib/ath-yahoo.js       NEW — server fetch + parse (§2.2); fetch injectable; the only ATH module with a network call
netlify/functions/lib/ath-ensure-core.js NEW — §2.7
netlify/functions/ath-ensure.mjs         NEW — route wrapper (same shape as ath-read.mjs)
netlify/functions/lib/ath-read-core.js   public read, ath-read-v2 projection, cache header
netlify/functions/lib/ath-preflight.js   read side: gate + ticker only; new ensure side: gate + ticker only; write side byte-identical
netlify/functions/lib/ath-write-core.js  writes v2 operator records; rules otherwise unchanged
qa/ath_auto_offline.js                   NEW — §5 F-rows (pure functions, fixtures)
qa/ath_ensure_offline.js                 NEW — §5 E-rows (route, stubbed fetch + in-memory store)
qa/ath_record_offline.js                 v1 → v2 schema rows (re-baseline with revert proof)
qa/ath_read_offline.js                   token / allowlist rows → public-read rows; v2 projection keys
qa/ath_write_offline.js                  v2 operator output; unchanged rules re-asserted
qa/ath_isolation_offline.js              SERVER_FILES += the three new files; ALLOWED_ENV_KEYS += PT_ENABLE_ATH_ENSURE_SERVER; AR-7c: network call allowed only in ath-yahoo.js; AR-7e require sets; AR-7f / AR-7i unchanged
qa/fund_facts_route_offline.js           FR06 exposure pin +1 route (ath-ensure.mjs)
BACKLOG.md                               Entry 34 text only
```

- **Expected unmodified:** `qa/ath_owner_tool_offline.js` and `tools/ath-verify-owner.js`.
- **Sweep result:**
  - the readers of the ATH modules are only the `ath_*` suites;
  - FR06 pins the function directory;
  - AR-7 pins `index.html`, two preflights and `market-data.js` (none touched);
  - no other suite reads these files.
- **No protected path** (no `protected-scope` block).

<!-- land-scope:begin -->
netlify/functions/lib/ath-record.js
netlify/functions/lib/ath-yahoo.js
netlify/functions/lib/ath-ensure-core.js
netlify/functions/ath-ensure.mjs
netlify/functions/lib/ath-read-core.js
netlify/functions/lib/ath-preflight.js
netlify/functions/lib/ath-write-core.js
qa/ath_auto_offline.js
qa/ath_ensure_offline.js
qa/ath_record_offline.js
qa/ath_read_offline.js
qa/ath_write_offline.js
qa/ath_isolation_offline.js
qa/fund_facts_route_offline.js
BACKLOG.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/ath_auto_offline.js
node qa/ath_ensure_offline.js
node qa/ath_record_offline.js
node qa/ath_read_offline.js
node qa/ath_write_offline.js
node qa/ath_isolation_offline.js
node qa/ath_owner_tool_offline.js
node qa/fund_facts_route_offline.js
<!-- land-tests:end -->

## 5. QA (offline; Yahoo stubbed; every row has a planted negative on production source or fixtures)

### 5.1 `qa/ath_auto_offline.js` — pure functions

| ID | Fixture | Expected | Planted negative |
|---|---|---|---|
| F-1 | NVDA-like: 6 splits, clean bars | `verified`, A = the maximum high, exact day; `splitsSeen` = 6 | max taken over all bars (suspect included) |
| F-2 | MTRX-like: two 2007 spikes (high 5,720,013, close 1,370; high 3,800,003.5, close 1,400) + a later genuine high 15,240 | `verified` 15,240; both spikes in `rejectedBars` (`SUSPECT_SPIKE`); not material (2 × 1,400 = 2,800 ≤ 15,240) | spikes treated as material |
| F-3 | Five old irrelevant suspect bars, all with 2 × body ≤ A | `verified` (no count cap) | a "> 2 rejected → unresolved" cap reintroduced |
| F-4 | Material suspect: body 9,000, high 50,000, accepted A 15,000 | `unresolved` / `SUSPECT_MATERIAL` | materiality uses the spike high or ignores the body |
| F-5 | Unassessable bar (no open / close) with high above A | `unresolved` / `SUSPECT_MATERIAL`; the same bar with high ≤ A → `verified` | unassessable treated as accepted |
| F-6 | Every bar suspect or unassessable | `unresolved` / `NO_RELIABLE_ATH` | A computed from rejected bars |
| F-7 | Boundaries: high = 2.000 × body; 2.0001 × body; 2 × body = A | accepted; suspect; not material | `≥` instead of `>` |
| F-8 | First bar 70 days after `firstTradeDate` | `unresolved` / `COVERAGE` | coverage skipped |
| F-9 | Incremental: verified 100; later accepted bar 103 | raised to 103, exact day; `method` unchanged | value lowered or `method` flipped |
| F-10 | Incremental: later suspect bar body 60 (2 × 60 = 120 > 100) | value 100 kept; `refresh` = `unresolved` / `SUSPECT_MATERIAL` | value replaced or record `unresolved` |
| F-11 | Split 10:1 after `verifiedAt`, auto record 1,000 → re-derive 100.2 | `verified` 100.2 | inconsistency ignored |
| F-12 | Same split, re-derive 120 dated before the split | stays `stale-suspect` / `SPLIT_INCONSISTENT` | accepted |
| F-13 | Split on an **operator** record | `stale-suspect` / `SPLIT_NEEDS_RECOVERY`; no full derive | auto re-derive replaces the operator record |
| F-14 | Operator record + later accepted higher bar | raised incrementally; stays `operator` | full re-derive replaces it |
| F-15 | `upgradeV1` | every v1 record → v2 `operator`, evidence unchanged; round-trip valid | upgraded as `auto` |
| F-16 | ILA unit (`.TA`) and exchange-day conversion | unit ILA; dates in the exchange day | UTC day used |

### 5.2 `qa/ath_ensure_offline.js` — route (stubbed fetch, in-memory store)

| ID | Requirement | Planted negative |
|---|---|---|
| E-1 | Gate off → `DISABLED`, zero store or fetch calls | gate skipped |
| E-2 | Extra body key (`athValue`, `price`, `date`, …) → `400 INVALID_SUBMISSION`, zero fetch | extra key accepted |
| E-3 | No record → one fetch, `derived` | two fetches |
| E-4 | Cooldowns: 6 h verified / 24 h unresolved / operator `stale-suspect` never fetched | cooldown ignored |
| E-5 | Budget: the 301st fetch in an hour → none, `exhausted`, record returned | budget ignored |
| E-6 | Fetch failure on a verified record → value kept, `refresh` = `unresolved` / `FETCH_FAILED` | value cleared |
| E-7 | Only `get` / `set` on `ath:v1:<T>` and the budget key; no `list` / `delete` | a `list` call |
| E-8 | A response never contains `evidence`, `refresh`, `lastCheckedAt` or raw Yahoo data | evidence leaked |
| E-9 | A supplied `Authorization` header changes nothing | token required |
| E-10 | No write when the derived record equals the stored one apart from timestamps | redundant write |

### 5.3 Re-baselined suites (each with revert proof)

- **`ath_read`:** the response is identical with and without a token; exactly the v2 keys; one `get`; no write.
- **`ath_write`:** a missing or wrong write token is still refused; v2 operator output.
- **`ath_record`:** the v2 schema; v1 is refused as a stored v2 but accepted via `upgradeV1`.
- **`ath_isolation`:** a network call **only** in `ath-yahoo.js`; no 1Y High, DOM, storage or scoring references;
  AR-7f / AR-7i unchanged.
- **FR06:** +1 route.

**Full `qa:offline`:** 68 → 70, PASS.

## 6. Live actions (DEV only; each needs the Owner's explicit approval before it runs)

| # | Action | Bound |
|---|---|---|
| L-1 | Netlify DEV: set `PT_ENABLE_ATH_ENSURE_SERVER=true` (and confirm `PT_ENABLE_ATH_READ_SERVER=true`) | env write, after push |
| L-2 | `ath-ensure` for **NVDA, MRNA, SPY, MTRX.TA** (the validation set), from COWORK's browser session on the DEV origin | 4 requests (≤ 4 Yahoo fetches) |
| L-3 | `ath-read` for the same 4 | 4 requests |

**L-2 check:**
- NVDA and SPY: the latest daily high level, not the 1Y High label;
- MRNA ≈ 497.49 (Aug 2021);
- MTRX.TA ≈ 15,240 (2007 spikes rejected, not material);
- any `unresolved` is reported with its reason.

No production. No Polygon. A value you dispute → recovery path, not a code change in this task.

## 7. Flow

- AGENTS.md steps 0–16, Mode Manual. `/plan` before the first file write, with the `CLAUDE.md` pre-flight checklist:
  - **gates:** `PT_ENABLE_ATH_ENSURE_SERVER === 'true'`, `PT_ENABLE_ATH_READ_SERVER === 'true'` (strict string,
    checked before any I/O);
  - **definition of done:** §8.
- **Step 0 and step 10** are natural 3A-M captures (header).
- **Live L-1…L-3** only after push, each after its approval.

## 8. STOP (in addition to STOP-1..6)

- any client-supplied value reaching a stored record;
- a network call outside `ath-yahoo.js`;
- any provider other than Yahoo;
- any change to `index.html`, the operator tool or prompts;
- a full automatic derive replacing an operator record;
- a count cap on rejected bars, or a non-material suspect bar blocking a record;
- the 1Y High anywhere in the ATH path;
- a response exposing evidence, refresh, timestamps or allowlist contents;
- any `list` / `delete` in ensure or read;
- a live call without its approval.

## 9. Definition of Done

- F-1…F-16 and E-1…E-10 PASS, with planted negatives caught.
- Re-baselined suites PASS with revert proof; `ath_owner_tool` PASS unmodified.
- Full `qa:offline` PASS at 70.
- L-1…L-3 done with approval and recorded, or explicitly deferred.
- Entry 34 text: automatic maintenance done; B4 remains.
- Codex: no unresolved Class I finding.
- LANDed, pushed, cleaned.
