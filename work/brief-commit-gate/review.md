# review.md — R11 Owner-approved brief-only commit gate

Task: `task/brief-commit-gate`. Mode: Manual (brief lists ASK/DENY-tier files).

## Step 0 evidence

- `git branch --show-current` → `task/brief-commit-gate`; `git status --short --branch` clean at
  session start.
- Local `branch-dev` == HEAD == `4c11f4c`; `branch-dev..HEAD` empty (no divergence). Local
  `branch-dev` (`4c11f4c`) is 5 commits ahead of `origin/branch-dev` (`ea5a632`) — unrelated,
  pre-existing, not pushed by this task.
- `dd03098` is an ancestor of HEAD (r10 baseline present).
- `git diff c35f76e HEAD -- .claude/settings.json` empty — A1-1's line numbers (19, 21, 30, 74,
  76, 78, 80, 82, 84, 86, 107, 109) are current, not stale.
- Current-guard check: slot task branch descends from current `branch-dev`; `git status
  --porcelain .claude` empty.
- `node_modules/` newer than `package-lock.json` — no `npm ci` needed.
- `npm run qa:offline` pre-edit baseline: **PASS, 51 spawned suites, 1 advisory warning.**

## What is implemented, and where

Per §7 step 4 / §8 ("A Worker write to `.claude/hooks/**`, `.claude/settings*.json` or `.git/**`"
is a STOP condition), **neither candidate has been copied into the real paths.** Both were built
and fully validated in the Worker scratchpad, pointed at by the QA file's existing
`AH_HOOK_PATH` / `AH_SETTINGS_PATH` env-var overrides (`qa/auto_mode_hardening_offline.js`,
pre-existing mechanism, unmodified).

**Candidates were built by a scratchpad script that reads the real file and applies anchored,
uniqueness-checked string replacements** (`<scratchpad>/r11/build_guard_candidate.js`,
`build_settings_candidate.js`) rather than being retyped by hand — this guarantees every byte
outside the intended edit regions is untouched (an earlier hand-authored draft was caught and
discarded: it introduced two incidental single-character escape differences in unrelated,
untouched code, exactly the "Large Write preview corruption" class of risk).

- **Hook candidate** (R11, §3): `<scratchpad>/r11/guard.candidate.js`
  sha256 `88e93a83b028ce1671901d0096c238cd4202bc7beead825d9fed2fdbc4d2bac1`
  — a copy of the current `.claude/hooks/pretooluse-guard.js` (sha256
  `bfe5f36720765dced213ca109092dca10887789d5c902b677040ca984d8561bc`) with exactly 5 edit regions
  (confirmed by `diff -u`, 5 `@@` hunks, everything else byte-identical):
  1. `require('crypto')` added.
  2. `classifyGit`'s `commit` case now also stores `args: rest` (needed so the gate can see the
     actual `-m <msg>` form; every other field/behavior of that push is unchanged).
  3/4. A new `briefCommitGate(f, cwd, gitCount, deps)` implementing §3 exactly (order: narrow
     form → environment → canonical identity → approval record → repository state → content →
     R10-3 integrity), its helpers (`isNarrowBriefCommitForm`, `r11Deny`, `briefApprovalFs`,
     `canonicalStatusGit`, `indexBlobSha256Git`), inserted immediately before `DEFAULT_DEPS`,
     which gains 3 new entries (`briefApproval`, `canonicalStatus`, `indexBlobSha256`).
  5. `commitGate`'s `if (!slot) return commitDeny('denied outside a Worker slot');` changed to
     `if (!slot) return briefCommitGate(f, cwd, gitCount, deps);` — the only change to the
     existing slot-path function; everything below it (the Worker-slot column) is byte-identical
     to r10.
  - Full diff: `<scratchpad>/r11/guard.candidate.final.diff` (191 lines, 5 hunks).
- **Settings candidate** (A1-1): `<scratchpad>/r11/settings.candidate.json`
  sha256 `929f754801fe478a7a1acd282d04e613e7f4c32a6d493bb3c37831c17f6f177e`
  — the current `.claude/settings.json` (sha256
  `0e27485d22c69cc67187aa6f0067bf50d3988d0ebc65d32473a70b0972abec1b`) with exactly the 12 lines
  at 19, 21, 30, 74, 76, 78, 80, 82, 84, 86, 107, 109 removed (self-validated: each removed line
  matched `"Write(./…)",`, `JSON.parse` deep-equals the original minus exactly those 12 strings,
  no `Write(` remains, every other key/shape is byte-identical, CRLF count is 142 → 130).
  Full diff: `<scratchpad>/r11/settings.candidate.diff` (50 lines).

