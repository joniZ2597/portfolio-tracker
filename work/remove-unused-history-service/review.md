# Review — Remove unused `services/history.js`

## QA result

`npm run qa:offline` — **PASS**, both before and after deletion, identical shape:

| | Phases | Spawned suites | Advisory warnings | Result |
|---|---|---|---|---|
| Baseline (pre-delete) | 14 | 42 | 1 | PASS |
| After deletion | 14 | 42 | 1 | PASS |

Phase 14 (Provider policy, `phaseProviderPolicy`) passed with the same 34 assertions in both
runs. No suite gained, lost, or changed outcome as a result of the deletion.

## Fresh-context self-review

Performed by a fresh-context reviewer (no prior task memory) re-reading `brief.md` and the
complete staged diff from scratch, including an independent re-verification of reachability
(grep for `require`/`import`/`<script src>`, `package.json` main/files fields, Netlify
function references, QA wildcard/glob patterns over `services/`).

**Result: PASS.** Diff matches the brief's "Implementation scope — exactly one file" exactly
(`services/history.js` deleted, 203 lines removed, 0 added, `git status --short` shows only
`D  services/history.js`). No scope creep. No dependency found anywhere in the repo that
resolves to the deleted path. No QA suite wildcards `services/`. One immaterial note: the
brief's PREP prose said "204" lines where the actual diff is 203 deletions (trailing-newline
counting artifact in the original PREP read) — not a defect, since no pass/fail condition in
`plan.md`'s Definition of Done hardcodes a line count; the condition is "single-file
deletion, zero lines added," which holds.

## Codex review (on the real diff)

Run via `codex exec review --uncommitted` against the actual staged deletion in the task
worktree. Raw output captured verbatim in `work/remove-unused-history-service/codex.md`
(untracked, per convention).

