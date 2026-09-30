# Task brief: DH-M4b — aged-but-valid FX is Current (R2 / D-1 / D-2)

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Backlog | **Entry 7** · data-state presentation contract · ARC **DH** · Slice **M4b** |
| Baseline | a30ed21ecacce1852a8e83dd95d5ec3077d679b4 = branch-dev (DH-M4a `99d4844` and R11 `0330291` landed; R12 brief `a30ed21`); the task branch starts at this brief's commit |
| Branch / slot | `task/dh-fx-aged-current`, created from this brief's commit in **Worker B** (`pt-wt-worker-b`), refreshed to current `branch-dev` |
| Mode | **Manual** (D-2 changes the ratified DH-M1 readiness contract; see §10) |
| qa:offline | baseline → unchanged: **51 → 51** at `a30ed21`. If R12 lands first and this task is rebased, **52 → 52**. No suite is added |
| Parallel with | Worker A `task/worker-land-push` (R12: `.claude/hooks/**`, `qa/pt_land_offline.js`, `qa/auto_mode_hardening_offline.js`, `AGENTS.md`, `CLAUDE.md`, `qa/instruction_layer_offline.js`). The file sets are disjoint |
| Status | CODE-READY on Owner approval of this brief |

Objective. Apply the approved R2 rulings to aged-but-valid FX (BoI rate 3–6 days old: valid for totals,
not for the daily-move estimate):
- **D-1:** the two UI labels that say `(aged)` show `Current · N d old`, where N = whole days since the
  Bank of Israel effective date.
- **D-2:** EOD readiness treats aged-but-valid FX as Current and no longer lowers the verdict to
  `degraded`.

There is no change to `_pfFxState`, thresholds, totals, P/L, weights, the daily-move rule, scoring or
persistence.

## 1. Rulings (approved; not reopened)

- **D-1** (Owner, 2026-09-30): `Current · N d old` on the FX chip and on the Portfolio Total qualifier.
  - N = whole days since the BoI effective date, on the same age basis as `_pfFxState`
    (`effectiveAt`, floor).
  - Styling unchanged.
- **D-2** (Owner, 2026-09-30): aged-but-valid FX is Current for EOD readiness and must not lower the
  verdict.
- **DH-M0b D1/D2:** `_pfFxState` is the single FX freshness owner; the display words come only from
  `DH_DISPLAY`.
- **DH-M4a** (landed `99d4844`): FX missing/stale wording is already applied. This task does not touch
  it.

## 2. Current implementation (verified at `a30ed21`)

- **`_pfFxState`** (`index.html:10730–10738`):
  - `ageDays = (now − Date.parse(effectiveAt)) / 86 400 000`;
  - `≤ 3` → `fresh`, `≤ 6` → `aged-but-valid`, else `stale-invalid`; invalid record → `missing`.
  - Aged-but-valid FX feeds totals, P/L and weights (`:9051`, `:9186`). The daily-move estimate requires
    `fresh` (`:9413ff`) — unchanged by this task.
- **FX chip** (`_renderPortfolioPanel`, `:9782–9784`): `fxChipVal.textContent = 'FX ' + fxLabel + ' (aged)';` with
  amber colour.
- **Portfolio Total qualifier** (`:9804–9808`):
  `totalQualifier.textContent = 'FX as of ' + new Date(fxCache.effectiveAt).toLocaleDateString(…) + ' (aged)';`
- **Readiness** (`_eodComputeReadiness`, `:2773`): `if (fxState === 'aged-but-valid') lower('degraded', 'fx-aged');`
  followed by `else if` branches for `stale-invalid` and `missing`.
- **Display table** (`:2684`): `state['aged-but-valid']` is `'Stale'`. `_eodReadinessLines` (`:2832`) prints
  `- FX: <state word> [aged-but-valid]`. `reason['fx-aged']` is `'FX rate: Stale'`.
- **Export limitation for aged FX** (`_eodBuildPacket`): `FX: rate <r>, USD/ILS, as of <effectiveAt>,
  aged-but-valid.` This is factual; unchanged.

## 3. Implementation file set — exactly 5

