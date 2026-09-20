# Capability breakdown: Catalyst News Evidence Pipeline

> **Created 2026-09-21, not amended — no `breakdown.md` existed for this capability.** The earlier
> scoping was delivered in conversation only. This file is the tracked parent; `S1` already landed
> without one.
>
> **Size-limit deviation, stated deliberately:** `AGENTS.md` caps a breakdown at ~80 lines. The
> Owner-directed `## Domain logic` section is reference data (17 rulings × 5 fields), not narrative.
> The six standard sections below are within budget; Domain logic is the addition.
>
> **Reconciled 2026-09-21 to the approved S1.5 brief** (`work/catalyst-news-taxonomy/brief.md`,
> sha256 `5347fe4f…`). Owner amendments **A-1…A-4** are applied, and three statements this file
> previously made are corrected — they are marked **[corrected]** inline rather than deleted, so the
> change is auditable. **Where this file and the approved brief differ, the brief wins.**

## 1 · Outcome

Structured, source-grounded catalyst evidence per ticker — retrievable, non-scoring, and honest
about what is verified. Retrieval is Perplexity-only; every item is `retrieval_unverified` until a
future verification path validates it.

## 2 · Current / Change Map

| Surface | Today | Change |
|---|---|---|
| Client | no catalyst UI | **new** — Ticker Detail card (S3) |
| Server functions | `news-catalysts.mjs` + core landed `9d71dc1`; provider + preflight dormant-complete | **modify** — taxonomy fields in provider (S1.5); **new** read route (S2) |
| Storage / schema | `fundstore:v1:news:*` items + `news-index:*` day index, create-only | **modify** — item record gains 3 fields; identity tuple gains `eventType` (A-2); **key format unchanged** |
| Scores / Actionable Take | no dependency | **none** — `scoringImpact:'none'` is structural |
| Persistence | Netlify Blobs, `fund-facts-store` | **none** — **no news record has ever been written** (gate never activated), so there is no v1 generation to migrate |
| Gates / environment | 3 env names defined, all unset | **none** in S1.5; activation is separate |
| QA | 43 suites; NP01–NP23, NC01–NC40, core suite | **modify** — **NP01 / NP12 / NP15 / NP16** re-baseline plus the two core field-order constants; **NP24–NP32 + NW28** new *(**[corrected]** — this row previously read "NP01 only")* |
| Deploy / external | none | **none** |
| Docs | none | **none** |

## 3 · Decisions

D1 fetch-date index partition, one fetch/ticker/day · D5 manual-trigger only · Grok excluded from
S1, future verification role only. Domain rulings DR-1…DR-17 below.

**Ruled 2026-09-21:**

- **Q-S15-1 — identity tuple: EXCLUDE `eventType` and `relevanceScope`.**
  ***[corrected — SUPERSEDED IN PART by A-2 below.]*** The exclusion now holds for `relevanceScope`
  only. The "no live migration problem" finding stands: the S1 gate has never been activated and no
  news record has ever been written.
- **Q-S15-3 — Catalyst News gets its own contract version.** Do not reuse `fund-contract-v1`.
- **Q-S15-2 — retrieval-mode / index-key design: DEFERRED** to the later Portfolio-EOD vs Research
  work. DR-15 and DR-16's *per-mode* part are parked with it.
- **Q-S15-4 — single-mode prompt windows: RULED.** The vague literal `recent` is replaced with two
  explicit windows: **occurred Catalysts — previous 30 calendar days**; **Upcoming Events — next 60
  calendar days**. This is the **temporary single-mode default only**; the future Portfolio/EOD vs
  Research modes remain deferred under Q-S15-2 and may use different windows.

**Owner amendments, ruled 2026-09-21 with the S1.5 brief:**

- **A-1 — `upcoming_event` carries `direction: null`.** A future scheduled event is not forced into
  positive / neutral / negative before it occurs. `catalyst` keeps the full `DIRECTIONS` vocabulary.
  *Implementation consequence:* the ladder must validate `eventType` **before** `direction`, since
  `null` is outside `DIRECTIONS`; `REQUEST_SCHEMA` gains `null` to the `direction` enum; the
  violation reuses `INVALID_DIRECTION` rather than adding a skip reason.
