# Master Brief: land-evidence-check-2 — CRLF-safe shebang strip in the land-evidence offline suite (focused repair)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL, HELD** (COWORK, 2026-10-13). Swept at `de5b136706825c893ac85d8dda2ef78db60888e7`, which is `branch-dev` = `origin/branch-dev`, the `land-evidence-check-1` LAND tip.

It is placed only on the Owner's R11 approval of this exact hash.

| | |
|---|---|
| Defect (confirmed) | `qa/land_evidence_check_offline.js` :25 `src.replace(/^#!.*\n/, '')` does not strip the shebang when `qa/land_evidence_check.js` has CRLF line endings: `.` stops at `\r`, so `\n` never matches. The shebang stays in the body, and `new Function(...)` throws `SyntaxError: Invalid or unexpected token` at load (:28, :31). The whole suite exits 1, and so does `npm run qa:offline` on CRLF checkouts |
| Impact | Blocks every task's step 0 / step 10 on a CRLF slot. `market-status-pill-1` (Worker B) is paused at `95a13ba` until this repair is LANDed, pushed and cleaned up, then does a Second-LAND resync |
| Backlog | none (repair of `land-evidence-check-1`) |
| Baseline | **`de5b136`**. **Valid only if** at the task-start tip: <br>• `git rev-parse <tip>:qa/land_evidence_check_offline.js` = `git rev-parse de5b136:qa/land_evidence_check_offline.js`; <br>• `qa/land_evidence_check.js` is byte-identical to `de5b136`; <br>• each §A anchor matches exactly once. <br>Otherwise HOLD |
| Branch / slot | `task/land-evidence-check-2`, **Worker A** (`pt-wt-worker-a`, detached at `de5b136`, clean), after the normal Bootstrap task-start |
| Mode | **Manual**, attended. Test-only change |
| qa:offline | suite count **unchanged** from step 0 (84 at `de5b136`, per the `land-evidence-check-1` step-10 record). This suite gains 3 assertions: 52 → 55 |
| Parallel with | nothing that LANDs before it. Worker B stays paused (§SEQ). One heavy run at a time |

## §0 Evidence (COWORK scratch copy of `de5b136`, outside the repo)

| Run | Result |
|---|---|
| Base, all LF | `LAND-EVIDENCE CHECK OFFLINE: PASS (52 passed, 0 failed)` |
| Base, tool converted to CRLF | `SyntaxError: Invalid or unexpected token` (suite crashes at load) |
| Prototype fix + LE-9 + PN-5, tool CRLF | PASS (55 / 55): LE-9a, LE-9b and PN-5 PASS |
| Prototype, tool LF | PASS (55 / 55) |
| Prototype, tool + suite both CRLF | PASS (55 / 55) |
| S1 state (LE-9 + PN-5 added, old expression kept), all LF | **RED**: `FAIL (54 passed, 1 failed)`, only LE-9b FAIL; LE-9a and PN-5 PASS |

## §SCOPE Approved repair scope (Owner, 2026-10-13); nothing else

1. Change the shebang-strip expression in `qa/land_evidence_check_offline.js` from `/^#!.*\n/` to **`/^#!.*\r?\n/`**.
2. Add **LE-9** regression coverage using CRLF-converted tool source.
3. Add **planted negative PN-5**: reverting the expression to `/^#!.*\n/` makes LE-9 fail.

**Allowed files (exactly):**
- `qa/land_evidence_check_offline.js`
- `work/land-evidence-check-2/review.md`

**Forbidden:**
- the production tool `qa/land_evidence_check.js`;
- `.claude/**` (hooks, settings), `AGENTS.md`, `CLAUDE.md`;
- `qa/run-offline.js`;
- `index.html` and any application or `netlify/**` code;
- `qa/fixtures/index-pins.json` (no `index.html` change, so no pin change).

## §A Anchors (`de5b136`, `qa/land_evidence_check_offline.js`; each exactly once)

| Anchor | Line |
|---|---|
| `function loadFromSource(src) {` | :24 |
| `  const body = src.replace(/^#!.*\n/, '');` | :25 |
| `const tool = loadFromSource(toolSrc);` | :31 |
| `// ── planted negatives (in-memory mutants of the tool)` | (before PN-1) |
| `console.log('\n' + (failed === 0 ? 'LAND-EVIDENCE CHECK OFFLINE: PASS'` | (final summary) |

## §1 Slices

**S1 — RED (test-only; the expression is still the old one).**
1. Add a named constant directly above `loadFromSource`, still holding the **old** expression: `const SHEBANG_RE = /^#!.*\n/;`. Then add an optional second parameter, `function loadFromSource(src, stripRe)`, whose body uses `src.replace(stripRe || SHEBANG_RE, '')`.
2. Add the **LE-9** block after LE-8, before the planted negatives:
   - `const crlfSrc = toolSrc.replace(/\r?\n/g, '\r\n');`
   - helper `loadsAndWorks(re)`: in `try`, load `crlfSrc` with `re`, then require `extractContract(ptLandText)` to return a RegExp whose `.source === RE.source`, and `typeof checkReviewText === 'function'`. In `catch`, return `false`.
   - **LE-9a:** `crlfSrc` starts with a CRLF shebang line (`/^#![^\n]*\r\n/`).
   - **LE-9b:** `loadsAndWorks(SHEBANG_RE) === true`.
