# Task review: next-generation Worker workflow migration

Scope: `work/workflow-migration/brief.md`, committed and Owner-approved at `7284c65`.
Branch: `task/workflow-migration`, worktree `pt-wt-workflow-migration`, based on
`branch-dev` @ `7284c65`.

## Result

S1 = PASS · S2 = PASS · S3 loading observation = **FAIL** (recorded, not a task failure — see
below). No commit, push, or LAND performed by this task; those remain separate Owner decisions.

## Stage-by-stage

### S1 · Contract — `AGENTS.md`, `CLAUDE.md`, `qa/instruction_layer_offline.js`, `.gitignore`

- `AGENTS.md`: inserted the Worker execution contract (12-step sequence, with step 12 revised
  during review to require explicit Owner commit approval before `git commit` — never
  autonomous, matching W-2/`ask`-tier `git commit`), the Worker mode policy (protection tiers,
  brief-listing rule, working postures, M1–M6 transitions), the five STOP conditions, the
  Codex FIX/DEFER/REJECT model, the optional Capability Breakdown section, the Lessons
  retention model (with `[rule]` routed to `AGENTS.md`/`.claude/rules/**` and `[design]`
  routed to `work/<capability>/breakdown.md`, corrected during review from an earlier draft
  that had the routing reversed — neither destination is edited by this task), the
  finalization allowance + `BACKLOG.md` carve-out, the fingerprint pairing rule, and the
  COWORK statement. Extended the existing "Task folder convention" for `plan.md`/`codex.md`.
  Nothing else in `AGENTS.md` was touched.
- `CLAUDE.md`: two changes only — the pre-flight checklist now fires once per task in
  `work/<id>/plan.md` (heading and four items kept verbatim, QA-pinned); `## ChatGPT handoff
  mode` replaced with `## Task completion report` (same six report fields, courier premise
  retired). Nothing else touched.
- `qa/instruction_layer_offline.js`: `FINGERPRINTS['CLAUDE.md']` updated to
  `d05ef33ca1f35422d825ec6341b6aa0f44f90efb79ffe6b7cf66689722be155f`, computed with the
  suite's own `sha256(stripCR(readText('CLAUDE.md')))` after the `CLAUDE.md` edit. Router and
  optimization-rules fingerprints untouched.
- `.gitignore`: added `work/*/plan.md` and `work/*/codex.md`. No `breakdown.md` line (W-8:
  tracked).
- Gate: `node qa/instruction_layer_offline.js` → PASS, 58/58, all four `CLAUDE.md` anchors
  hold. `npm run qa:offline` → PASS. `git diff --stat` at that point → exactly the 4 files.

### S2 · Permissions — `.claude/settings.json`

- Applied via the `json-safe-edit` skill (parse → modify explicit paths → serialize → re-parse),
  across four rounds as the Codex review pass (below) found real gaps in the brief's own
  literal content. **Final proposed task state** (uncommitted; not the brief's original literal
  text — see the Codex review table for what changed and why):
  - `defaultMode: "acceptEdits"`.
  - `deny` +4: `Edit`/`Write` on both `.claude/settings.json` and `.claude/settings.local.json`.
  - `ask` +12: `Edit`+`Write` on `CLAUDE.md`, `AGENTS.md`, `.gitignore`, `.claude/rules/**`,
    `qa/run-offline.js`, `netlify.toml` — every ASK-tier path now has both verbs covered
    (the brief's original text had `Edit`-only on `.gitignore`, `.claude/rules/**`, and
    `qa/run-offline.js`; Codex flagged the gap).
  - `allow` +11: `Bash(npm run test:*)`, `Bash(npm run qa:offline)`,
    `Bash(node qa/*_offline.js)`, `Bash(codex review --uncommitted)` (added post-review, exact
    form only — see finding 3 below), `Bash(git branch --show-current)`,
    `Bash(git status --short --branch)`, `Bash(git log --oneline -3)`,
    `Bash(git log --oneline origin/main -1)`, `Bash(git log --oneline origin/branch-dev -1)`,
    `Bash(git diff --stat)`, `Bash(git diff --cached --stat)` — the brief's original wildcard
    forms (`git status*`/`git diff*`/`git log*`) were replaced with the exact CLAUDE.md
    Git-safety-block commands after Codex flagged a `git difftool --extcmd=...` bypass.
