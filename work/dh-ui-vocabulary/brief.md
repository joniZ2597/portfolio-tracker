# Task brief: DH-M2 — UI state vocabulary (Night Shift pilot)

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

| | |
|---|---|
| Backlog | **Entry 7** · data-state presentation contract · ARC **DH** · Slice **M2** |
| Baseline | **`98d3d68f038f03432425d03d8ec1f017740f0f51`** = `branch-dev` = `origin/branch-dev` (DH-M1 landed) |
| Branch / slot | new `task/dh-ui-vocabulary` from current `branch-dev`, in **Worker A** (`pt-wt-worker-a`) |
| Mode | **Night Shift pilot** — unattended, one task, 90-minute wall-clock cap, STOP before commit (§9) |
| `qa:offline` | **48 → 49** — one new auto-discovered suite; `qa/run-offline.js` **not** edited |
| Lane | **B** (`index.html`) |
| Status | **CODE-READY on Owner approval of these exact contents** |

**Objective.** Apply the already-ratified display vocabulary to a small, fixed set of existing UI
surfaces, **by mechanical mapping only**, reusing DH-M1's single display table. Wording/display only.

---

## 1 · Standing rulings carried in (not reopened)

| Ruling | Source |
|---|---|
| **D2** — display words `Current` · `Stale` · `Not recorded` · `Unavailable (reason)`; internal codes unchanged | DH-M0b, Owner 2026-09-26 |
| **D3** — `Refresh failed` only where the state means refresh failure (already applied by DH-M1; not touched here) | DH-M0b, Owner 2026-09-26 |
| **D1** — one freshness owner per domain; **no owner, threshold or state semantics change** | DH-M0b, Owner 2026-09-26 |
| DH-M1's `DH_DISPLAY` (`index.html:2680`) + `_dhLabel` (`:2710`) are **the one mapping table** — words come from it | DH-M1 (`98d3d68`) |

## 2 · Implementation file set — exactly 3

```
index.html                               §3 surfaces + one additive `surface` group in DH_DISPLAY
qa/dh_ui_vocabulary_offline.js           NEW — §6
work/dh-ui-vocabulary/review.md          NEW — tracked task artifact
```

## 3 · Surfaces in scope — before → after

All sites are inside **`_renderPortfolioPanel`** (`:9448`) except the banner (**`checkAndShowStaleBanner`**
`:15356`). Neither function is executed by any offline suite (`qa/run-offline.js` only stubs the
panel name), so these sites **may call `_dhLabel`**.

| # | Surface · anchor | Internal state (unchanged) | Before | After (word source) |
|---|---|---|---|---|
| U1 | FX chip `:9751-9753` | `fxState === 'stale-invalid'` (the `else` branch) | `FX <rate·date·src> — stale, not used in totals` | `FX <rate·date·src> — Stale, not used in totals` (`_dhLabel('state','stale-invalid')`) |
| U2 | Recon chip `:9809-9810` | `recon.status === 'unset'` | `Broker total — (not recorded)` | `Broker total — Not recorded` (`_dhLabel('state','unset')`) |
| U3 | Recon chip `:9811-9813` | `'invalid'` | `Broker total — (data invalid)` | `Broker total — Unavailable (invalid record)` (`_dhLabel('state','invalid')`) |
| U4 | Recon chip `:9814-9816` | `'stale'` | `Comparison may be stale` | `Broker total — Stale` (`_dhLabel('state','stale')`) |
| U5 | Recon chip `:9817-9819` | `'total-incomplete'` | `Reconciliation unavailable` | `Reconciliation — Unavailable (totals incomplete)` (`_dhLabel('state','total-incomplete')`) |
| U6 | Position P/L line `:10215-10219` | `!pl3.fxUsable` | `Unrealized P/L (ILS) — FX unavailable` | `Unrealized P/L (ILS) — Unavailable (FX rate not usable)` (new `DH_DISPLAY.surface` key) |
| U7 | Research badge `:10280-10284` | `res._aiUnavailable === true` | `AI unavailable` | `Unavailable (AI analysis)` (new `DH_DISPLAY.surface` key) |
| U8 | Scan banner `:15374` | age > `STALE_RESULT_THRESHOLD_MS` | `Results from <date> — re-run scan for latest data` | `Stale — results from <date> · re-run scan for latest data` (`_dhLabel('state','stale')`) |

