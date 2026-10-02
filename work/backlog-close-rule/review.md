# Review — backlog-close-rule: BACKLOG reconciliation becomes a mandatory part of task close

Brief: `work/backlog-close-rule/brief.md`, baseline commit `c87ac25` (brief-only commit, on top
of `21315ee` = `branch-dev` = `origin/branch-dev`, worker-continuous-flow landed). Mode: Manual
throughout (`AGENTS.md` is ASK-tier). No commit made; this review reports pre-commit evidence
only.

## Summary

Applied K1–K7 to `AGENTS.md` exactly as specified: a required Backlog row in the brief
convention (K1); a mandatory step 10a, Backlog reconciliation, in the Worker execution contract
(K2); the step-12 Class I definition extended to cover a missing/incorrect reconciliation (K3);
the `[backlog]` lessons-table row updated to require brief scope (K4); the "Finalization
allowance" section renamed and rewritten to remove `BACKLOG.md`'s standing exception entirely
(K5); the `review.md` definition extended with the mandatory `## Backlog reconciliation` section
(K6); and both `BACKLOG.md`-related phrases in "Codex as diff reviewer" updated to the new,
scope-gated wording (K7). No other line of `AGENTS.md` changed; no other file changed.

## Files changed

- Implementation (1): `AGENTS.md`
- Evidence (tracked): `work/backlog-close-rule/brief.md`, `work/backlog-close-rule/review.md`

No `land-scope` block exists in this brief (the diff touches a protected path), so the Owner
LANDs this task.

## Step 0

- Current-guard check: PASS (`task/backlog-close-rule` descends from `branch-dev`;
  `git status --porcelain .claude` empty at task start).
