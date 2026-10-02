# Review — owner-one-action-gates: one Owner `!` line per governance gate (G1 brief-request, G2 PROTECTED gate, G3 LAND of PROTECTED-approved files)

Brief: `work/owner-one-action-gates/brief.md` — §1–§7 approved at `5c711b1`; Owner-approved amendments §8
(`qa/guard_integrity_check.js` C6 exemption) at `f4ca125` and §9 (atomic `protected-commit`) at `58406c9`.
Baseline `b583da9` = `branch-dev` = `origin/branch-dev` (backlog-close-rule landed); main untouched at
`fbec2c1`. Mode: Manual throughout. No commit made; this review reports pre-commit evidence only. The task
was resumed in Worker B after a host reboot with every state fact recovered from disk (see "Step 0 and
resume").

## Summary

Implemented the three governance gates in the `pt-land.js` candidate — **G1** `brief-request` (read-only,
canonical only, R11's own predicate set, sha256 of the staged blob, prints the R11 approval line), **G2**
`protected-request` / `protected-commit` (manifest of flat candidates under `<os.tmpdir()>/pt-<id>/protected/`,
would-be tree built in a temporary index, approval bound to the exact tree OID; under §9 the commit is
created from the approved tree with `commit-tree`, the task ref moves by compare-and-swap, exactly the
targets are checked out from the new HEAD, tree / parent / index blobs / clean slot are verified, the ok
audit line is written before the single-use record is consumed) and **G3** the `land` L8 revision (a
protected path lands only when it is in both scope blocks, has an `ok` protected-commit entry whose `to` is
an ancestor of the tip with `to^{tree}` equal to the recorded tree, and its blob at the tip equals the blob in
that tree; `land-request` lists path / blob / approving tree) — plus the shape rule (one
`approvalLine(kind, payload, commonDir)`; LAND and PUSH lines byte-identical to before; payloads may not carry
`'`, `;`, `$`, a backtick or a newline). The hook candidate gains exactly the three R12 alternatives; the
settings candidate gains exactly the two allow entries. Under §8, `qa/guard_integrity_check.js` C6 exempts a
PROTECTED-approved hit under the same three conditions and never exempts `work/*/brief.md`, `CHECKPOINT.md`
or `.env*`, so a PROTECTED-approved hook or settings file LANDs end-to-end through the governed path.
`AGENTS.md` P1–P8 applied exactly. QA: PL-32..55 with the §8 end-to-end hooks LAND row and the §9 atomic /
compare-and-swap / live-index rows, MUT-OAG-1..9, AH-8 / AH-10 / AH-23 / AH-24 (+ CLI spawns), AH-18 C6 rows
+ an R10-8 mutant, the AGENTS.md text checks. Two Codex rounds on the implementation diff: three Class I in
round one (one REJECT with evidence, two FIX — one through the Owner-ruled §9), none in round two.

## Files changed

- Implementation (7): `.claude/hooks/pt-land.js`, `.claude/hooks/pretooluse-guard.js`, `.claude/settings.json`
  (these three are DENY-tier and Owner-applied via copy/hash — candidates and hashes below; the working tree
  still has the pre-task files), `qa/pt_land_offline.js`, `qa/auto_mode_hardening_offline.js`,
  `qa/guard_integrity_check.js` (§8), `AGENTS.md`
- Evidence (tracked): `work/owner-one-action-gates/brief.md`, `work/owner-one-action-gates/review.md`

The brief's "exactly 8" (§5 + §8) counts this `review.md`. There is no `land-scope` and no `protected-scope`
block by design (the diff touches protected paths and the gate it builds does not exist yet): the Owner
commits, LANDs and pushes this task.

## Owner-applied candidates (copy/hash)

Built in this session's scratchpad (`…\Temp\claude\C--Users-Owner-Documents-Project-pt-wt-worker-b\
422336b9-e389-4643-b0c8-baa7389fa676\scratchpad\oag\`) and copied to
`C:\Users\Owner\AppData\Local\Temp\pt-owner-one-action-gates\`. All three are CRLF, matching the working tree
(`core.autocrlf=true`; index LF).

| Target (real file, current sha256) | Candidate | sha256 | Lines |
|---|---|---|---|
| `.claude/hooks/pt-land.js` (`8262b5dd…c01c7`) | `oag_tool_candidate.js` | `3ee0e80dccc775403f8a40ada7c78148cda29296a8fef17726e597f112fd72c0` | 1347 |
| `.claude/hooks/pretooluse-guard.js` (`f8164904…08bd5`) | `pretooluse-guard.candidate.js` | `b7252ed047e050ef987ec81db289e69d666097cc57046d3a35433efab3184e56` | 1751 |
| `.claude/settings.json` (`68c9b50d…4426e`) | `settings.candidate.json` | `251b863ff2e00052bcf47fdb40fb93aa75ea7cf024089ea62809f8e6a024dacc` | 156 |

Hook candidate diff: the `R12_FORM_RE` line gains `brief-request work/[a-z0-9][a-z0-9._-]*/brief\.md` and
`(?:protected-request|protected-commit) task/<id>`; the R12 deny reason drops "four" ("not exactly one of
the permitted forms"). Nothing else. Settings candidate diff: `Bash(node .claude/hooks/pt-land.js
brief-request *)` and `Bash(node .claude/hooks/pt-land.js protected-request *)` added after the `cleanup *`
entry; `protected-commit`, `land`, `push` stay prompting. Nothing else.

## Step 0 and resume

- Current-guard check: PASS at task start (`task/owner-one-action-gates` descends from `branch-dev`;
  `git status --porcelain .claude` empty).
- Pre-edit `npm run qa:offline` baseline: **PASS** — completed before the host reboot (Owner-confirmed); the
  run's output and spawned-suite count did not survive the reboot (only an `EXIT=0` marker at 14:36). The
  count was re-measured by the final full run below (53 spawned suites — the same count the previous landed
  task recorded); no suite was added or removed by this task.
- Recovered from disk after the reboot: HEAD `5c711b1`, one surviving edit (the hardening-suite AH-8 /
  AH-10 / AH-23 / AH-24 block), three candidates dated 14:33–14:41 in the previous session's scratchpad,
  no `qa.log`, no PL-32..55, no AGENTS.md edits.
- STOP-6 disclosure: two R12 hook denials fired on read-only inspection commands (`wc`, `find`, `diff`)
  that named the tool file literally; inspection continued through Read/Glob and a shell glob. Reported to
  the Owner before any edit; Owner ruled 2026-10-02 "resume from brief §7 step 3"; the denied forms were
  not retried.
- M6 → Owner scope ruling (§8): the unchanged `guard_integrity_check.js` C6 refused every PROTECTED-approved
  hook/settings diff at L10, so G3 could not work end-to-end for the targets §2 lists first. Reported with
  the evidence (§1 objective, §2 allowed targets, §4 P3b, §6 L-G2/L-G3); the Owner ruled the file into
  scope; brief amended and re-pinned at `f4ca125` before that file was edited.
- Codex finding 2 → Owner ruling (§9): the live-index race in `protected-commit` was ruled a FIX; brief
  amended and re-pinned at `58406c9` before the mechanics were changed.

## Implementation notes and readings recorded

- **G1 `brief-request`** (`runBriefRequestCore`): canonical-only (`resolveCaller` kind `canonical`), HEAD
  `branch-dev`, `git status --porcelain=v2 --untracked-files=all` exactly one `1 A.`/`1 M.` `N...` entry
  equal to the requested path, path `^work/[a-z0-9][a-z0-9._-]*/brief\.md$` (else usage error 3), config
  (`configClean`) and hooks (`hooksClean`) clean, sha256 of `git cat-file blob :<path>` read as a Buffer.
  Writes nothing. R11 in the hook is unchanged; PL-34 proves record → plain commit → R11 with the real hook.
  - *Reading recorded (not a STOP):* "no `GIT_*` overrides" is implemented as **R11's own predicate pair**
    (`GIT_ENV_OVERRIDE_RE` + `R10_GIT_CONFIG_ENV_RE`, copied from the hook), not a blanket `/^GIT_/`. This
    Claude Code session's environment carries `GIT_EDITOR=true`, which R11 tolerates; a blanket check would
    make `brief-request` unusable from any Claude Code session. PL-33 plants `GIT_DIR`.
- **G2** (`protectedPreconditions`, `runProtectedRequestCore`, `runProtectedCommitCore`): Worker-slot only
  with HEAD on `refs/heads/task/<id>`; self-integrity; slot clean; brief unedited since `merge-base`;
  manifest valid (flat sources, safe relative targets, no duplicates, sources exist); every target in the
  brief's `protected-scope` block **and** in the allowed-target list, and never in the never-approvable list.
  `buildCandidateTree` sets `GIT_INDEX_FILE` only on its own child processes (`read-tree HEAD`,
  `hash-object -w --path`, `update-index --cacheinfo`, `write-tree`; the temp index dir is removed).
  Commit (§9): record parsed exactly (`PROTECTED`, task, HEAD), lock, race re-check, tree recomputed ==
  record tree, `git commit-tree <record tree> -p <recorded HEAD> -m "chore(protected): apply Owner-approved
  files (task/<id>, tree <12>)"`, `git update-ref refs/heads/task/<id> <new> <recorded HEAD>` (compare-and-
  swap; refuses `the task ref moved since the approval (compare-and-swap)`), `git checkout HEAD -- <targets>`,
  verification of `HEAD^{tree}`, `HEAD^`, each target's index blob against the record tree and a clean
  slot, **then** the ok audit line, **then** the record is deleted. The tool never runs `add`, `commit` or
  `write-tree` against the slot's index; the live index is never the source of the committed tree.
  - *Mechanics note (§9):* the three mutating children suppress hooks through the `GIT_CONFIG_COUNT` /
    `GIT_CONFIG_KEY_0` / `GIT_CONFIG_VALUE_0` triple (git's own carrier for `-c`, set only on those child
    processes exactly like `GIT_INDEX_FILE` on the request side; the inherited `GIT_*` environment stays
    stripped), so the argv starts with the subcommand — the §9 logging git shim is a node preload and node
    would consume a leading `-c` as its own flag. PL-44 plants `post-checkout` and `reference-transaction`
    as well as the commit hooks and proves none runs.
- **G3** (`diffCheck` / `protectedApproval`): never-allowed paths refuse first ("protected path: Owner
  LAND"); then both scope blocks; then the audit lookup (most recent `ok` protected-commit entry for the
  task whose `to` is an ancestor of the tip and whose `to^{tree}` equals the entry tree); then blob equality.
  - *Reading recorded (not a STOP):* a post-approval change refuses with the quoted text plus a
    parenthetical detail: `protected path not PROTECTED-approved: Owner LAND (<path>, changed after
    approval)`.
- **Shape rule:** `approvalLine(kind, payload, commonDir)` is the single producer; `buildLandApprovalLine`
  and `buildPushApprovalLine` delegate (PL-53 compares both against the literal pre-refactor templates).
  The dead `parseRecord(…, 'BRIEF')` branch of the recovered candidate was removed (R11's record carries no
  verb; the tool never reads it).
- **§8 C6** (`qa/guard_integrity_check.js`): the existing `STAGED_DENY_RES` filter line is kept verbatim
  (the R10-8 mutant anchors stay valid); `protectedApprovedInTask` applies the same three conditions and the
  never-exempt list; everything else fails exactly as before. C1–C5, C7, CLI and exports unchanged.
- **AGENTS.md P1–P8:** applied with the Edit tool (ASK-tier, one edit at a time); text checks 27/27 (each
  P-new present exactly once, each P-old absent, `13.` → `13a.` → `14.`, P6 keeps the literal `\n` in the
  printf shape, pure CRLF: 596 CRLF / 0 LF / 0 CR, `git diff` shows only the Worker-edited files).
- **PL-34 finding (hook, unchanged, out of scope):** a commit-gate allow never replaces the hook's default
  allow reason (`SEVERITY` tie), so an R11 allow reads "no restricted operation detected". The row proves
  the gate ran through planted negatives (no record → `R11: there is no valid Owner approval record`;
  tampered blob → `R11: the staged content does not match the approved hash`), then commits.

## QA

Every suite ran against the not-yet-applied candidates through the suites' own overrides
(`PT_LAND_TOOL_PATH`, `AH_HOOK_PATH`, `AH_SETTINGS_PATH`); the real DENY-tier files are unchanged until the
Owner copies the candidates in, after which the same suites are the post-copy evidence. Raw output in
`qa.log`.

| Run | Result |
|---|---|
| `qa/auto_mode_hardening_offline.js` vs hook + settings candidates (final) | **PASS 4086/4086** (AH-8 EXPECT_ALLOW, AH-10 filter, AH-23 forbidden `protected-commit`, AH-24 6 allow + 14 deny decide rows + R12→post-OAG differential + 3 allow / 5 deny CLI spawns, AH-18 C6: 1 PASS + 6 FAIL rows + non-ancestor + blob-changed + most-recent-wins + 3 never-exempt, R10-8 "C6 approval exemption forced true" mutant; the pre-existing "R12 form regex widened" mutant anchor moved to the post-OAG line). §9 does not touch this suite's inputs. |
| `qa/pt_land_offline.js` vs tool candidate `3ee0e80d…` (final) | **PASS 166/166** (PL-1..31 unchanged; PL-32..55 incl. the §8 end-to-end hooks LAND row, the Codex-FIX row and the §9 atomic / compare-and-swap / live-index rows; MUT-OAG-1..9) |
| AGENTS.md text checks (scratch `agents_textcheck.js`, final) | **PASS 27/27** (every P-new present once, every P-old absent, numbering, P6 literal `\n`, pure CRLF, diff limited to the §5+§8 Worker-edited files). The first `qa.log` capture reads 26/27: its one failing row was the scratch script's own "diff shows only §5 files" list, written before §8 added `qa/guard_integrity_check.js` — every AGENTS.md row passed in both captures; the list was updated and the final run appended at the step-12 self-check. |
| Full `npm run qa:offline` (with the three overrides) | **PASS, 53 spawned suites, 14 phases**, 1 pre-existing advisory warning (unchanged) |

Earlier runs recorded in `qa.log`: AH 4060/4061 against the recovered candidates (the one failure was the
R12 mutant anchor, fixed); PL 89/89 (recovered candidate, PL-1..31 only); PL 157/160 (first run of the new
rows: PL-34 reason assertion, PL-46 CRLF compare, MUT-OAG-7 assertion — all three test-side, corrected);
PL 160/160 (§8); PL 162/166 (first §9 run: four working-copy content compares read CRLF because
`core.autocrlf=true` rewrites the file on `checkout` — the blob, index and tree assertions all passed —
normalized like PL-46).

## Codex review (implementation diff, `codex exec --sandbox read-only`, codex-cli 0.157.0)

Inputs: the tracked implementation diff (`git diff <brief tip> -- . ':(exclude)work/' ':(exclude)BACKLOG.md'`),
the three candidate diffs and full candidates, the full brief. Raw output verbatim in `codex.md` (round 1,
then round 2 under `## Round 2`).

**Round 1 (after §8, before §9): 3 Class I, 0 Class II.** Verbatim:

> ## Class I findings
>
> - **`qa/guard_integrity_check.js:329` — §8, never-exempt paths.** `C6_NEVER_EXEMPT_RES` uses `/^\.env[\w.-]*$/i`, which does not match every `.env*` filename. For example, `.env$backup` or `.env ` can be exempted if the other approval conditions hold. The brief requires `.env*` to be never exempt.
>
> - **`.claude/hooks/pt-land.js` candidate: protected-commit path around `write-tree` and `commit` — §2 G2, exact-tree commit.** The lock coordinates `pt-land.js` callers, but it does not prevent another process from changing the slot index after `write-tree` matches the approved tree and before `git commit` reads that index. The post-commit check would detect a mismatched tree only after the commit has already happened. This leaves a race in the "commit without an exact tree match" guarantee.
>
> - **`.claude/hooks/pt-land.js` candidate: protected-commit audit append — §2 G2, step 7.** If `appendAudit` fails, the tool returns success with an `auditWarning` after consuming the record and making the commit. The required `ok` audit entry is then absent, so G3 and the C6 exemption cannot recognize the approval. The commit gate should not report successful completion when the required audit entry was not recorded.
>
> ## Class II findings
>
> None.

**Round 2 (after §9, on the final implementation diff): 0 Class I, 0 Class II.** Verbatim:

> ## Class I findings
>
> None. The reviewed changes satisfy the brief's §§1–9 requirements in the supplied diffs and candidates.
>
> ## Class II findings
>
> None.

Round 2 also states, verbatim: "All three round-one dispositions hold: the C6 `.env` regex concern is not a
C6 hit because the same pattern is in the unchanged `STAGED_DENY_RES`; the live-index race is addressed
structurally by `commit-tree` and CAS; and audit append failure now fails while retaining the record. I
found no remaining round-one issue."

### FIX / DEFER / REJECT ledger

| # | Finding (round 1) | Class | Resolution |
|---|---|---|---|
| 1 | C6 never-exempt `.env` regex misses `.env$backup` | I | **REJECT.** The exemption only ever sees a path that is already a C6 hit, and a hit is one that matches `STAGED_DENY_RES`, whose `.env` pattern is the same `/^\.env[\w.-]*$/i`. A name that escapes the never-exempt regex therefore escapes the hit filter too and is never evaluated by the exemption — there is no reachable case. The regex is also the exact text §8 specifies. Confirmed by Codex in round 2. |
| 2 | Index race between `git write-tree` and `git commit` inside protected-commit | I | **FIX (Owner-ruled, §9 at `58406c9`).** The commit is created from the approved tree OID (`commit-tree`), the task ref moves by compare-and-swap (`update-ref <ref> <new> <recorded HEAD>`), exactly the targets are checked out from the new HEAD, and tree / parent / index blobs / clean slot are verified; the live index can no longer alter the committed tree and the tool never runs `add`, `commit` or `write-tree` against it. Rows: PL-36 (atomic) with a logging git shim asserting the exact subcommands and arguments, PL-36 (CAS negative) with the shim advancing the ref right before `update-ref`, PL-36 (live index); mutants MUT-OAG-8 (CAS dropped) and MUT-OAG-9 (both slot-clean checks dropped); MUT-OAG-5 rewritten for §9. Confirmed by Codex in round 2. |
| 3 | Success reported when the ok audit entry could not be written | I | **FIX.** The ok entry is load-bearing for G3 and C6, unlike the informational land/push/cleanup lines. `runProtectedCommitCore` appends the entry **before** consuming the record; a failed append returns `ok:false`, exit 1, `G2: protected-commit made and verified (<from>..<to>, tree <tree>) but the approval audit entry could not be recorded (<err>) - STOP: without the ok entry the task falls back to an Owner LAND`, and keeps the record. Row PL-36 (Codex FIX): audit path made a directory → failure reported, commit present and verified, record kept, lock released, `land-request` then refuses at L8. Confirmed by Codex in round 2. |

DEFER: none. REJECT: 1 (finding 1). Unresolved Class I: 0.

## Final check

One final lightweight Codex check ran against the complete task diff (the implementation diff — byte-identical
to the round-two diff — plus this `review.md`; `brief.md` unchanged since its pin at `58406c9`). Raw output
appended to `codex.md` under `## Final check`. It reported **0 Class I** ("no additional Class I issue beyond
the three round-one findings already dispositioned") and **2 Class II**, both in this file: the tool
candidate's line count read 1353 (the pre-§9 count) where the final candidate has 1347 CRLF lines — corrected
above; and this section's placeholder — replaced by this text. Self-check done: every `work/<id>/` path named
here exists and is one of the five canonical files; every count matches a line in `qa.log`; no section reads
"Pending" or "TBD" (the `[backlog] … — pending routing` lesson line is the permitted exemption).

Final check: 1 round, 2 class-II findings fixed, self-checked; no implementation change, no QA re-run.

## Lessons

- [backlog]  `qa/pt_land_offline.js` `withMutantSource` creates one `ptland-mut-*` directory under
             `os.tmpdir()` per mutant row and never removes it (345 on this host at review time); a
             shared cleanup after the mutant fixture is built belongs in a QA-hygiene task — pending routing.
- [rule]     Destination-ready text for `AGENTS.md` "Worker execution contract" step 0: "Record the Step-0
             `qa:offline` result line (PASS/FAIL and spawned-suite count) in `work/<id>/qa.log` the moment
             the run finishes, before any other step — output that lives only in a background task's buffer
             does not survive a host reboot." (This task lost its Step-0 count that way.)
- [local]    Claude Code sessions carry `GIT_EDITOR=true`; any "no `GIT_*`" predicate must be R11's named
             pair, not a blanket prefix match (see "Implementation notes").
- [local]    A node-preload git shim (the CDX-1 pattern) cannot see a leading `-c`: node consumes it as its
             own flag. Hook suppression for shim-observed children goes through the `GIT_CONFIG_*` triple.
- [local]    `core.autocrlf=true` rewrites a file to CRLF on `git checkout`; a test that reads a checked-out
             file back must compare blob OIDs or normalise (PL-36 / PL-46), as the hardening suite's
             real-git rows already do with `-c core.autocrlf=false`.
- [covered]  A commit-gate allow in `pretooluse-guard.js` reports the hook's generic reason (equal-severity
             tie) — the hook's own AH-19 rows never assert on the allow reason; PL-34 follows that pattern.
- [local]    The Edit tool preserved CRLF on `AGENTS.md` and `brief.md` in every batch this session
             (byte-audited after each); the `grep $'\r'` audit is unreliable here and a byte scan is the only
             trustworthy check.
- [local]    After a host reboot the only trustworthy state is on disk: Git, the committed brief, the
             working-tree diff, and the previous session's scratchpad (outside the repo, keyed by session id —
             it has to be found, not assumed).

