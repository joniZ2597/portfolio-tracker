# Census — Entry 7 closure (post DH-M4b)

Read-only. Base: `task/dh-fx-aged-current` @ `e27ce1c` = `branch-dev` = `origin/branch-dev`
(verified identical, §0). No product or QA file touched by this task.

## 0. Base identity

```
git log --oneline -1                  → e27ce1c feat(eod): treat aged-but-valid FX as Current with day age (DH-M4b)
git log --oneline branch-dev -1       → e27ce1c (same)
git log --oneline origin/branch-dev -1 → e27ce1c (same)
git status --short --branch           → ## task/dh-fx-aged-current (clean, no modified/staged/untracked repo files)
```

## 1. Method

1. Read `DH_DISPLAY` (`index.html:2680-2711`) and `_dhLabel`/`_dhFxAgedLabel` (`:2714-2723`) —
   the current shared vocabulary and its single accessor.
2. Enumerated every call site of `_dhLabel(...)`, `_dhFxAgedLabel(...)` and
   `DH_DISPLAY.<group>[...]` file-wide (`grep -n "_dhLabel(\|_dhFxAgedLabel("`) — these are the
   PASS set by construction (one source, one word).
3. Read the five Entry-7 surfaces end to end: UI render (`_renderPortfolioPanel` FX chip /
   Total qualifier / Reconciliation / Research-state badge / stale-scan banner), export
   (`_eodPacketToMarkdown`), briefing (`_eodPacketToBriefing`), pre-export warning
   (`_eodPreExportWarning`/`EOD_PREEXPORT_COPY`), Needs Attention
   (`_pfComputeNeedsAttention`, `_pfComputePortfolioReporting`).
4. Grepped `index.html` file-wide for `textContent`/string-literal assignments containing
   `Stale|Unavailable|Degraded|Failed|Missing|Current|Partly out of date` that do **not** call
   `_dhLabel`/`DH_DISPLAY`/`_dhFxAgedLabel`, to catch any site the walkthrough missed.
5. Cross-checked the three completed "what remains" items from BACKLOG Entry 7 ((a) R2 aged
   FX, (b) R1 export/prompt sites, (c) DH-M3 pre-export warning) against their landed reviews:
   `work/dh-fx-aged-current/review.md` (DH-M4b, `e27ce1c`), `work/dh-fx-export-wording/review.md`
   (DH-M4a, `99d4844`), `work/dh-preexport-warning/review.md` (DH-M3, `6e3e64d`).
6. Re-ran the two offline suites that pin the sites below, to confirm current PASS and that the
   cited fixture text is live, not stale documentation: `node qa/eod_packet_v0_offline.js` →
   `EOD PACKET V0: PASS (191 asserts)`.

## 2. Census — approved-mapping sites (PASS)