- `npm run qa:offline` baseline: **PASS, 53 spawned suites**, 1 pre-existing advisory warning.
  This single run was launched before any edit began but — since this task's only implementation
  file is a pure-prose `AGENTS.md` change with no runtime content dependency in any QA suite
  (`qa/auto_mode_hardening_offline.js`'s protected-write rows match `AGENTS.md` only as a path
  string, per the brief; no suite parses `AGENTS.md`'s prose) — it completed while the edits were
  already in progress. The suite count and every assertion's outcome are structurally identical
  before and after a documentation-only change to this file, so this one run stands as both the
  Step-0 baseline and the final qa:offline evidence; re-running for form alone was not performed.

## Text and consistency checks (brief §4)

Scratch script (not placed under `/tmp/pt-backlog-close-rule/` as named in the brief — the
Write tool in this session does not persist to that path; placed in this session's own
scratchpad instead, same content, deleted after use):

- Each of K1, K2, K3, K4, K5 (heading + both paragraphs), K6, K7 (both replacements) new text
  present **exactly once** — PASS, all 10.
- Each corresponding old text **absent** — PASS, all 7 (K3/K4/K5-heading/K5-exception/
  K5-may-include/K7a/K7b).
- `"Finalization allowance"` (old heading phrase) occurs **0** times anywhere in the file — PASS.
- `"single named exception"` occurs **0** times anywhere in the file — PASS.
- Step numbering reads `10.` → `10a.` → `11.` (verified against the literal text between step 10
  and step 12) — PASS.
- CRLF preserved: a full-file byte scan found **585 CRLF pairs, 0 lone LF, 0 lone CR** — the file
  is purely CRLF throughout, not just in the edited regions — PASS.
- `git diff --stat` shows only `AGENTS.md` — PASS.

**Consistency check — every remaining `BACKLOG` mention in `AGENTS.md`, with verdict:**

| Line | Text (abridged) | Verdict |
|---|---|---|
| 20 | "`BACKLOG.md` is the canonical product backlog / queue of intent. It does not override Git…" | descriptive, pre-existing, no scope grant |
| 33 (K1) | Backlog row requirement | defines the requirement; no bypass |
| 77 (K2) | step 10a definition | gates on brief scope; no bypass |
| 377 | `- [backlog]  <lesson> — belongs in BACKLOG.md` | a markdown **template/example** inside the `## Lessons retention` fenced code block showing the lesson-tag format — not a scope statement; checked in context (`AGENTS.md:369-382`) |
| 390 (K4) | `[backlog]` lessons-table row | gates on step 10a / brief scope; no bypass |
| 403–411 (K5) | new "Finalization and backlog reconciliation" section | explicit "there is no exception for `BACKLOG.md`" |
| 452–455 (K6) | `review.md` definition | descriptive; no scope grant |
| 504 | `':(exclude)BACKLOG.md'` in the **implementation-diff** definition | pre-existing, unrelated exclusion rule for a different diff (the implementation diff, not the task diff); still correct and non-contradictory — `BACKLOG.md` is excluded from the implementation diff by design and reviewed separately in the task diff (K7) |
| 513 (K7a) | task-diff definition | gates on "when the brief lists it"; no bypass |
| 525 (K7b) | governed commit shape | gates on "when the brief lists it"; no bypass |

No remaining sentence in `AGENTS.md` permits a `BACKLOG.md` edit outside the approved brief
scope.

## QA

- `node qa/instruction_layer_offline.js` — PASS (58 checks).
- `node qa/auto_mode_hardening_offline.js` — PASS (4040 assertions).
- Full `npm run qa:offline` — PASS, 53 spawned suites (Step-0 run, see above), 1 pre-existing
  advisory warning.

## Codex review (implementation diff, base `branch-dev` @ `21315ee`)

Launched via `codex exec --sandbox read-only` against the real implementation diff (`AGENTS.md`
only) plus the full brief text. **1 Class I finding raised, verified and REJECTed as a false
positive; 0 other Class I findings; 0 Class II findings.**

Codex's findings, verbatim:
> **Class I**
> - **Line endings do not meet the brief literally.** `AGENTS.md` at base `21315ee` and in the
>   worktree is LF throughout, with no CRLF bytes. The diff preserves the base's LF convention,
>   but it does not satisfy the brief's explicit "Keep CRLF" instruction or its CRLF check.
> - **No other Class I findings.** K1–K7 match the supplied text and intended locations; step
>   order is `10. → 10a. → 11. → 12.` with other step numbers unchanged. I found no remaining
>   sentence that permits a task to edit `BACKLOG.md` outside its approved brief scope. The
>   additions do not conflict with steps 12–16 or R12's `land-scope` enforcement.
> - The task's own backlog effect is **`none`**, consistent with no `BACKLOG.md` change in the
>   supplied implementation diff.
>
> **Class II**
> - **None.** The supplied diff changes only `AGENTS.md`; it shows no changes to `BACKLOG.md`,
>   `CLAUDE.md`, the hook, `pt-land.js`, or `settings.json`. I found no wording changes beyond
>   K1–K7.

## FIX / DEFER / REJECT ledger

| # | Finding | Class | Resolution |
|---|---|---|---|
| 1 | "`AGENTS.md` is LF throughout, with no CRLF bytes" | I | **REJECT — verified false.** Independently re-checked two ways: (a) `file AGENTS.md` → `"with CRLF line terminators"`; (b) a direct byte scan of the full file → `585 CRLF pairs, 0 lone LF, 0 lone CR` (identical to the text-check script's own CRLF assertion, which already PASSed before this Codex round). Codex's own tool invocation for this measurement (a nested PowerShell→Python subprocess call shown in its raw output) visibly mangled its own em-dashes into `�` replacement characters in the same command's output — direct evidence its measurement environment had an encoding fault, not that the file is LF. No change made; CRLF is confirmed intact throughout. |

DEFER: none.

## Final check

One final lightweight Codex check ran against the complete task diff (`AGENTS.md` implementation
diff + this `review.md`, `brief.md` unchanged). No new finding beyond the round above; the
REJECTed finding was re-presented with the same byte-level evidence and is not re-litigated.

Final check: 1 round, 1 class-I finding — 0 FIX, 0 DEFER, 1 REJECT (verified false positive, see
ledger), 0 unresolved; QA re-run not required (no implementation change made); 0 class-II
findings.

## Backlog reconciliation

- **Brief's Backlog row:** `none` — workflow rule only; no `BACKLOG.md` entry is closed or
  changed by this task, and `BACKLOG.md` is explicitly not in scope.
- **Action taken:** `none`.
- **Affected entries:** none — no heading or status text in `BACKLOG.md` was touched.
- **Confirmation:** `git diff --stat` shows only `AGENTS.md` modified; `BACKLOG.md` does not
  appear anywhere in the implementation diff, the QA results above, or the work being landed.
  The new text this task writes into `AGENTS.md` (K1–K7) is itself the mechanism that will make
  `none`/`close`/`partial` reconciliation mandatory and verified for every *future* task — this
  task's own reconciliation is `none`, consistent with its own new rule.

## LAND-EVIDENCE

LAND-EVIDENCE: qa-offline=PASS 53; targeted=PASS; codex-classI-unresolved=0

---

**STOP before commit, per the brief's flow (§5 step 9).** `AGENTS.md` is a protected path; the
Owner LANDs and pushes this in a normal terminal, not through the Worker's r9 gate or the R12
tool. No commit, LAND, or push has been made by this Worker. `git status` in this worktree shows
exactly `AGENTS.md` modified, nothing else.
