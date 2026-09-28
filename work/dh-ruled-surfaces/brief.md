# Task brief: DH-M2b — apply ruled display words to three render-only surfaces

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Backlog | **Entry 7** · data-state presentation contract · ARC **DH** · Slice **M2b** |
| Baseline | ea5a63210a077357015de8b437f2b994daa255a9 = branch-dev = origin/branch-dev (main = origin/main = fbec2c193346d7afd1dab6fd11a46b5efe55238b) |
| Branch / slot | `task/dh-ruled-surfaces`, created from ea5a632 in Worker A (`pt-wt-worker-a`) |
| Mode | **Auto** (attended; see §9) |
| qa:offline | 50 → 50 (the existing DH-M2 suite is extended; no suite added) |
| Status | CODE-READY on Owner approval of this brief |

Objective. Apply three Owner-ruled display words (DH-M0b follow-up rulings R1, R3, R4, 2026-09-26) to
three render-only UI sites, by mechanical substitution through the existing `DH_DISPLAY` table. This is a
display change only.

## 1. Standing rulings (not reopened)

- **D1:** one freshness owner per domain. No owner, threshold or state-semantics change.
- **D2:** the display words are `Current` · `Stale` · `Not recorded` · `Unavailable (reason)`.
  Internal codes are unchanged.
- **R1 — FX never fetched** (`fxState === 'missing'`) → `Unavailable (no rate fetched)`.
- **R3 — no research result exists** → `Not recorded`.
- **R4 — scan date unknown** → `Unavailable (scan date unknown)`.
- `DH_DISPLAY` (`index.html:2680`) and `_dhLabel` are the single word source (DH-M1, DH-M2).

## 2. Implementation file set — exactly 3

```
index.html                                three sites (§3) + two additive DH_DISPLAY.surface keys
qa/dh_ui_vocabulary_offline.js            extended per §5 (no other suite edited)
work/dh-ruled-surfaces/review.md          NEW — tracked task evidence
```

**QA suites that read in-scope files as text:**
- `qa/dh_ui_vocabulary_offline.js` pins these exact sites. Its UV-4 and UV-5 expectations change
  deliberately (§5).
- `qa/eod_packet_v0_offline.js` reads `DH_DISPLAY`. It checks `verdict` and spot `state` values only,
  so the additive `surface` keys keep it green.
- `qa/run-offline.js` tests `_pfComputeNeedsAttention`. That function is untouched, so the suite is
  unaffected.

## 3. Sites — before → after

| # | Site (function · anchor) | Condition (unchanged) | Before | After (word source) |
|---|---|---|---|---|
| B1 | FX chip · `_renderPortfolioPanel` `:9737` | `fxState === 'missing'` | `'FX unavailable'` | `DH_DISPLAY.surface['fx-not-fetched']` → `Unavailable (no rate fetched)` |
| B2 | Research badge · `_renderPortfolioPanel` `:10279` | `!res` | `'No research'` | `_dhLabel('state', 'missing')` → `Not recorded` |
| B3 | Stale banner · `checkAndShowStaleBanner` `:15367` | `timestamps.length === 0` | `Scan results are from a previous session (date unknown) — re-run scan to get current data` | `DH_DISPLAY.surface['scan-date-unknown'] + ' — results from a previous session · re-run scan for latest data'` → `Unavailable (scan date unknown) — results from a previous session · re-run scan for latest data` |

**`DH_DISPLAY` change — additive only:** two keys are added to the existing `surface` group:
- `'fx-not-fetched': 'Unavailable (no rate fetched)'`
- `'scan-date-unknown': 'Unavailable (scan date unknown)'`

No existing group, key or value changes. In particular `state.missing` and `reason['fx-missing']`
stay exactly as they are.

## 4. Preservation rules and out of scope

1. Every branch condition is byte-unchanged; only the assigned string changes.
2. Classes, colours, `title` tooltips and DOM structure are unchanged.
3. No change to:
   - `PF_*`, `STALE_RESULT_THRESHOLD_MS`, `_pfFxState`, `_pfComputeNeedsAttention`,
     `_pfComputePortfolioReporting`, `_pfEodIsStale`, `_dhLabel`;
   - any export, packet or prompt text;
   - Score, ranking, recommendations, persistence, schema or `pt_*`.
4. **Out of scope — byte-unchanged; touching any of these is STOP-1:**
   - R2 (FX aged-but-valid): the chip `(aged)` (`:9750`) and the total-qualifier `(aged)` (`:9774`).
   - The other R1 sites, which feed export or prompt context: the attention title `FX rate unavailable`
     (`:9353`), the completeness reason `USD holdings excluded — FX unavailable` (`:9029`), and the EOD
     limitation (`:2994`).
   - The DH-M1 export reasons `fx-missing` / `fx-aged`.
   - DH-M3 (pre-export warning), entry 11, and every DH-M2 U1–U8 site.
5. No edit to `qa/run-offline.js`, `BACKLOG.md`, `AGENTS.md`, `CLAUDE.md` or any `.claude/**` file.

