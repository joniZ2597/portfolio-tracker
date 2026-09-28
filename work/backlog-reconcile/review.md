# review.md — BACKLOG reconciliation (task/backlog-reconcile)

Brief: `work/backlog-reconcile/brief.md` @ `9901ee0` (base = this brief-only commit).
Mode: Auto (attended). Documentation-only diff; no code, no QA-suite change.

## Result

- E1–E9 applied exactly; every §5 text check passes (13/13, table below).
- `BACKLOG.md` is the only changed product-side file; CRLF preserved throughout
  (byte audit: 246 CRLF terminators, 0 lone LF, 0 lone CR).
- Full `npm run qa:offline`: **PASS, 50 spawned suites** — pre-edit baseline and post-edit
  run both PASS 50 (`qa.log`). One pre-existing advisory (index.html smart quote at :10363),
  unchanged by this task and out of scope.
- Codex (step 8, implementation diff): **PASS — no findings** (raw verbatim in `codex.md`).
- FIX / DEFER / REJECT ledger: **empty** — zero findings to classify.

## Files changed

- Implementation (1): BACKLOG.md
- Evidence (tracked): work/backlog-reconcile/brief.md, work/backlog-reconcile/review.md

*(Brief §2 names `work/backlog-reconcile/review.md` inside its two-file set, annotated
"tracked task evidence"; per the AGENTS.md fixed two-row shape it appears in the Evidence
row. The implementation diff is BACKLOG.md alone, matching §2's implementation intent.)*

## SHA verification (brief §3)

Every commit SHA written by the diff verified with `git cat-file -e <sha>^{commit}`:

| SHA | Exists | Subject |
|---|---|---|
| `9901ee0` | OK | docs(work): add BACKLOG reconciliation brief |
| `fbec2c1` | OK | feat(governance): add MAIN-SKILL-AUTHORING execution profile |
| `3fc3e61` | OK | docs(research): record S2 hub-page measurement |
| `98d3d68` | OK | feat(eod): add readiness block |
| `5ad0a5f` | OK | fix(ui): align display state vocabulary |
| `9be7717` | OK | docs(work): add DH-M2b ruled display surfaces brief |
| `bf936de` | OK | fix(entry-9): UI hygiene bundle |
| `df5ad24` | OK | feat(scan-results): add held marker |

`git rev-list --count fbec2c1..9901ee0` = **111** (E1's "111 commits ahead of production").

## Text checks (brief §5)

Scratch script outside the repo (session scratchpad), deleted after use; each side-effecting
computation ran once with assertions on the stored value (§5 QA lesson). All 13 PASS:

| Check | Result |
|---|---|
| T1 E1 snapshot cells exact; N = 111 matches `git rev-list` | PASS |
| T2 hub-page closure paragraph present; old "Slice candidate" absent | PASS |
| T3/T5/T6 NEXT contains no `### 6`, `### 9`, `### 10` (headings now 7, 8, 11, 12, 22) | PASS |
| T4 entry 7 *Landed:*/*Briefed:*/*What remains:* + resolved *Deps:*; old text absent | PASS |
| T7 DONE / HISTORY has `**9**` with `bf936de` and `**10**` with `df5ad24` | PASS |
| T8 entry 29 exactly once, under HOLD — Owner-sequenced | PASS |
| T9 computed active count 21 = E1 cell = E9 sentence (rule: numbered entries in NOW, NEXT, LATER, HOLD, HOLD / EXTERNAL; DONE-marked excluded) | PASS |
| T10 every SHA in added lines resolves to a commit | PASS |
| T11 `git diff --stat` touches only `BACKLOG.md` | PASS |
| T12 diff hunks map one-to-one onto E1–E9 (7 hunks: E1 · E2 · E3+E4a+E4b merged, inter-change gap ≤ 2×context · E5+E6 contiguous · E8 · E7 · E9; mapping visually confirmed — no hunk touches text outside §4) | PASS |
| T13 `BACKLOG.md` CRLF throughout | PASS |
| T14 every numbered entry heading/row unique | PASS |
| S0 section-boundary sanity | PASS |

Two script defects were found and fixed during the run — both harness-side, neither a
content change: (1) `execSync` on Windows routes through cmd.exe, where an unquoted `^`
is an escape character, so `<sha>^{commit}` silently became `<sha>{commit}` — fixed by
quoting; (2) the expected hunk count was initially 8 — unified diff merges hunks whose
inter-change gap is ≤ 2×context, so E3/E4 form one hunk (correct value 7).

## Codex review

- Step 8 (implementation diff, `codex exec --sandbox read-only`, codex-cli 0.157.0):
  **PASS — no findings.** Codex independently re-verified the E2 measurement claims against
  `3fc3e61` / `work/s2-hub-page-measurement/` (35 survivors over 9 cases, 7 hub-class URLs,
  no predicate effect, no `fixtureSha256` change), the E1 counts, the E4/E7 SHAs, and hunk
  containment. Raw output verbatim: `codex.md`.
- Final check (task diff): **PASS — no findings.** Raw output appended to `codex.md` under
  `## Final check`. Codex re-confirmed: BACKLOG.md diff unchanged since the step-8 review
  (35/51 numstat), `brief.md` unchanged from base, qa.log's two PASS-50 runs, the CRLF byte
  audit (246/0/0), and the base commit identity.

Final check: 1 round, 0 findings — PASS; no implementation change, no QA re-run.

## Lessons

- [covered]  §5's compute-once/assert-on-stored-value QA lesson was applied in the scratch
  checker — already covered by brief §5.
- [rule]     Scratch-harness commands run via node `execSync` on Windows pass through
  cmd.exe, where an unquoted `^` is silently consumed — always quote arguments containing
  `^` (e.g. `git cat-file -e "<sha>^{commit}"`), or the check tests the wrong object.
  Destination-ready for AGENTS.md (test-command guidance).
- [local]    Unified diff merges hunks whose inter-change gap is ≤ 2×context lines; a
  hunk-count expectation must be derived from the file's actual line geometry, not from the
  count of logical edits.