**`DH_DISPLAY` addition — additive only:** one new group
`surface: { 'pl-fx-not-usable': 'Unavailable (FX rate not usable)', 'ai-unavailable': 'Unavailable (AI analysis)' }`.
No existing key, value or group changes.

## 4 · Out of scope

**Ruled by the Owner (2026-09-26) but OUT OF SCOPE for this pilot — leave byte-unchanged:**

The rulings are recorded here so the Night Worker never has to infer them. **They are not
implemented in this Slice** (Owner pilot-scope ruling: DH-M2 stays exactly U1–U8). Touching any of
these surfaces is a HOLD (§9).

| Ruling | Surface (unchanged in this pilot) | Ruled display (future slice) |
|---|---|---|
| **R1 — FX never fetched** (`fxState === 'missing'`). Externally sourced data that was not obtained, not owner-maintained data never recorded | chip `FX unavailable` (`:9736`), attention title `FX rate unavailable` (`:9352`), completeness `USD holdings excluded — FX unavailable` (`:9028`), EOD limitation (`:2991`) | `Unavailable (no rate fetched)` |
| **R2 — FX old but still usable** (`aged-but-valid`). If the FX domain owner still treats the rate as valid for calculations it is **Current**; usable FX is never labelled Stale; `Stale` is reserved for FX outside the valid-use window (`stale-invalid`) | chip `(aged)` (`:9748-9750`) | `Current · N d old` |
| **R3 — no research result exists** | research badge `No research` (`:10276-10279`) | `Not recorded` |
| **R4 — scan date unknown** | scan banner (`:15366`) | `Unavailable (scan date unknown)` |

**Recorded follow-up — not implemented now:** after the Night Shift pilot, check DH-M1's EOD/export
wording against R1 and R2. Today `DH_DISPLAY` maps FX `missing` → `Not recorded` (`fx-missing` →
*"FX rate: Not recorded"*) and FX `aged-but-valid` → `Stale` (`fx-aged` → *"FX rate: Stale"*). This
Slice **must not** change those `DH_DISPLAY` entries (UV-5).

**Deliberately excluded (no ruling needed):** needs-attention titles (`_pfComputeNeedsAttention` —
transported into the EOD export and the P-5 prompt context; function is executed standalone by
`qa/run-offline.js`) · completeness reasons (`_pfComputePortfolioReporting` — packet/prompt input) ·
AI summary text in `renderMainPanel` (caliper-pinned; not a state chip) · the `AI_UNAVAILABLE`
attention-level label `'AI unavailable'` (`:8043`, main-panel attention model) · cloud-sync messages
(dormant, gated) · `Research` / `Unsupported symbol` / reconciled / unexplained-gap texts (not
freshness/availability states) · `Refresh failed` sites (DH-M1) · DH-M3 export warning · Entry 11.

## 5 · Preservation rules

1. **Every branch condition is byte-unchanged** (`fxState === …`, `recon.status === …`,
   `!pl3.fxUsable`, `res._aiUnavailable === true`, the banner age test). Only the string assigned
   changes.
2. **Styles unchanged** — colours, classes, `title` tooltips, DOM structure.
3. **No threshold, owner or semantic change:** `PF_*`, `STALE_RESULT_THRESHOLD_MS`, `_pfFxState`,
   `_pfComputeReconciliation`, `_researchViewForHolding`, `_pfEodIsStale`, J7 — byte-unchanged.
4. **No Score/ranking/recommendation, persistence, schema, `pt_*` change.**
5. `DH_DISPLAY` changes are **additive** (the `surface` group only); `_dhLabel` unchanged.
6. No edit to `qa/run-offline.js`, `BACKLOG.md`, `AGENTS.md`, `CLAUDE.md`.