```
index.html                                  E1–E5 (§4)
qa/dh_ui_vocabulary_offline.js              AG-1…AG-6 + UV-4 retirement + UV-5 expectation (§6)
qa/eod_packet_v0_offline.js                 RD-AC3 update + RD-AG1/RD-AG2 (§6)
qa/eod_preexport_warning_offline.js         PX-9 re-pin of two hashes only (§6)
work/dh-fx-aged-current/review.md           NEW — tracked task evidence
```

<!-- land-scope:begin -->
index.html
qa/dh_ui_vocabulary_offline.js
qa/eod_packet_v0_offline.js
qa/eod_preexport_warning_offline.js
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/dh_ui_vocabulary_offline.js
node qa/eod_packet_v0_offline.js
node qa/eod_preexport_warning_offline.js
<!-- land-tests:end -->

**QA suites that read in-scope files as text** (verified at `a30ed21`):
- `qa/dh_ui_vocabulary_offline.js`:
  - UV-4 pins `fxLabel + ' (aged)'` and `'FX as of '` as out-of-scope literals (retired, §6);
  - UV-5 / FW-1 pin `state['aged-but-valid'] === 'Stale'` (updated, §6);
  - UV-6 pins `_pfFxState` and other functions (all unchanged);
  - the U1 row's aged-branch condition regex is unchanged and still matches.
- `qa/eod_packet_v0_offline.js`: RD-AC3 asserts the `fx-aged` reason is present (updated, §6). Line
  ~1198 checks `state.aged === 'Stale'` (the market `aged` key, unchanged).
- `qa/eod_preexport_warning_offline.js`:
  - PX-9 pins `_eodComputeReadiness` and `DH_DISPLAY` (re-pinned, §6);
  - its PX-3 fixtures and planted negative use a **synthetic** `fx-aged` reason and rely on
    `reason['fx-aged'] === 'FX rate: Stale'`, which this task keeps (§4 E1).
- `qa/run-offline.js` (ASK tier, **not edited**): its assertions on `_pfFxState` aged-but-valid, the
  estimate suppression and `fxUsable` are unchanged and must pass.
- `qa/p5_packet_offline.js` checks the state code only; unaffected.
- `qa/vis_score_caliper_offline.js` pins no changed function.

## 4. Exact changes (`index.html`; CRLF preserved; every before-text occurs exactly once at `a30ed21`)

- **E1 — `DH_DISPLAY.state`** (`:2684`): in the line
  `'aged': 'Stale', 'aged-but-valid': 'Stale', 'stale-invalid': 'Stale', 'stale': 'Stale',`, change only
  `'aged-but-valid': 'Stale'` → `'aged-but-valid': 'Current'`.
  - No other `DH_DISPLAY` key or value changes.
  - `reason['fx-aged']` stays `'FX rate: Stale'`. It becomes a legacy label that is no longer emitted
    (see E5), kept so that `_dhLabel` on older packets and the existing PX-3 fixtures stay deterministic.
- **E2 — new pure helper**, inserted immediately after the closing `}` of `_dhLabel`:

  ```js
  // DH-M4b (D-1): the aged-but-valid FX label — the state word from DH_DISPLAY plus whole days.
  function _dhFxAgedLabel(days) {
    return _dhLabel('state', 'aged-but-valid') + ' · ' + days + ' d old';
  }
  ```

- **E3 — new pure helper**, inserted immediately after the closing `}` of `_pfFxState`:

  ```js
  // DH-M4b (D-1): whole days since the Bank of Israel effective date — the same age basis as
  // _pfFxState (effectiveAt, optional injected clock). null when the record is not usable.
  function _pfFxAgeWholeDays(cache, nowMs) {
    if (!_pfFxRateValid(cache)) return null;
    var fxNow = (typeof nowMs === 'number' && isFinite(nowMs)) ? nowMs : Date.now();
    return Math.floor((fxNow - Date.parse(cache.effectiveAt)) / (24 * 60 * 60 * 1000));
  }
  ```

