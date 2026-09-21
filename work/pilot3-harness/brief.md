# Task brief: Pilot 3 evidence-capture harness

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Only then may implementation begin, per `AGENTS.md`
"Task folder convention".

Source planning artifact: `.ai-reports/status/pilot3-execution-plan.PREP.local.md`.

**Building and offline-testing this harness does NOT authorize Pilot 3.** The live Agent calls
require a **separate explicit Owner approval**, given after this harness passes offline validation.

## Baseline — verified at HEAD, not assumed

| | |
|---|---|
| Local `HEAD` | **`336ff96`** — `feat(news): harden catalyst deterministic validation` |
| `origin/branch-dev` | `d9395ea` — **local is 4 ahead, not pushed** |
| H-A | `0b04280` implemented · `6231553` brief — **committed locally, not pushed** |
| H-B | `336ff96` implemented · `2d63bd3` brief — **committed locally, not pushed** |
| LAND | **has not occurred for either slice** |
| `SKIP_REASONS` at HEAD | **12, verified**: the existing 10 plus **`GENERIC_SOURCE_URL` (11)** and **`FUTURE_DATED_CATALYST` (12)**. The planning expectation is now fact |
| Provider entry | `getNewsCatalysts(request, options)` — `request = { ticker }`, `options = { fetchImpl, apiKey, nowIso, timeoutMs?, maxBytes? }` |

## Objective

Capture enough evidence from three live Agent calls to support Pilot 3 mechanical validation,
behavioural analysis, **H-0 / DR-19 / DR-23 closure**, **Q-1** emission-gap analysis, **Q-2**
retrieval-gap analysis, and **replay-corpus seeding** — with **zero production change**.

---

## 1 · Location — outside the tracked repo

```
C:\Users\Owner\Documents\Project\pt-pilot3-harness\        ← harness root, a SIBLING of the repo
├── run-pilot3.js              live runner (requires Owner approval to execute)
├── selftest-offline.js        offline validation; no network
├── lib/
│   ├── capture.js             allowlist projection + writer
│   └── checks.js              M-1…M-7 evaluation over captured output
├── fixtures/
│   └── agent-envelope.sample.json     synthetic Agent envelope for selftest
├── approved-hashes.json       EXTERNAL PINSET — created by the Owner/review step only;
│                              NOT part of the self-hashed set (see below)
└── out/
    └── <runId>/               runId = UTC instant, e.g. 2026-09-22T0730Z
        ├── manifest.json
        ├── NVDA.json
        ├── FROG.json
        └── MRNA.json
```

**Why fully outside the repo rather than under `.ai-reports/`.** `.ai-reports/` is excluded via
**`.git/info/exclude`**, which is a *local, unversioned* mechanism — not a tracked `.gitignore`
entry. A sibling directory cannot appear in `git status` under any circumstance, cannot be swept
into a `git add`, and survives any change to local exclude rules. Captured envelopes are also large.
**Zero files are created inside the repository by this task other than this brief.**

**The harness requires no `npm install`.** The provider's require-allowlist (pinned by NP23) is
limited to sibling libs and Node built-ins, so bare `node` suffices. It loads the provider by
relative path:

```
require('../portfolio-tracker/netlify/functions/lib/news-catalysts-provider.js')
```

**It must load the provider at the reviewed commit.** The runner records the provider file's SHA256
and the repo `HEAD` into the manifest, so captured evidence is permanently attributable to the code
that produced it.

### Provenance — the harness pins itself, not just the provider

**The harness lives outside Git, so provider `HEAD` alone is insufficient for evidence provenance.**
An unversioned runner could change between review and execution with no trace.

**Pinned harness files — SHA256 of each:**

```
run-pilot3.js
lib/capture.js
lib/checks.js
selftest-offline.js                 (part of the reviewed package, therefore pinned)
fixtures/agent-envelope.sample.json
```

**The expected values live in an EXTERNAL pinset — never inside a hashed file.**

Embedding a file's expected SHA256 inside that same hashed file is **self-referential**: writing the
expected value changes the file being hashed and therefore changes the value being verified.

**The harness must therefore use an external approval pinset rather than attempting to self-pin
expected hashes.**

```
approved-hashes.json          ← expected values; NOT in the self-hashed set
```

**Three-point lifecycle:**

1. **At review time** — after implementation and offline tests pass, the reviewed hash set is
   presented to the Owner. **The Owner/review step creates `approved-hashes.json` from it.** The
   runner **never generates or overwrites this file**, and never writes it during a live run.
2. **At execution time, before any network call** — the runner loads `approved-hashes.json`,
   recomputes the five current file hashes, and requires **exact set equality plus exact value
   equality**. **Any failure ⇒ STOP, no network call, non-zero exit.** Failure modes, all fatal:
   **missing pinset** · **malformed pinset** · **a pinned file missing on disk** · **an extra or
   unrecognised entry in the pinset** · **any hash mismatch**.
