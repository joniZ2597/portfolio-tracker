# DH-M0a — Vocabulary census

**Census only. Read-only. It decides nothing.** This document records what the codebase contains
at the task base. It names no winner, proposes no authority, selects no vocabulary, introduces no
term and judges no term (brief §4, §7). DH-M0b takes its ruling *from* this inventory; that ruling
is the Owner's.

## 1 · Base, method, identity

| | |
|---|---|
| Task branch / base | `task/dh-vocabulary-census` @ `7d0cc37` (brief-only commits `07c391b` Amendment 2 and `7d0cc37` entry-9 brief sit on `e2bdfd2`) |
| Measured files | `index.html` (15558 L) · `netlify/functions/lib/evidence-freshness.js` (425 L) · `netlify/functions/lib/news-catalysts-read-core.js` · `netlify/functions/news-catalysts-read.mjs` · `services/news-catalysts-client.js` |
| Identity precondition (brief §9) | `git diff --stat e2bdfd2 HEAD -- <the five files>` is **empty** — all five are byte-identical to `e2bdfd2` |
| Counting | case-sensitive substring; two units per term — matching lines and per-occurrence (Amendment 2 (a)) |
| Attribution | every occurrence in `index.html` is attributed (§5) to line, enclosing symbol, data family, owning authority and visibility class (brief §3). The 4 non-`index.html` files are attributed in §4 |
| Tooling | a scratch Node script outside the repo (deleted with the session scratchpad) enumerated the occurrences; the family / authority / visibility columns are the Worker's reading of each site, recorded not judged |

**Vocabularies recorded (six, per Amendment 2 (c)).** (1) J7 evidence-freshness · (2) `PF_*`
freshness constants · (3) EOD-packet-local terms · (4) the S3 read-envelope status family and its
client adapter · (5) the NC briefing wording table · plus, found while attributing `index.html`,
(6) a set of **locally-defined state vocabularies not named in brief §3.4** (research coverage,
FX state, reconciliation status, SEC-store client, fund-facts read client, fund-facts factor
display, catalyst verdict, EDGAR verification, scan-results banner). They are recorded under the
authority label `local: …` and are **not** ranked or merged. The brief's authority list (J7, `PF_*`,
EOD-packet-local, S3 envelope, NC briefing table, none) is therefore not, as measured, the full set
of places where a state term is defined; that is a fact of the inventory, not a proposal.

## 2 · C-1 — Term totals in `index.html` (both units)

Case-sensitive substring counts on `index.html` at task base `7d0cc37` (byte-identical to `e2bdfd2`). "Lines" = matching lines (`grep -c`); "Occurrences" = per-occurrence (`grep -o … | wc -l`). Both equal the Amendment 2 (b) expected values.

| Term | Matching lines | Occurrences |
|---|---:|---:|
| `unavailable` | 87 | 93 |
| `Unavailable` | 27 | 28 |
| `STALE` | 27 | 28 |
| `Stale` | 37 | 40 |
| `MISSING` | 10 | 11 |
| `Missing` | 36 | 46 |
| `FAILED` | 8 | 8 |
| `Failed` | 16 | 16 |
| `DEGRADED` | 16 | 16 |
| `insufficient` | 7 | 7 |
| `not covered` | 1 | 1 |
| **all terms** | (union of lines: **261**) | **294** |

The union-of-lines figure counts a line once even when it carries several terms; the per-occurrence table in §5 has one row per such line (261 rows) and its occurrence column sums to 294.

## 3 · Cross-tabulations of the §5 attribution (occurrences)

### 3.1 Term × data family

| Term | evidence | market/EOD | FX | portfolio/reporting | research coverage | reconciliation | sync | other (not in §3 list) | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `unavailable` | 11 | 10 | 7 | 20 | 26 | 4 | 8 | 7 | 93 |
| `Unavailable` | 1 | 2 | 0 | 15 | 8 | 0 | 0 | 2 | 28 |
| `STALE` | 15 | 3 | 0 | 2 | 2 | 2 | 2 | 2 | 28 |
| `Stale` | 1 | 14 | 0 | 0 | 7 | 4 | 0 | 14 | 40 |
| `MISSING` | 6 | 1 | 0 | 0 | 0 | 0 | 2 | 2 | 11 |
| `Missing` | 2 | 0 | 1 | 5 | 34 | 0 | 0 | 4 | 46 |
| `FAILED` | 4 | 1 | 0 | 0 | 1 | 0 | 2 | 0 | 8 |
| `Failed` | 0 | 13 | 0 | 0 | 0 | 0 | 0 | 3 | 16 |
| `DEGRADED` | 16 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 16 |
| `insufficient` | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 7 |
| `not covered` | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| **all terms** | **62** | **44** | **8** | **42** | **78** | **10** | **14** | **36** | **294** |

### 3.2 Term × visibility class

| Term | user-visible | machine-internal | both | comment (non-runtime) | Total |
|---|---:|---:|---:|---:|---:|
| `unavailable` | 37 | 30 | 19 | 7 | 93 |
| `Unavailable` | 4 | 20 | 4 | 0 | 28 |
| `STALE` | 0 | 25 | 2 | 1 | 28 |
| `Stale` | 4 | 29 | 0 | 7 | 40 |
| `MISSING` | 0 | 9 | 0 | 2 | 11 |
| `Missing` | 2 | 30 | 5 | 9 | 46 |
| `FAILED` | 0 | 7 | 0 | 1 | 8 |
| `Failed` | 2 | 14 | 0 | 0 | 16 |
| `DEGRADED` | 0 | 11 | 1 | 4 | 16 |
| `insufficient` | 3 | 2 | 1 | 1 | 7 |
| `not covered` | 1 | 0 | 0 | 0 | 1 |
| **all terms** | **53** | **177** | **32** | **32** | **294** |

### 3.3 Term × owning authority (as recorded today)

| Authority | `unavailable` | `Unavailable` | `STALE` | `Stale` | `MISSING` | `Missing` | `FAILED` | `Failed` | `DEGRADED` | `insufficient` | `not covered` | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| EOD-packet-local | 22 | 12 | 0 | 4 | 0 | 12 | 0 | 0 | 0 | 0 | 0 | 50 |
| NC briefing table | 3 | 4 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| PF_* family | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 6 |
| local: EOD lastFailAt rule (_pfEodIsStale) | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| local: FX state (_pfFxState) | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| local: ResearchView / research resolver | 6 | 1 | 2 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 16 |
| local: SEC evidence-store client contract | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | 0 | 0 | 11 |
| local: catalyst verdict (7B) | 0 | 0 | 15 | 1 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 18 |
| local: fund-facts factor display | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 1 | 6 |
| local: fund-facts read client contract | 1 | 0 | 0 | 0 | 5 | 0 | 4 | 0 | 5 | 0 | 0 | 15 |
| local: scan-results banner / scan age | 0 | 0 | 2 | 14 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 17 |
| local: storage / cloud-sync messages | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 |
| local: technical-score reason codes | 0 | 0 | 2 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| none | 53 | 11 | 1 | 6 | 5 | 30 | 4 | 16 | 1 | 2 | 0 | 129 |
| **all authorities** | **93** | **28** | **28** | **40** | **11** | **46** | **8** | **16** | **16** | **7** | **1** | **294** |

### 3.4 Term × occurrence form (lexical heuristic)

| Term | identifier | string-literal | token | prose | comment | Total |
|---|---:|---:|---:|---:|---:|---:|
| `unavailable` | 23 | 12 | 0 | 51 | 7 | 93 |
| `Unavailable` | 26 | 0 | 0 | 2 | 0 | 28 |
| `STALE` | 18 | 4 | 5 | 0 | 1 | 28 |
| `Stale` | 31 | 2 | 0 | 0 | 7 | 40 |
| `MISSING` | 9 | 0 | 0 | 0 | 2 | 11 |
| `Missing` | 37 | 0 | 0 | 0 | 9 | 46 |
| `FAILED` | 7 | 0 | 0 | 0 | 1 | 8 |
| `Failed` | 14 | 0 | 0 | 2 | 0 | 16 |
| `DEGRADED` | 2 | 8 | 2 | 0 | 4 | 16 |
| `insufficient` | 3 | 0 | 0 | 3 | 1 | 7 |
| `not covered` | 0 | 1 | 0 | 0 | 0 | 1 |
| **all terms** | **170** | **27** | **7** | **58** | **32** | **294** |

### 3.5 Spread per term — distinct data families / authorities / visibility classes

| Term | Families | Authorities | Visibility classes |
|---|---:|---:|---:|
| `unavailable` | 8 | 7 | 4 |
| `Unavailable` | 5 | 4 | 3 |
| `STALE` | 7 | 6 | 3 |
| `Stale` | 5 | 7 | 3 |
| `MISSING` | 4 | 3 | 2 |
| `Missing` | 5 | 5 | 4 |
| `FAILED` | 4 | 2 | 2 |
| `Failed` | 2 | 1 | 2 |
| `DEGRADED` | 1 | 3 | 3 |
| `insufficient` | 2 | 2 | 4 |
| `not covered` | 1 | 1 | 1 |

Form is computed from the characters around each occurrence: `comment` = on a comment line; `identifier` = embedded in a longer identifier/CSS class/key (adjacent word character, `-`, `_` or `.`); `string-literal` = the whole quoted string equals the term; `token` = standalone upper-case token; `prose` = standalone word inside longer text. It is a lexical aid, not a semantic ruling; the visibility column carries the attribution.

