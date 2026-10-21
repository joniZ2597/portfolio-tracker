# Brief: approval-envelope-1 — add the execution envelope and the paired LAND/PUSH decision to AGENTS.md (governance docs; AGENTS.md only)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below. DRAFT, 2026-10-22, for MAIN's review. It is not approved, not committed and not staged. Nothing in it authorizes a gate. Order of events: the Owner has answered every open decision (§OD, all ruled 2026-10-22), and MAIN fills the `<at T>` placeholders listed in §PH before staging. Then come the Owner's R11 brief approval and the brief-only commit (Bootstrap / MAIN steps, AGENTS.md "Task folder convention"). The Worker starts only after that commit exists, so the Worker steps in §4 begin at step 0 and contain no brief-request.

**This task runs entirely under the pre-amendment rules.** The envelope it introduces does not cover this task: its own task-start, step-13 commit, LAND, PUSH and cleanup follow AGENTS.md and current MAIN practice as they stand at the task base. The envelope applies only to a task whose R11 brief-only commit is made after this task has landed (E2, first sentence).

What the Owner sees: one package review (the §OD decisions are already ruled) → the R11 line → (current practice: the task-start go-ahead and the step-13 commit go-ahead, relayed by MAIN) → one PROTECTED line, whose report shows the AGENTS.md candidate bound to the exact tree, after Codex has checked it against §2 → the LAND line → the PUSH line (a public Netlify DEV deploy of `branch-dev`) → cleanup. No hook, settings, tool, QA or CLAUDE.md change. Production, `main` and every Netlify write except that DEV deploy stay untouched.