3. **In the manifest** — the **approved pinset values** are recorded with the run, alongside the
   measured hashes, `repoHead` and the provider file SHA256.

### `approved-hashes.json` — schema

```json
{ "pinsetVersion": 1,
  "createdAtUtc": "2026-09-22T06:00:00.000Z",
  "createdBy": "owner-review",
  "harnessRoot": "C:\\Users\\Owner\\Documents\\Project\\pt-pilot3-harness",
  "files": {
    "run-pilot3.js":                      "<sha256 hex>",
    "lib/capture.js":                     "<sha256 hex>",
    "lib/checks.js":                      "<sha256 hex>",
    "selftest-offline.js":                "<sha256 hex>",
    "fixtures/agent-envelope.sample.json": "<sha256 hex>"
  } }
```

**`files` must contain exactly these five keys** — no more, no fewer. A sixth key, a renamed key or
a missing key is a fatal pinset error, not a warning: an unrecognised entry means the pinset and the
harness disagree about what the harness *is*.

**This is drift and integrity protection, not adversarial tamper-proofing.** Anyone able to edit the
harness can also edit the pinset. It catches accidental edits, stale copies and unreviewed changes —
which is the actual risk here — and is not claimed to do more.

**Per-capture integrity:** after each `<TICKER>.json` is written and closed, the runner computes its
SHA256 and records it in the manifest, so replay evidence can later be checked for accidental
modification and an edited capture is detectable rather than silently trusted.

**No signing infrastructure.** SHA256 pinning is sufficient at this stage; it detects accident and
drift, not a determined adversary, and is not claimed to do more.

---

## 2 · Capture schema

### `manifest.json` — one per run

```json
{ "runId": "2026-09-22T0730Z",
  "repoHead": "336ff96…", "providerSha256": "…",
  "harnessHashesMeasured": { "run-pilot3.js": "…", "lib/capture.js": "…", "lib/checks.js": "…",
                             "selftest-offline.js": "…", "fixtures/agent-envelope.sample.json": "…" },
  "approvedPinset": { "pinsetVersion": 1, "createdAtUtc": "…",
                      "files": { "run-pilot3.js": "…", "…": "…" } },
  "harnessPinVerified": true,
  "captureHashes": { "NVDA.json": "…", "FROG.json": "…", "MRNA.json": "…" },
  "skipReasonVocabulary": ["MISSING_EVENT_DATE", "…", "GENERIC_SOURCE_URL", "FUTURE_DATED_CATALYST"],
  "tickers": ["NVDA", "FROG", "MRNA"],
  "nowIso": "<the single injected clock used for all three calls>",
  "timeoutMs": "<provider default — not overridden; see §5>",
  "retryPolicy": "none",
  "calls": [ { "ticker": "NVDA", "file": "NVDA.json", "outcome": "ok|provider_failure|…" } ] }
```

### `<TICKER>.json` — one per call

```json
{ "ticker": "NVDA",
  "nowIso": "2026-09-22T07:30:00.000Z",
  "requestStartedAt": "…", "requestEndedAt": "…", "elapsedMs": 0,
  "httpStatus": 200,

  "rawResponseBody": "<original response TEXT via Response.clone() — VERBATIM, source of truth>",
  "parsedAgentEnvelope": { /* derived convenience parse — NOT verbatim */ },

  "derived": {
    "status": "completed", "error": null,
    "outputItemTypes": ["search_results", "message"],
    "queries": ["…"],
    "evidenceSet": { "total": 0, "byKind": { "search_result": 0, "fetch_url_result": 0, "url_citation": 0 },
                     "entries": [ { "normalized": "…", "domain": "…", "evidenceKind": "…",
                                    "title": "…", "date": "…", "lastUpdated": "…", "snippet": "…" } ] },
    "usage": { "total_tokens": 0, "cost": { "total_cost": 0 } }
  },

  "providerResult": {
    "ok": true,
    "items": [ /* surviving items, full 17-field form */ ],
    "skippedItems": [ { "reason": "GENERIC_SOURCE_URL" } ],
    "counts": { "rawCandidates": 0, "surviving": 0, "skipped": 0,
                "byReason": { "GENERIC_SOURCE_URL": 0, "FUTURE_DATED_CATALYST": 0, "…": 0 } } }
}
```

**`byReason` enumerates all 12 reasons explicitly, including zeros.** A reason absent from the map is
indistinguishable from a reason that never fired; enumerating avoids that ambiguity.
**`GENERIC_SOURCE_URL` and `FUTURE_DATED_CATALYST` are counted separately and must never be
merged** — that split is the only signal distinguishing a grounding rejection from a date rejection.

