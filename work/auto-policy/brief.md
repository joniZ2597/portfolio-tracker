# Task brief: Attended Auto policy — AGENTS.md / CLAUDE.md alignment, Manual default, QA rules

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Baseline | dd03098a0b0045f6c286d736491ed9a1474d8f20 = branch-dev = origin/branch-dev (main = origin/main = fbec2c1) |
| Branch / slot | task/auto-policy, created from dd03098 in Worker A (`pt-wt-worker-a`) |
| Mode | **Manual** (governance files, settings) |
| qa:offline | 50 → 50 (no suite added or removed) |
| Status | CODE-READY on Owner approval of this brief |

Objective. Make the written policy match the approved attended-Auto model and the r9/r10 guard. Make
Manual (Claude Code `default` mode) the project default. Route the two QA lessons into the QA rules
file. Change nothing else: no hook change, no product code, no weakening of R3g / R3m / RC2 / r9 / r10.

## 1. Rulings (approved with this brief)

- **R-1** Workers may commit on their own `task/*` branch through the r9 commit gate, then STOP and
  request LAND.
  - The Owner keeps LAND, push, main, deploy, environment/runtime, governance, merge/rebase/pull and
    protected-ref control.
- **R-2** The project default permission mode becomes Manual: `.claude/settings.json` `defaultMode`
  changes from `"acceptEdits"` to `"default"`.
  - The Owner applies it through the copy/hash workflow, and AH-8 is updated to match.
- **R-3** Accept Edits and attended Auto are permitted only for approved `Mode: Auto` briefs while the
  Owner is present. They are never the default. Any ASK/DENY surface or Manual fallback trigger →
  STOP-6 and return to Manual.
- **Unattended Auto remains prohibited.** It is not enabled, described as available or scheduled
  anywhere. It waits for a separate remote-control hardening task.
- A second LAND/rebase is performed by the Owner in a normal terminal; the Worker then re-runs QA.
  Bootstrap performs only approved, deterministic mechanical Git/worktree setup the hook permits.

## 2. Slot preconditions

- **Worker A.**
  - Bootstrap creates `task/auto-policy` from dd03098 in `pt-wt-worker-a`, only while the slot is clean.
  - Step 0 confirms HEAD = dd03098 on `task/auto-policy`, and that `git status --porcelain .claude`
    is empty.
- **Worker B (`pt-wt-worker-b`) must not be used** until it has been refreshed to dd03098: clean, and
  detached or on a new task branch at dd03098. It still carries the pre-r10 guard.

## 3. Scope — exactly

1. `AGENTS.md`: edits A1–A13 (§5).
2. `CLAUDE.md`: edits C1–C5 (§6).
3. `.claude/rules/qa-suites.md`: append Q1 (§7).
4. `qa/instruction_layer_offline.js`: replace only the `'CLAUDE.md'` value in `FINGERPRINTS` with
   the sha256 of the new CR-stripped CLAUDE.md.
5. `.claude/settings.json`: one value, `"defaultMode": "acceptEdits"` → `"defaultMode": "default"`.
   - The Worker never writes this file (DENY tier). The Owner applies it (§8).
6. `qa/auto_mode_hardening_offline.js`: AH-8 only (§9).
7. `work/auto-policy/review.md`.

Not in scope:
- `.claude/hooks/**`, any other settings key, any other suite;
- product code, `package*.json`, `BACKLOG.md` (beyond the permitted one-liners);
- Netlify and deploy.

**QA suites that read in-scope files as text:**
- `qa/instruction_layer_offline.js` reads CLAUDE.md: four anchors plus the fingerprint. The anchors
  survive; the fingerprint is updated in item 4.
- `qa/auto_mode_hardening_offline.js` reads `.claude/settings.json` (AH-8, updated in item 6). It
  names `AGENTS.md` / `CLAUDE.md` only as path strings in hook rows, so it is unaffected.

## 4. Editing rules

- Change only the text named below.
- Rewrap only the lines of an edited paragraph.
- Keep each file's existing line endings, with no formatting churn.
- Use rule IDs only; do not add concrete bypass or exploit examples to any policy text.

