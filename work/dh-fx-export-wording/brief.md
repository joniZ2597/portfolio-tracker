# Task brief: DH-M4a — FX missing/stale wording in the export-fed sites (R1 + D2)

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Backlog | **Entry 7** · data-state presentation contract · ARC **DH** · Slice **M4a** |
| Baseline | 4c11f4c779210efbcad0088db6eca517896006fa = branch-dev; the task branch starts at this brief's commit |
| Branch / slot | `task/dh-fx-export-wording`, created from this brief's commit in **Worker B** (`pt-wt-worker-b`), refreshed to current `branch-dev` |
| Mode | **Auto** (attended; see §10) |
| qa:offline | **51 → 51** (the existing `qa/dh_ui_vocabulary_offline.js` is extended; no suite added) |
| Parallel with | Worker A `task/brief-commit-gate` (R11: hook, settings, `qa/auto_mode_hardening_offline.js`, `AGENTS.md`). The file sets are disjoint. |
| Status | CODE-READY on Owner approval of this brief |

Objective. Apply the already-ruled display words to the FX **missing** and **stale** wording that feeds the
UI's Needs Attention and totals disclosures, and the EOD export (JSON, Markdown, briefing, pre-export
warning).
- R1: FX never fetched → `Unavailable (no rate fetched)`.
- D2: FX outside the valid-use window → `Stale`.

This changes strings only: no condition, id, severity, threshold, owner, schema or scoring change.
Aged-but-valid FX (R2, D-1, D-2) is **out of scope**; that is DH-M4b.

## 1. Rulings (carried in; not reopened)

- **DH-M0b D1/D2:**
  - one freshness owner per domain (`_pfFxState` for FX), with no threshold change;
  - the display words are `Current` · `Stale` · `Not recorded` · `Unavailable (reason)`.
- **R1** (2026-09-26): FX never fetched → `Unavailable (no rate fetched)`. Its UI chip already landed in
  DH-M2b as `DH_DISPLAY.surface['fx-not-fetched']`.
- **D-3** (Owner, 2026-09-30): the exact wording in §3 is approved.
- **Deferred to DH-M4b** (approved D-1 / D-2; do not implement here):
  - aged-but-valid FX `Current · N d old`;
  - readiness treatment of `fx-aged`;
  - the chip / total-qualifier `(aged)` texts;
  - the aged-branch EOD limitation.

## 2. Implementation file set — exactly 4

```
index.html                                  E1–E4 (§3)
qa/dh_ui_vocabulary_offline.js              FW-1…FW-7 + UV-4/UV-5/UV-6 updates (§5)
qa/eod_preexport_warning_offline.js         PX-9 re-pin of two hashes only (§5)
work/dh-fx-export-wording/review.md         NEW — tracked task evidence
```

<!-- land-scope:begin -->
index.html
qa/dh_ui_vocabulary_offline.js
qa/eod_preexport_warning_offline.js
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/dh_ui_vocabulary_offline.js
node qa/eod_preexport_warning_offline.js
node qa/eod_packet_v0_offline.js
<!-- land-tests:end -->

**QA suites that read in-scope files as text** (verified at `4c11f4c`):
- `qa/dh_ui_vocabulary_offline.js`:
  - UV-4 pins `'FX rate unavailable'` and `'USD holdings excluded — FX unavailable'` as out-of-scope
    literals;
  - UV-5 pins `DH_DISPLAY.reason['fx-missing']`;
  - UV-6 pins `_pfComputeNeedsAttention` and `_pfComputePortfolioReporting` sha256.
  - All are updated deliberately (§5).
- `qa/eod_preexport_warning_offline.js` PX-9 pins the `_eodBuildPacket` and `DH_DISPLAY` sha256. Both are
  re-pinned (§5). The other five PX-9 pins must stay unchanged.
- `qa/run-offline.js` (ASK tier, **not edited**):
  - it executes `_pfComputeNeedsAttention` and `_pfComputePortfolioReporting` standalone, without
    `DH_DISPLAY` in scope;
  - it asserts ids and firing, not these titles or reasons;
  - therefore **those two functions must keep plain string literals** (E2, E3), never
    `DH_DISPLAY` / `_dhLabel` references.
- `qa/eod_packet_v0_offline.js` asserts verdicts and classes, not these strings. It is unaffected and must
  stay green.
