# Task brief: DH-M1 — EOD readiness block + shared state wording

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

| | |
|---|---|
| Backlog | **Entry 7** · EOD data-readiness + data-state presentation contract · ARC **DH** · Slice **M1** (was `WU-EODFRESH` / EODFRESH-1) |
| Preparation baseline | **`c63559f`** = `branch-dev` = `origin/branch-dev` |
| Last validated | `c63559f`, 2026-09-26 — anchors in §2 re-derived at this commit |
| Branch / slot | new `task/dh-readiness-block` in a Worker slot (`pt-wt-worker-a` or `-b`) |
| `qa:offline` | **no suite added** — assertions extend `qa/eod_packet_v0_offline.js` (effective count **48** at `c63559f`) |
| Lane | **B** (`index.html`) — one `index.html` task at a time |
| Status | **CODE-READY on Owner approval of these exact contents** |

**Objective.** Add one computed, honest **readiness judgement** to the EOD packet (JSON → Markdown →
briefing), using only freshness owners that already exist, and apply the ruled display wording to the
states this slice touches. **It does not make any data fresher.**

---

## 1 · Standing rulings carried in (not reopened)

| Ruling | Source |
|---|---|
| **EOD-1 Amendment 2 (readiness)** — verdict ∈ `current · degraded · not-representative`, closed set; never emitted without named reasons (+ symbols); `missing` is a per-dimension condition, never a verdict and never merged into staleness; worst-dimension rollup; market age in **completed sessions**, `ageSessions ≤ 1` = current; positions = `needs-confirmation` only; cash has no expiry; readiness is **additive** and renders before `## Limitations`; no new numeric threshold; no action vocabulary | Ratified 2026-09-16, sha `7510d546…` (§12.3–§12.12) |
| `Q-EF1a-iii` = (a): `pt_eod_cache` entries gain `market · marketBasis · sessionDate`, written in `_pfEodCacheSet` on a successful fetch; never inferred from `sessionEpoch`/`fetchedAt` at read time; legacy entries read `unknown` (fail closed), no migration | Amendment 2 §12.10 |
| `Q-EF1a-iv`: TS1's stricter session tolerance is deliberate — **do not harmonize** | Amendment 2 §12.11 |
| **DH-M0b D1** — one freshness owner **per data domain**: FX → `_pfFxState` (`PF_FX_*`); research/news evidence → J7; EOD prices → completed-session age (`TS1_POLICY_V1.calendar` via `_ts1AgeSessions`); positions → `PF_ATTENTION_STALE_MAX_DAYS` advisory; reconciliation → `_pfComputeReconciliation`; cash → U1. **No global freshness engine** | Owner, 2026-09-26 |
| **DH-M0b D2** — one shared **display** mapping: `Current` · `Stale` · `Not recorded` · `Unavailable (reason)`. Internal codes unchanged | Owner, 2026-09-26 |
| **DH-M0b D3** — the fetch-failure state (`_pfEodIsStale`) displays as **`Refresh failed`**; `_pfEodIsStale` logic unchanged; age-based staleness comes only from readiness | Owner, 2026-09-26 |
| **DH-M0b D4 / Update 1 U1 RATIFIED** — cash: `missing/invalid ⟺ _pfCashLoad().state !== 'recorded'`; `old-user-maintained-state ⟺ recorded AND oldestBaselineAt !== null AND Date.parse(cash.asOf) < Date.parse(oldestBaselineAt)`; else `present` | Owner, 2026-09-26 |
| **DH-M0b D4 (c) — amends `Q-EF-J7`(b):** until `WU-P5J7` exists the research dimension shows **`Research recency: not evaluated`** and **does not lower the verdict**; coverage still contributes as today. J7's 7/30 literals never appear in `index.html` | Owner, 2026-09-26 |

## 2 · Reality check at `c63559f`

