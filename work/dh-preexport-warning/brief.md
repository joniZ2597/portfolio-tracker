# Task brief: DH-M3 — pre-export readiness warning for the EOD packet

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Backlog | **Entry 7** · data-state presentation contract · ARC **DH** · Slice **M3** |
| Baseline | 05222473e3d30f25f2429ffca55ed580d710d14b = branch-dev (DH-M2b landed); the task branch starts at this brief's commit |
| Branch / slot | `task/dh-preexport-warning`, created from this brief's commit in whichever Worker slot is refreshed to current `branch-dev` |
| Mode | **Auto** (attended; see §10) |
| qa:offline | 50 → **51** (one new auto-discovered suite; `qa/run-offline.js` not edited) |
| Status | CODE-READY on Owner approval of this brief, incl. rulings M3-1 and M3-2 |

Objective. When the user clicks **EOD PACKET ↓**, warn **before any file is downloaded** if the
packet's existing DH-M1 readiness verdict is `not-representative`. Let the user cancel or export
anyway. The same packet object drives the warning and the export, so they can never disagree. There is
no new freshness model, threshold, data source, wording table or scoring change.

## 1. Current implementation (verified at `0522247`)

- **Export path.** The portfolio header button `EOD PACKET ↓` (`_renderPortfolioPanel`, `index.html:~9493`)
  calls `_eodExportPacket()` (`:3183`). It:
  - reads once (`_p5PreloadContext`, `_eodSnapshotPackets`, `_pfReconLoad`);
  - builds one packet with the pure `_eodBuildPacket` (`:2846`), which embeds
    `packet.readiness = _eodComputeReadiness(...)` (`:2727`);
  - projects Markdown and a briefing;
  - performs exactly three `_ptDownload` calls.
- **There is no confirmation today.** The top-bar `EXPORT ↓` (`exportJSON`) is a different export and
  is out of scope.
- **Readiness (DH-M1).**
  - The verdict is `current` / `degraded` / `not-representative`; each reason carries an `effect`.
  - `not-representative` comes only from:
    - `market-aged` / `market-unknown` / `market-missing`, when **no** holding's market is current;
    - `fx-stale-invalid` / `fx-missing`, with at least one USD holding;
    - `cash-missing-or-invalid`.
  - `degraded` comes from:
    - partial market staleness;
    - `fx-aged`;
    - `positions-needs-confirmation`;
    - `cash-old-user-maintained-state`;
    - `research-coverage`, present whenever any holding was not researched in this session.
- **Words.** `DH_DISPLAY` / `_dhLabel` (`:2680`) is the single word table. The Markdown `## Readiness`
  section already prints `- Verdict: …` and every `- Reason: …` from it.
- **Refresh.** `REFRESH ⟳` exists only when `PT_ENABLE_PORTFOLIO_LIVE_PRICES` or `PT_ENABLE_PORTFOLIO_FX`
  is `=== true`. Neither flag has a default assignment, so the button is absent by default (BACKLOG
  entry 22). Entry 20 also says live prices lack a server-side cost backstop.
  - Refresh cannot fix cash or research reasons.
  - A modal "Refresh first" action is therefore **not** safely available.
- **QA pins that touch this path:**
  - `qa/eod_packet_v0_offline.js` statically asserts that `_eodExportPacket` has exactly three
    `_ptDownload` calls, one `_eodPacketToBriefing` call, and byte-unchanged json/markdown download
    lines;
  - no suite executes `_eodExportPacket`;
  - `_eodExportPacket` is not in the caliper hash table;
  - `qa/dh_ui_vocabulary_offline.js` UV-5 pins `DH_DISPLAY`'s group set, which this task therefore
    does not change.

## 2. Rulings (approved with this brief)

- **M3-1 — trigger.** Warn only when `packet.readiness.verdict === 'not-representative'`. List only the
  reasons whose `effect === 'not-representative'`.
  - `degraded` exports proceed without a warning. The limitation is already disclosed in the
    packet's Readiness section, and `research-coverage` would otherwise fire on almost every export.
  - Consequence: `fx-aged`, which is always `degraded`, never triggers or appears in the warning. The
    separate R2 / FX-aged Owner ruling is neither applied nor pre-empted.
