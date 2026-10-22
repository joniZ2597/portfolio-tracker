# AGENTS.md — Portfolio Tracker / Pulse (simplified workflow)

Shared guidance for Claude Code and Codex on this repo. Effective 2026-09-18, this replaces
the old ARC/registry/claim workflow as the active default (see `CLAUDE.md` FROZEN LEGACY
section for that history).

## Repo orientation

- Single-page app: `index.html` (client), `netlify/functions/` (server functions), `services/`
  (shared server-side helpers).
- `qa/` holds offline QA scripts, one per feature area (`qa/run-offline.js` is the aggregate
  runner).
- `CHECKPOINT.md` is local-only, gitignored legacy historical context from the old ARC
  workflow — useful background, but not authoritative. Current operational truth comes from
  Git (branches, log, diff), active worktrees, task evidence, and QA/review results — and the
  `work/<id>/` task-folder convention (see "Task folder convention" below). Never commit or
  recreate `CHECKPOINT.md` elsewhere.
- Task branches/worktrees should normally be based on `branch-dev`, the integration branch.
  Moving anything to `main`/production always requires separate, explicit Owner approval.
- `BACKLOG.md` is the canonical product backlog / queue of intent. It does not override Git,
  active worktrees, task evidence, QA, or review evidence as operational truth.

## Task brief convention

Before implementing, state in plain language: what file(s) will change, the smallest scoped
diff that satisfies the request, and how it will be validated. See "Task folder convention"
below for how this becomes an Owner-approved `work/<id>/brief.md`.

**QA suites that read in-scope files as text:** `<list or none>`, and whether their assertions
survive. *(Dependency sweeps that check only `require()`/import miss this class — a suite can
read a file it never imports.)*

**Backlog row (required).** Every brief has a Backlog row naming the `BACKLOG.md` entry or entries it concerns and the expected effect: `close`, `partial` or `none`. If the effect is `close` or `partial` — or the task may otherwise change `BACKLOG.md` — `BACKLOG.md` is listed in the brief's implementation file set **and** its `land-scope` block. If the effect is `none`, the task makes no `BACKLOG.md` edit; a stale entry discovered along the way is recorded as a `[backlog]` lesson.

**Protected-scope block (governance briefs).** A brief that changes a protected path lists each target in a `<!-- protected-scope:begin --> … <!-- protected-scope:end -->` block and also in its `land-scope` block. Only listed targets can pass the PROTECTED gate (step 13a). `work/*/brief.md`, `CHECKPOINT.md`, `.env*`, `.claude/settings.local.json` and anything under `.git` are never approvable.

**Execution preflight block (required).** Every brief lists, per slice and for step 0, step 10, §L
and closure, the commands, tools, scratch files and paths it needs, each classified as: **A**
auto-approved by `.claude/settings.json` · **B** a Claude Code permission prompt · **C** a governance
gate (R11 / R12 records, PROTECTED gate, Owner ruling) · **D** hook-denied (must
not appear). B items are minimised: checks run as allow-listed suites or with the Read / Grep tools;
a one-time proof is one scratch script under `/tmp/pt-<task-id>/` run once per checkpoint; the brief
is self-contained so the Worker reads nothing outside its slot. The only scratch location is
`/tmp/pt-<task-id>/`, except the step-13a protected candidates, which `pt-land.js` reads from
`<os.tmpdir()>/pt-<id>/protected/`. The block states that slice-to-slice continuation needs no Owner input when
the gates PASS, and lists the expected prompts separately from the C gates.

**Execution readiness block (required).** Every brief states `ATTENDED-ONLY` or `UNATTENDED-READY`.
`UNATTENDED-READY` requires that every Owner gate on the brief's path is enforced by a technical
control (hook, `deny` / `ask` rule, remote-side rule, sandbox, separate credentials) — never by
written instructions or by the Auto-mode safety classifier. While indirect script execution (T6),
approval-record forgery, external network transfer or secret access remains technically unmitigated
on the brief's path, the brief is `ATTENDED-ONLY`.

**Multi-slice Master briefs.** One brief may hold several ordered slices (Owner rulings M-1…M-5).
It adds placement conditions; an open-decisions list that is empty at approval; an entry condition
per slice; one checkpoint commit per completed slice on `task/<id>` through the r9 gate
(`wip(<id>): slice <k> <name> — checkpoint`, never amended); and the pre-authorised "close at the
last passed slice" option (M-4). Each slice runs RED → implement → targeted QA → Codex on the slice
diff → checkpoint. The Worker continues to the next slice without returning only when the slice's
targeted tests and re-pins pass, no Class I finding is unresolved, the next entry condition holds
and the repository still matches the brief's anchors; anything else is handled by the STOP list.
The Master closes once: the step-10 full `qa:offline` on the final synchronised tree, `review.md`
with one section per slice, the final Codex check on the whole diff, the step-13 commit, the
integrity check, and LAND / push / cleanup under R12. A gap found inside a running Master follows
M-5: it is recorded as a `[backlog]` / `[design]` lesson; a new slice needs a new brief.

## Worker execution contract

Once a tracked, Owner-approved `brief.md` exists, the Worker executes the whole task inside
that scope and returns to the Owner only at the step-13 STOP (after its gated task-branch
commit) or on a STOP condition below.

**Before writing any implementation code:**

0. **Worktree bootstrap — automatic, pre-authorized.** Confirm the session's cwd is the assigned
   Worker slot (see "Worker slot model") with the task branch checked out. Then run `node qa/guard_integrity_check.js --task task/<id> --root <canonical checkout> --print-record`; a missing or invalid task-base record is **STOP-6** (Bootstrap runs `task-start`, or the Owner adopts the task). If `node_modules/`
   is missing or older than `package-lock.json`, run `npm ci` (it touches only the gitignored
   `node_modules/`). Then run `npm run qa:offline` once, before any edit, and record the result
   and suite count on the first line of `work/<id>/qa.log` as the pre-edit baseline every
   Definition of Done is measured against. A red pre-edit baseline is an **M4** transition
   (diagnose first), not a STOP. A harness permission prompt for any of these steps is answered
   under this authorization; it is not an Owner decision.
   **Baseline reuse (instead of that run).** The Worker may reuse one earlier full `qa:offline`
   PASS only when all four conditions hold, each shown by the command named and recorded verbatim
   under line 1 of `qa.log`:
   - **Tree:** `git diff --name-only <reused tree> HEAD` lists only QA-inert paths (`work/**`,
     `BACKLOG.md`). For a previous task's step-10 run, the reused tree is that task's LAND tip,
     and its `review.md` must record that only QA-inert files changed after that run.
   - **Suites:** the same diff limited to `qa package.json package-lock.json` is empty, and the
     reused suite count is the expected step-0 count.
   - **Environment:** `node --version` is recorded; `node_modules` has not been refreshed since the
     run; and `node qa/git_contract_offline.js` and `node qa/fixture_template_offline.js` both still
     print `SKIP (contract pinned: …)` with the pinned environment digest, and the four E1-gated
     suites print their `E1 … SKIP (contract pinned: …)` lines.
   - **Same slot:** the run was made in this slot; `git reflog` shows nothing since but commits and
     the switch onto this task; and every tracked file that switch rewrote has the same
     `sha256sum` as at the run.
   The reused run must be the most recent full `qa:offline` run in this slot, and a PASS. Line 1
   then reads `STEP-0 REUSED: PASS <n> suites · source <slot>/<task> · tested tree <oid> · HEAD
   <oid> · node <version>`. If any condition fails or cannot be shown, run the full step 0. If the
   step-10 run later fails in a suite the task did not touch (**M4**), the Worker first establishes
   whether that failure pre-exists on the base before treating it as the task's. Reuse never
   replaces the step-10 full run, nor a full run required after a resync.
