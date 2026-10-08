# Task brief: task-base-record — a recorded actual task base is the runtime baseline for integrity, resync and LAND

This brief has operational effect only when the Owner has approved these exact contents and the brief-only
commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Backlog | **none** — workflow tooling (precedent: `second-finisher-resync`). It removes the cause of the step-13 integrity FAILs that today need an Owner ruling whenever `branch-dev` advances normally during a task |
| Baseline | `0560632110171e4253a8a5f0ff0dd3ce55f0dd91` = `branch-dev` (R-3 brief recorded); `origin/branch-dev` = `a183db8`; `main` = `origin/main` = `fbec2c193346d7afd1dab6fd11a46b5efe55238b`. Anchors verified at `0560632`: `pt-land.js` (1674 lines; `resolveL3` :328, `runLandCore` :495, `runCleanupCore` :1080, `runResyncCore` :1335, `printResync` :1575, `main` :1610), `guard_integrity_check.js` (262 lines; `parseArgs` :39, `runIntegrity` :109), hook `R12_FORM_RE` :1346, `AGENTS.md` :45, :135, :153, :507, :556, :583–585. **Valid at any later `branch-dev` tip where `git diff 0560632 <tip>` is empty for every file in §8** (R-3 and B2-auto change none of them) |
| Branch / slot | `task/task-base-record`, the **next free Worker slot** (both are busy at `0560632`: A = R-3, B = B2-auto) |
| Mode | **Manual** — DENY-tier tool and hook, ASK-tier `AGENTS.md`; they go in through the PROTECTED gate (step 13a) |
| qa:offline | the step-0 count → **+1** (`qa/task_base_offline.js`; `run-offline.js` discovers it, so `run-offline.js` and `package.json` are not changed) |
| Parallel with | the other slot's task, if it changes none of §8. **Never with 3A-L** (ATB-D5: shared `git_contract` / `fixture_template` pins). Heavy runs are serialised (one heavy run on the laptop at a time) |
| Status | FINAL on Owner approval; ATB-D1…D5 ruled 2026-10-08; ATB goes first, 3A-L follows |

**Objective.** Bootstrap records the task's real fork point once, at handoff. Integrity, resync and LAND all read
that record. A Worker no longer types a baseline. A normal `branch-dev` advance during the task (a logged LAND, an
added brief) no longer fails integrity. `main` stays strict, and a rewind, force-move or unexplained advance still
fails.

## 0. Situation (verified 2026-10-08, read-only)

- AGENTS.md step 13 (:135) tells the Worker to pass `--base-dev <brief base> --since <task-start ISO>`.
  `guard_integrity_check.js` then requires:
  - **C1** `branch-dev == --base-dev`;
  - **C2** no reflog entry on `main` / `branch-dev` / `origin/*` after `--since`;
  - **C6** `diff --base-dev...task` free of protected paths. A pre-brief planning baseline therefore also shows the
    task's own `work/<id>/brief.md`, which is never exempt.
- **A live example.** B2-auto forked at `312c34b`. `branch-dev` then advanced:
  - `a183db8`, the R-2 LAND through `pt-land.js`, logged in `pt-land-log`;
  - `0560632`, the R-3 brief-only commit.

  Under today's step 13, C1 and C2 FAIL for B2-auto without anything being wrong. Under this brief it PASSes, and
  LAND still requires the resync (Second LAND), unchanged.
- LAND (L10) and push (P7) already derive their own bases. `resync` prints new `--base-dev` / `--since` values
  (AGENTS.md :556). Only the Worker-typed step-13 value is unguarded, and nothing binds a task to its fork point.

## 1. Owner rulings (2026-10-08, not reopened)

- **ATB-D1:**
  - `branch-dev` may advance during an active task only when every move is explained by governed evidence;
  - `main` stays strict;
  - any rewind, force-move or unexplained advance fails.