### Non-destructive capture — the wrapper must not consume the body

**A `Response` body is a one-shot stream.** Reading it in the wrapper would leave the provider with a
consumed body and break the call. The wrapper therefore:

1. `await realFetch(url, init)` → `resp`
2. **`const captured = await resp.clone().text()`** — read the *clone*, never `resp`
3. **return the original `resp` untouched** — status unchanged, headers unchanged, body **unread and
   available exactly as normal**

Equivalent non-destructive mechanisms are acceptable (e.g. tee-ing the stream), but the property is
not negotiable: **the provider must receive a Response indistinguishable from the unwrapped one.**

**Two stored representations, never conflated:**

| Field | What it is |
|---|---|
| **`rawResponseBody`** | The **original response text**, captured from the clone. **The verbatim artifact and the source of truth** |
| `parsedAgentEnvelope`, `derived.*` | Parsed / analytical projections. **Never described as "verbatim"** |

> **Naming correction.** The earlier `rawAgentEnvelope` holding a *parsed object* was wrong — a
> parsed object is not verbatim. The verbatim artifact is **`rawResponseBody`** (text); a parsed copy
> is stored separately and explicitly labelled derived.

**`derived.evidenceSet` is reconstructed by the harness** from `rawResponseBody`, using the ruled
D-M2 order (`search_results` → `fetch_url_results.contents` → `url_citation`, first occurrence wins).
It is **not read out of the provider** — the Evidence Set is provider-internal and never returned.

**The raw response is the source of truth. The reconstruction is derived, analytical evidence and is
never more authoritative than the captured raw body.** If the two disagree, the raw body wins and the
reconstruction is what is wrong.

---

## 3 · Secret redaction — allowlist, never denylist

**The harness will see the credential by construction.** The provider builds
`'Authorization': 'Bearer ' + ctx.apiKey` at `news-catalysts-provider.js:358-359` and passes it in
the `init` argument to the injected `fetchImpl`. There is no way to wrap fetch without receiving it.

**Therefore:**

1. **The harness never serialises `init`.** Not the headers, not a redacted copy, not a key list.
   The wrapper receives `(url, init)`, forwards them untouched to the real `fetch`, and **captures
   only the response body**.
2. **Capture is an explicit allowlist projection.** `capture.js` builds the output object field by
   field from the named schema in §2. It never spreads, never `JSON.stringify`s an arbitrary object,
   never walks unknown keys.
3. **The API key is read from the environment and held in a single local variable** passed straight
   to `options.apiKey`. It is never logged, never printed, never written.
4. **Request URL is recorded as the constant endpoint only** — no query string, since the provider
   sends none.
5. **A redaction self-test is mandatory** (§4): after any run, assert that no output file contains
   the API key value, the substring `Bearer `, the string `Authorization`, or any `PPLX_`/
   `PERPLEXITY_` environment name.

**Never captured or written:** `PERPLEXITY_API_KEY` · any `Authorization` header · any environment
value · any unrelated secret · any portfolio or persistence state.

---

## 4 · Offline validation plan — runs before any live call

**No network. No API key required. This is the gate that must pass before approval is requested.**

| # | Check |
|---|---|
| **O-1** | `selftest-offline.js` drives `getNewsCatalysts` with a **stub `fetchImpl`** returning `fixtures/agent-envelope.sample.json`. Asserts a complete `<TICKER>.json` is produced with every §2 field populated |
| **O-2** | **Redaction self-test with a planted secret.** Run the stub with `apiKey: 'PLANTED-SECRET-DO-NOT-CAPTURE'`; assert that string appears in **no** output file, and neither do `Bearer `, `Authorization`, `PERPLEXITY_`, `PPLX_` |
| **O-3** | Counts reconcile: `rawCandidates == surviving + skipped`; `byReason` sums to `skipped`; all **12** reasons present as keys |
| **O-4** | Evidence Set reconstruction matches the ruled D-M2 order and first-occurrence-wins, exercised with a fixture carrying all three kinds **and** a duplicate URL across kinds |
| **O-5** | A `fetch_url_results.contents`-only fixture reconstructs correctly with **no `date` field** — absent metadata is omitted, never fabricated (F-1 shape) |
| **O-6** | `checks.js` evaluates M-1…M-7 over the fixture output and correctly reports **NOT OBSERVED** where the fixture contains no instance |
| **O-7** | The harness does not write, or even open for writing, any path inside the repository |
| **O-9** | **Capture is non-destructive — the provider still parses.** With the wrapper over a stub response, `getNewsCatalysts` returns `ok:true` with a full item set. A wrapper that consumed the body fails here |
| **O-10** | **Equivalence.** Provider result **with** the capturing wrapper is **deep-equal** to the result from the same stub response with **no** capture. Capture must be observationally invisible to the provider |
| **O-11** | **Fidelity.** `rawResponseBody` is **character-identical** to the stub response body served |
| **O-12** | **Pinset enforcement — four cases, no network in any of them.** (a) **valid pinset + unaltered harness ⇒ execution proceeds and reaches the stub fetch**; (b) **altered harness source with an unchanged pinset ⇒ STOP before fetch**; (c) **missing pinset ⇒ STOP before fetch**; (d) **malformed pinset** — bad JSON, wrong key set, or an extra entry — **⇒ STOP before fetch**. Every STOP case is asserted by proving **the injected fetch was never invoked**, not merely that the process exited |
| **O-13** | **Capture hashes.** Each `<TICKER>.json` SHA256 in the manifest matches the file on disk; altering a capture file makes the mismatch detectable |
| **O-8** | Repo unchanged after the selftest: `npm run qa:offline` still **PASS at 43**, `git status` shows no new or modified tracked file |