1. **Requirement → test map.** Every requirement in the brief maps to at least one named
   assertion, and every assertion maps back to a requirement. Write it to `work/<id>/plan.md`.
   An orphan test is drift; an unmapped requirement is an untested requirement.
2. **Conventions: followed and overridden.** Name the repository patterns this task follows,
   by file and function — and name every convention the brief **deliberately overrides**.
   **The brief wins over repo precedent.** Importing a convention the brief overrode is a
   defect, not a default.
3. **Tests first.** Write the assertions and watch them fail before the implementation exists.

**Then, autonomously and without Owner approval, inside the approved file set:**

4. Implement.
5. Run the targeted `test:<area>` script(s) until green.
6. Fix what the tests find. Ordinary implementation decisions are the Worker's.
7. **Fresh-context self-review** — re-read the brief and the complete diff as if seeing them
   for the first time, against the requirement→test map. Record what changed as a result.
8. **Codex review on the real diff** (never on a plan or a description). Capture the raw
   response verbatim in `work/<id>/codex.md`.
    - **The Worker launches the separate Codex read-only review process itself.** The review is
      independent and read-only; it inspects the actual diff, the brief, the review artifact and
      the QA evidence. **This is the default for every Worker task.** If a task genuinely cannot
      launch a separate Codex review process, **the brief must state that exception and its
      reason** — it is not decided at execution time.
9. Classify every finding **FIX / DEFER / REJECT** (see "Codex findings" below) and resolve
   every FIX autonomously.
10. Run full `npm run qa:offline`.
10a. **Backlog reconciliation (mandatory).** Check the brief's Backlog row against the finished work. If the effect is `close` or `partial`, update `BACKLOG.md` in this task, and only: the affected entry's heading/status text, plus — when an entry closes — one line in DONE / HISTORY, in entry-number order, of the form ``**<n>** <title> — `work/<id>/` ``. Never edit the snapshot table, counts or unrelated entries. If the finished work's effect differs from the brief's Backlog row and `BACKLOG.md` is not in scope, that is **STOP-1**. If the effect is `none`, make no `BACKLOG.md` edit. Record the result in `review.md` (step 11).
11. Write `work/<id>/review.md`.
12. Run one final lightweight Codex check against the task diff (the sole, authoritative
    "complete final diff" defined under "Codex as diff reviewer" above) — since `review.md`'s
    own content, and any late touch-ups it prompts, have not yet been reviewed. Classify every
    finding before editing.
    - **Class I** (implementation, scope, security, correctness, brief conflict, or a missing or incorrect backlog reconciliation): FIX /
      DEFER / REJECT as above. A FIX to an implementation file re-runs the relevant QA and gets
      one more Codex pass **scoped to the changed hunks only** — a deliberate, narrower
      exception to "Codex must receive every part of whichever diff applies," which governs the
      task-diff check this step opens with, not this follow-up re-pass. **This final-check
      Codex pass, and the one scoped re-pass a Class I FIX may earn, are the only Codex rounds
      this step performs** — step 8's earlier implementation-diff review is a separate, prior
      round and is not counted against this limit. Findings from the scoped re-pass are
      classified under the same FIX/DEFER/REJECT rule: DEFER and REJECT close normally. If the
      scoped re-pass finds a new Class I FIX requiring another implementation change, do not
      apply it and do not start a third Codex round. Record it in `review.md` as an unresolved
      Class I finding and surface it at the step-13 STOP for Owner ruling, **without
      committing** — this does not create a new return point; it is a STOP only if one of
      STOP-1..6 independently applies. Record one line in `review.md` for a round with at least
      one class-I finding and no class-II findings: `Final check: N rounds, M class-I findings —
      X FIX, Y DEFER, Z REJECT, U unresolved; QA/re-pass performed where required; no class-II
      findings.`
    - **Class II** (documentation-only, in `review.md`): fix, then self-check — every
      `work/<id>/` path named exists and is one of the five canonical files; every count
      matches a line in `qa.log`; no section reads "Pending" or "TBD" (a lesson line matching
      `[backlog] <lesson text> — pending routing` is exempt) — and record one line in
      `review.md`: `Final check: N rounds, M class-II findings fixed, self-checked; no
      implementation change, no QA re-run.` **No further Codex.**

    A class-II fix that changes a claim about the implementation — a DoD tick flips, a file
    count changes, a finding is reclassified — is class I by definition: it re-enters step 9's
    FIX/DEFER/REJECT rule, including the QA re-run and the one scoped Codex re-pass a FIX earns,
    before `review.md` is finalized. It does not resolve silently inside the class-II
    self-check. **When a round mixes both classes, the summary line states the class-I outcome
    instead of the class-II line above** — e.g. `Final check: N rounds, M class-II findings
    fixed, 1 reclassified class-I (QA re-run + scoped Codex re-pass), self-checked.` **Three
    summary-line forms exist — class-II-only (above), mixed (above), and pure class-I (in the
    Class I bullet above)** — each used only for the round shape it names; the unmodified
    class-II line is used only for a round with zero class-I findings or reclassifications.

12a. **Final report.** When the final Codex check returns **PASS**, continue to step 13. The report is delivered at the step-13 STOP.

**Then, at the commit boundary — gated, never bypassed:**

13. **Commit on the task branch, then request LAND.**
    - Commit only in the Worker's own slot, with HEAD on `task/<id>`, through the r9 commit gate
      (HOOK-DENY).
    - Stage explicit paths with `git add` in one call, then run a plain `git commit -m "…"` in a
      separate call. Never amend; never stage a protected path.
    - A final commit that must include a DENY-tier or protected path is made by the Owner in a
      normal terminal, unless the brief has a `protected-scope` block — then those paths go in only
      through step 13a.
    - A gate denial of the commit's *form* (nothing ran - for example `git add … && git commit …` in one
      call) is a form denial under STOP-6 below: reissue it as the two calls above. Any other gate
      denial is **STOP-6**.
    - After the final commit — for a brief with a `protected-scope` block, after the step-13a
      protected commit — run
      `node qa/guard_integrity_check.js --task task/<id> --root <canonical checkout>` — base, start time and `main` come from the task-base record; never pass `--base-dev`, `--since` or `--base-main` (a value that differs from the record is a MISMATCH FAIL). A task without a record (opened before records existed and not adopted) uses `--base-main <main oid> --base-dev <actual task base> --task task/<id> --since <task-start ISO> --root <canonical checkout>` with the values from its handoff.
      Any FAIL is **STOP-6**.
    - The integrity result is **LAND evidence**: report it only in the step-13 STOP report (the `CLAUDE.md` task-completion report). It is never written into `review.md` — no amend, and no second commit made only to record it — and `review.md` does not list it as pending.
    - If a FAIL comes from a baseline or ruling issue that the Owner resolves, and a re-run PASSes without any implementation change, the task proceeds to LAND with the original task commit unchanged.
    - Then report the implementation, QA, Codex and integrity results and continue with step 14.
    - The Worker never runs `git merge`, `rebase`, `pull` or `push` (HOOK-DENY). It LANDs and pushes only through steps 14–15.