- `Bash(git commit)` / `Bash(git commit *)` confirmed unchanged in `ask` (W-2 not approved).
- Every pre-existing entry preserved — verified by read-back, none removed.
- Gate: JSON parse PASS before and after every round. `npm run qa:offline` → PASS after every
  round; no collateral QA failures were observed. Read-back verification passed on all points
  above at each round.

### S3 · Rules pilot — `.claude/rules/qa-suites.md`

- Created exactly the approved pilot content (`paths: "qa/**"` frontmatter, six
  verified-precedent bullets on suite auto-discovery, requirement↔assertion mapping, planted
  negatives, offline-only fixtures, real-module assertions, derived counts). No other rule
  file created; `.claude/skills/land-prep/` not built.
- `npm run qa:offline` → PASS.
- **Loading observation: FAIL.** A fresh-context agent with no memory of this task's setup was
  given only the worktree path and asked to read `qa/instruction_layer_offline.js`, then report
  every piece of system-reminder/rule/guidance content that appeared automatically in its
  context as a result. Its verbatim finding: **"NO SUCH CONTENT APPEARED."** No mention of
  `qa-suites.md` or any `qa/`-scoped convention accompanied the file read or session startup.
- Per the brief's own instruction on a FAIL result: recorded here, no fallback attempted, no
  fallback file created, no nested-`CLAUDE.md` workaround (that would be a scope amendment),
  and the two held rule files (`.claude/rules/netlify-functions.md`,
  `.claude/rules/client-index.md`) stay out of scope regardless of this result.
- **Owner ruling on this result (this task):** `qa-suites.md` stands as the approved pilot
  artifact and is kept. Automatic path-scoped loading was **not observed** in this environment
  and **must not be relied on** until it is independently re-verified. Any follow-up
  investigation into why the mechanism did not surface the rule content belongs in a **separate
  task**, not this one.

## Codex review

Ran `codex review --uncommitted` against the real working-tree diff, across successive passes as
fixes were applied — each pass re-reviewed the actual diff at that point, not a description.
Codex's own internal `npm run qa:offline` runs also came back PASS each time. Passes 1–7
produced findings 1–11 below; pass 8 (the convergence-decision pass) produced findings 12–14.
After recording the two DEFERs and fixing the one documentation item from pass 8, one final 9th
Codex confirmation pass will run under the agreed convergence rule (new P1/security/scope-
integrity/correctness blocker → STOP and NOT READY; new non-blocking P2/P3 → record as DEFER,
no further fix/review loop; no new blocker → READY FOR COMMIT). The loop is not closed until
that 9th pass completes.