## 5. AGENTS.md edits

- **A1 — L35–37 (contract intro).** Replace "returns to the Owner only at commit approval, LAND, or on
  a STOP condition below" with "returns to the Owner only at the step-13 STOP (after its gated
  task-branch commit) or on a STOP condition below".

- **A2 — L90–93 (step 12, Class I bullet).** Replace "surface it at the existing commit-approval
  boundary (step 13) for Owner ruling" with "surface it at the step-13 STOP for Owner ruling,
  **without committing**". Also replace "STOP-1..5" with "STOP-1..6".

- **A3 — L115–125 (12a, the commit-boundary heading, and 13).** Replace with:

  > 12a. **Final report.** When the final Codex check returns **PASS**, continue to step 13. The report is delivered at the step-13 STOP.
  >
  > **Then, at the commit boundary — gated, never bypassed:**
  >
  > 13. **Commit on the task branch, then STOP.**
  >     - Commit only in the Worker's own slot, with HEAD on `task/<id>`, through the r9 commit gate
  >       (HOOK-DENY).
  >     - Stage explicit paths with `git add` in one call, then run a plain `git commit -m "…"` in a
  >       separate call. Never amend; never stage a protected path.
  >     - A final commit that must include a DENY-tier or protected path is made by the Owner in a
  >       normal terminal.
  >     - A gate denial is **STOP-6**.
  >     - After the final commit, run
  >       `node qa/guard_integrity_check.js --base-main <main oid> --base-dev <brief base> --task task/<id> --since <task-start ISO> --root <canonical checkout>`.
  >       Any FAIL is **STOP-6**.
  >     - Then **STOP**: report the implementation, QA, Codex and integrity results, and request LAND.
  >     - The Worker never merges, rebases, pulls, pushes or lands.

- **A4 — L127–130.** Replace "commit approval and LAND approval remain the Owner's" with "LAND
  approval remains the Owner's; task-branch commits follow the r9 gate (step 13)".

- **A5 — L136–140 ("Worker mode policy" body).** Replace with:

  > Every brief sets `Mode: Manual` or `Mode: Auto`.
  >
  > - **Manual** — Claude Code `default` mode, every action approved — is the project default.
  > - `Mode: Auto` *permits* the Owner to run the session in **attended Auto** or `acceptEdits`. It never
  >   requires it.
  > - **Attended** means the Owner is at the machine and responsive for the whole session.
  > - **Unattended Auto is not permitted**: scheduled, background, cloud, overnight, or any session left
  >   running without the Owner. It stays prohibited until remote-side prevention exists (for example a
  >   GitHub ruleset blocking direct pushes to main, or Worker sessions without push-capable credentials).
  >   The command-text hook cannot stop a Worker-written script from invoking git (T6), and the integrity
  >   check is detection, not prevention.
  >
  > **`Mode: Auto` eligibility — all must hold:**
  > - an approved, committed brief with explicit files and STOP conditions;
  > - bounded product or QA work;
  > - offline QA only;
  > - no schema, persistence, architecture, contract, scoring or ranking change;
  > - no ASK- or DENY-tier file in scope;
  > - no environment, runtime, live-API, deploy, `main` or external mutation;
  > - every Owner ruling already exists;
  > - the session runs in its own slot under the current guard (see "Worker slot model").
  >
  > **Manual fallback triggers — any one → STOP-6, then Manual:**
  > - an architecture, schema, persistence, contract or scoring surface (M5);
  > - any ASK- or DENY-tier file;
  > - an Owner-ruling conflict or a missing ruling;
  > - committed evidence contradicting the plan (M6);
  > - any hook denial, Auto-mode safety-classifier block, or integrity-check FAIL;
  > - any environment, runtime, live-API, deploy or `main` need;
  > - the current-guard check failing;
  > - the Owner becoming unavailable (the session ends; it never continues unattended).
  >
  > PLAN, IMPLEMENT and MANUAL remain **postures** inside any mode.

