# Task brief: r2-ma-stack — claim "20 > 50 > 150" only when the averages are actually stacked (R-2)

Operational only when the Owner has approved these exact contents and the brief-only commit records them unchanged.

| | |
|---|---|
| Backlog | **New Entry 35, created and closed by this task** — "35 · Claim the MA stack only when the averages are stacked (R-2)" (Owner ruling 2026-10-08: each remediation task owns its entry; 35 is the next free number at the baseline). `BACKLOG.md` is in the file set and land-scope (step 10a: the entry in NEXT and its DONE / HISTORY line) |
| Baseline | `e7bbbbb0cd903cae13ee81c7f162a64a4f024e25` (`branch-dev` = `origin/branch-dev`, 2026-10-08). `index.html` is byte-identical to `32c4388` and `d9c5a0e` |
| Branch / slot | `task/r2-ma-stack`, **Worker A** (detached and clean at `e7bbbbb`). `index.html` lane, position 1 |
| Mode | **Auto (attended), after `/plan`** — UI wording only; no ASK- or DENY-tier file (`qa/run-offline.js` T6 is unaffected, §4); no scoring, ranking, persistence or prompt change |
| qa:offline | step-0 baseline **68** → **69** (+ `qa/ma_stack_label_offline.js`) |
| Parallel with | Worker B `task/r1b2-ath-auto` (server only). No shared file. **One full `qa:offline` at a time on the laptop** |
| 3A-M | Start the 3A-M sampler before step 0 and step 10 if Worker B is not running a full suite (natural captures) |
| Status | FINAL (2026-10-08). Source: consistency pilot 2026-10-03, finding R1 (ROK) |

## 0. Owner rulings (not reopened)

1. **D1 (2026-10-07):** R-2 is first in the shared `index.html` lane (R-2 → R-3 → R-5 → R-1 B4 → P2a → 22b → Entry 30).
2. **Classification is unchanged:** `healthy_uptrend` still means price above MA20, MA50 and MA150. Only text that
   *claims* a stack changes.
3. **Each remediation task creates and closes its own BACKLOG entry** (2026-10-08).
4. The wording table in §2.2 is approved together with this brief.

## 1. Objective and scope

The Technical Setup card's assessment line says "20 > 50 > 150" for every `healthy_uptrend`, even when the averages are
not stacked. Pilot example, ROK 3 Oct: MA20 $428.11 < MA150 $429.35 < MA50 $437.80. After this task the stack is
claimed only when MA20 > MA50 > MA150 actually holds for the snapshot the card shows.

**Out:**
- `classifyTechnicalSetup`, scores, Tech Score;
- AI prompts and narrative (R-6);
- every other assessment text;
- the `_tsAssessMap` literal;
- Deep Dive;
- any new top-level function.

## 2. What must be true

1. **Same snapshot:** the stack test uses `_panelSnap` — the same snapshot the card renders and classifies (Entry 32
   consistency) — through its `sma20`, `sma50` and `sma150`.
