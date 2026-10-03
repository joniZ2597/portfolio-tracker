# Task brief: second-finisher-resync — `pt-land.js resync` lets Bootstrap re-sync a task branch onto branch-dev

This brief has operational effect only when the Owner has approved these exact contents and the brief-only
commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Backlog | **none** — workflow tooling; closes the "Bootstrap re-sync for the second finisher" workflow gap (dashboard, Track 6) |
| Baseline | ee98b353e51d8b08f17d1b3cc82f9abd3e87631e = branch-dev = origin/branch-dev (Entry 7 closeout landed); main = origin/main = fbec2c193346d7afd1dab6fd11a46b5efe55238b. Anchors verified at `ee98b35` (`pt-land.js` verbs, hook `R12_FORM_RE` :1346, AGENTS.md :147, :552–555, :570–571) |
| Branch / slot | `task/second-finisher-resync`, **Worker A** (free, detached at `ee98b35`) |
| Mode | **Manual** — DENY-tier tool and hook, ASK-tier `AGENTS.md`; they go in through the PROTECTED gate (step 13a) |
| qa:offline | baseline count at Step 0 → **+1** (`qa/pt_land_resync_offline.js`) |
| Parallel with | Tech Score (Worker B): no shared file. **Full `qa:offline` runs must not overlap** (Worker B's earlier full run was killed for low memory); Worker B's full run goes first |
| Status | CODE-READY on Owner approval of this brief |

Objective. When another task lands first, Bootstrap brings the second task's branch up to date with one tool
command. Raw `git rebase`/`merge`/`pull` stay denied everywhere. The Owner's approval points are unchanged:
the LAND line after the re-sync is still the gate.

## 0. Situation (verified 2026-10-03, read-only)

- `branch-dev` = `origin/branch-dev` = `ee98b35` (Entry 7 closeout landed, pushed, cleaned).
- Worker B: `task/tech-score-default` is still at `a22c3aa` with **no commits of its own**. Its work is
  uncommitted: `index.html` modified and `qa/ts1_default_exposure_offline.js` new. `BACKLOG.md` is untouched —
  step 10a has not run. Its last full QA run was killed by the system for low memory and has not been re-run.
- `ee98b35` changes `BACKLOG.md`, the two census files and `work/entry7-closeout/review.md` — none of Worker B's
  uncommitted files. **So today's re-sync is a fast-forward that keeps Worker B's work in place; no commits
  need replaying.**
- Why Bootstrap cannot do it today: raw `rebase`/`merge` are denied in every session (R3m); `git -C <slot>
  reset …` from the canonical checkout is denied (R10-5 global form). Worker B could run `git reset --keep` in
  its own slot (the hook allows task-slot resets), but AGENTS.md assigns the re-sync to the Owner and the
  integrity-check parameters change. **Owner ruling 2026-10-03:** Tech Score is unblocked by a one-time
  exception (Worker B fast-forwards itself, keeping its work); this task makes future re-syncs Bootstrap's.

## 1. Rulings (Owner, 2026-10-03)

- **R-1** Bootstrap re-syncs through one tool verb only. R3m (raw rebase/merge/pull) is unchanged.
- **R-2** No new approval line. The re-sync changes only a `task/*` branch; `branch-dev`, `main` and the remote
  are never moved. The LAND line that follows — bound to the new tip, after fresh QA — remains the gate.
  The Owner kept the existing approval model; no `RESYNC` line is added.
- **R-3** Mechanical only: any conflict, overlap or content difference → refuse, with nothing changed.
- **R-4** Tasks that contain PROTECTED-approved commits are refused (replaying them would invalidate the
  approved tree); those stay with the Owner.

## 2. Tool — `node .claude/hooks/pt-land.js resync task/<id>` (from the canonical checkout, or the task's own slot)

**Preconditions** (each refusal changes nothing):
- S1 self-integrity (as L2/K2); no `GIT_*` overrides; git config and hooks clean.
- S2 canonical checkout on `branch-dev` and clean.
- S3 the task branch exists and is checked out in exactly one Worker slot; that slot has no rebase, merge or
  cherry-pick in progress; the tool lock is free (same lock as `land`).
- S4 `work/<id>/brief.md` exists at `branch-dev`.
- S5 if `branch-dev` is already an ancestor of the task tip → "already up to date", exit 0.

**Mode F — fast-forward** (task tip is an ancestor of `branch-dev`: no commits of its own):
- F1 record the slot's uncommitted state: sha256 of `git diff HEAD --binary` and the sha256 of every untracked,
  non-ignored file.
- F2 in the slot: `git reset --keep <branch-dev OID>`. Git itself refuses if any uncommitted file differs
  between the old and new base → refuse "uncommitted work overlaps the new base", nothing changed.
- F3 verify: slot HEAD = `branch-dev`, still on `task/<id>`; the F1 hashes are identical afterwards.

**Mode R — replay** (task has commits):
- R1 slot clean (ignored files such as `plan.md`, `codex.md`, `qa.log` are allowed).
- R2 refuse if any commit in `merge-base..tip` touches a protected path, or the audit log has a
  `protected-commit` entry for this task (R-4).
- R3 in a temporary detached worktree under `os.tmpdir()`:
  `git -c core.hooksPath=<empty> -c rebase.autoSquash=false -c rebase.updateRefs=false rebase --onto <branch-dev> <merge-base> HEAD`.
  Non-zero exit → `rebase --abort`, remove the temp worktree, refuse "conflict".
- R4 verify: same commit count; per-commit `git patch-id --stable` equal and in order; no merge commits;
  `work/<id>/brief.md` blob equals `branch-dev`'s; the set of changed files is unchanged.
- R5 in the slot: `git reset --keep <new tip>`; verify HEAD = new tip and slot clean.
- R6 remove the temp worktree (`worktree remove`, then `worktree prune`).

**Both modes:** append the audit line `{verb:'resync', task, mode, from, to, base, result}`; print the mode, the
new tip and the Worker's next steps, including the exact integrity parameters
`--base-dev <branch-dev OID> --since <re-sync time, ISO>`. Never moves `branch-dev`, `main` or `origin/*`, never
pushes, never writes an approval record, never deletes a file in the slot.

## 3. Hook and settings

- `R12_FORM_RE` (`pretooluse-guard.js:1346`) gains exactly one alternative, `resync task/<id>`, using the existing
  task-id pattern. Nothing else changes (R3m, R10-5, R11, R13, r9).
- `.claude/settings.json` is **unchanged**: the verb is not allowlisted, so it prompts in Manual.

## 4. AGENTS.md (exact edits; old texts match once at `ee98b35`)

- **A1 — Second LAND** (:552–555). Replace "the Owner rebases the task branch in a normal terminal. The Worker
  then re-runs" with:

  > Bootstrap runs `node .claude/hooks/pt-land.js resync task/<id>` while the Worker is paused. If it refuses (conflict, overlapping uncommitted work, or PROTECTED-approved commits), STOP: the Owner decides. Otherwise the Worker re-runs

  and replace "the integrity check (against the rebased commit)" with "the integrity check (with the
  `--base-dev` and `--since` values `resync` prints)".
