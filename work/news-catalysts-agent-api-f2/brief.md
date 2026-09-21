# Task brief: news-catalysts Agent default timeout — S1.5.2 F-2

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Only then may implementation begin, per `AGENTS.md`
"Task folder convention".

Source of truth: Owner ruling **F-2** (2026-09-21), issued after S1.5.2 Pilot 2 and Pilot 2B live
measurements; F2-PATCH-READY preflight accepted 2026-09-21. This is a **narrow runtime correction**
to the landed Agent API provider — not a redesign, not retry logic, not S1.5.1 hardening.

## Baseline

| | |
|---|---|
| `branch-dev` = `origin/branch-dev` | **`71d572b`** — "read fetch_url_results.contents[] in Agent adapter (S1.5.2 F-1)" |
| `origin/main` | `fbec2c1` |
| Task branch / worktree | `task/news-catalysts-agent-api-f2` · `pt-wt-news-catalysts-agent-api-f2` |
| `npm run qa:offline` | expected **PASS, 43 effective suites** — confirmed by the Worker's step-0 pre-edit baseline |
| Provider QA / core QA | **39/39** · **30/30** at base |
| Provider export surface | **16 exports** (`DEFAULT_TIMEOUT_MS` is module-private, not exported) |

## The finding (F-2) — live measurements

| Call | Transport | Outcome | Latency |
|---|---|---|---|
| Pilot 2 NVDA (35 s allowance) | Agent | completed | 28.4 s |
| Pilot 2 FROG (22 s default) | Agent | **timed out → PROVIDER_FAILURE** | 22.0 s |
| Pilot 2 MRNA (22 s default) | Agent | completed | 21.9 s |
| Pilot 2 FROG supplementary (35 s) | Agent | completed | 25.8 s |
| Pilot 2B NVDA attempt 1 (35 s) | Agent | **timed out → PROVIDER_FAILURE** | 35.0 s |
| Pilot 2B NVDA attempt 2 (35 s) | Agent | completed | 32.9 s |

Successful Agent calls ran 21.9–32.9 s; one call exceeded the 35 s pilot allowance; the one call run
at the 22 s default timed out. Steady-state cost is 3 `search_web` + 1–2 `fetch_url` invocations per
call; no first-use schema-preparation effect was observed. The 22 s default — a house convention
inherited from the Sonar era and shared by literal value (not by code) with `fund-facts-provider.js`
— is operationally insufficient for the Agent transport. Every timeout observed failed **closed**
(`PROVIDER_FAILURE`, no partial output); this task keeps that behaviour and only widens the budget.

## Objective

Raise the news-catalysts provider's default timeout to 45 000 ms, changing nothing else.

## Implementation scope — exactly two files

```
netlify/functions/lib/news-catalysts-provider.js   modify — the DEFAULT_TIMEOUT_MS literal + adjacent comment only
qa/news_catalysts_provider_offline.js              modify — NP02 gains a source-scoped pin
```

**Everything else is STOP-1.** Named explicitly: **`fund-facts-provider.js` (its own
`DEFAULT_TIMEOUT_MS = 22000` stays 22000 — not one byte)** · `fund-facts-core.js` ·
`news-catalysts-core.js` · `qa/news_catalysts_core_offline.js` · `news-catalysts-preflight.js` ·
`news-catalysts.mjs` · `evidence-contract.js` · `evidence-freshness.js` · `qa/run-offline.js` ·
`netlify.toml` · `package.json` · `index.html` · `services/**` · `CLAUDE.md` · `AGENTS.md` · `BACKLOG.md`.

**No ASK-tier file is in scope.** Posture **ACCEPT EDITS** across the two files. No env, Netlify,
gate, credential or deploy change. **No live Perplexity call in this task.**

---

## 1 · Required correction

1. In `netlify/functions/lib/news-catalysts-provider.js`, the declaration
   `var DEFAULT_TIMEOUT_MS = 22000;` becomes **`var DEFAULT_TIMEOUT_MS = 45000;`**. The adjacent
   comment records the F-2 ruling, the live latency basis (21.9–32.9 s successes; >35 s observed),
   and the runtime boundary in §3.