## Backlog reconciliation

- **Brief's Backlog row:** `none` — workflow/governance only; no `BACKLOG.md` entry is closed or changed by
  this task, and `BACKLOG.md` is in neither the file set nor any `land-scope`.
- **Action taken:** `none`.
- **Affected entries:** none — no heading or status text in `BACKLOG.md` was touched.
- **Confirmation:** `git diff --stat 58406c9` shows only `AGENTS.md`, `qa/auto_mode_hardening_offline.js`,
  `qa/guard_integrity_check.js` and `qa/pt_land_offline.js` (plus this untracked `review.md`); `BACKLOG.md`
  appears nowhere in the implementation diff, the QA results above, or the work being landed. The
  `[backlog]` lesson above is recorded as pending routing, not acted on.

## Post-copy evidence (the Owner applied the three candidates to Worker B)

The Owner copied the three approved candidates into the Worker B worktree only (not the canonical
checkout) and verified their hashes; the Worker then re-verified byte-for-byte and re-ran the suites
against the real files with no overrides (raw output in `qa.log` under `POST-COPY`):

| Check | Result |
|---|---|
| Byte verification (sha256 + `Buffer.equals` vs each candidate; CRLF counts 1347 / 1751 / 156) | **PASS** — `.claude/hooks/pt-land.js` `3ee0e80d…fd72c0`, `.claude/hooks/pretooluse-guard.js` `b7252ed0…184e56`, `.claude/settings.json` `251b863f…24dacc` |
| `qa/auto_mode_hardening_offline.js` vs the real hook + settings | **PASS 4086/4086** |
| `qa/pt_land_offline.js` vs the real tool | **PASS 166/166** |
| Full `npm run qa:offline` vs the real files | **PASS, 53 spawned suites, 14 phases**, 1 pre-existing advisory warning (unchanged) |

`node qa/guard_integrity_check.js` is not run before the step-13 commit: its C5 check reports the
still-uncommitted governance files in Worker B by design, and the post-commit result is LAND evidence
reported in the step-13 report, never here.

## Live checks (brief §6 "Also run"), post-LAND

- **L-G1** (the next brief-only commit uses one `!` line), **L-G2** (the next governance task is the first
  real PROTECTED run) and **L-G3** (that task's LAND is one `!` line) are exercised by the next tasks after
  the Owner has applied the three candidates and LANDed this task; they are not runnable inside this task
  (its own protected files predate the gate — §6, §7).

## LAND-EVIDENCE

LAND-EVIDENCE: qa-offline=PASS 53; targeted=PASS; codex-classI-unresolved=0
