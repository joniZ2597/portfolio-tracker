# Review — auto-mode-hardening

**State: PHASE 2 COMPLETE (post R2 + R2b) — STOPPED BEFORE COMMIT.**
G1–G4 pass, targeted QA 844/844, `qa:offline` PASS (50 suites), all Owner-ordered hook fixes applied and verified.
One low-likelihood item from the final Codex pass is DEFER (Owner decision, below). **HARDENING = READY.**

## Preflight record
- Slot `pt-wt-worker-a` was clean but **detached at `5ad0a5f`** (one behind `branch-dev`), not at the expected
  `91e5c03`. `91e5c03` (= `branch-dev` = `origin/branch-dev`) is a direct descendant whose only addition is the
  brief-only commit. Task branch `task/auto-mode-hardening` was cut at `91e5c03`. Reported to the Owner earlier.
- Pre-edit `qa:offline`: PASS, 49 spawned suites, 1 advisory (smart quote, `index.html:10363`).
- Phase 2 preflight: branch `task/auto-mode-hardening` @ `91e5c03`, origin/branch-dev `91e5c03`, origin/main `fbec2c1`,
  nothing staged, Node v24.14.0.

## Owner-local / excluded from commit scope
- `.claude/settings.backup.json` — **Owner ruling 2026-09-26:** intentional Owner-created backup of the pre-hardening
  `settings.json`. Owner-local leftover: **must stay out of every commit**; the Worker did not modify or delete it.

## Facts re-confirmed (brief §1) — claude 2.1.283
- Exit 2 blocks with stderr; any other non-zero exit is non-blocking (fail-open); `hookSpecificOutput` shape; stdin
  carries `tool_name`, `tool_input.command` (Bash **and** PowerShell), top-level `cwd`; matcher is a regex.
- `$CLAUDE_PROJECT_DIR` expansion inside the hook `command` on Windows was undocumented; **G4 proves it works** (the
  hook ran and blocked, so node started). No §1 fact was contradicted → no M6.

## Files changed
- Implementation (2, untracked): `.claude/hooks/pretooluse-guard.js`, `qa/auto_mode_hardening_offline.js`
- Owner-applied (tracked, modified): `.claude/settings.json` (+72/−6 vs `91e5c03`; **unchanged by R2 / R2b**)
- Evidence (untracked): `work/auto-mode-hardening/review.md` (brief.md already committed in `91e5c03`)
- Excluded (Owner-local, untracked, NOT to be committed): `.claude/settings.backup.json`