- **M3-2 — interaction.** Use the browser's native `window.confirm`, the existing pattern for Clear-cash
  (`:9715`) and Clear-reconciliation (`:9867`).
  - **OK = Export anyway:** download the already-built packet unchanged. Its Readiness section still
    says `Not representative`.
  - **Cancel:** no download, no state change. The user fixes the data and clicks again; every click
    recomputes.
  - There is no "Refresh first" button (see §1). There is no "don't warn again" and nothing is
    persisted.
- Carried in, not reopened: DH-M0b D1–D4; DH-M1 `DH_DISPLAY` / `_dhLabel` as the only word source;
  DH-M2 / DH-M2b sites unchanged.
- **Known follow-up, not touched.** The reason words come from `DH_DISPLAY.reason`, the same words as the
  exported Markdown. `fx-missing` therefore reads `FX rate: Not recorded`, as it does in the export
  today. Aligning export wording with R1/R2 is BACKLOG entry 7 item (a)/(b). When that lands, the
  warning inherits it automatically.

## 3. Implementation file set — exactly 3

```
index.html                                  §4 (one const, one pure helper, two lines in _eodExportPacket)
qa/eod_preexport_warning_offline.js         NEW — §6 (auto-discovered)
work/dh-preexport-warning/review.md         NEW — tracked task evidence
```

<!-- land-scope:begin -->
index.html
qa/eod_preexport_warning_offline.js
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/eod_preexport_warning_offline.js
node qa/eod_packet_v0_offline.js
node qa/dh_ui_vocabulary_offline.js
<!-- land-tests:end -->

**QA suites that read in-scope files as text:**
- `qa/eod_packet_v0_offline.js` (the export-wiring pins stay true, §5);
- `qa/dh_ui_vocabulary_offline.js` (`DH_DISPLAY` unchanged);
- `qa/vis_score_caliper_offline.js` (no pinned function touched);
- `qa/run-offline.js` (stubs only the panel name; unaffected).

## 4. Exact change (`index.html`, CRLF line endings preserved)

**(a)** Immediately after the closing `}` of `_eodReadinessLines` (before the
`// Pure aggregator.` comment above `_eodBuildPacket`), insert:

```js
// DH-M3 (M3-1/M3-2): pre-export warning copy. Explanatory prose only — every
// state/reason word still comes from DH_DISPLAY via _dhLabel.
var EOD_PREEXPORT_COPY = {
  heading: 'Export check — this EOD packet is ',
  marketUnknownNote: 'Prices cached before the readiness check was added carry no market session yet; they count as Current after their next price refresh.',
  footer: 'The export will include these limitations in its Readiness section.',
  choice: 'OK = export anyway · Cancel = go back without exporting.'
};

// Pure. Reads only its argument. Returns null unless the verdict is
// not-representative (M3-1); otherwise the confirm() text, listing only the
// reasons whose effect is not-representative, in packet order.
function _eodPreExportWarning(r) {
  if (!r || r.verdict !== 'not-representative' || !Array.isArray(r.reasons)) return null;
  var lines = [EOD_PREEXPORT_COPY.heading + _dhLabel('verdict', r.verdict) + '.', ''];
  var hasUnknown = false;
  r.reasons.forEach(function(x) {
    if (!x || x.effect !== 'not-representative') return;
    if (x.class === 'market-unknown') hasUnknown = true;
    lines.push('- ' + _dhLabel('reason', x.class) + (x.symbols ? ' — ' + x.symbols.join(', ') : ''));
  });
  if (hasUnknown) lines.push('', EOD_PREEXPORT_COPY.marketUnknownNote);
  lines.push('', EOD_PREEXPORT_COPY.footer, EOD_PREEXPORT_COPY.choice);
  return lines.join('\n');
}
```

**(b)** In `_eodExportPacket`, immediately after the line that assigns `var packet = _eodBuildPacket({ … });`
(before `var md = …`), insert exactly:

```js
  var preExportWarning = _eodPreExportWarning(packet.readiness);
  if (preExportWarning !== null && !window.confirm(preExportWarning)) return;
```

**Nothing else changes.** In particular:
- `_eodComputeReadiness`, `_eodBuildPacket`, `_eodPacketToMarkdown`, `_eodPacketToBriefing` and
  `_eodReadinessLines`;