13a. **PROTECTED gate (only for a brief with a `protected-scope` block).** After the step-13 task commit (the slot is then clean) and before the integrity check: build each protected candidate as a flat file under `<os.tmpdir()>/pt-<id>/protected/` with a `manifest.json` (`{"files":[{"target":"<repo path>","source":"<flat name>"}]}`). Run `node .claude/hooks/pt-land.js protected-request task/<id>`, show its report, print its approval line **exactly**, and **STOP until the Owner answers**. After the Owner enters it with `!`, run `node .claude/hooks/pt-land.js protected-commit task/<id>`; it commits exactly the approved tree or refuses. Any refusal is **STOP-6**. The Worker never stages a protected path itself. The request's only side effect is unreferenced Git objects — an allowed exception.

14. **LAND — Owner-approved (R12).** If the committed brief has a `land-scope` block and the task diff touches no ASK- or DENY-tier or protected path except PROTECTED-approved files (step 13a; the tool verifies each one against the approved tree):
    - run `node .claude/hooks/pt-land.js land-request task/<id>`, show its report, print its approval line **exactly**, and **STOP until the Owner answers**;
    - the Owner approves by typing that exact line with `!` (see "The `!` rule" below), or declines — then nothing happens;
    - after the Owner confirms, run `node .claude/hooks/pt-land.js land task/<id>`. Any refusal is **STOP-6**; "branch-dev moved" means Second LAND: STOP for the Bootstrap re-sync (see "Owner LAND / SHIP boundaries").

    Otherwise (no `land-scope` block, or a protected path that is not PROTECTED-approved — including after a Second-LAND rebase): **STOP** and request an Owner LAND.
15. **Push — Owner-approved (R12).** Run `node .claude/hooks/pt-land.js push-request`, show its report — including the public Netlify DEV deploy notice and the commits to publish — print its approval line exactly, and **STOP until the Owner answers**. After the Owner enters it with `!`, run `node .claude/hooks/pt-land.js push`; it verifies `branch-dev == origin/branch-dev`. Any refusal is **STOP-6**. If the Owner declines, the task ends LANDed and unpushed. Then run step 16.
16. **Cleanup.** After a verified push, run `node .claude/hooks/pt-land.js cleanup task/<id>` — it archives the task's ignored evidence (`plan.md`, `codex.md`, `qa.log`) to `pt-work-artifacts/<id>/`, detaches the slot at `branch-dev` and safely deletes the local task branch. A refusal is reported, not retried. Then **STOP** with the final completion report.

**The `!` rule.** After `!`, the Owner types only a line printed by `pt-land.js` (`brief-request`, `protected-request`, `land-request`, `push-request` or `adopt-request`) in the exact shape `! printf '%s\n' '<payload>' > '<common-dir>/pt-<kind>-approval'`, where `<kind>` is `brief`, `protected`, `land`, `push` or `adopt` — nothing else. Claude never writes an approval record. The R11 line also opens the task's execution envelope (see "Execution envelope" below); that changes no record, format or check.

**The Owner does not approve individual file edits, inspect code previews, relay Codex
findings, or decide ordinary in-scope implementation questions — LAND approval remains the
Owner's; task-branch commits follow the r9 gate (step 13), as they already are under "Protected
actions" and "Owner LAND / SHIP boundaries" below.**

**The Owner is never a relay for review or troubleshooting context.** Diff, brief, QA evidence, `codex.md` and any
other review material are provided by the Worker directly to the Codex review process. The Owner
is not asked to copy them into a separate conversation when the Worker can supply them itself.

### Execution envelope (one Owner act per task)

This subsection applies to a task whose R11 brief-only commit is made after this subsection is on
`branch-dev`. It changes no hook, tool, record format, check, `ask` rule or permission, and
Claude never writes an approval record. It is used only when MAIN — the Owner-facing session that
coordinates Bootstrap and the Workers and keeps the task's handoff ledger — coordinates the task;
otherwise every transition below needs the Owner's go-ahead as before. It is **ATTENDED-ONLY**:
the Owner is present for the whole envelope (see "Worker mode policy").

**Opening act.** The Owner reviews the task's package, answers every open decision in it, and
then types the task's R11 `!` line. That one act approves the exact brief (the sha256, path and
`branch-dev` oid in the line) and authorizes, for that task only, these routine transitions:

- (a) Bootstrap's R11 brief-only commit of exactly that brief;
- (b) slot assignment and `git -C <slot> switch -c task/<id> <base>` from the current `branch-dev`;
- (c) bare `task-start`;
- (d) MAIN's assignment message to the Worker;
- (e) MAIN's QA-slot grants (the check before every heavy run under "Test commands" still applies);
- (f) the Worker's step-13 r9 commit, staging only paths listed in the brief's `land-scope` block
  (`protected-scope` paths enter only through step 13a). Immediately before the commit the Worker
  checks that `git diff --cached --name-only` lists only `land-scope` paths, and MAIN verifies the
  same staged list before the commit and the committed list after it. On a mismatch the commit
  does not run (V2);
- (g) the step-13 integrity check and `land-request`;
- (h) a Second-LAND `resync` by Bootstrap (see "Owner LAND / SHIP boundaries"; a refusal is a STOP),
  and the Worker's re-run QA, integrity check and new `land-request` that follow it;
- (i) `cleanup` after a verified push of this task.

Permission prompts on these steps still appear, and the Owner answers them at the machine.
Answering one is not a new decision and never widens the envelope.

**Never covered:** LAND, PUSH, PROTECTED, ADOPT, any STOP ruling, destructive Git, any Netlify
write, live external canaries, `main`/production/SHIP, any governance, hook, settings or
permission change, and any unattended operation.

**Expiry.** (a)–(g) are authorized until the first of: 72 hours after the committer time of the
task's R11 commit (`git log -1 --format=%cI <commit>`), or the `land-request` report. (h) and
(i) stay authorized after `land-request` only until this task is pushed and cleaned up, or its
LAND or PUSH is declined, or refused for any reason other than Second LAND. Expiry is a STOP, not
a failure. The Owner either renews the envelope with a one-line ruling naming the task and a new
end time, or ends the task.

**Synchronization wait.** The synchronization requirement is not relaxed. When a brief's
task-start checks require `branch-dev` = `origin/branch-dev` and they differ (for example because
of the R11 commit itself), (b) and (c) wait. They continue only after a separate PUSH approved by
the Owner with its own PUSH record. The envelope never covers that PUSH. MAIN records the wait and
the PUSH in the ledger. The wait does not pause the expiry.

**Void conditions.** Any one voids the envelope. The agent that detects it STOPs with the
five-line STOP message and makes no further change. MAIN records the void in the ledger with the
evidence named below. No routine transition runs until the Owner act in the last column, which
MAIN also records verbatim.