## 4 · Vocabulary inventories

### 4.1 J7 — `netlify/functions/lib/evidence-freshness.js` (C-3)

Server library, 425 L. Machine-facing; no display strings.

**Item state tokens (5)** — `fresh · aging · stale · missing · degraded` (`:372`, `:411` counts object; `:353` fresh/aging/stale from age; `:324` sole producer of `missing`; `:311 :317 :329 :336 :341 :348` produce `degraded`).

**Item reason tokens (7)** — `REASONS` (`:99-102`): `MALFORMED_SNAPSHOT · UNKNOWN_FAMILY · RECORD_UNREADABLE · CONTRACT_INVALID · CHECKED_AT_INVALID · NO_TIMESTAMP · TIMESTAMP_AHEAD_OF_CLOCK`.

**Report-level `DEGRADED_NOTES` (6)** — `:105-108`, emitted into `report.degradedNotes` (`:387-401`, `:413`): `WINDOW_TABLE_INVALID · WINDOW_TABLE_UNVERSIONED · CHECKED_AT_INVALID · RECORDS_INVALID · EXPECTED_FAMILIES_INVALID · EVALUATOR_ERROR`. Exported as `DEGRADED_NOTES` (`:424`).

**Window table** — `DEFAULT_WINDOW_TABLE` version `eg25c1-spec-v1` (`:85-91`), unit **days**, inclusive bounds (`:59-61`, `:353`):

| Family | `agingAfterDays` | `staleAfterDays` |
|---|---:|---:|
| `facts` · `filings` · `capitalReturns` | 60.5 | 121 |
| `estimates` · `insider` | 3.5 | 7 |
| `news` · `catalysts` | 7 | 30 |

**Term occurrences in the file** (case-sensitive substring, so identifiers such as `staleAfterDays` and `degradedNotes` count): `stale` 14 lines / 17 occurrences · `missing` 5 / 5 · `degraded` 18 / 19 · `DEGRADED` 2 / 3 (`:105 :424`) · `failed` 1 / 1 (comment, `:315`); zero occurrences of `unavailable`, `Unavailable`, `STALE`, `Stale`, `MISSING`, `Missing`, `FAILED`, `Failed`, `insufficient`, `not covered`. All are machine-internal identifiers, state tokens or comments; family = evidence (the seven canonical families); authority = J7.

**Consumers found by `grep -rl evidence-freshness` (excl. `node_modules`)**: `netlify/functions/lib/fund-facts-read-core.js`, `netlify/functions/lib/news-catalysts-core.js`, and four `qa/` files. **`index.html` contains no reference to `evidence-freshness`, `DEGRADED_NOTES` or the J7 window table.** `index.html:4322` `FUND_FACTS_READ_FRESHNESS_STATES` is a client-side literal list of five strings equal to J7's five state tokens (`fresh · aging · stale · missing · degraded`), used to validate the fund-facts read envelope.

### 4.2 `PF_*` / `_PF_*` freshness, staleness and cooldown constants in `index.html` (C-2)

Amendment 2 (d) floor (nine), then a second table of the other age / staleness / cache-window / budget constants found by a top-level constant sweep (`grep -nE "^\s*(var|const|let) +_?[A-Z][A-Z0-9_]*(_MS|_DAYS|_AGE|_TTL|COOLDOWN|STALE|FRESH|WINDOW)"`). The sweep returns 28 top-level matches; 20 are tabulated (the nine above and eleven below, plus `FFP_COVERAGE_FLOOR`, which is read together with `FFP_COVERAGE_WINDOW` and is not a sweep match). The other eight bound neither age nor staleness and are not tabulated: request-timeout constants `P5_CALL2_TIMEOUT_MS` (`:3177`), `RESEARCH_EVIDENCE_TIMEOUT_MS` (`:3579`), `SEC_EVIDENCE_STORE_TIMEOUT_MS` (`:3797`), `FUND_FACTS_READ_TIMEOUT_MS` (`:4228`), `CALL_TIMEOUT_MS` (`:12474`); the field/state lists `FUND_FACTS_READ_FRESHNESS_FIELDS` (`:4255`) and `FUND_FACTS_READ_FRESHNESS_STATES` (`:4322`, recorded in §4.1); and the catalyst-verdict cue-pattern array `_NEG_STALE` (`:12049`, part of §4.6). Nothing else in the sweep is omitted.

| Constant | Line | Value | Unit | What it bounds (as commented / used) |
|---|---:|---|---|---|
| `PF_RECON_STALE_MAX_DAYS` | 8677 | 3 | days | reconciliation `stale` when as-of vs oldest holding baseline > value (`:8697`) |
| `PF_ATTENTION_STALE_MAX_DAYS` | 9030 | 7 | days | needs-attention: holding baseline older than value (`:9143`) |
| `PF_EOD_AUTO_COOLDOWN_MS` | 10279 | 4 h | ms | automatic EOD fetch cooldown after an OK attempt (`:10374`) |
| `PF_EOD_FAIL_COOLDOWN_MS` | 10280 | 30 min | ms | EOD cooldown after a failed automatic attempt (`:10374`) |
| `PF_FX_AUTO_COOLDOWN_MS` | 10434 | 4 h | ms | automatic FX fetch cooldown (`:10573`) |
| `PF_FX_FAIL_COOLDOWN_MS` | 10435 | 30 min | ms | FX cooldown after a failed attempt (`:10573`) |
| `PF_FX_FRESH_MAX_AGE_DAYS` | 10444 | 3 | days | FX `fresh` (total and day estimate) (`:10503`) |
| `PF_FX_VALID_MAX_AGE_DAYS` | 10445 | 6 | days | FX `aged-but-valid` (total only); above → `stale-invalid` (`:10504-10505`) |
| `_PF_CLOUD_STALE_MS` | 14217 | 30 d | ms | cloud-sync timestamp `stale` (`:14494`) |

**Other age/TTL/threshold constants in `index.html` (not `PF_`-named)** — listed because they define a "stale" or age boundary or a cache window, not to class them:

| Constant / rule | Line | Value | Unit | Subject |
|---|---:|---|---|---|
| `STALE_MS` | 6600 | 48 h | ms | research-record `stale` in `_resolveResearchForHolding` (`:6657`) |
| `FUTURE_SKEW_MS` | 6599 | 5 min | ms | research-record future-timestamp tolerance |
| `STALE_RESULT_THRESHOLD_MS` | 15108 | 24 h | ms | scan-results banner (`:15155`) |
| `isStale(symbol, maxAgeMs = 5*60*1000)` | 5502 | 5 min | ms | in-memory market-data age (`:5506`) |
| `_pfEodIsStale(cacheEntry)` | 10338 | — (no time unit) | — | EOD `stale` = the cache entry has `lastFailAt` (`:10338-10340`); not derived from age |
| catalyst-verdict window | 12167, 12174 | 35 | days | `date>35d` → verdict `STALE` in `_reconcile` |
| `CACHE_TTL_MS` · `CACHE_EMPTY_TTL_MS` · `PORTFOLIO_TTL_MS` | 1000 · 996 · 1017 | 15 min · 90 s · 5 min | ms | scan / portfolio caches |
| `_PF_LIVE_SUCCESS_TTL` · `_PF_LIVE_FAIL_TTL` | 10259 · 10260 | 5 min · 60 s | ms | live-price cache success/failure windows |
| `_PF_LIVE_BUDGET_MS` · `_PF_LIVE_SYM_MS` | 10263 · 10264 | 10 s · 8 s | ms | live-price batch / per-symbol budgets |
| `FFP_COVERAGE_WINDOW` | 13461 | 6 | periods | fund-facts factor coverage window |
| `FFP_COVERAGE_FLOOR` | 13462 | 4 | periods present | below (and above 0) → `insufficient-history` (`:13595`) |

The same word `stale` therefore names age boundaries in **seconds/minutes, hours, days, and a failure-flag with no time unit**, across market, research, reconciliation, portfolio-attention, cloud-sync, scan-results and catalyst-verdict subjects (measured fact; not a judgement).

### 4.3 EOD-packet-local terms (C-4)

Defined and consumed inside `index.html` (P-5 packet and EOD packet). Lines are current.

| Source | Line | Values recorded |
|---|---:|---|
| `_p5BuildLocalContext` default shape | 2410-2417 | `fx.state: 'missing'` · `market.eodStale: null` · `weight.unavailableReason: 'reporting-incomplete'` |
| `_p5BuildLocalContext` weight reasons | 2454-2459 | `reporting-incomplete` · `denominator-zero` · `holding-ils-value-unavailable` · `null` |
| `_pfEodIsStale` → `eodStale` | 2449 | boolean |
| `_p5PacketStatus` | 2469-2479 | `failed · complete · partial` |
| `_eodBuildPacket` per-symbol `coverage` | 2691-2701 | `researched · failed · zero-accepted · not-researched` |
| `_eodReconciliationLimitationText` | 2654-2668 | text for reconciliation `status` = `unset` → *"Reconciliation: not recorded."* · `invalid` → *"…recorded data could not be read."* · `stale` → *"Reconciliation: stale — N day(s) …"* · `total-incomplete` → *"Reconciliation: unavailable — Portfolio Total is incomplete."* · `unexplained-gap` · `reconciled-with-exclusions` · `fully-reconciled` |
| `_eodBuildPacket` limitation codes | 2682, 2799, 2820 | `addLimitation(code, text)`: e.g. `zero-accepted`, `fx` (*"FX unavailable — cross-currency totals are not reported."*) |
| `_eodBuildPacket` `totalUnavailableReason` | 2777 | joined `completenessReasons` or `'incomplete'` |
| `_eodPacketToMarkdown` | 2879, 2894 | `Total: unavailable (reason)` · `Weight: unavailable (reason)` |
| `_p5RenderPacket` | 2562-2582 | `(stale)` suffix · `unavailable` · `not available locally` · `— (reason)` |
| `_p5PortfolioContext` | 3202-3235 | `plUnavailableReason`: `cost-basis-not-recorded · currency-not-recorded · recorded-values-disagree`; `weightUnavailableReason` = the weight reasons above; prompt text *"not recorded (reason)"* (`:3291 :3294`) |
| Reconciliation `status` producer `_pfComputeReconciliation` | 8689-8715 | `unset · invalid · stale · total-incomplete · unexplained-gap · reconciled-with-exclusions · fully-reconciled` (source of the packet text above) |

