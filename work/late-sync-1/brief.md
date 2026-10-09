# Task brief: late-sync-1 — one governed late sync at step 9.5, a landing window, and mode R that carries the real candidate state

This brief has operational effect only when the Owner has approved these exact contents and the brief-only
commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Backlog | **none** — workflow tooling (precedents: `second-finisher-resync`, `task-base-record`). It removes routine mid-task resyncs and their repeated full runs. The MASTERS table row B2 (`late-sync-1`) is flipped to DONE by the Owner's backlog maintenance after LAND, as B1 and A1 were in `beaa68f`; this task makes no `BACKLOG.md` edit |
| Baseline | `beaa68f4910a720ca426109b222847b25b6e6311` = `branch-dev` = `origin/branch-dev` (task-base-record, nlm-consistency-1 and backlog-masters-1 landed, pushed, cleaned); `main` = `origin/main` = `fbec2c193346d7afd1dab6fd11a46b5efe55238b`. Anchors verified at `beaa68f` (§A). **Valid at any later `branch-dev` tip where `git diff beaa68f <tip>` is empty for every file in §8** |
| Branch / slot | `task/late-sync-1`, **Worker B** (`pt-wt-worker-b`, detached and clean at `eb1f6dc`); Bootstrap switches it to the task branch at this brief's commit and runs `task-start` (AGENTS.md :585) |
| Mode | **Manual (attended)** — DENY-tier tool and hook, ASK-tier `AGENTS.md`; they go in through the PROTECTED gate (step 13a) |
| qa:offline | the step-0 count → **unchanged** (existing suites are extended; no suite is added; `run-offline.js` and `package.json` are not changed) |
| Parallel with | **none.** This task edits `pt-land.js`, the hook and `AGENTS.md`; never with 3A-L or any other digest-pinned task (MASTERS B2 note). One heavy run on the laptop at a time |
| Status | FINAL on Owner approval; rulings LQ-D1…D6 (2026-10-09), LQ-D7 rejected, brief-request wait tool-enforced (2026-10-09) |

**Objective.** A Worker implements continuously from its recorded base and never resyncs because `branch-dev` moved.
Immediately before the final validation/LAND path it makes one checkpoint commit (9.4) and one governed sync (9.5)
that also acquires the **landing window**. While a window is held, `branch-dev` cannot advance through any governed
path — another task's LAND (L3b), a new brief request (BW), or a previously issued brief approval (R11-W) — until the
holder LANDs, is cleaned up, or is explicitly released. LAND stays fast-forward-only, serialized by the existing lock
and the Owner's single-use LAND line.

## 0. Situation (verified 2026-10-10 at `beaa68f`, read-only)

- `resync` mode F tolerates uncommitted work (F1 snapshot → `reset --keep` → F3 verify, `pt-land.js` :1496–1517);
  mode R refuses any dirty slot (R1, :1520–1523) although R5 already moves the slot with `reset --keep`. Mode `none`
  returns at :1448 **before** `mode` is set and without an audit line.
- At step 9.5 an ordinary task has its implementation uncommitted (the governed shape is brief-only commit → final
  commit); a protected-scope task also holds protected candidates uncommitted in the slot until 13a.
- The R11 brief-only commit gate (`pretooluse-guard.js` `briefCommitGate` :1427–1490) is the only governed path by
  which an already-issued BRIEF approval advances `branch-dev`; its step 5 (:1458–1469) already holds the current
  `branch-dev` oid from `canonicalStatusGit`. `decide(input, deps)` (:1622) merges `DEFAULT_DEPS` (:1491–1502) with
  injected readers; the hardening suite drives it through `depsR11` / `r11DecideOn` (:2004–2042).
- Audit evidence for the problem: 15 `resync` runs 2026-10-04…08; one task resynced 4× with no own commits; one R1
  "slot not clean" refusal (2026-10-06). No `resync ok` line in `pt-land-log` has `base == beaa68f` (P-6 holds).
- Pinning suites, as landed: `pt_land_resync_offline.js` has RS-5 / RS-6 / RS-7 as **section headers only**
  (:405–409, no assertions); `task_base_offline.js` TB-12b (:698) compares the no-record `resync` of modes **F and R
  on a clean slot** (stdout, stderr, audit minus `ts`) with the tool at `BASELINE_COMMIT` `1e4b773`;
  `pt_land_offline.js` PL-1 (:225–236) pins "land-request writes nothing" and all-PASS `checks`. **No landed
  assertion pins mode-`none` audit silence or the `land-request` report shape** → the conditional eighth file of
  the approved design is not required.

