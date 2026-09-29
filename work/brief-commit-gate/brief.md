# Task brief: R11 — Owner-approved brief-only commit gate for the canonical checkout

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Baseline | the current `branch-dev` at the time of this brief's commit (it must contain r10 `dd03098` and the auto-policy `ea5a632`) |
| Branch / slot | `task/brief-commit-gate`, created from this brief's commit in whichever Worker slot is free and current |
| Mode | **Manual** (hook = DENY tier; AGENTS.md = ASK tier) |
| qa:offline | 50 → 50 (the existing `qa/auto_mode_hardening_offline.js` is extended) |
| Status | CODE-READY on Owner approval of this brief, incl. rulings GB-1…GB-3 |

Objective. Let a Claude Code session in the canonical checkout (the Git/bootstrap Worker) create an
**Owner-approved brief-only commit** on `branch-dev`, and nothing else. It removes the Owner's
verify / add / diff / commit terminal steps. The Owner's approval act remains, as one terminal line
that writes an approval record Claude cannot write (§2). Every r9 / r10 / R3g / R3m / RC2 protection is
otherwise unchanged.

## 1. Current behaviour (r10, `dd03098`)

- `commitGate` begins `if (!slot) return commitDeny('denied outside a Worker slot')`. Every
  canonical-checkout commit is denied with R3c before any read (AH-16 "RC2" rows assert this, with
  zero reads).
- Worker slot commits pass only through the r9 gate:
  - own slot, HEAD on `refs/heads/task/*`, plain form, single top-level command;
  - no `GIT_*` override;
  - R10-3 config/hooks clean;
  - no staged path in `STAGED_DENY_SOURCES`, which includes `work/*/brief.md`.
- `.git/**` writes by any Claude tool are HOOK-DENY in every session (R10-3c Bash/PowerShell writers,
  R10-6 file tools). A file under `.git/` is therefore writable only from the Owner's normal terminal,
  or by the T6 script residual.

## 2. Rulings (approved with this brief)

- **GB-1 — the approval channel is an Owner-written record.**
  - The Owner approves a brief by running, in a normal terminal:

    `Set-Content -Encoding ascii -NoNewline .git\pt-brief-approval "<APPROVED-SHA256> work/<task>/brief.md <branch-dev full OID>"`

  - The hook reads `<canonical>/.git/pt-brief-approval` and requires all three fields to match.
  - *Rejected alternative:* the hash supplied inside Bootstrap's own command. It would be
    self-attested — any session could approve its own brief — so it cannot enforce Owner approval.
- **GB-2 — a new brief (`A.`) or an amendment to an existing brief (`M.`)** may be committed this way.
  No rename, delete, mode change or other entry type is allowed.
- **GB-3 — the gate is not bound to a "Bootstrap identity".** The hook cannot tell sessions apart.
  Any Claude Code session whose cwd is the canonical checkout may use it, and only under a valid
  record. The record is single-use: it is bound to the parent OID, so it goes stale as soon as
  `branch-dev` moves.

## 3. Rule R11 (the only behaviour change)

In `commitGate`, the `!slot` branch calls `briefCommitGate(f, cwd, gitCount, deps)`. **Order matters:
all form and context checks run before any read.**

1. **Narrow form, or unchanged r9 denial.**
   - The command's `rest` must be exactly `['-m', <msg>]`, where `<msg>` matches
     `/^docs\(work\): \S[^\r\n]{0,150}$/`.
   - `f.formIssue` must be null, `f.plainCtx === true`, `gitCount === 1`, and the tool must be `Bash`.
   - If **any** of these fails, return the **existing**
     `commitDeny('denied outside a Worker slot')` / cwd-unknown result, with byte-identical reasons and
     zero reads.
   - This keeps every AH-16 RC2 row unchanged.
2. **Environment.**
   - Any `GIT_ENV_OVERRIDE_RE` or R10 override variable in `process.env` → deny (R11).
   - Any `GIT_CONFIG_*` variable in `process.env` → deny (R11).