### 4.4 NC briefing wording table — its own vocabulary (C-4)

Recorded as one vocabulary and **not counted twice**: its census-term occurrences sit inside the
`index.html` totals of §2 and are attributed here in §5 with authority `NC briefing table`.

| Element | Line | Content |
|---|---:|---|
| `NC_BRIEFING_VOCAB` | 2923-2931 | `weightUnavailable{ 'reporting-incomplete' · 'denominator-zero' · 'holding-ils-value-unavailable' }` → three spoken sentences beginning *"weight cannot be computed because …"*; `marketStale` → *"market data for this holding is stale"*; `marketUnavailable` → *"market data was not retrieved for this holding"* |
| `NOTEBOOK_BRIEFING_PROMPT` | 2937 (definition); census-term occurrence at **2940** | frozen prompt prose containing *"When a value is marked unavailable, speak the stated reason as a full sentence…"* |
| `_eodPacketToBriefing` | 2951 (definition); table reads at 2974, 2981, 2983 | the table's only consumer |

The table's keys are the `_p5BuildLocalContext` weight-reason tokens (§4.3) and the boolean
`eodStale`; its values are display-facing (spoken) prose.

### 4.5 S3 read envelope and client adapter — three files (Amendment 1)

Files (unchanged since `0c99e13`): `netlify/functions/lib/news-catalysts-read-core.js` (545 L),
`netlify/functions/news-catalysts-read.mjs` (11 L, no census-term occurrence),
`services/news-catalysts-client.js` (482 L). Machine-facing contract; **no renderer consumes it**:
`grep -i "news-catalysts\|NEWS_CATALYSTS_READ" index.html` is empty and
`grep -rn news-catalysts-client` finds no consumer outside `qa/`. Recorded, not resolved.

**13 server statuses** (`services/news-catalysts-client.js:81-95`, and the `res(...)` sites in the core): `OK · NOT_AVAILABLE · DEGRADED · DISABLED · INVALID_JSON · INVALID_REQUEST · INVALID_INSTANT · INVALID_TICKER · UNAUTHORIZED · TICKER_NOT_ALLOWED · METHOD_NOT_ALLOWED · CONFIGURATION_MISSING · ERROR`.
**Reasons per status** (`:99-113`): `NOT_AVAILABLE`→`NO_RECORD`; `DEGRADED`→`STORE_UNAVAILABLE · STORE_RECORD_INVALID`; `DISABLED`→`SERVER_DISABLED`; `CONFIGURATION_MISSING`→`TOKEN_COLLISION · ALLOWLIST_MISSING · ALLOWLIST_INVALID`; `ERROR`→`PREFLIGHT_UNMAPPED`; the rest carry a same-named or single reason. HTTP pairing `:116-132`. With `OK`, 16 valid combinations.
**Client-side statuses** (`:135-141`): `CLIENT_INVALID_INPUT · CLIENT_TIMEOUT · CLIENT_NETWORK_ERROR (FETCH_UNAVAILABLE · FETCH_FAILED) · CLIENT_INVALID_RESPONSE`; result kinds are the adapter's 3-kind result vocabulary (`_nccResult`).

Per-occurrence attribution (family = evidence, news-catalysts store; authority = **S3 read envelope**; every row machine-internal or comment). Terms are the census terms plus the Amendment 1 screening terms (`UNAVAILABLE`, `degraded`, `missing`, `failed`, `stale`):

| File | Line | Term(s) | Form | Site | Vis |
|---|---:|---|---|---|:-:|
| core | 34 | `stale` | comment | window ends where J7 classifies news `stale` (day 31) | K |
| core | 37 | `Missing`, `missing` | comment | missing-day semantics ruling | K |
| core | 43 | `UNAVAILABLE`, `DEGRADED` | comment | fail-visible: store throw = `DEGRADED / STORE_UNAVAILABLE` | K |
| core | 45 | `DEGRADED` | comment | unusable keys / absent item = `DEGRADED` | K |
| core | 211, 225, 252 | `UNAVAILABLE`, `degraded` | token / identifier | `degraded('STORE_UNAVAILABLE', ticker)` | M |
| core | 214 | `missing` | comment | a missing index is tolerated | K |
| core | 232, 255, 259, 270 | `degraded` | identifier | `degraded('STORE_RECORD_INVALID', ticker)` | M |
| core | 307 | `Missing` | comment | missing/empty server token folds into a reason | K |
| core | 347, 350 | `MISSING` | token | `ALLOWLIST_MISSING` case / `CONFIGURATION_MISSING` status | M |
| core | 499, 500 | `degraded`, `DEGRADED` | identifier / token | `degraded()` builder → `status: 'DEGRADED'` | M |
| core | 519 | `failed` | comment | failed preflight | K |
| client | 76 | `DEGRADED` | identifier | `_NCC_DEGRADED_FIELDS` | M |
| client | 84 | `DEGRADED` | token | server-status list | M |
| client | 93 | `MISSING` | token | server-status list | M |
| client | 101 | `UNAVAILABLE`, `DEGRADED` | token | reason table | M |
| client | 110 | `MISSING` ×2 | token / identifier | reason table (`CONFIGURATION_MISSING`, `ALLOWLIST_MISSING`) | M |
| client | 119 · 128 | `DEGRADED` · `MISSING` | token | HTTP-by-status table | M |
| client | 138 | `UNAVAILABLE`, `FAILED` | token | `FETCH_UNAVAILABLE`, `FETCH_FAILED` | M |
| client | 273 | `failed` | comment | input validation failed | K |
| client | 315, 316 | `DEGRADED` | token / identifier | shape check for the `DEGRADED` body | M |
| client | 368 | `UNAVAILABLE` | token | `FETCH_UNAVAILABLE` result | M |
| client | 403, 421, 460 | `FAILED` | token | `FETCH_FAILED` results | M |

Screening totals reproduce Amendment 1: `DEGRADED` 9, `degraded` 8, `UNAVAILABLE` 7, `MISSING` 6 occurrences on 5 lines, `missing` 2, `FAILED` 4, `failed` 2, `stale` 1.

### 4.6 Other locally-defined state vocabularies in `index.html` (recorded, not ranked)

| Vocabulary | Where | Values |
|---|---|---|
| ResearchView status | `_researchViewForHolding` `:6661-6695`, `_calcResearchCoverageCounts` `:8749-8753` | `unsupported · missing · unavailable · stale · covered` (precedence stated `:6665`); provenance `session · saved · none · other` |
| FX state | `_pfFxState` `:10495-10506` | `missing · fresh · aged-but-valid · stale-invalid` |
| Live-price / market failure | `_mktFailed` `:7244`, `_pfEodApplyAttemptOutcome` `:10348-10359` | boolean flags; badge text `:7250`; UI text *"Stale"* `:10908` |
| SEC evidence-store client | `:3804-3808`, `:3921-3925` | statuses `STORE_HIT · STORE_MISS · STORE_INVALID · DEGRADED · DISABLED`; degraded reasons `STORE_UNAVAILABLE · STORE_READ_FAILURE` |
| Fund-facts read client | `:4314-4315`, `:4544-4574`, `:4322` | status list incl. `NOT_AVAILABLE · DEGRADED · CONFIGURATION_MISSING`; reasons; client reasons `FETCH_UNAVAILABLE · FETCH_FAILED`; freshness states `fresh · aging · stale · missing · degraded` |
| Fund-facts factor display | `_ffpFactorEntry` `:13580-13620` | `state` `not-covered · insufficient-history`; `display` *"not covered"* · *"insufficient history"* |
| Catalyst verdict (7B) | `_reconcile` `:12164-12175`, parse `:12147` | `HARD · WEAK · STALE · NONE`; `VERIFICATION_UNAVAILABLE` (EDGAR, `:12209-12259`, label `:12657`) |
| Needs-attention ids | `_pfComputeNeedsAttention` `:9081-9156` | ids `recon:stale · recon:unavailable · recon:total-incomplete · fx:unavailable`; note `recon:unavailable` is the id for reconciliation `status === 'unset'` whose title reads *"Broker reconciliation not recorded"* (`:9080-9083`) |
| Scan-results banner | `:15107-15206` | threshold 24 h; `_showStaleBanner` / `_hideStaleBanner` |
| Cloud sync | `:14217`, `:14309-14310`, `:14494-14500` | `_PF_CLOUD_STALE_MS`; `CONFIGURATION_MISSING`, `AUTH_FAILED`; *"Timestamp unavailable — cannot confirm freshness."* |

