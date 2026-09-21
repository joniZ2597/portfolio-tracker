# Task brief: news-catalysts Perplexity Agent API migration — S1.5.2

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Only then may implementation begin, per `AGENTS.md`
"Task folder convention".

Source of truth: `.ai-reports/status/s152-agent-api-migration.PREP.local.md` (reconciled COWORK +
Fable review). Owner rulings **D-M1 … D-M8** and **Q-MIG-1 / Q-MIG-2** are applied below.

**Revision 2, 2026-09-21 — reconciled with the Fable system-design audit.** One change only: the
adapter's grounding entry becomes an **internal Evidence Set** carrying nine provider-internal
fields instead of the previous four (§6). **No new task, no architectural redesign, no scope
growth** — still two implementation files, still a transport migration, still nothing persisted.

**Revision 3, 2026-09-21 — narrow discovered-dependency amendment.** The Worker fired **STOP-1**
during implementation, correctly. `qa/news_catalysts_core_offline.js` `require`s the **real**
provider (`:60`) and builds **Sonar-shaped** fixtures through a helper literally named
`sonarResponse` (`:190`, emitting `{choices:[{message:{content}}]}`), then feeds them to
`provider.normalizeNewsResponse` (`:217`). It is a provider-integration suite wearing a core-suite
name. Migrating the transport necessarily breaks its fixtures — 14 of 30 — while the **production
core needs no change at all**. Scope becomes **three files**, the third strictly limited to
transport-fixture adaptation (§8a). Nothing else reopens.

> **This was a gap in the pre-approval sweep, and it is mine.** The sweep asked which suites *read
> in-scope files as text* (NP23 / NC40 static scans). It never asked which suites ***`require` and
> call*** the module under test. Those are different questions, and only the second one catches
> this. Recorded for the brief convention in `AGENTS.md` — not fixed here, since `AGENTS.md` is out
> of scope.

**This is a port, not an improvement.** Retrieval quality is not an acceptance criterion. Every
hardening question — coverage tuning, grounding sufficiency, date/materiality judgment, dedup and
identity — stays in S1.5.1 and is **STOP-1** here.

## Baseline

| | |
|---|---|
| `branch-dev` = `origin/branch-dev` | **`463e1c8`** — "S1.5 taxonomy revision" |
| `origin/main` | `fbec2c1` |
| `npm run qa:offline` | expected **PASS, 43 effective suites** — confirmed by the Worker's step-0 pre-edit baseline, not asserted here |
| Provider export surface | **16 exports**, no exact-set pin in QA (`:791` only asserts `module.exports` is present) |
| Endpoint execution mode | **verified A — standard synchronous Netlify Function** (no `-background` name, no `config` export, no Async Workloads, `netlify.toml` has no `[functions]` block) |
| Why now | Sonar Chat Completions retires **2026-09-27** |

## Objective

Move the landed S1.5 provider from Sonar Chat Completions to the Perplexity Agent API, preserving
the Portfolio Tracker contract and behaviour exactly, with the transport as the only moving part.

## Implementation scope — exactly three files

```
netlify/functions/lib/news-catalysts-provider.js   modify
qa/news_catalysts_provider_offline.js              modify
qa/news_catalysts_core_offline.js                  modify — TRANSPORT FIXTURES ONLY (§8a)
```

**Everything else is STOP-1.** Named explicitly: **`news-catalysts-core.js` (the production core —
not one byte)** · `news-catalysts-preflight.js` (**frozen**) ·
`evidence-contract.js` · `evidence-freshness.js` · `news-catalysts.mjs` · `index.html` ·
`services/**` · `qa/run-offline.js` · `netlify.toml` · `package.json` · `CLAUDE.md` · `AGENTS.md` ·
`BACKLOG.md`.

**No ASK-tier file is in scope** — no brief-listing entry required, no MANUAL prompt expected.
Posture **ACCEPT EDITS** across the three files.