| # | Visible wording / state | Source function / anchor | From approved mapping? | Result | Evidence |
|---|---|---|---|---|---|
| 1 | FX chip: `FX <rate·date·BOI>` (fresh) | `_renderPortfolioPanel` `:9786` | n/a — fresh FX carries no state word | PASS | no DH word rendered; matches brief table row "fresh" |
| 2 | FX chip: `FX <rate·date·BOI> — Current · N d old` (aged-but-valid) | `_renderPortfolioPanel` `:9788`, via `_dhFxAgedLabel` → `_dhLabel('state','aged-but-valid')` | Yes — `DH_DISPLAY.state['aged-but-valid'] = 'Current'` | PASS | `index.html:2684,2721-2723,9788`; `' (aged)'` occurs 0× file-wide (confirmed §4) |
| 3 | FX chip: `FX <rate·date·BOI> — Stale, not used in totals` (stale-invalid) | `_renderPortfolioPanel` `:9791`, `_dhLabel('state','stale-invalid')` | Yes — `DH_DISPLAY.state['stale-invalid'] = 'Stale'` | PASS | `index.html:2684,9791` |
| 4 | FX chip: `Unavailable (no rate fetched)` (missing) | `_renderPortfolioPanel` `:9775`, `DH_DISPLAY.surface['fx-not-fetched']` | Yes | PASS | `index.html:2709,9775` |
| 5 | Total qualifier: `FX as of <date> — Current · N d old` | `_renderPortfolioPanel` `:9812`, `_dhFxAgedLabel` | Yes | PASS | `index.html:9812` |
| 6 | Reconciliation: `Broker total — Not recorded` / `… Unavailable (invalid record)` / `… Stale` / `Reconciliation — Unavailable (totals incomplete)` | `_renderPortfolioPanel` `:9849,9851,9854,9857`, `_dhLabel('state',…)` | Yes — `state['unset'\|'invalid'\|'stale'\|'total-incomplete']` | PASS | `index.html:2686-2690,9849-9857` |
| 7 | Research-state badge: `Not recorded` (no result) | `_renderPortfolioPanel` `:10317`, `_dhLabel('state','missing')` | Yes | PASS | `index.html:2686,10317` |
| 8 | Research-state badge: `Unavailable (AI analysis)` | `_renderPortfolioPanel` `:10322`, `DH_DISPLAY.surface['ai-unavailable']` | Yes | PASS | `index.html:2708,10322` |
| 9 | Scan stale banner: `Unavailable (scan date unknown) — results from a previous session …` | `checkAndShowStaleBanner` `:15413`, `DH_DISPLAY.surface['scan-date-unknown']` | Yes | PASS | `index.html:2709,15413` |
| 10 | Scan stale banner: `Stale — results from <date> …` | `checkAndShowStaleBanner` `:15421`, `_dhLabel('state','stale')` | Yes | PASS | `index.html:2684,15421` |
| 11 | Export/briefing readiness `Verdict:` line | `_eodReadinessLines` `:2828`, `_dhLabel('verdict',…)` | Yes | PASS | shared by `_eodPacketToMarkdown`/`_eodPacketToBriefing` (`:3095,3182`) |
| 12 | Export/briefing readiness `Reason:` lines (incl. `fx-aged`/`fx-missing`) | `_eodReadinessLines` `:2830`, `_dhLabel('reason',…)` | Yes | PASS | `index.html:2692-2703,2830` |
| 13 | Export/briefing readiness `Market:` line | `_eodReadinessLines` `:2833-2836`, `_dhLabel('state', m.state)` | Yes | PASS | — |
| 14 | Export/briefing readiness `FX:` line — `Current` (fresh/aged-but-valid) or `Stale` (stale-invalid), each with `[<code>]` suffix only for aged-but-valid/stale-invalid | `_eodReadinessLines` `:2837`, `_dhLabel('state', d.fx.state)` | Yes, for the word itself; the bracketed internal code is a deliberate, brief-ruled disambiguation annotation, not a second word | PASS | ruled explicitly in `work/dh-fx-aged-current/brief.md:147,162-163` ("`FX: Current [aged-but-valid]`"); proven live by `RD-AG2` (`work/dh-fx-aged-current/review.md` QA) |
| 15 | Export/briefing readiness `Positions:` line | `_eodReadinessLines` `:2838-2839`, `_dhLabel('state','needs-confirmation')` | Yes | PASS | — |
| 16 | Export/briefing readiness `Cash:` line | `_eodReadinessLines` `:2840`, `_dhLabel('state', d.cash.condition)` | Yes | PASS | — |
| 17 | Export/briefing readiness `Reconciliation:` line | `_eodReadinessLines` `:2841`, `_dhLabel('state', d.reconciliation.status)` | Yes | PASS | — |
| 18 | Pre-export warning heading + reason lines | `_eodPreExportWarning` `:2860-2871`, `_dhLabel('verdict'\|'reason', …)` | Yes | PASS | DH-M3, `work/dh-preexport-warning/review.md` PX-1..PX-9 PASS |
| 19 | Needs Attention title: `FX rate: Unavailable (no rate fetched)` / `FX rate: Stale` | `_pfComputeNeedsAttention` `:9391` | Yes — literal text identical to `DH_DISPLAY.reason['fx-missing'\|'fx-aged']` (hand-matched, not a `_dhLabel` call, but text-identical and hash-pinned) | PASS | `index.html:2696,2698,9391`; ruled in DH-M4a (`work/dh-fx-export-wording/review.md`, UV-6 hash re-pin on this function) |
| 20 | Completeness reason: `USD holdings excluded — FX: Unavailable (no rate fetched)` / `… FX: Stale` | `_pfComputePortfolioReporting` `:9067-9068` | Yes — same basis as #19 | PASS | `index.html:9067-9068`; DH-M4a review, UV-6 hash re-pin on this function |

**Approved-mapping sites: 20/20 PASS.** `' (aged)'`, `'FX rate unavailable'` and
`'USD holdings excluded — FX unavailable'` (the three pre-DH-M4a/M4b literals) occur **0 times**
file-wide (`grep -c` confirmed).

## 3. Leftover gap — found