## 5 · Per-occurrence attribution — `index.html`

One row per line carrying at least one census term (261 rows, 294 occurrences). "Enclosing symbol" is the nearest preceding column-0 `function`/`var`/`const`/`let` and is a locator only. Visibility: **U** user-visible · **M** machine-internal · **B** both · **K** comment (non-runtime). Authority `none` = no shared authority owns the surface; `local: …` names a vocabulary defined at that site (recorded, not judged).

| Line | Term(s) | n | Form | Enclosing symbol | Site | Data family | Authority | Vis |
|---:|---|---:|---|---|---|---|---|:-:|
| 172 | `Stale` | 1 | comment | `(top of file / markup)` | scan-results banner (CSS comment) | other (not in §3 list) | local: scan-results banner / scan age | K |
| 178 | `unavailable` | 1 | comment | `(top of file / markup)` | panel row (CSS comment) | other (not in §3 list) | none | K |
| 417 | `Missing` | 1 | comment | `(top of file / markup)` | API-key warning strip (CSS comment) | other (not in §3 list) | none | K |
| 690 | `insufficient` | 1 | identifier | `(top of file / markup)` | CSS class for factor display state | evidence | local: fund-facts factor display | U |
| 898 | `Missing` | 1 | comment | `(top of file / markup)` | API-key warning (HTML comment) | other (not in §3 list) | none | K |
| 904 | `Stale` ×2 | 2 | comment | `(top of file / markup)` | scan-results banner (HTML comment) | other (not in §3 list) | local: scan-results banner / scan age | K |
| 1072 | `insufficient` | 1 | comment | `computeATHDistance` | technical setup classifier (comment) | other (not in §3 list) | none | K |
| 1952 | `STALE` | 1 | identifier | `scoreTickerTech` | technical-score reason code | market/EOD | local: technical-score reason codes | M |
| 1960 | `STALE` | 1 | identifier | `scoreTickerTech` | technical-score reason code | market/EOD | local: technical-score reason codes | M |
| 2016 | `MISSING` | 1 | identifier | `scoreTickerTech` | technical-score reason code | market/EOD | local: technical-score reason codes | M |
| 2098 | `FAILED` | 1 | identifier | `_ts1FetchRawSeries` | market-series fetch error code | market/EOD | none | M |
| 2310 | `Missing` ×2 | 2 | identifier | `_p5ValidateItems` | P-5 news-item rejection counters | research coverage | none | M |
| 2340 | `Missing` | 1 | identifier | `_p5ValidateItems` | P-5 news-item rejection counters | research coverage | none | M |
| 2345 | `Missing` | 1 | identifier | `_p5ValidateItems` | P-5 news-item rejection counters | research coverage | none | M |
| 2381 | `unavailable` | 1 | comment | `_p5SynthesisPayload` | P-5 local-context comment (close/session date) | market/EOD | EOD-packet-local | K |
| 2414 | `Stale` | 1 | identifier | `_p5BuildLocalContext` | P-5 local-context default shape: market.eodStale | market/EOD | EOD-packet-local | M |
| 2416 | `unavailable` | 1 | identifier | `_p5BuildLocalContext` | P-5 local-context default shape: weight.unavailableReason | portfolio/reporting | EOD-packet-local | M |
| 2449 | `Stale` ×2 | 2 | identifier | `_p5BuildLocalContext` | P-5 local-context builder: eodStale | market/EOD | EOD-packet-local | M |
| 2454 | `unavailable` | 1 | identifier | `_p5BuildLocalContext` | P-5 local-context builder: weight reason | portfolio/reporting | EOD-packet-local | M |
| 2455 | `unavailable` | 1 | identifier | `_p5BuildLocalContext` | P-5 local-context builder: weight reason | portfolio/reporting | EOD-packet-local | M |
| 2458 | `unavailable` ×2 | 2 | identifier | `_p5BuildLocalContext` | P-5 local-context builder: weight reason | portfolio/reporting | EOD-packet-local | M |
| 2459 | `unavailable` | 1 | identifier | `_p5BuildLocalContext` | P-5 local-context builder: weight reason | portfolio/reporting | EOD-packet-local | M |
| 2562 | `unavailable`, `Stale` | 2 | string-literal/identifier | `_p5RenderPacket` | P-5 packet renderer: market snapshot | market/EOD | EOD-packet-local | U |
| 2578 | `unavailable` | 1 | string-literal | `_p5RenderPacket` | P-5 packet renderer: P/L and weight | portfolio/reporting | EOD-packet-local | U |
| 2580 | `unavailable` | 1 | string-literal | `_p5RenderPacket` | P-5 packet renderer: P/L and weight | portfolio/reporting | EOD-packet-local | U |
| 2582 | `unavailable` ×2 | 2 | identifier/string-literal | `_p5RenderPacket` | P-5 packet renderer: P/L and weight | portfolio/reporting | EOD-packet-local | U |
| 2614 | `Missing` | 1 | identifier | `_p5RenderPacket` | P-5 packet renderer: news rejection counts | research coverage | EOD-packet-local | U |
| 2615 | `Missing` | 1 | identifier | `_p5RenderPacket` | P-5 packet renderer: news rejection counts | research coverage | EOD-packet-local | U |
| 2659 | `unavailable` | 1 | prose | `_eodReconciliationLimitationText` | EOD reconciliation limitation text | reconciliation | EOD-packet-local | B |
| 2686 | `Missing` ×2 | 2 | identifier | `_eodBuildPacket` | EOD packet news-rejection counter aggregation | research coverage | EOD-packet-local | M |
| 2708 | `Missing` ×2 | 2 | identifier | `_eodBuildPacket` | EOD packet news-rejection counter aggregation | research coverage | EOD-packet-local | M |
| 2709 | `Missing` ×2 | 2 | identifier | `_eodBuildPacket` | EOD packet news-rejection counter aggregation | research coverage | EOD-packet-local | M |
| 2777 | `Unavailable` | 1 | identifier | `_eodBuildPacket` | EOD packet total unavailable-reason key | portfolio/reporting | EOD-packet-local | M |
| 2802 | `Missing` ×2 | 2 | identifier | `_eodBuildPacket` | EOD packet news-rejection limitation text | research coverage | EOD-packet-local | B |
| 2806 | `Missing` ×2 | 2 | identifier | `_eodBuildPacket` | EOD packet news-rejection limitation text | research coverage | EOD-packet-local | B |
| 2820 | `unavailable` | 1 | prose | `_eodBuildPacket` | EOD packet FX limitation text | FX | EOD-packet-local | B |
| 2879 | `unavailable`, `Unavailable` | 2 | prose/identifier | `_eodPacketToMarkdown` | EOD packet markdown: Total | portfolio/reporting | EOD-packet-local | U |
| 2894 | `unavailable` ×2 | 2 | prose/identifier | `_eodPacketToMarkdown` | EOD packet markdown: Weight | portfolio/reporting | EOD-packet-local | U |
| 2924 | `Unavailable` | 1 | identifier | `NC_BRIEFING_VOCAB` | NC_BRIEFING_VOCAB table keys: weightUnavailable | portfolio/reporting | NC briefing table | M |
| 2927 | `unavailable` | 1 | identifier | `NC_BRIEFING_VOCAB` | NC_BRIEFING_VOCAB table keys: weightUnavailable | portfolio/reporting | NC briefing table | M |
| 2929 | `Stale` | 1 | identifier | `NC_BRIEFING_VOCAB` | NC_BRIEFING_VOCAB table keys: marketStale / marketUnavailable | market/EOD | NC briefing table | M |
| 2930 | `Unavailable` | 1 | identifier | `NC_BRIEFING_VOCAB` | NC_BRIEFING_VOCAB table keys: marketStale / marketUnavailable | market/EOD | NC briefing table | M |
| 2940 | `unavailable` | 1 | prose | `NOTEBOOK_BRIEFING_PROMPT` | NOTEBOOK_BRIEFING_PROMPT frozen prose (comments :2933-2936: never read or sent in this phase) | other (not in §3 list) | NC briefing table | M |
| 2974 | `unavailable`, `Unavailable` | 2 | identifier | `_eodPacketToBriefing` | _eodPacketToBriefing (table consumer): weightUnavailable | portfolio/reporting | NC briefing table | M |
| 2980 | `Stale` | 1 | identifier | `_eodPacketToBriefing` | _eodPacketToBriefing (table consumer): eodStale / marketStale / marketUnavailable | market/EOD | NC briefing table | M |
| 2981 | `Stale` | 1 | identifier | `_eodPacketToBriefing` | _eodPacketToBriefing (table consumer): eodStale / marketStale / marketUnavailable | market/EOD | NC briefing table | M |
| 2983 | `Unavailable` | 1 | identifier | `_eodPacketToBriefing` | _eodPacketToBriefing (table consumer): eodStale / marketStale / marketUnavailable | market/EOD | NC briefing table | M |
| 3127 | `FAILED` | 1 | comment | `_p5RunResearch` | P-5 research run: search-failure comment / counters | research coverage | none | K |
| 3131 | `Missing` ×2 | 2 | identifier | `_p5RunResearch` | P-5 research run: search-failure comment / counters | research coverage | none | M |
| 3161 | `unavailable` | 1 | comment | `_p5RunResearch` | P-5 portfolio-context comment | portfolio/reporting | EOD-packet-local | K |
| 3202 | `Unavailable` | 1 | identifier | `_p5PortfolioContext` | _p5PortfolioContext reason keys | portfolio/reporting | EOD-packet-local | M |
| 3203 | `Unavailable` | 1 | identifier | `_p5PortfolioContext` | _p5PortfolioContext reason keys | portfolio/reporting | EOD-packet-local | M |
| 3215 | `Unavailable` | 1 | identifier | `_p5PortfolioContext` | _p5PortfolioContext reason keys | portfolio/reporting | EOD-packet-local | M |
| 3216 | `Unavailable` | 1 | identifier | `_p5PortfolioContext` | _p5PortfolioContext reason keys | portfolio/reporting | EOD-packet-local | M |
| 3217 | `Unavailable` | 1 | identifier | `_p5PortfolioContext` | _p5PortfolioContext reason keys | portfolio/reporting | EOD-packet-local | M |
| 3230 | `Unavailable` | 1 | identifier | `_p5PortfolioContext` | _p5PortfolioContext reason keys | portfolio/reporting | EOD-packet-local | M |
| 3233 | `Unavailable` | 1 | identifier | `_p5PortfolioContext` | _p5PortfolioContext reason keys | portfolio/reporting | EOD-packet-local | M |
| 3234 | `unavailable` | 1 | identifier | `_p5PortfolioContext` | _p5PortfolioContext reason keys | portfolio/reporting | EOD-packet-local | M |
| 3235 | `unavailable`, `Unavailable` | 2 | identifier | `_p5PortfolioContext` | _p5PortfolioContext reason keys | portfolio/reporting | EOD-packet-local | M |
| 3291 | `unavailable`, `Unavailable` | 2 | string-literal/identifier | `_p5Call2User` | P-5 call-2 prompt text: not recorded (reason) | portfolio/reporting | EOD-packet-local | B |
| 3294 | `unavailable`, `Unavailable` | 2 | string-literal/identifier | `_p5Call2User` | P-5 call-2 prompt text: not recorded (reason) | portfolio/reporting | EOD-packet-local | B |
| 3788 | `DEGRADED` | 1 | comment | `requestResearchEvidence` | SEC store client (comment) | evidence | local: SEC evidence-store client contract | K |
| 3804 | `DEGRADED` | 1 | string-literal | `SEC_STORE_SERVER_STATUSES` | SEC store status / degraded-reason constants | evidence | local: SEC evidence-store client contract | M |
| 3806 | `DEGRADED` | 1 | comment | `SEC_STORE_SERVER_STATUSES` | SEC store status / degraded-reason constants | evidence | local: SEC evidence-store client contract | K |
| 3808 | `DEGRADED` | 1 | identifier | `SEC_STORE_DEGRADED_REASONS` | SEC store status / degraded-reason constants | evidence | local: SEC evidence-store client contract | M |
| 3871 | `DEGRADED` | 1 | comment | `_sesValidItem` | SEC store client (comment) | evidence | local: SEC evidence-store client contract | K |
| 3912 | `DEGRADED` | 1 | comment | `normalizeSecEvidenceStoreResponse` | SEC store client (comment) | evidence | local: SEC evidence-store client contract | K |
| 3921 | `DEGRADED` | 1 | string-literal | `normalizeSecEvidenceStoreResponse` | SEC store DEGRADED normalisation | evidence | local: SEC evidence-store client contract | M |
| 3922 | `DEGRADED` | 1 | identifier | `normalizeSecEvidenceStoreResponse` | SEC store DEGRADED normalisation | evidence | local: SEC evidence-store client contract | M |
| 3925 | `DEGRADED` | 1 | string-literal | `normalizeSecEvidenceStoreResponse` | SEC store DEGRADED normalisation | evidence | local: SEC evidence-store client contract | M |
| 4314 | `DEGRADED` | 1 | string-literal | `FUND_FACTS_READ_SERVER_STATUSES` | fund-facts read status list | evidence | local: fund-facts read client contract | M |
| 4315 | `MISSING` | 1 | identifier | `FUND_FACTS_READ_SERVER_STATUSES` | fund-facts read status list | evidence | local: fund-facts read client contract | M |
| 4544 | `DEGRADED` | 1 | token | `FUND_FACTS_READ_ERROR_REASONS` | fund-facts read reason/http/client-reason tables | evidence | local: fund-facts read client contract | M |
| 4545 | `MISSING` ×2 | 2 | identifier | `FUND_FACTS_READ_ERROR_REASONS` | fund-facts read reason/http/client-reason tables | evidence | local: fund-facts read client contract | M |
| 4557 | `DEGRADED` | 1 | token | `FUND_FACTS_READ_HTTP_BY_STATUS` | fund-facts read reason/http/client-reason tables | evidence | local: fund-facts read client contract | M |
| 4559 | `MISSING` | 1 | identifier | `FUND_FACTS_READ_HTTP_BY_STATUS` | fund-facts read reason/http/client-reason tables | evidence | local: fund-facts read client contract | M |
| 4566 | `DEGRADED` | 1 | string-literal | `FUND_FACTS_READ_TICKER_ECHO_STATUSES` | fund-facts read reason/http/client-reason tables | evidence | local: fund-facts read client contract | M |
| 4574 | `FAILED` | 1 | identifier | `FUND_FACTS_READ_CLIENT_REASONS` | fund-facts read reason/http/client-reason tables | evidence | local: fund-facts read client contract | M |
| 4709 | `FAILED` | 1 | identifier | `requestFundFactsRead` | fund-facts read client FETCH_FAILED results | evidence | local: fund-facts read client contract | M |
| 4727 | `FAILED` | 1 | identifier | `requestFundFactsRead` | fund-facts read client FETCH_FAILED results | evidence | local: fund-facts read client contract | M |
| 4766 | `FAILED` | 1 | identifier | `requestFundFactsRead` | fund-facts read client FETCH_FAILED results | evidence | local: fund-facts read client contract | M |
| 5001 | `unavailable` | 1 | prose | `fetchYahooChart` | market-data error message | market/EOD | none | M |
| 5045 | `unavailable` | 1 | prose | `fetchYahoo` | market-data console warning | market/EOD | none | M |
| 5472 | `unavailable` ×2 | 2 | identifier/prose | `formatNewsContext` | formatNewsContext prompt text (upstream unavailable) | research coverage | none | B |
| 5500 | `Stale` | 1 | comment | `formatNewsContext` | isStale (5-min market-data age) | market/EOD | none | K |
| 5502 | `Stale` | 1 | identifier | `isStale` | isStale (5-min market-data age) | market/EOD | none | M |
| 5506 | `STALE` | 1 | token | `isStale` | isStale (5-min market-data age) | market/EOD | none | M |
| 5629 | `insufficient` | 1 | prose | `fetchAnthropicAnalysis` | AI analysis prompt prose | other (not in §3 list) | none | B |
| 5672 | `unavailable` | 1 | prose | `fetchAnthropicAnalysis` | AI analysis prompt prose | other (not in §3 list) | none | B |
| 5827 | `unavailable`, `Missing` | 2 | identifier | `orchestrate` | _catalystDataMissing flag | research coverage | none | M |
| 5829 | `Missing` | 1 | comment | `orchestrate` | _catalystDataMissing flag | research coverage | none | K |
| 5864 | `Missing` ×2 | 2 | identifier | `orchestrate` | _catalystDataMissing flag | research coverage | none | M |
| 5877 | `Missing` | 1 | identifier | `orchestrate` | _catalystDataMissing flag | research coverage | none | M |
| 5910 | `unavailable` | 1 | identifier | `orchestrate` | newsContext source label | research coverage | none | B |
| 5911 | `unavailable` | 1 | prose | `orchestrate` | newsContext source label | research coverage | none | B |
| 5954 | `unavailable`, `Unavailable` | 2 | prose/identifier | `enforceScoreConsistency` | enforceScoreConsistency: AI-unavailable / missing-score sentinel | other (not in §3 list) | none | M |
| 5955 | `MISSING` | 1 | comment | `enforceScoreConsistency` | enforceScoreConsistency: AI-unavailable / missing-score sentinel | other (not in §3 list) | none | K |
| 6162 | `unavailable` | 1 | prose | `analyzeChunk` | Perplexity state default (unavailable:false) | research coverage | none | M |
| 6241 | `unavailable` | 1 | comment | `analyzeChunk` | Perplexity fetch unavailable path | research coverage | none | K |
| 6242 | `unavailable` | 1 | identifier | `analyzeChunk` | Perplexity fetch unavailable path | research coverage | none | M |
| 6243 | `unavailable` | 1 | comment | `analyzeChunk` | Perplexity fetch unavailable path | research coverage | none | K |
| 6256 | `unavailable` | 1 | prose | `analyzeChunk` | Perplexity fetch unavailable path | research coverage | none | M |
| 6261 | `unavailable` | 1 | string-literal | `analyzeChunk` | Perplexity fetch unavailable path | research coverage | none | M |
| 6335 | `unavailable` | 1 | prose | `analyzeChunk` | stored summary text: AI analysis unavailable | other (not in §3 list) | none | U |
| 6345 | `Unavailable` | 1 | identifier | `analyzeChunk` | _aiUnavailable / _aiParseFailed flags | other (not in §3 list) | none | M |
| 6346 | `Failed` | 1 | identifier | `analyzeChunk` | _aiUnavailable / _aiParseFailed flags | other (not in §3 list) | none | M |
| 6445 | `MISSING` | 1 | comment | `_SR_BEARISH_TIER` | score sentinel comment | other (not in §3 list) | none | K |
| 6446 | `Missing` | 1 | comment | `_SR_BEARISH_TIER` | score sentinel comment | other (not in §3 list) | none | K |
| 6600 | `STALE` | 1 | identifier | `_resolveResearchForHolding` | STALE_MS (48h research age) | research coverage | local: ResearchView / research resolver | M |
| 6657 | `STALE` | 1 | identifier | `_resolveResearchForHolding` | stale = age > STALE_MS | research coverage | local: ResearchView / research resolver | M |
| 6665 | `unavailable` | 1 | comment | `_researchViewForHolding` | ResearchView precedence comment | research coverage | local: ResearchView / research resolver | K |
| 6683 | `unavailable`, `Unavailable` | 2 | string-literal/identifier | `_researchViewForHolding` | ResearchView status token | research coverage | local: ResearchView / research resolver | M |
| 7244 | `Failed` | 1 | identifier | `renderWatchlistRows` | _mktFailed price-failure flag | market/EOD | none | M |
| 7247 | `Failed` | 1 | identifier | `renderWatchlistRows` | _mktFailed price-failure flag | market/EOD | none | M |
| 7250 | `unavailable` | 1 | prose | `renderWatchlistRows` | price-failure badge text | market/EOD | none | U |
| 7488 | `unavailable` | 1 | prose | `renderMainPanel` | parse "consensus unavailable" from AI summary | other (not in §3 list) | none | B |
| 7490 | `unavailable` | 1 | prose | `renderMainPanel` | parse "consensus unavailable" from AI summary | other (not in §3 list) | none | B |
| 7495 | `Failed` | 1 | identifier | `renderMainPanel` | _mktFailed flag | market/EOD | none | M |
| 7646 | `Missing` | 1 | comment | `renderMainPanel` | render comment | research coverage | none | K |
| 7697 | `Stale` | 1 | identifier | `renderMainPanel` | scan-age flags | other (not in §3 list) | local: scan-results banner / scan age | M |
| 7698 | `Stale` | 1 | identifier | `renderMainPanel` | scan-age flags | other (not in §3 list) | local: scan-results banner / scan age | M |
| 7743 | `Missing` | 1 | comment | `renderMainPanel` | render comment | research coverage | none | K |
| 7846 | `Unavailable` | 1 | identifier | `renderMainPanel` | attention-level test | research coverage | none | M |
| 7847 | `unavailable` | 1 | prose | `renderMainPanel` | attention level AI_UNAVAILABLE + label | research coverage | none | B |
| 7848 | `Missing` | 1 | identifier | `renderMainPanel` | attention-level test | research coverage | none | M |
| 7887 | `Failed` | 1 | identifier | `renderMainPanel` | _mktFailed conditional | market/EOD | none | M |
| 7889 | `Failed` | 1 | identifier | `renderMainPanel` | _mktFailed conditional | market/EOD | none | M |
| 7900 | `Unavailable` | 1 | identifier | `renderMainPanel` | _aiUnavailable conditional | research coverage | none | M |
| 7903 | `unavailable` | 1 | prose | `renderMainPanel` | data-quality warning prose | research coverage | none | U |
| 7907 | `unavailable` | 1 | prose | `renderMainPanel` | data-quality warning prose | research coverage | none | U |
| 7908 | `Unavailable` | 1 | identifier | `renderMainPanel` | data-quality warning prose | research coverage | none | U |
| 7911 | `unavailable` | 1 | prose | `renderMainPanel` | data-quality warning prose | research coverage | none | U |
| 7912 | `Failed` | 1 | identifier | `renderMainPanel` | _mktFailed conditional | market/EOD | none | M |
| 7932 | `unavailable` | 1 | prose | `renderMainPanel` | empty-state prose (levels/metrics unavailable) | market/EOD | none | U |
| 7961 | `unavailable` | 1 | prose | `renderMainPanel` | empty-state prose (levels/metrics unavailable) | market/EOD | none | U |
| 7981 | `Missing` | 1 | identifier | `renderMainPanel` | _catalystDataMissing conditional | research coverage | none | M |
| 8011 | `Unavailable` | 1 | identifier | `renderMainPanel` | _aiUnavailable conditional | research coverage | none | M |
| 8012 | `unavailable` | 1 | prose | `renderMainPanel` | empty-state prose (data unavailable) | market/EOD | none | U |
| 8021 | `unavailable` | 1 | prose | `renderMainPanel` | empty-state prose (RS unavailable) | market/EOD | none | U |
| 8039 | `unavailable` | 1 | prose | `renderMainPanel` | empty-state prose (RS unavailable) | market/EOD | none | U |
| 8140 | `unavailable` | 1 | string-literal | `renderMainPanel` | source-trace chips | research coverage | none | B |
| 8142 | `Missing` | 1 | identifier | `renderMainPanel` | source-trace chips | research coverage | none | B |
| 8144 | `unavailable`, `Unavailable` ×2 | 3 | string-literal/identifier | `renderMainPanel` | source-trace chips | research coverage | none | B |
| 8509 | `unavailable` | 1 | prose | `_pfSaveFailureMessage` | storage-save failure message | sync | local: storage / cloud-sync messages | U |
| 8677 | `STALE` | 1 | identifier | `PF_RECON_STALE_MAX_DAYS` | PF_RECON_STALE_MAX_DAYS | reconciliation | PF_* family | M |
| 8697 | `STALE` | 1 | identifier | `_pfComputeReconciliation` | PF_RECON_STALE_MAX_DAYS | reconciliation | PF_* family | M |
| 8750 | `unavailable` | 1 | prose | `_calcResearchCoverageCounts` | coverage-count states | research coverage | local: ResearchView / research resolver | M |
| 8753 | `unavailable` | 1 | string-literal | `_calcResearchCoverageCounts` | coverage-count states | research coverage | local: ResearchView / research resolver | M |
| 8799 | `Missing` | 1 | comment | `_calcPortfolioAggregates` | FX comment | FX | local: FX state (_pfFxState) | K |
| 8832 | `unavailable` | 1 | prose | `_pfComputePortfolioReporting` | portfolio completeness reason text | FX | none | B |
| 9030 | `STALE` | 1 | identifier | `PF_ATTENTION_STALE_MAX_DAYS` | PF_ATTENTION_STALE_MAX_DAYS | portfolio/reporting | PF_* family | M |
| 9081 | `unavailable` | 1 | prose | `_pfComputeNeedsAttention` | needs-attention id | reconciliation | none | M |
| 9089 | `unavailable` | 1 | prose | `_pfComputeNeedsAttention` | needs-attention title | reconciliation | none | U |
| 9143 | `STALE` | 1 | identifier | `_pfComputeNeedsAttention` | PF_ATTENTION_STALE_MAX_DAYS use | portfolio/reporting | PF_* family | M |
| 9155 | `unavailable` | 1 | prose | `_pfComputeNeedsAttention` | needs-attention id | FX | none | M |
| 9156 | `unavailable` | 1 | prose | `_pfComputeNeedsAttention` | needs-attention title | FX | none | U |
| 9203 | `Stale` | 1 | identifier | `_pfPortfolioDayEstimate` | _pfEodIsStale use | market/EOD | local: EOD lastFailAt rule (_pfEodIsStale) | M |
| 9460 | `Missing` | 1 | comment | `_renderPortfolioPanel` | summary comment | portfolio/reporting | none | K |
| 9518 | `unavailable` | 1 | prose | `_renderPortfolioPanel` | storage-clear failure toast | sync | local: storage / cloud-sync messages | U |
| 9531 | `unavailable` | 1 | comment | `_renderPortfolioPanel` | FX chip comment | FX | none | K |
| 9540 | `unavailable` | 1 | prose | `_renderPortfolioPanel` | FX chip text | FX | none | U |
| 9622 | `unavailable` | 1 | prose | `_renderPortfolioPanel` | reconciliation chip text | reconciliation | none | U |
| 9647 | `Stale` | 1 | identifier | `_renderPortfolioPanel` | reconciliation stale-detail element ids | reconciliation | none | M |
| 9648 | `Stale` | 1 | identifier | `_renderPortfolioPanel` | reconciliation stale-detail element ids | reconciliation | none | M |
| 9649 | `Stale` | 1 | identifier | `_renderPortfolioPanel` | reconciliation stale-detail element ids | reconciliation | none | M |
| 9650 | `Stale` | 1 | identifier | `_renderPortfolioPanel` | reconciliation stale-detail element ids | reconciliation | none | M |
| 9670 | `unavailable` | 1 | prose | `_renderPortfolioPanel` | storage-clear failure toast | sync | local: storage / cloud-sync messages | U |
| 9812 | `unavailable` ×2 | 2 | string-literal/identifier | `_renderPortfolioPanel` | coverage state labels | research coverage | local: ResearchView / research resolver | B |
| 9835 | `Missing` | 1 | identifier | `_renderPortfolioPanel` | coverage guidance counters | research coverage | none | M |
| 9836 | `Missing` ×2 | 2 | identifier | `_renderPortfolioPanel` | coverage guidance counters | research coverage | none | M |
| 9838 | `Missing` | 1 | identifier | `_renderPortfolioPanel` | coverage guidance counters | research coverage | none | M |
| 9839 | `Missing` ×2 | 2 | identifier | `_renderPortfolioPanel` | coverage guidance counters | research coverage | none | M |
| 9876 | `Unavailable` | 1 | prose | `_renderPortfolioPanel` | sort-button title | portfolio/reporting | none | U |
| 10015 | `Missing` | 1 | identifier | `_renderPortfolioPanel` | P/L element identifier | portfolio/reporting | none | M |
| 10016 | `Missing` | 1 | identifier | `_renderPortfolioPanel` | P/L element identifier | portfolio/reporting | none | M |
| 10017 | `Missing` | 1 | identifier | `_renderPortfolioPanel` | P/L element identifier | portfolio/reporting | none | M |
| 10018 | `Missing` | 1 | identifier | `_renderPortfolioPanel` | P/L element identifier | portfolio/reporting | none | M |
| 10022 | `unavailable` | 1 | prose | `_renderPortfolioPanel` | P/L FX text | FX | none | U |
| 10084 | `Unavailable` | 1 | identifier | `_renderPortfolioPanel` | _aiUnavailable test | research coverage | none | M |
| 10087 | `unavailable` | 1 | prose | `_renderPortfolioPanel` | research-state text | research coverage | none | U |
| 10090 | `Stale` | 1 | identifier | `_renderPortfolioPanel` | isStale identifier | research coverage | local: ResearchView / research resolver | M |
| 10093 | `Stale` | 1 | identifier | `_renderPortfolioPanel` | isStale identifier | research coverage | local: ResearchView / research resolver | M |
| 10094 | `Stale` ×2 | 2 | identifier/string-literal | `_renderPortfolioPanel` | research-state badge text | research coverage | local: ResearchView / research resolver | U |
| 10123 | `Stale` | 1 | identifier | `_renderPortfolioPanel` | isStale identifier | research coverage | local: ResearchView / research resolver | M |
| 10129 | `Stale` | 1 | identifier | `_renderPortfolioPanel` | isStale identifier | research coverage | local: ResearchView / research resolver | M |
| 10171 | `Stale` | 1 | identifier | `_renderPortfolioPanel` | isStale identifier | research coverage | local: ResearchView / research resolver | M |
| 10242 | `Stale` | 1 | identifier | `_renderPortfolioPanel` | EOD cache stale flag | market/EOD | local: EOD lastFailAt rule (_pfEodIsStale) | M |
| 10338 | `Stale` | 1 | identifier | `_pfEodIsStale` | _pfEodIsStale definition | market/EOD | local: EOD lastFailAt rule (_pfEodIsStale) | M |
| 10351 | `Failed` | 1 | identifier | `_pfEodApplyAttemptOutcome` | anyFailed attempt outcome | market/EOD | none | M |
| 10354 | `Failed` | 1 | identifier | `_pfEodApplyAttemptOutcome` | anyFailed attempt outcome | market/EOD | none | M |
| 10359 | `Failed` | 1 | identifier | `_pfEodApplyAttemptOutcome` | anyFailed attempt outcome | market/EOD | none | M |
| 10383 | `Failed` | 1 | identifier | `_pfEodAutoFetchIfDue` | anyFailed attempt outcome | market/EOD | none | M |
| 10384 | `Failed` | 1 | identifier | `_pfEodAutoFetchIfDue` | anyFailed attempt outcome | market/EOD | none | M |
| 10392 | `Failed` | 1 | identifier | `_pfEodManualRefresh` | anyFailed attempt outcome | market/EOD | none | M |
| 10393 | `Failed` | 1 | identifier | `_pfEodManualRefresh` | anyFailed attempt outcome | market/EOD | none | M |
| 10753 | `Stale` | 1 | comment | `_pfLiveSingle` | comment | market/EOD | local: EOD lastFailAt rule (_pfEodIsStale) | K |
| 10908 | `Stale` | 1 | string-literal | `_updatePortfolioCard` | Stale tag text | market/EOD | local: EOD lastFailAt rule (_pfEodIsStale) | U |
| 11739 | `unavailable` | 1 | prose | `saveEditCash` | storage-save failure message | sync | local: storage / cloud-sync messages | U |
| 11931 | `unavailable` | 1 | prose | `saveEditRecon` | storage-save failure message | sync | local: storage / cloud-sync messages | U |
| 12008 | `STALE` | 1 | token | `deletePosition` | catalyst verdict prompt (HARD\|WEAK\|STALE\|NONE) | evidence | local: catalyst verdict (7B) | B |
| 12013 | `STALE` | 1 | token | `deletePosition` | catalyst verdict prompt (HARD\|WEAK\|STALE\|NONE) | evidence | local: catalyst verdict (7B) | B |
| 12045 | `STALE` | 1 | comment | `deletePosition` | comment | evidence | local: catalyst verdict (7B) | K |
| 12049 | `STALE` | 1 | identifier | `deletePosition` | catalyst verdict STALE cues | evidence | local: catalyst verdict (7B) | M |
| 12108 | `STALE` | 1 | identifier | `deletePosition` | catalyst verdict STALE cues | evidence | local: catalyst verdict (7B) | M |
| 12114 | `STALE` | 1 | identifier | `deletePosition` | catalyst verdict STALE cues | evidence | local: catalyst verdict (7B) | M |
| 12116 | `Stale` | 1 | comment | `deletePosition` | comment | evidence | local: catalyst verdict (7B) | K |
| 12147 | `STALE` | 1 | string-literal | `deletePosition` | catalyst verdict reconcile | evidence | local: catalyst verdict (7B) | M |
| 12169 | `STALE` | 1 | string-literal | `deletePosition` | catalyst verdict reconcile | evidence | local: catalyst verdict (7B) | M |
| 12170 | `STALE` | 1 | identifier | `deletePosition` | catalyst verdict reconcile | evidence | local: catalyst verdict (7B) | M |
| 12171 | `STALE` | 1 | identifier | `deletePosition` | catalyst verdict reconcile | evidence | local: catalyst verdict (7B) | M |
| 12174 | `STALE` ×2 | 2 | string-literal/token | `deletePosition` | catalyst verdict reconcile | evidence | local: catalyst verdict (7B) | M |
| 12186 | `Missing` | 1 | identifier | `deletePosition` | ctx.pulseCatalystMissing | evidence | local: catalyst verdict (7B) | M |
| 12188 | `Missing` | 1 | identifier | `deletePosition` | ctx.pulseCatalystMissing | evidence | local: catalyst verdict (7B) | M |
| 12196 | `STALE` | 1 | string-literal | `deletePosition` | catalyst verdict reconcile | evidence | local: catalyst verdict (7B) | M |
| 12209 | `unavailable` | 1 | identifier | `deletePosition` | EDGAR verification_unavailable status | evidence | none | M |
| 12241 | `unavailable` | 1 | identifier | `deletePosition` | EDGAR verification_unavailable status | evidence | none | M |
| 12243 | `unavailable` | 1 | prose | `deletePosition` | EDGAR verification snippet | evidence | none | B |
| 12249 | `unavailable` | 1 | identifier | `deletePosition` | EDGAR verification_unavailable status | evidence | none | M |
| 12259 | `unavailable` | 1 | identifier | `deletePosition` | EDGAR verification_unavailable status | evidence | none | M |
| 12363 | `STALE` | 1 | token | `deletePosition` | finalStatus assign | evidence | local: catalyst verdict (7B) | M |
| 12451 | `STALE` | 1 | identifier | `deletePosition` | console log | evidence | local: catalyst verdict (7B) | M |
| 12657 | `Unavailable` | 1 | prose | `_renderEdgarInsiderPanel` | EDGAR card label | evidence | none | U |
| 12747 | `unavailable` | 1 | prose | `_renderEdgarInsiderPanel` | EDGAR card prose | evidence | none | U |
| 12751 | `unavailable` | 1 | prose | `_renderEdgarInsiderPanel` | EDGAR card prose | evidence | none | U |
| 13085 | `MISSING` | 1 | identifier | `_reStatusMsg` | research-evidence status case label | evidence | none | M |
| 13095 | `DEGRADED` | 1 | string-literal | `_reCacheBadge` | cache status compare | evidence | none | M |
| 13096 | `unavailable` | 1 | prose | `_reCacheBadge` | cache badge text | evidence | none | U |
| 13178 | `DEGRADED` | 1 | string-literal | `_sesStatusMsg` | SEC store status case label | evidence | local: SEC evidence-store client contract | M |
| 13181 | `unavailable` | 1 | prose | `_sesStatusMsg` | SEC store message | evidence | local: SEC evidence-store client contract | U |
| 13275 | `unavailable`, `DEGRADED` | 2 | prose/string-literal | `_ffrStatusMsg` | fund-facts status case + message | evidence | local: fund-facts read client contract | B |
| 13276 | `MISSING` | 1 | identifier | `_ffrStatusMsg` | fund-facts status case label | evidence | local: fund-facts read client contract | M |
| 13587 | `not covered` | 1 | string-literal | `_ffpFactorEntry` | factor display state: not covered | evidence | local: fund-facts factor display | U |
| 13596 | `insufficient` | 1 | identifier | `_ffpFactorEntry` | factor state insufficient-history | evidence | local: fund-facts factor display | M |
| 13597 | `insufficient` | 1 | prose | `_ffpFactorEntry` | factor display insufficient history | evidence | local: fund-facts factor display | U |
| 13617 | `insufficient` | 1 | identifier | `_ffpFactorEntry` | factor state insufficient-history | evidence | local: fund-facts factor display | M |
| 13618 | `insufficient` | 1 | prose | `_ffpFactorEntry` | factor display insufficient history | evidence | local: fund-facts factor display | U |
| 13700 | `unavailable` | 1 | prose | `_ffpRenderFromResult` | fundamentals host text | evidence | none | U |
| 14160 | `unavailable` | 1 | prose | `importPortfolioBackup` | restore toast | sync | local: storage / cloud-sync messages | U |
| 14204 | `unavailable` | 1 | prose | `importPortfolioBackup` | restore toast | sync | local: storage / cloud-sync messages | U |
| 14217 | `STALE` | 1 | identifier | `_PF_CLOUD_STALE_MS` | _PF_CLOUD_STALE_MS | sync | PF_* family | M |
| 14309 | `MISSING` | 1 | identifier | `_pfCloudStatusMsg` | cloud-sync status case labels | sync | none | M |
| 14310 | `FAILED` | 1 | identifier | `_pfCloudStatusMsg` | cloud-sync status case labels | sync | none | M |
| 14494 | `STALE` | 1 | identifier | `_renderCloudPreview` | _PF_CLOUD_STALE_MS use | sync | PF_* family | M |
| 14500 | `unavailable` | 1 | prose | `_renderCloudPreview` | cloud timestamp message | sync | none | U |
| 14714 | `MISSING` | 1 | identifier | `_pfSaveStatusMsg` | cloud-sync status case labels | sync | none | M |
| 14715 | `FAILED` | 1 | identifier | `_pfSaveStatusMsg` | cloud-sync status case labels | sync | none | M |
| 14986 | `Stale` | 1 | identifier | `runAnalysis` | _hideStaleBanner call | other (not in §3 list) | local: scan-results banner / scan age | M |
| 15037 | `unavailable` ×2 | 2 | identifier | `runAnalysis` | telemetry unavailableTickers | research coverage | none | M |
| 15107 | `Stale` | 1 | comment | `runAnalysis` | stale scan-results banner (STALE_RESULT_THRESHOLD_MS) | other (not in §3 list) | local: scan-results banner / scan age | K |
| 15108 | `STALE` | 1 | identifier | `STALE_RESULT_THRESHOLD_MS` | stale scan-results banner (STALE_RESULT_THRESHOLD_MS) | other (not in §3 list) | local: scan-results banner / scan age | M |
| 15110 | `Stale` | 1 | identifier | `_hideStaleBanner` | stale scan-results banner (STALE_RESULT_THRESHOLD_MS) | other (not in §3 list) | local: scan-results banner / scan age | M |
| 15117 | `Stale` | 1 | identifier | `_showStaleBanner` | stale scan-results banner (STALE_RESULT_THRESHOLD_MS) | other (not in §3 list) | local: scan-results banner / scan age | M |
| 15141 | `Stale` | 1 | identifier | `checkAndShowStaleBanner` | stale scan-results banner (STALE_RESULT_THRESHOLD_MS) | other (not in §3 list) | local: scan-results banner / scan age | M |
| 15143 | `Stale` | 1 | identifier | `checkAndShowStaleBanner` | stale scan-results banner (STALE_RESULT_THRESHOLD_MS) | other (not in §3 list) | local: scan-results banner / scan age | M |
| 15151 | `Stale` | 1 | identifier | `checkAndShowStaleBanner` | stale scan-results banner (STALE_RESULT_THRESHOLD_MS) | other (not in §3 list) | local: scan-results banner / scan age | M |
| 15155 | `STALE` | 1 | identifier | `checkAndShowStaleBanner` | stale scan-results banner (STALE_RESULT_THRESHOLD_MS) | other (not in §3 list) | local: scan-results banner / scan age | M |
| 15159 | `Stale` | 1 | identifier | `checkAndShowStaleBanner` | stale scan-results banner (STALE_RESULT_THRESHOLD_MS) | other (not in §3 list) | local: scan-results banner / scan age | M |
| 15163 | `Missing` | 1 | comment | `checkAndShowStaleBanner` | stale scan-results banner (STALE_RESULT_THRESHOLD_MS) | other (not in §3 list) | local: scan-results banner / scan age | K |
| 15206 | `Stale` | 1 | identifier | `init` | stale scan-results banner (STALE_RESULT_THRESHOLD_MS) | other (not in §3 list) | local: scan-results banner / scan age | M |
| 15370 | `Failed` | 1 | prose | `renderApiTable` | API connection badge | other (not in §3 list) | none | U |
| 15425 | `Failed` | 1 | prose | `checkApi` | API connection badge | other (not in §3 list) | none | U |

