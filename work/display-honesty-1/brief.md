# Task brief: display-honesty-1 — correct header change amount (PA-03) and real "Updated" time in the Actionable Take (PA-12)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL, HELD** (COWORK, 2026-10-14). Swept at `branch-dev` = `origin/branch-dev` = `c95cde5`. Next Worker A task: **CB-3 part 1** (correction backlog). Placed only on the Owner's R11 approval of this exact hash, after independent Codex review.

| | |
|---|---|
| Problem | **PA-03 (Medium, verified on DEV):** the header change amount is computed as `price × %` (`Math.abs(chg * _displayPriceBase/100 / _pxDiv)`). For FROG it shows ▼4.50 where the true move is 4.71; seen on 7 tickers. **PA-12 (Medium):** the Actionable Take's "Updated:" line renders `new Date()` (the render time), so 2-month-old results look fresh |
| Objective | <ul><li>**PA-03:** the header change amount = `price − price / (1 + chg/100)`, with the same `_pxDiv` (TASE agorot → ₪) conversion. If `1 + chg/100 ≤ 0`, show `—`.</li><li>**PA-12:** the Actionable Take shows `Updated: <the result's own time>`, using the `lastUpdated` value `renderMainPanel` already derives from `_timestamp` / `_orchestratedAt`; `—` when absent.</li></ul> Nothing else changes |
| Source | Correction backlog CB-3 (`_held-briefs/correction-batches/CORRECTION-BACKLOG.md` ranks 8, 10); `FINDINGS-REGISTER.md` PA-03, PA-12. **PA-16 (↻ refresh price mixing) is deferred to CB-3 part 2**: it changes refresh state, not just display |
| Backlog | **none** (audit correction batch, not a BACKLOG entry). No `BACKLOG.md` edit |
| Baseline / start (§TS) | Starts **after `surface-2` has LANDed, been pushed and cleaned up** (same file `index.html` and pin map). At the task-start tip T, Bootstrap checks: <ol><li>both §2 anchors occur exactly once in `index.html`, inside `renderMainPanel`;</li><li>`qa/labs_panel_offline.js` `BASE_PINS.renderMainPanel` equals the current pin-map digest of `renderMainPanel` (at `c95cde5`: `9ae8e8b04e0d21fd6f39c922397736521291904b8ce3f21b296ac881b2971493`);</li><li>`qa/tase_units_offline.js` holds the three TU-3 / NEG-5 strings of §4 exactly once.</li></ol> Any failure → STOP, return to COWORK (re-sweep, no redesign) |
| Branch / slot | `task/display-honesty-1`, **Worker A** |
| Mode | **Manual** (`index.html`) |
| qa:offline | step-0 count **+1** (`qa/display_honesty_offline.js`) |
| Parallel with | `tase-session-overlay-1` (Worker B): **no shared file**. One heavy run at a time (AGENTS process check before each heavy run) |

## §1 Files (exactly)

- `index.html` — **only** the two §2 expressions inside `renderMainPanel`
- `qa/fixtures/index-pins.json` — regenerated with `node qa/tools/index-pins.js --update` (never hand-edited)
- `qa/display_honesty_offline.js` (new)
- `qa/labs_panel_offline.js` — **only** the `BASE_PINS.renderMainPanel` value and its trailing comment (§4)
- `qa/tase_units_offline.js` — **only** the TU-3 row label, the TU-3 US expectation and the NEG-5 anchor pair (§4)
- `work/display-honesty-1/review.md`

**Forbidden:**
- every other function of `index.html`, and any new top-level function referenced by `renderMainPanel` (PC-3);
- `qa/fixtures/index-pins-frozen.json` (frozen revert chains);
- `netlify/**`, `qa/run-offline.js`, `package*.json`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `BACKLOG.md`.

## §2 Exact change (anchors at `c95cde5`, `renderMainPanel` :8247…)

| # | From (exactly once) | To |
|---|---|---|
| E-1 (PA-03, :8687) | `Math.abs(chg * _displayPriceBase/100 / _pxDiv).toFixed(2)` | `((1 + chg/100) > 0 ? Math.abs((_displayPriceBase - _displayPriceBase / (1 + chg/100)) / _pxDiv).toFixed(2) : '—')` |
| E-2 (PA-12, :8827) | `Updated: ${new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}` | `Updated: ${lastUpdated \|\| '—'}` |

