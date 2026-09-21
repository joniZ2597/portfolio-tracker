# Task brief: news-catalysts Agent API `fetch_url_results` correction — S1.5.2 F-1

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Only then may implementation begin, per `AGENTS.md`
"Task folder convention".

Source of truth: S1.5.2 Pilot 2 (read-only live pilot, 2026-09-21) finding **F-1**, Owner-ruled
PATCH-READY and accepted 2026-09-21. This is a **narrow corrective patch** to the landed migration
(`2e3ca40`), not a redesign of it and not S1.5.1 hardening.

## Baseline

| | |
|---|---|
| `branch-dev` = `origin/branch-dev` | **`2e3ca40`** — "migrate provider transport to Perplexity Agent API" |
| `origin/main` | `fbec2c1` |
| Task branch / worktree | `task/news-catalysts-agent-api-f1` · `pt-wt-news-catalysts-agent-api-f1` |
| `npm run qa:offline` | expected **PASS, 43 effective suites** — confirmed by the Worker's step-0 pre-edit baseline |
| Provider QA / core QA | **39/39** · **30/30** at base |
| Provider export surface | **16 exports** |

## The defect (F-1) — verified live and against the official reference

The Agent API emits `output[]` items of `type: "fetch_url_results"` with the payload

```
{ "type": "fetch_url_results", "contents": [ { "url", "title", "snippet" } ] }
```

Pilot 2 observed exactly this shape on every completed call (NVDA ×2 items, FROG ×1, MRNA ×1), and
the official API reference documents `contents[]` with entries carrying `url`, `title`, `snippet`.
No `results[]` field exists on this item type.

`adaptAgentResponse` currently reads `item.results` for `fetch_url_results` — in the D-M2 source-2
traversal **and** in the condition-6 pre-check. Against the live shape that field is always
`undefined`, so source 2 of the ruled three-source grounding union never contributes an Evidence
Set entry and the condition-6 check on it passes vacuously. The failure is closed (a candidate
grounded only through a fetched page skips `INVALID_SOURCE_URL`); no data leaks and no item was
lost in Pilot 2, because every fetched URL also appeared in `search_results`. The migration's own
Definition of Done ("grounding unions the three D-M2 sources") is nonetheless not met live.

The migration brief (§5) named no field for source 2; `results` was an implementation assumption
carried into the NP08 / NP34 fixtures. Both the code and the fixtures are corrected here.

## Objective

Make the ruled D-M2 source 2 effective against the real Agent contract, changing nothing else.

## Implementation scope — exactly two files

```
netlify/functions/lib/news-catalysts-provider.js   modify — adaptAgentResponse only
qa/news_catalysts_provider_offline.js              modify — NP03 / NP08 / NP34 / NP39 fixtures + assertions
```

**Everything else is STOP-1.** Named explicitly: `news-catalysts-core.js` (not one byte) ·
`qa/news_catalysts_core_offline.js` (zero references to this shape — verified; if any core test
unexpectedly proves transport-dependent, **STOP**, do not adapt it) · `news-catalysts-preflight.js` ·
`evidence-contract.js` · `evidence-freshness.js` · `news-catalysts.mjs` · `qa/run-offline.js` ·
`netlify.toml` · `package.json` · `index.html` · `services/**` · `CLAUDE.md` · `AGENTS.md` ·
`BACKLOG.md`.

**No ASK-tier file is in scope.** Posture **ACCEPT EDITS** across the two files. No env, Netlify,
gate, credential or deploy change. No live Perplexity call in this task.

---

## 1 · Required correction — `adaptAgentResponse`

1. For an `output[]` item with `type === 'fetch_url_results'`, read **`item.contents`**. Do **not**
   read `item.results` on that type — not as a fallback, not as an alternative.
2. The condition-6 pre-check (grounding-bearing field present but neither null nor an array) tests
   **`outItem.contents`** for `fetch_url_results` and continues to test `outItem.results` for
   `search_results`. A malformed `contents` value is a whole-response failure
   (`PROVIDER_INVALID_RESPONSE`), exactly as a malformed `search_results.results` is today.
3. The D-M2 source-2 traversal iterates `item.contents` in array order and appends each entry via
   the existing `appendEvidenceEntry(evidenceSet, entry, 'fetch_url_result')`.