## 1. Owner rulings (2026-10-09, not reopened)

- **LS-R1 (LQ-D1):** one governed sync at step 9.5; no routine mid-task resync.
- **LS-R2 (LQ-D2):** mode R carries ordinary uncommitted work and protected candidates with the keep protocol; an
  overlapping uncommitted file refuses with nothing changed.
- **LS-R3 (LQ-D4):** the landing window is acquired at 9.5, derived from the audit log (no queue file), released by
  `land ok`, `cleanup ok` or `window-release`; a second task waits; `land`/`land-request` refuse a non-holder when a
  window is held; `brief-request` refuses while a window is held; **the R11 gate refuses to consume a brief approval
  while a window is held, whatever the line's age** (tool-enforced, never policy).
- **LS-R4 (LQ-D5):** strict matrix only — step 10 full `qa:offline` + land-tests + integrity at the synced tree. No
  waiver of any kind; calibration is out of scope.
- **LS-R5 (LQ-D6):** a Master task stays on its recorded start base through all slices and does 9.4/9.5 once at
  program closure (or at its close-at-last-passed-slice path).
- **LS-R6 (LQ-D7 rejected):** no evidence carry-over for brief-only advances; brief-only advances are blocked while a
  window is held.
- **Out of scope by ruling:** `land-classify`, any candidate-tree classifier, merge-tree equivalence, replay refs,
  `protected-reapprove`, any conditional QA waiver, `validate` attestation, an automated land queue.
- **Unchanged:** the R12 line model (BRIEF / PROTECTED / LAND / PUSH / ADOPT); r9, R11 steps 1–7 (reasons, order),
  R13, R3g, R3m, R10-*; push P1–P12; ff-only LAND and the single lock; `main` strictness; the task-base record v1
  (`pt-task-base/v1`) and its validity rule; Codex placement (steps 8, 12); `cleanup` K1–K9.

## 2. Definitions

- **Window holder** (derived, read-only, from `pt-land-log`): the task `X` whose **latest** line with `verb:'resync'`
  and `result:'ok'` (any `mode`, including `none`) has `base == refs/heads/branch-dev` **now**, and for which no later
  line exists with `verb ∈ {land, cleanup, window-release}`, `task == X` and `result:'ok'`. Lines are read in file
  order; malformed lines are skipped (as `readAuditEntries`, :407). At most one holder can exist (S6 refuses a second
  acquire). A missing log → no holder; an unreadable log → fail closed in every consumer.
- **Candidate state** (this slice): the committed tip plus the slot's uncommitted tracked changes and untracked
  non-ignored files. Overlap is detected on the whole candidate — committed layer by rebase conflict / R4 patch-id,
  uncommitted layer by the `reset --keep` abort. No classifier.

## 3. `pt-land.js` changes (DENY-tier; via step 13a)

**3.1 `resync` — mode R keep protocol (replaces R1).**
- R1 (:1520–1523) becomes: F1 snapshot of the slot (`uncommittedSnapshot`, :1303) and `stagedPaths` recorded. Ignored
  files remain allowed. **No refusal for a dirty slot.**
- R2, R3, R4 unchanged (protected-path / protected-commit refusal, temp-worktree replay, patch-id proof, brief blob,
  changed-file set).
- R5: `keepReset(slotGit, newTip)` as today. A non-zero exit → refuse
  `R5: uncommitted work overlaps the new base (<git first line>) - nothing changed`; the temp worktree is removed by R6;
  the task ref and the slot are untouched (the ref moves only with the slot, through the same `reset --keep`).
- **R5b (new):** F3-style verify — HEAD = newTip, `symbolic-ref HEAD` = `refs/heads/task/<id>`, F1 hashes identical,
  `stagedLost` computed as in mode F. A mismatch → `fail` audit line and
  `R5b: verification failed - STOP (the tool never undoes a reset)`.
- `printResync` prints the mode-F `note:` line for `stagedLost` in mode R too (the code path is shared).
- On a clean slot the stdout, stderr and audit line of mode R are **byte-identical to today** (TB-12b, §7).

**3.2 `resync` — mode `none` writes an audit line.** The :1448 return appends, before returning,
`{ts, verb:'resync', task, mode:'none', from:tip, to:tip, base:dev, result:'ok', reason:null}` — **without**
`recordSha256` (the record file is not touched; the ATB validity rule considers only lines that carry
`recordSha256`, so the record stays valid). An append failure → `auditWarning` as in `finish()`. The printed message
stays `already up to date: …` plus **one** added line `window: acquired by task/<id> at <ts>`.