- **E4 — the two UI labels** (the aged branch only; colour lines unchanged):
  - chip: `fxChipVal.textContent = 'FX ' + fxLabel + ' (aged)';`
    → `fxChipVal.textContent = 'FX ' + fxLabel + ' — ' + _dhFxAgedLabel(_pfFxAgeWholeDays(fxCache));`
  - total qualifier: replace the trailing `+ ' (aged)';` of the `totalQualifier.textContent = 'FX as of ' + …`
    line with `+ ' — ' + _dhFxAgedLabel(_pfFxAgeWholeDays(fxCache));`. The `'FX as of ' + <date>` prefix is
    unchanged.
- **E5 — readiness** (`_eodComputeReadiness`, `:2773–2775`). Replace:

  ```js
  if (fxState === 'aged-but-valid') lower('degraded', 'fx-aged');
  else if (fxState === 'stale-invalid') lower(usdCount > 0 ? 'not-representative' : 'degraded', 'fx-stale-invalid');
  ```

  with:

  ```js
  // aged-but-valid is Current for readiness (DH-M4b, Owner D-2) — no reason, no lowering.
  if (fxState === 'stale-invalid') lower(usdCount > 0 ? 'not-representative' : 'degraded', 'fx-stale-invalid');
  ```

  - The following `else if (fxState === 'missing') …` line is byte-unchanged.
  - `dimensions.fx.state` still carries the raw code `aged-but-valid`.
  - `_eodReadinessLines` is **not edited**. Through E1 its FX line reads `- FX: Current [aged-but-valid]`.

**Nothing else changes.** In particular:
- `_pfFxState`, `PF_FX_*`, `_pfFxRateValid`;
- totals, P/L, weights and `_pfPortfolioDayEstimate`;
- the fresh, stale-invalid and missing branches;
- the DH-M4a strings; the pre-export helper and copy;
- `_eodReadinessLines`, `_eodPacketToMarkdown`, `_eodPacketToBriefing`, `_dhLabel`;
- styles; scoring; persistence; `pt_*`.

## 5. Lifecycle walkthrough and actor-to-evidence closure

| FX state (USD holdings) | FX chip | Total qualifier | Readiness effect | Export FX line | Pre-export warning |
|---|---|---|---|---|---|
| fresh (≤ 3 d) | `FX <rate · date · BOI>` (unchanged) | none (unchanged) | none | `FX: Current` | — |
| **aged-but-valid (3–6 d)** | **`FX <rate · date · BOI> — Current · N d old`**, N ∈ {3,4,5,6}, amber unchanged | **`FX as of <date> — Current · N d old`** | **none** (was `degraded` / `fx-aged`) | **`FX: Current [aged-but-valid]`**; limitation line unchanged (`… aged-but-valid.`) | never listed (as before) |
| stale-invalid (> 6 d) | `… — Stale, not used in totals` (unchanged) | n/a (totals incomplete) | unchanged (not-representative with USD) | `FX: Stale [stale-invalid]` (unchanged) | listed as today |
| missing | `Unavailable (no rate fetched)` (unchanged) | n/a | unchanged | unchanged (DH-M4a) | listed as today |

- **Verdict:** a portfolio whose only reason was `fx-aged` becomes `current`. Any other reason still
  lowers the verdict exactly as before.
- **Est. Daily Move:** still hidden while FX is aged (the unchanged, pre-existing rule). D-1 accepted this
  without a new disclosure.
- **Actor-to-evidence:**
  - N is computed by the same formula and clock basis as the owner's state (AG-3), so a displayed
    `Current · N d old` always has 3 ≤ N ≤ 6 when the state is aged-but-valid (AG-4);
  - the chip, qualifier and export all take the word `Current` from `DH_DISPLAY.state['aged-but-valid']`
    (AG-2, AG-5);
  - the readiness change is proven on real `_eodComputeReadiness` output (RD-AG1/RD-AG2).

## 6. QA

**`qa/dh_ui_vocabulary_offline.js`** — new "DH-M4b" section (real `index.html`, CRLF-normalized; `vm` evaluation
of `DH_DISPLAY`, `_dhLabel`, `_dhFxAgedLabel`, `_pfFxRateValid`, `_pfFxAgeWholeDays`, `_pfFxState`):

