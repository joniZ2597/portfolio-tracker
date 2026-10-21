# Brief: backlog-entry-39 — register BACKLOG entry 39 (R10-E false-positive blocking of escaped read-only Bash commands) (docs only)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below. DRAFT by the Planner (2026-10-20) for MAIN's review; not approved, not committed, not staged. Order of events: the Owner's R11 brief approval and the brief-only commit (Bootstrap / MAIN steps, AGENTS.md "task folder" section) come first; the Worker starts only after that commit exists, so the Worker steps in §3 begin at step 0 and contain no brief-request. Nothing in this brief authorizes a gate, a hook change or any implementation of the fix it registers.

| | |
|---|---|
| Problem | The PreToolUse guard can reject a legitimate read-only Bash command that contains escaped double quotes. The Owner ruled (2026-10-19, Option B; refined 2026-10-20) that the behaviour is registered as BACKLOG entry 39 by a separate governed docs task, not inside `scan-action-gate-1` and not by a manual `BACKLOG.md` edit |
| Objective | `BACKLOG.md` on `branch-dev` gains exactly three insertions, byte-for-byte the texts of §2: entry 39 in the NEXT section, one row in the MASTERS "Standalone" table and one row in the MASTERS "Mapping" table. Nothing else changes |
| Owner rulings applied | NEXT / non-blocking (not LATER) · Standalone and Mapping rows approved, both pointing only to entry 39 (no second task id, no separate implementation item) · the fix is recorded as a FUTURE separately governed guard-hook change; the guard is **not** modified · wording keeps the exact technical explanation (escape normalization makes the quote pairing ambiguous, and the result is a fail-closed parser denial) and does **not** call it a concealed prohibited operation |
| Backlog | **Entry 39 — new, created open** (not `close`, not `partial`: creating the entry is the deliverable). `BACKLOG.md` is therefore in the file set **and** the `land-scope` block |
| Baseline (§TS) | `branch-dev` tip at task-start. Planner check 2026-10-20: `branch-dev` = `9cacba8`; `BACKLOG.md` git blob `808834478014144910909af46b68cb3f073e5419` (1 file, 451 lines, index LF, working tree CRLF); no entry 39 exists. Valid only if the §TS checks pass |
| Branch / slot / mode | `task/backlog-entry-39` · first free slot · **Manual**, attended |
| qa:offline | count unchanged (no suite reads `BACKLOG.md`: the only `qa/` hits are two comments in `qa/run-offline.js`) |
| Parallel with | any task that does not edit `BACKLOG.md`. No other `BACKLOG.md` task may run concurrently. One heavy run at a time |
| Scoring boundary | none touched. No code, no `index.html`, no `qa/`, no `.claude/**`, no pin map |
| Gate verification | N/A (docs only; no runtime path) |
| Skills | none required |

## §TS Task-start baseline checks (read-only, at the task-start tip T)

| # | Check (all must hold; else STOP and return to MAIN) | Value at `9cacba8` |
|---|---|---|
| TS-1 | `git rev-parse HEAD:BACKLOG.md` equals the value; `git ls-files --eol BACKLOG.md` reads `i/lf w/crlf` | `808834478014144910909af46b68cb3f073e5419` · `i/lf w/crlf` |
| TS-2 | the three anchors of §2 each occur exactly once in `BACKLOG.md`; no line begins `### 39` and no table row begins `\| 39 ` | yes |
| TS-3 | `work/backlog-entry-39/` does not exist except this brief | yes |

If another task has changed `BACKLOG.md` since `9cacba8`, TS-1 fails: STOP and report to MAIN (the expected blob of §4 is then stale).

## §1 Files (exactly)

- `BACKLOG.md` — the three insertions of §2 only
- `work/backlog-entry-39/review.md`

**Forbidden:** `.claude/**` (the guard hook is **not** edited), `AGENTS.md`, `CLAUDE.md`, `index.html`, every `qa/**`, `services/**` and `netlify/**` file, `package*.json`, `work/**` other than this task's `review.md`, any Git configuration.

## §2 Content (normative)

Every insertion is made at the anchor named for it and consists of the lines shown between the markers (marker lines and fences are not part of the file). Existing lines are not changed or removed. `BACKLOG.md` is **CRLF in the working tree**: every inserted line ends with CRLF and the file stays CRLF throughout. Entry 39 is a Markdown block followed by one blank line.

### E1 — entry 39, NEXT section

