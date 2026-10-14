# Task brief: workflow-simplification-1 — narrow STOP-6, autonomous troubleshooting, one heavy run at a time (AGENTS.md only)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL rev2, HELD** (COWORK, 2026-10-14). rev2 = rev1 + two Owner wording clarifications before R11 (E4: an actual `land` / `push` / `protected-commit` denial is always STOP-6; E8: the form-denial continuation applies only in Manual sessions). Swept at `branch-dev` = `origin/branch-dev` `6235b55` (`AGENTS.md` unchanged since `c004a57`). **Owner rulings (2026-10-14):** <ul><li>D-1 APPROVED (§8);</li><li>E4 kept as proposed;</li><li>E5: one consultation per problem is the default, not a limit.</li></ul> Placed only on the Owner's R11 approval of this exact hash.

| | |
|---|---|
| Problem | <ul><li>STOP-6 turns every hook denial into an Owner round trip, including denials where nothing ran and the intended action was permitted.</li><li>Its wording ("never retry, rephrase or reroute") is read as "do not solve the underlying problem another way".</li><li>STOP messages have no fixed shape, so the Owner ends up relaying technical context between parties.</li></ul> |
| Design source | FABLE's workflow simplification report + autonomous troubleshooting amendment (`source/FABLE_Workflow_Simplification_Handoff.txt`, sha256 `a2060b7a…7bfd86`): the narrowed STOP-6, Amendments 1–5, and migration-plan step 2 (heavy-lane part) |
| Backlog | none |
| Baseline | the `branch-dev` tip at this brief's commit. **Valid only if** `AGENTS.md` there is blob `39597f56dde403aa213feae0d3f16ca27e930f44` (LF sha256 `3de6f56d…ec76`); otherwise HOLD |
| Branch / slot | `task/workflow-simplification-1`, **Worker A** (clean; `qa-pin-decouple-1` is closed). Slot B and its uncommitted files are not touched |
| Mode | **Manual**. `AGENTS.md` is protected: it enters only through step 13a |
| qa:offline | count **unchanged**. No suite reads the real `AGENTS.md`: the only suite references are fixture copies and command strings |

## §1 Files

- `AGENTS.md` (protected-scope; candidate `candidate/AGENTS.md`, LF sha256 **`5e8982436261aaabead8bb2258e7c310b736c36931298f72ba3c8cc09bb13744`**)
- `work/workflow-simplification-1/review.md`

Everything else is out of scope:
- `CLAUDE.md`, `.claude/**`, the hook, the land tool and settings;
- every `qa/**` file;
- `BACKLOG.md`.

## §2 Changes (exactly the candidate; diff `candidate/AGENTS.diff`, 7 hunks)

