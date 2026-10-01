# Task brief: DH-M4c — route the `_eodBuildPacket` FX limitation line through `DH_DISPLAY` (G-1)

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Backlog | **Entry 7** · data-state presentation contract · ARC **DH** · Slice **M4c** |
| Baseline | dfde9fbad13cb0da5e4874f80d3061d82fbf053e = `branch-dev` = `origin/branch-dev` (DH-M1…DH-M4b, R11/R12, and Entry 11 "selected-only watchlist" all landed; re-baselined from `e27ce1c` — see §11); the task branch starts at this brief's commit |
| Branch / slot | `task/dh-fx-limitation-wording`, created from this brief's commit in **Worker B** (`pt-wt-worker-b`) |
| Mode | **Auto** — the Owner may run routine implementation (Step 0 through the pre-commit targeted/full QA in §8.1-§8.5) in `acceptEdits`, per AGENTS.md's "`Mode: Auto` permits … attended Auto or `acceptEdits`." **Commit (Step 13), LAND, PUSH, and any STOP condition remain Manual / Owner-approved** — this brief does not authorize unattended or full Auto beyond the files and edits named in §3/§4/§6, and never for the actions in §8.6-§8.7. See §9 for why this classification applies and §8 for exactly where the Manual boundary sits |
| qa:offline | baseline count **measured fresh at Step 0** (not hard-coded here — no full run was performed solely to pin this number; see Evidence note below). Full `npm run qa:offline` must PASS at that same count after this task, since no suite is added, only two existing suites are extended |
| Evidence this brief is grounded on | `work/dh-entry7-closure-census/census.md` §3 row **G-1** (read-only census, no product file touched) and `work/dh-entry7-closure-census/review.md`; the pinned fixture already PASSING at `qa/eod_packet_v0_offline.js:1185` (`"FX: rate 3, USD/ILS, as of 2026-09-15T12:00:00.000Z, fresh."`), re-run once during the census (`PASS 191 asserts`) — not re-run again for this brief |
| Status | CODE-READY on Owner approval of this brief |

**Objective.** Close G-1: `_eodBuildPacket`'s `fx` limitation line (`index.html:3031-3037`) hand-authors
its own FX wording instead of calling `_dhLabel`/`DH_DISPLAY`. The `missing` and `stale-invalid`
branches (`:3032,3034`, landed DH-M4a) already echo the ruled wording as independent literals; the
third branch (`:3036`, **untouched since before DH-M1** — explicitly left "unchanged" by both the
DH-M4a and DH-M4b briefs) concatenates the **raw internal `fxState` code** (`fresh` or
`aged-but-valid` — `missing`/`stale-invalid` are already carved out above it) straight into the
visible export/briefing text, e.g. `"...as of 2026-09-15T12:00:00.000Z, fresh."` instead of
`"...Current."`.

This changes **wording only**, in one branch of one function: no condition, id, severity, threshold,
owner, schema, readiness logic, or scoring change. The `missing`/`stale-invalid` branches (already
ruled, DH-M4a) are untouched.

## 1. Rulings (carried in; not reopened)

- **DH-M0b D1/D2:** `_pfFxState` is the single FX freshness owner; display words come only from
  `DH_DISPLAY` via `_dhLabel`.
- **DH-M4a** (landed `99d4844`, `work/dh-fx-export-wording/`): ruled the `missing`/`stale-invalid`
  branches of this same `addLimitation('fx', …)` call. Its brief explicitly left the third
  (aged/fresh) branch "byte-equal to baseline" and deferred it: *"The following aged/fresh `else if`
  body (`'FX: rate ' + …`) and everything after it are byte-unchanged."* This task is exactly that
  deferred remainder.
- **DH-M4b** (landed `e27ce1c`, `work/dh-fx-aged-current/`): `aged-but-valid` is `Current` in
  `DH_DISPLAY.state`. Its own lifecycle table (`brief.md:162`) recorded this same limitation line as
  *"unchanged (`… aged-but-valid.`)"* — a known, disclosed, deliberately out-of-scope residual, not a
  defect introduced by that task.
