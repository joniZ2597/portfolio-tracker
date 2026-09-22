# Task brief: S2 · A2 — Evidence-index binding

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

| | |
|---|---|
| Base | **`9327e47`** = `branch-dev` |
| Branch / worktree | new `task/s2-evidence-index-binding`, separate worktree |
| `qa:offline` baseline | **44 spawned suites** (43 + A1's replay suite) |
| Evidence base | A1 replay corpus — `qa/fixtures/replay/`, 9 cases, all measurements below derived from it |
| Status | **CODE-READY: YES** — D-A2-1/2/3 ruled; the replay-reconstruction defect is corrected in §C.2 / §D.2 |
| Revision | **r2** — Owner correction: `evidenceIndex` is defined against the **duplicate-preserving production** Evidence Set, not A1's deduplicated reconstruction |

---

## A · Problem statement

**What binding means today.** A candidate survives grounding if its normalized URL appears
*anywhere* in the Evidence Set — the union of every URL in the response. `resolveGrounded`
(`provider:820`) linear-scans and returns the **first** entry whose `.normalized` matches. Nothing
about which entry matched is recorded, on the item or anywhere else.

So the current relation is **set membership**:

```
CATALYST → (its URL ∈ the response's URL union) → SURVIVES
```

Not:

```
CATALYST → EXACT EVIDENCE ITEM → EXACT SOURCE URL / INDEX → VALIDATION
```

**Four failure classes the Owner named, assessed honestly against what is deterministically
decidable:**

| Class | Deterministically fixable by A2? |
|---|---|
| URL present elsewhere in the response | **Partly.** A2 can record *which* entry bound and reject structurally unsound bindings. It cannot decide that a retrieved URL is topically unrelated to the emitted event |
| Generic source page | **No — already A5's**, and H-B covers only the narrow URL-shape case. §I |
| Unrelated search result | **No.** "Unrelated" is semantic |
| Evidence item that does not actually support the event | **No.** This is substantiation, and the project already concluded deterministic checks *"reject on contradiction or shape, never confirm meaning"* |

**Therefore A2's honest deliverable is not "the evidence supports the claim."** It is: **the binding
becomes an explicit, recorded, replayable fact rather than an inferred one**, plus deterministic
rejection of bindings that are structurally unsound. Stating otherwise would promise semantic
verification that no deterministic rule can deliver — and would make A2's acceptance criteria
unsatisfiable, which §L shows is a closure failure, not just an overclaim.

---

## B · Current-state trace — measured at `9327e47`

### B.1 · The flow

| Stage | Location | Behaviour |
|---|---|---|
| Evidence Set construction | `provider:490-520`, inside `adaptAgentResponse` | three passes in fixed order: all `search_results.results[]`, then all `fetch_url_results.contents[]`, then `url_citation` annotations on the `output_text` entry |
| Entry shape | `appendEvidenceEntry` `:794` | `{raw, normalized, domain, evidenceKind}` + `id`/`title`/`date`/`lastUpdated`/`snippet` when present |
| **No insertion-time dedup** | `:794-814` | the production Evidence Set **retains duplicates**; the function has no `seen` set |
| Candidate URL syntax | `:634-643` | `contract.optionalHttpsUrl` → `MISSING_SOURCE_URL` / `INVALID_SOURCE_URL` |
| **Binding** | `resolveGrounded` `:820` | first entry with equal `.normalized` wins; **miss ⇒ `INVALID_SOURCE_URL`** (`:646`) |
| Persisted | `:753-769` | `sourceUrl = grounded.raw`, `normalizedSourceUrl`, `sourceDomain`. **No index, no kind, no evidence id** |
| Core | `core.js:84 ITEM_FIELDS`, `projectItemRecord :117` | record built field-by-field from a 17-name list; **unknown fields are silently dropped, never rejected** |

### B.2 · Answers to the Owner's current-state questions

- **Indexing today:** positional only, implicit in array order. No entry carries an identifier.
- **Acceptance:** normalized-URL equality; three transforms only (lowercased host, fragment
  dropped, default port omitted). Two different paths or query strings are never equivalent.
- **Comparison site:** exactly one — `resolveGrounded` `:820`, called once at `:644`.
- **Identity explicit or inferred?** **Inferred, and then discarded.** The match is computed and the
  matched entry is used for three fields, but which entry it was is never recorded.
- **Q-3 / `INVALID_SOURCE_URL`:** emitted from **two distinct sites under one reason string** —
  `:641` malformed syntax, `:646` grounding miss. Production telemetry cannot tell them apart; only
  A1's replay attribution can.
- **Fallback allowing another result's evidence to satisfy a candidate?** **No cross-URL fallback
  exists** — a URL must match exactly after normalization. **But** the Evidence Set is the whole
  response's union, so a URL retrieved for an unrelated reason satisfies any candidate that cites
  it. That is the real hole, and it is a *scope* hole, not a fallback bug.
- **Six retained metadata fields** (`id`, `title`, `date`, `lastUpdated`, `snippet`, `evidenceKind`)
  are **read by no decision anywhere** — the provider comment says so and the code confirms it.

### B.3 · Corpus measurements — 9 cases, 421 evidence entries, 37 surviving items

| Measurement | Result |
|---|---|
| Duplicate normalized URLs in the production Evidence Set | **47 duplicate groups, present in all 9 cases** |
| Duplicate groups spanning more than one `evidenceKind` | **10** |
| Duplicate groups whose **raw** strings differ | **0** — normalization is not currently collapsing distinct raws |
| Surviving items bound to a `search_result` entry | **37 of 37** |
| Bound to `fetch_url_result` | **0** |
| Bound to `url_citation` | **0** |
| `url_citation` annotations present anywhere in the corpus | **0, across all nine runs** |
| `fetch_url_result` URLs not also present in `search_results` | **0 of 10** |
| Cases where ≥2 surviving items bind the **same** evidence entry | **6 groups across 4 cases** |
| Corpus skip reasons | `INVALID_SOURCE_URL` ×4 · `DUPLICATE_IN_BATCH` ×3 |

**Three consequences that change the design:**

1. **First-occurrence-wins makes `search_results` the de-facto sole binding source.** Because search
   results are traversed first and every fetched URL in the corpus was also a search result, the
   system has **never once** bound to a `fetch_url_result`. The entry the system binds to is the
   **search snippet**, not the **fetched page content** — the weaker of the two for any future
   support check. This is a live consequence of the ordering rule, not a hypothetical.
2. **`url_citation` is entirely unexercised.** Zero annotations in nine runs. **Any contract clause
   about `url_citation` is written on shape, not evidence, and cannot be validated against the real
   corpus** — see §F for how that is handled without a new live capture.
3. **One evidence entry legitimately backs several distinct catalysts.** `p4-2307-NVDA` has one
   press-release URL backing an `earnings_event` catalyst, a `guidance_update` catalyst and an
   `upcoming_event`. **A naive "one entry ⇒ one catalyst" rule would destroy correct data.** Any
   multi-binding rule must be observational in A2.

> **Also observed, and deliberately not acted on:** `p4-2312-FROG` binds **two distinct catalysts**
> to `https://investors.jfrog.com/news/default.aspx` — a hub page that **survived H-B's generic-URL
> rejection**. This is the A5 hub-identity problem, live in the corpus. **A2 surfaces it and stops**
> (§I).

---

## C · Deterministic contract

### C.1 · Canonical evidence identity

**`evidenceIndex`** — the zero-based position of the entry in the Evidence Set **exactly as
`adaptAgentResponse` constructs it in production**: the existing fixed traversal order, **with
duplicate entries preserved**, because production performs no insertion-time dedup
(`appendEvidenceEntry:794` has no `seen` set). A1 proves the traversal is deterministic for a frozen
envelope.

> **The definition is normative and singular.** There is exactly one Evidence Set — production's.
> Any reconstruction anywhere is a *check against* it, never an alternative definition of it.

**Is URL alone sufficient? No.** The corpus has duplicate normalized URLs in **every** case, 10 of
them spanning kinds. URL alone names a *set* of entries; index names *one*. **The binding record is
the pair `{evidenceIndex, evidenceKind}`**, with `normalizedSourceUrl` retained as the redundant
check that must agree.

`evidenceIndex` is a **within-run** identifier. It is meaningless across runs and **must never enter
the identity tuple** (§C.9).

### C.2 · Duplicate URLs, and the defect this revision corrects

**Rule: first occurrence in the existing traversal order wins — unchanged — and the index of that
occurrence is recorded.** A2 does not re-rank, does not prefer `fetch_url_result` over
`search_result`, and does not merge duplicate entries. **D-A2-3 approved: traversal order is not
changed in A2.**

**The defect.** Production preserves duplicates; A1's replay reconstruction
(`news_catalysts_replay_offline.js:88`) **deduplicates at insertion** via a `seenNormalized` set.
That was harmless while the reconstruction was used only for URL *membership* — membership is
dedup-invariant. It is **not** harmless once `evidenceIndex` is canonical: every duplicate dropped
before a given entry shifts that entry's index.

**Measured, not assumed. Across the corpus's 37 surviving items:**

| | |
|---|---|
| Items whose deduplicated index **equals** the production index | **33** |
| Items whose deduplicated index **diverges** | **4** |

| Case | URL | production idx | deduplicated idx |
|---|---|---|---|
| `p4-2307-MRNA` | `fda.gov/media/194510/download` | **35** | 34 |
| `p4-2312-NVDA` | `nvidianews…/aws-and-nvidia-to-deliver` | **50** | 38 |
| `p4-2312-NVDA` | `nvidianews…/nvidia-expands-ai-infrast` | **32** | 28 |
| `p4-2312-MRNA` | `sec.gov/Archives/edgar/data/1682852/…` | **45** | 41 |

**Had A2 shipped against the deduplicated reconstruction, roughly one binding in nine would have
been recorded against the wrong evidence entry — and the suite would have passed.** The correction
is §D.2.

**Does "first occurrence wins" remain valid? Yes**, and it is now *provable* rather than assumed:
§C.9's sidecar lets the suite compare the production index directly instead of inferring it. The
§B.3.1 caveat stands — the richer fetched entry is never the binding one — recorded as a finding for
A3, not acted on here.

### C.3 · URL not present in the Evidence Set

**Unchanged: reject.** The candidate is skipped. **A2 does not change which candidates survive.**

**One change is proposed, and it is a telemetry change only:** split the overloaded
`INVALID_SOURCE_URL` into its two real sites, so production can distinguish malformed syntax from a
grounding miss without replay. This is Owner decision **D-A2-2** (§J) because it adds a
`SKIP_REASONS` member (12 → 13) and skip reasons are a frozen vocabulary.

### C.4 · URL exists but the evidence does not correspond to the candidate

**A2 does not decide this, and must not claim to.** No deterministic rule available at this layer
distinguishes "this search result is about this event" from "this search result is about something
else on the same site". A2 records the binding so that a future rule — or a human — can adjudicate
it against an exact entry instead of a URL union. **Deferred, not solved.**

### C.5 · Treatment of the three sources

| Source | A2 treatment |
|---|---|
| `search_results` | binds; `evidenceKind: 'search_result'` recorded |
| `fetch_url_results` | binds; `evidenceKind: 'fetch_url_result'` recorded. **Never observed as a binding source** — reachable only when a fetched URL was not also searched |
| `url_citation` | binds; `evidenceKind: 'url_citation'` recorded. **Zero occurrences in the corpus** |

**A2 changes none of the three.** It records which one bound. The `url_citation` circularity concern
— a model-emitted annotation being accepted as retrieval grounding — is **raised as a risk (§J
R-2), not fixed**, because there is no evidence to validate a rule against and because rejecting it
would be a survival-behaviour change.

### C.6 · Metadata that stays internal and inert

`id`, `title`, `date`, `lastUpdated`, `snippet` remain **retained and read by nothing**. A2 adds
**no** new read of any of them. In particular **`date` is not read** — that is A3, and touching it
here would silently absorb A3's scope.

### C.7 · Fail-closed behaviour

1. **Binding resolution fails ⇒ candidate is skipped.** Unchanged.
2. **Binding record cannot be constructed for a surviving item ⇒ the whole envelope fails.** If
   `resolveGrounded` returned an entry, its index is by construction known; an inability to record
   it means the traversal and the resolver have diverged, which is a correctness failure, not a
   data-quality one. **Fail the envelope — never emit an item with an absent or placeholder
   binding.**
3. **No partial binding.** A binding record is `{evidenceIndex, evidenceKind}` or the item does not
   exist.
4. **Invariant:** for every surviving item, `evidenceSet[evidenceIndex].normalized ===
   item.normalizedSourceUrl` and `evidenceSet[evidenceIndex].raw === item.sourceUrl`.

### C.8 · Sidecar mapping contract

The binding lives **beside** the items, never on them (D-A2-1: observability only).

**Shape** — on the provider envelope, one new key:

```js
evidenceBindings: [ { itemIndex, evidenceIndex, evidenceKind, normalizedSourceUrl } ],
evidenceSetSize:  <integer>   // production Evidence Set length, duplicates included
```

**Cardinality — exact, not "at least".**

- `evidenceBindings.length === items.length`, always.
- **Exactly one** binding per surviving item. Never zero, never two.
- **No binding is ever emitted for a skipped candidate.** `skippedItems` entries keep their existing
  `{reason}` shape, untouched.
- Multi-binding — several items sharing one `evidenceIndex` — is **valid and expected** (6 groups in
  the corpus). The uniqueness constraint is on `itemIndex`, never on `evidenceIndex`.

**Ordering — positional *and* explicitly labelled.**

- `evidenceBindings[i]` describes `items[i]`. Both arrays are appended in the same iteration of the
  single forward pass, so position alone is sufficient today.
- `itemIndex` is nonetheless carried **explicitly and redundantly**, so the mapping is *asserted*
  rather than *assumed*. A future change that reorders either array then fails loudly instead of
  silently re-pairing catalysts with the wrong evidence.
- `itemIndex` values are `0…items.length-1`, strictly ascending, no gaps, no repeats.

**Failure behaviour — fail closed, whole-envelope.**

- If a binding record cannot be constructed for an item about to be pushed, **the entire envelope
  fails** (`ok: false`). By construction this is unreachable — `resolveGrounded` returned the entry,
  so its index is known — so reaching it means the traversal and the resolver have diverged, which
  is a correctness fault, not a data-quality one.
- **Never** emit an item with an absent, `null`, `-1` or placeholder binding.
- **Never** emit a partial `evidenceBindings` array.
- Any mismatch between a binding and its item (`normalizedSourceUrl` disagreeing, `itemIndex` out of
  range) is the same whole-envelope failure.

**Reach — proven, not assumed.** The sidecar cannot affect persistence: core builds stored bytes
only from `projectItemRecord` (17 named fields + 2) and `indexRecord` (6 named fields), and
**`core.js` never stringifies an envelope wholesale** — verified at `9327e47`. `validateProviderResult`
checks named envelope fields and rejects no extras.

### C.9 · Identity is not touched

`evidenceIndex` **must not** enter the identity tuple. It is run-scoped and retrieval-ordering
dependent; admitting it would make `identityHash` unstable across runs for the same real event and
would invalidate every stored record. **`IDENTITY_SCHEMA_VERSION` does not change. No stored
`identityHash` changes.**

---

## D · Implementation scope

**D-A2-1 approved: observability only, zero survival-behaviour change.**

```
netlify/functions/lib/news-catalysts-provider.js    binding record construction + envelope sidecar
qa/news_catalysts_replay_offline.js                 reconstruction correction + new invariants
```

### D.2 · Replay reconstruction correction — required, and the reason it is safe

**Change:** in `reconstructEvidenceSet` (`:88`), **remove the `seenNormalized` dedup** so the
reconstruction has production's entry order *and* cardinality. `appendEvidenceEntry`'s `seen`
parameter and the `if (seen.has(...)) return;` guard go; nothing else in the traversal changes.

**Why this does not weaken any existing A1 guarantee.** The deduplicated set is consumed in exactly
three places, all through `evidenceSetHasUrl` (`:124`), which is `.some(e => e.normalized === …)`:

| Consumer | Use | Dedup-sensitive? |
|---|---|---|
| R-7 `:420` | survivor URL ∈ reconstruction | **No** — membership |
| R-7 `:429` | Q-3 URL ∉ reconstruction | **No** — membership |
| R-10 `:503` | Q-1 matched URL ∈ reconstruction | **No** — membership |

**Membership is dedup-invariant: removing duplicates never adds or removes a distinct URL.** So
R-7 and R-10 evaluate identically before and after. Crucially, `attributeCandidates` does **not**
consume the Evidence Set at all — it zips candidates against `items`/`skippedItems` and applies a
syntax-only check — so **no attribution output, and therefore no SNAPSHOT in R-5 or R-9, can move.**

**Preferred over the alternative.** A second, parallel reconstruction was considered and rejected:
two near-identical traversals invite exactly the drift that caused this defect. **One reconstruction,
production-equivalent, is the smaller and safer change.**

**And it stops being an assumption.** A1 had to carry the reconstruction as a *declared duplication*
checked only behaviourally. With §C.9's `evidenceSetSize` on the envelope, **B-11 proves the
reconstruction's cardinality equals production's** — the duplication becomes verified rather than
declared. That is a strengthening, not a weakening.

### D.3 · Why no core change and no fixture regeneration

Two verified properties:

- **Core drops unknown fields.** `projectItemRecord` (`core.js:117`) builds the record from the
  17-name `ITEM_FIELDS` list; `validateProviderResult` never rejects extra keys. **So nothing added
  to the provider result can reach persistence or break core** — the 17-field freeze holds
  untouched.
- **Fixtures need not change if the binding is exposed beside the items, not on them.** The A1
  fixtures pin `expected.items` exactly. Adding a key *to an item* would invalidate all nine
  fixtures and their nine `fixtureSha256` values in `index.json`. **Exposing the binding as a
  separate, parallel structure on the provider result — and asserting it as a derived INVARIANT
  rather than a pinned SNAPSHOT — leaves all nine fixture files byte-identical.**

**Suite count: 44 → 44.** No new suite; A1's replay suite is the correct host.

If D-A2-2 (skip-reason split) is approved, scope gains `SKIP_REASONS` and its core re-export plus
the provider suite's reason assertions — **a materially larger change**, which is why it is a
separate decision and not bundled.

---

## E · QA scope

All offline, all deterministic, all in `qa/news_catalysts_replay_offline.js` alongside R-1…R-10.

| ID | Class | Assertion |
|---|---|---|
| **B-1** | INVARIANT | **cardinality:** `evidenceBindings.length === items.length`, every case; `itemIndex` values are `0…n-1`, ascending, no gaps, no repeats |
| **B-2** | INVARIANT | `evidenceSet[evidenceIndex].normalized === item.normalizedSourceUrl` **and** `.raw === item.sourceUrl`, every item, every case |
| **B-3** | INVARIANT | `evidenceKind` is one of the three literals **and equals the kind of the entry at that exact index** — not merely a kind that appears somewhere for that URL |
| **B-4** | INVARIANT | `evidenceIndex` is the **first** index in the **duplicate-preserving** reconstruction whose normalized matches — independently re-derived, proving first-occurrence-wins is what actually happened |
| **B-5** | INVARIANT | replaying a case twice yields identical binding records (extends R-1's determinism to bindings) |
| **B-6** | INVARIANT | **no item survives without a binding**; no `skippedItems` entry carries one; `skippedItems` keeps its `{reason}`-only shape |
| **B-7** | SYNTHETIC | same URL in `search_results` and `fetch_url_results` binds to the **search_results** index, `evidenceKind: 'search_result'` — pins the ordering rule against a case the real corpus cannot produce |
| **B-8** | SYNTHETIC | an envelope whose only occurrence of the URL is a `url_citation` binds with `evidenceKind: 'url_citation'` — **documents** current behaviour, does not endorse it (§J R-2) |
| **B-9** | OBSERVATION | multi-binding is counted and reported, **never a failure** — the corpus's 6 legitimate groups must keep passing |
| **B-10** | INVARIANT | **the duplicate-divergence acceptance test.** For each of the four items in §C.2's table, assert the recorded `evidenceIndex` equals the **production** value (35 / 50 / 32 / 45) and **not** the deduplicated value (34 / 38 / 28 / 41). This test fails against the pre-correction reconstruction — that is its purpose |
| **B-11** | INVARIANT | `evidenceSetSize` from the envelope **equals the reconstruction's entry count**, every case — retires A1's declared-duplication assumption |

**Synthetic fixtures are precedented, not novel:** R-6 already uses a synthetic valid-but-unretrieved
case. B-7 and B-8 follow that precedent and must be labelled synthetic, never mixed into the nine
captured cases, and never given `captureSha256` provenance.

**No new live-provider capture is required or permitted.** §F explains why, including for the one
branch the corpus provably cannot exercise.

---

## F · Replay cases used

**All nine existing fixtures**, for B-1…B-6 and B-9. No new capture.

| Need | Covered by |
|---|---|
| **Duplicate URL shifting the index (B-10)** | **`p4-2307-MRNA`, `p4-2312-NVDA` ×2, `p4-2312-MRNA`** — the four measured divergences |
| Duplicate URLs within one Evidence Set | **all 9 cases** (47 groups) |
| Duplicates spanning kinds | 10 groups, chiefly `p3-NVDA`, `p3-FROG`, `p4-2307-NVDA` |
| Multi-binding (one entry, several catalysts) | `p3-FROG` ×2, `p3-MRNA`, `p4-2307-NVDA` ×2, `p4-2312-FROG` |
| Grounding miss / Q-3 | `p3-NVDA` (3 unretrieved `nvidianews.nvidia.com` candidates) |
| Hub URL binding two catalysts | `p4-2312-FROG` — observed, **not acted on** (A5) |

**Provably insufficient for exactly one thing: `url_citation` binding — zero occurrences in nine
runs.** The correct response is **not** another live capture: url_citation emission is not
controllable by the caller, so a further capture has no guaranteed yield and would burn API cost on
a coin flip. **B-8's synthetic envelope covers the branch deterministically.** That is the boundary
condition the Owner's "unless provably insufficient" clause is for, and it resolves to *synthetic
fixture*, not *new capture*.

---

## G · Acceptance criteria

1. Every surviving item across all nine cases carries a binding satisfying **B-1…B-6, B-10, B-11**.
   **B-10 is the load-bearing correctness criterion**: the four known divergent items must record
   the production index, not the deduplicated one.
2. **`expected.items` and `expected.skippedItems` are byte-identical to the current fixtures for all
   nine cases** — proving zero survival-behaviour change. This is the load-bearing criterion.
3. All nine fixture files and their `fixtureSha256` values in `index.json` are **unchanged**.
4. R-1…R-10 pass unmodified.
5. `npm run qa:offline` PASS at **44**.
6. No `identityHash` in any fixture changes; `IDENTITY_SCHEMA_VERSION` unchanged.
7. No core file changes; the 17-field contract is untouched.

**Deliberately absent:** any criterion of the form "Q-3 rate falls" or "fewer unsupported catalysts
survive". A2 changes no survival outcome, so such a criterion would be false — and, per §L, it would
also be unverifiable by the closing actor.

---

## H · STOP conditions

1. Any file beyond the two in §D (or the four, if D-A2-2 is approved).
2. **Any change to which candidates survive** — any difference in `expected.items` or
   `expected.skippedItems` for any of the nine cases.
3. Any change to any fixture file or any `fixtureSha256`.
4. Any change to the identity tuple, `IDENTITY_SCHEMA_VERSION`, or any `identityHash`.
5. Any change to `ITEM_FIELDS`, `projectItemRecord`, or the 17-field contract.
6. Any new **read** of `date`, `lastUpdated`, `title`, `snippet` or `id` (that is A3).
7. Any change to Evidence Set **traversal order** or to first-occurrence-wins (D-A2-3).
7a. Any change to `reconstructEvidenceSet` beyond removing the `seenNormalized` dedup — the
    traversal, the URL acceptance rule and the entry fields stay as they are.
7b. Any second/parallel Evidence Set reconstruction. **One reconstruction only.**
7c. Any `evidenceIndex` derived from a deduplicated set, or any binding asserted without B-10.
8. Any rejection rule based on multi-binding, hub URLs or cross-URL similarity (A5 / A6).
9. Any `SKIP_REASONS` change without D-A2-2 approved.
10. Any live provider call; any new captured fixture.
11. Suite count anything other than 44.
12. Any persistence, Netlify, env, scoring or production change.

---

## I · Out of scope — with the interaction named

| Task | Boundary | Real interaction, surfaced not absorbed |
|---|---|---|
| **A3** date provenance | A2 adds no read of `date` | A2 makes the entry that *carries* the date exactly addressable — **A3 becomes cheaper, and is not started here** |
| **A4** multi-stage date enforcement | untouched | depends on A3 |
| **A5** hub / shared source identity | untouched | **`p4-2312-FROG` proves the hub case is live and survives H-B.** A2 makes it *countable*; A5 must decide it |
| **A6** DR-25 cross-URL dedup | untouched | A2's multi-binding counts are an input to A6's measurement |
| **A7** materiality | untouched | none |

**No prerequisite from A3–A7 blocks A2.** A2 is deliberately the one Track-A task that changes no
outcome, so it has no upstream dependency.

---

## J · Risks and open questions

**Owner decisions — all three RULED 2026-09-22, no decision remains open:**

| ID | Decision | Ruling |
|---|---|---|
| **D-A2-1** | Scope shape | **APPROVED — observability only.** No evidence reference on the 17-field public item |
| **D-A2-2** | Split `INVALID_SOURCE_URL` (12 → 13 `SKIP_REASONS`) | **APPROVED — deferred to its own slice.** Not in A2 |
| **D-A2-3** | Reorder traversal so `fetch_url_result` outranks `search_result` | **APPROVED — do not reorder.** First-occurrence-wins retained unchanged |
| — | Substantiation boundary | **APPROVED.** A2 records and audits exact binding; it does **not** claim deterministic proof of semantic support |

**Risks:**

- **R-1 · Overclaim.** The largest risk is A2 being *understood* as "catalysts are now verified
  against supporting evidence". It is not. It makes the binding exact and auditable. §A states this;
  the Worker must not soften it in `review.md`.
- **R-2 · `url_citation` circularity.** A `url_citation` annotation is emitted alongside the model's
  own text. If a URL appears **only** there, the model is effectively grounding itself. Corpus
  exposure is **zero of 421 entries**, so this is latent, not active. **Flagged; not fixed in A2**
  — a fix is a survival-behaviour change and belongs with A5 or its own slice.
- **R-3 · Snapshot drift.** If the Worker records bindings as pinned SNAPSHOT data in the fixtures
  rather than derived invariants, all nine fixtures and their hashes change and acceptance criterion
  3 fails. **The design in §D exists specifically to avoid this.**
- **R-6 · Reconstruction divergence — the defect this revision fixes, generalised.** A1's
  reconstruction silently disagreed with production on cardinality for months because nothing
  compared them; the disagreement was invisible while only membership was consumed, and would have
  produced four wrong bindings the moment index became canonical. **B-11 exists so the next
  divergence fails a test instead of shipping.** The lesson is the rule in STOP 7b: one
  reconstruction, proven equal, never two assumed equal.
- **R-4 · Silent A3 absorption.** The binding record makes `date` trivially reachable. STOP
  condition 6 exists because that temptation is real and one line wide.
- **R-5 · Parallel-lane suite count.** A2 keeps 44. Any task landing a suite concurrently must
  re-baseline; A2 will not.

---

## K · Actor-to-Evidence Closure Check

| closeCondition requirement | Required evidence | Producing phase | Responsible actor | Required authority | Can the closing actor possess/verify it before CLOSE? |
|---|---|---|---|---|---|
| B-1…B-6 invariants hold | replay suite output | implementation | **Worker** | none (offline, no key) | **YES** — deterministic, no network, no credential |
| B-7/B-8 synthetic branches | suite output | implementation | Worker | none | **YES** |
| Zero survival change (AC-2) | byte-comparison of `expected.items` / `skippedItems` vs the nine committed fixtures | implementation | Worker | read of tracked fixtures | **YES** — the baseline is already committed at `9327e47` |
| Fixture hashes unchanged (AC-3) | `fixtureSha256` comparison against `index.json` | implementation | Worker | read | **YES** — self-contained in-repo |
| R-1…R-10 unaffected | full suite run | implementation | Worker | none | **YES** |
| `qa:offline` PASS at 44 | full gate run | pre-LAND | Worker | none | **YES** |
| Diff is minimal and in scope | reviewed diff | review | **Codex / Owner** | review authority | **NO — not the Worker's to produce** |
| LAND | Owner approval | LAND gate | **Owner** | LAND authority | **NO — by design** |

**Closure verdict: SATISFIABLE.** Every piece of evidence the Worker must possess to reach
CODE-READY is producible offline, in-repo, with no credential, no live call, and no other actor's
prior action. The two rows the Worker cannot produce — diff review and LAND — are **gates after
CODE-READY**, not closeConditions of it, and the lifecycle explicitly sequences them that way.

**The criterion that would have broken closure**, had it been written into §G: any acceptance
statement requiring a *live* run or a production telemetry delta (e.g. "Q-3 rate falls"). That
evidence only exists after an Owner-authorised live call, which the Worker cannot perform and cannot
wait on inside this task. §G is scoped specifically to exclude it.

---

## L · Lifecycle / CLOSE satisfiability

**Is CLOSE reachable?** Yes. Path: brief approval → worktree from `9327e47` → provider binding
construction → replay suite assertions → `qa:offline` at 44 → fixture-identity check → diff review →
Owner LAND. No step requires an artifact produced outside the lane.

**Is CLOSE satisfiable by the closing actor?** Yes, per §K. The Worker holds every closeCondition
evidence item at the moment it declares CODE-READY.

**Any evidence available only after another actor acts?** **No.** A2 was deliberately scoped so the
answer is no — it is the one Track-A task with no production-behaviour change, therefore no
live-validation dependency. Had D-A2-2 (skip-reason split) been bundled, the answer would still be
no, but the diff would grow into `SKIP_REASONS`, the core re-export and the provider suite, and the
zero-behaviour-change acceptance criterion (AC-2) would no longer hold — which is the substantive
reason to keep it separate, beyond mere scope hygiene.

**Resumption after another actor:** not required. No CLOSE condition is deferred past a gate.

---

## M · Recommended execution sequence

1. Worktree from `9327e47`. Confirm `qa:offline` **PASS at 44** before any edit.
2. **Reconstruction correction first** (§D.2): remove `seenNormalized` from
   `reconstructEvidenceSet`. Run the replay suite **before writing any binding code** and confirm
   **R-1…R-10 still pass and no `fixtureSha256` moved.** This isolates the correction from the
   feature — if anything moves here, the dedup-invariance argument was wrong and the task STOPs
   with a clean bisect.
3. Provider: construct the binding at the single existing resolution site (`:644`); expose
   `evidenceBindings` + `evidenceSetSize` on the envelope — **beside the items, never on them**. No
   other provider change.
4. Add **B-1…B-6, B-11** as derived INVARIANTs. Run. **Confirm all nine `fixtureSha256` values are
   unchanged** — if any moved, STOP; the binding leaked into the items.
5. Add **B-10** last, and **verify it fails when run against the pre-correction reconstruction** —
   a test that cannot fail proves nothing.
6. Add **B-7 / B-8** synthetic envelopes, clearly labelled, outside the nine captured cases; then
   **B-9** multi-binding observation, confirming the 6 known groups report and **none fails**.
7. Full `qa:offline` at 44. Byte-compare `expected.items` / `skippedItems` for all nine cases
   against `9327e47`.
8. `review.md`: `## Lessons`, the two-row "Files changed" block, the final-check line, and an
   explicit statement that **no survival outcome changed and no evidence-support claim is made**.
9. Diff review → Owner LAND.

**Deferred to their own slices, in this order:** D-A2-2 skip-reason split (highest production value)
→ A3 date provenance (now cheap, given exact binding) → A5 hub identity (corpus-proven live) → A6.
