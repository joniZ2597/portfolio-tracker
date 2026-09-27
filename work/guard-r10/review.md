# Review: Guard hardening r10 - escapes, aliases, git config/hooks, ref-moving gaps, .git writes

Evidence only; authorizes nothing. Brief: `work/guard-r10/brief.md` (approved commit `1e8462c`). Diff base `f1a53ae` = origin/branch-dev.
Mode: Manual. Worker slot: `pt-wt-worker-a`, branch `task/guard-r10`. Host git 2.53.0.windows.2; Node v24.14.0.

## Result
- r10 closes the residual bypass families found after r9 (R10-1 escape differential, R10-2 subcommand allowlist + `git-<sub>`,
  R10-3 git config/hooks execution paths incl. `.git` writers, R10-4 ref-moving gaps, R10-5 other ref/commit-creating + canonical
  reset gate, R10-6 file-tool `.git` guard, R10-7 time budget, R10-8 read-only integrity check). Hook stays deny-only
  (allow = no opinion; deny = exit 2). r9 / R3g / R3m / R2 / R2b / r5-r8 decisions preserved (differential below).
- The hook and `.claude/settings.json` matcher are Owner-applied via the copy/hash workflow; the Worker never wrote them.
  Final applied hook sha256 `bfe5f36720765dced213ca109092dca10887789d5c902b677040ca984d8561bc`; matcher
  `Bash|PowerShell|Write|Edit|MultiEdit|NotebookEdit` (R10-6).

## QA
- Pre-edit baseline: `npm run qa:offline` PASS, 50 suites (first line of `qa.log`).
- Targeted suite (`qa/auto_mode_hardening_offline.js`, real module + real CLI): **PASS 3773**, 0 failures; multiple consecutive runs clean.
- **AH-17** - every section 1 row T1-T5 -> deny in slot / main / missing-cwd, via `decide` and the real CLI (exit 2): escape
  differential (R10-1), unknown-subcommand + `git-<sub>` (R10-2), config/`-c`/`--config-env`/`GIT_CONFIG_*` (R10-3),
  `.git` writers incl. inline interpreter code (R10-3c), RC4 extension incl. attached `-B`/`-C` and `worktree add`
  `-b`/`-B`/checkout-target (R10-4), cherry-pick/revert/am/filter-branch, fetch refspec/`--refmap`/`--mirror`,
  `config remote.*.fetch|mirror`, `remote add --mirror*`, canonical reset matrix (R10-5), file-tool guard incl. real
  resolver deepest-existing-ancestor + junction (R10-6), and `spawnBudgetMs` unit rows (R10-7). Keep-allowed controls
  (read-only git, harmless reset forms, `git worktree add <path> task/*`, ordinary/new-subdir file-tool writes) stay allow.
- **AH-18** - R10-8 integrity check on an `os.tmpdir()` fixture: clean PASS, then each of the seven conditions induced to
  FAIL (C1 local ref mismatch, C2 reflog newer than `--since`, C3 protected/alias/remote config, C4 non-sample hook,
  C5 governance file differs from HEAD - tracked modification/deletion or an untracked non-ignored planted governance
  file/hook (a gitignored `.claude/settings.local.json` is intentionally NOT flagged; a no-false-positive control asserts
  this when the host gitignores it), C6 base-dev...task touches a protected path, C7 unexpected
  worktree set); report-only key (`core.pager`) stays PASS with a report line; usage error (`--since` unparseable / missing
  base args) -> exit 3; CLI exit 0/1/3 verified.
- Mutants: 18 hook (>=1 per R10-1..R10-7 + R10-A) and 6 integrity-script (C1, C2-empty/missing-reflog, C3-alias,
  C3-per-remote, C5-untracked planted hook, C6) - each caught by its probe; unmutated production passes the same probe.
- **Differential r9<->r10** over the harvested r9 corpus (2718 unique Bash/PowerShell rows, identical injected deps):
  **0 decision changes, 0 violations**; 107 reason-only changes, all on already-denied ref-move / `checkout main` /
  `GIT_DIR=x git commit` rows (RC4->RC4/R10-4, "targeting main"->"targeting protected branch", R3c->R10-5). Constraint met.
- Full **`npm run qa:offline`** with the applied r10 hook + matcher: **PASS, 50 suites**, 1 advisory warning (baseline-identical).
- **G1-G3** (real hook-process spawns, `scratchpad/g123_r10.js`): PASS (31/0) - allow/ask/deny shapes + r10 representative
  denies and allows, incl. canonical reset and file-tool `.git`.
- **Integrity check** (`node qa/guard_integrity_check.js --base-main fbec2c1 --base-dev 1e8462c --task task/guard-r10 --root <canonical>`):
  FAIL **C5 only** - expected, because the r10 hook + settings are applied but not committed in `pt-wt-worker-a`; C1-C4, C6, C7
  PASS; LFS `filter.*` keys report-only. Local `branch-dev` = `1e8462c` (origin/branch-dev = `f1a53ae`, 1 behind), so
  `--base-dev 1e8462c` is the correct argument.

## Codex (independent, read-only, `codex exec --sandbox read-only`, raw in `codex.md`)
Round 1 - implementation diff (base `f1a53ae`): 3 Class I findings, all in `qa/guard_integrity_check.js` (the new in-scope
detection script); no hook bypass, no keep-allowed over-blocking, no re-implementation QA.