## 6 · Targeted QA — `qa/dh_ui_vocabulary_offline.js`

Static structural assertions over `index.html` (DH-M1 suite pattern), each with a control.

| ID | Assertion |
|---|---|
| **UV-1** | Each U1–U8 site renders its **after** text: the site references `_dhLabel(…)`/`DH_DISPLAY.surface[…]` with the listed code, and evaluating `DH_DISPLAY` yields the listed words. *Control:* a fixture keeping a before-literal fails |
| **UV-2** | Every U1–U8 **before** literal is absent **at its site** (site-scoped: the same words legitimately remain elsewhere, e.g. the out-of-scope `'AI unavailable'` attention label at `:8043`) |
| **UV-3** | **Conditions unchanged** — the branch-condition texts for U1–U8 are present exactly as at baseline |
| **UV-4** | **Out-of-scope sites unchanged** — the §4 ruling-required literals (`'FX unavailable'` chip, `'(aged)'`, `'No research'`, the date-unknown banner, `'FX rate unavailable'`, `'USD holdings excluded — FX unavailable'`) are each still present exactly once where they were |
| **UV-5** | `DH_DISPLAY` additive — every baseline key/value still equal; only `surface` added with exactly the two §3 entries |
| **UV-6** | No threshold drift — `PF_*` constants, `STALE_RESULT_THRESHOLD_MS` values equal baseline; `_pfEodIsStale`, `_pfFxState`, `_pfComputeReconciliation`, `_pfComputeNeedsAttention`, `_pfComputePortfolioReporting` extracted sources byte-equal (CR-normalized) to baseline |
| **UV-7** | No new `pt_*` access, no `localStorage.setItem`, no call into scoring (`orchestrate`, `analyzeChunk`, `enforceScoreConsistency`) introduced in the changed functions |

Targeted run: `node qa/dh_ui_vocabulary_offline.js` + `node qa/eod_packet_v0_offline.js` (DH-M1's
RD-D2 table checks must stay green) → full `npm run qa:offline` (**49**).

## 7 · Known source pins that may be affected

**None expected.** No caliper-pinned function is touched (`renderMainPanel`, `_srRenderGrouped`, …).
`qa/eod_packet_v0_offline.js` extracts `DH_DISPLAY` and checks `verdict` exactly plus spot `state`
values — an additive `surface` group keeps them green. **Any failing existing pin is an M4 diagnosis,
not a re-pin licence:** no existing QA file is in the file set, so a needed re-pin is a **STOP (HOLD)**.

## 8 · Acceptance criteria

U1–U8 render the after text; UV-1…UV-7 pass with controls; all existing suites green unchanged;
`qa:offline` **49** PASS; diff limited to §2; `review.md` carries the before/after table, QA results,
Codex ledger, `## Lessons`, files-changed block and final-check line.

## 9 · Night Shift execution rules

- **One task only**, Worker A, branch `task/dh-ui-vocabulary` from current `branch-dev`.
- Order: implementation → targeted QA → full `qa:offline` → **independent Codex read-only review
  (Worker-launched, raw output in `codex.md`)** → fixes → final Codex check → **STOP before commit**.
  No staging required.
- **90-minute wall-clock cap**; at the cap, STOP with state recorded in `review.md`.
- **Max two M4 diagnosis passes**; a third unexpected failure is a HOLD.
- **HOLD / STOP when:** any file outside §2 is needed · any §4 surface would have to change · an
  existing QA pin fails and needs a re-pin · a condition, threshold, owner or semantic would change ·
  a wording choice is not a mechanical `DH_DISPLAY` mapping · the pre-edit `qa:offline` baseline is not
  48 green · the cap or the M4 limit is reached.
- **No invented Owner rulings.** Anything in §4 stays byte-unchanged.
- **Never:** commit, push, LAND, deploy, touch `main`, change env, or run live/runtime actions.
