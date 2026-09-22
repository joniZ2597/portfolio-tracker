# Task brief: S2-A1 — evidence replay corpus

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Only then may implementation begin, per `AGENTS.md`
"Task folder convention".

Source planning artifact: `.ai-reports/status/s2-a1-replay-corpus.PREP.local.md`.

> ## EVIDENCE GATE — **SATISFIED** (Owner, 2026-09-22)
>
> The §1 host-side verification is **complete**. Worker returned **A1 INPUT VERDICT: READY** —
> all 3 run folders exist · all 9 ticker captures exist · all `rawResponseBody` non-empty ·
> **all 9 capture SHA256 values match their manifests** · `nowIso` consistent within each run ·
> provenance present · secret scan clean · **Pilot evidence not modified**.
>
> **The Worker must NOT repeat this check.** §1 is retained as provenance — it records what was
> verified and the STOP semantics that applied — not as an outstanding action.
>
> **A1 is therefore eligible to become CODE-READY** after the normal Brief-approval and Worker
> gap-check workflow.

## Baseline

| | |
|---|---|
| `branch-dev` = base | **`1eda72c`** — S1.5.1 CLOSED / LANDED |
| `origin/branch-dev` | `d9395ea` — **7 ahead, not pushed** |
| `qa:offline` | **PASS, 43 spawned suites** (43 `qa/*_offline.js` on disk) |
| Provider suite · core suite | **48/48** · **30/30** |
| Production changes in this task | **NONE** |

## Objective

Build a **deterministic measurement instrument**: replay captured Agent envelopes through the
**real reviewed provider** offline, and classify every outcome, so later S2 tasks can answer without
a live call — what was retrieved, what the model emitted, what survived, what was rejected and why,
and whether a known reference event was Q-1, Q-2 or Q-3.

**The instrument must be independent of the production mechanisms it will later evaluate.**

---

## 1 · Evidence verification — SATISFIED, retained for provenance

Three runs, nine captures:

```
pt-pilot3-harness\out\20260921T2045Z          NVDA FROG MRNA
pt-pilot4-harness\out\p4-20260921T2307Z       NVDA FROG MRNA
pt-pilot4-harness\out\p4-20260921T2312Z       NVDA FROG MRNA   (re-measurement)
```

**Verified 2026-09-22 — all conditions met:** run folder exists · all three capture files exist ·
`manifest.json` exists and parses · `rawResponseBody` present and non-empty in every capture ·
**every capture's disk SHA256 equals its `manifest.captureHashes` entry** · `nowIso` consistent
within each run · provenance present · secret scan clean.

**The STOP semantics that applied, recorded so the standard is not lost:** a hash mismatch would
have meant the evidence changed after capture, and a corpus built on it would measure something
other than what the pilot observed. **Report the mismatch; never rebuild the hash.** That standard
governs any future re-verification; it is not an action outstanding now.

**The two Pilot 4 runs stay separate cases and are never merged or deduplicated** — five minutes
apart on the same tickers, they are the clearest available evidence of retrieval/emission variance.

**The harness trees are read-only source material.** Modifying them, including their `out/`
contents, is STOP-1.

---

## 2 · Corpus design — INVARIANT vs SNAPSHOT

A1 builds a regression corpus over code that **A2–A6 are explicitly intended to change**. The
corpus therefore separates two assertion classes, and the distinction is load-bearing:

| Class | Meaning | When A2–A6 land |
|---|---|---|
| **INVARIANT** | contract shape · candidate reconciliation · replay determinism · no-secret · Evidence Set ordering | **Must never change** — a change is a genuine regression |
| **SNAPSHOT** | the specific `{items, skippedItems, attribution}` a given envelope produces at a given provider version | **Expected to change**, re-baselined deliberately per task; **the delta is the measurement** |

**Conflating them is the failure mode.** Freezing snapshots as regressions would make A2 look like a
bug; having no invariants would catch nothing.

---

## 3 · Fixture schema

Nine cases, one per `(run, ticker)`.

```
qa/fixtures/replay/
├── index.json                              corpus manifest + reference cases
├── p3-20260921T2045Z-{NVDA,FROG,MRNA}.json
├── p4-20260921T2307Z-{NVDA,FROG,MRNA}.json
└── p4-20260921T2312Z-{NVDA,FROG,MRNA}.json
```