| # | Condition (how it is tested) | Ledger evidence | Fresh Owner act |
|---|---|---|---|
| V1 | Content or base: the sha256 of the committed brief blob, the task record's `briefSha256` (`--print-record`), or the brief blob the Worker checks at assignment differs from the sha256 in the R11 line; the record's `briefPath` differs from the line's path; the R11 commit's parent differs from the line's oid; or the record's `base` differs from the `branch-dev` oid used at (b) | the line's sha256, path and oid; the differing value and where it was read | a ruling. If the brief must change: a new brief and a new R11 line (a new envelope) |
| V2 | Scope: an edit outside the brief's file set (STOP-1), a gap-rule case, or a step-13 staged set (`git diff --cached --name-only`) that is not a subset of `land-scope` | the offending paths; the staged list | a STOP-1 ruling. A ruling that leaves the file set, `land-scope`, `protected-scope` and objective unchanged restores the envelope; any other change needs a new brief |
| V3 | Review: an unresolved Class I finding at step 12, or an unresolved security finding from the brief review that the approved package did not disposition | the finding text and its `review.md` line | a ruling at the step-13 STOP; (f) does not run before it |
| V4 | QA: a step-0 or step-10 `qa:offline` FAIL not shown under M4 to pre-exist on the base, a step-10 count different from step 0 (or from the count the brief states), or a land-test FAIL | the `qa.log` line, both counts, the failing suite | a ruling |
| V5 | Guard: a hook denial other than a logged form denial, an Auto-mode classifier block, an integrity FAIL, or a `task-start` or `resync` refusal | the denial or refusal text verbatim | a STOP-6 ruling. A re-run PASS with no implementation change then continues the envelope (step 13) |
| V6 | `branch-dev` moved: a commit in `<R11 commit>..branch-dev` that neither came in through a LAND (this task's or another task's) logged in the land tool's audit log nor is another task's single-file `A work/<other>/brief.md` R11 commit; or any later commit that touches `work/<id>/brief.md`. (An unpushed R11 commit is not a void; see "Synchronization wait") | the offending oids and the audit-log lines checked | a ruling. An amended brief is a new brief and a new R11 line (a new envelope) |
| V7 | Expiry, as above | the R11 commit time, the expiry time, the step reached | a renewal ruling, or the task ends |
| V8 | Owner: a ruling that changes scope or objective; a session mode the brief does not set, or any unattended operation; the Owner becoming unavailable | the ruling verbatim, or the mode or absence observed | scope or objective: a new brief. Mode or absence: a resume ruling when the Owner is back |

**Audit.** MAIN's ledger holds, in order:
- `ENVELOPE OPEN <id>`, followed by the R11 line verbatim, the R11 commit oid and committer time, the scope `(a)–(i)` and the expiry time;
- one line per routine transition: `ENVELOPE <id> <letter> <UTC time> <result> <evidence>`. The evidence is the commit oid, record sha256, QA count, slot grant or release, or the `land-request` tip and base;
- one line per void: `ENVELOPE <id> VOID V<n> <UTC time> <evidence>`, then the Owner act verbatim;
- `ENVELOPE CLOSED <id> <reason>`.

The repository evidence is unchanged: the R11 commit, the task record and the land tool's audit
log, `review.md`, and the step-13 integrity result.

## Worker mode policy

Every brief sets `Mode: Manual` or `Mode: Auto`.

- **Manual** — Claude Code `default` mode, every action approved — is the project default.
- `Mode: Auto` *permits* the Owner to run the session in **attended Auto** or `acceptEdits`. It never
  requires it.
- **Attended** means the Owner is at the machine and responsive for the whole session.
- **Unattended Auto is not permitted**: scheduled, background, cloud, overnight, or any session left
  running without the Owner. It stays prohibited until remote-side prevention exists (for example a
  GitHub ruleset blocking direct pushes to main, or Worker sessions without push-capable credentials).
  The command-text hook cannot stop a Worker-written script from invoking git (T6), and the integrity
  check is detection, not prevention.
- **Attended Auto readiness** and **unattended readiness** are separate. Attended Auto needs a
  `Mode: Auto` brief, the Owner present, and the always-prompt rules below in force. The Owner's
  presence, the integrity check and the audit log are what cover T6 and approval-record forgery
  there. Unattended runs additionally need technical mitigation of each of: indirect script
  execution, approval-record forgery, external network transfer and secret access. Written rules
  and the Auto-mode safety classifier are never counted as security boundaries.

**`Mode: Auto` eligibility — all must hold:**
- an approved, committed brief with explicit files and STOP conditions;
- bounded product or QA work;
- offline QA only;
- no schema, persistence, architecture, contract, scoring or ranking change;
- no ASK- or DENY-tier file in scope;
- no environment, runtime, live-API, deploy, `main` or external mutation;
- every Owner ruling already exists;
- the session runs in its own slot under the current guard (see "Worker slot model").

**Manual fallback triggers (an Auto or `acceptEdits` session only — there every hook denial, a form denial included, is a trigger; the form-denial continuation under STOP-6 applies only in Manual sessions) — any one → STOP-6, then Manual:**
- an architecture, schema, persistence, contract or scoring surface (M5);
- any ASK- or DENY-tier file;
- an Owner-ruling conflict or a missing ruling;
- committed evidence contradicting the plan (M6);
- any hook denial, Auto-mode safety-classifier block, or integrity-check FAIL;
- any environment, runtime, live-API, deploy or `main` need;
- the current-guard check failing;
- the Owner becoming unavailable (the session ends; it never continues unattended).

PLAN, IMPLEMENT and MANUAL remain **postures** inside any mode.

**Auto-approved commands (settings allowlist).** Read-only inspection (`grep`, `cat`, `head`, `tail`, `wc`, `ls`, `diff`, `cmp`, `sha256sum`, and `git status|log|diff|show|rev-parse|ls-files`), offline QA (`npm run qa:offline`, `npm run test:*`, `node qa/*_offline.js`, `node qa/*_test.js`, `node qa/guard_integrity_check.js …`, `node qa/tools/index-pins.js --check|--update|--diff …`), Codex read-only review (`codex exec --sandbox read-only …`), scratch under `/tmp/pt-<task-id>/`, and the `pt-land.js` request and cleanup verbs run without a prompt. Everything else prompts in Manual. **Always prompt, in every mode including Auto** (`ask` rules): `pt-land.js land` and `push`, `netlify env:get|list`, `curl`, `wget`, `Invoke-WebRequest`, `Invoke-RestMethod`. Bypass-permissions mode is disabled. A Worker session never accepts an "always allow" for a non-read-only command. The hook and the `deny` rules block; `ask` rules force an Owner prompt in every mode; written rules and the Auto-mode safety classifier are not boundaries. `sed` is deliberately not auto-approved; use the Read tool for line ranges.

### Protection tiers — the enforced layer

| Tier | Enforced by | Covers |
|---|---|---|
| **HOOK-DENY** | PreToolUse hook, exit 2, every Claude Code session — the only deterministic boundary | push (R3g); merge/rebase/pull (R3m); destructive git; checkout/switch to main; ref moves of main/branch-dev (RC4, R10-4, R10-5); commits outside the r9 gate (R3c); unknown git subcommands (R10-2); escaped forms (R10-1); git config execution paths (R10-3); `.git` writes by any tool (R10-3c, R10-6); PowerShell rules (R2, R2b); wrappers and stdin-fed interpreters; Netlify writes and protected-file writes from Worker slots |
| **DENY** | `deny` | `.claude/settings.json` · `.claude/settings.local.json` · `.claude/hooks/**` |
| **ASK** | `ask` | `CLAUDE.md` · `AGENTS.md` · `.gitignore` · `.claude/rules/**` · `qa/run-offline.js` · `netlify.toml` · `package.json` · `package-lock.json` · `work/*/brief.md` (once approved/committed) |
| **ORDINARY** | the approved brief | everything else in the approved brief |

`ask` is a convenience, not a safety boundary: it has been observed not to prompt. A brief that lists
any ASK- or DENY-tier file is `Mode: Manual`. DENY-tier files are changed only with the Owner's
explicit approval: through the PROTECTED gate (step 13a, one Owner `!` line bound to the exact
approved tree) or the Owner's copy/hash workflow.

**The brief-listing rule:** an ASK-tier file may be edited only if the approved `brief.md`
lists it by path. Listed → the brief is `Mode: Manual`; the Worker adopts the MANUAL posture for
that edit and continues once the Owner approves the action — no STOP unless one of the six STOP
conditions fires independently. Not listed → **STOP-1**, edit outside approved scope. The Worker
does not amend its own scope.