| # | Section | Change |
|---|---|---|
| E1 | Task brief convention → execution preflight block (:40) | "heavy-lane go-ahead" leaves the list of C (Owner) gates **(D-1)** |
| E2 | Step 13 (:184) | A commit-gate denial of the commit's *form* (nothing ran, e.g. add + commit in one call) is a form denial: reissue as the two calls. Any other gate denial stays **STOP-6** |
| E3 | Owner relay rule (:212) | "never a relay for review context" → "review **or troubleshooting** context" |
| E4 | STOP list, item 6 (:330–332) | **Narrowed STOP-6:** <ul><li>a hook denial of an attempted protected action (the HOOK-DENY list: push, merge / rebase / pull, destructive git, `main` checkout, ref moves, a commit refused for its content, `.git` writes, git-config execution paths, Netlify writes, protected-file writes, or the land tool's `land` / `push` / `protected-commit`);</li><li>an integrity FAIL;</li><li>an Auto-mode classifier block or Auto fallback trigger (unchanged).</li></ul> "A denied operation is never performed by other means — no other form, script, tool or sub-agent." **Form denial** (nothing ran, and the action is permitted): one `review.md` line, then reissue in the compliant form. **Unsure, or the same intent denied twice → STOP-6. A denial of an actual `land`, `push` or `protected-commit` operation is always STOP-6, never a form denial.** "A denial closes a path, not the problem" |
| E5 | End of the STOP list (:335) | <ul><li>A fixed **five-line STOP message** (condition, evidence, impact, recommended decision, at most two alternatives).</li><li>New subsection **"Troubleshooting without the Owner"**: the self → consult → decide and record → escalate ladder. Consulting is read-only (Explore, a fork that only diagnoses, or a Codex question). One independent consultation per problem is the **default**; further ones are allowed when each adds new diagnostic value. A consultation is never used to probe or bypass a security control: a suggested rephrase of a denied operation is recorded and not followed.</li><li>**"A method is not a requirement"** (a substitute method that proves the same thing needs no ruling; weakening *what* is proved is STOP-1 / STOP-2).</li><li>**"Who decides"**, four lines: <ul><li>Worker, including `land` / `push` after the Owner's line;</li><li>Codex;</li><li>Bootstrap, which approves no method or fix;</li><li>Owner, including every action under "Protected actions".</li></ul></li></ul> |
| E6 | Test commands (:555–563) | New bullet **"One heavy run at a time across all slots"** **(D-1)**: <ul><li>defines a heavy run: a full `qa:offline`, any `PT_QA_FORCE_HEAVY=1` run, or any run of the six digest-pinned suites;</li><li>a brief condition, with no per-run Owner go-ahead;</li><li>**Check before every heavy run:** a read-only process listing that shows command lines (example given) must show no other `qa/run-offline.js`, `qa:offline` or `qa/*_offline.js` process. The result is one `qa.log` line before the run;</li><li>active → wait and re-check; the check cannot be run → do not start, troubleshoot, then STOP-2;</li><li>Owner task-start sequencing is an extra safeguard, not a substitute;</li><li>briefs approved earlier keep their own requirements.</li></ul> |
| E7 | Protected actions, RC2 line (:636) | "any denied form" → "any commit the r9 gate denies for its content", so it matches E2 |
| E8 | Worker mode policy, Manual fallback header (:246) | Header clarified: "(an Auto or `acceptEdits` session only — there every hook denial, a form denial included, is a trigger; the form-denial continuation under STOP-6 applies only in Manual sessions)". Auto / `acceptEdits` behaviour is unchanged; this only removes the reading that "any hook denial" is STOP-6 in a Manual session (contradiction found by the sweep, §5a) |

## §3 Kept unchanged

Every byte outside E1–E8, including:
- R11 brief approval and the `!` rule;
- R12 forms and single-use LAND / PUSH records;
- step 13a and the protection tiers table;
- the integrity check and its STOP-6;
- STOP-1 to STOP-5 and the STOP-2 carve-out;
- the Auto eligibility and Manual fallback lists;
- LAND / SHIP boundaries;
- every protected action.

No hook, settings, land-tool or QA change; nothing in the enforced layer moves.

## §4 Steps

| Step | Who | Action |
|---|---|---|
| 0 | Worker | Baseline blob check. Step-0 `qa:offline`, or a documented reuse. `plan.md` |
| 1 | Worker | Copy `candidate/AGENTS.md` (from `_held-briefs/governance/workflow-simplification-1/`) to `<os.tmpdir()>/pt-workflow-simplification-1/protected/cand-agents.md`, plus `manifest.json` (`{"files":[{"target":"AGENTS.md","source":"cand-agents.md"}]}`). `sha256sum` must equal §1 (CRLF ≠ LF → STOP) |
| 2 | Worker | Codex round one on the candidate diff against `HEAD:AGENTS.md`. It checks that the diff equals E1–E8 and that nothing in §3 is weakened |
| 3 | Worker → Owner | **13a:** `protected-request` → Owner PROTECTED line → `protected-commit`. Verify the committed blob's LF sha256 = §1 |
| 4 | Worker | **Step 10:** full `npm run qa:offline` on the protected commit = the **tested commit** (heavy-lane per the rules in force before this task lands) |
| 5 | Worker | `review.md`, then final Codex on the task diff including `review.md` |
| 6 | Worker | **One docs-only commit authorized by this brief** (r9 two-call form): only `work/workflow-simplification-1/review.md`, after step 4. No other commit after the tested commit. Then integrity |
| 7 | Bootstrap + Owner | usual R12 LAND, PUSH, cleanup |

**Ordinary in-scope problems** (copy, manifest, harness) are the Worker's to fix. The candidate text itself is fixed: any wording change → STOP-2 with the five-line message.

## §5 Verification (proportionate)

1. Committed `AGENTS.md` LF sha256 = `5e898243…3744` (this binds every word).
2. Grep-tool checks on the committed file:
   - `Never retry, rephrase or reroute` = 0;
   - `heavy-lane go-ahead` = 0;
   - `### Troubleshooting without the Owner` = 1;
   - `**Who decides.**` = 1;
   - `A denial closes a path, not the problem` = 1;
   - `Check before every heavy run` = 1;
   - `The default is one` = 1.
3. Step 10: full `qa:offline` PASS, count = step 0. The land-test passes.
4. Codex (steps 2 and 5): only E1–E8 changed; §3 is intact; no new role, gate or review stage.

## §5a Pre-R11 checks (COWORK, `6235b55`)

- **TB-10 permitted-delta check: PASS.** <ul><li>No `qa/`, `qa/lib/` or `qa/tools/` file reads the real `AGENTS.md`: only fixture copies and command strings.</li><li>Full `qa:offline` differential on a scratch copy of the `6235b55` tree, base vs candidate `AGENTS.md`: the identical hard-failure set (15 / 87 suites, all pre-existing Linux-environment failures). No suite changes result. **No permitted delta is needed.**</li><li>`instruction_layer_offline` passes 58/58 with both.</li><li>Linux sandbox; not a Windows host run. Step 4 is the host proof.</li></ul>
- **Behavioural-contradiction sweep: PASS after E8.** Every `AGENTS.md` mention of STOP-6, denial, heavy run, relay, consultation, ruling and the Bootstrap / Worker / Owner roles was read against E1–E7. <ul><li>**Found and fixed:** the Manual fallback header read as if "any hook denial → STOP-6" applied in Manual sessions → E8.</li><li>The "Who decides" lines would have read narrower than step 14 (Worker runs `land` / `push`) and than "Protected actions" → both named.</li><li>**Checked and consistent:** <ul><li>step 13a / 14 refusals stay STOP-6;</li><li>M5 Auto fallback;</li><li>the STOP-2 carve-out;</li><li>the Codex FIX / DEFER / REJECT escalation;</li><li>"Owner does not decide ordinary in-scope questions";</li><li>COWORK is not a relay;</li><li>step-0 baseline reuse.</li></ul></li></ul>

## §6 Definition of Done

§5 items 1–4 hold. `review.md` holds:
- the Codex ledger;
- `## Timing`;
- `## Backlog reconciliation` (none);
- exactly one line `LAND-EVIDENCE: qa-offline=PASS <N>; targeted=PASS; codex-classI-unresolved=0` (N = the step-4 count), in the step-6 docs-only commit.

## §7 STOP

- Any change outside §1, or a candidate wording change.
- A sha256 mismatch at step 1 or 3.
- A 13a refusal (STOP-6).
- Any denial that is STOP-6 under the **current** rules (this task runs under the pre-change AGENTS.md).
- Two heavy runs at once.

## §8 Owner rulings (recorded)

- **D-1 APPROVED (2026-10-14).** The per-run heavy-lane Owner go-ahead is removed for future briefs. "One heavy run at a time" stays, with the Worker's pre-run process check (E6). Task-start sequencing alone is not relied on. Existing approved briefs, including `qa-pin-decouple-1` and **this brief's own runs**, keep their current requirements.
- **E4** kept as proposed (form denial vs denied protected action; STOP-6 when ambiguous or repeated).
- **E5** consultations: one is the default, not a hard limit.

**Residual notes:** <ul><li>The process listing used for the heavy-run check is not allow-listed in settings, so it prompts once per heavy run until a later settings task allow-lists one read-only listing. `settings.json` is out of this docs-only scope.</li><li>The Netlify DEV deploy from the last push is still UNCONFIRMED. It is not a blocker for this brief's R11, but should be confirmed before this task's PUSH.</li></ul> **Residual risk:** the process check is a point-in-time check, not a lock. Two Workers checking at the same instant could both start; the extra safeguard against that is Owner task-start sequencing.

**Not included (by request; candidates for later one-page tasks):**
- FABLE's three pending `[rule]` lessons (the R3c part is covered by E2);
- retiring the brief-level preflight block;
- the hook task (R12 trigger in program position);
- the protected-path table consolidation.

## §CMD Command card (one command per Bash call, exactly as written; the hook and the land tool are named only in the exact forms below; read files with the Read / Grep tools)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
git rev-parse HEAD:AGENTS.md
sha256sum /c/Users/Owner/AppData/Local/Temp/pt-workflow-simplification-1/protected/cand-agents.md
npm run qa:offline
node qa/instruction_layer_offline.js
node .claude/hooks/pt-land.js protected-request task/workflow-simplification-1
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/workflow-simplification-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/workflow-simplification-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (prompts):** `protected-commit` (the step-13a verb, exact R12 form, after the Owner's PROTECTED line); copying the candidate and writing `manifest.json` (Write tool, in the scratch directory); `git add work/workflow-simplification-1/review.md`; `codex exec --sandbox read-only <prompt>`. The prompt says "the hook" and "the land tool", never their file paths.
- **C (Owner):** R11; PROTECTED; heavy-lane go-ahead for steps 0 and 4 (current rules); LAND; PUSH.

<!-- land-scope:begin -->
AGENTS.md
work/workflow-simplification-1/review.md
<!-- land-scope:end -->
<!-- protected-scope:begin -->
AGENTS.md
<!-- protected-scope:end -->
<!-- land-tests:begin -->
node qa/instruction_layer_offline.js
<!-- land-tests:end -->