| # | Pass | Finding | Class | Resolution |
|---|---|---|---|---|
| 1 | 1st | `Bash(git diff*)` in the new `.claude/settings.json` allow list also matches `git difftool --extcmd=...`, which can execute an arbitrary external command — bypassing the protected-action boundary the same commit codifies. | **FIX** (Owner-confirmed) | Replaced with exact `Bash(git diff)`/`Bash(git diff *)` (2nd-pass Codex flagged this was still a wildcard risk — see finding 3 — and it was replaced again with exact `Bash(git diff --stat)`/`Bash(git diff --cached --stat)`). |
| 2 | 2nd (incl. `review.md`) | No `Write(...)` guard for the ASK-tier paths that only had `Edit(...)` (`.gitignore`, `.claude/rules/**`, `qa/run-offline.js`) — a `Write`-tool edit on these paths would bypass the promised confirmation. | **FIX** (Owner-confirmed) | Added `Write(./.gitignore)`, `Write(./.claude/rules/**)`, `Write(./qa/run-offline.js)` to `ask`. |
| 3 | 2nd (incl. `review.md`) | The `git diff*`/`git log*`/`git status*` wildcard `allow` entries permit `--output=<path>` on any of these commands, letting Git itself overwrite an arbitrary file (including a DENY-tier one) without going through the `Edit`/`Write` tool gate. | **FIX** (Owner-confirmed) | Replaced all wildcard git-status/diff/log allow entries with the exact commands from `CLAUDE.md`'s own Git-safety block (`git branch --show-current`, `git status --short --branch`, `git log --oneline -3`/`origin/main -1`/`origin/branch-dev -1`, `git diff --stat`, `git diff --cached --stat`) — exact-match strings carry no injectable flags. |
| 4 | 3rd (post-fix confirmation) | `.claude/settings.json` has no allow rule for invoking `codex review` itself, so the Worker's own mandated Codex-review step would hit an unplanned prompt, in tension with the autonomous-execution intent of `AGENTS.md`'s Worker execution contract. This exceeds the brief's originally approved allow-list content. | **FIX** (Owner-confirmed, scope exceeded knowingly) | Owner directed a narrowly-scoped **exact-match** rule only: `Bash(codex review --uncommitted)` (rejected the broader `Bash(codex review*)` this task first proposed — exact form only, no wildcard). |
| 5 | 3rd (post-fix confirmation) | `qa/run-offline.js` is ASK-tier (editable); `package.json` remains an ordinary `acceptEdits` path. Because allowed `npm`/`node` commands can execute code/configuration from editable repo files — including `package.json` scripts and QA code — the permission model does not provide a process-level sandbox against malicious or compromised executable repo content. | **DEFER** (Owner-confirmed) | Deferred for a separate dedicated future task; pending backlog routing. No fix attempted here. |
| 6 | 3rd (post-fix confirmation) | `review.md`'s Codex-review table described the pre-fix `.claude/settings.json` state (`Bash(git diff)`/`Bash(git diff *)`, `ask +9`) rather than the file's actual current proposed content — a documentation-accuracy defect introduced by this task's own drafting. | **FIX** (self-identified defect) | This table and the S2 summary above were rewritten to match the actual current proposed content at each stage. |
| 7 | 4th (post-fix confirmation) | `defaultMode: "acceptEdits"` is session-wide with no branch-awareness — Claude Code's permission engine has no "current git branch" matcher, so if a session is ever opened with the repo checked out on `main`, ordinary file edits would proceed without a prompt. Main/production protection currently relies entirely on `AGENTS.md`/`CLAUDE.md` discipline plus the existing `ask`-tier `git checkout main`/`git switch main` rules, not an engine-level gate. | **DEFER** (Owner-confirmed) | A real fix needs new tooling (e.g. a `SessionStart` hook) outside this task's approved 6-file scope. Deferred for a separate dedicated future task; pending backlog routing. No fix attempted here. |
| 8 | 5th (post-`review.md`-edit confirmation) | `AGENTS.md`'s "Task folder convention" section states `review.md` receives one final lightweight Codex check against the complete final diff (incl. `review.md` itself) before commit — but the Worker execution contract's numbered steps never stated this as a step; step 11 (write `review.md`) went straight to commit-approval. Internal inconsistency within this task's own new `AGENTS.md` text. | **FIX** (Owner-confirmed) | Added a new step 12 to the Worker execution contract stating the final lightweight Codex check on the complete diff, with FIX/DEFER/REJECT resolution and QA re-run as needed; renumbered the former step 12 (commit boundary) to step 13. |
| 9 | 6th (post-fix confirmation) | The brief (`brief.md#L201-L204`) requires the final green `npm run qa:offline` run captured to `work/workflow-migration/qa.log` before LAND-readiness is claimed; that file was absent from the worktree even though this review already asserted the validation was done. | **FIX** (Codex finding) | Ran `npm run qa:offline` once more with output captured to `work/workflow-migration/qa.log` (gitignored, untracked, 309 lines, exit 0, `OFFLINE VALIDATION: PASS`). |
| 10 | 7th (post-fix confirmation) | `work/<id>/brief.md` (once approved/committed) had no `Edit`/`Write` guard in `ask` or `deny` — under `acceptEdits`, a Worker could silently edit its own approved scope-authorization file, directly undermining the brief-listing rule this task installs ("the Worker does not amend its own scope"). | **FIX** (Codex finding) | Added `Edit(./work/*/brief.md)` and `Write(./work/*/brief.md)` to `ask` in `.claude/settings.json`. |
| 11 | self-identified (immediately after finding 10's fix) | `AGENTS.md`'s own ASK-tier documentation table did not list `work/*/brief.md`, so it would have gone out of sync with the settings.json content the moment finding 10 was fixed — the same class of internal-consistency gap as finding 8. | **FIX** (Owner-confirmed) | Added `work/*/brief.md` (once approved/committed) to the ASK-tier table row in `AGENTS.md`. |
| 12 | 8th (convergence-decision pass) | `.claude/settings.json`'s `Bash(node qa/*_offline.js)` allow rule doesn't cover top-level `*_test.js` suites without a package script (e.g. `research_evidence_source_renderer_test.js`), so a targeted run of one of those would still prompt, an autonomy/convenience gap rather than a correctness or security issue. | **DEFER** (Owner-confirmed) | Pending a future workflow-hardening task. No fix attempted here. |
| 13 | 8th (convergence-decision pass) | `CLAUDE.md`'s "Task completion report" fires only at LAND-request time, not on a STOP return, even though its own six fields explicitly include a PASS/FAIL/STOP result and blocker. A fix would require another `CLAUDE.md` edit plus a fingerprint recompute in `qa/instruction_layer_offline.js`. | **DEFER** (Owner-confirmed) | Pending a future governance task. No fix attempted here. |
| 14 | 8th (convergence-decision pass) | This `review.md`'s Codex-review intro text said only "three successive passes" occurred, while the table already carried findings from seven passes — a stale summary line. | **FIX** (Codex finding) | Rewrote the intro to state the actual pass count and structure (passes 1–7 → findings 1–11; pass 8 → findings 12–14; one further 9th confirmation pass to follow). |
| 15 | 9th (final confirmation pass) | `AGENTS.md`'s STOP-4 wording ("a required test or action needs a live, production, deployment, or other protected mutation") reads as self-triggering on the routine, expected `git commit` at the commit boundary, since commit is itself a listed protected action — even though step 13 already defines a separate, correct commit-approval-request path for exactly that case. | **DEFER** (Owner-confirmed, per agreed convergence rule: non-blocking P2 → DEFER, no further loop) | Pending a future governance task to narrow STOP-4's wording or state the commit/LAND exemption explicitly. No fix attempted here. |
| 16 | 9th (final confirmation pass) | This task's own `AGENTS.md:52-55` requires the raw Codex response to be captured verbatim to `work/<id>/codex.md`, but this task's own `codex.md` was never created — this review's Codex findings are summarized, not the mandated raw transcript artifact. | **DEFER** (Owner-confirmed, per agreed convergence rule: non-blocking P2 → DEFER, no further loop) | Not corrected retroactively in this task (the contract itself states a reconstructed/paraphrased `codex.md` is not acceptable — recreating one now from summarized findings would not satisfy the requirement it names). Noted as a known gap in this task's own evidence; the requirement applies cleanly starting with the next task that runs under this contract. |

**Convergence reached, per the Owner-agreed rule applied to this 9th pass:** no new P1, security, scope-integrity, or correctness-blocker finding — findings 15–16 are both non-blocking P2, recorded as DEFER. The Codex-review loop stops here.

Every FIX was re-verified after application: JSON re-parses, `node qa/instruction_layer_offline.js`
PASS 58/58, full `npm run qa:offline` PASS. No REJECT findings. Raw Codex output was not
separately captured to `work/<id>/codex.md` in this task — `codex.md` is untracked/gitignored per
this same migration's own convention; capturing it verbatim in a future task's tooling is noted
below.

## Final validation

- `node qa/instruction_layer_offline.js` → **PASS, 58/58**.
- `npm run qa:offline` → **OFFLINE VALIDATION: PASS**, exit 0, 1 advisory warning (pre-existing,
  unrelated — a smart-quote character in `index.html` line 10045, not touched by this task), no
  FAIL lines, run three times (post-S1, post-S2, and after the Codex fix) with identical results.
- `git diff --stat` against `branch-dev` for the **implementation migration scope** → exactly
  six files: `AGENTS.md`, `CLAUDE.md`, `qa/instruction_layer_offline.js`, `.gitignore`,
  `.claude/settings.json`, `.claude/rules/qa-suites.md`. No more, no fewer.
- This `review.md` (tracked, per the "Task folder convention") is **additional** to that
  six-file implementation scope, not counted within it. `BACKLOG.md` was checked under the
  standing finalization allowance but **not amended** — see "BACKLOG.md amendments" below. The
  final total task diff is therefore implementation (6) + `review.md` (1) = **7 files**, never
  described as "exactly six" once `review.md` exists.
- Not created: `.claude/rules/netlify-functions.md`, `.claude/rules/client-index.md`,
  `.claude/skills/land-prep/`.
- Not touched: `Bash(git commit*)`'s `ask` tier, any product code, any other QA suite,
  `BACKLOG.md` (checked, not amended — see below), `main`.
- Not performed: commit, push, LAND.

## Lessons

- [covered]  The five STOP conditions and the Codex FIX/DEFER/REJECT model were already fully
  specified in the ratified authority document
  (`.ai-reports/status/next-gen-worker-flow.PREP.local.md`, D-1) — this task reproduced them
  verbatim into `AGENTS.md`, no new design.
- [local]    The initial `AGENTS.md` draft got two things wrong against the Owner's actual
  intent before this task's own commit even existed: it made step 12 (commit) read as
  autonomous, contradicting W-2's standing `git commit` = `ask`; and it had the Lessons
  `[rule]`/`[design]` routing reversed. Both were caught and corrected in-session, before any
  commit. True only of this task's drafting process; no destination.
- [rule]     Add a reviewer fallback: Codex primary; independent fresh-context Claude if Codex
  is unavailable; Owner review or explicit waiver if both are unavailable. Worker self-review
  never satisfies the reviewed-diff requirement. Destination-ready text for `AGENTS.md`'s
  "Codex as diff reviewer" / Codex-review step of the Worker execution contract — **not applied
  to `AGENTS.md` in this task**; routed to a separate, future approved workflow change that owns
  that destination.
- [local]    `work/<capability>/breakdown.md` is now `AGENTS.md`'s named destination for
  `[design]`-tagged lessons, but no capability has used a Breakdown yet under this workflow.
  Whether the nine-row Current/Change Map and the 9-row/80-line size limits are workable in
  practice is unproven — true only as an observation from this task's drafting; no
  destination-ready text exists yet, so this is not tagged `[design]`.
- [backlog]  `.claude/rules/qa-suites.md` did not visibly load into a fresh agent's context when
  it read a `qa/`-scoped file in this environment (S3 loading observation: FAIL, see above).
  Follow-up investigation into path-scoped rule loading belongs in a separate task — this is
  product/workflow work, not a local-only observation. **Not written to `BACKLOG.md`** — no
  existing item references it, and the standing allowance cannot create a new one (see the
  `[rule]` lesson immediately below, and "BACKLOG.md amendments"). **Pending routing**: stays
  recorded here in `review.md` until the next backlog-maintenance task adds it.
- [rule]     If a backlog-worthy lesson has no existing referenced `BACKLOG.md` item that can be
  amended under the standing allowance, keep it pending in `review.md` and route it during the
  next backlog-maintenance task; do not force it into an unrelated item. Destination-ready text
  for `AGENTS.md`'s "Finalization allowance" section — **not applied to `AGENTS.md` in this
  task**; this task's own attempt to route the S3 loading-failure finding to `BACKLOG.md` is
  exactly the process gap this lesson names.
- [local]    The fresh worktree (`pt-wt-workflow-migration`) had no installed dependencies
  (`node_modules` absent) on creation — `git worktree add` does not share or install
  dependencies. `npm install` was required before any `qa:offline` baseline could be trusted.
  True only of this task's setup; no destination (every worktree needs this, and `AGENTS.md`'s
  "Simplified worktree model" already treats a worktree as "just an isolated checkout").

## BACKLOG.md amendments (standing allowance — not applied)

Checked all 21 active `BACKLOG.md` entries for an existing item this task could honestly amend
(rules-pilot outcome, `/land-prep` deferral). **None exists.** The closest candidate, item 16
("Step 2B workflow hooks"), is about a different thing — LAND-mechanics sequencing after the
TradingView pilot — not the rules pilot or `/land-prep`. The standing finalization allowance
permits amending items this task **references**, not creating new ones; since no genuinely
referenced existing item was found, **no `BACKLOG.md` change was made** (Owner-confirmed:
skip the amendment rather than force an artificial match or add a new entry). `BACKLOG.md`
is unchanged by this task.
