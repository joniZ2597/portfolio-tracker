# Task brief: news-catalysts S1.5.1 hardening — H-C (prompt-only)

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Only then may implementation begin, per `AGENTS.md`
"Task folder convention".

Source planning artifact: `.ai-reports/status/s151-hc-proposal.PREP.local.md`.
Owner ruling 2026-09-22: **H-C scope = C-1 + C-2 only. C-3 deferred.**

**S1.5.1 is on HOLD before LAND.** H-B is PASS / mechanically validated. H-A is implemented but its
behavioural closure is not satisfied — H-C exists to close the two blocking failures Pilot 3 found.

## Baseline — verified at HEAD

| | |
|---|---|
| Local `HEAD` | **`336ff96`** — `feat(news): harden catalyst deterministic validation` (H-B) |
| `origin/branch-dev` | `d9395ea` — **local is 5 ahead, committed locally, not pushed** (`4a61959` harness brief is the current tip; `336ff96` is the last *code* commit) |
| LAND | **has not occurred for any slice** |
| Provider suite | **44 tests**, highest id `NP45` |
| Core suite | **30 tests** |
| `SKIP_REASONS` | **12** — unchanged by this task |
| `qa:offline` | expected **PASS, 43 suites** — confirmed by the Worker's step-0 baseline, not asserted here |

## Objective

Close the two blocking behavioural failures from Pilot 3 by **prompt instruction only**:

1. **The MRNA convertible-notes date regression**, which reproduced exactly against the shipped R-1
   rule.
2. **Q-3** — a correct, material NVDA earnings event lost because the model supplied a `sourceUrl`
   it had not actually retrieved.

**No mechanism is added.** No skip reason, no ladder change, no Evidence Set read, no schema change,
no request-shape change.

> **H-C is not zero-risk.** It adds no deterministic mechanism, but prompt changes can still alter
> emission volume, coverage, classification and materiality. **Offline QA plus Pilot 4 behavioural
> validation are both required.**

---

## 1 · Why restating R-1 would not work

`news-catalysts-provider.js:311-317` already ships:

> *"…for a multi-stage event, use the economically meaningful announcement, decision, or pricing date
> when that is the event described by the catalyst, **and do not substitute a later completion or
> closing date merely because the later source was retrieved** — a later completion may be a separate
> catalyst only when it is itself materially distinct…"*

**The MRNA regression reproduced against that exact wording.** C-1 therefore **keeps R-1 and adds
concrete specificity** — naming the event classes and the date vocabulary that appeared in the
failure. It is an addition, not a replacement.

## 2 · Why Q-3 is a prompt gap, not a validation defect

The entire shipped instruction for the field is *"sourceUrl (the https URL of the source reporting
the event)"*. **Nothing tells the model the URL must be one it actually retrieved.** Meanwhile
`resolveGrounded` hard-rejects any URL absent from the Evidence Set and `INVALID_SOURCE_URL` fires.

**The validation is correct and fail-closed. The model is simply unaware of a hard downstream
constraint. C-2 tells it.**

> **C-2 does not weaken grounding validation — it states what the validation already requires.**
> Loosening `resolveGrounded` to "fix" Q-3 is **STOP-1**, and **NP49** pins that.

---

## 3 · Exact rule wording

### C-1 · Multi-stage event date reinforcement

Added **after** the existing R-1 date wording, which is retained unchanged:

> For a **multi-stage financing or corporate action** — for example a **convertible or debt
> offering, an equity offering, a tender or exchange offer, or a merger or acquisition** — the
> catalyst is the **announcement, pricing or decision**, and `eventDate` is that date. A later
> **closing, completion, settlement, indenture or effectiveness** date is **not** the catalyst's
> date, and must not be used merely because a later filing or article carried it. If the completion
> is itself materially distinct — terms changed, size changed, the transaction failed — it is a
> **separate** catalyst with its own date.

### C-2 · sourceUrl provenance

Added to the `sourceUrl` field instruction:

> `sourceUrl` **must be copied exactly from a URL actually returned to you by search or page fetch
> for this event.** Do not construct, infer, guess, shorten, normalise or recall a URL from memory,
> even if you are confident the page exists. **If no retrieved URL supports the event, omit the
> event rather than substituting a different real URL.**

**The omit-rather-than-substitute clause is load-bearing.** Without it, a model told "use a real
URL" may supply a *different* real URL — trading an `INVALID_SOURCE_URL` skip for a **mis-grounded
surviving item**, which is strictly worse because it passes validation while being wrong. Pilot 4
gate **P4-3** exists to detect exactly that.

### Not in H-C

**C-3 same-theme / conference PR materiality is DEFERRED** (Owner, 2026-09-22) and stays an S2 /
later behavioural observation. **Any same-theme, conference-PR, volume-based or count-based
materiality wording in the diff is STOP-1.**

---

## 4 · Implementation scope — exactly two files