- **`_eodReadinessLines`'s existing FX line pattern** (`index.html:2843`, unedited by this task) is
  the precedent this brief mirrors: `_dhLabel('state', d.fx.state) + (d.fx.state === 'aged-but-valid'
  || d.fx.state === 'stale-invalid' ? ' [' + d.fx.state + ']' : '')`. This task applies the same
  "ruled word, then a bracketed internal-code disambiguator for aged-but-valid" shape to the one
  remaining site that lacks it — no new design, no new ruling needed.

## 2. Current implementation (verified at `dfde9fb`; byte-identical to `e27ce1c`, shifted +6 lines — §11)

`_eodBuildPacket` (`index.html:3031-3037`):

```js
if (reporting.fxState === 'missing') {
  addLimitation('fx', 'FX: Unavailable (no rate fetched) — cross-currency totals are not reported.');
} else if (reporting.fxState === 'stale-invalid') {
  addLimitation('fx', 'FX: Stale — cross-currency totals are not reported.');
} else if (preload.fxCache.rate) {
  addLimitation('fx', 'FX: rate ' + preload.fxCache.rate + ', USD/ILS, as of ' + preload.fxCache.effectiveAt + ', ' + reporting.fxState + '.');
}
```

`reporting.fxState` is the return of `_pfFxState(fxCache, nowMs)` (`index.html:10770-10779`), whose
only possible values are `'missing' | 'fresh' | 'aged-but-valid' | 'stale-invalid'`. Since `missing`
and `stale-invalid` are carved out by the two `if`/`else if` branches above, **only `fresh` and
`aged-but-valid` ever reach the third branch.** `DH_DISPLAY.state['fresh'] === 'Current'` and
`DH_DISPLAY.state['aged-but-valid'] === 'Current'` (`index.html:2689-2690`) — both map to the one
word `Current`; the bracketed `[aged-but-valid]` suffix (mirroring `_eodReadinessLines`) is what
keeps the two states distinguishable in the visible text, exactly as it already does on the
readiness `FX:` line.

This text is rendered verbatim into both visible export surfaces via `packet.limitations[].text`:
`_eodPacketToMarkdown` (`:3101`) and `_eodPacketToBriefing` (`:3188`) — and into the raw JSON export,
since `packet.limitations` is returned unmodified as part of the packet object.

## 3. Implementation file set

**4 land-scope files (implementation + QA) + 1 tracked review/evidence file = 5 files total staged
at Step 13 (§8.6).** `land-scope`/`land-tests` below cover only the 4; `review.md` is evidence, not
tested code, and is intentionally outside those blocks (same split as every prior DH-M brief).

