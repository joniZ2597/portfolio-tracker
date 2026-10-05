# Task brief: r1a-high1y-relabel — R-1 Slice A: show and send the 1-year high as "1Y High", never as ATH

Operational only when the Owner has approved these exact contents and the brief-only commit records them unchanged.

| | |
|---|---|
| Backlog | **Entry 34 — `partial`** ("1Y High vs true all-time high", Track 2 · Scores & Signals). Added by Owner ruling 2026-10-05; the entry does not exist at the baseline, so this task adds it with its partial status (B1). Slice B closes it. Number 31 stays reserved by the held P2a brief |
| Baseline | `57afd9d6896f5f4d6d7f1cc6135a684e3792bad8` (`branch-dev` = `origin/branch-dev`, 2026-10-05). Anchors verified at this commit; `index.html` CRLF |
| Branch / slot | `task/r1a-high1y-relabel`, Worker B (`pt-wt-worker-b`, free, detached at `57afd9d`) |
| Mode | **Manual, attended** — AI prompt wording, a renamed persisted audit field, and re-pinned protected functions. The Worker still runs tests → implementation → QA → Codex on its own; it stops only on STOP-1..6 or an Owner gate |
| qa:offline | baseline at Step 0 → **+1** (`qa/high1y_label_offline.js`). After a Second-LAND `resync`, the baseline is the re-synced `branch-dev` suite count (it includes the first finisher's new suite), measured fresh; the rule stays baseline + 1 |
| Parallel with | Worker A `task/qa-isolation-meter`: no shared file (compatibility check 2026-10-05). Until Slice 0 lands, **no heavy QA while Worker A runs heavy QA**: full `qa:offline`, `qa/pt_land_offline.js` and `qa/pt_land_resync_offline.js` run one at a time on the laptop, and never during Worker A's measurement or collision-proof runs. Light land-tests may run any time. If Slice 0 lands first, this task re-syncs before LAND |
| Status | FINAL, **amendment 2** (2026-10-05). Owner rulings §0; no decision open. Amendment 1 added the existing-suite pin edits found by Worker B's pre-edit scratch sweep; amendment 2 adds one TC-6 sandbox dependency (§2 (g)). Product scope unchanged (§6) |

## 0. Owner rulings (2026-10-05; not reopened)

1. R-1 is split. **This is Slice A** (relabel and preserve 1Y High). Slice B (true historical ATH) is separate and
   not in this task.
2. The internal setup names `extended_near_ath` and `healthy_uptrend_near_ath` stay **unchanged**. UI and AI wording
   must say "near 1Y high". Saved setup names are not migrated.
3. 1Y High stays its own metric and is never labelled ATH.
4. Backlog entry 34 "1Y High vs true all-time high": Slice A marks it **partial**; Slice B closes it.

Out of scope:
- any new data request;
- any ATH metric;
- setup thresholds, enum values, scores, clamps, actions;
- the Tech Score v1 region;
- R-2, R-3, R-5, R-6.

## 1. Exact changes — `index.html` (line numbers at `57afd9d`)

**A1 — rename the 1Y calculation (`:1069–1075`).**
- `computeATHDistance` → `computeHigh1yDistance`, with the same body except names.
- Doc comment: "Distance of price from the highest high in the supplied candles (the 1-year high when given 1Y
  candles). Returns pct below that high, or null."
- Local `ath` → `high1y`; trailing comment "negative = below the 1-year high".

**A2 — `classifyTechnicalSetup` (`:1083–1093`).**
- The destructured `athDist` → `high1yDist`, and both uses.
- Comments "within 5% of 1Y high" / "within 8% of the 1Y high".
- **Thresholds, order, conditions and returned enum strings byte-identical.**

**A3 — new `_setupDisplay(key)`** (insert immediately before `function buildTechSnapshotBlock(`).
- Pure; no DOM, storage or window access.
- Returns `'extended near 1Y high'` for `extended_near_ath`, `'healthy uptrend near 1Y high'` for
  `healthy_uptrend_near_ath`, otherwise `String(key || '').replace(/_/g, ' ')`.

**A4 — `buildTechSnapshotBlock` (`:1117–1129`).** Exactly two template lines change:
- `` `${sym} [setup: ${setupState}]\n` `` → `` `${sym} [setup: ${setupState} = ${_setupDisplay(setupState)}]\n` ``
- `` `  ATH Dist: ${fmt(s.athDist)}   …` `` → `` `  1Y High Dist: ${fmt(s.high1yDist)}   …` `` (the rest of the line unchanged).