| # | Visible wording / state | Source function / anchor | From approved mapping? | Result | Evidence |
|---|---|---|---|---|---|
| G-1 | Export/briefing limitation line, `fx` code: for **missing** → `'FX: Unavailable (no rate fetched) — cross-currency totals are not reported.'`; for **stale-invalid** → `'FX: Stale — cross-currency totals are not reported.'`; for **every other state** (fresh / current / aged-but-valid) → `'FX: rate <rate>, USD/ILS, as of <effectiveAt>, ' + reporting.fxState + '.'` — the internal code (`'fresh'`, `'current'`, or `'aged-but-valid'`) is concatenated **raw, untranslated**, never through `_dhLabel`/`DH_DISPLAY` | `_eodBuildPacket` `:3025-3030`, rendered verbatim into the export and briefing via `packet.limitations[].text` (`_eodPacketToMarkdown:3095`, `_eodPacketToBriefing:3182`) | **No.** The missing/stale-invalid branches (`:3026,3028`) are independently hand-authored literals that happen to echo `DH_DISPLAY.surface['fx-not-fetched']`/`state['stale-invalid']` text with a different prefix (`'FX:'` vs. `'FX rate:'`/none) — a second, unlinked copy, not a call to `_dhLabel`. The fallback branch (`:3030`) exposes the raw internal `fxState` code directly | **LEFTOVER GAP** | Reproducible: `qa/eod_packet_v0_offline.js:1161-1186` pins the exact exported fixture row `{"code":"fx","text":"FX: rate 3, USD/ILS, as of 2026-09-15T12:00:00.000Z, fresh."}` for an injected `fxState:'fresh'` fixture — i.e. the shipped export literally prints the internal code word `fresh.` to the user, not `Current.`. Re-ran `node qa/eod_packet_v0_offline.js` → `PASS (191 asserts)` confirms this is the current, live behaviour (not stale documentation). For `aged-but-valid`, the same branch would print `…, aged-but-valid.` — explicitly flagged (and left unchanged by design) in `work/dh-fx-aged-current/brief.md:162`: *"limitation line unchanged (`… aged-but-valid.`)"*. |

This is the **only** leftover gap found. It predates DH-M1 (the `fx` limitation entry was never
touched by DH-M1/M2/M2b/M3/M4a/M4b — each brief's "nothing else changes" list for M4a/M4b
explicitly names "the pre-export helper and copy" / "`_eodPacketToMarkdown`, `_eodPacketToBriefing`"
as unedited, and M4b's own lifecycle table (`brief.md:162`) records the limitation line as
"unchanged" by deliberate scope decision, not an oversight newly introduced here).

## 4. Informational — pre-existing, out-of-scope, not an Entry-7 regression

| # | Visible wording | Source function / anchor | Why out of scope |
|---|---|---|---|
| I-1 | ResearchView result badge: `'Stale'` (vs. `'Research'` when not stale) | `_renderPortfolioPanel` `:10329`, `resStEl.textContent = isStale ? 'Stale' : 'Research'` — coincidentally text-identical to `DH_DISPLAY.state['stale']` but an independent literal, not a `_dhLabel` call | Catalogued in the pre-DH-M1 vocabulary census (`work/dh-vocabulary-census/census.md:277,476`) as one of ten **local** vocabularies (`ResearchView status`) that DH-M0b's ownership table was to decide "inside or outside the shared contract" — that decision was never made, and no Entry-7 ruling (DH-M1/M2/M2b/M3/M4a/M4b) claims this site. Not part of BACKLOG Entry 7's committed "what remains" (a)/(b)/(c). Carried over unchanged; not a new gap. |
| I-2 | API connection table: `'● Failed'`, `'● Connected'`, `'● Timeout'` (`:15632,15687` and others) | Settings-page API-key connectivity checker | A different domain entirely (API-key reachability, not portfolio data freshness); the pre-DH-M1 census already classed this family as "other (not in §3 list)". No collision with `DH_DISPLAY` words in meaning or in the Entry-7 "Degraded/Missing/Failed" presentation-contract text (that absorption targets EOD/price/FX/research data states, not API diagnostics). |
| I-3 | BACKLOG.md Entry 7 text is stale | `BACKLOG.md:84-91` | Still reads "What remains: (a) … needs an Owner ruling … (b) … Manual; (c) DH-M3 pre-export warning" even though (a) was ruled and landed as DH-M4b (`e27ce1c`), (b) landed as DH-M4a (`99d4844`), and (c) landed as DH-M3 (`6e3e64d`) — all three are on `branch-dev`/`origin/branch-dev` today. Documentation lag, not a code/wording gap; listed here because the task asked for a proposed BACKLOG line (§5 below). |

## 5. Proposed BACKLOG line (NOT applied — Owner approval required)

Because G-1 (§3) is a real, reproducible leftover gap, Entry 7 is **not** ready for a closure
line. Proposed replacement text for the `*Landed:* … *What remains:* …` paragraph
(`BACKLOG.md:84-91`), to keep the entry open against the one found residual instead of the three
now-stale items:

> *Landed:* DH-M1 readiness block + shared display table (`98d3d68`); DH-M2 U1–U8 display
> vocabulary (`5ad0a5f`); DH-M2b ruled words R1/R3/R4 (`0522247`); DH-M3 pre-export warning
> (`6e3e64d`); DH-M4a ruled FX export/Needs-Attention wording (`99d4844`); DH-M4b aged-but-valid
> FX → Current with day age (`e27ce1c`). *What remains:* the `_eodBuildPacket` `fx` limitation
> line (`index.html:3025-3030`) still hand-authors its own FX wording instead of calling
> `_dhLabel`, and for every FX state except missing/stale-invalid it prints the raw internal
> code (e.g. `fresh.`, `aged-but-valid.`) straight into the export/briefing text — needs its own
> small Manual slice to route through `DH_DISPLAY`/`_dhLabel` before this entry can close.

This is a proposal only; no BACKLOG edit was applied in this task.