**Owner copy: DONE.** The Owner independently verified both sha256 values and copied both
candidates into the real paths. Re-verified in this session:
`sha256(.claude/hooks/pretooluse-guard.js)` = `88e93a83b028ce1671901d0096c238cd4202bc7beead825d9fed2fdbc4d2bac1`,
`sha256(.claude/settings.json)` = `929f754801fe478a7a1acd282d04e613e7f4c32a6d493bb3c37831c17f6f177e`
— both match the candidates exactly. `git diff` on each shows precisely the changes described
above (5 hunks on the hook; exactly the 12 `Write(...)` lines removed from settings.json), nothing
else.

## QA results

- `AH_HOOK_PATH=<candidate> AH_SETTINGS_PATH=<candidate> node qa/auto_mode_hardening_offline.js`
  → **PASS, 3913/3913 assertions** (up from 3770 pre-R11; net +143 from AH-19 + AH-8-W + 13 R11
  mutants + 4 real hook-process spawns (G1-G4) + 1 pre-existing-mutant anchor fix — see
  "Existing-corpus maintenance" below).
- Against the **unmodified real files pre-copy** (r10/pre-A1-1) this same command FAILed on
  exactly the R11/A1-1-dependent assertions (AH-8 settings-shape row, AH-19-1/2/12/13, G1-G4, and
  the 13 R11-specific `MUT` rows) — the expected "tests first" state (brief §7 step 3).
- **Post-copy, against the real files (no env-var override):** `node
  qa/auto_mode_hardening_offline.js` → **PASS, 3913/3913 assertions**. `npm run qa:offline` →
  **PASS, 51 spawned suites**, 1 advisory warning (pre-existing, unrelated).
- `sha256(.claude/hooks/pretooluse-guard.js)` and `sha256(.claude/settings.json)` on the real
  files, re-computed post-copy, match the candidate values exactly (see above).
- `node qa/instruction_layer_offline.js` → **PASS, 58 checks** (CLAUDE.md fingerprint unchanged;
  CLAUDE.md was not touched by this task).
- **Differential r10 → r11 (actually run, not inferred):** a scratchpad wrapper module
  (`<scratchpad>/r11/differential.js`) requires BOTH the real r10 hook and the r11 candidate,
  calls `decide()` on both for every input the full offline corpus generates, and records any
  decision/reason mismatch. Run via `AH_HOOK_PATH=<wrapper> node
  qa/auto_mode_hardening_offline.js` (the run's own PASS/FAIL count is not meaningful — mutant
  anchors and CLI/G-spawns target the real hook file, not the wrapper — only the mismatch log
  matters): **3700 decide() calls, 62 mismatches, and every one of the 62 is a
  `git commit -m "docs(work): …"` command at one of the three R11/AH-19 fixture directories**
  (`ah19-canon-*`, `ah19-gitfile-*`, `ah19-real-*`). Zero mismatches at any pre-existing fixture
  cwd (`SLOT_A`, `SLOT_B_SUB`, `MAIN`, etc.) or for any pre-existing command shape — i.e. R11
  changes behavior exactly where it should and nowhere else.
- **AH-19-14 (explicit control):** a slot commit staging `work/x/brief.md` is still denied by
  `STAGED_DENY_SOURCES` — R11 only ever engages on the `!slot` branch.

### Existing-corpus maintenance (not new coverage, kept behavior-equivalent)