- **A2 — Protected actions** (:571). Replace "under the Owner's single-use records (R12)." with
  "under the Owner's single-use records (R12); and a `task/*` re-sync through `pt-land.js resync`, which never
  moves `main` or `branch-dev`."
- **A3 — Step 14** (:147). Replace `"branch-dev moved" means Second LAND.` with
  `"branch-dev moved" means Second LAND: STOP for the Bootstrap re-sync (see "Owner LAND / SHIP boundaries").`

## 5. Files — exactly 6

```
.claude/hooks/pt-land.js               resync verb (§2)            PROTECTED (step 13a)
.claude/hooks/pretooluse-guard.js      R12_FORM_RE + resync (§3)    PROTECTED (step 13a)
AGENTS.md                              A1–A3 (§4)                   PROTECTED (step 13a)
qa/pt_land_resync_offline.js           NEW — §6
qa/auto_mode_hardening_offline.js      AH-25 rows + differential
work/second-finisher-resync/review.md  NEW — ## Backlog reconciliation: none; LAND-EVIDENCE
```

<!-- protected-scope:begin -->
.claude/hooks/pt-land.js
.claude/hooks/pretooluse-guard.js
AGENTS.md
<!-- protected-scope:end -->
<!-- land-scope:begin -->
.claude/hooks/pt-land.js
.claude/hooks/pretooluse-guard.js
AGENTS.md
qa/pt_land_resync_offline.js
qa/auto_mode_hardening_offline.js
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/pt_land_resync_offline.js
node qa/auto_mode_hardening_offline.js
<!-- land-tests:end -->