- `DH_DISPLAY` and `_dhLabel`;
- the three `_ptDownload` lines and the button wiring;
- `exportJSON`, the refresh functions, styles, and any `pt_*` / `localStorage` access.

## 5. Behaviour (lifecycle walkthrough)

| Step | State | Result |
|---|---|---|
| 1 | User clicks `EOD PACKET ↓` | One read + one packet build, exactly as today |
| 2a | `verdict` = `current` or `degraded` | No dialog; three downloads, as today |
| 2b | `verdict` = `not-representative` | `confirm()` shows: the heading with `Not representative`; one `- <reason word> — <symbols>` line per not-representative reason; the market note only if `market-unknown` is among them; the footer; the choice line |
| 3a | OK | The same `packet` object is projected and downloaded (3 files). Its Readiness section shows the same verdict and reasons |
| 3b | Cancel | Return before any projection or download. No storage write, no state change |
| 4 | Re-click after fixing data (price refresh when enabled, recording cash, etc.) | Fully recomputed; the dialog appears only if still not-representative |

- **First export after DH-M1** (legacy cache entries → `market-unknown` on every holding →
  `not-representative`): the dialog includes the market note, which satisfies the DH-M1 `[backlog]`
  follow-up.
- **Portfolio with no holdings:** the verdict follows DH-M1 exactly. The helper adds no special case.

**Actor-to-evidence closure:**
- **User:** sees exactly the reason words and symbols the exported file will contain (the same
  `DH_DISPLAY`, the same `packet` object).
- **Exported file:** unchanged in content and shape.
- **Owner/QA:** each claim above is asserted in §6 against the real `index.html` source.

## 6. Targeted QA — `qa/eod_preexport_warning_offline.js` (new, pure Node, offline)

The suite extracts `DH_DISPLAY`, `_dhLabel`, `EOD_PREEXPORT_COPY` and `_eodPreExportWarning` from the real
`index.html` (CRLF-normalized) and evaluates them in a `vm` context. **No re-implementation.**