### Working postures — the behavioural layer, not enforced

| Posture | What the Worker does | Enforced by |
|---|---|---|
| **PLAN** | Reads, traces, builds the requirement→test map. Writes no code | nothing — discipline |
| **IMPLEMENT** | Implements autonomously inside the approved file set | the approved brief |
| **MANUAL** | Slows down: one edit at a time, re-reads the surrounding contract first | Manual mode for ASK/DENY-tier files. Discipline elsewhere |

**MANUAL is not STOP.** MANUAL means the Worker proceeding more carefully. STOP means
returning to the Owner, and happens only on the six STOP conditions below. A Worker that hands
back on every MANUAL transition rebuilds the courier problem.

### Transitions — six

| # | Trigger | → Posture | What the Worker does |
|---|---|---|---|
| **M1** | Task start, approach not trivial — more than one file, a new module, or any requirement without one obvious assertion | **PLAN** | Build the requirement→test map and the conventions-followed/overridden list in `plan.md`. No code. *(Trivial tasks skip straight to implementation — the map is still written, it is just short.)* |
| **M2** | `plan.md` complete: every requirement mapped, every override named | **IMPLEMENT** | Before the first implementation edit, confirm `work/<id>/brief.md` is tracked (`git ls-files work/<id>/brief.md` non-empty) and unmodified (`git status --short work/<id>/brief.md` empty). Then: failing tests first, then implement |
| **M3** | Two consecutive fix attempts fail on the same assertion | **PLAN** | Stop editing. Re-derive the cause from source before touching anything else |
| **M4** | An unexpected QA failure — a suite the task did not touch, or a failure class not seen before | **PLAN** | Diagnose first. Do not "fix" a suite you do not yet understand |
| **M5** | Next edit touches an ASK-tier file, or an architecture / security / contract surface — auth or token path, gate predicate, persisted shape, public contract, scoring or persistence boundary | **MANUAL** | One edit at a time. In an Auto or `acceptEdits` session this is a Manual fallback trigger (STOP-6) |
| **M6** | Repository evidence conflicts with the approved brief | **MANUAL**, then assess | Record the conflict. Brief merely more specific than precedent → the brief wins, continue. Brief cannot be satisfied as written → **STOP-2** |

**Codex findings** are handled by the existing FIX / DEFER / REJECT rule, not by a transition:
classify before editing, then resolve FIX findings under M2 or M5 as their surface dictates.

**Announcing a posture change:** one line in `plan.md` naming the trigger — e.g. `M3: two
failed attempts on RD-7, back to PLAN`. Not a question to the Owner, not a status field, not a
state file. Its purpose is that `review.md` can show why the task moved as it did.

## Worker STOP conditions — the complete list

The Worker stops and returns to the Owner **only** when one of these is true:

1. A required edit falls **outside the approved scope or file set**.
2. The **approved contract cannot be satisfied as written**. A brief whose *wording*
   mis-measures a condition the implementation plainly meets is not this condition. Record the
   reading used and continue; the Owner sees it at LAND review. STOP-2 is reserved for a
   brief whose **intent** cannot be met.
   **Owner-ruled resolution.** When the Worker stops under STOP-2 and the Owner rules that the
   blocking condition is a measurement or wording defect - the implementation meets the brief's
   approved objective, and its file set, `land-scope`, `protected-scope` and land-tests stay
   unchanged - the Worker resumes the same task. The ruling is recorded verbatim in `review.md`
   and given to Codex with the diff. A ruling that changes the scope or the objective is not this
   resolution: it needs a new brief. STOP-6, the integrity check, the hooks and the protected gates
   are unaffected.
3. A **security assumption in the brief conflicts with repository or vendor evidence**.
4. A required test or action needs a **live, production, deployment, or other protected
   mutation**.
5. **Two approved brief requirements contradict each other.**
6. **A guard denies an attempted protected action, or a guard or fallback fires.** This means:
   - a hook denial of an action the HOOK-DENY tier exists to stop: push; merge / rebase / pull;
     destructive git; checkout or switch to `main`; a ref move of `main` or `branch-dev`; a commit
     the r9 gate refuses for its content (wrong slot or branch, a protected or DENY-tier path
     staged); a `.git` write; a git-config execution path; a Netlify write; a protected-file write;
     or the land tool's `land`, `push` or `protected-commit`;
   - an integrity-check FAIL;
   - an Auto-mode safety-classifier block, or any Manual fallback trigger in an Auto or
     `acceptEdits` session.

   A denied operation is never performed by other means - no other form, script, tool or
   sub-agent.

   **Not STOP-6: a form denial.** Nothing ran, and the intended action is itself permitted: a
   protected path or the land tool named in a read-only command; a compound, wrapped, escaped or
   PowerShell form of a permitted command; a request verb in the wrong shape. The Worker writes one
   line in `review.md` (`Form denial: <shape> -> reissued as <compliant form>`) and reissues the
   action in its compliant form: the brief's command-card line, the step-13 two-call commit, or the
   Read / Grep tools. If the Worker cannot tell which kind a denial is, or the same intent is denied
   twice, it is STOP-6. A denial of an actual `land`, `push` or `protected-commit` operation is
   always STOP-6, never a form denial.

   **A denial closes a path, not the problem.** After either kind, the Worker keeps solving the
   underlying problem by any method that needs no denied operation ("Troubleshooting without the
   Owner" below).

Anything else is the Worker's to decide. A STOP names the condition, the evidence, and the
smallest decision that would clear it, in five lines the Owner can answer in one:

    STOP-<n>: <condition, one sentence>
    Evidence: <one line, plus the file or qa.log line to look at>
    Impact: <what is blocked and what still proceeds>
    Recommended decision: <one line the Owner can approve as written>
    Alternatives: <at most two, one line each>

No transcript, diff or technical thread. If the Owner wants an independent view, the Owner asks
for it directly and points it at `review.md` and `plan.md`.

### Troubleshooting without the Owner

Ordinary technical problems - a brief's prescribed method not working, a scratch-harness
failure, an environment difference, an expected RED row failing differently than listed - are
the Worker's to solve:

1. **Self.** M3 and M4 as written: stop editing and re-derive the cause from source with the
   Read / Grep tools.
2. **Consult, if useful.** A read-only sub-agent from the Worker's own session (an Explore agent,
   or a fork told to diagnose only), or a Codex consultation through
   `codex exec --sandbox read-only` with a question instead of a review prompt. The default is one
   independent consultation per problem; further ones are allowed when each adds new diagnostic
   value. A consultation never performs a denied operation, edits no file, runs no QA suite, and
   names the hook and the land tool by function, never by file path. It is never used to probe or
   bypass a security control: no consultation is asked how to get past a denial, and a suggested
   rephrase of a denied operation is recorded in `plan.md` and not followed. Its output is advice:
   the Worker classifies it and stays bound by every rule. Raw output stays in the scratch
   directory.
3. **Decide and record.** Apply the fix and write one line in `plan.md` in the posture-change
   form, for example `M4: consulted fork; cause was ROOT resolving to scratch; fixed in the copy`.
4. **Escalate** only when a STOP condition above holds.

**A method is not a requirement.** A brief that prescribes a method for evidence (a command, a
scratch location, a harness) describes what to prove. A substitute method that proves the same
thing needs no ruling: record it under the STOP-2 wording carve-out. Changing *what* is proved -
removing or weakening an assertion, a kept-unchanged row, a land-test, the step-10 run or a
security check - is not a method change: it is STOP-1 or STOP-2.