- **ATB-D2:** a brief-only commit counts as an explained move only when its diff is limited to **adding** the approved
  `work/<id>/brief.md`. Approval is enforced when the brief is committed (R11 or the Owner's terminal); integrity
  checks the shape.
- **ATB-D3:** Bootstrap runs the write-once `task-start` record at Worker handoff. The recorded actual task base is
  the runtime source of truth for integrity, resync and LAND.
- **ATB-D4:** adoption of already-open tasks is included. It is explicit, Owner-controlled (a single-use Owner
  record) and marked `adopted`.
- **ATB-D5:** this task and 3A-L are serialised; this task first.
- **Intent:**
  - the brief's Baseline row stays planning / pin information;
  - the record is runtime information;
  - normal `branch-dev` advances need no Owner ruling;
  - resync updates the record through the governed path;
  - LAND refuses a stale or unresynced record.
- **Unchanged:**
  - the R12 approval model (LAND / PUSH / PROTECTED / BRIEF lines);
  - r9, R11, R13, R3g, R3m, R10-*;
  - push P1–P12;
  - the 2026-09-29 ruling (AGENTS.md :138) for FAILs this brief does not explain (§4.5).

## 2. The record

**Path:** `<git-common-dir>/pt-task/<enc>.json`, where `<enc>` = `encodeURIComponent(<id>)` (`<id>` = task name
without `task/`). It is untracked and lives inside `.git`, which the hook already denies every tool to write
(R10-3c / R10-6).

**Format:** UTF-8 JSON, `JSON.stringify(record, null, 2) + '\n'`:

```json
{
  "schema": "pt-task-base/v1",
  "task": "task/<id>",
  "base": "<40-hex: current runtime base; = history[last].to>",
  "mainAtStart": "<40-hex>",
  "originDevAtStart": "<40-hex | null>",
  "startedAt": "<ISO-8601 UTC, tool clock>",
  "briefPath": "work/<id>/brief.md",
  "briefSha256": "<64-hex of the brief blob at history[0].to>",
  "briefCommit": "<40-hex: last commit at or before history[0].to touching briefPath>",
  "adopted": false,
  "history": [ { "ts": "<ISO>", "verb": "task-start|adopt|resync", "mode": "F|R|null", "from": "<40-hex|null>", "to": "<40-hex>" } ]
}
```

- **Start base** = `history[0].to`, the fork point. **Base** = `history[last].to`, the latest resync.
- **Write-once:** created only by `task-start` or `adopt` (open flag `wx`). After that it is changed only by
  `resync`, and moved by `cleanup`.
- **Audit chain:** every write appends an `ok` line to `pt-land-log` that carries
  `recordSha256 = sha256(record file bytes)`. A record is **valid** only if:
  - its schema and fields check (oids 40-hex; `task` matches `TASK_RE` and the requested task; `history` is
    non-empty; `history[0].verb` is `task-start` or `adopt`; `base == history[last].to`);
  - its sha256 equals `recordSha256` of the **latest** `ok` audit line for this task with verb `task-start`, `adopt`
    or `resync` **that carries `recordSha256`**.

  Otherwise it is **RECORD INVALID** and everything that reads it fails closed.

## 3. `pt-land.js` changes (DENY-tier; via step 13a)

All new verbs run **from the canonical checkout only** (as `brief-request`). They never move a ref, push, commit, or
write an approval record.

**3.1 `task-start task/<id>`** (Bootstrap, at handoff, right after `git -C <slot> switch -c task/<id> branch-dev`).
- **T1:**
  - the caller is canonical;
  - self-integrity (as L2);
  - no `GIT_*` overrides;
  - config and hooks clean;
  - canonical on `branch-dev` and clean (`canonicalClean`).
- **T2:**
  - `refs/heads/task/<id>` exists and is checked out in exactly one Worker slot;
  - its tip **equals** `refs/heads/branch-dev`.
- **T3:** `work/<id>/brief.md` exists at the tip.
- **T4:** no record exists for `<id>`.
- **T5:** take the tool lock (`pt-land.lock`). Write the record with:
  - `base` = tip;
  - `mainAtStart`;
  - `originDevAtStart` (`refs/remotes/origin/branch-dev`, or `null`);
  - `startedAt` = now;
  - the brief fields;
  - `adopted:false`;
  - `history[0] = {ts:startedAt, verb:'task-start', mode:null, from:null, to:base}`.

  Then append `{ts, verb:'task-start', task, from:null, to:base, result:'ok', reason:null, recordSha256}`.
  **If the audit append fails, delete the record and refuse — nothing is recorded.**
- **Prints:** `TASK-START task/<id>` with `base`, `main`, `startedAt`, `brief sha256`, the record path, and the
  Worker's step-13 command (§6 A2).
- A refusal changes nothing and appends a `refuse` audit line (as `resync`).

**3.2 `adopt-request task/<id>` and `adopt task/<id>`** (ATB-D4; this implements the "--adopt" of the ruling with the
existing request/execute + single-use record pattern).
- **adopt-request:**
  1. Run T1 and T4.
  2. Check the task branch exists in exactly one Worker slot.
  3. Derive:
     - `base` = `merge-base(branch-dev, task)`. Refuse if there is a merge commit in `base..task`.
     - **If the audit log has an `ok` `resync` line for this task:** `base` must equal its latest `base`, else
       refuse "rebased outside resync: Owner". `startedAt` = that line's `ts`.
     - **Otherwise:** `startedAt` = the oldest reflog entry of `refs/heads/task/<id>` whose message begins
       `branch: Created from`. Missing → refuse.
     - `mainAtStart` = current `main`.
     - `originDevAtStart` = the value of `origin/branch-dev` at `startedAt` from its reflog. Unreadable → refuse.
     - The brief fields at `base`.
  4. Print every derived value and the line
     `approvalLine('adopt', 'ADOPT task/<id> <base> <startedAt>', commonDir)`.
  5. Write nothing.
- **adopt:**
  1. Re-derive; the values must be identical.
  2. `parseRecord(readRecordFile(commonDir,'pt-adopt-approval'),'ADOPT')` must match task, base and startedAt;
     else refuse "no/stale ADOPT approval".
  3. Lock.
  4. Write the record with `adopted:true` and `history[0].verb = 'adopt'`.
  5. Delete the approval file (single-use).
  6. Append the audit line `{verb:'adopt', …, recordSha256}`.
- `parseRecord` gains the `ADOPT` kind (4 fields: `ADOPT`, task, oid, ISO with no space).

**3.3 `resync task/<id>`** (record present).
- In `finish()`, **before** the audit append:
  - set `base = dev`;
  - push `{ts:resyncTime, verb:'resync', mode, from:<old base>, to:dev}`;
  - write the record atomically (temp file + rename in `pt-task/`).
- The `ok` audit line gains `recordSha256`.
- A record that is invalid at S1 → refuse "RECORD INVALID" before any change.
- A record write failure after the slot moved → `{ok:false}` "R-REC: record update failed - STOP (Owner)". LAND then
  refuses (§3.4).
- **Prints** the next integrity step in the record form (§6 A2) instead of the `--base-dev/--since` form.
- `mode 'none'` (already up to date): record unchanged.
- **No record:** behaviour, output and audit line are **byte-identical to today** (RS-1…RS-13 unchanged).

**3.4 LAND, inside L3** (after the existing `resolveL3` result; check IDs and report shape unchanged).
- If a record exists:
  - it must be valid, else refuse `L3: RECORD INVALID`;
  - `record.base` must equal `l3.base` (= `branch-dev`), else refuse
    `L3: RECORD MISMATCH: recorded task base <base> != branch-dev <oid> - resync through pt-land.js resync`.
- L10 passes `commonDir` to `runIntegrity`, which then runs in record mode (§4).
- **No record:** L3 and L10 are unchanged, with the same Git calls.

**3.5 `cleanup`:** after K9 succeeds, move a present record to `pt-task/archive/<enc>.<nowStamp>.json`.
- A move failure is a warning; it never undoes the cleanup.
- The `ok` audit line gains `recordArchived:true` only when a record existed.

**3.6** The header comment and `module.exports` gain `runTaskStart`, `runAdoptRequest` and `runAdopt`. `main()` gains
the three verbs, with the usage errors shaped as today.

## 4. `qa/guard_integrity_check.js` — record mode

**4.1 Selection.**
- `--task` given:
  - common dir = `opts.commonDir`, else `git rev-parse --git-common-dir` from `--root`, or from cwd;
  - **a record present → record mode**;
  - **absent:**
    - with `--base-dev` and `--base-main` → **legacy mode**: today's behaviour, plus one stdout line
      `WARN: no task-base record (legacy mode)`;
    - without them → usage error (exit 3).
- No `--task` → legacy, unchanged (push P7 and AH-18 rows unchanged).
- `parseArgs` keeps every existing flag and adds `--print-record`. `--base-*` are required only outside record mode.

**4.2 Validation, then mismatch — both before any check.**
- An invalid record → `RECORD INVALID: <reason>`, exit 1. No C-check runs.
- Then each supplied flag is compared with the record:
  - `--base-dev` vs `record.base`;
  - `--since` vs `startedAt` (by `Date.parse`);
  - `--base-main` vs `mainAtStart`.
- A difference prints to stderr
  `BASE MISMATCH: --base-dev <given> != recorded task base <record.base> (task/<id>, started <startedAt>). Re-run without --base-dev.`
  (`SINCE MISMATCH` / `MAIN MISMATCH` alike) and stdout `guard-integrity: FAIL (BASE MISMATCH)`, exit 1. **No
  C-check runs.**
- Equal values are accepted (compatibility).
- Module API: `{ok:false, mismatch:true, failures:[<that line>], report:[]}`.

**4.3 `--print-record`:** prints the validated record (pretty JSON) and `mode: task-record`, exit 0. Missing or
invalid → exit 1. It runs no C-check.

**4.4 Checks in record mode** (C3, C4, C5, C7 unchanged).

| Check | Record mode |
|---|---|
| **Chain** | from `S = history[0].to` to `D = branch-dev` — §4.5. The result is `points` (ordered) |
| **C1** | `main == mainAtStart`; the chain is fully explained; `record.base ∈ points` |
| **STALE** | `merge-base(branch-dev, task) == record.base`, else `RECORD STALE: task/<id> was rebased outside resync (merge-base <x> != recorded base <base>)` |
| **C2** | Entries after `startedAt`, oldest first, with the reflog's own oid per entry: `main`, `origin/main` and every other `origin/*` ref except `origin/branch-dev` → any entry FAILs (as today). `branch-dev` → each oid ∈ `points`, never at a lower index than the previous entry. `origin/branch-dev` → each oid ∈ `{originDevAtStart} ∪ points`, never decreasing (`originDevAtStart` ranks before `points`). Missing or empty protected reflog → FAIL (as today) |
| **C6** | `diff --name-only record.base...task`, with today's exemption and never-exempt rules |
| **C-remote** | `--remote`: origin `main == mainAtStart`; origin `branch-dev ∈ {originDevAtStart} ∪ points` |

**4.5 Explained chain (ATB-D1 / D2).**
1. `S` must be an ancestor of, or equal to, `D`. Otherwise FAIL
   `C1 branch-dev does not descend from the recorded start base (rewind or force-move)`.
2. There must be no merge commit in `S..D`.
3. `cur = S`. Until `cur == D`, take one step:
   - **(a) logged LAND:** the latest `ok` `land` audit line with `from == cur`, whose `to` is an ancestor of, or
     equal to, `D`, and `to != cur`. Then `cur = to`.
   - **(b) brief-only:** else take `c`, the first commit of `rev-list --reverse cur..D` (its parent is `cur`). It
     counts only if `diff-tree -r --no-renames --name-status c` is exactly one line, status `A`, with a path matching
     `^work/[a-z0-9][a-z0-9._-]*/brief\.md$`. Then `cur = c`.
   - **(c) otherwise** FAIL `C1 unexplained branch-dev advance at <c> - not a logged LAND from <cur> and not a brief-only addition`.

   Each step appends `cur` to `points`.
4. The report lists the steps: `REPORT: chain land:<from>..<to>` / `REPORT: chain brief:<oid> <path>`.

Anything not explained — an Owner-terminal LAND, a direct commit, a modified or deleted brief, an Owner-terminal
rebase of the task (STALE) — **still FAILs** and stays under the 2026-09-29 ruling (AGENTS.md :138).

**4.6 Report** (stdout, record mode):
- `REPORT: mode task-record task=<task> base=<base> startBase=<S> startedAt=<ISO> adopted=<bool>`;
- the chain lines;
- then `guard-integrity: PASS` or the usual FAIL lines.

## 5. Hook and settings

- `R12_FORM_RE` (`pretooluse-guard.js:1346`) gains exactly three alternatives, using the existing task-id pattern:
  `task-start task/<id>`, `adopt-request task/<id>`, `adopt task/<id>`.
- Nothing else in the hook changes.
- `.claude/settings.json` is **unchanged**: the new verbs prompt in Manual. Integrity is already allowlisted.

## 6. `AGENTS.md` (exact edits; each old text matches once at `0560632`)

- **A1 — step 0** (:45–46). After "with the task branch checked out." insert:
  " Then run `node qa/guard_integrity_check.js --task task/<id> --root <canonical checkout> --print-record`; a missing or invalid task-base record is **STOP-6** (Bootstrap runs `task-start`, or the Owner adopts the task)."
- **A2 — step 13** (:135). Replace
  "`node qa/guard_integrity_check.js --base-main <main oid> --base-dev <brief base> --task task/<id> --since <task-start ISO> --root <canonical checkout>`."
  with
  "`node qa/guard_integrity_check.js --task task/<id> --root <canonical checkout>` — base, start time and `main` come from the task-base record; never pass `--base-dev`, `--since` or `--base-main` (a value that differs from the record is a MISMATCH FAIL). A task without a record (opened before records existed and not adopted) uses `--base-main <main oid> --base-dev <actual task base> --task task/<id> --since <task-start ISO> --root <canonical checkout>` with the values from its handoff."
- **A3 — the `!` rule** (:153). Replace "(`brief-request`, `protected-request`, `land-request` or `push-request`)" with
  "(`brief-request`, `protected-request`, `land-request`, `push-request` or `adopt-request`)", and replace
  "where `<kind>` is `brief`, `protected`, `land` or `push`" with
  "where `<kind>` is `brief`, `protected`, `land`, `push` or `adopt`".
- **A4 — Two diffs** (:507). Replace "`<base>` — the `branch-dev` commit named in the brief —" with
  "`<base>` — the recorded task base (`--print-record`; for a task without a record, the `branch-dev` commit named in the brief) —".
- **A5 — Second LAND** (:556). Replace "(with the `--base-dev` and `--since` values `resync` prints)" with
  "(in the form `resync` prints; for a recorded task, `resync` also advances the record's base)".
- **A6 — Worker slot model** (:583–585). After "A slot is switched only when its working tree is clean." (wrapped across :584–585) insert:
  " Immediately after creating the task branch, Bootstrap runs `node .claude/hooks/pt-land.js task-start task/<id>` from the canonical checkout. It records once (write-once) the actual task base (the fork point), `main` and the start time in `.git/pt-task/` — the runtime baseline for integrity, resync and LAND. The brief's Baseline row stays the planning and pin baseline. A task opened before records existed gets one only through `adopt-request` / `adopt` after the Owner's single-use ADOPT line."

No other AGENTS.md wording changes. `CLAUDE.md` is unchanged, so its fingerprint in `instruction_layer_offline.js`
is unaffected.

## 7. Backward compatibility (requirements)

- **No record = today, exactly:**
  - every `pt-land.js` verb makes the **identical Git call sequence**, output and audit line;
  - `runIntegrity` without a record behaves as today (plus the single WARN line in CLI legacy mode with `--task`).
  - The recorded GC transcripts are **not re-recorded**. The GC-4 real-Git replay proves this. A transcript mismatch
    is a STOP, never a re-record.
- **Re-pins in their own diff, after full real replays** (the source digest changes because `pt-land.js` and
  `guard_integrity_check.js` change):
  - `GIT_CONTRACT_PIN` in `qa/git_contract_offline.js`: the source digest plus this run's environment digest;
  - `TEMPLATE_CONTRACT_PIN` in `qa/fixture_template_offline.js`: the same.
  - Nothing else in those two files changes.
- **Active tasks:** R-3, B2-auto and anything opened before this lands run in legacy mode with their handoff values,
  unless the Owner adopts them (§3.2).
- **This task itself** runs in legacy mode: its own step 13 uses the old canonical integrity module, and its LAND uses
  the old canonical `pt-land.js`. The handoff writes its actual task base and start time.

## 8. Files — exactly 8

```
.claude/hooks/pt-land.js            §3                                    PROTECTED (step 13a)
.claude/hooks/pretooluse-guard.js   §5 R12_FORM_RE                        PROTECTED (step 13a)
AGENTS.md                           §6 A1–A6                              PROTECTED (step 13a)
qa/guard_integrity_check.js         §4
qa/task_base_offline.js             NEW — §9
qa/auto_mode_hardening_offline.js   AH-26 rows (§9)
qa/git_contract_offline.js          GIT_CONTRACT_PIN only (§7)
qa/fixture_template_offline.js      TEMPLATE_CONTRACT_PIN only (§7)
```

Plus evidence `work/task-base-record/review.md` (`## Backlog reconciliation: none`; the LAND-EVIDENCE line).

**QA suites that read in-scope files as text:**
- `git_contract_offline` / `fixture_template_offline` (digests → re-pinned, §7);
- `pt_land_offline`, `pt_land_resync_offline`, `run_isolation_offline` (copy or hash the real tool and integrity
  module into fixtures and hash-compare them to themselves; they survive);
- `auto_mode_hardening_offline` (AH-18 integrity, AH-20/23/25 forms; they survive and AH-26 is added).

<!-- protected-scope:begin -->
.claude/hooks/pt-land.js
.claude/hooks/pretooluse-guard.js
AGENTS.md
<!-- protected-scope:end -->
<!-- land-scope:begin -->
.claude/hooks/pt-land.js
.claude/hooks/pretooluse-guard.js
AGENTS.md
qa/guard_integrity_check.js
qa/task_base_offline.js
qa/auto_mode_hardening_offline.js
qa/git_contract_offline.js
qa/fixture_template_offline.js
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/task_base_offline.js
node qa/auto_mode_hardening_offline.js
node qa/pt_land_resync_offline.js
node qa/git_contract_offline.js
node qa/fixture_template_offline.js
<!-- land-tests:end -->

## 9. QA — `qa/task_base_offline.js`

Real-Git fixtures. The header follows `qa/pt_land_resync_offline.js`: `run-tmp` isolate (`ptqa-tb-`) and
`spawn-meter`; the fixture carries a committed copy of the tool and the integrity module. **Every row has a planted
negative.**

| ID | Assertion (→ planted negative) |
|---|---|
| TB-1 | Brief baseline == task base: `task-start`, a task commit, integrity `--task` → PASS, `mode task-record` (→ record base edited → RECORD INVALID) |
| TB-2 | Brief baseline older than the task base (a logged LAND + another brief between): `record.base` = the fork tip ≠ brief pin; PASS; C6 excludes the earlier files (→ legacy run with the brief pin shows C6 `work/<id>/brief.md`) |
| TB-3 | `branch-dev` advances after start by a logged LAND → PASS with `chain land:` (→ that audit line removed → C1 unexplained; → the same advance by a direct commit → FAIL) |
| TB-4 | `branch-dev` advances by a brief-only addition → PASS with `chain brief:` (→ the commit also adds a 2nd file; → it modifies an existing brief; → it adds `work/x/notes.md` → each FAILs) |
| TB-5 | The task's own brief-only commit before start is not a move and not in C6 → PASS (→ the record start base set before the brief commit → C6 FAIL) |
| TB-6 | Wrong `--base-dev` → `BASE MISMATCH` naming the recorded SHA, exit 1, no `C` output, module `mismatch:true` (→ the check moved after the scan → caught) |
| TB-7 | Wrong `--since` / `--base-main` → SINCE / MAIN MISMATCH; equal values → PASS (→ equality check removed) |
| TB-8 | Rewind / force-move: `branch-dev` reset back then forward → C2 FAIL (decreasing); moved to an off-chain commit → C1 FAIL (→ monotonic check removed) |
| TB-9 | `main` moved after start → C1 and C2 FAIL (→ `main` relaxed like `branch-dev` → caught) |
| TB-10 | No record: `--task` without `--base-*` → exit 3; with them → legacy result identical to the baseline module's on the same fixture, plus the WARN line (→ legacy path altered) |
| TB-11 | Malformed JSON / missing field / sha ≠ latest audit `recordSha256` / no audit line → RECORD INVALID, no scan (→ sha check removed) |
| TB-12 | Resync with a record, mode F and mode R: `base = dev`, history +1, audit `recordSha256` matches, printed next step is the record form, integrity PASS after (→ record not updated → L3 MISMATCH). Without a record: output and audit byte-identical to the baseline tool |
| TB-13 | LAND: recorded and resynced → `land-request` + `land` fast-forward; task rebased outside resync → `L3: RECORD MISMATCH`; invalid record → `L3: RECORD INVALID`; `branch-dev` advanced without resync → today's "Second LAND" reason (→ L3 record check removed) |
| TB-14 | Integrity on a task rebased outside resync → RECORD STALE (→ STALE check removed) |
| TB-15 | `task-start` refusals, each changing nothing: from a slot; record exists (bytes unchanged); branch missing; tip ≠ `branch-dev`; brief missing; branch in no slot; canonical dirty; lock held; audit append fails → no record left (→ write-once dropped) |
| TB-16 | `adopt-request` prints the derived base / startedAt and the exact line and writes nothing. `adopt`: refuses without or with a stale approval; with a valid one → `adopted:true`, approval file deleted, audit line. Refuses on a missing creation reflog, a merge commit, an existing record, or a resynced task whose base ≠ its latest resync base. Uses the resync ts as `startedAt` when resynced (→ the approval check removed) |
| TB-17 | `cleanup` archives the record; a no-record cleanup is unchanged (→ archive skipped) |
| TB-18 | `task-start` / `adopt*` / integrity never move a ref: `main`, `branch-dev`, `origin/*` and the task ref are byte-identical before and after; no approval record written (→ a planted ref move is detected) |
| TB-19 | End to end: fork at P; another task LANDs (logged) and a brief is added; the task commits; integrity with no flags PASSes; LAND refuses (Second LAND); resync; the record advances; integrity PASSes; LAND ok |

**Hook (`auto_mode_hardening_offline.js`):** AH-26 allows the three exact forms from slot and canonical cwd, and
denies trailing space, env prefix, wrappers, a missing task, a non-`task/` ref and an unknown verb. The R12
differential changes decisions only on the new rows.

**Replays (heavy, each with the Owner's heavy-lane go-ahead):**
- GC-4 in its resumable batches, all identical;
- the FT heavy rows; then the two re-pins (§7).

**Full `qa:offline`:** the step-0 count + 1.

## 10. Skills and pre-flight

- **Skills:** `pt-offline-suite` **Required** (whole-file / digest pins, re-pins with real-replay proof, planted
  negatives). `/plan` is mandatory. The Worker launches Codex itself (AGENTS.md step 8).
- **CLAUDE.md pre-flight:**
  - **Pattern audit:** `runResyncCore` (refuse / audit / lock / verify shape); `runBriefRequestCore` (canonical-only,
    request line); `resolveL3` + `runLandCore` L12 (single-use record); `readProtectedCommitEntries` (audit-log
    reading in the integrity module).
  - **State isolation:** no `index.html`, `localStorage`, scoring or Deep Dive surface; writes only
    `.git/pt-task/**` and `pt-land-log`.
  - **Gate verification:** there are no client or server feature gates. The equivalent guards are: canonical-only
    callers, write-once, the Owner's single-use ADOPT record, and the record ↔ audit sha chain.
  - **Definition of Done:** the shapes in §2 and §4.

## 11. Flow, STOP, Definition of Done

**Flow (Manual):**
1. Step 0 (heavy go-ahead).
2. `/plan`.
3. Tests first.
4. Tool, hook and AGENTS.md candidates under `<os.tmpdir()>/pt-task-base-record/protected/`.
5. Targeted QA.
6. GC-4 / FT replays and re-pins (heavy go-ahead).
7. Codex; FIX / DEFER / REJECT.
8. Step 10 full run (heavy go-ahead).
9. 10a: `none`.
10. `review.md`, then the final Codex check.
11. Task commit (ordinary files).
12. **Step 13a PROTECTED gate** (one Owner line).
13. Legacy-form integrity.
14. LAND request → Owner line → LAND.
15. Push request → Owner line → push.
16. Cleanup.

- **First real use:** the next task's handoff (`task-start`), verified by COWORK.
- **Survivability:**
  - a GC-4 memory-floor stop is not a failure: rerun, and the batches resume;
  - a replay **mismatch** is a STOP, never a re-pin;
  - one heavy run at a time.

**STOP (in addition to STOP-1..6):**
- a no-record path whose Git calls, output or audit line change;
- any change to C3 / C4 / C5 / C7, push P1–P12, R11, R13, r9, R3g, R3m or R10-*;
- a new verb that moves a ref, pushes, commits, or writes an approval record;
- `main` relaxed in any way;
- an explanation source beyond §4.5 (a) / (b);
- a transcript re-record;
- any `settings.json`, `run-offline.js` or `package.json` edit;
- AGENTS.md wording beyond A1–A6;
- any edit to `pt_land_offline.js` / `pt_land_resync_offline.js`.

**Definition of Done:**
- §2–§6 exact;
- TB-1…TB-19 and AH-26 PASS with negatives caught;
- GC-4 and FT replays identical, with both pins updated;
- full `qa:offline` = step-0 count + 1;
- Codex: no unresolved Class I;
- protected files in through step 13a;
- LANDed, pushed, cleaned.

## 12. Placement conditions (COWORK checks before placing)

- **P-1:** a Worker slot is free (R-3 or B2-auto cleaned up).
- **P-2:** `git diff 0560632 <branch-dev> -- <the 8 files of §8>` is empty; otherwise re-pin first.
- **P-3:** no 3A-L task is placed or running.
- **P-4:** the canonical checkout is clean (no normalisation, reset or rewrite of CRLF-only files; STOP if dirty).