**A5 — `_techDeriveSnap` (`:1224–1239`).**
- `const athDist = computeATHDistance(tc, price);` → `const high1yDist = computeHigh1yDistance(tc, price);`
- The comment `// ATH distance` → `// 1-year-high distance`.
- In the returned object, `// ATH` → `// 1Y high` and `athDist, hasATH: athDist !== null,` →
  `high1yDist, hasHigh1y: high1yDist !== null,`
- **Key position unchanged** (same slot, new names).

**A6 — scan prompt gating (`:6051–6052`, `:6059`; AI prompt text).**
- `:6051` → `  extended_near_ath        → action: "hold_wait". Never Buy or Add. Price is too extended near its 1-year high.`
- `:6052` → `  healthy_uptrend_near_ath → action: "hold_wait" or "add_on_pullback" only. Near the 1-year high = no chase.`
- Insert one line directly after `:6050` ("This gates the final action regardless of news bias:"):
  `  ("ath" in these setup names means the 1-year high from 1Y candles — never call it an all-time high.)`
- `:6059` and the JSON template at `:6110` stay byte-identical (they name the keys only).

**A7 — `orchestrate` audit trail (`:6327`).**
`athDist:       _snap6a.athDist     ?? null,` → `high1yDist:    _snap6a.high1yDist  ?? null,`
New stored results carry `high1yDist`; old stored results keep `athDist` (nothing reads it).

**A8 — `_srGroupResults` (`:6955`, `:6959`; caliper-pinned).**
- Comment `Extended / ATH` → `Extended / near 1Y high`.
- `{ name: 'Extended / ATH', items: [] }` → `{ name: 'Extended / near 1Y high', items: [] }`.
- The grouping logic is byte-identical.

**A9 — `renderMainPanel` (caliper-pinned), exactly four lines.**
- `:8281`: `'Healthy uptrend near all-time high — trend intact but extended'` →
  `'Healthy uptrend near its 1-year high — trend intact but extended'`
- `:8282`: `'Price extended above key moving averages and near all-time high'` →
  `'Price extended above key moving averages and near its 1-year high'`
- `:8428`: `ATH Distance` → `1Y High Distance`; `snap.hasATH` → `snap.hasHigh1y` (two places); `snap.athDist` →
  `snap.high1yDist` (three places). Colour thresholds unchanged.
- `:8480`: `${_esc(item.technical_setup).replace(/_/g,' ')}` → `${_esc(_setupDisplay(item.technical_setup))}`. The
  label part (`Scan setup` / `Setup`) is unchanged.

**A10 — Deep Dive `_dd0FetchAnalysis` (`:13348`).**
`parts.push('TECHNICAL SETUP: ' + item.technical_setup)` →
`parts.push('TECHNICAL SETUP: ' + item.technical_setup + ' (' + _setupDisplay(item.technical_setup) + ')')`

**Nothing else changes**, in particular:
- the enum strings everywhere (including the `:6110` template, `:6219–6227`, `:6398`, `:6433`, Scan Results /
  Daily Review maps, Position Take);
- `_tfMap` / `tfMap` labels;
- Tech Score v1 (`high52w`) and its region;
- data fetching;
- `localStorage` / `pt_*` code.

### `BACKLOG.md` — step 10a (effect `partial`; CRLF; nothing else changes)