- **A6 — L144–148 (tier table).** Replace the table with:

  > | Tier | Enforced by | Covers |
  > |---|---|---|
  > | **HOOK-DENY** | PreToolUse hook, exit 2, every Claude Code session — the only deterministic boundary | push (R3g); merge/rebase/pull (R3m); destructive git; checkout/switch to main; ref moves of main/branch-dev (RC4, R10-4, R10-5); commits outside the r9 gate (R3c); unknown git subcommands (R10-2); escaped forms (R10-1); git config execution paths (R10-3); `.git` writes by any tool (R10-3c, R10-6); PowerShell rules (R2, R2b); wrappers and stdin-fed interpreters; Netlify writes and protected-file writes from Worker slots |
  > | **DENY** | `deny` | `.claude/settings.json` · `.claude/settings.local.json` · `.claude/hooks/**` |
  > | **ASK** | `ask` | `CLAUDE.md` · `AGENTS.md` · `.gitignore` · `.claude/rules/**` · `qa/run-offline.js` · `netlify.toml` · `package.json` · `package-lock.json` · `work/*/brief.md` (once approved/committed) |
  > | **ORDINARY** | the approved brief | everything else in the approved brief |
  >
  > `ask` is a convenience, not a safety boundary: it has been observed not to prompt. A brief that lists
  > any ASK- or DENY-tier file is `Mode: Manual`. DENY-tier files are changed only by the Owner, through
  > the copy/hash workflow.

- **A7 — L150–153 (brief-listing rule).**
  - Replace "Listed → the Worker adopts the MANUAL posture for that edit, answers the prompt,
    continues — no STOP unless one of the five real STOP conditions fires independently." with
    "Listed → the brief is `Mode: Manual`; the Worker adopts the MANUAL posture for that edit and
    continues once the Owner approves the action — no STOP unless one of the six STOP conditions
    fires independently."
  - The "Not listed → STOP-1" sentence is unchanged.

- **A8 — postures and transitions.**
  - L160: posture name `ACCEPT EDITS` → `IMPLEMENT`, and "the mode + the approved brief" → "the
    approved brief".
  - L161: "`ask` rules, for ASK-tier files. Discipline elsewhere" → "Manual mode for ASK/DENY-tier
    files. Discipline elsewhere".
  - L164: "five STOP conditions" → "six STOP conditions".
  - L172 (M2): target `ACCEPT EDITS` → `IMPLEMENT`.
  - L175 (M5): "ASK-tier files also produce a real prompt" → "In an Auto or `acceptEdits` session
    this is a Manual fallback trigger (STOP-6)".

- **A9 — STOP list (L187–197).**
  - L192: "the Owner sees it at commit approval" → "the Owner sees it at LAND review".
  - Append:

    > 6. **A guard or fallback fires.** This means a hook denial, an Auto-mode safety-classifier block,
    >    an integrity-check FAIL, or any Manual fallback trigger in an Auto or `acceptEdits` session.
    >    Never retry, rephrase or reroute through another form, script or tool.

- **A10 — Task folder convention.**
  - L379–380: after "Owner approves the exact brief-only commit →", insert "the Owner makes it in a
    normal terminal (RC2) →".
  - L396–397: "that commit's Owner approval" → "that commit (the Worker's gated step-13 commit)".
  - L412: "Commit, LAND, and SHIP still require their explicit Owner decisions." → "LAND and SHIP
    require explicit Owner decisions; Worker task-branch commits follow step 13."
  - L451: "the commit request" → "the step-13 commit".