**No env, Netlify, gate or credential change.** Same bearer token, same `PERPLEXITY_API_KEY`. The
three gate env names stay unset. **No activation.**

---

## 1 · The in-module adapter seam

The migration is contained by a **single non-exported adapter** that owns all transport-shape
knowledge. Everything downstream of it keeps its current logic.

```
pplxPostText  →  adaptAgentResponse(parsedResponse)  →  { content, evidenceSet }
                          ↓                                      ↓
              transport shape lives HERE only        existing ladder, unchanged
```

`evidenceSet` is the ordered grounding list, each entry carrying the internal evidence metadata
defined in §6. Below the seam it is consumed exactly as today's grounding list is.

**Rules for the seam:**

- **Non-exported.** The export surface stays at **16** — no addition, no removal, no rename.
  It is tested through `normalizeNewsResponse`, which is already exported.
- It is the **only** place that knows about `output[]`, `status`, `error`, item `type` strings,
  `fetch_url_results`, or `url_citation` annotations. No other function learns the Agent shape.
- Below the seam, the **Tier-B/Tier-C ladder, grounding correlation, identity construction and
  projection are unchanged** — they receive the same two things they receive today: the generated
  content string and an ordered grounding list.
- The seam must not import anything new. NP23's require-allowlist is unchanged.

Rationale: a future provider change is then one function, and this task's diff stays legible.

---

## 2 · Request-shape migration

```
POST https://api.perplexity.ai/v1/agent
Authorization: Bearer <key>                       unchanged

{
  preset: PPLX_MODEL,                             value 'low'   (name kept — D-M8)
  instructions: '<system text + UTC date anchor>',               (D-M4)
  input: [ { type: 'message', role: 'user', content: '<the S1.5 prompt>' } ],
  tools: [ { type: 'web_search' } ],                             (explicit — Owner-required)
  response_format: {
    type: 'json_schema',
    json_schema: { name: 'newsCatalysts', schema: REQUEST_SCHEMA }
  }
}
```

| Item | Ruling |
|---|---|
| `PPLX_ENDPOINT` | `'https://api.perplexity.ai/v1/agent'` |
| `PPLX_MODEL` | **name kept** (D-M8); value becomes `'low'`; add a comment that it now carries an Agent preset. Verified: 3 consumers, all in-module, none in QA |
| `json_schema.name` | **exactly `'newsCatalysts'`** — Owner-ruled 2026-09-21, **not Worker discretion**. The Agent API requires the field (1–64 alphanumeric). The existing comment *"json_schema carries only the `schema` member (spec-pinned: no name field)"* becomes false and must be replaced. **NP01 pins this literal** |
| `json_schema.strict` | **OMIT the field entirely** (Q-MIG-2). Sonar omits it today; omission preserves current client-side behaviour whatever the server default is. **Sending `strict: false` is STOP-1** |
| `REQUEST_SCHEMA` | **unchanged, byte for byte** |
| `tools` | exactly `[{ type: 'web_search' }]` — **no `filters`, no `search_context_size`, no `max_results`** |
| `reasoning`, `max_output_tokens`, `search_mode` | **not sent** |

**Any search tuning is STOP-1.** It is S1.5.1, and adding it here destroys pilot comparability.

---

## 3 · The `nowIso` date anchor — signature change (D-M4)

`buildRequestBody(ticker)` becomes **`buildRequestBody(ticker, nowIso)`**.

The instructions gain the current UTC fetch date so the existing "previous 30 calendar days" and
"next 60 calendar days" wording has a fixed anchor.

- **Derive with a pure string operation: `nowIso.slice(0, 10)`.** No `new Date()`, no `Date.now()`,
  no arithmetic. NP23 forbids `Date.now()`; a string slice keeps the module free of any clock
  construction.
- **No post-fetch date filtering.** The windows remain words to the model, exactly as D-S15-A ruled.
- `nowIso` is already an injected input, so **determinism is preserved** — identical inputs still
  produce byte-identical output.

