# Task review: catalyst news taxonomy revision — S1.5

Base `fe0d5c0` (brief commits `cec170f` approved, `fe0d5c0` A-5 amendment approved,
`16bbc64` A-5.1 + `REQUEST_SCHEMA` correction amendment approved) · worktree
`pt-wt-catalyst-news-taxonomy`, branch `task/catalyst-news-taxonomy`.

## STOP-1 and the A-5 amendment

Before any edit, reading `news-catalysts-core.js:331` surfaced that `validateProviderResult`'s
unconditional `isNonEmptyString(item.direction)` guard rejects `direction: null`, and the rejection
is whole-envelope — a single `upcoming_event` (A-1) would fail an entire fetch, including any valid
`catalyst` siblings in the same batch. This contradicted the original brief's A-4.1 claim ("nothing
in the write path rejects it") and the brief's own scope line for `news-catalysts-core.js`
("`ITEM_FIELDS` projection list only"). Raised as STOP-1 and held without implementing. Owner ruling:
FIX NOW — the A-5 amendment (`fe0d5c0`) widened the authorized `news-catalysts-core.js` edit to
`ITEM_FIELDS` **and** `validateProviderResult`, nothing else, and added NW27 negatives + NW28/NW29
handler-level QA to prove the fix end to end.

## A-5.1 — core boundary validation for relevanceScope/subType (Owner-ruled, real-time)

Raised by the step-8 Codex review over the implementation diff: `validateProviderResult` checks
`eventType` and the conditional `direction` (A-5), but has no check at all for `relevanceScope` or
`subType`. Under an injected/drifted `providerImpl` (the test-only, event-only seam — unreachable
from any real request), an item missing or wrong-shaped in either field still returns `ok: true`;
`projectItemRecord` then persists an off-contract value, or `JSON.stringify` silently drops an
`undefined` field, producing fewer than the required 19-field record. This is unreachable via the
real, frozen provider (whose own ladder already guarantees both fields — NP25/NP26/NP30), but it is
the same defense-in-depth this function already applies to every other write-relevant field
(`category`, `direction`, `sourceDomain`, etc.).

Owner ruling (real-time, this session): **FIX NOW**, as a narrow A-5.1 amendment — not implicitly
covered by A-5's original wording, which named only `eventType`/`direction`.

**The authorized change**, inside `validateProviderResult` only:

1. `relevanceScope` must be one of `RELEVANCE_SCOPES`.
2. `subType` — `category === 'other_catalyst'` ⇒ a trimmed non-empty string; every other category
   ⇒ exactly `null`.

**Scope, exactly:** `validateProviderResult`, plus the minimum provider export/import
destructuring needed (`RELEVANCE_SCOPES`, already exported from the provider for QA use), plus
targeted NW27-style negative QA for these two invariants. **Not in scope:** `projectItemRecord`,
write ordering, response envelopes, index logic, `acquireNowIso`, or any provider production
semantics — all unchanged. Fail-closed throughout, same as every existing check in this function.

## Implementation vs. the approved (A-1…A-5) brief

- `netlify/functions/lib/news-catalysts-provider.js` — `EVENT_TYPES` (`catalyst | upcoming_event`)
  and `RELEVANCE_SCOPES` (`company | sector | market`) added as frozen vocabularies; `SKIP_REASONS`
  7 → 10 (`UNKNOWN_EVENT_TYPE`, `INVALID_RELEVANCE_SCOPE`, `INVALID_SUB_TYPE` appended after
  `DUPLICATE_IN_BATCH`); `REQUEST_SCHEMA` gains `eventType`/`relevanceScope`/`subType` properties,
  `direction` drops `type:'string'` for `enum: [...,null]`, `required` gains `eventType`,
  `relevanceScope`, `subType` (subType required per Owner correction during implementation — see
  Deviations); ladder gains `eventType` (before `direction`), conditional `direction`, `relevanceScope`,
  and `subType` checks in that order; identity tuple gains `eventType` after `category`, before
  `direction` (A-2); `IDENTITY_SCHEMA_VERSION` → `j3-identity-v2`; `CONTRACT_VERSION` value →
  `news-contract-v1` under its original exported name; projection appends `eventType`,
  `relevanceScope`, `subType` after `scoringImpact`; prompt rewritten to state both windows in words,
  all seven category boundaries, Catalyst/Upcoming-Event semantics, `relevanceScope` guidance,
  `other_catalyst` last-resort examples, the approved overlap/precedence rules (regulatory precedence,
  equity-ownership routing, investigation-direction rule), and materiality with no numeric threshold;
  `DIRECTIONS` re-exported (verbatim, from `evidence-contract`) so `core.js` can reuse the canonical
  vocabulary without a new import.