```
Land-scope (4):
index.html                                   E1 (§4)
qa/dh_ui_vocabulary_offline.js               FL-1, FL-2 (new); FW-4 sub-check retired (§6)
qa/eod_packet_v0_offline.js                  RD-AC14 fixture text update; RD-FL1 (new) (§6)
qa/eod_preexport_warning_offline.js          PX-9 re-pin of one hash only (§6)

Evidence, not land-scope (1):
work/dh-fx-limitation-wording/review.md      NEW — tracked task evidence
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

**QA suites that read in-scope files as text** (verified at `dfde9fb`; these three files are
byte-identical to `e27ce1c` — untouched by Entry 11, confirmed by diffstat, §11):
- `qa/dh_ui_vocabulary_offline.js`: FW-4 (DH-M4a section) currently asserts the aged/fresh branch
  text (`FW4_AGED_FRESH_BRANCH`) is **byte-equal to baseline** — that sub-check is retired and
  replaced by FL-1/FL-2 (§6); FW-1..FW-3, FW-5..FW-7 are unaffected (they cover the
  `missing`/`stale-invalid` branches and the `_pfComputeNeedsAttention`/`_pfComputePortfolioReporting`
  sites, none of which this task touches). The DH-M4b section (AG-1..AG-6) is unaffected — it reads
  `_pfFxState`, `_pfFxRateValid`, `_dhLabel`, `_dhFxAgedLabel`, `_pfFxAgeWholeDays`, none of which this
  task edits.
- `qa/eod_packet_v0_offline.js`: RD-AC14's pinned `BASE_LIMITATIONS` fixture has one `fx`-code row
  ending `fresh.` (`:1185`) that becomes `Current.` (§6). No other RD-* row pins this text.
- `qa/eod_preexport_warning_offline.js`: PX-9 pins `_eodBuildPacket`'s sha256
  (`38c399f34bdd2c98be59bef832be2b9d842705d8d09700bb908932ad4b424401`, unchanged from `e27ce1c` to
  `dfde9fb` since the function's text is byte-identical — §11) — re-pinned (§6).
  The other six PX-9 pins (`_eodComputeReadiness`, `_eodReadinessLines`, `_eodPacketToMarkdown`,
  `_eodPacketToBriefing`, `_dhLabel`, `DH_DISPLAY`) stay byte-identical — **this task edits no
  `DH_DISPLAY` value**, so that pin does not change.
- `qa/run-offline.js` (ASK tier, **not edited**): does not call `_eodBuildPacket` and has no
  `DH_DISPLAY`/`_dhLabel` reference (confirmed by file-wide search) — unaffected by construction.

## 4. Exact change (`index.html`; CRLF preserved; the before-text occurs exactly once at `dfde9fb`)

**E1 — `_eodBuildPacket`'s third `fx`-limitation branch only** (`:3035-3037`). Replace:

```js
} else if (preload.fxCache.rate) {
    addLimitation('fx', 'FX: rate ' + preload.fxCache.rate + ', USD/ILS, as of ' + preload.fxCache.effectiveAt + ', ' + reporting.fxState + '.');
  }
```

with:

```js
} else if (preload.fxCache.rate) {
    addLimitation('fx', 'FX: rate ' + preload.fxCache.rate + ', USD/ILS, as of ' + preload.fxCache.effectiveAt + ', ' +
      _dhLabel('state', reporting.fxState) + (reporting.fxState === 'aged-but-valid' ? ' [aged-but-valid]' : '') + '.');
  }