**3.3 `resync` — S6 window check.** Placed after S4 (:1441–1443) and **before** the S5 mode-`none` early return
(:1448) and before any mutation: holder `H` per §2. `H` absent, or `H.task == task` → continue. Otherwise refuse
`S6: landing window held by task/<X> since <ts> (base <oid>) - wait for its LAND, cleanup or window-release`, with
the usual `refuse` audit line (`mode` as decided, or `null` before S5). Every success path (`none`, `F`, `R`)
therefore acquires or re-acquires the window.

**3.4 `land-request` / `land` — L3b.** After L3 (:527) and before L4: holder `H`. `H` absent, or `H.task == task` →
pass. Otherwise refuse `L3b: landing window held by task/<X> since <ts> - not the holder` (audit `refuse` line only
in `land`, as every other L-refusal). Check IDs and the `checks` array are **unchanged** (`L1`…`L10`); the report
object gains a `window` field **only when this task is the holder** (`{since:<ts>, base:<oid>}`), and
`printLandRequest` (:1875) then prints one line `  window: held by this task since <ts>` after `checks:`. With no
holder the printed output and the report object are byte-identical to today (PL-1, TB-13 survive).

**3.5 `brief-request` — BW window check.** In `runBriefRequestCore` (:797), after the hooks-clean check (:828–829)
and before the `branch-dev` oid is used to build the line: holder `H` present → return
`{ok:false, exitCode:1, reason:'BW: landing window held by task/<X> since <ts> - branch-dev must not advance; LAND, cleanup or window-release first'}`.
`output()` then prints **exactly one** stderr line `pt-land: BW: …`, exit 1; **stdout is empty** (no `BRIEF REQUEST`
block, no approval line); nothing is written (no approval file, no audit line — `brief-request` writes nothing today
and keeps that); nothing is moved. No holder → unchanged.

**3.6 `window-release task/<id>`** (new verb; canonical checkout only, as `brief-request` / `task-start`; prompts in
Manual; **no approval record**, no new `!` line kind).
- W1: the caller is canonical; self-integrity (as L2); no `GIT_*` overrides; config and hooks clean.
- W2: holder `H` exists and `H.task == task`; otherwise refuse `W2: task/<id> does not hold the landing window
  (holder: task/<X> | none)`.
- W3: take the tool lock; re-derive `H` (race check); append
  `{ts, verb:'window-release', task, from:<H.base>, to:null, result:'ok', reason:null}`; release the lock. An audit
  append failure → refuse (nothing else to undo). Print `RELEASED landing window of task/<id> (base <oid>)`.
- Moves no ref, writes nothing outside `pt-land-log`, touches no slot. A refusal appends a `refuse` line.

**3.7** The header comment (:8–10), `main()` (:1947; usage errors shaped as today) and `module.exports` (:2011) gain
`window-release` / `runWindowRelease`. The holder derivation is one function, `windowHolder(commonDir, devOid)`,
used by 3.3, 3.4, 3.5 and 3.6.

**No new git call** is introduced in `land-request`, `land`, `brief-request`, `window-release` or mode `none`: the
derivation reads the audit log, and the `branch-dev` oid is already resolved in each path. Mode R adds only the
snapshot reads mode F already makes (F1 before, F3 after).

## 4. Hook (DENY-tier; via step 13a) — two changes, nothing else

**4.1 `R12_FORM_RE`** (:1346) gains exactly one alternative, `window-release task/<id>`, with the existing task-id
pattern.

**4.2 R11-W — window freeze at the approval-consumption path.** `briefCommitGate` gains one step, **5b**, after step 5
(:1458–1469) and before step 6 (:1471):
- `deps.windowHolder(root, status.oid)` reads `<root>/.git/pt-land-log` once and derives the holder exactly as §2.
  A missing log → no holder. A thrown read → deny
  `R11-W: the landing-window state could not be read` (fail closed).
- Holder present → `{decision:'deny', reason:'R11-W: landing window held by task/<X> since <ts> - branch-dev must
  not advance; LAND, cleanup or window-release first'}`. This deny deliberately does **not** go through `r11Deny`
  (:1423) and carries no "commit from a normal terminal" suffix.
