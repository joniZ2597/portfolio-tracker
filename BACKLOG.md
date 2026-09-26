# BACKLOG.md — Portfolio Tracker / Pulse

Canonical product backlog under the simplified workflow (`AGENTS.md`). One entry per
coherent product task. Legacy `ARC` / `EG` / `WU` / `WP` identifiers appear **only** as
traceability references — never as task names, never as authority.

**This file is a queue of intent, not a record of state.** Current operational truth comes
from Git, active worktrees, task evidence and QA results (`CLAUDE.md`, "Source of current
project state"). If this file and the repository disagree, the repository is right and this
file is stale.

## Base snapshot

| | |
|---|---|
| Normalized | 2026-09-24 |
| `branch-dev` | `0c99e13` — in sync with `origin/branch-dev`, clean tree |
| `origin/main` | `fbec2c1` — `branch-dev` is **80 commits ahead of production** |
| Active entries | 17 (16 at the 2026-09-24 normalization; +1 on 2026-09-25: 24) |
| `qa:offline` | **46** effective suites (auto-discovered, minus the 11-entry denylist) |

**Active ARC:** S2 — the news-catalyst evidence pipeline (entry 4). The 23 legacy ARC
directories under `.ai-reports/arcs/` remain **FROZEN / SUPERSEDED** as a class
(11 DONE/ABSORBED · 7 SUPERSEDED · 5 OBSOLETE) and are not active backlog. Their useful
residual intent is absorbed into entries 7, 14 and 18 below; none is reopened.

**Activation Register** — capabilities that are fully built and need a policy, env or cost
decision rather than Worker implementation: Deep Dive · Research Evidence · P-5 call-2 ·
Portfolio FX · Portfolio sync · gate exposure policy · SHIP to production. These are Owner
decisions and are tracked in entries 22 and the HOLD / EXTERNAL table, not as Worker tasks.

---

## NOW

### 4 · Catalyst news evidence pipeline — **ACTIVE ARC (S2)**
**News / Catalysts**

Gated, fail-closed server capability storing structured catalyst evidence, surfaced as a
Ticker Detail card.

Internal stages are labelled **4a / 4b / 4c**. The previous `A1/A2/A3/Slice B` lettering
collided with the S2 slice names A1–A7 on the same subject matter.

*4a — server pipeline: **DONE**.* provider · preflight (`12dfc74`) · core · route
`news-catalysts.mjs` · server gate `PT_ENABLE_NEWS_CATALYSTS_SERVER` · day-partitioned index
`fundstore:v1:news-index:<TICKER>:<YYYY-MM-DD>`. Hardened through S1.5 / S1.5.1 / S1.5.2;
observability slices A1 (`6e242fb`, `9327e47`) and A2 (`52c322b`) landed.

*4b — read route `news-catalysts-read`: **DONE** (`16543cd`, S3-M1).* Gated route
`netlify/functions/news-catalysts-read.mjs` + `news-catalysts-read-core.js`, bound to the frozen
D-S3-1 reader contract (`work/s3-catalyst-evidence-surface/D-S3-1-reader-contract.md`) over a fixed
31-partition UTC window. Missing days are non-fatal.

*4c — `services/news-catalysts-client.js`: **DONE** (`0c99e13`, S3-M2).* Validating client adapter
over the S3-M1 envelope; re-derives nothing. **The Ticker Detail card itself remains HOLD** — no UI
surface has been built, and the card is only non-empty after a live seeding canary.

*Remaining ARC sequence:* `A3b* → A7a → A4*/A7b*`. **DONE:** A5 (`810586d`) · D-A2-2 (`0526458`,
S2-M1) · A3a (`28c2543`, S2-M2). **A3b is BLOCKED** — enforcement requires its own Owner-approved
rule / date-truth manifest (O-4); the A3a evidence it would be ruled from now exists and measures
**25 equal · 2 differ · 2 no-evidence-date over 29 catalysts**. **A6 HOLD** — reopens only on a
measured true duplicate within one run.
*Slice candidate — `/news/latest`-class hub source pages (added 2026-09-25, non-blocking).*
`GENERIC_SOURCE_PATH_RE` (`news-catalysts-provider.js:87`) rejects a generic leaf segment only
when nothing follows it, and A5's `INDEX_DOC_LEAF_RE` (`:93`) strips only `index`/`default`
document leaves, so a listing/hub path such as `/news/latest` is not rejected as a generic
source. A real instance exists in the pinned replay corpus (NVDA fixtures `p3`/`p4`:
`nvidianews.nvidia.com/news/latest`). **First step is measurement only:** how many corpus
survivors carry a hub-class `sourceUrl`, and whether a candidate rule would change any survivor
or `fixtureSha256`. **No filtering-rule change before that measurement**; any rule then needs its
own Owner approval. Not scheduled; does not block the sequence above or reopen Worker 2.
*Legacy refs:* `WP-P7 A1/A2/A3/Slice B`, `C3-S1…S5`, `EG-25C-3`, `J3`.

---

## NEXT

**Previous standing rule retired.** It sequenced entries 2 and 3 behind the TradingView pilot;
the pilot landed (entry 1, DONE), so the condition no longer exists.

### 6 · Technical Score v1 surfacing — **DONE** (`aa62aea`)
**Scores / Signals**

Engine landed and dark with full offline coverage; display only, no ranking or persistence
influence.

*Landed at `aa62aea`:* the gated invocation site, the display row on `#ts-card`, the per-symbol
session memo, and the structural pin in `qa/run-offline.js` — subsequently re-pinned by 8a
(`9f8171d`), so the historical `:3523` / `callCount === 2` anchor no longer applies.
*Deps:* none — entry 5 landed at `9cade5b`.
*UI ruled 2026-09-23:* exactly one `Tech Score v1` row showing **`result.score`** and
**`result.coveragePct`**. No state colour. No four-component breakdown. No second generic
`Score` row.
*Legacy refs:* `WP-P3`, `SCORE-V1-S1`, `D-R1`.

### 7 · EOD data-readiness + data-state presentation contract
**Market Data / Pricing · Data honesty**

Explicit readiness judgement so stale data never reads as current. Contract ratified
(Amendment 2, `7510d546…`).

*What remains:* readiness block in `_eodBuildPacket` + Markdown; optional pre-export UI
warning.
*Absorbed 2026-09-23 — the presentation half.* This entry now also owns the **global
data-state presentation contract**: a single product-wide convention for **Degraded**,
**Missing** and **Failed**, so the same state never renders three different ways. Carried from
the deferred presentation half of `WU-PROV` and the display-only intent of `EG-25D`. The
readiness judgement and its presentation are the same problem stated at two levels.
*Deps:* **resolve first** — two competing freshness authorities for the same signals:
`evidence-freshness.js` (J7) vs the `PF_*` portfolio family.
*Legacy refs:* `WU-EODFRESH`, EODFRESH-0/1/2, `WU-PROV` (presentation half), `EG-25D`.

### 8 · Parser / render integrity
**Research / Analysis**

**All three historical line anchors were stale and have been re-located by content.**

*8a — `Rating:` regex de-duplication: **DONE** (`9f8171d`).* There were **five** identical
copies, not a second one; all now route through a single `RATING_SUMMARY_RE`.
*8b — `getS` section extractor (`index.html:7371-7374`): **HOLD**.* Observations recorded
(unescaped tag interpolation into `new RegExp`, optional colon, hardcoded terminator list that
must track the prompt's section names). **No reproducible failing input exists** — reopens only
on a failing summary string or a committed parser contract.
*D-2 — `PT:` case-sensitivity: **DROPPED**.* Not reproducible: both matchers
(`index.html:7379`, `:3109`) already carry the `i` flag. Re-enters only on distinct `BC-3a`
evidence.
*Deps:* none.
*Legacy refs:* `WP-P1 Slice A`, `BC-3a`.

### 9 · UI hygiene bundle
**Visual / UX**

*What remains:* dead `⇅` control (`index.html:917`, CSS `:509-510`) — **it has no `onclick` and
no listener, yet carries `cursor:pointer` and a hover state: a clickable button that does
nothing**; search placeholder vs the predicate triplicated at `:5984`/`:6762`/`:6788`; six
Hebrew strings; dead `rs`/`rsCls` locals near `:7402`. No new behaviour.
*Deps:* none. **Must land before entry 10.**
*Legacy refs:* `WP-P5`, BC-4/BC-6/F9/QR-4.

### 10 · Scan Results row enrichment
**Daily Review**

Risk/reward chips + held marker in both renderers; **first QA coverage** for these surfaces.
*Deps:* **after entry 9** — must not consume the `rs`/`rsCls` locals entry 9 deletes.
*Legacy refs:* `WP-P6`, RV-1…8.

### 11 · Selected-for-scan visibility
**Search / Scan** · small.
*Legacy refs:* `WP-P12`, `BC-8`.

### 12 · Asset-type classifier + ETF suppression
**Scores / Signals**

Replace `_isETF` (`index.html:11881`) with one `ptAssetType`; stop showing stock-only XBRL
fields as missing on ETFs. Widens ETF treatment to TAN/ITA/KRE. **Gates entry 19.**
*Legacy refs:* `WP-P2 Slice B`, `BC-3b`.

### 22 · Gate exposure & surfacing policy
**Workflow / UX** · **new 2026-09-23**

**Seven fully-built Ticker Detail cards are reachable only through the browser devtools
console.** No `PT_ENABLE_*` flag has a default assignment, so every gate evaluates
`undefined !== true` on each load, and the ⚙ button (`index.html:859`) opens an API-status
table, not a feature surface.

*What this entry owns:* the policy question — **which client-only flags may ever be exposed to
a user, and where that surface lives** — and then the surface itself. It does not own any
individual capability's activation decision; those stay in the Activation Register.
*Why one entry and not thirteen:* the audit is the register of hidden capabilities. One entry
per dark surface would be inventory, not a plan.
*Deps:* Owner policy ruling before any implementation.
*Evidence:* `.ai-reports/status/product-surface-audit-52c322b.PREP.local.md`.

---

## LATER

| # | Task | Domain | What remains | Legacy refs |
|---|---|---|---|---|
| 13 | Deep Dive v1 | Research / Analysis | v0 landed `529c721`. **No v1 scope defined** — this is a placeholder, not a ready task | `WP-P8`, Step 6 |
| 14 | AI narrative validation | Research / Analysis | **Do not start before entry 8b's parser-contract question is settled** — both concern narrative/parser trust. See also the P-5 call-2 activation row in HOLD / EXTERNAL | `WP-P1 Slice B` |
| 15 | Visual Control Center / live dashboard | Workflow / Dev Infra | The surviving visual-work item. Deferred until the workflow is proven in the pilot | — |
| 24 | Sidecar harness post-summary / exit-code noise | Workflow / Dev Infra | **Tooling task, not product; added 2026-09-25, non-blocking.** Post-summary output and exit-code noise reported at Worker 2 closure. The harness is Worker-local — not in this repository — so the first step is to locate it. Fix pattern already proven in the MCP harness: derive PASS/FAIL/SKIP from individual result rows, never from the first summary-like line, and count each failure exactly once. Does not reopen the closed Worker 2 task | Worker 2 closure follow-up |
| 25 | Entry / Position Planner — Risk / Reward | Portfolio Analysis | **Discovery-first; added 2026-09-26; separate from Score — no Score, ranking or runtime change.** Decision-time tool for entering, adding or building a position, in three separate layers: **(A) setup R/R** from market/technical structure — numeric Entry / Invalidation / Target, downside %, upside %, R:R; **(B) position risk** — current size, planned final size, staged adds, concentration, portfolio-aware exposure; **(C) the user's position-building method** — a separate discovery input, not an assumed strategy; may need configurable or rule-based behaviour. *Data today:* ATR and swing levels are derivable from the daily bars already fetched, but **no approved rules yet turn them into Entry / Invalidation / Target**; Entry Zone / Invalidation exist only as AI free text and `PT:` is an AI-text analyst consensus, not a setup target. Current position value and implied P/L are **not yet fully calculable** — holdings are manually recorded values without share count, per-share average cost or a reliable decision-time price. *Sequence:* method interview → read-only coverage measurement → Capability Breakdown with `DR-n` rulings → child Slices. No implementation brief before the Breakdown. *Soft deps:* 20 (live price), DH-M0b (state wording), 12 (ETF treatment). *Shared schema (2026-09-26):* share quantity and per-share average cost are **shared with entry 27**'s quantity comparison — one holdings-schema slice serves both; neither entry defines its own | — |
| 26 | Broker Observation Contract + Read-Only Observer Pilot | Portfolio / Verification | **Contract-first; added 2026-09-26.** One **source-agnostic observation contract** that later producers emit (Cowork browser, broker CSV/Excel, broker API, MCP): `source · observedAt · broker · maskedAccountRef · cashByCurrency[] · positions[] {symbol, quantity, positionValue, currency, avgCost?} · totalValue · confidence · runStatus · evidenceRef`. Observations are **verification evidence only** — Pulse remains the calculation engine; no broker-side writes. *Owner rulings 2026-09-26:* observations and evidence are stored **local only, outside Git**; account references are **masked**; **full account identifiers are never stored**. **Pilot:** Owner-initiated, never scheduled; read-only browser observation; the Owner signs in — **no credential or OTP capture**; no trade, transfer or settings action; **fail closed** on MFA, CAPTCHA, ambiguous values or layout changes; report only, with run status and evidence reference; **5–10 runs** before scheduling is considered. *Deferred to 26a:* symbol mapping, confidence rules, pilot broker/account scope. No observer code in this repository | — |
| 27 | Portfolio Reconciliation / Verification | Portfolio / Verification | **Breakdown-first; added 2026-09-26.** Compares recorded Pulse state with one entry-26 observation. **v1 direct comparisons:** cash · symbol set · total portfolio value. **Informational only:** broker position value, average cost. **After schema support:** share quantities. **Mismatch classes:** `match · explained · unexplained-gap · structural · unverifiable`; reuses `pt_recon` concepts where they fit (tolerance, declared exclusions → explained, `unset/invalid/stale/total-incomplete` → unverifiable). Deposits/withdrawals surface as a **cash** mismatch; external trades as a **structural/value** mismatch. *Owner rulings 2026-09-26:* intake is **manual import of a contract JSON file** (not paste as the primary path); **Pulse never fetches broker data**. Recorded cash stays the **existing single ILS value** — no per-currency cash schema; broker cash-by-currency is normalized to ILS via the existing FX freshness owner (`_pfFxState`), and **if required FX is not Current the cash comparison is unverifiable/suppressed, never guessed**. **v1 is report-only — no Accept/write action;** any future Owner-confirmed update of cash, recon, holdings, quantity or cost basis needs its own explicit slice. **No transaction ledger.** DH-M1 scope unchanged — its old-cash rule remains the recorded-cash freshness fallback. *Deferred to the 27 Breakdown:* tolerances; whether a matching observation may later contribute to readiness. *Deps:* 26 (contract); quantities need the holdings-schema slice shared with 25 | — |
| 28 | Broker API / MCP observation producer | Portfolio / Verification | **Placeholder; added 2026-09-26.** A future producer emitting **the same entry-26 contract** from a broker API or MCP instead of browser observation. Same read-only, fail-closed, report-only and storage rules; no broker writes. Not scheduled; considered only after the 26 pilot shows the contract holds | — |

---

## HOLD — Owner-sequenced (not blocked)

### 16 · Step 2B workflow hooks
**Workflow / Dev Infra** · disposition KEEP

Nothing technical stands in the way. Its stated gate — "after the TradingView pilot" — has been
satisfied (entry 1, DONE). **Owner-only: not Worker execution.** Not scheduled into either lane.

---

## HOLD / EXTERNAL — genuinely blocked, or activation-only

| # | Task | Domain | Blocker |
|---|---|---|---|
| 17 | SEC egress activation | Data Storage | `SEC_USER_AGENT` absent (referenced in 9 files); setting it is a Netlify env write, a protected action. On resume: **DEV only first, production stays disabled** |
| 18 | Fund Facts activation + fundamentals | Research / Evidence | Depends on 17's seed/write path. *(Read path is ungated, has zero UA references, and is exempt — but the store it reads stays empty until the write path runs, so surfacing it early would render an always-empty card.)* **Absorbed 2026-09-23 — the residual fundamentals decisions from `FUND-SCORE-RES`, which must be settled before any fundamentals surface is designed: TTM normalization layer · composite-vs-panel · valuation scope** · F-BSS-DEBT-GATED — VERIFIED (FUND-SCORE-RES): netCash is currently computed only when both cash and total-debt facts exist at a common instant. If debt facts are absent, netCash is null even when cash is known. Owner decision: whether a debt-free issuer should instead yield netCash = cash. *(Evidence: `netlify/functions/lib/fund-facts-provider.js:523-535`; FUND-SCORE-RES lab archive `lab-FSR-RESEARCH/harness.js:300-313`.)* |
| 19 | Capital-Returns client activation | Scores / Signals | **Implemented, activation-gated.** `netlify/functions/capital-returns.js` present; client fully built behind `PT_ENABLE_CAPITAL_RETURNS_CLIENT === true` (`index.html:7945`) plus a server gate. Blocked by entry 12, and by 17 for `SEC_USER_AGENT` |
| 20 | Live prices activation | Market Data | **Implemented client-side, activation-gated** — `PT_ENABLE_PORTFOLIO_LIVE_PRICES` wired at `index.html:8620`, `:8658`, `:9209`. **Still missing the server-side cost backstop**; enabling without it exposes unbounded API cost |
| 21 | Market context (AAII) | Market Data | No data source identified |
| — | **P-5 call-2 tool-use activation** | Research / Analysis | **Activation decision, not a reopened legacy ARC.** The implementation lineage exists (`PT_ENABLE_P5_CALL2_TOOL_USE_CLIENT`, `PT_ENABLE_P5_CALL2_TOOL_USE`); flipping it changes analysis behaviour, so it needs an explicit Owner ruling and evidence. Cross-referenced from entry 14; **deliberately not folded into entries 13/14** |

---

## VERIFY — likely complete, closure unevidenced

| Item | Smallest verification |
|---|---|
| `EG-11` QA matrix | Sources contradict — queue says DONE, the matrix doc says "execution NOT started". Grep its row statuses |
| Portfolio cloud sync (`EG-19B` B-5) | QA-passed, dormant. Read-only Netlify check for `PT_ENABLE_PORTFOLIO_SYNC_SERVER` / `PT_OWNER_TOKEN` |
| Evidence-store consumer (`EG-20C-4`) | Diff the shipped consumer against the arc's closeCondition |
| Ambient-context guard (`EG-20C-5`) | Recorded CLOSED *and* HOLD with "guard insufficient". Read `2d578ac` |

---

## Traceability — retired and historical

**RETIRED** (no longer active; re-enter as fresh tasks if ever wanted): `WP-P9` TradingView
chart/embed · `EG-10A` and `EG-15` design briefs · the ARC governance chain
(`WU-MSSREF`, `WU-LANEAUTH`, `WU-LANEID`, `WU-G5P4`, `WU-PPAR`, `PUB-SLICE`,
`G-LEARN-1…6`, `B15-1…6`, `PROTO-P1/P3/P4/P5/P6`, arc-closeout batch) · `EG-13` / `EG-14`
(superseded by `AGENTS.md` LAND/SHIP) · `WU-EXS` / `EXP-1` (cancelled) · ARC-era QA prep
`S1`/`S2`/`S3`/`S4`/`G34`.

**DONE / HISTORY** (complete; not active backlog): `TV-FEAS` feasibility study ·
**1** TradingView alert ingestion — webhook, preflight lib and offline suite all present ·
**2** Quarantine legacy ARC QA — all nine suites in `OFFLINE_TESTS_DENYLIST`
(`qa/run-offline.js:227-238`) ·
**3** Remove `services/history.js` — file deleted ·
**5** Benchmark self-comparison guard — `9cade5b` ·
**6** Technical Score v1 surfacing — `aa62aea` ·
**8a** `Rating:` regex de-duplication — `9f8171d` ·
**S2 slices** S1.5 · S1.5.1 (H-A/H-B/H-C, `1eda72c`) · S1.5.2 (`d9395ea`) · A1 (`6e242fb`,
`9327e47`) · A2 (`52c322b`) · A5 (`810586d`) · D-A2-2 / S2-M1 (`0526458`) ·
A3a / S2-M2 (`28c2543`) ·
**S3 slices** M1 read route (`16543cd`) · M2 client adapter (`0c99e13`) ·
**the completed EG-series items identified in the legacy normalization review** ·
fund-facts `C1-S1…S6` · `C3-S1` provider · `T1-C1` · closed arcs `WU-P7A1`,
`WU-EOD-V0`, `WU-DDV0`, `WU-VSCR`, `WU-SARL`, `WU-LABE` and the rest · the `work/`
task-folder convention.

*Historical totals are approximate (~40 merged refs, ~50 retired, ~64 done) and deliberately
not enumerated line-by-line. The 17 active entries above are exact.*

**KNOWN HISTORICAL EXCEPTIONS** (recorded, not remediated — do not back-fill):

- **S2-A2 has no `work/s2-evidence-index-binding/review.md`.** The implementation commit
  `52c322b` carries three files and no task review artifact; the file has never existed on any
  ref. Every other S2 and S3 implementation commit carries its `review.md`. Owner-ruled
  2026-09-24: **record as a known historical exception, do not reconstruct retrospectively** — a
  review written after the fact would assert verification that never took place. The convention
  itself is unchanged and remains binding for all subsequent slices.
