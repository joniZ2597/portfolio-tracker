# D-S3-1 — Catalyst evidence READER CONTRACT (frozen)

**Frozen 2026-09-24 against `branch-dev` = `aa62aea`.**

This contract has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

**Authority.** The persisted record as constructed by `news-catalysts-core.js` —
`ITEM_FIELDS` (`:84-89`) and `projectItemRecord` (`:117-125`) — and validated by
`validateProviderResult` (`:317+`). Where this document and the repository disagree, **the
repository is right and this document is stale and must be re-frozen.**

**Scope.** This is a *reader* contract. It governs what a consumer of stored catalyst evidence may
rely on. It confers no write rights and describes no write behaviour.

**Lifetime.** D-S3-1 outlives any single slice. S3-M1, S3-M2 and S3-M3 all verify conformance
against this file.

---

## 1 · Reader-visible fields — 17 + 2, in persisted order

| # | Field | Semantics | Nullable / absent |
|---|---|---|---|
| 1 | `ticker` | uppercase symbol; equals the requested ticker | never null |
| 2 | `eventDate` | `YYYY-MM-DD`; source-asserted date of the event | never null |
| 3 | `category` | one of **7**: `earnings_event` · `guidance_update` · `analyst_action` · `corporate_action` · `product_customer_partnership` · `regulatory_legal` · `other_catalyst` | never null |
| 4 | `direction` | `positive` \| `neutral` \| `negative` **iff** `eventType === 'catalyst'`; **exactly `null`** iff `eventType === 'upcoming_event'` | **conditionally null by contract** |
| 5 | `sourceUrl` | the grounded evidence entry's own raw https URL — **never the model's claimed string** | never null |
| 6 | `normalizedSourceUrl` | host lowercased · fragment dropped · scheme-default port omitted | never null |
| 7 | `sourceDomain` | hostname of the normalized URL | never null, never empty |
| 8 | `provider` | literal `j3-news-catalysts@job-model-v1` | constant |
| 9 | `retrievedAt` | the injected clock instant of the fetch (`envelope.fetchedAt`) | never null |
| 10 | `identityHash` | `/^[a-f0-9]{64}$/` over the 9-member `j3-identity-v2` tuple | never null |
| 11 | `provenance` | literal `retrieval_unverified` | constant |
| 12 | `confidence` | **exactly `null`** — reserved, never populated in v1 | always null |
| 13 | `requiresVerification` | **exactly `true`** | constant |
| 14 | `scoringImpact` | **exactly `'none'`** | constant |
| 15 | `eventType` | `catalyst` \| `upcoming_event` | never null |
| 16 | `relevanceScope` | `company` \| `sector` \| `market` | never null |
| 17 | `subType` | non-empty trimmed string **iff** `category === 'other_catalyst'`; **exactly `null`** otherwise | **conditionally null by contract** |
| 18 | `sourceTier` | literal `perplexity_retrieval` | constant |
| 19 | `contractVersion` | literal `news-contract-v1` | constant |

**Absent is not null.** All 19 keys are always constructed. A reader encountering an **absent** key
is looking at a malformed or foreign record and **must treat it as unreadable**, never as null.

**`contractVersion` is checked first.** A reader must verify `contractVersion === 'news-contract-v1'`
before interpreting any other field, and must treat a mismatch as unreadable rather than attempting
a best-effort parse. `sourceTier` may be displayed or filtered on; it never relaxes validation.

---

## 2 · Carve-outs

| # | Carve-out |
|---|---|
| **C-1** | **`subType` VALUES may change under S2-M3 (A7a)** — the vocabulary is being closed. **A reader must never switch on `subType` string equality** and must render it as opaque text. The field's position, presence and conditional-null rule are frozen; its values are not |
| **C-2** | **A3b / S2-M4 REOPENS this contract.** If S2-M4 lands and changes the persisted shape, D-S3-1 must be re-frozen and every S3 slice re-verified against the new freeze |

---

## 3 · What does NOT reopen this contract

| Slice | Why |
|---|---|
| **S2-M1** (D-A2-2, skip-reason resolution) | touches `skippedItems`, which core **never persists** (`news-catalysts-core.js:315`); no persisted field is added, removed or changed |
| **S2-M2** (A3a, date provenance observability) | observability-only; no persisted field added or changed |
| **S2-M3** (A7a, materiality & vocabulary determinism) | **does not reopen the STRUCTURAL contract.** Field set, order, types and conditional-null rules are unchanged; only `subType` values move, which C-1 already governs |

---

## 4 · Outside this contract

**`skippedItems` are not reader-visible and are outside D-S3-1 entirely.** They are never persisted,
never returned by a read surface, and never rendered. A reader must not infer their existence, count
or reasons.

Also outside: `evidenceBindings` · `evidenceSetSize` · any envelope internal · any raw provider
response · the Evidence Set itself.

---

## 5 · Ticker-agnostic

**No ticker-specific behaviour at any layer.** No per-symbol branch, no hard-coded symbol, no
symbol-conditional field semantics. A configured shared allowlist is an access control, not a
behavioural branch.

---

## 6 · Conformance

A record conforms when all 19 keys are present, `contractVersion` matches, every constant field
holds its literal value, and both conditional-null rules (fields 4 and 17) hold. **A non-conforming
record is omitted and counted — never partially returned, never repaired.**
