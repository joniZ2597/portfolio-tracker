# Task brief: r1b-ath-store-seed — R-1 Slice B (B1+B3): a verified ATH store and the operator flow that seeds it

True all-time high only. Never the 1Y High.

| | |
|---|---|
| Backlog | **Entry 34 — effect `partial`** ("1Y High vs true all-time high"). B1+B3 do not close it. Closure needs B4 (UI and AI wiring). `BACKLOG.md` is in the file set and the `land-scope` block; only the Entry 34 text is amended (step 10a), status unchanged |
| Baseline | `5844eab5fcc8d08f19ee77e89433f9d7bab515f0` (`branch-dev`, 2026-10-07; `origin/branch-dev` = `bb9f94c59e4ca3faae94cbdfad48c36a2fc70eea`, so `branch-dev` is 1 commit ahead, unpushed). Anchors verified at this commit |
| Branch / slot | `task/r1b-ath-store-seed`, Worker B (`pt-wt-worker-b`). The branch is created from the then-current `branch-dev` after the brief commit |
| Mode | **Manual, attended** — new server routes, a Blob store, a persisted record shape, and live external calls (§7) |
| qa:offline | baseline measured fresh at Step 0 → baseline + the new suites in §6 (5 files). Suites are auto-discovered (`.claude/rules/qa-suites.md`); there is **no** `qa/run-offline.js` edit |
| Parallel with | Worker A `task/qa-stage2-git-contracts` (`qa/lib/fixture-template.js` and the land-suite files). No shared file. **No heavy QA while Worker A runs heavy QA**: the full `qa:offline` and the land suites run one at a time on the laptop. Light suites may run any time. If Worker A lands first, this task re-syncs before LAND |
| Status | FINAL, Owner-approved 2026-10-07, baseline pinned. Owner rulings §0. No decision open |

