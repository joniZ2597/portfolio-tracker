# Task brief: R12 — Worker LAND + push through the protected `pt-land.js` tool (Owner-approved, single-use)

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Baseline | 033029152c5f2e74ecd42530e76fe0df8da3aed7 = branch-dev (R11 + DH-M4a landed); main = origin/main = fbec2c193346d7afd1dab6fd11a46b5efe55238b; origin/branch-dev = ea5a632 (14 behind) |
| Branch / slot | `task/worker-land-push`, created from this brief's commit in whichever Worker slot is refreshed to current `branch-dev` |
| Mode | **Manual** (DENY-tier hook and new DENY-tier tool; ASK-tier AGENTS.md / CLAUDE.md) |
| qa:offline | **51 → 52** (one new auto-discovered suite, `qa/pt_land_offline.js`) |
| Status | CODE-READY on Owner approval of this brief |

Objective. The same Worker conversation can close its own task:

implement → QA → Codex → gated commit → integrity → **request LAND → Owner approval → protected LAND** →
**request push → Owner approval → protected push + verify** → STOP.

- LAND and push each need an explicit, single-use approval record from the Owner, entered in the same
  conversation with Claude Code's `!` shell mode.
- Direct `git merge` / `rebase` / `pull` / `push` stay HOOK-DENY (R3m / R3g).
- `main`, production, SHIP, deploy and environment remain Owner-only and unchanged.
- Unattended Auto remains prohibited.

## 1. Rulings carried in (approved; not reopened)

| Ruling | Content |
|---|---|
| **WL-1** | Approval = two single-use, Owner-authored records in the canonical `.git/`: `pt-land-approval` and `pt-push-approval`. A hook `ask` prompt is not relied on (observed not to prompt). |
| **WL-2** | The Worker LANDs only tasks whose committed brief has a `land-scope` block and whose diff touches no ASK- or DENY-tier or protected path. All other tasks are LANDed by the Owner (or by Bootstrap as an exception). |
| **WL-3** | BL-1 and BL-5 are superseded. BL-2, 3, 4, 6 and 7 carry over. |
| **WL-4** | At LAND the tool re-runs the integrity check only. The Owner approves on the Worker's in-conversation QA and Codex evidence. |
| **WL-5** | The push request states that a `branch-dev` push publishes the public Netlify DEV deploy. The PUSH record is the explicit approval for that branch deploy (CLAUDE.md deployment policy). |
| **LV-0** | The `!` shell mode runs without a pretooluse-guard decision. The Owner enters approval lines with `!` and uses `!` for nothing else. |
| **BL-4** | Briefs carry `land-scope` / `land-tests` blocks; `review.md` ends with a `LAND-EVIDENCE:` line. |
| **BL-6** | `pt-land.js` is DENY tier (`.claude/hooks/**`), changed only through the Owner copy/hash workflow. |
| **BL-7** | If `branch-dev` moved, STOP for Second LAND (Owner rebase). The tool never rebases. |

## 2. Architecture

- **The tool, `.claude/hooks/pt-land.js`** (new, DENY tier). It has four verbs and a small module API
  used by QA:

  | Verb | Effect |
  |---|---|
  | `land-request task/<id>` | Read-only preflight (§3 L1–L11). Prints a report and the exact LAND approval line. Changes nothing. |
  | `land task/<id>` | Re-runs L1–L11, then L12–L16. Performs exactly one `git merge --ff-only` in the canonical checkout. |
  | `push-request` | Read-only preflight (§3 P1–P8), including one network read (`git ls-remote`). Prints the commits to publish, the **public DEV deploy notice** and the exact PUSH approval line. |
  | `push` | Re-runs P1–P8, then P9–P13. Performs exactly one `git push` of `refs/heads/branch-dev:refs/heads/branch-dev`. |