2. **Wording table:**

   | `_panelSetup` | Condition on `_panelSnap` | Assessment text |
   |---|---|---|
   | `healthy_uptrend` or `bullish_stack` | all three finite and `sma20 > sma50 > sma150` | `20 > 50 > 150 — Healthy uptrend, price above key moving averages` (today's text, byte-identical) |
   | `healthy_uptrend` or `bullish_stack` | all three finite, not strictly stacked | `Price above all key moving averages — healthy uptrend; averages not fully stacked` |
   | `healthy_uptrend` or `bullish_stack` | any of the three missing or non-finite | `Healthy uptrend — price above key moving averages` |
   | any other setup / `unknown` | — | exactly today's behaviour (`_tsAssessMap[setup]`, or `''` for `unknown`) |

3. **Contained change:**
   - the `_tsAssessMap` literal is byte-identical;
   - `renderMainPanel` changes **only at the `_tsAssess` declaration**: at most four lines, i.e. local consts for the
     stack test plus the changed `_tsAssess` line, all inside `renderMainPanel`;
   - **no new top-level function.** A top-level helper would be an unknown name in the sandboxed render harnesses of
     `tech_snapshot` and `high1y_label`, and would move the `high1y_label` layer-1 whole-file pin.
4. **No side effects:** no persistence, `localStorage`, scoring, ranking or prompt change. Local variable names avoid
   `rs` / `rsCls` (`ui_hygiene` UH-6).

## 3. Required / Recommended Skills

| Skill | Required / Recommended | Why |
|---|---|---|
| **`pt-offline-suite`** | **Required** | `renderMainPanel` is pinned by five suites plus three whole-file pins. The coupling sweep (§4), re-pins with revert proof, the TC-10 revert-table extension and planted negatives follow its procedure |
| `browser-integrity-qa` | Recommended (COWORK, after push) | DEV visual of one stacked and one non-stacked `healthy_uptrend` ticker from stored results; no live scan needed |

## 4. Files — exactly 9 + `review.md` (coupling sweep at `e7bbbbb`, classes a–e)

```
index.html                           the _tsAssess region inside renderMainPanel (§2.3)
qa/ma_stack_label_offline.js         NEW — §5
qa/vis_score_caliper_offline.js      class a: renderMainPanel pin (CRLF form) — re-pin with revert proof
qa/ts1_default_exposure_offline.js   class a: TX-3 renderMainPanel pin (LF) — re-pin with revert proof
qa/tech_snapshot_cache_offline.js    class a/e: NEW_RM_LF, NEW_RM_CALIPER_PIN; TC-10 revert chain gains an R-2 table (revertI7(revertA9(revertR2(rm))) reproduces the base); TC-11 caliper value; TC-14 assessment expectation for the two stack keys follows §2.2
qa/high1y_label_offline.js           class a: HL-8 layer-2 renderMainPanel pin (layer 1 masks renderMainPanel and must stay byte-identical)
qa/analyst_parser_offline.js         class b: AP-14 PIN_MASKED_FILE (whole file minus parsePerplexityContext)
qa/ath_isolation_offline.js          class b: AR-7i whole-index.html pin; AR-7f must still hold (no ATH wiring)
BACKLOG.md                           Entry 35 created and closed
```

**QA suites that read in-scope files as text (sweep result):**

| Suite | Coupling | Outcome |
|---|---|---|
| the seven listed above | as stated | **edited** |
| `qa/deep_dive_v0_offline.js` | extracts the gated Deep Dive markup conditional | expected **unmodified** |
| `qa/ui_hygiene_offline.js` | UH-6: no `rsCls` / `const rs `; UH-7: setItem counts | expected **unmodified** |
| `qa/run-offline.js` T6 (ASK-tier) | extracts `renderMainPanel`; checks extractability, the "Tech Score v1" literal and exactly one generic `rr-lbl Score` row — no hash | expected **unmodified**; an edit → STOP-1 (Mode would become Manual) |
| `high1y_label` HL-5 and `tech_snapshot` `buildRenderer` | execute `renderMainPanel` in a `with(__scope)` sandbox with fixed helper lists (class c) | unaffected because §2.3 adds no top-level function |

<!-- land-scope:begin -->
index.html
qa/ma_stack_label_offline.js
qa/vis_score_caliper_offline.js
qa/ts1_default_exposure_offline.js
qa/tech_snapshot_cache_offline.js
qa/high1y_label_offline.js
qa/analyst_parser_offline.js
qa/ath_isolation_offline.js
BACKLOG.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/ma_stack_label_offline.js
node qa/vis_score_caliper_offline.js
node qa/ts1_default_exposure_offline.js
node qa/tech_snapshot_cache_offline.js
node qa/high1y_label_offline.js
node qa/analyst_parser_offline.js
node qa/ath_isolation_offline.js
node qa/deep_dive_v0_offline.js
node qa/ui_hygiene_offline.js
<!-- land-tests:end -->

## 5. QA — `qa/ma_stack_label_offline.js` (real `index.html`; `renderMainPanel` executed in a sandbox like `tech_snapshot`'s `buildRenderer`)

| ID | Requirement | Planted negative (on source or fixture) |
|---|---|---|
| MS-1 | Stacked (180 / 170 / 160) → today's text, byte-identical | stack test inverted |
| MS-2 | ROK fixture (428.11 / 437.80 / 429.35) → "not fully stacked" text | stack claimed |
| MS-3 | Equal averages (20 = 50) → not stacked (strict `>`) | `>=` used |
| MS-4 | Any average `null` / `NaN` → "Healthy uptrend — price above key moving averages" | null treated as 0 |
| MS-5 | Every other setup key → `_tsAssessMap` text; `unknown` → `''` | another key's text changed |
| MS-6 | The stack test reads `_panelSnap`, not `item.technical_*` or stored fields | reads the stored setup / MAs |
| MS-7 | `renderMainPanel` diff confined to the `_tsAssess` region (≤ 4 lines); the R-2 revert table reproduces the pre-task source byte-for-byte | a second region changed |
| MS-8 | No new top-level function; `classifyTechnicalSetup` and `_tsAssessMap` byte-identical | — |

**Re-pins (each with revert proof — the old pin must fail on the new source and pass on the reverted source):**
- caliper;
- TS1 TX-3;
- `tech_snapshot` `NEW_RM_*` / TC-10 / TC-11;
- `high1y_label` layer 2 (`renderMainPanel`);
- `analyst_parser` AP-14;
- `ath_isolation` AR-7i.

**Full `qa:offline`:** 68 → 69, PASS.

## 6. Live actions

None required. The optional DEV visual is COWORK, after push, read-only, using stored results.

## 7. Flow

- AGENTS.md steps 0–16 in attended Auto. `/plan` before the first file write, with the `CLAUDE.md` pre-flight
  checklist:
  - Gate Verification: "no runtime gate — wording only";
  - definition of done = §8.
- The `pt-offline-suite` sweep table and the re-pin ledger go into `plan.md`.

## 8. STOP (in addition to STOP-1..6)

- any change to `classifyTechnicalSetup`, scores, prompts, `_tsAssessMap` or another assessment text;
- a new top-level function;
- a `renderMainPanel` change outside the `_tsAssess` region;
- a pin that the brief does not list trips;
- `qa/run-offline.js`, `deep_dive_v0` or `ui_hygiene` needing an edit;
- the `high1y_label` layer-1 pin moving.

## 9. Definition of Done

- MS-1…MS-8 PASS with planted negatives caught.
- The listed re-pins done with revert proof.
- The land-tests PASS (the unmodified ones untouched).
- Full `qa:offline` PASS at 69.
- Entry 35 created and closed.
- Codex: no unresolved Class I finding.
- LANDed, pushed, cleaned.