- `mutantCatchesMulti('non-slot commit allowed (RC2 dropped)', ...)`: its first find/replace
  anchor was `"if (!slot) return commitDeny('denied outside a Worker slot');"`, which no longer
  exists verbatim (R11 changes that exact line by design). Updated to target
  `"if (!slot) return briefCommitGate(f, cwd, gitCount, deps);"` instead — same intent (disabling
  the non-slot branch's special handling), same probe, same pass/fail semantics.

## Pre-flight checklist

See `<scratchpad>/r11/plan.md` for the full requirement→test map, Pattern Auditing (2 named
repo patterns: `DEFAULT_DEPS`/`decide(input, deps)` injection shape; AH-16's `depsOf()`/`dc()` +
AH-18's real-git `mkdtempSync`+`G()` fixture pattern), State & Boundary Isolation, and Gate
Verification sections.

## Codex review

Run against the exact candidate bytes above (`codex exec --sandbox read-only`, foreground,
`< /dev/null`), reviewing the brief, `guard.candidate.final.diff`, `settings.candidate.diff`,
`qa_file.diff` and the `AGENTS.md` diff. Full transcript: `<scratchpad>/r11/codex_review.log`.

**Result: no Class I findings.** "The gate follows the brief's check order, returns the existing
denial before reads for narrow-form failures, and R11 denials end with 'commit from a normal
terminal.' No apparent approval-record parsing, status-parsing, or blob-hash bypass."

Class II findings and disposition:
1. *"AH-19-3's unstaged-change and AM cases aren't evident in the added rows."* — **Verified
   false positive**: `AH19_3_ROWS` (qa file, "AH-19-3" section) contains both
   `'an unstaged change elsewhere'` and `'the brief itself also modified in the worktree (AM)'` as
   injected-deps rows; Codex's review evidently only surfaced the real-git fixture subsection.
   No action needed.
2. *"Timeout coverage is a proxy... does not exercise a real subprocess timeout."* — **Accepted,
   already disclosed** in the qa file's comment at that row: `decide()` computes its own deadline
   after merging injected deps, so a genuinely shortened budget can't be injected from a table
   row; the closest constructible proxy (a timeout-shaped thrown error) is used and labeled as
   such.
3. *"Trailing lone CR is rejected... brief says trailing CR/LF is allowed."* — **Fixed.**
   `briefApprovalFs`'s trailing-newline strip was `/\r?\n$/` (LF or CRLF only); widened to
   `/\r\n$|\r$|\n$/` (also strips a lone trailing CR) before the single-line check. Rebuilt,
   re-validated (3913/3913 still PASS, differential re-run: still exactly the same 62
   R11-scoped mismatches, 0 new ones). sha256 above is the post-fix value.

## Definition of Done (brief §9) — status

| Item | Status |
|---|---|
| R11 implemented exactly per §3 in the Owner-applied hook, with a recorded sha256 | **DONE** — Owner-applied; sha256 verified post-copy to match the reviewed candidate exactly |
| AGENTS.md carries exactly the §4 edits | DONE — `git diff AGENTS.md` shows exactly the 3 edits, no other change; CRLF-clean (0 bare LF), each anchor matched exactly once |
| AH-19 rows and mutants PASS; r10→r11 differential 0 changes; AH-16 unchanged | DONE — differential actually run pre-copy (not inferred), 0 changes outside the R11/AH-19 fixture scope; post-copy real-file suite run PASS 3913/3913 |
| Full `qa:offline` PASS 51 | **DONE — PASS 51 suites against the real, Owner-applied files** (re-confirmed post-copy) |
| `instruction_layer` PASS | DONE — PASS 58 (CLAUDE.md untouched, fingerprint unchanged) |
| G1-G4 (one allow + three denies, real hook-process spawns) | DONE — part of the post-copy real-file 3913/3913 PASS |
| Codex: no unresolved Class I finding | DONE — 0 Class I; 3 Class II, 1 fixed (trailing-CR parsing), 1 verified-already-present (false positive), 1 accepted-as-disclosed |
| STOP before the Owner's final commit | **Holding here — every other DoD item is DONE** |

## STOP

**STOP before commit (§7 step 8).** The Owner-copy hand-off (§7 step 4) is complete and
re-verified in this session (sha256 match, `git diff` matches the reviewed candidates exactly,
`qa:offline` PASS 51 and `auto_mode_hardening_offline.js` PASS 3913/3913 against the real files).
This Worker session made no commit, and wrote nothing to `.claude/hooks/**`,
`.claude/settings*.json` or `.git/**` at any point (the Owner made both copies).

**Commit-ready state:** working tree has exactly 5 changed/new paths —
`.claude/hooks/pretooluse-guard.js`, `.claude/settings.json`, `AGENTS.md`,
`qa/auto_mode_hardening_offline.js` (all modified), `work/brief-commit-gate/review.md` (new,
untracked) — matching §5 exactly. Every Definition of Done (§9) item is DONE. No push, merge,
rebase, deploy, or `main`/`branch-dev` action has been taken.

**Live-check note for the Owner:** the gate hashes the STAGED (index) blob via
`git cat-file blob :<path>`, not the working-tree file. On a CRLF checkout, a Windows
`Get-FileHash` / `certutil` hash of the working-tree `brief.md` will **not** match the recorded
hash unless the index blob happens to be byte-identical to the working-tree file (it is, unless
`core.autocrlf` normalizes on add). Verify the hash against `git cat-file blob :work/<id>/brief.md`,
not the file on disk.

**Recommended next step (single):** Owner stages the 5 paths above and makes the final commit for
this task in a normal terminal (this commit itself is outside the R11 gate's scope — R11 only
ever governs a lone `work/<id>/brief.md` commit — so it is an ordinary Owner-terminal commit, not
an R11-gated one).