> **This moves a decision locked in S1.5.** D-S15-A stated the provider "stays a pure function of
> the ticker". It is now a pure function of `(ticker, nowIso)`. Recorded here so it is a visible
> amendment, not a silent drift.

**The prompt's taxonomy and semantic content does not change.** The date anchor is the **only**
permitted prompt edit. Any category, boundary, direction, materiality or dedup wording change is
STOP-1.

> **Both copies change.** The suite holds a verbatim copy of the prompt string. The provider's text
> and the suite's copy must remain character-identical after the edit. *(An earlier PREP statement
> that "the prompt text is untouched" was withdrawn — it predated D-M4.)*

---

## 4 · `output[]` parsing rules

```json
{ "status": "completed", "error": null,
  "output": [
    { "type": "search_results", "results": [ … ], "queries": [ … ] },
    { "type": "message", "role": "assistant",
      "content": [ { "type": "output_text", "text": "<the JSON>", "annotations": [ … ] } ] }
  ],
  "usage": { … } }
```

1. **Find items by `type`, never by index.** `output[]` is an execution trace; order and membership
   are not guaranteed.
2. **Generated content** = the item with `type:'message'` → `content[]` → the first entry with
   `type:'output_text'` → `.text`. This replaces `choices[0].message.content`.
3. **`status` must fail closed.** Anything other than `status === 'completed'` is a whole-response
   failure ⇒ `PROVIDER_INVALID_RESPONSE`. New condition, no Sonar equivalent.
4. **Unrecognised item types are ignored, not failures.** The agent may take steps this module does
   not model; that is not a defect.
5. **Tier-B conditions are re-expressed, not re-numbered.** Conditions 1–3 move from
   `choices[0].message` to the message item; condition 6 becomes "a grounding-bearing output item is
   present but its results/annotations field is neither null nor an array"; conditions 4, 5 and 7
   concern the parsed JSON payload and are **untouched**.
6. **Telemetry is recorded by the pilot, never persisted.** `usage.*` and `output[].queries[]` do
   not reach the envelope, the record, or the tuple.

**No top-level `citations` or `search_results` exists on the Agent API** (Q-MIG-1, Owner-resolved
from official migration guidance). `buildGroundingList` loses its `citations` parameter.

---

## 5 · Evidence Set construction — grounding union rules (D-M2)

Candidates are collected in **exactly this deterministic order**:

```
1  every output[] item of type 'search_results'      → its results[]   (array order)
2  every output[] item of type 'fetch_url_results'                     (array order)
3  url_citation annotations on the output_text content item            (array order)
```

- Outer traversal follows `output[]` order; inner traversal follows each array's own order.
- **First occurrence wins** — the existing rule, preserved. NP08 depends on it.
- Each candidate is recorded with its **`evidenceKind`** — the source it came from, from the frozen
  vocabulary `search_result | fetch_url_result | url_citation`. This is bookkeeping only (§6).
- **All three sources are provider-internal.** Nothing about them reaches the envelope, the stored
  record, or the identity tuple.
- Correlation is unchanged: `normalizeHttpsUrl` equality, and the persisted `sourceUrl` is the
  grounding entry's **own raw text**, never the model's candidate string.
- **Zero grounding candidates** ⇒ every item skips `INVALID_SOURCE_URL` ⇒ zero-item envelope ⇒ the
  core returns `NONE`. **Fail-closed and correct — not a Tier-B failure.**

---

## 6 · The internal Evidence Set — retained but inert (D-M3, Fable audit)

Each Evidence Set entry carries **nine provider-internal fields**:

| Field | Source | Notes |
|---|---|---|
| result `id` | `search_results[].id` | **often absent** — `fetch_url_results` and `url_citation` entries have no `id`, and the `[web:n]` id space does not extend to them. Absence is normal |
| source URL (raw) | the entry's own raw text | **existing key — do not rename** |
| normalized URL | `normalizeHttpsUrl` | **existing key — do not rename** |
| domain | hostname of the normalized URL | **existing key — do not rename** |
| title | `title` | absent where the source omits it |
| source date | `date` | absent where the source omits it |
| last updated | `last_updated` | absent where the source omits it |
| snippet | `snippet` | absent where the source omits it |
| **`evidenceKind`** | which of the three D-M2 sources produced it | frozen vocabulary |