- **Approval records** live in the canonical common git dir (`git rev-parse --git-common-dir` from any
  worktree). They are single-line ASCII, ≤ 256 bytes, with a trailing LF/CRLF allowed:
  - `LAND task/<id> <task-tip OID 40-hex> <branch-dev OID 40-hex>`
  - `PUSH branch-dev <local branch-dev OID 40-hex> <origin/branch-dev OID 40-hex>`

  Each is single-use: it is bound to OIDs that change on success, and the tool deletes it after a
  successful action. No Claude tool can write it (R10-3c / R10-6 deny every `.git` write). The Owner
  writes it with `!`.
- **The approval line the tool prints** is the complete line the Owner types, using the canonical
  common-dir path in forward-slash form:

  `! printf '%s\n' 'LAND task/<id> <tip> <base>' > '<common-dir>/pt-land-approval'`

  `push-request` prints the same shape with `PUSH …` and `pt-push-approval`.
- **Hook rule R12** (`pretooluse-guard.js`, §4) allows only the four exact invocation forms, from a Bash
  session in a Worker slot or the canonical checkout. It denies every other command that references
  `pt-land`. R3m, R3g and every other rule are unchanged.
- **Git execution inside the tool:**
  - every git child process runs with `GIT_*` stripped from its environment (except
    `GIT_OPTIONAL_LOCKS=0` on reads);
  - with `-c core.hooksPath=<fresh empty temp dir>`, so no git hook can run;
  - with `-c push.followTags=false` on push;
  - `merge` gets `--ff-only`; `push` gets `--porcelain --no-verify`, with an explicit refspec and no
    `--force`, `--tags`, `--mirror` or `--all`.
- **Audit:** one JSON line per `land` / `push` attempt, appended to `<common-dir>/pt-land-log`:
  `{ts, verb, task|null, from, to, result, reason}`. No record contents beyond the OIDs.
- **Lock:** `<common-dir>/pt-land.lock` is created exclusively (`wx`) for `land` / `push` and removed in
  `finally`. An existing lock → refuse ("stale lock — Owner removes it").

## 3. Tool checks (all fail closed; any failure → exit 1 with a one-line reason; usage errors → exit 3)

**LAND (`land-request` = L1–L11; `land` = L1–L16):**

