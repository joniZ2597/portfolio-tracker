# review.md — R12 Worker LAND + push through the protected `pt-land.js` tool

Task: `task/worker-land-push`. Mode: Manual (brief lists ASK-tier `AGENTS.md`/`CLAUDE.md`; the two
DENY-tier files are Owner-applied candidates, never written by this Worker session).

## Files changed

- Implementation (7): .claude/hooks/pt-land.js, .claude/hooks/pretooluse-guard.js,
  qa/pt_land_offline.js, qa/auto_mode_hardening_offline.js, AGENTS.md, CLAUDE.md,
  qa/instruction_layer_offline.js
- Evidence (tracked): work/worker-land-push/brief.md, work/worker-land-push/review.md

## Step 0 evidence

- `git branch --show-current` → `task/worker-land-push`; clean at session start.
- `git log -1` → `a30ed21` (this brief's commit); local `branch-dev` == HEAD == `a30ed21`.
- Current-guard check: task branch descends from `branch-dev`; `git status --porcelain .claude`
  empty.
- `node_modules/` newer than `package-lock.json` — no `npm ci` needed.
- `npm run qa:offline` pre-edit baseline: **PASS, 51 spawned suites, 1 advisory warning.**

## What is implemented, and where

Per brief §11 step 4 and §12 ("A Worker write to `.claude/hooks/**`... is a STOP condition"),
**neither DENY-tier candidate was copied into the real paths.** Both were built and fully
validated in the Worker scratchpad; the Owner applies them after this review, via the copy/hash
workflow.

- **`pt-land.js` candidate** (NEW, §2–3): built directly (no prior real file to diff against),
  668 lines, exports `runLandRequest`, `runLand`, `runPushRequest`, `runPush`, `parseRecord`,
  `parseLandScope`. sha256 `d20cd81fc9c288ee4020c08694b447548b676d08813c8e14d29245fec88741b6`.
- **`pretooluse-guard.js` candidate** (R12 §4 only): built by a scratchpad script
  (`build_guard_candidate.js`) that reads the real file and applies exactly 2 anchored,
  uniqueness-checked string replacements (R12 consts; the `decide()` insertion point) — same
  technique R11 used, guaranteeing every byte outside the two edit regions is untouched.
  `diff -u` confirms exactly 2 `@@` hunks. sha256 of the real file (unchanged, for the Owner's
  pre-copy check) `26a29ac3bbcde48ea2ba9530a34fd5a3a9f1cc5b6b55156aa7da3295db4a957d`; candidate
  sha256 `c5dd8c97180450eca86595db7eaf3bfa4ef1928f1b49538b1256ac1751d71859`.

**Owner copy: not yet done.** These sha256 values are what the Owner verifies before copying each
candidate into its real path.

## QA results

- `PT_LAND_TOOL_PATH=<candidate> node qa/pt_land_offline.js` → **PASS, 74/74 assertions**
  (real-git fixtures under `os.tmpdir()`, no network; PL-1…PL-21 plus 5 pt-land.js mutants plus 5
  Codex-regression rows `CDX-1`…`CDX-5`).
- `AH_HOOK_PATH=<candidate> node qa/auto_mode_hardening_offline.js` → **PASS, 3964/3964
  assertions** (up from 3770 pre-R12; net +194 from AH-20's allow/deny rows, the canonical-
  identity mutant, and 5 R12 hook mutants).
- `node qa/instruction_layer_offline.js` → **PASS, 58 checks** (CLAUDE.md fingerprint re-pinned;
  all four required anchors intact).
- **Full `npm run qa:offline` against the frozen candidates (env-var override, same mechanism as
  R11's `AH_HOOK_PATH`/`AH_SETTINGS_PATH`): PASS, 52 spawned suites, 1 advisory warning** (run
  three times across the fix rounds below; the final run used candidate copies frozen immediately
  before the run so no concurrent edit could affect it — an earlier run, while a candidate was
  still being edited, produced one spurious failure from reading a torn file mid-edit; that result
  was discarded and is not evidence).
- Against the **unmodified real files** (pre-copy): `qa/pt_land_offline.js` and the AH-20 rows in
  `qa/auto_mode_hardening_offline.js` FAIL closed with a clear "candidate not applied yet" /
  anchor-driven message — the expected pre-copy state (brief §7 step 3, "tests first").

## Pre-flight checklist

See `<scratchpad>/r12/plan.md` for the full requirement→test map, Pattern Auditing (3 named
patterns: `DEFAULT_DEPS`/`decide(input, deps)` injection shape; `guard_integrity_check.js`'s
`runIntegrity(opts)` reused verbatim; the repo's `qa-suites.md` auto-discovery/negative-planting
conventions), State & Boundary Isolation, and Gate Verification sections, plus the two deliberate
brief-precedent overrides (a substituted pt-land.js mutant; a substituted PL-7 sub-case) and their
reasons.

## Codex review

Three rounds, all launched by this Worker (`codex exec --sandbox read-only`, foreground,
`< /dev/null`). Full transcripts: `<scratchpad>/r12/codex_review.log`,
`<scratchpad>/r12/codex_scoped_review.log`, `<scratchpad>/r12/codex_scoped_review2.log`.

**Round 1 (implementation diff — both candidates, the new/changed QA files, the governance diff):**
3 Class I findings, 0 Class II.

1. *"PUSH request can succeed without listing the commits it is asking the Owner to approve"*
   (a failed `git log R..L` silently became an empty commit list). **Fixed**: P8 now refuses if
   `git log` fails. Regression: `CDX-1` (a real, cross-platform `gitExec` shim — `NODE_OPTIONS=
   --require` against `process.execPath`, a genuine native binary on every platform, since a
   `.cmd`/`.sh` file spawned directly as argv[0] under `{ shell: false }` throws `EINVAL` on
   Windows — fails only `git log`, delegates every other call to real git, and a control call with
   plain `git` proves the fixture itself was otherwise healthy).
2. *"The protected-path check is case-sensitive, creating a Windows case-alias gap."* **Fixed**:
   `PROTECTED_PATH_RES` and the candidate path are both lowercased before comparison. Regression:
   `CDX-2` (a brand-new `PACKAGE.JSON` path with no pre-existing case counterpart anywhere in the
   fixture, avoiding the git/filesystem case-folding that would otherwise confound the probe;
   asserts `git diff --name-only` reports the literal uppercase path before asserting refusal).
3. *"Audit-write failures are silently treated as success."* **Fixed** (round 1): `appendAudit`
   no longer swallows; all 4 exported entry points wrap the call in a `safeRun` helper converting
   any throw into a clean `{ok:false, exitCode:1, reason:'INTERNAL: ...'}` instead of an uncaught
   exception.

**Round 2 (scoped re-pass on the 3 fixed hunks):** findings 1 and 2 confirmed resolved. **New
Class I**: the round-1 fix for finding 3 was itself imprecise — after L15/P12 already verified the
merge/push succeeded, an audit-write failure was still reported as `ok:false`, which could mislead
the Owner into thinking the LAND/push failed when it had not. **Fixed**: `appendAudit` still
throws; a new `bestEffortAudit` (swallow-on-failure) is used only by refusal/verification-failed
paths so a secondary audit failure never masks the primary, correct reason; the L16/P13 success
paths catch the throw locally and return `{ok:true, ..., auditWarning}` instead of `ok:false`.
Regression: `CDX-3` (rewritten: asserts `ok===true` + `auditWarning` after a verified LAND whose
audit path is a directory) and new `CDX-4` (a refusal path's original reason survives an audit
failure unmasked, with no `INTERNAL:` text).

**Round 3 (scoped re-pass on the round-2 fix):** the audit-outcome distinction confirmed resolved.
**New Class I**: the CLI's `output()` printed only `res.message` on success, never the internal
`auditWarning` field — an Owner reading CLI output (not the module API) would never see the
warning. **Fixed**: `output()` now also writes `pt-land: WARNING - <auditWarning>` to stderr when
present. Regression: new `CDX-5` (a real CLI spawn asserting the warning reaches stderr and the
merge still happened).

**Disposition note:** rounds 1–3 above are the normal step 8/9 FIX/re-review iteration on the
*implementation diff*. AGENTS.md's "no third round" limit governs step 12's own scoped re-pass,
not this prior stage.

Full `qa/pt_land_offline.js` re-run after every round: 69 → 72 (round 1 regressions) → 73 (round 2:
`CDX-3` rewritten, `CDX-4` added) → 74 (round 3: `CDX-5` added), all green. `qa/auto_mode_
hardening_offline.js`'s AH-20 rows were unaffected by any of the 3 rounds (all in `pt-land.js`, not
the hook) and stayed at 3964/3964 throughout.

