# surface-1b — review (22b session-only Labs switches and Entry 30 shared "Stale" label)

Task `task/surface-1b`, Mode Manual (M5: TX-5 contract refinement and a client gate writer). Both slices are complete: Slice 1 (Labs, LB-R1) checkpoint `6ebd456`, Slice 2 (Stale label) checkpoint `562de3c`. Continues `surface-1`, which closed at its Slice 1 (Main Control SR-1).

## Files changed
- Implementation (6): index.html, qa/labs_panel_offline.js, qa/ts1_default_exposure_offline.js, qa/dh_ui_vocabulary_offline.js, qa/fixtures/index-pins.json, BACKLOG.md
- Evidence (tracked): work/surface-1b/brief.md, work/surface-1b/review.md

The implementation list equals the brief's land scope. `BACKLOG.md` is edited for entries 22 and 30 only.

## Rulings carried by this task
- **LB-R1 (2026-10-11), verbatim from the brief:** a user-initiated, session-only Labs toggle is **not a load-time default**. TX-5 may be narrowly refined to permit **exactly one explicit strict-boolean assignment to `window.PT_ENABLE_DEEP_DIVE`, exclusively inside `setLabsFlag`**. All existing safety invariants are preserved. Mutation negatives must reject: automatic initialization, duplicate writers, non-strict assignments, computed-key writes, and indirect `globalThis` / `Reflect.set` workarounds.
- Entry 22 / 22b (2026-10-03): Labs holds experimental-but-working features only; Deep Dive and Portfolio research are the only switches; Portfolio research shows existing results only; switches are session-only; the `init()` read of `pt_enable_portfolio_research` is untouched; Tech Score stays out, Research Evidence stays disabled.
- Entry 30 / D8: route "Stale" through the shared labels, text-identical.
- SR-1 (`surface-1` closes at Slice 1) and SR-2 (`surface-1b` before `ai-output-2`).
- PC-2 / PC-3: the five revert chains are frozen and untouched; no new top-level function is referenced by `renderMainPanel`.

## Implementation
**Slice 1 (`index.html`, exact brief text, CRLF preserved):**
- L1: five `.labs-*` CSS rules after the `.api-info-text` rule. L2: the `#labsBox` section after the `api-info-box` element, inside the api modal, with exactly two switches.
- L3: `PT_LABS_FLAGS`, `renderLabsToggles` (reads `window[flag] === true` only) and `setLabsFlag`, which writes each gate by name: `window.PT_ENABLE_DEEP_DIVE = (on === true);` and `window.PT_ENABLE_PORTFOLIO_RESEARCH = (on === true);`, then redraws only the in-memory view that is already shown. An unknown flag returns without any write.
- L4: `toggleApiStatus` calls `renderLabsToggles()` on open.
- No storage, fetch, scan, job or computed-key write is reachable from the setter; the `init()` read is untouched.

**Slice 1 (`qa/ts1_default_exposure_offline.js`, brief S1.2):** `LABS_WRITERS` and `labsWriterSpan` were added and `checkTx5` was refined. It first rejects any gate write through a global alias (`globalThis|self|top|parent|frames`) and any `Reflect.set` / `Reflect.defineProperty` on the global object. For each Labs gate with live assignments it then requires exactly one assignment, exactly one `window.<GATE> =` form, located inside the unique `setLabsFlag`, whose text is exactly `window.PT_ENABLE_DEEP_DIVE = (on === true);`; that one write is then removed from the remaining checks. Every other TX-5 rule (allow-list, no-default list, object-literal defaults) applies unchanged. One header line names LB-R1.

**Slice 2 (`index.html`):** in `_renderPortfolioPanel`, `resStEl.textContent = isStale ? 'Stale' : 'Research';` became `resStEl.textContent = isStale ? _dhLabel('state', 'stale') : 'Research';`. `DH_DISPLAY.state['stale']` is `'Stale'`, so the visible text is identical; the CSS class expression and the `'Research'` literal are unchanged.

### New planted negatives in `ts1_default_exposure_offline.js` (the eight of S1.2)
| # | Negative (mutation of an in-memory copy of `index.html`) | Rejected by |
|---|---|---|
| N1 | strict Deep Dive write placed in `init()` (automatic initialization) | TX-5 |
| N2 | duplicate Deep Dive writer in `setLabsFlag` | TX-5 |
| N3 | non-strict `= on;` | TX-5 |
| N4 | non-strict `= true;` | TX-5 |
| N5 | computed-key `window[flag] = (on === true);` in `setLabsFlag` | TX-2 (unchanged ban) |
| N6 | `globalThis.PT_ENABLE_DEEP_DIVE = (on === true);` | TX-5 |
| N7 | `Reflect.set(window, 'PT_ENABLE_DEEP_DIVE', on === true);` | TX-5 |
| N8 | `PT_ENABLE_FUND_FACTS_READ_CLIENT` written inside `setLabsFlag` | TX-5 |