- No holder → steps 6–7 and the allow reason are byte-identical to today.
- `DEFAULT_DEPS` (:1491) gains `windowHolder: windowHolderFs`. The hardening harness's `depsR11` does not inject it,
  so the landed AH-19 rows run the real reader on `R11_CANON` (no log → no holder → unchanged decisions).
- No new git call: the oid comes from the existing `canonicalStatusGit` read. One small file read, inside the R10-7
  budget. The derivation is written once more in the hook (read-only), the established tool/hook parity pattern
  (`brief-request` already re-implements the config/hooks checks); LS-17 proves parity.

Together with L3b and BW this closes every governed `branch-dev` advance while a window is held. An Owner-terminal
commit is ungoverned by design and remains the integrity module's concern (unexplained chain).

`.claude/settings.json` is **unchanged**: `window-release` prompts in Manual.

## 5. `AGENTS.md` (exact edits; each old text matches once at `beaa68f`; the working-tree file is CRLF — edit
byte-safely and verify no EOL churn)

- **A1 + A2 — steps 9.4 / 9.5 / 10** (:78). Replace the line
  ``10. Run full `npm run qa:offline`.``
  with:
  > 9.4. **Sync checkpoint commit.** Commit every ordinary in-scope change (tracked edits and new in-scope files) through the r9 gate as an intermediate commit (`wip(<id>): pre-sync checkpoint`; explicit paths; never a protected path). Only protected candidates may remain uncommitted in the slot.
  > 9.5. **Final sync and landing window.** Run `node .claude/hooks/pt-land.js resync task/<id>` in the slot. Any success (`none`, `F`, `R`) acquires the landing window and, for a recorded task, advances the record. An `S6` refusal (the window is held by another task) is **WAIT**, not a STOP: run no evidence step, continue non-evidence work, and report. Any other refusal → STOP (Owner). A `branch-dev` move during steps 1–9 is **not** an event for the Worker: never resync before 9.5.
  > 10. Run full `npm run qa:offline` at the synced tree (after 9.5).
- **A3 — step 14** (:147, :149). Replace
  `"branch-dev moved" means Second LAND: STOP for the Bootstrap re-sync (see "Owner LAND / SHIP boundaries")`
  with
  `"branch-dev moved" after step 9.5 can only follow an ungoverned advance: STOP (Owner); an L3b refusal means another task holds the landing window: WAIT (see "Owner LAND / SHIP boundaries")`;
  and replace `— including after a Second-LAND rebase` with `— including after a step-9.5 replay`.
- **A4 — Owner LAND / SHIP boundaries** (:552–557). Replace the whole `**Second LAND:**` bullet with:
  > - **Landing window:** the Worker's step-9.5 `resync` acquires it (for a recorded task, `resync` also advances the record's base). While it is held, no governed path advances `branch-dev`: another task's LAND refuses `L3b`, `brief-request` refuses `BW`, and the R11 gate refuses to consume a brief approval (`R11-W`). It is released by the holder's LAND, by `cleanup`, or by `node .claude/hooks/pt-land.js window-release task/<id>` (Owner or Bootstrap, canonical checkout, one audit line, no approval record). If `branch-dev` is advanced outside the tool while a window is held, the holder re-runs 9.5 and step 10 in full; the final Codex check is not repeated when the replay is patch-identical. A `resync` that refuses for a conflict, an overlapping uncommitted file, or a PROTECTED-approved commit is a STOP: the Owner decides.
- **A5 — Protected actions** (:573). Replace `which never moves `main` or `branch-dev`.` with
  `which never moves `main` or `branch-dev`; and `pt-land.js window-release`, which writes one audit line and moves nothing.`
- **A6 — Worker slot model** (:585). After `after the Owner's single-use ADOPT line.` insert:
  ` A Master (multi-slice) task stays on its recorded start base through all slices and performs steps 9.4/9.5 once at program closure (or at its close-at-last-passed-slice path).`
- **A7 — Task folder convention** (:453; the sentence wraps across :452–453, so the anchor is its last line). After `tracked, committed brief whose exact contents were Owner-approved does.` insert:
  ` `brief-request` refuses while a landing window is held, and the R11 gate refuses to consume a brief approval while one is held (R11-W), whatever the line's age; the brief is requested, or re-requested, after that task's LAND, cleanup or release. The Owner does not commit a frozen brief from a terminal.`
- **A8 — Test commands** (:496). After `only at LAND.` insert:
  ` The LAND-evidence full run is the step-10 run at the synced tree (after step 9.5); a pre-sync full run is not LAND evidence.`

