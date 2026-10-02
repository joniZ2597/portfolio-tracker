# Task brief: owner-one-action-gates — one Owner `!` line per governance gate (G1 brief-request, G2 PROTECTED gate, G3 LAND of PROTECTED-approved files)

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Backlog | **none** — workflow/governance only; no `BACKLOG.md` entry is closed or changed, so `BACKLOG.md` is in neither the file set nor any `land-scope` (AGENTS.md "Backlog row") |
| Baseline | b583da95827fc01ce4e982160d5de9b24e68de18 = branch-dev = origin/branch-dev (`backlog-close-rule` landed); main = origin/main = fbec2c193346d7afd1dab6fd11a46b5efe55238b; the task branch starts at this brief's commit |
| Anchors | verified at `b583da9`: `pt-land.js` 852 lines (`buildLandApprovalLine` :340, `buildPushApprovalLine` :512); hook `R12_FORM_RE` :1346; settings `pt-land.js` allow entries :147–149; last rows PL-31 and AH-23 |
| Branch / slot | `task/owner-one-action-gates`, in Worker B (detached at `branch-dev` by `cleanup`, clean) |
| Mode | **Manual** (DENY-tier hook, tool and settings; ASK-tier `AGENTS.md`) |
| qa:offline | the baseline count measured at Step 0 → unchanged (existing suites are extended, none added) |
| Status | CODE-READY on Owner approval of this brief |

Objective. Every Owner gate needs exactly **one** explicit, Owner-typed approval line, produced by the protected
tool. Bootstrap or the Worker prepares and verifies everything before the gate and completes the permitted step
after it. Per-task Owner actions become:
- **3** for an ordinary task: brief, LAND, push;
- **4** for a governance task: brief, PROTECTED, LAND, push.

## 1. Rulings (approved 2026-10-02; not reopened)

- **G1:** a `brief-request` verb prints the R11 approval line. The Owner types it with `!`, then Bootstrap
  commits through the unchanged R11 hook gate.
- **G2:** the PROTECTED request/commit gate replaces the Owner's manual copy/hash for protected files. The
  commit is bound to the **exact approved tree ID** and refuses on any mismatch.
- **G3:** WL-2 is revised: `land` may include protected paths **only** when they are byte-identical to a
  PROTECTED-approved tree for that task.
- The rebase verb is **deferred**. BL-7 stands: Second LAND is an Owner terminal rebase.
- **Safety:**
  - Owner approval stays explicit; no self-attested records (r10 already denies every Claude write to `.git`);
  - no weakening of protected-path, commit, LAND or push controls, R11, R13, R3g or R3m;
  - approval lines only in the fixed tool-generated shape
    `! printf '%s\n' '<payload>' > '<common-dir>/pt-<kind>-approval'`.

## 2. Tool changes (`.claude/hooks/pt-land.js`; Owner-applied this one last time via copy/hash)

**G1 — `brief-request work/<id>/brief.md`** (read-only; canonical checkout only):
- Re-uses R11's own predicate set:
  - canonical on `branch-dev`;
  - `git status --porcelain=v2 --untracked-files=all` has exactly one entry, `1 A.` or `1 M.`, for that path;
  - the path matches `^work/[a-z0-9][a-z0-9._-]*/brief\.md$`;
  - no `GIT_*` overrides;
  - config and hooks are clean.
- Computes the staged blob sha256 with `git cat-file blob :<path>` (read as a Buffer).
- Prints the path, the base OID, the sha256 and the line:
  `! printf '%s\n' '<sha256> <path> <branch-dev OID>' > '<common-dir>/pt-brief-approval'`.
- It writes nothing. R11 (hook) is **unchanged**: Bootstrap then runs the plain
  `git commit -m "docs(work): …"` and R11 checks the record exactly as today (R11 already accepts the
  trailing newline `printf` writes).

**G2 — `protected-request task/<id>` and `protected-commit task/<id>`** (Worker slot only; the caller's HEAD is
`refs/heads/task/<id>`):
- **Candidates:** read from `<os.tmpdir()>/pt-<id>/protected/manifest.json`, which is
  `{"files":[{"target":"<repo-relative path>","source":"<flat file name in the same dir>"}]}`.
  - Flat source names keep candidate paths free of `.claude/…`, so R10 protected-write rules still apply to
    every Worker write.
  - **Allowed targets:** listed in the committed brief's new
    `<!-- protected-scope:begin --> … <!-- protected-scope:end -->` block, **and** each matching one of:
    `.claude/hooks/**`, `.claude/settings.json`, `.claude/rules/**`, `AGENTS.md`, `CLAUDE.md`, `.gitignore`,
    `qa/run-offline.js`, `netlify.toml`, `package.json`, `package-lock.json`.
  - **Never approvable:** `work/*/brief.md`, `CHECKPOINT.md`, `.env*`, `.claude/settings.local.json`, anything
    under `.git`.