**O-2 is the one that must not be skipped.** A redaction strategy that has never been tested against
a planted secret is an assumption, not a control.

---

## 5 · Live-call plan — requires separate Owner approval

**Not authorized by this brief.**

| | |
|---|---|
| Tickers | **NVDA, FROG, MRNA** — three calls, **sequential**, one per ticker |
| Clock | **one `nowIso`** for all three, captured in the manifest |
| Timeout | **provider default, not overridden** — see the correction below |
| Retry | **NONE.** No automatic retry. If a call fails or times out, the harness **stops, writes what it has, and reports.** Retrying is an Owner decision made at that moment |
| Gate / env / Netlify | untouched. No persistence write. No portfolio write. No deploy |

> **Correction to an earlier plan, caught at HEAD.** D-M6 originally said to inject **35000 ms** for
> the first pilot call, to survive JSON-schema warm-up. **F-2 has since raised the provider default
> to 45000 ms.** Injecting 35000 now would *lower* the timeout below production default — the
> opposite of the intent. **The harness passes no `timeoutMs` at all** and uses the 45000 ms default,
> which both preserves real provider behaviour as required and exceeds the old allowance.

**After the run:** `checks.js` produces the M-1…M-7 result table; behavioural observations (§3 of the
Pilot 3 plan) are human review over the captured items and are **not** produced by the harness.

---

## 6 · STOP conditions

1. **Any write inside the repository** other than this brief.
2. **Any secret written to any output file** — O-2 failing is an immediate stop.
3. Any modification to `news-catalysts-provider.js`, `news-catalysts-core.js`, any QA file, or any
   production instrumentation **for the purpose of capturing evidence**.
4. Any change to gates, env vars, Netlify, or persistence.
5. **Any live API call before separate Owner approval.**
6. Any automatic retry.
7. Any `timeoutMs` override, or any change to provider default behaviour.
8. Any push, LAND, or deploy.
9. The provider file's SHA256 at run time not matching the reviewed `HEAD` — evidence must be
   attributable to reviewed code.
9a. **Any pinset failure at execution time — STOP before any network call:** missing pinset ·
    malformed pinset · pinned file missing on disk · extra or unrecognised pinset entry · any hash
    mismatch.
9d. **Expected hash values embedded in any self-hashed harness file.** The pinset is external by
    construction; embedding creates an unsatisfiable self-reference.
9e. **The runner generating, writing or overwriting `approved-hashes.json`.** Only the Owner/review
    step creates it.
9b. **Any wrapper that reads, consumes or transforms the Response the provider receives.** Capture
    reads a clone; the original is returned untouched.
9c. Describing a parsed object as "verbatim", or treating the reconstructed Evidence Set as more
    authoritative than `rawResponseBody`.
10. `npm run qa:offline` not PASS at 43 before the live run.

## 7 · Definition of done

The harness exists at the sibling path, loads the provider at the reviewed commit, and passes
**O-1…O-8** offline with no network and no repository write. `capture.js` is an allowlist projection
that never serialises `init`. The planted-secret test proves no credential reaches any output file.
The capture schema is populated end to end, all 12 skip reasons enumerated, `GENERIC_SOURCE_URL` and
`FUTURE_DATED_CATALYST` counted separately. **Capture is non-destructive and observationally
invisible to the provider (O-9…O-11); the runner verifies all five harness files against the
**external** `approved-hashes.json` and stops before any network call on missing, malformed or
mismatched pinset (O-12); the runner never writes that pinset; each capture file's SHA256 is
recorded in the manifest (O-13).** `checks.js` reports M-1…M-7 including NOT OBSERVED.
**No live call has been made.** `review.md` carries a `## Lessons` section, the two-row "Files
changed" block, and the final-check line.

**Explicitly not claimed:** that Pilot 3 has run, or that any Pilot 3 question is answered. This
task builds and proves the instrument. Using it is a separate, Owner-approved step.