| ID | Assertion |
|---|---|
| PX-1 | `current` and `degraded` readiness (incl. `fx-aged`, `research-coverage`, `positions-needs-confirmation`, `cash-old-user-maintained-state`, partial market) → `null` |
| PX-2 | `not-representative` → a string whose first line is `Export check — this EOD packet is Not representative.` |
| PX-3 | Only `effect === 'not-representative'` reasons are listed, in packet order, each as `- ` + `_dhLabel('reason', class)` + ` — ` + symbols joined by `, ` when present. A `degraded` reason in the same readiness (e.g. `fx-aged`) is **absent** |
| PX-4 | The market note appears iff a listed reason is `market-unknown` |
| PX-5 | The footer and choice lines are present, last, and in order |
| PX-6 | Built from real `_eodComputeReadiness` outputs (extracted and run, with the DH-M1 suite's fixture shapes), not just hand-written objects: all markets missing → warns; cash missing → warns; FX missing with a USD holding → warns; FX missing with no USD → `null` (degraded) |
| PX-7 | **Purity:** the extracted `_eodPreExportWarning` source contains no `window`, `document`, `localStorage`, `fetch`, `Date`, `Math.random`, `confirm`; calling it twice gives identical output; its input is not mutated |
| PX-8 | **Wiring (static, `_eodExportPacket` source):**<br>- exactly one `_eodPreExportWarning(packet.readiness)` call;<br>- exactly one `window.confirm(`;<br>- both appear after `_eodBuildPacket(` and before the first `_eodPacketToMarkdown(` / `_ptDownload(`;<br>- the guard is exactly `if (preExportWarning !== null && !window.confirm(preExportWarning)) return;`;<br>- still three `_ptDownload` calls with byte-unchanged json/markdown lines |
| PX-9 | **Unchanged surfaces:**<br>- `_eodComputeReadiness`, `_eodBuildPacket`, `_eodReadinessLines`, `_eodPacketToMarkdown`, `_eodPacketToBriefing`, `_dhLabel` and the `DH_DISPLAY` literal are byte-equal (CR-normalized) to baseline `0522247`; the baseline sha256s are computed from `git show 0522247:index.html` at authoring time and hard-coded, with the values recorded in `review.md`;<br>- no new `pt_*` key or `localStorage` call in the changed functions;<br>- no reference to `_ptScore`, `orchestrate`, `analyzeChunk` or `enforceScoreConsistency` in the helper |

- Every assertion family has a planted negative (for example, a `degraded` reason leaking into the
  list, the confirm placed after a download, or the market note always shown), each caught.
- **QA lesson:** any check whose assertion calls something with real side effects computes its result
  once and asserts on the stored value.
- **Runs:**
  1. `node qa/eod_preexport_warning_offline.js`
  2. `node qa/eod_packet_v0_offline.js`
  3. `node qa/dh_ui_vocabulary_offline.js`
  4. full `npm run qa:offline` → **51**

## 7. Out of scope

- `exportJSON` / `EXPORT ↓`, `BACKUP ↓`, briefing content, packet schema.
- Any R1/R2 export-wording alignment (entry 7 (a)/(b)).
- Any refresh action or gate flag.
- Any custom modal component, "don't warn again", or persistence.
- `qa/run-offline.js`, `BACKLOG.md`, `AGENTS.md`, `CLAUDE.md`, `.claude/**`.

## 8. Worker flow and closure

- **Workflow:** AGENTS.md contract, attended Auto:
  1. Step 0 baseline (50) and the current-guard check;
  2. `plan.md` with the CLAUDE.md pre-flight checklist. Gate Verification: no gated execution path is
     added, and the existing refresh gates are untouched;
  3. tests first;
  4. implement §4;
  5. targeted QA;
  6. Worker-launched Codex read-only review;
  7. full `qa:offline`;
  8. `review.md` (pre-commit evidence only);
  9. Codex final check.
- **`review.md`:** ends with the line
  `LAND-EVIDENCE: qa-offline=PASS 51; targeted=PASS; codex-classI-unresolved=0`.
- **Step 13:**
  - stage `index.html`, `qa/eod_preexport_warning_offline.js` and `work/dh-preexport-warning/review.md`
    with explicit paths in one call;
  - `git commit -m "feat(eod): warn before exporting a not-representative packet (DH-M3)"` in a separate
    call (r9 gate).
- **Then** run
  `node qa/guard_integrity_check.js --base-main fbec2c193346d7afd1dab6fd11a46b5efe55238b --base-dev <this brief's full commit OID> --task task/dh-preexport-warning --since <task-start ISO> --root <canonical checkout>`.
  - Its result is **LAND evidence**, reported in the STOP report only. It is never written into
    `review.md`: no amend, no second commit (Owner ruling 2026-09-29).
- **STOP** and request LAND. LAND and push follow the rules in force at that time (today: the Owner).

## 9. STOP conditions

- **STOP-1..5** per AGENTS.md, including any file outside §3 or any change beyond §4.
- **STOP-6:**
  - any hook denial, safety-classifier block, or integrity-check FAIL;
  - any Manual fallback trigger;
  - the Owner becoming unavailable.

  Never retry in another form.
- Any change to a readiness function, `DH_DISPLAY`, `_dhLabel`, the projectors, the `_ptDownload` lines,
  any threshold or freshness owner, scoring, persistence or `pt_*`.
- Any warning trigger other than `verdict === 'not-representative'`, or any `degraded` reason
  (including `fx-aged`) shown in the dialog.
- Any added refresh or other action, any persistence, or any change to `exportJSON`.
- `qa:offline` not 51, or any existing suite failing (diagnose under M4 first).
- Any push, merge, rebase, LAND, deploy, environment or `main` action by the Worker.

## 10. Why Mode: Auto (AGENTS.md eligibility)

- Approved committed brief with explicit files and STOP conditions.
- Bounded UI behaviour in an ORDINARY-tier file.
- Offline QA only.
- No schema, persistence, architecture, contract, scoring or ranking change. It reuses the ratified
  readiness contract read-only.
- No ASK/DENY file.
- No environment, runtime or deploy work.
- All product decisions ruled here (M3-1, M3-2).
- Own slot under the current guard.
- **Attended only.**

## 11. Definition of Done

- §4 applied exactly.
- PX-1…PX-9 and their negatives PASS; `eod_packet_v0` and `dh_ui_vocabulary` PASS unchanged; full
  `qa:offline` PASS **51**.
- Codex: no unresolved Class I finding.
- One gated task-branch commit with exactly the §3 files.
- Post-commit integrity PASS, reported in the STOP report (not in `review.md`).