3. Add **PN-5** next to PN-1…PN-4: `loadsAndWorks(/^#!.*\n/) === false` ("reverting the strip to `/^#!.*\n/` is caught by LE-9b").
4. **RED evidence** (record in `review.md` which applies):
   - on an LF checkout: `node qa/land_evidence_check_offline.js` exits 1 with **LE-9b FAIL**; LE-9a and PN-5 PASS;
   - on a CRLF checkout: it exits 1 at load with the `SyntaxError` (the original defect).

**S2 — GREEN (the approved one-expression fix).** Change only `SHEBANG_RE` to **`/^#!.*\r?\n/`**, with a one-line comment `land-evidence-check-2: the shebang line ends in CRLF on Windows checkouts.`
- `node qa/land_evidence_check_offline.js` → `PASS (55 passed, 0 failed)`.
- LE-1…LE-8 and PN-1…PN-4 are unchanged and PASS.

**§2 Continuation:** S1 → S2 when:
- RED is recorded as in S1.4;
- `git diff --stat` lists only the suite;
- Codex (step 8, S1 diff) has no unresolved Class I.

**Program STOP:**
- any change outside the two allowed files;
- any existing LE / PN assertion edited or removed;
- the production tool touched;
- a second heavy run;
- any hook denial / refusal;
- any live / DEV / Netlify action.

## §C Hard constraints

| Constraint |
|---|
| Existing assertions LE-1…LE-8, PN-1…PN-4 and their texts are byte-identical. The only existing-code changes are the loader's signature / strip line and the new constant |
| The suite still writes only under `os.tmpdir()` (LE-7) and does no Git or network |
| `npm run qa:offline` PASS with the suite count equal to step 0 |

## §3 Codex review (independent; read-only)

- **Step 8 (S1 diff) and step 12 (final), on the real diff.** Codex confirms:
  - only the two allowed files changed;
  - the expression is exactly `/^#!.*\r?\n/`;
  - LE-9 genuinely converts to CRLF and exercises the loader;
  - PN-5 bites;
  - no existing assertion changed.
- **Prompt rule (lesson from `land-evidence-check-1`):** the Codex prompt text must **not** contain the path of the protected hook script, which would cause an R12 denial. Refer to it as "the L9 hook".

## §ET (ET-1; non-blocking)

About **25 min**: 8 min setup, S1 about 5 min, S2 about 2 min, 10 min closure. Plus the Owner gates.

## §CMD Command card (one command per Bash call; Bash only; absolute canonical root)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
node qa/guard_integrity_check.js --task task/land-evidence-check-2 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/land_evidence_check_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/land-evidence-check-2 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/land-evidence-check-2
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (expected prompts):**
  - `git add qa/land_evidence_check_offline.js work/land-evidence-check-2/review.md`;
  - optionally `node qa/land_evidence_check.js --root C:/Users/Owner/Documents/Project/portfolio-tracker --task task/land-evidence-check-2` (prompts; no allow rule).
- **C (Owner gates):** R11, R12 LAND, R12 PUSH.
- **Never:** `curl`, `WebFetch`, `netlify`, PowerShell.
- **L9 readiness:** before the step-13 commit and again before `land-request`, run the Grep-tool checks on `work/land-evidence-check-2/review.md`: E1 exact line = 1, E2 `LAND-EVIDENCE\s*:` = 1, E3 integrity-output lines = 0.

## §X Closure

1. Step 10 full `npm run qa:offline` PASS on the final tree (suite count = step 0).
2. `review.md`:
   - the defect and RED evidence (which form);
   - the GREEN 55 / 55;
   - LE-9 / PN-5;
   - the Codex ledger;
   - `## Backlog reconciliation` (none);
   - **LAND-EVIDENCE line (L9)**: `review.md` contains **exactly one** line, on its own, starting at column 1, with no bullet, backticks, bold or trailing spaces: `LAND-EVIDENCE: qa-offline=PASS <N>; targeted=PASS; codex-classI-unresolved=0`.
     - `<N>` = the step-10 suite count.
     - Write it only when step 10, every land-test and Codex (no unresolved class I) passed.
     - Commit it in the same commit as the final implementation. It is the only occurrence of `LAND-EVIDENCE:` in `review.md`.
     - The integrity-check output is **not** written into `review.md`; it goes only in the step-13 STOP report.
     - **After an L9 refusal: STOP-6.** No recovery commit without an explicit, incident-specific Owner ruling.
3. Final Codex check.
4. Step 13 commit; the integrity check (`guard_integrity_check.js` with the task record); R12 LAND / PUSH (Owner approvals) / cleanup.

## §SEQ After this task

`market-status-pill-1` (Worker B, paused at `95a13ba`) resumes only after this task's PUSH **and** cleanup, through the Second-LAND resync. That is outside this task.

## §PEP / §UER

- **§PEP:** expected prompts are the `git add` staging and the two R12 verbs.
- **§UER:** **ATTENDED-ONLY**.

## §Y Files, land-scope, land-tests

```
qa/land_evidence_check_offline.js       SHEBANG_RE (CRLF-safe) · loader stripRe param · LE-9a/b · PN-5
work/land-evidence-check-2/review.md    evidence
```

<!-- land-scope:begin -->
qa/land_evidence_check_offline.js
work/land-evidence-check-2/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/land_evidence_check_offline.js
<!-- land-tests:end -->

**Skills:** `pt-offline-suite` Required.

**§L:** if S2 cannot complete, do not LAND the S1 RED state; return to COWORK.