```json
{ "caseId": "p4-20260921T2307Z-NVDA",
  "provenance": { "pilot": "pilot4", "runId": "…", "ticker": "NVDA",
                  "captureSha256": "<verbatim from the run manifest>",
                  "nowIso": "…", "providerSha256": "…", "providerCommit": "…",
                  "harnessPinset": "…", "extractedAtUtc": "…", "extractedBy": "s2-a1" },
  "input":      { "ticker": "NVDA", "nowIso": "<same as provenance>",
                  "rawResponseBody": "<captured response TEXT, verbatim>" },
  "expected":   { "kind": "SNAPSHOT", "providerVersion": "1eda72c",
                  "items": [ … ], "skippedItems": [ … ], "attribution": { … } } }
```

> **`input.nowIso` is mandatory, not decoration.** The H-B future-dated-catalyst rule compares
> `eventDate` against the injected anchor. Replaying without the captured clock evaluates against
> *today*, and **the corpus would silently produce different results tomorrow**. This single field
> is what makes the instrument deterministic across days.

**Never written into a fixture:** API keys · `Authorization` or any request header · request `init`
objects · environment values · anything outside the schema above. **Captured evidence is re-scanned
at extraction, not trusted** — the Pilot 3/4 captures carried a planted-secret guarantee, but A1
verifies rather than inherits it.

---

## 4 · Candidate-level attribution

Every raw candidate lands in **exactly one** bucket. The mapping over all 12 skip reasons is total
and checkable.

| Bucket | Skip reasons |
|---|---|
| **SURVIVED** | — |
| **MALFORMED_CANDIDATE** | `MISSING_EVENT_DATE` · `INVALID_EVENT_DATE` · `MISSING_SOURCE_URL` · `INVALID_SOURCE_URL` *(syntax)* · `UNKNOWN_CATEGORY` · `INVALID_DIRECTION` · `UNKNOWN_EVENT_TYPE` · `INVALID_RELEVANCE_SCOPE` · `INVALID_SUB_TYPE` |
| **Q-3 · UNRETRIEVED_SOURCE_URL** | `INVALID_SOURCE_URL` *(valid https, absent from Evidence Set)* |
| **GROUNDING_REJECTION** | `GENERIC_SOURCE_URL` |
| **DETERMINISTIC_VALIDATION_REJECTION** | `FUTURE_DATED_CATALYST` |
| **DUPLICATE_IN_BATCH** | `DUPLICATE_IN_BATCH` |

### Why this classifier is worth building — verified at `1eda72c`

**`INVALID_SOURCE_URL` is emitted from two distinct sites under one reason code:** `:641` when
`optionalHttpsUrl` returns `INVALID` (malformed / non-https / no host), and `:646` when
`resolveGrounded` returns `null` (valid URL, absent from the Evidence Set).

**Production telemetry therefore cannot distinguish a malformed URL from a Q-3 URL-echo failure.**
The replay classifier can, because it re-derives the Evidence Set and re-tests the candidate. This
is the concrete reason A1 precedes A2: **A2's success criterion is "Q-3 rate falls", and Q-3 rate is
not measurable from production output today.**

**Splitting `INVALID_SOURCE_URL` into two reason codes is an A2 decision. A1 adds no reason code and
changes no production file.**

---

## 5 · Reference-event Q-1 / Q-2 — curated, draft for Owner review

Q-1 and Q-2 have **no candidate to classify**; the signal is an absence, and absence alone is not
evidence. They require an explicit named reference case.

**Rule, per case per run:** in the Evidence Set **and** emitted → `RESOLVED_EMITTED` · in the
Evidence Set, **not** emitted → **Q-1** · **not** in the Evidence Set → **Q-2** · not assessed →
`NOT_ASSESSED`. **Never inferred.**

**Attribution boundaries — explicit, Owner-ruled:**

| | |
|---|---|
| **Q-3** | **candidate-level only.** A candidate existed and was lost at grounding |
| **Q-1 / Q-2** | **reference-event-level only.** No candidate exists to classify |
| **C-1 / date observations** | **reference measurements — NOT Q-1/Q-2 labels.** A date case records which date was chosen; it is not an emission or retrieval gap |

**Curated human assertions must never be given the same authority as mechanical candidate
attribution.** The suite output must visibly separate the two.

### Draft manifest — five already-established cases, no new factual claims