## 0. Owner rulings (not reopened)
1. Server-side canonical storage. Not `localStorage`.
2. Proximity trigger: within **2%** of the verified ATH.
3. Verification tolerance: **0.5%**.
4. A split marks the record `stale-suspect` until re-verified. (The trigger is B2. The status exists in B1.)
5. While `stale-suspect` or `unresolved`, ATH is omitted from AI and **never** falls back to 1Y High.
6. Seeding is limited to the current tracked/watchlist universe, from **one explicit snapshot** supplied at seed time. No arbitrary tickers.
7. **A failed refresh never discards a verified ATH.** It is tracked separately. Only a true `stale-suspect` condition suppresses the stored value.
8. **Search is evidence only.** It is recorded and never blocks a record otherwise verified by TradingView plus matching market data.
9. **DEV only.** Every live seed batch, Blob write and Yahoo call needs explicit Owner approval before it runs.
10. Implementation order B1 → B3 → B2 → B4. B1 and B3 are designed together so B1 has real verified records right after seeding.
11. **No bar is ever rejected for looking implausible,** whether statistically (for example 10× its own close) or visually. There is no operator override and no `unrefutedByChart` flag.
12. **Coverage gaps** (TradingView `All` doesn't reach an older Yahoo bar): TradingView verifies only the history it covers. The uncovered period needs separate independent evidence, or the record stays `unresolved`.

## 1. Scope
**In:**
- **B1:** record schema, pure comparison, store, gated reader.
- **B3:** gated writer, the operator verification CLI, the seed run.

**Out:**
- Refresh triggers and `pending` handling (B2).
- UI and AI prompt wiring, and the `*_near_ath` setup names (B4).
- **Any change to `index.html`.** Slice A needed hash re-pins for this. B1+B3 stay clear of them.
- Scoring, `localStorage` and every existing function.

## 2. Frozen names
Following the fund-facts conventions (`PT_ENABLE_<X>_SERVER`, `PT_<X>_TOKEN`, `PT_<X>_READ_TOKEN`, `PT_<X>_ALLOWED_TICKERS`, `<x>-store`):

| Item | Name |
|---|---|
| Routes | `/.netlify/functions/ath-read`, `/.netlify/functions/ath-write` |
| Blob store | `ath-record-store` |
| Key | `ath:v1:<PROVIDER_SYMBOL>` (uppercase) |
| Read gate | `PT_ENABLE_ATH_READ_SERVER` (`=== 'true'`) |
| Write gate | `PT_ENABLE_ATH_WRITE_SERVER` (`=== 'true'`) |
| Read token | `PT_ATH_READ_TOKEN` |
| Write token | `PT_ATH_WRITE_TOKEN` |
| Allowlist | `PT_ATH_ALLOWED_TICKERS`, shared by both sides. **It is the server-side enforcement of ruling 6.** |
| Envelope vocabulary | the same as fund-facts-read: `DISABLED`, `UNAUTHORIZED`, `CONFIGURATION_MISSING`, `INVALID_TICKER`, `NOT_AVAILABLE`, `DEGRADED`, `OK`, `METHOD_NOT_ALLOWED`, `INVALID_JSON` |

- **Collision rule:** like the fund-facts preflight, the new tokens must not equal each other or any existing token (`PT_FUND_FACTS_TOKEN`, `PT_SEC_EVIDENCE_PULL_TOKEN`, `PT_SEC_EVIDENCE_STORE_WRITE_TOKEN`, `PT_OWNER_TOKEN`). The existing preflight files are not edited.
- **Ticker token rule:** the fund-facts allowlist pattern (`^[A-Za-z]{1,10}$`) rejects `.TA` and `TCH.F34`, so ATH uses its own validator. The exact pattern is pinned in the Step 0 test.
- Names verified free at the baseline: no `ath-*` file, no `ATH` env name and no `ath-record-store` exists at `5844eab`. If any name collides with something already in the repo when the Worker starts, STOP-5.

## 3. Record schema, `ath:v1`
Frozen by a suite, with an exact key set:

```
{
  schema: 'ath:v1',
  ticker, providerSymbol, tradingViewSymbol,
  currency, unit,                          // unit: 'ILA' | 'ILS' | 'USD', stated explicitly
  basis: 'split-adjusted-no-dividend-adjust',
  status: 'verified' | 'unresolved' | 'stale-suspect',
  athValue,                                // number, set only when status === 'verified'
  athDate,                                 // ISO day of the matched Yahoo bar
  verifiedAt, verifiedBy,                  // verifiedBy: 'operator'
  evidence: {
    tradingViewHigh, tradingViewFirstBarDate, tradingViewAdjSetting,
    matchedBar: { date, high },
    toleranceUsed: 0.005,
    yahooBarCount, yahooFirstBarDate,
    higherBars: [ { date, high, covered: true | false, disposition, basis } ],
      // every Yahoo bar higher than the matched bar, none dropped.
      // covered=true  -> date >= tradingViewFirstBarDate; disposition 'contradicted-by-chart', basis 'tradingview'
      // covered=false -> date <  tradingViewFirstBarDate; disposition 'contradicted-by-independent' (basis 'independent') or 'unresolved'
    coverageGap: null | {
      uncoveredFrom, uncoveredTo,          // yahooFirstBarDate .. tradingViewFirstBarDate
      independent: { kind, source, url, retrievedAt, quotedValue, quotedDate, coverageStart }
        // kind: 'bar-level' | 'ath-claim'; see section 4
    },
    searchValue: null | { value, date, citation }       // corroboration only (ruling 8)
  },
  refresh: { status: 'none' | 'unresolved', lastAttemptAt, reason },   // B2 writes this; B1 defines it
  pending: null,                                                        // reserved for B2
  lastCheckedAt
}
```
`refresh` and `pending` exist from v1 so B2 needs no schema migration. There is no free-text rejection reason and no operator-override field. `disposition` is a fixed vocabulary set only by the rules in §4.

## 4. Verification rule
**Inputs.** The operator reads TradingView `All` → right-side `High` and records the High, the first-bar date shown, and the ADJ setting. Yahoo daily history (`period1=0&interval=1d`; `range=max` returns coarse bars) identifies the matching bar, date and evidence.

**Step 1: clean match.** A Yahoo bar whose high is within 0.5% of the TradingView High. No clean match means status `unresolved`, with all numbers stored.

**Step 2: classify every Yahoo bar higher than the matched bar.** Nothing is dropped.
- **Covered** (bar date is on or after the TradingView first-bar date): the TradingView High is lower than the bar's high, so TradingView contradicts it. Recorded as `contradicted-by-chart`.
- **Uncovered** (bar date is before the TradingView first-bar date): TradingView says nothing about it. It needs independent evidence from Step 3. Without that, it is recorded `unresolved` and the whole record is `unresolved`.

**Step 3: independent evidence for the uncovered period.** The independent source must **not** be Yahoo Finance or TradingView. The writer rejects those hosts. It must be one of:
- **`bar-level`:** the source shows its own high for the specific uncovered bar date, and that value differs from Yahoo's by more than 0.5%. This is a direct contradiction of that bar.
- **`ath-claim`:** the source states an all-time-high value within 0.5% of the matched bar, and states a history start (`coverageStart`) on or before the earliest uncovered higher bar's date. This shows that over the full period the ATH is the matched bar.

The operator records `source`, `url`, `retrievedAt`, `quotedValue`, `quotedDate`, `coverageStart`. The tool cannot judge independence, so the operator attests to it, and the Owner sees it in the record. Search may be used to find such a source. Per ruling 8, search by itself is not enough: the source it surfaces must meet the `kind` rules above. If the independent source's value agrees with the Yahoo spike, the record is `unresolved`.

**Step 4: outcome.** All higher bars `contradicted-by-chart` or `contradicted-by-independent` means `verified`, with `athValue` the matched bar's high and the `coverageGap` evidence recorded. Anything else means `unresolved`.

**Never:**
- Reject a bar because it is statistically or visually implausible.
- Compute or display plausibility signals (ratio to its own close, neighbour comparison).
- Offer an operator override.

**A failed attempt on an existing `verified` record** doesn't change it. It writes `refresh.status: 'unresolved'` with the reason (ruling 7).

**Expected consequence:** a name whose corrupt bar predates TradingView's history, such as TEVA.TA (2003 bar against a chart starting about 2007), becomes `verified` only if a genuinely independent source is found. Many aggregator pages are derived from the same vendors, so this may fail and the record stays `unresolved`. That is the intended outcome of the rule.

## 5. Exact changes
**B1: store and read**
1. `netlify/functions/lib/ath-record.js`: pure schema validation, the 2% and 0.5% constants, and `compareToVerifiedAth(record, price, high)`.
   - Returns `{ state: 'unavailable' | 'below' | 'near' | 'at_or_above', distancePct }`.
   - `unavailable` for a missing record or any status other than `verified`.
   - No input path substitutes a 1Y High.
2. `netlify/functions/lib/ath-preflight.js`: gate, token, allowlist and collision checks for both sides.
3. `netlify/functions/lib/ath-read-core.js` and `netlify/functions/ath-read.mjs`: a thin wrapper that imports `@netlify/blobs`, as in `fund-facts-read.mjs`.
   - The reader returns `athValue` only when `status === 'verified'`. For `stale-suspect` or `unresolved` it returns `athValue: null` plus the status.
   - `refresh.status: 'unresolved'` on a verified record does not suppress the value.

**B3: write and seed**
4. `netlify/functions/lib/ath-write-core.js` and `netlify/functions/ath-write.mjs`: the write token is checked **before** the ticker is inspected, as in `fund-facts-core.js`.
   - The writer **recomputes the §4 classification server-side** from the submitted evidence. It does not trust a client-supplied `status` or `disposition`.
   - It rejects a `verified` record unless every higher bar is `contradicted-by-chart` or `contradicted-by-independent` per §4, and rejects independent sources hosted on Yahoo or TradingView.
   - It never lets a failed attempt overwrite a `verified` record.
5. `tools/ath-verify-owner.js`, following `tools/batch-pull-owner.js`: the operator CLI.
   - Takes the seed snapshot and processes one ticker at a time.
   - Fetches Yahoo history, lists the bars above the matched value with dates and the covered/uncovered split, and prompts for the TradingView values and any independent-source fields.
   - **Prints no plausibility annotation** and computes no ratio-to-close or neighbour comparison.
   - Has a **dry-run mode** that writes nothing, and a teardown mode that deletes the seeded keys.
   - Takes the token from the environment, never from a flag or the browser.
6. **The seed snapshot is not a committed file.** It is the one explicit snapshot of the current tracked/watchlist universe, supplied by the Owner at seed time as a JSON file outside the repository and passed to the CLI (`--snapshot <path>`). The CLI validates its shape (ticker, providerSymbol, tradingViewSymbol, unit) and refuses a snapshot with a symbol outside `PT_ATH_ALLOWED_TICKERS`. Fixtures for the tests are inline in the suites. (Pinned at baseline: the tracked tickers live in the browser, and the repository has no `data/` directory.)
7. **No edit to `qa/run-offline.js` and none to `package.json`.** The new suites are discovered automatically by filename (`.claude/rules/qa-suites.md`) and are run as `node qa/<name>_offline.js`.
8. `BACKLOG.md`: Entry 34 text amended to record that B1+B3 landed and what remains (B2, B4), status unchanged (step 10a).

**Files: exactly 13** (7 product, 5 suites, 1 backlog) — see §11.

## 6. New suites (offline, no network)
Five files, discovered automatically:

| File | Rows |
|---|---|
| `qa/ath_record_offline.js` | AR-1, AR-2 |
| `qa/ath_read_offline.js` | AR-3 |
| `qa/ath_write_offline.js` | AR-4, AR-5, AR-8 |
| `qa/ath_owner_tool_offline.js` | AR-6 |
| `qa/ath_isolation_offline.js` | AR-7 |

| ID | Assertion |
|---|---|
| AR-1 | Schema: exact key set, status vocabulary, units, `ath:v1` frozen, and no override field present |
| AR-2 | `compareToVerifiedAth`: `unavailable` for missing, `stale-suspect` and `unresolved`; `below`, `near` at exactly 2% and just either side, `at_or_above`; no 1Y High input accepted |
| AR-3 | Reader: gate off means zero Blob calls; wrong or missing token; `athValue` null for non-verified; value kept when only `refresh` is unresolved |
| AR-4 | Writer: token before ticker; disabled gate; the 0.5% boundary at 0.499% and 0.501%; a failed attempt does not overwrite a verified record; a client-supplied `status` is ignored and recomputed |
| AR-5 | **Higher bars and coverage:** every higher bar is recorded and none dropped. A higher covered bar is `contradicted-by-chart`. A higher uncovered bar with no independent evidence leaves the record `unresolved`. A higher uncovered bar with valid `bar-level` evidence (independent value differing by more than 0.5%) gives `verified` with `coverageGap` recorded. A valid `ath-claim` (within 0.5% of the matched bar, `coverageStart` on or before the bar's date) gives `verified`. An `ath-claim` whose `coverageStart` is after the uncovered bar's date does not. An independent value equal to the Yahoo spike gives `unresolved`. Independent evidence hosted on Yahoo or TradingView is rejected |
| AR-6 | Operator CLI: dry-run writes nothing; agorot unit handling; fixtures modelled on the POC cases: NICE.TA and ESLT.TA (covered corrupt bars, `contradicted-by-chart`) and TEVA.TA (uncovered corrupt bar); a snapshot with a symbol outside the allowlist is refused |
| AR-7 | Static isolation: `index.html`, scoring, existing functions and storage keys byte-equal to baseline (sha256 pins captured at Step 0) |
| AR-8 | **No plausibility path:** a spike at 10× its own close and a visually implausible bar, with no independent evidence, give `unresolved` and are never rejected. The CLI output contains no plausibility annotation. The writer accepts no operator reason or override field and rejects a record carrying one. Behavioural checks on the real functions, not a self-scan of their source |

**Suite rules** (`.claude/rules/qa-suites.md`): every assertion maps to a requirement and back; every violable invariant has a planted negative whose mutation lands on the production source or its fixture inputs, never on the test; fixtures only, no network; assertions run against the real modules; counts are derived, not hard-coded.

**Planted negatives** (each must fail the named row):
- the 0.5% tolerance widened or narrowed → AR-4;
- a 1Y High accepted as an ATH input → AR-2;
- the write-token check moved after the ticker check → AR-4;
- a higher bar dropped from `higherBars` → AR-5;
- an uncovered higher bar accepted without independent evidence → AR-5;
- an independent source on a Yahoo or TradingView host accepted → AR-5;
- a client-supplied `status` trusted → AR-4;
- a plausibility rule added (ratio to close) → AR-8;
- an override or free-text reason field accepted → AR-1, AR-8;
- the reader returning `athValue` for `stale-suspect` or `unresolved` → AR-3;
- the reader dropping the value because only `refresh` is unresolved → AR-3;
- a file outside the approved set changed → AR-7.

**RED** (before implementation, recorded in `review.md`): AR-1 to AR-6 and AR-8 fail against the baseline because the modules do not exist. AR-7 passes, since it is an invariant.

## 7. Live steps (DEV only, each needs Owner approval)
1. Set the two gates, the tokens and the allowlist in DEV Netlify. Netlify writes need explicit approval.
2. A Yahoo fetch per seed batch, with the batch listed in the approval request.
3. Each Blob write batch.
4. Teardown of seeded keys if needed.

No offline suite touches any of these.

## 8. Flow, STOP and definition of done
- **Flow:** Step 0 baseline, tests first, implementation, targeted suites, Codex diff review, full `qa:offline`, Owner LAND.
- **STOP:**
  1. any `index.html` change;
  2. any scoring, persistence or existing-function touch;
  3. a live call without approval;
  4. a status rule the brief doesn't settle;
  5. a naming conflict at baseline;
  6. any code path that rejects a bar on plausibility.
- **Done:**
  - the offline suites are green;
  - on DEV, after an approved seed, the reader returns `verified` records for the snapshot tickers that meet §4 and `NOT_AVAILABLE` or a null value for everything else;
  - `unresolved` records carry their evidence;
  - nothing refers to the 1Y High;
  - the Owner confirms the seeded evidence for a sample against TradingView.

<!-- land-scope:begin -->
netlify/functions/lib/ath-record.js
netlify/functions/lib/ath-preflight.js
netlify/functions/lib/ath-read-core.js
netlify/functions/ath-read.mjs
netlify/functions/lib/ath-write-core.js
netlify/functions/ath-write.mjs
tools/ath-verify-owner.js
qa/ath_record_offline.js
qa/ath_read_offline.js
qa/ath_write_offline.js
qa/ath_owner_tool_offline.js
qa/ath_isolation_offline.js
BACKLOG.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/ath_record_offline.js
node qa/ath_read_offline.js
node qa/ath_write_offline.js
node qa/ath_owner_tool_offline.js
node qa/ath_isolation_offline.js
<!-- land-tests:end -->

## 9. Coverage-gap rule (settled, ruling 12)
TradingView verifies only the history it covers. For older Yahoo bars TradingView cannot confirm or refute, the record becomes `verified` only on independent bar-level or ATH-claim evidence, with the gap and the evidence recorded. Without it the record stays `unresolved`. There is no `unrefutedByChart` override and no plausibility rejection. The offline assertions are AR-5 and AR-8.

## 10. Next step
Brief-only commit, then implementation within this scope after the Owner approves the committed brief.

## 11. Baseline pinning record (2026-10-07)

**Files — exactly 13**

```
netlify/functions/lib/ath-record.js        new   pure schema + compareToVerifiedAth
netlify/functions/lib/ath-preflight.js     new   gates, tokens, allowlist, collision
netlify/functions/lib/ath-read-core.js     new   reader core
netlify/functions/ath-read.mjs             new   thin runtime wrapper (imports @netlify/blobs)
netlify/functions/lib/ath-write-core.js    new   writer core (server-side §4 classification)
netlify/functions/ath-write.mjs            new   thin runtime wrapper (imports @netlify/blobs)
tools/ath-verify-owner.js                  new   operator CLI
qa/ath_record_offline.js                   new   AR-1, AR-2
qa/ath_read_offline.js                     new   AR-3
qa/ath_write_offline.js                    new   AR-4, AR-5, AR-8
qa/ath_owner_tool_offline.js               new   AR-6
qa/ath_isolation_offline.js                new   AR-7
BACKLOG.md                                 Entry 34 text only (step 10a); nothing else
```

No ASK- or DENY-tier file is in scope: `qa/run-offline.js`, `package.json`, `netlify.toml`, `CLAUDE.md`, `AGENTS.md` and `.claude/**` are not touched. There is no `protected-scope` block.

**QA suites that read in-scope files as text:** none read the new files. `BACKLOG.md` is named only by `qa/run-offline.js` at the baseline (grep at `5844eab`), and no discovered suite asserts on its content; the Worker confirms this at Step 0 and the Entry 34 edit leaves every other line unchanged.

**Baseline-specific corrections to the approved draft** (made when pinning; nothing else in §0–§10 changed):
1. §5 item 7 originally registered the new suites in `qa/run-offline.js` and added `package.json` scripts. At the baseline suites are auto-discovered by filename and `.claude/rules/qa-suites.md` says no registration edit; both ASK-tier files are therefore out of scope.
2. §5 item 6 originally left the seed snapshot's location "pinned at brief time". It is pinned as an Owner-supplied file outside the repository (ruling 6: one explicit snapshot supplied at seed time), not a committed file.
3. Added for the repository's brief conventions: the header Parallel-with and Baseline fields, the `land-scope` and `land-tests` blocks, the suite-to-file mapping, planted negatives and RED (§6), and this section.
