# Review — DH-M4a FX export wording

## Summary

Applied the ruled FX missing/stale display words (R1, D2, D-3) to the two export-fed compute
functions and `DH_DISPLAY.reason['fx-missing']`, per brief §3 (E1–E4). Wording only — no
condition, id, severity, threshold, owner, schema, or scoring change.

## Files changed

- Implementation (3): index.html, qa/dh_ui_vocabulary_offline.js, qa/eod_preexport_warning_offline.js
- Evidence (tracked): work/dh-fx-export-wording/brief.md, work/dh-fx-export-wording/review.md

## QA

- `node qa/dh_ui_vocabulary_offline.js` — PASS (49 assertions), including new FW-1…FW-7 (with
  planted negatives) and updated UV-4/UV-5/UV-6.
- `node qa/eod_preexport_warning_offline.js` — PASS (58/58), including PX-9 re-pin.
- `node qa/eod_packet_v0_offline.js` — PASS (187 asserts), unchanged.
- Full `npm run qa:offline` — PASS, 51 suites (baseline 51 → 51), 1 pre-existing advisory
  warning unrelated to this task.

## Hash re-pins (UV-6, `qa/dh_ui_vocabulary_offline.js`)

| Function | Old sha256 | New sha256 |
|---|---|---|
| `_pfComputeNeedsAttention` | `2c33d414b7f04beb46f38cc1ccf510a73ee623345b8c8e603504ad05a4bd0320` | `f42b25e470602b4b3d0456e7b49ad0fb1d4f44c24a76931495e65319de274545` |
| `_pfComputePortfolioReporting` | `5005bc1c95b00412a285f411208aff485238f101d5a7ce412d698b76b4ea3afb` | `2b62766507c2d90455e484882ae6cef40da387b724e1ca42081f9590d60e041b` |

## Hash re-pins (PX-9, `qa/eod_preexport_warning_offline.js`)

| Symbol | Old sha256 | New sha256 |
|---|---|---|
| `_eodBuildPacket` | `aa8a41a6149a228daa0d2a113f2b8f32964095e18eb7687d00770b51b5f35f73` | `38c399f34bdd2c98be59bef832be2b9d842705d8d09700bb908932ad4b424401` |
| `DH_DISPLAY` | `764b9d30766d45ecc685fe94e328baf88cbf193b75e5eb634b03503fb3fa2938` | `95729ebb75cf1cb145824f95d7c0626e7f18f0e5456eb671052c29f5b7d881d5` |

The other five PX-9 pins (`_eodComputeReadiness`, `_eodReadinessLines`, `_eodPacketToMarkdown`,
`_eodPacketToBriefing`, `_dhLabel`) are byte-identical and pass unchanged. UV-4's out-of-scope
literal list dropped `'FX rate unavailable'` and `'USD holdings excluded — FX unavailable'`
(now superseded, no longer present anywhere) and its removed-literal control was retargeted to
`'FX as of '` (still an OOS entry, R2/DH-M4b). UV-5's expected `reason['fx-missing']` was
updated to the new ruled wording; every other expected value is unchanged.

## Codex review (implementation diff, base `1640cdb`)

Launched via `codex exec --sandbox read-only`. **No Class I findings.**

Codex's findings, verbatim:
> No Class I findings found.
>
> - E1–E4 match the brief's specified wording and branch split. The FX conditions, attention
>   item id and severity, and surrounding detail logic remain unchanged in the diff.
> - E2 and E3 use plain string literals; neither function references `DH_DISPLAY` or `_dhLabel`.
> - The aged/fresh `else if (preload.fxCache.rate)` branch is unchanged.
> - PX-9 changes only the `_eodBuildPacket` and `DH_DISPLAY` hash entries; the other five
>   entries are unchanged.
> - The supplied diff touches only `index.html` and the two named QA files.

## FIX / DEFER / REJECT ledger

None — no findings raised.

## Final check

The final lightweight Codex check ran once against the complete task diff (implementation diff +
this file's contents) and found no Class I findings. It found one Class II finding (this
section's summary line carried a confusing parenthetical) and no other issues; it is fixed here,
self-checked, no implementation change, no QA re-run.

Final check: 1 rounds, 1 class-II findings fixed, self-checked; no implementation change, no QA
re-run.

## Lessons

- [local] The `_pfComputePortfolioReporting` completeness-reason lines carry fixed inline
  alignment padding between the condition and `.push(` — preserved exactly to avoid unrelated
  whitespace churn; true only of this file's existing style, no destination.

## LAND-EVIDENCE

LAND-EVIDENCE: qa-offline=PASS 51; targeted=PASS; codex-classI-unresolved=0