- **A-2 — `eventType` IS an identity-tuple member; `relevanceScope` is not.** An Upcoming Event and
  the later real Catalyst must be able to coexist as two records under create-only persistence.
  Tuple 8 → 9 members, `eventType` inserted after `category`. `IDENTITY_SCHEMA_VERSION` →
  **`j3-identity-v2`** — documentary, not functional: the constant is never persisted, appearing
  only as hash input at `news-catalysts-provider.js:426`, and adding a member already changes every
  hash. Nothing to migrate (no record exists). `buildNewsKey` and `NEWS_KEY_RE` are **unchanged**.
- **A-3 — Grok is deferred, note only.** No Grok field, module, config or call in S1.5. The
  deferred downstream design is: **Perplexity retrieval/classification → Grok independent
  verification/enrichment → validation / Owner rules → consumption/persistence.** The existing
  `provenance` / `confidence:null` / `requiresVerification` / `scoringImpact:'none'` invariants are
  already the seam a later verification layer writes into; **no field is added now**.
- **A-4 — future `eventDate` on `upcoming_event` is legitimate and its freshness state is
  expected.** See the A-4 block in the S1.5 section below.

## 4 · Unknowns / Gaps

Materiality is model judgment with no calibration or feedback loop — the load-bearing concept in
nearly every DR, and the least testable.

**No open decision blocks S1.5.** Q-S15-4 was the last one and is ruled (§3).

**Consequence, narrowed by A-2 and stated because it is permanent under create-only:** two items
differing *only* in **`relevanceScope`** collide, and the second is dropped `DUPLICATE_IN_BATCH`.
**The first scope classification wins forever** — correctable only by teardown. This is the accepted
cost of not double-recording on re-classification. ***[corrected]*** — `eventType` no longer has
this property; under A-2 it separates records instead.

## 5 · Split / Dependencies

```
S1   write path                 LANDED 9d71dc1
S1.5 taxonomy revision          NEXT — parent of the pilot; see below
S2   read route                 after S1.5 (reads the final item shape)
S3   client card                after S2
S4   activation + live pilot    Owner-gated; after S1.5
```

**S1.5 before the first live fetch.** Not for migration — there is nothing to migrate — but because
the first record ever written should already carry the final shape.

## 6 · Not in v1

Grok verification/enrichment **(A-3 — deferred design note only, no fields)** · analyst-reliability
layer (DR-17) · macro/sector as its own category · automatic ingestion · scoring influence.

---

# Domain logic

**Reading the fixture column honestly.** Most rulings govern *model judgment*, which no unit test
can assert. A fixture ID here means the **representation** is testable — field present, enum valid,
precedence deterministic. Where the ruling is judgment-only, the row says so. **Those rulings are
verified by the S4 pilot and human review, not by `qa:offline`** — treating a judgment rule as
unit-tested would be the over-claim this project keeps catching.

New assertions extend the provider suite as **NP24+**; core/storage assertions extend
`qa/news_catalysts_core_offline.js`.