| | |
|---|---|
| Problem | Owner rulings of 2026-10-22: the Owner is asked again and again to approve routine technical transitions after the product decision, scope and risks are already approved (`agent-handoff-1/approval-gate-review.md` §0-§1: about 9 Owner acts per clean task, most of them unenforced L3 GOs). The approved TARGET is an "execution envelope": one Owner act per task, plus a paired LAND/PUSH decision. It becomes effective only through this governed amendment; until then nothing changes |
| Objective | `AGENTS.md` on `branch-dev` equals the base `AGENTS.md` with exactly the seven edits E1–E7 of §2 applied, byte-for-byte (LF), and nothing else changes. Committed candidate LF sha256 = §1 |
| Owner rulings applied (2026-10-22, restated; the verbatim text is in MAIN's ledger) | (1) The execution-envelope model is the approved TARGET workflow; it becomes effective only when this amendment is approved and landed. (2) One Owner act — typing the existing R11 `!` line after reviewing the package and answering its open decisions — approves the exact brief (sha256, path, branch-dev oid) AND authorizes, for that task only: Bootstrap's R11 brief-only commit; slot assignment and `switch -c` from current branch-dev; bare task-start; MAIN's ASSIGN; MAIN QA-slot grants; the Worker's step-13 r9 commit limited to the brief's land-scope; integrity and land-request; a routine Second-LAND resync under the existing mechanical conditions; cleanup after a verified PUSH. (3) It never covers LAND, PUSH, PROTECTED, ADOPT, any STOP ruling, destructive Git, Netlify writes, live canaries, main/production, governance/hook/settings/permission changes. (4) LAND and PUSH: ONE Owner decision, separate binding records (two `!` lines), separate independent tool checks, order LAND then PUSH; PUSH is not authorized if LAND fails, is refused, or the resulting state differs from the approved LAND evidence — then STOP for the Owner. (5) No new hook, no security bypass, no permission widening, no change to approval record formats or guard checks; "Claude never writes an approval record" stays. Attended-only |
| Design source | `Pulse-Planning/agent-handoff-1/approval-gate-review.md` §3-§5 (sha256 `7a944dda5fb7fee5c939785a7ddc45410f6ce4b335c73ce5222cf94fa905e92e`); exact text `Pulse-Planning/agent-handoff-1/amendment/amendment-text.md` (sha256 `eb1fd6b964dc9f7bea1afe52d58a6d8dc007b4e5a5705f8452a1f54d3f9304a2`). §2 below repeats every normative block, so the Worker needs neither file |
| Backlog | **none** (Grep of `BACKLOG.md` for envelope / approval gate / agent-handoff: no entry). No `BACKLOG.md` edit |
| Baseline (§TS) | `branch-dev` tip at task-start. The text was read on 2026-10-22 from the working tree (747 lines). The `branch-dev` tip at R11 staging is `b68d494` (= `origin/branch-dev`, MAIN, 2026-10-22). `AGENTS.md` git blob `17c14f5b5f46fa350970bbed67e5c7b49f4dbeb5`. Valid only if the §TS checks pass |
| Branch / slot / mode | `task/approval-envelope-1` · first free slot · **Manual**, attended. `AGENTS.md` is ASK-tier and a protected path, so it enters only through step 13a |
| qa:offline | count **unchanged**. No suite reads the real `AGENTS.md`: every `qa/` hit is a fixture string or a settings-rule string (`auto_mode_hardening_offline.js`, `pt_land_offline.js`, `qa/fixtures/git-contract/*.json`, `qa/tools/record-git-transcripts.js`). `qa/instruction_layer_offline.js` fingerprints `CLAUDE.md` and two skill files only |
| Parallel with | any task that does not edit `AGENTS.md` or `CLAUDE.md`. One heavy run at a time |
| Dependency | The canonical checkout has no staged or untracked entry other than this brief when `brief-request` runs, because the R11 gate accepts exactly one entry. The branch synchronization requirement is unchanged. If this brief's R11 commit leaves `branch-dev` ahead of `origin/branch-dev` and the task-start check requires them equal, a separate Owner-approved PUSH comes first, under current practice |
| Scoring boundary | none touched. No code, `index.html`, `qa/**`, `.claude/**`, pin map or `CLAUDE.md` |
| Gate verification | N/A (docs only; no runtime path) |
| Skills | none required |

## §OD Owner decisions (all ruled 2026-10-22; none open)

| # | Decision | Owner ruling |
|---|---|---|
| D-1 | Expiry rule (E2) | APPROVED. 72 h from the R11 commit's committer time, or the `land-request` report, whichever comes first. (h) and (i) survive `land-request` until the push and cleanup, or a decline or a refusal other than Second LAND. Renewal is by a one-line Owner ruling |
| D-2 | Name MAIN and its ledger inside AGENTS.md | APPROVED. Once, in one clause inside E2. The envelope is available only when MAIN coordinates; otherwise the go-ahead works as before |
| D-3 | Push batching (E5) | APPROVED. Pairing with LAND by default; batching only on an Owner decision |
| D-4 | LAND+PUSH rule (E6) scope | APPROVED. Applies to every task |
| D-5 | V3 "security finding from the brief review" | APPROVED. An S finding that the approved package left undispositioned |
| D-6 | Candidate source | APPROVED. MAIN builds `cand-agents.md` from the base blob plus §2 before R11, pins its LF sha256 in §1, and places it at `Pulse-Planning/agent-handoff-1/amendment/candidate/cand-agents.md`. The Worker copies it (precedent: `workflow-simplification-1`) |
| D-7 | Branch synchronization (V6) | OPTION (b) APPROVED. The synchronization gate is not relaxed. An unpushed R11 brief commit does not void the envelope by itself. When the task-start checks require `branch-dev` = `origin/branch-dev`, (b) and (c) wait for a separate Owner-approved PUSH (its own record, never covered by the envelope) and then continue. Option (a) is recorded only as a future idea (notes.md) |

All existing PROTECTED, LAND, PUSH and Owner authorization boundaries are preserved.

## §PH Placeholders MAIN fills at R11 (`<at T>`; T = the `branch-dev` tip the brief is staged on)

| # | Value | How to get it |
|---|---|---|
| P-1 | `AGENTS.md` git blob at T | `git rev-parse <T>:AGENTS.md` |
| P-2 | the candidate `cand-agents.md` LF sha256 | build it from P-1 plus §2 E1–E7, then `sha256sum`. Prove it with the §2a counts and a diff of 7 edits in 6 hunks (E5 and E6 are adjacent and form one hunk) |
| P-3 | sha256 of `approval-gate-review.md` | `sha256sum` |
| P-4 | sha256 of `amendment-text.md` (the final version after the Codex rounds) | `sha256sum` |

If T's `AGENTS.md` differs from the text quoted in §2 (TS-2 fails), the brief is stale: STOP and re-draft. Do not patch it.

## §TS Task-start baseline checks (read-only, at the task-start tip T)

| # | Check (all must hold; else STOP and return to MAIN) | Expected |
|---|---|---|
| TS-1 | `git rev-parse HEAD:AGENTS.md` equals the Baseline blob | `17c14f5b5f46fa350970bbed67e5c7b49f4dbeb5` |
| TS-2 | Each "current" text of E1, E3, E4, E5, E7 and the E2 anchor occurs exactly once in `AGENTS.md` (Grep tool, one distinctive line each: see §2a item 1) | each = 1 |
| TS-3 | `AGENTS.md` contains no `### Execution envelope` and no `**LAND and PUSH — one Owner decision` | 0 / 0 |
| TS-4 | `node qa/instruction_layer_offline.js` PASS (CLAUDE.md fingerprint at the base) | PASS |
| TS-5 | `work/approval-envelope-1/` holds only this brief | yes |

If another task has changed `AGENTS.md` since the Baseline, TS-1 fails: STOP and report to MAIN. The candidate sha is then stale, and a new brief is needed.

## §1 Files (exactly)

- `AGENTS.md` (protected-scope). Candidate `cand-agents.md`, LF, sha256 **`9147d55a9f0628c165689e914ede2c022f306bfe89edbe1f9bb09570a912407a`** = the base blob with E1–E7 applied and nothing else
- `work/approval-envelope-1/review.md`

**QA suites that read in-scope files as text:** none (see the qa:offline row). Re-check at step 0 with the Grep tool (`AGENTS` in `qa/`, excluding `qa/fixtures/`) and record the result in `plan.md`.

**Forbidden (never edited):** `CLAUDE.md` (no contradiction found; see §6 R-4), `.claude/**` (hook, land tool, settings, rules, skills), every `qa/**` file, `BACKLOG.md`, `index.html`, `services/**`, `netlify/**`, `package*.json`, `work/**` other than this task's `review.md`, any Git configuration, and any Pulse-Planning file.

**The one sanctioned read outside the slot:** the step-1 copy of `cand-agents.md` from its D-6 location. This is a declared exception to "the Worker reads nothing outside its slot" (AGENTS.md "Execution preflight block"). The pinned sha256 makes the copy self-verifying. The copy has no card line: it is a class-B prompt (Bash `cp <source> <tmp target>`, or a Read then a Write of the same bytes), and the step-1 sha256 check verifies it.

## §2 Edits (normative; exactly these, nothing else)

Every block between `~~~~` fences is binding character-for-character, excluding the fence lines. Line numbers are from the 2026-10-22 read and are guidance only; the quoted current text is the anchor. The candidate is LF.

### E1 — "The `!` rule" (:207): replace the line

Current:

~~~~markdown
**The `!` rule.** After `!`, the Owner types only a line printed by `pt-land.js` (`brief-request`, `protected-request`, `land-request`, `push-request` or `adopt-request`) in the exact shape `! printf '%s\n' '<payload>' > '<common-dir>/pt-<kind>-approval'`, where `<kind>` is `brief`, `protected`, `land`, `push` or `adopt` — nothing else. Claude never writes an approval record.
~~~~

Replacement:

~~~~markdown
**The `!` rule.** After `!`, the Owner types only a line printed by `pt-land.js` (`brief-request`, `protected-request`, `land-request`, `push-request` or `adopt-request`) in the exact shape `! printf '%s\n' '<payload>' > '<common-dir>/pt-<kind>-approval'`, where `<kind>` is `brief`, `protected`, `land`, `push` or `adopt` — nothing else. Claude never writes an approval record. The R11 line also opens the task's execution envelope (see "Execution envelope" below); that changes no record, format or check.
~~~~

### E2 — new subsection: insert after :216

Anchor: the line `is not asked to copy them into a separate conversation when the Worker can supply them itself.` (:216). Insert one blank line followed by the block. The existing blank line before `## Worker mode policy` stays.

~~~~markdown
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
~~~~

### E3 — "Who decides" (:402-405): replace the four lines

Current:

~~~~markdown
- **Bootstrap:** slot preparation, task-start, the R11 brief commit, resync, cleanup -
  mechanical git only. It approves no method or fix.
- **Owner:** the R11, PROTECTED, LAND and PUSH lines; rulings on STOP-1 to STOP-6; SHIP, every
  Netlify write and every action under "Protected actions".
~~~~

Replacement:

~~~~markdown
- **Bootstrap:** slot preparation, task-start, the R11 brief commit, resync, cleanup -
  mechanical git only, under the task's execution envelope when one is active. It approves no
  method or fix.
- **Owner:** the R11 line (which also opens the execution envelope), the PROTECTED line, and the
  LAND and PUSH lines (one decision, two records); rulings on STOP-1 to STOP-6; SHIP, every
  Netlify write and every action under "Protected actions".
~~~~

### E4 — heavy-run rule (:645): replace the line

Current:

~~~~markdown
  - Task-start sequencing by the Owner is an additional safeguard, not a substitute for the check.
~~~~

Replacement:

~~~~markdown
  - Task-start sequencing (by the Owner, or by MAIN under an execution envelope) is an additional
    safeguard, not a substitute for the check.
~~~~

### E5 — Push bullet (:706): replace the line

Current:

~~~~markdown
- **Push** runs only through `pt-land.js push` after the Owner's single-use PUSH record (step 15), or by the Owner in a normal terminal; a direct `git push` stays HOOK-DENY (R3g). A push publishes the public Netlify DEV deploy of `branch-dev`; the PUSH record is the explicit approval for that branch deploy. One consolidated push after a batch is preferred.
~~~~

Replacement:

~~~~markdown
- **Push** runs only through `pt-land.js push` after the Owner's single-use PUSH record (step 15), or by the Owner in a normal terminal; a direct `git push` stays HOOK-DENY (R3g). A push publishes the public Netlify DEV deploy of `branch-dev`; the PUSH record is the explicit approval for that branch deploy. A push normally follows its own LAND under the same Owner decision; one consolidated push after several LANDs happens only when the Owner decides it.
~~~~

### E6 — new bullet: insert after the E5 line, before `- **SHIP**`

~~~~markdown
- **LAND and PUSH — one Owner decision, two records.** After the `land-request` report the Owner
  decides LAND and PUSH together, in this order: the Owner types the LAND line and the Worker runs
  `land`; then the Worker runs `push-request`, the Owner types its PUSH line and the Worker runs
  `push`. Each record is checked by its own tool verb and consumed separately. That decision does
  not authorize the PUSH — STOP for the Owner — if `land` fails or is refused, if `branch-dev`
  after `land` is not the approved tip, or if the PUSH line's first oid is not the approved tip or
  its second oid is not the `origin/branch-dev` oid at `land-request`. A Second-LAND re-sync
  produces a new tip, a new `land-request` and a new decision.
~~~~

### E7 — Worker slot model (:743-746): replace the four lines

Current:

~~~~markdown
- The Git/bootstrap Worker performs approved, deterministic mechanical Git/worktree setup (slots,
  task branches, refs, hashes, status), and an Owner-approved brief-only commit through the R11
  gate only where the hook permits. It is never a bypass; anything the hook denies goes to the
  Owner's terminal.
~~~~

Replacement:

~~~~markdown
- The Git/bootstrap Worker performs deterministic mechanical Git/worktree setup (slots, task
  branches, refs, hashes, status) approved by the Owner or authorized by the task's execution
  envelope, and an Owner-approved brief-only commit through the R11 gate only where the hook
  permits. It is never a bypass; anything the hook denies goes to the Owner's terminal.
~~~~

### §2a Conformance checklist (the Worker verifies each on the candidate, then on the committed file, and records it in `review.md`)

1. Grep-tool counts on the **base** `AGENTS.md` (TS-2) = 1 each: `Claude never writes an approval record.` · `is not asked to copy them into a separate conversation` · `mechanical git only. It approves no method or fix.` · `Task-start sequencing by the Owner is an additional safeguard` · `One consolidated push after a batch is preferred.` · `The Git/bootstrap Worker performs approved, deterministic`.
2. Grep-tool counts on the **candidate / committed** `AGENTS.md`: `### Execution envelope (one Owner act per task)` = 1; `**LAND and PUSH — one Owner decision, two records.**` = 1; `One consolidated push after a batch is preferred` = 0; `Task-start sequencing by the Owner is` = 0; `performs approved, deterministic` = 0; `The R11 line also opens the task's execution envelope` = 1; rows `| V1 |` … `| V8 |` = 1 each; `Claude never writes an approval record` = 2 (E1 and E2).
3. Candidate LF sha256 = §1; 0 CR bytes.
4. Codex (steps 2 and 5) confirms the diff against the base equals E1–E7 and nothing else, and that the §3 "Kept unchanged" text is intact.

## §3 Kept unchanged

Every byte outside E1–E7, including the following:
- R11 and its record shape, R12 forms and verbs, single-use LAND / PUSH / PROTECTED / ADOPT records;
- steps 0-16 except as E1 adds one sentence after step 16;
- STOP-1..6 and the form-denial rule;
- the protection tiers table and the brief-listing rule;
- Worker mode policy;
- "Protected actions";
- the Second-LAND bullet;
- the task folder convention.

Also unchanged: `CLAUDE.md`, every hook, tool, settings and QA file.

## §4 Steps

| Step | Who | Action |
|---|---|---|
| 0 | Worker | §TS. Process check (Bash `wmic process where "name='node.exe'" get ProcessId,CommandLine`, one line in `qa.log`) → step-0 `qa:offline` (or a documented reuse per AGENTS.md step 0). `plan.md` with the CLAUDE.md four items: Pattern Auditing = the landed `work/workflow-simplification-1/` brief (AGENTS.md through 13a, candidate + manifest) and the `work/backlog-entry-39/` brief shape; State & Boundary Isolation = docs only; Gate Verification N/A; Definition of Done = §5. Re-check "suites that read text" (§1) |
| 1 | Worker | Copy the candidate (D-6 source) to `C:/Users/Owner/AppData/Local/Temp/pt-approval-envelope-1/protected/cand-agents.md`. Write `manifest.json` there: `{"files":[{"target":"AGENTS.md","source":"cand-agents.md"}]}`. `sha256sum` must equal §1 (a CRLF/LF difference → STOP). §2a items 2-3 on the candidate (Grep / Read tools) |
| 2 | Worker | Codex round one (`codex exec --sandbox read-only`) on the candidate against `HEAD:AGENTS.md`: the diff is E1–E7 only and §3 is intact. The prompt names "the hook" and "the land tool", never their paths |
| 3 | Worker → Owner | **13a:** `protected-request` → report + line printed exactly → STOP → Owner PROTECTED `!` line → `protected-commit`. Verify the committed `AGENTS.md` LF sha256 = §1 |
| 4 | Worker | **Step 10:** process check → full `npm run qa:offline` on the protected commit (the **tested commit**); count = step 0. Land-test `node qa/instruction_layer_offline.js` PASS |
| 5 | Worker | `review.md` (§2a results; `## Backlog reconciliation`: none; `## Lessons`; exactly one column-1 line `LAND-EVIDENCE: qa-offline=PASS <N>; targeted=PASS; codex-classI-unresolved=0`, N = the step-4 count, written only after step 4, the land-test and Codex) → final Codex check on the task diff including `review.md` |
| 6 | Worker | **One docs-only commit authorized by this brief**, after step 4: only `work/approval-envelope-1/review.md`. Use an explicit `git add`; then, before the commit, `git diff --cached --name-only` must list exactly `work/approval-envelope-1/review.md` (anything else → STOP-1, no commit); then a plain `git commit -m` in a separate call (r9). No other commit after the tested commit. Then the integrity check from the card. Its result is LAND evidence, reported only in the step-13 STOP report |
| 7 | Worker / Bootstrap / Owner | `land-request` → STOP → LAND line → `land` → `push-request` → PUSH line → `push` → `cleanup`, under the rules **at the task base** (pre-amendment) and current MAIN practice |

**Ordinary in-scope problems** (copy, manifest, harness) are the Worker's to solve. The candidate text is fixed: any wording change → STOP-2 with the five-line message.

**STOP for:** any change outside §1; a candidate text change; a sha256 mismatch at step 1 or 3; TS-1..TS-5 failing; a 13a refusal (STOP-6); any denial that is STOP-6 under the **current** rules (an AGENTS.md form denial is reissued once in compliant form and logged in `review.md`); two heavy runs at once.

**Coordination:** the Worker reports `ACK-ASSIGN`, `PROGRESS`, `GATE`, `STOP` and `RESULT` to MAIN under the handoff pilot. A message never approves a gate.

## §5 Definition of Done

1. The committed `AGENTS.md` LF sha256 = §1 (this binds every word), and §2a items 1-4 hold.
2. Only the two §1 files changed (`git diff --stat <base>..<tip>`: `AGENTS.md`, `work/approval-envelope-1/review.md`).
3. `qa:offline` PASS at step 4 with the step-0 count; `node qa/instruction_layer_offline.js` PASS; `CLAUDE.md` unchanged.
4. `review.md` holds the Codex ledger, `## Backlog reconciliation` (none), `## Lessons`, and exactly one `LAND-EVIDENCE` line.

## §6 Risks

| # | Risk | Mitigation |
|---|---|---|
| R-1 | Fewer Owner eyeballs between R11 and LAND in future tasks | Every evidence gate stays at LAND (L1-L16 plus the human LAND line). V1-V8 void the envelope; the hooks and tool are unchanged |
| R-2 | A forged "envelope active" message between sessions | A message never approves; the envelope opens only with the Owner-typed R11 line, and each Worker re-checks the brief blob (V1). The ledger is evidence, not authority |
| R-3 | An agent treats the envelope as covering LAND/PUSH | E2 "Never covered" plus E6. `pt-land.js land` and `push` keep their `ask` rules and single-use records |
| R-4 | A `CLAUDE.md` sentence silently contradicts the envelope | Checked: `CLAUDE.md` :21-29, :61, :129, :132 are consistent (see `amendment-text.md` "Considered and left unchanged"). `CLAUDE.md` stays forbidden; a found contradiction → STOP-1 |
| R-5 | Line-number drift between the read and the task base | The quoted text is the anchor; TS-1 pins the blob |
| R-6 | Candidate EOL corruption (Edit/Write tool CRLF↔LF) | The candidate is copied, not retyped; the sha256 check at steps 1 and 3 |
| R-7 | The envelope is applied before it lands | E2's first sentence plus this brief's statement that it runs under the pre-amendment rules |
| R-8 | The R11 record lingers after commit (requirements R-8) | Unchanged by this task. A replay needs the same content and parent; recorded as a residual |

## §CMD Command card (one command per Bash call, exactly as written; read files with the Read / Grep tools)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
git rev-parse HEAD:AGENTS.md
node qa/guard_integrity_check.js --task task/approval-envelope-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
sha256sum /c/Users/Owner/AppData/Local/Temp/pt-approval-envelope-1/protected/cand-agents.md
npm run qa:offline
node qa/instruction_layer_offline.js
node .claude/hooks/pt-land.js protected-request task/approval-envelope-1
node .claude/hooks/pt-land.js protected-commit task/approval-envelope-1
git diff --cached --name-only
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/approval-envelope-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/approval-envelope-1
node .claude/hooks/pt-land.js land task/approval-envelope-1
node .claude/hooks/pt-land.js push-request
node .claude/hooks/pt-land.js push
<!-- cmd:end -->

## §PEP Execution preflight (per step; A auto-approved · B permission prompt · C governance gate · D hook-denied, must not appear)

| Step | A | B | C | D |
|---|---|---|---|---|
| 0 | the git read-only card lines; `--print-record`; `npm run qa:offline`; `node qa/instruction_layer_offline.js`; Read / Grep / Glob | the Bash `wmic` process listing; writing `plan.md` / `qa.log` (Write tool, in the slot) | none (current practice: MAIN's task-start go-ahead precedes step 0) | PowerShell in the slot; `node -e` / `-p` |
| 1-2 | `sha256sum` (card form); Read / Grep on the candidate; `mkdir -p /tmp/pt-approval-envelope-1` | copying the candidate and writing `manifest.json` under `C:/Users/Owner/AppData/Local/Temp/pt-approval-envelope-1/protected/`; `codex exec --sandbox read-only <prompt>` (allow-listed, may still prompt) | none | an Edit/Write on `AGENTS.md` in the slot (protected-file write from a Worker slot); a shell pattern search with escaped double quotes (use the Grep tool) |
| 3 (13a) | `protected-request` (card form) | `protected-commit` (exact card form) | **Owner PROTECTED `!` line** | staging `AGENTS.md` by hand; any other land-tool form |
| 10 (step 4) | `npm run qa:offline`; `node qa/instruction_layer_offline.js` | the `wmic` listing | none | a second concurrent heavy run |
| §L (steps 5-6) | `git diff --cached --name-only` (the pre-commit staged-set check); `git log -1 …`; the integrity line; `land-request` | writing `review.md` (Write tool); `git add work/approval-envelope-1/review.md`; `git commit -m <message>` may prompt; final `codex exec --sandbox read-only` | current practice: MAIN's step-13 commit go-ahead | `git add … && git commit …` in one call (form denial → reissue as two calls) |
| closure (step 7) | `push-request`; `cleanup task/approval-envelope-1` | `land` and `push` (`ask` rules, always prompt) | **Owner LAND `!` line; Owner PUSH `!` line** (the PUSH is the public Netlify DEV deploy) | `git push`, `merge`, `rebase`, `pull`; any Netlify command; `curl` / `WebFetch` |

Slice-to-slice continuation (steps 0 → 1 → 2, and 4 → 5 → 6) needs no Owner input when the gates PASS. The expected prompts (B) are listed separately from the C gates. The only scratch locations are `/tmp/pt-approval-envelope-1/` and the step-13a directory `<os.tmpdir()>/pt-approval-envelope-1/protected/`.

## §UER Execution readiness

**ATTENDED-ONLY.** Mode: **Manual** (ASK-tier and protected file in scope).

**§L:** no partial land.

<!-- land-scope:begin -->
AGENTS.md
work/approval-envelope-1/review.md
<!-- land-scope:end -->
<!-- protected-scope:begin -->
AGENTS.md
<!-- protected-scope:end -->
<!-- land-tests:begin -->
node qa/instruction_layer_offline.js
<!-- land-tests:end -->

**Note on land-tests:** a docs-only task has no targeted suite; the gate is the full `qa:offline` at step 4. The one line above proves that the instruction-layer fingerprints (`CLAUDE.md` and two skill files) did not move. `LAND-EVIDENCE` `targeted=PASS` means this line passed.