| ID | Assertion |
|---|---|
| AG-1 | `DH_DISPLAY.state['aged-but-valid'] === 'Current'`; `reason['fx-aged'] === 'FX rate: Stale'` (kept); every other value equals the `a30ed21` value |
| AG-2 | `_dhFxAgedLabel(4) === 'Current · 4 d old'`, and it composes from `_dhLabel('state','aged-but-valid')` (control: changing the table word changes the output) |
| AG-3 | `_pfFxAgeWholeDays` with an injected clock: 3.5 d → 3; 4.0 d → 4; 6.0 d → 6; invalid record → `null`. It uses `effectiveAt` (not `fetchedAt`) and floor, the same basis as `_pfFxState` |
| AG-4 | Sweep effectiveAt ages 3.01 d … 6.00 d in 0.25 d steps: whenever `_pfFxState` = `aged-but-valid`, the label is `Current · N d old` with 3 ≤ N ≤ 6 |
| AG-5 | **Site checks in `_renderPortfolioPanel`:**<br>- the chip line and the qualifier line contain the exact E4 after-text once;<br>- `' (aged)'` occurs **0** times file-wide;<br>- the aged-branch condition and both amber colour lines are byte-unchanged |
| AG-6 | **Purity / no drift:**<br>- `_pfFxState`, `_pfFxRateValid` and `_dhLabel` are byte-equal to `a30ed21`;<br>- `_dhFxAgedLabel` / `_pfFxAgeWholeDays` contain no `localStorage`, `document`, `fetch` or scoring reference;<br>- the UV-6 hashes and `CONST_HASH` are unchanged |

- Each AG row has a planted negative: `(aged)` restored, `Math.round` instead of floor, `fetchedAt` as the
  age basis, the word hard-coded as `'Current'` in a label site, a changed aged-branch condition.
- **UV-4 retired:** both of its out-of-scope literals are now in scope. Remove the `OOS` table, its check
  and its two controls. AG-5 supersedes them.
- **UV-5:** the expected `BASE_DISPLAY.state['aged-but-valid']` becomes `'Current'`. Every other expected
  value is unchanged. This also updates FW-1, which reuses `displayFailures`.

**`qa/eod_packet_v0_offline.js`** (real `_eodComputeReadiness` via the existing `build()` harness):
- **RD-AC3 (updated):** with market missing and FX aged (4 d): `market-missing` present; **no `fx-aged`
  reason**; `dimensions.fx.state === 'aged-but-valid'`; verdict not `missing`. The check name is updated to
  match.
- **RD-AG1 (new):** control seed with every dimension current except FX aged (4 d) → verdict `current`;
  reasons exactly `[all-dimensions-within-band]`.
- **RD-AG2 (new):** the Markdown / briefing readiness block for RD-AG1 contains `- FX: Current [aged-but-valid]`
  and no `FX rate: Stale`.
- **Planted negative:** restoring the removed `lower('degraded', 'fx-aged')` line via `patchSrc` makes RD-AG1
  fail.
- All other rows are unchanged and must pass.

**`qa/eod_preexport_warning_offline.js`** — PX-9 only:
- replace the `_eodComputeReadiness` and `DH_DISPLAY` values in `BASELINE_SHA256` with their post-E1/E5
  sha256, adding the comment `// DH-M4b re-pin: _eodComputeReadiness (E5), DH_DISPLAY (E1)`;
- the other five pins stay byte-identical;
- PX-1…PX-8 unchanged and must pass.

**Also:** an unmodified `qa/run-offline.js` must pass; full `npm run qa:offline` = baseline count (51, or 52
after an R12 rebase).

**QA lesson:** any check whose assertion calls something with real side effects computes its result once and
asserts on the stored value.

## 7. Out of scope

- The daily-move disclosure; `_pfPortfolioDayEstimate`; any threshold or `PF_FX_*` change.
- DH-M4a strings; stale/missing FX; `reason['fx-aged']` removal; readiness shape changes (no age field is
  added to `dimensions.fx`).
- `_eodReadinessLines` / projector edits; `exportJSON`.
- `qa/run-offline.js`, `BACKLOG.md`, `AGENTS.md`, `CLAUDE.md`, `.claude/**`.

