# Review — worker-continuous-flow: safe-command allowlist, `git --output` guard, post-LAND slot cleanup

Brief: `work/worker-continuous-flow/brief.md`, baseline commit `244d0d4` (brief-only commit, on
top of `dd389ba` = `branch-dev` = `origin/branch-dev`). Mode: `acceptEdits` not used for this
task — Mode: Manual throughout (DENY-tier settings, hook and `pt-land.js`; ASK-tier `AGENTS.md`),
per the brief's header. No commit made; this review reports pre-commit evidence only.

## Summary

Applied §3-§6 exactly: 23 new `permissions.allow` entries (read-only inspection, offline QA,
Codex read-only review, `/tmp/pt-<task-id>/` scratch, and the `pt-land.js` request/cleanup
verbs — never `land`/`push` themselves); the R13 `--output` guard in `classifyGit` for
`diff`/`show`/`log`/`format-patch`/`whatchanged`; the `cleanup` alternative added to
`R12_FORM_RE`; the full `cleanup task/<id>` verb (K1-K9) in `pt-land.js`; AW-1/AW-2/AW-3 in
`AGENTS.md`; and the corresponding QA (`AH-8` `EXPECT_ALLOW` update, `AH-23` new rows, `PL-22..31`
plus the required mutants).

Every approval the Owner already held stays exactly where it is: `deny`/`ask`/`defaultMode`/the
hook matcher are unchanged; `land` and `push` (as opposed to `land-request`/`push-request`/
`cleanup`) are not allowlisted; `sed` is deliberately not allowlisted (AL-2).

## Files changed

- Implementation (6, all Owner-applied for the three DENY/ASK-tier files via copy/hash):
  `.claude/settings.json`, `.claude/hooks/pretooluse-guard.js`, `.claude/hooks/pt-land.js`,
  `AGENTS.md`, `qa/auto_mode_hardening_offline.js`, `qa/pt_land_offline.js`
- Evidence (tracked): `work/worker-continuous-flow/brief.md`, `work/worker-continuous-flow/review.md`

No `land-scope` block exists in this brief (the diff touches protected paths), so the Owner LANDs
this manually, not through `pt-land.js land[-request]`.

## Step 0

- Current-guard check: PASS (`task/worker-continuous-flow` descends from `branch-dev`;
  `git status --porcelain .claude` empty at task start).