## 6 · Cross-site listing — one subject, the surface forms recorded today (facts only)

The rows below put, side by side, the forms that different sites use for the same underlying
subject. Nothing here says a form is right, wrong, preferred or redundant; it records what is
written where, so the Owner's ruling can start from the measured spread.

| Subject | Surface forms as written (line) |
|---|---|
| FX rate absent | state token `'missing'` (`:10497`, default `:2415`) · needs-attention id `fx:unavailable` with title *"FX rate unavailable"* (`:9155-9156`) · chip text *"FX unavailable"* (`:9540`) · P/L text *"Unrealized P/L (ILS) — FX unavailable"* (`:10022`) · completeness reason *"USD holdings excluded — FX unavailable"* (`:8832`) · EOD limitation *"FX unavailable — cross-currency totals are not reported."* (`:2820`) |
| FX rate aged | needs-attention title *"FX rate is stale"* (`:9156`) · state tokens `fresh / aged-but-valid / stale-invalid` (`:10503-10505`) |
| Reconciliation never recorded | status `'unset'` (`:8690`) · packet text *"Reconciliation: not recorded."* (`:2655`) · needs-attention id `recon:unavailable`, title *"Broker reconciliation not recorded"* (`:9081-9082`) |
| Reconciliation blocked by incomplete total | status `'total-incomplete'` (`:8705`) · packet text *"Reconciliation: unavailable — Portfolio Total is incomplete."* (`:2659`) · needs-attention id `recon:total-incomplete`, title *"Cash not recorded — reconciliation unavailable"* (`:9088-9089`) · chip text *"Reconciliation unavailable"* (`:9622`) |
| Reconciliation aged | status `'stale'` with `PF_RECON_STALE_MAX_DAYS` = 3 d (`:8697`) · packet text *"Reconciliation: stale — N day(s) …"* (`:2657`) · needs-attention title *"Broker reconciliation is stale"* (`:9075`) |
| EOD market data aged | `_pfEodIsStale` = `lastFailAt` present (`:10338`) · packet `market.eodStale` (`:2449`) · packet text *"(stale)"* (`:2562`) · NC table `marketStale` (`:2929`) · card tag *"Stale"* (`:10908`) |
| EOD market data absent | packet text *"unavailable"* (`:2562`) · NC table `marketUnavailable` (`:2930`) · price-failure flag `_mktFailed` (`:7244`, `:7495`) with badge text (`:7250`) |
| Holding weight not computable | `unavailableReason` `reporting-incomplete / denominator-zero / holding-ils-value-unavailable` (`:2454-2459`) · packet markdown *"unavailable (reason)"* (`:2894`) · NC table `weightUnavailable{…}` (`:2924-2928`) |
| Research / AI result absent | flag `_aiUnavailable` (`:6345`) · ResearchView status `'unavailable'` (`:6683`) · attention level `AI_UNAVAILABLE` with label *"AI unavailable"* (`:7847`) · research-state text *"AI unavailable"* (`:10087`) · summary text *"AI analysis unavailable — market data shown only…"* (`:6335`, `:7911`) |
| Research record aged | `STALE_MS` = 48 h (`:6600`, `:6657`) · ResearchView status `'stale'` · research-state badge *"Stale"* (`:10094`) · coverage-count state `stale` (`:8750`) |
| Evidence record aged (server) | J7 `stale` per family window, days (`evidence-freshness.js:85-91`, `:353`) · mirrored as a literal list in `index.html:4322` |
| Store degraded | J7 item state `degraded` · S3 read envelope `DEGRADED` + `STORE_UNAVAILABLE` / `STORE_RECORD_INVALID` (`news-catalysts-read-core.js:211-270`, `:499-500`) · SEC-store client `DEGRADED` + `STORE_UNAVAILABLE` / `STORE_READ_FAILURE` (`index.html:3804-3808`) · fund-facts read `DEGRADED` (`:4544`) |
| Fetch failure | `FETCH_FAILED` / `FETCH_UNAVAILABLE` client reasons (`index.html:4574`, `news-catalysts-client.js:138`) · `anyFailed` outcome (`index.html:10351-10393`) · *"● Failed"* connection badge (`:15370`, `:15425`) |

## 7 · Not in this census

- No recommendation, ranking, preference or unified vocabulary (brief §4, §7 items 4 and 6).
- No claim that any term is wrong (§7 item 7); the census records what is.
- Terms outside the eleven census terms (for example `stale` lower-case, `missing` lower-case,
  `failed`, `not available`, `not recorded`, `unsupported`) are recorded only where they appear
  inside a listed vocabulary or a §6 surface form; they are **not** exhaustively counted in
  `index.html`, which the brief does not require.
- Files beyond the five measured files (for example `netlify/functions/lib/fund-facts-read-core.js`
  and `netlify/functions/lib/news-catalysts-core.js`, which consume J7) are named as consumers
  only; their own occurrences are not part of this census.
- The family / authority / visibility columns are the Worker's per-site reading and are
  reproducible from the cited lines; a different reader could class a borderline site (marked `B`)
  differently without changing any count in §2.
