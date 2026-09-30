# Review — DH-M4b aged-but-valid FX is Current

## Summary

Applied the ruled aged-but-valid FX treatment (R2, D-1, D-2) per brief §4 (E1–E5): the FX chip and
Portfolio Total qualifier now show `Current · N d old` instead of `(aged)`, and EOD readiness no
longer lowers the verdict for aged-but-valid FX. `_pfFxState`, `_pfFxRateValid`, `PF_FX_*`,
totals/P/L/weights, the daily-move estimate, and `reason['fx-aged']` are all unchanged.

This task ran in **Manual** mode: E5 touches the ratified DH-M1 readiness contract (an M5
surface per AGENTS.md), so each edit was applied one at a time and re-verified against the
brief's exact text before moving to the next (see `plan.md`).

## Files changed

- Implementation (4): index.html, qa/dh_ui_vocabulary_offline.js, qa/eod_packet_v0_offline.js, qa/eod_preexport_warning_offline.js
- Evidence (tracked): work/dh-fx-aged-current/brief.md, work/dh-fx-aged-current/review.md

## QA

- `node qa/dh_ui_vocabulary_offline.js` — PASS (59 assertions), including new AG-1…AG-6 (with
  planted negatives), UV-4 retired, UV-5 updated.
- `node qa/eod_packet_v0_offline.js` — PASS (191 asserts: 187 baseline + RD-AC3 updated +
  RD-AG1/RD-AG2 new + one planted negative).
- `node qa/eod_preexport_warning_offline.js` — PASS (58/58), including PX-9 re-pin.
- `node qa/run-offline.js` (unmodified) — PASS.
- Full `npm run qa:offline` — PASS, 51 suites (baseline 51 → 51; R12 had not landed at this
  task's tip), 1 pre-existing advisory warning unrelated to this task.

## Hash re-pins

**UV-6 (`qa/dh_ui_vocabulary_offline.js`):** none required — `_pfFxState` is unchanged (a new
function was inserted after it, but brace-matched extraction is unaffected); `CONST_HASH` is
unchanged (no `PF_*`/`STALE_RESULT_THRESHOLD_MS` declaration was touched). Verified directly by
AG-6's assertion against the existing UV-6 `FN_HASHES`/`CONST_HASH`.

**AG-6 baseline hashes** (functions the task proves byte-unchanged, `qa/dh_ui_vocabulary_offline.js`):

| Function | sha256 (unchanged) |
|---|---|
| `_pfFxState` | `e59989a2b68b42bbca26f52e282867edf808d973431368ebc5229feeedbfe0fc` |
| `_pfFxRateValid` | `b444b89c17e2f6e87810f117d02903f8e03878a9b3c38fb6780e5ccda0f52678` |
| `_dhLabel` | `900eb54bd0ac78d8a55067b02acc17d874ff1b15c3e01005f7c95dc389fd5683` |

**PX-9 (`qa/eod_preexport_warning_offline.js`):**

| Symbol | Old sha256 | New sha256 |
|---|---|---|
| `_eodComputeReadiness` | `085de316864f9b16f620d7fc1eef6bac31b6aa9caa73d32f5457b08b7d47aa2c` | `75dd711f2911d0a5a01bf1c08b7f1c341c828ee7ab9ac258fa25d72a876772ba` |
| `DH_DISPLAY` | `95729ebb75cf1cb145824f95d7c0626e7f18f0e5456eb671052c29f5b7d881d5` | `ba21a81181496edc20500d1a9cb02bc1a8fa617f07a4798a4332d297c1dc7dc0` |

The other five PX-9 pins (`_eodBuildPacket`, `_eodReadinessLines`, `_eodPacketToMarkdown`,
`_eodPacketToBriefing`, `_dhLabel`) are byte-identical and pass unchanged.

## UV-4 retirement / UV-5 update

UV-4's out-of-scope literal table (`fxLabel + ' (aged)'`, `'FX as of '`) is retired per brief §6:
both literals moved in-scope this task. AG-5 supersedes its coverage (exact after-text once at
each site, `' (aged)'` absent file-wide, condition/colour lines unchanged). UV-5's expected
`BASE_DISPLAY.state['aged-but-valid']` was updated to `'Current'`; every other expected value is
unchanged. This also updates FW-1 (DH-M4a), which reuses the same `displayFailures` helper.

## Test-authoring adjustment

The existing U1 site check (`qa/dh_ui_vocabulary_offline.js`) used the old aged-branch chip
literal as a positional anchor to locate the stale-invalid branch's assertion site. Since E4
changed that literal, the anchor was updated to the new aged-branch line text (mechanical
consequence of E4; the U1 assertion itself — testing the stale-invalid branch — is unchanged).

## Codex review (implementation diff, base `a30ed21`)

Launched via `codex exec --sandbox read-only`. **No Class I findings.**

Codex's findings, verbatim:
> No Class I findings.
>
> The supplied diff is limited to `index.html` and the three named QA files. It leaves
> `qa/run-offline.js` untouched. The display table changes only `state['aged-but-valid']` to
> `Current`; `reason['fx-aged']` remains `FX rate: Stale`. The age helper uses `effectiveAt` and
> `Math.floor`, and the readiness edit removes only the aged-but-valid lowering branch. The PX-9
> re-pins change only `_eodComputeReadiness` and `DH_DISPLAY`; the other five hashes are
> unchanged.

## FIX / DEFER / REJECT ledger

None — no findings raised.

## Final check

Final check: 1 rounds, 0 class-II findings fixed, self-checked; no implementation change, no QA
re-run.

## Lessons

- [local] `_pfFxAgeWholeDays` and its QA harness (`loadFxAged`) both needed `_pfIsFiniteNum` in
  scope, since `_pfFxRateValid` calls it — true only of this file's dependency shape, no
  destination.

## LAND-EVIDENCE

LAND-EVIDENCE: qa-offline=PASS 51; targeted=PASS; codex-classI-unresolved=0