| DR | Question | Owner ruling | Positive example | Negative / boundary | Fixture |
|---|---|---|---|---|---|
| **DR-1** | Is a known future event a Catalyst? | **No.** `Catalyst` = already happened, may affect the company now. `Upcoming Event/Note` = known future event worth tracking. Distinct `eventType` ∈ `catalyst \| upcoming_event`. ***[corrected]*** **IS an identity-tuple member (A-2)**, so an Upcoming Event and its later real Catalyst coexist as two records. Under **A-1**, `upcoming_event` carries `direction: null`. | Q3 results released 2026-09-15 → `catalyst`, direction `positive` | Earnings scheduled 2026-11-19 → `upcoming_event`, direction `null`, **not** a Catalyst | **NP24** field present + enum; **NP31** identity **differs** when only `eventType` differs, both persist |
| **DR-2** | When does a scheduled event become a Catalyst? | When it is **delayed, cancelled, changed, or otherwise becomes material now** — the *change* is the Catalyst. | PDUFA date pushed 3 months → `catalyst`, `regulatory_legal` | Same date confirmed unchanged → stays `upcoming_event` | judgment-only; pilot |
| **DR-3** | Where does non-company news go? | **Not** `other_catalyst`. Preserve the natural category; express breadth separately via `relevanceScope` ∈ `company\|sector\|market`. **Not in the identity tuple** — unchanged by A-2. | Chip export controls → `regulatory_legal` + `scope:sector` | Same item forced to `other_catalyst` → **wrong** | **NP25** field present + enum; **NP30** identity **unchanged** when only scope differs |
| **DR-4** | `earnings_event` boundary | Include actual results, material revenue/EPS/margin/profitability outcomes, pre-announcements/profit warnings, material info revealed during the earnings process, material earnings delays, restatements. Exclude: future earnings-date announcement (→ DR-1 `upcoming_event`), management guidance (→ `guidance_update`), analyst reaction (→ `analyst_action`). | Q3 EPS miss → `earnings_event` | "Q4 call scheduled Nov 19" → `upcoming_event`, not `earnings_event` | judgment-only; pilot |
| **DR-5** | `guidance_update` boundary | **Management guidance only.** Include raised/lowered/new/withdrawn/suspended guidance and material changes to revenue, EPS, margins, growth, FCF, CapEx or other meaningful outlook metrics, incl. material qualitative changes with no number. **Reaffirmed guidance is not automatically a Catalyst** — only when the reaffirmation is itself materially informative. Analyst forecasts are never management guidance. | FY guidance cut 12% → `guidance_update` | Routine reaffirmation with no new information → **not** a Catalyst | judgment-only; pilot |
| **DR-6** | `analyst_action` boundary | Upgrade/downgrade, rating change, initiation, **material** price-target change, **material** estimate revision. Small technical revisions are not Catalysts. **No hard-coded 5%/10% threshold.** | Two-notch downgrade → `analyst_action` | PT $101→$102 housekeeping → not a Catalyst | judgment-only; pilot |
| **DR-7** | `corporate_action` boundary | Capital allocation, capital structure, structural events: M&A offers/definitive agreements/material terminations, buybacks, dividend initiation/cut/suspension/special, splits, spin-offs, material equity issuance, material debt/refinancing, bankruptcy, major capital-structure change, strategic-alternatives/poison pill when material. **Not** ordinary management change or routine operating restructuring. Ordinary deal completion is not a new Catalyst unless something material changes at completion. | Dividend suspended → `corporate_action` | Previously-announced merger closes on schedule → not a new Catalyst | judgment-only; pilot |
| **DR-8** | `product_customer_partnership` boundary | Core concept **material commercial traction**: product launch, major customer win, significant contract, strategic partnership, material expansion, meaningful distribution/integration, design win. Filter routine PR: non-binding MoUs, ordinary co-marketing, routine product updates, immaterial customer announcements. **No revenue-percentage threshold.** A strategically important customer may be material at small initial value. | Multi-year hyperscaler design win → material | Non-binding MoU press release → filtered | judgment-only; pilot |
| **DR-9** | `regulatory_legal` boundary | Approvals/rejections, investigations, enforcement, lawsuits, rulings, fines/settlements, antitrust, licences/permits, export-import restrictions, sanctions, injunctions, recalls/sales restrictions. Filter routine legal noise. **Materiality is relative to the company and business impact, not a dollar threshold.** Use `relevanceScope` to separate direct company events from sector/market regulation. | FDA approval → `regulatory_legal`, `scope:company` | Routine patent-docket filing → filtered | **NP25** (scope); rest judgment-only |
| **DR-10** | `other_catalyst` use | **True last resort only**, when no specific category applies. **Requires a short `subType`.** Frequent repeated subtypes trigger a taxonomy review, not permanent accumulation. **`subType` is always present on the item, `null` when not applicable** — a sometimes-absent key would break every `Object.keys` field-order pin. | Trading halt → `other_catalyst` + `subType:'trading_halt'` | Sector regulation dumped here → **wrong**, see DR-3 | **NP26** non-empty iff `other_catalyst`, `null` otherwise |
| **DR-11** | May one source yield several items? | **Yes.** One source may create both an earnings Catalyst and a guidance Catalyst. Category is part of identity, so both persist. | Release with results + new guidance → 2 items, same `eventDate`/`sourceUrl` | Same item emitted twice identically → `DUPLICATE_IN_BATCH` | **already passes** — verified: keys `589f4100…` / `ca63a8c3…`; existing NP10 |
| **DR-12** | How is materiality decided? | Relative to the company and its business impact. **No fixed thresholds are hard-coded at this stage** in any category. | Small contract, strategically pivotal customer → material | A fixed % rule in code → **forbidden for now** | **NP27** static scan: no numeric materiality constant in provider |
| **DR-13** | How is `direction` decided? | `positive\|neutral\|negative` **for the company**, considering both change vs prior company guidance **and** market expectations/consensus where reliable evidence exists. **A-1: this applies to `catalyst` only — `upcoming_event` requires `direction: null`.** | Guidance raised but below consensus → may be `negative` | Treating any raise as automatically `positive` → wrong; giving a future event a direction → `INVALID_DIRECTION` | **NP32** direction conditionality (A-1); the judgment itself is pilot-only |
| **DR-14** | Which categories come later? | Identified, **not** implemented now: `management_change`, `operational_update`, `cybersecurity_event`, `credit_rating_event`, possibly a short-seller/investigative type. | CFO departure → today `other_catalyst` + `subType` | Adding a category silently → must update **3 sites** (`CATEGORIES`, schema enum, prompt) | **NP28** three-site vocabulary parity |
| **DR-15** *(DEFERRED — Q-S15-2)* | One retrieval mode or two? | **Two, later.** Portfolio/EOD — repeated scans, only new material events since the last scan, `NONE` is normal, avoid rediscovery. Research — broader historical lookback to understand the current story. | EOD scan returning `NONE` → normal | One prompt serving both → current state, inadequate | **deferred**; see Q-S15-2 |
| **DR-16** *(single-mode part RULED — Q-S15-4; per-mode part DEFERRED — Q-S15-2)* | Is `recent` adequate? | **No — too vague.** For S1.5's one mode: occurred Catalysts **previous 30 calendar days**, Upcoming Events **next 60 calendar days**. Temporary default; per-mode windows arrive with Q-S15-2. | Prompt states both windows explicitly, in calendar days | Literal `'recent'` in the prompt → current state | **NP29** — prompt asserts both windows; no `'recent'` |
| **DR-17** | Are large institutions more reliable? | **Not assumed.** A separate Analyst/Institution Reliability layer based on actual historical performance — directional accuracy, target hit rate over a fixed horizon, average target error, revision frequency, sector performance, real market influence. | Reliability weight derived from measured history | Weighting by institution size/brand → forbidden | **out of scope** — separate subsystem, not this pipeline |

