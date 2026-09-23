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
| Normalized | 2026-09-23 |
| `branch-dev` | `52c322b` — in sync with `origin/branch-dev`, clean tree |
| `origin/main` | `fbec2c1` — `branch-dev` is **62 commits ahead of production** |
| Active entries | 17 (5 closed this pass: 1, 2, 3, 5, 8a · 1 added: 22) |

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

*4b — read route `news-catalysts-read`: **HOLD**, ARC-coupled.* Absent from the repo. Reads the
persisted record shape that S2-A3 / A5 may still change.

*4c — Ticker Detail card + `services/news-catalysts-client.js`: **HOLD**, ARC-coupled.* Absent.
Only non-empty after a live seeding canary.

*Remaining ARC sequence:* `A5 → D-A2-2 → A3a → A3b* → A7a → A4*/A7b*`. **A6 HOLD** — reopens
only on a measured true duplicate within one run.
*Legacy refs:* `WP-P7 A1/A2/A3/Slice B`, `C3-S1…S5`, `EG-25C-3`, `J3`.

---

## NEXT

**Previous standing rule retired.** It sequenced entries 2 and 3 behind the TradingView pilot;
the pilot landed (entry 1, DONE), so the condition no longer exists.

### 6 · Technical Score v1 surfacing
**Scores / Signals**

Engine landed and dark with full offline coverage; display only, no ranking or persistence
influence.

*What remains:* one gated invocation site, the display row on `#ts-card` (`index.html:7816`),
a per-symbol session memo, and replacing the structural pin `qa/run-offline.js:3523`
(`callCount === 2` → `3`).
*Deps:* **none — entry 5 landed at `9cade5b`.** READY.
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
**8a** `Rating:` regex de-duplication — `9f8171d` ·
**S2 slices** S1.5 · S1.5.1 (H-A/H-B/H-C, `1eda72c`) · S1.5.2 (`d9395ea`) · A1 (`6e242fb`,
`9327e47`) · A2 (`52c322b`) ·
**the completed EG-series items identified in the legacy normalization review** ·
fund-facts `C1-S1…S6` · `C3-S1` provider · `T1-C1` · closed arcs `WU-P7A1`,
`WU-EOD-V0`, `WU-DDV0`, `WU-VSCR`, `WU-SARL`, `WU-LABE` and the rest · the `work/`
task-folder convention.

*Historical totals are approximate (~40 merged refs, ~50 retired, ~64 done) and deliberately
not enumerated line-by-line. The 17 active entries above are exact.*
