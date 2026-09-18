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
| Normalized | 2026-09-18 |
| `branch-dev` | `e1442ab` — in sync with `origin/branch-dev`, clean tree |
| `origin/main` | `fbec2c1` — `branch-dev` is 17 commits ahead of production |
| Active entries | 21 (16 KEEP · 5 BLOCKED) |

---

## NOW

### 1 · TradingView alert ingestion (v1 pilot)
**Alerts / External Signals** · brief approved and committed at `e1442ab`

TradingView alert → HTTPS webhook → parse → validate shared secret from request body →
validate payload → normalize → persist minimal event → respond inside TradingView's
3-second cancel window. **Ingestion only**; nothing downstream.

*Scope:* locked to `work/tradingview-alerts/brief.md` — three new files, no existing file's
behaviour changes.
*Deps:* none. No webhook prior art exists in the repo.
*Legacy refs:* none. (`TV-FEAS` studied chart embed/datafeed and does not transfer.)

---

## NEXT

**Standing rule:** tasks 2 and 3 do not run concurrently with the TradingView pilot. If a
legacy ARC QA suite produces a false blocker during the pilot, **stop and bring that exact
case to the Owner** — do not quarantine opportunistically.

### 2 · Quarantine legacy ARC QA suites
**QA / Reliability**

Nine suites validate frozen legacy machinery but gate every LAND through `qa:offline`:
`arc_execution_profiles`, `arc_multi_arc`, `arc_publish_profiles`, `arc_registry`,
`arc_runtime_ops`, `arc_runtime_schemas`, `arc_safecheck`, `arc_worker_handshake`,
`phase_gate`.

*What remains:* add them to the **existing** `OFFLINE_TESTS_DENYLIST`
(`qa/run-offline.js:221`). No new mechanism.
*Why:* `D10-l` compares the live `.ai-reports/handoffs/` corpus against a hardcoded pin, so
**every new handoff with an unrecognized status header re-breaks the LAND gate.** This
blocked P7A1 and is structurally guaranteed to recur. Also retires the latent
`"NOT ratified" → RATIFIED` substring defect in `auNormalize`.
*Deps:* none technical. Sequenced after the pilot.
*Legacy refs:* `D10-l`, `4fb27bd`, `24e676c`.

### 3 · Remove unused `services/history.js`
**Code hygiene / cleanup**

Duplicate of logic already inlined at `index.html:970–1397`; uses an `allorigins` proxy.

*What remains:* delete the file.
*Evidence:* reference check complete — zero `module.exports`, no `require`/`import`, no
`<script src>` (index.html has no external script tags), no QA suite names it or any of its
seven functions. Only comment banners reference it.
*Pre-deletion check:* confirm the `allorigins.win` entry at `qa/run-offline.js:3775` targets
`index.html`'s inlined copy, not `services/`.
*Legacy refs:* `HYG-1`.

### 4 · Catalyst news evidence pipeline
**News / Catalysts**

Gated, fail-closed server capability storing structured catalyst evidence, surfaced as a
Ticker Detail card.

*Done:* provider (`news-catalysts-provider.js`, 604 lines, NP01–NP23); preflight (`12dfc74`).
*What remains:* core + create-only store writer + route + **day-partitioned** news index
(A2); read route `news-catalysts-read` (A3); Ticker Detail card +
`services/news-catalysts-client.js` (B).
*Deps:* index partition **ruled day-partitioned** —
`news-index:<TICKER>:<YYYY-MM-DD>` with a bounded deterministic read window aligned to J7's
stale horizon. Not blocked. B is only non-empty after a live seeding canary.
*Legacy refs:* `WP-P7 A1/A2/A3/Slice B`, `C3-S1…S5`, `EG-25C-3`, `J3`.

### 5 · Benchmark self-comparison guard
**Scores / Signals**

A scoring defect, not cosmetic: `runTechScoreV1` (~`:2143-2154`) silently awards
0.25-fraction RS credit for QQQ-vs-QQQ.

*What remains:* guard at `computeTechnicalSnapshot :1171-1173`, the scoring path, Comparison
render `:7561-7575`; one new suite.
*Deps:* **must land before task 6.**
*Legacy refs:* `WP-P2 Slice A`, `BC-3 §5`.

### 6 · Technical Score v1 surfacing
**Scores / Signals**

