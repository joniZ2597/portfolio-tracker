# Review — DH-M4c: route the `_eodBuildPacket` FX limitation line through `DH_DISPLAY` (G-1)

Brief: `work/dh-fx-limitation-wording/brief.md`, baseline `02788b5` (brief-only commit) =
`dfde9fb` + the brief itself (`branch-dev` = `origin/branch-dev` at Step 0). Mode: `acceptEdits`
for §8.1-§8.5, Manual for commit/LAND/push (unchanged from this point — no commit made yet).

## Summary

Applied E1 exactly: `_eodBuildPacket`'s third `fx`-limitation branch (`index.html:3035-3037`) now
composes its trailing state word from `DH_DISPLAY` via `_dhLabel('state', reporting.fxState)`,
with a bracketed `[aged-but-valid]` disambiguator mirroring `_eodReadinessLines`' existing FX
line, instead of concatenating the raw internal `fxState` code. The `missing`/`stale-invalid`
branches (DH-M4a) are byte-unchanged. No `DH_DISPLAY` key or value was edited.

G-1 (census `work/dh-entry7-closure-census/census.md` §3) is closed: `reporting.fxState`'s raw
code no longer appears, untranslated, in the export/briefing/JSON `fx` limitation text.

## Files changed

- Implementation (4): index.html, qa/dh_ui_vocabulary_offline.js, qa/eod_packet_v0_offline.js, qa/eod_preexport_warning_offline.js
- Evidence (tracked): work/dh-fx-limitation-wording/brief.md, work/dh-fx-limitation-wording/review.md

## Step 0

- Current-guard check: PASS (`task/dh-fx-limitation-wording` descends from `branch-dev`;
  `git status --porcelain .claude` empty).
- Baseline `npm run qa:offline`: **PASS, 53 spawned suites**, 1 pre-existing advisory warning
  (unrelated to this task).

## QA

- `node qa/dh_ui_vocabulary_offline.js` — PASS (64 assertions: 60 baseline + FL-1/FL-2 + 2
  controls; the retired FW-4 aged/fresh-branch byte-equality sub-check removed, its other two
  assertions — the `missing`/`stale-invalid` literals and the merged-branch absence check —
  unchanged and passing).
- `node qa/eod_packet_v0_offline.js` — PASS (196 asserts: 191 baseline + RD-AC14 fixture text
  update (`fresh.`→`Current.`) + RD-FL1's 2 core checks + 2 unaffected-state controls + 1 planted
  negative = 5 new).
- `node qa/eod_preexport_warning_offline.js` — PASS (58/58), including the PX-9 re-pin of
  `_eodBuildPacket` only.
- Full `npm run qa:offline` (post-implementation): **PASS, 53 spawned suites** — unchanged from
  the Step-0 baseline, 1 pre-existing advisory warning, same as baseline.

## RD-AC14 fixture pre-check (brief §6/§9 STOP gate)

Verified before editing: the RD-AC14 control fixture's FX cache is `fxSeed(1 * DAY)` (rate 3.0,
age 1 day), and `PF_FX_FRESH_MAX_AGE_DAYS = 3` — so its `fxState` is `fresh`, matching the brief's
assumption. No STOP condition triggered.

## Hash re-pin (PX-9, `qa/eod_preexport_warning_offline.js`)

| Function | Old sha256 | New sha256 |
|---|---|---|
| `_eodBuildPacket` | `38c399f34bdd2c98be59bef832be2b9d842705d8d09700bb908932ad4b424401` | `7624e7139a698516fad5a76f3b258179480be92044a195d2a1e3d0c34bd272a0` |

The other six PX-9 pins (`_eodComputeReadiness`, `_eodReadinessLines`, `_eodPacketToMarkdown`,
`_eodPacketToBriefing`, `_dhLabel`, `DH_DISPLAY`) are byte-identical and pass unchanged —
`DH_DISPLAY` is not edited by this task, unlike every prior DH-M4* re-pin which touched two hashes.

## FW-4 retirement (`qa/dh_ui_vocabulary_offline.js`)

Per brief §6: FW-4's sub-check and control that pinned the aged/fresh branch
(`FW4_AGED_FRESH_BRANCH`) as byte-equal to the DH-M4a baseline are removed — that text is no
longer byte-equal by design (E1). FL-1/FL-2 (new, DH-M4c section) supersede it for that branch.
FW-4's other two assertions — the three-branch `FW4_BLOCK` opening (missing/stale-invalid
literals + the third branch's opening line, unchanged) and the old-merged-literal absence check —
are unchanged and still pass, along with their control.