```

- The `if (reporting.fxState === 'missing')` / `else if (reporting.fxState === 'stale-invalid')`
  branches above it (`:3031-3034`) are byte-unchanged.
- `reporting.fxState` itself, `preload.fxCache.rate`, `preload.fxCache.effectiveAt` and the
  `'FX: rate ' + … + ', USD/ILS, as of ' + …` prefix are unchanged — only the trailing
  state-word segment changes.
- `_dhLabel` is already extracted/loaded wherever `_eodBuildPacket` runs standalone
  (`qa/eod_packet_v0_offline.js`'s `FNS` list already includes both `_eodBuildPacket` and `_dhLabel`,
  `DH_DISPLAY` is already loaded as a var there) — no new scope wiring needed. `qa/run-offline.js`
  does not execute `_eodBuildPacket`, so this is not the `_pfComputeNeedsAttention` /
  `_pfComputePortfolioReporting` situation (DH-M4a, where `DH_DISPLAY`/`_dhLabel` had to stay out of
  those two functions because `qa/run-offline.js` calls them standalone without that context).

**Nothing else changes.** In particular:
- `_pfFxState`, `PF_FX_*`, `_pfFxRateValid`, `_dhFxAgedLabel`, `_pfFxAgeWholeDays`;
- the `missing`/`stale-invalid` branches of this same limitation (DH-M4a wording);
- `DH_DISPLAY` (no key or value edited — this task only adds a `_dhLabel` *call site*);
- `_eodComputeReadiness`, `_eodReadinessLines`, `_eodPacketToMarkdown`, `_eodPacketToBriefing`,
  `_eodPreExportWarning`, `EOD_PREEXPORT_COPY`;
- `_pfComputeNeedsAttention`, `_pfComputePortfolioReporting` (DH-M4a sites);
- any UI chip/qualifier/badge/banner site;
- totals, P/L, weights, the daily-move estimate, readiness verdict/reason logic, the packet JSON
  shape (`limitations[].text` content changes; `limitations[].code` stays `'fx'`; no code added or
  removed; every state still produces exactly one `fx` limitation, as before);
- styles; scoring; persistence; `pt_*`.

## 5. Lifecycle walkthrough and actor-to-evidence closure

| FX state (reaches this branch) | Before (leaked raw code) | After (E1) |
|---|---|---|
| fresh | `FX: rate <r>, USD/ILS, as of <t>, fresh.` | `FX: rate <r>, USD/ILS, as of <t>, Current.` |
| aged-but-valid | `FX: rate <r>, USD/ILS, as of <t>, aged-but-valid.` | `FX: rate <r>, USD/ILS, as of <t>, Current [aged-but-valid].` |
| stale-invalid | unaffected (DH-M4a branch, `:3034`) | unaffected |
| missing | unaffected (DH-M4a branch, `:3032`) | unaffected |

- **Readiness `FX:` line stays the single source of truth for the raw-code disambiguation pattern**
  — this task only makes the limitation line consistent with it, not the other way around.
- **Actor-to-evidence closure:**
  - the word itself is proven to come from `DH_DISPLAY.state[reporting.fxState]` (FL-1, composition
    check — a table edit changes the output, proven by a control);
  - the raw-code leak is proven gone by a file-wide absence check (FL-2: `+ reporting.fxState + '.'`
    occurs 0 times);
  - the real, end-to-end behavior is proven on actual `_eodBuildPacket` output for both reachable
    states, not just on source text (RD-FL1, using the existing `build()` harness in
    `qa/eod_packet_v0_offline.js`, the same harness RD-AG1/RD-AG2 used for the DH-M4b readiness
    line).

## 6. Targeted QA

**`qa/dh_ui_vocabulary_offline.js`** — new "DH-M4c" section, inserted after the existing DH-M4b
section (after line 654, before the `// ---- result` block). Follows the file's established
`extractFunctionSource` / `swap` / `check(...)` pattern.

| ID | Assertion |
|---|---|
| FL-1 | `_eodBuildPacket`'s third `fx`-limitation branch contains the exact E1 after-text once; composes as `'FX: rate ' + r + ', USD/ILS, as of ' + t + ', ' + _dhLabel('state', fxState) + (fxState === 'aged-but-valid' ? ' [aged-but-valid]' : '') + '.'` against the evaluated `DH_DISPLAY` (reuse `loadDisplay`); a table edit to `state['fresh']` or `state['aged-but-valid']` changes the composed value (control) |
| FL-2 | File-wide: the raw-code concatenation `+ reporting.fxState + '.'` occurs **0** times; the two `missing`/`stale-invalid` branches (`:3032,3034`, DH-M4a wording) are present and byte-unchanged |

- Each row has a planted negative (FL-1: restore the pre-E1 literal `+ reporting.fxState + '.'`; FL-2:
  reintroduce that literal via `swap`, expect the absence check to fail).
- **FW-4 update (DH-M4a section, `:367-394`):** the sub-check and control that pinned
  `FW4_AGED_FRESH_BRANCH` as byte-equal to baseline is **retired** — FL-1/FL-2 supersede it for this
  branch. FW-4's other two assertions (the `missing`/`stale-invalid` branches of the E4 block,
  `FW4_BLOCK`) are **unchanged and must still pass** — this task does not touch them. Record the
  retirement in `review.md` with the same "superseded by" pattern DH-M4b used for UV-4.
- **FW-5's E4 composition checks** (`:398-415`) cover only the `missing`/`stale-invalid` compositions
  — unaffected, must still pass unchanged.