- The `p5_*` suites use state codes only; unaffected.
- `qa/vis_score_caliper_offline.js` pins none of the changed functions.

## 3. Exact changes (`index.html`; CRLF line endings preserved; each before-literal occurs exactly once at `4c11f4c`)

- **E1 — `DH_DISPLAY.reason` (`:2698`):**
  `'fx-missing': 'FX rate: Not recorded',` → `'fx-missing': 'FX rate: Unavailable (no rate fetched)',`
  - No other `DH_DISPLAY` key or value changes.
- **E2 — `_pfComputeNeedsAttention` (`:9384`):**
  `title: attnFxState === 'missing' ? 'FX rate unavailable' : 'FX rate is stale',`
  → `title: attnFxState === 'missing' ? 'FX rate: Unavailable (no rate fetched)' : 'FX rate: Stale',`
  - The condition, `id: 'fx:unavailable'`, `severity: 'high'`, `category`, `symbol`, `detail` and `sortKey`
    are byte-unchanged.
- **E3 — `_pfComputePortfolioReporting` (`:9060–9061`):**
  - `'USD holdings excluded — FX unavailable'` → `'USD holdings excluded — FX: Unavailable (no rate fetched)'`
  - `'USD holdings excluded — FX stale'` → `'USD holdings excluded — FX: Stale'`
  - Both conditions are unchanged.
- **E4 — `_eodBuildPacket` FX limitation (`:3020–3022`).** Replace:

  ```js
  if (reporting.fxState === 'missing' || reporting.fxState === 'stale-invalid') {
    addLimitation('fx', 'FX unavailable — cross-currency totals are not reported.');
  } else if (preload.fxCache.rate) {
  ```

  with:

  ```js
  if (reporting.fxState === 'missing') {
    addLimitation('fx', 'FX: Unavailable (no rate fetched) — cross-currency totals are not reported.');
  } else if (reporting.fxState === 'stale-invalid') {
    addLimitation('fx', 'FX: Stale — cross-currency totals are not reported.');
  } else if (preload.fxCache.rate) {
  ```

  - The following aged/fresh `else if` body (`'FX: rate ' + …`) and everything after it are byte-unchanged.
  - Each state still produces exactly one `fx` limitation, as before.

**Nothing else changes.** In particular:
- `_pfFxState` and the `PF_FX_*` constants;
- `_eodComputeReadiness`, `_eodReadinessLines`, `_eodPacketToMarkdown`, `_eodPacketToBriefing`;
- the `fx-aged` / `fx-stale-invalid` reasons;
- every UI chip or qualifier (incl. both `(aged)` texts);
- the pre-export helper and copy;
- any id, severity, detail or sortKey; scoring, persistence, `pt_*`.

## 4. Lifecycle walkthrough (what the user sees)

| FX state (with USD holdings) | Needs Attention title | Totals disclosure / completeness | EOD limitation `fx` | Readiness reason line | Pre-export warning |
|---|---|---|---|---|---|
| missing | `FX rate: Unavailable (no rate fetched)` | `USD holdings excluded — FX: Unavailable (no rate fetched)` | `FX: Unavailable (no rate fetched) — cross-currency totals are not reported.` | `FX rate: Unavailable (no rate fetched)` | lists the same reason word (inherited through `_dhLabel`) |
| stale-invalid | `FX rate: Stale` | `USD holdings excluded — FX: Stale` | `FX: Stale — cross-currency totals are not reported.` | `FX rate: Stale` (unchanged) | unchanged |
| aged-but-valid / fresh | no FX item (unchanged) | no FX reason (unchanged) | unchanged `FX: rate …` line | unchanged (DH-M4b later) | unchanged |

- **No USD holdings:** no attention item and no completeness reason, as today. The limitation follows
  `reporting.fxState` exactly as before, now split into two texts.
- **Actor-to-evidence closure:**
  - every after-text is composed from the words in `DH_DISPLAY`: `surface['fx-not-fetched']` and
    `state['stale-invalid']`;
  - FW-5 proves the literals equal those compositions, so the UI, export, briefing and warning cannot
    drift apart.

## 5. Targeted QA

