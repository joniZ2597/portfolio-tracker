# Capability breakdown: Scan action gate (setup → action enforcement)

> Created 2026-10-19 from the MAIN Phase 1 scoring diagnosis and the Owner rulings DR-1 / DR-2 /
> DR-3, D1–D11, F1, Q1–Q3. Child task: `work/scan-action-gate-1/` (this capability's only v1
> child). **Where this file and the approved brief differ, the brief wins.**

## 1 · Outcome

The scan's Actionable Take action always fits the deterministic technical setup for setups 1–7.
An invalid or unsupported AI action is never turned into another add; AI `trim` / `avoid` risk
warnings are kept; the deterministic setup is the only setup the product uses. Scores are not
changed by any new logic. **Known limitation (D11-D):** on `unknown` the AI action still passes
through unchanged — this is **not** complete eight-setup enforcement.

## 2 · Current / Change Map

| Surface | Today | Change |
|---|---|---|
| Client | the scan scoring step in `index.html` gates the action for `extended_near_ath` and `below_key_mas` only; keeps the AI setup claim when the deterministic setup is `unknown` | modify — action gate for setups 1–6 inside that scoring step; DR-2 setup authority |
| Server functions | not involved | none |
| Storage / schema | `pt_results` item shape | none — same fields; new scans may store a different `action` / `technical_setup` value |
| Scores / Actionable Take | AI score + four existing clamps; action prompt-only for 6 setups | modify — Actionable Take action for setups 1–6; **no score logic added** (D10 edge accepted) |
| Persistence | saved results restored as stored | none — no migration (D8); legacy results keep their stored action until rescan |
| Gates / environment | no flag | none — Gate Verification feature flag N/A (Owner Q2) |
| QA | offline suites pin the scan scoring step or the whole page file | modify — the pinned digests are re-pinned and the pin map regenerated; a new offline suite covers the gate |
| Deploy / external | none | none — no live AI call, no DEV scan in this task |
| Docs | prompt contract lists fewer actions than the code accepts | none — the prompt is unchanged (Q1 = X); the safety exception is documented in the brief and a code comment |

## 3 · Decisions

All Owner-answered 2026-10-19 (see Domain logic for DR-1 / DR-2):
- **DR-3:** no score manipulation; prompt and ETF recalibration deferred; missing action chips are a
  separate UI issue.
- **Q1 = X:** prompt unchanged; documented safety exception (below). **Q2:** feature flag N/A.
- **D2** keep AI `trim` / `avoid` · **D4** `breakdown_risk` hold → `avoid` · **D6** trim + lowercase,
  else unrecognised · **D7** console-only override log · **D8** new scans only · **D9 / D10** DR-2
  and its 62-cap consequence accepted · **F1** `extended_near_ath`: `hold` → `hold_wait`.
- **D11 = D:** the `unknown` gate (Q3) is **not** in this task; follow-up D11-A owns it.

## 4 · Unknowns / Gaps

None blocking v1. Known gaps, all routed out (Not in v1). Per-ticker causes of the observed
PLTR / IGV / MSTR / ARM results stay unevidenced (no raw AI responses exist); this capability fixes
the structural path, not a named ticker.

## 5 · Split / Dependencies

One child: `scan-action-gate-1` (this folder). No dependency on an unlanded task. It shares
`index.html` and the pin map with any concurrent `index.html` task — not parallel with one.

## 6 · Not in v1

- **D11-A (required follow-up):** on `unknown`, suppress the action **and** change the main ticker
  panel so Key Risk, Conflict, Invalidation, Bias and Entry Zone still render when the action is
  null (today the whole block hides when the action is empty).
- Missing action chips in the portfolio row / research detail panel (allowlist `buy` / `hold_wait`
  / `avoid` only) — separate UI issue.
- Prompt-contract alignment, AI score calibration, ETF-specific calibration (DR-3, deferred).
- R10-E guard false positive — separate governed docs task registers BACKLOG entry 39 (Owner B).
- The existing `extended_near_ath` gate throws on a truthy non-string action — recorded, not fixed
  here.

## Domain logic