- **`protected-request`** (writes no ref, index, worktree, record or log):
  - preconditions: self-integrity (as L2); slot status empty; brief unedited since base; manifest valid; sources
    exist; no duplicate targets;
  - builds the would-be tree in a **temporary index file under `os.tmpdir()`** (`GIT_INDEX_FILE` set only for
    the tool's own child processes): `read-tree HEAD`, then `hash-object -w` + `update-index --cacheinfo` per
    candidate, then `write-tree`. Its only side effect is unreferenced objects in the object database (allowed
    exception, stated in AGENTS.md);
  - prints the targets, the per-file sha256s and the resulting **tree OID**, plus the line:
    `! printf '%s\n' 'PROTECTED task/<id> <HEAD OID> <tree OID>' > '<common-dir>/pt-protected-approval'`.
- **`protected-commit`:**
  1. Re-runs every request check; parses the record exactly (`PROTECTED`, task, HEAD and tree must all match);
     takes the lock.
  2. Recomputes the tree from the candidates. It must equal the record tree, else refuse.
  3. Copies the sources into the slot targets; stages exactly those paths.
  4. `git write-tree` must equal the record tree, else restore the slot to HEAD for exactly those paths and
     refuse.
  5. `git -c core.hooksPath=<empty> commit -m "chore(protected): apply Owner-approved files (task/<id>, tree <short>)"`.
  6. Verifies `HEAD^{tree}` == record tree and that `HEAD^` is the recorded HEAD.
  7. Deletes the record and appends the audit line
     `{verb:'protected-commit', task, from: HEAD, to: newCommit, tree, result:'ok'}`.
  - A record is single-use: HEAD moves on success.

**G3 — `land` (L8 revision):**
- A diff path matching `PROTECTED_PATH_RES` is allowed **only if all of these hold**:
  - it is in the brief's `protected-scope` **and** `land-scope`;
  - there is an `ok` `protected-commit` audit entry for this task whose `to` commit is an ancestor of the tip
    and whose `to^{tree}` equals the entry's `tree`;
  - the path's blob at the tip equals its blob in that tree.
- Anything else under `PROTECTED_PATH_RES` (incl. any change made after approval) → refuse ("protected path not
  PROTECTED-approved: Owner LAND").
- After a Second-LAND rebase the approving commit is rewritten and is no longer an ancestor, so G3 refuses and
  the task falls back to an Owner LAND.
- `land-request` lists every protected path, its blob and the approving tree.
- `work/*/brief.md`, `CHECKPOINT.md` and `.env*` are **never** allowed.

**Shape rule:** every approval line the tool prints is produced by one function (`approvalLine(kind, payload)`)
in exactly the shape above; `buildLandApprovalLine` and `buildPushApprovalLine` delegate to it with byte-identical
output. Kinds are `brief`, `protected`, `land`, `push`.

## 3. Hook and settings (Owner-applied via copy/hash)

- **Hook:** `R12_FORM_RE` gains exactly three alternatives:
  - `brief-request work/<id>/brief.md`, where the path uses R11's pattern `work/[a-z0-9][a-z0-9._-]*/brief\.md`;
  - `protected-request task/<id>`
  - `protected-commit task/<id>`

  The task `<id>` pattern is the same as today. Nothing else changes (r9, R11, R13, R3g, R3m, R10, R12 cwd/env
  checks); the R12 deny reason may drop its form count ("four permitted forms") and nothing more.
- **Settings:** `permissions.allow` gains exactly
  `Bash(node .claude/hooks/pt-land.js brief-request *)` and
  `Bash(node .claude/hooks/pt-land.js protected-request *)`.
  `protected-commit`, `land` and `push` stay prompting, on top of their records. AH-8 is updated to match.

## 4. AGENTS.md (exact edits)

Each "old" text matches exactly once at `b583da9` when line breaks and their indentation are read as one
space. Rewrap only the edited paragraph. Keep the working-tree line endings. The `>` quote markers are not
part of the inserted text.

- **P1 — Task brief convention.** Insert a new paragraph immediately after the paragraph that starts
  `**Backlog row (required).**`:

  > **Protected-scope block (governance briefs).** A brief that changes a protected path lists each target in a `<!-- protected-scope:begin --> … <!-- protected-scope:end -->` block and also in its `land-scope` block. Only listed targets can pass the PROTECTED gate (step 13a). `work/*/brief.md`, `CHECKPOINT.md`, `.env*`, `.claude/settings.local.json` and anything under `.git` are never approvable.

- **P2 — Task folder convention (brief sequence).** Old:
  > the Owner writes the approval record (`.git/pt-brief-approval`, R11) and the Git/bootstrap Worker makes the commit through the R11 gate

  New:
  > the Git/bootstrap Worker stages the brief and runs `node .claude/hooks/pt-land.js brief-request work/<id>/brief.md`; the Owner writes the approval record (`.git/pt-brief-approval`, R11) by typing the printed line with `!`; the Git/bootstrap Worker makes the commit through the R11 gate

- **P3 — Step 13.**
  - Old:
    > A final commit that must include a DENY-tier or protected path is made by the Owner in a normal terminal.

    New:
    > A final commit that must include a DENY-tier or protected path is made by the Owner in a normal terminal, unless the brief has a `protected-scope` block — then those paths go in only through step 13a.
  - Old: `After the final commit, run`. New:
    > After the final commit — for a brief with a `protected-scope` block, after the step-13a protected commit — run

- **P4 — New step 13a.** Insert immediately before the line that starts `14. **LAND — Owner-approved (R12).**`:

  > 13a. **PROTECTED gate (only for a brief with a `protected-scope` block).** After the step-13 task commit (the slot is then clean) and before the integrity check: build each protected candidate as a flat file under `<os.tmpdir()>/pt-<id>/protected/` with a `manifest.json` (`{"files":[{"target":"<repo path>","source":"<flat name>"}]}`). Run `node .claude/hooks/pt-land.js protected-request task/<id>`, show its report, print its approval line **exactly**, and **STOP until the Owner answers**. After the Owner enters it with `!`, run `node .claude/hooks/pt-land.js protected-commit task/<id>`; it commits exactly the approved tree or refuses. Any refusal is **STOP-6**. The Worker never stages a protected path itself. The request's only side effect is unreferenced Git objects — an allowed exception.

- **P5 — Step 14.**
  - Old: `and the task diff touches no ASK- or DENY-tier or protected path:`. New:
    > and the task diff touches no ASK- or DENY-tier or protected path except PROTECTED-approved files (step 13a; the tool verifies each one against the approved tree):
  - Old: ``(the only permitted use of `!`)``. New: ``(see "The `!` rule" below)``.
  - Old: ``Otherwise (no `land-scope` block, or a protected path):``. New:
    > Otherwise (no `land-scope` block, or a protected path that is not PROTECTED-approved — including after a Second-LAND rebase):

- **P6 — The `!` rule.** Insert a new paragraph immediately after step 16 (before the paragraph that starts
  `**The Owner does not approve individual file edits`):

  > **The `!` rule.** After `!`, the Owner types only a line printed by `pt-land.js` (`brief-request`, `protected-request`, `land-request` or `push-request`) in the exact shape `! printf '%s\n' '<payload>' > '<common-dir>/pt-<kind>-approval'`, where `<kind>` is `brief`, `protected`, `land` or `push` — nothing else. Claude never writes an approval record.

- **P7 — Protection tiers.** Old: `DENY-tier files are changed only by the Owner, through the copy/hash workflow.`
  New:
  > DENY-tier files are changed only with the Owner's explicit approval: through the PROTECTED gate (step 13a, one Owner `!` line bound to the exact approved tree) or the Owner's copy/hash workflow.

- **P8 — Protected actions.**
  - Old: `An R11 brief-only commit requires the Owner's approval record.` New:
    > An R11 brief-only commit requires the Owner's approval record (the line printed by `brief-request`). A PROTECTED commit requires the Owner's PROTECTED record and is made only by `pt-land.js protected-commit` (step 13a).
  - Old: `(the hook and settings, through the Owner copy/hash workflow)`. New:
    `(the hook and settings, through the PROTECTED gate or the Owner copy/hash workflow)`.

**Unchanged:** every other `AGENTS.md` line (including the allowlist paragraph — the new verbs are "request
verbs"); `CLAUDE.md`; `BACKLOG.md`; the `LAND-EVIDENCE` format; step 10a and the `review.md`
`## Backlog reconciliation` rule.

## 5. Files — exactly 7

```
.claude/hooks/pt-land.js               G1–G3 + approvalLine (§2)        Owner-applied, copy/hash
.claude/hooks/pretooluse-guard.js      R12_FORM_RE three verbs (§3)     Owner-applied, copy/hash
.claude/settings.json                  two allow entries (§3)           Owner-applied, copy/hash
qa/pt_land_offline.js                  PL-32…PL-55 + mutants
qa/auto_mode_hardening_offline.js      AH-8 update, AH-24 rows, differential
AGENTS.md                              P1–P8 only (§4)
work/owner-one-action-gates/review.md  NEW (includes ## Backlog reconciliation: none)
```

There is **no `land-scope` and no `protected-scope` block on purpose**: this task's own diff touches protected
paths and the new gate does not exist yet, so the Owner commits and LANDs it.

**QA suites that read in-scope files as text:** `qa/auto_mode_hardening_offline.js` (settings and hook — AH-8
and the differential are updated here); `qa/pt_land_offline.js` (the tool — extended here);
`qa/instruction_layer_offline.js` (reads `CLAUDE.md` only; `CLAUDE.md` is untouched, so it survives). No other
suite reads these files.

## 6. QA (real-git fixtures; each row has a planted negative)

**G1:**
- valid → the exact line; no write;
- refuses when: two entries, unstaged changes, an untracked extra, a wrong path shape, not on `branch-dev`,
  a `GIT_*` override, a hook present;
- the printed sha256 equals what R11 accepts (end-to-end: record → plain commit → R11 allow in a fixture with
  the real hook).

**G2:**
- valid request → tree OID; nothing written except objects (refs, index, worktree, `.git` records and log are
  byte-identical);
- valid commit → `HEAD^{tree}` == approved; record deleted; audit line;
- refusal paths (each refuses and changes nothing):
  - candidate edited after request (tree mismatch);
  - stale HEAD;
  - record for another task or tree;
  - target not in `protected-scope`;
  - a never-approvable target (`work/x/brief.md`, `.env`, `.claude/settings.local.json`, `.git/x`);
  - manifest path traversal (`../`), absolute source, duplicate target;
  - slot dirty;
- a planted git hook is not executed;
- record reuse refused.

**G3:**
- LAND allowed when the protected blobs equal the approved tree;
- refused when a protected file is changed after approval, when there is no approval entry, when the approval
  is for another task, when the approving commit is not an ancestor (incl. a rebased fixture), or when its tree
  differs from the audit entry;
- `work/*/brief.md` is always refused.

**Shape:** every printed approval line matches
`^! printf '%s\\n' '[^']+' > '[^']+/pt-(brief|protected|land|push)-approval'$`; the LAND and PUSH lines are
byte-identical to today's. **Payloads are forbidden from containing `'`, `;`, `$`, a backtick or a newline**, so
a line can never carry an extra command.

**Hook:** AH-24 allows the three new exact forms and denies every wrapped, prefixed or misspelled variant. The
R12→R14 differential changes decisions only on the new-verb rows. r9 / R11 / R13 / R3g / R3m rows are
unchanged.

**AGENTS.md text checks** (scratch script under `/tmp/pt-owner-one-action-gates/`, deleted after use; results
in `review.md`): each P-new text present exactly once; each P-old text absent; step numbering reads
`13.` → `13a.` → `14.`; line endings preserved; `git diff --stat` shows only the §5 files.

**Also run:**
- full `qa:offline` at the Step-0 count;
- G1–G3 hook spawns;
- live checks:
  - **L-G1:** the next brief-only commit uses one `!` line;
  - **L-G2:** this task's own protected files go in through the **current** copy/hash flow (the new gate does not
    exist yet); the **next** governance task is the first real PROTECTED run;
  - **L-G3:** that task's LAND is one `!` line.

## 7. Flow, STOP, Definition of Done

**Flow:** Manual.
1. Step 0 (Worker B slot on `task/owner-one-action-gates`, current-guard check, baseline count);
2. `plan.md`;
3. tests first;
4. build the three DENY-tier candidates (tool, hook, settings) in the scratchpad and report their sha256s —
   the Owner copies them in after a hash check;
5. AGENTS.md P1–P8, one at a time;
6. QA, then a Worker-launched Codex read-only review;
7. step 10a: Backlog effect **`none`** — no `BACKLOG.md` edit;
8. `review.md`, including `## Backlog reconciliation` (Backlog row `none`; action `none`; entries: none; a
   one-line confirmation that no BACKLOG text changed, matching the diff);
9. the Codex final check — a missing or incorrect reconciliation is Class I;
10. **STOP before commit.** The commit stages protected paths, so the Owner makes it in a normal terminal;
    post-commit integrity is LAND evidence only; the Owner LANDs and pushes.

**STOP:**
- STOP-1..6;
- any change to r9, R11, R13, R3g or R3m semantics;
- an approval kind or line shape other than §1;
- a PROTECTED path that can stage anything not in the approved tree, or commit without an exact tree match;
- a request verb that writes anything other than unreferenced objects;
- G3 accepting an unapproved or post-approval protected change;
- any never-approvable target accepted;
- a settings change beyond the two entries;
- any `AGENTS.md` wording beyond P1–P8;
- any `BACKLOG.md` or `CLAUDE.md` change;
- a Worker write to `.claude/**` or `.git/**`.

**Definition of Done:**
- §2–§4 applied exactly; the Owner-applied files have recorded sha256s;
- all QA rows, mutants and AGENTS.md text checks PASS; full `qa:offline` PASS at the baseline count;
- `review.md` includes `## Backlog reconciliation` reading `none`;
- Codex: no unresolved Class I finding;
- STOP before the Owner's commit and LAND (this task's own protected files predate the gate).