4. **D-M2 order is preserved exactly:** 1 `search_results` → 2 `fetch_url_results` → 3 `url_citation`.
   **First-occurrence-wins is preserved** (NP08 depends on it).
5. Retained metadata for a `fetch_url_result` entry: `url` (raw / normalized / domain, the three
   existing keys), `title`, `snippet`, `evidenceKind = 'fetch_url_result'`. `id`, `date` and
   `lastUpdated` are **absent on this source and must not be fabricated** — `appendEvidenceEntry`
   already omits a field whose source value is `undefined`; it is **not modified**.
6. The traversal-order comment that reads "`fetch_url_results` → its `results[]`" is corrected to
   `contents[]`. The single-adapter invariant holds: `adaptAgentResponse` remains the only function
   that knows the `contents` field name, exactly as it is the only one that knows `results`,
   `annotations`, and the three item-type literals.

**Nothing below the adapter changes.** Ladder, grounding correlation (`resolveGrounded`,
`normalizeHttpsUrl`), identity construction, projection, `appendEvidenceEntry`, `findFirst`,
`validGroundingField` — all byte-for-byte unchanged.

---

## 2 · QA — `qa/news_catalysts_provider_offline.js`

**Test count stays 39. No test is added, removed, renamed, skipped or weakened.** Only the four
tests below change, and only as stated.

| ID | Change |
|---|---|
| **NP03** | Condition 6 gains one case: a `fetch_url_results` item whose `contents` is a non-array, non-null value ⇒ Tier B (`PROVIDER_INVALID_RESPONSE`), mirroring the existing `search_results.results` number case. |
| **NP08** | Both hand-built fixtures switch the `fetch_url_results` item from `results` to `contents`. Precedence assertions unchanged. |
| **NP34** | Fixtures switch to `contents`. **Positive:** a URL available **only** through `fetch_url_results.contents[]` grounds its item (the existing fetch_url_results-alone case, now on the correct field). **Planted negative:** the same URL placed **only** in a `fetch_url_results.results[]` field does **not** ground — the item skips `INVALID_SOURCE_URL` — proving the adapter no longer reads the wrong field on that type. Three-source union and url_citation-alone cases unchanged in intent. |
| **NP39** | Gains a `fetch_url_result` fixture carrying `url`, `title`, `snippet` and **no** `id` / `date` / `last_updated`: the item resolves; the sentinel title and snippet values appear nowhere in the public output; the item has exactly the 17 fields in `ITEM_FIELD_ORDER`. The existing source-scoped structural proof of `appendEvidenceEntry` and the `search_results` full-metadata / `url_citation` least-metadata cases are unchanged. |

The `agentResponse` / `agentShell` fixture helpers are **not** changed — they construct only
`search_results` and `url_citation` shapes.

### Must NOT move

```
NP01  request body            NP14  URL normalization       NP15  identity + pinned hash
NP16  17-field projection     NP17  store-key shape          NP18  J7 freshness
NP19  shared validators       NP21  purity / determinism     NP23  forbidden-surface scan
NP24–NP32  taxonomy           NP33  status fail-closed       NP35  lookup by type
NP36  unknown type ignored    NP37  zero grounding ⇒ NONE    NP38  endpoint literal
NW01–NW30  every core behavioural assertion and expected outcome
```

**If any test in this list moves, the patch changed behaviour — STOP-1.**

### Regression requirement

| | |
|---|---|
| Provider QA | **39/39 PASS** (NP01–NP39 contiguous) |
| Core QA | **30/30 PASS**, file **unmodified** |
| `npm run qa:offline` | **PASS, 43 effective suites**, identical to the step-0 baseline |
| Production core files changed | **zero** — `news-catalysts-core.js` absent from the diff |

---

## 3 · Frozen — not up for discussion in this task

`DEFAULT_TIMEOUT_MS = 22000` (Pilot 2 finding **F-2** is a separate Owner ruling, **not this task**) ·
prompt text · `PPLX_MODEL` preset value `'low'` · `PPLX_ENDPOINT` · `REQUEST_SCHEMA` · `json_schema.name`
`'newsCatalysts'` · no `strict` · taxonomy (`CATEGORIES`, `EVENT_TYPES`, `RELEVANCE_SCOPES`, `subType`
semantics) · identity tuple · `IDENTITY_SCHEMA_VERSION = 'j3-identity-v2'` · `buildNewsKey` ·
`NEWS_KEY_RE` · `CONTRACT_VERSION` · `SOURCE_TIER` · `PROVIDER_ID` · the 17-field item contract and
order · the 19-field stored record · `news-catalysts-core.js` · persistence · gates · env names ·
Netlify · route · execution mode · **export surface = 16**.