| Finding | Class | Disposition |
|---|---|---|
| C2 reflog query uses `%gd` selector, treated as a unix timestamp | I | **REJECT** - verified on the pinned host git 2.53.0: `git log -g --date=unix --format=%gd` renders `branch-dev@{1790518681}` (a real epoch), so `/@\{(\d+)\}/` extracts the entry time and C2 fires (AH-18 C2 passes). Not a live defect on the pinned host. |
| C3 every remote's `fetch` compared to `origin`'s namespace (false-positive for e.g. `upstream`) | I | **FIX** - now compares each `remote.<name>.fetch` to its own default `+refs/heads/*:refs/remotes/<name>/*`; a legit non-origin remote passes, a cross-namespace/mirror fetch fails. AH-18 C3 rows + a mutant added. |
| C5 diff-from-HEAD missed untracked governance files | I | **FIX** - C5 now uses `git status --porcelain` (catches tracked modifications AND untracked new files under `.claude/settings*.json` / `.claude/hooks/**`, e.g. a planted hook, which `git diff HEAD` missed). A gitignored legit `.claude/settings.local.json` is deliberately NOT flagged (see notes). AH-18 planted-hook row + no-false-positive control + a mutant added. |

Final check (step 12) - task diff incl. `review.md`: confirmed the C3/C5 fixes correct; 1 new Class I + 2 Class II, all resolved.

| Finding | Class | Disposition |
|---|---|---|
| C2 reflog scan skipped a protected ref on a failed/empty `git log -g` (fail-open) | I | **FIX** - a deleted/emptied reflog makes `git log -g` exit 0 with no output (verified), so for protected local refs `main`/`branch-dev` the scan now fails closed on a non-zero query OR zero entries; `origin/*` refs stay skipped. AH-18 rows (future `--since` quiet; deleted-reflog FAIL) + a mutant added. QA re-run (PASS 3772) + one scoped Codex re-pass: no new defects. |
| `review.md` ends with "Final check: pending" | II | **FIX** - final-check line completed (below). |
| `review.md` shows encoding corruption (a mojibake em-dash) | II | **REJECT / fixed defensively** - the bytes are valid UTF-8 (`E2 80 94` em-dash); Codex's terminal misrendered UTF-8 through a non-UTF-8 codepage. Converted `review.md` to pure ASCII anyway so no tool misrenders it. |

## DEFER / accepted notes (Owner call; not brief-blocking)
- Two deny-only over-blocks, stricter than the brief's literal scope, no security weakening, not brief keep-allowed rows:
  (a) a `GIT_DIR`/`GIT_WORK_TREE` command prefix on any git program is denied (brief R10-5 scopes it to `reset`);
  (b) the whole `GIT_CONFIG_*` env family is denied (brief R10-3b names six specific variables). Left as-is (Owner-applied hook).
- C5 uses `git status --porcelain` (not `--ignored`): the real canonical checkout has a legitimate gitignored
  `.claude/settings.local.json`, so `--ignored` would fail C5 on every run (cry wolf). Trade-off: a *gitignored*
  malicious governance file is not caught by C5 - but `.claude/settings*.json` is DENY-tier (a task cannot write it via
  the file tools) and script-based creation is the documented T6 residual, so the primary vector (an untracked planted
  `.claude/hooks/**`) is what C5 covers.
- R10-8 is not part of `qa:offline` (brief section 2 R10-8); it is a Worker-at-STOP / Owner-before-LAND control.
- T6 (indirect script execution) and the other section 6 residuals are unchanged and documented in the brief.

## Files changed
- Implementation (4): .claude/hooks/pretooluse-guard.js, .claude/settings.json, qa/auto_mode_hardening_offline.js, qa/guard_integrity_check.js
- Evidence (tracked): work/guard-r10/brief.md, work/guard-r10/review.md

## Lessons

- [covered]  Hook + settings are built as scratchpad candidates and Owner-applied after a hash check; the Worker validates
             by hash and never writes them - already covered by brief section 3 / the r9 R3 workflow.
- [local]    r10 needed seven Owner hook re-applies before full brief conformance (attached `-B`/`-C`, `remote add --mirror`,
             worktree checkout-target, harmless-reset carve-out, R10-6 deepest-existing-ancestor, interpreter-code `.git`
             detection). Each gap was proven by a targeted probe and reported as test-id + rule-number only, per the Owner's
             STOP protocol; no Worker hook edit was made.
- [rule]     A governance/tamper detection check has three git behaviours to balance: `git diff HEAD` misses untracked
             files (a planted hook goes undetected); `git status --porcelain` catches untracked non-ignored files (the
             planted-hook vector) but hides gitignored ones; `--ignored` catches gitignored files too but then flags a
             legitimate local `.claude/settings.local.json` on every run (a false positive that makes the tool cry wolf).
             Destination-ready text for `.claude/rules/qa-suites.md`: "A repo-state/tamper detection check on governance
             files uses `git status --porcelain` (not `git diff HEAD`, which misses untracked planted files; not
             `--ignored`, which false-positives on a legitimate gitignored `.claude/settings.local.json`). A gitignored
             malicious governance file is a DENY-tier / T6-residual concern, not a detection-check case."

Final check: step-12 task-diff Codex check found 1 class-I (C2 reflog fail-open, in qa/guard_integrity_check.js) and 2
class-II (this final-check line; a UTF-8 rendering artifact); the class-I was FIXed (protected-ref reflog now fails closed
on a non-zero query OR zero entries - a deleted/emptied reflog exits 0 with no output) with a QA re-run and scoped Codex
re-pass 1 (no new defects). Running the integrity check against the real repo then surfaced a false positive from an
interim C5 `--ignored` choice (the real canonical has a legit gitignored .claude/settings.local.json); C5 was refined to
plain `git status --porcelain` (catches untracked planted hooks + tracked mods, no false positive) and covered by scoped
Codex re-pass 2 (no class-I; one class-II comment mojibake, fixed). Final targeted suite PASS 3773; qa:offline PASS 50.
Self-checked: every work/guard-r10 path named exists and is one of the five canonical files, each count matches a qa.log
line, no section reads Pending/TBD.