- **FW-7's before-literal list** (`:446-460`) does not include the aged/fresh branch text — unaffected,
  must still pass unchanged.

**`qa/eod_packet_v0_offline.js`:**
- **RD-AC14 fixture update:** the pinned `BASE_LIMITATIONS` row at `:1185`
  (`"text": "FX: rate 3, USD/ILS, as of 2026-09-15T12:00:00.000Z, fresh."`) becomes
  `"text": "FX: rate 3, USD/ILS, as of 2026-09-15T12:00:00.000Z, Current."` — confirm the control
  fixture's `fxState` is in fact `fresh` (not `aged-but-valid`) at its injected clock before editing;
  if it is not, the brief's assumption is wrong and this is a STOP condition (§9), not a
  silently-adjusted fixture.
- **RD-FL1 (new):** using the existing `build()` harness (`:910`), construct two packets — one with
  `fxCache` fresh (≤ `PF_FX_FRESH_MAX_AGE_DAYS`), one aged-but-valid (within the aged-but-valid
  window) — and assert:
  - the fresh packet's `fx` limitation `.text` ends exactly `', Current.'` and contains no `fresh`,
    `aged-but-valid`, or `[` ;
  - the aged-but-valid packet's `fx` limitation `.text` ends exactly `', Current [aged-but-valid].'`;
  - in both, the `'FX: rate ' + … + ', USD/ILS, as of ' + …` prefix is unchanged and matches
    `preload.fxCache.rate`/`effectiveAt` exactly;
  - the `missing`/`stale-invalid` packets' `fx` limitation text is byte-identical to today (control:
    unaffected by this task).
- **Planted negative:** `patchSrc` restoring the raw `+ reporting.fxState + '.'` form makes RD-FL1's
  fresh/aged-but-valid assertions fail.
- All other rows (RD-AC1…RD-AC13, RD-AC15…, RD-AG1, RD-AG2, N1, N4, R-J7, R-U1, etc.) are unchanged and
  must pass.

**`qa/eod_preexport_warning_offline.js`** — PX-9 only:
- replace the `_eodBuildPacket` value in `BASELINE_SHA256` (`:118`) with its post-E1 sha256 (computed
  at authoring time from the task tip, CRLF-normalized, same method as every prior PX-9 re-pin), adding
  the comment `// DH-M4c re-pin: _eodBuildPacket (E1)`;
- the other six pins (`_eodComputeReadiness`, `_eodReadinessLines`, `_eodPacketToMarkdown`,
  `_eodPacketToBriefing`, `_dhLabel`, `DH_DISPLAY`) stay byte-identical — **`DH_DISPLAY` is not edited
  by this task**, so unlike every prior DH-M4* re-pin, this one touches exactly one hash, not two;
- PX-1…PX-8 unchanged and must pass.

**Also:** an unmodified `qa/run-offline.js` must pass; full `npm run qa:offline` = the Step-0 baseline
count (no suite added, two existing suites extended).

**QA lesson (carried forward):** any check whose assertion calls something with real side effects
computes its result once and asserts on the stored value.

## 7. Out of scope

- The `missing`/`stale-invalid` branches of this same limitation (DH-M4a, landed, untouched).
- `_eodReadinessLines`'s own FX line, the pre-export warning, any UI chip/qualifier/badge/banner site,
  Needs Attention, completeness reasons — none of these leak a raw code; none is touched.
- **ResearchView's `'Stale'` literal** (`index.html:10364`, census §4 row I-1) — a separate,
  pre-existing local vocabulary never claimed by any DH-M ruling or by BACKLOG Entry 7's committed
  scope. Explicitly **not** absorbed by this task.
- **Any other local vocabulary** named in `work/dh-vocabulary-census/census.md` §4.6 (API status
  badges, scan-results banner family, etc.) — out of scope, not touched.
