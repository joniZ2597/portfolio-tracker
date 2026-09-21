# Task brief: catalyst news taxonomy revision — S1.5

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Only then may implementation begin, per `AGENTS.md`
"Task folder convention".

Source of truth: `work/catalyst-news/breakdown.md` (202 lines, sha256
`60a7b299498396a9e178e98c65742001d7c68f9313fa27b7ba6e61e1eb5b0307`), as amended by the Owner on
2026-09-21 — **A-1 upcoming-event direction · A-2 identity tuple · A-3 deferred Grok layer ·
A-4 future event dates and the freshness evaluator · A-5 core validation, after a Worker STOP-1 ·
A-5.1 core boundary validation for relevanceScope/subType, after a step-8 Codex finding**.
Three further corrections to the breakdown were found while sourcing this brief; all are recorded
under "Corrections to the breakdown" and the breakdown is amended to match if this brief is approved.

## Baseline

| | |
|---|---|
| `branch-dev` = `origin/branch-dev` | **`9d71dc1`** — in sync |
| `origin/main` | `fbec2c1` |
| Tracked tree | clean — `git diff --ignore-cr-at-eol --stat` and `--cached` both empty. *(A plain `git status` under the host's `core.autocrlf=true` lists ~159 files as modified; that is the known CRLF illusion, not content.)* |
| `npm run qa:offline` | expected **PASS, 43 effective suites**. Confirmed by the Worker's step-0 pre-edit baseline, not asserted here |
| In-flight concurrency | **none.** `fix-benchmark-self-comparison` landed at `9cade5b`; no worktree sits on `branch-dev` besides the main tree |
| Owner rulings applied | **Q-S15-1** *(superseded in part by A-2)* · **Q-S15-2** retrieval modes deferred · **Q-S15-3** news-specific contract version · **Q-S15-4** 30-day / 60-day single-mode windows · **A-1** · **A-2** · **A-3** · **A-4** |

## Objective

Make the DR-1 / DR-3 / DR-10 / DR-14 / DR-16 rulings **representable** in the provider's item
contract and **stated** in its prompt, before any live fetch writes a record in the old shape.

**Nothing is activated.** The three gate env names remain unset, no route changes behaviour, no
live call is made. This task is a contract and prompt revision only.

**Why now:** verified by execution during the audit — `normalizeNewsResponse` **silently discards**
unknown item fields (`eventType`, `relevance_scope`, `sub_type` all returned `survived? false`). No
taxonomy ruling that needs a field can be delivered by prompt alone. S1.5 is the precondition for
the S4 pilot.

## Implementation scope — four existing files, no new file

```
netlify/functions/lib/news-catalysts-provider.js   modify   fields, enums, tuple, ladder, prompt, version value
qa/news_catalysts_provider_offline.js              modify   NP01 + NP12 + NP15 + NP16 re-baseline; NP24–NP32 new
netlify/functions/lib/news-catalysts-core.js       modify   ITEM_FIELDS list + validateProviderResult guard (A-5, A-5.1)
qa/news_catalysts_core_offline.js                  modify   ITEM_FIELD_ORDER / RECORD_FIELD_ORDER; NW27 negatives; NW28–NW29
```

> **Amendment A-5, 2026-09-21 — scope widened by Owner ruling after a Worker STOP-1.** The core edit
> is no longer "projection list only". See "Owner amendment A-5" below.

**Explicitly out of scope:** `index.html` · `services/**` · any client code · any read route (S2) ·
`netlify/functions/news-catalysts.mjs` · `lib/news-catalysts-preflight.js` (**frozen — not one
byte**) · `lib/evidence-contract.js` · `lib/evidence-freshness.js` (**frozen — the J7 evaluator is
reused unmodified, which is the point of NP18**) · `qa/run-offline.js` ·
`qa/fund_facts_route_offline.js` · `netlify.toml` · `package.json` · `CLAUDE.md` · `AGENTS.md` ·
`BACKLOG.md` · **any gate activation, env var, or Netlify change** · **Grok / GrokBot of any kind
(A-3)** · **retrieval modes and index-key design (deferred under Q-S15-2)**.

**No ASK-tier file is in scope**, so no brief-listing entry is required and no MANUAL posture prompt
is expected. Posture is **ACCEPT EDITS** within the four files above.

**No `package.json` change** — no new QA file is added, so auto-discovery has nothing to find.

## Owner amendment A-2 — identity tuple, assessed explicitly

**Ruling:** `eventType` **is** a tuple member; `relevanceScope` is **not**.

**Reason accepted and verified:** under create-only persistence an Upcoming Event and the later
real Catalyst must be able to coexist as two records.

### The tuple — 8 members → 9

```
{ schemaVersion, ticker, eventDate, category, eventType, direction,
  normalizedSourceUrl, sourceDomain, provider }
```

`eventType` is inserted **after `category`, before `direction`**, matching the validation-ladder
order. Key insertion order is normative — `JSON.stringify` serialises in insertion order and the
hash is reproducible only because this exact order is fixed.

### `IDENTITY_SCHEMA_VERSION` — bump to `j3-identity-v2`, **recommended**

Assessed honestly, because the answer is less obvious than it looks:

| | |
|---|---|
| Is a bump **functionally** required? | **No.** Adding a tuple member already changes every hash. And `schemaVersion` is **never persisted** — it appears exactly once, at `news-catalysts-provider.js:426`, as hash input only. No stored record or consumer ever reads it |
| Is a bump **free**? | **Yes.** `NP15`'s `pinnedHash` helper hard-codes the tuple JSON *including* `"schemaVersion":"j3-identity-v1"`. That literal is rewritten whichever way this goes |
| So why bump? | It is the single place in the source that records *which tuple shape produced a hash*. Leaving it at `v1` while the shape changes makes the constant untrue for any future reader |

**Locked:** `IDENTITY_SCHEMA_VERSION = 'j3-identity-v2'`. This is a **documentary** change, and the
brief says so rather than implying it does work it does not do.

### Hash and key implications

| Surface | Effect |
|---|---|
| `identityHash` | **Every hash changes** — new member + new `schemaVersion`. No live record exists (the gate has never been activated), so there is **nothing to migrate** |
| `buildNewsKey` | **Not touched.** Still `'fundstore:v1:news:' + ticker + ':' + eventDate + ':' + identityHash` |
| `NEWS_KEY_RE` | **Not touched.** The hash is still 64 lowercase hex; the key *format* is identical |
| Index key | **Not touched** — `fundstore:v1:news-index:<TICKER>:<fetchDate>` is independent of item identity |
| Collision behaviour | An Upcoming Event and its later Catalyst now produce **different hashes and different keys** and both persist |

### What A-2 does **not** fix, stated plainly

`relevanceScope` remains identity-inert by ruling. Two items identical except in
`relevanceScope` still collide, and the second is dropped `DUPLICATE_IN_BATCH`. **The first
classification wins permanently** — correctable only by teardown. This is the accepted trade against
double-recording, and **NP30** pins it so it stays deliberate.

### One observation the Owner should have — A-1 already separates the example case

Under **A-1**, an `upcoming_event` carries `direction: null` and a `catalyst` always carries a real
direction. `direction` is *already* a tuple member. So in the Nov-19 earnings example the two
records would have diverged **even without A-2**.

That does not make A-2 redundant — it makes it **structural instead of incidental**. Separation
that depends on the direction rule would silently disappear the day that rule changes. A-2 puts the
distinction where it belongs. Recording this so the reasoning is not mistaken for a stronger claim
than it is.

## Owner amendment A-1 — upcoming events carry no direction

| `eventType` | `direction` |
|---|---|
| `catalyst` | `positive` \| `neutral` \| `negative` — required |
| `upcoming_event` | **`null`** — required to be null |

A future scheduled event is not forced into a sentiment before it happens.

**Three consequences the implementation must handle:**

1. **The ladder must check `eventType` before `direction`.** The existing check
   (`news-catalysts-provider.js:416`) rejects anything outside `DIRECTIONS`, and `null` is outside
   it. Without the reorder, every upcoming event would be skipped `INVALID_DIRECTION`.
2. **`REQUEST_SCHEMA` must permit null.** The `direction` property becomes
   `{ enum: ['positive', 'neutral', 'negative', null] }` — the `type: 'string'` keyword is dropped
   so `null` validates. `direction` stays in `required`; the *conditionality* is enforced by the
   ladder, not the schema, because JSON Schema cannot express it without `if/then`.
3. **No new skip reason.** A wrong-shaped direction for the event type reuses **`INVALID_DIRECTION`**
   — the semantics match exactly and `SKIP_REASONS` does not grow a fourth time.

## Owner amendment A-4 — future event dates and the freshness evaluator

Four statements, recorded explicitly so no later actor treats any of them as a defect.

### A-4.1 · A future `eventDate` is legitimate for `upcoming_event` — **[CORRECTED]**

A known future event is the whole point of the `upcoming_event` type. Its `eventDate` is the date
the event is scheduled for, which is **ahead of the fetch clock by design**.

**What is true — the `eventDate` itself is never clock-checked:**

| Surface | Evidence |
|---|---|
| `evidence-contract.optionalDate` | grammar (`/^\d{4}-\d{2}-\d{2}$/`) plus calendar-validity round-trip only. **No clock reference anywhere in the module** |
| Provider ladder | `news-catalysts-provider.js:382-390` — `MISSING_EVENT_DATE` / `INVALID_EVENT_DATE` are the only date outcomes; neither is time-relative |
| Core `eventDate` | `news-catalysts-core.js` compares `fetchedAt` and `retrievedAt` to `nowIso` (`:318`, `:329`). **`eventDate` is never compared to the clock** |
| `NEWS_KEY_RE` | pins the date *grammar* inside the key, not its relation to now |

> **CORRECTION — the earlier claim that "nothing in the write path rejects it" was wrong, and is
> withdrawn.** It generalised an `eventDate` finding to the whole item shape. The A-1 *shape* — not
> the date — is rejected by the core, and a Worker found it. See A-5.

**A-4.1 as it now stands:** a future `eventDate` is legitimate and passes every date check. The
`direction: null` that accompanies it does **not** pass the core today; A-5 authorises the fix.

### A-4.2 · S1.5 must **not** modify `evidence-freshness.js`

The file is frozen in this task's scope and named in **STOP condition 4**. NP18's value is that it
exercises the J7 evaluator **unmodified**; editing it would destroy the assertion it exists to make.

### A-4.3 · `TIMESTAMP_AHEAD_OF_CLOCK` is known and expected

`TIMESTAMP_PRECEDENCE` prefers `eventDate` over `fetchedAt`, and `evidence-freshness.js:344-348`
returns **`state: 'degraded'`, `reason: 'TIMESTAMP_AHEAD_OF_CLOCK'`** for any negative age —
deliberately, per its own comment, so a future timestamp is *"never silently fresh"*.

**Therefore every `upcoming_event` reads back as `degraded`, never `fresh`.** Under the current
evaluator this is correct behaviour, not a bug, and **not** a signal that the record is malformed.

### A-4.4 · S2 must handle `eventType === 'upcoming_event'` separately

Binding on the S2 read route when it is briefed:

- S2 **must** branch on `eventType` before interpreting freshness.
- S2 **must not** present `degraded` / `TIMESTAMP_AHEAD_OF_CLOCK` on an `upcoming_event` as a
  data-quality failure, a stale record, or an error state. For that type the condition is the
  expected result.
- S2 **must not** resolve this by editing the evaluator or by rewriting `eventDate`.

*Forward-binding only — S2 is out of this task's scope and nothing here authorises S2 work.*

## Owner amendment A-5 — core validation, and the Worker STOP that found it

**Raised by Worker 1 as STOP-1 (brief requirement unsatisfiable as written). Owner ruling: FIX NOW.**

### The guard

`news-catalysts-core.js:331`, inside `validateProviderResult`:

```js
if (!isNonEmptyString(item.direction)) { return { ok: false }; }
```

with `isNonEmptyString` (`:347-349`) = `typeof v === 'string' && v !== ''`.

`null` is not a string, so **every `upcoming_event` produced under A-1 is rejected by the core** —
and the rejection is **whole-envelope, not per-item**: `validateProviderResult` returns `{ok:false}`
at the first bad item, the handler maps that to `providerFailure()` (`:226-229`), and **a single
upcoming event would fail the entire fetch, writing nothing at all.** A mixed batch of one catalyst
and one upcoming event would persist neither.

**The Worker was right to stop.** The brief required a shape the in-scope surface could not accept.

### The authorised change

Replace the unconditional guard with the A-1 conditional:

```
eventType === 'catalyst'        ⇒ direction MUST be one of DIRECTIONS
                                  (positive | neutral | negative)
eventType === 'upcoming_event'  ⇒ direction MUST be exactly null
eventType anything else         ⇒ envelope rejected (fail closed, unchanged)
```

The core must also validate `eventType` itself against the provider's `EVENT_TYPES`, in the same
fail-closed style as the existing `CATEGORIES` check at `:330`.

**What must not loosen.** The core is a fail-closed boundary against a drifted provider. Every
existing rejection stays a rejection:

- `direction: ''` — still rejected, for **both** event types. `null` is permitted; empty string is not.
- `direction: null` on a `catalyst` — rejected.
- `direction: 'positive'` on an `upcoming_event` — rejected.
- A non-string, non-null `direction` (number, object, array) — rejected.

This is a **narrowing with one authorised exception**, not a relaxation. `qa/news_catalysts_core_offline.js`
NW27 (`:903`, "planted 5") already pins `'empty direction'` as a negative at `:936`; that case
stays, and the three cases above join it.

### Scope consequence

`news-catalysts-core.js` may now be edited beyond `ITEM_FIELDS`, for **`validateProviderResult`
only**. Everything else in the core — `projectItemRecord`, the write order, the response envelopes,
the index logic, `acquireNowIso` — remains untouched, and touching any of it is STOP-1.

## Owner amendment A-5.1 — core boundary validation for relevanceScope/subType

**Raised by the step-8 Codex review over the implementation diff.** `validateProviderResult`
validates `eventType` and the conditional `direction` (A-5), but has no check at all for
`relevanceScope` or `subType`. Under an injected/drifted `providerImpl` (the test-only, event-only
seam — unreachable from any real request), an item missing or wrong-shaped in either field still
returns `ok: true`; `projectItemRecord` then persists an off-contract value, or `JSON.stringify`
silently drops an `undefined` field, producing fewer than the required 19-field record. This is
unreachable via the real, frozen provider (whose own ladder already guarantees both fields —
NP25/NP26/NP30), but it is the same defense-in-depth this function already applies to every other
write-relevant field (`category`, `direction`, `sourceDomain`, etc.).

**Owner ruling: FIX NOW**, as a narrow amendment — not implicitly covered by A-5's original wording,
which named only `eventType`/`direction`.

**The authorised change**, inside `validateProviderResult` only:

1. `relevanceScope` must be one of `RELEVANCE_SCOPES`.
2. `subType` — `category === 'other_catalyst'` ⇒ a trimmed non-empty string; every other category
   ⇒ exactly `null`.

**Scope, exactly:** `validateProviderResult`, plus the minimum provider export/import
destructuring needed (`RELEVANCE_SCOPES`, already exported from the provider for QA use), plus
targeted NW27-style negative QA for these two invariants. **Not in scope:** `projectItemRecord`,
write ordering, response envelopes, index logic, `acquireNowIso`, or any provider production
semantics — all unchanged. Fail-closed throughout, same as every existing check in this function.

## Owner amendment A-3 — deferred Grok layer, note only

**No Grok code, no Grok fields, no Grok config in S1.5.** The following is recorded as a deferred
downstream design note and has **zero effect on this task's scope, contract, or QA**:

```
Perplexity retrieval / classification
   → Grok independent verification / enrichment
   → validation / Owner rules
   → consumption / persistence
```

The current contract is already shaped for this: every item carries
`provenance: 'retrieval_unverified'`, `confidence: null`, `requiresVerification: true` and
`scoringImpact: 'none'`. A later verification layer sets those; **it needs no field added now**, and
adding one speculatively would be scope expansion. Any Grok field appearing in the diff is **STOP-1**.

## Decisions this brief locks

Each arose from reading the actual implementation. The Owner may overrule any by amending before
approval.

### D-S15-A · The windows are stated as relative wording, not computed dates

`buildRequestBody(ticker)` takes **only the ticker** (`news-catalysts-provider.js:201`). Emitting
absolute dates would require threading the injected `nowIso` into it, expanding the signature and
NP01's fixture.

**Locked:** the prompt says *"the previous 30 calendar days"* and *"the next 60 calendar days"* in
words. No date arithmetic anywhere. The provider stays a pure function of the ticker, and NP23's
`Date.now()` prohibition is respected by construction.

> **Corrects the breakdown**, which said the windows are "measured against the injected clock". They
> are not measured in code at all — they are stated to the model. No post-fetch date filter is added.

### D-S15-B · Field names are camelCase; the enum literal is the Owner's

Every existing item field is camelCase (`eventDate`, `sourceUrl`, `identityHash`, `scoringImpact`).

**Locked:** fields `eventType`, `relevanceScope`, `subType`. Enum values follow the Owner's A-1
wording: **`catalyst` | `upcoming_event`** *(this supersedes the earlier `catalyst | upcoming`)*.

### D-S15-C · `subType` is always present, `null` when not applicable

A sometimes-absent key produces two valid field orders and breaks every `Object.keys(...)`
deep-equal pin — NP16, `RECORD_FIELD_ORDER`, and the byte-exact `JSON.stringify` assertion at
core-suite `:530`.

**Locked:** always present; a non-empty string when `category === 'other_catalyst'`, `null`
otherwise. The conditionality lives in the ladder, where it is testable, not in the field set, where
it is destructive.

### D-S15-D · The exported identifier `CONTRACT_VERSION` is kept; only its **value** changes

**Locked:** `news-catalysts-provider.js:54` becomes `var CONTRACT_VERSION = 'news-contract-v1';`

> **Corrects the breakdown**, which proposed `NEWS_CONTRACT_VERSION`. A rename would break the
> destructuring import at `news-catalysts-core.js:70`, the comparison at `:320`, and three
> core-suite references reading `provider.CONTRACT_VERSION` — for no behavioural gain.

### D-S15-E · New fields are appended to the end of the projection

Existing 14 fields keep their positions; `eventType`, `relevanceScope`, `subType` are appended after
`scoringImpact`. Item projection 14 → **17**; stored record 16 → **19**.

**Projection order and tuple order are deliberately different** — they already are today (the tuple
leads with `schemaVersion` and omits `sourceUrl`/`retrievedAt`). Each is normative for its own
`JSON.stringify`.

## Contract

### Item fields — three added

| Field | Type | Values | Ruling |
|---|---|---|---|
| `eventType` | string, required | `catalyst` \| `upcoming_event` | DR-1, A-1, A-2 |
| `relevanceScope` | string, required | `company` \| `sector` \| `market` | DR-3 |
| `subType` | string \| null, always present | non-empty string **iff** `category === 'other_catalyst'`, else `null` | DR-10, D-S15-C |

`direction` becomes conditionally nullable per A-1.

Two new frozen vocabularies beside `CATEGORIES`: `EVENT_TYPES` and `RELEVANCE_SCOPES`.

### `REQUEST_SCHEMA` — **[CORRECTED, real-time Owner ruling during implementation]**

`subType` is **always present** on the item — never a sometimes-absent key (D-S15-C). The schema
must therefore require it like every other always-present field; making it conditionally required
is not expressible cleanly in JSON Schema without `if/then`, and the field's presence itself is
never conditional — only its *value* is.

- `properties` gains `eventType` (enum), `relevanceScope` (enum), `subType` (schema-level
  `type: ['string', 'null']` — both a string and `null` are syntactically valid at this level)
- `direction` becomes `{ enum: ['positive', 'neutral', 'negative', null] }`
- `required` gains `eventType`, `relevanceScope`, **and `subType`** — all three are always-present
  fields at the schema level
- `additionalProperties: false` stays at both levels

**Semantic conditionality:** `category === 'other_catalyst'` ⇒ `subType` must be a trimmed
non-empty string; every other category ⇒ `subType` must be exactly `null`. The schema only pins
that the *key* is present and its *type* is string-or-null. The provider's own validation ladder is
where this category-dependent rule is enforced during normalization (the primary, production
enforcement point). Under **A-5.1**, the core's `validateProviderResult` independently re-validates
the identical invariant at the persistence boundary, as defense-in-depth against an injected or
drifted provider — not as the primary enforcement point, which remains the ladder.

> **Correction, recorded 2026-09-21.** This section originally said `subType` is *not* in
> `required`. That was wrong: it conflated "value is conditional" with "field may be absent," and
> D-S15-C already says the opposite ("always present ... a sometimes-absent key would break every
> `Object.keys` field-order pin"). The Owner corrected this in real time during implementation,
> before the schema was authored, and the correction is applied as written above.

### Validation ladder — order is load-bearing

```
eventDate → sourceUrl → grounding → category
  → eventType        not in EVENT_TYPES            ⇒ UNKNOWN_EVENT_TYPE        [NEW]
  → direction        catalyst ⇒ must be in DIRECTIONS
                     upcoming_event ⇒ must be null ⇒ INVALID_DIRECTION         [MODIFIED IN PLACE]
  → relevanceScope   not in RELEVANCE_SCOPES       ⇒ INVALID_RELEVANCE_SCOPE   [NEW]
  → subType          conditionality violated       ⇒ INVALID_SUB_TYPE          [NEW]
  → tuple → DUPLICATE_IN_BATCH
```

**`eventType` must precede `direction`** (A-1 consequence 1). `SKIP_REASONS` grows 7 → 10, appended
after `DUPLICATE_IN_BATCH` so every existing index is stable. One reason per skipped item, first
failure wins — the existing rule, unchanged.

### Contract version

`CONTRACT_VERSION` value → `'news-contract-v1'` (D-S15-D). It reaches storage automatically via the
core's projection at `news-catalysts-core.js:119`.

### Prompt — the whole classification surface

The single user message at `news-catalysts-provider.js:211` is rewritten to carry:

- the two windows in words (D-S15-A)
- the DR-4…DR-9 category boundaries, including the exclusions: earnings-date announcements are not
  `earnings_event`; analyst forecasts are never `guidance_update`; reaffirmed guidance is not
  automatically a catalyst; ordinary deal completion is not a new catalyst; non-binding MoUs and
  routine PR are filtered
- DR-1 / A-1: `catalyst` = already happened, with a direction; `upcoming_event` = known future
  event, **direction must be null**
- DR-3: preserve the natural category and express breadth via `relevanceScope` — **never** dump
  sector or market news into `other_catalyst`
- DR-10: `other_catalyst` is a last resort and requires a `subType`
- DR-13: `direction` is for the company, considering both prior company guidance and consensus
- DR-12: materiality is relative to the company. **No numeric threshold is stated, in prompt or
  code** — NP27 enforces this negatively

`qa/news_catalysts_provider_offline.js:215` carries the identical new string.

### Core — one list and four validation checks (A-5, A-5.1)

1. `ITEM_FIELDS` gains the three names in the D-S15-E order.
2. `validateProviderResult` gains the `eventType` vocabulary check and the conditional `direction`
   rule specified in A-5, replacing the unconditional `isNonEmptyString(item.direction)` at `:331`.
3. `validateProviderResult` also gains the `relevanceScope` vocabulary check specified in A-5.1.
4. `validateProviderResult` also gains the category-dependent `subType` rule specified in A-5.1.

`projectItemRecord` (`:113-121`) is unchanged; `:70`, `:119` and `:320` need no edit under D-S15-D.
No other core function is in scope.

## Pre-approval compatibility sweep

| Check | Result |
|---|---|
| **QA suites that read in-scope files as text** | **NP23** static-scans the provider source against 23 forbidden patterns (`:666-693`). Two matter: **`/Date\.now\s*\(/`** and **`/process\.env/`** — neither is approached under D-S15-A. `NC40` scans only the preflight, which is frozen |
| `NP01` exact upstream request | **MOVES.** `qa/news_catalysts_provider_offline.js:215` holds a **verbatim second copy of the prompt string**; both copies change in the same edit or NP01 fails |
| `NP12` invalid direction | **MOVES** — `null` is now valid for `upcoming_event` and invalid for `catalyst` (A-1) |
| `NP15` deterministic identity | **MOVES.** Its `pinnedHash` helper hard-codes the tuple JSON including `"schemaVersion":"j3-identity-v1"`. **This is a change from the pre-amendment brief, caused directly by A-2** |
| `NP16` projection pin | **MOVES.** `:468` asserts `Object.keys(items[0])` deep-equals `ITEM_FIELD_ORDER` — "exact 14-field projection" |
| `NP17` store-key shape | **does not move** — `buildNewsKey` and `NEWS_KEY_RE` unchanged; the assertion is computed, not a pinned hash literal |
| `NP18` J7 freshness | **verify, do not edit.** `validRecord` requires `contractVersion` to be an identity **string**; `evidence-freshness.js:221` pins an exact *value* only for the `facts` family |
| Core suite field pins | **MOVE.** `:79` `ITEM_FIELD_ORDER`, `:84` `RECORD_FIELD_ORDER`; `:528` asserts "exact 16-field record order" |
| Core suite `CONTRACT_VERSION` refs | **do not move** — `:206`, `:211`, `:226` read `provider.CONTRACT_VERSION` dynamically (D-S15-D) |
| `SKIP_REASONS` membership | **not pinned** — only `Object.isFrozen` is asserted (`:727`). Appending is safe |
| `qa/fund_facts_route_offline.js` FR06 | **not triggered** — no function file added or removed |
| `qa/instruction_layer_offline.js` | **not triggered** — `CLAUDE.md` untouched |
| Expected suite-count delta | **0** — 43 before, 43 after |

## QA

### Existing assertions that re-baseline — **four, up from three**

| Pin | File | Why |
|---|---|---|
| **NP01** | provider suite `:160` | new item fields; new `contractVersion` value; new prompt literal |
| **NP12** | provider suite `:403` | direction validity is now conditional on `eventType` (A-1) |
| **NP15** | provider suite `:449` | tuple gains `eventType`; `schemaVersion` → `j3-identity-v2` (A-2) |
| **NP16** | provider suite `:468` | `ITEM_FIELD_ORDER` 14 → 17 |
| `ITEM_FIELD_ORDER` / `RECORD_FIELD_ORDER` | core suite `:79`, `:84` | 14 → 17 and 16 → 19; drives the NW record assertions |

Every one is a pin whose own comment anticipates deliberate re-baselining. None is a behavioural
assertion being weakened.

### New assertions — NP24…NP32, appended contiguously

| ID | Asserts |
|---|---|
| **NP24** | `eventType` present on every surviving item and always in `EVENT_TYPES`; out-of-vocabulary ⇒ `UNKNOWN_EVENT_TYPE`, siblings unaffected |
| **NP25** | same for `relevanceScope` / `RELEVANCE_SCOPES` ⇒ `INVALID_RELEVANCE_SCOPE` |
| **NP26** | `subType` non-empty string iff `other_catalyst`, `null` otherwise; both violations ⇒ `INVALID_SUB_TYPE`; key present on **every** surviving item |
| **NP27** | static scan: **no numeric materiality constant and no percentage literal** in the prompt or ladder (DR-12) |
| **NP28** | three-site vocabulary parity — `CATEGORIES`, the `REQUEST_SCHEMA` category enum, and the category list inside the prompt string hold the **same seven values** (DR-14) |
| **NP29** | the prompt contains **both** window phrases and **no** standalone literal `recent` (Q-S15-4) |
| **NP30** | **`relevanceScope` is identity-inert** — two items differing only in scope produce the **same** `identityHash` and key; the second is `DUPLICATE_IN_BATCH` |
| **NP31** | **`eventType` is identity-bearing (A-2)** — an `upcoming_event` and a `catalyst` identical in every other tuple field produce **different** hashes and **different** keys, and **both survive**; neither is `DUPLICATE_IN_BATCH`. This is the Nov-19 earnings case, pinned |
| **NP32** | **direction conditionality (A-1) on a future-dated fixture** — `upcoming_event` + non-null direction ⇒ `INVALID_DIRECTION`; `catalyst` + null direction ⇒ `INVALID_DIRECTION`; both correct shapes survive with `direction` exactly `null` / a `DIRECTIONS` value. **The `upcoming_event` case uses an `eventDate` after the suite clock `NOW_ISO = '2026-07-24T00:00:00.000Z'`** and asserts it survives, hashes, and yields a `buildNewsKey` output matching `NEWS_KEY_RE` (A-4.1) |

Core-suite additions extend the NW series from `NW27`: stored-record shape carries the three new
fields in order, and the byte-exact `JSON.stringify` record assertion holds at 19 fields.

**`NW27` gains three negatives (A-5)** alongside the existing `'empty direction'` case at `:936`:
`direction: null` on a `catalyst`; `direction: 'positive'` on an `upcoming_event`; a non-string,
non-null `direction`. Each must still fail closed — `502`, zero writes.

**`NW28` — future-dated `upcoming_event` through the full handler (A-4.1 / A-5).** Uses the **same
fixture as NP32**. Drives `core.handler` end to end and asserts: `200 WRITE`, the item **persists**,
the stored record carries `eventDate` in the future, `eventType: 'upcoming_event'` and
`direction: null` intact, its key matches `NEWS_KEY_RE`, and the index record is written last.
**This is handler-level, not a projection unit test** — it is the assertion that would have caught
the STOP before the Worker did.

**`NW29` — mixed batch does not fail the envelope (A-5).** One valid `catalyst` and one valid
future-dated `upcoming_event` in a single provider result: `200 WRITE`, **both** items persist,
`writtenKeys` holds both item keys plus the index key, and the envelope is **not** rejected. This
pins the whole-envelope failure mode the old guard would have produced.

## Validation

1. `npm run qa:offline` → **PASS, 43 effective suites** — identical to the step-0 pre-edit baseline.
   Any delta is a finding, not a warning.
2. `node qa/news_catalysts_provider_offline.js` → PASS, **NP01–NP32 contiguous**.
3. `node qa/news_catalysts_core_offline.js` → PASS.
4. `node qa/fund_facts_route_offline.js` → PASS, **unmodified**.
5. `node qa/instruction_layer_offline.js` → PASS, **unmodified**.
6. Implementation diff is **exactly four files**:
   `git diff --stat 9d71dc1...HEAD -- . ':(exclude)work/' ':(exclude)BACKLOG.md'`
7. Read-back: the prompt literal in the provider and in the suite at `:215` are **character-identical**.
8. Read-back: `buildNewsKey` and `NEWS_KEY_RE` are **untouched** in the diff; the tuple literal shows
   **exactly one added member** and the `schemaVersion` value change, and nothing else.
9. Read-back: **no occurrence of `grok` (case-insensitive) anywhere in the diff** (A-3).
10. Read-back: **NP32 and NW28 share one future-dated fixture** — its `eventDate` is later than the
    suite clock, `eventType` is `upcoming_event`, `direction` is `null`, and the same values survive
    into the stored record (A-4.1). `evidence-freshness.js` is **absent from the diff** (A-4.2).
11. **A-5 read-back:** the core diff touches `ITEM_FIELDS` and `validateProviderResult` **and
    nothing else** — `projectItemRecord`, the write order, the response envelopes, the index logic
    and `acquireNowIso` are unchanged. NW27 still fails closed on `direction: ''`, on `null` for a
    `catalyst`, and on a non-null non-string. NW28 and NW29 both return `200 WRITE` and persist.

## STOP conditions

The five standing conditions, plus these task-specific instances:

1. Any file outside the four in scope appears in the implementation diff.
2. `buildNewsKey` or `NEWS_KEY_RE` requires a change. **The tuple change is authorised by A-2; the
   key format change is not** — the hash is still 64 hex and the key shape is unchanged.
3. `relevanceScope` appears necessary in the tuple to make something work — that contradicts A-2.
3a. **Any core function other than `ITEM_FIELDS` and `validateProviderResult` requires a change**
    (A-5). The scope widening is exactly two surfaces, not the whole module.
3b. Making a valid `upcoming_event` pass would require **weakening** an existing fail-closed check
    rather than making it conditional — e.g. dropping the empty-string rejection, or accepting any
    falsy `direction`. A-5 is a narrowing with one exception, never a relaxation.
4. `evidence-freshness.js` or `evidence-contract.js` requires a change (A-4.2). In particular
   `TIMESTAMP_AHEAD_OF_CLOCK` for upcoming events is **expected behaviour, not a defect to fix**
   (A-4.3), and a future `eventDate` must not be clamped, rewritten, or rejected (A-4.1).
5. The suite count differs from the baseline in either direction.
6. A new field cannot be added without an ambient clock or `process.env` read — NP23 forbids both.
7. Any gate, env var, route or Netlify change appears necessary. **Activation is a separate
   Owner-gated task.**
8. **Any Grok-specific field, module, config or call appears in the diff (A-3).**
9. Any live upstream call. **No Perplexity request is made by this task, at any point.**

## Definition of done

The three fields exist end to end — schema, ladder, projection, stored record — with the enums,
conditionality and append order above. `direction` is `null` for `upcoming_event` and a `DIRECTIONS`
value for `catalyst`. The tuple carries `eventType` and not `relevanceScope`, with
`IDENTITY_SCHEMA_VERSION = 'j3-identity-v2'`. `CONTRACT_VERSION` is `'news-contract-v1'` under its
original export name. The prompt carries both windows and the DR-1…DR-14 boundaries, with no numeric
materiality threshold. `buildNewsKey` and `NEWS_KEY_RE` are provably unchanged. No Grok surface
exists. **The core accepts `direction: null` for `upcoming_event` and only for `upcoming_event`
(A-5), still failing closed on `''`, on `null` for a `catalyst`, and on any non-string non-null
value. A future-dated `upcoming_event` is pinned end to end by NP32 (normalization) and NW28 (full
handler + persistence); NW29 proves a mixed catalyst + upcoming_event batch persists both rather
than failing the envelope. `evidence-freshness.js` is untouched.** `qa:offline`
PASS at 43 suites; NP01–NP32 contiguous and green; `fund_facts_route_offline`
and `instruction_layer_offline` pass unmodified. The implementation diff is exactly four files.
`review.md` carries a `## Lessons` section, the two-row "Files changed" block, and the final-check
line.

A successful `normalizeNewsResponse` item is, in exact order — **catalyst**:

```json
{
  "ticker": "FROG", "eventDate": "2026-07-18", "category": "earnings_event",
  "direction": "positive", "sourceUrl": "...", "normalizedSourceUrl": "...",
  "sourceDomain": "ir.jfrog.com", "provider": "j3-news-catalysts@job-model-v1",
  "retrievedAt": "...", "identityHash": "<64 lowercase hex>",
  "provenance": "retrieval_unverified", "confidence": null,
  "requiresVerification": true, "scoringImpact": "none",
  "eventType": "catalyst", "relevanceScope": "company", "subType": null
}
```

— and **upcoming_event**, identical in shape with exactly two values differing:

```json
{ "...": "...", "direction": null, "...": "...", "eventType": "upcoming_event" }
```

Any deviation from this shape is a test failure, not a warning.