- **A11 — Owner LAND / SHIP boundaries (L467–469).** Replace the LAND bullet with:

  > - **LAND** integrates the reviewed task into `branch-dev`: fast-forward only, one task at a time, run by the Owner in a normal terminal (merge/rebase/pull are HOOK-DENY, R3m).
  >   - Before LAND:
  >     - `npm run qa:offline` passes at the final commit;
  >     - `git status` is clean;
  >     - the task diff has been reviewed (Codex or Owner);
  >     - `node qa/guard_integrity_check.js` passes (this covers an empty `core.hooksPath` and only
  >       `.sample` git hooks).
  >   - Claude Code may prepare and request LAND; the Owner confirms it.
  >   - **Second LAND:** when another task landed first, the Owner rebases the task branch in a normal
  >     terminal. The Worker then re-runs `npm run qa:offline` and the relevant targeted tests in its
  >     slot and reports, before LAND.
  > - **Push** is run by the Owner in a normal terminal only (R3g). One consolidated push after a batch
  >   is preferred.

  The SHIP bullet is unchanged.

- **A12 — Protected actions (L475–482).** Replace the "Committing" bullet with:

  > - Commits outside the r9 gate — the main checkout, brief-only commits, any commit staging a DENY-tier or protected path, any denied form — are made by the Owner in a normal terminal (RC2).
  > - `git merge`, `rebase`, `pull`, and any ref move of `main`/`branch-dev` — the Owner, in a normal terminal.
  > - Environment/runtime mutations, and protected governance changes (the hook and settings, through the Owner copy/hash workflow).

- **A13 — Worker slot model (L484–499).** Append:

  > - A Worker session runs only in its own slot (cwd) — never in the other slot or the main checkout.
  > - **Current-guard check** before any non-Manual session: the slot's task branch descends from the
  >   current `branch-dev`, and `git status --porcelain .claude` is empty.
  > - The Git/bootstrap Worker performs approved, deterministic mechanical Git/worktree setup (slots,
  >   task branches, refs, hashes, status) only where the hook permits. It is never a bypass; anything
  >   the hook denies goes to the Owner's terminal.

## 6. CLAUDE.md edits

- **C1 — L22–23.** Replace "(commit,\n  push," with "(commits outside the Worker task-branch gate,
  push, merge/rebase/pull,".
- **C2 — L61.** Replace "Never commit or push unless specifically approved for that exact action and
  scope." with "Never commit or push unless specifically approved for that exact action and scope —
  except a Worker's own `task/*` branch commit through the r9 commit gate, as defined in `AGENTS.md`."
- **C3 — L67.** Replace the row with "| Real-repo file edits, local validation, Git actions | Claude
  Code (Bash tool) in the assigned Worker slot; LAND merge/rebase and push in the Owner's normal
  terminal |".
- **C4 — L75.** Replace "before requesting commit." with "before any commit and before requesting LAND."
- **C5 — L132 only.** In "…Function/background-runtime tests, commit, push, merge, or any
  `main`/production change.", replace "commit, push, merge," with "commits outside the Worker
  task-branch gate, push, merge,". L45 (the Git-safety line) is unchanged.

## 7. `.claude/rules/qa-suites.md` append (Q1)

```
- A check whose assertion calls something with real side effects (spawns a process, reads live
  git or filesystem state) computes the result ONCE, stores it, and asserts against the stored
  value — never two live calls in one assertion path; timing can change the second result.
- A repo-state / tamper check on governance files uses `git status --porcelain`: `git diff HEAD`
  misses untracked planted files, and `--ignored` false-positives on a legitimate gitignored
  `.claude/settings.local.json`. A gitignored malicious governance file is a DENY-tier / T6
  residual concern, not a detection-check case.
```

## 8. Owner-applied settings (copy/hash workflow)

1. The Worker writes the candidate `settings.json` to its scratchpad outside the repo. It is the
   current file with only the `defaultMode` value changed, with the same bytes and line endings
   otherwise.
2. The Worker reports the candidate's SHA256 and a one-line diff.
3. The Owner reviews the diff and copies the candidate into `pt-wt-worker-a\.claude\settings.json`.
4. The Owner confirms with `Get-FileHash` that the copy matches.
5. The Owner restarts the Worker session; the restarted session must start in `default` (Manual) mode.

The Worker never writes, stages or commits `.claude/settings.json` itself.

## 9. AH-8 update (`qa/auto_mode_hardening_offline.js`)

- `settingsProblems`: require `perms.defaultMode === 'default'`. Message: "defaultMode is not
  default (Manual)".