`lastUpdated` is declared at :8448 in the same function (today's results: time only; older: "Mon D · time"; unparseable: "timestamp unclear").

## §3 QA — new suite `qa/display_honesty_offline.js`

Extract `renderMainPanel` the way `qa/tase_units_offline.js` does, and render a fixture item.

| Row | Assertion |
|---|---|
| DH-1 | FROG fixture (price 97.52, −4.61 %) → header change `▼4.71 (-4.61%)`, not `▼4.50` |
| DH-2 | `.TA` fixture in agorot (8884, +0.95 %) → `▲0.84`; US (226.73, +0.95 %) → `▲2.13` |
| DH-3 | `chg = -100` → `—` (no `Infinity` / `NaN`); `chg = null` → the existing `—` |
| DH-4 | `_timestamp` 60 days old → the Actionable Take line reads `Updated: <Mon D · time>` of that timestamp, never today's time |
| DH-5 | `_timestamp` today → `Updated: <time>` equal to the header's `updated <time>`; no timestamp → `Updated: —` |
| DH-N1…N3 | planted negatives on a mutated copy (each anchor exactly once), each must fail: <ul><li>E-1 reverted → DH-1;</li><li>guard removed → DH-3;</li><li>E-2 reverted → DH-4</li></ul> |

## §4 Expected RED (resolved inside the task; verified in COWORK's sandbox)

| Suite | Row | Change |
|---|---|---|
| `qa/tase_units_offline.js` | TU-3 | <ul><li>label → `change amount: price - price/(1+chg%) ÷100 for .TA (83.60 agorot → 0.84); US 2.13 (PA-03 fixed by display-honesty-1)`;</li><li>US expectation `▲2.15 (+0.95%)` → `▲2.13 (+0.95%)` (`.TA` stays `▲0.84`);</li><li>NEG-5 anchor pair → `'Math.abs((_displayPriceBase - _displayPriceBase / (1 + chg/100)) / _pxDiv).toFixed(2)'` / `'Math.abs(_displayPriceBase - _displayPriceBase / (1 + chg/100)).toFixed(2)'`.</li></ul> All other rows and negatives are unchanged; NEG-5 must still bite |
| `qa/labs_panel_offline.js` | LB-8 | `BASE_PINS.renderMainPanel` → the new pin-map digest, comment `// display-honesty-1 (was 9ae8e8b04e0d… tase-units-1)` (the tase-units-1 precedent). Everything else is unchanged |
| pin map | `index-pins --check` | regenerate with `--update` and review with `--diff <base>`: only `renderMainPanel` and the file digest change |

## §5 Steps

| Step | Action |
|---|---|
| 0 | §TS; process check → step-0 `qa:offline`; `plan.md` |
| S1 RED | write `qa/display_honesty_offline.js`; DH-1, DH-2 (US), DH-3 and DH-4 fail on the current source; record |
| S2 GREEN | E-1, E-2; `index-pins --update`; the §4 test deltas; all DH rows + negatives pass; the 15 `renderMainPanel` suites pass (list in evidence) |
| 8 | Codex round one |
| 10 | process check → full `qa:offline` PASS at step 0 + 1 |
| 11–13 | `review.md` (L9 line), final Codex, step-13 commit, integrity |
| LAND / PUSH | usual R12; Second-LAND resync if Worker B lands first (no shared file) |

**STOP only for:**
- a change outside §1 / §2;
- a §4 delta beyond the listed lines;
- a denied protected action or an integrity FAIL.

Ordinary in-scope problems are the Worker's.

## §6 Definition of Done

1. DH-1…DH-5 and DH-N1…N3 pass.
2. TU-3 and NEG-5 pass with the §4 delta.
3. LB-8 passes after the re-pin.
4. `index-pins --check` OK.
5. Step 10 PASS at step 0 + 1.
6. Codex: no unresolved Class I.

## §CMD Command card (one command per Bash call; Bash tool only)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
node qa/guard_integrity_check.js --task task/display-honesty-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/display_honesty_offline.js
node qa/tase_units_offline.js
node qa/labs_panel_offline.js
node qa/tools/index-pins.js --check
node qa/tools/index-pins.js --update
node qa/index_pins_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/display-honesty-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/display-honesty-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (prompts):** `git add <explicit §1 paths>`; one read-only process listing before each heavy run; `node qa/tools/index-pins.js --diff <base>`; `codex exec --sandbox read-only <prompt>`.
- **C (Owner):** R11; LAND; PUSH.

<!-- land-scope:begin -->
index.html
qa/fixtures/index-pins.json
qa/display_honesty_offline.js
qa/labs_panel_offline.js
qa/tase_units_offline.js
work/display-honesty-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/display_honesty_offline.js
node qa/tase_units_offline.js
node qa/labs_panel_offline.js
node qa/index_pins_offline.js
<!-- land-tests:end -->