- `netlify/functions/lib/news-catalysts-core.js` (A-5) — `ITEM_FIELDS` gains the three names in
  D-S15-E order; `validateProviderResult` gains an `EVENT_TYPES` fail-closed check (same style as
  `CATEGORIES`) and replaces the unconditional direction guard with: `catalyst` ⇒ `DIRECTIONS.indexOf`
  match required; `upcoming_event` ⇒ `direction` must be exactly `null`. No other core function
  touched — `projectItemRecord`, write order, response envelopes, index logic, `acquireNowIso`
  unchanged.
- `qa/news_catalysts_provider_offline.js` — NP01/NP12/NP15/NP16/NP23 re-baselined; NP24–NP32 new
  (nine assertions: eventType/relevanceScope/subType vocabularies and conditionality, no-numeric-
  materiality static scan, three-site category parity, prompt windows/no-`recent`, relevanceScope
  identity-inertness, eventType identity-bearing (independently isolated from direction), and A-1
  direction conditionality on a future-dated fixture).
- `qa/news_catalysts_core_offline.js` — `ITEM_FIELD_ORDER` 14 → 17 (`RECORD_FIELD_ORDER` derives
  16 → 19); local `rawItem` fixture builder gains taxonomy defaults; NW27 gains four A-5 negatives
  (`direction: null` on `catalyst`, non-null `direction` on `upcoming_event`, non-string non-null
  `direction`, unknown `eventType`); NW28 (future-dated `upcoming_event` through the full handler —
  `WRITE`, persists, `direction` stays exactly `null`) and NW29 (mixed `catalyst` +
  `upcoming_event` batch — both persist, envelope not rejected) added.

Frozen files untouched: `evidence-contract.js`, `evidence-freshness.js`, `news-catalysts-preflight.js`,
`news-catalysts.mjs`, `qa/run-offline.js`, `qa/fund_facts_route_offline.js`,
`qa/instruction_layer_offline.js`. No `index.html`, `services/**`, `package.json`, `netlify.toml`,
`CLAUDE.md`, `AGENTS.md`, `BACKLOG.md` change. No gate, env var, or Netlify change. No Grok surface.
No live Perplexity call at any point.

## QA / verification evidence

| Check | Result |
|---|---|
| Pre-edit baseline `npm run qa:offline` (fresh worktree, `npm ci`) | PASS, 43 spawned suites |
| `node qa/news_catalysts_provider_offline.js` | **32/32 PASS** (NP01–NP32 contiguous) |
| `node qa/news_catalysts_core_offline.js` | **30/30 PASS** (NW01–NW29, NW09b) |
| `node qa/fund_facts_route_offline.js` (unmodified) | **14/14 PASS** |
| `node qa/instruction_layer_offline.js` (unmodified) | **58 checks, PASS** |
| `npm run qa:offline` (final) | **PASS, 43 spawned suites** — identical to baseline |
| Advisory warnings | 1, pre-existing (unrelated) |
| Implementation diff (`git diff --stat` vs base, excl. `work/`/`BACKLOG.md`) | exactly 4 files |
| `git diff --ignore-cr-at-eol --stat` | same 4 files, no line-ending churn |
| `grep -i grok` across the full diff | zero matches |
| `buildNewsKey` / `NEWS_KEY_RE` | absent from any diff hunk (verified: only unrelated context lines) |
| Tuple-literal diff | exactly one member added (`eventType`), nothing else |
| NP01 prompt-literal deep-equal (provider vs. suite copy) | PASS — byte-identical at runtime |
| NP32 / NW28 shared fixture | eventDate `2026-11-19`, `eventType: 'upcoming_event'`, `direction: null` in both suites |
| CR-byte audit (all 4 touched files vs. an untouched control file) | consistent with the repo's pre-existing `autocrlf` checkout convention — no churn introduced |