**Who decides.**
- **Worker:** steps 0-13 end to end, every in-scope fix and method choice, both Codex rounds,
  `review.md`, `land-request` and `push-request`, and `land` / `push` after the Owner's line.
- **Codex:** read-only reviews and consultations; findings and advice only.
- **Bootstrap:** slot preparation, task-start, the R11 brief commit, resync, cleanup -
  mechanical git only, under the task's execution envelope when one is active. It approves no
  method or fix.
- **Owner:** the R11 line (which also opens the execution envelope), the PROTECTED line, and the
  LAND and PUSH lines (one decision, two records); rulings on STOP-1 to STOP-6; SHIP, every
  Netlify write and every action under "Protected actions".

## Codex findings — FIX / DEFER / REJECT

The Worker invokes Codex itself after implementation and classifies each finding:

| Class | Meaning | Action |
|---|---|---|
| **FIX** | correct, and resolvable inside the approved files and contract | resolve autonomously; re-run targeted QA |
| **DEFER** | correct, but outside this task's approved scope | record in `review.md` with the reason and where it belongs |
| **REJECT** | not correct, or does not apply | record in `review.md` with the reason it does not apply |

**Every DEFER and REJECT carries a written reason.** A finding that triggers a STOP condition
is escalated rather than classified. The Owner does not relay findings.

## Capability Breakdown (optional)

An optional artifact for a backlog item that cannot yet be honestly written as a brief:

```
Breakdown  resolves uncertainty
Brief      locks scope
/plan      decides implementation
```

**Not a mandatory stage.** The entry test is mechanical — can exact files expected to change,
and testing coverage required, already be filled in? If yes, skip straight to a brief. **If the
Domain logic trigger below fires, a Breakdown is required before the brief: testing coverage
cannot be filled in honestly until the rulings it depends on exist, so the entry test fails.**

**Structure — six sections:** Outcome · Current/Change Map (mandatory whenever a Breakdown
exists) · Decisions · Unknowns/Gaps · Split/Dependencies · Not in v1 — **plus `## Domain
logic` when its trigger fires (below).**

**Current/Change Map — nine fixed rows, every row present** (Client · Server functions ·
Storage/schema · Scores/Actionable Take · Persistence · Gates/environment · QA ·
Deploy/external · Docs). `Change` must begin with exactly one of `none` · `new` · `modify` ·
`read`, then a short noun phrase. The empty rows are the point — they are where "we never
thought about persistence" becomes visible.

**Domain logic — trigger.** Every Breakdown answers five questions. Does the capability:

- create or change a user-visible category vocabulary;
- create or change an inclusion rule — materiality, relevance, freshness, semantic dedup;
- affect scoring, ranking, recommendations, or Actionable Take;
- map external data into internal meaning;
- define something competent domain readers could reasonably disagree on?

Any YES → the Breakdown carries a `## Domain logic` section. All NO → the Breakdown **must**
record this exact line in its place: `Domain logic: none, engineering-only`. Silence is not
an answer.

**`## Domain logic` — compact.** It holds: vocabulary and definitions · inclusion and boundary
rules · overlap/precedence where two rules can both apply · numbered Owner rulings `DR-1`,
`DR-2`, … · a positive and a negative or boundary example per ruling · and, for each ruling
that is mechanically testable, the QA fixture or test it maps to. **A ruling that governs model
or human judgment gets no invented fixture** — mark it `pilot` or `human review`; a unit
fixture for a judgment rule is an over-claim, not coverage. Independent model challenge of the
rulings is risk-based and Owner-directed, never required.

**Boundary — system level, and it holds:**

| Allowed | Not allowed |
|---|---|
| component names | function names |
| directory-level surfaces | line numbers |
| one-file component names where the file *is* the component (`index.html`) | helper design |
| dependencies | test IDs — except the Domain logic fixture mapping |
| Owner decisions | requirement→test map |
| external blockers | implementation order inside a task |
| which child touches which surface | *how* to implement |

Everything in the right column belongs to Worker `/plan`.

**Readiness for a child brief** — all four must hold for that child: every map row it touches
has a concrete Change entry, not a question · every Decision it depends on
**(including every `DR-n` ruling)** has an Owner answer · every Unknown it depends on is
resolved, or moved to Not in v1 · its dependencies are landed, or intentionally being briefed
ahead of it. **Partial readiness is the expected case** — a capability does not need every
child resolved before the first child starts.

**The three artifacts, side by side:**

| | Breakdown | Brief | Worker `/plan` |
|---|---|---|---|
| **Holds** | system picture · uncertainty · Owner decisions · **domain rulings (`DR-n`)** · gaps · task split · dependencies · exclusions | exact files · exact contract · exact scope · exact exclusions · exact QA coverage · resolved decisions restated as facts · context/deps refs | implementation approach · requirement→test map · precedent files · conventions followed/overridden · execution order · QA triage · implementation detail |
| **Level** | system | file | function |
| **Tracked** | yes | yes | no |
| **Is a gate** | **no** | **yes** — the only scope approval | no |

**Multi-task capability** — children are sibling folders (`work/<child-1>/brief.md`,
`work/<child-2>/brief.md`, …), not nested; each runs the ordinary execution path. Explicitly
not added: parent lifecycle state · status fields · ARC IDs · registry · claim or mutex ·
readiness verdicts · any stored workflow state. Progress is derived from Git and the files
present.

**Size limits:** map rows fixed at 9 (10 only if a genuinely new surface appears); whole
breakdown ≤ 80 lines. **`## Domain logic` stays compact: narrative short, one row per ruling.
Its `DR` table may extend past the 80-line limit when necessary; there is no other
exemption.** Over that, materially — in the six sections or in Domain logic — reassess whether
this is actually two capabilities.

**The gap rule:** if Worker `/plan` **or implementation** discovers that a surface recorded as
`Change: none` must in fact change, **or meets a category, materiality, overlap, or other
domain case the approved `DR-n` rulings do not cover,** that is a scope conflict, not a
discovery to absorb — do not silently expand **and do not guess**; route back and update the
Breakdown and the affected Brief, under **STOP-1**.

## Lessons retention

`work/<id>/review.md` carries a `## Lessons` section, the unconditional capture point:

```markdown
## Lessons

- [covered]  <lesson> — already covered by <where>
- [backlog]  <lesson> — belongs in BACKLOG.md
- [rule]     <lesson> — destination-ready rule text for AGENTS.md or .claude/rules/**
- [design]   <lesson> — destination-ready capability/design text for
             work/<capability>/breakdown.md
- [local]    <lesson> — true only of this task; no destination
```

**Exactly one routing tag per lesson.** Capturing a lesson never expands task scope — writing
it down is free; acting on it is not.

| Tag | Means | Acted on |
|---|---|---|
| `[covered]` | an existing rule/doc already says this | never — it is a confirmation |
| `[backlog]` | product or workflow work | now, when `BACKLOG.md` is in the brief's scope (step 10a); otherwise recorded `— pending routing` |
| `[rule]` | destination-ready rule text for `AGENTS.md` or `.claude/rules/**` | later, by the task that owns that destination |
| `[design]` | destination-ready capability/design text for `work/<capability>/breakdown.md` | later, by the task that owns that destination |
| `[local]` | true of this task only | never |