Engine landed and dark with full offline coverage; display only, no ranking or persistence
influence.

*What remains:* one gated invocation site, display block on `ts-card :7466`, per-symbol
session memo, and replacing the structural pin `qa/run-offline.js:3459`
(`callCount === 2` → `3`).
*Deps:* task 5 first — it repairs the RS input this surfaces.
*Legacy refs:* `WP-P3`, `SCORE-V1-S1`, `D-R1`.

### 7 · EOD data-readiness
**Market Data / Pricing**

Explicit readiness judgement so stale data never reads as current. Contract ratified
(Amendment 2, `7510d546…`).

*What remains:* readiness block in `_eodBuildPacket` + Markdown; optional pre-export UI
warning.
*Deps:* **resolve first** — two competing freshness authorities for the same signals:
`evidence-freshness.js` (J7) vs the `PF_*` portfolio family.
*Legacy refs:* `WU-EODFRESH`, EODFRESH-0/1/2.

### 8 · Parser / render integrity
**Research / Analysis**

*What remains:* deterministic parse defect at `index.html:7374-7376`; `PT:` case-sensitivity
bug at `:7029-7032`; and the unowned **second copy of the `Rating:` regex at `:6127`**.
*Deps:* none.
*Legacy refs:* `WP-P1 Slice A`, `BC-3a`.

---

## LATER

| # | Task | Domain | What remains | Legacy refs |
|---|---|---|---|---|
| 9 | UI hygiene bundle | Visual / UX | Dead `⇅` control (`:902`, CSS `:494-495`); search placeholder vs the predicate triplicated at `:5984`/`:6762`/`:6788`; six Hebrew strings; dead locals `:7051-7052`. No new behaviour | `WP-P5`, BC-4/BC-6/F9/QR-4 |
| 10 | Scan Results row enrichment | Daily Review | Risk/reward chips + held marker in both renderers; **first QA coverage** for these surfaces. Must not consume the `rs`/`rsCls` locals task 9 deletes | `WP-P6`, RV-1…8 |
| 11 | Selected-for-scan visibility | Search / Scan | Small | `WP-P12`, `BC-8` |
| 12 | Asset-type classifier + ETF suppression | Scores / Signals | Replace `_isETF` (`:11502`) with one `ptAssetType`; stop showing stock-only XBRL fields as missing on ETFs. Widens ETF treatment to TAN/ITA/KRE. **Gates entry 19** | `WP-P2 Slice B`, `BC-3b` |
| 13 | Deep Dive v1 | Research / Analysis | v0 landed `529c721` | `WP-P8`, Step 6 |
| 14 | AI narrative validation | Research / Analysis | — | `WP-P1 Slice B` |
| 15 | Visual Control Center / live dashboard | Workflow / Dev Infra | The surviving visual-work item. Deferred until the workflow is proven in the pilot | — |

---

## HOLD — Owner-sequenced (not blocked)

### 16 · Step 2B workflow hooks
**Workflow / Dev Infra** · disposition KEEP

Nothing technical stands in the way. Deliberately sequenced after the TradingView pilot so
it is based on observed LAND mechanics.

---

## HOLD / EXTERNAL — genuinely blocked

| # | Task | Domain | Blocker |
|---|---|---|---|
| 17 | SEC egress activation | Data Storage | `SEC_USER_AGENT` absent; setting it is a Netlify env write, a protected action. On resume: **DEV only first, production stays disabled** |
| 18 | Fund Facts activation + fundamentals | Research / Evidence | Depends on 17's seed/write path. *(Read path has zero UA references and is exempt.)* |
| 19 | Capital-Returns client activation | Scores / Signals | Task 12, the asset-type classifier |
| 20 | Live prices activation | Market Data | No server-side backstop exists; enabling exposes unbounded API cost |
| 21 | Market context (AAII) | Market Data | No data source identified |

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
**the completed EG-series items identified in the legacy normalization review** ·
fund-facts `C1-S1…S6` · `C3-S1` provider · `T1-C1` · closed arcs `WU-P7A1`,
`WU-EOD-V0`, `WU-DDV0`, `WU-VSCR`, `WU-SARL`, `WU-LABE` and the rest · the `work/`
task-folder convention.

*Historical totals are approximate (~40 merged refs, ~50 retired, ~64 done) and deliberately
not enumerated line-by-line. The 21 active entries above are exact.*