No other `AGENTS.md` wording changes. `CLAUDE.md` is unchanged, so its fingerprint in `instruction_layer_offline.js`
is unaffected. The `!` rule (:153) is unchanged: `window-release` has no approval line.

## 6. Invariant (tool-enforced; no residual)

While a landing window is active, no governed brief-only action advances `branch-dev`, regardless of when its request
or approval line was generated: BW blocks new lines, R11-W blocks consumption of existing lines. A denial does not
alter the BRIEF record (not consumed, not deleted); after `window-release` with `branch-dev` unchanged the same record
is consumable again; after a LAND it is refused by the existing "stale parent" check.

## 7. Backward compatibility (requirements)

- **No holder present:** `land-request`, `land`, `brief-request`, `cleanup`, `task-start`, `adopt*` make the identical
  git calls and produce identical output, report objects and audit lines (PL-1, TB-13, TB-19, RS-11, AH-19 survive).
- **Mode F:** unchanged. **Mode R on a clean slot:** stdout, stderr and audit line byte-identical to the tool at
  `1e4b773` (TB-12b is **not** edited and must pass).
- **Mode `none`:** one audit line and one printed line added; no landed assertion pins the old silence.
- **ATB record:** schema and validity rule unchanged; `resync` F/R record writes as landed; `none` leaves the record
  untouched.
- **Re-pins in their own diff, after full real replays** (the source digests change):
  `GIT_CONTRACT_PIN` (`git_contract_offline.js` :396) and `TEMPLATE_CONTRACT_PIN` (`fixture_template_offline.js`
  :226). **GC transcript re-recording is authorised for the `resync` mode-R scenarios only** (the F1/F3 snapshot
  reads), with the before/after git-call list recorded in `review.md`; any other transcript mismatch is a STOP, never
  a re-record.
- **This task itself** runs under the pre-slice rules: its own 13a, integrity (record mode, ATB) and LAND use the
  landed canonical tool; it holds no window; if `branch-dev` moves during it, today's Second-LAND resync applies.

## 8. Files — exactly 7

```
.claude/hooks/pt-land.js               §3                                   PROTECTED (step 13a)
.claude/hooks/pretooluse-guard.js      §4.1 R12_FORM_RE, §4.2 R11-W         PROTECTED (step 13a)
AGENTS.md                              §5 A1–A8                             PROTECTED (step 13a)
qa/pt_land_resync_offline.js           §9 LS-1…LS-17; RS-5 / RS-7 sections filled
qa/auto_mode_hardening_offline.js      AH-27, AH-28 rows (§9)
qa/git_contract_offline.js             GIT_CONTRACT_PIN only (§7)
qa/fixture_template_offline.js         TEMPLATE_CONTRACT_PIN only (§7)
```

Plus evidence `work/late-sync-1/review.md` (`## Backlog reconciliation: none`; the LAND-EVIDENCE line).

**QA suites that read in-scope files as text:** `git_contract_offline` / `fixture_template_offline` (digests →
re-pinned, §7); `pt_land_offline`, `pt_land_resync_offline`, `run_isolation_offline`, `task_base_offline` (copy or hash
the real tool / hook into fixtures and compare to themselves or to the frozen `1e4b773` tool; they survive — TB-12b
is the binding case, §7); `auto_mode_hardening_offline` (AH-18/20/23/25/26 survive; AH-19 survives through the
no-log default; AH-27/28 are added); `instruction_layer_offline` (fingerprints `CLAUDE.md` only; unaffected).

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
qa/git_contract_offline.js
qa/fixture_template_offline.js
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/pt_land_resync_offline.js
node qa/auto_mode_hardening_offline.js
node qa/task_base_offline.js
node qa/git_contract_offline.js
node qa/fixture_template_offline.js
<!-- land-tests:end -->

## 9. QA — acceptance criteria

**`qa/pt_land_resync_offline.js`** (real-git fixtures under `run-tmp`; the existing `buildFixture`, extended only where a
row needs a staged brief, an approval file or the hook; **every row has a planted negative that lands on the tool, the
hook or the fixture inputs, never on the test**):

