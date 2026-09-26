# Review — DH-M2 UI state vocabulary (Night Shift pilot)

Base `0e586b1` (= `branch-dev` = `origin/branch-dev`, brief-only commit) · branch `task/dh-ui-vocabulary` · not committed, not staged.

## Before / after

All eight sites changed only in the string assigned; conditions, styles, classes, titles and DOM are untouched.

| # | Surface | Internal state | Before | After |
|---|---|---|---|---|
| U1 | FX chip | `stale-invalid` | `… — stale, not used in totals` | `… — Stale, not used in totals` (`_dhLabel('state','stale-invalid')`) |
| U2 | Recon chip | `unset` | `Broker total — (not recorded)` | `Broker total — Not recorded` |
| U3 | Recon chip | `invalid` | `Broker total — (data invalid)` | `Broker total — Unavailable (invalid record)` |
| U4 | Recon chip | `stale` | `Comparison may be stale` | `Broker total — Stale` |
| U5 | Recon chip | `total-incomplete` | `Reconciliation unavailable` | `Reconciliation — Unavailable (totals incomplete)` |
| U6 | Position P/L line | `!pl3.fxUsable` | `Unrealized P/L (ILS) — FX unavailable` | `Unrealized P/L (ILS) — Unavailable (FX rate not usable)` (`DH_DISPLAY.surface['pl-fx-not-usable']`) |
| U7 | Research badge | `res._aiUnavailable === true` | `AI unavailable` | `Unavailable (AI analysis)` (`DH_DISPLAY.surface['ai-unavailable']`) |
| U8 | Scan banner | age > `STALE_RESULT_THRESHOLD_MS` | `Results from <date> — re-run scan for latest data` | `Stale — results from <date> · re-run scan for latest data` |

`DH_DISPLAY` gained one additive group, `surface`, with exactly the two §3 entries. `_dhLabel` and every existing key/value are unchanged.

## QA

- Pre-edit `qa:offline`: PASS, 48 suites, 1 advisory warning (smart quote in `index.html` script block, line 10362 at baseline — pre-existing).
- Tests-first: `qa/dh_ui_vocabulary_offline.js` was written before the implementation; at baseline it failed UV-1/UV-2 and UV-5 (2 of 28) while UV-3/4/6/7 and all controls passed.
- Targeted: `node qa/dh_ui_vocabulary_offline.js` PASS (30 assertions); `node qa/eod_packet_v0_offline.js` PASS (187 asserts, DH-M1 RD-D2 table checks green).
- Full `npm run qa:offline` after implementation and after the Codex fixes: PASS, **49** suites, same single advisory warning. No existing QA file was edited or re-pinned; `qa/run-offline.js` untouched.

## Codex ledger

Initial review (read-only, real diff + new QA file; raw output in `codex.md`): implementation PASS (wording, branches, additive table, out-of-scope surfaces, file set all matched). Two Class I findings, both in the new QA file:

| # | Finding | Class | Decision | Reason / resolution |
|---|---|---|---|---|
| 1 | UV-4 counted each out-of-scope literal file-wide, not at its site | I | FIX | Now site-scoped: each literal must occur exactly once in its baseline owning function (`_renderPortfolioPanel`, `checkAndShowStaleBanner`, `_pfComputeNeedsAttention`, `_pfComputePortfolioReporting`) and once file-wide; new control moves a literal out of its site and fails |
| 2 | UV-7 compared aggregate token counts, so a moved access could pass | I | FIX | Now pins a hash of the exact lines carrying a forbidden token per changed function; new control removes one `pt_` line and adds another and fails |

While fixing #1/#2 the controls were switched to a function-replacer helper (`swap`) so `$` patterns in large replacement strings cannot silently corrupt a fixture.

## Scope

Files changed are exactly the brief's §2 set. No §4 surface, condition, threshold, owner, persistence, schema, scoring or export wording was touched. Four ruled-but-excluded surfaces (R1–R4) are byte-unchanged and pinned by UV-4.

## Lessons

- [local] `String.prototype.replace` with a large replacement string interprets `$` patterns; QA mutation fixtures built from production source should use a function replacer.
- [local] `index.html` is CRLF in the Windows worktree and LF at HEAD; the Edit tool can rewrite EOLs, so this task applied edits with a byte-safe script and confirmed CR count equals LF count afterwards.
- [covered] Hardcoded aggregate counts make weak pins — `.claude/rules/qa-suites.md` already prefers relative/derived checks; line-level hashes were used here instead.

## Files changed

- Implementation (2): `index.html`, `qa/dh_ui_vocabulary_offline.js`
- Evidence (tracked): work/dh-ui-vocabulary/brief.md, work/dh-ui-vocabulary/review.md

## Final check

Final check: 1 round on the complete task diff (incl. this file), 0 findings — PASS. It also confirmed both initial Class I findings resolved; the fixes were QA-file-only, full `qa:offline` (49) was re-run after them. No class-II findings; no implementation change after the final pass, no QA re-run needed.