## Deviations from the written brief (Owner-directed, real-time)

1. **`subType` added to `REQUEST_SCHEMA.required`, with `type: ['string','null']`.** At
   implementation time the written brief (`fe0d5c0`) said `subType` is not required (conditionality
   ladder-enforced only). The Owner corrected this in real time before the schema was authored: the
   schema must require `subType` as always-present (`null` or non-empty string), since the approved
   contract treats it as an always-present field end to end, not merely ladder-enforced. Applied as
   instructed; ladder conditionality is unchanged and still enforces the non-empty-iff-`other_catalyst`
   rule. **Resolved via a formal, Owner-approved brief-only commit** — the step-8 Codex round flagged
   the mismatch against the then-unamended brief text (finding #2, REJECTED, below); a first attempt
   self-amended `brief.md` in place, which the step-12 Codex check correctly flagged (finding P1,
   below) as not valid authorization for a tracked ASK-tier file. That edit was reverted, and the
   correction instead landed as its own Owner-approved brief-only commit `16bbc64` (also carrying the
   full A-5.1 amendment). The written brief and the implementation now agree on this point, formally.
2. **Prompt domain logic expanded beyond the written brief's compact wording**, per real-time Owner
   direction, to explicitly state: full category boundaries for all seven categories, Catalyst vs.
   Upcoming Event semantics, the approved overlap/precedence rules (regulatory-triggered events route
   to `regulatory_legal` and may take precedence over `corporate_action`/`product_customer_partnership`;
   equity-ownership/capital-structure changes route to `corporate_action`; investigations are not
   automatically negative — direction follows actual company impact), compact `other_catalyst`
   last-resort examples, and the materiality/consensus wording narrowly scoped to `guidance_update`
   interpretation rather than as a global rule. No new taxonomy or judgment rule was added beyond what
   the Owner specified in this conversation.
3. **`subType` non-emptiness uses a trimmed check** (`raw.subType.trim() !== ''`), per Owner
   correction, so a whitespace-only string on `other_catalyst` is rejected `INVALID_SUB_TYPE` — not
   merely a JS-truthy non-empty-length check.
4. **`DIRECTIONS` re-exported from the provider** so `core.js`'s A-5 guard reuses the canonical
   vocabulary instead of duplicating it, per Owner correction, while keeping `core.js`'s import count
   at three (no new `require`) so NW25's import-allowlist pin needed no change.

None of these change the diff's file scope (still exactly four files) or any STOP condition.

## Files changed
- Implementation (4): `netlify/functions/lib/news-catalysts-provider.js`,
  `netlify/functions/lib/news-catalysts-core.js`, `qa/news_catalysts_provider_offline.js`,
  `qa/news_catalysts_core_offline.js`
- Evidence (tracked): `work/catalyst-news-taxonomy/brief.md`, `work/catalyst-news-taxonomy/review.md`

## Lessons

- [rule] A brief's own A-4.1 "verified — nothing in the write path rejects it" claim generalized a
         narrow finding (about `eventDate` alone) to the whole item shape, and missed a
         whole-envelope-rejecting type guard in a file already in the brief's edit scope. Read every
         line the scope note says is "no edit needed" against the actual current source before
         trusting the claim, not just the lines it says will change.
- [covered] Re-exporting an existing dependency's vocabulary (`DIRECTIONS`) from a module that already
         imports it is a lower-risk way to share a canonical constant across a fixed-import-count
         boundary than adding a new `require` — worth reaching for before assuming a new import is
         needed.

## Codex review

**Round 1 (step 8)** — `codex review --uncommitted` over the pure implementation diff (the
then-untracked `review.md` was held out of the working tree for this pass, per AGENTS.md's "brief.md
and review.md are evidence, outside the implementation diff by definition").

| # | Finding | Class | Resolution |
|---|---|---|---|
| 1 | P2 — `validateProviderResult` has no check for `relevanceScope` or `subType`; a drifted/injected `providerImpl` could pass `ok:true` with an off-contract or missing value, which `projectItemRecord` would persist incompletely (`JSON.stringify` drops `undefined` keys) | **FIX** (Owner-ruled, real-time — recorded as amendment **A-5.1** above) | Added both checks inside `validateProviderResult` only (scope held to that function + the minimum `RELEVANCE_SCOPES` import); six new NW27-style negatives added (`unknown relevanceScope`, `missing relevanceScope`, `subType present when forbidden`, `subType missing/undefined on other_catalyst`, `subType null on other_catalyst`, `subType whitespace-only on other_catalyst`); `node qa/news_catalysts_core_offline.js` re-run: 30/30 PASS; full `qa:offline` re-run: PASS, 43 suites. |
| 2 | P2 — `REQUEST_SCHEMA.required` includes `subType`, which the written brief said should not be required (ladder-enforced conditionality only) | **REJECTED** | Codex relied on stale brief text that conflicted with an explicit, earlier real-time Owner ruling (before the schema was authored: `subType` **must** be in `required` with schema-level `type: ['string','null']`). No production code change made — the written brief was stale, not the implementation. |

**Round 2 (step 12, first attempt)** — `codex review --uncommitted` over the complete working-tree
task state, at a point where the `REQUEST_SCHEMA` correction had been applied by self-amending
`brief.md` directly in the working tree (uncommitted).

| # | Finding | Class | Resolution |
|---|---|---|---|
| 1 | P1 — editing the tracked, ASK-tier `brief.md` in place, outside a formal brief-only commit and Owner approval of its exact contents, is not valid authorization under AGENTS.md's task-folder convention | **FIX** | Owner ruling: require the formal cycle. The in-place edit was reverted (`brief.md` restored to exact `fe0d5c0` content); the A-5.1 amendment and the `REQUEST_SCHEMA` correction were instead written up, shown for approval, staged alone, and committed as their own brief-only commit `16bbc64` after explicit Owner approval — mirroring exactly how A-5 itself (`fe0d5c0`) was authorized. |
| 2 | P2 — `review.md` declared "Codex review pending" with no required `Final check:` summary line | **FIX** | Resolved by this revision of `review.md`. |
| 3 | P2 — the "Evidence (tracked)" row used a non-canonical format (reordered paths, inline explanatory text) instead of AGENTS.md's fixed `- Evidence (tracked): work/<id>/brief.md, work/<id>/review.md` form | **FIX** | Row restored to the exact canonical form above; explanation moved into the Deviations section and this Codex review section instead. |

**Round 3 (step 12, final check)** — `codex review --base fe0d5c0` over the complete task state
after the `16bbc64` brief-only commit landed (committed `brief.md` amendment + uncommitted
implementation diff + untracked `review.md`). **Result: no findings.** Verbatim summary: "The
implementation matches the amended task contract, preserves the intended validation and persistence
boundaries, and the targeted and full offline QA suites pass. No actionable correctness regression
was identified."

**Final check: 3 rounds — round 1: 1 class-I FIX (A-5.1, code + QA), 1 class-I REJECTED (no code
change); round 2: 1 class-I FIX (brief.md self-amendment reverted, redone as an approved brief-only
commit `16bbc64`) + 2 class-II findings fixed (this file's status line, the evidence-row format),
self-checked; round 3 (scoped final re-pass over the complete post-commit task state): zero
findings.** QA re-run after every code change (A-5.1): `node qa/news_catalysts_core_offline.js`
30/30 PASS, `node qa/news_catalysts_provider_offline.js` 32/32 PASS, `npm run qa:offline` PASS at 43
suites. No unresolved Class I finding remains open.

## Final status

READY FOR FINALIZATION. Implementation matches the approved (A-1…A-5.1) brief exactly, including the
formally committed `REQUEST_SCHEMA` correction and A-5.1 core-boundary validation. All three Codex
rounds are closed (2 FIX, 1 REJECTED, 2 class-II documentation fixes, final re-pass clean). Targeted
QA (32/32 provider, 30/30 core) and full `qa:offline` (PASS, 43 spawned suites, matching the pre-edit
baseline) are green. Implementation diff is exactly four files; brief-only evidence commit `16bbc64`
already landed. Commit approval requested for the remaining task diff (four implementation files +
`work/catalyst-news-taxonomy/review.md`); LAND is a separate Owner decision.