## Hook fixes applied after §5 (Owner-copied Worker-prepared candidates; hashes verified on disk by the Worker)
| Fix | Ruling | Effect | Hook SHA256 |
|---|---|---|---|
| **R2** (Codex initial #1) | Owner 2026-09-26 | any resolved git program (`cls:'git-program'`) via the PowerShell tool is **denied** (reason `git via the PowerShell tool - denied (R2)`); marker ignored for Bash | `2e2c8b14b60d0f5bd84e4bed01b58766fc88c78fb54fe488b178b595fdb13bdb` |
| **R2b** (Codex final #1 alias gap; Worker-confirmed `New-Alias g git.exe; g push` → allow) | Owner 2026-09-26 | in **Worker-slot** sessions the whole PowerShell tool is denied immediately (`tool === 'PowerShell' && isWorkerSlot(input.cwd)`, reason `PowerShell tool - denied in Worker-slot sessions (R2)`). Main/non-slot PowerShell keeps R2 governed behaviour (not blanket-denied); Bash unchanged | `880eaafc2eff2f751ff3cfcada2ef56c4a6d3225de9bfe6a42cf1f96941fc2e2` (current) |
- Cause of R2: hook allowed read-only git through PowerShell and relied on §5 prefix rules, which miss path-form/quoted
  executables. Cause of R2b: static analysis cannot resolve alias/variable/function indirection; removing the PowerShell
  tool from slots removes the whole class instead of chasing forms.
- Each candidate was proven against the previous hook in the scratchpad before the Owner's copy step (differential
  corpus: Bash identical across 8 cwds; non-slot PowerShell identical; CLI exit codes unchanged; 105 checks for R2b).
- `settings.json` needed no change for either fix (PowerShell git deny rules remain as defence in depth; AH-8 exact-§5).

## QA (Phase 2, after R2b)
- Targeted `node qa/auto_mode_hardening_offline.js`: **PASS, 844 assertions** (653 → 769 with R2 → 844 with R2b).
  - R2: AH-6 git rows deny in both cwds; `PS_GIT` (16 forms incl. quoted forward-slash/backslash absolute `git.exe`) with
    R2-not-R1 reason check; Bash controls.
  - R2b: AH-6b — slot PowerShell blanket deny for 11 commands × 4 slot cwd spellings incl. alias/variable/function
    forms, empty command and missing cwd; non-slot PowerShell not blanket-denied (Get-ChildItem allow, git status deny,
    protected write ask); slot Bash unchanged. AH-6 rows that expected slot PowerShell allow were flipped to deny and
    moved to the main cwd for the allow side.
  - Mutants (production-source): marker dropped (probe uses main cwd so the slot blanket deny cannot mask it),
    PowerShell-only filter dropped, **slot blanket deny disabled** (`false && …`), **blanket deny leaks to Bash/non-slot**
    (dropped `tool ===`), **blanket deny widened to every cwd** (dropped `isWorkerSlot`). Dropped the former "reason falls
    back to R1" mutant: the slot + git-program reason branch is now unreachable (dead but harmless code).
  - An earlier class-rename mutant was equivalent (`decisionFor` denies unknown classes by default) and was replaced.
- Full `npm run qa:offline`: **PASS, 50 spawned suites, 14 phases, 1 advisory warning** (pre-existing, unchanged).
- Codex cannot run the suite in its read-only sandbox (`fs.mkdtempSync` → EPERM); sandbox limit, not a defect. All
  Worker runs above are fresh against the current tree.

## Activation gate (brief §6a) — re-run after R2b
| Step | Result |
|---|---|
| G1 | `where node` → `C:\Program Files\nodejs\node.exe`; `node --version` → v24.14.0 |
| G2 | allow (`git status --short --branch`, slot cwd) → exit 0, 0 bytes stdout · ask (`git commit -m x`, main cwd) → exit 0 + `permissionDecision:"ask"` JSON · deny (`git push --force`) → exit 2 + reason on stderr |
| G3 | observed deny exit code = **2** (also slot PowerShell `Get-ChildItem` → exit 2, R2 reason; main PowerShell `Get-ChildItem` → exit 0, empty stdout) |
| G4 | **PASS.** Worker slot, Bash: `git push --dry-run` → `PreToolUse:Bash hook error … BLOCKED - git push - denied in Worker-slot sessions (R1)`, nothing executed (same before and after each patch). PowerShell tool `Get-ChildItem` → `PreToolUse:PowerShell hook error … BLOCKED - PowerShell tool - denied in Worker-slot sessions (R2)`. (Earlier, PowerShell `git status` → R2 git deny.) |
| G5 | Not triggered. |

Not run here (Owner post-LAND checks per brief §6): main-checkout `git push --dry-run` prompts; `npm run qa:offline`
runs without a prompt in a fresh Worker session.

## Codex
Independent read-only reviews (`codex exec --sandbox read-only`, codex-cli 0.157.0), three passes.

| Pass | Finding | Disposition |
|---|---|---|
| Initial #1 | R2 bypass: PowerShell absolute-path git forms allowed | **FIXED** (R2) |
| Initial #2 | QA lacked a PowerShell path-form planted negative | **FIXED** (PS_GIT + mutants) |
| Initial #3 | review.md stale | **FIXED** |
| Final #1 | PowerShell aliases (`Set-Alias g git; g status`; Worker also showed `New-Alias g git.exe; g push` → allow) | **FIXED** (R2b, Owner rejected DEFER) |
| Final #2 | review.md described superseded state | **FIXED** |
| Final-2 #1 | Missing-`cwd` CLI input with `CLAUDE_PROJECT_DIR` pointing at a non-slot checkout: `runCli()` (line ~700) passes the env fallback to `decide()`, so slot-only rules (incl. the R2b PowerShell blanket deny, and R1 for Bash push) apply as non-slot; direct `decide()` with no cwd is strict (slot) | **DEFER (Owner decision).** Valid inconsistency but pre-existing Phase-1 design (cwd fallback to the session's project dir, applied equally to R1/Bash), not touched by R2/R2b, and Claude Code always sends `cwd`; when cwd is absent `CLAUDE_PROJECT_DIR` is the session's own root, so a slot session resolves to the slot. Not exploitable through the documented hook contract. Closing it needs another hook edit (DENY-tier). Option: in `runCli`, pass no fallback (treat missing cwd as slot / fail closed). |

Codex also confirmed for R2b: forward-slash, backslash, case, trailing-slash and POSIX slot spellings all deny; a
near-match directory name does not; Bash and non-slot PowerShell keep governed behaviour; early return precedes parsing;
the three blanket-deny mutants each test a distinct regression; settings match §5; no scope expansion.

## Known deferred gaps in the guard (not in brief §4 → not classified)
- **CLI missing-`cwd` fallback to `CLAUDE_PROJECT_DIR`** (Final-2 #1) — DEFER, Owner decision.
- Bash-side dynamic construction (`'gi'+'t'`, `$GIT push`, `bash -c "$CMD"`, alias/variable indirection inside Bash) cannot
  be resolved statically. (PowerShell indirection is now closed for Worker slots by R2b.)
- `git pull`, `git branch -f main …`, `git checkout -- <protected file>`, `rm`/`Remove-Item`/`dd of=` of a protected file
  are allowed by the hook.
- Main/non-slot PowerShell is still subject to the static limits (aliases/variables) — governed by ask/deny rules and
  Owner approval; the blanket deny is Worker-slot only by ruling.
- The static AH-8 check requires `settings.json` to equal baseline + §5 **exactly**; any later legitimate settings edit
  must update the suite's literals.
- AGENTS.md tier table is stale for `.claude/hooks/**` and `package*.json` (brief §7 follow-up).
- Consequence of R2b: Worker-slot sessions can no longer use the PowerShell tool at all (Git and QA run via Bash).

## Owner decisions / actions still open
1. Accept the missing-cwd CLI fallback as DEFER, or order another hook patch.
2. `settings.local.json` cleanup in main checkout, worker-a, worker-b — remove only `Bash(npm run *)`,
   `Bash(node -e ' *)`, `Bash(python3 -c ' *)` (worker-a reportedly has none). Not confirmed to the Worker.
3. Post-LAND live checks (above). Keep `.claude/settings.backup.json` out of the commit.

## Lessons
- A hook that defers read-only git to settings prefix rules is only as strong as those rules; path-form and quoted
  executables defeat them. Prefer the hook denying the whole class over rule patterns.
- Static analysis of a shell language has an open tail (aliases, variables, functions). When a tool cannot be made safe
  statically, remove the tool for the risky audience (R2b) rather than chase forms.
- A Worker cannot fix a hook defect after §5 lands (DENY tier). Run Codex before the Owner applies §5, and let the Worker
  prepare/prove a patch candidate in the scratchpad so the Owner's fix is a single hash-checked copy.
- A class-rename mutant can be equivalent when the decision table has a default; mutate the emitting statement, and put
  the probe in a context a broader rule cannot mask (main cwd vs the slot blanket deny).
- Quote-heavy shell one-liners get fail-closed by the hook itself; author test files with the file tools instead.

## Final check
Branch `task/auto-mode-hardening` @ `91e5c03`; nothing staged; no commit, push, LAND, deploy or `main` change made.