**`qa/dh_ui_vocabulary_offline.js`** — new "DH-M4a" section. The suite extracts the real `index.html`
(CRLF-normalized) and evaluates `DH_DISPLAY` in a `vm` context.

| ID | Assertion |
|---|---|
| FW-1 | `DH_DISPLAY.reason['fx-missing'] === 'FX rate: ' + DH_DISPLAY.surface['fx-not-fetched']` (= `FX rate: Unavailable (no rate fetched)`); every other `reason` / `state` / `verdict` / `surface` value equals its value at `4c11f4c` |
| FW-2 | `_pfComputeNeedsAttention` source contains the exact E2 after-line once; the E2 before-literals are absent from it |
| FW-3 | `_pfComputePortfolioReporting` source contains both E3 after-literals once, each with its original condition; both before-literals are absent |
| FW-4 | `_eodBuildPacket` source contains the exact three-branch E4 block. The aged/fresh `'FX: rate '` branch text is byte-equal to baseline. `'FX unavailable — cross-currency'` is absent |
| FW-5 | **Consistency.** Each E2–E4 after-literal equals its composition from the evaluated `DH_DISPLAY`:<br>- `'FX rate: ' + surface['fx-not-fetched']`<br>- `'FX rate: ' + state['stale-invalid']`<br>- `'USD holdings excluded — FX: ' + …`<br>- `'FX: ' + … + ' — cross-currency totals are not reported.'` |
| FW-6 | **Unchanged surrounding logic:**<br>- in `_pfComputeNeedsAttention`, `id: 'fx:unavailable', severity: 'high', category: 'fx'`, both `detail` sentences and the trigger condition are present byte-for-byte;<br>- E2/E3 functions contain no `DH_DISPLAY` / `_dhLabel` reference (standalone-execution safety) |
| FW-7 | File-wide: each of the six before-literals listed in §3 occurs **0** times |

- Every FW row has a planted negative. For example: the old title restored; a composition mismatch; a
  `DH_DISPLAY` reference inserted into E2; the limitation re-merged. Each is caught.
- **UV-4:** remove `'FX rate unavailable'` and `'USD holdings excluded — FX unavailable'` from the
  out-of-scope list; keep `fxLabel + ' (aged)'` and `'FX as of '` (R2 / DH-M4b).
- **UV-5:** the expected baseline `reason['fx-missing']` becomes `'FX rate: Unavailable (no rate fetched)'`.
  Every other expected value is unchanged. The existing controls stay.
- **UV-6:** re-pin `_pfComputeNeedsAttention` and `_pfComputePortfolioReporting` to their post-E2/E3
  sha256, computed at authoring time from the task tip (CR-normalized). All other UV-6 pins and
  `CONST_HASH` are unchanged. Both old and new values are recorded in `review.md`.

**`qa/eod_preexport_warning_offline.js`** — PX-9 only:
- replace the `_eodBuildPacket` and `DH_DISPLAY` values in `BASELINE_SHA256` with their post-E1/E4 sha256,
  and add one comment line: `// DH-M4a re-pin: _eodBuildPacket (E4), DH_DISPLAY (E1)`;
- the other five pins (`_eodComputeReadiness`, `_eodReadinessLines`, `_eodPacketToMarkdown`,
  `_eodPacketToBriefing`, `_dhLabel`) stay byte-identical and must still pass;
- the PX-1…PX-8 rows are unchanged and must pass. They read reason words through the real `_dhLabel`,
  so `fx-missing` flows through.

**QA lesson:** any check whose assertion calls something with real side effects computes its result once
and asserts on the stored value.

**Runs:**
1. `node qa/dh_ui_vocabulary_offline.js`
2. `node qa/eod_preexport_warning_offline.js`
3. `node qa/eod_packet_v0_offline.js`
4. full `npm run qa:offline` → **51**, including an unmodified `qa/run-offline.js` PASS

## 6. Out of scope

- **DH-M4b / R2:** aged-but-valid FX labels, `fx-aged` readiness, `(aged)` texts, and the aged limitation
  line.
- The `detail` sentences of the FX attention item (they already state facts).
- `Cash` / `market` / `research` wording, the pre-export copy, `exportJSON`, and briefing structure.
- `qa/run-offline.js`, `qa/eod_packet_v0_offline.js` (read-only here), `BACKLOG.md`, `AGENTS.md`,
  `CLAUDE.md`, `.claude/**`.