> **Preserve the three existing key names.** The raw, normalized and domain values are exactly the
> three that feed `sourceUrl`, `normalizedSourceUrl` and `sourceDomain` — and the latter two are
> **identity-tuple members**. Adding fields alongside them is safe; renaming them puts the identity
> path in the diff for a cosmetic gain. Six fields are added; none is renamed or removed.

### The boundary — explicit, and the one most likely to be crossed

| **Allowed** | **STOP-1** |
|---|---|
| Retain all nine fields on the in-memory entry | Using **any** of them in a grounding-sufficiency rule |
| Tolerate absence of `id`, `title`, `date`, `lastUpdated`, `snippet` | Any `eventDate`-vs-source-`date` comparison or validation |
| Record `evidenceKind` as bookkeeping | Ranking, preferring or downgrading a candidate by `evidenceKind`, domain or page shape |
| Leave every field unread by **every** decision | Any materiality, dedup or hub-page logic |
| Persist nothing | Any new persisted field, new skip reason, or `ITEM_FIELD_ORDER` change |

**Retention is not permission to use.** A Worker holding newly-available date, title and snippet
metadata will be tempted to act on it. **Every such use is S1.5.1 hardening** (DR-18…DR-27,
unruled). In this task the Evidence Set is built, carried, and read by nothing.

**Unchanged and not up for discussion here:** the 17-field item contract · the 19-field stored
record · core · persistence · the identity tuple · `j3-identity-v2` · `buildNewsKey` ·
`NEWS_KEY_RE` · `CONTRACT_VERSION` · `PROVIDER_ID` · `SOURCE_TIER` · taxonomy · `eventType` ·
`relevanceScope` · `subType` semantics.

**Deferred by name:** persisting `sourceTitle` / `sourceDate` is **post-Pilot-2 hardening**, not
this task and not S1.5.1's opening move. **NP39 pins the boundary from both sides.**

## 6a · Explicitly NOT in this task

Not deferred vaguely — named, so their absence is checkable: dedup behaviour · grounding-sufficiency
rules · date-vs-source validation · hub-page rejection or downgrade · analyst or materiality tuning ·
`subType` length changes · any verification layer · teardown · `finance_search` · Background or
Async Workloads conversion.

**Each is STOP-1 if it appears in the diff.**

---

## 7 · Timeout and pilot handling (D-M6, D-M7)

**`DEFAULT_TIMEOUT_MS` stays `22000`. Changing it is STOP-1.** It is a house convention shared with
`fund-facts-provider.js:52`, and the schema-preparation delay it would be tuned against is
**one-time per schema**.

For the **first** live Agent pilot call only, pass `timeoutMs: 35000` through the **existing**
injected seam (`posInt(opts.timeoutMs, DEFAULT_TIMEOUT_MS)`). Nothing needs building.

If that first request times out during documented JSON-schema preparation (10–30 s), **retry once
and record both attempts. A one-time warm-up timeout is not, by itself, migration failure.**

**No Netlify execution-mode change.** The verification is **complete**: the endpoint is a
**standard synchronous Netlify Function (mode A)** — no `-background` filename, no `config` export
anywhere under `netlify/`, no Async Workloads, `netlify.toml` contains only `[build] publish = "."`,
and the entry is `export default withLambda(core.handler)` returning its own `{statusCode, body}`.
Recorded limits: synchronous **60 s**; Background up to 15 min but returns **202 immediately**.
*Qualifier: this is mode A by source evidence — the route is dormant and has never executed live.*
**Changing the execution mode is STOP-1.**