```
netlify/functions/lib/news-catalysts-provider.js   modify   prompt text only
qa/news_catalysts_provider_offline.js              modify   prompt copy + NP01 + NP46/NP47/NP49
```

**Everything else is STOP-1.** Named explicitly: `news-catalysts-core.js` ·
`qa/news_catalysts_core_offline.js` · `news-catalysts-preflight.js` (**frozen**) ·
`evidence-contract.js` · `evidence-freshness.js` · `news-catalysts.mjs` · `index.html` ·
`services/**` · `qa/run-offline.js` · `netlify.toml` · `package.json` · `CLAUDE.md` · `AGENTS.md` ·
`BACKLOG.md`.

**No ASK-tier file is in scope.** Posture **ACCEPT EDITS** across the two files. No env, Netlify,
gate or credential change. Gate env names stay unset. **No activation.**

> **Why the core suite is NOT in scope.** It builds fixtures through the real
> `provider.normalizeNewsResponse` (`:60`, `:217`), so it is sensitive to **validation** changes.
> H-C changes **no validation** — only instruction text — so `expectedItems` cannot move. **If the
> core suite needs a fixture change, that is evidence H-C altered behaviour it must not have:
> STOP-1.** This inverted test worked in H-A and is retained.

**Unchanged and not up for discussion here:** `SKIP_REASONS` (**12**) · the validation ladder ·
Evidence Set handling · identity (`j3-identity-v2`, `buildNewsKey`, `NEWS_KEY_RE`) · persistence ·
the 17-field public contract · `CONTRACT_VERSION` · `SOURCE_TIER` · `PROVIDER_ID` · transport,
endpoint and preset · **timeout (45000 ms)** · **retry (none)** · Netlify execution mode.

---

## 5 · QA additions

| ID | Asserts | Type |
|---|---|---|
| **NP46** | The instruction text contains the C-1 multi-stage rule, including the literal terms `convertible`, `tender`, `closing`, `completion`, `settlement`, `indenture`, `effectiveness` — **and the original R-1 wording is still present** | presence |
| **NP47** | The instruction text contains the C-2 provenance rule, including the **omit-rather-than-substitute** clause | presence |
| **NP49** | **Q-3 regression pin.** A candidate whose `sourceUrl` is **absent from the Evidence Set** is skipped `INVALID_SOURCE_URL` — **even when it is well-formed https, same-domain and plausibly related**. Fail-closed grounding is preserved, not weakened | **behavioural, deterministic** |
| **NP01** | re-baseline — the request body embeds the instruction text; **both prompt copies change together** | re-baseline |
| **NP27 / NP41** | still green — **no numeric threshold introduced** | negative |
| **NP48** | **not used** — reserved for C-3, which is deferred |

**NP49 is the one that earns its place.** NP46 and NP47 prove text shipped. **NP49 proves the code
still rejects unretrieved URLs after H-C** — that a future edit cannot "fix" Q-3 by loosening
validation. **It pins the thing we must not do.**

**No other existing provider test should move.** NP02–NP45 assert transport, ladder, grounding,
Evidence Set, identity, projection and taxonomy mechanics — none of which H-C touches.

### Must NOT move

```
NP02–NP45   transport, Tier A/B/C, grounding, Evidence Set, identity,
            projection, taxonomy, key shape, J7 freshness, H-B rules
the ENTIRE core suite (qa/news_catalysts_core_offline.js) — all 30 tests,
            fixtures AND assertions
```

**Suite count: 43, unchanged.** Provider **44 → 47**. Core **30/30**, file unmodified.

### What cannot be tested offline

Whether the model **picks the pricing date**, **stops inventing URLs**, or changes emission volume.
**Both C-rules are judgment rules.** A fixture asserting model compliance would be fabricated
coverage. **Offline QA proves the instrument; Pilot 4 measures the outcome.**

---

## 6 · Validation

1. `npm run qa:offline` → **PASS, 43 effective suites**, identical to the step-0 baseline.
2. `node qa/news_catalysts_provider_offline.js` → **PASS, 47/47**.
3. `node qa/news_catalysts_core_offline.js` → **PASS, 30/30, file unmodified.**
4. `node qa/fund_facts_route_offline.js` → PASS, unmodified.
5. `node qa/instruction_layer_offline.js` → PASS, unmodified.
6. Implementation diff is **exactly two files**:
   `git diff --stat 336ff96...HEAD -- . ':(exclude)work/' ':(exclude)BACKLOG.md'`
7. Read-back: the prompt string in the provider and its copy in the suite are **character-identical**,
   and differ from `336ff96` **only** by the C-1 and C-2 additions.
8. Read-back: the **original R-1 date wording is still present** — C-1 adds to it, never replaces it.
9. Read-back: the diff contains **no** change to `SKIP_REASONS`, the validation ladder,
   `resolveGrounded`, `appendEvidenceEntry`, `buildNewsKey`, `NEWS_KEY_RE`, the identity tuple,
   `REQUEST_SCHEMA`, `tools`, `DEFAULT_TIMEOUT_MS`, or any export.