TX-1 to TX-4, TX-2's dynamic ban, the scan controls and all pre-existing negatives are unchanged and still reject (compared hunk by hunk by Codex in the step-8 review).

### Seed inventory
The archived `surface-1` Slice 2 work (reference only, no approval) is at `C:\Users\Owner\Documents\Project\pt-work-artifacts\surface-1-s2\20261011T112905Z\`, `ARCHIVE-INVENTORY.txt` sha256 `7b4b093a37f38c70aa4feb0c71d19024dd8929ff39c58191550af49ba5f21d28`. Its L3 (`window[flag] = ...`) was superseded by the static per-gate writes; its L1, L2 and L4 hunks are byte-identical to this task's.

### Readings used (recorded, no scope change)
- **LB-4 / LB-5 scan non-comment lines.** The brief's mandated L3 comment says "no storage write, no fetch, no scan, no computed-key write". The comment is kept character for character; the token scans for storage and network calls therefore look at code lines only. Codex accepted this reading.
- **LB-8 and Slice 2.** The brief's LB-8 says `_renderPortfolioPanel` is unchanged, while its own Slice 2 edits that function. Reading used: that one function may differ from the base only by Slice 2's single line, which LB-8 reverts before hashing; any other change to it still fails (a dedicated negative proves it). Codex accepted this reading in the Slice 2 review.
- **LB-10 liveness.** `index.html` contains the text `window.PT_ENABLE_DEEP_DIVE = true` inside a `console.warn` string. LB-10 therefore uses the same comment- and string-aware liveness rule as TX-2 / TX-5 instead of a plain token scan.

## QA
- Pre-edit baseline (Step 0, base eb362b0, normal digest-gated run, no forced replay): `npm run qa:offline` PASS, 79 suites, 0 FAIL, 1 advisory warning, exit 0 (first line of `qa.log`).
- RED then GREEN, Slice 1: the refined `ts1_default_exposure_offline.js` failed its new negatives (their anchors could not resolve yet) and `labs_panel_offline.js` failed every row that needs the new code before the change; both pass after it.
- `qa/labs_panel_offline.js` (new): LB-1 to LB-11 plus a planted negative for each row family, 32 assertions in all (the count in `qa.log`), all PASS. Negatives: a third switch; an unknown flag writing a computed key; a third flag in the list; truthy instead of strict; a storage write; a fetch in the setter; no Deep Dive redraw; a redraw during a live run; the `init()` read edited; the `init()` read duplicated; `_renderPortfolioPanel` changed beyond Slice 2's line; no sync on open; truthy reflection; a computed-key setter; a second Portfolio-research writer; a Deep Dive writer outside `setLabsFlag`; a `globalThis` bracket-form write; a `Reflect.set` write; a Deep Dive write hidden in a nested function; two non-strict writers (`= on`, `= true`).
- Slice 2: `dh_ui_vocabulary_offline.js` gains site row U9 plus a render check (Stale / Research, CSS class unchanged) and three controls; U1 to U8 and every existing assertion are unchanged (additions only); 70 assertions PASS.
- Pin map: Slice 1 `index-pins --diff` against the task base lists exactly `functions.toggleApiStatus` (changed), `functions.renderLabsToggles` and `functions.setLabsFlag` (added), the remainder and the file digest. Slice 2 `--diff` against checkpoint `6ebd456` lists exactly `functions._renderPortfolioPanel` and the file digest. `--check` is OK (378 functions, 25 regions) at the tip.
- Coupling execution rule: before each checkpoint commit every coupled suite of the land-tests was run against the slice's real code, plus the two fund-facts suites. All exit 0, unmodified.
- Step 10 (full `npm run qa:offline`, one normal digest-gated run at tip `562de3c`): PASS, 80 suites (step 0 plus `qa/labs_panel_offline.js`), 0 FAIL, exit 0. The E1 gate ran its normal validation (four SKIP lines for pinned heavy rows; no re-pin, invalid or override line); the verbatim lines are in `qa.log`.

## Fresh-context self-review
Re-read the brief (sections 0, S1.1 to S1.5, S2) and the complete implementation diff against the requirement-to-test map. L1 to L4 and the Slice 2 line match the quoted text exactly and sit at the named sites; the only `index.html` writes to a gate are the two inside `setLabsFlag`; nothing outside the approved six files changed. What changed as a result: nothing beyond the three test-side corrections already made during implementation (the string-aware LB-10 rule, the U9 control anchor that first hit the U4 site, and the LB-8 reading above).

## Codex (step 8, read-only, real diff plus the untracked suite; raw output in `codex.md`)
**Slice 1 review: three Class I findings, classified before editing.**
| # | Finding | Class | Disposition |
|---|---|---|---|
| 1 | TX-5 accepts a Deep Dive write inside a function nested within `setLabsFlag` (the span check is "somewhere inside the setter") | I | **FIX** in `labs_panel_offline.js`: LB-10 pins `setLabsFlag` to the exact S1.1 text, so no write can hide in a nested function; negative added. **DEFER** the same hardening of `ts1_default_exposure_offline.js`: the brief fixes S1.2's text and S1.5 makes any change to that suite beyond S1.2 a STOP; it belongs in a follow-on test-hardening task. |
| 2 | TX-5 misses `globalThis['PT_ENABLE_DEEP_DIVE'] = …` and variable aliases (`const g = window; g.X = …`) | I | **FIX** (bracket and dot alias forms, `Reflect` writes) in LB-10, with negatives; **DEFER** the same hardening of `ts1` as above; **REJECT** the variable-alias form: no static scan can follow an arbitrary alias variable, TX-2 / TX-5 are by design a static approximation, and the pinned setter plus the file-wide scans leave no such write in the shipped code. |
| 3 | LB-10 shares the blind spot of finding 2 | I | **FIX**, same change as above. |

Everything else the review was asked to confirm passed: L1 to L4 match the brief; the eight new TX-5 negatives reject through their named rows; the old negatives, the scan controls and TX-1 to TX-4 are unchanged; the LB-4 / LB-5 reading is accepted.

**Scoped re-pass (changed hunks of `labs_panel_offline.js` only): PASS, no findings.**

**Slice 2 review (diff against checkpoint `6ebd456`): PASS, no findings;** Codex accepted the LB-8 reading and confirmed the revised LB-8 still catches any other change to `_renderPortfolioPanel`.

### Final check (step 12, raw output in `codex.md` under `## Final check`)
The final check ran on the complete task diff, including this file and the `BACKLOG.md` reconciliation. It returned no class-I finding and one class-II finding.
- Rejected, with reason: "`review.md` is labeled tracked but is untracked in the current worktree". The fixed two-row Files-changed shape lists `work/surface-1b/review.md` on its Evidence row, and the step-13 commit, which this task has not made yet, is what tracks it. The review prompt stated this.