2. The existing injected override seam is **preserved unchanged**:
   `timeoutMs: posInt(opts.timeoutMs, DEFAULT_TIMEOUT_MS)` — a caller-supplied positive `timeoutMs`
   still wins; absence or a non-positive value still falls back to the default.
3. **No automatic retry** of any kind is added — not in the provider, not in the core, not in the
   route. A timeout at 45 s fails closed exactly as today: `PPLX_TIMEOUT` → Tier A →
   `{ ok:false, reason:'PROVIDER_FAILURE' }`, no partial output.
4. `pplxPostText`, the AbortController/`setTimeout` mechanics, `posInt`, and every other line of the
   provider are byte-for-byte unchanged.

---

## 2 · QA — `qa/news_catalysts_provider_offline.js`

**Test count stays 39. No test is added, removed, renamed, skipped or weakened.** Only NP02 changes.

| ID | Change |
|---|---|
| **NP02** | Gains a **source-scoped pin** (the NP38 / NP27 technique — read the provider source, assert a literal; never a whole-file behavioural wait): (a) the source declares exactly `var DEFAULT_TIMEOUT_MS = 45000;`, (b) the override seam `posInt(opts.timeoutMs, DEFAULT_TIMEOUT_MS)` is present verbatim, (c) the literal `22000` no longer appears in the provider source. The existing `timeoutMs: 25` injected-override assertion (hanging fetch ⇒ `PROVIDER_FAILURE`) is **unchanged** and continues to prove the seam behaviourally. |

Rationale for a source pin rather than a behavioural default-timeout test: proving the default
behaviourally would require a 45 s hang in an offline suite; the injected `timeoutMs: 25` case already
proves the timeout path, and the pin proves the default value the seam falls back to.

### Must NOT move