## Change-class routing

| Class | DRs |
|---|---|
| **Already supported by landed S1** | DR-11 (multi-item per source), and the `provenance`/`confidence:null`/`requiresVerification`/`scoringImpact:'none'` invariants underpinning DR-12/DR-17 |
| **Prompt-only** | DR-2, DR-4, DR-5, DR-6, DR-7, DR-8, DR-9, DR-13 — definitions and filters, no new field — **and now DR-16**, reclassified by Q-S15-4: two stated windows need no `lookbackDays` field |
| **Schema / contract** | DR-1 (`eventType`), DR-3 (`relevanceScope`), DR-10 (`subType`), DR-13/A-1 (nullable `direction`), DR-14 (vocabulary) — **each needs a field or enum change; a prompt alone cannot deliver them** (verified: unknown item fields are silently discarded) |
| **Persistence / identity** | ***[corrected]*** **Not "None".** Under **A-2** the tuple gains `eventType` (8 → 9 members) and `IDENTITY_SCHEMA_VERSION` → `j3-identity-v2`, so **every hash changes** — with nothing to migrate, since no record exists. `buildNewsKey` and `NEWS_KEY_RE` remain **unchanged**. `relevanceScope` stays out; trade-off in §4 |
| **Later — S2/S3** | DR-1 display split (`catalyst` vs `upcoming_event`, incl. the A-4.4 freshness rule), DR-3 as filter/badge, DR-10 `subType` surfacing |
| **Out of pipeline** | DR-15 retrieval modes (conflicts with the D1 day-index, see Q-S15-2), DR-17 reliability layer |

---

# S1.5 · Catalyst News Taxonomy Revision — child breakdown

**Objective.** Revise the provider's item contract and prompt so the DR rulings are representable,
**before any live fetch writes an un-migratable record.**

**Likely files**