`[rule]` and `[design]` lessons carry destination-ready text in `review.md` — written so the
future task can lift it, not re-derive it — and wait. **Neither destination is edited by the
current task unless it is separately in that task's approved scope.** No central register, no
IDs, no statuses, no new artifact. The lesson lives in the task's own review and nowhere else.
Pending routing is derived on demand — grep each tracked `work/*/review.md` for `[rule]`/
`[design]` lessons whose destination-ready text is absent from the named destination — not by
any scheduled or nightly process.

## Finalization and backlog reconciliation

A task's final commit includes `work/<id>/review.md` and — when the brief's Backlog row is
`close` or `partial` — its `BACKLOG.md` reconciliation (step 10a). **There is no exception for
`BACKLOG.md`:** like every other file, it may be edited only when the approved brief lists it,
including in `land-scope`. Every other unlisted file remains STOP-1.

When `BACKLOG.md` is not in the brief's scope, a `[backlog]` lesson is recorded in `review.md` as
`[backlog] <lesson text> — pending routing` and is not acted on by the task.

No standing allowance exists for `AGENTS.md`, `.claude/rules/**`, or
`work/<capability>/breakdown.md`. Those wait for a task that owns them.

## The fingerprint pairing rule

Any change that edits `CLAUDE.md` updates its fingerprint in `qa/instruction_layer_offline.js`
in the same commit.

## COWORK

Use COWORK for a Breakdown, or for a broader question, only when: external or vendor research
is needed · architecture or reconciliation needs broader analysis · the Owner wants a longer
design discussion outside an execution session. **Otherwise the Worker proceeds directly.**
COWORK is never an execution relay.

## Task folder convention

Each implementation task uses `work/<id>/`, where `<id>` is a stable slug derived from the task's
branch name `task/<id>` (e.g. `work/p7-a2-news-catalysts/`, `work/tradingview-alerts/`). No
centrally allocated id, no lookup table, no registry.

- `brief.md` (tracked) — the Owner-approved task scope: what file(s) will change, the
  smallest scoped diff, how it will be validated. It may be drafted directly at
  `work/<id>/brief.md` before approval — the required sequence is: draft `work/<id>/brief.md`
  → Owner reviews the exact current contents → Owner approves the exact brief-only commit →
  the Git/bootstrap Worker stages the brief and runs
  `node .claude/hooks/pt-land.js brief-request work/<id>/brief.md`; the Owner writes the approval
  record (`.git/pt-brief-approval`, R11) by typing the printed line with `!`; the Git/bootstrap
  Worker makes the commit through the R11 gate — or the Owner makes it in a normal terminal →
  commit it unchanged → implementation may
  begin. **An uncommitted or merely staged brief does not authorize implementation** — only the
  tracked, committed brief whose exact contents were Owner-approved does.
- `plan.md` (untracked, gitignored via `work/*/plan.md`) — the requirement→test map and the
  conventions-followed/overridden list. Written before implementation begins.
- `codex.md` (untracked, gitignored via `work/*/codex.md`) — the raw Codex review output,
  verbatim. Never reconstructed or paraphrased; if a review was not captured, the file says so.
  The final Codex check's raw output is appended to `codex.md` under `## Final check`.
- `qa.log` (untracked, gitignored via `work/*/qa.log`) — raw output from targeted/full QA runs
  for this task.
