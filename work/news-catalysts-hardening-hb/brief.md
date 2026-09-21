# Task brief: news-catalysts S1.5.1 hardening — H-B (deterministic slice)

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Only then may implementation begin, per `AGENTS.md`
"Task folder convention".

Source of truth: `.ai-reports/status/s151-pilot-hardening.PREP.local.md` (revision 2), the H-A
brief (`work/news-catalysts-hardening-ha/brief.md`), the Owner-approved H-B dependency sweep, and
the Owner's H-B ruling correcting mechanism 3 and the skip-reason plan (this session). Owner
rulings applied: **DR-20 · DR-21a (deterministic half)**. **DR-25 is explicitly NOT implemented in
this slice — deferred to S2, see §5.** DR-28 is permissive, not exercised (see §6).

## Baseline

| | |
|---|---|
| Local `branch-dev` / HEAD | **`0b04280`** — H-A prompt-only slice, committed locally, **not pushed** |
| Remote `origin/branch-dev` | **`d9395ea`** — `branch-dev` is ahead of `origin/branch-dev` by 2 commits |
| `origin/main` | `fbec2c1` |
| Provider suite | 41 tests (NP01–NP41, H-A landed) |
| Core suite | 30 tests, untouched by H-A, used here as **regression validation only** |

## Objective

Add two deterministic, non-semantic mechanisms to `normalizeNewsResponse`'s Tier-C ladder:
generic/container source-URL rejection and future-dated-catalyst rejection. No dedup mechanism of
any kind is implemented in this slice.

## Implementation scope — exactly two candidate files

```
netlify/functions/lib/news-catalysts-provider.js   modify   Tier-C ladder only
qa/news_catalysts_provider_offline.js              modify   new NP tests
```

`qa/news_catalysts_core_offline.js` and `netlify/functions/lib/news-catalysts-core.js` are **not**
in scope. The dependency sweep found no production or QA reason to touch either — core.js never
reads `skippedItems` or the skip-reason vocabulary, and no core fixture collides with either
mechanism once future-date rejection is `eventType`-scoped (see §7, NW28/NW29).

---

## 1 · Current pipeline order (verified at HEAD `0b04280`, not assumed)

`normalizeNewsResponse` (`netlify/functions/lib/news-catalysts-provider.js:532`):

1. `adaptAgentResponse` → Tier-B conditions 1+6, produces `content` + `evidenceSet` (`grounding`).
2. `JSON.parse(content)` → Tier-B condition 2.
3. `isObject(parsed)` → Tier-B condition 3.
4. `Array.isArray(parsed.items)` → Tier-B condition 4.
5. unknown top-level key → Tier-B condition 7.
6. each `items[]` element `isObject` → Tier-B condition 5.
7. **Tier-C ladder, per item, in this exact existing order** (`:593`–`:716`):
   1. `eventDate` (`contract.optionalDate`) → `MISSING_EVENT_DATE` / `INVALID_EVENT_DATE`
   2. `sourceUrl` syntax (`contract.optionalHttpsUrl`) → `MISSING_SOURCE_URL` / `INVALID_SOURCE_URL`
   3. grounding correlation (`resolveGrounded`) → `INVALID_SOURCE_URL` if ungrounded
   4. `category` vocabulary → `UNKNOWN_CATEGORY`
   5. `eventType` vocabulary → `UNKNOWN_EVENT_TYPE`
   6. `direction`, conditional on `eventType` (A-1) → `INVALID_DIRECTION`
   7. `relevanceScope` vocabulary → `INVALID_RELEVANCE_SCOPE`
   8. `subType` conditionality (D-S15-C) → `INVALID_SUB_TYPE`
   9. identity tuple construction + `sha256Hex` (`:674`–`:685`) — **frozen, not touched by H-B**
   10. exact-tuple duplicate check via `seenHashes` → `DUPLICATE_IN_BATCH`
   11. projection → `items.push(...)`