| refId | Ticker | Event | Relevant runs | Classification basis | assertedBy | assertedOn | assertionSource |
|---|---|---|---|---|---|---|---|
| `mrna-fda-covid-2026-27` | MRNA | FDA approval of the 2026–27 COVID vaccine | P3, P4a, P4b | Evidence Set presence, then emission | Owner | 2026-09-21 | Pilot 3 ruling: *"resolved in Pilot 3 — evidence entered, emitted, survived"*; originally a Pilot 1/2 Q-2 |
| `mrna-interpath-ph3` | MRNA | INTerpath Phase 3 readout | P3, P4a, P4b | Evidence Set presence, then emission | Owner | 2026-09-21 | Pilot 3 ruling: *"Q-2 for this run / window evidence, with the report's stated caveat"* |
| `nvda-doj-probe` | NVDA | DOJ probe | P3, P4a, P4b | Evidence Set presence, then emission | Owner | 2026-09-21 | Pilot 3 ruling: *"Q-2 in Pilot 3"* |
| `nvda-q2-fy27-earnings` | NVDA | Q2 FY27 earnings | P3, P4a, P4b | **Q-3 check** — emitted, then lost at grounding because `sourceUrl` was not retrieved | Owner | 2026-09-21 | Pilot 3 ruling: *"Q-3 — evidence existed, candidate emitted, lost at grounding"* |
| `mrna-convertible-notes` | MRNA | ≈$2.6B convertible-notes offering | P3, P4a, P4b | **C-1 date check** — announcement/pricing vs completion/indenture date | Owner | 2026-09-21 | Pilot 3 ruling (regression reproduced at the 2026-09-01 completion date); **C-1 NOT_OBSERVED in Pilot 4** |

**Three properties of this manifest the Brief asserts explicitly:**

1. **It is the one part of the corpus not derived from evidence.** It asserts that an event existed
   in the world. It is fallible in a way the rest of the corpus is not.
2. **Matching a reference case to an Evidence Set entry is judgment**, not computation. The manifest
   **records** the matching decision; it does not derive it.
3. **Reference-case outcomes must not be presented with the same authority as candidate-level
   attribution.** The first is curated, the second mechanical, and the suite output must say so.

**No new factual cases may be invented.** Adding a sixth case requires a fresh Owner assertion.

---

## 6 · Implementation scope

```
qa/news_catalysts_replay_offline.js     NEW — replay + attribution suite
qa/fixtures/replay/index.json           NEW — corpus manifest + reference cases
qa/fixtures/replay/<case>.json          NEW — up to 9 case fixtures
```

**Production changes: NONE.** STOP-1 on any of: `netlify/functions/**` · `qa/news_catalysts_provider_offline.js` ·
`qa/news_catalysts_core_offline.js` · `qa/run-offline.js` · `package.json` · `netlify.toml` ·
`CLAUDE.md` · `AGENTS.md` · `BACKLOG.md` · **the Pilot 3/4 harness trees**.

**No ASK-tier file is in scope.** Posture **ACCEPT EDITS**. No env, Netlify, gate or credential
change. No `npm install` — the suite uses Node built-ins and the existing provider require chain.

### Replay principle — real seam, no reimplementation

The suite calls the **real** `getNewsCatalysts` from
`netlify/functions/lib/news-catalysts-provider.js`, with an injected `fetchImpl` returning a stub
`Response` carrying the captured `rawResponseBody`, and the captured `ticker` and `nowIso`.

**No parallel reimplementation of normalization, validation, the ladder or identity** — a
reimplementation would drift from the provider and quietly measure itself. That is STOP-1.

> **One duplication is unavoidable and must be declared.** The classifier needs the reconstructed
> Evidence Set, which the provider does **not** return. A1 reconstructs it **inside the suite** from
> `rawResponseBody` using the ruled D-M2 order — the same reconstruction Pilot 3/4 `checks.js`
> performs. **R-7 asserts that reconstruction agrees with provider grounding behaviour**, so the
> duplication is checked rather than assumed.

---

## 7 · QA plan