Anchor (unique): the text `*Deps:* none.` + blank line + `---` + blank line + `## LATER` that closes the NEXT section (the `*Deps:* none.` is entry 37's last line). Insert the block below, followed by one blank line, **after** entry 37's `*Deps:* none.` line and its following blank line, i.e. immediately before the `---` that precedes `## LATER`.

<!-- entry39:begin -->
~~~~markdown
### 39 · R10-E — Fix false-positive blocking of escaped read-only Bash commands
**Workflow / Dev Infra** · **new 2026-10-19** · NEXT, non-blocking · **Owner-gated: DENY-tier hook change**

The PreToolUse guard can reject a legitimate read-only Bash command that contains escaped double quotes (`\"`), because
escape normalization makes the quote pairing ambiguous and the guard then fails closed.

*Mechanism (read from `.claude/hooks/pretooluse-guard.js`):* after its normal analysis the guard (R10-1) strips shell
escapes from the command (`stripShellEscapes`) and analyses that copy as well. For Bash the stripper drops each backslash
outside single quotes and keeps the following character without updating its own quote state, so `\"` inside a
double-quoted string becomes a bare `"` in the copy. The copy's quote pairing is then ambiguous, the analysis cannot
resolve it, and the guard denies with `escape-normalized command could not be fully resolved - denied (R10-E)`. This is a
fail-closed parser denial; it is not a finding that the command conceals a restricted operation.
*Evidence:* the `scan-action-gate-1` coupling sweep of 2026-10-19 — a read-only `grep` / `cut` / `head` pipeline over
`qa/*.js` whose pattern held `\"` twice inside one double-quoted string; no Git, write, network or protected path; it was
recovered under an Owner one-time ruling using the Grep and Read tools only. Earlier R10-E denials of read-only commands are
recorded in `work/market-status-pill-1/review.md`, `work/pt-skills-v1/review.md`, `work/r2-ma-stack/review.md`,
`work/r3-no-synthetic-50/review.md`, `work/task-base-record/review.md` and `work/qa-stage2-git-contracts/review.md`
(whether each is this same case is not established).
*Interim practice:* use the Grep and Read tools for pattern searches.
*Remaining (future, not started):* a safe parsing improvement that preserves the fail-closed behavior and every existing
protection. It changes `.claude/hooks/**` (DENY tier), so it is a separately governed task: its own approved brief,
independent review, regression tests and the applicable PROTECTED authorization. Registering this entry does not modify
the guard.
*Deps:* none.
~~~~
<!-- entry39:end -->

### E2 — MASTERS "Standalone (outside the Masters)" table row

Anchor (unique, the last row of that table): `| 24 · Sidecar harness noise | STANDALONE | Worker-local tool outside this repository |`. Insert the row below as the next line.

<!-- row-standalone:begin -->
~~~~markdown
| 39 · R10-E false-positive blocking of escaped read-only Bash commands | STANDALONE (workflow) · Owner-gated | DENY-tier hook change; future separately governed task; entry 39 only |
~~~~
<!-- row-standalone:end -->

### E3 — MASTERS "Mapping" table row

Anchor (unique, the last row of that table): `| 38 (R-7) | INVESTIGATION | its fix → **ai-output-1** S1 |`. Insert the row below as the next line.

<!-- row-mapping:begin -->
~~~~markdown
| 39 | STANDALONE (workflow) · Owner-gated (DENY-tier hook) | future separately governed guard-hook change; not scheduled; entry 39 only |
~~~~
<!-- row-mapping:end -->

### §2a Conformance checklist (the Worker verifies each and records it in `review.md`)

1. `git diff --numstat -- BACKLOG.md` reads `27	0	BACKLOG.md` (27 insertions, 0 deletions); no other file differs except `work/backlog-entry-39/review.md`.
2. `git ls-files --eol BACKLOG.md` still reads `i/lf w/crlf` (no `w/mixed`, no `w/lf`).
3. Entry 39 exists once: exactly one line begins `### 39 · R10-E`; exactly two table rows begin `| 39 ` (E2, E3); the heading is inside the NEXT section (after entry 37, before `## LATER`).
4. Each inserted text equals the §2 block byte-for-byte (apart from CRLF terminators).
5. The wording rules hold: the entry contains the phrases `quote pairing is then ambiguous` and `fail-closed parser denial`, and the only occurrence of `conceal` is the sentence `it is not a finding that the command conceals a restricted operation` (no other concealment characterisation appears).
6. Every cited review file exists: `work/market-status-pill-1/review.md`, `work/pt-skills-v1/review.md`, `work/r2-ma-stack/review.md`, `work/r3-no-synthetic-50/review.md`, `work/task-base-record/review.md`, `work/qa-stage2-git-contracts/review.md` (Glob / `git ls-files`), and each contains the text `R10-E` (Grep; record the line numbers).
7. `.claude/hooks/pretooluse-guard.js` is unchanged (`git diff --stat` lists neither it nor anything under `.claude/`).
8. The mechanism sentence still matches the guard source at the task base: the Worker re-reads `stripShellEscapes` and the `escape-normalized command could not be fully resolved` denial with the Read / Grep tools and records the line numbers; if they differ in substance, STOP and report.

## §3 Steps

| Step | Action |
|---|---|
| 0 | §TS; the process check (Bash `wmic process where "name='node.exe'" get ProcessId,CommandLine`, §PEP class B; never PowerShell in a slot; its result is one line in `qa.log` before each heavy run, here and at step 10) → step-0 `qa:offline` (PASS expected; a failure is recorded and reported to MAIN); `plan.md` with the CLAUDE.md four items (Pattern Auditing: the committed `work/backlog-reconcile/` brief for CRLF-preserving `BACKLOG.md` edits and the NEXT / Standalone / Mapping structure; State & Boundary Isolation: docs only; Gate Verification N/A; Definition of Done = §4) |
| 1 | Apply E1, E2, E3 to `BACKLOG.md` keeping CRLF (insert the lines exactly as §2; do not retype other lines; no Edit-tool CRLF-to-LF rewrite). Byte audit after each edit: `git ls-files --eol BACKLOG.md` must read `i/lf w/crlf`; if it reads `w/mixed` or `w/lf`, fix the line terminators of the inserted lines only and re-check |
| 2 | Checklist §2a items 1–8 |
| 8 | Codex round one (diff review): confirms only the two §1 files changed, the insertions equal §2, the wording rules and the guard untouched |
| 10 | process check (line in `qa.log`) → full `qa:offline` PASS (count unchanged) |
| 11 | `review.md` (checklist results; `## Backlog reconciliation`: entry 39 created, with the three insertions; lessons; exactly one line at column 1 `LAND-EVIDENCE: qa-offline=PASS <N>; targeted=PASS; codex-classI-unresolved=0`, written only after step 10, the land-tests and the Codex pass) |
| 12 | final Codex read-only check on the complete task diff **including `review.md`** (`codex exec --sandbox read-only`, output in the ignored `codex.md`); findings resolved FIX / DEFER / REJECT |
| 13 | step-13 commit of the two §1 files (explicit `git add` paths, then the commit in a separate call); then the integrity check from the card. Its result is **LAND evidence**: reported only in the step-13 STOP report, never written into `review.md` (no amend, no extra commit) |
| LAND / PUSH | usual R12 |

**STOP for:** any change outside §1; any wording not in §2; TS-1 failing; checklist item 8 differing in substance; any guard denial except an AGENTS.md form denial (reissue once in compliant form, log it in `review.md`, report to MAIN); a second concurrent heavy run.

**Coordination:** the Worker reports `ACK-ASSIGN`, `PROGRESS`, `GATE`, `STOP` and `RESULT` to MAIN under the handoff pilot; a message never approves a gate.

## §4 Definition of Done

1. `BACKLOG.md` is the committed text of the three insertions: expected git blob (LF-normalised) `0cab7822d10b2f2c06de223bce4b8b92be8b3ceb` (451 → 478 lines), computed by the Planner from the committed text and §2; the Worker confirms with `git rev-parse :BACKLOG.md` after `git add`.
2. Only the two §1 files changed; `qa:offline` PASS with the step-0 count; `BACKLOG.md` is still CRLF.
3. The guard hook and every other protected path are unchanged.

## §CMD Command card (one command per Bash call; Bash tool only)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
git diff --numstat -- BACKLOG.md
git ls-files --eol BACKLOG.md
git rev-parse HEAD:BACKLOG.md
git rev-parse :BACKLOG.md
node qa/guard_integrity_check.js --task task/backlog-entry-39 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/index_pins_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/backlog-entry-39 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/backlog-entry-39
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

## §PEP Execution preflight

| Class | Items |
|---|---|
| **A (allowed, no prompt expected)** | the git read-only lines of the card; `--print-record`; `npm run qa:offline` after the process check; `node qa/index_pins_offline.js`; Read / Write / Edit tools on the two §1 files; Grep; Glob |
| **B (expected prompts)** | `git add BACKLOG.md work/backlog-entry-39/review.md` (explicit paths); the Bash `wmic` listing before each heavy run; `git ls-files --eol`; `codex exec --sandbox read-only <prompt>` |
| **C (Owner)** | R11 on this brief; the step-13 commit approval if prompted; LAND; PUSH |
| **D (never)** | PowerShell in the slot; `node -e` / `-p`; any Git configuration change; editing any file outside §1 (in particular `.claude/**`); `curl`, `WebFetch`, `netlify`; a shell pattern search containing escaped double quotes (use the Grep tool) |

## §UER Execution readiness

**ATTENDED-ONLY.**

**§L:** no partial land.

<!-- land-scope:begin -->
BACKLOG.md
work/backlog-entry-39/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/index_pins_offline.js
<!-- land-tests:end -->

**Note on land-tests:** a docs-only task has no targeted suite; the gate is the full `qa:offline` at step 10. The one line above is a cheap smoke check that no pinned file moved (the task touches none). `LAND-EVIDENCE` `targeted=PASS` means this line passed.