| ID | Assertion (→ planted negative) |
|---|---|
| LS-1 | Mode R, slot has uncommitted tracked edits and an untracked non-ignored file, none touched by the intervening commit → replayed; HEAD = new tip; both carried byte-identical (F1 = F3); `stagedLost` noted (→ `reset --keep` replaced by `reset --hard` → caught by the snapshot mismatch) |
| LS-2 | Mode R, an uncommitted file that the intervening commit also changed → refused `R5 … overlaps`; slot, task ref, `branch-dev`, temp worktree all unchanged; `refuse` audit line (→ `--keep` replaced by `--merge` → caught) |
| LS-3 | Mode R, uncommitted modification of a protected-scope path (`qa/run-offline.js`) disjoint from the intervening change → carried byte-identical (→ R1 refusal restored → caught) |
| LS-4 | Mode `none` → audit line `{mode:'none', from == to, base == dev}` **without** `recordSha256`; with an ATB record present the record bytes are unchanged and `--print-record` still validates; the `window:` line is printed (→ line omitted → caught; → `recordSha256` written → RECORD INVALID caught) |
| LS-5 | Window acquire / refuse: A syncs (each of `none` / F / R in separate fixtures) at D; B's `resync` (each mode) → refused `S6` naming A and A's ts; B's slot and refs unchanged; `refuse` line (→ S6 removed → caught; → S6 placed after the mode-`none` return → B mode `none` slips through → caught) |
| LS-6 | Holder re-sync: A runs `resync` again (mode `none`) → ok, still holder |
| LS-7 | Release by `land ok`: A lands → B's `resync` succeeds with `base` = new `branch-dev` (→ derivation ignores `land` → caught) |
| LS-8 | Release by `cleanup ok` (A landed, pushed to the fixture's bare origin, cleaned) → B may sync (→ derivation ignores `cleanup` → caught) |
| LS-9 | `window-release`: from a slot cwd → refused W1; non-holder → refused W2 naming the real holder; holder → `ok` line, B may then sync; no ref, record or approval file changed (→ W2 removed → caught) |
| LS-10 | Implicit release: `branch-dev` advanced by a direct commit (fixture, simulating an Owner-terminal move) → no holder; A's `land` refuses L3 "moved" exactly as today; A's `resync` succeeds (mode R) and re-acquires |
| LS-11 | L3b: B holds; A's `land-request` and `land` → refused `L3b` naming B; no approval line printed; no `ok` audit. No holder → `land-request` stdout and report object byte-identical to today; A holder → report has `window` and the printed line (→ L3b removed → caught; → `window` field emitted with no holder → caught) |
| LS-12 | `brief-request` with a holder → exit 1; stderr is exactly the one `BW` diagnostic naming the holder task and its ts; stdout empty (no approval line); no approval file, no audit line, no ref moved. Without a holder → stdout/stderr byte-identical to today (→ BW removed → caught; → an approval line printed alongside the diagnostic → caught) |
| LS-13 | Every new success and refusal path: on a refusal `main`, `branch-dev`, `origin/*` and the task ref are byte-identical; no approval record written; no push; a planted git hook is not executed (extends RS-8 / RS-9) |
| LS-14 | End to end: A and B fork at D; A: 9.4 checkpoint → 9.5 mode R (acquire) → B 9.5 refused `S6` → A `land-request` + `land` → B 9.5 mode R ok (base D1) → B `land-request` + `land`. Audit `ok`/`refuse` sequence exactly `resync(A) refuse(B,S6) land(A) resync(B) land(B)` (→ any step reordered → caught) |
| LS-15 | A malformed or truncated line among the window lines → skipped; the derivation stays correct (→ a throw on parse → caught) |
| LS-16 | **Pre-issued approval loophole (R11-W), real git:** C's brief staged in the fixture canonical at `branch-dev` D → `runBriefRequest` prints the line → the fixture writes `pt-brief-approval` with that payload (the Owner's `!`) → A runs `resync` (mode `none`) and acquires → the R11 commit of C's brief (`git commit -m "docs(work): add c brief"`, canonical cwd) is decided by the hook's exported `decide()` with **real readers** (`CLAUDE_PROJECT_DIR` pointed at the fixture canonical for the call, the `r11DecideOn` pattern) → **deny `R11-W`** naming A and A's ts; `branch-dev` still D; A's and C's refs unchanged; the approval file byte-identical; audit log unchanged (the hook writes none); the brief still staged. Then `window-release task/A` → the same decision → **allow** (record consumable, `branch-dev` unchanged). Variant: A lands instead → the decision is the existing `stale parent` deny (→ step 5b removed → the frozen approval is consumed while A holds → caught; → 5b keyed on `record.oid` instead of `status.oid` → caught by AH-28's base ≠ D row) |
| LS-17 | **Derivation parity:** the tool's `windowHolder` and the hook's `windowHolderFs` return the same result on each audit fixture used by LS-5…LS-10 and LS-15 (none / A / released / landed / cleaned / malformed) (→ one side ignores `window-release` → caught) |
| RS-5 | section filled: "Mode R dirty slot" = LS-1 (disjoint carried) + LS-2 (overlapping refused) |
| RS-7 | section filled: "already up to date" → exit 0, nothing changed except the one `mode:'none'` audit line (= LS-4) |