| # | Assertion | Class |
|---|---|---|
| **R-1** | Byte-identical replay across two runs in one process **and** across separate processes | INVARIANT |
| **R-2** | Replay output **equals the provider output recorded in the original capture**, every case | INVARIANT |
| **R-3** | `rawCandidates == items.length + skippedItems.length`, every case | INVARIANT |
| **R-4** | Every surviving item: 17 fields, order, enums, A-1 direction rule, key matches `NEWS_KEY_RE` | INVARIANT |
| **R-5** | Attribution **total and disjoint** — every candidate in exactly one §4 bucket; bucket counts sum to `rawCandidates` | INVARIANT |
| **R-6** | Q-3 correct on a **synthetic** valid-but-unretrieved case, and correct-by-absence on a case with none | INVARIANT |
| **R-7** | Suite Evidence Set reconstruction agrees with provider grounding behaviour on a known case | INVARIANT |
| **R-8** | No fixture contains an API key, `Authorization`, `Bearer `, or any request header | INVARIANT |
| **R-9** | Per-case `{items, skippedItems, attribution}` at `providerVersion: 1eda72c` | SNAPSHOT |
| **R-10** | Reference-case outcomes per run, from the curated manifest | SNAPSHOT, curated |

**R-2 is load-bearing.** It is what makes the corpus evidence rather than a rewritten story of the
pilot. If replay cannot reproduce the recorded output, A1 has found a real defect — in the capture,
the harness, or the replay — and that is a **STOP, not a baseline update**.

**No network. No live call. No API key needed to run the suite.**

---

## 8 · Provenance and hash model

Every fixture carries, copied verbatim from its source run manifest: pilot · runId · ticker ·
**original `captureSha256`** · `nowIso` · `providerSha256` · provider commit · harness pinset id.
`index.json` additionally records the **SHA256 of each extracted fixture file**, so a later reader
can tell "the fixture changed" from "the original capture changed".

```
original capture  --captureSha256-->  verified once, at extraction (§1)
extracted fixture --fixtureSha256-->  recorded in index.json
```

**The suite does not re-verify the original captures at runtime.** The harness trees may be cleaned
up later and a QA suite must not depend on a path outside the repo. Verification happens **once**,
at extraction; the recorded `captureSha256` is the permanent link back.

---

## 9 · Suite count — **43 → 44**

One new `qa/*_offline.js`, auto-discovered by `qa/run-offline.js`.

**Every prior brief in this programme asserted "43 unchanged". A1 is the first task to move it.**
The Worker's step-0 baseline records **43**; the post-change run must be **44**, and 44 is the
expected result, not a failure. Provider **48/48** and core **30/30** must remain untouched.

> **Parallel-lane hazard.** If a second Worker lane also adds a QA suite, both branches will assert
> 44 from their own baseline and the merged tree will be 45 — the second to land fails its own
> assertion. **Whichever task lands second re-baselines its expected count**, and that is a
> coordination note for LAND, not a defect in either task.

## 10 · STOP conditions

1. **Any deviation from the §1 verified state discovered during extraction** — a capture whose
   content no longer matches the verified `captureSha256`, a missing file, or an empty
   `rawResponseBody`. *(The gate itself is SATISFIED and is not re-run; this covers evidence
   changing after verification.)*
2. Any production file in the diff.
3. Any modification to the Pilot 3/4 harness trees or their `out/` contents.
4. Any change to the provider or core QA suites, or to `qa/run-offline.js`.
5. **Any reimplementation of provider normalization, validation, the ladder or identity.**
6. Replay failing to reproduce recorded provider output (**R-2**).
7. Non-deterministic replay (**R-1**), or `nowIso` not sourced from the capture.
8. Any secret, header or request `init` reaching a fixture (**R-8**).
9. Any Q-1/Q-2 label inferred from absence without an explicit reference case.
10. Any reference case added beyond the five in §5 without a fresh Owner assertion.
11. Any new skip reason, contract change, identity change or persistence change.
12. Suite count moving by anything other than **+1**.
13. Any live API call.

## 11 · Definition of done

§1 verification **already passed** (Owner, 2026-09-22) and is recorded, not repeated. Up to nine fixtures extracted with full provenance and both
hash chains; the two Pilot 4 runs separate. `qa/news_catalysts_replay_offline.js` replays every case
through the **real provider seam** with the captured `ticker` and `nowIso`, classifies every
candidate into exactly one §4 bucket, and evaluates the five curated reference cases with
`NOT_ASSESSED` where unassessed. **R-1…R-8 green as INVARIANTs; R-9/R-10 recorded as SNAPSHOTs
labelled with `providerVersion`.** No production file in the diff. `qa:offline` PASS at **44**;
provider **48/48**; core **30/30**. `review.md` carries a `## Lessons` section, the two-row "Files
changed" block, and the final-check line.

**Not claimed by this task:** any improvement to the pipeline. A1 measures; it changes nothing.