**B1 — new entry 34 (open, partial).** Insert after line `:170` (entry 33's `*Deps:* none.`), before the blank line
and `---` that precede `## LATER`, with one blank line before the heading:

```
### 34 · 1Y High vs true all-time high
**Scores / Signals** · data honesty · **added 2026-10-05**

The value shown and sent to the AI as "ATH" was the 1-year high (the highest high of the 1Y daily
candles). Owner ruling 2026-10-05: keep 1Y High as its own metric, add the true historical
all-time high as a separate metric, never label the 1Y high as ATH; the setup names `*_near_ath`
stay unchanged and are shown as "near 1Y high".
*Slice A landed (`work/r1a-high1y-relabel/`):* 1Y High relabelled in the UI and in AI text; no
all-time-high metric yet. *Remains — Slice B:* the true all-time high from a validated
long-history source.
*Deps:* none.
```

There is no DONE / HISTORY line, because the entry stays open.

## 2. Existing suites — only these edits (required by the renames)

| File | Edit | Proof in `review.md` |
|---|---|---|
| `qa/tech_snapshot_cache_offline.js` | **(a) Identifier renames** — every occurrence of `athDist` → `high1yDist`, `hasATH` → `hasHigh1y` and `computeATHDistance` → `computeHigh1yDistance` (at `57afd9d`: `:50`, `:199`, `:202`, `:218`, `:379`, `:418`, `:424`, `:527`, `:594`, `:854`), and nothing else on those lines. `SNAP_KEYS` keeps the same position. `ENGINE_FNS` adds `'_setupDisplay'`. The `:854` mutant keeps the same mutation (`> 10` → `> 11`) on the renamed anchor.<br>**(b) `BASE_PINS`** — new values for `computeHigh1yDistance` (renamed key), `classifyTechnicalSetup` and `buildTechSnapshotBlock`.<br>**(c) `NEW_RM_LF` and `NEW_RM_CALIPER_PIN`** (`:65–66`) — new values: the LF and CRLF hashes of the task `renderMainPanel`.<br>**(d) `BASE_CALIPER_PINS._srGroupResults`** (`:79`) — new value.<br>**(e) TC-10 revert logic** (`:605–614`) — reverts **A9 first**, then I7: `reverted = revertI7(revertA9(rm))`, and the forward check becomes `applyA9(applyI7(reverted)) === rm`. `revertA9` / `applyA9` are a new four-entry old→new table equal to brief §1 A9 (whole-line text pairs). The A9 `:8480` entry is the I7h line in its I7-applied form, so the I7 tables are unchanged. The other TC-10 assertions are unchanged; "line count = base + 3" still holds because A9 adds no lines.<br>**(f) TC-11 / TC-13** — **no assertion logic change**. They read the updated constants (c) and (d) only; the TC-11 loop label "equals the base" is unchanged.<br>**(g) TC-6 Deep Dive sandbox list** (`:551` at `754da24`) — add `'_setupDisplay'`, so it reads `const names = ['_dd0RunCard', 'buildTechSnapshotBlock', '_techRefInput', '_techSnapFor', '_setupDisplay'];`. This is the same dependency injection as `ENGINE_FNS` (a) and the `qa/deep_dive_v0_offline.js` `FNS` edit. **No TC-6 assertion changes** | **(a)** a token-level diff shows only the three renames on the listed lines, plus `'_setupDisplay'` in `ENGINE_FNS`.<br>**(b)** For each function, the new source with only its A1, A2 or A4 lines reverted hashes to the old `BASE_PINS` value.<br>**(c)** `revertI7(revertA9(rm))` hashes to `BASE_RM_LF` and, in CRLF form, to `OLD_RM_CALIPER_PIN` `d11b09a9…`. `revertA9(rm)` hashes to the old `NEW_RM_LF` `978f40e5…` (LF) and the old `NEW_RM_CALIPER_PIN` `a219c950…` (CRLF).<br>**(d)** `_srGroupResults` with A8 reverted hashes to `192d7dd3…`.<br>**(e)** TC-10 passes, and a planted extra `renderMainPanel` line change still fails it.<br>**(g)** The diff of that line is exactly the added `'_setupDisplay'` element, every TC-6 `chk(` line is byte-equal to `754da24`, and TC-6 passes |
| `qa/vis_score_caliper_offline.js` | `PROTECTED_FN_HASHES.renderMainPanel` and `._srGroupResults` values only | `renderMainPanel` with A9 reverted hashes to the old caliper pin `a219c950…`, and `_srGroupResults` with A8 reverted to `192d7dd3…`. The new values equal tech-snapshot (c) CRLF and (d) |
| `qa/ts1_default_exposure_offline.js` | **TX-3** `renderMainPanel` hash value only (`:139`) | `renderMainPanel` with A9 reverted, LF-normalised, hashes to the old value `978f40e5…`. The new value equals tech-snapshot (c) LF. The other TX-3 pins and the TX-3 negative cases are unchanged |
| `qa/analyst_parser_offline.js` | **`PIN_MASKED_FILE`** value only (`:69`) | The new `index.html` (LF-normalised), with `parsePerplexityContext` masked **and** A1–A10 reverted, hashes to the old value `de37b698…`. That proves the only non-parser change is A1–A10. `PIN_ALLNONE_EXPR`, `PIN_FETCH_PPLX` and `PIN_FIXTURE` are unchanged |
| `qa/deep_dive_v0_offline.js` | `FNS` += `'_setupDisplay'` | no assertion changed |

**Every re-pinned value has its revert proof in `review.md`:** the value it replaces, the new value, and the
command or script output showing the revert hash. A re-pinned value without a passing revert proof is a STOP.

No other existing test is edited. `qa/run-offline.js` (ASK-tier) is not touched; its `extended_near_ath` enum checks
still pass, because the enums are unchanged.

## 3. New suite — `qa/high1y_label_offline.js`

| ID | Assertion |
|---|---|
| HL-1 | **Classification identical:** a table of at least 30 snapshots (boundaries −5/−8 on the 1Y distance, pct20 10/2, pct50 0/±3, pct150 ±5/0/2, and nulls), run through the new `classifyTechnicalSetup` and through the baseline source (embedded at Step 0 as a literal), gives identical results |
| HL-2 | `_techDeriveSnap` output has `high1yDist` / `hasHigh1y` at the former key position, no `athDist` / `hasATH`, and `high1yDist === computeHigh1yDistance(candles, price)` |
| HL-3 | **No ATH wording for the 1Y metric:** the outputs of `buildTechSnapshotBlock`, the A6 prompt lines, the `_srGroupResults` group names, the `_tsAssessMap` values, the `:8428` row label and `_setupDisplay` of both near-ath keys contain no `ATH`, `all-time` or `All-Time` (case-insensitive word match). The A6 explanation line is present exactly once |
| HL-4 | `_setupDisplay`: both near-ath keys map as in A3; every other key maps to its underscores-to-spaces form; null/undefined → `''` |
| HL-5 | Rendered UI (render harness of `qa/tech_snapshot_cache_offline.js` TC-12c pattern): the Technical Setup card shows "1Y High Distance" with the same value and colour class as the baseline "ATH Distance"; the action-block Setup value for `extended_near_ath` reads "extended near 1Y high" |
| HL-6 | Deep Dive user content for an item with `extended_near_ath` contains `TECHNICAL SETUP: extended_near_ath (extended near 1Y high)` |
| HL-7 | Audit: an `orchestrate` run (stub harness of the Entry-32 suite) stores `_auditTrail.dataCollected.high1yDist` equal to the snapshot value, and no `athDist` key |
| HL-8 | Static isolation: enum string literals, thresholds, Tech Score v1 region, score clamps and every function not named in §1 are byte-equal to the baseline (sha256 pins captured at Step 0) |

**Planted negatives** (each must fail the named row):
- a threshold moved → HL-1;
- `athDist` left in the snapshot → HL-2;
- an "ATH" label left anywhere in HL-3's set → HL-3;
- the display map missing a key → HL-4;
- the audit still writing `athDist` → HL-7;
- an enum string changed → HL-8.

**RED** (before implementation, recorded in `review.md`): HL-2, HL-3, HL-4, HL-5, HL-6 and HL-7 fail against the
baseline. HL-1 and HL-8 pass, since they are invariants.

<!-- land-scope:begin -->
index.html
qa/high1y_label_offline.js
qa/tech_snapshot_cache_offline.js
qa/vis_score_caliper_offline.js
qa/deep_dive_v0_offline.js
qa/ts1_default_exposure_offline.js
qa/analyst_parser_offline.js
BACKLOG.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/high1y_label_offline.js
node qa/tech_snapshot_cache_offline.js
node qa/vis_score_caliper_offline.js
node qa/deep_dive_v0_offline.js
node qa/scan_results_enrichment_offline.js
node qa/ts1_default_exposure_offline.js
node qa/analyst_parser_offline.js
<!-- land-tests:end -->

## 4. Files — exactly 9

```
index.html                              A1–A10 only (CRLF preserved)
qa/high1y_label_offline.js              NEW — §3
qa/tech_snapshot_cache_offline.js       §2 (a)–(g) only
qa/vis_score_caliper_offline.js         two pin values only
qa/deep_dive_v0_offline.js              FNS += '_setupDisplay' only
qa/ts1_default_exposure_offline.js      TX-3 renderMainPanel hash value only
qa/analyst_parser_offline.js            PIN_MASKED_FILE value only
BACKLOG.md                              B1 only (step 10a, effect partial)
work/r1a-high1y-relabel/review.md       NEW — RED/GREEN, pin revert proofs, ## Backlog reconciliation (partial, entry 34), LAND-EVIDENCE
```

## 5. Flow, STOP, Definition of Done

**Pre-flight checklist (`plan.md`):**
- **Pattern Auditing:** `qa/tech_snapshot_cache_offline.js` (render harness, pins) and
  `qa/vis_score_caliper_offline.js` (pins).
- **State and boundaries:** no `pt_*` code; the persisted change is the audit key rename only.
- **Gate Verification:** not applicable, stated. This is a relabel of an always-on path with no new capability.
- **Definition of Done:** below.

**Flow:** AGENTS.md steps 0–16, Mode Manual (attended).
- Step 0: one full `qa:offline` (check that Worker A isn't running one), then capture the HL-1 / HL-8 baselines.
- Tests first (RED), then A1–A10, then GREEN.
- Land-tests; full `qa:offline` = baseline + 1.
- Step 10a: B1.
- Codex review; LAND and push via R12 with the Owner's two lines; cleanup.
- **No live API call.** The post-push DEV check (one live scan) needs a separate Owner OK.

**STOP:**
- STOP-1..6;
- any setup classification change (HL-1);
- any enum string, threshold, score clamp, action rule or Tech Score byte changed;
- any new data request or `fetch` added;
- any prompt change beyond A4, A6 and A10;
- an existing-suite edit beyond §2;
- a re-pinned function whose revert proof fails;
- any `qa/run-offline.js` edit;
- any `BACKLOG.md` edit beyond B1;
- a `qa:offline` count other than baseline + 1.

**Definition of Done:**
- A1–A10 and B1 exact;
- HL-1…HL-8 and the planted negatives PASS;
- revert proofs recorded;
- land-tests PASS;
- full `qa:offline` = baseline + 1;
- Codex with no unresolved Class I;
- LANDed, pushed, cleaned.
- After push, an Owner-approved DEV scan shows "1Y High Distance", and no AI narrative calls the 1Y high an ATH.

## 6. Amendment 1 record (2026-10-05)

- **Trigger:** Worker B hit a valid **STOP-1** during its pre-edit scratch sweep. Three existing suites pin values
  that A9 / A8 / A1–A10 necessarily change, and the original §2 did not list them:
  - `qa/ts1_default_exposure_offline.js` TX-3;
  - `qa/analyst_parser_offline.js` `PIN_MASKED_FILE`;
  - more `qa/tech_snapshot_cache_offline.js` pins and the TC-10 revert logic.
- **Scope added:** only those existing-suite edits (§2) plus the land-scope, land-tests and §4 file count. Product
  scope (§1), rulings (§0), the new suite (§3) and all STOP conditions are unchanged.
- **State at amendment:**
  - Worker B's slot is **clean** on `task/r1a-high1y-relabel` at the original brief commit `fe336b8`;
  - **no implementation has started**;
  - no repo edit was made by the sweep.
- **Sequencing unchanged:**
  - Worker A (`task/qa-isolation-meter`) **LANDs first**;
  - Worker B re-syncs onto the new `branch-dev` with `pt-land.js resync` after Worker A lands, then runs a fresh full
    `qa:offline` and the integrity check, then LANDs second;
  - the heavy-QA restriction (§ Parallel with) still applies.

### Amendment 2 record (2026-10-05)

- **Trigger:** Worker B hit a valid **STOP-1** after implementation. TC-6 in `qa/tech_snapshot_cache_offline.js`
  extracts `_dd0RunCard` and `buildTechSnapshotBlock` into a sandbox. `buildTechSnapshotBlock` now calls
  `_setupDisplay` (A4), which the sandbox list at `:551` lacks, so TC-6 fails only for that missing dependency.
- **Scope added:** exactly one existing-suite edit, §2 (g): `'_setupDisplay'` appended to the TC-6 `names` list. No
  assertion change, no other QA edit, no product-scope change. All §2 (a)–(f) edits and every STOP condition stand.
- **State at amendment:**
  - A1–A10 are applied in Worker B's working tree; **nothing is committed**;
  - `qa/high1y_label_offline.js` passes **101/101**;
  - all other approved light suites pass;
  - **only TC-6 is blocked**, by the missing `_setupDisplay` sandbox dependency.
- **Sequencing unchanged:**
  - Worker A (`task/qa-isolation-meter`) **still LANDs first**;
  - Worker B re-syncs onto the new `branch-dev` with `pt-land.js resync` afterwards, then runs a fresh full
    `qa:offline` and the integrity check, then LANDs second;
  - the heavy-QA restriction still applies.