`ctx.retrievedAt` (passed into `normalizeNewsResponse` as `{ ticker, retrievedAt }`, `:534`–`:535`)
**is** the same injected `nowIso` clock `buildRequestBody` uses for its date anchor (`getNewsCatalysts`
passes `{ ticker: ticker, retrievedAt: nowIso }` at `:209`). No new clock or env read is needed —
`ctx.retrievedAt.slice(0, 10)` is the existing deterministic date anchor.

## 2 · Proposed insertion points

```
1  eventDate                                    (unchanged)
2  sourceUrl syntax                             (unchanged)
3  grounding correlation (resolveGrounded)       (unchanged)
3a ── NEW: generic/container source-URL check ── (after 3, before category)
4  category                                     (unchanged)
5  eventType                                     (unchanged)
5a ── NEW: future-dated-catalyst check ────────── (after 5, before direction — eventType is
                                                    already known-valid; direction's own branch
                                                    already switches on eventType === 'catalyst',
                                                    so this reuses that same fact one step earlier)
6  direction                                     (unchanged)
7  relevanceScope                                (unchanged)
8  subType                                       (unchanged)
9  identity tuple + hash                         (unchanged — frozen)
10 exact-tuple DUPLICATE_IN_BATCH                (unchanged)
11 projection                                    (unchanged)
```