**Vocabulary.** *Setup* — the eight deterministic `classifyTechnicalSetup` values. *Action enum* —
`hold_wait`, `hold`, `add_on_pullback`, `add_on_reclaim`, `add_on_breakout`, `trim`, `avoid`; `buy`
is recognised as an add. *Add* — `add_*` or `buy`. *Risk warning* — `trim` or `avoid`.
*Unrecognised* — missing, null, non-string, or any string not in the enum after trim + lowercase.

**Inclusion / boundary.** Applies to new scans, non-failed items (`_aiUnavailable !== true`) only.
Setups 1–6 are gated by DR-1; setup 7 keeps its existing gate unchanged; `unknown` is not gated.

**Precedence.** The existing `extended_near_ath` / `below_key_mas` gates and clamps run first,
unchanged; the DR-1 gate runs after them. A valid AI action passes in canonical (lowercase) form.
An invalid one becomes the setup's single fallback. The code never chooses `trim`.

**Safety exception (Q1 = X).** The code accepts more than the unchanged prompt lists, only in the
safer direction: `hold_wait` for setups 4–5 and the AI's own `trim` / `avoid` for setups 1–5.

| Ruling | Rule | Positive example | Negative / boundary example | Test |
|---|---|---|---|---|
| **DR-1 row 1** `extended_near_ath` | allowed `hold_wait` `trim` `avoid`; fallback `hold_wait` | `add_on_breakout` → `hold_wait`; **`hold` → `hold_wait` (F1)** | `trim` stays `trim` | SG-1, SG-4 |
| **DR-1 row 2** `healthy_uptrend_near_ath` | allowed `hold_wait` `add_on_pullback` `trim` `avoid`; fallback `hold_wait` | `add_on_breakout` → `hold_wait` (never `add_on_pullback`) | `add_on_pullback` stays | SG-1, SG-3 |
| **DR-1 row 3** `healthy_uptrend` | allowed `hold` `add_on_pullback` `add_on_breakout` `trim` `avoid`; fallback `hold` | `add_on_reclaim` → `hold`; `hold_wait` → `hold` | `add_on_breakout` stays | SG-1, SG-3 |
| **DR-1 row 4** `pullback_in_uptrend` | allowed `add_on_reclaim` `add_on_pullback` `hold_wait` `trim` `avoid`; fallback `hold_wait` | `add_on_breakout` → `hold_wait`; `hold` → `hold_wait` | `add_on_reclaim` stays | SG-1, SG-3 |
| **DR-1 row 5** `support_test` | allowed `add_on_pullback` `hold_wait` `trim` `avoid`; fallback `hold_wait` | `add_on_reclaim` → `hold_wait`; `buy` → `hold_wait` | `add_on_pullback` stays | SG-1, SG-3 |
| **DR-1 row 6** `breakdown_risk` | allowed `trim` `avoid`; fallback `avoid` (D4) | `add_on_pullback` → `avoid`; `hold_wait` → `avoid` | `trim` stays (never forced to sell, never fabricated) | SG-1, SG-4 |
| **DR-1 row 7** `below_key_mas` | existing gate, unchanged: every action → `avoid` | `trim` → `avoid` | — | SG-2 |
| **DR-1 row 8** `unknown` | **not gated (D11-D)**; AI action unchanged — known limitation | `add_on_breakout` stays `add_on_breakout` | — | SG-5a |
| **DR-1 D6** normalisation | trim + lowercase before matching; output is canonical | `' Add_On_Pullback '` on row 2 → `add_on_pullback` | `strong_buy` / `null` / `7` on row 2 → `hold_wait` | SG-1 |
| **DR-1 R3** scope | failed items untouched | `_aiUnavailable` item: no `action` key | — | SG-7 |
| **DR-2** setup authority | `technical_setup` = deterministic value; `unknown` when classification is `unknown` | AI claims `healthy_uptrend`, code `unknown` → `unknown` | code `support_test` → `support_test` whatever the AI said | SG-5b |
| **DR-2 D10** cap consequence | no 62 cap from an AI-claimed `extended_near_ath` when the code says `unknown` | AI claim + score 90 + code `unknown` → score 90 | code `extended_near_ath` + 90 → 62 (unchanged) | SG-6 |
| **DR-3** no score logic | the gate writes only `action`; DR-2 writes only `technical_setup` | every non-action field equals the reverted function | D10 case excluded (SG-6) | SG-8 |