| Anchor | State |
|---|---|
| `_pfLiveNormalize` `index.html:10646` | has provider `meta` in hand; returns `{symbol, price, change_percent, source, currency, sessionEpoch}` — **no market identity today** |
| `_pfEodCacheSet` `:10314` | replaces the whole entry: `{price, changePercent, currency, sessionEpoch, fetchedAt}`; called only on success (`:10824`) |
| `_pfEodIsStale` `:10347` | `!!(entry && entry.lastFailAt)` — **must stay byte-unchanged** |
| Market rule (existing authority) | `_ts1FetchRawSeries` `:2107-2115`: `exchangeTimezoneName` `America/New_York`→`US`, `Asia/Jerusalem`→`TASE` (`provider-meta`); `.TA` suffix → `TASE` **only when tz absent** (`symbol-suffix-fallback`); else `null` |
| Session age | `_ts1AgeSessions(dataAsOf, cal, computedAtIso)` `:1627`; calendars in `TS1_POLICY_V1.calendar` `:1424` |
| Packet inputs | `_eodExportPacket` `:2992` → `_p5PreloadContext` `:2393` already carries `holdings · fxCache · cashState · eodCache · reporting`; `reconState` passed separately. `_eodBuildPacket` `:2670` is pure (injected `nowMs`) |
| Markdown | `_eodPacketToMarkdown` `:2866` — `## Limitations` first section after the header |
| Briefing | `NC_BRIEFING_VOCAB` `:2922` (`marketStale` = *"market data for this holding is stale"*, keyed on `eodStale`); `_eodPacketToBriefing` `:2950` |
| Fetch-failure wording today | `_p5RenderPacket` `:2561` `' (stale)'`; portfolio card tag `:10917` `'Stale'` (driven by `_pfEodIsStale` via `:10251`) |
| QA | `qa/eod_packet_v0_offline.js` — **NB-4 pins a hash of `_eodPacketToMarkdown`'s source** (`:669-680`); NB tests assert the `marketStale` sentence (`:750`, `:824-834`) |

## 3 · Scope — exactly these changes

1. **Market identity at the fetch boundary.** `_pfLiveNormalize` additionally returns `market`,
   `marketBasis` and `sessionDate`, using the **same** market rule as `_ts1FetchRawSeries` (one shared
   definition preferred; TS1 outputs must be byte-equivalent — its existing QA must stay green
   unchanged). `sessionDate` = exchange-local `YYYY-MM-DD` from `sessionEpoch` **and** the resolved
   market's calendar `timeZone`; `null` if either is absent.
2. **`_pfEodCacheSet`** writes those three fields into the entry (whole-entry replace, as today).
   No migration, no backfill; legacy entries read `unknown`.
3. **Readiness computation** — one pure function called from `_eodBuildPacket`, reading only
   `args`/`preload`/`reconState` and the injected `nowMs`. Output `packet.readiness`:
   `verdict` · `reasons[]` (class, and symbols for per-symbol classes) · `dimensions` with
   **market** (per symbol: `current` / `aged` + `ageSessions` / `unknown` + `marketBasis`) ·
   **fx** (`_pfFxState` verbatim) · **positions** (`needs-confirmation` symbols) · **cash**
   (U1 condition + `asOf`) · **reconciliation** (`recon.status`) · **research** (coverage counts +
   `recency: 'not-evaluated'`, excluded from the verdict per D4c). Rollup per Amendment 2 §12.8.
4. **Markdown** — a `## Readiness` section **before** `## Limitations`, a deterministic projection of
   `packet.readiness` (nothing the JSON lacks), labels from the D2 table.
5. **Shared display mapping** — one table (single location) mapping internal codes to
   `Current` · `Stale` · `Not recorded` · `Unavailable (reason)` · `Refresh failed` and the verdict
   labels `Current` · `Partly out of date` · `Not representative`, plus `Research recency: not
   evaluated`. Used by the Markdown and the briefing.
6. **Briefing** — `_eodPacketToBriefing` speaks the readiness verdict and its reasons (transported,
   not recomputed); `NC_BRIEFING_VOCAB.marketStale` wording becomes the D3 meaning (the last refresh
   for the holding failed). Key names unchanged.
7. **D3 relabel at the two existing fetch-failure displays** — `:2561` `' (stale)'` →
   `' (refresh failed)'`; `:10917` `'Stale'` → `'Refresh failed'`. Logic and CSS class unchanged.