## 5. Targeted QA — extend `qa/dh_ui_vocabulary_offline.js`

- **RB-1:** each of B1–B3 renders its after text through the listed source, and evaluating `DH_DISPLAY`
  yields the listed words. *Control:* a fixture that keeps a before-literal fails.
- **RB-2:** each B1–B3 before-literal is absent **at its site** (site-scoped; the same words may remain
  elsewhere, e.g. inside `USD holdings excluded — FX unavailable`).
- **RB-3:** the three branch conditions are present exactly as at baseline. *Control:* a changed
  condition is detected.
- **UV-4 update:**
  - remove the three converted literals from the out-of-scope list;
  - keep `fxLabel + ' (aged)'`, `'FX rate unavailable'` and `'USD holdings excluded — FX unavailable'`;
  - add the `:9774` total-qualifier `(aged)` literal as a site-scoped pin in `_renderPortfolioPanel`.
- **UV-5 update:** the expected `surface` group becomes exactly four entries: the two DH-M2 entries plus
  the two §3 keys. All baseline groups stay equal. The existing controls stay, plus a control where
  changing `state.missing` fails.
- UV-1…UV-3, UV-6 and UV-7 are unchanged and must stay green. UV-7 covers the changed functions.
- **QA lesson:** any check calling a function with real side effects computes its result once and
  asserts on the stored value.
- **Runs:**
  1. `node qa/dh_ui_vocabulary_offline.js`
  2. `node qa/eod_packet_v0_offline.js`
  3. full `npm run qa:offline` (50)

## 6. Worker flow (AGENTS.md contract, attended Auto)

1. **Step 0:**
   - confirm cwd = `pt-wt-worker-a`, HEAD = ea5a632 on `task/dh-ruled-surfaces`;
   - run the current-guard check: the branch descends from current `branch-dev` and
     `git status --porcelain .claude` is empty;
   - record the `qa:offline` baseline (50).
2. **`plan.md`:** requirement→test map plus the CLAUDE.md pre-flight checklist.
   - Gate Verification: state that no gated execution path is added or changed.
   - Definition of Done: §8.
3. Tests first (RB-1…RB-3 fail), then implement §3, then targeted QA.
4. Worker-launched Codex read-only review (`codex exec --sandbox read-only`) on the implementation diff.
   - Focus: exact §3 text, conditions unchanged, additive-only `DH_DISPLAY`, no out-of-scope site touched.
   - Resolve findings FIX / DEFER / REJECT.
5. Full `qa:offline`, then `review.md`, then the Codex final check on the task diff.
6. **Step 13:**
   - stage `index.html`, `qa/dh_ui_vocabulary_offline.js` and `work/dh-ruled-surfaces/review.md`
     with explicit paths in one call;
   - plain `git commit -m "feat(ui): apply ruled FX/research/scan-date display words (DH-M2b)"` in a
     separate call (r9 gate);
   - then run:
     `node qa/guard_integrity_check.js --base-main fbec2c193346d7afd1dab6fd11a46b5efe55238b --base-dev ea5a63210a077357015de8b437f2b994daa255a9 --task task/dh-ruled-surfaces --since <task-start ISO> --root <canonical checkout>`
7. **STOP** and request LAND. The Owner LANDs (fast-forward) and pushes from a normal terminal.

## 7. STOP conditions

- **STOP-1..5** per AGENTS.md, including any file outside §2 or any §4 out-of-scope site.
- **STOP-6:**
  - any hook denial, Auto-mode safety-classifier block, or integrity-check FAIL;
  - any Manual fallback trigger (ASK/DENY file, contract/schema/scoring surface, missing ruling,
    evidence contradicting this brief);
  - the Owner becoming unavailable.

  Never retry in another form.
- Any branch condition, style, threshold or owner change, or any non-additive `DH_DISPLAY` change.
- Any existing-suite change beyond §5, or any `qa:offline` failure not diagnosed under M4.
- Any push, merge, rebase, LAND, deploy, environment or `main` action.
- Use of Worker B (it is not refreshed to current `branch-dev`).

## 8. Definition of Done

- B1–B3 render exactly the §3 after-text.
- `DH_DISPLAY.surface` has exactly four entries; all other groups are byte-equal to baseline.
- `qa/dh_ui_vocabulary_offline.js` and `qa/eod_packet_v0_offline.js` PASS; full `qa:offline` PASS 50.
- Codex: no unresolved Class I finding.
- One gated task-branch commit containing exactly the §2 files.
- Integrity check PASS.

## 9. Why Mode: Auto (AGENTS.md eligibility)

- Approved committed brief with explicit files and STOP conditions.
- Bounded display change in an ORDINARY-tier file.
- Offline QA only.
- No schema, persistence, architecture, contract, scoring or ranking change.
- No ASK/DENY file in scope.
- No environment, runtime or deploy work.
- All wording ruled by the Owner (R1/R3/R4).
- Runs in its own slot under the current guard.
- **Attended only.** Manual or `acceptEdits` remain permitted; unattended Auto is prohibited.