```
netlify/functions/lib/news-catalysts-provider.js   modify   fields, enums, tuple, ladder, prompt, version value
qa/news_catalysts_provider_offline.js              modify   NP01+NP12+NP15+NP16 re-baseline; NP24–NP32 new
netlify/functions/lib/news-catalysts-core.js       modify   ITEM_FIELDS projection list only
qa/news_catalysts_core_offline.js                  modify   ITEM_FIELD_ORDER / RECORD_FIELD_ORDER; NW28
```

**Contract changes** — field names are **camelCase**, matching every existing item field.

- `eventType` ∈ `catalyst | upcoming_event` — mandatory (DR-1)
- `relevanceScope` ∈ `company | sector | market` — mandatory (DR-3)
- `subType` — **always present**; non-empty string iff `category === 'other_catalyst'`, else `null`
- `direction` — nullable per **A-1**: a `DIRECTIONS` value for `catalyst`, exactly `null` for
  `upcoming_event`. `REQUEST_SCHEMA` gains `null` to the enum and drops the `type` keyword
- `REQUEST_SCHEMA`: `eventType` and `relevanceScope` join `required`; **`subType` does not** — its
  conditionality is enforced by the ladder, which JSON Schema cannot express without `if/then`
- Ladder order is load-bearing: **`eventType` is validated before `direction`**, because `null` is
  outside `DIRECTIONS` and would otherwise skip every upcoming event. New reasons
  `UNKNOWN_EVENT_TYPE`, `INVALID_RELEVANCE_SCOPE`, `INVALID_SUB_TYPE` (7 → 10, appended);
  the direction-shape violation **reuses `INVALID_DIRECTION`**
- Prompt: the DR-4…DR-9 definitions and DR-13 direction rule, plus the two **Q-S15-4** windows —
  occurred Catalysts **previous 30 calendar days**, Upcoming Events **next 60 calendar days** —
  replacing the bare literal `recent` at `news-catalysts-provider.js:211` (DR-16)

**Window semantics ***[corrected]*****. The windows are **stated to the model in words**, not
computed. `buildRequestBody(ticker)` takes **only the ticker** (`:201`); emitting absolute dates
would mean threading `nowIso` into it and expanding NP01's fixture. There is **no date arithmetic
and no post-fetch date filter** anywhere in S1.5 — *(this file previously said the windows are
"measured against the injected clock"; they are not measured in code at all)*. The 30-day lookback
still aligns with the `news` family's 30-day stale threshold, so a daily fetch leaves no gap.

**Identity / dedup — A-2 supersedes Q-S15-1 in part**

Tuple gains one member, inserted after `category`: `{schemaVersion, ticker, eventDate, category,
`**`eventType`**`, direction, normalizedSourceUrl, sourceDomain, provider}` — 8 → 9.
`relevanceScope` is **not** a member.

| Consequence | Effect |
|---|---|
| `buildNewsKey`, `NEWS_KEY_RE` | **unchanged** — NP17 does not move; key *format* is identical |
| `IDENTITY_SCHEMA_VERSION` | ***[corrected]*** **bumps to `j3-identity-v2`.** Documentary, not functional: it is never persisted (hash input only, `:426`), and the new member already changes every hash. It is the one place recording which tuple shape produced a hash. Free, because NP15's pinned literal is rewritten either way |
| Every `identityHash` | **changes.** Nothing to migrate — the gate has never been activated |
| NP15 deterministic identity | ***[corrected]*** **moves** — its `pinnedHash` helper hard-codes the tuple JSON including `"schemaVersion":"j3-identity-v1"` |
| Upcoming → Catalyst | **different hashes, different keys, both persist** (NP31). Note A-1 alone would also have separated them via `direction`; A-2 makes that structural rather than incidental |
| Re-scoping (`relevanceScope`) | same key ⇒ `modified:false` ⇒ no second record. **First scope wins permanently** (§4) |

**Contract/version — RULED (Q-S15-3), with the mechanism corrected.**
***[corrected]*** Keep the exported identifier `CONTRACT_VERSION` and change **only its value** to
`'news-contract-v1'` (`news-catalysts-provider.js:54`). *(This file previously proposed a new
`NEWS_CONTRACT_VERSION` constant — a rename would break the destructuring import at
`news-catalysts-core.js:70`, the comparison at `:320`, and three core-suite references reading
`provider.CONTRACT_VERSION`, for no behavioural gain.)*