| # | Check |
|---|---|
| L1 | Caller context:<br>- the cwd's worktree top level is a Worker slot (`pt-wt-worker-a` / `pt-wt-worker-b`) whose HEAD is `refs/heads/task/<id>` (the same `<id>` as the argument), **or** is the canonical checkout (Bootstrap exception);<br>- the canonical root = the parent of the common dir, and its `.git` is a directory |
| L2 | **Self-integrity:**<br>- `git hash-object --path=.claude/hooks/pt-land.js <running file>` equals `git rev-parse refs/heads/branch-dev:.claude/hooks/pt-land.js`;<br>- the integrity module used in L10 is loaded from the **canonical** checkout's `qa/guard_integrity_check.js`, which L4 requires to be clean at `branch-dev` |
| L3 | `refs/heads/task/<id>` exists (tip OID) and `refs/heads/branch-dev` exists (base OID).<br>- The base must be an ancestor of the tip (`merge-base --is-ancestor`). If not → **"branch-dev moved: Second LAND (Owner rebase, R3m)"**.<br>- There must be ≥ 1 commit in `base..tip`, and no merge commits (`rev-list --merges base..tip` empty) |
| L4 | Canonical checkout: HEAD = `refs/heads/branch-dev`, and `git status --porcelain=v2 --untracked-files=all` is empty |
| L5 | Task worktree (the one with `task/<id>` checked out, if any): the status is empty, and its HEAD equals the tip |
| L6 | `work/<id>/brief.md` exists at the base (committed via the RC2 / R11 path), and its blob at the tip equals its blob at the base (the task did not edit its brief) |
| L7 | The brief at the base contains exactly one `<!-- land-scope:begin -->` … `<!-- land-scope:end -->` block with ≥ 1 repo-relative path. No block → refuse ("legacy brief: Owner LAND") |
| L8 | `git diff --name-only --no-renames base tip`:<br>- ⊆ land-scope ∪ {`work/<id>/review.md`};<br>- contains `work/<id>/review.md`;<br>- contains **no** protected path: `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `.gitignore`, `qa/run-offline.js`, `netlify.toml`, `package.json`, `package-lock.json`, any `work/*/brief.md`, `CHECKPOINT.md`, `.env*`.<br>A protected path → refuse ("protected path: Owner LAND") |
| L9 | `work/<id>/review.md` at the tip contains exactly one line matching `^LAND-EVIDENCE: qa-offline=PASS \d+; targeted=PASS; codex-classI-unresolved=0$` |
| L10 | `runIntegrity({ baseMain: <current main OID>, baseDev: base, task: 'task/<id>', root: canonical })` returns `ok`. `--since` is deliberately omitted: C2 reflog-window detection is replaced by the OID binding in L11 / L13 |
| L11 | *(`land-request` only)*: print the report (tip, base, commit count, file list, each check PASS) and the approval line. Exit 0 |
| L12 | *(`land` only)*: the LAND record exists and parses exactly, and task, tip and base equal the L3 values. Otherwise refuse ("no/stale LAND approval") |
| L13 | Take the lock, then re-read the tip, base, canonical HEAD and canonical status. All must equal the L3/L4 values (race guard) |
| L14 | `git -C <canonical> -c core.hooksPath=<empty> merge --ff-only refs/heads/task/<id>` exits 0 |
| L15 | Verify `refs/heads/branch-dev` == tip, canonical HEAD == tip, and canonical status is empty. Otherwise report "LAND verification failed" and STOP. The tool never tries to undo anything; that is the Owner's decision |
| L16 | Delete the LAND record; append the audit line; release the lock; print `LANDED task/<id> <base>..<tip>`. Exit 0 |

**PUSH (`push-request` = P1–P8; `push` = P1–P13):**

| # | Check |
|---|---|
| P1 | Caller context as L1 (any Worker slot or canonical; no task argument) |
| P2 | Self-integrity as L2 |
| P3 | Canonical: HEAD = `refs/heads/branch-dev`; status empty |
| P4 | Remote configuration:<br>- `remote.origin.url` has exactly one value, in `EXPECTED_ORIGIN_URLS = ['https://github.com/joniZ2597/portfolio-tracker.git', 'https://github.com/joniZ2597/portfolio-tracker']`;<br>- `remote.origin.pushurl` is **absent**;<br>- no `url.*.insteadOf` / `url.*.pushInsteadOf` key exists |
| P5 | Local `refs/heads/branch-dev` (L) and `refs/remotes/origin/branch-dev` (R): R is an ancestor of L, and L ≠ R ("nothing to push" otherwise) |
| P6 | `git ls-remote origin refs/heads/branch-dev` returns exactly R. Otherwise refuse ("remote moved: STOP, no automatic reconciliation") |
| P7 | `runIntegrity({ baseMain: <current main OID>, baseDev: L, root: canonical })` returns `ok` |
| P8 | *(`push-request` only)*: print `git log --oneline R..L` and the notice **"This push publishes branch-dev to origin and to the public Netlify DEV deploy (https://branch-dev--portfoliotrk.netlify.app). It never touches main or production."** Then print the approval line. Exit 0 |
| P9 | *(`push` only)*: the PUSH record parses exactly and equals `PUSH branch-dev L R`. Otherwise refuse |
| P10 | Lock, then re-read L, R, canonical HEAD and status. All must be unchanged |
| P11 | `git -C <canonical> -c core.hooksPath=<empty> -c push.followTags=false push --porcelain --no-verify origin refs/heads/branch-dev:refs/heads/branch-dev` exits 0 |
| P12 | Verify: `git ls-remote origin refs/heads/branch-dev` == L, and `refs/remotes/origin/branch-dev` == L. Otherwise STOP ("push verification failed") |
| P13 | Delete the PUSH record; append the audit line; release the lock; print `PUSHED branch-dev R..L; branch-dev == origin/branch-dev`. Exit 0 |

**`main` is unreachable by construction:**
- no code path names `refs/heads/main` except the read-only OID lookup used for `runIntegrity` `baseMain`;
- the only refs ever written are `refs/heads/branch-dev` (via ff-merge) and `refs/remotes/origin/branch-dev`.

**Module API (for QA; the CLI calls exactly these):**
`runLandRequest(opts)`, `runLand(opts)`, `runPushRequest(opts)`, `runPush(opts)`, `parseRecord(text, kind)`,
`parseLandScope(briefText)`.
- `opts` = `{ cwd, task?, gitExec?, expectedOriginUrls?, now? }`.
- `expectedOriginUrls` is a **function parameter only**; the CLI always passes the pinned constant. No
  environment variable can change it.

## 4. Hook rule R12 (`.claude/hooks/pretooluse-guard.js`)

Insert in `decide()`, after the file-tool and tool-name checks and before `analyze()`:

1. If the command text matches `/pt-land/i`:
   - the tool must be `Bash`; else deny (R12);
   - the command must match **exactly**
     `/^node \.claude\/hooks\/pt-land\.js (?:(?:land-request|land) task\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*|push-request|push)$/`,
     with no leading/trailing whitespace, env prefix, wrapper, compound, quote or escape; else deny (R12);
   - `input.cwd` must be a non-empty string and either `isWorkerSlot(cwd)`, or the R11 canonical identity
     (`repoRoot(cwd)` equals `CLAUDE_PROJECT_DIR` after `normalizePath`, and `.git` is a directory);
     else deny (R12);
   - `process.env` must contain no `GIT_ENV_OVERRIDE_RE`, R10 override or `GIT_CONFIG_*` variable; else
     deny (R12).
2. A command that passes step 1 then continues through the normal analysis unchanged (a plain `node <file>`
   is no-opinion today).
3. Every R12 denial reason starts `R12:` and ends `- run pt-land.js only in the exact form`.

Unchanged: R3g, R3m, RC2, RC4, r9, R10-1…R10-8, R11 and the file-tool guard. A direct `git merge` / `git push` /
`git -C … merge` stays denied everywhere.

## 5. Governance text (exact edits; anchors match once with line breaks as spaces; CRLF preserved)

Each "old" text below matches exactly once at `0330291` (line breaks read as spaces). Each "new" text is
inserted verbatim; the `>` quote markers are not part of the text.

- **A-1 (step 13).**
  - Heading. Old:
    > 13. **Commit on the task branch, then STOP.**

    New:
    > 13. **Commit on the task branch, then request LAND.**
  - Bullet. Old:
    > - Then **STOP**: report the implementation, QA, Codex and integrity results, and request LAND.

    New:
    > - Then report the implementation, QA, Codex and integrity results and continue with step 14.
  - Bullet. Old:
    > - The Worker never merges, rebases, pulls, pushes or lands.

    New:
    > - The Worker never runs `git merge`, `rebase`, `pull` or `push` (HOOK-DENY). It LANDs and pushes only through steps 14–15.
- **A-2.** Insert immediately after step 13's last bullet:

  > 14. **LAND — Owner-approved (R12).** If the committed brief has a `land-scope` block and the task diff touches no ASK- or DENY-tier or protected path:
  >     - run `node .claude/hooks/pt-land.js land-request task/<id>`, show its report, print its approval line **exactly**, and **STOP until the Owner answers**;
  >     - the Owner approves by typing that exact line with `!` (the only permitted use of `!`), or declines — then nothing happens;
  >     - after the Owner confirms, run `node .claude/hooks/pt-land.js land task/<id>`. Any refusal is **STOP-6**; "branch-dev moved" means Second LAND.
  >
  >     Otherwise (no `land-scope` block, or a protected path): **STOP** and request an Owner LAND.
  > 15. **Push — Owner-approved (R12).** Run `node .claude/hooks/pt-land.js push-request`, show its report — including the public Netlify DEV deploy notice and the commits to publish — print its approval line exactly, and **STOP until the Owner answers**. After the Owner enters it with `!`, run `node .claude/hooks/pt-land.js push`; it verifies `branch-dev == origin/branch-dev`. Any refusal is **STOP-6**. If the Owner declines, the task ends LANDed and unpushed. Then **STOP** with the final completion report.
- **A-3 (Owner LAND / SHIP boundaries).**
  - In the **LAND** bullet. Old:
    > run by the Owner in a normal terminal (merge/rebase/pull are HOOK-DENY, R3m).

    New:
    > run by the Worker through `pt-land.js land` after the Owner's single-use LAND record (step 14), or by the Owner in a normal terminal for tasks the tool refuses; a direct merge/rebase/pull stays HOOK-DENY (R3m).
  - Old:
    > Claude Code may prepare and request LAND; the Owner confirms it.

    New:
    > Claude Code may prepare and request LAND; the Owner confirms it by entering the LAND record.
  - In the **Push** bullet. Old:
    > is run by the Owner in a normal terminal only (R3g). One consolidated push after a batch is preferred.

    New:
    > runs only through `pt-land.js push` after the Owner's single-use PUSH record (step 15), or by the Owner in a normal terminal; a direct `git push` stays HOOK-DENY (R3g). A push publishes the public Netlify DEV deploy of `branch-dev`; the PUSH record is the explicit approval for that branch deploy. One consolidated push after a batch is preferred.
- **A-4 (Protected actions).** After the old text:
  > `git merge`, `rebase`, `pull`, and any ref move of `main`/`branch-dev` — the Owner, in a normal terminal.

  append:
  > Exception: a fast-forward LAND of `task/*` into `branch-dev` and a `branch-dev` push through `pt-land.js` under the Owner's single-use records (R12).
- **A-5 (Worker slot model).** Old:
  > - LAND, push, and every other protected action are unchanged (see "Owner LAND / SHIP boundaries"

  New:
  > - LAND and push follow steps 14–15 (R12); every other protected action is unchanged (see "Owner LAND / SHIP boundaries"

**CLAUDE.md.** After these edits, re-pin `FINGERPRINTS['CLAUDE.md']` in `qa/instruction_layer_offline.js`;
change nothing else in that file.

- **C-1 (L61).** After the old text:
  > through the r9 commit gate, as defined in `AGENTS.md`.

  insert (with one leading space):
  > A LAND or push through the R12 tool is approved by the Owner's single-use record for that action.
- **C-2 (L67).** Old routing cell:
  > Claude Code (Bash tool) in the assigned Worker slot; LAND merge/rebase and push in the Owner's normal terminal

  New:
  > Claude Code (Bash tool) in the assigned Worker slot; LAND and push through the R12 tool after the Owner's single-use records; rebase and any other merge/push in the Owner's normal terminal
- **C-3 (L129).** After the old text (the end of that Netlify bullet):
  > Read-only Netlify inspection does not require approval.

  append (with one leading space):
  > A `branch-dev` push approved through the R12 push record is that explicit approval for the resulting DEV branch deploy.

## 6. Implementation file set — exactly 8

```
.claude/hooks/pt-land.js               NEW — §2–3 (Owner-applied via copy/hash; Worker never writes it)
.claude/hooks/pretooluse-guard.js      R12 (§4) only (Owner-applied via copy/hash)
qa/pt_land_offline.js                  NEW — §7 (auto-discovered; 51 → 52)
qa/auto_mode_hardening_offline.js      AH-20 rows, mutants, R11→R12 differential (§7)
AGENTS.md                              A-1…A-5 (§5)
CLAUDE.md                              C-1…C-3 (§5)
qa/instruction_layer_offline.js        FINGERPRINTS['CLAUDE.md'] re-pin only
work/worker-land-push/review.md        NEW — tracked task evidence
```

- No settings change.
- **QA suites that read in-scope files as text:**
  - `qa/auto_mode_hardening_offline.js` (hook module and AGENTS.md path strings);
  - `qa/instruction_layer_offline.js` (CLAUDE.md anchors and fingerprint; the four anchors must survive);
  - `qa/guard_integrity_check.js` is **required**, not edited.
- This brief carries **no** `land-scope` block on purpose: R12's own diff touches protected paths, so it is
  LANDed by the Owner.

## 7. QA

**`qa/pt_land_offline.js` (new).** Real git in temp dirs under `os.tmpdir()`, with no network. The fixture
matches the integrity script's worktree-name expectations:
- a bare `origin.git`;
- a canonical clone at `<tmp>/portfolio-tracker` with `main` and `branch-dev`, containing a committed copy
  of the real `pt-land.js`, `qa/guard_integrity_check.js` and a brief with a `land-scope` block;
- linked worktrees `<tmp>/pt-wt-worker-a` (on `task/x`) and `<tmp>/pt-wt-worker-b`.

The suite calls the module API with `expectedOriginUrls: [<bare path>]` and writes approval records directly
into the fixture's `.git`.

| ID | Case | Expected |
|---|---|---|
| PL-1 | valid `land-request` from the slot | exit 0; report lists every check PASS; approval line exactly `! printf '%s\n' 'LAND task/x <tip> <base>' > '<common>/pt-land-approval'`; no ref, file or record change |
| PL-2 | valid `land` with the record | branch-dev == tip; canonical clean at tip; record deleted; one audit line; lock gone |
| PL-3 | `land` with no record / malformed / wrong task / stale tip / stale base / a PUSH record in the LAND file | refuse, nothing merged (×6) |
| PL-4 | record reuse: a second `land` with the same record after success | refuse (base moved and record deleted) |
| PL-5 | branch-dev advanced past the base (not an ancestor) | refuse "Second LAND"; nothing merged |
| PL-6 | merge commit in the task range; zero commits | refuse |
| PL-7 | canonical dirty (tracked change / untracked file); canonical not on branch-dev; slot dirty; slot HEAD ≠ tip | refuse (×5) |
| PL-8 | brief missing at base; brief edited by the task; no land-scope block | refuse (×3) |
| PL-9 | diff outside land-scope; review.md missing; a diff touching `AGENTS.md`, `.claude/hooks/x`, `package.json`, `work/x/brief.md` | refuse (×6) |
| PL-10 | LAND-EVIDENCE missing / `codex-classI-unresolved=1` / `qa-offline=FAIL` / duplicated | refuse (×4) |
| PL-11 | integrity FAIL (plant a non-sample hook; plant `core.hooksPath`) | refuse (×2); no merge; and a planted hook is proven **not executed** by the tool's own git calls (marker file absent) |
| PL-12 | race: the tip or base changes between the L11 checks and L14 (injected git runner) | refuse at L13 |
| PL-13 | existing lock file | refuse; lock not removed by the tool |
| PL-14 | self-integrity: the running `pt-land.js` differs from the branch-dev blob | refuse |
| PL-15 | valid `push-request` | exit 0; lists `R..L`; prints the exact DEV-deploy notice and PUSH line; bare origin unchanged |
| PL-16 | valid `push` | bare origin `branch-dev` == L; tracking == L; record deleted; audit line |
| PL-17 | push with no / stale / LAND-type record | refuse; origin unchanged (×3) |
| PL-18 | remote moved (bare origin advanced independently); local not ahead; `pushurl` set; `insteadOf` set; URL not in the expected list | refuse (×5); origin unchanged |
| PL-19 | origin `main` and tags unchanged after every PL case; no `refs/tags/*` pushed | asserted |
| PL-20 | CLI: usage errors → exit 3; refusals → exit 1; success → 0; unknown verb → 3 | asserted |
| PL-21 | `parseRecord` / `parseLandScope` unit rows (extra fields, lowercase/uppercase hex, >256 bytes, CRLF, BOM, two blocks) | asserted |

Every refusal row also asserts the audit/lock/record invariants: an attempted `land`/`push` logs its refusal,
and `-request` verbs never write anything.

**`qa/auto_mode_hardening_offline.js` — AH-20 (hook R12):**
- **allow (no opinion):** the four exact forms in a slot cwd and in the canonical cwd.
- **deny (R12):**
  - trailing space, double space, `./.claude/...`, an absolute path, `../portfolio-tracker/.claude/...`;
  - an env prefix, `bash -c "…"`, `npm exec`, `node -e "require('…pt-land…')"`, a compound `&&` / `;`, a pipe;
  - an escaped `pt\-land`, quoted arguments, an unknown verb, `land` without a task, a non-`task/` ref;
  - the PowerShell tool; a missing cwd; a cwd outside the slots and canonical;
  - session `GIT_DIR` / `GIT_CONFIG_COUNT` set.
- **Unchanged:** direct `git merge --ff-only task/x`, `git push origin branch-dev`,
  `git -C ../portfolio-tracker merge …` and a Claude write of `.git/pt-land-approval` (Bash redirect, Write
  tool, `node -e` fs write) all stay denied, with their existing R3m / R3g / R10 reasons.
- **Differential R11→R12:** over the full existing corpus, **0 decision or reason changes**. Only AH-20 rows
  mention `pt-land`.
- **Mutants (≥ 10), each caught:**
  - form regex widened;
  - tool check dropped;
  - cwd check dropped;
  - env check dropped;
  - `/pt-land/` trigger dropped;
  - and ≥ 5 `pt-land.js` mutants: record check skipped, ancestor check skipped, scope check skipped,
    protected-path list emptied, hooksPath override dropped.

**Also run:**
- `node qa/instruction_layer_offline.js` PASS (re-pinned CLAUDE.md fingerprint; four anchors intact);
- full `npm run qa:offline` PASS **52**;
- G1–G3 on the copied hook, with real hook-process spawns for 2 allows and 4 denies from AH-20.

**QA lesson:** each subprocess-backed check computes its result once and asserts on the stored value.

**Owner live checks** (after the Owner applies both files; restart sessions):
- **L-R1** (slot session): `bash -c "node .claude/hooks/pt-land.js push"` → blocked (R12).
- **L-R2:** `node .claude/hooks/pt-land.js push` with no record → the tool refuses ("no/stale PUSH approval");
  origin unchanged.
- **L-R3:** the Worker attempts `printf x > <common>/pt-land-approval` → blocked (R10-3c).
- **L-R4:** `node .claude/hooks/pt-land.js push-request` → report with the DEV-deploy notice and 14+ commits;
  nothing written.
- **L-R5 (first real pilot):** the next eligible task runs steps 14–15 end-to-end with the Owner's `!` lines.

## 8. Lifecycle walkthrough

| Situation | What happens | Owner action |
|---|---|---|
| Normal eligible task | commit → integrity → `land-request` report + line → Owner `!` line → `land` → LANDED → `push-request` report (DEV notice) + line → Owner `!` line → `push` → verified → STOP | two `!` lines |
| Owner declines LAND | nothing happens; task committed, not LANDed; STOP | none |
| Owner declines push | LANDed locally, unpushed; STOP; a later batch push can publish it | optional later |
| `branch-dev` moved | L3 refuses "Second LAND"; Worker STOP-6 | rebase in a terminal; Worker re-runs QA + integrity → new `land-request` (new tip → new line) |
| Legacy brief or protected diff | L7 / L8 refuse; Worker STOPs | LAND in a normal terminal |
| Dirty canonical / slot | L4 / L5 refuse | clean up, then re-request |
| Stale or missing record | L12 / P9 refuse; nothing changes | re-enter the printed line |
| Remote moved | P6 refuses; no reconciliation | investigate |
| Integrity FAIL | L10 / P7 refuse (STOP-6) | resolve; re-request |
| Tool tampered in the slot | L2 / P2 refuse | investigate |
| Several tasks LANDed, one push | the push record binds the final local OID; one push publishes all | one `!` line |

## 9. Actor-to-evidence closure

| Actor | Sees / does | Evidence |
|---|---|---|
| **Worker** | runs only the four exact forms; cannot write records (R10) or run `git merge` / `push` (R3m / R3g) | AH-20; L-R1…L-R3 |
| **Owner** | approves from a report showing tip, base, files, checks and the LAND-EVIDENCE line (LAND), or the commit list + DEV notice (push); types the tool-printed line | PL-1, PL-15 |
| **Tool** | re-verifies everything, binds to OIDs, runs git with hooks disabled, writes only branch-dev (+ tracking), deletes the record, logs | PL-2…PL-21 |
| **Repo / remote** | `branch-dev` == tip after LAND; remote == local after push; `main` and tags untouched | PL-2, PL-16, PL-19 |
| **Audit** | `.git/pt-land-log` has one line per `land` / `push` attempt | PL-2, PL-16 and every refusal row |

## 10. Contradictions resolved by §5

- AGENTS.md step 13: "The Worker never merges … pushes or lands" → steps 14–15.
- AGENTS.md LAND/Push bullets: "run by the Owner in a normal terminal only" → the R12 tool or the Owner.
- AGENTS.md Protected actions: the merge/ref-move bullet gains the R12 exception.
- AGENTS.md slot model: "LAND, push … are unchanged" → steps 14–15.
- CLAUDE.md routing row: "LAND merge/rebase and push in the Owner's normal terminal" → corrected.
- CLAUDE.md Netlify policy: "every Netlify write requires explicit Owner approval — including branch
  deploys". A push publishes the DEV branch deploy; the PUSH record is that explicit approval (WL-5 / BL-3).
- CLAUDE.md L61 / L132 ("push … requires approval"): satisfied by the single-use record (C-1).

## 11. Worker flow and closure

1. **Step 0:** assigned slot on `task/worker-land-push` at this brief's commit; current-guard check;
   baseline `qa:offline` = 51.
2. **`plan.md`:** requirement→test map plus the CLAUDE.md pre-flight checklist.
   - Gate Verification: name R12's predicate and the tool's record predicate.
   - Definition of Done: §12.
3. Tests first.
4. Build the **`pt-land.js` and hook candidates in the Worker scratchpad**. Report both sha256s. The Owner
   copies them into the slot after a hash check. The Worker never writes `.claude/hooks/**`.
5. AGENTS.md / CLAUDE.md edits (Manual), the fingerprint re-pin, then targeted QA, the differential and the
   mutants.
6. Worker-launched Codex read-only review of the implementation diff, including both candidates. Resolve
   findings FIX / DEFER / REJECT.
7. Full `qa:offline` (52), G1–G3, `review.md` (pre-commit evidence only), then the Codex final check.
8. **STOP before commit.** The final commit stages `.claude/hooks/**`, so the Owner makes it in a normal
   terminal (RC2). The Owner runs post-commit integrity as LAND evidence (not in `review.md`), then LANDs and
   pushes R12 in a normal terminal. R12 cannot land itself.
9. After LAND, the Owner runs L-R1…L-R4; L-R5 happens on the next eligible task.

## 12. STOP conditions

- **STOP-1..5** per AGENTS.md, including any file outside §6 or any governance wording beyond §5.
- **STOP-6:**
  - any hook denial, safety-classifier block, or integrity-check FAIL;
  - any Manual fallback trigger;
  - the Owner becoming unavailable.

  Never retry in another form.
- Any change weakening R3g, R3m, RC2, RC4, r9, R10-1…R10-8 or R11.
- Any path in the tool that can:
  - write a ref other than `refs/heads/branch-dev` / `refs/remotes/origin/branch-dev`;
  - push anything but the explicit branch-dev refspec;
  - use force, tags or mirror;
  - rebase or resolve a conflict;
  - touch `main`;
  - run git hooks;
  - accept an env or config override of the origin URL, record path or protected-path list.
- A tool action without a matching single-use record, or a `-request` verb that writes anything.
- A Worker write to `.claude/hooks/**`, `.claude/settings*.json` or `.git/**`.
- Any settings change.
- A `CLAUDE.md` change beyond C-1…C-3, or any `instruction_layer` change beyond the fingerprint value.
- A differential change outside AH-20.
- `qa:offline` ≠ 52.
- Any push, merge, rebase, LAND, deploy, environment or `main` action by the Worker in this task.

**Definition of Done:**
- `pt-land.js` and R12 are implemented exactly per §2–4 in Owner-applied files, with recorded sha256s.
- AGENTS.md and CLAUDE.md carry exactly the §5 edits; the fingerprint is re-pinned.
- PL-1…PL-21 and AH-20 pass, with their mutants; the differential shows 0 changes; full `qa:offline` PASS 52;
  G1–G3 PASS.
- Codex: no unresolved Class I finding.
- STOP before the Owner's final commit.
- Post-commit integrity is reported as LAND evidence only.