- Authoritative Step-0 baseline (per the Owner's bootstrap handoff): `qa:offline` PASS, 53
  suites, 1 advisory, 0 hard failures, clean worktree. A later anomalous run failing only with
  Windows `0xC0000142` DLL-initialization aborts during overlapping/resource-heavy QA activity
  was treated as environmental noise, not re-litigated, per instruction.

## Owner-applied DENY/ASK-tier candidates (copy/hash workflow)

Built and verified in the scratchpad before every application; sha256 recorded at each step.
Two rounds were needed: round 1 (initial candidates), then round 2 (one corrected file, after
the issues below were found).

**Round 1 — applied, verified matching in canonical and this worktree:**
| File | sha256 |
|---|---|
| `.claude/settings.json` | `6e99e66e3bae8300b86e031bfb4185dc29c3fe3f7e781a5cc2c3efbcc97ea606` |
| `.claude/hooks/pretooluse-guard.js` | `26167d8d1bfab0183e869db43d636147c4b17cb34b148c4f7d61c6f3cc5c1875` |
| `.claude/hooks/pt-land.js` | `1f549c3919aa50bbfb76b9c23cb1038342ddb629a26e4075dd5e165fe332d920` |

**Issue found after round 1 (self-caught, before any QA claim):** applying the candidates
flipped `pretooluse-guard.js` and `pt-land.js` from the repo's existing CRLF on-disk convention to
LF (the authoring tool defaults to LF; the repo relies on `core.autocrlf` re-applying CRLF on a
real `git checkout`, which a direct file overwrite bypasses). This broke three **pre-existing**
`qa/pt_land_offline.js` mutants that hardcode `\r\n` in their anchors — not a defect in the new
code, but a real regression in the shipped files' line-ending convention. Fixed by converting all
three candidates to CRLF (content-only diff re-verified identical; `settings.json`'s content is
unaffected by EOL either way).

**Round 1, corrected (CRLF) — applied, verified matching in canonical and this worktree:**
| File | sha256 |
|---|---|
| `.claude/settings.json` | `68c9b50df0ae517517c9535d27e9b720021615ab2764a472cbe05b12d6d4426e` |
| `.claude/hooks/pretooluse-guard.js` | `f81649049a6aacf8d9cc0c2ab6407432833c12977b82bd853725a78f62008bd5` |
| `.claude/hooks/pt-land.js` | `a9b0acb6f05e1338a2a29974788afa24229229c6e5611a88f9bc9c9e6185dc81` |

**Round 2 — after the Codex-review fixes below, only `pt-land.js` changed (settings.json and
pretooluse-guard.js unchanged from round 1 corrected):**
| File | sha256 |
|---|---|
| `.claude/hooks/pt-land.js` | `8262b5dd3663167dc58e764e8c23ffea3f813b60c0261d67e672272f449c01c7` |

Final state confirmed hash-identical in both the canonical checkout and this worktree.

## QA

- `node qa/auto_mode_hardening_offline.js` — **PASS (4040 assertions)**, confirmed stable across
  4 separate runs (one single AH-16 failure was observed once mid-task; re-run clean immediately
  after — this is the same pre-existing, already-documented timing flake from an unrelated prior
  task, not a regression from this one).
- `node qa/pt_land_offline.js` — **PASS (89 test-blocks)**, confirmed stable across 2 separate
  runs against the final (round-2) candidate.
- Full `npm run qa:offline` — **PASS, 53 spawned suites** (matches the Step-0 baseline exactly, no
  suite added), 1 pre-existing advisory warning, run clean and non-overlapping after all fixes
  were in place.

### Hash re-pins

None. This task adds a fifth verb and new QA rows; it does not change any hash-pinned function in
`index.html` or in any of the DH-M4* suites (confirmed unaffected: `dh_ui_vocabulary_offline.js`,
`eod_packet_v0_offline.js`, `eod_preexport_warning_offline.js` all still PASS at their prior
counts).

## Live checks (L-A1…L-A4, brief §9)

- **L-A1** — confirmed in this Manual slot session: `git status`, `git log --oneline -5`,
  `grep -n`, and `node qa/guard_integrity_check.js` all ran without a hook denial. (The settings
  allowlist's effect on the permission-*prompt* itself is observed by the Owner in their own
  terminal; from inside this session I can only confirm the hook's classification, not whether a
  prompt dialog appeared.)
- **L-A2** — confirmed live, both before and after the round-2 re-apply: `git push` still denied
  (`R3g`/`R1`); `git diff --output=.git/x` denied with the exact R13 reason
  (`git diff --output writes files - denied in every session (R13)`).
- **L-A3** — confirmed: a Write-tool call to `/tmp/pt-probe/x.txt` succeeded without a hook denial
  (cleaned up afterward).
- **L-A4** — **not performed by this Worker.** The brief lists this under "Owner live checks" and
  explicitly reserves Worker A's landed-and-pushed `task/selected-only-watchlist` as "the first
  real cleanup." Per AGENTS.md, a Worker session runs only in its own slot — deleting a branch and
  detaching a worktree in Worker A's slot is outside Worker B's scope regardless of mode. This
  needs the Owner (or a session in Worker A's own slot) to run it directly.

## Codex review (implementation diff, base `branch-dev` @ `dd389ba`)

Launched via `codex exec --sandbox read-only` against the real implementation diff (all 6
land-scope-equivalent files) plus the full brief text. **Round 1: 6 Class I findings, 2 Class II
findings.** All verified against the actual code (one Class I claim was checked and rejected as a
misreading before any change was made) and fixed; see the ledger below.

Codex's round-1 findings, verbatim:
> **Class I:**
> - K6 can overwrite an existing archive and leave partial copies behind…
> - Original deletion failures are ignored…
> - PL-25 does not test its tracked-modification case…
> - Required cleanup mutants are missing from the shown QA diff…
> - PL-26 does not establish the required "destination already exists" behavior…
> - PL-30 does not verify all listed protected state…
>
> **Class II:**
> - AH-23's forbidden-entry check is based on `EXPECT_ALLOW`, not the actual settings allow list…
> - The displayed cleanup success message can claim evidence was archived when there were no
>   ignored files to copy…

## FIX / DEFER / REJECT ledger

| # | Finding | Class | Resolution |
|---|---|---|---|
| 1 | K6 could silently overwrite a pre-existing archive file | I | **FIX** — added an `fs.existsSync(destAbs)` pre-check plus the `wx` (create-only) write flag; refuses with nothing deleted if hit |
| 2 | A delete failure after a successful archive was swallowed, letting the tool proceed to detach/delete-branch with an original left behind | I | **FIX** — a delete failure now hard-refuses immediately, before K7/K8 |
| 3 | PL-25 "does not test its tracked-modification case" | I | **REJECT** — verified empirically: `buildFixture`'s default `scopeRelPaths` (`work/<id>/foo.txt`) is already tracked and committed by the fixture; PL-25's `fs.appendFileSync` on that exact path is a genuine tracked modification. Codex misread the fixture default. No change made. |
| 4 | 4 required cleanup mutants (K3/K4/`-d`→`-D`/archive-verify-skipped) were missing | I | **FIX** — added all four to `qa/pt_land_offline.js`. Two needed real-git debugging to target correctly: K3-dropped only becomes observable on a *landed-but-unpushed* fixture (an *unlanded* one is independently blocked by git's own `-d` safety net at K8, masking the mutation); K4-dropped is independently caught by K9's own post-check too, so the meaningful, correctly-targeted assertion is that archiving/original-deletion/branch-deletion already ran *before* K9's too-late refusal — not that the final `ok` is `true`. |
| 5 | PL-26 only covered a directory-collision, not a plain "destination already exists" | I | **FIX** — added a second PL-26 sub-case: one exact destination file pre-occupied; asserts no overwrite, originals intact, no partial copies left in the archive dir |
| 6 | PL-30 omitted `origin/branch-dev` and the other slot's working-tree status | I | **FIX** — both added to the untouched-invariant snapshot |
| 7 | AH-23's forbidden-substring check used `EXPECT_ALLOW`, not the real on-disk settings | II | **FIX** — switched to `realSettings.permissions.allow` (falling back to `EXPECT_ALLOW` only if the real file failed to parse) |
| 8 | Cleanup success message could claim "evidence archived" with zero files archived | II | **FIX** — now conditional on `archivedCount > 0` |

DEFER: none.

## Re-verification after fixes

After every fix, the affected suite was re-run to green (not just inspected): `pt_land_offline.js`
specifically was run **5 times** across the fix cycle (initial 3-failure run → 2 real fixes
identified via live-git debugging → 1-failure run isolating the last real gap → final clean
run ×2 for determinism, both PASS 89/89). `auto_mode_hardening_offline.js` was run 4 times, PASS
each time except the one isolated, already-known AH-16 flake.

## Lessons

- [local] This repo's `.claude/hooks/*.js` and `.claude/settings.json` are CRLF on disk via
  `core.autocrlf`, but that conversion only applies on a real `git checkout` — a direct
  Owner-applied file overwrite (the DENY-tier copy/hash workflow) does not get it for free. Any
  future DENY-tier candidate for these paths must be CRLF-converted before hashing, or a
  `\r\n`-anchored QA mutant will silently break on apply. True only of this file pair's existing
  test-authoring convention (`qa/pt_land_offline.js`'s `withMutantSource` does not normalize line
  endings; `qa/auto_mode_hardening_offline.js`'s `mutantCatches` does) — no destination.
- [local] A mutant that removes a check guarded by a *second, independent* safety net elsewhere in
  the same tool (K3 vs. git's own `-d`; K4 vs. K9's own post-verification) will not show the naive
  "now it wrongly succeeds" symptom — the real, correctly-targeted assertion is often "it still
  ultimately refuses, but only after doing the damage the removed check exists to prevent up
  front." Caught here only by building a real git fixture and inspecting actual state, not by
  trusting the first assertion that happened to compile.

## LAND-EVIDENCE

LAND-EVIDENCE: qa-offline=PASS 53; targeted=PASS; codex-classI-unresolved=0

---

**STOP before commit, per the brief's flow (§9 step 7).** The commit stages protected paths
(`.claude/settings.json`, `.claude/hooks/pretooluse-guard.js`, `.claude/hooks/pt-land.js`), so it
is made in the Owner's own terminal, not through the Worker's r9 gate. No commit, LAND, or push
has been made by this Worker. `git status` in this worktree shows exactly the six files above
modified, nothing else.