**`qa/auto_mode_hardening_offline.js`:**
- **AH-27:** allows exactly `node .claude/hooks/pt-land.js window-release task/<id>` (slot and canonical cwd at hook
  level; the tool enforces canonical); denies trailing space, env prefix, wrappers, a missing task, a non-`task/` ref
  and an unknown verb. The R12 differential changes decisions only on the new rows.
- **AH-28 (R11-W, injected `windowHolder`):** with a valid record, `canonicalStatus.oid = D`, one staged brief entry
  and a matching hash: an audit fixture with A's `resync ok` at base D → **deny `R11-W`** naming A (exact reason text;
  no "normal terminal" suffix); the same plus a later `land ok` for A → the byte-identical existing allow; plus a later
  `window-release ok` → allow; plus a later `cleanup ok` → allow; A's `resync ok` at a base ≠ D → allow; missing log →
  allow; reader throws → deny `R11-W: the landing-window state could not be read`; a malformed line before A's →
  still deny. The R11 differential changes decisions only on rows with a holder (→ 5b removed → caught; → 5b keyed on
  `record.oid` → caught by the base ≠ D row).

**Replays (heavy, each with the Owner's heavy-lane go-ahead):** GC-4 in its resumable batches — identical except the
authorised `resync` mode-R transcripts (§7); the FT heavy rows (`buildFixture` of the resync suite changes → FT-2
replays); then the two re-pins.

**Full `qa:offline`:** the step-0 count, unchanged.

## 10. Skills and pre-flight

- **Skills:** `pt-offline-suite` **Required** (digest pins, re-pins with real-replay proof, planted negatives, the
  CRLF-safe `AGENTS.md` edit). `/plan` is mandatory. The Worker launches Codex itself (AGENTS.md step 8).
- **CLAUDE.md pre-flight:**
  - **Pattern audit:** `runResyncCore` mode F (F1–F3 snapshot / keep / verify, reused by mode R); `runLandCore`
    L-step refusals and `report` shape; `runBriefRequestCore` (canonical-only, writes nothing); `runTaskStartCore`
    (canonical-only verb, lock, audit append); `briefCommitGate` injected readers (`briefApproval`, `canonicalStatus`)
    and the AH-19 harness.
  - **State isolation:** no `index.html`, `localStorage`, scoring or Deep Dive surface; writes only `pt-land-log` and,
    through `reset --keep`, the task slot.
  - **Gate verification:** no client or server feature gate. The equivalent guards are: canonical-only callers, the
    single tool lock, the audit-derived holder, and the Owner's existing single-use records (unchanged).
  - **Definition of Done:** the shapes in §3, §4, §5 and the §9 rows.

## 11. Flow, STOP, Definition of Done

**Flow (Manual, Worker B):**
1. Step 0 (heavy go-ahead for the baseline full run; `--print-record` check).
2. `/plan`.
3. Tests first (LS and AH rows failing).
4. Tool, hook and `AGENTS.md` candidates under `<os.tmpdir()>/pt-late-sync-1/protected/`.
5. Targeted QA.
6. GC-4 / FT replays and the two re-pins (heavy go-ahead).
7. Codex; FIX / DEFER / REJECT.
8. Step 10 full run (heavy go-ahead).
9. 10a: `none`.
10. `review.md`, then the final Codex check.
11. Task commit (ordinary files).
12. **Step 13a PROTECTED gate** (one Owner line).
13. Integrity (record mode).
14. LAND request → Owner line → LAND.
15. Push request → Owner line → push.
16. Cleanup.

- **First real use:** the next two parallel tasks, verified by COWORK (A acquires, B waits, A lands, B syncs).
- **Survivability:** a GC-4 memory-floor stop is not a failure (rerun; batches resume); a replay **mismatch** outside
  the authorised `resync` mode-R transcripts is a STOP, never a re-pin; one heavy run at a time.

**STOP (in addition to STOP-1..6):**
- a new git call in `land-request`, `land`, `brief-request`, `window-release`, mode `none` or the R11 gate;
- any change to L1–L16 other than L3b and the holder-only `window` field;
- any change to R11 beyond step 5b — its steps 1–7, reason texts and order stay byte-identical;
- any change to C1–C7, push P1–P12, R13, r9, R3g, R3m, R10-*, `cleanup` K1–K9, `task-start` / `adopt*`;
- a path that moves `main`, `branch-dev` or `origin/*`, pushes, or writes an approval record;
- the ATB record schema or validity rule changed, or a `recordSha256` on a mode-`none` line;
- a transcript re-record beyond the `resync` mode-R scenarios;
- any `settings.json`, `run-offline.js` or `package.json` edit;
- `AGENTS.md` wording beyond A1–A8, or EOL churn in it;
- any edit to `pt_land_offline.js` or `task_base_offline.js`;
- any classifier, merge-tree, replay-ref, reapprove, waiver, attestation or queue code.

**Definition of Done:**
- §3–§5 exact;
- LS-1…LS-17, RS-5 / RS-7 filled, AH-27 and AH-28 PASS with every negative caught;
- TB-12b, PL-1, TB-13, TB-19 and AH-19 PASS unmodified;
- GC-4 and FT replays identical except the authorised `resync` mode-R transcripts, with both pins updated;
- full `qa:offline` = the step-0 count;
- Codex: no unresolved Class I;
- protected files in through step 13a;
- LANDed, pushed, cleaned.

## 12. Placement conditions (checked 2026-10-10 before placing; all hold)

- **P-1** `task-base-record`, `nlm-consistency-1` and `backlog-masters-1` LANDed, pushed, cleaned; both slots detached
  and clean (A at `900c56d`, B at `eb1f6dc`) — **met**.
- **P-2** `git diff beaa68f <branch-dev> -- <§8 files>` empty — **met** by construction at placement; re-check at handoff.
- **P-3** no 3A-L or other digest-pinned task placed or running — **met**.
- **P-4** canonical checkout clean — **met**.
- **P-5** no landed assertion pins mode-`none` audit silence or the `land-request` report shape (§0) — **met**; the
  conditional eighth file (`qa/task_base_offline.js`) is **not** in scope.
- **P-6** no `resync ok` line in `pt-land-log` with `base == beaa68f` — **met** (the latest `resync ok`, for
  `nlm-consistency-1`, has base `eb1f6dc`; no task is the holder on day one).

## A. Anchors at `beaa68f` (by name; line numbers indicative)

| File | Anchor | Line |
|---|---|---|
| `pt-land.js` | header verbs · `resolveL3` · `readAuditEntries` · `runLandCore` / `l3` / `if (!doLand) return` · `runBriefRequestCore` / approval line · `keepReset` · `uncommittedSnapshot` · `runResyncCore` · S4 · S5 mode-`none` return · `finish` · mode F · R1 · `printLandRequest` · `printResync` · `output` · `main` · `module.exports` | 8–10 · 339 · 407 · 506 / 527 / 576 · 797 / 839 · 1300 · 1303 · 1373 · 1441–1443 · 1448 · 1458 · 1496–1517 · 1520–1523 · 1875 · 1907 · 1923 · 1947 · 2011 |
| `pretooluse-guard.js` | `R12_FORM_RE` · `r11Deny` · `briefCommitGate` · step 5 · step 6 · `DEFAULT_DEPS` · `decide` · `module.exports` | 1346 · 1423 · 1427 · 1458–1469 · 1471 · 1491–1502 · 1622 · 1738 |
| `AGENTS.md` | step 9 / 10 · step 14 · brief-request sentence · Test commands · Second LAND bullet · Protected actions exception · slot model `task-start` sentence | 76–78 · 147, 149 · 447–453 · 494–496 · 552–557 · 573 · 585 |
| `qa/pt_land_resync_offline.js` | RS-5 / RS-6 / RS-7 headers (no assertions) · RS-8 | 405–409 · 412 |
| `qa/auto_mode_hardening_offline.js` | AH-19 harness `depsR11` / `r11DecideOn` | 2004–2042 |
| `qa/task_base_offline.js` | `BASELINE_COMMIT` · TB-12b · TB-13 · TB-19 | 35 · 698 · 724 · 1097 |
| `qa/pt_land_offline.js` | PL-1 | 225–236 |
| `qa/git_contract_offline.js` · `qa/fixture_template_offline.js` | `GIT_CONTRACT_PIN` · `TEMPLATE_CONTRACT_PIN` / FT-2 | 396 · 226 / 339 |