- `DH_DISPLAY` itself — no key or value is added, removed, or edited.
- `BACKLOG.md` — this task does not update it (see §8's "After LAND" note).
- `qa/run-offline.js`, `AGENTS.md`, `CLAUDE.md`, `.claude/**`.

## 8. Worker flow and closure

**§8.1-§8.5 may run in `acceptEdits` under this brief's Mode (see header). §8.6-§8.7 are Manual /
Owner-approved regardless of mode, per AGENTS.md steps 13-15 — the Worker always stops and the Owner
always approves commit, LAND and push explicitly.**

1. **Step 0** (acceptEdits-eligible):
   - cwd = `pt-wt-worker-b`, HEAD on `task/dh-fx-limitation-wording` at this brief's commit;
   - run the current-guard check;
   - **measure and record the baseline `qa:offline` spawned-suite count** (full run, once — this is
     the Step-0 measurement this brief deliberately deferred; do not hard-code a number from runner
     structure).
2. **`plan.md`** (acceptEdits-eligible): requirement→test map plus the CLAUDE.md pre-flight checklist.
   - Pattern Auditing: cite `_eodReadinessLines`'s FX-line bracket pattern (`:2843`) and DH-M4a's
     `addLimitation('fx', …)` branch-split pattern (`:3031-3034`) as the two existing patterns this
     change matches.
   - State & Boundary Isolation: confirm zero `localStorage`/DOM/scoring-engine touch; confirm
     `packet.limitations[].code` stays `'fx'` and the dimension count is unchanged.
   - Gate Verification: no gated execution path is added or changed — N/A, state so explicitly.
   - Definition of Done: §9 below.
3. **Implementation** (acceptEdits-eligible): tests first (FL-1, FL-2, RD-FL1 fail at baseline), then
   E1, then the §6 fixture/re-pin updates, then targeted QA.
4. **Codex review** (acceptEdits-eligible to launch): Worker-launched Codex read-only review
   (`codex exec --sandbox read-only`) on the implementation diff.
   - Focus: exactly one branch of one function changed; the `missing`/`stale-invalid` branches and
     every other DH-M4a/M4b site byte-unchanged; no `DH_DISPLAY` key/value edited; the re-pin limited
     to `_eodBuildPacket`'s single hash; no readiness/schema/scoring drift.
   - Resolve findings FIX / DEFER / REJECT.
5. **Pre-commit evidence** (acceptEdits-eligible): full `qa:offline`, then `review.md` (pre-commit
   evidence only), ending with
   `LAND-EVIDENCE: qa-offline=PASS <n>; targeted=PASS; codex-classI-unresolved=0`. Then the Codex final
   check.
6. **Step 13 — Manual / r9 gate, not acceptEdits:**
   - stage all **five** §3 files (the four land-scope files plus
     `work/dh-fx-limitation-wording/review.md`) with explicit paths in one call;
   - `git commit -m "feat(eod): route the FX limitation line through DH_DISPLAY (DH-M4c)"` in a
     separate call (r9 gate);
   - then run
     `node qa/guard_integrity_check.js --base-main fbec2c193346d7afd1dab6fd11a46b5efe55238b --base-dev dfde9fbad13cb0da5e4874f80d3061d82fbf053e --task task/dh-fx-limitation-wording --since <task-start ISO> --root <canonical checkout>`.
   - The result is **LAND evidence**, reported in the STOP report only; never written into `review.md`
     (no amend, no second commit).
7. **LAND — Manual / Owner-approved, not acceptEdits:** follow AGENTS.md steps 14-15
   (`pt-land.js land-request` / `land` / `push-request` / `push` with the Owner's `!` lines). This
   brief has a `land-scope` block and touches no protected path.
   - If `branch-dev` moved since this brief's baseline, this is a Second LAND: the Owner rebases, and
     the Worker re-runs `qa:offline`, the land-tests and the integrity check.

## 9. STOP conditions and Definition of Done

**STOP (always Manual/Owner-approved, regardless of acceptEdits):**
- **STOP-1..5** per AGENTS.md (any file outside §3; any change beyond §4 / §6).
- **STOP-6:**
  - any hook denial, safety-classifier block, or integrity FAIL;
  - any Manual fallback trigger not covered by this brief;
  - the Owner becoming unavailable.

  Never retry in another form.
- The Step-0 RD-AC14 fixture is found to be `aged-but-valid` rather than `fresh` (§6) — the brief's
  "fresh." assumption would be wrong; STOP and report rather than silently adjusting the text.
- Any change to:
  - the `missing`/`stale-invalid` branches of this limitation;
  - any `DH_DISPLAY` key or value;
  - `_pfFxState`, `PF_FX_*`, `_pfFxRateValid`, `_dhFxAgedLabel`, `_pfFxAgeWholeDays`;
  - `_eodComputeReadiness`, `_eodReadinessLines`, `_eodPacketToMarkdown`, `_eodPacketToBriefing`,
    `_eodPreExportWarning`, `EOD_PREEXPORT_COPY`;
  - `_pfComputeNeedsAttention`, `_pfComputePortfolioReporting`;
  - `packet.limitations[].code`, the number of `fx` limitations produced, or any other packet-shape
    field;
  - any UI chip/qualifier/badge/banner site;
  - the ResearchView `'Stale'` literal or any other local vocabulary (census §4);
  - styles, scoring, persistence, `pt_*`.
- A re-pin beyond the single `_eodBuildPacket` hash in PX-9.
- `qa:offline` ≠ the Step-0 baseline count, or any existing suite failing (diagnose under M4 first).
- Any push, merge, rebase, LAND or deploy outside AGENTS.md steps 14-15.
- Any full `npm run qa:offline` run performed for a purpose other than the required Step-0 measurement
  and the required pre-commit/post-commit runs this brief already calls for.
- Any commit, LAND, or push attempted outside the Manual/Owner-approved §8.6-§8.7 steps — `acceptEdits`
  never covers these regardless of how routine the preceding edits were.

**Definition of Done:**
- E1 applied exactly.
- FL-1, FL-2, RD-FL1 PASS with planted negatives; FW-1..FW-3, FW-5..FW-7, AG-1..AG-6, PX-1..PX-8,
  RD-AC1..RD-AC13, RD-AC15.., RD-AG1, RD-AG2 and all other existing rows PASS unchanged; `run-offline`
  PASS unmodified; full `qa:offline` PASS at the Step-0 baseline count.
- Codex: no unresolved Class I finding.
- One gated task-branch commit (Manual, Step 13) with exactly the five §3 files — the four land-scope
  files plus `review.md`.
- Post-commit integrity PASS, reported in the STOP report.
- G-1 (census `work/dh-entry7-closure-census/census.md` §3) is closed: `reporting.fxState`'s raw code
  no longer appears, untranslated, in the export/briefing/JSON `fx` limitation text.
- LAND via steps 14-15 or by the Owner (Manual).
- **After LAND:** this task does not update `BACKLOG.md` (out of scope, §7). A separate, Owner-approved
  step applies the census's proposed BACKLOG line (`work/dh-entry7-closure-census/census.md` §5,
  amended to record DH-M4c as the item that closed G-1) to actually close Entry 7.

## 10. Why this classification: `acceptEdits` for implementation, Manual for commit/LAND/push

- **Not full/unattended Auto.** AGENTS.md prohibits unattended Auto outright; this brief never asks
  for it. The Owner stays attended for the whole session either way.
- **`acceptEdits` for §8.1-§8.5 only** because every `Mode: Auto` eligibility condition holds: an
  approved, committed brief with explicit files and STOP conditions (this document); bounded QA-only
  change (one branch, one function, two extended suites, no suite added); offline QA only; no schema,
  persistence, architecture, contract, scoring or ranking change (§4's "Nothing else changes" list and
  the packet-shape STOP condition in §9 both pin this); no ASK- or DENY-tier file in scope (`index.html`
  and the three `qa/*.js` files are ORDINARY tier; `qa/run-offline.js` — ASK tier — is explicitly not
  edited); no environment/runtime/live-API/deploy/`main` mutation; every Owner ruling this task needs
  already exists (§1); the session runs in Worker B's own slot under the current guard.
- **Manual for commit (Step 13), LAND (Step 14) and push (Step 15) regardless of mode** — this is not
  specific to this brief; it is how every Worker-mode brief works under AGENTS.md: "The Owner does not
  approve individual file edits … task-branch commits follow the r9 gate," and LAND/push are their own
  explicit Owner-approved steps (14-15). `acceptEdits` speeds up the bounded implementation work in
  §8.1-§8.5; it changes nothing about who approves the commit or the LAND.
- Unlike DH-M4b (which removed a lowering rule from the ratified readiness contract and was therefore
  fully Manual throughout, including implementation), this task changes no contract *behavior* — only
  the text of an already-existing, always-fired limitation entry — so implementation itself does not
  need the Manual, one-edit-at-a-time posture DH-M4b required.

## 11. Re-baseline note (metadata/line-reference refresh only, no semantic change)

Between this brief's first approval and its brief-only commit, Worker A landed and pushed Entry 11
("selected-only watchlist"): `branch-dev` = `origin/branch-dev` moved from `e27ce1c` to `dfde9fb`
(`git diff --stat e27ce1c dfde9fb`: `index.html` +37/-1, plus a new unrelated QA suite
`qa/selected_only_watchlist_offline.js` and Entry 11's own `work/selected-only-watchlist/{brief,review}.md`).

**Verified before touching this brief:**
- `git diff e27ce1c dfde9fb -- index.html` shows every inserted line confined to the Watchlist
  "Selected only" toggle (new CSS at old `:414-415`, a new `<label>` at old `:897-900`, `_selectedOnly`
  state + `toggleSelectedOnly()` + three filter-site edits spanning old `:6616-7495`) — entirely outside
  this brief's EOD/FX/`DH_DISPLAY` surface.
- A byte-for-byte `diff` of every region this brief cites — `DH_DISPLAY`/`_dhLabel`/`_dhFxAgedLabel`
  (old `:2680-2730`), `_eodBuildPacket` through `_eodPacketToBriefing` (old `:2877-3090`), and
  `_pfFxState` (old `:10735-10750`) — against the same ranges read at their new offsets on `dfde9fb` is
  **empty**: the text this brief depends on is byte-identical, not just similar.
- The shift is two flat bands, not a per-line change: **+6** for everything before the Watchlist edit
  block (covers `DH_DISPLAY`, `_eodBuildPacket`, `_eodPacketToMarkdown`/`_eodPacketToBriefing`), **+35**
  for everything after it (covers `_pfComputePortfolioReporting`, `_pfComputeNeedsAttention`,
  `_pfFxState`, the ResearchView `'Stale'` literal cited in §7). Every new line number in this brief
  (§1-§8) was taken directly from `grep -n` against `git show dfde9fb:index.html`, not computed by
  arithmetic.
- `qa/dh_ui_vocabulary_offline.js`, `qa/eod_packet_v0_offline.js`, `qa/eod_preexport_warning_offline.js`
  and `qa/run-offline.js` do not appear in the Entry 11 diffstat at all — byte-identical to `e27ce1c`,
  including every hash this brief cites (`_eodBuildPacket`'s PX-9 pin
  `38c399f34bdd2c98be59bef832be2b9d842705d8d09700bb908932ad4b424401` is unchanged, since the function
  text it hashes is unchanged).
- `BACKLOG.md` is not in the Entry 11 diffstat.

**Conclusion: metadata/line-reference refresh only — no substantive revision.** No technical
assumption in §1-§10 changed: the E1 replacement text, the FL-1/FL-2/RD-FL1 QA design, G-1's scope,
and the BACKLOG exclusion (§7/§9) are all unchanged from the version first approved. Only the
`Baseline` field and the `index.html` line-number citations throughout §1-§8 were updated to match
`dfde9fb`.