**Step 12 — final check against the complete task diff** (tracked diff + the two untracked
in-scope files' full contents + `review.md` itself, plus the two scratchpad candidates): run once,
full transcript `<scratchpad>/r12/codex_final_review.log`. Result: **0 Class I findings** ("no new
Class I issue in the combined state, including the three previously fixed issues and their
interaction with the supplied hook changes"); it independently re-verified all three sha256 values
against this file. 2 Class II findings — both fixed in this document, no implementation change, no
QA re-run: the missing `## Files changed` section (added above) and stale "step-12 pending" / "not
yet run" wording (this section). Self-checked: every `work/<id>/` path named above exists and is
one of the five canonical files; every QA count matches the "QA results" section; no section reads
"Pending"/"TBD" except the one exempt `[backlog]` lesson line below.

`Final check: 1 round, 2 class-II findings fixed, self-checked; no implementation change, no QA
re-run.`

## Definition of Done (brief §12/§11-DoD) — status

| Item | Status |
|---|---|
| `pt-land.js` and R12 implemented exactly per §2–4 in Owner-applied files, with recorded sha256s | Candidates **built, QA'd, and sha256'd** in the Worker scratchpad; applying them to the real DENY-tier paths is the Owner's copy/hash step (outside Worker scope by design) |
| AGENTS.md/CLAUDE.md carry exactly the §5 edits; fingerprint re-pinned | **DONE** — `git diff` shows exactly the named anchors, each matched once (enforced by the `Edit` tool's own uniqueness check); CRLF-clean (0 bare LF introduced); `instruction_layer_offline.js` PASS 58 |
| PL-1…PL-21 and AH-20 pass, with their mutants; full `qa:offline` PASS 52 | **DONE** — 74/74 and 3964/3964 respectively; full aggregate PASS 52 (candidates frozen for the run) |
| Codex: no unresolved Class I finding | **DONE** — implementation-diff review (step 8/9): 3 rounds, 4 Class I findings, 4 FIX, 0 DEFER, 0 REJECT, 0 unresolved. Step 12 final task-diff check: 0 Class I, 2 Class II (both fixed here, self-checked) |
| STOP before the Owner's final commit | **Holding here** |

## Lessons

- [local] The R12 hook insertion point sits inside a CRLF-only file; an anchored scratchpad-script
  build (matching R11's `build_guard_candidate.js` pattern exactly, `\r\n` line endings in every
  anchor/insert string) avoided any line-ending churn, confirmed with a byte-level CRLF/bare-LF
  count after each rebuild.
- [local] `isWorkerSlot(cwd)` defaults to `true` for a missing/empty cwd ("strict column"); R12's
  own cwd/identity check in the hook must reject a missing cwd *before* calling `isWorkerSlot`, or
  the "missing cwd" AH-20 deny row fails open. Implemented in that order; AH-20 covers it.
- [local] `gitExec` in `pt-land.js` is spawned directly as argv[0] under `{ shell: false }` (same
  as the real `git` executable would be) — a `.cmd`/`.sh` wrapper file passed as an absolute path
  throws `EINVAL` on Windows; a `NODE_OPTIONS=--require` preload against `process.execPath` is the
  portable way to inject a QA-only fault into one specific git subcommand while every other call
  delegates to real git untouched.
- [local] `git` does not let a user `alias.<name>` override an existing builtin subcommand of the
  same name (verified empirically) — ruled out as a fault-injection mechanism for `CDX-1`.
- [local] A QA-suite background run reading a scratchpad candidate file via an env-var override
  (`PT_LAND_TOOL_PATH`) must never be started while that same file is still being edited — a
  concurrent edit produces a torn read and a misleading, non-reproducible failure. Always freeze a
  copy immediately before launching a long aggregate run.
- [backlog] `qa/guard_integrity_check.js`'s C7 worktree-set check expects exactly
  `portfolio-tracker`/`pt-wt-worker-a`/`pt-wt-worker-b`; any future fixture-based suite reusing it
  needs all three present (or an explicit `expectWorktrees`/`canonicalName` override) — pending
  routing.

## STOP

**STOP before commit (brief §11 step 8).** Both DENY-tier candidates are built, sha256'd, and
fully QA'd (74/74 + 3964/3964 + full `qa:offline` PASS 52 against frozen copies). The step-12 final
Codex check against the complete task diff (including this `review.md`) has run: 0 Class I, 2
Class II (fixed above, self-checked). Every Definition of Done item is DONE except the Owner
copy-in, which this task cannot perform itself. This Worker session has made no commit and has
written nothing to `.claude/hooks/**` or `.git/**` at any point.

**Owner action required before the final commit, in order:**
1. Verify sha256 of `<scratchpad>/r12/pt-land.candidate.frozen.js` =
   `d20cd81fc9c288ee4020c08694b447548b676d08813c8e14d29245fec88741b6`, copy it to
   `.claude/hooks/pt-land.js`.
2. Verify sha256 of `<scratchpad>/r12/guard.candidate.frozen.js` =
   `c5dd8c97180450eca86595db7eaf3bfa4ef1928f1b49538b1256ac1751d71859` (and that its sha256 against
   the real file pre-copy is `26a29ac3bbcde48ea2ba9530a34fd5a3a9f1cc5b6b55156aa7da3295db4a957d`),
   copy it to `.claude/hooks/pretooluse-guard.js`.
3. Re-run `npm run qa:offline` against the now-real files (no env overrides) — expect PASS 52.
4. Stage the 8 files in brief §6 and make the final commit in a normal terminal (RC2 — this commit
   stages `.claude/hooks/**`, outside the r9 gate).