Codex independently re-derived the same evidence chain as the brief — grepped the full repo
for `history`, confirmed the only surviving references are `index.html`'s live inlined
implementation and prose/comment mentions (`BACKLOG.md`, `work/canonical-backlog/brief.md`,
`services/research-evidence-client.js`, plus this task's own `work/remove-unused-history-
service/brief.md`), confirmed no `require`/`import` resolves to the deleted file, and ran
`npm run qa:offline` itself, observing the same PASS (14 phases, 42 suites, 1 advisory
warning).

**Codex verdict (verbatim final message):** "The deleted service is not referenced as a
runtime dependency; the live implementation remains in index.html. The full offline QA suite
passes after deletion."

**No findings raised.**

## FIX / DEFER / REJECT ledger

Empty — Codex raised zero findings on the implementation diff. Nothing to classify or
resolve.

## Scope confirmation

- Files changed by implementation: `services/history.js` (deleted) only.
- `BACKLOG.md`, `work/canonical-backlog/brief.md`, `index.html`, `qa/run-offline.js`: not
  touched, per brief's "Explicitly not in scope."
- `main`/production: untouched; task remains on `task/remove-unused-history-service`,
  targeting `branch-dev` at LAND, pending separate Owner LAND approval.

## Definition of Done — verified

- `services/history.js` no longer exists in the working tree. ✅
- The **implementation diff** (the change itself, reviewed by Codex and the fresh-context
  self-review) is a single-file deletion, no other changes: `git diff --cached --stat`
  captured immediately after `git rm services/history.js` and before staging this file showed
  exactly `services/history.js | 203 ---...`, 1 file changed. ✅
- **Correction (raised by the final Codex check, not silently resolved):** the brief's
  Definition of Done literally reads "`git diff --stat` against `branch-dev` shows a
  single-file deletion with no other changes." Measured as written —
  `git diff --stat branch-dev` from this worktree, staged changes included — that is **not**
  satisfied: it reports three files, because the already-committed, Owner-approved
  brief-only commit (`b5fa37f`, containing `work/remove-unused-history-service/brief.md`)
  and this `review.md` are both part of the branch's cumulative diff against `branch-dev`,
  alongside the single code deletion — structurally: `services/history.js` (deleted),
  `work/remove-unused-history-service/brief.md` (added, from the already-committed brief-only
  commit), and `work/remove-unused-history-service/review.md` (added, this file). Exact
  insertion counts for `review.md` are intentionally not pinned here, since this document
  describing its own diff is a moving target while it is still being edited — the structural
  claim (three paths: one deletion, two evidence docs) is what matters and is stable.
  This is the same structural shape every task in this workflow has (`brief.md` committed
  first, `review.md` committed with the final implementation touch-ups — see
  `work/quarantine-arc-qa/brief.md`'s own Definition of Done, which is scoped to
  implementation files only, not the cumulative branch diff). The **code** change remains
  exactly one file (`services/history.js` deleted, 0 lines added) in both the immediate
  implementation diff and the final two-file implementation-commit diff
  (`services/history.js` + `review.md`). The brief's DoD wording did not anticipate that its
  own required evidence files (`brief.md`, `review.md`) would themselves appear in a
  `branch-dev`-relative diff — this is a wording gap in the approved brief, not a scope
  violation by the Worker, and per `AGENTS.md` M6 ("repository evidence conflicts with the
  approved brief... brief cannot be satisfied as written → STOP-2") was surfaced to the Owner
  rather than reinterpreted unilaterally.

  **Owner ruling (recorded, not amending the approved brief):** accepted as an informational
  wording gap; the brief is not retroactively amended. The single-file-deletion Definition of
  Done requirement is to be read as scoped to **implementation**, excluding this task's own
  evidence artifacts (`brief.md`, `review.md`). Under that reading, this condition is
  satisfied: ✅
- `npm run qa:offline` passes with the same suite/assertion shape as the pre-task baseline. ✅
- Post-delete reference grep matches are limited to the known non-runtime set (`index.html`
  live implementation, `BACKLOG.md`, `work/canonical-backlog/brief.md`,
  `services/research-evidence-client.js`) plus this task's own evidence files
  (`brief.md`/`plan.md`/`codex.md`/`review.md`, self-referential and expected); zero
  import/require/script-src/path dependency resolves to the deleted file. ✅

## Lessons

- [rule]     A fresh `git worktree add` checkout has no `node_modules/` — `npm run
             qa:offline` fails immediately (`Cannot find module '@netlify/blobs'`, etc.)
             until `npm ci` runs once in that worktree. This recurred across two consecutive
             tasks (`quarantine-arc-qa` and this one). Destination-ready text for
             `AGENTS.md`'s "Simplified worktree model" section: "Run `npm ci` once in a newly
             created worktree before the first `npm run qa:offline` — a fresh `git worktree
             add` checkout has no `node_modules/`."
- [backlog]  `services/history.js` was able to silently drift out of sync with its own
             `index.html` inlined copy (different proxy mechanism entirely) with nothing
             flagging the divergence, because — unlike `services/fund-facts-read-client.js`
             and `services/sec-evidence-store-client.js` — it had no `BEGIN/END-VERBATIM`
             marker pair and no QA parity suite. Worth a backlog item to audit whether any
             other `services/*.js` source file with an `index.html`-inlined counterpart is
             missing its parity test, since this is now a proven, previously-unnoticed
             failure mode, not just a hypothetical one. **Status: pending routing.**
             **Owner ruling:** option (c) chosen — `BACKLOG.md` is not modified by this task;
             the explicit scope exclusion remains authoritative. This lesson stays recorded
             here, tagged pending, and is routed into `BACKLOG.md` separately, after LAND, by
             a task that has that file in its approved scope. Not acted on now.
- [local]    The brief's PREP evidence stated the deleted file as "204" lines by a
             trailing-newline counting artifact; the actual `git diff` showed 203 deletions.
             Immaterial to this task (no Definition of Done condition hardcoded the count),
             but worth double-checking line counts with `git diff --stat` rather than a
             file's reported line count in future PREP writeups.

## Owner rulings (both items resolved)

1. **Brief DoD wording gap** (Codex final-check P2) — accepted as an informational wording
   gap. The approved brief is not amended retroactively. The single-file-deletion Definition
   of Done requirement is read as scoped to implementation, excluding this task's own
   evidence artifacts. Resolved; see the corrected Definition of Done entry above.
2. **`[backlog]` lesson routing** (Codex final-check P2) — Owner selected option (c): the
   lesson stays recorded in this file's Lessons section, tagged `[backlog] — pending
   routing`; `BACKLOG.md` is not modified by this task; the explicit scope exclusion remains
   authoritative; the backlog candidate is routed separately after LAND by a task that has
   `BACKLOG.md` in its approved scope.

Both items resolved by explicit Owner ruling — nothing left open. All Definition of Done
conditions are met under the Owner's reading. Task is ready for final implementation-commit
approval.