3. **Canonical identity.**
   - `deps.repoRoot(cwd)` must equal `process.env.CLAUDE_PROJECT_DIR`, compared after
     `normalizePath`. A missing `CLAUDE_PROJECT_DIR` → deny.
   - `<root>/.git` must be a **directory** (canonical, not a linked worktree).
4. **Approval record** (`deps.briefApproval(root)`: fs read of `<root>/.git/pt-brief-approval`). Deny
   unless:
   - it exists and is ASCII;
   - it is ≤ 256 bytes and a single line (a trailing CR/LF is allowed);
   - it has exactly three space-separated fields: `^[0-9a-fA-F]{64}$`, then a path matching
     `^work/[a-z0-9][a-z0-9._-]*/brief\.md$`, then `^[0-9a-f]{40}$`.
5. **Repository state** (`deps.canonicalStatus(root, deadline)`: **one** subprocess,
   `git status --porcelain=v2 -z --branch --untracked-files=all --no-renames`, with `GIT_*` stripped,
   `GIT_OPTIONAL_LOCKS=0` and the R10-7 budget; evaluated once and stored). Deny unless:
   - `branch.head === 'branch-dev'`;
   - `branch.oid` equals the record's parent OID;
   - there is **exactly one** entry: an ordinary `1` entry with `XY` ∈ {`A.`, `M.`}, submodule field
     `N...`, and path identical to the record path;
   - there are no `?`, `u` or `2` entries.
6. **Content** (`deps.indexBlobSha256(root, path, deadline)`: **one** subprocess,
   `git cat-file blob :<path>`, read as a **Buffer**, same env and budget). Deny unless its sha256
   equals the record hash (case-insensitive).
7. **R10-3 integrity** (the existing readers): `protectedConfigState` and `hooksState` must both be
   `ok`, or deny.
8. Otherwise allow, with reason
   `brief-only commit gate passed (R11: Owner-approved brief, branch-dev, single file)`.

Any reader throwing, a timeout, or an exhausted budget → deny (R11). Every R11 denial names R11 and
ends "commit from a normal terminal".

**Unchanged:**
- the whole slot path of `commitGate`, `STAGED_DENY_SOURCES` and `commitFormIssue`;
- R3g, R3m, RC4, R10-1…R10-8;
- `decisionFor`, the file-tool guard and the PowerShell rules;
- `.claude/settings.json` (`Bash(git commit *)` is already allowed; no settings change).

## 4. AGENTS.md alignment (three edits)

Each quoted anchor below matches exactly once in `AGENTS.md` when line breaks are treated as spaces.
Rewrap only the edited paragraph. `AGENTS.md` is checked out with CRLF line endings; keep them.

- **Task folder convention** (the brief sequence): replace "the Owner makes it in a normal terminal
  (RC2) →" with "the Owner writes the approval record (`.git/pt-brief-approval`, R11) and the
  Git/bootstrap Worker makes the commit through the R11 gate — or the Owner makes it in a normal
  terminal →".
- **Protected actions:** replace "Commits outside the r9 gate — the main checkout, brief-only commits,
  any commit staging a DENY-tier or protected path, any denied form — are made by the Owner in a normal
  terminal (RC2)." with "Commits outside the r9 and R11 gates — any other main-checkout commit, any
  commit staging a DENY-tier or protected path, any denied form — are made by the Owner in a normal
  terminal (RC2). An R11 brief-only commit requires the Owner's approval record."
- **Worker slot model** (the Git/bootstrap bullet): after "(slots, task branches, refs, hashes,
  status)", insert ", and an Owner-approved brief-only commit through the R11 gate".

`CLAUDE.md` is **unchanged**: an R11 commit is specifically approved for its exact scope by the
record. Its fingerprint must stay identical.

## 5. Implementation file set — exactly 4

```
.claude/hooks/pretooluse-guard.js       R11 (§3) — Owner-applied via the copy/hash workflow (Worker never writes it)
qa/auto_mode_hardening_offline.js       AH-19 rows, fixtures, mutants, differential (§6)
AGENTS.md                               §4 edits only
work/brief-commit-gate/review.md        NEW — tracked task evidence
```