Verified safe: `evidence-freshness.js:213` requires `contractVersion` to be an identity **string**;
`:221` pins an exact value **only for the `facts` family**. The `news` family has no value pin.

**Core touch points:** `:70`, `:119` and `:320` need **no edit** under the value-only change; `:119`
projects the value onto every stored record automatically. The only core edit is the `ITEM_FIELDS`
list.

**A-4 · Future event dates and the freshness evaluator**

- **A-4.1** A future `eventDate` on an `upcoming_event` is legitimate, and **nothing in the write
  path rejects it** — verified: `evidence-contract.optionalDate` is grammar + calendar-validity only
  with no clock reference; the provider ladder's only date outcomes are `MISSING_`/`INVALID_EVENT_DATE`;
  the core compares `fetchedAt` and `retrievedAt` to `nowIso` but **never `eventDate`**.
- **A-4.2** S1.5 must **not** modify `evidence-freshness.js`. NP18's whole value is exercising the
  J7 evaluator **unmodified**.
- **A-4.3** `TIMESTAMP_PRECEDENCE` prefers `eventDate` over `fetchedAt`, and
  `evidence-freshness.js:344-348` returns `state:'degraded'`, `reason:'TIMESTAMP_AHEAD_OF_CLOCK'`
  for any negative age — by design, so a future timestamp is *"never silently fresh"*. **Every
  `upcoming_event` therefore reads back as `degraded`, never `fresh`. Expected, not a defect.**
- **A-4.4** **Binding on S2:** branch on `eventType` before interpreting freshness; **never** present
  that condition as a data-quality failure; do not resolve it by editing the evaluator or rewriting
  `eventDate`.

Pinned end to end by **NP32** (normalization) and **NW28** (persistence), which share one
future-dated fixture.

**Materiality handling.** DR-12 forbids hard-coded thresholds — enforced negatively by **NP27**
(static scan for numeric materiality constants). Materiality itself stays in the prompt.

**Upcoming Event representation.** One field, one enum. **Not** a separate record type, key family,
or store — `eventType` on the existing item shape. It is now a tuple member (A-2), but
`buildNewsKey` and `NEWS_KEY_RE` are still untouched: only the hash *value* changes, not the key
*format*.

**Pilot readiness.** S1.5 is the precondition for S4. The live pilot answers DR-2, 4, 5, 6, 7, 8, 9,
13 — every judgment-only row — and nothing else can.

**QA impact ***[corrected]***** — four existing pins move, not one.

| Pin | Moves? | Why |
|---|---|---|
| **NP01** envelope deep-equal + stringify + exact request | **YES** | new item fields; new `contractVersion` value; new prompt literal — which the suite holds a **verbatim second copy of** at `:215` |
| **NP12** invalid direction | **YES** *(new)* | direction validity is now conditional on `eventType` (A-1) |
| **NP15** deterministic identity | **YES** *(was "no")* | tuple gains `eventType`; `schemaVersion` → `j3-identity-v2` (A-2) |
| **NP16** projection pin | **YES** *(newly identified)* | `:468` asserts "exact 14-field projection"; `ITEM_FIELD_ORDER` 14 → 17 |
| **NP17** store-key shape | **no** | key format unchanged; the assertion is computed, not a pinned hash literal |
| **NP18** J7 freshness integration | **verify, do not edit** | projection carries a news-specific `contractVersion`; `validRecord` accepts any identity string for `news` |
| core suite `ITEM_FIELD_ORDER` `:79` / `RECORD_FIELD_ORDER` `:84` | **YES** *(newly identified)* | 14 → 17 and 16 → 19; drives the NW record assertions |
| **NP24–NP32**, **NW28** | **new** | field/enum presence, `subType` conditionality, no-threshold scan, vocabulary parity, prompt windows, scope identity-inertness, `eventType` identity-bearing, direction conditionality, future-dated persistence |

Item projection **14 → 17** fields; stored record **16 → 19**. Suite count stays **43** — no new
file. *(This file previously claimed "only one existing pin re-baselines"; NP12, NP15, NP16 and the
two core constants were missed.)*