Final check: 1 round, 0 class-II findings fixed, 1 rejected, self-checked; no implementation change, no QA re-run.

## Backlog reconciliation
- Brief's Backlog row: entry 22 `close` (S1) and entry 30 `close` (S2).
- Action taken: `updated`, `BACKLOG.md` entries 22 and 30 only.
- Entry 22 heading before → after: `### 22 · Gate exposure & surfacing policy` → `### 22 · Gate exposure & surfacing policy — **DONE**`; its "Remains — 22b" text became "22b landed", and its Master line now names `surface-1b` S1.
- Entry 30 table row status before → after: `**Split from entry 7 at its closure (Owner ruling 2026-10-03).**` → `**DONE; split from entry 7 at its closure (Owner ruling 2026-10-03), closed 2026-10-12 (`work/surface-1b/`, `surface-1b` S2).**`, with a `Landed` sentence.
- DONE / HISTORY: two lines added in entry-number order, `**22**` and `**30**`, between `**11**` and `**32**`, each of the form ``**<n>** <title> — `work/surface-1b/` ``.
- The snapshot table, counts and every other entry are untouched. The new text matches the diff (one Deep Dive and one Portfolio-research writer, both inside `setLabsFlag`; the badge reading `_dhLabel('state', 'stale')`), the QA results (80 suites PASS) and the work being landed.

## Lessons
- [backlog] TX-5 / TX-2 hardening: `ts1_default_exposure_offline.js` itself does not reject a `globalThis['PT_ENABLE_DEEP_DIVE'] = …` bracket-form write or a Deep Dive write nested inside `setLabsFlag`; only `labs_panel_offline.js` LB-10 does — pending routing
- [backlog] The Masters table rows for entries 22 and 30 in `BACKLOG.md` still name `surface-1` S2 / S3; they belong to the COWORK backlog reconciliation, not to this task's entry edits — pending routing
- [rule] A brief that asserts "function X is unchanged" in a slice-1 test must say whether a later slice edits X; otherwise the assertion contradicts the brief's own later slice. Destination-ready text for brief authoring and `pt-offline-suite`: "A byte-identity or pin assertion on a function must list the later slices of the same Master that edit it, and name the exact permitted difference."
- [local] The LB-4 / LB-5 and LB-8 readings follow from the brief's mandated comment and from its own Slice 2; true of this task only.
- [covered] The coupling execution rule (run every coupled suite against the slice's real code before the first commit) is now in the brief itself and caught the LB-8 and U9 test-side problems before any commit.

## LAND-EVIDENCE
LAND-EVIDENCE: qa-offline=PASS 80; targeted=PASS; codex-classI-unresolved=0