**QA suites that read in-scope files as text:**
- `qa/auto_mode_hardening_offline.js` requires the hook module, and mentions `AGENTS.md` only as
  path strings in protected-write rows.
- `qa/instruction_layer_offline.js` fingerprints `CLAUDE.md` (unchanged).

## 6. QA — AH-19 in `qa/auto_mode_hardening_offline.js`

Rows use injected deps unless marked "real git". Each rule gets a planted negative.

| ID | Case | Expected |
|---|---|---|
| AH-19-1 | valid: canonical cwd = `CLAUDE_PROJECT_DIR`, `.git` dir, record matches, one `A.` entry, blob hash matches, config/hooks ok, `git commit -m "docs(work): add x brief"` | **allow** |
| AH-19-2 | valid amendment (`M.`) | allow |
| AH-19-3 | a second staged file · an untracked extra file · an unstaged change elsewhere · the brief itself also modified in the worktree (`AM`) | deny ×4 |
| AH-19-4 | the single entry is an implementation file (`index.html`), or the record path points at it | deny |
| AH-19-5 | path shapes: `work/x/notes.md`, `work/x/y/brief.md`, `work/../brief.md`, `WORK/x/brief.md`, `work/.x/brief.md` | deny |
| AH-19-6 | `branch.head` = `main`, another branch, or `(detached)` | deny |
| AH-19-7 | hash mismatch · record absent · malformed · non-ASCII · multi-line · path mismatch · parent-OID mismatch (stale) | deny ×7 |
| AH-19-8 | forms: `--amend`, `--fixup`, `--squash`, `-a`, pathspec, `-F`, `-s`, `--allow-empty`, `--no-verify`, two `-m`, message not `docs(work): …`, `-C`/`-c` global options, env-prefix `GIT_INDEX_FILE=…`, compound, piped, wrapped, PowerShell tool | deny, with **zero reads** for form failures |
| AH-19-9 | session env: `GIT_DIR` / `GIT_INDEX_FILE` / `GIT_CONFIG_COUNT` set; `CLAUDE_PROJECT_DIR` missing or different; `.git` is a file (linked worktree) | deny |
| AH-19-10 | R10-3: `core.hooksPath` set or a non-sample hook present, with an otherwise valid record | deny |
| AH-19-11 | fail-closed: each reader throws · times out · returns a malformed value; budget exhausted | deny |
| AH-19-12 | CLI: the valid case exits 0; every deny exits 2 with "R11" in stderr | as stated |
| AH-19-13 | **real git** (temp repo under `os.tmpdir()`, `.git` directory, `CLAUDE_PROJECT_DIR` set to it): stage one brief, write the record, run `decide` with the real readers → allow; then run `git commit` in the fixture and assert the commit contains exactly that one path. Also real-git denies for an extra untracked file, a stale parent and a wrong hash. | as stated |
| AH-19-14 | **Worker rules unchanged:** every existing AH-16 row, including the RC2 rows (reasons and zero reads), passes unmodified; a slot commit staging `work/x/brief.md` is still denied by `STAGED_DENY` | unchanged |

- **Differential r10 → r11:** over the full existing corpus with the existing injected deps,
  **0 decision changes and 0 reason changes**. Only AH-19 rows exercise R11.
- **Mutants (≥ 10), each caught:**
  - form check removed;
  - message regex widened;
  - single-entry check removed;
  - `XY` widened;
  - path regex widened;
  - branch check removed;
  - parent-OID binding removed;
  - hash check removed;
  - canonical-identity check removed;
  - R10-3 readers skipped;
  - "reads before form" order swapped.
- **QA lesson:** every subprocess-backed check computes its result once and asserts on the stored
  value.
- **Also run:**
  - full `npm run qa:offline` PASS 50;
  - `node qa/instruction_layer_offline.js` PASS (CLAUDE.md fingerprint unchanged);
  - G1–G3 on the copied hook: real hook-process spawns for one allow and three denies from AH-19.
