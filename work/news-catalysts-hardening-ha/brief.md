# Task brief: news-catalysts S1.5.1 hardening — H-A (prompt-only)

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Only then may implementation begin, per `AGENTS.md`
"Task folder convention".

Source of truth: `.ai-reports/status/s151-pilot-hardening.PREP.local.md` (revision 2). Owner rulings
**DR-21a (prompt half) · DR-22 · DR-24 · DR-26 · DR-30** are applied. **DR-28, DR-20, DR-21a's
deterministic half and DR-25 are H-B and are STOP-1 here.**

**This is the prompt-only slice.** It adds **no new mechanism**: no skip reason, no ladder branch,
no dedup, no Evidence Set read, no schema change, no request-shape change.

> **H-A is not zero-risk.** It introduces no new deterministic skip or dedup mechanism, but prompt
> changes can still alter emission volume, coverage, classification and materiality judgments.
> **Offline QA plus Pilot 3 behavioural validation are both required.**

## Baseline

| | |
|---|---|
| `branch-dev` = `origin/branch-dev` | **`d9395ea`** — S1.5.2 F-2, migration CLOSED |
| `origin/main` | `fbec2c1` |
| `npm run qa:offline` | expected **PASS, 43 effective suites** — confirmed by the Worker's step-0 pre-edit baseline, not asserted here |
| Provider suite | 39 tests · core suite 30 tests |
| Prompt copies | provider `:253`ff and `qa/news_catalysts_provider_offline.js:290`ff — **character-identical, both change together** |

## Objective

Improve classification and materiality judgment by prompt instruction only, so the deterministic
slice (H-B) lands against a model already emitting fewer low-value and mis-dated items.

## Implementation scope — exactly two files

```
netlify/functions/lib/news-catalysts-provider.js   modify   prompt text only
qa/news_catalysts_provider_offline.js              modify   prompt copy + NP01 re-baseline
```

**Everything else is STOP-1.** Named explicitly: `news-catalysts-core.js` · `qa/news_catalysts_core_offline.js`
· `news-catalysts-preflight.js` (**frozen**) · `evidence-contract.js` · `evidence-freshness.js` ·
`news-catalysts.mjs` · `index.html` · `services/**` · `qa/run-offline.js` · `netlify.toml` ·
`package.json` · `CLAUDE.md` · `AGENTS.md` · `BACKLOG.md`.

**No ASK-tier file is in scope.** Posture **ACCEPT EDITS** across the two files.
No env, Netlify, gate or credential change. Gate env names stay unset. **No activation.**

> **Why the core suite is NOT in scope here.** It builds fixtures through the real
> `provider.normalizeNewsResponse` (`:60`, `:217`), so it is sensitive to **validation** changes.
> H-A changes **no validation** — only instruction text — so `expectedItems` cannot move. If it does,
> that is evidence H-A changed behaviour it should not have: **STOP-1**.

---

## 1 · The five prompt rules

Added to the existing instruction text. **The seven categories, `eventType`, `relevanceScope`,
`subType` semantics, the A-1 direction rule and the 30/60-day windows are unchanged.**

### R-1 · Event date policy (DR-21a, prompt half)

> `eventDate` must represent the date of the material event described by the catalyst.
>
> Do not use a platform/search metadata date or publication date merely because it is available.
>
> **A publication date is valid when it is also the actual date of the material
> announcement/event.**
>
> For multi-stage events, use the economically meaningful announcement / decision / pricing date
> when that is the event described by the catalyst.
>
> Do not substitute a later completion / closing date merely because the later source was retrieved.
>
> A later completion may be a separate catalyst only when it is itself materially distinct.

*Worked case (MRNA convertible notes): the pricing/announcement date is the catalyst; the Sep 1
completion is not a second catalyst unless materially distinct on its own.*

### R-2 · Analyst reiterations (DR-22)

> A routine analyst reiteration with **no substantive change** in rating, price target, estimates,
> thesis, or another material analyst action is **not a catalyst**.

### R-3 · Ambiguous direction (DR-24)

> When the company impact is genuinely ambiguous, use `neutral` rather than inventing a bullish or
> bearish direction. **`neutral` must not be used to rescue an event that is not material enough to
> be a catalyst in the first place** — such an event is simply not emitted.

### R-4 · Source preference (DR-26)

> Prefer primary and authoritative sources — company releases, regulatory filings and regulator
> publications — over secondary aggregation, when both report the same event.

**No `search_domain_filter`, no `tools.filters`, no request-shape change of any kind.** This is
wording only. Adding a filter is STOP-1.

### R-5 · Materiality of routine activity (DR-30)

> Ordinary conference attendance or an appearance alone is **not** a catalyst.
> Incremental product public relations **without a meaningfully changed state or material
> consequence** is not automatically a catalyst.
> Repeated releases about the **same underlying development** are not each emitted merely because
> separate releases exist.
> **Materiality comes from the underlying development, not from public-relations volume.**

**No numeric threshold, percentage or count may be introduced** — in the prompt or in code. DR-12
still holds and **NP27 enforces it**.

---

## 2 · Explicitly NOT in H-A

Each is **STOP-1** if it appears in the diff:

Container / hub URL rejection (DR-20) · any new skip reason · the future-dated-catalyst
deterministic skip (DR-21a deterministic half) · cross-URL duplicate collapse (DR-25) · **any read
of Evidence Set metadata by any decision** (DR-28 is an H-B gate) · confirmed-vs-estimated dates
(DR-23, HELD) · upcoming-event grounding (DR-19, HELD) · semantic completeness verification ·
semantic grouping · retrieval redesign · request-shape or `tools` change · schema change · identity,
core, persistence, contract, transport, timeout, retry or Netlify change.

---

## 3 · QA scope

### Re-baseline

| Test | Why |
|---|---|
| **NP01** | Asserts the exact upstream request body, which embeds the instruction text. **Both prompt copies change together** — provider and suite `:290` — or NP01 fails |

**No other existing provider test should move.** NP02–NP39 assert transport, ladder, grounding,
identity, projection and taxonomy mechanics — none of which H-A touches.

### New

| ID | Asserts |
|---|---|
| **NP40** | The instruction text contains each of the five R-1…R-5 rule markers — a **presence** check on the shipped prompt, so a rule cannot be silently dropped in a later edit |
| **NP41** | **No numeric materiality threshold introduced by this change** — extends the NP27 static scan to the new wording: no percentage literal, no count threshold, no currency threshold in the materiality or reiteration text |

**NP40 is a presence assertion, not a behaviour assertion.** It proves the instruction shipped. It
does **not** prove the model obeys it — that is Pilot 3's job, and claiming otherwise would be the
over-claim this project keeps catching.

### Must NOT move

```
NP02–NP39   transport, Tier A/B/C, grounding, Evidence Set, identity,
            projection, taxonomy, key shape, J7 freshness
the ENTIRE core suite (qa/news_catalysts_core_offline.js) — all 30 tests,
            fixtures AND assertions; H-A changes no validation
```

**Suite count: 43, unchanged.** Provider 39 → **41**. Core **30/30**, untouched.

### Judgment — Pilot 3 only

R-1 date selection · R-2 reiteration significance · R-3 ambiguity · R-4 source preference in
practice · R-5 materiality. **No fixture can verify any of these.** A unit test asserting the model
obeys a prompt rule would be fabricated coverage.

---

## 4 · Validation

1. `npm run qa:offline` → **PASS, 43 effective suites**, identical to the step-0 baseline.
2. `node qa/news_catalysts_provider_offline.js` → **PASS, 41/41**, NP01–NP41 contiguous.
3. `node qa/news_catalysts_core_offline.js` → **PASS, 30/30, file unmodified.**
4. `node qa/fund_facts_route_offline.js` → PASS, unmodified.
5. `node qa/instruction_layer_offline.js` → PASS, unmodified.
6. Implementation diff is **exactly two files**:
   `git diff --stat d9395ea...HEAD -- . ':(exclude)work/' ':(exclude)BACKLOG.md'`
7. Read-back: the prompt string in the provider and its copy at suite `:290` are
   **character-identical**, and differ from `d9395ea` **only** by the R-1…R-5 additions.
8. Read-back: the diff contains **no** change to `buildRequestBody`'s structure, `REQUEST_SCHEMA`,
   `tools`, `SKIP_REASONS`, the validation ladder, `appendEvidenceEntry`, `resolveGrounded`,
   `buildNewsKey`, `NEWS_KEY_RE`, the identity tuple, or any export.
9. Read-back: **no numeric threshold** introduced anywhere; NP27 and NP41 both green.

## 5 · STOP conditions

The five standing conditions, plus:

1. Any file beyond the two in scope — **including `qa/news_catalysts_core_offline.js`**.
2. The core suite failing or needing a fixture change — **that is evidence H-A altered validation
   behaviour**, which it must not.
3. Any new skip reason, ladder branch, or dedup logic.
4. **Any read of Evidence Set metadata by any decision.**
5. Any request-shape, `tools`, `filters` or schema change.
6. Any numeric materiality threshold, in prompt or code.
7. Any change to the seven categories, `eventType`, `relevanceScope`, `subType` semantics, the A-1
   direction rule, or the 30/60-day windows.
8. Any identity, core, persistence, contract, transport, timeout, retry or Netlify change.
9. Any provider test other than NP01 moving.
10. Any live API call. **Pilot 3 is a separate Owner-approved task after H-B lands.**

## 6 · Definition of done

The instruction text carries R-1…R-5 with no numeric threshold; both prompt copies are
character-identical and differ from `d9395ea` only by those additions. No mechanism was added: skip
vocabulary still 10, ladder unchanged, no Evidence Set read, no dedup, request shape and schema
untouched. `qa:offline` PASS at 43; provider **41/41** with NP01–NP41 contiguous; **core 30/30 with
`qa/news_catalysts_core_offline.js` unmodified**; route and instruction-layer suites pass unmodified.
Implementation diff is exactly two files. `review.md` carries a `## Lessons` section, the two-row
"Files changed" block, and the final-check line.

**Not claimed by this task:** that any R-rule changes model behaviour. H-A ships instructions;
**Pilot 3 measures whether they worked**, together with H-B, against the Pilot 2 baseline.