A separate suite keeps `qa/pt_land_offline.js` (already ~22 min on the laptop) unchanged.

## 6. QA — `qa/pt_land_resync_offline.js` (real-git fixtures; each row has a planted negative)

| ID | Assertion |
|---|---|
| RS-1 | Mode F with non-overlapping uncommitted tracked and untracked changes → HEAD moves to `branch-dev`; the changes are byte-identical; audit line written |
| RS-2 | Mode F with an uncommitted file that `branch-dev` also changed → refused; nothing changed |
| RS-3 | Mode R clean replay → new tip descends from `branch-dev`; patch-ids equal in order; slot clean at the new tip |
| RS-4 | Mode R conflict → refused; slot, task ref and `branch-dev` untouched; temp worktree gone |
| RS-5 | Mode R with a dirty slot → refused |
| RS-6 | Protected-path commit or `protected-commit` audit entry → refused |
| RS-7 | Already up to date → exit 0, nothing changed |
| RS-8 | Refs `main`, `branch-dev`, `origin/*` byte-identical before/after; no approval record written; no push |
| RS-9 | A planted git hook is not executed |
| RS-10 | Rebase in progress in the slot, or tool lock held → refused |
| RS-11 | End to end: task 1 lands; task 2 re-syncs; `land-request` + `land` fast-forward task 2 |
| RS-12 | Printed integrity parameters equal the post-re-sync `branch-dev` OID and the re-sync time |

**Hook:** AH-25 allows exactly `node .claude/hooks/pt-land.js resync task/<id>` and denies wrapped, prefixed or
misspelled forms; raw `git rebase` stays denied in every session. The differential changes decisions only on the
new rows. **Also:** full `qa:offline` at the Step-0 count + 1 (run while no other full run is active).

## 7. Flow, STOP, Definition of Done

**Flow:** Manual in Worker A: Step 0 → plan → tests first → tool, hook and AGENTS.md candidates built under
`<os.tmpdir()>/pt-second-finisher-resync/protected/` → QA + Codex → step 10a (`none`) → `review.md` → Codex
final → task commit (ordinary files) → **step 13a PROTECTED gate** (one Owner line) → integrity → LAND request
(G3) → Owner line → LAND → push request → Owner line → push → cleanup.
**First real use:** the next second finisher. Tech Score was already unblocked by the one-time Owner exception.

**STOP:** STOP-1..6; any change to R3m, R10-5, r9, R11 or R13 semantics; a resync path that can move `main`,
`branch-dev` or `origin/*`, push, write an approval record or delete slot files; replay without patch-id
verification; any `settings.json` change; any AGENTS.md wording beyond A1–A3; any edit to
`qa/pt_land_offline.js`.

**Definition of Done:** §2–§4 exact; RS-1…RS-12, AH-25 and negatives PASS; full `qa:offline` = baseline + 1;
Codex no unresolved Class I; protected files in via step 13a; LANDed, pushed, cleaned.