**Explicitly not in this task (S1.5.1 or separate rulings):** timeout remediation · grounding-
sufficiency rules · hub-page handling · date-vs-source validation · dedup · materiality · search
tuning · retention of any additional Evidence Set field (e.g. `source`) · any use of Evidence Set
metadata in a decision.

---

## 4 · STOP conditions

The five standing conditions, plus:

1. Any file beyond the two in scope.
2. Any change to `qa/news_catalysts_core_offline.js` or `news-catalysts-core.js`, for any reason.
3. Any change outside `adaptAgentResponse` in the provider (incl. `appendEvidenceEntry`).
4. Reading `results` on a `fetch_url_results` item in any form, including fallback.
5. Fabricating `id`, `date` or `lastUpdated` for a `fetch_url_result` entry.
6. Any change to D-M2 order or first-occurrence-wins.
7. Any test added, removed, renamed, skipped or weakened; any must-not-move test moving.
8. Any change to `DEFAULT_TIMEOUT_MS`, prompt, preset, endpoint, `REQUEST_SCHEMA`, taxonomy,
   identity, persistence, export surface, or the 17-field contract.
9. Any gate, env, credential, Netlify or deploy change.
10. Any live API call.

---

## 5 · Validation

1. `npm run qa:offline` → **PASS, 43 effective suites**, identical to the step-0 baseline.
2. `node qa/news_catalysts_provider_offline.js` → **PASS, 39/39**, NP01–NP39 contiguous.
3. `node qa/news_catalysts_core_offline.js` → **PASS, 30/30**, file unmodified.
4. Implementation diff is **exactly two files**:
   `git diff --stat 2e3ca40 -- . ':(exclude)work/' ':(exclude)BACKLOG.md'`
5. Read-back: within the provider diff, every changed hunk lies inside `adaptAgentResponse` or its
   adjacent comments; `appendEvidenceEntry` is absent from the diff.
6. Read-back: the string `results` is no longer read on a `fetch_url_results` item; `contents` is
   read only inside `adaptAgentResponse`.
7. Read-back: `module.exports` still has **16 entries**, same names, same order.
8. Read-back: `DEFAULT_TIMEOUT_MS` is `22000`; prompt, preset, endpoint, `REQUEST_SCHEMA` absent
   from the diff.
9. Planted-negative proof: with the provider's source-2 branch temporarily reverted to `results`,
   NP34's positive case fails; restored, 39/39 — recorded in `review.md`.

---

## 6 · Definition of done

`adaptAgentResponse` reads `contents[]` on `fetch_url_results` items for both the condition-6
pre-check and the D-M2 source-2 traversal, never `results[]`; entries are appended with
`evidenceKind: 'fetch_url_result'` retaining `url`, `title`, `snippet` and nothing fabricated;
D-M2 order and first-occurrence-wins are unchanged. NP03 fails closed on malformed `contents`;
NP08 and NP34 fixtures use `contents[]`; NP34 proves `contents[]`-only grounding positively and
`results[]` on that type negatively; NP39 proves retention where available, no fabrication, and no
public leakage. Provider QA 39/39, core QA 30/30 with the core suite and core module unmodified,
`qa:offline` PASS at 43, every must-not-move test green, export surface 16, 17-field contract
intact. The implementation diff is exactly the two named files. `review.md` carries a `## Lessons`
section, the two-row "Files changed" block, and the final-check line.

A successful item remains **byte-identical in shape to S1.5**:

```json
{ "ticker": "FROG", "eventDate": "2026-09-02", "category": "product_customer_partnership",
  "direction": "positive", "sourceUrl": "...", "normalizedSourceUrl": "...",
  "sourceDomain": "investors.jfrog.com", "provider": "j3-news-catalysts@job-model-v1",
  "retrievedAt": "...", "identityHash": "<64 lowercase hex>",
  "provenance": "retrieval_unverified", "confidence": null,
  "requiresVerification": true, "scoringImpact": "none",
  "eventType": "catalyst", "relevanceScope": "company", "subType": null }
```

**Any deviation from this shape is a test failure, not a warning.**