**Pilot — paired, time-boxed.** If Sonar is still available, run **paired same-day Sonar and Agent
calls** for **NVDA / FROG / MRNA**; this removes the confound between "the port changed behaviour"
and "the news changed". Sonar retires 2026-09-27, so the window is days. **If Sonar is already
unavailable, run the Agent calls alone against the unpaired fidelity gates — do not stall.**

Record per call: `status` · `usage.total_tokens` · `usage.cost.total_cost` · count from each of the
three grounding sources · total unique grounding URLs · `output[].queries[]` · wall-clock latency ·
whether the first call hit the warm-up timeout.

**Acceptance is fidelity, not quality.** Every item validates against the unchanged S1.5 contract;
`INVALID_SOURCE_URL` skip rate not materially worse than the paired Sonar call; item volume in the
same ballpark. **Improvement in PASS/REVIEW/FAIL is not an acceptance criterion** — the four pilot-1
product problems are expected to persist. Quality gains are S1.5.1 evidence; record, do not bank.

**No live call before the Owner approves the pilot.**

---

## 8 · QA

### Re-baseline — intent unchanged, fixture shape changes

`NP01` (endpoint, `preset`, `instructions` **including the date anchor**, `input`, `tools`,
`json_schema.name`, **and both prompt copies**) · `NP02` · `NP03` (the seven Tier-B conditions
re-expressed per §4.5) · `NP04`–`NP13` · `NP07`–`NP09` (grounding fixtures, now three-source) ·
`NP20` · `NP22`.

**`NP21` re-baseline carries one added assertion.** It already pins purity and determinism
("identical input ⇒ byte-identical output"). It gains: **a different `nowIso` changes only the date
token in the instructions** — proving the anchor is derived from the injected clock and not
hard-coded. *(Placed here rather than as a new NP40, to keep the new-test set exactly NP33–NP39 as
ruled; the coverage is required either way and this is its natural home.)*

### New — NP33 … NP39

| ID | Asserts |
|---|---|
| **NP33** | `status !== 'completed'` ⇒ `PROVIDER_INVALID_RESPONSE`, zero items, zero partial output |
| **NP34** | Grounding union across **all three D-M2 sources in the ruled order**, first-occurrence-wins preserved; each source alone also works |
| **NP35** | A reordered `output[]` produces **byte-identical** output — proves lookup by `type`, never by index |
| **NP36** | An `output[]` item of an unrecognised `type` is **ignored, not a failure** |
| **NP37** | **Zero** grounding candidates ⇒ all items skipped `INVALID_SOURCE_URL`, zero-item envelope, **not** Tier B |
| **NP38** | `PPLX_ENDPOINT` equals the **literal** `'https://api.perplexity.ai/v1/agent'`. *(Closes a real gap: suite `:223` asserts `call.url === provider.PPLX_ENDPOINT`, which is tautological and stays green for any endpoint value.)* |
| **NP39** | The Evidence Set carries all nine fields when supplied, **tolerates absence** of `id`/`title`/`date`/`lastUpdated`/`snippet`, records a valid `evidenceKind`, **and no item field or stored record gains any of them** — pins §6 from both sides. Includes a `url_citation`-only fixture, the case with the least metadata |

### Must NOT move — the mechanical proof this is a port

```
NP14  URL normalization          NP15  deterministic identity + pinned tuple hash
NP16  17-field projection        NP17  store-key shape
NP18  J7 freshness integration   NP19  shared-validator reuse
NP23  forbidden-surface scan     NP24–NP32  every taxonomy assertion
NW01–NW30  every core behavioural assertion and expected outcome
```

**If any test in this list moves, the port changed behaviour — STOP-1.**

### Clarification to "the entire core suite must not move" (Revision 3)

Revision 2 said the entire core suite must not move. That was too broad, and the Worker was right to
stop rather than reinterpret it. The rule is now split along the line that actually matters:

