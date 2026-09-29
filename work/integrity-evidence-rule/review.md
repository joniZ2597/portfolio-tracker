# review.md — task/integrity-evidence-rule

## Summary

Codifies the Owner ruling of 2026-09-29 (brief IE-1/IE-2/IE-3): the post-commit
`qa/guard_integrity_check.js` result is LAND evidence only. It is reported in the Worker's
step-13 STOP report (or by the Owner before LAND), never written into the committed
`review.md` — no amend, no second commit made only to record it. Documentation-only: no
behavior, hook, gate, or QA-suite outcome changes.

## Files changed

- Implementation (2): AGENTS.md, qa/guard_integrity_check.js
- Evidence (tracked): work/integrity-evidence-rule/review.md

## M6 note — brief/reality mismatch (line endings)

Brief §4 states both `AGENTS.md` and `qa/guard_integrity_check.js` are checked out with CRLF
line endings. Verified byte-level: `AGENTS.md` is all-CRLF (566 CRLF, 0 LF-only);
`qa/guard_integrity_check.js` is all-LF (0 CRLF, 219 LF-only) — the brief's CRLF claim for this
file does not match repository evidence. Under AGENTS.md's STOP-2 exception ("a brief whose
wording mis-measures a condition the implementation plainly meets is not this condition"), the
brief's intent — no EOL churn — is met by preserving each file's own existing convention. Reading
used: `AGENTS.md` kept CRLF; `qa/guard_integrity_check.js` kept LF. Verified unchanged
post-edit. Not a STOP.

## QA (pre-commit evidence)

- Step 0 baseline: `npm run qa:offline` → PASS, 50 spawned suite(s) (2026-09-29T20:19:07Z).
- `node qa/auto_mode_hardening_offline.js` → PASS (3773 assertions), confirming the AH-18
  integrity rows/mutants are unaffected by the G4 header-comment edit (the anchor is not a
  mutant target — confirmed by grep before editing).
- `node qa/instruction_layer_offline.js` → PASS (58 checks); `CLAUDE.md` untouched, fingerprint
  unchanged.
- Text checks (scratch script, outside the repo): 11/11 PASS — G1 (two bullets), G2, G3a, G3b
  texts each present exactly once; `"result -> review.md"` absent from
  `qa/guard_integrity_check.js`; that file's `git diff` is exactly one changed line; the
  `AGENTS.md` diff has exactly 3 hunks (G1, G2, G3a+G3b); exactly 2 tracked files modified;
  both files' line-ending convention preserved.
- Full `npm run qa:offline`: one run reported `FAIL: AH-16 real (standalone slot .git directory,
  task/y, clean staged -> allow)` inside `qa/auto_mode_hardening_offline.js`. Re-ran that suite
  standalone twice with zero file changes in between: PASS (3773 assertions) both times —
  confirming this is the known flaky, real-git-state/timing-sensitive legacy-suite behavior, not
  a regression caused by this task's edit. Two subsequent full `npm run qa:offline` runs: PASS,
  50 spawned suite(s), both times.

**QA lesson applied:** each check's assertion (e.g. the CRLF byte-count checks, the diff-hunk
count) computed its underlying command/read once and asserted on the stored value.

## Codex outcome

Implementation-diff review (step 8/9): **No findings** (raw response in `codex.md`). Codex
reported the wording matches brief §4 (G1–G4) exactly, no behavior/hook/gate/QA change, and no
contradiction with step 12/13 or STOP-6.

Final check (step 12), round 1, against the task diff (implementation diff + this `review.md`'s
full content, `review.md` still untracked at review time; `brief.md` contributes no diff,
unchanged from baseline): 2 findings, raw response in `codex.md` under `## Final check — round
1`.
- Class I: the Second LAND bullet (G3, brief §4) doesn't restate that the post-rebase integrity
  result is LAND evidence only, never recorded in `review.md`, the way the adjacent G3a LAND
  bullet does. Owner ruling (given live): FIX, not the Worker's initially proposed DEFER —
  authorized the smallest wording addition to the Second LAND bullet, overriding the brief's
  exact-wording lock for this one clarification. Applied: appended " — the post-rebase integrity
  result is LAND evidence only, never recorded in `review.md`." to the Second LAND bullet in
  `AGENTS.md`. CRLF preserved (all-CRLF, verified byte-level post-edit).
- Class II: this `review.md` was missing its step-12 final-check summary line. FIX — this
  section, self-checked, no separate QA re-run needed for the class-II item itself.

Re-run after the Class I fix: text checks (11/11 PASS, including updated G3b anchor), targeted
QA (`node qa/auto_mode_hardening_offline.js` PASS 3773 assertions; `node
qa/instruction_layer_offline.js` PASS 58 checks), and full `npm run qa:offline` — one run FAIL
on the same known-flaky `AH-16 real` real-git-state check (see QA section above), two subsequent
runs PASS 50 spawned suite(s).

Final check, round 2, against the updated task diff (implementation diff including the Second
LAND wording fix, plus this `review.md`'s full content): **no findings, either class** (raw
response in `codex.md` under `## Final check — round 2`). Codex confirmed the new Second LAND
wording unambiguously states the post-rebase integrity result is LAND evidence only, never
recorded in `review.md`, consistent with IE-1 and the adjacent G3a bullet; that the wording
addition changes no behavior, hook, gate, or QA outcome; and that this `review.md`'s account of
round 1 (findings, Owner ruling, fixes, QA results) is accurate.

Final check: 2 rounds. Round 1 — 1 Class I finding — Worker initially proposed DEFER; Owner
ruled FIX; FIX completed and verified (0 REJECT, 0 unresolved; QA re-run performed) — and 1
class-II finding fixed, self-checked. Round 2 — 0 class-I findings, 0 class-II findings; no
implementation change, no QA re-run. No unresolved Class I finding remains.

## FIX / DEFER / REJECT ledger

- **FIX** (final check round 1, Class I, per Owner ruling): Second LAND bullet (G3) now
  explicitly states the post-rebase integrity result is LAND evidence only, never recorded in
  `review.md` — see Codex outcome above for the exact wording and verification.
- **FIX** (final check round 1, Class II): this `review.md` file — added the missing step-12
  final-check summary content (this section and the ledger itself).

## Lessons

- [local]  Brief §4's CRLF claim for `qa/guard_integrity_check.js` did not match the checked-out
  file (it is LF-only); true only of this task's baseline verification, no destination.