10. Read-back: **no same-theme, conference-PR, volume or count wording** anywhere (C-3 deferred).

## 7 · STOP conditions

The five standing conditions, plus:

1. Any file beyond the two in scope — **including `qa/news_catalysts_core_offline.js`**.
2. The core suite failing or needing a fixture change — **evidence H-C altered validation**.
3. **Any change to `resolveGrounded` or grounding validation.** Q-3 is fixed by instructing the
   model, never by accepting unretrieved URLs.
4. Any new skip reason; `SKIP_REASONS` stays **12**.
5. Any ladder branch, dedup, or Evidence Set read by a decision.
6. **Any C-3 wording** — same-theme, conference-PR, volume- or count-based materiality.
7. Any numeric threshold, in prompt or code.
8. Replacing rather than extending the existing R-1 date wording.
9. Any identity, persistence, contract, transport, timeout, retry or Netlify change.
10. Any provider test other than NP01 moving, or any new test outside NP46/NP47/NP49.
11. Any live API call. **Pilot 4 is a separate Owner-approved task.**

## 8 · Pilot 4 acceptance criteria

Same three tickers — **NVDA · FROG · MRNA** — same harness, same method, one `nowIso`, **no retry, no
timeout override**. Scored against **Pilot 3**.

**Blocking — behavioural closure of H-A + H-C:**

| Gate | Criterion |
|---|---|
| **P4-1** | **The MRNA convertible date regression does not reproduce.** If a convertible/debt offering appears, `eventDate` is the announcement/pricing date, not the completion/indenture date. **A third reproduction means prompt-only is insufficient for this behaviour** and the next option is a deterministic design question for S2, not another prompt edit |
| **P4-2** | **Q-3 rate = 0.** No item lost to a `sourceUrl` absent from the Evidence Set. Measured deterministically post-hoc from captured evidence — **no new skip reason and no production change required**. The **NVDA Q2 FY27 earnings** item is the named regression case |
| **P4-3** | **No mis-grounding introduced.** No surviving item is grounded on a URL that was retrieved but does not report that event — the failure C-2's omit-clause exists to prevent. Human review. **If this rises, C-2 made things worse** |
| **P4-4** | **No coverage regression.** Surviving-item count not materially below Pilot 3. **Any correct item newly lost blocks closure** |

**Mechanical — must not regress:** H-B rules still fire, `GENERIC_SOURCE_URL` and
`FUTURE_DATED_CATALYST` counted separately · 17-field contract, identity, keys and
`DUPLICATE_IN_BATCH` unchanged · `qa:offline` PASS at 43.

**Observational, not gates:** FROG same-theme PR volume *(C-3 deferred — recorded, not acted on)* ·
upcoming-event counts · latency headroom near the 45 s default · `fetch_url_results` returning
model-written summaries · Q-1 and Q-2 rates.

## 9 · Definition of done

The instruction text carries C-1 and C-2 with the original R-1 wording intact and no numeric
threshold; both prompt copies are character-identical and differ from `336ff96` only by those
additions. **No mechanism was added:** `SKIP_REASONS` still 12, ladder unchanged, `resolveGrounded`
untouched, no Evidence Set read, request shape and schema unchanged. No C-3 wording is present.
`qa:offline` PASS at 43; provider **47/47** with NP46/NP47/NP49 added; **core 30/30 with
`qa/news_catalysts_core_offline.js` unmodified**; route and instruction-layer suites pass unmodified.
The implementation diff is exactly two files. `review.md` carries a `## Lessons` section, the two-row
"Files changed" block, and the final-check line.

**Not claimed by this task:** that either rule changes model behaviour. H-C ships instructions;
**Pilot 4 measures whether they worked.**

---

## Appendix · Status recorded with this brief

| Item | Status |
|---|---|
| **Q-3** | **NEW CLASS** — evidence exists **+** model emitted the event **+** event lost because `sourceUrl` was not retrieved. Distinct from Q-1 and Q-2 |
| **H-0 / DR-19 / DR-23** | **CLOSED.** Pilot 3 proved the Agent emits `upcoming_event` candidates — three survived, `direction: null`, `INVALID_DIRECTION` fired **zero** times. Pilot 2's zero-upcoming result was **emission-side**, not a mechanical direction rejection |
| **DR-25** | **still deferred to S2** — no cross-URL dedup in S1.5.1 |
| **C-3** | **deferred** — S2 / later behavioural observation |
| **H-C scope** | **C-1 + C-2 only** |
| MRNA FDA approval | resolved in Pilot 3 — evidence entered, emitted, survived |
| MRNA INTerpath Phase 3 | **Q-2** for this run/window, with the report's stated caveat |
| NVDA DOJ probe | **Q-2** in Pilot 3 |
| NVDA Q2 FY27 earnings | **Q-3** — the named regression case |
| Latency near 45 s · `fetch_url_results` summaries · source-quality optimisation · latency budget | **S2 / later operational inputs. No timeout change in S1.5.1** |