## Codex review (implementation diff, base `02788b5`)

Launched via `codex exec --sandbox read-only` against the real implementation diff (`git diff
branch-dev -- index.html qa/dh_ui_vocabulary_offline.js qa/eod_packet_v0_offline.js
qa/eod_preexport_warning_offline.js`) plus the full brief text. **No Class I findings.**

Codex's findings, verbatim:
> ## Class I — correctness and scope
>
> None found.
>
> ## Class II — minor/test quality
>
> **FL-1's table-edit control is narrower than its description.** It changes
> `DH_DISPLAY.state['fresh']` and verifies `_dhLabel('state', 'fresh')` returns `Recent`; it does
> not verify the full limitation text changes. FL-1 also simulates the composition using
> `_dhLabel` rather than executing `_eodBuildPacket`. However, RD-FL1 exercises real
> `_eodBuildPacket` output for fresh and aged FX states, and its planted negative patches that
> production function, so the end-to-end behavior is covered.
>
> ## Checks against the brief
>
> - E1 matches §4's replacement text, including the line break and expression.
> - The `missing` and `stale-invalid` branches are unchanged in the diff.
> - No `DH_DISPLAY` key or value is edited.
> - The diff touches exactly the four land-scope files.
> - PX-9 changes only the `_eodBuildPacket` hash; the other six pins are unchanged.
> - FL-1/FL-2 and RD-FL1 use the specified assertions and planted negatives. RD-FL1 checks
>   production packet output for fresh and aged states, plus missing/stale-invalid controls.
> - FW-4 retires only the aged/fresh byte-equality sub-check; the `FW4_BLOCK` check and its
>   control remain.
> - No readiness, schema, scoring, persistence, or listed out-of-scope site appears in the diff.

## FIX / DEFER / REJECT ledger

| # | Finding | Class | Resolution |
|---|---|---|---|
| 1 | FL-1's own control proves the `DH_DISPLAY` dependency (a table edit changes `_dhLabel`'s output) via `_dhLabel` directly, not by re-running `_eodBuildPacket` | II | **REJECT** — not a gap in coverage: RD-FL1 (in `qa/eod_packet_v0_offline.js`) independently proves the real, end-to-end `_eodBuildPacket` output for both reachable states (fresh, aged-but-valid) with its own planted negative patching the production function directly, exactly as the brief's §5 "Actor-to-evidence closure" specified (composition proof via FL-1, real-output proof via RD-FL1 — two different, complementary mechanisms by design, not a redundant pair). Codex's own note confirms "the end-to-end behavior is covered." No test change made. |

## A CRLF line-ending note (implementation detail, no scope change)

`qa/eod_packet_v0_offline.js` reads `index.html` raw (no CRLF normalization, unlike
`qa/dh_ui_vocabulary_offline.js`, which normalizes to `\n`). The first draft of `RD-FL1`'s
planted-negative anchor (`FL1_RAW_AFTER`) used a literal `\n` for the embedded line break inside
E1's multi-line `addLimitation` call, which does not match the file's actual `\r\n`; this was
caught immediately (the anchor-missing throw fired both before and briefly after E1 was applied,
pinpointing the constant, not the production edit, as the mismatch) and fixed by using `\r\n` in
that one constant. No production text was affected; `index.html`'s CRLF convention was preserved
throughout by the editing tool, as required.

## Final check

Final check: 1 round, 1 Class II finding REJECTed with reason (no change made), self-checked; no
implementation change beyond E1 itself, no further QA re-run needed beyond what is reported above.

## Lessons

- [local] `qa/eod_packet_v0_offline.js` reads `index.html` raw (CRLF preserved);
  `qa/dh_ui_vocabulary_offline.js` normalizes to LF. A planted-negative string constant spanning a
  multi-line production literal must match whichever convention the specific suite file uses —
  true only of this file pair's existing extraction styles, no destination.

## LAND-EVIDENCE

LAND-EVIDENCE: qa-offline=PASS 53; targeted=PASS; codex-classI-unresolved=0

---

**STOP before Step 13 per Owner instruction.** No commit has been made. `git status` shows exactly
the four land-scope files modified, plus this task's untracked `plan.md` (gitignored) and the
pre-existing, unrelated untracked `work/dh-entry7-closure-census/` directory.