## 7. Worker flow and closure (AGENTS.md, attended Auto)

1. **Step 0:**
   - cwd = `pt-wt-worker-b`, HEAD on `task/dh-fx-export-wording` at this brief's commit;
   - run the current-guard check;
   - record the baseline `qa:offline` = 51.
2. **`plan.md`:** requirement→test map plus the CLAUDE.md pre-flight checklist.
   - Gate Verification: no gated execution path is added or changed.
   - Definition of Done: §9.
3. Tests first (FW-1…FW-7 fail at baseline), then E1–E4, then the §5 re-pins, then targeted QA.
4. Worker-launched Codex read-only review (`codex exec --sandbox read-only`) on the implementation diff.
   - Focus: exact §3 text, no condition, id or severity drift, literals in E2/E3, aged branch untouched,
     re-pins limited to the named entries.
   - Resolve findings FIX / DEFER / REJECT.
5. Full `qa:offline`, then `review.md` (pre-commit evidence only), ending with
   `LAND-EVIDENCE: qa-offline=PASS 51; targeted=PASS; codex-classI-unresolved=0`. Then the Codex final check.
6. **Step 13:**
   - stage `index.html`, `qa/dh_ui_vocabulary_offline.js`, `qa/eod_preexport_warning_offline.js` and
     `work/dh-fx-export-wording/review.md` with explicit paths in one call;
   - `git commit -m "feat(eod): apply ruled FX missing/stale wording to export-fed sites (DH-M4a)"` in a
     separate call (r9 gate).
7. **Then** run
   `node qa/guard_integrity_check.js --base-main fbec2c193346d7afd1dab6fd11a46b5efe55238b --base-dev <this brief's full commit OID> --task task/dh-fx-export-wording --since <task-start ISO> --root <canonical checkout>`.
   - The result is **LAND evidence**, reported in the STOP report only. It is never written into
     `review.md`: no amend, no second commit.
8. **STOP** and request LAND (today: the Owner).
   - If R11 lands first, this is a Second LAND: the Owner rebases in a normal terminal, and the Worker
     re-runs `qa:offline`, the land-tests and the integrity check.

## 8. STOP conditions

- **STOP-1..5** per AGENTS.md, including any file outside §2 or any change beyond §3 / §5.
- **STOP-6:**
  - any hook denial, safety-classifier block, or integrity-check FAIL;
  - any Manual fallback trigger;
  - the Owner becoming unavailable.

  Never retry in another form.
- Any change to an FX condition, `_pfFxState`, `PF_FX_*`, readiness logic, the `fx-aged` / `fx-stale-invalid`
  reasons, an aged-FX text, an id, severity, detail or sortKey.
- A `DH_DISPLAY` / `_dhLabel` reference inside `_pfComputeNeedsAttention` or `_pfComputePortfolioReporting`.
- Any edit to `qa/run-offline.js` or `qa/eod_packet_v0_offline.js`.
- Any re-pin beyond the four named hash entries and the UV-4/UV-5 expectations.
- `qa:offline` not 51, or any existing suite failing (diagnose under M4 first).
- Any push, merge, rebase, LAND, deploy, environment or `main` action by the Worker.

## 9. Definition of Done

- E1–E4 applied exactly.
- FW-1…FW-7 and their negatives PASS; UV-1…UV-7 PASS with the §5 updates; PX-1…PX-9 PASS with the two
  re-pins; `eod_packet_v0` PASS unchanged; full `qa:offline` PASS **51**.
- Codex: no unresolved Class I finding.
- One gated task-branch commit with exactly the §2 files.
- Post-commit integrity PASS, reported in the STOP report (not in `review.md`).

## 10. Why Mode: Auto (AGENTS.md eligibility)

- Approved committed brief with explicit files and STOP conditions.
- Wording-only change in ORDINARY-tier files.
- Offline QA only.
- No schema, persistence, architecture, contract, scoring or ranking change: the JSON shape and all
  codes are unchanged; only already-ruled display strings change.
- No ASK/DENY file (`qa/run-offline.js` is explicitly not edited).
- No environment, runtime or deploy work.
- All wording ruled (R1, D2, D-3).
- Own slot under the current guard.
- **Attended only.**