8. **QA** in `qa/eod_packet_v0_offline.js`: Amendment 2 **AC1–AC15**, planted negatives **N1–N5**
   (EODFRESH plan §4), plus: **R-J7** research `not-evaluated` never lowers the verdict (planted
   negative: remove it and the verdict is unchanged); **R-U1** the three cash conditions from the
   ratified predicate; **R-D3** no `' (stale)'`/`'Stale'` text remains on a fetch-failure display and
   `_pfEodIsStale` is byte-unchanged; **NB-4 deliberately re-pinned** (new hash recorded with an
   extracted-source diff in `review.md`); NB `marketStale` assertions updated to the D3 wording.

## 4 · Out of scope

Any threshold change (no new `*_DAYS`/`*_MS`, no day-in-ms literal, no arithmetic on `fetchedAt` in
the readiness path) · `_pfEodIsStale` logic · J7 or any server file · `WU-P5J7` · harmonizing TS1's
tolerance · scoring, ranking, `status` (stays research coverage) · pre-export UI warning
(AC16/AC17 — DH-M3 / EODFRESH-2) · applying the D2 wording to other UI surfaces (FX chip, recon chip,
research badge, scan banner — **DH-M2**) · `pt_*` writes during packet build · backup schema ·
forbidden keys / action vocabulary.

## 5 · Expected implementation files — **2**

```
index.html                           §3 items 1-7
qa/eod_packet_v0_offline.js          §3 item 8
work/dh-readiness-block/review.md    NEW — tracked task artifact
```

**QA suites that read in-scope files as text:** `eod_packet_v0_offline.js` (extended here; NB-4
re-pinned) · `p5_packet_offline.js`, `p5_call1/2_offline.js`, `p5_step5_ui_offline.js` (extract
`_p5BuildLocalContext`/`_p5RenderPacket` and friends — must stay green; only the `:2561` literal
changes) · `run-offline.js` (`pt_eod_cache` fixture `:1855` feeds `_pfPortfolioDayEstimate`, reads none
of the new fields — must stay green, file unedited) · TS1 coverage in `run-offline.js` (market rule
reuse must not change TS1 results). Worker confirms against all `index.html` readers at plan time.

## 6 · STOP conditions

1. Any file beyond §5.
2. Any new numeric freshness threshold, day-based math in the readiness path, or inference of a
   session date from `sessionEpoch`/`fetchedAt` at read time.
3. `_pfEodIsStale` changed, or its meaning widened.
4. Research recency lowering the verdict, or any J7 band literal in `index.html`.
5. Any `limitations[]` entry removed/reworded/merged (readiness is additive).
6. Any `pt_*` write during packet build; any change to the backup set.
7. Any forbidden key or action vocabulary.
8. Any D2 wording change outside the states in §3 items 5-7.
9. Any TS1 output change, or harmonizing TS1's freshness tolerance.

## 7 · Lifecycle / CLOSE

| closeCondition | Evidence | Actor | Possessable before CLOSE? |
|---|---|---|---|
| Readiness contract met | AC1–AC15, N1–N5, R-J7, R-U1 | Worker | **YES** |
| D3 relabel, logic untouched | R-D3, AC9 | Worker | **YES** |
| Markdown/briefing consistent with JSON | AC12, NB suite, re-pinned NB-4 + source diff | Worker | **YES** |
| `qa:offline` green, count unchanged | full gate | Worker | **YES** |
| Diff reviewed | Codex (Worker-launched) | Worker / Codex | NO — gate after CODE-READY |
| LAND | approval | Owner | NO — by design |

**Expected after LAND, not a defect:** the first export reads market `unknown` for every holding
until each is refreshed once (AC8).

## 8 · Definition of done

`packet.readiness` present with the ruled verdict/reasons/dimensions; Markdown renders it before
`## Limitations`; briefing speaks it; the two fetch-failure displays read "Refresh failed";
`_pfEodIsStale` byte-unchanged; all §3 item 8 assertions pass with controls; `qa:offline` green at its
then-current count; `review.md` carries the NB-4 re-pin evidence, `## Lessons`, files-changed block
and final-check line.