```
NP01  request body            NP03  Tier-B ladder            NP04–NP13  Tier-C ladder
NP14  URL normalization       NP15  identity + pinned hash   NP16  17-field projection
NP17  store-key shape         NP18  J7 freshness             NP19  shared validators
NP20  injection contract      NP21  purity / determinism     NP22  malformed types
NP23  forbidden-surface scan  NP24–NP32  taxonomy            NP33–NP39  Agent shape / Evidence Set
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
| `fund-facts-provider.js` | **absent from the diff**; its `DEFAULT_TIMEOUT_MS` still `22000` |

---

## 3 · Runtime boundary — recorded, not changed

The 45 s provider timeout is **intentionally below the currently recorded 60 s synchronous Netlify
execution ceiling** for the `news-catalysts` route (standard synchronous Function, mode A: no
`-background` name, no `config` export, `netlify.toml` carries only `[build] publish = "."`). The
remaining ~15 s is the route's own budget (preflight, gate checks, the create-only store write,
response envelope).

- This task does **not** change the execution mode and does **not** attempt to consume the full
  60 s ceiling.
- **Any discovery that the route requires a wider timeout or a runtime redesign (Background
  Function, Async Workloads, streaming, retry, partial results) is STOP-1 and must not be solved
  inside F-2.**
- The 60 s figure is the value recorded in the migration brief (`work/news-catalysts-agent-api/brief.md`
  §7); this task relies on it as recorded and does not re-verify it against Netlify.

---

## 4 · Frozen — not up for discussion in this task

**`fund-facts-provider.js` `DEFAULT_TIMEOUT_MS = 22000`** · Agent endpoint `PPLX_ENDPOINT` · preset
`PPLX_MODEL = 'low'` · request body (`buildRequestBody`, `instructions`, `input`, `tools`,
`response_format`, `REQUEST_SCHEMA`, `json_schema.name`, no `strict`) · prompt text · Evidence Set
construction and the nine internal fields · grounding correlation (`resolveGrounded`,
`normalizeHttpsUrl`, D-M2 order, first-occurrence-wins) · taxonomy (`CATEGORIES`, `EVENT_TYPES`,
`RELEVANCE_SCOPES`, `subType` semantics) · identity tuple · `IDENTITY_SCHEMA_VERSION` · `buildNewsKey` ·
`NEWS_KEY_RE` · `CONTRACT_VERSION` · `SOURCE_TIER` · `PROVIDER_ID` · the 17-field item contract and order ·
the 19-field stored record · `news-catalysts-core.js` · persistence · Netlify execution mode · env ·
gates · **retry behaviour (none exists; none is added)** · S1.5.1 hardening · **export surface = 16**.

---

## 5 · STOP conditions

The five standing conditions, plus:

1. Any file beyond the two in scope — **`fund-facts-provider.js` in particular**.
2. Any change to `news-catalysts-core.js` or `qa/news_catalysts_core_offline.js`.
3. Any provider change outside the `DEFAULT_TIMEOUT_MS` declaration and its adjacent comment.
4. Any retry, backoff, second attempt, or partial-result behaviour.
5. Any change to the `posInt(opts.timeoutMs, DEFAULT_TIMEOUT_MS)` seam or to `pplxPostText`.
6. Any value other than exactly `45000`.
7. Any test added, removed, renamed, skipped or weakened; any must-not-move test moving.
8. Any change to the Netlify execution mode; any attempt to widen the route's runtime or to consume
   the 60 s ceiling; any discovery that the route needs such a redesign (§3).
9. Any change to endpoint, preset, request body, prompt, Evidence Set, grounding, taxonomy, identity,
   persistence, export surface, or the 17-field contract.
10. Any gate, env, credential, Netlify or deploy change.
11. Any live API call.

---

## 6 · Validation

1. `npm run qa:offline` → **PASS, 43 effective suites**, identical to the step-0 baseline.
2. `node qa/news_catalysts_provider_offline.js` → **PASS, 39/39**, NP01–NP39 contiguous.
3. `node qa/news_catalysts_core_offline.js` → **PASS, 30/30**, file unmodified.
4. Implementation diff is **exactly two files**:
   `git diff --stat 71d572b -- . ':(exclude)work/' ':(exclude)BACKLOG.md'`
5. Read-back: the provider diff touches only the `DEFAULT_TIMEOUT_MS` declaration line and adjacent
   comment lines; `posInt(opts.timeoutMs, DEFAULT_TIMEOUT_MS)` and `pplxPostText` absent from the diff.
6. Read-back: `grep -c "22000" netlify/functions/lib/news-catalysts-provider.js` → 0;
   `grep -c "DEFAULT_TIMEOUT_MS = 22000" netlify/functions/lib/fund-facts-provider.js` → 1.
7. Read-back: `module.exports` still has **16 entries**, same names, same order.
8. Read-back: no `retry`, `attempt`, or second `fetchImpl` call introduced in the provider diff.
9. Planted-negative proof: with the provider literal temporarily reverted to `22000`, NP02 fails on
   the pin; restored, 39/39 — recorded in `review.md`.

---

## 7 · Definition of done

`netlify/functions/lib/news-catalysts-provider.js` declares `var DEFAULT_TIMEOUT_MS = 45000;` with an
adjacent comment recording the F-2 ruling and the §3 runtime boundary; the injected override seam is
unchanged; no retry exists; a 45 s timeout still fails closed as `PROVIDER_FAILURE`. NP02 pins the
literal, the seam, and the absence of `22000`, while its `timeoutMs: 25` behavioural case is
unchanged. Provider QA 39/39, core QA 30/30 with the core suite and core module unmodified,
`qa:offline` PASS at 43, every must-not-move test green, export surface 16, 17-field contract intact,
`fund-facts-provider.js` absent from the diff. The implementation diff is exactly the two named
files. `review.md` carries a `## Lessons` section, the two-row "Files changed" block, and the
final-check line.

The public item shape is untouched by this task and remains exactly the 17-field S1.5 contract:

```json
{ "ticker": "NVDA", "eventDate": "2026-08-26", "category": "earnings_event",
  "direction": "positive", "sourceUrl": "...", "normalizedSourceUrl": "...",
  "sourceDomain": "www.sec.gov", "provider": "j3-news-catalysts@job-model-v1",
  "retrievedAt": "...", "identityHash": "<64 lowercase hex>",
  "provenance": "retrieval_unverified", "confidence": null,
  "requiresVerification": true, "scoringImpact": "none",
  "eventType": "catalyst", "relevanceScope": "company", "subType": null }
```

**Any deviation from this shape is a test failure, not a warning.**