| **Must not move — STOP-1** | **May move — and only because the wire format intentionally changed** |
|---|---|
| Every NW01–NW30 behavioural assertion | The local transport fixture helper(s), e.g. `sonarResponse` (`:190`) |
| Every expected outcome, status code and reason | The minimum fixture plumbing needed for those same assertions to keep running |
| Identity, persistence, write-ordering and contract expectations | — |
| The number of tests — **30**, none removed, skipped or weakened | — |

**The test cases stay behaviourally pinned. Only the shape of the bytes handed to them changes.**

**Suite count: 43, unchanged.** No new file, no `package.json` change.

---

## 8a · Third-file permission — strictly bounded

`qa/news_catalysts_core_offline.js` is in scope for **transport-fixture adaptation only.**

**Allowed:**

- Update the local Sonar response / fixture-building helper(s) so they construct **Agent-shaped**
  provider responses.
- Make **only the minimum** fixture plumbing changes required for the existing core assertions to
  continue exercising the same behaviour.

**Not allowed — each is STOP-1:**

- Changing `news-catalysts-core.js`.
- Changing any core assertion semantics.
- Changing expected identity behaviour.
- Changing persistence behaviour.
- Changing write ordering.
- Changing contract fields.
- Weakening, removing or skipping any test.
- **Changing production behaviour to preserve compatibility with Sonar fixtures** — the fixtures
  follow the transport, never the reverse.

### Regression requirement (Revision 3)

After fixture migration, all four must hold:

| | |
|---|---|
| Core QA | **30/30 PASS** |
| Provider QA | **39/39 PASS** |
| `npm run qa:offline` | **PASS, 43 effective suites** |
| Production core files changed | **zero** — `news-catalysts-core.js` absent from the diff |

---

## 9 · Unchanged — the fidelity guarantee

Identity tuple · `IDENTITY_SCHEMA_VERSION = 'j3-identity-v2'` · `buildNewsKey` · `NEWS_KEY_RE` ·
all 17 item fields and order · 19-field stored record · `CONTRACT_VERSION = 'news-contract-v1'` ·
**`SOURCE_TIER = 'perplexity_retrieval'`** · **`PROVIDER_ID = 'j3-news-catalysts@job-model-v1'`**
(both D-M1) · the full validation ladder and all 10 `SKIP_REASONS` · grounding correlation
semantics · `normalizeHttpsUrl` · the prompt's taxonomy and semantics · Tier A/B/C error model and
every reason code · the injection contract (`fetchImpl`, `apiKey`, `nowIso`; no ambient clock; no
`process.env`) · the 16-export surface · `news-catalysts-core.js` · storage · gates · env names ·
route · **execution mode**.

---

## 10 · Validation

1. `npm run qa:offline` → **PASS, 43 effective suites**, identical to the step-0 baseline. Any delta
   is a finding, not a warning.
2. `node qa/news_catalysts_provider_offline.js` → PASS, **NP01–NP39 contiguous**.
3. `node qa/news_catalysts_core_offline.js` → **PASS, 30/30** — same 30 tests, none removed or
   skipped; fixtures Agent-shaped, assertions untouched.
3a. `node qa/news_catalysts_provider_offline.js` → **PASS, 39/39**.
4. `node qa/fund_facts_route_offline.js` → PASS, **unmodified**.
5. `node qa/instruction_layer_offline.js` → PASS, **unmodified**.
6. Implementation diff is **exactly three files**, and `news-catalysts-core.js` is **not** among
   them:
   `git diff --stat 463e1c8...HEAD -- . ':(exclude)work/' ':(exclude)BACKLOG.md'`
7. Read-back: the prompt string in the provider and its copy in the suite are **character-identical**,
   and differ from `463e1c8` **only** by the date anchor.
8. Read-back: `module.exports` still has **16 entries**, same names, same order.
9. Read-back: no `Date.now()` and no `new Date(` introduced; the anchor is a `nowIso` string slice.
10. Read-back: `DEFAULT_TIMEOUT_MS` is still `22000`; `strict` appears **nowhere** in the request;
    `json_schema.name` is the exact literal `'newsCatalysts'`.