- `appliedSettings()`: `defaultMode: 'default'`.
- Add a planted negative: the applied fixture with `defaultMode: 'acceptEdits'` is rejected (join it
  to the existing planted-negatives array).
- Leave everything else unchanged, including the pre-§5 baseline negative, the `bypassPermissions` /
  `"auto"` rejection, the R10 matcher and RC5.

## 10. QA

- Step 0 baseline: `npm run qa:offline` PASS 50, recorded in `qa.log`.
- `node qa/instruction_layer_offline.js` PASS with the new CLAUDE.md fingerprint. All four CLAUDE.md
  anchors still pass.
- `node qa/auto_mode_hardening_offline.js` PASS, with the applied settings; the new acceptEdits
  negative is rejected; there are no other row changes.
- Text checks, recorded in `review.md`:
  - AGENTS.md no longer contains "one permission mode", "stays `ask`-tier", "prompts even under
    `acceptEdits`", "Committing — Claude Code prepares", or a posture or tier named "ACCEPT EDITS";
  - AGENTS.md contains "STOP-6", "Unattended Auto is not permitted" and `guard_integrity_check`;
  - CLAUDE.md and AGENTS.md no longer contradict each other on commits;
  - `git diff --stat` shows no line-ending churn.
- Full `npm run qa:offline` PASS 50 with the Owner-applied settings.
- `node qa/guard_integrity_check.js --base-main fbec2c193346d7afd1dab6fd11a46b5efe55238b --base-dev dd03098a0b0045f6c286d736491ed9a1474d8f20 --task task/auto-policy
  --since <task-start ISO> --root <canonical>`:
  - before the final commit, C5 may FAIL only for the applied `settings.json` (expected, as in r10);
  - after the Owner's final commit, it must PASS.
- **Owner live checks after applying settings:**
  - L1: a new slot session starts in `default` (Manual) mode;
  - L2: the r10 guard is still active (one denied `--dry-run` form from the r10 brief is still
    blocked).

## 11. Codex

- Worker-launched, read-only (`codex exec --sandbox read-only`), raw output in `codex.md`.
- Step 8: implementation diff, including the settings candidate.
- Step 12: the final check on the task diff.
- Focus:
  - text matches §5–§9 exactly;
  - no weakening of R3g, R3m, RC2, r9 or r10;
  - no unattended-Auto enablement;
  - no AGENTS.md ↔ CLAUDE.md contradiction;
  - settings differ by exactly one value;
  - AH-8 and the fingerprint change only as specified.
- FIX / DEFER / REJECT per AGENTS.md.

## 12. Final commit — Owner terminal

The final commit stages `.claude/settings.json` (DENY tier / protected path), so the r9 gate denies it
in a Worker session. For this task only, the Worker STOPs before commit with the final report and the
exact file list. The Owner makes the final commit in a normal terminal, then decides LAND.

## STOP

- a file outside §3, or wording beyond §5–§9;
- any hook change, or any settings change beyond `defaultMode`;
- a Worker write to `.claude/settings*.json` or `.claude/hooks/**`;
- any weakening of R3g, R3m, RC2, r9 or r10 semantics;
- any text enabling, scheduling or describing unattended Auto as available;
- a fingerprint change other than CLAUDE.md;
- AH-8 or other suite changes beyond §9;
- `qa:offline` or integrity-check failure (other than the expected pre-commit C5);
- use of Worker B before its refresh;
- any branch-dev commit, push, LAND, deploy or main change;
- any condition in STOP-1..5.

## Order

1. Bootstrap: Worker A creates `task/auto-policy` from dd03098.
2. Step 0 baseline.
3. `plan.md`.
4. AGENTS.md, CLAUDE.md, `qa-suites.md`, fingerprint, AH-8.
5. Settings candidate → Owner applies (hash-checked) → session restart (L1).
6. Targeted QA, then full `qa:offline`.
7. Codex (step 8), then fixes.
8. `review.md`.
9. Codex final check.
10. Integrity check.
11. STOP before commit (§12).