- `review.md` (tracked) — final evidence: QA result, Codex outcome, and the FIX / DEFER /
  REJECT ledger with a reason for every DEFER and REJECT. It holds pre-commit evidence only; the
  post-commit integrity check is LAND evidence (step 13). It always contains a `## Backlog
  reconciliation` section: the brief's Backlog row; the action taken (`closed`, `updated` or
  `none`); each affected entry's heading before → after; and a one-line confirmation that the new
  BACKLOG text matches the diff, the QA results and the work being landed. Populated after Codex reviews the
  implementation diff and any required fixes/QA re-runs are done; then one final lightweight
  Codex check runs against the task diff (see "Codex as diff reviewer" for its authoritative
  definition), so the complete final diff — including `review.md` itself — is reviewed before
  it is committed.
  `review.md` is committed in the same commit as any final implementation touch-ups — that
  commit (the Worker's gated step-13 commit) and the separate, later Owner LAND approval are two
  distinct events, never conflated even when they happen close together. `review.md`'s "Files changed" section
  uses this fixed two-row shape:

  ```
  ## Files changed
  - Implementation (N): <paths>     ← must equal the brief's Implementation scope
  - Evidence (tracked): work/<id>/brief.md, work/<id>/review.md
  ```

**These five files are evidence and scope, and the set is closed — no sixth evidence file, and
no name variants (no `codex-final.md`, no `qa-post-edit.log`). None of them carries status,
state, or lifecycle.**
The only operational meaning of a tracked, committed `brief.md` is that implementation may
begin within its exact approved scope. `review.md` is evidence only and authorizes nothing.
LAND and SHIP require explicit Owner decisions; Worker task-branch commits follow step 13. No
registry, claim, or mutex exists anywhere in this convention.

## Test commands

- During implementation: run the targeted `test:<area>` script(s) in `package.json` relevant to
  the area being touched.
- At LAND: `npm run qa:offline` is the required full-suite gate, plus any additional targeted
  tests still relevant to the change. The full suite is not required before every intermediate
  functional commit — only at LAND.
- `npm run test:qa` — Playwright browser QA, used only when browser-level verification is
  needed.
- **One heavy run at a time across all slots.** A heavy run is a full `npm run qa:offline`, any
  `PT_QA_FORCE_HEAVY=1` run, or any run of a digest-pinned suite (`auto_mode_hardening`, `pt_land`,
  `pt_land_resync`, `task_base`, `fixture_template`, `git_contract`). A brief states this rule as a
  condition; there is no per-run Owner go-ahead.
  - **Check before every heavy run.** Immediately before starting one, the Worker verifies that no
    other heavy run is active on the host: a read-only process listing that shows command lines
    (for example `wmic process where "name='node.exe'" get ProcessId,CommandLine`) shows no
    process running `qa/run-offline.js`, `qa:offline` or a `qa/*_offline.js` suite. The check and
    its result are one line in `qa.log` before the run.
  - Another heavy run active -> wait and check again; never start a concurrent run. The check
    cannot be run -> do not start the run; treat it as a troubleshooting problem, then STOP-2.
  - Task-start sequencing (by the Owner, or by MAIN under an execution envelope) is an additional
    safeguard, not a substitute for the check.
  - A brief approved before this rule keeps its own heavy-run requirements.

## Codex as diff reviewer

Codex reviews the actual diff, not a plan or a description of intended changes. Before asking
for a Codex review, make the actual implementation diff available in the task working tree or
task branch, then give Codex the real diff (`git diff`, commit, or branch comparison). Codex
review normally happens before LAND.

**Two diffs.** Both compare `<base>` — the recorded task base (`--print-record`; for a task without a record, the `branch-dev` commit named in the brief) — against the
current working tree, covering committed, staged, and unstaged tracked changes, **and** any new
untracked in-scope files; neither diff is ever taken against `HEAD` alone, and neither omits an
untracked file just because it is new. Untracked coverage is always scoped to named paths —
never a repo-wide untracked scan, which would pull in unrelated local/untracked files (a stray
`.claude/settings.local.json`, an unrelated in-progress skill folder, etc.).

**Implementation diff** — tracked portion: `git diff <base> -- . ':(exclude)work/'
':(exclude)BACKLOG.md'`; untracked portion: `git ls-files --others --exclude-standard --`
followed by the exact paths named in the brief's Implementation scope, with each listed file's
contents. Every "Implementation scope" and "Definition of done" statement, and the
implementation Codex review (step 8/9), refer to this diff — tracked and untracked parts
together.

**Task diff** — the complete implementation diff, plus tracked task evidence intended for
repository history: `git diff <base> -- work/<id>/brief.md work/<id>/review.md`; if `review.md`
is still untracked at final-review time, its contents are included directly (this is how a
still-untracked `review.md` reaches the final check); plus the task's `BACKLOG.md`
reconciliation (step 10a), when the brief lists it.
`plan.md`, `codex.md`, and `qa.log` stay untracked/gitignored task evidence — available as
supporting evidence but not part of the task diff. The final Codex check (step 12), the step-13
commit and the LAND request refer to the task diff; it is the sole, authoritative definition of
"the complete final diff" wherever that phrase is used — nothing else defines it separately.

**Codex must receive every part of whichever diff applies** — the tracked diff and the
untracked in-scope files' contents — never the tracked diff alone. A brief never needs to name
its own `brief.md` or `review.md` in its implementation scope — they are evidence, outside the
implementation diff by definition. **This changes no permission:** `work/*/brief.md` remains
ASK-tier and the brief-listing rule is unchanged. The governed commit shape requires a
brief-only commit, then a final implementation + `review.md` commit (+ the step-10a `BACKLOG.md`
reconciliation, when the brief lists it) — this does not imply the task's history contains only two commits total;
intermediate functional commits before the final commit are unaffected, per "Test commands"
above.

## Owner LAND / SHIP boundaries

- **LAND** integrates the reviewed task into `branch-dev`: fast-forward only, one task at a time, run by the Worker through `pt-land.js land` after the Owner's single-use LAND record (step 14), or by the Owner in a normal terminal for tasks the tool refuses; a direct merge/rebase/pull stays HOOK-DENY (R3m).
  - Before LAND:
    - `npm run qa:offline` passes at the final commit;
    - `git status` is clean;
    - the task diff has been reviewed (Codex or Owner);
    - `node qa/guard_integrity_check.js` passes (this covers an empty `core.hooksPath` and only
      `.sample` git hooks) — run after the task commit and reported in the Worker's step-13
      report or by the Owner, never recorded in the committed `review.md`.
  - Claude Code may prepare and request LAND; the Owner confirms it by entering the LAND record.
  - **Second LAND:** when another task landed first, Bootstrap runs
    `node .claude/hooks/pt-land.js resync task/<id>` while the Worker is paused. If it refuses
    (conflict, overlapping uncommitted work, or PROTECTED-approved commits), STOP: the Owner decides.
    Otherwise the Worker re-runs `npm run qa:offline`, the relevant targeted tests and the
    integrity check (in the form `resync` prints; for a recorded task, `resync` also advances the record's base) in its slot and reports, before LAND — the
    post-rebase integrity result is LAND evidence only, never recorded in `review.md`.
- **Push** runs only through `pt-land.js push` after the Owner's single-use PUSH record (step 15), or by the Owner in a normal terminal; a direct `git push` stays HOOK-DENY (R3g). A push publishes the public Netlify DEV deploy of `branch-dev`; the PUSH record is the explicit approval for that branch deploy. A push normally follows its own LAND under the same Owner decision; one consolidated push after several LANDs happens only when the Owner decides it.
- **LAND and PUSH — one Owner decision, two records.** After the `land-request` report the Owner
  decides LAND and PUSH together, in this order: the Owner types the LAND line and the Worker runs
  `land`; then the Worker runs `push-request`, the Owner types its PUSH line and the Worker runs
  `push`. Each record is checked by its own tool verb and consumed separately. That decision does
  not authorize the PUSH — STOP for the Owner — if `land` fails or is refused, if `branch-dev`
  after `land` is not the approved tip, or if the PUSH line's first oid is not the approved tip or
  its second oid is not the `origin/branch-dev` oid at `land-request`. A Second-LAND re-sync
  produces a new tip, a new `land-request` and a new decision.
- **SHIP** (`branch-dev` → `main`/production): always requires explicit, separate Owner
  approval, on top of a landed and QA'd `branch-dev` state. Never bundled with a LAND approval.

## Protected actions (always require explicit Owner approval)

- Any edit, merge, checkout, reset, or deploy touching `main`/production.
- `git push`, force-push, or any destructive Git operation (`reset --hard`, `clean -f`,
  `branch -D`, etc.).
- Every Netlify write requires explicit Owner approval — including deployments, branch
  deploys/previews, environment-variable changes, and any other Netlify mutation. Read-only
  Netlify inspection does not require approval.
- Live external API canaries (SEC, Perplexity, or similar).
- Commits outside the r9 and R11 gates — any other main-checkout commit, any commit staging a DENY-tier or protected path, any commit the r9 gate denies for its content — are made by the Owner in a normal terminal (RC2). An R11 brief-only commit requires the Owner's approval record (the line printed by `brief-request`). A PROTECTED commit requires the Owner's PROTECTED record and is made only by `pt-land.js protected-commit` (step 13a).
- `git merge`, `rebase`, `pull`, and any ref move of `main`/`branch-dev` — the Owner, in a normal terminal.
  Exception: a fast-forward LAND of `task/*` into `branch-dev` and a `branch-dev` push through `pt-land.js` under the Owner's single-use records (R12); and a `task/*` re-sync through `pt-land.js resync`, which never moves `main` or `branch-dev`.
- Environment/runtime mutations, and protected governance changes (the hook and settings, through the PROTECTED gate or the Owner copy/hash workflow).

## Worker slot model

- Parallel work uses two **permanent** worktree paths — Worker slots — beside the main checkout:
  `pt-wt-worker-a` and `pt-wt-worker-b`. No registry, claim file, or mutex; a slot is just an
  isolated checkout.
- Slot paths are **reused between Slices**. Do **not** create a new filesystem worktree path per
  Slice (no per-task `git worktree add`), and do not remove a slot when its Slice lands.
- Task branches remain **per Slice** (`task/<id>`): created from the current `branch-dev` and
  switched to inside the assigned slot (`git -C <slot> switch -c task/<id> <base>`). A slot is
  switched only when its working tree is clean. Immediately after creating the task branch, Bootstrap runs `node .claude/hooks/pt-land.js task-start task/<id>` from the canonical checkout. It records once (write-once) the actual task base (the fork point), `main` and the start time in `.git/pt-task/` — the runtime baseline for integrity, resync and LAND. The brief's Baseline row stays the planning and pin baseline. A task opened before records existed gets one only through `adopt-request` / `adopt` after the Owner's single-use ADOPT line.
- One Slice per slot at a time; do not stack unrelated work on a slot's task branch. Between
  Slices a slot sits detached and clean at `branch-dev`.
- A slot keeps its `node_modules/`; step 0 of the Worker execution contract refreshes it when it
  is missing or older than `package-lock.json`.
- LAND and push follow steps 14–15 (R12); every other protected action is unchanged (see "Owner LAND / SHIP boundaries"
  and "Protected actions").
- A Worker session runs only in its own slot (cwd) — never in the other slot or the main checkout.
- **Current-guard check** before any non-Manual session: the slot's task branch descends from the
  current `branch-dev`, and `git status --porcelain .claude` is empty.
- The Git/bootstrap Worker performs deterministic mechanical Git/worktree setup (slots, task
  branches, refs, hashes, status) approved by the Owner or authorized by the task's execution
  envelope, and an Owner-approved brief-only commit through the R11 gate only where the hook
  permits. It is never a bypass; anything the hook denies goes to the Owner's terminal.