11. Read-back: `buildNewsKey`, `NEWS_KEY_RE`, the identity tuple, `SOURCE_TIER` and `PROVIDER_ID`
    are **absent from the diff**.

---

## 11 · STOP conditions

The five standing conditions, plus:

1. Any file beyond the three in scope — and **`news-catalysts-core.js` is not one of them**.
1a. Any core-suite change beyond transport fixtures (§8a).
1b. Any production change made to keep Sonar-shaped fixtures working.
2. Any change to the identity tuple, `IDENTITY_SCHEMA_VERSION`, `buildNewsKey`, `NEWS_KEY_RE`,
   `CONTRACT_VERSION`, `SOURCE_TIER` or `PROVIDER_ID`.
3. Any prompt change beyond the D-M4 date anchor.
4. **Any use of Evidence Set metadata in a decision** (§6) — including ranking or preferring a
   candidate by `evidenceKind`, domain or page shape.
5. Any grounding-sufficiency, hub-page, dedup, coverage-tuning or materiality logic; any
   date-vs-source validation; any `subType` length change; any verification layer; any teardown;
   any `finance_search` (§6a).
5a. Renaming or removing the raw / normalized / domain keys on an Evidence Set entry.
6. Any change to `DEFAULT_TIMEOUT_MS`.
7. Any search tuning — `filters`, `search_context_size`, `max_results`, `search_mode`,
   `reasoning.effort`.
8. Sending `strict` in any form; any `json_schema.name` value other than the exact literal
   `'newsCatalysts'`.
9. Any change to the endpoint's execution mode; any Background or Async Workloads conversion.
10. Any export added, removed or renamed.
11. Any must-not-move test moving.
12. Any gate, env, credential, Netlify or deploy change.
13. **Any live API call before the Owner approves the pilot.**

---

## 12 · Definition of done

The provider calls `POST /v1/agent` with `preset`, `instructions` carrying the `nowIso`-derived UTC
date anchor, `input`, an explicit `web_search` tool, and a `json_schema` named exactly
`'newsCatalysts'` with **no `strict` field**. A non-exported adapter is the sole owner of Agent response shape; the export surface stays
at 16. `output[]` is read by `type`, `status` fails closed, unknown item types are ignored, and
grounding unions the three D-M2 sources in the ruled order with first-occurrence-wins. The internal
Evidence Set carries all nine fields with `evidenceKind` recorded, tolerates missing metadata, and
**no decision reads any of it**; the raw / normalized / domain keys are unrenamed. The core suite's
transport fixtures are Agent-shaped with **all 30 behavioural assertions untouched**, core QA is
30/30 and provider QA 39/39, and **`news-catalysts-core.js` is unchanged**. Identity, the 17-field item
contract, the 19-field record, `SOURCE_TIER`, `PROVIDER_ID` and `DEFAULT_TIMEOUT_MS` are provably
unchanged. `qa:offline` PASS at 43; NP01–NP39 contiguous and green; every must-not-move test green;
core, route and instruction-layer suites pass **unmodified**. The implementation diff is exactly two
files. `review.md` carries a `## Lessons` section, the two-row "Files changed" block, and the
final-check line.

A successful item is **byte-identical in shape to S1.5** — 17 fields, same order, same enums, same
`direction` rule:

```json
{ "ticker": "FROG", "eventDate": "2026-07-18", "category": "earnings_event",
  "direction": "positive", "sourceUrl": "...", "normalizedSourceUrl": "...",
  "sourceDomain": "ir.jfrog.com", "provider": "j3-news-catalysts@job-model-v1",
  "retrievedAt": "...", "identityHash": "<64 lowercase hex>",
  "provenance": "retrieval_unverified", "confidence": null,
  "requiresVerification": true, "scoringImpact": "none",
  "eventType": "catalyst", "relevanceScope": "company", "subType": null }
```

**Any deviation from this shape is a test failure, not a warning** — and in this task it is also
evidence the port was not faithful.