- **Owner live check after LAND:**
  1. on a throwaway brief commit, or on the next real brief, write the record;
  2. have Bootstrap `git add` the brief and run the narrow commit → it succeeds;
  3. repeat the same command without a fresh record → it is blocked (stale parent).

## 7. Worker flow

1. **Step 0:**
   - cwd is the assigned slot, HEAD on `task/brief-commit-gate` at this brief's commit;
   - run the current-guard check;
   - record the `qa:offline` baseline.
2. **`plan.md`:** requirement→test map plus the CLAUDE.md pre-flight checklist.
   - Gate Verification: name R11's predicate.
   - Definition of Done: §9.
3. Tests first. AH-19 fails against r10, except the AH-19-14 and deny rows that already pass.
4. Build the hook candidate in the Worker scratchpad, outside the repo. Report its sha256. The Owner
   copies it into the slot after a hash check. The Worker **never** writes `.claude/hooks/**`.
5. AGENTS.md §4 edits (Manual; ASK tier), then targeted QA, the differential and the mutants.
6. Worker-launched Codex read-only review of the implementation diff, including the candidate. Resolve
   findings FIX / DEFER / REJECT.
7. Full `qa:offline`, G1–G3, `review.md`, then the Codex final check.
8. **STOP before commit.** The final commit stages `.claude/hooks/pretooluse-guard.js`, which is
   protected, so the Owner makes it in a normal terminal (RC2). Then LAND.

**Implementation route:** in r10, a Worker session hit the Auto-mode safety classifier at the move
from inspection to hook implementation. If that recurs (STOP-6), the Owner implements §3 from this
brief in the slot, and the Worker resumes for QA, differential, mutants, Codex and `review.md` only.

## 8. STOP conditions

- **STOP-1..5** per AGENTS.md, including any file outside §5.
- **STOP-6:**
  - any hook denial, safety-classifier block, or integrity-check FAIL;
  - any Manual fallback trigger;
  - the Owner becoming unavailable.

  Never retry in another form.
- Any change to the slot path of `commitGate`, `STAGED_DENY_SOURCES`, R3g, R3m, RC4, R10-1…R10-8,
  `decisionFor`, the file-tool guard, the PowerShell rules or `.claude/settings.json`.
- Any differential decision or reason change outside AH-19.
- R11 accepting any file other than one `work/<task>/brief.md`, any branch other than `branch-dev`,
  any non-canonical cwd, any form other than `git commit -m "docs(work): …"`, or a missing, stale or
  mismatched record.
- Any read before the form/context checks.
- A Worker write to `.claude/hooks/**`, `.claude/settings*.json` or `.git/**`.
- A `CLAUDE.md` fingerprint change.
- Any push, merge, rebase, LAND, deploy, environment or `main` action.

## 9. Definition of Done

- R11 is implemented exactly per §3 in the Owner-applied hook, with a recorded sha256.
- AGENTS.md carries exactly the §4 edits.
- AH-19 rows and mutants PASS; the r10→r11 differential shows 0 changes; AH-16 is unchanged.
- Full `qa:offline` PASS 50; `instruction_layer` PASS; G1–G3 PASS.
- Codex: no unresolved Class I finding.
- STOP before the Owner's final commit.

## 10. Residuals and compatibility

- **T6 (unchanged):** a Worker-written script could write the approval record. Exposure is still
  bounded:
  - the gate accepts only one `brief.md` on `branch-dev`, at the recorded parent;
  - the Owner reviews before any push;
  - the Worker's own session cannot use the gate, because its cwd is a slot and `-C` is denied.
- **Record lifecycle:** the record is ignored by Git (it lives inside `.git`) and never pushed. It
  goes stale on the next `branch-dev` move. The Owner may delete it after use; that is optional.
- **Compatibility:**
  - Owner-terminal brief commits keep working unchanged;
  - Worker slot commits are byte-identical in behaviour;
  - no settings, CLAUDE.md, Worker-mode or attended-Auto policy change;
  - unattended Auto is still prohibited.
- **Budget:** R11 adds at most two subprocesses (status, blob) to the existing config read. All are
  inside R10-7's 8 s deadline; exhaustion → deny.