Rationale:
- **3a** sits right after `grounded` exists (mechanism 1 needs the resolved URL's own shape, not
  the model's raw claim) and before any taxonomy check, matching the existing convention that
  source-quality gates run before category/type/direction gates.
- **5a** sits right after `eventType` is confirmed to be exactly `'catalyst'` or `'upcoming_event'`
  — reusing the same `raw.eventType === 'catalyst'` test the very next line (direction, step 6)
  already performs, so no new eventType read is introduced, only reordered by one step.
- No step 9a exists. Identity (step 9) and the exact-tuple duplicate check (step 10) are completely
  unchanged from H-A/pre-H-A behavior — see §5.

---

## 3 · Mechanism 1 — generic/container source-URL rejection

**Predicate (narrow, deterministic, no semantic inference):** reject when the grounded URL's own
path is a bare root or a fixed, closed list of generic index leaf segments **with nothing after
them** — never a substring match, never a prefix match on an article-bearing path.

```
path = new URL(grounded.normalized).pathname   // grounded.normalized already computed at 3a
isGeneric =
  path === '/' ||
  /^\/(news|press-releases?|investors|investor-relations|newsroom|media)\/?$/i.test(path)
```

- `https://ir.jfrog.com/` → path `/` → **generic, rejected**.
- `https://ir.jfrog.com/news` or `/news/` → **generic, rejected**.
- `https://ir.jfrog.com/news/q3-results` → path has a segment after `news` → **survives**
  (matches the existing NW/NP fixtures at `ir.jfrog.com/news/q3-results`, `/news/q4-preview`,
  verified against every current core and provider fixture — none collide).
- `https://www.reuters.com/markets/frog-guidance-2026-09-18/` → survives (article-specific path).

**New skip reason (Owner-approved, append-only): `GENERIC_SOURCE_URL`.** Appended to
`SKIP_REASONS` after the existing ten entries — never reordered, per the module's own "index stays
stable" convention at `:99`–`:100`.

## 4 · Mechanism 2 — future-dated-catalyst rejection

```
if (raw.eventType === 'catalyst' && eventDate > dateAnchor) { skip }
```

where `dateAnchor = ctx.retrievedAt.slice(0, 10)` (already-injected clock, no new dependency) and
`eventDate` is the already-validated ISO string from step 1. String comparison is safe: both sides
are `YYYY-MM-DD`, so lexicographic order equals chronological order.

- `eventDate === dateAnchor` (same-day) → **survives** (`>` not `>=`).
- `eventDate < dateAnchor` (historical) → **survives**, unaffected.
- `eventDate > dateAnchor` **and** `eventType === 'catalyst'` → **rejected**.
- `eventDate > dateAnchor` **and** `eventType === 'upcoming_event'` → **survives, unconditionally**
  — this branch is never reached because the guard is `raw.eventType === 'catalyst'` only. This is
  the exact NW28/NW29 regression pin (see §7).

**New skip reason (Owner-approved, append-only): `FUTURE_DATED_CATALYST`.** Appended to
`SKIP_REASONS` after `GENERIC_SOURCE_URL` (12th entry overall) — never reordered. `INVALID_EVENT_DATE`
is explicitly **not** reused and retains its current, narrower meaning (a syntactically/grammatically
invalid or unparseable date). This keeps the two failure modes distinguishable in Pilot 3 telemetry:
- `INVALID_EVENT_DATE` — the date itself is malformed/invalid.
- `FUTURE_DATED_CATALYST` — the date is valid but impossible for an already-occurred catalyst.

---

## 5 · Cross-URL / exact-event duplicate collapse (DR-25) — DEFERRED TO S2, NOT IMPLEMENTED

**Finding:** safe deterministic cross-URL event dedup is not possible with the current non-semantic
structured fields, and is **not attempted, not partially implemented, in H-B.**

The only reduced identity key available after excluding `normalizedSourceUrl`/`sourceDomain` from
the existing tuple (`:674`–`:684`) is `ticker + eventDate + category + eventType + direction +
provider` — which collapses to exactly "same day + same category + same direction," a key the
Owner has ruled **insufficient** to distinguish two genuinely distinct same-day events. No other
existing deterministic, non-narrative field can safely discriminate them:

- `relevanceScope` is identity-inert by design (A-2) and only spans 3 values (`company`/`sector`/
  `market`) — not enough granularity, and using an identity-inert field for dedup would be a
  quiet identity-adjacent change in spirit even though not in the frozen tuple.
- `subType` is non-null only for `other_catalyst` — no help for the other six categories, and
  leaning on it would sit uncomfortably close to the DR-30 (H-A) prohibition on using labels/volume
  as a materiality or grouping signal.
- Narrative fields (`title`, `summary`, any free text) are **structurally forbidden from reaching
  any decision** — the module's own Class R ceiling states they are "read at most transiently
  during projection and discarded — it never reaches a validated item, the identity tuple, or any
  caller-visible output." Using them for dedup would violate that architectural invariant.
- `sourceUrl`/domain are exactly the fields the mechanism needs to look *past*, not a discriminator
  to keep.

**Therefore DR-25 is not partially implemented in H-B.** Identity remains exactly as constructed
today; no reduced-tuple comparison, no new `seenEventOnlyHashes`-style tracking, no new duplicate
skip reason. **S2 will own semantic/read-time event grouping, or another separately ruled solution**
— out of scope here, and no groundwork for it is laid in this slice.

## 6 · Evidence Set / DR-28 usage

**NONE.** Both mechanisms are implementable entirely from state already available inside the
Tier-C loop: `grounded.normalized` (mechanism 1, already resolved by the existing `resolveGrounded`
call) and `eventDate` + `raw.eventType` (mechanism 2, both already validated by the time of use).
No `evidenceSet`/Evidence Set field is read by either H-B decision. DR-28 permits such a read; it
is not exercised because nothing here requires it.

## 7 · NW28 / NW29 — regression pins, unchanged

Confirmed at HEAD `0b04280`: `qa/news_catalysts_core_offline.js` NW28 (`:1007`) and NW29 (`:1030`)
construct a future-dated (`eventDate: '2026-11-19'` against `NOW_ISO: '2026-09-20'`) item with
`eventType: 'upcoming_event'`, `direction: null`, and assert it **persists** (A-4.1/A-5). Mechanism
2's guard (`raw.eventType === 'catalyst'`) never matches `upcoming_event`, so these fixtures are
**structurally excluded from the new rejection by construction**, not by coincidence. Their
continued PASS with **zero fixture or assertion changes** is the regression proof that H-B does not
regress A-4.1. If implementation ever requires touching NW28, NW29, their fixtures, or their
assertions — **STOP**.

## 8 · QA matrix (provider suite only, NP42+)

| # | Case | Expected |
|---|---|---|
| 1 | bare-root / generic-index sourceUrl (`/`, `/news`, `/press-releases/`, …) | skipped, `GENERIC_SOURCE_URL` |
| 2 | article-specific URL under a newsroom/IR path (`/news/q3-results`) | survives |
| 3 | normal authoritative article URL (non-IR domain, e.g. Reuters article path) | survives |
| 4 | `eventType: 'catalyst'`, `eventDate` > date anchor | skipped, `FUTURE_DATED_CATALYST` |
| 5 | `eventType: 'catalyst'`, `eventDate` === date anchor (same-day) | survives |
| 6 | `eventType: 'catalyst'`, `eventDate` < date anchor (historical) | survives |
| 7 | `eventType: 'upcoming_event'`, `eventDate` > date anchor | survives, unconditionally |
| 8 | a malformed/unparseable `eventDate` (any `eventType`) | skipped, `INVALID_EVENT_DATE` — unchanged meaning, not reused for future-dating |
| 9 | NW28/NW29 (core suite) | unchanged, PASS |
| 10 | any surviving item | exactly the 17-field public contract, unchanged order |
| 11 | any surviving item | `identityHash` construction unchanged (tuple, field order, `IDENTITY_SCHEMA_VERSION` all pinned) |
| 12 | any skipped item (both new reasons) | `skippedItems` entry carries only `{ reason }`, never echoes item data — no Evidence Set leakage |
| 13 | `SKIP_REASONS` | `GENERIC_SOURCE_URL` then `FUTURE_DATED_CATALYST` appended after the existing ten, in that order, never reordered |
| 14 | live prompt (H-A) | R-1…R-5 markers still present (NP40 still green), no numeric threshold (NP41 still green) |

Validation commands (offline only, no live API call):
```
node qa/news_catalysts_provider_offline.js   -> expect PASS, NP01-NP4x contiguous
node qa/news_catalysts_core_offline.js       -> expect PASS, 30/30, file unmodified
npm run qa:offline                            -> expect PASS, 43 effective suites
```

## 9 · Remaining Owner decisions

**NONE.** Both skip reasons are Owner-approved and append-only. Mechanism 3 is fully deferred to
S2, not partially implemented, so no dedup-related decision remains open.

## 10 · Explicitly NOT in H-B

Cross-URL / exact-event duplicate collapse (DR-25 — DEFERRED TO S2, see §5) · semantic grouping
(S2) · semantic completeness verification · confirmed-vs-estimated dates (DR-23, HELD) ·
upcoming-event grounding (DR-19, HELD) · any model second pass · any request-shape, `tools`, or
schema change · any change to `news-catalysts-core.js`, `qa/news_catalysts_core_offline.js`,
`news-catalysts-preflight.js`, `evidence-contract.js`, `evidence-freshness.js`, `news-catalysts.mjs`,
`index.html`, `services/**`, `qa/run-offline.js`, `netlify.toml`, `package.json`, `CLAUDE.md`,
`AGENTS.md`, `BACKLOG.md` · any identity, persistence, transport, timeout, retry, or Netlify change
· any live API call.

## 11 · Definition of done

`SKIP_REASONS` grows from 10 to 12, append-only, in the order `GENERIC_SOURCE_URL`,
`FUTURE_DATED_CATALYST`. Both mechanisms implemented exactly at the insertion points in §2, reusing
`grounded`/`eventDate`/`raw.eventType` already computed by the existing ladder — no new clock, no
new Evidence Set read, no identity change. `qa:offline` PASS at 43; provider suite PASS with the
new NP4x tests contiguous; core suite PASS 30/30 with `qa/news_catalysts_core_offline.js`
byte-unmodified, NW28/NW29 unchanged. DR-25 remains unimplemented, explicitly deferred to S2.
