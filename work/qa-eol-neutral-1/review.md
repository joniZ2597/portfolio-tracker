# review.md — qa-eol-neutral-1 (make `eod_packet_v0` line-ending neutral, EOL-2)

Worker B, `task/qa-eol-neutral-1`, Manual, attended. Base `14d6c94`; brief commit `b216162`; S1 checkpoint `199ca8e`.

## Result

`qa/eod_packet_v0_offline.js` now reads `index.html` once through `loadIndexText(raw) = IDX_CORE.normalizeText(raw)`. The three mutation anchors (`AC16_MARKER`, `AC10_BLOCK_MARKER`, `FL1_RAW_AFTER_SRC`) and the AC16 inserted line use `\n`. An EOL-row runs the loader on an LF and a CRLF in-memory copy of the real `index.html`. Suite: 196 → 200 asserts, all 196 existing assertion names and conditions unchanged.

## §0 refresh as observed on this slot's own checkout form

Slot checkout form: **CRLF** (`git ls-files --eol`: `i/lf w/crlf`), node v24.14.0. Step-0 baseline `qa:offline` PASS 85 suites. The suite passed on this CRLF tree before the change (196 asserts); the LF failure of the original defect is the brief's §0 finding and was not reproduced on this slot (the slot is CRLF). LF behaviour after the fix is proven in memory by the EOL-row (EOL-1a/EOL-1b run the loader on an LF copy of the real file); no checkout or `core.autocrlf` change was made.

## RED and GREEN

- **RED (CRLF form, S1 diff):** `node qa/eod_packet_v0_offline.js` exit 1 with exactly EOL-1a and EOL-1b FAIL, `FAIL (2 of 200 asserts failed)`.
- **GREEN (S2):** `EOD PACKET V0: PASS (200 asserts)`; control `node qa/eod_preexport_warning_offline.js` → `PASS (58/58)`.

## EOL-row and planted negatives

- EOL-1a: `eolRow(loadIndexText, AC16_MARKER).same` — loader output identical for LF and CRLF copies.
- EOL-1b: `eolRow(loadIndexText, AC16_MARKER).anchors` — `AC16_MARKER` and `FL1_RAW_AFTER_SRC` occur once in `_eodBuildPacket`, `AC10_BLOCK_MARKER` once in `_eodPacketToMarkdown`, on both copies.
- PN-EOL-1: identity loader → `same === false` (caught by EOL-1a's condition). Bites.
- PN-EOL-2: CRLF-literal anchor `'  var holdings = preload.holdings;\r\n'` → `anchors === false` (caught by EOL-1b's condition). Bites.
- Existing AC16 / AC10 / RD-FL1 planted negatives still run and pass with the `\n` anchors.

## Files changed
- Implementation (1): qa/eod_packet_v0_offline.js
- Evidence (tracked): work/qa-eol-neutral-1/brief.md, work/qa-eol-neutral-1/review.md

(The brief's allowed set is the suite plus this review.md.)

## Incident record (STOP-6, Owner-ruled recovery)

During step 8, two Bash commands were denied and never executed: a `cp` copying the Codex transcript into `codex.md` (source path outside the slot) and an `rm` of the temporary `codex-s1.txt`. Owner rulings, verbatim in substance: (1) keep only the verbatim final Codex message in `codex.md` under "## Step 8 (S1)" and note that the raw transcript was not copied; (2) authorize exactly one `rm work/qa-eol-neutral-1/codex-s1.txt`. Both applied; the deletion ran once and succeeded. `codex.md` therefore holds the S1 final message only, not the full raw transcript.

## Codex ledger

- Step 8 (S1 diff): PASS, no findings (see `codex.md`, "## Step 8 (S1)").
- Step 12 (final check on the task diff, including this review.md): PASS, no findings (see `codex.md`, "## Final check"). 0 Class I, 0 Class II; FIX 0, DEFER 0, REJECT 0.

Final check: 1 rounds, 0 class-II findings fixed, self-checked; no implementation change, no QA re-run.

LAND-EVIDENCE: qa-offline=PASS 85; targeted=PASS; codex-classI-unresolved=0

## Backlog reconciliation

Brief's Backlog row: none. Action taken: none. No `BACKLOG.md` edit; no entry heading changed. The BACKLOG text is unchanged and consistent with the diff and QA results.

## Timing

- Step 0: 2026-10-13T14:21:02Z → 14:22:38Z (85685 ms), PASS 85 suites.
- Step 10: 2026-10-13T14:28:51Z → 14:30:24Z (87497 ms), PASS 85 suites.

## Lessons

- [local] The Codex `-o` file captures only the final message; the full transcript is only in stdout, so redirect stdout inside the slot if the whole transcript is wanted.
- [local] A monitor keyed on a per-suite `PASS` line fires early; key on the final `OFFLINE VALIDATION:` line.