## 8. Worker flow and closure

1. **Step 0:**
   - cwd = `pt-wt-worker-b`, HEAD on `task/dh-fx-aged-current` at this brief's commit;
   - run the current-guard check;
   - record the baseline `qa:offline` count.
2. **`plan.md`:** requirement→test map plus the CLAUDE.md pre-flight checklist.
   - Gate Verification: no gated path is added or changed.
   - Definition of Done: §9.
3. **Manual mode.** Tests first; then E1–E5 one at a time; then the §6 updates; then targeted QA.
4. Worker-launched Codex read-only review of the implementation diff.
   - Focus: exact §4 text, the age basis equals the owner's, no threshold/total/estimate drift, the
     readiness change limited to `fx-aged`, re-pins limited to §6.
   - Resolve findings FIX / DEFER / REJECT.
5. Full `qa:offline`, then `review.md` (pre-commit evidence only), ending with
   `LAND-EVIDENCE: qa-offline=PASS <n>; targeted=PASS; codex-classI-unresolved=0`. Then the Codex final check.
6. **Step 13:**
   - stage the five §3 files with explicit paths in one call;
   - `git commit -m "feat(eod): treat aged-but-valid FX as Current with day age (DH-M4b)"` in a separate call
     (r9 gate);
   - then run
     `node qa/guard_integrity_check.js --base-main fbec2c193346d7afd1dab6fd11a46b5efe55238b --base-dev <this brief's full commit OID> --task task/dh-fx-aged-current --since <task-start ISO> --root <canonical checkout>`.
   - The result is **LAND evidence**, reported in the STOP report only; never in `review.md` (no amend, no
     second commit).
7. **LAND:**
   - If R12 has landed by then, follow AGENTS.md steps 14–15 (`pt-land.js land-request` / `land` /
     `push-request` / `push` with the Owner's `!` lines). This brief has a `land-scope` block and touches no
     protected path.
   - Otherwise STOP and request an Owner LAND.
   - If `branch-dev` moved, this is a Second LAND: the Owner rebases, and the Worker re-runs `qa:offline`,
     the land-tests and the integrity check.

## 9. STOP conditions and Definition of Done

**STOP:**
- **STOP-1..5** per AGENTS.md (any file outside §3; any change beyond §4 / §6).
- **STOP-6:**
  - any hook denial, safety-classifier block, or integrity FAIL;
  - any Manual fallback trigger not covered by this brief;
  - the Owner becoming unavailable.

  Never retry in another form.
- Any change to:
  - `_pfFxState`, `_pfFxRateValid`, `PF_FX_*`;
  - totals, P/L, weights or the daily-move estimate;
  - the fresh, stale-invalid or missing branches;
  - DH-M4a strings;
  - `reason['fx-aged']`;
  - `_eodReadinessLines` or the projectors;
  - the readiness JSON shape;
  - styles, scoring, persistence or `pt_*`.
- An age basis other than `effectiveAt` with floor.
- Any edit to `qa/run-offline.js`.
- A re-pin beyond §6.
- `qa:offline` ≠ baseline count, or any existing suite failing (diagnose under M4 first).
- Any push, merge, rebase, LAND or deploy outside AGENTS.md steps 14–15.

**Definition of Done:**
- E1–E5 applied exactly.
- AG-1…AG-6 with negatives, UV-1…UV-7 (UV-4 retired), FW-1…FW-7, RD-AC3 / RD-AG1 / RD-AG2 and PX-1…PX-9 all
  PASS; `run-offline` PASS unmodified; full `qa:offline` PASS at the baseline count.
- Codex: no unresolved Class I finding.
- One gated task-branch commit with exactly the §3 files.
- Post-commit integrity PASS, reported in the STOP report.
- LAND via steps 14–15 or by the Owner.

## 10. Why Mode: Manual

- D-2 removes a lowering rule from the ratified DH-M1 readiness contract. That is a contract surface (AGENTS
  M5), so the task runs Manual even though every file is ORDINARY tier and all rulings exist.
- It remains LAND-eligible under R12 (land-scope present, no protected path).
